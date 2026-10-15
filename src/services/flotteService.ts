// =============================================================================
// GESTIO 229 SaaS — Service Métier Complet : 20ᵉ Activité GÉOLOCALISATION ET FLOTTE
// Télématique temps réel, GPS, Parc, Missions, Carburant, Maintenance, IoT & Google Maps
// Isolation stricte par company_id avec résilience et persistance Supabase / Cache Local
// =============================================================================

import { supabase } from '../lib/supabase'

// ─── 1. INTERFACES & TYPES MÉTIER ───────────────────────────────────────────

export type FlotteStatutVehicule =
  | 'DISPONIBLE'
  | 'EN_CIRCULATION'
  | 'A_L_ARRET'
  | 'EN_MISSION'
  | 'EN_MAINTENANCE'
  | 'HORS_LIGNE'

export type FlotteTypeVehicule =
  | 'VOITURE'
  | 'UTILITAIRE'
  | 'CAMION'
  | 'MOTO'
  | 'BUS'
  | 'FRIGORIFIQUE'
  | 'ENGIN_BTP'

export type FlotteTypeCarburant = 'GASOIL' | 'ESSENCE' | 'HYBRIDE' | 'ELECTRIQUE'

export interface FlotteVehicule {
  id: string
  company_id: string
  immatriculation: string
  code_interne?: string
  marque: string
  modele: string
  annee?: number
  vin?: string
  type_vehicule: FlotteTypeVehicule
  type_carburant: FlotteTypeCarburant
  capacite_reservoir_litres: number
  consommation_reference_100km: number
  kilometrage_actuel: number
  statut: FlotteStatutVehicule
  conducteur_assigne_id?: string
  conducteur_nom?: string
  tracker_imei?: string
  derniere_latitude?: number
  derniere_longitude?: number
  derniere_vitesse: number
  dernier_cap: number
  contact_allume: boolean
  niveau_carburant_pct: number
  derniere_mise_a_jour_gps?: string
  photo_url?: string
  created_at?: string
}

export interface FlotteConducteur {
  id: string
  company_id: string
  nom_complet: string
  telephone?: string
  email?: string
  numero_permis: string
  categories_permis: string
  date_expiration_permis?: string
  date_visite_medicale?: string
  points_permis: number
  statut: 'ACTIF' | 'EN_MISSION' | 'EN_CONGE' | 'SUSPENDU'
  vehicule_assigne_id?: string
  vehicule_immatriculation?: string
  notes?: string
  photo_url?: string
  created_at?: string
}

export interface FlotteBalise {
  id: string
  company_id: string
  imei: string
  modele: string
  numero_sim?: string
  operateur_sim: string
  vehicule_id?: string
  vehicule_immat?: string
  statut: 'EN_LIGNE' | 'HORS_LIGNE' | 'NON_ATTRIBUE'
  derniere_trame_at?: string
  niveau_batterie_pct: number
  firmware_version: string
  created_at?: string
}

export interface FlottePositionGps {
  id: string
  company_id: string
  vehicule_id: string
  tracker_imei?: string
  latitude: number
  longitude: number
  altitude: number
  vitesse_kmh: number
  cap_degres: number
  satellites: number
  contact_allume: boolean
  kilometrage_compteur?: number
  adresse_approximative?: string
  tension_batterie_v?: number
  horodatage: string
  created_at?: string
}

export interface FlotteMission {
  id: string
  company_id: string
  numero_ordre: string
  titre_mission: string
  vehicule_id: string
  vehicule_immat?: string
  conducteur_id?: string
  conducteur_nom?: string
  depart_lieu: string
  depart_lat?: number
  depart_lng?: number
  destination_lieu: string
  destination_lat?: number
  destination_lng?: number
  date_depart_prevue?: string
  date_arrivee_prevue?: string
  date_depart_reelle?: string
  date_arrivee_reelle?: string
  kilometrage_depart?: number
  kilometrage_arrivee?: number
  distance_parcourue_km?: number
  statut: 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE'
  description_chargement?: string
  instructions?: string
  created_at?: string
}

export interface FlotteCarburant {
  id: string
  company_id: string
  vehicule_id: string
  vehicule_immat?: string
  conducteur_id?: string
  conducteur_nom?: string
  date_plein: string
  kilometrage_au_plein: number
  litres_achetes: number
  prix_litre_fcfa: number
  montant_total_fcfa: number
  station_nom?: string
  type_carburant: string
  consommation_calculee_100km?: number
  alerte_consommation_anormale: boolean
  recu_facture_url?: string
  created_at?: string
}

export interface FlotteMaintenance {
  id: string
  company_id: string
  vehicule_id: string
  vehicule_immat?: string
  type_intervention:
    | 'VIDANGE_HUILE'
    | 'PNEUMATIQUES'
    | 'FREINAGE'
    | 'COURROIE_DISTRIBUTION'
    | 'CONTROLE_TECHNIQUE'
    | 'CLIMATISATION'
    | 'BATTERIE'
    | 'AUTRE'
  description: string
  kilometrage_declenchement?: number
  prochain_kilometrage_prevu?: number
  date_intervention: string
  prochaine_date_prevue?: string
  cout_pieces_fcfa: number
  cout_main_oeuvre_fcfa: number
  cout_total_fcfa: number
  garage_prestataire?: string
  statut: 'PREVU' | 'EN_COURS' | 'TERMINE' | 'RETARD'
  facture_url?: string
  created_at?: string
}

export interface FlotteDocument {
  id: string
  company_id: string
  vehicule_id?: string
  vehicule_immat?: string
  conducteur_id?: string
  conducteur_nom?: string
  type_document:
    | 'CARTE_GRISE'
    | 'ASSURANCE'
    | 'VISITE_TECHNIQUE'
    | 'TVM'
    | 'EXTINCTEUR'
    | 'PERMIS_CONDUIRE'
    | 'VISITE_MEDICALE'
  numero_police_ou_titre?: string
  organisme_emetteur?: string
  date_emission?: string
  date_expiration: string
  jours_avant_expiration?: number
  cout_fcfa: number
  fichier_url?: string
  statut_alerte: 'VALIDE' | 'EXPIRATION_IMMINENTE' | 'EXPIRE'
  created_at?: string
}

export interface FlotteGeofence {
  id: string
  company_id: string
  nom_zone: string
  type_zone: 'CERCLE' | 'POLYGONE'
  type_usage: 'DEPOT' | 'PORT' | 'ZONE_LIVRAISON' | 'ZONE_INTERDITE' | 'CHANTIER'
  centre_lat?: number
  centre_lng?: number
  rayon_metres: number
  polygone_coordonnees?: Array<[number, number]>
  couleur_hex: string
  alerter_sur_entree: boolean
  alerter_sur_sortie: boolean
  actif: boolean
  created_at?: string
}

export interface FlotteAlerte {
  id: string
  company_id: string
  vehicule_id?: string
  vehicule_immat?: string
  type_alerte:
    | 'EXCES_VITESSE'
    | 'SORTIE_ZONE'
    | 'ENTREE_ZONE_INTERDITE'
    | 'FREINAGE_BRUSQUE'
    | 'BATTERIE_FAIBLE'
    | 'COUPE_CIRCUIT'
    | 'SOS_CONDUCTEUR'
    | 'CARBURANT_ANORMAL'
    | 'RUPTURE_FROID'
  gravite: 'INFO' | 'AVERTISSEMENT' | 'CRITIQUE'
  message: string
  valeur_mesuree?: string
  valeur_seuil?: string
  latitude?: number
  longitude?: number
  est_acquittee: boolean
  acquittee_par?: string
  acquittee_at?: string
  created_at: string
}

export interface FlotteCapteur {
  id: string
  company_id: string
  vehicule_id: string
  vehicule_immat?: string
  nom_capteur: string
  type_capteur: 'TEMPERATURE' | 'HUMIDITE' | 'PORTE' | 'NIVEAU_CARBURANT' | 'BLE_BEACON'
  identifiant_mac?: string
  valeur_actuelle: number
  unite: string
  seuil_min?: number
  seuil_max?: number
  alerte_active: boolean
  derniere_mesure_at?: string
  created_at?: string
}

