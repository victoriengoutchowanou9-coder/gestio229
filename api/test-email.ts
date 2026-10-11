// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST /api/test-email
// Test de la connexion Gmail SMTP et envoi d'un email de vérification
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  try {
    const { testEmail } = req.body || {}
    const targetEmail = (testEmail || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou9@gmail.com').trim()

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse email de test invalide.' })
    }

    const host = process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = Number(process.env.SMTP_PORT) || 587
    const user = process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou9@gmail.com'
    const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '')
    const fromName = process.env.SMTP_FROM_NAME || 'GESTIO229'
    const fromEmail = process.env.SMTP_FROM_EMAIL || user

    if (!pass) {
      return res.status(500).json({
        success: false,
        error: 'Variable SMTP_PASS manquante sur Vercel. Veuillez configurer le mot de passe d\'application Gmail (16 caractères) dans les variables d\'environnement.'
      })
    }

    // 1. Initialiser le transporteur Nodemailer
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // 587 STARTTLS
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false
      }
    })

    // 2. Tester la connexion avec verify()
    await transporter.verify()

    // 3. Envoyer l'email de test
    const nowStr = new Date().toLocaleString('fr-BJ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: targetEmail,
      subject: `🧪 Test Configuration Gmail SMTP - GESTIO 229 (${nowStr})`,
      text: `
TEST DE CONNEXION GMAIL SMTP — GESTIO 229
==========================================
Date : ${nowStr}
Expéditeur : ${fromName} <${fromEmail}>
Destinataire : ${targetEmail}

Félicitations ! La configuration Gmail SMTP de GESTIO 229 fonctionne parfaitement.
Les rapports journaliers de caisse seront bien acheminés à vos destinataires configurés à 23h00.

Paramètres utilisés :
- Serveur : ${host}:${port}
- Utilisateur : ${user}
- Authentification : Validée avec succès

--
GESTIO 229 ERP & SaaS
www.gestio229.com
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; padding: 24px;">
      <h1 style="margin: 0; font-size: 18px; font-weight: 800;">✅ Test Gmail SMTP Réussi !</h1>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #d1fae5;">GESTIO 229 — Service d'Expédition de Rapports de Caisse</p>
    </div>
    <div style="padding: 24px; font-size: 13px; line-height: 1.6;">
      <p style="margin-top: 0;">Bonjour,</p>
      <p>Ce message confirme que la connexion à votre serveur <strong>Gmail SMTP</strong> est <strong>100% opérationnelle</strong>.</p>
      
      <div style="background: #f1f5f9; border-radius: 12px; padding: 14px; margin: 18px 0; font-family: monospace; font-size: 12px;">
        <div><strong>Serveur :</strong> ${host}:${port} (STARTTLS)</div>
        <div><strong>Compte :</strong> ${user}</div>
        <div><strong>Expéditeur :</strong> ${fromName} &lt;${fromEmail}&gt;</div>
        <div><strong>Horodatage :</strong> ${nowStr}</div>
      </div>

      <p style="color: #047857; font-weight: bold;">Vos rapports de caisse quotidiens (23h00) et envois manuels seront transmis sans encombre.</p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b;">
      GESTIO 229 • <a href="https://www.gestio229.com" style="color: #059669;">www.gestio229.com</a>
    </div>
  </div>
</body>
</html>
      `.trim()
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`[test-email] ✅ Test SMTP réussi pour ${targetEmail} (MessageId: ${info.messageId})`)

    return res.status(200).json({
      success: true,
      message: `Connexion SMTP validée et email de test envoyé avec succès à ${targetEmail} !`,
      messageId: info.messageId,
      user
    })
  } catch (error: any) {
    console.error('[test-email] Erreur vérification Gmail SMTP :', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Échec de la connexion SMTP Gmail. Vérifiez votre mot de passe d\'application.',
      details: error?.code || error?.command || null
    })
  }
}
