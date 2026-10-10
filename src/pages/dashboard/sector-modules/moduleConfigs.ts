// =============================================================================
// GESTIO 229 — Configuration des modules spécifiques par secteur
// Chaque module = 1 table Supabase isolée par company_id + sector_slug (M030)
// Les options des listes correspondent EXACTEMENT aux contraintes CHECK SQL.
// =============================================================================

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'boolean'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required?: boolean
  default?: any
  hideInTable?: boolean
  money?: boolean
}

export interface CardDef {
  label: string
  value: (rows: any[]) => string | number
  tone?: 'emerald' | 'rose' | 'amber' | 'indigo' | 'slate'
}

export interface ActionDef {
  label: string
  show: (row: any) => boolean
  /** Retourne le patch à appliquer, ou null pour annuler */
  apply: (row: any) => any | null
  tone?: 'emerald' | 'rose' | 'amber' | 'indigo'
}

export interface ModuleConfig {
  title: string
  description: string
  table: string
  refPrefix?: string
  fields: FieldDef[]
  /** Champs calculés automatiquement avant enregistrement */
  compute?: (row: any) => any
  cards?: CardDef[]
  statusKey?: string
  rowTone?: (row: any) => 'rose' | 'amber' | 'emerald' | null
  actions?: ActionDef[]
  orderBy?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const n = (v: any) => Number(v) || 0
export const fmtMoney = (v: number) => new Intl.NumberFormat('fr-FR').format(Math.round(v || 0)) + ' FCFA'
const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + n(r[k]), 0)
const count = (rows: any[], pred: (r: any) => boolean) => rows.filter(pred).length
const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)
const isToday = (d: any) => String(d || '').slice(0, 10) === today()
const isThisMonth = (d: any) => String(d || '').slice(0, 7) === thisMonth()
const daysUntil = (d: any) => (d ? Math.floor((new Date(d).getTime() - Date.now()) / 86400000) : Infinity)
const askNumber = (msg: string): number | null => {
  const v = window.prompt(msg)
  if (v === null || v.trim() === '' || isNaN(Number(v))) return null
  return Number(v)
}

