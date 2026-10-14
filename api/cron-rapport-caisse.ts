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
  console.log('[cron-rapport-caisse] ⏰ Démarrage du Cron Job Quotidien de 23h00 via Gmail SMTP...')

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
        let top5: Array<{ nom: string; quantite: number; totalVentes: number }> = []
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
            .map(([nom, val]) => ({ nom, quantite: val.quantite, totalVentes: val.totalVentes }))
            .sort((a, b) => b.totalVentes - a.totalVentes)
            .slice(0, 5)
        }

        // G. Construction du texte & HTML
        const top5Text = top5.length > 0
          ? top5.map((p, i) => `  ${i + 1}. ${p.nom} : ${p.quantite} vendus (${formatFCFA(p.totalVentes)})`).join('\n')
          : '  Aucune vente enregistrée aujourd\'hui.'

        const textBody = `
RAPPORT DE CAISSE AUTOMATIQUE DE 23H00 - GESTIO 229
===================================================
Entreprise : ${company.name}
Date d'arrêté : ${dateFormatted} à ${heureFormatted}

SYNTHÈSE FINANCIÈRE DE LA JOURNÉE :
-----------------------------------
- Chiffre d'Affaires du jour : ${formatFCFA(caDuJour)}
- Caisse Espèces du jour : ${formatFCFA(espVentes)}
- Caisse MoMo du jour : ${formatFCFA(momoVentes)}
- Fond Actuel (Persistant) : ${formatFCFA(fondActuel)}
- Total Dépenses du jour : ${formatFCFA(totalDepensesJour)}
- Marge Brute du jour : ${formatFCFA(margeBruteJour)}
- Total Créances Clients : ${formatFCFA(totalCreances)}

TOP DES 5 MEILLEURS PRODUITS VENDUS :
-------------------------------------
${top5Text}

Rapport généré et envoyé automatiquement par le service d'arrêté de caisse GESTIO 229 à 23h00 via Gmail SMTP.
        `.trim()

        const top5RowsHtml = top5.length > 0
          ? top5.map((p, i) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 12px; font-weight: bold; color: #4338ca;">#${i + 1}</td>
              <td style="padding: 8px 12px; color: #1e293b;">${p.nom}</td>
              <td style="padding: 8px 12px; text-align: right; color: #475569;">${p.quantite}</td>
              <td style="padding: 8px 12px; text-align: right; font-weight: bold; color: #0f172a;">${formatFCFA(p.totalVentes)}</td>
            </tr>
          `).join('')
          : '<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">Aucune vente enregistrée</td></tr>'

        const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #ffffff; padding: 24px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 800;">RAPPORT DE CAISSE AUTOMATIQUE DE 23H00</h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">${company.name} • Arrêté automatique du ${dateFormatted} à ${heureFormatted}</p>
    </div>

    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
        <tbody>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; font-weight: 600;">Chiffre d'Affaires du Jour (CA)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #0f172a;">${formatFCFA(caDuJour)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px;">Caisse Espèces du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #166534;">+${formatFCFA(espVentes)}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px;">Caisse MoMo du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #92400e;">+${formatFCFA(momoVentes)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0; background: #ecfdf5;">
            <td style="padding: 10px 12px; font-weight: 800; color: #065f46;">Fond Actuel (Persistant)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 900; color: #065f46; font-size: 14px;">${formatFCFA(fondActuel)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px;">Total Dépenses du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #991b1b;">-${formatFCFA(totalDepensesJour)}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px;">Marge Brute du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #1e40af;">${formatFCFA(margeBruteJour)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px;">Total Créances Clients</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #b45309;">${formatFCFA(totalCreances)}</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; color: #0f172a; font-weight: 800;">Top 5 Meilleurs Produits Vendus</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
        <thead style="background: #e0e7ff; color: #3730a3; text-transform: uppercase;">
          <tr>
            <th style="padding: 8px 12px; text-align: left;">#</th>
            <th style="padding: 8px 12px; text-align: left;">Produit</th>
            <th style="padding: 8px 12px; text-align: right;">Quantité</th>
            <th style="padding: 8px 12px; text-align: right;">Total Vente</th>
          </tr>
        </thead>
        <tbody>
          ${top5RowsHtml}
        </tbody>
      </table>
    </div>

    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b;">
      Rapport quotidien automatique envoyé à 23h00 par GESTIO 229 • <a href="https://www.gestio229.com" style="color: #4f46e5;">www.gestio229.com</a>
    </div>

  </div>
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
