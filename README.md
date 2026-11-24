# FRISTY PC Manager

Real-time hardware monitor and PC management tool for **Windows 10 and Windows 11**, built with Electron, React, TypeScript, Tailwind CSS, Framer Motion, Recharts, `systeminformation` and SQLite.

- Live dashboard: CPU, GPU, RAM, VRAM, storage, network, fans, uptime, power draw
- Detail pages: CPU (per-core), GPU (multi-GPU), Memory (modules), Storage (drives, SMART, I/O), Network (adapters, throughput)
- Task-Manager-style **process manager** (icons, search, sort, open location, end task with confirmation, protected system processes)
- **Hardware inventory** with copy / export (.txt / .json)
- **Startup manager** (enable/disable the same reversible way Task Manager does, with restore-to-original)
- **Performance history** stored locally in SQLite, with hour/day/week/month graphs, averages/maximums, CSV export and configurable retention
- **Cooling page** with fan readings and **fan control through FanControl** (detect, open, install via winget)
- Optional click-through **gaming overlay** (no game injection)
- **Alerts** for CPU/GPU temperature, RAM usage, low disk space and SMART health, with thresholds and cooldowns
- English and Hebrew (full RTL), dark/light theme, custom accent color, °C/°F

> Unavailable readings are always displayed as **N/A**. FRISTY never generates or estimates fake hardware values.

---

## Installation (end users)

1. Run `FRISTY-PC-Manager-Setup-<version>.exe`.
2. Choose the install folder. The default per-user install doesn't need administrator rights.
3. Launch **FRISTY PC Manager** from the Start menu or desktop shortcut.

The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**, or sign the build (see *Code signing* below).

### Getting temperatures, fans and power readings

Windows doesn't expose CPU temperature, fan speeds or CPU package power through a standard API. FRISTY reads them from **LibreHardwareMonitor** (or OpenHardwareMonitor) when it is running:

1. Download LibreHardwareMonitor from its official GitHub releases page.
2. Run `LibreHardwareMonitor.exe` **as administrator**. Optionally enable *Options → Run on Windows startup*.
3. FRISTY detects its WMI sensors automatically within a few seconds. The sidebar shows **Sensor source: LibreHardwareMonitor**.

Without it, FRISTY falls back to the ACPI thermal zone (only when Windows reports one; it can need admin rights). Otherwise these readings show N/A. All other metrics work without any extra software.

### Where each reading comes from

| Data | Source |
|---|---|
| CPU usage, per-core usage | OS counters (`systeminformation`) |
| CPU clock | Windows `Processor Information` counters (% of nominal frequency, the same as Task Manager) |
| CPU temperature / package power, motherboard fans | LibreHardwareMonitor / OpenHardwareMonitor WMI, otherwise ACPI thermal zone, otherwise N/A |
| NVIDIA GPU (usage, temp, VRAM, clocks, fan, power) | `nvidia-smi`, which installs with the NVIDIA driver |
| AMD / Intel GPU usage and VRAM | Windows GPU performance counters (WDDM 2.x, the same as Task Manager) |
| AMD / Intel GPU temperature, clocks, fan, power | LibreHardwareMonitor when running, otherwise N/A |
| Disk read/write and active time | Windows `PhysicalDisk` performance counters |
| SMART status, drive model, type | WMI (`systeminformation`); drive temperature from LibreHardwareMonitor or smartctl |
| Per-process disk I/O | Windows `PerfProc_Process` counters |
| FPS (overlay) | Optional Intel **PresentMon** (ETW tracing, no injection; requires administrator) |

All Windows performance data is read through locale-independent CIM classes, so it also works on Hebrew and other non-English Windows installations. One persistent, hidden PowerShell sampler streams these readings. FRISTY does not spawn a new process on every tick.

---

## Development

Requirements: **Node.js 20+** (22 LTS recommended), npm, and Windows 10/11 for full functionality. The app also runs on Linux/macOS for UI development, using the sensors available on that OS.

```bash
npm install
```

```bash
npm run dev
```

The `dev` command starts Electron with hot reload for the renderer.

| Command | What it does |
|---|---|
| `npm run dev` | Run in development mode (Vite dev server + Electron) |
| `npm run typecheck` | TypeScript checks for main/preload and renderer |
| `npm test` | Unit and integration tests (Vitest). The integration tests read real hardware on the machine that runs them |
| `npm run build` | Typecheck and build production bundles into `out/` |
| `npm run preview` | Run the production build locally |
| `npm run dist:win` | Build the Windows **NSIS installer** → `dist/FRISTY-PC-Manager-Setup-<version>.exe` |
| `npm run dist:dir` | Build an unpacked Windows app folder only (`dist/win-unpacked/`) for quick testing |

