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
  todayFormatted: string;
  monthFormatted: string;
} {
  const d = baseDate ? new Date(baseDate) : new Date();

  // Date du jour en YYYY-MM-DD selon Africa/Porto-Novo
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Porto-Novo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

  const [yearStr, monthStr] = todayStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const monthStartStr = `${yearStr}-${monthStr}-01`;
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
  const monthEndStr = `${yearStr}-${monthStr}-${lastDay}`;

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
 * Charge les métriques réelles consolidées du HUB (du jour et du mois) avec filtrage strict par date
 */
export async function fetchHubFinancialMetrics(
  companyId: string,
  targetDateStr?: string
): Promise<HubFinancialResult> {
  const { todayStr, monthStartStr, monthEndStr } = getCotonouDates(targetDateStr);

  const sectorsMap: Record<string, SectorMetrics> = {};

  const initSector = (slug: string): SectorMetrics => {
    const clean = (slug || '').toLowerCase().trim().replace(/^sec-/, '');
    if (!sectorsMap[clean]) {
      sectorsMap[clean] = {
        sector_slug: clean,
        dayRevenue: 0,
        dayRevenueHT: 0,
        dayCogsHT: 0,
        dayGrossMargin: 0,
        dayExpenses: 0,
        dayNetMargin: 0,
        monthRevenue: 0,
        monthRevenueHT: 0,
        monthCogsHT: 0,
        monthGrossMargin: 0,
        monthExpenses: 0,
        monthNetMargin: 0,
        hasKnownCost: true,
      };
    }
    return sectorsMap[clean];
  };

  // 1. Tenter l'appel RPC et les requêtes Supabase en parallèle strict (< 800ms)
  let rpcTotals: HubFinancialTotals | null = null;
  const rpcPromise = Promise.race([
    supabase.rpc('fn_dashboard_hub', { p_company_id: companyId, p_date: todayStr }),
    new Promise<{ data: null; error: any }>((resolve) => setTimeout(() => resolve({ data: null, error: new Error('RPC timeout') }), 1200))
  ]);

  const salesPromise = supabase
    .from('sales_orders')
    .select('id, total_amount, subtotal_ht, total_cost, gross_margin, sector_slug, order_date, created_at, status, notes')
    .eq('company_id', companyId)
    .gte('created_at', monthStartStr)
    .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")')
    .order('created_at', { ascending: false })
    .limit(500);

  const depensesPromise = supabase
    .from('depenses')
    .select('id, montant, date_depense, created_at, secteur_id, categorie, description')
    .eq('company_id', companyId)
    .gte('created_at', monthStartStr)
    .order('created_at', { ascending: false })
    .limit(300);

  const [rpcRes, salesRes, depRes] = await Promise.allSettled([
    rpcPromise,
    salesPromise,
    depensesPromise
  ]);

  if (rpcRes.status === 'fulfilled' && rpcRes.value.data) {
    const rpcData = rpcRes.value.data as any;
    rpcTotals = {
      date: rpcData.date || todayStr,
      ca_jour: Number(rpcData.ca_jour) || 0,
      depenses_jour: Number(rpcData.depenses_jour) || 0,
      marge_jour: Number(rpcData.marge_jour) || 0,
      ca_mois: Number(rpcData.ca_mois) || 0,
      depenses_mois: Number(rpcData.depenses_mois) || 0,
      marge_mois: Number(rpcData.marge_mois) || 0,
      mois_debut: rpcData.mois_debut || monthStartStr,
      mois_fin: rpcData.mois_fin || monthEndStr,
    };
  }

  // 2. Traiter les ventes par secteur
  if (salesRes.status === 'fulfilled' && salesRes.value.data) {
    const salesList = salesRes.value.data;
    for (const item of salesList) {
      const itemDate = extractCotonouDate(item.order_date, item.created_at);
      if (!itemDate) continue;

      const isToday = itemDate === todayStr;
      const isThisMonth = itemDate >= monthStartStr && itemDate <= monthEndStr;

      if (!isToday && !isThisMonth) continue;

      const secSlug = (item.sector_slug || '').toLowerCase().trim().replace(/^sec-/, '') || 'brasserie';
      const card = initSector(secSlug);

      const orderMargin = computeOrderMargin(item);
      if (!orderMargin.hasKnownCost) {
        card.hasKnownCost = false;
      }

      if (isToday) {
        card.dayRevenue += orderMargin.revenueTTC;
        card.dayRevenueHT += orderMargin.revenueHT;
        card.dayCogsHT += orderMargin.cogsHT;
        card.dayGrossMargin += orderMargin.grossMargin;
      }

      if (isThisMonth) {
        card.monthRevenue += orderMargin.revenueTTC;
        card.monthRevenueHT += orderMargin.revenueHT;
        card.monthCogsHT += orderMargin.cogsHT;
        card.monthGrossMargin += orderMargin.grossMargin;
      }
    }
  }

  // 3. Traiter les dépenses par secteur
  try {
    const depList = depRes.status === 'fulfilled' ? depRes.value.data : null;

    // Récupérer la table secteurs pour mapper secteur_id UUID vers slug
    const { data: secList } = await supabase
      .from('secteurs')
      .select('id, slug')
      .eq('company_id', companyId);

    const uuidToSlug: Record<string, string> = {};
    if (secList) {
      secList.forEach((s) => {
        if (s.id && s.slug) uuidToSlug[s.id] = s.slug.toLowerCase().trim().replace(/^sec-/, '');
      });
    }

    if (depList && depList.length > 0) {
      for (const d of depList) {
        if (!isTrueOperatingExpense(d)) continue;

        const dDate = extractCotonouDate(d.date_depense, d.created_at);
        if (!dDate) continue;

        const isToday = dDate === todayStr;
        const isThisMonth = dDate >= monthStartStr && dDate <= monthEndStr;

        if (!isToday && !isThisMonth) continue;

        const montant = safeNum(d.montant);
        const targetSlug = (d.secteur_id && uuidToSlug[d.secteur_id]) || 'general';
        const card = initSector(targetSlug);

        if (isToday) {
          card.dayExpenses += montant;
        }

        if (isThisMonth) {
          card.monthExpenses += montant;
        }
      }
    } else {
      // ─── Fallback : lire caisse_mouvements (filtrage strict trésorerie & clôture) ───
      const { data: mvtList } = await supabase
        .from('caisse_mouvements')
        .select('id, montant, created_at, sector_slug, sens, type, caisse_id, motif')
        .eq('company_id', companyId)
        .gte('created_at', monthStartStr)
        .order('created_at', { ascending: false })
        .limit(500);

      if (mvtList && mvtList.length > 0) {
        for (const m of mvtList) {
          if (!isTrueOperatingExpense({
            ...m,
            description: m.motif,
          })) {
            continue;
          }

          const dDate = extractCotonouDate(null, m.created_at);
          if (!dDate) continue;

          const isToday = dDate === todayStr;
          const isThisMonth = dDate >= monthStartStr && dDate <= monthEndStr;
          if (!isToday && !isThisMonth) continue;

          const montant = safeNum(m.montant);
          const targetSlug = (m.sector_slug || '').toLowerCase().trim().replace(/^sec-/, '') || 'general';
          const card = initSector(targetSlug);

          if (isToday) {
            card.dayExpenses += montant;
          }
          if (isThisMonth) {
            card.monthExpenses += montant;
          }
        }
      }
    }
  } catch (dErr) {
    console.warn('[HubFinancialService] Erreur lecture depenses:', dErr);
  }

  // 4. Calculer la marge nette par secteur : Marge Nette = Marge Brute - Dépenses
  const sectorCards = Object.values(sectorsMap);
  for (const c of sectorCards) {
    c.dayRevenue = Math.round(c.dayRevenue * 100) / 100;
    c.dayRevenueHT = Math.round(c.dayRevenueHT * 100) / 100;
    c.dayCogsHT = Math.round(c.dayCogsHT * 100) / 100;
    c.dayGrossMargin = Math.round(c.dayGrossMargin * 100) / 100;
    c.dayExpenses = Math.round(c.dayExpenses * 100) / 100;
    c.dayNetMargin = Math.round((c.dayGrossMargin - c.dayExpenses) * 100) / 100;

    c.monthRevenue = Math.round(c.monthRevenue * 100) / 100;
    c.monthRevenueHT = Math.round(c.monthRevenueHT * 100) / 100;
    c.monthCogsHT = Math.round(c.monthCogsHT * 100) / 100;
    c.monthGrossMargin = Math.round(c.monthGrossMargin * 100) / 100;
    c.monthExpenses = Math.round(c.monthExpenses * 100) / 100;
    c.monthNetMargin = Math.round((c.monthGrossMargin - c.monthExpenses) * 100) / 100;
  }

  // 5. Calculer les totaux consolidés globaux
  let totalCaJour = 0;
  let totalCaJourHT = 0;
  let totalCogsJourHT = 0;
  let totalMargeBruteJour = 0;
  let totalDepensesJour = 0;

  let totalCaMois = 0;
  let totalCaMoisHT = 0;
  let totalCogsMoisHT = 0;
  let totalMargeBruteMois = 0;
  let totalDepensesMois = 0;

  for (const c of sectorCards) {
    totalCaJour += c.dayRevenue;
    totalCaJourHT += c.dayRevenueHT;
    totalCogsJourHT += c.dayCogsHT;
    totalMargeBruteJour += c.dayGrossMargin;
    totalDepensesJour += c.dayExpenses;

    totalCaMois += c.monthRevenue;
    totalCaMoisHT += c.monthRevenueHT;
    totalCogsMoisHT += c.monthCogsHT;
    totalMargeBruteMois += c.monthGrossMargin;
    totalDepensesMois += c.monthExpenses;
  }

  // Règle d'or : Marge nette = Marge brute - Dépenses
  const totalMargeNetteJour = Math.round((totalMargeBruteJour - totalDepensesJour) * 100) / 100;
  const totalMargeNetteMois = Math.round((totalMargeBruteMois - totalDepensesMois) * 100) / 100;

  const tauxMargeNetteMois = totalCaMoisHT > 0
    ? Math.round((totalMargeNetteMois / totalCaMoisHT) * 10000) / 100
    : 0;

  const calculatedTotals: HubFinancialTotals = {
    date: todayStr,
    ca_jour: Math.round(totalCaJour * 100) / 100,
    ca_jour_ht: Math.round(totalCaJourHT * 100) / 100,
    cogs_jour_ht: Math.round(totalCogsJourHT * 100) / 100,
    marge_brute_jour: Math.round(totalMargeBruteJour * 100) / 100,
    depenses_jour: Math.round(totalDepensesJour * 100) / 100,
    marge_jour: totalMargeNetteJour,
    ca_mois: Math.round(totalCaMois * 100) / 100,
    ca_mois_ht: Math.round(totalCaMoisHT * 100) / 100,
    cogs_mois_ht: Math.round(totalCogsMoisHT * 100) / 100,
    marge_brute_mois: Math.round(totalMargeBruteMois * 100) / 100,
    depenses_mois: Math.round(totalDepensesMois * 100) / 100,
    marge_mois: totalMargeNetteMois,
    mois_debut: monthStartStr,
    mois_fin: monthEndStr,
    taux_marge_nette_mois: tauxMargeNetteMois,
  };

  // Si une RPC existe et renvoie des totaux valides, s'assurer qu'elle n'applique JAMAIS ca - depenses
  let finalTotals = calculatedTotals;
  if (rpcTotals) {
    const rpcMargeMoisIsErroneous = rpcTotals.marge_mois === (rpcTotals.ca_mois - rpcTotals.depenses_mois);
    const resolvedDepensesMois = rpcTotals.depenses_mois > 0 ? rpcTotals.depenses_mois : calculatedTotals.depenses_mois;
    const resolvedDepensesJour = rpcTotals.depenses_jour > 0 ? rpcTotals.depenses_jour : calculatedTotals.depenses_jour;

    // Si la RPC a retourné l'ancienne formule erronée (CA - Dépenses), on force la vraie marge nette (Marge Brute - Dépenses)
    const correctedMargeMois = (rpcTotals.marge_mois > 0 && !rpcMargeMoisIsErroneous)
      ? (rpcTotals.marge_mois - resolvedDepensesMois)
      : calculatedTotals.marge_mois;

    const correctedMargeJour = (rpcTotals.marge_jour > 0 && rpcTotals.marge_jour !== (rpcTotals.ca_jour - rpcTotals.depenses_jour))
      ? (rpcTotals.marge_jour - resolvedDepensesJour)
      : calculatedTotals.marge_jour;

    finalTotals = {
      ...calculatedTotals,
      ca_jour: rpcTotals.ca_jour > 0 ? rpcTotals.ca_jour : calculatedTotals.ca_jour,
      ca_mois: rpcTotals.ca_mois > 0 ? rpcTotals.ca_mois : calculatedTotals.ca_mois,
      depenses_jour: resolvedDepensesJour,
      depenses_mois: resolvedDepensesMois,
      marge_jour: correctedMargeJour,
      marge_mois: correctedMargeMois,
      taux_marge_nette_mois: calculatedTotals.taux_marge_nette_mois,
    };
  }

  return {
    totals: finalTotals,
    sectors: sectorsMap,
  };
}
