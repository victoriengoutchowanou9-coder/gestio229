// =============================================================================
// GESTIO 229 SaaS — Dispatcher Intelligent pour les Ordres de Réparation
// Affiche BtpOrdresReparationPage si BTP_MULTISITE, sinon GarageReparationsPage
// =============================================================================

import React from 'react'
import { useGarageConfig } from '../../../hooks/useGarageConfig'
import GarageReparationsPage from './GarageReparationsPage'
import BtpOrdresReparationPage from './btp/BtpOrdresReparationPage'

export const GarageReparationsDispatcher: React.FC = () => {
  const { isBtp } = useGarageConfig()

  if (isBtp) {
    return <BtpOrdresReparationPage />
  }

  return <GarageReparationsPage />
}

export default GarageReparationsDispatcher
