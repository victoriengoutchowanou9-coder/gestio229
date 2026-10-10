import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 3000,
    host: true
  },
  esbuild: {
    keepNames: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/zustand')
          ) {
            return 'vendor-react'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          if (
            id.includes('DashboardPage') ||
            id.includes('SectorErrorBoundary') ||
            id.includes('ModuleGuard') ||
            id.includes('SectorGuard') ||
            id.includes('useTenant') ||
            id.includes('sectorClient') ||
            id.includes('hubFinancialService') ||
            id.includes('factureAvoirService')
          ) {
            return 'dashboard-core'
          }
          if (id.includes('HubPage') || id.includes('MultiservicesHub')) {
            return 'hub-core'
          }
        },
      },
    },
  },
  define: {
    // Identifiant unique de chaque build — change à chaque déploiement Vercel
    // Utilisé pour détecter un nouveau déploiement et forcer un rechargement propre
    __APP_VERSION__: JSON.stringify(`${Date.now()}`),
  }
})

