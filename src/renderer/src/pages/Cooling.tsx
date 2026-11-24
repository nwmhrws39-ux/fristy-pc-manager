import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, Fan, Play, RefreshCw, ShieldAlert, Info } from 'lucide-react'
import type { FanControlStatus } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Badge, Card, Empty, KV, Note, PageHeader } from '../components/ui'
import { isNum, pct, rpm, temp } from '../format'

export function CoolingPage() {
  const { snap, settings, setSettings, t, toast, app } = useStore()
  const [fc, setFc] = useState<FanControlStatus | null>(null)
  const [path, setPath] = useState(settings.fanControlPath)
  const load = useCallback(async () => {
    setFc(null)
    setFc(await api.fanControlStatus())
  }, [])
  useEffect(() => void load(), [load, settings.fanControlPath])
  useEffect(() => setPath(settings.fanControlPath), [settings.fanControlPath])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, refresh = false) => {
    const r = await fn()
    if (!r.ok && r.error !== 'cancelled') toast(r.error ?? t('common.error'), 'err')
    if (refresh) setTimeout(() => void load(), 4000)
  }
  const maxRpm = Math.max(1, ...(snap?.fans ?? []).map((f) => f.rpm))
  const gpus = snap?.gpus.filter((g) => isNum(g.fanPercent) || isNum(g.fanRpm)) ?? []

  return (
    <div className="space-y-4">
      <PageHeader title={t('cool.title')} right={<button className="btn" onClick={() => void load()}><RefreshCw size={14} /> {t('common.refresh')}</button>} />

      <Card title={t('cool.fc')} icon={Fan} right={fc && fc.supported && (
        <div className="flex gap-1.5">
          <Badge tone={fc.installed ? 'ok' : 'muted'}>{fc.installed ? t('cool.installed') : t('cool.notInstalled')}</Badge>
          <Badge tone={fc.running ? 'ok' : 'muted'}>{fc.running ? t('cool.running') : t('cool.notRunning')}</Badge>
        </div>
      )}>
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{t('cool.fcAbout')}</p>
        {!app?.isWindows ? (
          <Empty>{t('cool.unsupported')}</Empty>
        ) : !fc ? (
          <div className="text-muted">{t('cool.checking')}</div>
        ) : (
          <div className="space-y-3">
            {fc.path && <KV k="FanControl.exe" v={fc.path} mono />}
            <div className="flex flex-wrap gap-2">
              {fc.installed && <button className="btn btn-accent" onClick={() => void run(api.fanControlLaunch, true)}><Play size={14} /> {t('cool.open')}</button>}
              {!fc.installed && <button className="btn btn-accent" onClick={() => void run(api.fanControlInstall, true)}><Download size={14} /> {t('cool.install')}</button>}
              <button className="btn" onClick={() => void api.fanControlWebsite()}><ExternalLink size={14} /> {t('cool.website')}</button>
            </div>
            <div>
              <div className="label mb-1">{t('cool.path')}</div>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-[12px]" dir="ltr" placeholder="C:\Program Files (x86)\FanControl\FanControl.exe" value={path} onChange={(e) => setPath(e.target.value)} />
                <button className="btn" onClick={() => void setSettings({ fanControlPath: path }).then(() => toast('✓'))}>{t('cool.save')}</button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('cool.readings')} icon={Fan}>
          {(snap?.fans.length ?? 0) === 0 && gpus.length === 0 ? (
            <div className="text-[12.5px] text-muted">{t('cool.noReadings')}</div>
          ) : (
            <div className="space-y-3">
              {snap?.fans.map((f) => (
                <div key={f.name}>
                  <div className="mb-1 flex justify-between text-[12.5px]"><span>{f.name}</span><span className="tabular">{rpm(f.rpm)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line/60"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(f.rpm / maxRpm) * 100}%` }} /></div>
                </div>
              ))}
              {gpus.map((g) => (
                <KV key={g.index} k={`${t('cool.gpuFans')} · ${g.name}`} v={`${isNum(g.fanPercent) ? pct(g.fanPercent) : ''}${isNum(g.fanPercent) && isNum(g.fanRpm) ? ' · ' : ''}${isNum(g.fanRpm) ? rpm(g.fanRpm) : ''}`} />
              ))}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-6">
            <KV k="CPU °" v={temp(snap?.cpu.tempC, settings.tempUnit)} />
            <KV k="GPU °" v={temp(snap?.gpus[0]?.tempC, settings.tempUnit)} />
          </div>
        </Card>
        <Card title={t('cool.steps')} icon={Info}>
          <ol className="list-decimal space-y-2 ps-5 text-[12.5px]">
            <li>{t('cool.s1')}</li>
            <li>{t('cool.s2')}</li>
            <li>{t('cool.s3')}</li>
            <li>{t('cool.s4')}</li>
          </ol>
          <div className="mt-4 space-y-2">
            <Note icon={ShieldAlert}>{t('cool.safety')}</Note>
            <Note icon={Info}>{t('cool.coexist')}</Note>
          </div>
        </Card>
      </div>
    </div>
  )
}
