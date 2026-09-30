// =============================================================================
// GESTIO 229 SaaS — Moteur Métier d'Abonnement, Tarification & Droits d'Accès
// =============================================================================
// Règles absolues du CDC GESTIO 229 :
// - Starter (5 000 FCFA/mois) : 1 activité, modules essentiels uniquement.
//   Exclus : Trésorerie, Reporting avancé, Inventaire physique avancé, Comptabilité SYSCOHADA.
// - Entreprise (10 000 FCFA/mois) : 1 activité, TOUS les modules inclus.
// - 2 Activités (15 000 FCFA/mois) : 2 activités, tous les modules.
// - 3 Activités (25 000 FCFA/mois) : 3 activités, tous les modules.
// - > 3 Activités : 25 000 FCFA + 5 000 FCFA par activité supplémentaire.
//   Formule : SI N > 3 ALORS 25 000 + ((N - 3) * 5 000)
// =============================================================================

export interface PlanConfig {
  slug: string
  name: string
  priceMonthly: number
  activityCount: number
  description: string
  isStarter: boolean
  isPopular?: boolean
  features: string[]
  accessibleModules: string[]
  lockedModules: string[]
}

// ─── Modules autorisés pour le plan Starter ──────────────────────────────────
export const STARTER_ACCESSIBLE_MODULES = [
  'dashboard',   // Tableau de bord
  'ventes',      // Vente & POS
  'stock',       // Stocks & Réserve basique
  'caisse',      // Caisse du jour
  'clients',     // Clients & Créances
  'depenses',    // Dépenses courantes
  'configuration',
  'utilisateurs',
  'audit',
  'abonnement',
]

// ─── Modules avancés (non inclus dans le Starter, inclus dès Entreprise) ─────
export const ADVANCED_MODULES = [
  'finances',    // Trésorerie, banques & liquidités
  'rapports',    // Reporting financier et analyses décisionnelles
  'syscohada',   // Comptabilité SYSCOHADA Révisé
  'inventaire',  // Inventaire physique avancé avec valorisation des écarts
]

export const ALL_STANDARD_MODULES = [
  ...STARTER_ACCESSIBLE_MODULES,
  ...ADVANCED_MODULES,
]

// ─── Formatage monétaire FCFA ────────────────────────────────────────────────
export const formatFCFA = (amount: number): string => {
  return new Intl.NumberFormat('fr-BJ', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount)) + ' FCFA'
}

