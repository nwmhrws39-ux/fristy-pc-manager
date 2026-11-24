import path from 'path'
import { fileURLToPath } from 'url'

/**
 * True when `frameUrl` is one of our own renderer pages. Uses fileURLToPath so install folders with
 * spaces or non-ASCII characters (URL-encoded in the frame URL) are compared correctly.
 */
export function isTrustedRendererUrl(frameUrl: string, rendererDir: string, devServerUrl?: string, platform: string = process.platform): boolean {
  if (!frameUrl) return false
  if (devServerUrl) {
    try {
      return new URL(frameUrl).origin === new URL(devServerUrl).origin
    } catch {
      return false
    }
  }
  if (!frameUrl.startsWith('file:')) return false
  let p: string
  try {
    p = fileURLToPath(frameUrl.split('#')[0].split('?')[0], { windows: platform === 'win32' })
  } catch {
    return false
  }
  const P = platform === 'win32' ? path.win32 : path.posix
  const norm = (x: string) => (platform === 'win32' ? P.normalize(x).toLowerCase() : P.normalize(x))
  const dir = norm(rendererDir)
  const file = norm(p)
  return file.startsWith(dir.endsWith(P.sep) ? dir : dir + P.sep)
}
