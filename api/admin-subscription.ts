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
    confirm_name,
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

    // ── 1. BLOQUER L'ACCÈS / SUSPENSION ──────────────────────────────────
    if (action === 'block' || action === 'suspend') {
      const blockReason = (reason || comment || 'Blocage d\'accès par Super Administrateur').trim()

      // Suspension appliquée côté serveur : désactive l'entreprise et coupe l'accès
      await sb.from('companies').update({
        subscription_status: 'suspended',
        is_active: false,
        suspended_at: new Date().toISOString(),
        suspension_reason: blockReason,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await sb.from('subscriptions').update({
        status: 'suspended',
        updated_at: new Date().toISOString()
      }).eq('company_id', company_id)

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'blocage',
        reason: blockReason,
        comment: comment || '',
        performed_by: 'Super Admin',
      })

      // Inscription obligatoire dans le journal d'audit sécurisé
      await logAdminAction(sb, 'BLOCAGE_ACCES', company_id, company.name, 'success', {
        reason: blockReason,
        previous_status: company.subscription_status,
        new_status: 'suspended',
        motif: blockReason,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `L'accès à l'entreprise ${company.name} a été bloqué avec succès. Toutes ses données restent intégralement préservées.`
      })
    }

    // ── 2. DÉBLOQUER L'ACCÈS ──────────────────────────────────────────────
    if (action === 'unblock') {
      const unblockReason = (reason || comment || 'Rétablissement d\'accès par Super Administrateur').trim()

      await sb.from('companies').update({
        subscription_status: 'active',
        is_active: true,
        suspended_at: null,
        suspension_reason: null,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await sb.from('subscriptions').update({
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('company_id', company_id)

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'deblocage',
        reason: unblockReason,
        comment: comment || '',
        performed_by: 'Super Admin',
      })

      await logAdminAction(sb, 'DEBLOCAGE_ACCES', company_id, company.name, 'success', {
        reason: unblockReason,
        previous_status: company.subscription_status,
        new_status: 'active',
        motif: unblockReason,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `L'accès à l'entreprise ${company.name} a été rétabli avec succès.`
      })
    }

    // ── 3. SUPPRESSION LOGIQUE (SOFT DELETE) ──────────────────────────────
    if (action === 'delete_soft') {
      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, error: 'Le motif de la suppression est obligatoire.' })
      }
      const delReason = reason.trim()

      // L'entreprise passe au statut 'deleted', son accès est bloqué mais ses données comptables/historiques sont 100% conservées
      await sb.from('companies').update({
        subscription_status: 'deleted',
        is_active: false,
        suspended_at: new Date().toISOString(),
        suspension_reason: `[SUPPRIMÉ] ${delReason}`,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await sb.from('subscriptions').update({
        status: 'deleted',
        updated_at: new Date().toISOString()
      }).eq('company_id', company_id)

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'suppression_logique',
        reason: delReason,
        comment: comment || '',
        performed_by: 'Super Admin',
      })

      await logAdminAction(sb, 'SUPPRESSION_LOGIQUE', company_id, company.name, 'success', {
        reason: delReason,
        motif: delReason,
        previous_status: company.subscription_status,
        new_status: 'deleted',
        data_preserved: true,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `L'entreprise ${company.name} a été supprimée logiquement. Ses données historiques et comptables sont conservées et une restauration est possible.`
      })
    }

    // ── 4. RESTAURATION D'UNE ENTREPRISE SUPPRIMÉE LOGIQUEMENT ───────────
    if (action === 'restore') {
      const restReason = (reason || comment || 'Restauration par le Super Administrateur').trim()

      await sb.from('companies').update({
        subscription_status: 'active',
        is_active: true,
        suspended_at: null,
        suspension_reason: null,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await sb.from('subscriptions').update({
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('company_id', company_id)

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'restauration',
        reason: restReason,
        comment: comment || '',
        performed_by: 'Super Admin',
      })

      await logAdminAction(sb, 'RESTAURATION_ENTREPRISE', company_id, company.name, 'success', {
        reason: restReason,
        motif: restReason,
        previous_status: company.subscription_status,
        new_status: 'active',
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `L'entreprise ${company.name} a été restaurée avec succès et son accès est rétabli.`
      })
    }

    // ── 5. SUPPRESSION DÉFINITIVE (HARD DELETE ULTRA-SÉCURISÉE) ────────────
    if (action === 'delete_hard') {
      if (!confirm_name || confirm_name.trim().toLowerCase() !== company.name.trim().toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: `Nom de confirmation incorrect. Saisissez exactement « ${company.name} » pour confirmer.`
        })
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, error: 'Le motif légal/justificatif de suppression définitive est obligatoire.' })
      }

      // Suppression strictement cantonnée à l'entreprise ciblée (aucune interférence avec d'autres entreprises)
      try {
        await sb.from('sales_order_items').delete().eq('company_id', company_id)
        await sb.from('sales_orders').delete().eq('company_id', company_id)
        await sb.from('stock_movements').delete().eq('company_id', company_id)
        await sb.from('expenses').delete().eq('company_id', company_id)
        await sb.from('cash_sessions').delete().eq('company_id', company_id)
        await sb.from('products').delete().eq('company_id', company_id)
        await sb.from('customers').delete().eq('company_id', company_id)
        await sb.from('suppliers').delete().eq('company_id', company_id)
        await sb.from('subscription_history').delete().eq('company_id', company_id)
        await sb.from('subscriptions').delete().eq('company_id', company_id)
        await sb.from('user_profiles').delete().eq('company_id', company_id)
        await sb.from('companies').delete().eq('id', company_id)
      } catch (delErr: any) {
        console.error('[HardDelete] Erreur suppression dépendances:', delErr.message)
      }

      await logAdminAction(sb, 'SUPPRESSION_DEFINITIVE', company_id, company.name, 'success', {
        reason: reason.trim(),
        motif: reason.trim(),
        company_name: company.name,
        hard_deleted: true,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `L'entreprise ${company.name} et ses données associées ont été définitivement supprimées.`
      })
    }

    // ── 6. MISE À JOUR DU STATUT DIRECT ───────────────────────────────────
    if (action === 'update_status' && new_status) {
      const allowed = ['trial', 'active', 'expired', 'suspended', 'deleted']
      if (!allowed.includes(new_status)) {
        return res.status(400).json({ success: false, error: 'Statut invalide.' })
      }

      const isAct = new_status === 'active' || new_status === 'trial'
      await sb.from('companies').update({
        subscription_status: new_status,
        is_active: isAct,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await logAdminAction(sb, 'MISE_A_JOUR_STATUT', company_id, company.name, 'success', {
        oldStatus: company.subscription_status,
        newStatus: new_status,
        reason: reason || 'Mise à jour directe du statut',
      }, clientIp)

      return res.status(200).json({ success: true, message: 'Statut mis à jour.' })
    }

    return res.status(400).json({ success: false, error: 'Action non reconnue.' })

  } catch (err: any) {
    console.error('[AdminSubscription] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur serveur.' })
  }
}
