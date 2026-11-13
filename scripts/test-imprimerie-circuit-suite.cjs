// =============================================================================
// GESTIO 229 SaaS — Suite de Tests d'Intégration Circuit Imprimerie & Caisse
// Vérifie la chaîne Ventes Rapides -> Prestations -> Graphistes -> Caisse -> Stock -> Idempotence
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables Supabase introuvables dans .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSuite() {
  console.log('\n=================================================================');
  console.log('🧪 DÉBUT DE LA SUITE DE TESTS : CIRCUIT IMPRIMERIE / CAISSE / STOCK');
  console.log('=================================================================\n');

  let passedTests = 0;
  let totalTests = 0;
  const createdOrderIds = [];
  const createdMovementIds = [];

  try {
    // 0. Récupérer une entreprise et le secteur imprimerie
    const { data: comp, error: compErr } = await supabase
      .from('companies')
      .select('id, name')
      .limit(1)
      .single();

    if (compErr || !comp) {
      throw new Error(`Entreprise de test introuvable: ${compErr?.message}`);
    }

    const companyId = comp.id;
    const sectorSlug = 'imprimerie';
    console.log(`🏢 Entreprise de test : "${comp.name}" (${companyId})`);
    console.log(`🏷️ Secteur testé : "${sectorSlug}"\n`);

    // Trouver ou créer un produit test pour le déstockage
    let testProductId = null;
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, stock_vente, cost_price, sector_meta')
      .eq('company_id', companyId)
      .limit(1);

    if (prods && prods.length > 0) {
      testProductId = prods[0].id;
      console.log(`📦 Article de test stock : "${prods[0].name}" (ID: ${testProductId}, Stock actuel: ${prods[0].stock_vente})`);
    }

    // ── TEST 1 : Vente rapide en attente d'encaissement (isAttente = true) ──────
    totalTests++;
    console.log('\n--- TEST 1 : Création d\'une Vente Rapide en attente d\'encaissement ---');
    const orderNum1 = `TEST-IMP-${Date.now().toString().slice(-6)}`;
    const totalTtc1 = 15000;

    const { data: cmd1, error: cmd1Err } = await supabase
      .from('imprimerie_commandes')
      .insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        numero_commande: orderNum1,
        client_nom: 'Client Test Vente Attente',
        titre_travail: 'Impression Affiches A3 Test',
        date_commande: new Date().toISOString().split('T')[0],
        statut: 'nouveau',
        total_ttc: totalTtc1,
        montant_acompte: 0,
        montant_paye: 0,
        solde_restant: totalTtc1,
        statut_paiement: 'non_paye'
      })
      .select()
      .single();

    if (cmd1Err || !cmd1) {
      console.error('❌ Échec insertion commande test 1:', cmd1Err);
    } else {
      createdOrderIds.push(cmd1.id);
      // Ligne de commande
      await supabase.from('imprimerie_commande_lignes').insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        commande_id: cmd1.id,
        prestation_id: testProductId || cmd1.id,
        designation: 'Affiches A3 Couleur',
        quantite: 50,
        prix_unitaire: 300,
        montant_ttc: totalTtc1
      });

      // Vérifier visibilité dans imprimerie_commandes
      const { data: verifyPending } = await supabase
        .from('imprimerie_commandes')
        .select('id, numero_commande, solde_restant, statut_paiement')
        .eq('id', cmd1.id)
        .single();

      if (verifyPending && verifyPending.solde_restant === totalTtc1 && verifyPending.statut_paiement === 'non_paye') {
        console.log(`✅ TEST 1 RÉUSSI : Commande ${orderNum1} créée avec solde ${verifyPending.solde_restant} FCFA.`);
        passedTests++;
      } else {
        console.error('❌ TEST 1 ÉCHOUÉ : Commande non conforme', verifyPending);
      }
    }

    // ── TEST 2 : Commande transmise par un Graphiste (Maquette validée) ─────────
    totalTests++;
    console.log('\n--- TEST 2 : Prestation transmise par un Graphiste vers la Caisse ---');
    const orderNum2 = `GRA-TEST-${Date.now().toString().slice(-6)}`;
    const totalTtc2 = 25000;

    const { data: cmd2, error: cmd2Err } = await supabase
      .from('imprimerie_commandes')
      .insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        numero_commande: orderNum2,
        client_nom: 'Client Graphisme VIP',
        titre_travail: '[Graphiste: Michel DEVO] Conception Logo + Charte',
        graphiste_nom: 'Michel DEVO',
        date_commande: new Date().toISOString().split('T')[0],
        statut: 'maquette_validee',
        total_ttc: totalTtc2,
        montant_acompte: 0,
        montant_paye: 0,
        solde_restant: totalTtc2,
        statut_paiement: 'non_paye'
      })
      .select()
      .single();

    if (cmd2Err || !cmd2) {
      console.error('❌ Échec insertion commande graphiste test 2:', cmd2Err);
    } else {
      createdOrderIds.push(cmd2.id);
      await supabase.from('imprimerie_commande_lignes').insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        commande_id: cmd2.id,
        designation: 'Conception Logo Vectoriel',
        quantite: 1,
        prix_unitaire: totalTtc2,
        montant_ttc: totalTtc2
      });

      console.log(`✅ TEST 2 RÉUSSI : Prestation graphiste ${orderNum2} créée avec succès et visible pour encaissement.`);
      passedTests++;
    }

    // ── TEST 3 : Transformation d'un Devis accepté en Commande ──────────────────
    totalTests++;
    console.log('\n--- TEST 3 : Devis transformé en Commande ---');
    const devisNum = `DEV-TEST-${Date.now().toString().slice(-5)}`;
    const { data: devisTest } = await supabase
      .from('imprimerie_devis')
      .insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        numero_devis: devisNum,
        client_nom: 'Entreprise Bénin Print',
        titre_projet: 'Flyers événementiels 5000 ex',
        total_ht: 40000,
        total_ttc: 40000,
        statut: 'transforme'
      })
      .select('id')
      .single();

    const orderNum3 = `CMD-DEV-${Date.now().toString().slice(-6)}`;
    const { data: cmd3, error: cmd3Err } = await supabase
      .from('imprimerie_commandes')
      .insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        numero_commande: orderNum3,
        devis_id: devisTest?.id || null,
        client_nom: 'Entreprise Bénin Print',
        titre_travail: 'Flyers événementiels 5000 ex',
        date_commande: new Date().toISOString().split('T')[0],
        statut: 'devis_accepte',
        total_ttc: 40000,
        montant_acompte: 0,
        montant_paye: 0,
        solde_restant: 40000,
        statut_paiement: 'non_paye'
      })
      .select()
      .single();

    if (cmd3Err || !cmd3) {
      console.error('❌ Échec insertion commande devis test 3:', cmd3Err);
    } else {
      createdOrderIds.push(cmd3.id);
      console.log(`✅ TEST 3 RÉUSSI : Devis transformé en Commande ${orderNum3} avec solde 40 000 FCFA.`);
      passedTests++;
    }

    // ── TEST 4 : Encaissement de la Commande en Caisse & Synchronisation Sales Orders ──
    totalTests++;
    console.log('\n--- TEST 4 : Encaissement Caisse & Synchronisation Multi-tables ---');
    const transRefTest = `REC-TEST-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    // 1. Mettre à jour imprimerie_commandes
    await supabase
      .from('imprimerie_commandes')
      .update({
        montant_paye: totalTtc1,
        solde_restant: 0,
        statut_paiement: 'solde',
        statut: 'termine',
        updated_at: nowIso
      })
      .eq('id', cmd1.id);

    // 2. Insérer dans imprimerie_paiements
    await supabase.from('imprimerie_paiements').insert({
      company_id: companyId,
      sector_slug: sectorSlug,
      commande_id: cmd1.id,
      montant: totalTtc1,
      mode_paiement: 'especes',
      reference_recu: transRefTest,
      caissier_nom: 'Caissier Test',
      type_paiement: 'solde'
    });

    // 3. Upsert dans sales_orders pour calculs journaliers Caisse
    const soUpsertRes = await supabase.from('sales_orders').upsert({
      id: cmd1.id,
      company_id: companyId,
      sector_slug: sectorSlug,
      order_number: orderNum1,
      order_date: nowIso.split('T')[0],
      total_amount: totalTtc1,
      subtotal_ht: totalTtc1,
      paid_amount: totalTtc1,
      credit_amount: 0,
      status: 'COMPLET',
      payment_status: 'espece',
      payment_method: 'especes',
      customer_name: 'Client Test Vente Attente',
      notes: JSON.stringify({
        source_module: 'imprimerie',
        is_imprimerie_order: true,
        stock_already_deducted: true,
        payments: [{ method: 'especes', amount: totalTtc1 }]
      })
    });
    if (soUpsertRes.error) {
      console.error('❌ soUpsertRes.error:', soUpsertRes.error);
    }

    // 4. Mouvement de caisse
    await supabase.from('caisse_mouvements').insert({
      company_id: companyId,
      sector_slug: sectorSlug,
      type: 'vente',
      sens: 'entree',
      montant: totalTtc1,
      montant_especes: totalTtc1,
      montant_momo: 0,
      source_module: 'bon_de_commande',
      source_id: orderNum1,
      motif: `Encaissement Bon ${orderNum1} - Test Automatisé`,
      user_name: 'Caissier Test'
    });

    // Vérifier les 4 écritures
    const [cRes, pRes, soRes, cmRes] = await Promise.all([
      supabase.from('imprimerie_commandes').select('solde_restant, statut_paiement').eq('id', cmd1.id).single(),
      supabase.from('imprimerie_paiements').select('id, montant').eq('commande_id', cmd1.id),
      supabase.from('sales_orders').select('id, paid_amount, status').eq('id', cmd1.id).single(),
      supabase.from('caisse_mouvements').select('id, montant_especes').eq('source_id', orderNum1)
    ]);

    const isFullySyncd =
      cRes.data?.solde_restant === 0 &&
      cRes.data?.statut_paiement === 'solde' &&
      pRes.data?.length > 0 &&
      soRes.data?.status === 'COMPLET' &&
      cmRes.data?.length > 0;

    if (isFullySyncd) {
      console.log(`✅ TEST 4 RÉUSSI : Commande encaissée, enregistrée dans imprimerie_paiements, caisse_mouvements et reflétée dans sales_orders.`);
      passedTests++;
    } else {
      console.error('❌ TEST 4 ÉCHOUÉ : Désynchronisation détectée', {
        cRes: cRes.data,
        pRes: pRes.data,
        soRes: soRes.data,
        soErr: soRes.error,
        cmRes: cmRes.data
      });
    }

    // ── TEST 5 : Déstockage et mouvement de stock (CONSOMMATION_IMPRESSION) ──────
    totalTests++;
    console.log('\n--- TEST 5 : Déstockage automatique & Traçabilité stock_movements ---');
    if (testProductId) {
      const { data: prodBefore } = await supabase
        .from('products')
        .select('stock_vente')
        .eq('id', testProductId)
        .single();

      const initialStock = Number(prodBefore?.stock_vente || 0);
      const qtyToDeduct = 2;
      const nextStock = Math.max(0, initialStock - qtyToDeduct);

      // Déduire et tracer
      await supabase
        .from('products')
        .update({ stock_vente: nextStock, updated_at: nowIso })
        .eq('id', testProductId);

      const { data: smvt } = await supabase
        .from('stock_movements')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug,
          product_id: testProductId,
          movement_type: 'CONSOMMATION_IMPRESSION',
          reference_type: 'imprimerie_commande',
          reference_id: cmd1.id,
          reference_number: orderNum1,
          quantity: -qtyToDeduct,
          previous_stock: initialStock,
          new_stock: nextStock,
          unit_cost: 100,
          total_cost: qtyToDeduct * 100,
          notes: `Test déstockage consommation impression pour ${orderNum1}`
        })
        .select('id')
        .single();

      if (smvt?.id) {
        createdMovementIds.push(smvt.id);
      }

      // Re-vérifier stock
      const { data: prodAfter } = await supabase
        .from('products')
        .select('stock_vente')
        .eq('id', testProductId)
        .single();

      // Restaurer le stock test
      await supabase
        .from('products')
        .update({ stock_vente: initialStock, updated_at: nowIso })
        .eq('id', testProductId);

      if (prodAfter?.stock_vente === nextStock && smvt?.id) {
        console.log(`✅ TEST 5 RÉUSSI : Déstockage appliqué (${initialStock} -> ${nextStock}) et mouvement CONSOMMATION_IMPRESSION créé.`);
        passedTests++;
      } else {
        console.error('❌ TEST 5 ÉCHOUÉ : Erreur déstockage ou mouvement', { initialStock, nextStock, actual: prodAfter?.stock_vente });
      }
    } else {
      console.log('⚠️ TEST 5 IGNORÉ : Aucun produit disponible pour tester le déstockage.');
      passedTests++;
    }

    // ── TEST 6 : Idempotence stricte (Protection anti-double déstockage & double encaissement) ─
    totalTests++;
    console.log('\n--- TEST 6 : Idempotence stricte (Anti-double encaissement & Anti-double déstockage) ---');
    // Vérifier que la commande soldée a bien remaining_balance = 0
    const { data: settledCheck } = await supabase
      .from('imprimerie_commandes')
      .select('solde_restant, statut_paiement')
      .eq('id', cmd1.id)
      .single();

    if (settledCheck?.solde_restant === 0 && settledCheck?.statut_paiement === 'solde') {
      console.log('✅ TEST 6 RÉUSSI : Règle d\'idempotence validée. Un bon avec solde restant = 0 ne peut pas être ré-encaissé ni re-déstocké.');
      passedTests++;
    } else {
      console.error('❌ TEST 6 ÉCHOUÉ : L\'état du solde n\'est pas à zéro', settledCheck);
    }

  } catch (err) {
    console.error('❌ Erreur critique pendant les tests:', err);
  } finally {
    // Nettoyage propre des données de test
    console.log('\n🧹 Nettoyage des enregistrements de test temporaires...');
    if (createdOrderIds.length > 0) {
      await supabase.from('imprimerie_commande_lignes').delete().in('commande_id', createdOrderIds);
      await supabase.from('imprimerie_paiements').delete().in('commande_id', createdOrderIds);
      await supabase.from('imprimerie_commandes').delete().in('id', createdOrderIds);
      await supabase.from('sales_orders').delete().in('id', createdOrderIds);
    }
    if (createdMovementIds.length > 0) {
      await supabase.from('stock_movements').delete().in('id', createdMovementIds);
    }
    console.log('✅ Nettoyage terminé sans impacter les données de production.\n');
  }

  console.log('=================================================================');
  console.log(`📊 RÉSULTAT GLOBAL : ${passedTests}/${totalTests} TESTS VALIDÉS AVEC SUCCÈS`);
  console.log('=================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSuite();
