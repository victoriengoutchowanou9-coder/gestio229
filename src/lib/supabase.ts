// =============================================================================
// GESTIO 229 SaaS — Client Supabase Singleton
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { createResilientFetch } from './supabaseResilientFetch'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}) as any

const OFFICIAL_SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co'
const OFFICIAL_SUPABASE_ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

function sanitizeSupabaseUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return OFFICIAL_SUPABASE_URL
  const trimmed = raw.trim().replace(/["']/g, '')
  // Une adresse email (contenant @) ne peut JAMAIS être une URL Supabase
  if (trimmed.includes('@')) {
    console.warn('[supabase.ts] La variable VITE_SUPABASE_URL contient une adresse email. Utilisation automatique de l\'URL Supabase officielle.')
    return OFFICIAL_SUPABASE_URL
  }
  let withProto = trimmed
  if (!withProto.startsWith('http://') && !withProto.startsWith('https://')) {
    withProto = `https://${withProto}`
  }
  try {
    const parsed = new URL(withProto)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return withProto
    }
  } catch (_) {}
  return OFFICIAL_SUPABASE_URL
}

function sanitizeSupabaseKey(raw?: string): string {
  if (!raw || typeof raw !== 'string') return OFFICIAL_SUPABASE_ANON_KEY
  const trimmed = raw.trim().replace(/["']/g, '')
  if (trimmed.includes('@') || trimmed.length < 10) {
    return OFFICIAL_SUPABASE_ANON_KEY
  }
  return trimmed
}

const supabaseUrl = sanitizeSupabaseUrl(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)
const supabaseAnonKey = sanitizeSupabaseKey(env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY)

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
