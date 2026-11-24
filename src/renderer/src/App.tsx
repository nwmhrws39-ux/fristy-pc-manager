import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, CircuitBoard, Fan, Cpu, Gpu, HardDrive, History, LayoutDashboard, ListTree, MemoryStick, Minus, Network, Rocket, Settings as SettingsIcon, Square, X, Copy, ShieldCheck, CircleCheck, TriangleAlert } from 'lucide-react'
import { IPC } from '@shared/ipc'
import { useStore } from './store'
import { api } from './api'
import { Logo } from './components/Logo'
import type { I18nKey } from './i18n'
import { Overview } from './pages/Overview'
import { CpuPage } from './pages/Cpu'
import { GpuPage } from './pages/Gpu'
import { MemoryPage } from './pages/Memory'
import { StoragePage } from './pages/Storage'
import { NetworkPage } from './pages/Network'
import { ProcessesPage } from './pages/Processes'
import { HardwarePage } from './pages/Hardware'
import { StartupPage } from './pages/Startup'
import { HistoryPage } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { CoolingPage } from './pages/Cooling'

const NAV: { id: string; key: I18nKey; icon: typeof Cpu; el: () => JSX.Element }[] = [
  { id: 'overview', key: 'nav.overview', icon: LayoutDashboard, el: Overview },
  { id: 'cpu', key: 'nav.cpu', icon: Cpu, el: CpuPage },
  { id: 'gpu', key: 'nav.gpu', icon: Gpu, el: GpuPage },
  { id: 'memory', key: 'nav.memory', icon: MemoryStick, el: MemoryPage },
  { id: 'storage', key: 'nav.storage', icon: HardDrive, el: StoragePage },
  { id: 'network', key: 'nav.network', icon: Network, el: NetworkPage },
  { id: 'cooling', key: 'nav.cooling', icon: Fan, el: CoolingPage },
  { id: 'processes', key: 'nav.processes', icon: ListTree, el: ProcessesPage },
  { id: 'hardware', key: 'nav.hardware', icon: CircuitBoard, el: HardwarePage },
  { id: 'startup', key: 'nav.startup', icon: Rocket, el: StartupPage },
  { id: 'history', key: 'nav.history', icon: History, el: HistoryPage },
  { id: 'settings', key: 'nav.settings', icon: SettingsIcon, el: SettingsPage }
]

function TitleBar() {
  const { t, app } = useStore()
  const [max, setMax] = useState(false)
  useEffect(() => api.on(IPC.onMaximized, (v) => setMax(!!v)), [])
  return (
    <div className="drag flex h-9 shrink-0 items-center justify-between border-b border-line/60 bg-bg ps-3" onDoubleClick={() => api.winMaximize()}>
      <div className="flex items-center gap-2">
        <Logo size={18} />
        <span className="text-[12.5px] font-bold tracking-[0.18em]">FRISTY</span>
        <span className="text-[12px] text-muted">{t('app.tagline')}</span>
        {app?.isAdmin && (
          <span className="ms-2 inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10.5px] text-accent">
            <ShieldCheck size={11} /> {t('app.admin')}
          </span>
        )}
      </div>
      <div className="no-drag flex h-full" dir="ltr">
        <button aria-label="Minimize" className="flex h-full w-11 items-center justify-center text-muted hover:bg-panel2 hover:text-fg" onClick={() => api.winMinimize()}>
          <Minus size={15} />
        </button>
        <button aria-label="Maximize" className="flex h-full w-11 items-center justify-center text-muted hover:bg-panel2 hover:text-fg" onClick={() => api.winMaximize()}>
          {max ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button aria-label="Close" className="flex h-full w-11 items-center justify-center text-muted hover:bg-[#c42b1c] hover:text-white" onClick={() => api.winClose()}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function Sidebar({ page, setPage }: { page: string; setPage: (p: string) => void }) {
  const { t, snap } = useStore()
  return (
    <nav className="flex w-[208px] shrink-0 flex-col border-e border-line/60 bg-bg px-2 py-3">
      {NAV.map((n) => {
        const active = n.id === page
        return (
          <button key={n.id} onClick={() => setPage(n.id)} className={`relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-start text-[13px] transition ${active ? 'text-fg' : 'text-muted hover:bg-panel2/70 hover:text-fg'}`}>
            {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg border border-accent/30 bg-accent/12" style={{ background: 'rgb(var(--accent) / 0.12)' }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            {active && <motion.span layoutId="nav-bar" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent" />}
            <n.icon size={16} className={`relative ${active ? 'text-accent' : ''}`} />
            <span className="relative">{t(n.key)}</span>
          </button>
        )
      })}
      <div className="mt-auto rounded-lg border border-line/60 bg-panel p-3 text-[11.5px] text-muted">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-fg">
          <Activity size={13} className="text-accent" /> {t('ov.sensors')}
        </div>
        <div className="flex items-center gap-1.5">
          {snap && snap.sensorSource !== 'none' ? <CircleCheck size={12} className="text-ok" /> : <TriangleAlert size={12} className="text-warn" />}
          {snap ? (snap.sensorSource === 'none' ? t('common.na') : snap.sensorSource) : '…'}
        </div>
      </div>
    </nav>
  )
}

export function App() {
  const [page, setPage] = useState('overview')
  const { toasts } = useStore()
  const Page = NAV.find((n) => n.id === page)?.el ?? Overview
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar page={page} setPage={setPage} />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <div className="pointer-events-none fixed bottom-4 end-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((x) => (
            <motion.div key={x.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`selectable pointer-events-auto max-w-sm rounded-lg border bg-panel px-4 py-2.5 text-[12.5px] shadow-2xl ${x.kind === 'err' ? 'border-bad/60' : 'border-accent/50'}`}>
              {x.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
