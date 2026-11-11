// =============================================================================
// GESTIO 229 ERP — Vercel Serverless Function : POST & GET /api/send-rapport-pdf
// Envoi du Rapport de Fermeture de Caisse Complet (Email HTML & Pièce jointe PDF)
// Design Professionnel Haute Fidélité, Multi-Secteurs & 100% Mobile Friendly
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendTrackedEmail, getActiveEmailProviderInfo, diagnoseEmailError, getSupabaseClient } from './_lib/emailHelper.ts'

// Cache en mémoire pour protection anti-doublon et idempotence (fenêtre 2 minutes)
const recentDispatches = new Map<string, { timestamp: number; recipients: string[]; messageId?: string }>()
function purgeRecentDispatches() {
  const now = Date.now()
  for (const [key, val] of recentDispatches.entries()) {
    if (now - val.timestamp > 120000) {
      recentDispatches.delete(key)
    }
  }
}

function formatFCFA(n: number = 0): string {
  return `${Math.round(n || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`
}

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

  const actionParam = String(req.query?.action || req.body?.action || '').trim()
  const isTestEmailRoute = actionParam === 'test-email' || (req.url && req.url.includes('test-email'))
  const isCronRoute = actionParam === 'cron' || (req.url && req.url.includes('cron-rapport-caisse'))

  // ── ROUTE TEST EMAIL (GET / POST) ──────────────────────────────────────────
  if (isTestEmailRoute) {
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

    try {
      const sendResult = await sendTrackedEmail({
        to: targetEmail,
        subject: `🧪 Test de Connexion Email — GESTIO 229 (${nowStr})`,
        html,
        text,
        emailType: 'test_email',
        metadata: { isTest: true, triggered_at: nowStr, channel: providerInfo.label },
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

  // ── ROUTE CRON RAPPORT CAISSE ──────────────────────────────────────────────
  if (isCronRoute) {
    if (req.query?.trigger !== 'cloture_validee') {
      return res.status(200).json({
        success: true,
        disabled: true,
        message: 'Envoi automatique programmé désactivé. Le rapport de caisse est envoyé lors de la clôture réelle.',
      })
    }
  }


  // Support GET pour diagnostic
  if (req.method === 'GET') {
    const providerInfo = getActiveEmailProviderInfo()
    return res.status(200).json({
      success: true,
      service: 'send-rapport-pdf',
      provider: providerInfo.provider,
      label: providerInfo.label,
      details: providerInfo.details,
      isHttps: providerInfo.isHttps,
      hasCredentials: providerInfo.provider !== 'unconfigured',
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const supabase = getSupabaseClient()

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const {
      companyId,
      secteurId,
      caisseId,
      date,
      heure,
      pdfBase64,
      emails: customEmails,
      metadata = {},
    } = body

    // 1. Protection Anti-Doublons & Idempotence stricte
    purgeRecentDispatches()
    const idempotencyKey = String(body.clotureId || metadata.clotureId || `${companyId}_${secteurId}_${date}_${metadata.caDuJour}_${metadata.fondActuel}`)
    if (recentDispatches.has(idempotencyKey)) {
      const cached = recentDispatches.get(idempotencyKey)!
      console.log(`[send-rapport-pdf] Requête idempotente détectée pour ${idempotencyKey}, retour confirmation sans réexpédition.`)
      return res.status(200).json({
        success: true,
        message: `Rapport déjà transmis avec succès à ${cached.recipients.length} destinataire(s).`,
        recipients: cached.recipients,
        messageId: cached.messageId,
        idempotent: true,
      })
    }

    // 2. Récupération consolidée de TOUS les destinataires actifs
    const targetEmails: string[] = []
    const seenEmails = new Set<string>()

    // Priorité 1 : Destinataires fournis directement par le client de caisse
    if (Array.isArray(customEmails)) {
      customEmails.forEach((raw) => {
        const em = (raw || '').trim().toLowerCase()
        if (em && em.includes('@') && !seenEmails.has(em)) {
          seenEmails.add(em)
          targetEmails.push(em)
        }
      })
    }

    // Priorité 2 : Destinataires actifs configurés dans parametres_destinataires (BDD)
    try {
      let q = supabase
        .from('parametres_destinataires')
        .select('email, nom, actif, company_id')
        .eq('actif', true)

      if (companyId) {
        q = q.eq('company_id', companyId)
      }

      const { data: dbDest, error: dbErr } = await q

      if (!dbErr && Array.isArray(dbDest)) {
        dbDest.forEach((d) => {
          const em = (d.email || '').trim().toLowerCase()
          if (em && em.includes('@') && !seenEmails.has(em)) {
            seenEmails.add(em)
            targetEmails.push(em)
          }
        })
      }
    } catch (err) {
      console.warn('[send-rapport-pdf] Notice lecture parametres_destinataires :', err)
    }

    // Fallback email officiel entreprise
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

    // Fallback par défaut expéditeur
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

    // 2. Préparation complète des variables financières réelles
    const dateFormatted = date || new Date().toLocaleDateString('fr-BJ')
    const heureFormatted = heure || new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
    const dateHeure = `${dateFormatted} à ${heureFormatted}`
    const caissiere = metadata.nomCaissier || metadata.operateur || metadata.caissiere || 'Caissier(ère)'
    const fermePar = metadata.fermePar || caissiere
    const secteur = metadata.secteurNom || secteurId || metadata.secteur || 'Général'
    const entreprise = metadata.entreprise || metadata.companyName || 'GESTIO 229'
    const caisseReference = metadata.caisseReference || metadata.caisse_name || (caisseId ? `Caisse #${caisseId.slice(0, 8)}` : 'Caisse Principale')

    // Section 1 : Chiffre d'affaires
    const ca = Number(metadata.caDuJour ?? metadata.ca ?? 0)
    const espece = Number(metadata.especesDuJour ?? metadata.espece ?? 0)
    const momo = Number(metadata.momoDuJour ?? metadata.momo ?? 0)
    const ventesCredit = Number(metadata.ventesCredit ?? metadata.nouvellesCreancesJour ?? 0)
    const nombreVentes = Number(metadata.nombreVentes ?? 0)
    const nombreArticles = Number(metadata.nombreArticles ?? 0)

    // Section 2 : Marge
    const marge = Number(metadata.margeBruteJour ?? metadata.marge ?? 0)
    const margePercent = typeof metadata.margePercent === 'number'
      ? metadata.margePercent
      : (ca > 0 ? Math.round((marge / ca) * 100) : 0)
    const coutAchat = Number(metadata.coutAchat ?? (ca > marge ? ca - marge : 0))

    // Section 3 : Bilan Caisse Espèces
    const fondInitial = Number(metadata.fondInitialEspeces ?? metadata.fond_initial ?? 0)
    const encaissementsEsp = Number(metadata.encaissementsEspeces ?? espece)
    const approvEsp = Number(metadata.approvisionnementsEspeces ?? 0)
    const depensesEsp = Number(metadata.depensesEspeces ?? (metadata.totalDepensesJour ? Number(metadata.totalDepensesJour) - Number(metadata.depensesMomo || 0) : 0))
    const retraitsEsp = Number(metadata.retraitsEspeces ?? 0)

    const soldeTheorique = Number(
      metadata.fondTheoriqueEspeces ?? (fondInitial + encaissementsEsp + approvEsp - depensesEsp - retraitsEsp)
    )
    const soldePhysique = Number(metadata.fondReelEspeces ?? metadata.soldePhysiqueEspeces ?? soldeTheorique)
    const ecart = Number(metadata.ecartEspeces ?? metadata.ecart ?? (soldePhysique - soldeTheorique))

    let ecartLibelle = '0 FCFA (Caisse Conforme)'
    if (ecart > 0) ecartLibelle = `+${formatFCFA(ecart)} (Excédent de caisse)`
    else if (ecart < 0) ecartLibelle = `${formatFCFA(ecart)} (Déficit constaté)`

    // Section 4 : Top 5 Produits
    const rawTop5 = metadata.top5Produits || metadata.top5 || []
    const top5: Array<{ nom: string; qte: number; montant: number }> = (Array.isArray(rawTop5) ? rawTop5 : [])
      .slice(0, 5)
      .map((p: any) => ({
        nom: p.nom || p.product_name || p.name || 'Produit',
        qte: Number(p.qte ?? p.quantite ?? 1),
        montant: Number(p.montant ?? p.totalVentes ?? p.total_ttc ?? 0),
      }))

    // Section 5 : Créances
    const creances = Number(metadata.totalCreances ?? metadata.creances ?? 0)
    const nouvCreances = Number(metadata.nouvellesCreancesJour ?? ventesCredit)
    const reglementsCreances = Number(metadata.totalRemboursementsJour ?? metadata.remboursement ?? 0)
    const clientsDebiteurs: Array<{ nom: string; solde: number }> = (Array.isArray(metadata.clientsDebiteurs) ? metadata.clientsDebiteurs : [])
      .slice(0, 5)
      .map((c: any) => ({
        nom: c.nom || c.name || 'Client',
        solde: Number(c.solde ?? c.current_debt ?? 0)
      }))
    const nbDossiers = Number(metadata.nombreDossiersCreances ?? (clientsDebiteurs.length > 0 ? clientsDebiteurs.length : 0))

    // Section 6 : Dépenses
    const totalDepenses = Number(metadata.totalDepensesJour ?? metadata.depenses ?? 0)
    const depensesMomo = Number(metadata.depensesMomo ?? 0)
    const depensesDetails: Array<{ motif: string; montant: number; mode: string; auteur?: string }> = Array.isArray(metadata.depensesDetails)
      ? metadata.depensesDetails.slice(0, 10)
      : []

    // Section 7 : Autres infos
    const nombreClients = metadata.nombreClientsServis ?? (nombreVentes > 0 ? nombreVentes : 0)
    const annulationsCount = Number(metadata.ventesAnnuleesCount ?? 0)
    const annulationsMontant = Number(metadata.ventesAnnuleesMontant ?? 0)
    const observations = (metadata.observations || metadata.notes || '').trim()

    // ── 3. Construction du corps Texte brut (Fallback) ───────────────────────
    const top5Text = top5.length > 0
      ? top5.map((p, i) => `  #${i + 1} ${p.nom} : ${p.qte} vendu(s) — ${formatFCFA(p.montant)}`).join('\n')
      : '  Aucune vente d\'articles enregistrée pour cette session.'

    const depensesText = depensesDetails.length > 0
      ? depensesDetails.map((d) => `  - ${d.motif} : ${formatFCFA(d.montant)} (${d.mode || 'Espèces'})`).join('\n')
      : `  Total dépenses : ${formatFCFA(totalDepenses)}`

    const debiteursText = clientsDebiteurs.length > 0
      ? clientsDebiteurs.map((c) => `  - ${c.nom} : restant dû ${formatFCFA(c.solde)}`).join('\n')
      : '  Aucun client débiteur enregistré.'

    const textBody = `
GESTIO 229 ERP — RAPPORT DE FERMETURE DE CAISSE (Z)
===================================================
Entreprise   : ${entreprise}
Secteur      : ${secteur}
Caisse       : ${caisseReference}
Date & Heure : ${dateHeure}
Caissier(ère): ${caissiere}
Responsable  : ${fermePar}

1. CHIFFRE D'AFFAIRES DU JOUR :
- Chiffre d'Affaires Total : ${formatFCFA(ca)}
- Encaissements Espèces    : ${formatFCFA(espece)}
- Mobile Money (MTN/Moov)  : ${formatFCFA(momo)}
- Ventes à Crédit          : ${formatFCFA(ventesCredit)}
- Nombre de ventes         : ${nombreVentes}
- Articles vendus          : ${nombreArticles}

2. MARGE BÉNÉFICIAIRE :
- Marge totale du jour     : ${formatFCFA(marge)} (${margePercent}%)
- Coût d'achat estimé      : ${formatFCFA(coutAchat)}

3. BILAN DE LA CAISSE ESPÈCES :
- Fond de caisse initial   : ${formatFCFA(fondInitial)}
- + Ventes espèces         : +${formatFCFA(encaissementsEsp)}
${approvEsp > 0 ? `- + Approvisionnements     : +${formatFCFA(approvEsp)}\n` : ''}- - Dépenses espèces       : -${formatFCFA(depensesEsp)}
${retraitsEsp > 0 ? `- - Retraits/Coffre        : -${formatFCFA(retraitsEsp)}\n` : ''}- Solde théorique attendu  : ${formatFCFA(soldeTheorique)}
- Solde physique déclaré   : ${formatFCFA(soldePhysique)}
- Écart constaté           : ${ecartLibelle}

4. TOP 5 PRODUITS VENDUS :
${top5Text}

5. CRÉANCES & CLIENTS :
- Portefeuille total en cours : ${formatFCFA(creances)}
- Nouvelles créances du jour  : ${formatFCFA(nouvCreances)}
- Règlements reçus ce jour    : ${formatFCFA(reglementsCreances)}
Principaux débiteurs :
${debiteursText}

6. RAPPORT DES DÉPENSES :
${depensesText}

7. CONTRÔLE & OBSERVATIONS :
- Clients servis   : ${nombreClients}
- Ventes annulées  : ${annulationsCount}${annulationsMontant > 0 ? ` (${formatFCFA(annulationsMontant)})` : ''}
${observations ? `- Observations    : ${observations}\n` : ''}

Le rapport complet et officiel est joint à cet email au format PDF.
Plateforme GESTIO 229 ERP • www.gestio229.com
    `.trim()

    // ── 4. Construction du template HTML Haute Fidélité ──────────────────────
    const top5RowsHtml = top5.length > 0
      ? top5.map((p, i) => `
        <tr>
          <td align="left" style="padding: 10px 8px; font-size: 13px; color: #1E293B; border-bottom: 1px solid #F1F5F9;">
            <strong style="color: #4F46E5; margin-right: 6px;">#${i + 1}</strong>
            <span style="font-weight: 600;">${p.nom}</span>
          </td>
          <td align="center" style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            ${p.qte}
          </td>
          <td align="right" style="padding: 10px 8px; font-size: 13px; font-weight: 800; color: #0F1F3C; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            ${formatFCFA(p.montant)}
          </td>
        </tr>
      `).join('')
      : `
        <tr>
          <td colspan="3" align="center" style="padding: 14px; font-size: 12px; color: #94A3B8; font-style: italic;">
            Aucune vente d'articles enregistrée pour cette session.
          </td>
        </tr>
      `

    const clientsDebiteursRowsHtml = clientsDebiteurs.length > 0
      ? clientsDebiteurs.map((c) => `
        <tr>
          <td align="left" style="padding: 8px 6px; font-size: 12px; color: #1E293B; border-bottom: 1px solid #FEE2E2;">
            <span style="font-weight: 600;">${c.nom}</span>
          </td>
          <td align="right" style="padding: 8px 6px; font-size: 12px; font-weight: 800; color: #B45309; border-bottom: 1px solid #FEE2E2; white-space: nowrap;">
            ${formatFCFA(c.solde)}
          </td>
        </tr>
      `).join('')
      : ''

    const depensesRowsHtml = depensesDetails.length > 0
      ? depensesDetails.map((d) => `
        <tr>
          <td align="left" style="padding: 8px 6px; font-size: 12px; color: #334155; border-bottom: 1px solid #F1F5F9;">
            ${d.motif || 'Dépense'}
          </td>
          <td align="center" style="padding: 8px 6px; font-size: 11px; color: #64748B; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; background-color: #F1F5F9; font-weight: 600;">${d.mode || 'Espèces'}</span>
          </td>
          <td align="right" style="padding: 8px 6px; font-size: 12px; font-weight: 800; color: #DC2626; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            -${formatFCFA(d.montant)}
          </td>
        </tr>
      `).join('')
      : `
        <tr>
          <td colspan="3" align="center" style="padding: 12px; font-size: 12px; color: #94A3B8; font-style: italic;">
            ${totalDepenses > 0 ? `Total dépenses enregistrées : ${formatFCFA(totalDepenses)}` : 'Aucune dépense enregistrée sur cette caisse.'}
          </td>
        </tr>
      `

    let ecartBadgeColor = '#0E9F6E'
    let ecartBgColor = '#ECFDF5'
    if (ecart < 0) {
      ecartBadgeColor = '#DC2626'
      ecartBgColor = '#FEF2F2'
    } else if (ecart > 0) {
      ecartBadgeColor = '#059669'
      ecartBgColor = '#F0FDF4'
    }

    const htmlBody = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fermeture de Caisse - ${entreprise}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; margin: 0; padding: 24px 8px;">
    <tr>
      <td align="center">

        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);">

          <!-- 1. EN-TÊTE PROFESSIONNEL GESTIO229 -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0F1F3C 0%, #1E1B4B 60%, #312E81 100%); padding: 32px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; padding: 4px 12px; background: rgba(255, 255, 255, 0.12); border-radius: 20px; font-size: 11px; font-weight: 800; color: #A5B4FC; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                      GESTIO 229 • RAPPORT OFFICIEL Z
                    </span>
                    <h1 style="margin: 8px 0 4px; font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px;">
                      FERMETURE DE CAISSE
                    </h1>
                    <p style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #34D399;">
                      ${entreprise}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="border-top: 1px solid rgba(255, 255, 255, 0.15); padding-top: 14px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 12px; color: #CBD5E1; line-height: 1.6;">
                          🏢 <strong>Secteur :</strong> <span style="color: #FFFFFF;">${secteur}</span><br/>
                          👤 <strong>Caissier(ère) :</strong> <span style="color: #FFFFFF;">${caissiere}</span><br/>
                          🔒 <strong>Responsable :</strong> <span style="color: #FFFFFF;">${fermePar}</span>
                        </td>
                        <td align="right" style="font-size: 12px; color: #CBD5E1; line-height: 1.6;">
                          📅 <strong>Date :</strong> <span style="color: #FFFFFF;">${dateFormatted}</span><br/>
                          ⏰ <strong>Heure :</strong> <span style="color: #FFFFFF;">${heureFormatted}</span><br/>
                          🏷️ <strong>Réf Caisse :</strong> <span style="color: #FFFFFF;">${caisseReference}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CORPS DU RAPPORT -->
          <tr>
            <td style="padding: 24px 20px;">

              <!-- 2. CHIFFRE D'AFFAIRES DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    💰 CHIFFRE D'AFFAIRES DU JOUR (VENTES RÉELLES)
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 14px; font-weight: 700; color: #475569;">
                          Chiffre d'Affaires Total
                        </td>
                        <td align="right" style="font-size: 26px; font-weight: 900; color: #0F1F3C; white-space: nowrap;">
                          ${formatFCFA(ca)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #E2E8F0; margin: 12px 0; padding-top: 12px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="left" style="padding: 4px 0; font-size: 13px; color: #334155;">
                                • Encaissements Espèces
                              </td>
                              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 800; color: #0E9F6E;">
                                ${formatFCFA(espece)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="padding: 4px 0; font-size: 13px; color: #334155;">
                                • Paiements Mobile Money (MTN / Moov)
                              </td>
                              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 800; color: #0284C7;">
                                ${formatFCFA(momo)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="padding: 4px 0; font-size: 13px; color: #334155;">
                                • Ventes à Crédit (Créances clients créées)
                              </td>
                              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 800; color: #D97706;">
                                ${formatFCFA(ventesCredit)}
                              </td>
                            </tr>
                            <tr>
                              <td colspan="2" style="border-top: 1px dashed #CBD5E1; padding-top: 8px; margin-top: 8px;"></td>
                            </tr>
                            <tr>
                              <td align="left" style="font-size: 12px; color: #64748B;">
                                Total ventes : <strong>${nombreVentes}</strong> | Total articles vendus : <strong>${nombreArticles}</strong>
                              </td>
                              <td align="right" style="font-size: 11px; color: #94A3B8; font-style: italic;">
                                CA = Espèces + MoMo + Crédit
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 3. MARGE BÉNÉFICIAIRE -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    📈 MARGE BÉNÉFICIAIRE &amp; RENTABILITÉ DU JOUR
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 16px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 13px; font-weight: 700; color: #065F46;">
                          Marge Bénéficiaire Totale
                        </td>
                        <td align="right" style="font-size: 20px; font-weight: 900; color: #0E9F6E; white-space: nowrap;">
                          ${formatFCFA(marge)} <span style="font-size: 14px; font-weight: 800; color: #059669;">(${margePercent}%)</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #A7F3D0; padding-top: 10px; margin-top: 10px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="left" style="font-size: 12px; color: #047857;">
                                Coût d'achat réel des produits vendus :
                              </td>
                              <td align="right" style="font-size: 13px; font-weight: 800; color: #065F46;">
                                ${formatFCFA(coutAchat)}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 4. BILAN DE LA CAISSE ESPÈCES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    💵 BILAN DE LA CAISSE ESPÈCES (CONTRÔLE PHYSIQUE)
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          Fonds de caisse initial
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #0F1F3C;">
                          +${formatFCFA(fondInitial)}
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          + Encaissements ventes en espèces
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #0E9F6E;">
                          +${formatFCFA(encaissementsEsp)}
                        </td>
                      </tr>
                      ${approvEsp > 0 ? `
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          + Approvisionnements de caisse
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #0E9F6E;">
                          +${formatFCFA(approvEsp)}
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          - Dépenses réglées en espèces
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #DC2626;">
                          -${formatFCFA(depensesEsp)}
                        </td>
                      </tr>
                      ${retraitsEsp > 0 ? `
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          - Retraits / Versements coffre
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #DC2626;">
                          -${formatFCFA(retraitsEsp)}
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #E2E8F0; padding-top: 8px; margin-top: 6px;"></td>
                      </tr>
                      <tr style="background-color: #F8FAFC;">
                        <td align="left" style="padding: 8px 10px; font-size: 13px; font-weight: 800; color: #0F1F3C; border-radius: 8px 0 0 8px;">
                          Montant Théorique Attendu en Caisse
                        </td>
                        <td align="right" style="padding: 8px 10px; font-size: 15px; font-weight: 900; color: #0F1F3C; border-radius: 0 8px 8px 0; white-space: nowrap;">
                          ${formatFCFA(soldeTheorique)}
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 8px 10px; font-size: 13px; font-weight: 700; color: #334155;">
                          Montant Physique Déclaré par Caissier
                        </td>
                        <td align="right" style="padding: 8px 10px; font-size: 15px; font-weight: 800; color: #0F1F3C; white-space: nowrap;">
                          ${formatFCFA(soldePhysique)}
                        </td>
                      </tr>
                      <tr style="background-color: ${ecartBgColor};">
                        <td align="left" style="padding: 8px 10px; font-size: 13px; font-weight: 800; color: #1E293B; border-radius: 8px 0 0 8px;">
                          Écart Constaté
                        </td>
                        <td align="right" style="padding: 8px 10px; font-size: 14px; font-weight: 800; color: ${ecartBadgeColor}; border-radius: 0 8px 8px 0; white-space: nowrap;">
                          ${ecartLibelle}
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8; font-style: italic;">
                      ℹ️ Règle comptable : Les paiements Mobile Money et créances sont strictement exclus du solde physique des espèces.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- 5. TOP 5 PRODUITS DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    🏆 TOP 5 DES PRODUITS DU JOUR (PAR CHIFFRE D'AFFAIRES)
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 6px 14px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <thead>
                        <tr style="border-bottom: 2px solid #E2E8F0;">
                          <th align="left" style="padding: 8px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Produit</th>
                          <th align="center" style="padding: 8px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Qté Vendue</th>
                          <th align="right" style="padding: 8px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Chiffre d'Affaires</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${top5RowsHtml}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 6. SITUATION DES CRÉANCES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    📋 GESTION DES CRÉANCES CLIENTS
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 13px; font-weight: 700; color: #92400E;">
                          Portefeuille Total Créances en Cours
                        </td>
                        <td align="right" style="font-size: 18px; font-weight: 900; color: #B45309; white-space: nowrap;">
                          ${formatFCFA(creances)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #FDE68A; padding-top: 8px; margin-top: 8px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="left" style="font-size: 12px; color: #78350F; padding: 3px 0;">
                                • Nouvelles ventes à crédit enregistrées aujourd'hui :
                              </td>
                              <td align="right" style="font-size: 12px; font-weight: 800; color: #92400E; padding: 3px 0;">
                                ${formatFCFA(nouvCreances)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="font-size: 12px; color: #78350F; padding: 3px 0;">
                                • Règlements de créances encaissés aujourd'hui :
                              </td>
                              <td align="right" style="font-size: 12px; font-weight: 800; color: #065F46; padding: 3px 0;">
                                ${formatFCFA(reglementsCreances)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="font-size: 12px; color: #78350F; padding: 3px 0;">
                                • Nombre de dossiers débiteurs actifs :
                              </td>
                              <td align="right" style="font-size: 12px; font-weight: 800; color: #92400E; padding: 3px 0;">
                                ${nbDossiers} client(s)
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ${clientsDebiteursRowsHtml ? `
                      <tr>
                        <td colspan="2" style="padding-top: 10px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; border: 1px solid #FDE68A; padding: 4px 10px;">
                            ${clientsDebiteursRowsHtml}
                          </table>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 7. RAPPORT DES DÉPENSES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    💸 RAPPORT DES DÉPENSES DU JOUR (${formatFCFA(totalDepenses)})
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 6px 14px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <thead>
                        <tr style="border-bottom: 2px solid #E2E8F0;">
                          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Motif</th>
                          <th align="center" style="padding: 8px 6px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Mode</th>
                          <th align="right" style="padding: 8px 6px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${depensesRowsHtml}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 8. AUTRES INFORMATIONS & CONTRÔLE -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    ℹ️ SYNTHÈSE DE CONTRÔLE &amp; OBSERVATIONS
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Clients servis : <strong>${nombreClients}</strong>
                        </td>
                        <td align="right" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Ventes annulées : <strong>${annulationsCount}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Règlements créances reçus : <strong>${metadata.reglementsCreancesCount ?? 0}</strong>
                        </td>
                        <td align="right" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Remboursements effectués : <strong>${metadata.remboursementsCount ?? 0} (${formatFCFA(metadata.totalRemboursementsJour || 0)})</strong>
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Total entrées espèces : <strong>+${formatFCFA(encaissementsEsp + approvEsp)}</strong>
                        </td>
                        <td align="right" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Total sorties espèces : <strong>-${formatFCFA(depensesEsp + retraitsEsp)}</strong>
                        </td>
                      </tr>
                      ${observations ? `
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #E2E8F0; padding-top: 10px; margin-top: 8px;">
                          <div style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px;">
                            <strong style="font-size: 11px; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 4px;">Observations du caissier :</strong>
                            <span style="font-size: 12px; color: #1E293B; font-style: italic;">« ${observations} »</span>
                          </div>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- PIÈCE JOINTE PDF NOTIFICATION -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 10px; padding: 12px 16px;">
                <tr>
                  <td align="left" style="font-size: 12px; font-weight: 700; color: #3730A3;">
                    📎 Le rapport officiel complet avec toutes les pièces justificatives est joint à ce message au format PDF.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="background-color: #0F1F3C; padding: 20px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-size: 12px; font-weight: 700; color: #FFFFFF;">
                    GESTIO 229 ERP • LOGICIEL DE GESTION &amp; CAISSE DU BÉNIN
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 11px; color: #94A3B8; padding-top: 4px;">
                    ${entreprise} • Système certifié et sécurisé • <a href="https://www.gestio229.com" style="color: #34D399; text-decoration: none; font-weight: bold;">www.gestio229.com</a>
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

    // ── 5. Préparation de la pièce jointe PDF ────────────────────────────────
    const cleanSectorFileName = (secteur || 'Caisse').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Fermeture_Caisse_${cleanSectorFileName}_${String(dateFormatted).replace(/\//g, '-')}.pdf`

    const attachments: Array<{ filename: string; content: string; contentType?: string }> = []
    if (pdfBase64) {
      attachments.push({
        filename: fileName,
        content: pdfBase64,
        contentType: 'application/pdf',
      })
    }

    const subject = `🏪 Fermeture de Caisse - ${secteur} - ${dateFormatted}`

    // ── 6. Transmission via le moteur centralisé sendTrackedEmail ───────────
    const sendResult = await sendTrackedEmail({
      to: targetEmails,
      subject,
      html: htmlBody,
      text: textBody,
      emailType: 'cash_report',
      attachments,
      metadata: {
        companyId,
        secteurId,
        caisseId,
        dateFormatted,
        heureFormatted,
        ca,
        espece,
        momo,
        soldeFinal: soldePhysique,
        ecart,
        caissiere,
        entreprise,
      },
    })

    if (sendResult.success) {
      recentDispatches.set(idempotencyKey, {
        timestamp: Date.now(),
        recipients: sendResult.recipients || targetEmails,
        messageId: sendResult.messageId,
      })

      return res.status(200).json({
        success: true,
        message: `Rapport transmis avec succès à ${sendResult.recipients?.length || targetEmails.length} destinataire(s) via ${sendResult.providerLabel}.`,
        recipients: sendResult.recipients || targetEmails,
        messageId: sendResult.messageId,
        provider: sendResult.provider,
        providerLabel: sendResult.providerLabel,
      })
    } else {
      return res.status(200).json({
        success: false,
        error: sendResult.error || 'Erreur lors de l\'envoi du rapport de caisse.',
        diagnostic: sendResult.diagnostic || 'Vérifiez la configuration SMTP dans Vercel.',
        recipients: targetEmails,
        providerLabel: sendResult.providerLabel,
      })
    }
  } catch (err: any) {
    console.error('[send-rapport-pdf] Erreur :', err)
    const diag = diagnoseEmailError(err)

    return res.status(200).json({
      success: false,
      error: err?.message || 'Erreur lors de l\'envoi du rapport de caisse.',
      diagnostic: diag.diagnostic,
      code: diag.code,
    })
  }
}
