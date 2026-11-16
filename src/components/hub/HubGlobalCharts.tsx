// =============================================================================
// GESTIO 229 SaaS — Graphiques Consolidés & Analyse Globale du Hub
// =============================================================================
// Visualisations graphiques interactives :
// 1. Évolution Chiffre d'Affaires vs Dépenses (Jour, Mois, Année)
// 2. Rentabilité Comparée par Site d'Exploitation
// 3. Contribution de Chaque Secteur au Résultat Global
// =============================================================================

import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  ChevronDown,
  ChevronUp,
  Building2,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { CompanySite, SiteFinancials } from '../../services/multisiteService';
import { HubFinancialTotals, SectorMetrics } from '../../services/hubFinancialService';
import { formatNumber } from '../../utils/formatters';

interface HubGlobalChartsProps {
  totals: HubFinancialTotals;
  sites: CompanySite[];
  siteFinancialsMap: Record<string, SiteFinancials>;
  sectorMetricsMap: Record<string, SectorMetrics>;
  activities: any[];
  darkMode: boolean;
}

export const HubGlobalCharts: React.FC<HubGlobalChartsProps> = ({
  totals,
  sites,
  siteFinancialsMap,
  sectorMetricsMap,
  activities,
  darkMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const fmt = (n: number) => formatNumber(Math.round(n || 0));

  // 1. Données Évolution Périodes
  const periodEvolution = [
    { label: 'Du Jour', ca: totals.ca_jour || 0, dep: totals.depenses_jour || 0, marge: totals.marge_jour || 0 },
    { label: 'Du Mois', ca: totals.ca_mois || 0, dep: totals.depenses_mois || 0, marge: totals.marge_mois || 0 },
    { label: "De l'Année", ca: totals.ca_annee || 0, dep: totals.depenses_annee || 0, marge: totals.marge_annee || 0 },
  ];
  const maxPeriodVal = Math.max(...periodEvolution.map((p) => Math.max(p.ca, p.dep)), 1);

  // 2. Données Sites
  const siteBars = sites.map((site) => {
    const fin = siteFinancialsMap[site.id] || {
      monthRevenue: 0,
      monthExpenses: 0,
      monthNetMargin: 0,
      profitabilityRate: 0,
    };
    return {
      name: site.name,
      city: site.city,
      ca: fin.monthRevenue,
      dep: fin.monthExpenses,
      marge: fin.monthNetMargin,
      rate: fin.profitabilityRate,
    };
  });
  const maxSiteVal = Math.max(...siteBars.map((s) => Math.max(s.ca, s.dep)), 1);

  // 3. Données Contribution par Secteur (Top 5 + Autres)
  const sectorList = activities
    .filter((a) => a.status === 'ACTIVE')
    .map((act) => {
      const slug = (act.sectorSlug || '').toLowerCase().replace(/^sec-/, '');
      const metric = sectorMetricsMap[slug] || sectorMetricsMap[act.sectorSlug];
      const ca = metric?.monthRevenue || act.monthRevenue || act.revenue || 0;
      const net = metric?.monthNetMargin || act.monthNetMargin || act.netMargin || 0;
      return {
        name: act.name,
        slug,
        icon: act.sectorIcon || '🏢',
        ca,
        net,
      };
    })
    .sort((a, b) => b.ca - a.ca);

  const totalSectorsCA = sectorList.reduce((sum, s) => sum + s.ca, 0) || 1;

  return (
    <div
      className={`rounded-2xl border transition-all mb-8 overflow-hidden shadow-sm ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}
    >
      {/* Barre Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-5 py-3.5 flex items-center justify-between transition-colors ${
          darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
            <BarChart3 size={18} />
          </div>
          <div className="text-left">
            <span className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Graphiques d'Analyse & Consolidation Visuelle
            </span>
            <span className={`block text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Évolution du CA et des charges • Comparatif par site • Contribution sectorielle
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-emerald-500">
          <span>{isOpen ? 'Masquer les graphiques' : 'Visualiser les graphiques'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Contenu Déroulant des Graphiques */}
      {isOpen && (
        <div className="p-5 pt-2 border-t border-slate-200/60 dark:border-slate-800 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── 1. ÉVOLUTION CA VS DÉPENSES ───────────────────────────────── */}
            <div
              className={`rounded-xl p-4 border ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  1. Évolution CA & Dépenses
                </span>
                <span className="text-[10px] text-slate-400">Jour / Mois / Année</span>
              </div>

              <div className="space-y-4">
                {periodEvolution.map((p, idx) => {
                  const caWidth = Math.min(100, Math.round((p.ca / maxPeriodVal) * 100));
                  const depWidth = Math.min(100, Math.round((p.dep / maxPeriodVal) * 100));

                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{p.label}</span>
                        <span className={`font-mono ${p.marge >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          Marge : {fmt(p.marge)} F
                        </span>
                      </div>

                      {/* Bar CA */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>CA : {fmt(p.ca)} F</span>
                          <span>{caWidth}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(2, caWidth)}%` }}
                          />
                        </div>
                      </div>

                      {/* Bar Dépenses */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>Dépenses : {fmt(p.dep)} F</span>
                          <span>{depWidth}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-rose-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(2, depWidth)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 2. RENTABILITÉ COMPARÉE PAR SITE ──────────────────────────── */}
            <div
              className={`rounded-xl p-4 border ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  2. Performance Comparée des Sites
                </span>
                <span className="text-[10px] text-slate-400">(Mois en cours)</span>
              </div>

              {siteBars.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">Aucun site disponible</div>
              ) : (
                <div className="space-y-3.5">
                  {siteBars.map((s, idx) => {
                    const widthPct = Math.min(100, Math.round((s.ca / maxSiteVal) * 100));
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-bold truncate max-w-[140px] ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {s.name}
                          </span>
                          <span className={`font-mono text-[11px] font-bold ${s.rate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {s.rate > 0 ? `+${s.rate}%` : `${s.rate}%`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>CA: {fmt(s.ca)} F</span>
                          <span className={s.marge >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            Net: {fmt(s.marge)} F
                          </span>
                        </div>

                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              s.marge >= 0 ? 'bg-indigo-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.max(3, widthPct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── 3. CONTRIBUTION PAR SECTEUR AU RÉSULTAT GLOBAL ────────────── */}
            <div
              className={`rounded-xl p-4 border ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  3. Contribution des Secteurs au CA
                </span>
                <span className="text-[10px] text-slate-400">Répartition %</span>
              </div>

              {sectorList.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">Aucun secteur actif</div>
              ) : (
                <div className="space-y-2.5">
                  {sectorList.slice(0, 5).map((sec, idx) => {
                    const sharePct = Math.min(100, Math.round((sec.ca / totalSectorsCA) * 100));

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                            <span>{sec.icon}</span>
                            <span className={`font-semibold truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              {sec.name}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-bold text-emerald-500">
                            {sharePct}%
                          </span>
                        </div>

                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(2, sharePct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {sectorList.length > 5 && (
                    <div className="text-[10px] text-center text-slate-400 pt-1 italic">
                      + {sectorList.length - 5} autre(s) secteur(s)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
