// =============================================================================
// GESTIO 229 SaaS — Moteur Unique et Universel des Calculs Financiers
// =============================================================================
// Règles comptables SYSCOHADA et conformité multi-secteurs GESTIO 229 :
//
// 1. Chiffre d'Affaires Net HT :
//    CA net HT = Ventes HT - Avoirs & Remises accordées HT
//
// 2. Coût d'Achat des Marchandises Vendues (COGS / CAMV) :
//    Coût des marchandises vendues sur la période (ou coût des matières premières)
//    Ne JAMAIS confondre avec la valeur totale du stock en magasin ou rayon.
//
// 3. Marge Commerciale Brute :
//    Marge Brute = CA net HT - Coût d'achat réel des marchandises vendues (COGS)
//    INTERDICTION ABSOLUE : Ne jamais calculer la marge comme CA - Dépenses !
//
// 4. Charges d'Exploitation Réelles (Dépenses d'exploitation) :
//    Dépenses de fonctionnement (loyer, électricité, salaires, fournitures...).
//    EXCLUSION STRICTE :
//    - Ne JAMAIS compter les transferts de caisse vers coffre/banque/momo comme dépenses.
//    - Ne JAMAIS compter les clôtures de caisse comme dépenses.
//    - Ne JAMAIS doubler les règlements fournisseurs de stocks déjà inclus dans le coût d'achat.
//
// 5. Marge Nette / Bénéfice Réel :
//    Marge Nette = Marge Commerciale Brute - Dépenses d'Exploitation Réelles
//
// 6. Taux de Marge Nette :
//    Taux (%) = (Marge Nette / CA net HT) * 100
//
// 7. Validation Obligatoire (Cas Client) :
//    CA = 51 300 F CFA, COGS = 30 000 F CFA => Marge Brute = 21 300 F CFA.
//    Charges d'exploitation = 11 400 F CFA.
//    Marge Nette Réelle = 21 300 - 11 400 = 9 900 F CFA (Taux = 19.30%).
//    (Et JAMAIS 51 300 - 11 400 = 39 900 F CFA !)
// =============================================================================

export interface FinancialSaleOrder {
  id?: string;
  order_number?: string;
  order_date?: string | null;
  created_at?: string;
  subtotal_ht?: number | string | null;
  total_amount?: number | string | null;
  tva_amount?: number | string | null;
  aib_amount?: number | string | null;
  total_cost?: number | string | null;
  gross_margin?: number | string | null;
  notes?: any;
  status?: string | null;
  sector_slug?: string | null;
  lines?: any[];
}

export interface FinancialExpense {
  id?: string;
  montant?: number | string | null;
  amount?: number | string | null;
  date_depense?: string | null;
  created_at?: string;
  secteur_id?: string | null;
  sector_slug?: string | null;
  categorie?: string | null;
  description?: string | null;
  type?: string | null;
  sens?: string | null;
  source_module?: string | null;
}

export interface FinancialAvoir {
  id?: string;
  montant_total?: number | string | null;
  montant_ht?: number | string | null;
  created_at?: string;
  lignes?: any[];
}

export interface OrderMarginResult {
  revenueTTC: number;
  revenueHT: number;
  cogsHT: number;
  grossMargin: number;
  hasKnownCost: boolean;
}

export interface ConsolidatedMarginsResult {
  revenueTTC: number;
  revenueHT: number;
  avoirsTTC: number;
  avoirsHT: number;
  netRevenueHT: number;
  cogsHT: number;
  grossMargin: number;
  operatingExpenses: number;
  netMargin: number;
  netMarginRate: number; // en %
  isCostAvailable: boolean;
  costStatusLabel: string;
}

/**
 * Nettoie et sécurise un nombre
 */
