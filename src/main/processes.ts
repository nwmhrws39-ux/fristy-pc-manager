import si from 'systeminformation'
import type { ActionResult, ProcessInfo } from '@shared/types'
import { isProtectedProcess } from '@shared/ipc'
import { isWin, runPowerShellJson } from './ps'

let ioCache = new Map<number, number>()
let ioAt = 0
let ioBusy = false

async function refreshIo(): Promise<void> {
  if (!isWin || ioBusy || Date.now() - ioAt < 2500) return
  ioBusy = true
  try {
    const rows = await runPowerShellJson<{ p: number; b: number }[] | { p: number; b: number }>(
      "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ?{ $_.IDProcess -gt 0 } | %{ @{p=[int]$_.IDProcess;b=[double]$_.IODataBytesPersec} })",
      10000
    )
    const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
    ioCache = new Map(arr.map((r) => [r.p, r.b]))
    ioAt = Date.now()
  } catch {
    /* disk column stays N/A */
  } finally {
    ioBusy = false
  }
}

let last: ProcessInfo[] = []

export async function listProcesses(): Promise<ProcessInfo[]> {
  void refreshIo()
  const data = await si.processes()
  const own = process.pid
  last = data.list.map((p) => ({
    pid: p.pid,
    ppid: p.parentPid,
    name: p.name,
    path: p.path && p.name && !/[\\/]$/.test(p.path) && !p.path.toLowerCase().endsWith(p.name.toLowerCase()) ? `${p.path}${isWin ? '\\' : '/'}${p.name}` : p.path || '',
    command: p.command,
    user: p.user,
    cpu: Math.round((p.cpu || 0) * 10) / 10,
    memBytes: (p.memRss || 0) * 1024,
    diskSec: isWin && ioAt ? (ioCache.get(p.pid) ?? 0) : null,
    started: p.started,
    priority: p.priority,
    protected: isProtectedProcess(p.name, p.pid, own)
  }))
  return last
}

export function findProcess(pid: number): ProcessInfo | undefined {
  return last.find((p) => p.pid === pid)
}

export function killProcess(pid: number): ActionResult {
  const p = findProcess(pid)
  if (!p) return { ok: false, error: 'Process not found (it may have already exited).' }
  if (isProtectedProcess(p.name, p.pid, process.pid)) return { ok: false, error: `${p.name} is a protected system process and cannot be ended.` }
  try {
    process.kill(pid)
    return { ok: true }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EPERM') return { ok: false, needsAdmin: true, error: 'Access denied. Administrator rights are required to end this process.' }
    if (code === 'ESRCH') return { ok: true }
    return { ok: false, error: (e as Error).message }
  }
}
