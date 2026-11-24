import { describe, expect, it } from 'vitest'
import { parseNvidiaSmi } from '../src/main/sensors/nvidia'
import { aggregateGpuEngines, gpuMemByLuid } from '../src/main/sensors/winSampler'
import { parseLhm, LhmSensor } from '../src/main/sensors/lhm'
import { composeGpus, normalizeVendor } from '../src/main/monitor'
import { isProtectedProcess } from '@shared/ipc'

describe('nvidia-smi parsing', () => {
  it('parses values and maps N/A / Not Supported to null', () => {
    const csv = '0, NVIDIA GeForce RTX 4070, 37, 54, 2048, 12282, 2610, 10501, 30, 85.42, 561.09\r\n1, NVIDIA T400, [N/A], 41, 120, 2048, [Not Supported], 5000, [N/A], [N/A], 561.09\n'
    const g = parseNvidiaSmi(csv)
    expect(g).toHaveLength(2)
    expect(g[0]).toMatchObject({ index: 0, name: 'NVIDIA GeForce RTX 4070', util: 37, tempC: 54, vramUsedMB: 2048, powerW: 85.42, driver: '561.09' })
    expect(g[1].util).toBeNull()
    expect(g[1].coreClockMHz).toBeNull()
    expect(g[1].powerW).toBeNull()
  })
  it('ignores malformed output', () => {
    expect(parseNvidiaSmi('NVIDIA-SMI has failed because it couldn\'t communicate with the driver')).toEqual([])
  })
})

describe('Windows GPU perf counters', () => {
  it('sums per engine across processes and takes max across engines', () => {
    const L = 'luid_0x00000000_0x0000C4D2'
    const m = aggregateGpuEngines([
      { n: `pid_100_${L}_phys_0_eng_0_engtype_3D`, u: 30 },
      { n: `pid_200_${L}_phys_0_eng_0_engtype_3D`, u: 25 },
      { n: `pid_300_${L}_phys_0_eng_3_engtype_VideoDecode`, u: 40 },
      { n: 'pid_1_luid_0x00000000_0x0000AAAA_phys_0_eng_0_engtype_3D', u: 5 }
    ])
    expect(m.get('0x00000000_0x0000c4d2')).toBe(55)
    expect(m.get('0x00000000_0x0000aaaa')).toBe(5)
  })
  it('caps at 100%', () => {
    const m = aggregateGpuEngines([
      { n: 'pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D', u: 80 },
      { n: 'pid_2_luid_0x0_0x1_phys_0_eng_0_engtype_3D', u: 60 }
    ])
    expect(m.get('0x0_0x1')).toBe(100)
  })
  it('groups dedicated memory per adapter', () => {
    const m = gpuMemByLuid([{ n: 'luid_0x00000000_0x0000C4D2_phys_0', d: 1048576 * 512 }])
    expect(m.get('0x00000000_0x0000c4d2')).toBe(1048576 * 512)
  })
})

describe('LibreHardwareMonitor parsing', () => {
  const s = (SensorType: string, Name: string, Value: number | null, Parent: string): LhmSensor => ({ SensorType, Name, Value, Parent, Identifier: `${Parent}/${SensorType}/${Name}` })
  it('picks CPU package temp/power, averages core clocks, collects fans and GPU sensors', () => {
    const r = parseLhm(
      [
        s('Temperature', 'Core #1', 61, '/intelcpu/0'),
        s('Temperature', 'CPU Package', 66, '/intelcpu/0'),
        s('Power', 'CPU Package', 45.5, '/intelcpu/0'),
        s('Clock', 'Core #1', 4000, '/intelcpu/0'),
        s('Clock', 'Core #2', 4200, '/intelcpu/0'),
        s('Clock', 'Bus Speed', 100, '/intelcpu/0'),
        s('Fan', 'Fan #1', 1200, '/lpc/nct6798d'),
        s('Fan', 'Fan #2', 0, '/lpc/nct6798d'),
        s('Temperature', 'GPU Core', 58, '/gpu-amd/0'),
        s('Clock', 'GPU Core', 2400, '/gpu-amd/0'),
        s('Fan', 'GPU Fan', 1500, '/gpu-amd/0'),
        s('Temperature', 'Temperature', 39, '/nvme/0')
      ],
      [{ Identifier: '/gpu-amd/0', Name: 'AMD Radeon RX 7800 XT', HardwareType: 'GpuAmd' }, { Identifier: '/nvme/0', Name: 'Samsung SSD 980 PRO 1TB', HardwareType: 'Storage' }]
    )
    expect(r.cpuTempC).toBe(66)
    expect(r.cpuPowerW).toBe(45.5)
    expect(r.cpuClockMHz).toBe(4100)
    expect(r.fans).toEqual([{ name: 'Fan #1', rpm: 1200 }])
    expect(r.gpus[0]).toMatchObject({ name: 'AMD Radeon RX 7800 XT', tempC: 58, coreClockMHz: 2400, fanRpm: 1500 })
    expect(r.storageTemps).toEqual([{ name: 'Samsung SSD 980 PRO 1TB', tempC: 39 }])
  })
  it('returns nulls when there are no sensors (never invents values)', () => {
    const r = parseLhm([], [])
    expect(r.cpuTempC).toBeNull()
    expect(r.cpuPowerW).toBeNull()
    expect(r.fans).toEqual([])
  })
})

