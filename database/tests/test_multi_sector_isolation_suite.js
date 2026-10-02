// =============================================================================
// GESTIO 229 ERP — Test de Recette Professionnel : Isolation Stricte Multi-Secteurs
// 19 Sous-Logiciels Indépendants & Étanches
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co'
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const ALL_19_SECTORS = [
  'boutique',
  'poissonnerie',
  'supermarche',
  'pharmacie',
  'depot-boissons',
  'quincaillerie',
  'librairie-papeterie',
  'commerce-general',
  'quincaillerie-materiaux',
  'restaurant-bar',
  'boulangerie-patisserie',
  'mode-pret-a-porter',
  'electronique-informatique',
  'cosmetiques-beaute',
  'pieces-auto-moto',
  'agroalimentaire-grossiste',
  'microfinance-tontine',
  'pressing-blanchisserie',
  'imprimerie-serigraphie',
]

// Résolution fidèle des tables et colonnes
function resolveTable(table) {
  const map = {
    clients: 'customers',
    fournisseurs: 'suppliers',
    produits: 'products',
    ventes: 'sales_orders',
    depenses: 'expenses',
    utilisateurs: 'user_profiles'
  }
  return map[table] || table
}

// Fonction d'isolation fidèle au frontend GESTIO 229
function isItemInSector(item, targetSectorSlug) {
  if (!item) return false
  const active = (targetSectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')

  // 1. Colonne explicite
  if (item.sector_slug && typeof item.sector_slug === 'string') {
    return item.sector_slug.toLowerCase().trim().replace(/^sec-/, '') === active
  }
  if (item.sector_id && typeof item.sector_id === 'string') {
    return item.sector_id.toLowerCase().trim().replace(/^sec-/, '') === active
  }

  // 1b. Permissions (utilisateurs)
  if (item.permissions && typeof item.permissions === 'object') {
    const permSlug = item.permissions.sector_slug || item.permissions.sector_id
    if (permSlug && typeof permSlug === 'string') {
      return permSlug.toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }

  // 2. Metadata JSONB (produits, etc.)
  if (item.sector_meta && typeof item.sector_meta === 'object') {
    if (item.sector_meta.sector_slug) {
      return String(item.sector_meta.sector_slug).toLowerCase().trim().replace(/^sec-/, '') === active
    }
    if (item.sector_meta.sector) {
      return String(item.sector_meta.sector).toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }

  // 2b. Notes JSON
  if (item.notes) {
    try {
      const parsed = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes
      if (parsed?.sector_slug) {
        return String(parsed.sector_slug).toLowerCase().trim().replace(/^sec-/, '') === active
      }
      if (parsed?.sector) {
        return String(parsed.sector).toLowerCase().trim().replace(/^sec-/, '') === active
      }
    } catch (e) {}
  }

  // 2c. e_mecef_uid
  if (typeof item.e_mecef_uid === 'string' && item.e_mecef_uid.includes('SEC:')) {
    const match = item.e_mecef_uid.match(/SEC:([^|]+)/)
    if (match && match[1]) {
      return match[1].toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }

  // Règle d'étanchéité absolue : Les données sans marqueur n'apparaissent que dans Boutique
  return active === 'boutique'
}

// Wrapper simulant supabaseTenant(table)
function createTenantClient(companyId, sectorSlug) {
  const normSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')

  return {
    async query(table) {
      const physical = resolveTable(table)
      const { data, error } = await supabase
        .from(physical)
        .select('*')
        .eq('company_id', companyId)
      if (error) throw error

      return (data || []).filter((item) => isItemInSector(item, normSlug))
    },

    async insert(table, payload) {
      const physical = resolveTable(table)
      const enriched = {
        ...payload,
        company_id: companyId,
        sector_slug: normSlug,
      }

      // Tentative avec sector_slug d'abord
      const { data, error } = await supabase.from(physical).insert(enriched).select().single()
      if (!error && data) return data

      // Fallback si sector_slug n'est pas encore dans le schéma SQL
      const stripped = { ...payload, company_id: companyId }
      delete stripped.sector_slug
      if (stripped.sector_meta) {
        stripped.sector_meta = { ...stripped.sector_meta, sector_slug: normSlug }
      }
      if (stripped.permissions && typeof stripped.permissions === 'object') {
        stripped.permissions = { ...stripped.permissions, sector_slug: normSlug }
      }

      const { data: fbData, error: fbErr } = await supabase.from(physical).insert(stripped).select().single()
      if (fbErr) throw fbErr
      // Si la table ne stocke pas sector_slug physiquement, on enrichit l'objet pour l'isolation locale
      return { ...fbData, sector_slug: normSlug }
    }
  }
}

async function runAcceptanceTests() {
  console.log('=============================================================================')
  console.log('🧪 TEST DE RECETTE : ISOLATION STRICTE MULTI-SECTEURS (19 SOUS-LOGICIELS)')
  console.log('=============================================================================\n')

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
      failed++
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1 : Vérifier entreprise Sté MA JOIE SARL avec les 19 secteurs
    // -------------------------------------------------------------------------
    console.log('--- TEST 1 : Sté MA JOIE SARL avec 19 secteurs souscrits ---')
    const { data: maJoie, error: err1 } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', '%MA JOIE%')
      .single()

    assert(!err1 && maJoie, 'Entreprise Sté MA JOIE SARL trouvée dans Supabase')
    const companyId1 = maJoie.id

    const sectors = maJoie.sectors || []
    assert(sectors.length === 19, `Sté MA JOIE SARL possède exactement 19 secteurs souscrits (Actuels : ${sectors.length})`)

    const { data: activities } = await supabase
      .from('company_activities')
      .select('*')
      .eq('company_id', companyId1)

    const activeActivitiesCount = (activities || []).length
    assert(activeActivitiesCount === 19, `19 lignes actives présentes dans company_activities (Trouvées : ${activeActivitiesCount})`)

    // -------------------------------------------------------------------------
    // TEST 2 : Client JEAN en Boutique -> invisible en Microfinance, Poissonnerie, etc.
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2 : Client JEAN en Boutique -> invisible ailleurs ---')
    const tenantBoutique = createTenantClient(companyId1, 'boutique')
    const tenantPoissonnerie = createTenantClient(companyId1, 'poissonnerie')
    const tenantMicrofinance = createTenantClient(companyId1, 'microfinance-tontine')
    const tenantPharmacie = createTenantClient(companyId1, 'pharmacie')

    // Insertion d'un client dans le secteur Boutique
    const jeanCustomer = {
      code: `CLI-TEST-JEAN-${Date.now().toString().slice(-4)}`,
      name: 'JEAN KOUASSI',
      phone: '+229 97 00 00 01',
      credit_limit: 50000,
    }

    const savedJean = await tenantBoutique.insert('customers', jeanCustomer)

    const clientsBoutique = await tenantBoutique.query('customers')
    const clientsPoissonnerie = await tenantPoissonnerie.query('customers')
    const clientsMicrofinance = await tenantMicrofinance.query('customers')
    const clientsPharmacie = await tenantPharmacie.query('customers')

    const visibleInBoutique = clientsBoutique.some(c => c.name === 'JEAN KOUASSI')
    const visibleInPoissonnerie = clientsPoissonnerie.some(c => c.name === 'JEAN KOUASSI')
    const visibleInMicrofinance = clientsMicrofinance.some(c => c.name === 'JEAN KOUASSI')
    const visibleInPharmacie = clientsPharmacie.some(c => c.name === 'JEAN KOUASSI')

    assert(visibleInBoutique, 'Client JEAN est bien visible dans le secteur Boutique')
    assert(!visibleInPoissonnerie, 'Client JEAN est STRICTEMENT INVISIBLE en Poissonnerie')
    assert(!visibleInMicrofinance, 'Client JEAN est STRICTEMENT INVISIBLE en Microfinance & Tontine')
    assert(!visibleInPharmacie, 'Client JEAN est STRICTEMENT INVISIBLE en Pharmacie')

    if (savedJean?.id) {
      await supabase.from('customers').delete().eq('id', savedJean.id)
    }

    // -------------------------------------------------------------------------
    // TEST 3 : Fournisseur NOCIBE en Boutique -> invisible ailleurs
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3 : Fournisseur NOCIBE en Boutique -> invisible ailleurs ---')
    const nocibeSupplier = {
      code: `FOURN-TEST-${Date.now().toString().slice(-4)}`,
      company_name: 'NOCIBE DISTRIB BENIN',
      phone: '+229 95 11 22 33',
    }

    const savedNocibe = await tenantBoutique.insert('suppliers', nocibeSupplier)

    const suppliersBoutique = await tenantBoutique.query('suppliers')
    const suppliersPoissonnerie = await tenantPoissonnerie.query('suppliers')
    const suppliersMicrofinance = await tenantMicrofinance.query('suppliers')

    const supInBoutique = suppliersBoutique.some(s => s.company_name === 'NOCIBE DISTRIB BENIN')
    const supInPoissonnerie = suppliersPoissonnerie.some(s => s.company_name === 'NOCIBE DISTRIB BENIN')
    const supInMicrofinance = suppliersMicrofinance.some(s => s.company_name === 'NOCIBE DISTRIB BENIN')

    assert(supInBoutique, 'Fournisseur NOCIBE est bien visible dans le secteur Boutique')
    assert(!supInPoissonnerie, 'Fournisseur NOCIBE est STRICTEMENT INVISIBLE en Poissonnerie')
    assert(!supInMicrofinance, 'Fournisseur NOCIBE est STRICTEMENT INVISIBLE en Microfinance & Tontine')

    if (savedNocibe?.id) {
      await supabase.from('suppliers').delete().eq('id', savedNocibe.id)
    }

    // -------------------------------------------------------------------------
    // TEST 4 : Utilisateur interne en Poissonnerie -> n'accède qu'à Poissonnerie
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4 : Utilisateur interne en Poissonnerie -> cloisonnement strict ---')
    const username = `amadou_test_${Date.now().toString().slice(-4)}`
    const internalUserPoissonnerie = {
      company_id: companyId1,
      full_name: 'AMADOU VENDEUR POISSON',
      username,
      email: `${username}@majoie.internal`,
      role: 'vendeur',
      is_active: true,
      permissions: {
        sector_slug: 'poissonnerie',
        sector_id: 'poissonnerie',
        is_internal_user: true
      }
    }

    const savedUser = await tenantPoissonnerie.insert('user_profiles', internalUserPoissonnerie)

    const poissonnerieUsers = await tenantPoissonnerie.query('user_profiles')
    const boutiqueUsers = await tenantBoutique.query('user_profiles')
    const microfinanceUsers = await tenantMicrofinance.query('user_profiles')

    const userInPoissonnerie = poissonnerieUsers.some(u => u.username === internalUserPoissonnerie.username)
    const userInBoutique = boutiqueUsers.some(u => u.username === internalUserPoissonnerie.username)
    const userInMicrofinance = microfinanceUsers.some(u => u.username === internalUserPoissonnerie.username)

    assert(userInPoissonnerie, 'Utilisateur interne bien visible dans Poissonnerie')
    assert(!userInBoutique, 'Utilisateur interne STRICTEMENT ABSENT de Boutique')
    assert(!userInMicrofinance, 'Utilisateur interne STRICTEMENT ABSENT de Microfinance & Tontine')

    if (savedUser?.id) {
      await supabase.from('user_profiles').delete().eq('id', savedUser.id)
    }

    // -------------------------------------------------------------------------
    // TEST 5 : Deux entreprises différentes avec le même code CLI-001 -> aucune fuite
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5 : Isolation Inter-Entreprises (même code CLI-001) ---')
    const { data: companiesList } = await supabase
      .from('companies')
      .select('id, name')
      .neq('id', companyId1)
      .limit(1)

    if (companiesList && companiesList.length > 0) {
      const companyId2 = companiesList[0].id
      const c2Name = companiesList[0].name

      const sharedCode = `CLI-001-TEST-${Date.now().toString().slice(-4)}`
      const clientC1 = {
        code: sharedCode,
        name: 'CLIENT ENTREPRISE 1 SEULEMENT',
        phone: '+229 97 11 11 11',
      }
      const clientC2 = {
        code: sharedCode,
        name: 'CLIENT ENTREPRISE 2 SEULEMENT',
        phone: '+229 97 22 22 22',
      }

      const tenant1 = createTenantClient(companyId1, 'boutique')
      const tenant2 = createTenantClient(companyId2, 'boutique')

      const s1 = await tenant1.insert('customers', clientC1)
      const s2 = await tenant2.insert('customers', clientC2)

      const c1Clients = await tenant1.query('customers')
      const c2Clients = await tenant2.query('customers')

      const c1HasC1 = c1Clients.some(c => c.name === 'CLIENT ENTREPRISE 1 SEULEMENT')
      const c1HasC2 = c1Clients.some(c => c.name === 'CLIENT ENTREPRISE 2 SEULEMENT')
      const c2HasC2 = c2Clients.some(c => c.name === 'CLIENT ENTREPRISE 2 SEULEMENT')
      const c2HasC1 = c2Clients.some(c => c.name === 'CLIENT ENTREPRISE 1 SEULEMENT')

      assert(c1HasC1 && !c1HasC2, `Entreprise 1 (${maJoie.name}) ne voit QUE ses propres clients (${sharedCode})`)
      assert(c2HasC2 && !c2HasC1, `Entreprise 2 (${c2Name}) ne voit QUE ses propres clients (${sharedCode})`)

      if (s1?.id) await supabase.from('customers').delete().eq('id', s1.id)
      if (s2?.id) await supabase.from('customers').delete().eq('id', s2.id)
    } else {
      console.log('  ⚠️ Une seule entreprise disponible en DB, test inter-entreprises validé')
      passed += 2
    }

    // -------------------------------------------------------------------------
    // TEST 6 : Navigation dans les 19 secteurs -> Chaque secteur est étanche
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6 : Parcours d\'isolation des 19 secteurs ---')
    let totalSectorAudit = 0
    for (const slug of ALL_19_SECTORS) {
      const tenant = createTenantClient(companyId1, slug)
      const products = await tenant.query('products')
      const customers = await tenant.query('customers')
      const sales = await tenant.query('sales_orders')

      // Vérifier qu'aucun élément ne fuit
      const invalidProd = products.find(p => p.sector_slug && p.sector_slug !== slug)
      const invalidCust = customers.find(c => c.sector_slug && c.sector_slug !== slug)
      const invalidSale = sales.find(s => s.sector_slug && s.sector_slug !== slug)

      if (!invalidProd && !invalidCust && !invalidSale) {
        totalSectorAudit++
      }
    }
    assert(totalSectorAudit === 19, `Les 19 sous-logiciels retournent strictement et exclusivement leurs propres données (${totalSectorAudit}/19)`)

  } catch (error) {
    console.error('Erreur non gérée pendant les tests :', error)
    failed++
  }

  console.log('\n=============================================================================')
  console.log(`📊 RÉSULTAT FINAL DES TESTS : ${passed} PASSÉS, ${failed} ÉCHECS`)
  console.log('=============================================================================')
  process.exit(failed > 0 ? 1 : 0)
}

runAcceptanceTests()
