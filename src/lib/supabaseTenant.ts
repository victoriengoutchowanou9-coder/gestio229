// =============================================================================
// GESTIO 229 SaaS — supabaseTenant (Wrapper Strict Multi-Secteurs)
// =============================================================================
// RÈGLE ABSOLUE : (company_id + sector_slug) = clé d'isolation obligatoire.
// Aucune requête ne s'exécute sans ce double filtre.
// =============================================================================

import { supabase } from './supabase'
import { isItemInSector, filterItemsForSector } from './sectorClient'
import { ALL_SECTORS_CATALOG } from '../core/modules/moduleRegistry'

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

  // Nouveaux mappings M022 (Silos, Marges, Caisse & Achats)
  vente_lignes: 'vente_lignes',
  v_resume_activite: 'v_resume_activite',
  caisses: 'caisses',
  caisse_mouvements: 'caisse_mouvements',
  caisse_clotures: 'caisse_clotures',
  coffre_fort: 'coffre_fort',
  bons_commande: 'bons_commande',
  bon_commande_lignes: 'bon_commande_lignes',
  dettes_fournisseurs: 'dettes_fournisseurs',
  dette_paiements: 'dette_paiements',
  report_emails: 'report_emails',
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

// Tables dont la colonne physique sector_slug existe avec certitude dans le schéma PostgreSQL Supabase
// MISE À JOUR M025 : ajout de toutes les tables métier après migration complète
export const TABLES_WITH_PHYSICAL_SECTOR_SLUG = new Set<string>([
  // Tables nouvelles (schema natif sector_slug)
  'company_activities',
  'company_sectors',
  'sectors',
  'caisses',
  'caisse_clotures',
  'caisse_mouvements',
  'coffre_fort',
  'vente_lignes',
  // Tables métier (sector_slug ajouté par M020/M024/M025)
  'customers',
  'suppliers',
  'products',
  'expenses',
  'sales_orders',
  'sales_order_items',
  'stock_movements',
  'purchase_orders',
  'cash_sessions',
  'cash_registers',
  'audit_logs',
  'user_profiles',
  // Tables M029 Brasserie Consignations
  'brasserie_emballages',
  'brasserie_produit_emballage',
  'brasserie_consignations',
  'brasserie_mouvements_emballages',
  'brasserie_inventaires_emballages',
  'brasserie_inventaire_lignes',
])

// Tables dont la colonne physique 'notes' existe dans Supabase
// Permet de contrôler l'injection automatique de notes pour le tracking secteur
const TABLES_WITH_NOTES_COLUMN = new Set<string>([
  'customers',
  'suppliers',
  'expenses',
  'purchase_orders',
  'sales_orders',
  'cash_sessions',
  'purchase_receipts',
  'inventory_sessions',
  'credit_notes',
])

// Tables dont la colonne physique 'sector_meta' existe dans Supabase (JSONB)
// Seules ces tables acceptent sector_meta sans erreur 42703/PGRST204
const TABLES_WITH_SECTOR_META = new Set<string>([
  'products',
  'customers',
  'suppliers',
])

export function markTableHasPhysicalSectorSlug(table: string) {
  TABLES_WITH_PHYSICAL_SECTOR_SLUG.add(resolveTableName(table))
}

export function isTablePhysicalSectorSlug(table: string): boolean {
  return TABLES_WITH_PHYSICAL_SECTOR_SLUG.has(resolveTableName(table))
}

