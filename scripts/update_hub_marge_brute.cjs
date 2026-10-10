/**
 * GESTIO 229 — Script de mise à jour HUB : Ajout Marge Brute
 * Règle absolue : NE RIEN SUPPRIMER — AJOUTER SEULEMENT
 *
 * Ce script modifie :
 *   1. src/services/hubFinancialService.ts  → ajout dayGrossMargin + monthGrossMargin dans les interfaces et calculs
 *   2. src/views/hub/MultiservicesHub.tsx   → ajout grossMargin dans ActivityEntry, loadFinancialMetrics,
 *                                             dayTotals, monthTotals, JSX Jour/Mois/Cartes
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function writeFile(relPath, content) {
  fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8');
  console.log(`✅ Écrit : ${relPath}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. hubFinancialService.ts — Ajout marge brute
// ══════════════════════════════════════════════════════════════════════════════

let svc = readFile('src/services/hubFinancialService.ts');

// 1a. Ajouter dayGrossMargin + monthGrossMargin dans SectorMetrics
if (!svc.includes('dayGrossMargin')) {
  svc = svc.replace(
    `export interface SectorMetrics {
  sector_slug: string;
  dayRevenue: number;     // CA DU JOUR
  dayExpenses: number;    // DÉPENSES DU JOUR
  dayNetMargin: number;   // MARGE NETTE DU JOUR
  monthRevenue: number;   // CA DU MOIS
  monthExpenses: number;  // DÉPENSES DU MOIS
  monthNetMargin: number; // MARGE NETTE DU MOIS
}`,
    `export interface SectorMetrics {
  sector_slug: string;
  dayRevenue: number;      // CA DU JOUR
  dayGrossMargin: number;  // MARGE BRUTE DU JOUR [NOUVEAU]
  dayExpenses: number;     // DÉPENSES DU JOUR
  dayNetMargin: number;    // MARGE NETTE DU JOUR
  monthRevenue: number;    // CA DU MOIS
  monthGrossMargin: number; // MARGE BRUTE DU MOIS [NOUVEAU]
  monthExpenses: number;   // DÉPENSES DU MOIS
  monthNetMargin: number;  // MARGE NETTE DU MOIS
}`
  );
  console.log('✔ SectorMetrics : dayGrossMargin + monthGrossMargin ajoutés');
} else {
  console.log('ℹ️  SectorMetrics déjà mis à jour');
}

// 1b. Ajouter marge_brute_jour + marge_brute_mois dans HubFinancialTotals
if (!svc.includes('marge_brute_jour')) {
  svc = svc.replace(
    `export interface HubFinancialTotals {
  date: string;
  ca_jour: number;
  depenses_jour: number;
  marge_jour: number;
  ca_mois: number;
  depenses_mois: number;
  marge_mois: number;
  mois_debut: string;
  mois_fin: string;
}`,
    `export interface HubFinancialTotals {
  date: string;
  ca_jour: number;
  marge_brute_jour: number;   // MARGE BRUTE DU JOUR [NOUVEAU]
  depenses_jour: number;
  marge_jour: number;
  ca_mois: number;
  marge_brute_mois: number;   // MARGE BRUTE DU MOIS [NOUVEAU]
  depenses_mois: number;
  marge_mois: number;
  mois_debut: string;
  mois_fin: string;
}`
  );
  console.log('✔ HubFinancialTotals : marge_brute_jour + marge_brute_mois ajoutés');
} else {
  console.log('ℹ️  HubFinancialTotals déjà mis à jour');
}

// 1c. Initialisation initSector — ajouter dayGrossMargin + monthGrossMargin à 0
if (!svc.includes('dayGrossMargin: 0')) {
  svc = svc.replace(
    `      sectorsMap[clean] = {
        sector_slug: clean,
        dayRevenue: 0,
        dayExpenses: 0,
        dayNetMargin: 0,
        monthRevenue: 0,
        monthExpenses: 0,
        monthNetMargin: 0,
      };`,
    `      sectorsMap[clean] = {
        sector_slug: clean,
        dayRevenue: 0,
        dayGrossMargin: 0,   // [NOUVEAU]
        dayExpenses: 0,
        dayNetMargin: 0,
        monthRevenue: 0,
        monthGrossMargin: 0, // [NOUVEAU]
        monthExpenses: 0,
        monthNetMargin: 0,
      };`
  );
  console.log('✔ initSector : dayGrossMargin + monthGrossMargin initialisés');
}

// 1d. Dans la boucle sales_orders — accumuler gross margin séparément
if (!svc.includes('card.dayGrossMargin')) {
  svc = svc.replace(
    `        if (isToday) {
          card.dayRevenue += totalTTC;
          card.dayNetMargin += margin;
        }

        if (isThisMonth) {
          card.monthRevenue += totalTTC;
          card.monthNetMargin += margin;
        }`,
    `        if (isToday) {
          card.dayRevenue += totalTTC;
          card.dayGrossMargin += margin;  // [NOUVEAU] Marge brute jour = avant déduction dépenses
          card.dayNetMargin += margin;
        }

        if (isThisMonth) {
          card.monthRevenue += totalTTC;
          card.monthGrossMargin += margin; // [NOUVEAU] Marge brute mois = avant déduction dépenses
          card.monthNetMargin += margin;
        }`
  );
  console.log('✔ Boucle sales_orders : accumulation dayGrossMargin + monthGrossMargin');
}

// 1e. Calculer les totaux consolidés — ajouter marge_brute
if (!svc.includes('marge_brute_jour: 0')) {
  svc = svc.replace(
    `  let calculatedTotals: HubFinancialTotals = {
    date: todayStr,
    ca_jour: 0,
    depenses_jour: 0,
    marge_jour: 0,
    ca_mois: 0,
    depenses_mois: 0,
    marge_mois: 0,
    mois_debut: monthStartStr,
    mois_fin: monthEndStr,
  };`,
    `  let calculatedTotals: HubFinancialTotals = {
    date: todayStr,
    ca_jour: 0,
    marge_brute_jour: 0,   // [NOUVEAU]
    depenses_jour: 0,
    marge_jour: 0,
    ca_mois: 0,
    marge_brute_mois: 0,   // [NOUVEAU]
    depenses_mois: 0,
    marge_mois: 0,
    mois_debut: monthStartStr,
    mois_fin: monthEndStr,
  };`
  );
  console.log('✔ calculatedTotals initialisé avec marge_brute_jour/mois');
}

// 1f. Boucle d'agrégation des secteurs — ajouter marge brute
if (!svc.includes('calculatedTotals.marge_brute_jour')) {
  svc = svc.replace(
    `  const sectorCards = Object.values(sectorsMap);
  for (const c of sectorCards) {
    calculatedTotals.ca_jour += c.dayRevenue;
    calculatedTotals.depenses_jour += c.dayExpenses;
    calculatedTotals.marge_jour += c.dayNetMargin;
    calculatedTotals.ca_mois += c.monthRevenue;
    calculatedTotals.depenses_mois += c.monthExpenses;
    calculatedTotals.marge_mois += c.monthNetMargin;
  }`,
    `  const sectorCards = Object.values(sectorsMap);
  for (const c of sectorCards) {
    calculatedTotals.ca_jour += c.dayRevenue;
    calculatedTotals.marge_brute_jour += c.dayGrossMargin;  // [NOUVEAU]
    calculatedTotals.depenses_jour += c.dayExpenses;
    calculatedTotals.marge_jour += c.dayNetMargin;
    calculatedTotals.ca_mois += c.monthRevenue;
    calculatedTotals.marge_brute_mois += c.monthGrossMargin; // [NOUVEAU]
    calculatedTotals.depenses_mois += c.monthExpenses;
    calculatedTotals.marge_mois += c.monthNetMargin;
  }`
  );
  console.log('✔ Boucle agrégation : marge_brute_jour/mois ajoutés');
}

// 1g. Patch rpcTotals pour initialiser les nouveaux champs à 0 (évite undefined)
if (!svc.includes('marge_brute_jour: 0,')) {
  svc = svc.replace(
    `      rpcTotals = {
        date: rpcData.date || todayStr,
        ca_jour: Number(rpcData.ca_jour) || 0,
        depenses_jour: Number(rpcData.depenses_jour) || 0,
        marge_jour: Number(rpcData.marge_jour) || 0,
        ca_mois: Number(rpcData.ca_mois) || 0,
        depenses_mois: Number(rpcData.depenses_mois) || 0,
        marge_mois: Number(rpcData.marge_mois) || 0,
        mois_debut: rpcData.mois_debut || monthStartStr,
        mois_fin: rpcData.mois_fin || monthEndStr,
      };`,
    `      rpcTotals = {
        date: rpcData.date || todayStr,
        ca_jour: Number(rpcData.ca_jour) || 0,
        marge_brute_jour: 0,  // [NOUVEAU] RPC ne fournit pas encore ce champ
        depenses_jour: Number(rpcData.depenses_jour) || 0,
        marge_jour: Number(rpcData.marge_jour) || 0,
        ca_mois: Number(rpcData.ca_mois) || 0,
        marge_brute_mois: 0,  // [NOUVEAU] RPC ne fournit pas encore ce champ
        depenses_mois: Number(rpcData.depenses_mois) || 0,
        marge_mois: Number(rpcData.marge_mois) || 0,
        mois_debut: rpcData.mois_debut || monthStartStr,
        mois_fin: rpcData.mois_fin || monthEndStr,
      };`
  );
  console.log('✔ rpcTotals patché avec marge_brute_jour/mois = 0');
}

writeFile('src/services/hubFinancialService.ts', svc);

// ══════════════════════════════════════════════════════════════════════════════
// 2. MultiservicesHub.tsx — Propagation marge brute dans UI
// ══════════════════════════════════════════════════════════════════════════════

let hub = readFile('src/views/hub/MultiservicesHub.tsx');

// 2a. Interface ActivityEntry — ajouter grossMargin + monthGrossMargin
if (!hub.includes('grossMargin: number')) {
  hub = hub.replace(
    `  // PARTIE 3 : Métriques du Jour (F CFA)
  revenue: number;             // CA DU JOUR
  expenses: number;            // DÉPENSES DU JOUR
  netMargin: number;           // MARGE NETTE DU JOUR
  // PARTIE 4 : Métriques du Mois (F CFA)
  monthRevenue: number;        // CA DU MOIS
  monthExpenses: number;       // DÉPENSES DU MOIS
  monthNetMargin: number;      // MARGE NETTE DU MOIS`,
    `  // PARTIE 3 : Métriques du Jour (F CFA)
  revenue: number;             // CA DU JOUR
  grossMargin: number;         // MARGE BRUTE DU JOUR [NOUVEAU]
  expenses: number;            // DÉPENSES DU JOUR
  netMargin: number;           // MARGE NETTE DU JOUR
  // PARTIE 4 : Métriques du Mois (F CFA)
  monthRevenue: number;        // CA DU MOIS
  monthGrossMargin: number;    // MARGE BRUTE DU MOIS [NOUVEAU]
  monthExpenses: number;       // DÉPENSES DU MOIS
  monthNetMargin: number;      // MARGE NETTE DU MOIS`
  );
  console.log('✔ ActivityEntry : grossMargin + monthGrossMargin ajoutés');
} else {
  console.log('ℹ️  ActivityEntry déjà mis à jour');
}

// 2b. Initialisation dans useState initial (lines ~159-164)
hub = hub.replace(
  /revenue: 0,\r?\n(\s+)expenses: 0,\r?\n(\s+)netMargin: 0,\r?\n(\s+)monthRevenue: 0,\r?\n(\s+)monthExpenses: 0,\r?\n(\s+)monthNetMargin: 0,/g,
  (match, s1, s2, s3, s4, s5) => {
    if (match.includes('grossMargin')) return match; // déjà mis à jour
    return `revenue: 0,\n${s1}grossMargin: 0,\n${s1}expenses: 0,\n${s2}netMargin: 0,\n${s3}monthRevenue: 0,\n${s4}monthGrossMargin: 0,\n${s4}monthExpenses: 0,\n${s5}monthNetMargin: 0,`;
  }
);
console.log('✔ Initialisations revenue:0 / expenses:0 patchées avec grossMargin:0');

// 2c. loadFinancialMetrics — mapper dayGrossMargin → grossMargin
if (!hub.includes('grossMargin: card.dayGrossMargin')) {
  hub = hub.replace(
    `          return {
            ...act,
            // Métriques isolées strictement du jour et du mois pour ce secteur
            revenue: card.dayRevenue,
            expenses: card.dayExpenses,
            netMargin: card.dayNetMargin,
            monthRevenue: card.monthRevenue,
            monthExpenses: card.monthExpenses,
            monthNetMargin: card.monthNetMargin,
          };`,
    `          return {
            ...act,
            // Métriques isolées strictement du jour et du mois pour ce secteur
            revenue: card.dayRevenue,
            grossMargin: card.dayGrossMargin ?? 0,      // [NOUVEAU]
            expenses: card.dayExpenses,
            netMargin: card.dayNetMargin,
            monthRevenue: card.monthRevenue,
            monthGrossMargin: card.monthGrossMargin ?? 0, // [NOUVEAU]
            monthExpenses: card.monthExpenses,
            monthNetMargin: card.monthNetMargin,
          };`
  );
  console.log('✔ loadFinancialMetrics : dayGrossMargin mappé → grossMargin');
} else {
  console.log('ℹ️  loadFinancialMetrics déjà mis à jour');
}

// 2d. dayTotals useMemo — ajouter totalGrossMargin
if (!hub.includes('sumGrossMargin')) {
  hub = hub.replace(
    `  const dayTotals = useMemo(() => {
    const sumRevenue = activeActivities.reduce((a, s) => a + (s.revenue || 0), 0);
    const sumExpenses = activeActivities.reduce((a, s) => a + (s.expenses || 0), 0);
    const sumNetMargin = activeActivities.reduce((a, s) => a + (s.netMargin || 0), 0);

    const totalRevenue = hubTotals && typeof hubTotals.ca_jour === 'number'
      ? hubTotals.ca_jour
      : sumRevenue;
    const totalExpenses = hubTotals && typeof hubTotals.depenses_jour === 'number'
      ? hubTotals.depenses_jour
      : sumExpenses;
    const totalNetMargin = hubTotals && typeof hubTotals.marge_jour === 'number'
      ? hubTotals.marge_jour
      : sumNetMargin;
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities, hubTotals]);`,
    `  const dayTotals = useMemo(() => {
    const sumRevenue = activeActivities.reduce((a, s) => a + (s.revenue || 0), 0);
    const sumGrossMargin = activeActivities.reduce((a, s) => a + (s.grossMargin || 0), 0); // [NOUVEAU]
    const sumExpenses = activeActivities.reduce((a, s) => a + (s.expenses || 0), 0);
    const sumNetMargin = activeActivities.reduce((a, s) => a + (s.netMargin || 0), 0);

    const totalRevenue = hubTotals && typeof hubTotals.ca_jour === 'number'
      ? hubTotals.ca_jour
      : sumRevenue;
    const totalGrossMargin = hubTotals && typeof (hubTotals as any).marge_brute_jour === 'number'
      ? (hubTotals as any).marge_brute_jour
      : sumGrossMargin; // [NOUVEAU]
    const totalExpenses = hubTotals && typeof hubTotals.depenses_jour === 'number'
      ? hubTotals.depenses_jour
      : sumExpenses;
    const totalNetMargin = hubTotals && typeof hubTotals.marge_jour === 'number'
      ? hubTotals.marge_jour
      : sumNetMargin;
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalGrossMargin, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities, hubTotals]);`
  );
  console.log('✔ dayTotals : totalGrossMargin ajouté');
} else {
  console.log('ℹ️  dayTotals déjà mis à jour');
}

// 2e. monthTotals useMemo — ajouter totalGrossMargin
if (!hub.includes('sumMonthGrossMargin')) {
  hub = hub.replace(
    `  const monthTotals = useMemo(() => {
    const sumRevenue = activeActivities.reduce((a, s) => a + (s.monthRevenue || 0), 0);
    const sumExpenses = activeActivities.reduce((a, s) => a + (s.monthExpenses || 0), 0);
    const sumNetMargin = activeActivities.reduce((a, s) => a + (s.monthNetMargin || 0), 0);

    const totalRevenue = hubTotals && typeof hubTotals.ca_mois === 'number'
      ? hubTotals.ca_mois
      : sumRevenue;
    const totalExpenses = hubTotals && typeof hubTotals.depenses_mois === 'number'
      ? hubTotals.depenses_mois
      : sumExpenses;
    const totalNetMargin = hubTotals && typeof hubTotals.marge_mois === 'number'
      ? hubTotals.marge_mois
      : sumNetMargin;
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities, hubTotals]);`,
    `  const monthTotals = useMemo(() => {
    const sumRevenue = activeActivities.reduce((a, s) => a + (s.monthRevenue || 0), 0);
    const sumMonthGrossMargin = activeActivities.reduce((a, s) => a + (s.monthGrossMargin || 0), 0); // [NOUVEAU]
    const sumExpenses = activeActivities.reduce((a, s) => a + (s.monthExpenses || 0), 0);
    const sumNetMargin = activeActivities.reduce((a, s) => a + (s.monthNetMargin || 0), 0);

    const totalRevenue = hubTotals && typeof hubTotals.ca_mois === 'number'
      ? hubTotals.ca_mois
      : sumRevenue;
    const totalGrossMargin = hubTotals && typeof (hubTotals as any).marge_brute_mois === 'number'
      ? (hubTotals as any).marge_brute_mois
      : sumMonthGrossMargin; // [NOUVEAU]
    const totalExpenses = hubTotals && typeof hubTotals.depenses_mois === 'number'
      ? hubTotals.depenses_mois
      : sumExpenses;
    const totalNetMargin = hubTotals && typeof hubTotals.marge_mois === 'number'
      ? hubTotals.marge_mois
      : sumNetMargin;
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalGrossMargin, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities, hubTotals]);`
  );
  console.log('✔ monthTotals : totalGrossMargin ajouté');
} else {
  console.log('ℹ️  monthTotals déjà mis à jour');
}

// 2f. Section JOUR — passer à 4 colonnes + insérer carte MARGE BRUTE DU JOUR
if (!hub.includes('MARGE BRUTE DU JOUR')) {
  hub = hub.replace(
    `          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* CA DU JOUR */}
            <div className={\`p-4 rounded-xl border \${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }\`}>
              <span className={\`text-[11px] font-bold uppercase tracking-wider block mb-1 \${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }\`}>
                CA DU JOUR
              </span>
              <div className={\`text-2xl font-black tracking-tight \${
                darkMode ? 'text-white' : 'text-slate-900'
              }\`}>
                {fmt(dayTotals.totalRevenue)}
              </div>
              <div className="text-xs text-blue-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU JOUR */}`,
    `          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CA DU JOUR */}
            <div className={\`p-4 rounded-xl border \${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }\`}>
              <span className={\`text-[11px] font-bold uppercase tracking-wider block mb-1 \${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }\`}>
                CA DU JOUR
              </span>
              <div className={\`text-2xl font-black tracking-tight \${
                darkMode ? 'text-white' : 'text-slate-900'
              }\`}>
                {fmt(dayTotals.totalRevenue)}
              </div>
              <div className="text-xs text-blue-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* MARGE BRUTE DU JOUR [NOUVEAU] */}
            <div className={\`p-4 rounded-xl border \${
              darkMode ? 'bg-slate-950/60 border-teal-500/20' : 'bg-teal-50/60 border-teal-200'
            }\`}>
              <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider block mb-1">
                MARGE BRUTE DU JOUR
              </span>
              <div className="text-2xl font-black text-teal-600 tracking-tight">
                {fmt(dayTotals.totalGrossMargin)}
              </div>
              <div className="text-xs text-teal-600 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU JOUR */}`
  );
  console.log('✔ Section JOUR : carte MARGE BRUTE insérée + grid-cols-4');
} else {
  console.log('ℹ️  Section JOUR déjà mise à jour');
}

