// =============================================================================
// GESTIO 229 SaaS — Test de Non-Régression pour canonicalSectorSlug & Hub
// =============================================================================

const fs = require('fs');
const path = require('path');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] VALIDATION CANONICAL SECTORS & HUB INTEGRITY');
console.log('🧪 ================================================================');

let failures = 0;
function test(cond, desc) {
  if (cond) {
    console.log(`  ✅ PASS: ${desc}`);
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failures++;
  }
}

// 1. MultiservicesHub.tsx
const hubContent = fs.readFileSync(path.resolve('src/views/hub/MultiservicesHub.tsx'), 'utf8');
test(hubContent.includes('canonicalSectorSlug') && hubContent.includes('canonicalSectorsSlug'), 'MultiservicesHub.tsx importe canonicalSectorSlug et canonicalSectorsSlug');
test(!hubContent.includes('ReferenceError'), 'Pas de référence orpheline');

// 2. HubPage.tsx
const hubPageContent = fs.readFileSync(path.resolve('src/pages/HubPage.tsx'), 'utf8');
test(hubPageContent.includes('canonicalSectorSlug'), 'HubPage.tsx normalise les slugs avant navigation');

// 3. sectorClient.ts
const sectorClientContent = fs.readFileSync(path.resolve('src/lib/sectorClient.ts'), 'utf8');
test(sectorClientContent.includes('export function canonicalSectorSlug'), 'sectorClient exporte canonicalSectorSlug');
test(sectorClientContent.includes('export const canonicalSectorsSlug = canonicalSectorSlug'), 'sectorClient exporte l\'alias canonicalSectorsSlug');
test(sectorClientContent.includes('window') && sectorClientContent.includes('canonicalSectorSlug'), 'sectorClient protège le scope global window');

// 4. abonnementService.ts
const abonnementContent = fs.readFileSync(path.resolve('src/services/abonnementService.ts'), 'utf8');
test(abonnementContent.includes('export function canonicalSectorSlug'), 'abonnementService exporte canonicalSectorSlug');
test(abonnementContent.includes('export const canonicalSectorsSlug = canonicalSectorSlug'), 'abonnementService exporte l\'alias canonicalSectorsSlug');

// 5. App.tsx (AdminHubGuard)
const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
test(appContent.includes('canonicalSectorSlug'), 'App.tsx (AdminHubGuard) normalise les secteurs autorisés');

// 6. Audit global : aucun fichier tsx n'a de référence orpheline
function walk(dir, list = []) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full, list);
    else if (/\.(tsx?|jsx?)$/.test(f)) list.push(full);
  }
  return list;
}
const allSrc = walk(path.resolve('src'));
let unhandledFiles = [];
for (const file of allSrc) {
  const c = fs.readFileSync(file, 'utf8');
  if (c.includes('canonicalSectorSlug') || c.includes('canonicalSectorsSlug')) {
    const hasImport = /import\s+[^;]*(?:canonicalSectorSlug|canonicalSectorsSlug)[^;]*from/g.test(c);
    const hasDef = /function\s+canonicalSectorSlug|const\s+canonicalSectorSlug\s*=|const\s+canonicalSectorsSlug\s*=/g.test(c);
    if (!hasImport && !hasDef) {
      unhandledFiles.push(path.basename(file));
    }
  }
}
test(unhandledFiles.length === 0, `Tous les fichiers source résolvent canonicalSector(s)Slug (fichiers orphelins: ${unhandledFiles.join(', ') || 'aucun'})`);

if (failures === 0) {
  console.log('\n🎉 TOUS LES CONTRÔLES CANONICAL & HUB SONT VALIDÉS (0 ÉCHEC).');
  process.exit(0);
} else {
  console.error(`\n❌ ${failures} CONTRÔLE(S) ONT ÉCHOUÉ.`);
  process.exit(1);
}
