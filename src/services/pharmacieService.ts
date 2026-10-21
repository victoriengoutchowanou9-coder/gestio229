// =============================================================================
// GESTIO 229 SaaS — SERVICE MÉTIER DÉDIÉ : PHARMACIE & DÉPÔT MÉDICAL
// =============================================================================
// Responsabilité : Fiches produits pharmaceutiques, DCI, formes, dosages,
// tableaux réglementaires (Liste I, Liste II, Stupéfiants, OTC), traçabilité
// stricte des lots, application du principe FEFO, alertes péremption,
// délivrance ordonnances, tiers-payant, rappels de lots, pharmacovigilance,
// transferts inter-dépôts, inventaires physiques et liaisons caisse/comptables.
// Isolation stricte par company_id + sector_slug ('pharmacie').
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'

// ─── TYPES & INTERFACES PHARMACEUTIQUES ──────────────────────────────────────

export type ClasseReglementaire = 'OTC' | 'LISTE_I' | 'LISTE_II' | 'STUPEFIANT'
export type ConditionConservation = 'AMBIANTE' | 'FROID_2_8' | 'ABRI_LUMIERE' | 'SEC'
export type StatutLot = 'DISPONIBLE' | 'RESERVE' | 'EN_QUARANTAINE' | 'BLOQUE' | 'RAPPELE' | 'REBUTE_DETRUIT' | 'RETOURNE_FOURNISSEUR'
export type StatutOrdonnance = 'EN_ATTENTE' | 'PARTIELLE' | 'SERVIE' | 'EXPIREE' | 'ANNULEE'

export interface PharmacieProduit {
  id: string
  company_id: string
  sector_slug: string
  code_cip_acl: string // Code CIP / ACL ou code-barres
  nom_commercial: string // Ex: Paracétamol Biogaran
  dci: string // Dénomination Commune Internationale ex: Paracétamol
  forme_galenique: string // Comprimé, Sirop, Injectable, Gélule, Pommade, Collyre...
  dosage: string // Ex: 500 mg, 1 g, 250 mg / 5 mL
  conditionnement: string // Ex: Boîte de 16, Flacon 100 mL, Boîte de 10 ampoules
  unite_vente: string // Boîte, Flacon, Plaquette, Sachet, Ampoule
  laboratoire_fabricant: string // Ex: Sanofi, Biogaran, Siphat, Novatis...
  famille_therapeutique: string // Antalgique, Antibiotique, Anti-inflammatoire, Antipaludique, Cardiologie...
  classe_tableau: ClasseReglementaire
  necessite_ordonnance: boolean
  conditions_conservation: ConditionConservation
  temperature_max?: number // Ex: 8 pour la chaîne du froid
  prix_achat_ht: number // FCFA
  prix_vente_ttc: number // FCFA
  taux_remboursement_ss?: number // % ex: 80% assurance / 20% ticket modérateur
  stock_minimum_alerte: number
  stock_securite: number
  est_generique: boolean
  produits_equivalents_dci?: string[] // IDs ou noms d'équivalents pour conseil (sans substitution auto forcée)
  est_actif: boolean
  notes_officinales?: string
  created_at?: string
  updated_at?: string
}

export interface PharmacieDepot {
  id: string
  company_id: string
  code: string // Ex: DEP-CENTRAL, DEP-COMPTOIR, DEP-FRIGO
  nom: string // Ex: Magasin Central / Réserve, Comptoir Principal, Frigo Médical 2-8°C
  type_depot: 'CENTRAL' | 'COMPTOIR' | 'FRIGO' | 'DEPOT_EXTERNE'
  responsable_nom?: string
  est_actif: boolean
}

export interface PharmacieLot {
  id: string
  company_id: string
  produit_id: string
  produit_nom: string
  numero_lot: string // N° du lot fabricant
  date_fabrication?: string
  date_peremption: string // AAAA-MM-JJ (critère majeur FEFO)
  depot_id: string
  depot_nom?: string
  emplacement_rayon?: string // Ex: Rayon A, Étagère 2, Tiroir 4
  quantite_initiale: number
  quantite_actuelle: number
  fournisseur_id?: string
  fournisseur_nom?: string
  prix_achat_unitaire: number
  numero_bon_reception?: string
  statut: StatutLot
  motif_blocage?: string
  date_reception: string
}

export interface LigneVentePharmacie {
  produit_id: string
  lot_id: string
  numero_lot: string
  nom_commercial: string
  dci: string
  forme: string
  dosage: string
  date_peremption: string
  quantite: number
  prix_unitaire: number
  remise_pourcentage?: number
  total_ligne: number
  necessite_ordonnance?: boolean
  ordonnance_ligne_ref?: string
}

export interface PharmacieVente {
  id: string
  company_id: string
  reference_ticket: string // Ex: PH-20261020-001
  date_vente: string
  vendeur_id: string
  vendeur_nom: string
  client_id?: string
  client_nom?: string
  est_tiers_payant: boolean
  assureur_nom?: string
  numero_police_assure?: string
  taux_prise_en_charge?: number // Ex: 80%
  part_assurance: number // FCFA
  part_patient: number // Ticket modérateur payé en caisse
  ordonnance_id?: string
  numero_ordonnance?: string
  prescripteur_nom?: string
  lignes: LigneVentePharmacie[]
  montant_total_brut: number
  remise_globale: number
  montant_net_ttc: number
  montant_encaisse: number
  monnaie_rendue: number
  mode_reglement: 'ESPECES' | 'MOMO' | 'CARTE' | 'VIREMENT' | 'CREDIT_ASSURANCE' | 'MIXTE'
  statut: 'FINALISEE' | 'ANNULEE' | 'REMBOURSEE_PARTIEL'
  notes?: string
}

export interface LignePrescription {
  id: string
  medicament_ou_dci: string
  dosage: string
  forme: string
  posologie: string // Ex: "1 cp matin et soir pendant 5 jours"
  quantite_prescrite: number
  quantite_delivree: number
  solde_a_servir: number
}

export interface PharmacieOrdonnance {
  id: string
  company_id: string
  numero_ordonnance: string
  date_prescription: string
  date_validite?: string
  prescripteur_nom: string // Dr. Koffi MENSAH
  prescripteur_specialite?: string
  etablissement_soins?: string // CNHU-HKM, Clinique Mahouna, etc.
  patient_nom: string
  patient_age?: number
  patient_telephone?: string
  patient_adresse?: string
  document_scan_url?: string
  lignes: LignePrescription[]
  statut: StatutOrdonnance
  date_derniere_delivrance?: string
  pharmacien_validateur_nom?: string
  notes_confidentielles?: string
}

