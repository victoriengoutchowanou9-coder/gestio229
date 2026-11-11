// =============================================================================
// GESTIO 229 SAAS — Module Web Push Helper
// Gestion des notifications Push du concepteur officiel (Android, Chrome, PWA)
// Standard RFC 8291 / RFC 8292 (VAPID)
// Système anti-doublon strict, persistance résiliente et journalisation
// =============================================================================

import * as webpushModule from 'web-push'
const webpush: any = (webpushModule as any).default ?? webpushModule
import { createClient } from '@supabase/supabase-js'

// Clés VAPID du système GESTIO 229
export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BPoc5LuCf_S_LR-5p9l1YaRmHYlUoiRvC2TI-7e-PsfpctyW-VIXJ_n8vd7TQgDzLgd_wvOiM4MpsIckYUKDlfU'

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  '63HrhYaE6Wf9Hl9twdOIhRYrxjQoMOqNT4wA1rwYJgQ'

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:admin@gestio229.com'

// Initialisation globale de web-push
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

export interface PushSubscriptionData {
  endpoint: string
  expirationTime?: number | null
  keys: PushSubscriptionKeys
}

export interface CreatorDeviceSubscription {
  id?: string
  endpoint: string
  keys: PushSubscriptionKeys
  user_agent?: string
  device_name?: string
  created_at: string
  updated_at?: string
}

export interface RegistrationNotificationData {
  companyId: string
  companyName: string
  responsibleName: string
  email: string
  phone?: string
  selectedSectors: string[]
  registeredAt?: string
}

/**
 * Récupère tous les abonnements Push actifs du concepteur
 * Utilise admin_audit_logs comme stockage résilient
 */
export async function getCreatorSubscriptions(sb: ReturnType<typeof createClient>): Promise<CreatorDeviceSubscription[]> {
  try {
    const { data, error } = await sb
      .from('admin_audit_logs')
      .select('id, details, created_at')
      .eq('action', 'PUSH_DEVICE_SUBSCRIPTION')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data) return []

    // Dédupliquer par endpoint (ne garder que le plus récent)
    const map = new Map<string, CreatorDeviceSubscription>()
    for (const row of data) {
      const details = (row.details && typeof row.details === 'object') ? row.details : {}
      const endpoint = details.endpoint || details.subscription?.endpoint
      const keys = details.keys || details.subscription?.keys

      if (endpoint && keys?.p256dh && keys?.auth && !map.has(endpoint)) {
        map.set(endpoint, {
          id: row.id,
          endpoint,
          keys,
          user_agent: details.userAgent || details.user_agent || 'Appareil mobile',
          device_name: details.deviceName || details.device_name || 'Téléphone Concepteur',
          created_at: row.created_at,
          updated_at: details.updated_at,
        })
      }
    }

    return Array.from(map.values())
  } catch (err) {
    console.warn('[PushHelper] Erreur lecture souscriptions push:', err)
    return []
  }
}

/**
 * Enregistre un appareil push pour le concepteur
 */
export async function saveCreatorSubscription(
  sb: ReturnType<typeof createClient>,
  subscription: PushSubscriptionData,
  deviceInfo?: { userAgent?: string; deviceName?: string; ip?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { success: false, error: 'Structure de souscription push invalide.' }
  }

  const endpoint = subscription.endpoint
  const now = new Date().toISOString()

  try {
    // Vérifier si cet endpoint existe déjà
    const { data: existing } = await sb
      .from('admin_audit_logs')
      .select('id, details')
      .eq('action', 'PUSH_DEVICE_SUBSCRIPTION')
      .contains('details', { endpoint })
      .limit(1)

    if (existing && existing.length > 0) {
      // Mettre à jour la date
      await sb
        .from('admin_audit_logs')
        .update({
          details: {
            ...existing[0].details,
            endpoint,
            keys: subscription.keys,
            userAgent: deviceInfo?.userAgent || 'Appareil mobile',
            deviceName: deviceInfo?.deviceName || 'Téléphone Concepteur',
            updated_at: now,
          },
        })
        .eq('id', existing[0].id)

      return { success: true }
    }

    // Insérer nouvelle souscription
    await sb.from('admin_audit_logs').insert({
      admin_username: 'Super Admin',
      action: 'PUSH_DEVICE_SUBSCRIPTION',
      result: 'success',
      details: {
        endpoint,
        keys: subscription.keys,
        userAgent: deviceInfo?.userAgent || 'Appareil mobile',
        deviceName: deviceInfo?.deviceName || 'Téléphone Concepteur',
        ip: deviceInfo?.ip || 'unknown',
        created_at: now,
        updated_at: now,
      },
      ip_address: deviceInfo?.ip || 'unknown',
    })

    return { success: true }
  } catch (err: any) {
    console.error('[PushHelper] Erreur sauvegarde souscription:', err)
    return { success: false, error: err.message || 'Erreur base de données' }
  }
}