export interface FlotteReservation {
  id: string
  company_id: string
  vehicule_id: string
  vehicule_immat?: string
  demandeur_nom: string
  demandeur_departement?: string
  demandeur_telephone?: string
  motif_deplacement: string
  destination_prevue?: string
  date_debut_prevue: string
  date_fin_prevue: string
  date_debut_reelle?: string
  date_fin_reelle?: string
  statut: 'EN_ATTENTE' | 'VALIDEE' | 'REFUSEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE'
  valide_par?: string
  km_depart?: number
  km_retour?: number
  created_at?: string
}

export interface FlotteInspection {
  id: string
  company_id: string
  vehicule_id: string
  vehicule_immat?: string
  conducteur_id?: string
  conducteur_nom?: string
  type_inspection: 'DEPART' | 'RETOUR' | 'PERIODIQUE'
  date_inspection: string
  kilometrage_inspecte: number
  niveau_carburant_pct: number
  niveau_huile_moteur: boolean
  liquide_refroidissement: boolean
  pression_pneus_conforme: boolean
  feux_et_phares_ok: boolean
  freins_ok: boolean
  proprete_generale: boolean
  presence_roue_secours: boolean
  presence_cric_et_cle: boolean
  presence_triangle_gilet: boolean
  degats_carrosserie_notes?: string
  photos_degats?: string[]
  statut_validation: 'CONFORME' | 'AVEC_RESERVES' | 'NON_CONFORME'
  inspecte_par?: string
  created_at?: string
}

export interface FlotteParametres {
  id?: string
  company_id: string
  google_maps_api_key?: string
  vitesse_max_ville_kmh: number
  vitesse_max_route_kmh: number
  vitesse_max_autoroute_kmh: number
  duree_arret_excessif_minutes: number
  alerte_email_active: boolean
  alerte_sms_active: boolean
  email_destinataire_alertes?: string
  serveur_gps_port: number
  cle_secrete_webhook: string
  created_at?: string
}

// ─── 2. SEED INITIAL COORDONNÉES RÉELLES BÉNIN / COTONOU ──────────────────────
// Permet d'avoir un environnement vivant et professionnel dès le 1er affichage

const INITIAL_VEHICULES_BENIN = [
  {
    immatriculation: 'AY 8940 RB',
    code_interne: 'FL-01',
    marque: 'Toyota',
    modele: 'Hilux Double Cabine 4x4',
    annee: 2023,
    type_vehicule: 'UTILITAIRE' as FlotteTypeVehicule,
    type_carburant: 'GASOIL' as FlotteTypeCarburant,
    capacite_reservoir_litres: 80,
    consommation_reference_100km: 9.2,
    kilometrage_actuel: 48250,
    statut: 'EN_CIRCULATION' as FlotteStatutVehicule,
    derniere_latitude: 6.3654,
    derniere_longitude: 2.4183, // Boulevard de la Marina, Cotonou
    derniere_vitesse: 48,
    dernier_cap: 85,
    contact_allume: true,
    niveau_carburant_pct: 72,
    conducteur_nom: 'Bio Séro KORA',
    tracker_imei: '862904041289401',
    derniere_mise_a_jour_gps: new Date().toISOString(),
  },
  {
    immatriculation: 'BL 2045 RB',
    code_interne: 'FL-02',
    marque: 'Renault',
    modele: 'Trafic Grand Confort',
    annee: 2022,
    type_vehicule: 'UTILITAIRE' as FlotteTypeVehicule,
    type_carburant: 'GASOIL' as FlotteTypeCarburant,
    capacite_reservoir_litres: 75,
    consommation_reference_100km: 7.8,
    kilometrage_actuel: 64120,
    statut: 'EN_CIRCULATION' as FlotteStatutVehicule,
    derniere_latitude: 6.3721,
    derniere_longitude: 2.3985, // Cadjèhoun / Haie Vive, Cotonou
    derniere_vitesse: 35,
    dernier_cap: 220,
    contact_allume: true,
    niveau_carburant_pct: 55,
    conducteur_nom: 'Aimé DOSSA',
    tracker_imei: '862904041289402',
    derniere_mise_a_jour_gps: new Date().toISOString(),
  },
  {
    immatriculation: 'BK 1198 RB',
    code_interne: 'FL-03',
    marque: 'Scania',
    modele: 'P380 Frigorifique 26T',
    annee: 2021,
    type_vehicule: 'FRIGORIFIQUE' as FlotteTypeVehicule,
    type_carburant: 'GASOIL' as FlotteTypeCarburant,
    capacite_reservoir_litres: 350,
    consommation_reference_100km: 28.5,
    kilometrage_actuel: 142800,
    statut: 'EN_MISSION' as FlotteStatutVehicule,
    derniere_latitude: 6.4258,
    derniere_longitude: 2.3394, // Abomey-Calavi / Carrefour Arconville
    derniere_vitesse: 62,
    dernier_cap: 340,
    contact_allume: true,
    niveau_carburant_pct: 82,
    conducteur_nom: 'Rodrigue AGOSSOU',
    tracker_imei: '862904041289403',
    derniere_mise_a_jour_gps: new Date().toISOString(),
  },
  {
    immatriculation: 'AZ 5530 RB',
    code_interne: 'FL-04',
    marque: 'Toyota',
    modele: 'Corolla Sedan 1.8L',
    annee: 2024,
    type_vehicule: 'VOITURE' as FlotteTypeVehicule,
    type_carburant: 'ESSENCE' as FlotteTypeCarburant,
    capacite_reservoir_litres: 50,
    consommation_reference_100km: 6.5,
    kilometrage_actuel: 19800,
    statut: 'A_L_ARRET' as FlotteStatutVehicule,
    derniere_latitude: 6.3578,
    derniere_longitude: 2.4352, // Port Autonome de Cotonou
    derniere_vitesse: 0,
    dernier_cap: 110,
    contact_allume: false,
    niveau_carburant_pct: 90,
    conducteur_nom: 'Carine HOUNNOU',
    tracker_imei: '862904041289404',
    derniere_mise_a_jour_gps: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    immatriculation: 'BB 9012 RB',
    code_interne: 'FL-05',
    marque: 'Mercedes-Benz',
    modele: 'Actros 3340 Benne 6x4',
    annee: 2020,
    type_vehicule: 'ENGIN_BTP' as FlotteTypeVehicule,
    type_carburant: 'GASOIL' as FlotteTypeCarburant,
    capacite_reservoir_litres: 400,
    consommation_reference_100km: 34.0,
    kilometrage_actuel: 189500,
    statut: 'EN_MAINTENANCE' as FlotteStatutVehicule,
    derniere_latitude: 6.3812,
    derniere_longitude: 2.4589, // Akpakpa PK3, Cotonou
    derniere_vitesse: 0,
    dernier_cap: 0,
    contact_allume: false,
    niveau_carburant_pct: 30,
    conducteur_nom: 'Gérard TCHIBOZO',
    tracker_imei: '862904041289405',
    derniere_mise_a_jour_gps: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
  },
  {
    immatriculation: 'AH 3301 RB',
    code_interne: 'FL-06',
    marque: 'Haojue',
    modele: 'HJ125-8E Moto Express',
    annee: 2023,
    type_vehicule: 'MOTO' as FlotteTypeVehicule,
    type_carburant: 'ESSENCE' as FlotteTypeCarburant,
    capacite_reservoir_litres: 12,
    consommation_reference_100km: 2.8,
    kilometrage_actuel: 24300,
    statut: 'EN_CIRCULATION' as FlotteStatutVehicule,
    derniere_latitude: 6.3688,
    derniere_longitude: 2.4285, // Ganhi Centre Commercial, Cotonou
    derniere_vitesse: 28,
    dernier_cap: 180,
    contact_allume: true,
    niveau_carburant_pct: 68,
    conducteur_nom: 'Sylvestre DAKO',
    tracker_imei: '862904041289406',
    derniere_mise_a_jour_gps: new Date().toISOString(),
  },
]

