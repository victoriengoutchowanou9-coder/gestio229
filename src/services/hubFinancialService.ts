// =============================================================================
// GESTIO 229 SaaS — Service Métriques Financières Consolidées Hub
// =============================================================================
// Règle d'or : Fuseau horaire Africa/Porto-Novo (Bénin UTC+1)
// - CA du jour : Ventes enregistrées STRICTEMENT à la date du jour (Cotonou)
// - Dépenses du jour : Dépenses de fonctionnement de la date du jour (hors trésorerie)
// - Marge brute du jour : CA net HT - COGS (Coût réel des marchandises vendues)
// - Marge nette du jour : Marge brute - Dépenses de fonctionnement du jour
// - Synthèse du mois : Cumul du 1er jour au dernier jour du mois en cours
// - INTERDICTION ABSOLUE : Ne jamais faire Marge = CA - Dépenses sans déduire le COGS !
// =============================================================================

import { supabase } from '../lib/supabase';
import {
  computeOrderMargin,
  isTrueOperatingExpense,
  safeNum,
} from '../lib/financialCalcul';
import { OFFICIAL_STATION_FUELS } from './stationFuelService';
import { getStatsToutesActivites } from '../lib/stats';

// ─────────────────────────────────────────────────────────────────────────────
// Interface des 6 indicateurs financiers spécifiques au secteur Station-Service
// ─────────────────────────────────────────────────────────────────────────────
export interface StationSectorFinancials {
  /** 1. Marge brute des carburants (Essence Super + Gasoil + Pétrole lampant) */
  margeBruteCarburants: number;
  /** 2. Marge brute des ventes générales et lubrifiants */
  margeBruteGeneraleLubrifiants: number;
  /** 3. Marge brute globale (carburants + lubrifiants/général) */
  margeBruteGlobale: number;
  /** 4. Chiffre d'affaires global TTC (carburants + lubrifiants + boutique) */
  caGlobal: number;
  /** 4b. Chiffre d'affaires global HT */
  caGlobalHT: number;
  /** 5. Dépenses globales d'exploitation validées */
  depensesGlobales: number;
  /** 6. Marge nette globale (Marge brute globale - Dépenses globales) */
  margeNetteGlobale: number;
  /** CA carburants TTC */
  caCarburantsTTC: number;
  /** CA carburants HT */
  caCarburantsHT: number;
  /** CA lubrifiants/général TTC */
  caLubrifiantsGeneralTTC: number;
  /** CA lubrifiants/général HT */
  caLubrifiantsGeneralHT: number;
}

export interface SectorMetrics {
  sector_slug: string;
  dayRevenue: number;     // CA DU JOUR (TTC)
  dayRevenueHT: number;   // CA DU JOUR (HT)
  dayCogsHT: number;      // COÛT D'ACHAT DES VENTES DU JOUR
  dayGrossMargin: number; // MARGE BRUTE DU JOUR
  dayExpenses: number;    // DÉPENSES D'EXPLOITATION DU JOUR
  dayNetMargin: number;   // MARGE NETTE DU JOUR (Marge brute - Dépenses)
  monthRevenue: number;   // CA DU MOIS (TTC)
  monthRevenueHT: number; // CA DU MOIS (HT)
  monthCogsHT: number;    // COÛT D'ACHAT DES VENTES DU MOIS
  monthGrossMargin: number; // MARGE BRUTE DU MOIS
  monthExpenses: number;  // DÉPENSES D'EXPLOITATION DU MOIS
  monthNetMargin: number; // MARGE NETTE DU MOIS (Marge brute - Dépenses)
  hasKnownCost: boolean;
  totalRevenue?: number;  // CA CUMULÉ GLOBAL DU SECTEUR (TTC)
  totalRevenueHT?: number;
  totalCogsHT?: number;
  totalGrossMargin?: number;
  totalExpenses?: number; // DÉPENSES CUMULÉES GLOBALES DU SECTEUR
  totalNetMargin?: number;
  /** Indicateurs financiers dédiés au secteur Station-Service (6 KPI) */
  stationFinancials?: StationSectorFinancials;
}

export interface HubFinancialTotals {
  date: string;
  ca_jour: number;
  ca_jour_ht?: number;
  cogs_jour_ht?: number;
  marge_brute_jour?: number;
  depenses_jour: number;
  marge_jour: number; // Marge nette du jour
  ca_mois: number;
  ca_mois_ht?: number;
  cogs_mois_ht?: number;
  marge_brute_mois?: number;
  depenses_mois: number;
  marge_mois: number; // Marge nette du mois (Marge brute - Dépenses)
  mois_debut: string;
  mois_fin: string;
  taux_marge_nette_mois?: number;
}

export interface HubFinancialResult {
  totals: HubFinancialTotals;
  sectors: Record<string, SectorMetrics>;
}

/**
 * Calcule les dates au format YYYY-MM-DD pour le fuseau horaire Africa/Porto-Novo
 */