describe('composeGpus', () => {
  const statics = [
    { index: 0, vendor: 'NVIDIA', model: 'NVIDIA GeForce RTX 4070', vramMB: 12288, driverVersion: '561.09', bus: 'PCI' },
    { index: 1, vendor: 'Intel', model: 'Intel(R) UHD Graphics 770', vramMB: 128, driverVersion: '31', bus: 'PCI' }
  ]
  it('uses nvidia-smi for NVIDIA and perf counters for others, excluding the NVIDIA adapter LUID', () => {
    const nv = parseNvidiaSmi('0, NVIDIA GeForce RTX 4070, 50, 60, 2000, 12282, 2500, 10500, 35, 120, 561.09')
    const perf = { util: new Map([['a', 50], ['b', 12]]), mem: new Map([['a', 2000 * 1048576], ['b', 300 * 1048576]]) }
    const g = composeGpus(statics, nv, null, perf)
    expect(g[0]).toMatchObject({ source: 'nvidia-smi', util: 50, tempC: 60 })
    expect(g[1]).toMatchObject({ source: 'perf-counters', util: 12, vramUsedMB: 300, tempC: null })
  })
  it('leaves everything null when no source is available', () => {
    const g = composeGpus(statics, [], null, null)
    expect(g.every((x) => x.util === null && x.tempC === null && x.source === 'none')).toBe(true)
  })
  it('normalizes vendors', () => {
    expect(normalizeVendor('Advanced Micro Devices, Inc.', 'Radeon RX 6600')).toBe('AMD')
    expect(normalizeVendor('', 'GeForce GTX 1660')).toBe('NVIDIA')
  })
})

describe('protected processes', () => {
  it('blocks critical system processes, low PIDs and itself', () => {
    expect(isProtectedProcess('csrss.exe', 700, 1)).toBe(true)
    expect(isProtectedProcess('LSASS.EXE', 900, 1)).toBe(true)
    expect(isProtectedProcess('anything', 4, 1)).toBe(true)
    expect(isProtectedProcess('fristy.exe', 1234, 1234)).toBe(true)
    expect(isProtectedProcess('notepad.exe', 5555, 1)).toBe(false)
  })
})

import { resolveFanControl } from '../src/main/fancontrol'

describe('FanControl detection', () => {
  const none = { running: '', registry: '', winget: '' }
  const has = (...ok: string[]) => (p: string) => ok.includes(p)
  it('prefers the running process, then custom, registry, winget, common paths', () => {
    const r = { running: 'C:\\FC\\FanControl.exe', registry: 'C:\\Program Files (x86)\\FanControl\\FanControl.exe', winget: '' }
    expect(resolveFanControl(r, '', [], has(r.running, r.registry))).toMatchObject({ installed: true, running: true, path: r.running, source: 'running' })
    expect(resolveFanControl({ ...none, registry: r.registry }, '', [], has(r.registry))).toMatchObject({ installed: true, running: false, source: 'registry' })
    expect(resolveFanControl(none, 'D:\\tools\\FanControl.exe', [], has('D:\\tools\\FanControl.exe')).source).toBe('custom')
    expect(resolveFanControl(none, '', ['C:\\Program Files\\FanControl\\FanControl.exe'], has('C:\\Program Files\\FanControl\\FanControl.exe')).source).toBe('common')
  })
  it('ignores non-FanControl executables and missing files', () => {
    expect(resolveFanControl(none, 'C:\\evil.exe', [], () => true)).toMatchObject({ installed: false, path: '' })
    expect(resolveFanControl({ ...none, registry: 'C:\\X\\FanControl.exe' }, '', [], () => false).installed).toBe(false)
  })
  it('reports running even when the process path is not readable', () => {
    expect(resolveFanControl({ ...none, running: '?' }, '', [], () => false)).toMatchObject({ installed: true, running: true, path: '' })
  })
})
