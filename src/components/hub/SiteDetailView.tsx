// =============================================================================
// GESTIO 229 SaaS — Niveau 2 du Hub : Vue Détaillée d'un Site d'Exploitation
// =============================================================================
// Affiche :
// - En-tête du site avec localisation, responsable et sélecteur de période
// - 4 grands indicateurs financiers consolidés du site (CA, Marge brute, Dépenses, Marge nette)
// - Cartes des secteurs rattachés avec boutons OUVRIR, Paramètres, Déplacer, Supprimer
// - Action "+ Ajouter un secteur"
// =============================================================================

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  Plus,
  ExternalLink,
  Settings,
  ArrowRightLeft,
  Trash2,
  AlertCircle,
  Fuel,
  Droplets,
  Filter,
  CheckCircle,
} from 'lucide-react';
import { CompanySite, SiteFinancials } from '../../services/multisiteService';
import { SectorMetrics } from '../../services/hubFinancialService';
import { formatNumber, formatFCFA } from '../../utils/formatters';

export type PeriodFilterType = 'month' | 'year' | 'custom';

interface SiteDetailViewProps {
  site: CompanySite;
  companyName?: string;
  activities: any[];
  financials: SiteFinancials;
  sectorMetricsMap: Record<string, SectorMetrics>;
  darkMode: boolean;
  isAdmin: boolean;
  currentMonthLabel: string;
  onBack: () => void;
  onEditSite: (site: CompanySite) => void;
  onOpenSector: (activity: any) => void;
  onEditSectorSettings: (activity: any) => void;
  onMoveSector: (activity: any) => void;
  onDeleteSector: (activity: any) => void;
  onClearSector?: (activity: any) => void;
  onAddSectorToSite: () => void;
  // Filtrage par période personnalisée
  periodFilter: PeriodFilterType;
  onPeriodFilterChange: (period: PeriodFilterType) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomDateChange: (start: string, end: string) => void;
  customPeriodStats?: Record<string, any>;
}

