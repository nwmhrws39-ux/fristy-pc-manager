import { Gamepad2, ArrowDown, ArrowUp, Clock, Cpu, Fan, Gpu, HardDrive, Info, MemoryStick, Network, Thermometer, Zap, Activity } from 'lucide-react'
import { useStore } from '../store'
import { Card, Meter, Note, PageHeader, Ring, Stat, StatusDot } from '../components/ui'
import { LiveChart, S1, S2, S3 } from '../components/LiveChart'
import { bytes, duration, isNum, level, mb, mhz, rate, rpm, temp, watts } from '../format'
import { sumNet, useSeries } from './common'

export function Overview() {
  const { snap, info, t, settings } = useStore()
  const u = settings.tempUnit
  const gpu = snap?.gpus[0]
  const usage = useSeries({ cpu: (s) => s.cpu.load, gpu: (s) => s.gpus[0]?.util, ram: (s) => s.mem.percent })
  const net = useSeries({ rx: (s) => sumNet(s, 'rxSec'), tx: (s) => sumNet(s, 'txSec') })
  const vramPct = gpu && isNum(gpu.vramUsedMB) && isNum(gpu.vramTotalMB) && gpu.vramTotalMB > 0 ? (gpu.vramUsedMB / gpu.vramTotalMB) * 100 : null
  const lvl = (l: ReturnType<typeof level>) => (l === 'ok' ? t('ov.healthy') : l === 'warn' ? t('ov.warm') : l === 'bad' ? t('ov.hot') : t('common.na'))
  const worstFs = snap?.fs.reduce<number | null>((m, f) => (m === null || f.percent > m ? f.percent : m), null) ?? null

  if (!snap) return <div className="p-10 text-center text-muted">{t('app.loading')}</div>
  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.overview')} sub={`${info?.system.manufacturer ?? ''} ${info?.system.model ?? ''} · ${info?.os.distro ?? ''}`} />
      {snap.sensorSource === 'none' && <Note icon={Info}>{t('common.sensorHint')}</Note>}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card title={t('ov.cpu')} icon={Cpu}>
          <div className="flex items-center gap-4">
            <Ring value={snap.cpu.load} />
            <div className="min-w-0 space-y-2">
              <Stat label={t('common.temperature')} value={temp(snap.cpu.tempC, u)} icon={Thermometer} />
              <div className="text-[12px] text-muted tabular">{mhz(snap.cpu.speedMHz)}</div>
            </div>
          </div>
          <div className="mt-3 truncate text-[11.5px] text-muted" title={info?.cpu.brand}>{info?.cpu.brand}</div>
        </Card>
        <Card title={t('ov.gpu')} icon={Gpu}>
          <div className="flex items-center gap-4">
            <Ring value={gpu?.util ?? null} />
            <div className="min-w-0 space-y-2">
              <Stat label={t('common.temperature')} value={temp(gpu?.tempC, u)} icon={Thermometer} />
              <div className="text-[12px] text-muted tabular">{mhz(gpu?.coreClockMHz)}</div>
            </div>
          </div>
          <div className="mt-3 truncate text-[11.5px] text-muted" title={gpu?.name}>{gpu?.name ?? t('gpu.none')}</div>
        </Card>
        <Card title={t('ov.ram')} icon={MemoryStick}>
          <div className="flex items-center gap-4">
            <Ring value={snap.mem.percent} />
            <div className="min-w-0 space-y-2">
              <Stat label={t('common.used')} value={bytes(snap.mem.used)} />
              <div className="text-[12px] text-muted tabular">/ {bytes(snap.mem.total)}</div>
            </div>
          </div>
          <div className="mt-3 text-[11.5px] text-muted">{t('common.available')}: {bytes(snap.mem.available)}</div>
        </Card>
        <Card title={t('ov.vram')} icon={Gpu}>
          <div className="flex items-center gap-4">
            <Ring value={vramPct} />
            <div className="min-w-0 space-y-2">
              <Stat label={t('common.used')} value={mb(gpu?.vramUsedMB)} />
              <div className="text-[12px] text-muted tabular">/ {mb(gpu?.vramTotalMB)}</div>
            </div>
          </div>
          <div className="mt-3 text-[11.5px] text-muted">{t('common.source')}: {gpu?.source ?? 'none'}</div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('common.usage')} icon={Activity} right={<span className="text-[11.5px] text-muted">{t('common.last60')}</span>}>
          <LiveChart data={usage} max={100} series={[{ key: 'cpu', label: t('ov.cpu'), color: S1 }, { key: 'gpu', label: t('ov.gpu'), color: S2 }, { key: 'ram', label: t('ov.ram'), color: S3 }]} />
        </Card>
        <Card
          title={t('ov.network')} icon={Network}
          right={
            <div className="flex gap-4 text-[12px] tabular">
              <span className="flex items-center gap-1"><ArrowDown size={12} className="text-muted" />{rate(sumNet(snap, 'rxSec'))}</span>
              <span className="flex items-center gap-1"><ArrowUp size={12} className="text-muted" />{rate(sumNet(snap, 'txSec'))}</span>
            </div>
          }
        >
          <LiveChart data={net} fmt={(v) => bytes(v, 0) + '/s'} series={[{ key: 'rx', label: t('ov.download'), color: S1 }, { key: 'tx', label: t('ov.upload'), color: S2 }]} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-4 lg:grid-cols-2">
        <Card title={t('ov.storage')} icon={HardDrive}>
          <div className="space-y-3">
            {snap.fs.length === 0 && <div className="text-muted">{t('common.na')}</div>}
            {snap.fs.slice(0, 5).map((f) => (
              <div key={f.mount}>
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="font-medium">{f.mount}</span>
                  <span className="text-muted tabular">{bytes(f.used, 0)} / {bytes(f.size, 0)}</span>
                </div>
                <Meter value={f.percent} tone={100 - f.percent < settings.alerts.storageLow.threshold ? 'bad' : f.percent > 80 ? 'warn' : undefined} />
              </div>
            ))}
          </div>
        </Card>
        <Card title={t('ov.fans')} icon={Fan}>
          {snap.fans.length === 0 ? (
            <div className="text-[12px] text-muted">{t('ov.noFans')}</div>
          ) : (
            <div className="space-y-1.5">
              {snap.fans.slice(0, 6).map((f) => (
                <div key={f.name} className="flex justify-between text-[12.5px]">
                  <span className="truncate text-muted">{f.name}</span>
                  <span className="tabular">{rpm(f.rpm)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title={t('ov.status')} icon={Thermometer}>
          <div className="space-y-2">
            <div className="flex justify-between"><span>{t('ov.cpu')}</span><StatusDot level={level('temp', snap.cpu.tempC)} label={lvl(level('temp', snap.cpu.tempC))} /></div>
            <div className="flex justify-between"><span>{t('ov.gpu')}</span><StatusDot level={level('temp', gpu?.tempC)} label={lvl(level('temp', gpu?.tempC))} /></div>
            <div className="flex justify-between"><span>{t('ov.ram')}</span><StatusDot level={level('load', snap.mem.percent)} label={lvl(level('load', snap.mem.percent))} /></div>
            <div className="flex justify-between"><span>{t('ov.storage')}</span><StatusDot level={level('load', worstFs)} label={lvl(level('load', worstFs))} /></div>
          </div>
        </Card>
        <Card title={t('ov.uptime')} icon={Clock}>
          <div className="space-y-3">
            <Stat label={t('ov.uptime')} value={duration(snap.uptimeSec, settings.language)} />
            <Stat label={t('ov.power')} value={watts(snap.powerW)} sub={t('ov.powerNote')} icon={Zap} />
            {settings.presentMonPath && <Stat label={t('fps.fps')} value={snap.fps !== null ? String(snap.fps) : 'N/A'} icon={Gamepad2} />}
          </div>
        </Card>
      </div>
    </div>
  )
}
