// =============================================================================
// GESTIO 229 SaaS — Service Métier Complet: Atelier, Garage & Mécanique
// Support des 2 versions métier : CLASSIC et BTP_MULTISITE
// =============================================================================

import { supabase } from '../lib/supabase'

export type GarageVersionMode = 'CLASSIC' | 'BTP_MULTISITE'

// ─── 1. GESTION PERSISTANTE DU MODE DE VERSION DE L'ÉTABLISSEMENT ─────────────

/**
 * Récupère le mode de version configuré pour l'entreprise ('CLASSIC' | 'BTP_MULTISITE' | null)
 */
export async function getGarageVersionMode(companyId: string): Promise<GarageVersionMode | null> {
  if (!companyId) return null
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('garage_version_mode')
      .eq('id', companyId)
      .maybeSingle()

    if (error) {
      console.warn('[garageService] Erreur lecture garage_version_mode:', error.message)
      // Fallback localstorage
      const local = localStorage.getItem(`gestio229_garage_mode_${companyId}`)
      return (local === 'CLASSIC' || local === 'BTP_MULTISITE') ? local : null
    }

    const mode = (data?.garage_version_mode as GarageVersionMode) || null
    if (mode) {
      localStorage.setItem(`gestio229_garage_mode_${companyId}`, mode)
    }
    return mode
  } catch (err) {
    console.warn('[garageService] Exception getGarageVersionMode:', err)
    return null
  }
}

/**
 * Enregistre le choix de la version en base de données pour l'entreprise
 */
