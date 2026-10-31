// =============================================================================
// GESTIO 229 SAAS — Module Central d'Envoi d'Emails & Journalisation (Audit)
// =============================================================================

import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export interface EmailSendOptions {
  to: string
  subject: string
  html: string
  text?: string
  emailType: 'signup_confirmation' | 'resend_confirmation' | 'test_email' | 'alert'
  clientIp?: string
  metadata?: Record<string, any>
}

export interface EmailSendResult {
  success: boolean
  provider: string
  messageId?: string
  error?: string
  logId?: string
}

function getSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Crée un transporteur Nodemailer résilient.
 * Tente d'abord le port 465 (SSL direct), puis le service 'gmail', puis le port 587 (STARTTLS).
 */
export function createResilientTransporter(portOverride?: number, secureOverride?: boolean) {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim()
  const port = portOverride ?? (Number((process.env.SMTP_PORT || '465').trim()) || 465)
  const secure = secureOverride ?? (port === 465)
  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou2024@gmail.com').trim()
  const pass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')

  if (!pass) {
    throw new Error('SMTP_PASS non configuré dans les variables d\'environnement.')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
}

/**
 * Envoie un email avec traçabilité complète dans email_delivery_logs.
 * Statuts possibles : 'demande' -> 'envoye' ou 'echec' / 'refuse'
 */
export async function sendTrackedEmail(options: EmailSendOptions): Promise<EmailSendResult> {
  const sb = getSupabaseClient()
  const fromName = (process.env.SMTP_FROM_NAME || 'GESTIO 229 ERP').trim()
  const fromEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'victoriengoutchowanou2024@gmail.com').trim()
  const fromHeader = `"${fromName}" <${fromEmail}>`

  let logId: string | undefined

  // 1. Journalisation initiale : Demande d'envoi enregistrée
  try {
    const { data: logRow } = await sb.from('email_delivery_logs').insert({
      recipient_email: options.to.trim().toLowerCase(),
      email_type: options.emailType,
      status: 'demande',
      provider: 'smtp_gmail',
      subject: options.subject,
      ip_address: options.clientIp || null,
      metadata: options.metadata || {},
    }).select('id').maybeSingle()

    logId = logRow?.id
  } catch (err: any) {
    console.warn('[EmailHelper] Impossible de créer le log initial :', err?.message)
  }

  // 2. Vérification des identifiants SMTP
  const pass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')
  if (!pass) {
    const errMsg = 'Configuration SMTP incomplète : SMTP_PASS manquante.'
    if (logId) {
      await sb.from('email_delivery_logs').update({
        status: 'refuse',
        error_message: errMsg,
      }).eq('id', logId).catch(() => {})
    }
    return { success: false, provider: 'smtp_gmail', error: errMsg, logId }
  }

  // 3. Tentative d'envoi avec repli automatique (465 SSL -> 587 TLS)
  let lastError: any = null
  let info: any = null

  // Tentative A : Port 465 (SSL direct, standard recommandé cloud)
  try {
    const transporter465 = createResilientTransporter(465, true)
    info = await transporter465.sendMail({
      from: fromHeader,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]+>/g, ' '),
    })
  } catch (errA: any) {
    lastError = errA
    console.warn('[EmailHelper] Échec port 465, bascule vers port 587...', errA?.message)

    // Tentative B : Port 587 (STARTTLS)
    try {
      const transporter587 = createResilientTransporter(587, false)
      info = await transporter587.sendMail({
        from: fromHeader,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]+>/g, ' '),
      })
      lastError = null
    } catch (errB: any) {
      lastError = errB
      console.error('[EmailHelper] Échec port 587 également :', errB?.message)
    }
  }

  // 4. Mise à jour du journal d'audit selon le résultat réel
  if (info && (info.accepted?.length > 0 || info.messageId)) {
    if (logId) {
      await sb.from('email_delivery_logs').update({
        status: 'envoye',
        metadata: {
          ...(options.metadata || {}),
          messageId: info.messageId,
          response: info.response,
          accepted: info.accepted,
        },
      }).eq('id', logId).catch(() => {})
    }
    return {
      success: true,
      provider: 'smtp_gmail',
      messageId: info.messageId,
      logId,
    }
  } else {
    const errMsg = lastError?.message || 'Le fournisseur SMTP a rejeté la transmission.'
    if (logId) {
      await sb.from('email_delivery_logs').update({
        status: 'echec',
        error_message: errMsg,
      }).eq('id', logId).catch(() => {})
    }
    return {
      success: false,
      provider: 'smtp_gmail',
      error: errMsg,
      logId,
    }
  }
}

/**
 * Modèle HTML de l'email de confirmation d'inscription GESTIO 229
 */
export function buildRegistrationEmailHtml(params: {
  responsibleName: string
  companyName: string
  confirmationUrl: string
  selectedSectors: string[]
}) {
  const { responsibleName, companyName, confirmationUrl, selectedSectors } = params
  const sectorsListHtml = selectedSectors.map((s) => `<li style="padding: 4px 0; color: #1e293b;">• <strong>${s.toUpperCase()}</strong></li>`).join('')

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Confirmez votre inscription à GESTIO 229 ERP</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
          <!-- En-tête -->
          <tr style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
            <td style="padding: 32px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">GESTIO 229 ERP</h1>
              <p style="color: #d1fae5; margin: 8px 0 0 0; font-size: 14px;">Plateforme de Gestion Intégrée Multi-Activités</p>
            </td>
          </tr>

          <!-- Contenu Principal -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Bonjour ${responsibleName || 'Cher Partenaire'},</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                Nous sommes ravis d'accueillir votre entreprise <strong>${companyName}</strong> sur <strong>GESTIO 229</strong>.
              </p>
              <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                Pour activer définitivement votre compte administrateur et accéder à votre <strong>HUB Central</strong>, veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :
              </p>

              <!-- Bouton d'action -->
              <div style="text-align: center; margin: 36px 0;">
                <a href="${confirmationUrl}" style="background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: bold; display: inline-block; box-shadow: 0 4px 8px rgba(5, 150, 105, 0.25);">
                  ✅ Confirmer mon adresse email
                </a>
              </div>

              <!-- Bloc Détails -->
              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold; color: #334155;">Secteurs sélectionnés (${selectedSectors.length}) :</p>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px;">
                  ${sectorsListHtml}
                </ul>
                <p style="margin: 12px 0 0 0; font-size: 12px; color: #64748b;">
                  🎁 <em>Votre période d'essai gratuit de 30 jours (pour un maximum de 3 secteurs) débutera dès l'activation de votre compte.</em>
                </p>
              </div>

              <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin-top: 30px;">
                Si le bouton ne fonctionne pas, copiez et collez le lien suivant dans votre navigateur :<br>
                <a href="${confirmationUrl}" style="color: #059669; word-break: break-all;">${confirmationUrl}</a>
              </p>

              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

              <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
                Ce message a été envoyé automatiquement suite à votre inscription sur <strong>gestio229.com</strong>. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.
              </p>
            </td>
          </tr>

          <!-- Pied de page -->
          <tr style="background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
            <td style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
              © ${new Date().getFullYear()} GESTIO 229 ERP — République du Bénin & Espace UEMOA.<br>
              Support d'assistance : <a href="mailto:support@gestio229.com" style="color: #059669;">support@gestio229.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}
