import type {
  ChatImageMatch,
  ChatLanguage,
  ChatNavigationTarget,
  ChatUploadKind,
} from '../types'
import { resolveEmbedLanguage, t } from '../i18n'

interface ChatApiRequest {
  backendBaseUrl?: string
  museumSlug: string
  museumId?: string
  museumName?: string
  language?: ChatLanguage
}

interface SendChatMessageRequest extends ChatApiRequest {
  text: string
  conversationId?: string
  uploadFile?: File | null
  uploadKind?: ChatUploadKind | null
  onStatus?: (message: string) => void
}

interface RegenerateChatMessageRequest extends ChatApiRequest {
  conversationId: string
  onStatus?: (message: string) => void
}

export interface SendChatMessageResult {
  reply: string
  responseFormat: 'text' | 'json_object'
  replyJson?: Record<string, unknown> | unknown[] | null
  conversationId?: string
  imageMatches?: ChatImageMatch[]
  navigationTargets?: ChatNavigationTarget[]
  error?: string
}

interface RawChatPayload {
  conversation_id?: string
  reply?: string
  response_format?: { type?: 'text' | 'json_object' }
  reply_json?: Record<string, unknown> | unknown[] | null
  image_matches?: Array<{
    original_image_name?: string
    score?: number
    title?: string
    inventory?: string
  }>
  navigation_targets?: Array<{
    overlay_id?: string
    panorama_key?: string
    inventory_id?: string
    location?: string
    title?: string
  }>
}

function normalizeBackendBaseUrl(baseUrl?: string) {
  if (!baseUrl) {
    return null
  }

  return baseUrl.replace(/\/+$/, '')
}

function getChatApiBaseUrl(baseUrl: string) {
  return `${baseUrl}/api/v1/chat`
}

function normalizeImageMatches(payload: RawChatPayload): ChatImageMatch[] {
  const imageMatches: ChatImageMatch[] = []
  for (const match of payload.image_matches ?? []) {
    const originalImageName = String(match.original_image_name || '').trim()
    if (!originalImageName) {
      continue
    }

    imageMatches.push({
      originalImageName,
      score: typeof match.score === 'number' ? match.score : undefined,
      title: typeof match.title === 'string' ? match.title : undefined,
      inventory: typeof match.inventory === 'string' ? match.inventory : undefined,
    })
  }
  return imageMatches
}

function normalizeNavigationTargets(payload: RawChatPayload): ChatNavigationTarget[] {
  const navigationTargets: ChatNavigationTarget[] = []
  for (const target of payload.navigation_targets ?? []) {
    const overlayId = String(target.overlay_id || '').trim()
    const panoramaKey = String(target.panorama_key || '').trim()
    const inventoryId = String(target.inventory_id || '').trim()
    if (!overlayId || !panoramaKey || !inventoryId) {
      continue
    }
    navigationTargets.push({
      overlayId,
      panoramaKey,
      inventoryId,
      location: typeof target.location === 'string' ? target.location : undefined,
      title: typeof target.title === 'string' ? target.title : undefined,
    })
  }
  return navigationTargets
}

function buildResultFromPayload(
  payload: RawChatPayload,
  language: ChatLanguage,
): SendChatMessageResult {
  const imageMatches = normalizeImageMatches(payload)
  const navigationTargets = normalizeNavigationTargets(payload)
  if (!payload.reply) {
    return {
      reply: '',
      responseFormat: payload.response_format?.type ?? 'text',
      replyJson: payload.reply_json ?? null,
      conversationId: payload.conversation_id,
      imageMatches,
      navigationTargets,
      error: t(language, 'chatApi.emptyReply'),
    }
  }

  return {
    reply: payload.reply,
    responseFormat: payload.response_format?.type ?? 'text',
    replyJson: payload.reply_json ?? null,
    conversationId: payload.conversation_id,
    imageMatches,
    navigationTargets,
  }
}

async function parseErrorResponse(response: Response, language: ChatLanguage): Promise<string> {
  let message = t(language, 'chatApi.backendFailure', { status: response.status })
  try {
    const data = (await response.json()) as { detail?: string; message?: string }
    message = data.detail || data.message || message
  } catch {
    // ignore parse error
  }
  return message
}

function parseSseEventBlock(rawBlock: string): { eventType: string; payload: Record<string, unknown> } | null {
  const block = rawBlock.trim()
  if (!block) {
    return null
  }

  let eventType = 'status'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim() || eventType
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) {
    return { eventType, payload: {} }
  }

  const dataText = dataLines.join('\n')
  try {
    const parsed = JSON.parse(dataText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { eventType, payload: parsed as Record<string, unknown> }
    }
  } catch {
    // ignore invalid json chunk
  }
  return { eventType, payload: {} }
}

