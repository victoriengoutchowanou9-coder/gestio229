/**
 * Suite de tests automatisés : Gestion des Lignes du Panier (Vente et POS)
 * Vérifie :
 * 1. Chaque ajout d'un même produit génère une NOUVELLE ligne indépendante avec lineId unique.
 * 2. Indépendance de modification de quantité par lineId (modifier ligne 1 ne touche pas ligne 2).
 * 3. Indépendance de suppression par lineId (supprimer ligne 2 préserve lignes 1 et 3).
 * 4. Exactitude du total général et sous-totaux.
 * 5. Décompte de stock total exact (somme de toutes les lignes vendues du produit).
 * 6. Protection contre le dépassement de stock vente (cumul de toutes les lignes comparé au stock dispo).
 */

const assert = require('assert')

console.log('=================================================================')
console.log('  TEST SUITE : GESTION DES LIGNES DU PANIER MULTI-LIGNES GESTIO 229')
console.log('=================================================================\n')

// 1. Simulation du modèle de panier multi-lignes
function createCart() {
  let lines = []

  function addProduct(product, qty, unitPrice, discount = 0) {
    const lineId = `line-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const newLine = {
      lineId,
      product,
      qty,
      unitPrice,
      discount,
      total_ttc: Math.max(0, qty * unitPrice - discount)
    }
    lines.push(newLine)
    return newLine
  }

  function updateLineQty(lineId, newQty) {
    lines = lines.map(l => {
      if (l.lineId !== lineId) return l
      return {
        ...l,
        qty: newQty,
        total_ttc: Math.max(0, newQty * l.unitPrice - l.discount)
      }
    })
  }

  function removeLine(lineId) {
    lines = lines.filter(l => l.lineId !== lineId)
  }

  function getTotalTTC() {
    return lines.reduce((acc, l) => acc + l.total_ttc, 0)
  }

  function getTotalQtyForProduct(productId) {
    return lines
      .filter(l => l.product.id === productId)
      .reduce((sum, l) => sum + l.qty, 0)
  }

  function computeTotalStockDeduction() {
    const productMap = new Map()
    for (const l of lines) {
      const pid = l.product.id
      const existing = productMap.get(pid) || 0
      productMap.set(pid, existing + l.qty)
    }
    return productMap
  }

  return {
    get lines() { return lines },
    addProduct,
    updateLineQty,
    removeLine,
    getTotalTTC,
    getTotalQtyForProduct,
    computeTotalStockDeduction
  }
}

// ─── TEST 1 : AJOUTS MULTIPLES DU MÊME PRODUIT CRÉENT DES LIGNES SÉPARÉES ─────
console.log('▶ Test 1 : Chaque ajout d\'un même produit crée une NOUVELLE ligne distincte...')
const cart = createCart()
const cocaCola = { id: 'prod-coca-001', name: 'Coca-Cola 50cl', stock_vente: 20 }

const l1 = cart.addProduct(cocaCola, 2, 500)
const l2 = cart.addProduct(cocaCola, 3, 500)
const l3 = cart.addProduct(cocaCola, 1, 500)

assert.strictEqual(cart.lines.length, 3, 'Le panier doit contenir exactement 3 lignes distinctes.')
assert.notStrictEqual(l1.lineId, l2.lineId, 'La ligne 1 et 2 doivent avoir des lineId uniques.')
assert.notStrictEqual(l2.lineId, l3.lineId, 'La ligne 2 et 3 doivent avoir des lineId uniques.')
assert.strictEqual(cart.lines[0].qty, 2)
assert.strictEqual(cart.lines[1].qty, 3)
assert.strictEqual(cart.lines[2].qty, 1)
assert.strictEqual(cart.getTotalTTC(), 3000, 'Total : (2*500) + (3*500) + (1*500) = 3000 FCFA')
console.log('  ✔ Succès : 3 lignes indépendantes créées avec succès (2x, 3x, 1x). Total = 3000 FCFA.\n')

// ─── TEST 2 : INDÉPENDANCE DE MODIFICATION DE QUANTITÉ ───────────────────────
console.log('▶ Test 2 : Modification de quantité de la Ligne 1 sans impacter Ligne 2 ou Ligne 3...')
// Modifier la quantité de la ligne 1 : passe de 2 à 4
cart.updateLineQty(l1.lineId, 4)

assert.strictEqual(cart.lines[0].qty, 4, 'La ligne 1 doit maintenant valoir 4.')
assert.strictEqual(cart.lines[1].qty, 3, 'La ligne 2 doit rester intacte à 3.')
assert.strictEqual(cart.lines[2].qty, 1, 'La ligne 3 doit rester intacte à 1.')
assert.strictEqual(cart.lines[0].total_ttc, 2000, 'Ligne 1 total : 4 * 500 = 2000 FCFA')
assert.strictEqual(cart.getTotalTTC(), 4000, 'Total : (4*500) + (3*500) + (1*500) = 4000 FCFA')
console.log('  ✔ Succès : Modification de ligne 1 isolée sans effet collatéral.\n')

// ─── TEST 3 : INDÉPENDANCE DE SUPPRESSION PAR LINEID ─────────────────────────
console.log('▶ Test 3 : Suppression de la Ligne 2 (quantité 3) sans supprimer Ligne 1 ni Ligne 3...')
cart.removeLine(l2.lineId)

assert.strictEqual(cart.lines.length, 2, 'Il doit rester exactement 2 lignes.')
assert.strictEqual(cart.lines[0].lineId, l1.lineId, 'La première ligne restante est l1.')
assert.strictEqual(cart.lines[1].lineId, l3.lineId, 'La deuxième ligne restante est l3.')
assert.strictEqual(cart.lines[0].qty, 4)
assert.strictEqual(cart.lines[1].qty, 1)
assert.strictEqual(cart.getTotalTTC(), 2500, 'Total : (4*500) + (1*500) = 2500 FCFA')
console.log('  ✔ Succès : Ligne 2 supprimée proprement, lignes 1 et 3 conservées.\n')

// ─── TEST 4 : DÉCOMPTE TOTAL DU STOCK SANS DOUBLE DÉDUCTION NI PERTE ─────────
console.log('▶ Test 4 : Décompte du stock cumulé de chaque produit...')
// Ajoutons un autre produit (ex: Fanta)
const fanta = { id: 'prod-fanta-002', name: 'Fanta Orange 50cl', stock_vente: 15 }
const l4 = cart.addProduct(fanta, 2, 500)
const l5 = cart.addProduct(fanta, 3, 500)

const deductions = cart.computeTotalStockDeduction()
assert.strictEqual(deductions.get('prod-coca-001'), 5, 'Coca-Cola doit être déstocké de 4 + 1 = 5 unités.')
assert.strictEqual(deductions.get('prod-fanta-002'), 5, 'Fanta doit être déstocké de 2 + 3 = 5 unités.')

// Vérifions le nouveau stock vente après vente
const stockRestantCoca = cocaCola.stock_vente - deductions.get('prod-coca-001')
const stockRestantFanta = fanta.stock_vente - deductions.get('prod-fanta-002')

assert.strictEqual(stockRestantCoca, 15, 'Stock Coca restant : 20 - 5 = 15.')
assert.strictEqual(stockRestantFanta, 10, 'Stock Fanta restant : 15 - 5 = 10.')
console.log('  ✔ Succès : Déstockage groupé exact (5 Coca-Cola, 5 Fanta). Aucun décompte erroné.\n')

// ─── TEST 5 : CONTRÔLE DE DISPONIBILITÉ GLOBALE DU STOCK ─────────────────────
console.log('▶ Test 5 : Vérification de la disponibilité du stock cumulant toutes les lignes...')
function canAddLine(product, currentCart, qtyToAdd) {
  const alreadyInCart = currentCart.getTotalQtyForProduct(product.id)
  return (alreadyInCart + qtyToAdd) <= product.stock_vente
}

// Coca a 20 en stock. Il y a déjà 5 dans le panier.
assert.strictEqual(canAddLine(cocaCola, cart, 15), true, '5 déjà + 15 demandé = 20 <= 20 (autorisé)')
assert.strictEqual(canAddLine(cocaCola, cart, 16), false, '5 déjà + 16 demandé = 21 > 20 (rejeté)')
console.log('  ✔ Succès : Contrôle de disponibilité inter-lignes validé.\n')

console.log('=================================================================')
console.log('  TOUS LES TESTS MULTI-LIGNES DU PANIER SONT VALIDÉS AVEC SUCCÈS !')
console.log('=================================================================\n')
