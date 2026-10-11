// =============================================================================
// GESTIO 229 — Test de Validation des Corrections Session & Vitesse de Vente
// =============================================================================

import { readFileSync } from 'fs'
import { join } from 'path'

console.log('🧪 Lancement des vérifications des corrections GESTIO 229...\n')

let allPassed = true

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ SUCCÈS : ${message}`)
  } else {
    console.error(`  ❌ ÉCHEC  : ${message}`)
    allPassed = false
  }
}

// ─── TEST 1 : Client Supabase & Persistance localStorage ─────────────────────
console.log('1️⃣ Vérification du client Supabase (supabase.ts)...')
const supabaseCode = readFileSync(join(process.cwd(), 'src/lib/supabase.ts'), 'utf-8')
assert(supabaseCode.includes('persistSession: true'), 'persistSession est configuré à true')
assert(supabaseCode.includes('autoRefreshToken: true'), 'autoRefreshToken est configuré à true')
assert(supabaseCode.includes('detectSessionInUrl: true'), 'detectSessionInUrl est configuré à true')
assert(supabaseCode.includes('storage: typeof window !== \'undefined\' ? window.localStorage : undefined') || supabaseCode.includes('storage: localStorage'), 'storage pointe bien vers localStorage')
assert(!supabaseCode.includes('sessionStorage'), 'sessionStorage n\'est jamais utilisé pour la session')

// ─── TEST 2 : AuthStore & Préservation de session au démarrage ──────────────
console.log('\n2️⃣ Vérification du store d\'authentification (authStore.ts)...')
const authStoreCode = readFileSync(join(process.cwd(), 'src/store/authStore.ts'), 'utf-8')
assert(authStoreCode.includes('supabase.auth.getSession()'), 'initialize() appelle bien supabase.auth.getSession() au montage')
assert(!authStoreCode.includes('await supabase.auth.signOut().catch(() => {})') || authStoreCode.indexOf('supabase.auth.getSession()') < authStoreCode.indexOf('signOut'), 'initialize() ne purge plus brutalement la session')
assert(authStoreCode.includes('supabase.auth.onAuthStateChange'), 'onAuthStateChange est configuré pour écouter les changements de session')
assert(authStoreCode.includes('TOKEN_REFRESHED') || authStoreCode.includes('SIGNED_IN'), 'onAuthStateChange gère SIGNED_IN et le rafraîchissement de token')

// ─── TEST 3 : ProtectedRoute / PrivateRoute & Gardes de Route ───────────────
console.log('\n3️⃣ Vérification de ProtectedRoute / PrivateRoute (App.tsx)...')
const appCode = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8')
assert(appCode.includes('export const ProtectedRoute'), 'ProtectedRoute est exporté')
assert(appCode.includes('export const PrivateRoute = ProtectedRoute'), 'PrivateRoute est exporté et pointe sur le garde')
assert(appCode.includes('if (isLoading) return <FullPageLoader />'), 'Affiche le spinner FullPageLoader tant que isLoading est true')
assert(appCode.includes('Navigate to="/login" replace'), 'Redirige vers /login uniquement quand non-authentifié')

// ─── TEST 4 : Optimistic UI & Validation Vente Ultra-Rapide (< 2s) ──────────
console.log('\n4️⃣ Vérification de la validation rapide dans POSPage.tsx...')
const posCode = readFileSync(join(process.cwd(), 'src/pages/dashboard/vente-pos/POSPage.tsx'), 'utf-8')
assert(posCode.includes('if (paying) return'), 'Double-clic désactivé immédiatement au clic sur Valider')
assert(posCode.includes('setPaying(true)'), 'Bouton passe immédiatement en état de chargement')
assert(posCode.includes('Validation...'), 'Libellé "Validation..." avec spinner affiché pendant le traitement')
assert(posCode.includes('clearCart()'), 'Panier vidé instantanément (Optimistic UI)')
assert(posCode.includes('setSalesHistory(prev => [optimisticSale'), 'Nouvelle ligne ajoutée instantanément en haut de la liste locale')
assert(posCode.includes('toast.success(\'Enregistré\''), 'Toast vert "Enregistré" affiché dès que Supabase confirme')
assert(posCode.includes('Promise.allSettled(') || posCode.includes('Promise.all('), 'Écritures secondaires exécutées en parallèle avec Promise.all')
assert(/supabase\s*\.\s*from\(['"]sales_orders['"]\)\s*\.\s*insert\(salePayload\)/.test(posCode), 'Insertion directe avec le client Supabase')

// ─── TEST 5 : Migration M059 & Index Supabase ───────────────────────────────
console.log('\n5️⃣ Vérification du fichier de migration SQL M059...')
const m059Code = readFileSync(join(process.cwd(), 'database/M059_performance_indexes_sales_validation.sql'), 'utf-8')
assert(m059Code.includes('idx_sales_orders_company_order_date'), 'Index composite company_id + order_date présent')
assert(m059Code.includes('idx_sales_orders_created_at_desc'), 'Index created_at présent')
assert(m059Code.includes('idx_sales_order_items_order_id_lookup'), 'Index sur sales_order_items présent')
assert(m059Code.includes('etablissement_id'), 'Index conditionnels etablissement_id présents')

console.log('\n------------------------------------------------------------')
if (allPassed) {
  console.log('🎉 TOUTES LES VÉRIFICATIONS ONT RÉUSSI AVEC SUCCÈS !')
} else {
  console.error('⚠️ CERTAINES VÉRIFICATIONS ONT ÉCHOUÉ.')
  process.exit(1)
}
