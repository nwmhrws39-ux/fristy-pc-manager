import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FolderOpen, Lock, Search, XCircle, Box } from 'lucide-react'
import type { ProcessInfo } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Card, KV, PageHeader } from '../components/ui'
import { bytes, rate } from '../format'

type SortKey = 'name' | 'pid' | 'cpu' | 'memBytes' | 'diskSec'
const iconCache = new Map<string, string | null>()

function ProcIcon({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(iconCache.get(path) ?? null)
  useEffect(() => {
    if (!path || iconCache.has(path)) return
    let alive = true
    iconCache.set(path, null)
    api.getProcessIcon(path).then((u) => {
      iconCache.set(path, u)
      if (alive) setSrc(u)
    }).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [path])
  return src ? <img src={src} className="h-4 w-4" alt="" /> : <Box size={14} className="text-muted" />
}

export function ProcessesPage() {
  const { t, toast, app } = useStore()
  const [list, setList] = useState<ProcessInfo[]>([])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'cpu', desc: true })
  const [sel, setSel] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const busy = useRef(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (busy.current || document.hidden) return
      busy.current = true
      try {
        const l = await api.getProcesses()
        if (alive) (setList(l), setErr(''))
      } catch (e) {
        if (alive) setErr((e as Error).message)
      } finally {
        busy.current = false
      }
    }
    void load()
    const id = setInterval(load, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = s ? list.filter((p) => p.name.toLowerCase().includes(s) || String(p.pid).includes(s) || p.path.toLowerCase().includes(s)) : list
    const dir = sort.desc ? -1 : 1
    return [...f].sort((a, b) => {
      const x = a[sort.k] ?? -1
      const y = b[sort.k] ?? -1
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * dir
    })
  }, [list, q, sort])

  const selected = list.find((p) => p.pid === sel) ?? null
  const totalCpu = list.reduce((a, p) => a + p.cpu, 0)

  const end = async (p: ProcessInfo) => {
    const r = await api.killProcess(p.pid)
    if (r.ok) {
      toast(`${t('proc.ended')}: ${p.name}`)
      setList((l) => l.filter((x) => x.pid !== p.pid))
      setSel(null)
    } else if (r.error !== 'cancelled') toast(r.needsAdmin ? `${r.error}${app?.isWindows ? ` — ${t('common.restartAdmin')} (${t('nav.settings')})` : ''}` : r.error ?? t('common.error'), 'err')
  }

  const H = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-fg ${className}`} onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== 'name' }))}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.k === k && (sort.desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
      </span>
    </th>
  )

  return (
    <div className="flex h-[calc(100vh-36px-40px)] flex-col gap-4">
      <PageHeader
        title={t('proc.title')}
        sub={`${list.length} ${t('proc.count')} · CPU ${Math.min(100, totalCpu).toFixed(0)}%`}
        right={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute start-2.5 top-2.5 text-muted" />
            <input className="input w-64 ps-8" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />
      {err && <div className="text-bad">{err}</div>}
      <div className="flex min-h-0 flex-1 gap-4">
        <Card pad={false} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-panel text-muted">
              <tr className="border-b border-line/60 text-start">
                <H k="name" label={t('common.name')} className="text-start" />
                <H k="pid" label={t('proc.pid')} className="text-end" />
                <H k="cpu" label={t('proc.cpu')} className="text-end" />
                <H k="memBytes" label={t('proc.mem')} className="text-end" />
                <H k="diskSec" label={t('proc.disk')} className="text-end" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.pid} onClick={() => setSel(p.pid)} className={`cursor-default border-b border-line/25 ${sel === p.pid ? 'bg-accent/15' : 'hover:bg-panel2/70'}`}>
                  <td className="max-w-[320px] px-3 py-1.5">
                    <span className="flex items-center gap-2 truncate">
                      <ProcIcon path={p.path} />
                      <span className="truncate">{p.name}</span>
                      {p.protected && <Lock size={11} className="shrink-0 text-muted" aria-label={t('proc.protected')} />}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-end tabular text-muted">{p.pid}</td>
                  <td className="px-3 py-1.5 text-end tabular" style={{ background: p.cpu > 0.5 ? `rgb(var(--accent) / ${Math.min(0.35, p.cpu / 100)})` : undefined }}>{p.cpu.toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-end tabular">{bytes(p.memBytes)}</td>
                  <td className="px-3 py-1.5 text-end tabular text-muted">{rate(p.diskSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={t('common.details')} className="w-[320px] shrink-0 overflow-auto">
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <ProcIcon path={selected.path} />
                <span className="selectable truncate">{selected.name}</span>
              </div>
              {selected.protected && (
                <div className="flex items-center gap-2 rounded-lg border border-warn/40 px-3 py-2 text-[12px] text-warn">
                  <Lock size={13} /> {t('proc.protected')}
                </div>
              )}
              <div>
                <KV k={t('proc.pid')} v={String(selected.pid)} />
                <KV k={t('proc.parent')} v={String(selected.ppid)} />
                <KV k={t('proc.cpu')} v={`${selected.cpu.toFixed(1)}%`} />
                <KV k={t('proc.mem')} v={bytes(selected.memBytes)} />
                <KV k={t('proc.disk')} v={rate(selected.diskSec)} />
                <KV k={t('proc.user')} v={selected.user} />
                <KV k={t('proc.priority')} v={String(selected.priority)} />
                <KV k={t('proc.started')} v={selected.started} />
              </div>
              <div>
                <div className="label mb-1">{t('proc.path')}</div>
                <div className="selectable break-all font-mono text-[11.5px]">{selected.path || 'N/A'}</div>
              </div>
              {selected.command && (
                <div>
                  <div className="label mb-1">{t('proc.command')}</div>
                  <div className="selectable max-h-28 overflow-auto break-all font-mono text-[11px] text-muted">{selected.command}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn" disabled={!selected.path} onClick={() => void api.openPath(selected.path).then((r) => !r.ok && toast(r.error ?? '', 'err'))}>
                  <FolderOpen size={14} /> {t('common.openLocation')}
                </button>
                <button className="btn btn-danger" disabled={selected.protected} onClick={() => void end(selected)}>
                  <XCircle size={14} /> {t('proc.end')}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-muted">—</div>
          )}
        </Card>
      </div>
    </div>
  )
}
