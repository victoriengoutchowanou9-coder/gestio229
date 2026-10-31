// =============================================================================
// GESTIO 229 SaaS — SERVICE D'ABONNEMENT MULTI-SECTEURS (Refonte V4)
// =============================================================================
// Implémentation complète du cahier des charges :
// 1. Essai gratuit unique de 30 jours lié au compte, couvrant au maximum 3 secteurs.
// 2. Suppression définitive de l'essai gratuit individuel de 30 jours par secteur.
// 3. Ajout d'un secteur après l'inscription :
//    - Si compte encore en essai gratuit initial valide ET < 3 secteurs d'essai -> rattaché à l'essai restant.
//    - Sinon -> statut 'en_attente_paiement' (inactif jusqu'à validation de paiement ou activation Super Admin).
// 4. Ouverture d'un secteur inactif autorisée uniquement sur 'dashboard' (tableau-bord) et 'abonnement'.
// 5. Paiement Manuel (avec configuration Super Admin, upload de preuve, anti-doublon, validation/rejet)
//    et Paiement Automatique (préparé pour API avec message officiel).
// 6. Prolongation intelligente des dates (sans perte de jours avant expiration).
// 7. Journal d'audit complet et notifications dédupliquées.
// =============================================================================

import { supabase } from '../lib/supabase'
import {
  MAX_FREE_TRIAL_SECTORS,
  EXTRA_SECTOR_MONTHLY_PRICE,
  SINGLE_SECTOR_STARTER_PRICE,
  SINGLE_SECTOR_ENTERPRISE_PRICE,
  calculateSubscriptionPrice,
  calculateDurationPrice,
  calculateRenewalDates,
  calculateAddedSectorMonthlyPrice,
  calculateDetailedRenewalPricing,
} from '../core/subscription/subscriptionEngine'

export type StatutGlobal = 'essai' | 'actif' | 'expire' | 'suspendu' | 'en_attente_paiement'
export type StatutSpecifique =
  | 'essai_gratuit'
  | 'rattache_global'
  | 'actif'
  | 'en_attente_paiement'
  | 'expire'
  | 'suspendu'
  | 'essai_individuel' // conservé uniquement dans le type pour rétro-compatibilité lecture

export interface SectorSubscriptionMeta {
  sector_slug: string
  is_initial_sector: boolean // true = choisi à l'inscription, false = ajouté ultérieurement
  plan_tier: 'starter' | 'entreprise'
  is_gratuit: boolean // true = bénéficie de la gratuité d'un mois
  date_debut_gratuit: string | null
  date_fin_gratuit: string | null
  date_ajout: string
  date_debut_validite: string | null
  date_fin_validite: string | null
  duree_mois?: number
  montant_paye?: number
}

export interface CompanySubscriptionMeta {
  initial_plan: 'starter' | 'entreprise' | 'multisecteur_2' | 'multisecteur_3' | 'multisecteur_pro'
  initial_sectors: string[]
  sectors_meta: Record<string, SectorSubscriptionMeta>
  added_sectors?: string[]
  added_sectors_plans?: Record<string, 'starter' | 'entreprise'>
}

export interface AbonnementGlobalRow {
  id: string
  entreprise_id: string
  date_debut_global: string
  date_fin_global: string
  statut_global: StatutGlobal
  plan_code?: string
  montant_mensuel_fcfa?: number
}

export interface AbonnementSecteurRow {
  id: string
  entreprise_id: string
  secteur_code: string
  date_debut_specifique: string | null
  date_fin_specifique: string | null
  statut_specifique: StatutSpecifique
  is_premiere_activation: boolean
  rattache_au_global: boolean
}

export interface VerificationAccesSecteurResult {
  autorise: boolean
  /** Indique si l'utilisateur peut ouvrir l'interface du secteur (Tableau de bord + Abonnement) */
  ouvertureSecteurAutorisee: boolean
  statutEffectif: 'essai_gratuit' | 'actif' | 'en_attente_paiement' | 'expire' | 'suspendu' | 'non_active'
  dateDebutEffective: Date | null
  dateFinEffective: Date | null
  joursRestants: number
  isPremiereActivationPossible: boolean // Toujours false (Section 3 : essai individuel supprimé)
  rattacheAuGlobal: boolean
  badgeLabel: string
  badgeColor: 'emerald' | 'blue' | 'amber' | 'red' | 'slate'
  messageVerrouillage?: string
  globalSub: AbonnementGlobalRow | null
  secteurSub: AbonnementSecteurRow | null
  isInitialSector: boolean
  isGratuit: boolean
  planTier: 'starter' | 'entreprise'
}

export interface ParametresPaiementManuel {
  deposit_phone: string
  beneficiary_name: string
  payment_operator: string
  whatsapp_number: string
  payment_instructions: string
  automatic_payment_enabled: boolean
  updated_at?: string
  updated_by?: string
}

export interface DemandePaiementAbonnement {
  id: string
  company_id: string
  company_name: string
  sector_slug: string // 'all' ou slug spécifique
  sectors_covered: string[]
  plan_slug: string
  duration_months: number
  unit_price_monthly: number
  discount_amount: number
  total_amount: number
  payment_mode: 'manuel' | 'automatique'
  payment_operator: string
  payer_phone: string
  transaction_reference: string
  proof_url: string
  proof_hash?: string
  notes: string
  status: 'en_attente' | 'valide' | 'rejete'
  expected_start_at: string
  expected_end_at: string
  reviewed_by?: string | null
  reviewed_at?: string | null
  rejection_reason?: string | null
  created_at: string
}

