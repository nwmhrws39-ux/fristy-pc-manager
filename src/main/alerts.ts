import type { Settings } from '@shared/settings'
import type { DiskStatic, Snapshot } from '@shared/types'

export interface AlertEvent {
  key: string
  title: string
  body: string
}

const fmtTemp = (c: number, unit: 'C' | 'F') => (unit === 'F' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`)
const BAD_SMART = /fail|bad|predict|caution|warning|degraded/i

/** Pure evaluation with per-key cooldowns so the same alert isn't spammed. */
export class AlertEngine {
  private lastFired = new Map<string, number>()

  evaluate(s: Snapshot, disks: DiskStatic[], cfg: Settings, now = Date.now()): AlertEvent[] {
    const a = cfg.alerts
    if (!a.enabled) return []
    const he = cfg.language === 'he'
    const out: AlertEvent[] = []
    if (a.cpuTemp.enabled && s.cpu.tempC !== null && s.cpu.tempC >= a.cpuTemp.threshold) {
      out.push({ key: 'cpuTemp', title: he ? 'טמפרטורת מעבד גבוהה' : 'High CPU temperature', body: `${fmtTemp(s.cpu.tempC, cfg.tempUnit)} ≥ ${fmtTemp(a.cpuTemp.threshold, cfg.tempUnit)}` })
    }
    if (a.gpuTemp.enabled) {
      for (const g of s.gpus) {
        if (g.tempC !== null && g.tempC >= a.gpuTemp.threshold)
          out.push({ key: `gpuTemp:${g.index}`, title: he ? 'טמפרטורת כרטיס מסך גבוהה' : 'High GPU temperature', body: `${g.name}: ${fmtTemp(g.tempC, cfg.tempUnit)}` })
      }
    }
    if (a.ram.enabled && s.mem.percent >= a.ram.threshold) {
      out.push({ key: 'ram', title: he ? 'שימוש גבוה בזיכרון' : 'High memory usage', body: `${Math.round(s.mem.percent)}% ≥ ${a.ram.threshold}%` })
    }
    if (a.storageLow.enabled) {
      for (const f of s.fs) {
        const freePct = f.size ? (f.available / f.size) * 100 : 100
        if (freePct < a.storageLow.threshold)
          out.push({ key: `storage:${f.mount}`, title: he ? 'שטח אחסון נמוך' : 'Low storage space', body: `${f.mount} — ${freePct.toFixed(1)}% ${he ? 'פנוי' : 'free'}` })
      }
    }
    if (a.storageHealth.enabled) {
      for (const d of disks) {
        if (BAD_SMART.test(d.smartStatus))
          out.push({ key: `health:${d.device || d.name}`, title: he ? 'אזהרת תקינות כונן' : 'Storage health warning', body: `${d.name}: SMART ${d.smartStatus}` })
      }
    }
    const cooldown = a.cooldownMin * 60e3
    return out.filter((e) => {
      const last = this.lastFired.get(e.key)
      if (last !== undefined && now - last < cooldown) return false
      this.lastFired.set(e.key, now)
      return true
    })
  }
}