async function readStreamingResult(
  response: Response,
  language: ChatLanguage,
  onStatus?: (message: string) => void,
): Promise<SendChatMessageResult> {
  if (!response.body) {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: t(language, 'chatApi.streamWithoutBody'),
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalPayload: RawChatPayload | null = null
  let streamError: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const rawBlock = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const parsedEvent = parseSseEventBlock(rawBlock)
      if (parsedEvent) {
        const { eventType, payload } = parsedEvent
        if (eventType === 'status') {
          const message = typeof payload.message === 'string' ? payload.message : ''
          if (message && onStatus) {
            onStatus(message)
          }
        } else if (eventType === 'result') {
          const payloadValue = payload.payload
          if (payloadValue && typeof payloadValue === 'object' && !Array.isArray(payloadValue)) {
            finalPayload = payloadValue as RawChatPayload
          }
        } else if (eventType === 'error') {
          streamError =
            (typeof payload.message === 'string' && payload.message) ||
            t(language, 'chatApi.backendStreamError')
        }
      }
      separatorIndex = buffer.indexOf('\n\n')
    }

    if (done) {
      break
    }
  }

  if (streamError) {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: streamError,
    }
  }

  if (!finalPayload) {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: t(language, 'chatApi.streamWithoutResult'),
    }
  }

  return buildResultFromPayload(finalPayload, language)
}

export async function warmChatSession(request: ChatApiRequest) {
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  if (!backendBaseUrl) {
    return
  }

  try {
    await fetch(`${getChatApiBaseUrl(backendBaseUrl)}/health`)
  } catch {
    // silent in demo
  }
}

export async function sendChatMessage(
  request: SendChatMessageRequest,
): Promise<SendChatMessageResult | null> {
  const language = resolveEmbedLanguage(request.language)
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  if (!backendBaseUrl) {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: t(language, 'chatApi.backendNotConfigured'),
    }
  }

  const useStreaming = typeof request.onStatus === 'function'

  try {
    let response: Response
    if (request.uploadFile && request.uploadKind === 'image') {
      const form = new FormData()
      form.set('museum_slug', request.museumSlug)
      form.set('museum_id', request.museumId || request.museumSlug)
      if (request.museumName) {
        form.set('museum_name', request.museumName)
      }
      form.set('language', language)
      form.set('message', request.text)
      if (request.conversationId) {
        form.set('conversation_id', request.conversationId)
      }
      form.set('response_format', 'text')
      form.set('image', request.uploadFile)

      response = await fetch(
        `${getChatApiBaseUrl(backendBaseUrl)}/${useStreaming ? 'messages/image/stream' : 'messages/image'}`,
        {
          method: 'POST',
          body: form,
          headers: useStreaming ? { Accept: 'text/event-stream' } : undefined,
        },
      )
    } else if (request.uploadFile && request.uploadKind === 'model') {
      const form = new FormData()
      form.set('museum_slug', request.museumSlug)
      form.set('museum_id', request.museumId || request.museumSlug)
      if (request.museumName) {
        form.set('museum_name', request.museumName)
      }
      form.set('language', language)
      form.set('message', request.text)
      if (request.conversationId) {
        form.set('conversation_id', request.conversationId)
      }
      form.set('response_format', 'text')
      form.set('model_file', request.uploadFile)

      response = await fetch(
        `${getChatApiBaseUrl(backendBaseUrl)}/${useStreaming ? 'messages/model/stream' : 'messages/model'}`,
        {
          method: 'POST',
          body: form,
          headers: useStreaming ? { Accept: 'text/event-stream' } : undefined,
        },
      )
    } else {
      response = await fetch(
        `${getChatApiBaseUrl(backendBaseUrl)}/${useStreaming ? 'messages/stream' : 'messages'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(useStreaming ? { Accept: 'text/event-stream' } : {}),
          },
          body: JSON.stringify({
            museum_slug: request.museumSlug,
            museum_id: request.museumId || request.museumSlug,
            museum_name: request.museumName,
            language,
            message: request.text,
            conversation_id: request.conversationId,
            response_format: { type: 'text' },
          }),
        },
      )
    }

    if (!response.ok) {
      const message = await parseErrorResponse(response, language)
      return {
        reply: '',
        responseFormat: 'text',
        replyJson: null,
        error: message,
      }
    }

    if (useStreaming) {
      return await readStreamingResult(response, language, request.onStatus)
    }

    const payload = (await response.json()) as RawChatPayload
    return buildResultFromPayload(payload, language)
  } catch {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: t(language, 'chatApi.networkError'),
    }
  }
}

export async function regenerateAssistantMessage(
  request: RegenerateChatMessageRequest,
): Promise<SendChatMessageResult | null> {
  const language = resolveEmbedLanguage(request.language)
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  if (!backendBaseUrl) {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: t(language, 'chatApi.backendNotConfigured'),
    }
  }

  const useStreaming = typeof request.onStatus === 'function'

  try {
    const response = await fetch(
      `${getChatApiBaseUrl(backendBaseUrl)}/${useStreaming ? 'messages/regenerate/stream' : 'messages/regenerate'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useStreaming ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify({
          museum_slug: request.museumSlug,
          museum_id: request.museumId || request.museumSlug,
          museum_name: request.museumName,
          language,
          conversation_id: request.conversationId,
          response_format: { type: 'text' },
        }),
      },
    )

    if (!response.ok) {
      const message = await parseErrorResponse(response, language)
      return {
        reply: '',
        responseFormat: 'text',
        replyJson: null,
        error: message,
      }
    }

    if (useStreaming) {
      return await readStreamingResult(response, language, request.onStatus)
    }

    const payload = (await response.json()) as RawChatPayload
    return buildResultFromPayload(payload, language)
  } catch {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      error: t(language, 'chatApi.networkError'),
    }
  }
}
