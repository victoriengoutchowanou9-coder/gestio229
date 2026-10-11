// =============================================================================
// GESTIO 229 ADMIN — API Endpoint : POST /api/admin-auth
// Authentification sécurisée du Super Administrateur Universel
// Les identifiants sont UNIQUEMENT dans les variables d'environnement Vercel.
// Le mot de passe N'EST JAMAIS stocké en clair ni dans le code ni dans la BDD.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

// ─── Limiter les tentatives de connexion (simple in-memory pour serverless) ──
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10
const attempts: Map<string, { count: number; resetAt: number }> = new Map()

function getRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 }
  }
  entry.count += 1
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count }
}

// ─── Génération / Validation du token de session Admin ────────────────────
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET || 'gestio229_admin_secret_change_in_production'
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000 // 8 heures

function generateAdminToken(username: string): string {
  const payload = {
    sub: 'super_admin',
    username,
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION_MS,
    role: 'super_admin_universel',
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${sig}`
}

export function verifyAdminToken(token: string): { valid: boolean; payload?: any } {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return { valid: false }
    const [payloadB64, sig] = parts
    const expectedSig = crypto
      .createHmac('sha256', ADMIN_SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url')
    if (sig !== expectedSig) return { valid: false }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (payload.exp < Date.now()) return { valid: false }
    if (payload.role !== 'super_admin_universel') return { valid: false }
    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// ─── Comparaison sécurisée des identifiants (timing-safe) ─────────────────
function secureCompare(a: string, b: string): boolean {
  try {
    if (a.length !== b.length) {
      // Pour éviter les timing attacks, on compare quand même
      const bufA = Buffer.alloc(Math.max(a.length, b.length), 0)
      const bufB = Buffer.alloc(Math.max(a.length, b.length), 0)
      bufA.write(a)
      bufB.write(b)
      return crypto.timingSafeEqual(bufA, bufB) && a.length === b.length
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

// ─── Vérification du mot de passe (hash SHA-256 ou texte via env) ─────────
function verifyPassword(input: string): boolean {
  const adminPasswordHash = (process.env.ADMIN_PASSWORD_HASH || '').trim()
  const adminPasswordPlain = (process.env.ADMIN_PASSWORD || '').trim()
  const cleanInput = (input || '').trim()

  if (adminPasswordHash) {
    // Méthode hash SHA-256
    const inputHash = crypto.createHash('sha256').update(cleanInput).digest('hex')
    return secureCompare(inputHash.toLowerCase(), adminPasswordHash.toLowerCase())
  }
  if (adminPasswordPlain) {
    // Méthode texte en clair
    return secureCompare(cleanInput, adminPasswordPlain)
  }
  return false
}

// ─── Journalisation dans Supabase (côté serveur uniquement) ───────────────
async function logAdminAction(action: string, result: string, details: any, ip: string) {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    )
    await supabase.from('admin_audit_logs').insert({
      admin_username: 'Super Admin',
      action,
      result,
      details: { ...details, ip },
      ip_address: ip,
    })
  } catch (_) {
    // Ne jamais bloquer la réponse si l'audit échoue
  }
}

// ─── Handler Principal ─────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS strict — uniquement depuis le même domaine
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' })
  }

  const clientIp =
    String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0]
      .trim()

  // Rate limiting
  const rateCheck = getRateLimit(clientIp)
  if (!rateCheck.allowed) {
    await logAdminAction('CONNEXION_BLOQUEE_RATE_LIMIT', 'failure', { ip: clientIp }, clientIp)
    return res.status(429).json({ success: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' })
  }

  const { username, password } = req.body || {}

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Identifiant ou mot de passe incorrect.' })
  }

  // Récupérer les identifiants depuis les variables d'environnement UNIQUEMENT
  const adminUsername = (process.env.ADMIN_USERNAME || '').trim()

  if (!adminUsername) {
    // Variables non configurées sur Vercel
    console.error('[AdminAuth] ADMIN_USERNAME non défini dans les variables d\'environnement.')
    return res.status(500).json({ success: false, error: 'Configuration serveur incomplète : ADMIN_USERNAME absent.' })
  }

  // Vérification de l'identifiant (insensible à la casse et sans espaces parasites)
  const usernameMatch = secureCompare(String(username).trim().toLowerCase(), adminUsername.toLowerCase())
  const passwordMatch = verifyPassword(String(password))

  if (!usernameMatch || !passwordMatch) {
    await logAdminAction('ECHEC_CONNEXION', 'failure', { attemptedUser: '[masqué]' }, clientIp)
    // Délai artificiel pour freiner les attaques par force brute
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 200))
    return res.status(401).json({ success: false, error: 'Identifiant ou mot de passe incorrect.' })
  }

  // Connexion réussie
  const token = generateAdminToken(adminUsername)
  await logAdminAction('CONNEXION_REUSSIE', 'success', {}, clientIp)

  return res.status(200).json({
    success: true,
    token,
    expiresAt: Date.now() + SESSION_DURATION_MS,
    message: 'Connexion Super Admin réussie.',
  })
}
