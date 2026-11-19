// =============================================================================
// GESTIO 229 SaaS — API ENDPOINT : POST /api/saaspay-checkout
// Initialisation d'une session de paiement hébergée SaaS Pay pour abonnement
// =============================================================================
// Conforme à la documentation officielle SasPay (https://docs.saspay.me)
// - Endpoint SaaS Pay : POST https://api.saspay.me/api/v1/checkout-sessions/
// - Authentification Bearer token : sk_live_...
// - Zéro dépendance fragile : 100% autonome et résilient aux erreurs serveur
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SASPAY_API_BASE_URL =
  process.env.SASPAY_API_URL ||
  (process.env.SASPAY_SECRET_KEY?.startsWith('sk_test_')
    ? 'https://sandbox-api.saspay.me/api/v1'
    : 'https://api.saspay.me/api/v1')

const SASPAY_SECRET_KEY = (
  process.env.SASPAY_SECRET_KEY || 'sk_live_M-qvxLvuKBpCxFXFkIPIn9WvJQuAmQx5hauSwMTIKeI'
).trim()

const OFFICIAL_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
const OFFICIAL_SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

function getSupabaseClient() {
  try {
    return createClient(OFFICIAL_SUPABASE_URL, OFFICIAL_SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch (err: any) {
    console.warn('[saaspay-checkout] Note initialisation Supabase:', err?.message)
    return null
  }
}

/**
 * Appelle l'API officielle SaaS Pay pour générer une session de paiement hébergée
 */
async function createSaspayCheckoutSessionDirect(params: {
  amount: number | string
  currency?: string
  description: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  returnUrl: string
  reference?: string
}): Promise<{ success: boolean; id?: string; checkoutUrl?: string; error?: string; raw?: any }> {
  try {
    const numericAmount = typeof params.amount === 'number' ? params.amount : parseFloat(String(params.amount))
    const formattedAmount = numericAmount.toFixed(2)

    // 1. Validation et normalisation obligatoire de customer_email selon l'API SaaS Pay
    let cleanEmail = (params.customerEmail || '').trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(cleanEmail)) {
      const safeRef = String(params.reference || params.customerName || 'client')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 10)
        .toLowerCase() || 'client'
      cleanEmail = `contact.${safeRef}@gestio229.com`
    }

    // 2. Validation et normalisation obligatoire de customer_name selon l'API SaaS Pay
    let cleanName = (params.customerName || '').trim()
    if (!cleanName || cleanName.length < 2) {
      cleanName = 'Client GESTIO229'
    }

    const payload: any = {
      amount: formattedAmount,
      currency: params.currency || 'XOF',
      description: params.description || 'Abonnement GESTIO229',
      customer_email: cleanEmail,
      customer_name: cleanName,
      return_url: params.returnUrl,
    }

    if (params.customerPhone && params.customerPhone.trim()) {
      payload.customer_phone = params.customerPhone.trim()
    }

    if (params.reference) {
      payload.metadata = {
        reference: params.reference,
      }
    }

    const endpoint = `${SASPAY_API_BASE_URL.replace(/\/$/, '')}/checkout-sessions/`

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SASPAY_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data: any = await res.json().catch(() => null)

    if (!res.ok) {
      let errMsg = ''
      if (typeof data?.error === 'string') {
        errMsg = data.error
      } else if (typeof data?.error === 'object' && data.error !== null) {
        errMsg = Object.entries(data.error)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ')
      } else if (data?.message) {
        errMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message)
      } else if (data?.detail) {
        errMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
      } else if (res.status === 401 || res.status === 403) {
        errMsg = 'Authentification SaaS Pay incorrecte. Clé secrète invalide ou non autorisée.'
      } else {
        errMsg = `Échec création session SaaS Pay (HTTP ${res.status})`
      }
      return { success: false, error: errMsg, raw: data }
    }

    const sessionData = data?.data || data
    const checkoutUrl = sessionData?.checkout_url
    const sessionId = sessionData?.id

    if (!checkoutUrl) {
      return {
        success: false,
        error: 'URL de paiement manquante dans la réponse SaaS Pay.',
        raw: data,
      }
    }

    return {
      success: true,
      id: sessionId,
      checkoutUrl,
      raw: sessionData,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Problème de connexion au serveur de paiement SaaS Pay : ${err?.message || err}`,
    }
  }
}

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

  try {
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
      return res.status(400).json({ success: false, error: "Identifiant d'entreprise (company_id) manquant." })
    }

    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0 || isNaN(numericAmount)) {
      return res.status(400).json({ success: false, error: "Montant d'abonnement invalide ou nul." })
    }

    const duration = Math.max(1, Number(duration_months) || 1)
    const sb = getSupabaseClient()

    let effectiveCompanyName = (company_name || 'Entreprise GESTIO229').trim()
    let rawEmail = (customer_email || '').trim()
    let effectivePhone = (customer_phone || '').trim() || undefined

    // 1. Récupération d'appoint en base Supabase (résiliente)
    if (sb) {
      try {
        const { data: company } = await sb
          .from('companies')
          .select('id, name, email, phone')
          .eq('id', company_id)
          .maybeSingle()

        if (company) {
          if (!effectiveCompanyName || effectiveCompanyName === 'Entreprise GESTIO229') {
            effectiveCompanyName = company.name || effectiveCompanyName
          }
          if (!rawEmail && company.email) {
            rawEmail = company.email.trim()
          }
          if (!effectivePhone && company.phone) {
            effectivePhone = company.phone.trim()
          }
        }
      } catch (dbErr: any) {
        console.warn('[saaspay-checkout] Note consultation entreprise:', dbErr?.message)
      }
    }

    const effectiveEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
      ? rawEmail
      : `contact.${String(company_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase()}@gestio229.com`

    // 2. Générer une référence de transaction unique
    const timestamp = Date.now()
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    const transactionReference = `GP-${timestamp}-${randomSuffix}`

    // 3. Déterminer l'URL de retour
    const baseUrl =
      return_url ||
      process.env.VITE_APP_URL ||
      `https://${req.headers?.host || 'gestio229.com'}`
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')
    const finalReturnUrl = cleanBaseUrl.includes('/dashboard/abonnement')
      ? `${cleanBaseUrl}${cleanBaseUrl.includes('?') ? '&' : '?'}payment=return&ref=${transactionReference}`
      : `${cleanBaseUrl}/dashboard/abonnement?payment=return&ref=${transactionReference}`

    const description = `Abonnement GESTIO229 — ${effectiveCompanyName} (${duration} mois - ${sector_slug === 'all' ? 'Pack Global' : `Secteur ${sector_slug.toUpperCase()}`})`

    // 4. Appel direct de l'API SaaS Pay pour la session de paiement
    const sessionRes = await createSaspayCheckoutSessionDirect({
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
        error: sessionRes.error || "Problème de connexion au serveur de paiement SaaS Pay.",
        detail: sessionRes.error,
        raw: sessionRes.raw,
      })
    }

    // 5. Enregistrement asynchrone non-bloquant en base Supabase
    if (sb) {
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
    }

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
    console.error('[saaspay-checkout] Erreur globale inattendue:', err)
    return res.status(500).json({
      success: false,
      error: "Initialisation du paiement impossible pour le moment. Veuillez réessayer.",
      detail: err?.message || String(err),
    })
  }
}
