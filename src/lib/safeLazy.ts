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
        const lastReloadStr = sessionStorage.getItem('pwa-reloaded-at')
        const now = Date.now()
        const alreadyReloadedRecently = lastReloadStr && (now - parseInt(lastReloadStr, 10) < 20 * 1000)

        if (!alreadyReloadedRecently) {
          console.warn('[safeLazy] Chunk manquant post-déploiement — purge du cache et rechargement unique…', err)
          sessionStorage.setItem('pwa-reloaded-at', String(now))
          sessionStorage.setItem(RELOAD_KEY, '1')
          setTimeout(async () => {
            if (typeof window !== 'undefined') {
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
          }, 1500)
          return new Promise(() => {}) as Promise<{ default: T }>
        } else {
          console.warn('[safeLazy] Déjà rechargé dans les 5 dernières minutes. Pas de boucle :', err)
        }
      }
      throw err
    })
  })
}

export default safeLazy
