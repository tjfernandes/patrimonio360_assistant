import { useEffect, useMemo, useRef } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { divIcon } from 'leaflet'
import type {
  LatLngBoundsExpression,
  Marker as LeafletMarker,
  Popup as LeafletPopup,
} from 'leaflet'
import { isMuseumTourAvailable } from '../../services/museumService'
import type { Museum } from '../../types/museum'

interface MuseumMapProps {
  museums: Museum[]
  selectedMuseumSlug: string | null
  onSelectMuseum: (museumSlug: string) => void
  onVisitMuseum: (museumSlug: string) => void
  closePopupSignal: number
}

interface MapViewportControllerProps {
  selectedMuseum: Museum | undefined
}

const PORTUGAL_MAINLAND_BOUNDS: LatLngBoundsExpression = [
  [36.85, -9.75],
  [42.16, -6.15],
]
const PORTUGAL_FIT_PADDING: [number, number] = [18, 18]
const SELECTED_MUSEUM_ZOOM = 12

function getMuseumMarkerIcon(isSelected: boolean) {
  const size = isSelected
    ? { width: 42, height: 54, iconAnchorX: 21, iconAnchorY: 52, popupAnchorY: -42 }
    : { width: 36, height: 46, iconAnchorX: 18, iconAnchorY: 44, popupAnchorY: -36 }
  const pinColor = isSelected ? '#4f0814' : '#6d0b1b'

  return divIcon({
    className: 'museum-waypoint-icon',
    iconSize: [size.width, size.height],
    iconAnchor: [size.iconAnchorX, size.iconAnchorY],
    popupAnchor: [0, size.popupAnchorY],
    html: `
      <div style="filter: drop-shadow(0 3px 3px rgba(30,10,15,0.35));">
        <svg width="${size.width}" height="${size.height}" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M18 1.5C8.89 1.5 1.5 8.89 1.5 18c0 11.61 12.78 24.18 15.19 26.43a1.9 1.9 0 0 0 2.62 0C21.72 42.18 34.5 29.61 34.5 18 34.5 8.89 27.11 1.5 18 1.5Z" fill="${pinColor}" />
          <path d="M12 15.6 18 12l6 3.6M13.5 15.9v6.8M17 15.9v6.8M19 15.9v6.8M22.5 15.9v6.8M11.5 23.4h13" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `,
  })
}

function MapViewportController({ selectedMuseum }: MapViewportControllerProps) {
  const map = useMap()
  const selectedMuseumSlug = selectedMuseum?.slug

  useEffect(() => {
    map.invalidateSize()
    if (selectedMuseum) {
      map.flyTo(
        [selectedMuseum.coordinates.lat, selectedMuseum.coordinates.lon],
        SELECTED_MUSEUM_ZOOM,
        {
          animate: true,
          duration: 0.65,
        },
      )
      return
    }

    map.fitBounds(PORTUGAL_MAINLAND_BOUNDS, {
      animate: true,
      padding: PORTUGAL_FIT_PADDING,
    })
  }, [map, selectedMuseum, selectedMuseumSlug])

  return null
}

function MuseumMap({
  museums,
  selectedMuseumSlug,
  onSelectMuseum,
  onVisitMuseum,
  closePopupSignal,
}: MuseumMapProps) {
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({})
  const popupRefs = useRef<Record<string, LeafletPopup | null>>({})
  const selectedMuseum = useMemo(
    () => museums.find((museum) => museum.slug === selectedMuseumSlug),
    [museums, selectedMuseumSlug],
  )

  useEffect(() => {
    if (closePopupSignal === 0) {
      return
    }

    museums.forEach((museum) => {
      if (museum.slug === selectedMuseumSlug) {
        return
      }

      popupRefs.current[museum.museum_id]?.remove()
    })
  }, [closePopupSignal, museums, selectedMuseumSlug])

  useEffect(() => {
    if (!selectedMuseum) {
      return
    }

    const timer = window.setTimeout(() => {
      markerRefs.current[selectedMuseum.museum_id]?.openPopup()
    }, 680)

    return () => {
      window.clearTimeout(timer)
    }
  }, [selectedMuseum])

  return (
    <MapContainer
      bounds={PORTUGAL_MAINLAND_BOUNDS}
      boundsOptions={{ padding: PORTUGAL_FIT_PADDING }}
      scrollWheelZoom
      attributionControl={false}
      className="h-full w-full rounded-3xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {museums.map((museum) => {
        const isSelected = museum.slug === selectedMuseumSlug
        const hasTour = isMuseumTourAvailable(museum)
        const imageSrc = museum.image?.src?.trim()
        const imageAlt = museum.image?.alt?.trim() || museum.name

        return (
          <Marker
            key={museum.museum_id}
            position={[museum.coordinates.lat, museum.coordinates.lon]}
            icon={getMuseumMarkerIcon(isSelected)}
            eventHandlers={{ click: () => onSelectMuseum(museum.slug) }}
            ref={(instance) => {
              markerRefs.current[museum.museum_id] = instance
            }}
          >
            <Popup
              ref={(instance) => {
                popupRefs.current[museum.museum_id] = instance
              }}
            >
              <div className="min-w-72 max-w-80 p-1">
                <div className="aspect-[16/9] overflow-hidden rounded-xl border border-[#dfcbc7] bg-[#efe2df]">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={imageAlt}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="h-full w-full bg-[linear-gradient(135deg,#f8f1ee,#e6d4cf)]"
                      role="img"
                      aria-label={imageAlt}
                    />
                  )}
                </div>
                <p className="mt-3 text-base font-semibold leading-tight text-[#231815]">
                  {museum.name}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-[#6d5c58]">{museum.address}</p>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onVisitMuseum(museum.slug)}
                    disabled={!hasTour}
                    className={[
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      hasTour
                        ? 'bg-[#6d0b1b] text-white hover:bg-[#4f0814]'
                        : 'cursor-not-allowed bg-[#d6c8c4] text-[#6f5f5c]',
                    ].join(' ')}
                  >
                    {hasTour ? 'Visitar' : 'Visita não disponível'}
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}

      <MapViewportController selectedMuseum={selectedMuseum} />
    </MapContainer>
  )
}

export default MuseumMap
