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

  const eqSlugs = [clean, sectorSlug.toLowerCase().trim().replace(/^sec-/, '')]
  if (clean === 'imprimerie' || clean === 'impression') eqSlugs.push('imprimerie', 'impression')
  if (clean === 'station' || clean === 'station-service') eqSlugs.push('station', 'station-service')
  if (clean === 'immobilier' || clean === 'location' || clean === 'locatif' || clean === 'locative') eqSlugs.push('immobilier', 'location', 'locatif', 'locative')
  if (clean === 'agrobusiness' || clean === 'agro') eqSlugs.push('agrobusiness', 'agro')
  if (clean === 'cosmetiques' || clean === 'cosmetique') eqSlugs.push('cosmetiques', 'cosmetique')
  const uniqueEq = Array.from(new Set(eqSlugs)).filter(Boolean)
  const orFilter = uniqueEq.map((s) => `sector_slug.eq.${s},secteur_slug.eq.${s}`).join(',')

  try {
    // 1. Chercher la caisse existante pour ce secteur
    const { data: existing, error } = await supabase
      .from('caisses')
      .select('*')
      .eq('company_id', companyId)
      .or(orFilter)
      .order('created_at', { ascending: true })
      .limit(1)

    if (!error && existing && existing.length > 0) {
      return existing[0] as CaisseEntity
    }

    // 2. Si aucune caisse n'existe pour ce secteur, créer la caisse attitrée avec UUID BDD réel
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
        statut: 'fermee',
        fond_ouverture_especes: 0,
        fond_ouverture_momo: 0,
        solde_especes_final: 0,
      })
      .select()
      .maybeSingle()

    if (!createErr && created) {
      return created as CaisseEntity
    }

    if (createErr) {
      console.warn('[CAISSE-SERVICE] Erreur insertion caisse, nouvelle tentative de lecture:', createErr.message)
      const { data: retryList } = await supabase
        .from('caisses')
        .select('*')
        .eq('company_id', companyId)
        .or(orFilter)
        .limit(1)

      if (retryList && retryList.length > 0) {
        return retryList[0] as CaisseEntity
      }
    }

    return null
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

    if (caisseRecord && (caisseRecord.statut === 'ouverte' || caisseRecord.statut === 'open' || caisseRecord.is_open === true) && !caisseRecord.date_fermeture) {
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

export interface FondInitialResult {
  fondInitialEspeces: number
  fondInitialMomo: number
  sourceEspeces: string
  sourceMomo: string
}

/**
 * Récupère automatiquement les montants initiaux pour l'ouverture de caisse :
 * A. Fond initial en espèces : solde réel reporté de la dernière clôture validée (ne jamais remettre à 0 si un solde précédent existe)
 * B. Fond initial Mobile Money : solde du compte marchand Mobile Money concerné
 */
export async function getFondInitialOuverture(
  companyId: string,
  sectorSlug: string,
  caisseId?: string | null,
  secteurId?: string | null
): Promise<FondInitialResult> {
  const clean = cleanSectorSlug(sectorSlug)
  let fondInitialEspeces = 0
  let fondInitialMomo = 0
  let sourceEspeces = 'defaut'
  let sourceMomo = 'defaut'

  if (!companyId) {
    return { fondInitialEspeces: 0, fondInitialMomo: 0, sourceEspeces, sourceMomo }
  }

  // 1. Récupérer ou localiser la caisse du secteur
  let targetCaisseId = caisseId
  let caisseData: any = null
  try {
    if (!targetCaisseId) {
      const caisse = await getOrCreateSectorCaisse(companyId, clean)
      targetCaisseId = caisse?.id
      caisseData = caisse
    } else {
      const { data: c } = await supabase.from('caisses').select('*').eq('id', targetCaisseId).maybeSingle()
      caisseData = c
    }
  } catch (_) {}

  // 2. FOND INITIAL ESPÈCES : Solde reporté de la dernière clôture validée
  // RÈGLE MÉTIER IMPÉRATIVE : Ne JAMAIS remettre à 0 si un solde précédent existe !

  // Priorité A : Solde de clôture reporté dans la table maîtresse caisses (fond_ouverture_especes ou solde_especes_final)
  if (caisseData) {
    const valCaisse = Number(caisseData.fond_ouverture_especes ?? caisseData.solde_especes_final ?? caisseData.solde_actuel)
    if (!isNaN(valCaisse) && valCaisse !== 0) {
      fondInitialEspeces = valCaisse
      sourceEspeces = 'caisses_table'
    }
    const valMomoCaisse = Number(caisseData.fond_ouverture_momo)
    if (!isNaN(valMomoCaisse) && valMomoCaisse !== 0) {
      fondInitialMomo = valMomoCaisse
      sourceMomo = 'caisses_table'
    }
  }

  // Priorité B : Dernière session fermée dans caisse_sessions pour cette caisse
  if (fondInitialEspeces === 0 && targetCaisseId) {
    try {
      const { data: lastSess } = await supabase
        .from('caisse_sessions')
        .select('fond_actuel_especes, fond_actuel_momo, especes_comptees, especes_theorique')
        .eq('company_id', companyId)
        .eq('caisse_id', targetCaisseId)
        .in('statut', ['fermee', 'fermée', 'cloturee', 'closed'])
        .order('date_fermeture', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastSess) {
        const sEsp = Number(lastSess.fond_actuel_especes ?? lastSess.especes_comptees ?? lastSess.especes_theorique)
        if (!isNaN(sEsp) && sEsp !== 0) {
          fondInitialEspeces = sEsp
          sourceEspeces = 'caisse_sessions'
        }
        if (fondInitialMomo === 0) {
          const sMo = Number(lastSess.fond_actuel_momo)
          if (!isNaN(sMo) && sMo !== 0) {
            fondInitialMomo = sMo
            sourceMomo = 'caisse_sessions'
          }
        }
      }
    } catch (_) {}
  }

  // Priorité C : Dernier enregistrement dans clotures_caisse (secteur ou caisse)
  if (fondInitialEspeces === 0) {
    try {
      let q = supabase
        .from('clotures_caisse')
        .select('fond_especes_apres, fond_reel_especes, fond_theorique, especes_cloture, fond_momo_apres, fond_reel_momo, momo_cloture')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (targetCaisseId && secteurId) {
        q = q.or(`caisse_id.eq.${targetCaisseId},secteur_id.eq.${secteurId}`)
      } else if (targetCaisseId) {
        q = q.eq('caisse_id', targetCaisseId)
      } else if (secteurId) {
        q = q.eq('secteur_id', secteurId)
      }

      const { data: lastClo } = await q.maybeSingle()
      if (lastClo) {
        const cEsp = Number(lastClo.fond_especes_apres ?? lastClo.fond_reel_especes ?? lastClo.fond_theorique ?? lastClo.especes_cloture)
        if (!isNaN(cEsp) && cEsp !== 0) {
          fondInitialEspeces = cEsp
          sourceEspeces = 'clotures_caisse'
        }
        if (fondInitialMomo === 0) {
          const cMo = Number(lastClo.fond_momo_apres ?? lastClo.fond_reel_momo ?? lastClo.momo_cloture)
          if (!isNaN(cMo) && cMo !== 0) {
            fondInitialMomo = cMo
            sourceMomo = 'clotures_caisse'
          }
        }
      }
    } catch (_) {}
  }

  // Priorité D : caisse_clotures (Historique Z)
  if (fondInitialEspeces === 0) {
    try {
      const { data: lastCC } = await supabase
        .from('caisse_clotures')
        .select('fond_actuel_especes_apres, total_especes_jour, fond_actuel_momo_apres, total_momo_jour')
        .eq('company_id', companyId)
        .or(`sector_slug.eq.${clean},secteur_slug.eq.${clean}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastCC) {
        const ccEsp = Number(lastCC.fond_actuel_especes_apres ?? lastCC.total_especes_jour)
        if (!isNaN(ccEsp) && ccEsp !== 0) {
          fondInitialEspeces = ccEsp
          sourceEspeces = 'caisse_clotures'
        }
        if (fondInitialMomo === 0) {
          const ccMo = Number(lastCC.fond_actuel_momo_apres ?? lastCC.total_momo_jour)
          if (!isNaN(ccMo) && ccMo !== 0) {
            fondInitialMomo = ccMo
            sourceMomo = 'caisse_clotures'
          }
        }
      }
    } catch (_) {}
  }

  // Priorité E : Table fonds_actuels (M048)
  if (fondInitialEspeces === 0 && (secteurId || targetCaisseId)) {
    try {
      let q = supabase
        .from('fonds_actuels')
        .select('fond_actuel_especes, fond_initial_especes, fond_actuel_momo')
        .eq('company_id', companyId)

      if (secteurId) q = q.eq('secteur_id', secteurId)
      if (targetCaisseId) q = q.or(`caisse_id.eq.${targetCaisseId},caisse_id.is.null`)

      const { data: fa } = await q.limit(1).maybeSingle()
      if (fa) {
        const faEsp = Number(fa.fond_actuel_especes ?? fa.fond_initial_especes)
        if (!isNaN(faEsp) && faEsp !== 0) {
          fondInitialEspeces = faEsp
          sourceEspeces = 'fonds_actuels'
        }
        if (fondInitialMomo === 0) {
          const faMo = Number(fa.fond_actuel_momo)
          if (!isNaN(faMo) && faMo !== 0) {
            fondInitialMomo = faMo
            sourceMomo = 'fonds_actuels'
          }
        }
      }
    } catch (_) {}
  }

  // Priorité F : Fallback démarrage initial coffre-fort si aucune clôture antérieure n'a jamais eu lieu
  if (fondInitialEspeces === 0) {
    try {
      const { data: vault } = await supabase
        .from('treasury_accounts')
        .select('balance')
        .eq('company_id', companyId)
        .eq('type', 'vault')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (vault && Number(vault.balance) > 0) {
        fondInitialEspeces = Number(vault.balance)
        sourceEspeces = 'treasury_vault'
      }
    } catch (_) {}
  }

  // 3. FOND INITIAL MOBILE MONEY : Récupération automatique du solde marchand
  // RÈGLE MÉTIER B : Solde du compte marchand Mobile Money concerné
  try {
    const { data: momoAcc } = await supabase
      .from('treasury_accounts')
      .select('balance')
      .eq('company_id', companyId)
      .in('type', ['mobile_money', 'momo', 'marchand', 'momo_mtn', 'momo_moov'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (momoAcc && Number(momoAcc.balance) !== 0) {
      fondInitialMomo = Number(momoAcc.balance)
      sourceMomo = 'treasury_accounts'
    } else if (fondInitialMomo === 0) {
      // Recherche alternative par nom
      const { data: momoNameAcc } = await supabase
        .from('treasury_accounts')
        .select('balance')
        .eq('company_id', companyId)
        .ilike('name', '%momo%')
        .limit(1)
        .maybeSingle()
      if (momoNameAcc && Number(momoNameAcc.balance) !== 0) {
        fondInitialMomo = Number(momoNameAcc.balance)
        sourceMomo = 'treasury_accounts_name'
      }
    }
  } catch (_) {}

  return {
    fondInitialEspeces,
    fondInitialMomo,
    sourceEspeces,
    sourceMomo
  }
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
    // 2. Insertion dans caisse_sessions avec tolérance RLS absolue
    let newSess: any = null
    try {
      const { data: insertedSess, error: sessErr } = await supabase
        .from('caisse_sessions')
        .insert({
          caisse_id: caisse.id,
          company_id: companyId,
          sector_slug: clean,
          secteur_slug: clean,
          ouvert_par: (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) ? userId : null,
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

      if (sessErr) {
        console.warn('[CAISSE-SERVICE] Notice caisse_sessions (RLS/policy) :', sessErr.message)
      } else if (insertedSess) {
        newSess = insertedSess
      }

      // Synchronisation sur sessions_caisse
      try {
        await supabase.from('sessions_caisse').insert({
          company_id: companyId,
          secteur_id: (caisse as any).secteur_id || (caisse as any).sector_id || caisse.id,
          caisse_id: caisse.id,
          date_ouverture: nowIso.split('T')[0],
          heure_ouverture: nowIso,
          statut: 'ouverte',
          ouvert_par: (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) ? userId : null,
          ouvert_par_nom: userName,
          solde_ouverture_espece: fondEspeces,
          solde_ouverture_momo: fondMomo,
        })
      } catch (_) {}
    } catch (insertEx) {
      console.warn('[CAISSE-SERVICE] Exception insertion caisse_sessions :', insertEx)
    }

    // Si l'insertion dans caisse_sessions a été bloquée par RLS, générer une session de secours
    if (!newSess) {
      newSess = {
        id: caisse.id,
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
      }
    }

    try {
      localStorage.setItem(`gestio_caisse_active_${clean}_${companyId}`, JSON.stringify(newSess))
      localStorage.setItem(`gestio_caisse_active_${clean}`, JSON.stringify(newSess))
      localStorage.setItem('active_caisse_session', JSON.stringify(newSess))
    } catch (_) {}

    // 3. Mettre à jour l'état de la table caisses (Table maîtresse accessible sans colonnes non reconnues)
    const caisseCorePayload: any = {
      statut: 'ouverte',
      date_ouverture: nowIso,
      date_fermeture: null,
      fond_ouverture_especes: fondEspeces,
      fond_ouverture_momo: fondMomo,
      solde_especes_final: fondEspeces,
      updated_at: nowIso,
    }
    if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      caisseCorePayload.ouvert_par = userId
    }

    try {
      const { error: caisseErr } = await supabase
        .from('caisses')
        .update(caisseCorePayload)
        .eq('id', caisse.id)

      if (caisseErr) {
        console.warn('[CAISSE-SERVICE] Mise à jour table caisses notice:', caisseErr.message)
      }
    } catch (cEx) {
      console.warn('[CAISSE-SERVICE] Exception mise à jour caisses:', cEx)
    }

    // RÈGLE MÉTIER OBLIGATOIRE : Aucune entrée de fonds ni mouvement financier fictif lors de l'ouverture.
    // L'ouverture enregistre uniquement les soldes initiaux et l'identité de la caissière.
    // Les fonds actuels ne sont jamais augmentés une seconde fois par l'ouverture.

    return { success: true, session: newSess }
  } catch (err: any) {
    console.error('[CAISSE-SERVICE] Erreur ouverture caisse:', err)
    return { success: false, error: err.message || 'Erreur lors de l\'ouverture de caisse.' }
  }
}

export interface SessionCalculatedBalances {
  fondInitialEspeces: number
  fondInitialMomo: number
  entreesEspeces: number
  entreesMomo: number
  depensesEspeces: number
  depensesMomo: number
  versementsEspeces: number
  versementsMomo: number
  soldeTheoriqueEspeces: number
  soldeTheoriqueMomo: number
  montantConserve: number
  montantReverse: number
  caDuJour: number
  nbVentes: number
  autresModes: Array<{ mode: string; montant: number }>
}

/**
 * Calcule automatiquement tous les montants et soldes de la session de caisse
 * à partir des mouvements financiers réellement enregistrés côté serveur :
 * Solde théorique espèces = Fond initial espèces + Entrées espèces - Dépenses espèces - Versements sortants espèces
 * Solde théorique MoMo = Fond initial MoMo + Entrées MoMo - Dépenses MoMo - Versements sortants MoMo
 * Montant à reverser = Solde théorique en espèces - Montant conservé en caisse
 */
export async function calculerSoldesSessionAutomatique(params: {
  companyId: string
  sectorSlug: string
  caisseId?: string | null
  secteurId?: string | null
  sessionId?: string | null
  fallbackFondInitialEsp?: number
  fallbackFondInitialMomo?: number
  fallbackEspecesJour?: number
  fallbackMomoJour?: number
  fallbackDepensesEsp?: number
  fallbackRetraitsEsp?: number
  fallbackFondTheoriqueEsp?: number
  fallbackFondTheoriqueMomo?: number
}): Promise<SessionCalculatedBalances> {
  const { companyId, sectorSlug, caisseId, secteurId, sessionId } = params
  const clean = cleanSectorSlug(sectorSlug)

  let fondInitialEspeces = Number(params.fallbackFondInitialEsp) || 0
  let fondInitialMomo = Number(params.fallbackFondInitialMomo) || 0
  let dateOuvertureIso: string | null = null

  // 1. Récupérer la session active pour obtenir le fond d'ouverture exact
  let activeSession: any = null
  if (sessionId) {
    try {
      const { data: s } = await supabase.from('caisse_sessions').select('*').eq('id', sessionId).maybeSingle()
      if (s) activeSession = s
    } catch (_) {}
  }

  if (!activeSession && caisseId) {
    try {
      const { data: list } = await supabase
        .from('caisse_sessions')
        .select('*')
        .eq('caisse_id', caisseId)
        .in('statut', ['ouverte', 'open'])
        .is('date_fermeture', null)
        .order('date_ouverture', { ascending: false })
        .limit(1)
      if (list && list.length > 0) activeSession = list[0]
    } catch (_) {}
  }

  if (activeSession) {
    fondInitialEspeces = Number(activeSession.fond_ouverture_especes) || fondInitialEspeces
    fondInitialMomo = Number(activeSession.fond_actuel_momo ?? activeSession.fond_ouverture_momo) || fondInitialMomo
    dateOuvertureIso = activeSession.date_ouverture
  }

  // Si le fond initial n'a pas encore été déterminé, interroger la source de vérité
  if (fondInitialEspeces === 0) {
    try {
      const initB = await getFondInitialOuverture(companyId, clean, caisseId, secteurId)
      if (initB.fondInitialEspeces !== 0) {
        fondInitialEspeces = initB.fondInitialEspeces
      }
      if (fondInitialMomo === 0 && initB.fondInitialMomo !== 0) {
        fondInitialMomo = initB.fondInitialMomo
      }
    } catch (_) {}
  }

  // Définir la borne de début de session
  const now = new Date()
  const startOfDayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const startIso = dateOuvertureIso || startOfDayIso

  // 2. Calculer les ventes de la session (sales_orders)
  let sumVentesEspeces = 0
  let sumVentesMomo = 0
  let sumAutresModes: Record<string, number> = {}
  let caDuJour = 0
  let nbVentes = 0

  try {
    let salesQuery = supabase
      .from('sales_orders')
      .select('id, total_amount, paid_amount, payment_method, payment_status, notes, e_mecef_uid, created_at')
      .eq('company_id', companyId)
      .gte('created_at', startIso)
      .not('payment_status', 'in', '("avoir","ANNULE","annule")')

    const { data: salesList } = await salesQuery
    if (salesList && salesList.length > 0) {
      salesList.forEach((s: any) => {
        const tot = Number(s.total_amount) || 0
        const paid = Number(s.paid_amount ?? s.total_amount) || 0
        caDuJour += tot
        nbVentes += 1

        let pm = (s.payment_method || s.payment_status || '').toLowerCase().trim()
        if (s.e_mecef_uid && s.e_mecef_uid.startsWith('{')) {
          try {
            const meta = JSON.parse(s.e_mecef_uid)
            if (meta.pm) pm = String(meta.pm).toLowerCase().trim()
          } catch (_) {}
        }

        if (['espece', 'especes', 'cash'].includes(pm)) {
          sumVentesEspeces += paid
        } else if (pm.includes('momo') || pm.includes('mtn') || pm.includes('moov') || pm.includes('wave') || pm.includes('flooz')) {
          sumVentesMomo += paid
        } else if (pm && pm !== 'credit') {
          sumAutresModes[pm] = (sumAutresModes[pm] || 0) + paid
        } else {
          // Par défaut si non spécifié
          sumVentesEspeces += paid
        }
      })
    }
  } catch (sErr) {
    console.warn('[CAISSE-SERVICE] Erreur calcul ventes session:', sErr)
  }

  // 3. Remboursements créances (debt_payments & customer_repayments)
  let sumRemboursementsEspeces = 0
  let sumRemboursementsMomo = 0

  try {
    const { data: debtPays } = await supabase
      .from('debt_payments')
      .select('amount, payment_method')
      .eq('company_id', companyId)
      .gte('created_at', startIso)

    if (debtPays && debtPays.length > 0) {
      debtPays.forEach((dp: any) => {
        const amt = Number(dp.amount) || 0
        const m = (dp.payment_method || '').toLowerCase()
        if (['espece', 'especes', 'cash'].includes(m)) {
          sumRemboursementsEspeces += amt
        } else if (m.includes('momo') || m.includes('mtn') || m.includes('moov') || m.includes('wave')) {
          sumRemboursementsMomo += amt
        }
      })
    }
  } catch (_) {}

  // 4. Dépenses de la session (depenses & expenses)
  let sumDepensesEspeces = 0
  let sumDepensesMomo = 0

  try {
    const { data: deps } = await supabase
      .from('depenses')
      .select('montant, mode_paiement')
      .eq('company_id', companyId)
      .gte('created_at', startIso)

    if (deps && deps.length > 0) {
      deps.forEach((d: any) => {
        const amt = Number(d.montant) || 0
        const m = (d.mode_paiement || '').toLowerCase()
        if (['espece', 'especes', 'cash'].includes(m)) {
          sumDepensesEspeces += amt
        } else if (m.includes('momo') || m.includes('mtn') || m.includes('moov')) {
          sumDepensesMomo += amt
        }
      })
    }
  } catch (_) {}

  // 5. Versements sortants vers trésorerie (demandes_retrait & treasury_transfers)
  let sumVersementsEspeces = 0
  let sumVersementsMomo = 0

  try {
    const { data: rets } = await supabase
      .from('demandes_retrait')
      .select('montant, mode_paiement, statut')
      .eq('company_id', companyId)
      .gte('created_at', startIso)
      .in('statut', ['valide', 'APPROVED', 'APPROUVE', 'VALIDE'])

    if (rets && rets.length > 0) {
      rets.forEach((r: any) => {
        const amt = Number(r.montant) || 0
        const m = (r.mode_paiement || '').toLowerCase()
        if (['espece', 'especes', 'cash'].includes(m)) {
          sumVersementsEspeces += amt
        } else {
          sumVersementsMomo += amt
        }
      })
    }
  } catch (_) {}

  try {
    const { data: trans } = await supabase
      .from('treasury_transfers')
      .select('amount, type, status')
      .eq('company_id', companyId)
      .gte('created_at', startIso)
      .in('status', ['APPROVED', 'VALIDE', 'valide'])

    if (trans && trans.length > 0) {
      trans.forEach((t: any) => {
        const amt = Number(t.amount) || 0
        const isCash = t.type === 'Espèces' || t.type === 'especes' || t.type === 'cash'
        if (isCash) sumVersementsEspeces += amt
        else sumVersementsMomo += amt
      })
    }
  } catch (_) {}

  // Rapprochement avec les données de secours fournies par le composant (tolérance zéro perte)
  const entreesEspeces = Math.max(sumVentesEspeces + sumRemboursementsEspeces, Number(params.fallbackEspecesJour) || 0)
  const entreesMomo = Math.max(sumVentesMomo + sumRemboursementsMomo, Number(params.fallbackMomoJour) || 0)
  const depensesEspeces = Math.max(sumDepensesEspeces, Number(params.fallbackDepensesEsp) || 0)
  const versementsEspeces = Math.max(sumVersementsEspeces, Number(params.fallbackRetraitsEsp) || 0)

  // Équation A : Solde théorique de clôture en espèces
  // Solde théorique = Fond initial + Entrées espèces - Dépenses espèces - Versements sortants espèces
  const soldeTheoriqueEspeces = fondInitialEspeces + entreesEspeces - depensesEspeces - versementsEspeces

  // Équation B : Solde théorique Mobile Money
  const soldeTheoriqueMomo = fondInitialMomo + entreesMomo - sumDepensesMomo - sumVersementsMomo

  // Équation 5 : Montant à reverser = Solde théorique en espèces - Montant conservé en caisse
  // Par défaut dans l'architecture GESTIO 229, le solde théorique calculé reste conservé en caisse pour l'ouverture suivante
  const montantConserve = soldeTheoriqueEspeces
  const montantReverse = Math.max(0, soldeTheoriqueEspeces - montantConserve)

  const autresModes = Object.entries(sumAutresModes).map(([mode, montant]) => ({ mode, montant }))

  return {
    fondInitialEspeces,
    fondInitialMomo,
    entreesEspeces,
    entreesMomo,
    depensesEspeces,
    depensesMomo: sumDepensesMomo,
    versementsEspeces,
    versementsMomo: sumVersementsMomo,
    soldeTheoriqueEspeces,
    soldeTheoriqueMomo,
    montantConserve,
    montantReverse,
    caDuJour: Math.max(caDuJour, entreesEspeces + entreesMomo),
    nbVentes,
    autresModes,
  }
}

/**
 * Clôture automatique de la session de caisse :
 * 1. Recalcule les soldes à partir des mouvements enregistrés (données serveur fiables)
 * 2. Enregistre la clôture avec les montants calculés automatiquement (sans saisie manuelle)
 * 3. Enregistre le montant reporté destiné à la prochaine ouverture
 * 4. Met à jour l'historique et empêche la double validation
 */
export async function cloturerSessionCaisseAutomatique(params: {
  sessionId?: string
  caisseId?: string
  companyId: string
  sectorSlug: string
  secteurId?: string
  userId?: string
  userName: string
  notes?: string
  fallbackFondInitialEsp?: number
  fallbackFondInitialMomo?: number
  fallbackEspecesJour?: number
  fallbackMomoJour?: number
  fallbackDepensesEsp?: number
  fallbackRetraitsEsp?: number
  fallbackFondTheoriqueEsp?: number
  fallbackFondTheoriqueMomo?: number
}): Promise<{ success: boolean; ecart: number; synthese: SessionCalculatedBalances; error?: string }> {
  const { companyId, sectorSlug, caisseId, sessionId, userName, notes = '' } = params
  const clean = cleanSectorSlug(sectorSlug)
  const nowIso = new Date().toISOString()
  const dateJour = nowIso.split('T')[0]

  // 1. Recalculer les soldes à partir des mouvements réels
  const synthese = await calculerSoldesSessionAutomatique(params)
  const finalSoldeEsp = synthese.soldeTheoriqueEspeces
  const finalSoldeMomo = synthese.soldeTheoriqueMomo
  // RÈGLE MÉTIER OBLIGATOIRE : Le solde théorique final devient directement le nouveau fond actuel
  const montantConserve = finalSoldeEsp

  try {
    // 2. Clôturer la session dans caisse_sessions (Tolérance RLS & Double Contrainte)
    if (sessionId) {
      try {
        const { error: updErr } = await supabase
          .from('caisse_sessions')
          .update({
            statut: 'fermée',
            date_fermeture: nowIso,
            fond_actuel_especes: montantConserve,
            fond_actuel_momo: finalSoldeMomo,
            especes_du_jour: 0,
            momo_du_jour: 0,
            especes_theorique: finalSoldeEsp,
            especes_comptees: finalSoldeEsp,
            ecart: 0,
            cloture_par: userName,
            notes_fermeture: notes || 'Clôture automatique effectuée sans saisie manuelle',
            updated_at: nowIso,
          })
          .eq('id', sessionId)

        if (updErr) {
          await supabase
            .from('caisse_sessions')
            .update({
              statut: 'fermee',
              date_fermeture: nowIso,
              fond_actuel_especes: montantConserve,
              fond_actuel_momo: finalSoldeMomo,
              especes_theorique: finalSoldeEsp,
              especes_comptees: finalSoldeEsp,
              ecart: 0,
              cloture_par: userName,
              updated_at: nowIso,
            })
            .eq('id', sessionId)
        }
      } catch (sessUpErr) {
        console.warn('[CAISSE-SERVICE] Notice mise à jour caisse_sessions clôture auto:', sessUpErr)
      }
    }

    // Clôturer également dans sessions_caisse
    try {
      if (caisseId) {
        await supabase
          .from('sessions_caisse')
          .update({
            statut: 'fermée',
            date_cloture: dateJour,
            heure_cloture: nowIso,
            solde_cloture_espece: montantConserve,
            solde_cloture_momo: finalSoldeMomo,
            ferme_par_nom: userName,
            updated_at: nowIso,
          })
          .eq('caisse_id', caisseId)
          .eq('statut', 'ouverte')
      }
    } catch (_) {}

    // Nettoyer le cache local
    try {
      localStorage.removeItem(`gestio_caisse_active_${clean}_${companyId}`)
      localStorage.removeItem(`gestio_caisse_active_${clean}`)
      localStorage.removeItem('active_caisse_session')
    } catch (_) {}

    // 3. Mettre à jour la table caisses : enregistrement garanti du montant reporté pour la prochaine ouverture
    if (caisseId) {
      try {
        await supabase
          .from('caisses')
          .update({
            statut: 'fermee',
            date_fermeture: nowIso,
            fond_ouverture_especes: montantConserve, // Reporté pour la prochaine ouverture
            solde_especes_final: montantConserve,
            fond_ouverture_momo: finalSoldeMomo,
            updated_at: nowIso,
          })
          .eq('id', caisseId)
      } catch (caisseUpErr) {
        console.warn('[CAISSE-SERVICE] Notice mise à jour caisses clôture auto:', caisseUpErr)
      }
    }

    // 4. Enregistrer dans clotures_caisse
    try {
      const isValidUUID = (u?: string | null) => !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)
      await supabase.from('clotures_caisse').insert({
        company_id: companyId,
        secteur_id: isValidUUID(params.secteurId) ? params.secteurId : null,
        caisse_id: isValidUUID(caisseId) ? caisseId : null,
        date_cloture: dateJour,
        especes_cloture: synthese.entreesEspeces,
        momo_cloture: synthese.entreesMomo,
        fond_especes_avant: synthese.fondInitialEspeces,
        fond_momo_avant: synthese.fondInitialMomo,
        fond_especes_apres: montantConserve,
        fond_momo_apres: finalSoldeMomo,
        fond_initial: synthese.fondInitialEspeces,
        total_entrees: synthese.entreesEspeces,
        total_sorties: synthese.depensesEspeces + synthese.versementsEspeces,
        fond_theorique: finalSoldeEsp,
        fond_reel: finalSoldeEsp,
        fond_reel_especes: finalSoldeEsp,
        fond_reel_momo: finalSoldeMomo,
        ecart: 0,
        commentaire: notes || 'Clôture automatique validée',
        cloture_par: isValidUUID(params.userId) ? params.userId : null,
        created_by: isValidUUID(params.userId) ? params.userId : null,
      })
    } catch (clotErr) {
      console.warn('[CAISSE-SERVICE] Notice clotures_caisse insert auto:', clotErr)
    }

    // 5. Enregistrer dans caisse_clotures (Historique Z officiel)
    try {
      await supabase.from('caisse_clotures').insert({
        company_id: companyId,
        sector_slug: clean,
        secteur_slug: clean,
        caisse_id: caisseId || sessionId || null,
        total_especes_jour: synthese.entreesEspeces,
        total_momo_jour: synthese.entreesMomo,
        fond_actuel_especes_apres: montantConserve,
        fond_actuel_momo_apres: finalSoldeMomo,
        cloture_par: userName,
        date_cloture: nowIso,
        notes: notes || 'Clôture automatique validée',
      })
    } catch (cClotErr) {
      console.warn('[CAISSE-SERVICE] Notice caisse_clotures insert auto:', cClotErr)
    }

    // RÈGLE MÉTIER OBLIGATOIRE : La clôture ne doit générer aucune sortie financière fictive.
    // Les soldes théoriques calculés restent conservés dans la caisse comme nouveaux fonds actuels.

    // 7. Mettre à jour fonds_actuels (M048) et réinitialiser caisse_journaliere
    try {
      const isValidUUID = (u?: string | null) => !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)
      if (isValidUUID(params.secteurId)) {
        await supabase
          .from('fonds_actuels')
          .upsert({
            company_id: companyId,
            secteur_id: params.secteurId,
            caisse_id: isValidUUID(caisseId) ? caisseId : null,
            fond_actuel_especes: montantConserve,
            fond_actuel_momo: finalSoldeMomo,
            fond_initial_especes: montantConserve,
            fond_initial_momo: finalSoldeMomo,
            updated_at: nowIso,
          })
          .catch(() => {})

        await supabase
          .from('caisse_journaliere')
          .update({
            especes_du_jour: 0,
            momo_du_jour: 0,
            ventes_especes_du_jour: 0,
            ventes_momo_du_jour: 0,
            remboursements_especes_du_jour: 0,
            remboursements_momo_du_jour: 0,
            nb_ventes: 0,
            updated_at: nowIso,
          })
          .eq('company_id', companyId)
          .eq('date_jour', dateJour)
          .eq('secteur_id', params.secteurId)
          .catch(() => {})
      }
    } catch (_) {}

    return { success: true, ecart: 0, synthese }
  } catch (err: any) {
    console.error('[CAISSE-SERVICE] Erreur cloturerSessionCaisseAutomatique:', err)
    return { success: false, ecart: 0, synthese, error: err.message || 'Erreur clôture automatique.' }
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
  especesPhysiquesComptees?: number,
  momoPhysiqueCompte?: number,
  notes: string = '',
  rolloverCash?: number
): Promise<{ success: boolean; ecart: number; error?: string }> {
  const clean = cleanSectorSlug(sectorSlug)
  const nowIso = new Date().toISOString()
  const physicalEsp = especesPhysiquesComptees !== undefined && !isNaN(Number(especesPhysiquesComptees))
    ? Number(especesPhysiquesComptees)
    : fondTheoriqueEsp
  const momoVal = momoPhysiqueCompte !== undefined && !isNaN(Number(momoPhysiqueCompte))
    ? Number(momoPhysiqueCompte)
    : 0
  const rollover = rolloverCash !== undefined && !isNaN(Number(rolloverCash))
    ? Number(rolloverCash)
    : physicalEsp
  const ecart = physicalEsp - fondTheoriqueEsp

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

    // Le nouveau fond réel laissé en caisse pour le lendemain
    const nouveauFondEspeces = rollover
    const nouveauFondMomo = momoVal
    const totalZ = physicalEsp + momoVal

    // 2. Clôturer la session dans caisse_sessions (tolérance RLS) :
    // Remise à zéro d'especes_du_jour et momo_du_jour après transfert dans fond_actuel
    const dateJour = nowIso.split('T')[0]
    if (sessionId) {
      try {
        const { error: updErr1 } = await supabase
          .from('caisse_sessions')
          .update({
            statut: 'fermée',
            date_fermeture: nowIso,
            fond_actuel_especes: nouveauFondEspeces,
            fond_actuel_momo: nouveauFondMomo,
            especes_du_jour: 0,
            momo_du_jour: 0,
            especes_theorique: fondTheoriqueEsp,
            especes_comptees: physicalEsp,
            ecart: ecart,
            cloture_par: userName,
            notes_fermeture: notes,
            updated_at: nowIso,
          })
          .eq('id', sessionId)
        if (updErr1) {
          // Si contrainte alternative sans accent
          await supabase.from('caisse_sessions').update({ statut: 'fermee', date_fermeture: nowIso }).eq('id', sessionId)
        }
      } catch (sessUpErr) {
        console.warn('[CAISSE-SERVICE] Notice mise à jour caisse_sessions clôture:', sessUpErr)
      }
    }

    // Clôturer également dans sessions_caisse si présent
    try {
      if (caisseId) {
        await supabase
          .from('sessions_caisse')
          .update({
            statut: 'fermée',
            date_cloture: dateJour,
            heure_cloture: nowIso,
            solde_cloture_espece: nouveauFondEspeces,
            solde_cloture_momo: nouveauFondMomo,
            ferme_par_nom: userName,
            updated_at: nowIso,
          })
          .eq('caisse_id', caisseId)
          .eq('statut', 'ouverte')
      }
    } catch (_) {}

    try {
      localStorage.removeItem(`gestio_caisse_active_${clean}_${companyId}`)
      localStorage.removeItem(`gestio_caisse_active_${clean}`)
      localStorage.removeItem('active_caisse_session')
    } catch (_) {}

    // 3. Mettre à jour la table caisses (Table maîtresse garantie)
    if (caisseId) {
      try {
        await supabase
          .from('caisses')
          .update({
            statut: 'fermee',
            date_fermeture: nowIso,
            fond_ouverture_especes: nouveauFondEspeces,
            fond_ouverture_momo: nouveauFondMomo,
            solde_especes_final: nouveauFondEspeces,
            updated_at: nowIso,
          })
          .eq('id', caisseId)
      } catch (caisseUpErr) {
        console.warn('[CAISSE-SERVICE] Notice mise à jour caisses clôture:', caisseUpErr)
      }
    }

    // 4. Enregistrer dans caisse_clotures (Historique Z officiel)
    try {
      await supabase.from('caisse_clotures').insert({
        company_id: companyId,
        sector_slug: clean,
        secteur_slug: clean,
        caisse_id: caisseId || sessionId || null,
        total_especes_jour: espJour || physicalEsp,
        total_momo_jour: momoJour || momoVal,
        fond_actuel_especes_apres: nouveauFondEspeces,
        fond_actuel_momo_apres: nouveauFondMomo,
        cloture_par: userName,
        date_cloture: nowIso,
        notes: notes || 'Clôture de session validée',
      })
    } catch (clotErr) {
      console.warn('[CAISSE-SERVICE] Notice caisse_clotures insert:', clotErr)
    }

    // 5. Enregistrer le mouvement de clôture dans caisse_mouvements
    if (caisseId) {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: clean,
        caisse_id: caisseId,
        caisse_session_id: sessionId,
        type: 'cloture',
        sens: 'sortie',
        montant_especes: physicalEsp,
        montant_momo: momoVal,
        source_module: 'caisse',
        source_id: sessionId,
        motif: `Clôture Z : Espèces ${physicalEsp} FCFA, MoMo ${momoVal} FCFA (Écart: ${ecart} FCFA)`,
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
export async function enregistrerMouvementCaisse(
  paramsOrCompanyId: {
    company_id: string
    sector_slug: string
    caisse_id?: string
    caisse_session_id?: string | null
    type: string
    sens?: 'entree' | 'sortie'
    montant_especes?: number
    montant_momo?: number
    source_module: string
    source_id?: string
    motif?: string
    user_name?: string
    user_id?: string
  } | string,
  maybeSectorSlug?: string,
  maybeParams?: any
): Promise<void> {
  let params: any
  if (typeof paramsOrCompanyId === 'string') {
    params = {
      ...(maybeParams || {}),
      company_id: paramsOrCompanyId,
      sector_slug: maybeSectorSlug || 'boutique',
    }
  } else {
    params = paramsOrCompanyId
  }

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
      if (['ouverture', 'cloture'].includes(params.type)) {
        // RÈGLE MÉTIER : L'ouverture ou la clôture ne modifient jamais les encaissements du jour
        return
      }
      const curEspDuJour = Number(activeSession.especes_du_jour) || 0
      const curMomoDuJour = Number(activeSession.momo_du_jour) || 0
      const curCaDuJour = Number(activeSession.ca_du_jour) || 0
      const fondOuverture = Number(activeSession.fond_ouverture_especes) || 0

      const newEspDuJour = sens === 'entree' ? curEspDuJour + esp : curEspDuJour - esp
      const newMomoDuJour = sens === 'entree' ? curMomoDuJour + momo : curMomoDuJour - momo
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

export interface FondsActuelsDTO {
  id?: string
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  fond_initial_especes: number
  fond_initial_momo: number
  fond_actuel_especes: number
  fond_actuel_momo: number
}

export interface CaisseJournaliereDTO {
  id?: string
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  date_jour: string
  especes_du_jour: number
  momo_du_jour: number
  ventes_especes_du_jour: number
  ventes_momo_du_jour: number
  remboursements_especes_du_jour: number
  remboursements_momo_du_jour: number
  nb_ventes: number
}

/**
 * Formule obligatoire RÈGLE 2 GESTIO 229 :
 * FOND ACTUEL ESPÈCES = [Somme des clôtures validées du secteur] - [Somme des Retraits ESPÈCES Trésorerie] - [Somme des Dépenses ESPÈCES]
 * FOND ACTUEL MOMO = [Somme des clôtures validées MOMO] - [Somme des Retraits MOMO Trésorerie]
 * Les fonds actuels sont STRICTEMENT persistants et ne dépendent jamais de la date.
 */
export async function calculerFondsActuelsSector(
  companyId: string,
  sectorSlug: string
): Promise<{ fond_actuel_especes: number; fond_actuel_momo: number }> {
  if (!companyId || !sectorSlug) {
    return { fond_actuel_especes: 0, fond_actuel_momo: 0 }
  }
  const clean = cleanSectorSlug(sectorSlug)

  try {
    // 1. Somme de toutes les clôtures validées pour ce secteur (caisse_clotures)
    const { data: clotures } = await supabase
      .from('caisse_clotures')
      .select('total_especes_jour, total_momo_jour')
      .eq('company_id', companyId)
      .eq('sector_slug', clean)

    let totalCloturesEsp = 0
    let totalCloturesMomo = 0
    if (clotures && clotures.length > 0) {
      clotures.forEach((c: any) => {
        totalCloturesEsp += Number(c.total_especes_jour || 0)
        totalCloturesMomo += Number(c.total_momo_jour || 0)
      })
    }

    // 2. Somme de tous les retraits validés vers la Trésorerie pour ce secteur
    let totalRetraitsEsp = 0
    let totalRetraitsMomo = 0

    // Vérifier treasury_transfers
    try {
      const { data: transfers } = await supabase
        .from('treasury_transfers')
        .select('amount, type, status')
        .eq('company_id', companyId)
        .eq('sector_slug', clean)
        .in('status', ['APPROVED', 'VALIDE', 'valide'])

      if (transfers && transfers.length > 0) {
        transfers.forEach((t: any) => {
          const isCash = t.type === 'Espèces' || t.type === 'especes' || t.type === 'cash'
          const amt = Number(t.amount || 0)
          if (isCash) totalRetraitsEsp += amt
          else totalRetraitsMomo += amt
        })
      }
    } catch (_) {}

    // Vérifier également demandes_retrait si utilisé
    try {
      const { data: retAll } = await supabase
        .from('demandes_retrait')
        .select('montant, mode_paiement, statut')
        .eq('company_id', companyId)
        .eq('sector_slug', clean)
        .in('statut', ['valide', 'APPROVED'])

      if (retAll && retAll.length > 0) {
        retAll.forEach((r: any) => {
          const m = (r.mode_paiement || '').toLowerCase()
          const amt = Number(r.montant || 0)
          if (['espece', 'especes', 'cash'].includes(m)) totalRetraitsEsp += amt
          else totalRetraitsMomo += amt
        })
      }
    } catch (_) {}

    // 3. Somme de toutes les dépenses payées depuis le fond du secteur
    let totalDepensesEsp = 0
    try {
      const { data: depMvts } = await supabase
        .from('caisse_mouvements')
        .select('montant, type')
        .eq('company_id', companyId)
        .eq('sector_slug', clean)
        .eq('type', 'depense')

      if (depMvts && depMvts.length > 0) {
        depMvts.forEach((d: any) => {
          totalDepensesEsp += Number(d.montant || 0)
        })
      }
    } catch (_) {}

    const fond_actuel_especes = totalCloturesEsp - totalRetraitsEsp - totalDepensesEsp
    const fond_actuel_momo = totalCloturesMomo - totalRetraitsMomo

    return {
      fond_actuel_especes,
      fond_actuel_momo,
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur calculerFondsActuelsSector:', err)
    return { fond_actuel_especes: 0, fond_actuel_momo: 0 }
  }
}

/**
 * Récupère le Fond Actuel officiel pour un secteur et une caisse
 * (RÈGLE 1 & 2 : Persistant, ne dépend pas de la date)
 */
export async function getFondsActuelsBySector(
  companyId: string,
  secteurId: string,
  caisseId?: string | null,
  sectorSlug?: string | null
): Promise<FondsActuelsDTO> {
  const clean = cleanSectorSlug(sectorSlug)
  const fallback: FondsActuelsDTO = {
    company_id: companyId,
    secteur_id: secteurId,
    caisse_id: caisseId || null,
    fond_initial_especes: 0,
    fond_initial_momo: 0,
    fond_actuel_especes: 0,
    fond_actuel_momo: 0,
  }

  if (!companyId) return fallback

  // Calcul basé sur l'historique complet persistant des clôtures et retraits
  if (sectorSlug) {
    const calc = await calculerFondsActuelsSector(companyId, sectorSlug)
    fallback.fond_actuel_especes = calc.fond_actuel_especes
    fallback.fond_actuel_momo = calc.fond_actuel_momo
  }

  try {
    let query = supabase
      .from('fonds_actuels')
      .select('*')
      .eq('company_id', companyId)

    if (secteurId) {
      query = query.eq('secteur_id', secteurId)
    }

    if (caisseId) {
      query = query.or(`caisse_id.eq.${caisseId},caisse_id.is.null`)
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (!error && data) {
      return {
        id: data.id,
        company_id: data.company_id,
        secteur_id: data.secteur_id,
        caisse_id: data.caisse_id,
        fond_initial_especes: Number(data.fond_initial_especes) || 0,
        fond_initial_momo: Number(data.fond_initial_momo) || 0,
        fond_actuel_especes: fallback.fond_actuel_especes !== 0
          ? fallback.fond_actuel_especes
          : Number(data.fond_actuel_especes ?? data.solde_actuel ?? 0),
        fond_actuel_momo: fallback.fond_actuel_momo !== 0
          ? fallback.fond_actuel_momo
          : Number(data.fond_actuel_momo ?? 0),
      }
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur getFondsActuelsBySector:', err)
  }

  return fallback
}

/**
 * Récupère les compteurs journaliers officiels (avant clôture)
 */
export async function getCaisseJournaliereBySector(
  companyId: string,
  secteurId: string,
  caisseId?: string | null,
  dateJour?: string
): Promise<CaisseJournaliereDTO> {
  const targetDate = dateJour || new Date().toISOString().split('T')[0]
  const fallback: CaisseJournaliereDTO = {
    company_id: companyId,
    secteur_id: secteurId,
    caisse_id: caisseId || null,
    date_jour: targetDate,
    especes_du_jour: 0,
    momo_du_jour: 0,
    ventes_especes_du_jour: 0,
    ventes_momo_du_jour: 0,
    remboursements_especes_du_jour: 0,
    remboursements_momo_du_jour: 0,
    nb_ventes: 0,
  }

  if (!companyId || !secteurId) return fallback

  try {
    let query = supabase
      .from('caisse_journaliere')
      .select('*')
      .eq('company_id', companyId)
      .eq('secteur_id', secteurId)
      .eq('date_jour', targetDate)

    if (caisseId) {
      query = query.or(`caisse_id.eq.${caisseId},caisse_id.is.null`)
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (!error && data) {
      return {
        id: data.id,
        company_id: data.company_id,
        secteur_id: data.secteur_id,
        caisse_id: data.caisse_id,
        date_jour: data.date_jour,
        especes_du_jour: Number(data.especes_du_jour) || 0,
        momo_du_jour: Number(data.momo_du_jour) || 0,
        ventes_especes_du_jour: Number(data.ventes_especes_du_jour) || 0,
        ventes_momo_du_jour: Number(data.ventes_momo_du_jour) || 0,
        remboursements_especes_du_jour: Number(data.remboursements_especes_du_jour) || 0,
        remboursements_momo_du_jour: Number(data.remboursements_momo_du_jour) || 0,
        nb_ventes: Number(data.nb_ventes) || 0,
      }
    }
  } catch (err) {
    console.warn('[CAISSE-SERVICE] Erreur getCaisseJournaliereBySector:', err)
  }

  return fallback
}

/**
 * Clôture officielle avec transfert :
 * FOND ACTUEL = FOND ACTUEL + DU JOUR
 * DU JOUR = 0
 */
export async function cloturerCaisseOfficielle(
  companyId: string,
  secteurId: string,
  caisseId: string | null,
  userId: string | null,
  details?: {
    fond_initial?: number
    total_entrees?: number
    total_sorties?: number
    fond_theorique?: number
    fond_reel?: number
    ecart?: number
    commentaire?: string
    fond_initial_matin?: number
    total_entrees_jour?: number
    total_depenses_jour?: number
    solde_theorique?: number
    fond_initial_suivant?: number
    montant_laisse?: number
    versement_coffre?: number
  }
): Promise<{ success: boolean; especes?: number; momo?: number; error?: string }> {
  if (!companyId) {
    return { success: false, error: 'Paramètre company_id obligatoire.' }
  }

  const isValidUUID = (u?: string | null) => !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)
  const validSecteurId = isValidUUID(secteurId) ? secteurId : null
  const validCaisseId = isValidUUID(caisseId) ? caisseId : null
  const validUserId = isValidUUID(userId) ? userId : null

  // 1. Tenter RPC PostgreSQL si disponible
  try {
    const { data, error } = await supabase.rpc('fn_cloturer_caisse', {
      p_company_id: companyId,
      p_secteur_id: validSecteurId,
      p_caisse_id: validCaisseId,
      p_user_id: validUserId,
      p_fond_reel: details?.fond_reel ?? null,
      p_commentaire: details?.commentaire ?? null,
    })

    if (!error && data && data.success) {
      return { success: true, especes: data.especes, momo: data.momo }
    }
  } catch (rpcErr) {
    console.warn('[CAISSE-SERVICE] RPC fn_cloturer_caisse fallback:', rpcErr)
  }

  // 2. Fallback direct en BDD avec syntaxe sécurisée sans .catch() sur query builder
  try {
    const today = new Date().toISOString().split('T')[0]
    const curJour = await getCaisseJournaliereBySector(companyId, secteurId, caisseId, today)
    const curFond = await getFondsActuelsBySector(companyId, secteurId, caisseId)

    const espTransf = curJour.especes_du_jour || 0
    const momoTransf = curJour.momo_du_jour || 0
    const newEsp = (curFond.fond_actuel_especes || 0) + espTransf
    const newMomo = (curFond.fond_actuel_momo || 0) + momoTransf

    const fondTheorique = details?.solde_theorique ?? details?.fond_theorique ?? curFond.fond_actuel_especes ?? 0
    const fondReel = details?.fond_reel ?? newEsp
    const ecart = details?.ecart ?? (fondReel - fondTheorique)
    const montantLaisse = details?.fond_initial_suivant ?? details?.montant_laisse ?? fondReel

    // Mettre à jour fonds_actuels si secteur valide
    if (validSecteurId) {
      try {
        const { error: updFondErr } = await supabase
          .from('fonds_actuels')
          .upsert({
            company_id: companyId,
            secteur_id: validSecteurId,
            caisse_id: validCaisseId,
            fond_actuel_especes: montantLaisse,
            fond_actuel_momo: newMomo,
            fond_initial_especes: montantLaisse,
            fond_initial_momo: newMomo,
            updated_at: new Date().toISOString(),
          })

        if (updFondErr) {
          console.warn('[CAISSE-SERVICE] Upsert fonds_actuels fallback warning:', updFondErr)
        }
      } catch (fErr) {
        console.warn('[CAISSE-SERVICE] Exception upsert fonds_actuels:', fErr)
      }
    }

    // Mettre à jour caisses
    if (validCaisseId) {
      try {
        await supabase
          .from('caisses')
          .update({
            fond_ouverture_especes: montantLaisse,
            solde_especes_final: montantLaisse,
            fond_ouverture_momo: newMomo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validCaisseId)
      } catch (_) {}
    }

    // Historiser clôture dans clotures_caisse
    try {
      const { error: insertErr } = await supabase.from('clotures_caisse').insert({
        company_id: companyId,
        secteur_id: validSecteurId,
        caisse_id: validCaisseId,
        date_cloture: today,
        especes_cloture: espTransf,
        momo_cloture: momoTransf,
        fond_especes_avant: curFond.fond_actuel_especes || 0,
        fond_momo_avant: curFond.fond_actuel_momo || 0,
        fond_especes_apres: montantLaisse,
        fond_momo_apres: newMomo,
        fond_initial: details?.fond_initial_matin ?? details?.fond_initial ?? curFond.fond_initial_especes ?? 0,
        total_entrees: details?.total_entrees_jour ?? details?.total_entrees ?? espTransf,
        total_sorties: details?.total_depenses_jour ?? details?.total_sorties ?? 0,
        fond_theorique: fondTheorique,
        fond_reel: fondReel,
        fond_reel_especes: fondReel,
        fond_reel_momo: newMomo,
        ecart: ecart,
        commentaire: details?.commentaire || 'Clôture de caisse effectuée',
        created_by: validUserId,
        cloture_par: validUserId,
      })

      if (insertErr) {
        console.warn('[CAISSE-SERVICE] Insert clotures_caisse warning:', insertErr)
      }
    } catch (cErr) {
      console.warn('[CAISSE-SERVICE] Exception insert clotures_caisse:', cErr)
    }

    // Réinitialiser caisse journalière à 0
    try {
      let query = supabase
        .from('caisse_journaliere')
        .update({
          especes_du_jour: 0,
          momo_du_jour: 0,
          ventes_especes_du_jour: 0,
          ventes_momo_du_jour: 0,
          remboursements_especes_du_jour: 0,
          remboursements_momo_du_jour: 0,
          nb_ventes: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .eq('date_jour', today)

      if (validSecteurId) {
        query = query.eq('secteur_id', validSecteurId)
      }

      const { error: updJourErr } = await query
      if (updJourErr) {
        console.warn('[CAISSE-SERVICE] Update caisse_journaliere warning:', updJourErr)
      }
    } catch (jErr) {
      console.warn('[CAISSE-SERVICE] Exception update caisse_journaliere:', jErr)
    }

    return { success: true, especes: espTransf, momo: momoTransf }
  } catch (fallbackErr: any) {
    console.error('[CAISSE-SERVICE] Erreur globale fallback clôture:', fallbackErr)
    return { success: false, error: fallbackErr?.message || 'Erreur lors de la clôture.' }
  }
}

