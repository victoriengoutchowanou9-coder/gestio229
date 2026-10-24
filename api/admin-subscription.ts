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
    request_id,
    approved_sectors,
    authorized_modules,
    commercial_terms,
    sectors_list,
    authorized_sectors,
  } = req.body || {}

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'company_id requis.' })
  }

  try {
    // Récupérer l'entreprise concernée (vérification avant toute modification)
    const { data: company, error: compError } = await sb
      .from('companies')
      .select('id, name, subscription_status, subscription_plan, plan, selected_sectors')
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
      const targetSector = sector_slug && sector_slug !== 'all' ? String(sector_slug).replace(/^sec-/, '').toLowerCase().trim() : 'all'

      // 1. Mettre à jour UNIQUEMENT cette entreprise
      await sb.from('companies')
        .update({
          subscription_status: 'active',
          is_active: true,
          subscription_plan: plan_slug || company.subscription_plan || 'entreprise',
          plan: plan_slug || company.plan || 'entreprise',
          updated_at: new Date().toISOString(),
        })
        .eq('id', company_id)

      // 2. Synchroniser abonnements_global et abonnements_secteurs
      if (targetSector === 'all') {
        const { data: existingGlobal } = await sb
          .from('abonnements_global')
          .select('id')
          .eq('entreprise_id', company_id)
          .maybeSingle()

        if (existingGlobal?.id) {
          await sb.from('abonnements_global').update({
            statut_global: 'actif',
            date_debut_global: newStartedAt,
            date_fin_global: newExpiresAt,
            plan_code: plan_slug || 'entreprise',
            montant_mensuel_fcfa: Number(price_monthly) || 10000,
            updated_at: new Date().toISOString(),
          }).eq('id', existingGlobal.id)
        } else {
          await sb.from('abonnements_global').insert({
            entreprise_id: company_id,
            statut_global: 'actif',
            date_debut_global: newStartedAt,
            date_fin_global: newExpiresAt,
            plan_code: plan_slug || 'entreprise',
            montant_mensuel_fcfa: Number(price_monthly) || 10000,
          })
        }

        await sb.from('abonnements_secteurs').update({
          statut_specifique: 'actif',
          rattache_au_global: true,
          date_debut_specifique: newStartedAt,
          date_fin_specifique: newExpiresAt,
          updated_at: new Date().toISOString(),
        }).eq('entreprise_id', company_id)
      } else {
        const secCode = `sec-${targetSector}`
        const { data: existingSec } = await sb
          .from('abonnements_secteurs')
          .select('id')
          .eq('entreprise_id', company_id)
          .in('secteur_code', [targetSector, secCode])
          .maybeSingle()

        if (existingSec?.id) {
          await sb.from('abonnements_secteurs').update({
            statut_specifique: 'actif',
            rattache_au_global: false,
            date_debut_specifique: newStartedAt,
            date_fin_specifique: newExpiresAt,
            updated_at: new Date().toISOString(),
          }).eq('id', existingSec.id)
        } else {
          await sb.from('abonnements_secteurs').insert({
            entreprise_id: company_id,
            secteur_code: secCode,
            statut_specifique: 'actif',
            rattache_au_global: false,
            is_premiere_activation: false,
            date_debut_specifique: newStartedAt,
            date_fin_specifique: newExpiresAt,
          })
        }
      }

      // 3. Créer ou mettre à jour l'entrée dans subscriptions
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

      // 4. Enregistrer dans l'historique
      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        sector_slug: targetSector,
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

      // 5. Journal d'audit
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
        sectorSlug: targetSector,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Abonnement de ${company.name} (${targetSector === 'all' ? 'Tous les secteurs' : targetSector}) réactivé jusqu'au ${new Date(newExpiresAt).toLocaleDateString('fr-BJ')}.`,
      })
    }

    // ── 1. BLOQUER L'ACCÈS / SUSPENSION ──────────────────────────────────
    if (action === 'block' || action === 'suspend') {
      const blockReason = (reason || comment || 'Blocage d\'accès par Super Administrateur').trim()

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

      await sb.from('abonnements_global').update({
        statut_global: 'suspendu'
      }).eq('entreprise_id', company_id)

      await sb.from('abonnements_secteurs').update({
        statut_specifique: 'suspendu'
      }).eq('entreprise_id', company_id)

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'blocage',
        reason: blockReason,
        comment: comment || '',
        performed_by: 'Super Admin',
      })

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

      await sb.from('abonnements_global').update({
        statut_global: 'actif'
      }).eq('entreprise_id', company_id)

      await sb.from('abonnements_secteurs').update({
        statut_specifique: 'actif'
      }).eq('entreprise_id', company_id)

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

    // ── 7. APPROUVER UNE DEMANDE D'ACCÈS MULTISECTEUR ──────────────────
    if (action === 'approve_multisector_request') {
      const sectorsToAuthorize = Array.isArray(approved_sectors) ? approved_sectors : []
      if (sectorsToAuthorize.length === 0) {
        return res.status(400).json({ success: false, error: 'Veuillez spécifier au moins un secteur à autoriser.' })
      }

      if (request_id) {
        await sb.from('sector_access_requests').update({
          status: 'approved',
          approved_sectors: sectorsToAuthorize,
          approved_modules: authorized_modules || [],
          commercial_terms: commercial_terms || '',
          admin_response: comment || reason || 'Demande approuvée par le Super Administrateur.',
          processed_by: 'Super Admin',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', request_id)
      }

      const { data: currentComp } = await sb.from('companies').select('authorized_sectors, selected_sectors, sectors').eq('id', company_id).single()
      const existingAuth = Array.isArray(currentComp?.authorized_sectors) ? currentComp.authorized_sectors : []
      const mergedSectors = Array.from(new Set([...existingAuth, ...sectorsToAuthorize]))

      await sb.from('companies').update({
        authorized_sectors: mergedSectors,
        selected_sectors: mergedSectors,
        sectors: mergedSectors,
        authorized_modules: authorized_modules || ['dashboard', 'ventes', 'stock', 'caisse', 'clients', 'depenses', 'abonnement', 'configuration', 'utilisateurs', 'audit'],
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      for (const s of sectorsToAuthorize) {
        const cleanSlug = String(s).replace(/^sec-/, '').toLowerCase().trim()
        await sb.from('company_sectors').upsert({
          company_id,
          sector_slug: cleanSlug,
          sector_name: cleanSlug.toUpperCase(),
          is_configured: true,
          configuration: {
            approved_by: 'Super Admin',
            approved_at: new Date().toISOString(),
          }
        }, { onConflict: 'company_id,sector_slug' })
      }

      await sb.from('subscription_history').insert({
        company_id,
        company_name: company.name,
        action: 'approbation_multisecteur',
        reason: reason || 'Demande multi-secteur approuvée',
        comment: commercial_terms ? `Conditions : ${commercial_terms}` : '',
        performed_by: 'Super Admin',
      })

      await logAdminAction(sb, 'APPROBATION_ACCES_MULTISECTEUR', company_id, company.name, 'success', {
        approved_sectors: sectorsToAuthorize,
        commercial_terms,
        requestId: request_id,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Accès accordé pour ${company.name} aux secteurs : ${sectorsToAuthorize.join(', ')}.`
      })
    }

    // ── 8. REFUSER UNE DEMANDE D'ACCÈS MULTISECTEUR ──────────────────
    if (action === 'reject_multisector_request') {
      const refusalReason = (reason || comment || 'Demande non retenue').trim()

      if (request_id) {
        await sb.from('sector_access_requests').update({
          status: 'rejected',
          admin_response: refusalReason,
          processed_by: 'Super Admin',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', request_id)
      }

      await logAdminAction(sb, 'REFUS_ACCES_MULTISECTEUR', company_id, company.name, 'success', {
        reason: refusalReason,
        requestId: request_id,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Demande d'accès multisecteur pour ${company.name} refusée.`
      })
    }

    // ── 9. GESTION DIRECTE DES SECTEURS AUTORISÉS ─────────────────────
    if (action === 'manage_sectors') {
      const rawList = Array.isArray(sectors_list) ? sectors_list : (Array.isArray(authorized_sectors) ? authorized_sectors : [])
      if (rawList.length === 0) {
        return res.status(400).json({ success: false, error: 'Au moins 1 secteur requis.' })
      }

      const cleanList = Array.from(new Set(rawList.map((s: string) => String(s).replace(/^sec-/, '').toLowerCase().trim())))
      const primary = cleanList[0]

      await sb.from('companies').update({
        primary_sector: primary,
        active_sector: primary,
        authorized_sectors: cleanList,
        selected_sectors: cleanList,
        sectors: cleanList,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      for (const s of cleanList) {
        await sb.from('company_sectors').upsert({
          company_id,
          sector_slug: s,
          sector_name: s.toUpperCase(),
          is_configured: true,
        }, { onConflict: 'company_id,sector_slug' })
      }

      await logAdminAction(sb, 'GESTION_SECTEURS_AUTORISES', company_id, company.name, 'success', {
        previous: company.selected_sectors,
        new_sectors: cleanList,
        reason: reason || 'Mise à jour par Super Admin',
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Secteurs autorisés pour ${company.name} mis à jour : ${cleanList.join(', ')}.`
      })
    }

    // ── 10. GESTION DES MODULES AUTORISÉS ─────────────────────────────
    if (action === 'manage_modules') {
      const modules = Array.isArray(authorized_modules) ? authorized_modules : []

      await sb.from('companies').update({
        authorized_modules: modules,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await logAdminAction(sb, 'GESTION_MODULES_AUTORISES', company_id, company.name, 'success', {
        authorized_modules: modules,
        reason: reason || 'Mise à jour modules par Super Admin',
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Modules autorisés pour ${company.name} mis à jour.`
      })
    }

    // ── 11. SIGNALER OU LEVER LE SIGNALEMENT DE COMPTE SUSPECT ────────
    if (action === 'flag_suspicious') {
      const suspReason = (reason || comment || 'Signalé suspect pour vérification manuelle').trim()

      await sb.from('companies').update({
        is_suspicious: true,
        suspicious_reason: suspReason,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await logAdminAction(sb, 'COMPTE_SIGNALE_SUSPECT', company_id, company.name, 'warning', {
        reason: suspReason,
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `L'entreprise ${company.name} est signalée pour vérification manuelle.`
      })
    }

    if (action === 'unflag_suspicious') {
      await sb.from('companies').update({
        is_suspicious: false,
        suspicious_reason: null,
        suspicious_reviewed_at: new Date().toISOString(),
        suspicious_reviewed_by: 'Super Admin',
        updated_at: new Date().toISOString(),
      }).eq('id', company_id)

      await logAdminAction(sb, 'SIGNALEMENT_SUSPECT_LEVE', company_id, company.name, 'success', {
        reviewed_by: 'Super Admin',
        notes: comment || reason || 'Compte vérifié et approuvé manuellement',
      }, clientIp)

      return res.status(200).json({
        success: true,
        message: `Le signalement suspect pour ${company.name} a été levé après vérification manuelle.`
      })
    }

    return res.status(400).json({ success: false, error: 'Action non reconnue.' })

  } catch (err: any) {
    console.error('[AdminSubscription] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur serveur.' })
  }
}
