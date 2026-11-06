// =============================================================================
// GESTIO 229 SAAS — Module Universel d'Envoi d'Emails & Journalisation (Audit)
// Architecture multi-fournisseurs : Resend API (HTTPS), Brevo API (HTTPS), Gmail SMTP (465/587)
// Résistant aux restrictions d'hébergeurs cloud (Vercel, Supabase Edge, AWS Lambda)
// =============================================================================

import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export interface EmailAttachment {
  filename: string
  content: Buffer | string // Buffer ou Base64
  contentType?: string
}

export interface EmailSendOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  emailType: 'cash_report' | 'signup_confirmation' | 'resend_confirmation' | 'test_email' | 'alert'
  clientIp?: string
  metadata?: Record<string, any>
  attachments?: EmailAttachment[]
}

export interface EmailSendResult {
  success: boolean
  provider: 'resend_api' | 'brevo_api' | 'smtp_gmail_465' | 'smtp_gmail_587' | 'none'
  providerLabel: string
  messageId?: string
  error?: string
  diagnostic?: string
  logId?: string
  recipients?: string[]
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Détecte les identifiants et les clés de service disponibles côté serveur.
 * Ne retourne JAMAIS les valeurs secrètes pour garantir la sécurité.
 */
export function getActiveEmailProviderInfo(): {
  provider: 'resend_api' | 'brevo_api' | 'smtp_gmail' | 'unconfigured'
  label: string
  details: string
  isHttps: boolean
} {
  const resendKey = (process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY || '').trim()
  if (resendKey && resendKey.startsWith('re_')) {
    return {
      provider: 'resend_api',
      label: 'Resend API (Transactionnel HTTPS)',
      details: 'Port HTTPS 443 — Transit garanti 100% sans restriction socket',
      isHttps: true,
    }
  }

  const brevoKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
  if (brevoKey) {
    return {
      provider: 'brevo_api',
      label: 'Brevo API (Transactionnel HTTPS)',
      details: 'Port HTTPS 443 — Transit garanti 100% via API REST',
      isHttps: true,
    }
  }

  const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')
  const smtpUser = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()
  if (smtpPass && smtpUser) {
    const port = Number(process.env.SMTP_PORT || '587') || 587
    return {
      provider: 'smtp_gmail',
      label: `Gmail SMTP (${smtpUser} sur port ${port})`,
      details: 'Protocole SMTP TCP direct (Nodemailer)',
      isHttps: false,
    }
  }

  return {
    provider: 'unconfigured',
    label: 'Aucun service email configuré',
    details: 'Veuillez configurer RESEND_API_KEY (recommandé) ou SMTP_PASS dans Vercel.',
    isHttps: false,
  }
}

/**
 * Analyse technique approfondie des erreurs d'envoi pour guider l'administrateur
 */
export function diagnoseEmailError(err: any): { diagnostic: string; code: string } {
  const rawMsg = String(err?.message || err || '')
  const code = String(err?.code || '')

  if (rawMsg.includes('Connection closed unexpectedly') || code === 'ECONNECTION') {
    return {
      code: 'SMTP_SOCKET_CLOSED',
      diagnostic:
        "La connexion SMTP directe a été interrompue inopinément (Connection closed unexpectedly). " +
        "L'infrastructure cloud (Vercel / AWS Lambda) ou les filtres anti-abus de Google bloquent les connexions TCP SMTP sortantes sur les ports 587/465. " +
        "SOLUTION RECOMMANDÉE : Utilisez l'API transactionnelle HTTPS (définissez la variable RESEND_API_KEY dans vos paramètres Vercel). " +
        "Le protocole HTTPS (Port 443) n'est jamais bloqué par l'hébergeur.",
    }
  }

  if (
    code === 'EAUTH' ||
    rawMsg.includes('535') ||
    rawMsg.includes('BadCredentials') ||
    rawMsg.includes('Invalid login') ||
    rawMsg.includes('Username and Password not accepted')
  ) {
    return {
      code: 'AUTH_FAILED',
      diagnostic:
        "Échec d'authentification Google (Erreur 535 5.7.8). " +
        "Google n'accepte plus les mots de passe standards. " +
        "Vous devez activer la validation en 2 étapes sur votre compte Google et générer un 'Mot de passe d'application' à 16 caractères sur https://myaccount.google.com/apppasswords, " +
        "puis le renseigner dans la variable SMTP_PASS de Vercel sans espaces.",
    }
  }

  if (code === 'ETIMEDOUT' || rawMsg.includes('timeout') || rawMsg.includes('Greeting never received')) {
    return {
      code: 'SMTP_TIMEOUT',
      diagnostic:
        "Délai d'attente dépassé (ETIMEDOUT) lors de la poignée de main SMTP. " +
        "Le port SMTP distant est inaccessible depuis l'adresse IP du serveur d'hébergement. " +
        "Recommandation : Activez RESEND_API_KEY pour contourner les pare-feux réseau.",
    }
  }

  return {
    code: code || 'UNKNOWN_ERROR',
    diagnostic: rawMsg || 'Une erreur imprévue a empêché la transmission du message.',
  }
}

/**
 * Envoi direct via Resend API (HTTPS Port 443 — Standard Cloud Moderne)
 */
async function sendViaResend(
  apiKey: string,
  fromName: string,
  fromEmail: string,
  recipients: string[],
  options: EmailSendOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Adapter l'expéditeur selon le domaine validé ou le fallback sécurisé
    let senderAddress = `${fromName} <${fromEmail}>`
    if (fromEmail.includes('@gmail.com') || fromEmail.includes('@yahoo.') || fromEmail.includes('@hotmail.')) {
      // Les API transactionnelles requièrent un domaine ou le fallback officiel
      senderAddress = `${fromName} <onboarding@resend.dev>`
    }

    const payload: any = {
      from: senderAddress,
      to: recipients,
      reply_to: fromEmail,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]+>/g, ' '),
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map((att) => ({
        filename: att.filename,
        content: typeof att.content === 'string' ? att.content : Buffer.from(att.content).toString('base64'),
      }))
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || data.message || `Erreur Resend HTTP ${res.status}`
      return { success: false, error: errMsg }
    }

    return { success: true, messageId: data.id }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur réseau appel API Resend' }
  }
}

