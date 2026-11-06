// =============================================================================
// GESTIO 229 SaaS — Service Gestion des Destinataires du Rapport de Caisse
// Support BDD Supabase, Cache Local & Traçabilité Complète des Envois
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

export interface EmailDeliveryItem {
  id: string
  recipient_email: string
  email_type: string
  status: 'envoye' | 'echec' | 'demande' | 'en_attente'
  provider: string
  created_at: string
  error_message?: string
  subject?: string
}

export interface ActiveProviderStatus {
  provider: 'resend_api' | 'brevo_api' | 'smtp_gmail' | 'unconfigured'
  label: string
  details: string
  isHttps: boolean
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

/**
 * Récupère le statut du fournisseur d'email actif depuis le serveur (/api/test-email GET)
 */
export async function getActiveEmailProvider(): Promise<ActiveProviderStatus> {
  try {
    const res = await fetch('/api/test-email', { method: 'GET' })
    const text = await res.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }

    if (res.ok && data) {
      return {
        provider: data.provider || 'unconfigured',
        label: data.label || 'Service Email GESTIO 229',
        details: data.details || '',
        isHttps: !!data.isHttps,
      }
    }
  } catch (_) {}

  return {
    provider: 'smtp_gmail',
    label: 'Gmail SMTP / Cloud Email',
    details: 'Service d\'expédition GESTIO 229',
    isHttps: false,
  }
}

/**
 * Envoie un email de test réel et retourne la confirmation du serveur
 */
export async function testEmailConnection(targetEmail: string): Promise<{
  success: boolean
  message: string
  providerLabel?: string
  diagnostic?: string
  error?: string
}> {
  try {
    const response = await fetch('/api/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: targetEmail.trim() }),
    })

    const text = await response.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      let cleanMsg = text.replace(/<[^>]+>/g, '').trim().slice(0, 300)
      if (cleanMsg.includes('FUNCTION_INVOCATION_FAILED')) {
        cleanMsg = "Échec d'exécution serveur Vercel. Vérifiez les variables d'environnement SMTP dans Vercel."
      }
      throw new Error(cleanMsg || `Erreur serveur HTTP ${response.status}`)
    }

    if (response.ok && data?.success) {
      return {
        success: true,
        message: data.message || `Email de test transmis avec succès à ${targetEmail} !`,
        providerLabel: data.providerLabel,
      }
    } else {
      return {
        success: false,
        message: data?.error || data?.message || 'Échec du test de connexion.',
        diagnostic: data?.diagnostic || `Réponse serveur HTTP ${response.status}`,
        providerLabel: data?.providerLabel,
        error: data?.error,
      }
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erreur réseau lors de l\'appel de test.',
      diagnostic: 'Détails retournés : ' + (err?.message?.slice(0, 200) || 'Impossible de joindre le serveur API local ou distant.'),
    }
  }
}

/**
 * Récupère l'historique récent des envois d'emails (Audit Trail)
 */
export async function getEmailDeliveryHistory(companyId?: string): Promise<EmailDeliveryItem[]> {
  const items: EmailDeliveryItem[] = []

  // 1. Tenter la lecture depuis email_delivery_logs
  try {
    const { data: logs, error: logErr } = await supabase
      .from('email_delivery_logs')
      .select('id, recipient_email, email_type, status, provider, created_at, error_message, subject')
      .order('created_at', { ascending: false })
      .limit(10)

    if (!logErr && Array.isArray(logs) && logs.length > 0) {
      return logs as EmailDeliveryItem[]
    }
  } catch (_) {}

  // 2. Fallback de traçabilité depuis audit_logs
  try {
    const { data: audit, error: auditErr } = await supabase
      .from('audit_logs')
      .select('id, action, details, created_at')
      .in('action', ['EMAIL_SENT_SUCCESS', 'EMAIL_SENT_FAILURE', 'EMAIL_DISPATCH_REQUESTED'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (!auditErr && Array.isArray(audit) && audit.length > 0) {
      audit.forEach((a) => {
        let det: any = {}
        try {
          det = typeof a.details === 'string' ? JSON.parse(a.details) : a.details || {}
        } catch (_) {}

        const isSuccess = a.action === 'EMAIL_SENT_SUCCESS'
        items.push({
          id: a.id,
          recipient_email: Array.isArray(det.recipients) ? det.recipients.join(', ') : (det.recipient || 'Destinataire'),
          email_type: det.type || 'Rapport de caisse',
          status: isSuccess ? 'envoye' : 'echec',
          provider: det.provider || 'cloud_email',
          created_at: a.created_at,
          error_message: det.error || det.diagnostic,
          subject: det.subject,
        })
      })
      return items
    }
  } catch (_) {}

  return items
}
