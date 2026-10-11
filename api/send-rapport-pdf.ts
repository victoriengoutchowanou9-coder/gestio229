// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST /api/send-rapport-pdf
// Envoi du Rapport de Caisse PDF via Brevo API (SMTP transactionnel)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function formatFCFA(n: number = 0): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`
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
    return res.status(455 || 405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
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

    const brevoApiKey = process.env.BREVO_API_KEY

    if (!brevoApiKey) {
      console.warn('[send-rapport-pdf] BREVO_API_KEY non définie dans les variables d\'environnement.')
      return res.status(500).json({
        success: false,
        error: 'Configuration manquante : BREVO_API_KEY n\'est pas définie sur Vercel. Veuillez ajouter votre clé API Brevo dans les variables d\'environnement du projet Vercel.'
      })
    }

    // 1. Récupérer les destinataires actifs
    const targetRecipients: Array<{ email: string; name?: string }> = []
    const seenEmails = new Set<string>()

    // A. Depuis la table parametres_destinataires si companyId fourni
    if (companyId) {
      try {
        const { data: dbDest, error: dbErr } = await supabase
          .from('parametres_destinataires')
          .select('email, nom')
          .eq('company_id', companyId)
          .eq('actif', true)

        if (!dbErr && dbDest && dbDest.length > 0) {
          dbDest.forEach((d) => {
            const em = (d.email || '').trim().toLowerCase()
            if (em && em.includes('@') && !seenEmails.has(em)) {
              seenEmails.add(em)
              targetRecipients.push({ email: em, name: d.nom || em.split('@')[0] })
            }
          })
        }
      } catch (err) {
        console.warn('[send-rapport-pdf] Erreur lecture parametres_destinataires :', err)
      }
    }

    // B. Destinataires supplémentaires passés dans la requête
    if (Array.isArray(customEmails)) {
      customEmails.forEach((raw) => {
        const em = (raw || '').trim().toLowerCase()
        if (em && em.includes('@') && !seenEmails.has(em)) {
          seenEmails.add(em)
          targetRecipients.push({ email: em, name: em.split('@')[0] })
        }
      })
    }

    // C. Si aucun destinataire trouvé, chercher l'email de l'entreprise
    if (targetRecipients.length === 0 && companyId) {
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
            targetRecipients.push({ email: em, name: comp.name || 'Direction' })
          }
        }
      } catch (_) {}
    }

    if (targetRecipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucun destinataire actif configuré. Veuillez ajouter au moins un email actif dans les paramètres des destinataires.'
      })
    }

    // 2. Préparation du résumé textuel et HTML
    const dateFormatted = date || new Date().toLocaleDateString('fr-BJ')
    const heureFormatted = heure || new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
    const caissier = metadata.nomCaissier || metadata.operateur || 'Caissier Principal'
    const secteur = metadata.secteurNom || secteurId || 'Général'
    const ca = Number(metadata.caDuJour) || 0
    const espJour = Number(metadata.especesDuJour) || 0
    const momoJour = Number(metadata.momoDuJour) || 0
    const fondActuel = Number(metadata.fondActuel) || (espJour + momoJour)
    const depensesJour = Number(metadata.totalDepensesJour) || 0
    const margeBrute = Number(metadata.margeBruteJour) || 0
    const totalCreances = Number(metadata.totalCreances) || 0
    const top5: Array<{ nom: string; quantite: number; totalVentes: number }> = metadata.top5Produits || []

    const top5Text = top5.length > 0
      ? top5.map((p, i) => `  ${i + 1}. ${p.nom} : ${p.quantite} vendus (${formatFCFA(p.totalVentes)})`).join('\n')
      : '  Aucune vente enregistrée aujourd\'hui.'

    const textBody = `
RAPPORT DE CAISSE JOURNALIER - GESTIO 229
==========================================
Date : ${dateFormatted}
Heure : ${heureFormatted}
Caissier : ${caissier}
Secteur : ${secteur}

SYNTHÈSE FINANCIÈRE DE LA JOURNÉE :
-----------------------------------
- Chiffre d'Affaires (CA) du jour : ${formatFCFA(ca)}
- Caisse Espèces du jour : ${formatFCFA(espJour)}
- Caisse MoMo du jour : ${formatFCFA(momoJour)}
- Fond Actuel (Persistant) : ${formatFCFA(fondActuel)}
- Total Dépenses du jour : ${formatFCFA(depensesJour)}
- Marge Brute du jour : ${formatFCFA(margeBrute)}
- Total Créances Clients : ${formatFCFA(totalCreances)}

TOP DES 5 MEILLEURS PRODUITS VENDUS :
-------------------------------------
${top5Text}

Le rapport officiel complet au format PDF est disponible en pièce jointe de cet email.

--
GESTIO 229 ERP & SaaS
Solution de Gestion Intégrée Multi-Activités
www.gestio229.com
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
<head>
  <meta charset="utf-8" />
  <title>Rapport Caisse GESTIO - ${dateFormatted}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- En-tête -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #ffffff; padding: 24px; text-align: left;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">RAPPORT DE CAISSE JOURNALIER</h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">GESTIO 229 • Secteur : <strong style="color: #38bdf8;">${secteur}</strong> • Arrêté le ${dateFormatted} à ${heureFormatted}</p>
    </div>

    <!-- Métadonnées -->
    <div style="padding: 18px 24px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; font-size: 12px; color: #475569;">
      <div style="flex: 1;">
        <span style="color: #64748b;">Caissier :</span> <strong style="color: #0f172a;">${caissier}</strong>
      </div>
      <div style="flex: 1; text-align: right;">
        <span style="color: #64748b;">Date & Heure :</span> <strong style="color: #0f172a;">${dateFormatted} à ${heureFormatted}</strong>
      </div>
    </div>

    <!-- Synthèse financière KPI -->
    <div style="padding: 24px;">
      <h3 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; color: #0f172a; font-weight: 800; letter-spacing: 0.5px;">Synthèse Financière du Jour</h3>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
        <tbody>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; font-weight: 600; color: #334155;">Chiffre d'Affaires du Jour (CA)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #0f172a;">${formatFCFA(ca)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; color: #334155;">Caisse Espèces du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #166534;">+${formatFCFA(espJour)}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; color: #334155;">Caisse MoMo du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #92400e;">+${formatFCFA(momoJour)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0; background: #ecfdf5;">
            <td style="padding: 10px 12px; font-weight: 800; color: #065f46;">Fond Actuel (Persistant)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 900; color: #065f46; font-size: 14px;">${formatFCFA(fondActuel)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; color: #334155;">Total Dépenses du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #991b1b;">-${formatFCFA(depensesJour)}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; color: #334155;">Marge Brute du Jour</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #1e40af;">${formatFCFA(margeBrute)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; color: #334155;">Total Créances Clients</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #b45309;">${formatFCFA(totalCreances)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Top 5 Produits -->
      <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; color: #0f172a; font-weight: 800; letter-spacing: 0.5px;">Top 5 Meilleurs Produits Vendus</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
        <thead style="background: #e0e7ff; color: #3730a3; text-transform: uppercase; font-size: 11px;">
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

      <!-- Note PJ -->
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; display: flex; align-items: center; font-size: 12px; color: #166534;">
        <span>📎 <strong>Document PDF joint :</strong> Le rapport officiel détaillé et certifié est disponible en pièce jointe de cet email.</span>
      </div>
    </div>

    <!-- Pied de page -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b;">
      GESTIO 229 — Plateforme de Gestion Commerciale, Caisse & Trésorerie • <a href="https://www.gestio229.com" style="color: #4f46e5; text-decoration: none;">www.gestio229.com</a>
    </div>

  </div>
</body>
</html>
    `.trim()

    // 3. Construction du payload Brevo v3
    const subject = `Rapport Caisse GESTIO - ${dateFormatted}`
    const sender = {
      name: 'GESTIO 229',
      email: process.env.BREVO_SENDER_EMAIL || 'notification@gestio229.com'
    }

    const cleanSectorFileName = (secteur || 'Caisse').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Rapport_Caisse_${cleanSectorFileName}_${dateFormatted.replace(/\//g, '-')}.pdf`

    const brevoPayload: any = {
      sender,
      to: targetRecipients.map((r) => ({ email: r.email, name: r.name })),
      subject,
      htmlContent: htmlBody,
      textContent: textBody
    }

    // Ajouter la pièce jointe PDF si présente
    if (pdfBase64) {
      // Retirer l'éventuel préfixe "data:application/pdf;base64,"
      const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
      brevoPayload.attachment = [
        {
          name: fileName,
          content: cleanBase64
        }
      ]
    }

    // 4. Appel de l'API Brevo v3
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(brevoPayload)
    })

    const brevoData = await brevoRes.json().catch(() => ({}))

    if (!brevoRes.ok) {
      console.error('[send-rapport-pdf] Erreur API Brevo :', brevoRes.status, brevoData)
      return res.status(brevoRes.status).json({
        success: false,
        error: brevoData?.message || `Erreur Brevo (${brevoRes.status}) : Impossible d'envoyer l'email.`,
        details: brevoData
      })
    }

    const emailList = targetRecipients.map((r) => r.email)
    console.log(`[send-rapport-pdf] ✅ Rapport envoyé avec succès à ${emailList.join(', ')} (MessageId: ${brevoData?.messageId})`)

    return res.status(200).json({
      success: true,
      message: `Rapport transmis avec succès à ${emailList.length} destinataire(s) via Brevo.`,
      recipients: emailList,
      messageId: brevoData?.messageId
    })
  } catch (error: any) {
    console.error('[send-rapport-pdf] Exception non gérée :', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erreur interne du serveur lors de l\'envoi du rapport.'
    })
  }
}
