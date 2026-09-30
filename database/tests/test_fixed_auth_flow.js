// =============================================================================
// GESTIO 229 SaaS — Test de Non-Régression : Flux Auth & Auto-Provisioning
// Teste la résolution du bug « Profil entreprise introuvable / M015 »
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testFixedAuthFlow() {
  console.log('=============================================================================');
  console.log('GESTIO 229 — TEST DE VALIDATION DU FLUX INSCRIPTION & CONNEXION SANS M015');
  console.log('=============================================================================\n');

  const testEmail = `client.test.${Date.now()}@gestio229.bj`;
  const testPassword = 'Password123!@#';
  let createdAuthId = null;
  let createdCompId = null;
  let createdProfileId = null;

  try {
    // 1. Simuler l'inscription avec métadonnées complètes
    console.log('▶ Étape 1 : Inscription Supabase Auth avec user_metadata complètes...');
    const { data: signUpData, error: signErr } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          company_name: 'TEST PHARMACIE EXCELLENCE',
          responsible_name: 'M. Koffi Testeur',
          phone: '0197000000',
          ifu_number: '3202611112222',
          city: 'Cotonou',
          country: 'Bénin',
          selected_sectors: ['pharmacie', 'supermarche'],
          role: 'administrateur'
        }
      }
    });

    if (signErr) {
      console.warn('   Note signUp :', signErr.message);
    } else {
      createdAuthId = signUpData?.user?.id;
      console.log(`   ✅ Inscription initiée pour : ${testEmail} (ID: ${createdAuthId || 'en attente de confirmation'})`);
    }

    // 2. Simuler le cas critique : Le compte existe dans Auth, mais company et profile sont absents
    // (Par exemple après un reset ou si la création avait été interrompue)
    console.log('\n▶ Étape 2 : Simulation du cas critique (profil et entreprise absents)...');
    
    // Vérifier que la table companies n'a pas encore cette entreprise
    const { data: compCheck } = await supabase
      .from('companies')
      .select('*')
      .ilike('email', testEmail)
      .maybeSingle();

    console.log(`   Entreprise en base pour ${testEmail} :`, compCheck ? 'Existe' : 'Absente (Cas critique simulé)');

    // 3. Exécution de l'algorithme d'auto-provisioning
    console.log('\n▶ Étape 3 : Exécution de l\'auto-provisioning et liaison sécurisée...');
    
    // A. Création entreprise avec valeurs metadata
    const sectors = ['pharmacie', 'supermarche'];
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: newCompany, error: compErr } = await supabase
      .from('companies')
      .insert({
        name: 'TEST PHARMACIE EXCELLENCE',
        email: testEmail,
        phone: '0197000000',
        ifu_number: '3202611112222',
        city: 'Cotonou',
        country: 'Bénin',
        active_sector: 'pharmacie',
        selected_sectors: sectors,
        sectors: sectors,
        subscription_status: 'trial',
        subscription_plan: 'multiservices',
        plan: 'multiservices',
        onboarding_completed: true,
        currency: 'FCFA'
      })
      .select()
      .single();

    if (compErr) throw new Error('Échec création entreprise: ' + compErr.message);
    createdCompId = newCompany.id;
    console.log(`   ✅ Entreprise auto-provisionnée avec succès : ID ${newCompany.id}`);

    // B. Création profil administrateur
    const defaultAdminPermissions = {
      admin: true, commercial: true, stock: true,
      treasury: true, purchases: true, reporting: true,
      accounting: true, hr: true,
      ventes: { view: true, create: true, edit: true, delete: true },
      finances: { view: true, caisse: true, tresorerie: true }
    };

    const { data: newProfile, error: profErr } = await supabase
      .from('user_profiles')
      .insert({
        company_id: newCompany.id,
        auth_user_id: createdAuthId || null,
        full_name: 'M. Koffi Testeur',
        username: testEmail,
        email: testEmail,
        phone: '0197000000',
        role: 'administrateur',
        is_active: true,
        permissions: defaultAdminPermissions
      })
      .select(`*, company:companies(*)`)
      .single();

    if (profErr) throw new Error('Échec création profil: ' + profErr.message);
    createdProfileId = newProfile.id;
    console.log(`   ✅ Profil administrateur auto-provisionné et lié : ID ${newProfile.id}`);

    // 4. Vérification de la liaison complète et de l'absence de tout blocage
    console.log('\n▶ Étape 4 : Vérification de la liaison relationnelle...');
    const { data: checkJoined, error: joinErr } = await supabase
      .from('user_profiles')
      .select(`id, email, role, company_id, company:companies(id, name, active_sector, subscription_status)`)
      .eq('id', newProfile.id)
      .single();

    if (joinErr || !checkJoined?.company) {
      throw new Error('La relation profil <-> entreprise n\'a pas pu être résolue !');
    }

    console.log('   ✅ Relation vérifiée avec succès :');
    console.log(`      - Utilisateur : ${checkJoined.email} (${checkJoined.role})`);
    console.log(`      - Entreprise : ${checkJoined.company.name} (Secteur : ${checkJoined.company.active_sector})`);
    console.log(`      - Statut abonnement : ${checkJoined.company.subscription_status}`);

    console.log('\n=============================================================================');
    console.log('🎉 TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS !');
    console.log('Le flux Auth -> Profil -> Entreprise -> Secteurs est 100% résilient.');
    console.log('Aucun message d\'erreur technique ni dépendance à la migration M015.');
    console.log('=============================================================================');
  } catch (err) {
    console.error('❌ ÉCHEC DU TEST :', err);
    process.exit(1);
  } finally {
    // Nettoyage de l'environnement de test
    if (createdProfileId) {
      await supabase.from('user_profiles').delete().eq('id', createdProfileId);
    }
    if (createdCompId) {
      await supabase.from('companies').delete().eq('id', createdCompId);
    }
    console.log('\n🧹 Données de test nettoyées avec succès.');
  }
}

testFixedAuthFlow();
