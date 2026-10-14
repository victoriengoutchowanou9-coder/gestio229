// =============================================================================
// GESTIO 229 SaaS — Dispatcher Intelligent pour les Assurances & Sinistres
// Affiche BtpAssurancesPage si BTP_MULTISITE, sinon GarageAssurancesPage
// =============================================================================

import React from 'react'
import { useGarageConfig } from '../../../hooks/useGarageConfig'
import GarageAssurancesPage from './GarageAssurancesPage'
import BtpAssurancesPage from './btp/BtpAssurancesPage'

export const GarageAssurancesDispatcher: React.FC = () => {
  const { isBtp } = useGarageConfig()

  if (isBtp) {
    return <BtpAssurancesPage />
  }

  return <GarageAssurancesPage />
}

export default GarageAssurancesDispatcher