// ─── 3. GESTION DU STORAGE LOCAL ROBUSTE (MULTI-TENANT CACHE) ─────────────────

function getLocalKey(companyId: string, resource: string): string {
  return `gestio229_flotte_${companyId}_${resource}`
}

function loadLocal<T>(companyId: string, resource: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(getLocalKey(companyId, resource))
    if (!raw) return defaultValue
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

function saveLocal<T>(companyId: string, resource: string, data: T): void {
  try {
    localStorage.setItem(getLocalKey(companyId, resource), JSON.stringify(data))
  } catch (err) {
    console.warn(`[flotteService] Impossible d'enregistrer ${resource} en localStorage:`, err)
  }
}

// ─── 4. PARC VÉHICULES ────────────────────────────────────────────────────────

export async function getVehiculesFlotte(companyId: string): Promise<FlotteVehicule[]> {
  if (!companyId) return []

  try {
    const { data, error } = await supabase
      .from('flotte_vehicules')
      .select('*')
      .eq('company_id', companyId)
      .order('immatriculation', { ascending: true })

    if (error) {
      console.warn('[flotteService] Table flotte_vehicules en base:', error.message)
      throw error
    }

    if (data && data.length > 0) {
      saveLocal(companyId, 'vehicules', data)
      return data as FlotteVehicule[]
    }
  } catch {
    // Fallback localstorage
  }

  const cached = loadLocal<FlotteVehicule[]>(companyId, 'vehicules', [])
  if (cached.length > 0) return cached

  // Si premier démarrage pour cette entreprise, initialiser le parc de démonstration
  const seeded: FlotteVehicule[] = INITIAL_VEHICULES_BENIN.map((v, idx) => ({
    id: `v-seed-${companyId.slice(0, 4)}-${idx + 1}`,
    company_id: companyId,
    immatriculation: v.immatriculation,
    code_interne: v.code_interne,
    marque: v.marque,
    modele: v.modele,
    annee: v.annee,
    type_vehicule: v.type_vehicule,
    type_carburant: v.type_carburant,
    capacite_reservoir_litres: v.capacite_reservoir_litres,
    consommation_reference_100km: v.consommation_reference_100km,
    kilometrage_actuel: v.kilometrage_actuel,
    statut: v.statut,
    derniere_latitude: v.derniere_latitude,
    derniere_longitude: v.derniere_longitude,
    derniere_vitesse: v.derniere_vitesse,
    dernier_cap: v.dernier_cap,
    contact_allume: v.contact_allume,
    niveau_carburant_pct: v.niveau_carburant_pct,
    conducteur_nom: v.conducteur_nom,
    tracker_imei: v.tracker_imei,
    derniere_mise_a_jour_gps: v.derniere_mise_a_jour_gps,
    created_at: new Date().toISOString(),
  }))

  saveLocal(companyId, 'vehicules', seeded)
  return seeded
}

export async function saveVehiculeFlotte(
  companyId: string,
  vehicule: Partial<FlotteVehicule>
): Promise<FlotteVehicule> {
  const isNew = !vehicule.id || vehicule.id.startsWith('v-seed-') || vehicule.id.startsWith('temp-')
  const record: FlotteVehicule = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `veh-${Date.now()}`) : vehicule.id!,
    company_id: companyId,
    immatriculation: (vehicule.immatriculation || '').toUpperCase().trim(),
    code_interne: vehicule.code_interne || `FL-${Math.floor(10 + Math.random() * 89)}`,
    marque: vehicule.marque || 'Toyota',
    modele: vehicule.modele || 'Standard',
    annee: vehicule.annee || new Date().getFullYear(),
    vin: vehicule.vin || '',
    type_vehicule: vehicule.type_vehicule || 'VOITURE',
    type_carburant: vehicule.type_carburant || 'GASOIL',
    capacite_reservoir_litres: vehicule.capacite_reservoir_litres || 60,
    consommation_reference_100km: vehicule.consommation_reference_100km || 8.5,
    kilometrage_actuel: Number(vehicule.kilometrage_actuel) || 0,
    statut: vehicule.statut || 'DISPONIBLE',
    conducteur_assigne_id: vehicule.conducteur_assigne_id,
    conducteur_nom: vehicule.conducteur_nom,
    tracker_imei: vehicule.tracker_imei,
    derniere_latitude: vehicule.derniere_latitude ?? 6.3654,
    derniere_longitude: vehicule.derniere_longitude ?? 2.4183,
    derniere_vitesse: vehicule.derniere_vitesse ?? 0,
    dernier_cap: vehicule.dernier_cap ?? 0,
    contact_allume: vehicule.contact_allume ?? false,
    niveau_carburant_pct: vehicule.niveau_carburant_pct ?? 100,
    derniere_mise_a_jour_gps: new Date().toISOString(),
    photo_url: vehicule.photo_url,
    created_at: vehicule.created_at || new Date().toISOString(),
  }

  try {
    const { data, error } = await supabase
      .from('flotte_vehicules')
      .upsert(record)
      .select()
      .maybeSingle()
    if (!error && data) {
      // synchronisé
    }
  } catch (err) {
    console.warn('[flotteService] Enregistrement vehicule fallback local:', err)
  }

  const list = await getVehiculesFlotte(companyId)
  const idx = list.findIndex((v) => v.id === record.id || v.immatriculation === record.immatriculation)
  if (idx >= 0) {
    list[idx] = record
  } else {
    list.unshift(record)
  }
  saveLocal(companyId, 'vehicules', list)
  return record
}

export async function deleteVehiculeFlotte(companyId: string, id: string): Promise<boolean> {
  try {
    await supabase.from('flotte_vehicules').delete().eq('id', id).eq('company_id', companyId)
  } catch {
    // fallback
  }
  const list = (await getVehiculesFlotte(companyId)).filter((v) => v.id !== id)
  saveLocal(companyId, 'vehicules', list)
  return true
}

// ─── 5. CONDUCTEURS & PERMIS ──────────────────────────────────────────────────

export async function getConducteursFlotte(companyId: string): Promise<FlotteConducteur[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_conducteurs')
      .select('*')
      .eq('company_id', companyId)
      .order('nom_complet')
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'conducteurs', data)
      return data as FlotteConducteur[]
    }
  } catch {}

  const cached = loadLocal<FlotteConducteur[]>(companyId, 'conducteurs', [])
  if (cached.length > 0) return cached

  const seeded: FlotteConducteur[] = [
    {
      id: `c-seed-${companyId.slice(0, 4)}-1`,
      company_id: companyId,
      nom_complet: 'Bio Séro KORA',
      telephone: '+229 97 12 34 56',
      email: 'kora.bio@gestio229.bj',
      numero_permis: 'BJ-2018-094812',
      categories_permis: 'B-C-D',
      date_expiration_permis: '2028-06-15',
      date_visite_medicale: '2027-02-10',
      points_permis: 12,
      statut: 'ACTIF',
      vehicule_immatriculation: 'AY 8940 RB',
    },
    {
      id: `c-seed-${companyId.slice(0, 4)}-2`,
      company_id: companyId,
      nom_complet: 'Aimé DOSSA',
      telephone: '+229 95 88 44 22',
      email: 'aime.dossa@gestio229.bj',
      numero_permis: 'BJ-2016-041278',
      categories_permis: 'B-C',
      date_expiration_permis: '2027-11-20',
      date_visite_medicale: '2026-12-05',
      points_permis: 11,
      statut: 'ACTIF',
      vehicule_immatriculation: 'BL 2045 RB',
    },
    {
      id: `c-seed-${companyId.slice(0, 4)}-3`,
      company_id: companyId,
      nom_complet: 'Rodrigue AGOSSOU',
      telephone: '+229 66 33 21 00',
      email: 'rodrigue.a@gestio229.bj',
      numero_permis: 'BJ-2014-009823',
      categories_permis: 'C-D-E (Poids Lourds)',
      date_expiration_permis: '2029-01-30',
      date_visite_medicale: '2026-10-18',
      points_permis: 12,
      statut: 'EN_MISSION',
      vehicule_immatriculation: 'BK 1198 RB',
    },
    {
      id: `c-seed-${companyId.slice(0, 4)}-4`,
      company_id: companyId,
      nom_complet: 'Sylvestre DAKO',
      telephone: '+229 96 45 78 12',
      email: 'sylvestre.dako@gestio229.bj',
      numero_permis: 'BJ-2021-087654',
      categories_permis: 'A-B',
      date_expiration_permis: '2026-11-05', // Imminente
      date_visite_medicale: '2026-09-01',
      points_permis: 10,
      statut: 'ACTIF',
      vehicule_immatriculation: 'AH 3301 RB',
    },
  ]
  saveLocal(companyId, 'conducteurs', seeded)
  return seeded
}

