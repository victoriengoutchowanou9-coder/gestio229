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
const RELOAD_KEY = 'gestio229_chunk_reload'

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
 * 2. Effectue un hard reload UNE seule fois (anti-boucle via sessionStorage)
 * 3. Si déjà reloadé et toujours en erreur, laisse l'ErrorBoundary prendre la main
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
          console.warn('[safeLazy] Chunk introuvable (nouveau déploiement détecté) — rechargement automatique…', err)
          sessionStorage.setItem(RELOAD_KEY, '1')
          // Hard reload avec cache-bust pour forcer le téléchargement du nouveau bundle
          window.location.href = window.location.pathname + '?t=' + Date.now()
          // Retourner une promesse qui ne se résout jamais (le reload va couper l'exécution)
          return new Promise(() => {}) as Promise<{ default: T }>
        } else {
          // Déjà reloadé — on nettoie le flag et on laisse l'erreur remonter
          // vers l'ErrorBoundary pour affichage gracieux
          sessionStorage.removeItem(RELOAD_KEY)
          console.error('[safeLazy] Échec persistant après rechargement :', err)
        }
      }
      throw err
    })
  })
}

export default safeLazy
