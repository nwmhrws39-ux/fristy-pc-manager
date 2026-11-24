import { useEffect, useState } from 'react'
import { Download, Trash2, RefreshCw, Table2, ChartArea } from 'lucide-react'
import type { HistoryPoint, HistoryRange, HistoryStats } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Card, Empty, Note, PageHeader, Segmented } from '../components/ui'
import { ACCENT, LiveChart, S1, S2 } from '../components/LiveChart'
import { bytes, isNum, temp } from '../format'

export function HistoryPage() {
  const { t, toast, settings } = useStore()
  const [range, setRange] = useState<HistoryRange>('day')
  const [data, setData] = useState<HistoryPoint[]>([])
  const [stats, setStats] = useState<HistoryStats[]>([])
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const u = settings.tempUnit

  const load = async () => {
    const [d, s] = await Promise.all([api.getHistory(range), api.getHistoryStats(range)])
    setData(d)
    setStats(s)
  }
  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 60e3)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const loc = settings.language === 'he' ? 'he-IL' : 'en-US'
  const xFmt = (ts: number) => {
    const d = new Date(ts)
    return range === 'hour' || range === 'day' ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(loc, { month: 'short', day: 'numeric', hour: range === 'week' ? '2-digit' : undefined })
  }
  const fullFmt = (ts: number) => new Date(ts).toLocaleString(loc)
  const st = (m: string) => stats.find((s) => s.metric === m)
  const fmtFor = (m: string, v: number | null) => (!isNum(v) ? 'N/A' : m.includes('Temp') ? temp(v, u) : m === 'rx' || m === 'tx' ? `${bytes(v)}/s` : `${v.toFixed(1)}%`)
  const label: Record<string, string> = { cpu: 'CPU', gpu: 'GPU', cpuTemp: `CPU ${t('common.temperature')}`, gpuTemp: `GPU ${t('common.temperature')}`, ram: t('ov.ram'), rx: t('ov.download'), tx: t('ov.upload') }

  const exportCsv = async () => {
    const r = await api.exportHistory(range)
    if (r.ok) toast(`${t('common.saved')} ${r.data}`)
    else if (r.error !== 'cancelled') toast(r.error ?? t('common.error'), 'err')
  }
  const clear = async () => {
    const r = await api.clearHistory()
    if (r.ok) void load()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('hi.title')}
        right={
          <>
            <Segmented value={range} onChange={setRange} options={(['hour', 'day', 'week', 'month'] as const).map((r) => ({ value: r, label: t(`hi.${r}` as const) }))} />
            <Segmented value={view} onChange={setView} options={[{ value: 'chart', label: <ChartArea size={14} aria-label={t('hi.chart')} /> }, { value: 'table', label: <Table2 size={14} aria-label={t('hi.table')} /> }]} />
            <button className="btn" onClick={() => void load()}><RefreshCw size={14} /></button>
            <button className="btn" onClick={() => void exportCsv()}><Download size={14} /> {t('hi.exportCsv')}</button>
            <button className="btn btn-danger" onClick={() => void clear()}><Trash2 size={14} /> {t('hi.clear')}</button>
          </>
        }
      />
      {!settings.history.enabled && <Note>{t('hi.disabled')}</Note>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {['cpu', 'gpu', 'cpuTemp', 'gpuTemp', 'ram', 'rx', 'tx'].map((m) => (
          <div key={m} className="card p-3">
            <div className="label truncate">{label[m]}</div>
            <div className="mt-1 text-[16px] font-semibold tabular">{fmtFor(m, st(m)?.avg ?? null)}</div>
            <div className="text-[11.5px] text-muted tabular">{t('hi.max')}: {fmtFor(m, st(m)?.max ?? null)}</div>
          </div>
        ))}
      </div>
      {data.length === 0 ? (
        <Empty>{t('hi.empty')}</Empty>
      ) : view === 'chart' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={t('hi.usage')}>
            <LiveChart data={data} xKey="ts" xFmt={xFmt} max={100} height={200} series={[{ key: 'cpu', label: 'CPU', color: S1 }, { key: 'gpu', label: 'GPU', color: S2 }]} />
          </Card>
          <Card title={t('hi.temps')}>
            <LiveChart data={data} xKey="ts" xFmt={xFmt} height={200} fmt={(v) => temp(v, u)} series={[{ key: 'cpuTemp', label: 'CPU', color: S1 }, { key: 'gpuTemp', label: 'GPU', color: S2 }]} />
          </Card>
          <Card title={t('hi.ram')}>
            <LiveChart data={data} xKey="ts" xFmt={xFmt} max={100} height={200} series={[{ key: 'ram', label: t('ov.ram'), color: ACCENT }]} />
          </Card>
          <Card title={t('hi.net')}>
            <LiveChart data={data} xKey="ts" xFmt={xFmt} height={200} fmt={(v) => bytes(v, 0) + '/s'} series={[{ key: 'rx', label: t('ov.download'), color: S1 }, { key: 'tx', label: t('ov.upload'), color: S2 }]} />
          </Card>
        </div>
      ) : (
        <Card pad={false} className="max-h-[520px] overflow-auto">
          <table className="w-full text-[12px] tabular">
            <thead className="sticky top-0 bg-panel text-muted">
              <tr className="border-b border-line/60">
                {[t('hi.time'), 'CPU', 'CPU max', 'GPU', 'GPU max', 'CPU °', 'GPU °', 'RAM', '↓', '↑'].map((h) => (
                  <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="selectable">
              {[...data].reverse().map((r) => (
                <tr key={r.ts} className="border-b border-line/25">
                  <td className="px-3 py-1.5">{fullFmt(r.ts)}</td>
                  <td className="px-3 py-1.5">{fmtFor('cpu', r.cpu)}</td>
                  <td className="px-3 py-1.5">{fmtFor('cpu', r.cpuMax)}</td>
                  <td className="px-3 py-1.5">{fmtFor('gpu', r.gpu)}</td>
                  <td className="px-3 py-1.5">{fmtFor('gpu', r.gpuMax)}</td>
                  <td className="px-3 py-1.5">{fmtFor('cpuTemp', r.cpuTemp)}</td>
                  <td className="px-3 py-1.5">{fmtFor('gpuTemp', r.gpuTemp)}</td>
                  <td className="px-3 py-1.5">{fmtFor('ram', r.ram)}</td>
                  <td className="px-3 py-1.5">{fmtFor('rx', r.rx)}</td>
                  <td className="px-3 py-1.5">{fmtFor('tx', r.tx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
