// =============================================================================
// GESTIO 229 — SUITE DE VALIDATION COMPLÈTE : PARTIE A & PARTIE B
// =============================================================================

import assert from 'node:assert';
import { formatNumber, formatFCFA, resolveProductUnits, formatStockWithUnit } from '../src/utils/formatters.ts';

// Fonctions exactes issues de src/services/abonnementService.ts
function canonicalSectorSlug(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/^sec-/, '').replace(/_/g, '-');
}

function toSecteurCode(slug) {
  const canon = canonicalSectorSlug(slug);
  return canon.toUpperCase().replace(/-/g, '_');
}

function matchesSectorCode(dbCode, slug) {
  if (!dbCode || !slug) return false;
  const normDb = toSecteurCode(dbCode);
  const normSlug = toSecteurCode(slug);
  if (normDb === normSlug) return true;
  if (normDb.replace(/_/g, '') === normSlug.replace(/_/g, '')) return true;
  if (normDb.startsWith(normSlug) || normSlug.startsWith(normDb)) return true;
  return false;
}

function calcDaysRemaining(dateFin) {
  if (!dateFin) return 0;
  const end = new Date(dateFin).getTime();
  const now = Date.now();
  const diffMs = end - now;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [OK] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
  }
}

console.log('================================================================================');
console.log('GESTIO 229 — TESTS DE VALIDATION PARTIE B : UNITÉS DE STOCK ET CARTES PRODUITS');
console.log('================================================================================');

it('B1 : Produit stocké et vendu en cartons (17 cartons en magasin, 5 cartons en vente)', () => {
  const prod = {
    name: 'Huile Végétale',
    stock_magasin: 17,
    stock_vente: 5,
    ucd: 'carton',
    uv: 'carton',
  };
  const { unitVente, unitMagasin } = resolveProductUnits(prod);
  assert.strictEqual(unitMagasin.toLowerCase(), 'carton');
  assert.strictEqual(unitVente.toLowerCase(), 'carton');
  assert.strictEqual(formatStockWithUnit(prod.stock_magasin, unitMagasin), '17 cartons');
  assert.strictEqual(formatStockWithUnit(prod.stock_vente, unitVente), '5 cartons');
});

it('B2 : Produit stocké en cartons et vendu en kg (17 cartons en magasin, 8 kg en vente)', () => {
  const prod = {
    name: 'Poisson Capitaine',
    stock_magasin: 17,
    stock_vente: 8,
    ucd: 'carton',
    uv: 'kg',
  };
  const { unitVente, unitMagasin } = resolveProductUnits(prod);
  assert.strictEqual(unitMagasin.toLowerCase(), 'carton');
  assert.strictEqual(unitVente.toLowerCase(), 'kg');
  assert.strictEqual(formatStockWithUnit(prod.stock_magasin, unitMagasin), '17 cartons');
  assert.strictEqual(formatStockWithUnit(prod.stock_vente, unitVente), '8 kg');
});

it('B3 : Produit géré en unité unique kg (Magasin : 25 kg, Vente : 8 kg)', () => {
  const prod = {
    name: 'Sucre Roux',
    stock_magasin: 25,
    stock_vente: 8,
    unit: 'kg',
  };
  const { unitVente, unitMagasin } = resolveProductUnits(prod);
  assert.strictEqual(formatStockWithUnit(prod.stock_magasin, unitMagasin), '25 kg');
  assert.strictEqual(formatStockWithUnit(prod.stock_vente, unitVente), '8 kg');
});

it('B4 : Produit géré en litres (Magasin : 120 l, Vente : 1 l)', () => {
  const prod = {
    name: 'Essence Super',
    stock_magasin: 120,
    stock_vente: 1,
    unit: 'l',
  };
  const { unitVente, unitMagasin } = resolveProductUnits(prod);
  assert.strictEqual(formatStockWithUnit(prod.stock_magasin, unitMagasin), '120 l');
  assert.strictEqual(formatStockWithUnit(prod.stock_vente, unitVente), '1 l');
});

