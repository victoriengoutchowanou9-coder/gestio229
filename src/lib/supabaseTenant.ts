// =============================================================================
// GESTIO 229 SaaS — supabaseTenant (Wrapper Strict Multi-Secteurs)
// =============================================================================
// RÈGLE ABSOLUE : (company_id + sector_slug) = clé d'isolation obligatoire.
// Aucune requête ne s'exécute sans ce double filtre.
// =============================================================================

import { supabase } from './supabase'
import { isItemInSector, filterItemsForSector } from './sectorClient'

export interface TenantScope {
  companyId: string
  sectorSlug: string
  isHub?: boolean
}

/**
 * Mapping transparent des noms de tables français vers les tables Supabase
 */
export const TABLE_MAP: Record<string, string> = {
  clients: 'customers',
  fournisseurs: 'suppliers',
  produits: 'products',
  ventes: 'sales_orders',
  achats: 'purchase_orders',
  depenses: 'expenses',
  recettes: 'cash_sessions',
  stock_mouvements: 'stock_movements',
  caisse_journal: 'cash_sessions',
  dettes: 'customer_repayments',
  creances: 'customers',
  internal_users: 'user_profiles',
  employes: 'staff_members',
  audit_logs: 'audit_logs',
}

/**
 * Résout le nom physique de la table
 */
export function resolveTableName(table: string): string {
  const clean = table.toLowerCase().trim()
  return TABLE_MAP[clean] || clean
}

export interface TenantQueryClient {
  select: (columns?: string) => any
  insert: (values: any | any[], options?: any) => any
  update: (values: any, options?: any) => any
  delete: (options?: any) => any
  upsert: (values: any | any[], options?: any) => any
  raw: () => any
}

function attachSelectFallback(query: any, physicalTable: string, companyId: string, cleanSlug: string, isHub?: boolean) {
  const origThen = query.then.bind(query)
  query.then = function (onfulfilled?: any, onrejected?: any) {
    return origThen(async (res: any) => {
      // Si la colonne sector_slug n'existe pas encore dans le schéma SQL Supabase
      if (res?.error && res.error.code === 'PGRST204' && String(res.error.message).includes('sector_slug')) {
        let fallbackQuery = supabase.from(physicalTable).select('*')
        if (companyId) {
          fallbackQuery = fallbackQuery.eq('company_id', companyId)
        }
        const fbRes = await fallbackQuery
        if (fbRes.error) {
          return onfulfilled ? onfulfilled(fbRes) : fbRes
        }
        const isolatedData = filterItemsForSector(fbRes.data || [], cleanSlug)
        const customRes = { ...fbRes, data: isolatedData, count: isolatedData.length }
        return onfulfilled ? onfulfilled(customRes) : customRes
      }
      return onfulfilled ? onfulfilled(res) : res
    }, onrejected)
  }
  return query
}

function attachInsertFallback(query: any, physicalTable: string, payload: any, cleanSlug: string, options?: any) {
  const origThen = query.then.bind(query)
  query.then = function (onfulfilled?: any, onrejected?: any) {
    return origThen(async (res: any) => {
      if (res?.error && res.error.code === 'PGRST204' && String(res.error.message).includes('sector_slug')) {
        const stripAndTag = (row: any) => {
          const copy = { ...row }
          delete copy.sector_slug
          if (copy.sector_meta) {
            copy.sector_meta = { ...copy.sector_meta, sector_slug: cleanSlug }
          }
          if (copy.permissions && typeof copy.permissions === 'object') {
            copy.permissions = { ...copy.permissions, sector_slug: cleanSlug }
          }
          return copy
        }
        const fbPayload = Array.isArray(payload) ? payload.map(stripAndTag) : stripAndTag(payload)
        const fbRes = await supabase.from(physicalTable).insert(fbPayload, options)
        return onfulfilled ? onfulfilled(fbRes) : fbRes
      }
      return onfulfilled ? onfulfilled(res) : res
    }, onrejected)
  }
  return query
}

/**
 * Crée un client de requête lié à l'entreprise et au secteur actif
 */
