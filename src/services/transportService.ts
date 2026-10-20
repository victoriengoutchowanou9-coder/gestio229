// =============================================================================
// GESTIO 229 — SERVICE MÉTIER DÉDIÉ : TRANSPORT DE VOYAGEURS & LOGISTIQUE
// =============================================================================
// Responsabilité : Lignes, arrêts, départs, billetterie, contrôle des tickets,
// plan de sièges, colis & expéditions, chargement, fret, chauffeurs, flotte bus,
// carburant, maintenance et calculs de rentabilité.
// Isolation stricte par company_id + sector_slug ('transport').
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'

// ─── TYPES & INTERFACES ──────────────────────────────────────────────────────

export interface TransportArret {
  id: string
  ordre: number
  nom: string
  ville: string
  adresse?: string
  coordonnees_gps?: string
  est_actif: boolean
  duree_depuis_depart_min: number // minutes depuis le point de départ
}

export interface TransportLigne {
  id: string
  company_id?: string
  sector_slug?: string
  code_ligne: string // ex: "L-COT-PAR"
  nom_ligne: string // ex: "Cotonou - Parakou Express"
  ville_origine: string
  ville_destination: string
  distance_km: number
  duree_estimee_minutes: number
  arrêts: TransportArret[]
  grille_tarifs: Record<string, number> // clé "arretDepartId_arretArriveeId" => tarif FCFA
  est_actif: boolean
  description?: string
}

export interface TransportBus {
  id: string
  company_id?: string
  sector_slug?: string
  immatriculation: string
  marque: string
  modele: string
  categorie: 'VIP Climatise' | 'Standard' | 'Minibus' | 'Car Courrier'
  capacite_passagers: number
  places_commercialisables: number
  capacite_soute_kg?: number
  plan_sieges_actif: boolean // true = sièges numérotés, false = placement libre
  agence_rattachement: string
  kilometrage: number
  statut: 'DISPONIBLE' | 'AFFECTE' | 'EN_ROUTE' | 'MAINTENANCE' | 'IMMOBILISE'
  date_expiration_assurance?: string
  date_expiration_visite_technique?: string
  notes?: string
}

export interface TransportChauffeur {
  id: string
  company_id?: string
  sector_slug?: string
  nom: string
  prenom: string
  telephone: string
  numero_permis: string
  categories_permis: string[] // ['D', 'C', 'B']
  date_expiration_permis: string
  statut: 'DISPONIBLE' | 'EN_MISSION' | 'REPOS' | 'CONGE' | 'SUSPENDU'
  agence: string
  historique_trajets_count?: number
}

export interface TransportDepart {
  id: string
  company_id?: string
  sector_slug?: string
  ligne_id: string
  ligne_code: string
  ligne_nom: string
  date_depart: string // YYYY-MM-DD
  heure_depart: string // HH:mm
  heure_arrivee_estimee: string
  bus_id: string
  bus_immatriculation: string
  capacite_totale: number
  places_vendues: number
  places_reservees: number
  places_restantes: number
  sieges_occupes: number[] // Liste des numéros de sièges déjà vendus/réservés
  chauffeur_id: string
  chauffeur_nom: string
  convoyeur_nom?: string
  statut: 'PROGRAMME' | 'EMBARQUEMENT' | 'EN_ROUTE' | 'ARRIVE' | 'RETARDE' | 'ANNULE' | 'COMPLET'
  motif_retard_annulation?: string
  prix_base: number
  created_at?: string
}

export interface TransportTicket {
  id: string
  company_id?: string
  sector_slug?: string
  numero_ticket: string // ex: "TKT-202610-8492"
  depart_id: string
  ligne_id: string
  ligne_nom: string
  date_voyage: string
  heure_depart: string
  bus_immatriculation: string
  arret_depart: string
  arret_arrivee: string
  siege_numero?: number
  passager_nom: string
  passager_telephone: string
  passager_piece_id?: string
  tarif: number
  mode_paiement: 'ESPECES' | 'MOBILE_MONEY' | 'CARTE' | 'CREANCE'
  statut: 'RESERVE' | 'PAYE' | 'UTILISE' | 'ANNULE' | 'REMBOURSE'
  date_emission: string
  date_controle?: string
  controle_par?: string
  qr_token: string
  notes?: string
}

export interface TransportColis {
  id: string
  company_id?: string
  sector_slug?: string
  code_suivi: string // ex: "TRK-202610-1092"
  expediteur_nom: string
  expediteur_telephone: string
  destinataire_nom: string
  destinataire_telephone: string
  destinataire_piece_id?: string
  agence_depot: string
  agence_retrait: string
  nature_colis: string
  nombre_colis: number
  poids_kg: number
  valeur_declaree?: number
  frais_transport: number
  statut: 'ENREGISTRE' | 'EN_ATTENTE_CHARGEMENT' | 'CHARGE' | 'EN_TRANSIT' | 'ARRIVE_AGENCE' | 'DISPONIBLE_RETRAIT' | 'LIVRE' | 'INCIDENT' | 'RETOURNE'
  depart_id?: string
  bus_immatriculation?: string
  date_depot: string
  date_chargement?: string
  date_arrivee?: string
  date_livraison?: string
  agent_reception?: string
  agent_remise?: string
  preuve_remise?: string
  motif_incident?: string
  instructions?: string
}

export interface TransportMissionFret {
  id: string
  company_id?: string
  sector_slug?: string
  numero_ordre: string
  client_nom: string
  client_telephone?: string
  type_marchandise: string
  vehicule_immatriculation: string
  chauffeur_nom: string
  ville_depart: string
  ville_destination: string
  date_mission: string
  kilometrage_depart: number
  kilometrage_arrivee?: number
  prix_prestation: number
  frais_route: number
  frais_carburant: number
  statut: 'DEVIS' | 'CONFIRMEE' | 'EN_COURS' | 'LIVREE' | 'FACTUREE' | 'ANNULEE'
  preuve_livraison_ref?: string
  observations?: string
}

