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
  calculateSubscriptionPrice,
  calculateDurationPrice,
  calculateRenewalDates,
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

    const { data: existing, error } = await supabase
      .from('abonnements_global')
      .select('*')
      .eq('entreprise_id', entrepriseId)
      .maybeSingle()

    if (!error && existing) {
      const now = new Date()
      const fin = new Date(existing.date_fin_global)
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

    // Créer l'abonnement global d'essai initial (30 jours uniques rattachés au compte)
    const debut = companyCreatedAt ? new Date(companyCreatedAt) : new Date()
    const fin = new Date(debut.getTime() + 30 * 24 * 60 * 60 * 1000)
    const statut: StatutGlobal = fin < new Date() ? 'expire' : 'essai'

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
 * 2. Initialise les secteurs lors de l'inscription (Section 1 & 2) :
 *    - Les 3 premiers secteurs au maximum sont couverts par l'essai gratuit de 30 jours ('rattache_global').
 *    - Tout secteur au-delà du 3e (à partir du 4e) est enregistré avec `statut_specifique = 'en_attente_paiement'`
 *      et `rattache_au_global = false` (non payé et inactif jusqu'à validation).
 */
export async function initialiserSecteursInscription(
  entrepriseId: string,
  secteurSlugs: string[],
  dateDebut?: Date,
  dateFinEssai?: Date
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
    // 1. Insérer les secteurs couverts par l'essai gratuit (max 3)
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
  } catch (err) {
    console.warn('[abonnementService] Erreur initialiserSecteursInscription:', err)
  }

  // Notification de début d'essai gratuit
  await emettreNotificationAbonnement({
    companyId: entrepriseId,
    notificationKey: `trial_start_${entrepriseId}`,
    type: 'trial_started',
    title: 'Bienvenue — Essai gratuit de 30 jours activé',
    message:
      pendingPaymentSectors.length > 0
        ? `Votre essai gratuit de 30 jours couvre vos ${freeSectors.length} premiers secteurs (${freeSectors.join(', ').toUpperCase()}). Les ${pendingPaymentSectors.length} secteur(s) supplémentaire(s) (${pendingPaymentSectors.join(', ').toUpperCase()}) sont en attente d'activation d'abonnement.`
        : `Votre essai gratuit de 30 jours est actif pour ${freeSectors.length} secteur(s) (${freeSectors.join(', ').toUpperCase()}) jusqu'au ${finEssai.toLocaleDateString('fr-FR')}.`,
  })

  return { freeSectors, pendingPaymentSectors }
}

/**
 * 3. Évalue le statut exact d'un secteur pour une entreprise (Section 1, 3, 4, 11, 12).
 *    RÈGLE FONDAMENTALE :
 *    - Aucun essai gratuit individuel par secteur n'est accordé (`isPremiereActivationPossible = false`).
 *    - Le secteur est actif (`autorise = true`) UNIQUEMENT si :
 *      a) Son statut spécifique est `'actif'` avec une date de fin non expirée, OU
 *      b) Il est rattaché à l'abonnement global (`rattache_au_global === true` et `statut_specifique !== 'en_attente_paiement'`)
 *         ET l'abonnement global est `'actif'` ou `'essai'` valide (dans la limite des 3 secteurs en mode essai).
 *    - Si le secteur est `'en_attente_paiement'` ou `'expire'`, `autorise = false`, mais `ouvertureSecteurAutorisee = true`
 *      pour permettre d'accéder au Tableau de bord et au module Abonnement (Section 4).
 */
export async function evaluerAccesSecteur(
  entrepriseId: string,
  sectorSlug: string,
  companyCreatedAt?: string,
  isInitialSector: boolean = false
): Promise<VerificationAccesSecteurResult> {
  const code = toSecteurCode(sectorSlug)
  const globalSub = await verifierOuCreerAbonnementGlobal(entrepriseId, companyCreatedAt)
  const now = new Date()

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
      secteurSub = allCompanySecteurs.find((r) => toSecteurCode(r.secteur_code) === code) || null
    }
  } catch (_) {}

  // Si c'est un secteur initial de l'entreprise qui n'avait pas encore sa ligne dans abonnements_secteurs
  if (!secteurSub && isInitialSector && globalSub) {
    const currentTrialCoveredCount = allCompanySecteurs.filter(
      (r) => r.rattache_au_global && r.statut_specifique !== 'en_attente_paiement'
    ).length

    const canAttachToTrial =
      globalSub.statut_global === 'actif' ||
      (globalSub.statut_global === 'essai' && currentTrialCoveredCount < MAX_FREE_TRIAL_SECTORS)

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
      badgeLabel: 'En attente de paiement',
      badgeColor: 'amber',
      messageVerrouillage:
        'Votre secteur a été ajouté avec succès. Pour accéder à l\'ensemble de ses fonctionnalités, veuillez activer votre abonnement.',
      globalSub,
      secteurSub,
    }
  }

  // CAS 3 : Le secteur possède un abonnement payant spécifique ('actif') non rattaché au global
  if (secteurSub.statut_specifique === 'actif' && !secteurSub.rattache_au_global && secteurSub.date_fin_specifique) {
    const debutSpec = secteurSub.date_debut_specifique ? new Date(secteurSub.date_debut_specifique) : now
    const finSpec = new Date(secteurSub.date_fin_specifique)
    const jours = computeDaysRemaining(finSpec, now)

    if (finSpec >= now) {
      return {
        autorise: true,
        ouvertureSecteurAutorisee: true,
        statutEffectif: 'actif',
        dateDebutEffective: debutSpec,
        dateFinEffective: finSpec,
        joursRestants: jours,
        isPremiereActivationPossible: false,
        rattacheAuGlobal: false,
        badgeLabel: 'Actif',
        badgeColor: 'emerald',
        globalSub,
        secteurSub,
      }
    } else {
      // Abonnement spécifique arrivé à échéance
      return {
        autorise: false,
        ouvertureSecteurAutorisee: true,
        statutEffectif: 'expire',
        dateDebutEffective: debutSpec,
        dateFinEffective: finSpec,
        joursRestants: 0,
        isPremiereActivationPossible: false,
        rattacheAuGlobal: false,
        badgeLabel: 'Abonnement expiré',
        badgeColor: 'red',
        messageVerrouillage:
          'L\'abonnement de ce secteur est arrivé à expiration. Veuillez renouveler votre abonnement pour débloquer les modules opérationnels.',
        globalSub,
        secteurSub,
      }
    }
  }

  // CAS 4 : Le secteur est rattaché à l'abonnement global (ou ancien 'essai_individuel' converti)
  const debutGlobal = globalSub ? new Date(globalSub.date_debut_global) : now
  const finGlobal = globalSub ? new Date(globalSub.date_fin_global) : now
  const joursGlobal = computeDaysRemaining(finGlobal, now)
  const isGlobalExpired = !globalSub || globalSub.statut_global === 'expire' || finGlobal < now

  // Vérifier la limite stricte des 3 secteurs gratuits si l'abonnement global est en mode 'essai'
  if (globalSub?.statut_global === 'essai' && !isGlobalExpired) {
    const trialRattaches = allCompanySecteurs.filter(
      (r) => r.rattache_au_global && r.statut_specifique !== 'en_attente_paiement'
    )
    const idxInTrial = trialRattaches.findIndex((r) => toSecteurCode(r.secteur_code) === code)

    if (idxInTrial >= MAX_FREE_TRIAL_SECTORS) {
      // Ce secteur dépasse la limite des 3 secteurs gratuits autorisés en essai
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
          'Votre essai gratuit couvre déjà 3 secteurs d\'activité. Pour utiliser ce secteur supplémentaire, veuillez activer son abonnement.',
        globalSub,
        secteurSub,
      }
    }

    return {
      autorise: true,
      ouvertureSecteurAutorisee: true,
      statutEffectif: 'essai_gratuit',
      dateDebutEffective: debutGlobal,
      dateFinEffective: finGlobal,
      joursRestants: joursGlobal,
      isPremiereActivationPossible: false,
      rattacheAuGlobal: true,
      badgeLabel: 'Essai gratuit',
      badgeColor: 'blue',
      globalSub,
      secteurSub,
    }
  }

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
      badgeLabel: 'Actif',
      badgeColor: 'emerald',
      globalSub,
      secteurSub,
    }
  }

  // Sinon : abonnement expiré
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
      'Votre période d\'essai ou d\'abonnement est arrivée à son terme. Veuillez activer votre abonnement pour accéder aux fonctionnalités de ce secteur.',
    globalSub,
    secteurSub,
  }
}

