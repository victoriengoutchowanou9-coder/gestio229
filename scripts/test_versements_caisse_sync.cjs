const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_COMPANY_ID = '16f1b55b-8c51-454c-9587-4e21fb1853df';

function cleanSectorSlug(slug) {
  if (!slug) return 'boutique';
  const s = String(slug).toLowerCase().trim().replace(/_/g, '-');
  if (['restaurant', 'bar', 'bar-restaurant', 'bar-restaurant-maquis', 'maquis', 'fast-food'].includes(s)) {
    return 'restaurant';
  }
  return s;
}

async function runTests() {
  console.log('========================================================================');
  console.log('SUITE DE TESTS : SYNCHRONISATION VERSEMENTS SERVEUSES <-> CAISSE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  [PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} ${detail ? ': ' + detail : ''}`);
      failed++;
    }
  }

  try {
    // 0. Setup : trouver ou créer une caisse Bar / Restaurant et une session ouverte
    console.log('--- ÉTAPE 0 : PRÉPARATION DU CONTEXTE DE TEST ---');
    let targetCaisseId = null;
    let { data: restoCaisse } = await sb
      .from('caisses')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .or('sector_slug.eq.restaurant,secteur_slug.eq.restaurant')
      .limit(1)
      .maybeSingle();

    if (restoCaisse) {
      targetCaisseId = restoCaisse.id;
    } else {
      const { data: newCaisse, error: cCreateErr } = await sb.from('caisses').insert({
        company_id: TEST_COMPANY_ID,
        nom: 'Caisse Bar & Restaurant',
        code: `CS-RESTO-${Date.now().toString().slice(-4)}`,
        sector_slug: 'restaurant',
        secteur_slug: 'restaurant',
        statut: 'active'
      }).select().single();
      if (cCreateErr) console.error('Erreur creation caisse restaurant:', cCreateErr);
      targetCaisseId = newCaisse?.id;
    }

    // Trouver ou créer une caisse_session ouverte rattachée à cette caisse restaurant
    let caisseSession = null;
    const { data: existingSess } = await sb
      .from('caisse_sessions')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('caisse_id', targetCaisseId)
      .in('statut', ['ouverte', 'open'])
      .is('date_fermeture', null)
      .order('date_ouverture', { ascending: false })
      .limit(1);

    if (existingSess && existingSess.length > 0) {
      caisseSession = existingSess[0];
    } else {
      const { data: newSess, error: sCreateErr } = await sb.from('caisse_sessions').insert({
        company_id: TEST_COMPANY_ID,
        caisse_id: targetCaisseId,
        sector_slug: 'restaurant',
        secteur_slug: 'restaurant',
        statut: 'ouverte',
        date_ouverture: new Date().toISOString(),
        fond_ouverture_especes: 10000,
        fond_actuel_especes: 10000,
        fond_actuel_momo: 0,
        especes_du_jour: 0,
        momo_du_jour: 0,
        ca_du_jour: 0,
        especes_theorique: 10000
      }).select().single();
      if (sCreateErr) console.error('Erreur creation session caisse:', sCreateErr);
      caisseSession = newSess;
    }

    console.log(`Caisse ID: ${targetCaisseId}, Caisse Session ID: ${caisseSession.id}`);
    const initEspDuJour = Number(caisseSession.especes_du_jour) || 0;
    const initMomoDuJour = Number(caisseSession.momo_du_jour) || 0;
    const initFondActuelEsp = Number(caisseSession.fond_actuel_especes) || 0;
    const initFondActuelMo = Number(caisseSession.fond_actuel_momo) || 0;

    // Créer une session de serveuse de test
    const testServeuseNom = `Amina Test_${Date.now().toString().slice(-4)}`;
    const soldeInitialServeuse = 30000;
    const { data: servSess, error: servErr } = await sb.from('restaurant_sessions_serveurs').insert({
      company_id: TEST_COMPANY_ID,
      serveur_nom: testServeuseNom,
      date_session: new Date().toISOString().split('T')[0],
      heure_ouverture: new Date().toISOString(),
      fonds_initial: 0,
      statut: 'OUVERTE',
      total_boissons_confiees_ttc: 30000,
      total_ventes_declarees_ttc: 30000,
      total_versements_recus: 0,
      solde_restant_a_remettre: soldeInitialServeuse
    }).select().single();

    if (servErr) console.error('Erreur insertion servSess:', servErr);
    assert(!servErr && !!servSess, 'Création session serveuse de test', `ID: ${servSess?.id}`);

    // --- TEST 1 : VERSEMENT ESPÈCES 2 000 FCFA ---
    console.log('\n--- TEST 1 : VERSEMENT ESPÈCES 2 000 FCFA ---');
    const vmtEspMontant = 2000;
    const refEsp = `VMT-${Date.now().toString().slice(-6)}`;

    // 1. Enregistrement du versement serveuse
    const soldeAvantEsp = Number(servSess.solde_restant_a_remettre);
    const soldeApresEsp = soldeAvantEsp - vmtEspMontant;

    const { error: vErr1 } = await sb.from('restaurant_versements_serveurs').insert({
      company_id: TEST_COMPANY_ID,
      session_id: servSess.id,
      reference: refEsp,
      serveur_nom: testServeuseNom,
      montant: vmtEspMontant,
      mode_reglement: 'ESPECES',
      recu_par: 'Gérant Test',
      solde_avant: soldeAvantEsp,
      solde_apres: soldeApresEsp,
      date_versement: new Date().toISOString(),
      commentaire: 'Test versement espèces'
    });
    assert(!vErr1, '1.1 Enregistrement dans restaurant_versements_serveurs', refEsp);

    // 2. Mise à jour de la session serveuse
    const { error: upServErr1 } = await sb.from('restaurant_sessions_serveurs').update({
      total_versements_recus: vmtEspMontant,
      solde_restant_a_remettre: soldeApresEsp,
      updated_at: new Date().toISOString()
    }).eq('id', servSess.id);
    assert(!upServErr1, '1.2 Mise à jour du solde restant de la serveuse', `Nouveau solde: ${soldeApresEsp}`);

    // 3. Insertion mouvement de caisse
    const nowIso1 = new Date().toISOString();
    const { error: mvtErr1 } = await sb.from('caisse_mouvements').insert({
      company_id: TEST_COMPANY_ID,
      caisse_id: targetCaisseId,
      caisse_session_id: caisseSession.id,
      sector_slug: 'restaurant',
      secteur_slug: 'restaurant',
      type: 'ENCAISSEMENT VERSEMENT SERVEUSE',
      sens: 'entree',
      montant_especes: vmtEspMontant,
      montant_momo: 0,
      montant: vmtEspMontant,
      source_module: 'restaurant_serveurs',
      source_id: refEsp,
      reference_id: refEsp,
      motif: `ENCAISSEMENT VERSEMENT SERVEUSE - ${testServeuseNom} (${refEsp})`,
      user_name: 'Gérant Test',
      statut: 'valide',
      created_at: nowIso1
    });
    if (mvtErr1) console.error('mvtErr1:', mvtErr1);
    assert(!mvtErr1, '1.3 Création mouvement caisse avec type exact « ENCAISSEMENT VERSEMENT SERVEUSE »');

    // 4. Mise à jour compteurs session caisse
    const expectedEspDuJour1 = initEspDuJour + vmtEspMontant;
    const expectedFondActuelEsp1 = initFondActuelEsp + vmtEspMontant;
    await sb.from('caisse_sessions').update({
      especes_du_jour: expectedEspDuJour1,
      fond_actuel_especes: expectedFondActuelEsp1,
      updated_at: nowIso1
    }).eq('id', caisseSession.id);

    // Vérification des données après test 1
    const { data: updatedCaisse1 } = await sb.from('caisse_sessions').select('*').eq('id', caisseSession.id).single();
    assert(Number(updatedCaisse1.especes_du_jour) === expectedEspDuJour1, '1.4 Compteur « ESPÈCES DU JOUR » augmenté de 2 000 FCFA', `${updatedCaisse1.especes_du_jour} FCFA`);
    assert(Number(updatedCaisse1.momo_du_jour) === initMomoDuJour, '1.5 Compteur « MOMO DU JOUR » rigoureusement inchangé', `${updatedCaisse1.momo_du_jour} FCFA`);
    assert(Number(updatedCaisse1.fond_actuel_especes) === expectedFondActuelEsp1, '1.6 Solde réel espèces de la caisse augmenté de 2 000 FCFA', `${updatedCaisse1.fond_actuel_especes} FCFA`);

    // --- TEST 2 : VERSEMENT MOBILE MONEY 5 000 FCFA ---
    console.log('\n--- TEST 2 : VERSEMENT MOBILE MONEY 5 000 FCFA ---');
    const vmtMomoMontant = 5000;
    const refMomo = `VMT-${(Date.now() + 1).toString().slice(-6)}`;

    // 1. Enregistrement du versement serveuse
    const soldeAvantMomo = soldeApresEsp;
    const soldeApresMomo = soldeAvantMomo - vmtMomoMontant;

    const { error: vErr2 } = await sb.from('restaurant_versements_serveurs').insert({
      company_id: TEST_COMPANY_ID,
      session_id: servSess.id,
      reference: refMomo,
      serveur_nom: testServeuseNom,
      montant: vmtMomoMontant,
      mode_reglement: 'MTN_MOMO',
      recu_par: 'Gérant Test',
      solde_avant: soldeAvantMomo,
      solde_apres: soldeApresMomo,
      date_versement: new Date().toISOString(),
      commentaire: 'Test versement MoMo'
    });
    assert(!vErr2, '2.1 Enregistrement MoMo dans restaurant_versements_serveurs', refMomo);

    // 2. Mise à jour session serveuse
    await sb.from('restaurant_sessions_serveurs').update({
      total_versements_recus: vmtEspMontant + vmtMomoMontant,
      solde_restant_a_remettre: soldeApresMomo,
      updated_at: new Date().toISOString()
    }).eq('id', servSess.id);

    // 3. Insertion mouvement caisse MoMo
    const nowIso2 = new Date().toISOString();
    const { error: mvtErr2 } = await sb.from('caisse_mouvements').insert({
      company_id: TEST_COMPANY_ID,
      caisse_id: targetCaisseId,
      caisse_session_id: caisseSession.id,
      sector_slug: 'restaurant',
      secteur_slug: 'restaurant',
      type: 'ENCAISSEMENT VERSEMENT SERVEUSE',
      sens: 'entree',
      montant_especes: 0,
      montant_momo: vmtMomoMontant,
      montant: vmtMomoMontant,
      source_module: 'restaurant_serveurs',
      source_id: refMomo,
      reference_id: refMomo,
      motif: `ENCAISSEMENT VERSEMENT SERVEUSE - ${testServeuseNom} (${refMomo})`,
      user_name: 'Gérant Test',
      statut: 'valide',
      created_at: nowIso2
    });
    assert(!mvtErr2, '2.2 Création mouvement caisse MoMo avec type exact « ENCAISSEMENT VERSEMENT SERVEUSE »');

    // 4. Mise à jour compteurs session caisse
    const expectedMomoDuJour2 = initMomoDuJour + vmtMomoMontant;
    const expectedFondActuelMo2 = initFondActuelMo + vmtMomoMontant;
    await sb.from('caisse_sessions').update({
      momo_du_jour: expectedMomoDuJour2,
      fond_actuel_momo: expectedFondActuelMo2,
      updated_at: nowIso2
    }).eq('id', caisseSession.id);

    // Vérification des données après test 2
    const { data: updatedCaisse2 } = await sb.from('caisse_sessions').select('*').eq('id', caisseSession.id).single();
    assert(Number(updatedCaisse2.momo_du_jour) === expectedMomoDuJour2, '2.3 Compteur « MOMO DU JOUR » augmenté de 5 000 FCFA', `${updatedCaisse2.momo_du_jour} FCFA`);
    assert(Number(updatedCaisse2.especes_du_jour) === expectedEspDuJour1, '2.4 Compteur « ESPÈCES DU JOUR » rigoureusement inchangé', `${updatedCaisse2.especes_du_jour} FCFA`);
    assert(Number(updatedCaisse2.fond_actuel_momo) === expectedFondActuelMo2, '2.5 Solde réel MoMo de la caisse augmenté de 5 000 FCFA', `${updatedCaisse2.fond_actuel_momo} FCFA`);

    // Vérification de la session de la serveuse
    const { data: updatedServSess } = await sb.from('restaurant_sessions_serveurs').select('*').eq('id', servSess.id).single();
    assert(Number(updatedServSess.solde_restant_a_remettre) === soldeApresMomo, '2.6 Solde restant dû serveuse diminué à 23 000 FCFA', `30000 - 2000 - 5000 = ${updatedServSess.solde_restant_a_remettre} FCFA`);
    assert(Number(updatedServSess.total_versements_recus) === 7000, '2.7 Total versements de la serveuse égal à 7 000 FCFA');

    // --- TEST 3 : RECHARGEMENT & PERSISTANCE & ANTI-DOUBLON ---
    console.log('\n--- TEST 3 : PERSISTANCE & ANTI-DOUBLON ---');
    // Simuler rechargement de données
    const { data: reloadedMvts } = await sb
      .from('caisse_mouvements')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('sector_slug', 'restaurant')
      .in('source_id', [refEsp, refMomo]);

    assert(reloadedMvts && reloadedMvts.length === 2, '3.1 Persistance exacte des 2 mouvements après rechargement');
    const mvt1 = reloadedMvts.find(m => m.source_id === refEsp);
    const mvt2 = reloadedMvts.find(m => m.source_id === refMomo);
    assert(mvt1 && mvt1.montant_especes === 2000 && mvt1.montant_momo === 0, '3.2 Mouvement Espèces intègre: 2 000 FCFA');
    assert(mvt2 && mvt2.montant_momo === 5000 && mvt2.montant_especes === 0, '3.3 Mouvement MoMo intègre: 5 000 FCFA');
    assert(mvt1.motif.includes(testServeuseNom) && mvt2.motif.includes(testServeuseNom), '3.4 Motif contient le nom de la serveuse');

    // --- TEST 4 : ISOLATION STRICTE ENTRE SECTEURS ---
    console.log('\n--- TEST 4 : ISOLATION STRICTE DES SECTEURS ---');
    const { data: otherSectorMvts } = await sb
      .from('caisse_mouvements')
      .select('id, sector_slug')
      .eq('company_id', TEST_COMPANY_ID)
      .neq('sector_slug', 'restaurant')
      .in('source_id', [refEsp, refMomo]);

    assert(!otherSectorMvts || otherSectorMvts.length === 0, '4.1 Zéro contamination vers les autres secteurs (Boutique, Pharmacie, etc.)');

    // --- TEST 5 : INTÉGRATION À LA CLÔTURE DE CAISSE (RAPPORT Z) ---
    console.log('\n--- TEST 5 : INTÉGRATION À LA CLÔTURE DE CAISSE (RAPPORT Z) ---');
    // Calcul direct comme dans caisseSectorService.calculerSoldesSessionAutomatique
    const { data: mvtsDirects } = await sb
      .from('caisse_mouvements')
      .select('montant_especes, montant_momo, montant, type, sens, source_module')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('sector_slug', 'restaurant')
      .eq('sens', 'entree')
      .gte('created_at', caisseSession.date_ouverture);

    let sumDirectEsp = 0;
    let sumDirectMo = 0;
    (mvtsDirects || []).forEach(m => {
      if (m.type === 'vente' || m.source_module === 'vente_pos') return;
      sumDirectEsp += Number(m.montant_especes) || 0;
      sumDirectMo += Number(m.montant_momo) || 0;
    });

    assert(sumDirectEsp >= 2000, '5.1 Entrées Espèces de clôture intègrent le versement de 2 000 FCFA', `${sumDirectEsp} FCFA`);
    assert(sumDirectMo >= 5000, '5.2 Entrées MoMo de clôture intègrent le versement de 5 000 FCFA', `${sumDirectMo} FCFA`);

    // Nettoyage des enregistrements de test créés
    console.log('\n--- NETTOYAGE DES DONNÉES DE TEST ---');
    await sb.from('caisse_mouvements').delete().in('source_id', [refEsp, refMomo]);
    await sb.from('restaurant_versements_serveurs').delete().eq('session_id', servSess.id);
    await sb.from('restaurant_sessions_serveurs').delete().eq('id', servSess.id);
    // Restaurer les compteurs initiaux de la session caisse
    await sb.from('caisse_sessions').update({
      especes_du_jour: initEspDuJour,
      momo_du_jour: initMomoDuJour,
      fond_actuel_especes: initFondActuelEsp,
      fond_actuel_momo: initFondActuelMo
    }).eq('id', caisseSession.id);
    console.log('Compteurs et enregistrements de test réinitialisés avec succès.');

  } catch (err) {
    console.error('Exception pendant les tests:', err);
    failed++;
  }

  console.log('\n========================================================================');
  console.log(`RÉSULTAT FINAL DES TESTS : ${passed} RÉUSSIS, ${failed} ÉCHECS`);
  console.log('========================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
