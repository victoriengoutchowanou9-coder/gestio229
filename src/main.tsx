import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './App.css'
import { installGlobalModalInterceptors } from './components/modals/CustomModalGestio'

// =============================================================================
// GESTIO 229 — Initialisation globale (thème, PWA, version check, chunk guard, modales pro)
// =============================================================================

// Élimination définitive des popups natives browser (gestio229.vercel.app indique)
installGlobalModalInterceptors()

declare const __APP_VERSION__: string

if (typeof window !== 'undefined') {

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
  // À chaque déploiement, __APP_VERSION__ est un nouveau timestamp unique.
  // Si la version stockée ≠ version courante → nouveau build détecté →
  // on vide les caches, on désenregistre le SW et on reload une seule fois proprement avec délai 3s.
  try {
    const STORED_VERSION_KEY = 'gestio229_app_version'
    const RELOAD_GUARD_KEY = 'gestio229_chunk_reload_done'
    const storedVersion = localStorage.getItem(STORED_VERSION_KEY)
    const currentVersion = __APP_VERSION__

    if (storedVersion && storedVersion !== currentVersion) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
      if (!alreadyReloaded) {
        console.info(`[GESTIO 229] Nouveau déploiement détecté (${storedVersion} → ${currentVersion}) — rechargement dans 3s…`)
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
        localStorage.setItem(STORED_VERSION_KEY, currentVersion)
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => r.unregister())
          }).catch(() => {})
        }
        if ('caches' in window) {
          caches.keys().then((names) => names.forEach((n) => caches.delete(n))).catch(() => {})
        }
        setTimeout(() => {
          window.location.href = window.location.pathname + '?t=' + Date.now()
        }, 3000)
      }
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

  const handleSafeAutoReload = (reason: string) => {
    const RELOAD_GUARD_KEY = 'gestio229_chunk_reload_done'
    const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
    if (alreadyReloaded) {
      console.warn('[GESTIO 229] Rechargement automatique déjà exécuté une fois. Boucle bloquée :', reason)
      return
    }
    console.warn('[GESTIO 229] Incident post-déploiement détecté — purge SW & cache, rechargement unique dans 3s…', reason)
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    try {
      localStorage.removeItem('gestio229_app_version')
    } catch (_) {}
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      }).catch(() => {})
    }
    if ('caches' in window) {
      window.caches.keys().then((names) => names.forEach((n) => window.caches.delete(n))).catch(() => {})
    }
    setTimeout(() => {
      window.location.href = window.location.pathname + '?t=' + Date.now()
    }, 3000)
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