/**
 * Supprime un appareil push du concepteur
 */
export async function removeCreatorSubscription(
  sb: ReturnType<typeof createClient>,
  endpoint: string
): Promise<boolean> {
  try {
    const { data } = await sb
      .from('admin_audit_logs')
      .select('id, details')
      .eq('action', 'PUSH_DEVICE_SUBSCRIPTION')
    if (data && data.length > 0) {
      const idsToDelete = data
        .filter((r: any) => {
          const ep = r.details?.endpoint || r.details?.subscription?.endpoint
          return ep === endpoint
        })
        .map((r: any) => r.id)
      if (idsToDelete.length > 0) {
        await sb.from('admin_audit_logs').delete().in('id', idsToDelete)
      }
    }
    return true
  } catch (err) {
    console.warn('[PushHelper] Erreur suppression souscription:', err)
    return false
  }
}

/**
 * Envoie une notification Push au concepteur lors d'une nouvelle inscription
 * AVEC ANTI-DOUBLON STRICT par companyId
 */
export async function sendRegistrationPushToCreator(
  sb: ReturnType<typeof createClient>,
  data: RegistrationNotificationData
): Promise<{ success: boolean; sentCount: number; skipped?: boolean; error?: string }> {
  const { companyId, companyName, responsibleName, email, phone, selectedSectors, registeredAt } = data

  if (!companyId || !companyName) {
    return { success: false, sentCount: 0, error: 'companyId et companyName obligatoires.' }
  }

  // 1. CONTRÔLE ANTI-DOUBLON STRICT
  // Vérifie si une notification push a déjà été envoyée pour cette entreprise
  try {
    const { data: existingNotifs } = await sb
      .from('admin_audit_logs')
      .select('id')
      .eq('action', 'PUSH_NOTIFICATION_SENT')
      .eq('company_id', companyId)
      .limit(1)

    if (existingNotifs && existingNotifs.length > 0) {
      console.log(`[PushHelper] Notification déjà envoyée pour l'entreprise ${companyName} (${companyId}) — ignorée (anti-doublon).`)
      return { success: true, sentCount: 0, skipped: true }
    }
  } catch (checkErr) {
    console.warn('[PushHelper] Avertissement contrôle anti-doublon:', checkErr)
  }

  // 2. Récupérer les téléphones/appareils enregistrés du concepteur
  const subscriptions = await getCreatorSubscriptions(sb)
  if (subscriptions.length === 0) {
    console.log('[PushHelper] Aucun appareil concepteur enregistré pour recevoir les pushs.')
    return { success: true, sentCount: 0, error: 'Aucun appareil enregistré.' }
  }

  // 3. Formatage exact selon la spécification
  const dateStr = registeredAt || new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Porto-Novo',
  }).format(new Date())

  const sectorsFormatted = Array.isArray(selectedSectors) && selectedSectors.length > 0
    ? selectedSectors.map((s) => s.replace(/^sec-/, '').toUpperCase()).join(', ')
    : 'Commerce'

  const title = 'GESTIO229 : Nouvelle entreprise inscrite !'
  const body = [
    `Entreprise : ${companyName}.`,
    `Responsable : ${responsibleName}.`,
    `Email : ${email}.`,
    phone ? `Téléphone : ${phone}.` : '',
    `Secteurs : ${sectorsFormatted}.`,
    `Date : ${dateStr}.`,
    `Consultez votre espace Super Admin pour plus de détails.`
  ].filter(Boolean).join('\n')

  const payload = JSON.stringify({
    title,
    body,
    icon: '/icon-192.png',
    badge: '/icons/favicon.png',
    tag: `new-company-${companyId}`,
    data: {
      url: `/admin/companies/${companyId}`,
      companyId,
      companyName,
      type: 'new_registration',
    },
  })

  // 4. Envoi aux appareils du concepteur avec nettoyage des endpoints expirés
  let sentCount = 0
  const expiredEndpoints: string[] = []

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        payload,
        {
          TTL: 86400,
          urgency: 'high',
          vapidDetails: {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
        }
      )
      sentCount++
    } catch (pushErr: any) {
      console.warn(`[PushHelper] Échec envoi push vers endpoint:`, pushErr?.statusCode || pushErr?.message)
      // Si le service push indique que l'abonnement n'existe plus (410 Gone ou 404 Not Found)
      if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint)
      }
    }
  }

  // Nettoyer les endpoints expirés
  for (const ep of expiredEndpoints) {
    await removeCreatorSubscription(sb, ep)
  }

  // 5. Journaliser l'envoi dans l'historique d'audit (permet aussi l'anti-doublon)
  try {
    await sb.from('admin_audit_logs').insert({
      admin_username: 'Système Inscription',
      action: 'PUSH_NOTIFICATION_SENT',
      company_id: companyId,
      company_name: companyName,
      result: sentCount > 0 ? 'success' : 'warning',
      details: {
        title,
        body,
        email,
        phone: phone || null,
        responsible_name: responsibleName,
        selected_sectors: selectedSectors,
        sent_devices_count: sentCount,
        total_subscribers: subscriptions.length,
        expired_cleaned: expiredEndpoints.length,
        registered_at: dateStr,
      },
      ip_address: '127.0.0.1',
    })
  } catch (logErr) {
    console.warn('[PushHelper] Notice log audit notification:', logErr)
  }

  return { success: true, sentCount }
}

