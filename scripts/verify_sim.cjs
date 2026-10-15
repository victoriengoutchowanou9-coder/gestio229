const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://inknljnhqmrykcrgglts.supabase.co', 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr');
const { computeConsolidatedFinancials } = require('../src/lib/financialCalcul.ts');

function extractCotonouDate(rawDate, rawTimestamp) {
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

async function testSim() {
  const compId = '16f1b55b-8c51-454c-9587-4e21fb1853df';
  const sectorSlug = 'poissonnerie';

  // Load sales
  const { data: salesData } = await supabase
    .from('sales_orders')
    .select('id, order_number, order_date, created_at, total_amount, subtotal_ht, total_cost, tva_amount, aib_amount, status, payment_status, payment_method, sector_slug, notes, customer_name, customer:customers(id, name)')
    .eq('company_id', compId)
    .eq('sector_slug', sectorSlug)
    .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")');

  // Load caisse_mouvements for true expenses
  const { data: caisseData } = await supabase
    .from('caisse_mouvements')
    .select('id, montant, created_at, sector_slug, sens, type, motif, user_name, caisse_id')
    .eq('company_id', compId)
    .eq('sector_slug', sectorSlug)
    .eq('type', 'depense');

  console.log('Valid expenses in caisse_mouvements:', caisseData ? caisseData.length : 0);
  if (caisseData) {
    caisseData.forEach(e => console.log('Expense:', e.created_at, e.montant, e.motif));
  }

  // Simulate TODAY (2026-10-15)
  const todayStr = '2026-10-15';
  const salesToday = (salesData || []).filter(s => extractCotonouDate(s.order_date, s.created_at) === todayStr);
  const expensesToday = (caisseData || []).filter(e => extractCotonouDate(null, e.created_at) === todayStr);

  console.log('Today sales count:', salesToday.length);
  console.log('Today expenses count:', expensesToday.length);

  // Map parsed sales
  const parsedSales = salesToday.map(s => {
    let meta = {};
    if (s.notes) {
      try { meta = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes; } catch(e){}
    }
    const ht = Number(s.subtotal_ht) > 0 ? Number(s.subtotal_ht) : (Number(s.tva_amount) === 0 ? Number(s.total_amount) : 0);
    return {
      id: s.id,
      order_number: s.order_number,
      order_date: s.order_date,
      created_at: s.created_at,
      total_amount: Number(s.total_amount) || 0,
      subtotal_ht: ht,
      total_ht: ht,
      total_tax: Number(s.tva_amount) || 0,
      total_cost: Number(s.total_cost) || 0,
      status: s.status || 'COMPLET',
      lines: Array.isArray(meta?.lines) ? meta.lines : []
    };
  });

  const parsedExpenses = expensesToday.map(e => ({
    id: e.id,
    expense_date: e.created_at,
    amount: Number(e.montant) || 0,
    category: e.motif || 'Dépense',
    created_at: e.created_at,
    type: 'depense',
    sens: 'sortie'
  }));

  const resToday = computeConsolidatedFinancials({
    sales: parsedSales,
    expenses: parsedExpenses,
    avoirs: [],
    sectorSlug
  });

  console.log('TODAY Financials (after fix):', resToday);

  // Simulate YESTERDAY (2026-10-14)
  const yestStr = '2026-10-14';
  const salesYest = (salesData || []).filter(s => extractCotonouDate(s.order_date, s.created_at) === yestStr);
  const expensesYest = (caisseData || []).filter(e => extractCotonouDate(null, e.created_at) === yestStr);

  const resYest = computeConsolidatedFinancials({
    sales: salesYest,
    expenses: expensesYest,
    avoirs: [],
    sectorSlug
  });

  console.log('YESTERDAY Financials (after fix):', resYest);
}

testSim();
