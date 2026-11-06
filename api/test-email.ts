// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST & GET /api/test-email
// Module autonome & résilient pour tester l'expédition d'emails réels
// Supporte : Gmail SMTP (465 SSL / 587 TLS), Resend HTTPS (443), Brevo HTTPS (443)
// 100% Autonome — Zéro dépendance orpheline — Renvoie TOUJOURS du JSON valide
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

// ─── Initialisation Supabase sécurisée ─────────────────────────────────────────
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ─── Détection du fournisseur actif ──────────────────────────────────────────
function detectActiveProvider() {
  const resendKey = (process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY || '').trim()
  if (resendKey && resendKey.startsWith('re_')) {
    return {
      provider: 'resend_api',
      label: 'Resend API (Cloud Transactionnel HTTPS Port 443)',
      isHttps: true,
      hasCredentials: true,
    }
  }

  const brevoKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
  if (brevoKey) {
    return {
      provider: 'brevo_api',
      label: 'Brevo API (Cloud Transactionnel HTTPS Port 443)',
      isHttps: true,
      hasCredentials: true,
    }
  }

  const smtpUser = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()
  const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')

  if (smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT || '465') || 465
    return {
      provider: 'smtp_gmail',
      label: `Gmail SMTP (${smtpUser} sur port ${port})`,
      isHttps: false,
      hasCredentials: true,
    }
  }

  return {
    provider: 'unconfigured',
    label: smtpUser ? `Gmail SMTP (${smtpUser} - mot de passe manquant)` : 'Aucun service email configuré',
    isHttps: false,
    hasCredentials: false,
  }
}

// ─── Diagnostic intelligent des erreurs ──────────────────────────────────────
function diagnoseError(err: any): { diagnostic: string; code: string } {
  const msg = String(err?.message || err || '')
  const code = String(err?.code || '')

  if (msg.includes('Connection closed unexpectedly') || code === 'ECONNECTION') {
    return {
      code: 'SMTP_SOCKET_CLOSED',
      diagnostic:
        "La connexion SMTP a été fermée inopinément par le serveur distant. " +
        "L'infrastructure cloud (Vercel) ou les filtres de sécurité Google restreignent les connexions TCP directes sur les ports 465/587. " +
        "SOLUTION RECOMMANDÉE : Configurez RESEND_API_KEY dans vos paramètres Vercel pour expédier via HTTPS (Port 443 garanti 100%).",
    }
  }

  if (code === 'EAUTH' || msg.includes('535') || msg.includes('BadCredentials') || msg.includes('Username and Password not accepted')) {
    return {
      code: 'AUTH_FAILED',
      diagnostic:
        "Échec d'authentification Google (Erreur 535 5.7.8). " +
        "Google exige un 'Mot de passe d'application' à 16 caractères (et non votre mot de passe habituel). " +
        "Activez la validation en 2 étapes sur votre compte Google, générez le mot de passe sur https://myaccount.google.com/apppasswords et collez-le dans SMTP_PASS sur Vercel sans espaces.",
    }
  }

  if (code === 'ETIMEDOUT' || msg.includes('timeout')) {
    return {
      code: 'SMTP_TIMEOUT',
      diagnostic:
        "Délai d'attente dépassé lors de la connexion SMTP. " +
        "Le serveur distant n'a pas répondu dans le délai imparti (10s).",
    }
  }

  return {
    code: code || 'UNKNOWN_ERROR',
    diagnostic: msg || 'Une erreur inconnue a empêché la transmission.',
  }
}

// ─── Envoi via Resend API (HTTPS Port 443) ───────────────────────────────────
async function sendWithResend(apiKey: string, fromName: string, fromEmail: string, to: string, subject: string, html: string, text: string) {
  let sender = `${fromName} <${fromEmail}>`
  if (fromEmail.includes('@gmail.com') || fromEmail.includes('@yahoo.') || fromEmail.includes('@hotmail.')) {
    sender = `${fromName} <onboarding@resend.dev>`
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: sender,
      to: [to],
      reply_to: fromEmail,
      subject,
      html,
      text,
    }),
  })

  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || data.message || `Erreur Resend HTTP ${res.status}`)
  }
  return { messageId: data.id, provider: 'Resend API (HTTPS Port 443)' }
}

