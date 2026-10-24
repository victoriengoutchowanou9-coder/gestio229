// =============================================================================
// TEST DE RÉSILIENCE ET NON-RÉGRESSION - AbonnementPage & abonnementService
// =============================================================================
import {
  calculateDetailedRenewalPricing,
  getSectorFeatureInfo,
} from '../src/core/subscription/subscriptionEngine.ts';

console.log('================================================================================');
console.log('TEST DE RÉSILIENCE ABONNEMENTPAGE & CONTRATS DE DONNÉES');
console.log('================================================================================');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [OK] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// CAS 1 & 4 : Premier rendu pendant chargement différé (companyMeta = null, targetScope != 'all')
// -----------------------------------------------------------------------------
console.log('\n--- CAS 1 & 4 : Rendu initial avec chargement différé (companyMeta = null, targetScope = "boutique") ---');
try {
  const companyMeta = null;
  const currentSectors = ['boutique', 'restaurant'];
  const targetScope = 'boutique';

  // Simulation du calcul isTargetAddedSector
  const initialSecs =
    Array.isArray(companyMeta?.initial_sectors) && companyMeta.initial_sectors.length > 0
      ? companyMeta.initial_sectors
      : Array.isArray(currentSectors)
      ? currentSectors.slice(0, 3)
      : [];

  const isTargetAddedSector = (() => {
    if (!targetScope || targetScope === 'all') return false;
    if (Array.isArray(companyMeta?.added_sectors) && companyMeta.added_sectors.includes(targetScope)) {
      return true;
    }
    if (Array.isArray(currentSectors) && currentSectors.includes(targetScope) && !initialSecs.includes(targetScope)) {
      return true;
    }
    return false;
  })();

  assert(isTargetAddedSector === false, 'isTargetAddedSector ne plante pas et retourne false pendant loading');

  const currentPlanForThisSector =
    companyMeta?.added_sectors_plans?.[targetScope] ||
    companyMeta?.sectors_meta?.[targetScope]?.plan_tier ||
    'entreprise';

  assert(currentPlanForThisSector === 'entreprise', 'currentPlanForThisSector utilise fallback sans erreur');
} catch (e) {
  assert(false, `Crash inattendu : ${e.message}`);
}

// -----------------------------------------------------------------------------
// CAS 2 : Donnée facultative absente (companyMeta.added_sectors = undefined)
// -----------------------------------------------------------------------------
console.log('\n--- CAS 2 : Donnée facultative absente (added_sectors undefined) ---');
try {
  const companyMeta = {
    initial_plan: 'starter',
    initial_sectors: ['boutique'],
    sectors_meta: {
      boutique: { is_initial_sector: true, plan_tier: 'starter', is_gratuit: true },
      restaurant: { is_initial_sector: false, plan_tier: 'starter', is_gratuit: false },
    },
    // added_sectors is undefined!
  };
  const currentSectors = ['boutique', 'restaurant'];

  // Test avec targetScope = 'restaurant' (secteur ajouté)
  const targetScope = 'restaurant';
  const initialSecs =
    Array.isArray(companyMeta?.initial_sectors) && companyMeta.initial_sectors.length > 0
      ? companyMeta.initial_sectors
      : currentSectors.slice(0, 3);

  const isTargetAddedSector = (() => {
    if (!targetScope || targetScope === 'all') return false;
    if (Array.isArray(companyMeta?.added_sectors) && companyMeta.added_sectors.includes(targetScope)) {
      return true;
    }
    if (Array.isArray(currentSectors) && currentSectors.includes(targetScope) && !initialSecs.includes(targetScope)) {
      return true;
    }
    return false;
  })();

  assert(isTargetAddedSector === true, 'Détection automatique du secteur ajouté sans crash même si added_sectors est undefined');

  const currentPlanForThisSector =
    companyMeta?.added_sectors_plans?.[targetScope] ||
    companyMeta?.sectors_meta?.[targetScope]?.plan_tier ||
    'entreprise';

  assert(currentPlanForThisSector === 'starter', 'Récupère le plan tier défini dans sectors_meta');
} catch (e) {
  assert(false, `Crash inattendu : ${e.message}`);
}

// -----------------------------------------------------------------------------
// CAS 3 : getSectorFeatureInfo avec filter et non-string / undefined
// -----------------------------------------------------------------------------
console.log('\n--- CAS 3 : Sécurisation du catalog de fonctionnalités et filter() ---');
try {
  const activeFeatureInfo = getSectorFeatureInfo('boutique');
  const starterFeats = Array.isArray(activeFeatureInfo?.starterFeatures) ? activeFeatureInfo.starterFeatures : [];
  const enterpriseFeats = Array.isArray(activeFeatureInfo?.enterpriseFeatures)
    ? activeFeatureInfo.enterpriseFeatures.filter((f) => typeof f === 'string' && !f.includes('Toutes les fonctionnalités'))
    : [];

  assert(starterFeats.length > 0, 'starterFeats contient les éléments attendus');
  assert(enterpriseFeats.length > 0, 'enterpriseFeats filtré sans erreur');
} catch (e) {
  assert(false, `Crash inattendu : ${e.message}`);
}

// -----------------------------------------------------------------------------
// CAS 7 : Navigation directe avec sectorSlug dans l'URL
// -----------------------------------------------------------------------------
console.log('\n--- CAS 7 : Navigation directe /app/pharmacie/abonnement ---');
try {
  const routeSectorSlug = 'pharmacie';
  const currentSectors = ['boutique', 'pharmacie'];
  const targetScope = routeSectorSlug;

  const pricing = calculateDetailedRenewalPricing({
    scope: targetScope,
    durationMonths: 1,
    allCurrentSectors: currentSectors,
    initialSectors: ['boutique'],
    sectorsState: [
      { sectorSlug: 'boutique', isInitialSector: true, planTier: 'entreprise', isGratuit: false, isPaidAndActive: true },
      { sectorSlug: 'pharmacie', isInitialSector: false, planTier: 'starter', isGratuit: false, isPaidAndActive: false },
    ],
  });

  assert(pricing.netTotalPrice === 5000, 'Calcul exact pour le secteur spécifique pharmacie en Starter (5 000 FCFA)');
  assert(pricing.sectorsCovered.includes('pharmacie'), 'Secteur concerné bien ciblé');
} catch (e) {
  assert(false, `Crash inattendu : ${e.message}`);
}

// -----------------------------------------------------------------------------
// CAS 8 & 9 : Changement de sous-logiciel et profils multiples
// -----------------------------------------------------------------------------
console.log('\n--- CAS 8 & 9 : Changement de portée ("all" -> "boutique" -> "garage") ---');
try {
  const scopes = ['all', 'boutique', 'garage'];
  const currentSectors = ['boutique', 'garage', 'restaurant', 'hotel'];
  const initialSecs = ['boutique', 'garage', 'restaurant'];

  for (const sc of scopes) {
    const res = calculateDetailedRenewalPricing({
      scope: sc,
      durationMonths: 3,
      allCurrentSectors: currentSectors,
      initialSectors: initialSecs,
    });
    assert(res.netTotalPrice > 0, `Calcul pour la portée ${sc} valide (${res.netTotalPrice} FCFA)`);
  }
} catch (e) {
  assert(false, `Crash inattendu : ${e.message}`);
}

console.log('================================================================================');
console.log(`TOTAL : ${passed} réussis, ${failed} échoués`);
console.log('================================================================================');
if (failed > 0) process.exit(1);
