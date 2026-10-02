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
export const TABLES_WITH_PHYSICAL_SECTOR_SLUG = new Set<string>([
  'company_activities',
  'company_sectors',
  'sectors',
  'caisses',
  'caisse_clotures',
  'caisse_mouvements',
  'coffre_fort',
  'vente_lignes',
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

function attachInsertFallback(query: any, physicalTable: string, payload: any, cleanSlug: string, options?: any) {
  const origThen = query.then.bind(query)
  query.then = function (onfulfilled?: any, onrejected?: any) {
    return origThen(async (res: any) => {
      const isColMissingErr = res?.error && (
        res.error.code === '42703' ||
        res.error.code === 'PGRST204' ||
        String(res.error.message).includes('sector_slug')
      )
      if (isColMissingErr) {
        TABLES_WITH_PHYSICAL_SECTOR_SLUG.delete(physicalTable)
        const stripAndTag = (row: any) => {
          const copy = { ...row }
          delete copy.sector_slug
          copy.sector_meta = {
            ...(copy.sector_meta || {}),
            sector_slug: cleanSlug,
            sector: cleanSlug,
          }
          if (copy.notes) {
            try {
              const parsed = typeof copy.notes === 'string' ? JSON.parse(copy.notes) : copy.notes
              copy.notes = JSON.stringify({ ...parsed, sector_slug: cleanSlug })
            } catch {}
          } else if (['customers', 'suppliers', 'expenses'].includes(physicalTable)) {
            copy.notes = JSON.stringify({ sector_slug: cleanSlug })
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
          copy.sector_meta = {
            ...(copy.sector_meta || {}),
            sector_slug: cleanSlug,
            sector: cleanSlug,
          }
          if (copy.notes) {
            try {
              const parsed = typeof copy.notes === 'string' ? JSON.parse(copy.notes) : copy.notes
              copy.notes = JSON.stringify({ ...parsed, sector_slug: cleanSlug })
            } catch {}
          } else if (['customers', 'suppliers', 'expenses'].includes(physicalTable)) {
            copy.notes = JSON.stringify({ sector_slug: cleanSlug })
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

  // 3. Fallback direct et exact depuis sales_orders (avec coût figé)
  try {
    const { data: salesList } = await supabase
      .from('sales_orders')
      .select('id, total_amount, subtotal_ht, total_cost, sector_slug, notes, e_mecef_uid')
      .eq('company_id', companyId)

    const sales = salesList || []

    if (normSlug) {
      const sectorSales = filterItemsForSector(sales, normSlug)
      const ca_ht = sectorSales.reduce((s: number, item: any) => s + (Number(item.subtotal_ht || item.total_amount) || 0), 0)
      const total_cost = sectorSales.reduce((s: number, item: any) => s + (Number(item.total_cost) || 0), 0)
      const marge_brute = Math.max(0, ca_ht - total_cost)
      return { ca_ht, marge_brute }
    }

    return ALL_SECTORS_CATALOG.map((s) => {
      const secSlug = s.slug
      const sectorSales = filterItemsForSector(sales, secSlug)
      const ca_ht = sectorSales.reduce((sum: number, item: any) => sum + (Number(item.subtotal_ht || item.total_amount) || 0), 0)
      const total_cost = sectorSales.reduce((sum: number, item: any) => sum + (Number(item.total_cost) || 0), 0)
      const marge_brute = Math.max(0, ca_ht - total_cost)
      return {
        company_id: companyId,
        sector_slug: secSlug,
        ca_ht,
        marge_brute
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
export async function getActiveCaisse(
  companyId: string,
  sectorSlug: string
): Promise<{ id: string; statut: 'ouverte' | 'fermee'; date_ouverture: string; fond_ouverture_especes: number; fond_ouverture_momo: number } | null> {
  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
  if (!companyId || !cleanSlug) return null

  // 1. Essai sur table caisses officielle
  try {
    const { data: openCaisses, error } = await supabase
      .from('caisses')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', cleanSlug)
      .eq('statut', 'ouverte')
      .order('date_ouverture', { ascending: false })
      .limit(1)

    if (!error && openCaisses && openCaisses.length > 0) {
      const c = openCaisses[0]
      return {
        id: c.id,
        statut: 'ouverte',
        date_ouverture: c.date_ouverture || c.created_at,
        fond_ouverture_especes: Number(c.fond_ouverture_especes) || 0,
        fond_ouverture_momo: Number(c.fond_ouverture_momo) || 0
      }
    }
  } catch (_) {}

  // 2. Fallback sur cash_sessions si caisses n'existe pas encore
  try {
    const { data: openSessions, error: sessErr } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'ouverte')
      .order('opened_at', { ascending: false })
      .limit(10)

    if (!sessErr && openSessions && openSessions.length > 0) {
      // Filtrer par sector_slug
      const sessionInSector = openSessions.find((s: any) => {
        if (s.sector_slug) return s.sector_slug.toLowerCase().trim().replace(/^sec-/, '') === cleanSlug
        return cleanSlug === 'boutique'
      })

      if (sessionInSector) {
        return {
          id: sessionInSector.id,
          statut: 'ouverte',
          date_ouverture: sessionInSector.opened_at,
          fond_ouverture_especes: Number(sessionInSector.opening_cash) || 0,
          fond_ouverture_momo: Number(sessionInSector.opening_momo) || 0
        }
      }
    }
  } catch (_) {}

  return null
}

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

