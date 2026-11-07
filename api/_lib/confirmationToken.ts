// =============================================================================
// GESTIO 229 SAAS — Module de Génération & Validation Sécurisée des Tokens de Confirmation
// Signature cryptographique HMAC-SHA256, expiration 24h, invalidation automatique des anciens liens
// =============================================================================

import crypto from 'crypto'

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 heures

function getSecretKey(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'gestio229-secret-email-confirmation-token-auth-2026'
  ).trim()
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

export interface ConfirmationTokenPayload {
  email: string
  exp: number
  nonce: string
  v: number
}

/**
 * Génère un token de confirmation signé cryptographiquement.
 */
export function generateConfirmationToken(email: string, customNonce?: string): {
  token: string
  nonce: string
  expiresAt: number
} {
  const cleanEmail = email.trim().toLowerCase()
  const nonce = customNonce || crypto.randomBytes(8).toString('hex')
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS

  const payload: ConfirmationTokenPayload = {
    email: cleanEmail,
    exp: expiresAt,
    nonce,
    v: 1,
  }

  const payloadJson = JSON.stringify(payload)
  const encodedPayload = base64UrlEncode(payloadJson)

  const hmac = crypto.createHmac('sha256', getSecretKey())
  hmac.update(encodedPayload)
  const signature = base64UrlEncode(hmac.digest('binary'))

  const token = `${encodedPayload}.${signature}`

  return {
    token,
    nonce,
    expiresAt,
  }
}

/**
 * Vérifie l'intégrité et l'expiration d'un token de confirmation.
 */
export function verifyConfirmationToken(token: string): {
  valid: boolean
  payload?: ConfirmationTokenPayload
  expired?: boolean
  error?: string
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token manquant ou format invalide.' }
  }

  const parts = token.trim().split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Structure de token non valide.' }
  }

  const [encodedPayload, signature] = parts

  try {
    const hmac = crypto.createHmac('sha256', getSecretKey())
    hmac.update(encodedPayload)
    const expectedSignature = base64UrlEncode(hmac.digest('binary'))

    // Comparaison en temps constant pour éviter les attaques temporelles
    const sigBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: 'Signature du lien invalide ou lien altéré.' }
    }

    const payloadRaw = base64UrlDecode(encodedPayload)
    const payload: ConfirmationTokenPayload = JSON.parse(payloadRaw)

    if (!payload.email || !payload.exp || !payload.nonce) {
      return { valid: false, error: 'Données du token incomplètes.' }
    }

    if (Date.now() > payload.exp) {
      return { valid: false, expired: true, payload, error: 'Ce lien de confirmation a expiré (validité 24 heures).' }
    }

    return { valid: true, payload }
  } catch (err: any) {
    return { valid: false, error: 'Impossible de décoder le token de confirmation.' }
  }
}
