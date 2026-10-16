// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/sector-request
// Demande d'Accès Multi-Secteur ou Extension de Fonctionnalités
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' })
  }

  const {
    company_id,
    company_name,
    user_id,
    user_email,
    user_phone,
    requested_sectors,
    requested_modules,
    reason,
    business_details
  } = req.body || {}

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'Identifiant d’entreprise requis.' })
  }

  const sectors: string[] = Array.isArray(requested_sectors)
    ? requested_sectors
    : typeof requested_sectors === 'string' && requested_sectors
    ? [requested_sectors]
    : []

  if (sectors.length === 0) {
    return res.status(400).json({ success: false, error: 'Veuillez préciser le(s) secteur(s) souhaité(s).' })
  }

  try {
    const sb = getSupabase()

    // 1. Enregistrer dans sector_access_requests
    const { data: request, error: reqErr } = await sb
      .from('sector_access_requests')
      .insert({
        company_id,
        company_name: company_name || 'Entreprise',
        user_id: user_id || null,
        user_email: user_email || '',
        user_phone: user_phone || '',
        requested_sectors: sectors,
        requested_modules: Array.isArray(requested_modules) ? requested_modules : [],
        reason: reason || 'Demande d\'extension multi-activités',
        business_details: business_details || '',
        status: 'pending',
      })
      .select()
      .single()

    if (reqErr) throw reqErr

    // 2. Journaliser dans le journal d'audit du Super Admin
    try {
      await sb.from('admin_audit_logs').insert({
        admin_username: 'Système Demandes',
        action: 'DEMANDE_ACCES_MULTISECTEUR',
        company_id,
        company_name: company_name || '',
        result: 'info',
        details: {
          requestId: request?.id,
          requested_sectors: sectors,
          email: user_email,
          reason,
        }
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Votre demande d’accès multi-secteur a été transmise au Super Administrateur. Notre équipe vous contactera pour étudier votre besoin et définir une formule adaptée.',
      requestId: request?.id,
    })

  } catch (err: any) {
    console.error('[SectorRequest] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur lors de l’envoi de votre demande.' })
  }
}
