// =============================================================================
// GESTIO 229 — SERVICE MÉTIER DÉDIÉ : HÔTEL, RÉSIDENCE & AUBERGE
// =============================================================================
// Responsabilité : Gestion du plan des chambres, réservations, séjours,
// check-in, check-out, comptes folios, housekeeping, maintenance et indicateurs.
// Isolation stricte par company_id + sector_slug ('hotel').
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'

export interface HotelChambre {
  id: string
  company_id?: string
  sector_slug?: string
  numero_chambre: string
  type_chambre: 'Standard' | 'Supérieure' | 'Suite VIP' | 'Familiale' | 'Appartement' | 'Simple' | 'Double'
  etage: number
  tarif_nuit: number
  statut: 'LIBRE' | 'OCCUPEE' | 'A_NETTOYER' | 'EN_COURS_NETTOYAGE' | 'MAINTENANCE' | 'RESERVEE'
  client_actuel?: string | null
  date_entree?: string | null
  date_sortie_prevue?: string | null
  capacite?: number
  equipements?: string[]
  notes?: string | null
}

export interface HotelReservation {
  id: string
  company_id?: string
  sector_slug?: string
  numero_reservation: string
  chambre_id: string
  chambre_numero: string
  client_nom: string
  client_telephone?: string
  client_email?: string
  client_piece_id?: string
  date_arrivee: string
  date_depart: string
  nb_nuits: number
  tarif_nuit: number
  total_estime: number
  acompte_verse: number
  mode_acompte?: string
  statut: 'CONFIRMEE' | 'CHECKED_IN' | 'CHECKED_OUT' | 'ANNULEE' | 'NO_SHOW'
  notes?: string
  created_at?: string
}

export interface PrestationConsommee {
  id: string
  date: string
  service_nom: string
  categorie: string
  quantite: number
  prix_unitaire: number
  total: number
  est_regle: boolean
  mode_reglement?: string
}

export interface HotelSejour {
  id: string
  company_id?: string
  sector_slug?: string
  reservation_id?: string | null
  chambre_id: string
  chambre_numero: string
  client_nom: string
  client_telephone?: string
  client_piece_id?: string
  nationalite?: string
  date_check_in: string
  date_check_out_prevue: string
  date_check_out_reelle?: string | null
  nb_nuits: number
  tarif_nuit: number
  montant_nuitees: number
  montant_services: number
  total_facture: number
  montant_paye: number
  solde_restant: number
  statut: 'EN_COURS' | 'CLOTURE' | 'PROLONGE' | 'CHANGE_CHAMBRE'
  prestations: PrestationConsommee[]
  paiements: Array<{
    date: string
    montant: number
    mode: string
    reference: string
    libelle: string
  }>
  notes?: string
}

export interface HotelHousekeepingTask {
  id: string
  company_id?: string
  sector_slug?: string
  chambre_numero: string
  date: string
  agent_nom: string
  statut: 'A_NETTOYER' | 'EN_COURS' | 'A_CONTROLER' | 'PROPRE_DISPONIBLE'
  priorite: 'NORMALE' | 'URGENTE'
  heure_debut?: string
  heure_fin?: string
  observations?: string
  created_at?: string
}

export interface HotelMaintenanceTicket {
  id: string
  company_id?: string
  sector_slug?: string
  chambre_numero: string
  equipement: string
  description: string
  urgence: 'FAIBLE' | 'MOYENNE' | 'URGENTE' | 'BLOQUANTE'
  statut: 'SIGNALE' | 'EN_COURS' | 'RESOLU'
  technicien?: string
  cout_estime?: number
  date_signalement: string
  date_resolution?: string
  observations?: string
}

export interface HotelServiceConfig {
  id: string
  nom: string
  categorie: 'Restauration' | 'Petit-déjeuner' | 'Blanchisserie' | 'Minibar' | 'Salle' | 'Transport' | 'Autre'
  prix: number
  unite: string
  actif: boolean
}

// ── Chambres initiales par défaut si la base de données est vierge ──
export const DEFAULT_HOTEL_CHAMBRES: HotelChambre[] = [
  { id: 'ch-101', numero_chambre: '101', type_chambre: 'Standard', etage: 1, tarif_nuit: 25000, statut: 'LIBRE', capacite: 2, equipements: ['Climatisation', 'Wifi', 'TV HD', 'Douche chaude'] },
  { id: 'ch-102', numero_chambre: '102', type_chambre: 'Standard', etage: 1, tarif_nuit: 25000, statut: 'LIBRE', capacite: 2, equipements: ['Climatisation', 'Wifi', 'TV HD', 'Douche chaude'] },
  { id: 'ch-103', numero_chambre: '103', type_chambre: 'Supérieure', etage: 1, tarif_nuit: 35000, statut: 'LIBRE', capacite: 2, equipements: ['Climatisation', 'Wifi', 'TV HD', 'Minibar', 'Baignoire'] },
  { id: 'ch-201', numero_chambre: '201', type_chambre: 'Supérieure', etage: 2, tarif_nuit: 35000, statut: 'LIBRE', capacite: 2, equipements: ['Climatisation', 'Wifi', 'TV HD', 'Minibar', 'Balcon'] },
  { id: 'ch-202', numero_chambre: '202', type_chambre: 'Suite VIP', etage: 2, tarif_nuit: 60000, statut: 'LIBRE', capacite: 3, equipements: ['Climatisation', 'Wifi Très Haut Débit', 'Salon VIP', 'TV 55"', 'Baignoire Balnéo', 'Minibar inclus'] },
  { id: 'ch-203', numero_chambre: '203', type_chambre: 'Familiale', etage: 2, tarif_nuit: 45000, statut: 'LIBRE', capacite: 4, equipements: ['Climatisation', 'Wifi', '2 Grands Lits', 'TV HD', 'Frigo'] },
  { id: 'ch-301', numero_chambre: '301', type_chambre: 'Appartement', etage: 3, tarif_nuit: 75000, statut: 'LIBRE', capacite: 4, equipements: ['Cuisine équipée', 'Salon', '2 Chambres', 'Balcon panoramique', 'Wifi Pro'] },
]

