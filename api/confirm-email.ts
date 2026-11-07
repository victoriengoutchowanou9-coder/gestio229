// =============================================================================
// GESTIO 229 SAAS — API Endpoint : GET/POST /api/confirm-email
// Validation des tokens de confirmation, activation de compte et redirection sécurisée
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { verifyConfirmationToken } from './_lib/confirmationToken.ts'

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

  // 1. Validation de l'existence du token
  if (!token) {
    if (isGet) {
      return res.redirect(302, `${appUrl}/confirm-email?error=missing_token&email=${encodeURIComponent(rawEmail)}`)
    }
    return res.status(400).json({ success: false, error: 'Token de confirmation manquant.' })
  }

  // 2. Vérification cryptographique et temporelle du token
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

  const sb = getSupabaseAdmin()
  const now = new Date()

  try {
    // 3. Récupérer le profil utilisateur et vérifier le nonce actif
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

    // Vérifier si un lien plus récent a été généré (invalidation automatique des anciens liens)
    if (currentPerms.last_confirmation_nonce && currentPerms.last_confirmation_nonce !== tokenNonce) {
      if (isGet) {
        return res.redirect(302, `${appUrl}/confirm-email?error=superseded&email=${encodeURIComponent(email)}`)
      }
      return res.status(400).json({
        success: false,
        error: 'Ce lien a été remplacé par un lien plus récent. Veuillez utiliser le dernier email reçu.',
      })
    }

    // 4. Activer le profil utilisateur
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

    // 5. Activer l'entreprise si nécessaire
    if (profile.company_id) {
      await sb
        .from('companies')
        .update({
          is_active: true,
          updated_at: now.toISOString(),
        })
        .eq('id', profile.company_id)
    }

    // 6. Confirmer également dans auth.users si Supabase Admin est disponible
    if (profile.auth_user_id && (sb.auth as any).admin?.updateUserById) {
      try {
        await (sb.auth as any).admin.updateUserById(profile.auth_user_id, {
          email_confirm: true,
        })
      } catch (authErr: any) {
        console.warn('[ConfirmEmail] Notice updateUserById:', authErr?.message)
      }
    }

    // 7. Enregistrer dans email_delivery_logs pour l'audit et la traçabilité
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

    // 8. Succès ! Redirection vers la page de connexion
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
