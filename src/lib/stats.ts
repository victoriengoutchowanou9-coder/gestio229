// =============================================================================
// GESTIO 229 SaaS — Moteur Unique et Universel des Statistiques d'Activité
// =============================================================================
// SOURCE DE VÉRITÉ UNIQUE PARTAGÉE PAR :
// 1. La Carte Activité sur le HUB CENTRAL (MultiservicesHub)
// 2. La page Rapports & Analyses (ReportingPage)
//
// RÈGLES DE CALCUL STRICTES (Bénin & UEMOA) :
// - Fuseau horaire : Africa/Porto-Novo (UTC+1 permanent)
// - Période par défaut : Mois calendaire en cours (du 1er jour 00:00:00 à aujourd'hui 23:59:59)
// - AUCUNE fenêtre glissante de 30 jours !
// - CA = SUM(total_amount) des ventes validées (statut != 'annulée').
//   Avoirs validés déduits : CA Net = CA Brut - Avoirs.
// - Date des ventes : Priorité stricte à `date_vente` (ou `order_date`), jamais created_at brut.
// - Dépenses = SUM(montant) des charges d'exploitation décaissées/validées (hors mouvements de trésorerie/clôtures).
// - Date des dépenses : Priorité stricte à `date_depense` (ou `expense_date`), jamais created_at brut.
// - COGS = SUM(quantité * coût_achat) des lignes de vente de la période.
// - Marge brute = CA Net - COGS
// - Marge nette = Marge brute - Dépenses
// - Si aucune donnée sur la période : RETOURNE STRICTEMENT 0 (jamais de report du mois précédent).
// =============================================================================

import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';
import { canonicalSectorSlug, isItemInSector } from './sectorClient';
import {
  computeOrderCOGS,
  computeOrderMargin,
  isTrueOperatingExpense,
  safeNum,
} from './financialCalcul';
import { getAllAvoirs, FactureAvoirRecord } from '../services/factureAvoirService';
import { OFFICIAL_STATION_FUELS } from '../services/stationFuelService';

export interface StationSectorFinancials {
  margeBruteCarburants: number;
  margeBruteGeneraleLubrifiants: number;
  margeBruteGlobale: number;
  caGlobal: number;
  caGlobalHT: number;
  depensesGlobales: number;
  margeNetteGlobale: number;
  caCarburantsTTC: number;
  caCarburantsHT: number;
  caLubrifiantsGeneralTTC: number;
  caLubrifiantsGeneralHT: number;
}

export interface ActivityStats {
  siteId?: string;
  activityId?: string;
  sectorSlug: string;
  dateDebut: string;
  dateFin: string;
  caBrut: number;
  avoirs: number;
  caNet: number;
  cogs: number;
  margeBrute: number;
  depenses: number;
  margeNette: number;
  salesCount: number;
  expensesCount: number;
  sales: any[];
  expenses: any[];
  avoirsList: FactureAvoirRecord[];
  stationFinancials?: StationSectorFinancials;
  // Aliases de compatibilité pour les composants existants
  totalRevenue: number;
  totalRevenueBrut: number;
  totalRevenueNet: number;
  totalExpenses: number;
  totalCogsHT: number;
  grossMargin: number;
  netMargin: number;
  totalAvoirsValides: number;
}

/**
 * Extrait la date Cotonou (YYYY-MM-DD) depuis une chaîne date ou timestamp UTC
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
    return String(source).slice(0, 10);
  }
}

/**
 * Retourne les bornes par défaut du mois calendaire en cours (Cotonou, Bénin UTC+1)
 * - dateDebut = 1er jour du mois à 00:00:00 (YYYY-MM-01)
 * - dateFin = aujourd'hui à 23:59:59 (YYYY-MM-DD)
 */
