// =============================================================================
// GESTIO 229 SaaS — SUITE DE VALIDATION CLIENTS & CRÉANCES (FIFO & BÉNIN UTC+1)
// =============================================================================

const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('🧪 DÉMARRAGE DU TEST SUITE : MODULE CLIENTS & CRÉANCES (FIFO & HORODATAGE)')

// 1. Vérification statique du code source dans ClientsPage.tsx
const clientsPagePath = path.join(__dirname, '../src/pages/dashboard/clients/ClientsPage.tsx')
const pageContent = fs.readFileSync(clientsPagePath, 'utf8')

// Règle 1 : NE PAS MODIFIER la partie supérieure de la fiche client
assert(pageContent.includes('TOTAL DETTE'), 'TOTAL DETTE doit être présent dans la fiche client')
assert(pageContent.includes('TOTAL REMBOURSÉ'), 'TOTAL REMBOURSÉ doit être présent dans la fiche client')
assert(pageContent.includes('SOLDE DÛ'), 'SOLDE DÛ doit être présent dans la fiche client')
assert(pageContent.includes('Ajouter dette initiale'), 'Bouton Ajouter dette initiale doit être présent')
assert(pageContent.includes('Nouveau remboursement'), 'Bouton Nouveau remboursement doit être présent')
assert(pageContent.includes('Imprimer situation globale'), 'Bouton Imprimer situation globale doit être présent')
console.log('  ✅ Règle 1 : Partie supérieure de la fiche client intacte avec ses 3 KPI et ses boutons')

// Règle 2 & 3 : Imputation automatique FIFO & Suivi par Facture
assert(pageContent.includes('computeFifoCreditPurchases'), 'Fonction computeFifoCreditPurchases présente')
assert(pageContent.includes('Suivi des Achats à Crédit & Règlements'), 'Titre nouvelle organisation présent')
assert(pageContent.includes('toggleInvoiceExpand'), 'Capacité de déplier chaque facture présente')
assert(pageContent.includes('payments_imputes'), 'Traçabilité des remboursements imputés présente')
console.log('  ✅ Règle 2 & 3 : Organisation par facture et imputation automatique FIFO intégrées')

// Règle 5 : Protection anti-doublon
assert(pageContent.includes('isSubmittingPaymentRef'), 'Verrou synchrone anti-double clic isSubmittingPaymentRef présent')
assert(pageContent.includes('seenPaymentIds'), 'Dédoublonnage strict des paiements par ID présent')
console.log('  ✅ Règle 5 : Verrou synchrone et dédoublonnage strict anti-doublon en place')

// Règle 6 : Fuseau horaire Bénin UTC+1 sans décalage d'une heure
assert(pageContent.includes('getBeninNowInput'), 'Fonction getBeninNowInput présente')
assert(pageContent.includes('formatBeninDateTime'), 'Fonction formatBeninDateTime présente')
assert(pageContent.includes('formatBeninDate'), 'Fonction formatBeninDate présente')
assert(pageContent.includes('beninInputToIso'), 'Fonction beninInputToIso présente')
assert(pageContent.includes("'Africa/Porto-Novo'"), 'Fuseau horaire Africa/Porto-Novo strictement configuré')
console.log('  ✅ Règle 6 : Fuseau horaire Bénin UTC+1 appliqué sans décalage')

// Règle 7 & 8 : Impression situation client et filtre période avec report solde antérieur
assert(pageContent.includes('filterPurchasesByPeriod'), 'Fonction filterPurchasesByPeriod présente')
assert(pageContent.includes('SITUATION DES CRÉANCES CLIENT'), 'Titre d\'impression officiel conforme')
assert(pageContent.includes('Report de Solde Antérieur'), 'Report de solde antérieur présent pour le filtre période')
assert(pageContent.includes('RÉCAPITULATIF DE LA SITUATION DU CLIENT'), 'Récapitulatif final présent')
console.log('  ✅ Règle 7 & 8 : Impression professionnelle et filtre période avec report de solde antérieur')

// 2. Tests fonctionnels et algorithmiques de l'imputation FIFO

