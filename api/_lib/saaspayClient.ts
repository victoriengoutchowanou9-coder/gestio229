// =============================================================================
// GESTIO 229 SaaS — CLIENT OFFICIEL SAAS PAY (API & WEBHOOK HELPER)
// =============================================================================
// Conforme à la documentation officielle SasPay (https://docs.saspay.me)
// - Endpoints officiels : /checkout-sessions/, /checkout-sessions/{id}/status/
// - Authentification Bearer token : sk_live_... / sk_test_...
// - Vérification cryptographique HMAC-SHA256 (X-Webhook-Signature, X-Webhook-Timestamp)
// =============================================================================

import * as crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const SASPAY_API_BASE_URL =
  process.env.SASPAY_API_URL ||
  (process.env.SASPAY_SECRET_KEY?.startsWith('sk_test_')
    ? 'https://sandbox-api.saspay.me/api/v1'
    : 'https://api.saspay.me/api/v1')

export function getSaspaySecretKey(): string {
  const key = process.env.SASPAY_SECRET_KEY || 'sk_live_M-qvxLvuKBpCxFXFkIPIn9WvJQuAmQx5hauSwMTIKeI'
  return key.trim()
}

export function getSaspayWebhookSecret(): string {
  return (process.env.SASPAY_WEBHOOK_SECRET || '').trim()
}

export function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface CreateCheckoutSessionParams {
  amount: number | string // Ex: 10000 or "10000.00"
  currency?: string // XOF
  description: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  returnUrl: string
  reference?: string
}

export interface CheckoutSessionResponse {
  success: boolean
  id?: string
  checkoutUrl?: string
  status?: string
  error?: string
  raw?: any
}

/**
 * Crée une session de paiement hébergée (Hosted Checkout Session) auprès de SasPay
 * Endpoint officiel : POST /api/v1/checkout-sessions/
 */
export async function createSaspayCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CheckoutSessionResponse> {
  const apiKey = getSaspaySecretKey()
  if (!apiKey) {
    return { success: false, error: 'Clé API SaaS Pay (SASPAY_SECRET_KEY) manquante dans la configuration serveur.' }
  }

  // Format du montant : chaîne décimale à 2 décimales (ex: "10000.00")
  const numericAmount = typeof params.amount === 'number' ? params.amount : parseFloat(params.amount)
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

  const endpoint = `${SASPAY_API_BASE_URL}/checkout-sessions/`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      } else {
        errMsg = `Échec création session SaaS Pay (HTTP ${res.status})`
      }
      return { success: false, error: errMsg, raw: data }
    }

    const sessionData = data?.data || data
    const sessionId = sessionData?.id || data?.id
    const checkoutUrl = sessionData?.checkout_url || data?.checkout_url

    if (!checkoutUrl) {
      return {
        success: false,
        error: 'Aucune URL de paiement retournée par SaaS Pay.',
        raw: data,
      }
    }

    return {
      success: true,
      id: sessionId,
      checkoutUrl,
      status: sessionData?.status || 'PENDING',
      raw: data,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Erreur de communication avec SaaS Pay : ${err?.message || err}`,
    }
  }
}

/**
 * Interroge en direct le statut d'une session de paiement auprès de SasPay
 * Endpoint officiel : GET /api/v1/checkout-sessions/{id}/status/
 */
export async function getSaspayCheckoutSessionStatus(sessionId: string): Promise<{
  success: boolean
  status?: string // 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'
  paymentStatus?: string
  amount?: number
  currency?: string
  transactionId?: string
  raw?: any
  error?: string
}> {
  const apiKey = getSaspaySecretKey()
  if (!apiKey) {
    return { success: false, error: 'Clé API SaaS Pay non configurée.' }
  }

  const endpoint = `${SASPAY_API_BASE_URL}/checkout-sessions/${sessionId}/status/`

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        success: false,
        error: data?.message || `Erreur statut session (${res.status})`,
        raw: data,
      }
    }

    const payload = data?.data || data
    const status = (payload?.status || payload?.payment_status || 'PENDING').toUpperCase()

    return {
      success: true,
      status,
      paymentStatus: payload?.payment_status,
      amount: payload?.amount ? parseFloat(payload.amount) : undefined,
      currency: payload?.currency,
      transactionId: payload?.transaction_id || payload?.reference,
      raw: data,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Erreur d'interrogation du statut SaaS Pay : ${err?.message || err}`,
    }
  }
}

/**
 * Vérifie la signature cryptographique HMAC-SHA256 d'un webhook SasPay
 * Header : X-Webhook-Signature
 * Header : X-Webhook-Timestamp
 * Message : `${timestamp}.${rawBody}`
 */
export function verifySaspayWebhookSignature(params: {
  rawBody: string
  signature: string
  timestamp: string | number
  secret: string
}): { valid: boolean; reason?: string } {
  const { rawBody, signature, timestamp, secret } = params

  if (!signature || !timestamp || !secret) {
    return { valid: false, reason: 'En-têtes de signature ou clé secrète manquants.' }
  }

  // Vérification de la fenêtre de rejeu (5 minutes)
  const nowSec = Math.floor(Date.now() / 1000)
  const tsNum = typeof timestamp === 'number' ? timestamp : parseInt(timestamp, 10)
  if (isNaN(tsNum) || Math.abs(nowSec - tsNum) > 300) {
    return { valid: false, reason: 'Horodatage webhook expiré ou décalé (> 5 minutes).' }
  }

  try {
    const message = `${tsNum}.${rawBody}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(message, 'utf8')
      .digest('hex')

    const sigBuf = Buffer.from(signature.toLowerCase(), 'hex')
    const expBuf = Buffer.from(expectedSignature.toLowerCase(), 'hex')

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Signature HMAC invalide.' }
    }

    return { valid: true }
  } catch (err: any) {
    return { valid: false, reason: `Erreur calcul signature : ${err?.message}` }
  }
}