export function safeNum(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Détermine si une ligne de caisse ou dépense est une vraie charge d'exploitation
 * et NON un transfert de trésorerie ou une clôture.
 */
export function isTrueOperatingExpense(item: FinancialExpense): boolean {
  if (!item) return false;

  const type = String(item.type || '').toLowerCase().trim();
  const sens = String(item.sens || '').toLowerCase().trim();
  const cat = String(item.categorie || '').toLowerCase().trim();
  const desc = String(item.description || '').toLowerCase().trim();
  const source = String(item.source_module || '').toLowerCase().trim();

  // Exclusions formelles de trésorerie
  const treasuryBlacklist = [
    'transfert',
    'transfert_caisse_coffre',
    'alimentation_coffre',
    'reception_coffre',
    'cloture',
    'versement_banque',
    'retrait_banque',
    'tresorerie',
    'paiement_fournisseur_stock',
    'achat_marchandise_stock' // Les achats de stock entrent dans le stock et le COGS, pas en charges directes doublement
  ];

  for (const b of treasuryBlacklist) {
    if (type.includes(b) || cat.includes(b) || desc.includes(b)) {
      return false;
    }
  }

  // Si c'est dans caisse_mouvements
  if (type === 'cloture' || type === 'ouverture' || type === 'transfert') {
    return false;
  }

  // Si c'est un règlement fournisseur de facture de stock incorporable
  if (type === 'paiement_fournisseur' && (cat.includes('stock') || desc.includes('marchandise') || desc.includes('approvisionnement'))) {
    return false;
  }

  // C'est une sortie de fonds ?
  const isSortie = ['sortie', 'debit'].includes(sens) || ['depense', 'expense', 'debit', 'sortie'].includes(type) || !sens;

  return isSortie;
}

/**
 * Calcule le COGS (coût d'achat réel HT des marchandises vendues) pour une commande
 */
export function computeOrderCOGS(order: FinancialSaleOrder): { cogsHT: number; hasKnownCost: boolean } {
  if (!order) return { cogsHT: 0, hasKnownCost: false };

  // 1. Si gross_margin et subtotal_ht sont présents et cohérents
  const subtotalHT = safeNum(order.subtotal_ht) > 0
    ? safeNum(order.subtotal_ht)
    : Math.round((safeNum(order.total_amount) / 1.18) * 100) / 100;

  // Si le total_cost est directement stocké dans la commande et est valide (> 0)
  const directCost = safeNum(order.total_cost);
  if (directCost > 0) {
    // Si le coût est aberrant par rapport au HT (ex: bug de vente à perte anormale x100), vérifier les lignes
    if (directCost <= subtotalHT * 2) {
      return { cogsHT: directCost, hasKnownCost: true };
    }
  }

  // Si gross_margin est stockée dans la table (colonne générée ou calculée)
  if (typeof order.gross_margin === 'number' && !Number.isNaN(order.gross_margin)) {
    const computedCogs = Math.max(0, subtotalHT - order.gross_margin);
    if (computedCogs > 0 || order.gross_margin === subtotalHT) {
      return { cogsHT: computedCogs, hasKnownCost: true };
    }
  }

  // 2. Tenter de recalculer depuis les lignes stockées dans `notes.lines` ou `order.lines`
  let lines: any[] = [];
  if (Array.isArray(order.lines) && order.lines.length > 0) {
    lines = order.lines;
  } else if (order.notes) {
    try {
      const parsed = typeof order.notes === 'string' ? JSON.parse(order.notes) : order.notes;
      if (Array.isArray(parsed?.lines)) {
        lines = parsed.lines;
      }
    } catch (_) {}
  }

  if (lines.length > 0) {
    let recoveredCost = 0;
    let foundCostCount = 0;

    for (const line of lines) {
      const qty = safeNum(line.qty ?? line.quantity, 1);
      const prod = line.product || {};
      const coef = Math.max(1, safeNum(prod.coef ?? prod.sector_meta?.coef, 1));
      const rawCost = safeNum(prod.cost_price ?? prod.purchase_price ?? prod.sector_meta?.price_achat_ht ?? line.unit_cost, 0);

      if (rawCost > 0) {
        const isTaxed = Boolean(prod.is_vat_subject ?? (safeNum(prod.vat_rate ?? prod.tva_rate) > 0));
        const vatRate = isTaxed ? safeNum(prod.vat_rate ?? prod.tva_rate, 18) : 0;
        const uvCostTTC = rawCost / coef;
        const uvCostHT = isTaxed ? uvCostTTC / (1 + vatRate / 100) : uvCostTTC;
        recoveredCost += qty * uvCostHT;
        foundCostCount++;
      }
    }

    if (foundCostCount > 0 && recoveredCost > 0) {
      return {
        cogsHT: Math.round(recoveredCost * 100) / 100,
        hasKnownCost: true,
      };
    }
  }

  // Si aucun coût n'est traçable (ex: produit service pur sans coût, ou historique sans prix d'achat)
  return { cogsHT: 0, hasKnownCost: false };
}

/**
 * Calcule la marge commerciale brute d'une vente individuelle
 */
export function computeOrderMargin(order: FinancialSaleOrder): OrderMarginResult {
  const revenueTTC = safeNum(order.total_amount);
  const revenueHT = safeNum(order.subtotal_ht) > 0
    ? safeNum(order.subtotal_ht)
    : Math.round((revenueTTC / 1.18) * 100) / 100;

  const { cogsHT, hasKnownCost } = computeOrderCOGS(order);
  const grossMargin = Math.round((revenueHT - cogsHT) * 100) / 100;

  return {
    revenueTTC,
    revenueHT,
    cogsHT,
    grossMargin,
    hasKnownCost,
  };
}

/**
 * Moteur consolidé : calcule les indicateurs financiers sur un ensemble de ventes et dépenses
 */
export function computeConsolidatedFinancials(params: {
  sales: FinancialSaleOrder[];
  expenses: FinancialExpense[];
  avoirs?: FinancialAvoir[];
  sectorSlug?: string;
}): ConsolidatedMarginsResult {
  const { sales, expenses, avoirs = [] } = params;

  let revenueTTC = 0;
  let revenueHT = 0;
  let cogsHT = 0;
  let ordersWithKnownCost = 0;
  let validOrdersCount = 0;

  for (const s of sales) {
    // Filtrer les commandes annulées
    const status = String(s.status || '').toLowerCase().trim();
    if (['annule', 'annulée', 'cancelled', 'canceled'].includes(status)) {
      continue;
    }

    validOrdersCount++;
    const res = computeOrderMargin(s);
    revenueTTC += res.revenueTTC;
    revenueHT += res.revenueHT;
    cogsHT += res.cogsHT;

    if (res.hasKnownCost) {
      ordersWithKnownCost++;
    }
  }

  // Traiter les avoirs (retours et réductions)
  let avoirsTTC = 0;
  let avoirsHT = 0;
  let avoirsCOGS = 0;

  for (const av of avoirs) {
    const totTTC = safeNum(av.montant_total);
    const totHT = safeNum(av.montant_ht) > 0 ? safeNum(av.montant_ht) : Math.round((totTTC / 1.18) * 100) / 100;
    avoirsTTC += totTTC;
    avoirsHT += totHT;

    // Si les lignes d'avoir sont présentes, réintégrer le coût d'achat au stock
    if (Array.isArray(av.lignes)) {
      for (const al of av.lignes) {
        const qte = safeNum(al.qte_retournee ?? al.quantite, 0);
        const cout = safeNum(al.prix_achat_unitaire ?? al.unit_cost, 0);
        avoirsCOGS += qte * cout;
      }
    }
  }

  const netRevenueHT = Math.max(0, Math.round((revenueHT - avoirsHT) * 100) / 100);
  const netCogsHT = Math.max(0, Math.round((cogsHT - avoirsCOGS) * 100) / 100);

  // Marge brute = CA net HT - COGS net HT
  const grossMargin = Math.round((netRevenueHT - netCogsHT) * 100) / 100;

  // Calcul des charges d'exploitation réelles (filtrage strict de la trésorerie)
  let operatingExpenses = 0;
  for (const exp of expenses) {
    if (isTrueOperatingExpense(exp)) {
      const amt = safeNum(exp.montant ?? exp.amount, 0);
      operatingExpenses += amt;
    }
  }
  operatingExpenses = Math.round(operatingExpenses * 100) / 100;

  // Marge Nette = Marge Brute - Charges d'exploitation
  const netMargin = Math.round((grossMargin - operatingExpenses) * 100) / 100;

  // Taux de marge nette = (Marge Nette / CA Net HT) * 100
  const netMarginRate = netRevenueHT > 0
    ? Math.round((netMargin / netRevenueHT) * 10000) / 100
    : 0;

  const isCostAvailable = validOrdersCount === 0 || ordersWithKnownCost > 0;
  const costStatusLabel = !isCostAvailable
    ? "Coût d'achat indisponible"
    : (netMargin >= 0 ? "Bénéfice net d'exploitation" : "Déficit d'exploitation");

  return {
    revenueTTC: Math.round(revenueTTC * 100) / 100,
    revenueHT: Math.round(revenueHT * 100) / 100,
    avoirsTTC: Math.round(avoirsTTC * 100) / 100,
    avoirsHT: Math.round(avoirsHT * 100) / 100,
    netRevenueHT,
    cogsHT: netCogsHT,
    grossMargin,
    operatingExpenses,
    netMargin,
    netMarginRate,
    isCostAvailable,
    costStatusLabel,
  };
}

export default {
  safeNum,
  isTrueOperatingExpense,
  computeOrderCOGS,
  computeOrderMargin,
  computeConsolidatedFinancials,
};
