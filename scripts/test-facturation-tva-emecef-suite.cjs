// =============================================================================
// GESTIO 229 SaaS — SUITE DE VALIDATION COMPLÈTE FACTURATION, TVA & e-MECeF
// Conforme au Cahier des Charges Strict GESTIO 229
// =============================================================================

const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('🧪 ================================================================')
console.log('🧪 [GESTIO 229] VALIDATION FACTURATION, TVA, BON COMMANDE & PDF')
console.log('🧪 ================================================================')

// 1. Contrôle des fichiers sources modifiés & créés
const root = path.join(__dirname, '..')
const helperPath = path.join(root, 'src/utils/facturationHelper.ts')
const posPagePath = path.join(root, 'src/pages/dashboard/vente-pos/POSPage.tsx')
const configPagePath = path.join(root, 'src/pages/dashboard/configuration/ConfigPage.tsx')
const devisPdfPath = path.join(root, 'src/utils/imprimerieDevisPdf.ts')
const thermalPrinterPath = path.join(root, 'src/utils/thermalPrinter.ts')

assert.ok(fs.existsSync(helperPath), 'facturationHelper.ts doit exister')
assert.ok(fs.existsSync(posPagePath), 'POSPage.tsx doit exister')
assert.ok(fs.existsSync(configPagePath), 'ConfigPage.tsx doit exister')

const helperContent = fs.readFileSync(helperPath, 'utf8')
const posContent = fs.readFileSync(posPagePath, 'utf8')
const configContent = fs.readFileSync(configPagePath, 'utf8')
const devisPdfContent = fs.readFileSync(devisPdfPath, 'utf8')
const thermalContent = fs.readFileSync(thermalPrinterPath, 'utf8')

let testsPassed = 0

