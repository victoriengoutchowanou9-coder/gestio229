const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://inknljnhqmrykcrgglts.supabase.co', 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr');

async function run() {
  const { data: sess, error } = await sb.from('caisse_sessions').select('*').limit(2);
  console.log('caisse_sessions error:', error, 'keys:', sess && sess[0] ? Object.keys(sess[0]) : 'empty');
  if (sess && sess[0]) console.log('sample sess:', sess[0]);

  const { data: mvt, error: mErr } = await sb.from('caisse_mouvements').select('*').limit(2);
  console.log('caisse_mouvements error:', mErr, 'keys:', mvt && mvt[0] ? Object.keys(mvt[0]) : 'empty');
  if (mvt && mvt[0]) console.log('sample mvt:', mvt[0]);

  const { data: restSess, error: rErr } = await sb.from('restaurant_sessions_serveurs').select('*').limit(2);
  console.log('restaurant_sessions_serveurs error:', rErr, 'keys:', restSess && restSess[0] ? Object.keys(restSess[0]) : 'empty');

  const { data: restVmt, error: vErr } = await sb.from('restaurant_versements_serveurs').select('*').limit(2);
  console.log('restaurant_versements_serveurs error:', vErr, 'keys:', restVmt && restVmt[0] ? Object.keys(restVmt[0]) : 'empty');
}

run();
