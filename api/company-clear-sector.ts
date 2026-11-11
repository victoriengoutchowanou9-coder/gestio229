// =============================================================================
// GESTIO 229 SAAS — API Endpoint : POST /api/company-clear-sector
// Vidage chirurgical et sécurisé des données opérationnelles d'un secteur d'activité
// Réservé exclusivement à l'administrateur / propriétaire de l'entreprise.
// PRÉSERVE ABSOLUMENT : le compte entreprise, les utilisateurs, l'activité elle-même,
// les abonnements et les données de TOUS les autres secteurs.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function canonicalSectorSlug(slug?: string | null): string {
  if (!slug) return ''
  const clean = String(slug).toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'impression' || clean === 'imprimerie') return 'imprimerie'
  if (clean === 'station' || clean === 'stationservice' || clean === 'station-service') return 'station-service'
  if (clean === 'microfinance-tontine' || clean === 'tontine' || clean === 'microfinance') return 'microfinance'
  if (clean === 'location' || clean === 'gestion-locative' || clean === 'gestion_locative' || clean === 'locatif' || clean === 'locative' || clean === 'immobilier') return 'immobilier'
  if (clean === 'agro-business' || clean === 'agro' || clean === 'agrobusiness') return 'agrobusiness'
  if (clean === 'bar-restaurant-maquis' || clean === 'maquis' || clean === 'fast-food' || clean === 'restaurant') return 'restaurant'
  if (clean === 'brasserie' || clean === 'depot-boissons' || clean === 'depot_boissons' || clean === 'depot' || clean === 'boissons') return 'brasserie'
  if (clean === 'poissonnerie' || clean === 'poissons' || clean === 'chambre-froide') return 'poissonnerie'
  if (clean === 'cosmetique' || clean === 'cosmetiques') return 'cosmetiques'
  if (clean === 'supermarche' || clean === 'superette' || clean === 'supermarche-alimentation' || clean === 'supermarché' || clean === 'supérette') return 'supermarche'
  if (clean === 'boutique' || clean === 'commerce-general' || clean === 'general') return 'boutique'
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'geolocalisation' || clean === 'gps' || clean === 'geolocalisation-flotte' || clean === 'geoloc') return 'flotte-geolocalisation'
  return clean
}


// ── INTÉGRATION DE SECTOR-REQUEST & VERIFY-ACCESS ────────────────────────────
async function handleSectorRequest(req: VercelRequest, res: VercelResponse, sb: any) {
  const {
    company_id,
    company_name,
    user_id,
    user_email,
    user_phone,
    requested_sectors,
    requested_modules,
    reason,
    business_details
  } = req.body || {}

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'Identifiant d\’entreprise requis.' })
  }

  const sectors: string[] = Array.isArray(requested_sectors)
    ? requested_sectors
    : typeof requested_sectors === 'string' && requested_sectors
    ? [requested_sectors]
    : []

  if (sectors.length === 0) {
    return res.status(400).json({ success: false, error: 'Veuillez préciser le(s) secteur(s) souhaité(s).' })
  }

  try {
    const { data: request, error: reqErr } = await sb
      .from('sector_access_requests')
      .insert({
        company_id,
        company_name: company_name || 'Entreprise',
        user_id: user_id || null,
        user_email: user_email || '',
        user_phone: user_phone || '',
        requested_sectors: sectors,
        requested_modules: Array.isArray(requested_modules) ? requested_modules : [],
        reason: reason || 'Demande d\’extension multi-activités',
        business_details: business_details || '',
        status: 'pending',
      })
      .select()
      .single()

    if (reqErr) throw reqErr

    try {
      await sb.from('admin_audit_logs').insert({
        admin_username: 'Système Demandes',
        action: 'DEMANDE_ACCES_MULTISECTEUR',
        company_id,
        company_name: company_name || '',
        result: 'info',
        details: { requestId: request?.id, requested_sectors: sectors, email: user_email, reason }
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Votre demande d\’accès multi-secteur a été transmise au Super Administrateur.',
      requestId: request?.id,
    })
  } catch (err: any) {
    console.error('[SectorRequest] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur lors de l\’envoi de votre demande.' })
  }
}