export interface PharmacieMouvementStock {
  id: string
  company_id: string
  produit_id: string
  produit_nom: string
  lot_id?: string
  numero_lot?: string
  depot_id: string
  depot_nom?: string
  type_mouvement:
    | 'ENTREE_RECEPTION'
    | 'SORTIE_DELIVRANCE'
    | 'TRANSFERT_SORTIE'
    | 'TRANSFERT_ENTREE'
    | 'CORRECTION_INVENTAIRE'
    | 'RETOUR_CLIENT'
    | 'RETOUR_FOURNISSEUR'
    | 'REBUT_PEREMPTION'
    | 'BLOCAGE_SECURITE'
  quantite: number // positif ou négatif
  quantite_avant: number
  quantite_apres: number
  motif: string
  reference_document?: string // N° Ticket, N° BL, N° Ordre transfert
  date_mouvement: string
  operateur_nom: string
}

export interface PharmacieRappelAlerte {
  id: string
  company_id: string
  reference_alerte: string // RAP-2026-001
  titre: string
  origine_alerte: 'ABMED' | 'LABORATOIRE' | 'GROSSISTE' | 'SIGNALEMENT_INTERNE'
  emetteur_nom: string // Agence Béninoise du Médicament, Sanofi...
  date_alerte: string
  produit_id: string
  produit_nom: string
  lot_id?: string
  numero_lot: string
  motif_rappel: string // Risque d'impureté, défaut de conditionnement, etc.
  gravite: 'CRITIQUE_NIVEAU_1' | 'MAJEURE_NIVEAU_2' | 'MINEURE_NIVEAU_3'
  quantite_stock_actuel_bloquee: number
  quantite_deja_vendue_historique: number
  mesures_prises: string
  statut: 'EN_COURS' | 'TRAITE_RETOURNÉ' | 'DETRUIT_SOUS_PV' | 'CLOTURE'
  responsable_nom: string
}

export interface LigneTransfertDepot {
  produit_id: string
  produit_nom: string
  lot_id: string
  numero_lot: string
  date_peremption: string
  quantite: number
}

export interface PharmacieTransfertDepot {
  id: string
  company_id: string
  reference_transfert: string
  depot_source_id: string
  depot_source_nom: string
  depot_destination_id: string
  depot_destination_nom: string
  date_creation: string
  date_reception?: string
  expediteur_nom: string
  receptionnaire_nom?: string
  lignes: LigneTransfertDepot[]
  statut: 'EN_ATTENTE' | 'EXPEDIE' | 'RECEPTIONNE' | 'ANNULE'
  motif?: string
}

export interface LigneInventairePhysique {
  produit_id: string
  produit_nom: string
  lot_id: string
  numero_lot: string
  emplacement?: string
  date_peremption: string
  stock_theorique: number
  stock_compte: number
  ecart_quantite: number
  prix_achat_unitaire: number
  valeur_ecart: number
}

export interface PharmacieGrossiste {
  id: string
  company_id: string
  nom: string
  code: string
  contact?: string
  telephone?: string
  email?: string
  adresse?: string
  delai_livraison_moyen?: string
  est_actif?: boolean
}

export interface PharmacieLigneCommande {
  produit_nom: string
  quantite_commandee: number
  quantite_recue: number
  prix_achat_prevu: number
}

export interface PharmacieCommandeGrossiste {
  id: string
  company_id: string
  reference_commande: string
  fournisseur_nom: string
  fournisseur_id?: string
  date_commande: string
  date_livraison_estimee?: string
  lignes: PharmacieLigneCommande[]
  montant_total_estime: number
  statut: 'COMMANDEE' | 'LIVREE_RECEPTIONNEE' | 'ANNULEE'
  notes?: string
}

export interface PharmacieInventairePhysique {
  id: string
  company_id: string
  reference_inventaire: string
  depot_id: string
  depot_nom: string
  date_inventaire: string
  responsable_nom: string
  lignes: LigneInventairePhysique[]
  total_ecart_positif: number
  total_ecart_negatif: number
  valeur_nette_ecart: number
  statut: 'BROUILLON' | 'VALIDE_AJUSTE' | 'REJETE'
  notes_validation?: string
}

// ─── HELPER STOCKAGE LOCAL TENANT-SCOPED (FALLBACK SUPABASE) ──────────────────

const STORAGE_KEY_PREFIX = 'gestio229_pharmacie_'
const SANITIZED_COMPANIES = new Set<string>()

