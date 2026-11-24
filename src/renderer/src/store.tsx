import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, Settings } from '@shared/settings'
import type { AppInfo, Snapshot, StaticInfo } from '@shared/types'
import { IPC } from '@shared/ipc'
import { api, DeepPartial } from './api'
import { I18nKey, translate } from './i18n'

const BUFFER = 60

interface Store {
  snap: Snapshot | null
  buffer: Snapshot[]
  info: StaticInfo | null
  app: AppInfo | null
  settings: Settings
  setSettings: (p: DeepPartial<Settings>) => Promise<void>
  refreshStatic: () => Promise<void>
  t: (k: I18nKey) => string
  toast: (msg: string, kind?: 'ok' | 'err') => void
  toasts: { id: number; msg: string; kind: 'ok' | 'err' }[]
}

const Ctx = createContext<Store | null>(null)

export function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function applyTheme(s: Settings): void {
  const root = document.documentElement
  root.classList.toggle('dark', s.theme === 'dark')
  root.classList.toggle('light', s.theme === 'light')
  root.dir = s.language === 'he' ? 'rtl' : 'ltr'
  root.lang = s.language
  root.style.setProperty('--accent', hexToRgb(s.accent))
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [buffer, setBuffer] = useState<Snapshot[]>([])
  const [info, setInfo] = useState<StaticInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState<Store['toasts']>([])
  const tid = useRef(0)

  useEffect(() => {
    void api.getSettings().then((s) => (setLocal(s), applyTheme(s)))
    void api.getAppInfo().then(setAppInfo)
    void api.getStatic().then(setInfo).catch(() => undefined)
    void api.getSnapshot().then((s) => s && (setSnap(s), setBuffer([s])))
    const offSnap = api.on(IPC.onSnapshot, (p) => {
      const s = p as Snapshot
      setSnap(s)
      setBuffer((b) => (b.length >= BUFFER ? [...b.slice(b.length - BUFFER + 1), s] : [...b, s]))
    })
    const offSet = api.on(IPC.onSettings, (p) => {
      setLocal(p as Settings)
      applyTheme(p as Settings)
    })
    return () => (offSnap(), offSet())
  }, [])

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const value = useMemo<Store>(
    () => ({
      snap, buffer, info, app: appInfo, settings, toasts, toast,
      t: (k) => translate(settings.language, k),
      setSettings: async (p) => {
        const s = await api.setSettings(p)
        setLocal(s)
        applyTheme(s)
      },
      refreshStatic: async () => setInfo(await api.getStatic(true))
    }),
    [snap, buffer, info, appInfo, settings, toasts, toast]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('StoreProvider missing')
  return c
}
