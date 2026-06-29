import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveEmbedLanguage, t } from '../i18n'
import {
  getOrCreateInteractionSessionId,
  logFrontendEvent,
  resetInteractionSessionId,
  type FrontendInteractionEventType,
} from '../services/interactionLogger'
import { navigateToArtifactInTour, syncTourContext } from '../services/tourBridge'
import { getMuseumEmbedPath } from '../../services/museumService'
import type {
  ChatNavigationTarget,
  TourAssistantEmbedProps,
  TourArtifactModalRequest,
  TourNavigationCommandContext,
  TourOpenArtifactContext,
} from '../types'
import TourChatWidget from './TourChatWidget'

const PENDING_NAVIGATION_TTL_MS = 75_000
const ASSISTANT_LOCATION_MATCH_WINDOW_MS = 3_000
const INITIAL_NAVIGATION_RETRY_DELAYS_MS = [
  4_000,
  7_500,
  12_000,
  18_000,
  25_000,
  34_000,
  46_000,
  60_000,
]
const PARTICIPANT_ID_KEY = 'participant_id'
const TASK_ID_KEY = 'task_id'
const TOUR_IFRAME_EVENT_TYPES = new Set([
  'navigation_completed',
  'tour_location_changed',
  'artifact_info_opened',
  'artifact_info_closed',
  'tour_window_opened',
  'tour_window_closed',
])

type RawTourEvent = Record<string, unknown>

interface InitialNavigationCommand {
  target: ChatNavigationTarget
  queryId: string | null
  conversationId: string | null
  artifactId: string | null
  inventoryNumber: string | null
  title: string | null
}

interface PendingNavigationContext {
  queryId: string | null
  conversationId: string | null
  participantId: string | null
  taskId: string | null
  tourId: string | null
  language: TourNavigationCommandContext['language']
  artifactId: string | null
  inventoryNumber: string | null
  title: string | null
  source: string | null
  navigationTarget: ChatNavigationTarget
  createdAt: number
  completedAt?: number
}

interface CurrentOpenArtifactContext {
  inventoryNumber: string | null
  title: string | null
  location: string | null
  queryId: string | null
  conversationId: string | null
  participantId: string | null
  taskId: string | null
  tourId: string | null
  language: TourNavigationCommandContext['language']
  artifactId: string | null
  navigationTarget: Partial<ChatNavigationTarget>
  linkedToAssistantNavigation: boolean
  openedAt: number
}

interface StudyContext {
  participantId: string | null
  taskId: string | null
  studyMode: boolean
}

function resolveTourOrigin(tourUrl: string) {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return new URL(tourUrl, window.location.href).origin
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readEnvFlag(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return false
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return readString(window.sessionStorage.getItem(key))
  } catch {
    return null
  }
}

function writeStoredValue(key: string, value: string | null) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    if (value) {
      window.sessionStorage.setItem(key, value)
      return
    }
    window.sessionStorage.removeItem(key)
  } catch {
    // ignore storage failures
  }
}

function clearStoredStudyContext() {
  writeStoredValue(PARTICIPANT_ID_KEY, null)
  writeStoredValue(TASK_ID_KEY, null)
}

function readInitialStudyContext(): StudyContext {
  if (typeof window === 'undefined') {
    return { participantId: null, taskId: null, studyMode: false }
  }

  const params = new URLSearchParams(window.location.search)
  const urlParticipantId = readString(params.get('participant_id'))
  const urlTaskId = readString(params.get('task_id'))
  const studyMode = params.get('study_mode') === 'true'

  if (urlParticipantId) {
    writeStoredValue(PARTICIPANT_ID_KEY, urlParticipantId)
  }
  if (urlTaskId) {
    writeStoredValue(TASK_ID_KEY, urlTaskId)
  }

  return {
    participantId: urlParticipantId ?? readStoredValue(PARTICIPANT_ID_KEY),
    taskId: urlTaskId ?? readStoredValue(TASK_ID_KEY),
    studyMode,
  }
}

function updateStudyUrl(participantId: string | null, taskId: string | null) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const url = new URL(window.location.href)
    if (participantId) {
      url.searchParams.set('participant_id', participantId)
    } else {
      url.searchParams.delete('participant_id')
    }
    if (taskId) {
      url.searchParams.set('task_id', taskId)
    } else {
      url.searchParams.delete('task_id')
    }
    if (url.searchParams.get('study_mode') === 'true') {
      url.searchParams.set('study_mode', 'true')
    }
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // URL updates are best-effort only.
  }
}