/**
 * 4. Ajoute un nouveau secteur au compte après l'inscription (Section 3 & 4) :
 *    - N'accorde JAMAIS un nouvel essai gratuit de 30 jours indépendant.
 *    - Si le compte est encore dans son essai gratuit initial valide ET possède strictement moins de 3 secteurs
 *      couverts par l'essai, ce secteur est couvert par les jours restants de l'essai initial du compte.
 *    - Dans tous les autres cas (déjà 3 secteurs en essai, ou essai expiré, ou ajout d'un secteur supplémentaire non payé),
 *      le secteur est créé avec le statut `'en_attente_paiement'` : l'utilisateur peut l'ouvrir (Tableau de bord + Abonnement),
 *      mais tous les modules opérationnels sont verrouillés jusqu'au paiement/validation.
 */
export async function ajouterSecteurAuCompte(
  entrepriseId: string,
  sectorSlug: string,
  companyName?: string
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
    const globalSub = await verifierOuCreerAbonnementGlobal(entrepriseId)
    const { data: existingRows } = await supabase
      .from('abonnements_secteurs')
      .select('*')
      .eq('entreprise_id', entrepriseId)

    const allSecteurs = (existingRows || []) as AbonnementSecteurRow[]
    const alreadyExists = allSecteurs.find((r) => toSecteurCode(r.secteur_code) === code)

    // Compter combien de secteurs bénéficient déjà de l'essai gratuit initial du compte
    const trialCoveredCount = allSecteurs.filter(
      (r) => r.rattache_au_global && r.statut_specifique !== 'en_attente_paiement'
    ).length

    const isInitialTrialStillValid =
      globalSub &&
      globalSub.statut_global === 'essai' &&
      new Date(globalSub.date_fin_global).getTime() > now.getTime()

    const canJoinInitialTrial = Boolean(
      isInitialTrialStillValid && trialCoveredCount < MAX_FREE_TRIAL_SECTORS
    )

    let targetStatut: StatutSpecifique = 'en_attente_paiement'
    let rattacheGlobal = false
    let dateDebutSpec: string | null = null
    let dateFinSpec: string | null = null

    if (alreadyExists && alreadyExists.statut_specifique === 'actif' && alreadyExists.date_fin_specifique && new Date(alreadyExists.date_fin_specifique) > now) {
      targetStatut = 'actif'
      rattacheGlobal = alreadyExists.rattache_au_global
      dateDebutSpec = alreadyExists.date_debut_specifique
      dateFinSpec = alreadyExists.date_fin_specifique
    } else if (canJoinInitialTrial && globalSub) {
      targetStatut = 'rattache_global'
      rattacheGlobal = true
      dateDebutSpec = now.toISOString()
      dateFinSpec = globalSub.date_fin_global
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

    // 2. Enregistrer dans company_activities pour l'affichage dans le Hub
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
        is_active: true,
      })
    }

    // 3. Mettre à jour la liste des secteurs de l'entreprise dans `companies`
    const { data: comp } = await supabase
      .from('companies')
      .select('selected_sectors, sectors, authorized_sectors')
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

    // 4. Émettre les notifications appropriées (Section 13)
    if (canJoinInitialTrial) {
      await emettreNotificationAbonnement({
        companyId: entrepriseId,
        sectorSlug: cleanSlug,
        notificationKey: `sector_added_trial_${entrepriseId}_${cleanSlug}`,
        type: 'sector_added',
        title: `Secteur ${cleanSlug.toUpperCase()} ajouté (Essai gratuit)`,
        message: `Le secteur ${cleanSlug.toUpperCase()} a été ajouté et bénéficie des jours restants de votre essai gratuit initial.`,
      })

      return {
        success: true,
        statutEffectif: 'essai_gratuit',
        coveredByRemainingTrial: true,
        message: `Le secteur ${cleanSlug.toUpperCase()} a été ajouté dans la limite de vos 3 secteurs d'essai gratuit.`,
      }
    }

    await emettreNotificationAbonnement({
      companyId: entrepriseId,
      sectorSlug: cleanSlug,
      notificationKey: `sector_added_pending_${entrepriseId}_${cleanSlug}`,
      type: 'sector_added',
      title: `Secteur ${cleanSlug.toUpperCase()} ajouté — En attente d'abonnement`,
      message: `Votre secteur ${cleanSlug.toUpperCase()} a été ajouté avec succès. Pour accéder à l'ensemble de ses fonctionnalités, veuillez activer votre abonnement.`,
    })

    return {
      success: true,
      statutEffectif: 'en_attente_paiement',
      coveredByRemainingTrial: false,
      message:
        'Votre secteur a été ajouté avec succès. Pour accéder à l\'ensemble de ses fonctionnalités, veuillez activer votre abonnement.',
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

      // Mettre à jour company_activities
      await supabase
        .from('company_activities')
        .update({ status: 'ACTIVE', is_active: true, updated_at: now.toISOString() })
        .eq('company_id', entrepriseId)
        .eq('sector_slug', cleanSlug)

      // S'assurer que l'entreprise n'est pas marquée 'expired' si au moins un secteur est actif
      await supabase
        .from('companies')
        .update({
          is_active: true,
          updated_at: now.toISOString(),
        })
        .eq('id', entrepriseId)
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
    return (data || []) as AbonnementSecteurRow[]
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
