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
  const { company, tenantCtx } = useAuthStore()

  // ─── Auto-sync : reconstruire les activités depuis Supabase si localStorage vide ───
  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) {
      // Vérifier que les données sont valides (non vides)
      try {
        const parsed = JSON.parse(existing)
        if (Array.isArray(parsed) && parsed.length > 0) return
      } catch {
        // Données corrompues → reconstruire
      }
    }

    // Collecter les slugs de secteurs depuis Supabase
    const sectorsToLoad: string[] = []

    // Priorité 1 : secteurs résolus depuis tenantCtx (chargés depuis company_sectors)
    if (tenantCtx?.sectors && tenantCtx.sectors.length > 0) {
      tenantCtx.sectors.forEach((r) => sectorsToLoad.push(r.sector.slug))
    }
    // Priorité 2 : champs selected_sectors / sectors dans l'objet company
    else if (Array.isArray((company as any)?.selected_sectors) && (company as any).selected_sectors.length > 0) {
      sectorsToLoad.push(...(company as any).selected_sectors)
    } else if (Array.isArray((company as any)?.sectors) && (company as any).sectors.length > 0) {
      sectorsToLoad.push(...(company as any).sectors)
    } else if ((company as any)?.active_sector) {
      sectorsToLoad.push((company as any).active_sector)
    }

    if (sectorsToLoad.length === 0) return

    // Construire les entrées ActivityEntry depuis le catalogue local
    const hubActivities = sectorsToLoad.map((slug, index) => {
      const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === slug)
      const resolvedSector = tenantCtx?.sectors.find((r) => r.sector.slug === slug)
      const sectorName = meta?.label || resolvedSector?.sector.name || slug

      return {
        id: `act-${slug}-${Date.now()}-${index}`,
        sectorSlug: slug,
        sectorLabel: sectorName,
        sectorIcon: meta?.icon ?? '🏢',
        sectorColor: meta?.color ?? '#059669',
        name: (company?.name ?? 'Mon établissement').toUpperCase(),
        location: (company as any)?.city ?? 'Bénin',
        manager: '',
        status: 'ACTIVE' as const,
        isConfigured: true,
        revenue: 0,
        expenses: 0,
        netMargin: 0,
        monthRevenue: 0,
        monthExpenses: 0,
        monthNetMargin: 0,
      }
    })

    localStorage.setItem(STORAGE_KEY, JSON.stringify(hubActivities))
    // Forcer un re-render du Hub en changeant légèrement la clé
    window.dispatchEvent(new Event('storage'))
  }, [tenantCtx, company])

  // ─── Routage : vers le dashboard du secteur sélectionné ──────────────────
  const handleSelectSector = (
    sectorSlug: string,
    activityId: string,
    activityName?: string,
    location?: string
  ) => {
    // Mémoriser le secteur actif pour le sidebar et les dashboards
    localStorage.setItem('gestio229_active_sector', sectorSlug)
    localStorage.setItem('gestio229_active_activity_id', activityId)
    if (activityName) localStorage.setItem('gestio229_active_activity_name', activityName)
    if (location)     localStorage.setItem('gestio229_active_activity_location', location)

    // Naviguer vers la route principale du secteur
    const targetRoute = SECTOR_ROUTE_MAP[sectorSlug] ?? '/dashboard/vente-pos'
    navigate(targetRoute)
  }

  const handleOpenOnboarding = (_sectorSlug: string) => {
    navigate('/dashboard/configuration')
  }

  return (
    <MultiservicesHub
      companyName={company?.name}
      companyIfu={(company as any)?.ifu_number}
      onSelectSector={handleSelectSector}
      onOpenOnboarding={handleOpenOnboarding}
    />
  )
}

export default HubPage
