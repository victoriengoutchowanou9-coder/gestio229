// =============================================================================
// GESTIO 229 ADMIN & PUBLIC — API Endpoint : POST /api/feedback
// 1. Utilisateurs connectés : Envoi d'un avis ou suggestion (POST public authentifié)
// 2. Super Administrateur : Gestion, consultation et mise à jour de statut (POST avec Bearer token)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET || 'gestio229_admin_secret_change_in_production'

function verifyAdminToken(token: string): { valid: boolean } {
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
    return { valid: true }
  } catch {
    return { valid: false }
  }
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const authHeader = req.headers['authorization'] || ''
  const isBearerAuth = authHeader.startsWith('Bearer ')

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS A : GESTION PAR LE SUPER ADMINISTRATEUR (Actions Admin)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isBearerAuth) {
    const auth = verifyAdminToken(authHeader.slice(7).trim())
    if (!auth.valid) {
      return res.status(401).json({ success: false, error: 'Non autorisé.' })
    }

    const sb = getSupabase()
    const { action, feedback_id, status, admin_response, internal_notes } = req.body || {}

    try {
      if (action === 'update_status') {
        if (!feedback_id) return res.status(400).json({ success: false, error: 'feedback_id requis.' })
        const updateData: any = { updated_at: new Date().toISOString() }
        if (status) updateData.status = status
        if (admin_response !== undefined) updateData.admin_response = admin_response
        if (internal_notes !== undefined) updateData.internal_notes = internal_notes

        const { error } = await sb.from('feedbacks').update(updateData).eq('id', feedback_id)
        if (error) throw error
        return res.status(200).json({ success: true })
      }

      return res.status(400).json({ success: false, error: 'Action non reconnue.' })
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Erreur serveur.' })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS B : ENVOI D'AVIS PAR UN UTILISATEUR CONNECTÉ (Client Public)
  // ═══════════════════════════════════════════════════════════════════════════
  const { company_id, company_name, user_id, user_name, user_email, sector_slug, type, subject, message } =
    req.body || {}

  if (!subject || !message) {
    return res.status(400).json({ success: false, error: 'Sujet et message requis.' })
  }

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'Entreprise non identifiée.' })
  }

  const validTypes = ['avis', 'suggestion', 'bug', 'demande_fonctionnalite', 'difficulte']
  const feedbackType = validTypes.includes(type) ? type : 'suggestion'

  try {
    const sb = getSupabase()
    const { error } = await sb.from('feedbacks').insert({
      company_id,
      company_name: company_name || '',
      user_id: user_id || null,
      user_name: user_name || '',
      user_email: user_email || '',
      sector_slug: sector_slug || '',
      type: feedbackType,
      subject: String(subject).slice(0, 255),
      message: String(message).slice(0, 5000),
      status: 'nouveau',
    })

    if (error) throw error
    return res.status(201).json({ success: true, message: 'Votre avis a bien été envoyé. Merci !' })
  } catch (err: any) {
    console.error('[Feedback API]', err.message)
    return res.status(500).json({ success: false, error: "Erreur lors de l'envoi. Réessayez." })
  }
}
