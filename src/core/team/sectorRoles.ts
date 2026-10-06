// =============================================================================
// GESTIO 229 SaaS — Référentiel des Rôles Métier par Secteur d'Activité
// =============================================================================
// Chaque secteur a des métiers spécifiques et des accès ciblés.
// =============================================================================

export interface SectorRoleDefinition {
  id: string
  label: string
  description: string
  defaultRoute: string // Module vers lequel rediriger lors du login
  defaultPermissions: {
    ventes: boolean
    caisse: boolean
    stock: boolean
    clients: boolean
    fournisseurs: boolean
    depenses: boolean
    reporting: boolean
    finances: boolean
    syscohada: boolean
    admin: boolean
  }
}

/**
 * Normalise un slug de secteur pour gérer tous les alias historiques et saisies
 */
export function normalizeSectorSlug(slug?: string | null): string {
  if (!slug) return 'boutique'
  const clean = String(slug).toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'station' || clean === 'stationservice') return 'station-service'
  if (clean === 'microfinance-tontine' || clean === 'tontine') return 'microfinance'
  if (clean === 'location' || clean === 'gestion-locative' || clean === 'gestion_locative') return 'immobilier'
  if (clean === 'agro-business' || clean === 'agro') return 'agrobusiness'
  if (clean === 'bar-restaurant-maquis' || clean === 'maquis' || clean === 'fast-food') return 'restaurant'
  if (clean === 'impression') return 'imprimerie'
  return clean
}

/**
 * Rôles transversaux généraux (disponibles en option dans tous les secteurs)
 */
export const COMMON_ROLES: SectorRoleDefinition[] = [
  {
    id: 'gerant_secteur',
    label: 'Responsable / Gérant de Secteur',
    description: 'Gestion intégrale des opérations du sous-logiciel',
    defaultRoute: 'tableau-bord',
    defaultPermissions: {
      ventes: true,
      caisse: true,
      stock: true,
      clients: true,
      fournisseurs: true,
      depenses: true,
      reporting: true,
      finances: true,
      syscohada: true,
      admin: false,
    },
  },
  {
    id: 'comptable',
    label: 'Comptable / Gestionnaire Financier',
    description: 'Comptabilité SYSCOHADA, trésorerie et dépenses',
    defaultRoute: 'syscohada',
    defaultPermissions: {
      ventes: false,
      caisse: true,
      stock: false,
      clients: true,
      fournisseurs: true,
      depenses: true,
      reporting: true,
      finances: true,
      syscohada: true,
      admin: false,
    },
  },
]

/**
 * Rôles spécialisés par secteur d'activité (19 secteurs)
 */