// ── Services hôteliers prédéfinis ──
export const DEFAULT_HOTEL_SERVICES: HotelServiceConfig[] = [
  { id: 'srv-01', nom: 'Petit-déjeuner Continental Complet', categorie: 'Petit-déjeuner', prix: 3500, unite: 'Pers.', actif: true },
  { id: 'srv-02', nom: 'Petit-déjeuner Buffet Américain', categorie: 'Petit-déjeuner', prix: 5000, unite: 'Pers.', actif: true },
  { id: 'srv-03', nom: 'Blanchisserie - Lavage & Repassage Chemise', categorie: 'Blanchisserie', prix: 1500, unite: 'Pièce', actif: true },
  { id: 'srv-04', nom: 'Blanchisserie - Nettoyage Costume 2 Pièces', categorie: 'Blanchisserie', prix: 4000, unite: 'Ensemble', actif: true },
  { id: 'srv-05', nom: 'Minibar - Eau Minérale 1.5L', categorie: 'Minibar', prix: 1000, unite: 'Bouteille', actif: true },
  { id: 'srv-06', nom: 'Minibar - Soda / Boisson Gazeuse', categorie: 'Minibar', prix: 1500, unite: 'Canette', actif: true },
  { id: 'srv-07', nom: 'Minibar - Bière Locale 33cl', categorie: 'Minibar', prix: 1500, unite: 'Bouteille', actif: true },
  { id: 'srv-08', nom: 'Room Service - Plat Résidence du Chef', categorie: 'Restauration', prix: 6500, unite: 'Plat', actif: true },
  { id: 'srv-09', nom: 'Navette Aéroport (Aller ou Retour)', categorie: 'Transport', prix: 15000, unite: 'Course', actif: true },
  { id: 'srv-10', nom: 'Location Salle de Réunion Demi-Journée', categorie: 'Salle', prix: 50000, unite: 'Séance', actif: true },
]

// Helpers de stockage local isolé
const getLocalKey = (companyId: string, resource: string) => `gestio_hotel_${companyId}_${resource}`

