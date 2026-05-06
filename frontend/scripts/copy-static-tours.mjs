import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = dirname(scriptPath)
const frontendRoot = resolve(scriptDir, '..')
const repoRoot = resolve(frontendRoot, '..')
const defaultSource = resolve(repoRoot, 'tours')
const defaultDestination = resolve(frontendRoot, 'dist', 'tours')

export async function copyStaticTours({
  source = defaultSource,
  destination = defaultDestination,
} = {}) {
  if (!existsSync(source)) {
    console.warn(`[copy-static-tours] skipped: ${source} does not exist.`)
    return false
  }

  const entries = await readdir(source, { withFileTypes: true })
  const tourDirs = entries.filter((entry) => entry.isDirectory())

  if (tourDirs.length === 0) {
    console.warn(`[copy-static-tours] skipped: no tour directories in ${source}.`)
    return false
  }

  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })

  for (const entry of tourDirs) {
    await cp(join(source, entry.name), join(destination, entry.name), {
      recursive: true,
    })
  }

  console.log(`[copy-static-tours] copied ${tourDirs.length} tour directories to ${destination}.`)
  return true
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await copyStaticTours()
}