function readInitialNavigationCommand(): InitialNavigationCommand | null {
  if (typeof window === 'undefined') {
    return null
  }
  const params = new URLSearchParams(window.location.search)
  const overlayId = readString(params.get('overlay_id')) || readString(params.get('overlayId'))
  const panoramaKey =
    readString(params.get('panorama_key')) ||
    readString(params.get('panorama_id')) ||
    readString(params.get('panoramaKey'))
  const inventoryId =
    readString(params.get('inventory_id')) ||
    readString(params.get('inventory_number')) ||
    readString(params.get('inventoryId'))
  if (!overlayId || !panoramaKey || !inventoryId) {
    return null
  }
  return {
    target: {
      overlayId,
      panoramaKey,
      inventoryId,
      location: readString(params.get('location')) ?? undefined,
      title: readString(params.get('title')) ?? undefined,
    },
    queryId: readString(params.get('query_id')),
    conversationId: readString(params.get('conversation_id')),
    artifactId: readString(params.get('artifact_id')),
    inventoryNumber: readString(params.get('inventory_number')) || inventoryId,
    title: readString(params.get('title')),
  }
}

function buildCrossMuseumEmbedUrl(
  targetMuseumSlug: string,
  target: ChatNavigationTarget,
  context: TourNavigationCommandContext,
) {
  if (typeof window === 'undefined') {
    return getMuseumEmbedPath(targetMuseumSlug)
  }
  const url = new URL(getMuseumEmbedPath(targetMuseumSlug), window.location.origin)
  url.searchParams.set('panorama_key', target.panoramaKey)
  url.searchParams.set('overlay_id', target.overlayId)
  url.searchParams.set('inventory_id', target.inventoryId)
  url.searchParams.set('source', 'assistant_navigation')
  if (context.sessionId) url.searchParams.set('session_id', context.sessionId)
  if (context.conversationId) url.searchParams.set('conversation_id', context.conversationId)
  if (context.queryId) url.searchParams.set('query_id', context.queryId)
  if (context.participantId) url.searchParams.set('participant_id', context.participantId)
  if (context.taskId) url.searchParams.set('task_id', context.taskId)
  if (context.language) url.searchParams.set('lang', context.language)
  if (context.artifactId) url.searchParams.set('artifact_id', context.artifactId)
  if (context.inventoryNumber) url.searchParams.set('inventory_number', context.inventoryNumber)
  if (context.title) url.searchParams.set('title', context.title)
  if (target.location) url.searchParams.set('location', target.location)
  return url.toString()
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }
  const values = value.map(readString).filter((item): item is string => Boolean(item))
  return values.length ? values : null
}

function readMetadataValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return readString(value)
}

function normalizeInventory(value?: string | null) {
  return value?.trim().toLowerCase() || null
}

function inventoriesMatch(a?: string | null, b?: string | null) {
  const left = normalizeInventory(a)
  const right = normalizeInventory(b)
  return Boolean(left && right && left === right)
}

function isPendingNavigationFresh(pending: PendingNavigationContext | null) {
  return Boolean(pending && Date.now() - pending.createdAt < PENDING_NAVIGATION_TTL_MS)
}

function getTourEventInventory(data: RawTourEvent) {
  const direct =
    readString(data.inventory_number) ||
    readString(data.inventoryId) ||
    readString(data.inventory_id)
  if (direct) {
    return direct
  }

  if (Array.isArray(data.inventoryIds)) {
    return readString(data.inventoryIds[0])
  }

  if (Array.isArray(data.inventory_numbers)) {
    return readString(data.inventory_numbers[0])
  }

  return null
}

function getTourEventInventoryNumbers(data: RawTourEvent) {
  const values = readStringArray(data.inventory_numbers) || readStringArray(data.inventoryIds)
  const direct = getTourEventInventory(data)
  if (values) {
    return values
  }
  return direct ? [direct] : null
}

function pendingNavigationAgeMs(pending: PendingNavigationContext | null) {
  return pending ? Date.now() - pending.createdAt : null
}

function shouldUseOpenArtifactForClose(
  data: RawTourEvent,
  currentOpenArtifact: CurrentOpenArtifactContext | null,
) {
  if (!currentOpenArtifact) {
    return false
  }
  const eventInventory = getTourEventInventory(data)
  return !eventInventory || inventoriesMatch(eventInventory, currentOpenArtifact.inventoryNumber)
}

