import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mint/',
  build: {
    outDir: '../public/mint',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api2': 'http://localhost:3000',
      '/join': 'http://localhost:3000',
    }
  }
})
