import { EventEmitter } from 'events'
import os from 'os'
import si from 'systeminformation'
import type { DiskIoLive, FsUsage, GpuLive, GpuStatic, NetLive, Num, Snapshot, StaticInfo, SensorSource } from '@shared/types'
import { isWin } from './ps'
import { queryNvidia, NvidiaGpu } from './sensors/nvidia'
import { WinSampler, aggregateGpuEngines, gpuMemByLuid } from './sensors/winSampler'
import { parseLhm, ParsedLhm } from './sensors/lhm'
import { FpsMonitor } from './sensors/fps'

const n = (v: unknown): Num => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))

/** Resolve within `ms` or fall back, so one slow provider never freezes the whole tick. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      () => (clearTimeout(t), resolve(fallback))
    )
  })
}

const VIRTUAL_GPU = /basic (render|display)|remote display|virtual|parsec|spacedesk|citrix|vmware svga|hyper-v|idd/i

export function normalizeVendor(v: string, model: string): string {
  const s = `${v} ${model}`.toLowerCase()
  if (/nvidia|geforce|quadro|rtx|gtx/.test(s)) return 'NVIDIA'
  if (/amd|ati|radeon/.test(s)) return 'AMD'
  if (/intel|arc|iris|uhd/.test(s)) return 'Intel'
  return v || 'Unknown'
}

function diskType(t: string, iface: string, name: string): 'SSD' | 'HDD' | 'NVMe' | 'Unknown' {
  const s = `${t} ${iface} ${name}`.toLowerCase()
  if (/nvme/.test(s)) return 'NVMe'
  if (/ssd/.test(s)) return 'SSD'
  if (/\bhd\b|hdd/.test(t.toLowerCase())) return 'HDD'
  return 'Unknown'
}

export async function collectStatic(): Promise<StaticInfo> {
  const [cpu, graphics, memLayout, diskLayout, netIf, osInfo, system, baseboard, bios, chassis] = await Promise.all([
    withTimeout(si.cpu(), 20000, null),
    withTimeout(si.graphics(), 30000, null),
    withTimeout(si.memLayout(), 20000, []),
    withTimeout(si.diskLayout(), 30000, []),
    withTimeout(si.networkInterfaces() as Promise<si.Systeminformation.NetworkInterfacesData[]>, 20000, []),
    withTimeout(si.osInfo(), 20000, null),
    withTimeout(si.system(), 20000, null),
    withTimeout(si.baseboard(), 20000, null),
    withTimeout(si.bios(), 20000, null),
    withTimeout(si.chassis(), 20000, null)
  ])
  const gpus: GpuStatic[] = (graphics?.controllers ?? [])
    .filter((c) => !VIRTUAL_GPU.test(`${c.vendor} ${c.model}`))
    .map((c, index) => ({
      index,
      vendor: normalizeVendor(str(c.vendor), str(c.model)),
      model: str(c.model) || str(c.name) || 'Unknown GPU',
      vramMB: n(c.vram) && (c.vram as number) > 0 ? (c.vram as number) : null,
      driverVersion: str(c.driverVersion),
      bus: str(c.bus)
    }))
  const cpuCount = os.cpus().length
  return {
    cpu: {
      manufacturer: str(cpu?.manufacturer),
      brand: str(cpu?.brand) || os.cpus()[0]?.model || 'Unknown CPU',
      vendor: str(cpu?.vendor),
      family: str(cpu?.family),
      model: str(cpu?.model),
      stepping: str(cpu?.stepping),
      speedBaseGHz: n(cpu?.speed) || null,
      speedMaxGHz: n(cpu?.speedMax) || null,
      physicalCores: cpu?.physicalCores || cpuCount,
      cores: cpu?.cores || cpuCount,
      processors: cpu?.processors || 1,
      socket: str(cpu?.socket),
      arch: os.arch(),
      cache: { l1d: n(cpu?.cache?.l1d), l1i: n(cpu?.cache?.l1i), l2: n(cpu?.cache?.l2), l3: n(cpu?.cache?.l3) },
      virtualization: !!cpu?.virtualization
    },
    gpus,
    memModules: memLayout
      .filter((m) => m.size > 0)
      .map((m) => ({ size: m.size, bank: str(m.bank), type: str(m.type), clockSpeed: n(m.clockSpeed), formFactor: str(m.formFactor), manufacturer: str(m.manufacturer), partNum: str(m.partNum) })),
    disks: diskLayout.map((d) => ({
      device: str(d.device),
      name: str(d.name),
      vendor: str(d.vendor),
      type: diskType(str(d.type), str(d.interfaceType), str(d.name)),
      interfaceType: str(d.interfaceType),
      size: d.size,
      serial: str(d.serialNum),
      firmware: str(d.firmwareRevision),
      smartStatus: str(d.smartStatus) || 'unknown',
      temperatureC: n(d.temperature),
      powerOnHours: n(d.smartData?.power_on_time?.hours)
    })),
    displays: (graphics?.displays ?? []).map((d) => ({
      model: str(d.model) || str(d.deviceName) || 'Display',
      vendor: str(d.vendor),
      main: !!d.main,
      builtin: !!d.builtin,
      connection: str(d.connection),
      resolutionX: n(d.currentResX) ?? n(d.resolutionX),
      resolutionY: n(d.currentResY) ?? n(d.resolutionY),
      refreshRate: n(d.currentRefreshRate),
      sizeInches: d.sizeX && d.sizeY ? Math.round((Math.sqrt(d.sizeX ** 2 + d.sizeY ** 2) / 2.54) * 10) / 10 : null
    })),
    net: netIf
      .filter((i) => !i.internal)
      .map((i) => ({ iface: i.iface, ifaceName: str(i.ifaceName), ip4: str(i.ip4), ip6: str(i.ip6), mac: str(i.mac), type: str(i.type), speedMbps: n(i.speed), operstate: str(i.operstate), default: !!i.default, virtual: !!i.virtual })),
    os: { platform: str(osInfo?.platform) || process.platform, distro: str(osInfo?.distro), release: str(osInfo?.release), build: str(osInfo?.build), arch: str(osInfo?.arch) || os.arch(), hostname: str(osInfo?.hostname) || os.hostname(), kernel: str(osInfo?.kernel) },
    system: { manufacturer: str(system?.manufacturer), model: str(system?.model), serial: str(system?.serial), uuid: str(system?.uuid), virtual: !!system?.virtual },
    baseboard: { manufacturer: str(baseboard?.manufacturer), model: str(baseboard?.model), version: str(baseboard?.version) },
    bios: { vendor: str(bios?.vendor), version: str(bios?.version), releaseDate: str(bios?.releaseDate) },
    chassis: { type: str(chassis?.type), manufacturer: str(chassis?.manufacturer) }
  }
}

const normName = (s: string) => s.toLowerCase().replace(/\(r\)|\(tm\)|nvidia|amd|intel|corporation|graphics|[^a-z0-9]/g, '')

/** Merge every real data source we have into one per-GPU record. Anything missing stays null. */
export function composeGpus(statics: GpuStatic[], nv: NvidiaGpu[], lhm: ParsedLhm | null, perf: { util: Map<string, number>; mem: Map<string, number> } | null): GpuLive[] {
  const nvQueue = [...nv]
  const usedLuids = new Set<string>()
  // Exclude perf-counter adapters that clearly belong to NVIDIA GPUs already covered by nvidia-smi.
  if (perf) {
    for (const g of nv) {
      if (g.vramUsedMB === null) continue
      let best: string | null = null
      let bestDiff = Infinity
      for (const [luid, bytes] of perf.mem) {
        const diff = Math.abs(bytes / 1048576 - g.vramUsedMB)
        if (!usedLuids.has(luid) && diff < bestDiff) (best = luid), (bestDiff = diff)
      }
      if (best && bestDiff < 512) usedLuids.add(best)
    }
  }
  const freeLuids = perf
    ? [...perf.mem.keys()].filter((l) => !usedLuids.has(l) && (perf.mem.get(l) ?? 0) > 0).sort((a, b) => (perf.mem.get(b) ?? 0) - (perf.mem.get(a) ?? 0))
    : []
  const nonNvidiaCount = statics.filter((s) => s.vendor !== 'NVIDIA').length
  // Order non-NVIDIA GPUs by VRAM descending so the busiest adapter maps to the discrete card.
  const nonNvOrder = statics.filter((s) => s.vendor !== 'NVIDIA').sort((a, b) => (b.vramMB ?? 0) - (a.vramMB ?? 0))

  const list: GpuLive[] = statics.map((s) => {
    const g: GpuLive = { index: s.index, name: s.model, vendor: s.vendor, util: null, tempC: null, vramUsedMB: null, vramTotalMB: s.vramMB, coreClockMHz: null, memClockMHz: null, fanPercent: null, fanRpm: null, powerW: null, source: 'none' }
    if (s.vendor === 'NVIDIA' && nvQueue.length) {
      const m = nvQueue.shift() as NvidiaGpu
      Object.assign(g, { util: m.util, tempC: m.tempC, vramUsedMB: m.vramUsedMB, vramTotalMB: m.vramTotalMB ?? s.vramMB, coreClockMHz: m.coreClockMHz, memClockMHz: m.memClockMHz, fanPercent: m.fanPercent, powerW: m.powerW, source: 'nvidia-smi' })
    } else if (perf && s.vendor !== 'NVIDIA') {
      const pos = nonNvOrder.indexOf(s)
      const luid = freeLuids[pos]
      if (luid && (nonNvidiaCount === 1 ? freeLuids.length >= 1 : true)) {
        g.util = Math.round((perf.util.get(luid) ?? 0) * 10) / 10
        g.vramUsedMB = Math.round((perf.mem.get(luid) ?? 0) / 1048576)
        g.source = 'perf-counters'
      }
    }
    if (lhm) {
      const key = normName(s.model)
      const l = lhm.gpus.find((x) => {
        const k = normName(x.name)
        return k && key && (k.includes(key) || key.includes(k))
      })
      if (l) {
        g.tempC ??= l.tempC
        g.coreClockMHz ??= l.coreClockMHz
        g.memClockMHz ??= l.memClockMHz
        g.fanRpm ??= l.fanRpm
        g.fanPercent ??= l.fanPercent
        g.powerW ??= l.powerW
        g.util ??= l.util
        if (g.source === 'none') g.source = 'lhm'
      }
    }
    return g
  })
  // NVIDIA GPUs reported by nvidia-smi but not enumerated by WMI (rare) are still shown.
  for (const m of nvQueue) {
    list.push({ index: list.length, name: m.name, vendor: 'NVIDIA', util: m.util, tempC: m.tempC, vramUsedMB: m.vramUsedMB, vramTotalMB: m.vramTotalMB, coreClockMHz: m.coreClockMHz, memClockMHz: m.memClockMHz, fanPercent: m.fanPercent, fanRpm: null, powerW: m.powerW, source: 'nvidia-smi' })
  }
  return list
}

