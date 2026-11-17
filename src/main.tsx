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

  // ── 2. Gestion de version & Détection rigoureuse des nouvelles versions ─────
  // Règles absolues GESTIO 229 :
  // - Ne JAMAIS recharger ou actualiser automatiquement sans clic utilisateur
  // - Ne JAMAIS rediriger automatiquement vers la page d'accueil
  // - Déclencher la notification UNIQUEMENT lors d'une véritable nouvelle version
  // - Mémoriser les versions fermées (X) pour éviter les notifications en boucle
  const PWA_VERSION_KEY = 'pwa-version'
  const PWA_DISMISSED_KEY = 'gestio-pwa-dismissed-version'
  const PWA_NOTIFIED_KEY = 'gestio-pwa-notified-version'

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

  // Contrôle au démarrage (mise à jour du marqueur version sans rechargement)
  try {
    const currentVersion = __APP_VERSION__
    localStorage.setItem(PWA_VERSION_KEY, currentVersion)
  } catch (_) {}

  // Vérificateur en arrière-plan d'une nouvelle version réellement déployée
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

      // Si le serveur a une version différente de la version locale
      if (serverVersion && localVersion && serverVersion !== localVersion) {
        // 1. Ne pas redemander si l'utilisateur a fermé cette version (X)
        const dismissed = sessionStorage.getItem(PWA_DISMISSED_KEY)
        if (dismissed === serverVersion) {
          return
        }

        // 2. Ne pas notifier plusieurs fois pour la même version en cours de session
        const alreadyNotified = sessionStorage.getItem(PWA_NOTIFIED_KEY)
        if (alreadyNotified === serverVersion) {
          return
        }

        sessionStorage.setItem(PWA_NOTIFIED_KEY, serverVersion)
        console.log(`[GESTIO 229] Véritable nouvelle version disponible (${serverVersion} vs ${localVersion}). Notification utilisateur...`)
        window.dispatchEvent(new CustomEvent('gestio-pwa-update-available', {
          detail: { serverVersion, localVersion }
        }))
      }
    } catch (_) {}
  }

  // ── 2b. Vérification périodique raisonnable (délai initial 10s, intervalle 2 min, ou focus onglet)
  setTimeout(checkForNewVersion, 10000)
  setInterval(checkForNewVersion, 2 * 60 * 1000)

  // Vérifier également quand l'utilisateur revient sur l'onglet
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForNewVersion()
    }
  })

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

  // ── 4. Service Worker PWA : Gestion propre et sans interruption intempestive ────
  if ('serviceWorker' in navigator) {
    let hadInitialController = Boolean(navigator.serviceWorker.controller)

    // Lorsque le contrôleur change (remplacement d'un SW existant par un nouveau)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadInitialController) {
        // Prise de contrôle initiale du premier Service Worker installé. Ce n'est PAS une mise à jour.
        hadInitialController = true
        return
      }
      console.log('[GESTIO 229] Contrôleur Service Worker actualisé.')
      checkForNewVersion()
    })

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Si un worker est déjà en attente (waiting) pour une page déjà contrôlée
          if (reg.waiting && navigator.serviceWorker.controller) {
            checkForNewVersion()
          }

          // Détection d'un nouveau worker en cours d'installation
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Nouveau worker installé avec succès : vérifier la version
                  checkForNewVersion()
                }
              })
            }
          })

          // Contrôle unique en tâche de fond
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
