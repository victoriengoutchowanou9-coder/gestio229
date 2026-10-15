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

// ─── 2. MODÈLE DU PARCOURS & COORDONNÉES RÉELLES BÉNIN ───────────────────────
// Trajet officiel sur la RNIE 2 (Cotonou -> Bohicon -> Dassa-Zoumè)

export interface PointParcours {
  latitude: number
  longitude: number
  vitesse_kmh?: number
  horodatage?: string
  nom_etape?: string
  est_arret?: boolean
}

// Axe RNIE 2 visible sur Google Maps (conformément à la photo envoyée : Bohicon au centre, Dassa au nord)
export const PARCOURS_BENIN_RNIE2: PointParcours[] = [
  { latitude: 6.3654, longitude: 2.4183, vitesse_kmh: 0, nom_etape: 'Départ : Cotonou Marina (RNIE 2)', est_arret: true },
  { latitude: 6.4258, longitude: 2.3394, vitesse_kmh: 48, nom_etape: 'Abomey-Calavi' },
  { latitude: 6.6654, longitude: 2.1513, vitesse_kmh: 65, nom_etape: 'Allada Centre' },
  { latitude: 6.8450, longitude: 2.0830, vitesse_kmh: 72, nom_etape: 'Toffo' },
  { latitude: 7.0200, longitude: 2.0720, vitesse_kmh: 68, nom_etape: 'Zogbodomey' },
  { latitude: 7.1783, longitude: 2.0667, vitesse_kmh: 54, nom_etape: 'Bohicon Carrefour Zakpo (Position Actuelle)' },
  { latitude: 7.3500, longitude: 2.1100, vitesse_kmh: 75, nom_etape: 'Covè / Zou Nord' },
  { latitude: 7.7558, longitude: 2.1831, vitesse_kmh: 0, nom_etape: 'Destination : Dassa-Zoumè (Collines)', est_arret: true },
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

/**
 * Nettoie toutes les valeurs fictives résiduelles du module flotte dans le stockage local et Supabase
 */
export async function nettoyerValeursFictivesFlotte(companyId: string): Promise<void> {
  if (!companyId) return
  const resources = [
    'vehicules',
    'conducteurs',
    'missions',
    'carburant',
    'maintenance',
    'documents',
    'geofences',
    'alertes',
    'capteurs',
    'reservations',
    'inspections',
    'balises',
    'positions_gps',
  ]

  for (const res of resources) {
    const key = getLocalKey(companyId, res)
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        if (
          raw.includes('seed-') ||
          raw.includes('AY 8940') ||
          raw.includes('Bio Séro') ||
          raw.includes('BL 2045') ||
          raw.includes('BK 1198') ||
          raw.includes('AZ 5530') ||
          raw.includes('BB 9012') ||
          raw.includes('AH 3301')
        ) {
          localStorage.removeItem(key)
        }
      }
    } catch {}
  }

  try {
    await supabase.from('flotte_vehicules').delete().eq('company_id', companyId).ilike('id', 'v-seed-%')
    await supabase.from('flotte_conducteurs').delete().eq('company_id', companyId).ilike('id', 'c-seed-%')
    await supabase.from('flotte_missions').delete().eq('company_id', companyId).ilike('id', 'm-seed-%')
  } catch {}
}

// ─── 4. PARC VÉHICULES ────────────────────────────────────────────────────────

export async function getVehiculesFlotte(companyId: string): Promise<FlotteVehicule[]> {
  if (!companyId) return []

  try {
    const { data, error } = await supabase
      .from('flotte_vehicules')
      .select('*')
      .eq('company_id', companyId)
      .not('id', 'ilike', 'v-seed-%')
      .order('immatriculation', { ascending: true })

    if (error) {
      console.warn('[flotteService] Table flotte_vehicules en base:', error.message)
      throw error
    }

    if (data) {
      const realData = (data as FlotteVehicule[]).filter((v) => !v.id.includes('seed-'))
      saveLocal(companyId, 'vehicules', realData)
      return realData
    }
  } catch {
    // Fallback localstorage
  }

  const cached = loadLocal<FlotteVehicule[]>(companyId, 'vehicules', [])
  const realCached = cached.filter(
    (v) =>
      !v.id.includes('seed-') &&
      !['AY 8940 RB', 'BL 2045 RB', 'BK 1198 RB', 'AZ 5530 RB', 'BB 9012 RB', 'AH 3301 RB'].includes(
        v.immatriculation
      )
  )

  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'vehicules', realCached)
  }

  return realCached
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
      .not('id', 'ilike', 'c-seed-%')
      .order('nom_complet')
    if (!error && data) {
      const realData = (data as FlotteConducteur[]).filter((c) => !c.id.includes('seed-'))
      saveLocal(companyId, 'conducteurs', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteConducteur[]>(companyId, 'conducteurs', [])
  const realCached = cached.filter((c) => !c.id.includes('seed-') && !['Bio Séro KORA', 'Aimé DOSSA', 'Rodrigue AGOSSOU', 'Sylvestre DAKO'].includes(c.nom_complet))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'conducteurs', realCached)
  }
  return realCached
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

