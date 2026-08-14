import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist-renderer',
  },
  plugins: [
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'src/main/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                '@remotion/bundler', 
                '@remotion/renderer', 
                '@remotion/compositor-win32-x64-msvc',
                'remotion', 
                '@rspack/binding'
              ],
            },
          },
        },
      },
      {
        entry: 'src/preload/preload.ts',
        onstart(options) {
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
