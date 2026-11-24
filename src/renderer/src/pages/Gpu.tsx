import { Fan, Gauge, Gpu, MemoryStick, Thermometer, Zap } from 'lucide-react'
import { useStore } from '../store'
import { Badge, Card, Empty, KV, Meter, Note, PageHeader, Stat } from '../components/ui'
import { ACCENT, LiveChart } from '../components/LiveChart'
import { isNum, mb, mhz, pct, rpm, temp, watts } from '../format'
import { useSeries } from './common'

function GpuBlock({ idx }: { idx: number }) {
  const { snap, info, t, settings } = useStore()
  const g = snap?.gpus[idx]
  const st = info?.gpus.find((x) => x.index === g?.index)
  const util = useSeries({ u: (s) => s.gpus[idx]?.util })
  const vram = useSeries({ v: (s) => s.gpus[idx]?.vramUsedMB })
  if (!g) return null
  const vramPct = isNum(g.vramUsedMB) && isNum(g.vramTotalMB) && g.vramTotalMB > 0 ? (g.vramUsedMB / g.vramTotalMB) * 100 : null
  const fan = isNum(g.fanPercent) ? pct(g.fanPercent) : rpm(g.fanRpm)
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2">{g.name}<Badge tone="accent">{g.vendor}</Badge></span>} icon={Gpu} right={<span className="text-[11.5px] text-muted">{t('common.source')}: {g.source}</span>}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          <Stat label={t('gpu.util')} value={pct(g.util)} icon={Gauge} />
          <Stat label={t('common.temperature')} value={temp(g.tempC, settings.tempUnit)} icon={Thermometer} />
          <Stat label={t('gpu.vram')} value={mb(g.vramUsedMB)} sub={`/ ${mb(g.vramTotalMB)}`} icon={MemoryStick} />
          <Stat label={t('gpu.core')} value={mhz(g.coreClockMHz)} />
          <Stat label={t('gpu.mem')} value={mhz(g.memClockMHz)} />
          <Stat label={t('gpu.fan')} value={fan} icon={Fan} />
          <Stat label={t('common.power')} value={watts(g.powerW)} icon={Zap} />
        </div>
        {vramPct !== null && <Meter value={vramPct} className="mt-4" />}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('gpu.util')} right={<span className="text-[11.5px] text-muted">{t('common.last60')}</span>}>
          {g.util === null ? <div className="flex h-[180px] items-center justify-center text-muted">N/A</div> : <LiveChart data={util} max={100} height={180} series={[{ key: 'u', label: t('gpu.util'), color: ACCENT }]} />}
        </Card>
        <Card title={t('gpu.vram')}>
          {g.vramUsedMB === null ? (
            <div className="flex h-[180px] items-center justify-center text-muted">N/A</div>
          ) : (
            <LiveChart data={vram} max={g.vramTotalMB ?? undefined} height={180} fmt={(v) => mb(v)} series={[{ key: 'v', label: t('gpu.vram'), color: ACCENT }]} />
          )}
        </Card>
      </div>
      <Card title={t('common.details')}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <KV k={t('common.model')} v={st?.model ?? g.name} />
            <KV k={t('common.vendor')} v={g.vendor} />
            <KV k={t('gpu.driver')} v={st?.driverVersion} />
          </div>
          <div>
            <KV k={t('gpu.vram')} v={mb(g.vramTotalMB ?? st?.vramMB ?? null)} />
            <KV k="Bus" v={st?.bus} />
            <KV k={t('common.source')} v={g.source} />
          </div>
        </div>
      </Card>
    </div>
  )
}

export function GpuPage() {
  const { snap, t } = useStore()
  const gpus = snap?.gpus ?? []
  return (
    <div className="space-y-6">
      <PageHeader title={t('gpu.title')} sub={`${gpus.length} GPU`} />
      <Note>{t('gpu.sourceNote')}</Note>
      {gpus.length === 0 ? <Empty>{t('gpu.none')}</Empty> : gpus.map((_, i) => <GpuBlock key={i} idx={i} />)}
    </div>
  )
}