// =============================================================================
export const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  // ══════════════════════════ ÉCOLE ══════════════════════════
  eleves: {
    title: 'Élèves & Classes',
    description: 'Effectifs, classes et situation des frais scolaires par élève',
    table: 'ecole_eleves',
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true },
      { key: 'prenom', label: 'Prénom', type: 'text', required: true },
      { key: 'classe', label: 'Classe', type: 'text', required: true },
      { key: 'date_naissance', label: 'Date de naissance', type: 'date', hideInTable: true },
      { key: 'contact_parent', label: 'Contact parent', type: 'text' },
      { key: 'montant_frais_annuels', label: 'Frais annuels', type: 'number', money: true },
      { key: 'frais_payes', label: 'Frais payés', type: 'number', money: true, default: 0 },
      { key: 'statut', label: 'Statut', type: 'select', options: ['ACTIF', 'SUSPENDU', 'SORTI', 'DIPLOME'], default: 'ACTIF' },
    ],
    statusKey: 'statut',
    cards: [
      { label: 'Élèves actifs', value: (r) => count(r, (x) => x.statut === 'ACTIF') },
      { label: 'Frais encaissés', value: (r) => fmtMoney(sum(r, 'frais_payes')), tone: 'emerald' },
      { label: 'Solde restant dû', value: (r) => fmtMoney(sum(r, 'montant_frais_annuels') - sum(r, 'frais_payes')), tone: 'rose' },
    ],
    rowTone: (r) => (n(r.montant_frais_annuels) - n(r.frais_payes) > 0 ? 'amber' : null),
    actions: [
      {
        label: '+ Versement',
        show: (r) => n(r.montant_frais_annuels) - n(r.frais_payes) > 0,
        apply: (r) => {
          const m = askNumber(`Montant versé par ${r.prenom} ${r.nom} (solde : ${fmtMoney(n(r.montant_frais_annuels) - n(r.frais_payes))})`)
          return m === null ? null : { frais_payes: n(r.frais_payes) + m }
        },
      },
    ],
  },

  frais_scolaires: {
    title: 'Frais Scolaires',
    description: 'Encaissements des frais d’inscription, mensualités et examens',
    table: 'ecole_paiements_scolaires',
    refPrefix: 'PAY',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text', hideInTable: false },
      { key: 'eleve_nom', label: 'Élève', type: 'text', required: true },
      { key: 'classe', label: 'Classe', type: 'text' },
      { key: 'type_frais', label: 'Type de frais', type: 'select', options: ['Inscription', 'Mensualite', 'Examen', 'Cantine', 'Transport', 'Autre'], default: 'Mensualite' },
      { key: 'montant', label: 'Montant', type: 'number', money: true, required: true },
      { key: 'mode_paiement', label: 'Mode', type: 'select', options: ['Especes', 'MoMo', 'Virement', 'Cheque'], default: 'Especes' },
      { key: 'date_paiement', label: 'Date', type: 'date', default: today },
      { key: 'agent_nom', label: 'Agent', type: 'text', hideInTable: true },
    ],
    orderBy: 'date_paiement',
    cards: [
      { label: 'Encaissé ce mois', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date_paiement)), 'montant')), tone: 'emerald' },
      { label: "Encaissé aujourd'hui", value: (r) => fmtMoney(sum(r.filter((x) => isToday(x.date_paiement)), 'montant')) },
      { label: 'Total encaissé', value: (r) => fmtMoney(sum(r, 'montant')), tone: 'indigo' },
    ],
  },

  notes_resultats: {
    title: 'Notes & Résultats',
    description: 'Saisie des notes par matière et période, appréciation automatique',
    table: 'ecole_notes',
    fields: [
      { key: 'eleve_nom', label: 'Élève', type: 'text', required: true },
      { key: 'classe', label: 'Classe', type: 'text', required: true },
      { key: 'matiere', label: 'Matière', type: 'text', required: true },
      { key: 'note_sur_20', label: 'Note /20', type: 'number', required: true },
      { key: 'periode', label: 'Période', type: 'select', options: ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'], default: 'Trimestre 1' },
      { key: 'appreciation', label: 'Appréciation', type: 'text' },
      { key: 'date_saisie', label: 'Date', type: 'date', default: today, hideInTable: true },
    ],
    compute: (r) => {
      const v = Math.min(20, Math.max(0, n(r.note_sur_20)))
      const app = v >= 16 ? 'Très Bien' : v >= 14 ? 'Bien' : v >= 12 ? 'Assez Bien' : v >= 10 ? 'Passable' : 'Insuffisant'
      return { ...r, note_sur_20: v, appreciation: r.appreciation || app }
    },
    cards: [
      { label: 'Notes saisies', value: (r) => r.length },
      { label: 'Moyenne générale', value: (r) => (r.length ? (sum(r, 'note_sur_20') / r.length).toFixed(2) + ' /20' : '—'), tone: 'indigo' },
      { label: 'Notes < 10', value: (r) => count(r, (x) => n(x.note_sur_20) < 10), tone: 'rose' },
    ],
    rowTone: (r) => (n(r.note_sur_20) < 10 ? 'rose' : null),
  },

  absences: {
    title: 'Absences',
    description: 'Suivi des absences et justificatifs',
    table: 'ecole_absences',
    fields: [
      { key: 'eleve_nom', label: 'Élève', type: 'text', required: true },
      { key: 'classe', label: 'Classe', type: 'text' },
      { key: 'date_absence', label: 'Date', type: 'date', default: today, required: true },
      { key: 'motif', label: 'Motif', type: 'text' },
      { key: 'justifie', label: 'Justifiée', type: 'boolean', default: false },
      { key: 'agent_nom', label: 'Saisi par', type: 'text', hideInTable: true },
    ],
    orderBy: 'date_absence',
    cards: [
      { label: 'Absences ce mois', value: (r) => count(r, (x) => isThisMonth(x.date_absence)) },
      { label: 'Non justifiées', value: (r) => count(r, (x) => !x.justifie), tone: 'rose' },
      { label: "Aujourd'hui", value: (r) => count(r, (x) => isToday(x.date_absence)), tone: 'amber' },
    ],
    rowTone: (r) => (!r.justifie ? 'amber' : null),
    actions: [{ label: 'Justifier', show: (r) => !r.justifie, apply: () => ({ justifie: true }), tone: 'emerald' }],
  },

  // ══════════════════════════ SUPERMARCHÉ ══════════════════════════
  rayons_gondoles: {
    title: 'Rayons & Gondoles',
    description: 'Organisation des rayons et responsables',
    table: 'supermarche_rayons',
    fields: [
      { key: 'code_rayon', label: 'Code', type: 'text', required: true },
      { key: 'nom_rayon', label: 'Nom du rayon', type: 'text', required: true },
      { key: 'responsable', label: 'Responsable', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'est_actif', label: 'Actif', type: 'boolean', default: true },
    ],
    cards: [
      { label: 'Rayons', value: (r) => r.length },
      { label: 'Actifs', value: (r) => count(r, (x) => x.est_actif), tone: 'emerald' },
      { label: 'Sans responsable', value: (r) => count(r, (x) => !x.responsable), tone: 'amber' },
    ],
  },

  promos_dlc_courtes: {
    title: 'Promos & DLC Courtes',
    description: 'Promotions et produits à date limite proche',
    table: 'supermarche_promos',
    fields: [
      { key: 'produit_nom', label: 'Produit', type: 'text', required: true },
      { key: 'prix_normal', label: 'Prix normal', type: 'number', money: true, required: true },
      { key: 'prix_promo', label: 'Prix promo', type: 'number', money: true, required: true },
      { key: 'remise_pct', label: 'Remise %', type: 'number' },
      { key: 'date_debut', label: 'Début', type: 'date', default: today },
      { key: 'date_fin', label: 'Fin', type: 'date' },
      { key: 'dlc_date', label: 'DLC', type: 'date' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['ACTIVE', 'EXPIREE', 'A_VENIR'], default: 'ACTIVE' },
    ],
    statusKey: 'statut',
    compute: (r) => {
      const pn = n(r.prix_normal)
      const remise = pn > 0 ? Number((((pn - n(r.prix_promo)) / pn) * 100).toFixed(2)) : 0
      let statut = r.statut || 'ACTIVE'
      if (r.date_fin && daysUntil(r.date_fin) < 0) statut = 'EXPIREE'
      else if (r.date_debut && daysUntil(r.date_debut) > 0) statut = 'A_VENIR'
      return { ...r, remise_pct: remise, statut }
    },
    rowTone: (r) => (daysUntil(r.dlc_date) < 0 ? 'rose' : daysUntil(r.dlc_date) <= 30 ? 'amber' : null),
    cards: [
      { label: 'Promos actives', value: (r) => count(r, (x) => x.statut === 'ACTIVE'), tone: 'emerald' },
      { label: 'DLC ≤ 30 jours', value: (r) => count(r, (x) => daysUntil(x.dlc_date) >= 0 && daysUntil(x.dlc_date) <= 30), tone: 'amber' },
      { label: 'DLC dépassée', value: (r) => count(r, (x) => daysUntil(x.dlc_date) < 0), tone: 'rose' },
    ],
  },

  inventaire_supermarche: {
    title: 'Inventaire & Contrôle des Écarts',
    description: 'Comptages physiques par rayon, calcul des écarts en quantité et valeur avec traçabilité',
    table: 'supermarche_inventaires',
    refPrefix: 'INV',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'rayon_nom', label: 'Rayon / Emplacement', type: 'text', required: true },
      { key: 'produit_nom', label: 'Article / Produit', type: 'text', required: true },
      { key: 'stock_theorique', label: 'Stock Théorique', type: 'number', required: true },
      { key: 'stock_physique', label: 'Stock Compté (Physique)', type: 'number', required: true },
      { key: 'ecart_qte', label: 'Écart (Quantité)', type: 'number' },
      { key: 'valeur_ecart', label: 'Valeur de l\'Écart', type: 'number', money: true },
      { key: 'motif_ajustement', label: 'Motif d\'ajustement', type: 'text', required: true },
      { key: 'responsable', label: 'Responsable Comptage', type: 'text' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EN_COURS', 'VALIDE', 'REJETE'], default: 'VALIDE' },
    ],
    statusKey: 'statut',
    compute: (r) => {
      const theo = n(r.stock_theorique)
      const phys = n(r.stock_physique)
      const ecart = phys - theo
      const val = ecart * 1000 // valorisation indicative
      return { ...r, ecart_qte: ecart, valeur_ecart: r.valeur_ecart ? n(r.valeur_ecart) : val }
    },
    rowTone: (r) => (n(r.ecart_qte) < 0 ? 'rose' : n(r.ecart_qte) > 0 ? 'amber' : 'emerald'),
    cards: [
      { label: 'Comptages réalisés', value: (r) => r.length },
      { label: 'Écarts négatifs (Pertes)', value: (r) => count(r, (x) => n(x.ecart_qte) < 0), tone: 'rose' },
      { label: 'Inventaires conformes', value: (r) => count(r, (x) => n(x.ecart_qte) === 0), tone: 'emerald' },
    ],
  },

  reappro_intelligent: {
    title: 'Réapprovisionnement Intelligent',
    description: 'Aide à la commande : détection des stocks critiques, calcul des besoins et propositions fournisseurs',
    table: 'supermarche_reappro',
    refPrefix: 'CMD-PROP',
    fields: [
      { key: 'reference', label: 'Réf. Proposition', type: 'text' },
      { key: 'produit_nom', label: 'Produit', type: 'text', required: true },
      { key: 'fournisseur_nom', label: 'Fournisseur Habituel', type: 'text', required: true },
      { key: 'stock_actuel', label: 'Stock Actuel', type: 'number', required: true },
      { key: 'seuil_minimum', label: 'Seuil Minimum', type: 'number', required: true },
      { key: 'quantite_suggeree', label: 'Quantité à Commander', type: 'number', required: true },
      { key: 'prix_achat_estime', label: 'Coût Estimé', type: 'number', money: true },
      { key: 'urgence', label: 'Niveau Urgence', type: 'select', options: ['CRITIQUE', 'MOYEN', 'NORMAL'], default: 'MOYEN' },
      { key: 'statut', label: 'Décision', type: 'select', options: ['A_VALIDER', 'COMMANDE_TRANSMISE', 'REPORTE'], default: 'A_VALIDER' },
    ],
    statusKey: 'statut',
    rowTone: (r) => (r.urgence === 'CRITIQUE' ? 'rose' : r.urgence === 'MOYEN' ? 'amber' : null),
    cards: [
      { label: 'Articles à commander', value: (r) => r.length },
      { label: 'Urgences critiques (Rupture)', value: (r) => count(r, (x) => x.urgence === 'CRITIQUE'), tone: 'rose' },
      { label: 'Budget estimé', value: (r) => fmtMoney(sum(r, 'prix_achat_estime')), tone: 'indigo' },
    ],
  },

  etiquettes_prix: {
    title: 'Étiquettes de Prix & Codes-Barres',
    description: 'Génération et impression des étiquettes de rayon, codes-barres internes et vérification des marges',
    table: 'supermarche_etiquettes',
    fields: [
      { key: 'code_barre', label: 'Code-Barres / EAN', type: 'text', required: true },
      { key: 'designation', label: 'Nom de l\'Article', type: 'text', required: true },
      { key: 'rayon', label: 'Rayon / Emplacement', type: 'text' },
      { key: 'prix_achat', label: 'Prix d\'Achat', type: 'number', money: true, required: true },
      { key: 'prix_vente', label: 'Prix de Vente TTC', type: 'number', money: true, required: true },
      { key: 'marge_taux', label: 'Taux de Marge (%)', type: 'number' },
      { key: 'format_etiquette', label: 'Format', type: 'select', options: ['Rayon 50x30mm', 'Gondole 70x40mm', 'Planche A4'], default: 'Rayon 50x30mm' },
      { key: 'nb_exemplaires', label: 'Exemplaires', type: 'number', default: 1 },
    ],
    compute: (r) => {
      const pa = n(r.prix_achat)
      const pv = n(r.prix_vente)
      const marge = pa > 0 ? Number((((pv - pa) / pa) * 100).toFixed(1)) : 0
      return { ...r, marge_taux: marge }
    },
    rowTone: (r) => (n(r.marge_taux) < 15 ? 'rose' : null),
    cards: [
      { label: 'Étiquettes prêtes', value: (r) => r.length },
      { label: 'Marge faible (< 15%)', value: (r) => count(r, (x) => n(x.marge_taux) < 15), tone: 'rose' },
    ],
  },

  fidelite_clients: {
    title: 'Programme de Fidélité Clients',
    description: 'Gestion des points de fidélité, cagnottes et récompenses par numéro de téléphone ou carte client',
    table: 'supermarche_fidelite',
    refPrefix: 'FID',
    fields: [
      { key: 'client_nom', label: 'Nom du Client', type: 'text', required: true },
      { key: 'telephone', label: 'Téléphone (Identifiant)', type: 'text', required: true },
      { key: 'numero_carte', label: 'N° Carte Fidélité', type: 'text' },
      { key: 'points_solde', label: 'Solde de Points', type: 'number', default: 0 },
      { key: 'cumul_achats', label: 'Cumul Achats (FCFA)', type: 'number', money: true, default: 0 },
      { key: 'niveau', label: 'Statut', type: 'select', options: ['BRONZE', 'ARGENT', 'OR', 'VIP'], default: 'BRONZE' },
      { key: 'est_actif', label: 'Compte Actif', type: 'boolean', default: true },
    ],
    cards: [
      { label: 'Clients fidélité', value: (r) => r.length },
      { label: 'Membres Or / VIP', value: (r) => count(r, (x) => x.niveau === 'OR' || x.niveau === 'VIP'), tone: 'amber' },
      { label: 'Points distribués', value: (r) => sum(r, 'points_solde').toLocaleString('fr-FR'), tone: 'emerald' },
    ],
  },

  alertes_pilotage: {
    title: 'Pilotage Gérant & Alertes Opérationnelles',
    description: 'Surveillance en direct : ruptures imminentes, péremptions proches, écarts de caisse et marges critiques',
    table: 'supermarche_alertes',
    fields: [
      { key: 'titre_alerte', label: 'Nature de l\'Alerte', type: 'text', required: true },
      { key: 'type_alerte', label: 'Catégorie', type: 'select', options: ['STOCK_CRITIQUE', 'PEREMPTION_PROCHE', 'ECART_INVENTAIRE', 'MARGE_FAIBLE', 'COMMANDE_FOURNISSEUR'], default: 'STOCK_CRITIQUE' },
      { key: 'priorite', label: 'Priorité', type: 'select', options: ['HAUTE', 'MOYENNE', 'FAIBLE'], default: 'HAUTE' },
      { key: 'details', label: 'Détails & Impact', type: 'textarea' },
      { key: 'action_requise', label: 'Action recommandée', type: 'text' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['A_TRAITER', 'EN_COURS', 'RESOLU'], default: 'A_TRAITER' },
      { key: 'date_alerte', label: 'Date', type: 'date', default: today },
    ],
    statusKey: 'statut',
    rowTone: (r) => (r.priorite === 'HAUTE' && r.statut !== 'RESOLU' ? 'rose' : r.priorite === 'MOYENNE' ? 'amber' : null),
    cards: [
      { label: 'Alertes actives', value: (r) => count(r, (x) => x.statut !== 'RESOLU'), tone: 'rose' },
      { label: 'Urgences hautes', value: (r) => count(r, (x) => x.priorite === 'HAUTE' && x.statut !== 'RESOLU'), tone: 'rose' },
      { label: 'Alertes traitées', value: (r) => count(r, (x) => x.statut === 'RESOLU'), tone: 'emerald' },
    ],
  },

  comparaison_fournisseurs: {
    title: 'Comparatif & Historique Fournisseurs',
    description: 'Analyse comparative des prix d\'achat, délais de livraison et conditions par article',
    table: 'supermarche_comparatif_fournisseurs',
    fields: [
      { key: 'produit_nom', label: 'Article / Produit', type: 'text', required: true },
      { key: 'fournisseur_nom', label: 'Fournisseur', type: 'text', required: true },
      { key: 'prix_unitaire_achat', label: 'Prix Unitaire Achat', type: 'number', money: true, required: true },
      { key: 'conditionnement', label: 'Conditionnement', type: 'text', default: 'Carton' },
      { key: 'delai_livraison_jours', label: 'Délai Livraison (Jours)', type: 'number', default: 2 },
      { key: 'frais_livraison', label: 'Frais de port / Livraison', type: 'number', money: true, default: 0 },
      { key: 'qualite_note', label: 'Note Fournisseur /5', type: 'number', default: 5 },
      { key: 'recommande', label: 'Fournisseur Recommandé', type: 'boolean', default: false },
    ],
    cards: [
      { label: 'Offres référencées', value: (r) => r.length },
      { label: 'Fournisseurs recommandés', value: (r) => count(r, (x) => x.recommande), tone: 'emerald' },
    ],
  },

  performance_caissiers: {
    title: 'Suivi Performance des Caissiers',
    description: 'Indicateurs d\'activité : nombre de tickets servis, volume encaissé, panier moyen et conformité',
    table: 'supermarche_performance_caissiers',
    fields: [
      { key: 'caissier_nom', label: 'Nom du Caissier', type: 'text', required: true },
      { key: 'date_session', label: 'Date', type: 'date', default: today, required: true },
      { key: 'nombre_tickets', label: 'Nombre de Tickets', type: 'number', required: true },
      { key: 'montant_total_ventes', label: 'Total Ventes Encaissé', type: 'number', money: true, required: true },
      { key: 'panier_moyen', label: 'Panier Moyen', type: 'number', money: true },
      { key: 'ecart_caisse', label: 'Écart de Caisse Clôture', type: 'number', money: true, default: 0 },
      { key: 'duree_session_heures', label: 'Heures de Service', type: 'number', default: 8 },
      { key: 'appreciation', label: 'Appréciation Superviseur', type: 'text' },
    ],
    compute: (r) => {
      const tickets = n(r.nombre_tickets)
      const ventes = n(r.montant_total_ventes)
      const pm = tickets > 0 ? Math.round(ventes / tickets) : 0
      return { ...r, panier_moyen: pm }
    },
    rowTone: (r) => (n(r.ecart_caisse) < 0 ? 'rose' : null),
    cards: [
      { label: 'Sessions enregistrées', value: (r) => r.length },
      { label: 'Total Encaissé', value: (r) => fmtMoney(sum(r, 'montant_total_ventes')), tone: 'emerald' },
      { label: 'Panier Moyen Global', value: (r) => (r.length ? fmtMoney(Math.round(sum(r, 'montant_total_ventes') / Math.max(1, sum(r, 'nombre_tickets')))) : '—'), tone: 'indigo' },
    ],
  },

  // ══════════════════════════ PHARMACIE ══════════════════════════
  ordonnances: {
    title: 'Ordonnances',
    description: 'Enregistrement et suivi de la délivrance des ordonnances',
    table: 'pharmacie_ordonnances',
    refPrefix: 'ORD',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'patient_nom', label: 'Patient', type: 'text', required: true },
      { key: 'medecin', label: 'Médecin', type: 'text' },
      { key: 'date_ordonnance', label: 'Date', type: 'date', default: today },
      { key: 'produits_prescrits', label: 'Produits prescrits', type: 'textarea', hideInTable: true },
      { key: 'montant_total', label: 'Montant', type: 'number', money: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EN_ATTENTE', 'SERVIE', 'PARTIELLE'], default: 'EN_ATTENTE' },
      { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
    ],
    statusKey: 'statut',
    orderBy: 'date_ordonnance',
    cards: [
      { label: "Ordonnances du jour", value: (r) => count(r, (x) => isToday(x.date_ordonnance)) },
      { label: 'En attente', value: (r) => count(r, (x) => x.statut === 'EN_ATTENTE'), tone: 'amber' },
      { label: 'CA ordonnances (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date_ordonnance)), 'montant_total')), tone: 'emerald' },
    ],
    actions: [{ label: 'Servie', show: (r) => r.statut !== 'SERVIE', apply: () => ({ statut: 'SERVIE' }), tone: 'emerald' }],
  },

  lots_peremption: {
    title: 'Lots & Péremption',
    description: 'Traçabilité des lots et alertes de péremption',
    table: 'pharmacie_lots',
    fields: [
      { key: 'produit_nom', label: 'Produit', type: 'text', required: true },
      { key: 'numero_lot', label: 'N° lot', type: 'text', required: true },
      { key: 'date_fabrication', label: 'Fabrication', type: 'date' },
      { key: 'date_peremption', label: 'Péremption', type: 'date', required: true },
      { key: 'quantite', label: 'Quantité', type: 'number' },
      { key: 'fournisseur', label: 'Fournisseur', type: 'text' },
    ],
    orderBy: 'date_peremption',
    rowTone: (r) => (daysUntil(r.date_peremption) < 0 ? 'rose' : daysUntil(r.date_peremption) <= 90 ? 'amber' : 'emerald'),
    cards: [
      { label: 'Lots suivis', value: (r) => r.length },
      { label: 'Expire ≤ 90 jours', value: (r) => count(r, (x) => daysUntil(x.date_peremption) >= 0 && daysUntil(x.date_peremption) <= 90), tone: 'amber' },
      { label: 'Lots expirés', value: (r) => count(r, (x) => daysUntil(x.date_peremption) < 0), tone: 'rose' },
    ],
  },

  // ══════════════════════════ STATION-SERVICE ══════════════════════════
  pompes_cuves: {
    title: 'Pompes & Relevés',
    description: 'Relevés d’index des pompes, volumes et recettes carburant',
    table: 'station_releves_pompes',
    fields: [
      { key: 'pompe_num', label: 'Pompe', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', default: today },
      { key: 'index_debut', label: 'Index début', type: 'number', required: true },
      { key: 'index_fin', label: 'Index fin', type: 'number', required: true },
      { key: 'volume_vendu', label: 'Volume (L)', type: 'number' },
      { key: 'prix_litre', label: 'Prix/L', type: 'number', money: true, required: true },
      { key: 'montant', label: 'Montant', type: 'number', money: true },
      { key: 'agent_nom', label: 'Agent', type: 'text' },
    ],
    orderBy: 'date',
    compute: (r) => {
      const vol = Math.max(0, n(r.index_fin) - n(r.index_debut))
      return { ...r, volume_vendu: vol, montant: vol * n(r.prix_litre) }
    },
    cards: [
      { label: "Volume du jour (L)", value: (r) => sum(r.filter((x) => isToday(x.date)), 'volume_vendu').toLocaleString('fr-FR') },
      { label: 'CA carburant du jour', value: (r) => fmtMoney(sum(r.filter((x) => isToday(x.date)), 'montant')), tone: 'emerald' },
      { label: 'CA carburant du mois', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date)), 'montant')), tone: 'indigo' },
    ],
  },

  postes_pompiste: {
    title: 'Postes Pompistes',
    description: 'Clôture des postes et contrôle des écarts de caisse',
    table: 'station_postes_journaliers',
    fields: [
      { key: 'date', label: 'Date', type: 'date', default: today },
      { key: 'pompiste_nom', label: 'Pompiste', type: 'text', required: true },
      { key: 'pompe_numero', label: 'Pompe', type: 'text' },
      { key: 'index_debut', label: 'Index début', type: 'number' },
      { key: 'index_fin', label: 'Index fin', type: 'number' },
      { key: 'volume_vendu', label: 'Volume (L)', type: 'number' },
      { key: 'prix_litre', label: 'Prix/L (calcul)', type: 'number', hideInTable: true },
      { key: 'montant_encaisse', label: 'Encaissé', type: 'number', money: true },
      { key: 'ecart', label: 'Écart', type: 'number', money: true },
      { key: 'observation', label: 'Observation', type: 'textarea', hideInTable: true },
    ],
    orderBy: 'date',
    compute: (r) => {
      const vol = Math.max(0, n(r.index_fin) - n(r.index_debut))
      const out = { ...r, volume_vendu: vol, ecart: n(r.prix_litre) > 0 ? n(r.montant_encaisse) - vol * n(r.prix_litre) : r.ecart }
      delete out.prix_litre // non stocké en base
      return out
    },
    rowTone: (r) => (n(r.ecart) < 0 ? 'rose' : null),
    cards: [
      { label: "Postes du jour", value: (r) => count(r, (x) => isToday(x.date)) },
      { label: 'Encaissé du jour', value: (r) => fmtMoney(sum(r.filter((x) => isToday(x.date)), 'montant_encaisse')), tone: 'emerald' },
      { label: 'Écarts négatifs (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date) && n(x.ecart) < 0), 'ecart')), tone: 'rose' },
    ],
  },

  lubrifiants: {
    title: 'Lubrifiants & Produits',
    description: 'Stock des huiles et lubrifiants avec alertes',
    table: 'station_lubrifiants',
    fields: [
      { key: 'designation', label: 'Désignation', type: 'text', required: true },
      { key: 'marque', label: 'Marque', type: 'text' },
      { key: 'viscosite', label: 'Viscosité', type: 'select', options: ['5W30', '5W40', '10W40', '15W40', '20W50', 'ATF', 'Autre'] },
      { key: 'conditionnement', label: 'Conditionnement', type: 'select', options: ['1L', '4L', '5L', '20L', '208L'] },
      { key: 'stock_actuel', label: 'Stock', type: 'number' },
      { key: 'seuil_alerte', label: 'Seuil alerte', type: 'number', default: 5 },
      { key: 'prix_achat', label: 'Prix achat', type: 'number', money: true },
      { key: 'prix_vente', label: 'Prix vente', type: 'number', money: true },
    ],
    rowTone: (r) => (n(r.stock_actuel) <= n(r.seuil_alerte) ? 'rose' : null),
    cards: [
      { label: 'Références', value: (r) => r.length },
      { label: 'En alerte stock', value: (r) => count(r, (x) => n(x.stock_actuel) <= n(x.seuil_alerte)), tone: 'rose' },
      { label: 'Valeur stock (achat)', value: (r) => fmtMoney(r.reduce((s, x) => s + n(x.stock_actuel) * n(x.prix_achat), 0)), tone: 'indigo' },
    ],
  },

  // ══════════════════════════ HÔTEL ══════════════════════════
  chambres_reservations: {
    title: 'Chambres & Réservations',
    description: 'Plan des chambres, check-in / check-out et nuitées',
    table: 'hotel_chambres',
    fields: [
      { key: 'numero_chambre', label: 'N° chambre', type: 'text', required: true },
      { key: 'type_chambre', label: 'Type', type: 'select', options: ['Simple', 'Double', 'Triple', 'Suite', 'VIP', 'Familiale'], default: 'Simple' },
      { key: 'etage', label: 'Étage', type: 'number', default: 1 },
      { key: 'tarif_nuit', label: 'Tarif/nuit', type: 'number', money: true, required: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['LIBRE', 'OCCUPEE', 'MAINTENANCE', 'RESERVEE'], default: 'LIBRE' },
      { key: 'client_actuel', label: 'Client', type: 'text' },
      { key: 'date_entree', label: 'Entrée', type: 'date' },
      { key: 'date_sortie_prevue', label: 'Sortie prévue', type: 'date' },
    ],
    statusKey: 'statut',
    orderBy: 'numero_chambre',
    rowTone: (r) => (r.statut === 'LIBRE' ? 'emerald' : r.statut === 'OCCUPEE' ? 'rose' : r.statut === 'MAINTENANCE' ? 'amber' : null),
    cards: [
      { label: 'Chambres libres', value: (r) => count(r, (x) => x.statut === 'LIBRE'), tone: 'emerald' },
      { label: 'Occupées', value: (r) => count(r, (x) => x.statut === 'OCCUPEE'), tone: 'rose' },
      { label: "Taux d'occupation", value: (r) => (r.length ? Math.round((count(r, (x) => x.statut === 'OCCUPEE') / r.length) * 100) + ' %' : '0 %'), tone: 'indigo' },
    ],
    actions: [
      {
        label: 'Check-in',
        show: (r) => r.statut === 'LIBRE' || r.statut === 'RESERVEE',
        apply: (r) => {
          const client = window.prompt(`Nom du client pour la chambre ${r.numero_chambre}`)
          if (!client) return null
          const nuits = askNumber('Nombre de nuits prévues') ?? 1
          const sortie = new Date(Date.now() + nuits * 86400000).toISOString().slice(0, 10)
          return { statut: 'OCCUPEE', client_actuel: client, date_entree: new Date().toISOString(), date_sortie_prevue: sortie }
        },
        tone: 'emerald',
      },
      {
        label: 'Check-out',
        show: (r) => r.statut === 'OCCUPEE',
        apply: (r) => {
          const nuits = Math.max(1, Math.ceil((Date.now() - new Date(r.date_entree || Date.now()).getTime()) / 86400000))
          const total = nuits * n(r.tarif_nuit)
          if (!window.confirm(`Check-out ${r.client_actuel || ''} — ${nuits} nuit(s) × ${fmtMoney(n(r.tarif_nuit))} = ${fmtMoney(total)}.\nConfirmer ?`)) return null
          return { statut: 'LIBRE', client_actuel: null, date_entree: null, date_sortie_prevue: null }
        },
        tone: 'rose',
      },
    ],
  },

  housekeeping: {
    title: 'Housekeeping',
    description: 'Planning de nettoyage des chambres',
    table: 'hotel_housekeeping',
    fields: [
      { key: 'chambre_numero', label: 'Chambre', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', default: today },
      { key: 'agent_nom', label: 'Agent', type: 'text', required: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['A_NETTOYER', 'EN_COURS', 'TERMINE', 'VERIFIE'], default: 'A_NETTOYER' },
      { key: 'priorite', label: 'Priorité', type: 'select', options: ['NORMALE', 'URGENTE'], default: 'NORMALE' },
      { key: 'heure_debut', label: 'Début', type: 'time' },
      { key: 'heure_fin', label: 'Fin', type: 'time' },
      { key: 'observations', label: 'Observations', type: 'textarea', hideInTable: true },
    ],
    statusKey: 'statut',
    orderBy: 'date',
    rowTone: (r) => (r.priorite === 'URGENTE' && r.statut !== 'TERMINE' && r.statut !== 'VERIFIE' ? 'rose' : null),
    cards: [
      { label: 'À nettoyer', value: (r) => count(r, (x) => x.statut === 'A_NETTOYER'), tone: 'amber' },
      { label: 'En cours', value: (r) => count(r, (x) => x.statut === 'EN_COURS'), tone: 'indigo' },
      { label: "Terminées aujourd'hui", value: (r) => count(r, (x) => isToday(x.date) && (x.statut === 'TERMINE' || x.statut === 'VERIFIE')), tone: 'emerald' },
    ],
    actions: [
      { label: 'Démarrer', show: (r) => r.statut === 'A_NETTOYER', apply: () => ({ statut: 'EN_COURS', heure_debut: new Date().toTimeString().slice(0, 5) }), tone: 'indigo' },
      { label: 'Terminer', show: (r) => r.statut === 'EN_COURS', apply: () => ({ statut: 'TERMINE', heure_fin: new Date().toTimeString().slice(0, 5) }), tone: 'emerald' },
    ],
  },

  // ══════════════════════════ GARAGE ══════════════════════════
  vehicules_reparations: {
    title: 'Véhicules',
    description: 'Véhicules en atelier et suivi de leur statut',
    table: 'garage_vehicules',
    fields: [
      { key: 'immatriculation', label: 'Immatriculation', type: 'text', required: true },
      { key: 'marque', label: 'Marque', type: 'text' },
      { key: 'modele', label: 'Modèle', type: 'text' },
      { key: 'annee', label: 'Année', type: 'number', hideInTable: true },
      { key: 'client_nom', label: 'Client', type: 'text', required: true },
      { key: 'client_tel', label: 'Téléphone', type: 'text' },
      { key: 'motif_entree', label: 'Motif', type: 'text' },
      { key: 'kilometrage', label: 'Km', type: 'number', hideInTable: true },
      { key: 'date_entree', label: 'Entrée', type: 'date', default: today },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EN_ATTENTE', 'EN_REPARATION', 'ATTENTE_PIECES', 'PRET', 'LIVRE'], default: 'EN_ATTENTE' },
    ],
    statusKey: 'statut',
    cards: [
      { label: 'En atelier', value: (r) => count(r, (x) => ['EN_ATTENTE', 'EN_REPARATION', 'ATTENTE_PIECES'].includes(x.statut)), tone: 'amber' },
      { label: 'Prêts à livrer', value: (r) => count(r, (x) => x.statut === 'PRET'), tone: 'emerald' },
      { label: 'Livrés ce mois', value: (r) => count(r, (x) => x.statut === 'LIVRE' && isThisMonth(x.date_sortie)), tone: 'indigo' },
    ],
    actions: [
      { label: 'Prêt', show: (r) => ['EN_ATTENTE', 'EN_REPARATION', 'ATTENTE_PIECES'].includes(r.statut), apply: () => ({ statut: 'PRET' }), tone: 'emerald' },
      { label: 'Livrer', show: (r) => r.statut === 'PRET', apply: () => ({ statut: 'LIVRE', date_sortie: today() }), tone: 'indigo' },
    ],
  },

  ordres_reparation: {
    title: 'Ordres de Réparation',
    description: 'Devis et ordres de travaux (pièces + main d’œuvre, TVA)',
    table: 'garage_ordres_reparation',
    refPrefix: 'OR',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'vehicule_immat', label: 'Véhicule', type: 'text', required: true },
      { key: 'client_nom', label: 'Client', type: 'text', required: true },
      { key: 'type_travaux', label: 'Travaux', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', hideInTable: true },
      { key: 'cout_pieces', label: 'Pièces', type: 'number', money: true },
      { key: 'cout_mo', label: "Main d'œuvre", type: 'number', money: true },
      { key: 'tva_pct', label: 'TVA %', type: 'number', default: 18, hideInTable: true },
      { key: 'total_ttc', label: 'Total TTC', type: 'number', money: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['DIAGNOSTIC', 'EN_COURS', 'ATTENTE_PIECES', 'PRET', 'LIVRE'], default: 'DIAGNOSTIC' },
      { key: 'date_sortie_prevue', label: 'Sortie prévue', type: 'date', hideInTable: true },
    ],
    statusKey: 'statut',
    compute: (r) => ({ ...r, total_ttc: Math.round((n(r.cout_pieces) + n(r.cout_mo)) * (1 + n(r.tva_pct) / 100)) }),
    cards: [
      { label: 'Ordres ouverts', value: (r) => count(r, (x) => x.statut !== 'LIVRE'), tone: 'amber' },
      { label: 'CA réparations (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.created_at)), 'total_ttc')), tone: 'emerald' },
      { label: 'Total TTC', value: (r) => fmtMoney(sum(r, 'total_ttc')), tone: 'indigo' },
    ],
  },

  // ══════════════════════════ MICROFINANCE / TONTINE ══════════════════════════
  membres_epargne: {
    title: 'Membres & Épargne',
    description: 'Adhérents, comptes et soldes d’épargne',
    table: 'microfinance_membres',
    refPrefix: 'MBR',
    fields: [
      { key: 'numero_membre', label: 'N° membre', type: 'text' },
      { key: 'nom_complet', label: 'Nom complet', type: 'text', required: true },
      { key: 'telephone', label: 'Téléphone', type: 'text' },
      { key: 'adresse', label: 'Adresse', type: 'text', hideInTable: true },
      { key: 'type_compte', label: 'Compte', type: 'select', options: ['Epargne', 'Courant', 'Credit'], default: 'Epargne' },
      { key: 'solde_epargne', label: 'Solde épargne', type: 'number', money: true, default: 0 },
      { key: 'agent_collecteur', label: 'Agent', type: 'text' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['ACTIF', 'SUSPENDU', 'FERME'], default: 'ACTIF' },
    ],
    statusKey: 'statut',
    cards: [
      { label: 'Membres actifs', value: (r) => count(r, (x) => x.statut === 'ACTIF') },
      { label: 'Épargne totale', value: (r) => fmtMoney(sum(r, 'solde_epargne')), tone: 'emerald' },
      { label: 'Solde moyen', value: (r) => fmtMoney(r.length ? sum(r, 'solde_epargne') / r.length : 0), tone: 'indigo' },
    ],
    actions: [
      { label: '+ Dépôt', show: (r) => r.statut === 'ACTIF', apply: (r) => { const m = askNumber(`Dépôt pour ${r.nom_complet}`); return m === null ? null : { solde_epargne: n(r.solde_epargne) + m } }, tone: 'emerald' },
      {
        label: '− Retrait', show: (r) => r.statut === 'ACTIF' && n(r.solde_epargne) > 0,
        apply: (r) => {
          const m = askNumber(`Retrait pour ${r.nom_complet} (solde ${fmtMoney(n(r.solde_epargne))})`)
          if (m === null) return null
          if (m > n(r.solde_epargne)) { window.alert('Solde insuffisant.'); return null }
          return { solde_epargne: n(r.solde_epargne) - m }
        },
        tone: 'rose',
      },
    ],
  },

  credits: {
    title: 'Crédits & Remboursements',
    description: 'Octroi de crédits, échéances et remboursements',
    table: 'microfinance_credits',
    refPrefix: 'CRD',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'membre_nom', label: 'Membre', type: 'text', required: true },
      { key: 'montant_accorde', label: 'Montant accordé', type: 'number', money: true, required: true },
      { key: 'taux_interet', label: 'Taux %', type: 'number', default: 10 },
      { key: 'duree_mois', label: 'Durée (mois)', type: 'number', default: 12 },
      { key: 'date_octroi', label: 'Octroi', type: 'date', default: today },
      { key: 'montant_total_du', label: 'Total dû', type: 'number', money: true },
      { key: 'montant_rembourse', label: 'Remboursé', type: 'number', money: true, default: 0 },
      { key: 'solde_restant', label: 'Solde', type: 'number', money: true },
      { key: 'prochaine_echeance', label: 'Prochaine échéance', type: 'date', hideInTable: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EN_COURS', 'REMBOURSE', 'EN_RETARD', 'ANNULE'], default: 'EN_COURS' },
    ],
    statusKey: 'statut',
    compute: (r) => {
      const total = Math.round(n(r.montant_accorde) * (1 + n(r.taux_interet) / 100))
      const solde = Math.max(0, total - n(r.montant_rembourse))
      return { ...r, montant_total_du: total, solde_restant: solde, statut: solde === 0 && total > 0 ? 'REMBOURSE' : r.statut }
    },
    rowTone: (r) => (r.statut === 'EN_RETARD' ? 'rose' : r.statut === 'REMBOURSE' ? 'emerald' : null),
    cards: [
      { label: 'Encours', value: (r) => fmtMoney(sum(r.filter((x) => x.statut !== 'ANNULE'), 'solde_restant')), tone: 'amber' },
      { label: 'Crédits en retard', value: (r) => count(r, (x) => x.statut === 'EN_RETARD'), tone: 'rose' },
      { label: 'Total remboursé', value: (r) => fmtMoney(sum(r, 'montant_rembourse')), tone: 'emerald' },
    ],
    actions: [
      {
        label: '+ Remboursement', show: (r) => n(r.solde_restant) > 0 && r.statut !== 'ANNULE',
        apply: (r) => {
          const m = askNumber(`Remboursement de ${r.membre_nom} (solde ${fmtMoney(n(r.solde_restant))}, mensualité ${fmtMoney(n(r.montant_total_du) / Math.max(1, n(r.duree_mois)))})`)
          if (m === null) return null
          const remb = n(r.montant_rembourse) + m
          const solde = Math.max(0, n(r.montant_total_du) - remb)
          return { montant_rembourse: remb, solde_restant: solde, statut: solde === 0 ? 'REMBOURSE' : r.statut === 'EN_RETARD' ? 'EN_RETARD' : 'EN_COURS' }
        },
        tone: 'emerald',
      },
    ],
  },

  agents_collecteurs: {
    title: 'Agents & Commissions',
    description: 'Agents collecteurs, zones et taux de commission',
    table: 'microfinance_agents',
    fields: [
      { key: 'nom_complet', label: 'Nom complet', type: 'text', required: true },
      { key: 'telephone', label: 'Téléphone', type: 'text' },
      { key: 'zone_collecte', label: 'Zone', type: 'text' },
      { key: 'nb_membres_actifs', label: 'Membres suivis', type: 'number', default: 0 },
      { key: 'commission_taux_pct', label: 'Commission %', type: 'number', default: 2 },
      { key: 'statut', label: 'Statut', type: 'select', options: ['ACTIF', 'INACTIF'], default: 'ACTIF' },
    ],
    statusKey: 'statut',
    cards: [
      { label: 'Agents actifs', value: (r) => count(r, (x) => x.statut === 'ACTIF'), tone: 'emerald' },
      { label: 'Zones couvertes', value: (r) => new Set(r.map((x) => x.zone_collecte).filter(Boolean)).size },
      { label: 'Membres suivis', value: (r) => sum(r, 'nb_membres_actifs'), tone: 'indigo' },
    ],
    actions: [
      {
        label: 'Calcul commission', show: () => true,
        apply: (r) => { const m = askNumber(`Épargne collectée par ${r.nom_complet} sur la période`); if (m !== null) window.alert(`Commission due : ${fmtMoney((m * n(r.commission_taux_pct)) / 100)}`); return null },
      },
    ],
  },

  tontine_cycles: {
    title: 'Cycles Tontine',
    description: 'Tontines, cotisations, tours et cagnottes',
    table: 'tontine_cycles',
    fields: [
      { key: 'nom_tontine', label: 'Tontine', type: 'text', required: true },
      { key: 'nb_participants', label: 'Participants', type: 'number', required: true },
      { key: 'montant_cotisation', label: 'Cotisation', type: 'number', money: true, required: true },
      { key: 'periodicite', label: 'Périodicité', type: 'select', options: ['Quotidienne', 'Hebdomadaire', 'Mensuelle'], default: 'Mensuelle' },
      { key: 'date_debut', label: 'Début', type: 'date', default: today },
      { key: 'tour_actuel', label: 'Tour', type: 'number', default: 1 },
      { key: 'cagnotte_actuelle', label: 'Cagnotte', type: 'number', money: true, default: 0 },
      { key: 'statut', label: 'Statut', type: 'select', options: ['ACTIF', 'TERMINE', 'SUSPENDU'], default: 'ACTIF' },
    ],
    statusKey: 'statut',
    cards: [
      { label: 'Tontines actives', value: (r) => count(r, (x) => x.statut === 'ACTIF'), tone: 'emerald' },
      { label: 'Cagnottes en cours', value: (r) => fmtMoney(sum(r, 'cagnotte_actuelle')), tone: 'indigo' },
      { label: 'Participants', value: (r) => sum(r, 'nb_participants') },
    ],
    actions: [
      { label: '+ Cotisations', show: (r) => r.statut === 'ACTIF', apply: (r) => { const p = askNumber(`Nombre de participants ayant cotisé (sur ${r.nb_participants})`); return p === null ? null : { cagnotte_actuelle: n(r.cagnotte_actuelle) + p * n(r.montant_cotisation) } }, tone: 'emerald' },
      {
        label: 'Verser le tour', show: (r) => r.statut === 'ACTIF' && n(r.cagnotte_actuelle) > 0,
        apply: (r) => {
          if (!window.confirm(`Verser ${fmtMoney(n(r.cagnotte_actuelle))} au bénéficiaire du tour ${r.tour_actuel} ?`)) return null
          const next = n(r.tour_actuel) + 1
          return { cagnotte_actuelle: 0, tour_actuel: next, statut: next > n(r.nb_participants) ? 'TERMINE' : 'ACTIF' }
        },
        tone: 'indigo',
      },
    ],
  },

  // ══════════════════════════ IMPRIMERIE ══════════════════════════
  devis_production: {
    title: 'Devis & Production',
    description: 'Devis, BAT et suivi de production',
    table: 'impression_devis',
    refPrefix: 'DEV',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'client_nom', label: 'Client', type: 'text', required: true },
      { key: 'type_travail', label: 'Type', type: 'select', options: ['Offset', 'Numerique', 'Serigraphie', 'Broderie', 'Flex', 'Autre'], default: 'Numerique' },
      { key: 'description', label: 'Description', type: 'textarea', hideInTable: true },
      { key: 'quantite', label: 'Qté', type: 'number', default: 1 },
      { key: 'format', label: 'Format', type: 'text' },
      { key: 'prix_unitaire', label: 'PU', type: 'number', money: true },
      { key: 'total', label: 'Total', type: 'number', money: true },
      { key: 'date_livraison', label: 'Livraison', type: 'date' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['DEVIS', 'BAT_ENVOYE', 'BAT_VALIDE', 'EN_PRODUCTION', 'LIVRE', 'ANNULE'], default: 'DEVIS' },
    ],
    statusKey: 'statut',
    compute: (r) => ({ ...r, total: n(r.quantite) * n(r.prix_unitaire) }),
    cards: [
      { label: 'Devis en cours', value: (r) => count(r, (x) => !['LIVRE', 'ANNULE'].includes(x.statut)), tone: 'amber' },
      { label: 'En production', value: (r) => count(r, (x) => x.statut === 'EN_PRODUCTION'), tone: 'indigo' },
      { label: 'CA livré (mois)', value: (r) => fmtMoney(sum(r.filter((x) => x.statut === 'LIVRE' && isThisMonth(x.created_at)), 'total')), tone: 'emerald' },
    ],
    actions: [
      {
        label: 'Étape suivante', show: (r) => !['LIVRE', 'ANNULE'].includes(r.statut),
        apply: (r) => {
          const flow = ['DEVIS', 'BAT_ENVOYE', 'BAT_VALIDE', 'EN_PRODUCTION', 'LIVRE']
          const i = flow.indexOf(r.statut)
          return { statut: flow[Math.min(flow.length - 1, i + 1)] }
        },
        tone: 'indigo',
      },
    ],
  },

  sous_traitance: {
    title: 'Sous-traitance',
    description: 'Travaux confiés à des partenaires et marge réalisée',
    table: 'impression_sous_traitance',
    refPrefix: 'ST',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'fournisseur_nom', label: 'Sous-traitant', type: 'text', required: true },
      { key: 'type_prestation', label: 'Prestation', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', hideInTable: true },
      { key: 'montant_ht', label: 'Coût', type: 'number', money: true },
      { key: 'montant_facture_client', label: 'Facturé client', type: 'number', money: true },
      { key: 'marge', label: 'Marge', type: 'number', money: true },
      { key: 'date_commande', label: 'Commande', type: 'date', default: today },
      { key: 'date_livraison', label: 'Livraison', type: 'date', hideInTable: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EN_ATTENTE', 'RECU', 'FACTURE'], default: 'EN_ATTENTE' },
    ],
    statusKey: 'statut',
    compute: (r) => ({ ...r, marge: n(r.montant_facture_client) - n(r.montant_ht) }),
    rowTone: (r) => (n(r.marge) < 0 ? 'rose' : null),
    cards: [
      { label: 'Commandes en attente', value: (r) => count(r, (x) => x.statut === 'EN_ATTENTE'), tone: 'amber' },
      { label: 'Marge (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date_commande)), 'marge')), tone: 'emerald' },
      { label: 'Coût sous-traitance', value: (r) => fmtMoney(sum(r, 'montant_ht')), tone: 'rose' },
    ],
  },

  // ══════════════════════════ GESTION LOCATIVE ══════════════════════════
  biens_locations: {
    title: 'Biens & Logements',
    description: 'Parc immobilier, statut et loyers',
    table: 'location_biens',
    refPrefix: 'BIEN',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'type_bien', label: 'Type', type: 'select', options: ['Appartement', 'Studio', 'Villa', 'Bureau', 'Magasin', 'Terrain', 'Autre'], default: 'Appartement' },
      { key: 'adresse', label: 'Adresse', type: 'text', required: true },
      { key: 'superficie_m2', label: 'm²', type: 'number' },
      { key: 'nb_pieces', label: 'Pièces', type: 'number' },
      { key: 'loyer_mensuel', label: 'Loyer', type: 'number', money: true },
      { key: 'locataire_actuel', label: 'Locataire', type: 'text' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['LIBRE', 'OCCUPE', 'EN_TRAVAUX'], default: 'LIBRE' },
    ],
    statusKey: 'statut',
    rowTone: (r) => (r.statut === 'LIBRE' ? 'emerald' : r.statut === 'EN_TRAVAUX' ? 'amber' : null),
    cards: [
      { label: 'Biens', value: (r) => r.length },
      { label: "Taux d'occupation", value: (r) => (r.length ? Math.round((count(r, (x) => x.statut === 'OCCUPE') / r.length) * 100) + ' %' : '0 %'), tone: 'indigo' },
      { label: 'Loyers mensuels (occupés)', value: (r) => fmtMoney(sum(r.filter((x) => x.statut === 'OCCUPE'), 'loyer_mensuel')), tone: 'emerald' },
    ],
  },

  contrats_loyers: {
    title: 'Contrats & Loyers',
    description: 'Baux, dépôts de garantie et échéances',
    table: 'location_contrats',
    refPrefix: 'CTR',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'bien_ref', label: 'Bien', type: 'text', required: true },
      { key: 'locataire_nom', label: 'Locataire', type: 'text', required: true },
      { key: 'locataire_tel', label: 'Téléphone', type: 'text' },
      { key: 'date_debut', label: 'Début', type: 'date', default: today, required: true },
      { key: 'date_fin', label: 'Fin', type: 'date' },
      { key: 'loyer_mensuel', label: 'Loyer', type: 'number', money: true },
      { key: 'depot_garantie', label: 'Dépôt', type: 'number', money: true, hideInTable: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['ACTIF', 'EXPIRE', 'RESILIE'], default: 'ACTIF' },
    ],
    statusKey: 'statut',
    rowTone: (r) => (r.statut === 'ACTIF' && daysUntil(r.date_fin) < 0 ? 'rose' : r.statut === 'ACTIF' && daysUntil(r.date_fin) <= 30 ? 'amber' : null),
    cards: [
      { label: 'Contrats actifs', value: (r) => count(r, (x) => x.statut === 'ACTIF'), tone: 'emerald' },
      { label: 'Expirent ≤ 30 jours', value: (r) => count(r, (x) => x.statut === 'ACTIF' && daysUntil(x.date_fin) >= 0 && daysUntil(x.date_fin) <= 30), tone: 'amber' },
      { label: 'Loyers contractuels', value: (r) => fmtMoney(sum(r.filter((x) => x.statut === 'ACTIF'), 'loyer_mensuel')), tone: 'indigo' },
    ],
  },

  quittances: {
    title: 'Quittances',
    description: 'Émission et encaissement des loyers mensuels',
    table: 'location_quittances',
    refPrefix: 'QTT',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'locataire_nom', label: 'Locataire', type: 'text', required: true },
      { key: 'bien_ref', label: 'Bien', type: 'text' },
      { key: 'mois_loyer', label: 'Mois (AAAA-MM)', type: 'text', required: true, default: thisMonth },
      { key: 'montant_loyer', label: 'Loyer', type: 'number', money: true, hideInTable: true },
      { key: 'charges', label: 'Charges', type: 'number', money: true, hideInTable: true, default: 0 },
      { key: 'montant_total', label: 'Total', type: 'number', money: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EMISE', 'PAYEE', 'EN_RETARD'], default: 'EMISE' },
      { key: 'date_paiement', label: 'Payée le', type: 'date' },
      { key: 'mode_paiement', label: 'Mode', type: 'select', options: ['', 'Especes', 'MoMo', 'Virement', 'Cheque'] },
    ],
    statusKey: 'statut',
    compute: (r) => ({ ...r, montant_total: n(r.montant_loyer) + n(r.charges) || n(r.montant_total) }),
    rowTone: (r) => (r.statut === 'EN_RETARD' ? 'rose' : r.statut === 'PAYEE' ? 'emerald' : null),
    cards: [
      { label: 'Encaissé (mois)', value: (r) => fmtMoney(sum(r.filter((x) => x.statut === 'PAYEE' && isThisMonth(x.date_paiement)), 'montant_total')), tone: 'emerald' },
      { label: 'Quittances en retard', value: (r) => count(r, (x) => x.statut === 'EN_RETARD'), tone: 'rose' },
      { label: 'Montant impayé', value: (r) => fmtMoney(sum(r.filter((x) => x.statut !== 'PAYEE'), 'montant_total')), tone: 'amber' },
    ],
    actions: [
      {
        label: 'Encaisser', show: (r) => r.statut !== 'PAYEE',
        apply: () => { const mode = window.prompt('Mode de paiement (Especes, MoMo, Virement, Cheque)', 'Especes'); if (!mode) return null; return { statut: 'PAYEE', date_paiement: today(), mode_paiement: ['Especes', 'MoMo', 'Virement', 'Cheque'].includes(mode) ? mode : 'Especes' } },
        tone: 'emerald',
      },
      { label: 'En retard', show: (r) => r.statut === 'EMISE', apply: () => ({ statut: 'EN_RETARD' }), tone: 'rose' },
    ],
  },

  // ══════════════════════════ POISSONNERIE ══════════════════════════
  chambres_froides: {
    title: 'Chambres Froides & T°',
    description: 'Surveillance des températures et remplissage',
    table: 'poissonnerie_chambres_froides',
    fields: [
      { key: 'nom_chambre', label: 'Chambre', type: 'text', required: true },
      { key: 'capacite_kg', label: 'Capacité (kg)', type: 'number' },
      { key: 'poids_actuel_kg', label: 'Stock (kg)', type: 'number', default: 0 },
      { key: 'produit_stocke', label: 'Produits', type: 'text' },
      { key: 'temperature_consigne', label: 'Consigne °C', type: 'number', default: -18 },
      { key: 'temperature_actuelle', label: 'Relevé °C', type: 'number' },
      { key: 'humidite', label: 'Humidité %', type: 'number', hideInTable: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['OK', 'ALERTE', 'PANNE'], default: 'OK' },
    ],
    statusKey: 'statut',
    compute: (r) => {
      if (r.statut === 'PANNE' || r.temperature_actuelle === '' || r.temperature_actuelle == null) return r
      return { ...r, statut: n(r.temperature_actuelle) > n(r.temperature_consigne) + 2 ? 'ALERTE' : 'OK' }
    },
    rowTone: (r) => (r.statut === 'PANNE' ? 'rose' : r.statut === 'ALERTE' ? 'amber' : 'emerald'),
    cards: [
      { label: 'Chambres', value: (r) => r.length },
      { label: 'En alerte / panne', value: (r) => count(r, (x) => x.statut !== 'OK'), tone: 'rose' },
      { label: 'Stock total (kg)', value: (r) => sum(r, 'poids_actuel_kg').toLocaleString('fr-FR'), tone: 'indigo' },
    ],
    actions: [
      {
        label: 'Relever T°', show: () => true,
        apply: (r) => {
          const t = askNumber(`Température relevée dans ${r.nom_chambre} (°C)`)
          if (t === null) return null
          return { temperature_actuelle: t, statut: r.statut === 'PANNE' ? 'PANNE' : t > n(r.temperature_consigne) + 2 ? 'ALERTE' : 'OK' }
        },
        tone: 'indigo',
      },
    ],
  },

  pesee_cartons: {
    title: 'Pesée Kg & Cartons',
    description: 'Ventes à la pesée : brut, tare, net et montant',
    table: 'poissonnerie_pesees',
    refPrefix: 'PES',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'produit_nom', label: 'Produit', type: 'text', required: true },
      { key: 'type_conditionnement', label: 'Unité', type: 'select', options: ['Kg', 'Carton', 'Piece'], default: 'Kg' },
      { key: 'poids_brut', label: 'Brut', type: 'number', required: true },
      { key: 'tare', label: 'Tare', type: 'number', default: 0 },
      { key: 'poids_net', label: 'Net', type: 'number' },
      { key: 'prix_unitaire', label: 'PU', type: 'number', money: true, required: true },
      { key: 'montant_total', label: 'Montant', type: 'number', money: true },
      { key: 'client_nom', label: 'Client', type: 'text' },
      { key: 'date_pesee', label: 'Date', type: 'date', default: today },
    ],
    orderBy: 'date_pesee',
    compute: (r) => {
      const net = Math.max(0, n(r.poids_brut) - n(r.tare))
      return { ...r, poids_net: net, montant_total: Math.round(net * n(r.prix_unitaire)) }
    },
    cards: [
      { label: 'Kg vendus (jour)', value: (r) => sum(r.filter((x) => isToday(x.date_pesee) && x.type_conditionnement === 'Kg'), 'poids_net').toLocaleString('fr-FR') },
      { label: 'Cartons (jour)', value: (r) => sum(r.filter((x) => isToday(x.date_pesee) && x.type_conditionnement === 'Carton'), 'poids_net'), tone: 'indigo' },
      { label: 'CA pesée (jour)', value: (r) => fmtMoney(sum(r.filter((x) => isToday(x.date_pesee)), 'montant_total')), tone: 'emerald' },
    ],
  },

  avaries_peremption: {
    title: 'Avaries Frigorifiques',
    description: 'Pertes liées au froid, DLC ou contamination',
    table: 'poissonnerie_avaries',
    refPrefix: 'AVR',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'produit_nom', label: 'Produit', type: 'text', required: true },
      { key: 'chambre_froide', label: 'Chambre', type: 'text' },
      { key: 'quantite_kg', label: 'Qté (kg)', type: 'number', required: true },
      { key: 'motif_avarie', label: 'Motif', type: 'select', options: ['Panne_Froid', 'DLC', 'Contamination', 'Autre'], default: 'DLC' },
      { key: 'valeur_estimee', label: 'Perte', type: 'number', money: true },
      { key: 'action_prise', label: 'Action', type: 'select', options: ['Jete', 'Vendu_Solde', 'En_Attente'], default: 'En_Attente' },
      { key: 'date_constat', label: 'Date', type: 'date', default: today },
      { key: 'agent_constat', label: 'Agent', type: 'text', hideInTable: true },
      { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
    ],
    orderBy: 'date_constat',
    cards: [
      { label: 'Avaries (mois, kg)', value: (r) => sum(r.filter((x) => isThisMonth(x.date_constat)), 'quantite_kg').toLocaleString('fr-FR'), tone: 'amber' },
      { label: 'Perte estimée (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date_constat)), 'valeur_estimee')), tone: 'rose' },
      { label: 'Actions en attente', value: (r) => count(r, (x) => x.action_prise === 'En_Attente') },
    ],
  },

  // ══════════════════════════ QUINCAILLERIE ══════════════════════════
  materiaux_btp: {
    title: 'Ciment & Fers à Béton',
    description: 'Matériaux BTP : stock, prix gros/détail et alertes',
    table: 'quincaillerie_materiaux',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'designation', label: 'Désignation', type: 'text', required: true },
      { key: 'categorie', label: 'Catégorie', type: 'select', options: ['Ciment', 'Fer_Beton', 'Sable', 'Graviers', 'Plomberie', 'Electricite', 'Outillage', 'Peinture', 'Autre'], default: 'Ciment' },
      { key: 'unite', label: 'Unité', type: 'select', options: ['Sac', 'Tonne', 'Ml', 'M2', 'M3', 'Barreau', 'Piece', 'Litre', 'Kg'], default: 'Sac' },
      { key: 'stock_actuel', label: 'Stock', type: 'number', default: 0 },
      { key: 'seuil_alerte', label: 'Seuil', type: 'number', default: 5 },
      { key: 'prix_gros', label: 'Prix gros', type: 'number', money: true },
      { key: 'prix_detail', label: 'Prix détail', type: 'number', money: true },
      { key: 'fournisseur', label: 'Fournisseur', type: 'text', hideInTable: true },
      { key: 'specifications', label: 'Spécifications', type: 'textarea', hideInTable: true },
    ],
    rowTone: (r) => (n(r.stock_actuel) <= n(r.seuil_alerte) ? 'rose' : null),
    cards: [
      { label: 'Références BTP', value: (r) => r.length },
      { label: 'Alertes stock', value: (r) => count(r, (x) => n(x.stock_actuel) <= n(x.seuil_alerte)), tone: 'rose' },
      { label: 'Valeur stock (gros)', value: (r) => fmtMoney(r.reduce((s, x) => s + n(x.stock_actuel) * n(x.prix_gros), 0)), tone: 'indigo' },
    ],
  },

  conversions_unites: {
    title: 'Unités & Tonnes',
    description: 'Facteurs de conversion (sac → tonne, barreau → tonne…) et calculateur',
    table: 'quincaillerie_conversions',
    fields: [
      { key: 'materiau', label: 'Matériau', type: 'text', required: true },
      { key: 'unite_source', label: 'De', type: 'text', required: true },
      { key: 'unite_cible', label: 'Vers', type: 'text', required: true },
      { key: 'facteur_conversion', label: 'Facteur', type: 'number', required: true },
      { key: 'exemple_application', label: 'Exemple', type: 'text' },
    ],
    cards: [{ label: 'Conversions définies', value: (r) => r.length }],
    actions: [
      {
        label: 'Convertir', show: () => true,
        apply: (r) => {
          const q = askNumber(`Quantité en « ${r.unite_source} » à convertir en « ${r.unite_cible} »`)
          if (q !== null) window.alert(`${q} ${r.unite_source} = ${(q * n(r.facteur_conversion)).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} ${r.unite_cible}`)
          return null
        },
        tone: 'indigo',
      },
    ],
  },

  suivi_chantiers: {
    title: 'Chantiers & Camions',
    description: 'Chantiers clients, contrats et facturation',
    table: 'quincaillerie_chantiers',
    refPrefix: 'CHT',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'nom_chantier', label: 'Chantier', type: 'text', required: true },
      { key: 'client_nom', label: 'Client', type: 'text', required: true },
      { key: 'adresse_chantier', label: 'Adresse', type: 'text', hideInTable: true },
      { key: 'chef_chantier', label: 'Chef', type: 'text' },
      { key: 'date_debut', label: 'Début', type: 'date', default: today },
      { key: 'date_fin_prevue', label: 'Fin prévue', type: 'date' },
      { key: 'montant_contrat', label: 'Contrat', type: 'number', money: true },
      { key: 'montant_facture', label: 'Facturé', type: 'number', money: true, default: 0 },
      { key: 'statut', label: 'Statut', type: 'select', options: ['EN_COURS', 'LIVRE', 'PAUSE', 'ANNULE'], default: 'EN_COURS' },
    ],
    statusKey: 'statut',
    cards: [
      { label: 'Chantiers actifs', value: (r) => count(r, (x) => x.statut === 'EN_COURS'), tone: 'emerald' },
      { label: 'Montant contrats', value: (r) => fmtMoney(sum(r, 'montant_contrat')), tone: 'indigo' },
      { label: 'Reste à facturer', value: (r) => fmtMoney(sum(r, 'montant_contrat') - sum(r, 'montant_facture')), tone: 'amber' },
    ],
    actions: [
      { label: '+ Livraison facturée', show: (r) => r.statut === 'EN_COURS', apply: (r) => { const m = askNumber(`Montant de la livraison facturée pour ${r.nom_chantier}`); return m === null ? null : { montant_facture: n(r.montant_facture) + m } }, tone: 'emerald' },
    ],
  },

  // ══════════════════════════ ÉVÉNEMENTIEL ══════════════════════════
  reservations_dates: {
    title: 'Planning Dates & Salles',
    description: 'Réservations d’événements, acomptes et soldes',
    table: 'evenementiel_reservations',
    refPrefix: 'EVT',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'client_nom', label: 'Client', type: 'text', required: true },
      { key: 'client_tel', label: 'Téléphone', type: 'text', hideInTable: true },
      { key: 'type_evenement', label: 'Type', type: 'select', options: ['Mariage', 'Bapteme', 'Conference', 'Anniversaire', 'Soiree', 'Gala', 'Autre'], default: 'Mariage' },
      { key: 'salle', label: 'Salle', type: 'text' },
      { key: 'date_evenement', label: 'Date', type: 'date', required: true },
      { key: 'heure_debut', label: 'Début', type: 'time', hideInTable: true },
      { key: 'heure_fin', label: 'Fin', type: 'time', hideInTable: true },
      { key: 'nb_personnes', label: 'Invités', type: 'number' },
      { key: 'total_prestation', label: 'Total', type: 'number', money: true },
      { key: 'acompte_verse', label: 'Acompte', type: 'number', money: true, default: 0 },
      { key: 'solde_restant', label: 'Solde', type: 'number', money: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['RESERVE', 'CONFIRME', 'EN_COURS', 'TERMINE', 'ANNULE'], default: 'RESERVE' },
    ],
    statusKey: 'statut',
    orderBy: 'date_evenement',
    compute: (r) => ({ ...r, solde_restant: Math.max(0, n(r.total_prestation) - n(r.acompte_verse)) }),
    cards: [
      { label: 'Événements ce mois', value: (r) => count(r, (x) => isThisMonth(x.date_evenement) && x.statut !== 'ANNULE') },
      { label: 'CA événements (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date_evenement) && x.statut !== 'ANNULE'), 'total_prestation')), tone: 'emerald' },
      { label: 'Soldes à encaisser', value: (r) => fmtMoney(sum(r.filter((x) => x.statut !== 'ANNULE'), 'solde_restant')), tone: 'amber' },
    ],
  },

  location_materiel: {
    title: 'Bâches, Chaises & Sono',
    description: 'Parc de matériel de location et disponibilités',
    table: 'evenementiel_materiel',
    fields: [
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'designation', label: 'Désignation', type: 'text', required: true },
      { key: 'categorie', label: 'Catégorie', type: 'select', options: ['Baches', 'Chaises', 'Tables', 'Sono', 'Eclairage', 'Tentes', 'Vaisselle', 'Autre'], default: 'Chaises' },
      { key: 'quantite_totale', label: 'Qté totale', type: 'number', required: true },
      { key: 'quantite_disponible', label: 'Disponible', type: 'number' },
      { key: 'prix_location_jour', label: 'Prix/jour', type: 'number', money: true },
      { key: 'statut', label: 'Statut', type: 'select', options: ['DISPONIBLE', 'LOUE', 'MAINTENANCE'], default: 'DISPONIBLE' },
    ],
    statusKey: 'statut',
    compute: (r) => {
      const tot = n(r.quantite_totale)
      const dispo = r.quantite_disponible === '' || r.quantite_disponible == null ? tot : Math.min(tot, n(r.quantite_disponible))
      return { ...r, quantite_disponible: dispo, statut: r.statut === 'MAINTENANCE' ? 'MAINTENANCE' : dispo === 0 ? 'LOUE' : 'DISPONIBLE' }
    },
    cards: [
      { label: 'Articles', value: (r) => sum(r, 'quantite_totale') },
      { label: 'Actuellement loués', value: (r) => sum(r, 'quantite_totale') - sum(r, 'quantite_disponible'), tone: 'amber' },
      { label: 'Disponibles', value: (r) => sum(r, 'quantite_disponible'), tone: 'emerald' },
    ],
    actions: [
      {
        label: 'Sortie', show: (r) => n(r.quantite_disponible) > 0,
        apply: (r) => { const q = askNumber(`Quantité sortie (disponible : ${r.quantite_disponible})`); if (q === null) return null; const d = Math.max(0, n(r.quantite_disponible) - q); return { quantite_disponible: d, statut: d === 0 ? 'LOUE' : 'DISPONIBLE' } },
        tone: 'amber',
      },
      {
        label: 'Retour', show: (r) => n(r.quantite_disponible) < n(r.quantite_totale),
        apply: (r) => { const q = askNumber('Quantité retournée'); if (q === null) return null; return { quantite_disponible: Math.min(n(r.quantite_totale), n(r.quantite_disponible) + q), statut: 'DISPONIBLE' } },
        tone: 'emerald',
      },
    ],
  },

  traiteur_prestations: {
    title: 'Prestations Traiteur',
    description: 'Menus, couverts et suivi des prestations',
    table: 'evenementiel_prestations_traiteur',
    refPrefix: 'TRT',
    fields: [
      { key: 'reference', label: 'Référence', type: 'text' },
      { key: 'client_nom', label: 'Client', type: 'text', required: true },
      { key: 'evenement_ref', label: 'Événement', type: 'text' },
      { key: 'type_menu', label: 'Menu', type: 'select', options: ['Menu_Standard', 'Menu_VIP', 'Cocktail', 'Buffet', 'Grillade', 'Autre'], default: 'Buffet' },
      { key: 'nb_couverts', label: 'Couverts', type: 'number', required: true },
      { key: 'prix_couvert', label: 'Prix/couvert', type: 'number', money: true, required: true },
      { key: 'montant_total', label: 'Total', type: 'number', money: true },
      { key: 'chef_cuisinier', label: 'Chef', type: 'text', hideInTable: true },
      { key: 'date_prestation', label: 'Date', type: 'date' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['DEVIS', 'CONFIRME', 'EN_PREPARATION', 'LIVRE'], default: 'DEVIS' },
    ],
    statusKey: 'statut',
    compute: (r) => ({ ...r, montant_total: n(r.nb_couverts) * n(r.prix_couvert) }),
    cards: [
      { label: 'Prestations (mois)', value: (r) => count(r, (x) => isThisMonth(x.date_prestation)) },
      { label: 'CA traiteur (mois)', value: (r) => fmtMoney(sum(r.filter((x) => isThisMonth(x.date_prestation)), 'montant_total')), tone: 'emerald' },
      { label: 'Couverts (mois)', value: (r) => sum(r.filter((x) => isThisMonth(x.date_prestation)), 'nb_couverts'), tone: 'indigo' },
    ],
  },

  // ══════════════════════════ BRASSERIE ══════════════════════════
  grilles_tarifaires: {
    title: 'Grilles Gros & Maquis',
    description: 'Prix spécifiques par type de client (grossiste, maquis, détail, VIP)',
    table: 'brasserie_grilles_tarifaires',
    refPrefix: 'GRL',
    fields: [
      { key: 'code_grille', label: 'Code', type: 'text' },
      { key: 'nom_grille', label: 'Grille', type: 'text', required: true },
      { key: 'type_client', label: 'Type client', type: 'select', options: ['GROSSISTE', 'MAQUIS', 'DETAIL', 'VIP', 'AUTRE'], default: 'MAQUIS' },
      { key: 'produit_nom', label: 'Produit', type: 'text', required: true },
      { key: 'prix_reference', label: 'Prix réf.', type: 'number', money: true, required: true },
      { key: 'prix_grille', label: 'Prix grille', type: 'number', money: true, required: true },
      { key: 'remise_pct', label: 'Remise %', type: 'number' },
      { key: 'quantite_min', label: 'Qté min', type: 'number', default: 1 },
      { key: 'date_debut', label: 'Début', type: 'date', default: today, hideInTable: true },
      { key: 'date_fin', label: 'Fin', type: 'date', hideInTable: true },
      { key: 'est_actif', label: 'Active', type: 'boolean', default: true },
    ],
    compute: (r) => {
      const ref = n(r.prix_reference)
      return { ...r, remise_pct: ref > 0 ? Number((((ref - n(r.prix_grille)) / ref) * 100).toFixed(2)) : 0 }
    },
    cards: [
      { label: 'Lignes actives', value: (r) => count(r, (x) => x.est_actif) , tone: 'emerald' },
      { label: 'Grilles distinctes', value: (r) => new Set(r.map((x) => x.nom_grille)).size },
      { label: 'Remise moyenne', value: (r) => (r.length ? (sum(r, 'remise_pct') / r.length).toFixed(1) + ' %' : '0 %'), tone: 'indigo' },
    ],
  },
}

/** Préfixe la référence côté client (évite les collisions des DEFAULT SQL à la seconde) */
export function generateRef(prefix: string): string {
  const d = new Date()
  const stamp = d.toISOString().slice(2, 10).replace(/-/g, '') + d.toTimeString().slice(0, 8).replace(/:/g, '')
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
}
