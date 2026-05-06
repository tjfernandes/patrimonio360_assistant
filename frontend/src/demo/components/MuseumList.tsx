import type { Museum } from '../../types/museum'
import MuseumCard from './MuseumCard'

interface MuseumListProps {
  museums: Museum[]
  selectedMuseumSlug: string | null
  visitingMuseumSlug: string | null
  onSelectMuseum: (museumSlug: string) => void
  onVisitMuseum: (museumSlug: string) => void
}

function MuseumList({
  museums,
  selectedMuseumSlug,
  visitingMuseumSlug,
  onSelectMuseum,
  onVisitMuseum,
}: MuseumListProps) {
  if (museums.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#cdaeb1] bg-[rgba(255,250,247,0.74)] p-5 text-sm text-[#6d5c58]">
        Ainda sem museus para mostrar.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[Fraunces] text-2xl text-[#231815]">Museus</h2>
        <span className="rounded-full border border-[#d6c0bc] bg-[#fff7f4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d0b1b]">
          {museums.length} locais
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1 py-1">
        {museums.map((museum, index) => (
          <div
            key={museum.slug}
            className="card-enter"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <MuseumCard
              museum={museum}
              isSelected={selectedMuseumSlug === museum.slug}
              isVisiting={visitingMuseumSlug === museum.slug}
              onSelect={onSelectMuseum}
              onVisit={onVisitMuseum}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default MuseumList
