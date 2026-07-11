import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/customerservicecrm/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    }
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: './index.html',
        app: './app.html'
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'sonner'],
        },
      },
    },
  }
})
