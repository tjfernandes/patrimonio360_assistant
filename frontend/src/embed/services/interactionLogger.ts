import type { ChatLanguage, ChatNavigationTarget } from '../types'

export type FrontendInteractionEventType =
  | 'assistant_opened'
  | 'assistant_closed'
  | 'message_sent'
  | 'answer_received'
  | 'artifact_card_opened'
  | 'see_in_tour_clicked'
  | 'navigation_command_sent'
  | 'navigation_completed'
  | 'tour_location_changed'
  | 'artifact_info_opened'
  | 'artifact_info_closed'
  | 'tour_window_opened'
  | 'tour_window_closed'
  | 'task_started'
  | 'task_completed'
  | 'feedback_clicked'
  | 'error_shown'

export interface FrontendInteractionEvent {
  eventType: FrontendInteractionEventType
  backendBaseUrl?: string
  sessionId: string
  conversationId?: string | null
  queryId?: string | null
  participantId?: string | null
  taskId?: string | null
  tourId?: string | null
  language?: ChatLanguage
  artifactId?: string | null
  inventoryNumber?: string | null
  title?: string | null
  navigationTarget?: Partial<ChatNavigationTarget> | null
  status?: string | null
  source?: string | null
  error?: string | null
  metadata?: Record<string, unknown>
}

function normalizeBackendBaseUrl(baseUrl?: string) {
  return baseUrl?.replace(/\/+$/, '') || null
}

function isSameOriginUrl(url: string) {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

function normalizeNavigationTarget(target?: Partial<ChatNavigationTarget> | null) {
  if (!target) {
    return null
  }
  return {
    panorama_id: target.panoramaKey ?? null,
    overlay_id: target.overlayId ?? null,
    inventory_id: target.inventoryId ?? null,
    location: target.location ?? null,
    title: target.title ?? null,
  }
}

export function createInteractionSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const SESSION_ID_KEY = 'p360_session_id'

export function getOrCreateInteractionSessionId() {
  if (typeof window === 'undefined') {
    return createInteractionSessionId()
  }

  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY)
    if (existing) {
      return existing
    }

    const created = createInteractionSessionId()
    window.sessionStorage.setItem(SESSION_ID_KEY, created)
    return created
  } catch {
    return createInteractionSessionId()
  }
}

export function resetInteractionSessionId() {
  const created = createInteractionSessionId()
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(SESSION_ID_KEY, created)
    } catch {
      // ignore storage failures
    }
  }
  return created
}

export function logFrontendEvent(event: FrontendInteractionEvent) {
  const baseUrl = normalizeBackendBaseUrl(event.backendBaseUrl)
  if (!baseUrl || !event.eventType || !event.sessionId) {
    return
  }

  const payload = {
    event_type: event.eventType,
    timestamp: new Date().toISOString(),
    session_id: event.sessionId,
    conversation_id: event.conversationId ?? null,
    query_id: event.queryId ?? null,
    participant_id: event.participantId ?? null,
    task_id: event.taskId ?? null,
    tour_id: event.tourId ?? null,
    language: event.language ?? null,
    artifact_id: event.artifactId ?? null,
    inventory_number: event.inventoryNumber ?? null,
    title: event.title ?? null,
    navigation_target: normalizeNavigationTarget(event.navigationTarget),
    status: event.status ?? null,
    source: event.source ?? null,
    error: event.error ?? null,
    metadata: event.metadata ?? {},
  }
  const body = JSON.stringify(payload)
  const url = `${baseUrl}/api/v1/logs/events`
  const canUseBeacon = isSameOriginUrl(url)

  try {
    if (
      canUseBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(url, blob)) {
        return
      }
    }
  } catch {
    // fall through to fetch
  }

  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'omit',
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // logging must never interrupt the UI
  }
}
