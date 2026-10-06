// =============================================================================
// GESTIO 229 SaaS — Service Caisse Multi-Secteurs & Contrôle de Sessions
// =============================================================================
// Règle 1 : 1 Caisse par Secteur d'Activité (Quincaillerie, Hôtel, Poissonnerie...)
// Règle 2 : Détection stricte d'une session antérieure restée ouverte (blocage & alerte orange)
// Règle 3 : Sessions du jour avec compteurs temps réel et historique Z de caisse
// =============================================================================

import { supabase } from '../lib/supabase'

export interface CaisseEntity {
  id: string
  company_id: string
  sector_slug: string
  secteur_slug?: string
  code: string
  nom: string
  statut: 'actif' | 'inactif' | 'ouverte' | 'fermee'
  date_ouverture?: string
  date_fermeture?: string
  fond_ouverture_especes?: number
  fond_ouverture_momo?: number
}

export interface CaisseSessionEntity {
  id: string
  caisse_id: string
  company_id: string
  sector_slug: string
  secteur_slug?: string
  ouvert_par?: string
  ouvert_par_nom?: string
  date_ouverture: string
  date_fermeture?: string | null
  statut: 'ouverte' | 'fermee' | 'cloturee'
  fond_ouverture_especes: number
  fond_actuel_especes?: number
  fond_actuel_momo?: number
  especes_du_jour?: number
  momo_du_jour?: number
  ca_du_jour?: number
  especes_theorique?: number
  especes_comptees?: number
  ecart?: number
  cloture_par?: string
  notes_fermeture?: string
}

export type CaisseStatusType = 'FERMEE' | 'OUVERTE_AUJOURDHUI' | 'ANTERIEURE_OUVERTE'

export interface CaisseStatusResult {
  caisse: CaisseEntity | null
  session: CaisseSessionEntity | null
  statusType: CaisseStatusType
  isPreviousDay: boolean
  isTodayOpen: boolean
  caisseCode: string
  caisseNom: string
  heureOuverture: string
  dateOuvertureFormatee: string
  ouvertParNom: string
}

/**
 * Normalise un slug de secteur
 */
export function cleanSectorSlug(slug?: string | null): string {
  if (!slug) return 'boutique'
  const clean = String(slug).toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'station' || clean === 'stationservice') return 'station-service'
  if (clean === 'microfinance-tontine' || clean === 'tontine') return 'microfinance'
  if (clean === 'location' || clean === 'gestion-locative' || clean === 'gestion_locative') return 'immobilier'
  if (clean === 'agro-business' || clean === 'agro') return 'agrobusiness'
  if (clean === 'bar-restaurant-maquis' || clean === 'maquis' || clean === 'fast-food') return 'restaurant'
  return clean
}

/**
 * Récupère ou génère automatiquement la caisse dédiée du secteur pour cette entreprise
 */
