import { useMemo } from 'react'
import type { Num, Snapshot } from '@shared/types'
import { useStore } from '../store'

const LEN = 60

/** Build a fixed-length (60 point) series from the live buffer; missing readings stay null (gaps, never fake values). */
export function useSeries(pick: Record<string, (s: Snapshot) => Num | undefined>): Record<string, number | null>[] {
  const { buffer } = useStore()
  return useMemo(() => {
    const keys = Object.keys(pick)
    const pad = Math.max(0, LEN - buffer.length)
    const rows: Record<string, number | null>[] = []
    for (let i = 0; i < pad; i++) rows.push(Object.fromEntries([['i', i], ...keys.map((k) => [k, null])]))
    buffer.slice(-LEN).forEach((s, j) => {
      const row: Record<string, number | null> = { i: pad + j }
      for (const k of keys) {
        const v = pick[k](s)
        row[k] = typeof v === 'number' && Number.isFinite(v) ? v : null
      }
      rows.push(row)
    })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer])
}

export const sumNet = (s: Snapshot, k: 'rxSec' | 'txSec'): Num => {
  const v = s.net.map((n) => n[k]).filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}
