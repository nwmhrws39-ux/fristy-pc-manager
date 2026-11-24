import { ArrowDown, ArrowUp, Wifi, Network } from 'lucide-react'
import { useStore } from '../store'
import { Badge, Card, KV, PageHeader, Stat } from '../components/ui'
import { LiveChart, S1, S2 } from '../components/LiveChart'
import { bits, bytes, rate } from '../format'
import { sumNet, useSeries } from './common'

export function NetworkPage() {
  const { snap, info, t } = useStore()
  const series = useSeries({ rx: (s) => sumNet(s, 'rxSec'), tx: (s) => sumNet(s, 'txSec') })
  const totals = (k: 'rxTotal' | 'txTotal') => {
    const v = (snap?.net ?? []).map((n) => n[k]).filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) : null
  }
  const def = info?.net.find((n) => n.default)
  return (
    <div className="space-y-4">
      <PageHeader title={t('net.title')} sub={def ? `${def.ifaceName || def.iface} · ${def.ip4}` : ''} />
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={t('ov.download')} value={rate(snap ? sumNet(snap, 'rxSec') : null)} sub={bits(snap ? sumNet(snap, 'rxSec') : null)} icon={ArrowDown} />
          <Stat label={t('ov.upload')} value={rate(snap ? sumNet(snap, 'txSec') : null)} sub={bits(snap ? sumNet(snap, 'txSec') : null)} icon={ArrowUp} />
          <Stat label={t('net.totalRx')} value={bytes(totals('rxTotal'))} />
          <Stat label={t('net.totalTx')} value={bytes(totals('txTotal'))} />
        </div>
      </Card>
      <Card title={t('net.activity')} right={<span className="text-[11.5px] text-muted">{t('common.last60')}</span>}>
        <LiveChart data={series} height={220} fmt={(v) => bytes(v, 0) + '/s'} series={[{ key: 'rx', label: t('ov.download'), color: S1 }, { key: 'tx', label: t('ov.upload'), color: S2 }]} />
      </Card>
      <h2 className="pt-2 text-[14px] font-semibold">{t('net.adapters')}</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {(info?.net ?? []).map((n) => {
          const live = snap?.net.find((x) => x.iface === n.iface)
          const up = (live?.operstate ?? n.operstate) === 'up'
          return (
            <Card key={n.iface} title={n.ifaceName || n.iface} icon={n.type === 'wireless' ? Wifi : Network}
              right={<div className="flex gap-1.5">{n.default && <Badge tone="accent">{t('net.default')}</Badge>}<Badge tone={up ? 'ok' : 'muted'}>{up ? t('net.connected') : t('net.disconnected')}</Badge></div>}>
              <KV k={t('common.type')} v={n.type + (n.virtual ? ' (virtual)' : '')} />
              <KV k={t('net.ip4')} v={n.ip4} mono />
              <KV k={t('net.ip6')} v={n.ip6} mono />
              <KV k={t('net.mac')} v={n.mac} mono />
              <KV k={t('net.linkSpeed')} v={n.speedMbps ? `${n.speedMbps} Mbps` : 'N/A'} />
              <KV k={`${t('ov.download')} / ${t('ov.upload')}`} v={live ? `${rate(live.rxSec)} / ${rate(live.txSec)}` : 'N/A'} />
            </Card>
          )
        })}
      </div>
    </div>
  )
}