/**
 * Envoi direct via Brevo API (HTTPS Port 443)
 */
async function sendViaBrevo(
  apiKey: string,
  fromName: string,
  fromEmail: string,
  recipients: string[],
  options: EmailSendOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const payload: any = {
      sender: { name: fromName, email: fromEmail },
      to: recipients.map((email) => ({ email })),
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text || options.html.replace(/<[^>]+>/g, ' '),
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachment = options.attachments.map((att) => ({
        name: att.filename,
        content: typeof att.content === 'string' ? att.content : Buffer.from(att.content).toString('base64'),
      }))
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok || data.code) {
      const errMsg = data.message || `Erreur Brevo HTTP ${res.status}`
      return { success: false, error: errMsg }
    }

    return { success: true, messageId: data.messageId || data.id }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur réseau appel API Brevo' }
  }
}

/**
 * Crée un transporteur Nodemailer résilient avec timeouts stricts
 */
function createSmtpTransporter(port: number, secure: boolean) {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim()
  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  })
}

export const createResilientTransporter = createSmtpTransporter

/**
 * Envoie un email avec traçabilité complète et cascade de secours intelligente :
 * 1. Resend API (HTTPS Port 443 — Priorité 1 si configuré)
 * 2. Brevo API (HTTPS Port 443 — Priorité 2 si configuré)
 * 3. Gmail SMTP selon le port configuré (587 STARTTLS ou 465 SSL — Priorité par défaut)
 * 4. Repli automatique vers l'autre port SMTP en cas de fermeture de socket
 */
