import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** Dev only: Vite's React refresh preamble is an inline script, so relax script-src while serving. Production keeps the strict CSP. */
const devCsp = (): Plugin => ({
  name: 'fristy-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")
})

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') }
    },
    plugins: [react(), devCsp()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
