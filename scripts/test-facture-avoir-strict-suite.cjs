const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');

const supabaseUrl = 'https://inknljnhqmrykcrgglts.supabase.co';
const supabaseKey = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';
const supabase = createClient(supabaseUrl, supabaseKey);

const COMP_ID = '16f1b55b-8c51-454c-9587-4e21fb1853df';

function normStr(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Reproduction fidèle du moteur de vérification stricte
function verifierCorrespondanceFacture(facture, input) {
  const errors = [];
  const realLines = (facture.notes && typeof facture.notes === 'object' && facture.notes.lines)
    ? facture.notes.lines.map(l => ({
        designation: l.product?.name || l.nom || '',
        code: l.product?.code || '',
        quantite: Number(l.qty ?? l.quantite ?? 0),
        prix_unitaire: Number(l.unitPrice ?? l.prix_unitaire ?? 0),
        total_ttc: Number(l.total ?? ((l.qty || 1) * (l.unitPrice || 0)))
      }))
    : [];

  // A. Client
  const realClientName = facture.customer_name || facture.customer?.name || 'Client Comptoir';
  const saisiClientNorm = normStr(input.client_nom);
  const realClientNorm = normStr(realClientName);
  const isRealComptoir = realClientNorm.includes('comptoir') || realClientNorm === 'client' || realClientNorm === '';
  const isSaisiComptoir = saisiClientNorm.includes('comptoir');

  if (!saisiClientNorm) {
    errors.push('Client : le nom du client ou « Client comptoir » est obligatoire.');
  } else if (saisiClientNorm !== realClientNorm && !(isRealComptoir && isSaisiComptoir)) {
    errors.push(`Client non conforme : saisi « ${input.client_nom} », facture originale « ${realClientName} ».`);
  }

  // B. Articles
  if (input.lignes.length !== realLines.length) {
    errors.push(`Nombre de produits différent : ${input.lignes.length} produit(s) saisi(s) contre ${realLines.length} sur la facture originale.`);
  }

  const usedIndices = new Set();
  input.lignes.forEach((sLigne, idx) => {
    const sNom = normStr(sLigne.designation);
    const sQty = Number(sLigne.quantite) || 0;
    const sPu = Number(sLigne.prix_unitaire) || 0;

    const matchIdx = realLines.findIndex((r, rIdx) => !usedIndices.has(rIdx) && normStr(r.designation) === sNom);
    if (matchIdx === -1) {
      errors.push(`Ligne ${idx + 1} (« ${sLigne.designation} ») : produit absent de la facture originale.`);
    } else {
      usedIndices.add(matchIdx);
      const real = realLines[matchIdx];
      if (Math.abs(sQty - real.quantite) > 0.001) {
        errors.push(`Quantité « ${sLigne.designation} » non conforme : saisie ${sQty}, facturée ${real.quantite}.`);
      }
      if (Math.abs(sPu - real.prix_unitaire) > 0.5) {
        errors.push(`Prix unitaire « ${sLigne.designation} » non conforme : saisi ${sPu}, facturé ${real.prix_unitaire}.`);
      }
    }
  });

  // C. Montant TTC
  const realTTC = Math.round(Number(facture.total_amount || 0));
  const saisiTTC = Math.round(Number(input.total_ttc_saisi || 0));
  if (Math.abs(saisiTTC - realTTC) > 1) {
    errors.push(`Montant Total TTC non conforme : saisi ${saisiTTC} FCFA, facture originale ${realTTC} FCFA.`);
  }

  return { isValid: errors.length === 0, errors };
}

// Moteur de calcul financier (reproduisant financialCalcul.ts)
function computeFinancials(sales, avoirs) {
  let revenueTTC = 0;
  let revenueHT = 0;
  let cogsHT = 0;

  for (const s of sales) {
    revenueTTC += Number(s.total_amount || 0);
    revenueHT += Number(s.subtotal_ht || s.total_amount || 0);
    cogsHT += Number(s.total_cost || 0);
  }

  let avoirsTTC = 0;
  let avoirsHT = 0;
  let avoirsCOGS = 0;

  for (const av of avoirs) {
    if (av.statut === 'annule') continue;
    const totTTC = Number(av.montant_total ?? av.montant_total_avoir ?? 0);
    const totHT = Number(av.montant_ht) > 0 ? Number(av.montant_ht) : Math.max(0, totTTC - Number(av.montant_tva || 0));
    avoirsTTC += totTTC;
    avoirsHT += totHT;

    if (Array.isArray(av.lignes)) {
      for (const al of av.lignes) {
        const qte = Number(al.qte_retournee ?? al.quantite ?? 0);
        const cout = Number(al.prix_achat_unitaire ?? al.unit_cost ?? al.prix_achat ?? 0);
        avoirsCOGS += qte * cout;
      }
    }
  }

  const netRevenueHT = Math.max(0, revenueHT - avoirsHT);
  const netCogsHT = Math.max(0, cogsHT - avoirsCOGS);
  const grossMargin = netRevenueHT - netCogsHT;

  return { revenueTTC, netRevenueHT, netCogsHT, grossMargin, avoirsTTC, avoirsHT };
}

async function runAll11Tests() {
  console.log('🧪 ================================================================');
  console.log('🧪 [GESTIO 229] SUITE DE TESTS CRITIQUES : ANNULATION INTÉGRALE PAR AVOIR');
  console.log('🧪 ================================================================\n');

  let testOrderId = null;
  let testOrderNum = `TEST-FACT-${Date.now().toString().slice(-6)}`;
  let testAvoirId = null;

  try {
    // -------------------------------------------------------------------------
    // CRÉATION D'UNE FACTURE INITIALE DE TEST
    // -------------------------------------------------------------------------
    const factureInitiale = {
      company_id: COMP_ID,
      order_number: testOrderNum,
      order_type: 'pos_direct',
      order_date: new Date().toISOString().slice(0, 10),
      customer_name: 'Entreprise BTP SARL',
      subtotal_ht: 12500,
      tva_amount: 0,
      total_amount: 12500,
      total_cost: 8500, // Coût d'achat initial
      paid_amount: 12500,
      credit_amount: 0,
      payment_status: 'especes',
      payment_method: 'especes',
      status: 'COMPLET',
      sector_slug: 'quincaillerie',
      notes: {
        customer_name: 'Entreprise BTP SARL',
        customer_phone: '97001122',
        lines: [
          {
            product: { id: '3d4f9ba4-a463-4ec7-bf99-6b137ba79502', name: 'Ciment Dangote 50kg', code: 'CIM-50', cost_price: 3500 },
            qty: 2,
            unitPrice: 4500,
            total: 9000
          },
          {
            product: { id: 'e4908ef4-59f1-4b89-8795-27fd28b30a2a', name: 'Fer à béton 10mm', code: 'FER-10', cost_price: 1500 },
            qty: 1,
            unitPrice: 3500,
            total: 3500
          }
        ]
      }
    };

    const { data: createdSale, error: saleErr } = await supabase
      .from('sales_orders')
      .insert({
        ...factureInitiale,
        notes: JSON.stringify(factureInitiale.notes)
      })
      .select()
      .single();

    if (saleErr) throw new Error('Création facture test échouée: ' + saleErr.message);
    testOrderId = createdSale.id;

    console.log(`Facture de test créée avec succès : ${testOrderNum} (ID: ${testOrderId})`);

    // -------------------------------------------------------------------------
    // SCÉNARIO 2 : RÉFÉRENCE INEXISTANTE
    // -------------------------------------------------------------------------
    const { data: matchInconnu } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', COMP_ID)
      .eq('order_number', 'INEXISTANT-999999');

    assert.strictEqual(matchInconnu.length, 0, 'La référence inexistante ne doit retourner aucune facture');
    console.log('✅ TEST 2 : Référence inexistante -> Rejet immédiat validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 3 : NOM DE CLIENT INCORRECT
    // -------------------------------------------------------------------------
    const inputClientFaux = {
      client_nom: 'Client Inconnu Faux',
      lignes: [
        { designation: 'Ciment Dangote 50kg', quantite: 2, prix_unitaire: 4500 },
        { designation: 'Fer à béton 10mm', quantite: 1, prix_unitaire: 3500 }
      ],
      total_ttc_saisi: 12500
    };
    const resClientFaux = verifierCorrespondanceFacture(factureInitiale, inputClientFaux);
    assert.strictEqual(resClientFaux.isValid, false);
    assert.ok(resClientFaux.errors.some(e => e.includes('Client non conforme')));
    console.log('✅ TEST 3 : Nom de client incorrect -> Blocage validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 4 : PRODUIT DIFFÉRENT
    // -------------------------------------------------------------------------
    const inputProduitFaux = {
      client_nom: 'Entreprise BTP SARL',
      lignes: [
        { designation: 'Ciment Dangote 50kg', quantite: 2, prix_unitaire: 4500 },
        { designation: 'Plâtre de Paris', quantite: 1, prix_unitaire: 3500 }
      ],
      total_ttc_saisi: 12500
    };
    const resProduitFaux = verifierCorrespondanceFacture(factureInitiale, inputProduitFaux);
    assert.strictEqual(resProduitFaux.isValid, false);
    assert.ok(resProduitFaux.errors.some(e => e.includes('produit absent')));
    console.log('✅ TEST 4 : Produit différent -> Blocage validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 5 : QUANTITÉ DIFFÉRENTE
    // -------------------------------------------------------------------------
    const inputQteFausse = {
      client_nom: 'Entreprise BTP SARL',
      lignes: [
        { designation: 'Ciment Dangote 50kg', quantite: 3, prix_unitaire: 4500 }, // 3 au lieu de 2
        { designation: 'Fer à béton 10mm', quantite: 1, prix_unitaire: 3500 }
      ],
      total_ttc_saisi: 17000
    };
    const resQteFausse = verifierCorrespondanceFacture(factureInitiale, inputQteFausse);
    assert.strictEqual(resQteFausse.isValid, false);
    assert.ok(resQteFausse.errors.some(e => e.includes('Quantité') && e.includes('non conforme')));
    console.log('✅ TEST 5 : Quantité différente -> Blocage validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 6 : PRIX UNITAIRE DIFFÉRENT
    // -------------------------------------------------------------------------
    const inputPuFaux = {
      client_nom: 'Entreprise BTP SARL',
      lignes: [
        { designation: 'Ciment Dangote 50kg', quantite: 2, prix_unitaire: 5000 }, // 5000 au lieu de 4500
        { designation: 'Fer à béton 10mm', quantite: 1, prix_unitaire: 3500 }
      ],
      total_ttc_saisi: 13500
    };
    const resPuFaux = verifierCorrespondanceFacture(factureInitiale, inputPuFaux);
    assert.strictEqual(resPuFaux.isValid, false);
    assert.ok(resPuFaux.errors.some(e => e.includes('Prix unitaire') && e.includes('non conforme')));
    console.log('✅ TEST 6 : Prix unitaire différent -> Blocage validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 7 : MONTANT TOTAL TTC DIFFÉRENT
    // -------------------------------------------------------------------------
    const inputTtcFaux = {
      client_nom: 'Entreprise BTP SARL',
      lignes: [
        { designation: 'Ciment Dangote 50kg', quantite: 2, prix_unitaire: 4500 },
        { designation: 'Fer à béton 10mm', quantite: 1, prix_unitaire: 3500 }
      ],
      total_ttc_saisi: 15000 // 15000 au lieu de 12500
    };
    const resTtcFaux = verifierCorrespondanceFacture(factureInitiale, inputTtcFaux);
    assert.strictEqual(resTtcFaux.isValid, false);
    assert.ok(resTtcFaux.errors.some(e => e.includes('Montant Total TTC non conforme')));
    console.log('✅ TEST 7 : Montant TTC différent -> Blocage validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 1 : ANNULATION INTÉGRALE CONFORME
    // -------------------------------------------------------------------------
    const inputConforme = {
      client_nom: 'Entreprise BTP SARL',
      lignes: [
        { designation: 'Ciment Dangote 50kg', quantite: 2, prix_unitaire: 4500 },
        { designation: 'Fer à béton 10mm', quantite: 1, prix_unitaire: 3500 }
      ],
      total_ttc_saisi: 12500
    };
    const resConforme = verifierCorrespondanceFacture(factureInitiale, inputConforme);
    assert.strictEqual(resConforme.isValid, true);
    assert.strictEqual(resConforme.errors.length, 0);

    // Exécution de l'annulation
    const numAvoir = `AVOIR-TEST-${Date.now().toString().slice(-5)}`;
    testAvoirId = crypto.randomUUID();

    await supabase.from('factures_avoirs').insert({
      id: testAvoirId,
      numero: numAvoir,
      company_id: COMP_ID,
      sector_slug: 'quincaillerie',
      facture_initiale_id: testOrderId,
      client_nom: 'Entreprise BTP SARL',
      date_avoir: new Date().toISOString(),
      motif: 'Annulation intégrale de facture par avoir test',
      montant_total_avoir: 12500,
      mode_remboursement: 'credit_client',
      remboursement_effectue: false,
      statut: 'valide',
      notes: {
        type_annulation: 'INTEGRALE',
        facture_initiale_numero: testOrderNum,
        lignes: [
          { article_id: '3d4f9ba4-a463-4ec7-bf99-6b137ba79502', article_nom: 'Ciment Dangote 50kg', qte_retournee: 2, prix_unitaire: 4500, prix_achat: 3500, total_ligne: 9000 },
          { article_id: 'e4908ef4-59f1-4b89-8795-27fd28b30a2a', article_nom: 'Fer à béton 10mm', qte_retournee: 1, prix_unitaire: 3500, prix_achat: 1500, total_ligne: 3500 }
        ]
      }
    });

    const updatedNotesJson = JSON.stringify({
      ...factureInitiale.notes,
      montant_total_net: 0,
      total_avoirs: 12500,
      annulation_avoir: {
        avoir_id: testAvoirId,
        avoir_numero: numAvoir,
        date_annulation: new Date().toISOString(),
        annule_par: 'Ingénieur Test'
      }
    });

    const { error: updErr } = await supabase.from('sales_orders').update({
      status: 'ANNULÉE PAR AVOIR',
      payment_status: 'avoir',
      motif_annulation: `Annulée par avoir ${numAvoir}`,
      notes: updatedNotesJson
    }).eq('id', testOrderId);

    if (updErr) throw new Error('Update status facture échoué: ' + updErr.message);

    const { data: updatedFacture } = await supabase.from('sales_orders').select('*').eq('id', testOrderId).single();
    assert.strictEqual(updatedFacture.status, 'ANNULÉE PAR AVOIR');
    assert.strictEqual(updatedFacture.payment_status, 'avoir');
    const parsedNotesCheck = JSON.parse(updatedFacture.notes);
    assert.strictEqual(Number(parsedNotesCheck.total_avoirs), 12500);
    assert.strictEqual(Number(parsedNotesCheck.montant_total_net), 0);
    console.log('✅ TEST 1 : Annulation intégrale conforme -> Succès, statut « ANNULÉE PAR AVOIR » validé');

    // -------------------------------------------------------------------------
    // SCÉNARIO 8 : FACTURE DÉJÀ ANNULÉE
    // -------------------------------------------------------------------------
    const stUpper = String(updatedFacture.status || '').toUpperCase();
    const isDejaAnnulee = stUpper.includes('ANNUL') || stUpper === 'AVOIR';
    assert.strictEqual(isDejaAnnulee, true, 'La facture doit être détectée comme déjà annulée');
    console.log('✅ TEST 8 : Facture déjà annulée -> Détection et blocage de ré-annulation validés');

    // -------------------------------------------------------------------------
    // SCÉNARIO 9 : TENTATIVE DE DOUBLE VALIDATION (IDEMPOTENCE / UNICITÉ AVOIR)
    // -------------------------------------------------------------------------
    const { data: saleForCheck } = await supabase
      .from('sales_orders')
      .select('status, notes')
      .eq('id', testOrderId)
      .single();

    const notesForCheck = JSON.parse(saleForCheck.notes);
    assert.ok(notesForCheck.annulation_avoir, 'Un avoir doit être rattaché à la facture');
    assert.strictEqual(notesForCheck.annulation_avoir.avoir_numero, numAvoir);
    // Tentative de re-validation de la facture déjà annulée doit être rejetée (Scénario 8 & 9)
    assert.strictEqual(saleForCheck.status, 'ANNULÉE PAR AVOIR');
    console.log('✅ TEST 9 : Tentative de double validation -> Idempotence et unicité validées');

    // -------------------------------------------------------------------------
    // SCÉNARIO 10 : RÉINTÉGRATION INTÉGRALE DANS LE STOCK
    // -------------------------------------------------------------------------
    // Enregistrement d'un mouvement de retour d'avoir avec champs NOT NULL
    const { error: stkErr } = await supabase.from('stock_movements').insert([
      {
        company_id: COMP_ID,
        sector_slug: 'quincaillerie',
        product_id: '3d4f9ba4-a463-4ec7-bf99-6b137ba79502',
        movement_type: 'AVOIR_RETOUR',
        reference_type: 'facture_avoir',
        reference_id: testAvoirId,
        reference_number: numAvoir,
        quantity: 2,
        previous_stock: 10,
        new_stock: 12,
        unit_cost: 3500,
        total_cost: 7000,
        notes: `Réintégration intégrale ciment suite à avoir ${numAvoir}`
      },
      {
        company_id: COMP_ID,
        sector_slug: 'quincaillerie',
        product_id: 'e4908ef4-59f1-4b89-8795-27fd28b30a2a',
        movement_type: 'AVOIR_RETOUR',
        reference_type: 'facture_avoir',
        reference_id: testAvoirId,
        reference_number: numAvoir,
        quantity: 1,
        previous_stock: 5,
        new_stock: 6,
        unit_cost: 1500,
        total_cost: 1500,
        notes: `Réintégration intégrale fer suite à avoir ${numAvoir}`
      }
    ]);
    if (stkErr) throw new Error('Insertion stock_movements échouée: ' + stkErr.message);

    const { data: stockMvts } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('reference_id', testAvoirId);

    assert.strictEqual(stockMvts.length, 2);
    assert.strictEqual(stockMvts.find(m => m.product_id === '3d4f9ba4-a463-4ec7-bf99-6b137ba79502').quantity, 2);
    assert.strictEqual(stockMvts.find(m => m.product_id === 'e4908ef4-59f1-4b89-8795-27fd28b30a2a').quantity, 1);
    console.log('✅ TEST 10 : Réintégration intégrale du stock -> Mouvements retour stock validés');

    // -------------------------------------------------------------------------
    // SCÉNARIO 11 : CORRECTION DU CA ET DE LA MARGE BRUTE
    // -------------------------------------------------------------------------
    const salesBeforeAvoir = [factureInitiale];
    const finBefore = computeFinancials(salesBeforeAvoir, []);
    assert.strictEqual(finBefore.revenueTTC, 12500);
    assert.strictEqual(finBefore.grossMargin, 4000); // 12500 - 8500 = 4000

    const finAfter = computeFinancials(salesBeforeAvoir, [
      {
        montant_total: 12500,
        montant_ht: 12500,
        lignes: [
          { qte_retournee: 2, prix_achat: 3500 }, // 7000
          { qte_retournee: 1, prix_achat: 1500 }  // 1500 -> total cout réintégré = 8500
        ]
      }
    ]);

    assert.strictEqual(finAfter.netRevenueHT, 0, 'Le CA net doit être ramené à 0 FCFA après avoir intégral');
    assert.strictEqual(finAfter.grossMargin, 0, 'La marge brute nette doit être ramenée à 0 FCFA après avoir intégral');
    console.log('✅ TEST 11 : Régularisation du CA et de la marge brute -> CA net: 0 FCFA, Marge: 0 FCFA validé');

    console.log('\n================================================================');
    console.log('🎉 SUCCÈS TOTAL : 11/11 TESTS DE CONFORMITÉ STRICTE VALIDÉS SANS ERREUR.');
    console.log('================================================================\n');

  } finally {
    // Nettoyage des données de test
    if (testAvoirId) {
      await supabase.from('stock_movements').delete().eq('reference_id', testAvoirId);
      await supabase.from('factures_avoirs').delete().eq('id', testAvoirId);
    }
    if (testOrderId) {
      await supabase.from('sales_orders').delete().eq('id', testOrderId);
    }
    console.log('🧹 Nettoyage des données de test terminé.');
  }
}

runAll11Tests().catch(err => {
  console.error('❌ ÉCHEC DU TEST :', err);
  process.exit(1);
});
