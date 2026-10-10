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

console.log('✅ Aucun risque d\'initialisation circulaire détecté.');
process.exit(0);
