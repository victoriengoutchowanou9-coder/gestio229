// =============================================================================
// GESTIO 229 SaaS — Service Caisse & Dépenses Multi-Secteurs
// RÈGLE MÉTIER OFFICIELLE : DÉCOUVERT AUTORISÉ & RÉAJUSTEMENT AUTOMATIQUE
// =============================================================================

import { supabase } from '../lib/supabase'

export interface SecteurRecord {
  id: string
  company_id: string
  nom: string
  slug: string
  created_at?: string
}

export interface CaisseRecord {
  id: string
  company_id: string
  nom: string
  code?: string
  solde_actuel?: number
  is_open?: boolean
}

export interface FondActuelRecord {
  id?: string
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  type_fond: 'espece' | 'mtn_momo' | 'moov' | 'banque' | 'orange_money'
  solde_actuel: number // CRITIQUE : PEUT ÊTRE NÉGATIF
  updated_at?: string
}

export interface DepenseRecord {
  id: string
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  categorie: string
  description?: string
  montant: number
  mode_paiement: 'espece' | 'mtn_momo' | 'moov' | 'banque' | 'orange_money'
  date_depense?: string
  fond_avant: number
  fond_apres: number
  created_by?: string | null
  created_at?: string
}

export interface MouvementTresorerieRecord {
  id: string
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  type: 'ENTREE' | 'SORTIE'
  source: string
  montant: number
  mode_paiement: string
  fond_avant: number
  fond_apres: number
  reference_id?: string | null
  description?: string
  created_at?: string
}

// Helper pour stockage local de secours en cas d'indisponibilité temporaire BDD
const LOCAL_FONDS_KEY = 'gestio229_fonds_actuels'
const LOCAL_DEPENSES_KEY = 'gestio229_depenses_list'
const LOCAL_MOUVEMENTS_KEY = 'gestio229_mouvements_list'

function getLocalKey(companyId: string, secteurId: string, caisseId?: string | null, typeFond?: string) {
  return `${companyId}_${secteurId}_${caisseId || 'default'}_${typeFond || 'espece'}`
}

function getLocalFond(key: string): number | null {
  try {
    const raw = localStorage.getItem(LOCAL_FONDS_KEY)
    if (!raw) return null
    const map = JSON.parse(raw)
    return typeof map[key] === 'number' ? map[key] : null
  } catch {
    return null
  }
}