// ─── Calculateur de Tarif Métier Centralisé (Anti-Triche Frontend) ─────────────
export function calculateSubscriptionPrice(
  activityCount: number,
  planChoice: 'starter' | 'entreprise' | 'auto' = 'auto'
): PlanConfig {
  const count = Math.max(1, Math.floor(activityCount || 1))

  // CAS 1 ACTIVITÉ : Deux options distinctes
  if (count === 1) {
    if (planChoice === 'starter') {
      return {
        slug: 'starter',
        name: 'Plan Starter',
        priceMonthly: 5000,
        activityCount: 1,
        description: "L'offre d'entrée essentielle pour les petites entreprises",
        isStarter: true,
        features: [
          '1 activité au choix',
          'Tableau de bord',
          'Vente & POS comptoir',
          'Gestion des stocks',
          'Caisse du jour',
          'Clients & Créances',
          'Saisie des dépenses',
          'Support WhatsApp standard'
        ],
        accessibleModules: STARTER_ACCESSIBLE_MODULES,
        lockedModules: ADVANCED_MODULES
      }
    }

    // Par défaut pour 1 activité : Plan Entreprise
    return {
      slug: 'entreprise',
      name: 'Plan Entreprise',
      priceMonthly: 10000,
      activityCount: 1,
      description: 'Accès complet à tous les modules opérationnels pour votre activité',
      isStarter: false,
      isPopular: true,
      features: [
        '1 activité au choix',
        'Tous les modules inclus',
        'Trésorerie & Banques',
        'Reporting & Analyses avancées',
        'Inventaire physique avec écarts',
        'Comptabilité SYSCOHADA Révisé',
        'Modules spécialisés du secteur',
        'Facturation certifiée e-MECeF'
      ],
      accessibleModules: ALL_STANDARD_MODULES,
      lockedModules: []
    }
  }

  // CAS 2 ACTIVITÉS : 15 000 FCFA
  if (count === 2) {
    return {
      slug: 'duo',
      name: 'Plan 2 Activités',
      priceMonthly: 15000,
      activityCount: 2,
      description: 'Deux secteurs d’activité avec accès complet et séparation stricte',
      isStarter: false,
      isPopular: true,
      features: [
        '2 activités au choix (ex: Quincaillerie + Poissonnerie)',
        'Tous les modules débloqués pour les 2 activités',
        'Comptabilité SYSCOHADA Révisé',
        'Trésorerie multi-secteurs',
        'Reporting consolidé et sectoriel',
        'Séparation stricte des données',
        'Accès au HUB central multi-activités'
      ],
      accessibleModules: ALL_STANDARD_MODULES,
      lockedModules: []
    }
  }

  // CAS 3 ACTIVITÉS : 25 000 FCFA
  if (count === 3) {
    return {
      slug: 'trio',
      name: 'Plan 3 Activités',
      priceMonthly: 25000,
      activityCount: 3,
      description: 'Trois secteurs d’activité avec accès illimité à tous les modules',
      isStarter: false,
      features: [
        '3 activités au choix',
        'Tous les modules débloqués pour les 3 activités',
        'Comptabilité SYSCOHADA Révisé',
        'Trésorerie & Caisse par secteur',
        'Reporting consolidé temps réel',
        'Gestion multi-activités avancée',
        'Support prioritaire VIP'
      ],
      accessibleModules: ALL_STANDARD_MODULES,
      lockedModules: []
    }
  }

  // CAS > 3 ACTIVITÉS : 25 000 + ((N - 3) * 5 000)
  const additional = count - 3
  const calculatedPrice = 25000 + (additional * 5000)

  return {
    slug: `multi_${count}`,
    name: `Plan ${count} Activités`,
    priceMonthly: calculatedPrice,
    activityCount: count,
    description: `Formule multi-secteurs (${count} activités) au tarif avantageux de +5 000 F/secteur au-delà de 3`,
    isStarter: false,
    features: [
      `${count} activités au choix`,
      'Tous les modules débloqués pour toutes les activités',
      'Comptabilité SYSCOHADA Révisé',
      'Trésorerie & Reporting consolidé',
      'Inventaires physiques par dépôt',
      'Multi-tenants & multi-secteurs illimités',
      'Accompagnement dédié et support 24/7'
    ],
    accessibleModules: ALL_STANDARD_MODULES,
    lockedModules: []
  }
}

// ─── Table des tarifs officiels ──────────────────────────────────────────────
export const OFFICIAL_PLANS: PlanConfig[] = [
  calculateSubscriptionPrice(1, 'starter'),
  calculateSubscriptionPrice(1, 'entreprise'),
  calculateSubscriptionPrice(2),
  calculateSubscriptionPrice(3),
]

