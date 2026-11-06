// =============================================================================
// GESTIO 229 SaaS — Hub Multi-Services Consolidé
// Architecture Tenant Strict & Synchronisation Supabase Temps Réel
// =============================================================================

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { MultiservicesHub } from '../views/hub/MultiservicesHub'
import { useAuthStore } from '../store/authStore'
import { setActiveSector, canonicalSectorSlug, canonicalSectorsSlug } from '../lib/sectorClient'

const HubPage: React.FC = () => {
  const navigate = useNavigate()
  const { company, tenantCtx, logout, user } = useAuthStore()


  // ─── Routage : vers le dashboard du secteur sélectionné ────────────────────
  const handleSelectSector = (
    sectorSlug: string,
    activityId: string,
    activityName?: string,
    location?: string
  ) => {
    // Mémoriser le sous-logiciel actif pour isolation stricte
    const cleanSlug = canonicalSectorSlug(sectorSlug) || sectorSlug
    setActiveSector(cleanSlug, activityId, activityName)
    localStorage.setItem('gestio229_active_sector', cleanSlug)
    localStorage.setItem('gestio229_active_activity_id', activityId)
    localStorage.setItem('secteur_actif_id', activityId)
    if (activityName) {
      localStorage.setItem('gestio229_active_activity_name', activityName)
      localStorage.setItem('secteur_actif_nom', activityName)
    }
    localStorage.setItem('secteur_actif_slug', cleanSlug)
    if (location) localStorage.setItem('gestio229_active_activity_location', location)

    // Naviguer vers l'espace d'exploitation autonome du sous-logiciel
    navigate(`/app/${cleanSlug}/tableau-bord`)
  }

  const handleOpenOnboarding = (_sectorSlug: string) => {
    navigate('/dashboard/configuration')
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleOpenSubscription = () => {
    navigate('/dashboard/abonnement')
  }

  const assignedActivityId = (user?.permissions as any)?.sector_id || user?.sector_id

  return (
    <MultiservicesHub
      companyId={company?.id}
      companyName={company?.name}
      companyIfu={(company as any)?.ifu_number}
      companyRegime={(company as any)?.regime_fiscal || 'Réel Normal'}
      company={company}
      userRole={user?.role}
      userAssignedActivityId={assignedActivityId}
      onSelectSector={handleSelectSector}
      onOpenOnboarding={handleOpenOnboarding}
      onLogout={handleLogout}
      onOpenSubscription={handleOpenSubscription}
    />
  )
}

export default HubPage
