import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'https://phone.openedskill.com',
        changeOrigin: true,
        secure: true,
      },
      '/ws': {
        target: 'https://phone.openedskill.com',
        ws: true,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