// ─── Envoi via Brevo API (HTTPS Port 443) ────────────────────────────────────
async function sendWithBrevo(apiKey: string, fromName: string, fromEmail: string, to: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  })

  const data = await res.json()
  if (!res.ok || data.code) {
    throw new Error(data.message || `Erreur Brevo HTTP ${res.status}`)
  }
  return { messageId: data.messageId || data.id, provider: 'Brevo API (HTTPS Port 443)' }
}

// ─── Envoi via Nodemailer Gmail SMTP (465 SSL puis 587 STARTTLS) ─────────────
async function sendWithSmtp(fromHeader: string, to: string, subject: string, html: string, text: string) {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim()
  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')

  let lastError: any = null

  // Tentative 1 : Port 465 (SSL direct)
  try {
    const transporter465 = nodemailer.createTransport({
      host,
      port: 465,
      secure: true,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })

    const info = await transporter465.sendMail({
      from: fromHeader,
      to,
      subject,
      html,
      text,
    })

    return { messageId: info.messageId, provider: 'Gmail SMTP (Port 465 SSL)' }
  } catch (err465: any) {
    lastError = err465
    console.warn('[test-email] Port 465 SSL échoué, repli vers Port 587 TLS...', err465?.message)
  }

  // Tentative 2 : Port 587 (STARTTLS)
  try {
    const transporter587 = nodemailer.createTransport({
      host,
      port: 587,
      secure: false,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })

    const info = await transporter587.sendMail({
      from: fromHeader,
      to,
      subject,
      html,
      text,
    })

    return { messageId: info.messageId, provider: 'Gmail SMTP (Port 587 TLS)' }
  } catch (err587: any) {
    lastError = err587
    console.error('[test-email] Port 587 TLS échoué également :', err587?.message)
  }

  throw lastError || new Error('Impossible d\'établir la connexion SMTP avec Gmail.')
}

// ─── Handler Principal Vercel ────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // En-têtes HTTP sécurisés et CORS dès le premier octet
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  } catch (_) {}

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const providerInfo = detectActiveProvider()

    // Requête GET : statut du service sans expédition
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        provider: providerInfo.provider,
        label: providerInfo.label,
        isHttps: providerInfo.isHttps,
        hasCredentials: providerInfo.hasCredentials,
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Méthode non autorisée. Utilisez POST ou GET.',
      })
    }

    const { testEmail } = req.body || {}
    const defaultRecipient = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou2024@gmail.com').trim()
    const targetEmail = (testEmail || defaultRecipient).trim()

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Adresse email de test invalide. Veuillez renseigner un email valide (ex: direction@gestio229.com).',
      })
    }

    // Vérifier si des identifiants existent
    if (!providerInfo.hasCredentials) {
      return res.status(200).json({
        success: false,
        error: 'Aucun secret email configuré sur le serveur.',
        diagnostic:
          'Pour activer les envois réels de rapports de caisse :\n' +
          '1. Rendez-vous dans votre tableau de bord Vercel > Settings > Environment Variables.\n' +
          '2. Ajoutez SMTP_PASS (mot de passe d\'application Google à 16 caractères généré sur https://myaccount.google.com/apppasswords) OU ajoutez RESEND_API_KEY (clé gratuite sur https://resend.com).\n' +
          '3. Redéployez votre application.',
        providerLabel: providerInfo.label,
      })
    }

    const nowStr = new Date().toLocaleString('fr-BJ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const fromName = (process.env.SMTP_FROM_NAME || 'GESTIO 229').trim()
    const fromEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'victoriengoutchowanou2024@gmail.com').trim()
    const fromHeader = `"${fromName}" <${fromEmail}>`
    const subject = `🧪 Test de Connexion Email — GESTIO 229 (${nowStr})`

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #064e3b; margin: 0; padding: 32px 16px; color: #ffffff;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; color: #1e293b; box-shadow: 0 16px 36px rgba(0,0,0,0.4);">
    <div style="background: linear-gradient(135deg, #059669 0%, #064e3b 100%); color: #ffffff; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 900;">GESTIO 229 • Transmission Réussie</h1>
      <p style="margin: 6px 0 0; font-size: 13px; color: #d1fae5;">Service d'acheminement des rapports de caisse</p>
    </div>
    <div style="padding: 28px; font-size: 14px; line-height: 1.6;">
      <p style="font-size: 15px; margin-top: 0;">Bonjour,</p>
      <p>Ce message confirme que votre canal d'envoi d'emails transactionnels est <strong>actif et opérationnel</strong>.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Canal :</strong> ${providerInfo.label}</p>
        <p style="margin: 4px 0;"><strong>Destinataire :</strong> ${targetEmail}</p>
        <p style="margin: 4px 0;"><strong>Date &amp; Heure :</strong> ${nowStr}</p>
      </div>
      <p style="color: #059669; font-weight: 700;">✅ Lors de chaque fermeture de caisse, le rapport PDF officiel sera transmis automatiquement à vos destinataires enregistrés.</p>
    </div>
    <div style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b;">
      GESTIO 229 ERP • STANDARD DU BÉNIN • <a href="https://www.gestio229.com" style="color: #059669; font-weight: bold;">www.gestio229.com</a>
    </div>
  </div>