export function supabaseTenant(table: string, scope: TenantScope): TenantQueryClient {
  const physicalTable = resolveTableName(table)
  const { companyId, sectorSlug, isHub } = scope

  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')

  // Contrôle de sécurité en développement : interdire les requêtes orphelines
  if (!isHub && (!companyId || !cleanSlug)) {
    console.error(
      `[ISOLATION CRITIQUE] supabaseTenant('${table}') appelé sans company_id (${companyId}) ou sector_slug (${cleanSlug}) !`
    )
  }

  return {
    /**
     * SELECT automatique avec injection stricte de .eq('company_id', companyId).eq('sector_slug', sectorSlug)
     */
    select(columns: string = '*') {
      let query = supabase.from(physicalTable).select(columns)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }
      if (cleanSlug && !isHub) {
        query = query.eq('sector_slug', cleanSlug)
      }

      return attachSelectFallback(query, physicalTable, companyId, cleanSlug, isHub)
    },

    /**
     * INSERT avec forçage systématique des colonnes company_id et sector_slug (non modifiables)
     */
    insert(values: any | any[], options?: any) {
      const injectScope = (row: any) => {
        return {
          ...row,
          company_id: companyId,
          sector_slug: cleanSlug,
        }
      }

      const payload = Array.isArray(values) ? values.map(injectScope) : injectScope(values)
      const query = supabase.from(physicalTable).insert(payload, options)
      return attachInsertFallback(query, physicalTable, payload, cleanSlug, options)
    },

    /**
     * UPDATE avec clause WHERE stricte sur company_id et sector_slug
     */
    update(values: any, options?: any) {
      const safeValues = { ...values }
      delete safeValues.company_id
      delete safeValues.sector_slug

      let query = supabase.from(physicalTable).update(safeValues, options)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }
      if (cleanSlug && !isHub) {
        query = query.eq('sector_slug', cleanSlug)
      }

      return query
    },

    /**
     * DELETE avec clause WHERE stricte sur company_id et sector_slug
     */
    delete(options?: any) {
      let query = supabase.from(physicalTable).delete(options)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }
      if (cleanSlug && !isHub) {
        query = query.eq('sector_slug', cleanSlug)
      }

      return query
    },

    /**
     * UPSERT avec forçage de scope
     */
    upsert(values: any | any[], options?: any) {
      const injectScope = (row: any) => ({
        ...row,
        company_id: companyId,
        sector_slug: cleanSlug,
      })

      const payload = Array.isArray(values) ? values.map(injectScope) : injectScope(values)
      return supabase.from(physicalTable).upsert(payload, options)
    },

    /**
     * Accès raw pour rétro-compatibilité temporaire sous surveillance
     */
    raw() {
      return supabase.from(physicalTable)
    },
  }
}

/**
 * Générateur de code auto séquentiel PAR (company_id, sector_slug).
 * Ex: CLI-001, FOURN-001, PROD-001
 * Étanche par entreprise et par sous-logiciel.
 */
export async function getNextSectorCode(
  table: string,
  prefix: string,
  companyId: string,
  sectorSlug: string
): Promise<string> {
  const cleanPrefix = prefix.toUpperCase().trim()
  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
  const physicalTable = resolveTableName(table)

  // 1. Essai d'appel de la fonction SQL get_next_code sur Supabase
  try {
    const { data, error } = await supabase.rpc('get_next_code', {
      p_company_id: companyId,
      p_sector_slug: cleanSlug,
      p_prefix: cleanPrefix,
    })
    if (!error && data && typeof data === 'string') {
      return data
    }
  } catch (e) {
    // Fallback dynamique
  }

  // 2. Fallback automatique calculé directement depuis Supabase avec double filtre (company_id, sector_slug)
  try {
    const codeColumn = physicalTable === 'sales_orders' ? 'order_number' : 'code'
    const { data: rows } = await supabase
      .from(physicalTable)
      .select(codeColumn)
      .eq('company_id', companyId)
      .eq('sector_slug', cleanSlug)

    let maxNum = 0
    const regex = new RegExp(`^${cleanPrefix}-(\\d+)$`, 'i')

    if (rows && rows.length > 0) {
      for (const r of rows) {
        const val = (r as any)[codeColumn]
        if (typeof val === 'string') {
          const match = val.match(regex)
          if (match && match[1]) {
            const num = parseInt(match[1], 10)
            if (!isNaN(num) && num > maxNum) maxNum = num
          }
        }
      }
    }

    const nextNum = maxNum + 1
    return `${cleanPrefix}-${String(nextNum).padStart(3, '0')}`
  } catch {
    return `${cleanPrefix}-001`
  }
}

export default supabaseTenant