// 2g. Section MOIS — passer à 4 colonnes + insérer carte MARGE BRUTE DU MOIS
if (!hub.includes('MARGE BRUTE DU MOIS')) {
  hub = hub.replace(
    `          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* CA DU MOIS */}
            <div className={\`p-4 rounded-xl border \${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }\`}>
              <span className={\`text-[11px] font-bold uppercase tracking-wider block mb-1 \${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }\`}>
                CA DU MOIS
              </span>
              <div className={\`text-2xl font-black tracking-tight \${
                darkMode ? 'text-white' : 'text-slate-900'
              }\`}>
                {fmt(monthTotals.totalRevenue)}
              </div>
              <div className="text-xs text-indigo-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU MOIS */}`,
    `          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CA DU MOIS */}
            <div className={\`p-4 rounded-xl border \${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }\`}>
              <span className={\`text-[11px] font-bold uppercase tracking-wider block mb-1 \${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }\`}>
                CA DU MOIS
              </span>
              <div className={\`text-2xl font-black tracking-tight \${
                darkMode ? 'text-white' : 'text-slate-900'
              }\`}>
                {fmt(monthTotals.totalRevenue)}
              </div>
              <div className="text-xs text-indigo-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* MARGE BRUTE DU MOIS [NOUVEAU] */}
            <div className={\`p-4 rounded-xl border \${
              darkMode ? 'bg-slate-950/60 border-teal-500/20' : 'bg-teal-50/60 border-teal-200'
            }\`}>
              <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider block mb-1">
                MARGE BRUTE DU MOIS
              </span>
              <div className="text-2xl font-black text-teal-600 tracking-tight">
                {fmt(monthTotals.totalGrossMargin)}
              </div>
              <div className="text-xs text-teal-600 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU MOIS */}`
  );
  console.log('✔ Section MOIS : carte MARGE BRUTE insérée + grid-cols-4');
} else {
  console.log('ℹ️  Section MOIS déjà mise à jour');
}

