import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { basename } from 'path'
import type { Num } from '@shared/types'

/**
 * FPS via Intel PresentMon (ETW tracing of Present() events). It does not inject into game
 * processes and is not an anti-cheat bypass. Requires admin or the "Performance Log Users" group.
 * Without a configured PresentMon executable FPS is reported as N/A.
 */
export class FpsMonitor {
  private child: ChildProcessWithoutNullStreams | null = null
  private cols: { app: number; ms: number } | null = null
  private window: { t: number; app: string; ms: number }[] = []
  private buf = ''
  status: 'off' | 'running' | 'error' = 'off'
  error = ''
  app = ''
  private path = ''

  start(exePath: string): void {
    if (process.platform !== 'win32' || !exePath) return this.stop()
    if (this.child && exePath === this.path) return
    this.stop()
    if (!existsSync(exePath) || !/^presentmon.*\.exe$/i.test(basename(exePath))) {
      this.status = 'error'
      this.error = 'PresentMon executable not found'
      return
    }
    this.path = exePath
    this.launch(['--output_stdout', '--stop_existing_session', '--no_console_stats', '--session_name', 'FristyPM', '--exclude', 'dwm.exe'], true)
  }

  private launch(args: string[], allowFallback: boolean): void {
    const startedAt = Date.now()
    this.cols = null
    this.buf = ''
    const child = spawn(this.path, args, { windowsHide: true })
    this.child = child
    this.status = 'running'
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d: string) => this.onData(d))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d: string) => (this.error = d.slice(0, 300)))
    child.on('exit', () => {
      if (this.child !== child) return
      this.child = null
      // PresentMon 1.x uses single-dash options; retry once with those if 2.x syntax was rejected.
      if (allowFallback && Date.now() - startedAt < 3000) {
        return this.launch(['-output_stdout', '-stop_existing_session', '-no_top', '-session_name', 'FristyPM', '-exclude', 'dwm.exe'], false)
      }
      this.status = 'error'
      if (!this.error) this.error = 'PresentMon exited (administrator rights may be required)'
    })
    child.on('error', (e) => {
      this.status = 'error'
      this.error = e.message
    })
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
    for (const r of recent) byApp.set(r.app, [...(byApp.get(r.app) ?? []), r.ms])
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
    this.status = 'off'
    this.window = []
    if (c) c.kill()
  }
}
