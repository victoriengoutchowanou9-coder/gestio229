// =============================================================================
// GESTIO 229 SaaS — API ENDPOINT : /api/saaspay-webhook
// Confirmation automatique des paiements SaaS Pay et activation de l'abonnement
// =============================================================================
// - POST : Réception et vérification cryptographique des webhooks SaaS Pay
// - GET  : Vérification et synchronisation manuelle / retour client sécurisé
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getSaspayWebhookSecret,
  getSaspayCheckoutSessionStatus,
  verifySaspayWebhookSignature,
  getSupabaseAdmin,
} from './_lib/saaspayClient.ts'

/**
 * Lit le corps brut d'une requête HTTP pour la vérification HMAC
 */
async function getRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)

  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      resolve(data)
    })
  })
}

/**
 * Active ou prolonge l'abonnement d'une entreprise suite à un paiement confirmé
 * - Si l'abonnement est encore actif : prolonge à partir de la date d'expiration actuelle.
 * - S'il est expiré : calcule la validité à partir de la date de confirmation du paiement.
 */
async function processSubscriptionActivation(params: {
  sb: any
  txRecord: any
  paidAmount: number
  paymentMethod: string
  gatewaySessionId: string
  rawWebhookData: any
}): Promise<{ success: boolean; newExpirationDate?: Date; error?: string }> {
  const { sb, txRecord, paidAmount, paymentMethod, gatewaySessionId, rawWebhookData } = params
  const companyId = txRecord.company_id
  const durationMonths = Math.max(1, Number(txRecord.duration_months) || 1)
  const targetSector = (txRecord.sector_slug || 'all').toLowerCase().trim()
  const now = new Date()

  // 1. Récupérer l'entreprise et ses dates d'abonnement actuelles
  const { data: company, error: compErr } = await sb
    .from('companies')
    .select('id, name, subscription_status, subscription_expires_at, subscription_plan, plan, selected_sectors, activity_sectors')
    .eq('id', companyId)
    .maybeSingle()

  if (compErr || !company) {
    return { success: false, error: 'Entreprise introuvable pour activation.' }
  }

  // 2. Calcul rigoureux des dates (règle prolongation sans écrasement)
  let currentExpiration: Date | null = null
  if (company.subscription_expires_at) {
    const d = new Date(company.subscription_expires_at)
    if (!isNaN(d.getTime())) currentExpiration = d
  }

  // Vérifier également dans subscriptions si présent
  const { data: existingSub } = await sb
    .from('subscriptions')
    .select('id, expires_at, started_at')
    .eq('company_id', companyId)
    .maybeSingle()

  if (existingSub?.expires_at) {
    const subExp = new Date(existingSub.expires_at)
    if (!isNaN(subExp.getTime())) {
      if (!currentExpiration || subExp.getTime() > currentExpiration.getTime()) {
        currentExpiration = subExp
      }
    }
  }

  let finalStart: Date
  let finalEnd: Date

  if (currentExpiration && currentExpiration.getTime() > now.getTime()) {
    // Abonnement encore actif -> Prolonger à partir de la date d'expiration actuelle
    finalStart = now
    finalEnd = new Date(currentExpiration)
    finalEnd.setMonth(finalEnd.getMonth() + durationMonths)
  } else {
    // Abonnement déjà expiré -> Calculer à partir d'aujourd'hui
    finalStart = now
    finalEnd = new Date(now)
    finalEnd.setMonth(finalEnd.getMonth() + durationMonths)
  }

  const finalEndIso = finalEnd.toISOString()
  const finalStartIso = finalStart.toISOString()
  const planCode = txRecord.plan_slug || company.subscription_plan || 'entreprise'

  // 3. Mise à jour de la table `companies`
  await sb
    .from('companies')
    .update({
      subscription_status: 'active',
      is_active: true,
      subscription_expires_at: finalEndIso,
      subscription_plan: planCode,
      plan: planCode,
      updated_at: now.toISOString(),
    })
    .eq('id', companyId)

  // 4. Synchronisation `abonnements_global` et `abonnements_secteurs`
  if (targetSector === 'all') {
    // Global
    await sb.from('abonnements_global').upsert(
      {
        entreprise_id: companyId,
        statut_global: 'actif',
        date_debut_global: finalStartIso,
        date_fin_global: finalEndIso,
        plan_code: planCode,
        montant_mensuel_fcfa: Math.round(paidAmount / durationMonths),
        updated_at: now.toISOString(),
      },
      { onConflict: 'entreprise_id' }
    )

    await sb
      .from('abonnements_secteurs')
      .update({
        statut_specifique: 'rattache_global',
        rattache_au_global: true,
        date_debut_specifique: finalStartIso,
        date_fin_specifique: finalEndIso,
        is_premiere_activation: false,
        updated_at: now.toISOString(),
      })
      .eq('entreprise_id', companyId)
  } else {
    // Secteur spécifique
    const secCode = targetSector.startsWith('sec-') ? targetSector : `sec-${targetSector}`
    await sb.from('abonnements_secteurs').upsert(
      {
        entreprise_id: companyId,
        secteur_code: secCode,
        date_debut_specifique: finalStartIso,
        date_fin_specifique: finalEndIso,
        statut_specifique: 'actif',
        is_premiere_activation: false,
        rattache_au_global: false,
        updated_at: now.toISOString(),
      },
      { onConflict: 'entreprise_id,secteur_code' }
    )
  }

  // 5. Mise à jour ou création dans `subscriptions`
  if (existingSub?.id) {
    await sb
      .from('subscriptions')
      .update({
        status: 'active',
        plan_slug: planCode,
        expires_at: finalEndIso,
        last_payment_date: now.toISOString(),
        last_payment_amount: paidAmount,
        last_payment_method: paymentMethod || 'SaaS Pay',
        last_payment_reference: txRecord.transaction_reference,
        updated_at: now.toISOString(),
      })
      .eq('id', existingSub.id)
  } else {
    await sb.from('subscriptions').insert({
      company_id: companyId,
      plan_slug: planCode,
      plan_name: `Abonnement GESTIO229 (${durationMonths} mois)`,
      status: 'active',
      started_at: finalStartIso,
      expires_at: finalEndIso,
      price_monthly: Math.round(paidAmount / durationMonths),
      last_payment_date: now.toISOString(),
      last_payment_amount: paidAmount,
      last_payment_method: paymentMethod || 'SaaS Pay',
      last_payment_reference: txRecord.transaction_reference,
    })
  }

  // 6. Mise à jour de la transaction dans `saaspay_transactions`
  await sb
    .from('saaspay_transactions')
    .update({
      status: 'successful',
      paid_at: now.toISOString(),
      subscription_extended_until: finalEndIso,
      payment_method: paymentMethod || 'saas_pay',
      raw_webhook_data: rawWebhookData || {},
      updated_at: now.toISOString(),
    })
    .eq('id', txRecord.id)

  // 7. Enregistrement dans `subscription_history`
  await sb.from('subscription_history').insert({
    company_id: companyId,
    company_name: company.name,
    sector_slug: targetSector,
    action: 'paiement_saaspay_valide',
    plan_slug: planCode,
    duration_months: durationMonths,
    old_expires_at: currentExpiration ? currentExpiration.toISOString() : null,
    new_expires_at: finalEndIso,
    amount: paidAmount,
    payment_method: paymentMethod || 'SaaS Pay',
    payment_reference: txRecord.transaction_reference,
    reason: `Paiement en ligne validé via SaaS Pay (${durationMonths} mois) — Abonnement actif`,
    comment: JSON.stringify({
      gateway_session_id: gatewaySessionId,
      transaction_reference: txRecord.transaction_reference,
      paid_at: now.toISOString(),
      status: 'successful',
    }),
    performed_by: 'SaaS Pay Gateway (Automatique)',
  })

  // 8. Enregistrer également dans `demandes_paiement_abonnement` comme validé
  try {
    await sb.from('demandes_paiement_abonnement').insert({
      company_id: companyId,
      company_name: company.name,
      sector_slug: targetSector,
      plan_slug: planCode,
      duration_months: durationMonths,
      total_amount: paidAmount,
      payment_mode: 'saas_pay',
      payment_operator: paymentMethod || 'SaaS Pay',
      transaction_reference: txRecord.transaction_reference,
      status: 'valide',
      reviewed_by: 'SaaS Pay Gateway',
      reviewed_at: now.toISOString(),
      expected_end_at: finalEndIso,
    })
  } catch (_) {}

  // 9. Émission d'une notification in-app
  try {
    await sb.from('notifications').insert({
      company_id: companyId,
      type: 'subscription_renewed',
      title: 'Paiement SaaS Pay confirmé — Abonnement activé',
      message: `Votre paiement de ${paidAmount.toLocaleString('fr-FR')} FCFA a été confirmé avec succès par SaaS Pay. Votre abonnement est actif jusqu'au ${finalEnd.toLocaleDateString('fr-BJ')}.`,
      is_read: false,
      created_at: now.toISOString(),
    })
  } catch (_) {}

  return { success: true, newExpirationDate: finalEnd }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature, X-Webhook-Timestamp')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const sb = getSupabaseAdmin()

  // ─── GESTION DES REQUÊTES GET : VÉRIFICATION ET STATUT EN DIRECT ─────────
  if (req.method === 'GET') {
    const reference = String(req.query.ref || req.query.reference || '').trim()
    const sessionId = String(req.query.session_id || req.query.sessionId || '').trim()

    if (!reference && !sessionId) {
      return res.status(400).json({ success: false, error: 'Paramètre ref ou session_id requis.' })
    }

    try {
      let query = sb.from('saaspay_transactions').select('*')
      if (reference) query = query.eq('transaction_reference', reference)
      else if (sessionId) query = query.eq('checkout_session_id', sessionId)

      const { data: txRecord, error: txErr } = await query.maybeSingle()

      if (txErr || !txRecord) {
        return res.status(404).json({ success: false, error: 'Transaction introuvable.' })
      }

      // Si déjà validé, retourner directement
      if (txRecord.status === 'successful') {
        return res.status(200).json({
          success: true,
          status: 'successful',
          company_id: txRecord.company_id,
          amount: txRecord.amount,
          reference: txRecord.transaction_reference,
          session_id: txRecord.checkout_session_id,
          subscription_extended_until: txRecord.subscription_extended_until,
          message: 'Paiement déjà confirmé et abonnement activé.',
        })
      }

      // Si encore en attente, interroger en direct l'API officielle SaaS Pay pour synchronisation
      const targetSessionId = txRecord.checkout_session_id
      if (targetSessionId && !targetSessionId.startsWith('cs_mock')) {
        const liveStatus = await getSaspayCheckoutSessionStatus(targetSessionId)

        if (liveStatus.success && (liveStatus.status === 'SUCCESS' || liveStatus.paymentStatus === 'PAID')) {
          // Paiement réussi confirmé par l'API SaaS Pay -> Activer immédiatement
          const activation = await processSubscriptionActivation({
            sb,
            txRecord,
            paidAmount: Number(txRecord.amount),
            paymentMethod: 'SaaS Pay (Vérification API directe)',
            gatewaySessionId: targetSessionId,
            rawWebhookData: liveStatus.raw || {},
          })

          if (activation.success) {
            return res.status(200).json({
              success: true,
              status: 'successful',
              company_id: txRecord.company_id,
              amount: txRecord.amount,
              reference: txRecord.transaction_reference,
              new_expiration_date: activation.newExpirationDate,
              message: 'Paiement confirmé avec succès auprès de SaaS Pay. Abonnement activé !',
            })
          }
        } else if (liveStatus.status === 'FAILED' || liveStatus.status === 'CANCELLED') {
          await sb
            .from('saaspay_transactions')
            .update({ status: liveStatus.status.toLowerCase(), updated_at: new Date().toISOString() })
            .eq('id', txRecord.id)

          return res.status(200).json({
            success: false,
            status: liveStatus.status.toLowerCase(),
            message: 'Le paiement a échoué ou a été annulé.',
          })
        }
      }

      return res.status(200).json({
        success: true,
        status: txRecord.status || 'pending',
        amount: txRecord.amount,
        reference: txRecord.transaction_reference,
        message: 'Transaction en cours de traitement.',
      })
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erreur statut.' })
    }
  }

  // ─── GESTION DES REQUÊTES POST : RÉCEPTION DU WEBHOOK SAAS PAY ───────────
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' })
  }

  try {
    const rawBody = await getRawBody(req)
    const signature = String(req.headers['x-webhook-signature'] || '').trim()
    const timestamp = String(req.headers['x-webhook-timestamp'] || '').trim()
    const webhookSecret = getSaspayWebhookSecret()

    // 1. Vérification de la signature cryptographique si le secret est configuré
    if (webhookSecret) {
      const sigCheck = verifySaspayWebhookSignature({
        rawBody,
        signature,
        timestamp,
        secret: webhookSecret,
      })

      if (!sigCheck.valid) {
        console.warn('[saaspay-webhook] Rejet signature HMAC invalide :', sigCheck.reason)
        return res.status(401).json({ success: false, error: sigCheck.reason || 'Signature invalide.' })
      }
    }

    let payload: any = {}
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return res.status(400).json({ success: false, error: 'Payload JSON invalide.' })
    }

    // Normalisation des champs SasPay
    // Structure possible : { event: "transaction.success", data: { id, reference, status, amount } }
    // ou session webhook : { event: "checkout.session.completed", data: { id, status } }
    const event = (payload?.event || payload?.type || '').toLowerCase()
    const eventData = payload?.data || payload

    const sessionId = eventData?.checkout_session_id || eventData?.session_id || eventData?.id || ''
    const reference = eventData?.reference || eventData?.transaction_reference || eventData?.order_id || ''
    const rawStatus = (eventData?.status || eventData?.payment_status || '').toUpperCase()

    // Déterminer si le paiement est un succès
    const isSuccessEvent =
      event === 'transaction.success' ||
      event === 'checkout.session.completed' ||
      event === 'payment.succeeded' ||
      rawStatus === 'SUCCESS' ||
      rawStatus === 'PAID'

    const isFailureEvent =
      event === 'transaction.failed' ||
      event === 'transaction.cancelled' ||
      rawStatus === 'FAILED' ||
      rawStatus === 'CANCELLED'

    // Rechercher l'enregistrement de transaction correspondant
    let txRecord: any = null
    if (sessionId) {
      const { data } = await sb.from('saaspay_transactions').select('*').eq('checkout_session_id', sessionId).maybeSingle()
      if (data) txRecord = data
    }

    if (!txRecord && reference) {
      const { data } = await sb.from('saaspay_transactions').select('*').eq('transaction_reference', reference).maybeSingle()
      if (data) txRecord = data
    }

    if (!txRecord) {
      console.warn('[saaspay-webhook] Aucune transaction trouvée pour session:', sessionId, 'ref:', reference)
      // Retourner 200 pour éviter que SasPay ne réessaye indéfiniment si c'est un événement tiers
      return res.status(200).json({ success: true, message: 'Événement ignoré (aucune transaction correspondante).' })
    }

    // Anti-doublon : Si la transaction est déjà marquée 'successful', ne rien ré-exécuter
    if (txRecord.status === 'successful') {
      return res.status(200).json({ success: true, message: 'Transaction déjà traitée avec succès (idempotence).' })
    }

    // Si événement d'échec ou d'annulation
    if (isFailureEvent) {
      await sb
        .from('saaspay_transactions')
        .update({
          status: 'failed',
          raw_webhook_data: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', txRecord.id)

      return res.status(200).json({ success: true, message: 'Échec de paiement enregistré.' })
    }

    // Si événement de succès
    if (isSuccessEvent) {
      // Sécurité supplémentaire : double vérification auprès de l'API SasPay si possible
      if (sessionId && !sessionId.startsWith('cs_mock')) {
        try {
          const liveCheck = await getSaspayCheckoutSessionStatus(sessionId)
          if (liveCheck.success && liveCheck.status !== 'SUCCESS' && liveCheck.paymentStatus !== 'PAID') {
            console.warn('[saaspay-webhook] Divergence statut API SasPay :', liveCheck.status)
            return res.status(409).json({ success: false, error: 'Statut de paiement non confirmé auprès de l\'API SaaS Pay.' })
          }
        } catch (_) {}
      }

      // Vérification du montant payé
      const expectedAmount = Number(txRecord.amount)
      const reportedAmount = eventData?.amount ? parseFloat(eventData.amount) : expectedAmount

      if (reportedAmount < expectedAmount) {
        console.error(`[saaspay-webhook] Montant insuffisant : reçu ${reportedAmount}, attendu ${expectedAmount}`)
        return res.status(400).json({ success: false, error: 'Montant payé inférieur au montant souscrit.' })
      }

      const activation = await processSubscriptionActivation({
        sb,
        txRecord,
        paidAmount: reportedAmount,
        paymentMethod: eventData?.network || eventData?.payment_method || 'SaaS Pay',
        gatewaySessionId: sessionId || txRecord.checkout_session_id,
        rawWebhookData: payload,
      })

      if (!activation.success) {
        return res.status(500).json({ success: false, error: activation.error })
      }

      return res.status(200).json({
        success: true,
        message: 'Abonnement activé et confirmé avec succès.',
        new_expires_at: activation.newExpirationDate,
      })
    }

    return res.status(200).json({ success: true, message: 'Événement webhook reçu.' })
  } catch (err: any) {
    console.error('[saaspay-webhook] Erreur traitement webhook :', err)
    return res.status(500).json({ success: false, error: err?.message || 'Erreur interne webhook.' })
  }
}
