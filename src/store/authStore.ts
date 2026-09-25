// =============================================================================
// GESTIO 229 SaaS — Auth Store (Zustand)
// Gère la session utilisateur, le profil et le contexte tenant
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
  | 'idle'        // état initial
  | 'loading'     // chargement en cours
  | 'authenticated' // connecté + tenant chargé
  | 'unauthenticated' // non connecté
  | 'error'       // erreur

interface AuthState {
  status: AuthStatus
  user: UserProfile | null
  company: Company | null
  tenantCtx: TenantContext | null
  errorMessage: string | null

  // Actions
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>
  logout: () => Promise<void>
  refreshTenantContext: () => Promise<void>
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
          const { data: { session } } = await supabase.auth.getSession()

          if (!session?.user) {
            set({ status: 'unauthenticated', user: null, company: null, tenantCtx: null })
            return
          }

          // Charger le contexte tenant complet
          const ctx = await SectorLoader.loadTenantContext(session.user.id)

          if (!ctx) {
            set({ status: 'unauthenticated', user: null, company: null, tenantCtx: null })
            return
          }

          set({
            status: 'authenticated',
            user: ctx.user,
            company: ctx.company,
            tenantCtx: ctx,
            errorMessage: null,
          })
        } catch (err: any) {
          console.error('[AuthStore] Erreur initialisation :', err)
          set({ status: 'error', errorMessage: err.message ?? 'Erreur inconnue' })
        }
      },

      // ─── Connexion ────────────────────────────────────────────────────────

      login: async (email: string, password: string) => {
        set({ status: 'loading', errorMessage: null })
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })

          if (error || !data.user) {
            const msg = error?.message ?? 'Email ou mot de passe incorrect'
            set({ status: 'unauthenticated', errorMessage: msg })
            return { success: false, error: msg }
          }

          // Charger le contexte tenant
          const ctx = await SectorLoader.loadTenantContext(data.user.id)

          if (!ctx) {
            set({
              status: 'error',
              errorMessage: 'Profil entreprise introuvable. Contactez le support.',
            })
            return { success: false, error: 'Profil introuvable' }
          }

          set({
            status: 'authenticated',
            user: ctx.user,
            company: ctx.company,
            tenantCtx: ctx,
            errorMessage: null,
          })

          return { success: true, redirectTo: ctx.routingDecision.redirectTo }
        } catch (err: any) {
          const msg = err.message ?? 'Erreur de connexion'
          set({ status: 'error', errorMessage: msg })
          return { success: false, error: msg }
        }
      },

      // ─── Déconnexion ──────────────────────────────────────────────────────

      logout: async () => {
        await supabase.auth.signOut()
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
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const ctx = await SectorLoader.loadTenantContext(user.id)
        if (ctx) {
          set({ company: ctx.company, user: ctx.user, tenantCtx: ctx })
        }
      },

      // ─── Utilitaires ──────────────────────────────────────────────────────

      clearError: () => set({ errorMessage: null }),
    }),
    {
      name: 'gestio229-auth',
      // Ne persister que ce qui est safe
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