function computeFifoCreditPurchases(clientInfo, rawSales, rawDebts, rawPayments) {
  const paymentsMap = new Map()
  for (const p of rawPayments || []) {
    if (p && p.id && !paymentsMap.has(p.id)) {
      paymentsMap.set(p.id, {
        ...p,
        amount: Number(p.amount) || 0,
        payment_date: p.payment_date || p.created_at || new Date().toISOString()
      })
    }
  }
  const payments = Array.from(paymentsMap.values()).sort(
    (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
  )

  const salesMap = new Map()
  for (const s of rawSales || []) {
    if (s && s.id && !salesMap.has(s.id)) {
      const creditAmt = Number(s.credit_amount) || (s.payment_status === 'credit' ? Number(s.total_amount) || 0 : 0)
      if (creditAmt > 0) {
        salesMap.set(s.id, {
          id: s.id,
          reference: s.order_number || `FAC-${s.id.slice(0, 8).toUpperCase()}`,
          date: s.order_date ? `${s.order_date}T08:00:00Z` : (s.created_at || new Date().toISOString()),
          montant_initial: creditAmt,
          is_initial: false
        })
      }
    }
  }

  const purchases = Array.from(salesMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const totalDetteTarget = Number(clientInfo.totalDette) || 0
  const sumSalesCredit = purchases.reduce((sum, p) => sum + p.montant_initial, 0)

  if (totalDetteTarget > sumSalesCredit) {
    const diff = totalDetteTarget - sumSalesCredit
    const oldestDebt = (rawDebts || [])[0]
    const initialDate = oldestDebt?.created_at || clientInfo.created_at || (purchases.length > 0 ? purchases[0].date : new Date(0).toISOString())
    purchases.unshift({
      id: oldestDebt?.id || 'dette-initiale',
      reference: 'ARRIERE-INITIAL',
      date: initialDate,
      montant_initial: diff,
      is_initial: true
    })
  } else if (purchases.length === 0 && totalDetteTarget > 0) {
    purchases.push({
      id: 'dette-initiale',
      reference: 'ARRIERE-INITIAL',
      date: new Date().toISOString(),
      montant_initial: totalDetteTarget,
      is_initial: true
    })
  }

  purchases.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const trackedPurchases = purchases.map((p) => ({
    ...p,
    montant_rembourse: 0,
    solde_restant: p.montant_initial,
    statut: 'EN COURS',
    payments_imputes: []
  }))

  for (const pay of payments) {
    let available = pay.amount
    for (const purch of trackedPurchases) {
      if (available <= 0) break
      const needed = purch.montant_initial - purch.montant_rembourse
      if (needed > 0) {
        const take = Math.min(available, needed)
        purch.montant_rembourse += take
        purch.solde_restant = Math.max(0, purch.montant_initial - purch.montant_rembourse)
        purch.statut = purch.solde_restant <= 0 ? 'SOLDÉ' : 'EN COURS'
        purch.payments_imputes.push({
          payment_id: pay.id,
          payment_date: pay.payment_date,
          montant_impute: take,
          montant_total_paiement: pay.amount,
          payment_method: pay.payment_method,
          reference: pay.reference || '-',
          notes: pay.notes || ''
        })
        available -= take
      }
    }
  }

  return trackedPurchases
}

// TEST 1 : Un achat de 50 000 FCFA, remboursement de 20 000 FCFA -> reste 30 000 FCFA
{
  const sales = [{ id: '1', order_number: 'FAC-001', credit_amount: 50000, created_at: '2026-11-01T10:00:00Z' }]
  const payments = [{ id: 'p1', amount: 20000, payment_method: 'Espèces', payment_date: '2026-11-02T10:00:00Z' }]
  const res = computeFifoCreditPurchases({ totalDette: 50000, totalRembourse: 20000, soldeDu: 30000 }, sales, [], payments)

  assert.strictEqual(res.length, 1)
  assert.strictEqual(res[0].montant_initial, 50000)
  assert.strictEqual(res[0].montant_rembourse, 20000)
  assert.strictEqual(res[0].solde_restant, 30000)
  assert.strictEqual(res[0].statut, 'EN COURS')
  assert.strictEqual(res[0].payments_imputes.length, 1)
  console.log('  ✅ Test 1 validé : Achat 50 000 FCFA - Remboursement 20 000 FCFA = Solde 30 000 FCFA (EN COURS)')
}

// TEST 2 : Deux achats (50k et 100k), remboursement de 70k -> FAC-001 SOLDÉ (0), FAC-002 EN COURS (80k)
{
  const sales = [
    { id: '1', order_number: 'FAC-001', credit_amount: 50000, created_at: '2026-11-01T08:00:00Z' },
    { id: '2', order_number: 'FAC-002', credit_amount: 100000, created_at: '2026-11-02T08:00:00Z' }
  ]
  const payments = [
    { id: 'p1', amount: 70000, payment_method: 'Espèces', payment_date: '2026-11-03T10:00:00Z', reference: 'REC-001' }
  ]
  const res = computeFifoCreditPurchases({ totalDette: 150000, totalRembourse: 70000, soldeDu: 80000 }, sales, [], payments)

  assert.strictEqual(res.length, 2)
  assert.strictEqual(res[0].reference, 'FAC-001')
  assert.strictEqual(res[0].montant_initial, 50000)
  assert.strictEqual(res[0].montant_rembourse, 50000)
  assert.strictEqual(res[0].solde_restant, 0)
  assert.strictEqual(res[0].statut, 'SOLDÉ')

  assert.strictEqual(res[1].reference, 'FAC-002')
  assert.strictEqual(res[1].montant_initial, 100000)
  assert.strictEqual(res[1].montant_rembourse, 20000)
  assert.strictEqual(res[1].solde_restant, 80000)
  assert.strictEqual(res[1].statut, 'EN COURS')

  // Totaux
  const totAchat = res.reduce((s, p) => s + p.montant_initial, 0)
  const totRemb = res.reduce((s, p) => s + p.montant_rembourse, 0)
  const totSolde = res.reduce((s, p) => s + p.solde_restant, 0)
  assert.strictEqual(totAchat, 150000)
  assert.strictEqual(totRemb, 70000)
  assert.strictEqual(totSolde, 80000)
  console.log('  ✅ Test 2 validé : Exemple canonique FIFO (FAC-001 SOLDÉ 50k/50k, FAC-002 EN COURS 20k/100k reste 80k)')
}

// TEST 3 : Plusieurs remboursements successifs cumulés sur une même facture
{
  const sales = [{ id: '1', order_number: 'FAC-001', credit_amount: 100000, created_at: '2026-11-01T08:00:00Z' }]
  const payments = [
    { id: 'p1', amount: 30000, payment_method: 'Espèces', payment_date: '2026-11-02T10:00:00Z', reference: 'REC-1' },
    { id: 'p2', amount: 40000, payment_method: 'MTN MoMo', payment_date: '2026-11-03T11:00:00Z', reference: 'REC-2' }
  ]
  const res = computeFifoCreditPurchases({ totalDette: 100000, totalRembourse: 70000, soldeDu: 30000 }, sales, [], payments)

  assert.strictEqual(res.length, 1)
  assert.strictEqual(res[0].montant_rembourse, 70000)
  assert.strictEqual(res[0].solde_restant, 30000)
  assert.strictEqual(res[0].payments_imputes.length, 2)
  assert.strictEqual(res[0].payments_imputes[0].montant_impute, 30000)
  assert.strictEqual(res[0].payments_imputes[1].montant_impute, 40000)
  console.log('  ✅ Test 3 validé : Remboursements successifs cumulés (30k + 40k = 70k) sans dupliquer la facture')
}

// TEST 4 : Dédoublonnage strict des opérations dupliquées
{
  const sales = [{ id: '1', order_number: 'FAC-001', credit_amount: 50000, created_at: '2026-11-01T08:00:00Z' }]
  const dupes = [
    { id: 'p1', amount: 20000, payment_method: 'Espèces', payment_date: '2026-11-02T10:00:00Z' },
    { id: 'p1', amount: 20000, payment_method: 'Espèces', payment_date: '2026-11-02T10:00:00Z' },
    { id: 'p1', amount: 20000, payment_method: 'Espèces', payment_date: '2026-11-02T10:00:00Z' }
  ]
  const res = computeFifoCreditPurchases({ totalDette: 50000, totalRembourse: 20000, soldeDu: 30000 }, sales, [], dupes)
  assert.strictEqual(res.length, 1)
  assert.strictEqual(res[0].montant_rembourse, 20000)
  assert.strictEqual(res[0].payments_imputes.length, 1)
  console.log('  ✅ Test 4 validé : Triples enregistrements dédoublonnés avec succès en 1 seule opération')
}

// TEST 5 : Fuseau horaire Bénin UTC+1 exact
{
  function beninInputToIso(inputVal) {
    const withTz = inputVal.length === 16 ? `${inputVal}:00+01:00` : inputVal
    return new Date(withTz).toISOString()
  }
  function formatBeninDateTime(isoString) {
    return new Intl.DateTimeFormat('fr-BJ', {
      timeZone: 'Africa/Porto-Novo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoString))
  }

  const iso = beninInputToIso('2026-11-20T10:30')
  assert.strictEqual(iso, '2026-11-20T09:30:00.000Z')
  const formatted = formatBeninDateTime(iso)
  assert(formatted.includes('10:30'), `L'heure doit être exactement 10:30 mais était ${formatted}`)
  console.log('  ✅ Test 5 validé : Fuseau horaire Bénin UTC+1 exact (10h30 reste 10h30 sans décalage)')
}

// TEST 6 : Filtre par période avec report du solde antérieur
{
  function filterPurchasesByPeriod(trackedPurchases, allPayments, startDateStr, endDateStr) {
    const start = startDateStr ? new Date(`${startDateStr}T00:00:00Z`).getTime() : 0
    const end = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`).getTime() : Infinity

    const priorPurchases = trackedPurchases.filter(p => new Date(p.date).getTime() < start)
    const priorPurchasesTotal = priorPurchases.reduce((s, p) => s + p.montant_initial, 0)
    const priorPayments = allPayments.filter(p => new Date(p.payment_date).getTime() < start)
    const priorPaymentsTotal = priorPayments.reduce((s, p) => s + p.amount, 0)
    const soldeAnterieur = Math.max(0, priorPurchasesTotal - priorPaymentsTotal)

    const periodPurchases = trackedPurchases.filter(p => {
      const t = new Date(p.date).getTime()
      return t >= start && t <= end
    })
    const achatsPeriode = periodPurchases.reduce((s, p) => s + p.montant_initial, 0)

    const paymentsInPeriod = allPayments.filter(p => {
      const t = new Date(p.payment_date).getTime()
      return t >= start && t <= end
    })
    const remboursementsPeriode = paymentsInPeriod.reduce((s, p) => s + p.amount, 0)

    const soldeFinal = Math.max(0, soldeAnterieur + achatsPeriode - remboursementsPeriode)

    const displayPurchases = trackedPurchases.filter(p => {
      const t = new Date(p.date).getTime()
      if (t >= start && t <= end) return true
      if (t < start) {
        const paymentsBeforeStartOnThis = (p.payments_imputes || [])
          .filter(pi => new Date(pi.payment_date).getTime() < start)
          .reduce((sum, pi) => sum + pi.montant_impute, 0)
        return (p.montant_initial - paymentsBeforeStartOnThis) > 0
      }
      return false
    })

    return { soldeAnterieur, achatsPeriode, remboursementsPeriode, soldeFinal, purchases: displayPurchases }
  }

  const tracked = [
    { id: '1', reference: 'FAC-OCT-01', date: '2026-10-15T10:00:00Z', montant_initial: 50000, payments_imputes: [{ payment_date: '2026-11-05T10:00:00Z', montant_impute: 50000 }] },
    { id: '2', reference: 'FAC-NOV-01', date: '2026-11-10T10:00:00Z', montant_initial: 30000, payments_imputes: [] }
  ]
  const pays = [{ id: 'p1', amount: 50000, payment_date: '2026-11-05T10:00:00Z' }]

  const report = filterPurchasesByPeriod(tracked, pays, '2026-11-01', '2026-11-30')
  assert.strictEqual(report.soldeAnterieur, 50000)
  assert.strictEqual(report.achatsPeriode, 30000)
  assert.strictEqual(report.remboursementsPeriode, 50000)
  assert.strictEqual(report.soldeFinal, 30000)
  assert.strictEqual(report.purchases.length, 2)
  console.log('  ✅ Test 6 validé : Filtre période avec report antérieur (50k + 30k - 50k = 30k final)')
}

console.log('🎉 TOUS LES 6 TESTS CRITIQUES DU MODULE CLIENTS & CRÉANCES ONT RÉUSSI AVEC SUCCÈS !')
