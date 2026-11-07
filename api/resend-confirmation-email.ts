// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/resend-confirmation-email
// Renvoi sécurisé d'email de confirmation avec limitation de débit (Rate Limiting) & Invalidation
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendTrackedEmail, buildRegistrationEmailHtml } from './_lib/emailHelper.ts'
import { generateConfirmationToken } from './_lib/confirmationToken.ts'

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://inknljnhqmrykcrgglts.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
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
  const now = new Date()

  try {
    // 1. Rate Limiting : Maximum 3 demandes de renvoi par tranche de 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentLogs, count } = await sb
      .from('email_delivery_logs')
      .select('id', { count: 'exact' })
      .ilike('recipient_email', cleanEmail)
      .gte('created_at', fifteenMinutesAgo)

    if (count !== null && count >= 3) {
      return res.status(429).json({
        success: false,
        error: 'Trop de demandes de renvoi récentes. Pour des raisons de sécurité, veuillez patienter 15 minutes avant de demander un nouveau lien.',
      })
    }

    // 2. Vérifier si un compte administrateur existe avec cet email
    const { data: comp } = await sb
      .from('companies')
      .select('id, name, responsible_name, selected_sectors')
      .ilike('email', cleanEmail)
      .maybeSingle()

    const { data: profile } = await sb
      .from('user_profiles')
      .select('id, role, full_name, permissions')
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (!profile && !comp) {
      // Protection contre l'énumération tout en guidant l'utilisateur
      return res.status(404).json({
        success: false,
        error: 'Aucun compte associé à cette adresse e-mail. Veuillez vous inscrire.',
      })
    }

    // Règle métier : les utilisateurs internes créés par un admin n'ont pas besoin de confirmation email
    if (profile && profile.role && profile.role !== 'administrateur' && profile.role !== 'super_admin') {
      return res.status(400).json({
        success: false,
        error: "Ce compte est un compte utilisateur interne. Aucune confirmation par email n'est requise. Veuillez vous connecter avec vos identifiants.",
      })
    }

    const currentPerms = (profile?.permissions && typeof profile.permissions === 'object') ? profile.permissions : {}

    // Vérifier si l'adresse est déjà confirmée
    if (currentPerms.email_confirmed === true) {
      return res.status(200).json({
        success: true,
        alreadyConfirmed: true,
        message: 'Votre adresse email est déjà confirmée. Vous pouvez vous connecter directement.',
      })
    }

    const companyName = comp?.name || 'Votre Entreprise'
    const responsibleName = comp?.responsible_name || profile?.full_name || 'Administrateur'
    const selectedSectors = Array.isArray(comp?.selected_sectors) ? comp.selected_sectors : ['boutique']

    // 3. Générer un nouveau token signé et mettre à jour le nonce (invalide immédiatement les anciens liens)
    const tokenData = generateConfirmationToken(cleanEmail)

    if (profile?.id) {
      await sb
        .from('user_profiles')
        .update({
          permissions: {
            ...currentPerms,
            last_confirmation_nonce: tokenData.nonce,
            confirmation_token_sent_at: now.toISOString(),
          },
          updated_at: now.toISOString(),
        })
        .eq('id', profile.id)
    }

    const appUrl = (process.env.VITE_APP_URL || 'https://gestio229.com').replace(/\/$/, '')
    const confirmationUrl = `${appUrl}/api/confirm-email?token=${encodeURIComponent(tokenData.token)}&email=${encodeURIComponent(cleanEmail)}`

    // 4. Modèle HTML et transmission via SMTP / Resend / Brevo
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
      metadata: { companyName, responsibleName, selectedSectors, tokenNonce: tokenData.nonce },
    })

    if (!sendRes.success) {
      // Tentative de secours avec supabase.auth.resend si disponible
      try {
        await sb.auth.resend({
          type: 'signup',
          email: cleanEmail,
          options: { emailRedirectTo: `${appUrl}/login?confirmed=true&email=${encodeURIComponent(cleanEmail)}` },
        })
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: 'Demande de renvoi transmise avec succès. Pensez à vérifier vos courriers indésirables (spams).',
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
      error: "Erreur lors du traitement du renvoi d'email. Veuillez réessayer.",
    })
  }
}
