import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode, SyntheticEvent } from 'react'
import { resolveEmbedLanguage, t } from '../i18n'
import { regenerateAssistantMessage, sendChatMessage, warmChatSession } from '../services/chatApi'
import type {
  ChatImageMatch,
  ChatLanguage,
  ChatModelFormat,
  ChatMessage,
  ChatNavigationTarget,
  ChatUploadKind,
} from '../types'
import MessageMarkdown from './MessageMarkdown'

interface TourChatWidgetProps {
  museumName: string
  museumSlug: string
  museumId: string
  backendBaseUrl?: string
  initialLanguage?: ChatLanguage
  onNavigateToTarget?: (target: ChatNavigationTarget) => void
}

const DEFAULT_PANEL_SIZE = { width: 650, height: 800 }
const SUPPORTED_MODEL_EXTENSIONS = new Set(['glb', 'gltf', 'obj'])
const MAX_IMAGE_FILE_SIZE_MB = 40
const MAX_MODEL_FILE_SIZE_MB = 400
const MAX_IMAGE_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024
const MAX_MODEL_FILE_SIZE_BYTES = MAX_MODEL_FILE_SIZE_MB * 1024 * 1024
const LazyModelAttachmentViewer = lazy(() => import('./ModelAttachmentViewer'))

function detectModelFormatFromName(fileName: string): ChatModelFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  if (extension === 'obj') {
    return 'obj'
  }
  if (extension === 'glb' || extension === 'gltf') {
    return 'gltf'
  }
  return null
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeBaseUrl(baseUrl?: string) {
  if (!baseUrl) {
    return null
  }
  return baseUrl.replace(/\/+$/, '')
}

function buildImageAssetUrl(baseUrl: string | null, originalImageName: string) {
  if (!baseUrl || !originalImageName) {
    return null
  }
  return `${baseUrl}/api/v1/chat/images/${encodeURIComponent(originalImageName)}`
}

function buildStarterMessage(): ChatMessage {
  return {
    id: createId(),
    role: 'assistant',
    text: '',
    isCenteredNotice: true,
  }
}

function detectUploadKind(file: File | null): ChatUploadKind | null {
  if (!file) {
    return null
  }
  if (file.type.startsWith('image/')) {
    return 'image'
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (SUPPORTED_MODEL_EXTENSIONS.has(extension)) {
    return 'model'
  }

  return null
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#cbb1ac] bg-white/95 text-[#5a2730] transition-colors hover:bg-white"
    >
      {children}
    </button>
  )
}

function ModelViewerLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-[#d8bfc0] bg-white/80 px-2 text-center text-[11px] font-semibold text-[#5e4750]">
      {label}
    </div>
  )
}