// 2h. Cartes secteurs — ajouter ligne Marge brute entre CA et Dépenses
// La carte affiche le mois (monthGrossMargin), pas le jour
if (!hub.includes('Marge brute :')) {
  hub = hub.replace(
    `                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>CA :</span>
                      <span className={\`font-mono font-bold \${darkMode ? 'text-white' : 'text-slate-900'}\`}>{fmt(act.revenue)} F CFA</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Dépenses :</span>`,
    `                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>CA :</span>
                      <span className={\`font-mono font-bold \${darkMode ? 'text-white' : 'text-slate-900'}\`}>{fmt(act.monthRevenue)} F CFA</span>
                    </div>
                    {/* MARGE BRUTE DU MOIS [NOUVEAU] */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-teal-600 font-semibold">Marge brute :</span>
                      <span className="font-mono font-bold text-teal-600">{fmt(act.monthGrossMargin || 0)} F CFA</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Dépenses :</span>`
  );

  // Aussi corriger Dépenses et Marge nette pour afficher le mois
  hub = hub.replace(
    `                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Dépenses :</span>
                      <span className="font-mono font-bold text-rose-500">{fmt(act.expenses)} F CFA</span>
                    </div>
                    <div className={\`flex items-center justify-between text-xs pt-1.5 border-t \${
                      darkMode ? 'border-slate-800/80' : 'border-slate-200'
                    }\`}>
                      <span className="font-semibold text-emerald-500">Marge nette :</span>
                      <span className="font-mono font-black text-emerald-500">{fmt(act.netMargin)} F CFA</span>
                    </div>`,
    `                    <div className="flex items-center justify-between text-xs">
                      <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Dépenses :</span>
                      <span className="font-mono font-bold text-rose-500">{fmt(act.monthExpenses)} F CFA</span>
                    </div>
                    <div className={\`flex items-center justify-between text-xs pt-1.5 border-t \${
                      darkMode ? 'border-slate-800/80' : 'border-slate-200'
                    }\`}>
                      <span className="font-semibold text-emerald-500">Marge nette :</span>
                      <span className="font-mono font-black text-emerald-500">{fmt(act.monthNetMargin)} F CFA</span>
                    </div>`
  );

  console.log('✔ Corps cartes secteurs : ligne Marge brute ajoutée + affichage mois');
} else {
  console.log('ℹ️  Cartes secteurs déjà mises à jour');
}

writeFile('src/views/hub/MultiservicesHub.tsx', hub);

console.log('\n🎉 Toutes les modifications appliquées avec succès !');
console.log('   → Lancez maintenant : cmd /c "npm run build"');
