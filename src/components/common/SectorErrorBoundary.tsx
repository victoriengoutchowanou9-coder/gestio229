// =============================================================================
// GESTIO 229 SaaS — SectorErrorBoundary (Protection Anti-Page Blanche)
// =============================================================================
// Isole les erreurs au sein d'un sous-logiciel sans jamais planter l'ERP global.
// Gère en particulier les erreurs de chunks JS après un nouveau déploiement.
// =============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RotateCcw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  sectorSlug?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  isChunkError: boolean
}

/** Détecte si une erreur est causée par un chunk JS introuvable (post-déploiement) */
function detectChunkError(err: Error | null): boolean {
  if (!err) return false
  const msg = (err.message || '') + (err.name || '') + (err.stack || '')
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

export class SectorErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isChunkError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      isChunkError: detectChunkError(error),
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SectorErrorBoundary] Erreur interceptée dans le sous-logiciel :', error, errorInfo)
    this.setState({ errorInfo })

    // ── Auto-reload si chunk error (post-déploiement) ─────────────────────
    // On recharge automatiquement UNE seule fois (garde anti-boucle).
    if (detectChunkError(error)) {
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        console.warn('[SectorErrorBoundary] Chunk introuvable — rechargement automatique dans 800ms…')
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        // Petit délai pour ne pas recharger avant que React ait fini le rendu
        setTimeout(() => {
          window.location.href = window.location.pathname + '?t=' + Date.now()
        }, 800)
      }
    }
  }

  /** Hard reload avec cache-bust — bypass navigateur et SW */
  private handleReload = () => {
    sessionStorage.removeItem('gestio229_chunk_reload')
    window.location.href = window.location.pathname + '?t=' + Date.now()
  }

  private handleGoHub = () => {
    window.location.href = '/hub'
  }

  public render() {
    if (this.state.hasError) {
      const sectorName = this.props.sectorSlug
        ? this.props.sectorSlug.charAt(0).toUpperCase() + this.props.sectorSlug.slice(1)
        : 'Sous-Logiciel'

      // Si c'est une chunk error, on affiche un message d'attente pendant le reload auto
      if (this.state.isChunkError) {
        return (
          <div className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-amber-200 dark:border-amber-900/60 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <RotateCcw className="w-8 h-8 animate-spin" />
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">
                Nouveau déploiement détecté
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Mise à jour en cours... Rechargement automatique de l'application.
              </p>
            </div>
          </div>
        )
      }

      return (
        <div className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-red-200 dark:border-red-900/60 p-8 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 mb-3">
              Protection Active Multi-Secteurs
            </span>

            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">
              Incident dans le sous-logiciel {sectorName}
            </h2>

            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 leading-relaxed">
              Une anomalie inattendue s'est produite lors de l'affichage de ce secteur. Les autres sous-logiciels et vos données restent parfaitement sécurisés et intègres.
            </p>

            {this.state.error?.message && (
              <div className="p-3 mb-6 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-700 text-left font-mono text-xs text-red-600 dark:text-red-400 overflow-x-auto max-h-28">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Réessayer
              </button>

              <button
                onClick={this.handleGoHub}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm transition"
              >
                <Home className="w-4 h-4" />
                Retourner au HUB
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default SectorErrorBoundary

