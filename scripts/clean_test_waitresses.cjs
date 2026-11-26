const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});
const supabase = createClient(url, key);

async function cleanTestWaitresses() {
  console.log('--- NETTOYAGE ET ARCHIVAGE DES COMPTES SERVEUSES FICTIFS ---');
  
  // 1. Trouver les sessions de test ouvertes
  const { data: testSessions, error: sessErr } = await supabase
    .from('restaurant_sessions_serveurs')
    .select('*')
    .or('serveur_nom.ilike.%test%,serveur_nom.ilike.%fictif%');

  if (sessErr) {
    console.error('Erreur recherche sessions test:', sessErr);
    return;
  }

  console.log(`Trouvé ${testSessions?.length || 0} session(s) de test à archiver/clôturer.`);
  for (const sess of (testSessions || [])) {
    console.log(`Clôture/Archivage session test: ${sess.id} - ${sess.serveur_nom}`);
    const { error: updErr } = await supabase
      .from('restaurant_sessions_serveurs')
      .update({
        statut: 'CLOTUREE',
        heure_cloture: sess.heure_cloture || new Date().toISOString(),
        cloture_par: 'Administration (Nettoyage)',
        justification_ecart: 'Compte de test archivé conformément aux directives de nettoyage',
        updated_at: new Date().toISOString()
      })
      .eq('id', sess.id);

    if (updErr) console.error(`Erreur update ${sess.id}:`, updErr);
    else console.log(`Session ${sess.id} clôturée avec succès.`);
  }

  // 2. Vérifier les serveurs dans restaurant_serveurs
  const { data: testServeurs, error: srvErr } = await supabase
    .from('restaurant_serveurs')
    .select('*')
    .or('nom_complet.ilike.%test%,nom_complet.ilike.%fictif%');

  if (srvErr) {
    console.error('Erreur recherche serveurs test:', srvErr);
    return;
  }

  console.log(`Trouvé ${testServeurs?.length || 0} serveur(s) de test.`);
  for (const srv of (testServeurs || [])) {
    console.log(`Archivage serveur test: ${srv.id} - ${srv.nom_complet}`);
    const { error: updSrvErr } = await supabase
      .from('restaurant_serveurs')
      .update({
        statut: 'ARCHIVE',
        updated_at: new Date().toISOString()
      })
      .eq('id', srv.id);

    if (updSrvErr) console.error(`Erreur archivage serveur ${srv.id}:`, updSrvErr);
    else console.log(`Serveur ${srv.id} archivé.`);
  }

  console.log('--- FIN DU NETTOYAGE ---');
}

cleanTestWaitresses().catch(console.error);
