import { useEffect, useState } from 'react'
import { resolveEmbedLanguage, t } from '../i18n'
import TourAssistantEmbed from '../components/TourAssistantEmbed'
import { getChatBackendBaseUrl } from '../services/embedConfig'
import {
  getMuseumBySlug,
  getMuseumTourUrl,
} from '../../services/museumService'
import type { Museum } from '../../types/museum'

interface EmbedPageProps {
  pathname: string
}

function getMuseumSlugFromPathname(pathname: string) {
  const parts = pathname
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)

  if (parts[0] !== 'embed' || !parts[1]) {
    return null
  }

  return decodeURIComponent(parts[1])
}

function getLanguageFromSearch(search: string) {
  const value = new URLSearchParams(search).get('lang')?.trim().toLowerCase()
  return resolveEmbedLanguage(value)
}

function EmbedPage({ pathname }: EmbedPageProps) {
  const [museum, setMuseum] = useState<Museum | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const museumSlug = getMuseumSlugFromPathname(pathname)
  const language =
    typeof window === 'undefined' ? resolveEmbedLanguage('pt') : getLanguageFromSearch(window.location.search)

  useEffect(() => {
    let isMounted = true

    const loadMuseum = async () => {
      if (!museumSlug) {
        setMuseum(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const nextMuseum = await getMuseumBySlug(museumSlug)

      if (!isMounted) {
        return
      }

      setMuseum(nextMuseum ?? null)
      setIsLoading(false)
    }

    void loadMuseum()

    return () => {
      isMounted = false
    }
  }, [museumSlug])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="rounded-3xl border border-[#dcc8c2] bg-[rgba(255,250,247,0.92)] px-6 py-5 text-sm text-[#6d5c58] shadow-[0_24px_60px_-42px_rgba(78,16,27,0.24)]">
          {t(language, 'embedPage.loading')}
        </div>
      </main>
    )
  }

  if (!museumSlug || !museum) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-3xl border border-[#dcc8c2] bg-[rgba(255,250,247,0.92)] px-6 py-5 text-sm text-[#6d5c58] shadow-[0_24px_60px_-42px_rgba(78,16,27,0.24)]">
          {t(language, 'embedPage.invalid')}
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen">
      <div className="h-full w-full">
        <TourAssistantEmbed
          museumSlug={museum.slug}
          museumId={museum.slug}
          museumName={museum.name}
          tourUrl={getMuseumTourUrl(museum.slug)}
          backendBaseUrl={getChatBackendBaseUrl()}
          initialLanguage={language}
        />
      </div>
    </main>
  )
}

export default EmbedPage
