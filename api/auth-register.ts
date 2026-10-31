// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/auth-register
// Inscription Sécurisée d'Entreprise & Gestion Multi-Secteurs (Refonte V5)
//
// RÈGLES MÉTIER & SÉCURITÉ (Sections 1 & 2) :
// 1. Essai gratuit unique de 30 jours rattaché au compte, couvrant jusqu'à 3 secteurs maximum.
// 2. Possibilité de sélectionner 1, 2, 3 ou plus de 3 secteurs dès l'inscription.
// 3. Les 3 premiers secteurs sont couverts par l'essai gratuit ('rattache_global').
// 4. Les secteurs supplémentaires (à partir du 4e) sont créés avec le statut
//    'en_attente_paiement' (rattache_au_global = false) et ne sont jamais actifs sans validation.
//
// AUTO-CONFIRMATION :
// Si SUPABASE_SERVICE_ROLE_KEY est défini dans les variables d'environnement Vercel,
// le compte est créé avec email_confirm: false → l'utilisateur peut se connecter immédiatement
// sans attendre un email de confirmation (résout le problème de non-réception d'emails).
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const MAX_FREE_TRIAL_SECTORS = 3

const VALID_SECTOR_SLUGS = new Set([
  'quincaillerie',
  'poissonnerie',
  'restaurant',
  'supermarche',
  'pharmacie',
  'station-service',
  'hotel',
  'ecole',
  'immobilier',
  'garage',
  'imprimerie',
  'brasserie',
  'microfinance',
  'agrobusiness',
  'cosmetiques',
  'mercerie',
  'boutique',
  'boulangerie',
  'transport',
  'flotte-geolocalisation',
])

function canonicalSector(raw: string): string {
  if (!raw) return 'boutique'
  const clean = String(raw).toLowerCase().trim().replace(/^sec-/, '').replace(/_/g, '-')
  if (clean === 'impression' || clean === 'imprimerie') return 'imprimerie'
  if (clean === 'station' || clean === 'stationservice' || clean === 'station-service') return 'station-service'
  if (clean === 'microfinance-tontine' || clean === 'tontine' || clean === 'microfinance') return 'microfinance'
  if (clean === 'location' || clean === 'gestion-locative' || clean === 'immobilier') return 'immobilier'
  if (clean === 'agro-business' || clean === 'agro' || clean === 'agrobusiness') return 'agrobusiness'
  if (clean === 'bar-restaurant-maquis' || clean === 'maquis' || clean === 'fast-food' || clean === 'restaurant') return 'restaurant'
  if (clean === 'brasserie' || clean === 'depot-boissons' || clean === 'boissons') return 'brasserie'
  if (clean === 'poissonnerie' || clean === 'poissons') return 'poissonnerie'
  if (clean === 'cosmetique' || clean === 'cosmetiques') return 'cosmetiques'
  if (clean === 'supermarche' || clean === 'superette') return 'supermarche'
  if (clean === 'boutique' || clean === 'general') return 'boutique'
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'gps') return 'flotte-geolocalisation'
  if (clean === 'transport-logistique' || clean === 'logistique' || clean === 'transport') return 'transport'
  return clean
}

function toSecteurCode(slug: string): string {
  const canon = canonicalSector(slug)
  const map: Record<string, string> = {
    'transport': 'TRANSPORT_LOGISTIQUE',
    'station-service': 'STATION_SERVICE',
    'flotte-geolocalisation': 'FLOTTE_GEOLOCALISATION',
    'microfinance': 'MICROFINANCE',
    'immobilier': 'IMMOBILIER',
    'imprimerie': 'IMPRIMERIE',
    'agrobusiness': 'AGROBUSINESS',
    'cosmetiques': 'COSMETIQUES',
  }
  if (map[canon]) return map[canon]
  return canon.toUpperCase().replace(/-/g, '_')
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'trashmail.com', 'yopmail.com', 'sharklasers.com', 'throwawaymail.com',
  'temp-mail.org', 'getairmail.com', 'dispostable.com', 'fakeinbox.com',
])

const signupAttempts: Map<string, { count: number; resetAt: number }> = new Map()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000
const MAX_SIGNUPS_PER_IP = 6

function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = signupAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    signupAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: limit - 1 }
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 }
  }
  entry.count += 1
  return { allowed: true, remaining: limit - entry.count }
}

