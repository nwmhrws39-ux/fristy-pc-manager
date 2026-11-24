import { describe, expect, it } from 'vitest'
import { Monitor, collectStatic } from '../src/main/monitor'
import { specsToText } from '../src/main/specs'
import { listProcesses, killProcess } from '../src/main/processes'
import type { Snapshot } from '@shared/types'

// Real hardware reads on whatever machine runs the tests (no mocks).
describe('real monitoring on this machine', () => {
  it('collects static info', async () => {
    const s = await collectStatic()
    expect(s.cpu.cores).toBeGreaterThan(0)
    expect(s.cpu.brand.length).toBeGreaterThan(0)
    expect(specsToText(s)).toContain('== Processor ==')
  }, 60000)

  it('produces snapshots with sane values and nulls for missing sensors', async () => {
    const m = new Monitor()
    const snaps: Snapshot[] = []
    m.on('snapshot', (s: Snapshot) => snaps.push(s))
    m.configure(1000, false)
    await new Promise((r) => setTimeout(r, 8000))
    m.stop()
    expect(snaps.length).toBeGreaterThanOrEqual(2)
    const s = snaps[snaps.length - 1]
    expect(s.cpu.load).toBeGreaterThanOrEqual(0)
    expect(s.cpu.load).toBeLessThanOrEqual(100)
    expect(s.cpu.cores.length).toBeGreaterThan(0)
    expect(s.mem.total).toBeGreaterThan(0)
    expect(s.mem.percent).toBeGreaterThan(0)
    expect(s.cpu.tempC === null || (s.cpu.tempC > 0 && s.cpu.tempC < 125)).toBe(true)
    for (const g of s.gpus) expect(g.util === null || (g.util >= 0 && g.util <= 100)).toBe(true)
    expect(s.uptimeSec).toBeGreaterThan(0)
  }, 40000)

  it('lists processes and refuses to kill protected ones', async () => {
    const l = await listProcesses()
    expect(l.length).toBeGreaterThan(0)
    expect(l.find((p) => p.pid === process.pid)?.protected).toBe(true)
    expect(killProcess(process.pid).ok).toBe(false)
    expect(killProcess(999999999).ok).toBe(false)
  }, 30000)
})
