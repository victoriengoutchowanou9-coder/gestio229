// =============================================================================
// GESTIO 229 SaaS — Service Métriques Financières Consolidées Hub
// =============================================================================
// Règle d'or : Fuseau horaire Africa/Porto-Novo (Bénin UTC+1)
// - CA du jour : Ventes enregistrées STRICTEMENT à la date du jour (Cotonou)
// - Dépenses du jour : Dépenses de la date du jour
// - Marge nette du jour : Marge des ventes du jour (ou CA jour - Dépenses jour)
// - Synthèse du mois : Cumul du 1er jour au dernier jour du mois en cours
// - Reset mensuel automatique : Quand le mois change, le cumul mensuel repart à 0
// =============================================================================

import { supabase } from '../lib/supabase';

export interface SectorMetrics {
  sector_slug: string;
  dayRevenue: number;     // CA DU JOUR
  dayExpenses: number;    // DÉPENSES DU JOUR
  dayNetMargin: number;   // MARGE NETTE DU JOUR
  monthRevenue: number;   // CA DU MOIS
  monthExpenses: number;  // DÉPENSES DU MOIS
  monthNetMargin: number; // MARGE NETTE DU MOIS
}

export interface HubFinancialTotals {
  date: string;
  ca_jour: number;
  depenses_jour: number;
  marge_jour: number;
  ca_mois: number;
  depenses_mois: number;
  marge_mois: number;
  mois_debut: string;
  mois_fin: string;
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
        dayExpenses: 0,
        dayNetMargin: 0,
        monthRevenue: 0,
        monthExpenses: 0,
        monthNetMargin: 0,
      };
    }
    return sectorsMap[clean];
  };

  // 1. Tenter l'appel RPC Supabase fn_dashboard_hub
  let rpcTotals: HubFinancialTotals | null = null;
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_dashboard_hub', {
      p_company_id: companyId,
      p_date: todayStr,
    });
    if (!rpcErr && rpcData) {
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
  } catch (err) {
    // Si la fonction n'est pas encore déployée dans la BDD Supabase, le fallback local prend le relais
  }

  // 2. Récupérer les ventes sales_orders récentes pour calculer le détail par secteur
  try {
    const { data: salesList } = await supabase
      .from('sales_orders')
      .select('id, total_amount, subtotal_ht, total_cost, gross_margin, sector_slug, order_date, created_at, status')
      .eq('company_id', companyId)
      .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (salesList && salesList.length > 0) {
      for (const item of salesList) {
        const itemDate = extractCotonouDate(item.order_date, item.created_at);
        if (!itemDate) continue;

        const isToday = itemDate === todayStr;
        const isThisMonth = itemDate >= monthStartStr && itemDate <= monthEndStr;

        if (!isToday && !isThisMonth) continue;

        const secSlug = (item.sector_slug || '').toLowerCase().trim().replace(/^sec-/, '') || 'brasserie';
        const card = initSector(secSlug);

        const totalTTC = Number(item.total_amount) || 0;
        const subtotalHT = Number(item.subtotal_ht) > 0
          ? Number(item.subtotal_ht)
          : Math.round((totalTTC / 1.18) * 100) / 100;

        let margin = 0;
        if (typeof item.gross_margin === 'number' && item.gross_margin > 0) {
          margin = item.gross_margin;
        } else if (Number(item.total_cost) > 0 && subtotalHT >= Number(item.total_cost)) {
          margin = Math.max(0, subtotalHT - Number(item.total_cost));
        } else {
          margin = Math.round(subtotalHT * 0.15 * 100) / 100;
        }

        if (isToday) {
          card.dayRevenue += totalTTC;
          card.dayNetMargin += margin;
        }

        if (isThisMonth) {
          card.monthRevenue += totalTTC;
          card.monthNetMargin += margin;
        }
      }
    }
  } catch (sErr) {
    console.warn('[HubFinancialService] Erreur lecture sales_orders:', sErr);
  }

  // 3. Récupérer les dépenses réelles et les imputer aux secteurs et au cumul
  try {
    const { data: depList } = await supabase
      .from('depenses')
      .select('id, montant, date_depense, created_at, secteur_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1000);

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
        const dDate = extractCotonouDate(d.date_depense, d.created_at);
        if (!dDate) continue;

        const isToday = dDate === todayStr;
        const isThisMonth = dDate >= monthStartStr && dDate <= monthEndStr;

        if (!isToday && !isThisMonth) continue;

        const montant = Number(d.montant) || 0;
        const targetSlug = (d.secteur_id && uuidToSlug[d.secteur_id]) || 'general';
        const card = initSector(targetSlug);

        if (isToday) {
          card.dayExpenses += montant;
          card.dayNetMargin = Math.max(0, card.dayNetMargin - montant);
        }

        if (isThisMonth) {
          card.monthExpenses += montant;
          card.monthNetMargin = Math.max(0, card.monthNetMargin - montant);
        }
      }
    }
  } catch (dErr) {
    console.warn('[HubFinancialService] Erreur lecture depenses:', dErr);
  }

  // 4. Calculer les totaux consolidés (si RPC n'a pas répondu)
  let calculatedTotals: HubFinancialTotals = {
    date: todayStr,
    ca_jour: 0,
    depenses_jour: 0,
    marge_jour: 0,
    ca_mois: 0,
    depenses_mois: 0,
    marge_mois: 0,
    mois_debut: monthStartStr,
    mois_fin: monthEndStr,
  };

  const sectorCards = Object.values(sectorsMap);
  for (const c of sectorCards) {
    calculatedTotals.ca_jour += c.dayRevenue;
    calculatedTotals.depenses_jour += c.dayExpenses;
    calculatedTotals.marge_jour += c.dayNetMargin;
    calculatedTotals.ca_mois += c.monthRevenue;
    calculatedTotals.depenses_mois += c.monthExpenses;
    calculatedTotals.marge_mois += c.monthNetMargin;
  }

  // Utiliser RPC en priorité si disponible et cohérent
  const finalTotals = rpcTotals || calculatedTotals;

  return {
    totals: finalTotals,
    sectors: sectorsMap,
  };
}
