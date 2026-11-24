/**
 * Builds the Windows NSIS installer.
 *  - On Windows this is a plain electron-builder run.
 *  - On Linux/macOS, electron-builder normally executes the intermediate NSIS stub under Wine to
 *    extract the uninstaller. Where Wine is unavailable/broken (CI containers), we switch on
 *    electron-builder's own built-in pure-JS UninstallerReader (the path it already uses on modern macOS).
 */
const { build, Platform, Arch } = require('electron-builder')

if (process.platform !== 'win32') {
  const macos = require('app-builder-lib/out/util/macosVersion')
  macos.isMacOsCatalina = () => true
}

build({ targets: Platform.WINDOWS.createTarget(process.argv.includes('--dir') ? 'dir' : 'nsis', Arch.x64) })
  .then((files) => console.log('Built:\n  ' + files.join('\n  ')))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
