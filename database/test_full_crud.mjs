import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, ANON_KEY);
const COMPANY_ID = '456cc4d1-9e69-4468-8350-b0ffaf73798d';
const SECTOR_SLUG = 'boutique';

async function runTests() {
  console.log('--- TEST 1: INSERT CLIENT (customer avec notes, credit_authorized, sector_slug...) ---');
  const testCustomer = {
    company_id: COMPANY_ID,
    sector_slug: SECTOR_SLUG,
    code: 'CLI-TEST-' + Date.now().toString().slice(-4),
    name: 'Client Test Automatique Post-M025',
    phone: '22997000000',
    email: 'client.test@gestio229.com',
    address: 'Cotonou Rue Test',
    city: 'Cotonou',
    notes: 'Note de test de non-régression schema cache',
    credit_limit: 50000,
    credit_authorized: true,
    discount_eligible: true,
    discount_rate: 5,
    payment_terms_days: 30,
    current_debt: 0,
    is_active: true
  };

  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .insert(testCustomer)
    .select()
    .single();

  if (custErr) {
    console.error('❌ ECHEC Client:', custErr);
  } else {
    console.log('✅ Client créé avec succès! ID:', custData.id, '| Code:', custData.code, '| Notes:', custData.notes);
  }

  console.log('\n--- TEST 2: INSERT FOURNISSEUR (supplier avec notes, sector_slug, current_debt...) ---');
  const testSupplier = {
    company_id: COMPANY_ID,
    sector_slug: SECTOR_SLUG,
    code: 'FOURN-TEST-' + Date.now().toString().slice(-4),
    company_name: 'Fournisseur Test SARL',
    contact_person: 'Jean Dupont',
    phone: '22996000000',
    email: 'fourn.test@gestio229.com',
    address: 'Dantokpa',
    city: 'Cotonou',
    country: 'Bénin',
    notes: 'Fournisseur importateur agréé',
    payment_terms_days: 15,
    current_payable: 0,
    current_debt: 0,
    is_active: true
  };

  const { data: suppData, error: suppErr } = await supabase
    .from('suppliers')
    .insert(testSupplier)
    .select()
    .single();

  if (suppErr) {
    console.error('❌ ECHEC Fournisseur:', suppErr);
  } else {
    console.log('✅ Fournisseur créé avec succès! ID:', suppData.id, '| Nom:', suppData.company_name, '| Notes:', suppData.notes);
  }

  console.log('\n--- TEST 3: INSERT PRODUIT (product avec sector_slug, sector_meta...) ---');
  const testProduct = {
    company_id: COMPANY_ID,
    sector_slug: SECTOR_SLUG,
    code: 'PROD-TEST-' + Date.now().toString().slice(-4),
    name: 'Produit Test Auto Post-M025',
    unit: 'Pièce',
    cost_price: 1500,
    selling_price: 2500,
    wholesale_price: 2200,
    is_taxable: true,
    tva_rate: 18,
    min_stock_alert: 5,
    sector_meta: {
      sector_slug: SECTOR_SLUG,
      stock_magasin: 10,
      stock_vente: 5
    },
    is_active: true
  };

  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(testProduct)
    .select()
    .single();

  if (prodErr) {
    console.error('❌ ECHEC Produit:', prodErr);
  } else {
    console.log('✅ Produit créé avec succès! ID:', prodData.id, '| Code:', prodData.code, '| Sector:', prodData.sector_slug);
  }

  console.log('\n--- TEST 4: INSERT DEPENSE (expense avec sector_slug, title, expense_date...) ---');
  const testExpense = {
    company_id: COMPANY_ID,
    sector_slug: SECTOR_SLUG,
    expense_number: 'DEP-TEST-' + Date.now().toString().slice(-4),
    category: 'Fournitures',
    title: 'Achat consommables bureau',
    beneficiary: 'Papeterie Nationale',
    amount: 15000,
    payment_method: 'especes',
    expense_date: new Date().toISOString().split('T')[0],
    notes: 'Dépense courante validée'
  };

  const { data: expData, error: expErr } = await supabase
    .from('expenses')
    .insert(testExpense)
    .select()
    .single();

  if (expErr) {
    console.error('❌ ECHEC Dépense:', expErr);
  } else {
    console.log('✅ Dépense créée avec succès! ID:', expData.id, '| Titre:', expData.title, '| Montant:', expData.amount);
  }

  console.log('\n--- TEST 5: INSERT VENTE (sales_orders + sales_order_items avec notes, sector_slug...) ---');
  const testSale = {
    company_id: COMPANY_ID,
    sector_slug: SECTOR_SLUG,
    order_number: 'CMD-TEST-' + Date.now().toString().slice(-4),
    order_type: 'pos_direct',
    order_date: new Date().toISOString().split('T')[0],
    customer_id: custData ? custData.id : null,
    customer_name: custData ? custData.name : 'Client Comptoir',
    subtotal_ht: 2118.64,
    tva_amount: 381.36,
    aib_amount: 0,
    total_amount: 2500,
    total_cost: 1500,
    paid_amount: 2500,
    credit_amount: 0,
    payment_status: 'especes',
    payment_method: 'especes',
    status: 'COMPLET',
    notes: JSON.stringify({ source: 'POS', validated: true })
  };

  const { data: saleData, error: saleErr } = await supabase
    .from('sales_orders')
    .insert(testSale)
    .select()
    .single();

  if (saleErr) {
    console.error('❌ ECHEC Vente (sales_orders):', saleErr);
  } else {
    console.log('✅ Vente créée avec succès! ID:', saleData.id, '| N°:', saleData.order_number);

    // Ligne de vente
    const testLine = {
      order_id: saleData.id,
      company_id: COMPANY_ID,
      sector_slug: SECTOR_SLUG,
      product_id: prodData ? prodData.id : null,
      product_name: prodData ? prodData.name : 'Article Test',
      quantity: 1,
      unit_price: 2500,
      unit_cost: 1500,
      tva_rate: 18,
      total_ht: 2118.64,
      total_ttc: 2500
    };

    const { data: lineData, error: lineErr } = await supabase
      .from('sales_order_items')
      .insert(testLine)
      .select()
      .single();

    if (lineErr) {
      console.error('❌ ECHEC Ligne Vente:', lineErr);
    } else {
      console.log('✅ Ligne de vente enregistrée! ID:', lineData.id, '| Total TTC:', lineData.total_ttc);
    }
  }

  // Nettoyage propre des données de test
  console.log('\n--- NETTOYAGE DES LIGNES DE TEST ---');
  if (custData?.id) await supabase.from('customers').delete().eq('id', custData.id);
  if (suppData?.id) await supabase.from('suppliers').delete().eq('id', suppData.id);
  if (prodData?.id) await supabase.from('products').delete().eq('id', prodData.id);
  if (expData?.id) await supabase.from('expenses').delete().eq('id', expData.id);
  if (saleData?.id) {
    await supabase.from('sales_order_items').delete().eq('order_id', saleData.id);
    await supabase.from('sales_orders').delete().eq('id', saleData.id);
  }
  console.log('✅ Nettoyage terminé.');
}

runTests();
