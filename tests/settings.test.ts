import { describe, expect, it } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { DEFAULT_SETTINGS, sanitizeSettings } from '@shared/settings'
import { SettingsStore } from '../src/main/settingsStore'

describe('sanitizeSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS)
  })
  it('clamps numbers and rejects invalid enums/colors/hotkeys', () => {
    const s = sanitizeSettings({ refreshMs: 1, language: 'fr', accent: 'red', tempUnit: 'K', history: { retentionDays: 9999 }, alerts: { cpuTemp: { threshold: 500, enabled: 'yes' } }, overlay: { opacity: 5, hotkey: 'rm -rf /', position: 'middle' } })
    expect(s.refreshMs).toBe(500)
    expect(s.language).toBe('en')
    expect(s.accent).toBe(DEFAULT_SETTINGS.accent)
    expect(s.tempUnit).toBe('C')
    expect(s.history.retentionDays).toBe(365)
    expect(s.alerts.cpuTemp).toEqual({ enabled: true, threshold: 110 })
    expect(s.overlay.opacity).toBe(1)
    expect(s.overlay.hotkey).toBe(DEFAULT_SETTINGS.overlay.hotkey)
    expect(s.overlay.position).toBe('top-left')
  })
  it('accepts valid values', () => {
    const s = sanitizeSettings({ language: 'he', accent: '#AABBCC', overlay: { hotkey: 'Alt+Shift+F10' }, presentMonPath: 'C:\\pm\\PresentMon.exe' })
    expect(s.language).toBe('he')
    expect(s.accent).toBe('#aabbcc')
    expect(s.overlay.hotkey).toBe('Alt+Shift+F10')
    expect(s.presentMonPath).toBe('C:\\pm\\PresentMon.exe')
  })
  it('only accepts a FanControl.exe path for fan control', () => {
    expect(sanitizeSettings({ fanControlPath: 'C:\\Tools\\FanControl.exe' }).fanControlPath).toBe('C:\\Tools\\FanControl.exe')
    expect(sanitizeSettings({ fanControlPath: 'C:\\Windows\\System32\\cmd.exe' }).fanControlPath).toBe('')
    expect(sanitizeSettings({ fanControlPath: 'C:\\x\\NotFanControl.exe' }).fanControlPath).toBe('')
  })
  it('rejects non-exe PresentMon paths', () => {
    expect(sanitizeSettings({ presentMonPath: 'C:\\evil.bat' }).presentMonPath).toBe('')
  })
})

describe('SettingsStore', () => {
  it('deep-merges patches, persists, and ignores prototype pollution', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fristy-')), 'settings.json')
    const st = new SettingsStore(file)
    st.update({ alerts: { ram: { threshold: 80 } } })
    st.update(JSON.parse('{"__proto__":{"polluted":true},"overlay":{"metrics":{"fps":false}}}'))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    const re = new SettingsStore(file).get()
    expect(re.alerts.ram).toEqual({ enabled: true, threshold: 80 })
    expect(re.overlay.metrics.fps).toBe(false)
    expect(re.overlay.metrics.cpu).toBe(true)
  })
})