export function getDefaultMonthPeriod(baseDate?: Date | string): {
  dateDebut: string;
  dateFin: string;
  monthStartStr: string;
  todayStr: string;
  currentMonthLabel: string;
} {
  const d = baseDate ? new Date(baseDate) : new Date();

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Porto-Novo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

  const [yearStr, monthStr] = todayStr.split('-');
  const monthStartStr = `${yearStr}-${monthStr}-01`;

  let currentMonthLabel = 'Mois en cours';
  try {
    const raw = new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Porto-Novo',
    }).format(d);
    currentMonthLabel = raw.toLowerCase(); // ex: "novembre 2026"
  } catch (_) {}

  return {
    dateDebut: monthStartStr,
    dateFin: todayStr,
    monthStartStr,
    todayStr,
    currentMonthLabel,
  };
}

/**
 * Normalise un identifiant d'activité ou un slug sectoriel
 */
export function resolveSectorSlug(siteIdOrSlug?: string): string {
  if (!siteIdOrSlug) return '';
  let s = siteIdOrSlug.toLowerCase().trim();
  if (s.startsWith('act-')) {
    const parts = s.split('-');
    s = parts.slice(2).join('-');
  }
  s = s.replace(/^sec-/, '');
  return canonicalSectorSlug(s) || s;
}

/**
 * Vérifie si un élément appartient à un site/activité/secteur donné
 */
function itemMatchesSite(item: any, siteId: string, sectorSlug: string): boolean {
  if (!item) return false;
  // Match direct par identifiant site_id / activite_id / activity_id
  if (
    siteId &&
    (item.site_id === siteId ||
      item.activite_id === siteId ||
      item.activity_id === siteId ||
      item.id === siteId)
  ) {
    return true;
  }
  // Match par secteur
  if (sectorSlug) {
    return isItemInSector(item, sectorSlug);
  }
  return true;
}

interface RawCompanyData {
  sales: any[];
  expenses: any[];
  avoirs: FactureAvoirRecord[];
  products: any[];
}

/**
 * Charge les données brutes Supabase de l'entreprise (requête consolidée en parallèle)
 */
async function fetchCompanyRawData(companyId: string): Promise<RawCompanyData> {
  const salesPromise = supabase
    .from('sales_orders')
    .select(
      'id, order_number, order_date, created_at, total_amount, subtotal_ht, total_cost, tva_amount, aib_amount, status, payment_status, payment_method, sector_slug, notes, e_mecef_uid, customer_name, customer_id, customer:customers(id, name)'
    )
    .eq('company_id', companyId)
    .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")')
    .order('created_at', { ascending: false })
    .limit(1000);

  const expensesPromise = supabase
    .from('expenses')
    .select(
      'id, expense_number, title, beneficiary, notes, category, amount, payment_method, expense_date, created_at, sector_slug, sector_meta'
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);

  const caissePromise = supabase
    .from('caisse_mouvements')
    .select('id, montant, created_at, sector_slug, secteur_slug, sens, type, motif, user_name, caisse_id, source_id, source_module, statut')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);

  const avoirsPromise = getAllAvoirs(companyId).catch(() => []);

  const productsPromise = supabase
    .from('products')
    .select('id, name, code, selling_price, cost_price, is_active, sector_meta, sector_slug, tva_rate, is_taxable')
    .eq('company_id', companyId)
    .neq('is_active', false)
    .limit(500);

  const [salesRes, expRes, caisseRes, avoirsRes, prodRes] = await Promise.allSettled([
    salesPromise,
    expensesPromise,
    caissePromise,
    avoirsPromise,
    productsPromise,
  ]);

  const rawSales = salesRes.status === 'fulfilled' && salesRes.value?.data ? salesRes.value.data : [];
  const rawExpenses = expRes.status === 'fulfilled' && expRes.value?.data ? expRes.value.data : [];
  const rawCaisse = caisseRes.status === 'fulfilled' && caisseRes.value?.data ? caisseRes.value.data : [];
  const rawAvoirs = (avoirsRes.status === 'fulfilled' && Array.isArray(avoirsRes.value) ? avoirsRes.value : []) as FactureAvoirRecord[];
  const rawProducts = prodRes.status === 'fulfilled' && prodRes.value?.data ? prodRes.value.data : [];

  // Unification des dépenses sans doublons
  const unifiedExpenses: any[] = [];
  const processedExpenseIds = new Set<string>();

  rawExpenses.forEach((e: any) => {
    processedExpenseIds.add(String(e.id));
    unifiedExpenses.push({
      ...e,
      source: 'expenses',
      amount: safeNum(e.amount),
      date_depense: e.expense_date || e.date_depense,
    });
  });

  rawCaisse.forEach((m: any) => {
    if (m.source_id && processedExpenseIds.has(String(m.source_id))) return;
    if (processedExpenseIds.has(String(m.id))) return;

    if (!isTrueOperatingExpense({ ...m, description: m.motif })) return;

    // Exclusion si statut annulé
    const st = String(m.statut || '').toLowerCase().trim();
    if (st === 'annule' || st === 'annulée' || st === 'rejete' || st === 'refuse') return;

    processedExpenseIds.add(String(m.id));
    unifiedExpenses.push({
      ...m,
      id: m.id,
      amount: safeNum(m.montant),
      category: m.motif || 'Charge de caisse',
      title: m.motif,
      date_depense: (m as any).date_depense || extractCotonouDate(null, m.created_at),
      created_at: m.created_at,
      source: 'caisse_mouvements',
      status: 'Validé',
    });
  });

  return {
    sales: rawSales,
    expenses: unifiedExpenses,
    avoirs: rawAvoirs,
    products: rawProducts,
  };
}

