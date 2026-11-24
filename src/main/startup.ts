import fs from 'fs'
import path from 'path'
import type { ActionResult, StartupItem } from '@shared/types'
import { isWin, psQuote, runPowerShellJson, runPowerShell } from './ps'

/**
 * Startup entries are enabled/disabled the same way Windows Task Manager does it: by writing the
 * StartupApproved flag next to the entry. The original Run value / shortcut is never deleted,
 * so every change is fully reversible. Original states are also recorded in a local backup file.
 */
const LIST_SCRIPT = `
function Approved($hive,$sub,$name){ try{ $k=[Microsoft.Win32.Registry]::$hive.OpenSubKey($sub); if($k){ $v=$k.GetValue($name); if($v -is [byte[]] -and $v.Length -gt 0){ return (($v[0] -band 1) -eq 0) } } }catch{}; return $true }
function ExePath($cmd){ $c=[Environment]::ExpandEnvironmentVariables([string]$cmd).Trim(); if($c -match '^"([^"]+)"'){ return $matches[1] }; if($c -match '^(.+?\\.(exe|bat|cmd|com|lnk))(\\s|$)'){ return $matches[1] }; return ($c -split ' ')[0] }
function Publisher($p){ try{ if($p -and (Test-Path -LiteralPath $p)){ $vi=(Get-Item -LiteralPath $p).VersionInfo; return [string]$vi.CompanyName } }catch{}; return '' }
$ap='SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
$out=New-Object System.Collections.ArrayList
$regs=@(
  @{loc='HKCU Run';hive='CurrentUser';sub='Software\\Microsoft\\Windows\\CurrentVersion\\Run';ap="$ap\\Run";admin=$false},
  @{loc='HKLM Run';hive='LocalMachine';sub='SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';ap="$ap\\Run";admin=$true},
  @{loc='HKLM Run (32-bit)';hive='LocalMachine';sub='SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run';ap="$ap\\Run32";admin=$true}
)
foreach($r in $regs){
  $k=[Microsoft.Win32.Registry]::($r.hive).OpenSubKey($r.sub)
  if(-not $k){ continue }
  foreach($n in $k.GetValueNames()){
    if([string]::IsNullOrEmpty($n)){ continue }
    $cmd=[string]$k.GetValue($n); $p=ExePath $cmd
    [void]$out.Add(@{loc=$r.loc;name=$n;cmd=$cmd;path=$p;publisher=(Publisher $p);enabled=(Approved $r.hive $r.ap $n);admin=$r.admin})
  }
}
$sh=New-Object -ComObject WScript.Shell
foreach($f in @(@{loc='User Startup Folder';dir=[Environment]::GetFolderPath('Startup');hive='CurrentUser';admin=$false},@{loc='Common Startup Folder';dir=[Environment]::GetFolderPath('CommonStartup');hive='LocalMachine';admin=$true})){
  if(-not $f.dir -or -not (Test-Path -LiteralPath $f.dir)){ continue }
  foreach($file in Get-ChildItem -LiteralPath $f.dir -File -EA SilentlyContinue){
    if($file.Name -ieq 'desktop.ini'){ continue }
    $target=$file.FullName
    if($file.Extension -ieq '.lnk'){ try{ $t=$sh.CreateShortcut($file.FullName).TargetPath; if($t){ $target=$t } }catch{} }
    [void]$out.Add(@{loc=$f.loc;name=$file.Name;cmd=$file.FullName;path=$target;publisher=(Publisher $target);enabled=(Approved $f.hive "$ap\\StartupFolder" $file.Name);admin=$f.admin})
  }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 3
`

interface RawItem {
  loc: StartupItem['location']
  name: string
  cmd: string
  path: string
  publisher: string
  enabled: boolean
  admin: boolean
}

const APPROVED: Record<StartupItem['location'], { hive: string; sub: string }> = {
  'HKCU Run': { hive: 'HKEY_CURRENT_USER', sub: 'Run' },
  'HKLM Run': { hive: 'HKEY_LOCAL_MACHINE', sub: 'Run' },
  'HKLM Run (32-bit)': { hive: 'HKEY_LOCAL_MACHINE', sub: 'Run32' },
  'User Startup Folder': { hive: 'HKEY_CURRENT_USER', sub: 'StartupFolder' },
  'Common Startup Folder': { hive: 'HKEY_LOCAL_MACHINE', sub: 'StartupFolder' }
}

