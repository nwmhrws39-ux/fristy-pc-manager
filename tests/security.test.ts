import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl } from '../src/main/security'

describe('isTrustedRendererUrl', () => {
  const winDir = 'C:\\Users\\Dana\\AppData\\Local\\Programs\\FRISTY PC Manager\\resources\\app.asar\\out\\renderer'
  it('accepts our renderer pages from an install path containing spaces (URL-encoded)', () => {
    expect(isTrustedRendererUrl('file:///C:/Users/Dana/AppData/Local/Programs/FRISTY%20PC%20Manager/resources/app.asar/out/renderer/index.html', winDir, undefined, 'win32')).toBe(true)
    expect(isTrustedRendererUrl('file:///c:/users/dana/appdata/local/programs/fristy%20pc%20manager/resources/app.asar/out/renderer/overlay.html#x', winDir, undefined, 'win32')).toBe(true)
  })
  it('rejects other files, traversal and remote origins', () => {
    expect(isTrustedRendererUrl('file:///C:/Users/Dana/Downloads/evil.html', winDir, undefined, 'win32')).toBe(false)
    expect(isTrustedRendererUrl('file:///C:/Users/Dana/AppData/Local/Programs/FRISTY%20PC%20Manager/resources/app.asar/out/renderer/../../../evil.html', winDir, undefined, 'win32')).toBe(false)
    expect(isTrustedRendererUrl('file:///C:/Users/Dana/AppData/Local/Programs/FRISTY%20PC%20Manager/resources/app.asar/out/renderer-evil/x.html', winDir, undefined, 'win32')).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/index.html', winDir, undefined, 'win32')).toBe(false)
    expect(isTrustedRendererUrl('', winDir, undefined, 'win32')).toBe(false)
  })
  it('works on POSIX paths and in dev-server mode', () => {
    expect(isTrustedRendererUrl('file:///opt/My%20App/out/renderer/index.html', '/opt/My App/out/renderer', undefined, 'linux')).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173/index.html', '/x', 'http://localhost:5173', 'linux')).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:9999/index.html', '/x', 'http://localhost:5173', 'linux')).toBe(false)
  })
})
