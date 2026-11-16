// =============================================================================
// GESTIO 229 SaaS — Service Métriques Financières Consolidées Hub
// =============================================================================
// Règle d'or : Fuseau horaire Africa/Porto-Novo (Bénin UTC+1)
// - CA du jour : Ventes enregistrées STRICTEMENT à la date du jour (Cotonou)
// - Dépenses du jour : Dépenses de fonctionnement de la date du jour (hors trésorerie)
// - Marge brute du jour : CA net HT - COGS (Coût réel des marchandises vendues)
// - Marge nette du jour : Marge brute - Dépenses de fonctionnement du jour
// - Synthèse du mois : Cumul du 1er jour au dernier jour du mois en cours
// - Synthèse annuelle : Cumul du 1er janvier à aujourd'hui
// - Créances clients : Montants clients restants à recouvrer (ventes à crédit ou solde impayé)
// - INTERDICTION ABSOLUE : Ne jamais faire Marge = CA - Dépenses sans déduire le COGS !
// =============================================================================

import { supabase } from '../lib/supabase';
import {
  computeOrderMargin,
  isTrueOperatingExpense,
  safeNum,
} from '../lib/financialCalcul';
import { OFFICIAL_STATION_FUELS } from './stationFuelService';
import { getStatsToutesActivites, ActivityStats } from '../lib/stats';
import { CompanySite, SiteFinancials } from './multisiteService';

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
  // Métriques du Jour
  dayRevenue: number;     // CA DU JOUR (TTC)
  dayRevenueHT: number;   // CA DU JOUR (HT)
  dayCogsHT: number;      // COÛT D'ACHAT DES VENTES DU JOUR
  dayGrossMargin: number; // MARGE BRUTE DU JOUR
  dayExpenses: number;    // DÉPENSES D'EXPLOITATION DU JOUR
  dayNetMargin: number;   // MARGE NETTE DU JOUR (Marge brute - Dépenses)
  // Métriques du Mois
  monthRevenue: number;   // CA DU MOIS (TTC)
  monthRevenueHT: number; // CA DU MOIS (HT)
  monthCogsHT: number;    // COÛT D'ACHAT DES VENTES DU MOIS
  monthGrossMargin: number; // MARGE BRUTE DU MOIS
  monthExpenses: number;  // DÉPENSES D'EXPLOITATION DU MOIS
  monthNetMargin: number; // MARGE NETTE DU MOIS (Marge brute - Dépenses)
  // Métriques Annuelles
  yearRevenue: number;    // CA ANNUEL (TTC)
  yearRevenueHT: number;
  yearCogsHT: number;
  yearGrossMargin: number;
  yearExpenses: number;
  yearNetMargin: number;
  // Créances clients en attente
  creances: number;
  // Taux de rentabilité (%)
  profitabilityRate: number;
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
  // Du Jour
  ca_jour: number;
  ca_jour_ht?: number;
  cogs_jour_ht?: number;
  marge_brute_jour?: number;
  depenses_jour: number;
  marge_jour: number; // Marge nette du jour
  // Du Mois
  ca_mois: number;
  ca_mois_ht?: number;
  cogs_mois_ht?: number;
  marge_brute_mois?: number;
  depenses_mois: number;
  marge_mois: number; // Marge nette du mois (Marge brute - Dépenses)
  mois_debut: string;
  mois_fin: string;
  taux_marge_nette_mois?: number;
  // Annuel
  ca_annee: number;
  ca_annee_ht?: number;
  cogs_annee_ht?: number;
  marge_brute_annee?: number;
  depenses_annee: number;
  marge_annee: number;
  annee_debut: string;
  annee_fin: string;
  taux_marge_nette_annee?: number;
  // Créances totales
  creances_totales: number;
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
  yearStartStr: string;
  yearEndStr: string;
  monthStartIso: string;
  monthEndIso: string;
  todayStartIso: string;
  todayEndIso: string;
  todayFormatted: string;
  monthFormatted: string;
  yearFormatted: string;
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

  // Année civile en cours
  const yearStartStr = `${yearStr}-01-01`;
  const yearEndStr = `${yearStr}-12-31`;

  // Bornes du jour en cours (Cotonou, UTC+1)
  const todayStartIso = `${todayStr}T00:00:00.000+01:00`;
  const todayEndIso = `${todayStr}T23:59:59.999+01:00`;

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

  const yearFormatted = yearStr;

  return {
    todayStr,
    monthStartStr,
    monthEndStr,
    yearStartStr,
    yearEndStr,
    monthStartIso,
    monthEndIso,
    todayStartIso,
    todayEndIso,
    todayFormatted,
    monthFormatted,
    yearFormatted,
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
 * Calcule les créances clients en attente par secteur pour l'entreprise
 */
export async function fetchCompanyCreances(companyId: string): Promise<Record<string, number>> {
  const creancesMap: Record<string, number> = {};
  if (!companyId) return creancesMap;

  try {
    const { data: sales, error } = await supabase
      .from('sales_orders')
      .select('id, sector_slug, total_amount, paid_amount, credit_amount, payment_status, status')
      .eq('company_id', companyId)
      .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")');

    if (!error && Array.isArray(sales)) {
      sales.forEach((s: any) => {
        const slug = (s.sector_slug || '').toLowerCase().replace(/^sec-/, '').trim();
        const pStatus = (s.payment_status || '').toLowerCase();
        const isPendingCredit =
          pStatus === 'credit' ||
          pStatus === 'partiel' ||
          pStatus === 'unpaid' ||
          pStatus === 'en_attente' ||
          safeNum(s.credit_amount) > 0;

        if (isPendingCredit) {
          const creditAmt = safeNum(s.credit_amount);
          const remAmt = Math.max(0, safeNum(s.total_amount) - safeNum(s.paid_amount));
          const val = creditAmt > 0 ? creditAmt : remAmt;
          if (slug) {
            creancesMap[slug] = (creancesMap[slug] || 0) + val;
          }
        }
      });
    }
  } catch (err) {
    console.warn('[HubFinancial] Erreur calcul créances:', err);
  }

  return creancesMap;
}

/**
 * Charge les métriques réelles consolidées du HUB (jour, mois, année, créances)
 * Unifié à 100% avec le moteur unique de stats (lib/stats.ts).
 */
export async function fetchHubFinancialMetrics(
  companyId: string,
  targetDateStr?: string
): Promise<HubFinancialResult> {
  const { todayStr, monthStartStr, monthEndStr, yearStartStr, yearEndStr } = getCotonouDates(targetDateStr);

  const [monthStatsMap, dayStatsMap, yearStatsMap, creancesMap] = await Promise.all([
    getStatsToutesActivites(companyId, monthStartStr, todayStr),
    getStatsToutesActivites(companyId, todayStr, todayStr),
    getStatsToutesActivites(companyId, yearStartStr, todayStr),
    fetchCompanyCreances(companyId),
  ]);

  const sectorsMap: Record<string, SectorMetrics> = {};
  let totalCaJour = 0;
  let totalDepJour = 0;
  let totalMargeJour = 0;
  let totalMargeBruteJour = 0;

  let totalCaMois = 0;
  let totalDepMois = 0;
  let totalMargeMois = 0;
  let totalMargeBruteMois = 0;

  let totalCaAnnee = 0;
  let totalDepAnnee = 0;
  let totalMargeAnnee = 0;
  let totalMargeBruteAnnee = 0;

  let totalCreances = 0;

  const allSlugs = new Set([
    ...Object.keys(monthStatsMap),
    ...Object.keys(dayStatsMap),
    ...Object.keys(yearStatsMap),
    ...Object.keys(creancesMap),
  ]);

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
    const y = yearStatsMap[slug] || {
      caNet: 0,
      caBrut: 0,
      cogs: 0,
      margeBrute: 0,
      depenses: 0,
      margeNette: 0,
    };

    const secCreances = creancesMap[slug] || 0;
    const profitabilityRate = m.caNet > 0 ? Math.round((m.margeNette / m.caNet) * 10000) / 100 : 0;

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
      yearRevenue: y.caNet,
      yearRevenueHT: y.caNet,
      yearCogsHT: y.cogs,
      yearGrossMargin: y.margeBrute,
      yearExpenses: y.depenses,
      yearNetMargin: y.margeNette,
      creances: secCreances,
      profitabilityRate,
      totalRevenue: y.caNet,
      totalRevenueHT: y.caNet,
      totalCogsHT: y.cogs,
      totalGrossMargin: y.margeBrute,
      totalExpenses: y.depenses,
      totalNetMargin: y.margeNette,
      hasKnownCost: true,
      stationFinancials: (m as any).stationFinancials || (y as any).stationFinancials,
    };

    totalCaJour += d.caNet;
    totalDepJour += d.depenses;
    totalMargeJour += d.margeNette;
    totalMargeBruteJour += d.margeBrute;

    totalCaMois += m.caNet;
    totalDepMois += m.depenses;
    totalMargeMois += m.margeNette;
    totalMargeBruteMois += m.margeBrute;

    totalCaAnnee += y.caNet;
    totalDepAnnee += y.depenses;
    totalMargeAnnee += y.margeNette;
    totalMargeBruteAnnee += y.margeBrute;

    totalCreances += secCreances;
  }

  const totals: HubFinancialTotals = {
    date: todayStr,
    // Jour
    ca_jour: Math.round(totalCaJour * 100) / 100,
    marge_brute_jour: Math.round(totalMargeBruteJour * 100) / 100,
    depenses_jour: Math.round(totalDepJour * 100) / 100,
    marge_jour: Math.round(totalMargeJour * 100) / 100,
    // Mois
    ca_mois: Math.round(totalCaMois * 100) / 100,
    marge_brute_mois: Math.round(totalMargeBruteMois * 100) / 100,
    depenses_mois: Math.round(totalDepMois * 100) / 100,
    marge_mois: Math.round(totalMargeMois * 100) / 100,
    mois_debut: monthStartStr,
    mois_fin: monthEndStr,
    taux_marge_nette_mois: totalCaMois > 0 ? Math.round((totalMargeMois / totalCaMois) * 10000) / 100 : 0,
    // Année
    ca_annee: Math.round(totalCaAnnee * 100) / 100,
    marge_brute_annee: Math.round(totalMargeBruteAnnee * 100) / 100,
    depenses_annee: Math.round(totalDepAnnee * 100) / 100,
    marge_annee: Math.round(totalMargeAnnee * 100) / 100,
    annee_debut: yearStartStr,
    annee_fin: yearEndStr,
    taux_marge_nette_annee: totalCaAnnee > 0 ? Math.round((totalMargeAnnee / totalCaAnnee) * 10000) / 100 : 0,
    // Créances
    creances_totales: Math.round(totalCreances * 100) / 100,
  };

  return {
    totals,
    sectors: sectorsMap,
  };
}

