import type { ActionResult } from '@shared/types'
import { isWin, psQuote, runPowerShell, runPowerShellJson } from './ps'

/**
 * ETW tracing (what PresentMon uses for FPS) needs administrator rights OR membership in the built-in
 * "Performance Log Users" group (well-known SID S-1-5-32-559 — used instead of the name, which is
 * localized). Granting membership is a one-time, user-confirmed UAC action and takes effect after the
 * user signs out and back in. This is the access method documented by Intel's PresentMon README.
 */
export const PERF_LOG_USERS_SID = 'S-1-5-32-559'

export interface PerfAccess {
  /** The current logon token already carries the group → PresentMon can run without admin now. */
  active: boolean
  /** The account is a member, but the user hasn't signed out/in yet. */
  pendingSignOut: boolean
  account: string
}

const CHECK = `
$id=[Security.Principal.WindowsIdentity]::GetCurrent()
$active=@($id.Groups | ForEach-Object { $_.Value }) -contains '${PERF_LOG_USERS_SID}'
$member=$false
try {
  $g=(New-Object Security.Principal.SecurityIdentifier '${PERF_LOG_USERS_SID}').Translate([Security.Principal.NTAccount]).Value.Split('\\')[-1]
  $grp=[ADSI]("WinNT://./" + $g + ",group")
  foreach($m in @($grp.psbase.Invoke('Members'))){
    $sid=New-Object Security.Principal.SecurityIdentifier($m.GetType().InvokeMember('objectSid','GetProperty',$null,$m,$null),0)
    if($sid.Value -eq $id.User.Value){ $member=$true }
  }
} catch {}
@{active=$active;member=$member;account=$id.Name} | ConvertTo-Json -Compress
`

export async function checkPerfAccess(): Promise<PerfAccess> {
  if (!isWin) return { active: false, pendingSignOut: false, account: '' }
  const r = await runPowerShellJson<{ active: boolean; member: boolean; account: string }>(CHECK, 15000).catch(() => null)
  if (!r) return { active: false, pendingSignOut: false, account: '' }
  return { active: !!r.active, pendingSignOut: !r.active && !!r.member, account: r.account ?? '' }
}

/** Shows one UAC prompt and adds the current account to Performance Log Users. */
export async function grantPerfAccess(account: string): Promise<ActionResult> {
  if (!isWin) return { ok: false, error: 'Windows only' }
  if (!account || account.length > 256 || /["\r\n]/.test(account)) return { ok: false, error: 'Unknown user account' }
  // Inner script runs elevated. net.exe error 1378 = "already a member", treated as success.
  const inner = `$g=(New-Object Security.Principal.SecurityIdentifier '${PERF_LOG_USERS_SID}').Translate([Security.Principal.NTAccount]).Value.Split('\\')[-1]
& net.exe localgroup "$g" ${psQuote(account)} /add | Out-Null
if($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 2){ exit 0 } else { exit $LASTEXITCODE }`
  const enc = Buffer.from(inner, 'utf16le').toString('base64')
  const outer = `try {
  $p=Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${enc}'
  'EXIT:' + $p.ExitCode
} catch { 'CANCELLED' }`
  const out = (await runPowerShell(outer, 120000).catch((e: Error) => 'ERR:' + e.message)).trim()
  if (out === 'CANCELLED') return { ok: false, error: 'cancelled' }
  const m = /EXIT:(-?\d+)/.exec(out)
  if (m && m[1] === '0') return { ok: true }
  // Re-check membership: net.exe returns 2 for several conditions including "already a member" (1378).
  const after = await checkPerfAccess()
  if (after.active || after.pendingSignOut) return { ok: true }
  return { ok: false, error: m ? `net localgroup failed (exit ${m[1]})` : out.replace(/^ERR:/, '') }
}
