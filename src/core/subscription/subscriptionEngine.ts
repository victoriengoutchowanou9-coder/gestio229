// =============================================================================
// GESTIO 229 SaaS — MOTEUR D'ABONNEMENT CENTRALISÉ (Subscription Engine V4)
// =============================================================================
// Règles métier officielles :
// - Essai gratuit unique de 30 jours rattaché au compte (couvre au maximum 3 secteurs)
// - Aucune activation gratuite individuelle de 30 jours par secteur après l'inscription
// - 1 Activité : Starter (5 000 F/mois) ou Entreprise (10 000 F/mois)
// - 2 Activités : 15 000 FCFA / mois
// - 3 Activités : 25 000 FCFA / mois
// - > 3 Activités : 25 000 + ((N - 3) * 5 000) FCFA / mois
// - Secteur supplémentaire au-delà des 3 secteurs d'essai : 5 000 FCFA / mois / secteur
// =============================================================================

import type { Company } from '../../types/tenant'

export type SubscriptionPlanSlug = 'starter' | 'entreprise' | 'multisecteur_2' | 'multisecteur_3' | 'multisecteur_pro'
export type BillingDurationMonths = number // 1, 2, 3, 4, 6, 12 ou toute durée supérieure (>= 1)

export const MAX_FREE_TRIAL_SECTORS = 3
export const EXTRA_SECTOR_MONTHLY_PRICE = 5000
export const SINGLE_SECTOR_ENTERPRISE_PRICE = 10000
export const SINGLE_SECTOR_STARTER_PRICE = 5000

export interface SubscriptionCalculation {
  sectorsCount: number
  planSlug: SubscriptionPlanSlug
  planName: string
  priceMonthly: number
  breakdown: string
  maxUsers: number // -1 = illimité
  maxProduits: number // -1 = illimité
  maxVentesMois: number // -1 = illimité
  lockedModules: string[]
  requiresAdminApproval?: boolean
  contactMessage?: string
}

export interface DurationPriceCalculation {
  durationMonths: number
  baseMonthlyPrice: number
  grossTotal: number
  discountPercent: number
  discountAmount: number
  netTotal: number
  effectiveMonthlyPrice: number
  label: string
}

export interface RegistrationTrialSummary {
  totalSectorsSelected: number
  freeTrialSectorsCount: number
  paidExtraSectorsCount: number
  freeTrialSectorSlugs: string[]
  paidExtraSectorSlugs: string[]
  unitPricePerExtraSector: number
  durationMonths: number
  monthlyExtraAmount: number
  totalExtraAmountToPay: number
  trialDurationDays: number
}

export interface RenewalDatesCalculation {
  isExtensionBeforeExpiry: boolean
  effectiveStartDate: Date
  newExpirationDate: Date
  preservedDays: number
}

// Modules verrouillés uniquement en forfait Starter (5 000 FCFA)
export const STARTER_LOCKED_MODULES = [
  'finances',       // Trésorerie & Banques avancée
  'syscohada',      // Comptabilité SYSCOHADA
  'rapports',       // Rapports & Analyses avancés
]

// Modules autorisés en forfait Starter
export const STARTER_ALLOWED_MODULES = [
  'dashboard',
  'ventes',
  'vendeur',
  'stock',
  'caisse',
  'clients',
  'fournisseurs',
  'depenses',
  'configuration',
  'utilisateurs',
  'audit',
  'abonnement',
]

// Modules toujours accessibles même lorsque l'abonnement d'un secteur est inactif ou expiré (Section 4)
export const ALWAYS_ACCESSIBLE_SECTOR_MODULES = new Set<string>([
  'dashboard',
  'tableau-bord',
  'abonnement',
])

/**
 * Calcule le tarif mensuel officiel en fonction du nombre d'activités souscrites
 * et du choix du forfait de base (Starter vs Entreprise quand 1 seule activité).
 */
