import { useEffect, useState } from 'react'
import { Bell, Gamepad2, Gauge, Info, Languages, Palette, Power, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { OverlayPosition, Threshold } from '@shared/settings'
import { api } from '../api'
import { useStore } from '../store'
import { Card, Note, PageHeader, Segmented, Toggle } from '../components/ui'
import { tempVal } from '../format'

const ACCENTS = ['#8b5cf6', '#a855f7', '#6366f1', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

function Row({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="border-b border-line/40 py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <span>{label}</span>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {note && <div className="mt-1 text-[11.5px] text-muted">{note}</div>}
    </div>
  )
}

function NumberField({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  return (
    <span className="inline-flex items-center gap-1.5">
      <input type="number" className="input w-20 text-end tabular" min={min} max={max} step={step} value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
          else setV(String(value))
        }} />
      {suffix && <span className="text-muted">{suffix}</span>}
    </span>
  )
}

export function SettingsPage() {
  const { settings: s, setSettings, t, app, toast } = useStore()
  const [compat, setCompat] = useState<Awaited<ReturnType<typeof api.overlayCompat>> | null>(null)
  const [pm, setPm] = useState(s.presentMonPath)
  useEffect(() => void api.overlayCompat().then(setCompat), [s.overlay.enabled, s.presentMonPath])
  useEffect(() => setPm(s.presentMonPath), [s.presentMonPath])

  const unit = s.tempUnit
  // Temperature thresholds are stored in °C; displayed/entered in the selected unit.
  const tIn = (c: number) => Math.round(tempVal(c, unit))
  const tOut = (v: number) => (unit === 'F' ? Math.round(((v - 32) * 5) / 9) : v)
  const ThrRow = ({ k, label, kind }: { k: 'cpuTemp' | 'gpuTemp' | 'ram' | 'storageLow'; label: string; kind: 'temp' | 'pct' }) => {
    const th = s.alerts[k] as Threshold
    const [min, max] = kind === 'temp' ? [tIn(40), tIn(110)] : k === 'storageLow' ? [1, 50] : [50, 99]
    return (
      <Row label={label}>
        <NumberField value={kind === 'temp' ? tIn(th.threshold) : th.threshold} min={min} max={max} suffix={kind === 'temp' ? `°${unit}` : '%'} onChange={(v) => void setSettings({ alerts: { [k]: { threshold: kind === 'temp' ? tOut(v) : v } } })} />
        <Toggle checked={th.enabled} onChange={(v) => void setSettings({ alerts: { [k]: { enabled: v } } })} />
      </Row>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('set.title')} sub={`FRISTY PC Manager v${app?.version ?? ''}`} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('set.general')} icon={Power}>
          <Toggle label={t('set.startWin')} checked={s.startWithWindows} onChange={(v) => void setSettings({ startWithWindows: v })} disabled={!app?.isWindows} />
          <Toggle label={t('set.startMin')} checked={s.startMinimized} onChange={(v) => void setSettings({ startMinimized: v })} />
          <Toggle label={t('set.tray')} checked={s.minimizeToTray} onChange={(v) => void setSettings({ minimizeToTray: v })} />
          <Row label={t('set.lang')}>
            <Languages size={14} className="text-muted" />
            <Segmented value={s.language} onChange={(v) => void setSettings({ language: v })} options={[{ value: 'en', label: 'English' }, { value: 'he', label: 'עברית' }]} />
          </Row>
        </Card>

        <Card title={t('set.appearance')} icon={Palette}>
          <Row label={t('set.theme')}>
            <Segmented value={s.theme} onChange={(v) => void setSettings({ theme: v })} options={[{ value: 'dark', label: t('set.dark') }, { value: 'light', label: t('set.light') }]} />
          </Row>
          <Row label={t('set.accent')}>
            {ACCENTS.map((c) => (
              <button key={c} aria-label={c} onClick={() => void setSettings({ accent: c })} className={`h-6 w-6 rounded-full border-2 ${s.accent === c ? 'border-fg' : 'border-transparent'}`} style={{ background: c }} />
            ))}
            <input type="color" aria-label="custom" value={s.accent} onChange={(e) => void setSettings({ accent: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent" />
          </Row>
          <Row label={t('set.unit')}>
            <Segmented value={s.tempUnit} onChange={(v) => void setSettings({ tempUnit: v })} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} />
          </Row>
        </Card>

        <Card title={t('set.monitoring')} icon={Gauge}>
          <Row label={t('set.refresh')} note={t('set.refreshNote')}>
            <Segmented value={String(s.refreshMs)} onChange={(v) => void setSettings({ refreshMs: Number(v) })} options={['500', '1000', '2000', '5000'].map((v) => ({ value: v, label: `${Number(v) / 1000}s` }))} />
          </Row>
          <Toggle label={t('set.history')} checked={s.history.enabled} onChange={(v) => void setSettings({ history: { enabled: v } })} />
          <Row label={t('set.retention')}>
            <NumberField value={s.history.retentionDays} min={1} max={365} suffix={t('set.days')} onChange={(v) => void setSettings({ history: { retentionDays: v } })} />
          </Row>
        </Card>

        <Card title={t('set.alerts')} icon={Bell}>
          <Toggle label={t('set.alertsOn')} checked={s.alerts.enabled} onChange={(v) => void setSettings({ alerts: { enabled: v } })} />
          <div className={s.alerts.enabled ? '' : 'pointer-events-none opacity-40'}>
            <ThrRow k="cpuTemp" label={t('set.cpuTemp')} kind="temp" />
            <ThrRow k="gpuTemp" label={t('set.gpuTemp')} kind="temp" />
            <ThrRow k="ram" label={t('set.ram')} kind="pct" />
            <ThrRow k="storageLow" label={t('set.storageLow')} kind="pct" />
            <Toggle label={t('set.storageHealth')} checked={s.alerts.storageHealth.enabled} onChange={(v) => void setSettings({ alerts: { storageHealth: { enabled: v } } })} />
            <Row label={t('set.cooldown')}>
              <NumberField value={s.alerts.cooldownMin} min={1} max={1440} suffix={t('set.minutes')} onChange={(v) => void setSettings({ alerts: { cooldownMin: v } })} />
            </Row>
          </div>
        </Card>

        <Card title={t('set.overlay')} icon={Gamepad2} className="xl:col-span-2">
          <div className="grid gap-x-8 xl:grid-cols-2">
            <div>
              <Toggle label={`${t('set.overlayOn')} (${s.overlay.hotkey.replace('CommandOrControl', 'Ctrl')})`} checked={s.overlay.enabled} onChange={(v) => void setSettings({ overlay: { enabled: v } })} />
              <Row label={t('set.position')}>
                <select className="input" value={s.overlay.position} onChange={(e) => void setSettings({ overlay: { position: e.target.value as OverlayPosition } })}>
                  <option value="top-left">{t('set.tl')}</option>
                  <option value="top-right">{t('set.tr')}</option>
                  <option value="bottom-left">{t('set.bl')}</option>
                  <option value="bottom-right">{t('set.br')}</option>
                </select>
              </Row>
              <Row label={`${t('set.scale')} (${Math.round(s.overlay.scale * 100)}%)`}>
                <input type="range" min={0.6} max={2} step={0.1} value={s.overlay.scale} onChange={(e) => void setSettings({ overlay: { scale: Number(e.target.value) } })} />
              </Row>
              <Row label={`${t('set.opacity')} (${Math.round(s.overlay.opacity * 100)}%)`}>
                <input type="range" min={0.2} max={1} step={0.05} value={s.overlay.opacity} onChange={(e) => void setSettings({ overlay: { opacity: Number(e.target.value) } })} />
              </Row>
              <div className="label mt-3">{t('set.metrics')}</div>
              <div className="grid grid-cols-2 gap-x-6">
                {(Object.keys(s.overlay.metrics) as (keyof typeof s.overlay.metrics)[]).map((m) => (
                  <Toggle key={m} label={{ cpu: 'CPU', gpu: 'GPU', cpuTemp: 'CPU °', gpuTemp: 'GPU °', ram: 'RAM', vram: 'VRAM', fps: 'FPS' }[m]} checked={s.overlay.metrics[m]} onChange={(v) => void setSettings({ overlay: { metrics: { [m]: v } } })} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="label mb-1">{t('set.presentmon')}</div>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono text-[12px]" dir="ltr" placeholder="C:\Tools\PresentMon.exe" value={pm} onChange={(e) => setPm(e.target.value)} />
                  <button className="btn" onClick={() => void setSettings({ presentMonPath: pm }).then(() => toast('✓'))}>OK</button>
                </div>
                <div className="mt-1 text-[11.5px] text-muted">{t('set.presentmonNote')}</div>
                {compat && <div className="mt-1 text-[11.5px]">{t('set.fpsStatus')}: <span className={compat.fpsStatus === 'error' ? 'text-bad' : 'text-muted'}>{compat.fpsStatus}{compat.fpsError ? ` — ${compat.fpsError}` : ''}{compat.fpsApp ? ` (${compat.fpsApp})` : ''}</span></div>}
              </div>
              <div>
                <div className="label mb-1">{t('set.compat')}</div>
                <ul className="list-disc space-y-1 ps-5 text-[12px] text-muted" dir="ltr">
                  {compat?.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </Card>

        <Card title={t('set.admin')} icon={app?.isAdmin ? ShieldCheck : ShieldAlert}>
          <Row label={app?.isAdmin ? t('app.admin') : t('app.standard')} note={t('set.adminNote')}>
            {app?.isWindows && !app.isAdmin && (
              <button className="btn" onClick={() => void api.relaunchAdmin().then((r) => !r.ok && r.error !== 'cancelled' && toast(r.error ?? '', 'err'))}>
                <ShieldCheck size={14} /> {t('common.restartAdmin')}
              </button>
            )}
          </Row>
        </Card>
        <Card title={t('set.about')} icon={Info}>
          <div className="space-y-2 text-[12.5px]">
            <div>FRISTY PC Manager v{app?.version} · {app?.platform}</div>
            <Note>{t('set.safety')}</Note>
          </div>
        </Card>
      </div>
    </div>
  )
}
