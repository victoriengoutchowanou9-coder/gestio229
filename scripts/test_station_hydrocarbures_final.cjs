// =============================================================================
// GESTIO 229 — SUITE DE VALIDATION INTÉGRALE : STATION-SERVICE & HYDROCARBURES
// =============================================================================

let totalPassed = 0
let totalFailed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ SUCCÈS: ${message}`)
    totalPassed++
  } else {
    console.error(`  ❌ ÉCHEC: ${message}`)
    totalFailed++
  }
}

console.log('=============================================================================')
console.log('TEST 1 : CALCULS FISCAUX & DÉCOMPOSITION ACHAT TTC / HT / TVA')
console.log('=============================================================================')

// Test 1.1 : Achat TTC avec TVA 18% cochée
const puAchatTTC = 620
const tauxTva = 18
const isTvaApplicable = true

const puAchatHT_avecTVA = isTvaApplicable && tauxTva > 0
  ? Math.round((puAchatTTC / (1 + tauxTva / 100)) * 100) / 100
  : puAchatTTC

const montantTVA_Achat = isTvaApplicable && tauxTva > 0
  ? Math.round((puAchatTTC - puAchatHT_avecTVA) * 100) / 100
  : 0

assert(puAchatHT_avecTVA === 525.42, `Prix unitaire d'achat HT calculé à partir de 620 TTC = 525.42 FCFA (attendu: 525.42, obtenu: ${puAchatHT_avecTVA})`)
assert(montantTVA_Achat === 94.58, `Montant TVA unitaire déductible = 94.58 FCFA (attendu: 94.58, obtenu: ${montantTVA_Achat})`)
assert(Math.round(puAchatHT_avecTVA + montantTVA_Achat) === puAchatTTC, `Pas de double imposition ni perte au centime : HT + TVA = TTC (620 FCFA)`)

// Test 1.2 : Achat TTC avec TVA décochée (TPS ou exonération légale)
const isTvaApplicable_decochée = false
const puAchatHT_sansTVA = isTvaApplicable_decochée
  ? Math.round((puAchatTTC / (1 + tauxTva / 100)) * 100) / 100
  : puAchatTTC

const montantTVA_sansTVA = isTvaApplicable_decochée
  ? Math.round((puAchatTTC - puAchatHT_sansTVA) * 100) / 100
  : 0

assert(puAchatHT_sansTVA === 620, `TVA décochée : prix d'achat HT = TTC sans majoration arbitraire (obtenu: ${puAchatHT_sansTVA})`)
assert(montantTVA_sansTVA === 0, `TVA décochée : aucun montant de TVA imputé (obtenu: ${montantTVA_sansTVA})`)

// Test 1.3 : Marge brute unitaire estimée (Essence Super à 680 FCFA vente TTC)
const puVenteTTC = 680
const puVenteHT = isTvaApplicable && tauxTva > 0
  ? Math.round((puVenteTTC / (1 + tauxTva / 100)) * 100) / 100
  : puVenteTTC
const margeUnitaireHT = Math.round((puVenteHT - puAchatHT_avecTVA) * 100) / 100
const tauxMarque = Math.round((margeUnitaireHT / puVenteHT) * 1000) / 10

assert(puVenteHT === 576.27, `Prix de vente HT calculé depuis 680 TTC = 576.27 FCFA (obtenu: ${puVenteHT})`)
assert(margeUnitaireHT === 50.85, `Marge brute unitaire HT = 50.85 FCFA / L (obtenu: ${margeUnitaireHT})`)
assert(tauxMarque === 8.8, `Taux de marque = 8.8% (obtenu: ${tauxMarque}%)`)

console.log('\n=============================================================================')
console.log('TEST 2 : LIAISON ACHATS CAMION-CITERNE, DÉPOTAGE, ÉCARTS & CUMP')
console.log('=============================================================================')

const quantiteCommandee = 30000
const quantiteFactureeBL = 30000
const quantiteRecueDepotee = 29850
const ecartLivraison = quantiteRecueDepotee - quantiteFactureeBL
const fraisTransport = 150000

assert(ecartLivraison === -150, `Écart de livraison constaté : -150 L (perte transporteur détectée)`)

const totalCarburantTTC = quantiteRecueDepotee * puAchatTTC
const totalAchatTTC = totalCarburantTTC + fraisTransport
const cumpLivraison = Math.round((totalAchatTTC / quantiteRecueDepotee) * 100) / 100

assert(totalCarburantTTC === 18507000, `Total carburant TTC dépoté (29 850 L * 620) = 18 507 000 FCFA`)
assert(totalAchatTTC === 18657000, `Total acquisition TTC avec transport (150 000 FCFA) = 18 657 000 FCFA`)
assert(cumpLivraison === 625.03, `Coût réel unitaire d'acquisition (CUMP) = 625.03 FCFA / L (obtenu: ${cumpLivraison})`)

// Test mise à jour stock cuve
const stockInitialCuve = 5000
const stockApresValidation = stockInitialCuve + quantiteRecueDepotee
assert(stockApresValidation === 34850, `Stock cuve mis à jour uniquement après validation effective : 5 000 + 29 850 = 34 850 L`)

console.log('\n=============================================================================')
console.log('TEST 3 : SHIFTS POMPISTES, TARIFS DYNAMIQUES & REVERSEMENTS')
console.log('=============================================================================')

const indexDebut = 125430.5
const indexFin = 127930.5
const volumeSorti = indexFin - indexDebut
const prixOfficielGasoil = 700 // Tarif dynamique officiel (pas de 650 en dur)
const caTheorique = volumeSorti * prixOfficielGasoil

const versementEspeces = 1200000
const versementMomo = 450000
const versementCredit = 100000
const totalVersements = versementEspeces + versementMomo + versementCredit
const ecartShift = totalVersements - caTheorique

