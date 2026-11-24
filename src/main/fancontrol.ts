import fs from 'fs'
import path from 'path'
import { shell } from 'electron'
import { spawn } from 'child_process'
import type { ActionResult, FanControlStatus } from '@shared/types'
import { isWin, runPowerShellJson } from './ps'

/**
 * Integration with FanControl (Rem0o, https://getfancontrol.com) — a free, open-source fan
 * controller built on LibreHardwareMonitor. FRISTY never writes to fan hardware itself; it only
 * detects, launches and helps install FanControl, which owns all fan curves.
 */
export const FANCONTROL_SITE = 'https://getfancontrol.com/'
const INNO_PRODUCT = '{141A88F8-31AC-49EA-B428-2BE8C19DED83}_is1'

const DETECT = `
$r=@{running='';registry='';winget=''}
$p=Get-Process -Name FanControl -EA SilentlyContinue | Select-Object -First 1
if($p){ try{ $r.running=[string]$p.Path }catch{}; if(-not $r.running){ $r.running='?' } }
foreach($k in 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${INNO_PRODUCT}','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${INNO_PRODUCT}','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${INNO_PRODUCT}'){
  $v=(Get-ItemProperty -Path $k -EA SilentlyContinue).InstallLocation
  if($v){ $r.registry=Join-Path $v 'FanControl.exe'; break }
}
$w=Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\\WinGet\\Packages') -Directory -Filter 'Rem0o.FanControl*' -EA SilentlyContinue | Select-Object -First 1
if($w){ $e=Join-Path $w.FullName 'FanControl.exe'; if(Test-Path -LiteralPath $e){ $r.winget=$e } }
$r | ConvertTo-Json -Compress
`

export interface DetectRaw {
  running: string
  registry: string
  winget: string
}

const isFanControlExe = (p: string) => !!p && path.win32.basename(p).toLowerCase() === 'fancontrol.exe'

/** Pick the best executable path. Pure so it can be unit-tested; `exists` is injected. */
export function resolveFanControl(raw: DetectRaw, customPath: string, commonPaths: string[], exists: (p: string) => boolean): FanControlStatus {
  const running = !!raw.running
  const candidates: [string, FanControlStatus['source']][] = [
    [raw.running !== '?' ? raw.running : '', 'running'],
    [customPath, 'custom'],
    [raw.registry, 'registry'],
    [raw.winget, 'winget'],
    ...commonPaths.map((p) => [p, 'common'] as [string, FanControlStatus['source']])
  ]
  for (const [p, source] of candidates) {
    if (isFanControlExe(p) && exists(p)) return { supported: true, installed: true, running, path: p, source }
  }
  return { supported: true, installed: running, running, path: '', source: running ? 'running' : '' }
}

function commonPaths(): string[] {
  const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? ''
  return [path.join(pf86, 'FanControl', 'FanControl.exe'), path.join(pf, 'FanControl', 'FanControl.exe'), local && path.join(local, 'Programs', 'FanControl', 'FanControl.exe')].filter(Boolean)
}

export async function fanControlStatus(customPath: string): Promise<FanControlStatus> {
  if (!isWin) return { supported: false, installed: false, running: false, path: '', source: '' }
  const raw = (await runPowerShellJson<DetectRaw>(DETECT, 15000).catch(() => null)) ?? { running: '', registry: '', winget: '' }
  return resolveFanControl(raw, customPath, commonPaths(), (p) => fs.existsSync(p))
}

/** ShellExecute (shell.openPath) so Windows shows FanControl's own UAC prompt; it requires administrator. */
export async function launchFanControl(customPath: string): Promise<ActionResult> {
  const st = await fanControlStatus(customPath)
  if (!st.path) return { ok: false, error: st.running ? 'FanControl is already running (check the system tray).' : 'FanControl was not found.' }
  const err = await shell.openPath(st.path)
  return err ? { ok: false, error: err } : { ok: true }
}

/** Opens a visible console running the official winget package so the user sees every prompt. */
export function installFanControl(): ActionResult {
  if (!isWin) return { ok: false, error: 'Windows only' }
  try {
    const child = spawn('cmd.exe', ['/c', 'start', '"FanControl setup"', 'cmd.exe', '/k', 'winget install --id Rem0o.FanControl --exact --source winget --accept-package-agreements'], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true })
    child.unref()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