type Backup = Record<string, { originalEnabled: boolean; changedAt: number }>

export class StartupManager {
  private cache: StartupItem[] = []
  constructor(private backupFile: string) {}

  private readBackup(): Backup {
    try {
      const b = JSON.parse(fs.readFileSync(this.backupFile, 'utf8'))
      return typeof b === 'object' && b ? (b as Backup) : {}
    } catch {
      return {}
    }
  }
  private writeBackup(b: Backup): void {
    fs.mkdirSync(path.dirname(this.backupFile), { recursive: true })
    fs.writeFileSync(this.backupFile, JSON.stringify(b, null, 2))
  }

  async list(): Promise<ActionResult<StartupItem[]>> {
    if (!isWin) return { ok: true, data: [], error: 'Startup management is only available on Windows.' }
    try {
      const raw = (await runPowerShellJson<RawItem[] | RawItem>(LIST_SCRIPT, 30000)) ?? []
      const arr = Array.isArray(raw) ? raw : [raw]
      const backup = this.readBackup()
      this.cache = arr.map((r) => {
        const id = `${r.loc}|${r.name}`
        return {
          id, name: r.name.replace(/\.lnk$/i, ''), command: r.cmd, path: r.path, publisher: r.publisher || '', location: r.loc,
          enabled: !!r.enabled, requiresAdmin: !!r.admin, originalEnabled: backup[id]?.originalEnabled ?? null
        }
      })
      return { ok: true, data: this.cache }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  find(id: string): StartupItem | undefined {
    return this.cache.find((i) => i.id === id)
  }

  async setEnabled(id: string, enabled: boolean, recordBackup = true): Promise<ActionResult> {
    if (!isWin) return { ok: false, error: 'Not supported on this platform' }
    const item = this.find(id)
    if (!item) return { ok: false, error: 'Unknown startup entry. Refresh and try again.' }
    const raw = item.location.includes('Folder') ? id.split('|').slice(1).join('|') : item.name
    const a = APPROVED[item.location]
    const key = `${a.hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\${a.sub}`
    // 0x02 = enabled, 0x03 = disabled (+ FILETIME of when it was disabled), same format as Task Manager.
    const script = `
try {
  $b=New-Object byte[] 12
  if(${enabled ? '$true' : '$false'}){ $b[0]=2 } else { $b[0]=3; [BitConverter]::GetBytes([DateTime]::UtcNow.ToFileTimeUtc()).CopyTo($b,4) }
  [Microsoft.Win32.Registry]::SetValue(${psQuote(key)}, ${psQuote(raw)}, $b, [Microsoft.Win32.RegistryValueKind]::Binary)
  'OK'
} catch [System.UnauthorizedAccessException] { 'DENIED' } catch { 'ERR:' + $_.Exception.Message }`
    const out = (await runPowerShell(script, 15000).catch((e: Error) => 'ERR:' + e.message)).trim()
    if (out === 'DENIED' || /denied|unauthori/i.test(out)) return { ok: false, needsAdmin: true, error: 'Administrator rights are required to change this entry.' }
    if (out !== 'OK') return { ok: false, error: out.replace(/^ERR:/, '') || 'Unknown error' }
    if (recordBackup) {
      const b = this.readBackup()
      if (!b[id]) b[id] = { originalEnabled: item.enabled, changedAt: Date.now() }
      this.writeBackup(b)
    }
    item.enabled = enabled
    return { ok: true }
  }

  async restore(id: string): Promise<ActionResult> {
    const b = this.readBackup()
    const entry = b[id]
    if (!entry) return { ok: false, error: 'No saved original state for this entry.' }
    const r = await this.setEnabled(id, entry.originalEnabled, false)
    if (r.ok) {
      delete b[id]
      this.writeBackup(b)
    }
    return r
  }
}