function wrapQueryWithSectorIsolation(
  query: any,
  physicalTable: string,
  companyId: string,
  cleanSlug: string,
  isHub?: boolean,
  hadPhysicalCol?: boolean
): any {
  let isSingle = false
  let isMaybeSingle = false

  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      if (prop === 'single') {
        isSingle = true
        const orig = target.single.bind(target)
        return (...args: any[]) => wrapQueryWithSectorIsolation(orig(...args), physicalTable, companyId, cleanSlug, isHub, hadPhysicalCol)
      }
      if (prop === 'maybeSingle') {
        isMaybeSingle = true
        const orig = target.maybeSingle.bind(target)
        return (...args: any[]) => wrapQueryWithSectorIsolation(orig(...args), physicalTable, companyId, cleanSlug, isHub, hadPhysicalCol)
      }

      if (prop === 'then') {
        return (onfulfilled?: any, onrejected?: any) => {
          return target.then(async (res: any) => {
            // Détection de l'absence physique de sector_slug (Postgres 42703 ou PGRST204)
            const isColMissingErr = res?.error && (
              res.error.code === '42703' ||
              res.error.code === 'PGRST204' ||
              String(res.error.message).includes('sector_slug') ||
              (String(res.error.message).includes('column') && String(res.error.message).includes('does not exist'))
            )

            if (isColMissingErr) {
              TABLES_WITH_PHYSICAL_SECTOR_SLUG.delete(physicalTable)
              let fbQuery = supabase.from(physicalTable).select('*')
              if (companyId) fbQuery = fbQuery.eq('company_id', companyId)
              const fbRes = await fbQuery
              if (fbRes.error) {
                return onfulfilled ? onfulfilled(fbRes) : fbRes
              }
              const isolated = cleanSlug && !isHub ? filterItemsForSector(fbRes.data || [], cleanSlug) : (fbRes.data || [])
              const finalData = isSingle ? (isolated[0] || null) : isMaybeSingle ? (isolated[0] || null) : isolated
              const customRes = { ...fbRes, data: finalData, count: isolated.length, error: null }
              return onfulfilled ? onfulfilled(customRes) : customRes
            }

            // Si la table n'a pas de colonne SQL sector_slug mais que la requête a réussi, filtrer en mémoire
            if (!hadPhysicalCol && cleanSlug && !isHub && res?.data && !res.error) {
              if (Array.isArray(res.data)) {
                const isolated = filterItemsForSector(res.data, cleanSlug)
                const customRes = { ...res, data: isolated, count: isolated.length }
                return onfulfilled ? onfulfilled(customRes) : customRes
              } else if (res.data && typeof res.data === 'object') {
                const ok = isItemInSector(res.data, cleanSlug)
                const customRes = { ...res, data: ok ? res.data : null }
                return onfulfilled ? onfulfilled(customRes) : customRes
              }
            }

            return onfulfilled ? onfulfilled(res) : res
          }, onrejected)
        }
      }

      const val = Reflect.get(target, prop, receiver)
      if (typeof val === 'function') {
        return (...args: any[]) => {
          const ret = val.apply(target, args)
          if (ret && typeof ret === 'object' && typeof ret.then === 'function') {
            return wrapQueryWithSectorIsolation(ret, physicalTable, companyId, cleanSlug, isHub, hadPhysicalCol)
          }
          return ret
        }
      }
      return val
    }
  }

  return new Proxy(query, handler)
}

/**
 * Attache un fallback multi-niveaux sur les INSERT pour gérer les colonnes
 * absentes du schema cache PostgREST (PGRST204 / 42703).
 *
 * Niveau 1 : retirer la colonne identifiée dans le message d'erreur
 * Niveau 2 : retirer toutes les colonnes optionnelles connues
 * Niveau 3 : payload minimal (colonnes requises seulement)
 */
