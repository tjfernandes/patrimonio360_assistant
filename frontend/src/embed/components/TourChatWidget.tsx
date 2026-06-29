import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ImgHTMLAttributes, ReactNode, SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import amaliaLogoText from '../../assets/amalia_logo_text.png'
import { resolveEmbedLanguage, t } from '../i18n'
import {
  createInteractionSessionId,
  logFrontendEvent,
  type FrontendInteractionEventType,
} from '../services/interactionLogger'
import {
  fetchArtifactDetailContext,
  fetchArtifactFull,
  fetchArtifactFullByInventory,
  fetchChatResultsPage,
  fetchRelatedArtifactsPage,
  regenerateAssistantMessage,
  sendChatMessage,
  warmChatSession,
} from '../services/chatApi'
import type {
  ArtifactDetailContext,
  ArtifactExhibitionContext,
  ChatArtifactImage,
  ChatArtifactResult,
  ChatImageMatch,
  ChatLanguage,
  ChatModelFormat,
  ChatMessage,
  ChatNavigationTarget,
  ChatSearchScope,
  ChatSelectedArtifactContext,
  ChatUploadKind,
  RelatedArtifact,
  TourArtifactModalRequest,
  TourNavigationCommandContext,
} from '../types'
import MessageMarkdown from './MessageMarkdown'

interface TourChatWidgetProps {
  museumName: string
  museumSlug: string
  museumId: string
  backendBaseUrl?: string
  initialLanguage?: ChatLanguage
  sessionId?: string
  participantId?: string | null
  taskId?: string | null
  onNavigateToTarget?: (
    target: ChatNavigationTarget,
    context: TourNavigationCommandContext,
  ) => void
  onAssistantClosed?: () => void
  onOpenChange?: (isOpen: boolean) => void
  externalArtifactModalRequest?: TourArtifactModalRequest | null
}

const DEFAULT_PANEL_SIZE = { width: 900, height: 1050 }
const CHAT_PANEL_CLOSE_ANIMATION_MS = 300
const ARTIFACT_MODAL_CLOSE_ANIMATION_MS = 260
const SUPPORTED_MODEL_EXTENSIONS = new Set(['glb', 'gltf', 'obj'])
const MAX_IMAGE_FILE_SIZE_MB = 40
const MAX_MODEL_FILE_SIZE_MB = 400
const MAX_IMAGE_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024
const MAX_MODEL_FILE_SIZE_BYTES = MAX_MODEL_FILE_SIZE_MB * 1024 * 1024
const RELATED_ARTIFACTS_PAGE_SIZE = 10
const LazyModelAttachmentViewer = lazy(() => import('./ModelAttachmentViewer'))

type RelatedArtifactGroupKind = 'conjunto' | 'exposicao'
type NavigationClickOptions = {
  artifact?: ChatArtifactResult | RelatedArtifact | null
  queryId?: string | null
  source: string
  title?: string | null
  inventoryNumber?: string | null
  artifactId?: string | null
  searchScope?: ChatSearchScope | null
}

type LoadingImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string
  alt: string
  wrapperClassName?: string
}

