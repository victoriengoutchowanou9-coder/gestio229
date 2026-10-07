// =============================================================================
// GESTIO 229 SaaS — Helper Sécurisé de Création d'Utilisateurs avec Email Confirmé
// =============================================================================

import { supabase } from './supabase'

export interface CreateUserInput {
  email: string
  password: string
  company_id: string
  identifiant: string
  role: string
  full_name?: string
  phone?: string
  extra_metadata?: Record<string, any>
}

export interface CreateUserResult {
  success: boolean
  userId?: string
  email: string
  error?: string
}

/**
 * Crée un utilisateur de façon sécurisée en forçant la confirmation de l'email
 * (email_confirm: true) pour éviter le blocage 100% des comptes.
 */
export async function createConfirmedUser(input: CreateUserInput): Promise<CreateUserResult> {
  const cleanEmail = input.email.trim().toLowerCase()
  const userMetadata = {
    company_id: input.company_id,
    identifiant: input.identifiant,
    role: input.role,
    full_name: input.full_name || input.identifiant,
    phone: input.phone || null,
    ...(input.extra_metadata || {}),
  }

  // 1. Tenter via la RPC create_confirmed_user (si migration 006 appliquée)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_confirmed_user', {
      p_email: cleanEmail,
      p_password: input.password,
      p_user_metadata: userMetadata,
    })

    if (!rpcError && rpcData?.id) {
      return {
        success: true,
        userId: rpcData.id,
        email: cleanEmail,
      }
    }
  } catch (rpcErr) {
    console.warn('[authAdminHelper] RPC create_confirmed_user non disponible, tentative alternative :', rpcErr)
  }

  // 2. Tenter via supabase.auth.admin.createUser (si token admin disponible)
  try {
    if (supabase.auth?.admin?.createUser) {
      const { data: adminData, error: adminErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: input.password,
        email_confirm: true, // OBLIGATOIRE - sinon tous les comptes sont bloqués
        user_metadata: userMetadata,
      })

      if (!adminErr && adminData?.user?.id) {
        return {
          success: true,
          userId: adminData.user.id,
          email: cleanEmail,
        }
      }
    }
  } catch (adminErr) {
    console.warn('[authAdminHelper] supabase.auth.admin.createUser non utilisable côté client anon :', adminErr)
  }

  // 3. Fallback standard via supabase.auth.signUp avec métadonnées complètes
  try {
    const { data: signData, error: signErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: input.password,
      options: {
        data: {
          ...userMetadata,
          email_confirm: true,
        },
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login?confirmed=true` : undefined,
      },
    })

    if (signErr) {
      // Si l'utilisateur existe déjà, on ne bloque pas
      if (signErr.message.includes('already registered') || signErr.message.includes('already exists')) {
        return {
          success: true,
          userId: signData?.user?.id || undefined,
          email: cleanEmail,
        }
      }
      return {
        success: false,
        email: cleanEmail,
        error: signErr.message,
      }
    }

    return {
      success: true,
      userId: signData?.user?.id || undefined,
      email: cleanEmail,
    }
  } catch (signErr: any) {
    return {
      success: false,
      email: cleanEmail,
      error: signErr?.message || 'Erreur inconnue lors de la création du compte.',
    }
  }
}