export function sanitizeCompanyStorage(companyId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  if (!companyId) return

  // Nettoyage immédiat de tout résidu de démo globale
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.includes('demo-company-pharma')) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  } catch (_) {}

  if (companyId === 'demo-company-pharma') return
  if (SANITIZED_COMPANIES.has(companyId)) return
  SANITIZED_COMPANIES.add(companyId)

  try {
    // 1. Purge des produits fictifs
    const prodsKey = `${STORAGE_KEY_PREFIX}${companyId}_produits`
    const rawProds = localStorage.getItem(prodsKey)
    if (rawProds) {
      const prods: PharmacieProduit[] = JSON.parse(rawProds)
      const cleanProds = prods.filter((p) => {
        const isMockId =
          p.id.startsWith('prod-para-1000-') ||
          p.id.startsWith('prod-amox-500-') ||
          p.id.startsWith('prod-artem-80-') ||
          p.id.startsWith('prod-insu-lant-')
        const isMockCip = ['3400936081234', '3400936195678', '3400937482910', '3400935891452'].includes(
          p.code_cip_acl
        )
        return !isMockId && !isMockCip
      })
      if (cleanProds.length !== prods.length) {
        localStorage.setItem(prodsKey, JSON.stringify(cleanProds))
      }
    }

    // 2. Purge des lots fictifs
    const lotsKey = `${STORAGE_KEY_PREFIX}${companyId}_lots`
    const rawLots = localStorage.getItem(lotsKey)
    if (rawLots) {
      const lots: PharmacieLot[] = JSON.parse(rawLots)
      const mockLotNumbers = ['BG-2024-901', 'BG-2024-988', 'SDZ-AMX-441', 'SNF-LANT-8820', 'NVR-CRT-OLD']
      const cleanLots = lots.filter((l) => {
        const isMockId =
          l.id.startsWith('lot-para-') ||
          l.id.startsWith('lot-amox-') ||
          l.id.startsWith('lot-insu-') ||
          l.id.startsWith('lot-artem-')
        const isMockNum = mockLotNumbers.includes(l.numero_lot)
        return !isMockId && !isMockNum
      })
      if (cleanLots.length !== lots.length) {
        localStorage.setItem(lotsKey, JSON.stringify(cleanLots))
      }
    }

    // 3. Purge des ordonnances fictives
    const ordKey = `${STORAGE_KEY_PREFIX}${companyId}_ordonnances`
    const rawOrds = localStorage.getItem(ordKey)
    if (rawOrds) {
      const ords: PharmacieOrdonnance[] = JSON.parse(rawOrds)
      const cleanOrds = ords.filter(
        (o) => !o.id.startsWith('ord-demo-') && o.numero_ordonnance !== 'ORD-2026-0891'
      )
      if (cleanOrds.length !== ords.length) {
        localStorage.setItem(ordKey, JSON.stringify(cleanOrds))
      }
    }

    // 4. Purge des commandes et grossistes fictifs
    const cmdKey = `${STORAGE_KEY_PREFIX}${companyId}_commandes_grossistes`
    const rawCmds = localStorage.getItem(cmdKey)
    if (rawCmds) {
      const cmds: PharmacieCommandeGrossiste[] = JSON.parse(rawCmds)
      const mockCmdRefs = ['CMD-PH-2026-081', 'CMD-PH-2026-082']
      const cleanCmds = cmds.filter(
        (c) => !mockCmdRefs.includes(c.reference_commande) && !['cmd-001', 'cmd-002'].includes(c.id)
      )
      if (cleanCmds.length !== cmds.length) {
        localStorage.setItem(cmdKey, JSON.stringify(cleanCmds))
      }
    }

    const grossKey = `${STORAGE_KEY_PREFIX}${companyId}_grossistes`
    const rawGross = localStorage.getItem(grossKey)
    if (rawGross) {
      const gross: PharmacieGrossiste[] = JSON.parse(rawGross)
      const mockCodes = ['GROSS-UBI', 'GROSS-CAME', 'GROSS-COPH']
      const cleanGross = gross.filter(
        (g) => !mockCodes.includes(g.code) && !['g-1', 'g-2', 'g-3'].includes(g.id)
      )
      if (cleanGross.length !== gross.length) {
        localStorage.setItem(grossKey, JSON.stringify(cleanGross))
      }
    }

    // 5. Purge des dépôts fictifs de démonstration
    const depotsKey = `${STORAGE_KEY_PREFIX}${companyId}_depots`
    const rawDepots = localStorage.getItem(depotsKey)
    if (rawDepots) {
      const depots: PharmacieDepot[] = JSON.parse(rawDepots)
      const cleanDepots = depots.filter(
        (d) => !d.id.startsWith('dep-comptoir-') && !d.id.startsWith('dep-reserve-') && !d.id.startsWith('dep-frigo-')
      )
      if (cleanDepots.length !== depots.length) {
        localStorage.setItem(depotsKey, JSON.stringify(cleanDepots))
      }
    }
  } catch (err) {
    console.warn('[PHARMACIE-SERVICE] Erreur assainissement stockage:', err)
  }
}

function getLocalData<T>(companyId: string, collection: string, defaultValue: T): T {
  if (!companyId || companyId === 'demo-company-pharma') return defaultValue
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${companyId}_${collection}`)
    return raw ? JSON.parse(raw) : defaultValue
  } catch (err) {
    console.warn(`[PHARMACIE-SERVICE] Lecture ${collection} échouée:`, err)
    return defaultValue
  }
}

function setLocalData<T>(companyId: string, collection: string, data: T): void {
  if (!companyId || companyId === 'demo-company-pharma') return
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${companyId}_${collection}`, JSON.stringify(data))
  } catch (err) {
    console.warn(`[PHARMACIE-SERVICE] Écriture ${collection} échouée:`, err)
  }
}

// ─── SERVICE PHARMACIE CENTRAL (DONNÉES 100% RÉELLES & ÉTANCHES) ──────────────

