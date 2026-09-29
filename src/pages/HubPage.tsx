// =============================================================================
// GESTIO 229 SaaS — Hub Multi-Services Consolidé
// Fix : auto-sync depuis Supabase + routage correct par secteur
// =============================================================================

import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MultiservicesHub } from '../views/hub/MultiservicesHub'
import { useAuthStore } from '../store/authStore'
import { ALL_SECTORS_CATALOG } from '../core/modules/moduleRegistry'

// Clé localStorage partagée avec MultiservicesHub
const STORAGE_KEY = 'gestio229_hub_sectors_v3'

// Mapping secteur → route dashboard principale
const SECTOR_ROUTE_MAP: Record<string, string> = {
  'boutique':          '/dashboard/vente-pos',
  'epicerie':          '/dashboard/vente-pos',
  'poissonnerie':      '/dashboard/vente-pos',
  'boucherie':         '/dashboard/vente-pos',
  'restaurant':        '/dashboard/vente-pos',
  'boulangerie':       '/dashboard/vente-pos',
  'patisserie':        '/dashboard/vente-pos',
  'pharmacie':         '/dashboard/vente-pos',
  'cosmetique':        '/dashboard/vente-pos',
  'textile':           '/dashboard/vente-pos',
  'electronique':      '/dashboard/vente-pos',
  'quincaillerie':     '/dashboard/stocks',
  'materiau-btp':      '/dashboard/stocks',
  'agriculture':       '/dashboard/stocks',
  'carburant':         '/dashboard/caisse',
  'transport':         '/dashboard/caisse',
  'immobilier':        '/dashboard/caisse',
  'sante':             '/dashboard/vente-pos',
  'education':         '/dashboard/vente-pos',
  'informatique':      '/dashboard/vente-pos',
}

const HubPage: React.FC = () => {
  const navigate = useNavigate()
  const { company, tenantCtx, logout, setActiveSector } = useAuthStore()

  // ─── Routage : vers le dashboard du secteur sélectionné ──────────────────
  const handleSelectSector = (
    sectorSlug: string,
    activityId: string,
    activityName?: string,
    location?: string
  ) => {
    // Mémoriser le secteur actif pour le sidebar et les dashboards (Zustand + localStorage)
    setActiveSector(sectorSlug, activityId, activityName, location)

    // Naviguer directement vers le tableau de bord du secteur
    navigate('/dashboard')
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

  return (
    <MultiservicesHub
      companyName={company?.name}
      companyIfu={(company as any)?.ifu_number}
      onSelectSector={handleSelectSector}
      onOpenOnboarding={handleOpenOnboarding}
      onLogout={handleLogout}
      onOpenSubscription={handleOpenSubscription}
    />
  )
}

export default HubPage
