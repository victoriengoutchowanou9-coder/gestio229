import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './App.css'
import { installGlobalModalInterceptors } from './components/modals/CustomModalGestio'
import { supabase } from './lib/supabase'

// =============================================================================
// GESTIO 229 — Initialisation globale (thème, PWA, version check, chunk guard, modales pro)
// =============================================================================

// Élimination définitive des popups natives browser (gestio229.vercel.app indique)
installGlobalModalInterceptors()

declare const __APP_VERSION__: string

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase

  // ── 1. Thème clair/sombre (sans saut visuel, synchronisé data-theme) ────
  const savedTheme = localStorage.getItem('gestio-theme') || localStorage.getItem('gestio_theme')
  const isClair = savedTheme === 'clair' || savedTheme === 'light'
  const themeVal = isClair ? 'clair' : 'sombre'
  document.documentElement.setAttribute('data-theme', themeVal)
  if (isClair) {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  } else {
    document.documentElement.classList.remove('light')
    document.documentElement.classList.add('dark')
  }

  // ── 2. Gestion de version & mise à jour PWA transparente ─────────────────
  try {
    const PWA_VERSION_KEY = 'pwa-version'
    const storedVersion = localStorage.getItem(PWA_VERSION_KEY)
    const currentVersion = __APP_VERSION__

    if (storedVersion && storedVersion !== currentVersion) {
      localStorage.setItem(PWA_VERSION_KEY, currentVersion)
      sessionStorage.removeItem('gestio229_chunk_reload_done')

      // Garde anti-boucle : vérifier si rechargé dans les 5 dernières minutes
      const lastReloadStr = sessionStorage.getItem('pwa-reloaded-at')
      const now = Date.now()
      const alreadyReloadedRecently = lastReloadStr && (now - parseInt(lastReloadStr, 10) < 5 * 60 * 1000)

      if (!alreadyReloadedRecently) {
        sessionStorage.setItem('pwa-reloaded-at', String(now))
        // Rechargement UNE SEULE FOIS en purgeant proprement
        ;(async () => {
          try {
            if ('caches' in window) {
              const keys = await caches.keys()
              await Promise.all(keys.map((k) => caches.delete(k)))
            }
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration()
              if (reg) await reg.update().catch(() => {})
            }
          } catch (_) {}
          window.location.reload()
        })()
      }
    } else {
      localStorage.setItem(PWA_VERSION_KEY, currentVersion)
    }
  } catch (_) {}

  // ── 3. Filet de sécurité global : chunk error + TDZ error ────────────────
  const isAutoReloadableError = (msg: string) =>
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    (msg.includes('Cannot access') && msg.includes('before initialization'))

  const handleSafeAutoReload = async (reason: string) => {
    const lastReloadStr = sessionStorage.getItem('pwa-reloaded-at')
    const now = Date.now()
    if (lastReloadStr && (now - parseInt(lastReloadStr, 10) < 5 * 60 * 1000)) {
      console.warn('[GESTIO 229] Déjà actualisé récemment. Pas de boucle :', reason)
      return
    }
    sessionStorage.setItem('pwa-reloaded-at', String(now))
    sessionStorage.setItem('gestio229_chunk_reload_done', '1')

    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } catch (_) {}
    window.location.reload()
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason ?? '')
    if (isAutoReloadableError(msg)) {
      event.preventDefault()
      handleSafeAutoReload(`unhandledrejection: ${msg}`)
    }
  })

  window.addEventListener('error', (event) => {
    const msg = (event?.error?.message || event?.message || '')
    if (msg.includes('Cannot access') && msg.includes('before initialization')) {
      handleSafeAutoReload(`error TDZ: ${msg}`)
    }
  })

  // ── 4. Service Worker PWA avec détection Workbox transparente ────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Si un nouveau SW attend déjà
          if (reg.waiting) {
            window.dispatchEvent(new CustomEvent('gestio-pwa-update-available'))
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  window.dispatchEvent(new CustomEvent('gestio-pwa-update-available'))
                }
              })
            }
          })

          reg.update().catch(() => {})
        })
        .catch(() => {})
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