export async function sendTrackedEmail(options: EmailSendOptions): Promise<EmailSendResult> {
  const sb = getSupabaseClient()
  const fromName = (process.env.SMTP_FROM_NAME || 'GESTIO 229').trim()
  const fromEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'victoriengoutchowanou2024@gmail.com').trim()
  const fromHeader = `"${fromName}" <${fromEmail}>`

  // Nettoyer la liste des destinataires
  const rawList = Array.isArray(options.to) ? options.to : [options.to]
  const cleanRecipients = Array.from(
    new Set(rawList.map((e) => (e || '').trim().toLowerCase()).filter((e) => e && e.includes('@')))
  )

  if (cleanRecipients.length === 0) {
    return {
      success: false,
      provider: 'none',
      providerLabel: 'Aucun destinataire',
      error: 'Aucune adresse email destinataire valide fournie.',
    }
  }

  let logId: string | undefined
  const primaryRecipient = cleanRecipients[0]

  // 1. Enregistrement initial dans email_delivery_logs (si table présente)
  try {
    const { data: logRow } = await sb
      .from('email_delivery_logs')
      .insert({
        recipient_email: primaryRecipient,
        email_type: options.emailType,
        status: 'demande',
        provider: 'pending',
        subject: options.subject,
        ip_address: options.clientIp || null,
        metadata: {
          ...(options.metadata || {}),
          all_recipients: cleanRecipients,
          has_attachments: !!(options.attachments && options.attachments.length > 0),
        },
      })
      .select('id')
      .maybeSingle()

    logId = logRow?.id
  } catch (err: any) {
    // Si la table email_delivery_logs n'est pas encore créée, fallback transparent sur audit_logs
    try {
      await sb.from('audit_logs').insert({
        action: 'EMAIL_DISPATCH_REQUESTED',
        entity_name: 'email_service',
        details: JSON.stringify({
          recipient: primaryRecipient,
          recipientsCount: cleanRecipients.length,
          type: options.emailType,
          subject: options.subject,
        }),
      })
    } catch (_) {}
  }

  // ─── 2. CAS A : API TRANSACTIONNELLE RESEND (HTTPS PORT 443) ───────────────
  const resendKey = (process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY || '').trim()
  if (resendKey && resendKey.startsWith('re_')) {
    const resendRes = await sendViaResend(resendKey, fromName, fromEmail, cleanRecipients, options)
    if (resendRes.success) {
      await recordEmailSuccess(sb, logId, 'resend_api', resendRes.messageId, cleanRecipients, options)
      return {
        success: true,
        provider: 'resend_api',
        providerLabel: 'Resend API (HTTPS)',
        messageId: resendRes.messageId,
        recipients: cleanRecipients,
        logId,
      }
    } else {
      console.warn('[EmailHelper] Échec Resend API, repli automatique vers les autres canaux...', resendRes.error)
    }
  }

  // ─── 3. CAS B : API TRANSACTIONNELLE BREVO (HTTPS PORT 443) ────────────────
  const brevoKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
  if (brevoKey) {
    const brevoRes = await sendViaBrevo(brevoKey, fromName, fromEmail, cleanRecipients, options)
    if (brevoRes.success) {
      await recordEmailSuccess(sb, logId, 'brevo_api', brevoRes.messageId, cleanRecipients, options)
      return {
        success: true,
        provider: 'brevo_api',
        providerLabel: 'Brevo API (HTTPS)',
        messageId: brevoRes.messageId,
        recipients: cleanRecipients,
        logId,
      }
    } else {
      console.warn('[EmailHelper] Échec Brevo API, repli vers SMTP...', brevoRes.error)
    }
  }

  // ─── 4. CAS C : GMAIL SMTP VIA NODEMAILER (PORT 587 STARTTLS / PORT 465 SSL) ─
  const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')
  const smtpUser = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()

  if (smtpPass && smtpUser) {
    let lastSmtpError: any = null
    let info: any = null
    let activeSmtpProvider: 'smtp_gmail_465' | 'smtp_gmail_587' = 'smtp_gmail_587'

    // Formater les pièces jointes pour Nodemailer
    const nodemailerAttachments = options.attachments?.map((att) => {
      let content: Buffer
      if (Buffer.isBuffer(att.content)) {
        content = att.content
      } else if (typeof att.content === 'string') {
        const cleanBase64 = att.content.replace(/^data:[^;]+;base64,/, '').trim()
        content = Buffer.from(cleanBase64, 'base64')
      } else {
        content = Buffer.from(String(att.content || ''))
      }
      return {
        filename: att.filename,
        content,
        contentType: att.contentType || 'application/pdf',
      }
    })

    // Ordre dynamique selon SMTP_PORT configuré dans Vercel (587 par défaut, recommandé cloud)
    const configuredPort = Number(process.env.SMTP_PORT || '587') || 587
    const prefer587 = configuredPort === 587
    const firstPort = prefer587 ? 587 : 465
    const firstSecure = prefer587 ? false : true
    const secondPort = prefer587 ? 465 : 587
    const secondSecure = prefer587 ? true : false

    // Tentative 1 : Port prioritaire (587 par défaut — rapide et non bloqué par AWS Lambda / Vercel)
    try {
      const transporterFirst = createSmtpTransporter(firstPort, firstSecure)
      info = await transporterFirst.sendMail({
        from: fromHeader,
        to: cleanRecipients.join(', '),
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]+>/g, ' '),
        attachments: nodemailerAttachments,
      })
      activeSmtpProvider = firstPort === 465 ? 'smtp_gmail_465' : 'smtp_gmail_587'
    } catch (errFirst: any) {
      lastSmtpError = errFirst
      console.warn(`[EmailHelper] Port ${firstPort} échoué (${errFirst?.message}), repli vers Port ${secondPort}...`)

      // Tentative 2 : Port de secours
      try {
        const transporterSecond = createSmtpTransporter(secondPort, secondSecure)
        info = await transporterSecond.sendMail({
          from: fromHeader,
          to: cleanRecipients.join(', '),
          subject: options.subject,
          html: options.html,
          text: options.text || options.html.replace(/<[^>]+>/g, ' '),
          attachments: nodemailerAttachments,
        })
        activeSmtpProvider = secondPort === 465 ? 'smtp_gmail_465' : 'smtp_gmail_587'
        lastSmtpError = null
      } catch (errSecond: any) {
        lastSmtpError = errSecond
        console.error(`[EmailHelper] Port ${secondPort} échoué également :`, errSecond?.message)
      }
    }

    if (info && (info.messageId || info.accepted?.length > 0)) {
      await recordEmailSuccess(sb, logId, activeSmtpProvider, info.messageId, cleanRecipients, options)
      return {
        success: true,
        provider: activeSmtpProvider,
        providerLabel: activeSmtpProvider === 'smtp_gmail_465' ? 'Gmail SMTP (Port 465 SSL)' : 'Gmail SMTP (Port 587 TLS)',
        messageId: info.messageId,
        recipients: cleanRecipients,
        logId,
      }
    }

    // Diagnostic précis de l'échec SMTP
    const diag = diagnoseEmailError(lastSmtpError)
    await recordEmailFailure(sb, logId, 'smtp_gmail', lastSmtpError?.message, diag.diagnostic, cleanRecipients)

    return {
      success: false,
      provider: 'none',
      providerLabel: 'Gmail SMTP',
      error: lastSmtpError?.message || 'Connexion SMTP fermée inopinément.',
      diagnostic: diag.diagnostic,
      recipients: cleanRecipients,
      logId,
    }
  }

  // ─── 5. CAS D : AUCUN SECRET EMAIL VALIDE SUR LE SERVEUR ──────────────────
  const missingError =
    'Aucun service d\'envoi email opérationnel. ' +
    'Veuillez configurer RESEND_API_KEY (recommandé pour Vercel) ou SMTP_PASS (mot de passe d\'application Google) dans vos variables d\'environnement Vercel.'

  await recordEmailFailure(sb, logId, 'none', 'Credentials missing', missingError, cleanRecipients)

  return {
    success: false,
    provider: 'none',
    providerLabel: 'Non configuré',
    error: missingError,
    diagnostic:
      'Pour activer l\'envoi automatique et les tests : ' +
      '1. Ouvrez votre dashboard Vercel > Settings > Environment Variables. ' +
      '2. Ajoutez RESEND_API_KEY (clé API gratuite sur https://resend.com) ou SMTP_PASS (mot de passe d\'application 16 caractères sur Google). ' +
      '3. Redéployez votre application.',
    recipients: cleanRecipients,
    logId,
  }
}

