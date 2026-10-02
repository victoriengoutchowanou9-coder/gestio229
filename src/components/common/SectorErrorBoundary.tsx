// =============================================================================
// GESTIO 229 SaaS — SectorErrorBoundary (Protection Anti-Page Blanche)
// =============================================================================
// Isole les erreurs au sein d'un sous-logiciel sans jamais planter l'ERP global.
// =============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RotateCcw, Home, ArrowLeft } from 'lucide-react'

interface Props {
  children: ReactNode
  sectorSlug?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class SectorErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SectorErrorBoundary] Erreur interceptée dans le sous-logiciel :', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.reload()
  }

  private handleGoHub = () => {
    window.location.href = '/hub'
  }

  public render() {
    if (this.state.hasError) {
      const sectorName = this.props.sectorSlug
        ? this.props.sectorSlug.charAt(0).toUpperCase() + this.props.sectorSlug.slice(1)
        : 'Sous-Logiciel'

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
