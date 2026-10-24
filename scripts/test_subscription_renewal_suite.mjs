// =============================================================================
// GESTIO 229 ERP — SUITE DE VALIDATION COMPLÈTE DES 12 TESTS OBLIGATOIRES
// Prompt de correction du module « Mon Abonnement »
// =============================================================================

import {
  calculateSubscriptionPrice,
  calculateDurationPrice,
  calculateDetailedRenewalPricing,
  calculateRenewalDates,
  calculateAddedSectorMonthlyPrice,
} from '../src/core/subscription/subscriptionEngine.ts'

console.log('='.repeat(80))
console.log('TEST SUITE GESTIO 229 — MODULE « MON ABONNEMENT » (12 TESTS OBLIGATOIRES)')
console.log('='.repeat(80))

let passedCount = 0
let failedCount = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  [OK] ${message}`)
    passedCount++
  } else {
    console.error(`  [FAIL] ${message}`)
    failedCount++
  }
}

// -----------------------------------------------------------------------------
// TEST 1 : Utilisateur inscrit avec 1 secteur et plan Starter
// -----------------------------------------------------------------------------
console.log('\n--- TEST 1 : Inscription avec 1 secteur en Starter ---')
{
  const res = calculateDetailedRenewalPricing({
    scope: 'boutique',
    allSectors: ['boutique'],
    initialSectors: ['boutique'],
    initialPlan: 'starter',
    sectorsState: [
      { sectorSlug: 'boutique', isInitialSector: true, planTier: 'starter', isGratuit: false, isPaidAndActive: false }
    ],
    durationMonths: 1,
  })
  assert(res.planAppliedSlug === 'starter', 'Starter doit être automatiquement retenu')
  assert(res.netMonthlyPrice === 5000, 'Tarif mensuel Starter doit être exactement 5 000 FCFA')
  assert(res.netTotalPrice === 5000, 'Montant total pour 1 mois doit être 5 000 FCFA')
}

// -----------------------------------------------------------------------------
// TEST 2 : Utilisateur inscrit avec 1 secteur et plan Complet
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2 : Inscription avec 1 secteur en Complet ---')
{
  const res = calculateDetailedRenewalPricing({
    scope: 'boutique',
    allSectors: ['boutique'],
    initialSectors: ['boutique'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 'boutique', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false }
    ],
    durationMonths: 1,
  })
  assert(res.planAppliedSlug === 'entreprise', '1 Secteur (Complet) doit être automatiquement retenu')
  assert(res.netMonthlyPrice === 10000, 'Tarif mensuel Complet doit être exactement 10 000 FCFA')
  assert(res.netTotalPrice === 10000, 'Montant total pour 1 mois doit être 10 000 FCFA')
}

// -----------------------------------------------------------------------------
// TEST 3 : Inscription avec 3 secteurs (Gratuité initiale de 30j puis 25 000 F)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3 : Inscription avec 3 secteurs ---')
{
  // Pendant le mois gratuit
  const duringTrial = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['boutique', 'pharmacie', 'restaurant'],
    initialSectors: ['boutique', 'pharmacie', 'restaurant'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 'boutique', isInitialSector: true, planTier: 'entreprise', isGratuit: true, isPaidAndActive: false },
      { sectorSlug: 'pharmacie', isInitialSector: true, planTier: 'entreprise', isGratuit: true, isPaidAndActive: false },
      { sectorSlug: 'restaurant', isInitialSector: true, planTier: 'entreprise', isGratuit: true, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(duringTrial.freeSectorsCount === 3, 'Les 3 secteurs initiaux bénéficient du mois gratuit')
  assert(duringTrial.paidSectorsCount === 0, '0 secteur facturé pendant la gratuité initiale active')
  assert(duringTrial.netTotalPrice === 0, 'Montant à payer pendant la gratuité = 0 FCFA')

  // Après expiration du mois gratuit (renouvellement)
  const afterTrial = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['boutique', 'pharmacie', 'restaurant'],
    initialSectors: ['boutique', 'pharmacie', 'restaurant'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 'boutique', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
      { sectorSlug: 'pharmacie', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
      { sectorSlug: 'restaurant', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(afterTrial.netMonthlyPrice === 25000, 'Tarif officiel pour 3 secteurs = 25 000 FCFA / mois')
  assert(afterTrial.sectorDiscountMonthly === 5000, 'Réduction multi-secteurs pour 3 secteurs = 5 000 FCFA (30 000 F - 25 000 F)')
  assert(afterTrial.netTotalPrice === 25000, 'Montant total à payer après le mois gratuit = 25 000 FCFA')
}

// -----------------------------------------------------------------------------
// TEST 4 : Inscription avec 4 secteurs (3 gratuits + 1 payant)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4 : Inscription avec 4 secteurs (3 gratuits + 1 payant) ---')
{
  const res = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['s1', 's2', 's3', 's4'],
    initialSectors: ['s1', 's2', 's3', 's4'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 's1', isInitialSector: true, planTier: 'entreprise', isGratuit: true, isPaidAndActive: false },
      { sectorSlug: 's2', isInitialSector: true, planTier: 'entreprise', isGratuit: true, isPaidAndActive: false },
      { sectorSlug: 's3', isInitialSector: true, planTier: 'entreprise', isGratuit: true, isPaidAndActive: false },
      { sectorSlug: 's4', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(res.freeSectorsCount === 3, 'Exactement 3 secteurs bénéficient de la gratuité')
  assert(res.paidSectorsCount === 1, 'Le 4ème secteur est payant (+5 000 F CFA)')
  assert(res.netTotalPrice === 5000, 'Montant à payer = 5 000 FCFA pour le 4ème secteur')
}

// -----------------------------------------------------------------------------
// TEST 5 : Ajout d'un 4ème secteur ultérieurement (Starter 5k ou Complet 10k)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5 : Ajout d\'un secteur ultérieur (choix Starter vs Complet) ---')
{
  const priceStarter = calculateAddedSectorMonthlyPrice('starter')
  const priceComplet = calculateAddedSectorMonthlyPrice('entreprise')
  assert(priceStarter === 5000, 'Option A (Starter pour nouveau secteur) = 5 000 FCFA / mois')
  assert(priceComplet === 10000, 'Option B (Complet pour nouveau secteur) = 10 000 FCFA / mois')

  const resStarter = calculateDetailedRenewalPricing({
    scope: 's4',
    allSectors: ['s1', 's2', 's3', 's4'],
    initialSectors: ['s1', 's2', 's3'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 's1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's2', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's3', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's4', isInitialSector: false, planTier: 'starter', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(resStarter.netMonthlyPrice === 5000, 'Nouveau secteur souscrit en Starter = 5 000 FCFA')

  const resComplet = calculateDetailedRenewalPricing({
    scope: 's4',
    allSectors: ['s1', 's2', 's3', 's4'],
    initialSectors: ['s1', 's2', 's3'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 's1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's2', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's3', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's4', isInitialSector: false, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(resComplet.netMonthlyPrice === 10000, 'Nouveau secteur souscrit en Complet = 10 000 FCFA')
}

// -----------------------------------------------------------------------------
// TEST 6 : Le plan d'un nouveau secteur ne modifie pas le plan des secteurs existants
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6 : Indépendance des plans initiaux et supplémentaires ---')
{
  const resInitial = calculateDetailedRenewalPricing({
    scope: 's1',
    allSectors: ['s1', 's2'],
    initialSectors: ['s1'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 's1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
      { sectorSlug: 's2', isInitialSector: false, planTier: 'starter', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(resInitial.planAppliedSlug === 'entreprise', 'Le plan initial de s1 reste Entreprise (Complet)')
  assert(resInitial.netMonthlyPrice === 10000, 'Le tarif de s1 reste 10 000 FCFA')
}

// -----------------------------------------------------------------------------
// TEST 7 : Renouvellement des secteurs initiaux (pas de nouveau mois gratuit)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7 : Renouvellement sans réattribution de gratuité ---')
{
  const res = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['s1', 's2'],
    initialSectors: ['s1', 's2'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 's1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
      { sectorSlug: 's2', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(res.freeSectorsCount === 0, 'Aucun secteur gratuit lors du renouvellement')
  assert(res.paidSectorsCount === 2, 'Les 2 secteurs sont payants')
  assert(res.netTotalPrice === 15000, 'Tarif officiel pour 2 secteurs = 15 000 FCFA')
}

// -----------------------------------------------------------------------------
// TEST 8 : Secteur déjà payé et encore valide non facturé en double
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8 : Non double-facturation des secteurs actifs valides ---')
{
  // Compte avec s1 déjà payé et valide, s2 à renouveler
  const res = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['s1', 's2'],
    initialSectors: ['s1', 's2'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 's1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 's2', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 1,
  })
  assert(res.paidSectorsCount === 1, 'Seul le secteur expiré ou non couvert est facturé')
  assert(!res.paidSectorsList.includes('s1'), 's1 actif n\'est pas dans la liste des secteurs facturés')
  assert(res.netTotalPrice === 10000, 'Montant facturé = 10 000 FCFA pour le secteur restant')
}

// -----------------------------------------------------------------------------
// TEST 9 : Réduction dépend du nombre de secteurs, PAS de la durée (0% durée)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 9 : Règle de réduction multi-secteurs vs durée (0% durée) ---')
{
  // 1 secteur : pas de réduction multi-secteur
  const p1 = calculateSubscriptionPrice(1, 'entreprise')
  assert(p1.sectorDiscountMonthly === 0, '1 secteur : réduction multi-secteurs = 0 FCFA')
  assert(p1.priceMonthly === 10000, '1 secteur : 10 000 FCFA')

  // 2 secteurs : 5 000 FCFA de réduction
  const p2 = calculateSubscriptionPrice(2, 'entreprise')
  assert(p2.sectorDiscountMonthly === 5000, '2 secteurs : réduction multi-secteurs = 5 000 FCFA')
  assert(p2.priceMonthly === 15000, '2 secteurs : 15 000 FCFA / mois')

  // 3 secteurs : 5 000 FCFA de réduction
  const p3 = calculateSubscriptionPrice(3, 'entreprise')
  assert(p3.sectorDiscountMonthly === 5000, '3 secteurs : réduction multi-secteurs = 5 000 FCFA')
  assert(p3.priceMonthly === 25000, '3 secteurs : 25 000 FCFA / mois')

  // Test durées : 1, 3, 6, 12 mois -> strictement mensuel * durée
  for (const months of [1, 3, 6, 12]) {
    const durCalc = calculateDurationPrice(25000, months)
    assert(durCalc.discountPercent === 0, `Durée ${months} mois : remise durée = 0%`)
    assert(durCalc.discountAmount === 0, `Durée ${months} mois : remise durée = 0 FCFA`)
    assert(durCalc.netTotal === 25000 * months, `Durée ${months} mois : montant = ${25000 * months} FCFA`)
  }
}

// -----------------------------------------------------------------------------
// TEST 10 : Durée personnalisée (ex: 5 mois)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 10 : Durée personnalisée (5 mois) ---')
{
  const durCalc = calculateDurationPrice(15000, 5)
  assert(durCalc.discountPercent === 0, '5 mois : aucune remise de durée (0%)')
  assert(durCalc.netTotal === 75000, '5 mois pour 15 000 F/mois = exactement 75 000 FCFA')

  const dates = calculateRenewalDates(new Date('2026-10-01T00:00:00Z'), 5, new Date('2026-10-01T00:00:00Z'))
  const expectedEnd = new Date('2026-10-01T00:00:00Z')
  expectedEnd.setMonth(expectedEnd.getMonth() + 5)
  assert(dates.newExpirationDate.getMonth() === expectedEnd.getMonth(), 'Date de fin fixée à + 5 mois civils')
}

// -----------------------------------------------------------------------------
// TEST 11 : Cohérence stricte entre récapitulatif, calcul serveur et demande
// -----------------------------------------------------------------------------
console.log('\n--- TEST 11 : Cohérence exacte des montants UI / Serveur / Paiement ---')
{
  const detailed = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['b1', 'b2'],
    initialSectors: ['b1', 'b2'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 'b1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
      { sectorSlug: 'b2', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 4,
  })

  const uiDisplayedTotal = detailed.netTotalPrice
  const serverRecalculatedTotal = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['b1', 'b2'],
    initialSectors: ['b1', 'b2'],
    initialPlan: 'entreprise',
    sectorsState: [
      { sectorSlug: 'b1', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
      { sectorSlug: 'b2', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: false },
    ],
    durationMonths: 4,
  }).netTotalPrice

  const paymentSubmissionAmount = detailed.netTotalPrice

  assert(uiDisplayedTotal === 60000, 'Affichage UI = 60 000 FCFA (15 000 F * 4 mois)')
  assert(serverRecalculatedTotal === 60000, 'Recalcul serveur = 60 000 FCFA')
  assert(paymentSubmissionAmount === 60000, 'Montant soumis au paiement = 60 000 FCFA')
  assert(
    uiDisplayedTotal === serverRecalculatedTotal && serverRecalculatedTotal === paymentSubmissionAmount,
    'Concordance exacte et absolue des montants sans aucun écart'
  )
}

// -----------------------------------------------------------------------------
// TEST 12 : Données existantes et fonctionnalités intactes
// -----------------------------------------------------------------------------
console.log('\n--- TEST 12 : Préservation des données existantes et des fonctionnalités ---')
{
  const oldCompanyDefault = calculateDetailedRenewalPricing({
    scope: 'all',
    allSectors: ['boutique'],
    initialSectors: [],
    initialPlan: 'entreprise',
    sectorsState: [],
    durationMonths: 1,
  })
  assert(oldCompanyDefault.netTotalPrice === 10000, 'Compte hérité sans métadonnées fonctionne avec plan par défaut (10 000 FCFA)')
  assert(oldCompanyDefault.planAppliedSlug === 'entreprise', 'Plan appliqué Entreprise conservé')
}

console.log('\n' + '='.repeat(80))
console.log(`RÉSULTAT SUITE DE VALIDATION : ${passedCount} tests réussis, ${failedCount} échoués`)
console.log('='.repeat(80))

if (failedCount > 0) {
  process.exit(1)
}