async function handleVerifyAccess(req: VercelRequest, res: VercelResponse, sb: any, clientIp: string) {
  const { userId, userEmail, companyId, targetSector, targetModule } = req.body || {}
  try {
    const { data: company, error: compErr } = await sb
      .from('companies')
      .select('id, name, subscription_status, is_active')
      .eq('id', companyId)
      .maybeSingle()

    if (compErr || !company) {
      return res.status(403).json({ success: false, code: 'COMPANY_NOT_FOUND', error: 'Entreprise introuvable.' })
    }

    if (!company.is_active) {
      return res.status(403).json({ success: false, code: 'COMPANY_SUSPENDED', error: 'Entreprise suspendue.' })
    }

    return res.status(200).json({
      success: true,
      data: {
        companyId: company.id,
        companyName: company.name,
        role: 'administrateur',
        subStatus: company.subscription_status,
        ip: clientIp,
      }
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Erreur serveur.' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' })
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown'
  const sb = getSupabaseAdmin()
  const actionParam = String(req.query?.action || req.body?.action || '').trim()
  const isSectorRequest = actionParam === 'sector-request' || (req.url && req.url.includes('sector-request'))
  const isVerifyAccess = actionParam === 'verify-access' || (req.url && req.url.includes('verify-access'))

  if (isSectorRequest) {
    return handleSectorRequest(req, res, sb)
  }
  if (isVerifyAccess) {
    return handleVerifyAccess(req, res, sb, clientIp)
  }


  try {
    const { company_id, activity_id, sector_slug, confirmation_name } = req.body || {}

    if (!company_id || !sector_slug) {
      return res.status(400).json({
        success: false,
        error: 'Identifiant d’entreprise (company_id) et secteur (sector_slug) obligatoires.',
      })
    }

    // 1. Authentification & Autorisation stricte
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    let authenticatedUserId: string | null = null
    let authenticatedUserRole: string | null = null
    let authenticatedUserEmail: string | null = null

    if (token) {
      const { data: authUser, error: authErr } = await sb.auth.getUser(token)
      if (!authErr && authUser?.user) {
        authenticatedUserId = authUser.user.id
        authenticatedUserEmail = authUser.user.email || null

        // Vérification du profil et du rôle
        const { data: profile } = await sb
          .from('user_profiles')
          .select('id, company_id, role, email')
          .or(`auth_user_id.eq.${authenticatedUserId},id.eq.${authenticatedUserId}${authenticatedUserEmail ? `,email.ilike.${authenticatedUserEmail}` : ''}`)
          .maybeSingle()

        if (profile) {
          authenticatedUserRole = profile.role
          // Vérification que l'utilisateur appartient à l'entreprise
          if (profile.company_id !== company_id && profile.role !== 'super_admin' && profile.role !== 'super_admin_universel') {
            return res.status(403).json({
              success: false,
              error: 'Accès refusé. Vous n’appartenez pas à cette entreprise.',
            })
          }

          // Vérification des privilèges d'administration
          const normRole = String(profile.role || '').toLowerCase().trim()
          const isAllowedRole =
            normRole === 'administrateur' ||
            normRole === 'admin' ||
            normRole === 'owner' ||
            normRole === 'propriétaire' ||
            normRole === 'gerant' ||
            normRole === 'directeur' ||
            normRole === 'super_admin' ||
            normRole === 'super_admin_universel'

          if (!isAllowedRole) {
            return res.status(403).json({
              success: false,
              error: 'Opération réservée exclusivement au propriétaire ou administrateur de l’entreprise.',
            })
          }
        }
      }
    }

    // 2. Vérification de l'entreprise
    const { data: company, error: compErr } = await sb
      .from('companies')
      .select('id, name, subscription_status, is_active')
      .eq('id', company_id)
      .maybeSingle()

    if (compErr || !company) {
      return res.status(404).json({
        success: false,
        error: 'Entreprise introuvable.',
      })
    }

    // 3. Vérification de l'activité ou du secteur
    const canonSlug = canonicalSectorSlug(sector_slug)
    const rawCleanSlug = String(sector_slug).toLowerCase().trim().replace(/^sec-/, '')
    const allowedSlugs = Array.from(new Set([canonSlug, rawCleanSlug, `sec-${canonSlug}`, `sec-${rawCleanSlug}`])).filter(Boolean)

    let activityRecord: any = null
    if (activity_id) {
      const { data: act } = await sb
        .from('company_activities')
        .select('*')
        .eq('id', activity_id)
        .eq('company_id', company_id)
        .maybeSingle()
      activityRecord = act
    }

    // Validation du nom de confirmation saisi par l'utilisateur
    if (!confirmation_name || typeof confirmation_name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'La confirmation explicite par saisie du nom du secteur est obligatoire.',
      })
    }

    const cleanInput = confirmation_name.trim().toLowerCase()
    const validNames: string[] = [
      canonSlug.toLowerCase(),
      rawCleanSlug.toLowerCase(),
      activityRecord?.name ? String(activityRecord.name).trim().toLowerCase() : '',
      activityRecord?.sector_slug ? String(activityRecord.sector_slug).trim().toLowerCase() : '',
    ].filter(Boolean)

    const isMatch = validNames.some((v) => cleanInput.includes(v) || v.includes(cleanInput) || cleanInput === v)
    if (!isMatch && cleanInput.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Le nom du secteur saisi ne correspond pas à l’activité sélectionnée.',
      })
    }

    // =========================================================================
    // 4. PURGE CHIRURGICALE CLOISONNÉE PAR SECTEUR (POUR CETTE ENTREPRISE UNIQUE)
    // =========================================================================
    const deletedCounts: Record<string, number> = {}

    const safeDelete = async (
      table: string,
      filterFn: (query: any) => any
    ): Promise<number> => {
      try {
        let q = sb.from(table).delete({ count: 'exact' }).eq('company_id', company_id)
        q = filterFn(q)
        const { count, error } = await q
        if (error) {
          // Table inexistante ou colonne absente : ignorer gracieusement
          return 0
        }
        const c = count || 0
        if (c > 0) {
          deletedCounts[table] = (deletedCounts[table] || 0) + c
        }
        return c
      } catch (_) {
        return 0
      }
    }

    // A. IDENTIFICATION ET PURGE DES VENTES DU SECTEUR
    let saleIds: string[] = []
    try {
      let salesQuery = sb
        .from('sales_orders')
        .select('id')
        .eq('company_id', company_id)

      if (activity_id) {
        salesQuery = salesQuery.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
      } else {
        salesQuery = salesQuery.in('sector_slug', allowedSlugs)
      }

      const { data: salesData } = await salesQuery
      if (Array.isArray(salesData) && salesData.length > 0) {
        saleIds = salesData.map((s) => s.id)
      }
    } catch (_) {}

    if (saleIds.length > 0) {
      // 1. Lignes de ventes
      try {
        await sb.from('sales_order_items').delete().in('order_id', saleIds)
      } catch (_) {}
      try {
        await sb.from('sales_order_items').delete().in('sales_order_id', saleIds)
      } catch (_) {}
      try {
        await sb.from('vente_lignes').delete().in('order_id', saleIds)
      } catch (_) {}

      // 2. Avoirs rattachés aux ventes
      try {
        const { data: avData } = await sb.from('factures_avoirs').select('id').eq('company_id', company_id).in('order_id', saleIds)
        if (Array.isArray(avData) && avData.length > 0) {
          const avIds = avData.map(a => a.id)
          await sb.from('avoir_lignes').delete().in('avoir_id', avIds)
        }
        await sb.from('factures_avoirs').delete().eq('company_id', company_id).in('order_id', saleIds)
      } catch (_) {}

      // 3. Créances et dettes clients liées
      try {
        await sb.from('client_debts').delete().eq('company_id', company_id).in('order_id', saleIds)
      } catch (_) {}
      try {
        await sb.from('creances_clients').delete().eq('company_id', company_id).in('order_id', saleIds)
      } catch (_) {}
      try {
        await sb.from('client_transactions').delete().eq('company_id', company_id).in('order_id', saleIds)
      } catch (_) {}
      try {
        await sb.from('client_emballages_creances').delete().eq('company_id', company_id).in('order_id', saleIds)
      } catch (_) {}

      // 4. Suppression des commandes/ventes
      await safeDelete('sales_orders', (q) => q.in('id', saleIds))
    }

    // Avoirs orphelins du secteur
    await safeDelete('factures_avoirs', (q) =>
      activity_id
        ? q.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )

    // B. IDENTIFICATION ET PURGE DES PRODUITS & STOCKS DU SECTEUR
    let productIds: string[] = []
    try {
      let prodQuery = sb
        .from('products')
        .select('id')
        .eq('company_id', company_id)

      if (activity_id) {
        prodQuery = prodQuery.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
      } else {
        prodQuery = prodQuery.in('sector_slug', allowedSlugs)
      }

      const { data: prodData } = await prodQuery
      if (Array.isArray(prodData) && prodData.length > 0) {
        productIds = prodData.map((p) => p.id)
      }
    } catch (_) {}

    if (productIds.length > 0) {
      try {
        await sb.from('stock_movements').delete().in('product_id', productIds)
      } catch (_) {}
      try {
        await sb.from('stock_avaries').delete().in('product_id', productIds)
      } catch (_) {}
      try {
        await sb.from('poissonnerie_avaries').delete().in('product_id', productIds)
      } catch (_) {}
      try {
        await sb.from('stock_vente').delete().in('product_id', productIds)
      } catch (_) {}
      try {
        await sb.from('brasserie_produit_emballage').delete().in('product_id', productIds)
      } catch (_) {}

      // Suppression des produits
      await safeDelete('products', (q) => q.in('id', productIds))
    }

    // Mouvements de stocks résiduels du secteur
    await safeDelete('stock_movements', (q) =>
      activity_id
        ? q.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('inventory_sessions', (q) =>
      activity_id
        ? q.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )

    // C. PURGE DES ACHATS ET APPROVISIONNEMENTS DU SECTEUR
    let poIds: string[] = []
    try {
      const { data: poData } = await sb
        .from('purchase_orders')
        .select('id')
        .eq('company_id', company_id)
        .in('sector_slug', allowedSlugs)
      if (Array.isArray(poData) && poData.length > 0) {
        poIds = poData.map(p => p.id)
      }
    } catch (_) {}

    if (poIds.length > 0) {
      try {
        await sb.from('bc_lignes').delete().in('purchase_order_id', poIds)
      } catch (_) {}
      try {
        await sb.from('purchase_order_items').delete().in('purchase_order_id', poIds)
      } catch (_) {}
      await safeDelete('purchase_orders', (q) => q.in('id', poIds))
    }

    // D. PURGE DES DÉPENSES DU SECTEUR
    await safeDelete('expenses', (q) =>
      activity_id
        ? q.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('depenses', (q) =>
      activity_id
        ? q.or(`activity_id.eq.${activity_id},site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )

    // E. PURGE DE LA CAISSE ET OPÉRATIONS DU SECTEUR
    await safeDelete('caisse_mouvements', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')}),secteur_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.or(`sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')}),secteur_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
    )
    await safeDelete('clotures_caisse', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('caisse_clotures', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('caisse_sessions', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('cash_sessions', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('debt_payments', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )
    await safeDelete('customer_repayments', (q) =>
      activity_id
        ? q.or(`site_id.eq.${activity_id},sector_slug.in.(${allowedSlugs.map(s => `"${s}"`).join(',')})`)
        : q.in('sector_slug', allowedSlugs)
    )

    // F. MODULES SECTORIELS SPÉCIALISÉS (PURGE SI LE SECTEUR CONCERNE CES TABLES)
    if (canonSlug === 'restaurant') {
      await safeDelete('restaurant_commande_lignes', (q) => q)
      await safeDelete('restaurant_commandes', (q) => q)
      await safeDelete('restaurant_boissons_confiees', (q) => q)
      await safeDelete('restaurant_creances_serveuses', (q) => q)
      await safeDelete('restaurant_destockage_log', (q) => q)
      await safeDelete('restaurant_fiches_techniques', (q) => q)
      await safeDelete('restaurant_reglements_serveuses', (q) => q)
      await safeDelete('restaurant_retours_emballages', (q) => q)
      await safeDelete('restaurant_sessions_serveurs', (q) => q)
      await safeDelete('restaurant_tables', (q) => q)
      await safeDelete('restaurant_versements_serveurs', (q) => q)
    }

    if (canonSlug === 'station-service') {
      await safeDelete('station_ventes', (q) => q)
      await safeDelete('station_receptions_carburant', (q) => q)
      await safeDelete('station_jaugeages', (q) => q)
      await safeDelete('station_pistolets', (q) => q)
      await safeDelete('station_cuves', (q) => q)
      await safeDelete('station_prix_historique', (q) => q)
      await safeDelete('station_livraisons', (q) => q)
      await safeDelete('station_vehicules_flotte', (q) => q)
      await safeDelete('station_pompistes', (q) => q)
    }

    if (canonSlug === 'hotel') {
      await safeDelete('hotel_reservations', (q) => q)
      await safeDelete('hotel_housekeeping', (q) => q)
      await safeDelete('hotel_chambres', (q) => q)
    }

    if (canonSlug === 'imprimerie') {
      await safeDelete('imprimerie_commande_lignes', (q) => q)
      await safeDelete('imprimerie_commandes', (q) => q)
      await safeDelete('imprimerie_devis', (q) => q)
      await safeDelete('imprimerie_prestations', (q) => q)
      await safeDelete('imprimerie_matieres', (q) => q)
      await safeDelete('imprimerie_consommations', (q) => q)
      await safeDelete('imprimerie_sous_traitance', (q) => q)
      await safeDelete('imprimerie_paiements', (q) => q)
      await safeDelete('imprimerie_audit_logs', (q) => q)
    }

    if (canonSlug === 'flotte-geolocalisation') {
      await safeDelete('flotte_positions_gps', (q) => q)
      await safeDelete('flotte_alertes', (q) => q)
      await safeDelete('flotte_carburant', (q) => q)
      await safeDelete('flotte_maintenance', (q) => q)
      await safeDelete('flotte_documents', (q) => q)
      await safeDelete('flotte_geofences', (q) => q)
      await safeDelete('flotte_reservations', (q) => q)
      await safeDelete('flotte_inspections', (q) => q)
      await safeDelete('flotte_balises', (q) => q)
      await safeDelete('flotte_capteurs', (q) => q)
      await safeDelete('flotte_conducteurs', (q) => q)
      await safeDelete('flotte_vehicules', (q) => q)
    }

    if (canonSlug === 'immobilier') {
      await safeDelete('location_quittances', (q) => q)
      await safeDelete('location_echeances', (q) => q)
      await safeDelete('location_cautions', (q) => q)
      await safeDelete('location_contrats', (q) => q)
      await safeDelete('location_biens', (q) => q)
    }

    if (canonSlug === 'microfinance') {
      await safeDelete('microfinance_echeances', (q) => q)
      await safeDelete('microfinance_transactions', (q) => q)
      await safeDelete('microfinance_credits', (q) => q)
      await safeDelete('microfinance_tontines', (q) => q)
      await safeDelete('microfinance_comptes', (q) => q)
      await safeDelete('microfinance_membres', (q) => q)
      await safeDelete('tontines_cycles', (q) => q)
    }

    if (canonSlug === 'ecole') {
      await safeDelete('ecole_notes', (q) => q)
      await safeDelete('ecole_bulletins', (q) => q)
      await safeDelete('ecole_evaluations', (q) => q)
      await safeDelete('ecole_absences', (q) => q)
      await safeDelete('ecole_absences_retards', (q) => q)
      await safeDelete('ecole_inscriptions', (q) => q)
      await safeDelete('ecole_paiements', (q) => q)
      await safeDelete('ecole_eleves', (q) => q)
      await safeDelete('ecole_classes', (q) => q)
      await safeDelete('ecole_classes_groupes', (q) => q)
      await safeDelete('ecole_salles', (q) => q)
      await safeDelete('ecole_enseignants_formateurs', (q) => q)
      await safeDelete('ecole_matieres_modules', (q) => q)
      await safeDelete('ecole_bibliotheque_documents', (q) => q)
      await safeDelete('ecole_formations_catalogue', (q) => q)
      await safeDelete('ecole_sessions_formation', (q) => q)
    }

    if (canonSlug === 'garage') {
      await safeDelete('garage_ordres_reparation', (q) => q)
      await safeDelete('garage_reparations', (q) => q)
      await safeDelete('garage_devis', (q) => q)
      await safeDelete('garage_assurances', (q) => q)
      await safeDelete('garage_vehicules', (q) => q)
    }

    if (canonSlug === 'brasserie') {
      await safeDelete('brasserie_emballages_mouvements', (q) => q)
      await safeDelete('brasserie_consignations', (q) => q)
      await safeDelete('brasserie_mouvements_emballages', (q) => q)
      await safeDelete('brasserie_inventaire_lignes', (q) => q)
      await safeDelete('brasserie_inventaires_emballages', (q) => q)
      await safeDelete('stock_emballages_fournisseur', (q) => q)
      await safeDelete('clients_emballages_initiaux', (q) => q)
      await safeDelete('consignations_initiales', (q) => q)
      await safeDelete('consignations_emballages', (q) => q)
      await safeDelete('casiers_mouvements', (q) => q)
      await safeDelete('brasserie_grille_prix', (q) => q)
      await safeDelete('brasserie_grilles', (q) => q)
      await safeDelete('brasserie_emballages', (q) => q)
    }

    if (canonSlug === 'poissonnerie') {
      await safeDelete('poissonnerie_avaries', (q) => q)
    }

    // G. JOURNAL D'AUDIT SÉCURISÉ
    try {
      await sb.from('admin_audit_logs').insert({
        admin_username: authenticatedUserEmail || 'Admin Entreprise',
        action: 'CLEAR_SECTOR_DATA',
        company_id: company.id,
        company_name: company.name,
        result: 'SUCCESS',
        details: {
          activity_id: activity_id || null,
          activity_name: activityRecord?.name || null,
          sector_slug: canonSlug,
          deleted_counts: deletedCounts,
          ip: clientIp,
          timestamp: new Date().toISOString(),
        },
        ip_address: clientIp,
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Le secteur a été vidé avec succès. Vous pouvez maintenant commencer à enregistrer vos propres informations.',
      data: {
        company_id,
        sector_slug: canonSlug,
        activity_id: activity_id || null,
        deleted_summary: deletedCounts,
      },
    })
  } catch (error: any) {
    console.error('[API ClearSector] Erreur inattendue:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Une erreur interne est survenue lors du vidage du secteur.',
    })
  }
}
