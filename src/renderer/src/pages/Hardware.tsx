import { CircuitBoard, Copy, Cpu, Download, Gpu, HardDrive, Monitor, MemoryStick, RefreshCw, Laptop, AppWindow } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'
import { Badge, Card, KV, PageHeader } from '../components/ui'
import { bytes, mb } from '../format'

export function HardwarePage() {
  const { info, t, toast, refreshStatic } = useStore()
  const exp = async (f: 'txt' | 'json') => {
    const r = await api.exportSpecs(f)
    if (r.ok) toast(`${t('common.saved')} ${r.data}`)
    else if (r.error !== 'cancelled') toast(r.error ?? t('common.error'), 'err')
  }
  if (!info) return <div className="p-10 text-center text-muted">{t('app.loading')}</div>
  const memTotal = info.memModules.reduce((a, m) => a + m.size, 0)
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('hw.title')}
        sub={`${info.system.manufacturer} ${info.system.model}`}
        right={
          <>
            <button className="btn" onClick={() => void refreshStatic()}><RefreshCw size={14} /> {t('common.refresh')}</button>
            <button className="btn" onClick={() => void api.copyText('specs').then(() => toast(t('common.copied')))}><Copy size={14} /> {t('hw.copy')}</button>
            <button className="btn" onClick={() => void exp('txt')}><Download size={14} /> {t('hw.exportTxt')}</button>
            <button className="btn" onClick={() => void exp('json')}><Download size={14} /> {t('hw.exportJson')}</button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('hw.computer')} icon={Laptop}>
          <KV k={t('hw.manufacturer')} v={info.system.manufacturer} />
          <KV k={t('common.model')} v={info.system.model} />
          <KV k={t('hw.chassis')} v={info.chassis.type} />
          <KV k={t('hw.hostname')} v={info.os.hostname} />
        </Card>
        <Card title={t('hw.os')} icon={AppWindow}>
          <KV k={t('hw.os')} v={info.os.distro} />
          <KV k={t('hw.version')} v={info.os.release} />
          <KV k={t('hw.build')} v={info.os.build || info.os.kernel} />
          <KV k={t('cpu.arch')} v={info.os.arch} />
        </Card>
        <Card title={t('hw.board')} icon={CircuitBoard}>
          <KV k={t('hw.manufacturer')} v={info.baseboard.manufacturer} />
          <KV k={t('common.model')} v={info.baseboard.model} />
          <KV k={t('hw.version')} v={info.baseboard.version} />
        </Card>
        <Card title={t('hw.bios')} icon={CircuitBoard}>
          <KV k={t('common.vendor')} v={info.bios.vendor} />
          <KV k={t('hw.version')} v={info.bios.version} />
          <KV k={t('hw.date')} v={info.bios.releaseDate} />
        </Card>
        <Card title={t('nav.cpu')} icon={Cpu}>
          <KV k={t('common.model')} v={info.cpu.brand} />
          <KV k={`${t('cpu.cores')} / ${t('cpu.threads')}`} v={`${info.cpu.physicalCores} / ${info.cpu.cores}`} />
          <KV k={t('cpu.base')} v={info.cpu.speedBaseGHz ? `${info.cpu.speedBaseGHz} GHz` : 'N/A'} />
          <KV k={t('cpu.socket')} v={info.cpu.socket} />
        </Card>
        <Card title={t('nav.memory')} icon={MemoryStick}>
          <KV k={t('mem.installed')} v={memTotal ? bytes(memTotal) : 'N/A'} />
          <KV k={t('mem.modules')} v={String(info.memModules.length || 'N/A')} />
          <KV k={t('mem.type')} v={info.memModules[0]?.type} />
          <KV k={t('mem.speed')} v={info.memModules[0]?.clockSpeed ? `${info.memModules[0].clockSpeed} MT/s` : 'N/A'} />
        </Card>
        <Card title={t('nav.gpu')} icon={Gpu}>
          {info.gpus.length === 0 && <div className="text-muted">N/A</div>}
          {info.gpus.map((g) => (
            <KV key={g.index} k={g.model} v={`${mb(g.vramMB)} · ${g.driverVersion || 'N/A'}`} />
          ))}
        </Card>
        <Card title={t('nav.storage')} icon={HardDrive}>
          {info.disks.map((d, i) => (
            <KV key={i} k={<span className="flex items-center gap-2">{d.name}<Badge>{d.type}</Badge></span>} v={`${bytes(d.size, 0)} · ${d.interfaceType || 'N/A'}`} />
          ))}
        </Card>
      </div>
      <Card title={t('hw.displays')} icon={Monitor}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {info.displays.length === 0 && <div className="text-muted">N/A</div>}
          {info.displays.map((d, i) => (
            <div key={i} className="rounded-lg border border-line/60 bg-panel2/50 p-3">
              <div className="mb-2 flex items-center gap-2 font-medium">
                {d.model}
                {d.main && <Badge tone="accent">{t('hw.primary')}</Badge>}
              </div>
              <KV k={t('hw.resolution')} v={d.resolutionX && d.resolutionY ? `${d.resolutionX} × ${d.resolutionY}` : 'N/A'} />
              <KV k={t('hw.refresh')} v={d.refreshRate ? `${d.refreshRate} Hz` : 'N/A'} />
              <KV k={t('hw.connection')} v={d.connection} />
              <KV k={t('hw.size')} v={d.sizeInches ? `${d.sizeInches}"` : 'N/A'} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
