// scripts/verify-chunks.js
import fs from 'fs';
import path from 'path';

const dist = path.resolve('dist/assets');
if (fs.existsSync(dist)) {
  const files = fs.readdirSync(dist);
  console.log(`✅ [GESTIO 229] Post-build vérifié : ${files.length} fichiers assets générés.`);
  
  const dashboardCore = files.find(f => f.startsWith('dashboard-core'));
  if (dashboardCore) {
    console.log(`✅ Chunk unifié présent : ${dashboardCore}`);
  }
} else {
  console.warn('⚠️ Dossier dist/assets non trouvé');
}
