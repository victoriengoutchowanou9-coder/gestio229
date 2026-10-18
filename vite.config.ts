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
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globIgnores: ['**/middleware-manifest.json'],
      },
      includeAssets: ['icon-*.png', 'icons/*.png'],
      manifest: {
        id: '/gestio229',
        name: 'GESTIO 229 ERP - Logiciel de Gestion & Caisse',
        short_name: 'GESTIO 229',
        description: 'Logiciel de gestion commerciale, stocks, caisse, facturation et multi-activités GESTIO 229',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        scope: '/',
        start_url: '/?pwa=1',
        background_color: '#064e3b',
        theme_color: '#059669',
        lang: 'fr-BJ',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          }
        ],
        shortcuts: [
          {
            name: 'Connexion / HUB',
            short_name: 'HUB',
            description: 'Accéder à l\'espace HUB GESTIO 229',
            url: '/login',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Point de Vente POS',
            short_name: 'POS',
            description: 'Ouvrir la caisse et vente rapide',
            url: '/hub',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
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
