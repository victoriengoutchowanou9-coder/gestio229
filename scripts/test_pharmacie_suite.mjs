/**
 * Suite de tests automatisés pour le secteur Pharmacie & Dépôt Médical de GESTIO229
 * Exécutable via `npx tsx scripts/test_pharmacie_suite.mjs`
 */
import assert from 'assert';

console.log('--- DÉMARRAGE DES TESTS : SECTEUR PHARMACIE & DÉPÔT MÉDICAL ---');

// Mock localStorage pour environnement Node
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

async function runTests() {
  const { pharmacieService } = await import('../src/services/pharmacieService.ts');
  const testCompanyId = 'b0000000-0000-0000-0000-000000000303';

  // [TEST 1] Création d'un produit pharmaceutique et réception d'un lot avec péremption
  console.log('\n[TEST 1] Création produit pharmaceutique et réception d\'un lot avec péremption...');
  const produit = await pharmacieService.saveProduit(testCompanyId, {
    nom_commercial: 'Ciprofloxacine 500mg',
    dci: 'Ciprofloxacine',
    forme_galenique: 'Comprimé pelliculé',
    dosage: '500 mg',
    conditionnement: 'Boîte de 10',
    unite_vente: 'Boîte',
    laboratoire_fabricant: 'Bayer',
    famille_therapeutique: 'Antibactérien (Fluoroquinolone)',
    classe_tableau: 'LISTE_I',
    necessite_ordonnance: true,
    conditions_conservation: 'AMBIANTE',
    prix_achat_ht: 2500,
    prix_vente_ttc: 3800,
    stock_minimum_alerte: 10,
    stock_securite: 5,
  });

  assert.ok(produit && produit.id, 'Le produit doit être enregistré');
  assert.strictEqual(produit.necessite_ordonnance, true, 'L\'ordonnance doit être requise');

  const datePeremptionFuture = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  const lot = await pharmacieService.saveLot(testCompanyId, {
    produit_id: produit.id,
    produit_nom: produit.nom_commercial,
    numero_lot: 'BAY-CIP-9081',
    date_peremption: datePeremptionFuture,
    quantite_initiale: 30,
    quantite_actuelle: 30,
    fournisseur_nom: 'UBIPHARM Bénin',
    prix_achat_unitaire: 2500,
    statut: 'DISPONIBLE',
  });

  assert.ok(lot && lot.id, 'Le lot doit être enregistré');
  assert.strictEqual(lot.quantite_actuelle, 30, 'Le stock initial du lot doit être 30');
  console.log('✅ Test 1 validé : Produit créé et lot réceptionné avec traçabilité complète.');

  // [TEST 2] Traçabilité du fournisseur et mouvements de stock
  console.log('\n[TEST 2] Vérification des mouvements de stock et traçabilité fournisseur...');
  const mvts = await pharmacieService.getMouvementsStock(testCompanyId);
  const mvtEntree = mvts.find((m) => m.lot_id === lot.id && m.type_mouvement === 'ENTREE_RECEPTION');
  assert.ok(mvtEntree, 'Le mouvement d\'entrée en stock doit être tracé');
  assert.strictEqual(mvtEntree.quantite, 30, 'La quantité d\'entrée doit être 30');
  console.log('✅ Test 2 validé : Mouvement d\'entrée en stock dûment tracé.');

  // [TEST 3] Principe FEFO : Sélection automatique du lot le plus proche en péremption
  console.log('\n[TEST 3] Test du principe FEFO (First Expired, First Out)...');
  // Créons un second lot expirant plus tôt
  const datePeremptionProche = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const lotProche = await pharmacieService.saveLot(testCompanyId, {
    produit_id: produit.id,
    produit_nom: produit.nom_commercial,
    numero_lot: 'BAY-CIP-URGENT',
    date_peremption: datePeremptionProche,
    quantite_initiale: 15,
    quantite_actuelle: 15,
    fournisseur_nom: 'CAME Cotonou',
    prix_achat_unitaire: 2500,
    statut: 'DISPONIBLE',
  });

  const lotsFEFO = await pharmacieService.getLotsDisponiblesFEFO(testCompanyId, produit.id);
  assert.ok(lotsFEFO.length >= 2, 'Les deux lots doivent être disponibles');
  assert.strictEqual(lotsFEFO[0].id, lotProche.id, 'Le lot expirant dans 60j doit être proposé en priorité 1ère');
  console.log('✅ Test 3 validé : Principe FEFO certifié (priorité absolue au lot le plus proche de péremption).');

  // [TEST 4] Blocage strict de la vente d'un lot périmé
  console.log('\n[TEST 4] Test du blocage strict des lots périmés...');
  const dateExpiree = '2023-01-01';
  const lotPerime = await pharmacieService.saveLot(testCompanyId, {
    produit_id: produit.id,
    produit_nom: produit.nom_commercial,
    numero_lot: 'BAY-EXPIRED',
    date_peremption: dateExpiree,
    quantite_initiale: 5,
    quantite_actuelle: 5,
    fournisseur_nom: 'Direct',
    prix_achat_unitaire: 2500,
    statut: 'BLOQUE',
  });

  let ventePerimeeRejetee = false;
  try {
    await pharmacieService.enregistrerVenteComptoir(testCompanyId, {
      company_id: testCompanyId,
      vendeur_id: 'usr-1',
      vendeur_nom: 'Pharmacien',
      client_nom: 'Patient Test',
      est_tiers_payant: false,
      part_assurance: 0,
      part_patient: 3800,
      lignes: [
        {
          produit_id: produit.id,
          lot_id: lotPerime.id,
          numero_lot: lotPerime.numero_lot,
          nom_commercial: produit.nom_commercial,
          dci: produit.dci,
          forme: produit.forme_galenique,
          dosage: produit.dosage,
          date_peremption: dateExpiree,
          quantite: 1,
          prix_unitaire: 3800,
          total_ligne: 3800,
        },
      ],
      montant_total_brut: 3800,
      remise_globale: 0,
      montant_net_ttc: 3800,
      montant_encaisse: 3800,
      monnaie_rendue: 0,
      mode_reglement: 'ESPECES',
    });
  } catch (err) {
    ventePerimeeRejetee = true;
  }
  assert.strictEqual(ventePerimeeRejetee, true, 'La vente d\'un lot périmé ou bloqué doit être strictement rejetée');
  console.log('✅ Test 4 validé : Blocage impératif de sécurité sanitaire certifié pour lot périmé.');

  // [TEST 5] Vente valide au comptoir avec déstockage et liaison Caisse
  console.log('\n[TEST 5] Vente au comptoir d\'un lot valide avec déstockage et encaissement caisse...');
  const venteValide = await pharmacieService.enregistrerVenteComptoir(testCompanyId, {
    company_id: testCompanyId,
    vendeur_id: 'usr-1',
    vendeur_nom: 'Pharmacien',
    client_nom: 'M. Mensah',
    est_tiers_payant: false,
    part_assurance: 0,
    part_patient: 3800 * 2,
    lignes: [
      {
        produit_id: produit.id,
        lot_id: lotProche.id,
        numero_lot: lotProche.numero_lot,
        nom_commercial: produit.nom_commercial,
        dci: produit.dci,
        forme: produit.forme_galenique,
        dosage: produit.dosage,
        date_peremption: lotProche.date_peremption,
        quantite: 2,
        prix_unitaire: 3800,
        total_ligne: 7600,
      },
    ],
    montant_total_brut: 7600,
    remise_globale: 0,
    montant_net_ttc: 7600,
    montant_encaisse: 8000,
    monnaie_rendue: 400,
    mode_reglement: 'ESPECES',
  });

  assert.ok(venteValide && venteValide.id, 'La vente doit être finalisée');
  assert.ok(venteValide.reference_ticket.startsWith('PH-'), 'Le ticket doit avoir un préfixe PH-');

  // Vérification du stock restant sur le lot
  const lotsApresVente = await pharmacieService.getLots(testCompanyId);
  const lotApres = lotsApresVente.find((l) => l.id === lotProche.id);
  assert.strictEqual(lotApres.quantite_actuelle, 13, 'Le stock du lot proche doit être passé de 15 à 13');
  console.log('✅ Test 5 validé : Vente enregistrée, stock du lot décrémenté et ticket de caisse généré.');

  // [TEST 6] Traitement des ordonnances et délivrance partielle
  console.log('\n[TEST 6] Enregistrement d\'une ordonnance et suivi de dispensation...');
  const ord = await pharmacieService.saveOrdonnance(testCompanyId, {
    patient_nom: 'Mme Bio Bio',
    prescripteur_nom: 'Dr. Adovi',
    lignes: [
      {
        id: 'l-ord-t1',
        medicament_ou_dci: 'Ciprofloxacine',
        dosage: '500 mg',
        forme: 'Comprimé',
        posologie: '1 cp × 2/j pendant 5 jours',
        quantite_prescrite: 2,
        quantite_delivree: 0,
        solde_a_servir: 2,
      },
    ],
  });

  assert.strictEqual(ord.statut, 'EN_ATTENTE', 'L\'ordonnance neuve doit être en attente');

  // Délivrons 1 boîte
  await pharmacieService.actualiserDelivranceOrdonnance(testCompanyId, ord.id, [
    {
      produit_id: produit.id,
      lot_id: lotProche.id,
      numero_lot: lotProche.numero_lot,
      nom_commercial: produit.nom_commercial,
      dci: produit.dci,
      forme: 'Comprimé',
      dosage: '500 mg',
      date_peremption: lotProche.date_peremption,
      quantite: 1,
      prix_unitaire: 3800,
      total_ligne: 3800,
    },
  ]);

  const ordsApres = await pharmacieService.getOrdonnances(testCompanyId);
  const ordMaj = ordsApres.find((o) => o.id === ord.id);
  assert.strictEqual(ordMaj.statut, 'PARTIELLE', 'Le statut doit passer à PARTIELLE');
  assert.strictEqual(ordMaj.lignes[0].quantite_delivree, 1, '1 boîte doit être délivrée');
  assert.strictEqual(ordMaj.lignes[0].solde_a_servir, 1, 'Il reste 1 boîte à servir');
  console.log('✅ Test 6 validé : Traçabilité ordonnance et gestion de la délivrance partielle réussie.');

  // [TEST 7] Pharmacovigilance & Rappel officiel de lot sanitaire
  console.log('\n[TEST 7] Pharmacovigilance : Déclaration de rappel sanitaire et blocage immédiat...');
  const rappel = await pharmacieService.declarerRappelOuIncident(testCompanyId, {
    titre: 'Alerte ABMed Rappel Lot Bayer',
    origine_alerte: 'ABMED',
    emetteur_nom: 'Agence Béninoise du Médicament',
    date_alerte: new Date().toISOString().slice(0, 10),
    produit_id: produit.id,
    produit_nom: produit.nom_commercial,
    lot_id: lot.id,
    numero_lot: lot.numero_lot,
    motif_rappel: 'Défaut de scellage opercule constaté sur la série',
    gravite: 'MAJEURE_NIVEAU_2',
    mesures_prises: 'Lot mis en quarantaine sous clé',
    statut: 'EN_COURS',
    responsable_nom: 'Pharmacien Titulaire',
  });

  assert.ok(rappel && rappel.reference_alerte.startsWith('RAP-'), 'Le rappel doit générer une référence');
  assert.strictEqual(rappel.quantite_stock_actuel_bloquee, 30, 'Les 30 boîtes en stock doivent être identifiées comme bloquées');

  // Vérifions que le lot est désormais en statut RAPPELE
  const lotsApresRappel = await pharmacieService.getLots(testCompanyId);
  const lotBloque = lotsApresRappel.find((l) => l.id === lot.id);
  assert.strictEqual(lotBloque.statut, 'RAPPELE', 'Le lot doit être marqué RAPPELE');
  console.log('✅ Test 7 validé : Rappel sanitaire enregistré, lot bloqué et traçabilité des volumes restants.');

  // [TEST 8] Transfert Inter-Dépôts (Réserve vers Comptoir)
  console.log('\n[TEST 8] Transfert inter-dépôts (Réserve -> Comptoir)...');
  const depots = await pharmacieService.getDepots(testCompanyId);
  const depComptoir = depots[0];
  const depReserve = depots[1];

  const transfert = await pharmacieService.creerTransfert(testCompanyId, {
    company_id: testCompanyId,
    depot_source_id: depReserve.id,
    depot_source_nom: depReserve.nom,
    depot_destination_id: depComptoir.id,
    depot_destination_nom: depComptoir.nom,
    expediteur_nom: 'Magasinier',
    lignes: [
      {
        produit_id: produit.id,
        produit_nom: produit.nom_commercial,
        lot_id: lotProche.id,
        numero_lot: lotProche.numero_lot,
        date_peremption: lotProche.date_peremption,
        quantite: 5,
      },
    ],
  });

  assert.strictEqual(transfert.statut, 'EN_ATTENTE', 'Le transfert doit débuter en attente');
  const trfValide = await pharmacieService.validerReceptionTransfert(testCompanyId, transfert.id, 'Pharmacien Comptoir');
  assert.strictEqual(trfValide.statut, 'RECEPTIONNE', 'Le transfert doit être validé réceptionné');
  console.log('✅ Test 8 validé : Transfert inter-dépôts exécuté et réceptionné avec exactitude.');

  // [TEST 9] Inventaire physique et calcul des écarts
  console.log('\n[TEST 9] Inventaire physique et journal des écarts...');
  const inv = await pharmacieService.validerInventaire(
    testCompanyId,
    {
      company_id: testCompanyId,
      depot_id: depComptoir.id,
      depot_nom: depComptoir.nom,
      date_inventaire: new Date().toISOString().slice(0, 10),
      responsable_nom: 'Pharmacien Auditeur',
      lignes: [
        {
          produit_id: produit.id,
          produit_nom: produit.nom_commercial,
          lot_id: lotProche.id,
          numero_lot: lotProche.numero_lot,
          date_peremption: lotProche.date_peremption,
          stock_theorique: 8,
          stock_compte: 7, // 1 boîte manquante constatée
          ecart_quantite: -1,
          prix_achat_unitaire: 2500,
          valeur_ecart: -2500,
        },
      ],
      total_ecart_positif: 0,
      total_ecart_negatif: 1,
      valeur_nette_ecart: -2500,
    },
    'Pharmacien Auditeur'
  );

  assert.strictEqual(inv.statut, 'VALIDE_AJUSTE', 'L\'inventaire doit être validé');
  assert.strictEqual(inv.total_ecart_negatif, 1, 'L\'écart négatif de 1 boîte doit être tracé');
  console.log('✅ Test 9 validé : Inventaire physique rapproché et écarts enregistrés.');

  // [TEST 10] Calcul des KPIs en temps réel du Cockpit Pharmacie
  console.log('\n[TEST 10] Calcul des KPIs et rentabilité du Cockpit Officine...');
  const metrics = await pharmacieService.getDashboardMetrics(testCompanyId);
  assert.ok(typeof metrics.caAujourdhui === 'number', 'Le CA du jour doit être calculé');
  assert.ok(typeof metrics.valeurStockAchat === 'number', 'La valeur de stock doit être calculée');
  assert.ok(typeof metrics.lotsExpiresCount === 'number', 'Le décompte des lots expirés doit être calculé');
  console.log(`KPIs calculés : CA Jour=${metrics.caAujourdhui} F, Valeur Stock=${metrics.valeurStockAchat} F, Lots Expirés/Bloqués=${metrics.lotsExpiresCount}`);
  console.log('✅ Test 10 validé : KPIs en temps réel du Cockpit Officine fonctionnels.');

  console.log('\n=============================================================');
  console.log('🎉 TOUS LES 10 TESTS DU MODULE PHARMACIE SONT VALIDÉS AVEC SUCCÈS !');
  console.log('=============================================================');
}

runTests().catch((err) => {
  console.error('\n❌ ERREUR LORS DES TESTS PHARMACIE :', err);
  process.exit(1);
});
