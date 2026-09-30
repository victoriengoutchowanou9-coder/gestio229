import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testReRegistration() {
  console.log('Testing re-registration with previous client email: victoriengoutchowanou62@gmail.com');
  const email = 'victoriengoutchowanou62@gmail.com';
  const password = 'NewPassword2026!';

  // Tenter de créer une nouvelle entreprise avec cet email
  const { data: comp, error: compErr } = await supabase.from('companies').insert({
    name: 'RENAISSANCE VIGNON',
    email: email,
    phone: '0162272324',
    ifu_number: '3202640164717',
    city: 'Cotonou',
    country: 'Bénin',
    active_sector: 'boutique',
    subscription_status: 'trial',
    subscription_plan: 'starter',
    onboarding_completed: true,
    sectors: ['boutique']
  }).select().single();

  if (compErr) {
    console.log('❌ Erreur création entreprise:', compErr.message);
    return;
  }
  console.log('✅ Entreprise créée avec succès pour ancien email:', comp.name, comp.id);

  // Créer son profil administrateur
  const { data: prof, error: profErr } = await supabase.from('user_profiles').insert({
    company_id: comp.id,
    full_name: 'Victorien G.',
    username: email,
    email: email,
    phone: '0162272324',
    role: 'administrateur',
    permissions: { admin: true, commercial: true, stock: true },
    is_active: true
  }).select().single();

  if (profErr) {
    console.log('❌ Erreur création profil:', profErr.message);
  } else {
    console.log('✅ Profil créé avec succès pour ancien email:', prof.full_name, prof.id);
  }

  // Nettoyage immédiat
  await supabase.from('user_profiles').delete().eq('id', prof.id);
  await supabase.from('companies').delete().eq('id', comp.id);
  console.log('✅ Nettoyage de vérification terminé.');
}

testReRegistration();