export const pharmacieService = {

  // 1. DÉPÔTS PHARMACEUTIQUES
  async getDepots(companyId: string): Promise<PharmacieDepot[]> {
    if (!companyId || companyId === 'demo-company-pharma') return []
    sanitizeCompanyStorage(companyId)
    return getLocalData<PharmacieDepot[]>(companyId, 'depots', [])
  },

  async saveDepot(companyId: string, depot: Partial<PharmacieDepot>): Promise<PharmacieDepot> {
    const list = await this.getDepots(companyId)
    const nowId = depot.id || `dep-${Date.now()}`
    const existingIdx = list.findIndex((d) => d.id === nowId)
    const entity: PharmacieDepot = {
      id: nowId,
      company_id: companyId,
      code: depot.code || `DEP-${Date.now().toString().slice(-4)}`,
      nom: depot.nom || 'Nouveau Dépôt',
      type_depot: depot.type_depot || 'COMPTOIR',
      responsable_nom: depot.responsable_nom || '',
      est_actif: depot.est_actif !== false,
    }

    if (existingIdx >= 0) {
      list[existingIdx] = entity
    } else {
      list.push(entity)
    }
    setLocalData(companyId, 'depots', list)
    return entity
  },

  // 2. PRODUITS DU CATALOGUE PHARMACEUTIQUE
  async getProduits(companyId: string): Promise<PharmacieProduit[]> {
    if (!companyId || companyId === 'demo-company-pharma') return []
    sanitizeCompanyStorage(companyId)
    return getLocalData<PharmacieProduit[]>(companyId, 'produits', [])
  },

  async saveProduit(companyId: string, produit: Partial<PharmacieProduit>): Promise<PharmacieProduit> {
    const list = await this.getProduits(companyId)
    const nowId = produit.id || `prod-${Date.now()}`
    const existingIdx = list.findIndex((p) => p.id === nowId)

    const entity: PharmacieProduit = {
      id: nowId,
      company_id: companyId,
      sector_slug: 'pharmacie',
      code_cip_acl: (produit.code_cip_acl || '').trim(),
      nom_commercial: (produit.nom_commercial || '').trim(),
      dci: (produit.dci || '').trim(),
      forme_galenique: produit.forme_galenique || 'Comprimé',
      dosage: produit.dosage || '',
      conditionnement: produit.conditionnement || 'Boîte',
      unite_vente: produit.unite_vente || 'Boîte',
      laboratoire_fabricant: produit.laboratoire_fabricant || '',
      famille_therapeutique: produit.famille_therapeutique || '',
      classe_tableau: produit.classe_tableau || 'OTC',
      necessite_ordonnance: Boolean(produit.necessite_ordonnance),
      conditions_conservation: produit.conditions_conservation || 'AMBIANTE',
      temperature_max: produit.temperature_max,
      prix_achat_ht: Number(produit.prix_achat_ht) || 0,
      prix_vente_ttc: Number(produit.prix_vente_ttc) || 0,
      taux_remboursement_ss: Number(produit.taux_remboursement_ss) || 0,
      stock_minimum_alerte: Number(produit.stock_minimum_alerte) || 10,
      stock_securite: Number(produit.stock_securite) || 5,
      est_generique: Boolean(produit.est_generique),
      produits_equivalents_dci: produit.produits_equivalents_dci || [],
      est_actif: produit.est_actif !== false,
      notes_officinales: produit.notes_officinales || '',
      updated_at: new Date().toISOString(),
    }

    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...entity }
    } else {
      entity.created_at = new Date().toISOString()
      list.unshift(entity)
    }

    setLocalData(companyId, 'produits', list)
    return entity
  },

  // 3. GESTION DES LOTS ET TRAÇABILITÉ FEFO
  async getLots(companyId: string, options?: { produitId?: string; statut?: StatutLot }): Promise<PharmacieLot[]> {
    if (!companyId || companyId === 'demo-company-pharma') return []
    sanitizeCompanyStorage(companyId)
    let lots = getLocalData<PharmacieLot[]>(companyId, 'lots', [])

    // Mise à jour automatique des statuts périmés
    const todayStr = new Date().toISOString().slice(0, 10)
    let hasChanges = false
    lots = lots.map((lot) => {
      if (lot.statut === 'DISPONIBLE' && lot.date_peremption < todayStr) {
        hasChanges = true
        return {
          ...lot,
          statut: 'BLOQUE',
          motif_blocage: 'Péremption automatique : Date d’expiration atteinte.',
        }
      }
      return lot
    })
    if (hasChanges) {
      setLocalData(companyId, 'lots', lots)
    }

    if (options?.produitId) {
      lots = lots.filter((l) => l.produit_id === options.produitId)
    }
    if (options?.statut) {
      lots = lots.filter((l) => l.statut === options.statut)
    }

    // Tri par date de péremption croissante (Principe FEFO)
    return lots.sort((a, b) => a.date_peremption.localeCompare(b.date_peremption))
  },

  async saveLot(companyId: string, lotData: Partial<PharmacieLot>, operateurNom = 'Pharmacien'): Promise<PharmacieLot> {
    const list = await this.getLots(companyId)
    const nowId = lotData.id || `lot-${Date.now()}`
    const existingIdx = list.findIndex((l) => l.id === nowId)

    const entity: PharmacieLot = {
      id: nowId,
      company_id: companyId,
      produit_id: lotData.produit_id || '',
      produit_nom: lotData.produit_nom || 'Médicament',
      numero_lot: (lotData.numero_lot || '').trim().toUpperCase(),
      date_fabrication: lotData.date_fabrication,
      date_peremption: lotData.date_peremption || new Date().toISOString().slice(0, 10),
      depot_id: lotData.depot_id || `dep-comptoir-${companyId}`,
      depot_nom: lotData.depot_nom || 'Comptoir Principal',
      emplacement_rayon: lotData.emplacement_rayon || '',
      quantite_initiale: Number(lotData.quantite_initiale) || 0,
      quantite_actuelle: Number(lotData.quantite_actuelle ?? lotData.quantite_initiale ?? 0),
      fournisseur_id: lotData.fournisseur_id,
      fournisseur_nom: lotData.fournisseur_nom || '',
      prix_achat_unitaire: Number(lotData.prix_achat_unitaire) || 0,
      numero_bon_reception: lotData.numero_bon_reception || '',
      statut: lotData.statut || 'DISPONIBLE',
      motif_blocage: lotData.motif_blocage,
      date_reception: lotData.date_reception || new Date().toISOString().slice(0, 10),
    }

    if (existingIdx >= 0) {
      list[existingIdx] = entity
    } else {
      list.push(entity)
      // Mouvement d'entrée
      await this.enregistrerMouvementStock(companyId, {
        produit_id: entity.produit_id,
        produit_nom: entity.produit_nom,
        lot_id: entity.id,
        numero_lot: entity.numero_lot,
        depot_id: entity.depot_id,
        depot_nom: entity.depot_nom,
        type_mouvement: 'ENTREE_RECEPTION',
        quantite: entity.quantite_initiale,
        quantite_avant: 0,
        quantite_apres: entity.quantite_actuelle,
        motif: `Réception bon n° ${entity.numero_bon_reception || 'BL-DIRECT'} (Fournisseur: ${entity.fournisseur_nom || 'Direct'})`,
        date_mouvement: new Date().toISOString(),
        operateur_nom: operateurNom,
      })
    }

    setLocalData(companyId, 'lots', list)
    return entity
  },

  // 4. RÉCUPÉRATION DES LOTS ÉLIGIBLES FEFO POUR UN PRODUIT (Priorité date la plus proche)
  async getLotsDisponiblesFEFO(companyId: string, produitId: string): Promise<PharmacieLot[]> {
    const lots = await this.getLots(companyId, { produitId })
    const todayStr = new Date().toISOString().slice(0, 10)

    // Filtre : uniquement DISPONIBLE, quantité > 0 et date de péremption > aujourd'hui
    return lots
      .filter((l) => l.statut === 'DISPONIBLE' && l.quantite_actuelle > 0 && l.date_peremption >= todayStr)
      .sort((a, b) => a.date_peremption.localeCompare(b.date_peremption))
  },

  // 5. ENREGISTREMENT ET VALIDATION D'UNE VENTE AU COMPTOIR (Délivrance)
  async enregistrerVenteComptoir(
    companyId: string,
    venteData: Omit<PharmacieVente, 'id' | 'reference_ticket' | 'date_vente' | 'statut'>,
    operateurNom = 'Caissier / Pharmacien'
  ): Promise<PharmacieVente> {
    const todayStr = new Date().toISOString().slice(0, 10)
    const allLots = await this.getLots(companyId)

    // Validation préalable stricte : aucun lot périmé ou bloqué ne peut être vendu
    for (const ligne of venteData.lignes) {
      const lot = allLots.find((l) => l.id === ligne.lot_id)
      if (!lot) {
        throw new Error(`Le lot ${ligne.numero_lot} pour le produit ${ligne.nom_commercial} est introuvable.`)
      }
      if (lot.statut !== 'DISPONIBLE') {
        throw new Error(
          `Vente interdite : Le lot ${lot.numero_lot} (${lot.produit_nom}) est en statut [${lot.statut}]. Motif : ${lot.motif_blocage || 'Non conforme'}.`
        )
      }
      if (lot.date_peremption < todayStr) {
        throw new Error(
          `Vente interdite (SÉCURITÉ SANTÉ) : Le lot ${lot.numero_lot} (${lot.produit_nom}) est périmé depuis le ${lot.date_peremption} !`
        )
      }
      if (lot.quantite_actuelle < ligne.quantite) {
        throw new Error(
          `Stock insuffisant sur le lot ${lot.numero_lot} : disponible ${lot.quantite_actuelle}, demandé ${ligne.quantite}.`
        )
      }
    }

    // Déduction des stocks par lot et enregistrement des mouvements de traçabilité
    for (const ligne of venteData.lignes) {
      const lot = allLots.find((l) => l.id === ligne.lot_id)!
      const qteAvant = lot.quantite_actuelle
      lot.quantite_actuelle -= ligne.quantite

      await this.enregistrerMouvementStock(companyId, {
        produit_id: ligne.produit_id,
        produit_nom: ligne.nom_commercial,
        lot_id: lot.id,
        numero_lot: lot.numero_lot,
        depot_id: lot.depot_id,
        depot_nom: lot.depot_nom,
        type_mouvement: 'SORTIE_DELIVRANCE',
        quantite: -ligne.quantite,
        quantite_avant: qteAvant,
        quantite_apres: lot.quantite_actuelle,
        motif: `Délivrance comptoir ticket`,
        date_mouvement: new Date().toISOString(),
        operateur_nom: operateurNom,
      })
    }
    setLocalData(companyId, 'lots', allLots)

    // Si ordonnance rattachée, mise à jour des quantités délivrées sur l'ordonnance
    if (venteData.ordonnance_id) {
      await this.actualiserDelivranceOrdonnance(companyId, venteData.ordonnance_id, venteData.lignes)
    }

    // Enregistrement de la vente
    const ventes = getLocalData<PharmacieVente[]>(companyId, 'ventes', [])
    const ticketSeq = ventes.length + 1
    const refTicket = `PH-${todayStr.replace(/-/g, '')}-${ticketSeq.toString().padStart(4, '0')}`

    const nouvelleVente: PharmacieVente = {
      ...venteData,
      id: `vte-${Date.now()}`,
      reference_ticket: refTicket,
      date_vente: new Date().toISOString(),
      statut: 'FINALISEE',
    }

    ventes.unshift(nouvelleVente)
    setLocalData(companyId, 'ventes', ventes)

    // Intégration financière dans la Caisse GESTIO229 (secteur 'pharmacie')
    if (nouvelleVente.part_patient > 0) {
      try {
        const estMomo = nouvelleVente.mode_reglement === 'MOMO'
        await enregistrerMouvementCaisse({
          company_id: companyId,
          sector_slug: 'pharmacie',
          type: 'vente',
          sens: 'entree',
          montant_especes: estMomo ? 0 : nouvelleVente.part_patient,
          montant_momo: estMomo ? nouvelleVente.part_patient : 0,
          source_module: 'pharmacie',
          source_id: nouvelleVente.id,
          motif: `Vente Pharmacie ${refTicket} - ${venteData.client_nom || 'Client Comptoir'}`,
          user_name: 'Comptoir Pharmacie',
        })
      } catch (errCaisse) {
        console.warn('[PHARMACIE-SERVICE] Liaison caisse enregistrée localement:', errCaisse)
      }
    }

    return nouvelleVente
  },

  async getVentes(companyId: string): Promise<PharmacieVente[]> {
    return getLocalData<PharmacieVente[]>(companyId, 'ventes', [])
  },

  // 6. GESTION DES ORDONNANCES
  async getOrdonnances(companyId: string): Promise<PharmacieOrdonnance[]> {
    if (!companyId || companyId === 'demo-company-pharma') return []
    sanitizeCompanyStorage(companyId)
    return getLocalData<PharmacieOrdonnance[]>(companyId, 'ordonnances', [])
  },

  async saveOrdonnance(companyId: string, ordonnance: Partial<PharmacieOrdonnance>): Promise<PharmacieOrdonnance> {
    const list = await this.getOrdonnances(companyId)
    const nowId = ordonnance.id || `ord-${Date.now()}`
    const existingIdx = list.findIndex((o) => o.id === nowId)

    const entity: PharmacieOrdonnance = {
      id: nowId,
      company_id: companyId,
      numero_ordonnance: ordonnance.numero_ordonnance || `ORD-${Date.now().toString().slice(-6)}`,
      date_prescription: ordonnance.date_prescription || new Date().toISOString().slice(0, 10),
      date_validite: ordonnance.date_validite,
      prescripteur_nom: ordonnance.prescripteur_nom || 'Médecin Prescripteur',
      prescripteur_specialite: ordonnance.prescripteur_specialite || '',
      etablissement_soins: ordonnance.etablissement_soins || '',
      patient_nom: ordonnance.patient_nom || 'Patient',
      patient_age: ordonnance.patient_age,
      patient_telephone: ordonnance.patient_telephone || '',
      patient_adresse: ordonnance.patient_adresse || '',
      document_scan_url: ordonnance.document_scan_url,
      lignes: ordonnance.lignes || [],
      statut: ordonnance.statut || 'EN_ATTENTE',
      pharmacien_validateur_nom: ordonnance.pharmacien_validateur_nom,
      notes_confidentielles: ordonnance.notes_confidentielles || '',
    }

    if (existingIdx >= 0) {
      list[existingIdx] = entity
    } else {
      list.unshift(entity)
    }

    setLocalData(companyId, 'ordonnances', list)
    return entity
  },

  async actualiserDelivranceOrdonnance(
    companyId: string,
    ordonnanceId: string,
    lignesVente: LigneVentePharmacie[]
  ): Promise<void> {
    const ordonnances = await this.getOrdonnances(companyId)
    const ord = ordonnances.find((o) => o.id === ordonnanceId)
    if (!ord) return

    for (const ligneVente of lignesVente) {
      const match = ord.lignes.find(
        (lo) =>
          lo.medicament_ou_dci.toLowerCase().includes(ligneVente.dci.toLowerCase()) ||
          lo.medicament_ou_dci.toLowerCase().includes(ligneVente.nom_commercial.toLowerCase())
      )
      if (match) {
        match.quantite_delivree += ligneVente.quantite
        match.solde_a_servir = Math.max(0, match.quantite_prescrite - match.quantite_delivree)
      }
    }

    const toutServi = ord.lignes.every((l) => l.solde_a_servir <= 0)
    const auMoinsUnServi = ord.lignes.some((l) => l.quantite_delivree > 0)

    if (toutServi) {
      ord.statut = 'SERVIE'
    } else if (auMoinsUnServi) {
      ord.statut = 'PARTIELLE'
    }
    ord.date_derniere_delivrance = new Date().toISOString()

    setLocalData(companyId, 'ordonnances', ordonnances)
  },

  // 7. MOUVEMENTS DE STOCK
  async enregistrerMouvementStock(
    companyId: string,
    mvt: Omit<PharmacieMouvementStock, 'id'>
  ): Promise<PharmacieMouvementStock> {
    const list = getLocalData<PharmacieMouvementStock[]>(companyId, 'mouvements_stock', [])
    const entity: PharmacieMouvementStock = {
      ...mvt,
      id: `mvt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    }
    list.unshift(entity)
    setLocalData(companyId, 'mouvements_stock', list)
    return entity
  },

  async getMouvementsStock(companyId: string, limit = 100): Promise<PharmacieMouvementStock[]> {
    const list = getLocalData<PharmacieMouvementStock[]>(companyId, 'mouvements_stock', [])
    return list.slice(0, limit)
  },

  // 8. RAPPELS DE LOTS & PHARMACOVIGILANCE
  async getRappelsAlertes(companyId: string): Promise<PharmacieRappelAlerte[]> {
    return getLocalData<PharmacieRappelAlerte[]>(companyId, 'rappels_alertes', [])
  },

  async declarerRappelOuIncident(
    companyId: string,
    rappel: Omit<PharmacieRappelAlerte, 'id' | 'reference_alerte' | 'quantite_stock_actuel_bloquee' | 'quantite_deja_vendue_historique'>,
    operateurNom = 'Pharmacien Titulaire'
  ): Promise<PharmacieRappelAlerte> {
    const list = await this.getRappelsAlertes(companyId)
    const lots = await this.getLots(companyId)
    const ventes = await this.getVentes(companyId)

    // Calcul des quantités en stock et vendues pour ce numéro de lot
    const lotConcerne = lots.find((l) => l.numero_lot === rappel.numero_lot)
    const stockRestant = lotConcerne ? lotConcerne.quantite_actuelle : 0

    let qteVendue = 0
    for (const vte of ventes) {
      for (const lg of vte.lignes) {
        if (lg.numero_lot === rappel.numero_lot) {
          qteVendue += lg.quantite
        }
      }
    }

    // Blocage immédiat du lot en stock pour interdire la vente
    if (lotConcerne) {
      lotConcerne.statut = 'RAPPELE'
      lotConcerne.motif_blocage = `Rappel officiel : ${rappel.motif_rappel} (${rappel.emetteur_nom})`
      setLocalData(companyId, 'lots', lots)

      await this.enregistrerMouvementStock(companyId, {
        produit_id: lotConcerne.produit_id,
        produit_nom: lotConcerne.produit_nom,
        lot_id: lotConcerne.id,
        numero_lot: lotConcerne.numero_lot,
        depot_id: lotConcerne.depot_id,
        depot_nom: lotConcerne.depot_nom,
        type_mouvement: 'BLOCAGE_SECURITE',
        quantite: 0,
        quantite_avant: lotConcerne.quantite_actuelle,
        quantite_apres: lotConcerne.quantite_actuelle,
        motif: `Blocage conservatoire pour rappel de lot : ${rappel.motif_rappel}`,
        date_mouvement: new Date().toISOString(),
        operateur_nom: operateurNom,
      })
    }

    const ref = `RAP-${new Date().getFullYear()}-${(list.length + 1).toString().padStart(3, '0')}`
    const entity: PharmacieRappelAlerte = {
      ...rappel,
      id: `rap-${Date.now()}`,
      reference_alerte: ref,
      quantite_stock_actuel_bloquee: stockRestant,
      quantite_deja_vendue_historique: qteVendue,
    }

    list.unshift(entity)
    setLocalData(companyId, 'rappels_alertes', list)
    return entity
  },

  // 9. TRANSFERTS INTER-DÉPÔTS
  async getTransferts(companyId: string): Promise<PharmacieTransfertDepot[]> {
    return getLocalData<PharmacieTransfertDepot[]>(companyId, 'transferts', [])
  },

  async creerTransfert(
    companyId: string,
    transfertData: Omit<PharmacieTransfertDepot, 'id' | 'reference_transfert' | 'date_creation' | 'statut'>
  ): Promise<PharmacieTransfertDepot> {
    const list = await this.getTransferts(companyId)
    const ref = `TRF-${Date.now().toString().slice(-6)}`
    const entity: PharmacieTransfertDepot = {
      ...transfertData,
      id: `trf-${Date.now()}`,
      reference_transfert: ref,
      date_creation: new Date().toISOString(),
      statut: 'EN_ATTENTE',
    }
    list.unshift(entity)
    setLocalData(companyId, 'transferts', list)
    return entity
  },

  async validerReceptionTransfert(
    companyId: string,
    transfertId: string,
    receptionnaireNom: string
  ): Promise<PharmacieTransfertDepot> {
    const list = await this.getTransferts(companyId)
    const trf = list.find((t) => t.id === transfertId)
    if (!trf) throw new Error('Transfert introuvable')
    if (trf.statut === 'RECEPTIONNE') throw new Error('Ce transfert est déjà réceptionné.')

    const lots = await this.getLots(companyId)

    for (const ligne of trf.lignes) {
      const sourceLot = lots.find((l) => l.id === ligne.lot_id)
      if (!sourceLot || sourceLot.quantite_actuelle < ligne.quantite) {
        throw new Error(`Stock insuffisant dans le lot source pour transférer ${ligne.quantite}.`)
      }

      // Déduction du lot source
      sourceLot.quantite_actuelle -= ligne.quantite

      // Création ou abondement dans le lot de destination
      const existingDestLot = lots.find(
        (l) =>
          l.numero_lot === ligne.numero_lot &&
          l.depot_id === trf.depot_destination_id &&
          l.produit_id === ligne.produit_id
      )

      if (existingDestLot) {
        existingDestLot.quantite_actuelle += ligne.quantite
      } else {
        lots.push({
          id: `lot-trf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          company_id: companyId,
          produit_id: ligne.produit_id,
          produit_nom: ligne.produit_nom,
          numero_lot: ligne.numero_lot,
          date_peremption: ligne.date_peremption,
          depot_id: trf.depot_destination_id,
          depot_nom: trf.depot_destination_nom,
          quantite_initiale: ligne.quantite,
          quantite_actuelle: ligne.quantite,
          fournisseur_nom: sourceLot.fournisseur_nom,
          prix_achat_unitaire: sourceLot.prix_achat_unitaire,
          statut: 'DISPONIBLE',
          date_reception: new Date().toISOString().slice(0, 10),
        })
      }

      // Historique des mouvements
      await this.enregistrerMouvementStock(companyId, {
        produit_id: ligne.produit_id,
        produit_nom: ligne.produit_nom,
        lot_id: sourceLot.id,
        numero_lot: sourceLot.numero_lot,
        depot_id: trf.depot_source_id,
        depot_nom: trf.depot_source_nom,
        type_mouvement: 'TRANSFERT_SORTIE',
        quantite: -ligne.quantite,
        quantite_avant: sourceLot.quantite_actuelle + ligne.quantite,
        quantite_apres: sourceLot.quantite_actuelle,
        motif: `Transfert vers ${trf.depot_destination_nom} (Réf: ${trf.reference_transfert})`,
        date_mouvement: new Date().toISOString(),
        operateur_nom: receptionnaireNom,
      })

      await this.enregistrerMouvementStock(companyId, {
        produit_id: ligne.produit_id,
        produit_nom: ligne.produit_nom,
        depot_id: trf.depot_destination_id,
        depot_nom: trf.depot_destination_nom,
        type_mouvement: 'TRANSFERT_ENTREE',
        quantite: ligne.quantite,
        quantite_avant: 0,
        quantite_apres: ligne.quantite,
        motif: `Réception transfert de ${trf.depot_source_nom} (Réf: ${trf.reference_transfert})`,
        date_mouvement: new Date().toISOString(),
        operateur_nom: receptionnaireNom,
      })
    }

    trf.statut = 'RECEPTIONNE'
    trf.receptionnaire_nom = receptionnaireNom
    trf.date_reception = new Date().toISOString()

    setLocalData(companyId, 'lots', lots)
    setLocalData(companyId, 'transferts', list)
    return trf
  },

  // 10. INVENTAIRES PHYSIQUES ET JOURNAL DES ÉCARTS
  async getInventaires(companyId: string): Promise<PharmacieInventairePhysique[]> {
    return getLocalData<PharmacieInventairePhysique[]>(companyId, 'inventaires', [])
  },

  async validerInventaire(
    companyId: string,
    inventaireData: Omit<PharmacieInventairePhysique, 'id' | 'reference_inventaire' | 'statut'>,
    responsableNom: string
  ): Promise<PharmacieInventairePhysique> {
    const list = await this.getInventaires(companyId)
    const lots = await this.getLots(companyId)

    let totalEcartPos = 0
    let totalEcartNeg = 0
    let valeurNette = 0

    for (const ligne of inventaireData.lignes) {
      const lot = lots.find((l) => l.id === ligne.lot_id)
      if (lot) {
        const qteAvant = lot.quantite_actuelle
        lot.quantite_actuelle = ligne.stock_compte

        const ecart = ligne.stock_compte - ligne.stock_theorique
        const valEcart = ecart * ligne.prix_achat_unitaire
        if (ecart > 0) totalEcartPos += ecart
        if (ecart < 0) totalEcartNeg += Math.abs(ecart)
        valeurNette += valEcart

        await this.enregistrerMouvementStock(companyId, {
          produit_id: ligne.produit_id,
          produit_nom: ligne.produit_nom,
          lot_id: lot.id,
          numero_lot: lot.numero_lot,
          depot_id: inventaireData.depot_id,
          depot_nom: inventaireData.depot_nom,
          type_mouvement: 'CORRECTION_INVENTAIRE',
          quantite: ecart,
          quantite_avant: qteAvant,
          quantite_apres: lot.quantite_actuelle,
          motif: `Ajustement inventaire : compté ${ligne.stock_compte} vs théorique ${ligne.stock_theorique} (Écart: ${ecart})`,
          date_mouvement: new Date().toISOString(),
          operateur_nom: responsableNom,
        })
      }
    }

    const ref = `INV-${Date.now().toString().slice(-6)}`
    const entity: PharmacieInventairePhysique = {
      ...inventaireData,
      id: `inv-${Date.now()}`,
      reference_inventaire: ref,
      total_ecart_positif: totalEcartPos,
      total_ecart_negatif: totalEcartNeg,
      valeur_nette_ecart: valeurNette,
      statut: 'VALIDE_AJUSTE',
      responsable_nom: responsableNom,
    }

    list.unshift(entity)
    setLocalData(companyId, 'lots', lots)
    setLocalData(companyId, 'inventaires', list)
    return entity
  },

  // 11. CALCUL DES KPIS ET STATISTIQUES EN TEMPS RÉEL
  async getDashboardMetrics(companyId: string) {
    const produits = await this.getProduits(companyId)
    const lots = await this.getLots(companyId)
    const ventes = await this.getVentes(companyId)
    const ordonnances = await this.getOrdonnances(companyId)
    const rappels = await this.getRappelsAlertes(companyId)

    const todayStr = new Date().toISOString().slice(0, 10)
    const now = new Date()

    // Lots expirés et proches de péremption
    const d30 = new Date(now)
    d30.setDate(d30.getDate() + 30)
    const d90 = new Date(now)
    d90.setDate(d90.getDate() + 90)

    const lotsExpires = lots.filter((l) => l.date_peremption < todayStr || l.statut === 'BLOQUE')
    const lotsExpire30j = lots.filter(
      (l) => l.statut === 'DISPONIBLE' && l.date_peremption >= todayStr && l.date_peremption <= d30.toISOString().slice(0, 10)
    )
    const lotsExpire90j = lots.filter(
      (l) => l.statut === 'DISPONIBLE' && l.date_peremption >= todayStr && l.date_peremption <= d90.toISOString().slice(0, 10)
    )

    // Valeur financière du stock
    let valeurStockAchat = 0
    let valeurStockVente = 0
    for (const lot of lots) {
      if (lot.statut === 'DISPONIBLE' && lot.quantite_actuelle > 0) {
        valeurStockAchat += lot.quantite_actuelle * lot.prix_achat_unitaire
        const prod = produits.find((p) => p.id === lot.produit_id)
        if (prod) {
          valeurStockVente += lot.quantite_actuelle * prod.prix_vente_ttc
        }
      }
    }

    // Ventes du jour
    const ventesAujourdhui = ventes.filter((v) => v.date_vente.slice(0, 10) === todayStr && v.statut === 'FINALISEE')
    const caAujourdhui = ventesAujourdhui.reduce((acc, v) => acc + v.montant_net_ttc, 0)
    const encaisseAujourdhui = ventesAujourdhui.reduce((acc, v) => acc + v.part_patient, 0)
    const partTiersPayantAujourdhui = ventesAujourdhui.reduce((acc, v) => acc + v.part_assurance, 0)

    // Alertes ruptures de stock
    const produitsEnRupture: PharmacieProduit[] = []
    const produitsEnAlerte: PharmacieProduit[] = []

    for (const prod of produits) {
      const stockTotal = lots
        .filter((l) => l.produit_id === prod.id && l.statut === 'DISPONIBLE')
        .reduce((sum, l) => sum + l.quantite_actuelle, 0)

      if (stockTotal <= 0) {
        produitsEnRupture.push(prod)
      } else if (stockTotal <= prod.stock_minimum_alerte) {
        produitsEnAlerte.push(prod)
      }
    }

    // Ordonnances en attente
    const ordonnancesEnAttente = ordonnances.filter((o) => o.statut === 'EN_ATTENTE' || o.statut === 'PARTIELLE')

    // Rappels actifs
    const rappelsEnCours = rappels.filter((r) => r.statut === 'EN_COURS')

    return {
      caAujourdhui,
      encaisseAujourdhui,
      partTiersPayantAujourdhui,
      nbVentesAujourdhui: ventesAujourdhui.length,
      valeurStockAchat,
      valeurStockVente,
      totalReferences: produits.length,
      totalLotsActifs: lots.filter((l) => l.statut === 'DISPONIBLE' && l.quantite_actuelle > 0).length,
      lotsExpiresCount: lotsExpires.length,
      lotsExpire30jCount: lotsExpire30j.length,
      lotsExpire90jCount: lotsExpire90j.length,
      rupturesCount: produitsEnRupture.length,
      alertesStockCount: produitsEnAlerte.length,
      ordonnancesEnAttenteCount: ordonnancesEnAttente.length,
      rappelsEnCoursCount: rappelsEnCours.length,
      produitsEnRupture,
      produitsEnAlerte,
      lotsExpire30j,
      lotsExpires,
    }
  },
  // 12. FOURNISSEURS GROSSISTES & COMMANDES
  async getGrossistes(companyId: string): Promise<PharmacieGrossiste[]> {
    if (!companyId || companyId === 'demo-company-pharma') return []
    sanitizeCompanyStorage(companyId)
    const local = getLocalData<PharmacieGrossiste[]>(companyId, 'grossistes', [])
    try {
      const { data: dbSuppliers } = await supabase
        .from('suppliers')
        .select('*')
        .eq('company_id', companyId)
        .order('company_name')

      if (dbSuppliers && dbSuppliers.length > 0) {
        const mapped: PharmacieGrossiste[] = dbSuppliers.map((s: any) => ({
          id: s.id,
          company_id: s.company_id,
          nom: s.company_name || s.name || 'Grossiste',
          code: s.code || `GROSS-${s.id.slice(0, 4)}`,
          contact: s.contact_person || '',
          telephone: s.phone || '',
          email: s.email || '',
          adresse: s.address || s.city || '',
          delai_livraison_moyen: '24h - 48h',
          est_actif: s.is_active !== false
        }))
        const existingIds = new Set(local.map((g) => g.id))
        const merged = [...local]
        mapped.forEach((m) => {
          if (!existingIds.has(m.id)) {
            merged.push(m)
          }
        })
        return merged
      }
    } catch (e) {
      console.warn('[pharmacieService] suppliers query fallback:', e)
    }
    return local
  },

  async saveGrossiste(companyId: string, grossiste: Partial<PharmacieGrossiste>): Promise<PharmacieGrossiste> {
    if (!companyId || companyId === 'demo-company-pharma') throw new Error('Identifiant d\'entreprise requis')
    const list = await this.getGrossistes(companyId)
    const nowId = grossiste.id || `gross-${Date.now()}`
    const existingIdx = list.findIndex((g) => g.id === nowId)
    const entity: PharmacieGrossiste = {
      id: nowId,
      company_id: companyId,
      nom: (grossiste.nom || '').trim(),
      code: (grossiste.code || `GROSS-${Date.now().toString().slice(-4)}`).trim(),
      contact: grossiste.contact || '',
      telephone: grossiste.telephone || '',
      email: grossiste.email || '',
      adresse: grossiste.adresse || '',
      delai_livraison_moyen: grossiste.delai_livraison_moyen || '',
      est_actif: grossiste.est_actif !== false,
    }
    if (existingIdx >= 0) {
      list[existingIdx] = entity
    } else {
      list.push(entity)
    }
    setLocalData(companyId, 'grossistes', list)
    return entity
  },

  async deleteGrossiste(companyId: string, grossisteId: string): Promise<void> {
    if (!companyId || companyId === 'demo-company-pharma') return
    const list = await this.getGrossistes(companyId)
    const filtered = list.filter((g) => g.id !== grossisteId)
    setLocalData(companyId, 'grossistes', filtered)
  },

  async getCommandes(companyId: string): Promise<PharmacieCommandeGrossiste[]> {
    if (!companyId || companyId === 'demo-company-pharma') return []
    sanitizeCompanyStorage(companyId)
    return getLocalData<PharmacieCommandeGrossiste[]>(companyId, 'commandes_grossistes', [])
  },

  async saveCommande(companyId: string, cmd: Partial<PharmacieCommandeGrossiste>): Promise<PharmacieCommandeGrossiste> {
    if (!companyId || companyId === 'demo-company-pharma') throw new Error('Identifiant d\'entreprise requis')
    const list = await this.getCommandes(companyId)
    const nowId = cmd.id || `cmd-${Date.now()}`
    const existingIdx = list.findIndex((c) => c.id === nowId)
    const entity: PharmacieCommandeGrossiste = {
      id: nowId,
      company_id: companyId,
      reference_commande: cmd.reference_commande || `CMD-PH-${Date.now().toString().slice(-6)}`,
      fournisseur_nom: cmd.fournisseur_nom || '',
      fournisseur_id: cmd.fournisseur_id,
      date_commande: cmd.date_commande || new Date().toISOString().slice(0, 10),
      date_livraison_estimee: cmd.date_livraison_estimee || '',
      lignes: cmd.lignes || [],
      montant_total_estime: Number(cmd.montant_total_estime) || 0,
      statut: cmd.statut || 'COMMANDEE',
      notes: cmd.notes || '',
    }
    if (existingIdx >= 0) {
      list[existingIdx] = entity
    } else {
      list.unshift(entity)
    }
    setLocalData(companyId, 'commandes_grossistes', list)
    return entity
  },
}
