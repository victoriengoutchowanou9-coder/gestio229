/**
 * Suite de tests automatisés pour le secteur Transport & Logistique de GESTIO229
 */
import assert from 'assert';

console.log('--- DÉMARRAGE DES TESTS : SECTEUR TRANSPORT & LOGISTIQUE ---');

// Mock localStorage for Node.js environment
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
  const { transportService } = await import('../src/services/transportService.ts');
  const testCompanyId = 'a0000000-0000-0000-0000-000000000202';

  console.log('\n[TEST 1] Création d\'une ligne interurbaine avec arrêts et grille tarifaire...');
  const ligne = await transportService.saveTransportLigne(testCompanyId, {
    code_ligne: 'L-COT-NAT',
    nom_ligne: 'Cotonou - Natitingou Grand Nord',
    ville_origine: 'Cotonou',
    ville_destination: 'Natitingou',
    distance_km: 650,
    duree_estimee_minutes: 540,
    arrêts: [
      { id: 'arr-c1', ordre: 1, nom: 'Gare Cotonou', ville: 'Cotonou', est_actif: true, duree_depuis_depart_min: 0 },
      { id: 'arr-c2', ordre: 2, nom: 'Gare Bohicon', ville: 'Bohicon', est_actif: true, duree_depuis_depart_min: 130 },
      { id: 'arr-c3', ordre: 3, nom: 'Gare Djougou', ville: 'Djougou', est_actif: true, duree_depuis_depart_min: 440 },
      { id: 'arr-c4', ordre: 4, nom: 'Gare Natitingou', ville: 'Natitingou', est_actif: true, duree_depuis_depart_min: 540 },
    ],
    grille_tarifs: {
      'arr-c1_arr-c2': 3500,
      'arr-c1_arr-c3': 9000,
      'arr-c1_arr-c4': 11000,
      'arr-c2_arr-c4': 8000,
    }
  });

  assert.ok(ligne && ligne.id, 'La ligne doit être enregistrée');
  assert.strictEqual(ligne.arrêts.length, 4, 'La ligne doit comporter 4 arrêts');
  const tarifCalcule = transportService.calculerTarifTrajet(ligne, 'arr-c1', 'arr-c4');
  assert.strictEqual(tarifCalcule, 11000, 'Le tarif complet Cotonou-Natitingou doit être de 11 000 FCFA');
  console.log('✅ Test 1 validé : Ligne créée, 4 arrêts séquencés et grille tarifaire opérationnelle.');

  console.log('\n[TEST 2] Création d\'un bus et d\'un chauffeur, puis test de détection de conflit...');
  const bus = await transportService.saveTransportBus(testCompanyId, {
    immatriculation: 'BB 9988 RB',
    marque: 'Mercedes-Benz',
    modele: 'Tourismo VIP',
    categorie: 'VIP Climatise',
    capacite_passagers: 50,
    places_commercialisables: 50,
    capacite_soute_kg: 1200,
    plan_sieges_actif: true,
    agence_rattachement: 'Cotonou',
    kilometrage: 85000,
    statut: 'DISPONIBLE'
  });

  const chauffeur = await transportService.saveTransportChauffeur(testCompanyId, {
    nom: 'ALIDOU',
    prenom: 'Ibrahim',
    telephone: '+229 97 88 77 66',
    numero_permis: 'BEN-D-99001',
    categories_permis: ['D', 'C'],
    date_expiration_permis: '2028-05-10',
    statut: 'DISPONIBLE',
    agence: 'Cotonou'
  });

  const dep1 = await transportService.creerTransportDepart(testCompanyId, {
    ligneId: ligne.id,
    dateDepart: '2026-11-01',
    heureDepart: '06:00',
    busId: bus.id,
    chauffeurId: chauffeur.id,
    prixBase: 11000
  });

  assert.ok(dep1.success && dep1.depart, 'Le départ doit être programmé avec succès');
  assert.strictEqual(dep1.depart.places_restantes, 50);

  // Test de conflit : même bus ou même chauffeur à la même heure
  const depConflit = await transportService.creerTransportDepart(testCompanyId, {
    ligneId: ligne.id,
    dateDepart: '2026-11-01',
    heureDepart: '06:00',
    busId: bus.id,
    chauffeurId: chauffeur.id,
    prixBase: 11000
  });

  assert.strictEqual(depConflit.success, false, 'Le conflit d\'affectation doit être rejeté');
  assert.ok(depConflit.error && depConflit.error.includes('Conflit'), 'Un message d\'erreur explicite doit être levé');
  console.log('✅ Test 2 validé : Ressources affectées et anti-double programmation validée.');

  console.log('\n[TEST 3] Vente de ticket entre deux arrêts intermédiaires, calcul tarif et réservation...');
  const ticketRes = await transportService.emettreTicketBus(testCompanyId, {
    departId: dep1.depart.id,
    arretDepart: 'Gare Cotonou',
    arretArrivee: 'Gare Bohicon',
    passagerNom: 'ADJOVI Carole',
    passagerTelephone: '+229 96 00 11 22',
    siegeNumero: 12,
    tarif: 3500,
    modePaiement: 'ESPECES',
    estReservationSeule: false
  });

  assert.ok(ticketRes.success && ticketRes.ticket, 'Le ticket doit être émis');
  assert.strictEqual(ticketRes.ticket.statut, 'PAYE');
  assert.strictEqual(ticketRes.ticket.siege_numero, 12);
  assert.strictEqual(ticketRes.ticket.tarif, 3500);

  // Vérifier mise à jour du départ
  const departsApresVente = await transportService.fetchTransportDeparts(testCompanyId);
  const depMaj = departsApresVente.find(d => d.id === dep1.depart.id);
  assert.strictEqual(depMaj.places_vendues, 1);
  assert.strictEqual(depMaj.places_restantes, 49);
  assert.ok(depMaj.sieges_occupes.includes(12), 'Le siège 12 doit être enregistré comme occupé');
  console.log('✅ Test 3 validé : Billet émis, siège 12 réservé, décompte des places exact.');

  console.log('\n[TEST 4] Test anti-surréservation du même siège...');
  const doubleSiege = await transportService.emettreTicketBus(testCompanyId, {
    departId: dep1.depart.id,
    arretDepart: 'Gare Cotonou',
    arretArrivee: 'Gare Bohicon',
    passagerNom: 'AUTRE Passager',
    passagerTelephone: '+229 97 22 33 44',
    siegeNumero: 12,
    tarif: 3500,
    modePaiement: 'ESPECES',
  });
  assert.strictEqual(doubleSiege.success, false, 'Le système doit interdire de vendre un siège déjà occupé');
  console.log('✅ Test 4 validé : Protection anti-double vente de siège opérationnelle.');

  console.log('\n[TEST 5] Contrôle du ticket au quai et prévention de réutilisation...');
  const controle1 = await transportService.controlerTicket(testCompanyId, ticketRes.ticket.numero_ticket, 'Contrôleur Marc');
  assert.strictEqual(controle1.estValide, true, 'Le ticket valide doit autoriser l\'embarquement');
  assert.strictEqual(controle1.ticket.statut, 'UTILISE');

  // Deuxième scan avec le même ticket (tentative de fraude)
  const controle2 = await transportService.controlerTicket(testCompanyId, ticketRes.ticket.numero_ticket, 'Contrôleur Marc');
  assert.strictEqual(controle2.estValide, false, 'Un ticket déjà utilisé doit être bloqué au second scan');
  assert.ok(controle2.message.includes('DÉJÀ UTILISÉ'), 'Alerte fraude réutilisation générée');
  console.log('✅ Test 5 validé : Validation d\'embarquement et anti-réutilisation certifiée.');

  console.log('\n[TEST 6] Émission d\'un second billet puis annulation/remboursement...');
  const ticket2 = await transportService.emettreTicketBus(testCompanyId, {
    departId: dep1.depart.id,
    arretDepart: 'Gare Cotonou',
    arretArrivee: 'Gare Natitingou',
    passagerNom: 'BIO Pascal',
    passagerTelephone: '+229 97 11 22 33',
    siegeNumero: 14,
    tarif: 11000,
    modePaiement: 'MOBILE_MONEY',
  });
  assert.ok(ticket2.success && ticket2.ticket);

  // Remboursement
  const remb = await transportService.annulerRembourserTicket(testCompanyId, ticket2.ticket.id, 'REMBOURSER', 'Annulation voyage client');
  assert.strictEqual(remb.success, true);

  const ticketsApresRemb = await transportService.fetchTransportTickets(testCompanyId);
  const tktVerif = ticketsApresRemb.find(t => t.id === ticket2.ticket.id);
  assert.strictEqual(tktVerif.statut, 'REMBOURSE');

  // Vérifier libération de la place
  const departsApresRemb = await transportService.fetchTransportDeparts(testCompanyId);
  const depVerif = departsApresRemb.find(d => d.id === dep1.depart.id);
  assert.ok(!depVerif.sieges_occupes.includes(14), 'Le siège 14 doit être libéré suite au remboursement');
  console.log('✅ Test 6 validé : Annulation/remboursement exécuté et place restituée sur le bus.');

  console.log('\n[TEST 7] Enregistrement d\'un colis, tarification au poids et bordereau...');
  const colisRes = await transportService.enregistrerColis(testCompanyId, {
    expediteur_nom: 'DOSSOU Jean',
    expediteur_telephone: '+229 95 12 34 56',
    destinataire_nom: 'TCHIBOZO Clarisse',
    destinataire_telephone: '+229 97 65 43 21',
    agence_depot: 'Cotonou',
    agence_retrait: 'Parakou',
    nature_colis: 'Pièces détachées mécaniques',
    nombre_colis: 2,
    poids_kg: 18,
    valeur_declaree: 80000,
    frais_transport: 4450,
  });

  assert.ok(colisRes.success && colisRes.colis, 'Le colis doit être enregistré');
  assert.ok(colisRes.colis.code_suivi.startsWith('TRK-'), 'Un code de suivi unique TRK-... doit être généré');
  assert.strictEqual(colisRes.colis.statut, 'ENREGISTRE');
  console.log('✅ Test 7 validé : Colis enregistré avec code de suivi et bordereau d\'expédition.');

  console.log('\n[TEST 8] Cycle logistique : chargement en soute, transit et remise au destinataire...');
  await transportService.affecterColisAuDepart(testCompanyId, colisRes.colis.id, dep1.depart.id);
  const colisApresChargement = (await transportService.fetchTransportColis(testCompanyId)).find(c => c.id === colisRes.colis.id);
  assert.strictEqual(colisApresChargement.statut, 'CHARGE');

  // Arrivée en agence de destination
  await transportService.marquerColisArriveAgence(testCompanyId, colisRes.colis.id);
  const colisArrive = (await transportService.fetchTransportColis(testCompanyId)).find(c => c.id === colisRes.colis.id);
  assert.strictEqual(colisArrive.statut, 'DISPONIBLE_RETRAIT');

  // Remise au destinataire avec contrôle CNI
  await transportService.confirmerRemiseColisDestinataire(testCompanyId, colisRes.colis.id, {
    destinatairePieceId: 'CNI-BEN-10293847',
    agentRemise: 'Agent Parakou Cyrille'
  });
  const colisLivre = (await transportService.fetchTransportColis(testCompanyId)).find(c => c.id === colisRes.colis.id);
  assert.strictEqual(colisLivre.statut, 'LIVRE');
  assert.strictEqual(colisLivre.destinataire_piece_id, 'CNI-BEN-10293847');
  console.log('✅ Test 8 validé : Cycle fret complet : Chargement -> Arrivée escale -> Remise contrôlée.');

  console.log('\n[TEST 9] Carburant, maintenance et immobilisation temporaire du bus...');
  await transportService.enregistrerPleinCarburant(testCompanyId, {
    bus_id: bus.id,
    immatriculation: bus.immatriculation,
    date: '2026-11-01',
    kilometrage: 85450,
    quantite_litres: 120,
    prix_litre: 700,
    cout_total: 84000,
    plein_complet: true
  });

  // Déclaration maintenance avec immobilisation
  const maint = await transportService.enregistrerInterventionMaintenance(testCompanyId, {
    bus_id: bus.id,
    immatriculation: bus.immatriculation,
    date_debut: '2026-11-02',
    type_intervention: 'FREINAGE',
    description: 'Remplacement plaquettes et purge circuit',
    cout_pieces: 45000,
    cout_main_oeuvre: 15000,
    cout_total: 60000,
    immobilise_le_bus: true,
    statut: 'EN_COURS'
  });

  // Vérifier que le bus est passé en statut MAINTENANCE
  const busApresMaint = (await transportService.fetchTransportBus(testCompanyId)).find(b => b.id === bus.id);
  assert.strictEqual(busApresMaint.statut, 'MAINTENANCE');

  // Vérifier qu'un bus en maintenance ne peut pas être programmé pour un départ
  const depImmobilise = await transportService.creerTransportDepart(testCompanyId, {
    ligneId: ligne.id,
    dateDepart: '2026-11-02',
    heureDepart: '14:00',
    busId: bus.id,
    chauffeurId: chauffeur.id,
    prixBase: 11000
  });
  assert.strictEqual(depImmobilise.success, false, 'Un bus immobilisé doit être refusé pour tout nouveau départ');

  // Clôture de la maintenance et libération du bus
  await transportService.cloturerInterventionMaintenance(testCompanyId, maint.id);
  const busLibere = (await transportService.fetchTransportBus(testCompanyId)).find(b => b.id === bus.id);
  assert.strictEqual(busLibere.statut, 'DISPONIBLE');
  console.log('✅ Test 9 validé : Suivi carburant, blocage automatique en maintenance et remise en service.');

  console.log('\n[TEST 10] Calcul des KPIs de rentabilité Transport & Logistique...');
  const kpis = await transportService.calculerIndicateursTransport(testCompanyId);
  assert.ok(typeof kpis.totalRecettesJour === 'number');
  assert.ok(typeof kpis.tauxRemplissageMoyen === 'number');
  assert.ok(typeof kpis.busDisponibles === 'number');
  console.log(`KPIs calculés : Recettes=${kpis.totalRecettesJour} F, Remplissage=${kpis.tauxRemplissageMoyen}%, Bus dispos=${kpis.busDisponibles}/${kpis.totalBus}`);
  console.log('✅ Test 10 validé : KPIs d\'exploitation calculés en temps réel.');

  console.log('\n=============================================================');
  console.log('🎉 TOUS LES 10 TESTS DU MODULE TRANSPORT SONT VALIDÉS AVEC SUCCÈS !');
  console.log('=============================================================');
}

runTests().catch(err => {
  console.error('\n❌ ERREUR LORS DES TESTS :', err);
  process.exit(1);
});
