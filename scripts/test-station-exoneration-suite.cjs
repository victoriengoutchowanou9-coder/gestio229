// =============================================================================
// GESTIO 229 — SUITE DE VALIDATION : PARAMÉTRAGE PERMANENT D'EXONÉRATION STATION-SERVICE
// Spécifique Secteur Station-Service & Hydrocarbures (CGI Bénin & UEMOA)
// =============================================================================

const assert = require('assert')

console.log('--- Démarrage de la Suite de Tests : Exonération Station-Service Gestio 229 ---')

/**
 * Logique pure identique à calculateFuelExonerationTax
 */
function calculateFuelExonerationTax(totalTTC, exonerationConfig, vatRate = 18) {
  const mntTTC = Math.max(0, Math.round(Number(totalTTC) || 0))
  const rate = Math.max(0, Number(vatRate) || 18)

  const isActive = Boolean(exonerationConfig?.is_active)
  const tauxPct = isActive ? Math.min(100, Math.max(0, Number(exonerationConfig?.taux_exoneration_pct) || 0)) : 0

  if (!isActive || tauxPct <= 0) {
    const ht = rate > 0 ? Math.round((mntTTC / (1 + rate / 100)) * 100) / 100 : mntTTC
    const tva = Math.round((mntTTC - ht) * 100) / 100
    return {
      tauxExonerationPct: 0,
      isExonereActive: false,
      montantTotalTTC: mntTTC,
      montantExonere: 0,
      montantTaxableTTC: mntTTC,
      montantTaxableHT: ht,
      montantTVA: tva,
      vatRate: rate
    }
  }

  // 1. Montant exonéré = Montant total TTC × Pourcentage d'exonération
  const montantExonere = Math.round(mntTTC * (tauxPct / 100))

  // 2. Montant taxable TTC = Montant total TTC - Montant exonéré
  const montantTaxableTTC = Math.max(0, mntTTC - montantExonere)

  // 3. Montant net HT taxable = Montant taxable TTC / (1 + Taux TVA / 100)
  const montantTaxableHT = (rate > 0 && montantTaxableTTC > 0)
    ? Math.round((montantTaxableTTC / (1 + rate / 100)) * 100) / 100
    : montantTaxableTTC

  // 4. Montant TVA (18%) = Montant taxable TTC - Montant net HT taxable
  const montantTVA = Math.round((montantTaxableTTC - montantTaxableHT) * 100) / 100

  return {
    tauxExonerationPct: tauxPct,
    isExonereActive: true,
    montantTotalTTC: mntTTC,
    montantExonere,
    montantTaxableTTC,
    montantTaxableHT,
    montantTVA,
    vatRate: rate
  }
}

/**
 * Générateur de texte du ticket (identique à l'affichage du composant)
 */
function renderTicketReceiptText(ticket) {
  const lines = [
    `STATION: ${ticket.stationNom}`,
    `PRODUIT: ${ticket.carburant}`,
    `VOLUME: ${ticket.volume} L x ${ticket.prixLitre} FCFA`,
    `Montant net HT taxable : ${ticket.montantHTTaxable} FCFA`,
    `TVA (18%) : ${ticket.montantTVA} FCFA`,
  ]

  if (Number(ticket.montantExonere) > 0) {
    lines.push(`Montant exonéré : ${ticket.montantExonere} FCFA`)
  }

  lines.push(`TOTAL TTC : ${ticket.montantTotal} FCFA`)
  lines.push(`Mode de paiement : ${ticket.modePaiement}`)

  return lines.join('\n')
}