export function calculateSubscriptionPrice(
  sectorsCount: number,
  singleActivityTier: 'starter' | 'entreprise' = 'entreprise'
): SubscriptionCalculation {
  const count = Math.max(1, sectorsCount)

  if (count === 1) {
    if (singleActivityTier === 'starter') {
      return {
        sectorsCount: 1,
        planSlug: 'starter',
        planName: 'Pack Starter (1 Secteur)',
        priceMonthly: SINGLE_SECTOR_STARTER_PRICE,
        breakdown: '1 secteur d\'activité — Fonctionnalités essentielles (Ventes, Caisse, Stock de base, Clients, Dépenses)',
        maxUsers: 2,
        maxProduits: 150,
        maxVentesMois: 300,
        lockedModules: STARTER_LOCKED_MODULES,
        requiresAdminApproval: false,
      }
    }

    return {
      sectorsCount: 1,
      planSlug: 'entreprise',
      planName: 'Pack Entreprise (1 Secteur Complet)',
      priceMonthly: SINGLE_SECTOR_ENTERPRISE_PRICE,
      breakdown: '1 secteur d\'activité — Toutes les fonctionnalités débloquées (SYSCOHADA, Trésorerie, Rapports, Multi-caisses)',
      maxUsers: -1,
      maxProduits: -1,
      maxVentesMois: -1,
      lockedModules: [],
      requiresAdminApproval: false,
    }
  }

  if (count === 2) {
    return {
      sectorsCount: 2,
      planSlug: 'multisecteur_2',
      planName: 'Pack Duo (2 Secteurs)',
      priceMonthly: 15000,
      breakdown: '2 secteurs d\'activité complets — 15 000 FCFA / mois (7 500 FCFA / secteur)',
      maxUsers: -1,
      maxProduits: -1,
      maxVentesMois: -1,
      lockedModules: [],
      requiresAdminApproval: false,
    }
  }

  if (count === 3) {
    return {
      sectorsCount: 3,
      planSlug: 'multisecteur_3',
      planName: 'Pack Trio (3 Secteurs)',
      priceMonthly: 25000,
      breakdown: '3 secteurs d\'activité complets — 25 000 FCFA / mois',
      maxUsers: -1,
      maxProduits: -1,
      maxVentesMois: -1,
      lockedModules: [],
      requiresAdminApproval: false,
    }
  }

  // > 3 secteurs : 25 000 FCFA + ((N - 3) * 5 000 FCFA)
  const extraSectors = count - 3
  const extraCost = extraSectors * EXTRA_SECTOR_MONTHLY_PRICE
  const totalMonthly = 25000 + extraCost

  return {
    sectorsCount: count,
    planSlug: 'multisecteur_pro',
    planName: `Pack Multi-Secteurs (${count} Secteurs)`,
    priceMonthly: totalMonthly,
    breakdown: `3 secteurs (25 000 F) + ${extraSectors} secteur(s) supplémentaire(s) × 5 000 F = ${totalMonthly.toLocaleString('fr-FR')} FCFA / mois`,
    maxUsers: -1,
    maxProduits: -1,
    maxVentesMois: -1,
    lockedModules: [],
    requiresAdminApproval: false,
  }
}

/**
 * Calcule le récapitulatif d'inscription multi-secteurs (Section 2 du cahier des charges) :
 * - Les 3 premiers secteurs sont couverts par l'essai gratuit unique de 30 jours.
 * - Tout secteur supplémentaire (à partir du 4e) est facturé (5 000 FCFA / mois / secteur)
 *   et reste en statut 'en_attente_paiement' tant que son paiement n'est pas validé.
 */
export function calculateRegistrationTrialSummary(
  selectedSectors: string[],
  durationMonths: number = 1
): RegistrationTrialSummary {
  const cleanList = Array.from(
    new Set(
      (selectedSectors || [])
        .map((s) => String(s).replace(/^sec-/, '').toLowerCase().trim())
        .filter(Boolean)
    )
  )
  const total = cleanList.length
  const freeSlugs = cleanList.slice(0, MAX_FREE_TRIAL_SECTORS)
  const paidSlugs = cleanList.slice(MAX_FREE_TRIAL_SECTORS)
  const freeCount = freeSlugs.length
  const paidCount = paidSlugs.length
  const dur = Math.max(1, Math.floor(Number(durationMonths) || 1))
  const monthlyExtra = paidCount * EXTRA_SECTOR_MONTHLY_PRICE
  const durationCalc = calculateDurationPrice(monthlyExtra, dur)

  return {
    totalSectorsSelected: total,
    freeTrialSectorsCount: freeCount,
    paidExtraSectorsCount: paidCount,
    freeTrialSectorSlugs: freeSlugs,
    paidExtraSectorSlugs: paidSlugs,
    unitPricePerExtraSector: EXTRA_SECTOR_MONTHLY_PRICE,
    durationMonths: dur,
    monthlyExtraAmount: monthlyExtra,
    totalExtraAmountToPay: durationCalc.netTotal,
    trialDurationDays: 30,
  }
}

