// sync_and_push.cjs — Sync files to Desktop folder, then git commit + push
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC = 'C:/Users/ADMIN/.gemini/antigravity/scratch/gestio229';
const DST = 'C:/Users/ADMIN/Desktop/Nouveau dossier (4)/GESTIO 229 ERP';

const filesToSync = [
  'public/manifest.json',
  'index.html',
  'vite.config.ts',
  'src/components/common/SplashScreen.tsx',
];

console.log('=== Synchronisation des fichiers vers le dossier Desktop ===');
for (const f of filesToSync) {
  const srcPath = path.join(SRC, f);
  const dstPath = path.join(DST, f);
  if (!fs.existsSync(srcPath)) {
    console.log('  SKIP (not found): ' + f);
    continue;
  }
  const dstDir = path.dirname(dstPath);
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  console.log('  ✅ ' + f);
}

console.log('\n=== Git commit & push ===');
try {
  execSync('git add -A', { cwd: SRC, stdio: 'inherit' });
  execSync('git commit -m "fix: pwa webapk standalone launch - unified theme_color, single splash screen, STANDARD DU BENIN"', { cwd: SRC, stdio: 'inherit' });
  execSync('git push origin main', { cwd: SRC, stdio: 'inherit' });
  console.log('\n✅ Push vers origin/main réussi.');
} catch (e) {
  console.error('Git error:', e.message);
  process.exit(1);
}
