import { HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useStore } from '../store'
import { Badge, Card, Empty, KV, Meter, PageHeader } from '../components/ui'
import { LiveChart, S1, S2 } from '../components/LiveChart'
import { bytes, isNum, pct, rate, temp } from '../format'
import { useSeries } from './common'
import type { Snapshot } from '@shared/types'

const sumIo = (s: Snapshot, k: 'readSec' | 'writeSec') => {
  const v = s.disksIo.map((d) => d[k]).filter(isNum)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

export function StoragePage() {
  const { snap, info, t, settings } = useStore()
  const io = useSeries({ r: (s) => sumIo(s, 'readSec'), w: (s) => sumIo(s, 'writeSec') })
  const disks = info?.disks ?? []
  const anyIo = !!snap?.disksIo.some((d) => d.readSec !== null)
  const health = (s: string) => (/^ok$|good|pass|healthy/i.test(s) ? 'ok' : /unknown|^$/i.test(s) ? 'muted' : 'bad')
  return (
    <div className="space-y-4">
      <PageHeader title={t('sto.title')} sub={`${disks.length} ${t('sto.drives').toLowerCase()}`} />
      <Card title={t('sto.io')} right={<span className="text-[12px] tabular text-muted">{t('sto.read')} {rate(snap ? sumIo(snap, 'readSec') : null)} · {t('sto.write')} {rate(snap ? sumIo(snap, 'writeSec') : null)}</span>}>
        {anyIo ? (
          <LiveChart data={io} height={180} fmt={(v) => bytes(v, 0) + '/s'} series={[{ key: 'r', label: t('sto.read'), color: S1 }, { key: 'w', label: t('sto.write'), color: S2 }]} />
        ) : (
          <div className="flex h-[120px] items-center justify-center text-muted">{t('common.na')}</div>
        )}
      </Card>
      <h2 className="pt-2 text-[14px] font-semibold">{t('sto.drives')}</h2>
      {disks.length === 0 && <Empty>{t('common.none')}</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">
        {disks.map((d, i) => {
          const lt = snap?.storageTemps.find((x) => x.name && d.name && (x.name.includes(d.name) || d.name.includes(x.name)))
          const tc = d.temperatureC ?? lt?.tempC ?? null
          const io2 = snap?.disksIo.find((x) => x.name.split(' ')[0] === String(i))
          const h = health(d.smartStatus)
          return (
            <Card key={i} title={d.name || d.device} icon={HardDrive} right={<div className="flex gap-1.5"><Badge tone="accent">{d.type}</Badge><Badge tone={h === 'ok' ? 'ok' : h === 'bad' ? 'bad' : 'muted'}>{h === 'ok' ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}SMART {d.smartStatus}</Badge></div>}>
              <div className="grid gap-x-8 md:grid-cols-2">
                <div>
                  <KV k={t('common.capacity')} v={bytes(d.size)} />
                  <KV k={t('common.vendor')} v={d.vendor} />
                  <KV k={t('sto.iface')} v={d.interfaceType} />
                  <KV k={t('sto.firmware')} v={d.firmware} mono />
                </div>
                <div>
                  <KV k={t('common.temperature')} v={temp(tc, settings.tempUnit)} />
                  <KV k={t('sto.hours')} v={isNum(d.powerOnHours) ? String(d.powerOnHours) : 'N/A'} />
                  <KV k={`${t('sto.read')} / ${t('sto.write')}`} v={io2 ? `${rate(io2.readSec)} / ${rate(io2.writeSec)}` : 'N/A'} />
                  <KV k={t('sto.active')} v={pct(io2?.activePercent)} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      <h2 className="pt-2 text-[14px] font-semibold">{t('sto.volumes')}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(snap?.fs ?? []).map((f) => (
          <Card key={f.mount}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">{f.mount}</span>
              <span className="text-[11.5px] text-muted">{f.type}</span>
            </div>
            <Meter value={f.percent} tone={100 - f.percent < settings.alerts.storageLow.threshold ? 'bad' : f.percent > 80 ? 'warn' : undefined} />
            <div className="mt-2 flex justify-between text-[12px] tabular">
              <span>{t('common.used')}: {bytes(f.used)}</span>
              <span className="text-muted">{t('common.free')}: {bytes(f.available)} / {bytes(f.size)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
