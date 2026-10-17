// =============================================================================
// GESTIO 229 SaaS — safeLazy : Wrapper React.lazy anti-chunk-error
// =============================================================================
// Problème : après un déploiement Vercel, les anciens chunks JS ont des hashes
// différents. React.lazy tente de charger l'URL de l'ancien chunk → 404 →
// "Failed to fetch dynamically imported module". L'utilisateur voit l'écran
// d'erreur rouge et doit recharger manuellement.
//
// Solution : si une erreur de chunk est détectée pendant le lazy-load,
// déclencher un window.location.reload() une seule fois (garde anti-boucle
// via sessionStorage pour éviter les rechargements infinis).
// =============================================================================

import { lazy } from 'react'

// Clé sessionStorage pour la garde anti-boucle
const RELOAD_KEY = 'gestio229_chunk_reload_done'

/**
 * Détecte si une erreur est liée à un import dynamique échoué
 * (chunk introuvable après déploiement).
 */
function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? (err.message + (err.stack || '')) : String(err)
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

/**
 * Wrapper autour de React.lazy qui :
 * 1. Catch les erreurs de chunk échoué (après nouveau déploiement)
 * 2. Effectue un reload UNE SEULE FOIS avec 3s de délai (garde anti-boucle stricte)
 * 3. En cas d'échec persistant, laisse l'ErrorBoundary prendre la main sans boucler
 *
 * Usage : remplace React.lazy(() => import('./MonPage')) par
 *         safeLazy(() => import('./MonPage'))
 */
export function safeLazy<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy((): Promise<{ default: T }> => {
    return importFn().catch((err: unknown) => {
      if (isChunkError(err)) {
        const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1'
        if (!alreadyReloaded) {
          console.warn('[safeLazy] Chunk manquant post-déploiement — purge du cache et rechargement dans 2 secondes…', err)
          sessionStorage.setItem(RELOAD_KEY, '1')
          setTimeout(async () => {
            if (typeof window !== 'undefined') {
              if ('serviceWorker' in navigator) {
                try {
                  const regs = await navigator.serviceWorker.getRegistrations()
                  await Promise.all(regs.map((r) => r.unregister()))
                } catch (_) {}
              }
              if ('caches' in window) {
                try {
                  const keys = await window.caches.keys()
                  await Promise.all(keys.map((k) => window.caches.delete(k)))
                } catch (_) {}
              }
              try {
                localStorage.removeItem('gestio229_app_version')
              } catch (_) {}
              window.location.href = window.location.origin + window.location.pathname + '?ts=' + Date.now()
            }
          }, 2000)
          return new Promise(() => {}) as Promise<{ default: T }>
        } else {
          // Déjà rechargé une fois : NE PAS RECHARGER EN BOUCLE, laisser l'ErrorBoundary gérer
          console.error('[safeLazy] Échec persistant après rechargement initial. Pas de boucle :', err)
        }
      }
      throw err
    })
  })
}

export default safeLazy
