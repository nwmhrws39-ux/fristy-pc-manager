export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="fl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#fl)" />
      <path d="M20 46V18h24v6H27v6h14v6H27v10z" fill="#fff" />
      <path d="M46 46l-6-6h6z" fill="#fff" opacity=".7" />
    </svg>
  )
}