/**
 * Retourne un client Supabase admin.
 * hasAdminKey = true si SUPABASE_SERVICE_ROLE_KEY est défini → auto-confirmation possible.
 */
function getSupabaseAdmin(): { client: ReturnType<typeof createClient>; hasAdminKey: boolean } {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  const key = serviceKey || anonKey
  return {
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    hasAdminKey: !!serviceKey,
  }
}

async function logSecurityEvent(
  sb: ReturnType<typeof createClient>,
  eventType: string,
  severity: 'info' | 'warning' | 'danger',
  details: any,
  ip: string
) {
  try {
    await sb.from('security_audit_logs').insert({
      event_type: eventType,
      severity,
      company_id: details.company_id || null,
      company_name: details.company_name || null,
      user_id: details.user_id || null,
      user_email: details.email || null,
      target_sector: details.target_sector || null,
      ip_address: ip,
      details: { ...details, timestamp: new Date().toISOString() },
    })
  } catch (_) {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Methode non autorisee. Utilisez POST.' })
  }

  const clientIp = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim()

  const { client: sb, hasAdminKey } = getSupabaseAdmin()

  const rateCheck = checkRateLimit(`ip:${clientIp}`, MAX_SIGNUPS_PER_IP)
  if (!rateCheck.allowed) {
    await logSecurityEvent(sb, 'RATE_LIMIT_TRIGGERED', 'warning', { ip: clientIp }, clientIp)
    return res.status(429).json({
      success: false,
      error: 'Trop de tentatives inscription depuis cette connexion. Veuillez patienter 15 minutes.',
    })
  }

  const {
    company_name,
    ifu_number,
    responsible_name,
    phone,
    email,
    password,
    country,
    city,
    selected_sectors,
    plan_slug,
    plan_name,
    billing_cycle,
    price_monthly,
    website_hp,
  } = req.body || {}

  if (website_hp) {
    await logSecurityEvent(sb, 'BOT_DETECTED_HONEYPOT', 'danger', { ip: clientIp, body: req.body }, clientIp)
    return res.status(400).json({ success: false, error: 'Requete non autorisee.' })
  }

  if (!company_name || !company_name.trim()) {
    return res.status(400).json({ success: false, error: 'Le nom de l\'entreprise est obligatoire.' })
  }
  if (!responsible_name || !responsible_name.trim()) {
    return res.status(400).json({ success: false, error: 'Le nom du responsable est obligatoire.' })
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ success: false, error: 'Le numero de telephone est obligatoire.' })
  }
  if (!email || !email.trim() || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Une adresse e-mail valide est obligatoire.' })
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Le mot de passe doit comporter au moins 6 caracteres.' })
  }

  const cleanEmail = String(email).trim().toLowerCase()
  const emailDomain = cleanEmail.split('@')[1] || ''

  let isSuspicious = false
  let suspiciousReason: string | null = null
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    isSuspicious = true
    suspiciousReason = `Adresse email temporaire detectee (${emailDomain})`
  }

  const rawSectorsArray: string[] = Array.isArray(selected_sectors)
    ? selected_sectors
    : typeof selected_sectors === 'string' && selected_sectors.trim()
    ? [selected_sectors.trim()]
    : []

  const cleanSectors = Array.from(
    new Set(rawSectorsArray.map((s) => canonicalSector(s)).filter(Boolean))
  )

  if (cleanSectors.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Veuillez selectionner au moins un secteur d\'activite.',
    })
  }

  for (const slug of cleanSectors) {
    if (!VALID_SECTOR_SLUGS.has(slug)) {
      return res.status(400).json({
        success: false,
        error: `Le secteur << ${slug} >> n'est pas un secteur valide dans GESTIO 229.`,
      })
    }
  }

  const primarySector = cleanSectors[0]
  const freeTrialSectors = cleanSectors.slice(0, MAX_FREE_TRIAL_SECTORS)
  const pendingPaidSectors = cleanSectors.slice(MAX_FREE_TRIAL_SECTORS)
  const chosenPlanSlug = plan_slug || (cleanSectors.length > 1 ? 'multisecteur_pro' : 'entreprise')
  const chosenPriceMonthly = typeof price_monthly === 'number' && price_monthly > 0 ? price_monthly : (chosenPlanSlug === 'starter' ? 5000 : (cleanSectors.length > 1 ? 15000 : 10000))

  try {
    const now = new Date()
    const trialEndsDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // =========================================================================
    // ETAPE 1 : Créer le compte Auth Supabase avec auto-confirmation si possible
    // =========================================================================
    let authUserId: string | null = null
    let autoConfirmed = false

    if (hasAdminKey) {
      // Mode admin : création avec email_confirm: false → connexion immédiate
      const { data: adminAuthData, error: adminAuthError } = await (sb.auth as any).admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,  // Confirmation automatique dans Supabase Auth

        user_metadata: {
          full_name: responsible_name.trim(),
          responsible_name: responsible_name.trim(),
          company_name: company_name.trim(),
          phone: phone.trim(),
          ifu_number: (ifu_number || '').trim() || '0000000000000',
          city: city || 'Cotonou',
          country: country || 'Benin',
          primary_sector: primarySector,
          selected_sectors: cleanSectors,
          role: 'administrateur',
        },
      })

      if (adminAuthError) {
        // Si le compte existe déjà, on récupère l'ID via la liste admin
        if (adminAuthError.message?.toLowerCase().includes('already registered') ||
            adminAuthError.message?.toLowerCase().includes('already been registered') ||
            adminAuthError.message?.toLowerCase().includes('already exists')) {
          // Compte existant : on continue sans créer (l'utilisateur se reconnectera)
          console.warn('[AuthRegister] Compte auth existant:', cleanEmail)
        } else {
          throw new Error(adminAuthError.message || 'Erreur lors de la creation du compte.')
        }
      } else {
        authUserId = adminAuthData?.user?.id || null
        autoConfirmed = true
      }
    } else {
      // Mode fallback : signUp standard (email de confirmation envoyé)
      // Note: sans SUPABASE_SERVICE_ROLE_KEY, l'auto-confirmation n'est pas disponible
      console.warn('[AuthRegister] SUPABASE_SERVICE_ROLE_KEY non defini — signUp standard utilise (email confirmation requis)')
    }

    // =========================================================================
    // ETAPE 2 : Créer ou mettre à jour l'entreprise dans `companies`
    // =========================================================================
    let companyId: string

    const { data: existingComp } = await sb
      .from('companies')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (existingComp) {
      companyId = existingComp.id
      const updatePayload: any = {
        name: company_name.trim(),
        phone: phone.trim(),
        city: city?.trim() || 'Cotonou',
        country: country || 'Benin',
        active_sector: primarySector,
        selected_sectors: cleanSectors,
        sectors: cleanSectors,
        onboarding_completed: true,
        subscription_status: 'trial',
        subscription_plan: chosenPlanSlug,
        plan: chosenPlanSlug,
        initial_plan: chosenPlanSlug,
        updated_at: now.toISOString(),
      }

      const updateRes = await sb
        .from('companies')
        .update(updatePayload)
        .eq('id', companyId)
        .select()
        .single()

      if (updateRes.error) throw updateRes.error
    } else {
      const insertPayload: any = {
        name: company_name.trim(),
        ifu_number: (ifu_number || '').trim() || '0000000000000',
        phone: phone.trim(),
        email: cleanEmail,
        country: country || 'Benin',
        city: city?.trim() || 'Cotonou',
        active_sector: primarySector,
        selected_sectors: cleanSectors,
        sectors: cleanSectors,
        subscription_status: 'trial',
        onboarding_completed: true,
        currency: 'FCFA',
        subscription_plan: chosenPlanSlug,
        plan: chosenPlanSlug,
        initial_plan: chosenPlanSlug,
      }

      const insertRes = await sb
        .from('companies')
        .insert(insertPayload)
        .select()
        .single()

      if (insertRes.error) throw insertRes.error
      companyId = insertRes.data.id
    }

    // =========================================================================
    // ETAPE 3 : Créer le profil utilisateur dans `user_profiles` si authUserId connu
    // =========================================================================
    if (authUserId) {
      const defaultAdminPermissions = {
        admin: true,
        commercial: true,
        stock: true,
        treasury: true,
        purchases: true,
        reporting: true,
        accounting: true,
        hr: true,
        ventes: { view: true, create: true, edit: true, delete: true },
        finances: { view: true, caisse: true, tresorerie: true },
      }

      try {
        const { data: existingProfile } = await sb
          .from('user_profiles')
          .select('id')
          .or(`auth_user_id.eq.${authUserId},email.ilike.${cleanEmail}`)
          .maybeSingle()

        if (existingProfile) {
          await sb
            .from('user_profiles')
            .update({
              company_id: companyId,
              auth_user_id: authUserId,
              full_name: responsible_name.trim(),
              username: cleanEmail,
              email: cleanEmail,
              phone: phone.trim(),
              role: 'administrateur',
              is_active: true,
              permissions: defaultAdminPermissions,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingProfile.id)
        } else {
          await sb
            .from('user_profiles')
            .insert({
              company_id: companyId,
              auth_user_id: authUserId,
              full_name: responsible_name.trim(),
              username: cleanEmail,
              email: cleanEmail,
              phone: phone.trim(),
              role: 'administrateur',
              is_active: true,
              permissions: defaultAdminPermissions,
            })
        }
      } catch (profileErr: any) {
        console.warn('[AuthRegister] Erreur profil (non bloquante):', profileErr.message)
      }
    }

    // =========================================================================
    // ETAPE 4 : Initialiser abonnements_global (Essai unique de 30 jours)
    // =========================================================================
    try {
      await sb.from('abonnements_global').upsert(
        {
          entreprise_id: companyId,
          date_debut_global: now.toISOString(),
          date_fin_global: trialEndsDate.toISOString(),
          statut_global: 'essai',
          plan_code: chosenPlanSlug,
          montant_mensuel_fcfa: chosenPriceMonthly,
        },
        { onConflict: 'entreprise_id' }
      )
    } catch (_) {}

    // =========================================================================
    // ETAPE 5 : Initialiser les secteurs (essai gratuit <= 3, en_attente_paiement > 3)
    // =========================================================================
    for (const slug of freeTrialSectors) {
      try {
        await sb.from('abonnements_secteurs').upsert(
          {
            entreprise_id: companyId,
            secteur_code: toSecteurCode(slug),
            date_debut_specifique: now.toISOString(),
            date_fin_specifique: trialEndsDate.toISOString(),
            statut_specifique: 'rattache_global',
            is_premiere_activation: false,
            rattache_au_global: true,
          },
          { onConflict: 'entreprise_id,secteur_code' }
        )
      } catch (_) {}
    }

    for (const slug of pendingPaidSectors) {
      try {
        await sb.from('abonnements_secteurs').upsert(
          {
            entreprise_id: companyId,
            secteur_code: toSecteurCode(slug),
            date_debut_specifique: null,
            date_fin_specifique: null,
            statut_specifique: 'en_attente_paiement',
            is_premiere_activation: false,
            rattache_au_global: false,
          },
          { onConflict: 'entreprise_id,secteur_code' }
        )
      } catch (_) {}
    }

    // =========================================================================
    // ETAPE 6 : Journal d'audit Super Admin
    // =========================================================================
    try {
      await sb.from('admin_audit_logs').insert({
        admin_username: 'Systeme Inscription',
        action: 'CREATION_COMPTE_ENTREPRISE',
        company_id: companyId,
        company_name: company_name.trim(),
        sector_slug: primarySector,
        result: isSuspicious ? 'warning' : 'success',
        details: {
          email: cleanEmail,
          phone: phone.trim(),
          selected_sectors: cleanSectors,
          free_trial_sectors: freeTrialSectors,
          pending_paid_sectors: pendingPaidSectors,
          trial_until: trialEndsDate.toISOString(),
          is_suspicious: isSuspicious,
          suspicious_reason: suspiciousReason,
          auto_confirmed: autoConfirmed,
          has_admin_key: hasAdminKey,
        },
        ip_address: clientIp,
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Entreprise enregistree avec succes.',
      data: {
        companyId,
        companyName: company_name.trim(),
        email: cleanEmail,
        primarySector,
        selectedSectors: cleanSectors,
        freeTrialSectors,
        pendingPaidSectors,
        subscriptionStatus: 'trial',
        trialEndsAt: trialEndsDate.toISOString(),
        isSuspicious,
        autoConfirmed,        // true si le compte est confirmé automatiquement
        requiresEmailVerification: !autoConfirmed,  // true si email de confirmation requis
      },
    })
  } catch (err: any) {
    console.error('[AuthRegister] Erreur serveur:', err.message)
    return res.status(500).json({
      success: false,
      error: 'Une erreur est survenue lors de l\'enregistrement. Veuillez reessayer.',
    })
  }
}