/**
 * Calcule le tarif selon la durée choisie (1, 2, 3, 4, 6, 12 mois ou toute durée >= 1 mois)
 */
export function calculateDurationPrice(
  baseMonthlyPrice: number,
  durationMonths: BillingDurationMonths
): DurationPriceCalculation {
  const dur = Math.max(1, Math.floor(Number(durationMonths) || 1))
  const discountMap: Record<number, { percent: number; label: string }> = {
    1: { percent: 0, label: '1 Mois (Mensuel)' },
    2: { percent: 0, label: '2 Mois' },
    3: { percent: 5, label: '3 Mois (-5%)' },
    4: { percent: 5, label: '4 Mois (-5%)' },
    6: { percent: 10, label: '6 Mois (-10%)' },
    12: { percent: 20, label: '12 Mois (-20%)' },
  }

  let percent = 0
  let label = `${dur} Mois`
  if (discountMap[dur]) {
    percent = discountMap[dur].percent
    label = discountMap[dur].label
  } else if (dur >= 12) {
    percent = 20
    label = `${dur} Mois (-20%)`
  } else if (dur >= 6) {
    percent = 10
    label = `${dur} Mois (-10%)`
  } else if (dur >= 3) {
    percent = 5
    label = `${dur} Mois (-5%)`
  }

  const grossTotal = baseMonthlyPrice * dur
  const discountAmount = Math.round((grossTotal * percent) / 100)
  const netTotal = grossTotal - discountAmount
  const effectiveMonthlyPrice = Math.round(netTotal / dur)

  return {
    durationMonths: dur,
    baseMonthlyPrice,
    grossTotal,
    discountPercent: percent,
    discountAmount,
    netTotal,
    effectiveMonthlyPrice,
    label,
  }
}

/**
 * Calcule les dates de début et de fin lors d'une activation ou d'un renouvellement (Section 10) :
 * - Cas 1 : Renouvellement AVANT expiration -> prolonge à partir de la date de fin existante (aucun jour perdu).
 * - Cas 2 : Renouvellement APRÈS expiration (ou 1ère activation payante) -> démarre à la date de validation.
 */
