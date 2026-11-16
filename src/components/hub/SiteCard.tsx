// =============================================================================
// GESTIO 229 SaaS — Carte Site d'Exploitation (Niveau 1 du Hub)
// =============================================================================
// Affiche tous les indicateurs clés du site calculés sur données réelles :
// - CA Jour, Mois, Année
// - Marge brute, Dépenses totales, Marge nette
// - Créances clients en attente
// - Taux de rentabilité (%) & indicateurs de classement
// =============================================================================

import React from 'react';
import {
  Building2,
  MapPin,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Layers,
  Clock,
  Calendar,
  AlertTriangle,
  Award,
  Sparkles,
  Pencil,
  Trash2,
  DollarSign,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { CompanySite, SiteFinancials } from '../../services/multisiteService';
import { formatNumber, formatFCFA } from '../../utils/formatters';

interface SiteCardProps {
  site: CompanySite;
  financials: SiteFinancials;
  darkMode: boolean;
  isAdmin: boolean;
  onViewDetail: (site: CompanySite) => void;
  onEditSite: (site: CompanySite) => void;
  onDeleteSite?: (site: CompanySite) => void;
}

export const SiteCard: React.FC<SiteCardProps> = ({
  site,
  financials,
  darkMode,
  isAdmin,
  onViewDetail,
  onEditSite,
  onDeleteSite,
}) => {
  const fmt = (n: number) => formatNumber(Math.round(n || 0));

  // Indicateur de performance visuelle (Vert / Rouge / Neutre)
  const isPositive = financials.monthNetMargin > 0;
  const isNegative = financials.monthNetMargin < 0;
  const isZero = financials.monthNetMargin === 0;

  // Détermination de la couleur de bordure et de rentabilité
  const rentabilityBadgeColor = isPositive
    ? darkMode
      ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : isNegative
    ? darkMode
      ? 'bg-rose-950/70 text-rose-400 border-rose-800'
      : 'bg-rose-50 text-rose-700 border-rose-200'
    : darkMode
    ? 'bg-slate-800 text-slate-400 border-slate-700'
    : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col justify-between shadow-lg transition-all duration-200 relative overflow-hidden border ${
        darkMode
          ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:shadow-emerald-950/20'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xl'
      }`}
    >
      {/* ── 1. EN-TÊTE DU SITE ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-base font-black uppercase tracking-tight truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {site.name}
              </h3>
              {site.is_main && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 uppercase tracking-wide">
                  Principal
                </span>
              )}
            </div>

            <div className={`text-xs flex items-center gap-1.5 mt-1 font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <MapPin size={13} className="text-emerald-500 shrink-0" />
              <span>{site.city || 'Bénin'}</span>
              {site.address && (
                <>
                  <span className="opacity-40">•</span>
                  <span className="truncate max-w-[150px]">{site.address}</span>
                </>
              )}
            </div>
          </div>

          {/* Badges de classement & rentabilité */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            {financials.isBestSite && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
                <Award size={11} /> Meilleur site
              </span>
            )}
            {financials.isMostProfitable && !financials.isBestSite && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Sparkles size={11} /> Plus rentable
              </span>
            )}
            {financials.isDeficit && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/30">
                <AlertTriangle size={11} /> Déficitaire
              </span>
            )}
            {financials.isInactive && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                Sans activité
              </span>
            )}

            {/* Taux de rentabilité */}
            <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border ${rentabilityBadgeColor}`}>
              {isPositive ? <TrendingUp size={12} /> : isNegative ? <TrendingDown size={12} /> : null}
              <span>Rentabilité : {financials.profitabilityRate > 0 ? `+${financials.profitabilityRate}%` : `${financials.profitabilityRate}%`}</span>
            </span>
          </div>
        </div>

        {/* Nombre de secteurs rattachés */}
        <div className={`text-xs mb-3.5 flex items-center justify-between pb-2.5 border-b ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-500">
            <Layers size={13} />
            <span>{financials.sectorsCount} secteur{financials.sectorsCount > 1 ? 's' : ''} d'activité rattaché{financials.sectorsCount > 1 ? 's' : ''}</span>
          </span>
          {site.manager && (
            <span className="text-[11px] truncate max-w-[150px]">
              Resp: <strong className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{site.manager}</strong>
            </span>
          )}
        </div>

        {/* ── 2. GRILLE DES CHIFFRES D'AFFAIRES (Jour / Mois / Annuel) ───── */}
        <div className={`rounded-xl p-3 mb-3 border ${darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50/80 border-slate-200/80'}`}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Chiffre d'affaires validé</span>
            <span className="text-[9px] font-normal lowercase">(F CFA)</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={`p-1.5 rounded-lg border ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
                <Clock size={10} /> Jour
              </div>
              <div className={`font-mono text-xs font-bold mt-0.5 truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {fmt(financials.dayRevenue)}
              </div>
            </div>

            <div className={`p-1.5 rounded-lg border ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="text-[10px] text-emerald-500 flex items-center justify-center gap-0.5 font-semibold">
                <Calendar size={10} /> Mois
              </div>
              <div className="font-mono text-xs font-black mt-0.5 truncate text-emerald-500">
                {fmt(financials.monthRevenue)}
              </div>
            </div>

            <div className={`p-1.5 rounded-lg border ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="text-[10px] text-indigo-400 flex items-center justify-center gap-0.5">
                Annuel
              </div>
              <div className={`font-mono text-xs font-bold mt-0.5 truncate ${darkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
                {fmt(financials.yearRevenue)}
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. MARGE BRUTE, DÉPENSES & MARGE NETTE ─────────────────────── */}
        <div className={`rounded-xl p-3 space-y-1.5 mb-3 border ${darkMode ? 'bg-slate-950/40 border-slate-800/60' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-xs">
            <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Marge brute (Mois) :</span>
            <span className={`font-mono font-bold ${financials.monthGrossMargin >= 0 ? (darkMode ? 'text-slate-200' : 'text-slate-800') : 'text-rose-500'}`}>
              {fmt(financials.monthGrossMargin)} F
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Dépenses totales (Mois) :</span>
            <span className="font-mono font-bold text-rose-500">
              {fmt(financials.monthExpenses)} F
            </span>
          </div>

          <div className={`flex items-center justify-between text-xs pt-1.5 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <span className={`font-bold ${isPositive ? 'text-emerald-500' : isNegative ? 'text-rose-500' : 'text-slate-400'}`}>
              Marge nette :
            </span>
            <span className={`font-mono font-black text-sm ${isPositive ? 'text-emerald-500' : isNegative ? 'text-rose-500' : darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {fmt(financials.monthNetMargin)} F CFA
            </span>
          </div>

          {/* Créances clients en attente */}
          {financials.creances > 0 && (
            <div className={`flex items-center justify-between text-[11px] pt-1 mt-1 border-t ${darkMode ? 'border-slate-800/60 text-amber-400/90' : 'border-slate-100 text-amber-700'}`}>
              <span className="flex items-center gap-1">
                <AlertCircle size={11} className="text-amber-500 shrink-0" />
                Créances en attente :
              </span>
              <span className="font-mono font-bold">
                {fmt(financials.creances)} F
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. ACTIONS DU SITE ─────────────────────────────────────────────── */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={() => onViewDetail(site)}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
        >
          <span>VOIR LE DÉTAIL</span>
          <ArrowRight size={15} />
        </button>

        {isAdmin && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onEditSite(site)}
              className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                darkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
            >
              <Pencil size={12} />
              <span>Modifier</span>
            </button>

            {onDeleteSite && financials.sectorsCount === 0 && (
              <button
                type="button"
                onClick={() => onDeleteSite(site)}
                title="Supprimer ce site vide"
                className={`py-1.5 px-2.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                  darkMode
                    ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/60'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                }`}
              >
                <Trash2 size={12} />
                <span>Supprimer</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
