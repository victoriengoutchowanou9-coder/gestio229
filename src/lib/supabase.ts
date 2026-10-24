// =============================================================================
// GESTIO 229 SaaS — Client Supabase Singleton
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { createResilientFetch } from './supabaseResilientFetch'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}) as any

let rawUrl = (env.VITE_SUPABASE_URL as string) || 'https://inknljnhqmrykcrgglts.supabase.co'
if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
  rawUrl = `https://${rawUrl}`
}

const supabaseUrl = rawUrl
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    fetch: createResilientFetch(supabaseUrl, supabaseAnonKey),
    headers: {
      'x-application-name': 'GESTIO229-SAAS-V3',
    },
  },
})

// Sécurité anti-crash globale : expose supabase sur window
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase
}

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
