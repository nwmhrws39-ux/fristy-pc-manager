import { MemoryStick } from 'lucide-react'
import { useStore } from '../store'
import { Card, KV, PageHeader, Ring, Stat } from '../components/ui'
import { ACCENT, LiveChart } from '../components/LiveChart'
import { bytes } from '../format'
import { useSeries } from './common'

export function MemoryPage() {
  const { snap, info, t } = useStore()
  const series = useSeries({ m: (s) => s.mem.percent })
  const mods = info?.memModules ?? []
  const installed = mods.reduce((a, m) => a + m.size, 0)
  const speed = mods.find((m) => m.clockSpeed)?.clockSpeed ?? null
  const type = mods.find((m) => m.type && m.type !== 'Unknown')?.type ?? ''
  return (
    <div className="space-y-4">
      <PageHeader title={t('mem.title')} sub={`${bytes(installed || snap?.mem.total || null)} ${type}`} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="flex items-center gap-6">
          <Ring value={snap?.mem.percent ?? null} size={120} stroke={10} label={t('mem.inUse')} />
          <div className="grid flex-1 grid-cols-2 gap-4">
            <Stat label={t('common.used')} value={bytes(snap?.mem.used)} />
            <Stat label={t('common.available')} value={bytes(snap?.mem.available)} />
            <Stat label={t('common.total')} value={bytes(snap?.mem.total)} />
            <Stat label={t('mem.swap')} value={snap?.mem.swapTotal ? `${bytes(snap.mem.swapUsed, 0)} / ${bytes(snap.mem.swapTotal, 0)}` : 'N/A'} />
          </div>
        </Card>
        <Card title={t('common.usage')} className="xl:col-span-2" right={<span className="text-[11.5px] text-muted">{t('common.last60')}</span>}>
          <LiveChart data={series} max={100} height={180} series={[{ key: 'm', label: t('common.usage'), color: ACCENT }]} />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('common.details')} icon={MemoryStick}>
          <KV k={t('mem.installed')} v={installed ? bytes(installed) : 'N/A'} />
          <KV k={t('mem.type')} v={type} />
          <KV k={t('mem.speed')} v={speed ? `${speed} MT/s` : 'N/A'} />
          <KV k={t('mem.modules')} v={mods.length ? String(mods.length) : 'N/A'} />
        </Card>
        <Card title={t('mem.modules')} className="xl:col-span-2" pad={false}>
          <table className="w-full text-[12.5px]">
            <thead className="text-muted">
              <tr className="border-b border-line/60 text-start">
                {[t('mem.slot'), t('common.capacity'), t('mem.type'), t('mem.speed'), t('mem.formFactor'), t('hw.manufacturer'), t('mem.part')].map((h) => (
                  <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mods.map((m, i) => (
                <tr key={i} className="selectable border-b border-line/30 last:border-0">
                  <td className="px-4 py-2">{m.bank || `#${i}`}</td>
                  <td className="px-4 py-2 tabular">{bytes(m.size, 0)}</td>
                  <td className="px-4 py-2">{m.type || 'N/A'}</td>
                  <td className="px-4 py-2 tabular">{m.clockSpeed ? `${m.clockSpeed} MT/s` : 'N/A'}</td>
                  <td className="px-4 py-2">{m.formFactor || 'N/A'}</td>
                  <td className="px-4 py-2">{m.manufacturer || 'N/A'}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px]">{m.partNum || 'N/A'}</td>
                </tr>
              ))}
              {!mods.length && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">N/A</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