export async function saveConducteurFlotte(
  companyId: string,
  cond: Partial<FlotteConducteur>
): Promise<FlotteConducteur> {
  const isNew = !cond.id || cond.id.startsWith('c-seed-') || cond.id.startsWith('temp-')
  const record: FlotteConducteur = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `cond-${Date.now()}`) : cond.id!,
    company_id: companyId,
    nom_complet: cond.nom_complet || '',
    telephone: cond.telephone || '',
    email: cond.email || '',
    numero_permis: cond.numero_permis || '',
    categories_permis: cond.categories_permis || 'B',
    date_expiration_permis: cond.date_expiration_permis,
    date_visite_medicale: cond.date_visite_medicale,
    points_permis: cond.points_permis ?? 12,
    statut: cond.statut || 'ACTIF',
    vehicule_assigne_id: cond.vehicule_assigne_id,
    vehicule_immatriculation: cond.vehicule_immatriculation,
    notes: cond.notes,
    photo_url: cond.photo_url,
    created_at: cond.created_at || new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_conducteurs').upsert(record)
  } catch {}

  const list = await getConducteursFlotte(companyId)
  const idx = list.findIndex((c) => c.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'conducteurs', list)
  return record
}

// ─── 6. GESTION DES POSITIONS GPS EN TEMPS RÉEL & HISTORIQUE ──────────────────

export async function getDernieresPositionsGps(
  companyId: string,
  vehiculeId?: string
): Promise<FlottePositionGps[]> {
  if (!companyId) return []
  try {
    let q = supabase
      .from('flotte_positions_gps')
      .select('*')
      .eq('company_id', companyId)
      .order('horodatage', { ascending: false })
      .limit(100)
    if (vehiculeId) q = q.eq('vehicule_id', vehiculeId)
    const { data, error } = await q
    if (!error && data && data.length > 0) return data as FlottePositionGps[]
  } catch {}

  const list = loadLocal<FlottePositionGps[]>(companyId, 'positions_gps', [])
  if (vehiculeId) return list.filter((p) => p.vehicule_id === vehiculeId)
  return list
}

export async function enregistrerPositionGps(
  companyId: string,
  pos: Partial<FlottePositionGps>
): Promise<FlottePositionGps> {
  const record: FlottePositionGps = {
    id: crypto.randomUUID ? crypto.randomUUID() : `gps-${Date.now()}`,
    company_id: companyId,
    vehicule_id: pos.vehicule_id || '',
    tracker_imei: pos.tracker_imei,
    latitude: pos.latitude || 6.3654,
    longitude: pos.longitude || 2.4183,
    altitude: pos.altitude || 12,
    vitesse_kmh: pos.vitesse_kmh || 0,
    cap_degres: pos.cap_degres || 0,
    satellites: pos.satellites || 10,
    contact_allume: pos.contact_allume ?? true,
    kilometrage_compteur: pos.kilometrage_compteur,
    adresse_approximative: pos.adresse_approximative || 'Cotonou, Bénin',
    tension_batterie_v: pos.tension_batterie_v || 12.8,
    horodatage: pos.horodatage || new Date().toISOString(),
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_positions_gps').insert(record)
  } catch {}

  const history = loadLocal<FlottePositionGps[]>(companyId, 'positions_gps', [])
  history.unshift(record)
  if (history.length > 500) history.pop()
  saveLocal(companyId, 'positions_gps', history)

  // Mettre à jour la dernière position sur le véhicule
  if (record.vehicule_id) {
    const vehicules = await getVehiculesFlotte(companyId)
    const v = vehicules.find((veh) => veh.id === record.vehicule_id)
    if (v) {
      v.derniere_latitude = record.latitude
      v.derniere_longitude = record.longitude
      v.derniere_vitesse = record.vitesse_kmh
      v.dernier_cap = record.cap_degres
      v.contact_allume = record.contact_allume
      v.derniere_mise_a_jour_gps = record.horodatage
      v.statut = record.vitesse_kmh > 3 ? 'EN_CIRCULATION' : record.contact_allume ? 'A_L_ARRET' : 'A_L_ARRET'
      saveLocal(companyId, 'vehicules', vehicules)
    }
  }

  return record
}

// ─── 7. MISSIONS & DISPATCH ───────────────────────────────────────────────────

export async function getMissionsFlotte(companyId: string): Promise<FlotteMission[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_missions')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'missions', data)
      return data as FlotteMission[]
    }
  } catch {}

  const cached = loadLocal<FlotteMission[]>(companyId, 'missions', [])
  if (cached.length > 0) return cached

  const seeded: FlotteMission[] = [
    {
      id: `m-seed-${companyId.slice(0, 4)}-1`,
      company_id: companyId,
      numero_ordre: 'MSN-2026-081',
      titre_mission: 'Livraison Produits Frais & Poissons surgelés',
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-3`,
      vehicule_immat: 'BK 1198 RB',
      conducteur_nom: 'Rodrigue AGOSSOU',
      depart_lieu: 'Port Autonome de Cotonou',
      destination_lieu: 'Entrepôt Central Abomey-Calavi',
      date_depart_prevue: new Date().toISOString(),
      statut: 'EN_COURS',
      kilometrage_depart: 142760,
      description_chargement: '12 Palettes Poissons Bar & Capitaine (-18°C)',
    },
    {
      id: `m-seed-${companyId.slice(0, 4)}-2`,
      company_id: companyId,
      numero_ordre: 'MSN-2026-080',
      titre_mission: 'Navette administrative & Courriers officiels',
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-1`,
      vehicule_immat: 'AY 8940 RB',
      conducteur_nom: 'Bio Séro KORA',
      depart_lieu: 'Siège Social Ganhi',
      destination_lieu: 'Ministères & Présidence de la République',
      date_depart_prevue: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      statut: 'TERMINEE',
      kilometrage_depart: 48210,
      kilometrage_arrivee: 48250,
      distance_parcourue_km: 40,
    },
  ]
  saveLocal(companyId, 'missions', seeded)
  return seeded
}

