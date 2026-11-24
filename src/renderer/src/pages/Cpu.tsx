import { useMemo } from 'react'
import { Cpu, Gauge, Thermometer, Zap, Layers } from 'lucide-react'
import { useStore } from '../store'
import { Card, KV, Note, PageHeader, Stat } from '../components/ui'
import { ACCENT, LiveChart } from '../components/LiveChart'
import { Spark } from '../components/Spark'
import { bytes, mhz, pct, temp, watts } from '../format'
import { useSeries } from './common'

export function CpuPage() {
  const { snap, info, buffer, t, settings } = useStore()
  const load = useSeries({ cpu: (s) => s.cpu.load })
  const tempSeries = useSeries({ temp: (s) => s.cpu.tempC })
  const cores = snap?.cpu.cores ?? []
  const coreHist = useMemo(() => cores.map((_, i) => buffer.slice(-40).map((s) => s.cpu.cores[i] ?? null)), [buffer, cores.length])
  const c = info?.cpu
  const kb = (v: number | null) => (v ? bytes(v) : 'N/A')

  return (
    <div className="space-y-4">
      <PageHeader title={t('cpu.title')} sub={c ? `${c.manufacturer} ${c.brand}` : t('app.loading')} />
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label={t('common.usage')} value={pct(snap?.cpu.load)} icon={Cpu} />
          <Stat label={t('cpu.current')} value={mhz(snap?.cpu.speedMHz)} icon={Gauge} />
          <Stat label={t('common.temperature')} value={temp(snap?.cpu.tempC, settings.tempUnit)} icon={Thermometer} />
          <Stat label={t('common.power')} value={watts(snap?.cpu.powerW)} icon={Zap} />
          <Stat label={t('cpu.cores')} value={c?.physicalCores ?? 'N/A'} icon={Layers} />
          <Stat label={t('cpu.threads')} value={c?.cores ?? 'N/A'} icon={Layers} />
        </div>
      </Card>
      {snap?.sensorSource === 'none' && <Note>{t('common.sensorHint')}</Note>}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('cpu.graph')} className="xl:col-span-2" right={<span className="text-[11.5px] text-muted">{t('common.last60')}</span>}>
          <LiveChart data={load} max={100} height={220} series={[{ key: 'cpu', label: t('common.usage'), color: ACCENT }]} />
        </Card>
        <Card title={t('common.temperature')}>
          {snap?.cpu.tempC == null ? (
            <div className="flex h-[220px] items-center justify-center text-muted">{t('common.na')}</div>
          ) : (
            <LiveChart data={tempSeries} height={220} fmt={(v) => temp(v, settings.tempUnit)} series={[{ key: 'temp', label: t('common.temperature'), color: ACCENT }]} />
          )}
        </Card>
      </div>
      <Card title={`${t('cpu.perCore')} (${cores.length})`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {cores.map((v, i) => (
            <div key={i} className="rounded-lg border border-line/60 bg-panel2/50 p-2">
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-muted">#{i}</span>
                <span className="tabular">{Math.round(v)}%</span>
              </div>
              <Spark values={coreHist[i] ?? []} />
            </div>
          ))}
        </div>
      </Card>
      <Card title={t('common.details')}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <KV k={t('common.model')} v={c?.brand} />
            <KV k={t('common.vendor')} v={c?.manufacturer} />
            <KV k={t('cpu.base')} v={c?.speedBaseGHz ? `${c.speedBaseGHz} GHz` : 'N/A'} />
            <KV k={t('cpu.max')} v={c?.speedMaxGHz ? `${c.speedMaxGHz} GHz` : 'N/A'} />
            <KV k={t('cpu.socket')} v={c?.socket} />
            <KV k={t('cpu.arch')} v={c?.arch} />
          </div>
          <div>
            <KV k={t('cpu.family')} v={c ? `${c.family || '?'} / ${c.model || '?'} / ${c.stepping || '?'}` : 'N/A'} />
            <KV k="L1d / L1i" v={c ? `${kb(c.cache.l1d)} / ${kb(c.cache.l1i)}` : 'N/A'} />
            <KV k="L2" v={kb(c?.cache.l2 ?? null)} />
            <KV k="L3" v={kb(c?.cache.l3 ?? null)} />
            <KV k={t('cpu.virt')} v={c ? (c.virtualization ? t('common.enabled') : t('common.disabled')) : 'N/A'} />
            <KV k={t('common.source')} v={snap?.sensorSource === 'none' ? 'N/A' : snap?.sensorSource} />
          </div>
        </div>
      </Card>
    </div>
  )
}