export async function getOrCreateSectorCaisse(
  companyId: string,
  sectorSlug: string
): Promise<CaisseEntity | null> {
  if (!companyId) return null
  const clean = cleanSectorSlug(sectorSlug)

  try {
    // 1. Chercher la caisse existante pour ce secteur
    const { data: existing, error } = await supabase
      .from('caisses')
      .select('*')
      .eq('company_id', companyId)
      .or(`sector_slug.eq.${clean},secteur_slug.eq.${clean}`)
      .order('created_at', { ascending: true })
      .limit(1)

    if (!error && existing && existing.length > 0) {
      return existing[0] as CaisseEntity
    }

    // 2. Si aucune caisse n'existe pour ce secteur, créer la caisse attitrée
    const sectorPrefix = clean.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X')
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    const code = `CS-${sectorPrefix}-${randomSuffix}`
    const nom = `Caisse ${clean.toUpperCase()}`

    const { data: created, error: createErr } = await supabase
      .from('caisses')
      .insert({
        company_id: companyId,
        sector_slug: clean,
        secteur_slug: clean,
        code,
        nom,
        statut: 'actif',
        is_active: true,
        fond_ouverture_especes: 0,
        fond_ouverture_momo: 0,
      })
      .select()
      .maybeSingle()

    if (!createErr && created) {
      return created as CaisseEntity
    }

    // Fallback mémoire si RLS ou table non encore migrée
    return {
      id: `caisse-${clean}-${companyId.slice(0, 8)}`,
      company_id: companyId,
      sector_slug: clean,
      secteur_slug: clean,
      code,
      nom,
      statut: 'actif',
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur getOrCreateSectorCaisse:', err)
    return null
  }
}

/**
 * Analyse l'état de la caisse pour le secteur donné :
 * - Détecte si une session d'hier est restée ouverte
 * - Ou si la caisse est ouverte aujourd'hui
 * - Ou si elle est fermée
 */
export async function checkSectorCaisseStatus(
  companyId: string,
  sectorSlug: string
): Promise<CaisseStatusResult> {
  const clean = cleanSectorSlug(sectorSlug)
  const defaultRes: CaisseStatusResult = {
    caisse: null,
    session: null,
    statusType: 'FERMEE',
    isPreviousDay: false,
    isTodayOpen: false,
    caisseCode: `CS-${clean.slice(0, 4).toUpperCase()}`,
    caisseNom: `Caisse ${clean.toUpperCase()}`,
    heureOuverture: '--:--',
    dateOuvertureFormatee: '',
    ouvertParNom: 'Caissier',
  }

  if (!companyId) return defaultRes

  const caisse = await getOrCreateSectorCaisse(companyId, clean)
  if (!caisse) return defaultRes

  defaultRes.caisse = caisse
  defaultRes.caisseCode = caisse.code || defaultRes.caisseCode
  defaultRes.caisseNom = caisse.nom || defaultRes.caisseNom

  // 1. Chercher la dernière session ouverte dans caisse_sessions
  try {
    const { data: sessions, error: sessErr } = await supabase
      .from('caisse_sessions')
      .select('*')
      .eq('caisse_id', caisse.id)
      .in('statut', ['ouverte', 'open'])
      .is('date_fermeture', null)
      .order('date_ouverture', { ascending: false })
      .limit(1)

    if (!sessErr && sessions && sessions.length > 0) {
      const sess = sessions[0] as CaisseSessionEntity
      const openDate = new Date(sess.date_ouverture)
      const now = new Date()

      const isDiffDate =
        openDate.getFullYear() !== now.getFullYear() ||
        openDate.getMonth() !== now.getMonth() ||
        openDate.getDate() !== now.getDate()

      const heureStr = !isNaN(openDate.getTime())
        ? openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '--:--'

      const dateStr = !isNaN(openDate.getTime())
        ? openDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : ''

      return {
        caisse,
        session: sess,
        statusType: isDiffDate ? 'ANTERIEURE_OUVERTE' : 'OUVERTE_AUJOURDHUI',
        isPreviousDay: isDiffDate,
        isTodayOpen: !isDiffDate,
        caisseCode: caisse.code,
        caisseNom: caisse.nom,
        heureOuverture: heureStr,
        dateOuvertureFormatee: dateStr,
        ouvertParNom: sess.ouvert_par_nom || 'Caissier',
      }
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur lecture caisse_sessions:', err)
  }

  // 2. Fallback sur la table caisses elle-même si caisse_sessions n'existe pas encore
  try {
    const { data: caisseRecord } = await supabase
      .from('caisses')
      .select('*')
      .eq('id', caisse.id)
      .maybeSingle()

    if (caisseRecord && (caisseRecord.statut === 'ouverte' || caisseRecord.statut === 'open') && !caisseRecord.date_fermeture) {
      const openDate = new Date(caisseRecord.date_ouverture || caisseRecord.created_at)
      const now = new Date()
      const isDiffDate =
        openDate.getFullYear() !== now.getFullYear() ||
        openDate.getMonth() !== now.getMonth() ||
        openDate.getDate() !== now.getDate()

      const heureStr = !isNaN(openDate.getTime())
        ? openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '--:--'

      const dateStr = !isNaN(openDate.getTime())
        ? openDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : ''

      const simulatedSession: CaisseSessionEntity = {
        id: caisseRecord.id,
        caisse_id: caisseRecord.id,
        company_id: companyId,
        sector_slug: clean,
        statut: 'ouverte',
        date_ouverture: caisseRecord.date_ouverture || caisseRecord.created_at,
        fond_ouverture_especes: Number(caisseRecord.fond_ouverture_especes) || 0,
        ouvert_par_nom: caisseRecord.ouvert_par || 'Caissier',
      }

      return {
        caisse,
        session: simulatedSession,
        statusType: isDiffDate ? 'ANTERIEURE_OUVERTE' : 'OUVERTE_AUJOURDHUI',
        isPreviousDay: isDiffDate,
        isTodayOpen: !isDiffDate,
        caisseCode: caisse.code,
        caisseNom: caisse.nom,
        heureOuverture: heureStr,
        dateOuvertureFormatee: dateStr,
        ouvertParNom: caisseRecord.ouvert_par || 'Caissier',
      }
    }
  } catch (e2) {}

  return defaultRes
}

/**
 * Ouvre une nouvelle session de caisse pour le secteur
 */
export async function ouvrirSessionCaisse(
  companyId: string,
  sectorSlug: string,
  userId: string | undefined,
  userName: string,
  fondEspeces: number,
  fondMomo: number
): Promise<{ success: boolean; session?: CaisseSessionEntity; error?: string }> {
  const clean = cleanSectorSlug(sectorSlug)
  const caisse = await getOrCreateSectorCaisse(companyId, clean)
  if (!caisse) return { success: false, error: 'Impossible de localiser la caisse du secteur.' }

  const nowIso = new Date().toISOString()

  try {
    // 1. Insertion dans caisse_sessions
    const { data: newSess, error: sessErr } = await supabase
      .from('caisse_sessions')
      .insert({
        caisse_id: caisse.id,
        company_id: companyId,
        sector_slug: clean,
        secteur_slug: clean,
        ouvert_par: userId || null,
        ouvert_par_nom: userName,
        date_ouverture: nowIso,
        statut: 'ouverte',
        fond_ouverture_especes: fondEspeces,
        fond_actuel_especes: fondEspeces,
        fond_actuel_momo: fondMomo,
        especes_du_jour: 0,
        momo_du_jour: 0,
        ca_du_jour: 0,
        especes_theorique: fondEspeces,
        especes_comptees: 0,
        ecart: 0,
      })
      .select()
      .maybeSingle()

    // 2. Mettre à jour l'état de la table caisses
    await supabase
      .from('caisses')
      .update({
        statut: 'ouverte',
        date_ouverture: nowIso,
        date_fermeture: null,
        fond_ouverture_especes: fondEspeces,
        fond_ouverture_momo: fondMomo,
        ouvert_par: userName,
        updated_at: nowIso,
      })
      .eq('id', caisse.id)

    return { success: true, session: newSess || undefined }
  } catch (err: any) {
    console.error('[CAISSE-SERVICE] Erreur ouverture caisse:', err)
    return { success: false, error: err.message || 'Erreur lors de l\'ouverture de caisse.' }
  }
}

/**
 * Clôture une session de caisse (qu'elle soit de la veille ou du jour)
 */
export async function cloturerSessionCaisse(
  sessionId: string | undefined,
  caisseId: string | undefined,
  companyId: string,
  sectorSlug: string,
  userName: string,
  fondTheoriqueEsp: number,
  especesPhysiquesComptees: number,
  momoPhysiqueCompte: number,
  notes: string = ''
): Promise<{ success: boolean; ecart: number; error?: string }> {
  const clean = cleanSectorSlug(sectorSlug)
  const nowIso = new Date().toISOString()
  const ecart = especesPhysiquesComptees - fondTheoriqueEsp

  try {
    // 1. Clôturer la session dans caisse_sessions
    if (sessionId) {
      await supabase
        .from('caisse_sessions')
        .update({
          statut: 'fermee',
          date_fermeture: nowIso,
          fond_actuel_especes: especesPhysiquesComptees,
          fond_actuel_momo: momoPhysiqueCompte,
          especes_theorique: fondTheoriqueEsp,
          especes_comptees: especesPhysiquesComptees,
          ecart: ecart,
          cloture_par: userName,
          notes_fermeture: notes,
          updated_at: nowIso,
        })
        .eq('id', sessionId)
    }

    // 2. Mettre à jour la table caisses
    if (caisseId) {
      await supabase
        .from('caisses')
        .update({
          statut: 'fermee',
          date_fermeture: nowIso,
          updated_at: nowIso,
        })
        .eq('id', caisseId)
    }

    // 3. Enregistrer un enregistrement dans caisse_clotures pour l'historique
    await supabase.from('caisse_clotures').insert({
      company_id: companyId,
      sector_slug: clean,
      caisse_id: caisseId || null,
      total_especes_jour: especesPhysiquesComptees,
      total_momo_jour: momoPhysiqueCompte,
      fond_actuel_especes_apres: especesPhysiquesComptees,
      fond_actuel_momo_apres: momoPhysiqueCompte,
      cloture_par: userName,
      date_cloture: nowIso,
    })

    return { success: true, ecart }
  } catch (err: any) {
    console.error('[CAISSE-SERVICE] Erreur clôture session caisse:', err)
    return { success: false, ecart: 0, error: err.message || 'Erreur lors de la clôture.' }
  }
}
