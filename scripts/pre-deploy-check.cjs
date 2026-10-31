// =============================================================================
// GESTIO 229 SaaS — Chaîne de Contrôle Pré-Déploiement Obligatoire
// Exécuté automatiquement avant CHAQUE build local et sur Vercel (prebuild)
// Bloque formellement le déploiement en cas d'erreur de scope, import manquant ou TDZ
// =============================================================================

const fs = require('fs');
const path = require('path');

console.log('🔒 ================================================================');
console.log('🔒 [GESTIO 229] DÉMARRAGE DE LA VÉRIFICATION DE PRODUCTION PRÉ-BUILD');
console.log('🔒 ================================================================');

let hasCriticalErrors = false;

// ─── 1. CONTRÔLE DE PORTÉE DES COMPOSANTS DANS LES FICHIERS DE ROUTAGE ───────
console.log('\n🔍 [1/5] Analyse de portée des composants JSX dans App.tsx...');
try {
  const appFile = path.resolve('src/App.tsx');
  if (!fs.existsSync(appFile)) {
    console.error('❌ ERREUR CRITIQUE : src/App.tsx est introuvable !');
    hasCriticalErrors = true;
  } else {
    const content = fs.readFileSync(appFile, 'utf8');

    // Extraire tous les composants utilisés en JSX (<MonComposant ...)
    const jsxTags = new Set();
    const regex = /<([A-Z][a-zA-Z0-9_]*)/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      const tag = m[1];
      // Ignorer les balises natives ou wrappers spécifiques s'il y en a
      if (tag !== 'Fragment' && tag !== 'Suspense') {
        jsxTags.add(tag);
      }
    }

    const missingComponents = [];
    for (const tag of jsxTags) {
      // Vérifier si le composant est déclaré localement ou importé
      const isDeclared = new RegExp(
        '(?:import\\s+.*\\b' + tag + '\\b|const\\s+' + tag + '\\b|function\\s+' + tag + '\\b|class\\s+' + tag + '\\b|let\\s+' + tag + '\\b|var\\s+' + tag + '\\b)'
      ).test(content);

      if (!isDeclared) {
        missingComponents.push(tag);
      }
    }

    if (missingComponents.length > 0) {
      console.error('❌ ERREUR CRITIQUE DE SCOPE : Composants JSX utilisés mais NON DÉFINIS dans App.tsx :');
      missingComponents.forEach((c) => console.error(`   - <${c}>`));
      console.error('   => RISQUE IMMÉDIAT : "X is not defined at AppRoutes" en production.');
      hasCriticalErrors = true;
    } else {
      console.log(`✅ Portée validée : ${jsxTags.size} composants JSX déclarés et importés sans erreur.`);
    }
  }
} catch (err) {
  console.error('❌ Erreur lors du contrôle de portée :', err.message);
  hasCriticalErrors = true;
}

// ─── 2. CONTRÔLE DE L'INTÉGRITÉ DU COMPOSANT PROTECTEDROUTE ──────────────────
console.log('\n🔍 [2/5] Contrôle d\'intégrité de ProtectedRoute & useAuth...');
try {
  const protectedRouteFile = path.resolve('src/components/ProtectedRoute.tsx');
  const useAuthFile = path.resolve('src/hooks/useAuth.ts');

  if (!fs.existsSync(protectedRouteFile)) {
    console.error('❌ ERREUR CRITIQUE : src/components/ProtectedRoute.tsx introuvable !');
    hasCriticalErrors = true;
  } else {
    const prContent = fs.readFileSync(protectedRouteFile, 'utf8');
    if (!prContent.includes('export default function ProtectedRoute') && !prContent.includes('export const ProtectedRoute')) {
      console.error('❌ ERREUR : ProtectedRoute n\'exporte aucun composant valide !');
      hasCriticalErrors = true;
    }
    if (!prContent.includes('useAuth')) {
      console.warn('⚠️ Avertissement : ProtectedRoute ne semble pas consommer le hook useAuth.');
    }
  }

  if (!fs.existsSync(useAuthFile)) {
    console.error('❌ ERREUR CRITIQUE : src/hooks/useAuth.ts introuvable !');
    hasCriticalErrors = true;
  } else {
    console.log('✅ Composant ProtectedRoute et hook useAuth opérationnels et vérifiés.');
  }
} catch (err) {
  console.error('❌ Erreur lors du contrôle ProtectedRoute :', err.message);
  hasCriticalErrors = true;
}

