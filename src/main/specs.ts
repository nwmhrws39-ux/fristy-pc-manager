import type { StaticInfo } from '@shared/types'

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`
const v = (s: string | number | null | undefined) => (s === null || s === undefined || s === '' ? 'N/A' : String(s))

export function specsToText(s: StaticInfo): string {
  const L: string[] = []
  const sec = (t: string) => L.push('', `== ${t} ==`)
  L.push('FRISTY PC Manager — System Specifications', `Generated: ${new Date().toLocaleString()}`)
  sec('Computer')
  L.push(`Manufacturer: ${v(s.system.manufacturer)}`, `Model: ${v(s.system.model)}`, `Chassis: ${v(s.chassis.type)}`)
  sec('Operating System')
  L.push(`OS: ${v(s.os.distro)} ${v(s.os.release)}`, `Build: ${v(s.os.build)}`, `Architecture: ${v(s.os.arch)}`, `Hostname: ${v(s.os.hostname)}`)
  sec('Motherboard / BIOS')
  L.push(`Motherboard: ${v(s.baseboard.manufacturer)} ${v(s.baseboard.model)}`, `BIOS: ${v(s.bios.vendor)} ${v(s.bios.version)} (${v(s.bios.releaseDate)})`)
  sec('Processor')
  L.push(`CPU: ${v(s.cpu.manufacturer)} ${v(s.cpu.brand)}`, `Cores / Threads: ${s.cpu.physicalCores} / ${s.cpu.cores}`, `Base / Max: ${v(s.cpu.speedBaseGHz)} GHz / ${v(s.cpu.speedMaxGHz)} GHz`, `Socket: ${v(s.cpu.socket)}`, `Architecture: ${v(s.cpu.arch)}`)
  sec('Graphics')
  s.gpus.forEach((g, i) => L.push(`GPU ${i + 1}: ${g.model} (${g.vendor}) — VRAM ${g.vramMB ? Math.round(g.vramMB / 1024) + ' GB' : 'N/A'} — Driver ${v(g.driverVersion)}`))
  if (!s.gpus.length) L.push('N/A')
  sec('Memory')
  const total = s.memModules.reduce((a, m) => a + m.size, 0)
  L.push(`Installed: ${total ? gb(total) : 'N/A'} in ${s.memModules.length} module(s)`)
  s.memModules.forEach((m) => L.push(`  ${v(m.bank)}: ${gb(m.size)} ${v(m.type)} @ ${v(m.clockSpeed)} MT/s — ${v(m.manufacturer)} ${v(m.partNum)}`))
  sec('Storage')
  s.disks.forEach((d) => L.push(`${d.name} — ${d.type} — ${gb(d.size)} — ${v(d.interfaceType)} — SMART: ${v(d.smartStatus)}`))
  sec('Displays')
  s.displays.forEach((d) => L.push(`${d.model}${d.main ? ' (primary)' : ''} — ${v(d.resolutionX)}x${v(d.resolutionY)} @ ${v(d.refreshRate)} Hz — ${v(d.connection)}`))
  sec('Network')
  s.net.filter((n) => !n.virtual).forEach((n) => L.push(`${n.ifaceName || n.iface} — ${v(n.type)} — ${v(n.ip4)} — ${n.speedMbps ? n.speedMbps + ' Mbps' : 'N/A'}`))
  return L.join('\r\n') + '\r\n'
}