// ─── Vérification des droits d'accès à un module ─────────────────────────────
export function checkModuleAccess(
  moduleId: string,
  company: {
    subscription_status?: string
    subscription_plan?: string
    plan?: string
    selected_sectors?: string[]
    sectors?: string[]
    created_at?: string
  } | null | undefined
): {
  allowed: boolean
  reason?: 'suspended' | 'expired' | 'starter_restriction' | 'sector_restriction'
  requiredPlan?: string
  message?: string
} {
  // L'accès au module d'abonnement est TOUJOURS autorisé afin de permettre le renouvellement
  if (moduleId === 'abonnement') {
    return { allowed: true }
  }

  if (!company) {
    return { allowed: false, reason: 'suspended', message: 'Entreprise non authentifiée.' }
  }

  const status = (company.subscription_status || 'trial').toLowerCase()
  const createdAt = company.created_at ? new Date(company.created_at) : new Date()
  const trialEndsAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const hasTrialExpired = status === 'trial' && now.getTime() > trialEndsAt.getTime()

  // 1. Compte expiré (soit statut 'expired' en base, soit 30 jours d'essai écoulés)
  if (status === 'expired' || hasTrialExpired) {
    return {
      allowed: false,
      reason: 'expired',
      message: "Votre période d'essai gratuit de 30 jours est arrivée à échéance. Veuillez activer votre abonnement pour continuer à utiliser ce module."
    }
  }

  // 2. Compte suspendu
  if (status === 'suspended') {
    return {
      allowed: false,
      reason: 'suspended',
      message: 'Votre compte est suspendu. Veuillez régulariser votre abonnement pour accéder à ce module.'
    }
  }

  // 3. Période d'essai active (<= 30 jours) :
  // RÈGLE D'OR : Accès 100% débloqué à TOUS les modules de TOUS les secteurs choisis !
  if (status === 'trial') {
    return { allowed: true }
  }

  // 4. Compte Actif avec Abonnement Payé :
  if (status === 'active') {
    const planSlug = (company.subscription_plan || company.plan || '').toLowerCase()
    const isStarter = planSlug === 'starter' || planSlug === 'solo'

    // Le plan Starter exclut les modules avancés
    if (isStarter && ADVANCED_MODULES.includes(moduleId)) {
      return {
        allowed: false,
        reason: 'starter_restriction',
        requiredPlan: 'Plan Entreprise (10 000 FCFA/mois)',
        message: 'Ce module est réservé au Plan Entreprise. Mettez à niveau votre abonnement pour y accéder.'
      }
    }

    return { allowed: true }
  }

  return { allowed: true }
}

// ─── Calculateur des informations d'Essai Gratuit ────────────────────────────
export interface TrialInfo {
  isTrial: boolean
  isActive: boolean
  isExpired: boolean
  isSuspended: boolean
  statusLabel: string
  startDate: string
  endDate: string
  daysRemaining: number
  planName: string
  planSlug: string
  activityCount: number
  futurePrice: number
}

export function getCompanySubscriptionInfo(company: any): TrialInfo {
  const status = (company?.subscription_status || 'trial').toLowerCase()
  const createdDate = company?.created_at ? new Date(company.created_at) : new Date()
  const trialEndsDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  const now = new Date()
  const diffTime = trialEndsDate.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))

  const hasTrialExpired = status === 'trial' && diffTime <= 0
  const isTrial = status === 'trial' && !hasTrialExpired
  const isActive = status === 'active'
  const isExpired = status === 'expired' || hasTrialExpired
  const isSuspended = status === 'suspended'

  const sectors = Array.isArray(company?.selected_sectors)
    ? company.selected_sectors
    : Array.isArray(company?.sectors)
    ? company.sectors
    : company?.active_sector
    ? [company.active_sector]
    : ['boutique']

  const count = Math.max(1, sectors.length)
  const planSlug = (company?.subscription_plan || company?.plan || (count > 1 ? 'duo' : 'entreprise')).toLowerCase()
  const planChoice = planSlug.includes('starter') ? 'starter' : 'entreprise'
  const resolvedPlan = calculateSubscriptionPrice(count, planChoice)

  let statusLabel = 'Essai gratuit'
  if (isActive) statusLabel = 'Actif'
  else if (isExpired) statusLabel = 'Expiré'
  else if (isSuspended) statusLabel = 'Suspendu'

  return {
    isTrial,
    isActive,
    isExpired,
    isSuspended,
    statusLabel,
    startDate: createdDate.toLocaleDateString('fr-BJ'),
    endDate: trialEndsDate.toLocaleDateString('fr-BJ'),
    daysRemaining,
    planName: resolvedPlan.name,
    planSlug: resolvedPlan.slug,
    activityCount: count,
    futurePrice: resolvedPlan.priceMonthly,
  }
}
