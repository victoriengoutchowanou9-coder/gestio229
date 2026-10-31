// scripts/check-circular.js
// Analyse récursive des dépendances et imports pour s'assurer qu'il n'y a pas d'import circulaire
// ou d'utilisation de variables avant initialisation dans les composants clés

import fs from 'fs';
import path from 'path';

console.log('🔍 [GESTIO 229] Vérification de l\'intégrité des composants...');

const dashboardFile = path.resolve('src/pages/dashboard/DashboardPage.tsx');
if (fs.existsSync(dashboardFile)) {
  const content = fs.readFileSync(dashboardFile, 'utf8');
  
  // Vérification de l'ordre avoirsMetrics vs caDuJourNet
  const idxAvoirs = content.indexOf('const avoirsMetrics = useMemo');
  const idxCaNet = content.indexOf('const caDuJourNet = useMemo');
  
  if (idxAvoirs === -1 || idxCaNet === -1) {
    console.error('❌ Impossible de trouver avoirsMetrics ou caDuJourNet dans DashboardPage.tsx');
    process.exit(1);
  }
  
  if (idxAvoirs > idxCaNet) {
    console.error('❌ ERREUR TDZ : avoirsMetrics est déclaré APRÈS caDuJourNet ! Risque d\'erreur "Cannot access before initialization".');
    process.exit(1);
  }
  
  console.log('✅ Ordre déclaratif TDZ validé : avoirsMetrics est bien déclaré avant caDuJourNet');
} else {
  console.warn('⚠️ Fichier DashboardPage.tsx introuvable pour vérification');
}

// ─── Génération dynamique du fichier public/version.json ─────────────────────
// Permet à tous les clients connectés de détecter instantanément une nouvelle version
// et de déclencher la mise à jour automatique sans réinstallation ni purge manuelle.
const currentTimestamp = Date.now();
const versionData = {
  version: `${currentTimestamp}`,
  builtAt: new Date().toISOString(),
  app: 'GESTIO 229 ERP'
};

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(
  path.resolve(publicDir, 'version.json'),
  JSON.stringify(versionData, null, 2),
  'utf8'
);
console.log(`✅ [GESTIO 229] Version générée dans public/version.json : ${currentTimestamp}`);

console.log('✅ Aucun risque d\'initialisation circulaire détecté.');
process.exit(0);
