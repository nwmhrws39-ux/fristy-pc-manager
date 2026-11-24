import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { isNum } from '../format'

export function Card({ title, icon: Icon, right, children, className = '', pad = true }: { title?: ReactNode; icon?: LucideIcon; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`card ${pad ? 'p-4' : ''} ${className}`}>
      {(title || right) && (
        <header className={`mb-3 flex items-center justify-between gap-3 ${pad ? '' : 'px-4 pt-4'}`}>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            {Icon && <Icon size={15} className="text-accent" />}
            {title}
          </h3>
          {right}
        </header>
      )}
      {children}
    </motion.section>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {sub && <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}

/** Key/value line. Values in primary ink; N/A rendered muted so missing data is obvious but quiet. */
export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  const na = v === 'N/A' || v === 'לא זמין' || v === '' || v === null || v === undefined
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/40 py-1.5 last:border-0">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`selectable truncate text-end tabular ${mono ? 'font-mono text-[12px]' : ''} ${na ? 'text-muted/70' : 'text-fg'}`} title={typeof v === 'string' ? v : undefined}>
        {na ? 'N/A' : v}
      </span>
    </div>
  )
}

export function Stat({ label, value, sub, icon: Icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: LucideIcon }) {
  const na = value === 'N/A'
  return (
    <div className="min-w-0">
      <div className="label flex items-center gap-1.5">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className={`mt-1 truncate text-[20px] font-semibold tabular ${na ? 'text-muted/70' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</div>}
    </div>
  )
}

/** Circular gauge for a 0–100 value. Arc in accent; the number itself stays in text ink. */
export function Ring({ value, size = 96, stroke = 8, label, center }: { value: number | null; size?: number; stroke?: number; label?: ReactNode; center?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div className="flex flex-col items-center gap-2" role="img" aria-label={`${typeof label === 'string' ? label : ''} ${isNum(value) ? Math.round(v) + '%' : 'N/A'}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (v / 100) * c }} transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[18px] font-semibold tabular">
          {center ?? (isNum(value) ? `${Math.round(v)}%` : <span className="text-[14px] text-muted">N/A</span>)}
        </div>
      </div>
      {label && <div className="text-[11.5px] text-muted">{label}</div>}
    </div>
  )
}

export function Meter({ value, className = '', tone }: { value: number | null; className?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const v = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-accent'
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line/60 ${className}`}>
      <motion.div className={`h-full rounded-full ${color}`} animate={{ width: `${v}%` }} transition={{ duration: 0.4 }} />
    </div>
  )
}

/** Status indicator: icon-shaped dot + text label, never color alone. */
export function StatusDot({ level, label }: { level: 'ok' | 'warn' | 'bad' | 'na'; label: string }) {
  const cls = level === 'ok' ? 'bg-ok' : level === 'warn' ? 'bg-warn' : level === 'bad' ? 'bg-bad' : 'bg-muted/50'
  const glyph = level === 'ok' ? '●' : level === 'warn' ? '▲' : level === 'bad' ? '■' : '○'
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] text-white ${cls}`} aria-hidden>
        {glyph}
      </span>
      {label}
    </span>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'ok' | 'warn' | 'bad' }) {
  const map = { muted: 'border-line text-muted', accent: 'border-accent/50 text-accent', ok: 'border-ok/50 text-ok', warn: 'border-warn/50 text-warn', bad: 'border-bad/50 text-bad' }
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${map[tone]}`}>{children}</span>
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 py-2 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <span>{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <motion.span layout className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow" style={{ insetInlineStart: checked ? 18 : 2 }} />
      </button>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel2 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`relative rounded-md px-3 py-1 text-[12.5px] transition ${value === o.value ? 'text-white' : 'text-muted hover:text-fg'}`}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-md bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 35 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-muted">{children}</div>
}

export function Note({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line/60 bg-panel2/60 px-3 py-2 text-[12px] text-muted">
      {Icon && <Icon size={14} className="mt-0.5 shrink-0 text-accent" />}
      <div>{children}</div>
    </div>
  )
}