export interface SubscriptionNotificationItem {
  id: string
  company_id: string
  sector_slug?: string | null
  notification_key: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export const DEFAULT_MANUAL_PAYMENT_SETTINGS: ParametresPaiementManuel = {
  deposit_phone: '+229 01 97 00 00 00',
  beneficiary_name: 'GESTIO 229 SARL',
  payment_operator: 'MTN Mobile Money / Moov Money / Celtiis Cash',
  whatsapp_number: '+229 01 97 00 00 00',
  payment_instructions:
    '1. Effectuez le dépôt Mobile Money du montant total indiqué sur le numéro officiel ci-dessus.\n' +
    '2. Vérifiez que le nom du bénéficiaire affiché correspond bien au titulaire indiqué.\n' +
    '3. Joignez la capture d\'écran du reçu et renseignez la référence de transaction pour validation par l\'administration.',
  automatic_payment_enabled: false,
}

const SETTINGS_STORAGE_KEY = 'gestio229_manual_payment_settings_v4'

/**
 * Normalise un slug de secteur en slug canonique minuscule (ex: 'station-service')
 */
export function canonicalSectorSlug(raw: string): string {
  const clean = (raw || 'boutique').toLowerCase().trim().replace(/^sec-/, '').replace(/_/g, '-')
  const map: Record<string, string> = {
    'transport': 'transport',
    'transport-logistique': 'transport',
    'logistique': 'transport',
    'station': 'station-service',
    'stationservice': 'station-service',
    'station-service': 'station-service',
    'flotte': 'flotte-geolocalisation',
    'gps': 'flotte-geolocalisation',
    'flotte-geolocalisation': 'flotte-geolocalisation',
    'microfinance-tontine': 'microfinance',
    'tontine': 'microfinance',
    'microfinance': 'microfinance',
    'gestion-locative': 'immobilier',
    'location': 'immobilier',
    'immobilier': 'immobilier',
    'impression': 'imprimerie',
    'imprimerie': 'imprimerie',
    'agro': 'agrobusiness',
    'agro-business': 'agrobusiness',
    'agrobusiness': 'agrobusiness',
    'cosmetique': 'cosmetiques',
    'cosmetiques': 'cosmetiques',
    'superette': 'supermarche',
    'supermarche': 'supermarche',
    'bar-restaurant-maquis': 'restaurant',
    'maquis': 'restaurant',
    'fast-food': 'restaurant',
    'restaurant': 'restaurant',
    'depot-boissons': 'brasserie',
    'boissons': 'brasserie',
    'brasserie': 'brasserie',
    'poissons': 'poissonnerie',
    'poissonnerie': 'poissonnerie',
  }
  return map[clean] || clean
}

/**
 * Normalise un slug de secteur en code standardisé majuscule (ex: 'TRANSPORT_LOGISTIQUE')
 */
export function toSecteurCode(slug: string): string {
  const canon = canonicalSectorSlug(slug)
  const map: Record<string, string> = {
    'transport': 'TRANSPORT_LOGISTIQUE',
    'station-service': 'STATION_SERVICE',
    'flotte-geolocalisation': 'FLOTTE_GEOLOCALISATION',
    'microfinance': 'MICROFINANCE',
    'immobilier': 'IMMOBILIER',
    'imprimerie': 'IMPRIMERIE',
    'agrobusiness': 'AGROBUSINESS',
    'cosmetiques': 'COSMETIQUES',
  }
  if (map[canon]) return map[canon]
  return canon.toUpperCase().replace(/-/g, '_')
}

/**
 * Convertit un code secteur base de données ('STATION_SERVICE') en slug canonique ('station-service')
 */
export function fromSecteurCodeToSlug(code: string): string {
  return canonicalSectorSlug(code)
}

function computeDaysRemaining(endDate: Date | null, now: Date = new Date()): number {
  if (!endDate || isNaN(endDate.getTime())) return 0
  const diffMs = endDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * GESTION DURABLE DE LA DISTINCTION DES SECTEURS ET DU PLAN CHOISI (Sections 2, 4, 5, 8 du CDC) :
 * - Secteurs initiaux : choisis à l'inscription (les 3 premiers bénéficient d'un mois gratuit).
 * - Secteurs supplémentaires : ajoutés après l'inscription (Option Starter 5 000 F ou Complet 10 000 F).
 * - Conservation durable du plan initial et des choix de chaque secteur sans écrasement.
 */
export async function getCompanySubscriptionMeta(
  companyId: string,
  currentSectors: string[] = [],
  companyCreatedAt?: string,
  initialPlanHint?: string
): Promise<CompanySubscriptionMeta> {
  let existingMeta: CompanySubscriptionMeta | null = null
  let compRow: any = null

  try {
    const { data: comp } = await supabase
      .from('companies')
      .select('id, activity_sectors, subscription_plan, plan, created_at, selected_sectors')
      .eq('id', companyId)
      .maybeSingle()

    compRow = comp
    if (comp?.activity_sectors && typeof comp.activity_sectors === 'object') {
      const raw = comp.activity_sectors as any
      if (raw.initial_sectors && Array.isArray(raw.initial_sectors)) {
        existingMeta = raw as CompanySubscriptionMeta
      }
    }
  } catch (_) {}

  const cleanCurrent = Array.from(
    new Set((currentSectors || []).map((s) => canonicalSectorSlug(s)).filter(Boolean))
  )
  const now = new Date()

  if (existingMeta && Array.isArray(existingMeta.initial_sectors) && existingMeta.initial_sectors.length > 0) {
    let modified = false
    const initSectors = existingMeta.initial_sectors.map((s) => canonicalSectorSlug(s)).filter(Boolean)
    const initSet = new Set(initSectors)

    // Secteurs ajoutés existants ou consolidés depuis les secteurs actuellement rattachés
    const existingAdded = Array.isArray(existingMeta.added_sectors)
      ? existingMeta.added_sectors.map((s) => canonicalSectorSlug(s)).filter(Boolean)
      : []
    const derivedAdded = cleanCurrent.filter((s) => !initSet.has(s))
    const consolidatedAdded = Array.from(new Set([...existingAdded, ...derivedAdded]))

    const addedPlans: Record<string, 'starter' | 'entreprise'> = { ...(existingMeta.added_sectors_plans || {}) }
    for (const slug of consolidatedAdded) {
      if (!addedPlans[slug]) {
        addedPlans[slug] = existingMeta.sectors_meta?.[slug]?.plan_tier || 'entreprise'
      }
    }

    const meta: CompanySubscriptionMeta = {
      initial_plan: existingMeta.initial_plan || (compRow?.subscription_plan === 'starter' ? 'starter' : 'entreprise'),
      initial_sectors: initSectors,
      sectors_meta: { ...(existingMeta.sectors_meta || {}) },
      added_sectors: consolidatedAdded,
      added_sectors_plans: addedPlans,
    }

    for (const slug of cleanCurrent) {
      if (!meta.sectors_meta[slug]) {
        const isInit = initSet.has(slug)
        const initIdx = initSectors.indexOf(slug)
        const isFree = isInit && initIdx >= 0 && initIdx < MAX_FREE_TRIAL_SECTORS
        const createdDate = companyCreatedAt || compRow?.created_at || now.toISOString()
        const trialEnd = new Date(new Date(createdDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const sectorPlan = isInit
          ? (String(meta.initial_plan).includes('starter') ? 'starter' : 'entreprise')
          : (meta.added_sectors_plans[slug] || 'entreprise')

        meta.sectors_meta[slug] = {
          sector_slug: slug,
          is_initial_sector: isInit,
          plan_tier: sectorPlan,
          is_gratuit: isFree,
          date_debut_gratuit: isFree ? createdDate : null,
          date_fin_gratuit: isFree ? trialEnd : null,
          date_ajout: isInit ? createdDate : now.toISOString(),
          date_debut_validite: null,
          date_fin_validite: null,
        }
        modified = true
      }
    }

    if (!Array.isArray(existingMeta.added_sectors) || !existingMeta.added_sectors_plans) {
      modified = true
    }

    if (modified) {
      await saveCompanySubscriptionMeta(companyId, meta)
    }

    return meta
  }

  const compCreated = companyCreatedAt || compRow?.created_at || now.toISOString()
  const createdDate = new Date(compCreated)
  const trialEnd = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  const rawPlan = (initialPlanHint || compRow?.subscription_plan || compRow?.plan || 'entreprise').toLowerCase()
  const initialPlanSlug: 'starter' | 'entreprise' | 'multisecteur_2' | 'multisecteur_3' | 'multisecteur_pro' =
    rawPlan === 'starter'
      ? 'starter'
      : cleanCurrent.length === 2
      ? 'multisecteur_2'
      : cleanCurrent.length === 3
      ? 'multisecteur_3'
      : cleanCurrent.length > 3
      ? 'multisecteur_pro'
      : 'entreprise'

  const initialSectors = cleanCurrent.length > 0 ? cleanCurrent.slice(0, 3) : ['boutique']
  const addedSectors = cleanCurrent.length > 3 ? cleanCurrent.slice(3) : []
  const sectorsMeta: Record<string, SectorSubscriptionMeta> = {}
  const addedPlans: Record<string, 'starter' | 'entreprise'> = {}

  initialSectors.forEach((slug, idx) => {
    const isFree = idx < MAX_FREE_TRIAL_SECTORS
    sectorsMeta[slug] = {
      sector_slug: slug,
      is_initial_sector: true,
      plan_tier: initialPlanSlug === 'starter' ? 'starter' : 'entreprise',
      is_gratuit: isFree,
      date_debut_gratuit: isFree ? createdDate.toISOString() : null,
      date_fin_gratuit: isFree ? trialEnd.toISOString() : null,
      date_ajout: createdDate.toISOString(),
      date_debut_validite: isFree ? createdDate.toISOString() : null,
      date_fin_validite: isFree ? trialEnd.toISOString() : null,
    }
  })

  addedSectors.forEach((slug) => {
    sectorsMeta[slug] = {
      sector_slug: slug,
      is_initial_sector: false,
      plan_tier: 'entreprise',
      is_gratuit: false,
      date_debut_gratuit: null,
      date_fin_gratuit: null,
      date_ajout: now.toISOString(),
      date_debut_validite: null,
      date_fin_validite: null,
    }
    addedPlans[slug] = 'entreprise'
  })

  const newMeta: CompanySubscriptionMeta = {
    initial_plan: initialPlanSlug,
    initial_sectors: initialSectors,
    sectors_meta: sectorsMeta,
    added_sectors: addedSectors,
    added_sectors_plans: addedPlans,
  }

  await saveCompanySubscriptionMeta(companyId, newMeta)
  return newMeta
}

/**
 * Sauvegarde consolidée des métadonnées d'abonnement
 */
export async function saveCompanySubscriptionMeta(
  companyId: string,
  meta: CompanySubscriptionMeta
): Promise<void> {
  if (!companyId) return
  try {
    await supabase
      .from('companies')
      .update({
        activity_sectors: meta as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)

    for (const [slug, sMeta] of Object.entries(meta.sectors_meta || {})) {
      try {
        await supabase
          .from('company_activities')
          .update({
            settings: sMeta as any,
            updated_at: new Date().toISOString(),
          })
          .eq('company_id', companyId)
          .eq('sector_slug', slug)
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[abonnementService] Notice saveCompanySubscriptionMeta:', err)
  }
}

/**
 * Met à jour le plan d'un secteur supplémentaire sans modifier le plan des secteurs existants (Section 5)
 */
export async function updateAddedSectorPlan(
  companyId: string,
  sectorSlug: string,
  planTier: 'starter' | 'entreprise'
): Promise<{ success: boolean; meta?: CompanySubscriptionMeta; error?: string }> {
  if (!companyId || !sectorSlug) return { success: false, error: 'Paramètres manquants' }
  const cleanSlug = canonicalSectorSlug(sectorSlug)

  try {
    const meta = await getCompanySubscriptionMeta(companyId, [cleanSlug])
    const isInitial = Array.isArray(meta?.initial_sectors) && meta.initial_sectors.includes(cleanSlug)

    if (!Array.isArray(meta.added_sectors)) {
      meta.added_sectors = []
    }
    if (!meta.added_sectors_plans) {
      meta.added_sectors_plans = {}
    }

    if (!isInitial && !meta.added_sectors.includes(cleanSlug)) {
      meta.added_sectors.push(cleanSlug)
    }
    meta.added_sectors_plans[cleanSlug] = planTier

    if (meta.sectors_meta[cleanSlug]) {
      meta.sectors_meta[cleanSlug].plan_tier = planTier
    } else {
      meta.sectors_meta[cleanSlug] = {
        sector_slug: cleanSlug,
        is_initial_sector: isInitial,
        plan_tier: planTier,
        is_gratuit: false,
        date_debut_gratuit: null,
        date_fin_gratuit: null,
        date_ajout: new Date().toISOString(),
        date_debut_validite: null,
        date_fin_validite: null,
      }
    }

    await saveCompanySubscriptionMeta(companyId, meta)
    return { success: true, meta }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur lors de la mise à jour du plan.' }
  }
}

/**
 * 1. S'assure que l'entreprise possède une ligne dans `abonnements_global`
 *    et synchronise les statuts expirés.
 */
export async function verifierOuCreerAbonnementGlobal(
  entrepriseId: string,
  companyCreatedAt?: string
): Promise<AbonnementGlobalRow | null> {
  if (!entrepriseId) return null

  try {
    try {
      await supabase.rpc('fn_sync_abonnements_secteurs_fin_essai')
    } catch (_) {}

    // Vérifier l'état officiel de l'entreprise
    let comp: any = null
    try {
      const { data } = await supabase
        .from('companies')
        .select('subscription_status, subscription_expires_at, is_active, created_at')
        .eq('id', entrepriseId)
        .maybeSingle()
      comp = data
    } catch (_) {}

    const now = new Date()
    const compExpiresAt = comp?.subscription_expires_at ? new Date(comp.subscription_expires_at) : null
    const isCompanyActive = comp?.subscription_status === 'active' && (!compExpiresAt || compExpiresAt >= now)

    const { data: existing, error } = await supabase
      .from('abonnements_global')
      .select('*')
      .eq('entreprise_id', entrepriseId)
      .maybeSingle()

    if (!error && existing) {
      const fin = new Date(existing.date_fin_global)

      // Si l'entreprise a un abonnement actif, l'abonnement global DOIT être actif et refléter la durée réelle
      if (isCompanyActive) {
        const finalFin = compExpiresAt && compExpiresAt > fin ? compExpiresAt : (fin >= now ? fin : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
        if (existing.statut_global !== 'actif' || existing.date_fin_global !== finalFin.toISOString()) {
          const { data: updated } = await supabase
            .from('abonnements_global')
            .update({
              statut_global: 'actif',
              date_fin_global: finalFin.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .maybeSingle()
          return (updated || { ...existing, statut_global: 'actif', date_fin_global: finalFin.toISOString() }) as AbonnementGlobalRow
        }
        return existing as AbonnementGlobalRow
      }

      if (fin < now && (existing.statut_global === 'essai' || existing.statut_global === 'actif')) {
        const { data: updated } = await supabase
          .from('abonnements_global')
          .update({ statut_global: 'expire', updated_at: now.toISOString() })
          .eq('id', existing.id)
          .select()
          .maybeSingle()
        return (updated || { ...existing, statut_global: 'expire' }) as AbonnementGlobalRow
      }
      return existing as AbonnementGlobalRow
    }

    // Créer l'abonnement global (essai ou actif selon l'état de l'entreprise)
    const debut = comp?.created_at ? new Date(comp.created_at) : (companyCreatedAt ? new Date(companyCreatedAt) : now)
    const fin = isCompanyActive
      ? (compExpiresAt || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
      : new Date(debut.getTime() + 30 * 24 * 60 * 60 * 1000)
    const statut: StatutGlobal = isCompanyActive ? 'actif' : (fin < now ? 'expire' : 'essai')

    const { data: inserted } = await supabase
      .from('abonnements_global')
      .upsert(
        {
          entreprise_id: entrepriseId,
          date_debut_global: debut.toISOString(),
          date_fin_global: fin.toISOString(),
          statut_global: statut,
          plan_code: 'entreprise',
          montant_mensuel_fcfa: 10000,
        },
        { onConflict: 'entreprise_id' }
      )
      .select()
      .maybeSingle()

    if (inserted) return inserted as AbonnementGlobalRow

    return {
      id: `local-${entrepriseId}`,
      entreprise_id: entrepriseId,
      date_debut_global: debut.toISOString(),
      date_fin_global: fin.toISOString(),
      statut_global: statut,
      plan_code: 'entreprise',
      montant_mensuel_fcfa: 10000,
    }
  } catch (err) {
    console.warn('[abonnementService] Fallback mémoire global:', err)
    const debut = companyCreatedAt ? new Date(companyCreatedAt) : new Date()
    const fin = new Date(debut.getTime() + 30 * 24 * 60 * 60 * 1000)
    return {
      id: `local-${entrepriseId}`,
      entreprise_id: entrepriseId,
      date_debut_global: debut.toISOString(),
      date_fin_global: fin.toISOString(),
      statut_global: fin < new Date() ? 'expire' : 'essai',
      plan_code: 'entreprise',
      montant_mensuel_fcfa: 10000,
    }
  }
}

/**
 * 2. Initialise les secteurs d'activité lors de l'inscription initiale (Sections 2 & 3 du CDC) :
 *    - Les 3 premiers secteurs choisis bénéficient chacun d'un mois d'utilisation gratuit.
 *    - Tout secteur au-delà du 3e (à partir du 4e) est enregistré avec `statut_specifique = 'en_attente_paiement'`
 *      et `rattache_au_global = false` (facturé selon barème officiel : +5 000 FCFA / mois).
 *    - Le plan initial et la liste des secteurs initiaux sont enregistrés durablement en base de données.
 */
export async function initialiserSecteursInscription(
  entrepriseId: string,
  secteurSlugs: string[],
  dateDebut?: Date,
  dateFinEssai?: Date,
  initialPlan: 'starter' | 'entreprise' = 'entreprise'
): Promise<{ freeSectors: string[]; pendingPaymentSectors: string[] }> {
  const cleanSlugs = Array.from(
    new Set((secteurSlugs || []).map((s) => canonicalSectorSlug(s)).filter(Boolean))
  )
  if (!entrepriseId || cleanSlugs.length === 0) {
    return { freeSectors: [], pendingPaymentSectors: [] }
  }

  const now = dateDebut || new Date()
  const finEssai = dateFinEssai || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // S'assurer que l'abonnement global existe
  await verifierOuCreerAbonnementGlobal(entrepriseId, now.toISOString())

  const freeSectors = cleanSlugs.slice(0, MAX_FREE_TRIAL_SECTORS)
  const pendingPaymentSectors = cleanSlugs.slice(MAX_FREE_TRIAL_SECTORS)

  try {
    // 1. Insérer les secteurs couverts par le mois gratuit (max 3)
    for (const slug of freeSectors) {
      const code = toSecteurCode(slug)
      await supabase.from('abonnements_secteurs').upsert(
        {
          entreprise_id: entrepriseId,
          secteur_code: code,
          date_debut_specifique: now.toISOString(),
          date_fin_specifique: finEssai.toISOString(),
          statut_specifique: 'rattache_global',
          is_premiere_activation: false,
          rattache_au_global: true,
          updated_at: now.toISOString(),
        },
        { onConflict: 'entreprise_id,secteur_code' }
      )
    }

    // 2. Insérer les secteurs supplémentaires (> 3) en attente de paiement
    for (const slug of pendingPaymentSectors) {
      const code = toSecteurCode(slug)
      await supabase.from('abonnements_secteurs').upsert(
        {
          entreprise_id: entrepriseId,
          secteur_code: code,
          date_debut_specifique: null,
          date_fin_specifique: null,
          statut_specifique: 'en_attente_paiement',
          is_premiere_activation: false,
          rattache_au_global: false,
          updated_at: now.toISOString(),
        },
        { onConflict: 'entreprise_id,secteur_code' }
      )
    }

    // 3. Sauvegarder durablement la distinction des secteurs initiaux et le plan initial
    const sectorsMeta: Record<string, SectorSubscriptionMeta> = {}
    for (const slug of freeSectors) {
      sectorsMeta[slug] = {
        sector_slug: slug,
        is_initial_sector: true,
        plan_tier: cleanSlugs.length === 1 && initialPlan === 'starter' ? 'starter' : 'entreprise',
        is_gratuit: true,
        date_debut_gratuit: now.toISOString(),
        date_fin_gratuit: finEssai.toISOString(),
        date_ajout: now.toISOString(),
        date_debut_validite: now.toISOString(),
        date_fin_validite: finEssai.toISOString(),
      }
    }
    for (const slug of pendingPaymentSectors) {
      sectorsMeta[slug] = {
        sector_slug: slug,
        is_initial_sector: true,
        plan_tier: 'entreprise',
        is_gratuit: false,
        date_debut_gratuit: null,
        date_fin_gratuit: null,
        date_ajout: now.toISOString(),
        date_debut_validite: null,
        date_fin_validite: null,
      }
    }

    const initialPlanCode =
      cleanSlugs.length === 1
        ? initialPlan
        : cleanSlugs.length === 2
        ? 'multisecteur_2'
        : cleanSlugs.length === 3
        ? 'multisecteur_3'
        : 'multisecteur_pro'

    const compMeta: CompanySubscriptionMeta = {
      initial_plan: initialPlanCode as any,
      initial_sectors: cleanSlugs,
      sectors_meta: sectorsMeta,
    }
    await saveCompanySubscriptionMeta(entrepriseId, compMeta)
  } catch (err) {
    console.warn('[abonnementService] Erreur initialiserSecteursInscription:', err)
  }

  // Notification de début d'essai gratuit
  await emettreNotificationAbonnement({
    companyId: entrepriseId,
    notificationKey: `trial_start_${entrepriseId}`,
    type: 'trial_started',
    title: 'Bienvenue — 1 mois gratuit activé',
    message:
      pendingPaymentSectors.length > 0
        ? `Votre premier mois gratuit couvre vos ${freeSectors.length} premiers secteurs (${freeSectors.join(', ').toUpperCase()}). Les ${pendingPaymentSectors.length} secteur(s) supplémentaire(s) (${pendingPaymentSectors.join(', ').toUpperCase()}) sont en attente d'activation d'abonnement.`
        : `Votre premier mois gratuit est actif pour vos ${freeSectors.length} secteur(s) (${freeSectors.join(', ').toUpperCase()}) jusqu'au ${finEssai.toLocaleDateString('fr-FR')}.`,
  })

  return { freeSectors, pendingPaymentSectors }
}

/**
 * 3. Évalue le statut exact d'un secteur pour une entreprise (Sections 2, 3, 4, 7, 9 CDC).
 *    RÈGLES FONDAMENTALES :
 *    - Les secteurs initiaux sont distingués durablement des secteurs ajoutés après inscription.
 *    - Les 3 premiers secteurs initiaux bénéficient d'un mois gratuit.
 *    - À l'expiration de cette gratuité, le renouvellement est calculé selon le plan applicable.
 *    - Les secteurs ajoutés après inscription ne bénéficient pas de gratuité (statut en_attente_paiement).
 *    - Ne facture jamais un secteur bénéficiant encore de sa période gratuite.
 */
export async function evaluerAccesSecteur(
  entrepriseId: string,
  sectorSlug: string,
  companyCreatedAt?: string,
  isInitialSector: boolean = false
): Promise<VerificationAccesSecteurResult> {
  const cleanSlug = canonicalSectorSlug(sectorSlug)
  const code = toSecteurCode(cleanSlug)
  const globalSub = await verifierOuCreerAbonnementGlobal(entrepriseId, companyCreatedAt)
  const now = new Date()

  // Charger les métadonnées durables consolidées
  const meta = await getCompanySubscriptionMeta(entrepriseId, [cleanSlug], companyCreatedAt)
  const secMeta = meta.sectors_meta?.[cleanSlug]
  const isInitial = secMeta
    ? secMeta.is_initial_sector
    : (isInitialSector || (Array.isArray(meta?.initial_sectors) && meta.initial_sectors.includes(cleanSlug)))
  const isFreeEligible = secMeta
    ? secMeta.is_gratuit
    : isInitial && Array.isArray(meta?.initial_sectors) && meta.initial_sectors.indexOf(cleanSlug) >= 0 && meta.initial_sectors.indexOf(cleanSlug) < MAX_FREE_TRIAL_SECTORS
  const currentPlanTier: 'starter' | 'entreprise' = secMeta
    ? secMeta.plan_tier
    : isInitial && typeof meta?.initial_plan === 'string' && meta.initial_plan.includes('starter')
    ? 'starter'
    : 'entreprise'

  let secteurSub: AbonnementSecteurRow | null = null
  let allCompanySecteurs: AbonnementSecteurRow[] = []

  try {
    const { data: rows } = await supabase
      .from('abonnements_secteurs')
      .select('*')
      .eq('entreprise_id', entrepriseId)
      .order('created_at', { ascending: true })

    if (rows && rows.length > 0) {
      allCompanySecteurs = rows as AbonnementSecteurRow[]
      const matching = allCompanySecteurs.filter((r) => matchesSectorCode(r.secteur_code, cleanSlug))
      secteurSub = matching.find((r) => r.statut_specifique === 'actif' && (!r.date_fin_specifique || new Date(r.date_fin_specifique) >= now))
        || matching.find((r) => r.statut_specifique === 'actif')
        || matching.find((r) => r.statut_specifique === 'rattache_global')
        || matching[0]
        || null
    }
  } catch (_) {}

  // Si c'est un secteur initial qui n'avait pas encore sa ligne dans abonnements_secteurs
  if (!secteurSub && isInitial && globalSub) {
    const canAttachToTrial = isFreeEligible && globalSub.statut_global === 'essai'
    const initialStatut: StatutSpecifique = canAttachToTrial ? 'rattache_global' : 'en_attente_paiement'
    try {
      const { data: created } = await supabase
        .from('abonnements_secteurs')
        .upsert(
          {
            entreprise_id: entrepriseId,
            secteur_code: code,
            date_debut_specifique: canAttachToTrial ? globalSub.date_debut_global : null,
            date_fin_specifique: canAttachToTrial ? globalSub.date_fin_global : null,
            statut_specifique: initialStatut,
            is_premiere_activation: false,
            rattache_au_global: canAttachToTrial,
          },
          { onConflict: 'entreprise_id,secteur_code' }
        )
        .select()
        .maybeSingle()

      if (created) {
        secteurSub = created as AbonnementSecteurRow
        allCompanySecteurs.push(secteurSub)
      }
    } catch (_) {}
  }

  // CAS 0 : Compte suspendu par le Super Admin
  if (globalSub?.statut_global === 'suspendu' || secteurSub?.statut_specifique === 'suspendu') {
    return {
      autorise: false,
      ouvertureSecteurAutorisee: false,
      statutEffectif: 'suspendu',
      dateDebutEffective: null,
      dateFinEffective: null,
      joursRestants: 0,
      isPremiereActivationPossible: false,
      rattacheAuGlobal: false,
      badgeLabel: 'Suspendu',
      badgeColor: 'red',
      messageVerrouillage: 'Cet abonnement a été suspendu par l\'administration. Veuillez contacter le support ou régulariser votre abonnement.',
      globalSub,
      secteurSub,
      isInitialSector: isInitial,
      isGratuit: isFreeEligible,
      planTier: currentPlanTier,
    }
  }

  // CAS 1 : Le secteur n'a pas encore été ajouté au compte
  if (!secteurSub) {
    return {
      autorise: false,
      ouvertureSecteurAutorisee: false,
      statutEffectif: 'non_active',
      dateDebutEffective: null,
      dateFinEffective: null,
      joursRestants: 0,
      isPremiereActivationPossible: false,
      rattacheAuGlobal: false,
      badgeLabel: 'Non ajouté',
      badgeColor: 'slate',
      messageVerrouillage: 'Ce secteur n\'est pas encore ajouté à votre espace.',
      globalSub,
      secteurSub: null,
      isInitialSector: isInitial,
      isGratuit: isFreeEligible,
      planTier: currentPlanTier,
    }
  }

  // CAS 2 : Le secteur est explicitement en attente de paiement
  if (secteurSub.statut_specifique === 'en_attente_paiement') {
    return {
      autorise: false,
      ouvertureSecteurAutorisee: true,
      statutEffectif: 'en_attente_paiement',
      dateDebutEffective: null,
      dateFinEffective: null,
      joursRestants: 0,
      isPremiereActivationPossible: false,
      rattacheAuGlobal: false,
      badgeLabel: isInitial ? 'Secteur initial en attente' : 'Secteur supplémentaire à activer',
      badgeColor: 'amber',
      messageVerrouillage: isInitial
        ? 'Ce secteur d\'inscription nécessite un abonnement actif pour débloquer ses fonctionnalités.'
        : `Ce secteur supplémentaire est prêt. Formules disponibles : Starter (5 000 F CFA) ou 1 Secteur Complet (10 000 F CFA).`,
      globalSub,
      secteurSub,
      isInitialSector: isInitial,
      isGratuit: isFreeEligible,
      planTier: currentPlanTier,
    }
  }

  // CAS 3 : Le secteur possède un abonnement payant spécifique ('actif')
  if (secteurSub.statut_specifique === 'actif') {
    const finSpec = secteurSub.date_fin_specifique
      ? new Date(secteurSub.date_fin_specifique)
      : (globalSub?.date_fin_global ? new Date(globalSub.date_fin_global) : null)
    const debutSpec = secteurSub.date_debut_specifique
      ? new Date(secteurSub.date_debut_specifique)
      : (globalSub?.date_debut_global ? new Date(globalSub.date_debut_global) : now)
    const jours = finSpec ? computeDaysRemaining(finSpec, now) : (globalSub?.date_fin_global ? computeDaysRemaining(new Date(globalSub.date_fin_global), now) : 0)

    if (!finSpec || finSpec >= now) {
      return {
        autorise: true,
        ouvertureSecteurAutorisee: true,
        statutEffectif: 'actif',
        dateDebutEffective: debutSpec,
        dateFinEffective: finSpec,
        joursRestants: jours,
        isPremiereActivationPossible: false,
        rattacheAuGlobal: secteurSub.rattache_au_global,
        badgeLabel: `Abonnement actif – ${jours} jours restants`,
        badgeColor: 'emerald',
        globalSub,
        secteurSub,
        isInitialSector: isInitial,
        isGratuit: false,
        planTier: currentPlanTier,
      }
    } else {
      return {
        autorise: false,
        ouvertureSecteurAutorisee: true,
        statutEffectif: 'expire',
        dateDebutEffective: debutSpec,
        dateFinEffective: finSpec,
        joursRestants: 0,
        isPremiereActivationPossible: false,
        rattacheAuGlobal: secteurSub.rattache_au_global,
        badgeLabel: 'Abonnement expiré',
        badgeColor: 'red',
        messageVerrouillage:
          'L\'abonnement de ce secteur est arrivé à expiration. Veuillez renouveler votre abonnement pour débloquer les modules opérationnels.',
        globalSub,
        secteurSub,
        isInitialSector: isInitial,
        isGratuit: false,
        planTier: currentPlanTier,
      }
    }
  }

  // CAS 4 : Le secteur est rattaché à l'abonnement global
  const debutGlobal = globalSub ? new Date(globalSub.date_debut_global) : now
  const finGlobal = globalSub ? new Date(globalSub.date_fin_global) : now
  const joursGlobal = computeDaysRemaining(finGlobal, now)
  const isGlobalExpired = !globalSub || globalSub.statut_global === 'expire' || finGlobal < now

  // Si l'abonnement global est en mode 'essai' (1er mois gratuit pour les 3 premiers secteurs initiaux)
  if (globalSub?.statut_global === 'essai' && !isGlobalExpired) {
    if (isInitial && isFreeEligible) {
      return {
        autorise: true,
        ouvertureSecteurAutorisee: true,
        statutEffectif: 'essai_gratuit',
        dateDebutEffective: debutGlobal,
        dateFinEffective: finGlobal,
        joursRestants: joursGlobal,
        isPremiereActivationPossible: false,
        rattacheAuGlobal: true,
        badgeLabel: `Essai gratuit – ${joursGlobal} jours restants`,
        badgeColor: 'blue',
        globalSub,
        secteurSub,
        isInitialSector: true,
        isGratuit: true,
        planTier: currentPlanTier,
      }
    }

    return {
      autorise: false,
      ouvertureSecteurAutorisee: true,
      statutEffectif: 'en_attente_paiement',
      dateDebutEffective: null,
      dateFinEffective: null,
      joursRestants: 0,
      isPremiereActivationPossible: false,
      rattacheAuGlobal: false,
      badgeLabel: 'En attente de paiement',
      badgeColor: 'amber',
      messageVerrouillage:
        'Votre mois gratuit couvre déjà vos 3 premiers secteurs d\'activité. Pour utiliser ce secteur supplémentaire, veuillez activer son abonnement.',
      globalSub,
      secteurSub,
      isInitialSector: isInitial,
      isGratuit: false,
      planTier: currentPlanTier,
    }
  }

  // Si l'abonnement global est actif (payé) et non expiré
  if (globalSub?.statut_global === 'actif' && !isGlobalExpired) {
    return {
      autorise: true,
      ouvertureSecteurAutorisee: true,
      statutEffectif: 'actif',
      dateDebutEffective: debutGlobal,
      dateFinEffective: finGlobal,
      joursRestants: joursGlobal,
      isPremiereActivationPossible: false,
      rattacheAuGlobal: true,
      badgeLabel: `Actif — J-${joursGlobal}`,
      badgeColor: 'emerald',
      globalSub,
      secteurSub,
      isInitialSector: isInitial,
      isGratuit: false,
      planTier: currentPlanTier,
    }
  }

  // Sinon : période expirée
  return {
    autorise: false,
    ouvertureSecteurAutorisee: true,
    statutEffectif: 'expire',
    dateDebutEffective: debutGlobal,
    dateFinEffective: finGlobal,
    joursRestants: 0,
    isPremiereActivationPossible: false,
    rattacheAuGlobal: true,
    badgeLabel: 'Abonnement expiré',
    badgeColor: 'red',
    messageVerrouillage:
      'Votre période d\'essai ou d\'abonnement est arrivée à son terme. Veuillez renouveler votre abonnement pour accéder aux fonctionnalités de ce secteur.',
    globalSub,
    secteurSub,
    isInitialSector: isInitial,
    isGratuit: false,
    planTier: currentPlanTier,
  }
}

/**
 * 4. Ajoute un nouveau secteur au compte après l'inscription (Sections 2, 3, 5 du CDC) :
 *    - N'accorde JAMAIS de gratuité automatique.
 *    - Distingue durablement ce secteur comme secteur supplémentaire.
 *    - Permet de choisir Starter (5 000 F CFA) ou 1 Secteur Complet (10 000 F CFA).
 *    - Ne modifie JAMAIS le plan initial des secteurs existants.
 */
export async function ajouterSecteurAuCompte(
  entrepriseId: string,
  sectorSlug: string,
  companyName?: string,
  planTier: 'starter' | 'entreprise' = 'entreprise'
): Promise<{
  success: boolean
  statutEffectif: 'essai_gratuit' | 'en_attente_paiement' | 'actif'
  coveredByRemainingTrial: boolean
  message: string
  error?: string
}> {
  if (!entrepriseId || !sectorSlug) {
    return {
      success: false,
      statutEffectif: 'en_attente_paiement',
      coveredByRemainingTrial: false,
      message: 'Paramètres manquants.',
      error: 'Paramètres manquants.',
    }
  }

  const cleanSlug = canonicalSectorSlug(sectorSlug)
  const code = toSecteurCode(cleanSlug)
  const now = new Date()

  try {
    await verifierOuCreerAbonnementGlobal(entrepriseId)
    const { data: existingRows } = await supabase
      .from('abonnements_secteurs')
      .select('*')
      .eq('entreprise_id', entrepriseId)

    const allSecteurs = (existingRows || []) as AbonnementSecteurRow[]
    const alreadyExists = allSecteurs.find((r) => toSecteurCode(r.secteur_code) === code)

    const meta = await getCompanySubscriptionMeta(entrepriseId, [cleanSlug])
    const isInitial = Array.isArray(meta?.initial_sectors) && meta.initial_sectors.includes(cleanSlug)

    let targetStatut: StatutSpecifique = 'en_attente_paiement'
    let rattacheGlobal = false
    let dateDebutSpec: string | null = null
    let dateFinSpec: string | null = null

    if (
      alreadyExists &&
      alreadyExists.statut_specifique === 'actif' &&
      alreadyExists.date_fin_specifique &&
      new Date(alreadyExists.date_fin_specifique) > now
    ) {
      targetStatut = 'actif'
      rattacheGlobal = alreadyExists.rattache_au_global
      dateDebutSpec = alreadyExists.date_debut_specifique
      dateFinSpec = alreadyExists.date_fin_specifique
    } else {
      targetStatut = 'en_attente_paiement'
      rattacheGlobal = false
      dateDebutSpec = null
      dateFinSpec = null
    }

    // 1. Enregistrer dans abonnements_secteurs
    await supabase.from('abonnements_secteurs').upsert(
      {
        entreprise_id: entrepriseId,
        secteur_code: code,
        date_debut_specifique: dateDebutSpec,
        date_fin_specifique: dateFinSpec,
        statut_specifique: targetStatut,
        is_premiere_activation: false,
        rattache_au_global: rattacheGlobal,
        updated_at: now.toISOString(),
      },
      { onConflict: 'entreprise_id,secteur_code' }
    )

    // 2. Enregistrer durablement la métadonnée : secteur supplémentaire
    if (!meta.sectors_meta[cleanSlug]) {
      meta.sectors_meta[cleanSlug] = {
        sector_slug: cleanSlug,
        is_initial_sector: isInitial,
        plan_tier: planTier,
        is_gratuit: false,
        date_debut_gratuit: null,
        date_fin_gratuit: null,
        date_ajout: now.toISOString(),
        date_debut_validite: dateDebutSpec,
        date_fin_validite: dateFinSpec,
      }
    } else if (!isInitial) {
      meta.sectors_meta[cleanSlug].is_initial_sector = false
      meta.sectors_meta[cleanSlug].is_gratuit = false
      meta.sectors_meta[cleanSlug].plan_tier = planTier
    }
    await saveCompanySubscriptionMeta(entrepriseId, meta)

    // 3. Enregistrer dans company_activities pour l'affichage dans le Hub
    const { data: existingAct } = await supabase
      .from('company_activities')
      .select('id')
      .eq('company_id', entrepriseId)
      .eq('sector_slug', cleanSlug)
      .maybeSingle()

    if (!existingAct) {
      await supabase.from('company_activities').insert({
        company_id: entrepriseId,
        sector_slug: cleanSlug,
        sector_code: code,
        activity_name: `${companyName || 'Mon Entreprise'} — ${cleanSlug.toUpperCase()}`,
        status: targetStatut === 'en_attente_paiement' ? 'PENDING_PAYMENT' : 'ACTIVE',
        settings: meta.sectors_meta[cleanSlug] as any,
        is_active: true,
      })
    } else {
      await supabase
        .from('company_activities')
        .update({
          status: targetStatut === 'en_attente_paiement' ? 'PENDING_PAYMENT' : 'ACTIVE',
          settings: meta.sectors_meta[cleanSlug] as any,
          updated_at: now.toISOString(),
        })
        .eq('id', existingAct.id)
    }

    // 4. Mettre à jour selected_sectors dans `companies`
    const { data: comp } = await supabase
      .from('companies')
      .select('selected_sectors, sectors')
      .eq('id', entrepriseId)
      .maybeSingle()

    if (comp) {
      const currentSelected = Array.isArray(comp.selected_sectors) ? comp.selected_sectors : []
      const merged = Array.from(
        new Set([...currentSelected.map((s: string) => canonicalSectorSlug(s)), cleanSlug])
      )
      await supabase
        .from('companies')
        .update({
          selected_sectors: merged,
          sectors: merged,
          updated_at: now.toISOString(),
        })
        .eq('id', entrepriseId)
    }

    await emettreNotificationAbonnement({
      companyId: entrepriseId,
      sectorSlug: cleanSlug,
      notificationKey: `sector_added_pending_${entrepriseId}_${cleanSlug}`,
      type: 'sector_added',
      title: `Secteur ${cleanSlug.toUpperCase()} ajouté — En attente d'abonnement`,
      message: `Votre secteur ${cleanSlug.toUpperCase()} a été ajouté avec succès. Formules : Starter (5 000 F CFA) ou 1 Secteur Complet (10 000 F CFA).`,
    })

    return {
      success: true,
      statutEffectif: targetStatut === 'actif' ? 'actif' : 'en_attente_paiement',
      coveredByRemainingTrial: false,
      message:
        targetStatut === 'actif'
          ? `Le secteur ${cleanSlug.toUpperCase()} est actif.`
          : `Le secteur ${cleanSlug.toUpperCase()} a été ajouté avec succès. Formules : Starter (5 000 F CFA) ou 1 Secteur Complet (10 000 F CFA).`,
    }
  } catch (err: any) {
    return {
      success: false,
      statutEffectif: 'en_attente_paiement',
      coveredByRemainingTrial: false,
      message: err?.message || 'Erreur lors de l\'ajout du secteur.',
      error: err?.message,
    }
  }
}

/**
 * Alias rétro-compatible pour remplacer l'ancienne fonction `activerEssaiIndividuelSecteur`
 * (Section 3 : Suppression définitive de la première activation gratuite par secteur).
 */
export async function activerEssaiIndividuelSecteur(
  entrepriseId: string,
  sectorSlug: string
): Promise<{ success: boolean; error?: string; dateFin?: Date; statutEffectif?: string }> {
  const res = await ajouterSecteurAuCompte(entrepriseId, sectorSlug)
  return {
    success: res.success,
    error: res.error,
    statutEffectif: res.statutEffectif,
  }
}

/**
 * 5. Charge en une seule passe tous les statuts sectoriels d'une entreprise pour le Hub et le Super Admin
 */
export async function chargerTousStatutsSecteurs(
  entrepriseId: string,
  sectorSlugs: string[],
  companyCreatedAt?: string
): Promise<Record<string, VerificationAccesSecteurResult>> {
  const results: Record<string, VerificationAccesSecteurResult> = {}
  if (!entrepriseId) return results

  const globalSub = await verifierOuCreerAbonnementGlobal(entrepriseId, companyCreatedAt)
  let rows: AbonnementSecteurRow[] = []

  try {
    const { data } = await supabase
      .from('abonnements_secteurs')
      .select('*')
      .eq('entreprise_id', entrepriseId)
      .order('created_at', { ascending: true })
    rows = (data || []) as AbonnementSecteurRow[]
  } catch (_) {}

  // S'assurer que les secteurs déjà présents dans `sectorSlugs` ont une entrée dans `abonnements_secteurs`
  const cleanList = Array.from(new Set((sectorSlugs || []).map((s) => canonicalSectorSlug(s)).filter(Boolean)))
  for (let i = 0; i < cleanList.length; i++) {
    const slug = cleanList[i]
    const code = toSecteurCode(slug)
    const found = rows.find((r) => toSecteurCode(r.secteur_code) === code)
    if (!found && globalSub) {
      const trialCount = rows.filter(
        (r) => r.rattache_au_global && r.statut_specifique !== 'en_attente_paiement'
      ).length
      const canAttach =
        globalSub.statut_global === 'actif' ||
        (globalSub.statut_global === 'essai' && trialCount < MAX_FREE_TRIAL_SECTORS)
      const st: StatutSpecifique = canAttach ? 'rattache_global' : 'en_attente_paiement'

      try {
        const { data: created } = await supabase
          .from('abonnements_secteurs')
          .upsert(
            {
              entreprise_id: entrepriseId,
              secteur_code: code,
              date_debut_specifique: canAttach ? globalSub.date_debut_global : null,
              date_fin_specifique: canAttach ? globalSub.date_fin_global : null,
              statut_specifique: st,
              is_premiere_activation: false,
              rattache_au_global: canAttach,
            },
            { onConflict: 'entreprise_id,secteur_code' }
          )
          .select()
          .maybeSingle()
        if (created) rows.push(created as AbonnementSecteurRow)
      } catch (_) {}
    }
  }

  for (const slug of cleanList) {
    results[slug] = await evaluerAccesSecteur(entrepriseId, slug, companyCreatedAt, true)
  }

  return results
}

/**
 * 6. Active ou prolonge un abonnement (global ou sectoriel) avec calcul intelligent des dates (Section 5, 9, 10)
 *    - Si renouvelé AVANT expiration -> prolonge à partir de la date de fin existante (aucun jour perdu).
 *    - Si renouvelé APRÈS expiration (ou depuis 'en_attente_paiement') -> démarre à la date de validation.
 *    - Enregistre l'opération dans `subscription_history` et `admin_audit_logs`.
 */
export async function activerOuProlongerAbonnement(params: {
  entrepriseId: string
  companyName?: string
  sectorSlug?: string // 'all' ou slug spécifique
  dureeMois: number
  planCode?: string
  montantFcfa?: number
  modePaiement?: string
  referencePaiement?: string
  motif?: string
  performedBy?: string
  customStartDate?: string
  customEndDate?: string
}): Promise<{
  success: boolean
  dateDebut: Date
  dateFin: Date
  isExtensionBeforeExpiry: boolean
  preservedDays: number
  error?: string
}> {
  const {
    entrepriseId,
    companyName = '',
    sectorSlug = 'all',
    dureeMois = 1,
    planCode = 'entreprise',
    montantFcfa = 10000,
    modePaiement = 'manuel',
    referencePaiement = '',
    motif = 'Activation / renouvellement d\'abonnement',
    performedBy = 'Super Admin',
    customStartDate,
    customEndDate,
  } = params

  const now = new Date()
  const dur = Math.max(1, Math.floor(Number(dureeMois) || 1))
  const isGlobal = !sectorSlug || sectorSlug === 'all' || sectorSlug === 'global'

  try {
    const globalSub = await verifierOuCreerAbonnementGlobal(entrepriseId)
    let currentExpiresAt: string | null = null

    if (isGlobal) {
      if (globalSub && globalSub.statut_global === 'actif') {
        currentExpiresAt = globalSub.date_fin_global
      }
    } else {
      const code = toSecteurCode(sectorSlug)
      const { data: secRow } = await supabase
        .from('abonnements_secteurs')
        .select('*')
        .eq('entreprise_id', entrepriseId)
        .eq('secteur_code', code)
        .maybeSingle()

      if (secRow) {
        if (secRow.statut_specifique === 'actif' && secRow.date_fin_specifique) {
          currentExpiresAt = secRow.date_fin_specifique
        } else if (secRow.rattache_au_global && globalSub?.statut_global === 'actif') {
          currentExpiresAt = globalSub.date_fin_global
        }
      }
    }

    const renewalCalc = calculateRenewalDates(currentExpiresAt, dur, now)
    const finalStart = customStartDate ? new Date(customStartDate) : renewalCalc.effectiveStartDate
    const finalEnd = customEndDate ? new Date(customEndDate) : renewalCalc.newExpirationDate

    if (isGlobal) {
      // 1. Mettre à jour abonnements_global
      await supabase
        .from('abonnements_global')
        .upsert(
          {
            entreprise_id: entrepriseId,
            date_debut_global: finalStart.toISOString(),
            date_fin_global: finalEnd.toISOString(),
            statut_global: 'actif',
            plan_code: planCode,
            montant_mensuel_fcfa: Math.round(montantFcfa / dur),
            updated_at: now.toISOString(),
          },
          { onConflict: 'entreprise_id' }
        )

      // 2. Activer et rattacher tous les secteurs de l'entreprise au global
      await supabase
        .from('abonnements_secteurs')
        .update({
          statut_specifique: 'rattache_global',
          rattache_au_global: true,
          date_debut_specifique: finalStart.toISOString(),
          date_fin_specifique: finalEnd.toISOString(),
          is_premiere_activation: false,
          updated_at: now.toISOString(),
        })
        .eq('entreprise_id', entrepriseId)

      // 3. Mettre à jour companies
      await supabase
        .from('companies')
        .update({
          subscription_status: 'active',
          subscription_plan: planCode,
          plan: planCode,
          is_active: true,
          subscription_expires_at: finalEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', entrepriseId)
    } else {
      // Activation ou prolongation d'un secteur spécifique
      const cleanSlug = canonicalSectorSlug(sectorSlug)
      const code = toSecteurCode(cleanSlug)

      // Purge de tout doublon historique ou divergence de casse/tiret pour ce secteur
      try {
        const { data: allSecs } = await supabase
          .from('abonnements_secteurs')
          .select('id, secteur_code')
          .eq('entreprise_id', entrepriseId)
        if (allSecs && allSecs.length > 0) {
          const conflicting = allSecs.filter(
            (s) => matchesSectorCode(s.secteur_code, cleanSlug) && s.secteur_code !== code
          )
          for (const c of conflicting) {
            await supabase.from('abonnements_secteurs').delete().eq('id', c.id)
          }
        }
      } catch (_) {}

      // Enregistrement garanti dans abonnements_secteurs
      await supabase.from('abonnements_secteurs').upsert(
        {
          entreprise_id: entrepriseId,
          secteur_code: code,
          date_debut_specifique: finalStart.toISOString(),
          date_fin_specifique: finalEnd.toISOString(),
          statut_specifique: 'actif',
          is_premiere_activation: false,
          rattache_au_global: false,
          updated_at: now.toISOString(),
        },
        { onConflict: 'entreprise_id,secteur_code' }
      )

      // Garantir l'activité dans company_activities (upsert)
      try {
        const { data: existingAct } = await supabase
          .from('company_activities')
          .select('id')
          .eq('company_id', entrepriseId)
          .eq('sector_slug', cleanSlug)
          .maybeSingle()

        if (!existingAct) {
          await supabase.from('company_activities').insert({
            company_id: entrepriseId,
            sector_slug: cleanSlug,
            sector_code: code,
            activity_name: `${companyName || 'Mon Établissement'} — ${cleanSlug.toUpperCase()}`,
            status: 'ACTIVE',
            is_active: true,
            updated_at: now.toISOString(),
          })
        } else {
          await supabase
            .from('company_activities')
            .update({ status: 'ACTIVE', is_active: true, updated_at: now.toISOString() })
            .eq('id', existingAct.id)
        }
      } catch (_) {}

      // Synchroniser selected_sectors, metadata et subscription_status dans companies
      try {
        const { data: comp } = await supabase
          .from('companies')
          .select('id, selected_sectors, sectors, subscription_status, activity_sectors')
          .eq('id', entrepriseId)
          .maybeSingle()

        if (comp) {
          const rawSelected = Array.isArray(comp.selected_sectors) ? comp.selected_sectors : []
          const merged = Array.from(new Set([...rawSelected.map((s) => canonicalSectorSlug(s)), cleanSlug]))
          const currentMeta = (comp.activity_sectors && typeof comp.activity_sectors === 'object') ? comp.activity_sectors : {}
          const sMeta = currentMeta.sectors_meta?.[cleanSlug] || {}
          const updatedMeta = {
            ...currentMeta,
            sectors_meta: {
              ...(currentMeta.sectors_meta || {}),
              [cleanSlug]: {
                ...sMeta,
                sector_slug: cleanSlug,
                is_gratuit: false,
                date_debut_validite: finalStart.toISOString(),
                date_fin_validite: finalEnd.toISOString(),
                duree_mois: dur,
                montant_paye: montantFcfa,
              }
            }
          }

          await supabase
            .from('companies')
            .update({
              is_active: true,
              subscription_status: 'active',
              selected_sectors: merged,
              sectors: merged,
              activity_sectors: updatedMeta,
              updated_at: now.toISOString(),
            })
            .eq('id', entrepriseId)
        }
      } catch (_) {}
    }

    // 4. Enregistrer dans subscriptions
    try {
      await supabase.from('subscriptions').insert({
        company_id: entrepriseId,
        sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
        plan_slug: planCode,
        plan_name: isGlobal ? `Abonnement Global (${dur} mois)` : `Secteur ${sectorSlug.toUpperCase()} (${dur} mois)`,
        status: 'active',
        price_monthly: Math.round(montantFcfa / dur),
        started_at: finalStart.toISOString(),
        expires_at: finalEnd.toISOString(),
        last_payment_date: now.toISOString(),
        last_payment_amount: montantFcfa,
        last_payment_method: modePaiement,
        last_payment_reference: referencePaiement,
      })
    } catch (_) {}

    // 5. Enregistrer dans subscription_history
    try {
      await supabase.from('subscription_history').insert({
        company_id: entrepriseId,
        company_name: companyName || 'Entreprise',
        sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
        action: renewalCalc.isExtensionBeforeExpiry ? 'prolongation_abonnement' : 'activation_abonnement',
        plan_slug: planCode,
        duration_months: dur,
        old_expires_at: currentExpiresAt,
        new_expires_at: finalEnd.toISOString(),
        amount: montantFcfa,
        payment_method: modePaiement,
        payment_reference: referencePaiement,
        reason: motif,
        comment: JSON.stringify({
          sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
          duration_months: dur,
          is_extension: renewalCalc.isExtensionBeforeExpiry,
          preserved_days: renewalCalc.preservedDays,
          performed_by: performedBy,
        }),
        performed_by: performedBy,
      })
    } catch (_) {}

    // 6. Journal d'audit Super Admin (Section 5.3)
    try {
      await supabase.from('admin_audit_logs').insert({
        admin_username: performedBy,
        action: isGlobal ? 'ACTIVATION_ABONNEMENT_GLOBAL' : 'ACTIVATION_ABONNEMENT_SECTEUR',
        company_id: entrepriseId,
        company_name: companyName || 'Entreprise',
        sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
        result: 'success',
        details: {
          sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
          duration_months: dur,
          amount_fcfa: montantFcfa,
          payment_method: modePaiement,
          payment_reference: referencePaiement,
          old_expires_at: currentExpiresAt,
          new_started_at: finalStart.toISOString(),
          new_expires_at: finalEnd.toISOString(),
          motif,
          performed_by: performedBy,
          timestamp: now.toISOString(),
        },
      })
    } catch (_) {}

    // 7. Notification à l'utilisateur (Section 13)
    await emettreNotificationAbonnement({
      companyId: entrepriseId,
      sectorSlug: isGlobal ? undefined : canonicalSectorSlug(sectorSlug),
      notificationKey: `sub_activated_${entrepriseId}_${sectorSlug}_${finalEnd.toISOString().slice(0, 10)}`,
      type: 'subscription_activated',
      title: isGlobal
        ? `Abonnement global activé (${dur} mois)`
        : `Abonnement du secteur ${sectorSlug.toUpperCase()} activé (${dur} mois)`,
      message: `Votre abonnement est actif jusqu'au ${finalEnd.toLocaleDateString('fr-FR')}. Tous vos modules opérationnels sont débloqués.`,
    })

    return {
      success: true,
      dateDebut: finalStart,
      dateFin: finalEnd,
      isExtensionBeforeExpiry: renewalCalc.isExtensionBeforeExpiry,
      preservedDays: renewalCalc.preservedDays,
    }
  } catch (err: any) {
    return {
      success: false,
      dateDebut: now,
      dateFin: now,
      isExtensionBeforeExpiry: false,
      preservedDays: 0,
      error: err?.message || 'Erreur lors de l\'activation.',
    }
  }
}

/**
 * Compatibilité avec l'ancien appel `renouvelerAbonnementGlobal`
 */
export async function renouvelerAbonnementGlobal(
  entrepriseId: string,
  dureeMois: number,
  planCode: string,
  montantMensuelFcfa: number
): Promise<{ success: boolean; dateFin: Date; error?: string }> {
  const calc = calculateDurationPrice(montantMensuelFcfa, dureeMois)
  const res = await activerOuProlongerAbonnement({
    entrepriseId,
    sectorSlug: 'all',
    dureeMois,
    planCode,
    montantFcfa: calc.netTotal,
    modePaiement: 'manuel',
    motif: `Renouvellement global (${dureeMois} mois)`,
  })
  return {
    success: res.success,
    dateFin: res.dateFin,
    error: res.error,
  }
}

/**
 * Suspendre ou réactiver un secteur spécifique ou global depuis le Super Admin (Section 5.2)
 */
export async function modifierStatutAbonnementSecteur(params: {
  entrepriseId: string
  companyName?: string
  sectorSlug: string // 'all' ou slug spécifique
  nouveauStatut: 'actif' | 'en_attente_paiement' | 'expire' | 'suspendu'
  motif: string
  performedBy?: string
}): Promise<{ success: boolean; error?: string }> {
  const { entrepriseId, companyName = '', sectorSlug, nouveauStatut, motif, performedBy = 'Super Admin' } = params
  const now = new Date()
  const isGlobal = !sectorSlug || sectorSlug === 'all'

  try {
    if (isGlobal) {
      const globalStatutMap: Record<string, StatutGlobal> = {
        actif: 'actif',
        en_attente_paiement: 'en_attente_paiement',
        expire: 'expire',
        suspendu: 'suspendu',
      }
      await supabase
        .from('abonnements_global')
        .update({ statut_global: globalStatutMap[nouveauStatut] || 'expire', updated_at: now.toISOString() })
        .eq('entreprise_id', entrepriseId)

      const compStatusMap: Record<string, string> = {
        actif: 'active',
        en_attente_paiement: 'expired',
        expire: 'expired',
        suspendu: 'suspended',
      }
      await supabase
        .from('companies')
        .update({
          subscription_status: compStatusMap[nouveauStatut] || 'expired',
          is_active: nouveauStatut === 'actif',
          updated_at: now.toISOString(),
        })
        .eq('id', entrepriseId)
    } else {
      const code = toSecteurCode(sectorSlug)
      await supabase
        .from('abonnements_secteurs')
        .update({
          statut_specifique: nouveauStatut,
          rattache_au_global: false,
          updated_at: now.toISOString(),
        })
        .eq('entreprise_id', entrepriseId)
        .eq('secteur_code', code)
    }

    await supabase.from('admin_audit_logs').insert({
      admin_username: performedBy,
      action: 'MODIFICATION_STATUT_ABONNEMENT',
      company_id: entrepriseId,
      company_name: companyName,
      sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
      result: 'success',
      details: {
        sector_slug: isGlobal ? 'all' : canonicalSectorSlug(sectorSlug),
        nouveau_statut: nouveauStatut,
        motif,
        performed_by: performedBy,
        timestamp: now.toISOString(),
      },
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message }
  }
}

// =============================================================================
// SECTION 7 — CONFIGURATION & GESTION DU PAIEMENT MANUEL
// =============================================================================

/**
 * Récupère les paramètres de paiement manuel configurés par le Super Admin
 * (depuis `platform_payment_settings` ou `admin_audit_logs` + cache local)
 */
export async function getParametresPaiementManuel(): Promise<ParametresPaiementManuel> {
  // 1. Essayer depuis la table dédiée `platform_payment_settings`
  try {
    const { data, error } = await supabase
      .from('platform_payment_settings')
      .select('*')
      .eq('setting_key', 'default_manual_payment')
      .maybeSingle()

    if (!error && data) {
      const settings: ParametresPaiementManuel = {
        deposit_phone: data.deposit_phone || DEFAULT_MANUAL_PAYMENT_SETTINGS.deposit_phone,
        beneficiary_name: data.beneficiary_name || DEFAULT_MANUAL_PAYMENT_SETTINGS.beneficiary_name,
        payment_operator: data.payment_operator || DEFAULT_MANUAL_PAYMENT_SETTINGS.payment_operator,
        whatsapp_number: data.whatsapp_number || DEFAULT_MANUAL_PAYMENT_SETTINGS.whatsapp_number,
        payment_instructions: data.payment_instructions || DEFAULT_MANUAL_PAYMENT_SETTINGS.payment_instructions,
        automatic_payment_enabled: Boolean(data.automatic_payment_enabled),
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
        }
      } catch (_) {}
      return settings
    }
  } catch (_) {}

  // 2. Fallback sur la dernière configuration enregistrée dans `admin_audit_logs`
  try {
    const { data: logs } = await supabase
      .from('admin_audit_logs')
      .select('details, created_at, admin_username')
      .eq('action', 'CONFIG_PAIEMENT_MANUEL')
      .order('created_at', { ascending: false })
      .limit(1)

    if (logs && logs.length > 0 && logs[0].details) {
      const d = logs[0].details as any
      const settings: ParametresPaiementManuel = {
        deposit_phone: d.deposit_phone || DEFAULT_MANUAL_PAYMENT_SETTINGS.deposit_phone,
        beneficiary_name: d.beneficiary_name || DEFAULT_MANUAL_PAYMENT_SETTINGS.beneficiary_name,
        payment_operator: d.payment_operator || DEFAULT_MANUAL_PAYMENT_SETTINGS.payment_operator,
        whatsapp_number: d.whatsapp_number || DEFAULT_MANUAL_PAYMENT_SETTINGS.whatsapp_number,
        payment_instructions: d.payment_instructions || DEFAULT_MANUAL_PAYMENT_SETTINGS.payment_instructions,
        automatic_payment_enabled: Boolean(d.automatic_payment_enabled),
        updated_at: logs[0].created_at,
        updated_by: logs[0].admin_username,
      }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
        }
      } catch (_) {}
      return settings
    }
  } catch (_) {}

  // 3. Fallback localStorage ou valeurs par défaut
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (raw) {
        return { ...DEFAULT_MANUAL_PAYMENT_SETTINGS, ...JSON.parse(raw) }
      }
    }
  } catch (_) {}

  return DEFAULT_MANUAL_PAYMENT_SETTINGS
}

/**
 * Sauvegarde les paramètres de paiement manuel depuis le Super Admin (sans modifier le code)
 */
export async function sauvegarderParametresPaiementManuel(
  settings: ParametresPaiementManuel,
  adminUsername: string = 'Super Admin'
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString()
  const clean: ParametresPaiementManuel = {
    deposit_phone: (settings.deposit_phone || '').trim() || DEFAULT_MANUAL_PAYMENT_SETTINGS.deposit_phone,
    beneficiary_name: (settings.beneficiary_name || '').trim() || DEFAULT_MANUAL_PAYMENT_SETTINGS.beneficiary_name,
    payment_operator: (settings.payment_operator || '').trim() || DEFAULT_MANUAL_PAYMENT_SETTINGS.payment_operator,
    whatsapp_number: (settings.whatsapp_number || '').trim() || DEFAULT_MANUAL_PAYMENT_SETTINGS.whatsapp_number,
    payment_instructions:
      (settings.payment_instructions || '').trim() || DEFAULT_MANUAL_PAYMENT_SETTINGS.payment_instructions,
    automatic_payment_enabled: Boolean(settings.automatic_payment_enabled),
    updated_at: now,
    updated_by: adminUsername,
  }

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(clean))
    }
  } catch (_) {}

  // 1. Sauvegarder dans `platform_payment_settings` si la table est présente
  try {
    await supabase.from('platform_payment_settings').upsert(
      {
        setting_key: 'default_manual_payment',
        deposit_phone: clean.deposit_phone,
        beneficiary_name: clean.beneficiary_name,
        payment_operator: clean.payment_operator,
        whatsapp_number: clean.whatsapp_number,
        payment_instructions: clean.payment_instructions,
        automatic_payment_enabled: clean.automatic_payment_enabled,
        updated_by: adminUsername,
        updated_at: now,
      },
      { onConflict: 'setting_key' }
    )
  } catch (_) {}

  // 2. Sauvegarder systématiquement dans `admin_audit_logs` (persistance garantie sur Supabase)
  try {
    const { error } = await supabase.from('admin_audit_logs').insert({
      admin_username: adminUsername,
      action: 'CONFIG_PAIEMENT_MANUEL',
      result: 'success',
      details: clean,
    })
    if (error) return { success: false, error: error.message }
  } catch (err: any) {
    return { success: false, error: err?.message }
  }

  return { success: true }
}

/**
 * Soumet une demande de validation de paiement manuel par l'utilisateur (Section 7.2 & 7.3).
 * SÉCURITÉ :
 * - N'active JAMAIS l'abonnement automatiquement lors de l'envoi.
 * - Vérifie l'absence de doublon sur la référence de transaction ou l'empreinte de preuve.
 * - Enregistre la demande au statut `'en_attente'` (En attente de validation).
 */
export async function soumettreDemandePaiementManuel(params: {
  companyId: string
  companyName: string
  sectorSlug: string // 'all' ou slug spécifique
  sectorsCovered?: string[]
  planSlug: string
  durationMonths: number
  unitPriceMonthly: number
  discountAmount?: number
  totalAmount: number
  paymentOperator: string
  payerPhone: string
  transactionReference: string
  proofDataUrl?: string
  notes?: string
  expectedStartAt?: string
  expectedEndAt?: string
}): Promise<{
  success: boolean
  request?: DemandePaiementAbonnement
  error?: string
}> {
  const {
    companyId,
    companyName,
    sectorSlug = 'all',
    sectorsCovered = [],
    planSlug = 'entreprise',
    durationMonths = 1,
    unitPriceMonthly = 10000,
    discountAmount = 0,
    totalAmount,
    paymentOperator,
    payerPhone,
    transactionReference,
    proofDataUrl = '',
    notes = '',
    expectedStartAt,
    expectedEndAt,
  } = params

  if (!companyId) {
    return { success: false, error: 'Identifiant entreprise manquant.' }
  }
  if (!durationMonths || durationMonths < 1) {
    return { success: false, error: 'La durée choisie doit être d\'au moins 1 mois.' }
  }
  if (!totalAmount || totalAmount <= 0) {
    return { success: false, error: 'Le montant total à payer est invalide.' }
  }

  const cleanRef = (transactionReference || '').trim().toUpperCase()
  const cleanPhone = (payerPhone || '').trim()

  if (!cleanRef && !proofDataUrl) {
    return {
      success: false,
      error: 'Veuillez fournir la référence de la transaction Mobile Money ou joindre une capture de preuve de paiement.',
    }
  }

  // 1. Contrôle de sécurité anti-doublon (Section 7.3)
  const existingRequests = await listerDemandesPaiementManuel()
  if (cleanRef) {
    const duplicateRef = existingRequests.find(
      (r) =>
        r.transaction_reference &&
        r.transaction_reference.trim().toUpperCase() === cleanRef &&
        (r.status === 'valide' || r.status === 'en_attente')
    )
    if (duplicateRef) {
      return {
        success: false,
        error:
          duplicateRef.status === 'valide'
            ? `La référence de paiement « ${cleanRef} » a déjà été utilisée et validée. Une même preuve ne peut pas créditer plusieurs abonnements.`
            : `Une demande avec la référence « ${cleanRef} » est déjà en attente de vérification par l'administration.`,
      }
    }
  }

  const proofFingerprint = proofDataUrl ? `${proofDataUrl.length}:${proofDataUrl.slice(-80)}` : ''
  if (proofFingerprint) {
    const duplicateProof = existingRequests.find(
      (r) => r.proof_hash === proofFingerprint && (r.status === 'valide' || r.status === 'en_attente')
    )
    if (duplicateProof) {
      return {
        success: false,
        error: 'Cette capture de preuve de paiement a déjà été soumise ou validée.',
      }
    }
  }

  const now = new Date()
  const renewalDates = calculateRenewalDates(null, durationMonths, now)
  const startIso = expectedStartAt || renewalDates.effectiveStartDate.toISOString()
  const endIso = expectedEndAt || renewalDates.newExpirationDate.toISOString()

  const metadataPayload = {
    type: 'MANUAL_PAYMENT_REQUEST',
    status: 'en_attente' as const,
    sector_slug: sectorSlug === 'all' ? 'all' : canonicalSectorSlug(sectorSlug),
    sectors_covered: sectorsCovered,
    plan_slug: planSlug,
    duration_months: durationMonths,
    unit_price_monthly: unitPriceMonthly,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    payment_mode: 'manuel' as const,
    payment_operator: paymentOperator,
    payer_phone: cleanPhone,
    transaction_reference: cleanRef,
    proof_url: proofDataUrl,
    proof_hash: proofFingerprint,
    notes,
    expected_start_at: startIso,
    expected_end_at: endIso,
    created_at: now.toISOString(),
  }

  // 2. Insérer dans `demandes_paiement_abonnement` si la table est présente
  try {
    await supabase.from('demandes_paiement_abonnement').insert({
      company_id: companyId,
      company_name: companyName,
      sector_slug: metadataPayload.sector_slug,
      sectors_covered: sectorsCovered,
      plan_slug: planSlug,
      duration_months: durationMonths,
      unit_price_monthly: unitPriceMonthly,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      payment_mode: 'manuel',
      payment_operator: paymentOperator,
      payer_phone: cleanPhone,
      transaction_reference: cleanRef,
      proof_url: proofDataUrl,
      proof_hash: proofFingerprint,
      notes,
      status: 'en_attente',
      expected_start_at: startIso,
      expected_end_at: endIso,
    })
  } catch (_) {}

  // 3. Insérer dans `subscription_history` (persistance garantie sur Supabase)
  const { data: histRow, error: histErr } = await supabase
    .from('subscription_history')
    .insert({
      company_id: companyId,
      company_name: companyName,
      sector_slug: metadataPayload.sector_slug,
      action: 'demande_paiement_manuel',
      plan_slug: planSlug,
      duration_months: durationMonths,
      old_expires_at: startIso,
      new_expires_at: endIso,
      amount: totalAmount,
      payment_method: paymentOperator || 'manuel',
      payment_reference: cleanRef || `REQ-${now.getTime()}`,
      reason: `Demande de paiement manuel (${durationMonths} mois) — En attente de validation`,
      comment: JSON.stringify(metadataPayload),
      performed_by: companyName || 'Utilisateur',
    })
    .select()
    .single()

  if (histErr) {
    return { success: false, error: histErr.message }
  }

  // 4. Notification à l'utilisateur (Section 13)
  await emettreNotificationAbonnement({
    companyId,
    sectorSlug: metadataPayload.sector_slug === 'all' ? undefined : metadataPayload.sector_slug,
    notificationKey: `payment_req_${histRow.id}`,
    type: 'payment_submitted',
    title: 'Demande de paiement reçue — En attente de validation',
    message: `Votre demande de paiement manuel de ${totalAmount.toLocaleString('fr-FR')} FCFA (${durationMonths} mois) a bien été enregistrée. Votre abonnement sera activé dès validation du dépôt par l'administration.`,
  })

  const createdRequest: DemandePaiementAbonnement = {
    id: histRow.id,
    company_id: companyId,
    company_name: companyName,
    sector_slug: metadataPayload.sector_slug,
    sectors_covered: sectorsCovered,
    plan_slug: planSlug,
    duration_months: durationMonths,
    unit_price_monthly: unitPriceMonthly,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    payment_mode: 'manuel',
    payment_operator: paymentOperator,
    payer_phone: cleanPhone,
    transaction_reference: cleanRef || histRow.payment_reference,
    proof_url: proofDataUrl,
    proof_hash: proofFingerprint,
    notes,
    status: 'en_attente',
    expected_start_at: startIso,
    expected_end_at: endIso,
    created_at: histRow.created_at,
  }

  return { success: true, request: createdRequest }
}

/**
 * Liste toutes les demandes de paiement manuel (pour une entreprise ou pour le Super Admin)
 */
export async function listerDemandesPaiementManuel(filters?: {
  companyId?: string
  status?: 'en_attente' | 'valide' | 'rejete'
}): Promise<DemandePaiementAbonnement[]> {
  try {
    let query = supabase
      .from('subscription_history')
      .select('*')
      .in('action', ['demande_paiement_manuel', 'paiement_manuel_valide', 'paiement_manuel_rejete'])
      .order('created_at', { ascending: false })

    if (filters?.companyId) {
      query = query.eq('company_id', filters.companyId)
    }

    const { data, error } = await query
    if (error || !data) return []

    const parsed: DemandePaiementAbonnement[] = data.map((row: any) => {
      let meta: any = {}
      try {
        if (row.comment && row.comment.startsWith('{')) {
          meta = JSON.parse(row.comment)
        }
      } catch (_) {}

      const status: 'en_attente' | 'valide' | 'rejete' =
        row.action === 'paiement_manuel_valide' || meta.status === 'valide'
          ? 'valide'
          : row.action === 'paiement_manuel_rejete' || meta.status === 'rejete'
          ? 'rejete'
          : 'en_attente'

      return {
        id: row.id,
        company_id: row.company_id,
        company_name: row.company_name || 'Entreprise',
        sector_slug: row.sector_slug || meta.sector_slug || 'all',
        sectors_covered: Array.isArray(meta.sectors_covered) ? meta.sectors_covered : [],
        plan_slug: row.plan_slug || meta.plan_slug || 'entreprise',
        duration_months: Number(row.duration_months || meta.duration_months || 1),
        unit_price_monthly: Number(meta.unit_price_monthly || row.amount || 10000),
        discount_amount: Number(meta.discount_amount || 0),
        total_amount: Number(row.amount || meta.total_amount || 0),
        payment_mode: 'manuel',
        payment_operator: meta.payment_operator || row.payment_method || 'Mobile Money',
        payer_phone: meta.payer_phone || '',
        transaction_reference: row.payment_reference || meta.transaction_reference || '',
        proof_url: meta.proof_url || '',
        proof_hash: meta.proof_hash || '',
        notes: meta.notes || '',
        status,
        expected_start_at: meta.expected_start_at || row.old_expires_at || row.created_at,
        expected_end_at: meta.expected_end_at || row.new_expires_at || row.created_at,
        reviewed_by: meta.reviewed_by || null,
        reviewed_at: meta.reviewed_at || null,
        rejection_reason: meta.rejection_reason || null,
        created_at: row.created_at,
      }
    })

    if (filters?.status) {
      return parsed.filter((r) => r.status === filters.status)
    }
    return parsed
  } catch (_) {
    return []
  }
}

/**
 * Validation d'une demande de paiement manuel par le Super Admin (Section 7.2 & 7.3) :
 * - Vérifie que la demande n'a pas déjà été validée (anti-double validation).
 * - Active ou prolonge l'abonnement pour la durée choisie.
 * - Journalise l'opération et notifie l'utilisateur.
 */
export async function validerDemandePaiementManuel(
  requestId: string,
  adminUsername: string = 'Super Admin',
  adminComment: string = ''
): Promise<{ success: boolean; dateFin?: Date; error?: string }> {
  if (!requestId) return { success: false, error: 'Identifiant de demande manquant.' }

  try {
    const { data: row, error: fetchErr } = await supabase
      .from('subscription_history')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (fetchErr || !row) {
      return { success: false, error: 'Demande de paiement introuvable.' }
    }

    let meta: any = {}
    try {
      if (row.comment && row.comment.startsWith('{')) {
        meta = JSON.parse(row.comment)
      }
    } catch (_) {}

    if (row.action === 'paiement_manuel_valide' || meta.status === 'valide') {
      return {
        success: false,
        error: 'Cette demande de paiement a déjà été validée. Double validation interdite.',
      }
    }

    // Vérifier qu'aucune autre demande avec la même référence n'a déjà été validée
    const cleanRef = (row.payment_reference || meta.transaction_reference || '').trim().toUpperCase()
    if (cleanRef && !cleanRef.startsWith('REQ-')) {
      const allValidated = await listerDemandesPaiementManuel({ status: 'valide' })
      const alreadyUsed = allValidated.find(
        (r) => r.id !== requestId && r.transaction_reference.trim().toUpperCase() === cleanRef
      )
      if (alreadyUsed) {
        return {
          success: false,
          error: `La référence « ${cleanRef} » a déjà été validée sur une autre demande (${alreadyUsed.company_name}).`,
        }
      }
    }

    const now = new Date()
    const targetSector = row.sector_slug || meta.sector_slug || 'all'
    const durationMonths = Math.max(1, Number(row.duration_months || meta.duration_months || 1))
    const totalAmount = Number(row.amount || meta.total_amount || 10000)

    // Activer ou prolonger l'abonnement correspondant
    const activationRes = await activerOuProlongerAbonnement({
      entrepriseId: row.company_id,
      companyName: row.company_name,
      sectorSlug: targetSector,
      dureeMois: durationMonths,
      planCode: row.plan_slug || meta.plan_slug || 'entreprise',
      montantFcfa: totalAmount,
      modePaiement: meta.payment_operator || row.payment_method || 'manuel',
      referencePaiement: cleanRef,
      motif: `Validation de paiement manuel (${durationMonths} mois)${adminComment ? ` — ${adminComment}` : ''}`,
      performedBy: adminUsername,
    })

    if (!activationRes.success) {
      return { success: false, error: activationRes.error }
    }

    const updatedMeta = {
      ...meta,
      status: 'valide',
      reviewed_by: adminUsername,
      reviewed_at: now.toISOString(),
      admin_comment: adminComment,
      validated_start_at: activationRes.dateDebut.toISOString(),
      validated_end_at: activationRes.dateFin.toISOString(),
    }

    await supabase
      .from('subscription_history')
      .update({
        action: 'paiement_manuel_valide',
        new_expires_at: activationRes.dateFin.toISOString(),
        reason: `Paiement manuel validé par ${adminUsername}`,
        comment: JSON.stringify(updatedMeta),
        performed_by: adminUsername,
      })
      .eq('id', requestId)

    try {
      await supabase
        .from('demandes_paiement_abonnement')
        .update({
          status: 'valide',
          reviewed_by: adminUsername,
          reviewed_at: now.toISOString(),
          expected_end_at: activationRes.dateFin.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('company_id', row.company_id)
        .eq('transaction_reference', cleanRef)
    } catch (_) {}

    await emettreNotificationAbonnement({
      companyId: row.company_id,
      sectorSlug: targetSector === 'all' ? undefined : targetSector,
      notificationKey: `payment_validated_${requestId}`,
      type: 'payment_validated',
      title: 'Paiement validé — Abonnement activé',
      message: `Votre paiement de ${totalAmount.toLocaleString('fr-FR')} FCFA a été validé. Votre abonnement est actif jusqu'au ${activationRes.dateFin.toLocaleDateString('fr-FR')}.`,
    })

    return {
      success: true,
      dateFin: activationRes.dateFin,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur lors de la validation.' }
  }
}

/**
 * Rejet d'une demande de paiement manuel par le Super Admin (Section 7.2) :
 * - N'active PAS l'abonnement.
 * - Enregistre le motif du rejet et notifie l'utilisateur.
 */
export async function rejeterDemandePaiementManuel(
  requestId: string,
  rejectionReason: string,
  adminUsername: string = 'Super Admin'
): Promise<{ success: boolean; error?: string }> {
  if (!requestId) return { success: false, error: 'Identifiant de demande manquant.' }
  const cleanReason = (rejectionReason || '').trim()
  if (!cleanReason) {
    return { success: false, error: 'Veuillez indiquer le motif du rejet.' }
  }

  try {
    const { data: row, error: fetchErr } = await supabase
      .from('subscription_history')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (fetchErr || !row) {
      return { success: false, error: 'Demande de paiement introuvable.' }
    }

    let meta: any = {}
    try {
      if (row.comment && row.comment.startsWith('{')) {
        meta = JSON.parse(row.comment)
      }
    } catch (_) {}

    if (row.action === 'paiement_manuel_valide' || meta.status === 'valide') {
      return { success: false, error: 'Impossible de rejeter une demande déjà validée.' }
    }

    const now = new Date()
    const updatedMeta = {
      ...meta,
      status: 'rejete',
      reviewed_by: adminUsername,
      reviewed_at: now.toISOString(),
      rejection_reason: cleanReason,
    }

    await supabase
      .from('subscription_history')
      .update({
        action: 'paiement_manuel_rejete',
        reason: `Paiement rejeté : ${cleanReason}`,
        comment: JSON.stringify(updatedMeta),
        performed_by: adminUsername,
      })
      .eq('id', requestId)

    await supabase.from('admin_audit_logs').insert({
      admin_username: adminUsername,
      action: 'REJET_PAIEMENT_MANUEL',
      company_id: row.company_id,
      company_name: row.company_name,
      sector_slug: row.sector_slug || 'all',
      result: 'warning',
      details: {
        request_id: requestId,
        amount: row.amount,
        payment_reference: row.payment_reference,
        rejection_reason: cleanReason,
        timestamp: now.toISOString(),
      },
    })

    await emettreNotificationAbonnement({
      companyId: row.company_id,
      sectorSlug: row.sector_slug === 'all' ? undefined : row.sector_slug,
      notificationKey: `payment_rejected_${requestId}`,
      type: 'payment_rejected',
      title: 'Demande de paiement non validée',
      message: `Votre demande de paiement (${Number(row.amount || 0).toLocaleString('fr-FR')} FCFA) n'a pas pu être validée. Motif : ${cleanReason}.`,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur lors du rejet.' }
  }
}

// =============================================================================
// SECTION 13 — SYSTÈME DE NOTIFICATIONS D'ABONNEMENT (AVEC DÉDUPLICATION)
// =============================================================================

export async function emettreNotificationAbonnement(params: {
  companyId: string
  sectorSlug?: string
  notificationKey: string
  type: string
  title: string
  message: string
}): Promise<void> {
  const { companyId, sectorSlug, notificationKey, type, title, message } = params
  if (!companyId || !notificationKey) return

  // 1. Essayer dans `subscription_notifications` si la table est présente
  try {
    await supabase.from('subscription_notifications').upsert(
      {
        company_id: companyId,
        sector_slug: sectorSlug || null,
        notification_key: notificationKey,
        type,
        title,
        message,
        is_read: false,
      },
      { onConflict: 'company_id,notification_key' }
    )
  } catch (_) {}

  // 2. Persister avec déduplication dans `audit_logs` (table native Supabase)
  try {
    const { data: existing } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('company_id', companyId)
      .eq('action', 'SUBSCRIPTION_NOTIFICATION')
      .eq('entity_name', notificationKey)
      .maybeSingle()

    if (!existing) {
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        action: 'SUBSCRIPTION_NOTIFICATION',
        entity_name: notificationKey,
        details: {
          sector_slug: sectorSlug || null,
          type,
          title,
          message,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      })
    }
  } catch (_) {}
}

export async function listerNotificationsAbonnement(
  companyId: string
): Promise<SubscriptionNotificationItem[]> {
  if (!companyId) return []

  try {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('company_id', companyId)
      .eq('action', 'SUBSCRIPTION_NOTIFICATION')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!data) return []

    return data.map((row: any) => {
      const d = (row.details || {}) as any
      return {
        id: row.id,
        company_id: row.company_id,
        sector_slug: d.sector_slug || null,
        notification_key: row.entity_name || row.id,
        type: d.type || 'info',
        title: d.title || 'Notification Abonnement',
        message: d.message || '',
        is_read: Boolean(d.is_read),
        created_at: row.created_at,
      }
    })
  } catch (_) {
    return []
  }
}

export type AbonnementGlobal = AbonnementGlobalRow
export type AbonnementSecteur = AbonnementSecteurRow

export function calcDaysRemaining(dateStr?: string | Date | null): number {
  if (!dateStr) return 0
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  return computeDaysRemaining(d, new Date())
}

export function matchesSectorCode(secteurCode?: string | null, sectorSlug?: string | null): boolean {
  if (!secteurCode || !sectorSlug) return false
  return toSecteurCode(secteurCode) === toSecteurCode(sectorSlug)
}

export async function getAbonnementGlobal(
  companyId: string,
  company?: any
): Promise<AbonnementGlobalRow | null> {
  return verifierOuCreerAbonnementGlobal(companyId, company?.created_at)
}

export async function getAbonnementsSecteurs(
  companyId: string,
  company?: any
): Promise<AbonnementSecteurRow[]> {
  if (!companyId) return []
  const rawSectors: string[] = Array.isArray(company?.selected_sectors)
    ? company.selected_sectors
    : Array.isArray(company?.sectors)
    ? company.sectors
    : company?.active_sector
    ? [company.active_sector]
    : []

  if (rawSectors.length > 0) {
    await chargerTousStatutsSecteurs(companyId, rawSectors, company?.created_at)
  }

  try {
    const { data } = await supabase
      .from('abonnements_secteurs')
      .select('*')
      .eq('entreprise_id', companyId)
      .order('created_at', { ascending: true })

    const rows = (data || []) as AbonnementSecteurRow[]
    const now = new Date()
    const bySector = new Map<string, AbonnementSecteurRow>()

    for (const r of rows) {
      const code = toSecteurCode(r.secteur_code)
      const existing = bySector.get(code)
      if (!existing) {
        bySector.set(code, r)
      } else {
        const isRActive = r.statut_specifique === 'actif' && (!r.date_fin_specifique || new Date(r.date_fin_specifique) >= now)
        const isExistingActive = existing.statut_specifique === 'actif' && (!existing.date_fin_specifique || new Date(existing.date_fin_specifique) >= now)
        if (isRActive && !isExistingActive) {
          bySector.set(code, r)
        } else if (r.statut_specifique === 'actif' && existing.statut_specifique !== 'actif') {
          bySector.set(code, r)
        } else if (r.statut_specifique === 'rattache_global' && existing.statut_specifique === 'en_attente_paiement') {
          bySector.set(code, r)
        }
      }
    }
    // Si l'entreprise possède un abonnement actif en cours de validité :
    // Tout secteur appartenant à l'entreprise sans abonnement individuel actif
    // est automatiquement lié et activé avec la durée de l'abonnement entreprise.
    const compExpiresAt = company?.subscription_expires_at ? new Date(company.subscription_expires_at) : null
    const isCompanyActive = company?.subscription_status === 'active' && (!compExpiresAt || compExpiresAt >= now)

    if (isCompanyActive && rawSectors.length > 0) {
      const endIso = compExpiresAt && compExpiresAt >= now
        ? compExpiresAt.toISOString()
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const startIso = company?.created_at || now.toISOString()

      for (const s of rawSectors) {
        const code = toSecteurCode(s)
        const existing = bySector.get(code)
        if (!existing || existing.statut_specifique === 'expire' || existing.statut_specifique === 'rattache_global') {
          bySector.set(code, {
            id: existing?.id || `auto-${code}`,
            entreprise_id: companyId,
            secteur_code: code,
            date_debut_specifique: existing?.date_debut_specifique || startIso,
            date_fin_specifique: existing?.date_fin_specifique && new Date(existing.date_fin_specifique) >= now
              ? existing.date_fin_specifique
              : endIso,
            statut_specifique: 'actif',
            is_premiere_activation: false,
            rattache_au_global: true,
            created_at: existing?.created_at || startIso,
            updated_at: now.toISOString(),
          } as AbonnementSecteurRow)
        }
      }
    }

    if (rawSectors.length > 0) {
      const validCodes = new Set(rawSectors.map((s) => toSecteurCode(s)))
      return Array.from(bySector.values()).filter((item) => validCodes.has(toSecteurCode(item.secteur_code)))
    }
    return Array.from(bySector.values())
  } catch (_) {
    return []
  }
}

export async function marquerNotificationAbonnementLue(notificationId: string): Promise<void> {
  if (!notificationId) return
  try {
    const { data: row } = await supabase
      .from('audit_logs')
      .select('details')
      .eq('id', notificationId)
      .maybeSingle()

    if (row) {
      await supabase
        .from('audit_logs')
        .update({
          details: { ...(row.details || {}), is_read: true },
        })
        .eq('id', notificationId)
    }
  } catch (_) {}
}
