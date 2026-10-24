// =============================================================================
// GESTIO 229 ERP — Vercel Cron Job Quotidien : GET /api/cron-rapport-caisse
// Déclenché tous les soirs à 23h00 pour expédier le rapport via Gmail SMTP
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
    secure: false, // 587 STARTTLS
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
  if (req.query?.trigger !== 'cloture_validee') {
    console.log('[cron-rapport-caisse] 🛑 Envoi automatique 23h00 désactivé (déclenchement uniquement à la clôture réelle).')
    return res.status(200).json({
      success: true,
      disabled: true,
      message: 'Envoi automatique programmé (23h00) désactivé. Le rapport de caisse est envoyé uniquement lors de la validation d’une clôture réelle de caisse.'
    })
  }

  let smtpConfig: ReturnType<typeof getSmtpConfig>
  try {
    smtpConfig = getSmtpConfig()
  } catch (err: any) {
    console.warn('[cron-rapport-caisse] ⚠️ Configuration SMTP incomplète :', err.message)
    return res.status(200).json({
      success: false,
      error: err.message || 'SMTP_PASS manquante - configurez dans Vercel'
    })
  }

  const { transporter, user, fromName, fromEmail } = smtpConfig

  try {
    // 1. Récupérer toutes les entreprises actives
    const { data: companies, error: compErr } = await supabase
      .from('companies')
      .select('id, name, email')
      .eq('is_active', true)

    if (compErr || !companies || companies.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucune entreprise active à traiter.',
        processed: 0
      })
    }

    const todayDate = new Date().toISOString().split('T')[0]
    const dateFormatted = new Date().toLocaleDateString('fr-BJ')
    const heureFormatted = '23:00'
    const results: any[] = []

    const fromHeader = `"${fromName}" <${fromEmail}>`
    const subject = `Rapport Caisse GESTIO 229 - ${dateFormatted}`

    // 2. Parcourir chaque entreprise
    for (const company of companies) {
      try {
        // A. Destinataires actifs
        const { data: destinataires } = await supabase
          .from('parametres_destinataires')
          .select('email, nom')
          .eq('company_id', company.id)
          .eq('actif', true)

        let recipients = (destinataires || []).map((d) => (d.email || '').trim().toLowerCase()).filter((e) => e.includes('@'))

        // Fallback sur l'email de l'entreprise ou SMTP_USER
        if (recipients.length === 0) {
          if (company.email && company.email.includes('@')) {
            recipients.push(company.email.trim().toLowerCase())
          } else if (user && user.includes('@')) {
            recipients.push(user)
          }
        }
        if (recipients.length === 0 && company.email) {
          recipients = [company.email.trim().toLowerCase()]
        }
        if (recipients.length === 0) {
          recipients = [fromEmail]
        }

        // B. Chiffre d'Affaires du jour & marge brute depuis sales_orders
        const { data: orders } = await supabase
          .from('sales_orders')
          .select('total_amount, total_cost, paid_amount, credit_amount, payment_method, id')
          .eq('company_id', company.id)
          .gte('created_at', `${todayDate}T00:00:00`)
          .lte('created_at', `${todayDate}T23:59:59`)

        let caDuJour = 0
        let totalCostJour = 0
        let espVentes = 0
        let momoVentes = 0
        const orderIds: string[] = []

        ;(orders || []).forEach((o: any) => {
          caDuJour += Number(o.total_amount || 0)
          totalCostJour += Number(o.total_cost || 0)
          const pMethod = (o.payment_method || '').toLowerCase()
          const paid = Number(o.paid_amount ?? o.total_amount ?? 0)
          if (['especes', 'espece', 'cash'].includes(pMethod)) espVentes += paid
          else if (pMethod.includes('momo') || pMethod.includes('flooz') || pMethod.includes('celtiis')) momoVentes += paid
          if (o.id) orderIds.push(o.id)
        })

        const margeBruteJour = caDuJour - totalCostJour

        // C. Dépenses du jour
        let totalDepensesJour = 0
        const { data: deps } = await supabase
          .from('caisse_mouvements')
          .select('montant')
          .eq('company_id', company.id)
          .eq('type', 'depense')
          .gte('created_at', `${todayDate}T00:00:00`)
          .lte('created_at', `${todayDate}T23:59:59`)

        ;(deps || []).forEach((d: any) => {
          totalDepensesJour += Number(d.montant || 0)
        })

        // Remboursements du jour
        let totalRemboursementsJour = 0
        try {
          const { data: rembs } = await supabase
            .from('caisse_mouvements')
            .select('montant')
            .eq('company_id', company.id)
            .in('type', ['remboursement', 'reglement_client', 'remboursement_creance'])
            .gte('created_at', `${todayDate}T00:00:00`)
            .lte('created_at', `${todayDate}T23:59:59`)

          ;(rembs || []).forEach((r: any) => {
            totalRemboursementsJour += Number(r.montant || 0)
          })
        } catch (_) {}

        // D. Fonds actuels persistants
        let fondActuel = 0
        const { data: fonds } = await supabase
          .from('fonds_actuels')
          .select('fond_actuel_especes, fond_actuel_momo')
          .eq('company_id', company.id)

        ;(fonds || []).forEach((f: any) => {
          fondActuel += (Number(f.fond_actuel_especes || 0) + Number(f.fond_actuel_momo || 0))
        })

        // E. Créances totales en cours
        let totalCreances = 0
        const { data: creances } = await supabase
          .from('clients')
          .select('solde_creance, current_debt')
          .eq('company_id', company.id)

        ;(creances || []).forEach((c: any) => {
          totalCreances += Number(c.solde_creance ?? c.current_debt ?? 0)
        })

        // F. Top 5 des produits vendus de la journée
        let top5: Array<{ nom: string; qte: number; montant: number }> = []
        if (orderIds.length > 0) {
          const { data: items } = await supabase
            .from('sales_order_items')
            .select('product_name, quantity, total_ttc')
            .in('order_id', orderIds.slice(0, 100))

          const aggMap = new Map<string, { quantite: number; totalVentes: number }>()
          ;(items || []).forEach((it: any) => {
            const name = it.product_name || 'Produit'
            const cur = aggMap.get(name) || { quantite: 0, totalVentes: 0 }
            cur.quantite += Number(it.quantity || 1)
            cur.totalVentes += Number(it.total_ttc || 0)
            aggMap.set(name, cur)
          })

          top5 = Array.from(aggMap.entries())
            .map(([nom, val]) => ({ nom, qte: val.quantite, montant: val.totalVentes }))
            .sort((a, b) => b.montant - a.montant)
            .slice(0, 5)
        }

        const margePercent = caDuJour > 0 ? Math.round((margeBruteJour / caDuJour) * 100) : 0

        // G. Construction du texte & HTML
        const top5Text = top5.length > 0
          ? top5.map((p, i) => `  ${i + 1}. ${p.nom} - ${p.qte} vendus - ${formatFCFA(p.montant)}`).join('\n')
          : '  Aucune vente enregistrée pour cette session.'

        const textBody = `
Fermeture de Caisse GESTIO 229 (Arrêté Automatique de 23h00)
===========================================================
${dateFormatted} à ${heureFormatted} - Service Arrêté Automatique
Entreprise : ${company.name}

CHIFFRE D'AFFAIRES DU JOUR :
- CA total du jour : ${formatFCFA(caDuJour)}

DÉTAILS ENCAISSEMENTS :
- Espèce du jour : ${formatFCFA(espVentes)}
- Momo du jour (MTN + Moov) : ${formatFCFA(momoVentes)}

RENTABILITÉ & SORTIES :
- Marge brute du jour : ${formatFCFA(margeBruteJour)} (${margePercent}%)
- Dépenses du jour : ${formatFCFA(totalDepensesJour)}
- Remboursement du jour : ${formatFCFA(totalRemboursementsJour)}

SITUATION CRÉANCES :
- Situation des créances actuel : ${formatFCFA(totalCreances)} (total restant dû clients à ce jour)

TOP 5 PRODUITS VENDUS DU JOUR :
${top5Text}

Rapport généré par GESTIO 229 - ${company.name}
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
  <title>Fermeture de Caisse - ${company.name}</title>
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
                    ${dateFormatted} à ${heureFormatted} — <strong style="color: #FFFFFF;">Arrêté Automatique de 23h00</strong>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">
                    Entreprise : <span style="color: #FFFFFF;">${company.name}</span>
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
                          ${formatFCFA(caDuJour)}
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
                          ${formatFCFA(espVentes)}
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
                          ${formatFCFA(momoVentes)}
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
                          ${formatFCFA(margeBruteJour)} <span style="font-size: 12px; font-weight: 800; color: #0E9F6E; margin-left: 4px;">(${margePercent}%)</span>
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
                          ${formatFCFA(totalDepensesJour)}
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
                          ${formatFCFA(totalRemboursementsJour)}
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
                          ${formatFCFA(totalCreances)}
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
                    Rapport généré par GESTIO 229 — <strong style="color: #0F1F3C;">${company.name}</strong>
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

        // H. Envoi Gmail SMTP via Nodemailer
        const mailOptions = {
          from: fromHeader,
          to: recipients.join(', '),
          subject,
          text: textBody,
          html: htmlBody
        }

        const info = await transporter.sendMail(mailOptions)
        results.push({
          company: company.name,
          recipients,
          status: 'sent',
          messageId: info.messageId
        })
      } catch (cErr: any) {
        console.error(`[cron-rapport-caisse] Erreur entreprise ${company.name} :`, cErr)
        results.push({ company: company.name, status: 'error', error: cErr.message })
      }
    }

    console.log('[cron-rapport-caisse] ✅ Exécution Cron 23h00 terminée :', results)
    return res.status(200).json({
      success: true,
      execution_date: todayDate,
      processed: results.length,
      results
    })
  } catch (globalErr: any) {
    console.error('[cron-rapport-caisse] Erreur globale :', globalErr)
    return res.status(500).json({ success: false, error: globalErr.message })
  }
}
