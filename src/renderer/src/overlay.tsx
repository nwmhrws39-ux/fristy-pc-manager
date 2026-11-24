import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { IPC } from '@shared/ipc'
import { DEFAULT_SETTINGS, Settings } from '@shared/settings'
import type { Snapshot } from '@shared/types'
import { api } from './api'
import { mb, pct, temp } from './format'
import { applyTheme } from './store'

function Overlay() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    void api.getSettings().then((x) => (setS(x), applyTheme({ ...x, theme: 'dark' })))
    const a = api.on(IPC.onSettings, (x) => setS(x as Settings))
    const b = api.on(IPC.onSnapshot, (x) => setSnap(x as Snapshot))
    return () => (a(), b())
  }, [])
  const m = s.overlay.metrics
  const g = snap?.gpus[0]
  const rows: [string, string][] = []
  if (m.cpu) rows.push(['CPU', pct(snap?.cpu.load)])
  if (m.cpuTemp) rows.push(['CPU °', temp(snap?.cpu.tempC, s.tempUnit)])
  if (m.gpu) rows.push(['GPU', pct(g?.util)])
  if (m.gpuTemp) rows.push(['GPU °', temp(g?.tempC, s.tempUnit)])
  if (m.ram) rows.push(['RAM', pct(snap?.mem.percent)])
  if (m.vram) rows.push(['VRAM', g?.vramUsedMB != null ? `${mb(g.vramUsedMB)}` : 'N/A'])
  if (m.fps) rows.push(['FPS', snap?.fps != null ? String(snap.fps) : 'N/A'])
  return (
    <div dir="ltr" className="h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black/70 px-3 py-2 font-mono text-white" style={{ fontSize: 13 * s.overlay.scale }}>
      <div className="mb-1 text-[0.7em] font-bold tracking-[0.25em] text-[#a78bfa]">FRISTY</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between leading-[1.65em]">
          <span className="text-white/60">{k}</span>
          <span className={`tabular font-semibold ${v === 'N/A' ? 'text-white/40' : ''}`}>{v}</span>
        </div>
      ))}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
)
