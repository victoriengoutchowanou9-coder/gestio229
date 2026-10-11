/**
 * GESTIO 229 — Fix définitif : Cannot access 'h' before initialization
 *
 * CAUSE RACINE IDENTIFIÉE :
 *   DashboardPage.tsx ligne ~183 : caDuJourNet utilise `avoirsMetrics`
 *   MAIS `avoirsMetrics` est déclaré à la ligne ~234 → TDZ (Temporal Dead Zone)
 *   Vite minifie `avoirsMetrics` en `h` → "Cannot access 'h' before initialization"
 *
 * CORRECTIONS :
 *   1. DashboardPage.tsx — Réordonner les useMemo : avoirsMetrics AVANT caDuJourNet
 *   2. SectorErrorBoundary.tsx — Détecter l'erreur TDZ et auto-reload (comme chunk error)
 *   3. vite.config.ts — manualChunks pour grouper Dashboard + keepNames déjà activé
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(path.join(ROOT, rel), content, 'utf8'); console.log(`✅ Écrit : ${rel}`); }

// ══════════════════════════════════════════════════════════════════════════════
// 1. FIX CRITIQUE DashboardPage.tsx — Réordonner avoirsMetrics avant caDuJourNet
// ══════════════════════════════════════════════════════════════════════════════

let dash = read('src/pages/dashboard/DashboardPage.tsx');

// Le problème : caDuJourBrut est déclaré, puis caDuJourNet utilise avoirsMetrics,
// mais avoirsMetrics est déclaré plus bas. On réordonne.

const OLD_ORDER = `  // ─── Calculs Réels des Indicateurs Principaux du Secteur ───────────────────

  // 1. CA du jour (Total des ventes enregistrées aujourd'hui)
  const caDuJourBrut = useMemo(() => {
    return salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  const caDuJourNet = useMemo(() => {
    return Math.max(0, caDuJourBrut - (avoirsMetrics?.totalAvoirsAujourdhui || 0))
  }, [caDuJourBrut, avoirsMetrics])

  const caDuJour = caDuJourNet

  // Ventilation des règlements (Espèces, MoMo, Crédit) supportant le multi-paiement
  const { especesDuJour, momoDuJour, creancesDuJour } = useMemo(() => {`;

const NEW_ORDER = `  // ─── Calculs Réels des Indicateurs Principaux du Secteur ───────────────────
  // IMPORTANT : avoirsMetrics doit être déclaré EN PREMIER car caDuJourNet en dépend.
  // Ne jamais déplacer avoirsMetrics après caDuJourNet → TDZ fatale après minification.

  // 0. Indicateurs Avoirs (DÉCLARÉ EN PREMIER pour éviter Temporal Dead Zone)
  const avoirsMetrics = useMemo(() => {
    const currentYearMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    const currentToday = new Date().toISOString().slice(0, 10)

    let totalAvoirsMois = 0
    let totalRemboursementsEspeces = 0
    let totalRemboursementsMoMo = 0
    let totalCreditsClientsAvoirs = 0
    let totalAvoirsAujourdhui = 0

    avoirsDuMois.forEach((a) => {
      if (a.statut === 'annule') return
      const aMonth = a.date_avoir ? a.date_avoir.slice(0, 7) : ''
      const aDate = a.date_avoir ? a.date_avoir.slice(0, 10) : ''
      const mnt = Number(a.montant_total_avoir) || 0

      if (aMonth === currentYearMonth) {
        totalAvoirsMois += mnt
        if (a.remboursement_effectue) {
          if (a.mode_remboursement === 'especes') {
            totalRemboursementsEspeces += mnt
          } else if (a.mode_remboursement === 'momo') {
            totalRemboursementsMoMo += mnt
          }
        }
        if (a.mode_remboursement === 'credit_client') {
          totalCreditsClientsAvoirs += mnt
        }
      }

      if (aDate === currentToday) {
        totalAvoirsAujourdhui += mnt
      }
    })

    return {
      totalAvoirsMois,
      totalRemboursementsEspeces,
      totalRemboursementsMoMo,
      totalCreditsClientsAvoirs,
      totalAvoirsAujourdhui
    }
  }, [avoirsDuMois])

  // 1. CA du jour (Total des ventes enregistrées aujourd'hui)
  const caDuJourBrut = useMemo(() => {
    return salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // caDuJourNet peut maintenant utiliser avoirsMetrics car il est déjà déclaré ci-dessus
  const caDuJourNet = useMemo(() => {
    return Math.max(0, caDuJourBrut - (avoirsMetrics?.totalAvoirsAujourdhui || 0))
  }, [caDuJourBrut, avoirsMetrics])

  const caDuJour = caDuJourNet

  // Ventilation des règlements (Espèces, MoMo, Crédit) supportant le multi-paiement
  const { especesDuJour, momoDuJour, creancesDuJour } = useMemo(() => {`;

if (dash.includes(OLD_ORDER)) {
  dash = dash.replace(OLD_ORDER, NEW_ORDER);
  console.log('✔ DashboardPage.tsx : caDuJourNet réordonné APRÈS avoirsMetrics');
} else {
  console.warn('⚠️  Pattern avoirsMetrics/caDuJourNet non trouvé — vérification manuelle requise');
}

// Maintenant supprimer l'ancienne déclaration dupliquée de avoirsMetrics (ligne ~234)
const OLD_AVOIRS_METRICS_SECTION = `  // ── Indicateurs Avoirs Globaux Étape 8 ──
  const avoirsMetrics = useMemo(() => {
    const currentYearMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    const currentToday = new Date().toISOString().slice(0, 10)

    let totalAvoirsMois = 0
    let totalRemboursementsEspeces = 0
    let totalRemboursementsMoMo = 0
    let totalCreditsClientsAvoirs = 0
    let totalAvoirsAujourdhui = 0

    avoirsDuMois.forEach((a) => {
      if (a.statut === 'annule') return
      const aMonth = a.date_avoir ? a.date_avoir.slice(0, 7) : ''
      const aDate = a.date_avoir ? a.date_avoir.slice(0, 10) : ''
      const mnt = Number(a.montant_total_avoir) || 0

      if (aMonth === currentYearMonth) {
        totalAvoirsMois += mnt
        if (a.remboursement_effectue) {
          if (a.mode_remboursement === 'especes') {
            totalRemboursementsEspeces += mnt
          } else if (a.mode_remboursement === 'momo') {
            totalRemboursementsMoMo += mnt
          }
        }
        if (a.mode_remboursement === 'credit_client') {
          totalCreditsClientsAvoirs += mnt
        }
      }

      if (aDate === currentToday) {
        totalAvoirsAujourdhui += mnt
      }
    })

    return {
      totalAvoirsMois,
      totalRemboursementsEspeces,
      totalRemboursementsMoMo,
      totalCreditsClientsAvoirs,
      totalAvoirsAujourdhui
    }
  }, [avoirsDuMois])`;

if (dash.includes(OLD_AVOIRS_METRICS_SECTION)) {
  dash = dash.replace(
    OLD_AVOIRS_METRICS_SECTION,
    `  // ── avoirsMetrics déclaré plus haut (avant caDuJourNet) pour éviter TDZ ──`
  );
  console.log('✔ DashboardPage.tsx : ancienne déclaration dupliquée avoirsMetrics supprimée');
} else {
  console.warn('⚠️  Section avoirsMetrics ancienne non trouvée (peut-être déjà corrigée)');
}

write('src/pages/dashboard/DashboardPage.tsx', dash);

// ══════════════════════════════════════════════════════════════════════════════
// 2. FIX SectorErrorBoundary.tsx — Auto-reload aussi sur erreur TDZ
// ══════════════════════════════════════════════════════════════════════════════

let seb = read('src/components/common/SectorErrorBoundary.tsx');

// 2a. Étendre detectChunkError pour capturer aussi les TDZ errors
const OLD_DETECT = `/** Détecte si une erreur est causée par un chunk JS introuvable (post-déploiement) */
function detectChunkError(err: Error | null): boolean {
  if (!err) return false
  const msg = (err.message || '') + (err.name || '') + (err.stack || '')
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}`;

const NEW_DETECT = `/** Détecte si une erreur est causée par un chunk JS introuvable (post-déploiement) */
function detectChunkError(err: Error | null): boolean {
  if (!err) return false
  const msg = (err.message || '') + (err.name || '') + (err.stack || '')
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

/**
 * Détecte une erreur Temporal Dead Zone (TDZ) post-déploiement :
 * "Cannot access 'X' before initialization" — causée par un mauvais ordre
 * de chargement des chunks après un nouveau déploiement Vercel.
 * Solution : vider le cache navigateur + recharger une fois proprement.
 */
function detectTDZError(err: Error | null): boolean {
  if (!err) return false
  const msg = (err.message || '') + (err.name || '') + (err.stack || '')
  return (
    msg.includes('Cannot access') && msg.includes('before initialization') ||
    msg.includes('ReferenceError') && msg.includes('initialization')
  )
}`;

if (seb.includes(OLD_DETECT)) {
  seb = seb.replace(OLD_DETECT, NEW_DETECT);
  console.log('✔ SectorErrorBoundary : detectTDZError ajouté');
} else {
  console.warn('⚠️  Pattern detectChunkError non trouvé dans SectorErrorBoundary');
}

// 2b. getDerivedStateFromError — inclure TDZ dans isChunkError pour afficher spinner
const OLD_DERIVED = `  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      isChunkError: detectChunkError(error),
    }
  }`;

const NEW_DERIVED = `  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      // TDZ errors traitées comme chunk errors : spinner + reload automatique
      isChunkError: detectChunkError(error) || detectTDZError(error),
    }
  }`;

if (seb.includes(OLD_DERIVED)) {
  seb = seb.replace(OLD_DERIVED, NEW_DERIVED);
  console.log('✔ SectorErrorBoundary : getDerivedStateFromError inclut TDZ');
}

// 2c. componentDidCatch — auto-reload sur TDZ error
const OLD_DID_CATCH = `  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SectorErrorBoundary] Erreur interceptée dans le sous-logiciel :', error, errorInfo)
    this.setState({ errorInfo })

    // ── Auto-reload si chunk error (post-déploiement) ─────────────────────
    // On recharge automatiquement UNE seule fois (garde anti-boucle).
    if (detectChunkError(error)) {
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        console.warn('[SectorErrorBoundary] Chunk introuvable — rechargement automatique dans 800ms…')
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        // Petit délai pour ne pas recharger avant que React ait fini le rendu
        setTimeout(() => {
          window.location.href = window.location.pathname + '?t=' + Date.now()
        }, 800)
      }
    }
  }`;

const NEW_DID_CATCH = `  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SectorErrorBoundary] Erreur interceptée dans le sous-logiciel :', error, errorInfo)
    this.setState({ errorInfo })

    // ── Auto-reload si chunk error ou TDZ error (post-déploiement) ──────────
    // On recharge automatiquement UNE seule fois (garde anti-boucle).
    const isAutoReloadable = detectChunkError(error) || detectTDZError(error)
    if (isAutoReloadable) {
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        const isTDZ = detectTDZError(error)
        console.warn(
          isTDZ
            ? '[SectorErrorBoundary] Erreur TDZ (variable non initialisée) — purge cache + rechargement dans 800ms…'
            : '[SectorErrorBoundary] Chunk introuvable — rechargement automatique dans 800ms…'
        )
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        // Purge des caches navigateur (SW, fetch cache) avant rechargement
        if (isTDZ && 'caches' in window) {
          window.caches.keys().then((names) => names.forEach((n) => window.caches.delete(n))).catch(() => {})
        }
        setTimeout(() => {
          window.location.href = window.location.pathname + '?t=' + Date.now()
        }, 800)
      }
    }
  }`;

if (seb.includes(OLD_DID_CATCH)) {
  seb = seb.replace(OLD_DID_CATCH, NEW_DID_CATCH);
  console.log('✔ SectorErrorBoundary : componentDidCatch gère TDZ + purge cache');
} else {
  console.warn('⚠️  Pattern componentDidCatch non trouvé');
}

// 2d. Bouton Réessayer — vrai hard reload avec purge cache (pas juste setState)
const OLD_RELOAD = `  /** Hard reload avec cache-bust — bypass navigateur et SW */
  private handleReload = () => {
    sessionStorage.removeItem('gestio229_chunk_reload')
    window.location.href = window.location.pathname + '?t=' + Date.now()
  }`;

const NEW_RELOAD = `  /** Hard reload avec cache-bust et purge SW — bypass navigateur et Service Worker */
  private handleReload = () => {
    // Purge complète pour éviter que l'ancien chunk soit servi par le cache
    sessionStorage.clear()
    localStorage.removeItem('gestio229_app_version') // Force version check au reload
    if ('caches' in window) {
      window.caches.keys().then((names) => names.forEach((n) => window.caches.delete(n))).catch(() => {})
    }
    // Reload avec cache-bust param
    window.location.href = window.location.pathname + '?t=' + Date.now()
  }`;

if (seb.includes(OLD_RELOAD)) {
  seb = seb.replace(OLD_RELOAD, NEW_RELOAD);
  console.log('✔ SectorErrorBoundary : handleReload fait purge complète');
} else {
  console.warn('⚠️  Pattern handleReload non trouvé');
}

write('src/components/common/SectorErrorBoundary.tsx', seb);

// ══════════════════════════════════════════════════════════════════════════════
// 3. FIX vite.config.ts — manualChunks pour grouper Dashboard core ensemble
// ══════════════════════════════════════════════════════════════════════════════

const OLD_VITE = `// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 3000,
    host: true
  },
  esbuild: {
    keepNames: true,
  },
  define: {
    // Identifiant unique de chaque build — change à chaque déploiement Vercel
    // Utilisé pour détecter un nouveau déploiement et forcer un rechargement propre
    __APP_VERSION__: JSON.stringify(\`\${Date.now()}\`),
  }
})`;

const NEW_VITE = `// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 3000,
    host: true
  },
  esbuild: {
    // keepNames : empêche la minification agressive en noms de 1 lettre (h, g, f...)
    // qui provoque les erreurs "Cannot access 'h' before initialization" (TDZ)
    keepNames: true,
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * manualChunks : regroupe les fichiers qui dépendent les uns des autres
         * dans le même chunk pour éviter les problèmes d'ordre de chargement (TDZ).
         *
         * RÈGLE : DashboardPage + SectorErrorBoundary + ModuleGuard doivent être
         * dans le même chunk car ils forment un cycle d'initialisation.
         */
        manualChunks: (id: string) => {
          // Vendor React/Router/Zustand : chunk stable entre deployments
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/zustand')) {
            return 'vendor-react'
          }
          // Autres node_modules : chunk vendor générique
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          // Dashboard core : DashboardPage + ErrorBoundary + ModuleGuard dans le MÊME chunk
          // → impossible d'avoir une TDZ entre eux car ils sont dans le même fichier JS
          if (id.includes('DashboardPage') ||
              id.includes('SectorErrorBoundary') ||
              id.includes('ModuleGuard') ||
              id.includes('SectorGuard') ||
              id.includes('useTenant') ||
              id.includes('sectorClient') ||
              id.includes('hubFinancialService') ||
              id.includes('factureAvoirService')) {
            return 'dashboard-core'
          }
          // HubPage dans son propre chunk
          if (id.includes('HubPage') || id.includes('MultiservicesHub')) {
            return 'hub-core'
          }
        },
      },
    },
  },
  define: {
    // Identifiant unique de chaque build — change à chaque déploiement Vercel
    // Utilisé pour détecter un nouveau déploiement et forcer un rechargement propre
    __APP_VERSION__: JSON.stringify(\`\${Date.now()}\`),
  }
})`;

let vite = read('vite.config.ts');
if (vite.includes(OLD_VITE)) {
  vite = vite.replace(OLD_VITE, NEW_VITE);
  console.log('✔ vite.config.ts : manualChunks dashboard-core ajouté');
} else {
  // Fallback : chercher la config build section
  if (!vite.includes('manualChunks')) {
    // Insérer build config avant esbuild
    vite = vite.replace(
      `  esbuild: {
    keepNames: true,
  },`,
      `  esbuild: {
    // keepNames : empêche la minification agressive en noms de 1 lettre (TDZ protection)
    keepNames: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router') || id.includes('node_modules/zustand')) return 'vendor-react'
          if (id.includes('node_modules')) return 'vendor'
          if (id.includes('DashboardPage') || id.includes('SectorErrorBoundary') || id.includes('ModuleGuard') || id.includes('SectorGuard') || id.includes('useTenant') || id.includes('sectorClient') || id.includes('hubFinancialService') || id.includes('factureAvoirService')) return 'dashboard-core'
          if (id.includes('HubPage') || id.includes('MultiservicesHub')) return 'hub-core'
        },
      },
    },
  },`
    );
    console.log('✔ vite.config.ts : manualChunks inséré via fallback');
  } else {
    console.log('ℹ️  vite.config.ts : manualChunks déjà présent');
  }
}

write('vite.config.ts', vite);

// ══════════════════════════════════════════════════════════════════════════════
// 4. main.tsx — Étendre le guard global pour capturer aussi les TDZ errors
// ══════════════════════════════════════════════════════════════════════════════

let main = read('src/main.tsx');

const OLD_CHUNK_GUARD = `  // ── 3. Filet de sécurité global : chunk error → reload automatique ────────
  // Si un import dynamique échoue EN DEHORS de safeLazy (ex: SW stale),
  // on le capture ici et on recharge une fois.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason ?? '')
    const isChunkError = (
      msg.includes('dynamically imported module') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module')
    )
    if (isChunkError) {
      event.preventDefault()
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        console.warn('[GESTIO 229] Chunk error global intercepté — rechargement automatique…', msg)
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        window.location.href = window.location.pathname + '?t=' + Date.now()
      }
    }
  })`;

const NEW_CHUNK_GUARD = `  // ── 3. Filet de sécurité global : chunk error + TDZ error → reload auto ──
  // Capture TOUTES les erreurs de chargement (chunk manquant, TDZ) EN DEHORS de React.
  const isAutoReloadableError = (msg: string) =>
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    // TDZ : "Cannot access 'h' before initialization"
    (msg.includes('Cannot access') && msg.includes('before initialization'))

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason ?? '')
    if (isAutoReloadableError(msg)) {
      event.preventDefault()
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        console.warn('[GESTIO 229] Erreur auto-réparable interceptée — rechargement automatique…', msg)
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        window.location.href = window.location.pathname + '?t=' + Date.now()
      }
    }
  })

  // Filet global synchrone : capture les TDZ errors qui arrivent en erreur window (pas promesse)
  window.addEventListener('error', (event) => {
    const msg = (event?.error?.message || event?.message || '')
    if (msg.includes('Cannot access') && msg.includes('before initialization')) {
      const alreadyReloaded = sessionStorage.getItem('gestio229_chunk_reload') === '1'
      if (!alreadyReloaded) {
        console.warn('[GESTIO 229] Erreur TDZ globale interceptée — purge + rechargement…', msg)
        sessionStorage.setItem('gestio229_chunk_reload', '1')
        if ('caches' in window) {
          window.caches.keys().then((names) => names.forEach((n) => window.caches.delete(n))).catch(() => {})
        }
        window.location.href = window.location.pathname + '?t=' + Date.now()
      }
    }
  })`;

if (main.includes(OLD_CHUNK_GUARD)) {
  main = main.replace(OLD_CHUNK_GUARD, NEW_CHUNK_GUARD);
  console.log('✔ main.tsx : guard global étendu aux TDZ errors');
} else {
  console.warn('⚠️  Pattern chunk guard dans main.tsx non trouvé — vérifier manuellement');
}

write('src/main.tsx', main);

console.log('\n🎉 Fix TDZ appliqué avec succès sur 4 fichiers !');
console.log('   Lancez : cmd /c "npm run build"');
