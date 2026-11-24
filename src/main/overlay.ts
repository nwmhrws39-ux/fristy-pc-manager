import { BrowserWindow, screen } from 'electron'
import type { Settings } from '@shared/settings'
import type { OverlayCompat } from '@shared/types'

/**
 * A transparent, click-through, always-on-top window. It does NOT inject into or hook game
 * processes; it is an ordinary desktop window, so it only appears over windowed / borderless games.
 */
export class OverlayWindow {
  win: BrowserWindow | null = null
  constructor(private create: () => BrowserWindow) {}

  get visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible()
  }

  apply(cfg: Settings): void {
    if (!cfg.overlay.enabled) return this.hide()
    if (!this.win || this.win.isDestroyed()) {
      this.win = this.create()
      this.win.setIgnoreMouseEvents(true)
      this.win.setAlwaysOnTop(true, 'screen-saver')
      this.win.setVisibleOnAllWorkspaces(true)
    }
    const rows = Object.values(cfg.overlay.metrics).filter(Boolean).length
    const w = Math.round(210 * cfg.overlay.scale)
    const h = Math.round((34 + Math.max(1, rows) * 21.5) * cfg.overlay.scale)
    const area = screen.getPrimaryDisplay().workArea
    const m = 12
    const x = cfg.overlay.position.endsWith('left') ? area.x + m : area.x + area.width - w - m
    const y = cfg.overlay.position.startsWith('top') ? area.y + m : area.y + area.height - h - m
    this.win.setBounds({ x, y, width: w, height: h })
    this.win.setOpacity(cfg.overlay.opacity)
    if (!this.win.isVisible()) this.win.showInactive()
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
    this.win = null
  }
}

export function overlayCompat(): OverlayCompat {
  const notes = [
    'Supported: windowed and borderless-windowed (fullscreen windowed) games and desktop apps.',
    'Not supported: exclusive fullscreen DirectX/Vulkan games — they draw over every desktop window. Switch the game to borderless mode.',
    'Not supported: games running as administrator may hide non-elevated windows; protected/UWP full-screen experiences may also hide it.',
    'FPS is only available when Intel PresentMon is configured (Settings → Overlay). PresentMon uses Windows ETW tracing and does not inject into games.',
    'FRISTY never injects code into games or interacts with anti-cheat systems.'
  ]
  return { supported: process.platform === 'win32', notes }
}