/**
 * Calcule les statistiques d'une activité pour une période donnée à partir des données brutes
 */
function computeStatsForSector(
  siteId: string,
  sectorSlug: string,
  startStr: string,
  endStr: string,
  rawData: RawCompanyData
): ActivityStats {
  const normSlug = resolveSectorSlug(sectorSlug || siteId);

  // 1. Filtrer les ventes de la période
  const periodSales = rawData.sales.filter((s: any) => {
    // Statut validé (non annulé)
    const st = String(s.status || '').toLowerCase().trim();
    if (st === 'annule' || st === 'annulée' || st === 'cancelled' || st === 'canceled') {
      return false;
    }

    // Filtre d'appartenance à l'activité/site
    if (!itemMatchesSite(s, siteId, normSlug)) {
      return false;
    }

    // Date de vente : Priorité absolue à date_vente / order_date
    const saleDate = extractCotonouDate((s as any).date_vente || s.order_date, s.created_at);
    if (!saleDate) return false;

    return saleDate >= startStr && saleDate <= endStr;
  });

  // 2. Chiffre d'Affaires Brut & COGS
  let caBrut = 0;
  let totalCogs = 0;

  for (const s of periodSales) {
    const amt = safeNum(s.total_amount);
    caBrut += amt;
    const { cogsHT } = computeOrderCOGS(s);
    totalCogs += cogsHT;
  }

  // 3. Avoirs validés de la période
  const periodAvoirs = rawData.avoirs.filter((a: FactureAvoirRecord) => {
    if (a.statut === 'annule') return false;
    if (!itemMatchesSite(a, siteId, normSlug)) return false;

    const aDate = extractCotonouDate((a as any).date_avoir || (a as any).date_vente, (a as any).created_at);
    if (!aDate) return false;

    return aDate >= startStr && aDate <= endStr;
  });

  const totalAvoirs = periodAvoirs.reduce((sum, a) => sum + safeNum(a.montant_total_avoir), 0);

  // CA Net = CA Brut - Avoirs
  const caNet = Math.max(0, Math.round((caBrut - totalAvoirs) * 100) / 100);
  const roundedCogs = Math.round(totalCogs * 100) / 100;
  const margeBrute = Math.round((caNet - roundedCogs) * 100) / 100;

  // 4. Dépenses d'exploitation de la période
  const periodExpenses = rawData.expenses.filter((e: any) => {
    // Statut : exclure annulé / rejeté
    const st = String(e.status || e.statut || '').toLowerCase().trim();
    if (st === 'annule' || st === 'annulée' || st === 'rejete' || st === 'refuse' || st === 'draft') {
      return false;
    }

    if (!itemMatchesSite(e, siteId, normSlug)) {
      return false;
    }

    const expDate = extractCotonouDate((e as any).date_depense || e.expense_date, e.created_at);
    if (!expDate) return false;

    return expDate >= startStr && expDate <= endStr;
  });

  const totalExpenses = periodExpenses.reduce((sum, e) => sum + safeNum(e.amount), 0);
  const roundedExpenses = Math.round(totalExpenses * 100) / 100;

  // Marge nette = Marge brute - Dépenses
  const margeNette = Math.round((margeBrute - roundedExpenses) * 100) / 100;

  // 5. Calcul dédié Station-Service si applicable
  let stationFinancials: StationSectorFinancials | undefined;
  if (normSlug === 'station-service' || normSlug === 'station') {
    let fuelRevenueTTC = 0;
    let fuelRevenueHT = 0;
    let fuelCogsHT = 0;
    let generalRevenueTTC = 0;
    let generalRevenueHT = 0;
    let generalCogsHT = 0;

    const fuelKeywords = ['super', 'essence', 'gasoil', 'pétrole', 'petrole'];

    for (const item of periodSales) {
      const meta = item.metadata || {};
      const orderType = (item.order_type || '').toLowerCase();
      const produit = (meta.produit || '').toLowerCase();
      const notes = typeof item.notes === 'string' ? item.notes.toLowerCase() : '';

      const isFuel =
        meta.is_carburant === true ||
        orderType === 'carburant_distributeur' ||
        orderType === 'carburant' ||
        fuelKeywords.some((kw) => produit.includes(kw) || notes.includes(kw));

      const margin = computeOrderMargin(item);

      if (isFuel) {
        fuelRevenueTTC += margin.revenueTTC;
        fuelRevenueHT += margin.revenueHT;
        fuelCogsHT += margin.cogsHT;
      } else {
        generalRevenueTTC += margin.revenueTTC;
        generalRevenueHT += margin.revenueHT;
        generalCogsHT += margin.cogsHT;
      }
    }

    const margeBruteCarburants = Math.round((fuelRevenueHT - fuelCogsHT) * 100) / 100;
    const margeBruteGeneraleLubrifiants = Math.round((generalRevenueHT - generalCogsHT) * 100) / 100;
    const margeBruteGlobale = Math.round((margeBruteCarburants + margeBruteGeneraleLubrifiants) * 100) / 100;
    const caGlobal = Math.round((fuelRevenueTTC + generalRevenueTTC) * 100) / 100;
    const caGlobalHT = Math.round((fuelRevenueHT + generalRevenueHT) * 100) / 100;
    const depensesGlobales = roundedExpenses;
    const margeNetteGlobale = Math.round((margeBruteGlobale - depensesGlobales) * 100) / 100;

    stationFinancials = {
      margeBruteCarburants,
      margeBruteGeneraleLubrifiants,
      margeBruteGlobale,
      caGlobal,
      caGlobalHT,
      depensesGlobales,
      margeNetteGlobale,
      caCarburantsTTC: Math.round(fuelRevenueTTC * 100) / 100,
      caCarburantsHT: Math.round(fuelRevenueHT * 100) / 100,
      caLubrifiantsGeneralTTC: Math.round(generalRevenueTTC * 100) / 100,
      caLubrifiantsGeneralHT: Math.round(generalRevenueHT * 100) / 100,
    };
  }

  const roundedBrut = Math.round(caBrut * 100) / 100;
  const roundedAvoirs = Math.round(totalAvoirs * 100) / 100;

  return {
    siteId,
    activityId: siteId,
    sectorSlug: normSlug,
    dateDebut: startStr,
    dateFin: endStr,
    caBrut: roundedBrut,
    avoirs: roundedAvoirs,
    caNet,
    cogs: roundedCogs,
    margeBrute,
    depenses: roundedExpenses,
    margeNette,
    salesCount: periodSales.length,
    expensesCount: periodExpenses.length,
    sales: periodSales,
    expenses: periodExpenses,
    avoirsList: periodAvoirs,
    stationFinancials,
    // Aliases
    totalRevenue: caNet,
    totalRevenueBrut: roundedBrut,
    totalRevenueNet: caNet,
    totalExpenses: roundedExpenses,
    totalCogsHT: roundedCogs,
    grossMargin: margeBrute,
    netMargin: margeNette,
    totalAvoirsValides: roundedAvoirs,
  };
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * FONCTION UNIQUE & UNIVERSELLE : getStatsActivite
 * ═════════════════════════════════════════════════════════════════════════════
 * Utilisée OBLIGATOIREMENT par :
 * 1. La carte activité sur le HUB CENTRAL
 * 2. La page Rapports & Analyses
 *
 * @param siteId Identifiant de l'activité, site_id ou slug sectoriel (ex: 'poissonnerie')
 * @param dateDebut Date de début YYYY-MM-DD (ex: 2026-11-01)
 * @param dateFin Date de fin YYYY-MM-DD (ex: 2026-11-11)
 * @param companyId Identifiant de l'entreprise (optionnel si connecté)
 */
export async function getStatsActivite(
  siteId: string,
  dateDebut?: string,
  dateFin?: string,
  companyId?: string
): Promise<ActivityStats> {
  const compId = companyId || useAuthStore.getState().company?.id || '';
  const defPeriod = getDefaultMonthPeriod();
  const startStr = (dateDebut || defPeriod.dateDebut).slice(0, 10);
  const endStr = (dateFin || defPeriod.dateFin).slice(0, 10);
  const normSlug = resolveSectorSlug(siteId);

  if (!compId) {
    return computeStatsForSector(siteId, normSlug, startStr, endStr, {
      sales: [],
      expenses: [],
      avoirs: [],
      products: [],
    });
  }

  const rawData = await fetchCompanyRawData(compId);
  return computeStatsForSector(siteId, normSlug, startStr, endStr, rawData);
}

/**
 * Calcule les statistiques de TOUTES les activités d'une entreprise pour une période donnée.
 * Une seule passe réseau consolidée pour alimenter instantanément toutes les cartes du HUB.
 */
export async function getStatsToutesActivites(
  companyId: string,
  dateDebut?: string,
  dateFin?: string,
  activitiesList?: Array<{ id: string; sectorSlug: string }>
): Promise<Record<string, ActivityStats>> {
  const defPeriod = getDefaultMonthPeriod();
  const startStr = (dateDebut || defPeriod.dateDebut).slice(0, 10);
  const endStr = (dateFin || defPeriod.dateFin).slice(0, 10);

  if (!companyId) return {};

  const rawData = await fetchCompanyRawData(companyId);
  const result: Record<string, ActivityStats> = {};

  if (Array.isArray(activitiesList) && activitiesList.length > 0) {
    for (const act of activitiesList) {
      const normSlug = resolveSectorSlug(act.sectorSlug || act.id);
      const stats = computeStatsForSector(act.id, normSlug, startStr, endStr, rawData);
      result[normSlug] = stats;
      result[act.id] = stats;
      if (act.sectorSlug) result[act.sectorSlug] = stats;
    }
  } else {
    // Déduire automatiquement les secteurs présents dans les données
    const detectedSectors = new Set<string>();
    rawData.sales.forEach((s: any) => {
      const slug = (s.sector_slug || '').toLowerCase().replace(/^sec-/, '');
      if (slug) detectedSectors.add(slug);
    });
    rawData.expenses.forEach((e: any) => {
      const slug = (e.sector_slug || '').toLowerCase().replace(/^sec-/, '');
      if (slug) detectedSectors.add(slug);
    });

    for (const slug of detectedSectors) {
      const normSlug = resolveSectorSlug(slug);
      result[normSlug] = computeStatsForSector(normSlug, normSlug, startStr, endStr, rawData);
    }
  }

  return result;
}

export default {
  getStatsActivite,
  getStatsToutesActivites,
  getDefaultMonthPeriod,
  extractCotonouDate,
  resolveSectorSlug,
};
