import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    proxy: { '/api': process.env.VITE_API_PROXY || 'http://localhost:54321' },
  },
  preview: {
    host: '0.0.0.0',
    port: 4175,
    strictPort: true,
  },
})