export interface TransportCarburantLog {
  id: string
  company_id?: string
  bus_id: string
  immatriculation: string
  date: string
  kilometrage: number
  quantite_litres: number
  prix_litre: number
  cout_total: number
  fournisseur_station?: string
  justificatif?: string
  plein_complet: boolean
}

export interface TransportMaintenanceLog {
  id: string
  company_id?: string
  bus_id: string
  immatriculation: string
  date_debut: string
  date_fin_prevue?: string
  type_intervention: 'VIDANGE_PREVENTIVE' | 'PNEUMATIQUE' | 'FREINAGE' | 'MOTEUR' | 'CLIMATISATION' | 'CARROSSERIE' | 'VISITE_TECHNIQUE'
  description: string
  garage_prestataire?: string
  cout_pieces: number
  cout_main_oeuvre: number
  cout_total: number
  immobilise_le_bus: boolean
  statut: 'PLANIFIE' | 'EN_COURS' | 'TERMINE' | 'ANNULE'
}

export interface TransportKPIs {
  recettesJourBillets: number
  recettesJourColis: number
  totalRecettesJour: number
  ticketsVendusMois: number
  tauxRemplissageMoyen: number
  colisEnTransit: number
  colisLivresMois: number
  busDisponibles: number
  busEnMission: number
  busMaintenance: number
  totalBus: number
  departsDuJour: number
}

// ─── DONNÉES PAR DÉFAUT RÉALISTES (SEED BÉNIN / INTERURBAIN) ──────────────────

export const DEFAULT_TRANSPORT_LIGNES: TransportLigne[] = [
  {
    id: 'lig-cot-par',
    code_ligne: 'L-COT-PAR',
    nom_ligne: 'Cotonou - Bohicon - Parakou Express',
    ville_origine: 'Cotonou (Étoile Rouge)',
    ville_destination: 'Parakou (Gare Centrale)',
    distance_km: 415,
    duree_estimee_minutes: 360,
    est_actif: true,
    arrêts: [
      { id: 'arr-cot-01', ordre: 1, nom: 'Gare Étoile Rouge', ville: 'Cotonou', est_actif: true, duree_depuis_depart_min: 0 },
      { id: 'arr-cot-02', ordre: 2, nom: 'Carrefour Calavi Kpota', ville: 'Abomey-Calavi', est_actif: true, duree_depuis_depart_min: 30 },
      { id: 'arr-all-01', ordre: 3, nom: 'Gare Allada', ville: 'Allada', est_actif: true, duree_depuis_depart_min: 65 },
      { id: 'arr-boh-01', ordre: 4, nom: 'Gare Bohicon Carrefour', ville: 'Bohicon', est_actif: true, duree_depuis_depart_min: 135 },
      { id: 'arr-das-01', ordre: 5, nom: 'Halte Dassa-Zoumè', ville: 'Dassa', est_actif: true, duree_depuis_depart_min: 200 },
      { id: 'arr-sav-01', ordre: 6, nom: 'Gare Savè', ville: 'Savè', est_actif: true, duree_depuis_depart_min: 260 },
      { id: 'arr-par-01', ordre: 7, nom: 'Gare Centrale Parakou', ville: 'Parakou', est_actif: true, duree_depuis_depart_min: 360 },
    ],
    grille_tarifs: {
      'arr-cot-01_arr-boh-01': 3500,
      'arr-cot-01_arr-das-01': 5000,
      'arr-cot-01_arr-sav-01': 6500,
      'arr-cot-01_arr-par-01': 8500,
      'arr-boh-01_arr-par-01': 6000,
      'arr-das-01_arr-par-01': 4500,
    },
    description: 'Ligne principale interurbaine Axe Sud-Nord Bénin'
  },
  {
    id: 'lig-cot-pno',
    code_ligne: 'L-COT-PNO',
    nom_ligne: 'Cotonou - Porto-Novo Navette',
    ville_origine: 'Cotonou (Dantokpa)',
    ville_destination: 'Porto-Novo (Carrefour Ouando)',
    distance_km: 32,
    duree_estimee_minutes: 45,
    est_actif: true,
    arrêts: [
      { id: 'arr-c-dan', ordre: 1, nom: 'Gare Dantokpa', ville: 'Cotonou', est_actif: true, duree_depuis_depart_min: 0 },
      { id: 'arr-p-sem', ordre: 2, nom: 'Carrefour Sèmè Kpodji', ville: 'Sèmè', est_actif: true, duree_depuis_depart_min: 20 },
      { id: 'arr-p-oua', ordre: 3, nom: 'Gare Ouando', ville: 'Porto-Novo', est_actif: true, duree_depuis_depart_min: 45 },
    ],
    grille_tarifs: {
      'arr-c-dan_arr-p-sem': 500,
      'arr-c-dan_arr-p-oua': 1000,
      'arr-p-sem_arr-p-oua': 500,
    },
    description: 'Liaison directe métropolitaine Cotonou - Capitale'
  }
]

export const DEFAULT_TRANSPORT_BUS: TransportBus[] = [
  {
    id: 'bus-01',
    immatriculation: 'AY 2026 RB',
    marque: 'Mercedes-Benz',
    modele: 'Travego VIP 55',
    categorie: 'VIP Climatise',
    capacite_passagers: 55,
    places_commercialisables: 53,
    capacite_soute_kg: 1500,
    plan_sieges_actif: true,
    agence_rattachement: 'Cotonou',
    kilometrage: 124500,
    statut: 'DISPONIBLE',
    date_expiration_assurance: '2027-04-15',
    date_expiration_visite_technique: '2027-01-20',
  },
  {
    id: 'bus-02',
    immatriculation: 'AZ 1084 RB',
    marque: 'Scania',
    modele: 'Touring HD',
    categorie: 'VIP Climatise',
    capacite_passagers: 50,
    places_commercialisables: 48,
    capacite_soute_kg: 1200,
    plan_sieges_actif: true,
    agence_rattachement: 'Cotonou',
    kilometrage: 89300,
    statut: 'DISPONIBLE',
    date_expiration_assurance: '2027-05-30',
    date_expiration_visite_technique: '2026-12-10',
  },
  {
    id: 'bus-03',
    immatriculation: 'BA 4519 RB',
    marque: 'Toyota',
    modele: 'Coaster Confort',
    categorie: 'Minibus',
    capacite_passagers: 30,
    places_commercialisables: 28,
    capacite_soute_kg: 500,
    plan_sieges_actif: false,
    agence_rattachement: 'Porto-Novo',
    kilometrage: 42000,
    statut: 'DISPONIBLE',
    date_expiration_assurance: '2027-03-01',
    date_expiration_visite_technique: '2027-02-15',
  }
]

