import { isMuseumTourAvailable } from '../../services/museumService'
import type { Museum } from '../../types/museum'

interface MuseumCardProps {
  museum: Museum
  isSelected: boolean
  isVisiting: boolean
  isCompact: boolean
  onSelect: (museumSlug: string) => void
  onVisit: (museumSlug: string) => void
}

function MuseumCard({
  museum,
  isSelected,
  isVisiting,
  isCompact,
  onSelect,
  onVisit,
}: MuseumCardProps) {
  const hasTour = isMuseumTourAvailable(museum)
  const imageSrc = museum.image?.src?.trim()
  const imageAlt = museum.image?.alt?.trim() || museum.name

  return (
    <article
      className={[
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-30px_rgba(109,11,27,0.5)]',
        isVisiting
          ? 'border-[#6d0b1b] bg-[#fff4f5] shadow-[0_22px_52px_-26px_rgba(109,11,27,0.62)] ring-2 ring-[#6d0b1b] ring-offset-2 ring-offset-[#fffaf7]'
          : isSelected
          ? 'border-[#6d0b1b] bg-[#f7ecee] shadow-[0_18px_42px_-26px_rgba(109,11,27,0.54)]'
          : 'border-[#ddcac6] bg-[rgba(255,251,248,0.92)]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect(museum.slug)}
        className={[
          'w-full flex-1 text-left',
          isCompact
            ? 'p-3 sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3'
            : 'block px-4 pb-3 pt-4',
        ].join(' ')}
      >
        <div
          className={[
            'overflow-hidden rounded-xl border bg-[#efe2df]',
            isVisiting ? 'border-[#6d0b1b]' : 'border-[#dfcbc7]',
            isCompact ? 'aspect-[16/9] sm:aspect-auto sm:h-32' : 'aspect-[16/9]',
          ].join(' ')}
        >
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

        <div className={isCompact ? 'min-w-0 sm:pt-0' : undefined}>
          <div
            className={[
              'flex flex-wrap items-start gap-2',
              isCompact ? 'mt-3 sm:mt-0' : 'mt-3',
            ].join(' ')}
          >
            <span className="max-w-full rounded-lg border border-[#dfcbc7] bg-white/74 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7670]">
              {museum.slug}
            </span>
            {isVisiting ? (
              <span className="rounded-lg border border-[#6d0b1b] bg-[#6d0b1b] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                Visita aberta
              </span>
            ) : null}
          </div>

          <h3
            className={[
              'font-semibold leading-tight text-[#231815]',
              isCompact ? 'mt-2 text-base' : 'mt-3 text-lg',
            ].join(' ')}
          >
            {museum.name}
          </h3>
          <p
            className={[
              'mt-2 leading-relaxed text-[#6d5c58]',
              isCompact ? 'text-xs' : 'text-sm',
            ].join(' ')}
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: isCompact ? 2 : 3,
              overflow: 'hidden',
            }}
          >
            {museum.description}
          </p>

          <div
            className={[
              'mt-3 grid gap-1.5 text-[#6d5c58]',
              isCompact ? 'text-[11px]' : 'text-xs',
            ].join(' ')}
          >
            <p className={isCompact ? 'truncate' : undefined}>{museum.address}</p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
              <span className="text-[#8a7670]">{museum.inaguration_year}</span>
              <span className="h-1 w-1 rounded-full bg-[#cbb4af]" />
              <span className="text-[#6d0b1b]">
                {museum.coordinates.lat.toFixed(4)}, {museum.coordinates.lon.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      </button>

      <div
        className={[
          'flex shrink-0 items-center justify-between gap-3 border-t border-[#e2d0cb] bg-white/58',
          isCompact ? 'px-3 py-2' : 'px-4 py-3',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => onSelect(museum.slug)}
          className={[
            'rounded-xl px-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7b6863] transition-colors hover:text-[#6d0b1b]',
            isCompact ? 'min-h-8' : 'min-h-9',
          ].join(' ')}
        >
          {isSelected && !isVisiting ? 'Selecionado' : 'Ver no mapa'}
        </button>
        <button
          type="button"
          onClick={() => onVisit(museum.slug)}
          disabled={!hasTour}
          className={[
            'rounded-xl font-semibold transition-colors',
            isCompact ? 'min-h-8 px-2.5 text-[11px]' : 'min-h-9 px-3 text-xs',
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