/**
 * Journalise un succès de livraison dans Supabase
 */
async function recordEmailSuccess(
  sb: any,
  logId: string | undefined,
  provider: string,
  messageId: string | undefined,
  recipients: string[],
  options: EmailSendOptions
) {
  try {
    if (logId) {
      await sb
        .from('email_delivery_logs')
        .update({
          status: 'envoye',
          provider,
          error_message: null,
          metadata: {
            ...(options.metadata || {}),
            messageId,
            recipients,
            delivered_at: new Date().toISOString(),
          },
        })
        .eq('id', logId)
    }

    // Journalisation d'audit complémentaire
    await sb.from('audit_logs').insert({
      action: 'EMAIL_SENT_SUCCESS',
      entity_name: 'email_delivery',
      details: JSON.stringify({
        recipients,
        provider,
        messageId,
        subject: options.subject,
        type: options.emailType,
      }),
    })
  } catch (_) {}
}

/**
 * Journalise un échec de livraison dans Supabase
 */
async function recordEmailFailure(
  sb: any,
  logId: string | undefined,
  provider: string,
  rawError: string | undefined,
  diagnostic: string,
  recipients: string[]
) {
  try {
    if (logId) {
      await sb
        .from('email_delivery_logs')
        .update({
          status: 'echec',
          provider,
          error_message: rawError || diagnostic,
          metadata: {
            diagnostic,
            recipients,
            failed_at: new Date().toISOString(),
          },
        })
        .eq('id', logId)
    }

    await sb.from('audit_logs').insert({
      action: 'EMAIL_SENT_FAILURE',
      entity_name: 'email_delivery',
      details: JSON.stringify({
        recipients,
        provider,
        error: rawError,
        diagnostic,
      }),
    })
  } catch (_) {}
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
          <tr style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
            <td style="padding: 32px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">GESTIO 229 ERP</h1>
              <p style="color: #d1fae5; margin: 8px 0 0 0; font-size: 14px;">Plateforme de Gestion Intégrée Multi-Activités</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Bonjour ${responsibleName || 'Cher Partenaire'},</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                Nous sommes ravis d'accueillir votre entreprise <strong>${companyName}</strong> sur <strong>GESTIO 229</strong>.
              </p>
              <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                Pour activer définitivement votre compte administrateur et accéder à votre <strong>HUB Central</strong>, veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :
              </p>
              <div style="text-align: center; margin: 36px 0;">
                <a href="${confirmationUrl}" style="background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: bold; display: inline-block; box-shadow: 0 4px 8px rgba(5, 150, 105, 0.25);">
                  ✅ Confirmer mon adresse email
                </a>
              </div>
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
                Ce message a été envoyé automatiquement suite à votre inscription sur <strong>gestio229.com</strong>.
              </p>
            </td>
          </tr>
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