export const DEFAULT_TRANSPORT_CHAUFFEURS: TransportChauffeur[] = [
  {
    id: 'chauf-01',
    nom: 'HOUNDE',
    prenom: 'Mathieu',
    telephone: '+229 97 12 34 56',
    numero_permis: 'BEN-D-48921',
    categories_permis: ['D', 'C'],
    date_expiration_permis: '2028-09-15',
    statut: 'DISPONIBLE',
    agence: 'Cotonou',
    historique_trajets_count: 142
  },
  {
    id: 'chauf-02',
    nom: 'BIO GUERRA',
    prenom: 'Sidi',
    telephone: '+229 96 45 67 89',
    numero_permis: 'BEN-D-10928',
    categories_permis: ['D', 'C', 'E'],
    date_expiration_permis: '2027-11-20',
    statut: 'DISPONIBLE',
    agence: 'Parakou',
    historique_trajets_count: 98
  }
]

// ─── PERSISTANCE LOCALE SÉCURISÉE (CACHE & FALLBACK) ──────────────────────────

export function getLocalTransport<T>(companyId: string, key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(`gestio_transport_${companyId}_${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch (err) {
    return fallback
  }
}

export function setLocalTransport<T>(companyId: string, key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`gestio_transport_${companyId}_${key}`, JSON.stringify(data))
  } catch (err) {
    console.warn(`[transportService] Echec persistance locale ${key}:`, err)
  }
}

// ─── 1. GESTION DES LIGNES & ARRÊTS ──────────────────────────────────────────

export async function fetchTransportLignes(companyId: string): Promise<TransportLigne[]> {
  const local = getLocalTransport<TransportLigne[]>(companyId, 'lignes', [])
  if (local.length > 0) return local
  setLocalTransport(companyId, 'lignes', DEFAULT_TRANSPORT_LIGNES)
  return DEFAULT_TRANSPORT_LIGNES
}

export async function saveTransportLigne(companyId: string, ligneData: Partial<TransportLigne>): Promise<TransportLigne> {
  const lignes = await fetchTransportLignes(companyId)
  let saved: TransportLigne

  if (ligneData.id) {
    saved = { ...lignes.find(l => l.id === ligneData.id)!, ...ligneData } as TransportLigne
    const updated = lignes.map(l => l.id === saved.id ? saved : l)
    setLocalTransport(companyId, 'lignes', updated)
  } else {
    saved = {
      ...ligneData,
      id: `lig-${Date.now()}`,
      company_id: companyId,
      sector_slug: 'transport',
      est_actif: true,
      arrêts: ligneData.arrêts || [],
      grille_tarifs: ligneData.grille_tarifs || {},
    } as TransportLigne
    setLocalTransport(companyId, 'lignes', [...lignes, saved])
  }

  return saved
}

export function calculerTarifTrajet(ligne: TransportLigne, arretDepartId: string, arretArriveeId: string, tarifDefaut = 5000): number {
  if (!ligne || !ligne.grille_tarifs) return tarifDefaut
  const key = `${arretDepartId}_${arretArriveeId}`
  if (ligne.grille_tarifs[key] !== undefined) {
    return Number(ligne.grille_tarifs[key])
  }
  // Essayer clé inverse (aller-retour même tarif)
  const keyReverse = `${arretArriveeId}_${arretDepartId}`
  if (ligne.grille_tarifs[keyReverse] !== undefined) {
    return Number(ligne.grille_tarifs[keyReverse])
  }
  return tarifDefaut
}

// ─── 2. GESTION DU PARC AUTOMOBILE (BUS) ─────────────────────────────────────

export async function fetchTransportBus(companyId: string): Promise<TransportBus[]> {
  const local = getLocalTransport<TransportBus[]>(companyId, 'bus', [])
  if (local.length > 0) return local
  setLocalTransport(companyId, 'bus', DEFAULT_TRANSPORT_BUS)
  return DEFAULT_TRANSPORT_BUS
}

export async function saveTransportBus(companyId: string, busData: Partial<TransportBus>): Promise<TransportBus> {
  const list = await fetchTransportBus(companyId)
  let saved: TransportBus

  if (busData.id) {
    saved = { ...list.find(b => b.id === busData.id)!, ...busData } as TransportBus
    const updated = list.map(b => b.id === saved.id ? saved : b)
    setLocalTransport(companyId, 'bus', updated)
  } else {
    saved = {
      ...busData,
      id: `bus-${Date.now()}`,
      company_id: companyId,
      sector_slug: 'transport',
      statut: busData.statut || 'DISPONIBLE',
      kilometrage: busData.kilometrage || 0,
      capacite_passagers: busData.capacite_passagers || 50,
      places_commercialisables: busData.places_commercialisables || busData.capacite_passagers || 50,
      plan_sieges_actif: busData.plan_sieges_actif !== undefined ? busData.plan_sieges_actif : true,
    } as TransportBus
    setLocalTransport(companyId, 'bus', [...list, saved])
  }

  return saved
}

export async function updateBusStatut(companyId: string, busId: string, statut: TransportBus['statut']): Promise<void> {
  const list = await fetchTransportBus(companyId)
  const updated = list.map(b => b.id === busId ? { ...b, statut } : b)
  setLocalTransport(companyId, 'bus', updated)
}

// ─── 3. GESTION DES CHAUFFEURS & PERSONNEL ROULANT ───────────────────────────

export async function fetchTransportChauffeurs(companyId: string): Promise<TransportChauffeur[]> {
  const local = getLocalTransport<TransportChauffeur[]>(companyId, 'chauffeurs', [])
  if (local.length > 0) return local
  setLocalTransport(companyId, 'chauffeurs', DEFAULT_TRANSPORT_CHAUFFEURS)
  return DEFAULT_TRANSPORT_CHAUFFEURS
}

export async function saveTransportChauffeur(companyId: string, chauffeurData: Partial<TransportChauffeur>): Promise<TransportChauffeur> {
  const list = await fetchTransportChauffeurs(companyId)
  let saved: TransportChauffeur

  if (chauffeurData.id) {
    saved = { ...list.find(c => c.id === chauffeurData.id)!, ...chauffeurData } as TransportChauffeur
    const updated = list.map(c => c.id === saved.id ? saved : c)
    setLocalTransport(companyId, 'chauffeurs', updated)
  } else {
    saved = {
      ...chauffeurData,
      id: `chauf-${Date.now()}`,
      company_id: companyId,
      sector_slug: 'transport',
      statut: chauffeurData.statut || 'DISPONIBLE',
      categories_permis: chauffeurData.categories_permis || ['D'],
      historique_trajets_count: 0
    } as TransportChauffeur
    setLocalTransport(companyId, 'chauffeurs', [...list, saved])
  }

  return saved
}

// ─── 4. HORAIRES, DÉPARTS & ROTATIONS ─────────────────────────────────────────

export async function fetchTransportDeparts(companyId: string): Promise<TransportDepart[]> {
  return getLocalTransport<TransportDepart[]>(companyId, 'departs', [])
}

export async function verifierDisponibiliteRessourcesDepart(
  companyId: string,
  busId: string,
  chauffeurId: string,
  dateDepart: string,
  heureDepart: string,
  excludeDepartId?: string
): Promise<{ valide: boolean; motif?: string }> {
  // 1. Vérifier état du bus
  const allBus = await fetchTransportBus(companyId)
  const bus = allBus.find(b => b.id === busId)
  if (!bus) return { valide: false, motif: 'Bus introuvable.' }
  if (bus.statut === 'MAINTENANCE' || bus.statut === 'IMMOBILISE') {
    return { valide: false, motif: `Le bus ${bus.immatriculation} est actuellement immobilisé ou en maintenance.` }
  }

  // 2. Vérifier disponibilité du chauffeur
  const allChauffeurs = await fetchTransportChauffeurs(companyId)
  const chauf = allChauffeurs.find(c => c.id === chauffeurId)
  if (!chauf) return { valide: false, motif: 'Chauffeur introuvable.' }
  if (chauf.statut === 'SUSPENDU' || chauf.statut === 'CONGE') {
    return { valide: false, motif: `Le conducteur ${chauf.nom} ${chauf.prenom} n'est pas disponible (statut : ${chauf.statut}).` }
  }

  // 3. Vérifier conflits horaires (même date et créneau simultané)
  const departs = await fetchTransportDeparts(companyId)
  for (const dep of departs) {
    if (excludeDepartId && dep.id === excludeDepartId) continue
    if (dep.statut === 'ANNULE') continue

    if (dep.date_depart === dateDepart) {
      if (dep.bus_id === busId && dep.heure_depart === heureDepart) {
        return { valide: false, motif: `Conflit : Le bus ${bus.immatriculation} est déjà programmé pour un départ à ${heureDepart}.` }
      }
      if (dep.chauffeur_id === chauffeurId && dep.heure_depart === heureDepart) {
        return { valide: false, motif: `Conflit : Le chauffeur ${chauf.nom} est déjà affecté à un autre départ à ${heureDepart}.` }
      }
    }
  }

  return { valide: true }
}

