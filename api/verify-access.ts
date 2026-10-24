// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/verify-access
// Sécurisation & Contrôle d'Accès Strict Côté Serveur (Section 4 & 11 CDC)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const MAX_FREE_TRIAL_SECTORS = 3

export const STARTER_MODULES = new Set([
  'dashboard',
  'tableau-bord',
  'ventes',
  'vendeur',
  'stock',
  'caisse',
  'clients',
  'fournisseurs',
  'depenses',
  'abonnement',
  'configuration',
  'utilisateurs',
  'audit',
])

export const ADVANCED_MODULES = new Set([
  'finances',
  'tresorerie',
  'rapports',
  'reporting',
  'syscohada',
  'inventaire',
])

const ALWAYS_ACCESSIBLE_MODULES = new Set(['dashboard', 'tableau-bord', 'abonnement'])

function toSecteurCode(raw: string): string {
  const clean = String(raw || 'boutique').toLowerCase().trim().replace(/^sec-/, '').replace(/_/g, '-')
  const map: Record<string, string> = {
    'transport': 'TRANSPORT_LOGISTIQUE',
    'transport-logistique': 'TRANSPORT_LOGISTIQUE',
    'station-service': 'STATION_SERVICE',
    'station': 'STATION_SERVICE',
    'flotte-geolocalisation': 'FLOTTE_GEOLOCALISATION',
    'flotte': 'FLOTTE_GEOLOCALISATION',
    'microfinance': 'MICROFINANCE',
    'microfinance-tontine': 'MICROFINANCE',
    'immobilier': 'IMMOBILIER',
    'gestion-locative': 'IMMOBILIER',
    'location': 'IMMOBILIER',
    'imprimerie': 'IMPRIMERIE',
    'impression': 'IMPRIMERIE',
    'agrobusiness': 'AGROBUSINESS',
    'agro': 'AGROBUSINESS',
    'cosmetiques': 'COSMETIQUES',
    'cosmetique': 'COSMETIQUES',
  }
  if (map[clean]) return map[clean]
  return clean.toUpperCase().replace(/-/g, '_')
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface SecurityVerificationResult {
  allowed: boolean
  code?: string
  error?: string
  details?: any
}

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
      error: 'Identifiant d’entreprise manquant.',
    }
  }

  const { data: company, error: compErr } = await sb
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle()

  if (compErr || !company) {
    return {
      allowed: false,
      code: 'COMPANY_NOT_FOUND',
      error: 'Entreprise introuvable ou inactive.',
    }
  }

  const normModule = String(targetModule || '').toLowerCase().trim()

  if (company.subscription_status === 'suspended' || company.is_active === false) {
    if (normModule !== 'abonnement') {
      return {
        allowed: false,
        code: 'COMPANY_SUSPENDED',
        error: `L’accès à l’entreprise « ${company.name} » est suspendu. Vos données restent conservées en toute sécurité.`,
      }
    }
  }

  if (company.subscription_status === 'deleted') {
    return {
      allowed: false,
      code: 'COMPANY_DELETED',
      error: `L’accès à l’entreprise « ${company.name} » a été désactivé.`,
    }
  }

  // Le Tableau de bord et le module Abonnement restent accessibles pour la consultation et le réabonnement (Section 4)
  if (ALWAYS_ACCESSIBLE_MODULES.has(normModule)) {
    return {
      allowed: true,
      details: {
        companyId: company.id,
        companyName: company.name,
        module: normModule,
      },
    }
  }

  // Vérification de l'abonnement du secteur demandé dans abonnements_global et abonnements_secteurs
  const now = new Date()
  const targetCode = toSecteurCode(targetSector)

  const [{ data: globalSub }, { data: allSecRows }] = await Promise.all([
    sb.from('abonnements_global').select('*').eq('entreprise_id', companyId).maybeSingle(),
    sb.from('abonnements_secteurs').select('*').eq('entreprise_id', companyId).order('created_at', { ascending: true }),
  ])

  const secRows = (allSecRows || []) as any[]
  const secSub = secRows.find((r) => toSecteurCode(r.secteur_code) === targetCode)

  if (secSub) {
    if (secSub.statut_specifique === 'en_attente_paiement') {
      return {
        allowed: false,
        code: 'SECTOR_PENDING_PAYMENT',
        error:
          'Votre secteur a été ajouté avec succès. Pour accéder à l\'ensemble de ses fonctionnalités, veuillez activer votre abonnement.',
      }
    }

    if (secSub.statut_specifique === 'suspendu') {
      return {
        allowed: false,
        code: 'SECTOR_SUSPENDED',
        error: 'L\'abonnement de ce secteur est suspendu.',
      }
    }

    if (secSub.statut_specifique === 'actif' && !secSub.rattache_au_global && secSub.date_fin_specifique) {
      if (new Date(secSub.date_fin_specifique) < now) {
        return {
          allowed: false,
          code: 'SECTOR_SUBSCRIPTION_EXPIRED',
          error: 'L\'abonnement de ce secteur a expiré. Veuillez renouveler votre abonnement.',
        }
      }
      return {
        allowed: true,
        details: { companyId: company.id, sector: targetSector, status: 'actif' },
      }
    }

    // Rattaché au global : vérifier la limite de 3 secteurs si le compte est en essai gratuit
    if (globalSub?.statut_global === 'essai') {
      const trialRattaches = secRows.filter(
        (r) => r.rattache_au_global && r.statut_specifique !== 'en_attente_paiement'
      )
      const idx = trialRattaches.findIndex((r) => toSecteurCode(r.secteur_code) === targetCode)
      if (idx >= MAX_FREE_TRIAL_SECTORS) {
        return {
          allowed: false,
          code: 'TRIAL_SECTOR_LIMIT_EXCEEDED',
          error:
            'Votre essai gratuit couvre déjà 3 secteurs d\'activité. Veuillez activer l\'abonnement de ce secteur supplémentaire.',
        }
      }
    }
  }

  // Vérification de l'expiration globale
  const globalExpired =
    globalSub &&
    (globalSub.statut_global === 'expire' || new Date(globalSub.date_fin_global).getTime() < now.getTime())

  if (globalExpired || company.subscription_status === 'expired') {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_EXPIRED',
      error:
        'Votre période d\'essai ou d\'abonnement est arrivée à son terme. Veuillez souscrire à un abonnement pour débloquer les modules opérationnels.',
    }
  }

  let userProfile: any = null
  if (userId || userEmail) {
    let q = sb.from('user_profiles').select('*').eq('company_id', companyId)
    if (userId) q = q.eq('auth_user_id', userId)
    else if (userEmail) q = q.ilike('email', userEmail)
    const { data: profile } = await q.maybeSingle()
    userProfile = profile
  }

  return {
    allowed: true,
    details: {
      companyId: company.id,
      companyName: company.name,
      role: userProfile?.role || 'administrateur',
      subStatus: globalSub?.statut_global || company.subscription_status,
      ip,
    },
  }
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
