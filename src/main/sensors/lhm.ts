import type { FanReading, Num } from '@shared/types'

/** Raw sensor row from LibreHardwareMonitor / OpenHardwareMonitor WMI namespace. */
export interface LhmSensor {
  SensorType: string
  Name: string
  Value: number | null
  Identifier: string
  Parent: string
}
export interface LhmHardware {
  Identifier: string
  Name: string
  HardwareType: string
}

export interface ParsedLhm {
  cpuTempC: Num
  cpuPowerW: Num
  cpuClockMHz: Num
  fans: FanReading[]
  gpus: { name: string; tempC: Num; coreClockMHz: Num; memClockMHz: Num; fanRpm: Num; fanPercent: Num; powerW: Num; util: Num }[]
  storageTemps: { name: string; tempC: number }[]
}

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function pick(sensors: LhmSensor[], type: string, prefs: RegExp[]): Num {
  const list = sensors.filter((s) => s.SensorType === type && valid(s.Value))
  for (const re of prefs) {
    const hit = list.find((s) => re.test(s.Name))
    if (hit) return hit.Value as number
  }
  return null
}

const isCpu = (id: string) => /^\/(intelcpu|amdcpu|cpu)\//i.test(id)
const isGpu = (id: string) => /^\/(gpu-nvidia|gpu-amd|gpu-intel|nvidiagpu|atigpu|gpu)\//i.test(id)
const isStorage = (id: string) => /^\/(nvme|hdd|ssd|storage)\//i.test(id)

export function parseLhm(sensors: LhmSensor[], hardware: LhmHardware[]): ParsedLhm {
  const byParent = new Map<string, LhmSensor[]>()
  for (const s of sensors) {
    if (!s || typeof s.Parent !== 'string') continue
    const arr = byParent.get(s.Parent) ?? []
    arr.push(s)
    byParent.set(s.Parent, arr)
  }
  const hwName = (id: string) => hardware.find((h) => h.Identifier === id)?.Name ?? id

  const cpuSensors = sensors.filter((s) => isCpu(s.Parent ?? ''))
  let cpuTempC = pick(cpuSensors, 'Temperature', [/^CPU Package$/i, /Package/i, /Tctl\/Tdie|Tdie|Tctl/i, /^Core Max$/i, /^CPU Total$/i])
  if (cpuTempC === null) {
    const temps = cpuSensors.filter((s) => s.SensorType === 'Temperature' && valid(s.Value)).map((s) => s.Value as number)
    cpuTempC = temps.length ? Math.max(...temps) : null
  }
  const cpuPowerW = pick(cpuSensors, 'Power', [/^CPU Package$/i, /^Package$/i, /Package/i, /^CPU Cores$/i])
  const coreClocks = cpuSensors.filter((s) => s.SensorType === 'Clock' && /^(CPU )?Core #\d+$/i.test(s.Name) && valid(s.Value)).map((s) => s.Value as number)
  const cpuClockMHz = coreClocks.length ? coreClocks.reduce((a, b) => a + b, 0) / coreClocks.length : null

  const fans: FanReading[] = sensors
    .filter((s) => s.SensorType === 'Fan' && valid(s.Value) && (s.Value as number) > 0 && !isGpu(s.Parent ?? ''))
    .map((s) => ({ name: s.Name, rpm: Math.round(s.Value as number) }))

  const gpuIds = [...new Set(sensors.map((s) => s.Parent).filter((p) => p && isGpu(p)))]
  const gpus = gpuIds.map((id) => {
    const ss = byParent.get(id) ?? []
    return {
      name: hwName(id),
      tempC: pick(ss, 'Temperature', [/^GPU Core$/i, /^GPU$/i, /Core/i, /Edge/i, /./]),
      coreClockMHz: pick(ss, 'Clock', [/^GPU Core$/i, /Core/i]),
      memClockMHz: pick(ss, 'Clock', [/^GPU Memory$/i, /Memory/i]),
      fanRpm: pick(ss, 'Fan', [/./]),
      fanPercent: pick(ss, 'Control', [/Fan/i]),
      powerW: pick(ss, 'Power', [/^GPU Package$/i, /^GPU Power$/i, /Package|Total|Power/i]),
      util: pick(ss, 'Load', [/^GPU Core$/i, /^D3D 3D$/i, /Core/i])
    }
  })

  const storageTemps = sensors
    .filter((s) => s.SensorType === 'Temperature' && isStorage(s.Parent ?? '') && valid(s.Value))
    .reduce<{ name: string; tempC: number }[]>((acc, s) => {
      const name = hwName(s.Parent)
      if (!acc.some((a) => a.name === name)) acc.push({ name, tempC: s.Value as number })
      return acc
    }, [])

  return { cpuTempC, cpuPowerW, cpuClockMHz, fans, gpus, storageTemps }
}
