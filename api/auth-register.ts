// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/auth-register
// Inscription Sécurisée d'Entreprise, Unicité Email Stricte & Envoi d'Email
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendTrackedEmail, buildRegistrationEmailHtml } from './_lib/emailHelper'

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
const MAX_SIGNUPS_PER_IP = 10

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const clientIp = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim()

  const { client: sb, hasAdminKey } = getSupabaseAdmin()

  const rateCheck = checkRateLimit(`ip:${clientIp}`, MAX_SIGNUPS_PER_IP)
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Trop de tentatives d\'inscription depuis cette connexion. Veuillez patienter 15 minutes.',
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
    return res.status(400).json({ success: false, error: 'Requête non autorisée.' })
  }

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

  // Normalisation stricte de l'adresse email
  const cleanEmail = String(email).trim().toLowerCase()
  const emailDomain = cleanEmail.split('@')[1] || ''

  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return res.status(400).json({
      success: false,
      error: 'Les adresses e-mails temporaires ne sont pas autorisées sur GESTIO 229.',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RÈGLE CRITIQUE SECTION B : INTERDICTION ABSOLUE D'EMAIL EN DOUBLE
  // Vérification directe dans la base de données avant toute création
  // ═══════════════════════════════════════════════════════════════════════════
  const DUPLICATE_EMAIL_ERROR =
    'Cette adresse email est déjà associée à un compte GESTIO229. Veuillez vous connecter ou utiliser une autre adresse email.'

  // 1. Vérifier si l'email existe dans `companies`
  const { data: existingComp } = await sb
    .from('companies')
    .select('id, name')
    .ilike('email', cleanEmail)
    .maybeSingle()

  if (existingComp) {
    return res.status(409).json({
      success: false,
      error: DUPLICATE_EMAIL_ERROR,
    })
  }

  // 2. Vérifier si l'email existe dans `user_profiles` pour un compte administrateur
  const { data: existingProfile } = await sb
    .from('user_profiles')
    .select('id, role')
    .ilike('email', cleanEmail)
    .maybeSingle()

  if (existingProfile && (existingProfile.role === 'administrateur' || existingProfile.role === 'super_admin')) {
    return res.status(409).json({
      success: false,
      error: DUPLICATE_EMAIL_ERROR,
    })
  }

  // 3. Normaliser la liste des secteurs d'activité sélectionnés
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
      error: 'Veuillez sélectionner au moins un secteur d\'activité.',
    })
  }

  for (const slug of cleanSectors) {
    if (!VALID_SECTOR_SLUGS.has(slug)) {
      return res.status(400).json({
        success: false,
        error: `Le secteur « ${slug} » n'est pas un secteur valide dans GESTIO 229.`,
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
    // Mois gratuit de 30 jours à compter de la création
    const trialEndsDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // =========================================================================
    // ÉTAPE 1 : Créer le compte Auth Supabase
    // =========================================================================
    let authUserId: string | null = null

    if (hasAdminKey) {
      const { data: adminAuthData, error: adminAuthError } = await (sb.auth as any).admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: false, // L'administrateur principal DOIT confirmer son email
        user_metadata: {
          full_name: responsible_name.trim(),
          responsible_name: responsible_name.trim(),
          company_name: company_name.trim(),
          phone: phone.trim(),
          ifu_number: (ifu_number || '').trim() || '0000000000000',
          city: city || 'Cotonou',
          country: country || 'Bénin',
          primary_sector: primarySector,
          selected_sectors: cleanSectors,
          role: 'administrateur',
        },
      })

      if (adminAuthError) {
        if (
          adminAuthError.message?.toLowerCase().includes('already registered') ||
          adminAuthError.message?.toLowerCase().includes('already been registered') ||
          adminAuthError.message?.toLowerCase().includes('already exists')
        ) {
          return res.status(409).json({
            success: false,
            error: DUPLICATE_EMAIL_ERROR,
          })
        }
        throw new Error(adminAuthError.message || 'Erreur lors de la création du compte.')
      }

      authUserId = adminAuthData?.user?.id || null
    }

    // =========================================================================
    // ÉTAPE 2 : Créer l'entreprise dans `companies` (EXACTEMENT les secteurs choisis)
    // =========================================================================
    const insertCompPayload: any = {
      name: company_name.trim(),
      ifu_number: (ifu_number || '').trim() || '0000000000000',
      phone: phone.trim(),
      email: cleanEmail,
      country: country || 'Bénin',
      city: city?.trim() || 'Cotonou',
      active_sector: primarySector,
      selected_sectors: cleanSectors, // STRICTEMENT les secteurs choisis
      sectors: cleanSectors,          // STRICTEMENT les secteurs choisis
      subscription_status: 'trial',
      onboarding_completed: true,
      currency: 'FCFA',
      subscription_plan: chosenPlanSlug,
      plan: chosenPlanSlug,
      initial_plan: chosenPlanSlug,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    const { data: newComp, error: insCompErr } = await sb
      .from('companies')
      .insert(insertCompPayload)
      .select()
      .single()

    if (insCompErr) {
      if (insCompErr.code === '23505' || insCompErr.message?.includes('unique')) {
        return res.status(409).json({
          success: false,
          error: DUPLICATE_EMAIL_ERROR,
        })
      }
      throw insCompErr
    }

    const companyId = newComp.id

    // =========================================================================
    // ÉTAPE 3 : Créer le profil administrateur principal dans `user_profiles`
    // =========================================================================
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

    await sb.from('user_profiles').insert({
      company_id: companyId,
      auth_user_id: authUserId,
      full_name: responsible_name.trim(),
      username: cleanEmail,
      email: cleanEmail,
      phone: phone.trim(),
      role: 'administrateur',
      is_active: true,
      permissions: defaultAdminPermissions,
      email_confirmed_at: null, // Non confirmé par défaut
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })

    // =========================================================================
    // ÉTAPE 4 : Initialiser `abonnements_global` (Source unique et vérifiable)
    // =========================================================================
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

    // =========================================================================
    // ÉTAPE 5 : Initialiser `abonnements_secteurs`
    // (Les 3 premiers sont couverts par l'essai gratuit, les suivants en attente de paiement)
    // =========================================================================
    for (const slug of freeTrialSectors) {
      await sb.from('abonnements_secteurs').upsert(
        {
          entreprise_id: companyId,
          secteur_code: toSecteurCode(slug),
          date_debut_specifique: now.toISOString(),
          date_fin_specifique: trialEndsDate.toISOString(),
          statut_specifique: 'rattache_global',
          is_premiere_activation: false,
          rattache_au_global: true,
          updated_at: now.toISOString(),
        },
        { onConflict: 'entreprise_id,secteur_code' }
      )
    }

    for (const slug of pendingPaidSectors) {
      await sb.from('abonnements_secteurs').upsert(
        {
          entreprise_id: companyId,
          secteur_code: toSecteurCode(slug),
          date_debut_specifique: null,
          date_fin_specifique: null,
          statut_specifique: 'en_attente_paiement',
          is_premiere_activation: false,
          rattache_au_global: false,
          updated_at: now.toISOString(),
        },
        { onConflict: 'entreprise_id,secteur_code' }
      )
    }

    // =========================================================================
    // ÉTAPE 6 : Initialiser `company_activities` (STRICTEMENT les secteurs choisis)
    // =========================================================================
    const activityRows = cleanSectors.map((slug, idx) => ({
      company_id: companyId,
      sector_slug: slug,
      sector_code: toSecteurCode(slug),
      activity_name: `${company_name.trim()} — ${slug.toUpperCase()}`,
      pos_location: city || 'Siège',
      manager_name: responsible_name.trim(),
      status: idx < MAX_FREE_TRIAL_SECTORS ? 'ACTIVE' : 'SUSPENDUE',
      is_active: true,
      created_at: now.toISOString(),
    }))

    await sb.from('company_activities').insert(activityRows)

    // =========================================================================
    // ÉTAPE 7 : Envoi effectif de l'email de confirmation via le module d'envoi
    // =========================================================================
    const appUrl = (process.env.VITE_APP_URL || 'https://gestio229.com').replace(/\/$/, '')
    const redirectTo = `${appUrl}/login?confirmed=true&email=${encodeURIComponent(cleanEmail)}`
    let confirmationUrl = redirectTo

    if (hasAdminKey && (sb.auth as any).admin?.generateLink) {
      try {
        const { data: linkData } = await (sb.auth as any).admin.generateLink({
          type: 'signup',
          email: cleanEmail,
          password: password,
          options: { redirectTo },
        })
        if (linkData?.properties?.action_link) {
          confirmationUrl = linkData.properties.action_link
        }
      } catch (linkErr: any) {
        console.warn('[AuthRegister] generateLink notice:', linkErr?.message)
      }
    }

    const emailHtml = buildRegistrationEmailHtml({
      responsibleName: responsible_name.trim(),
      companyName: company_name.trim(),
      confirmationUrl,
      selectedSectors: cleanSectors,
    })

    const sendResult = await sendTrackedEmail({
      to: cleanEmail,
      subject: '🔑 Confirmez votre adresse email — GESTIO 229 ERP',
      html: emailHtml,
      emailType: 'signup_confirmation',
      clientIp,
      metadata: { companyId, selectedSectors: cleanSectors },
    })

    return res.status(200).json({
      success: true,
      message: 'Compte créé avec succès. Un e-mail de confirmation vous a été envoyé.',
      emailSent: sendResult.success,
      emailWarning: sendResult.error,
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
        requiresEmailVerification: true,
      },
    })
  } catch (err: any) {
    console.error('[AuthRegister] Erreur serveur :', err)
    return res.status(500).json({
      success: false,
      error: 'Une erreur est survenue lors de l\'enregistrement. Veuillez réessayer.',
    })
  }
}