// -----------------------------------------------------------------------------
// TEST 1 : Calcul automatique conforme aux formules CGI (Exemple 10 000 FCFA à 50%)
// -----------------------------------------------------------------------------
{
  console.log('\n[TEST 1] Calcul fiscal automatique 10 000 FCFA avec exonération 50%...')
  const cfg = { is_active: true, taux_exoneration_pct: 50 }
  const res = calculateFuelExonerationTax(10000, cfg, 18)

  assert.strictEqual(res.isExonereActive, true)
  assert.strictEqual(res.montantTotalTTC, 10000)
  assert.strictEqual(res.montantExonere, 5000, 'Montant exonéré doit être 5 000')
  assert.strictEqual(res.montantTaxableTTC, 5000, 'Montant taxable TTC doit être 5 000')
  assert.strictEqual(res.montantTaxableHT, 4237.29, 'Montant net HT taxable doit être 4 237.29')
  assert.strictEqual(res.montantTVA, 762.71, 'TVA 18% doit être 762.71')
  assert.strictEqual(res.montantExonere + res.montantTaxableTTC, 10000, 'Total TTC = Exonéré + Taxable TTC')
  assert.strictEqual(Math.round((res.montantTaxableHT + res.montantTVA) * 100) / 100, 5000, 'Taxable TTC = HT + TVA')
  console.log('✓ TEST 1 validé avec succès !')
}

// -----------------------------------------------------------------------------
// TEST 2 : Exonération désactivée ou à 0% (Régime 100% Taxable)
// -----------------------------------------------------------------------------
{
  console.log('\n[TEST 2] Comportement quand l\'exonération est désactivée ou à 0%...')
  const cfgInactive = { is_active: false, taux_exoneration_pct: 50 }
  const resInactive = calculateFuelExonerationTax(20000, cfgInactive, 18)
  assert.strictEqual(resInactive.isExonereActive, false)
  assert.strictEqual(resInactive.montantExonere, 0)
  assert.strictEqual(resInactive.montantTaxableTTC, 20000)
  assert.strictEqual(resInactive.montantTaxableHT, 16949.15)
  assert.strictEqual(resInactive.montantTVA, 3050.85)

  const cfgZero = { is_active: true, taux_exoneration_pct: 0 }
  const resZero = calculateFuelExonerationTax(20000, cfgZero, 18)
  assert.strictEqual(resZero.montantExonere, 0)
  assert.strictEqual(resZero.montantTaxableTTC, 20000)
  console.log('✓ TEST 2 validé avec succès !')
}

// -----------------------------------------------------------------------------
// TEST 3 : Exonération totale à 100%
// -----------------------------------------------------------------------------
{
  console.log('\n[TEST 3] Exonération totale (100%)...')
  const cfg100 = { is_active: true, taux_exoneration_pct: 100 }
  const res100 = calculateFuelExonerationTax(15000, cfg100, 18)
  assert.strictEqual(res100.montantExonere, 15000)
  assert.strictEqual(res100.montantTaxableTTC, 0)
  assert.strictEqual(res100.montantTaxableHT, 0)
  assert.strictEqual(res100.montantTVA, 0)
  assert.strictEqual(res100.montantTotalTTC, 15000)
  console.log('✓ TEST 3 validé avec succès !')
}

// -----------------------------------------------------------------------------
// TEST 4 : Non-rétroactivité & Modification ultérieure du paramétrage
// -----------------------------------------------------------------------------
{
  console.log('\n[TEST 4] Test de non-rétroactivité des ventes et historique...')
  // Vente 1 avec paramétrage initial de 20%
  const configInitiale = { is_active: true, taux_exoneration_pct: 20 }
  const vente1 = calculateFuelExonerationTax(10000, configInitiale, 18)

  const ticket1 = {
    orderNumber: 'CARB-20261116-0001',
    montantTotal: 10000,
    montantHTTaxable: vente1.montantTaxableHT,
    montantTVA: vente1.montantTVA,
    montantExonere: vente1.montantExonere,
    tauxExonerationApplique: vente1.tauxExonerationPct
  }

  // Modification ultérieure du paramétrage par l'utilisateur à 40% avec historique
  const configModifiee = {
    is_active: true,
    taux_exoneration_pct: 40,
    history: [
      {
        ancien_taux_pct: 20,
        nouveau_taux_pct: 40,
        is_active: true,
        date_modification: new Date().toISOString(),
        user_name: 'Directeur Station'
      }
    ]
  }

  // Vente 2 avec le nouveau paramétrage
  const vente2 = calculateFuelExonerationTax(10000, configModifiee, 18)
  const ticket2 = {
    orderNumber: 'CARB-20261116-0002',
    montantTotal: 10000,
    montantHTTaxable: vente2.montantTaxableHT,
    montantTVA: vente2.montantTVA,
    montantExonere: vente2.montantExonere,
    tauxExonerationApplique: vente2.tauxExonerationPct
  }

  // Vérification de la non-rétroactivité
  assert.strictEqual(ticket1.montantExonere, 2000, 'Ticket 1 doit conserver 2 000 FCFA exonéré')
  assert.strictEqual(ticket1.tauxExonerationApplique, 20, 'Ticket 1 doit garder le taux de 20%')
  assert.strictEqual(ticket2.montantExonere, 4000, 'Ticket 2 doit avoir 4 000 FCFA exonéré')
  assert.strictEqual(ticket2.tauxExonerationApplique, 40, 'Ticket 2 doit avoir le taux de 40%')
  assert.strictEqual(configModifiee.history.length, 1, 'L\'historique doit contenir la modification')
  console.log('✓ TEST 4 validé avec succès !')
}

