// =============================================================================
// GESTIO 229 SaaS — Hook Central useTenant (Isolation Stricte Multi-Secteurs)
// =============================================================================
// RÈGLE ABSOLUE : sectorSlug extrait UNIQUEMENT de l'URL (/app/[sector_slug])
// Validé contre les 19 secteurs officiels et contre les secteurs souscrits.
// =============================================================================

import { useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ALL_SECTORS_CATALOG, SectorDefinition } from '../core/modules/moduleRegistry'
import { isSectorSubscribed } from '../lib/sectorClient'
import { supabaseTenant, TenantQueryClient } from '../lib/supabaseTenant'

export interface TenantContext {
  companyId: string | null
  sectorSlug: string
  isHub: boolean
  isSubscribed: boolean
  isValidSector: boolean
  sectorMeta: SectorDefinition | null
  company: any
  user: any
  isAdmin: boolean
  assignedSectorSlug: string | null
  supabaseTenant: (table: string) => TenantQueryClient
}

/**
 * Hook central obligatoire pour toutes les pages d'exploitation et de gestion des sous-logiciels.
 */
export function useTenant(): TenantContext {
  const location = useLocation()
  const params = useParams<{ sectorSlug?: string }>()
  const { company, user } = useAuthStore()

  const companyId = company?.id ?? null

  // 1. Détecter si on est sur la vue HUB
  const isHub = location.pathname === '/hub' || location.pathname.startsWith('/hub')

  // 2. Extraire sectorSlug UNIQUEMENT depuis l'URL (/app/[sector_slug]/* ou direct /[sector_slug]/*)
  const rawSlug = useMemo(() => {
    if (isHub) return ''
    if (params.sectorSlug) return params.sectorSlug

    const pathname = location.pathname
    // Pattern /app/:sectorSlug
    const appMatch = pathname.match(/^\/app\/([^/]+)/i)
    if (appMatch && appMatch[1]) return appMatch[1]

    // Pattern direct /:sectorSlug
    const directMatch = pathname.match(/^\/([^/]+)/i)
    if (
      directMatch &&
      directMatch[1] &&
      !['hub', 'login', 'connexion', 'register', 'inscription', 'dashboard', 'suspended', 'api'].includes(directMatch[1].toLowerCase())
    ) {
      return directMatch[1]
    }

    return ''
  }, [isHub, params.sectorSlug, location.pathname])

  // Normalisation : toujours en minuscule sans espace et sans préfixe "sec-"
  const sectorSlug = useMemo(() => {
    return rawSlug ? rawSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  }, [rawSlug])

  // 3. Validation contre les 19 secteurs référentiels
  const sectorMeta = useMemo(() => {
    if (!sectorSlug) return null
    return ALL_SECTORS_CATALOG.find((s) => s.slug === sectorSlug) || null
  }, [sectorSlug])

  const isValidSector = Boolean(sectorMeta)

  // 4. Validation contre company_sectors (l'entreprise a-t-elle souscrit à ce secteur ?)
  const isSubscribed = useMemo(() => {
    if (!companyId || !sectorSlug) return false
    return isSectorSubscribed(sectorSlug, company)
  }, [companyId, sectorSlug, company])

  // 5. Droits utilisateurs & Rôles
  const isAdmin = !user || user.role === 'administrateur' || user.role === 'super_admin'

  const assignedSectorSlug = useMemo(() => {
    if (!user) return null
    const perm = (typeof user.permissions === 'object' && user.permissions) ? user.permissions : {}
    const raw = perm.sector_slug || perm.sector_id || user.sector_id || ''
    return raw ? String(raw).toLowerCase().trim().replace(/^sec-/, '') : null
  }, [user])

  // 6. Client Supabase injectant automatiquement (company_id, sector_slug)
  const tenantDbFactory = useMemo(() => {
    return (table: string): TenantQueryClient => {
      return supabaseTenant(table, {
        companyId: companyId || '',
        sectorSlug,
        isHub,
      })
    }
  }, [companyId, sectorSlug, isHub])

  return {
    companyId,
    sectorSlug,
    isHub,
    isSubscribed,
    isValidSector,
    sectorMeta,
    company,
    user,
    isAdmin,
    assignedSectorSlug,
    supabaseTenant: tenantDbFactory,
  }
}

export default useTenant