export class Monitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private intervalMs = 1000
  private background = false
  private sampler = new WinSampler()
  readonly fps = new FpsMonitor()
  private staticInfo: StaticInfo | null = null
  private staticPromise: Promise<StaticInfo> | null = null
  private fsCache: FsUsage[] = []
  private fsAt = 0
  private tickCount = 0
  last: Snapshot | null = null

  getStatic(force = false): Promise<StaticInfo> {
    if (this.staticInfo && !force) return Promise.resolve(this.staticInfo)
    if (!this.staticPromise || force) {
      this.staticPromise = collectStatic().then((s) => {
        this.staticInfo = s
        this.staticPromise = null
        return s
      })
    }
    return this.staticPromise
  }

  /** Foreground: user-selected refresh rate. Background (window hidden, no overlay): 5s minimum, fewer providers. */
  configure(intervalMs: number, background: boolean): void {
    const effective = background ? Math.max(5000, intervalMs) : intervalMs
    const changed = effective !== this.intervalMs || background !== this.background || !this.timer
    this.intervalMs = effective
    this.background = background
    if (!changed) return
    if (this.timer) clearInterval(this.timer)
    this.sampler.start(this.intervalMs)
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.sampler.stop()
    this.fps.stop()
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const snap = await this.collect()
      this.last = snap
      this.emit('snapshot', snap)
    } catch (e) {
      this.emit('error', e)
    } finally {
      this.busy = false
    }
  }

  private fsBusy = false
  private async refreshFs(): Promise<void> {
    if (this.fsBusy) return
    this.fsBusy = true
    try {
      const fs = await withTimeout(si.fsSize(), 30000, null)
      if (fs) {
        this.fsCache = fs
          .filter((f) => f.size > 0 && !/^(tmpfs|devtmpfs|squashfs|overlay|efivarfs)$/i.test(f.type))
          .map((f) => ({ mount: f.mount, label: f.fs, type: f.type, size: f.size, used: f.used, available: f.available, percent: f.size ? (f.used / f.size) * 100 : 0 }))
      }
    } finally {
      this.fsAt = Date.now()
      this.fsBusy = false
    }
  }

  private async collect(): Promise<Snapshot> {
    this.tickCount++
    const statics = await withTimeout(this.getStatic(), 1500, this.staticInfo)
    const budget = Math.max(900, this.intervalMs - 100)
    // Volume sizes are slow on Windows (PowerShell); refresh them in the background, never inside the tick.
    if (Date.now() - this.fsAt > (this.background ? 60000 : 15000)) void this.refreshFs()
    const [load, mem, net, nv, temp, ioLinux, time] = await Promise.all([
      withTimeout(si.currentLoad(), budget, null),
      withTimeout(si.mem(), budget, null),
      withTimeout(si.networkStats('*'), budget, [] as si.Systeminformation.NetworkStatsData[]),
      withTimeout(queryNvidia(), budget, [] as NvidiaGpu[]),
      !isWin ? withTimeout(si.cpuTemperature(), budget, null) : Promise.resolve(null),
      !isWin && !this.background ? withTimeout(si.disksIO(), budget, null) : Promise.resolve(null),
      Promise.resolve(si.time())
    ])

    const ws = this.sampler.fresh()
    const lhm = ws?.lhm?.s?.length ? parseLhm(ws.lhm.s, ws.lhm.h ?? []) : null
    let sensorSource: SensorSource = 'none'
    if (lhm) sensorSource = ws?.lhm?.ns.includes('Open') ? 'OpenHardwareMonitor' : 'LibreHardwareMonitor'

    // CPU temperature: LHM > ACPI thermal zone (Windows) > lm-sensors (Linux).
    let cpuTempC: Num = lhm?.cpuTempC ?? null
    if (cpuTempC === null && ws?.acpi?.length) {
      cpuTempC = Math.max(...ws.acpi)
      sensorSource = 'ACPI/WMI'
    }
    if (cpuTempC === null && temp && n(temp.main) && (temp.main as number) > 0) {
      cpuTempC = temp.main as number
      sensorSource = 'lm-sensors'
    }

    // CPU clock: Windows reports % of nominal frequency (what Task Manager shows), else LHM, else os.cpus().
    let speedMHz: Num = null
    if (ws && n(ws.perf) && n(ws.freq)) speedMHz = Math.round(((ws.perf as number) * (ws.freq as number)) / 100)
    else if (lhm?.cpuClockMHz) speedMHz = Math.round(lhm.cpuClockMHz)
    else if (!isWin) {
      const sp = os.cpus().map((c) => c.speed).filter((s) => s > 0)
      speedMHz = sp.length ? Math.round(sp.reduce((a, b) => a + b, 0) / sp.length) : null
    }

    const perf = ws?.eng && ws.gmem ? { util: aggregateGpuEngines(ws.eng), mem: gpuMemByLuid(ws.gmem) } : null
    const gpus = composeGpus(statics?.gpus ?? [], nv, lhm, perf)

    const disksIo: DiskIoLive[] = []
    if (ws?.disk) {
      for (const d of ws.disk) disksIo.push({ name: d.n, readSec: n(d.r), writeSec: n(d.w), activePercent: n(d.i) !== null ? Math.max(0, Math.min(100, 100 - d.i)) : null })
    } else if (ioLinux) {
      // Linux fallback exposes IO ops only, not bytes; report aggregate as unknown bytes rather than inventing values.
      disksIo.push({ name: 'All disks', readSec: null, writeSec: null, activePercent: n(ioLinux.tWaitPercent) })
    }

    const netLive: NetLive[] = net.map((s) => ({ iface: s.iface, rxSec: n(s.rx_sec), txSec: n(s.tx_sec), rxTotal: n(s.rx_bytes), txTotal: n(s.tx_bytes), operstate: s.operstate }))

    const cpuPowerW = lhm?.cpuPowerW ?? null
    const powers = [cpuPowerW, ...gpus.map((g) => g.powerW)].filter((p): p is number => p !== null)
    const gpuFans = gpus.filter((g) => g.fanRpm !== null).map((g) => ({ name: `${g.name} fan`, rpm: g.fanRpm as number }))

    const total = mem?.total ?? os.totalmem()
    const available = mem?.available ?? os.freemem()
    return {
      ts: Date.now(),
      cpu: {
        load: load ? Math.round(load.currentLoad * 10) / 10 : 0,
        cores: this.background ? [] : (load?.cpus ?? []).map((c) => Math.round(c.load * 10) / 10),
        speedMHz,
        tempC: cpuTempC !== null ? Math.round(cpuTempC * 10) / 10 : null,
        powerW: cpuPowerW !== null ? Math.round(cpuPowerW * 10) / 10 : null
      },
      gpus,
      mem: { total, used: total - available, available, percent: total ? ((total - available) / total) * 100 : 0, swapTotal: mem?.swaptotal ?? 0, swapUsed: mem?.swapused ?? 0 },
      disksIo,
      fs: this.fsCache,
      net: netLive,
      fans: [...(lhm?.fans ?? []), ...gpuFans],
      uptimeSec: Number(time.uptime) || os.uptime(),
      powerW: powers.length ? Math.round(powers.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      sensorSource,
      fps: this.fps.current(),
      storageTemps: lhm?.storageTemps ?? []
    }
  }

}
