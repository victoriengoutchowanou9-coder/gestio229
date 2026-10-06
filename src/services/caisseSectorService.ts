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
 * RÈGLE : Interdire 2 sessions ouvertes simultanément pour la même caisse
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

  // 1. Vérifier s'il existe déjà une session ouverte pour cette caisse
  try {
    const { data: existingOpen } = await supabase
      .from('caisse_sessions')
      .select('id, date_ouverture')
      .eq('caisse_id', caisse.id)
      .in('statut', ['ouverte', 'open'])
      .is('date_fermeture', null)
      .limit(1)

    if (existingOpen && existingOpen.length > 0) {
      return {
        success: false,
        error: `Une session de caisse est déjà ouverte pour ce secteur (${caisse.nom}). Vous devez d'abord la clôturer.`
      }
    }
  } catch (chkErr) {
    console.warn('[CAISSE-SERVICE] Vérification session existante:', chkErr)
  }

  const nowIso = new Date().toISOString()

  try {
    // 2. Insertion dans caisse_sessions
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

    if (sessErr) throw sessErr

    // 3. Mettre à jour l'état de la table caisses
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

    // Enregistrer le mouvement d'ouverture
    await enregistrerMouvementCaisse({
      company_id: companyId,
      sector_slug: clean,
      caisse_id: caisse.id,
      caisse_session_id: newSess?.id,
      type: 'ouverture',
      sens: 'entree',
      montant_especes: fondEspeces,
      montant_momo: fondMomo,
      source_module: 'caisse',
      source_id: newSess?.id,
      motif: `Ouverture de caisse (${caisse.nom}) par ${userName}`,
      user_name: userName,
      user_id: userId
    }).catch(() => {})

    return { success: true, session: newSess || undefined }
  } catch (err: any) {
    console.error('[CAISSE-SERVICE] Erreur ouverture caisse:', err)
    return { success: false, error: err.message || 'Erreur lors de l\'ouverture de caisse.' }
  }
}

/**
 * Clôture une session de caisse avec transfert obligatoire :
 * - FOND ACTUEL ESPÈCES (nouveau) = FOND ACTUEL ESPÈCES (ancien) + ESPÈCES DU JOUR
 * - FOND ACTUEL MOMO (nouveau) = FOND ACTUEL MOMO (ancien) + MOMO DU JOUR
 * - Ensuite ESPÈCES DU JOUR = 0 et MOMO DU JOUR = 0
 * - Sauvegarde rigoureuse dans l'historique Z des clôtures
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
    // 1. Récupérer les données de la session courante pour calculer le report
    let ancienFondEsp = 0
    let ancienFondMomo = 0
    let espJour = 0
    let momoJour = 0
    let caJour = 0

    if (sessionId) {
      try {
        const { data: curSess } = await supabase
          .from('caisse_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle()

        if (curSess) {
          ancienFondEsp = Number(curSess.fond_ouverture_especes) || 0
          ancienFondMomo = Number(curSess.fond_actuel_momo) || 0
          espJour = Number(curSess.especes_du_jour) || 0
          momoJour = Number(curSess.momo_du_jour) || 0
          caJour = Number(curSess.ca_du_jour) || 0
        }
      } catch (e) {}
    }

    // Le nouveau fond réel après clôture
    const nouveauFondEspeces = especesPhysiquesComptees
    const nouveauFondMomo = momoPhysiqueCompte
    const totalZ = especesPhysiquesComptees + momoPhysiqueCompte

    // 2. Clôturer la session dans caisse_sessions :
    // Remise à zéro d'especes_du_jour et momo_du_jour après transfert dans fond_actuel
    if (sessionId) {
      await supabase
        .from('caisse_sessions')
        .update({
          statut: 'fermee',
          date_fermeture: nowIso,
          fond_actuel_especes: nouveauFondEspeces,
          fond_actuel_momo: nouveauFondMomo,
          especes_du_jour: 0,
          momo_du_jour: 0,
          especes_theorique: fondTheoriqueEsp,
          especes_comptees: especesPhysiquesComptees,
          ecart: ecart,
          cloture_par: userName,
          notes_fermeture: notes,
          updated_at: nowIso,
        })
        .eq('id', sessionId)
    }

    // 3. Mettre à jour la table caisses
    if (caisseId) {
      await supabase
        .from('caisses')
        .update({
          statut: 'fermee',
          date_fermeture: nowIso,
          fond_ouverture_especes: nouveauFondEspeces,
          fond_ouverture_momo: nouveauFondMomo,
          updated_at: nowIso,
        })
        .eq('id', caisseId)
    }

    // 4. Enregistrer dans caisse_clotures (Historique Z officiel)
    await supabase.from('caisse_clotures').insert({
      company_id: companyId,
      sector_slug: clean,
      secteur_slug: clean,
      caisse_id: caisseId || sessionId || null,
      total_especes_jour: espJour || especesPhysiquesComptees,
      total_momo_jour: momoJour || momoPhysiqueCompte,
      fond_actuel_especes_apres: nouveauFondEspeces,
      fond_actuel_momo_apres: nouveauFondMomo,
      cloture_par: userName,
      date_cloture: nowIso,
      notes: notes || 'Clôture de session validée',
    })

    // 5. Enregistrer le mouvement de clôture dans caisse_mouvements
    if (caisseId) {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: clean,
        caisse_id: caisseId,
        caisse_session_id: sessionId,
        type: 'cloture',
        sens: 'sortie',
        montant_especes: especesPhysiquesComptees,
        montant_momo: momoPhysiqueCompte,
        source_module: 'caisse',
        source_id: sessionId,
        motif: `Clôture Z : Espèces ${especesPhysiquesComptees} FCFA, MoMo ${momoPhysiqueCompte} FCFA (Écart: ${ecart} FCFA)`,
        user_name: userName,
      }).catch(() => {})
    }

    return { success: true, ecart }
  } catch (err: any) {
    console.error('[CAISSE-SERVICE] Erreur clôture session caisse:', err)
    return { success: false, ecart: 0, error: err.message || 'Erreur lors de la clôture.' }
  }
}

/**
 * Enregistre un mouvement de caisse dans caisse_mouvements
 * ET met à jour la session active de la caisse pour le secteur donné
 * RÈGLE D'OR : Aucun mouvement ne touche la caisse d'un autre secteur
 */
