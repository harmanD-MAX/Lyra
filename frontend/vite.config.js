import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Production build: no source maps, all comments and console calls
  // stripped, identifiers mangled, so the shipped code is not readable source.
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        comments: false,
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
          mangle: true,
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/outputs': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