export async function creerTransportDepart(
  companyId: string,
  departData: {
    ligneId: string
    dateDepart: string
    heureDepart: string
    busId: string
    chauffeurId: string
    convoyeurNom?: string
    prixBase: number
  }
): Promise<{ success: boolean; depart?: TransportDepart; error?: string }> {
  const verif = await verifierDisponibiliteRessourcesDepart(
    companyId,
    departData.busId,
    departData.chauffeurId,
    departData.dateDepart,
    departData.heureDepart
  )
  if (!verif.valide) {
    return { success: false, error: verif.motif }
  }

  const lignes = await fetchTransportLignes(companyId)
  const ligne = lignes.find(l => l.id === departData.ligneId)
  if (!ligne) return { success: false, error: 'Ligne introuvable.' }

  const allBus = await fetchTransportBus(companyId)
  const bus = allBus.find(b => b.id === departData.busId)
  if (!bus) return { success: false, error: 'Bus introuvable.' }

  const chauffeurs = await fetchTransportChauffeurs(companyId)
  const chauf = chauffeurs.find(c => c.id === departData.chauffeurId)

  // Calcul heure estimée d'arrivée
  const [h, m] = departData.heureDepart.split(':').map(Number)
  const dureeMin = ligne.duree_estimee_minutes || 120
  const totalMin = h * 60 + m + dureeMin
  const arrH = Math.floor((totalMin % 1440) / 60)
  const arrM = totalMin % 60
  const heureArriveeEstimee = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`

  const capacite = bus.places_commercialisables || bus.capacite_passagers

  const nouveauDepart: TransportDepart = {
    id: `dep-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'transport',
    ligne_id: ligne.id,
    ligne_code: ligne.code_ligne,
    ligne_nom: ligne.nom_ligne,
    date_depart: departData.dateDepart,
    heure_depart: departData.heureDepart,
    heure_arrivee_estimee: heureArriveeEstimee,
    bus_id: bus.id,
    bus_immatriculation: bus.immatriculation,
    capacite_totale: capacite,
    places_vendues: 0,
    places_reservees: 0,
    places_restantes: capacite,
    sieges_occupes: [],
    chauffeur_id: chauf ? chauf.id : departData.chauffeurId,
    chauffeur_nom: chauf ? `${chauf.nom} ${chauf.prenom}` : 'Non assigné',
    convoyeur_nom: departData.convoyeurNom,
    statut: 'PROGRAMME',
    prix_base: departData.prixBase,
    created_at: new Date().toISOString()
  }

  const departs = await fetchTransportDeparts(companyId)
  setLocalTransport(companyId, 'departs', [nouveauDepart, ...departs])

  // Mettre à jour statut du bus si départ aujourd'hui
  const todayStr = new Date().toISOString().slice(0, 10)
  if (departData.dateDepart === todayStr) {
    await updateBusStatut(companyId, bus.id, 'AFFECTE')
  }

  return { success: true, depart: nouveauDepart }
}

