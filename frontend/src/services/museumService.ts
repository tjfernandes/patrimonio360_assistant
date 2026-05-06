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

export function getMuseumTourUrl(slug: string): string {
  const configuredBaseUrl = import.meta.env.VITE_TOURS_BASE_URL
  const toursBaseUrl = configuredBaseUrl
    ? normalizeBaseUrl(configuredBaseUrl)
    : '/tours'

  return `${toursBaseUrl}/${toSafeSlugSegment(slug)}/`
}

export function getMuseumEmbedPath(slug: string): string {
  return `/embed/${toSafeSlugSegment(slug)}/`
}
