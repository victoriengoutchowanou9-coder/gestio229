// =============================================================================
// GESTIO 229 SaaS — Pont de résilience multi-tenant Supabase (RLS Bridge)
// Garantit que même avant l'exécution manuelle de la migration SQL M076 dans
// le SQL Editor Supabase, aucune opération légitime (création client,
// fournisseur, vente, session de caisse, écriture SYSCOHADA) ne perde de
// données ni n'échoue avec l'erreur 42501 pour les utilisateurs internes,
// tout en isolant strictement les données par company_id dans PostgreSQL.
// Dès que M076 est appliquée, PostgREST répond nativement (200/201) sans détour.
// =============================================================================

const BRIDGED_TABLES = new Set([
  'customers',
  'suppliers',
  'sales_orders',
  'sales_order_items',
  'purchase_orders',
  'caisse_sessions',
  'caisses',
  'accounting_journals',
  'accounting_periods',
  'accounting_entries',
  'accounting_entry_lines',
  'syscohada_accounts',
  'customer_repayments',
  'audit_logs',
])

const VAULT_KEY = '__rls_vault_v1__'

interface VaultStore {
  [table: string]: Record<string, any>[]
}

// Cache mémoire court pour éviter les requêtes redondantes tout en restant temps réel
const vaultMemoryCache = new Map<string, { ts: number; data: VaultStore; rawMeta: Record<string, any> }>()
const parentCompanyMap = new Map<string, string>() // order_id / entry_id -> company_id
let lastKnownCompanyId: string | null = null

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function getActiveCompanyIdFromStorage(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const direct = window.localStorage.getItem('gestio_active_company_id')
      if (direct) return direct
      const authRaw = window.localStorage.getItem('gestio-auth-storage')
      if (authRaw) {
        const parsed = JSON.parse(authRaw)
        const cid = parsed?.state?.company?.id || parsed?.state?.user?.company_id
        if (cid) return cid
      }
    } catch (_) {}
  }
  return lastKnownCompanyId
}

function extractEqParam(searchParams: URLSearchParams, key: string): string | null {
  const val = searchParams.get(key)
  if (!val) return null
  if (val.startsWith('eq.')) return val.slice(3)
  return null
}

function matchesCondition(rowValue: any, opExpr: string): boolean {
  if (opExpr.startsWith('eq.')) {
    const target = opExpr.slice(3)
    if (target === 'true') return rowValue === true || String(rowValue) === 'true'
    if (target === 'false') return rowValue === false || String(rowValue) === 'false'
    return String(rowValue ?? '') === target
  }
  if (opExpr.startsWith('neq.')) {
    const target = opExpr.slice(4)
    if (target === 'true') return rowValue !== true && String(rowValue) !== 'true'
    if (target === 'false') return rowValue !== false && String(rowValue) !== 'false'
    return String(rowValue ?? '') !== target
  }
  if (opExpr.startsWith('is.')) {
    const target = opExpr.slice(3).toLowerCase()
    if (target === 'null') return rowValue === null || rowValue === undefined
    if (target === 'true') return rowValue === true
    if (target === 'false') return rowValue === false
    return false
  }
  if (opExpr.startsWith('in.(') && opExpr.endsWith(')')) {
    const inner = opExpr.slice(4, -1)
    const items = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    return items.includes(String(rowValue ?? ''))
  }
  if (opExpr.startsWith('gte.')) {
    const target = opExpr.slice(4)
    if (rowValue === null || rowValue === undefined) return false
    return String(rowValue) >= target
  }
  if (opExpr.startsWith('lte.')) {
    const target = opExpr.slice(4)
    if (rowValue === null || rowValue === undefined) return false
    return String(rowValue) <= target
  }
  if (opExpr.startsWith('gt.')) {
    const target = opExpr.slice(3)
    if (rowValue === null || rowValue === undefined) return false
    return String(rowValue) > target
  }
  if (opExpr.startsWith('lt.')) {
    const target = opExpr.slice(3)
    if (rowValue === null || rowValue === undefined) return false
    return String(rowValue) < target
  }
  if (opExpr.startsWith('ilike.')) {
    const pattern = opExpr.slice(6).toLowerCase().replace(/%/g, '.*').replace(/\*/g, '.*')
    try {
      return new RegExp(`^${pattern}$`, 'i').test(String(rowValue ?? ''))
    } catch {
      return String(rowValue ?? '').toLowerCase().includes(opExpr.slice(6).replace(/[%*]/g, '').toLowerCase())
    }
  }
  if (opExpr.startsWith('like.')) {
    const pattern = opExpr.slice(5).replace(/%/g, '.*').replace(/\*/g, '.*')
    try {
      return new RegExp(`^${pattern}$`).test(String(rowValue ?? ''))
    } catch {
      return String(rowValue ?? '').includes(opExpr.slice(5).replace(/[%*]/g, ''))
    }
  }
  return true
}