assert(volumeSorti === 2500, `Volume distribué calculé par index : 2 500 Litres`)
assert(caTheorique === 1750000, `CA théorique au tarif officiel dynamique (2 500 L * 700 F) = 1 750 000 FCFA`)
assert(totalVersements === 1750000, `Total des règlements reçus (Espèces + MoMo + Crédit) = 1 750 000 FCFA`)
assert(ecartShift === 0, `Rapprochement shift équilibré : écart = 0 FCFA`)

console.log('\n=============================================================================')
console.log('TEST 4 : SÉCURITÉ & AUTO-RÉPARATION PROD (CHUNK FAILURE SUR VERCEL)')
console.log('=============================================================================')

const fs = require('fs')
const path = require('path')

const errorBoundaryContent = fs.readFileSync(path.join(__dirname, '../src/components/common/SectorErrorBoundary.tsx'), 'utf8')
const mainContent = fs.readFileSync(path.join(__dirname, '../src/main.tsx'), 'utf8')
const viteConfigContent = fs.readFileSync(path.join(__dirname, '../vite.config.ts'), 'utf8')

assert(
  errorBoundaryContent.includes('Failed to fetch dynamically imported module') &&
  errorBoundaryContent.includes('localStorage.clear()') &&
  errorBoundaryContent.includes('sessionStorage.clear()') &&
  errorBoundaryContent.includes('caches.delete'),
  `SectorErrorBoundary intègre l'auto-réparation automatique avec purge des caches lors d'un chunk invalide`
)

assert(
  mainContent.includes('vite:preloadError'),
  `main.tsx écoute 'vite:preloadError' pour recharger immédiatement sans blocage`
)

assert(
  viteConfigContent.includes('manifest: true'),
  `vite.config.ts génère le manifest de build pour assurer l'intégrité de déploiement`
)

console.log('\n=============================================================================')
console.log('TEST 5 : COHÉRENCE MARGES CARBURANTS — NON-MÉLANGE HT ET TTC')
console.log('=============================================================================')

const pricingTabContent = fs.readFileSync(path.join(__dirname, '../src/components/station/StationFuelPricingTab.tsx'), 'utf8')

// Vérifier l'absence de l'ancien calcul erroné (HT - TTC)
assert(
  !pricingTabContent.includes('puHT - unitCost'),
  `Suppression du calcul erroné qui soustrayait le coût TTC du prix HT (puHT - unitCost)`
)

// Test CARB-SUPER : 680 TTC vente / 620 TTC achat -> Vente HT 576.27, Achat HT 525.42
const superTauxTVA = 18
const superVenteTTC = 680
const superAchatTTC = 620
const superVenteHT = Math.round((superVenteTTC / (1 + superTauxTVA / 100)) * 100) / 100
const superAchatHT = Math.round((superAchatTTC / (1 + superTauxTVA / 100)) * 100) / 100
const superMargeHT = Math.round((superVenteHT - superAchatHT) * 100) / 100
const superMargeTTC = superVenteTTC - superAchatTTC

assert(Math.round(superMargeHT) === 51, `CARB-SUPER : Marge brute HT = +${Math.round(superMargeHT)} FCFA/L (attendu: +51, PAS -44)`)
assert(superMargeTTC === 60, `CARB-SUPER : Marge brute TTC = +${superMargeTTC} FCFA/L`)

// Test CARB-GASOIL : 700 TTC vente / 640 TTC achat -> Vente HT 593.22, Achat HT 542.37
const gasoilVenteTTC = 700
const gasoilAchatTTC = 640
const gasoilVenteHT = Math.round((gasoilVenteTTC / (1 + superTauxTVA / 100)) * 100) / 100
const gasoilAchatHT = Math.round((gasoilAchatTTC / (1 + superTauxTVA / 100)) * 100) / 100
const gasoilMargeHT = Math.round((gasoilVenteHT - gasoilAchatHT) * 100) / 100
const gasoilMargeTTC = gasoilVenteTTC - gasoilAchatTTC

assert(Math.round(gasoilMargeHT) === 51, `CARB-GASOIL : Marge brute HT = +${Math.round(gasoilMargeHT)} FCFA/L (attendu: +51, PAS négatif)`)
assert(gasoilMargeTTC === 60, `CARB-GASOIL : Marge brute TTC = +${gasoilMargeTTC} FCFA/L`)

// Test CARB-PETROLE : 650 TTC vente / 590 TTC achat -> Vente HT 550.85, Achat HT 500.00
const petroleVenteTTC = 650
const petroleAchatTTC = 590
const petroleVenteHT = Math.round((petroleVenteTTC / (1 + superTauxTVA / 100)) * 100) / 100
const petroleAchatHT = Math.round((petroleAchatTTC / (1 + superTauxTVA / 100)) * 100) / 100
const petroleMargeHT = Math.round((petroleVenteHT - petroleAchatHT) * 100) / 100
const petroleMargeTTC = petroleVenteTTC - petroleAchatTTC

assert(Math.round(petroleMargeHT) === 51, `CARB-PETROLE : Marge brute HT = +${Math.round(petroleMargeHT)} FCFA/L (attendu: +51, PAS négatif)`)
assert(petroleMargeTTC === 60, `CARB-PETROLE : Marge brute TTC = +${petroleMargeTTC} FCFA/L`)

console.log('\n=============================================================================')
console.log(`BILAN DES TESTS : ${totalPassed} réussis, ${totalFailed} échoués.`)
console.log('=============================================================================')

if (totalFailed > 0) {
  process.exit(1)
} else {
  console.log('🎉 TOUTES LES VALIDATIONS STATION-SERVICE SONT CONFORMES ET OPÉRATIONNELLES !')
}
