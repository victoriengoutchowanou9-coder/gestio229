// =============================================================================
// GESTIO 229 ADMIN — API Endpoint : /api/admin-push
// Gestion des notifications Push du concepteur officiel
// Actions : vapid_public_key, subscribe, unsubscribe, status, test, history
// Accès strictement restreint au Super Administrateur / Concepteur
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'
import {
  VAPID_PUBLIC_KEY,
  saveCreatorSubscription,
  removeCreatorSubscription,
  getCreatorSubscriptions,
  sendTestPushToCreator,
  getNotificationHistory,
} from './_lib/pushHelper.ts'

const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  'gestio229_admin_secret_change_in_production'

function verifyAdminToken(token: string): { valid: boolean; payload?: any } {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return { valid: false }
    const [payloadB64, sig] = parts
    const expectedSig = crypto
      .createHmac('sha256', ADMIN_SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url')
    if (sig !== expectedSig) return { valid: false }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (payload.exp < Date.now()) return { valid: false }
    if (payload.role !== 'super_admin_universel') return { valid: false }
    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function extractAndVerifyToken(req: VercelRequest): { valid: boolean; payload?: any } {
  const authHeader = req.headers['authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { valid: false }
  const token = authHeader.slice(7).trim()
  return verifyAdminToken(token)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  // Sécurité : Token Super Admin obligatoire
  const auth = extractAndVerifyToken(req)
  if (!auth.valid) {
    return res.status(401).json({ success: false, error: 'Accès réservé au Super Administrateur / Concepteur.' })
  }

  const sb = getSupabaseAdmin()
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  const action = String(req.query.action || req.body?.action || '').trim()

  try {
    // 1. Obtenir la clé publique VAPID pour le navigateur
    if (action === 'vapid_public_key' || req.method === 'GET' && action === '') {
      return res.status(200).json({
        success: true,
        publicKey: VAPID_PUBLIC_KEY,
      })
    }

    // 2. Enregistrer un appareil du concepteur
    if (action === 'subscribe' && req.method === 'POST') {
      const { subscription, deviceName } = req.body || {}
      const userAgent = req.headers['user-agent'] || 'Appareil mobile'

      const result = await saveCreatorSubscription(sb, subscription, {
        userAgent,
        deviceName: deviceName || 'Téléphone Concepteur',
        ip: clientIp,
      })

      if (!result.success) {
        return res.status(400).json(result)
      }

      return res.status(200).json({
        success: true,
        message: 'Appareil enregistré avec succès pour les notifications push.',
      })
    }

    // 3. Désabonner un appareil
    if (action === 'unsubscribe' && req.method === 'POST') {
      const { endpoint } = req.body || {}
      if (!endpoint) {
        return res.status(400).json({ success: false, error: 'Endpoint obligatoire.' })
      }
      await removeCreatorSubscription(sb, endpoint)
      return res.status(200).json({ success: true, message: 'Appareil désabonné avec succès.' })
    }

    // 4. Tester l'envoi d'une notification push immédiate
    if (action === 'test' && req.method === 'POST') {
      const testResult = await sendTestPushToCreator(sb)
      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          error: testResult.error || 'Échec de l\'envoi du test.',
        })
      }

      return res.status(200).json({
        success: true,
        message: `Notification Push de test envoyée avec succès sur ${testResult.sentCount} appareil(s) !`,
        sentCount: testResult.sentCount,
      })
    }

    // 5. Statut des notifications et nombre d'appareils actifs
    if (action === 'status') {
      const subscriptions = await getCreatorSubscriptions(sb)
      return res.status(200).json({
        success: true,
        deviceCount: subscriptions.length,
        devices: subscriptions.map((s) => ({
          deviceName: s.device_name,
          createdAt: s.created_at,
          userAgent: s.user_agent,
        })),
      })
    }

    // 6. Historique des notifications d'inscriptions
    if (action === 'history') {
      const history = await getNotificationHistory(sb, 30)
      return res.status(200).json({
        success: true,
        history,
      })
    }

    return res.status(400).json({ success: false, error: `Action '${action}' non reconnue.` })
  } catch (err: any) {
    console.error('[AdminPush] Erreur:', err)
    return res.status(500).json({ success: false, error: err.message || 'Erreur serveur.' })
  }
}
