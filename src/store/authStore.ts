// =============================================================================
// GESTIO 229 SaaS — Auth Store (Zustand)
// Gère la session utilisateur (Administrateur & Utilisateurs Internes),
// le profil, le mot de passe, l'identifiant et le contexte tenant multi-secteurs.
// =============================================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import SectorLoader, { TenantContext } from '../lib/SectorLoader'
import type { UserProfile, Company } from '../types/tenant'

// =============================================================================
// TYPES
// =============================================================================

export type AuthStatus =
  | 'idle'          // état initial
  | 'loading'       // chargement en cours
  | 'authenticated' // connecté + tenant chargé
  | 'unauthenticated' // non connecté
  | 'error'         // erreur

interface AuthState {
  status: AuthStatus
  user: UserProfile | null
  company: Company | null
  tenantCtx: TenantContext | null
  errorMessage: string | null

  // Actions
  initialize: () => Promise<void>
  login: (identifier: string, password: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>
  logout: () => Promise<void>
  refreshTenantContext: () => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>
  updateUsername: (newUsername: string) => Promise<{ success: boolean; error?: string }>
  updateProfile: (data: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>
  clearError: () => void
}

// =============================================================================
// STORE
// =============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      user: null,
      company: null,
      tenantCtx: null,
      errorMessage: null,

      // ─── Initialisation au démarrage de l'app ─────────────────────────────

      initialize: async () => {
        set({ status: 'loading' })
        try {
          // 1. Vérifier la session Supabase Auth (compte email / admin)
          const { data: { session } } = await supabase.auth.getSession()

          if (session?.user) {
            const ctx = await SectorLoader.loadTenantContext(session.user.id, session.user.email)
            if (ctx) {
              set({
                status: 'authenticated',
                user: ctx.user,
                company: ctx.company,
                tenantCtx: ctx,
                errorMessage: null,
              })
              return
            }
          }

          // 2. Vérifier si un utilisateur interne était connecté en session persistée
          const currentUser = get().user
          if (currentUser?.id) {
            const ctx = await SectorLoader.loadTenantContext(
              currentUser.auth_user_id || currentUser.id,
              currentUser.email,
              currentUser
            )
            if (ctx) {
              set({
                status: 'authenticated',
                user: ctx.user,
                company: ctx.company,
                tenantCtx: ctx,
                errorMessage: null,
              })
              return
            }
          }

          // Aucune session valide
          set({ status: 'unauthenticated', user: null, company: null, tenantCtx: null })
        } catch (err: any) {
          console.error('[AuthStore] Erreur initialisation :', err)
          set({ status: 'unauthenticated', user: null, company: null, tenantCtx: null })
        }
      },

      // ─── Connexion Unifiée : Administrateur & Utilisateurs Internes ────────

      login: async (identifier: string, password: string) => {
        set({ status: 'loading', errorMessage: null })
        const rawIdent = (identifier || '').trim()
        const rawPassword = password || ''

        if (!rawIdent) {
          const msg = 'Veuillez renseigner votre adresse email ou identifiant.'
          set({ status: 'unauthenticated', errorMessage: msg })
          return { success: false, error: msg }
        }

        if (!rawPassword) {
          const msg = 'Veuillez saisir votre mot de passe.'
          set({ status: 'unauthenticated', errorMessage: msg })
          return { success: false, error: msg }
        }

        try {
          const isEmail = rawIdent.includes('@')

          // ===================================================================
          // CAS A : ADMINISTRATEUR (Connexion par adresse email + mot de passe)
          // ===================================================================
          if (isEmail) {
            const emailLower = rawIdent.toLowerCase()
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
              email: emailLower,
              password: rawPassword,
            })

            if (authError || !authData?.user) {
              const errMsg = authError?.message || ''
              
              if (errMsg.toLowerCase().includes('email not confirmed')) {
                const confMsg = "Votre adresse email n'a pas encore été confirmée. Veuillez cliquer sur le lien reçu dans votre boîte mail pour activer votre compte."
                set({ status: 'unauthenticated', errorMessage: confMsg })
                return { success: false, error: confMsg }
              }

              // Fallback : vérifier si un utilisateur interne possède cet email avec ce mot de passe
              const { data: fallbackUser } = await supabase
                .from('user_profiles')
                .select(`*, company:companies(*)`)
                .ilike('email', emailLower)
                .eq('password_hash', rawPassword)
                .maybeSingle()

              if (fallbackUser && fallbackUser.is_active !== false) {
                const ctx = await SectorLoader.loadTenantContext(
                  fallbackUser.auth_user_id || fallbackUser.id,
                  fallbackUser.email,
                  fallbackUser
                )
                if (ctx) {
                  await supabase
                    .from('user_profiles')
                    .update({ last_login: new Date().toISOString() })
                    .eq('id', fallbackUser.id)

                  set({
                    status: 'authenticated',
                    user: ctx.user,
                    company: ctx.company,
                    tenantCtx: ctx,
                    errorMessage: null,
                  })
                  return { success: true, redirectTo: ctx.routingDecision.redirectTo }
                }
              }

              const invalidMsg = 'Adresse email ou mot de passe incorrect.'
              set({ status: 'unauthenticated', errorMessage: invalidMsg })
              return { success: false, error: invalidMsg }
            }

            // Authentification Supabase réussie : charger le tenant et l'entreprise
            const ctx = await SectorLoader.loadTenantContext(authData.user.id, authData.user.email)

            if (!ctx) {
              set({
                status: 'error',
                errorMessage: 'Profil entreprise introuvable. Veuillez vérifier vos accès.',
              })
              return { success: false, error: 'Profil introuvable' }
            }

            // Mettre à jour last_login
            await supabase
              .from('user_profiles')
              .update({ last_login: new Date().toISOString() })
              .eq('id', ctx.user.id)

            set({
              status: 'authenticated',
              user: ctx.user,
              company: ctx.company,
              tenantCtx: ctx,
              errorMessage: null,
            })

            return { success: true, redirectTo: ctx.routingDecision.redirectTo }
          }

          // ===================================================================
          // CAS B : UTILISATEURS INTERNES (Identifiant + mot de passe)
          // ===================================================================
          // Recherche du profil par son identifiant unique (username)
          const { data: profile, error: profileErr } = await supabase
            .from('user_profiles')
            .select(`*, company:companies(*)`)
            .ilike('username', rawIdent)
            .maybeSingle()

          if (profileErr || !profile) {
            const notFoundMsg = `Identifiant "${rawIdent}" introuvable.`
            set({ status: 'unauthenticated', errorMessage: notFoundMsg })
            return { success: false, error: notFoundMsg }
          }

          // Vérifier si le compte est actif
          if (profile.is_active === false) {
            const deactMsg = "Ce compte utilisateur a été désactivé par l'Administrateur."
            set({ status: 'unauthenticated', errorMessage: deactMsg })
            return { success: false, error: deactMsg }
          }

          // Vérification du mot de passe
          if (profile.password_hash !== rawPassword) {
            const pwdMsg = 'Mot de passe incorrect pour cet identifiant.'
            set({ status: 'unauthenticated', errorMessage: pwdMsg })
            return { success: false, error: pwdMsg }
          }

          // Chargement du contexte tenant complet pour l'utilisateur interne
          const ctx = await SectorLoader.loadTenantContext(
            profile.auth_user_id || profile.id,
            profile.email,
            profile
          )

          if (!ctx) {
            set({
              status: 'error',
              errorMessage: 'Entreprise rattachée introuvable pour ce profil.',
            })
            return { success: false, error: 'Entreprise introuvable' }
          }

          // Mettre à jour last_login
          await supabase
            .from('user_profiles')
            .update({ last_login: new Date().toISOString() })
            .eq('id', profile.id)

          set({
            status: 'authenticated',
            user: ctx.user,
            company: ctx.company,
            tenantCtx: ctx,
            errorMessage: null,
          })

          return { success: true, redirectTo: ctx.routingDecision.redirectTo }
        } catch (err: any) {
          const msg = err.message ?? 'Erreur lors de la connexion'
          set({ status: 'error', errorMessage: msg })
          return { success: false, error: msg }
        }
      },

      // ─── Modification du Mot de Passe ──────────────────────────────────────

      updatePassword: async (newPassword: string) => {
        const currentUser = get().user
        if (!currentUser?.id) {
          return { success: false, error: 'Aucun utilisateur connecté' }
        }

        if (!newPassword || newPassword.length < 4) {
          return { success: false, error: 'Le mot de passe doit comporter au moins 4 caractères' }
        }

        try {
          // Si l'utilisateur est lié à Supabase Auth (admin)
          if (currentUser.auth_user_id) {
            const { error: authErr } = await supabase.auth.updateUser({ password: newPassword })
            if (authErr) {
              console.warn('[AuthStore] Note updateUser Supabase Auth:', authErr.message)
            }
          }

          // Mise à jour dans user_profiles (fonctionne pour Admin et Utilisateurs Internes)
          const { error: dbErr } = await supabase
            .from('user_profiles')
            .update({
              password_hash: newPassword,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id)

          if (dbErr) throw dbErr

          // Mettre à jour l'état local
          set({
            user: {
              ...currentUser,
              password_hash: newPassword
            } as UserProfile
          })

          return { success: true }
        } catch (err: any) {
          return { success: false, error: err.message || 'Erreur lors de la modification du mot de passe' }
        }
      },

      // ─── Modification de l'Identifiant (Username) ──────────────────────────

      updateUsername: async (newUsername: string) => {
        const currentUser = get().user
        if (!currentUser?.id) {
          return { success: false, error: 'Aucun utilisateur connecté' }
        }

        const trimmed = (newUsername || '').trim()
        if (!trimmed || trimmed.length < 3) {
          return { success: false, error: "L'identifiant doit comporter au moins 3 caractères" }
        }

        try {
          // Vérification de l'unicité
          const { data: existing } = await supabase
            .from('user_profiles')
            .select('id')
            .ilike('username', trimmed)
            .neq('id', currentUser.id)
            .maybeSingle()

          if (existing) {
            return { success: false, error: `L'identifiant "${trimmed}" est déjà utilisé.` }
          }

          const { error: updateErr } = await supabase
            .from('user_profiles')
            .update({
              username: trimmed,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id)

          if (updateErr) throw updateErr

          // Mettre à jour l'état local
          set({
            user: {
              ...currentUser,
              username: trimmed
            } as UserProfile
          })

          return { success: true }
        } catch (err: any) {
          return { success: false, error: err.message || "Erreur lors de la modification de l'identifiant" }
        }
      },

      // ─── Mise à jour du Profil ─────────────────────────────────────────────

      updateProfile: async (fields: Partial<UserProfile>) => {
        const currentUser = get().user
        if (!currentUser?.id) return { success: false, error: 'Non connecté' }

        try {
          const { error } = await supabase
            .from('user_profiles')
            .update({
              ...fields,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id)

          if (error) throw error

          set({
            user: {
              ...currentUser,
              ...fields
            } as UserProfile
          })

          return { success: true }
        } catch (err: any) {
          return { success: false, error: err.message }
        }
      },

      // ─── Déconnexion ──────────────────────────────────────────────────────

      logout: async () => {
        try {
          await supabase.auth.signOut()
        } catch (e) {
          // Ignorer si utilisateur interne non Supabase Auth
        }
        set({
          status: 'unauthenticated',
          user: null,
          company: null,
          tenantCtx: null,
          errorMessage: null,
        })
      },

      // ─── Rafraîchissement du contexte ─────────────────────────────────────

      refreshTenantContext: async () => {
        const currentUser = get().user
        if (!currentUser) return

        const ctx = await SectorLoader.loadTenantContext(
          currentUser.auth_user_id || currentUser.id,
          currentUser.email,
          currentUser
        )
        if (ctx) {
          set({ company: ctx.company, user: ctx.user, tenantCtx: ctx })
        }
      },

      clearError: () => set({ errorMessage: null }),
    }),
    {
      name: 'gestio229-auth',
      partialize: (state) => ({
        user: state.user,
        company: state.company,
      }),
    }
  )
)

// ─── Écouter les changements Supabase Auth ──────────────────────────────────

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    useAuthStore.setState({
      status: 'unauthenticated',
      user: null,
      company: null,
      tenantCtx: null,
    })
  }
})
