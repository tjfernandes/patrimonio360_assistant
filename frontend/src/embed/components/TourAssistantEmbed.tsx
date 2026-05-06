import { useEffect, useRef, useState } from 'react'
import { resolveEmbedLanguage, t } from '../i18n'
import { navigateToArtifactInTour, syncTourContext } from '../services/tourBridge'
import type { ChatNavigationTarget, TourAssistantEmbedProps } from '../types'
import TourChatWidget from './TourChatWidget'

function TourAssistantEmbed({
  museumSlug,
  museumId,
  museumName,
  tourUrl,
  backendBaseUrl,
  initialLanguage = 'pt',
  fullscreenButtonClassName = 'right-3 top-3',
}: TourAssistantEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const language = resolveEmbedLanguage(initialLanguage)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

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
    syncTourContext(iframeRef.current, { museumSlug })
  }

  const handleNavigateToTarget = (target: ChatNavigationTarget) => {
    navigateToArtifactInTour(iframeRef.current, {
      overlayId: target.overlayId,
      panoramaKey: target.panoramaKey,
    })
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden rounded-2xl border border-[#d4b2b6] bg-white"
    >
      <button
        type="button"
        onClick={handleToggleFullscreen}
        className={`absolute z-[500] rounded-lg border border-[#d4b2b6] bg-white/92 px-3 py-2 text-xs font-semibold text-[#4f0814] transition-colors hover:bg-white ${fullscreenButtonClassName}`}
      >
        {isFullscreen ? t(language, 'assistantEmbed.exitFullscreen') : t(language, 'assistantEmbed.enterFullscreen')}
      </button>

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

      <TourChatWidget
        key={`chat-${museumSlug}`}
        museumName={museumName}
        museumSlug={museumSlug}
        museumId={museumId}
        backendBaseUrl={backendBaseUrl}
        initialLanguage={initialLanguage}
        onNavigateToTarget={handleNavigateToTarget}
      />
    </div>
  )
}

export default TourAssistantEmbed
