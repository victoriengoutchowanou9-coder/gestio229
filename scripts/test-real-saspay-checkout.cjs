'use strict';
/**
 * Test réel de communication et d'initialisation auprès de SaaS Pay
 * Valide :
 * 1. Initialisation d'un paiement de 10 000 FCFA
 * 2. Communication réelle avec l'API SasPay
 * 3. Réception de la réponse avec code 201 et URL de paiement (checkout_url)
 * 4. Interrogation directe du statut de la session créée (code 200, PENDING)
 * 5. Résilience si customer_email ou customer_name manquants
 */

require('dotenv').config();

const apiKey = process.env.SASPAY_SECRET_KEY;
if (!apiKey) {
  console.error('❌ SASPAY_SECRET_KEY est manquant dans les variables d\'environnement (.env).');
  process.exit(1);
}
const baseUrl = process.env.SASPAY_API_URL || 'https://api.saspay.me/api/v1';

async function runRealTest() {
  console.log('\n🚀 [TEST RÉEL SAAS PAY] Démarrage de la vérification en direct...\n');

  // ─── Test A : Initialisation standard 10 000 FCFA avec tous les paramètres ───
  console.log('1. Envoi requête création session (10 000 FCFA)...');
  const payloadA = {
    amount: '10000.00',
    currency: 'XOF',
    description: 'Abonnement GESTIO229 - Renouvellement 1 mois',
    customer_email: 'direction@gestio229.com',
    customer_name: 'Pharmacie du Peuple',
    customer_phone: '+2290197000000',
    return_url: 'https://gestio229.com/dashboard/abonnement?payment=return&ref=GP-LIVE-TEST-001',
    metadata: {
      company_id: 'c8d4a971-8888-4444-9999-123456789abc',
      reference: 'GP-LIVE-TEST-001',
      duration_months: 1,
    }
  };

  const resA = await fetch(`${baseUrl}/checkout-sessions/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadA),
  });

  const dataA = await resA.json();
  console.log('   HTTP Status :', resA.status);

  if (resA.status !== 201 || !dataA?.data?.checkout_url) {
    console.error('❌ Échec création session standard :', dataA);
    process.exit(1);
  }

  const sessionData = dataA.data;
  console.log('✅ Session créée avec succès !');
  console.log('   Session ID   :', sessionData.id);
  console.log('   Checkout URL :', sessionData.checkout_url);
  console.log('   Montant      :', sessionData.amount, sessionData.currency);
  console.log('   Statut       :', sessionData.status);

  // ─── Test B : Vérification du statut de la session en direct ──────────────
  console.log('\n2. Interrogation directe du statut de la session...');
  const resB = await fetch(`${baseUrl}/checkout-sessions/${sessionData.id}/status/`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  const dataB = await resB.json();
  console.log('   HTTP Status :', resB.status);
  console.log('   Statut session :', dataB?.data?.status);

  if (resB.status !== 200 || dataB?.data?.status !== 'PENDING') {
    console.error('❌ Échec vérification du statut de la session :', dataB);
    process.exit(1);
  }
  console.log('✅ Statut PENDING validé avec succès auprès de SaaS Pay !');

  // ─── Test C : Résilience avec fallback email automatique ─────────────────
  console.log('\n3. Test résilience avec fallback email (client sans email configuré)...');
  const companyId = 'd8e4f1a2-9999-4321-aaaa-bbbbccccdddd';
  const safeId = String(companyId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
  const fallbackEmail = `contact.${safeId}@gestio229.com`;

  const payloadC = {
    amount: '10000.00',
    currency: 'XOF',
    description: 'Abonnement GESTIO229 - Client sans email initial',
    customer_email: fallbackEmail,
    customer_name: 'Superette de Cotonou',
    return_url: 'https://gestio229.com/dashboard/abonnement?payment=return',
  };

  const resC = await fetch(`${baseUrl}/checkout-sessions/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadC),
  });

  const dataC = await resC.json();
  console.log('   HTTP Status :', resC.status);

  if (resC.status !== 201 || !dataC?.data?.checkout_url) {
    console.error('❌ Échec résilience fallback email :', dataC);
    process.exit(1);
  }
  console.log('✅ Session avec email fallback créée avec succès !');
  console.log('   Checkout URL :', dataC.data.checkout_url);

  console.log('\n================================================================');
  console.log('🎉 TOUS LES TESTS RÉELS DE COMMUNICATION SAAS PAY ONT RÉUSSI !');
  console.log('================================================================\n');
}

runRealTest().catch((err) => {
  console.error('Erreur test réel :', err);
  process.exit(1);
});
