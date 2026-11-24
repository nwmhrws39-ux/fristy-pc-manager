import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { Num } from '@shared/types'

export type FpsCode = 'off' | 'running' | 'not-found' | 'gui-app' | 'needs-admin' | 'failed'

export const PRESENTMON_RELEASES = 'https://github.com/GameTechDev/PresentMon/releases'

/** The Intel PresentMon *GUI* install (PresentMonApplication) cannot stream CSV; only the console build can. */
export function isPresentMonGui(p: string): boolean {
  return /[\\/]PresentMonApplication([\\/]|$)/i.test(p)
}

/**
 * Turn whatever the user typed (exe path, or a folder) into the PresentMon console executable.
 * `listDir`/`isFile` are injected so this stays unit-testable.
 */
export function resolvePresentMonPath(input: string, isFile: (p: string) => boolean, listDir: (p: string) => string[] | null): { ok: boolean; path: string; code?: FpsCode } {
  const raw = input.trim().replace(/^"(.*)"$/, '$1')
  if (!raw) return { ok: true, path: '' }
  if (isPresentMonGui(raw)) return { ok: false, path: '', code: 'gui-app' }
  if (/\.exe$/i.test(raw)) {
    if (!/^presentmon[^\\/]*\.exe$/i.test(path.win32.basename(raw)) || !isFile(raw)) return { ok: false, path: '', code: 'not-found' }
    return { ok: true, path: raw }
  }
  const files = listDir(raw)
  if (!files) return { ok: false, path: '', code: 'not-found' }
  const hit = files
    .filter((f) => /^presentmon.*\.exe$/i.test(f) && !/service|capture|application/i.test(f))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
  return hit ? { ok: true, path: path.win32.join(raw, hit) } : { ok: false, path: '', code: 'not-found' }
}

export function resolvePresentMonOnDisk(input: string) {
  return resolvePresentMonPath(
    input,
    (p) => {
      try {
        return fs.statSync(p).isFile()
      } catch {
        return false
      }
    },
    (p) => {
      try {
        return fs.statSync(p).isDirectory() ? fs.readdirSync(p) : null
      } catch {
        return null
      }
    }
  )
}

/**
 * FPS via the Intel PresentMon console app (ETW tracing of Present() events). It does not inject into
 * games and is not an anti-cheat bypass. ETW tracing requires administrator rights.
 */
export class FpsMonitor {
  private child: ChildProcessWithoutNullStreams | null = null
  private cols: { app: number; ms: number } | null = null
  private window: { t: number; app: string; ms: number }[] = []
  private buf = ''
  private path = ''
  code: FpsCode = 'off'
  error = ''
  app = ''

  get status(): 'off' | 'running' | 'error' {
    return this.code === 'off' ? 'off' : this.code === 'running' ? 'running' : 'error'
  }

  start(exePath: string, isAdmin: boolean): void {
    if (process.platform !== 'win32' || !exePath) return this.stop()
    if (this.child && exePath === this.path) return
    this.stop()
    this.path = exePath
    if (isPresentMonGui(exePath)) return this.fail('gui-app', '')
    const r = resolvePresentMonOnDisk(exePath)
    if (!r.ok) return this.fail(r.code ?? 'not-found', '')
    if (!isAdmin) return this.fail('needs-admin', '')
    this.launch(r.path, ['--output_stdout', '--stop_existing_session', '--no_console_stats', '--session_name', 'FristyPM', '--exclude', 'dwm.exe'], true)
  }

  private fail(code: FpsCode, error: string): void {
    this.code = code
    this.error = error
  }

  private launch(exe: string, args: string[], allowV1Fallback: boolean): void {
    this.cols = null
    this.buf = ''
    this.error = ''
    const child = spawn(exe, args, { windowsHide: true })
    this.child = child
    this.code = 'running'
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d: string) => this.onData(d))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d: string) => (this.error = (this.error + d).slice(-400)))
    child.on('exit', () => {
      if (this.child !== child) return
      this.child = null
      // PresentMon 1.x uses single-dash options; only retry when the 2.x syntax itself was rejected.
      if (allowV1Fallback && /unrecogni|invalid (option|argument)|unknown (option|argument)/i.test(this.error)) {
        return this.launch(exe, ['-output_stdout', '-stop_existing_session', '-no_top', '-session_name', 'FristyPM', '-exclude', 'dwm.exe'], false)
      }
      this.code = /access|denied|privilege|elevat/i.test(this.error) ? 'needs-admin' : 'failed'
      if (!this.error) this.error = 'PresentMon exited'
    })
    child.on('error', (e) => this.fail('failed', e.message))
  }

  private onData(d: string): void {
    this.buf += d
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (!line) continue
      const cells = line.split(',')
      if (!this.cols) {
        const lower = cells.map((c) => c.trim().toLowerCase())
        const app = lower.findIndex((c) => c === 'application' || c === 'processname')
        const ms = lower.findIndex((c) => c === 'msbetweenpresents' || c === 'frametime' || c === 'msbetweendisplaychange')
        if (app >= 0 && ms >= 0) this.cols = { app, ms }
        continue
      }
      const ms = Number(cells[this.cols.ms])
      if (Number.isFinite(ms) && ms > 0) this.window.push({ t: Date.now(), app: cells[this.cols.app], ms })
    }
    if (this.buf.length > 1 << 20) this.buf = ''
    const cutoff = Date.now() - 1500
    if (this.window.length > 5000 || (this.window[0] && this.window[0].t < cutoff)) this.window = this.window.filter((w) => w.t >= cutoff)
  }

  /** Average FPS of the application presenting the most frames over the last ~1.5 s. */
  current(): Num {
    if (!this.child) return null
    const cutoff = Date.now() - 1500
    const recent = this.window.filter((w) => w.t >= cutoff)
    if (!recent.length) return null
    const byApp = new Map<string, number[]>()
    for (const r of recent) {
      const arr = byApp.get(r.app) ?? []
      arr.push(r.ms)
      byApp.set(r.app, arr)
    }
    let best: [string, number[]] | null = null
    for (const e of byApp) if (!best || e[1].length > best[1].length) best = e
    if (!best) return null
    this.app = best[0]
    const avg = best[1].reduce((a, b) => a + b, 0) / best[1].length
    return avg > 0 ? Math.round(1000 / avg) : null
  }

  stop(): void {
    const c = this.child
    this.child = null
    this.code = 'off'
    this.error = ''
    this.app = ''
    this.window = []
    if (c) c.kill()
  }
}
