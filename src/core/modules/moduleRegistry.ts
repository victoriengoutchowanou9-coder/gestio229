// =============================================================================
// GESTIO 229 SaaS - Module Registry
// Registre central des modules et moteur de chargement dynamique
// =============================================================================

export interface SectorModuleConfig {
  id: string
  label: string
  icon: string
  path: string           // chemin relatif de navigation (ex: 'ventes', 'stock')
  isCommon: boolean      // true = disponible pour tous les secteurs
  defaultEnabled?: boolean
  sectorSlugs?: string[] // si !isCommon : liste des secteurs qui ont ce module
  group?: string         // groupe dans la nav : 'commercial' | 'gestion' | 'finance' | 'admin'
}

export interface NavItem {
  id: string
  label: string
  icon: string
  href: string
  badge?: string | number
  group?: string
  subItems?: NavItem[]
}

// =============================================================================
// REGISTRE CENTRAL DES MODULES
// =============================================================================

export const MODULE_REGISTRY: Record<string, SectorModuleConfig> = {

  // ══════════════════════════════════════════════════════════════════════
  // MODULES COMMUNS (activables dans tout secteur)
  // ══════════════════════════════════════════════════════════════════════

  'ventes': {
    id: 'ventes',
    label: 'Ventes & Caisse POS',
    icon: 'ShoppingCart',
    path: 'ventes',
    isCommon: true,
    defaultEnabled: true,
    group: 'commercial',
  },

  'stock': {
    id: 'stock',
    label: 'Stock & Inventaire',
    icon: 'Package',
    path: 'stock',
    isCommon: true,
    defaultEnabled: true,
    group: 'gestion',
  },

  'finances': {
    id: 'finances',
    label: 'Trésorerie & Caisses',
    icon: 'Landmark',
    path: 'finances',
    isCommon: true,
    defaultEnabled: true,
    group: 'finance',
  },

  'clients': {
    id: 'clients',
    label: 'Clients & Créances',
    icon: 'Users',
    path: 'clients',
    isCommon: true,
    defaultEnabled: true,
    group: 'commercial',
  },

  'fournisseurs': {
    id: 'fournisseurs',
    label: 'Fournisseurs & Achats',
    icon: 'Truck',
    path: 'fournisseurs',
    isCommon: true,
    defaultEnabled: true,
    group: 'gestion',
  },

  'rh': {
    id: 'rh',
    label: 'RH & Personnel',
    icon: 'UserCheck',
    path: 'rh',
    isCommon: true,
    defaultEnabled: false,
    group: 'admin',
  },

  'depenses': {
    id: 'depenses',
    label: 'Dépenses',
    icon: 'Receipt',
    path: 'depenses',
    isCommon: true,
    defaultEnabled: true,
    group: 'finance',
  },

  'rapports': {
    id: 'rapports',
    label: 'Rapports & Analyses',
    icon: 'BarChart3',
    path: 'rapports',
    isCommon: true,
    defaultEnabled: true,
    group: 'admin',
  },

  'audit': {
    id: 'audit',
    label: "Journal d'Audit",
    icon: 'ClipboardList',
    path: 'audit',
    isCommon: true,
    defaultEnabled: true,
    group: 'admin',
  },

  'equipe': {
    id: 'equipe',
    label: 'Équipe & Accès',
    icon: 'Shield',
    path: 'equipe',
    isCommon: true,
    defaultEnabled: true,
    group: 'admin',
  },

  'abonnement': {
    id: 'abonnement',
    label: 'Mon Abonnement',
    icon: 'CreditCard',
    path: 'abonnement',
    isCommon: true,
    defaultEnabled: true,
    group: 'admin',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — STATION-SERVICE
  // ══════════════════════════════════════════════════════════════════════

  'pompes_cuves': {
    id: 'pompes_cuves',
    label: 'Pompes & Cuves',
    icon: 'Fuel',
    path: 'pompes',
    isCommon: false,
    sectorSlugs: ['station-service'],
    group: 'gestion',
  },

  'postes_pompiste': {
    id: 'postes_pompiste',
    label: 'Postes Pompistes',
    icon: 'UserCog',
    path: 'postes',
    isCommon: false,
    sectorSlugs: ['station-service'],
    group: 'gestion',
  },

  'lubrifiants': {
    id: 'lubrifiants',
    label: 'Lubrifiants & Produits',
    icon: 'Droplets',
    path: 'lubrifiants',
    isCommon: false,
    sectorSlugs: ['station-service'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — PHARMACIE
  // ══════════════════════════════════════════════════════════════════════

  'ordonnances': {
    id: 'ordonnances',
    label: 'Ordonnances',
    icon: 'FileText',
    path: 'ordonnances',
    isCommon: false,
    sectorSlugs: ['pharmacie'],
    group: 'commercial',
  },

  'lots_peremption': {
    id: 'lots_peremption',
    label: 'Lots & Péremption',
    icon: 'AlertTriangle',
    path: 'lots',
    isCommon: false,
    sectorSlugs: ['pharmacie'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — ÉCOLE
  // ══════════════════════════════════════════════════════════════════════

  'eleves': {
    id: 'eleves',
    label: 'Élèves & Classes',
    icon: 'GraduationCap',
    path: 'eleves',
    isCommon: false,
    sectorSlugs: ['ecole'],
    group: 'gestion',
  },

  'frais_scolaires': {
    id: 'frais_scolaires',
    label: 'Frais Scolaires',
    icon: 'DollarSign',
    path: 'frais',
    isCommon: false,
    sectorSlugs: ['ecole'],
    group: 'finance',
  },

  'notes_resultats': {
    id: 'notes_resultats',
    label: 'Notes & Résultats',
    icon: 'BookOpen',
    path: 'notes',
    isCommon: false,
    sectorSlugs: ['ecole'],
    group: 'gestion',
  },

  'absences': {
    id: 'absences',
    label: 'Absences',
    icon: 'CalendarX',
    path: 'absences',
    isCommon: false,
    sectorSlugs: ['ecole'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — GESTION LOCATIVE
  // ══════════════════════════════════════════════════════════════════════

  'biens_locations': {
    id: 'biens_locations',
    label: 'Biens & Logements',
    icon: 'Home',
    path: 'biens',
    isCommon: false,
    sectorSlugs: ['location'],
    group: 'gestion',
  },

  'contrats_loyers': {
    id: 'contrats_loyers',
    label: 'Contrats & Loyers',
    icon: 'FileSignature',
    path: 'contrats',
    isCommon: false,
    sectorSlugs: ['location'],
    group: 'commercial',
  },

  'quittances': {
    id: 'quittances',
    label: 'Quittances',
    icon: 'FileCheck',
    path: 'quittances',
    isCommon: false,
    sectorSlugs: ['location'],
    group: 'finance',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — GARAGE
  // ══════════════════════════════════════════════════════════════════════

  'vehicules_reparations': {
    id: 'vehicules_reparations',
    label: 'Véhicules',
    icon: 'Car',
    path: 'vehicules',
    isCommon: false,
    sectorSlugs: ['garage', 'pieces-detachees'],
    group: 'gestion',
  },

  'ordres_reparation': {
    id: 'ordres_reparation',
    label: 'Ordres de Réparation',
    icon: 'Wrench',
    path: 'reparations',
    isCommon: false,
    sectorSlugs: ['garage'],
    group: 'commercial',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — HÔTEL
  // ══════════════════════════════════════════════════════════════════════

  'chambres_reservations': {
    id: 'chambres_reservations',
    label: 'Chambres & Réservations',
    icon: 'BedDouble',
    path: 'chambres',
    isCommon: false,
    sectorSlugs: ['hotel'],
    group: 'commercial',
  },

  'housekeeping': {
    id: 'housekeeping',
    label: 'Housekeeping',
    icon: 'Sparkles',
    path: 'housekeeping',
    isCommon: false,
    sectorSlugs: ['hotel'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — MICROFINANCE / TONTINE
  // ══════════════════════════════════════════════════════════════════════

  'membres_epargne': {
    id: 'membres_epargne',
    label: 'Membres & Épargne',
    icon: 'PiggyBank',
    path: 'membres',
    isCommon: false,
    sectorSlugs: ['microfinance', 'tontine'],
    group: 'commercial',
  },

  'credits': {
    id: 'credits',
    label: 'Crédits & Remboursements',
    icon: 'CreditCard',
    path: 'credits',
    isCommon: false,
    sectorSlugs: ['microfinance'],
    group: 'finance',
  },

  'agents_collecteurs': {
    id: 'agents_collecteurs',
    label: 'Agents & Commissions',
    icon: 'UserCheck',
    path: 'agents',
    isCommon: false,
    sectorSlugs: ['microfinance', 'tontine'],
    group: 'admin',
  },

  'tontine_cycles': {
    id: 'tontine_cycles',
    label: 'Cycles Tontine',
    icon: 'RefreshCw',
    path: 'cycles',
    isCommon: false,
    sectorSlugs: ['tontine'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — IMPRESSION
  // ══════════════════════════════════════════════════════════════════════

  'devis_production': {
    id: 'devis_production',
    label: 'Devis & Production',
    icon: 'Printer',
    path: 'devis',
    isCommon: false,
    sectorSlugs: ['impression'],
    group: 'commercial',
  },

  'sous_traitance': {
    id: 'sous_traitance',
    label: 'Sous-traitance',
    icon: 'GitFork',
    path: 'sous-traitance',
    isCommon: false,
    sectorSlugs: ['impression'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — POISSONNERIE & SURGELÉS
  // ══════════════════════════════════════════════════════════════════════

  'chambres_froides': {
    id: 'chambres_froides',
    label: 'Chambres Froides & T°',
    icon: 'Snowflake',
    path: 'chambres-froides',
    isCommon: false,
    sectorSlugs: ['poissonnerie'],
    group: 'gestion',
  },

  'pesee_cartons': {
    id: 'pesee_cartons',
    label: 'Pesée Kg & Cartons',
    icon: 'Scale',
    path: 'pesee',
    isCommon: false,
    sectorSlugs: ['poissonnerie'],
    group: 'commercial',
  },

  'avaries_peremption': {
    id: 'avaries_peremption',
    label: 'Avaries Frigorifiques',
    icon: 'AlertOctagon',
    path: 'avaries',
    isCommon: false,
    sectorSlugs: ['poissonnerie'],
    group: 'gestion',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — QUINCAILLERIE & MATÉRIAUX BTP
  // ══════════════════════════════════════════════════════════════════════

  'materiaux_btp': {
    id: 'materiaux_btp',
    label: 'Ciment & Fers à Béton',
    icon: 'Layers',
    path: 'materiaux',
    isCommon: false,
    sectorSlugs: ['quincaillerie'],
    group: 'commercial',
  },

  'conversions_unites': {
    id: 'conversions_unites',
    label: 'Unités & Tonnes',
    icon: 'Calculator',
    path: 'conversions',
    isCommon: false,
    sectorSlugs: ['quincaillerie'],
    group: 'gestion',
  },

  'suivi_chantiers': {
    id: 'suivi_chantiers',
    label: 'Chantiers & Camions',
    icon: 'Truck',
    path: 'chantiers',
    isCommon: false,
    sectorSlugs: ['quincaillerie'],
    group: 'commercial',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — ÉVÉNEMENTIEL
  // ══════════════════════════════════════════════════════════════════════

  'reservations_dates': {
    id: 'reservations_dates',
    label: 'Planning Dates & Salles',
    icon: 'Calendar',
    path: 'planning-evenements',
    isCommon: false,
    sectorSlugs: ['evenementiel'],
    group: 'commercial',
  },

  'location_materiel': {
    id: 'location_materiel',
    label: 'Bâches, Chaises & Sono',
    icon: 'Package',
    path: 'materiel',
    isCommon: false,
    sectorSlugs: ['evenementiel'],
    group: 'gestion',
  },

  'traiteur_prestations': {
    id: 'traiteur_prestations',
    label: 'Prestations Traiteur',
    icon: 'Utensils',
    path: 'traiteur',
    isCommon: false,
    sectorSlugs: ['evenementiel'],
    group: 'commercial',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — SUPERMARCHÉ
  // ══════════════════════════════════════════════════════════════════════

  'rayons_gondoles': {
    id: 'rayons_gondoles',
    label: 'Rayons & Gondoles',
    icon: 'Grid',
    path: 'rayons',
    isCommon: false,
    sectorSlugs: ['supermarche'],
    group: 'gestion',
  },

  'promos_dlc_courtes': {
    id: 'promos_dlc_courtes',
    label: 'Promos & DLC Courtes',
    icon: 'Tag',
    path: 'promos-dlc',
    isCommon: false,
    sectorSlugs: ['supermarche'],
    group: 'commercial',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MODULES SPÉCIFIQUES — BRASSERIE & DÉPÔT BOISSONS
  // ══════════════════════════════════════════════════════════════════════

  'consignation': {
    id: 'consignation',
    label: 'Consignation & Casiers',
    icon: 'Package2',
    path: 'consignation',
    isCommon: false,
    sectorSlugs: ['brasserie'],
    group: 'commercial',
  },

  'grilles_tarifaires': {
    id: 'grilles_tarifaires',
    label: 'Grilles Gros & Maquis',
    icon: 'Tag',
    path: 'grilles',
    isCommon: false,
    sectorSlugs: ['brasserie'],
    group: 'commercial',
  },
}



// =============================================================================
// MOTEUR DE RÉSOLUTION DES MODULES
// =============================================================================

/**
 * Résout les modules actifs pour un secteur donné.
 * Combine modules communs (depuis sectors.modules) et spécifiques (depuis sectors.specific_modules).
 *
 * @param sectorSlug - Slug du secteur (ex: 'pharmacie')
 * @param enabledModules - Liste des IDs de modules communs (depuis BDD)
 * @param specificModules - Liste des IDs de modules spécifiques (depuis BDD)
 * @returns Liste ordonnée des modules à afficher dans la nav
 */
export function resolveModulesForSector(
  sectorSlug: string,
  enabledModules: string[],
  specificModules: string[],
): SectorModuleConfig[] {
  const result: SectorModuleConfig[] = []
  const addedIds = new Set<string>()

  // 1. Modules communs dans l'ordre défini
  for (const moduleId of enabledModules) {
    const mod = MODULE_REGISTRY[moduleId]
    if (mod && mod.isCommon && !addedIds.has(moduleId)) {
      result.push(mod)
      addedIds.add(moduleId)
    }
  }

  // 2. Modules spécifiques du secteur
  for (const moduleId of specificModules) {
    const mod = MODULE_REGISTRY[moduleId]
    if (
      mod &&
      !mod.isCommon &&
      !addedIds.has(moduleId) &&
      (mod.sectorSlugs?.includes(sectorSlug) ?? false)
    ) {
      result.push(mod)
      addedIds.add(moduleId)
    }
  }

  return result
}

/**
 * Convertit une liste de SectorModuleConfig en NavItems avec le href complet.
 */
export function modulesToNavItems(
  sectorSlug: string,
  modules: SectorModuleConfig[],
): NavItem[] {
  return modules.map((mod) => ({
    id: mod.id,
    label: mod.label,
    icon: mod.icon,
    href: `/${sectorSlug}/${mod.path}`,
    group: mod.group,
  }))
}

/**
 * Groupe les NavItems par group pour l'affichage dans la sidebar.
 */
export function groupNavItems(
  items: NavItem[],
): Record<string, NavItem[]> {
  const groups: Record<string, NavItem[]> = {}
  for (const item of items) {
    const g = item.group || 'other'
    if (!groups[g]) groups[g] = []
    groups[g].push(item)
  }
  return groups
}

// Ordre d'affichage des groupes dans la sidebar
export const GROUP_ORDER = ['commercial', 'gestion', 'finance', 'admin']

export const GROUP_LABELS: Record<string, string> = {
  commercial: 'Commercial',
  gestion: 'Gestion',
  finance: 'Finance',
  admin: 'Administration',
}

// Catalogue exhaustif des 15+ Secteurs d'activité de GESTIO 229
export interface SectorDefinition {
  code: string
  slug: string
  name: string
  category: string
  emoji: string
  icon: string
  color: string
  badge: string
  description: string
}

export const ALL_SECTORS_CATALOG: SectorDefinition[] = [
  { code: 'POISSONNERIE', slug: 'poissonnerie', name: 'Poissonnerie & Surgelés', category: 'Alimentation & Frais', emoji: '🐟', icon: 'Fish', color: '#06b6d4', badge: 'Surgelés & Frais', description: 'Chambres froides (-18°C), pesée kg, cartons et alertes avaries.' },
  { code: 'QUINCAILLERIE', slug: 'quincaillerie', name: 'Quincaillerie & Matériaux BTP', category: 'BTP & Construction', emoji: '🔨', icon: 'Hammer', color: '#f59e0b', badge: 'Matériaux BTP', description: 'Ciment, fer à béton, facturation au mètre/tonne et suivi chantiers.' },
  { code: 'BOUTIQUE', slug: 'boutique', name: 'Boutique & Commerce général', category: 'Commerce Détail', emoji: '🏪', icon: 'Store', color: '#3b82f6', badge: 'Commerce Détail', description: 'Vente comptoir, variantes taille/couleur, remises et approvisionnement.' },
  { code: 'BRASSERIE', slug: 'brasserie', name: 'Brasserie & Dépôt Boissons', category: 'Boissons & Restauration', emoji: '🍾', icon: 'Wine', color: '#eab308', badge: 'Dépôt Boissons', description: 'Gestion des casiers pleins/vides Sobebra et consignes emballages.' },
  { code: 'STATION', slug: 'station', name: 'Station-Service & Hydrocarbures', category: 'Énergie & Carburants', emoji: '⛽', icon: 'Fuel', color: '#f97316', badge: 'Hydrocarbures', description: 'Jaugeage cuves (Super, Gazole), index pompes et quarts pompistes.' },
  { code: 'SUPERMARCHE', slug: 'supermarche', name: 'Supermarché & Supérette', category: 'Grande Distribution', emoji: '🛒', icon: 'ShoppingCart', color: '#10b981', badge: 'Grande Distribution', description: 'Code-barres POS rapide, têtes de gondoles et démarques DLC.' },
  { code: 'IMPRESSION', slug: 'impression', name: 'Imprimerie & Print', category: 'Industrie Graphique', emoji: '🖨️', icon: 'Printer', color: '#ec4899', badge: 'Imprimerie & Graphisme', description: 'Calculette BAT, formats et grammages papiers, suivi atelier.' },
  { code: 'EVENEMENTIEL', slug: 'evenementiel', name: 'Événementiel & Prestations', category: 'Services & Fêtes', emoji: '🎉', icon: 'PartyPopper', color: '#8b5cf6', badge: 'Prestations & Fêtes', description: 'Réservations dates, traiteur, location bâches/chaises et acomptes.' },
  { code: 'HOTEL', slug: 'hotel', name: 'Hôtel & Résidences Hôtelières', category: 'Hôtellerie', emoji: '🏨', icon: 'Building2', color: '#6366f1', badge: 'Hébergement', description: 'Planning chambres, nuitées, check-in/out et facturation séjour.' },
  { code: 'PHARMACIE', slug: 'pharmacie', name: 'Pharmacie & Parapharmacie', category: 'Santé', emoji: '💊', icon: 'Pill', color: '#14b8a6', badge: 'Santé & Médicaments', description: 'Ordonnances, numéros de lots, dates péremption et CAMU/UBIPHAR.' },
  { code: 'ECOLE', slug: 'ecole', name: 'École & Établissement Scolaire', category: 'Éducation', emoji: '🎓', icon: 'GraduationCap', color: '#3b82f6', badge: 'Éducation', description: 'Classes, inscriptions élèves, tranches scolarité et reçus.' },
  { code: 'GARAGE', slug: 'garage', name: 'Atelier Garage & Mécanique', category: 'Automobile', emoji: '🚗', icon: 'Wrench', color: '#64748b', badge: 'Mécanique Auto', description: 'Ordres de réparation OR, véhicules immatriculés et pièces détachées.' },
  { code: 'LOCATION', slug: 'location', name: 'Gestion de location & Immobilier', category: 'Immobilier', emoji: '🏠', icon: 'Home', color: '#a855f7', badge: 'Immobilier & Baux', description: 'Baux locatifs, états des lieux, quittances de loyer et impayés.' },
  { code: 'MICROFINANCE', slug: 'microfinance', name: 'Microfinance & Crédit', category: 'Services Financiers', emoji: '🏦', icon: 'Landmark', color: '#059669', badge: 'Finance Inclusive', description: 'Comptes épargne membres, demandes de crédit et échéanciers.' },
  { code: 'TONTINE', slug: 'tontine', name: 'Tontine & Épargne Journalière', category: 'Finance Populaire', emoji: '🔄', icon: 'Repeat', color: '#0284c7', badge: 'Tontine Traditionnelle', description: 'Cycles tontine, pointage journalier collecteurs et attributions.' },
]