/**
 * Envoie une notification Push de test au concepteur
 */
export async function sendTestPushToCreator(
  sb: ReturnType<typeof createClient>
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  const subscriptions = await getCreatorSubscriptions(sb)
  if (subscriptions.length === 0) {
    return { success: false, sentCount: 0, error: 'Aucun appareil enregistré. Activez d\'abord les notifications sur votre téléphone Android.' }
  }

  const nowFormatted = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Africa/Porto-Novo',
  }).format(new Date())

  const title = '🔔 GESTIO 229 : Test de Notification Réussi !'
  const body = `Félicitations ! Votre téléphone est correctement configuré pour recevoir les alertes instantanées de nouvelles inscriptions en temps réel (${nowFormatted}).`

  const payload = JSON.stringify({
    title,
    body,
    icon: '/icon-192.png',
    badge: '/icons/favicon.png',
    tag: `test-push-${Date.now()}`,
    data: { url: '/admin/dashboard', type: 'test', timestamp: Date.now() },
  })

  let sentCount = 0
  const expiredEndpoints: string[] = []
  const sendErrors: string[] = []

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        payload,
        {
          TTL: 86400,
          urgency: 'high',
          vapidDetails: {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
        }
      )
      sentCount++
    } catch (err: any) {
      console.warn('[PushHelper] Échec test push vers endpoint:', err?.statusCode, err?.message)
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint)
      } else {
        sendErrors.push(`Code ${err?.statusCode || 'inconnu'}: ${err?.message || 'Erreur d\'envoi'}`)
      }
    }
  }

  for (const ep of expiredEndpoints) {
    await removeCreatorSubscription(sb, ep)
  }

  try {
    await sb.from('admin_audit_logs').insert({
      admin_username: 'Super Admin',
      action: 'PUSH_TEST_SENT',
      result: sentCount > 0 ? 'success' : 'failed',
      details: {
        title,
        body,
        sentCount,
        totalDevices: subscriptions.length,
        expiredCleaned: expiredEndpoints.length,
        errors: sendErrors,
        testedAt: nowFormatted,
      },
      ip_address: '127.0.0.1',
    })
  } catch (_) {}

  if (sentCount === 0) {
    const errorDetails = sendErrors.length > 0 ? sendErrors.join(' ; ') : 'Abonnement expiré ou invalide (410/404).'
    return {
      success: false,
      sentCount: 0,
      error: `Échec de transmission : ${errorDetails}`,
    }
  }

  return { success: true, sentCount }
}

/**
 * Récupère l'historique des notifications envoyées au concepteur
 */
export async function getNotificationHistory(sb: ReturnType<typeof createClient>, limit = 30) {
  try {
    const { data, error } = await sb
      .from('admin_audit_logs')
      .select('id, company_id, company_name, result, details, created_at')
      .eq('action', 'PUSH_NOTIFICATION_SENT')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    return data.map((d: any) => ({
      id: d.id,
      companyId: d.company_id,
      companyName: d.company_name,
      details: d.details || {},
      status: d.result,
      createdAt: d.created_at,
    }))
  } catch (err) {
    console.warn('[PushHelper] Erreur historique notifications:', err)
    return []
  }
}