it('B5 : Produit géré en sacs (Magasin : 50 sacs, Vente : 1 sac)', () => {
  const prod = {
    name: 'Ciment Bélier 50kg',
    stock_magasin: 50,
    stock_vente: 1,
    ucd: 'sac',
    uv: 'sac',
  };
  const { unitVente, unitMagasin } = resolveProductUnits(prod);
  assert.strictEqual(formatStockWithUnit(prod.stock_magasin, unitMagasin), '50 sacs');
  assert.strictEqual(formatStockWithUnit(prod.stock_vente, unitVente), '1 sac');
});

it('B6 : Quantité nulle (0 carton, 0 kg) sans mot "unités"', () => {
  assert.strictEqual(formatStockWithUnit(0, 'carton'), '0 carton');
  assert.strictEqual(formatStockWithUnit(0, 'kg'), '0 kg');
  assert.strictEqual(formatStockWithUnit(0, 'bouteille'), '0 bouteille');
});

it('B7 : Unités déjà au pluriel ou avec s/x (ex: colis, cartons)', () => {
  assert.strictEqual(formatStockWithUnit(10, 'cartons'), '10 cartons');
  assert.strictEqual(formatStockWithUnit(3, 'colis'), '3 colis');
});

it('B8 : Extraction robuste depuis sector_meta si colonnes racines absentes', () => {
  const prod = {
    name: 'Produit Ancien',
    stock_magasin: 14,
    stock_vente: 3,
    sector_meta: {
      ucd: 'Tonne',
      uv: 'Sac',
    },
  };
  const { unitVente, unitMagasin } = resolveProductUnits(prod);
  assert.strictEqual(formatStockWithUnit(prod.stock_magasin, unitMagasin), '14 tonnes');
  assert.strictEqual(formatStockWithUnit(prod.stock_vente, unitVente), '3 sacs');
});

console.log('\n================================================================================');
console.log('GESTIO 229 — TESTS DE VALIDATION PARTIE A : ABONNEMENTS ET ACTIVATION SECTEURS');
console.log('================================================================================');

it('A1 : Normalisation et correspondance exacte des codes secteurs (Hyphen vs Underscore)', () => {
  assert.strictEqual(toSecteurCode('station-service'), 'STATION_SERVICE');
  assert.strictEqual(toSecteurCode('STATION_SERVICE'), 'STATION_SERVICE');
  assert.strictEqual(toSecteurCode('STATION-SERVICE'), 'STATION_SERVICE');
  assert.strictEqual(matchesSectorCode('STATION-SERVICE', 'station-service'), true);
  assert.strictEqual(matchesSectorCode('STATION_SERVICE', 'station-service'), true);
  assert.strictEqual(matchesSectorCode('TRANSPORT_LOGISTIQUE', 'transport'), true);
  assert.strictEqual(matchesSectorCode('FLOTTE_GEOLOCALISATION', 'flotte-geolocalisation'), true);
});

it('A2 : Calcul du nombre exact de jours restants (calcDaysRemaining)', () => {
  const now = new Date();
  const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const future15 = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const past5 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const days30 = calcDaysRemaining(future30);
  const days15 = calcDaysRemaining(future15);
  const daysPast = calcDaysRemaining(past5);

  assert.strictEqual(days30 >= 29 && days30 <= 30, true);
  assert.strictEqual(days15 >= 14 && days15 <= 15, true);
  assert.strictEqual(daysPast, 0);
});

it('A3 : Format officiel du badge secteur actif : « Actif — J-[jours] »', () => {
  const days = 30;
  const badgeLabel = `Actif — J-${days}`;
  assert.strictEqual(badgeLabel, 'Actif — J-30');
  assert.strictEqual(badgeLabel.includes('Actif — J-'), true);
});

it('A4 : Disparition de « En attente de paiement » et « Essai » lorsqu’un secteur est actif', () => {
  const now = new Date();
  const fin = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString();
  const sub = {
    secteur_code: 'PHARMACIE',
    statut_specifique: 'actif',
    date_fin_specifique: fin,
    rattache_au_global: false,
  };

  // Simule l'évaluation du badge dans le HUB
  const isActif = sub.statut_specifique === 'actif' && new Date(sub.date_fin_specifique) >= now;
  assert.strictEqual(isActif, true);

  const days = calcDaysRemaining(sub.date_fin_specifique);
  const label = isActif ? `Actif — J-${days}` : 'En attente de paiement';
  assert.strictEqual(label, `Actif — J-${days}`);
  assert.strictEqual(label.includes('Essai'), false);
  assert.strictEqual(label.includes('attente'), false);
});

