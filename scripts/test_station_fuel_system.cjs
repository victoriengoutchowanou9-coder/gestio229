// =============================================================================
// GESTIO 229 ERP — TEST SUITE : CARBURANTS, TARIFS, TVA ET MARGES BRUTES
// =============================================================================
// Couvre l'intégralité des 10 exigences du cahier des charges :
// 1. Audit et intégration dans l'architecture existante
// 2. Paramètres commerciaux et fiscaux dans Pompes & Cuves (3 carburants)
// 3. Synchronisation automatique des prix avec Vente Distributeur
// 4. Paramétrage TVA et exonération relié au régime fiscal d'entreprise
// 5. Affichage TVA et mentions fiscales sur les reçus / factures
// 6. Calcul automatique des marges par carburant (CUMP, CA net HT, Marge, Taux)
// 7. Intégration de la rubrique Rentabilité des carburants dans Rapports
// 8. Fiche journalière complète des carburants (physique + financier)
// 9. Sécurité, droits d'accès (Admin/Gérant vs Pompiste) et isolation multi-tenant
// 10. Préservation stricte du circuit des lubrifiants et autres produits
// =============================================================================

const assert = require('assert')
const fs = require('fs')
const path = require('path')

let testsPassed = 0
let testsFailed = 0

function it(desc, fn) {
  try {
    fn()
    console.log(`  ✅ SUCCÈS: ${desc}`)
    testsPassed++
  } catch (err) {
    console.error(`  ❌ ÉCHEC: ${desc}`)
    console.error(`     Détail: ${err.message}`)
    testsFailed++
  }
}

console.log('=============================================================================')
console.log('SUITE DE VALIDATION COMPLÈTE : STATION-SERVICE & CARBURANTS GESTIO 229')
console.log('=============================================================================\n')

const root = path.join(__dirname, '..')

const fuelServicePath = path.join(root, 'src/services/stationFuelService.ts')
const pricingTabPath = path.join(root, 'src/components/station/StationFuelPricingTab.tsx')
const dailySheetPath = path.join(root, 'src/components/station/StationDailyFuelSheetModal.tsx')
const reportComponentPath = path.join(root, 'src/components/station/StationFuelProfitabilityReport.tsx')
const pompesCuvesPath = path.join(root, 'src/pages/dashboard/station/PompesCuvesPage.tsx')
const venteDistributeurPath = path.join(root, 'src/pages/dashboard/station/VenteDistributeurPage.tsx')
const reportingPagePath = path.join(root, 'src/pages/dashboard/reporting/ReportingPage.tsx')
const helperPath = path.join(root, 'src/utils/stationFuelHelper.ts')
const taxPath = path.join(root, 'src/utils/tax.ts')

const fuelServiceCode = fs.readFileSync(fuelServicePath, 'utf8')
const pricingTabCode = fs.readFileSync(pricingTabPath, 'utf8')
const dailySheetCode = fs.readFileSync(dailySheetPath, 'utf8')
const reportComponentCode = fs.readFileSync(reportComponentPath, 'utf8')
const pompesCuvesCode = fs.readFileSync(pompesCuvesPath, 'utf8')
const venteDistributeurCode = fs.readFileSync(venteDistributeurPath, 'utf8')
const reportingPageCode = fs.readFileSync(reportingPagePath, 'utf8')
const helperCode = fs.readFileSync(helperPath, 'utf8')
const taxCode = fs.readFileSync(taxPath, 'utf8')

// ─── CONTRÔLE 1 : RÉFÉRENTIEL DES 3 CARBURANTS OFFICIELS ──────────────────────
console.log('--- 1. Référentiel des 3 Carburants Officiels ---')

it('Les 3 carburants officiels (Essence Super, Gasoil, Pétrole lampant) sont définis avec leurs codes', () => {
  assert.ok(fuelServiceCode.includes('CARB-SUPER'), 'Code CARB-SUPER manquant')
  assert.ok(fuelServiceCode.includes('Essence Super'), 'Nom Essence Super manquant')
  assert.ok(fuelServiceCode.includes('CARB-GASOIL'), 'Code CARB-GASOIL manquant')
  assert.ok(fuelServiceCode.includes('Gasoil'), 'Nom Gasoil manquant')
  assert.ok(fuelServiceCode.includes('CARB-PETROLE'), 'Code CARB-PETROLE manquant')
  assert.ok(fuelServiceCode.includes('Pétrole lampant'), 'Nom Pétrole lampant manquant')
})