export const SECTOR_ROLES_CATALOG: Record<string, SectorRoleDefinition[]> = {
  // 1. MICROFINANCE & TONTINE
  microfinance: [
    {
      id: 'agent_credit',
      label: 'Agent de Crédit / Chargé de Prêt',
      description: 'Instruction dossiers, validation garanties et échéanciers',
      defaultRoute: 'credits',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'collecteur_terrain',
      label: 'Agent Collecteur de Terrain (Tontinier)',
      description: 'Collectes journalières épargne/tontine sur le terrain',
      defaultRoute: 'agents',
      defaultPermissions: {
        ventes: false,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'guichetier_caissier_imf',
      label: 'Guichetier / Caissier IMF',
      description: 'Opérations de caisse, dépôts/retraits épargne au guichet',
      defaultRoute: 'caisse',
      defaultPermissions: {
        ventes: false,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: true,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'responsable_conformite',
      label: 'Responsable Conformité & Risques LBC/FT',
      description: 'Surveillance KYC, seuils d’espèces et portefeuille à risque PAR',
      defaultRoute: 'conformite',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: true,
        syscohada: true,
        admin: false,
      },
    },
    {
      id: 'gerant_imf',
      label: 'Gérant d’Agence IMF',
      description: 'Supervision globale de l’institution de microfinance',
      defaultRoute: 'tableau-bord',
      defaultPermissions: {
        ventes: false,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: true,
        syscohada: true,
        admin: false,
      },
    },
  ],

  // 2. BAR, RESTAURANT, MAQUIS & FAST-FOOD
  restaurant: [
    {
      id: 'serveur',
      label: 'Serveur / Serveuse de Salle',
      description: 'Prise de commandes sur tables et transmission en cuisine/bar',
      defaultRoute: 'tables',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_restaurant',
      label: 'Caissier / Caissière Restaurant',
      description: 'Encaissement des additions, clôtures de caisse et tickets',
      defaultRoute: 'caisse',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: true,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'chef_cuisine',
      label: 'Chef de Cuisine / Cuisinier (KDS)',
      description: 'Écran de commande cuisine KDS, fiches recettes et pertes',
      defaultRoute: 'kds',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'barman',
      label: 'Barman / Responsable Bar',
      description: 'Préparation des boissons, KDS bar et stock de boissons',
      defaultRoute: 'kds',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'maitre_hotel',
      label: 'Maître d’Hôtel / Responsable de Salle',
      description: 'Plan de salle, affectation des tables et réservations VIP',
      defaultRoute: 'tables',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 3. STATION-SERVICE & HYDROCARBURES
  'station-service': [
    {
      id: 'pompiste',
      label: 'Pompiste / Opérateur de Piste',
      description: 'Service au volant, relevés d’index pompes et prise de poste',
      defaultRoute: 'postes',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'chef_piste',
      label: 'Chef de Piste / Superviseur Volucompteurs',
      description: 'Jaugeage des cuves, contrôle des index et écarts de poste',
      defaultRoute: 'pompes',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_boutique_station',
      label: 'Caissier Boutique & Lubrifiants',
      description: 'Vente boutique autoroutière, bidons de lubrifiants et caisse',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'gerant_station',
      label: 'Gérant de Station-Service',
      description: 'Supervision globale, livraisons camions-citernes et gestion',
      defaultRoute: 'tableau-bord',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: true,
        syscohada: true,
        admin: false,
      },
    },
  ],

  // 4. PHARMACIE & DÉPÔT MÉDICAL
  pharmacie: [
    {
      id: 'pharmacien_titulaire',
      label: 'Pharmacien Titulaire / Gérant',
      description: 'Supervision officinale, dispensation et conformité ordonnances',
      defaultRoute: 'tableau-bord',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: true,
        syscohada: true,
        admin: false,
      },
    },
    {
      id: 'preparateur_pharmacie',
      label: 'Préparateur / Gestionnaire Lots & DLC',
      description: 'Réception médicaments, contrôle lots et dates de péremption',
      defaultRoute: 'lots',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_pharmacie',
      label: 'Caissier / Vendeur Pharmacie',
      description: 'Délivrance comptoir, scannage boîtes et encaissement',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 5. HÔTEL & RÉSIDENCE
  hotel: [
    {
      id: 'receptionniste_hotel',
      label: 'Réceptionniste / Agent d’Accueil',
      description: 'Réservations, check-in, check-out et facturation nuitées',
      defaultRoute: 'chambres',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'gouvernante_housekeeping',
      label: 'Gouvernante / Agent Housekeeping',
      description: 'Statut ménage des chambres, état des lits et maintenance',
      defaultRoute: 'housekeeping',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'gerant_hotel',
      label: 'Directeur / Gérant d’Hôtel',
      description: 'Pilotage du taux d’occupation, tarifs et exploitation',
      defaultRoute: 'tableau-bord',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: true,
        syscohada: true,
        admin: false,
      },
    },
  ],

  // 6. ÉCOLE & FORMATION
  ecole: [
    {
      id: 'comptable_econome',
      label: 'Économe / Comptable Scolaire',
      description: 'Encaissement des frais de scolarité, reçus et impayés',
      defaultRoute: 'frais-scolaires',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: true,
        syscohada: true,
        admin: false,
      },
    },
    {
      id: 'secretaire_ecole',
      label: 'Secrétaire Pédagogique / Adjoint',
      description: 'Inscriptions élèves, absences, bulletins et notes',
      defaultRoute: 'eleves',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 7. GARAGE & ATELIER MÉCANIQUE
  garage: [
    {
      id: 'chef_atelier',
      label: 'Chef d’Atelier Mécanique',
      description: 'Diagnostic technique, ordres de réparation et attribution des travaux',
      defaultRoute: 'reparations',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: false,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'receptionnaire_garage',
      label: 'Réceptionnaire Véhicules',
      description: 'Entrée des véhicules, constat kilométrage et fiches travaux',
      defaultRoute: 'vehicules',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_garage',
      label: 'Caissier / Facturier Atelier',
      description: 'Facturation pièces & main-d’œuvre, encaissements et caisse',
      defaultRoute: 'caisse',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: true,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 8. BOUTIQUE & MAGASIN DE DÉTAIL
  boutique: [
    {
      id: 'caissier_boutique',
      label: 'Caissier / Caissière Magasin',
      description: 'Encaissements au comptoir, tickets de caisse et clôtures',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'vendeur_boutique',
      label: 'Vendeur / Commercial Magasin',
      description: 'Accueil client, conseil produits, ventes et devis',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'magasinier_boutique',
      label: 'Magasinier / Gestionnaire Stock',
      description: 'Réception marchandises, inventaires physiques et alertes stock',
      defaultRoute: 'stocks',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: true,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 9. QUINCAILLERIE & MATÉRIAUX BTP
  quincaillerie: [
    {
      id: 'vendeur_comptoir_btp',
      label: 'Vendeur Comptoir BTP & Matériaux',
      description: 'Chiffrage ciment, fer à béton, devis chantiers et bons',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'magasinier_parc_btp',
      label: 'Magasinier Parc Matériaux & Pesée',
      description: 'Sortie sacs ciment, chargement camions et conversions tonnes',
      defaultRoute: 'stocks',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: true,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_quincaillerie',
      label: 'Caissier / Caissière Quincaillerie',
      description: 'Encaissements gros & détail, validation bons d’enlèvement',
      defaultRoute: 'caisse',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: true,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 10. POISSONNERIE & PRODUITS FRAIS
  poissonnerie: [
    {
      id: 'peseur_poissonnerie',
      label: 'Peseur / Vendeur Cartons & Kg',
      description: 'Pesées balances, conversion cartons/kg et vente comptoir',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'gestionnaire_chambre_froide',
      label: 'Gestionnaire Chambres Froides & Avaries',
      description: 'Relevés de températures, traçabilité et déclaration avaries',
      defaultRoute: 'chambres-froides',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: true,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_poissonnerie',
      label: 'Caissier / Caissière Poissonnerie',
      description: 'Encaissement des tickets de pesée et gestion de caisse',
      defaultRoute: 'caisse',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 11. IMPRIMERIE & SÉRIGRAPHIE
  imprimerie: [
    {
      id: 'responsable_imprimerie',
      label: 'Responsable d\'Atelier & Production',
      description: 'Supervision globale des commandes, de la production et des rapports de rentabilité',
      defaultRoute: 'devis',
      defaultPermissions: {
        dashboard: true,
        ventes: true,
        devis: true,
        prestations: true,
        matieres: true,
        sous_traitance: true,
        caisse: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: true,
        admin: false,
      },
    },
    {
      id: 'commercial_imprimerie',
      label: 'Commercial & Facturation Devis',
      description: 'Gestion des clients, chiffrage des devis au m² et validation des commandes',
      defaultRoute: 'devis',
      defaultPermissions: {
        dashboard: true,
        ventes: true,
        devis: true,
        prestations: true,
        clients: true,
        caisse: true,
        matieres: false,
        sous_traitance: false,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: false,
        admin: false,
      },
    },
    {
      id: 'graphiste_pao',
      label: 'Graphiste / Infographiste PAO',
      description: 'Conception graphique, B.A.T., validation des maquettes et consignes atelier',
      defaultRoute: 'devis',
      defaultPermissions: {
        dashboard: true,
        devis: true,
        prestations: true,
        clients: true,
        ventes: false,
        caisse: false,
        matieres: false,
        sous_traitance: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        admin: false,
      },
    },
    {
      id: 'production_imprimerie',
      label: 'Opérateur Production / Conducteur Machine',
      description: 'Lancement des tirages, impression, finition et saisie de consommation réelle des matières',
      defaultRoute: 'devis',
      defaultPermissions: {
        dashboard: true,
        devis: true,
        matieres: true,
        stock: true,
        ventes: false,
        caisse: false,
        clients: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        admin: false,
      },
    },
    {
      id: 'caissiere_imprimerie',
      label: 'Caissière Encaissements & Acomptes',
      description: 'Encaissement indépendant des acomptes, soldes et ventes comptoir',
      defaultRoute: 'caisse',
      defaultPermissions: {
        dashboard: true,
        caisse: true,
        ventes: true,
        devis: true,
        clients: true,
        matieres: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        admin: false,
      },
    },
    {
      id: 'magasinier_imprimerie',
      label: 'Magasinier Stocks Matières Premières',
      description: 'Réception des bâches, vinyles, encres, consommables et gestion des stocks',
      defaultRoute: 'stocks',
      defaultPermissions: {
        dashboard: true,
        matieres: true,
        stock: true,
        fournisseurs: true,
        ventes: false,
        caisse: false,
        clients: false,
        depenses: false,
        reporting: false,
        finances: false,
        admin: false,
      },
    },
    {
      id: 'comptable_imprimerie',
      label: 'Comptable / Gestionnaire Financier',
      description: 'Suivi de la trésorerie, caisse, créances clients, dépenses et rentabilité SYSCOHADA',
      defaultRoute: 'tresorerie',
      defaultPermissions: {
        dashboard: true,
        caisse: true,
        finances: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        syscohada: true,
        reporting: true,
        ventes: false,
        matieres: false,
        admin: false,
      },
    },
  ],

  // 12. GESTION LOCATIVE & IMMOBILIER
  immobilier: [
    {
      id: 'gestionnaire_immobilier',
      label: 'Gestionnaire Locatif / Négociateur',
      description: 'Fiches biens, états des lieux, baux et locataires',
      defaultRoute: 'biens',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: true,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'agent_recouvrement_loyers',
      label: 'Agent de Recouvrement / Régisseur',
      description: 'Émission des quittances, encaissement des loyers et relances',
      defaultRoute: 'quittances',
      defaultPermissions: {
        ventes: false,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: true,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 13. BRASSERIE & DÉPÔT DE BOISSONS
  brasserie: [
    {
      id: 'gestionnaire_consignation',
      label: 'Gestionnaire Casiers & Consignations',
      description: 'Suivi des entrées/sorties de bouteilles consignées et emballages',
      defaultRoute: 'consignation',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'vendeur_depot_boissons',
      label: 'Vendeur Dépôt / Grossiste',
      description: 'Application grilles tarifaires maquis/gros et commandes',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'caissier_depot',
      label: 'Caissier / Caissière Dépôt',
      description: 'Encaissement factures boissons et cautions consignations',
      defaultRoute: 'caisse',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: true,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 14. SUPERMARCHÉ & SUPÉRETTE
  supermarche: [
    {
      id: 'hote_caisse',
      label: 'Hôte / Hôtesse de Caisse',
      description: 'Scannage code-barres rapide et encaissement en caisse',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'chef_rayon',
      label: 'Chef de Rayon / Gondoles',
      description: 'Réassort des rayons, vérification prix et promotions DLC',
      defaultRoute: 'promos-dlc',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 15. ÉVÉNEMENTIEL & TRAITEUR
  evenementiel: [
    {
      id: 'coordinateur_evenements',
      label: 'Coordinateur / Régisseur Événements',
      description: 'Planning des salles, dates, contrats mariages et conférences',
      defaultRoute: 'planning',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'responsable_materiel',
      label: 'Gestionnaire Matériel (Bâches, Chaises, Sono)',
      description: 'Sorties et retours des parcs de location de matériel',
      defaultRoute: 'materiel',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 16. BOULANGERIE & PÂTISSERIE
  boulangerie: [
    {
      id: 'chef_boulanger',
      label: 'Chef Boulanger / Pâtissier',
      description: 'Gestion du pétrin, fiches fournées et consommations de farine',
      defaultRoute: 'stocks',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: true,
        clients: false,
        fournisseurs: true,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'vendeur_boulangerie',
      label: 'Vendeuse Comptoir / Caissière',
      description: 'Vente directe au comptoir de pain et viennoiseries',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: false,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 17. TRANSPORT & LOGISTIQUE
  transport: [
    {
      id: 'dispatcher_transport',
      label: 'Responsable Flotte / Dispatcher',
      description: 'Feuilles de route, suivi véhicules et ordres de transport',
      defaultRoute: 'tableau-bord',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
    {
      id: 'chauffeur_transport',
      label: 'Chauffeur / Livreur',
      description: 'Bordereaux de livraison et frais de déplacement',
      defaultRoute: 'tableau-bord',
      defaultPermissions: {
        ventes: false,
        caisse: false,
        stock: false,
        clients: false,
        fournisseurs: false,
        depenses: true,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 18. AGRO-BUSINESS & ÉLEVAGE
  agrobusiness: [
    {
      id: 'responsable_agricole',
      label: 'Chef d’Exploitation Agricole',
      description: 'Suivi des récoltes, intrants, provendes et cheptel',
      defaultRoute: 'stocks',
      defaultPermissions: {
        ventes: true,
        caisse: false,
        stock: true,
        clients: true,
        fournisseurs: true,
        depenses: true,
        reporting: true,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 19. COSMÉTIQUES & BEAUTÉ
  cosmetiques: [
    {
      id: 'esthetique_coiffure',
      label: 'Praticien Soins / Coiffeur',
      description: 'Prestations de salon, forfaits beauté et vente produits',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],

  // 20. MERCERIE & COUTURE
  mercerie: [
    {
      id: 'couturier_mercerie',
      label: 'Couturier / Vendeur Tissus',
      description: 'Vente tissus au mètre, retouches et mercerie',
      defaultRoute: 'vente-pos',
      defaultPermissions: {
        ventes: true,
        caisse: true,
        stock: true,
        clients: true,
        fournisseurs: false,
        depenses: false,
        reporting: false,
        finances: false,
        syscohada: false,
        admin: false,
      },
    },
  ],
}

/**
 * Renvoie tous les rôles adaptés pour un secteur donné (métier + transversaux)
 */
export function getRolesForSector(sectorSlug?: string | null): SectorRoleDefinition[] {
  const norm = normalizeSectorSlug(sectorSlug)
  const specific = SECTOR_ROLES_CATALOG[norm] || []
  return [...specific, ...COMMON_ROLES]
}

export interface SectorModuleItem {
  id: string
  label: string
  category: 'commercial' | 'gestion' | 'finance' | 'admin'
}

/**
 * Renvoie la liste spécifique des modules d'exploitation pour le secteur donné
 * (Utilisé pour le filtrage strict des droits dans le formulaire utilisateur)
 */
export function getSectorAvailableModules(sectorSlug?: string | null): SectorModuleItem[] {
  const norm = normalizeSectorSlug(sectorSlug)

  if (norm === 'hotel') {
    return [
      { id: 'ventes', label: 'Vente & POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse', category: 'finance' },
      { id: 'stock', label: 'Stocks', category: 'gestion' },
      { id: 'chambres', label: 'Chambres & Réservations', category: 'commercial' },
      { id: 'housekeeping', label: 'Housekeeping', category: 'gestion' },
      { id: 'clients', label: 'Clients', category: 'commercial' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
      { id: 'syscohada', label: 'Comptabilité', category: 'finance' },
    ]
  }

  if (norm === 'microfinance') {
    return [
      { id: 'membres', label: 'Membres & Épargne', category: 'commercial' },
      { id: 'credits', label: 'Crédits', category: 'commercial' },
      { id: 'tontine', label: 'Tontines', category: 'commercial' },
      { id: 'caisse', label: 'Recettes Administratives / Caisse', category: 'finance' },
      { id: 'finances', label: 'Trésorerie & Banques', category: 'finance' },
      { id: 'clients', label: 'Clients & Adhérents', category: 'commercial' },
      { id: 'reporting', label: 'Reporting & Réglementaire', category: 'gestion' },
      { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
    ]
  }

  if (norm === 'imprimerie') {
    return [
      { id: 'ventes', label: 'Vente Rapide & Comptoir', category: 'commercial' },
      { id: 'devis', label: 'Devis & Production Atelier', category: 'commercial' },
      { id: 'prestations', label: 'Catalogue Prestations & BOM', category: 'commercial' },
      { id: 'matieres', label: 'Matières Premières & Stocks', category: 'gestion' },
      { id: 'sous_traitance', label: 'Sous-traitance & Partenaires', category: 'gestion' },
      { id: 'caisse', label: 'Caisse & Encaissements', category: 'finance' },
      { id: 'clients', label: 'Clients & Créances', category: 'commercial' },
      { id: 'fournisseurs', label: 'Fournisseurs & Achats', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses Atelier', category: 'finance' },
      { id: 'finances', label: 'Trésorerie & Banques', category: 'finance' },
      { id: 'reporting', label: 'Rapports & Rentabilité Réelle', category: 'gestion' },
      { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
    ]
  }

  if (norm === 'station-service') {
    return [
      { id: 'ventes', label: 'Ventes / POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse', category: 'finance' },
      { id: 'stock', label: 'Stocks Carburants', category: 'gestion' },
      { id: 'pompes', label: 'Pompes & Cuves', category: 'commercial' },
      { id: 'postes', label: 'Postes Pompistes', category: 'commercial' },
      { id: 'clients', label: 'Clients & Flottes', category: 'commercial' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
    ]
  }

  if (norm === 'quincaillerie') {
    return [
      { id: 'ventes', label: 'Ventes / POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse', category: 'finance' },
      { id: 'stock', label: 'Stocks & Inventaires', category: 'gestion' },
      { id: 'materiaux', label: 'Ciment & Fers', category: 'gestion' },
      { id: 'chantiers', label: 'Chantiers & Camions', category: 'commercial' },
      { id: 'clients', label: 'Clients', category: 'commercial' },
      { id: 'fournisseurs', label: 'Fournisseurs / Achats', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
      { id: 'reporting', label: 'Reporting & Rapports', category: 'gestion' },
      { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
    ]
  }

  if (norm === 'poissonnerie') {
    return [
      { id: 'ventes', label: 'Ventes / POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse', category: 'finance' },
      { id: 'pesee', label: 'Pesée Kg & Cartons', category: 'commercial' },
      { id: 'chambres_froides', label: 'Chambres Froides & T°', category: 'gestion' },
      { id: 'stock', label: 'Stocks Frigorifiques', category: 'gestion' },
      { id: 'avaries', label: 'Avaries & Pertes', category: 'gestion' },
      { id: 'clients', label: 'Clients', category: 'commercial' },
      { id: 'fournisseurs', label: 'Fournisseurs Maritimes', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
    ]
  }

  if (norm === 'brasserie') {
    return [
      { id: 'ventes', label: 'Ventes / POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse', category: 'finance' },
      { id: 'stock', label: 'Stocks Boissons & Fûts', category: 'gestion' },
      { id: 'consignation', label: 'Consignations & Casiers', category: 'commercial' },
      { id: 'grilles', label: 'Grilles Gros & Maquis', category: 'commercial' },
      { id: 'clients', label: 'Clients & Débits', category: 'commercial' },
      { id: 'fournisseurs', label: 'Fournisseurs', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
      { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
    ]
  }

  if (norm === 'restaurant') {
    return [
      { id: 'ventes', label: 'Commandes & POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse & Clôtures', category: 'finance' },
      { id: 'tables', label: 'Service & Tables', category: 'commercial' },
      { id: 'cuisine', label: 'Cuisine & Bar (KDS)', category: 'commercial' },
      { id: 'stock', label: 'Stock Matières & Boissons', category: 'gestion' },
      { id: 'recettes', label: 'Fiches Recettes', category: 'gestion' },
      { id: 'pertes', label: 'Pertes & Offerts', category: 'gestion' },
      { id: 'clients', label: 'Clients & Ardoises', category: 'commercial' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
      { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
    ]
  }

  if (norm === 'ecole') {
    return [
      { id: 'eleves', label: 'Élèves & Classes', category: 'gestion' },
      { id: 'frais', label: 'Frais Scolaires', category: 'finance' },
      { id: 'caisse', label: 'Caisse Scolaire', category: 'finance' },
      { id: 'notes', label: 'Notes & Résultats', category: 'gestion' },
      { id: 'absences', label: 'Absences', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses École', category: 'finance' },
      { id: 'reporting', label: 'Rapports Pédagogiques', category: 'gestion' },
    ]
  }

  if (norm === 'immobilier' || norm === 'location') {
    return [
      { id: 'biens', label: 'Biens & Logements', category: 'gestion' },
      { id: 'contrats', label: 'Contrats & Loyers', category: 'commercial' },
      { id: 'quittances', label: 'Quittances', category: 'finance' },
      { id: 'caisse', label: 'Caisse & Encaissements', category: 'finance' },
      { id: 'clients', label: 'Locataires & Bailleurs', category: 'commercial' },
      { id: 'depenses', label: 'Dépenses Travaux', category: 'finance' },
      { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
    ]
  }

  if (norm === 'garage') {
    return [
      { id: 'vehicules', label: 'Véhicules & Entrées', category: 'gestion' },
      { id: 'reparations', label: 'Ordres de Réparation', category: 'commercial' },
      { id: 'ventes', label: 'Vente Pièces / POS', category: 'commercial' },
      { id: 'caisse', label: 'Caisse Atelier', category: 'finance' },
      { id: 'stock', label: 'Stocks Pièces', category: 'gestion' },
      { id: 'clients', label: 'Clients & Propriétaires', category: 'commercial' },
      { id: 'fournisseurs', label: 'Fournisseurs Pièces', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses Garage', category: 'finance' },
    ]
  }

  if (norm === 'pharmacie') {
    return [
      { id: 'ventes', label: 'Vente & POS', category: 'commercial' },
      { id: 'ordonnances', label: 'Ordonnances', category: 'commercial' },
      { id: 'caisse', label: 'Caisse Officine', category: 'finance' },
      { id: 'stock', label: 'Stocks Médicaments', category: 'gestion' },
      { id: 'lots', label: 'Lots & Péremptions', category: 'gestion' },
      { id: 'clients', label: 'Patients & Clients', category: 'commercial' },
      { id: 'fournisseurs', label: 'Laboratoires & Répartiteurs', category: 'gestion' },
      { id: 'depenses', label: 'Dépenses', category: 'finance' },
    ]
  }

  // Par défaut pour les autres commerces (Boutique, Supermarché, Cosmétiques, etc.)
  return [
    { id: 'ventes', label: 'Ventes / POS', category: 'commercial' },
    { id: 'caisse', label: 'Caisse', category: 'finance' },
    { id: 'stock', label: 'Stocks & Inventaires', category: 'gestion' },
    { id: 'clients', label: 'Clients & Créances', category: 'commercial' },
    { id: 'fournisseurs', label: 'Fournisseurs / Achats', category: 'gestion' },
    { id: 'depenses', label: 'Dépenses', category: 'finance' },
    { id: 'reporting', label: 'Reporting & Rapports', category: 'gestion' },
    { id: 'finances', label: 'Trésorerie & Banques', category: 'finance' },
    { id: 'syscohada', label: 'Comptabilité SYSCOHADA', category: 'finance' },
  ]
}
