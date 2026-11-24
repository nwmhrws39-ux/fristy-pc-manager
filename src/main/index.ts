import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, IpcMainInvokeEvent, Menu, nativeImage, Notification, session, shell, Tray } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import si from 'systeminformation'
import { IPC, PushChannel } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import type { ActionResult, AppInfo, HistoryRange, Snapshot } from '@shared/types'
import { Monitor } from './monitor'
import { HistoryStore } from './history'
import { SettingsStore } from './settingsStore'
import { StartupManager } from './startup'
import { listProcesses, killProcess, findProcess } from './processes'
import { AlertEngine } from './alerts'
import { OverlayWindow, overlayCompat } from './overlay'
import { specsToText } from './specs'
import { isTrustedRendererUrl } from './security'
import { isWin, psQuote, runPowerShell } from './ps'

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const startHidden = process.argv.includes('--hidden')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.setAppUserModelId('com.fristy.pcmanager')

const userData = app.getPath('userData')
const settings = new SettingsStore(path.join(userData, 'settings.json'))
const monitor = new Monitor()
const startup = new StartupManager(path.join(userData, 'startup-backup.json'))
const alerts = new AlertEngine()
let history: HistoryStore | null = null
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let isAdmin = false
const resourcesDir = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '../../resources')
const iconPath = path.join(resourcesDir, isWin ? 'icon.ico' : 'icon.png')

// ---------- localisation for main-process dialogs ----------
const T = {
  en: { cancel: 'Cancel', end: 'End process', endQ: (n: string, p: number) => `End "${n}" (PID ${p})?`, endD: 'Unsaved data in this application will be lost.', change: 'Apply', enableQ: (n: string) => `Enable "${n}" at Windows startup?`, disableQ: (n: string) => `Disable "${n}" at Windows startup?`, startupD: 'The entry is not deleted — you can re-enable or restore it at any time.', restoreQ: (n: string) => `Restore "${n}" to its original startup state?`, show: 'Show FRISTY', overlay: 'Gaming overlay', quit: 'Quit', admin: 'Restart FRISTY as administrator?', adminD: 'Windows will ask for permission (UAC). Monitoring continues after restart.', restart: 'Restart' },
  he: { cancel: 'ביטול', end: 'סיים תהליך', endQ: (n: string, p: number) => `לסיים את "${n}" (PID ${p})?`, endD: 'נתונים שלא נשמרו ביישום זה יאבדו.', change: 'החל', enableQ: (n: string) => `להפעיל את "${n}" בהפעלת Windows?`, disableQ: (n: string) => `להשבית את "${n}" בהפעלת Windows?`, startupD: 'הרשומה לא נמחקת — ניתן להפעיל או לשחזר אותה בכל עת.', restoreQ: (n: string) => `לשחזר את "${n}" למצב ההפעלה המקורי?`, show: 'הצג את FRISTY', overlay: 'שכבת משחק', quit: 'יציאה', admin: 'להפעיל מחדש את FRISTY כמנהל?', adminD: 'Windows יבקש הרשאה (UAC). הניטור ימשיך לאחר ההפעלה מחדש.', restart: 'הפעל מחדש' }
}
const tr = () => T[settings.get().language]

async function confirm(message: string, detail: string, okLabel: string): Promise<boolean> {
  const opts = { type: 'warning' as const, buttons: [okLabel, tr().cancel], defaultId: 1, cancelId: 1, noLink: true, title: 'FRISTY PC Manager', message, detail }
  const r = mainWindow ? await dialog.showMessageBox(mainWindow, opts) : await dialog.showMessageBox(opts)
  return r.response === 0
}

// ---------- windows ----------
const webPrefs = (): Electron.WebPreferences => ({
  preload: path.join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  backgroundThrottling: true
})