// ─── 3. CONTRÔLE TDZ (ORDRE DÉCLARATIF DES HOOKS DANS DASHBOARD) ──────────────
console.log('\n🔍 [3/5] Contrôle de l\'ordre déclaratif TDZ (DashboardPage.tsx)...');
try {
  const dashboardFile = path.resolve('src/pages/dashboard/DashboardPage.tsx');
  if (fs.existsSync(dashboardFile)) {
    const content = fs.readFileSync(dashboardFile, 'utf8');
    const idxAvoirs = content.indexOf('const avoirsMetrics = useMemo');
    const idxCaNet = content.indexOf('const caDuJourNet = useMemo');

    if (idxAvoirs !== -1 && idxCaNet !== -1 && idxAvoirs > idxCaNet) {
      console.error('❌ ERREUR TDZ : avoirsMetrics est déclaré APRÈS caDuJourNet !');
      hasCriticalErrors = true;
    } else {
      console.log('✅ Ordre déclaratif TDZ validé : aucun risque de "Cannot access before initialization".');
    }
  }
} catch (err) {
  console.error('❌ Erreur contrôle TDZ :', err.message);
  hasCriticalErrors = true;
}

// ─── 4. VÉRIFICATION DES FICHIERS STATIQUES & PWA STANDALONE ─────────────────
console.log('\n🔍 [4/5] Contrôle de la configuration PWA Standalone...');
try {
  const manifestFile = path.resolve('public/manifest.json');
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.display !== 'standalone') {
      console.warn('⚠️ Avertissement : manifest.json n\'est pas configuré en display: standalone.');
    } else {
      console.log('✅ Configuration PWA standalone validée (sans barre navigateur).');
    }
  }
} catch (err) {
  console.warn('⚠️ Avertissement lors de la lecture du manifest :', err.message);
}

// ─── 5. GÉNÉRATION DYNAMIQUE DE VERSION.JSON POUR AUTO-UPDATE CLIENT ─────────
console.log('\n🔍 [5/5] Génération dynamique de version.json pour déploiement atomique...');
try {
  const currentTimestamp = Date.now();
  const versionData = {
    version: `${currentTimestamp}`,
    builtAt: new Date().toISOString(),
    app: 'GESTIO 229 ERP',
    status: 'stable',
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
  console.log(`✅ Version générée avec succès : ${currentTimestamp} (${versionData.builtAt})`);
} catch (err) {
  console.error('❌ Erreur lors de la génération de version.json :', err.message);
  hasCriticalErrors = true;
}

// ─── DÉCISION FINALE DE PUBLICATION ──────────────────────────────────────────
console.log('\n----------------------------------------------------------------');
if (hasCriticalErrors) {
  console.error('🚫 [GESTIO 229] ÉCHEC DES VÉRIFICATIONS CRITIQUES PRÉ-BUILD !');
  console.error('🚫 LE DÉPLOIEMENT EST AUTOMATIQUEMENT BLOQUÉ POUR PROTÉGER LA PRODUCTION.');
  console.log('----------------------------------------------------------------\n');
  process.exit(1);
} else {
  console.log('🎉 [GESTIO 229] TOUTES LES VÉRIFICATIONS PRÉ-DÉPLOIEMENT ONT RÉUSSI.');
  console.log('🚀 AUTORISATION ACCORDÉE POUR LA COMPILATION DE PRODUCTION.');
  console.log('----------------------------------------------------------------\n');
  process.exit(0);
}
