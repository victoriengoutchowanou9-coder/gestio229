// =============================================================================
// GESTIO 229 ADMIN — API Endpoint : POST /api/admin-subscription
// Réactivation manuelle et gestion des abonnements (Super Admin uniquement)
// Toutes les modifications sont isolées à l'entreprise sélectionnée.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET || 'gestio229_admin_secret_change_in_production'

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
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

function extractAndVerifyToken(req: VercelRequest): { valid: boolean; payload?: any } {
  const authHeader = req.headers['authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { valid: false }
  const token = authHeader.slice(7).trim()
  return verifyAdminToken(token)
}

async function logAdminAction(sb: any, action: string, company_id: string, company_name: string, result: string, details: any, ip: string) {
  try {
    await sb.from('admin_audit_logs').insert({
      admin_username: 'Super Admin',
      action,
      company_id,
      company_name,
      result,
      details,
      ip_address: ip,
    })
  } catch (_) {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  const auth = extractAndVerifyToken(req)
  if (!auth.valid) {
    return res.status(401).json({ success: false, error: 'Non autorisé.' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' })
  }

  const sb = getSupabaseAdmin()
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'

  const {
    action,
    company_id,
    sector_slug,
    plan_slug,
    plan_name,
    duration_months,
    started_at,
    expires_at,
    price_monthly,
    payment_method,
    payment_reference,
    reason,
    comment,
    new_status,
  } = req.body || {}

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'company_id requis.' })
  }

  try {
    // Récupérer l'entreprise concernée (vérification avant toute modification)
    const { data: company, error: compError } = await sb
      .from('companies')
      .select('id, name, subscription_status')
      .eq('id', company_id)
      .maybeSingle()

    if (compError || !company) {
      return res.status(404).json({ success: false, error: 'Entreprise introuvable.' })
    }

    // ── RÉACTIVATION MANUELLE ────────────────────────────────────────────
    if (action === 'reactivate') {
      if (!expires_at) {
        return res.status(400).json({ success: false, error: 'expires_at requis pour la réactivation.' })
      }

      const oldStatus = company.subscription_status
      const newExpiresAt = new Date(expires_at).toISOString()
      const newStartedAt = started_at ? new Date(started_at).toISOString() : new Date().toISOString()

      // 1. Mettre à jour UNIQUEMENT cette entreprise
      await sb.from('companies')
        .update({
          subscription_status: 'active',
          subscription_plan: plan_slug || company.subscription_plan || 'entreprise',
          plan: plan_slug || company.plan || 'entreprise',
          updated_at: new Date().toISOString(),
        })
        .eq('id', company_id)

      // 2. Créer ou mettre à jour l'entrée dans subscriptions
      const { data: existingSub } = await sb
        .from('subscriptions')
        .select('id, expires_at')
        .eq('company_id', company_id)
        .maybeSingle()

      const oldExpiresAt = existingSub?.expires_at || null

      if (existingSub) {
        await sb.from('subscriptions').update({
          status: 'active',
          plan_slug: plan_slug || 'entreprise',
          plan_name: plan_name || 'Plan Entreprise',
          expires_at: newExpiresAt,
          started_at: newStartedAt,
          price_monthly: Number(price_monthly) || 10000,
          last_payment_date: new Date().toISOString(),
          last_payment_amount: Number(price_monthly) || 10000,
          last_payment_method: payment_method || 'especes',
          last_payment_reference: payment_reference || '',
          updated_at: new Date().toISOString(),
        }).eq('id', existingSub.id)
      } else {
        await sb.from('subscriptions').insert({
          company_id,
          plan_slug: plan_slug || 'entreprise',
          plan_name: plan_name || 'Plan Entreprise',
          status: 'active',
          price_monthly: Number(price_monthly) || 10000,
          started_at: newStartedAt,
          expires_at: newExpiresAt,
          last_payment_date: new Date().toISOString(),
          last_payment_amount: Number(price_monthly) || 10000,
          last_payment_method: payment_method || 'especes',
          last_payment_reference: payment_reference || '',
        })
      }

      // 3. Enregistrer dans l'historique
      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        sector_slug: sector_slug || 'all',
        action: 'reactivation_manuelle',
        plan_slug: plan_slug || 'entreprise',
        duration_months: Number(duration_months) || 1,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        amount: Number(price_monthly) || 10000,
        payment_method: payment_method || 'especes',
        payment_reference: payment_reference || '',
        reason: reason || 'Réactivation manuelle par Super Admin',
        comment: comment || '',
        performed_by: 'Super Admin',
      })

      // 4. Journal d'audit
      await logAdminAction(sb, 'REACTIVATION_ABONNEMENT', company_id, company.name, 'success', {
        oldStatus,
        newStatus: 'active',
        oldExpiresAt,
        newExpiresAt,
        planSlug: plan_slug,
        amount: price_monthly,
        paymentMethod: payment_method,
        paymentRef: payment_reference,
        reason,
        sectorSlug: sector_slug,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Abonnement de ${company.name} réactivé jusqu'au ${new Date(newExpiresAt).toLocaleDateString('fr-BJ')}.`,
      })
    }

    // ── SUSPENSION ────────────────────────────────────────────────────────
    if (action === 'suspend') {
      await sb.from('companies').update({
        subscription_status: 'suspended',
        is_active: false,
        suspended_at: new Date().toISOString(),
        suspension_reason: reason || '',
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await sb.from('subscriptions').update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('company_id', company_id)

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'suspension',
        reason: reason || 'Suspension par Super Admin',
        comment: comment || '',
        performed_by: 'Super Admin',
      })

      await logAdminAction(sb, 'SUSPENSION_ENTREPRISE', company_id, company.name, 'success', { reason }, clientIp)

      return res.status(200).json({ success: true, message: `${company.name} suspendu.` })
    }

    // ── MISE À JOUR DU STATUT ─────────────────────────────────────────────
    if (action === 'update_status' && new_status) {
      const allowed = ['trial', 'active', 'expired', 'suspended']
      if (!allowed.includes(new_status)) {
        return res.status(400).json({ success: false, error: 'Statut invalide.' })
      }

      await sb.from('companies').update({
        subscription_status: new_status,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await logAdminAction(sb, 'MISE_A_JOUR_STATUT', company_id, company.name, 'success', {
        oldStatus: company.subscription_status, newStatus: new_status
      }, clientIp)

      return res.status(200).json({ success: true, message: 'Statut mis à jour.' })
    }

    return res.status(400).json({ success: false, error: 'Action non reconnue.' })

  } catch (err: any) {
    console.error('[AdminSubscription] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur serveur.' })
  }
}
