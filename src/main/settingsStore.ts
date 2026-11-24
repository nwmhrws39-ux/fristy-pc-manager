import fs from 'fs'
import path from 'path'
import { DEFAULT_SETTINGS, Settings, sanitizeSettings } from '@shared/settings'

export class SettingsStore {
  private value: Settings
  constructor(private file: string) {
    let raw: unknown = {}
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      raw = {}
    }
    this.value = sanitizeSettings(raw, DEFAULT_SETTINGS)
  }
  get(): Settings {
    return this.value
  }
  update(patch: unknown): Settings {
    this.value = sanitizeSettings(deepMerge(this.value, patch), this.value)
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.value, null, 2))
      fs.renameSync(this.file + '.tmp', this.file)
    } catch (e) {
      console.error('settings save failed', e)
    }
    return this.value
  }
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch === undefined ? base : patch
  if (typeof base !== 'object' || base === null) return patch
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
    out[k] = deepMerge(out[k], v)
  }
  return out
}