function LoadingImage({
  src,
  alt,
  wrapperClassName = '',
  className = '',
  onLoad,
  onError,
  ...props
}: LoadingImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const hasDisplayClass = /\b(?:block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden)\b/.test(
    wrapperClassName,
  )

  useEffect(() => {
    setStatus('loading')
  }, [src])

  return (
    <span
      className={`relative ${hasDisplayClass ? '' : 'block'} overflow-hidden bg-[#f8f1ef] ${wrapperClassName}`}
      aria-busy={status === 'loading' ? 'true' : undefined}
    >
      {status === 'loading' ? (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[linear-gradient(110deg,#f8f1ef_0%,#fff9f6_45%,#eadbd8_100%)]">
          <span className="absolute inset-0 animate-pulse bg-white/30" />
          <span className="relative h-7 w-7 rounded-full border-2 border-[#d8c1bc] border-t-[#6d0b1b] animate-spin" />
        </span>
      ) : null}
      {status === 'error' ? (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#f8f1ef] text-[#8b7074]">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
            <path
              d="M4.5 6.5A2 2 0 016.5 4.5h11a2 2 0 012 2v11a2 2 0 01-2 2h-11a2 2 0 01-2-2z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path
              d="M8 14l2.2-2.2 2.1 2.1 1.7-1.7L17 15.2M8.4 8.6h.01"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : null}
      <img
        {...props}
        src={src}
        alt={alt}
        className={`${className} transition-opacity duration-300 ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={(event) => {
          setStatus('loaded')
          onLoad?.(event)
        }}
        onError={(event) => {
          setStatus('error')
          onError?.(event)
        }}
      />
    </span>
  )
}

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
  const normalized = String(originalImageName).trim().replace(/\\/g, '/')
  if (!normalized) {
    return null
  }
  const encodedPath = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  if (!encodedPath) {
    return null
  }
  return `${baseUrl}/api/v1/chat/images/${encodedPath}`
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
      className="inline-flex h-15 w-15 items-center justify-center rounded-4xl border border-[#cbb1ac] bg-white/95 text-[#5a2730] transition-colors hover:bg-white"
    >
      {children}
    </button>
  )
}

function HeaderActionButton({
  children,
  label,
  onClick,
  variant = 'default',
}: {
  children: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[0_12px_24px_-20px_rgba(64,19,28,0.95)] transition-[background-color,border-color,color,transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-22px_rgba(64,19,28,1)] ${
        variant === 'danger'
          ? 'border-[#6d0b1b]/20 bg-[#6d0b1b]/10 text-[#6d0b1b] hover:border-[#6d0b1b] hover:bg-[#6d0b1b] hover:text-white'
          : 'border-[#ccb1ab] bg-white/90 text-[#5a2730] hover:border-[#b8938b] hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}

function CloseIcon({ className = 'h-5.5 w-5.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
  sessionId,
  participantId,
  taskId,
  onNavigateToTarget,
  onAssistantClosed,
  onOpenChange,
  externalArtifactModalRequest,
}: TourChatWidgetProps) {
  const [language, setLanguage] = useState<ChatLanguage>(resolveEmbedLanguage(initialLanguage))
  const [isOpen, setIsOpen] = useState(false)
  const [isChatClosing, setIsChatClosing] = useState(false)
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
  const [selectedArtifactResult, setSelectedArtifactResult] = useState<ChatArtifactResult | null>(null)
  const [selectedArtifactNavigationTarget, setSelectedArtifactNavigationTarget] = useState<ChatNavigationTarget | null>(null)
  const [selectedArtifactQueryId, setSelectedArtifactQueryId] = useState<string | null>(null)
  const [selectedArtifactSearchScope, setSelectedArtifactSearchScope] = useState<ChatSearchScope | null>(null)
  const [focusedArtifact, setFocusedArtifact] = useState<ChatSelectedArtifactContext | null>(null)
  const [selectedArtifactImageIndex, setSelectedArtifactImageIndex] = useState(0)
  const [isArtifactModalClosing, setIsArtifactModalClosing] = useState(false)
  // Contexto relacional do artefacto aberto no modal (autores/conjuntos/exposicoes).
  const [detailContext, setDetailContext] = useState<ArtifactDetailContext | null>(null)
  const [isDetailContextLoading, setIsDetailContextLoading] = useState(false)
  const [detailContextError, setDetailContextError] = useState<string | null>(null)
  const [relatedLoadingKeys, setRelatedLoadingKeys] = useState<Set<string>>(() => new Set())
  const [relatedLoadErrors, setRelatedLoadErrors] = useState<Record<string, string | null>>({})
  const relatedLoadingKeysRef = useRef<Set<string>>(new Set())
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    buildStarterMessage(),
  ])
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messageElementsRef = useRef<Map<string, HTMLElement>>(new Map())
  const activeTurnTopMessageIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const chatCloseTimerRef = useRef<number | null>(null)
  const artifactModalCloseTimerRef = useRef<number | null>(null)
  const externalArtifactModalRequestIdRef = useRef<string | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const dragCounterRef = useRef(0)
  const sessionIdRef = useRef(sessionId || createInteractionSessionId())
  const normalizedBackendBaseUrl = normalizeBaseUrl(backendBaseUrl)
  const tt = (key: string, params?: Record<string, string | number>) =>
    t(language, `chatWidget.${key}`, params)

  useEffect(() => {
    if (sessionId) {
      sessionIdRef.current = sessionId
    }
  }, [sessionId])
  const formatDetailType = (value?: string) => {
    const normalized = String(value || '').trim().toUpperCase()
    if (normalized === 'OBJ' || normalized === 'DOC') {
      return tt(`artifactDetailType.${normalized}`)
    }
    return String(value || '').trim() || undefined
  }
  const latestAssistantMessageId = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && !message.isCenteredNotice)?.id

  const logInteraction = (
    eventType: FrontendInteractionEventType,
    fields: {
      conversationId?: string | null
      queryId?: string | null
      artifact?: ChatArtifactResult | RelatedArtifact | null
      navigationTarget?: ChatNavigationTarget | null
      metadata?: Record<string, unknown>
      title?: string | null
      inventoryNumber?: string | null
      artifactId?: string | null
      status?: string | null
      source?: string | null
      error?: string | null
      searchScope?: ChatSearchScope | null
    } = {},
  ) => {
    const artifact = fields.artifact
    const targetScope = fields.searchScope?.isCrossMuseum ? fields.searchScope : null
    logFrontendEvent({
      eventType,
      backendBaseUrl,
      sessionId: sessionIdRef.current,
      conversationId: fields.conversationId ?? conversationId,
      queryId: fields.queryId ?? null,
      participantId: participantId ?? null,
      taskId: taskId ?? null,
      tourId: targetScope?.museumSlug ?? museumSlug,
      language,
      artifactId:
        fields.artifactId ??
        (artifact && 'artifactId' in artifact ? artifact.artifactId : null),
      inventoryNumber:
        fields.inventoryNumber ??
        (artifact && 'inventoryNumber' in artifact ? artifact.inventoryNumber ?? null : null),
      title:
        fields.title ??
        (artifact && 'title' in artifact ? artifact.title ?? null : null),
      navigationTarget: fields.navigationTarget ?? null,
      status: fields.status,
      source: fields.source,
      error: fields.error,
      metadata: {
        ...(fields.metadata ?? {}),
        target_museum_id: targetScope?.museumId ?? null,
        target_museum_slug: targetScope?.museumSlug ?? null,
        target_museum_name: targetScope?.museumName ?? null,
        is_cross_museum: targetScope ? true : false,
      },
    })
  }

  const buildFocusedArtifactContext = (options: NavigationClickOptions): ChatSelectedArtifactContext | null => {
    const artifact = options.artifact
    const artifactId = String(options.artifactId ?? artifact?.artifactId ?? '').trim()
    if (!artifactId) {
      return null
    }
    const sourceScope = options.searchScope?.museumSlug
      ? options.searchScope
      : {
          museumId,
          museumSlug,
          museumName,
          isCrossMuseum: false,
        }

    return {
      artifactId,
      inventoryNumber: options.inventoryNumber ?? artifact?.inventoryNumber ?? null,
      title: options.title ?? artifact?.title ?? null,
      queryId: options.queryId ?? null,
      source: options.source,
      museumId: sourceScope.museumId ?? null,
      museumSlug: sourceScope.museumSlug ?? null,
      museumName: sourceScope.museumName ?? null,
    }
  }

  const selectFocusedArtifact = (options: NavigationClickOptions) => {
    const context = buildFocusedArtifactContext(options)
    if (!context) {
      return
    }
    if (focusedArtifact?.artifactId === context.artifactId) {
      setFocusedArtifact(context)
      return
    }
    setFocusedArtifact(context)
    logInteraction('artifact_context_selected', {
      queryId: context.queryId ?? null,
      artifact: options.artifact ?? null,
      title: context.title,
      inventoryNumber: context.inventoryNumber,
      artifactId: context.artifactId,
      status: 'selected',
      source: context.source,
      metadata: {
        source: context.source,
        selected_artifact_id: context.artifactId,
        selected_museum_id: context.museumId,
        selected_museum_slug: context.museumSlug,
        selected_museum_name: context.museumName,
      },
    })
  }

  const clearFocusedArtifact = (source: string = 'composer') => {
    if (!focusedArtifact) {
      return
    }
    const cleared = focusedArtifact
    setFocusedArtifact(null)
    logInteraction('artifact_context_cleared', {
      queryId: cleared.queryId ?? null,
      title: cleared.title,
      inventoryNumber: cleared.inventoryNumber,
      artifactId: cleared.artifactId,
      status: 'cleared',
      source,
      metadata: {
        source,
        selected_artifact_id: cleared.artifactId,
      },
    })
  }

  const buildNavigationCommandContext = (
    target: ChatNavigationTarget,
    options: NavigationClickOptions,
  ): TourNavigationCommandContext => {
    const artifact = options.artifact
    const artifactId = options.artifactId ?? artifact?.artifactId ?? null
    const inventoryNumber = options.inventoryNumber ?? artifact?.inventoryNumber ?? target.inventoryId
    const title = options.title ?? artifact?.title ?? target.title ?? null
    const targetScope = options.searchScope?.isCrossMuseum ? options.searchScope : null

    return {
      sessionId: sessionIdRef.current,
      conversationId,
      queryId: options.queryId ?? null,
      participantId: participantId ?? null,
      taskId: taskId ?? null,
      tourId: targetScope?.museumSlug ?? museumSlug,
      language,
      artifactId,
      inventoryNumber,
      title,
      source: options.source,
      targetMuseumId: targetScope?.museumId ?? null,
      targetMuseumSlug: targetScope?.museumSlug ?? null,
      targetMuseumName: targetScope?.museumName ?? null,
      isCrossMuseum: Boolean(targetScope),
    }
  }

  const registerMessageElement = useCallback((messageId: string, element: HTMLElement | null) => {
    if (element) {
      messageElementsRef.current.set(messageId, element)
      return
    }
    messageElementsRef.current.delete(messageId)
  }, [])

  const scrollChatElementIntoView = useCallback((target: HTMLElement, block: 'start' | 'end') => {
    const container = messagesScrollRef.current
    if (!container) {
      return false
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const targetTop = targetRect.top - containerRect.top + container.scrollTop
    const targetBottom = targetRect.bottom - containerRect.top + container.scrollTop
    const top = block === 'end' ? targetBottom - container.clientHeight : targetTop

    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    return true
  }, [])

  const scrollActiveTurnToTop = useCallback(() => {
    const messageId = activeTurnTopMessageIdRef.current
    if (!messageId) {
      return false
    }
    const target = messageElementsRef.current.get(messageId)
    if (!target) {
      return false
    }
    return scrollChatElementIntoView(target, 'start')
  }, [scrollChatElementIntoView])

  const stripStarterNotice = (items: ChatMessage[]) =>
    items.filter((item) => !item.isCenteredNotice)

  const openChat = () => {
    if (chatCloseTimerRef.current !== null) {
      window.clearTimeout(chatCloseTimerRef.current)
      chatCloseTimerRef.current = null
    }
    setIsChatClosing(false)
    setIsOpen(true)
    onOpenChange?.(true)
    logInteraction('assistant_opened')
  }

  const closeChat = () => {
    if (isChatClosing) {
      return
    }

    setIsChatClosing(true)
    logInteraction('assistant_closed')
    onAssistantClosed?.()
    if (chatCloseTimerRef.current !== null) {
      window.clearTimeout(chatCloseTimerRef.current)
    }
    chatCloseTimerRef.current = window.setTimeout(() => {
      setIsOpen(false)
      onOpenChange?.(false)
      setIsChatClosing(false)
      chatCloseTimerRef.current = null
    }, CHAT_PANEL_CLOSE_ANIMATION_MS)
  }

  const openArtifactModal = (
    artifact: ChatArtifactResult,
    navigationTarget: ChatNavigationTarget | null = null,
    queryId: string | null = null,
    source: string = 'result_card',
    searchScope: ChatSearchScope | null = null,
  ) => {
    if (artifactModalCloseTimerRef.current !== null) {
      window.clearTimeout(artifactModalCloseTimerRef.current)
      artifactModalCloseTimerRef.current = null
    }
    setIsArtifactModalClosing(false)
    setSelectedArtifactImageIndex(0)
    setSelectedArtifactResult(artifact)
    setSelectedArtifactNavigationTarget(navigationTarget)
    setSelectedArtifactQueryId(queryId)
    setSelectedArtifactSearchScope(searchScope)
    logInteraction('artifact_card_opened', {
      queryId,
      artifact,
      navigationTarget,
      searchScope,
      metadata: { source },
    })
    // Reset do contexto relacional; o useEffect carrega o novo.
    setDetailContext(null)
    setDetailContextError(null)
    setIsDetailContextLoading(true)
  }

  const buildNavigationTargetFromModalRequest = (
    request: TourArtifactModalRequest,
    inventoryNumber?: string | null,
    title?: string | null,
  ): ChatNavigationTarget | null => {
    const target = request.navigationTarget
    const overlayId = String(target?.overlayId || '').trim()
    const panoramaKey = String(target?.panoramaKey || '').trim()
    const inventoryId = String(target?.inventoryId || inventoryNumber || '').trim()
    if (!overlayId || !panoramaKey || !inventoryId) {
      return null
    }
    const location = String(target?.location || request.location || '').trim()
    const targetTitle = String(target?.title || title || request.title || '').trim()
    return {
      overlayId,
      panoramaKey,
      inventoryId,
      location: location || undefined,
      title: targetTitle || undefined,
    }
  }

  const openExternalArtifactModal = async (request: TourArtifactModalRequest) => {
    openChat()

    const requestedArtifactId = String(request.artifactId || '').trim()
    const requestedInventoryNumber =
      String(request.inventoryNumber || request.navigationTarget?.inventoryId || '').trim() || null
    const requestedTitle =
      String(request.title || request.navigationTarget?.title || '').trim() || null
    let artifact: ChatArtifactResult | null = null
    let resolutionError: string | null = null

    if (requestedInventoryNumber) {
      const result = await fetchArtifactFullByInventory({
        backendBaseUrl,
        museumSlug,
        museumId,
        language,
        inventoryNumber: requestedInventoryNumber,
      })
      artifact = result.artifact ?? null
      resolutionError = result.error ?? null
    } else if (requestedArtifactId) {
      const result = await fetchArtifactFull({
        backendBaseUrl,
        museumSlug,
        museumId,
        language,
        artifactId: requestedArtifactId,
      })
      artifact = result.artifact ?? null
      resolutionError = result.error ?? null
    }

    if (!artifact && requestedArtifactId) {
      artifact = {
        artifactId: requestedArtifactId,
        inventoryNumber: requestedInventoryNumber ?? undefined,
        title: requestedTitle ?? undefined,
        creators: [],
        creatorIds: [],
        sets: [],
        setIds: [],
        setNumbers: [],
        exhibitions: [],
        exhibitionIds: [],
        exhibitionTypes: [],
        images: [],
      }
    }

    if (!artifact) {
      logInteraction('error_shown', {
        inventoryNumber: requestedInventoryNumber,
        title: requestedTitle,
        status: 'not_opened',
        source: request.source,
        error: resolutionError ?? 'artifact_resolution_failed',
        metadata: {
          source: request.source,
          reason: resolutionError ?? 'artifact_resolution_failed',
          inventory_number: requestedInventoryNumber,
        },
      })
      return
    }

    const navigationTarget = buildNavigationTargetFromModalRequest(
      request,
      artifact.inventoryNumber ?? requestedInventoryNumber,
      artifact.title ?? requestedTitle,
    )
    openArtifactModal(artifact, navigationTarget, null, request.source, null)
  }

  useEffect(() => {
    if (!externalArtifactModalRequest) {
      return
    }
    if (externalArtifactModalRequestIdRef.current === externalArtifactModalRequest.requestId) {
      return
    }
    externalArtifactModalRequestIdRef.current = externalArtifactModalRequest.requestId
    void openExternalArtifactModal(externalArtifactModalRequest)
    // The request object is an imperative bridge from the tour shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalArtifactModalRequest])

  const closeArtifactModal = useCallback(() => {
    if (!selectedArtifactResult || isArtifactModalClosing) {
      return
    }

    setIsArtifactModalClosing(true)
    if (artifactModalCloseTimerRef.current !== null) {
      window.clearTimeout(artifactModalCloseTimerRef.current)
    }
    artifactModalCloseTimerRef.current = window.setTimeout(() => {
      setSelectedArtifactResult(null)
      setSelectedArtifactNavigationTarget(null)
      setSelectedArtifactQueryId(null)
      setSelectedArtifactSearchScope(null)
      setSelectedArtifactImageIndex(0)
      setIsArtifactModalClosing(false)
      setDetailContext(null)
      setDetailContextError(null)
      setIsDetailContextLoading(false)
      artifactModalCloseTimerRef.current = null
    }, ARTIFACT_MODAL_CLOSE_ANIMATION_MS)
  }, [isArtifactModalClosing, selectedArtifactResult])

  const handleViewSelectedArtifactInTour = () => {
    if (!selectedArtifactNavigationTarget || !onNavigateToTarget) {
      return
    }
    const navigationContext = buildNavigationCommandContext(selectedArtifactNavigationTarget, {
      queryId: selectedArtifactQueryId,
      artifact: selectedArtifactResult,
      source: 'artifact_modal',
      searchScope: selectedArtifactSearchScope,
    })
    logInteraction('see_in_tour_clicked', {
      queryId: selectedArtifactQueryId,
      artifact: selectedArtifactResult,
      navigationTarget: selectedArtifactNavigationTarget,
      status: 'clicked',
      source: 'artifact_modal',
      searchScope: selectedArtifactSearchScope,
      metadata: { source: 'artifact_modal' },
    })
    onNavigateToTarget(selectedArtifactNavigationTarget, navigationContext)
    closeArtifactModal()
  }

  const handleAskAboutSelectedArtifact = () => {
    if (!selectedArtifactResult) {
      return
    }
    selectFocusedArtifact({
      artifact: selectedArtifactResult,
      queryId: selectedArtifactQueryId,
      source: 'artifact_modal',
      searchScope: selectedArtifactSearchScope,
    })
    closeArtifactModal()
    openChat()
  }

  // Carrega contexto relacional quando o modal abre (lazy).
  useEffect(() => {
    if (!selectedArtifactResult) {
      return
    }
    const artifactId = selectedArtifactResult.artifactId
    if (!artifactId) {
      setIsDetailContextLoading(false)
      return
    }
    let cancelled = false
    setDetailContext(null)
    setIsDetailContextLoading(true)
    setDetailContextError(null)
    relatedLoadingKeysRef.current = new Set()
    setRelatedLoadingKeys(new Set())
    setRelatedLoadErrors({})
    const detailMuseumSlug = selectedArtifactSearchScope?.museumSlug ?? museumSlug
    const detailMuseumId = selectedArtifactSearchScope?.museumId ?? museumId
    fetchArtifactDetailContext({
      backendBaseUrl,
      museumSlug: detailMuseumSlug,
      museumId: detailMuseumId ?? undefined,
      language,
      artifactId,
    })
      .then((result) => {
        if (cancelled) return
        if (result.error || !result.context) {
          setDetailContext(null)
          setDetailContextError(result.error || tt('relatedError'))
        } else {
          setDetailContext(result.context)
        }
      })
      .catch(() => {
        if (cancelled) return
        setDetailContext(null)
        setDetailContextError(tt('relatedError'))
      })
      .finally(() => {
        if (!cancelled) setIsDetailContextLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArtifactResult?.artifactId])

  const mergeUniqueByKey = <T,>(
    currentValues: T[] | undefined,
    nextValues: T[] | undefined,
    getKey: (item: T) => string,
  ) => {
    const merged: T[] = []
    const seen = new Set<string>()
    for (const item of currentValues || []) {
      const key = getKey(item).trim()
      if (!key || seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(item)
    }
    for (const item of nextValues || []) {
      const key = getKey(item).trim()
      if (!key || seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(item)
    }
    return merged
  }

  const compactResultKey = (value: string | null | undefined) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const artifactResultKey = (artifact: ChatArtifactResult) => {
    const inventory = compactResultKey(artifact.inventoryNumber)
    if (inventory) return `inventory:${inventory}`
    const artifactId = compactResultKey(artifact.artifactId)
    if (artifactId) return `artifact:${artifactId}`
    return compactResultKey(artifact.title)
  }

  const imageMatchResultKey = (match: ChatImageMatch) => {
    const inventory = compactResultKey(match.inventory || match.artifact?.inventoryNumber)
    if (inventory) return `inventory:${inventory}`
    const artifactId = compactResultKey(match.artifactId || match.artifact?.artifactId)
    if (artifactId) return `artifact:${artifactId}`
    return `image:${compactResultKey(match.originalImageName)}`
  }

  const dedupeArtifactResults = (artifacts: ChatArtifactResult[] | undefined) =>
    mergeUniqueByKey([], artifacts, artifactResultKey)

  const dedupeImageMatches = (matches: ChatImageMatch[] | undefined) =>
    mergeUniqueByKey([], matches, imageMatchResultKey)

  const relatedGroupKey = (kind: RelatedArtifactGroupKind, entityId: string) =>
    `${kind}:${entityId}`

  const loadMoreRelatedArtifacts = async (
    kind: RelatedArtifactGroupKind,
    entityId: string,
  ) => {
    if (!selectedArtifactResult || !detailContext) {
      return
    }
    const groupKey = relatedGroupKey(kind, entityId)
    if (relatedLoadingKeysRef.current.has(groupKey)) {
      return
    }
    const group =
      kind === 'conjunto'
        ? detailContext.sets.find((item) => item.entityId === entityId)
        : detailContext.exhibitions.find((item) => item.entityId === entityId)
    if (!group) {
      return
    }
    const currentCount = group.artifacts.length
    const total = group.nObjetos ?? group.artifactsReturned ?? currentCount
    if (currentCount >= total) {
      return
    }

    relatedLoadingKeysRef.current.add(groupKey)
    setRelatedLoadingKeys((current) => {
      const next = new Set(current)
      next.add(groupKey)
      return next
    })
    setRelatedLoadErrors((current) => ({ ...current, [groupKey]: null }))

    const relatedMuseumSlug = selectedArtifactSearchScope?.museumSlug ?? museumSlug
    const relatedMuseumId = selectedArtifactSearchScope?.museumId ?? museumId
    const result = await fetchRelatedArtifactsPage({
      backendBaseUrl,
      museumSlug: relatedMuseumSlug,
      museumId: relatedMuseumId ?? undefined,
      language,
      artifactId: selectedArtifactResult.artifactId,
      tipo: kind,
      entityId,
      offset: currentCount,
      limit: RELATED_ARTIFACTS_PAGE_SIZE,
    })

    if (result.error) {
      setRelatedLoadErrors((current) => ({ ...current, [groupKey]: result.error || tt('relatedError') }))
    } else {
      setDetailContext((current) => {
        if (!current || current.artifactId !== selectedArtifactResult.artifactId) {
          return current
        }
        const updateGroup = <T extends { entityId: string; artifacts: RelatedArtifact[]; artifactsReturned: number; nObjetos?: number }>(
          item: T,
        ): T => {
          if (item.entityId !== entityId) {
            return item
          }
          const artifacts = mergeUniqueByKey(
            item.artifacts,
            result.artifacts,
            (artifact) => artifact.artifactId,
          )
          return {
            ...item,
            artifacts,
            artifactsReturned: artifacts.length,
            nObjetos: result.artifactsTotal || item.nObjetos,
          }
        }
        if (kind === 'conjunto') {
          return {
            ...current,
            sets: current.sets.map((item) => updateGroup(item)),
          }
        }
        return {
          ...current,
          exhibitions: current.exhibitions.map((item) => updateGroup(item)),
        }
      })
    }

    relatedLoadingKeysRef.current.delete(groupKey)
    setRelatedLoadingKeys((current) => {
      const next = new Set(current)
      next.delete(groupKey)
      return next
    })
  }

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
      logInteraction('error_shown', {
        metadata: {
          source: 'upload_validation',
          error: 'unsupported_format',
          file_name: file.name,
          file_type: file.type,
        },
      })
      return false
    }
    const maxBytes =
      uploadKind === 'model' ? MAX_MODEL_FILE_SIZE_BYTES : MAX_IMAGE_FILE_SIZE_BYTES
    const maxMb = uploadKind === 'model' ? MAX_MODEL_FILE_SIZE_MB : MAX_IMAGE_FILE_SIZE_MB
    if (file.size > maxBytes) {
      const itemLabel = uploadKind === 'model' ? tt('modelLabel') : tt('imageLabel')
      setUploadUiError(tt('tooLarge', { itemLabel, maxMb }))
      logInteraction('error_shown', {
        metadata: {
          source: 'upload_validation',
          error: 'file_too_large',
          upload_kind: uploadKind,
          file_size: file.size,
          max_bytes: maxBytes,
        },
      })
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
    activeTurnTopMessageIdRef.current = null
    if (artifactModalCloseTimerRef.current !== null) {
      window.clearTimeout(artifactModalCloseTimerRef.current)
      artifactModalCloseTimerRef.current = null
    }
    setIsArtifactModalClosing(false)
    setSelectedArtifactResult(null)
    setSelectedArtifactQueryId(null)
    setSelectedArtifactImageIndex(0)
    setFocusedArtifact(null)
    setMessages([buildStarterMessage()])
  }

  const handleLanguageChange = (nextLanguage: ChatLanguage) => {
    if (isSending || nextLanguage === language) {
      return
    }
    setLanguage(nextLanguage)
    resetConversation()
  }

  useEffect(() => {
    if (scrollActiveTurnToTop()) {
      if (!isAssistantLoading) {
        activeTurnTopMessageIdRef.current = null
      }
      return
    }
    if (messagesEndRef.current) {
      scrollChatElementIntoView(messagesEndRef.current, 'end')
    }
  }, [messages, isAssistantLoading, statusMessages, scrollActiveTurnToTop, scrollChatElementIntoView])

  useEffect(() => {
    void warmChatSession({ backendBaseUrl, museumSlug })
  }, [backendBaseUrl, museumSlug])

  useEffect(() => {
    setLanguage(resolveEmbedLanguage(initialLanguage))
  }, [initialLanguage])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const resolvePortalRoot = () => {
      const fullscreenElement = document.fullscreenElement
      if (fullscreenElement instanceof HTMLElement) {
        setPortalRoot(fullscreenElement)
        return
      }
      setPortalRoot(document.body)
    }

    resolvePortalRoot()
    document.addEventListener('fullscreenchange', resolvePortalRoot)
    return () => {
      document.removeEventListener('fullscreenchange', resolvePortalRoot)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (chatCloseTimerRef.current !== null) {
        window.clearTimeout(chatCloseTimerRef.current)
        chatCloseTimerRef.current = null
      }
      if (artifactModalCloseTimerRef.current !== null) {
        window.clearTimeout(artifactModalCloseTimerRef.current)
        artifactModalCloseTimerRef.current = null
      }
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

  useEffect(() => {
    if (!selectedArtifactResult) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeArtifactModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeArtifactModal, selectedArtifactResult])

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
    const focusedArtifactSnapshot = focusedArtifact ? { ...focusedArtifact } : null

    const userMessageId = createId()
    activeTurnTopMessageIdRef.current = userMessageId
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
        selectedArtifactContext: focusedArtifactSnapshot,
      },
    ])
    setDraft('')
    setIsSending(true)
    setIsAssistantLoading(true)
    setStatusMessages([tt('preparingRequest')])
    clearSelectedUpload()
    logInteraction('message_sent', {
      metadata: {
        has_upload: hasUpload,
        upload_kind: selectedUploadKindSnapshot,
        message_length: submittedText.length,
        selected_artifact_id: focusedArtifactSnapshot?.artifactId ?? null,
        selected_context_mode: focusedArtifactSnapshot ? 'auto' : null,
      },
    })

    const chatResponse = await sendChatMessage({
      backendBaseUrl,
      museumSlug,
      museumId,
      museumName,
      language,
      sessionId: sessionIdRef.current,
      participantId,
      taskId,
      selectedArtifact: focusedArtifactSnapshot,
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
    const responseConversationId = chatResponse?.conversationId ?? conversationId
    const responseQueryId = chatResponse?.queryId ?? null

    if (chatResponse?.reply) {
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: chatResponse.reply,
          queryId: responseQueryId,
          imageMatches: dedupeImageMatches(chatResponse.imageMatches),
          artifactResults: dedupeArtifactResults(chatResponse.artifactResults),
          navigationTargets: chatResponse.navigationTargets,
          resultsPage: chatResponse.resultsPage,
          resultsPageSize: chatResponse.resultsPageSize,
          resultsTotal: chatResponse.resultsTotal,
          resultsHasMore: chatResponse.resultsHasMore,
          resultsRequestId: chatResponse.resultsRequestId,
          searchScope: chatResponse.searchScope,
          isLoadingMoreResults: false,
          loadMoreResultsError: null,
        },
      ])
      logInteraction('answer_received', {
        conversationId: responseConversationId,
        queryId: responseQueryId,
        metadata: {
          artifact_count: chatResponse.artifactResults?.length ?? 0,
          image_match_count: chatResponse.imageMatches?.length ?? 0,
          navigation_target_count: chatResponse.navigationTargets?.length ?? 0,
          results_total: chatResponse.resultsTotal,
          target_museum_id: chatResponse.searchScope?.museumId ?? null,
          target_museum_slug: chatResponse.searchScope?.museumSlug ?? null,
          target_museum_name: chatResponse.searchScope?.museumName ?? null,
          is_cross_museum: chatResponse.searchScope?.isCrossMuseum ?? false,
        },
      })
    } else if (chatResponse?.error) {
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: `${tt('errorPrefix')}: ${chatResponse.error}`,
          queryId: responseQueryId,
          imageMatches: dedupeImageMatches(chatResponse.imageMatches),
          artifactResults: dedupeArtifactResults(chatResponse.artifactResults),
          navigationTargets: chatResponse.navigationTargets,
          resultsPage: chatResponse.resultsPage,
          resultsPageSize: chatResponse.resultsPageSize,
          resultsTotal: chatResponse.resultsTotal,
          resultsHasMore: chatResponse.resultsHasMore,
          resultsRequestId: chatResponse.resultsRequestId,
          searchScope: chatResponse.searchScope,
          isLoadingMoreResults: false,
          loadMoreResultsError: null,
        },
      ])
      logInteraction('error_shown', {
        conversationId: responseConversationId,
        queryId: responseQueryId,
        metadata: {
          source: 'send_message',
          error: chatResponse.error,
        },
      })
    } else {
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: tt('backendNoReply'),
          queryId: responseQueryId,
        },
      ])
      logInteraction('error_shown', {
        conversationId: responseConversationId,
        queryId: responseQueryId,
        metadata: { source: 'send_message', error: 'backend_no_reply' },
      })
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
      sessionId: sessionIdRef.current,
      participantId,
      taskId,
      selectedArtifact: focusedArtifact,
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
    const responseConversationId = chatResponse?.conversationId ?? conversationId
    const responseQueryId = chatResponse?.queryId ?? null

    if (chatResponse?.reply) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: chatResponse.reply,
                queryId: responseQueryId,
                imageMatches: dedupeImageMatches(chatResponse.imageMatches),
                artifactResults: dedupeArtifactResults(chatResponse.artifactResults),
                navigationTargets: chatResponse.navigationTargets,
                resultsPage: chatResponse.resultsPage,
                resultsPageSize: chatResponse.resultsPageSize,
                resultsTotal: chatResponse.resultsTotal,
                resultsHasMore: chatResponse.resultsHasMore,
                resultsRequestId: chatResponse.resultsRequestId,
                searchScope: chatResponse.searchScope,
                isLoadingMoreResults: false,
                loadMoreResultsError: null,
              }
            : message,
        ),
      )
      logInteraction('answer_received', {
        conversationId: responseConversationId,
        queryId: responseQueryId,
        metadata: {
          source: 'regenerate',
          artifact_count: chatResponse.artifactResults?.length ?? 0,
          image_match_count: chatResponse.imageMatches?.length ?? 0,
          navigation_target_count: chatResponse.navigationTargets?.length ?? 0,
          results_total: chatResponse.resultsTotal,
          target_museum_id: chatResponse.searchScope?.museumId ?? null,
          target_museum_slug: chatResponse.searchScope?.museumSlug ?? null,
          target_museum_name: chatResponse.searchScope?.museumName ?? null,
          is_cross_museum: chatResponse.searchScope?.isCrossMuseum ?? false,
        },
      })
    } else if (chatResponse?.error) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: `${tt('errorPrefix')}: ${chatResponse.error}`,
                queryId: responseQueryId,
                imageMatches: dedupeImageMatches(chatResponse.imageMatches),
                artifactResults: dedupeArtifactResults(chatResponse.artifactResults),
                navigationTargets: chatResponse.navigationTargets ?? [],
                resultsPage: chatResponse.resultsPage,
                resultsPageSize: chatResponse.resultsPageSize,
                resultsTotal: chatResponse.resultsTotal,
                resultsHasMore: chatResponse.resultsHasMore,
                resultsRequestId: chatResponse.resultsRequestId,
                searchScope: chatResponse.searchScope,
                isLoadingMoreResults: false,
                loadMoreResultsError: null,
              }
            : message,
        ),
      )
      logInteraction('error_shown', {
        conversationId: responseConversationId,
        queryId: responseQueryId,
        metadata: {
          source: 'regenerate',
          error: chatResponse.error,
        },
      })
    }

    setIsAssistantLoading(false)
    setStatusMessages([])
    setIsSending(false)
  }

  const handleLoadMoreResults = async (messageId: string) => {
    if (isSending || !conversationId) {
      return
    }
    const targetMessage = messages.find((message) => message.id === messageId)
    if (!targetMessage || !targetMessage.resultsHasMore || targetMessage.isLoadingMoreResults) {
      return
    }

    const nextPage = Math.max(1, (targetMessage.resultsPage || 1) + 1)
    const pageSize =
      typeof targetMessage.resultsPageSize === 'number' && targetMessage.resultsPageSize > 0
        ? targetMessage.resultsPageSize
        : undefined

    setMessages((previous) =>
      previous.map((message) =>
        message.id === messageId
          ? {
              ...message,
              isLoadingMoreResults: true,
              loadMoreResultsError: null,
            }
          : message,
      ),
    )

    const resultsPage = await fetchChatResultsPage({
      backendBaseUrl,
      museumSlug,
      museumId,
      museumName,
      language,
      conversationId,
      resultsPage: nextPage,
      resultsPageSize: pageSize,
      resultsRequestId: targetMessage.resultsRequestId,
    })

    if (resultsPage?.conversationId) {
      setConversationId(resultsPage.conversationId)
    }

    if (!resultsPage || resultsPage.error) {
      const errorMessage = resultsPage?.error || tt('backendNoReply')
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                isLoadingMoreResults: false,
                loadMoreResultsError: errorMessage,
              }
            : message,
        ),
      )
      logInteraction('error_shown', {
        queryId: targetMessage.queryId ?? null,
        metadata: {
          source: 'load_more_results',
          error: errorMessage,
        },
      })
      return
    }

    const navigationTargets = mergeUniqueByKey(
      [],
      resultsPage.navigationTargets,
      (target) => [target.overlayId, target.panoramaKey, target.inventoryId].join('|'),
    )
    const nextAssistantMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      text: resultsPage.reply || tt('moreResultsFallback'),
      queryId: targetMessage.queryId ?? null,
      imageMatches: dedupeImageMatches(resultsPage.imageMatches),
      artifactResults: dedupeArtifactResults(resultsPage.artifactResults),
      navigationTargets,
      resultsPage: resultsPage.resultsPage,
      resultsPageSize: resultsPage.resultsPageSize,
      resultsTotal: resultsPage.resultsTotal,
      resultsHasMore: resultsPage.resultsHasMore,
      resultsRequestId: resultsPage.resultsRequestId || targetMessage.resultsRequestId,
      searchScope: resultsPage.searchScope ?? targetMessage.searchScope,
      isLoadingMoreResults: false,
      loadMoreResultsError: null,
    }

    setMessages((previous) => [
      ...previous.map((message) =>
        message.id === messageId
          ? {
              ...message,
              isLoadingMoreResults: false,
              loadMoreResultsError: null,
            }
          : message,
      ),
      nextAssistantMessage,
    ])
    logInteraction('answer_received', {
      queryId: targetMessage.queryId ?? null,
      metadata: {
        source: 'load_more_results',
        artifact_count: resultsPage.artifactResults?.length ?? 0,
        image_match_count: resultsPage.imageMatches?.length ?? 0,
        navigation_target_count: resultsPage.navigationTargets?.length ?? 0,
        results_total: resultsPage.resultsTotal,
        results_page: resultsPage.resultsPage,
        target_museum_id: resultsPage.searchScope?.museumId ?? targetMessage.searchScope?.museumId ?? null,
        target_museum_slug: resultsPage.searchScope?.museumSlug ?? targetMessage.searchScope?.museumSlug ?? null,
        target_museum_name: resultsPage.searchScope?.museumName ?? targetMessage.searchScope?.museumName ?? null,
        is_cross_museum: resultsPage.searchScope?.isCrossMuseum ?? targetMessage.searchScope?.isCrossMuseum ?? false,
      },
    })
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
      return null
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

  const resolveNavigationTargetForArtifact = (
    artifact: ChatArtifactResult | null,
    navigationTargets: ChatNavigationTarget[] | undefined,
  ): ChatNavigationTarget | null => {
    if (!artifact || !navigationTargets || navigationTargets.length === 0) {
      return null
    }
    const inventoryKey = normalizeLookupKey(artifact.inventoryNumber)
    if (!inventoryKey) {
      return null
    }
    return (
      navigationTargets.find(
        (target) => normalizeLookupKey(target.inventoryId) === inventoryKey,
      ) || null
    )
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

  const resolveArtifactImageUrl = (image: ChatArtifactImage) => {
    const localRef =
      image.localPath || image.originalImageName
    if (localRef) {
      const localAssetUrl = buildImageAssetUrl(normalizedBackendBaseUrl, localRef)
      if (localAssetUrl) {
        return localAssetUrl
      }
    }
    const sourceUrl = String(image.sourceUrl || '').trim()
    return sourceUrl || null
  }

  const resolveArtifactResultForImageMatch = (
    match: ChatImageMatch,
    artifactResults: ChatArtifactResult[] | undefined,
  ): ChatArtifactResult | null => {
    const inventoryKey = normalizeLookupKey(match.inventory)
    const embeddedArtifact = match.artifact || null

    if (inventoryKey && artifactResults && artifactResults.length > 0) {
      const byInventory = artifactResults.find(
        (artifact) => normalizeLookupKey(artifact.inventoryNumber) === inventoryKey,
      )
      if (byInventory) {
        return byInventory
      }
    }

    if (
      embeddedArtifact &&
      (!inventoryKey || normalizeLookupKey(embeddedArtifact.inventoryNumber) === inventoryKey)
    ) {
      return embeddedArtifact
    }

    if (!artifactResults || artifactResults.length === 0) {
      return null
    }

    const matchImageRef = normalizeLookupKey(match.originalImageName)
    if (matchImageRef) {
      const byImagePath = artifactResults.find((artifact) =>
        artifact.images.some((image) => {
          const localKey = normalizeLookupKey(image.localPath || image.originalImageName)
          return Boolean(localKey && localKey === matchImageRef)
        }),
      )
      if (byImagePath) {
        return byImagePath
      }
    }

    const artifactId = String(match.artifactId || '').trim()
    if (artifactId) {
      const byId = artifactResults.find((artifact) => artifact.artifactId === artifactId)
      if (
        byId &&
        (!inventoryKey || normalizeLookupKey(byId.inventoryNumber) === inventoryKey)
      ) {
        return byId
      }
    }

    return null
  }

  const handleNavigateToTargetClick = (
    target: ChatNavigationTarget,
    options: NavigationClickOptions,
  ) => {
    const navigationContext = buildNavigationCommandContext(target, options)
    logInteraction('see_in_tour_clicked', {
      queryId: options.queryId ?? null,
      artifact: options.artifact ?? null,
      navigationTarget: target,
      title: options.title,
      inventoryNumber: options.inventoryNumber,
      artifactId: options.artifactId,
      status: 'clicked',
      source: options.source,
      searchScope: options.searchScope,
      metadata: { source: options.source },
    })
    onNavigateToTarget?.(target, navigationContext)
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

  const renderSearchScopeNotice = (searchScope?: ChatSearchScope | null) => {
    if (!searchScope?.isCrossMuseum) {
      return null
    }
    const museumLabel = searchScope.museumName || searchScope.museumSlug
    return (
      <div className="p360-chat-results-enter mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-[#b8ccd8] bg-[#f3f9fb] px-2.5 py-1 text-[11px] font-semibold text-[#18304a] shadow-[0_8px_18px_-16px_rgba(24,48,74,0.5)]">
        <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6d8c]" />
        <span className="truncate">{tt('crossMuseumResultsNotice', { museum: museumLabel })}</span>
      </div>
    )
  }

  const renderUserMessageReference = (context?: ChatSelectedArtifactContext | null) => {
    if (!context?.artifactId) {
      return null
    }
    const label = [context.inventoryNumber, context.title || context.artifactId]
      .filter(Boolean)
      .join(' · ')
    const museumLabel = context.museumName || context.museumSlug || null
    return (
      <div className="mb-1.5 flex max-w-full flex-wrap items-center gap-1.5 text-[10px] leading-tight text-[#5d4448]">
        <span className="inline-flex items-center rounded-full border border-[#c7b3ae] bg-white/55 px-2 py-0.5 font-semibold uppercase tracking-[0.08em] text-[#6d0b1b]">
          {tt('artifactContextLabel')}
        </span>
        <span className="min-w-0 max-w-[260px] truncate rounded-full bg-white/45 px-2 py-0.5 font-medium">
          {label}
        </span>
        {museumLabel ? (
          <span className="max-w-[180px] truncate rounded-full bg-white/35 px-2 py-0.5">
            {museumLabel}
          </span>
        ) : null}
      </div>
    )
  }

  const renderImageMatches = (
    imageMatches: ChatImageMatch[] | undefined,
    artifactResults: ChatArtifactResult[] | undefined,
    navigationTargets: ChatNavigationTarget[] | undefined,
    queryId?: string | null,
    searchScope?: ChatSearchScope | null,
  ) => {
    const visibleImageMatches = dedupeImageMatches(imageMatches)
    if (visibleImageMatches.length === 0) {
      return null
    }

    return (
      <div className={`${isChatClosing ? 'p360-chat-results-exit' : 'p360-chat-results-enter'} mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2`}>
        {visibleImageMatches.map((match, index) => {
          const imageUrl = buildImageAssetUrl(normalizedBackendBaseUrl, match.originalImageName)
          const linkedArtifact = resolveArtifactResultForImageMatch(match, artifactResults)
          const matchInventoryKey = normalizeLookupKey(match.inventory)
          const embeddedNavigationTarget =
            match.navigationTarget &&
            (!matchInventoryKey ||
              normalizeLookupKey(match.navigationTarget.inventoryId) === matchInventoryKey)
              ? match.navigationTarget
              : null
          const linkedTarget =
            embeddedNavigationTarget ||
            resolveNavigationTargetForArtifact(linkedArtifact, navigationTargets) ||
            resolveNavigationTargetForImageMatch(match, navigationTargets)
          const focusArtifactId = String(linkedArtifact?.artifactId || match.artifactId || '').trim()
          const focusInventoryNumber = linkedArtifact?.inventoryNumber || match.inventory || null
          const focusTitle = linkedArtifact?.title || match.title || null
          const canFocusArtifact = Boolean(focusArtifactId)
          const isFocusedArtifact = Boolean(
            focusArtifactId && focusedArtifact?.artifactId === focusArtifactId,
          )
          return (
            <article
              key={`${match.originalImageName}-${index}`}
              className={`${isChatClosing ? 'p360-chat-result-card-exit' : 'p360-chat-result-card'} overflow-hidden rounded-xl border bg-white/80 transition-[border-color,box-shadow,background-color] ${
                isFocusedArtifact
                  ? 'border-[#6d0b1b] bg-[#fff8f5] shadow-[0_14px_28px_-24px_rgba(109,11,27,0.9)] ring-2 ring-[#6d0b1b]/20'
                  : 'border-[#d9c0bc]'
              }`}
              style={{
                animationDelay: isChatClosing
                  ? `${Math.min((visibleImageMatches.length - index - 1) * 30, 180)}ms`
                  : `${Math.min(index * 45, 240)}ms`,
              }}
            >
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    if (linkedArtifact) {
                      openArtifactModal(linkedArtifact, linkedTarget, queryId ?? null, 'image_match_card', searchScope ?? null)
                      return
                    }
                    setLightboxImage({
                      src: imageUrl,
                      alt:
                        match.title ||
                        match.inventory ||
                        `${tt('imageLabel')} ${index + 1}`,
                    })
                  }}
                  className="block w-full cursor-zoom-in"
                >
                  <LoadingImage
                    src={imageUrl}
                    alt={match.title || match.inventory || `${tt('imageLabel')} ${index + 1}`}
                    wrapperClassName="h-24 w-full"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ) : null}
              <div className="space-y-1 px-2 py-1.5">
                <p className="truncate text-sm font-semibold uppercase tracking-[0.08em] text-[#5a2730]">
                  {match.inventory || match.title || tt('visualResult')}
                </p>
                {match.title ? <p className="truncate text-sm text-[#341d22]">{match.title}</p> : null}
                {/* <p className="truncate text-[11px] text-[#6e5a5f]">{match.originalImageName}</p> */}
                {canFocusArtifact || linkedTarget ? (
                  <div className="mt-1.5 flex gap-1.5">
                    {canFocusArtifact ? (
                      <button
                        type="button"
                        onClick={() =>
                          selectFocusedArtifact({
                            artifact: linkedArtifact,
                            queryId: queryId ?? null,
                            source: 'image_match_card',
                            title: focusTitle,
                            inventoryNumber: focusInventoryNumber,
                            artifactId: focusArtifactId,
                            searchScope,
                          })
                        }
                        title={tt('askAboutThisTitle')}
                        aria-label={tt('askAboutThisTitle')}
                        className={`inline-flex cursor-pointer active:scale-95 transition-transform duration-100 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] ${
                          isFocusedArtifact
                            ? 'border-[#6d0b1b] bg-[#6d0b1b] text-white shadow-[0_12px_24px_-20px_rgba(109,11,27,0.95)]'
                            : 'border-[#c8ada7] bg-white/90 text-[#5a2730] hover:border-[#6d0b1b]/45 hover:bg-white'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
                          <path
                            d="M8 12h8M12 8v8M5.5 5.5h13v10h-5L10 19v-3.5H5.5z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="truncate">
                          {isFocusedArtifact ? tt('artifactContextSelectedAction') : tt('askAboutThis')}
                        </span>
                      </button>
                    ) : null}
                    {linkedTarget ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleNavigateToTargetClick(linkedTarget, {
                            artifact: linkedArtifact,
                            queryId: queryId ?? null,
                            source: 'image_match_card',
                            title: match.title,
                            inventoryNumber: match.inventory,
                            artifactId: match.artifactId,
                            searchScope,
                          })
                        }
                        disabled={!onNavigateToTarget}
                        className="inline-flex min-w-0 flex-1 items-center justify-center rounded-md border border-[#18304a] bg-[#13283f] px-2 py-1 text-sm font-semibold text-[#e7f4ff] transition-colors hover:bg-[#183657] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer active:scale-95 transition-transform duration-100"
                      >
                        <span className="truncate">{tt('viewInTour')}</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  const renderArtifactImageViewer = (images: ChatArtifactImage[]) => {
    if (images.length === 0) {
      return null
    }

    const activeIndex = Math.min(Math.max(selectedArtifactImageIndex, 0), images.length - 1)
    const activeImage = images[activeIndex]
    const activeImageUrl = resolveArtifactImageUrl(activeImage)
    const activeLabel =
      activeImage.altText ||
      activeImage.caption ||
      activeImage.originalImageName ||
      `${tt('imageLabel')} ${activeIndex + 1}`
    const hasMultipleImages = images.length > 1
    const moveImage = (direction: number) => {
      setSelectedArtifactImageIndex((current) => {
        const normalized = ((current % images.length) + images.length) % images.length
        return (normalized + direction + images.length) % images.length
      })
    }

    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-lg border border-[#ddc8c4] bg-[#f8f1ef]">
          {activeImageUrl ? (
            <button
              type="button"
              onClick={() => setLightboxImage({ src: activeImageUrl, alt: activeLabel })}
              className="flex h-[46vh] min-h-[280px] max-h-[540px] w-full cursor-zoom-in items-center justify-center p-2"
            >
              <LoadingImage
                src={activeImageUrl}
                alt={activeLabel}
                wrapperClassName="flex h-full w-full items-center justify-center"
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </button>
          ) : (
            <div className="flex h-[46vh] min-h-[280px] max-h-[540px] items-center justify-center p-3 text-sm text-[#7b686c]">
              {tt('imageUnavailable')}
            </div>
          )}

          {hasMultipleImages ? (
            <>
              <button
                type="button"
                onClick={() => moveImage(-1)}
                aria-label={tt('previousImage')}
                title={tt('previousImage')}
                className="absolute left-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/65 bg-black/38 text-white shadow-sm transition-colors hover:bg-black/58"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveImage(1)}
                aria-label={tt('nextImage')}
                title={tt('nextImage')}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/65 bg-black/38 text-white shadow-sm transition-colors hover:bg-black/58"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          ) : null}

          <div className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white">
            {activeIndex + 1} / {images.length}
          </div>
        </div>

        {activeImage.caption || activeImage.altText ? (
          <p className="rounded-lg border border-[#eadbd8] bg-white/70 px-2.5 py-1.5 text-xs leading-snug text-[#6b5b5f]">
            {activeImage.caption || activeImage.altText}
          </p>
        ) : null}

        {hasMultipleImages ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => {
              const imageUrl = resolveArtifactImageUrl(image)
              const label =
                image.altText ||
                image.caption ||
                image.originalImageName ||
                `${tt('imageLabel')} ${index + 1}`
              return (
                <button
                  key={`${image.imageId || image.localPath || image.sourceUrl || index}`}
                  type="button"
                  onClick={() => setSelectedArtifactImageIndex(index)}
                  aria-label={label}
                  title={label}
                  className={`flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-[#f8f1ef] p-1 transition-colors ${
                    index === activeIndex
                      ? 'border-[#6d0b1b] ring-2 ring-[#6d0b1b]/20'
                      : 'border-[#ddc8c4] hover:border-[#b8918b]'
                  }`}
                >
                  {imageUrl ? (
                    <LoadingImage
                      src={imageUrl}
                      alt={label}
                      wrapperClassName="flex h-full w-full items-center justify-center rounded"
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] text-[#7b686c]">{index + 1}</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  // ----- Modal: handler de click num artefacto relacionado ----- //
  const handleRelatedArtifactClick = async (related: RelatedArtifact) => {
    if (!related.artifactId) return
    // Optimista: abre logo o modal com a info que ja temos (sem imagens),
    // depois enriquece via fetch full.
    const optimistic: ChatArtifactResult = {
      artifactId: related.artifactId,
      tipoInventario: undefined,
      inventoryNumber: related.inventoryNumber,
      title: related.title,
      museumId: related.museumId,
      museum: related.museum,
      category: related.category,
      superCategory: undefined,
      creator: related.creators[0],
      creators: related.creators,
      creatorIds: [],
      dateOrPeriod: related.dateOrPeriod,
      detailType: related.detailType,
      detailUrl: related.detailUrl,
      inTour: related.inTour,
      sets: [],
      setIds: [],
      setNumbers: [],
      exhibitions: [],
      exhibitionIds: [],
      exhibitionTypes: [],
      imageCount: related.imageCount,
      images: related.images,
    }
    openArtifactModal(
      optimistic,
      related.navigationTarget ?? null,
      selectedArtifactQueryId,
      'related_artifact_card',
      selectedArtifactSearchScope,
    )
    const detailMuseumSlug = selectedArtifactSearchScope?.museumSlug ?? museumSlug
    const detailMuseumId = selectedArtifactSearchScope?.museumId ?? museumId
    const { artifact, error } = await fetchArtifactFull({
      backendBaseUrl,
      museumSlug: detailMuseumSlug,
      museumId: detailMuseumId ?? undefined,
      language,
      artifactId: related.artifactId,
    })
    if (!error && artifact) {
      // So substitui se ainda for o mesmo artefacto (utilizador pode ter ja fechado / clicado em outro).
      setSelectedArtifactResult((current) =>
        current && current.artifactId === artifact.artifactId ? artifact : current,
      )
    }
  }

  // ----- Modal: render de uma lista de artefactos relacionados ----- //
  const renderRelatedArtifactsList = (
    artifacts: RelatedArtifact[],
    total: number,
    kind: RelatedArtifactGroupKind,
    entityId: string,
  ) => {
    const groupKey = relatedGroupKey(kind, entityId)
    const isLoading = relatedLoadingKeys.has(groupKey)
    const hasMore = artifacts.length < total
    if (!artifacts.length) {
      return (
        <p className="text-sm text-[#6b5b5f]">{tt('relatedArtifactsEmpty')}</p>
      )
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6d0b1b]">
          <span>{tt('relatedArtifactsHeader')}</span>
          {total > artifacts.length ? (
            <span className="text-[#6b5b5f]">
              {tt('relatedArtifactsMoreCount', { shown: artifacts.length, total })}
            </span>
          ) : null}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2">
          {artifacts.map((art) => {
            const thumbnail = art.images[0]
            const thumbnailUrl = thumbnail ? resolveArtifactImageUrl(thumbnail) : null
            const label =
              art.title ||
              art.inventoryNumber ||
              art.artifactId
            return (
              <article
                key={art.artifactId}
                className="flex w-44 shrink-0 flex-col overflow-hidden rounded-lg border border-[#dfcbc6] bg-white/85 sm:w-48"
              >
                <button
                  type="button"
                  onClick={() => void handleRelatedArtifactClick(art)}
                  className="block min-h-0 flex-1 text-left transition-colors hover:bg-[rgba(255,250,247,0.95)]"
                >
                  <div className="flex h-24 w-full items-center justify-center bg-[#f7efed]">
                    {thumbnailUrl ? (
                      <LoadingImage
                        src={thumbnailUrl}
                        alt={label}
                        wrapperClassName="h-full w-full"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="px-3 text-center text-[11px] font-medium text-[#7b686c]">
                        {tt('imageUnavailable')}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 px-2.5 py-2">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5a2730]">
                      {art.inventoryNumber || art.artifactId}
                    </p>
                    <p className="line-clamp-2 min-h-[2rem] text-xs leading-tight text-[#341d22]">
                      {art.title || tt('artifactNoTitle')}
                    </p>
                    {art.creators.length ? (
                      <p className="truncate text-[11px] text-[#6e5a5f]">
                        {art.creators.join('; ')}
                      </p>
                    ) : null}
                    {art.dateOrPeriod ? (
                      <p className="truncate text-[11px] text-[#6e5a5f]">{art.dateOrPeriod}</p>
                    ) : null}
                  </div>
                </button>
                {art.navigationTarget ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleNavigateToTargetClick(art.navigationTarget!, {
                        artifact: art,
                        queryId: selectedArtifactQueryId,
                        source: 'related_artifact_card',
                        searchScope: selectedArtifactSearchScope,
                      })
                    }
                    disabled={!onNavigateToTarget}
                    className="block w-full border-t border-[#18304a] bg-[#13283f] px-2 py-1 text-[11px] font-semibold text-[#e7f4ff] transition-colors hover:bg-[#183657] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tt('viewInTour')}
                  </button>
                ) : null}
              </article>
            )
          })}
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMoreRelatedArtifacts(kind, entityId)}
              disabled={isLoading}
              aria-label={tt('viewMoreResults')}
              title={tt('viewMoreResults')}
              className="group flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#c7aaa4] bg-[rgba(255,255,255,0.78)] px-2 py-3 text-[#6d0b1b] transition-colors hover:border-[#6d0b1b] hover:bg-white disabled:cursor-wait disabled:opacity-70"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#d7bdb8] bg-[#6d0b1b] text-4xl font-light leading-none text-white shadow-sm transition-transform group-hover:scale-105">
                {isLoading ? (
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                ) : (
                  '+'
                )}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em]">
                {artifacts.length}/{total}
              </span>
            </button>
          ) : null}
        </div>
        {relatedLoadErrors[groupKey] ? (
          <p className="text-[11px] text-[#8a1f2e]">{relatedLoadErrors[groupKey]}</p>
        ) : null}
      </div>
    )
  }

  // ----- Modal: render seccao autor ----- //
  const renderAuthorSection = (context: ArtifactDetailContext) => {
    if (!context.authors.length) return null
    return (
      <section className="rounded-xl border border-[#e2d0cc] bg-white/70 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#6d0b1b] lg:text-sm">
          {tt('relatedAuthors')}
        </p>
        <div className="space-y-3">
          {context.authors.map((author) => {
            const birth = [author.dataNascimento, author.localNascimento].filter(Boolean).join(' — ')
            const death = [author.dataObito, author.localObito].filter(Boolean).join(' — ')
            return (
              <div key={author.entityId} className="space-y-1">
                <p className="text-sm font-semibold text-[#341d22] lg:text-base">{author.name || author.entityId}</p>
                {author.atividade ? (
                  <p className="text-xs text-[#5a2730]">
                    <span className="font-semibold">{tt('authorActivity')}:</span> {author.atividade}
                  </p>
                ) : null}
                {birth ? (
                  <p className="text-xs text-[#5a2730]">
                    <span className="font-semibold">{tt('authorBirth')}:</span> {birth}
                  </p>
                ) : null}
                {death ? (
                  <p className="text-xs text-[#5a2730]">
                    <span className="font-semibold">{tt('authorDeath')}:</span> {death}
                  </p>
                ) : null}
                {typeof author.nObjetos === 'number' ? (
                  <p className="text-[11px] text-[#6e5a5f]">
                    {tt('authorObjectsTotal', { n: author.nObjetos })}
                  </p>
                ) : null}
                {author.biografia ? (
                  <p className="text-xs leading-relaxed text-[#2f1c20]">{author.biografia}</p>
                ) : null}
                {author.url ? (
                  <a
                    href={author.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-[11px] font-semibold text-[#6d0b1b] underline"
                  >
                    {tt('openExternalLink')}
                  </a>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  // ----- Modal: render seccao conjuntos ----- //
  const renderSetsSection = (context: ArtifactDetailContext) => {
    if (!context.sets.length) return null
    return (
      <section className="rounded-xl border border-[#e2d0cc] bg-white/70 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#6d0b1b] lg:text-sm">
          {tt('relatedSets')}
        </p>
        <div className="space-y-4">
          {context.sets.map((set) => (
            <div key={set.entityId} className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-[#341d22] lg:text-base">{set.name || set.entityId}</p>
                {set.numConjunto ? (
                  <p className="text-xs text-[#5a2730]">
                    <span className="font-semibold">{tt('setNumberLabel')}:</span> {set.numConjunto}
                  </p>
                ) : null}
                {set.historial ? (
                  <p className="text-xs text-[#5a2730]">{set.historial}</p>
                ) : null}
                {set.descricao ? (
                  <p className="text-xs leading-relaxed text-[#2f1c20]">{set.descricao}</p>
                ) : null}
                {typeof set.nObjetos === 'number' ? (
                  <p className="text-[11px] text-[#6e5a5f]">
                    {tt('setObjectsTotal', { n: set.nObjetos })}
                  </p>
                ) : null}
              </div>
              {renderRelatedArtifactsList(
                set.artifacts,
                set.nObjetos ?? set.artifactsReturned,
                'conjunto',
                set.entityId,
              )}
            </div>
          ))}
        </div>
      </section>
    )
  }

  // ----- Modal: render seccao exposicoes ----- //
  const renderExhibitionsSection = (context: ArtifactDetailContext) => {
    if (!context.exhibitions.length) return null
    return (
      <section className="rounded-xl border border-[#e2d0cc] bg-white/70 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#6d0b1b] lg:text-sm">
          {tt('relatedExhibitions')}
        </p>
        <div className="space-y-4">
          {context.exhibitions.map((exh: ArtifactExhibitionContext) => {
            const tipoLabel =
              exh.tipoExposicao === 'online'
                ? tt('exhibitionTypeOnline')
                : exh.tipoExposicao === 'fisica'
                  ? tt('exhibitionTypeFisica')
                  : exh.tipoExposicao
            const dates =
              exh.anoInicial && exh.anoFinal && exh.anoFinal !== exh.anoInicial
                ? `${exh.anoInicial}–${exh.anoFinal}`
                : exh.anoInicial || exh.anoFinal || ''
            return (
              <div key={exh.entityId} className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-[#341d22] lg:text-base">{exh.name || exh.entityId}</p>
                  {tipoLabel ? (
                    <p className="text-xs text-[#5a2730]">
                      <span className="font-semibold">{tt('exhibitionType')}:</span> {tipoLabel}
                    </p>
                  ) : null}
                  {exh.local ? (
                    <p className="text-xs text-[#5a2730]">
                      <span className="font-semibold">{tt('exhibitionPlace')}:</span> {exh.local}
                    </p>
                  ) : null}
                  {dates ? (
                    <p className="text-xs text-[#5a2730]">
                      <span className="font-semibold">{tt('exhibitionDates')}:</span> {dates}
                    </p>
                  ) : null}
                  {typeof exh.nObjetos === 'number' ? (
                    <p className="text-[11px] text-[#6e5a5f]">
                      {tt('exhibitionObjectsTotal', { n: exh.nObjetos })}
                    </p>
                  ) : null}
                  {exh.url ? (
                    <a
                      href={exh.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-[11px] font-semibold text-[#6d0b1b] underline"
                    >
                      {tt('openExternalLink')}
                    </a>
                  ) : null}
                </div>
                {renderRelatedArtifactsList(
                  exh.artifacts,
                  exh.nObjetos ?? exh.artifactsReturned,
                  'exposicao',
                  exh.entityId,
                )}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  const renderNavigationTargets = (
    navigationTargets: ChatNavigationTarget[] | undefined,
    imageMatches: ChatImageMatch[] | undefined,
    queryId?: string | null,
    searchScope?: ChatSearchScope | null,
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
      <div className={`${isChatClosing ? 'p360-chat-results-exit' : 'p360-chat-results-enter'} mt-2 rounded-xl border border-[#dfcbc6] bg-white/75 p-2.5`}>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6d0b1b]">
          {tt('tourObjects')}
        </p>
        <div className="space-y-1.5">
          {targetsToRender.map((target, index) => (
            <button
              key={`${target.overlayId}-${target.panoramaKey}-${index}`}
              type="button"
              onClick={() =>
                handleNavigateToTargetClick(target, {
                  queryId: queryId ?? null,
                  source: 'navigation_targets',
                  title: target.title,
                  inventoryNumber: target.inventoryId,
                  searchScope,
                })
              }
              disabled={!onNavigateToTarget}
              className={`${isChatClosing ? 'p360-chat-result-card-exit' : 'p360-chat-result-card'} flex w-full items-center justify-between rounded-lg border border-[#18304a] bg-[#13283f] px-2.5 py-1.5 text-left text-xs text-[#e7f4ff] transition-colors hover:bg-[#183657] disabled:cursor-not-allowed disabled:opacity-60`}
              style={{
                animationDelay: isChatClosing
                  ? `${Math.min((targetsToRender.length - index - 1) * 30, 180)}ms`
                  : `${Math.min(index * 45, 240)}ms`,
              }}
            >
              <span className="min-w-0 pr-2">
                <span className="block truncate font-semibold">
                  {target.inventoryId}
                  {target.title ? ` - ${target.title}` : ''}
                </span>
                {target.location ? (
                  <span className="block truncate text-[11px] text-[#c9e6ff]">{target.location}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-2xl font-semibold text-[#e7f4ff]">{tt('viewInTour')}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (!isOpen) {
    return (
      <div className="absolute bottom-4 left-4 z-[600] flex items-center gap-2">
        <button
          type="button"
          onClick={openChat}
          aria-label={tt('assistant')}
          className="inline-flex h-14 max-w-[48px] items-center justify-center gap-3 rounded-2xl border border-[#5c0a17] bg-[#6d0b1b] px-2 text-base font-semibold text-white shadow-[0_18px_42px_-20px_rgba(63,13,24,1)] transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-[#4f0814] hover:shadow-[0_24px_46px_-22px_rgba(63,13,24,1)] sm:min-w-[250px] sm:px-10 sm:py-3 sm:text-sm"
        >
          <img src={amaliaLogoText} alt="" className="h-full w-full object-contain object-center" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`${isChatClosing ? 'p360-chat-panel-exit' : 'p360-chat-panel-enter'} absolute bottom-4 left-4 z-[600] flex flex-col overflow-hidden rounded-2xl border border-[#dac3be] bg-[rgba(250,245,242,0.95)] shadow-[0_18px_45px_-28px_rgba(35,14,20,1)] backdrop-blur-[1px]`}
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
      <div className="p360-chat-text-scale flex items-start justify-between border-b border-[#d7beb8] bg-[rgba(252,246,244,0.95)] px-3 py-2.5">
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
                onClick={() => handleLanguageChange(option)}
                disabled={isSending}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  language === option
                    ? 'bg-[#6d0b1b] text-white'
                    : 'text-[#5a2730] hover:bg-white'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
          <HeaderActionButton label={tt('newConversation')} onClick={resetConversation}>
            <svg viewBox="0 0 24 24" className="h-5.5 w-5.5" fill="none" aria-hidden="true">
              <path
                d="M5 10a7 7 0 0111.7-3.2L19 9m0-5v5h-5M19 14a7 7 0 01-11.7 3.2L5 15m0 5v-5h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </HeaderActionButton>
          <HeaderActionButton label={tt('close')} onClick={closeChat} variant="danger">
            <CloseIcon />
          </HeaderActionButton>
        </div>
      </div>

      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-3 py-2.5">
        <div className="space-y-2.5">
          {messages.map((message) =>
            message.isCenteredNotice ? (
              <div key={message.id} className="flex min-h-[44vh] items-center justify-center px-4">
                <div className="p360-chat-message-enter max-w-[460px] rounded-2xl border border-[#dec9c4] bg-white/70 px-6 py-5 text-center shadow-[0_20px_40px_-30px_rgba(40,14,20,0.75)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a4b54]">
                    {tt('welcome')}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-[#341d22]">{tt('welcomeTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5f4b50]">{tt('welcomeDescription')}</p>
                </div>
              </div>
            ) : message.role === 'assistant' ? (
              <article key={message.id} className="text-2xl p360-chat-message-enter p360-chat-message-enter-assistant mr-auto max-w-[94%] px-2 py-1 text-[#341d22]">
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
                  {renderSearchScopeNotice(message.searchScope)}
                  {renderImageMatches(
                    message.imageMatches,
                    message.artifactResults,
                    message.navigationTargets,
                    message.queryId,
                    message.searchScope,
                  )}
                  {renderNavigationTargets(message.navigationTargets, message.imageMatches, message.queryId, message.searchScope)}
                </div>
                {message.id === latestAssistantMessageId && message.resultsHasMore ? (
                  <div className="p360-chat-results-enter mt-3">
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreResults(message.id)}
                      disabled={isSending || !conversationId || message.isLoadingMoreResults}
                      className="group inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-[#6d0b1b]/20 bg-[#6d0b1b] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_-20px_rgba(109,11,27,0.85)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#7e1125] hover:shadow-[0_18px_34px_-22px_rgba(109,11,27,0.95)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      {message.isLoadingMoreResults ? (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
                          <path
                            d="M12 3a9 9 0 109 9"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-y-0.5" fill="none" aria-hidden="true">
                          <path
                            d="M12 5v14m0 0l-5-5m5 5l5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {message.isLoadingMoreResults ? tt('loadingMoreResults') : tt('viewMoreResults')}
                    </button>
                    {message.loadMoreResultsError ? (
                      <p className="mt-1 text-[11px] text-[#8a1f2e]">{message.loadMoreResultsError}</p>
                    ) : null}
                  </div>
                ) : null}
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
                ref={(element) => registerMessageElement(message.id, element)}
                className="text-2xl p360-chat-message-enter p360-chat-message-enter-user ml-auto w-fit max-w-[88%] rounded-2xl bg-[rgba(223,208,201,0.96)] px-3 py-2.5 text-md leading-relaxed text-[#2f1f22] shadow-sm"
              >
                {renderUserMessageReference(message.selectedArtifactContext)}
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
                      <LoadingImage
                        src={message.uploadedImageUrl}
                        alt={message.uploadedAssetName || tt('uploadedImageAlt')}
                        wrapperClassName="h-24 w-full"
                        className="h-full w-full object-cover"
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
                          <div className="h-72 w-full">
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
                          className="h-72 w-full"
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
            <article className="p360-chat-text-scale p360-chat-message-enter p360-chat-message-enter-assistant mr-auto max-w-[94%] rounded-xl border border-[#ddc6c2] bg-white/70 px-3 py-2 text-[#341d22]">
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

      <form onSubmit={handleSubmit} className="p360-chat-text-scale border-t border-[#f1dfdb99] p-2.5">
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
        {focusedArtifact ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#6d0b1b]/20 bg-[#fff8f5] px-2.5 py-2 shadow-[0_12px_28px_-26px_rgba(109,11,27,0.85)]">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#6d0b1b]/10 text-[#6d0b1b]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M8 12h8M12 8v8M5.5 5.5h13v10h-5L10 19v-3.5H5.5z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6d0b1b]">
                {tt('artifactContextLabel')}
              </p>
              <p className="truncate text-xs font-semibold text-[#2d1b1f]">
                {[focusedArtifact.inventoryNumber, focusedArtifact.title || focusedArtifact.artifactId]
                  .filter(Boolean)
                  .join(' - ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => clearFocusedArtifact('composer')}
              aria-label={tt('clearArtifactContext')}
              title={tt('clearArtifactContext')}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#c8ada7] bg-white/90 text-[#5a2730] transition-colors hover:border-[#6d0b1b]/45 hover:bg-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
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
              <LoadingImage
                src={selectedImagePreviewUrl}
                alt={selectedUploadFile.name}
                wrapperClassName="mt-2 h-24 w-full rounded-lg"
                className="h-full w-full object-cover"
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
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden="true">
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
            className="h-15 flex-1 rounded-xl border border-[#cbb2ad] bg-white/95 px-3 text-sm text-[#2d1b1f] outline-none transition-colors placeholder:text-[#816c6f] focus:border-[#6d0b1b]"
          />

          {/* <IconButton label={tt('microphoneSoon')} onClick={() => {}}>
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden="true">
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
            aria-label={isSending ? tt('sending') : tt('send')}
            title={isSending ? tt('sending') : tt('send')}
            className="inline-flex h-15 w-15 shrink-0 items-center justify-center rounded-xl bg-[#6d0b1b] text-white shadow-[0_14px_30px_-20px_rgba(109,11,27,0.95)] transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-[#4f0814] hover:shadow-[0_20px_34px_-22px_rgba(109,11,27,1)] disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0"
          >
            {isSending ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
                <path
                  d="M5 12h13M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </form>

      {isDragOverChat ? (
        <div className="p360-chat-text-scale pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-[rgba(18,8,12,0.46)] p-4">
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

      {selectedArtifactResult && portalRoot
        ? createPortal(
            <div
              className={`${isArtifactModalClosing ? 'p360-chat-modal-backdrop-exit' : 'p360-chat-modal-backdrop-enter'} fixed inset-0 z-[1800] flex items-center justify-center bg-[rgba(18,8,12,0.72)] p-4 md:p-6`}
              role="dialog"
              aria-modal="true"
              aria-label={tt('artifactDetailsAria')}
              onClick={closeArtifactModal}
            >
              <article
                className={`${isArtifactModalClosing ? 'p360-chat-modal-card-exit' : 'p360-chat-modal-card-enter'} p360-chat-info-modal-scale flex max-h-[92vh] w-[94vw] max-w-[1580px] flex-col overflow-hidden rounded-2xl border border-[#d8c4be] bg-[rgba(252,246,244,0.98)] shadow-2xl`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between border-b border-[#e3ceca] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6d0b1b] lg:text-sm">
                      {tt('artifactDetails')}
                    </p>
                    <h3 className="break-words text-lg font-semibold text-[#2f1c20] lg:text-2xl">
                      {selectedArtifactResult.title || selectedArtifactResult.inventoryNumber || selectedArtifactResult.artifactId}
                    </h3>
                    <p className="break-words text-sm text-[#6b5b5f] lg:text-base">
                      {selectedArtifactResult.inventoryNumber || selectedArtifactResult.artifactId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeArtifactModal}
                    aria-label={tt('close')}
                    title={tt('close')}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#6d0b1b]/20 bg-[#6d0b1b]/10 text-[#6d0b1b] shadow-[0_12px_24px_-20px_rgba(64,19,28,0.95)] transition-[background-color,border-color,color,transform,box-shadow] hover:-translate-y-0.5 hover:border-[#6d0b1b] hover:bg-[#6d0b1b] hover:text-white hover:shadow-[0_18px_30px_-22px_rgba(64,19,28,1)]"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
                    <div className="min-w-0 space-y-2 rounded-xl border border-[#e2d0cc] bg-white/75 p-3">
                    {([
                      //['artifactId', selectedArtifactResult.artifactId],
                      ['inventory', selectedArtifactResult.inventoryNumber],
                      ['museum', selectedArtifactResult.museum],
                      ['category', selectedArtifactResult.category],
                      ['superCategory', selectedArtifactResult.superCategory],
                      // Mostra todos os autores (creators[]) ou o legado.
                      ['creators',
                        selectedArtifactResult.creators.length
                          ? selectedArtifactResult.creators.join('; ')
                          : selectedArtifactResult.creator],
                      ['dateOrPeriod', selectedArtifactResult.dateOrPeriod],
                      ['supportOrMaterial', selectedArtifactResult.supportOrMaterial],
                      ['technique', selectedArtifactResult.technique],
                      ['productionCenter', selectedArtifactResult.productionCenter],
                      ['incorporation', selectedArtifactResult.incorporation],
                      ['detailType', formatDetailType(selectedArtifactResult.detailType)],
                    ] as Array<[string, string | undefined]>)
                      .filter(([, value]) => Boolean(value))
                      .map(([labelKey, value]) => (
                        <div key={labelKey} className="grid grid-cols-[150px_1fr] gap-2 text-sm lg:grid-cols-[190px_1fr] lg:text-base">
                          <span className="font-semibold text-[#5a2730]">{tt(`artifactField.${labelKey}`)}:</span>
                          <span className="text-[#2f1c20]">{value}</span>
                        </div>
                      ))}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAskAboutSelectedArtifact}
                          className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold text-white shadow-[0_18px_34px_-20px_rgba(109,11,27,0.95)] ring-2 ring-[#6d0b1b]/10 transition-[background-color,border-color,color,transform,box-shadow,ring-color] hover:-translate-y-0.5 hover:shadow-[0_22px_38px_-22px_rgba(109,11,27,1)] focus-visible:outline-none focus-visible:ring-[#6d0b1b]/35 lg:text-base ${
                            focusedArtifact?.artifactId === selectedArtifactResult.artifactId
                              ? 'border-[#4f0814] bg-[#4f0814] hover:bg-[#3f0610]'
                              : 'border-[#6d0b1b] bg-[#6d0b1b] hover:bg-[#4f0814]'
                          }`}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                            <path
                              d="M8 12h8M12 8v8M5.5 5.5h13v10h-5L10 19v-3.5H5.5z"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {focusedArtifact?.artifactId === selectedArtifactResult.artifactId
                            ? tt('artifactContextSelectedAction')
                            : tt('askAboutThisTitle')}
                        </button>
                        {selectedArtifactNavigationTarget && onNavigateToTarget ? (
                          <button
                            type="button"
                            onClick={handleViewSelectedArtifactInTour}
                            className="inline-flex items-center gap-2 rounded-md border border-[#13283f] bg-[#13283f] px-3 py-1.5 text-sm font-semibold text-[#e7f4ff] shadow-[0_10px_24px_-20px_rgba(19,40,63,0.95)] transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-[#183657] hover:shadow-[0_16px_28px_-22px_rgba(19,40,63,1)] lg:text-base"
                          >
                            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
                              <path
                                d="M12 21s6-4.6 6-10a6 6 0 10-12 0c0 5.4 6 10 6 10z"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M12 13a2 2 0 100-4 2 2 0 000 4zM4 20c2.1-1.2 4.6-1.8 8-1.8s5.9.6 8 1.8"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            {tt('viewInTour')}
                          </button>
                        ) : null}
                        {selectedArtifactResult.detailUrl ? (
                          <a
                            href={selectedArtifactResult.detailUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-md border border-[#cfb3ad] bg-white px-3 py-1.5 text-sm font-semibold text-[#6d0b1b] transition-colors hover:bg-[rgba(250,244,242,0.95)] lg:text-base"
                          >
                            {tt('openDetailUrl')}
                          </a>
                        ) : null}
                    </div>

                    {selectedArtifactResult.description ? (
                      <div className="mt-2 rounded-lg bg-[rgba(255,255,255,0.55)] p-2.5">
                        <p className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-[#6d0b1b] lg:text-sm">
                          {tt('artifactDescription')}
                        </p>
                        <p className="text-sm leading-relaxed text-[#2f1c20] lg:text-base">{selectedArtifactResult.description}</p>
                      </div>
                    ) : null}

                    {selectedArtifactResult.originHistory ? (
                      <div className="mt-2 rounded-lg bg-[rgba(255,255,255,0.55)] p-2.5">
                        <p className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-[#6d0b1b] lg:text-sm">
                          {tt('artifactOriginHistory')}
                        </p>
                        <p className="text-sm leading-relaxed text-[#2f1c20] lg:text-base">
                          {selectedArtifactResult.originHistory}
                        </p>
                      </div>
                    ) : null}
                    </div>

                    <div className="min-w-0 space-y-2 rounded-xl border border-[#e2d0cc] bg-white/75 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6d0b1b] lg:text-sm">
                        {tt('artifactImages')} ({selectedArtifactResult.images.length})
                      </p>
                      {selectedArtifactResult.images.length === 0 ? (
                        <p className="text-sm text-[#6b5b5f] lg:text-base">{tt('artifactNoImages')}</p>
                      ) : (
                        renderArtifactImageViewer(selectedArtifactResult.images)
                      )}
                    </div>
                  </div>

                  {/* Seccoes relacionais (full-width sob o grid). Lazy-loaded por useEffect. */}
                  <div className="mt-4 space-y-3 border-t border-[#e3ceca] bg-[rgba(252,246,244,0.6)] pt-4">
                    {isDetailContextLoading ? (
                      <p className="text-sm text-[#6b5b5f]">{tt('relatedLoading')}</p>
                    ) : detailContextError ? (
                      <p className="text-sm text-[#a04050]">{detailContextError}</p>
                    ) : detailContext &&
                      (detailContext.authors.length > 0 ||
                        detailContext.sets.length > 0 ||
                        detailContext.exhibitions.length > 0) ? (
                      <>
                        {renderAuthorSection(detailContext)}
                        {renderSetsSection(detailContext)}
                        {renderExhibitionsSection(detailContext)}
                      </>
                    ) : (
                      <p className="text-sm text-[#6b5b5f]">{tt('relatedEmptyAll')}</p>
                    )}
                  </div>
                </div>
              </article>
            </div>,
            portalRoot,
          )
        : null}

      {lightboxImage && portalRoot
        ? createPortal(
            <div
              className="p360-chat-modal-backdrop-enter fixed inset-0 z-[1900] flex items-center justify-center bg-[rgba(18,8,12,0.78)] p-4"
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
                aria-label={tt('close')}
                title={tt('close')}
                className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/30 bg-black/40 text-white shadow-[0_16px_34px_-22px_rgba(0,0,0,1)] transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-black/60 hover:shadow-[0_22px_38px_-24px_rgba(0,0,0,1)]"
              >
                <CloseIcon />
              </button>
              <div
                className="p360-chat-modal-card-enter"
                onClick={(event) => event.stopPropagation()}
              >
                <LoadingImage
                  src={lightboxImage.src}
                  alt={lightboxImage.alt}
                  wrapperClassName="flex min-h-[220px] min-w-[280px] max-h-[98vh] max-w-[98vw] items-center justify-center rounded-xl border border-white/20 bg-black/20 shadow-2xl"
                  className="h-auto max-h-[98vh] w-auto max-w-[98vw] object-contain"
                />
              </div>
            </div>,
            portalRoot,
          )
        : null}
    </div>
  )
}

export default TourChatWidget
