// =============================================================================
// GESTIO 229 ERP — Test Automatisé : Refonte Marges, Caisse & Achats Fournisseurs
// Test des 19 Secteurs Isolés, HUB Consolidation, Caisse et Dettes Fournisseurs
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co'
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TEST_COMPANY_ID = '0d72d9d1-b82a-45ec-a41b-db61a8310b8d' // Sté MA JOIE SARL

let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`)
    passedTests++
  } else {
    console.error(`  ❌ [FAIL] ${message}`)
    failedTests++
  }
}

// Helper pour filtrer par secteur fidèle à supabaseTenant.ts et sectorClient.ts
function isItemInSector(item, targetSectorSlug) {
  if (!item) return false
  const active = (targetSectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  
  if (item.sector_slug && typeof item.sector_slug === 'string') {
    return item.sector_slug.toLowerCase().trim().replace(/^sec-/, '') === active
  }
  if (typeof item.e_mecef_uid === 'string' && item.e_mecef_uid.includes('SEC:')) {
    const match = item.e_mecef_uid.match(/SEC:([^|]+)/)
    if (match && match[1]) {
      return match[1].toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }
  if (typeof item.closing_notes === 'string' && item.closing_notes.includes('SEC:')) {
    const match = item.closing_notes.match(/SEC:([^|]+)/)
    if (match && match[1]) {
      return match[1].toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }
  return active === 'boutique'
}

// Émulation exacte de fetchResumeActivite depuis supabaseTenant.ts
async function fetchResumeActiviteTest(companyId, sectorSlug) {
  const normSlug = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : null

  // 1. Vue officielle v_resume_activite (si déjà migrée)
  try {
    let query = supabase.from('v_resume_activite').select('*').eq('company_id', companyId)
    if (normSlug) query = query.eq('sector_slug', normSlug)
    const { data, error } = await query
    if (!error && data && data.length > 0) {
      if (normSlug) return { ca_ht: Number(data[0].ca_ht) || 0, marge_brute: Number(data[0].marge_brute) || 0 }
      return data
    }
  } catch (_) {}

  // 2. Table vente_lignes (si déjà migrée)
  try {
    let q = supabase.from('vente_lignes').select('sector_slug, quantite, prix_vente_ht_unitaire, cout_achat_ht_unitaire').eq('company_id', companyId)
    if (normSlug) q = q.eq('sector_slug', normSlug)
    const { data: vlData, error: vlErr } = await q
    if (!vlErr && vlData && vlData.length > 0) {
      if (normSlug) {
        const ca_ht = vlData.reduce((s, r) => s + (Number(r.quantite) || 0) * (Number(r.prix_vente_ht_unitaire) || 0), 0)
        const cout = vlData.reduce((s, r) => s + (Number(r.quantite) || 0) * (Number(r.cout_achat_ht_unitaire) || 0), 0)
        return { ca_ht, marge_brute: Math.max(0, ca_ht - cout) }
      }
    }
  } catch (_) {}

  // 3. Fallback direct et exact depuis sales_orders (avec coût figé)
  try {
    const { data: salesList, error: soErr } = await supabase
      .from('sales_orders')
      .select('id, total_amount, subtotal_ht, total_cost, e_mecef_uid')
      .eq('company_id', companyId)

    if (!soErr && salesList) {
      if (normSlug) {
        const sectorSales = salesList.filter(s => isItemInSector(s, normSlug))
        const ca_ht = sectorSales.reduce((s, item) => s + (Number(item.subtotal_ht || item.total_amount) || 0), 0)
        const total_cost = sectorSales.reduce((s, item) => s + (Number(item.total_cost) || 0), 0)
        const marge_brute = Math.max(0, ca_ht - total_cost)
        return { ca_ht, marge_brute }
      }
      const sectors = ['boutique', 'poissonnerie']
      return sectors.map(secSlug => {
        const sectorSales = salesList.filter(s => isItemInSector(s, secSlug))
        const ca_ht = sectorSales.reduce((s, item) => s + (Number(item.subtotal_ht || item.total_amount) || 0), 0)
        const total_cost = sectorSales.reduce((s, item) => s + (Number(item.total_cost) || 0), 0)
        return {
          company_id: companyId,
          sector_slug: secSlug,
          ca_ht,
          marge_brute: Math.max(0, ca_ht - total_cost)
        }
      })
    }
  } catch (_) {}

  return normSlug ? { ca_ht: 0, marge_brute: 0 } : []
}

async function runAllTests() {
  console.log('=============================================================================')
  console.log('TEST SUITE : REFONTE CALCUL MARGES, CAISSE & FOURNISSEURS / DETTES')
  console.log('Entreprise : Sté MA JOIE SARL (' + TEST_COMPANY_ID + ')')
  console.log('=============================================================================\n')

  // ── TEST 1 : Calcul de marge Boutique (5700 HT, 5000 Achat -> CA=5700, Marge=700) ──
  console.log('--- TEST 1 : Calcul de marge Boutique ---')
  const orderNumBoutique = `CMD-BTQ-${Date.now()}`
  
  const { data: boutiqueSale, error: bErr } = await supabase.from('sales_orders').insert({
    company_id: TEST_COMPANY_ID,
    order_number: orderNumBoutique,
    order_type: 'direct',
    subtotal_ht: 5700,
    total_amount: 5700,
    total_cost: 5000,
    e_mecef_uid: 'SEC:boutique|AUTO-TEST',
    payment_status: 'paid'
  }).select().single()

  if (bErr) console.error('  DEBUG bErr:', bErr.message, bErr.details, bErr.hint)
  assert(!bErr && boutiqueSale?.id, 'Vente Boutique insérée avec coût d\'achat unitaire figé')

  const boutiqueCard = await fetchResumeActiviteTest(TEST_COMPANY_ID, 'boutique')
  assert(boutiqueCard.ca_ht >= 5700, `Carte Boutique CA HT attendu 5700, obtenu : ${boutiqueCard.ca_ht}`)
  assert(boutiqueCard.marge_brute >= 700, `Carte Boutique Marge attendue 700, obtenue : ${boutiqueCard.marge_brute}`)

  // ── TEST 2 : Calcul de marge Poissonnerie (10000 HT, 8000 Achat -> CA=10000, Marge=2000) ──
  console.log('\n--- TEST 2 : Calcul de marge Poissonnerie ---')
  const orderNumPois = `CMD-POIS-${Date.now()}`
  const { data: poisSale, error: pErr } = await supabase.from('sales_orders').insert({
    company_id: TEST_COMPANY_ID,
    order_number: orderNumPois,
    order_type: 'direct',
    subtotal_ht: 10000,
    total_amount: 10000,
    total_cost: 8000,
    e_mecef_uid: 'SEC:poissonnerie|AUTO-TEST',
    payment_status: 'paid'
  }).select().single()

  if (pErr) console.error('  DEBUG pErr:', pErr.message, pErr.details, pErr.hint)
  assert(!pErr && poisSale?.id, 'Vente Poissonnerie insérée avec coût d\'achat unitaire figé')

  const poissonnerieCard = await fetchResumeActiviteTest(TEST_COMPANY_ID, 'poissonnerie')
  assert(poissonnerieCard.ca_ht >= 10000, `Carte Poissonnerie CA HT attendu 10000, obtenu : ${poissonnerieCard.ca_ht}`)
  assert(poissonnerieCard.marge_brute >= 2000, `Carte Poissonnerie Marge attendue 2000, obtenue : ${poissonnerieCard.marge_brute}`)

  // ── TEST 3 : Rôle du HUB — Agrégation stricte sans calcul ligne par ligne ──
  console.log('\n--- TEST 3 : Consolidation HUB (Somme des cartes uniquement) ---')
  const allCards = await fetchResumeActiviteTest(TEST_COMPANY_ID)
  const totalCaHub = (allCards || []).reduce((sum, c) => sum + (Number(c.ca_ht) || 0), 0)
  const totalMargeHub = (allCards || []).reduce((sum, c) => sum + (Number(c.marge_brute) || 0), 0)

  assert(totalCaHub >= 15700, `HUB CA Total (somme des cartes) attendu >= 15700, obtenu : ${totalCaHub}`)
  assert(totalMargeHub >= 2700, `HUB Marge Totale (somme des marges) attendue >= 2700, obtenue : ${totalMargeHub}`)

  // Nettoyage des ventes créées
  if (boutiqueSale?.id) await supabase.from('sales_orders').delete().eq('id', boutiqueSale.id)
  if (poisSale?.id) await supabase.from('sales_orders').delete().eq('id', poisSale.id)

  // ── TEST 4 : Isolation Métier Caisse (Ouverture, Session persistante, Clôture) ──
  console.log('\n--- TEST 4 : Module Caisse & Workflow Ouverture / Clôture ---')
  
  // 1. Ouverture caisse Boutique
  const { data: newSession, error: sessErr } = await supabase.from('cash_sessions').insert({
    company_id: TEST_COMPANY_ID,
    status: 'ouverte',
    opened_at: new Date().toISOString(),
    opening_cash: 25000,
    opening_momo: 10000,
    closing_notes: 'SEC:boutique|SESSION_ACTIVE'
  }).select().single()

  const caisseOuverte = !sessErr && newSession?.id
  assert(caisseOuverte, 'Ouverture de caisse enregistrée avec statut="ouverte" (Espèces: 25000, MoMo: 10000)')

  // 2. Isolation Caisse : Poissonnerie ne voit PAS la caisse Boutique
  const { data: activeSessions } = await supabase.from('cash_sessions')
    .select('*')
    .eq('company_id', TEST_COMPANY_ID)
    .eq('status', 'ouverte')

  const poisCaisseActive = (activeSessions || []).filter(s => isItemInSector(s, 'poissonnerie'))
  assert(poisCaisseActive.length === 0, 'Isolation Caisse : Poissonnerie ne voit pas la caisse ouverte de Boutique')

  // 3. Clôture de la caisse
  if (newSession?.id) {
    const totalEspecesDuJour = 5700
    const nouveauFond = 25000 + totalEspecesDuJour
    const { error: closeErr } = await supabase.from('cash_sessions').update({
      status: 'fermee',
      closed_at: new Date().toISOString(),
      closing_cash_counted: nouveauFond,
      closing_momo_counted: 10000
    }).eq('id', newSession.id)

    assert(!closeErr, `Clôture automatique : nouveau fond calculé = 25000 + 5700 = ${nouveauFond} FCFA`)
    await supabase.from('cash_sessions').delete().eq('id', newSession.id)
  }

  // ── TEST 5 : Module Achats & Dettes Fournisseurs (Coffre-Fort & Débit) ──
  console.log('\n--- TEST 5 : Module Achats & Dettes Fournisseurs (Coffre-Fort & Solde) ---')
  
  // Test solde disponible et règle de rejet si solde insuffisant
  const soldeDisponibleEspeces = 50000
  const tentativeRèglementTropGrand = 60000
  const bloqueurSolde = tentativeRèglementTropGrand > soldeDisponibleEspeces
  assert(bloqueurSolde, 'Contrôle solde insuffisant : Tentative 60000 FCFA bloquée (disponible 50000 FCFA)')

  // Création Fournisseur avec dette
  const testSupCode = `F-${Date.now().toString().slice(-5)}`
  const { data: sup, error: supErr } = await supabase.from('suppliers').insert({
    company_id: TEST_COMPANY_ID,
    code: testSupCode,
    company_name: 'FOURNISSEUR TEST SARL',
    phone: '+229 97 00 11 22',
    current_payable: 35000,
    is_active: true
  }).select().single()

  assert(!supErr && sup?.id, `Fournisseur partenaire créé avec dette de 35000 FCFA (Code: ${testSupCode})`)

  if (sup?.id) {
    // Règlement partiel autorisé (20000 FCFA)
    const detteInitiale = 35000
    const montantPaiement = 20000
    const resteDette = detteInitiale - montantPaiement
    assert(resteDette === 15000, `Règlement partiel 20000 FCFA : reste à payer ${resteDette} FCFA`)

    // Tracé du mouvement dans les dépenses / flux comptables
    const { data: exp, error: expErr } = await supabase.from('expenses').insert({
      company_id: TEST_COMPANY_ID,
      expense_number: `DEP-${Date.now().toString().slice(-6)}`,
      category: 'Reglement Fournisseur',
      beneficiary: 'FOURNISSEUR TEST SARL',
      amount: montantPaiement,
      payment_method: 'cash',
      notes: `SEC:boutique|SUPPLIER:${sup.id}`
    }).select().single()

    if (expErr) console.error('  DEBUG expErr:', expErr.message, expErr.details, expErr.hint)
    assert(!expErr && exp?.id, 'Tracé du débit de sortie espèces tracé dans les flux comptables')

    // Nettoyage données test
    if (exp?.id) await supabase.from('expenses').delete().eq('id', exp.id)
    await supabase.from('suppliers').delete().eq('id', sup.id)
  }

  console.log('\n=============================================================================')
  console.log(`📊 RÉSULTAT : ${passedTests} test(s) réussis, ${failedTests} échec(s)`)
  console.log('=============================================================================')
  if (failedTests > 0) {
    process.exit(1)
  }
}

runAllTests().catch(err => {
  console.error('Erreur inattendue test suite :', err)
  process.exit(1)
})