function shouldAttachPendingNavigation(
  eventType: string,
  data: RawTourEvent,
  pending: PendingNavigationContext | null,
  currentOpenArtifact: CurrentOpenArtifactContext | null,
) {
  if (!isPendingNavigationFresh(pending)) {
    return false
  }

  const eventInventory = getTourEventInventory(data)
  if (eventInventory && !inventoriesMatch(eventInventory, pending?.inventoryNumber)) {
    return false
  }

  if (eventType === 'artifact_info_opened') {
    return inventoriesMatch(eventInventory, pending?.inventoryNumber)
  }

  if (eventType === 'artifact_info_closed') {
    if (inventoriesMatch(eventInventory, pending?.inventoryNumber)) {
      return true
    }
    return Boolean(
      shouldUseOpenArtifactForClose(data, currentOpenArtifact) &&
        currentOpenArtifact?.linkedToAssistantNavigation &&
        inventoriesMatch(currentOpenArtifact.inventoryNumber, pending?.inventoryNumber),
    )
  }

  if (eventType === 'navigation_completed') {
    return readString(data.source) === 'assistant_navigation'
  }

  if (eventType === 'tour_location_changed') {
    const source = readString(data.source)
    if (source === 'assistant_navigation') {
      return true
    }
    return Boolean(
      source === 'playlist_selected_index' &&
        pending &&
        Date.now() - pending.createdAt < ASSISTANT_LOCATION_MATCH_WINDOW_MS,
    )
  }

  if (eventType === 'tour_window_opened' || eventType === 'tour_window_closed') {
    return inventoriesMatch(eventInventory, pending?.inventoryNumber)
  }

  return false
}

function mergeNavigationTarget(
  eventTarget: Partial<ChatNavigationTarget>,
  fallbackTarget?: Partial<ChatNavigationTarget> | null,
) {
  if (!fallbackTarget) {
    return eventTarget
  }
  return {
    panoramaKey: eventTarget.panoramaKey ?? fallbackTarget.panoramaKey,
    overlayId: eventTarget.overlayId ?? fallbackTarget.overlayId,
    inventoryId: eventTarget.inventoryId ?? fallbackTarget.inventoryId,
    location: eventTarget.location ?? fallbackTarget.location,
    title: eventTarget.title ?? fallbackTarget.title,
  }
}

