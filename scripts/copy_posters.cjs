const fs = require('fs');
const path = require('path');

const src1 = 'C:/Users/ADMIN/.gemini/antigravity/brain/7fa1bb61-58e2-48af-bc31-8078aed9981f/gestio229_affiche_publicitaire_v2_1792362399271.jpg';
const src2 = 'C:/Users/ADMIN/.gemini/antigravity/brain/7fa1bb61-58e2-48af-bc31-8078aed9981f/gestio229_affiche_publicitaire_1792362375167.jpg';

const destDir = path.resolve(__dirname, '..', 'public');
const dest1 = path.join(destDir, 'gestio229_affiche_officielle.jpg');
const dest2 = path.join(destDir, 'gestio229_affiche_v1.jpg');

if (fs.existsSync(src1)) {
  fs.copyFileSync(src1, dest1);
  console.log('✅ Copié gestio229_affiche_officielle.jpg vers public/');
}

if (fs.existsSync(src2)) {
  fs.copyFileSync(src2, dest2);
  console.log('✅ Copié gestio229_affiche_v1.jpg vers public/');
}
