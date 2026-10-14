// =============================================================================
// GESTIO 229 SaaS — Dispatcher Intelligent pour le Secteur Garage
// Affiche soit le Sélecteur de Version, soit le Dashboard Classique, soit le Dashboard BTP
// =============================================================================

import React from 'react'
import { useGarageConfig } from '../../../hooks/useGarageConfig'
import GarageVersionSelector from './GarageVersionSelector'
import GarageDashboardPage from './GarageDashboardPage'
import BtpDashboardPage from './btp/BtpDashboardPage'

export const GarageSectorDispatcher: React.FC = () => {
  const { versionMode, hasChosenVersion, loading, isClassic, isBtp, reload } = useGarageConfig()

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Chargement de l'environnement Atelier, Garage & Mécanique...
        </p>
      </div>
    )
  }

  // Si l'utilisateur n'a pas encore fait de choix
  if (!hasChosenVersion) {
    return <GarageVersionSelector onSelected={async () => { await reload() }} />
  }

  // Version 2 : Parc BTP & Multisite
  if (isBtp) {
    return <BtpDashboardPage />
  }

  // Version 1 : Garage & Mécanique classique (défaut)
  return <GarageDashboardPage />
}

export default GarageSectorDispatcher