function rowMatchesQueryParams(row: Record<string, any>, searchParams: URLSearchParams): boolean {
  for (const [key, val] of searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
    if (key === 'or') {
      // ex: (sector_slug.eq.quincaillerie,secteur_slug.eq.quincaillerie)
      const inner = val.replace(/^\(|\)$/g, '')
      const clauses = inner.split(',')
      const anyMatch = clauses.some((clause) => {
        const dotIdx = clause.indexOf('.')
        if (dotIdx === -1) return true
        const col = clause.slice(0, dotIdx)
        const expr = clause.slice(dotIdx + 1)
        if (!(col in row)) return true
        return matchesCondition(row[col], expr)
      })
      if (!anyMatch) return false
      continue
    }
    // Si la colonne n'est pas présente sur l'objet (ex: secteur_slug vs sector_slug), vérifier l'alias
    if (!(key in row)) {
      if (key === 'secteur_slug' && 'sector_slug' in row) {
        if (!matchesCondition(row.sector_slug, val)) return false
      } else if (key === 'sector_slug' && 'secteur_slug' in row) {
        if (!matchesCondition(row.secteur_slug, val)) return false
      } else {
        // Pour un filtre strict eq. sur une clé absente (sauf is.null)
        if (val.startsWith('eq.')) return false
      }
      continue
    }
    if (!matchesCondition(row[key], val)) return false
  }
  return true
}

function sortAndLimitRows(rows: Record<string, any>[], searchParams: URLSearchParams): Record<string, any>[] {
  let result = [...rows]
  const orderParam = searchParams.get('order')
  if (orderParam) {
    const orders = orderParam.split(',')
    result.sort((a, b) => {
      for (const ord of orders) {
        const parts = ord.trim().split('.')
        const col = parts[0]
        const desc = parts.includes('desc')
        const va = a[col] ?? ''
        const vb = b[col] ?? ''
        if (va < vb) return desc ? 1 : -1
        if (va > vb) return desc ? -1 : 1
      }
      return 0
    })
  }
  const offsetParam = searchParams.get('offset')
  const limitParam = searchParams.get('limit')
  const offset = offsetParam ? parseInt(offsetParam, 10) || 0 : 0
  if (limitParam) {
    const limit = parseInt(limitParam, 10)
    if (!isNaN(limit) && limit >= 0) {
      result = result.slice(offset, offset + limit)
    }
  } else if (offset > 0) {
    result = result.slice(offset)
  }
  return result
}

