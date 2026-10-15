// scripts/generate_pwa_icons.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg512 = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient: Deep Night Blue #0a1931 -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f244a"/>
      <stop offset="50%" stop-color="#0a1931"/>
      <stop offset="100%" stop-color="#061021"/>
    </linearGradient>

    <!-- Subtle Glow for central badge -->
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.15"/>
      <stop offset="70%" stop-color="#0a1931" stop-opacity="0"/>
    </radialGradient>

    <!-- Shadow for logo badge -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>

  <!-- Solid Background to full canvas (Maskable Safe) -->
  <rect width="512" height="512" fill="url(#bgGrad)"/>
  <rect width="512" height="512" fill="url(#glow)"/>

  <!-- Subtle Dashed Orbit Circle (from original branding) -->
  <circle cx="256" cy="245" r="160" fill="none" stroke="#10b981" stroke-width="2.5" stroke-dasharray="8 8" stroke-opacity="0.25"/>

  <!-- Inner Badge Container with Shadow -->
  <g filter="url(#shadow)">
    <!-- Benin Flag Ribbon at Top of Badge -->
    <g transform="translate(146, 75)">
      <!-- Green #008751 -->
      <path d="M 0 0 L 73 0 L 73 18 L 0 18 Z" fill="#008751"/>
      <!-- Yellow #FCD116 -->
      <path d="M 73 0 L 147 0 L 147 18 L 73 18 Z" fill="#FCD116"/>
      <!-- Red #E8112D -->
      <path d="M 147 0 L 220 0 L 220 18 L 147 18 Z" fill="#E8112D"/>
    </g>

    <!-- Main Bold GESTIO Typography "G 229" -->
    <!-- G in Crisp Pure White -->
    <text x="200" y="275" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Arial Black', sans-serif" font-size="145" font-weight="900" fill="#FFFFFF" text-anchor="end" letter-spacing="-3">G</text>
    <!-- 229 in Warm Vibrant Amber/Gold #FBBF24 -->
    <text x="206" y="275" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Arial Black', sans-serif" font-size="145" font-weight="900" fill="#FBBF24" text-anchor="start" letter-spacing="-3">229</text>

    <!-- Subtitle Pill: ERP & CAISSE -->
    <g transform="translate(136, 318)">
      <rect width="240" height="42" rx="10" fill="#064e3b" fill-opacity="0.4" stroke="#10b981" stroke-width="2"/>
      <text x="120" y="27" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="800" fill="#34d399" text-anchor="middle" letter-spacing="3.5">ERP &amp; CAISSE</text>
    </g>

    <!-- Footer Label: STE GESTIO SARL (Clean, no encoding bug) -->
    <text x="256" y="415" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#94a3b8" text-anchor="middle" letter-spacing="3">STE GESTIO SARL</text>
    <text x="256" y="440" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="2">RÉPUBLIQUE DU BÉNIN</text>
  </g>
</svg>
`;

async function generate() {
  console.log('--- GÉNÉRATION DES ICÔNES PWA GESTIO 229 (#0a1931) ---');
  
  const publicDir = path.resolve(__dirname, '../public');
  const iconsDir = path.resolve(publicDir, 'icons');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

  const svgBuffer = Buffer.from(svg512);

  // 1. /public/icon-512.png (Root, W3C standard & User requested)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(publicDir, 'icon-512.png'));
  console.log('✅ Créé: public/icon-512.png');

  // 2. /public/icon-192.png (Root, W3C standard & User requested)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve(publicDir, 'icon-192.png'));
  console.log('✅ Créé: public/icon-192.png');

  // 3. /public/icons/icon-512.png & maskable
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(iconsDir, 'icon-512.png'));
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(iconsDir, 'icon-maskable-512.png'));
  console.log('✅ Mis à jour: public/icons/icon-512.png & icon-maskable-512.png');

  // 4. /public/icons/icon-192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve(iconsDir, 'icon-192.png'));
  console.log('✅ Mis à jour: public/icons/icon-192.png');

  // 5. Apple Touch Icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve(iconsDir, 'apple-touch-icon.png'));
  console.log('✅ Mis à jour: public/icons/apple-touch-icon.png');

  // 6. Favicon (96x96)
  await sharp(svgBuffer)
    .resize(96, 96)
    .png()
    .toFile(path.resolve(iconsDir, 'favicon.png'));
  console.log('✅ Mis à jour: public/icons/favicon.png');

  console.log('\nToutes les icônes PWA ont été générées avec succès !');
}

generate().catch(err => {
  console.error('Erreur génération icônes:', err);
  process.exit(1);
});
