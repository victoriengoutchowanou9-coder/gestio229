// =============================================================================
// GESTIO 229 SaaS — SERVICE OFFICIEL PASSERELLE DE PAIEMENT SAAS PAY
// =============================================================================
// Intégration complète de SaaS Pay pour les abonnements GESTIO229.
// - Initialisation d'une session de paiement hébergée (Hosted Checkout)
// - Redirection vers la page de paiement sécurisée multi-opérateurs
// - Synchronisation et vérification du statut auprès du serveur
// =============================================================================

export type AutomaticPaymentStatus =
  | 'unavailable'
  | 'initiated'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'duplicate_rejected'

export interface AutomaticPaymentInitRequest {
  companyId: string
  companyName: string
  sectorSlug: string // 'all' ou slug spécifique
  sectorsCovered?: string[]
  durationMonths: number
  amountFcfa: number
  payerPhone?: string
  payerEmail?: string
  planSlug?: string
  returnUrl?: string
}

export interface AutomaticPaymentInitResult {
  available: boolean
  status: AutomaticPaymentStatus
  message: string
  checkoutUrl?: string
  sessionId?: string
  transactionReference?: string
  amount?: number
  durationMonths?: number
  requiresServerWebhookVerification: boolean
  error?: string
}

export interface WebhookVerificationPayload {
  transactionReference: string
  providerTransactionId: string
  signature?: string
  amountFcfa: number
  companyId: string
  sectorSlug: string
  durationMonths: number
}

/**
 * Initialise une session de paiement automatique via la passerelle SaaS Pay.
 * Appelle l'endpoint sécurisé du backend GESTIO229 (/api/saaspay-checkout).
 */
export async function initiateAutomaticSubscriptionPayment(
  req: AutomaticPaymentInitRequest
): Promise<AutomaticPaymentInitResult> {
  try {
    const res = await fetch('/api/saaspay-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        company_id: req.companyId,
        company_name: req.companyName,
        sector_slug: req.sectorSlug,
        sectors_covered: req.sectorsCovered || [req.sectorSlug],
        duration_months: req.durationMonths,
        plan_slug: req.planSlug || 'entreprise',
        amount: req.amountFcfa,
        customer_phone: req.payerPhone,
        customer_email: req.payerEmail,
        customer_name: req.companyName,
        return_url: req.returnUrl || window.location.href,
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok || !data?.success) {
      const errMsg = data?.error || 'Échec d\'initialisation du paiement SaaS Pay.'
      return {
        available: false,
        status: 'failed',
        message: errMsg,
        error: errMsg,
        requiresServerWebhookVerification: true,
      }
    }

    return {
      available: true,
      status: 'initiated',
      message: 'Session de paiement prête. Redirection vers SaaS Pay...',
      checkoutUrl: data.checkout_url,
      sessionId: data.session_id,
      transactionReference: data.reference,
      amount: data.amount,
      durationMonths: data.duration_months,
      requiresServerWebhookVerification: true,
    }
  } catch (err: any) {
    return {
      available: false,
      status: 'failed',
      message: `Erreur de connexion avec le service de paiement : ${err?.message || err}`,
      error: err?.message,
      requiresServerWebhookVerification: true,
    }
  }
}

/**
 * Vérifie l'état d'un paiement auprès du backend (qui interroge la base et l'API SaaS Pay).
 */
export async function checkAutomaticPaymentStatus(params: {
  reference?: string
  sessionId?: string
}): Promise<{
  success: boolean
  status: 'pending' | 'successful' | 'failed' | 'cancelled' | 'unknown'
  message?: string
  newExpirationDate?: string
  amount?: number
}> {
  try {
    const query = new URLSearchParams()
    if (params.reference) query.set('ref', params.reference)
    if (params.sessionId) query.set('session_id', params.sessionId)

    const res = await fetch(`/api/saaspay-webhook?${query.toString()}`, {
      method: 'GET',
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        success: false,
        status: 'unknown',
        message: data?.error || 'Erreur lors de la vérification.',
      }
    }

    return {
      success: data.success,
      status: (data.status || 'pending').toLowerCase() as any,
      message: data.message,
      newExpirationDate: data.new_expiration_date || data.subscription_extended_until,
      amount: data.amount,
    }
  } catch (err: any) {
    return {
      success: false,
      status: 'unknown',
      message: err?.message || 'Erreur réseau.',
    }
  }
}

export const AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE =
  'Le paiement automatique SaaS Pay est activé. Cliquez sur « RENOUVELER MON ABONNEMENT » pour procéder au règlement sécurisé.'
