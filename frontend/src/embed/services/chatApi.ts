import type {
  ArtifactAuthor,
  ArtifactDetailContext,
  ArtifactExhibitionContext,
  ArtifactSetContext,
  ChatArtifactImage,
  ChatArtifactResult,
  ChatImageMatch,
  ChatLanguage,
  ChatNavigationTarget,
  ChatUploadKind,
  RelatedArtifact,
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
  resultsPage?: number
  resultsPageSize?: number
  onStatus?: (message: string) => void
}

interface RegenerateChatMessageRequest extends ChatApiRequest {
  conversationId: string
  onStatus?: (message: string) => void
}

interface FetchChatResultsPageRequest extends ChatApiRequest {
  conversationId: string
  resultsPage: number
  resultsPageSize?: number
  resultsRequestId?: string | null
}

export interface SendChatMessageResult {
  reply: string
  responseFormat: 'text' | 'json_object'
  replyJson?: Record<string, unknown> | unknown[] | null
  conversationId?: string
  imageMatches?: ChatImageMatch[]
  artifactResults?: ChatArtifactResult[]
  navigationTargets?: ChatNavigationTarget[]
  resultsPage: number
  resultsPageSize: number
  resultsTotal: number
  resultsHasMore: boolean
  resultsRequestId?: string | null
  error?: string
}

export interface ChatResultsPageResult {
  conversationId?: string
  reply?: string
  imageMatches?: ChatImageMatch[]
  artifactResults?: ChatArtifactResult[]
  navigationTargets?: ChatNavigationTarget[]
  resultsPage: number
  resultsPageSize: number
  resultsTotal: number
  resultsHasMore: boolean
  resultsRequestId?: string | null
  error?: string
}

interface RawChatPayload {
  conversation_id?: string
  reply?: string
  response_format?: { type?: 'text' | 'json_object' }
  reply_json?: Record<string, unknown> | unknown[] | null
  image_matches?: Array<{
    original_image_name?: string
    artifact_id?: string
    score?: number
    title?: string
    inventory?: string
    artifact?: RawArtifactResult
    navigation_target?: RawNavigationTarget
  }>
  artifact_results?: RawArtifactResult[]
  navigation_targets?: RawNavigationTarget[]
  results_page?: number
  results_page_size?: number
  results_total?: number
  results_has_more?: boolean
  results_request_id?: string | null
}

interface RawArtifactResult {
  artifact_id?: string
  tipo_inventario?: string
  inventory_number?: string
  title?: string
  museum_id?: string
  museum?: string
  category?: string
  super_category?: string
  creator?: string
  creators?: string[]
  creator_ids?: string[]
  date_or_period?: string
  date_year_start?: number
  date_year_end?: number
  support_or_material?: string
  technique?: string
  origin_history?: string
  historical_origin?: string
  incorporation?: string
  production_center?: string
  description?: string
  search_text?: string
  detail_type?: string
  detail_url?: string
  in_tour?: boolean
  sets?: string[]
  set_ids?: string[]
  set_numbers?: string[]
  exhibitions?: string[]
  exhibition_ids?: string[]
  exhibition_types?: string[]
  exhibition_count?: number
  bibliography?: string
  bibliography_count?: number
  image_count?: number
  images?: RawArtifactImage[]
}

interface RawArtifactImage {
  original_image_name?: string
  image_id?: string
  image_order?: number
  local_path?: string
  source_url?: string
  caption?: string
  alt_text?: string
}

