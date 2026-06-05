import { isMuseumTourAvailable } from '../../services/museumService'
import type { Museum } from '../../types/museum'

interface MuseumCardProps {
  museum: Museum
  isSelected: boolean
  isVisiting: boolean
  onSelect: (museumSlug: string) => void
  onVisit: (museumSlug: string) => void
}

function MuseumCard({ museum, isSelected, isVisiting, onSelect, onVisit }: MuseumCardProps) {
  const hasTour = isMuseumTourAvailable(museum)
  const imageSrc = museum.image?.src?.trim()
  const imageAlt = museum.image?.alt?.trim() || museum.name

  return (
    <article
      className={[
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-30px_rgba(109,11,27,0.5)]',
        isSelected
          ? 'border-[#6d0b1b] bg-[#f7ecee] shadow-[0_18px_42px_-26px_rgba(109,11,27,0.54)]'
          : 'border-[#ddcac6] bg-[rgba(255,251,248,0.92)]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect(museum.slug)}
        className="block w-full flex-1 px-4 pb-3 pt-4 text-left"
      >
        <div className="aspect-[16/9] overflow-hidden rounded-xl border border-[#dfcbc7] bg-[#efe2df]">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={imageAlt}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#f8f1ee,#e6d4cf)]">
              <span className="rounded-xl border border-white/75 bg-white/72 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#6d0b1b] shadow-sm">
                {museum.slug}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start">
          <span className="rounded-lg border border-[#dfcbc7] bg-white/74 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7670]">
            {museum.slug}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-semibold leading-tight text-[#231815]">
          {museum.name}
        </h3>
        <p
          className="mt-2 text-sm leading-relaxed text-[#6d5c58]"
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
          }}
        >
          {museum.description}
        </p>

        <div className="mt-3 grid gap-1.5 text-xs text-[#6d5c58]">
          <p>{museum.address}</p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
            <span className="text-[#8a7670]">{museum.inaguration_year}</span>
            <span className="h-1 w-1 rounded-full bg-[#cbb4af]" />
            <span className="text-[#6d0b1b]">
              {museum.coordinates.lat.toFixed(4)}, {museum.coordinates.lon.toFixed(4)}
            </span>
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#e2d0cb] bg-white/46 px-4 py-3">
        <button
          type="button"
          onClick={() => onSelect(museum.slug)}
          className="min-h-9 rounded-xl px-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7b6863] transition-colors hover:text-[#6d0b1b]"
        >
          {isSelected && !isVisiting ? 'Selecionado' : 'Ver no mapa'}
        </button>
        <button
          type="button"
          onClick={() => onVisit(museum.slug)}
          disabled={!hasTour}
          className={[
            'min-h-9 rounded-xl px-3 text-xs font-semibold transition-colors',
            !hasTour
              ? 'cursor-not-allowed bg-[#d6c8c4] text-[#6f5f5c]'
              : isVisiting
              ? 'bg-[#4f0814] text-white'
              : 'bg-[#6d0b1b] text-white hover:bg-[#4f0814]',
          ].join(' ')}
        >
          {!hasTour ? 'Visita não disponível' : isVisiting ? 'Visita aberta' : 'Visitar'}
        </button>
      </div>
    </article>
  )
}

export default MuseumCard
