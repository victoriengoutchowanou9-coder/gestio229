// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/resend-confirmation-email
// Renvoi sécurisé d'email de confirmation avec journalisation d'audit
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendTrackedEmail, buildRegistrationEmailHtml } from './emailHelper'

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const clientIp = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim()

  const { email } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ success: false, error: 'Adresse email valide obligatoire.' })
  }

  const sb = getSupabaseAdmin()

  try {
    // 1. Vérifier si un compte administrateur existe avec cet email
    const { data: comp } = await sb
      .from('companies')
      .select('id, name, responsible_name, selected_sectors')
      .ilike('email', cleanEmail)
      .maybeSingle()

    const { data: profile } = await sb
      .from('user_profiles')
      .select('id, role, full_name, email_confirmed_at')
      .ilike('email', cleanEmail)
      .maybeSingle()

    // Règle métier : les utilisateurs internes créés par un admin n'ont pas besoin de confirmation email
    if (profile && profile.role && profile.role !== 'administrateur' && profile.role !== 'super_admin') {
      return res.status(400).json({
        success: false,
        error: 'Ce compte est un compte utilisateur interne. Aucune confirmation par email n\'est requise. Veuillez vous connecter avec vos identifiants.',
      })
    }

    const companyName = comp?.name || 'Votre Entreprise'
    const responsibleName = comp?.responsible_name || profile?.full_name || 'Administrateur'
    const selectedSectors = Array.isArray(comp?.selected_sectors) ? comp.selected_sectors : ['boutique']

    const appUrl = (process.env.VITE_APP_URL || 'https://gestio229.com').replace(/\/$/, '')
    const redirectTo = `${appUrl}/login?confirmed=true&email=${encodeURIComponent(cleanEmail)}`

    // 2. Générer le lien de confirmation sécurisé via Supabase Admin
    let confirmationUrl = `${appUrl}/login?confirmed=true&email=${encodeURIComponent(cleanEmail)}`

    try {
      if ((sb.auth as any).admin?.generateLink) {
        const { data: linkData, error: linkErr } = await (sb.auth as any).admin.generateLink({
          type: 'signup',
          email: cleanEmail,
          options: { redirectTo },
        })

        if (!linkErr && linkData?.properties?.action_link) {
          confirmationUrl = linkData.properties.action_link
        }
      }
    } catch (genErr: any) {
      console.warn('[ResendEmail] Notice generateLink:', genErr?.message)
    }

    // 3. Modèle HTML et transmission via SMTP
    const html = buildRegistrationEmailHtml({
      responsibleName,
      companyName,
      confirmationUrl,
      selectedSectors,
    })

    const sendRes = await sendTrackedEmail({
      to: cleanEmail,
      subject: '🔑 Confirmez votre adresse email — GESTIO 229 ERP',
      html,
      emailType: 'resend_confirmation',
      clientIp,
      metadata: { companyName, responsibleName, selectedSectors },
    })

    if (!sendRes.success) {
      // Tentative de secours avec supabase.auth.resend si le SMTP direct n'a pas répondu
      try {
        await sb.auth.resend({
          type: 'signup',
          email: cleanEmail,
          options: { emailRedirectTo: redirectTo },
        })
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: 'Demande de renvoi transmise avec succès. Pensez à vérifier vos spams.',
        warning: sendRes.error,
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Un nouvel email de confirmation vous a été envoyé. Pensez à vérifier vos courriers indésirables (spams).',
      logId: sendRes.logId,
    })
  } catch (err: any) {
    console.error('[ResendEmail] Erreur serveur:', err)
    return res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du renvoi d\'email. Veuillez réessayer.',
    })
  }
}