export async function setGarageVersionMode(companyId: string, mode: GarageVersionMode): Promise<boolean> {
  if (!companyId) return false
  try {
    const { error } = await supabase
      .from('companies')
      .update({
        garage_version_mode: mode,
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId)

    if (error) {
      console.warn('[garageService] Erreur mise à jour garage_version_mode en base:', error.message)
    }

    localStorage.setItem(`gestio229_garage_mode_${companyId}`, mode)
    return true
  } catch (err) {
    console.error('[garageService] Exception setGarageVersionMode:', err)
    localStorage.setItem(`gestio229_garage_mode_${companyId}`, mode)
    return true
  }
}

// ─── 2. TYPES & INTERFACES VERSION 1 : GARAGE & MÉCANIQUE CLASSIQUE ──────────

export interface GarageVehicule {
  id: string
  company_id: string
  client_id?: string
  immatriculation: string
  marque: string
  modele: string
  annee?: number
  vin?: string
  carburant?: string
  motorisation?: string
  couleur?: string
  date_premiere_circulation?: string
  date_expiration_assurance?: string
  date_visite_technique?: string
  compteur_km: number
  client_nom: string
  client_telephone?: string
  notes?: string
  photos?: string[]
  statut: string
  created_at?: string
}

export interface GarageReception {
  id: string
  company_id: string
  numero_reception: string
  vehicule_id?: string
  immatriculation: string
  client_nom: string
  client_tel?: string
  date_reception: string
  receptionnaire?: string
  km_entree: number
  niveau_carburant: string
  plaintes_client?: string
  symptomes_constates?: string
  dommages_visibles?: string
  accessoires_remis: string[]
  checklist_securite?: Record<string, boolean>
  statut: string
  signature_client?: string
  created_at?: string
}

export interface GarageMecanicien {
  id: string
  company_id: string
  nom_complet: string
  telephone?: string
  specialite: string
  taux_horaire_facture: number
  taux_horaire_cout: number
  statut: string
  created_at?: string
}

export interface GarageDevisLigne {
  id?: string
  devis_id?: string
  type_ligne: 'PIECE' | 'MAIN_DOEUVRE' | 'SOUS_TRAITANCE'
  reference?: string
  designation: string
  quantite: number
  prix_unitaire_ht: number
  cout_achat_unitaire?: number
  remise_pct?: number
  montant_ht: number
}

export interface GarageDevis {
  id: string
  company_id: string
  numero_devis: string
  reception_id?: string
  vehicule_id?: string
  immatriculation: string
  client_nom: string
  client_id?: string
  date_emission: string
  date_validite?: string
  statut: 'BROUILLON' | 'EN_ATTENTE_CLIENT' | 'ACCEPTE' | 'REFUSE' | 'CONVERTI_OR'
  total_pieces_ht: number
  total_mo_ht: number
  total_ss_traitance_ht: number
  montant_remise: number
  taux_tva: number
  montant_tva: number
  montant_total_ttc: number
  notes?: string
  lignes?: GarageDevisLigne[]
  created_at?: string
}

export interface GarageOrdreLigne {
  id?: string
  ordre_id?: string
  product_id?: string
  type_ligne: 'PIECE' | 'MAIN_DOEUVRE' | 'SOUS_TRAITANCE'
  reference?: string
  designation: string
  quantite: number
  prix_unitaire_ht: number
  cout_achat_unitaire?: number
  remise_pct?: number
  montant_ht: number
  mecanicien_nom?: string
  heures_effectives?: number
  statut_execution?: string
}

export interface GarageOrdreReparation {
  id: string
  company_id: string
  numero_or: string
  devis_id?: string
  reception_id?: string
  vehicule_id?: string
  immatriculation: string
  client_nom: string
  client_id?: string
  mecanicien_id?: string
  mecanicien_nom?: string
  statut: 'PLANIFIE' | 'EN_COURS' | 'ATTENTE_PIECES' | 'CONTROLE_QUALITE' | 'PRET_A_LIVRER' | 'FACTURE' | 'LIVRE' | 'CLOTURE' | 'ANNULE'
  date_entree: string
  date_livraison_prevue?: string
  date_cloture?: string
  km_entree: number
  description_travaux?: string
  total_pieces_ht: number
  total_mo_ht: number
  total_ss_traitance_ht: number
  remise_totale: number
  taux_tva: number
  montant_tva: number
  montant_ttc: number
  cout_revient_interne: number
  marge_brute: number
  pieces_destockees: boolean
  facture_id?: string
  controle_qualite_valide: boolean
  notes_mecanicien?: string
  lignes?: GarageOrdreLigne[]
  created_at?: string
}

export interface GarageAssuranceSinistre {
  id: string
  company_id: string
  numero_dossier: string
  compagnie_assurance: string
  numero_police?: string
  numero_sinistre?: string
  expert_nom?: string
  expert_tel?: string
  ordre_id?: string
  immatriculation: string
  client_nom: string
  montant_devis_soumis: number
  montant_accord_assurance: number
  franchise_client: number
  reste_a_charge_client: number
  statut_prise_en_charge: 'EN_ATTENTE_ACCORD' | 'ACCORDE' | 'PARTIEL' | 'REFUSE' | 'REGLE'
  regle_assurance: number
  regle_client: number
  date_sinistre?: string
  date_expertise?: string
  date_accord?: string
  notes?: string
  created_at?: string
}

// ─── 3. TYPES & INTERFACES VERSION 2 : BTP & MAINTENANCE MULTISITE ───────────

export interface BtpSite {
  id: string
  company_id: string
  code_site: string
  nom_site: string
  type_site: 'SIEGE' | 'AGENCE' | 'ATELIER_CENTRAL' | 'ATELIER_SECONDAIRE' | 'DEPOT' | 'CHANTIER' | 'BASE_VIE'
  adresse?: string
  ville: string
  responsable_nom?: string
  responsable_tel?: string
  statut: string
  notes?: string
  created_at?: string
}

export interface BtpMateriel {
  id: string
  company_id: string
  code_materiel: string
  designation: string
  categorie: string
  marque: string
  modele: string
  annee?: number
  numero_serie?: string
  immatriculation?: string
  site_actuel_id?: string
  site_nom?: string
  type_compteur: 'HEURES_MOTEUR' | 'KILOMETRAGE' | 'LES_DEUX'
  compteur_heures_actuel: number
  compteur_km_actuel: number
  compteur_derniere_maj?: string
  statut: 'DISPONIBLE' | 'AFFECTE_CHANTIER' | 'EN_TRANSIT' | 'EN_MAINTENANCE' | 'EN_PANNE' | 'IMMOBILISE' | 'REFORME' | 'LOUE'
  cout_acquisition: number
  date_acquisition?: string
  capacite_carburant_reservoir: number
  conso_theorique_moyenne: number
  date_prochaine_maintenance?: string
  compteur_prochaine_maintenance?: number
  conducteur_habituel_nom?: string
  assurance_expiration?: string
  visite_technique_expiration?: string
  controle_securite_expiration?: string
  cout_cumule_maintenance: number
  cout_cumule_carburant: number
  photos?: string[]
  notes?: string
  created_at?: string
}

export interface BtpCompteurReleve {
  id: string
  company_id: string
  materiel_id: string
  date_releve: string
  heures_moteur?: number
  kilometrage?: number
  releve_par?: string
  site_id?: string
  contexte: 'ROUTINE' | 'PLEIN_CARBURANT' | 'DEPART_CHANTIER' | 'RETOUR_CHANTIER' | 'MAINTENANCE'
  justificatif_photo?: string
  notes?: string
  created_at?: string
}

export interface BtpMaintenancePlan {
  id: string
  company_id: string
  titre: string
  categorie_materiel?: string
  materiel_id?: string
  periodicite_heures?: number
  periodicite_km?: number
  periodicite_jours?: number
  operations_programmees: string[]
  pieces_recommandees: string[]
  est_actif: boolean
  created_at?: string
}

export interface BtpOrdreMaintenance {
  id: string
  company_id: string
  numero_om: string
  materiel_id: string
  materiel?: BtpMateriel
  plan_id?: string
  type_intervention: 'PREVENTIVE' | 'CORRECTIVE_PANNE' | 'DIAGNOSTIC' | 'CONTROLE_LEGAL'
  urgence: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENCE_ARRET_CHANTIER'
  site_id?: string
  technicien_interne?: string
  prestataire_externe?: string
  date_demande: string
  date_debut?: string
  date_fin?: string
  statut: 'PLANIFIE' | 'EN_COURS' | 'ATTENTE_PIECES' | 'TERMINE' | 'CLOTURE' | 'ANNULE'
  compteur_au_declenchement: number
  temps_arret_heures: number
  diagnostic_panne?: string
  travaux_effectues?: string
  cout_pieces: number
  cout_main_oeuvre: number
  cout_prestataire: number
  cout_total: number
  pieces_consommees?: any[]
  pieces_destockees: boolean
  prochaine_echeance_compteur?: number
  created_at?: string
}

export interface BtpCuve {
  id: string
  company_id: string
  code_cuve: string
  site_id?: string
  site_nom?: string
  type_carburant: string
  capacite_max_litres: number
  stock_actuel_litres: number
  seuil_alerte_litres: number
  prix_moyen_achat_litre: number
  statut: string
  created_at?: string
}

export interface BtpCarburantPlein {
  id: string
  company_id: string
  numero_bon: string
  cuve_id?: string
  materiel_id: string
  materiel_code?: string
  site_id?: string
  date_plein: string
  quantite_litres: number
  prix_litre: number
  montant_total: number
  compteur_heures?: number
  compteur_km?: number
  conducteur_nom?: string
  pompiste_distributeur?: string
  consommation_calculee_ratio?: number
  est_surconsommation_anormale: boolean
  notes?: string
  created_at?: string
}

export interface BtpChauffeurOperateur {
  id: string
  company_id: string
  matricule: string
  nom_complet: string
  telephone?: string
  site_rattachement_id?: string
  categories_permis: string[]
  habilitations_caces: string[]
  date_expiration_permis?: string
  date_expiration_visite_medicale?: string
  statut: string
  materiel_actuel_id?: string
  notes?: string
  created_at?: string
}

export interface BtpChantier {
  id: string
  company_id: string
  code_chantier: string
  nom_chantier: string
  client_nom: string
  client_id?: string
  chef_chantier_nom?: string
  chef_chantier_tel?: string
  localisation?: string
  ville: string
  date_debut: string
  date_fin_prevue?: string
  date_fin_reelle?: string
  budget_previsionnel: number
  cout_materiel_cumule: number
  cout_carburant_cumule: number
  cout_maintenance_cumule: number
  statut: 'EN_COURS' | 'ATTENTE_DEMARRAGE' | 'SUSPENDU' | 'RECEPTIONNE' | 'CLOTURE'
  notes?: string
  created_at?: string
}

export interface BtpAffectationMateriel {
  id: string
  company_id: string
  materiel_id: string
  materiel_code?: string
  chantier_id: string
  chantier_nom?: string
  date_affectation: string
  date_retour_prevue?: string
  date_retour_reelle?: string
  compteur_depart: number
  compteur_retour?: number
  heures_ou_km_effectues: number
  conducteur_id?: string
  conducteur_nom?: string
  taux_horaire_facturation_interne: number
  cout_total_interne: number
  statut: string
  observations?: string
  created_at?: string
}

export interface BtpTransfertIntersite {
  id: string
  company_id: string
  numero_transfert: string
  type_transfert: 'MATERIEL' | 'PIECES_DETACHEES' | 'CARBURANT'
  site_origine_id: string
  site_destination_id: string
  materiel_id?: string
  items?: any[]
  transporteur_nom?: string
  moyen_transport: string
  chauffeur_nom?: string
  date_expedition: string
  date_reception?: string
  statut: 'PREPARE' | 'EN_TRANSIT' | 'RECU' | 'RECU_AVEC_RESERVES' | 'ANNULE'
  expedie_par?: string
  receptionne_par?: string
  cout_transport: number
  motif?: string
  notes?: string
  created_at?: string
}

// ─── 4. NOUVEAUX TYPES ÉTENDUS POUR LE PARC BTP (M068) ────────────────────────

export type BtpOrStatut =
  | 'BROUILLON'
  | 'EN_ATTENTE_VALIDATION'
  | 'VALIDE'
  | 'MECANICIEN_AFFECTE'
  | 'EN_DIAGNOSTIC'
  | 'EN_COURS'
  | 'ATTENTE_PIECES'
  | 'VALIDATION_TECHNIQUE'
  | 'REPARE'
  | 'TEST_EFFECTUE'
  | 'CLOTURE'
  | 'ANNULE'

export interface BtpOrdreReparation {
  id: string
  company_id: string
  numero_or: string
  date_ouverture: string
  site_id?: string
  chantier_id?: string
  materiel_id: string
  code_materiel?: string
  immatriculation?: string
  marque?: string
  modele?: string
  numero_serie?: string
  compteur_valeur: number
  demandeur_nom?: string
  description_panne: string
  symptomes_constates?: string
  priorite: 'FAIBLE' | 'NORMALE' | 'ELEVEE' | 'URGENTE'
  type_intervention: 'CORRECTIVE' | 'PREVENTIVE' | 'DIAGNOSTIC' | 'REVISION' | 'CONTROLE_TECHNIQUE'
  diagnostic_mecanicien?: string
  travaux_a_effectuer?: string
  cout_previsionnel: number
  cout_reel_mo: number
  cout_reel_pieces: number
  cout_reel_consommables: number
  cout_reel_sous_traitance: number
  cout_reel_total: number
  date_debut_prevue?: string
  date_fin_prevue?: string
  date_debut_reelle?: string
  date_fin_reelle?: string
  statut: BtpOrStatut
  motif_annulation?: string
  essais_techniques_details?: string
  essais_reussis?: boolean
  autorisation_remise_en_service?: boolean
  valide_par?: string
  cloture_par?: string
  pieces_destockees?: boolean
  documents?: any[]
  observations?: string
  sinistre_id?: string
  created_at?: string
  updated_at?: string
  materiel?: BtpMateriel
  site?: BtpSite
  chantier?: BtpChantier
}

export interface BtpReparationMecanicien {
  id: string
  company_id: string
  ordre_id: string
  mecanicien_id?: string
  nom_mecanicien: string
  specialite: string
  fonction_intervention: string
  date_affectation: string
  date_debut_travail?: string
  date_fin_travail?: string
  temps_prevu_heures: number
  temps_reel_heures: number
  taches_attribuees?: string
  compte_rendu?: string
  difficultes_rencontrees?: string
  statut_tache: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'SUSPENDU'
  observations_chef_atelier?: string
  created_at?: string
}

export interface BtpReparationPiece {
  id: string
  company_id: string
  ordre_id: string
  product_id?: string
  reference?: string
  designation: string
  quantite_prevue: number
  quantite_utilisee: number
  prix_unitaire_ht: number
  cout_total_ht: number
  est_destocke: boolean
  date_sortie_stock?: string
  created_at?: string
}

export interface BtpAssuranceContrat {
  id: string
  company_id: string
  numero_contrat: string
  compagnie_assurance: string
  courtier_intermediaire?: string
  type_assurance: string
  engins_couverts: string[]
  garanties_souscrites?: string
  plafond_garantie: number
  franchise: number
  date_souscription: string
  date_prise_effet: string
  date_expiration: string
  montant_prime_annuelle: number
  frequence_paiement: 'ANNUELLE' | 'SEMESTRIELLE' | 'TRIMESTRIELLE' | 'MENSUELLE'
  statut: 'EN_PREPARATION' | 'EN_ATTENTE_VALIDATION' | 'ACTIF' | 'ECHEANCE_PROCHE' | 'PAIEMENT_EN_ATTENTE' | 'EXPIRE' | 'RESILIE'
  delai_alerte_jours: number
  montant_total_paye: number
  solde_restant: number
  contact_assureur?: string
  documents?: any[]
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface BtpAssurancePaiement {
  id: string
  company_id: string
  contrat_id: string
  echeance_label?: string
  montant_du: number
  montant_paye: number
  solde_echeance: number
  date_paiement: string
  mode_paiement: string
  reference_transaction?: string
  statut_validation: string
  utilisateur_nom?: string
  justificatif_url?: string
  notes?: string
  created_at?: string
}

export interface BtpSinistre {
  id: string
  company_id: string
  numero_declaration: string
  contrat_id?: string
  materiel_id?: string
  ordre_reparation_id?: string
  code_materiel?: string
  immatriculation?: string
  date_incident: string
  lieu_incident?: string
  description_faits: string
  personnes_impliquees?: string
  responsable_declaration?: string
  reference_assureur?: string
  estimation_dommages: number
  montant_reclame: number
  franchise_applicable: number
  montant_propose_assureur: number
  montant_indemnise: number
  statut: 'DECLARE' | 'EN_COURS_CONSTITUTION' | 'TRANSMIS_ASSUREUR' | 'EN_EXPERTISE' | 'ATTENTE_DECISION' | 'ACCEPTE' | 'INDEMNISE' | 'CONTESTE' | 'CLOTURE'
  prise_en_charge_confirmee: boolean
  date_expertise?: string
  date_accord?: string
  date_indemnisation?: string
  photos_justificatifs?: any[]
  notes?: string
  created_at?: string
  updated_at?: string
}

