import type { ChildProcessWithoutNullStreams } from 'child_process'
import { spawnPowerShellStream, isWin } from '../ps'
import type { LhmHardware, LhmSensor } from './lhm'

/** One sample emitted by the persistent PowerShell sampler. Field names are kept short to reduce IPC volume. */
export interface WinSample {
  eng?: { n: string; u: number }[]
  gmem?: { n: string; d: number }[]
  disk?: { n: string; r: number; w: number; i: number }[]
  perf?: number | null
  freq?: number | null
  lhm?: { ns: string; s: LhmSensor[]; h: LhmHardware[] } | null
  acpi?: number[] | null
}

const SCRIPT = (intervalMs: number, parentPid: number) => `
$interval=${Math.max(250, Math.round(intervalMs))}
$parent=${parentPid}
$ns=$null; $nsCheck=0; $acpiOk=$true
function FindNs { foreach($n in 'root/LibreHardwareMonitor','root/OpenHardwareMonitor'){ if(Get-CimClass -Namespace $n -ClassName Sensor -EA SilentlyContinue){ return $n } }; return $null }
while($true){
  if(-not (Get-Process -Id $parent -EA SilentlyContinue)){ exit }
  $o=@{}
  $o.eng=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -EA SilentlyContinue | ?{ $_.UtilizationPercentage -gt 0 } | %{ @{n=$_.Name;u=[double]$_.UtilizationPercentage} })
  $o.gmem=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -EA SilentlyContinue | %{ @{n=$_.Name;d=[double]$_.DedicatedUsage} })
  $o.disk=@(Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -EA SilentlyContinue | ?{ $_.Name -ne '_Total' } | %{ @{n=$_.Name;r=[double]$_.DiskReadBytesPersec;w=[double]$_.DiskWriteBytesPersec;i=[double]$_.PercentIdleTime} })
  $pi=Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'" -EA SilentlyContinue
  if($pi){ $o.perf=[double]$pi.PercentProcessorPerformance; $o.freq=[double]$pi.ProcessorFrequency }
  if(-not $ns -and $nsCheck -le 0){ $ns=FindNs; $nsCheck=20 }
  $nsCheck--
  if($ns){
    $s=@(Get-CimInstance -Namespace $ns -ClassName Sensor -EA SilentlyContinue | ?{ 'Temperature','Fan','Power','Clock','Load','Control' -contains $_.SensorType } | %{ @{SensorType=[string]$_.SensorType;Name=[string]$_.Name;Value=$(if($_.Value -ne $null){[double]$_.Value}else{$null});Identifier=[string]$_.Identifier;Parent=[string]$_.Parent} })
    if($s.Count -eq 0){ $ns=$null } else {
      $h=@(Get-CimInstance -Namespace $ns -ClassName Hardware -EA SilentlyContinue | %{ @{Identifier=[string]$_.Identifier;Name=[string]$_.Name;HardwareType=[string]$_.HardwareType} })
      $o.lhm=@{ns=$ns;s=$s;h=$h}
    }
  }
  if(-not $ns -and $acpiOk){
    $z=@(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -EA SilentlyContinue | %{ [math]::Round(($_.CurrentTemperature/10)-273.15,1) } | ?{ $_ -gt 0 -and $_ -lt 125 })
    if($z.Count -eq 0){ $acpiOk=$false } else { $o.acpi=$z }
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds $interval
}
`

/**
 * Keeps a single PowerShell process alive that samples Windows performance counters (locale-independent
 * CIM classes) and, when present, LibreHardwareMonitor/OpenHardwareMonitor sensors. Spawning a new
 * PowerShell for every tick would cost far more CPU, so we stream instead.
 */
export class WinSampler {
  private child: ChildProcessWithoutNullStreams | null = null
  private intervalMs = 1000
  private stopped = true
  private restarts = 0
  latest: WinSample | null = null
  latestAt = 0

  start(intervalMs: number): void {
    if (!isWin) return
    if (!this.stopped && this.child && intervalMs === this.intervalMs) return
    this.stop()
    this.stopped = false
    this.intervalMs = intervalMs
    this.spawn()
  }

  private spawn(): void {
    this.child = spawnPowerShellStream(
      SCRIPT(this.intervalMs, process.pid),
      (line) => {
        try {
          this.latest = JSON.parse(line) as WinSample
          this.latestAt = Date.now()
          this.restarts = 0
        } catch {
          /* ignore partial line */
        }
      },
      () => {
        this.child = null
        if (!this.stopped && this.restarts < 5) {
          this.restarts++
          setTimeout(() => !this.stopped && !this.child && this.spawn(), 2000 * this.restarts)
        }
      }
    )
  }

  /** Latest sample if it's fresh enough to be trusted, otherwise null (=> N/A). */
  fresh(): WinSample | null {
    return this.latest && Date.now() - this.latestAt < Math.max(5000, this.intervalMs * 4) ? this.latest : null
  }

  stop(): void {
    this.stopped = true
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }
}

const LUID_RE = /luid_(0x[0-9a-f]+_0x[0-9a-f]+)/i
const ENG_RE = /eng_(\d+)/i

/** Task-Manager style GPU utilisation: sum per engine across processes, then max across engines. */
export function aggregateGpuEngines(eng: { n: string; u: number }[]): Map<string, number> {
  const perEngine = new Map<string, number>()
  for (const e of eng) {
    const luid = LUID_RE.exec(e.n)?.[1]?.toLowerCase()
    const idx = ENG_RE.exec(e.n)?.[1]
    if (!luid || idx === undefined || !Number.isFinite(e.u)) continue
    const key = `${luid}|${idx}`
    perEngine.set(key, (perEngine.get(key) ?? 0) + e.u)
  }
  const perLuid = new Map<string, number>()
  for (const [key, u] of perEngine) {
    const luid = key.split('|')[0]
    perLuid.set(luid, Math.min(100, Math.max(perLuid.get(luid) ?? 0, u)))
  }
  return perLuid
}

export function gpuMemByLuid(gmem: { n: string; d: number }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const g of gmem) {
    const luid = LUID_RE.exec(g.n)?.[1]?.toLowerCase()
    if (luid && Number.isFinite(g.d)) m.set(luid, (m.get(luid) ?? 0) + g.d)
  }
  return m
}