export const SiteDetailView: React.FC<SiteDetailViewProps> = ({
  site,
  companyName,
  activities,
  financials,
  sectorMetricsMap,
  darkMode,
  isAdmin,
  currentMonthLabel,
  onBack,
  onEditSite,
  onOpenSector,
  onEditSectorSettings,
  onMoveSector,
  onDeleteSector,
  onClearSector,
  onAddSectorToSite,
  periodFilter,
  onPeriodFilterChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
  customPeriodStats,
}) => {
  const fmt = (n: number) => formatNumber(Math.round(n || 0));

  const [localStart, setLocalStart] = useState(customStartDate);
  const [localEnd, setLocalEnd] = useState(customEndDate);

  // Secteurs rattachés à ce site
  const siteActivities = useMemo(() => {
    return activities.filter((act) => {
      const sId = act.settings?.site_id || act.site_id;
      // Si l'activité a ce site_id, ou si l'activité n'a pas de site_id et que ce site est le principal
      if (sId) {
        return sId === site.id;
      }
      return site.is_main;
    });
  }, [activities, site.id, site.is_main]);

  // Indicateurs financiers du site selon la période sélectionnée
  const currentMetrics = useMemo(() => {
    if (periodFilter === 'year') {
      return {
        ca: financials.yearRevenue,
        margeBrute: financials.yearGrossMargin,
        depenses: financials.yearExpenses,
        margeNette: financials.yearNetMargin,
        label: "Cumul de l'année en cours",
      };
    }
    if (periodFilter === 'custom') {
      return {
        ca: financials.periodRevenue,
        margeBrute: financials.periodGrossMargin,
        depenses: financials.periodExpenses,
        margeNette: financials.periodNetMargin,
        label: `Période du ${localStart || customStartDate} au ${localEnd || customEndDate}`,
      };
    }
    // Par défaut : Ce mois
    return {
      ca: financials.monthRevenue,
      margeBrute: financials.monthGrossMargin,
      depenses: financials.monthExpenses,
      margeNette: financials.monthNetMargin,
      label: `Données du mois (${currentMonthLabel})`,
    };
  }, [periodFilter, financials, currentMonthLabel, localStart, localEnd, customStartDate, customEndDate]);

  const rentabilityPct =
    currentMetrics.ca > 0
      ? Math.round((currentMetrics.margeNette / currentMetrics.ca) * 10000) / 100
      : 0;

  const handleApplyCustomDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (localStart && localEnd) {
      onCustomDateChange(localStart, localEnd);
    }
  };

  return (
    <div className="w-full max-w-none space-y-8 animate-fade-in pb-16">
      {/* ── 1. BARRE DE RETOUR & EN-TÊTE DU SITE ───────────────────────────── */}
      <div
        className={`rounded-2xl p-6 border shadow-lg transition-all ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border shrink-0 ${
                darkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 shadow-sm'
              }`}
            >
              <ArrowLeft size={16} />
              <span>Retour aux sites</span>
            </button>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {site.name}
                </h1>
                {site.is_main && (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 uppercase tracking-wide">
                    Site Principal
                  </span>
                )}
              </div>

              <div className={`text-xs flex items-center gap-2 mt-1.5 flex-wrap ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="flex items-center gap-1 font-semibold text-emerald-500">
                  <MapPin size={13} />
                  <span>{site.city || 'Bénin'}</span>
                </span>
                {site.address && (
                  <>
                    <span>•</span>
                    <span>{site.address}</span>
                  </>
                )}
                {site.manager && (
                  <>
                    <span>•</span>
                    <span>Responsable : <strong className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{site.manager}</strong></span>
                  </>
                )}
                {site.phone && (
                  <>
                    <span>•</span>
                    <span>Tél : {site.phone}</span>
                  </>
                )}
                <span>•</span>
                <span className="font-bold text-emerald-500">
                  {siteActivities.length} secteur{siteActivities.length > 1 ? 's' : ''} rattaché{siteActivities.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Bouton modifier site */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onEditSite(site)}
              className={`self-start md:self-auto px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border shrink-0 ${
                darkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 shadow-sm'
              }`}
            >
              <Settings size={14} />
              <span>Paramètres du site</span>
            </button>
          )}
        </div>

        {/* ── SÉLECTEUR DE PÉRIODE (Ce mois / Cette année / Personnalisée) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl border bg-slate-100 dark:bg-slate-950 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onPeriodFilterChange('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodFilter === 'month'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : darkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ce mois
            </button>
            <button
              type="button"
              onClick={() => onPeriodFilterChange('year')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodFilter === 'year'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : darkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cette année
            </button>
            <button
              type="button"
              onClick={() => onPeriodFilterChange('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodFilter === 'custom'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : darkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Personnalisée
            </button>
          </div>

          {/* Formulaire dates personnalisées */}
          {periodFilter === 'custom' && (
            <form onSubmit={handleApplyCustomDate} className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs border ${
                  darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
              />
              <span className="text-xs text-slate-400">à</span>
              <input
                type="date"
                value={localEnd}
                onChange={(e) => setLocalEnd(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs border ${
                  darkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm"
              >
                Appliquer
              </button>
            </form>
          )}

          <div className="text-xs font-semibold text-slate-400 italic">
            {currentMetrics.label}
          </div>
        </div>
      </div>

      {/* ── 2. QUATRE GRANDS INDICATEURS DU SITE ───────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Indicateurs Financiers Consolidés du Site
          </h2>
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
            currentMetrics.margeNette >= 0
              ? darkMode ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : darkMode ? 'bg-rose-950/60 text-rose-400 border-rose-800' : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            Taux de marge : {rentabilityPct > 0 ? `+${rentabilityPct}%` : `${rentabilityPct}%`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. CA TOTAL DU SITE */}
          <div
            className={`rounded-2xl p-5 border shadow-md relative overflow-hidden ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                1. Chiffre d'Affaires Total
              </span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <DollarSign size={16} />
              </span>
            </div>
            <div className={`text-2xl font-black font-mono tracking-tight mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {fmt(currentMetrics.ca)} <span className="text-xs font-normal text-slate-400">F CFA</span>
            </div>
            <p className={`text-[10px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Ventes validées (avoirs déduits)
            </p>
          </div>

          {/* 2. MARGE BRUTE TOTALE */}
          <div
            className={`rounded-2xl p-5 border shadow-md relative overflow-hidden ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                2. Marge Brute Totale
              </span>
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                <TrendingUp size={16} />
              </span>
            </div>
            <div className={`text-2xl font-black font-mono tracking-tight mt-1 ${
              currentMetrics.margeBrute >= 0 ? (darkMode ? 'text-indigo-300' : 'text-indigo-700') : 'text-rose-500'
            }`}>
              {fmt(currentMetrics.margeBrute)} <span className="text-xs font-normal text-slate-400">F CFA</span>
            </div>
            <p className={`text-[10px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              CA Net HT déduit du coût réel d'achat (COGS)
            </p>
          </div>

          {/* 3. DÉPENSES TOTALES DU SITE */}
          <div
            className={`rounded-2xl p-5 border shadow-md relative overflow-hidden ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                3. Dépenses Totales
              </span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                <TrendingDown size={16} />
              </span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight mt-1 text-rose-500">
              {fmt(currentMetrics.depenses)} <span className="text-xs font-normal text-slate-400">F CFA</span>
            </div>
            <p className={`text-[10px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Charges d'exploitation validées
            </p>
          </div>

          {/* 4. MARGE NETTE TOTALE */}
          <div
            className={`rounded-2xl p-5 border shadow-md relative overflow-hidden ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                4. Marge Nette Totale
              </span>
              <span className={`p-2 rounded-xl ${currentMetrics.margeNette >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                <CheckCircle size={16} />
              </span>
            </div>
            <div className={`text-2xl font-black font-mono tracking-tight mt-1 ${
              currentMetrics.margeNette >= 0 ? 'text-emerald-500' : 'text-rose-500'
            }`}>
              {fmt(currentMetrics.margeNette)} <span className="text-xs font-normal text-slate-400">F CFA</span>
            </div>
            <p className={`text-[10px] mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Marge brute déduite des charges ({currentMetrics.margeNette < 0 ? 'Déficit' : 'Bénéfice'})
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. LISTE DES SECTEURS RATTACHÉS À CE SITE ───────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h2 className={`text-base font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Secteurs d'Activité Rattachés au Site
            </h2>
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Chaque secteur dispose de son environnement autonome et de ses actions dédiées.
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={onAddSectorToSite}
              className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
            >
              <Plus size={15} />
              <span>+ Ajouter un secteur</span>
            </button>
          )}
        </div>

        {siteActivities.length === 0 ? (
          <div
            className={`rounded-2xl p-10 border text-center space-y-3 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 w-16 h-16 mx-auto flex items-center justify-center">
              <Layers size={30} />
            </div>
            <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Aucun secteur rattaché à ce site
            </h3>
            <p className={`text-xs max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Vous pouvez rattacher un secteur existant depuis un autre site ou en créer un nouveau pour commencer à exploiter ce site.
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={onAddSectorToSite}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={14} />
                <span>Rattacher un secteur</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {siteActivities.map((act) => {
              const normSlug = (act.sectorSlug || '').toLowerCase().replace(/^sec-/, '').trim();
              const isStation = normSlug === 'station-service' || normSlug === 'station';
              const cardMetric = sectorMetricsMap[normSlug] || sectorMetricsMap[act.sectorSlug];
              const sf = cardMetric?.stationFinancials || act.stationFinancials;

              // Métriques selon filtre de période
              let caVal = cardMetric?.monthRevenue ?? act.monthRevenue ?? act.revenue ?? 0;
              let cogsVal = cardMetric?.monthCogsHT ?? 0;
              let depVal = cardMetric?.monthExpenses ?? act.monthExpenses ?? act.expenses ?? 0;
              let margeBruteVal = cardMetric?.monthGrossMargin ?? (caVal - cogsVal);
              let netVal = cardMetric?.monthNetMargin ?? (margeBruteVal - depVal);

              if (periodFilter === 'year') {
                caVal = cardMetric?.yearRevenue ?? caVal;
                cogsVal = cardMetric?.yearCogsHT ?? cogsVal;
                depVal = cardMetric?.yearExpenses ?? depVal;
                margeBruteVal = cardMetric?.yearGrossMargin ?? margeBruteVal;
                netVal = cardMetric?.yearNetMargin ?? netVal;
              } else if (periodFilter === 'custom' && customPeriodStats) {
                const pStat = customPeriodStats[normSlug] || customPeriodStats[act.id] || customPeriodStats[act.sectorSlug];
                if (pStat) {
                  caVal = pStat.caNet;
                  cogsVal = pStat.cogs;
                  depVal = pStat.depenses;
                  margeBruteVal = pStat.margeBrute;
                  netVal = pStat.margeNette;
                }
              }

              const secProfitability = caVal > 0 ? Math.round((netVal / caVal) * 10000) / 100 : 0;
              const isSecPositive = netVal > 0;
              const isSecNegative = netVal < 0;

              return (
                <div
                  key={act.id}
                  className={`rounded-2xl p-5 flex flex-col justify-between shadow-lg transition-all duration-200 border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* En-tête secteur */}
                  <div>
                    <div className="flex items-start justify-between gap-2.5 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{act.sectorIcon || '🏢'}</span>
                          <h4 className={`text-sm font-black uppercase tracking-tight truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {act.name}
                          </h4>
                        </div>
                        <div className={`text-[11px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {companyName || 'Mon Entreprise'} • {act.sectorLabel || normSlug}
                        </div>
                      </div>

                      {/* Statut & badge rentabilité */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          act.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        }`}>
                          {act.status || 'ACTIVE'}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          isSecPositive
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : isSecNegative
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                            : darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {secProfitability > 0 ? `+${secProfitability}%` : `${secProfitability}%`}
                        </span>
                      </div>
                    </div>

                    {/* Bloc financier secteur */}
                    {isStation && sf ? (
                      /* Station-Service 6 KPIs */
                      <div className={`rounded-xl p-3 space-y-1.5 my-3 border ${
                        darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1 pb-1 border-b dark:border-slate-800 border-slate-200">
                          <Fuel size={12} /> Station-Service Spécifique
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Marge carburants :</span>
                          <span className="font-mono font-bold text-amber-500">{fmt(sf.margeBruteCarburants)} F</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Marge lubrifiants :</span>
                          <span className="font-mono font-bold text-blue-500">{fmt(sf.margeBruteGeneraleLubrifiants)} F</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>CA global :</span>
                          <span className={`font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(sf.caGlobal)} F</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Dépenses :</span>
                          <span className="font-mono font-bold text-rose-500">{fmt(sf.depensesGlobales)} F</span>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 border-t dark:border-slate-800 border-slate-200">
                          <span className="font-bold text-emerald-500">Marge nette :</span>
                          <span className="font-mono font-black text-emerald-500">{fmt(sf.margeNetteGlobale)} F</span>
                        </div>
                      </div>
                    ) : (
                      /* Standard secteur */
                      <div className={`rounded-xl p-3 space-y-1.5 my-3 border ${
                        darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Chiffre d'affaires :</span>
                          <span className={`font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(caVal)} F</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Marge brute :</span>
                          <span className={`font-mono font-bold ${margeBruteVal >= 0 ? (darkMode ? 'text-slate-200' : 'text-slate-800') : 'text-rose-500'}`}>
                            {fmt(margeBruteVal)} F
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Dépenses :</span>
                          <span className="font-mono font-bold text-rose-500">{fmt(depVal)} F</span>
                        </div>
                        <div className={`flex items-center justify-between text-xs pt-1 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                          <span className={`font-bold ${isSecPositive ? 'text-emerald-500' : isSecNegative ? 'text-rose-500' : 'text-slate-400'}`}>
                            Marge nette :
                          </span>
                          <span className={`font-mono font-black ${isSecPositive ? 'text-emerald-500' : isSecNegative ? 'text-rose-500' : darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {fmt(netVal)} F CFA
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions du secteur (OUVRIR, Paramètres, Déplacer, Supprimer) */}
                  <div className="space-y-2 pt-2">
                    {/* OUVRIR / ACCÉDER (Niveau 3) */}
                    <button
                      type="button"
                      onClick={() => onOpenSector(act)}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
                    >
                      <span>OUVRIR / ACCÉDER</span>
                      <ExternalLink size={14} />
                    </button>

                    {isAdmin && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditSectorSettings(act)}
                          title="Paramètres de ce secteur"
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors border ${
                            darkMode
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          }`}
                        >
                          <Settings size={12} />
                          <span>Régler</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onMoveSector(act)}
                          title="Déplacer vers un autre site"
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors border ${
                            darkMode
                              ? 'bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border-indigo-800/60'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                          }`}
                        >
                          <ArrowRightLeft size={12} />
                          <span>Déplacer</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteSector(act)}
                          title="Supprimer ou archiver ce secteur"
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors border ${
                            darkMode
                              ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/60'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                          }`}
                        >
                          <Trash2 size={12} />
                          <span>Suppr.</span>
                        </button>

                        {onClearSector && (
                          <button
                            type="button"
                            onClick={() => onClearSector(act)}
                            title={`Vider les données opérationnelles du secteur ${act.name}`}
                            className={`col-span-2 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all border ${
                              darkMode
                                ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-700/50'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
                            }`}
                          >
                            <Trash2 size={12} className="text-amber-600 dark:text-amber-400" />
                            <span>Vider le secteur</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
