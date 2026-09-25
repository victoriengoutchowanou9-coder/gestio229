// =============================================================================
// GESTIO 229 SaaS — Client Supabase Singleton
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[GESTIO229] Variables VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquantes !')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'gestio229_session',
  },
  global: {
    headers: {
      'x-application-name': 'GESTIO229-SAAS-V3',
    },
  },
})

// ─── Helpers typés ─────────────────────────────────────────────────────────────

/**
 * Récupère le company_id de l'utilisateur connecté via user_profiles.
 */
export async function getCurrentCompanyId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error || !data) return null
  return data.company_id as string
}

/**
 * Helper pour les requêtes filtrées par company_id.
 * Assure l'isolation multi-tenant.
 */
export function tenantQuery(table: string, companyId: string) {
  return supabase.from(table).select('*').eq('company_id', companyId)
}

export default supabase
