// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/auth-register
// Inscription Sécurisée d'Entreprise & Contrôle Strict des Secteurs
//
// RÈGLES STRICTES DE SÉCURITÉ :
// 1. Autoriser un SEUL secteur d'activité principal lors de l'inscription gratuite.
// 2. Interdire formellement toute tentative de sélection simultanée multi-secteurs.
// 3. Enregistrer le secteur principal côté serveur dans la base de données.
// 4. Protection anti-robots, limitation de débit (rate limiting) et détection des comptes suspects.
// 5. Journalisation complète des créations de comptes et tentatives suspectes.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ─── Catalogue officiel des 19 secteurs GESTIO 229 ────────────────────────────
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
  'flotte-geolocalisation'
])

function canonicalSector(raw: string): string {
  if (!raw) return 'boutique'
  const clean = String(raw).toLowerCase().trim().replace(/^sec-/, '')
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
  return clean
}

// ─── Liste noire de domaines emails jetables / suspects ──────────────────────
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'trashmail.com', 'yopmail.com', 'sharklasers.com', 'throwawaymail.com',
  'temp-mail.org', 'getairmail.com', 'dispostable.com', 'fakeinbox.com'
])

// ─── Rate limiting in-memory pour serverless ─────────────────────────────────
const signupAttempts: Map<string, { count: number; resetAt: number }> = new Map()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 min
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