export async function saveMissionFlotte(
  companyId: string,
  mission: Partial<FlotteMission>
): Promise<FlotteMission> {
  const isNew = !mission.id || mission.id.startsWith('m-seed-')
  const record: FlotteMission = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `msn-${Date.now()}`) : mission.id!,
    company_id: companyId,
    numero_ordre: mission.numero_ordre || `MSN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    titre_mission: mission.titre_mission || 'Mission générale',
    vehicule_id: mission.vehicule_id || '',
    vehicule_immat: mission.vehicule_immat,
    conducteur_id: mission.conducteur_id,
    conducteur_nom: mission.conducteur_nom,
    depart_lieu: mission.depart_lieu || 'Cotonou',
    destination_lieu: mission.destination_lieu || 'Destination',
    date_depart_prevue: mission.date_depart_prevue || new Date().toISOString(),
    date_arrivee_prevue: mission.date_arrivee_prevue,
    date_depart_reelle: mission.date_depart_reelle,
    date_arrivee_reelle: mission.date_arrivee_reelle,
    kilometrage_depart: mission.kilometrage_depart,
    kilometrage_arrivee: mission.kilometrage_arrivee,
    distance_parcourue_km: mission.distance_parcourue_km,
    statut: mission.statut || 'PLANIFIEE',
    description_chargement: mission.description_chargement,
    instructions: mission.instructions,
    created_at: mission.created_at || new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_missions').upsert(record)
  } catch {}

  const list = await getMissionsFlotte(companyId)
  const idx = list.findIndex((m) => m.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'missions', list)
  return record
}

// ─── 8. CARBURANT & CONSOMMATION ──────────────────────────────────────────────

export async function getCarburantLogs(companyId: string): Promise<FlotteCarburant[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_carburant')
      .select('*')
      .eq('company_id', companyId)
      .order('date_plein', { ascending: false })
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'carburant', data)
      return data as FlotteCarburant[]
    }
  } catch {}

  const cached = loadLocal<FlotteCarburant[]>(companyId, 'carburant', [])
  if (cached.length > 0) return cached

  const seeded: FlotteCarburant[] = [
    {
      id: `carb-1`,
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-1`,
      vehicule_immat: 'AY 8940 RB',
      conducteur_nom: 'Bio Séro KORA',
      date_plein: new Date().toISOString().slice(0, 10),
      kilometrage_au_plein: 48250,
      litres_achetes: 65,
      prix_litre_fcfa: 700,
      montant_total_fcfa: 45500,
      station_nom: 'TotalEnergies Carrefour Etoile Rouge',
      type_carburant: 'GASOIL',
      consommation_calculee_100km: 9.1,
      alerte_consommation_anormale: false,
    },
    {
      id: `carb-2`,
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-3`,
      vehicule_immat: 'BK 1198 RB',
      conducteur_nom: 'Rodrigue AGOSSOU',
      date_plein: new Date(Date.now() - 3 * 86400 * 1000).toISOString().slice(0, 10),
      kilometrage_au_plein: 142100,
      litres_achetes: 280,
      prix_litre_fcfa: 700,
      montant_total_fcfa: 196000,
      station_nom: 'Benin Petro Akpakpa',
      type_carburant: 'GASOIL',
      consommation_calculee_100km: 29.4,
      alerte_consommation_anormale: false,
    },
  ]
  saveLocal(companyId, 'carburant', seeded)
  return seeded
}

export async function saveCarburantLog(
  companyId: string,
  log: Partial<FlotteCarburant>
): Promise<FlotteCarburant> {
  const isNew = !log.id || log.id.startsWith('carb-')
  const record: FlotteCarburant = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `carb-${Date.now()}`) : log.id!,
    company_id: companyId,
    vehicule_id: log.vehicule_id || '',
    vehicule_immat: log.vehicule_immat,
    conducteur_id: log.conducteur_id,
    conducteur_nom: log.conducteur_nom,
    date_plein: log.date_plein || new Date().toISOString().slice(0, 10),
    kilometrage_au_plein: Number(log.kilometrage_au_plein) || 0,
    litres_achetes: Number(log.litres_achetes) || 0,
    prix_litre_fcfa: Number(log.prix_litre_fcfa) || 700,
    montant_total_fcfa:
      Number(log.montant_total_fcfa) ||
      (Number(log.litres_achetes) || 0) * (Number(log.prix_litre_fcfa) || 700),
    station_nom: log.station_nom || 'Station Service',
    type_carburant: log.type_carburant || 'GASOIL',
    consommation_calculee_100km: log.consommation_calculee_100km,
    alerte_consommation_anormale: log.alerte_consommation_anormale ?? false,
    recu_facture_url: log.recu_facture_url,
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_carburant').upsert(record)
  } catch {}

  const list = await getCarburantLogs(companyId)
  list.unshift(record)
  saveLocal(companyId, 'carburant', list)
  return record
}

// ─── 9. MAINTENANCE & ENTRETIEN ───────────────────────────────────────────────

export async function getMaintenanceFlotte(companyId: string): Promise<FlotteMaintenance[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_maintenance')
      .select('*')
      .eq('company_id', companyId)
      .order('date_intervention', { ascending: false })
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'maintenance', data)
      return data as FlotteMaintenance[]
    }
  } catch {}

  const cached = loadLocal<FlotteMaintenance[]>(companyId, 'maintenance', [])
  if (cached.length > 0) return cached

  const seeded: FlotteMaintenance[] = [
    {
      id: 'maint-1',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-1`,
      vehicule_immat: 'AY 8940 RB',
      type_intervention: 'VIDANGE_HUILE',
      description: 'Vidange moteur 5W30 + Remplacement filtres huile, gasoil et air',
      kilometrage_declenchement: 45000,
      prochain_kilometrage_prevu: 55000,
      date_intervention: '2026-08-14',
      prochaine_date_prevue: '2026-11-14',
      cout_pieces_fcfa: 48000,
      cout_main_oeuvre_fcfa: 15000,
      cout_total_fcfa: 63000,
      garage_prestataire: 'Garage Central CFAO Cotonou',
      statut: 'TERMINE',
    },
    {
      id: 'maint-2',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-5`,
      vehicule_immat: 'BB 9012 RB',
      type_intervention: 'FREINAGE',
      description: 'Révision compresseur air et garnitures freins essieu arrière',
      kilometrage_declenchement: 189500,
      date_intervention: new Date().toISOString().slice(0, 10),
      cout_pieces_fcfa: 120000,
      cout_main_oeuvre_fcfa: 45000,
      cout_total_fcfa: 165000,
      garage_prestataire: 'Atelier Poids Lourds PK3',
      statut: 'EN_COURS',
    },
  ]
  saveLocal(companyId, 'maintenance', seeded)
  return seeded
}

export async function saveMaintenanceFlotte(
  companyId: string,
  maint: Partial<FlotteMaintenance>
): Promise<FlotteMaintenance> {
  const isNew = !maint.id || maint.id.startsWith('maint-')
  const record: FlotteMaintenance = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `maint-${Date.now()}`) : maint.id!,
    company_id: companyId,
    vehicule_id: maint.vehicule_id || '',
    vehicule_immat: maint.vehicule_immat,
    type_intervention: maint.type_intervention || 'VIDANGE_HUILE',
    description: maint.description || 'Entretien',
    kilometrage_declenchement: maint.kilometrage_declenchement,
    prochain_kilometrage_prevu: maint.prochain_kilometrage_prevu,
    date_intervention: maint.date_intervention || new Date().toISOString().slice(0, 10),
    prochaine_date_prevue: maint.prochaine_date_prevue,
    cout_pieces_fcfa: Number(maint.cout_pieces_fcfa) || 0,
    cout_main_oeuvre_fcfa: Number(maint.cout_main_oeuvre_fcfa) || 0,
    cout_total_fcfa:
      Number(maint.cout_total_fcfa) ||
      (Number(maint.cout_pieces_fcfa) || 0) + (Number(maint.cout_main_oeuvre_fcfa) || 0),
    garage_prestataire: maint.garage_prestataire,
    statut: maint.statut || 'PREVU',
    facture_url: maint.facture_url,
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_maintenance').upsert(record)
  } catch {}

  const list = await getMaintenanceFlotte(companyId)
  const idx = list.findIndex((m) => m.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'maintenance', list)
  return record
}

// ─── 10. ASSURANCES & DOCUMENTS OFFICIELS ─────────────────────────────────────

export async function getDocumentsFlotte(companyId: string): Promise<FlotteDocument[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_documents')
      .select('*')
      .eq('company_id', companyId)
      .order('date_expiration', { ascending: true })
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'documents', data)
      return data as FlotteDocument[]
    }
  } catch {}

  const cached = loadLocal<FlotteDocument[]>(companyId, 'documents', [])
  if (cached.length > 0) return cached

  const today = new Date()
  const d30 = new Date(today.getTime() + 18 * 86400 * 1000).toISOString().slice(0, 10)
  const d90 = new Date(today.getTime() + 90 * 86400 * 1000).toISOString().slice(0, 10)
  const dExpired = new Date(today.getTime() - 5 * 86400 * 1000).toISOString().slice(0, 10)

  const seeded: FlotteDocument[] = [
    {
      id: 'doc-1',
      company_id: companyId,
      vehicule_immat: 'AY 8940 RB',
      type_document: 'ASSURANCE',
      numero_police_ou_titre: 'NSIA-AUTO-2025-8819',
      organisme_emetteur: 'NSIA Assurances Bénin',
      date_emission: '2025-10-30',
      date_expiration: d30, // Expiration imminente (18j)
      jours_avant_expiration: 18,
      cout_fcfa: 245000,
      statut_alerte: 'EXPIRATION_IMMINENTE',
    },
    {
      id: 'doc-2',
      company_id: companyId,
      vehicule_immat: 'BK 1198 RB',
      type_document: 'VISITE_TECHNIQUE',
      numero_police_ou_titre: 'CNSR-VT-2026-0041',
      organisme_emetteur: 'Centre National de Sécurité Routière (CNSR)',
      date_emission: '2025-11-15',
      date_expiration: d90,
      jours_avant_expiration: 90,
      cout_fcfa: 35000,
      statut_alerte: 'VALIDE',
    },
    {
      id: 'doc-3',
      company_id: companyId,
      vehicule_immat: 'BB 9012 RB',
      type_document: 'TVM',
      numero_police_ou_titre: 'DGI-TVM-2025-99',
      organisme_emetteur: 'Direction Générale des Impôts (DGI Bénin)',
      date_emission: '2025-01-10',
      date_expiration: dExpired,
      jours_avant_expiration: -5,
      cout_fcfa: 60000,
      statut_alerte: 'EXPIRE',
    },
  ]
  saveLocal(companyId, 'documents', seeded)
  return seeded
}

export async function saveDocumentFlotte(
  companyId: string,
  doc: Partial<FlotteDocument>
): Promise<FlotteDocument> {
  const isNew = !doc.id || doc.id.startsWith('doc-')
  const record: FlotteDocument = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `doc-${Date.now()}`) : doc.id!,
    company_id: companyId,
    vehicule_id: doc.vehicule_id,
    vehicule_immat: doc.vehicule_immat,
    conducteur_id: doc.conducteur_id,
    conducteur_nom: doc.conducteur_nom,
    type_document: doc.type_document || 'ASSURANCE',
    numero_police_ou_titre: doc.numero_police_ou_titre,
    organisme_emetteur: doc.organisme_emetteur,
    date_emission: doc.date_emission,
    date_expiration: doc.date_expiration || new Date().toISOString().slice(0, 10),
    cout_fcfa: Number(doc.cout_fcfa) || 0,
    fichier_url: doc.fichier_url,
    statut_alerte: doc.statut_alerte || 'VALIDE',
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_documents').upsert(record)
  } catch {}

  const list = await getDocumentsFlotte(companyId)
  const idx = list.findIndex((d) => d.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'documents', list)
  return record
}

// ─── 11. ZONES GÉOGRAPHIQUES (GEOFENCING) ─────────────────────────────────────

export async function getGeofencesFlotte(companyId: string): Promise<FlotteGeofence[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_geofences')
      .select('*')
      .eq('company_id', companyId)
      .order('nom_zone')
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'geofences', data)
      return data as FlotteGeofence[]
    }
  } catch {}

  const cached = loadLocal<FlotteGeofence[]>(companyId, 'geofences', [])
  if (cached.length > 0) return cached

  const seeded: FlotteGeofence[] = [
    {
      id: 'geo-1',
      company_id: companyId,
      nom_zone: 'Dépôt Principal Ganhi (Siège)',
      type_zone: 'CERCLE',
      type_usage: 'DEPOT',
      centre_lat: 6.3654,
      centre_lng: 2.4285,
      rayon_metres: 350,
      couleur_hex: '#10b981', // Vert
      alerter_sur_entree: true,
      alerter_sur_sortie: true,
      actif: true,
    },
    {
      id: 'geo-2',
      company_id: companyId,
      nom_zone: 'Zone Portuaire & Terminal Conteneurs',
      type_zone: 'CERCLE',
      type_usage: 'PORT',
      centre_lat: 6.3578,
      centre_lng: 2.4352,
      rayon_metres: 800,
      couleur_hex: '#0284c7', // Bleu
      alerter_sur_entree: true,
      alerter_sur_sortie: true,
      actif: true,
    },
    {
      id: 'geo-3',
      company_id: companyId,
      nom_zone: 'Entrepôt Logistique Calavi',
      type_zone: 'CERCLE',
      type_usage: 'ZONE_LIVRAISON',
      centre_lat: 6.4258,
      centre_lng: 2.3394,
      rayon_metres: 600,
      couleur_hex: '#8b5cf6', // Violet
      alerter_sur_entree: true,
      alerter_sur_sortie: true,
      actif: true,
    },
  ]
  saveLocal(companyId, 'geofences', seeded)
  return seeded
}

export async function saveGeofenceFlotte(
  companyId: string,
  geo: Partial<FlotteGeofence>
): Promise<FlotteGeofence> {
  const isNew = !geo.id || geo.id.startsWith('geo-')
  const record: FlotteGeofence = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `geo-${Date.now()}`) : geo.id!,
    company_id: companyId,
    nom_zone: geo.nom_zone || 'Nouvelle Zone',
    type_zone: geo.type_zone || 'CERCLE',
    type_usage: geo.type_usage || 'DEPOT',
    centre_lat: geo.centre_lat ?? 6.3654,
    centre_lng: geo.centre_lng ?? 2.4183,
    rayon_metres: Number(geo.rayon_metres) || 500,
    polygone_coordonnees: geo.polygone_coordonnees,
    couleur_hex: geo.couleur_hex || '#0284c7',
    alerter_sur_entree: geo.alerter_sur_entree ?? true,
    alerter_sur_sortie: geo.alerter_sur_sortie ?? true,
    actif: geo.actif ?? true,
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_geofences').upsert(record)
  } catch {}

  const list = await getGeofencesFlotte(companyId)
  const idx = list.findIndex((g) => g.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'geofences', list)
  return record
}

// ─── 12. CENTRE D'ALERTES GPS & INCIDENTS ─────────────────────────────────────

export async function getAlertesFlotte(companyId: string): Promise<FlotteAlerte[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_alertes')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'alertes', data)
      return data as FlotteAlerte[]
    }
  } catch {}

  const cached = loadLocal<FlotteAlerte[]>(companyId, 'alertes', [])
  if (cached.length > 0) return cached

  const seeded: FlotteAlerte[] = [
    {
      id: 'alt-1',
      company_id: companyId,
      vehicule_immat: 'AY 8940 RB',
      type_alerte: 'EXCES_VITESSE',
      gravite: 'AVERTISSEMENT',
      message: 'Vitesse de 88 km/h détectée en zone urbaine (limite: 50 km/h)',
      valeur_mesuree: '88 km/h',
      valeur_seuil: '50 km/h',
      latitude: 6.3654,
      longitude: 2.4183,
      est_acquittee: false,
      created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    },
    {
      id: 'alt-2',
      company_id: companyId,
      vehicule_immat: 'BB 9012 RB',
      type_alerte: 'BATTERIE_FAIBLE',
      gravite: 'INFO',
      message: 'Tension batterie traceur 11.4V — Véhicule immobilisé atelier',
      valeur_mesuree: '11.4 V',
      valeur_seuil: '12.0 V',
      latitude: 6.3812,
      longitude: 2.4589,
      est_acquittee: true,
      acquittee_par: 'Gérard TCHIBOZO',
      acquittee_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    },
  ]
  saveLocal(companyId, 'alertes', seeded)
  return seeded
}

export async function acquitterAlerteFlotte(
  companyId: string,
  alerteId: string,
  userNom: string
): Promise<boolean> {
  try {
    await supabase
      .from('flotte_alertes')
      .update({
        est_acquittee: true,
        acquittee_par: userNom,
        acquittee_at: new Date().toISOString(),
      })
      .eq('id', alerteId)
      .eq('company_id', companyId)
  } catch {}

  const list = await getAlertesFlotte(companyId)
  const a = list.find((item) => item.id === alerteId)
  if (a) {
    a.est_acquittee = true
    a.acquittee_par = userNom
    a.acquittee_at = new Date().toISOString()
    saveLocal(companyId, 'alertes', list)
  }
  return true
}

// ─── 13. CAPTEURS IoT & CHAÎNE DU FROID ───────────────────────────────────────

export async function getCapteursFlotte(companyId: string): Promise<FlotteCapteur[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_capteurs')
      .select('*')
      .eq('company_id', companyId)
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'capteurs', data)
      return data as FlotteCapteur[]
    }
  } catch {}

  const cached = loadLocal<FlotteCapteur[]>(companyId, 'capteurs', [])
  if (cached.length > 0) return cached

  const seeded: FlotteCapteur[] = [
    {
      id: 'cap-1',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-3`,
      vehicule_immat: 'BK 1198 RB',
      nom_capteur: 'Sonde Température Caisse Frigo N°1',
      type_capteur: 'TEMPERATURE',
      identifiant_mac: 'BLE:E4:7F:32:01:8A',
      valeur_actuelle: -18.4,
      unite: '°C',
      seuil_min: -25.0,
      seuil_max: -15.0,
      alerte_active: false,
      derniere_mesure_at: new Date().toISOString(),
    },
    {
      id: 'cap-2',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-3`,
      vehicule_immat: 'BK 1198 RB',
      nom_capteur: 'Capteur Porte Arrière Frigo',
      type_capteur: 'PORTE',
      identifiant_mac: 'BLE:E4:7F:32:01:8B',
      valeur_actuelle: 0, // 0 = Fermée, 1 = Ouverte
      unite: 'statut',
      alerte_active: false,
      derniere_mesure_at: new Date().toISOString(),
    },
    {
      id: 'cap-3',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-1`,
      vehicule_immat: 'AY 8940 RB',
      nom_capteur: 'Sonde Niveau Réservoir Carburant',
      type_capteur: 'NIVEAU_CARBURANT',
      identifiant_mac: 'DUT-E-CAN-091',
      valeur_actuelle: 72.0,
      unite: '%',
      seuil_min: 15.0,
      alerte_active: false,
      derniere_mesure_at: new Date().toISOString(),
    },
  ]
  saveLocal(companyId, 'capteurs', seeded)
  return seeded
}

