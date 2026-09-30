// =============================================================================
// GESTIO 229 ERP — Test de validation PWA & Bouton « Installer l'application »
// =============================================================================

import fs from 'fs';
import path from 'path';

function runPwaValidation() {
  console.log('=============================================================================');
  console.log('GESTIO 229 — TEST DE CONFORMITÉ PWA & BOUTON D\'INSTALLATION');
  console.log('=============================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  // 1. Vérification du manifest.json
  console.log('▶ 1. Validation du Web App Manifest (public/manifest.json)...');
  const manifestPath = path.resolve('public/manifest.json');
  assert(fs.existsSync(manifestPath), 'Le fichier public/manifest.json existe');

  if (fs.existsSync(manifestPath)) {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(content.name && content.name.includes('GESTIO 229'), 'Manifest possède un "name" valide');
    assert(content.short_name === 'GESTIO 229', 'Manifest possède un "short_name" = "GESTIO 229"');
    assert(content.start_url === '/', 'Manifest possède un "start_url" = "/"');
    assert(content.display === 'standalone', 'Manifest possède "display" = "standalone"');
    assert(Array.isArray(content.icons) && content.icons.length >= 3, 'Manifest contient au moins 3 icônes');
    
    const has192 = content.icons.some(i => i.sizes === '192x192');
    const has512 = content.icons.some(i => i.sizes === '512x512');
    const hasMaskable = content.icons.some(i => i.purpose === 'maskable');
    assert(has192, 'Manifest contient une icône 192x192');
    assert(has512, 'Manifest contient une icône 512x512');
    assert(hasMaskable, 'Manifest contient une icône maskable');
  }

  // 2. Vérification du Service Worker (public/sw.js)
  console.log('\n▶ 2. Validation du Service Worker (public/sw.js)...');
  const swPath = path.resolve('public/sw.js');
  assert(fs.existsSync(swPath), 'Le fichier public/sw.js existe');

  if (fs.existsSync(swPath)) {
    const swContent = fs.readFileSync(swPath, 'utf8');
    assert(swContent.includes('addEventListener(\'install\''), 'Le Service Worker gère l\'événement "install"');
    assert(swContent.includes('addEventListener(\'activate\''), 'Le Service Worker gère l\'événement "activate"');
    assert(swContent.includes('addEventListener(\'fetch\''), 'Le Service Worker gère l\'événement "fetch"');
    assert(swContent.includes('supabase.co'), 'Le Service Worker contourne le cache pour les API Supabase');
  }

  // 3. Vérification des icônes réelles (public/icons)
  console.log('\n▶ 3. Validation des fichiers d\'icônes physiques (public/icons)...');
  const requiredIcons = [
    'favicon.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png'
  ];

  requiredIcons.forEach(iconName => {
    const iconPath = path.resolve('public/icons', iconName);
    const exists = fs.existsSync(iconPath);
    const size = exists ? fs.statSync(iconPath).size : 0;
    assert(exists && size > 1000, `Icône ${iconName} présente et valide (${size} octets)`);
  });

  // 4. Vérification de index.html
  console.log('\n▶ 4. Validation des balises et scripts PWA dans index.html...');
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert(indexHtml.includes('<link rel="manifest" href="/manifest.json" />'), 'index.html lie le manifest.json');
  assert(indexHtml.includes('apple-touch-icon'), 'index.html définit apple-touch-icon');
  assert(indexHtml.includes('beforeinstallprompt'), 'index.html écoute avant hydratation React beforeinstallprompt');
  assert(indexHtml.includes('appinstalled'), 'index.html écoute l\'événement appinstalled');

  // 5. Vérification du composant LoginPage.tsx
  console.log('\n▶ 5. Validation de l\'intégration React dans LoginPage.tsx...');
  const loginPage = fs.readFileSync(path.resolve('src/pages/auth/LoginPage.tsx'), 'utf8');
  assert(loginPage.includes('handleInstallClick'), 'LoginPage contient la fonction handleInstallClick');
  assert(loginPage.includes('beforeinstallprompt'), 'LoginPage écoute beforeinstallprompt');
  assert(loginPage.includes('appinstalled'), 'LoginPage gère la détection post-installation appinstalled');
  assert(loginPage.includes('!isAppInstalled'), 'LoginPage masque le bouton si l\'application est déjà installée');
  assert(loginPage.includes('userPlatform'), 'LoginPage adapte les instructions selon l\'appareil (Android/iOS/PC)');

  console.log('\n=============================================================================');
  console.log(`RÉSULTAT : ${passed} / ${total} tests réussis (${Math.round((passed / total) * 100)}%)`);
  if (passed === total) {
    console.log('🎉 TOUS LES CRITÈRES PWA & INSTALLATION SONT 100% CONFORMES !');
  } else {
    console.error('Certains critères nécessitent une révision.');
    process.exit(1);
  }
  console.log('=============================================================================\n');
}

runPwaValidation();
