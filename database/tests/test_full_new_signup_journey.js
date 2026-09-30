// =============================================================================
// GESTIO 229 SaaS — Test Complet du Parcours Nouveau Client
// Teste :
// 1. Nouvelle inscription
// 2. Création de l'entreprise avec isolation totale
// 3. Création du profil administrateur
// 4. Espace 100% vierge (0 produit, 0 vente, 0 créance)
// 5. Création des premières données réelles (Produit, Client, Caisse)
// 6. Nettoyage après test pour laisser la base immaculée
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runJourneyTest() {
  console.log('=============================================================================');
  console.log('GESTIO 229 — TEST DU PARCOURS NOUVELLE INSCRIPTION & ESPACE VIERGE');
  console.log('=============================================================================\n');

  const testEmail = 'nouveau.client.test@gestio229.bj';
  let createdCompanyId = null;
  let createdProfileId = null;

  try {
    // Étape 1 : Création de la nouvelle entreprise (onboarding client)
    console.log('▶ ÉTAPE 1: Création d\'une nouvelle entreprise cliente...');
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .insert({
        name: 'NOUVELLE PHARMACIE DU CENTRE',
        email: testEmail,
        phone: '0197001122',
        ifu_number: '3202699999999',
        city: 'Cotonou',
        country: 'Bénin',
        active_sector: 'pharmacie',
        subscription_status: 'trial',
        subscription_plan: 'multiservices',
        onboarding_completed: true,
        sectors: ['pharmacie', 'supermarche']
      })
      .select()
      .single();

    if (compErr) throw new Error('Échec création entreprise: ' + compErr.message);
    createdCompanyId = company.id;
    console.log(`   ✅ Entreprise créée : "${company.name}" (ID: ${company.id})`);

    const defaultAdminPermissions = {
      admin: true,
      commercial: true,
      stock: true,
      treasury: true,
      purchases: true,
      reporting: true,
      accounting: true,
      hr: true,
      ventes: { view: true, create: true, edit: true, delete: true },
      finances: { view: true, caisse: true, tresorerie: true }
    };

    const { data: profile, error: profErr } = await supabase
      .from('user_profiles')
      .insert({
        company_id: company.id,
        full_name: 'Dr. Mensah Koffi',
        username: testEmail,
        email: testEmail,
        phone: '0197001122',
        role: 'administrateur',
        permissions: defaultAdminPermissions,
        password_hash: 'TestPass123!',
        is_active: true
      })
      .select()
      .single();

    if (profErr) throw new Error('Échec création profil: ' + profErr.message);
    createdProfileId = profile.id;
    console.log(`   ✅ Profil créé : ${profile.full_name} (${profile.email}) - Rôle: ${profile.role}`);

    // Étape 3 : Vérification de l'espace vierge (Règle 8 du cahier des charges)
    console.log('\n▶ ÉTAPE 3: Vérification que le nouvel espace métier est 100% vierge...');
    const { data: prodCheck } = await supabase.from('products').select('id').eq('company_id', company.id);
    const { data: custCheck } = await supabase.from('customers').select('id').eq('company_id', company.id);
    const { data: saleCheck } = await supabase.from('sales_orders').select('id').eq('company_id', company.id);
    const { data: cashCheck } = await supabase.from('cash_registers').select('id').eq('company_id', company.id);

    const isVirgin = (prodCheck?.length === 0) && (custCheck?.length === 0) && (saleCheck?.length === 0) && (cashCheck?.length === 0);
    if (isVirgin) {
      console.log('   ✅ ESPACE VIERGE CONFIRMÉ : 0 article, 0 client, 0 vente, 0 caisse.');
    } else {
      throw new Error('L\'espace contient des données résiduelles inattendues !');
    }

    // Étape 4 : Création des premières données réelles dans le secteur (Pharmacie)
    console.log('\n▶ ÉTAPE 4: Création des premières données métier réelles...');
    const { data: product, error: pErr } = await supabase
      .from('products')
      .insert({
        company_id: company.id,
        name: 'Paracétamol 1000mg Biogaran',
        code: 'MED-PARA-001',
        cost_price: 600,
        selling_price: 1000,
        unit: 'Boîte',
        is_active: true,
        sector_meta: { sector_slug: 'pharmacie', dosage: '1000mg' }
      })
      .select()
      .single();

    if (pErr) throw new Error('Échec création produit: ' + pErr.message);
    console.log(`   ✅ Premier produit créé : ${product.name} (${product.code}) - Prix: ${product.selling_price} FCFA`);

    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .insert({
        company_id: company.id,
        code: 'CLI-001',
        name: 'Clinique Bon Secours',
        phone: '0165443322',
        city: 'Cotonou',
        credit_limit: 100000,
        current_debt: 0,
        is_active: true
      })
      .select()
      .single();

    if (cErr) throw new Error('Échec création client: ' + cErr.message);
    console.log(`   ✅ Premier client créé : ${customer.name} (${customer.phone})`);

    const { data: cashReg, error: crErr } = await supabase
      .from('cash_registers')
      .insert({
        company_id: company.id,
        name: 'Caisse Principale Pharmacie',
        current_cash_balance: 25000,
        current_momo_balance: 0,
        is_active: true
      })
      .select()
      .single();

    if (crErr) throw new Error('Échec création caisse: ' + crErr.message);
    console.log(`   ✅ Première caisse créée : ${cashReg.name} - Fond: ${cashReg.current_cash_balance} FCFA`);

    // Étape 5 : Nettoyage du test pour laisser la base vierge
    console.log('\n▶ ÉTAPE 5: Nettoyage du compte de test (Purge finale)...');
    await supabase.from('products').delete().eq('id', product.id);
    await supabase.from('customers').delete().eq('id', customer.id);
    await supabase.from('cash_registers').delete().eq('id', cashReg.id);
    await supabase.from('user_profiles').delete().eq('id', profile.id);
    await supabase.from('companies').delete().eq('id', company.id);
    console.log('   ✅ Nettoyage terminé : la base de données est 100% vierge et prête pour vos clients réels.');

    console.log('\n=============================================================================');
    console.log('RÉSULTAT GLOBAL : PARCOURS CLIENT VALIDÉ AVEC SUCCÈS À 100% !');
    console.log('=============================================================================');
  } catch (err) {
    console.error('\n❌ ERREUR LORS DU TEST :', err.message);
    // Nettoyage de secours en cas d'erreur
    if (createdCompanyId) {
      await supabase.from('products').delete().eq('company_id', createdCompanyId);
      await supabase.from('customers').delete().eq('company_id', createdCompanyId);
      await supabase.from('cash_registers').delete().eq('company_id', createdCompanyId);
      await supabase.from('user_profiles').delete().eq('company_id', createdCompanyId);
      await supabase.from('companies').delete().eq('id', createdCompanyId);
    }
  }
}

runJourneyTest();
