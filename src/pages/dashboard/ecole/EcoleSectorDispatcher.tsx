// =============================================================================
// GESTIO 229 SaaS — Dispatcher Intelligent pour le Secteur École & Formation
// Affiche soit le Sélecteur de Profil, soit le Dashboard approprié
// =============================================================================

import React from 'react'
import { useEcoleConfig } from '../../../hooks/useEcoleConfig'
import EcoleVersionSelector from './EcoleVersionSelector'
import EcoleDashboardPage from './EcoleDashboardPage'

export const EcoleSectorDispatcher: React.FC = () => {
  const { hasChosenProfile, loading, reload } = useEcoleConfig()

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-10 h-10 border-3 border-lime-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Chargement de l'environnement École & Centre de Formation...
        </p>
      </div>
    )
  }

  // Si l'utilisateur n'a pas encore choisi son profil
  if (!hasChosenProfile) {
    return <EcoleVersionSelector onSelected={() => reload()} />
  }

  // Dashboard complet avec adaptation dynamique selon le profil (Scolaire, Formation Pro, Mixte)
  return <EcoleDashboardPage />
}

export default EcoleSectorDispatcher
