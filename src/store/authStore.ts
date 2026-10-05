// =============================================================================
// GESTIO 229 SaaS — Auth Store (Zustand)
// Gère la session utilisateur (Administrateur & Utilisateurs Internes),
// le profil, le mot de passe, l'identifiant et le contexte tenant multi-secteurs.
// =============================================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import SectorLoader, { TenantContext } from '../lib/SectorLoader'
import { isSectorSubscribed } from '../lib/sectorClient'
import { normalizeSectorSlug, getRolesForSector } from '../core/team/sectorRoles'
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
      // RÈGLE : L'initialisation NE doit PAS connecter automatiquement l'utilisateur.
      // Même si Supabase a une session active ou que zustand a persisté un user,
      // on affiche TOUJOURS l'écran de connexion et on attend le clic "Se connecter".
      // La connexion ne se fait QUE via login() explicitement appelé par l'utilisateur.

      initialize: async () => {
        set({ status: 'loading' })
        try {
          // 1. Déconnecter immédiatement toute session Supabase Auth active.
          //    Cela empêche la reconnexion automatique via le token JWT mémorisé.
          await supabase.auth.signOut().catch(() => {})
        } catch (_) {}

        // 2. Toujours atterrir sur l'écran de connexion (status unauthenticated).
        //    L'autofill navigateur reste actif côté form, mais NE provoque PAS de connexion.
        set({
          status: 'unauthenticated',
          user: null,
          company: null,
          tenantCtx: null,
          errorMessage: null,
        })
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
            let ctx = await SectorLoader.loadTenantContext(authData.user.id, authData.user.email)

            // ── Résolution et auto-guérison du tenant et de l'entreprise ────────
            if (!ctx) {
              try {
                console.warn('[AuthStore] Contexte tenant non résolu immédiatement, tentative d\'auto-guérison...')

                // Récupérer l'utilisateur Auth complet
                const { data: { user: authFullUser } } = await supabase.auth.getUser()
                const currentAuthUser = authFullUser || authData.user
                const authEmail = (currentAuthUser?.email || emailLower).trim().toLowerCase()
                const meta = currentAuthUser?.user_metadata || {}

                // 1. Chercher le profil par email
                const { data: orphanProfile } = await supabase
                  .from('user_profiles')
                  .select(`id, company_id, auth_user_id, email, role`)
                  .ilike('email', authEmail)
                  .maybeSingle()

                if (orphanProfile) {
                  // Lier le auth_user_id au profil
                  await supabase
                    .from('user_profiles')
                    .update({
                      auth_user_id: currentAuthUser.id,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', orphanProfile.id)
                }

                // 2. Chercher ou créer l'entreprise
                let companyId = orphanProfile?.company_id
                if (!companyId) {
                  const { data: compByEmail } = await supabase
                    .from('companies')
                    .select('*')
                    .ilike('email', authEmail)
                    .maybeSingle()

                  if (compByEmail) {
                    companyId = compByEmail.id
                  } else {
                    const compName = meta.company_name?.trim() || meta.full_name?.trim() || `Entreprise ${authEmail.split('@')[0]}`
                    const sectors = Array.isArray(meta.selected_sectors) && meta.selected_sectors.length > 0
                      ? meta.selected_sectors
                      : ['boutique']
                    const defaultSector = sectors[0] || 'boutique'
                    const now = new Date()
                    const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

                    const { data: newCompany } = await supabase
                      .from('companies')
                      .insert({
                        name: compName,
                        email: authEmail,
                        phone: meta.phone || null,
                        ifu_number: meta.ifu_number || '0000000000000',
                        city: meta.city || 'Cotonou',
                        country: meta.country || 'Bénin',
                        active_sector: defaultSector,
                        selected_sectors: sectors,
                        sectors: sectors,
                        subscription_status: 'trial',
                        subscription_plan: 'multiservices',
                        plan: 'multiservices',
                        onboarding_completed: true,
                        currency: 'FCFA'
                      })
                      .select()
                      .maybeSingle()

                    if (newCompany) {
                      companyId = newCompany.id
                    }
                  }
                }

                // 3. S'assurer que le profil administrateur existe et est lié
                if (companyId) {
                  const defaultAdminPerms = {
                    admin: true, commercial: true, stock: true,
                    treasury: true, purchases: true, reporting: true,
                    accounting: true, hr: true,
                    ventes: { view: true, create: true, edit: true, delete: true },
                    finances: { view: true, caisse: true, tresorerie: true }
                  }

                  await supabase.from('user_profiles').upsert({
                    company_id: companyId,
                    auth_user_id: currentAuthUser.id,
                    email: authEmail,
                    username: authEmail,
                    full_name: meta.responsible_name || meta.full_name || 'Administrateur',
                    role: 'administrateur',
                    is_active: true,
                    permissions: defaultAdminPerms,
                  }, { onConflict: 'email' })
                }

                // 4. Recharger le contexte locataire final
                ctx = await SectorLoader.loadTenantContext(currentAuthUser.id, authEmail)
              } catch (healErr: any) {
                console.error('[AuthStore] Erreur self-healing :', healErr)
              }
            }

            if (!ctx) {
              set({
                status: 'error',
                errorMessage: 'Impossible de charger les données de votre entreprise. Veuillez actualiser la page ou contacter le support.',
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
          // ===================================================================
          // CAS B : UTILISATEURS INTERNES (Identifiant + mot de passe)
          // ===================================================================
          // Recherche du profil par son identifiant unique (username ou email)
          const { data: matchedProfiles, error: profileErr } = await supabase
            .from('user_profiles')
            .select(`*, company:companies(*)`)
            .or(`username.ilike.${rawIdent},email.ilike.${rawIdent}`)

          if (profileErr || !matchedProfiles || matchedProfiles.length === 0) {
            const notFoundMsg = `Identifiant "${rawIdent}" introuvable.`
            set({ status: 'unauthenticated', errorMessage: notFoundMsg })
            return { success: false, error: notFoundMsg }
          }

          // Si plusieurs profils correspondent à cet identifiant, sélectionner par correspondance de mot de passe
          let profile = matchedProfiles.find((p: any) => p.password_hash === rawPassword)
          if (!profile) {
            if (matchedProfiles.length === 1) {
              profile = matchedProfiles[0]
            } else {
              const invMsg = 'Identifiant ou mot de passe incorrect.'
              set({ status: 'unauthenticated', errorMessage: invMsg })
              return { success: false, error: invMsg }
            }
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

          if (!ctx || !ctx.company) {
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

          // 1. Déterminer et valider le secteur assigné à l'utilisateur interne
          const perm = (typeof profile.permissions === 'object' && profile.permissions) ? profile.permissions : {}
          let assignedSector = normalizeSectorSlug(
            perm.sector_slug ||
            perm.sector ||
            perm.assigned_sector ||
            perm.sector_id ||
            profile.sector_id ||
            profile.sector_slug ||
            ''
          )

          if ((!assignedSector || assignedSector === 'boutique') && perm.activity_id) {
            try {
              const { data: act } = await supabase
                .from('company_activities')
                .select('id, activity_name, sector_slug, sector_code')
                .eq('id', perm.activity_id)
                .maybeSingle()

              if (act) {
                assignedSector = normalizeSectorSlug(act.sector_slug || act.sector_code || '')
                localStorage.setItem('gestio229_active_activity_id', act.id)
                localStorage.setItem('gestio229_active_activity_name', act.activity_name)
              }
            } catch (e) {}
          }

          // Si toujours non déterminé, chercher dans le premier secteur souscrit par l'entreprise
          if (!assignedSector) {
            const rawSectors = (ctx.company as any)?.selected_sectors || (ctx.company as any)?.company_sectors || []
            if (Array.isArray(rawSectors) && rawSectors.length > 0) {
              const firstSec = rawSectors[0]
              assignedSector = normalizeSectorSlug(typeof firstSec === 'string' ? firstSec : firstSec?.slug || firstSec?.sector_slug)
            }
          }

          // 2. Vérifier que ce secteur existe dans les souscriptions réelles de l'entreprise
          const isSubscribed = Boolean(assignedSector && isSectorSubscribed(assignedSector, ctx.company))
          if (!isSubscribed) {
            const unsubMsg = `Secteur "${assignedSector}" non souscrit, contactez l'administrateur.`
            await supabase.auth.signOut().catch(() => {})
            set({
              status: 'unauthenticated',
              user: null,
              company: null,
              tenantCtx: null,
              errorMessage: unsubMsg,
            })
            return { success: false, error: unsubMsg }
          }

          // 3. Verrouiller le sous-logiciel dans le client
          localStorage.setItem('gestio229_active_sector', assignedSector)
          if (perm.activity_id) localStorage.setItem('gestio229_active_activity_id', perm.activity_id)
          if (perm.activity_name) localStorage.setItem('gestio229_active_activity_name', perm.activity_name)

          // 4. Redirection intelligente vers le module métier dédié à ce rôle dans ce secteur
          const sectorRoles = getRolesForSector(assignedSector)
          const matchedRole = sectorRoles.find((r) => r.id === profile.role)
          
          let destModule = matchedRole?.defaultRoute || 'tableau-bord'
          if (!matchedRole) {
            if (profile.role === 'caissier' || profile.role === 'vendeur') {
              destModule = assignedSector === 'microfinance' ? 'caisse' : 'vente-pos'
            } else if (profile.role === 'magasinier') {
              destModule = 'stocks'
            } else if (profile.role === 'comptable') {
              destModule = 'syscohada'
            }
          }
          const targetRoute = `/app/${assignedSector}/${destModule}`

          set({
            status: 'authenticated',
            user: ctx.user,
            company: ctx.company,
            tenantCtx: ctx,
            errorMessage: null,
          })

          return { success: true, redirectTo: targetRoute }
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

        try {
          const keysToRemove: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && (
              k.startsWith('gestio229_') ||
              k.startsWith('gestio_') ||
              k === 'gestio229-auth'
            )) {
              if (k !== 'gestio_pwa_installed' && k !== 'gestio_theme') {
                keysToRemove.push(k)
              }
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k))
        } catch (e) {}

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

if (typeof window !== 'undefined') {
  (window as any).__GESTIO_AUTH_STORE__ = useAuthStore
}

