import type { Museum } from '../../types/museum'

interface MuseumCardProps {
  museum: Museum
  isSelected: boolean
  isVisiting: boolean
  onSelect: (museumSlug: string) => void
  onVisit: (museumSlug: string) => void
}

function MuseumCard({ museum, isSelected, isVisiting, onSelect, onVisit }: MuseumCardProps) {
  return (
    <div
      className={[
        'w-full rounded-2xl border p-4 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_14px_38px_-22px_rgba(109,11,27,0.42)]',
        isSelected
          ? 'border-[#6d0b1b] bg-[#f7ecee] shadow-[0_16px_40px_-24px_rgba(109,11,27,0.5)]'
          : 'border-[#ddcac6] bg-[rgba(255,251,248,0.92)]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect(museum.slug)}
        className="w-full text-left"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7670]">
          {museum.slug}
        </p>
        <h3 className="mt-2 text-base font-semibold leading-tight text-[#231815]">
          {museum.name}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#6d5c58]">{museum.description}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#6d5c58]">{museum.address}</p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a7670]">
          {museum.inaguration_year}
        </p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#6d0b1b]">
          {museum.coordinates.lat.toFixed(4)}, {museum.coordinates.lon.toFixed(4)}
        </p>
      </button>

      {isSelected ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onVisit(museum.slug)}
            className={[
              'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
              isVisiting
                ? 'bg-[#4f0814] text-white'
                : 'bg-[#6d0b1b] text-white hover:bg-[#4f0814]',
            ].join(' ')}
          >
            {isVisiting ? 'Visita aberta' : 'Visitar'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default MuseumCard
