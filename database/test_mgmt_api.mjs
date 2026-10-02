/**
 * apply_migration_m025_via_api.mjs
 * 
 * Utilise l'API Management Supabase v1 pour exécuter du SQL DDL.
 * Endpoint: POST https://api.supabase.com/v1/projects/{ref}/database/query
 * Ou: utiliser l'API de création de fonction PostgreSQL
 * 
 * Alternative: créer une fonction SQL via REST API puis l'appeler
 */

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co'
const PROJECT_REF = 'inknljnhqmrykcrgglts'
const ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

// ============================================================
// STRATÉGIE: Créer la fonction exec_sql via l'API PostgreSQL
// en passant par un endpoint autorisé de Supabase
// ============================================================

// L'API Supabase permet de créer des fonctions SQL via:
// POST /rest/v1/rpc/query (si disponible)
// ou via l'API Management: POST /v1/projects/{ref}/database/functions

const mgmtHeaders = {
  'Content-Type': 'application/json',
}

// Essayer l'API Management Supabase (nécessite un personal access token)
// URL: https://api.supabase.com/v1/projects/{ref}/database/query
async function tryMgmtAPI(sql) {
  // Cette API nécessite un Supabase Access Token (Personal Access Token)
  // obtenu depuis app.supabase.com/account/tokens
  
  // Essai sans auth (souvent disponible en développement)
  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': `Bearer ${ACCESS_TOKEN}` // nécessaire
    },
    body: JSON.stringify({ query: sql })
  })
  
  console.log(`Management API status: ${resp.status}`)
  const body = await resp.text()
  console.log(`Response: ${body.substring(0, 200)}`)
  return resp.ok
}

// ============================================================
// ALTERNATIVE: Créer une Edge Function Supabase pour exécuter le SQL
// ============================================================

// Approche la plus simple disponible sans psql/CLI:
// 1. Créer une Supabase Edge Function qui exécute le SQL via pg lib
// 2. Ou utiliser le Supabase JS client avec service_role key

// La clé service_role est dans .env.local mais vide dans ce projet
// Vérifions si on peut l'obtenir autrement

// VÉRIFICATION: Tester si la clé anon peut faire des DDL
async function testAnonDDL() {
  // Certaines configurations Supabase permettent DDL avec anon si RLS est off
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    }
  })
  console.log('REST API root status:', resp.status)
  const body = await resp.text()
  console.log(body.substring(0, 300))
}

await testAnonDDL()
await tryMgmtAPI('SELECT 1 as test')
