import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isWsl = Boolean(process.env.WSL_DISTRO_NAME)
const isProjectOnMountedWindowsFs = process.cwd().startsWith('/mnt/')
const forcePollingInWslMountedFs = isWsl && isProjectOnMountedWindowsFs
const usePolling = process.env.VITE_USE_POLLING === 'true' || forcePollingInWslMountedFs
const pollingInterval = Number(process.env.VITE_POLLING_INTERVAL ?? '300')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    watch: {
      usePolling,
      interval: usePolling ? pollingInterval : undefined,
      ignored: ['**/public/tours/**', '**/public/tours/**/*'],
    },
  },
})