export async function modifierStatutDepart(
  companyId: string,
  departId: string,
  statut: TransportDepart['statut'],
  motif?: string
): Promise<{ success: boolean; error?: string }> {
  const departs = await fetchTransportDeparts(companyId)
  const target = departs.find(d => d.id === departId)
  if (!target) return { success: false, error: 'Départ introuvable.' }

  const updated = departs.map(d => {
    if (d.id === departId) {
      return {
        ...d,
        statut,
        motif_retard_annulation: motif || d.motif_retard_annulation
      }
    }
    return d
  })
  setLocalTransport(companyId, 'departs', updated)

  // Mettre à jour statut du bus selon l'état du départ
  if (statut === 'ARRIVE' || statut === 'ANNULE') {
    await updateBusStatut(companyId, target.bus_id, 'DISPONIBLE')
  } else if (statut === 'EN_ROUTE') {
    await updateBusStatut(companyId, target.bus_id, 'EN_ROUTE')
  }

  return { success: true }
}

// ─── 5. BILLETTERIE BUS & CONTRÔLE DES TICKETS ────────────────────────────────

export async function fetchTransportTickets(companyId: string): Promise<TransportTicket[]> {
  return getLocalTransport<TransportTicket[]>(companyId, 'tickets', [])
}

export async function emettreTicketBus(
  companyId: string,
  params: {
    departId: string
    arretDepart: string
    arretArrivee: string
    passagerNom: string
    passagerTelephone: string
    passagerPieceId?: string
    siegeNumero?: number
    tarif: number
    modePaiement: TransportTicket['mode_paiement']
    estReservationSeule?: boolean
  }
): Promise<{ success: boolean; ticket?: TransportTicket; error?: string }> {
  const departs = await fetchTransportDeparts(companyId)
  const depart = departs.find(d => d.id === params.departId)

  if (!depart) {
    return { success: false, error: 'Départ introuvable.' }
  }

  if (depart.statut === 'ANNULE') {
    return { success: false, error: 'Impossible de vendre un ticket sur un départ annulé.' }
  }

  if (depart.statut === 'ARRIVE') {
    return { success: false, error: 'Le départ est déjà clôturé/terminé.' }
  }

  if (depart.places_restantes <= 0) {
    return { success: false, error: 'Ce départ est complet. Aucune place restante.' }
  }

  // Vérifier disponibilité du numéro de siège si spécifié
  if (params.siegeNumero) {
    if (depart.sieges_occupes.includes(params.siegeNumero)) {
      return { success: false, error: `Le siège n°${params.siegeNumero} est déjà occupé.` }
    }
    if (params.siegeNumero > depart.capacite_totale || params.siegeNumero <= 0) {
      return { success: false, error: `Numéro de siège invalide (Capacité bus : 1 à ${depart.capacite_totale}).` }
    }
  }

  const now = new Date()
  const randomSeq = Math.floor(1000 + Math.random() * 9000)
  const numTicket = `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${randomSeq}`
  const qrToken = `G229-TRP-${numTicket}-${Date.now().toString(36).toUpperCase()}`

  const statutTicket: TransportTicket['statut'] = params.estReservationSeule ? 'RESERVE' : 'PAYE'

  const nouveauTicket: TransportTicket = {
    id: `tkt-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'transport',
    numero_ticket: numTicket,
    depart_id: depart.id,
    ligne_id: depart.ligne_id,
    ligne_nom: depart.ligne_nom,
    date_voyage: depart.date_depart,
    heure_depart: depart.heure_depart,
    bus_immatriculation: depart.bus_immatriculation,
    arret_depart: params.arretDepart,
    arret_arrivee: params.arretArrivee,
    siege_numero: params.siegeNumero,
    passager_nom: params.passagerNom,
    passager_telephone: params.passagerTelephone,
    passager_piece_id: params.passagerPieceId,
    tarif: params.tarif,
    mode_paiement: params.modePaiement,
    statut: statutTicket,
    date_emission: now.toISOString(),
    qr_token: qrToken,
  }

  // 1. Mettre à jour les compteurs du départ
  const nouveauxSiegesOccupes = params.siegeNumero
    ? [...depart.sieges_occupes, params.siegeNumero]
    : depart.sieges_occupes

  const nouvellesPlacesVendues = params.estReservationSeule ? depart.places_vendues : depart.places_vendues + 1
  const nouvellesPlacesReservees = params.estReservationSeule ? depart.places_reservees + 1 : depart.places_reservees
  const nouvellesPlacesRestantes = Math.max(0, depart.capacite_totale - (nouvellesPlacesVendues + nouvellesPlacesReservees))

  const departsMaj = departs.map(d => {
    if (d.id === depart.id) {
      return {
        ...d,
        places_vendues: nouvellesPlacesVendues,
        places_reservees: nouvellesPlacesReservees,
        places_restantes: nouvellesPlacesRestantes,
        sieges_occupes: nouveauxSiegesOccupes,
        statut: nouvellesPlacesRestantes === 0 ? ('COMPLET' as const) : d.statut
      }
    }
    return d
  })
  setLocalTransport(companyId, 'departs', departsMaj)

  // 2. Enregistrer le ticket
  const allTickets = await fetchTransportTickets(companyId)
  setLocalTransport(companyId, 'tickets', [nouveauTicket, ...allTickets])

  // 3. Liaison caisse automatique (uniquement si payé immédiatement)
  if (!params.estReservationSeule && params.tarif > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'transport',
        type: 'vente_ticket',
        sens: 'entree',
        montant_especes: params.modePaiement === 'ESPECES' ? params.tarif : 0,
        montant_momo: params.modePaiement === 'MOBILE_MONEY' ? params.tarif : 0,
        source_module: 'billetterie',
        source_id: nouveauTicket.id,
        libelle: `Vente Ticket ${numTicket} (${params.arretDepart} -> ${params.arretArrivee}) - ${params.passagerNom}`
      })
    } catch (err) {
      console.warn('[transportService] Notice enregistrement caisse ticket:', err)
    }
  }

  return { success: true, ticket: nouveauTicket }
}

export async function controlerTicket(
  companyId: string,
  ticketCodeOrQr: string,
  controleurNom = 'Agent Contrôleur'
): Promise<{ success: boolean; ticket?: TransportTicket; message: string; estValide: boolean }> {
  const tickets = await fetchTransportTickets(companyId)
  const cleanCode = ticketCodeOrQr.trim()

  const ticket = tickets.find(t => t.numero_ticket === cleanCode || t.qr_token === cleanCode)

  if (!ticket) {
    return { success: false, message: 'Ticket introuvable ou faux billet.', estValide: false }
  }

  if (ticket.statut === 'ANNULE') {
    return { success: false, ticket, message: 'Ticket ANNULÉ. Embarquement refusé.', estValide: false }
  }

  if (ticket.statut === 'REMBOURSE') {
    return { success: false, ticket, message: 'Ticket REMBOURSÉ. Embarquement refusé.', estValide: false }
  }

  if (ticket.statut === 'UTILISE') {
    return {
      success: false,
      ticket,
      message: `ALERTE : Ticket DÉJÀ UTILISÉ le ${new Date(ticket.date_controle || '').toLocaleString('fr-FR')} par ${ticket.controle_par || 'un agent'}.`,
      estValide: false
    }
  }

  if (ticket.statut === 'RESERVE') {
    return { success: false, ticket, message: 'Ticket en simple RÉSERVATION : Solde non payé au guichet.', estValide: false }
  }

  // Valider et marquer UTILISÉ (empêche toute réutilisation)
  const nowIso = new Date().toISOString()
  const ticketsMaj = tickets.map(t => {
    if (t.id === ticket.id) {
      return {
        ...t,
        statut: 'UTILISE' as const,
        date_controle: nowIso,
        controle_par: controleurNom
      }
    }
    return t
  })
  setLocalTransport(companyId, 'tickets', ticketsMaj)

  return {
    success: true,
    ticket: { ...ticket, statut: 'UTILISE', date_controle: nowIso, controle_par: controleurNom },
    message: `✅ TICKET VALIDE : Embarquement autorisé pour ${ticket.passager_nom} (Siège ${ticket.siege_numero || 'Libre'}).`,
    estValide: true
  }
}

export async function annulerRembourserTicket(
  companyId: string,
  ticketId: string,
  action: 'ANNULER' | 'REMBOURSER',
  motif?: string
): Promise<{ success: boolean; error?: string }> {
  const tickets = await fetchTransportTickets(companyId)
  const ticket = tickets.find(t => t.id === ticketId)
  if (!ticket) return { success: false, error: 'Ticket introuvable.' }

  if (ticket.statut === 'UTILISE') {
    return { success: false, error: 'Impossible d\'annuler ou rembourser un ticket déjà utilisé.' }
  }

  const nouveauStatut: TransportTicket['statut'] = action === 'REMBOURSER' ? 'REMBOURSE' : 'ANNULE'

  // 1. Libérer la place sur le départ
  const departs = await fetchTransportDeparts(companyId)
  const departsMaj = departs.map(d => {
    if (d.id === ticket.depart_id) {
      const etaitVendu = ticket.statut === 'PAYE'
      const nouveauxSieges = ticket.siege_numero ? d.sieges_occupes.filter(s => s !== ticket.siege_numero) : d.sieges_occupes
      const vendues = etaitVendu ? Math.max(0, d.places_vendues - 1) : d.places_vendues
      const reservees = !etaitVendu ? Math.max(0, d.places_reservees - 1) : d.places_reservees
      return {
        ...d,
        places_vendues: vendues,
        places_reservees: reservees,
        places_restantes: d.capacite_totale - (vendues + reservees),
        sieges_occupes: nouveauxSieges,
        statut: d.statut === 'COMPLET' ? ('PROGRAMME' as const) : d.statut
      }
    }
    return d
  })
  setLocalTransport(companyId, 'departs', departsMaj)

  // 2. Mettre à jour le ticket
  const ticketsMaj = tickets.map(t => t.id === ticketId ? { ...t, statut: nouveauStatut, notes: motif || t.notes } : t)
  setLocalTransport(companyId, 'tickets', ticketsMaj)

  // 3. Si remboursement, enregistrer sortie de caisse
  if (action === 'REMBOURSER' && ticket.statut === 'PAYE' && ticket.tarif > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'transport',
        type: 'remboursement_ticket',
        sens: 'sortie',
        montant_especes: ticket.mode_paiement === 'ESPECES' ? ticket.tarif : 0,
        montant_momo: ticket.mode_paiement === 'MOBILE_MONEY' ? ticket.tarif : 0,
        source_module: 'billetterie',
        source_id: ticket.id,
        libelle: `Remboursement ticket ${ticket.numero_ticket} - ${ticket.passager_nom}${motif ? ` (${motif})` : ''}`
      })
    } catch (e) {
      console.warn('[transportService] Notice caisse remboursement:', e)
    }
  }

  return { success: true }
}

// ─── 6. TRANSPORT DE COLIS & EXPÉDITIONS ──────────────────────────────────────

export async function fetchTransportColis(companyId: string): Promise<TransportColis[]> {
  return getLocalTransport<TransportColis[]>(companyId, 'colis', [])
}

export function calculerTarifColis(poidsKg: number, typeColis: string): number {
  const p = Number(poidsKg) || 1
  let tarifBase = 1500 // forfait de base 0-5 kg
  if (p > 5 && p <= 15) tarifBase = 2500
  else if (p > 15 && p <= 30) tarifBase = 4000
  else if (p > 30) tarifBase = 4000 + Math.ceil(p - 30) * 150

  if (typeColis === 'Fragile / Électronique') tarifBase += 1000
  if (typeColis === 'Documents Urgents') tarifBase = Math.max(tarifBase, 2000)

  return tarifBase
}

export async function enregistrerColis(
  companyId: string,
  colisData: Omit<TransportColis, 'id' | 'code_suivi' | 'statut' | 'date_depot'>
): Promise<{ success: boolean; colis?: TransportColis; error?: string }> {
  const now = new Date()
  const randomSeq = Math.floor(1000 + Math.random() * 9000)
  const codeSuivi = `TRK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${randomSeq}`

  const nouveauColis: TransportColis = {
    ...colisData,
    id: `colis-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'transport',
    code_suivi: codeSuivi,
    statut: 'ENREGISTRE',
    date_depot: now.toISOString(),
  }

  const allColis = await fetchTransportColis(companyId)
  setLocalTransport(companyId, 'colis', [nouveauColis, ...allColis])

  // Enregistrement caisse pour les frais de colis
  if (nouveauColis.frais_transport > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'transport',
        type: 'frais_colis',
        sens: 'entree',
        montant_especes: nouveauColis.frais_transport,
        montant_momo: 0,
        source_module: 'colis',
        source_id: nouveauColis.id,
        libelle: `Envoi Colis ${codeSuivi} (${colisData.nature_colis}) - De: ${colisData.expediteur_nom} Vers: ${colisData.destinataire_nom}`
      })
    } catch (e) {
      console.warn('[transportService] Notice caisse colis:', e)
    }
  }

  return { success: true, colis: nouveauColis }
}

