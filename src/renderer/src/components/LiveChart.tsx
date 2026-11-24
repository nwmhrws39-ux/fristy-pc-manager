import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReactNode } from 'react'

export interface Series {
  key: string
  label: string
  /** CSS color; single-series charts use the accent, multi-series use the validated --s1..--s3 slots. */
  color: string
}

interface Props {
  data: readonly object[]
  series: Series[]
  height?: number
  /** Fixed y max (e.g. 100 for percentages). Omit for auto. */
  max?: number
  fmt?: (v: number) => string
  xKey?: string
  xFmt?: (v: number) => string
  showAxis?: boolean
}

function TooltipBox({ active, payload, label, series, fmt, xFmt }: { active?: boolean; payload?: { dataKey: string; value: number | null }[]; label?: number; series: Series[]; fmt: (v: number) => string; xFmt?: (v: number) => string }): ReactNode {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] shadow-xl">
      {xFmt && label !== undefined && <div className="mb-1 text-muted">{xFmt(label)}</div>}
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key)
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="ms-auto font-medium tabular text-fg">{p && typeof p.value === 'number' ? fmt(p.value) : 'N/A'}</span>
          </div>
        )
      })}
    </div>
  )
}

export function LiveChart({ data, series, height = 160, max, fmt = (v) => `${Math.round(v)}%`, xKey = 'i', xFmt, showAxis = true }: Props) {
  const rtl = document.documentElement.dir === 'rtl'
  const rows = data as Record<string, unknown>[]
  const hasData = rows.some((r) => series.some((s) => typeof r[s.key] === 'number'))
  const sparse = rows.filter((r) => series.some((s) => typeof r[s.key] === 'number')).length < 3
  const wideAxis = fmt(1).length > 4
  return (
    <div>
    <div style={{ height }} dir="ltr" className="relative">
      {!hasData && <div className="absolute inset-0 z-10 flex items-center justify-center text-muted">N/A</div>}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data as object[]} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey={xKey} hide={!xFmt} reversed={rtl} tickFormatter={xFmt} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis hide={!showAxis} orientation={rtl ? 'right' : 'left'} domain={[0, max ?? 'auto']} width={wideAxis ? 66 : 44} tickFormatter={(v: number) => fmt(v)} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} axisLine={false} tickLine={false} tickCount={4} />
          <Tooltip cursor={{ stroke: 'rgb(var(--muted))', strokeDasharray: '3 3' }} content={(p) => <TooltipBox {...(p as object)} series={series} fmt={fmt} xFmt={xFmt} />} isAnimationActive={false} />
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} isAnimationActive={false} connectNulls={false} dot={sparse ? { r: 3, strokeWidth: 2, fill: s.color } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--panel))' }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-muted" dir={rtl ? 'rtl' : 'ltr'}>
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export const ACCENT = 'rgb(var(--accent))'
export const S1 = 'var(--s1)'
export const S2 = 'var(--s2)'
export const S3 = 'var(--s3)'