export function getLocalHotelData<T>(companyId: string, resource: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(getLocalKey(companyId, resource))
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setLocalHotelData<T>(companyId: string, resource: string, data: T): void {
  try {
    localStorage.setItem(getLocalKey(companyId, resource), JSON.stringify(data))
  } catch (e) {
    console.warn('[hotelService] Erreur sauvegarde localStorage:', e)
  }
}

// =============================================================================
// GESTION DES CHAMBRES
// =============================================================================

export async function fetchHotelChambres(companyId: string): Promise<HotelChambre[]> {
  try {
    const { data, error } = await supabase
      .from('hotel_chambres')
      .select('*')
      .eq('company_id', companyId)
      .order('numero_chambre')

    if (!error && data && data.length > 0) {
      setLocalHotelData(companyId, 'chambres', data)
      return data as HotelChambre[]
    }
  } catch (err) {
    console.warn('[hotelService] Table hotel_chambres inaccessible en direct, bascule sur cache/défauts:', err)
  }

  // Fallback persistant local
  const local = getLocalHotelData<HotelChambre[]>(companyId, 'chambres', [])
  if (local.length > 0) return local

  // Initialisation par défaut
  const initialized = DEFAULT_HOTEL_CHAMBRES.map(c => ({ ...c, company_id: companyId, sector_slug: 'hotel' }))
  setLocalHotelData(companyId, 'chambres', initialized)
  return initialized
}

export async function saveHotelChambre(companyId: string, chambre: Partial<HotelChambre>): Promise<HotelChambre> {
  const current = await fetchHotelChambres(companyId)
  let updatedList: HotelChambre[] = []
  let savedChambre: HotelChambre

  if (chambre.id && current.some(c => c.id === chambre.id)) {
    updatedList = current.map(c => c.id === chambre.id ? { ...c, ...chambre } as HotelChambre : c)
    savedChambre = updatedList.find(c => c.id === chambre.id)!
  } else {
    savedChambre = {
      id: chambre.id || `ch-${Date.now()}`,
      company_id: companyId,
      sector_slug: 'hotel',
      numero_chambre: chambre.numero_chambre || '100',
      type_chambre: chambre.type_chambre || 'Standard',
      etage: Number(chambre.etage) || 1,
      tarif_nuit: Number(chambre.tarif_nuit) || 25000,
      statut: chambre.statut || 'LIBRE',
      capacite: Number(chambre.capacite) || 2,
      equipements: chambre.equipements || ['Climatisation', 'Wifi'],
      notes: chambre.notes || null,
    }
    updatedList = [...current, savedChambre]
  }

  setLocalHotelData(companyId, 'chambres', updatedList)

  // Tentative de synchronisation Supabase
  try {
    await supabase.from('hotel_chambres').upsert(savedChambre)
  } catch (e) {
    console.warn('[hotelService] Sync Supabase hotel_chambres ignorée:', e)
  }

  return savedChambre
}

export async function updateChambreStatut(
  companyId: string,
  chambreNumero: string,
  statut: HotelChambre['statut'],
  meta?: { client_actuel?: string | null; date_entree?: string | null; date_sortie_prevue?: string | null }
): Promise<void> {
  const chambres = await fetchHotelChambres(companyId)
  const updated = chambres.map(c => {
    if (c.numero_chambre === chambreNumero) {
      return {
        ...c,
        statut,
        client_actuel: meta?.client_actuel !== undefined ? meta.client_actuel : c.client_actuel,
        date_entree: meta?.date_entree !== undefined ? meta.date_entree : c.date_entree,
        date_sortie_prevue: meta?.date_sortie_prevue !== undefined ? meta.date_sortie_prevue : c.date_sortie_prevue,
      }
    }
    return c
  })

  setLocalHotelData(companyId, 'chambres', updated)

  try {
    await supabase
      .from('hotel_chambres')
      .update({ statut, ...meta })
      .eq('company_id', companyId)
      .eq('numero_chambre', chambreNumero)
  } catch (e) {
    console.warn('[hotelService] Notice updateChambreStatut:', e)
  }
}

// =============================================================================
// GESTION DES RÉSERVATIONS ET SÉJOURS
// =============================================================================

export async function fetchHotelReservations(companyId: string): Promise<HotelReservation[]> {
  try {
    const { data, error } = await supabase
      .from('hotel_reservations')
      .select('*')
      .eq('company_id', companyId)
      .order('date_arrivee', { ascending: true })

    if (!error && data && data.length > 0) {
      setLocalHotelData(companyId, 'reservations', data)
      return data as HotelReservation[]
    }
  } catch (err) {
    console.warn('[hotelService] Table hotel_reservations inaccessible, fallback cache:', err)
  }

  return getLocalHotelData<HotelReservation[]>(companyId, 'reservations', [])
}

export async function fetchHotelSejours(companyId: string): Promise<HotelSejour[]> {
  return getLocalHotelData<HotelSejour[]>(companyId, 'sejours', [])
}

/**
 * Vérifie si une chambre est disponible entre deux dates
 * (Empêche qu'une même chambre soit attribuée à 2 clients sur des périodes incompatibles)
 */
export async function verifierDisponibiliteChambre(
  companyId: string,
  chambreNumero: string,
  dateArrivee: string,
  dateDepart: string,
  excludeReservationId?: string
): Promise<{ disponible: boolean; motif?: string }> {
  const chambres = await fetchHotelChambres(companyId)
  const chambre = chambres.find(c => c.numero_chambre === chambreNumero)

  if (!chambre) {
    return { disponible: false, motif: 'Chambre introuvable.' }
  }

  if (chambre.statut === 'MAINTENANCE') {
    return { disponible: false, motif: 'Chambre actuellement bloquée pour maintenance technique.' }
  }

  const arrTime = new Date(dateArrivee).getTime()
  const depTime = new Date(dateDepart).getTime()

  if (depTime <= arrTime) {
    return { disponible: false, motif: 'La date de départ doit être postérieure à la date d\'arrivée.' }
  }

  // 1. Vérification contre les séjours actifs en cours
  const sejours = await fetchHotelSejours(companyId)
  const sejourActif = sejours.find(
    s => s.chambre_numero === chambreNumero && s.statut === 'EN_COURS'
  )

  if (sejourActif) {
    const activeDep = new Date(sejourActif.date_check_out_prevue).getTime()
    // Si la nouvelle arrivée commence avant le départ du séjour actif
    if (arrTime < activeDep) {
      return {
        disponible: false,
        motif: `Chambre actuellement occupée par ${sejourActif.client_nom} jusqu'au ${new Date(sejourActif.date_check_out_prevue).toLocaleDateString('fr-FR')}.`
      }
    }
  }

  // 2. Vérification contre les réservations confirmées futures
  const reservations = await fetchHotelReservations(companyId)
  const chevauchement = reservations.find(r => {
    if (r.chambre_numero !== chambreNumero) return false
    if (r.statut === 'ANNULEE' || r.statut === 'CHECKED_OUT') return false
    if (excludeReservationId && r.id === excludeReservationId) return false

    const rArr = new Date(r.date_arrivee).getTime()
    const rDep = new Date(r.date_depart).getTime()

    // Conflit d'intervalles : (StartA < EndB) et (EndA > StartB)
    return arrTime < rDep && depTime > rArr
  })

  if (chevauchement) {
    return {
      disponible: false,
      motif: `Chambre déjà réservée par ${chevauchement.client_nom} du ${new Date(chevauchement.date_arrivee).toLocaleDateString('fr-FR')} au ${new Date(chevauchement.date_depart).toLocaleDateString('fr-FR')}.`
    }
  }

  return { disponible: true }
}

/**
 * Enregistrement d'une nouvelle réservation avec prévention stricte des conflits
 */
export async function creerReservation(
  companyId: string,
  resData: Omit<HotelReservation, 'id' | 'numero_reservation' | 'statut' | 'created_at'>
): Promise<{ success: boolean; reservation?: HotelReservation; error?: string }> {
  const dispo = await verifierDisponibiliteChambre(
    companyId,
    resData.chambre_numero,
    resData.date_arrivee,
    resData.date_depart
  )

  if (!dispo.disponible) {
    return { success: false, error: dispo.motif }
  }

  const now = new Date()
  const seq = Math.floor(1000 + Math.random() * 9000)
  const num = `RES-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${seq}`

  const newRes: HotelReservation = {
    ...resData,
    id: `res-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'hotel',
    numero_reservation: num,
    statut: 'CONFIRMEE',
    created_at: now.toISOString(),
  }

  const allRes = await fetchHotelReservations(companyId)
  const updated = [...allRes, newRes]
  setLocalHotelData(companyId, 'reservations', updated)

  // Enregistrement acompte en caisse si renseigné
  if (newRes.acompte_verse > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'hotel',
        type: 'acompte_reservation',
        sens: 'entree',
        montant_especes: newRes.mode_acompte === 'CASH' ? newRes.acompte_verse : 0,
        montant_momo: newRes.mode_acompte === 'MOMO' ? newRes.acompte_verse : 0,
        source_module: 'reception',
        source_id: newRes.id,
        libelle: `Acompte Réservation ${num} - Ch. ${newRes.chambre_numero} (${newRes.client_nom})`
      })
    } catch (e) {
      console.warn('[hotelService] Notice caisse acompte réservation:', e)
    }
  }

  try {
    await supabase.from('hotel_reservations').insert(newRes)
  } catch (e) {
    console.warn('[hotelService] Sync Supabase reservation ignorée:', e)
  }

  return { success: true, reservation: newRes }
}

/**
 * Check-in direct ou depuis une réservation
 */
export async function executerCheckIn(
  companyId: string,
  params: {
    chambreNumero: string
    clientNom: string
    clientTelephone?: string
    clientPieceId?: string
    nationalite?: string
    dateCheckIn: string
    dateCheckOutPrevue: string
    nbNuits: number
    tarifNuit: number
    acompteVerse: number
    modePaiementAcompte?: string
    reservationId?: string
    notes?: string
  }
): Promise<{ success: boolean; sejour?: HotelSejour; error?: string }> {
  // Vérifier la disponibilité de la chambre
  const dispo = await verifierDisponibiliteChambre(
    companyId,
    params.chambreNumero,
    params.dateCheckIn,
    params.dateCheckOutPrevue,
    params.reservationId
  )

  if (!dispo.disponible) {
    return { success: false, error: dispo.motif }
  }

  const montantNuitees = params.nbNuits * params.tarifNuit
  const montantPaye = params.acompteVerse || 0
  const soldeRestant = Math.max(0, montantNuitees - montantPaye)

  const sejourId = `sej-${Date.now()}`
  const nowIso = new Date().toISOString()

  const nouveauSejour: HotelSejour = {
    id: sejourId,
    company_id: companyId,
    sector_slug: 'hotel',
    reservation_id: params.reservationId || null,
    chambre_id: `ch-${params.chambreNumero}`,
    chambre_numero: params.chambreNumero,
    client_nom: params.clientNom,
    client_telephone: params.clientTelephone,
    client_piece_id: params.clientPieceId,
    nationalite: params.nationalite,
    date_check_in: params.dateCheckIn,
    date_check_out_prevue: params.dateCheckOutPrevue,
    nb_nuits: params.nbNuits,
    tarifNuit: params.tarifNuit,
    montant_nuitees: montantNuitees,
    montant_services: 0,
    total_facture: montantNuitees,
    montant_paye: montantPaye,
    solde_restant: soldeRestant,
    statut: 'EN_COURS',
    prestations: [],
    paiements: montantPaye > 0 ? [{
      date: nowIso,
      montant: montantPaye,
      mode: params.modePaiementAcompte || 'CASH',
      reference: `AC-${Date.now().toString().slice(-6)}`,
      libelle: `Acompte Check-in (${params.nbNuits} nuits)`
    }] : [],
    notes: params.notes,
  }

  // 1. Sauvegarder le séjour
  const sejours = await fetchHotelSejours(companyId)
  setLocalHotelData(companyId, 'sejours', [...sejours, nouveauSejour])

  // 2. Mettre à jour le statut de la chambre à OCCUPÉE
  await updateChambreStatut(companyId, params.chambreNumero, 'OCCUPEE', {
    client_actuel: params.clientNom,
    date_entree: params.dateCheckIn,
    date_sortie_prevue: params.dateCheckOutPrevue,
  })

  // 3. Mettre à jour la réservation liée le cas échéant
  if (params.reservationId) {
    const reservations = await fetchHotelReservations(companyId)
    const updatedRes = reservations.map(r => r.id === params.reservationId ? { ...r, statut: 'CHECKED_IN' as const } : r)
    setLocalHotelData(companyId, 'reservations', updatedRes)
  }

  // 4. Mouvement de caisse pour l'acompte
  if (montantPaye > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'hotel',
        type: 'encaissement_sejour',
        sens: 'entree',
        montant_especes: params.modePaiementAcompte === 'CASH' ? montantPaye : 0,
        montant_momo: params.modePaiementAcompte === 'MOMO' ? montantPaye : 0,
        source_module: 'reception',
        source_id: sejourId,
        libelle: `Acompte Check-in Ch. ${params.chambreNumero} - ${params.clientNom}`
      })
    } catch (e) {
      console.warn('[hotelService] Notice enregistrement caisse check-in:', e)
    }
  }

  return { success: true, sejour: nouveauSejour }
}

/**
 * Check-out complet avec calcul du solde, encaissement final,
 * et passage OBLIGATOIRE de la chambre à 'A_NETTOYER' (Règle hôtelière stricte)
 */
export async function executerCheckOut(
  companyId: string,
  sejourId: string,
  reglementFinal: {
    montantRegle: number
    modeReglement: string
    creanceAccorde?: boolean
  }
): Promise<{ success: boolean; facture?: any; error?: string }> {
  const sejours = await fetchHotelSejours(companyId)
  const sejour = sejours.find(s => s.id === sejourId)

  if (!sejour) {
    return { success: false, error: 'Séjour introuvable.' }
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const montantRegle = Number(reglementFinal.montantRegle) || 0

  const nouveauTotalPaye = sejour.montant_paye + montantRegle
  const nouveauSolde = Math.max(0, sejour.total_facture - nouveauTotalPaye)

  const paiementRecord = montantRegle > 0 ? {
    date: nowIso,
    montant: montantRegle,
    mode: reglementFinal.modeReglement,
    reference: `CO-${Date.now().toString().slice(-6)}`,
    libelle: 'Règlement solde final Check-out'
  } : null

  const sejourCloture: HotelSejour = {
    ...sejour,
    statut: 'CLOTURE',
    date_check_out_reelle: nowIso,
    montant_paye: nouveauTotalPaye,
    solde_restant: nouveauSolde,
    paiements: paiementRecord ? [...sejour.paiements, paiementRecord] : sejour.paiements,
  }

  // 1. Sauvegarder la clôture du séjour
  const updatedSejours = sejours.map(s => s.id === sejourId ? sejourCloture : s)
  setLocalHotelData(companyId, 'sejours', updatedSejours)

  // 2. RÈGLE D'OR HÔTELIÈRE : La chambre libérée passe à 'A_NETTOYER' (JAMAIS directement libre !)
  await updateChambreStatut(companyId, sejour.chambre_numero, 'A_NETTOYER', {
    client_actuel: null,
    date_entree: null,
    date_sortie_prevue: null,
  })

  // 3. Création automatique de la tâche de nettoyage dans le Housekeeping
  await creerTacheHousekeeping(companyId, {
    chambre_numero: sejour.chambre_numero,
    date: now.toISOString().slice(0, 10),
    agent_nom: 'Agent d\'étage de service',
    statut: 'A_NETTOYER',
    priorite: 'URGENTE',
    observations: `Nettoyage complet et changement de draps suite au départ du client ${sejour.client_nom}.`
  })

  // 4. Mouvement de caisse pour le règlement final
  if (montantRegle > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'hotel',
        type: 'encaissement_checkout',
        sens: 'entree',
        montant_especes: reglementFinal.modeReglement === 'CASH' ? montantRegle : 0,
        montant_momo: reglementFinal.modeReglement === 'MOMO' ? montantRegle : 0,
        source_module: 'reception',
        source_id: sejourId,
        libelle: `Règlement final Check-out Ch. ${sejour.chambre_numero} - ${sejour.client_nom}`
      })
    } catch (e) {
      console.warn('[hotelService] Notice caisse checkout:', e)
    }
  }

  // Facture détaillée du séjour
  const facture = {
    numero: `FAC-HOTEL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`,
    date: now.toLocaleDateString('fr-FR'),
    heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    clientNom: sejour.client_nom,
    clientTelephone: sejour.client_telephone,
    chambreNumero: sejour.chambre_numero,
    dateArrivee: sejour.date_check_in,
    dateDepart: now.toISOString().slice(0, 10),
    nbNuits: sejour.nb_nuits,
    tarifNuit: sejour.tarifNuit,
    montantNuitees: sejour.montant_nuitees,
    prestations: sejour.prestations,
    montantServices: sejour.montant_services,
    totalTTC: sejour.total_facture,
    totalPaye: nouveauTotalPaye,
    soldeRestant: nouveauSolde,
    modeReglement: reglementFinal.modeReglement,
  }

  return { success: true, facture }
}

/**
 * Changement de chambre d'un client hébergé avec transfert de compte
 */
export async function changerChambreClient(
  companyId: string,
  sejourId: string,
  nouvelleChambreNumero: string,
  motif?: string
): Promise<{ success: boolean; error?: string }> {
  const sejours = await fetchHotelSejours(companyId)
  const sejour = sejours.find(s => s.id === sejourId)

  if (!sejour || sejour.statut !== 'EN_COURS') {
    return { success: false, error: 'Séjour actif introuvable.' }
  }

  // Vérifier disponibilité de la nouvelle chambre
  const dispo = await verifierDisponibiliteChambre(
    companyId,
    nouvelleChambreNumero,
    new Date().toISOString().slice(0, 10),
    sejour.date_check_out_prevue
  )

  if (!dispo.disponible) {
    return { success: false, error: dispo.motif }
  }

  const ancienneChambre = sejour.chambre_numero

  // 1. Mettre l'ancienne chambre à 'A_NETTOYER'
  await updateChambreStatut(companyId, ancienneChambre, 'A_NETTOYER', {
    client_actuel: null,
    date_entree: null,
    date_sortie_prevue: null,
  })

  // Créer tâche housekeeping pour l'ancienne chambre
  await creerTacheHousekeeping(companyId, {
    chambre_numero: ancienneChambre,
    date: new Date().toISOString().slice(0, 10),
    agent_nom: 'Agent d\'étage',
    statut: 'A_NETTOYER',
    priorite: 'NORMALE',
    observations: `Nettoyage suite à changement de chambre vers Ch. ${nouvelleChambreNumero}.`
  })

  // 2. Mettre la nouvelle chambre à 'OCCUPÉE'
  await updateChambreStatut(companyId, nouvelleChambreNumero, 'OCCUPEE', {
    client_actuel: sejour.client_nom,
    date_entree: sejour.date_check_in,
    date_sortie_prevue: sejour.date_check_out_prevue,
  })

  // 3. Mettre à jour le séjour
  const updatedSejours = sejours.map(s => {
    if (s.id === sejourId) {
      return {
        ...s,
        chambre_numero: nouvelleChambreNumero,
        notes: `${s.notes ? s.notes + ' | ' : ''}Transféré de la Ch. ${ancienneChambre} vers la Ch. ${nouvelleChambreNumero}${motif ? ` (${motif})` : ''}`,
      }
    }
    return s
  })
  setLocalHotelData(companyId, 'sejours', updatedSejours)

  return { success: true }
}

/**
 * Prolongation ou réduction de séjour
 */
export async function ajusterDureeSejour(
  companyId: string,
  sejourId: string,
  nouvelleDateDepart: string,
  nouveauNbNuits: number
): Promise<{ success: boolean; error?: string }> {
  const sejours = await fetchHotelSejours(companyId)
  const sejour = sejours.find(s => s.id === sejourId)

  if (!sejour || sejour.statut !== 'EN_COURS') {
    return { success: false, error: 'Séjour actif introuvable.' }
  }

  // Si prolongation, vérifier qu'il n'y a pas de réservation future bloquante
  if (nouveauNbNuits > sejour.nb_nuits) {
    const dispo = await verifierDisponibiliteChambre(
      companyId,
      sejour.chambre_numero,
      sejour.date_check_out_prevue,
      nouvelleDateDepart
    )
    if (!dispo.disponible) {
      return { success: false, error: `Prolongation impossible : ${dispo.motif}` }
    }
  }

  const nouveauMontantNuitees = nouveauNbNuits * sejour.tarifNuit
  const nouveauTotal = nouveauMontantNuitees + sejour.montant_services
  const nouveauSolde = Math.max(0, nouveauTotal - sejour.montant_paye)

  const updatedSejours = sejours.map(s => {
    if (s.id === sejourId) {
      return {
        ...s,
        nb_nuits: nouveauNbNuits,
        date_check_out_prevue: nouvelleDateDepart,
        montant_nuitees: nouveauMontantNuitees,
        total_facture: nouveauTotal,
        solde_restant: nouveauSolde,
        statut: 'PROLONGE' as const,
      }
    }
    return s
  })

  setLocalHotelData(companyId, 'sejours', updatedSejours)

  // Mettre à jour la date de sortie dans la chambre
  await updateChambreStatut(companyId, sejour.chambre_numero, 'OCCUPEE', {
    date_sortie_prevue: nouvelleDateDepart,
  })

  return { success: true }
}

/**
 * Ajoute une prestation consommée au compte de séjour (folio) du client
 */
export async function ajouterPrestationSejour(
  companyId: string,
  sejourId: string,
  prestationData: {
    serviceNom: string
    categorie: string
    quantite: number
    prixUnitaire: number
    regleImmediatement: boolean
    modeReglement?: string
  }
): Promise<{ success: boolean; sejour?: HotelSejour; error?: string }> {
  const sejours = await fetchHotelSejours(companyId)
  const sejour = sejours.find(s => s.id === sejourId)

  if (!sejour || sejour.statut !== 'EN_COURS') {
    return { success: false, error: 'Séjour actif introuvable.' }
  }

  const qte = Number(prestationData.quantite) || 1
  const pu = Number(prestationData.prixUnitaire) || 0
  const total = qte * pu

  const nouvellePrestation: PrestationConsommee = {
    id: `prest-${Date.now()}`,
    date: new Date().toISOString(),
    service_nom: prestationData.serviceNom,
    categorie: prestationData.categorie,
    quantite: qte,
    prix_unitaire: pu,
    total,
    est_regle: prestationData.regleImmediatement,
    mode_reglement: prestationData.modeReglement,
  }

  const nouveauMontantServices = sejour.montant_services + total
  const nouveauTotalFacture = sejour.montant_nuitees + nouveauMontantServices
  const ajoutPaye = prestationData.regleImmediatement ? total : 0
  const nouveauMontantPaye = sejour.montant_paye + ajoutPaye
  const nouveauSoldeRestant = Math.max(0, nouveauTotalFacture - nouveauMontantPaye)

  const nouveauxPaiements = prestationData.regleImmediatement ? [
    ...sejour.paiements,
    {
      date: new Date().toISOString(),
      montant: total,
      mode: prestationData.modeReglement || 'CASH',
      reference: `PREST-${Date.now().toString().slice(-6)}`,
      libelle: `Règlement comptoir : ${prestationData.serviceNom}`
    }
  ] : sejour.paiements

  const sejourMaj: HotelSejour = {
    ...sejour,
    montant_services: nouveauMontantServices,
    total_facture: nouveauTotalFacture,
    montant_paye: nouveauMontantPaye,
    solde_restant: nouveauSoldeRestant,
    prestations: [...sejour.prestations, nouvellePrestation],
    paiements: nouveauxPaiements,
  }

  const updatedSejours = sejours.map(s => s.id === sejourId ? sejourMaj : s)
  setLocalHotelData(companyId, 'sejours', updatedSejours)

  // Si réglé immédiatement au comptoir, alimenter la caisse
  if (prestationData.regleImmediatement && total > 0) {
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'hotel',
        type: 'encaissement_service',
        sens: 'entree',
        montant_especes: prestationData.modeReglement === 'CASH' ? total : 0,
        montant_momo: prestationData.modeReglement === 'MOMO' ? total : 0,
        source_module: 'services_hotel',
        source_id: sejourId,
        libelle: `Prestation ${prestationData.serviceNom} Ch. ${sejour.chambre_numero} (${sejour.client_nom})`
      })
    } catch (e) {
      console.warn('[hotelService] Notice caisse prestation:', e)
    }
  }

  return { success: true, sejour: sejourMaj }
}

// =============================================================================
// GESTION DU HOUSEKEEPING (NETTOYAGE & ÉTAGES)
// =============================================================================

export async function fetchHousekeepingTasks(companyId: string): Promise<HotelHousekeepingTask[]> {
  try {
    const { data, error } = await supabase
      .from('hotel_housekeeping')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false })

    if (!error && data && data.length > 0) {
      setLocalHotelData(companyId, 'housekeeping', data)
      return data as HotelHousekeepingTask[]
    }
  } catch (err) {
    console.warn('[hotelService] Table hotel_housekeeping fallback local:', err)
  }

  return getLocalHotelData<HotelHousekeepingTask[]>(companyId, 'housekeeping', [])
}

export async function creerTacheHousekeeping(
  companyId: string,
  task: Omit<HotelHousekeepingTask, 'id' | 'created_at'>
): Promise<HotelHousekeepingTask> {
  const newTask: HotelHousekeepingTask = {
    ...task,
    id: `hk-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'hotel',
    created_at: new Date().toISOString(),
  }

  const tasks = await fetchHousekeepingTasks(companyId)
  const updated = [newTask, ...tasks]
  setLocalHotelData(companyId, 'housekeeping', updated)

  try {
    await supabase.from('hotel_housekeeping').insert(newTask)
  } catch (e) {
    console.warn('[hotelService] Sync Supabase housekeeping ignorée:', e)
  }

  return newTask
}

export async function changerStatutHousekeeping(
  companyId: string,
  taskId: string,
  statut: HotelHousekeepingTask['statut']
): Promise<void> {
  const tasks = await fetchHousekeepingTasks(companyId)
  const target = tasks.find(t => t.id === taskId)
  if (!target) return

  const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, statut } : t)
  setLocalHotelData(companyId, 'housekeeping', updatedTasks)

  // Si le statut passe à 'PROPRE_DISPONIBLE', la chambre est officiellement remise à 'LIBRE' !
  if (statut === 'PROPRE_DISPONIBLE') {
    await updateChambreStatut(companyId, target.chambre_numero, 'LIBRE')
  } else if (statut === 'EN_COURS') {
    await updateChambreStatut(companyId, target.chambre_numero, 'EN_COURS_NETTOYAGE')
  }

  try {
    await supabase
      .from('hotel_housekeeping')
      .update({ statut })
      .eq('id', taskId)
  } catch (e) {
    console.warn('[hotelService] Notice update housekeeping:', e)
  }
}

