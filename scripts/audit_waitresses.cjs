const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://inknljnhqmrykcrgglts.supabase.co', 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr');

async function run() {
  const compId = '16f1b55b-8c51-454c-9587-4e21fb1853df';

  console.log('--- RESTAURANT SERVEURS ---');
  const { data: srv, error: sErr } = await sb.from('restaurant_serveurs').select('*').eq('company_id', compId);
  console.log('error:', sErr, 'count:', srv?.length);
  if (srv) {
    srv.forEach(s => console.log(`  [SRV] ID: ${s.id} | Nom: ${s.nom_complet} | Statut: ${s.statut} | Actif: ${s.actif}`));
  }

  console.log('\n--- RESTAURANT SESSIONS SERVEURS ---');
  const { data: sess, error: sessErr } = await sb.from('restaurant_sessions_serveurs').select('id, serveur_nom, statut, total_ventes_declarees_ttc, total_versements_recus, solde_restant_a_remettre, created_at').eq('company_id', compId);
  console.log('error:', sessErr, 'count:', sess?.length);
  if (sess) {
    sess.forEach(s => console.log(`  [SESS] ID: ${s.id} | Nom: ${s.serveur_nom} | Statut: ${s.statut} | Ventes: ${s.total_ventes_declarees_ttc} | Versé: ${s.total_versements_recus} | Solde: ${s.solde_restant_a_remettre} | Date: ${s.created_at}`));
  }

  console.log('\n--- STAFF MEMBERS ---');
  const { data: staff, error: stErr } = await sb.from('staff_members').select('id, full_name, role, is_active, sector_slug').eq('company_id', compId);
  console.log('error:', stErr, 'count:', staff?.length);
  if (staff) {
    staff.forEach(st => console.log(`  [STAFF] ID: ${st.id} | Nom: ${st.full_name} | Role: ${st.role} | Active: ${st.is_active} | Sector: ${st.sector_slug}`));
  }
}

run();
