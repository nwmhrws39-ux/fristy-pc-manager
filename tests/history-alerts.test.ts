import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { HistoryStore } from '../src/main/history'
import { AlertEngine } from '../src/main/alerts'
import { DEFAULT_SETTINGS, sanitizeSettings } from '@shared/settings'
import type { Snapshot } from '@shared/types'

const wasm = require.resolve('sql.js/dist/sql-wasm.wasm')

function snap(ts: number, cpu: number, cpuTemp: number | null, gpuUtil: number | null = null): Snapshot {
  return {
    ts, cpu: { load: cpu, cores: [], speedMHz: null, tempC: cpuTemp, powerW: null },
    gpus: gpuUtil === null ? [] : [{ index: 0, name: 'G', vendor: 'NVIDIA', util: gpuUtil, tempC: 70, vramUsedMB: 1, vramTotalMB: 2, coreClockMHz: null, memClockMHz: null, fanPercent: null, fanRpm: null, powerW: null, source: 'nvidia-smi' }],
    mem: { total: 100, used: 50, available: 50, percent: 50, swapTotal: 0, swapUsed: 0 },
    disksIo: [], fs: [{ mount: 'C:', label: 'C:', type: 'NTFS', size: 1000, used: 960, available: 40, percent: 96 }],
    net: [{ iface: 'eth', rxSec: 1000, txSec: 500, rxTotal: 1, txTotal: 1, operstate: 'up' }],
    fans: [], uptimeSec: 10, powerW: null, sensorSource: 'none', fps: null, storageTemps: []
  }
}

describe('HistoryStore (SQLite via sql.js)', () => {
  it('aggregates per minute, queries, computes stats, exports CSV, persists and reloads', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fristy-h-'))
    const file = path.join(dir, 'h.sqlite')
    const h = new HistoryStore(file, wasm)
    await h.open()
    const t0 = Math.floor(Date.now() / 60e3) * 60e3 - 10 * 60e3
    h.record(snap(t0 + 1000, 10, 50, 20))
    h.record(snap(t0 + 2000, 30, null, 40)) // null temp is skipped, not averaged as 0
    h.record(snap(t0 + 61000, 50, 60)) // new minute -> previous flushed
    h.record(snap(t0 + 122000, 0, 0)) // flush second minute
    const rows = h.query('hour')
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({ cpu: 20, cpuMax: 30, cpuTemp: 50, gpu: 30, gpuMax: 40, ram: 50, rx: 1000 })
    expect(rows[1].gpu).toBeNull()
    const stats = h.stats('hour')
    expect(stats.find((s) => s.metric === 'cpu')).toEqual({ metric: 'cpu', avg: 35, max: 50 })
    const csv = h.toCsv('hour')
    expect(csv.split('\r\n')[0]).toMatch(/^timestamp,cpu_avg_pct/)
    expect(csv.split('\r\n')[2]).toMatch(/,,/) // missing GPU => empty cell, not 0
    h.close()
    const h2 = new HistoryStore(file, wasm)
    await h2.open()
    expect(h2.count()).toBe(3)
    h2.close()
  })
  it('prunes by retention and compacts old rows to 10-minute resolution', async () => {
    const h = new HistoryStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fristy-p-')), 'h.sqlite'), wasm)
    await h.open()
    const now = Date.now()
    const base = Math.floor((now - 5 * 86400e3) / 600e3) * 600e3
    for (let i = 0; i <= 10; i++) h.record(snap(base + i * 60e3, i * 10, 40))
    h.record(snap(now - 40 * 86400e3, 99, 99))
    h.record(snap(now - 40 * 86400e3 + 120e3, 99, 99))
    h.prune(30, now)
    const rows = h.query('week', now)
    expect(rows.every((r) => r.cpu !== 99)).toBe(true)
    expect(h.count()).toBeLessThanOrEqual(2)
    expect(h.stats('week', now).find((s) => s.metric === 'cpu')?.max).toBe(100)
    h.close()
  })
  it('recovers from a corrupt database file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fristy-c-'))
    const file = path.join(dir, 'h.sqlite')
    fs.writeFileSync(file, 'definitely not sqlite')
    const h = new HistoryStore(file, wasm)
    await h.open()
    expect(h.count()).toBe(0)
    expect(fs.readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true)
    h.close()
  })
})

describe('AlertEngine', () => {
  it('fires on thresholds, respects cooldown, and ignores N/A readings', () => {
    const e = new AlertEngine()
    const cfg = sanitizeSettings({ alerts: { cpuTemp: { threshold: 80 }, cooldownMin: 10 } })
    const t = 1_000_000
    const a1 = e.evaluate(snap(t, 10, 85), [], cfg, t)
    expect(a1.map((a) => a.key).sort()).toEqual(['cpuTemp', 'storage:C:'])
    expect(e.evaluate(snap(t, 10, 90), [], cfg, t + 60e3)).toEqual([])
    expect(e.evaluate(snap(t, 10, 90), [], cfg, t + 11 * 60e3).length).toBe(2)
    expect(new AlertEngine().evaluate(snap(t, 10, null), [], { ...cfg, alerts: { ...cfg.alerts, storageLow: { enabled: false, threshold: 10 } } }, t)).toEqual([])
  })
  it('warns on SMART failures and can be disabled globally', () => {
    const disk = { device: 'd0', name: 'Old HDD', vendor: '', type: 'HDD' as const, interfaceType: 'SATA', size: 1, serial: '', firmware: '', smartStatus: 'Predicted Failure', temperatureC: null, powerOnHours: null }
    expect(new AlertEngine().evaluate(snap(0, 0, null), [disk], DEFAULT_SETTINGS, 0).some((a) => a.key === 'health:d0')).toBe(true)
    expect(new AlertEngine().evaluate(snap(0, 0, 100), [disk], sanitizeSettings({ alerts: { enabled: false } }), 0)).toEqual([])
  })
})
