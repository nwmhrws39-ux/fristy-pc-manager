import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC, PUSH_CHANNELS, PushChannel } from '@shared/ipc'

const invoke = (ch: string) => (...args: unknown[]) => ipcRenderer.invoke(ch, ...args)

/** The only surface the renderer can reach. No Node APIs and no generic ipcRenderer are exposed. */
const api = {
  getAppInfo: invoke(IPC.getAppInfo),
  getStatic: invoke(IPC.getStatic),
  getSnapshot: invoke(IPC.getSnapshot),
  getProcesses: invoke(IPC.getProcesses),
  killProcess: invoke(IPC.killProcess),
  getProcessIcon: invoke(IPC.getProcessIcon),
  openPath: invoke(IPC.openPath),
  getStartup: invoke(IPC.getStartup),
  setStartup: invoke(IPC.setStartup),
  restoreStartup: invoke(IPC.restoreStartup),
  getHistory: invoke(IPC.getHistory),
  getHistoryStats: invoke(IPC.getHistoryStats),
  exportHistory: invoke(IPC.exportHistory),
  clearHistory: invoke(IPC.clearHistory),
  exportSpecs: invoke(IPC.exportSpecs),
  copyText: invoke(IPC.copyText),
  getSettings: invoke(IPC.getSettings),
  setSettings: invoke(IPC.setSettings),
  relaunchAdmin: invoke(IPC.relaunchAdmin),
  overlayCompat: invoke(IPC.overlayCompat),
  resolvePresentMon: invoke(IPC.resolvePresentMon),
  presentMonWebsite: invoke(IPC.presentMonWebsite),
  fanControlStatus: invoke(IPC.fanControlStatus),
  fanControlLaunch: invoke(IPC.fanControlLaunch),
  fanControlInstall: invoke(IPC.fanControlInstall),
  fanControlWebsite: invoke(IPC.fanControlWebsite),
  winMinimize: invoke(IPC.winMinimize),
  winMaximize: invoke(IPC.winMaximize),
  winClose: invoke(IPC.winClose),
  on(channel: PushChannel, cb: (payload: unknown) => void): () => void {
    if (!(PUSH_CHANNELS as readonly string[]).includes(channel)) throw new Error('Unknown channel')
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('fristy', api)
export type FristyApi = typeof api
