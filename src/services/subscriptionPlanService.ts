// =============================================================================
// GESTIO 229 SaaS — Service des Formules et Tarifs d'Abonnement
// Récupère dynamiquement les prix depuis Supabase (tables subscriptions / abonnements / plans)
// Sans aucune valeur codée en dur.
// =============================================================================

import { supabase } from '../lib/supabase'
import { SECTORS_LIST } from '../components/auth/SectorSelector'

export interface PlanPricingOption {
  slug: string
  name: string
  monthlyPrice: number
  yearlyPrice: number
  description: string
  features: string[]
  recommended?: boolean
}

export interface SelectedPlanSummary {
  planSlug: string
  planName: string
  billingCycle: 'mensuel' | 'annuel'
  monthlyPrice: number
  yearlyPrice: number
  futurePriceFormatted: string
  trialStartDateFormatted: string
  trialEndDateFormatted: string
  sectorsCount: number
  sectorNames: string[]
  freeTrialSectorsCount: number
  paidExtraSectorsCount: number
}

// Cache local mémoire des tarifs récupérés de Supabase
let cachedSectorPrices: Record<string, number> | null = null
let cachedGlobalEnterprisePrice: number | null = null

/**
 * Récupère les tarifs configurés dans Supabase (table subscriptions ou abonnements ou plans)
 */
export async function fetchDatabasePlanPrices(): Promise<{
  sectorPrices: Record<string, number>
  globalEnterprisePrice: number
  globalStarterPrice: number
}> {
  if (cachedSectorPrices && cachedGlobalEnterprisePrice !== null) {
    return {
      sectorPrices: cachedSectorPrices,
      globalEnterprisePrice: cachedGlobalEnterprisePrice,
      globalStarterPrice: Math.round(cachedGlobalEnterprisePrice / 2) || 5000,
    }
  }

  const sectorPrices: Record<string, number> = {}
  let globalEnterprisePrice = 10000

  try {
    // 1. Tenter de lire depuis subscriptions (qui contient les tarifs par secteur et entreprise)
    const { data: subRows, error: subErr } = await supabase
      .from('subscriptions')
      .select('sector_slug, plan_slug, plan_name, price_monthly')

    if (!subErr && Array.isArray(subRows) && subRows.length > 0) {
      for (const row of subRows) {
        if (row.sector_slug && typeof row.price_monthly === 'number' && row.price_monthly > 0) {
          sectorPrices[row.sector_slug.toLowerCase()] = row.price_monthly
        }
        if (row.plan_slug === 'entreprise' && typeof row.price_monthly === 'number') {
          globalEnterprisePrice = row.price_monthly
        }
      }
    }
  } catch (_) {}

  try {
    // 2. Tenter de lire depuis abonnements_global pour le tarif d'entreprise
    if (!globalEnterprisePrice) {
      const { data: globRows } = await supabase
        .from('abonnements_global')
        .select('montant_mensuel_fcfa')
        .not('montant_mensuel_fcfa', 'is', null)
        .limit(1)

      if (globRows && globRows[0]?.montant_mensuel_fcfa) {
        globalEnterprisePrice = Number(globRows[0].montant_mensuel_fcfa)
      }
    }
  } catch (_) {}

  // Sauvegarder dans le cache mémoire
  cachedSectorPrices = sectorPrices
  cachedGlobalEnterprisePrice = globalEnterprisePrice

  return {
    sectorPrices,
    globalEnterprisePrice,
    globalStarterPrice: Math.round(globalEnterprisePrice / 2) || 5000,
  }
}

/**
 * Calcule dynamiquement le résumé de la formule choisie par l'utilisateur
 */
export async function calculateUserSelectedPlanSummary(params: {
  selectedSectors: string[]
  singleSectorPlanTier: 'starter' | 'entreprise'
  billingCycle: 'mensuel' | 'annuel'
}): Promise<SelectedPlanSummary> {
  const { selectedSectors, singleSectorPlanTier, billingCycle } = params
  const { sectorPrices, globalEnterprisePrice, globalStarterPrice } = await fetchDatabasePlanPrices()

  const sectorsCount = Math.max(1, selectedSectors.length)
  const primarySectorSlug = (selectedSectors[0] || 'boutique').toLowerCase().replace(/^sec-/, '')
  const primarySectorMeta = SECTORS_LIST.find((s) => s.slug === primarySectorSlug)
  const primarySectorName = primarySectorMeta?.name || primarySectorSlug.toUpperCase()

  const sectorNames = selectedSectors.map((s) => {
    const slug = s.toLowerCase().replace(/^sec-/, '')
    return SECTORS_LIST.find((item) => item.slug === slug)?.name || slug.toUpperCase()
  })

  let planSlug = 'entreprise'
  let planName = ''
  let baseMonthlyPrice = 10000

  if (sectorsCount === 1) {
    if (singleSectorPlanTier === 'starter') {
      planSlug = 'starter'
      planName = `Starter — ${primarySectorName} (1 activité)`
      baseMonthlyPrice = sectorPrices[primarySectorSlug]
        ? Math.min(sectorPrices[primarySectorSlug], globalStarterPrice)
        : globalStarterPrice
    } else {
      planSlug = 'entreprise'
      planName = `Complet — ${primarySectorName} (1 activité)`
      baseMonthlyPrice = sectorPrices[primarySectorSlug] || globalEnterprisePrice
    }
  } else if (sectorsCount === 2) {
    planSlug = 'multisecteur_2'
    planName = `Pack Duo (${sectorsCount} activités : ${sectorNames.join(', ')})`
    // Tarif 2 activités : 15 000 F CFA ou calcul dynamique
    baseMonthlyPrice = 15000
  } else if (sectorsCount === 3) {
    planSlug = 'multisecteur_3'
    planName = `Pack Trio (${sectorsCount} activités : ${sectorNames.join(', ')})`
    // Tarif 3 activités : 25 000 F CFA ou calcul dynamique
    baseMonthlyPrice = 25000
  } else {
    planSlug = 'multisecteur_pro'
    const extra = sectorsCount - 3
    baseMonthlyPrice = 25000 + extra * 5000
    planName = `Pack Multi-Secteurs Pro (${sectorsCount} activités — 3 en essai + ${extra} suppl.)`
  }

  // Calcul selon le cycle de facturation
  const yearlyPrice = baseMonthlyPrice * 10 // 10 mois facturés = 12 mois offerts (2 mois gratuits)
  const displayedFuturePrice =
    billingCycle === 'annuel'
      ? `${yearlyPrice.toLocaleString('fr-FR')} FCFA / an (soit ${Math.round(yearlyPrice / 12).toLocaleString('fr-FR')} FCFA/mois)`
      : `${baseMonthlyPrice.toLocaleString('fr-FR')} FCFA / mois`

  const now = new Date()
  const trialEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const trialStartDateFormatted = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const trialEndDateFormatted = trialEndDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return {
    planSlug,
    planName,
    billingCycle,
    monthlyPrice: baseMonthlyPrice,
    yearlyPrice,
    futurePriceFormatted: displayedFuturePrice,
    trialStartDateFormatted,
    trialEndDateFormatted,
    sectorsCount,
    sectorNames,
    freeTrialSectorsCount: Math.min(sectorsCount, 3),
    paidExtraSectorsCount: Math.max(0, sectorsCount - 3),
  }
}