export function calculateRenewalDates(
  currentExpiresAt: string | Date | null | undefined,
  durationMonths: number,
  referenceNow: Date = new Date()
): RenewalDatesCalculation {
  const dur = Math.max(1, Math.floor(Number(durationMonths) || 1))
  const now = new Date(referenceNow.getTime())
  let existingEnd: Date | null = null

  if (currentExpiresAt) {
    const parsed = currentExpiresAt instanceof Date ? currentExpiresAt : new Date(currentExpiresAt)
    if (!isNaN(parsed.getTime())) {
      existingEnd = parsed
    }
  }

  const isExtensionBeforeExpiry = Boolean(existingEnd && existingEnd.getTime() > now.getTime())
  const baseDate = isExtensionBeforeExpiry && existingEnd ? new Date(existingEnd.getTime()) : new Date(now.getTime())
  const preservedDays = isExtensionBeforeExpiry && existingEnd
    ? Math.max(0, Math.ceil((existingEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  const newExpirationDate = new Date(baseDate.getTime())
  newExpirationDate.setMonth(newExpirationDate.getMonth() + dur)

  return {
    isExtensionBeforeExpiry,
    effectiveStartDate: isExtensionBeforeExpiry ? now : baseDate,
    newExpirationDate,
    preservedDays,
  }
}

/**
 * Détermine si un compte est encore dans sa période d'essai gratuit de 30 jours
 */
export function getTrialStatus(company?: Company | null): {
  isInTrial: boolean
  isTrialExpired: boolean
  daysRemaining: number
  trialEndsAt: Date | null
} {
  if (!company) {
    return { isInTrial: false, isTrialExpired: false, daysRemaining: 30, trialEndsAt: null }
  }

  const status = (company.subscription_status || 'trial').toLowerCase()
  if (status === 'active') {
    return { isInTrial: false, isTrialExpired: false, daysRemaining: 365, trialEndsAt: null }
  }

  const createdAt = company.created_at ? new Date(company.created_at) : new Date()
  const trialEndsAt = (company as any).trial_ends_at
    ? new Date((company as any).trial_ends_at)
    : new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const diffMs = trialEndsAt.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  const isTrialExpired = diffMs <= 0 || status === 'expired'

  return {
    isInTrial: status === 'trial' && !isTrialExpired,
    isTrialExpired,
    daysRemaining,
    trialEndsAt,
  }
}

/**
 * Vérifie si un module est accessible pour l'entreprise courante.
 * RÈGLES :
 * - Si l'entreprise est suspendue -> aucun module opérationnel n'est accessible.
 * - Si l'abonnement est expiré ou en attente de paiement -> seuls 'dashboard' ('tableau-bord') et 'abonnement' sont accessibles.
 * - Pendant les 30 jours d'essai gratuit (sur les 3 premiers secteurs max) -> TOUS les modules sont débloqués.
 * - Si abonnement payant actif :
 *   - Si 1 secteur et plan = 'starter' -> modules avancés verrouillés.
 *   - Si plan = 'entreprise' ou > 1 secteur -> TOUS les modules sont débloqués.
 */
export function checkModuleAccess(
  moduleId: string,
  company?: Company | null
): {
  allowed: boolean
  reason?: 'trial_active' | 'full_access' | 'starter_restriction' | 'expired' | 'suspended' | 'pending_payment'
  requiredPlanName?: string
  upgradePrice?: number
} {
  const normMod = (moduleId || '').toLowerCase().trim()

  // Le Tableau de bord et le module Abonnement restent accessibles pour permettre la consultation et le réabonnement (Section 4)
  if (ALWAYS_ACCESSIBLE_SECTOR_MODULES.has(normMod)) {
    if (company?.subscription_status === 'suspended' && normMod !== 'abonnement') {
      return { allowed: false, reason: 'suspended' }
    }
    return { allowed: true, reason: 'full_access' }
  }

  if (!company) {
    return { allowed: true, reason: 'full_access' }
  }

  const status = (company.subscription_status || 'trial').toLowerCase()

  if (status === 'suspended' || company.is_active === false) {
    return { allowed: false, reason: 'suspended' }
  }

  const trial = getTrialStatus(company)

  if (status === 'expired' || (status === 'trial' && trial.isTrialExpired)) {
    return {
      allowed: false,
      reason: 'expired',
      requiredPlanName: 'Réabonnement requis',
      upgradePrice: SINGLE_SECTOR_ENTERPRISE_PRICE,
    }
  }

  // Pendant l'essai gratuit de 30 jours : accès complet sur les secteurs couverts par l'essai
  if (trial.isInTrial) {
    return { allowed: true, reason: 'trial_active' }
  }

  // Abonnement actif
  const sectorsCount = Math.max(
    1,
    company.selected_sectors?.length || company.sectors?.length || 1
  )
  const currentPlan = (company.subscription_plan || company.plan || 'entreprise').toLowerCase()

  if (sectorsCount === 1 && (currentPlan === 'starter' || currentPlan === 'solo')) {
    if (STARTER_LOCKED_MODULES.includes(normMod)) {
      return {
        allowed: false,
        reason: 'starter_restriction',
        requiredPlanName: 'Pack Entreprise (10 000 FCFA/mois)',
        upgradePrice: SINGLE_SECTOR_ENTERPRISE_PRICE,
      }
    }
  }

  return { allowed: true, reason: 'full_access' }
}

/**
 * Retourne les informations consolidées d'abonnement d'une entreprise (compatibilité Header & composants)
 */
export function getCompanySubscriptionInfo(company?: Company | null): {
  isActive: boolean
  isInTrial: boolean
  isTrialExpired: boolean
  daysRemaining: number
  trialEndsAt: Date | null
  calculation: SubscriptionCalculation
} {
  const trial = getTrialStatus(company)
  const sectorsCount = Math.max(
    1,
    company?.selected_sectors?.length || company?.sectors?.length || 1
  )
  const currentPlan = (company?.subscription_plan || company?.plan || 'entreprise').toLowerCase()
  const singleTier: 'starter' | 'entreprise' =
    currentPlan === 'starter' || currentPlan === 'solo' ? 'starter' : 'entreprise'
  const calculation = calculateSubscriptionPrice(sectorsCount, singleTier)
  const isActive = (company?.subscription_status || '').toLowerCase() === 'active'

  return {
    isActive,
    isInTrial: trial.isInTrial,
    isTrialExpired: trial.isTrialExpired,
    daysRemaining: trial.daysRemaining,
    trialEndsAt: trial.trialEndsAt,
    calculation,
  }
}

