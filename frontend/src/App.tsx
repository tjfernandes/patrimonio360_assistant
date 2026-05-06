import { Suspense, lazy } from 'react'
import EmbedPage from './embed/pages/EmbedPage'

const DemoPage = lazy(() => import('./demo/pages/DemoPage'))

function App() {
  const pathname = window.location.pathname

  if (pathname.startsWith('/embed')) {
    return <EmbedPage pathname={pathname} />
  }

  return (
    <Suspense fallback={null}>
      <DemoPage />
    </Suspense>
  )
}

export default App