// =============================================================================
// GESTION DE LA MAINTENANCE & ÉQUIPEMENTS
// =============================================================================

export async function fetchMaintenanceTickets(companyId: string): Promise<HotelMaintenanceTicket[]> {
  return getLocalHotelData<HotelMaintenanceTicket[]>(companyId, 'maintenance', [])
}

export async function declarerPanneMaintenance(
  companyId: string,
  ticket: Omit<HotelMaintenanceTicket, 'id' | 'statut' | 'date_signalement'>
): Promise<HotelMaintenanceTicket> {
  const newTicket: HotelMaintenanceTicket = {
    ...ticket,
    id: `maint-${Date.now()}`,
    company_id: companyId,
    sector_slug: 'hotel',
    statut: 'SIGNALE',
    date_signalement: new Date().toISOString(),
  }

  const tickets = await fetchMaintenanceTickets(companyId)
  setLocalHotelData(companyId, 'maintenance', [newTicket, ...tickets])

  // RÈGLE : La chambre passe immédiatement au statut 'MAINTENANCE' (bloque toute réservation)
  await updateChambreStatut(companyId, ticket.chambre_numero, 'MAINTENANCE', {
    notes: `Incident technique : ${ticket.description}`
  })

  return newTicket
}

export async function resoudrePanneMaintenance(
  companyId: string,
  ticketId: string,
  observations?: string
): Promise<void> {
  const tickets = await fetchMaintenanceTickets(companyId)
  const target = tickets.find(t => t.id === ticketId)
  if (!target) return

  const now = new Date()
  const updatedTickets = tickets.map(t => {
    if (t.id === ticketId) {
      return {
        ...t,
        statut: 'RESOLU' as const,
        date_resolution: now.toISOString(),
        observations: observations || t.observations,
      }
    }
    return t
  })
  setLocalHotelData(companyId, 'maintenance', updatedTickets)

  // Une fois réparée, la chambre passe à 'A_NETTOYER' pour que l'équipe d'étage vérifie et nettoie avant remise en location
  await updateChambreStatut(companyId, target.chambre_numero, 'A_NETTOYER')
  await creerTacheHousekeeping(companyId, {
    chambre_numero: target.chambre_numero,
    date: now.toISOString().slice(0, 10),
    agent_nom: 'Agent d\'étage',
    statut: 'A_NETTOYER',
    priorite: 'NORMALE',
    observations: `Nettoyage et contrôle post-intervention technique (${target.equipement}).`
  })
}

