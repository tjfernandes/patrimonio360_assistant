import { useEffect, useMemo, useState } from 'react'
import MuseumList from '../components/MuseumList'
import MuseumMap from '../components/MuseumMap'
import {
  getMuseumEmbedPath,
  getMuseums,
  isMuseumTourAvailable,
} from '../../services/museumService'
import type { Museum } from '../../types/museum'

function DemoPage() {
  const [museums, setMuseums] = useState<Museum[]>([])
  const [selectedMuseumSlug, setSelectedMuseumSlug] = useState<string | null>(null)
  const [activeTourSlug, setActiveTourSlug] = useState<string | null>(null)
  const [closePopupSignal, setClosePopupSignal] = useState(0)

  useEffect(() => {
    let isMounted = true

    const loadMuseums = async () => {
      const data = await getMuseums()

      if (!isMounted) {
        return
      }

      setMuseums(data)
      setSelectedMuseumSlug((current) =>
        current && data.some((museum) => museum.slug === current) ? current : null,
      )
    }

    void loadMuseums()

    return () => {
      isMounted = false
    }
  }, [])

  const selectedMuseum = useMemo(
    () => museums.find((museum) => museum.slug === selectedMuseumSlug),
    [museums, selectedMuseumSlug],
  )

  const activeTourMuseum = useMemo(
    () => museums.find((museum) => museum.slug === activeTourSlug),
    [museums, activeTourSlug],
  )

  const availableTourCount = useMemo(
    () => museums.filter((museum) => isMuseumTourAvailable(museum)).length,
    [museums],
  )

  const handleVisitMuseum = (museumSlug: string) => {
    const museum = museums.find((item) => item.slug === museumSlug)
    if (!museum || !isMuseumTourAvailable(museum)) {
      return
    }

    setSelectedMuseumSlug(museumSlug)
    setActiveTourSlug(museumSlug)
  }

  const handleSelectMuseumFromList = (museumSlug: string) => {
    setSelectedMuseumSlug(museumSlug)
    setActiveTourSlug(null)
    setClosePopupSignal((current) => current + 1)
  }

  const handleSelectMuseumFromMap = (museumSlug: string) => {
    setSelectedMuseumSlug(museumSlug)
    setActiveTourSlug(null)
  }

  return (
    <main className="min-h-screen px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-10">
      <div className="mx-auto max-w-[1760px] space-y-4">
        <header className="fade-up overflow-hidden rounded-[24px] border border-[#dcc8c2] bg-[linear-gradient(135deg,rgba(255,250,247,0.98),rgba(249,239,235,0.9)_58%,rgba(242,228,218,0.92))] shadow-[0_22px_56px_-42px_rgba(78,16,27,0.48)] backdrop-blur">
          <div className="grid items-center gap-4 px-5 py-4 sm:px-6 sm:py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <div className="max-w-4xl">
              <div className="mb-2 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#d8c2bd] bg-[#fff7f4] font-[Fraunces] text-base font-bold text-[#6d0b1b]">
                  P
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7b6863]">
                    Patrimonio360
                  </p>
                  <p className="text-[11px] font-medium text-[#6d5c58]">Visitas virtuais assistidas</p>
                </div>
              </div>
              <h1 className="font-[Fraunces] text-3xl leading-tight text-[#231815] sm:text-4xl lg:text-5xl">
                Visitas Virtuais a Museus
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f4d49]">
                Explore coleções e espaços museológicos em formato virtual com assistência contextual do modelo
                de inteligência artificial AMALIA.
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <a
                  href="https://amaliallm.pt/"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[#d4bdb8] bg-white/72 px-3 py-1.5 text-xs font-semibold text-[#6d0b1b] transition-colors hover:bg-white"
                >
                  Conhecer o AMALIA
                </a>
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-[#dcc8c2] bg-[rgba(255,250,247,0.72)] p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#dcc8c2] bg-white/70 px-3 py-2">
                  <p className="text-xl font-bold leading-none text-[#231815]">{museums.length}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7b6863]">
                    Museus
                  </p>
                </div>
                <div className="rounded-xl border border-[#dcc8c2] bg-white/70 px-3 py-2">
                  <p className="text-xl font-bold leading-none text-[#231815]">{availableTourCount}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7b6863]">
                    Visitas disponíveis
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-[#dcc8c2] bg-white/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7b6863]">
                  Seleção atual
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-[#231815]">
                  {selectedMuseum?.name ?? 'Nenhum museu selecionado'}
                </p>
                <p className="mt-1 truncate text-[11px] leading-relaxed text-[#6d5c58]">
                  {selectedMuseum
                    ? selectedMuseum.address
                    : 'Selecione um museu na lista ou no mapa para ver detalhes.'}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section
          id="catalogo"
          className="grid gap-4 rounded-[30px] border border-[#dbc7c2] bg-[rgba(255,250,247,0.74)] p-3 shadow-[0_22px_56px_-44px_rgba(59,14,24,0.56)] sm:p-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
        >
          <aside className="h-[78vh] min-h-[640px] rounded-2xl border border-[#e2d0cb] bg-[rgba(255,250,247,0.82)] p-3">
            <MuseumList
              museums={museums}
              selectedMuseumSlug={selectedMuseumSlug}
              visitingMuseumSlug={activeTourSlug}
              onSelectMuseum={handleSelectMuseumFromList}
              onVisitMuseum={handleVisitMuseum}
            />
          </aside>

          <section className="flex h-[78vh] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-[#e2d0cb] bg-[rgba(255,250,247,0.82)] p-3">
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[#d8c3be] bg-white">
              {activeTourMuseum ? (
                <div className="relative h-full">
                  <iframe
                    key={activeTourMuseum.slug}
                    src={getMuseumEmbedPath(activeTourMuseum.slug)}
                    title={`Embed ${activeTourMuseum.name}`}
                    className="block h-full w-full border-0"
                    loading="lazy"
                    allow="fullscreen; xr-spatial-tracking"
                    allowFullScreen
                  />
                </div>
              ) : (
                <MuseumMap
                  museums={museums}
                  selectedMuseumSlug={selectedMuseumSlug}
                  onSelectMuseum={handleSelectMuseumFromMap}
                  onVisitMuseum={handleVisitMuseum}
                  closePopupSignal={closePopupSignal}
                />
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}

export default DemoPage