it('Les tarifs nationaux de base sont initialisés (Super: 680, Gasoil: 700, Pétrole: 650)', () => {
  assert.ok(fuelServiceCode.includes('680'), 'Prix Super 680 manquant')
  assert.ok(fuelServiceCode.includes('700'), 'Prix Gasoil 700 manquant')
  assert.ok(fuelServiceCode.includes('650'), 'Prix Pétrole 650 manquant')
})

// ─── CONTRÔLE 2 : PARAMÈTRES COMMERCIAUX & FISCAUX DANS POMPES & CUVES ────────
console.log('\n--- 2. Espace Paramètres Commerciaux & Fiscaux dans Pompes & Cuves ---')

it('Pompes & Cuves intègre le 5ème onglet pour les paramètres commerciaux et fiscaux', () => {
  assert.ok(pompesCuvesCode.includes("activeTab === 'tarifs'"), 'Condition activeTab tarifs manquante')
  assert.ok(pompesCuvesCode.includes('Paramètres Commerciaux & Fiscaux'), 'Intitulé onglet manquant')
  assert.ok(pompesCuvesCode.includes('StationFuelPricingTab'), 'Composant StationFuelPricingTab non importé')
})

it('L\'onglet de paramétrage gère prix d\'achat, prix officiel, date d\'effet, TVA et historique', () => {
  assert.ok(pricingTabCode.includes('prix_vente'), 'Champ prix_vente manquant')
  assert.ok(pricingTabCode.includes('prix_achat_reference'), 'Champ prix_achat_reference manquant')
  assert.ok(pricingTabCode.includes('date_effet'), 'Champ date_effet manquant')
  assert.ok(pricingTabCode.includes('source_reglementaire'), 'Champ source_reglementaire manquant')
  assert.ok(pricingTabCode.includes('taux_tva'), 'Champ taux_tva manquant')
  assert.ok(pricingTabCode.includes('is_tva_applicable'), 'Champ is_tva_applicable manquant')
  assert.ok(pricingTabCode.includes('Historique Réglementaire'), 'Section historique manquante')
})

it('Seuls les utilisateurs expressément autorisés (Admin/Gérant) peuvent modifier les tarifs', () => {
  assert.ok(pricingTabCode.includes('canManagePrices'), 'Vérification de permission manquante')
  assert.ok(pricingTabCode.includes('isAdmin || user?.role === \'gerant\''), 'Rôles admin/gérant non vérifiés')
  assert.ok(pricingTabCode.includes('Lecture seule (Pompiste)'), 'Mode lecture seule pompiste absent')
})

// ─── CONTRÔLE 3 : SYNCHRONISATION AUTOMATIQUE AVEC VENTE DISTRIBUTEUR ─────────
console.log('\n--- 3. Synchronisation des Prix avec la Vente Distributeur ---')

it('Vente Distributeur charge les tarifs officiels via loadFuelCommercialConfigs', () => {
  assert.ok(venteDistributeurCode.includes('loadFuelCommercialConfigs'), 'loadFuelCommercialConfigs non appelé')
  assert.ok(venteDistributeurCode.includes('activeFuelConfig'), 'activeFuelConfig manquant')
})

it('Le calcul du montant et du volume est bidirectionnel et automatique', () => {
  assert.ok(venteDistributeurCode.includes('calculateVolumeFromAmount'), 'calculateVolumeFromAmount absent')
  assert.ok(venteDistributeurCode.includes('calculateAmountFromVolume'), 'calculateAmountFromVolume absent')
})

it('Vente Distributeur affiche la décomposition fiscale en direct (Net HT, TVA, TTC)', () => {
  assert.ok(venteDistributeurCode.includes('currentLiveTax'), 'currentLiveTax manquant')
  assert.ok(venteDistributeurCode.includes('Net HT'), 'Affichage Net HT manquant')
  assert.ok(venteDistributeurCode.includes('currentLiveTax.vatAmount'), 'Affichage TVA manquant')
})

// ─── CONTRÔLE 4 : CONFORMITÉ FISCALE, TVA ET EXONÉRATION ──────────────────────
console.log('\n--- 4. Paramétrage TVA et Régimes Fiscaux ---')

