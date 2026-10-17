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

  // ── 2. Version check : détection de nouveau déploiement Vercel ───────────
  try {
    const STORED_VERSION_KEY = 'gestio229_app_version'
    const storedVersion = localStorage.getItem(STORED_VERSION_KEY)
    const currentVersion = __APP_VERSION__

    if (storedVersion && storedVersion !== currentVersion) {
      console.info(`[GESTIO 229] Nouveau déploiement détecté (${storedVersion} → ${currentVersion}) — mise à jour immédiate…`)
      localStorage.setItem(STORED_VERSION_KEY, currentVersion)
      sessionStorage.removeItem('gestio229_chunk_reload_done')

      ;(async () => {
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations()
            await Promise.all(regs.map((r) => r.unregister()))
          }
          if ('caches' in window) {
            const keys = await window.caches.keys()
            await Promise.all(keys.map((k) => window.caches.delete(k)))
          }
        } catch (_) {}
        window.location.href = window.location.origin + window.location.pathname + '?v=' + currentVersion
      })()
    } else {
      localStorage.setItem(STORED_VERSION_KEY, currentVersion)
    }
  } catch (_) {}

  // ── 3. Filet de sécurité global : chunk error + TDZ error → reload auto unique ──
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
    const RELOAD_GUARD_KEY = 'gestio229_chunk_reload_done'
    const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
    if (alreadyReloaded) {
      console.warn('[GESTIO 229] Rechargement automatique déjà exécuté une fois. Boucle bloquée :', reason)
      return
    }
    console.warn('[GESTIO 229] Incident post-déploiement détecté — purge SW & cache, rechargement immédiat :', reason)
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    try {
      localStorage.removeItem('gestio229_app_version')
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await window.caches.keys()
        await Promise.all(keys.map((k) => window.caches.delete(k)))
      }
    } catch (_) {}
    window.location.href = window.location.origin + window.location.pathname + '?ts=' + Date.now()
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

  // ── 4. Service Worker PWA avec vérification active de mise à jour ──────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
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

