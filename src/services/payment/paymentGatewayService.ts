// =============================================================================
// GESTIO 229 SaaS — SERVICE D'ARCHITECTURE PAIEMENT AUTOMATIQUE (Section 8)
// =============================================================================
// Architecture propre et découplée prête pour le branchement d'une passerelle
// de paiement officielle (MTN MoMo API, Moov Money API, Celtiis Cash, FedaPay, Kkiapay).
// RÈGLE DE SÉCURITÉ STRICTE :
// - Ne jamais simuler un paiement réussi fictif.
// - Ne jamais activer un abonnement sur simple redirection navigateur sans vérification serveur.
// =============================================================================

export type AutomaticPaymentStatus =
  | 'unavailable'
  | 'initiated'
  | 'pending_webhook'
  | 'verified_server'
  | 'failed'
  | 'duplicate_rejected'

export interface AutomaticPaymentInitRequest {
  companyId: string
  companyName: string
  sectorSlug: string // 'all' ou slug spécifique
  durationMonths: number
  amountFcfa: number
  payerPhone?: string
  operator?: 'MTN' | 'MOOV' | 'CELTIIS' | 'CARD'
}

export interface AutomaticPaymentInitResult {
  available: boolean
  status: AutomaticPaymentStatus
  message: string
  transactionReference?: string
  requiresServerWebhookVerification: boolean
}

export interface WebhookVerificationPayload {
  transactionReference: string
  providerTransactionId: string
  signature: string
  amountFcfa: number
  companyId: string
  sectorSlug: string
  durationMonths: number
}

export const AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE =
  'Le paiement automatique sera bientôt disponible. Pour activer votre abonnement dès maintenant, veuillez utiliser le paiement manuel.'

/**
 * Initialise une demande de paiement automatique.
 * Tant que la passerelle API de production n'est pas activée côté serveur,
 * retourne proprement le message informatif officiel sans jamais simuler de paiement.
 */
export async function initiateAutomaticSubscriptionPayment(
  _req: AutomaticPaymentInitRequest
): Promise<AutomaticPaymentInitResult> {
  return {
    available: false,
    status: 'unavailable',
    message: AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE,
    requiresServerWebhookVerification: true,
  }
}

/**
 * Point d'entrée préparé pour la vérification serveur d'un webhook de paiement automatique.
 * Empêche toute activation sur simple redirection client et bloque les doublons.
 */
export async function verifyAutomaticPaymentServerSide(
  payload: WebhookVerificationPayload
): Promise<{ verified: boolean; status: AutomaticPaymentStatus; error?: string }> {
  if (!payload?.transactionReference || !payload?.signature || !payload?.providerTransactionId) {
    return {
      verified: false,
      status: 'failed',
      error: 'Signature serveur ou référence fournisseur manquante. Activation refusée.',
    }
  }

  return {
    verified: false,
    status: 'unavailable',
    error: AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE,
  }
}
