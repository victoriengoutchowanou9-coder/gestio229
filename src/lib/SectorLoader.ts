// =============================================================================
// GESTIO 229 SaaS — SectorLoader : Factory Pattern de chargement dynamique
// =============================================================================
// Responsabilité unique : résoudre les modules actifs pour une entreprise
// et décider la route post-connexion.
// =============================================================================

import { supabase } from './supabase'
import {
  MODULE_REGISTRY,
  resolveModulesForSector,
  modulesToNavItems,
  groupNavItems,
  NavItem,
  GROUP_ORDER,
  GROUP_LABELS,
} from '../core/modules/moduleRegistry'
import type { Company, Sector, UserProfile, RoutingDecision, RoutingType } from '../types/tenant'

// =============================================================================
// TYPES INTERNES
// =============================================================================

export interface ResolvedSector {
  sector: Sector
  navItems: NavItem[]
  groupedNav: Record<string, NavItem[]>
  groupOrder: string[]
  groupLabels: Record<string, string>
}

export interface TenantContext {
  company: Company
  user: UserProfile
  sectors: ResolvedSector[]
  activeSectorSlug: string | null
  routingDecision: RoutingDecision
}

// =============================================================================
// FACTORY : SectorLoader
// =============================================================================

/**
 * Charge le contexte complet d'un tenant depuis Supabase.
 * Résout les modules, construit la nav, décide la route post-login.
 *
 * Usage :
 *   const ctx = await SectorLoader.loadTenantContext(userId)
 */
export const SectorLoader = {

  // ─── Chargement principal ─────────────────────────────────────────────────

  async loadTenantContext(authUserId: string): Promise<TenantContext | null> {
    // 1. Récupérer le profil utilisateur + company
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        company:companies(*)
      `)
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (profileError || !profile) {
      console.error('[SectorLoader] Profil introuvable :', profileError)
      return null
    }

    const company = profile.company as Company
    const user = profile as UserProfile

    // 2. Charger les secteurs actifs de l'entreprise
    const { data: companySectors, error: sectorsError } = await supabase
      .from('company_sectors')
      .select(`
        *,
        sector:sectors(*)
      `)
      .eq('company_id', company.id)
      .order('activated_at')

    if (sectorsError) {
      console.error('[SectorLoader] Erreur secteurs :', sectorsError)
    }

    const rawSectors = (companySectors ?? [])
      .map((cs: any) => cs.sector as Sector)
      .filter(Boolean)

    // 3. Résoudre les modules pour chaque secteur
    const resolvedSectors: ResolvedSector[] = rawSectors.map((sector) => {
      const modules = resolveModulesForSector(
        sector.slug,
        sector.modules as string[],
        sector.specific_modules as string[]
      )
      const navItems = modulesToNavItems(sector.slug, modules)
      const groupedNav = groupNavItems(navItems)

      return {
        sector,
        navItems,
        groupedNav,
        groupOrder: GROUP_ORDER,
        groupLabels: GROUP_LABELS,
      }
    })

    // 4. Décider la route
    const routingDecision = SectorLoader.resolveRoute(company, rawSectors)

    return {
      company,
      user,
      sectors: resolvedSectors,
      activeSectorSlug: resolvedSectors[0]?.sector.slug ?? null,
      routingDecision,
    }
  },

  // ─── Moteur de routage post-login ─────────────────────────────────────────

  /**
   * Résout la route de redirection après connexion selon l'état du tenant.
   *
   * Règles :
   * - Suspendu → /suspended
   * - Onboarding incomplet → /dashboard/configuration
   * - 0 secteur configuré → /dashboard/configuration
   * - 1 secteur → /dashboard/vente-pos (dashboard solo)
   * - N secteurs → /hub (hub multi-services)
   */
  resolveRoute(company: Company, sectors: Sector[]): RoutingDecision {
    // Cas : compte suspendu
    if (
      company.subscription_status === 'suspended' ||
      company.subscription_status === 'expired'
    ) {
      return {
        type: 'SUSPENDED' as RoutingType,
        redirectTo: '/suspended',
        activeSectors: [],
      }
    }

    // Cas : onboarding non terminé
    if (!company.onboarding_completed || sectors.length === 0) {
      return {
        type: 'ONBOARDING' as RoutingType,
        redirectTo: '/dashboard/configuration',
        activeSectors: sectors,
      }
    }

    // Cas : un seul secteur → dashboard direct
    if (sectors.length === 1) {
      return {
        type: 'SOLO' as RoutingType,
        redirectTo: '/dashboard/vente-pos',
        activeSectors: sectors,
      }
    }

    // Cas : plusieurs secteurs → hub multiservices
    return {
      type: 'MULTISERVICES' as RoutingType,
      redirectTo: '/hub',
      activeSectors: sectors,
    }
  },

  // ─── Résolution Nav Globale (sans secteur — modules communs) ─────────────

  /**
   * Retourne la nav complète des 14 modules communs pour le dashboard standard.
   * Utilisé quand l'entreprise a un seul secteur (mode SOLO).
   */
  getDefaultNav(): { grouped: Record<string, NavItem[]>; flat: NavItem[] } {
    const commonModuleIds = [
      'ventes', 'stock', 'caisse', 'finances', 'clients',
      'fournisseurs', 'depenses', 'rapports', 'syscohada',
      'configuration', 'audit', 'abonnement',
    ]

    // On mappe les IDs vers des NavItems avec des hrefs /dashboard/...
    const flat: NavItem[] = commonModuleIds
      .map((id) => {
        const mod = MODULE_REGISTRY[id]
        if (!mod) return null
        return {
          id: mod.id,
          label: mod.label,
          icon: mod.icon,
          href: `/dashboard/${id === 'ventes' ? 'vente-pos' : id === 'stock' ? 'stocks' : id === 'finances' ? 'tresorerie' : id === 'rapports' ? 'reporting' : id === 'audit' ? 'journal-audit' : mod.path}`,
          group: mod.group,
        } as NavItem
      })
      .filter(Boolean) as NavItem[]

    const grouped = groupNavItems(flat)
    return { grouped, flat }
  },

  // ─── Vérification accès module ────────────────────────────────────────────

  /**
   * Vérifie si un utilisateur a accès à un module donné.
   * Basé sur les permissions JSONB du profil.
   */
  canAccess(user: UserProfile, moduleId: string, action: string = 'view'): boolean {
    if (user.is_super_admin) return true
    if (user.role === 'administrateur') return true
    const perms = user.permissions as Record<string, Record<string, boolean>>
    return perms?.[moduleId]?.[action] ?? false
  },
}

export default SectorLoader