/**
 * Récupère le parcours GPS complet d'un véhicule (ordonné chronologiquement)
 * Utilisé pour tracer la polyline Google Maps "son parcours"
 */
export async function getParcoursVehicule(
  companyId: string,
  vehiculeId: string
): Promise<PointParcours[]> {
  if (!companyId || !vehiculeId) return []

  try {
    const { data, error } = await supabase
      .from('flotte_positions_gps')
      .select('latitude, longitude, vitesse_kmh, horodatage, adresse_approximative')
      .eq('company_id', companyId)
      .eq('vehicule_id', vehiculeId)
      .order('horodatage', { ascending: true })
      .limit(200)

    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
        vitesse_kmh: Number(d.vitesse_kmh || 0),
        horodatage: d.horodatage,
        nom_etape: d.adresse_approximative,
      }))
    }
  } catch {}

  // Fallback cache local des positions enregistrées
  const localPositions = loadLocal<FlottePositionGps[]>(companyId, 'positions_gps', [])
  const vehPositions = localPositions
    .filter((p) => p.vehicule_id === vehiculeId)
    .sort((a, b) => new Date(a.horodatage).getTime() - new Date(b.horodatage).getTime())

  if (vehPositions.length > 0) {
    return vehPositions.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      vitesse_kmh: p.vitesse_kmh,
      horodatage: p.horodatage,
      nom_etape: p.adresse_approximative,
    }))
  }

  return []
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
      .not('id', 'ilike', 'm-seed-%')
      .order('created_at', { ascending: false })
    if (!error && data) {
      const realData = (data as FlotteMission[]).filter((m) => !m.id.includes('seed-'))
      saveLocal(companyId, 'missions', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteMission[]>(companyId, 'missions', [])
  const realCached = cached.filter((m) => !m.id.includes('seed-') && !m.numero_ordre?.includes('MSN-2026-08'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'missions', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'carb-%')
      .order('date_plein', { ascending: false })
    if (!error && data) {
      const realData = (data as FlotteCarburant[]).filter((c) => !c.id.startsWith('carb-'))
      saveLocal(companyId, 'carburant', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteCarburant[]>(companyId, 'carburant', [])
  const realCached = cached.filter((c) => !c.id.startsWith('carb-') && !c.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'carburant', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'maint-%')
      .order('date_intervention', { ascending: false })
    if (!error && data) {
      const realData = (data as FlotteMaintenance[]).filter((m) => !m.id.startsWith('maint-'))
      saveLocal(companyId, 'maintenance', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteMaintenance[]>(companyId, 'maintenance', [])
  const realCached = cached.filter((m) => !m.id.startsWith('maint-') && !m.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'maintenance', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'doc-%')
      .order('date_expiration', { ascending: true })
    if (!error && data) {
      const realData = (data as FlotteDocument[]).filter((d) => !d.id.startsWith('doc-'))
      saveLocal(companyId, 'documents', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteDocument[]>(companyId, 'documents', [])
  const realCached = cached.filter((d) => !d.id.startsWith('doc-') && !d.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'documents', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'geo-%')
      .order('nom_zone')
    if (!error && data) {
      const realData = (data as FlotteGeofence[]).filter((g) => !g.id.startsWith('geo-'))
      saveLocal(companyId, 'geofences', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteGeofence[]>(companyId, 'geofences', [])
  const realCached = cached.filter((g) => !g.id.startsWith('geo-') && !g.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'geofences', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'alt-%')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error && data) {
      const realData = (data as FlotteAlerte[]).filter((a) => !a.id.startsWith('alt-'))
      saveLocal(companyId, 'alertes', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteAlerte[]>(companyId, 'alertes', [])
  const realCached = cached.filter((a) => !a.id.startsWith('alt-') && !a.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'alertes', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'cap-%')
    if (!error && data) {
      const realData = (data as FlotteCapteur[]).filter((c) => !c.id.startsWith('cap-'))
      saveLocal(companyId, 'capteurs', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteCapteur[]>(companyId, 'capteurs', [])
  const realCached = cached.filter((c) => !c.id.startsWith('cap-') && !c.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'capteurs', realCached)
  }
  return realCached
}

// ─── 14. AUTOPARTAGE & RÉSERVATIONS ───────────────────────────────────────────

export async function getReservationsFlotte(companyId: string): Promise<FlotteReservation[]> {
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('flotte_reservations')
      .select('*')
      .eq('company_id', companyId)
      .not('id', 'ilike', 'res-%')
      .order('date_debut_prevue', { ascending: false })
    if (!error && data) {
      const realData = (data as FlotteReservation[]).filter((r) => !r.id.startsWith('res-'))
      saveLocal(companyId, 'reservations', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteReservation[]>(companyId, 'reservations', [])
  const realCached = cached.filter((r) => !r.id.startsWith('res-') && !r.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'reservations', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'insp-%')
      .order('date_inspection', { ascending: false })
    if (!error && data) {
      const realData = (data as FlotteInspection[]).filter((i) => !i.id.startsWith('insp-'))
      saveLocal(companyId, 'inspections', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteInspection[]>(companyId, 'inspections', [])
  const realCached = cached.filter((i) => !i.id.startsWith('insp-') && !i.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'inspections', realCached)
  }
  return realCached
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
      .not('id', 'ilike', 'bal-%')
    if (!error && data) {
      const realData = (data as FlotteBalise[]).filter((b) => !b.id.startsWith('bal-'))
      saveLocal(companyId, 'balises', realData)
      return realData
    }
  } catch {}

  const cached = loadLocal<FlotteBalise[]>(companyId, 'balises', [])
  const realCached = cached.filter((b) => !b.id.startsWith('bal-') && !b.id.includes('seed-'))
  if (realCached.length !== cached.length) {
    saveLocal(companyId, 'balises', realCached)
  }
  return realCached
}

/**
 * Crée un véhicule témoin sur la RNIE 2 (Bohicon - Dassa) UNIQUEMENT sur demande explicite de l'utilisateur
 * Permet de visualiser immédiatement la carte Google Maps, son parcours et sa position en direct
 */
export async function creerVehiculeDemonstrationRnie2(companyId: string): Promise<FlotteVehicule> {
  const v = await saveVehiculeFlotte(companyId, {
    immatriculation: 'AY 9901 RB',
    code_interne: 'FL-TEST',
    marque: 'Toyota',
    modele: 'Hilux Double Cabine 4x4',
    annee: 2024,
    type_vehicule: 'UTILITAIRE',
    type_carburant: 'GASOIL',
    capacite_reservoir_litres: 80,
    consommation_reference_100km: 9.0,
    kilometrage_actuel: 12450,
    statut: 'EN_CIRCULATION',
    conducteur_nom: 'Chauffeur Flotte Bénin',
    derniere_latitude: 7.1783, // Bohicon (exactement le centre de la photo Google Maps envoyée !)
    derniere_longitude: 2.0667,
    derniere_vitesse: 58,
    dernier_cap: 355,
    contact_allume: true,
    niveau_carburant_pct: 78,
  })

  // Enregistrer le parcours initial Cotonou -> Allada -> Bohicon
  const points = PARCOURS_BENIN_RNIE2.slice(0, 6)
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    await enregistrerPositionGps(companyId, {
      vehicule_id: v.id,
      latitude: pt.latitude,
      longitude: pt.longitude,
      vitesse_kmh: pt.vitesse_kmh || 50,
      cap_degres: 355,
      contact_allume: true,
      adresse_approximative: pt.nom_etape,
      horodatage: new Date(Date.now() - (6 - i) * 20 * 60 * 1000).toISOString(),
    })
  }

  return v
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

  // Déplacement le long de l'axe routier Bénin (RNIE 2 vers le nord Bohicon / Dassa)
  const lat = v.derniere_latitude || 7.1783
  const lng = v.derniere_longitude || 2.0667

  // Progression orientée nord/nord-est le long de la RNIE 2 (axe Cotonou - Bohicon - Dassa)
  const cap = v.dernier_cap !== undefined && v.dernier_cap !== 0 ? (v.dernier_cap + (Math.random() * 10 - 5) + 360) % 360 : 355
  const rad = (cap * Math.PI) / 180

  // 1 degre de lat ~= 111 km
  const deltaLat = (Math.cos(rad) * deltaDistanceKm) / 111
  const deltaLng = (Math.sin(rad) * deltaDistanceKm) / (111 * Math.cos((lat * Math.PI) / 180))

  const newLat = Number((lat + deltaLat).toFixed(6))
  const newLng = Number((lng + deltaLng).toFixed(6))
  const speed = Math.floor(45 + Math.random() * 35) // 45 à 80 km/h

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
