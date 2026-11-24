import { execFile } from 'child_process'
import { existsSync } from 'fs'
import type { Num } from '@shared/types'

export interface NvidiaGpu {
  index: number
  name: string
  util: Num
  tempC: Num
  vramUsedMB: Num
  vramTotalMB: Num
  coreClockMHz: Num
  memClockMHz: Num
  fanPercent: Num
  powerW: Num
  driver: string
}

const FIELDS = 'index,name,utilization.gpu,temperature.gpu,memory.used,memory.total,clocks.gr,clocks.mem,fan.speed,power.draw,driver_version'

const toNum = (s: string | undefined): Num => {
  if (s === undefined) return null
  const t = s.trim()
  if (!t || /N\/A|Not Supported|Unknown|ERR/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function parseNvidiaSmi(csv: string): NvidiaGpu[] {
  return csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((x) => x.trim()))
    .filter((c) => c.length >= 11 && toNum(c[0]) !== null)
    .map((c) => ({
      index: toNum(c[0]) as number,
      name: c[1],
      util: toNum(c[2]),
      tempC: toNum(c[3]),
      vramUsedMB: toNum(c[4]),
      vramTotalMB: toNum(c[5]),
      coreClockMHz: toNum(c[6]),
      memClockMHz: toNum(c[7]),
      fanPercent: toNum(c[8]),
      powerW: toNum(c[9]),
      driver: c[10]
    }))
}

let smiPath: string | null | undefined

function findSmi(): string | null {
  if (smiPath !== undefined) return smiPath
  const candidates =
    process.platform === 'win32'
      ? [
          `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\nvidia-smi.exe`,
          `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe`
        ]
      : ['/usr/bin/nvidia-smi', '/usr/local/bin/nvidia-smi']
  smiPath = candidates.find((p) => existsSync(p)) ?? null
  return smiPath
}

let failures = 0

/** Query all NVIDIA GPUs. Returns [] when no NVIDIA driver/tool is present. */
export function queryNvidia(): Promise<NvidiaGpu[]> {
  const exe = findSmi()
  if (!exe || failures > 5) return Promise.resolve([])
  return new Promise((resolve) => {
    execFile(exe, [`--query-gpu=${FIELDS}`, '--format=csv,noheader,nounits'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
      if (err) {
        failures++
        return resolve([])
      }
      failures = 0
      resolve(parseNvidiaSmi(stdout))
    })
  })
}