function TourChatWidget({
  museumName,
  museumSlug,
  museumId,
  backendBaseUrl,
  initialLanguage = 'pt',
  onNavigateToTarget,
}: TourChatWidgetProps) {
  const [language, setLanguage] = useState<ChatLanguage>(resolveEmbedLanguage(initialLanguage))
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [selectedUploadKind, setSelectedUploadKind] = useState<ChatUploadKind | null>(null)
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null)
  const [selectedModelPreviewUrl, setSelectedModelPreviewUrl] = useState<string | null>(null)
  const [selectedModelFormat, setSelectedModelFormat] = useState<ChatModelFormat | null>(null)
  const [isDragOverChat, setIsDragOverChat] = useState(false)
  const [uploadUiError, setUploadUiError] = useState<string | null>(null)
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [statusMessages, setStatusMessages] = useState<string[]>([])
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    buildStarterMessage(),
  ])
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const dragCounterRef = useRef(0)
  const normalizedBackendBaseUrl = normalizeBaseUrl(backendBaseUrl)
  const tt = (key: string, params?: Record<string, string | number>) =>
    t(language, `chatWidget.${key}`, params)
  const latestAssistantMessageId = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && !message.isCenteredNotice)?.id

  const stripStarterNotice = (items: ChatMessage[]) =>
    items.filter((item) => !item.isCenteredNotice)

  const createObjectPreviewUrl = (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    objectUrlsRef.current.push(previewUrl)
    return previewUrl
  }

  const clearSelectedUpload = () => {
    setSelectedUploadFile(null)
    setSelectedUploadKind(null)
    setSelectedImagePreviewUrl(null)
    setSelectedModelPreviewUrl(null)
    setSelectedModelFormat(null)
    setUploadUiError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const applySelectedFile = (file: File | null) => {
    if (!file) {
      return false
    }
    const uploadKind = detectUploadKind(file)
    if (!uploadKind) {
      setUploadUiError(tt('unsupportedFormat'))
      return false
    }
    const maxBytes =
      uploadKind === 'model' ? MAX_MODEL_FILE_SIZE_BYTES : MAX_IMAGE_FILE_SIZE_BYTES
    const maxMb = uploadKind === 'model' ? MAX_MODEL_FILE_SIZE_MB : MAX_IMAGE_FILE_SIZE_MB
    if (file.size > maxBytes) {
      const itemLabel = uploadKind === 'model' ? tt('modelLabel') : tt('imageLabel')
      setUploadUiError(tt('tooLarge', { itemLabel, maxMb }))
      return false
    }

    setUploadUiError(null)
    setSelectedUploadFile(file)
    setSelectedUploadKind(uploadKind)
    if (uploadKind === 'image') {
      setSelectedImagePreviewUrl(createObjectPreviewUrl(file))
      setSelectedModelPreviewUrl(null)
      setSelectedModelFormat(null)
    } else {
      setSelectedImagePreviewUrl(null)
      setSelectedModelPreviewUrl(createObjectPreviewUrl(file))
      setSelectedModelFormat(detectModelFormatFromName(file.name))
    }
    return true
  }

  const resetConversation = () => {
    setConversationId(null)
    setDraft('')
    setIsSending(false)
    setCopiedMessageId(null)
    clearSelectedUpload()
    setIsAssistantLoading(false)
    setStatusMessages([])
    setMessages([buildStarterMessage()])
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    void warmChatSession({ backendBaseUrl, museumSlug })
  }, [backendBaseUrl, museumSlug])

  useEffect(() => {
    setLanguage(resolveEmbedLanguage(initialLanguage))
  }, [initialLanguage])

  useEffect(() => {
    return () => {
      for (const objectUrl of objectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl)
      }
      objectUrlsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!lightboxImage) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxImage(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [lightboxImage])

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = draft.trim()
    const hasUpload = Boolean(selectedUploadFile && selectedUploadKind)
    if ((!text && !hasUpload) || isSending) {
      return
    }
    const submittedText =
      text ||
      (selectedUploadKind === 'model' ? tt('defaultModelQuery') : tt('defaultImageQuery'))
    const selectedUploadFileSnapshot = selectedUploadFile
    const selectedUploadKindSnapshot = selectedUploadKind
    const selectedImagePreviewUrlSnapshot = selectedImagePreviewUrl
    const selectedModelPreviewUrlSnapshot = selectedModelPreviewUrl
    const selectedModelFormatSnapshot = selectedModelFormat

    const userMessageId = createId()
    setMessages((previous) => [
      ...stripStarterNotice(previous),
      {
        id: userMessageId,
        role: 'user',
        text: submittedText,
        uploadedAssetKind: selectedUploadKindSnapshot ?? undefined,
        uploadedAssetName: selectedUploadFileSnapshot?.name,
        uploadedImageUrl:
          selectedUploadKindSnapshot === 'image' ? selectedImagePreviewUrlSnapshot ?? undefined : undefined,
        uploadedModelUrl:
          selectedUploadKindSnapshot === 'model' ? selectedModelPreviewUrlSnapshot ?? undefined : undefined,
        uploadedModelFormat:
          selectedUploadKindSnapshot === 'model' ? selectedModelFormatSnapshot ?? undefined : undefined,
      },
    ])
    setDraft('')
    setIsSending(true)
    setIsAssistantLoading(true)
    setStatusMessages([tt('preparingRequest')])
    clearSelectedUpload()

    const chatResponse = await sendChatMessage({
      backendBaseUrl,
      museumSlug,
      museumId,
      museumName,
      language,
      text: submittedText,
      conversationId: conversationId ?? undefined,
      uploadFile: selectedUploadFileSnapshot,
      uploadKind: selectedUploadKindSnapshot,
      onStatus: (message) => {
        const normalized = message.trim()
        if (!normalized) {
          return
        }
        setStatusMessages((previous) => {
          if (previous[previous.length - 1] === normalized) {
            return previous
          }
          return [...previous, normalized].slice(-6)
        })
      },
    })

    if (chatResponse?.conversationId) {
      setConversationId(chatResponse.conversationId)
    }

    if (chatResponse?.reply) {
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: chatResponse.reply,
          imageMatches: chatResponse.imageMatches,
          navigationTargets: chatResponse.navigationTargets,
        },
      ])
    } else if (chatResponse?.error) {
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: `${tt('errorPrefix')}: ${chatResponse.error}`,
          imageMatches: chatResponse.imageMatches,
        },
      ])
    } else {
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: tt('backendNoReply'),
        },
      ])
    }

    setIsAssistantLoading(false)
    setStatusMessages([])
    setIsSending(false)
  }

  const handleCopyMessage = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1200)
    } catch {
      // noop for demo
    }
  }

  const handleReloadSystemMessage = async (messageId: string) => {
    if (isSending || !conversationId) {
      return
    }

    setIsSending(true)
    setIsAssistantLoading(true)
    setStatusMessages([tt('preparingRegeneration')])

    const chatResponse = await regenerateAssistantMessage({
      backendBaseUrl,
      museumSlug,
      museumId,
      museumName,
      language,
      conversationId,
      onStatus: (message) => {
        const normalized = message.trim()
        if (!normalized) {
          return
        }
        setStatusMessages((previous) => {
          if (previous[previous.length - 1] === normalized) {
            return previous
          }
          return [...previous, normalized].slice(-6)
        })
      },
    })

    if (chatResponse?.conversationId) {
      setConversationId(chatResponse.conversationId)
    }

    if (chatResponse?.reply) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: chatResponse.reply,
                imageMatches: chatResponse.imageMatches,
                navigationTargets: chatResponse.navigationTargets,
              }
            : message,
        ),
      )
    } else if (chatResponse?.error) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: `${tt('errorPrefix')}: ${chatResponse.error}`,
                navigationTargets: [],
              }
            : message,
        ),
      )
    }

    setIsAssistantLoading(false)
    setStatusMessages([])
    setIsSending(false)
  }

  const handlePickImage = () => {
    setUploadUiError(null)
    fileInputRef.current?.click()
  }

  const handleImageSelected = (event: SyntheticEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null
    void applySelectedFile(file)
  }

  const clearSelectedImage = () => {
    clearSelectedUpload()
  }

  const hasDraggedFiles = (event: ReactDragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer?.types || []).includes('Files')

  const resetDragState = () => {
    dragCounterRef.current = 0
    setIsDragOverChat(false)
  }

  const normalizeLookupKey = (value: string | null | undefined) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const resolveNavigationTargetForImageMatch = (
    match: ChatImageMatch,
    navigationTargets: ChatNavigationTarget[] | undefined,
  ): ChatNavigationTarget | null => {
    if (!navigationTargets || navigationTargets.length === 0) {
      return null
    }

    const inventoryKey = normalizeLookupKey(match.inventory)
    if (inventoryKey) {
      const byInventory = navigationTargets.find(
        (target) => normalizeLookupKey(target.inventoryId) === inventoryKey,
      )
      if (byInventory) {
        return byInventory
      }
    }

    const titleKey = normalizeLookupKey(match.title)
    if (titleKey) {
      const byTitle = navigationTargets.find((target) => normalizeLookupKey(target.title) === titleKey)
      if (byTitle) {
        return byTitle
      }
    }

    return null
  }

  const isNavigationTargetLinkedToImageMatch = (
    target: ChatNavigationTarget,
    imageMatches: ChatImageMatch[] | undefined,
  ) => {
    if (!imageMatches || imageMatches.length === 0) {
      return false
    }

    const targetInventory = normalizeLookupKey(target.inventoryId)
    const targetTitle = normalizeLookupKey(target.title)

    return imageMatches.some((match) => {
      const matchInventory = normalizeLookupKey(match.inventory)
      if (targetInventory && matchInventory && targetInventory === matchInventory) {
        return true
      }

      const matchTitle = normalizeLookupKey(match.title)
      return Boolean(targetTitle && matchTitle && targetTitle === matchTitle)
    })
  }

  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    dragCounterRef.current += 1
    setIsDragOverChat(true)
    setUploadUiError(null)
  }

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragOverChat(true)
  }

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsDragOverChat(false)
    }
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    resetDragState()
    const files = Array.from(event.dataTransfer.files || [])
    if (files.length === 0) {
      return
    }

    const preferredFile = files.find((item) => detectUploadKind(item)) || files[0]
    void applySelectedFile(preferredFile)
  }

  const renderImageMatches = (
    imageMatches: ChatImageMatch[] | undefined,
    navigationTargets: ChatNavigationTarget[] | undefined,
  ) => {
    if (!imageMatches || imageMatches.length === 0) {
      return null
    }

    return (
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {imageMatches.map((match, index) => {
          const imageUrl = buildImageAssetUrl(normalizedBackendBaseUrl, match.originalImageName)
          const linkedTarget = resolveNavigationTargetForImageMatch(match, navigationTargets)
          return (
            <article
              key={`${match.originalImageName}-${index}`}
              className="overflow-hidden rounded-xl border border-[#d9c0bc] bg-white/80"
            >
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxImage({
                      src: imageUrl,
                      alt:
                        match.title ||
                        match.inventory ||
                        `${tt('imageLabel')} ${index + 1}`,
                    })
                  }
                  className="block w-full cursor-zoom-in"
                >
                  <img
                    src={imageUrl}
                    alt={match.title || match.inventory || `${tt('imageLabel')} ${index + 1}`}
                    className="h-24 w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ) : null}
              <div className="space-y-1 px-2 py-1.5">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5a2730]">
                  {match.inventory || match.title || tt('visualResult')}
                </p>
                {match.title ? <p className="truncate text-xs text-[#341d22]">{match.title}</p> : null}
                <p className="truncate text-[11px] text-[#6e5a5f]">{match.originalImageName}</p>
                {linkedTarget ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToTarget?.(linkedTarget)}
                    disabled={!onNavigateToTarget}
                  className="mt-1 inline-flex w-full items-center justify-center rounded-md border border-[#cfb3ad] bg-[rgba(250,244,242,0.95)] px-2 py-1 text-[11px] font-semibold text-[#6d0b1b] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {tt('viewInTour')}
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  const renderNavigationTargets = (
    navigationTargets: ChatNavigationTarget[] | undefined,
    imageMatches: ChatImageMatch[] | undefined,
  ) => {
    if (!navigationTargets || navigationTargets.length === 0) {
      return null
    }

    const targetsToRender =
      imageMatches && imageMatches.length > 0
        ? navigationTargets.filter(
            (target) => !isNavigationTargetLinkedToImageMatch(target, imageMatches),
          )
        : navigationTargets

    if (targetsToRender.length === 0) {
      return null
    }

    return (
      <div className="mt-2 rounded-xl border border-[#dfcbc6] bg-white/75 p-2.5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6d0b1b]">
          {tt('tourObjects')}
        </p>
        <div className="space-y-1.5">
          {targetsToRender.map((target, index) => (
            <button
              key={`${target.overlayId}-${target.panoramaKey}-${index}`}
              type="button"
              onClick={() => onNavigateToTarget?.(target)}
              disabled={!onNavigateToTarget}
              className="flex w-full items-center justify-between rounded-lg border border-[#cfb3ad] bg-[rgba(250,244,242,0.95)] px-2.5 py-1.5 text-left text-xs text-[#3c1d24] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="min-w-0 pr-2">
                <span className="block truncate font-semibold">
                  {target.inventoryId}
                  {target.title ? ` - ${target.title}` : ''}
                </span>
                {target.location ? (
                  <span className="block truncate text-[11px] text-[#7e6669]">{target.location}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-[#6d0b1b]">{tt('viewInTour')}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 left-4 z-[600] inline-flex items-center gap-2 rounded-2xl border border-white/35 bg-[#3f0d18b8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_40px_-22px_rgba(63,13,24,1)] transition-colors hover:bg-[#4f0814cc]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M8 10h8M8 14h5M6.6 19.4L4 21l.8-2.8a8 8 0 118.2 1.8"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {tt('assistant')}
      </button>
    )
  }

  return (
    <div
      className="absolute bottom-4 left-4 z-[600] flex flex-col overflow-hidden rounded-2xl border border-[#dac3be] bg-[rgba(250,245,242,0.95)] shadow-[0_18px_45px_-28px_rgba(35,14,20,1)] backdrop-blur-[1px]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: `${DEFAULT_PANEL_SIZE.width}px`,
        height: `${DEFAULT_PANEL_SIZE.height}px`,
        maxWidth: 'calc(100% - 1.5rem)',
        maxHeight: 'calc(100% - 1.5rem)',
      }}
    >
      <div className="flex items-start justify-between border-b border-[#d7beb8] bg-[rgba(252,246,244,0.95)] px-3 py-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#57222c]">
            {tt('assistant')}
          </p>
          <p className="text-sm font-semibold text-[#1f1215]">{museumName}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-[#ccb1ab] bg-white/90">
            {(['pt', 'en'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLanguage(option)}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  language === option
                    ? 'bg-[#6d0b1b] text-white'
                    : 'text-[#5a2730] hover:bg-white'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetConversation}
            className="rounded-lg border border-[#ccb1ab] bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#5a2730] transition-colors hover:bg-white"
          >
            {tt('newConversation')}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg border border-[#ccb1ab] bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#5a2730] transition-colors hover:bg-white"
          >
            {tt('close')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        <div className="space-y-2.5">
          {messages.map((message) =>
            message.isCenteredNotice ? (
              <div key={message.id} className="flex min-h-[44vh] items-center justify-center px-4">
                <div className="max-w-[460px] rounded-2xl border border-[#dec9c4] bg-white/70 px-6 py-5 text-center shadow-[0_20px_40px_-30px_rgba(40,14,20,0.75)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a4b54]">
                    {tt('welcome')}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-[#341d22]">{tt('welcomeTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5f4b50]">{tt('welcomeDescription')}</p>
                </div>
              </div>
            ) : message.role === 'assistant' ? (
              <article key={message.id} className="mr-auto max-w-[94%] px-2 py-1 text-[#341d22]">
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#6d0b1b]/12 text-[#6d0b1b]">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M10 2.5l1.8 4.2 4.2 1.8-4.2 1.8L10 14.5l-1.8-4.2L4 8.5l4.2-1.8L10 2.5z" />
                    </svg>
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6d0b1b]">
                    {tt('assistantBadge')}
                  </span>
                </div>
                <div className="space-y-2">
                  <MessageMarkdown messageId={message.id} text={message.text} />
                  {renderImageMatches(message.imageMatches, message.navigationTargets)}
                  {renderNavigationTargets(message.navigationTargets, message.imageMatches)}
                </div>
                <div className="-ml-2 mt-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleReloadSystemMessage(message.id)}
                    disabled={isSending || !conversationId || message.id !== latestAssistantMessageId}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-[#6d0b1b] transition-colors hover:bg-[rgba(250,245,242,1)] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={tt('refreshSystemMessageAria')}
                    title={tt('refreshMessageTitle')}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path
                        d="M20 5v5h-5M4 19v-5h5M6.5 9A7 7 0 0118 8m-12 8a7 7 0 0011.5 1"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyMessage(message.id, message.text)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-[#6d0b1b] transition-colors hover:bg-[rgba(250,245,242,1)] hover:shadow-sm"
                    aria-label={tt('copySystemMessageAria')}
                    title={copiedMessageId === message.id ? tt('copied') : tt('copyMessage')}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path
                        d="M9 9h10v10H9zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </article>
            ) : (
              <div
                key={message.id}
                className="ml-auto w-fit max-w-[88%] rounded-2xl bg-[rgba(223,208,201,0.96)] px-3 py-2.5 text-md leading-relaxed text-[#2f1f22] shadow-sm"
              >
                <p>{message.text}</p>
                {message.uploadedImageUrl ? (
                  <figure className="mt-2 overflow-hidden rounded-lg border border-[#d8bfc0] bg-white/70">
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({
                          src: message.uploadedImageUrl!,
                          alt: message.uploadedAssetName || tt('uploadedImageAlt'),
                        })
                      }
                      className="block w-full cursor-zoom-in"
                    >
                      <img
                        src={message.uploadedImageUrl}
                        alt={message.uploadedAssetName || tt('uploadedImageAlt')}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  </figure>
                ) : null}
                {message.uploadedAssetKind === 'model' ? (
                  <div className="mt-2 overflow-hidden rounded-lg border border-[#d8bfc0] bg-white/70">
                    {message.uploadedModelUrl ? (
                      <Suspense
                        fallback={
                          <div className="h-48 w-full">
                            <ModelViewerLoadingFallback label={tt('modelViewerLoading')} />
                          </div>
                        }
                      >
                        <LazyModelAttachmentViewer
                          modelUrl={message.uploadedModelUrl}
                          modelName={message.uploadedAssetName}
                          modelFormat={message.uploadedModelFormat}
                          loadingLabel={tt('modelViewerLoading')}
                          errorLabel={tt('modelViewerError')}
                          className="h-48 w-full"
                        />
                      </Suspense>
                    ) : (
                      <div className="flex h-28 items-center gap-2 px-2.5 py-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#6d0b1b]/10 text-[#6d0b1b]">
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
                            <path
                              d="M12 3l7 4-7 4-7-4 7-4zm7 4v8l-7 4-7-4V7m7 4v8"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <p className="text-[11px] font-medium text-[#705c61]">{tt('modelViewerError')}</p>
                      </div>
                    )}
                    <div className="border-t border-[#e1ccca] px-2.5 py-2">
                      <p className="truncate text-xs font-semibold text-[#4a2027]">
                        {message.uploadedAssetName || tt('modelLabel')}
                      </p>
                      <p className="text-[11px] text-[#705c61]">{tt('uploadedModelCaption')}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ),
          )}
          {isAssistantLoading ? (
            <article className="mr-auto max-w-[94%] rounded-xl border border-[#ddc6c2] bg-white/70 px-3 py-2 text-[#341d22]">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#6d0b1b]/25 border-t-[#6d0b1b]" />
                <span className="text-xs font-semibold text-[#5a2730]">
                  {statusMessages[statusMessages.length - 1] || tt('processing')}
                </span>
              </div>
              {statusMessages.length > 1 ? (
                <div className="space-y-1 pl-6">
                  {statusMessages.slice(0, -1).map((status, index) => (
                    <p key={`status-${index}`} className="text-[11px] text-[#6e5a5f]">
                      {status}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#f1dfdb99] p-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.glb,.gltf,.obj"
          className="hidden"
          onChange={handleImageSelected}
        />
        {uploadUiError ? (
          <p className="mb-2 rounded-lg border border-[#d08f93] bg-[#fff0f1] px-2.5 py-1.5 text-[11px] font-medium text-[#8a1f2e]">
            {uploadUiError}
          </p>
        ) : null}
        {!selectedUploadFile ? (
          <div className="mb-2 rounded-xl border border-dashed border-[#ccb2ad] bg-white/50 px-3 py-2 text-[11px] text-[#6f5a5d]">
            {tt('attachDropHint')}
          </div>
        ) : null}
        {selectedUploadFile ? (
          <div className="mb-2.5 rounded-xl border border-[#d6beb8] bg-white/85 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#4a2027]">{selectedUploadFile.name}</p>
                <p className="text-[11px] text-[#705c61]">
                  {selectedUploadKind === 'model'
                    ? tt('modelReady')
                    : tt('imageReady')}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelectedImage}
                className="rounded-md border border-[#ccb1ab] bg-white px-2 py-1 text-[11px] font-semibold text-[#5a2730]"
              >
                {tt('remove')}
              </button>
            </div>
            {selectedUploadKind === 'image' && selectedImagePreviewUrl ? (
              <img
                src={selectedImagePreviewUrl}
                alt={selectedUploadFile.name}
                className="mt-2 h-24 w-full rounded-lg object-cover"
              />
            ) : selectedUploadKind === 'model' && selectedModelPreviewUrl ? (
              <Suspense
                fallback={
                  <div className="mt-2 h-52 w-full overflow-hidden rounded-lg border border-[#d7c0ba]">
                    <ModelViewerLoadingFallback label={tt('modelViewerLoading')} />
                  </div>
                }
              >
                <LazyModelAttachmentViewer
                  modelUrl={selectedModelPreviewUrl}
                  modelName={selectedUploadFile.name}
                  modelFormat={selectedModelFormat ?? undefined}
                  loadingLabel={tt('modelViewerLoading')}
                  errorLabel={tt('modelViewerError')}
                  className="mt-2 h-52 w-full overflow-hidden rounded-lg border border-[#d7c0ba]"
                />
              </Suspense>
            ) : (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#d7c0ba] bg-[rgba(250,245,242,0.92)] px-3 py-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#6d0b1b]/10 text-[#6d0b1b]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                    <path
                      d="M12 3l7 4-7 4-7-4 7-3zm7 4v8l-7 4-7-4V7m7 4v8"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-semibold text-[#4a2027]">{tt('attachmentPreviewTitle')}</p>
                  <p className="text-[11px] text-[#705c61]">{tt('attachmentPreviewDescription')}</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <IconButton label={tt('attachFile')} onClick={handlePickImage}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M8.5 12.5l5.8-5.8a3 3 0 114.2 4.2l-7.3 7.3a5 5 0 11-7.1-7.1l7.8-7.8"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>

          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={tt('inputPlaceholder')}
            className="h-9 flex-1 rounded-xl border border-[#cbb2ad] bg-white/95 px-3 text-sm text-[#2d1b1f] outline-none transition-colors placeholder:text-[#816c6f] focus:border-[#6d0b1b]"
          />

          {/* <IconButton label={tt('microphoneSoon')} onClick={() => {}}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M12 4a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3zm6 7a6 6 0 11-12 0M12 17v3M9 20h6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton> */}

          <button
            type="submit"
            disabled={isSending}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-[#6d0b1b] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#4f0814]"
          >
            {isSending ? tt('sending') : tt('send')}
          </button>
        </div>
      </form>

      {isDragOverChat ? (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-[rgba(18,8,12,0.46)] p-4">
          <div className="w-full max-w-[420px] rounded-2xl border border-white/35 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(252,242,238,0.9))] px-5 py-6 text-center shadow-[0_22px_48px_-24px_rgba(0,0,0,0.8)]">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6d0b1b]/12 text-[#6d0b1b]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                <path
                  d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="mt-3 text-sm font-semibold text-[#2e171c]">{tt('dropToAttach')}</p>
            <p className="mt-1 text-xs text-[#6a585c]">{tt('dropHint')}</p>
          </div>
        </div>
      ) : null}

      {lightboxImage ? (
        <div
          className="absolute inset-0 z-[1200] flex items-center justify-center bg-[rgba(18,8,12,0.78)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tt('lightboxAria')}
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setLightboxImage(null)
            }}
            className="absolute right-4 top-4 rounded-lg border border-white/30 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black/60"
          >
            {tt('close')}
          </button>
          <img
            src={lightboxImage.src}
            alt={lightboxImage.alt}
            className="h-auto max-h-[98%] w-auto max-w-[98%] rounded-xl border border-white/20 bg-black/20 object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}

export default TourChatWidget
