// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST & GET /api/test-email
// Vérification et test réel de la chaîne d'envoi d'emails (Resend HTTPS / Gmail SMTP)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendTrackedEmail, getActiveEmailProviderInfo, diagnoseEmailError } from './_lib/emailHelper'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // GET : Vérifier l'état du fournisseur actif sans envoyer d'email
  if (req.method === 'GET') {
    const providerInfo = getActiveEmailProviderInfo()
    return res.status(200).json({
      success: true,
      provider: providerInfo.provider,
      label: providerInfo.label,
      details: providerInfo.details,
      isHttps: providerInfo.isHttps,
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST ou GET.' })
  }

  try {
    const { testEmail } = req.body || {}
    const defaultRecipient = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou2024@gmail.com').trim()
    const targetEmail = (testEmail || defaultRecipient).trim()

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Adresse email de test invalide. Veuillez renseigner un email valide (ex: direction@gestio229.com).',
      })
    }

    const providerInfo = getActiveEmailProviderInfo()
    const nowStr = new Date().toLocaleString('fr-BJ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const fromName = (process.env.SMTP_FROM_NAME || 'GESTIO 229').trim()

    // Construction de l'email de test certifié
    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Test Service Email - GESTIO 229</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 32px 16px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
    
    <!-- En-tête vert émeraude -->
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; padding: 32px 28px; text-align: center;">
      <div style="display: inline-block; background: rgba(255, 255, 255, 0.2); border-radius: 9999px; padding: 8px 16px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px;">
        Test Certifié Opérationnel
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">Transmission Réussie !</h1>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #d1fae5;">Service d'Acheminement des Rapports de Caisse — GESTIO 229</p>
    </div>

    <!-- Contenu -->
    <div style="padding: 28px; font-size: 14px; line-height: 1.6; color: #334155;">
      <p style="margin-top: 0; font-size: 15px;">Bonjour,</p>
      <p>
        Ce message confirme que votre canal d'envoi d'emails transactionnels est <strong>parfaitement actif et vérifié</strong> par le serveur.
      </p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Canal utilisé :</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0f172a; text-align: right;">${providerInfo.label}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Protocole :</td>
            <td style="padding: 6px 0; font-weight: 700; color: #059669; text-align: right;">${providerInfo.isHttps ? 'HTTPS REST (Port 443)' : 'SMTP Direct'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Destinataire testé :</td>
            <td style="padding: 6px 0; font-family: monospace; font-size: 12px; color: #1e293b; text-align: right;">${targetEmail}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Horodatage serveur :</td>
            <td style="padding: 6px 0; color: #1e293b; text-align: right;">${nowStr}</td>
          </tr>
        </table>
      </div>

      <p style="color: #047857; font-weight: 700; margin-bottom: 0;">
        ✅ Lors de chaque fermeture de caisse, le rapport PDF officiel sera généré et expédié automatiquement à vos destinataires actifs sans aucune intervention manuelle.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; text-align: center; font-size: 12px; color: #64748b;">
      ${fromName} ERP & SaaS • <a href="https://www.gestio229.com" style="color: #059669; text-decoration: none; font-weight: bold;">www.gestio229.com</a>
    </div>

  </div>
</body>
</html>
    `.trim()

    // 2. Déclencher un véritable envoi d'email
    const sendResult = await sendTrackedEmail({
      to: targetEmail,
      subject: `🧪 Test de Connexion Email — GESTIO 229 (${nowStr})`,
      html: htmlContent,
      text: `Test de connexion email GESTIO 229 réussi à ${nowStr} pour ${targetEmail}. Canal: ${providerInfo.label}`,
      emailType: 'test_email',
      metadata: {
        isTest: true,
        triggered_at: nowStr,
        channel: providerInfo.label,
      },
    })

    if (!sendResult.success) {
      console.error('[test-email] Échec du test :', sendResult.error)
      return res.status(500).json({
        success: false,
        error: sendResult.error || 'Échec de la connexion au service email.',
        diagnostic: sendResult.diagnostic || 'Impossible de joindre le service d\'envoi.',
        providerLabel: sendResult.providerLabel,
        technicalDetails: {
          activeProvider: providerInfo.label,
          targetEmail,
          isHttps: providerInfo.isHttps,
        },
      })
    }

    console.log(`[test-email] ✅ Test réussi pour ${targetEmail} via ${sendResult.providerLabel} (MessageId: ${sendResult.messageId})`)

    return res.status(200).json({
      success: true,
      message: `Connexion validée ! Un email de test réel a été expédié à ${targetEmail} via ${sendResult.providerLabel}.`,
      provider: sendResult.provider,
      providerLabel: sendResult.providerLabel,
      messageId: sendResult.messageId,
      targetEmail,
    })
  } catch (err: any) {
    const diag = diagnoseEmailError(err)
    console.error('[test-email] Exception non gérée :', err)
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erreur interne lors du test email.',
      diagnostic: diag.diagnostic,
    })
  }
}
