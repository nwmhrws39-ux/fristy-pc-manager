import type { Num } from '@shared/types'

export const NA = 'N/A'
/** Wrap a number+unit in a Unicode LTR isolate so it renders correctly inside Hebrew (RTL) text. N/A is left untouched. */
export const ltr = (s: string) => (s === NA ? s : `\u2066${s}\u2069`)
export const isNum = (v: Num | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export function bytes(b: Num | undefined, digits = 1): string {
  if (!isNum(b)) return NA
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  let v = Math.abs(b)
  while (v >= 1024 && i < u.length - 1) (v /= 1024), i++
  return ltr(`${(b < 0 ? -v : v).toFixed(i === 0 ? 0 : digits)} ${u[i]}`)
}
export const rate = (b: Num | undefined) => (isNum(b) ? ltr(`${bytes(b)}/s`) : NA)
export const bits = (b: Num | undefined) => {
  if (!isNum(b)) return NA
  const v = b * 8
  if (v >= 1e9) return ltr(`${(v / 1e9).toFixed(2)} Gbps`)
  if (v >= 1e6) return ltr(`${(v / 1e6).toFixed(1)} Mbps`)
  if (v >= 1e3) return ltr(`${(v / 1e3).toFixed(0)} Kbps`)
  return ltr(`${v.toFixed(0)} bps`)
}
export const pct = (v: Num | undefined, d = 0) => (isNum(v) ? ltr(`${v.toFixed(d)}%`) : NA)
export const mhz = (v: Num | undefined) => (isNum(v) ? ltr(v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${Math.round(v)} MHz`) : NA)
export const watts = (v: Num | undefined) => (isNum(v) ? ltr(`${v.toFixed(1)} W`) : NA)
export const rpm = (v: Num | undefined) => (isNum(v) ? ltr(`${Math.round(v)} RPM`) : NA)
export const mb = (v: Num | undefined) => (isNum(v) ? bytes(v * 1048576) : NA)

export function temp(c: Num | undefined, unit: 'C' | 'F'): string {
  if (!isNum(c)) return NA
  return ltr(unit === 'F' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`)
}
export const tempVal = (c: number, unit: 'C' | 'F') => (unit === 'F' ? (c * 9) / 5 + 32 : c)

export function duration(sec: number, lang: 'en' | 'he'): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const L = lang === 'he' ? { d: 'י׳', h: 'ש׳', m: 'ד׳' } : { d: 'd', h: 'h', m: 'm' }
  return d ? `${d}${L.d} ${h}${L.h} ${m}${L.m}` : `${h}${L.h} ${m}${L.m}`
}

/** Status level used for indicator dots. Thresholds are deliberately conservative. */
export function level(kind: 'load' | 'temp', v: Num | undefined): 'ok' | 'warn' | 'bad' | 'na' {
  if (!isNum(v)) return 'na'
  if (kind === 'load') return v >= 90 ? 'bad' : v >= 70 ? 'warn' : 'ok'
  return v >= 90 ? 'bad' : v >= 75 ? 'warn' : 'ok'
}
