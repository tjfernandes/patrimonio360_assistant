import { useEffect, useMemo, useState } from 'react'
import MuseumList from '../components/MuseumList'
import MuseumMap from '../components/MuseumMap'
import {
  getMuseumEmbedPath,
  getMuseums,
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

  const handleVisitMuseum = (museumSlug: string) => {
    setSelectedMuseumSlug(museumSlug)
    setActiveTourSlug(museumSlug)
  }

  const handleSelectMuseumFromList = (museumSlug: string) => {
    setSelectedMuseumSlug(museumSlug)
    setClosePopupSignal((current) => current + 1)
  }

  const handleExitTour = () => {
    setActiveTourSlug(null)
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1680px]">
        <header className="fade-up mb-5 rounded-3xl border border-[#dcc8c2] bg-[linear-gradient(145deg,rgba(255,250,247,0.94),rgba(249,239,235,0.9))] px-5 py-6 shadow-[0_24px_60px_-40px_rgba(78,16,27,0.35)] backdrop-blur sm:px-7">
          <h1 className="mt-2 font-[Fraunces] text-4xl leading-tight text-[#231815] sm:text-5xl">
            Visitas Virtuais a Museus
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#5f4d49] sm:text-base">
            Lista de museus no painel esquerdo e mapa com waypoints no painel direito.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#866d67]">
            {selectedMuseum ? `Selecionado: ${selectedMuseum.name}` : 'Nenhum museu selecionado'}
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1.7fr)]">
          <aside className="h-[74vh] p-2">
            <MuseumList
              museums={museums}
              selectedMuseumSlug={selectedMuseumSlug}
              visitingMuseumSlug={activeTourSlug}
              onSelectMuseum={handleSelectMuseumFromList}
              onVisitMuseum={handleVisitMuseum}
            />
          </aside>

          <div className="h-[75vh] overflow-hidden">
            {activeTourMuseum ? (
              <div className="relative h-full">
                <button
                  type="button"
                  onClick={handleExitTour}
                  className="absolute bottom-4 right-4 z-[500] rounded-xl border border-white/35 bg-[#6d0b1be6] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_16px_40px_-22px_rgba(63,13,24,0.72)] backdrop-blur-sm transition-colors hover:bg-[#4f0814f2]"
                >
                  Voltar ao mapa
                </button>
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
                onSelectMuseum={setSelectedMuseumSlug}
                onVisitMuseum={handleVisitMuseum}
                closePopupSignal={closePopupSignal}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default DemoPage