</body>
</html>
    `.trim()

    const text = `Test de connexion email GESTIO 229 réussi à ${nowStr} pour ${targetEmail}. Canal: ${providerInfo.label}`

    // ─── Acheminement selon le fournisseur configuré ─────────────────────────
    let sendResult: { messageId?: string; provider: string }

    const resendKey = (process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY || '').trim()
    const brevoKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()

    if (resendKey && resendKey.startsWith('re_')) {
      sendResult = await sendWithResend(resendKey, fromName, fromEmail, targetEmail, subject, html, text)
    } else if (brevoKey) {
      sendResult = await sendWithBrevo(brevoKey, fromName, fromEmail, targetEmail, subject, html, text)
    } else {
      sendResult = await sendWithSmtp(fromHeader, targetEmail, subject, html, text)
    }

    // Journalisation Supabase
    try {
      const sb = getSupabaseClient()
      await sb.from('email_delivery_logs').insert({
        recipient_email: targetEmail,
        email_type: 'test_email',
        status: 'envoye',
        provider: sendResult.provider,
        subject,
        metadata: {
          test: true,
          messageId: sendResult.messageId,
          sent_at: new Date().toISOString(),
        },
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Email de test transmis avec succès à ${targetEmail} !`,
      provider: sendResult.provider,
      providerLabel: sendResult.provider,
      messageId: sendResult.messageId,
      targetEmail,
    })
  } catch (err: any) {
    console.error('[test-email] Erreur transmission :', err)
    const diag = diagnoseError(err)

    // Journalisation de l'échec dans Supabase
    try {
      const sb = getSupabaseClient()
      await sb.from('email_delivery_logs').insert({
        recipient_email: (req.body?.testEmail || 'unknown').trim(),
        email_type: 'test_email',
        status: 'echec',
        provider: 'smtp_gmail',
        subject: 'Test email failed',
        error_message: err?.message || String(err),
        metadata: { error: err?.message, code: diag.code },
      })
    } catch (_) {}

    return res.status(200).json({
      success: false,
      error: err?.message || 'Erreur lors de la transmission du message.',
      diagnostic: diag.diagnostic,
      code: diag.code,
      providerLabel: detectActiveProvider().label,
    })
  }
}
