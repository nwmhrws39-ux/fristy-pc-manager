/** Ultra-light sparkline (plain SVG polyline) for many small per-core charts; recharts would be too heavy here. */
export function Spark({ values, max = 100, height = 36 }: { values: (number | null)[]; max?: number; height?: number }) {
  const w = 100
  const n = values.length
  const pts = values.map((v, i) => (v === null ? null : `${(i / Math.max(1, n - 1)) * w},${height - (Math.min(max, Math.max(0, v)) / max) * (height - 2) - 1}`))
  const segs: string[][] = [[]]
  pts.forEach((p) => (p ? segs[segs.length - 1].push(p) : segs[segs.length - 1].length && segs.push([])))
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      {segs.filter((s) => s.length > 1).map((s, i) => (
        <g key={i}>
          <polygon points={`${s[0].split(',')[0]},${height} ${s.join(' ')} ${s[s.length - 1].split(',')[0]},${height}`} fill="rgb(var(--accent) / 0.15)" />
          <polyline points={s.join(' ')} fill="none" stroke="rgb(var(--accent))" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  )
}
