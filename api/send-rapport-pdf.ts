// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST /api/send-rapport-pdf
// Envoi du Rapport de Caisse PDF via Gmail SMTP (Nodemailer)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function formatFCFA(n: number = 0): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`
}

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim()
  const port = Number((process.env.SMTP_PORT || '587').trim()) || 587
  const user = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '')
  const fromName = (process.env.SMTP_FROM_NAME || 'GESTIO 229').trim()
  const fromEmail = user || (process.env.SMTP_FROM_EMAIL || '').trim()

  if (!pass) {
    throw new Error('SMTP_PASS manquante - configurez dans Vercel')
  }
  if (!user) {
    throw new Error('SMTP_USER manquante - configurez dans Vercel')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // Port 587 utilise STARTTLS
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: false
    }
  })

  return { transporter, host, port, user, pass, fromName, fromEmail }
}

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
    const {
      companyId,
      secteurId,
      date,
      heure,
      pdfBase64,
      emails: customEmails,
      metadata = {}
    } = req.body || {}

    // 1. Initialiser le transporteur Nodemailer
    let smtpConfig: ReturnType<typeof getSmtpConfig>
    try {
      smtpConfig = getSmtpConfig()
    } catch (cfgErr: any) {
      console.warn('[send-rapport-pdf] Configuration SMTP manquante :', cfgErr.message)
      return res.status(400).json({
        success: false,
        error: cfgErr.message || 'SMTP_PASS manquante - configurez dans Vercel'
      })
    }
    const { transporter, user, fromName, fromEmail } = smtpConfig

    // 2. Récupérer les destinataires actifs depuis parametres_destinataires (où actif = true)
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

    // Destinataires supplémentaires passés en paramètre
    if (Array.isArray(customEmails)) {
      customEmails.forEach((raw) => {
        const em = (raw || '').trim().toLowerCase()
        if (em && em.includes('@') && !seenEmails.has(em)) {
          seenEmails.add(em)
          targetEmails.push(em)
        }
      })
    }

    // Si aucun destinataire trouvé, repli sur l'email de l'entreprise
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

    // Si toujours aucun destinataire, utiliser SMTP_FROM_EMAIL comme secours
    if (targetEmails.length === 0) {
      const fallbackEmail = process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou9@gmail.com'
      targetEmails.push(fallbackEmail)
    }

    // 3. Préparation des données du rapport
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

    const rawTop5 = metadata.top5Produits || metadata.top5 || []
    const top5: Array<{ nom: string; qte: number; montant: number }> = (Array.isArray(rawTop5) ? rawTop5 : []).slice(0, 5).map((p: any) => ({
      nom: p.nom || p.product_name || 'Produit',
      qte: Number(p.qte ?? p.quantite ?? 1),
      montant: Number(p.montant ?? p.totalVentes ?? p.total_ttc ?? 0)
    }))

    const top5Text = top5.length > 0
      ? top5.map((p, i) => `  ${i + 1}. ${p.nom} - ${p.qte} vendus - ${formatFCFA(p.montant)}`).join('\n')
      : '  Aucune vente enregistrée pour cette session.'

    const textBody = `
Fermeture de Caisse GESTIO 229
==============================
${dateHeure} - ${caissiere}
Secteur : ${secteur}

CHIFFRE D'AFFAIRES DU JOUR :
- CA total du jour : ${formatFCFA(ca)}

DÉTAILS ENCAISSEMENTS :
- Espèce du jour : ${formatFCFA(espece)}
- Momo du jour (MTN + Moov) : ${formatFCFA(momo)}

RENTABILITÉ & SORTIES :
- Marge brute du jour : ${formatFCFA(marge)} (${margePercent}%)
- Dépenses du jour : ${formatFCFA(depenses)}
- Remboursement du jour : ${formatFCFA(remboursement)}

SITUATION CRÉANCES :
- Situation des créances actuel : ${formatFCFA(creances)} (total restant dû clients à ce jour)

TOP 5 PRODUITS VENDUS DU JOUR :
${top5Text}

Rapport généré par GESTIO 229 - ${entreprise}
    `.trim()

    const top5RowsHtml = top5.length > 0
      ? top5.map((p, i) => `
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
      `).join('')
      : `
        <tr>
          <td colspan="2" align="center" style="padding: 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9CA3AF; font-style: italic;">
            Aucune vente enregistrée pour cette session.
          </td>
        </tr>
      `

    const htmlBody = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fermeture de Caisse - ${secteur}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; margin: 0; padding: 24px 0;">
    <tr>
      <td align="center" style="padding: 0 12px;">

        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(15, 31, 60, 0.05);">

          <!-- HEADER BLEU NUIT (#0F1F3C) -->
          <tr>
            <td align="center" style="background-color: #0F1F3C; padding: 28px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px; padding-bottom: 6px;">
                    🏪 Fermeture de Caisse
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 500; color: #CBD5E1; padding-bottom: 4px;">
                    ${dateHeure} — <strong style="color: #FFFFFF;">${caissiere}</strong>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">
                    Secteur : <span style="color: #FFFFFF;">${secteur}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CORPS DU RAPPORT -->
          <tr>
            <td style="padding: 22px 24px 24px 24px;">

              <!-- SECTION 1 - CHIFFRE D'AFFAIRES DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    💰 CHIFFRE D'AFFAIRES DU JOUR
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569;">
                          CA total du jour
                        </td>
                        <td align="right" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 26px; font-weight: 900; color: #0F1F3C; letter-spacing: -0.5px; white-space: nowrap;">
                          ${formatFCFA(ca)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 2 - DÉTAILS ENCAISSEMENTS -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    🏦 DÉTAILS ENCAISSEMENTS
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 6px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #475569;">
                          Espèce du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${formatFCFA(espece)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #F1F5F9; height: 1px; padding: 0;"></td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #475569;">
                          Momo du jour <span style="font-size: 11px; color: #94A3B8;">(MTN + Moov)</span>
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${formatFCFA(momo)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 3 - RENTABILITÉ & SORTIES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    📈 RENTABILITÉ &amp; SORTIES
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 6px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #065F46;">
                          Marge brute du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #0E9F6E; white-space: nowrap;">
                          ${formatFCFA(marge)} <span style="font-size: 12px; font-weight: 800; color: #0E9F6E; margin-left: 4px;">(${margePercent}%)</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #A7F3D0; height: 1px; padding: 0;"></td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #374151;">
                          Dépenses du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${formatFCFA(depenses)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #A7F3D0; height: 1px; padding: 0;"></td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #374151;">
                          Remboursement du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${formatFCFA(remboursement)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 4 - SITUATION CRÉANCES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    📋 SITUATION CRÉANCES
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #475569;">
                          Situation des créances actuel<br/>
                          <span style="font-size: 11px; color: #94A3B8;">(total restant dû clients à ce jour)</span>
                        </td>
                        <td align="right" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${formatFCFA(creances)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 5 - TOP 5 PRODUITS VENDUS DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    🏆 TOP 5 PRODUITS VENDUS DU JOUR
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 6px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      ${top5RowsHtml}
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; font-weight: 600; color: #64748B;">
                    Rapport généré par GESTIO 229 — <strong style="color: #0F1F3C;">${entreprise}</strong>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 10px; color: #94A3B8; padding-top: 4px;">
                    Plateforme de Gestion Commerciale, Caisse &amp; Trésorerie • www.gestio229.com
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `.trim()

    // 4. Configuration de l'expéditeur et de l'objet
    const fromHeader = `"${fromName}" <${fromEmail}>`
    const subject = `Fermeture de Caisse - ${secteur} - ${dateFormatted}`

    const cleanSectorFileName = (secteur || 'Caisse').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Fermeture_Caisse_${cleanSectorFileName}_${dateFormatted.replace(/\//g, '-')}.pdf`

    // Pièce jointe PDF
    const attachments: any[] = []
    if (pdfBase64) {
      const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
      attachments.push({
        filename: fileName,
        content: Buffer.from(cleanBase64, 'base64'),
        contentType: 'application/pdf'
      })
    }

    // 5. Envoi via Nodemailer
    const mailOptions = {
      from: fromHeader,
      to: targetEmails.join(', '),
      subject,
      text: textBody,
      html: htmlBody,
      attachments
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`[send-rapport-pdf] ✅ Email envoyé avec succès via Gmail SMTP à ${targetEmails.join(', ')} (MessageId: ${info.messageId})`)

    return res.status(200).json({
      success: true,
      message: `Rapport transmis avec succès à ${targetEmails.length} destinataire(s) via Gmail SMTP.`,
      recipients: targetEmails,
      messageId: info.messageId
    })
  } catch (error: any) {
    console.error('[send-rapport-pdf] Exception envoi Gmail SMTP :', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erreur lors de l\'envoi du rapport via Gmail SMTP.'
    })
  }
}