### Building the Windows installer

On Windows:

```bash
npm run dist:win
```

You can also build from Linux/macOS (for example in CI). Normally electron-builder runs an intermediate NSIS stub under Wine to extract the uninstaller. `scripts/build-win.cjs` switches on electron-builder's own pure-JavaScript uninstaller extractor instead, so **Wine is not required**. The output is the same `dist/FRISTY-PC-Manager-Setup-<version>.exe`.

### Code signing

To sign, set the standard electron-builder variables before `npm run dist:win`: `CSC_LINK` (path or base64 of a `.pfx`) and `CSC_KEY_PASSWORD`.

---

## Project structure

```
src/
  shared/          Types, settings schema and validation, IPC channel names, protected-process list
  main/            Electron main process
    index.ts         App lifecycle, windows, tray, validated IPC handlers, confirmations
    monitor.ts       Collector: merges systeminformation, Windows counters, nvidia-smi, LHM sensors
    sensors/         winSampler (persistent PowerShell), nvidia-smi, LibreHardwareMonitor parser, PresentMon FPS
    history.ts       SQLite (sql.js) history: per-minute aggregation, compaction, retention, CSV
    processes.ts     Process list, disk I/O, protected end-task
    startup.ts       Startup entries (Run keys + Startup folders) via StartupApproved flags, with backup/restore
    alerts.ts        Threshold alerts with cooldowns
    overlay.ts       Click-through always-on-top overlay window
    security.ts      Renderer-origin verification for IPC
  preload/         contextBridge API (the only surface exposed to the UI)
  renderer/        React UI (pages, components, i18n, overlay entry)
tests/             Vitest test suites
scripts/           Windows build helper
resources/         App/tray icons (shipped with the app)
build/             Installer icons
```

User data is stored in `%APPDATA%\FRISTY PC Manager\`:

- `settings.json`
- `history.sqlite`
- `startup-backup.json`: original state of every startup entry FRISTY changed

## Security and safety

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for every window. Strict Content-Security-Policy. Navigation and new windows are blocked, and all permission requests are denied.
- Every IPC channel has an argument validator. Requests from anything other than FRISTY's own bundled pages are rejected.
- Destructive actions (end process, change startup entry, clear history) ask for confirmation in a **main-process** dialog, so the UI can't bypass them.
- Critical Windows processes (csrss, lsass, winlogon, services, svchost, dwm, Defender and others) can't be ended.
- Startup entries are never deleted. Disabling only sets Windows' `StartupApproved` flag, and the original state can be restored.
- The app runs as a normal user (`asInvoker`). **Settings → Restart as administrator** elevates through UAC only when you need it: elevated processes, machine-wide startup entries, PresentMon.
- FRISTY never modifies BIOS, voltages or clocks, never disables Windows security features, never injects into games and never interacts with anti-cheat software.
- Resource use: one sampler process, no polling of the process list unless the Processes page is open, and no UI updates while minimized. Monitoring slows to every 5 s while the window is hidden and the overlay is off.

## Fan control

The **Cooling** page integrates with [FanControl](https://getfancontrol.com/), a free, open-source fan controller built on LibreHardwareMonitor:

- FRISTY detects FanControl from the running process, its installer's uninstall registry key, the winget package folder, common install folders, or a custom path you set.
- **Open FanControl** launches it through Windows, which shows FanControl's own UAC prompt.
- **Install (winget)** opens a visible console that runs the official package `Rem0o.FanControl`, after a confirmation dialog.
- You create fan curves inside FanControl, for example CPU temperature → CPU fan. FRISTY never writes to fan hardware itself.
- Some laptops and prebuilt PCs lock fan control in the BIOS/EC. FanControl reports fans it can't control.

## Gaming overlay compatibility

The overlay is an ordinary transparent, click-through, always-on-top desktop window.

- ✅ Windowed and borderless-windowed ("fullscreen windowed") games and apps.
- ❌ **Exclusive fullscreen** DirectX/Vulkan games, which draw over every desktop window. Switch the game to borderless mode.
- ❌ Games running as administrator, or protected full-screen experiences, may hide it.
- FPS needs the **PresentMon console version** (`PresentMon-<version>-x64.exe` from https://github.com/GameTechDev/PresentMon/releases). The graphical Intel PresentMon app (`C:\Program Files\Intel\PresentMon\PresentMonApplication`) can't stream data to other programs, so it won't work. Enter the path to the console `.exe`, or the folder that contains it, under **Settings → Gaming overlay**, and run FRISTY as administrator. FPS then shows on the Overview page and in the overlay. Settings tells you exactly what is missing.
- Toggle hotkey: **Ctrl+Shift+O**.
