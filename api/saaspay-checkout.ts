// =============================================================================
// GESTIO 229 SaaS — API ENDPOINT : POST /api/saaspay-checkout
// Initialisation d'une session de paiement hébergée SaaS Pay pour abonnement
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  createSaspayCheckoutSession,
  getSupabaseAdmin,
} from './_lib/saaspayClient'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  // Autoriser CORS pour les requêtes frontend
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const {
    company_id,
    company_name,
    sector_slug = 'all',
    sectors_covered = [],
    duration_months = 1,
    plan_slug = 'entreprise',
    amount,
    customer_email,
    customer_name,
    customer_phone,
    return_url,
  } = req.body || {}

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'Identifiant d\'entreprise (company_id) manquant.' })
  }

  const numericAmount = Number(amount)
  if (!numericAmount || numericAmount <= 0 || isNaN(numericAmount)) {
    return res.status(400).json({ success: false, error: 'Montant d\'abonnement invalide ou nul.' })
  }

  const duration = Math.max(1, Number(duration_months) || 1)
  const sb = getSupabaseAdmin()

  try {
    // 1. Vérifier que l'entreprise existe
    const { data: company, error: compErr } = await sb
      .from('companies')
      .select('id, name, email, phone, subscription_status, subscription_plan')
      .eq('id', company_id)
      .maybeSingle()

    if (compErr || !company) {
      return res.status(404).json({ success: false, error: 'Entreprise introuvable dans GESTIO229.' })
    }

    const effectiveCompanyName = (company_name || company.name || 'Entreprise GESTIO229').trim()
    const rawEmail = (customer_email || company.email || '').trim()
    const effectiveEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
      ? rawEmail
      : `contact.${String(company_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase()}@gestio229.com`
    const effectivePhone = (customer_phone || company.phone || '').trim() || undefined

    // 2. Générer une référence de transaction unique et sécurisée
    const timestamp = Date.now()
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    const transactionReference = `GP-${timestamp}-${randomSuffix}`

    // 3. Déterminer l'URL de retour
    const baseUrl =
      return_url ||
      process.env.VITE_APP_URL ||
      `https://${req.headers.host || 'gestio229.com'}`
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')
    const finalReturnUrl = cleanBaseUrl.includes('/dashboard/abonnement')
      ? `${cleanBaseUrl}${cleanBaseUrl.includes('?') ? '&' : '?'}payment=return&ref=${transactionReference}`
      : `${cleanBaseUrl}/dashboard/abonnement?payment=return&ref=${transactionReference}`

    const description = `Abonnement GESTIO229 — ${effectiveCompanyName} (${duration} mois - ${sector_slug === 'all' ? 'Pack Global' : `Secteur ${sector_slug.toUpperCase()}`})`

    // 4. Appeler l'API SaaS Pay pour générer la session de paiement hébergée
    const sessionRes = await createSaspayCheckoutSession({
      amount: numericAmount,
      currency: 'XOF',
      description,
      customerEmail: effectiveEmail,
      customerName: effectiveCompanyName,
      customerPhone: effectivePhone,
      returnUrl: finalReturnUrl,
      reference: transactionReference,
    })

    if (!sessionRes.success || !sessionRes.checkoutUrl) {
      console.error('[saaspay-checkout] Échec session SaaS Pay:', sessionRes.error, sessionRes.raw)
      return res.status(502).json({
        success: false,
        error: sessionRes.error || 'Erreur lors de l\'initialisation de la session auprès de SaaS Pay.',
        detail: typeof sessionRes.error === 'string' ? sessionRes.error : JSON.stringify(sessionRes.error),
        raw: sessionRes.raw,
      })
    }

    // 5. Enregistrer la transaction en attente dans la table dédiée saaspay_transactions
    try {
      await sb.from('saaspay_transactions').insert({
        company_id,
        company_name: effectiveCompanyName,
        checkout_session_id: sessionRes.id || `cs_${timestamp}`,
        transaction_reference: transactionReference,
        amount: numericAmount,
        currency: 'XOF',
        sector_slug,
        sectors_covered: Array.isArray(sectors_covered) ? sectors_covered : [sector_slug],
        duration_months: duration,
        plan_slug,
        payer_email: effectiveEmail || null,
        payer_name: effectiveCompanyName,
        payer_phone: effectivePhone || null,
        status: 'pending',
        payment_method: 'saas_pay',
        checkout_url: sessionRes.checkoutUrl,
        raw_session_data: sessionRes.raw || {},
      })
    } catch (insertErr: any) {
      console.warn('[saaspay-checkout] Note insertion saaspay_transactions:', insertErr?.message)
    }

    // 6. Enregistrer dans subscription_history pour traçabilité Super Admin
    try {
      await sb.from('subscription_history').insert({
        company_id,
        company_name: effectiveCompanyName,
        sector_slug,
        action: 'demande_paiement_saaspay',
        plan_slug,
        duration_months: duration,
        amount: numericAmount,
        payment_method: 'SaaS Pay',
        payment_reference: transactionReference,
        reason: `Paiement en ligne SaaS Pay (${duration} mois) — En attente de finalisation`,
        comment: JSON.stringify({
          checkout_session_id: sessionRes.id,
          checkout_url: sessionRes.checkoutUrl,
          sectors_covered,
          status: 'pending',
        }),
        performed_by: effectiveCompanyName,
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      checkout_url: sessionRes.checkoutUrl,
      session_id: sessionRes.id,
      reference: transactionReference,
      amount: numericAmount,
      duration_months: duration,
      sector_slug,
      message: 'Session de paiement SaaS Pay générée avec succès.',
    })
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Erreur interne lors de la création de la session de paiement : ${err?.message || err}`,
    })
  }
}
