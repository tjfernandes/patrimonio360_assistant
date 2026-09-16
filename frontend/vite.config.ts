import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isWsl = Boolean(process.env.WSL_DISTRO_NAME)
const isProjectOnMountedWindowsFs = process.cwd().startsWith('/mnt/')
const forcePollingInWslMountedFs = isWsl && isProjectOnMountedWindowsFs
const usePolling = process.env.VITE_USE_POLLING === 'true' || forcePollingInWslMountedFs
const pollingInterval = Number(process.env.VITE_POLLING_INTERVAL ?? '300')

// Identificador desta build: vai no URL do iframe do widget (/embed/<museu>/?v=…)
// para o browser nunca reutilizar um index.html do embed em cache com uma
// página nova (aconteceu no Firebase: página nova, widget antigo).
const buildId = Date.now().toString(36)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: '0.0.0.0',
    watch: {
      usePolling,
      interval: usePolling ? pollingInterval : undefined,
      ignored: ['**/public/tours/**', '**/public/tours/**/*'],
    },
  },
})
