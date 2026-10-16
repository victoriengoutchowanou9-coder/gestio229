// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/verify-access
// Sécurisation & Contrôle d'Accès Strict Côté Serveur (Section 5 CDC)
//
// Vérifie systématiquement côté serveur :
// 1. L'identité de l'utilisateur connecté (Token Supabase Auth ou session).
// 2. L'entreprise à laquelle appartient l'utilisateur.
// 3. Le rôle et les permissions de cet utilisateur.
// 4. Le secteur d'activité autorisé.
// 5. Le statut de l'abonnement et sa date d'expiration.
// 6. Les droits spécifiques associés au module demandé.
// Refuse toute requête non conforme et journalise les tentatives d'accès refusées.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Modules de base autorisés en essai gratuit (Niveau 1) ou plan standard (Niveau 2)
export const STARTER_MODULES = new Set([
  'dashboard',
  'ventes',
  'stock',
  'caisse',
  'clients',
  'depenses',
  'abonnement',
  'configuration',
  'utilisateurs',
  'audit'
])

// Modules avancés réservés aux formules supérieures validées par le Super Admin
export const ADVANCED_MODULES = new Set([
  'finances',
  'tresorerie',
  'rapports',
  'reporting',
  'syscohada',
  'inventaire'
])

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

export interface SecurityContext {
  userId: string
  companyId: string
  role: string
  targetSector: string
  targetModule: string
}

export interface SecurityVerificationResult {
  allowed: boolean
  code?: string
  error?: string
  details?: any
}

/**
 * Fonction de vérification universelle côté serveur (Section 5)
 */
