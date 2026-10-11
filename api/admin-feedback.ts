// =============================================================================
// GESTIO 229 ADMIN — API Endpoint : POST /api/admin-feedback
// Gestion des avis & suggestions (lecture Admin + mise à jour statut)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET || 'gestio229_admin_secret_change_in_production'

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

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function extractAndVerifyToken(req: VercelRequest): { valid: boolean } {
  const authHeader = req.headers['authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { valid: false }
  return verifyAdminToken(authHeader.slice(7).trim())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' })
  }

  const auth = extractAndVerifyToken(req)
  if (!auth.valid) {
    return res.status(401).json({ success: false, error: 'Non autorisé.' })
  }

  const sb = getSupabaseAdmin()
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
