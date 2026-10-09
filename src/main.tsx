import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './App.css'

// =============================================================================
// GESTIO 229 — Initialisation globale (thème, PWA, version check, chunk guard)
// =============================================================================

declare const __APP_VERSION__: string

if (typeof window !== 'undefined') {

  // ── 1. Thème clair/sombre (sans saut visuel) ─────────────────────────────
  const savedTheme = localStorage.getItem('gestio_theme')
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }

  // ── 2. Version check : détection de nouveau déploiement Vercel ───────────
  // À chaque déploiement, __APP_VERSION__ est un nouveau timestamp unique.
  // Si la version stockée ≠ version courante → nouveau build détecté →
  // on vide les caches et on reload une fois proprement.
  try {
    const STORED_VERSION_KEY = 'gestio229_app_version'
    const RELOAD_VERSION_KEY = 'gestio229_version_reload'
    const storedVersion = localStorage.getItem(STORED_VERSION_KEY)
    const currentVersion = __APP_VERSION__

    if (storedVersion && storedVersion !== currentVersion) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_VERSION_KEY) === '1'
      if (!alreadyReloaded) {
        console.info(`[GESTIO 229] Nouveau déploiement détecté (${storedVersion} → ${currentVersion}) — rechargement…`)
        sessionStorage.setItem(RELOAD_VERSION_KEY, '1')
        localStorage.setItem(STORED_VERSION_KEY, currentVersion)
        // Vider le cache SW si possible avant de recharger
        if ('caches' in window) {
          caches.keys().then((names) => names.forEach((n) => caches.delete(n))).catch(() => {})
        }
        window.location.href = window.location.pathname + '?t=' + Date.now()
      }
    } else {
      // Première visite ou version identique : enregistrer / maintenir la version
      localStorage.setItem(STORED_VERSION_KEY, currentVersion)
      sessionStorage.removeItem(RELOAD_VERSION_KEY)
    }
  } catch (_) {}

  // ── 3. Filet de sécurité global : chunk error → reload automatique ────────
  // Si un import dynamique échoue EN DEHORS de safeLazy (ex: SW stale),
  // on le capture ici et on recharge une fois.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason ?? '')
    const isChunkError = (
      msg.includes('dynamically imported module') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module')
    )
    if (isChunkError) {
      event.preventDefault()
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        console.warn('[GESTIO 229] Chunk error global intercepté — rechargement automatique…', msg)
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        window.location.href = window.location.pathname + '?t=' + Date.now()
      }
    }
  })

  // ── 4. Service Worker PWA ─────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[GESTIO 229 PWA] Service Worker actif :', reg.scope)
        })
        .catch((err) => {
          console.warn('[GESTIO 229 PWA] Échec enregistrement Service Worker :', err)
        })
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