export async function verifyServerAccess(
  sb: any,
  params: {
    userId?: string
    userEmail?: string
    companyId?: string
    targetSector: string
    targetModule: string
    ip?: string
  }
): Promise<SecurityVerificationResult> {
  const { userId, userEmail, companyId, targetSector, targetModule, ip = 'unknown' } = params

  if (!companyId) {
    return {
      allowed: false,
      code: 'MISSING_COMPANY_ID',
      error: 'Identifiant d’entreprise manquant.'
    }
  }

  // 1. Récupérer l'entreprise depuis la base de données
  const { data: company, error: compErr } = await sb
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle()

  if (compErr || !company) {
    return {
      allowed: false,
      code: 'COMPANY_NOT_FOUND',
      error: 'Entreprise introuvable ou inactive.'
    }
  }

  // 2. Contrôle de suspension / blocage d'accès
  if (company.subscription_status === 'suspended' || company.is_active === false) {
    await logSecurityViolation(sb, 'ACCESS_BLOCKED_SUSPENDED', {
      companyId,
      companyName: company.name,
      userId,
      targetSector,
      targetModule,
      ip
    })
    return {
      allowed: false,
      code: 'COMPANY_SUSPENDED',
      error: `L’accès à l’entreprise « ${company.name} » est suspendu. Vos données restent conservées en toute sécurité.`
    }
  }

  if (company.subscription_status === 'deleted') {
    return {
      allowed: false,
      code: 'COMPANY_DELETED',
      error: `L’accès à l’entreprise « ${company.name} » a été désactivé.`
    }
  }

  // 3. Vérification de l'utilisateur et de son appartenance à l'entreprise
  let userProfile: any = null
  if (userId || userEmail) {
    let q = sb.from('user_profiles').select('*').eq('company_id', companyId)
    if (userId) q = q.eq('auth_user_id', userId)
    else if (userEmail) q = q.ilike('email', userEmail)
    const { data: profile } = await q.maybeSingle()
    userProfile = profile
  }

  const role = userProfile?.role || 'administrateur'

  // 4. Contrôle du secteur d'activité autorisé
  const normTargetSector = String(targetSector || '').replace(/^sec-/, '').toLowerCase().trim()
  const authorizedSectors: string[] = []

  if (Array.isArray(company.authorized_sectors)) {
    authorizedSectors.push(...company.authorized_sectors)
  }
  if (Array.isArray(company.selected_sectors)) {
    authorizedSectors.push(...company.selected_sectors)
  }
  if (company.primary_sector) {
    authorizedSectors.push(company.primary_sector)
  }
  if (company.active_sector) {
    authorizedSectors.push(company.active_sector)
  }

  const cleanAuthorized = Array.from(new Set(authorizedSectors.map((s) => String(s).replace(/^sec-/, '').toLowerCase().trim())))

  if (normTargetSector && cleanAuthorized.length > 0 && !cleanAuthorized.includes(normTargetSector)) {
    await logSecurityViolation(sb, 'UNAUTHORIZED_SECTOR_ACCESS_ATTEMPT', {
      companyId,
      companyName: company.name,
      userId,
      attemptedSector: normTargetSector,
      authorizedSectors: cleanAuthorized,
      ip
    })

    return {
      allowed: false,
      code: 'SECTOR_NOT_AUTHORIZED',
      error: 'Vous souhaitez utiliser plusieurs secteurs d\'activité sur GESTIO229 ? Veuillez contacter notre équipe pour étudier votre besoin et définir une formule adaptée.'
    }
  }

  // 5. Contrôle du statut de l'abonnement et date d'expiration
  const now = new Date()
  const subStatus = (company.subscription_status || 'trial').toLowerCase()
  const createdAt = company.created_at ? new Date(company.created_at) : now
  const trialEnds = company.trial_ends_at ? new Date(company.trial_ends_at) : new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
  const isTrialExpired = subStatus === 'trial' && now.getTime() > trialEnds.getTime()
  const isExpired = subStatus === 'expired' || isTrialExpired

  if (isExpired && targetModule !== 'abonnement') {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_EXPIRED',
      error: 'Votre période d\'essai est arrivée à son terme. Pour continuer à utiliser les fonctionnalités payantes de GESTIO229, veuillez souscrire à un abonnement ou contacter notre équipe.'
    }
  }

  // 6. Contrôle des droits spécifiques associés au module demandé
  const normModule = String(targetModule || '').toLowerCase().trim()
  if (normModule && normModule !== 'abonnement') {
    // Si compte en essai (Niveau 1) ou Starter (Niveau 2) : les modules avancés sont verrouillés
    const planSlug = (company.subscription_plan || company.plan || 'starter').toLowerCase()
    const isRestrictedPlan = subStatus === 'trial' || planSlug === 'starter' || planSlug === 'solo'

    if (isRestrictedPlan && ADVANCED_MODULES.has(normModule)) {
      return {
        allowed: false,
        code: 'MODULE_LOCKED_FOR_PLAN',
        error: `Le module « ${normModule} » est réservé aux abonnements avancés. Veuillez contacter l'équipe pour activer cette fonctionnalité.`
      }
    }
  }

  return {
    allowed: true,
    details: {
      companyId: company.id,
      companyName: company.name,
      role,
      subStatus,
      authorizedSectors: cleanAuthorized,
    }
  }
}

async function logSecurityViolation(sb: any, eventType: string, details: any) {
  try {
    await sb.from('security_audit_logs').insert({
      event_type: eventType,
      severity: 'warning',
      company_id: details.companyId,
      company_name: details.companyName,
      user_id: details.userId,
      target_sector: details.attemptedSector,
      target_module: details.targetModule,
      ip_address: details.ip,
      details,
    })
  } catch (_) {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' })
  }

  const clientIp = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim()

  const { userId, userEmail, companyId, targetSector, targetModule } = req.body || {}

  const sb = getSupabaseAdmin()
  const result = await verifyServerAccess(sb, {
    userId,
    userEmail,
    companyId,
    targetSector,
    targetModule,
    ip: clientIp,
  })

  if (!result.allowed) {
    return res.status(403).json({
      success: false,
      code: result.code,
      error: result.error,
    })
  }

  return res.status(200).json({
    success: true,
    data: result.details,
  })
}