function loadPage(win: BrowserWindow, page: 'index' | 'overlay'): void {
  if (isDev) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`)
  else void win.loadFile(path.join(__dirname, `../renderer/${page}.html`))
}

function hardenContents(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
}

function createMainWindow(): void {
  const s = settings.get()
  mainWindow = new BrowserWindow({
    width: 1320, height: 840, minWidth: 1040, minHeight: 680,
    frame: false, show: false, backgroundColor: s.theme === 'dark' ? '#0a0a0f' : '#f4f4f8',
    title: 'FRISTY PC Manager', icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: webPrefs()
  })
  hardenContents(mainWindow)
  loadPage(mainWindow, 'index')
  mainWindow.once('ready-to-show', () => {
    if (!(startHidden || s.startMinimized)) mainWindow?.show()
    else if (!s.minimizeToTray) mainWindow?.minimize()
  })
  const pushMax = () => send(IPC.onMaximized, !!mainWindow?.isMaximized())
  mainWindow.on('maximize', pushMax)
  mainWindow.on('unmaximize', pushMax)
  for (const ev of ['show', 'hide', 'minimize', 'restore'] as const) mainWindow.on(ev as 'show', () => reconfigureMonitor())
  mainWindow.on('close', (e) => {
    if (!quitting && settings.get().minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))
}

const overlay = new OverlayWindow(() => {
  const w = new BrowserWindow({
    width: 210, height: 180, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, webPreferences: webPrefs()
  })
  hardenContents(w)
  loadPage(w, 'overlay')
  w.once('ready-to-show', () => {
    w.webContents.send(IPC.onSettings, settings.get())
    if (monitor.last) w.webContents.send(IPC.onSnapshot, monitor.last)
  })
  return w
})

function send(channel: PushChannel, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.webContents.send(channel, payload)
  if (channel !== IPC.onMaximized && overlay.visible) overlay.win?.webContents.send(channel, payload)
}

function createTray(): void {
  const img = fs.existsSync(path.join(resourcesDir, 'tray.png')) ? nativeImage.createFromPath(path.join(resourcesDir, 'tray.png')) : nativeImage.createEmpty()
  tray = new Tray(img)
  tray.setToolTip('FRISTY PC Manager')
  tray.on('click', showMain)
  refreshTrayMenu()
}
function refreshTrayMenu(): void {
  if (!tray) return
  const t = tr()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.show, click: showMain },
      { label: t.overlay, type: 'checkbox', checked: settings.get().overlay.enabled, click: () => applySettings({ overlay: { enabled: !settings.get().overlay.enabled } }) },
      { type: 'separator' },
      { label: t.quit, click: () => ((quitting = true), app.quit()) }
    ])
  )
}
function showMain(): void {
  if (!mainWindow) createMainWindow()
  mainWindow?.show()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
}

// ---------- monitoring ----------
function reconfigureMonitor(): void {
  const visible = !!mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()
  monitor.configure(settings.get().refreshMs, !visible && !overlay.visible)
}

monitor.on('snapshot', (s: Snapshot) => {
  send(IPC.onSnapshot, s)
  const cfg = settings.get()
  if (cfg.history.enabled) history?.record(s)
  if (Notification.isSupported()) {
    void monitor.getStatic().then((st) => {
      for (const a of alerts.evaluate(s, st.disks, cfg)) new Notification({ title: a.title, body: a.body, icon: fs.existsSync(iconPath) ? iconPath : undefined }).show()
    })
  }
})
monitor.on('error', (e) => console.error('monitor tick failed', e))

let registeredHotkey = ''
function applySettings(patch: unknown): Settings {
  const prev = settings.get()
  const s = settings.update(patch)
  if (app.isPackaged && isWin && prev.startWithWindows !== s.startWithWindows) app.setLoginItemSettings({ openAtLogin: s.startWithWindows, args: ['--hidden'] })
  overlay.apply(s)
  if (s.overlay.enabled && s.overlay.metrics.fps && s.presentMonPath) monitor.fps.start(s.presentMonPath)
  else monitor.fps.stop()
  if (registeredHotkey !== s.overlay.hotkey) {
    if (registeredHotkey) globalShortcut.unregister(registeredHotkey)
    registeredHotkey = globalShortcut.register(s.overlay.hotkey, () => applySettings({ overlay: { enabled: !settings.get().overlay.enabled } })) ? s.overlay.hotkey : ''
  }
  reconfigureMonitor()
  refreshTrayMenu()
  mainWindow?.webContents.send(IPC.onSettings, s)
  overlay.win?.webContents.send(IPC.onSettings, s)
  return s
}

// ---------- IPC (validated) ----------
type Validator<A extends unknown[]> = (args: unknown[]) => A | null
const none: Validator<[]> = (a) => (a.length === 0 ? [] : null)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isStr = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const RANGES: HistoryRange[] = ['hour', 'day', 'week', 'month']
const range: Validator<[HistoryRange]> = (a) => (a.length === 1 && RANGES.includes(a[0] as HistoryRange) ? [a[0] as HistoryRange] : null)
const pathArg: Validator<[string]> = (a) => (a.length === 1 && isStr(a[0], 1024) && path.isAbsolute(a[0]) && !a[0].includes('\0') ? [a[0]] : null)

function trustedSender(e: IpcMainInvokeEvent): boolean {
  return isTrustedRendererUrl(e.senderFrame?.url ?? '', path.join(__dirname, '../renderer'), isDev ? process.env.ELECTRON_RENDERER_URL : undefined)
}

/** Every channel must declare a validator; arguments that don't match are rejected before reaching the handler. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handle<A extends any[]>(channel: string, validate: (args: unknown[]) => unknown[] | null, fn: (...a: A) => unknown): void {
  ipcMain.handle(channel, async (e, ...args: unknown[]) => {
    if (!trustedSender(e)) throw new Error('Rejected IPC from untrusted sender')
    const v = validate(args)
    if (!v) throw new Error(`Invalid arguments for ${channel}`)
    return fn(...(v as A))
  })
}

const iconCache = new Map<string, string>()

function registerIpc(): void {
  handle(IPC.getAppInfo, none, (): AppInfo => ({ version: app.getVersion(), platform: process.platform, isAdmin, isWindows: isWin }))
  handle(IPC.getStatic, (a) => (a.length === 0 ? [false] : a.length === 1 && typeof a[0] === 'boolean' ? [a[0]] : null), (force: boolean) => monitor.getStatic(force))
  handle(IPC.getSnapshot, none, () => monitor.last)
  handle(IPC.getProcesses, none, () => listProcesses())
  handle(IPC.killProcess, (a) => (a.length === 1 && isInt(a[0], 1, 2 ** 31) ? [a[0]] : null), async (pid: number): Promise<ActionResult> => {
    const p = findProcess(pid)
    if (!p) return { ok: false, error: 'Process not found.' }
    if (p.protected) return { ok: false, error: `${p.name} is protected.` }
    if (!(await confirm(tr().endQ(p.name, p.pid), tr().endD, tr().end))) return { ok: false, error: 'cancelled' }
    return killProcess(pid)
  })
  handle(IPC.getProcessIcon, pathArg, async (p: string) => {
    if (iconCache.has(p)) return iconCache.get(p)
    if (!/\.(exe|lnk|com|bat|cmd)$/i.test(p) || !fs.existsSync(p)) return null
    try {
      const url = (await app.getFileIcon(p, { size: 'small' })).toDataURL()
      if (iconCache.size > 500) iconCache.clear()
      iconCache.set(p, url)
      return url
    } catch {
      return null
    }
  })
  handle(IPC.openPath, pathArg, (p: string): ActionResult => {
    if (!fs.existsSync(p)) return { ok: false, error: 'File not found' }
    shell.showItemInFolder(p)
    return { ok: true }
  })
  handle(IPC.getStartup, none, () => startup.list())
  handle(IPC.setStartup, (a) => (a.length === 2 && isStr(a[0], 600) && typeof a[1] === 'boolean' ? [a[0], a[1]] : null), async (id: string, enabled: boolean) => {
    const item = startup.find(id)
    if (!item) return { ok: false, error: 'Unknown entry' }
    if (!(await confirm(enabled ? tr().enableQ(item.name) : tr().disableQ(item.name), tr().startupD, tr().change))) return { ok: false, error: 'cancelled' }
    return startup.setEnabled(id, enabled)
  })
  handle(IPC.restoreStartup, (a) => (a.length === 1 && isStr(a[0], 600) ? [a[0]] : null), async (id: string) => {
    const item = startup.find(id)
    if (!item) return { ok: false, error: 'Unknown entry' }
    if (!(await confirm(tr().restoreQ(item.name), tr().startupD, tr().change))) return { ok: false, error: 'cancelled' }
    return startup.restore(id)
  })
  handle(IPC.getHistory, range, (r: HistoryRange) => history?.query(r) ?? [])
  handle(IPC.getHistoryStats, range, (r: HistoryRange) => history?.stats(r) ?? [])
  handle(IPC.exportHistory, range, async (r: HistoryRange): Promise<ActionResult<string>> => {
    if (!history) return { ok: false, error: 'History unavailable' }
    const res = await dialog.showSaveDialog(mainWindow!, { defaultPath: `fristy-history-${r}-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (res.canceled || !res.filePath) return { ok: false, error: 'cancelled' }
    fs.writeFileSync(res.filePath, '﻿' + history.toCsv(r))
    return { ok: true, data: res.filePath }
  })
  handle(IPC.clearHistory, none, async (): Promise<ActionResult> => {
    if (!(await confirm(settings.get().language === 'he' ? 'למחוק את כל היסטוריית הביצועים?' : 'Delete all performance history?', '', tr().change))) return { ok: false, error: 'cancelled' }
    history?.clear()
    return { ok: true }
  })
  handle(IPC.exportSpecs, (a) => (a.length === 1 && (a[0] === 'txt' || a[0] === 'json') ? [a[0] as 'txt' | 'json'] : null), async (fmt: 'txt' | 'json'): Promise<ActionResult<string>> => {
    const st = await monitor.getStatic()
    const res = await dialog.showSaveDialog(mainWindow!, { defaultPath: `system-specs.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] })
    if (res.canceled || !res.filePath) return { ok: false, error: 'cancelled' }
    fs.writeFileSync(res.filePath, fmt === 'json' ? JSON.stringify(st, null, 2) : specsToText(st))
    return { ok: true, data: res.filePath }
  })
  handle(IPC.copyText, (a) => (a.length === 1 && (a[0] === 'specs' || isStr(a[0], 100000)) ? [a[0] as string] : null), async (text: string) => {
    clipboard.writeText(text === 'specs' ? specsToText(await monitor.getStatic()) : text)
    return { ok: true }
  })
  handle(IPC.getSettings, none, () => settings.get())
  handle(IPC.setSettings, (a) => (a.length === 1 && typeof a[0] === 'object' && a[0] !== null ? [a[0]] : null), (patch: unknown) => applySettings(patch))
  handle(IPC.relaunchAdmin, none, async (): Promise<ActionResult> => {
    if (!isWin) return { ok: false, error: 'Windows only' }
    if (isAdmin) return { ok: false, error: 'Already running as administrator' }
    if (!(await confirm(tr().admin, tr().adminD, tr().restart))) return { ok: false, error: 'cancelled' }
    const args = process.argv.slice(1).filter((x) => x !== '--hidden')
    const argList = args.length ? ` -ArgumentList ${args.map(psQuote).join(',')}` : ''
    const out = await runPowerShell(`try { Start-Process -FilePath ${psQuote(process.execPath)}${argList} -Verb RunAs; 'OK' } catch { 'NO' }`).catch(() => 'NO')
    if (out.trim() !== 'OK') return { ok: false, error: 'Elevation was cancelled.' }
    quitting = true
    app.releaseSingleInstanceLock()
    app.quit()
    return { ok: true }
  })
  handle(IPC.overlayCompat, none, () => ({ ...overlayCompat(), fpsStatus: monitor.fps.status, fpsError: monitor.fps.error, fpsApp: monitor.fps.app }))
  handle(IPC.winMinimize, none, () => mainWindow?.minimize())
  handle(IPC.winMaximize, none, () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()))
  handle(IPC.winClose, none, () => mainWindow?.close())
}

function detectAdmin(): Promise<boolean> {
  if (!isWin) return Promise.resolve(typeof process.getuid === 'function' && process.getuid() === 0)
  return new Promise((r) => execFile('net', ['session'], { windowsHide: true, timeout: 5000 }, (err) => r(!err)))
}

function wasmPath(): string {
  const p = require.resolve('sql.js/dist/sql-wasm.wasm')
  const unpacked = p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  return fs.existsSync(unpacked) ? unpacked : p
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  Menu.setApplicationMenu(null)
  if (isWin) si.powerShellStart()
  isAdmin = await detectAdmin()
  registerIpc()
  createMainWindow()
  createTray()
  try {
    history = new HistoryStore(path.join(userData, 'history.sqlite'), wasmPath())
    await history.open()
    history.prune(settings.get().history.retentionDays)
    setInterval(() => history?.prune(settings.get().history.retentionDays), 6 * 3600e3)
  } catch (e) {
    console.error('history unavailable', e)
    history = null
  }
  applySettings({})
  void monitor.getStatic()
})

app.on('second-instance', showMain)
app.on('before-quit', () => {
  quitting = true
})
app.on('window-all-closed', () => {
  if (!settings.get().minimizeToTray || quitting) app.quit()
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  monitor.stop()
  history?.close()
  if (isWin) si.powerShellRelease()
})
process.on('uncaughtException', (e) => console.error('uncaught', e))
process.on('unhandledRejection', (e) => console.error('unhandled', e))