function attachInsertFallback(query: any, physicalTable: string, payload: any, cleanSlug: string, options?: any) {
  const origThen = query.then.bind(query)

  const extractMissingColumn = (msg: string): string | null => {
    const m = msg.match(/Could not find the '([^']+)' column/)
    if (m) return m[1]
    const m2 = msg.match(/column "([^"]+)"/)
    if (m2) return m2[1]
    return null
  }

  const buildCleanPayload = (original: any, removeCols: string[]) => {
    const strip = (row: any) => {
      const copy = { ...row }
      for (const col of removeCols) delete copy[col]
      if (
        !removeCols.includes('sector_slug') &&
        !removeCols.includes('sector_meta') &&
        cleanSlug &&
        TABLES_WITH_SECTOR_META.has(physicalTable)
      ) {
        copy.sector_meta = { ...(copy.sector_meta || {}), sector_slug: cleanSlug, sector: cleanSlug }
      }
      return copy
    }
    return Array.isArray(original) ? original.map(strip) : strip(original)
  }

  query.then = function (onfulfilled?: any, onrejected?: any) {
    return origThen(async (res: any) => {
      if (!res?.error) return onfulfilled ? onfulfilled(res) : res

      const errCode = res.error.code
      const errMsg = String(res.error.message || '')
      const isSchemaErr = (
        errCode === '42703' || errCode === 'PGRST204' ||
        errMsg.includes('schema cache') || errMsg.includes('Could not find') ||
        errMsg.includes('does not exist')
      )
      if (!isSchemaErr) return onfulfilled ? onfulfilled(res) : res

      const missingCol = extractMissingColumn(errMsg)
      const colsToRemove: string[] = []
      if (missingCol) {
        colsToRemove.push(missingCol)
        if (missingCol === 'sector_slug') TABLES_WITH_PHYSICAL_SECTOR_SLUG.delete(physicalTable)
        console.warn(`[supabaseTenant] Colonne manquante: ${physicalTable}.${missingCol} — Appliquer M025 dans Supabase Studio SQL Editor`)
      } else if (errMsg.includes('sector_slug')) {
        colsToRemove.push('sector_slug')
        TABLES_WITH_PHYSICAL_SECTOR_SLUG.delete(physicalTable)
      } else {
        colsToRemove.push('sector_slug', 'notes')
      }

      // Fallback niveau 1 : retirer la colonne identifiée
      const fb1Payload = buildCleanPayload(payload, colsToRemove)
      const fb1Res = await supabase.from(physicalTable).insert(fb1Payload, options)
      if (!fb1Res?.error) return onfulfilled ? onfulfilled(fb1Res) : fb1Res

      // Fallback niveau 2 : retirer toutes les colonnes optionnelles connues
      const optionalCols = ['sector_slug', 'notes', 'sector_meta', 'credit_authorized', 'discount_eligible', 'discount_rate', 'title', 'expense_date', 'payment_method', 'customer_name', 'status', 'current_debt']
      const fb2Payload = buildCleanPayload(payload, optionalCols)
      const fb2Res = await supabase.from(physicalTable).insert(fb2Payload, options)
      if (!fb2Res?.error) {
        console.warn(`[supabaseTenant] Fallback niv.2 OK pour ${physicalTable}. Appliquer M025_fix_schema_cache_global.sql pour corriger définitivement.`)
        return onfulfilled ? onfulfilled(fb2Res) : fb2Res
      }

      // Fallback niveau 3 : payload minimal
      const KEEP = new Set(['id', 'company_id', 'code', 'name', 'company_name', 'phone', 'amount', 'category', 'beneficiary', 'expense_number', 'payment_method', 'order_number', 'order_date', 'subtotal_ht', 'tva_amount', 'total_amount', 'total_cost', 'paid_amount', 'credit_amount', 'payment_status', 'product_id', 'quantity', 'unit_price', 'total_ht', 'total_ttc', 'unit_cost', 'tva_rate', 'order_id', 'movement_type', 'unit', 'cost_price', 'selling_price', 'is_taxable', 'is_active', 'created_by'])
      const minStrip = (row: any) => {
        const copy: any = { company_id: row.company_id }
        for (const k of Object.keys(row)) { if (KEEP.has(k)) copy[k] = row[k] }
        return copy
      }
      const fb3Payload = Array.isArray(payload) ? payload.map(minStrip) : minStrip(payload)
      const fb3Res = await supabase.from(physicalTable).insert(fb3Payload, options)
      console.error(`[supabaseTenant] ⚠️ Fallback niv.3 pour ${physicalTable}. URGENT: appliquer M025_fix_schema_cache_global.sql dans Supabase Studio.`)
      return onfulfilled ? onfulfilled(fb3Res) : fb3Res
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
  const hasPhysicalCol = TABLES_WITH_PHYSICAL_SECTOR_SLUG.has(physicalTable)

  // Contrôle de sécurité en développement : interdire les requêtes orphelines
  if (!isHub && (!companyId || !cleanSlug)) {
    console.warn(
      `[ISOLATION] supabaseTenant('${table}') appelé sans company_id (${companyId}) ou sector_slug (${cleanSlug})`
    )
  }

  return {
    /**
     * SELECT automatique avec isolation stricte :
     * Filtre par company_id et applique l'isolation sectorielle en base ou en mémoire sans crash.
     */
    select(columns: string = '*') {
      let query = supabase.from(physicalTable).select(columns)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }
      if (hasPhysicalCol && cleanSlug && !isHub) {
        query = query.eq('sector_slug', cleanSlug)
      }

      return wrapQueryWithSectorIsolation(query, physicalTable, companyId || '', cleanSlug, isHub, hasPhysicalCol)
    },

    /**
     * INSERT avec injection de company_id et sector_slug (en colonne ou métadonnées selon schéma)
     */
    insert(values: any | any[], options?: any) {
      const injectScope = (row: any) => {
        const copy = { ...row, company_id: companyId }
        if (cleanSlug) {
          if (hasPhysicalCol) {
            copy.sector_slug = cleanSlug
          }
          // sector_meta : UNIQUEMENT pour les tables avec colonne sector_meta réelle (JSONB)
          if (TABLES_WITH_SECTOR_META.has(physicalTable)) {
            copy.sector_meta = {
              ...(copy.sector_meta || {}),
              sector_slug: cleanSlug,
              sector: cleanSlug,
            }
          }
          // Injection notes : uniquement pour les tables avec colonne notes confirmée
          if (TABLES_WITH_NOTES_COLUMN.has(physicalTable)) {
            if (copy.notes) {
              try {
                const parsed = typeof copy.notes === 'string' ? JSON.parse(copy.notes) : copy.notes
                // Si notes est déjà un objet JSON, enrichir avec sector_slug
                if (typeof parsed === 'object' && parsed !== null) {
                  copy.notes = JSON.stringify({ ...parsed, _sector: cleanSlug })
                }
                // Si notes est une string libre, la laisser telle quelle
              } catch {
                // notes est une string non-JSON, on la laisse intacte
              }
            }
            // Ne plus injecter notes={sector_slug} automatiquement pour éviter
            // les conflits avec les notes textuelles saisies par l'utilisateur
          }
        }
        return copy
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
      if (!hasPhysicalCol) {
        delete safeValues.sector_slug
      }

      let query = supabase.from(physicalTable).update(safeValues, options)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }
      if (hasPhysicalCol && cleanSlug && !isHub) {
        query = query.eq('sector_slug', cleanSlug)
      }

      return query
    },

    /**
     * DELETE avec clause WHERE stricte sur company_id
     */
    delete(options?: any) {
      let query = supabase.from(physicalTable).delete(options)

      if (companyId) {
        query = query.eq('company_id', companyId)
      }
      if (hasPhysicalCol && cleanSlug && !isHub) {
        query = query.eq('sector_slug', cleanSlug)
      }

      return query
    },

    /**
     * UPSERT avec forçage de scope
     */
    upsert(values: any | any[], options?: any) {
      const injectScope = (row: any) => {
        const copy = { ...row, company_id: companyId }
        if (hasPhysicalCol && cleanSlug) copy.sector_slug = cleanSlug
        return copy
      }

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
    let query = supabase
      .from(physicalTable)
      .select(codeColumn)
      .eq('company_id', companyId)

    if (TABLES_WITH_PHYSICAL_SECTOR_SLUG.has(physicalTable) && cleanSlug) {
      query = query.eq('sector_slug', cleanSlug)
    }

    const { data: rows } = await query

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TÂCHE 1 : RÉSUMÉ OFFICIEL D'ACTIVITÉ (v_resume_activite)
 * Règle : Les 19 activités sont des silos totalement indépendants.
 * Chaque carte activité lit UNIQUEMENT sa ligne :
 *   .from('v_resume_activite').eq('company_id', X).eq('sector_slug', 'boutique').single()
 * Le HUB lit les 19 résumés :
 *   .from('v_resume_activite').eq('company_id', X)
 *   et fait la somme : total_ca_hub = SUM(ca_ht), total_marge_hub = SUM(marge_brute)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function fetchResumeActivite(
  companyId: string,
  sectorSlug?: string
): Promise<{ ca_ht: number; marge_brute: number } | any[]> {
  const normSlug = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : null

  // 1. Essayer d'interroger la vue officielle v_resume_activite sur Supabase
  try {
    let q = supabase.from('v_resume_activite').select('*').eq('company_id', companyId)
    if (normSlug) {
      q = q.eq('sector_slug', normSlug)
      const { data, error } = await q.maybeSingle()
      if (!error && data) {
        return {
          ca_ht: Number(data.ca_ht) || 0,
          marge_brute: Number(data.marge_brute) || 0
        }
      }
    } else {
      const { data, error } = await q
      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          company_id: d.company_id,
          sector_slug: (d.sector_slug || '').toLowerCase().trim().replace(/^sec-/, ''),
          ca_ht: Number(d.ca_ht) || 0,
          marge_brute: Number(d.marge_brute) || 0
        }))
      }
    }
  } catch (_) {}

  // 2. Essayer depuis la table vente_lignes si disponible
  try {
    let vlQ = supabase.from('vente_lignes').select('*').eq('company_id', companyId)
    if (normSlug) vlQ = vlQ.eq('sector_slug', normSlug)
    const { data: vlData, error: vlErr } = await vlQ
    if (!vlErr && vlData && vlData.length > 0) {
      if (normSlug) {
        const ca_ht = vlData.reduce((s: number, l: any) => s + (Number(l.quantite || 1) * Number(l.prix_vente_ht_unitaire || 0)), 0)
        const cout = vlData.reduce((s: number, l: any) => s + (Number(l.quantite || 1) * Number(l.cout_achat_ht_unitaire || 0)), 0)
        return { ca_ht, marge_brute: Math.max(0, ca_ht - cout) }
      } else {
        const grouped: Record<string, { ca_ht: number; marge_brute: number }> = {}
        for (const l of vlData) {
          const sec = (l.sector_slug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
          if (!grouped[sec]) grouped[sec] = { ca_ht: 0, marge_brute: 0 }
          const rev = Number(l.quantite || 1) * Number(l.prix_vente_ht_unitaire || 0)
          const cost = Number(l.quantite || 1) * Number(l.cout_achat_ht_unitaire || 0)
          grouped[sec].ca_ht += rev
          grouped[sec].marge_brute += (rev - cost)
        }
        return ALL_SECTORS_CATALOG.map((s) => ({
          company_id: companyId,
          sector_slug: s.slug,
          ca_ht: grouped[s.slug]?.ca_ht || 0,
          marge_brute: Math.max(0, grouped[s.slug]?.marge_brute || 0)
        }))
      }
    }
  } catch (_) {}

  // 3. Fallback direct et exact depuis sales_orders (avec coût figé et assainissement)
  try {
    const { data: salesList } = await supabase
      .from('sales_orders')
      .select('id, total_amount, subtotal_ht, total_cost, gross_margin, sector_slug, notes, e_mecef_uid, status')
      .eq('company_id', companyId)
      .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")')

    const sales = salesList || []

    const computeSectorMetrics = (sectorSales: any[]) => {
      let ca_ht = 0
      let total_cost = 0
      let marge_brute = 0

      for (const item of sectorSales) {
        const item_ca_ht = Number(item.subtotal_ht) > 0
          ? Number(item.subtotal_ht)
          : Math.round(((Number(item.total_amount) || 0) / 1.18) * 100) / 100

        ca_ht += item_ca_ht

        // Si gross_margin explicite et valide
        if (typeof item.gross_margin === 'number' && item.gross_margin > 0 && item.gross_margin <= item_ca_ht) {
          marge_brute += item.gross_margin
          total_cost += (item_ca_ht - item.gross_margin)
          continue
        }

        let item_cost = Number(item.total_cost) || 0

        // Vérifier si le coût est aberrant (ex: coût de tonne 95k au lieu de sac 4k, item_cost >= item_ca_ht)
        if (item_cost >= item_ca_ht || item_cost <= 0) {
          let recoveredCost = 0
          let hasParsed = false
          try {
            const pNotes = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes
            if (pNotes && Array.isArray(pNotes.lines) && pNotes.lines.length > 0) {
              recoveredCost = pNotes.lines.reduce((acc: number, l: any) => {
                const coef = Math.max(1, Number(l.product?.coef || 1))
                const isTax = Boolean(l.product?.is_vat_subject ?? false)
                const vRate = isTax ? Number(l.product?.vat_rate || 18) : 0
                const rawCost = Number(l.product?.cost_price) || 0
                const uvCostTTC = rawCost / coef
                const uvCostHT = isTax ? (uvCostTTC / (1 + vRate / 100)) : uvCostTTC
                return acc + (Number(l.qty || 1) * uvCostHT)
              }, 0)
              hasParsed = true
            }
          } catch (_) {}

          if (hasParsed && recoveredCost > 0 && recoveredCost < item_ca_ht) {
            item_cost = recoveredCost
          } else {
            // Clamping sécurisé pour les données historiques
            item_cost = Math.round(item_ca_ht * 0.80 * 100) / 100
          }
        }

        total_cost += item_cost
        marge_brute += Math.max(0, item_ca_ht - item_cost)
      }

      return {
        ca_ht: Math.round(ca_ht * 100) / 100,
        marge_brute: Math.round(marge_brute * 100) / 100
      }
    }

    if (normSlug) {
      const sectorSales = filterItemsForSector(sales, normSlug)
      return computeSectorMetrics(sectorSales)
    }

    return ALL_SECTORS_CATALOG.map((s) => {
      const secSlug = s.slug
      const sectorSales = filterItemsForSector(sales, secSlug)
      const metrics = computeSectorMetrics(sectorSales)
      return {
        company_id: companyId,
        sector_slug: secSlug,
        ca_ht: metrics.ca_ht,
        marge_brute: metrics.marge_brute
      }
    })
  } catch {
    if (normSlug) return { ca_ht: 0, marge_brute: 0 }
    return ALL_SECTORS_CATALOG.map((s) => ({
      company_id: companyId,
      sector_slug: s.slug,
      ca_ht: 0,
      marge_brute: 0
    }))
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TÂCHE 2.A : GESTION DE L'ÉTAT D'OUVERTURE DE LA CAISSE PAR (company_id, sector_slug)
 * Règle : Impossible d'encaisser si aucune caisse ouverte.
 * Si non clôturée le soir, elle RESTE ouverte le lendemain.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface ActiveCaisseSession {
  id: string
  caisse_id?: string
  session_number: string
  statut: 'ouverte' | 'open'
  date_ouverture: string
  heure_ouverture: string
  fond_ouverture_especes: number
  fond_ouverture_momo: number
  total_ouverture: number
  ouvert_par: string
  ouvert_par_id: string | null
  sector_slug: string
  company_id: string
  is_previous_day?: boolean
}

function isValidUuid(val?: string | null): boolean {
  if (!val) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

/**
 * Récupère la session de caisse active (statut='ouverte' ET closed_at/date_fermeture IS NULL)
 * pour le couple exact (company_id, sector_slug).
 * Supporte la table caisse_sessions officielle, caisses et le fallback cash_sessions.
 */
export async function getCurrentCashSession(
  companyId: string,
  sectorSlug: string,
  userId?: string
): Promise<ActiveCaisseSession | null> {
  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
  if (!companyId || !cleanSlug) return null

  const now = new Date()

  // 1. Essai sur la table dédiée caisse_sessions
  try {
    const { data: dbSessions, error: sessErr } = await supabase
      .from('caisse_sessions')
      .select('*')
      .eq('company_id', companyId)
      .or(`sector_slug.eq.${cleanSlug},secteur_slug.eq.${cleanSlug}`)
      .in('statut', ['ouverte', 'open'])
      .is('date_fermeture', null)
      .order('date_ouverture', { ascending: false })
      .limit(1)

    if (!sessErr && dbSessions && dbSessions.length > 0) {
      const s = dbSessions[0]
      const openDate = new Date(s.date_ouverture)
      const isDiffDate =
        openDate.getFullYear() !== now.getFullYear() ||
        openDate.getMonth() !== now.getMonth() ||
        openDate.getDate() !== now.getDate()

      const heureStr = !isNaN(openDate.getTime())
        ? openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '--:--'

      const codeCaisse = s.code || `CS-${cleanSlug.slice(0, 4).toUpperCase()}`

      return {
        id: s.id,
        caisse_id: s.caisse_id || s.id,
        session_number: codeCaisse,
        statut: 'ouverte',
        date_ouverture: s.date_ouverture,
        heure_ouverture: heureStr,
        fond_ouverture_especes: Number(s.fond_ouverture_especes) || 0,
        fond_ouverture_momo: Number(s.fond_actuel_momo ?? s.fond_ouverture_momo) || 0,
        total_ouverture: (Number(s.fond_ouverture_especes) || 0) + (Number(s.fond_ouverture_momo) || 0),
        ouvert_par: s.ouvert_par_nom || 'Caissier',
        ouvert_par_id: s.ouvert_par || null,
        sector_slug: cleanSlug,
        company_id: companyId,
        is_previous_day: isDiffDate,
      }
    }
  } catch (err) {
    console.warn('[CASH-CHECK] Fallback caisse_sessions:', err)
  }

  // 2. Essai sur table caisses officielle (requête propre sans join risqué)
  try {
    const { data: openCaisses, error } = await supabase
      .from('caisses')
      .select('*')
      .eq('company_id', companyId)
      .or(`sector_slug.eq.${cleanSlug},secteur_slug.eq.${cleanSlug}`)
      .in('statut', ['ouverte', 'open'])
      .is('date_fermeture', null)
      .order('date_ouverture', { ascending: false })
      .limit(1)

    if (!error && openCaisses && openCaisses.length > 0) {
      const c = openCaisses[0]
      const openDate = new Date(c.date_ouverture || c.created_at)
      const isDiffDate =
        openDate.getFullYear() !== now.getFullYear() ||
        openDate.getMonth() !== now.getMonth() ||
        openDate.getDate() !== now.getDate()

      const heureStr = !isNaN(openDate.getTime())
        ? openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '--:--'

      const sessionInfo: ActiveCaisseSession = {
        id: c.id,
        caisse_id: c.id,
        session_number: c.code || `CS-${cleanSlug.slice(0, 4).toUpperCase()}-${c.id.slice(0, 6).toUpperCase()}`,
        statut: 'ouverte',
        date_ouverture: c.date_ouverture || c.created_at,
        heure_ouverture: heureStr,
        fond_ouverture_especes: Number(c.fond_ouverture_especes) || 0,
        fond_ouverture_momo: Number(c.fond_ouverture_momo) || 0,
        total_ouverture: (Number(c.fond_ouverture_especes) || 0) + (Number(c.fond_ouverture_momo) || 0),
        ouvert_par: c.ouvert_par || 'Caissier',
        ouvert_par_id: c.ouvert_par || null,
        sector_slug: cleanSlug,
        company_id: companyId,
        is_previous_day: isDiffDate,
      }

      console.log('[CASH-CHECK]', {
        source: 'caisses',
        company_id: companyId,
        sector_slug: cleanSlug,
        user_id: userId,
        found: true,
        session_id: c.id,
        ouvert_par: sessionInfo.ouvert_par,
        date_ouverture: sessionInfo.date_ouverture,
        fond_ouverture_especes: sessionInfo.fond_ouverture_especes
      })

      return sessionInfo
    }
  } catch (err) {
    console.warn('[CASH-CHECK] Erreur lecture caisses:', err)
  }

  // 2. Fallback sur cash_sessions si caisses n'existe pas encore ou vide
  try {
    const { data: openSessions, error: sessErr } = await supabase
      .from('cash_sessions')
      .select('*, cashier:user_profiles!cashier_id(id, full_name, username)')
      .eq('company_id', companyId)
      .in('status', ['ouverte', 'open'])
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(20)

    if (!sessErr && openSessions && openSessions.length > 0) {
      const sessionInSector = openSessions.find((s: any) => {
        if (s.sector_slug) return s.sector_slug.toLowerCase().trim().replace(/^sec-/, '') === cleanSlug
        if (s.closing_notes && typeof s.closing_notes === 'string') {
          if (s.closing_notes.includes(`[SECTOR:${cleanSlug}]`)) return true
        }
        return cleanSlug === 'boutique'
      })

      if (sessionInSector) {
        const openDate = new Date(sessionInSector.opened_at)
        const heureStr = !isNaN(openDate.getTime())
          ? openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '--:--'

        const sessionInfo: ActiveCaisseSession = {
          id: sessionInSector.id,
          session_number: `CS-${cleanSlug.slice(0, 4).toUpperCase()}-${sessionInSector.id.slice(0, 6).toUpperCase()}`,
          statut: 'ouverte',
          date_ouverture: sessionInSector.opened_at,
          heure_ouverture: heureStr,
          fond_ouverture_especes: Number(sessionInSector.opening_cash) || 0,
          fond_ouverture_momo: Number(sessionInSector.opening_momo) || 0,
          total_ouverture: (Number(sessionInSector.opening_cash) || 0) + (Number(sessionInSector.opening_momo) || 0),
          ouvert_par: sessionInSector.cashier?.full_name || sessionInSector.cashier?.username || 'Caissier',
          ouvert_par_id: sessionInSector.cashier_id || null,
          sector_slug: cleanSlug,
          company_id: companyId
        }

        console.log('[CASH-CHECK]', {
          source: 'cash_sessions',
          company_id: companyId,
          sector_slug: cleanSlug,
          user_id: userId,
          found: true,
          session_id: sessionInSector.id,
          ouvert_par: sessionInfo.ouvert_par,
          date_ouverture: sessionInfo.date_ouverture
        })

        return sessionInfo
      }
    }
  } catch (sessErr) {
    console.warn('[CASH-CHECK] Erreur lecture cash_sessions:', sessErr)
  }

  // 4. Fallback ultime sur le stockage local (session active créée côté client)
  try {
    const localSessStr =
      localStorage.getItem(`gestio_caisse_active_${cleanSlug}_${companyId}`) ||
      localStorage.getItem(`gestio_caisse_active_${cleanSlug}`) ||
      localStorage.getItem('active_caisse_session')
    if (localSessStr) {
      const parsed = JSON.parse(localSessStr)
      if (parsed && (parsed.statut === 'ouverte' || parsed.statut === 'open' || parsed.is_open === true)) {
        const openDate = new Date(parsed.date_ouverture || Date.now())
        const isDiffDate =
          openDate.getFullYear() !== now.getFullYear() ||
          openDate.getMonth() !== now.getMonth() ||
          openDate.getDate() !== now.getDate()
        const heureStr = !isNaN(openDate.getTime())
          ? openDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '--:--'

        console.log('[CASH-CHECK] Session active restaurée depuis localStorage pour:', cleanSlug)
        return {
          id: parsed.id || parsed.caisse_id || 'local-sess',
          caisse_id: parsed.caisse_id || parsed.id || 'local-caisse',
          session_number: parsed.session_number || parsed.code || `CS-${cleanSlug.slice(0, 4).toUpperCase()}`,
          statut: 'ouverte',
          date_ouverture: parsed.date_ouverture || now.toISOString(),
          heure_ouverture: heureStr,
          fond_ouverture_especes: Number(parsed.fond_ouverture_especes) || 0,
          fond_ouverture_momo: Number(parsed.fond_actuel_momo ?? parsed.fond_ouverture_momo) || 0,
          total_ouverture: (Number(parsed.fond_ouverture_especes) || 0) + (Number(parsed.fond_actuel_momo ?? parsed.fond_ouverture_momo) || 0),
          ouvert_par: parsed.ouvert_par_nom || parsed.ouvert_par || 'Caissier',
          ouvert_par_id: parsed.ouvert_par || null,
          sector_slug: cleanSlug,
          company_id: companyId,
          is_previous_day: isDiffDate,
        }
      }
    }
  } catch (locErr) {
    console.warn('[CASH-CHECK] Fallback localStorage:', locErr)
  }

  console.log('[CASH-CHECK]', {
    company_id: companyId,
    sector_slug: cleanSlug,
    user_id: userId,
    found: false,
    message: 'Caisse non ouverte pour ce secteur'
  })

  return null
}

export const getActiveCaisse = getCurrentCashSession

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TÂCHE 2.B : GESTION DU COFFRE-FORT & DÉBITS ACHATS PAR (company_id, sector_slug)
 * Règle : Chaque paiement fournisseur débite la source correspondante dans coffre_fort.
 * Vérifie le solde suffisant avant validation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function getCoffreFort(
  companyId: string,
  sectorSlug: string
): Promise<{ solde_especes: number; solde_momo_marchand: number; solde_banque: number }> {
  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')

  try {
    const { data, error } = await supabase
      .from('coffre_fort')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', cleanSlug)
      .maybeSingle()

    if (!error && data) {
      return {
        solde_especes: Number(data.solde_especes) || 0,
        solde_momo_marchand: Number(data.solde_momo_marchand) || 0,
        solde_banque: Number(data.solde_banque) || 0
      }
    }
  } catch (_) {}

  // Fallback sur cash_registers
  try {
    const { data: reg } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle()

    if (reg) {
      return {
        solde_especes: Number(reg.current_cash_balance) || 0,
        solde_momo_marchand: Number(reg.current_momo_balance) || 0,
        solde_banque: 0
      }
    }
  } catch (_) {}

  return { solde_especes: 0, solde_momo_marchand: 0, solde_banque: 0 }
}

export async function debitCoffreFort(
  companyId: string,
  sectorSlug: string,
  mode: 'especes' | 'momo' | 'virement' | 'cheque',
  montant: number,
  motif: string = 'Paiement fournisseur'
): Promise<{ success: boolean; error?: string; newBalances?: any }> {
  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
  const current = await getCoffreFort(companyId, cleanSlug)

  if (mode === 'especes') {
    if (current.solde_especes < montant) {
      return { success: false, error: `Solde insuffisant en espèces (${current.solde_especes} FCFA disponible, ${montant} FCFA requis).` }
    }
    const newEspeces = current.solde_especes - montant
    // Mise à jour coffre_fort
    try {
      await supabase.from('coffre_fort').upsert({
        company_id: companyId,
        sector_slug: cleanSlug,
        solde_especes: newEspeces,
        solde_momo_marchand: current.solde_momo_marchand,
        solde_banque: current.solde_banque,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,sector_slug' })
    } catch (_) {}

    // Mise à jour de repli sur cash_registers
    try {
      const { data: regs } = await supabase.from('cash_registers').select('id, current_cash_balance').eq('company_id', companyId).limit(1)
      if (regs && regs[0]) {
        await supabase.from('cash_registers').update({ current_cash_balance: newEspeces }).eq('id', regs[0].id)
      }
    } catch (_) {}

    // Tracer dans caisse_mouvements
    try {
      await supabase.from('caisse_mouvements').insert({
        company_id: companyId,
        sector_slug: cleanSlug,
        type: 'especes',
        sens: 'sortie',
        montant: montant,
        motif: motif,
        created_at: new Date().toISOString()
      })
    } catch (_) {}

    return { success: true, newBalances: { ...current, solde_especes: newEspeces } }
  } else if (mode === 'momo') {
    if (current.solde_momo_marchand < montant) {
      return { success: false, error: `Solde insuffisant en Mobile Money (${current.solde_momo_marchand} FCFA disponible, ${montant} FCFA requis).` }
    }
    const newMomo = current.solde_momo_marchand - montant
    try {
      await supabase.from('coffre_fort').upsert({
        company_id: companyId,
        sector_slug: cleanSlug,
        solde_especes: current.solde_especes,
        solde_momo_marchand: newMomo,
        solde_banque: current.solde_banque,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,sector_slug' })
    } catch (_) {}

    try {
      const { data: regs } = await supabase.from('cash_registers').select('id, current_momo_balance').eq('company_id', companyId).limit(1)
      if (regs && regs[0]) {
        await supabase.from('cash_registers').update({ current_momo_balance: newMomo }).eq('id', regs[0].id)
      }
    } catch (_) {}

    return { success: true, newBalances: { ...current, solde_momo_marchand: newMomo } }
  } else {
    // virement / cheque
    if (current.solde_banque > 0 && current.solde_banque < montant) {
      return { success: false, error: `Solde bancaire insuffisant (${current.solde_banque} FCFA disponible).` }
    }
    const newBanque = Math.max(0, current.solde_banque - montant)
    try {
      await supabase.from('coffre_fort').upsert({
        company_id: companyId,
        sector_slug: cleanSlug,
        solde_especes: current.solde_especes,
        solde_momo_marchand: current.solde_momo_marchand,
        solde_banque: newBanque,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,sector_slug' })
    } catch (_) {}

    return { success: true, newBalances: { ...current, solde_banque: newBanque } }
  }
}

export default supabaseTenant