// =============================================================================
// CALCUL DES INDICATEURS ET RAPPORTS HÔTELIERS
// =============================================================================

export interface HotelKPIs {
  totalChambres: number
  chambresLibres: number
  chambresOccupees: number
  chambresNettoyage: number
  chambresMaintenance: number
  tauxOccupation: number // %
  caNuiteesMois: number
  caServicesMois: number
  caTotalMois: number
  adr: number // Average Daily Rate (Prix moyen chambre louée)
  revPar: number // Revenue per Available Room
  arriveesAujourdhui: number
  departsAujourdhui: number
  sejoursEnCours: number
}

export async function calculerIndicateursHotel(companyId: string): Promise<HotelKPIs> {
  const chambres = await fetchHotelChambres(companyId)
  const sejours = await fetchHotelSejours(companyId)
  const reservations = await fetchHotelReservations(companyId)

  const total = chambres.length || 1
  const occupees = chambres.filter(c => c.statut === 'OCCUPEE').length
  const libres = chambres.filter(c => c.statut === 'LIBRE').length
  const nettoyage = chambres.filter(c => c.statut === 'A_NETTOYER' || c.statut === 'EN_COURS_NETTOYAGE').length
  const maintenance = chambres.filter(c => c.statut === 'MAINTENANCE').length

  const tauxOccupation = Math.round((occupees / total) * 100)

  // Calcul CA
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentMonthStr = todayStr.slice(0, 7) // YYYY-MM

  const sejoursDuMois = sejours.filter(s => (s.date_check_in || '').startsWith(currentMonthStr))
  const caNuiteesMois = sejoursDuMois.reduce((acc, s) => acc + (s.montant_nuitees || 0), 0)
  const caServicesMois = sejoursDuMois.reduce((acc, s) => acc + (s.montant_services || 0), 0)
  const caTotalMois = caNuiteesMois + caServicesMois

  const adr = occupees > 0 ? Math.round(caNuiteesMois / Math.max(1, sejoursDuMois.reduce((acc, s) => acc + (s.nb_nuits || 1), 0))) : 0
  const revPar = Math.round(caNuiteesMois / (total * 30))

  const arriveesAujourdhui = reservations.filter(r => r.date_arrivee === todayStr && r.statut === 'CONFIRMEE').length
  const departsAujourdhui = sejours.filter(s => s.statut === 'EN_COURS' && s.date_check_out_prevue === todayStr).length
  const sejoursEnCours = sejours.filter(s => s.statut === 'EN_COURS').length

  return {
    totalChambres: total,
    chambresLibres: libres,
    chambresOccupees: occupees,
    chambresNettoyage: nettoyage,
    chambresMaintenance: maintenance,
    tauxOccupation,
    caNuiteesMois,
    caServicesMois,
    caTotalMois,
    adr,
    revPar,
    arriveesAujourdhui,
    departsAujourdhui,
    sejoursEnCours,
  }
}


export const hotelService = {
  fetchHotelChambres,
  saveHotelChambre,
  updateChambreStatut,
  fetchHotelReservations,
  fetchHotelSejours,
  verifierDisponibiliteChambre,
  creerReservation,
  executerCheckIn,
  executerCheckOut,
  changerChambreClient,
  ajusterDureeSejour,
  ajouterPrestationSejour,
  fetchHousekeepingTasks,
  creerTacheHousekeeping,
  changerStatutHousekeeping,
  fetchMaintenanceTickets,
  declarerPanneMaintenance,
  resoudrePanneMaintenance,
  calculerIndicateursHotel,
}
