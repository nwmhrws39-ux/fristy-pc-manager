import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, Undo2, ShieldAlert, Info } from 'lucide-react'
import type { StartupItem } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Badge, Card, Empty, Note, PageHeader } from '../components/ui'

export function StartupPage() {
  const { t, toast, app } = useStore()
  const [items, setItems] = useState<StartupItem[] | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null)
    const r = await api.getStartup()
    setItems(r.data ?? [])
    setMsg(r.ok ? (r.error ?? '') : (r.error ?? t('common.error')))
  }, [t])
  useEffect(() => void load(), [load])

  const act = async (it: StartupItem, fn: () => Promise<{ ok: boolean; error?: string; needsAdmin?: boolean }>) => {
    setBusy(it.id)
    const r = await fn()
    setBusy(null)
    if (r.ok) await load()
    else if (r.error !== 'cancelled') toast(r.needsAdmin ? `${t('common.needsAdmin')} ${t('common.restartAdmin')} → ${t('nav.settings')}` : r.error ?? t('common.error'), 'err')
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('st.title')} sub={items ? `${items.filter((i) => i.enabled).length} / ${items.length} ${t('common.enabled').toLowerCase()}` : ''} right={<button className="btn" onClick={() => void load()}><RefreshCw size={14} /> {t('common.refresh')}</button>} />
      <Note icon={Info}>{t('st.note')} {!app?.isAdmin && t('st.adminNote')}</Note>
      {!app?.isWindows && <Empty>{t('st.unsupported')}</Empty>}
      {msg && app?.isWindows && <div className="text-bad">{msg}</div>}
      {app?.isWindows && (
        <Card pad={false}>
          <table className="w-full text-[12.5px]">
            <thead className="text-muted">
              <tr className="border-b border-line/60">
                {[t('common.name'), t('st.publisher'), t('st.location'), t('common.status'), ''].map((h, i) => (
                  <th key={i} className="px-4 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items === null && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t('app.loading')}</td></tr>
              )}
              {items?.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t('common.none')}</td></tr>
              )}
              {items?.map((it) => (
                <tr key={it.id} className="border-b border-line/30 last:border-0">
                  <td className="max-w-[280px] px-4 py-2">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="selectable truncate font-mono text-[11px] text-muted" title={it.command}>{it.command}</div>
                  </td>
                  <td className="px-4 py-2">{it.publisher || <span className="text-muted/70">N/A</span>}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1 text-muted">
                      {it.requiresAdmin && <ShieldAlert size={12} aria-label="admin" />}
                      {it.location}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={it.enabled ? 'ok' : 'muted'}>{it.enabled ? t('common.enabled') : t('common.disabled')}</Badge>
                      {it.originalEnabled !== null && <Badge tone="accent">{t('st.modified')}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn" disabled={!it.path} title={t('common.openLocation')} onClick={() => void api.openPath(it.path).then((r) => !r.ok && toast(r.error ?? '', 'err'))}>
                        <FolderOpen size={14} />
                      </button>
                      {it.originalEnabled !== null && it.originalEnabled !== it.enabled && (
                        <button className="btn" disabled={busy === it.id} onClick={() => void act(it, () => api.restoreStartup(it.id))}>
                          <Undo2 size={14} /> {t('st.restore')}
                        </button>
                      )}
                      <button className={`btn ${it.enabled ? '' : 'btn-accent'}`} disabled={busy === it.id} onClick={() => void act(it, () => api.setStartup(it.id, !it.enabled))}>
                        {it.enabled ? t('st.disable') : t('st.enable')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
