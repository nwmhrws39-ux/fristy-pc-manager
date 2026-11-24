import fs from 'fs'
import path from 'path'
import initSqlJs, { Database } from 'sql.js'
import type { HistoryPoint, HistoryRange, HistoryStats, Num, Snapshot } from '@shared/types'

const RANGE_MS: Record<HistoryRange, number> = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }
const BUCKET_MS: Record<HistoryRange, number> = { hour: 60e3, day: 5 * 60e3, week: 30 * 60e3, month: 2 * 3600e3 }
const METRICS = ['cpu', 'gpu', 'cpuTemp', 'gpuTemp', 'ram', 'rx', 'tx'] as const
type Metric = (typeof METRICS)[number]

/** Running average/max of live snapshots for the current minute. Null readings are simply not counted. */
class Accumulator {
  private sums: Record<Metric, number> = { cpu: 0, gpu: 0, cpuTemp: 0, gpuTemp: 0, ram: 0, rx: 0, tx: 0 }
  private counts: Record<Metric, number> = { cpu: 0, gpu: 0, cpuTemp: 0, gpuTemp: 0, ram: 0, rx: 0, tx: 0 }
  private maxes: Record<Metric, number> = { cpu: -Infinity, gpu: -Infinity, cpuTemp: -Infinity, gpuTemp: -Infinity, ram: -Infinity, rx: -Infinity, tx: -Infinity }
  add(m: Metric, v: Num): void {
    if (v === null || !Number.isFinite(v)) return
    this.sums[m] += v
    this.counts[m]++
    this.maxes[m] = Math.max(this.maxes[m], v)
  }
  avg(m: Metric): Num {
    return this.counts[m] ? this.sums[m] / this.counts[m] : null
  }
  max(m: Metric): Num {
    return this.counts[m] ? this.maxes[m] : null
  }
  get empty(): boolean {
    return METRICS.every((m) => this.counts[m] === 0)
  }
}

export function snapshotMetrics(s: Snapshot): Record<Metric, Num> {
  const utils = s.gpus.map((g) => g.util).filter((v): v is number => v !== null)
  const temps = s.gpus.map((g) => g.tempC).filter((v): v is number => v !== null)
  const ifs = s.net.filter((x) => x.rxSec !== null || x.txSec !== null)
  return {
    cpu: s.cpu.load,
    gpu: utils.length ? Math.max(...utils) : null,
    cpuTemp: s.cpu.tempC,
    gpuTemp: temps.length ? Math.max(...temps) : null,
    ram: s.mem.percent,
    rx: ifs.length ? ifs.reduce((a, x) => a + (x.rxSec ?? 0), 0) : null,
    tx: ifs.length ? ifs.reduce((a, x) => a + (x.txSec ?? 0), 0) : null
  }
}