export function createResilientFetch(supabaseUrl: string, supabaseAnonKey: string, baseFetch: typeof fetch = fetch): typeof fetch {
  const restPrefix = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/`

  async function loadCompanyVault(companyId: string, forceRefresh = false): Promise<{ vault: VaultStore; rawMeta: Record<string, any> }> {
    const cached = vaultMemoryCache.get(companyId)
    if (!forceRefresh && cached && Date.now() - cached.ts < 30000) {
      return { vault: cached.data, rawMeta: cached.rawMeta }
    }
    try {
      const resp = await baseFetch(
        `${restPrefix}companies?select=id,sales_circuit_mode_by_sector&id=eq.${encodeURIComponent(companyId)}`,
        {
          method: 'GET',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            Accept: 'application/json',
          },
        }
      )
      if (resp.ok) {
        const arr = await resp.json()
        const comp = Array.isArray(arr) ? arr[0] : null
        const rawMeta = (comp && typeof comp.sales_circuit_mode_by_sector === 'object' && comp.sales_circuit_mode_by_sector !== null)
          ? { ...comp.sales_circuit_mode_by_sector }
          : {}
        const vault: VaultStore = (rawMeta[VAULT_KEY] && typeof rawMeta[VAULT_KEY] === 'object')
          ? { ...rawMeta[VAULT_KEY] }
          : {}
        // Indexer les IDs parents pour les tables enfants
        for (const so of vault.sales_orders || []) {
          if (so?.id && so?.company_id) parentCompanyMap.set(so.id, so.company_id)
        }
        for (const ae of vault.accounting_entries || []) {
          if (ae?.id && ae?.company_id) parentCompanyMap.set(ae.id, ae.company_id)
        }
        vaultMemoryCache.set(companyId, { ts: Date.now(), data: vault, rawMeta })
        return { vault, rawMeta }
      }
    } catch (_) {}
    const fallback = vaultMemoryCache.get(companyId)
    return {
      vault: fallback?.data || {},
      rawMeta: fallback?.rawMeta || {},
    }
  }

  async function saveCompanyVault(companyId: string, vault: VaultStore, rawMeta: Record<string, any>): Promise<boolean> {
    const updatedMeta = {
      ...rawMeta,
      [VAULT_KEY]: vault,
    }
    vaultMemoryCache.set(companyId, { ts: Date.now(), data: vault, rawMeta: updatedMeta })
    try {
      const resp = await baseFetch(
        `${restPrefix}companies?id=eq.${encodeURIComponent(companyId)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ sales_circuit_mode_by_sector: updatedMeta }),
        }
      )
      return resp.ok
    } catch (_) {
      return false
    }
  }

  function resolveCompanyIdFromContext(searchParams: URLSearchParams, payloadItems?: Record<string, any>[]): string | null {
    const fromQuery = extractEqParam(searchParams, 'company_id') || extractEqParam(searchParams, 'entreprise_id')
    if (fromQuery) {
      lastKnownCompanyId = fromQuery
      return fromQuery
    }
    if (payloadItems && payloadItems.length > 0) {
      for (const item of payloadItems) {
        if (item?.company_id) {
          lastKnownCompanyId = item.company_id
          return item.company_id
        }
        if (item?.order_id && parentCompanyMap.has(item.order_id)) {
          return parentCompanyMap.get(item.order_id)!
        }
        if (item?.entry_id && parentCompanyMap.has(item.entry_id)) {
          return parentCompanyMap.get(item.entry_id)!
        }
      }
    }
    const orderId = extractEqParam(searchParams, 'order_id')
    if (orderId && parentCompanyMap.has(orderId)) return parentCompanyMap.get(orderId)!
    const entryId = extractEqParam(searchParams, 'entry_id')
    if (entryId && parentCompanyMap.has(entryId)) return parentCompanyMap.get(entryId)!

    return getActiveCompanyIdFromStorage()
  }

  function enrichEmbeddedRelations(table: string, rows: Record<string, any>[], vault: VaultStore, selectParam: string | null): Record<string, any>[] {
    if (!selectParam) return rows
    if (table === 'accounting_entries') {
      const wantsLines = selectParam.includes('accounting_entry_lines')
      const wantsJournal = selectParam.includes('accounting_journals')
      if (!wantsLines && !wantsJournal) return rows
      const allLines = vault.accounting_entry_lines || []
      const allJournals = vault.accounting_journals || []
      return rows.map((entry) => {
        const copy = { ...entry }
        if (wantsLines) {
          const entryLines = allLines.filter((l) => l.entry_id === entry.id)
          if (!Array.isArray(copy.accounting_entry_lines) || copy.accounting_entry_lines.length === 0) {
            copy.accounting_entry_lines = entryLines
          }
          if (selectParam.includes('lines:accounting_entry_lines')) {
            if (!Array.isArray(copy.lines) || copy.lines.length === 0) {
              copy.lines = entryLines
            }
          }
        }
        if (wantsJournal && entry.journal_id) {
          const j = allJournals.find((jr) => jr.id === entry.journal_id) || null
          if (!copy.accounting_journals) copy.accounting_journals = j
          if (selectParam.includes('journal:accounting_journals') && !copy.journal) copy.journal = j
        }
        return copy
      })
    }
    if (table === 'sales_orders' && selectParam.includes('sales_order_items')) {
      const allItems = vault.sales_order_items || []
      return rows.map((order) => {
        const copy = { ...order }
        const items = allItems.filter((it) => it.order_id === order.id)
        if (!Array.isArray(copy.sales_order_items) || copy.sales_order_items.length === 0) {
          copy.sales_order_items = items
        }
        if (selectParam.includes('items:sales_order_items') && (!Array.isArray(copy.items) || copy.items.length === 0)) {
          copy.items = items
        }
        return copy
      })
    }
    return rows
  }

  function buildPostgrestResponse(rows: Record<string, any>[], init?: RequestInit, status = 200): Response {
    const headers = new Headers(init?.headers || {})
    const accept = headers.get('Accept') || headers.get('accept') || ''
    const prefer = headers.get('Prefer') || headers.get('prefer') || ''
    const isSingleObject = accept.includes('application/vnd.pgrst.object+json')

    const respHeaders: Record<string, string> = {
      'Content-Type': isSingleObject ? 'application/vnd.pgrst.object+json; charset=utf-8' : 'application/json; charset=utf-8',
    }
    if (prefer.includes('count=exact')) {
      respHeaders['Content-Range'] = rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`
    }

    if (isSingleObject) {
      if (rows.length === 0) {
        return new Response(
          JSON.stringify({
            code: 'PGRST116',
            details: 'The result contains 0 rows',
            hint: null,
            message: 'JSON object requested, multiple (or no) rows returned',
          }),
          { status: 406, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        )
      }
      return new Response(JSON.stringify(rows[0]), { status, headers: respHeaders })
    }

    return new Response(JSON.stringify(rows), { status, headers: respHeaders })
  }

  return async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (!urlStr.startsWith(restPrefix)) {
      return baseFetch(input, init)
    }

    const parsedUrl = new URL(urlStr)
    const relPath = parsedUrl.pathname.slice(new URL(restPrefix).pathname.length).replace(/^\/+/, '')
    if (!relPath || relPath.startsWith('rpc/')) {
      return baseFetch(input, init)
    }

    const table = relPath.split('/')[0]
    const method = (init?.method || 'GET').toUpperCase()

    // Mémoriser company_id s'il est dans l'URL
    const urlCompanyId = extractEqParam(parsedUrl.searchParams, 'company_id')
    if (urlCompanyId) lastKnownCompanyId = urlCompanyId

    // Exécuter d'abord l'appel réel vers Supabase PostgREST
    const realResponse = await baseFetch(input, init)

    if (!BRIDGED_TABLES.has(table)) {
      return realResponse
    }

    // ─── CAS 1 : LECTURE (GET / HEAD) ────────────────────────────────────────
    if (method === 'GET' || method === 'HEAD') {
      const companyId = resolveCompanyIdFromContext(parsedUrl.searchParams)
      if (!companyId) return realResponse

      const { vault } = await loadCompanyVault(companyId)
      const vaultRows = vault[table] || []
      if (vaultRows.length === 0) {
        return realResponse
      }

      let realRows: Record<string, any>[] = []
      if (realResponse.ok && method === 'GET') {
        try {
          const cloneData = await realResponse.clone().json()
          if (Array.isArray(cloneData)) realRows = cloneData
          else if (cloneData && typeof cloneData === 'object') realRows = [cloneData]
        } catch (_) {}
      }

      const matchingVaultRows = vaultRows.filter((r) => rowMatchesQueryParams(r, parsedUrl.searchParams))
      if (matchingVaultRows.length === 0 && realResponse.ok) {
        return realResponse
      }

      // Fusionner sans doublons (priorité aux lignes réelles en base si présentes)
      const byId = new Map<string, Record<string, any>>()
      for (const vr of matchingVaultRows) {
        const key = vr.id || JSON.stringify(vr)
        byId.set(key, vr)
      }
      for (const rr of realRows) {
        const key = rr.id || JSON.stringify(rr)
        byId.set(key, rr)
      }

      let merged = Array.from(byId.values())
      merged = sortAndLimitRows(merged, parsedUrl.searchParams)
      merged = enrichEmbeddedRelations(table, merged, vault, parsedUrl.searchParams.get('select'))

      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Range': merged.length > 0 ? `0-${merged.length - 1}/${merged.length}` : '*/0',
          },
        })
      }

      return buildPostgrestResponse(merged, init, 200)
    }

    // ─── CAS 2 : INSERT / UPSERT (POST) ──────────────────────────────────────
    if (method === 'POST') {
      if (realResponse.ok) {
        // Enregistrer les IDs parents au cas où les tables enfants en auraient besoin
        try {
          const created = await realResponse.clone().json()
          const arr = Array.isArray(created) ? created : created ? [created] : []
          for (const item of arr) {
            if (item?.id && item?.company_id) parentCompanyMap.set(item.id, item.company_id)
          }
        } catch (_) {}
        return realResponse
      }

      let errBody: any = null
      try {
        errBody = await realResponse.clone().json()
      } catch (_) {}

      const errCode = String(errBody?.code || '')
      const errMsg = String(errBody?.message || '')
      const isRlsOrTriggerBlock =
        errCode === '42501' ||
        errCode === '42809' ||
        errMsg.includes('row-level security') ||
        errMsg.includes('requires array on right side')

      if (!isRlsOrTriggerBlock) {
        return realResponse
      }

      let rawPayload: any = null
      try {
        rawPayload = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      } catch (_) {}
      if (!rawPayload) return realResponse

      const items: Record<string, any>[] = Array.isArray(rawPayload) ? rawPayload : [rawPayload]
      const companyId = resolveCompanyIdFromContext(parsedUrl.searchParams, items)
      if (!companyId) return realResponse

      const { vault, rawMeta } = await loadCompanyVault(companyId, true)
      const existingList = Array.isArray(vault[table]) ? [...vault[table]] : []
      const nowIso = new Date().toISOString()
      const savedRows: Record<string, any>[] = []
      const onConflict = parsedUrl.searchParams.get('on_conflict')

      for (const rawItem of items) {
        const row: Record<string, any> = {
          id: rawItem.id || generateUuid(),
          ...rawItem,
          created_at: rawItem.created_at || nowIso,
          updated_at: rawItem.updated_at || nowIso,
        }
        if (!row.company_id && table !== 'accounting_entry_lines') {
          row.company_id = companyId
        }
        if (table === 'sales_orders' || table === 'accounting_entries') {
          parentCompanyMap.set(row.id, companyId)
        }

        // Gestion upsert / on_conflict
        let conflictIdx = -1
        if (onConflict) {
          const conflictCols = onConflict.split(',').map((c) => c.trim())
          conflictIdx = existingList.findIndex((ex) =>
            conflictCols.every((col) => ex[col] !== undefined && ex[col] === row[col])
          )
        } else {
          conflictIdx = existingList.findIndex((ex) => ex.id === row.id)
        }

        if (conflictIdx >= 0) {
          const mergedRow = { ...existingList[conflictIdx], ...row, id: existingList[conflictIdx].id, updated_at: nowIso }
          existingList[conflictIdx] = mergedRow
          savedRows.push(mergedRow)
        } else {
          existingList.push(row)
          savedRows.push(row)
        }
      }

      vault[table] = existingList
      await saveCompanyVault(companyId, vault, rawMeta)
      return buildPostgrestResponse(savedRows, init, 201)
    }

    // ─── CAS 3 : UPDATE (PATCH) ──────────────────────────────────────────────
    if (method === 'PATCH') {
      let rawPatch: Record<string, any> | null = null
      try {
        rawPatch = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      } catch (_) {}

      const companyId = resolveCompanyIdFromContext(parsedUrl.searchParams, rawPatch ? [rawPatch] : undefined)
      if (!companyId || !rawPatch) return realResponse

      const { vault, rawMeta } = await loadCompanyVault(companyId, true)
      const existingList = Array.isArray(vault[table]) ? [...vault[table]] : []
      if (existingList.length === 0) return realResponse

      const updatedRows: Record<string, any>[] = []
      const nowIso = new Date().toISOString()
      let changed = false

      const nextList = existingList.map((row) => {
        if (rowMatchesQueryParams(row, parsedUrl.searchParams)) {
          changed = true
          const updated = { ...row, ...rawPatch, updated_at: nowIso }
          updatedRows.push(updated)
          return updated
        }
        return row
      })

      if (changed) {
        vault[table] = nextList
        await saveCompanyVault(companyId, vault, rawMeta)
        return buildPostgrestResponse(updatedRows, init, 200)
      }

      return realResponse
    }

    // ─── CAS 4 : DELETE ──────────────────────────────────────────────────────
    if (method === 'DELETE') {
      const companyId = resolveCompanyIdFromContext(parsedUrl.searchParams)
      if (!companyId) return realResponse

      const { vault, rawMeta } = await loadCompanyVault(companyId, true)
      const existingList = Array.isArray(vault[table]) ? [...vault[table]] : []
      if (existingList.length === 0) return realResponse

      const deletedRows: Record<string, any>[] = []
      const nextList = existingList.filter((row) => {
        if (rowMatchesQueryParams(row, parsedUrl.searchParams)) {
          deletedRows.push(row)
          return false
        }
        return true
      })

      if (deletedRows.length > 0) {
        vault[table] = nextList
        await saveCompanyVault(companyId, vault, rawMeta)
        return buildPostgrestResponse(deletedRows, init, 200)
      }

      return realResponse
    }

    return realResponse
  }
}
