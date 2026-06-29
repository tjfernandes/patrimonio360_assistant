interface TourContextPayload {
  museumSlug: string
}

interface NavigateToArtifactPayload {
  overlayId: string
  panoramaKey: string
  inventoryId?: string | null
  requestId?: string | null
}

export function syncTourContext(
  iframe: HTMLIFrameElement | null,
  payload: TourContextPayload,
  targetOrigin: string = '*',
) {
  if (!iframe?.contentWindow) {
    return false
  }

  iframe.contentWindow.postMessage(
    {
      type: 'patrimonio360:tour-context',
      payload,
    },
    targetOrigin,
  )
  return true
}

export function navigateToArtifactInTour(
  iframe: HTMLIFrameElement | null,
  payload: NavigateToArtifactPayload,
  targetOrigin: string = '*',
) {
  if (!iframe?.contentWindow) {
    return false
  }

  iframe.contentWindow.postMessage(
    {
      type: 'navigateToArtifact',
      overlayId: payload.overlayId,
      panoramaKey: payload.panoramaKey,
      inventoryId: payload.inventoryId ?? null,
      requestId: payload.requestId ?? null,
    },
    targetOrigin,
  )
  return true
}
