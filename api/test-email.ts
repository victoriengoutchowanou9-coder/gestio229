// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST & GET /api/test-email
// Module de test réel de la chaîne d'expédition email
// Utilise le moteur centralisé emailHelper (Port 587 STARTTLS / 465 SSL / Resend HTTPS)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendTrackedEmail, getActiveEmailProviderInfo, diagnoseEmailError } from './_lib/emailHelper.ts'

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const providerInfo = getActiveEmailProviderInfo()

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        provider: providerInfo.provider,
        label: providerInfo.label,
        details: providerInfo.details,
        isHttps: providerInfo.isHttps,
        hasCredentials: providerInfo.provider !== 'unconfigured',
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Méthode non autorisée. Utilisez POST ou GET.',
      })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { testEmail } = body
    const defaultRecipient = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou2024@gmail.com').trim()
    const targetEmail = (testEmail || defaultRecipient).trim()

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Adresse email de test invalide. Veuillez renseigner un email valide (ex: direction@gestio229.com).',
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

    const sendResult = await sendTrackedEmail({
      to: targetEmail,
      subject: `🧪 Test de Connexion Email — GESTIO 229 (${nowStr})`,
      html,
      text,
      emailType: 'test_email',
      metadata: {
        isTest: true,
        triggered_at: nowStr,
        channel: providerInfo.label,
      },
    })

    if (sendResult.success) {
      return res.status(200).json({
        success: true,
        message: `Email de test transmis avec succès à ${targetEmail} via ${sendResult.providerLabel} !`,
        provider: sendResult.provider,
        providerLabel: sendResult.providerLabel,
        messageId: sendResult.messageId,
        targetEmail,
      })
    } else {
      return res.status(200).json({
        success: false,
        error: sendResult.error || 'Échec de la transmission du message.',
        diagnostic: sendResult.diagnostic,
        providerLabel: sendResult.providerLabel,
      })
    }
  } catch (err: any) {
    console.error('[test-email] Erreur transmission :', err)
    const diag = diagnoseEmailError(err)

    return res.status(200).json({
      success: false,
      error: err?.message || 'Erreur lors de la transmission du message.',
      diagnostic: diag.diagnostic,
      code: diag.code,
      providerLabel: getActiveEmailProviderInfo().label,
    })
  }
}
