import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7844',
      '/ws': { target: 'ws://localhost:7844', ws: true },
    },
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
})
