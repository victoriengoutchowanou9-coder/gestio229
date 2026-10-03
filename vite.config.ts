import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
  define: {
    // Identifiant unique de chaque build — change à chaque déploiement Vercel
    // Utilisé pour détecter un nouveau déploiement et forcer un rechargement propre
    __APP_VERSION__: JSON.stringify(`${Date.now()}`),
  }
})

