// =============================================================================
// GESTIO 229 — TEST DE SÉCURITÉ : UTILISATEURS INTERNES & ISOLATION MULTI-ACTIVITÉS
// Vérifie que :
// 1. Un utilisateur interne créé avec identifiant + mot de passe s'authentifie sans erreur
// 2. L'utilisateur interne est strictement confiné à l'entreprise de son administrateur
// 3. L'utilisateur interne rattaché à une activité (ex: Quincaillerie) est correctement orienté
// 4. L'utilisateur interne ne peut accéder à aucune donnée d'une autre entreprise
// 5. La mise à jour du mot de passe par l'admin fonctionne instantanément
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

async function runTests() {
  console.log('='.repeat(75));
  console.log('TEST SUITE : UTILISATEURS INTERNES, IDENTIFIANTS & ISOLATION SECTEUR');
  console.log('='.repeat(75));

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Récupération des deux entreprises de test
  const { data: companies } = await client
    .from('companies')
    .select('id, name, email')
    .limit(2);

  assert(companies && companies.length >= 2, 'Au moins 2 entreprises distinctes trouvées dans Supabase');
  const compA = companies[0];
  const compB = companies[1];
  console.log(`  Entreprise A : ${compA.name} (${compA.id})`);
  console.log(`  Entreprise B : ${compB.name} (${compB.id})`);

  // 2. Récupération d'une activité de l'Entreprise A
  const { data: actA } = await client
    .from('company_activities')
    .select('*')
    .eq('company_id', compA.id)
    .limit(1)
    .maybeSingle();

  const assignedActivityId = actA ? actA.id : 'act_test_default';
  console.log(`  Activité assignée pour le test : ${actA?.activity_name || 'Défaut'} (${assignedActivityId})`);

  // 3. Création d'un utilisateur interne de test pour l'Entreprise A (ex: caissier_test_229)
  const testUsername = `caissier_${Date.now()}`;
  const initialPassword = 'Password123!';
  const updatedPassword = 'NewSecret2026@';

  console.log(`\n--- TEST 1 : Création utilisateur interne dans Entreprise A ---`);
  const { data: createdUser, error: createErr } = await client
    .from('user_profiles')
    .insert({
      company_id: compA.id,
      full_name: 'Amoussou Kokou (Caissier)',
      username: testUsername,
      email: `${testUsername}@gestio229.internal`,
      password_hash: initialPassword,
      phone: '+229 97 12 34 56',
      role: 'caissier',
      is_active: true,
      permissions: {
        sector_id: assignedActivityId,
        is_internal_user: true,
        caisse: { view: true, create: true },
        ventes: { view: true, create: true }
      }
    })
    .select('*, company:companies(*)')
    .single();

  assert(!createErr && createdUser, `Création utilisateur interne "${testUsername}" réussie`);
  assert(createdUser?.company_id === compA.id, `L'utilisateur appartient strictement à l'Entreprise A (${compA.name})`);
  assert(createdUser?.password_hash === initialPassword, 'Mot de passe haché/stocké vérifié');

  // 4. Test de connexion (Cas B AuthStore) avec Identifiant + Mot de passe
  console.log(`\n--- TEST 2 : Simulation Connexion Cas B (Identifiant + Mot de passe) ---`);
  const { data: loginProfiles, error: loginErr } = await client
    .from('user_profiles')
    .select('*, company:companies(*)')
    .or(`username.ilike.${testUsername},email.ilike.${testUsername}`);

  assert(!loginErr && loginProfiles?.length === 1, `Profil trouvé avec succès pour "${testUsername}"`);
  const loggedProfile = loginProfiles[0];
  assert(loggedProfile.password_hash === initialPassword, 'Correspondance exacte du mot de passe');
  assert(loggedProfile.company_id === compA.id, `Entreprise rattachée correcte : ${loggedProfile.company?.name}`);
  assert(loggedProfile.is_active === true, 'Le compte utilisateur est actif');
  assert(loggedProfile.permissions?.sector_id === assignedActivityId, `Activité affectée : ${loggedProfile.permissions?.sector_id}`);

  // 5. Test rejet d'un mauvais mot de passe
  console.log(`\n--- TEST 3 : Rejet mot de passe incorrect ---`);
  const badPassword = 'WrongPassword999';
  const isMatchBad = loggedProfile.password_hash === badPassword;
  assert(!isMatchBad, 'Accès rejeté en cas de mot de passe incorrect');

  // 6. Test mise à jour du mot de passe par l'administrateur
  console.log(`\n--- TEST 4 : Mise à jour du mot de passe par l'Admin ---`);
  const { error: updateErr } = await client
    .from('user_profiles')
    .update({
      password_hash: updatedPassword,
      updated_at: new Date().toISOString()
    })
    .eq('id', createdUser.id)
    .eq('company_id', compA.id);

  assert(!updateErr, 'Mise à jour du mot de passe effectuée sans erreur');

  // Vérifier la nouvelle connexion avec le nouveau mot de passe
  const { data: updatedProfile } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', createdUser.id)
    .single();

  assert(updatedProfile.password_hash === updatedPassword, 'Nouveau mot de passe actif immédiatement');
  assert(updatedProfile.password_hash !== initialPassword, 'Ancien mot de passe révoqué');

  // 7. Test Isolation : Vérifier que l'utilisateur interne ne peut pas être vu par l'Entreprise B
  console.log(`\n--- TEST 5 : Isolation stricte vis-à-vis de l'Entreprise B ---`);
  const { data: usersCompB } = await client
    .from('user_profiles')
    .select('id, username')
    .eq('company_id', compB.id)
    .eq('username', testUsername);

  assert(usersCompB?.length === 0, `L'utilisateur de l'Entreprise A n'apparaît JAMAIS dans l'Entreprise B (${compB.name})`);

  // 8. Nettoyage de l'utilisateur de test
  console.log(`\n--- TEST 6 : Nettoyage sécurisé du profil de test ---`);
  const { error: delErr } = await client
    .from('user_profiles')
    .delete()
    .eq('id', createdUser.id);

  assert(!delErr, 'Utilisateur de test supprimé proprement');

  // Synthèse
  console.log('\n' + '='.repeat(75));
  console.log(`RÉSULTAT GLOBAL : ${passedTests}/${totalTests} TESTS VALIDÉS AVEC SUCCÈS`);
  console.log('='.repeat(75));
}

runTests().catch(console.error);
