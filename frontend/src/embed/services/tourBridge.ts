interface TourContextPayload {
  museumSlug: string
}

// `focus`: o tour vai ao panorama com a câmara virada para o hotspot e
// destaca o ícone (tour-focus-artifact.js), sem abrir a ficha. Sem modo, o
// handler antigo do tour abre a ficha da peça (deep-links, tours antigos).
export type TourNavigationMode = 'focus' | 'open'

interface NavigateToArtifactPayload {
  overlayId: string
  panoramaKey: string
  inventoryId?: string | null
  requestId?: string | null
  mode?: TourNavigationMode
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
      ...(payload.mode === 'focus' ? { mode: 'focus' } : {}),
    },
    targetOrigin,
  )
  return true
}