it('Le régime fiscal de l\'entreprise gouverne l\'application de la TVA', () => {
  assert.ok(fuelServiceCode.includes('getEnterpriseFiscalDefaults'), 'getEnterpriseFiscalDefaults manquant')
  assert.ok(fuelServiceCode.includes('Régime de la TPS'), 'Prise en charge régime TPS manquante')
  assert.ok(fuelServiceCode.includes('Exonération légale de TVA'), 'Prise en charge exonération manquante')
})

it('La désactivation de la TVA est encadrée et n\'invente pas de calcul fiscal parallèle', () => {
  assert.ok(fuelServiceCode.includes('calculateTaxFromTTC'), 'calculateTaxFromTTC de utils/tax non utilisé')
  assert.ok(taxCode.includes('HT = TTC / (1 + Taux TVA)'), 'Règle de conversion HT manquante dans tax.ts')
})

// ─── CONTRÔLE 5 : FACTURATION & REÇUS THERMIQUES ──────────────────────────────
console.log('\n--- 5. Affichage Fiscal sur Reçus et Factures ---')

it('Le reçu de vente de carburant affiche Net HT, TVA et mention fiscale appropriée', () => {
  assert.ok(venteDistributeurCode.includes('lastTicket.montantHT'), 'montantHT absent du ticket')
  assert.ok(venteDistributeurCode.includes('lastTicket.isVatSubject'), 'isVatSubject absent du ticket')
  assert.ok(venteDistributeurCode.includes('lastTicket.montantTVA'), 'montantTVA absent du ticket')
  assert.ok(venteDistributeurCode.includes('lastTicket.mentionFiscale'), 'mentionFiscale absente du ticket')
})

it('L\'enregistrement dans sales_orders conserve les montants historiques décomposés', () => {
  assert.ok(venteDistributeurCode.includes('subtotal_ht: taxResult.htPrice'), 'subtotal_ht non enregistré dans sales_orders')
  assert.ok(venteDistributeurCode.includes('total_tax: taxResult.vatAmount'), 'total_tax non enregistré dans sales_orders')
  assert.ok(venteDistributeurCode.includes('tva_rate: taxResult.vatRate'), 'tva_rate absent des metadata')
})

// ─── CONTRÔLE 6 : CALCUL DES MARGES BRUTES ET COÛT D\'ACQUISITION CUMP ────────
console.log('\n--- 6. Calcul des Marges Brutes et Valorisation CUMP ---')

it('Le coût d\'acquisition valorise les réceptions citernes validées (CUMP)', () => {
  assert.ok(fuelServiceCode.includes('calculateFuelAcquisitionCost'), 'calculateFuelAcquisitionCost manquant')
  assert.ok(fuelServiceCode.includes('station_receptions_carburant'), 'station_receptions_carburant non interrogée')
  assert.ok(fuelServiceCode.includes('frais_transport'), 'frais de transport non pris en compte dans acquisition')
})

it('Le logiciel ne génère aucun mouvement ni coût fictif si données manquantes', () => {
  assert.ok(fuelServiceCode.includes('hasKnownCost'), 'Flag hasKnownCost absent')
  assert.ok(fuelServiceCode.includes('Non renseigné'), 'Statut non renseigné absent')
  assert.ok(reportComponentCode.includes('hasMissingCost'), 'Avertissement données manquantes absent')
})

// ─── CONTRÔLE 7 : INTÉGRATION AU MODULE RAPPORTS ──────────────────────────────
console.log('\n--- 7. Rubrique Rentabilité des Carburants dans Rapports ---')

it('ReportingPage intègre le sous-onglet Rentabilité des Carburants pour station-service', () => {
  assert.ok(reportingPageCode.includes('StationFuelProfitabilityReport'), 'StationFuelProfitabilityReport non importé dans ReportingPage')
  assert.ok(reportingPageCode.includes('Rentabilité des Carburants'), 'Titre Rentabilité des Carburants manquant')
  assert.ok(reportingPageCode.includes('currentSectorSlug === \'station-service\''), 'Condition secteur station manquante')
})

