interface TourContextPayload {
  museumSlug: string
}

interface NavigateToArtifactPayload {
  overlayId: string
  panoramaKey: string
}

export function syncTourContext(
  iframe: HTMLIFrameElement | null,
  payload: TourContextPayload,
) {
  if (!iframe?.contentWindow) {
    return
  }

  iframe.contentWindow.postMessage(
    {
      type: 'patrimonio360:tour-context',
      payload,
    },
    '*',
  )
}

export function navigateToArtifactInTour(
  iframe: HTMLIFrameElement | null,
  payload: NavigateToArtifactPayload,
) {
  if (!iframe?.contentWindow) {
    return
  }

  iframe.contentWindow.postMessage(
    {
      type: 'navigateToArtifact',
      overlayId: payload.overlayId,
      panoramaKey: payload.panoramaKey,
    },
    '*',
  )
}
