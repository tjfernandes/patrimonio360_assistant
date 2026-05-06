import { useMemo, useState } from 'react'
import { isMuseumTourAvailable } from '../../services/museumService'
import type { Museum } from '../../types/museum'
import MuseumCard from './MuseumCard'

interface MuseumListProps {
  museums: Museum[]
  selectedMuseumSlug: string | null
  visitingMuseumSlug: string | null
  onSelectMuseum: (museumSlug: string) => void
  onVisitMuseum: (museumSlug: string) => void
}

type TourFilter = 'all' | 'available' | 'unavailable'

const filters: Array<{ value: TourFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Com visita' },
  { value: 'unavailable', label: 'Sem visita' },
]

function MuseumList({
  museums,
  selectedMuseumSlug,
  visitingMuseumSlug,
  onSelectMuseum,
  onVisitMuseum,
}: MuseumListProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TourFilter>('all')

  const filteredMuseums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return museums.filter((museum) => {
      const hasTour = isMuseumTourAvailable(museum)
      if (filter === 'available' && !hasTour) {
        return false
      }
      if (filter === 'unavailable' && hasTour) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [
        museum.name,
        museum.slug,
        museum.address,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [filter, museums, query])

  if (museums.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#cdaeb1] bg-[rgba(255,250,247,0.74)] p-5 text-sm text-[#6d5c58]">
        Ainda sem museus para mostrar.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b6863]">
              Catálogo
            </p>
            <h2 className="font-[Fraunces] text-3xl leading-tight text-[#231815]">Museus</h2>
          </div>
          <span className="rounded-full border border-[#d6c0bc] bg-[#fff7f4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d0b1b]">
            {filteredMuseums.length} locais
          </span>
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Pesquisar museus</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar por museu, sigla ou morada"
            className="h-11 w-full rounded-xl border border-[#d9c5c0] bg-white/85 px-3 text-sm text-[#231815] outline-none transition-colors placeholder:text-[#8a7670] focus:border-[#6d0b1b]"
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl border border-[#d9c5c0] bg-white/64 p-1">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={[
                'min-h-9 rounded-lg px-2 text-[11px] font-semibold transition-colors',
                filter === item.value
                  ? 'bg-[#6d0b1b] text-white'
                  : 'text-[#6d0b1b] hover:bg-white',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 py-1">
        {filteredMuseums.length > 0 ? (
          filteredMuseums.map((museum, index) => (
            <div
              key={museum.slug}
              className="card-enter"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <MuseumCard
                museum={museum}
                isSelected={selectedMuseumSlug === museum.slug}
                isVisiting={visitingMuseumSlug === museum.slug}
                onSelect={onSelectMuseum}
                onVisit={onVisitMuseum}
              />
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-[#d7c0bc] bg-white/58 p-5 text-sm text-[#6d5c58]">
            Nenhum museu corresponde à pesquisa atual.
          </div>
        )}
      </div>
    </div>
  )
}

export default MuseumList