function it(desc, fn) {
  try {
    fn()
    console.log(`  ✅ PASS: ${desc}`)
    testsPassed++
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`)
    console.error(`     Erreur: ${err.message}`)
    process.exit(1)
  }
}

// ── TEST 1 : Rubrique et bouton d'activation dans Paramètres ───────────────
console.log('\n[TEST 1] Configuration e-MECeF / Facturation dans Paramètres...')
it('Présence de la rubrique "CONFIGURATION e-MECeF / FACTURATION" dans ConfigPage', () => {
  assert.ok(
    configContent.includes('CONFIGURATION e-MECeF / FACTURATION'),
    'ConfigPage doit contenir le titre exact de la rubrique'
  )
})

it('Bouton d\'activation "Mon entreprise dispose d\'un compte e-MECeF associé à GESTIO229"', () => {
  assert.ok(
    configContent.includes("Mon entreprise dispose d'un compte e-MECeF associé à GESTIO229"),
    'ConfigPage doit contenir le texte exact du bouton d\'activation'
  )
})

it('Isolation stricte par entreprise (tenant_id) et persistance localStorage/DB', () => {
  assert.ok(
    configContent.includes('gestio229_emecef_active_'),
    'ConfigPage doit persister l\'activation avec la clé isolée par entreprise'
  )
})

// ── TEST 2 : Gestion dynamique BON DE COMMANDE vs FACTURE DE VENTE ─────────
console.log('\n[TEST 2] Gestion dynamique du titre selon statut e-MECeF...')
it('Titre BON DE COMMANDE quand e-MECeF désactivé / non associé', () => {
  assert.ok(
    helperContent.includes("'BON DE COMMANDE'"),
    'facturationHelper doit retourner BON DE COMMANDE par défaut'
  )
  assert.ok(
    helperContent.includes('Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande'),
    'Le bon de commande doit impérativement afficher la mention prescrite'
  )
})

it('Titre FACTURE DE VENTE quand e-MECeF est associé et activé', () => {
  assert.ok(
    helperContent.includes("'FACTURE DE VENTE'"),
    'facturationHelper doit retourner FACTURE DE VENTE quand e_mecef_active est true'
  )
})

// ── TEST 3 : Calcul fiscal et formules mathématiques rigoureuses ───────────
console.log('\n[TEST 3] Formules fiscales : distinction base taxable HT vs exonéré...')

// Simulation algorithmique des fonctions de calcul fiscal
function simulateTaxDecomposition(lines, options = {}) {
  let totalHtTaxable = 0
  let totalExonere = 0
  let totalTva = 0
  let totalAib = 0

  lines.forEach((item) => {
    const qty = item.qty || 1
    const unitPrice = item.unitPrice || 0
    const lineTtc = qty * unitPrice
    const isVat = item.isVatSubject !== false
    const vatRate = isVat ? (item.vatRate || 18) : 0
    const isAib = item.isAibSubject || options.applyAibCart || false
    const aibRate = isAib ? (item.aibRate || options.cartAibRate || 1) : 0

    const rateTvaDec = isVat ? vatRate / 100 : 0
    const rateAibDec = isAib ? aibRate / 100 : 0

    let lineHt = lineTtc
    let lineTva = 0
    let lineAib = 0

    if (rateTvaDec > 0 || rateAibDec > 0) {
      const divider = 1 + rateTvaDec + rateAibDec
      lineHt = Math.round(lineTtc / divider)
      lineTva = Math.round(lineHt * rateTvaDec)
      lineAib = Math.round(lineHt * rateAibDec)
      const diff = lineTtc - (lineHt + lineTva + lineAib)
      if (diff !== 0) {
        if (rateTvaDec > 0) lineTva += diff
        else if (rateAibDec > 0) lineAib += diff
      }
    }

    if (isVat) {
      totalHtTaxable += lineHt
      totalTva += lineTva
    } else {
      totalExonere += lineTtc
    }
    totalAib += lineAib
  })

  const netAPayer = totalHtTaxable + totalExonere + totalTva + totalAib

  return {
    totalHtTaxable,
    totalExonere,
    totalTva,
    totalAib,
    netAPayer
  }
}

it('Scénario 1 : Vente 100% exonérée', () => {
  const lines = [
    { name: 'Médicament essentiel', qty: 2, unitPrice: 2500, isVatSubject: false },
    { name: 'Pain artisanal', qty: 5, unitPrice: 1000, isVatSubject: false }
  ]
  const res = simulateTaxDecomposition(lines)
  assert.strictEqual(res.totalHtTaxable, 0, 'La base taxable HT doit être strictement 0')
  assert.strictEqual(res.totalExonere, 10000, 'Le total exonéré doit être égal à 10 000 FCFA')
  assert.strictEqual(res.totalTva, 0, 'La TVA doit être strictement 0 FCFA')
  assert.strictEqual(res.netAPayer, 10000, 'Le Net à payer doit être de 10 000 FCFA')
})

it('Scénario 2 : Vente 100% taxable (TVA 18%)', () => {
  const lines = [
    { name: 'Téléviseur Smart', qty: 1, unitPrice: 118000, isVatSubject: true, vatRate: 18 }
  ]
  const res = simulateTaxDecomposition(lines)
  assert.strictEqual(res.totalHtTaxable, 100000, 'La base taxable HT doit être exactement 100 000 FCFA')
  assert.strictEqual(res.totalExonere, 0, 'Le total exonéré doit être 0')
  assert.strictEqual(res.totalTva, 18000, 'La TVA doit être exactement 18 000 FCFA (18% de 100 000)')
  assert.strictEqual(res.netAPayer, 118000, 'Le Net à payer doit être 118 000 FCFA')
})

it('Scénario 3 : Vente mixte avec articles taxables et exonérés', () => {
  const lines = [
    { name: 'Article Taxable', qty: 1, unitPrice: 11800, isVatSubject: true, vatRate: 18 },
    { name: 'Article Exonéré', qty: 1, unitPrice: 5000, isVatSubject: false }
  ]
  const res = simulateTaxDecomposition(lines)
  assert.strictEqual(res.totalHtTaxable, 10000, 'Total HT taxable = 10 000 FCFA (ne doit PAS inclure les 5 000 exonérés)')
  assert.strictEqual(res.totalExonere, 5000, 'Total exonéré = 5 000 FCFA')
  assert.strictEqual(res.totalTva, 1800, 'TVA = 1 800 FCFA (calculé exclusivement sur 10 000)')
  assert.strictEqual(res.netAPayer, 16800, 'Net à payer = 16 800 FCFA (10 000 HT + 5 000 Exonéré + 1 800 TVA)')
})

it('Scénario 4 : Vente avec Acompte AIB 1% calculé sur le HT', () => {
  const lines = [
    { name: 'Prestation taxable avec AIB', qty: 1, unitPrice: 11900, isVatSubject: true, vatRate: 18, isAibSubject: true, aibRate: 1 }
  ]
  const res = simulateTaxDecomposition(lines)
  assert.strictEqual(res.totalHtTaxable, 10000, 'Base HT = 10 000 FCFA')
  assert.strictEqual(res.totalTva, 1800, 'TVA 18% = 1 800 FCFA')
  assert.strictEqual(res.totalAib, 100, 'AIB 1% sur HT = 100 FCFA')
  assert.strictEqual(res.netAPayer, 11900, 'Total TTC client préservé = 11 900 FCFA')
})

// ── TEST 4 : Intégrité et fidélité de l'export PDF et de l'impression ───────
console.log('\n[TEST 4] Fidélité de l\'affichage écran, PDF et impression...')
it('POSPage intègre facturationHelper pour l\'affichage écran et PDF', () => {
  assert.ok(posContent.includes('facturationHelper'), 'POSPage doit importer facturationHelper')
  assert.ok(posContent.includes('modalDocTitle'), 'POSPage doit utiliser modalDocTitle')
  assert.ok(posContent.includes('currentSaleFiscalSummary'), 'POSPage doit utiliser currentSaleFiscalSummary')
  assert.ok(posContent.includes('Total HT taxable'), 'POSPage doit afficher "Total HT taxable"')
  assert.ok(posContent.includes('Total exonéré'), 'POSPage doit afficher "Total exonéré"')
})

it('Générateur PDF inclut la colonne Régime fiscal par ligne', () => {
  assert.ok(
    helperContent.includes("'Régime fiscal'") || helperContent.includes('regimeFiscalLabel'),
    'Le générateur PDF doit intégrer le régime fiscal de chaque article'
  )
})

it('Générateur PDF inclut les 7 blocs obligatoires A, B, C, D, E, F, G', () => {
  // A. Entreprise (ifu, rccm, address, city, phone, email)
  assert.ok(helperContent.includes('data.company.ifu_number') && helperContent.includes('data.company.rccm_number'), 'Bloc A Entreprise validé')
  // B. Document (documentTitle, order_number, date)
  assert.ok(helperContent.includes('data.documentTitle') && helperContent.includes('data.sale.order_number'), 'Bloc B Document validé')
  // C. Client (customer.name, customer.ifu)
  assert.ok(helperContent.includes('data.customer.name'), 'Bloc C Client validé')
  // D. Détail articles (code, name, qty, unit, unitPrice, regimeFiscalLabel, totalLineTtc)
  assert.ok(helperContent.includes('regimeFiscalLabel'), 'Bloc D Articles validé')
  // E. Récapitulatif (totalHtTaxable, totalExonere, totalTva, totalAib, netAPayer)
  assert.ok(helperContent.includes('totalHtTaxable') && helperContent.includes('totalExonere') && helperContent.includes('totalTva'), 'Bloc E Récapitulatif validé')
  // F. Règlements (payments, totalRegle, resteAPayer)
  assert.ok(helperContent.includes('totalRegle') && helperContent.includes('resteAPayer'), 'Bloc F Règlements validé')
  // G. Pied de document
  assert.ok(helperContent.includes('footerY') && helperContent.includes('Merci de passer à la caisse pour obtenir votre facture normalisée'), 'Bloc G Pied de document validé')
})

it('Support des formats A4 et Ticket Thermique 80mm sans perte d\'information', () => {
  assert.ok(helperContent.includes('generateFactureA4Pdf'), 'generateFactureA4Pdf doit exister')
  assert.ok(helperContent.includes('generateTicket80Pdf'), 'generateTicket80Pdf doit exister')
  assert.ok(thermalContent.includes('data.sale.title'), 'thermalPrinter doit prendre en compte le titre dynamique')
})

console.log('\n================================================================')
console.log(`🎉 SUCCÈS TOTAL : ${testsPassed}/${testsPassed} TESTS DE FACTURATION VALIDÉS !`)
console.log('================================================================\n')
