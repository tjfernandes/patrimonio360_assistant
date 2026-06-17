import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveEmbedLanguage, t } from '../i18n'
import {
  getOrCreateInteractionSessionId,
  logFrontendEvent,
  resetInteractionSessionId,
  type FrontendInteractionEventType,
} from '../services/interactionLogger'
import { navigateToArtifactInTour, syncTourContext } from '../services/tourBridge'
import type {
  ChatNavigationTarget,
  TourAssistantEmbedProps,
  TourNavigationCommandContext,
} from '../types'
import TourChatWidget from './TourChatWidget'

const PENDING_NAVIGATION_TTL_MS = 15_000
const ASSISTANT_LOCATION_MATCH_WINDOW_MS = 3_000
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
  const direct = readString(data.inventory_number) || readString(data.inventoryId)
  if (direct) {
    return direct
  }

  if (Array.isArray(data.inventory_numbers)) {
    return readString(data.inventory_numbers[0])
  }

  return null
}

function getTourEventInventoryNumbers(data: RawTourEvent) {
  const values = readStringArray(data.inventory_numbers)
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
  const language = resolveEmbedLanguage(initialLanguage)
  const tourOrigin = useMemo(() => resolveTourOrigin(tourUrl), [tourUrl])
  const tourTargetOrigin = tourOrigin || '*'
  const showStudyControls = initialStudyContext.studyMode || import.meta.env.DEV

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
      if (!isRecord(event.data) || event.data.type !== 'tour_event') {
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
          (attachPending ? pending?.artifactId : openArtifactForClose?.artifactId) ?? null,
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
      }

      if (eventType === 'artifact_info_opened') {
        currentOpenArtifactRef.current = {
          inventoryNumber,
          title: eventTitle || (attachPending ? pending?.title ?? null : null),
          location: eventLocation,
          queryId: attachPending ? pending?.queryId ?? null : null,
          conversationId: attachPending ? pending?.conversationId ?? null : null,
          participantId: attachPending ? pending?.participantId ?? participantId : participantId,
          taskId: attachPending ? pending?.taskId ?? taskId : taskId,
          tourId: attachPending ? pending?.tourId ?? museumSlug : museumSlug,
          language: attachPending ? pending?.language ?? language : language,
          artifactId: attachPending ? pending?.artifactId ?? null : null,
          navigationTarget,
          linkedToAssistantNavigation: attachPending,
          openedAt: Date.now(),
        }

        if (
          attachPending &&
          pending &&
          inventoriesMatch(inventoryNumber, pending.inventoryNumber)
        ) {
          pendingNavigationRef.current = null
        }
      }

      if (eventType === 'artifact_info_closed') {
        currentOpenArtifactRef.current = null
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
  }

  const handleNavigateToTarget = (
    target: ChatNavigationTarget,
    context: TourNavigationCommandContext,
  ) => {
    let status = 'sent'
    let error: string | null = null
    try {
      const sent = navigateToArtifactInTour(
        iframeRef.current,
        {
          overlayId: target.overlayId,
          panoramaKey: target.panoramaKey,
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
      },
    })
  }

  const handleAssistantClosed = () => {
    pendingNavigationRef.current = null
    currentOpenArtifactRef.current = null
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
      />
    </div>
  )
}

export default TourAssistantEmbed