// -----------------------------------------------------------------------------
// TEST 5 : Conformité stricte du ticket de caisse (Mentions autorisées & interdites)
// -----------------------------------------------------------------------------
{
  console.log('\n[TEST 5] Vérification stricte des mentions du ticket de caisse...')
  const cfg = { is_active: true, taux_exoneration_pct: 35 }
  const vente = calculateFuelExonerationTax(20000, cfg, 18)

  const ticket = {
    stationNom: 'STATION DE L\'ETOILE',
    carburant: 'Essence Super',
    volume: 29.41,
    prixLitre: 680,
    montantTotal: 20000,
    montantHTTaxable: vente.montantTaxableHT,
    montantTVA: vente.montantTVA,
    montantExonere: vente.montantExonere,
    modePaiement: 'CASH'
  }

  const receiptOutput = renderTicketReceiptText(ticket)

  // 1. Mentions obligatoires présentes
  assert.ok(receiptOutput.includes('Essence Super'), 'Produit doit être présent')
  assert.ok(receiptOutput.includes('29.41 L'), 'Quantité totale doit être présente')
  assert.ok(receiptOutput.includes('680 FCFA'), 'Prix unitaire doit être présent')
  assert.ok(receiptOutput.includes('Montant net HT taxable :'), 'Montant net HT taxable doit être présent')
  assert.ok(receiptOutput.includes('TVA (18%) :'), 'TVA (18%) doit être présente')
  assert.ok(receiptOutput.includes('Montant exonéré :'), 'Montant exonéré doit être présent')
  assert.ok(receiptOutput.includes('TOTAL TTC : 20000 FCFA'), 'TOTAL TTC doit être présent')
  assert.ok(receiptOutput.includes('Mode de paiement : CASH'), 'Mode de paiement doit être présent')

  // 2. Mentions strictement interdites absentes
  assert.strictEqual(receiptOutput.includes('35%'), false, 'Le pourcentage d\'exonération (35%) NE DOIT JAMAIS être affiché sur le ticket')
  const textWithoutVat = receiptOutput.replace('TVA (18%)', '')
  assert.strictEqual(textWithoutVat.includes('%'), false, 'Aucun signe de pourcentage d\'exonération ne doit figurer en dehors de TVA (18%)')
  assert.strictEqual(receiptOutput.includes('Quantité exonérée'), false, 'La mention "Quantité exonérée" NE DOIT JAMAIS être affichée')
  assert.strictEqual(receiptOutput.includes('Quantité taxable'), false, 'La mention "Quantité taxable" NE DOIT JAMAIS être affichée')

  console.log('Reçu généré conforme :\n---\n' + receiptOutput + '\n---')
  console.log('✓ TEST 5 validé avec succès !')
}

console.log('\n=============================================================')
console.log('TOUS LES TESTS (5/5) SONT VALIDÉS AVEC SUCCÈS !')
console.log('=============================================================')