/**
 * Charge les métriques d'une période personnalisée (pour le Niveau 2)
 */
export async function fetchCustomPeriodMetrics(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, ActivityStats>> {
  return await getStatsToutesActivites(companyId, startDate, endDate);
}

/**
 * Consolide les métriques financières d'un site à partir de ses secteurs rattachés
 */
export function computeSiteFinancials(
  site: CompanySite,
  siteActivities: any[],
  sectorMetricsMap: Record<string, SectorMetrics>,
  customPeriodStats?: Record<string, ActivityStats>
): SiteFinancials {
  let dayRevenue = 0;
  let dayGrossMargin = 0;
  let dayExpenses = 0;
  let dayNetMargin = 0;

  let monthRevenue = 0;
  let monthGrossMargin = 0;
  let monthExpenses = 0;
  let monthNetMargin = 0;

  let yearRevenue = 0;
  let yearGrossMargin = 0;
  let yearExpenses = 0;
  let yearNetMargin = 0;

  let periodRevenue = 0;
  let periodGrossMargin = 0;
  let periodExpenses = 0;
  let periodNetMargin = 0;

  let creances = 0;

  const validSectors = siteActivities.filter((a) => a.status !== 'ARCHIVEE');

  validSectors.forEach((act) => {
    const slug = (act.sectorSlug || '').toLowerCase().replace(/^sec-/, '').trim();
    const metric = sectorMetricsMap[slug] || sectorMetricsMap[act.sectorSlug];

    if (metric) {
      dayRevenue += metric.dayRevenue || 0;
      dayGrossMargin += metric.dayGrossMargin || 0;
      dayExpenses += metric.dayExpenses || 0;
      dayNetMargin += metric.dayNetMargin || 0;

      monthRevenue += metric.monthRevenue || 0;
      monthGrossMargin += metric.monthGrossMargin || 0;
      monthExpenses += metric.monthExpenses || 0;
      monthNetMargin += metric.monthNetMargin || 0;

      yearRevenue += metric.yearRevenue || 0;
      yearGrossMargin += metric.yearGrossMargin || 0;
      yearExpenses += metric.yearExpenses || 0;
      yearNetMargin += metric.yearNetMargin || 0;

      creances += metric.creances || 0;
    }

    // Période personnalisée si fournie
    if (customPeriodStats) {
      const pStat = customPeriodStats[slug] || customPeriodStats[act.id] || customPeriodStats[act.sectorSlug];
      if (pStat) {
        periodRevenue += pStat.caNet || 0;
        periodGrossMargin += pStat.margeBrute || 0;
        periodExpenses += pStat.depenses || 0;
        periodNetMargin += pStat.margeNette || 0;
      }
    } else {
      periodRevenue += metric?.monthRevenue || 0;
      periodGrossMargin += metric?.monthGrossMargin || 0;
      periodExpenses += metric?.monthExpenses || 0;
      periodNetMargin += metric?.monthNetMargin || 0;
    }
  });

  const profitabilityRate =
    monthRevenue > 0
      ? Math.round((monthNetMargin / monthRevenue) * 10000) / 100
      : yearRevenue > 0
      ? Math.round((yearNetMargin / yearRevenue) * 10000) / 100
      : 0;

  return {
    siteId: site.id,
    dayRevenue: Math.round(dayRevenue * 100) / 100,
    dayGrossMargin: Math.round(dayGrossMargin * 100) / 100,
    dayExpenses: Math.round(dayExpenses * 100) / 100,
    dayNetMargin: Math.round(dayNetMargin * 100) / 100,

    monthRevenue: Math.round(monthRevenue * 100) / 100,
    monthGrossMargin: Math.round(monthGrossMargin * 100) / 100,
    monthExpenses: Math.round(monthExpenses * 100) / 100,
    monthNetMargin: Math.round(monthNetMargin * 100) / 100,

    yearRevenue: Math.round(yearRevenue * 100) / 100,
    yearGrossMargin: Math.round(yearGrossMargin * 100) / 100,
    yearExpenses: Math.round(yearExpenses * 100) / 100,
    yearNetMargin: Math.round(yearNetMargin * 100) / 100,

    periodRevenue: Math.round(periodRevenue * 100) / 100,
    periodGrossMargin: Math.round(periodGrossMargin * 100) / 100,
    periodExpenses: Math.round(periodExpenses * 100) / 100,
    periodNetMargin: Math.round(periodNetMargin * 100) / 100,

    creances: Math.round(creances * 100) / 100,
    profitabilityRate,
    sectorsCount: validSectors.length,
    isDeficit: monthNetMargin < 0 || (monthRevenue === 0 && monthExpenses > 0),
    isInactive: monthRevenue === 0 && monthExpenses === 0 && dayRevenue === 0,
  };
}
