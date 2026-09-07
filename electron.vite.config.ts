import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        // Sandboxed preload scripts must be CommonJS even though the app is ESM.
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src')
      }
    },
    optimizeDeps: {
      // Everything reached only via dynamic import() — pre-bundle so a first
      // use in dev doesn't trigger a full page reload.
      include: [
        'markdown-it',
        'dompurify',
        // The whole CodeMirror family must go through the optimizer together,
        // otherwise dev serves two @codemirror/state / @lezer/highlight
        // instances and syntax highlighting silently matches zero tokens.
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/search',
        '@lezer/highlight',
        '@codemirror/lang-markdown',
        '@codemirror/lang-yaml',
        '@codemirror/lang-json',
        '@codemirror/lang-javascript',
        '@codemirror/lang-html',
        '@codemirror/lang-css',
        '@codemirror/lang-python',
        '@codemirror/lang-xml',
        '@codemirror/lang-sql',
        '@codemirror/legacy-modes/mode/shell',
        '@codemirror/legacy-modes/mode/toml',
        '@codemirror/legacy-modes/mode/dockerfile',
        '@codemirror/legacy-modes/mode/properties'
      ]
    }
  }
})
