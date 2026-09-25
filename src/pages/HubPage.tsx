// =============================================================================
// GESTIO 229 SaaS — Hub Multi-Services Consolidé
// =============================================================================

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { MultiservicesHub } from '../views/hub/MultiservicesHub'
import { useAuthStore } from '../store/authStore'

const HubPage: React.FC = () => {
  const navigate = useNavigate()
  const { company } = useAuthStore()

  const handleSelectSector = (sectorSlug: string) => {
    navigate('/dashboard/vente-pos')
  }

  const handleOpenOnboarding = (sectorSlug: string) => {
    navigate('/dashboard/configuration')
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <MultiservicesHub
          companyName={company?.name}
          companyIfu={company?.ifu_number}
          onSelectSector={handleSelectSector}
          onOpenOnboarding={handleOpenOnboarding}
        />
      </div>
    </div>
  )
}

export default HubPage
