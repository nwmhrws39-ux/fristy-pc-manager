/** Single source of truth for IPC channel names. Main validates every request against this list. */
export const IPC = {
  // invoke (renderer -> main, with response)
  getAppInfo: 'app:info',
  getStatic: 'sys:static',
  getSnapshot: 'sys:snapshot',
  getProcesses: 'proc:list',
  killProcess: 'proc:kill',
  getProcessIcon: 'proc:icon',
  openPath: 'shell:showItem',
  getStartup: 'startup:list',
  setStartup: 'startup:set',
  restoreStartup: 'startup:restore',
  getHistory: 'history:get',
  getHistoryStats: 'history:stats',
  exportHistory: 'history:export',
  clearHistory: 'history:clear',
  exportSpecs: 'specs:export',
  copyText: 'clipboard:write',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  confirm: 'dialog:confirm',
  relaunchAdmin: 'app:relaunchAdmin',
  overlayCompat: 'overlay:compat',
  resolvePresentMon: 'fps:resolve',
  presentMonWebsite: 'fps:website',
  fanControlStatus: 'fan:status',
  fanControlLaunch: 'fan:launch',
  fanControlInstall: 'fan:install',
  fanControlWebsite: 'fan:website',
  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  // push (main -> renderer)
  onSnapshot: 'push:snapshot',
  onSettings: 'push:settings',
  onMaximized: 'push:maximized'
} as const

export const PUSH_CHANNELS = [IPC.onSnapshot, IPC.onSettings, IPC.onMaximized] as const
export type PushChannel = (typeof PUSH_CHANNELS)[number]

/** Critical Windows processes that must never be terminated from the UI (lower-case image names). */
export const PROTECTED_PROCESSES = new Set([
  'system', 'system idle process', 'idle', 'registry', 'memory compression', 'secure system',
  'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'lsaiso.exe',
  'svchost.exe', 'dwm.exe', 'fontdrvhost.exe', 'sihost.exe', 'spoolsv.exe', 'wudfhost.exe',
  'msmpeng.exe', 'nissrv.exe', 'securityhealthservice.exe', 'mpdefendercoreservice.exe', 'sgrmbroker.exe',
  'audiodg.exe', 'conhost.exe', 'ctfmon.exe', 'taskhostw.exe', 'runtimebroker.exe', 'searchindexer.exe',
  'trustedinstaller.exe', 'tiworker.exe', 'wlanext.exe', 'dllhost.exe', 'logonui.exe', 'userinit.exe',
  'init', 'systemd', 'kthreadd', 'launchd', 'kernel_task'
])

export function isProtectedProcess(name: string, pid: number, ownPid: number): boolean {
  if (pid <= 4 || pid === ownPid) return true
  return PROTECTED_PROCESSES.has(name.trim().toLowerCase())
}