export async function affecterColisAuDepart(
  companyId: string,
  colisId: string,
  departId: string
): Promise<{ success: boolean; error?: string }> {
  const departs = await fetchTransportDeparts(companyId)
  const depart = departs.find(d => d.id === departId)
  if (!depart) return { success: false, error: 'Départ introuvable.' }

  const allColis = await fetchTransportColis(companyId)
  const colis = allColis.find(c => c.id === colisId)
  if (!colis) return { success: false, error: 'Colis introuvable.' }

  const updated = allColis.map(c => {
    if (c.id === colisId) {
      return {
        ...c,
        depart_id: depart.id,
        bus_immatriculation: depart.bus_immatriculation,
        statut: 'CHARGE' as const,
        date_chargement: new Date().toISOString()
      }
    }
    return c
  })
  setLocalTransport(companyId, 'colis', updated)

  return { success: true }
}

export async function marquerColisArriveAgence(
  companyId: string,
  colisId: string
): Promise<{ success: boolean; error?: string }> {
  const allColis = await fetchTransportColis(companyId)
  const target = allColis.find(c => c.id === colisId)
  if (!target) return { success: false, error: 'Colis introuvable.' }

  const updated = allColis.map(c => {
    if (c.id === colisId) {
      return {
        ...c,
        statut: 'DISPONIBLE_RETRAIT' as const,
        date_arrivee: new Date().toISOString()
      }
    }
    return c
  })
  setLocalTransport(companyId, 'colis', updated)

  return { success: true }
}