interface RawNavigationTarget {
  overlay_id?: string
  panorama_key?: string
  inventory_id?: string
  location?: string
  title?: string
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

function normalizeNavigationTargetEntry(target: RawNavigationTarget | undefined): ChatNavigationTarget | null {
  if (!target) {
    return null
  }
  const overlayId = String(target.overlay_id || '').trim()
  const panoramaKey = String(target.panorama_key || '').trim()
  const inventoryId = String(target.inventory_id || '').trim()
  if (!overlayId || !panoramaKey || !inventoryId) {
    return null
  }
  return {
    overlayId,
    panoramaKey,
    inventoryId,
    location: typeof target.location === 'string' ? target.location : undefined,
    title: typeof target.title === 'string' ? target.title : undefined,
  }
}

function normalizeArtifactImages(rawImages: RawArtifactImage[] | undefined): ChatArtifactImage[] {
  if (!Array.isArray(rawImages)) {
    return []
  }
  return rawImages
    .map((image): ChatArtifactImage | null => {
      const originalImageName = String(image.original_image_name || '').trim() || undefined
      const imageId = String(image.image_id || '').trim() || undefined
      const imageOrder =
        typeof image.image_order === 'number' && Number.isFinite(image.image_order)
          ? Math.trunc(image.image_order)
          : undefined
      const localPath = String(image.local_path || '').trim() || undefined
      const sourceUrl = String(image.source_url || '').trim() || undefined
      const caption = String(image.caption || '').trim() || undefined
      const altText = String(image.alt_text || '').trim() || undefined
      if (!originalImageName && !imageId && !localPath && !sourceUrl) {
        return null
      }
      return {
        originalImageName,
        imageId,
        imageOrder,
        localPath,
        sourceUrl,
        caption,
        altText,
      }
    })
    .filter((image): image is ChatArtifactImage => image !== null)
}

function normalizeArtifactResultEntry(entry: RawArtifactResult | undefined): ChatArtifactResult | null {
  if (!entry) {
    return null
  }
  const artifactId = String(entry.artifact_id || '').trim()
  if (!artifactId) {
    return null
  }

  const images = normalizeArtifactImages(entry.images)

  const stringArray = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter((v) => v.length > 0)
  }
  const creators = stringArray(entry.creators)
  const legacyCreator = String(entry.creator || '').trim()
  if (creators.length === 0 && legacyCreator) {
    creators.push(legacyCreator)
  }
  const intOrUndef = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined

  return {
    artifactId,
    tipoInventario: String(entry.tipo_inventario || '').trim() || undefined,
    inventoryNumber: String(entry.inventory_number || '').trim() || undefined,
    title: String(entry.title || '').trim() || undefined,
    museumId: String(entry.museum_id || '').trim() || undefined,
    museum: String(entry.museum || '').trim() || undefined,
    category: String(entry.category || '').trim() || undefined,
    superCategory: String(entry.super_category || '').trim() || undefined,
    creator: legacyCreator || creators[0] || undefined,
    creators,
    creatorIds: stringArray(entry.creator_ids),
    dateOrPeriod: String(entry.date_or_period || '').trim() || undefined,
    dateYearStart: intOrUndef(entry.date_year_start),
    dateYearEnd: intOrUndef(entry.date_year_end),
    supportOrMaterial: String(entry.support_or_material || '').trim() || undefined,
    technique: String(entry.technique || '').trim() || undefined,
    originHistory: String(entry.origin_history || entry.historical_origin || '').trim() || undefined,
    incorporation: String(entry.incorporation || '').trim() || undefined,
    productionCenter: String(entry.production_center || '').trim() || undefined,
    description: String(entry.description || '').trim() || undefined,
    searchText: String(entry.search_text || '').trim() || undefined,
    detailType: String(entry.detail_type || '').trim() || undefined,
    detailUrl: String(entry.detail_url || '').trim() || undefined,
    inTour: Boolean(entry.in_tour),
    sets: stringArray(entry.sets),
    setIds: stringArray(entry.set_ids),
    setNumbers: stringArray(entry.set_numbers),
    exhibitions: stringArray(entry.exhibitions),
    exhibitionIds: stringArray(entry.exhibition_ids),
    exhibitionTypes: stringArray(entry.exhibition_types),
    exhibitionCount: intOrUndef(entry.exhibition_count),
    bibliography: String(entry.bibliography || '').trim() || undefined,
    bibliographyCount: intOrUndef(entry.bibliography_count),
    imageCount: typeof entry.image_count === 'number' ? entry.image_count : undefined,
    images,
  }
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
      artifactId: typeof match.artifact_id === 'string' ? match.artifact_id : undefined,
      score: typeof match.score === 'number' ? match.score : undefined,
      title: typeof match.title === 'string' ? match.title : undefined,
      inventory: typeof match.inventory === 'string' ? match.inventory : undefined,
      artifact: normalizeArtifactResultEntry(match.artifact) ?? undefined,
      navigationTarget: normalizeNavigationTargetEntry(match.navigation_target) ?? undefined,
    })
  }
  return imageMatches
}

