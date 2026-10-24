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
  standardPriceMonthly: number // Prix sans réduction de groupement multi-secteurs (ex: count * 10 000 F)
  sectorDiscountMonthly: number // Réduction mensuelle liée au groupement de secteurs
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

export interface AccountSectorState {
  slug: string
  name?: string
  isInitial: boolean
  planTier: 'starter' | 'entreprise'
  isGratuit: boolean
  freeTrialActive: boolean
  freeTrialEndsAt: Date | null
  paidActive: boolean
  paidEndsAt: Date | null
}

export interface DetailedRenewalCalculation {
  scope: string // 'all' | sector_slug
  scopeLabel: string
  planSlug: string
  planName: string
  planAppliedSlug: string
  planAppliedName: string
  durationMonths: number
  sectorsCovered: string[]
  freeSectorsList: string[]
  paidSectorsList: string[]
  totalSectorsCount: number
  freeSectorsCount: number
  paidSectorsCount: number
  standardMonthlyPrice: number
  standardPriceMonthly: number
  monthlySectorDiscount: number
  sectorDiscountMonthly: number
  monthlyNetPrice: number
  netMonthlyPrice: number
  totalSectorDiscount: number
  totalAmountToPay: number
  netTotalPrice: number
  breakdown: string
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
 * Conforme au barème officiel GESTIO 229 :
 * - 1 secteur — Starter : 5 000 F CFA / mois
 * - 1 secteur — Complet : 10 000 F CFA / mois
 * - 2 secteurs : 15 000 F CFA / mois (réduction de 5 000 F / mois sur le groupement)
 * - 3 secteurs : 25 000 F CFA / mois (réduction de 5 000 F / mois sur le groupement)
 * - Chaque secteur au-delà de 3 : +5 000 F CFA par secteur
 *
 * La réduction est calculée en fonction du nombre de secteurs, et NON de la durée.
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
        standardPriceMonthly: SINGLE_SECTOR_STARTER_PRICE,
        sectorDiscountMonthly: 0,
        breakdown: '1 secteur d\'activité — Formule Starter (5 000 F CFA / mois)',
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
      planName: 'Pack 1 Secteur (Complet)',
      priceMonthly: SINGLE_SECTOR_ENTERPRISE_PRICE,
      standardPriceMonthly: SINGLE_SECTOR_ENTERPRISE_PRICE,
      sectorDiscountMonthly: 0,
      breakdown: '1 secteur d\'activité — Formule Complète (10 000 F CFA / mois)',
      maxUsers: -1,
      maxProduits: -1,
      maxVentesMois: -1,
      lockedModules: [],
      requiresAdminApproval: false,
    }
  }

  if (count === 2) {
    const standard = 2 * SINGLE_SECTOR_ENTERPRISE_PRICE // 20 000 F
    const price = 15000
    const discount = standard - price // 5 000 F
    return {
      sectorsCount: 2,
      planSlug: 'multisecteur_2',
      planName: 'Pack Duo (2 Secteurs)',
      priceMonthly: price,
      standardPriceMonthly: standard,
      sectorDiscountMonthly: discount,
      breakdown: `2 secteurs d'activité — 15 000 F CFA / mois (Réduction multi-secteurs de ${discount.toLocaleString('fr-FR')} F CFA)`,
      maxUsers: -1,
      maxProduits: -1,
      maxVentesMois: -1,
      lockedModules: [],
      requiresAdminApproval: false,
    }
  }

  if (count === 3) {
    const standard = 3 * SINGLE_SECTOR_ENTERPRISE_PRICE // 30 000 F
    const price = 25000
    const discount = standard - price // 5 000 F
    return {
      sectorsCount: 3,
      planSlug: 'multisecteur_3',
      planName: 'Pack Trio (3 Secteurs)',
      priceMonthly: price,
      standardPriceMonthly: standard,
      sectorDiscountMonthly: discount,
      breakdown: `3 secteurs d'activité — 25 000 F CFA / mois (Réduction multi-secteurs de ${discount.toLocaleString('fr-FR')} F CFA)`,
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
  const standard = count * SINGLE_SECTOR_ENTERPRISE_PRICE // count * 10 000 F
  const discount = Math.max(0, standard - totalMonthly)

  return {
    sectorsCount: count,
    planSlug: 'multisecteur_pro',
    planName: `Pack Multi-Secteurs (${count} Secteurs)`,
    priceMonthly: totalMonthly,
    standardPriceMonthly: standard,
    sectorDiscountMonthly: discount,
    breakdown: `3 secteurs (25 000 F) + ${extraSectors} secteur(s) supplémentaire(s) × 5 000 F = ${totalMonthly.toLocaleString('fr-FR')} F CFA / mois (Réduction multi-secteurs : ${discount.toLocaleString('fr-FR')} F CFA / mois)`,
    maxUsers: -1,
    maxProduits: -1,
    maxVentesMois: -1,
    lockedModules: [],
    requiresAdminApproval: false,
  }
}

/**
 * Calcule le tarif mensuel d'un secteur supplémentaire ajouté après l'inscription (Section 5).
 * - Option A : Starter (5 000 F CFA / mois)
 * - Option B : 1 Secteur (Complet) (10 000 F CFA / mois)
 */
export function calculateAddedSectorMonthlyPrice(tier: 'starter' | 'entreprise'): number {
  return tier === 'starter' ? SINGLE_SECTOR_STARTER_PRICE : SINGLE_SECTOR_ENTERPRISE_PRICE
}

/**
 * Calcule le récapitulatif d'inscription multi-secteurs (Sections 2 & 3 du cahier des charges) :
 * - Les 3 premiers secteurs sélectionnés bénéficient chacun d'un mois gratuit.
 * - Tout secteur supplémentaire (à partir du 4e) est facturé selon le barème officiel (+5 000 FCFA / mois / secteur)
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
 * Calcule le tarif selon la durée choisie (1, 2, 3, 4, 6, 12 mois ou toute durée personnalisée >= 1 mois).
 *
 * RÈGLE STRICTE (Section 6 & Tests 9 & 10) :
 * - La réduction doit être calculée en fonction du nombre de secteurs d'activité, et NON du nombre de mois.
 * - La durée choisie détermine UNIQUEMENT la période de validité de l'abonnement.
 * - Elle ne déclenche AUCUNE réduction tarifaire automatique liée au nombre de mois.
 * - Montant total = (baseMonthlyPrice * durationMonths).
 */
export function calculateDurationPrice(
  baseMonthlyPrice: number,
  durationMonths: BillingDurationMonths
): DurationPriceCalculation {
  const dur = Math.max(1, Math.floor(Number(durationMonths) || 1))
  const grossTotal = baseMonthlyPrice * dur
  // Zéro réduction liée à la durée : la réduction provient exclusivement du barème multi-secteurs
  const discountPercent = 0
  const discountAmount = 0
  const netTotal = grossTotal
  const effectiveMonthlyPrice = baseMonthlyPrice
  const label = dur === 1 ? '1 Mois (Mensuel)' : `${dur} Mois`

  return {
    durationMonths: dur,
    baseMonthlyPrice,
    grossTotal,
    discountPercent,
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
 * Moteur consolidé de calcul de réabonnement respectant l'ensemble des règles officielles :
 * 1. Périmètre : Global ('all') ou Secteur spécifique
 * 2. Distinction durable des secteurs initiaux vs secteurs ajoutés après inscription
 * 3. Gratuité d'un mois pour les 3 premiers secteurs d'inscription
 * 4. Conservation du plan initial pour les secteurs initiaux
 * 5. Choix individuel Starter (5 000 F) ou Complet (10 000 F) pour chaque secteur ajouté
 * 6. Application stricte du barème officiel et de ses réductions multi-secteurs
 * 7. Aucune réduction liée à la durée (la durée est strictement un multiplicateur)
 */
export interface RenewalPricingInput {
  scope: string
  allSectors?: string[]
  allCurrentSectors?: string[]
  initialSectors?: string[]
  initialPlan?: 'starter' | 'entreprise' | string
  addedSectorsPlans?: Record<string, 'starter' | 'entreprise'>
  durationMonths: number
  isInitialFreeTrialActive?: boolean
  sectorsState?: Array<{
    sectorSlug: string
    isInitialSector?: boolean
    planTier?: 'starter' | 'entreprise'
    isGratuit?: boolean
    isPaidAndActive?: boolean
  }>
}

/**
 * Moteur consolidé de calcul de réabonnement respectant l'ensemble des règles officielles :
 * 1. Périmètre : Global ('all') ou Secteur spécifique
 * 2. Distinction durable des secteurs initiaux vs secteurs ajoutés après inscription
 * 3. Gratuité d'un mois pour les 3 premiers secteurs d'inscription
 * 4. Conservation du plan initial pour les secteurs initiaux
 * 5. Choix individuel Starter (5 000 F) ou Complet (10 000 F) pour chaque secteur ajouté
 * 6. Application stricte du barème officiel et de ses réductions multi-secteurs
 * 7. Aucune réduction liée à la durée (la durée est strictement un multiplicateur)
 */
export function calculateDetailedRenewalPricing(params: RenewalPricingInput): DetailedRenewalCalculation {
  const dur = Math.max(1, Math.floor(Number(params.durationMonths) || 1))
  const cleanScope = (params.scope || 'all').toLowerCase().trim()

  const allSectorsList = params.allSectors || params.allCurrentSectors || (params.sectorsState ? params.sectorsState.map(s => s.sectorSlug) : [])
  const allSectors = Array.from(
    new Set(allSectorsList.map((s) => String(s).toLowerCase().trim()).filter(Boolean))
  )

  const initialSectorsList = params.initialSectors && params.initialSectors.length > 0
    ? params.initialSectors
    : params.sectorsState
    ? params.sectorsState.filter(s => s.isInitialSector).map(s => s.sectorSlug)
    : allSectors.slice(0, 3)

  const initialSectors = Array.from(
    new Set(initialSectorsList.map((s) => String(s).toLowerCase().trim()).filter(Boolean))
  )

  const normalizedInitialPlan: 'starter' | 'entreprise' =
    String(params.initialPlan || 'entreprise').toLowerCase().includes('starter') ? 'starter' : 'entreprise'

  const addedSectorsPlans = params.addedSectorsPlans || {}

  // Constuire l'état de chaque secteur
  const sectorStatesMap = new Map<string, {
    slug: string
    isInitial: boolean
    planTier: 'starter' | 'entreprise'
    isGratuit: boolean
    isPaidAndActive: boolean
  }>()

  for (const slug of allSectors) {
    const fromState = params.sectorsState?.find(s => s.sectorSlug.toLowerCase() === slug)
    const isInitial = fromState?.isInitialSector !== undefined ? fromState.isInitialSector : initialSectors.includes(slug)
    
    let planTier: 'starter' | 'entreprise' = 'entreprise'
    if (fromState?.planTier) {
      planTier = fromState.planTier
    } else if (!isInitial && addedSectorsPlans[slug]) {
      planTier = addedSectorsPlans[slug]
    } else if (isInitial && allSectors.length === 1) {
      planTier = normalizedInitialPlan
    }

    const isGratuit = Boolean(fromState?.isGratuit) || Boolean(params.isInitialFreeTrialActive && isInitial && initialSectors.indexOf(slug) < MAX_FREE_TRIAL_SECTORS)
    const isPaidAndActive = Boolean(fromState?.isPaidAndActive)

    sectorStatesMap.set(slug, {
      slug,
      isInitial,
      planTier,
      isGratuit,
      isPaidAndActive,
    })
  }

  // CAS 1 : Périmètre spécifique (1 seul secteur)
  if (cleanScope !== 'all') {
    const secState = sectorStatesMap.get(cleanScope) || {
      slug: cleanScope,
      isInitial: initialSectors.includes(cleanScope),
      planTier: addedSectorsPlans[cleanScope] || (initialSectors.includes(cleanScope) && allSectors.length === 1 ? normalizedInitialPlan : 'entreprise'),
      isGratuit: false,
      isPaidAndActive: false,
    }

    const secName = cleanScope.toUpperCase()

    if (secState.isGratuit) {
      return {
        scope: cleanScope,
        scopeLabel: `Secteur : ${secName}`,
        planSlug: secState.planTier,
        planName: secState.planTier === 'starter' ? 'Pack Starter (1 Secteur)' : 'Pack 1 Secteur (Complet)',
        planAppliedSlug: secState.planTier,
        planAppliedName: secState.planTier === 'starter' ? 'Pack Starter (1 Secteur)' : 'Pack 1 Secteur (Complet)',
        durationMonths: dur,
        sectorsCovered: [cleanScope],
        freeSectorsList: [cleanScope],
        paidSectorsList: [],
        totalSectorsCount: 1,
        freeSectorsCount: 1,
        paidSectorsCount: 0,
        standardMonthlyPrice: 0,
        standardPriceMonthly: 0,
        monthlySectorDiscount: 0,
        sectorDiscountMonthly: 0,
        monthlyNetPrice: 0,
        netMonthlyPrice: 0,
        totalSectorDiscount: 0,
        totalAmountToPay: 0,
        netTotalPrice: 0,
        breakdown: `Secteur ${secName} couvert par l'essai gratuit de 30 jours (0 F CFA)`,
      }
    }

    if (secState.isPaidAndActive) {
      return {
        scope: cleanScope,
        scopeLabel: `Secteur : ${secName}`,
        planSlug: secState.planTier,
        planName: secState.planTier === 'starter' ? 'Pack Starter (1 Secteur)' : 'Pack 1 Secteur (Complet)',
        planAppliedSlug: secState.planTier,
        planAppliedName: secState.planTier === 'starter' ? 'Pack Starter (1 Secteur)' : 'Pack 1 Secteur (Complet)',
        durationMonths: dur,
        sectorsCovered: [cleanScope],
        freeSectorsList: [],
        paidSectorsList: [],
        totalSectorsCount: 1,
        freeSectorsCount: 0,
        paidSectorsCount: 0,
        standardMonthlyPrice: 0,
        standardPriceMonthly: 0,
        monthlySectorDiscount: 0,
        sectorDiscountMonthly: 0,
        monthlyNetPrice: 0,
        netMonthlyPrice: 0,
        totalSectorDiscount: 0,
        totalAmountToPay: 0,
        netTotalPrice: 0,
        breakdown: `Secteur ${secName} déjà payé et actif (période en cours, non refacturé)`,
      }
    }

    const unitPrice = secState.planTier === 'starter' ? SINGLE_SECTOR_STARTER_PRICE : SINGLE_SECTOR_ENTERPRISE_PRICE
    const totalAmount = unitPrice * dur

    return {
      scope: cleanScope,
      scopeLabel: `Secteur : ${secName}`,
      planSlug: secState.planTier,
      planName: secState.planTier === 'starter' ? 'Pack Starter (1 Secteur)' : 'Pack 1 Secteur (Complet)',
      planAppliedSlug: secState.planTier,
      planAppliedName: secState.planTier === 'starter' ? 'Pack Starter (1 Secteur)' : 'Pack 1 Secteur (Complet)',
      durationMonths: dur,
      sectorsCovered: [cleanScope],
      freeSectorsList: [],
      paidSectorsList: [cleanScope],
      totalSectorsCount: 1,
      freeSectorsCount: 0,
      paidSectorsCount: 1,
      standardMonthlyPrice: unitPrice,
      standardPriceMonthly: unitPrice,
      monthlySectorDiscount: 0,
      sectorDiscountMonthly: 0,
      monthlyNetPrice: unitPrice,
      netMonthlyPrice: unitPrice,
      totalSectorDiscount: 0,
      totalAmountToPay: totalAmount,
      netTotalPrice: totalAmount,
      breakdown: `Abonnement Secteur (${secState.planTier === 'starter' ? 'Starter' : 'Complet'}) : ${unitPrice.toLocaleString('fr-FR')} F CFA / mois × ${dur} mois`,
    }
  }

  // CAS 2 : Périmètre Global ('all')
  const freeSectorsList: string[] = []
  const paidSectorsList: string[] = []

  for (const [slug, st] of sectorStatesMap.entries()) {
    if (st.isGratuit) {
      freeSectorsList.push(slug)
    } else if (!st.isPaidAndActive) {
      paidSectorsList.push(slug)
    }
  }

  const freeCount = freeSectorsList.length
  const paidCount = paidSectorsList.length

  if (paidCount === 0) {
    const planName = freeCount > 0 ? 'Essai Gratuit Unique (30j)' : 'Abonnement Global Actif'
    return {
      scope: 'all',
      scopeLabel: `Abonnement Global (${allSectors.length} secteurs)`,
      planSlug: 'multisecteur_pro',
      planName,
      planAppliedSlug: 'multisecteur_pro',
      planAppliedName: planName,
      durationMonths: dur,
      sectorsCovered: allSectors,
      freeSectorsList,
      paidSectorsList,
      totalSectorsCount: allSectors.length,
      freeSectorsCount: freeCount,
      paidSectorsCount: 0,
      standardMonthlyPrice: 0,
      standardPriceMonthly: 0,
      monthlySectorDiscount: 0,
      sectorDiscountMonthly: 0,
      monthlyNetPrice: 0,
      netMonthlyPrice: 0,
      totalSectorDiscount: 0,
      totalAmountToPay: 0,
      netTotalPrice: 0,
      breakdown: `${freeCount} secteur(s) gratuit(s) en cours d'utilisation (0 F CFA)`,
    }
  }

  // Séparer les secteurs payants entre initiaux et ajoutés
  const payingInitial = paidSectorsList.filter(s => sectorStatesMap.get(s)?.isInitial)
  const payingAdded = paidSectorsList.filter(s => !sectorStatesMap.get(s)?.isInitial)

  let payingInitialMonthly = 0
  let payingInitialStandard = 0

  // Si 3 secteurs initiaux sont gratuits et que nous facturons les secteurs initiaux au-delà de 3
  if (freeCount >= MAX_FREE_TRIAL_SECTORS && payingInitial.length > 0) {
    payingInitialMonthly = payingInitial.length * EXTRA_SECTOR_MONTHLY_PRICE
    payingInitialStandard = payingInitial.length * SINGLE_SECTOR_ENTERPRISE_PRICE
  } else {
    // Calcul officiel multi-secteurs pour les secteurs initiaux
    if (payingInitial.length === 1) {
      const tier = normalizedInitialPlan
      const price = tier === 'starter' ? SINGLE_SECTOR_STARTER_PRICE : SINGLE_SECTOR_ENTERPRISE_PRICE
      payingInitialMonthly = price
      payingInitialStandard = price
    } else if (payingInitial.length === 2) {
      payingInitialMonthly = 15000
      payingInitialStandard = 20000
    } else if (payingInitial.length === 3) {
      payingInitialMonthly = 25000
      payingInitialStandard = 30000
    } else if (payingInitial.length > 3) {
      const extra = payingInitial.length - 3
      payingInitialMonthly = 25000 + extra * EXTRA_SECTOR_MONTHLY_PRICE
      payingInitialStandard = payingInitial.length * SINGLE_SECTOR_ENTERPRISE_PRICE
    }
  }

  let payingAddedMonthly = 0
  let payingAddedStandard = 0

  for (const addedSlug of payingAdded) {
    const tier = sectorStatesMap.get(addedSlug)?.planTier || 'entreprise'
    const price = calculateAddedSectorMonthlyPrice(tier)
    payingAddedMonthly += price
    payingAddedStandard += SINGLE_SECTOR_ENTERPRISE_PRICE
  }

  const standardMonthly = payingInitialStandard + payingAddedStandard
  const netMonthly = payingInitialMonthly + payingAddedMonthly
  const monthlyDiscount = Math.max(0, standardMonthly - netMonthly)
  const totalAmount = netMonthly * dur
  const totalDiscount = monthlyDiscount * dur

  const planAppliedName =
    paidCount === 1 && payingInitial.length === 1 && normalizedInitialPlan === 'starter'
      ? 'Pack Starter (1 Secteur)'
      : paidCount === 1
      ? 'Pack 1 Secteur (Complet)'
      : `Pack Multi-Secteurs (${paidCount} payant${paidCount > 1 ? 's' : ''})`

  return {
    scope: 'all',
    scopeLabel: `Abonnement Global (${allSectors.length} secteur${allSectors.length > 1 ? 's' : ''})`,
    planSlug: paidCount === 1 ? normalizedInitialPlan : 'multisecteur_pro',
    planName: planAppliedName,
    planAppliedSlug: paidCount === 1 ? normalizedInitialPlan : 'multisecteur_pro',
    planAppliedName,
    durationMonths: dur,
    sectorsCovered: allSectors,
    freeSectorsList,
    paidSectorsList,
    totalSectorsCount: allSectors.length,
    freeSectorsCount: freeCount,
    paidSectorsCount: paidCount,
    standardMonthlyPrice: standardMonthly,
    standardPriceMonthly: standardMonthly,
    monthlySectorDiscount: monthlyDiscount,
    sectorDiscountMonthly: monthlyDiscount,
    monthlyNetPrice: netMonthly,
    netMonthlyPrice: netMonthly,
    totalSectorDiscount: totalDiscount,
    totalAmountToPay: totalAmount,
    netTotalPrice: totalAmount,
    breakdown: `${paidCount} secteur(s) facturé(s) = ${netMonthly.toLocaleString('fr-FR')} F CFA / mois × ${dur} mois (Réduction multi-secteurs : ${monthlyDiscount.toLocaleString('fr-FR')} F CFA / mois)`,
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

// =============================================================================
// CATALOGUE OFFICIEL DES FONCTIONNALITÉS INCLUSES PAR SECTEUR D'ACTIVITÉ
// Présentation claire pour les clients (Mon Abonnement & Modale Activer Secteur)
// =============================================================================

export interface SectorFeatureInfo {
  slug: string
  name: string
  tagline: string
  description: string
  starterFeatures: string[]
  enterpriseFeatures: string[]
  modules: string[]
}

export const SECTOR_FEATURES_CATALOG: Record<string, SectorFeatureInfo> = {
  'station-service': {
    slug: 'station-service',
    name: 'Station-Service & Carburants',
    tagline: 'Pilotage complet des cuves, des index de pompes et des équipes de pompistes',
    description: 'Solution spécialisée pour stations-service : suivi en temps réel des jauges de cuves, relevés des compteurs début et fin de quart, clôture de caisse pompiste et rapprochement des écarts de litrage.',
    starterFeatures: [
      'Suivi des cuves (Essence, Gasoil, Pétrole)',
      'Relevé des index de pompes et compteurs',
      'Affectation des pompistes par quart de travail',
      'Vente carburants et lubrifiants',
      'Clôture de poste et calcul des écarts',
      'Caisse espèces & Mobile Money'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Gestion des flottes d\'entreprises et cartes carburant',
      'Synchronisation comptable automatique SYSCOHADA',
      'Rapprochement bancaire & transferts coffre-fort',
      'Rapports d\'activité et alertes de seuil de réapprovisionnement'
    ],
    modules: ['pompes-cuves', 'postes-pompistes', 'ventes', 'caisse', 'stocks', 'clients', 'finances', 'syscohada']
  },
  'pharmacie': {
    slug: 'pharmacie',
    name: 'Pharmacie & Parapharmacie',
    tagline: 'Sécurisation des médicaments, traçabilité des lots et vente comptoir rapide',
    description: 'Gestion rigoureuse d\'officine : suivi des numéros de lots et des dates de péremption, délivrance sur ordonnance, gestion des assurances/tiers payants et caisse sécurisée.',
    starterFeatures: [
      'Vente rapide au comptoir et tickets de caisse',
      'Gestion des lots et dates de péremption',
      'Alertes de stock minimum et produits périmés',
      'Enregistrement des ordonnances et médecins',
      'Caisse journalière et suivi des espèces/MoMo'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Gestion des tiers-payants et mutuelles/assurances',
      'Inventaires tournants par rayon et zone de stockage',
      'Intégration comptable SYSCOHADA complète',
      'Historique pharmacovigilance et traçabilité réglementaire'
    ],
    modules: ['vente-comptoir', 'ordonnances', 'fournisseurs', 'caisse', 'stocks', 'finances', 'syscohada']
  },
  'quincaillerie': {
    slug: 'quincaillerie',
    name: 'Quincaillerie & Matériaux de Construction',
    tagline: 'Gestion multi-unités (UCD/UV), ventes au détail/gros et suivi des chantiers',
    description: 'Conçu pour la distribution de matériaux : gestion des unités de conditionnement (tonnes, barres, paquets, sacs), conversion automatique, devis de chantiers et créances clients.',
    starterFeatures: [
      'Double unité : Stock (UCD) et Vente (UV)',
      'Conversion automatique lors des ventes et réceptions',
      'Vente comptoir et facturation proforma/devis',
      'Gestion du stock magasin et stock vente séparés',
      'Suivi des créances et dettes clients/fournisseurs'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Bons de commande fournisseurs avec réceptions échelonnées',
      'Multi-dépôts et transferts inter-magasins',
      'Grand livre & balance générale SYSCOHADA',
      'Suivi des marges brutes par famille d\'articles'
    ],
    modules: ['ventes', 'stocks', 'caisse', 'bons-commande', 'clients', 'fournisseurs', 'finances', 'syscohada']
  },
  'restaurant': {
    slug: 'restaurant',
    name: 'Restaurant, Bar & Maquis',
    tagline: 'Plan de salle, fiches recettes, déstockage cuisine et encaissements rapides',
    description: 'Adapté aux établissements de restauration : gestion des tables, transmission des commandes cuisine/bar, fiches techniques recettes avec déstockage automatique des ingrédients.',
    starterFeatures: [
      'Plan de salle interactif et gestion des tables',
      'Prise de commande mobile serveurs / bar / cuisine',
      'Fiches techniques recettes (ingrédients & dosages)',
      'Déstockage automatique lors des préparations',
      'Caisse de service et clôture par serveur'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Gestion des pertes, casses et gaspillages',
      'Réservations de tables et gestion des événements',
      'Comptabilité SYSCOHADA & analytique cuisine/bar',
      'Rapports de rentabilité par plat et boisson'
    ],
    modules: ['plan-salle', 'commandes', 'recettes', 'caisse', 'stocks', 'finances', 'syscohada']
  },
  'microfinance': {
    slug: 'microfinance',
    name: 'Microfinance & Tontines',
    tagline: 'Gestion des adhérents, plans d\'épargne, tontines et suivi des crédits',
    description: 'Solution pour structures de microfinance et groupements : adhésions, comptes d\'épargne, cycles de tontine, tableaux d\'amortissement de crédits et collectes terrain.',
    starterFeatures: [
      'Fiches individuelles des adhérents / sociétaires',
      'Gestion des comptes d\'épargne et dépôts/retraits',
      'Suivi des cycles de tontine et des cotisations',
      'Caisse d\'agence et reçus de collecte',
      'Relevés de compte individuels'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Octroi de crédits avec échéanciers d\'amortissement',
      'Application pour agents collecteurs mobiles sur le terrain',
      'Calcul automatique des pénalités de retard',
      'Rapports de conformité et écritures SYSCOHADA'
    ],
    modules: ['membres-epargne', 'tontines', 'credits', 'agents-collecteurs', 'caisse', 'finances', 'syscohada']
  },
  'ecole': {
    slug: 'ecole',
    name: 'École & Établissement Scolaire',
    tagline: 'Gestion des inscriptions, des classes et recouvrement des frais scolaires',
    description: 'Dédié aux écoles, collèges et centres de formation : dossiers élèves, répartition par classes, échéanciers de scolarité, attestations de paiement et caisse établissement.',
    starterFeatures: [
      'Inscriptions et fiches complètes des élèves',
      'Gestion des promotions, filières et classes',
      'Échéanciers de frais de scolarité et cantine',
      'Émission instantanée des reçus et quittances',
      'Caisse d\'établissement et état des impayés'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Gestion des enseignants et fiches de présence',
      'Bulletins de notes et relevés périodiques',
      'Alertes SMS/WhatsApp de relance aux parents',
      'Plan comptable scolaire SYSCOHADA'
    ],
    modules: ['inscriptions', 'classes', 'paiements-scolaires', 'evaluations', 'caisse', 'finances', 'syscohada']
  },
  'imprimerie': {
    slug: 'imprimerie',
    name: 'Imprimerie & Travaux Graphiques',
    tagline: 'Chiffrage des devis, gestion des papiers/bobines et ordres de production',
    description: 'Pilotage d\'ateliers graphiques et sérigraphie : devis personnalisés selon formats et grammages, suivi des bobines/plaques, ordres de fabrication et caisse.',
    starterFeatures: [
      'Devis sur mesure selon supports et tirages',
      'Gestion des machines et postes d\'impression',
      'Suivi des stocks de papiers, bobines, encres et bâches',
      'Ordres de fabrication (OF) et suivi d\'avancement',
      'Facturation et encaissement des acomptes'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Planning de charge des machines de tirage',
      'Calcul du coût de revient matière & façonnage',
      'Facturation avec suivi des livraisons partielles',
      'Intégration comptable SYSCOHADA'
    ],
    modules: ['devis-production', 'machines', 'papiers', 'prestations', 'caisse', 'finances', 'syscohada']
  },
  'garage': {
    slug: 'garage',
    name: 'Garage Automobile & Mécanique',
    tagline: 'Ordres de réparation (OR), pièces de rechange et suivi des diagnostics',
    description: 'Pour ateliers mécaniques et centres auto : fiches véhicules, réception client, ordres de réparation, affectation des mécaniciens, pièces détachées et facturation.',
    starterFeatures: [
      'Fiches véhicules (châssis, immatriculation, km)',
      'Ordres de Réparation (OR) et diagnostics',
      'Gestion du stock de pièces détachées et fluides',
      'Facturation main d\'œuvre et fournitures',
      'Caisse atelier et règlements clients'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Gestion des dossiers sinistres et assurances',
      'Planning de travail des techniciens/mécaniciens',
      'Historique d\'entretien complet par véhicule',
      'Gestion financière et comptabilité SYSCOHADA'
    ],
    modules: ['reparations', 'vehicules', 'pieces', 'assurances', 'caisse', 'finances', 'syscohada']
  },
  'btp': {
    slug: 'btp',
    name: 'BTP, Chantier & Engins',
    tagline: 'Suivi de chantier, affectation du matériel lourd et gestion des carburants',
    description: 'Solution pour entreprises du bâtiment et travaux publics : fiches chantiers, consommation de carburant par engin, maintenance des équipements et caisse de régie.',
    starterFeatures: [
      'Gestion des chantiers et sites opérationnels',
      'Inventaire du parc matériel et petits outillages',
      'Suivi de la consommation carburant par engin',
      'Affectation des chauffeurs et ouvriers',
      'Dépenses de régie et caisse de chantier'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Planning de maintenance préventive des engins',
      'Rapprochement des coûts de revient par chantier',
      'Logistique et transferts inter-sites',
      'Comptabilité analytique SYSCOHADA'
    ],
    modules: ['chantiers', 'materiel', 'carburant', 'maintenance', 'caisse', 'finances', 'syscohada']
  },
  'flotte': {
    slug: 'flotte',
    name: 'Transport & Flotte de Véhicules',
    tagline: 'Missions, billetterie, consommation de carburant et conformité documents',
    description: 'Pour sociétés de transport et gestionnaires de parcs : missions de transport, carnets de bord, suivi des assurances/visites techniques et caisse de billetterie.',
    starterFeatures: [
      'Fiches véhicules et conducteurs',
      'Ordres de mission et feuilles de route',
      'Suivi des pleins de carburant et kilométrages',
      'Alertes d\'expiration des pièces (assurance, visite)',
      'Caisse billetterie et frais de route'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Géolocalisation & suivi des zones géographiques',
      'Rapports d\'entretien et calcul du coût au km',
      'Gestion des incidents et déclarations de sinistres',
      'Écritures comptables automatiques SYSCOHADA'
    ],
    modules: ['missions', 'vehicules', 'conducteurs', 'carburant', 'caisse', 'finances', 'syscohada']
  },
  'poissonnerie': {
    slug: 'poissonnerie',
    name: 'Poissonnerie & Entrepôt Frigorifique',
    tagline: 'Pèse-colis, chambres froides, gestion des cartons/vrac et des avaries',
    description: 'Pour grossistes et détaillants de produits congelés : pesée au kilogramme, gestion par carton et détail, surveillance des chambres froides et traçabilité des avaries.',
    starterFeatures: [
      'Vente au poids (kg) et au carton/cartouche',
      'Gestion du stock chambres froides et comptoir',
      'Saisie et traçabilité des avaries/décongélations',
      'Tarification différenciée gros / demi-gros / détail',
      'Caisse journalière espèces et Mobile Money'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Suivi des températures des chambres froides',
      'Réception maritime/fournisseur avec pesée à quai',
      'Comptabilité de gestion des stocks SYSCOHADA',
      'Rapports de marge après déduction des pertes'
    ],
    modules: ['ventes', 'pesee', 'chambres-froides', 'avaries', 'caisse', 'stocks', 'finances', 'syscohada']
  },
  'immobilier': {
    slug: 'immobilier',
    name: 'Gestion Immobilière & Locative',
    tagline: 'Baux, loyers, quittances, cautions et suivi des travaux locatifs',
    description: 'Pour agences immobilières et propriétaires : contrats de bail, perception des loyers, quittances automatiques, gestion des états des lieux et cautions en dépôt.',
    starterFeatures: [
      'Fiches des biens (appartements, boutiques, villas)',
      'Dossiers locataires et propriétaires bailleurs',
      'Génération des contrats de bail et états des lieux',
      'Émission des avis d\'échéance et quittances de loyer',
      'Caisse des loyers et suivi des impayés'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Reversement des loyers aux propriétaires bailleurs',
      'Gestion des travaux d\'entretien et retenues sur caution',
      'Historique des baux et renouvellements',
      'Plan comptable immobilier SYSCOHADA'
    ],
    modules: ['biens', 'locataires', 'contrats', 'quittances', 'caisse', 'finances', 'syscohada']
  },
  'boutique': {
    slug: 'boutique',
    name: 'Commerce Général & Boutique',
    tagline: 'Encaissement rapide, multi-dépôts, gestion des codes-barres et créances',
    description: 'Solution polyvalente pour magasins et commerces : catalogue articles, étiquettes codes-barres, vente comptoir rapide, gestion des stocks et suivi des créances clients.',
    starterFeatures: [
      'Vente rapide au comptoir et tickets de caisse',
      'Gestion du catalogue articles et codes-barres',
      'Stock magasin et stock boutique avec alertes',
      'Suivi des créances clients et dettes fournisseurs',
      'Caisse journalière espèces & Mobile Money'
    ],
    enterpriseFeatures: [
      'Toutes les fonctionnalités Starter incluses',
      'Multi-dépôts avec transferts sécurisés',
      'Bons de commande fournisseurs et réceptions',
      'Comptabilité générale SYSCOHADA Révisé',
      'Rapports de ventes, marges et bilans comptables'
    ],
    modules: ['ventes', 'stocks', 'caisse', 'clients', 'fournisseurs', 'depenses', 'finances', 'syscohada']
  }
}

/**
 * Retourne les fonctionnalités d'un secteur par son slug ou un fallback propre
 */
export function getSectorFeatureInfo(sectorSlug?: string): SectorFeatureInfo {
  if (!sectorSlug) return SECTOR_FEATURES_CATALOG['boutique']
  const clean = String(sectorSlug).replace(/^sec-/, '').toLowerCase().trim()
  return SECTOR_FEATURES_CATALOG[clean] || {
    slug: clean,
    name: clean.toUpperCase(),
    tagline: 'Gestion opérationnelle, stocks, encaissements et finances',
    description: 'Ensemble des modules métiers essentiels pour piloter et développer votre activité.',
    starterFeatures: [
      'Ventes et encaissements rapides',
      'Gestion du stock et alertes de rupture',
      'Caisse journalière multi-modes',
      'Suivi des clients et des dépenses'
    ],
    enterpriseFeatures: [
      'Comptabilité SYSCOHADA Révisé intégrée',
      'Trésorerie avancée et rapprochement bancaire',
      'Multi-utilisateurs et droits d\'accès stricts',
      'Rapports d\'activité et analyses financières'
    ],
    modules: ['ventes', 'stocks', 'caisse', 'clients', 'depenses', 'finances', 'syscohada']
  }
}