// ─── 14. AUTOPARTAGE & RÉSERVATIONS ───────────────────────────────────────────

export async function getReservationsFlotte(companyId: string): Promise<FlotteReservation[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_reservations')
      .select('*')
      .eq('company_id', companyId)
      .order('date_debut_prevue', { ascending: false })
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'reservations', data)
      return data as FlotteReservation[]
    }
  } catch {}

  const cached = loadLocal<FlotteReservation[]>(companyId, 'reservations', [])
  if (cached.length > 0) return cached

  const tomorrow = new Date(Date.now() + 86400 * 1000)
  const seeded: FlotteReservation[] = [
    {
      id: 'res-1',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-4`,
      vehicule_immat: 'AZ 5530 RB',
      demandeur_nom: 'Mme Christine SOSSOU',
      demandeur_departement: 'Direction Financière',
      demandeur_telephone: '+229 97 44 11 00',
      motif_deplacement: 'Audit comptable agences Porto-Novo & Sèmè-Podji',
      destination_prevue: 'Porto-Novo',
      date_debut_prevue: tomorrow.toISOString(),
      date_fin_prevue: new Date(tomorrow.getTime() + 8 * 3600 * 1000).toISOString(),
      statut: 'VALIDEE',
      valide_par: 'Direction des Opérations',
    },
  ]
  saveLocal(companyId, 'reservations', seeded)
  return seeded
}

export async function saveReservationFlotte(
  companyId: string,
  res: Partial<FlotteReservation>
): Promise<FlotteReservation> {
  const isNew = !res.id || res.id.startsWith('res-')
  const record: FlotteReservation = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `res-${Date.now()}`) : res.id!,
    company_id: companyId,
    vehicule_id: res.vehicule_id || '',
    vehicule_immat: res.vehicule_immat,
    demandeur_nom: res.demandeur_nom || '',
    demandeur_departement: res.demandeur_departement,
    demandeur_telephone: res.demandeur_telephone,
    motif_deplacement: res.motif_deplacement || 'Déplacement professionnel',
    destination_prevue: res.destination_prevue,
    date_debut_prevue: res.date_debut_prevue || new Date().toISOString(),
    date_fin_prevue: res.date_fin_prevue || new Date().toISOString(),
    statut: res.statut || 'EN_ATTENTE',
    valide_par: res.valide_par,
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_reservations').upsert(record)
  } catch {}

  const list = await getReservationsFlotte(companyId)
  const idx = list.findIndex((r) => r.id === record.id)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'reservations', list)
  return record
}

// ─── 15. INSPECTIONS & ÉTATS DES LIEUX ────────────────────────────────────────

export async function getInspectionsFlotte(companyId: string): Promise<FlotteInspection[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_inspections')
      .select('*')
      .eq('company_id', companyId)
      .order('date_inspection', { ascending: false })
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'inspections', data)
      return data as FlotteInspection[]
    }
  } catch {}

  const cached = loadLocal<FlotteInspection[]>(companyId, 'inspections', [])
  if (cached.length > 0) return cached

  const seeded: FlotteInspection[] = [
    {
      id: 'insp-1',
      company_id: companyId,
      vehicule_id: `v-seed-${companyId.slice(0, 4)}-1`,
      vehicule_immat: 'AY 8940 RB',
      conducteur_nom: 'Bio Séro KORA',
      type_inspection: 'DEPART',
      date_inspection: new Date().toISOString(),
      kilometrage_inspecte: 48250,
      niveau_carburant_pct: 75,
      niveau_huile_moteur: true,
      liquide_refroidissement: true,
      pression_pneus_conforme: true,
      feux_et_phares_ok: true,
      freins_ok: true,
      proprete_generale: true,
      presence_roue_secours: true,
      presence_cric_et_cle: true,
      presence_triangle_gilet: true,
      statut_validation: 'CONFORME',
      inspecte_par: 'Bio Séro KORA',
    },
  ]
  saveLocal(companyId, 'inspections', seeded)
  return seeded
}

export async function saveInspectionFlotte(
  companyId: string,
  insp: Partial<FlotteInspection>
): Promise<FlotteInspection> {
  const isNew = !insp.id || insp.id.startsWith('insp-')
  const record: FlotteInspection = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `insp-${Date.now()}`) : insp.id!,
    company_id: companyId,
    vehicule_id: insp.vehicule_id || '',
    vehicule_immat: insp.vehicule_immat,
    conducteur_id: insp.conducteur_id,
    conducteur_nom: insp.conducteur_nom,
    type_inspection: insp.type_inspection || 'DEPART',
    date_inspection: insp.date_inspection || new Date().toISOString(),
    kilometrage_inspecte: Number(insp.kilometrage_inspecte) || 0,
    niveau_carburant_pct: Number(insp.niveau_carburant_pct) || 100,
    niveau_huile_moteur: insp.niveau_huile_moteur ?? true,
    liquide_refroidissement: insp.liquide_refroidissement ?? true,
    pression_pneus_conforme: insp.pression_pneus_conforme ?? true,
    feux_et_phares_ok: insp.feux_et_phares_ok ?? true,
    freins_ok: insp.freins_ok ?? true,
    proprete_generale: insp.proprete_generale ?? true,
    presence_roue_secours: insp.presence_roue_secours ?? true,
    presence_cric_et_cle: insp.presence_cric_et_cle ?? true,
    presence_triangle_gilet: insp.presence_triangle_gilet ?? true,
    degats_carrosserie_notes: insp.degats_carrosserie_notes,
    statut_validation: insp.statut_validation || 'CONFORME',
    inspecte_par: insp.inspecte_par,
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_inspections').upsert(record)
  } catch {}

  const list = await getInspectionsFlotte(companyId)
  list.unshift(record)
  saveLocal(companyId, 'inspections', list)
  return record
}

// ─── 16. BALISES & INTÉGRATIONS TRACEURS GPS ──────────────────────────────────

export async function getBalisesFlotte(companyId: string): Promise<FlotteBalise[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_balises')
      .select('*')
      .eq('company_id', companyId)
    if (!error && data && data.length > 0) {
      saveLocal(companyId, 'balises', data)
      return data as FlotteBalise[]
    }
  } catch {}

  const cached = loadLocal<FlotteBalise[]>(companyId, 'balises', [])
  if (cached.length > 0) return cached

  const seeded: FlotteBalise[] = INITIAL_VEHICULES_BENIN.map((v, idx) => ({
    id: `bal-${idx + 1}`,
    company_id: companyId,
    imei: v.tracker_imei,
    modele: 'Teltonika FMB920 (BLE / 2G)',
    numero_sim: `+229 97 00 ${10 + idx} ${20 + idx}`,
    operateur_sim: 'MTN BENIN M2M',
    vehicule_immat: v.immatriculation,
    statut: idx === 4 ? 'HORS_LIGNE' : 'EN_LIGNE',
    derniere_trame_at: v.derniere_mise_a_jour_gps,
    niveau_batterie_pct: idx === 4 ? 22 : 98,
    firmware_version: '03.28.02.Rev.01',
    created_at: new Date().toISOString(),
  }))
  saveLocal(companyId, 'balises', seeded)
  return seeded
}

export async function saveBaliseFlotte(
  companyId: string,
  balise: Partial<FlotteBalise>
): Promise<FlotteBalise> {
  const isNew = !balise.id || balise.id.startsWith('bal-')
  const record: FlotteBalise = {
    id: isNew ? (crypto.randomUUID ? crypto.randomUUID() : `bal-${Date.now()}`) : balise.id!,
    company_id: companyId,
    imei: balise.imei || `86290404${Math.floor(1000000 + Math.random() * 9000000)}`,
    modele: balise.modele || 'Teltonika FMB920',
    numero_sim: balise.numero_sim || '+229 ',
    operateur_sim: balise.operateur_sim || 'MTN BENIN M2M',
    vehicule_id: balise.vehicule_id,
    vehicule_immat: balise.vehicule_immat,
    statut: balise.statut || 'EN_LIGNE',
    derniere_trame_at: new Date().toISOString(),
    niveau_batterie_pct: balise.niveau_batterie_pct ?? 100,
    firmware_version: balise.firmware_version || '03.28.02',
    created_at: new Date().toISOString(),
  }

  try {
    await supabase.from('flotte_balises').upsert(record)
  } catch {}

  const list = await getBalisesFlotte(companyId)
  const idx = list.findIndex((b) => b.id === record.id || b.imei === record.imei)
  if (idx >= 0) list[idx] = record
  else list.unshift(record)
  saveLocal(companyId, 'balises', list)
  return record
}

// ─── 17. PARAMÈTRES TÉLÉMATIQUES & CLÉ GOOGLE MAPS ────────────────────────────

export async function getParametresFlotte(companyId: string): Promise<FlotteParametres> {
  const defaultParams: FlotteParametres = {
    company_id: companyId,
    google_maps_api_key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    vitesse_max_ville_kmh: 50,
    vitesse_max_route_kmh: 90,
    vitesse_max_autoroute_kmh: 110,
    duree_arret_excessif_minutes: 30,
    alerte_email_active: true,
    alerte_sms_active: false,
    email_destinataire_alertes: 'flotte@gestio229.bj',
    serveur_gps_port: 5027,
    cle_secrete_webhook: 'sec_teltonika_flotte_229',
  }

  if (!companyId) return defaultParams

  try {
    const { data, error } = await supabase
      .from('flotte_parametres')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()
    if (!error && data) {
      saveLocal(companyId, 'parametres', data)
      return data as FlotteParametres
    }
  } catch {}

  return loadLocal<FlotteParametres>(companyId, 'parametres', defaultParams)
}

export async function saveParametresFlotte(
  companyId: string,
  params: Partial<FlotteParametres>
): Promise<FlotteParametres> {
  const current = await getParametresFlotte(companyId)
  const updated: FlotteParametres = {
    ...current,
    ...params,
    company_id: companyId,
  }

  try {
    await supabase.from('flotte_parametres').upsert(updated)
  } catch {}

  saveLocal(companyId, 'parametres', updated)
  return updated
}

// ─── 18. SIMULATEUR GPS INTÉGRÉ (TESTS DIRECTS SANS MATÉRIEL) ─────────────────

/**
 * Avance un véhicule le long d'un parcours type à Cotonou
 * Utile pour tester la télématique, les alertes de vitesse et le centrage dynamique Google Maps
 */
export async function simulerAvanceeVehicule(
  companyId: string,
  vehiculeId: string,
  deltaDistanceKm: number = 0.5
): Promise<FlotteVehicule | null> {
  const vehicules = await getVehiculesFlotte(companyId)
  const v = vehicules.find((veh) => veh.id === vehiculeId)
  if (!v) return null

  // Déplacement incrémental réaliste autour de Cotonou
  const lat = v.derniere_latitude || 6.3654
  const lng = v.derniere_longitude || 2.4183
  const cap = (v.dernier_cap + (Math.random() * 20 - 10) + 360) % 360
  const rad = (cap * Math.PI) / 180

  // 1 degre de lat ~= 111 km
  const deltaLat = (Math.cos(rad) * deltaDistanceKm) / 111
  const deltaLng = (Math.sin(rad) * deltaDistanceKm) / (111 * Math.cos((lat * Math.PI) / 180))

  const newLat = Number((lat + deltaLat).toFixed(6))
  const newLng = Number((lng + deltaLng).toFixed(6))
  const speed = Math.floor(35 + Math.random() * 45) // 35 à 80 km/h

  v.derniere_latitude = newLat
  v.derniere_longitude = newLng
  v.derniere_vitesse = speed
  v.dernier_cap = Math.round(cap)
  v.contact_allume = true
  v.statut = 'EN_CIRCULATION'
  v.kilometrage_actuel = Number((v.kilometrage_actuel + deltaDistanceKm).toFixed(2))
  v.derniere_mise_a_jour_gps = new Date().toISOString()
  if (v.niveau_carburant_pct > 5) {
    v.niveau_carburant_pct = Number((v.niveau_carburant_pct - 0.1).toFixed(1))
  }

  saveLocal(companyId, 'vehicules', vehicules)

  // Enregistrer le point de trace
  await enregistrerPositionGps(companyId, {
    vehicule_id: v.id,
    tracker_imei: v.tracker_imei,
    latitude: newLat,
    longitude: newLng,
    vitesse_kmh: speed,
    cap_degres: v.dernier_cap,
    contact_allume: true,
    kilometrage_compteur: v.kilometrage_actuel,
    horodatage: new Date().toISOString(),
  })

  // Vérifier si excès de vitesse
  const params = await getParametresFlotte(companyId)
  if (speed > params.vitesse_max_ville_kmh) {
    const alertes = await getAlertesFlotte(companyId)
    const newAlert: FlotteAlerte = {
      id: `alt-${Date.now()}`,
      company_id: companyId,
      vehicule_id: v.id,
      vehicule_immat: v.immatriculation,
      type_alerte: 'EXCES_VITESSE',
      gravite: speed > 70 ? 'CRITIQUE' : 'AVERTISSEMENT',
      message: `Véhicule ${v.immatriculation} en excès de vitesse (${speed} km/h > ${params.vitesse_max_ville_kmh} km/h)`,
      valeur_mesuree: `${speed} km/h`,
      valeur_seuil: `${params.vitesse_max_ville_kmh} km/h`,
      latitude: newLat,
      longitude: newLng,
      est_acquittee: false,
      created_at: new Date().toISOString(),
    }
    alertes.unshift(newAlert)
    saveLocal(companyId, 'alertes', alertes)
  }

  return v
}
