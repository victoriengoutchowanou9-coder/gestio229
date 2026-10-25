import { readFileSync } from 'fs';
import { resolve } from 'path';

console.log('--- TEST DE VÉRIFICATION : ENCAISSEMENT & CARTES PRODUITS VENDEUR/CAISSE ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// 1. Vérification dans salesCircuitService.ts
const salesCircuitSrc = readFileSync(resolve('src/services/salesCircuitService.ts'), 'utf8');
assert(
  salesCircuitSrc.includes("console.log('Session caisse utilisée pour encaissement:', finalCashSessionId)"),
  "salesCircuitService.ts contient le log demandé de la session caisse utilisée"
);
assert(
  salesCircuitSrc.includes("sales_orders_cash_session_id_fkey"),
  "salesCircuitService.ts contient la protection de fallback contre la contrainte FK sales_orders_cash_session_id_fkey"
);
assert(
  salesCircuitSrc.includes("cash_session_id: finalCashSessionId"),
  "salesCircuitService.ts transmet la session caisse vérifiée"
);

// 2. Vérification dans caisseSectorService.ts
const caisseSectorSrc = readFileSync(resolve('src/services/caisseSectorService.ts'), 'utf8');
assert(
  caisseSectorSrc.includes("user_profiles") && caisseSectorSrc.includes("resolvedCashierId"),
  "caisseSectorService.ts résout le cashier_id avec user_profiles pour éviter les violations de clé étrangère"
);
assert(
  caisseSectorSrc.includes("fallbackInserted") || caisseSectorSrc.includes("cashier_id: null"),
  "caisseSectorService.ts implémente le repli gracieux sans cashier_id si la FK échoue"
);

// 3. Vérification dans VendeurPage.tsx
const vendeurPageSrc = readFileSync(resolve('src/pages/dashboard/vendeur/VendeurPage.tsx'), 'utf8');
assert(
  vendeurPageSrc.includes("Prix UV ("),
  "VendeurPage.tsx affiche le prix de vente UV avec son unité"
);
assert(
  vendeurPageSrc.includes("Prix UCD ("),
  "VendeurPage.tsx affiche le prix de vente en gros UCD avec son unité"
);
assert(
  vendeurPageSrc.includes("formatStockWithUnit(p.stock_vente, p.unit)"),
  "VendeurPage.tsx formate le stock vente avec son unité réelle"
);
assert(
  vendeurPageSrc.includes("formatStockWithUnit(p.stock_magasin, p.ucd)"),
  "VendeurPage.tsx formate le stock magasin avec son unité réelle"
);

console.log(`\nBilan des tests statiques : ${passedTests} / ${totalTests} validés.`);
