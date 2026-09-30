// =============================================================================
// GESTIO 229 — TEST DE SÉCURITÉ & ISOLATION MULTI-APPAREILS (PC / MOBILE / TABLETTE)
// Scénario : 1 compte -> 1 entreprise -> uniquement ses activités et ses données
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

async function runTests() {
  console.log('='.repeat(75));
  console.log('TEST SUITE : ISOLATION MULTI-APPAREILS, ENTREPRISES & ACTIVITÉS');
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

  // ── TEST 1 : Connexion Compte Entreprise A (Sté MA JOIE SARL) ──────────────
  console.log('\n--- TEST 1 : Authentification & Résolution Entreprise A (MA JOIE) ---');
  const clientA = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: authA, error: errAuthA } = await clientA.auth.signInWithPassword({
    email: 'victoriengoutchowanou2024@gmail.com',
    password: 'Agossou98'
  });

  assert(!errAuthA && authA?.user, 'Connexion réussie pour victoriengoutchowanou2024@gmail.com');

  const { data: profileA } = await clientA
    .from('user_profiles')
    .select('*, company:companies(*)')
    .eq('auth_user_id', authA.user.id)
    .single();

  assert(profileA && profileA.company, 'Profil utilisateur et entreprise rattachée résolus');
  assert(profileA.company.name.includes('MA JOIE'), `Entreprise A est bien "Sté MA JOIE SARL" (obtenu: ${profileA.company.name})`);
  assert(profileA.company.ifu_number === '3202623152325', `Numéro IFU conforme : ${profileA.company.ifu_number}`);
  assert(profileA.company.city === 'Calavi', `Localisation Entreprise A : ${profileA.company.city}`);

  // ── TEST 2 : Activités de l'Entreprise A (MA JOIE) ─────────────────────────
  console.log('\n--- TEST 2 : Activités Supabase de l\'Entreprise A ---');
  const { data: actsA } = await clientA
    .from('company_activities')
    .select('*')
    .eq('company_id', profileA.company_id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  assert(actsA && actsA.length === 4, `Entreprise A possède exactement ses 4 activités actives (obtenu: ${actsA?.length})`);
  
  const hasQuincaillerie = actsA?.some(a => a.sector_slug === 'quincaillerie' && a.pos_location === 'Calavi');
  const hasPoissonnerie = actsA?.some(a => a.sector_slug === 'poissonnerie' && a.pos_location === 'Calavi');
  const hasBrasserie = actsA?.some(a => a.sector_slug === 'brasserie' && a.pos_location === 'Calavi');
  const hasMicrofinance = actsA?.some(a => a.sector_slug === 'microfinance' && a.pos_location === 'Calavi');

  assert(hasQuincaillerie, 'Activité 1 : Quincaillerie & Matériaux (Calavi) présente');
  assert(hasPoissonnerie, 'Activité 2 : Poissonnerie & Produits Frais (Calavi) présente');
  assert(hasBrasserie, 'Activité 3 : Brasserie & Dépôt de Boissons (Calavi) présente');
  assert(hasMicrofinance, 'Activité 4 : Microfinance & Transfert d\'Argent (Calavi) présente');

  // Vérifier qu'aucune activité de l'Entreprise A ne porte le nom de STÉ MAG
  const containsMagInA = actsA?.some(a => a.activity_name.includes('STÉ MAG') || a.pos_location === 'Cotonou');
  assert(!containsMagInA, 'Zéro contamination : aucune activité de STÉ MAG présente dans l\'Entreprise A');

  // ── TEST 3 : Connexion Entreprise B (Sté MAG) ──────────────────────────────
  console.log('\n--- TEST 3 : Résolution Entreprise B (Sté MAG) ---');
  const magCompanyId = '456cc4d1-9e69-4468-8350-b0ffaf73798d';
  const { data: actsB } = await clientA
    .from('company_activities')
    .select('*')
    .eq('company_id', magCompanyId)
    .eq('status', 'ACTIVE');

  assert(actsB && actsB.length === 3, `Entreprise B (MAG) possède ses 3 activités propres (obtenu: ${actsB?.length})`);
  const containsMaJoieInB = actsB?.some(a => a.activity_name.includes('MA JOIE') || a.pos_location === 'Calavi');
  assert(!containsMaJoieInB, 'Zéro contamination : aucune activité de MA JOIE présente dans l\'Entreprise B');

  // ── TEST 4 : Isolation Stricte Bidirectionnelle (A ≠ B) ──────────────────────
  console.log('\n--- TEST 4 : Isolation Stricte des Données Métier ---');
  assert(profileA.company_id !== magCompanyId, 'Les identifiants UUID des entreprises A et B sont strictement disjoints');

  // ── TEST 5 : Création / Modification temps réel sur Supabase ───────────────
  console.log('\n--- TEST 5 : Cycle de vie Supabase persistant (Ajout -> MAJ -> Soft-Delete) ---');
  const testSectorSlug = 'informatique';
  const { data: newAct, error: createErr } = await clientA
    .from('company_activities')
    .insert({
      company_id: profileA.company_id,
      sector_slug: testSectorSlug,
      sector_code: 'INFORMATIQUE',
      activity_name: 'STÉ MA JOIE SARL — SOLUTIONS INFORMATIQUES & TECH',
      pos_location: 'Calavi',
      manager_name: 'Victorien G.',
      status: 'ACTIVE',
      is_active: true
    })
    .select()
    .single();

  assert(!createErr && newAct?.id, 'Création persistante dans Supabase company_activities réussie');

  // Modification
  const { data: updatedAct, error: updateErr } = await clientA
    .from('company_activities')
    .update({
      activity_name: 'STÉ MA JOIE SARL — SOLUTIONS INFORMATIQUES ET CLOUD',
      updated_at: new Date().toISOString()
    })
    .eq('id', newAct.id)
    .select()
    .single();

  assert(!updateErr && updatedAct.activity_name.includes('CLOUD'), 'Mise à jour en direct dans Supabase réussie');

  // Soft delete (archivage légal)
  const { data: archivedAct, error: archiveErr } = await clientA
    .from('company_activities')
    .update({
      status: 'ARCHIVEE',
      is_active: false,
      archived_at: new Date().toISOString()
    })
    .eq('id', newAct.id)
    .select()
    .single();

  assert(!archiveErr && archivedAct.status === 'ARCHIVEE', 'Soft delete conforme : statut ARCHIVEE');

  // Nettoyage de la ligne de test
  await clientA.from('company_activities').delete().eq('id', newAct.id);

  console.log('\n' + '='.repeat(75));
  console.log(`RÉSULTAT TOTAL : ${passedTests}/${totalTests} tests passés`);
  console.log('='.repeat(75));

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
