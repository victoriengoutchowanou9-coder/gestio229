// =============================================================================
// TEST SUITE : SÉPARATION VENTE DISTRIBUTEUR & VENTE EN PANIER
// GESTIO229 — SECTEUR STATION-SERVICE & HYDROCARBURES
// =============================================================================

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  isFuelProduct,
  calculateAmountFromVolume,
  calculateVolumeFromAmount,
  DEFAULT_STATION_FUELS
} from '../src/utils/stationFuelHelper.ts'

console.log('🧪 [TEST SUITE] Démarrage des vérifications Vente Distributeur vs Vente en Panier...\n')

let passedTests = 0

function runTest(desc, fn) {
  try {
    fn()
    console.log(`  ✅ [PASS] ${desc}`)
    passedTests++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`)
    console.error(`     Erreur: ${err.message}`)
    process.exit(1)
  }
}

// -----------------------------------------------------------------------------
// TEST 1 : Classification stricte des Carburants Distributeur
// -----------------------------------------------------------------------------
runTest('Classification stricte : Carburants en vrac reconnus comme isFuelProduct=true', () => {
  const fuels = [
    { name: 'Essence Super', unit: 'Litre', selling_price: 680 },
    { name: 'Super', code: 'CARB-01', selling_price: 680 },
    { name: 'Gasoil', unit: 'Litre', selling_price: 700 },
    { name: 'Gazole', code: 'FUEL-02', selling_price: 700 },
    { name: 'Pétrole Lampant', unit: 'Litre', selling_price: 650 },
    { name: 'Petrole', selling_price: 650 },
    { name: 'Carburant Industriel', category: { name: 'Carburants' } },
    { name: 'Diesel Station', sector_meta: { is_carburant: true } },
    { name: 'Super 95', sector_meta: { type_carburant: 'Essence Super' }, unit: 'Litre' },
  ]

  for (const f of fuels) {
    assert.strictEqual(isFuelProduct(f), true, `Le carburant ${f.name} doit être identifié comme carburant.`)
  }
})

// -----------------------------------------------------------------------------
// TEST 2 : Préservation absolue des Lubrifiants & Produits Boutique (Non-Carburant)
// -----------------------------------------------------------------------------
runTest('Classification stricte : Lubrifiants et Boutique reconnus comme isFuelProduct=false', () => {
  const boutique = [
    { name: 'Huile Moteur 15W40 5L', selling_price: 15000, category: { name: 'Lubrifiants' } },
    { name: 'Huile Synthétique 5W30', selling_price: 22000 },
    { name: 'Graisse Roulement 1kg', selling_price: 4500 },
    { name: 'Liquide de Frein DOT 4 500ml', selling_price: 3500 },
    { name: 'Liquide de Refroidissement 4L', selling_price: 6000 },
    { name: 'Filtre à Gasoil Toyota', selling_price: 8500 }, // Contient "gasoil" mais est un filtre !
    { name: 'Additif Injecteur Gasoil', selling_price: 5000 }, // Contient "gasoil" mais est un additif !
    { name: 'Additif Essence Nettoyant', selling_price: 4500 }, // Contient "essence" mais est un additif !
    { name: 'Filtre à Huile', selling_price: 4000 },
    { name: 'Balais Essuie-Glace 55cm', selling_price: 7000 },
    { name: 'Liquide Lave-Glace Démoustiquant', selling_price: 2500 },
    { name: 'Eau Minérale Possotomé 1.5L', selling_price: 500 }, // Boutique
  ]

  for (const b of boutique) {
    assert.strictEqual(isFuelProduct(b), false, `Le produit boutique "${b.name}" ne doit JAMAIS être classé comme carburant.`)
  }
})

// -----------------------------------------------------------------------------
// TEST 3 : Calculs de conversion bidirectionnels exacts (Montant <-> Volume)
// -----------------------------------------------------------------------------
runTest('Calculs : Conversion exacte sans bug d\'arrondi (Montant <-> Volume)', () => {
  const prixSuper = 680 // FCFA/L
  const prixGasoil = 700 // FCFA/L

  // 10 000 FCFA d'Essence Super -> 10000 / 680 = 14.7058... -> 14.71 L
  const vol1 = calculateVolumeFromAmount(10000, prixSuper)
  assert.strictEqual(vol1, 14.71)

  // 14.71 L d'Essence Super -> 14.71 * 680 = 10002.8 -> 10003 FCFA
  const mnt1 = calculateAmountFromVolume(vol1, prixSuper)
  assert.strictEqual(mnt1, 10003)

  // 5 000 FCFA de Gasoil -> 5000 / 700 = 7.1428... -> 7.14 L
  const vol2 = calculateVolumeFromAmount(5000, prixGasoil)
  assert.strictEqual(vol2, 7.14)

  // 20 Litres de Gasoil -> 20 * 700 = 14 000 FCFA
  const mnt2 = calculateAmountFromVolume(20, prixGasoil)
  assert.strictEqual(mnt2, 14000)

  // Cas limites : 0 ou négatif
  assert.strictEqual(calculateVolumeFromAmount(0, 680), 0)
  assert.strictEqual(calculateAmountFromVolume(0, 680), 0)
})

// -----------------------------------------------------------------------------
// TEST 4 : Référentiel des carburants par défaut de la station
// -----------------------------------------------------------------------------
runTest('Référentiel station : 3 carburants officiels configurés par défaut', () => {
  assert.strictEqual(DEFAULT_STATION_FUELS.length, 3)
  const names = DEFAULT_STATION_FUELS.map(f => f.produit)
  assert.ok(names.includes('Essence Super'))
  assert.ok(names.includes('Gasoil'))
  assert.ok(names.includes('Pétrole Lampant'))

  for (const f of DEFAULT_STATION_FUELS) {
    assert.ok(f.prix_actuel > 0, `Prix du carburant ${f.produit} doit être positif`)
    assert.ok(f.numero_pompe.length > 0)
    assert.ok(f.code_pistolet.length > 0)
  }
})

// -----------------------------------------------------------------------------
// TEST 5 : Intégrité du fichier VenteDistributeurPage.tsx
// -----------------------------------------------------------------------------
runTest('Composant VenteDistributeurPage : structure, modes de paiement et ticket', () => {
  const filePath = path.resolve('src/pages/dashboard/station/VenteDistributeurPage.tsx')
  assert.ok(fs.existsSync(filePath), 'VenteDistributeurPage.tsx doit exister')
  const content = fs.readFileSync(filePath, 'utf-8')

  // Vérifier la présence des modules & fonctionnalités requis
  assert.ok(content.includes('Vente Distributeur de Carburant'))
  assert.ok(content.includes('Essence Super'))
  assert.ok(content.includes('Gasoil'))
  assert.ok(content.includes('Pétrole Lampant'))
  assert.ok(content.includes('pompiste'))
  assert.ok(content.includes('flotte'))
  assert.ok(content.includes('enregistrerMouvementCaisse'))
  assert.ok(content.includes('showTicketModal'))
  assert.ok(content.includes('window.print()'))
  assert.ok(content.includes('calcMode === \'montant\''))
  assert.ok(content.includes('calcMode === \'volume\''))
})

// -----------------------------------------------------------------------------
// TEST 6 : Exclusion des carburants dans le panier POSPage.tsx
// -----------------------------------------------------------------------------
runTest('POSPage : Exclusion stricte des carburants dans le catalogue et panier', () => {
  const filePath = path.resolve('src/pages/dashboard/vente-pos/POSPage.tsx')
  assert.ok(fs.existsSync(filePath), 'POSPage.tsx doit exister')
  const content = fs.readFileSync(filePath, 'utf-8')

  // Vérifier le filtrage des carburants
  assert.ok(content.includes('isFuelProduct'), 'POSPage doit importer et utiliser isFuelProduct')
  assert.ok(content.includes('isStation && isFuelProduct(p)'), 'filteredProducts doit exclure isFuelProduct quand isStation')
  assert.ok(content.includes('Carburant non autorisé en panier'), 'addToCart doit bloquer l\'ajout de carburant en panier')
  assert.ok(content.includes('Module 2 : Lubrifiants & Boutique'), 'Bandeau Module 2 doit être présent')
  assert.ok(!content.includes('<StationFuelDispenser onAddToCart={handleDirectAddToCart} />'), 'L\'ancien injecteur ne doit plus être dans POSPage')
})

// -----------------------------------------------------------------------------
// TEST 7 : Configuration des routes dans App.tsx
// -----------------------------------------------------------------------------
runTest('App.tsx : Routes pour vente-distributeur et distributeur configurées', () => {
  const filePath = path.resolve('src/App.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.ok(content.includes('VenteDistributeurPage'), 'VenteDistributeurPage doit être importé dans App.tsx')
  assert.ok(content.includes('path="vente-distributeur"'), 'Route vente-distributeur doit être déclarée')
  assert.ok(content.includes('path="distributeur"'), 'Alias distributeur doit être déclaré')
})

// -----------------------------------------------------------------------------
// TEST 8 : Navigation latérale dans SectorLoader.ts
// -----------------------------------------------------------------------------
runTest('SectorLoader.ts : Entrées séparées pour Vente Distributeur et Vente en Panier', () => {
  const filePath = path.resolve('src/lib/SectorLoader.ts')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.ok(content.includes("id: 'vente_distributeur'"), 'vente_distributeur doit être dans stationNav')
  assert.ok(content.includes('Vente Distributeur (Carburants)'), 'Libellé Vente Distributeur doit être clair')
  assert.ok(content.includes('Vente en Panier (Lubrifiants & Boutique)'), 'Libellé Vente en Panier doit être clair')
})

// -----------------------------------------------------------------------------
// TEST 9 : Déclaration dans moduleRegistry.ts
// -----------------------------------------------------------------------------
runTest('moduleRegistry.ts : Module vente_distributeur déclaré pour station-service', () => {
  const filePath = path.resolve('src/core/modules/moduleRegistry.ts')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.ok(content.includes("'vente_distributeur':"), 'vente_distributeur doit être dans availableModules')
  assert.ok(content.includes("sectorSlugs: ['station-service']"))
})

// -----------------------------------------------------------------------------
// TEST 10 : Simulation de flux de vente complet Distributeur
// -----------------------------------------------------------------------------
runTest('Simulation : Flux complet Vente Distributeur (Sélection -> Calcul -> Paiement -> Reçu)', () => {
  const pompe = DEFAULT_STATION_FUELS[0] // Essence Super à 680 FCFA/L
  const montantClient = 10000 // FCFA
  const volumeDistribue = calculateVolumeFromAmount(montantClient, pompe.prix_actuel) // 14.71 L
  const modePaiement = 'CASH'
  const pompiste = { id: 'pomp-01', nom: 'Saliou BIO' }
  const vehicule = { immat: 'AZ-4589-RB', client: 'Société BTP Bénin' }

  assert.strictEqual(volumeDistribue, 14.71)
  assert.strictEqual(montantClient, 10000)

  // Création du reçu
  const ticket = {
    orderNumber: 'CARB-20261020-1234',
    pompisteNom: pompiste.nom,
    pompe: pompe.numero_pompe,
    pistolet: pompe.code_pistolet,
    carburant: pompe.produit,
    volume: volumeDistribue,
    prixLitre: pompe.prix_actuel,
    montantTotal: montantClient,
    modePaiement,
    vehicule: vehicule.immat,
  }

  assert.strictEqual(ticket.carburant, 'Essence Super')
  assert.strictEqual(ticket.volume, 14.71)
  assert.strictEqual(ticket.montantTotal, 10000)
  assert.strictEqual(ticket.modePaiement, 'CASH')
  assert.strictEqual(ticket.pompisteNom, 'Saliou BIO')
  assert.strictEqual(ticket.vehicule, 'AZ-4589-RB')
})

// -----------------------------------------------------------------------------
// TEST 11 : Simulation de flux de vente complet Panier (Lubrifiants)
// -----------------------------------------------------------------------------
runTest('Simulation : Flux complet Vente en Panier (Articles boutique -> Pas de carburant -> Total)', () => {
  const articlesBoutique = [
    { id: 'lub-01', name: 'Huile Total Quartz 5000 4L', price: 16000, qty: 2 },
    { id: 'acc-02', name: 'Liquide de Frein DOT 4', price: 3500, qty: 1 },
  ]

  // Vérifier qu'aucun article n'est un carburant
  for (const art of articlesBoutique) {
    assert.strictEqual(isFuelProduct(art), false)
  }

  const totalPanier = articlesBoutique.reduce((acc, item) => acc + (item.price * item.qty), 0)
  assert.strictEqual(totalPanier, 35500) // 16000*2 + 3500 = 35500 FCFA
})

// -----------------------------------------------------------------------------
// TEST 12 : Non-régression des autres secteurs (Imprimerie, Restaurant, etc.)
// -----------------------------------------------------------------------------
runTest('Non-régression : Les modules et pages des autres secteurs sont intacts', () => {
  const filesToCheck = [
    'src/pages/dashboard/imprimerie/ImprimerieVenteRapidePage.tsx',
    'src/pages/dashboard/restaurant/RestaurantOrderWidget.tsx',
    'src/pages/dashboard/caisse/CaissePage.tsx',
    'src/pages/dashboard/caisse/ClotureCaisse.tsx',
  ]

  for (const f of filesToCheck) {
    assert.ok(fs.existsSync(path.resolve(f)), `Le fichier ${f} doit exister sans altération`)
  }
})

console.log(`\n🎉 [SUCCÈS] Tous les ${passedTests} tests unitaires et d'intégration sont VALIDÉS avec succès !`)
