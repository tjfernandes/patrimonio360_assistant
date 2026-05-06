import { Suspense, lazy } from 'react'
import EmbedPage from './embed/pages/EmbedPage'

const isDemoEnabled = import.meta.env.VITE_ENABLE_DEMO !== 'false'
const DemoPage = isDemoEnabled ? lazy(() => import('./demo/pages/DemoPage')) : null

function App() {
  const pathname = window.location.pathname

  if (pathname.startsWith('/embed')) {
    return <EmbedPage pathname={pathname} />
  }

  if (!DemoPage) {
    return <EmbedPage pathname={pathname} />
  }

  return (
    <Suspense fallback={null}>
      <DemoPage />
    </Suspense>
  )
}

export default App