function normalizeNavigationTargets(payload: RawChatPayload): ChatNavigationTarget[] {
  const navigationTargets: ChatNavigationTarget[] = []
  for (const target of payload.navigation_targets ?? []) {
    const normalized = normalizeNavigationTargetEntry(target)
    if (!normalized) {
      continue
    }
    navigationTargets.push(normalized)
  }
  return navigationTargets
}

function normalizeArtifactResults(payload: RawChatPayload): ChatArtifactResult[] {
  const artifactResults: ChatArtifactResult[] = []
  for (const entry of payload.artifact_results ?? []) {
    const normalized = normalizeArtifactResultEntry(entry)
    if (!normalized) {
      continue
    }
    artifactResults.push(normalized)
  }
  return artifactResults
}

function normalizeResultsMeta(
  payload: RawChatPayload,
  fallbackTotal: number,
): Pick<
  SendChatMessageResult,
  'resultsPage' | 'resultsPageSize' | 'resultsTotal' | 'resultsHasMore' | 'resultsRequestId'
> {
  const resultsPage =
    typeof payload.results_page === 'number' && Number.isFinite(payload.results_page)
      ? Math.max(1, Math.trunc(payload.results_page))
      : 1
  const resultsPageSize =
    typeof payload.results_page_size === 'number' && Number.isFinite(payload.results_page_size)
      ? Math.max(0, Math.trunc(payload.results_page_size))
      : 0
  const resultsTotal =
    typeof payload.results_total === 'number' && Number.isFinite(payload.results_total)
      ? Math.max(0, Math.trunc(payload.results_total))
      : Math.max(0, fallbackTotal)
  const resultsHasMore = Boolean(payload.results_has_more)
  const resultsRequestId =
    typeof payload.results_request_id === 'string' && payload.results_request_id.trim()
      ? payload.results_request_id.trim()
      : null
  return {
    resultsPage,
    resultsPageSize,
    resultsTotal,
    resultsHasMore,
    resultsRequestId,
  }
}

function emptyResultsMeta(): Pick<
  SendChatMessageResult,
  'resultsPage' | 'resultsPageSize' | 'resultsTotal' | 'resultsHasMore' | 'resultsRequestId'
> {
  return {
    resultsPage: 1,
    resultsPageSize: 0,
    resultsTotal: 0,
    resultsHasMore: false,
    resultsRequestId: null,
  }
}

function buildResultFromPayload(
  payload: RawChatPayload,
  language: ChatLanguage,
): SendChatMessageResult {
  const imageMatches = normalizeImageMatches(payload)
  const artifactResults = normalizeArtifactResults(payload)
  const navigationTargets = normalizeNavigationTargets(payload)
  const meta = normalizeResultsMeta(
    payload,
    Math.max(artifactResults.length, imageMatches.length),
  )
  if (!payload.reply) {
    return {
      reply: '',
      responseFormat: payload.response_format?.type ?? 'text',
      replyJson: payload.reply_json ?? null,
      conversationId: payload.conversation_id,
      imageMatches,
      artifactResults,
      navigationTargets,
      ...meta,
      error: t(language, 'chatApi.emptyReply'),
    }
  }

  return {
    reply: payload.reply,
    responseFormat: payload.response_format?.type ?? 'text',
    replyJson: payload.reply_json ?? null,
    conversationId: payload.conversation_id,
    imageMatches,
    artifactResults,
    navigationTargets,
    ...meta,
  }
}

