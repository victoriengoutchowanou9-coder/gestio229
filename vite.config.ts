import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-*.png', 'icons/*.png'],
      manifest: {
        name: 'GESTIO 229 - STE GESTIO SARL',
        short_name: 'GESTIO 229',
        description: 'Gestion Brasserie Poissonnerie',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0a1931',
        start_url: '/?pwa=1',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
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
  define: {
    // Identifiant unique de chaque build — change à chaque déploiement Vercel
    // Utilisé pour détecter un nouveau déploiement et forcer un rechargement propre
    __APP_VERSION__: JSON.stringify(`${Date.now()}`),
    // Domaine officiel de la plateforme GESTIO 229
    __APP_DOMAIN__: JSON.stringify('www.gestio229.com'),
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          router: ['react-router-dom'],
        },
      },
    },
  },
})
