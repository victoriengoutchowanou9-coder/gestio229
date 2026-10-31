import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './App.css'
import { installGlobalModalInterceptors } from './components/modals/CustomModalGestio'
import { installGlobalPrintHelper } from './utils/printHelper'
import { supabase } from './lib/supabase'

// =============================================================================
// GESTIO 229 — Initialisation globale (thème, PWA, auto-update transparent, chunk guard)
// =============================================================================

// Élimination définitive des popups natives browser (gestio229.com indique)
installGlobalModalInterceptors()
installGlobalPrintHelper()

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

  // ── 2. Gestion de version & Déclenchement automatique des mises à jour ─────
  // Règle absolue : Chaque déploiement doit être appliqué automatiquement à tous les utilisateurs
  // sans nécessiter de désinstaller l'ancienne version ni de vider le cache manuellement.
  const PWA_VERSION_KEY = 'pwa-version'

  const purgeCacheAndReload = async (newVer?: string) => {
    const lastReloadStr = sessionStorage.getItem('pwa-reloaded-at')
    const now = Date.now()
    if (lastReloadStr && now - parseInt(lastReloadStr, 10) < 15 * 1000) {
      return
    }
    sessionStorage.setItem('pwa-reloaded-at', String(now))
    if (newVer) {
      localStorage.setItem(PWA_VERSION_KEY, newVer)
    }

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
  }

  // Contrôle au démarrage
  try {
    const storedVersion = localStorage.getItem(PWA_VERSION_KEY)
    const currentVersion = __APP_VERSION__

    if (storedVersion && storedVersion !== currentVersion) {
      purgeCacheAndReload(currentVersion)
    } else {
      localStorage.setItem(PWA_VERSION_KEY, currentVersion)
    }
  } catch (_) {}

  // Vérificateur en arrière-plan de nouvelle version déployée (polling intelligent)
  const checkForNewVersion = async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })
      if (!res.ok) return
      const data = await res.json()
      const serverVersion = String(data?.version || '').trim()
      const localVersion = String(localStorage.getItem(PWA_VERSION_KEY) || __APP_VERSION__).trim()

      if (serverVersion && localVersion && serverVersion !== localVersion) {
        console.log(`[GESTIO 229] Nouvelle mise à jour détectée (${serverVersion} vs ${localVersion}). Actualisation transparente...`)
        purgeCacheAndReload(serverVersion)
      }
    } catch (_) {}
  }

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
    console.warn('[GESTIO 229] Auto-récupération déclenchée :', reason)
    purgeCacheAndReload()
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason ?? '')
    if (isAutoReloadableError(msg)) {
      event.preventDefault()
      handleSafeAutoReload(`unhandledrejection: ${msg}`)
    }
  })

  // Récupération automatique immédiate en cas d'invalidation de chunk par déploiement Vercel
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    handleSafeAutoReload('vite:preloadError chunk missing')
  })

  window.addEventListener('error', (event) => {
    const msg = (event?.error?.message || event?.message || '')
    if (msg.includes('Cannot access') && msg.includes('before initialization')) {
      handleSafeAutoReload(`error TDZ: ${msg}`)
    }
  })

  // ── 4. Service Worker PWA : Déclenchement automatique de mise à jour ───────
  if ('serviceWorker' in navigator) {
    let refreshing = false

    // Dès qu'un nouveau Service Worker prend le contrôle (via skipWaiting), rafraîchir immédiatement !
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      console.log('[GESTIO 229] Nouveau Service Worker actif : actualisation automatique.')
      window.location.reload()
    })

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Si un worker est déjà en attente
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' })
            window.dispatchEvent(new CustomEvent('gestio-pwa-update-available'))
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' })
                    window.dispatchEvent(new CustomEvent('gestio-pwa-update-available'))
                  }
                }
              })
            }
          })

          // Vérification immédiate au démarrage
          reg.update().catch(() => {})

          // Vérification automatique périodique toutes les 45 secondes
          setInterval(() => {
            reg.update().catch(() => {})
            checkForNewVersion()
          }, 45000)

          // Vérification immédiate dès que l'utilisateur revient sur l'application / déverrouille l'écran
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              reg.update().catch(() => {})
              checkForNewVersion()
            }
          })

          window.addEventListener('focus', () => {
            reg.update().catch(() => {})
            checkForNewVersion()
          })
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
