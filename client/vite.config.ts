import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/customerservicecrm/', // Tetap simpan untuk GitHub Pages
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to Backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy Admin Auth requests
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy WebSocket for real-time logs/QR
      '/socket.io': { // Jika pakai socket.io (opsional, jaga-jaga)
        target: 'ws://localhost:3000',
        ws: true,
      }
    }
  }
})