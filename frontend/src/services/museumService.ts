import { museumsMock } from '../data/museums'
import type { Museum } from '../types/museum'

// This wrapper keeps the UI decoupled from data source details.
export async function getMuseums(): Promise<Museum[]> {
  return Promise.resolve(museumsMock)
}

export async function getMuseumBySlug(slug: string): Promise<Museum | undefined> {
  const museums = await getMuseums()
  return museums.find((museum) => museum.slug === slug)
}

function toSafeSlugSegment(slug: string): string {
  return encodeURIComponent(slug.trim().toLowerCase())
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function getConfiguredAvailableTourSlugs() {
  const configured = import.meta.env.VITE_AVAILABLE_TOUR_SLUGS?.trim()
  if (!configured) {
    return null
  }

  const slugs = configured
    .split(',')
    .map((item: string) => item.trim().toLowerCase())
    .filter(Boolean)

  return new Set(slugs)
}

const configuredAvailableTourSlugs = getConfiguredAvailableTourSlugs()

export function getMuseumTourUrl(slug: string): string {
  const configuredBaseUrl = import.meta.env.VITE_TOURS_BASE_URL
  const toursBaseUrl = configuredBaseUrl
    ? normalizeBaseUrl(configuredBaseUrl)
    : '/tours'

  return `${toursBaseUrl}/${toSafeSlugSegment(slug)}/`
}

export function getMuseumEmbedPath(slug: string): string {
  const configuredBaseUrl = import.meta.env.VITE_EMBED_BASE_URL?.trim()
  // `v` = identificador da build (vite.config.ts): garante que o iframe do
  // widget carrega a mesma build que a página, mesmo com o index.html do
  // embed em cache no browser. Quem compõe deep-links usa URL.searchParams,
  // pelo que o parâmetro convive com os outros.
  const embedPath = `/embed/${toSafeSlugSegment(slug)}/?v=${encodeURIComponent(__BUILD_ID__)}`

  if (!configuredBaseUrl) {
    return embedPath
  }

  return `${normalizeBaseUrl(configuredBaseUrl)}${embedPath}`
}

export function isMuseumTourAvailable(museum: Museum): boolean {
  if (configuredAvailableTourSlugs) {
    return configuredAvailableTourSlugs.has(museum.slug.toLowerCase())
  }

  return museum.tourAvailable === true
}
