export type Lang = 'en' | 'he'
export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Threshold {
  enabled: boolean
  threshold: number
}

export interface Settings {
  language: Lang
  theme: 'dark' | 'light'
  accent: string
  tempUnit: 'C' | 'F'
  refreshMs: number
  startWithWindows: boolean
  startMinimized: boolean
  minimizeToTray: boolean
  history: { enabled: boolean; retentionDays: number }
  alerts: {
    enabled: boolean
    cooldownMin: number
    cpuTemp: Threshold
    gpuTemp: Threshold
    ram: Threshold
    /** Alert when any volume's FREE space drops below this percent. */
    storageLow: Threshold
    storageHealth: { enabled: boolean }
  }
  overlay: {
    enabled: boolean
    position: OverlayPosition
    scale: number
    opacity: number
    hotkey: string
    metrics: { cpu: boolean; gpu: boolean; cpuTemp: boolean; gpuTemp: boolean; ram: boolean; vram: boolean; fps: boolean }
  }
  /** Show FPS (uses the PresentMon console app bundled with FRISTY). */
  fpsEnabled: boolean
  /** Optional custom path to Intel PresentMon CLI (ETW based, no injection) used only for FPS readings. */
  presentMonPath: string
  /** Optional custom path to FanControl.exe when it isn't found automatically. */
  fanControlPath: string
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'dark',
  accent: '#8b5cf6',
  tempUnit: 'C',
  refreshMs: 1000,
  startWithWindows: false,
  startMinimized: false,
  minimizeToTray: true,
  history: { enabled: true, retentionDays: 30 },
  alerts: {
    enabled: true,
    cooldownMin: 10,
    cpuTemp: { enabled: true, threshold: 90 },
    gpuTemp: { enabled: true, threshold: 85 },
    ram: { enabled: true, threshold: 90 },
    storageLow: { enabled: true, threshold: 10 },
    storageHealth: { enabled: true }
  },
  overlay: {
    enabled: false,
    position: 'top-left',
    scale: 1,
    opacity: 0.85,
    hotkey: 'CommandOrControl+Shift+O',
    metrics: { cpu: true, gpu: true, cpuTemp: true, gpuTemp: true, ram: true, vram: true, fps: true }
  },
  fpsEnabled: true,
  presentMonPath: '',
  fanControlPath: ''
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
const num = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d)
const thr = (v: unknown, d: Threshold, min: number, max: number): Threshold =>
  isObj(v) ? { enabled: bool(v.enabled, d.enabled), threshold: num(v.threshold, d.threshold, min, max) } : { ...d }

const HOTKEY_RE = /^(?:(?:CommandOrControl|Control|Ctrl|Alt|Shift|Super)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/

/** Merge untrusted input over a base settings object, clamping/validating every field. */
export function sanitizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const i = isObj(input) ? input : {}
  const h = isObj(i.history) ? i.history : {}
  const a = isObj(i.alerts) ? i.alerts : {}
  const o = isObj(i.overlay) ? i.overlay : {}
  const om = isObj(o.metrics) ? o.metrics : {}
  const sh = isObj(a.storageHealth) ? a.storageHealth : {}
  const fc = typeof i.fanControlPath === 'string' ? i.fanControlPath.trim() : base.fanControlPath
  const pm = typeof i.presentMonPath === 'string' ? i.presentMonPath.trim() : base.presentMonPath
  return {
    language: oneOf(i.language, ['en', 'he'] as const, base.language),
    theme: oneOf(i.theme, ['dark', 'light'] as const, base.theme),
    accent: typeof i.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(i.accent) ? i.accent.toLowerCase() : base.accent,
    tempUnit: oneOf(i.tempUnit, ['C', 'F'] as const, base.tempUnit),
    refreshMs: Math.round(num(i.refreshMs, base.refreshMs, 500, 10000)),
    startWithWindows: bool(i.startWithWindows, base.startWithWindows),
    startMinimized: bool(i.startMinimized, base.startMinimized),
    minimizeToTray: bool(i.minimizeToTray, base.minimizeToTray),
    history: {
      enabled: bool(h.enabled, base.history.enabled),
      retentionDays: Math.round(num(h.retentionDays, base.history.retentionDays, 1, 365))
    },
    alerts: {
      enabled: bool(a.enabled, base.alerts.enabled),
      cooldownMin: Math.round(num(a.cooldownMin, base.alerts.cooldownMin, 1, 1440)),
      cpuTemp: thr(a.cpuTemp, base.alerts.cpuTemp, 40, 110),
      gpuTemp: thr(a.gpuTemp, base.alerts.gpuTemp, 40, 110),
      ram: thr(a.ram, base.alerts.ram, 50, 99),
      storageLow: thr(a.storageLow, base.alerts.storageLow, 1, 50),
      storageHealth: { enabled: bool(sh.enabled, base.alerts.storageHealth.enabled) }
    },
    overlay: {
      enabled: bool(o.enabled, base.overlay.enabled),
      position: oneOf(o.position, ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const, base.overlay.position),
      scale: num(o.scale, base.overlay.scale, 0.6, 2),
      opacity: num(o.opacity, base.overlay.opacity, 0.2, 1),
      hotkey: typeof o.hotkey === 'string' && HOTKEY_RE.test(o.hotkey) ? o.hotkey : base.overlay.hotkey,
      metrics: {
        cpu: bool(om.cpu, base.overlay.metrics.cpu),
        gpu: bool(om.gpu, base.overlay.metrics.gpu),
        cpuTemp: bool(om.cpuTemp, base.overlay.metrics.cpuTemp),
        gpuTemp: bool(om.gpuTemp, base.overlay.metrics.gpuTemp),
        ram: bool(om.ram, base.overlay.metrics.ram),
        vram: bool(om.vram, base.overlay.metrics.vram),
        fps: bool(om.fps, base.overlay.metrics.fps)
      }
    },
    fpsEnabled: bool(i.fpsEnabled, base.fpsEnabled),
    presentMonPath: pm.length <= 260 && (pm === '' || /\.exe$/i.test(pm)) ? pm : base.presentMonPath,
    fanControlPath: fc.length <= 260 && (fc === '' || /(^|[\\/])fancontrol\.exe$/i.test(fc)) ? fc : base.fanControlPath
  }
}