function setLocalFond(key: string, solde: number): void {
  try {
    const raw = localStorage.getItem(LOCAL_FONDS_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[key] = solde
    localStorage.setItem(LOCAL_FONDS_KEY, JSON.stringify(map))
  } catch {}
}

/**
 * Récupère ou crée la ligne `secteurs` dans Supabase
 */
export async function getOrCreateSecteurBDD(
  companyId: string,
  sectorSlug: string,
  sectorNom: string
): Promise<SecteurRecord> {
  const cleanSlug = (sectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const nom = sectorNom || cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1)

  // 1. Chercher dans `secteurs`
  try {
    const { data, error } = await supabase
      .from('secteurs')
      .select('*')
      .eq('company_id', companyId)
      .eq('slug', cleanSlug)
      .maybeSingle()

    if (!error && data) {
      return data as SecteurRecord
    }

    if (!error && !data) {
      // Tenter de créer
      const { data: created, error: crErr } = await supabase
        .from('secteurs')
        .insert({
          company_id: companyId,
          nom: nom,
          slug: cleanSlug,
        })
        .select()
        .maybeSingle()

      if (!crErr && created) {
        return created as SecteurRecord
      }
    }
  } catch (e) {
    console.warn('[caisseDepensesService] BDD secteurs fallback:', e)
  }

  // 2. Fallback déterministe pour toujours avoir un UUID valide
  // ID UUID déterministe ou synthétique
  return {
    id: `00000000-0000-4000-8000-${cleanSlug.slice(0, 12).padEnd(12, '0')}`,
    company_id: companyId,
    nom: nom,
    slug: cleanSlug,
  }
}

/**
 * Récupère le solde actuel d'un fond pour un secteur + caisse + mode
 */
export async function getSoldeFondActuel(
  companyId: string,
  secteurId: string,
  caisseId: string | null | undefined,
  typeFond: string
): Promise<number> {
  if (!companyId || !secteurId) return 0
  const lKey = getLocalKey(companyId, secteurId, caisseId, typeFond)

  try {
    const query = supabase
      .from('fonds_actuels')
      .select('solde_actuel')
      .eq('company_id', companyId)
      .eq('secteur_id', secteurId)
      .eq('type_fond', typeFond)

    if (caisseId) {
      query.eq('caisse_id', caisseId)
    }

    const { data, error } = await query.maybeSingle()
    if (!error && data && typeof data.solde_actuel === 'number') {
      setLocalFond(lKey, data.solde_actuel)
      return data.solde_actuel
    }
  } catch (e) {
    console.warn('[caisseDepensesService] BDD fonds_actuels fallback:', e)
  }

  // Fallback local
  const local = getLocalFond(lKey)
  return local !== null ? local : 0
}

/**
 * Enregistre une dépense via la fonction SQL atomique `fn_creer_depense_caisse`
 * RÈGLE D'OR : Négatif autorisé (Découvert), jamais de blocage si solde insuffisant
 */
export async function enregistrerDepenseCaisse(params: {
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  categorie: string
  description?: string
  montant: number
  mode_paiement: string
  user_id?: string | null
}): Promise<{ success: boolean; depense_id?: string; avant: number; apres: number; error?: string }> {
  const { company_id, secteur_id, caisse_id, categorie, description, montant, mode_paiement, user_id } = params
  const numMontant = Number(montant) || 0
  const lKey = getLocalKey(company_id, secteur_id, caisse_id, mode_paiement)

  // 1. Tenter via la RPC officielle Supabase
  try {
    const { data, error } = await supabase.rpc('fn_creer_depense_caisse', {
      p_company_id: company_id,
      p_secteur_id: secteur_id,
      p_caisse_id: caisse_id || null,
      p_categorie: categorie,
      p_description: description || '',
      p_montant: numMontant,
      p_mode_paiement: mode_paiement,
      p_user_id: user_id || null,
    })

    if (!error && data && data.success) {
      setLocalFond(lKey, Number(data.apres))
      return {
        success: true,
        depense_id: data.depense_id,
        avant: Number(data.avant),
        apres: Number(data.apres),
      }
    }
    if (error) {
      console.warn('[caisseDepensesService] RPC fn_creer_depense_caisse non disponible, fallback direct:', error.message)
    }
  } catch (rpcErr) {
    console.warn('[caisseDepensesService] RPC exception, fallback direct:', rpcErr)
  }

  // 2. Fallback SQL direct / synchrone (ex: tables directes)
  try {
    const soldeAvant = await getSoldeFondActuel(company_id, secteur_id, caisse_id, mode_paiement)
    const soldeApres = soldeAvant - numMontant // NÉGATIF AUTORISÉ STRICTEMENT

    // Dépense
    let depenseId = `dep-${Date.now()}`
    try {
      const { data: insDep, error: depErr } = await supabase
        .from('depenses')
        .insert({
          company_id,
          secteur_id,
          caisse_id: caisse_id || null,
          categorie,
          description: description || '',
          montant: numMontant,
          mode_paiement,
          fond_avant: soldeAvant,
          fond_apres: soldeApres,
          created_by: user_id || null,
        })
        .select('id')
        .maybeSingle()

      if (!depErr && insDep) {
        depenseId = insDep.id
      }
    } catch (_) {}

    // Mise à jour fond_actuel
    try {
      await supabase
        .from('fonds_actuels')
        .upsert({
          company_id,
          secteur_id,
          caisse_id: caisse_id || null,
          type_fond: mode_paiement,
          solde_actuel: soldeApres,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id,secteur_id,caisse_id,type_fond'
        })
    } catch (_) {}

    // Audit mouvement trésorerie
    try {
      await supabase
        .from('mouvements_tresorerie')
        .insert({
          company_id,
          secteur_id,
          caisse_id: caisse_id || null,
          type: 'SORTIE',
          source: 'DEPENSE',
          montant: numMontant,
          mode_paiement,
          fond_avant: soldeAvant,
          fond_apres: soldeApres,
          reference_id: depenseId,
          description: categorie,
        })
    } catch (_) {}

    setLocalFond(lKey, soldeApres)
    return {
      success: true,
      depense_id: depenseId,
      avant: soldeAvant,
      apres: soldeApres,
    }
  } catch (fallbackErr: any) {
    return {
      success: false,
      avant: 0,
      apres: 0,
      error: fallbackErr.message || 'Erreur lors de la dépense.',
    }
  }
}

/**
 * Enregistre une entrée de caisse (vente, apport, règlement) via la fonction SQL atomique `fn_creer_entree_caisse`
 * RÈGLE D'OR : Réajuste automatiquement : Solde final = Solde négatif + Entrée
 */
export async function enregistrerEntreeCaisse(params: {
  company_id: string
  secteur_id: string
  caisse_id?: string | null
  montant: number
  mode_paiement: string
  source: string // 'VENTE', 'DEPOT', 'TRANSFERT', etc.
  reference_id?: string | null
}): Promise<{ success: boolean; avant: number; apres: number; error?: string }> {
  const { company_id, secteur_id, caisse_id, montant, mode_paiement, source, reference_id } = params
  const numMontant = Number(montant) || 0
  const lKey = getLocalKey(company_id, secteur_id, caisse_id, mode_paiement)

  // 1. Tenter via la RPC officielle Supabase
  try {
    const { data, error } = await supabase.rpc('fn_creer_entree_caisse', {
      p_company_id: company_id,
      p_secteur_id: secteur_id,
      p_caisse_id: caisse_id || null,
      p_montant: numMontant,
      p_mode_paiement: mode_paiement,
      p_source: source,
      p_reference_id: reference_id || null,
    })

    if (!error && data && data.success) {
      setLocalFond(lKey, Number(data.apres))
      return {
        success: true,
        avant: Number(data.avant),
        apres: Number(data.apres),
      }
    }
    if (error) {
      console.warn('[caisseDepensesService] RPC fn_creer_entree_caisse non disponible, fallback direct:', error.message)
    }
  } catch (rpcErr) {
    console.warn('[caisseDepensesService] RPC exception, fallback direct:', rpcErr)
  }

  // 2. Fallback SQL direct / synchrone
  try {
    const soldeAvant = await getSoldeFondActuel(company_id, secteur_id, caisse_id, mode_paiement)
    const soldeApres = soldeAvant + numMontant // RÉAJUSTEMENT AUTOMATIQUE (ex: -15 000 + 30 000 = +15 000)

    try {
      await supabase
        .from('fonds_actuels')
        .upsert({
          company_id,
          secteur_id,
          caisse_id: caisse_id || null,
          type_fond: mode_paiement,
          solde_actuel: soldeApres,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id,secteur_id,caisse_id,type_fond'
        })
    } catch (_) {}

    try {
      await supabase
        .from('mouvements_tresorerie')
        .insert({
          company_id,
          secteur_id,
          caisse_id: caisse_id || null,
          type: 'ENTREE',
          source,
          montant: numMontant,
          mode_paiement,
          fond_avant: soldeAvant,
          fond_apres: soldeApres,
          reference_id: reference_id || null,
        })
    } catch (_) {}

    setLocalFond(lKey, soldeApres)
    return {
      success: true,
      avant: soldeAvant,
      apres: soldeApres,
    }
  } catch (fallbackErr: any) {
    return {
      success: false,
      avant: 0,
      apres: 0,
      error: fallbackErr.message || 'Erreur lors de l’entrée de caisse.',
    }
  }
}
