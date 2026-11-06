// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST /api/send-rapport-pdf
// Envoi du Rapport de Caisse PDF via moteur multi-fournisseurs (Resend HTTPS / Gmail SMTP)
// 100% Autonome — Zéro dépendance relative — Ne plante jamais en FUNCTION_INVOCATION_FAILED
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function formatFCFA(n: number = 0): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`
}

// ─── Envoi via Resend API (HTTPS Port 443) ───────────────────────────────────
async function sendViaResend(
  apiKey: string,
  fromName: string,
  fromEmail: string,
  recipients: string[],
  subject: string,
  html: string,
  text: string,
  attachments?: Array<{ filename: string; content: string }>
) {
  let sender = `${fromName} <${fromEmail}>`
  if (fromEmail.includes('@gmail.com') || fromEmail.includes('@yahoo.') || fromEmail.includes('@hotmail.')) {
    sender = `${fromName} <onboarding@resend.dev>`
  }

  const payload: any = {
    from: sender,
    to: recipients,
    reply_to: fromEmail,
    subject,
    html,
    text,
  }

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
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
    throw new Error(data.error?.message || data.message || `Erreur Resend HTTP ${res.status}`)
  }
  return { messageId: data.id, provider: 'Resend API (HTTPS Port 443)' }
}

// ─── Envoi via Brevo API (HTTPS Port 443) ────────────────────────────────────
async function sendViaBrevo(
  apiKey: string,
  fromName: string,
  fromEmail: string,
  recipients: string[],
  subject: string,
  html: string,
  text: string,
  attachments?: Array<{ filename: string; content: string }>
) {
  const payload: any = {
    sender: { name: fromName, email: fromEmail },
    to: recipients.map((email) => ({ email })),
    subject,
    htmlContent: html,
    textContent: text,
  }

  if (attachments && attachments.length > 0) {
    payload.attachment = attachments.map((att) => ({
      name: att.filename,
      content: att.content,
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
    throw new Error(data.message || `Erreur Brevo HTTP ${res.status}`)
  }
  return { messageId: data.messageId || data.id, provider: 'Brevo API (HTTPS Port 443)' }
}

// ─── Envoi via Gmail SMTP Direct (Port 465 SSL puis Port 587 TLS) ───────────
async function sendViaSmtp(
  fromHeader: string,
  recipients: string[],
  subject: string,
  html: string,
  text: string,
  attachments?: Array<{ filename: string; content: string }>
) {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim()
  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')

  const nodemailerAttachments = attachments?.map((att) => ({
    filename: att.filename,
    content: Buffer.from(att.content, 'base64'),
    contentType: 'application/pdf',
  }))

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
      to: recipients.join(', '),
      subject,
      html,
      text,
      attachments: nodemailerAttachments,
    })

    return { messageId: info.messageId, provider: 'Gmail SMTP (Port 465 SSL)' }
  } catch (err465: any) {
    lastError = err465
    console.warn('[send-rapport-pdf] Port 465 échoué, tentative sur Port 587...', err465?.message)
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
      to: recipients.join(', '),
      subject,
      html,
      text,
      attachments: nodemailerAttachments,
    })

    return { messageId: info.messageId, provider: 'Gmail SMTP (Port 587 TLS)' }
  } catch (err587: any) {
    lastError = err587
    console.error('[send-rapport-pdf] Port 587 échoué également :', err587?.message)
  }

  throw lastError || new Error('Impossible d\'expédier l\'email via SMTP.')
}

// ─── Handler Principal ───────────────────────────────────────────────────────
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const supabase = getSupabaseClient()

  try {
    const {
      companyId,
      secteurId,
      caisseId,
      date,
      heure,
      pdfBase64,
      emails: customEmails,
      metadata = {},
    } = req.body || {}

    // 1. Récupération des destinataires actifs dans la base de données
    const targetEmails: string[] = []
    const seenEmails = new Set<string>()

    if (companyId) {
      try {
        const { data: dbDest, error: dbErr } = await supabase
          .from('parametres_destinataires')
          .select('email, nom, actif')
          .eq('company_id', companyId)
          .eq('actif', true)

        if (!dbErr && dbDest && dbDest.length > 0) {
          dbDest.forEach((d) => {
            const em = (d.email || '').trim().toLowerCase()
            if (em && em.includes('@') && !seenEmails.has(em)) {
              seenEmails.add(em)
              targetEmails.push(em)
            }
          })
        }
      } catch (err) {
        console.warn('[send-rapport-pdf] Erreur lecture parametres_destinataires :', err)
      }
    }

    // Destinataires supplémentaires spécifiés
    if (Array.isArray(customEmails)) {
      customEmails.forEach((raw) => {
        const em = (raw || '').trim().toLowerCase()
        if (em && em.includes('@') && !seenEmails.has(em)) {
          seenEmails.add(em)
          targetEmails.push(em)
        }
      })
    }

    // Si aucun destinataire, repli sur l'email officiel de l'entreprise
    if (targetEmails.length === 0 && companyId) {
      try {
        const { data: comp } = await supabase
          .from('companies')
          .select('email, name')
          .eq('id', companyId)
          .maybeSingle()

        if (comp?.email) {
          const em = comp.email.trim().toLowerCase()
          if (!seenEmails.has(em)) {
            seenEmails.add(em)
            targetEmails.push(em)
          }
        }
      } catch (_) {}
    }

    // Repli par défaut
    if (targetEmails.length === 0) {
      const fallbackEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'victoriengoutchowanou2024@gmail.com').trim()
      if (fallbackEmail) targetEmails.push(fallbackEmail)
    }

    if (targetEmails.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Aucun destinataire configuré pour recevoir le rapport de caisse.',
        diagnostic: 'Veuillez enregistrer au moins une adresse email active dans "Destinataires du Rapport de Caisse".',
      })
    }

    // 2. Préparation des statistiques et des données du rapport
    const dateFormatted = date || new Date().toLocaleDateString('fr-BJ')
    const heureFormatted = heure || new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
    const dateHeure = `${dateFormatted} à ${heureFormatted}`
    const caissiere = metadata.nomCaissier || metadata.operateur || metadata.caissiere || 'Caissier Principal'
    const secteur = metadata.secteurNom || secteurId || metadata.secteur || 'Général'
    const entreprise = metadata.entreprise || metadata.companyName || 'GESTIO 229'

    const ca = Number(metadata.caDuJour ?? metadata.ca ?? 0)
    const espece = Number(metadata.especesDuJour ?? metadata.espece ?? 0)
    const momo = Number(metadata.momoDuJour ?? metadata.momo ?? 0)
    const depenses = Number(metadata.totalDepensesJour ?? metadata.depenses ?? 0)
    const remboursement = Number(metadata.totalRemboursementsJour ?? metadata.remboursement ?? 0)
    const marge = Number(metadata.margeBruteJour ?? metadata.marge ?? 0)
    const margePercent = typeof metadata.margePercent === 'number'
      ? metadata.margePercent
      : (ca > 0 ? Math.round((marge / ca) * 100) : 0)
    const creances = Number(metadata.totalCreances ?? metadata.creances ?? 0)
    const ecart = Number(metadata.ecart ?? metadata.ecartEspeces ?? 0)
    const soldeFinal = Number(metadata.fondActuel ?? metadata.totalReel ?? (espece + momo))

    const rawTop5 = metadata.top5Produits || metadata.top5 || []
    const top5: Array<{ nom: string; qte: number; montant: number }> = (Array.isArray(rawTop5) ? rawTop5 : [])
      .slice(0, 5)
      .map((p: any) => ({
        nom: p.nom || p.product_name || 'Produit',
        qte: Number(p.qte ?? p.quantite ?? 1),
        montant: Number(p.montant ?? p.totalVentes ?? p.total_ttc ?? 0),
      }))

    const top5Text = top5.length > 0
      ? top5.map((p, i) => `  ${i + 1}. ${p.nom} - ${p.qte} vendus - ${formatFCFA(p.montant)}`).join('\n')
      : '  Aucune vente enregistrée pour cette session.'

    const textBody = `
