// =============================================================================
// GESTIO 229 SaaS — Service Gestion des Destinataires du Rapport de Caisse
// =============================================================================

import { supabase } from '../lib/supabase'

export interface DestinataireRapport {
  id: string
  company_id?: string | null
  email: string
  nom: string
  actif: boolean
  created_at?: string
  updated_at?: string
}

const LOCAL_STORAGE_KEY_PREFIX = 'gestio_destinataires_rapport_'

/**
 * Récupère le cache local de secours si Supabase n'a pas encore la table créée
 */
function getLocalFallback(companyId: string): DestinataireRapport[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${companyId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Sauvegarde dans le cache local de secours
 */
function saveLocalFallback(companyId: string, items: DestinataireRapport[]) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${companyId}`, JSON.stringify(items))
  } catch {}
}

/**
 * Récupère la liste de tous les destinataires pour l'entreprise
 */
export async function getDestinatairesRapport(companyId: string): Promise<DestinataireRapport[]> {
  if (!companyId) return []

  try {
    const { data, error } = await supabase
      .from('parametres_destinataires')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      saveLocalFallback(companyId, data)
      return data as DestinataireRapport[]
    }
  } catch (err) {
    console.warn('[DestinatairesReportService] Table distante indisponible, fallback local :', err)
  }

  return getLocalFallback(companyId)
}

/**
 * Récupère uniquement les destinataires actifs pour l'envoi
 */
export async function getDestinatairesActifs(companyId: string): Promise<DestinataireRapport[]> {
  const all = await getDestinatairesRapport(companyId)
  return all.filter((d) => d.actif !== false)
}

/**
 * Ajoute un nouveau destinataire
 */
export async function ajouterDestinataireRapport(
  companyId: string,
  email: string,
  nom: string = '',
  actif: boolean = true
): Promise<{ success: boolean; destinataire?: DestinataireRapport; error?: string }> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Adresse email invalide.' }
  }

  const cleanNom = nom.trim() || cleanEmail.split('@')[0]
  const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `dest-${Date.now()}`
  const now = new Date().toISOString()

  const nouveau: DestinataireRapport = {
    id: newId,
    company_id: companyId,
    email: cleanEmail,
    nom: cleanNom,
    actif,
    created_at: now,
    updated_at: now,
  }

  // 1. Tenter l'insertion en BDD Supabase
  try {
    const { data, error } = await supabase
      .from('parametres_destinataires')
      .insert({
        company_id: companyId,
        email: cleanEmail,
        nom: cleanNom,
        actif,
      })
      .select()
      .single()

    if (!error && data) {
      const local = getLocalFallback(companyId)
      saveLocalFallback(companyId, [data as DestinataireRapport, ...local.filter((x) => x.id !== data.id)])
      return { success: true, destinataire: data as DestinataireRapport }
    }
  } catch (err) {
    console.warn('[DestinatairesReportService] Erreur insertion distante, fallback local :', err)
  }

  // Fallback local
  const current = getLocalFallback(companyId)
  if (current.some((d) => d.email === cleanEmail)) {
    return { success: false, error: 'Cet email est déjà enregistré.' }
  }
  const updated = [nouveau, ...current]
  saveLocalFallback(companyId, updated)
  return { success: true, destinataire: nouveau }
}

/**
 * Active / désactive ou met à jour un destinataire
 */
export async function modifierDestinataireRapport(
  companyId: string,
  id: string,
  updates: Partial<Omit<DestinataireRapport, 'id' | 'company_id'>>
): Promise<boolean> {
  try {
    await supabase
      .from('parametres_destinataires')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  } catch (err) {
    console.warn('[DestinatairesReportService] Erreur update BDD :', err)
  }

  const local = getLocalFallback(companyId)
  const updated = local.map((d) => (d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } : d))
  saveLocalFallback(companyId, updated)
  return true
}

/**
 * Supprime un destinataire
 */
export async function supprimerDestinataireRapport(companyId: string, id: string): Promise<boolean> {
  try {
    await supabase.from('parametres_destinataires').delete().eq('id', id)
  } catch (err) {
    console.warn('[DestinatairesReportService] Erreur suppression BDD :', err)
  }

  const local = getLocalFallback(companyId)
  const updated = local.filter((d) => d.id !== id)
  saveLocalFallback(companyId, updated)
  return true
}
