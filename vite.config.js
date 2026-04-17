import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^lucide-react$/,
        replacement: fileURLToPath(new URL('./src/utils/lucide.js', import.meta.url)),
      },
    ],
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts')) return 'charts'
          if (id.includes('@azure/msal-browser') || id.includes('@azure/msal-react')) return 'msal'
          if (id.includes('@supabase/supabase-js')) return 'supabase'
          if (id.includes('react-router-dom')) return 'router'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
        },
      },
    },
  },
})