Fermeture de Caisse GESTIO 229
==============================
${dateHeure} - ${caissiere}
Entreprise : ${entreprise}
Secteur : ${secteur}

CHIFFRE D'AFFAIRES DU JOUR :
- CA total du jour : ${formatFCFA(ca)}

DÉTAILS ENCAISSEMENTS :
- Espèce du jour : ${formatFCFA(espece)}
- MoMo du jour (MTN + Moov) : ${formatFCFA(momo)}

SOLDE ET ÉCARTS :
- Solde final en caisse : ${formatFCFA(soldeFinal)}
- Écart de caisse : ${ecart === 0 ? '0 FCFA (Conforme)' : formatFCFA(ecart)}

RENTABILITÉ & SORTIES :
- Marge brute du jour : ${formatFCFA(marge)} (${margePercent}%)
- Dépenses du jour : ${formatFCFA(depenses)}
- Remboursement du jour : ${formatFCFA(remboursement)}

SITUATION CRÉANCES :
- Situation des créances actuel : ${formatFCFA(creances)}

TOP 5 PRODUITS VENDUS DU JOUR :
${top5Text}

Rapport généré par GESTIO 229 - ${entreprise}
Le rapport officiel complet est joint à ce message au format PDF.
    `.trim()

    const top5RowsHtml = top5.length > 0
      ? top5
          .map(
            (p, i) => `
        <tr>
          <td align="left" style="padding: 9px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #111827; ${i > 0 ? 'border-top: 1px solid #F1F5F9;' : ''}">
            <strong style="color: #0F1F3C; margin-right: 6px;">${i + 1}.</strong>
            <span>${p.nom || 'Produit'}</span>
            <span style="color: #6B7280; font-size: 12px; margin-left: 6px;">— ${p.qte || 0} vendus</span>
          </td>
          <td align="right" style="padding: 9px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 800; color: #111827; white-space: nowrap; ${i > 0 ? 'border-top: 1px solid #F1F5F9;' : ''}">
            ${formatFCFA(p.montant)}
          </td>
        </tr>
      `
          )
          .join('')
      : `
        <tr>
          <td colspan="2" align="center" style="padding: 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9CA3AF; font-style: italic;">
            Aucune vente enregistrée pour cette session.
          </td>
        </tr>
      `

    const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px 12px; background-color: #064e3b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 36px rgba(0,0,0,0.35);">
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #059669 0%, #064e3b 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 900;">🏪 Fermeture de Caisse (Z Officiel)</h1>
              <p style="margin: 6px 0 0; font-size: 14px; font-weight: 600; color: #34d399;">${entreprise}</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #cbd5e1;">${dateHeure} — <strong>${caissiere}</strong> (${secteur})</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 28px; font-size: 14px; color: #334155;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <p style="margin: 6px 0; font-size: 16px;"><strong>Chiffre d'Affaires du Jour :</strong> <span style="color: #059669; font-weight: 900;">${formatFCFA(ca)}</span></p>
                <p style="margin: 4px 0;">• Espèces : <strong>${formatFCFA(espece)}</strong> | Mobile Money : <strong>${formatFCFA(momo)}</strong></p>
                <p style="margin: 4px 0;">• Dépenses : <strong>${formatFCFA(depenses)}</strong> | Remboursements : <strong>${formatFCFA(remboursement)}</strong></p>
                <p style="margin: 4px 0;">• Marge brute : <strong>${formatFCFA(marge)} (${margePercent}%)</strong></p>
                <p style="margin: 4px 0;">• Solde final : <strong>${formatFCFA(soldeFinal)}</strong> | Écart : <strong style="color: ${ecart === 0 ? '#059669' : '#dc2626'};">${ecart === 0 ? '0 FCFA (Conforme)' : formatFCFA(ecart)}</strong></p>
                <p style="margin: 4px 0;">• Créances restantes dues : <strong>${formatFCFA(creances)}</strong></p>
              </div>

              <h3 style="margin: 16px 0 8px; font-size: 13px; text-transform: uppercase; color: #064e3b; letter-spacing: 0.5px;">🏆 Top 5 Produits Vendus</h3>
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 14px; margin-bottom: 20px;">
                ${top5RowsHtml}
              </table>

              <p style="color: #059669; font-weight: 700; margin-bottom: 0;">
                📎 Le rapport officiel complet avec tous les détails de session est joint à cet email au format PDF.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b;">
              GESTIO 229 ERP • STANDARD DU BÉNIN • <a href="https://www.gestio229.com" style="color: #059669; font-weight: bold;">www.gestio229.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    // 3. Préparer la pièce jointe PDF
    const cleanSectorFileName = (secteur || 'Caisse').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Fermeture_Caisse_${cleanSectorFileName}_${dateFormatted.replace(/\//g, '-')}.pdf`

    const attachments: Array<{ filename: string; content: string }> = []
    if (pdfBase64) {
      const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
      attachments.push({
        filename: fileName,
        content: cleanBase64,
      })
    }

    const subject = `🏪 Fermeture de Caisse - ${secteur} - ${dateFormatted}`
    const fromName = (process.env.SMTP_FROM_NAME || 'GESTIO 229').trim()
    const fromEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'victoriengoutchowanou2024@gmail.com').trim()
    const fromHeader = `"${fromName}" <${fromEmail}>`

    // 4. Transmission
    let sendResult: { messageId?: string; provider: string }
    const resendKey = (process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY || '').trim()
    const brevoKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()

    if (resendKey && resendKey.startsWith('re_')) {
      sendResult = await sendViaResend(resendKey, fromName, fromEmail, targetEmails, subject, htmlBody, textBody, attachments)
    } else if (brevoKey) {
      sendResult = await sendViaBrevo(brevoKey, fromName, fromEmail, targetEmails, subject, htmlBody, textBody, attachments)
    } else {
      sendResult = await sendViaSmtp(fromHeader, targetEmails, subject, htmlBody, textBody, attachments)
    }

    // 5. Journalisation dans Supabase
    try {
      await supabase.from('email_delivery_logs').insert(
        targetEmails.map((email) => ({
          recipient_email: email,
          email_type: 'cash_report',
          status: 'envoye',
          provider: sendResult.provider,
          subject,
          metadata: {
            companyId,
            secteurId,
            caisseId,
            ca,
            soldeFinal,
            messageId: sendResult.messageId,
            sent_at: new Date().toISOString(),
          },
        }))
      )
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Rapport transmis avec succès à ${targetEmails.length} destinataire(s) via ${sendResult.provider}.`,
      recipients: targetEmails,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
    })
  } catch (err: any) {
    console.error('[send-rapport-pdf] Erreur :', err)

    return res.status(200).json({
      success: false,
      error: err?.message || 'Erreur lors de l\'envoi du rapport de caisse.',
      diagnostic: 'Vérifiez vos paramètres SMTP (SMTP_USER, SMTP_PASS) ou configurez RESEND_API_KEY dans Vercel.',
    })
  }
}