export class HistoryStore {
  private db: Database | null = null
  private acc = new Accumulator()
  private minute = 0
  private dirty = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private file: string, private wasmPath: string) {}

  async open(): Promise<void> {
    const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(this.wasmPath) as unknown as ArrayBuffer })
    let data: Uint8Array | undefined
    try {
      if (fs.existsSync(this.file)) data = fs.readFileSync(this.file)
    } catch {
      data = undefined
    }
    try {
      this.db = new SQL.Database(data)
      this.db.exec('SELECT 1 FROM sqlite_master LIMIT 1')
    } catch {
      // Corrupt file: keep a copy for inspection and start fresh rather than crash.
      try {
        fs.renameSync(this.file, this.file + '.corrupt-' + Date.now())
      } catch {
        /* ignore */
      }
      this.db = new SQL.Database()
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS samples (
      ts INTEGER NOT NULL, res INTEGER NOT NULL DEFAULT 60,
      cpu REAL, cpuMax REAL, gpu REAL, gpuMax REAL, cpuTemp REAL, cpuTempMax REAL,
      gpuTemp REAL, gpuTempMax REAL, ram REAL, ramMax REAL, rx REAL, tx REAL, rxMax REAL, txMax REAL);
      CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts);`)
    this.saveTimer = setInterval(() => this.save(), 5 * 60e3)
  }

  /** Feed a live snapshot; one aggregated row per minute is written. */
  record(s: Snapshot): void {
    if (!this.db) return
    const minute = Math.floor(s.ts / 60e3) * 60e3
    if (this.minute && minute !== this.minute) this.flushMinute()
    this.minute = minute
    const m = snapshotMetrics(s)
    for (const k of METRICS) this.acc.add(k, m[k])
  }

  private flushMinute(): void {
    if (!this.db || this.acc.empty) return
    const a = this.acc
    this.db.run('INSERT INTO samples (ts,res,cpu,cpuMax,gpu,gpuMax,cpuTemp,cpuTempMax,gpuTemp,gpuTempMax,ram,ramMax,rx,tx,rxMax,txMax) VALUES (?,60,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      this.minute, a.avg('cpu'), a.max('cpu'), a.avg('gpu'), a.max('gpu'), a.avg('cpuTemp'), a.max('cpuTemp'), a.avg('gpuTemp'), a.max('gpuTemp'), a.avg('ram'), a.max('ram'), a.avg('rx'), a.avg('tx'), a.max('rx'), a.max('tx')
    ])
    this.acc = new Accumulator()
    this.dirty = true
  }

  query(range: HistoryRange, now = Date.now()): HistoryPoint[] {
    if (!this.db) return []
    const bucket = BUCKET_MS[range]
    const res = this.db.exec(
      `SELECT (ts / ${bucket}) * ${bucket} AS b, AVG(cpu), MAX(cpuMax), AVG(gpu), MAX(gpuMax), AVG(cpuTemp), MAX(cpuTempMax),
        AVG(gpuTemp), MAX(gpuTempMax), AVG(ram), MAX(ramMax), AVG(rx), AVG(tx)
       FROM samples WHERE ts >= ? GROUP BY b ORDER BY b`,
      [now - RANGE_MS[range]]
    )
    const r1 = (v: unknown): Num => (typeof v === 'number' ? Math.round(v * 10) / 10 : null)
    return (res[0]?.values ?? []).map((v) => ({
      ts: v[0] as number, cpu: r1(v[1]), cpuMax: r1(v[2]), gpu: r1(v[3]), gpuMax: r1(v[4]), cpuTemp: r1(v[5]), cpuTempMax: r1(v[6]),
      gpuTemp: r1(v[7]), gpuTempMax: r1(v[8]), ram: r1(v[9]), ramMax: r1(v[10]), rx: r1(v[11]), tx: r1(v[12])
    }))
  }

  stats(range: HistoryRange, now = Date.now()): HistoryStats[] {
    if (!this.db) return []
    const res = this.db.exec(
      `SELECT AVG(cpu), MAX(cpuMax), AVG(gpu), MAX(gpuMax), AVG(cpuTemp), MAX(cpuTempMax), AVG(gpuTemp), MAX(gpuTempMax), AVG(ram), MAX(ramMax), AVG(rx), MAX(rxMax), AVG(tx), MAX(txMax)
       FROM samples WHERE ts >= ?`,
      [now - RANGE_MS[range]]
    )
    const v = res[0]?.values[0] ?? []
    const r1 = (x: unknown): Num => (typeof x === 'number' ? Math.round(x * 10) / 10 : null)
    return METRICS.map((m, i) => ({ metric: m, avg: r1(v[i * 2]), max: r1(v[i * 2 + 1]) }))
  }

  toCsv(range: HistoryRange): string {
    const rows = this.query(range)
    const head = 'timestamp,cpu_avg_pct,cpu_max_pct,gpu_avg_pct,gpu_max_pct,cpu_temp_avg_c,cpu_temp_max_c,gpu_temp_avg_c,gpu_temp_max_c,ram_avg_pct,ram_max_pct,net_rx_avg_Bps,net_tx_avg_Bps'
    const f = (x: Num) => (x === null ? '' : String(x))
    return [head, ...rows.map((r) => [new Date(r.ts).toISOString(), r.cpu, r.cpuMax, r.gpu, r.gpuMax, r.cpuTemp, r.cpuTempMax, r.gpuTemp, r.gpuTempMax, r.ram, r.ramMax, r.rx, r.tx].map((x) => (typeof x === 'string' ? x : f(x))).join(','))].join('\r\n') + '\r\n'
  }

  /** Delete rows older than the retention window and compact rows older than 48h into 10-minute rows. */
  prune(retentionDays: number, now = Date.now()): void {
    if (!this.db) return
    this.db.run('DELETE FROM samples WHERE ts < ?', [now - retentionDays * 86400e3])
    const cutoff = now - 48 * 3600e3
    const B = 600e3
    const has = this.db.exec('SELECT COUNT(*) FROM samples WHERE res < 600 AND ts < ?', [cutoff])[0]?.values[0][0] as number
    if (has > 0) {
      this.db.exec('BEGIN')
      this.db.run(
        `INSERT INTO samples (ts,res,cpu,cpuMax,gpu,gpuMax,cpuTemp,cpuTempMax,gpuTemp,gpuTempMax,ram,ramMax,rx,tx,rxMax,txMax)
         SELECT (ts / ${B}) * ${B}, 600, AVG(cpu), MAX(cpuMax), AVG(gpu), MAX(gpuMax), AVG(cpuTemp), MAX(cpuTempMax), AVG(gpuTemp), MAX(gpuTempMax),
                AVG(ram), MAX(ramMax), AVG(rx), AVG(tx), MAX(rxMax), MAX(txMax)
         FROM samples WHERE res < 600 AND ts < ? GROUP BY (ts / ${B})`,
        [cutoff]
      )
      this.db.run('DELETE FROM samples WHERE res < 600 AND ts < ?', [cutoff])
      this.db.exec('COMMIT')
    }
    this.dirty = true
  }

  clear(): void {
    this.db?.run('DELETE FROM samples')
    this.acc = new Accumulator()
    this.dirty = true
    this.save()
  }

  count(): number {
    return (this.db?.exec('SELECT COUNT(*) FROM samples')[0]?.values[0][0] as number) ?? 0
  }

  /** Atomic write: temp file then rename, so a crash never leaves a half-written database. */
  save(): void {
    if (!this.db || !this.dirty) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      fs.writeFileSync(tmp, Buffer.from(this.db.export()))
      fs.renameSync(tmp, this.file)
      this.dirty = false
    } catch (e) {
      console.error('history save failed', e)
    }
  }

  close(): void {
    this.flushMinute()
    this.save()
    if (this.saveTimer) clearInterval(this.saveTimer)
    this.db?.close()
    this.db = null
  }
}
