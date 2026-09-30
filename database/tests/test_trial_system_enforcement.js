// =============================================================================
// GESTIO 229 SaaS — Test de validation : Période d'Essai Gratuit de 1 Mois
// =============================================================================

import {
  checkModuleAccess,
  getCompanySubscriptionInfo,
  calculateSubscriptionPrice,
  STARTER_ACCESSIBLE_MODULES,
  ADVANCED_MODULES,
  ALL_STANDARD_MODULES
} from '../../src/core/subscription/subscriptionEngine.ts';

import { isSectorSubscribed } from '../../src/lib/sectorClient.ts';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=============================================================================');
  console.log('TEST 1 : Vérification de la Période d\'Essai Gratuit de 30 Jours (Active)');
  console.log('=============================================================================');

  const now = new Date();
  const trialCompany = {
    id: 'test-trial-1',
    name: 'Entreprise Test Essai',
    subscription_status: 'trial',
    created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // Créée il y a 10 jours
    selected_sectors: ['quincaillerie', 'poissonnerie', 'restaurant'],
  };

  const trialInfo = getCompanySubscriptionInfo(trialCompany);
  assert(trialInfo.isTrial === true, 'L\'entreprise est bien détectée en période d\'essai (isTrial = true)');
  assert(trialInfo.isExpired === false, 'L\'entreprise n\'est pas expirée (isExpired = false)');
  assert(trialInfo.daysRemaining === 20, `Jours restants corrects (attendu 20, obtenu ${trialInfo.daysRemaining})`);

  // Tous les modules doivent être 100% accessibles pendant l'essai sans restriction
  for (const mod of ALL_STANDARD_MODULES) {
    const res = checkModuleAccess(mod, trialCompany);
    assert(res.allowed === true, `Module ${mod} est 100% accessible pendant les 30 jours d'essai`);
  }

  console.log('\n=============================================================================');
  console.log('TEST 2 : Vérification de l\'Expiration après 30 Jours (Essai Dépassé)');
  console.log('=============================================================================');

  const expiredTrialCompany = {
    id: 'test-expired-1',
    name: 'Entreprise Essai Échu',
    subscription_status: 'trial',
    created_at: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(), // Créée il y a 31 jours
    selected_sectors: ['quincaillerie'],
  };

  const expiredInfo = getCompanySubscriptionInfo(expiredTrialCompany);
  assert(expiredInfo.isTrial === false, 'L\'entreprise n\'est plus en période d\'essai active');
  assert(expiredInfo.isExpired === true, 'L\'entreprise est marquée comme expirée (isExpired = true)');
  assert(expiredInfo.daysRemaining === 0, 'Jours restants = 0');

  // Tous les modules opérationnels doivent être bloqués
  for (const mod of ['ventes', 'stock', 'caisse', 'finances', 'rapports', 'syscohada', 'clients']) {
    const res = checkModuleAccess(mod, expiredTrialCompany);
    assert(res.allowed === false, `Module ${mod} est bien BLOQUÉ après expiration de l'essai`);
    assert(res.reason === 'expired', `Raison du blocage est bien 'expired'`);
  }

  // RÈGLE ABSOLUE : La page abonnement DOIT TOUJOURS rester accessible pour permettre le renouvellement
  const renewAccess = checkModuleAccess('abonnement', expiredTrialCompany);
  assert(renewAccess.allowed === true, 'Le module ABONNEMENT reste toujours accessible après expiration');

  console.log('\n=============================================================================');
  console.log('TEST 3 : Rétablissement Automatique post-Abonnement Payé (Starter vs Entreprise)');
  console.log('=============================================================================');

  // Compte ayant souscrit Starter
  const activeStarterCompany = {
    id: 'test-starter-1',
    name: 'Boutique Starter',
    subscription_status: 'active',
    subscription_plan: 'starter',
    created_at: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    selected_sectors: ['boutique'],
  };

  assert(checkModuleAccess('ventes', activeStarterCompany).allowed === true, 'Starter a accès au POS');
  assert(checkModuleAccess('stock', activeStarterCompany).allowed === true, 'Starter a accès aux Stocks');
  assert(checkModuleAccess('caisse', activeStarterCompany).allowed === true, 'Starter a accès à la Caisse');
  assert(checkModuleAccess('finances', activeStarterCompany).allowed === false, 'Starter n\'a pas accès à la Trésorerie');
  assert(checkModuleAccess('syscohada', activeStarterCompany).allowed === false, 'Starter n\'a pas accès au SYSCOHADA');
  assert(checkModuleAccess('abonnement', activeStarterCompany).allowed === true, 'Starter a accès à l\'Abonnement');

  // Compte ayant souscrit Entreprise
  const activeEntrepriseCompany = {
    id: 'test-entreprise-1',
    name: 'Boutique Entreprise',
    subscription_status: 'active',
    subscription_plan: 'entreprise',
    created_at: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    selected_sectors: ['boutique'],
  };

  assert(checkModuleAccess('finances', activeEntrepriseCompany).allowed === true, 'Entreprise a accès à la Trésorerie');
  assert(checkModuleAccess('syscohada', activeEntrepriseCompany).allowed === true, 'Entreprise a accès au SYSCOHADA');
  assert(checkModuleAccess('rapports', activeEntrepriseCompany).allowed === true, 'Entreprise a accès aux Rapports');

  console.log('\n=============================================================================');
  console.log('TEST 4 : Normalisation des Secteurs (Préfixe sec- et Sensibilité Casse)');
  console.log('=============================================================================');

  const multiSectorComp = {
    selected_sectors: ['sec-quincaillerie', 'sec-poissonnerie'],
  };

  assert(isSectorSubscribed('quincaillerie', multiSectorComp) === true, 'Secteur quincaillerie reconnu malgré préfixe sec-');
  assert(isSectorSubscribed('sec-quincaillerie', multiSectorComp) === true, 'Secteur sec-quincaillerie reconnu directement');
  assert(isSectorSubscribed('poissonnerie', multiSectorComp) === true, 'Secteur poissonnerie reconnu');
  assert(isSectorSubscribed('restaurant', multiSectorComp) === false, 'Secteur non souscrit (restaurant) est bien rejeté');

  console.log('\n=============================================================================');
  console.log('TEST 5 : Intégrité des Données Réelles Clients Supabase');
  console.log('=============================================================================');

  const { data: realCompanies, error: cErr } = await supabase
    .from('companies')
    .select('id, name, created_at, subscription_status, selected_sectors, sectors');

  if (cErr) {
    console.error('Erreur lecture Supabase companies:', cErr.message);
    failed++;
  } else {
    assert(realCompanies.length >= 2, `Au moins 2 vraies entreprises trouvées (${realCompanies.length})`);
    for (const c of realCompanies) {
      console.log(`  -> Entreprise: "${c.name}", statut: ${c.subscription_status}, créée le: ${c.created_at}`);
      const info = getCompanySubscriptionInfo(c);
      console.log(`     => Période d'essai: ${info.isTrial ? 'OUI' : 'NON'}, jours restants: ${info.daysRemaining}, expire le: ${info.endDate}`);
      assert(c.subscription_status === 'trial', `Entreprise ${c.name} est en statut trial`);
      assert(info.isTrial === true, `Entreprise ${c.name} bénéficie de l'essai de 30 jours actif`);
    }
  }

  console.log('\n=============================================================================');
  console.log(`RÉSULTAT GLOBAL : ${passed} passés, ${failed} échoués`);
  console.log('=============================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erreur inattendue:', err);
  process.exit(1);
});