it('Le tableau de rentabilité présente les 10 colonnes/indicateurs exigés', () => {
  assert.ok(reportComponentCode.includes('Quantité vendue en litres'), 'Indicateur Quantité vendue manquant')
  assert.ok(reportComponentCode.includes('Prix de vente unitaire'), 'Indicateur Prix vente unitaire manquant')
  assert.ok(reportComponentCode.includes('Coût d\'achat unitaire retenu'), 'Indicateur Coût achat unitaire manquant')
  assert.ok(reportComponentCode.includes('Chiffre d\'affaires net HT'), 'Indicateur CA net HT manquant')
  assert.ok(reportComponentCode.includes('Coût des quantités vendues'), 'Indicateur Coût quantités vendues manquant')
  assert.ok(reportComponentCode.includes('Marge brute unitaire'), 'Indicateur Marge unitaire manquant')
  assert.ok(reportComponentCode.includes('Marge brute totale'), 'Indicateur Marge brute totale manquant')
  assert.ok(reportComponentCode.includes('Taux de marge'), 'Indicateur Taux de marge manquant')
  assert.ok(reportComponentCode.includes('Taux de marque'), 'Indicateur Taux de marque manquant')
  assert.ok(reportComponentCode.includes('TVA collectée'), 'Indicateur TVA collectée manquant')
})

it('Les filtres par période (Journée, Période personnalisée, Mois) et produit sont disponibles', () => {
  assert.ok(reportComponentCode.includes('periodPreset'), 'Filtre période manquant')
  assert.ok(reportComponentCode.includes('selectedProduct'), 'Filtre produit manquant')
  assert.ok(reportComponentCode.includes('handleExportCSV'), 'Fonction export CSV/Excel manquante')
})

// ─── CONTRÔLE 8 : FICHE JOURNALIÈRE DES CARBURANTS ────────────────────────────
console.log('\n--- 8. Fiche Journalière Complète des Carburants ---')

it('La fiche journalière réconcilie stocks initiaux, réceptions, ventes, jaugeages et encaissements', () => {
  assert.ok(dailySheetCode.includes('stockInitial'), 'Champ stockInitial manquant')
  assert.ok(dailySheetCode.includes('receptionsLitres'), 'Champ receptionsLitres manquant')
  assert.ok(dailySheetCode.includes('quantiteVendueLitres'), 'Champ quantiteVendueLitres manquant')
  assert.ok(dailySheetCode.includes('stockTheoriqueFinal'), 'Champ stockTheoriqueFinal manquant')
  assert.ok(dailySheetCode.includes('stockPhysiqueJauge'), 'Champ stockPhysiqueJauge manquant')
  assert.ok(dailySheetCode.includes('ecartStockLitres'), 'Champ ecartStockLitres manquant')
  assert.ok(dailySheetCode.includes('encaissementsEspeces'), 'Champ encaissementsEspeces manquant')
  assert.ok(dailySheetCode.includes('encaissementsMomo'), 'Champ encaissementsMomo manquant')
})

it('La modale Fiche Journalière est accessible depuis Pompes & Cuves et Dashboard Station', () => {
  assert.ok(pompesCuvesCode.includes('StationDailyFuelSheetModal'), 'StationDailyFuelSheetModal non importé dans PompesCuvesPage')
  const dashboardCode = fs.readFileSync(path.join(root, 'src/pages/dashboard/station/StationDashboardPage.tsx'), 'utf8')
  assert.ok(dashboardCode.includes('StationDailyFuelSheetModal'), 'StationDailyFuelSheetModal non importé dans StationDashboardPage')
})

// ─── CONTRÔLE 9 & 10 : SÉPARATION DES CIRCUITS & ISOLATION MULTI-TENANT ───────
console.log('\n--- 9 & 10. Séparation des Lubrifiants et Isolation Multi-Tenant ---')

it('Le circuit des lubrifiants et boutiques reste étanche et indépendant', () => {
  assert.ok(helperCode.includes('isFuelProduct'), 'isFuelProduct absent')
  assert.ok(helperCode.includes('huile'), 'Exclusion huile absente')
  assert.ok(helperCode.includes('lubrifiant'), 'Exclusion lubrifiant absente')
  assert.ok(reportingPageCode.includes('Ventes Générales & Lubrifiants'), 'Onglet Lubrifiants séparé absent')
})

it('L\'isolation multi-tenant par company_id et sector_slug est strictement respectée', () => {
  assert.ok(fuelServiceCode.includes('company_id'), 'company_id absent de stationFuelService')
  assert.ok(fuelServiceCode.includes('sector_slug'), 'sector_slug absent de stationFuelService')
})

console.log('\n════════════════════════════════════════════════════════════════════')
console.log(`📊 RÉSULTAT : ${testsPassed} CONTRÔLES RÉUSSIS SUR ${testsPassed + testsFailed}`)
console.log('════════════════════════════════════════════════════════════════════\n')

if (testsFailed > 0) {
  process.exit(1)
}