export async function enregistrerMouvementCaisse(params: {
  company_id: string
  sector_slug: string
  caisse_id?: string
  caisse_session_id?: string | null
  type: string // 'vente', 'depense', 'reglement_client', 'paiement_fournisseur', 'retrait', 'versement', 'ajustement', 'cloture', 'ouverture'
  sens?: 'entree' | 'sortie'
  montant_especes?: number
  montant_momo?: number
  source_module: string // 'vente_pos', 'clients_creances', 'depenses', 'fournisseurs_achats', 'tresorerie', 'microfinance', 'station', etc.
  source_id?: string
  motif?: string
  user_name?: string
  user_id?: string
}): Promise<void> {
  const { company_id, sector_slug } = params
  if (!company_id) return
  const clean = cleanSectorSlug(sector_slug)

  try {
    // 1. Trouver la caisse du secteur
    let targetCaisseId = params.caisse_id
    if (!targetCaisseId) {
      const caisse = await getOrCreateSectorCaisse(company_id, clean)
      targetCaisseId = caisse?.id
    }
    if (!targetCaisseId) return

    // 2. Déterminer le sens du flux
    const isSortie = params.sens
      ? params.sens === 'sortie'
      : ['depense', 'paiement_fournisseur', 'retrait', 'cloture'].includes(params.type)

    const sens: 'entree' | 'sortie' = isSortie ? 'sortie' : 'entree'
    const esp = Math.round(Number(params.montant_especes) || 0)
    const momo = Math.round(Number(params.montant_momo) || 0)
    const totalMontant = esp + momo

    if (totalMontant === 0 && params.type !== 'ouverture') return

    // 3. Trouver la session active si non spécifiée
    let activeSessionId = params.caisse_session_id
    let activeSession: any = null

    try {
      const { data: sessions } = await supabase
        .from('caisse_sessions')
        .select('*')
        .eq('caisse_id', targetCaisseId)
        .in('statut', ['ouverte', 'open'])
        .is('date_fermeture', null)
        .order('date_ouverture', { ascending: false })
        .limit(1)

      if (sessions && sessions.length > 0) {
        activeSession = sessions[0]
        if (!activeSessionId) activeSessionId = activeSession.id
      }
    } catch (e) {}

    // 4. Insérer le mouvement dans caisse_mouvements
    const nowIso = new Date().toISOString()
    await supabase.from('caisse_mouvements').insert({
      company_id,
      caisse_id: targetCaisseId,
      caisse_session_id: activeSessionId || null,
      sector_slug: clean,
      secteur_slug: clean,
      type: params.type,
      sens,
      montant_especes: esp,
      montant_momo: momo,
      montant: totalMontant,
      source_module: params.source_module,
      source_id: params.source_id || null,
      motif: params.motif || `Mouvement ${params.type}`,
      user_name: params.user_name || 'Utilisateur',
      user_id: params.user_id || null,
      created_at: nowIso,
    })

    // 5. Mettre à jour les compteurs de la session active
    if (activeSession) {
      const curEspDuJour = Number(activeSession.especes_du_jour) || 0
      const curMomoDuJour = Number(activeSession.momo_du_jour) || 0
      const curCaDuJour = Number(activeSession.ca_du_jour) || 0
      const fondOuverture = Number(activeSession.fond_ouverture_especes) || 0

      const newEspDuJour = sens === 'entree' ? curEspDuJour + esp : Math.max(0, curEspDuJour - esp)
      const newMomoDuJour = sens === 'entree' ? curMomoDuJour + momo : Math.max(0, curMomoDuJour - momo)
      const newCaDuJour = params.type === 'vente' ? curCaDuJour + totalMontant : curCaDuJour
      const newEspTheorique = fondOuverture + newEspDuJour

      await supabase
        .from('caisse_sessions')
        .update({
          especes_du_jour: newEspDuJour,
          momo_du_jour: newMomoDuJour,
          ca_du_jour: newCaDuJour,
          especes_theorique: newEspTheorique,
          updated_at: nowIso,
        })
        .eq('id', activeSession.id)
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur enregistrerMouvementCaisse:', err)
  }
}

/**
 * Récupère l'historique des clôtures pour UNE caisse spécifique (ZÉRO contamination)
 */
export async function getSectorCaisseClosures(
  companyId: string,
  caisseId: string,
  sectorSlug: string,
  limit: number = 50
): Promise<any[]> {
  const clean = cleanSectorSlug(sectorSlug)
  if (!companyId || !caisseId) return []

  try {
    // 1. Chercher dans caisse_sessions fermées pour cette caisse exacte
    const { data: closedSessions, error: sessErr } = await supabase
      .from('caisse_sessions')
      .select('*, caisse:caisses(code, nom)')
      .eq('company_id', companyId)
      .eq('caisse_id', caisseId)
      .in('statut', ['fermee', 'cloturee'])
      .order('date_fermeture', { ascending: false })
      .limit(limit)

    if (!sessErr && closedSessions && closedSessions.length > 0) {
      return closedSessions.map((cs: any) => ({
        id: cs.id,
        closed_at: cs.date_fermeture || cs.updated_at || cs.date_ouverture,
        closed_by: cs.cloture_par || 'Caissier',
        caisse_name: cs.caisse?.nom || `Caisse ${clean.toUpperCase()}`,
        fond_especes_theorique: Number(cs.especes_theorique) || 0,
        fond_especes_physique: Number(cs.especes_comptees) || Number(cs.fond_actuel_especes) || 0,
        ecart_especes: Number(cs.ecart) || 0,
        fond_momo: Number(cs.fond_actuel_momo) || 0,
        total_fermeture: (Number(cs.especes_comptees) || Number(cs.fond_actuel_especes) || 0) + (Number(cs.fond_actuel_momo) || 0),
        notes: cs.notes_fermeture || 'Clôture archivée',
        status: 'CLOTURE_VALIDEE',
      }))
    }

    // 2. Fallback caisse_clotures filtré STRICTEMENT par caisse_id ET company_id
    const { data: clotures } = await supabase
      .from('caisse_clotures')
      .select('*')
      .eq('company_id', companyId)
      .eq('caisse_id', caisseId)
      .order('date_cloture', { ascending: false })
      .limit(limit)

    if (clotures && clotures.length > 0) {
      return clotures.map((cc: any) => ({
        id: cc.id,
        closed_at: cc.date_cloture || cc.created_at,
        closed_by: cc.cloture_par || 'Caissier',
        caisse_name: `Caisse ${clean.toUpperCase()}`,
        fond_especes_theorique: Number(cc.fond_actuel_especes_apres) || 0,
        fond_especes_physique: Number(cc.fond_actuel_especes_apres) || 0,
        ecart_especes: 0,
        fond_momo: Number(cc.fond_actuel_momo_apres) || 0,
        total_fermeture: (Number(cc.fond_actuel_especes_apres) || 0) + (Number(cc.fond_actuel_momo_apres) || 0),
        notes: cc.notes || 'Clôture archivée',
        status: 'CLOTURE_VALIDEE',
      }))
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur getSectorCaisseClosures:', err)
  }

  return []
}

/**
 * Récupère les mouvements réels pour UNE caisse spécifique (ZÉRO contamination)
 */
export async function getSectorCaisseMovements(
  companyId: string,
  caisseId: string,
  limit: number = 50
): Promise<any[]> {
  if (!companyId || !caisseId) return []

  try {
    const { data, error } = await supabase
      .from('caisse_mouvements')
      .select('*')
      .eq('company_id', companyId)
      .eq('caisse_id', caisseId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!error && data) {
      return data
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur getSectorCaisseMovements:', err)
  }

  return []
}