export async function confirmerRemiseColisDestinataire(
  companyId: string,
  colisId: string,
  remiseData: {
    destinatairePieceId: string
    agentRemise: string
    signatureOuPreuve?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const allColis = await fetchTransportColis(companyId)
  const target = allColis.find(c => c.id === colisId)
  if (!target) return { success: false, error: 'Colis introuvable.' }

  const updated = allColis.map(c => {
    if (c.id === colisId) {
      return {
        ...c,
        statut: 'LIVRE' as const,
        destinataire_piece_id: remiseData.destinatairePieceId,
        agent_remise: remiseData.agentRemise,
        date_livraison: new Date().toISOString(),
        preuve_remise: remiseData.signatureOuPreuve || 'Pièce d\'identité vérifiée conforme'
      }
    }
    return c
  })
  setLocalTransport(companyId, 'colis', updated)

  return { success: true }
}

// ─── 7. MISSIONS DE FRET & TRANSPORT CONTRACTUEL ─────────────────────────────

export async function fetchTransportMissions(companyId: string): Promise<TransportMissionFret[]> {
  return getLocalTransport<TransportMissionFret[]>(companyId, 'missions', [])
}

export async function creerTransportMission(
  companyId: string,
  missionData: Omit<TransportMissionFret, 'id' | 'numero_ordre' | 'statut'>
): Promise<TransportMissionFret> {
  const now = new Date()
  const seq = Math.floor(100 + Math.random() * 900)
  const numOrdre = `MIS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${seq}`

  const nouvelleMission: TransportMissionFret = {
    ...missionData,
    id: `mis-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'transport',
    numero_ordre: numOrdre,
    statut: 'EN_COURS',
  }

  const all = await fetchTransportMissions(companyId)
  setLocalTransport(companyId, 'missions', [nouvelleMission, ...all])

  return nouvelleMission
}

// ─── 8. CARBURANT & MAINTENANCE ──────────────────────────────────────────────

export async function fetchCarburantLogs(companyId: string): Promise<TransportCarburantLog[]> {
  return getLocalTransport<TransportCarburantLog[]>(companyId, 'carburant', [])
}

export async function enregistrerPleinCarburant(
  companyId: string,
  logData: Omit<TransportCarburantLog, 'id' | 'company_id'>
): Promise<TransportCarburantLog> {
  const newLog: TransportCarburantLog = {
    ...logData,
    id: `carb-${Date.now()}`,
    company_id: companyId,
  }

  const all = await fetchCarburantLogs(companyId)
  setLocalTransport(companyId, 'carburant', [newLog, ...all])

  // Mettre à jour kilométrage du bus
  const allBus = await fetchTransportBus(companyId)
  const bus = allBus.find(b => b.id === logData.bus_id || b.immatriculation === logData.immatriculation)
  if (bus && logData.kilometrage > bus.kilometrage) {
    await saveTransportBus(companyId, { id: bus.id, kilometrage: logData.kilometrage })
  }

  return newLog
}

export async function fetchMaintenanceLogs(companyId: string): Promise<TransportMaintenanceLog[]> {
  return getLocalTransport<TransportMaintenanceLog[]>(companyId, 'maintenance', [])
}

export async function enregistrerInterventionMaintenance(
  companyId: string,
  maintData: Omit<TransportMaintenanceLog, 'id' | 'company_id'>
): Promise<TransportMaintenanceLog> {
  const newLog: TransportMaintenanceLog = {
    ...maintData,
    id: `maint-${Date.now()}`,
    company_id: companyId,
  }

  const all = await fetchMaintenanceLogs(companyId)
  setLocalTransport(companyId, 'maintenance', [newLog, ...all])

  // Si l'intervention immobilise le bus, passer son statut à 'MAINTENANCE'
  if (maintData.immobilise_le_bus && maintData.statut !== 'TERMINE') {
    const allBus = await fetchTransportBus(companyId)
    const bus = allBus.find(b => b.id === maintData.bus_id || b.immatriculation === maintData.immatriculation)
    if (bus) {
      await updateBusStatut(companyId, bus.id, 'MAINTENANCE')
    }
  }

  return newLog
}

export async function cloturerInterventionMaintenance(
  companyId: string,
  maintId: string
): Promise<void> {
  const all = await fetchMaintenanceLogs(companyId)
  const target = all.find(m => m.id === maintId)
  if (!target) return

  const updated = all.map(m => m.id === maintId ? { ...m, statut: 'TERMINE' as const } : m)
  setLocalTransport(companyId, 'maintenance', updated)

  // Remettre le bus en DISPONIBLE
  const allBus = await fetchTransportBus(companyId)
  const bus = allBus.find(b => b.id === target.bus_id || b.immatriculation === target.immatriculation)
  if (bus) {
    await updateBusStatut(companyId, bus.id, 'DISPONIBLE')
  }
}

// ─── 9. INDICATEURS & RAPPORTS DE RENTABILITÉ ─────────────────────────────────

export async function calculerIndicateursTransport(companyId: string): Promise<TransportKPIs> {
  const todayStr = new Date().toISOString().slice(0, 10)
  const monthStr = todayStr.slice(0, 7)

  const tickets = await fetchTransportTickets(companyId)
  const colis = await fetchTransportColis(companyId)
  const bus = await fetchTransportBus(companyId)
  const departs = await fetchTransportDeparts(companyId)

  // Recettes Billets du jour
  const ticketsJour = tickets.filter(t => (t.date_emission || '').startsWith(todayStr) && t.statut !== 'ANNULE' && t.statut !== 'REMBOURSE')
  const recettesJourBillets = ticketsJour.reduce((acc, t) => acc + (t.tarif || 0), 0)

  // Recettes Colis du jour
  const colisJour = colis.filter(c => (c.date_depot || '').startsWith(todayStr))
  const recettesJourColis = colisJour.reduce((acc, c) => acc + (c.frais_transport || 0), 0)

  const totalRecettesJour = recettesJourBillets + recettesJourColis

  // Tickets mois
  const ticketsMois = tickets.filter(t => (t.date_emission || '').startsWith(monthStr) && t.statut !== 'ANNULE')
  const ticketsVendusMois = ticketsMois.length

  // Taux de remplissage moyen
  const departsTerminesOuEnRoute = departs.filter(d => d.places_vendues > 0)
  const tauxRemplissageMoyen = departsTerminesOuEnRoute.length > 0
    ? Math.round(departsTerminesOuEnRoute.reduce((acc, d) => acc + (d.places_vendues / Math.max(1, d.capacite_totale) * 100), 0) / departsTerminesOuEnRoute.length)
    : 0

  // Colis stats
  const colisEnTransit = colis.filter(c => c.statut === 'CHARGE' || c.statut === 'EN_TRANSIT' || c.statut === 'ARRIVE_AGENCE' || c.statut === 'DISPONIBLE_RETRAIT').length
  const colisLivresMois = colis.filter(c => (c.date_livraison || '').startsWith(monthStr) && c.statut === 'LIVRE').length

  // Flotte stats
  const totalBus = bus.length
  const busDisponibles = bus.filter(b => b.statut === 'DISPONIBLE').length
  const busEnMission = bus.filter(b => b.statut === 'AFFECTE' || b.statut === 'EN_ROUTE').length
  const busMaintenance = bus.filter(b => b.statut === 'MAINTENANCE' || b.statut === 'IMMOBILISE').length

  // Départs du jour
  const departsDuJour = departs.filter(d => d.date_depart === todayStr).length

  return {
    recettesJourBillets,
    recettesJourColis,
    totalRecettesJour,
    ticketsVendusMois,
    tauxRemplissageMoyen,
    colisEnTransit,
    colisLivresMois,
    busDisponibles,
    busEnMission,
    busMaintenance,
    totalBus,
    departsDuJour,
  }
}

// ─── EXPORT DE L'OBJET GLOBAL DU SERVICE ──────────────────────────────────────

export const transportService = {
  fetchTransportLignes,
  saveTransportLigne,
  calculerTarifTrajet,
  fetchTransportBus,
  saveTransportBus,
  updateBusStatut,
  fetchTransportChauffeurs,
  saveTransportChauffeur,
  fetchTransportDeparts,
  verifierDisponibiliteRessourcesDepart,
  creerTransportDepart,
  modifierStatutDepart,
  fetchTransportTickets,
  emettreTicketBus,
  controlerTicket,
  annulerRembourserTicket,
  fetchTransportColis,
  calculerTarifColis,
  enregistrerColis,
  affecterColisAuDepart,
  marquerColisArriveAgence,
  confirmerRemiseColisDestinataire,
  fetchTransportMissions,
  creerTransportMission,
  fetchCarburantLogs,
  enregistrerPleinCarburant,
  fetchMaintenanceLogs,
  enregistrerInterventionMaintenance,
  cloturerInterventionMaintenance,
  calculerIndicateursTransport,
}
