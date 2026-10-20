/**
 * Suite de tests automatisés pour le secteur Hôtel, Résidence & Auberge de GESTIO229
 */
import assert from 'assert';

console.log('--- DÉMARRAGE DES TESTS : SECTEUR HÔTEL, RÉSIDENCE & AUBERGE ---');

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

// Mock window for Node.js environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

async function runTests() {
  const { hotelService } = await import('../src/services/hotelService.ts');

  // Use valid UUID for companyId to satisfy Postgres UUID validation in caisse mocks
  const testCompanyId = 'a0000000-0000-0000-0000-000000000101';

  console.log('\n[TEST 1] Chargement initial et seed des chambres...');
  const chambres = await hotelService.fetchHotelChambres(testCompanyId);
  assert.ok(Array.isArray(chambres) && chambres.length >= 6, 'Au moins 6 chambres initiales doivent être disponibles');
  const ch101 = chambres.find(c => c.numero_chambre === '101');
  assert.ok(ch101, 'La chambre 101 doit exister');
  assert.strictEqual(ch101.statut, 'LIBRE');
  console.log('✅ Test 1 validé : Chambres chargées avec succès.');

  console.log('\n[TEST 2] Vérification anti-double réservation & disponibilité...');
  const dispoAvant = await hotelService.verifierDisponibiliteChambre(testCompanyId, '101', '2026-10-25', '2026-10-28');
  assert.strictEqual(dispoAvant.disponible, true, 'La chambre doit être disponible pour les dates données');
  console.log('✅ Test 2 validé : Vérification de disponibilité nominale OK.');

  console.log('\n[TEST 3] Enregistrement d\'une réservation et détection de conflit...');
  const resCreation = await hotelService.creerReservation(testCompanyId, {
    chambre_id: ch101.id,
    chambre_numero: '101',
    client_nom: 'Koffi Mensah',
    client_telephone: '+229 97 00 00 01',
    date_arrivee: '2026-10-25',
    date_depart: '2026-10-28',
    nb_nuits: 3,
    tarif_nuit: ch101.tarif_nuit,
    total_estime: 3 * ch101.tarif_nuit,
    acompte_verse: 25000,
    mode_acompte: 'CASH',
  });
  assert.ok(resCreation.success && resCreation.reservation, 'La réservation doit être créée');

  // Test du conflit de date (chevauchement)
  const dispoConflit = await hotelService.verifierDisponibiliteChambre(testCompanyId, '101', '2026-10-26', '2026-10-29');
  assert.strictEqual(dispoConflit.disponible, false, 'Le conflit de réservation doit être détecté et bloquer la disponibilité');
  assert.ok(dispoConflit.motif && dispoConflit.motif.length > 0, 'Un motif de refus explicite doit être retourné');
  console.log('✅ Test 3 validé : Anti-double réservation fonctionnelle (bloque les chevauchements).');

  console.log('\n[TEST 4] Check-in client & calcul automatique de séjour...');
  const ch102 = chambres.find(c => c.numero_chambre === '102');
  assert.ok(ch102, 'La chambre 102 doit être disponible');

  const checkinRes = await hotelService.executerCheckIn(testCompanyId, {
    chambreNumero: '102',
    clientNom: 'Diop',
    clientTelephone: '+229 96 11 22 33',
    nationalite: 'Béninoise',
    clientPieceId: 'B12345678',
    dateCheckIn: '2026-10-20',
    dateCheckOutPrevue: '2026-10-23',
    nbNuits: 3,
    tarifNuit: ch102.tarif_nuit,
    acompteVerse: 40000,
    modePaiementAcompte: 'ESPECES',
  });

  assert.ok(checkinRes.success && checkinRes.sejour, 'Le séjour doit être créé avec succès');
  const sejour = checkinRes.sejour;
  assert.strictEqual(sejour.statut, 'EN_COURS');
  assert.strictEqual(sejour.montant_nuitees, 3 * ch102.tarif_nuit);
  assert.strictEqual(sejour.solde_restant, (3 * ch102.tarif_nuit) - 40000);

  // Vérifier que la chambre 102 est maintenant OCCUPEE
  const chambresApresCheckin = await hotelService.fetchHotelChambres(testCompanyId);
  const ch102Apres = chambresApresCheckin.find(c => c.numero_chambre === '102');
  assert.strictEqual(ch102Apres.statut, 'OCCUPEE', 'La chambre doit passer au statut OCCUPEE lors du check-in');
  console.log('✅ Test 4 validé : Check-in réussi, folio initialisé et chambre marquée OCCUPÉE.');

  console.log('\n[TEST 5] Ajout de prestations et services extra au folio du client...');
  const extraRes1 = await hotelService.ajouterPrestationSejour(
    testCompanyId,
    sejour.id,
    {
      serviceNom: 'Petit-déjeuner Continental x2',
      categorie: 'RESTAURATION',
      quantite: 2,
      prixUnitaire: 3500,
      regleImmediatement: false,
    }
  );
  assert.ok(extraRes1.success && extraRes1.sejour);
  assert.strictEqual(extraRes1.sejour.montant_services, 7000);
  assert.strictEqual(extraRes1.sejour.solde_restant, (3 * ch102.tarif_nuit + 7000) - 40000);

  // Deuxième prestation : blanchisserie
  const extraRes2 = await hotelService.ajouterPrestationSejour(
    testCompanyId,
    sejour.id,
    {
      serviceNom: 'Service Blanchisserie Express',
      categorie: 'BLANCHISSERIE',
      quantite: 1,
      prixUnitaire: 5000,
      regleImmediatement: false,
    }
  );
  assert.ok(extraRes2.success && extraRes2.sejour);
  assert.strictEqual(extraRes2.sejour.montant_services, 12000);
  assert.strictEqual(extraRes2.sejour.solde_restant, (3 * ch102.tarif_nuit + 12000) - 40000);
  console.log('✅ Test 5 validé : Folio client incrémenté des consommations avec solde à jour.');

  console.log('\n[TEST 6] Changement de chambre client...');
  const transfertRes = await hotelService.changerChambreClient(testCompanyId, sejour.id, '103', 'Demande de grand lit');
  assert.strictEqual(transfertRes.success, true);
  
  const sejoursApresTransfert = await hotelService.fetchHotelSejours(testCompanyId);
  const sejourTransfere = sejoursApresTransfert.find(s => s.id === sejour.id);
  assert.strictEqual(sejourTransfere.chambre_numero, '103');
  
  const chambresApresTransfert = await hotelService.fetchHotelChambres(testCompanyId);
  assert.strictEqual(chambresApresTransfert.find(c => c.numero_chambre === '103').statut, 'OCCUPEE');
  assert.strictEqual(chambresApresTransfert.find(c => c.numero_chambre === '102').statut, 'A_NETTOYER');
  console.log('✅ Test 6 validé : Transfert de chambre exécuté, ancienne chambre basculée À_NETTOYER.');

  console.log('\n[TEST 7] Check-out complet avec règlement du solde et déclenchement housekeeping...');
  const soldeDu = sejourTransfere.solde_restant;
  const cloture = await hotelService.executerCheckOut(testCompanyId, sejour.id, {
    montantRegle: soldeDu,
    modeReglement: 'MOMO',
  });

  assert.ok(cloture.success && cloture.facture);
  assert.strictEqual(cloture.facture.soldeRestant, 0, 'Le solde restant doit être soldé à 0');
  assert.ok(cloture.facture.numero, 'Un numéro de facture doit être généré');

  // Vérifier que la chambre 103 est passée À_NETTOYER
  const chambresApresCheckout = await hotelService.fetchHotelChambres(testCompanyId);
  assert.strictEqual(chambresApresCheckout.find(c => c.numero_chambre === '103').statut, 'A_NETTOYER');

  // Vérifier qu'une tâche de housekeeping a été créée automatiquement
  const tasks = await hotelService.fetchHousekeepingTasks(testCompanyId);
  const taskCh103 = tasks.find(t => t.chambre_numero === '103');
  assert.ok(taskCh103, 'Une tâche de nettoyage doit être créée suite au check-out');
  console.log('✅ Test 7 validé : Check-out réussi, reçu de solde généré et tâche de ménage créée.');

  console.log('\n[TEST 8] Cycle complet Housekeeping (A_NETTOYER -> EN_COURS -> PROPRE_DISPONIBLE)...');
  await hotelService.changerStatutHousekeeping(testCompanyId, taskCh103.id, 'EN_COURS', 'Chantal Housekeeper');
  await hotelService.changerStatutHousekeeping(testCompanyId, taskCh103.id, 'PROPRE_DISPONIBLE', 'Gouvernante Alice');

  // Vérifier que la chambre 103 est repassée LIBRE
  const chambresApresHousekeeping = await hotelService.fetchHotelChambres(testCompanyId);
  assert.strictEqual(chambresApresHousekeeping.find(c => c.numero_chambre === '103').statut, 'LIBRE');
  console.log('✅ Test 8 validé : Cycle ménage achevé avec remise en disponibilité automatique de la chambre.');

  console.log('\n[TEST 9] Déclaration de panne, blocage en MAINTENANCE et remise en service...');
  const ticket = await hotelService.declarerPanneMaintenance(testCompanyId, {
    chambre_id: 'ch-201',
    chambre_numero: '201',
    description: 'Climatiseur en panne / fuite eau',
    priorite: 'HAUTE',
    technicien: 'Mamadou Clim',
  });
  assert.ok(ticket && ticket.id);

  // Vérifier que la chambre 201 est passée MAINTENANCE
  const chambresApresPanne = await hotelService.fetchHotelChambres(testCompanyId);
  assert.strictEqual(chambresApresPanne.find(c => c.numero_chambre === '201').statut, 'MAINTENANCE');

  // Vérifier l'anti-réservation sur la chambre en panne
  const dispoPanne = await hotelService.verifierDisponibiliteChambre(testCompanyId, '201', '2026-10-22', '2026-10-23');
  assert.strictEqual(dispoPanne.disponible, false, 'Une chambre en maintenance ne peut pas être réservée');

  // Résolution de la panne
  await hotelService.resoudrePanneMaintenance(testCompanyId, ticket.id, 'Gaz rechargé et testé OK');
  const chambresApresReparation = await hotelService.fetchHotelChambres(testCompanyId);
  assert.strictEqual(chambresApresReparation.find(c => c.numero_chambre === '201').statut, 'A_NETTOYER', 'Après réparation la chambre doit passer en nettoyage avant remise en vente');
  console.log('✅ Test 9 validé : Blocage de chambre en maintenance, isolation des réservations et passage en ménage après travaux.');

  console.log('\n[TEST 10] Calcul des indicateurs clés (Taux d\'occupation, ADR, RevPAR, CA)...');
  const kpis = await hotelService.calculerIndicateursHotel(testCompanyId);
  assert.ok(typeof kpis.tauxOccupation === 'number');
  assert.ok(typeof kpis.adr === 'number');
  assert.ok(typeof kpis.revPar === 'number');
  assert.ok(kpis.caNuiteesMois >= 0);
  assert.ok(kpis.caServicesMois >= 0);
  console.log(`KPIs calculés : TO=${kpis.tauxOccupation}%, ADR=${kpis.adr} FCFA, RevPAR=${kpis.revPar} FCFA, Total Chambres=${kpis.totalChambres}`);
  console.log('✅ Test 10 validé : KPIs hôteliers calculés avec précision.');

  console.log('\n=============================================================');
  console.log('🎉 TOUS LES 10 TESTS DU MODULE HÔTELLERIE SONT VALIDÉS AVEC SUCCÈS !');
  console.log('=============================================================');
}

runTests().catch(err => {
  console.error('\n❌ ERREUR LORS DES TESTS :', err);
  process.exit(1);
});
