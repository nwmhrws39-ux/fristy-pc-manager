import type { Settings } from '@shared/settings'
import type { ActionResult, AppInfo, FanControlStatus, HistoryPoint, HistoryRange, HistoryStats, OverlayCompat, ProcessInfo, Snapshot, StartupItem, StaticInfo } from '@shared/types'
import type { PushChannel } from '@shared/ipc'

export interface FristyApi {
  getAppInfo(): Promise<AppInfo>
  getStatic(force?: boolean): Promise<StaticInfo>
  getSnapshot(): Promise<Snapshot | null>
  getProcesses(): Promise<ProcessInfo[]>
  killProcess(pid: number): Promise<ActionResult>
  getProcessIcon(path: string): Promise<string | null>
  openPath(path: string): Promise<ActionResult>
  getStartup(): Promise<ActionResult<StartupItem[]>>
  setStartup(id: string, enabled: boolean): Promise<ActionResult>
  restoreStartup(id: string): Promise<ActionResult>
  getHistory(range: HistoryRange): Promise<HistoryPoint[]>
  getHistoryStats(range: HistoryRange): Promise<HistoryStats[]>
  exportHistory(range: HistoryRange): Promise<ActionResult<string>>
  clearHistory(): Promise<ActionResult>
  exportSpecs(fmt: 'txt' | 'json'): Promise<ActionResult<string>>
  copyText(text: string): Promise<ActionResult>
  getSettings(): Promise<Settings>
  setSettings(patch: DeepPartial<Settings>): Promise<Settings>
  relaunchAdmin(): Promise<ActionResult>
  overlayCompat(): Promise<OverlayCompat & { fpsStatus: string; fpsError: string; fpsApp: string }>
  fanControlStatus(): Promise<FanControlStatus>
  fanControlLaunch(): Promise<ActionResult>
  fanControlInstall(): Promise<ActionResult>
  fanControlWebsite(): Promise<ActionResult>
  winMinimize(): Promise<void>
  winMaximize(): Promise<void>
  winClose(): Promise<void>
  on(channel: PushChannel, cb: (payload: unknown) => void): () => void
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export const api: FristyApi = (window as unknown as { fristy: FristyApi }).fristy
