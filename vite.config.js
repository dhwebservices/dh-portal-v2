import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const buildVersion = process.env.PORTAL_BUILD_VERSION || new Date().toISOString()

function portalVersionPlugin(version) {
  return {
    name: 'portal-version-plugin',
    generateBundle(_, bundle) {
      const generatedAt = new Date().toISOString()
      const assets = Object.entries(bundle)
        .filter(([fileName, chunk]) => {
          if (fileName.endsWith('.map')) return false
          return (
            fileName.endsWith('.js') ||
            fileName.endsWith('.css') ||
            fileName.endsWith('.html')
          ) && (chunk.type === 'chunk' || chunk.type === 'asset')
        })
        .map(([fileName, chunk]) => ({
          file: `/${fileName}`,
          size:
            chunk.type === 'asset'
              ? typeof chunk.source === 'string'
                ? Buffer.byteLength(chunk.source)
                : chunk.source?.byteLength || 0
              : Buffer.byteLength(chunk.code || ''),
        }))

      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          version,
          built_at: generatedAt,
        }, null, 2),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'update-manifest.json',
        source: JSON.stringify({
          version,
          built_at: generatedAt,
          assets,
        }, null, 2),
      })
    },
  }
}

export default defineConfig({
  define: {
    __PORTAL_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  resolve: {
    alias: [
      {
        find: /^lucide-react$/,
        replacement: fileURLToPath(new URL('./src/utils/lucide.js', import.meta.url)),
      },
    ],
  },
  plugins: [react(), portalVersionPlugin(buildVersion)],
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