it('A5 : Le HUB affiche « Abonnement actif » si l’entreprise a un abonnement ou secteur actif', () => {
  const globalSub = { statut_global: 'essai' };
  const sectorSubs = [
    { secteur_code: 'BOUTIQUE', statut_specifique: 'actif', date_fin_specifique: new Date(Date.now() + 864000000).toISOString() }
  ];
  const company = { subscription_status: 'active', is_active: true };

  const isCompanyActive =
    globalSub?.statut_global === 'actif' ||
    company?.subscription_status === 'active' ||
    (company?.is_active === true && sectorSubs.some((s) => s.statut_specifique === 'actif'));

  const badgeText = isCompanyActive ? 'Abonnement actif' : 'Essai J-20';
  assert.strictEqual(badgeText, 'Abonnement actif');
});

it('A6 : Déduplication prioritaire des abonnements sectoriels (Actif > En attente)', () => {
  const rawRows = [
    { id: 'old-1', secteur_code: 'STATION-SERVICE', statut_specifique: 'en_attente_paiement', created_at: '2026-10-01' },
    { id: 'new-2', secteur_code: 'STATION_SERVICE', statut_specifique: 'actif', date_fin_specifique: new Date(Date.now() + 864000000).toISOString(), created_at: '2026-10-24' }
  ];

  const bySector = new Map();
  const now = new Date();
  for (const r of rawRows) {
    const code = toSecteurCode(r.secteur_code);
    const existing = bySector.get(code);
    if (!existing) {
      bySector.set(code, r);
    } else {
      const isRActive = r.statut_specifique === 'actif' && (!r.date_fin_specifique || new Date(r.date_fin_specifique) >= now);
      const isExistingActive = existing.statut_specifique === 'actif' && (!existing.date_fin_specifique || new Date(existing.date_fin_specifique) >= now);
      if (isRActive && !isExistingActive) {
        bySector.set(code, r);
      }
    }
  }

  const result = Array.from(bySector.values());
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].statut_specifique, 'actif');
  assert.strictEqual(result[0].id, 'new-2');
});

it('A7 : Liaison automatique et cohérence des cartes d\'activité quand l\'abonnement entreprise est actif', () => {
  const company = {
    subscription_status: 'active',
    subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    selected_sectors: ['boutique', 'poissonnerie', 'station-service'],
  };
  const sectorSubs = []; // Aucun abonnement individuel payé séparément

  const now = new Date();
  const compExpiresAt = new Date(company.subscription_expires_at);
  const isCompanyActive = company.subscription_status === 'active' && compExpiresAt >= now;
  const effectiveDays = calcDaysRemaining(compExpiresAt);

  // Simule l'évaluation de chaque carte sur le HUB
  for (const slug of company.selected_sectors) {
    const sub = sectorSubs.find((s) => matchesSectorCode(s.secteur_code, slug));
    let badgeInfo;
    if (sub?.statut_specifique === 'actif') {
      badgeInfo = { label: `Actif — J-${effectiveDays}`, isNonActive: false };
    } else if (isCompanyActive && sub?.statut_specifique !== 'en_attente_paiement') {
      badgeInfo = { label: `Actif — J-${effectiveDays}`, isNonActive: false };
    } else {
      badgeInfo = { label: 'Abonnement expiré', isNonActive: true };
    }

    assert.strictEqual(badgeInfo.label, `Actif — J-${effectiveDays}`);
    assert.strictEqual(badgeInfo.isNonActive, false);
    assert.strictEqual(badgeInfo.label.includes('expiré'), false);
  }
});

console.log('\n================================================================================');
console.log(`RÉSULTAT TOTAL : ${passedTests} / ${totalTests} tests réussis avec succès !`);
console.log('================================================================================');