function buildResultsPageFromPayload(payload: RawChatPayload): ChatResultsPageResult {
  const imageMatches = normalizeImageMatches(payload)
  const artifactResults = normalizeArtifactResults(payload)
  const navigationTargets = normalizeNavigationTargets(payload)
  const meta = normalizeResultsMeta(
    payload,
    Math.max(artifactResults.length, imageMatches.length),
  )
  return {
    conversationId: payload.conversation_id,
    reply: typeof payload.reply === 'string' ? payload.reply.trim() || undefined : undefined,
    imageMatches,
    artifactResults,
    navigationTargets,
    ...meta,
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
      ...emptyResultsMeta(),
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
      ...emptyResultsMeta(),
      error: streamError,
    }
  }

  if (!finalPayload) {
    return {
      reply: '',
      responseFormat: 'text',
      replyJson: null,
      ...emptyResultsMeta(),
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
      ...emptyResultsMeta(),
      error: t(language, 'chatApi.backendNotConfigured'),
    }
  }

  const useStreaming = typeof request.onStatus === 'function'
  const resultsPage =
    typeof request.resultsPage === 'number' && Number.isFinite(request.resultsPage)
      ? Math.max(1, Math.trunc(request.resultsPage))
      : undefined
  const resultsPageSize =
    typeof request.resultsPageSize === 'number' && Number.isFinite(request.resultsPageSize)
      ? Math.max(1, Math.min(50, Math.trunc(request.resultsPageSize)))
      : undefined

  try {
    let response: Response
    if (request.uploadFile && request.uploadKind === 'image') {
      const form = new FormData()
      form.set('museum_slug', request.museumSlug)
      if (request.museumId) {
        form.set('museum_id', request.museumId)
      }
      if (request.museumName) {
        form.set('museum_name', request.museumName)
      }
      form.set('language', language)
      form.set('message', request.text)
      if (request.conversationId) {
        form.set('conversation_id', request.conversationId)
      }
      if (resultsPage !== undefined) {
        form.set('results_page', String(resultsPage))
      }
      if (resultsPageSize !== undefined) {
        form.set('results_page_size', String(resultsPageSize))
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
      if (request.museumId) {
        form.set('museum_id', request.museumId)
      }
      if (request.museumName) {
        form.set('museum_name', request.museumName)
      }
      form.set('language', language)
      form.set('message', request.text)
      if (request.conversationId) {
        form.set('conversation_id', request.conversationId)
      }
      if (resultsPage !== undefined) {
        form.set('results_page', String(resultsPage))
      }
      if (resultsPageSize !== undefined) {
        form.set('results_page_size', String(resultsPageSize))
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
            museum_id: request.museumId,
            museum_name: request.museumName,
            language,
            message: request.text,
            conversation_id: request.conversationId,
            results_page: resultsPage,
            results_page_size: resultsPageSize,
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
        ...emptyResultsMeta(),
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
      ...emptyResultsMeta(),
      error: t(language, 'chatApi.networkError'),
    }
  }
}

export async function fetchChatResultsPage(
  request: FetchChatResultsPageRequest,
): Promise<ChatResultsPageResult | null> {
  const language = resolveEmbedLanguage(request.language)
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  if (!backendBaseUrl) {
    return {
      conversationId: request.conversationId,
      imageMatches: [],
      artifactResults: [],
      navigationTargets: [],
      ...emptyResultsMeta(),
      error: t(language, 'chatApi.backendNotConfigured'),
    }
  }

  const resultsPage = Math.max(1, Math.trunc(request.resultsPage))
  const resultsPageSize =
    typeof request.resultsPageSize === 'number' && Number.isFinite(request.resultsPageSize)
      ? Math.max(1, Math.min(50, Math.trunc(request.resultsPageSize)))
      : undefined

  try {
    const response = await fetch(`${getChatApiBaseUrl(backendBaseUrl)}/messages/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        museum_slug: request.museumSlug,
        museum_id: request.museumId,
        language,
        conversation_id: request.conversationId,
        results_page: resultsPage,
        results_page_size: resultsPageSize,
        results_request_id: request.resultsRequestId || undefined,
      }),
    })

    if (!response.ok) {
      const message = await parseErrorResponse(response, language)
      return {
        conversationId: request.conversationId,
        imageMatches: [],
        artifactResults: [],
        navigationTargets: [],
        resultsPage,
        resultsPageSize: resultsPageSize ?? 0,
        resultsTotal: 0,
        resultsHasMore: false,
        resultsRequestId: request.resultsRequestId || null,
        error: message,
      }
    }

    const payload = (await response.json()) as RawChatPayload
    return buildResultsPageFromPayload(payload)
  } catch {
    return {
      conversationId: request.conversationId,
      imageMatches: [],
      artifactResults: [],
      navigationTargets: [],
      resultsPage,
      resultsPageSize: resultsPageSize ?? 0,
      resultsTotal: 0,
      resultsHasMore: false,
      resultsRequestId: request.resultsRequestId || null,
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
      ...emptyResultsMeta(),
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
          museum_id: request.museumId,
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
        ...emptyResultsMeta(),
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
      ...emptyResultsMeta(),
      error: t(language, 'chatApi.networkError'),
    }
  }
}

// ----------------------------------------------------------------------- //
// Detail context (modal): autores + conjuntos + exposicoes + relacionados.
// ----------------------------------------------------------------------- //

interface RawAuthorEntity {
  entity_id?: string
  name?: string
  atividade?: string
  data_nascimento?: string
  data_obito?: string
  local_nascimento?: string
  local_obito?: string
  biografia?: string
  biography?: string
  url?: string
  n_objetos?: number
}

interface RawRelatedArtifact {
  artifact_id?: string
  inventory_number?: string
  title?: string
  museum_id?: string
  museum?: string
  category?: string
  creators?: string[]
  date_or_period?: string
  detail_type?: string
  detail_url?: string
  in_tour?: boolean
  image_count?: number
  images?: RawArtifactImage[]
  navigation_target?: RawNavigationTarget
}

interface RawSetContext {
  entity_id?: string
  name?: string
  num_conjunto?: string
  historial?: string
  descricao?: string
  url?: string
  n_objetos?: number
  artifacts?: RawRelatedArtifact[]
  artifacts_returned?: number
}

interface RawExhibitionContext {
  entity_id?: string
  name?: string
  tipo_exposicao?: string
  local?: string
  ano_inicial?: number
  ano_final?: number
  texto?: string
  ficha_tecnica?: string
  url?: string
  n_objetos?: number
  artifacts?: RawRelatedArtifact[]
  artifacts_returned?: number
}

interface RawDetailContextPayload {
  artifact_id?: string
  authors?: RawAuthorEntity[]
  sets?: RawSetContext[]
  exhibitions?: RawExhibitionContext[]
}

function normalizeAuthor(raw: RawAuthorEntity): ArtifactAuthor {
  const biography = String(raw.biografia || raw.biography || '').trim() || undefined
  return {
    entityId: String(raw.entity_id || '').trim(),
    name: String(raw.name || '').trim() || undefined,
    atividade: String(raw.atividade || '').trim() || undefined,
    dataNascimento: String(raw.data_nascimento || '').trim() || undefined,
    dataObito: String(raw.data_obito || '').trim() || undefined,
    localNascimento: String(raw.local_nascimento || '').trim() || undefined,
    localObito: String(raw.local_obito || '').trim() || undefined,
    biografia: biography,
    biography,
    url: String(raw.url || '').trim() || undefined,
    nObjetos: typeof raw.n_objetos === 'number' ? raw.n_objetos : undefined,
  }
}

function normalizeRelatedArtifact(raw: RawRelatedArtifact): RelatedArtifact | null {
  const artifactId = String(raw.artifact_id || '').trim()
  if (!artifactId) return null
  const creators = Array.isArray(raw.creators)
    ? raw.creators.map((v) => String(v || '').trim()).filter((v) => v.length > 0)
    : []
  return {
    artifactId,
    inventoryNumber: String(raw.inventory_number || '').trim() || undefined,
    title: String(raw.title || '').trim() || undefined,
    museumId: String(raw.museum_id || '').trim() || undefined,
    museum: String(raw.museum || '').trim() || undefined,
    category: String(raw.category || '').trim() || undefined,
    creators,
    dateOrPeriod: String(raw.date_or_period || '').trim() || undefined,
    detailType: String(raw.detail_type || '').trim() || undefined,
    detailUrl: String(raw.detail_url || '').trim() || undefined,
    inTour: Boolean(raw.in_tour),
    imageCount: typeof raw.image_count === 'number' ? raw.image_count : undefined,
    images: normalizeArtifactImages(raw.images),
    navigationTarget: normalizeNavigationTargetEntry(raw.navigation_target) ?? undefined,
  }
}

function normalizeSetContext(raw: RawSetContext): ArtifactSetContext {
  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .map((entry) => normalizeRelatedArtifact(entry))
        .filter((entry): entry is RelatedArtifact => entry !== null)
    : []
  return {
    entityId: String(raw.entity_id || '').trim(),
    name: String(raw.name || '').trim() || undefined,
    numConjunto: String(raw.num_conjunto || '').trim() || undefined,
    historial: String(raw.historial || '').trim() || undefined,
    descricao: String(raw.descricao || '').trim() || undefined,
    url: String(raw.url || '').trim() || undefined,
    nObjetos: typeof raw.n_objetos === 'number' ? raw.n_objetos : undefined,
    artifacts,
    artifactsReturned:
      typeof raw.artifacts_returned === 'number' ? raw.artifacts_returned : artifacts.length,
  }
}

function normalizeExhibitionContext(raw: RawExhibitionContext): ArtifactExhibitionContext {
  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .map((entry) => normalizeRelatedArtifact(entry))
        .filter((entry): entry is RelatedArtifact => entry !== null)
    : []
  return {
    entityId: String(raw.entity_id || '').trim(),
    name: String(raw.name || '').trim() || undefined,
    tipoExposicao: String(raw.tipo_exposicao || '').trim() || undefined,
    local: String(raw.local || '').trim() || undefined,
    anoInicial: typeof raw.ano_inicial === 'number' ? raw.ano_inicial : undefined,
    anoFinal: typeof raw.ano_final === 'number' ? raw.ano_final : undefined,
    texto: String(raw.texto || '').trim() || undefined,
    fichaTecnica: String(raw.ficha_tecnica || '').trim() || undefined,
    url: String(raw.url || '').trim() || undefined,
    nObjetos: typeof raw.n_objetos === 'number' ? raw.n_objetos : undefined,
    artifacts,
    artifactsReturned:
      typeof raw.artifacts_returned === 'number' ? raw.artifacts_returned : artifacts.length,
  }
}

export interface FetchArtifactDetailContextRequest extends ChatApiRequest {
  artifactId: string
}

export interface FetchArtifactDetailContextResult {
  context?: ArtifactDetailContext
  error?: string
}

export interface FetchRelatedArtifactsPageRequest extends ChatApiRequest {
  artifactId: string
  tipo: 'conjunto' | 'exposicao'
  entityId: string
  offset: number
  limit: number
}

export interface FetchRelatedArtifactsPageResult {
  artifactId: string
  tipo: 'conjunto' | 'exposicao'
  entityId: string
  artifacts: RelatedArtifact[]
  artifactsOffset: number
  artifactsLimit: number
  artifactsTotal: number
  artifactsHasMore: boolean
  error?: string
}

interface RawRelatedArtifactsPagePayload {
  artifact_id?: string
  tipo?: 'conjunto' | 'exposicao'
  entity_id?: string
  artifacts?: RawRelatedArtifact[]
  artifacts_offset?: number
  artifacts_limit?: number
  artifacts_total?: number
  artifacts_has_more?: boolean
}

export async function fetchArtifactDetailContext(
  request: FetchArtifactDetailContextRequest,
): Promise<FetchArtifactDetailContextResult> {
  const language = resolveEmbedLanguage(request.language)
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  if (!backendBaseUrl) {
    return { error: t(language, 'chatApi.backendNotConfigured') }
  }
  const artifactId = (request.artifactId || '').trim()
  if (!artifactId) {
    return { error: 'artifact_id obrigatorio.' }
  }

  const params = new URLSearchParams({ museum_slug: request.museumSlug })
  if (request.museumId) params.set('museum_id', request.museumId)

  try {
    const response = await fetch(
      `${getChatApiBaseUrl(backendBaseUrl)}/artifacts/${encodeURIComponent(artifactId)}/detail-context?${params}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      return { error: await parseErrorResponse(response, language) }
    }
    const payload = (await response.json()) as RawDetailContextPayload
    const authors = Array.isArray(payload.authors) ? payload.authors.map(normalizeAuthor) : []
    const sets = Array.isArray(payload.sets) ? payload.sets.map(normalizeSetContext) : []
    const exhibitions = Array.isArray(payload.exhibitions)
      ? payload.exhibitions.map(normalizeExhibitionContext)
      : []
    return {
      context: {
        artifactId: String(payload.artifact_id || artifactId).trim(),
        authors,
        sets,
        exhibitions,
      },
    }
  } catch {
    return { error: t(language, 'chatApi.networkError') }
  }
}

export async function fetchRelatedArtifactsPage(
  request: FetchRelatedArtifactsPageRequest,
): Promise<FetchRelatedArtifactsPageResult> {
  const language = resolveEmbedLanguage(request.language)
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  const fallback: FetchRelatedArtifactsPageResult = {
    artifactId: request.artifactId,
    tipo: request.tipo,
    entityId: request.entityId,
    artifacts: [],
    artifactsOffset: Math.max(0, Math.trunc(request.offset)),
    artifactsLimit: Math.max(1, Math.min(50, Math.trunc(request.limit))),
    artifactsTotal: 0,
    artifactsHasMore: false,
  }
  if (!backendBaseUrl) {
    return { ...fallback, error: t(language, 'chatApi.backendNotConfigured') }
  }

  const params = new URLSearchParams({
    artifact_id: request.artifactId,
    tipo: request.tipo,
    entity_id: request.entityId,
    museum_slug: request.museumSlug,
    offset: String(fallback.artifactsOffset),
    limit: String(fallback.artifactsLimit),
  })
  if (request.museumId) params.set('museum_id', request.museumId)

  try {
    const response = await fetch(
      `${getChatApiBaseUrl(backendBaseUrl)}/artifacts/related?${params}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      return { ...fallback, error: await parseErrorResponse(response, language) }
    }
    const payload = (await response.json()) as RawRelatedArtifactsPagePayload
    const artifacts = Array.isArray(payload.artifacts)
      ? payload.artifacts
          .map((entry) => normalizeRelatedArtifact(entry))
          .filter((entry): entry is RelatedArtifact => entry !== null)
      : []
    return {
      artifactId: String(payload.artifact_id || request.artifactId).trim(),
      tipo: payload.tipo === 'exposicao' ? 'exposicao' : 'conjunto',
      entityId: String(payload.entity_id || request.entityId).trim(),
      artifacts,
      artifactsOffset:
        typeof payload.artifacts_offset === 'number'
          ? Math.max(0, Math.trunc(payload.artifacts_offset))
          : fallback.artifactsOffset,
      artifactsLimit:
        typeof payload.artifacts_limit === 'number'
          ? Math.max(1, Math.min(50, Math.trunc(payload.artifacts_limit)))
          : fallback.artifactsLimit,
      artifactsTotal:
        typeof payload.artifacts_total === 'number'
          ? Math.max(0, Math.trunc(payload.artifacts_total))
          : artifacts.length,
      artifactsHasMore: Boolean(payload.artifacts_has_more),
    }
  } catch {
    return { ...fallback, error: t(language, 'chatApi.networkError') }
  }
}

export interface FetchArtifactFullRequest extends ChatApiRequest {
  artifactId: string
}

export interface FetchArtifactFullResult {
  artifact?: ChatArtifactResult
  error?: string
}

export async function fetchArtifactFull(
  request: FetchArtifactFullRequest,
): Promise<FetchArtifactFullResult> {
  const language = resolveEmbedLanguage(request.language)
  const backendBaseUrl = normalizeBackendBaseUrl(request.backendBaseUrl)
  if (!backendBaseUrl) {
    return { error: t(language, 'chatApi.backendNotConfigured') }
  }
  const artifactId = (request.artifactId || '').trim()
  if (!artifactId) {
    return { error: 'artifact_id obrigatorio.' }
  }
  const params = new URLSearchParams({ museum_slug: request.museumSlug })
  if (request.museumId) params.set('museum_id', request.museumId)
  try {
    const response = await fetch(
      `${getChatApiBaseUrl(backendBaseUrl)}/artifacts/${encodeURIComponent(artifactId)}/full?${params}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      return { error: await parseErrorResponse(response, language) }
    }
    const payload = (await response.json()) as RawArtifactResult
    const artifact = normalizeArtifactResultEntry(payload)
    if (!artifact) {
      return { error: t(language, 'chatApi.emptyReply') }
    }
    return { artifact }
  } catch {
    return { error: t(language, 'chatApi.networkError') }
  }
}
