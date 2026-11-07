// =============================================================================
// GESTIO 229 SAAS — API Endpoint : GET/POST /api/confirm-email
// Gestion complète du cycle de vie de confirmation email :
// 1. Validation de jeton cryptographique HMAC & Activation de compte (GET / POST)
// 2. Renvoi sécurisé d'e-mail avec limitation de débit (POST sans token ou action=resend)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendTrackedEmail, buildRegistrationEmailHtml } from './_lib/emailHelper.ts'
import { generateConfirmationToken, verifyConfirmationToken } from './_lib/confirmationToken.ts'

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

  const isGet = req.method === 'GET'
  const isPost = req.method === 'POST'

  if (!isGet && !isPost) {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez GET ou POST.' })
  }

  const appUrl = (process.env.VITE_APP_URL || 'https://gestio229.com').replace(/\/$/, '')
  const query = req.query || {}
  const body = req.body || {}

  const token = String(query.token || body.token || '').trim()
  const rawEmail = String(query.email || body.email || '').trim().toLowerCase()
  const isResendAction = String(query.action || body.action || '').trim() === 'resend' || (!token && Boolean(rawEmail))

  const sb = getSupabaseAdmin()
  const now = new Date()

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS A : RENVOI D'EMAIL DE CONFIRMATION (Rate Limiting + Invalidation)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isResendAction) {
    const clientIp = String(
      req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
    ).split(',')[0].trim()

    if (!rawEmail || !rawEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse email valide obligatoire.' })
    }

    try {
      // 1. Rate Limiting : Maximum 3 demandes de renvoi par tranche de 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { count } = await sb
        .from('email_delivery_logs')
        .select('id', { count: 'exact' })
        .ilike('recipient_email', rawEmail)
        .gte('created_at', fifteenMinutesAgo)

      if (count !== null && count >= 3) {
        return res.status(429).json({
          success: false,
          error: 'Trop de demandes de renvoi récentes. Pour des raisons de sécurité, veuillez patienter 15 minutes avant de demander un nouveau lien.',
        })
      }

      // 2. Vérifier si un compte existe avec cet email
      const { data: comp } = await sb
        .from('companies')
        .select('id, name, responsible_name, selected_sectors')
        .ilike('email', rawEmail)
        .maybeSingle()

      const { data: profile } = await sb
        .from('user_profiles')
        .select('id, role, full_name, permissions')
        .ilike('email', rawEmail)
        .maybeSingle()

      if (!profile && !comp) {
        return res.status(404).json({
          success: false,
          error: 'Aucun compte associé à cette adresse e-mail. Veuillez vous inscrire.',
        })
      }

      // Les utilisateurs internes créés par l'admin n'ont pas besoin de confirmation email
      if (profile && profile.role && profile.role !== 'administrateur' && profile.role !== 'super_admin') {
        return res.status(400).json({
          success: false,
          error: "Ce compte est un compte utilisateur interne. Aucune confirmation par email n'est requise. Veuillez vous connecter avec vos identifiants.",
        })
      }

      const currentPerms = (profile?.permissions && typeof profile.permissions === 'object') ? profile.permissions : {}

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
      const tokenData = generateConfirmationToken(rawEmail)

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

      const confirmationUrl = `${appUrl}/api/confirm-email?token=${encodeURIComponent(tokenData.token)}&email=${encodeURIComponent(rawEmail)}`

      // 4. Modèle HTML et transmission multi-transporteurs
      const html = buildRegistrationEmailHtml({
        responsibleName,
        companyName,
        confirmationUrl,
        selectedSectors,
      })

      const sendRes = await sendTrackedEmail({
        to: rawEmail,
        subject: '🔑 Confirmez votre adresse email — GESTIO 229 ERP',
        html,
        emailType: 'resend_confirmation',
        clientIp,
        metadata: { companyName, responsibleName, selectedSectors, tokenNonce: tokenData.nonce },
      })

      if (!sendRes.success) {
        try {
          await sb.auth.resend({
            type: 'signup',
            email: rawEmail,
            options: { emailRedirectTo: `${appUrl}/login?confirmed=true&email=${encodeURIComponent(rawEmail)}` },
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
      console.error('[ConfirmEmail/Resend] Erreur serveur:', err)
      return res.status(500).json({
        success: false,
        error: "Erreur lors du traitement du renvoi d'email. Veuillez réessayer.",
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS B : VALIDATION DU JETON & ACTIVATION DU COMPTE
  // ═══════════════════════════════════════════════════════════════════════════
  if (!token) {
    if (isGet) {
      return res.redirect(302, `${appUrl}/confirm-email?error=missing_token&email=${encodeURIComponent(rawEmail)}`)
    }
    return res.status(400).json({ success: false, error: 'Token de confirmation manquant.' })
  }

  // Vérification cryptographique et temporelle du token
  const tokenResult = verifyConfirmationToken(token)

  if (!tokenResult.valid || !tokenResult.payload) {
    const targetEmail = tokenResult.payload?.email || rawEmail
    const errorCode = tokenResult.expired ? 'expired' : 'invalid'
    if (isGet) {
      return res.redirect(302, `${appUrl}/confirm-email?error=${errorCode}&email=${encodeURIComponent(targetEmail)}`)
    }
    return res.status(400).json({
      success: false,
      error: tokenResult.error || 'Token de confirmation invalide ou expiré.',
      expired: Boolean(tokenResult.expired),
    })
  }

  const email = tokenResult.payload.email
  const tokenNonce = tokenResult.payload.nonce

  try {
    const { data: profile, error: profError } = await sb
      .from('user_profiles')
      .select('id, company_id, auth_user_id, role, permissions, is_active')
      .ilike('email', email)
      .maybeSingle()

    if (profError || !profile) {
      if (isGet) {
        return res.redirect(302, `${appUrl}/confirm-email?error=not_found&email=${encodeURIComponent(email)}`)
      }
      return res.status(404).json({ success: false, error: 'Compte introuvable pour cette adresse email.' })
    }

    const currentPerms = (profile.permissions && typeof profile.permissions === 'object') ? profile.permissions : {}

    // Vérifier si un lien plus récent a été généré
    if (currentPerms.last_confirmation_nonce && currentPerms.last_confirmation_nonce !== tokenNonce) {
      if (isGet) {
        return res.redirect(302, `${appUrl}/confirm-email?error=superseded&email=${encodeURIComponent(email)}`)
      }
      return res.status(400).json({
        success: false,
        error: 'Ce lien a été remplacé par un lien plus récent. Veuillez utiliser le dernier email reçu.',
      })
    }

    // Activer le profil utilisateur
    const updatedPermissions = {
      ...currentPerms,
      email_confirmed: true,
      email_confirmed_at: now.toISOString(),
      confirmed_nonce: tokenNonce,
    }

    await sb
      .from('user_profiles')
      .update({
        permissions: updatedPermissions,
        is_active: true,
        updated_at: now.toISOString(),
      })
      .eq('id', profile.id)

    // Activer l'entreprise si nécessaire
    if (profile.company_id) {
      await sb
        .from('companies')
        .update({
          is_active: true,
          updated_at: now.toISOString(),
        })
        .eq('id', profile.company_id)
    }

    // Confirmer dans auth.users si Supabase Admin est disponible
    if (profile.auth_user_id && (sb.auth as any).admin?.updateUserById) {
      try {
        await (sb.auth as any).admin.updateUserById(profile.auth_user_id, {
          email_confirm: true,
        })
      } catch (authErr: any) {
        console.warn('[ConfirmEmail] Notice updateUserById:', authErr?.message)
      }
    }

    // Journalisation d'audit
    try {
      await sb.from('email_delivery_logs').insert({
        recipient_email: email,
        email_type: 'signup_confirmation',
        status: 'confirmed',
        provider: 'resend_api',
        subject: 'Confirmation de compte validée avec succès',
        error_message: null,
        metadata: {
          token_nonce: tokenNonce,
          confirmed_at: now.toISOString(),
          company_id: profile.company_id,
        },
        created_at: now.toISOString(),
      })
    } catch (_) {}

    if (isGet) {
      return res.redirect(302, `${appUrl}/login?confirmed=true&email=${encodeURIComponent(email)}`)
    }

    return res.status(200).json({
      success: true,
      message: 'Votre adresse email a été confirmée avec succès. Vous pouvez maintenant vous connecter.',
      email,
    })
  } catch (err: any) {
    console.error('[ConfirmEmail] Erreur serveur:', err)
    if (isGet) {
      return res.redirect(302, `${appUrl}/confirm-email?error=server_error&email=${encodeURIComponent(email)}`)
    }
    return res.status(500).json({
      success: false,
      error: 'Une erreur est survenue lors de la confirmation de votre adresse email.',
    })
  }
}