// ─── Client Supabase avec privilèges de gestion ───────────────────────────────
function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// ─── Journalisation Sécurité & Audit ──────────────────────────────────────────
async function logSecurityEvent(
  sb: any,
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
  } catch (_) {
    // Ne jamais bloquer la réponse si la journalisation échoue
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const clientIp = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim()

  const sb = getSupabaseAdmin()

  // 1. Contrôle Anti-Robots & Rate Limiting
  const rateCheck = checkRateLimit(`ip:${clientIp}`, MAX_SIGNUPS_PER_IP)
  if (!rateCheck.allowed) {
    await logSecurityEvent(sb, 'RATE_LIMIT_TRIGGERED', 'warning', { ip: clientIp }, clientIp)
    return res.status(429).json({
      success: false,
      error: 'Trop de tentatives d’inscription depuis cette connexion. Veuillez patienter 15 minutes.'
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
    // Champ Honeypot caché pour piéger les bots automatisés
    website_hp,
  } = req.body || {}

  // Protection Honeypot
  if (website_hp) {
    await logSecurityEvent(sb, 'BOT_DETECTED_HONEYPOT', 'danger', { ip: clientIp, body: req.body }, clientIp)
    return res.status(400).json({ success: false, error: 'Requête non autorisée.' })
  }

  // 2. Validation des champs requis
  if (!company_name || !company_name.trim()) {
    return res.status(400).json({ success: false, error: 'Le nom de l\'entreprise est obligatoire.' })
  }
  if (!responsible_name || !responsible_name.trim()) {
    return res.status(400).json({ success: false, error: 'Le nom du responsable est obligatoire.' })
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ success: false, error: 'Le numéro de téléphone est obligatoire.' })
  }
  if (!email || !email.trim() || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Une adresse e-mail valide est obligatoire.' })
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Le mot de passe doit comporter au moins 6 caractères.' })
  }

  const cleanEmail = String(email).trim().toLowerCase()
  const emailDomain = cleanEmail.split('@')[1] || ''

  // Détection domaine jetable suspect
  let isSuspicious = false
  let suspiciousReason: string | null = null
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    isSuspicious = true
    suspiciousReason = `Adresse email temporaire détectée (${emailDomain})`
  }

  // 3. RÈGLE IMPÉRATIVE NIVEAU 1 : UN SEUL SECTEUR D'ACTIVITÉ PRINCIPAL
  const sectorsArray: string[] = Array.isArray(selected_sectors)
    ? selected_sectors
    : typeof selected_sectors === 'string' && selected_sectors.trim()
    ? [selected_sectors.trim()]
    : []

  if (sectorsArray.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Pour créer votre compte GESTIO229, veuillez sélectionner un seul secteur d\'activité principal.'
    })
  }

  // SI PLUSIEURS SECTEURS SÉLECTIONNÉS : REFUS CÔTÉ SERVEUR AVEC MESSAGE EXACT REQUIS (CDC Section 2 & 8)
  if (sectorsArray.length > 1) {
    await logSecurityEvent(sb, 'MULTI_SECTOR_SIGNUP_ATTEMPT', 'warning', {
      email: cleanEmail,
      company_name,
      attempted_sectors: sectorsArray,
      ip: clientIp,
    }, clientIp)

    return res.status(400).json({
      success: false,
      code: 'MULTI_SECTOR_NOT_ALLOWED',
      error: 'Pour créer votre compte GESTIO229, veuillez sélectionner un seul secteur d\'activité principal. Pour accéder à plusieurs secteurs ou bénéficier de fonctionnalités supplémentaires, veuillez contacter le concepteur.'
    })
  }

  const rawChosenSector = sectorsArray[0]
  const canonicalSlug = canonicalSector(rawChosenSector)

  if (!VALID_SECTOR_SLUGS.has(canonicalSlug)) {
    return res.status(400).json({
      success: false,
      error: `Le secteur « ${rawChosenSector} » n'est pas un secteur valide dans GESTIO 229.`
    })
  }

  try {
    const now = new Date()
    const trialEndsDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Vérifier les créations récentes pour cette IP pour détection d'inscriptions multiples suspectes
    const { count: recentCount } = await sb
      .from('security_audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', clientIp)
      .eq('event_type', 'SIGNUP_SUCCESS')
      .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())

    if (recentCount && recentCount >= 3) {
      isSuspicious = true
      suspiciousReason = suspiciousReason
        ? `${suspiciousReason} ; Plus de 3 inscriptions en 24h depuis cette adresse IP`
        : 'Plus de 3 inscriptions en 24h depuis cette adresse IP (signal suspect)'
    }

    // 4. Création ou liaison de l'entreprise côté serveur
    let companyId: string
    let companyObj: any

    const { data: existingComp } = await sb
      .from('companies')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (existingComp) {
      companyId = existingComp.id
      // Interdiction de changer de secteur si déjà configuré sans validation Super Admin
      const existingPrimary = existingComp.primary_sector || existingComp.active_sector
      const finalSector = existingPrimary ? canonicalSector(existingPrimary) : canonicalSlug

      let updatePayload: any = {
        name: company_name.trim(),
        phone: phone.trim(),
        city: city?.trim() || 'Cotonou',
        country: country || 'Bénin',
        active_sector: finalSector,
        selected_sectors: [finalSector],
        sectors: [finalSector],
        onboarding_completed: true,
        subscription_status: 'trial',
        subscription_plan: 'starter',
        plan: 'starter',
        updated_at: now.toISOString(),
        primary_sector: finalSector,
        authorized_sectors: [finalSector],
        authorized_modules: ['dashboard', 'ventes', 'stock', 'caisse', 'clients', 'depenses', 'abonnement', 'configuration', 'utilisateurs', 'audit'],
        is_suspicious: isSuspicious,
        suspicious_reason: suspiciousReason,
        trial_ends_at: trialEndsDate.toISOString(),
      }

      let updateRes = await sb
        .from('companies')
        .update(updatePayload)
        .eq('id', companyId)
        .select()
        .single()

      if (updateRes.error && (updateRes.error.message?.includes('column') || updateRes.error.code === 'PGRST204')) {
        const coreUpdate = { ...updatePayload }
        delete coreUpdate.primary_sector
        delete coreUpdate.authorized_sectors
        delete coreUpdate.authorized_modules
        delete coreUpdate.is_suspicious
        delete coreUpdate.suspicious_reason
        delete coreUpdate.trial_ends_at
        updateRes = await sb
          .from('companies')
          .update(coreUpdate)
          .eq('id', companyId)
          .select()
          .single()
      }

      if (updateRes.error) throw updateRes.error
      companyObj = updateRes.data
    } else {
      let insertPayload: any = {
        name: company_name.trim(),
        ifu_number: ifu_number?.trim() || '0000000000000',
        phone: phone.trim(),
        email: cleanEmail,
        country: country || 'Bénin',
        city: city?.trim() || 'Cotonou',
        active_sector: canonicalSlug,
        selected_sectors: [canonicalSlug],
        sectors: [canonicalSlug],
        subscription_status: 'trial',
        onboarding_completed: true,
        currency: 'FCFA',
        subscription_plan: 'starter',
        plan: 'starter',
        primary_sector: canonicalSlug,
        authorized_sectors: [canonicalSlug],
        authorized_modules: ['dashboard', 'ventes', 'stock', 'caisse', 'clients', 'depenses', 'abonnement', 'configuration', 'utilisateurs', 'audit'],
        is_suspicious: isSuspicious,
        suspicious_reason: suspiciousReason,
        trial_ends_at: trialEndsDate.toISOString(),
      }

      let insertRes = await sb
        .from('companies')
        .insert(insertPayload)
        .select()
        .single()

      if (insertRes.error && (insertRes.error.message?.includes('column') || insertRes.error.code === 'PGRST204')) {
        const coreInsert = { ...insertPayload }
        delete coreInsert.primary_sector
        delete coreInsert.authorized_sectors
        delete coreInsert.authorized_modules
        delete coreInsert.is_suspicious
        delete coreInsert.suspicious_reason
        delete coreInsert.trial_ends_at
        insertRes = await sb
          .from('companies')
          .insert(coreInsert)
          .select()
          .single()
      }

      if (insertRes.error) throw insertRes.error
      companyId = insertRes.data.id
      companyObj = insertRes.data
    }

    // 5. Initialiser les liaisons sectorielles uniques
    try {
      await sb.from('company_sectors').upsert({
        company_id: companyId,
        sector_slug: canonicalSlug,
        sector_name: canonicalSlug.toUpperCase(),
        is_configured: true,
        configuration: {
          currency: 'FCFA',
          primary: true,
          point_of_sale_name: `${company_name.trim()} — ${canonicalSlug.toUpperCase()}`,
        }
      }, { onConflict: 'company_id,sector_slug' })
    } catch (_) {}

    // 6. Initialiser une caisse opérationnelle unique pour ce secteur principal
    try {
      await sb.from('caisses').insert({
        company_id: companyId,
        sector_slug: canonicalSlug,
        secteur_slug: canonicalSlug,
        nom: `Caisse Principale ${canonicalSlug.toUpperCase()}`,
        statut: 'fermee',
        fond_ouverture_especes: 0,
        fond_ouverture_momo: 0,
        solde_especes_final: 0
      })
    } catch (_) {}

    // 7. Enregistrer dans subscriptions
    try {
      await sb.from('subscriptions').insert({
        company_id: companyId,
        sector_slug: canonicalSlug,
        plan_slug: 'starter',
        plan_name: 'Période d\'Essai Gratuit 1 Mois',
        status: 'trial',
        price_monthly: 5000,
        started_at: now.toISOString(),
        expires_at: trialEndsDate.toISOString(),
        fin_essai: trialEndsDate.toISOString(),
      })
    } catch (_) {}

    // 8. Journalisation de succès & audit
    await logSecurityEvent(sb, 'SIGNUP_SUCCESS', isSuspicious ? 'warning' : 'info', {
      company_id: companyId,
      company_name: company_name.trim(),
      email: cleanEmail,
      primary_sector: canonicalSlug,
      is_suspicious: isSuspicious,
      suspicious_reason: suspiciousReason,
    }, clientIp)

    // Journal d'audit pour le Super Admin
    try {
      await sb.from('admin_audit_logs').insert({
        admin_username: 'Système Inscription',
        action: 'CREATION_COMPTE_ENTREPRISE',
        company_id: companyId,
        company_name: company_name.trim(),
        sector_slug: canonicalSlug,
        result: isSuspicious ? 'warning' : 'success',
        details: {
          email: cleanEmail,
          phone: phone.trim(),
          primary_sector: canonicalSlug,
          trial_until: trialEndsDate.toISOString(),
          is_suspicious: isSuspicious,
          suspicious_reason: suspiciousReason,
        },
        ip_address: clientIp,
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Entreprise enregistrée avec succès.',
      data: {
        companyId,
        companyName: company_name.trim(),
        email: cleanEmail,
        primarySector: canonicalSlug,
        subscriptionStatus: 'trial',
        trialEndsAt: trialEndsDate.toISOString(),
        isSuspicious,
      }
    })

  } catch (err: any) {
    console.error('[AuthRegister] Erreur serveur:', err.message)
    await logSecurityEvent(sb, 'SIGNUP_ERROR', 'danger', { email: cleanEmail, error: err.message }, clientIp)
    return res.status(500).json({
      success: false,
      error: 'Une erreur est survenue lors de l\'enregistrement. Veuillez réessayer.'
    })
  }
}
