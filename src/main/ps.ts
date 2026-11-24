import { execFile, spawn, ChildProcessWithoutNullStreams } from 'child_process'

export const isWin = process.platform === 'win32'

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden']
const PRELUDE = "$ErrorActionPreference='SilentlyContinue';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;"

function encode(script: string): string {
  return Buffer.from(PRELUDE + script, 'utf16le').toString('base64')
}

/** Run a one-shot PowerShell script and resolve with stdout. Rejects on timeout or non-Windows. */
export function runPowerShell(script: string, timeoutMs = 20000): Promise<string> {
  if (!isWin) return Promise.reject(new Error('PowerShell is only used on Windows'))
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [...PS_ARGS, '-EncodedCommand', encode(script)],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout))
    )
  })
}

export async function runPowerShellJson<T>(script: string, timeoutMs?: number): Promise<T | null> {
  const out = (await runPowerShell(script, timeoutMs)).trim()
  if (!out) return null
  return JSON.parse(out) as T
}

/** Long-running PowerShell that prints one JSON document per line. */
export function spawnPowerShellStream(script: string, onLine: (line: string) => void, onExit: (code: number | null) => void): ChildProcessWithoutNullStreams {
  const child = spawn('powershell.exe', [...PS_ARGS, '-EncodedCommand', encode(script)], { windowsHide: true })
  let buf = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) onLine(line)
    }
    if (buf.length > 4 * 1024 * 1024) buf = ''
  })
  child.stderr.resume()
  child.on('exit', onExit)
  child.on('error', () => onExit(-1))
  return child
}

/** Quote a string for safe embedding inside a single-quoted PowerShell literal. */
export function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}
