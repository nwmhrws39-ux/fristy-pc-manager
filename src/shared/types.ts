/** `null` always means "sensor/reading not available" and is rendered as N/A. Never substitute fake values. */
export type Num = number | null

export interface CpuLive {
  load: number
  cores: number[]
  speedMHz: Num
  tempC: Num
  powerW: Num
}

export interface GpuLive {
  index: number
  name: string
  vendor: string
  util: Num
  tempC: Num
  vramUsedMB: Num
  vramTotalMB: Num
  coreClockMHz: Num
  memClockMHz: Num
  fanPercent: Num
  fanRpm: Num
  powerW: Num
  source: 'nvidia-smi' | 'perf-counters' | 'lhm' | 'systeminformation' | 'none'
}

export interface MemLive {
  total: number
  used: number
  available: number
  percent: number
  swapTotal: number
  swapUsed: number
}

export interface DiskIoLive {
  name: string
  readSec: Num
  writeSec: Num
  activePercent: Num
}

export interface FsUsage {
  mount: string
  label: string
  type: string
  size: number
  used: number
  available: number
  percent: number
}

export interface NetLive {
  iface: string
  rxSec: Num
  txSec: Num
  rxTotal: Num
  txTotal: Num
  operstate: string
}

export interface FanReading {
  name: string
  rpm: number
}

export interface Snapshot {
  ts: number
  cpu: CpuLive
  gpus: GpuLive[]
  mem: MemLive
  disksIo: DiskIoLive[]
  fs: FsUsage[]
  net: NetLive[]
  fans: FanReading[]
  uptimeSec: number
  /** Sum of the power readings we actually have (CPU package + GPUs). null when none are available. */
  powerW: Num
  sensorSource: SensorSource
  fps: Num
  storageTemps: { name: string; tempC: number }[]
}

export type SensorSource = 'LibreHardwareMonitor' | 'OpenHardwareMonitor' | 'ACPI/WMI' | 'lm-sensors' | 'none'

export interface CpuStatic {
  manufacturer: string
  brand: string
  vendor: string
  family: string
  model: string
  stepping: string
  speedBaseGHz: Num
  speedMaxGHz: Num
  physicalCores: number
  cores: number
  processors: number
  socket: string
  arch: string
  cache: { l1d: Num; l1i: Num; l2: Num; l3: Num }
  virtualization: boolean
}

export interface GpuStatic {
  index: number
  vendor: string
  model: string
  vramMB: Num
  driverVersion: string
  bus: string
}

export interface MemModule {
  size: number
  bank: string
  type: string
  clockSpeed: Num
  formFactor: string
  manufacturer: string
  partNum: string
}

export interface DiskStatic {
  device: string
  name: string
  vendor: string
  type: 'SSD' | 'HDD' | 'NVMe' | 'Unknown'
  interfaceType: string
  size: number
  serial: string
  firmware: string
  smartStatus: string
  temperatureC: Num
  powerOnHours: Num
}

export interface DisplayInfo {
  model: string
  vendor: string
  main: boolean
  builtin: boolean
  connection: string
  resolutionX: Num
  resolutionY: Num
  refreshRate: Num
  sizeInches: Num
}

export interface NetIfaceStatic {
  iface: string
  ifaceName: string
  ip4: string
  ip6: string
  mac: string
  type: string
  speedMbps: Num
  operstate: string
  default: boolean
  virtual: boolean
}

export interface StaticInfo {
  cpu: CpuStatic
  gpus: GpuStatic[]
  memModules: MemModule[]
  disks: DiskStatic[]
  displays: DisplayInfo[]
  net: NetIfaceStatic[]
  os: { platform: string; distro: string; release: string; build: string; arch: string; hostname: string; kernel: string }
  system: { manufacturer: string; model: string; serial: string; uuid: string; virtual: boolean }
  baseboard: { manufacturer: string; model: string; version: string }
  bios: { vendor: string; version: string; releaseDate: string }
  chassis: { type: string; manufacturer: string }
}

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  path: string
  command: string
  user: string
  cpu: number
  memBytes: number
  /** Bytes/s read+write. null when unavailable on this platform. */
  diskSec: Num
  started: string
  priority: number
  protected: boolean
}

export interface StartupItem {
  id: string
  name: string
  command: string
  path: string
  publisher: string
  location: 'HKCU Run' | 'HKLM Run' | 'HKLM Run (32-bit)' | 'User Startup Folder' | 'Common Startup Folder'
  enabled: boolean
  requiresAdmin: boolean
  /** Original state recorded the first time FRISTY changed this entry (for restore). */
  originalEnabled: boolean | null
}

export type HistoryRange = 'hour' | 'day' | 'week' | 'month'

export interface HistoryPoint {
  ts: number
  cpu: Num
  cpuMax: Num
  gpu: Num
  gpuMax: Num
  cpuTemp: Num
  cpuTempMax: Num
  gpuTemp: Num
  gpuTempMax: Num
  ram: Num
  ramMax: Num
  rx: Num
  tx: Num
}

export interface HistoryStats {
  metric: string
  avg: Num
  max: Num
}

export interface ActionResult<T = undefined> {
  ok: boolean
  error?: string
  needsAdmin?: boolean
  data?: T
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform | string
  isAdmin: boolean
  isWindows: boolean
}

export interface OverlayCompat {
  supported: boolean
  notes: string[]
}

export interface FanControlStatus {
  supported: boolean
  installed: boolean
  running: boolean
  path: string
  source: 'running' | 'registry' | 'winget' | 'common' | 'custom' | ''
}