function TourAssistantEmbed({
  museumSlug,
  museumId,
  museumName,
  tourUrl,
  backendBaseUrl,
  initialLanguage = 'pt',
}: TourAssistantEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const pendingNavigationRef = useRef<PendingNavigationContext | null>(null)
  const currentOpenArtifactRef = useRef<CurrentOpenArtifactContext | null>(null)
  const initialNavigationCommandRef = useRef<InitialNavigationCommand | null>(
    readInitialNavigationCommand(),
  )
  const initialNavigationRetryTimersRef = useRef<number[]>([])
  const initialTaskStartedLoggedRef = useRef(false)
  const initialStudyContext = useMemo(() => readInitialStudyContext(), [])
  const [sessionId, setSessionId] = useState(() => getOrCreateInteractionSessionId())
  const [participantId, setParticipantId] = useState<string | null>(
    initialStudyContext.participantId,
  )
  const [taskId, setTaskId] = useState<string | null>(initialStudyContext.taskId)
  const [participantDraft, setParticipantDraft] = useState(initialStudyContext.participantId ?? '')
  const [taskDraft, setTaskDraft] = useState(initialStudyContext.taskId ?? '')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false)
  const [openTourArtifact, setOpenTourArtifact] = useState<TourOpenArtifactContext | null>(null)
  const [tourArtifactModalRequest, setTourArtifactModalRequest] =
    useState<TourArtifactModalRequest | null>(null)
  const language = resolveEmbedLanguage(initialLanguage)
  const tourOrigin = useMemo(() => resolveTourOrigin(tourUrl), [tourUrl])
  const tourTargetOrigin = tourOrigin || '*'
  const showStudyControls = readEnvFlag(import.meta.env.VITE_ENABLE_STUDY_CONTROLS)

  const getFreshPendingNavigation = () => {
    const pending = pendingNavigationRef.current
    if (!pending) {
      return null
    }
    if (!isPendingNavigationFresh(pending)) {
      pendingNavigationRef.current = null
      return null
    }
    return pending
  }

  const clearInitialNavigationRetries = () => {
    initialNavigationRetryTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    initialNavigationRetryTimersRef.current = []
  }

  const logTaskEvent = (
    eventType: 'task_started' | 'task_completed',
    nextTaskId: string,
    status: 'started' | 'completed',
    source: string,
  ) => {
    logFrontendEvent({
      eventType,
      backendBaseUrl,
      sessionId,
      conversationId: null,
      queryId: null,
      participantId,
      taskId: nextTaskId,
      tourId: museumSlug,
      language,
      status,
      source,
    })
  }

  const applyStudyContext = () => {
    const nextParticipantId = readString(participantDraft)
    const nextTaskId = readString(taskDraft)
    const previousTaskId = taskId

    setParticipantId(nextParticipantId)
    setTaskId(nextTaskId)
    writeStoredValue(PARTICIPANT_ID_KEY, nextParticipantId)
    writeStoredValue(TASK_ID_KEY, nextTaskId)
    updateStudyUrl(nextParticipantId, nextTaskId)

    if (previousTaskId !== nextTaskId) {
      pendingNavigationRef.current = null
      currentOpenArtifactRef.current = null
      setOpenTourArtifact(null)
      if (previousTaskId) {
        logTaskEvent('task_completed', previousTaskId, 'completed', 'study_controls')
      }
      if (nextTaskId) {
        logFrontendEvent({
          eventType: 'task_started',
          backendBaseUrl,
          sessionId,
          conversationId: null,
          queryId: null,
          participantId: nextParticipantId,
          taskId: nextTaskId,
          tourId: museumSlug,
          language,
          status: 'started',
          source: 'study_controls',
        })
      }
    }
  }

  const resetStudySession = () => {
    const nextSessionId = resetInteractionSessionId()
    clearStoredStudyContext()
    setSessionId(nextSessionId)
    setParticipantId(null)
    setTaskId(null)
    setParticipantDraft('')
    setTaskDraft('')
    pendingNavigationRef.current = null
    currentOpenArtifactRef.current = null
    setOpenTourArtifact(null)
    updateStudyUrl(null, null)
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => clearInitialNavigationRetries, [])

  useEffect(() => {
    if (initialTaskStartedLoggedRef.current || !taskId) {
      return
    }
    initialTaskStartedLoggedRef.current = true
    logTaskEvent('task_started', taskId, 'started', 'study_initial_context')
    // This intentionally runs once for the initial task context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleTourMessage = (event: MessageEvent<unknown>) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || event.source !== iframeWindow || !tourOrigin) {
        return
      }
      if (event.origin !== tourOrigin) {
        return
      }
      if (!isRecord(event.data)) {
        return
      }

      if (event.data.type === 'selectedArtifacts') {
        const data = event.data as RawTourEvent
        const inventoryNumber = getTourEventInventory(data)
        const eventTitle = readString(data.title)
        const eventLocation = readString(data.location)
        if (inventoryNumber || eventTitle) {
          const navigationTarget: Partial<ChatNavigationTarget> = {
            inventoryId: inventoryNumber ?? undefined,
            title: eventTitle ?? undefined,
            location: eventLocation ?? undefined,
          }
          currentOpenArtifactRef.current = {
            inventoryNumber,
            title: eventTitle,
            location: eventLocation,
            queryId: null,
            conversationId: null,
            participantId,
            taskId,
            tourId: museumSlug,
            language,
            artifactId: null,
            navigationTarget,
            linkedToAssistantNavigation: false,
            openedAt: Date.now(),
          }
          setOpenTourArtifact({
            inventoryNumber,
            title: eventTitle,
            location: eventLocation,
            navigationTarget,
            openedAt: Date.now(),
          })
        }
        return
      }

      if (event.data.type === 'deselectedArtifacts') {
        currentOpenArtifactRef.current = null
        setOpenTourArtifact(null)
        return
      }

      if (event.data.type !== 'tour_event') {
        return
      }
      const eventType = readString(event.data.event_type)
      if (!eventType || !TOUR_IFRAME_EVENT_TYPES.has(eventType)) {
        return
      }

      const data = event.data as RawTourEvent
      const pending = getFreshPendingNavigation()
      const pendingAge = pendingNavigationAgeMs(pending)
      const currentOpenArtifact = currentOpenArtifactRef.current
      const attachPending = shouldAttachPendingNavigation(
        eventType,
        data,
        pending,
        currentOpenArtifact,
      )
      const useOpenArtifactForClose =
        eventType === 'artifact_info_closed' &&
        shouldUseOpenArtifactForClose(data, currentOpenArtifact)
      const openArtifactForClose = useOpenArtifactForClose ? currentOpenArtifact : null
      const linkedToAssistantNavigation =
        attachPending ||
        Boolean(
          eventType === 'artifact_info_closed' &&
            openArtifactForClose?.linkedToAssistantNavigation,
        )
      const panoramaId =
        readString(data.panorama_id) ||
        readString(data.panoramaKey) ||
        undefined
      const overlayId =
        readString(data.overlay_id) ||
        readString(data.overlayId) ||
        undefined
      const eventInventoryNumber = getTourEventInventory(data)
      const eventArtifactId = readString(data.artifact_id) || readString(data.artifactId)
      const inventoryNumber =
        eventInventoryNumber ||
        (attachPending ? pending?.inventoryNumber ?? pending?.navigationTarget.inventoryId : null) ||
        openArtifactForClose?.inventoryNumber ||
        null
      const eventTitle = readString(data.title)
      const eventLocation = readString(data.location)

      let navigationTarget: Partial<ChatNavigationTarget> = {}
      if (eventType === 'tour_location_changed') {
        if (panoramaId) {
          navigationTarget.panoramaKey = panoramaId
        }
        if (eventTitle) {
          navigationTarget.title = eventTitle
        }
      } else if (
        eventType === 'artifact_info_opened' ||
        eventType === 'artifact_info_closed'
      ) {
        if (panoramaId) {
          navigationTarget.panoramaKey = panoramaId
        }
        if (overlayId) {
          navigationTarget.overlayId = overlayId
        }
        if (inventoryNumber) {
          navigationTarget.inventoryId = inventoryNumber
        }
        if (eventLocation) {
          navigationTarget.location = eventLocation
        }
        if (eventTitle) {
          navigationTarget.title = eventTitle
        }
      } else {
        if (panoramaId) {
          navigationTarget.panoramaKey = panoramaId
        }
        if (overlayId) {
          navigationTarget.overlayId = overlayId
        }
        if (inventoryNumber) {
          navigationTarget.inventoryId = inventoryNumber
        }
        if (eventLocation) {
          navigationTarget.location = eventLocation
        }
        if (eventTitle) {
          navigationTarget.title = eventTitle
        }
      }

      if (attachPending && pending) {
        navigationTarget = mergeNavigationTarget(navigationTarget, pending.navigationTarget)
      } else if (openArtifactForClose) {
        navigationTarget = mergeNavigationTarget(navigationTarget, openArtifactForClose.navigationTarget)
      }

      logFrontendEvent({
        eventType: eventType as FrontendInteractionEventType,
        backendBaseUrl,
        sessionId,
        conversationId:
          (attachPending ? pending?.conversationId : openArtifactForClose?.conversationId) ?? null,
        queryId: (attachPending ? pending?.queryId : openArtifactForClose?.queryId) ?? null,
        participantId:
          (attachPending ? pending?.participantId : openArtifactForClose?.participantId) ??
          participantId,
        taskId:
          (attachPending ? pending?.taskId : openArtifactForClose?.taskId) ??
          taskId,
        tourId:
          (attachPending ? pending?.tourId : openArtifactForClose?.tourId) ?? museumSlug,
        language:
          (attachPending ? pending?.language : openArtifactForClose?.language) ?? language,
        artifactId:
          eventArtifactId ||
          (attachPending ? pending?.artifactId : openArtifactForClose?.artifactId) ||
          null,
        inventoryNumber,
        title:
          eventTitle ||
          (attachPending ? pending?.title : openArtifactForClose?.title) ||
          null,
        navigationTarget,
        status: readString(event.data.status) ?? 'reported',
        source: readString(event.data.source) ?? 'tour_iframe',
        error: readString(event.data.error),
        metadata: {
          bridge: 'postMessage',
          iframe_origin: event.origin,
          linked_to_assistant_navigation: linkedToAssistantNavigation,
          pending_navigation_age_ms: pendingAge,
          pending_inventory_number: pending?.inventoryNumber ?? null,
          event_inventory_number: eventInventoryNumber,
          room: readString(data.room),
          previous_room: readString(data.previous_room),
          previous_panorama_id: readString(data.previous_panorama_id),
          previous_title: readString(data.previous_title),
          location_kind: readString(data.location_kind),
          inventory_numbers: getTourEventInventoryNumbers(data),
          text: readString(data.text),
          window_id: readString(data.window_id),
          trigger_source: readString(data.trigger_source),
          detection_method: readString(data.detection_method),
          confidence: readMetadataValue(data.confidence),
        },
      })

      if (eventType === 'navigation_completed' && attachPending && pending) {
        pendingNavigationRef.current = {
          ...pending,
          completedAt: Date.now(),
        }
        clearInitialNavigationRetries()
      }

      if (eventType === 'artifact_info_opened') {
        const openedArtifact: CurrentOpenArtifactContext = {
          inventoryNumber,
          title: eventTitle || (attachPending ? pending?.title ?? null : null),
          location: eventLocation,
          queryId: attachPending ? pending?.queryId ?? null : null,
          conversationId: attachPending ? pending?.conversationId ?? null : null,
          participantId: attachPending ? pending?.participantId ?? participantId : participantId,
          taskId: attachPending ? pending?.taskId ?? taskId : taskId,
          tourId: attachPending ? pending?.tourId ?? museumSlug : museumSlug,
          language: attachPending ? pending?.language ?? language : language,
          artifactId: eventArtifactId || (attachPending ? pending?.artifactId ?? null : null),
          navigationTarget,
          linkedToAssistantNavigation: attachPending,
          openedAt: Date.now(),
        }
        const hasOpenArtifactIdentity = Boolean(
          openedArtifact.artifactId ||
            openedArtifact.inventoryNumber ||
            openedArtifact.title,
        )
        if (hasOpenArtifactIdentity) {
          currentOpenArtifactRef.current = openedArtifact
          setOpenTourArtifact({
            artifactId: openedArtifact.artifactId,
            inventoryNumber: openedArtifact.inventoryNumber,
            title: openedArtifact.title,
            location: openedArtifact.location,
            navigationTarget,
            openedAt: openedArtifact.openedAt,
          })
        }

        if (
          attachPending &&
          pending &&
          inventoriesMatch(inventoryNumber, pending.inventoryNumber)
        ) {
          pendingNavigationRef.current = null
          clearInitialNavigationRetries()
        }
      }

      if (eventType === 'artifact_info_closed') {
        currentOpenArtifactRef.current = null
        setOpenTourArtifact(null)
      }
    }

    window.addEventListener('message', handleTourMessage)
    return () => {
      window.removeEventListener('message', handleTourMessage)
    }
  }, [backendBaseUrl, language, museumSlug, participantId, sessionId, taskId, tourOrigin])

  const handleToggleFullscreen = async () => {
    const node = containerRef.current
    if (!node) {
      return
    }

    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen()
        return
      }

      await node.requestFullscreen()
    } catch {
      // noop
    }
  }

  const handleTourLoad = () => {
    syncTourContext(iframeRef.current, { museumSlug }, tourTargetOrigin)
    const initialCommand = initialNavigationCommandRef.current
    if (!initialCommand || initialNavigationRetryTimersRef.current.length > 0) {
      return
    }
    const context: TourNavigationCommandContext = {
        sessionId,
        conversationId: initialCommand.conversationId,
        queryId: initialCommand.queryId,
        participantId,
        taskId,
        tourId: museumSlug,
        language,
        artifactId: initialCommand.artifactId,
        inventoryNumber: initialCommand.inventoryNumber ?? initialCommand.target.inventoryId,
        title: initialCommand.title ?? initialCommand.target.title ?? null,
        source: 'cross_museum_deep_link',
    }
    const requestId = `deep-link-${Date.now()}`
    pendingNavigationRef.current = {
      queryId: context.queryId ?? null,
      conversationId: context.conversationId ?? null,
      participantId: context.participantId ?? participantId,
      taskId: context.taskId ?? taskId,
      tourId: museumSlug,
      language,
      artifactId: context.artifactId ?? null,
      inventoryNumber: context.inventoryNumber ?? initialCommand.target.inventoryId ?? null,
      title: context.title ?? initialCommand.target.title ?? null,
      source: context.source ?? null,
      navigationTarget: initialCommand.target,
      createdAt: Date.now(),
    }
    INITIAL_NAVIGATION_RETRY_DELAYS_MS.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        navigateToArtifactInTour(
          iframeRef.current,
          {
            overlayId: initialCommand.target.overlayId,
            panoramaKey: initialCommand.target.panoramaKey,
            inventoryId: initialCommand.target.inventoryId,
            requestId,
          },
          tourTargetOrigin,
        )
        if (index === 0) {
          logFrontendEvent({
            eventType: 'navigation_command_sent',
            backendBaseUrl,
            sessionId,
            conversationId: context.conversationId ?? null,
            queryId: context.queryId ?? null,
            participantId,
            taskId,
            tourId: museumSlug,
            language,
            artifactId: context.artifactId ?? null,
            inventoryNumber: context.inventoryNumber ?? initialCommand.target.inventoryId,
            title: context.title ?? initialCommand.target.title ?? null,
            navigationTarget: initialCommand.target,
            status: 'sent',
            source: 'cross_museum_deep_link',
            error: null,
            metadata: {
              post_message_type: 'navigateToArtifact',
              retry_count: INITIAL_NAVIGATION_RETRY_DELAYS_MS.length,
              target_origin: tourTargetOrigin === '*' ? null : tourTargetOrigin,
            },
          })
        }
      }, delay)
      initialNavigationRetryTimersRef.current.push(timer)
    })
  }

  const handleNavigateToTarget = (
    target: ChatNavigationTarget,
    context: TourNavigationCommandContext,
  ) => {
    const targetMuseumSlug = context.targetMuseumSlug?.trim()
    const isCrossMuseumNavigation = Boolean(
      context.isCrossMuseum &&
        targetMuseumSlug &&
        targetMuseumSlug !== museumSlug,
    )
    if (isCrossMuseumNavigation && targetMuseumSlug) {
      let status = 'opened_new_tab'
      let error: string | null = null
      const url = buildCrossMuseumEmbedUrl(targetMuseumSlug, target, {
        ...context,
        sessionId: context.sessionId || sessionId,
        participantId: context.participantId ?? participantId,
        taskId: context.taskId ?? taskId,
        language: context.language ?? language,
      })
      try {
        const opened = window.open(url, '_blank')
        if (!opened) {
          status = 'error'
          error = 'new_tab_blocked'
        } else {
          opened.opener = null
        }
      } catch (err) {
        status = 'error'
        error = err instanceof Error ? err.message : 'open_new_tab_failed'
      }

      logFrontendEvent({
        eventType: 'navigation_command_sent',
        backendBaseUrl,
        sessionId: context.sessionId || sessionId,
        conversationId: context.conversationId ?? null,
        queryId: context.queryId ?? null,
        participantId: context.participantId ?? participantId,
        taskId: context.taskId ?? taskId,
        tourId: targetMuseumSlug,
        language: context.language ?? language,
        artifactId: context.artifactId ?? null,
        inventoryNumber: context.inventoryNumber ?? target.inventoryId,
        title: context.title ?? target.title ?? null,
        navigationTarget: target,
        status,
        source: 'parent_frontend',
        error,
        metadata: {
          click_source: context.source ?? null,
          post_message_type: null,
          open_mode: 'new_tab',
          target_museum_id: context.targetMuseumId ?? null,
          target_museum_slug: targetMuseumSlug,
          target_museum_name: context.targetMuseumName ?? null,
          target_url: url,
        },
      })
      return
    }

    let status = 'sent'
    let error: string | null = null
    try {
      const sent = navigateToArtifactInTour(
        iframeRef.current,
        {
          overlayId: target.overlayId,
          panoramaKey: target.panoramaKey,
          inventoryId: context.inventoryNumber ?? target.inventoryId,
        },
        tourTargetOrigin,
      )
      if (!sent) {
        status = 'not_sent'
        error = 'iframe_unavailable'
      }
    } catch (err) {
      status = 'error'
      error = err instanceof Error ? err.message : 'post_message_failed'
    }

    if (status === 'sent') {
      pendingNavigationRef.current = {
        queryId: context.queryId ?? null,
        conversationId: context.conversationId ?? null,
        participantId: context.participantId ?? participantId,
        taskId: context.taskId ?? taskId,
        tourId: context.tourId ?? museumSlug,
        language: context.language ?? language,
        artifactId: context.artifactId ?? null,
        inventoryNumber: context.inventoryNumber ?? target.inventoryId ?? null,
        title: context.title ?? target.title ?? null,
        source: context.source ?? null,
        navigationTarget: target,
        createdAt: Date.now(),
      }
    }

    logFrontendEvent({
      eventType: 'navigation_command_sent',
      backendBaseUrl,
      sessionId: context.sessionId || sessionId,
      conversationId: context.conversationId ?? null,
      queryId: context.queryId ?? null,
      participantId: context.participantId ?? participantId,
      taskId: context.taskId ?? taskId,
      tourId: context.tourId ?? museumSlug,
      language: context.language ?? language,
      artifactId: context.artifactId ?? null,
      inventoryNumber: context.inventoryNumber ?? target.inventoryId,
      title: context.title ?? target.title ?? null,
      navigationTarget: target,
      status,
      source: 'parent_frontend',
      error,
      metadata: {
        click_source: context.source ?? null,
        post_message_type: 'navigateToArtifact',
        target_origin: tourTargetOrigin === '*' ? null : tourTargetOrigin,
        target_museum_id: context.targetMuseumId ?? null,
        target_museum_slug: context.targetMuseumSlug ?? museumSlug,
        target_museum_name: context.targetMuseumName ?? museumName,
      },
    })
  }

  const handleAssistantClosed = () => {
    pendingNavigationRef.current = null
  }

  const handleOpenTourArtifactModal = () => {
    if (!openTourArtifact) {
      return
    }
    setTourArtifactModalRequest({
      ...openTourArtifact,
      requestId: `tour-info-window-${Date.now()}`,
      source: 'tour_info_window_button',
    })
    setIsChatWidgetOpen(true)
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden rounded-2xl border border-[#d4b2b6] bg-white"
    >
      <iframe
        ref={iframeRef}
        key={`tour-${museumSlug}`}
        src={tourUrl}
        title={`${t(language, 'assistantEmbed.virtualTour')} ${museumName}`}
        className="h-full w-full border-0"
        loading="lazy"
        allow="fullscreen; xr-spatial-tracking"
        allowFullScreen
        onLoad={handleTourLoad}
      />

      <button
        type="button"
        onClick={handleToggleFullscreen}
        aria-label={t(language, isFullscreen ? 'assistantEmbed.exitFullscreen' : 'assistantEmbed.enterFullscreen')}
        title={t(language, isFullscreen ? 'assistantEmbed.exitFullscreen' : 'assistantEmbed.enterFullscreen')}
        className="p360-tour-fullscreen-mask absolute z-[550] rounded-2xl border border-transparent bg-transparent focus-visible:border-white/80 focus-visible:bg-[#6d0b1b]/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <span className="sr-only">
          {t(language, isFullscreen ? 'assistantEmbed.exitFullscreen' : 'assistantEmbed.enterFullscreen')}
        </span>
      </button>

      {showStudyControls ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            applyStudyContext()
          }}
          className="absolute left-3 top-3 z-[560] w-[min(290px,calc(100%-1.5rem))] rounded-md border border-[#d8c8c3]/70 bg-white/75 p-1.5 text-[10px] text-[#4f3a3f] opacity-80 shadow-[0_10px_26px_-24px_rgba(0,0,0,0.75)] backdrop-blur-sm transition-opacity hover:opacity-100 focus-within:opacity-100"
        >
          <div className="flex flex-wrap items-end gap-1.5">
            <label className="flex w-24 flex-col gap-0.5 font-medium">
              <span className="text-[8px] uppercase tracking-[0.08em] text-[#6d5a5f]">
                Participant
              </span>
              <input
                value={participantDraft}
                onChange={(event) => setParticipantDraft(event.target.value)}
                className="h-6 rounded border border-[#cbb2ad]/80 bg-white/90 px-1.5 font-mono text-[11px] font-normal outline-none focus:border-[#6d0b1b]"
                placeholder="P03"
              />
            </label>
            <label className="flex w-20 flex-col gap-0.5 font-medium">
              <span className="text-[8px] uppercase tracking-[0.08em] text-[#6d5a5f]">
                Task
              </span>
              <input
                value={taskDraft}
                onChange={(event) => setTaskDraft(event.target.value)}
                list="p360-study-task-options"
                className="h-6 rounded border border-[#cbb2ad]/80 bg-white/90 px-1.5 font-mono text-[11px] font-normal outline-none focus:border-[#6d0b1b]"
                placeholder="T01"
              />
              <datalist id="p360-study-task-options">
                <option value="T01" />
                <option value="T02" />
                <option value="T03" />
              </datalist>
            </label>
            <button
              type="submit"
              className="h-6 rounded bg-[#6d0b1b]/85 px-2 text-[10px] font-semibold text-white transition-colors hover:bg-[#4f0814]"
            >
              Set
            </button>
            <button
              type="button"
              onClick={resetStudySession}
              className="h-6 rounded border border-[#cbb2ad]/80 bg-white/80 px-2 text-[10px] font-medium text-[#5a2730] transition-colors hover:bg-white"
            >
              Reset
            </button>
          </div>
          <div
            title={sessionId}
            className="mt-1 truncate border-t border-[#d8c8c3]/55 pt-0.5 font-mono text-[8px] leading-none text-[#6f6064]/70"
          >
            session {sessionId}
          </div>
        </form>
      ) : null}

      {openTourArtifact && !isChatWidgetOpen ? (
        <button
          type="button"
          onClick={handleOpenTourArtifactModal}
          aria-label={t(language, 'assistantEmbed.openArtifactDetailsTitle')}
          title={t(language, 'assistantEmbed.openArtifactDetailsTitle')}
          className="p360-tour-artifact-focus-button absolute bottom-4 left-20 z-[610] inline-flex h-14 max-w-[calc(100%-6rem)] items-center gap-2 rounded-2xl border border-[#6d0b1b]/25 bg-white/95 px-2.5 text-[#5a2730] shadow-[0_18px_42px_-22px_rgba(63,13,24,0.95)] backdrop-blur-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#6d0b1b]/45 hover:bg-white hover:shadow-[0_24px_48px_-24px_rgba(63,13,24,1)] sm:left-[17.5rem] sm:max-w-[360px] sm:px-3"
        >
          <span className="p360-tour-artifact-focus-pulse absolute -inset-1 rounded-[1.15rem] border border-[#6d0b1b]/25" />
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#6d0b1b] text-white shadow-[0_12px_24px_-18px_rgba(109,11,27,0.95)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 10.5V16M12 7.75h.01"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="relative flex min-w-0 flex-col text-left leading-tight">
            <span className="truncate text-xs font-bold text-[#2d1b1f] sm:text-sm">
              {[openTourArtifact.inventoryNumber, openTourArtifact.title]
                .filter(Boolean)
                .join(' - ') || t(language, 'assistantEmbed.openTourArtifact')}
            </span>
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[#6d0b1b]">
              {t(language, 'assistantEmbed.openArtifactDetails')}
            </span>
          </span>
        </button>
      ) : null}

      <TourChatWidget
        key={`chat-${museumSlug}`}
        museumName={museumName}
        museumSlug={museumSlug}
        museumId={museumId}
        backendBaseUrl={backendBaseUrl}
        initialLanguage={initialLanguage}
        sessionId={sessionId}
        participantId={participantId}
        taskId={taskId}
        onNavigateToTarget={handleNavigateToTarget}
        onAssistantClosed={handleAssistantClosed}
        onOpenChange={setIsChatWidgetOpen}
        externalArtifactModalRequest={tourArtifactModalRequest}
      />
    </div>
  )
}

export default TourAssistantEmbed
