// =============================================================================
// GESTIO 229 SaaS — SectorLoader : Factory Pattern de chargement dynamique
// =============================================================================
// Responsabilité unique : résoudre les modules actifs pour une entreprise,
// lier l'utilisateur à son profil et son entreprise, et décider la route post-connexion.
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
  ALL_SECTORS_CATALOG,
} from '../core/modules/moduleRegistry'
import type { Company, Sector, UserProfile, RoutingDecision, RoutingType } from '../types/tenant'
import { checkModuleAccess } from '../core/subscription/subscriptionEngine'
import { isSectorSubscribed } from './sectorClient'

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

export const SectorLoader = {

  // ─── Chargement principal ─────────────────────────────────────────────────

  async loadTenantContext(
    authUserId?: string,
    emailHint?: string,
    directProfile?: UserProfile
  ): Promise<TenantContext | null> {
    try {
      let profile: any = directProfile ?? null
      let company: Company | null = (directProfile as any)?.company ?? null

      // 1. Récupération ou liaison du profil utilisateur
      if (!profile && authUserId) {
        // Tentative 1 : par auth_user_id
        const { data: p1 } = await supabase
          .from('user_profiles')
          .select(`*, company:companies(*)`)
          .eq('auth_user_id', authUserId)
          .maybeSingle()

        if (p1) {
          profile = p1
          company = p1.company as Company
        }
      }

      // Tentative 2 : si non trouvé et email fourni
      if (!profile && emailHint) {
        const normalizedEmail = emailHint.trim().toLowerCase()
        const { data: p2 } = await supabase
          .from('user_profiles')
          .select(`*, company:companies(*)`)
          .ilike('email', normalizedEmail)
          .maybeSingle()

        if (p2) {
          profile = p2
          company = p2.company as Company
          // Si authUserId est disponible, on lie le compte
          if (authUserId && (!p2.auth_user_id || p2.auth_user_id !== authUserId)) {
            await supabase
              .from('user_profiles')
              .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
              .eq('id', p2.id)
            profile.auth_user_id = authUserId
          }
        } else {
          // Tentative 3 : Trouver l'entreprise par email et auto-créer le profil administrateur
          const { data: comp } = await supabase
            .from('companies')
            .select('*')
            .ilike('email', normalizedEmail)
            .maybeSingle()

          if (comp) {
            company = comp as Company
            const defaultAdminPermissions = {
              admin: true,
              commercial: true,
              stock: true,
              treasury: true,
              purchases: true,
              reporting: true,
              accounting: true,
              hr: true,
              ventes: { view: true, create: true, edit: true, delete: true },
              finances: { view: true, caisse: true, tresorerie: true }
            }

            const { data: newProfile, error: createErr } = await supabase
              .from('user_profiles')
              .insert({
                company_id: comp.id,
                auth_user_id: authUserId || null,
                full_name: comp.name || 'Administrateur',
                username: normalizedEmail,
                email: normalizedEmail,
                phone: comp.phone || null,
                role: 'administrateur',
                is_active: true,
                permissions: defaultAdminPermissions
              })
              .select(`*, company:companies(*)`)
              .single()

            if (!createErr && newProfile) {
              profile = newProfile
              company = (newProfile.company as Company) || comp
            }
          }
        }
      }

      // Si le profil n'a pas encore l'objet company chargé
      if (profile && !company && profile.company_id) {
        const { data: c } = await supabase
          .from('companies')
          .select('*')
          .eq('id', profile.company_id)
          .maybeSingle()
        if (c) company = c as Company
      }

      // ── Auto-provisioning & Auto-healing résilient si profile ou company est manquant ──
      if (!profile || !company) {
        try {
          const { data: authUserData } = await supabase.auth.getUser()
          const authUser = authUserData?.user

          if (authUser || authUserId) {
            const currentAuthId = authUserId || authUser?.id
            const currentEmail = (authUser?.email || emailHint || '').trim().toLowerCase()
            const meta = authUser?.user_metadata || {}

            // A. Résoudre ou auto-créer l'entreprise
            if (!company && currentEmail) {
              const { data: compByEmail } = await supabase
                .from('companies')
                .select('*')
                .ilike('email', currentEmail)
                .maybeSingle()

              if (compByEmail) {
                company = compByEmail as Company
              } else {
                const compName = meta.company_name?.trim() || meta.full_name?.trim() || (currentEmail ? `Entreprise ${currentEmail.split('@')[0]}` : 'Mon Entreprise')
                const sectors = Array.isArray(meta.selected_sectors) && meta.selected_sectors.length > 0
                  ? meta.selected_sectors
                  : ['boutique']
                const defaultSector = sectors[0] || 'boutique'
                const now = new Date()
                const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

                const { data: newComp } = await supabase
                  .from('companies')
                  .insert({
                    name: compName,
                    email: currentEmail,
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

                if (newComp) company = newComp as Company
              }
            }

            // B. Résoudre ou auto-créer le profil administrateur
            if (company) {
              const defaultAdminPermissions = {
                admin: true,
                commercial: true,
                stock: true,
                treasury: true,
                purchases: true,
                reporting: true,
                accounting: true,
                hr: true,
                ventes: { view: true, create: true, edit: true, delete: true },
                finances: { view: true, caisse: true, tresorerie: true }
              }

              if (profile) {
                const { data: updatedProf } = await supabase
                  .from('user_profiles')
                  .update({
                    company_id: company.id,
                    auth_user_id: currentAuthId,
                    role: profile.role || 'administrateur',
                    is_active: true,
                    permissions: profile.permissions || defaultAdminPermissions,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', profile.id)
                  .select(`*, company:companies(*)`)
                  .maybeSingle()

                if (updatedProf) {
                  profile = updatedProf
                  company = (updatedProf.company as Company) || company
                }
              } else if (currentEmail) {
                const fullName = meta.responsible_name?.trim() || meta.full_name?.trim() || company.name || 'Administrateur'
                const { data: newProf } = await supabase
                  .from('user_profiles')
                  .insert({
                    company_id: company.id,
                    auth_user_id: currentAuthId || null,
                    full_name: fullName,
                    username: currentEmail,
                    email: currentEmail,
                    phone: meta.phone || company.phone || null,
                    role: 'administrateur',
                    is_active: true,
                    permissions: defaultAdminPermissions
                  })
                  .select(`*, company:companies(*)`)
                  .maybeSingle()

                if (newProf) {
                  profile = newProf
                  company = (newProf.company as Company) || company
                }
              }
            }
          }
        } catch (healErr) {
          console.error('[SectorLoader] Erreur lors de l\'auto-provisioning de secours :', healErr)
        }
      }

      // 1.5. Contrôle et expiration automatique de la période d'essai gratuit de 1 mois (30 jours) côté serveur/BDD
      if (company && (company.subscription_status === 'trial' || !company.subscription_status)) {
        const createdAt = company.created_at ? new Date(company.created_at).getTime() : Date.now()
        const trialDurationMs = 30 * 24 * 60 * 60 * 1000
        const isExpired = Date.now() > (createdAt + trialDurationMs)

        if (isExpired) {
          company.subscription_status = 'expired'
          try {
            await supabase
              .from('companies')
              .update({ subscription_status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', company.id)
          } catch (e) {
            console.error('[SectorLoader] Erreur persistance statut expiré :', e)
          }
        }
      }

      const user = profile as UserProfile

      // 2. Charger les secteurs actifs de l'entreprise
      let rawSectors: Sector[] = []

      // A. Essayer depuis company_sectors (si la table existe)
      try {
        const { data: companySectors } = await supabase
          .from('company_sectors')
          .select(`*, sector:sectors(*)`)
          .eq('company_id', company.id)
          .order('activated_at')

        if (companySectors && companySectors.length > 0) {
          rawSectors = companySectors.map((cs: any) => cs.sector as Sector).filter(Boolean)
        }
      } catch (err) {
        // Ignorer si la table company_sectors n'existe pas
      }

      // B. Si aucun secteur trouvé, utiliser les champs de la table companies
      if (rawSectors.length === 0) {
        const rawTargetSlugs: string[] = []
        if (Array.isArray(company.selected_sectors) && company.selected_sectors.length > 0) {
          rawTargetSlugs.push(...company.selected_sectors)
        } else if (Array.isArray(company.sectors) && company.sectors.length > 0) {
          rawTargetSlugs.push(...company.sectors)
        } else if (company.active_sector) {
          rawTargetSlugs.push(company.active_sector)
        }

        // Nettoyage strict des slugs (suppression du préfixe 'sec-')
        const normalizedSlugs = Array.from(
          new Set(
            rawTargetSlugs
              .map((s) => String(s).replace(/^sec-/, '').toLowerCase().trim())
              .filter(Boolean)
          )
        )

        if (normalizedSlugs.length > 0) {
          const { data: matchedSectors } = await supabase
            .from('sectors')
            .select('*')
            .in('slug', normalizedSlugs)

          if (matchedSectors && matchedSectors.length > 0) {
            rawSectors = matchedSectors as Sector[]
          }

          // Pour tout slug souscrit absent de la table 'sectors', le synthétiser depuis le catalogue officiel
          for (const sSlug of normalizedSlugs) {
            if (!rawSectors.some((r) => r.slug === sSlug)) {
              const catMeta = ALL_SECTORS_CATALOG.find((c) => c.slug === sSlug)
              rawSectors.push({
                id: `synth-${sSlug}`,
                name: catMeta?.name || sSlug.charAt(0).toUpperCase() + sSlug.slice(1),
                slug: sSlug,
                description: catMeta?.description || '',
                is_active: true,
                modules: ['ventes', 'caisse', 'stock', 'clients', 'depenses', 'reporting'],
              } as any)
            }
          }
        }
      }

      // C. Fallback : UNIQUEMENT pour administrateur si l'entreprise n'a absolument aucun secteur configuré
      const isUserAdmin = !user || user.role === 'administrateur' || user.role === 'super_admin'
      if (rawSectors.length === 0 && isUserAdmin) {
        const { data: defaultSectors } = await supabase
          .from('sectors')
          .select('*')
          .eq('is_active', true)
          .limit(3)

        rawSectors = (defaultSectors as Sector[]) || []
      }

      // 3. Résoudre les modules pour chaque secteur
      const resolvedSectors: ResolvedSector[] = rawSectors.map((sector) => {
        const modules = resolveModulesForSector(
          sector.slug,
          (sector.modules as string[]) || [],
          (sector.specific_modules as string[]) || []
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

      // 4. Décider la route post-connexion
      const routingDecision = SectorLoader.resolveRoute(company, rawSectors, user)

      return {
        company,
        user,
        sectors: resolvedSectors,
        activeSectorSlug: resolvedSectors[0]?.sector.slug ?? null,
        routingDecision,
      }
    } catch (error) {
      console.error('[SectorLoader] Erreur globale loadTenantContext :', error)
      return null
    }
  },

  // ─── Moteur de routage post-login ─────────────────────────────────────────

  /**
   * Résout la route de redirection après connexion selon l'état du tenant et le rôle.
   * Règle absolue GESTIO 229 :
   * - Compte suspendu → /suspended
   * - Administrateur / Gérant multi-secteurs → /hub
   * - Utilisateur interne non-admin → Redirection STRICTE vers son /app/[sector_slug]/[module]
   *   (Accès au HUB formellement interdit)
   */
  resolveRoute(company: Company, sectors: Sector[], user?: UserProfile): RoutingDecision {
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

    // Cas Administrateur : accès direct et prioritaire au HUB central
    if (!user || user.role === 'administrateur' || user.role === 'super_admin') {
      return {
        type: 'MULTISERVICES' as RoutingType,
        redirectTo: '/hub',
        activeSectors: sectors,
      }
    }

    // ── Cas Utilisateurs Internes (rôle != admin) : Redirection stricte par sous-logiciel ──
    const perm = (typeof user.permissions === 'object' && user.permissions) ? user.permissions : {}
    const userSector = (perm.sector_slug || perm.sector_id || user.sector_id || '').toLowerCase().replace(/^sec-/, '')

    // Vérifier si le secteur de l'utilisateur interne est bien souscrit par l'entreprise
    const isSubscribed = Boolean(userSector && isSectorSubscribed(userSector, company))
    if (!isSubscribed) {
      return {
        type: 'UNAUTHORIZED' as RoutingType,
        redirectTo: '/login?error=sector_unsubscribed',
        activeSectors: [],
      }
    }

    // Déterminer le module de destination selon le métier assigné
    const routePrefix = `/app/${userSector}`
    let destModule = 'tableau-bord'
    if (user.role === 'caissier' || user.role === 'vendeur') {
      destModule = 'vente-pos'
    } else if (user.role === 'magasinier') {
      destModule = 'stocks'
    } else if (user.role === 'comptable') {
      destModule = 'syscohada'
    }

    return {
      type: 'SOLO' as RoutingType,
      redirectTo: `${routePrefix}/${destModule}`,
      activeSectors: sectors.filter((s) => s.slug === userSector),
    }

    // Par défaut pour les autres profils internes autorisés (gérant, responsable, etc.)
    return {
      type: 'SOLO' as RoutingType,
      redirectTo: `${routePrefix}/tableau-bord`,
      activeSectors: sectors,
    }
  },

  // ─── Résolution Nav Globale (avec prise en compte des modules spécifiques par secteur) ─────────────

  getDefaultNav(sectorSlug?: string): { grouped: Record<string, NavItem[]>; flat: NavItem[] } {
    const cleanSlug = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
    const isStation = cleanSlug === 'station-service' || cleanSlug === 'station' || cleanSlug === 'hydrocarbures'
    const isRestaurant = cleanSlug === 'restaurant' || cleanSlug === 'bar-restaurant-maquis' || cleanSlug === 'bar' || cleanSlug === 'maquis' || cleanSlug === 'fastfood'
    const prefix = sectorSlug ? `/app/${sectorSlug}` : '/dashboard'

    // ── Menu spécifique Bar, Restaurant, Maquis & Fast-Food ───────────────────
    if (isRestaurant) {
      const restaurantNav: NavItem[] = [
        // Aperçu
        { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard', href: `${prefix}/tableau-bord`, group: 'apercu' },
        // Exploitation
        { id: 'tables_plan', label: 'Service & Tables', icon: 'UtensilsCrossed', href: `${prefix}/tables`, group: 'commercial' },
        { id: 'ventes', label: 'Commandes & POS', icon: 'ShoppingCart', href: `${prefix}/vente-pos`, group: 'commercial' },
        { id: 'cuisine_bar', label: 'Cuisine & Bar (KDS)', icon: 'ChefHat', href: `${prefix}/cuisine-bar`, group: 'commercial' },
        { id: 'reservations', label: 'Réservations', icon: 'Calendar', href: `${prefix}/reservations`, group: 'commercial' },
        { id: 'recettes', label: 'Fiches & Recettes', icon: 'BookOpen', href: `${prefix}/recettes`, group: 'commercial' },
        { id: 'evenements', label: 'Événements & Soirées', icon: 'Sparkles', href: `${prefix}/evenements`, group: 'commercial' },
        // Stock & Approvisionnements
        { id: 'stock', label: 'Stock Boissons & Matières', icon: 'Package', href: `${prefix}/stocks`, group: 'gestion' },
        { id: 'pertes_gaspillage', label: 'Pertes, Casses & Offerts', icon: 'Trash2', href: `${prefix}/pertes`, group: 'gestion' },
        { id: 'fournisseurs', label: 'Fournisseurs & Achats', icon: 'Truck', href: `${prefix}/fournisseurs`, group: 'gestion' },
        { id: 'rapports', label: 'Rapports & Rentabilité', icon: 'BarChart3', href: `${prefix}/reporting`, group: 'gestion' },
        // Finance
        { id: 'caisse', label: 'Caisse & Clôtures Service', icon: 'Wallet', href: `${prefix}/caisse`, group: 'finance' },
        { id: 'finances', label: 'Trésorerie & Banque', icon: 'Landmark', href: `${prefix}/tresorerie`, group: 'finance' },
        { id: 'clients', label: 'Clients & Ardoises', icon: 'Users', href: `${prefix}/clients`, group: 'finance' },
        { id: 'depenses', label: 'Dépenses Établissement', icon: 'Receipt', href: `${prefix}/depenses`, group: 'finance' },
        { id: 'syscohada', label: 'Comptabilité SYSCOHADA', icon: 'BookOpen', href: `${prefix}/syscohada`, group: 'finance' },
        // Administration
        { id: 'serveurs', label: 'Serveurs & Personnel', icon: 'UserCheck', href: `${prefix}/serveurs`, group: 'admin' },
        { id: 'configuration', label: 'Configuration Restaurant', icon: 'Settings', href: `${prefix}/configuration`, group: 'admin' },
        { id: 'utilisateurs', label: 'Gestion Utilisateurs', icon: 'Users', href: `${prefix}/utilisateurs`, group: 'admin' },
        { id: 'audit', label: "Journal d'Audit", icon: 'Shield', href: `${prefix}/journal-audit`, group: 'admin' },
        { id: 'abonnement', label: 'Mon Abonnement', icon: 'CreditCard', href: `${prefix}/abonnement`, group: 'admin' },
      ]

      const grouped = groupNavItems(restaurantNav)
      return { grouped, flat: restaurantNav }
    }

    // ── Menu spécifique Station-Service & Hydrocarbures ──────────────────────
    if (isStation) {
      const stationNav: NavItem[] = [
        // Aperçu
        { id: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard', href: `${prefix}/tableau-bord`, group: 'apercu' },
        // Exploitation
        { id: 'ventes', label: 'Vente & Distribution', icon: 'ShoppingCart', href: `${prefix}/vente-pos`, group: 'commercial' },
        { id: 'pompes_cuves', label: 'Pompes & Cuves', icon: 'Fuel', href: `${prefix}/pompes`, group: 'commercial' },
        { id: 'postes_pompiste', label: 'Postes Pompistes', icon: 'UserCog', href: `${prefix}/postes`, group: 'commercial' },
        { id: 'lubrifiants', label: 'Lubrifiants & Produits', icon: 'Droplets', href: `${prefix}/lubrifiants`, group: 'commercial' },
        { id: 'flottes_vehicules', label: 'Clients & Flottes', icon: 'Car', href: `${prefix}/flottes`, group: 'commercial' },
        // Stock & Contrôles
        { id: 'stock', label: 'Stocks Carburants', icon: 'Package', href: `${prefix}/stocks`, group: 'gestion' },
        { id: 'fournisseurs', label: 'Fournisseurs & Citernes', icon: 'Truck', href: `${prefix}/fournisseurs`, group: 'gestion' },
        { id: 'anomalies_controles', label: 'Anomalies & Pertes', icon: 'ShieldAlert', href: `${prefix}/anomalies`, group: 'gestion' },
        { id: 'rapports', label: 'Rapports de Clôture', icon: 'BarChart3', href: `${prefix}/reporting`, group: 'gestion' },
        // Finance
        { id: 'caisse', label: 'Caisse & Clôtures', icon: 'Wallet', href: `${prefix}/caisse`, group: 'finance' },
        { id: 'finances', label: 'Trésorerie & Banque', icon: 'Landmark', href: `${prefix}/tresorerie`, group: 'finance' },
        { id: 'clients', label: 'Créances Clients', icon: 'Users', href: `${prefix}/clients`, group: 'finance' },
        { id: 'depenses', label: 'Dépenses Station', icon: 'Receipt', href: `${prefix}/depenses`, group: 'finance' },
        { id: 'syscohada', label: 'Comptabilité SYSCOHADA', icon: 'BookOpen', href: `${prefix}/syscohada`, group: 'finance' },
        // Administration
        { id: 'configuration', label: 'Configuration', icon: 'Settings', href: `${prefix}/configuration`, group: 'admin' },
        { id: 'utilisateurs', label: 'Gestion Utilisateurs', icon: 'Users', href: `${prefix}/utilisateurs`, group: 'admin' },
        { id: 'audit', label: "Journal d'Audit", icon: 'Shield', href: `${prefix}/journal-audit`, group: 'admin' },
        { id: 'abonnement', label: 'Mon Abonnement', icon: 'CreditCard', href: `${prefix}/abonnement`, group: 'admin' },
      ]

      const grouped = groupNavItems(stationNav)
      return { grouped, flat: stationNav }
    }

    // ── Logique par défaut pour tous les autres secteurs (Strictement Inchangée) ──
    const commonModuleIds = [
      'dashboard', 'ventes', 'stock', 'caisse', 'finances', 'clients',
      'fournisseurs', 'depenses', 'rapports', 'syscohada',
      'configuration', 'utilisateurs', 'audit', 'abonnement',
    ]

    // Modules spécifiques par secteur si sectorSlug est renseigné
    const specificModuleIds: string[] = []
    if (sectorSlug) {
      Object.values(MODULE_REGISTRY).forEach((m) => {
        if (!m.isCommon && m.sectorSlugs?.includes(cleanSlug) && !specificModuleIds.includes(m.id)) {
          specificModuleIds.push(m.id)
        }
      })
    }

    const allModuleIds = [...commonModuleIds, ...specificModuleIds]

    const flat: NavItem[] = allModuleIds
      .map((id) => {
        const mod = MODULE_REGISTRY[id]
        if (!mod) return null
        return {
          id: mod.id,
          label: mod.label,
          icon: mod.icon,
          href: `${prefix}/${id === 'dashboard' ? 'tableau-bord' : id === 'ventes' ? 'vente-pos' : id === 'stock' ? 'stocks' : id === 'finances' ? 'tresorerie' : id === 'rapports' ? 'reporting' : id === 'audit' ? 'journal-audit' : mod.path}`,
          group: mod.group,
        } as NavItem
      })
      .filter(Boolean) as NavItem[]

    const grouped = groupNavItems(flat)
    return { grouped, flat }
  },

  // ─── Vérification d'accès par rôle et permissions ────────────────────────

  canAccess(user: UserProfile | null | undefined, moduleId: string, action: string = 'view', company?: Company | null): boolean {
    if (!user) return false

    // Vérification prioritaire de l'abonnement entreprise (Plan Starter vs Entreprise)
    const comp = company || (user as any).company
    if (comp) {
      const planCheck = checkModuleAccess(moduleId, comp)
      if (!planCheck.allowed) return false
    }

    if (user.is_super_admin) return true
    if (user.role === 'administrateur' || user.role === 'admin' || user.role === 'gerant') return true
    if (moduleId === 'dashboard') return true

    // Permissions fines
    const perms = (user.permissions as any) || {}

    // Raccourcis booléens globaux
    if (perms[moduleId] === true) return true
    if (perms[moduleId] === false) return false

    // Raccourcis sous-modules (ex: ventes: { view: true })
    if (typeof perms[moduleId] === 'object' && perms[moduleId] !== null) {
      if (perms[moduleId][action] !== undefined) {
        return !!perms[moduleId][action]
      }
      return !!perms[moduleId].view
    }

    // Permissions spécifiques par rôle pour les modules clés
    if (moduleId === 'ventes' || moduleId === 'caisse' || moduleId === 'consignation') {
      return ['caissier', 'vendeur', 'commercial', 'magasinier', 'gestionnaire', 'gerant'].includes(user.role)
    }
    if (moduleId === 'stock') {
      return ['magasinier', 'gestionnaire', 'gerant'].includes(user.role)
    }
    if (moduleId === 'syscohada' || moduleId === 'finances' || moduleId === 'depenses') {
      return ['comptable', 'gestionnaire', 'gerant'].includes(user.role)
    }
    if (moduleId === 'clients') {
      return ['caissier', 'vendeur', 'commercial', 'comptable', 'gerant'].includes(user.role)
    }
    if (moduleId === 'fournisseurs') {
      return ['magasinier', 'gestionnaire', 'comptable', 'gerant'].includes(user.role)
    }

    return false
  },
}

export default SectorLoader