export function getCotonouDates(baseDate?: Date | string): {
  todayStr: string;
  monthStartStr: string;
  monthEndStr: string;
  monthStartIso: string;
  monthEndIso: string;
  todayStartIso: string;
  todayEndIso: string;
  todayFormatted: string;
  monthFormatted: string;
} {
  const d = baseDate ? new Date(baseDate) : new Date();

  // Date du jour en YYYY-MM-DD selon Africa/Porto-Novo (UTC+1 permanent)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Porto-Novo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

  const [yearStr, monthStr, dayStr] = todayStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 1er jour du mois à 00:00:00 (Cotonou, UTC+1)
  const monthStartStr = `${yearStr}-${monthStr}-01`;
  const monthStartIso = `${yearStr}-${monthStr}-01T00:00:00.000+01:00`;

  // Dernier jour du mois à 23:59:59.999 (Cotonou, UTC+1)
  const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = String(lastDayNum).padStart(2, '0');
  const monthEndStr = `${yearStr}-${monthStr}-${lastDayStr}`;
  const monthEndIso = `${yearStr}-${monthStr}-${lastDayStr}T23:59:59.999+01:00`;

  // Bornes du jour en cours (Cotonou, UTC+1)
  const todayStartIso = `${todayStr}T00:00:00.000+01:00`;
  const todayEndIso = `${todayStr}T23:59:59.999+01:00`;

  // Mois calendaire en cours (1er jour du mois à aujourd'hui) - suppression stricte des 30j glissants
  const oneMonthAgoStr = monthStartStr;
  const effectiveMonthStart = monthStartStr;

  const todayFormatted = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Porto-Novo',
  }).format(d);

  const monthFormatted = (() => {
    try {
      const label = new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Porto-Novo',
      }).format(d);
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch {
      return 'Mois en cours';
    }
  })();

  return {
    todayStr,
    monthStartStr,
    monthEndStr,
    oneMonthAgoStr,
    effectiveMonthStart,
    monthStartIso,
    monthEndIso,
    todayStartIso,
    todayEndIso,
    todayFormatted,
    monthFormatted,
  };
}

/**
 * Extrait la date Cotonou (YYYY-MM-DD) depuis une date ou un timestamp UTC
 */
export function extractCotonouDate(rawDate?: string | null, rawTimestamp?: string | null): string {
  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }
  const source = rawDate || rawTimestamp;
  if (!source) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Porto-Novo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(source));
  } catch {
    return source.slice(0, 10);
  }
}

/**
 * Charge les métriques réelles consolidées du HUB (du jour et du mois) avec filtrage strict par date.
 * Unifié à 100% avec le moteur unique de stats (lib/stats.ts).
 */
export async function fetchHubFinancialMetrics(
  companyId: string,
  targetDateStr?: string
): Promise<HubFinancialResult> {
  const { todayStr, monthStartStr, monthEndStr } = getCotonouDates(targetDateStr);

  const [monthStatsMap, dayStatsMap] = await Promise.all([
    getStatsToutesActivites(companyId, monthStartStr, todayStr),
    getStatsToutesActivites(companyId, todayStr, todayStr),
  ]);

  const sectorsMap: Record<string, SectorMetrics> = {};
  let totalCaJour = 0;
  let totalDepJour = 0;
  let totalMargeJour = 0;
  let totalCaMois = 0;
  let totalDepMois = 0;
  let totalMargeMois = 0;

  const allSlugs = new Set([...Object.keys(monthStatsMap), ...Object.keys(dayStatsMap)]);

  for (const slug of allSlugs) {
    const m = monthStatsMap[slug] || {
      caNet: 0,
      caBrut: 0,
      cogs: 0,
      margeBrute: 0,
      depenses: 0,
      margeNette: 0,
    };
    const d = dayStatsMap[slug] || {
      caNet: 0,
      caBrut: 0,
      cogs: 0,
      margeBrute: 0,
      depenses: 0,
      margeNette: 0,
    };

    sectorsMap[slug] = {
      sector_slug: slug,
      dayRevenue: d.caNet,
      dayRevenueHT: d.caNet,
      dayCogsHT: d.cogs,
      dayGrossMargin: d.margeBrute,
      dayExpenses: d.depenses,
      dayNetMargin: d.margeNette,
      monthRevenue: m.caNet,
      monthRevenueHT: m.caNet,
      monthCogsHT: m.cogs,
      monthGrossMargin: m.margeBrute,
      monthExpenses: m.depenses,
      monthNetMargin: m.margeNette,
      totalRevenue: m.caNet,
      totalRevenueHT: m.caNet,
      totalCogsHT: m.cogs,
      totalGrossMargin: m.margeBrute,
      totalExpenses: m.depenses,
      totalNetMargin: m.margeNette,
      hasKnownCost: true,
      stationFinancials: m.stationFinancials,
    };

    totalCaJour += d.caNet;
    totalDepJour += d.depenses;
    totalMargeJour += d.margeNette;
    totalCaMois += m.caNet;
    totalDepMois += m.depenses;
    totalMargeMois += m.margeNette;
  }

  const totals: HubFinancialTotals = {
    date: todayStr,
    ca_jour: Math.round(totalCaJour * 100) / 100,
    depenses_jour: Math.round(totalDepJour * 100) / 100,
    marge_jour: Math.round(totalMargeJour * 100) / 100,
    ca_mois: Math.round(totalCaMois * 100) / 100,
    depenses_mois: Math.round(totalDepMois * 100) / 100,
    marge_mois: Math.round(totalMargeMois * 100) / 100,
    mois_debut: monthStartStr,
    mois_fin: monthEndStr,
    taux_marge_nette_mois: totalCaMois > 0 ? Math.round((totalMargeMois / totalCaMois) * 10000) / 100 : 0,
  };

  return {
    totals,
    sectors: sectorsMap,
  };
}
