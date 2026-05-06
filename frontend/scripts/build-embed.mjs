import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyStaticTours } from './copy-static-tours.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(scriptDir, '..')
const commandEntrypoints = {
  tsc: resolve(frontendRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  vite: resolve(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
}

function run(command, args, env) {
  const entrypoint = commandEntrypoints[command]
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`[build-embed] failed to run ${command}: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const env = {
  ...process.env,
  VITE_ENABLE_DEMO: process.env.VITE_ENABLE_DEMO || 'false',
  VITE_TOURS_BASE_URL: process.env.VITE_TOURS_BASE_URL || '/tours',
}

if (
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.COPY_TOURS === 'false' &&
  !process.env.VITE_TOURS_BASE_URL?.trim()
) {
  console.error('[build-embed] set the VITE_TOURS_BASE_URL GitHub variable or allow COPY_TOURS in CI.')
  process.exit(1)
}

run('tsc', ['-b'], env)
run('vite', ['build'], env)

const toursBaseUrl = env.VITE_TOURS_BASE_URL.trim()
const shouldCopyTours =
  process.env.COPY_TOURS !== 'false' &&
  !/^https?:\/\//i.test(toursBaseUrl) &&
  toursBaseUrl.replace(/\/+$/, '') === '/tours'

if (shouldCopyTours) {
  await copyStaticTours()
} else {
  console.log(`[build-embed] skipped tour copy for VITE_TOURS_BASE_URL=${toursBaseUrl}.`)
}
