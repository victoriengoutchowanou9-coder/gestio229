// =============================================================================
// GESTIO 229 SaaS — Service Circuit de Vente et d'Encaissement Multi-Secteurs
// =============================================================================
// Supporte 2 modes configurables par entreprise :
// - MODE 1 : 'INTEGRE' (Vente et encaissement par le même utilisateur - Défaut)
// - MODE 2 : 'SEPARE_VENDEUR_CAISSIERE' (Séparation entre vendeur et caissière)
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse, resolveValidCashSession, cleanSectorSlug } from './caisseSectorService'
import { enregistrerEntreeCaisse } from './caisseDepensesService'
import { comptabiliserVenteAuto } from './compta_auto'
import { invalidateCache } from '../utils/cache'

export type SalesCircuitMode = 'INTEGRE' | 'SEPARE_VENDEUR_CAISSIERE'

export interface PendingBonItem {
  product_id: string
  product_code?: string
  product_name: string
  unit?: string
  quantity: number
  unit_price: number
  discount?: number
  tva_rate?: number
  total_ht?: number
  total_ttc: number
  unit_cost?: number
  coef?: number
  is_recipe?: boolean
}

export interface PendingBon {
  id: string
  order_number: string
  company_id: string
  sector_slug: string
  customer_id?: string | null
  customer_name?: string | null
  seller_id?: string | null
  seller_name?: string | null
  created_at: string
  subtotal_ht?: number
  tva_amount?: number
  aib_amount?: number
  discount_total?: number
  total_amount: number
  paid_amount: number
  credit_amount?: number
  remaining_balance: number
  payment_status: string
  status: string
  notes?: any
  items: PendingBonItem[]
  stock_already_deducted?: boolean
}

// Verrou anti-double-clic et anti-concurrence en mémoire par ID de bon
const inFlightEncaissements = new Set<string>()

// ─── 1. GESTION PERSISTANTE DU MODE DE CIRCUIT PAR SECTEUR & ENTREPRISE ────────

const CIRCUIT_STORAGE_PREFIX = 'gestio229_sales_circuit_'

/**
 * Normalise un slug de secteur pour cohérence d'accès
 */
export function normalizeCircuitSectorSlug(slug?: string): string {
  if (!slug) return 'general'
  return cleanSectorSlug(slug)
}

/**
 * Détermine de manière synchrone si un secteur donné fonctionne en Mode Séparé (Mode 2)
 */
export function isSectorCircuitSeparated(sectorSlug?: string, company?: any): boolean {
  if (!sectorSlug) return false
  const clean = normalizeCircuitSectorSlug(sectorSlug)
  try {
    if (typeof window !== 'undefined') {
      const companyId = company?.id
      // 1. Clé localStorage spécifique au secteur
      if (companyId) {
        const localSectorKey = `${CIRCUIT_STORAGE_PREFIX}${companyId}_${clean}`
        const localVal = localStorage.getItem(localSectorKey)
        if (localVal === 'SEPARE_VENDEUR_CAISSIERE') return true
        if (localVal === 'INTEGRE') return false
      }

      // 2. Recherche parmi toutes les clés locales pour ce secteur
      const allKeys = Object.keys(localStorage)
      const foundKey = allKeys.find(k => k.startsWith(CIRCUIT_STORAGE_PREFIX) && k.endsWith(`_${clean}`))
      if (foundKey) {
        const val = localStorage.getItem(foundKey)
        if (val === 'SEPARE_VENDEUR_CAISSIERE') return true
        if (val === 'INTEGRE') return false
      }
    }

    // 3. Vérification dans l'objet sales_circuit_mode_by_sector de l'entreprise
    const bySector = company?.sales_circuit_mode_by_sector
    if (bySector && typeof bySector === 'object') {
      if (bySector[clean] === 'SEPARE_VENDEUR_CAISSIERE') return true
      if (bySector[clean] === 'INTEGRE') return false
    }

    // 4. Fallback sur le mode global de l'entreprise si non spécifié pour ce secteur
    if (company?.sales_circuit_mode === 'SEPARE_VENDEUR_CAISSIERE') {
      return true
    }
  } catch {}
  return false
}

/**
 * Récupère le mode de circuit de vente configuré pour un secteur spécifique d'une entreprise
 * Priorité : Supabase (companies.sales_circuit_mode_by_sector[sector]) -> localStorage spécifique -> Supabase global -> Défaut 'INTEGRE'
 */
export async function getSalesCircuitMode(
  companyId: string,
  sectorSlug?: string
): Promise<SalesCircuitMode> {
  if (!companyId) return 'INTEGRE'
  const cleanSector = sectorSlug ? normalizeCircuitSectorSlug(sectorSlug) : ''

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('sales_circuit_mode, sales_circuit_mode_by_sector' as any)
      .eq('id', companyId)
      .maybeSingle()

    if (!error && data) {
      const bySector = (data as any)?.sales_circuit_mode_by_sector
      if (cleanSector && bySector && typeof bySector === 'object' && bySector[cleanSector]) {
        const mode = bySector[cleanSector] as SalesCircuitMode
        if (mode === 'INTEGRE' || mode === 'SEPARE_VENDEUR_CAISSIERE') {
          try {
            localStorage.setItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}_${cleanSector}`, mode)
          } catch (_) {}
          return mode
        }
      }

      // Si pas de config spécifique pour ce secteur, vérifier le global
      const globalMode = (data as any)?.sales_circuit_mode as SalesCircuitMode
      if (globalMode === 'INTEGRE' || globalMode === 'SEPARE_VENDEUR_CAISSIERE') {
        return globalMode
      }
    }
  } catch (err) {
    console.warn('[salesCircuitService] Fallback lecture mode circuit secteur:', err)
  }

  // Fallback localStorage spécifique au secteur
  if (cleanSector) {
    try {
      const localSector = localStorage.getItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}_${cleanSector}`)
      if (localSector === 'INTEGRE' || localSector === 'SEPARE_VENDEUR_CAISSIERE') {
        return localSector
      }
    } catch (_) {}
  }

  // Fallback localStorage global entreprise
  try {
    const local = localStorage.getItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}`)
    if (local === 'INTEGRE' || local === 'SEPARE_VENDEUR_CAISSIERE') {
      return local
    }
  } catch (_) {}

  return 'INTEGRE'
}

/**
 * Enregistre le choix du mode de circuit pour un secteur spécifique d'une entreprise
 * L'activation dans un secteur ne modifie jamais automatiquement les autres secteurs !
 */
export async function setSalesCircuitMode(
  companyId: string,
  mode: SalesCircuitMode,
  sectorSlug?: string
): Promise<{ success: boolean; error?: string }> {
  if (!companyId) return { success: false, error: 'Identifiant entreprise manquant' }
  const cleanSector = sectorSlug ? normalizeCircuitSectorSlug(sectorSlug) : ''

  // 1. Sauvegarde locale immédiate
  try {
    if (cleanSector) {
      localStorage.setItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}_${cleanSector}`, mode)
    }
    // Conserver aussi pour compatibilité globale si premier secteur
    localStorage.setItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}`, mode)
  } catch (_) {}

  try {
    // 2. Lecture préalable des modes par secteur existants
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('sales_circuit_mode_by_sector, sales_circuit_mode' as any)
      .eq('id', companyId)
      .maybeSingle()

    const existingBySector = (existingCompany as any)?.sales_circuit_mode_by_sector || {}
    const updatedBySector = {
      ...existingBySector,
      ...(cleanSector ? { [cleanSector]: mode } : {})
    }

    const updatePayload: any = {
      sales_circuit_mode_by_sector: updatedBySector,
      updated_at: new Date().toISOString()
    }

    // Mettre à jour aussi la colonne globale de compatibilité
    if (!cleanSector || (existingCompany as any)?.sales_circuit_mode === undefined) {
      updatePayload.sales_circuit_mode = mode
    }

    const { error } = await supabase
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId)

    if (error) {
      console.warn('[salesCircuitService] Mise à jour base colonne sectorielle:', error.message)
      await supabase
        .from('companies')
        .update({
          sales_circuit_mode: mode,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', companyId)
    }

    // 3. Diffusion de l'événement avec précision du secteur
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gestio:sales_circuit_changed', {
        detail: { mode, companyId, sectorSlug: cleanSector }
      }))
    }

    return { success: true }
  } catch (err: any) {
    console.warn('[salesCircuitService] Exception setSalesCircuitMode:', err)
    return { success: true }
  }
}

// ─── 2. VÉRIFICATION DES OPÉRATIONS EN COURS AVANT CHANGEMENT DE MODE ────────

/**
 * Détermine si une commande est éligible à l'encaissement
 */
export function isOrderEligibleForCollection(order: any): boolean {
  if (!order) return false
  const st = String(order.status || '').toUpperCase().trim()
  const paySt = String(order.payment_status || '').toUpperCase().trim()

  if (st === 'ANNULE' || st === 'ANNULÉE' || st === 'CANCELLED' || paySt === 'ANNULE' || paySt === 'AVOIR') {
    return false
  }
  if (st === 'COMPLET' || paySt === 'COMPLET') {
    return false
  }

  const total = Number(order.total_amount || 0)
  const paid = Number(order.paid_amount || 0)
  const credit = Number(order.credit_amount || 0)
  const remaining = order.remaining_balance !== undefined
    ? Number(order.remaining_balance)
    : Math.max(0, total - paid - credit)

  if (remaining <= 0) return false

  return (
    st === 'PENDING_CASHIER' ||
    st === 'PARTIELLEMENT_PAYE' ||
    paySt === 'EN_ATTENTE' ||
    paySt === 'PARTIEL'
  )
}

/**
 * Compte le nombre de bons en attente d'encaissement pour l'entreprise
 */
export async function getPendingBonsCount(companyId: string, sectorSlug?: string): Promise<number> {
  if (!companyId) return 0
  try {
    const list = await fetchPendingBons(companyId, sectorSlug)
    return list.length
  } catch (err) {
    console.warn('[salesCircuitService] Exception getPendingBonsCount:', err)
    return 0
  }
}

// ─── 3. RÉCUPÉRATION DES BONS EN ATTENTE D'ENCAISSEMENT ───────────────────────

/**
 * Charge tous les bons réellement en attente d'encaissement pour la caissière
 * avec leurs lignes d'articles complètes (depuis notes.lines ou sales_order_items).
 */
export async function fetchPendingBons(companyId: string, sectorSlug?: string): Promise<PendingBon[]> {
  if (!companyId) return []

  try {
    let query = supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .or('status.eq.pending_cashier,status.eq.partiellement_paye,payment_status.eq.en_attente')
      .order('created_at', { ascending: false })

    if (sectorSlug) {
      const clean = normalizeCircuitSectorSlug(sectorSlug)
      query = query.eq('sector_slug', clean)
    }

    const { data, error } = await query

    if (error) {
      console.error('[salesCircuitService] Erreur fetchPendingBons:', error)
      return []
    }

    const rawOrders = (data || []).filter((o: any) => isOrderEligibleForCollection(o))
    if (rawOrders.length === 0) return []

    // Charger également sales_order_items pour compléter les commandes dont notes.lines serait absent ou incomplet
    const orderIds = rawOrders.map((o: any) => o.id)
    const itemsByOrderId: Record<string, any[]> = {}
    try {
      const { data: dbItems } = await supabase
        .from('sales_order_items')
        .select('*')
        .in('order_id', orderIds)

      if (dbItems && dbItems.length > 0) {
        for (const it of dbItems) {
          if (!itemsByOrderId[it.order_id]) itemsByOrderId[it.order_id] = []
          itemsByOrderId[it.order_id].push(it)
        }
      }
    } catch (_) {}

    return rawOrders.map((order: any) => {
      let notesParsed: any = {}
      if (typeof order.notes === 'string') {
        try {
          notesParsed = JSON.parse(order.notes)
        } catch (_) {}
      } else if (order.notes && typeof order.notes === 'object') {
        notesParsed = order.notes
      }

      // Extraction des items de la commande sélectionnée uniquement
      let items: PendingBonItem[] = []
      if (Array.isArray(notesParsed.lines) && notesParsed.lines.length > 0) {
        items = notesParsed.lines.map((l: any) => {
          const qty = Number(l.qty ?? l.quantity ?? 1)
          const unitPrice = Number(l.unitPrice ?? l.unit_price ?? 0)
          const discount = Number(l.discount ?? 0)
          const grossLine = Math.round(qty * unitPrice)
          const netLine = Math.max(0, Math.round(grossLine - discount))
          const tvaRate = Number(l.tva_rate ?? l.product?.tva_rate ?? 0)
          return {
            product_id: l.product?.id || l.product_id || '',
            product_code: l.product?.code || l.product_code || '',
            product_name: l.product?.name || l.product_name || 'Article',
            unit: l.product?.unit || l.unit || 'u',
            quantity: qty,
            unit_price: unitPrice,
            discount,
            tva_rate: tvaRate,
            total_ht: Number(l.total_ht ?? netLine),
            total_ttc: Number(l.total_ttc ?? netLine),
            unit_cost: Number(l.product?.cost_price ?? l.unit_cost ?? 0),
            coef: Number(l.product?.coef ?? 1),
            is_recipe: Boolean(l.product?.is_recipe)
          }
        })
      } else if (itemsByOrderId[order.id] && itemsByOrderId[order.id].length > 0) {
        items = itemsByOrderId[order.id].map((dbIt: any) => ({
          product_id: dbIt.product_id || '',
          product_code: dbIt.product_code || '',
          product_name: dbIt.product_name || 'Article',
          unit: dbIt.unit || 'u',
          quantity: Number(dbIt.quantity || 1),
          unit_price: Number(dbIt.unit_price || 0),
          discount: Number(dbIt.discount_amount || 0),
          tva_rate: Number(dbIt.tva_rate || 0),
          total_ht: Number(dbIt.total_ht ?? (Number(dbIt.quantity || 1) * Number(dbIt.unit_price || 0))),
          total_ttc: Number(dbIt.total_ttc ?? (Number(dbIt.quantity || 1) * Number(dbIt.unit_price || 0))),
          unit_cost: Number(dbIt.unit_cost || 0),
          coef: 1,
          is_recipe: false
        }))
      }

      const totalAmount = Number(order.total_amount || 0)
      const paidAmount = Number(order.paid_amount || 0)
      const creditAmount = Number(order.credit_amount || 0)
      const remainingBalance = Math.max(0, totalAmount - paidAmount - creditAmount)
      const discountTotal = items.reduce((s, it) => s + Number(it.discount || 0), 0)

      return {
        id: order.id,
        order_number: order.order_number,
        company_id: order.company_id,
        sector_slug: order.sector_slug,
        customer_id: order.customer_id,
        customer_name: order.customer_name || notesParsed.customer_name || 'Client Comptoir',
        seller_id: order.created_by || notesParsed.seller_id || null,
        seller_name: notesParsed.seller_name || notesParsed.serveur_nom || 'Vendeur',
        created_at: order.created_at,
        subtotal_ht: Number(order.subtotal_ht ?? totalAmount),
        tva_amount: Number(order.tva_amount || 0),
        aib_amount: Number(order.aib_amount || 0),
        discount_total: Number(notesParsed.discount_total ?? discountTotal),
        total_amount: totalAmount,
        paid_amount: paidAmount,
        credit_amount: creditAmount,
        remaining_balance: remainingBalance,
        payment_status: order.payment_status || 'en_attente',
        status: order.status || 'pending_cashier',
        notes: notesParsed,
        items,
        stock_already_deducted: Boolean(notesParsed.stock_already_deducted)
      }
    })
  } catch (err) {
    console.error('[salesCircuitService] Exception fetchPendingBons:', err)
    return []
  }
}

// ─── 4. CRÉATION ET TRANSMISSION D'UN BON PAR LE VENDEUR (MODE SÉPARÉ) ────────

export interface TransmitBonParams {
  company_id: string
  sector_slug: string
  seller_id: string
  seller_name: string
  customer_id?: string | null
  customer_name?: string | null
  items: Array<{
    product: any
    qty: number
    unitPrice: number
    discount?: number
  }>
  total_ht: number
  total_tva: number
  total_aib: number
  total_ttc: number
  notes_extra?: string
}

/**
 * Crée un Bon de Commande validé et le transmet directement à la caisse.
 * Revérifie obligatoirement la disponibilité réelle du stock_vente en base de données
 * au moment de la validation pour empêcher toute vente dépassant le stock disponible.
 */
export async function creerEtTransmettreBon(
  params: TransmitBonParams
): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string }> {
  try {
    if (!params.company_id) {
      return { success: false, error: 'Identifiant entreprise manquant.' }
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      return { success: false, error: 'La commande doit contenir au moins un article.' }
    }

    // Fusionner les éventuels doublons de produits et contrôler que chaque quantité est strictement positive
    const mergedMap = new Map<string, { product: any; qty: number; unitPrice: number; discount: number }>()
    for (const rawLine of params.items) {
      const qty = Number(rawLine.qty)
      const unitPrice = Number(rawLine.unitPrice)
      const discount = Math.max(0, Number(rawLine.discount || 0))

      if (isNaN(qty) || qty <= 0) {
        return {
          success: false,
          error: `Quantité invalide (${rawLine.qty}) pour l'article "${rawLine.product?.name || 'Article'}". La quantité doit être strictement positive.`
        }
      }
      if (isNaN(unitPrice) || unitPrice < 0) {
        return {
          success: false,
          error: `Prix unitaire invalide pour l'article "${rawLine.product?.name || 'Article'}".`
        }
      }

      const prodId = String(rawLine.product?.id || rawLine.product?.name || '')
      if (mergedMap.has(prodId)) {
        const existing = mergedMap.get(prodId)!
        existing.qty = Math.round((existing.qty + qty) * 1000) / 1000
        existing.discount = Math.round((existing.discount + discount) * 100) / 100
      } else {
        mergedMap.set(prodId, {
          product: rawLine.product,
          qty: Math.round(qty * 1000) / 1000,
          unitPrice,
          discount
        })
      }
    }

    const consolidatedItems = Array.from(mergedMap.values())

    // Revérification serveur du stock_vente réel dans public.products pour tous les produits physiques
    const physicalProductIds = consolidatedItems
      .filter(i => !i.product?.is_recipe && i.product?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(i.product.id)))
      .map(i => String(i.product.id))

    if (physicalProductIds.length > 0) {
      const { data: dbProducts, error: prodErr } = await supabase
        .from('products')
        .select('id, code, name, stock_vente, stock_magasin, sector_meta')
        .eq('company_id', params.company_id)
        .in('id', physicalProductIds)

      if (prodErr) {
        return {
          success: false,
          error: `Impossible de vérifier le stock disponible en base : ${prodErr.message}`
        }
      }

      const dbProdMap = new Map<string, any>()
      for (const p of dbProducts || []) {
        dbProdMap.set(p.id, p)
      }

      for (const item of consolidatedItems) {
        if (item.product?.is_recipe) continue
        const pId = String(item.product?.id || '')
        if (!pId || !dbProdMap.has(pId)) continue

        const dbProd = dbProdMap.get(pId)
        const meta = dbProd.sector_meta || {}
        const realStockVente = Number(dbProd.stock_vente ?? meta.stock_vente ?? dbProd.current_stock ?? 0)

        if (item.qty > realStockVente) {
          return {
            success: false,
            error: `Stock vente insuffisant pour "${dbProd.name || item.product?.name}" : quantité demandée ${item.qty}, stock vente disponible ${realStockVente}.`
          }
        }
      }
    }

    const cleanSector = normalizeCircuitSectorSlug(params.sector_slug)
    const secteurCode = cleanSector.substring(0, 3).toUpperCase()
    let dateStr = ''
    try {
      dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' }).replace(/-/g, '')
    } catch {
      dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    }
    const randStr = Math.random().toString(36).substring(2, 6).toUpperCase()
    const timeStr = Date.now().toString().slice(-4)
    const orderNum = `BC-${secteurCode}-${dateStr}-${timeStr}-${randStr}`

    let computedTotalCost = 0
    let computedDiscountTotal = 0

    const formattedLines = consolidatedItems.map(i => {
      const lineGross = Math.round(i.qty * i.unitPrice)
      const lineDiscount = Math.max(0, Math.round(i.discount || 0))
      const lineNet = Math.max(0, lineGross - lineDiscount)
      const unitCost = Number(i.product?.cost_price || 0)
      computedTotalCost += Math.round(i.qty * unitCost)
      computedDiscountTotal += lineDiscount

      return {
        product: {
          id: i.product.id,
          code: i.product.code || '',
          name: i.product.name,
          unit: i.product.unit || i.product.uv || 'u',
          cost_price: unitCost,
          selling_price: i.unitPrice,
          coef: i.product.coef || 1,
          is_recipe: Boolean(i.product.is_recipe)
        },
        qty: i.qty,
        unitPrice: i.unitPrice,
        discount: lineDiscount,
        total_ht: lineNet,
        total_ttc: lineNet
      }
    })

    const notesPayload = {
      sector_slug: cleanSector,
      seller_id: params.seller_id,
      seller_name: params.seller_name,
      customer_name: params.customer_name || 'Client Comptoir',
      transmitted_to_caisse: true,
      transmitted_at: new Date().toISOString(),
      stock_already_deducted: false, // Le déstockage aura lieu à l'encaissement effectif
      discount_total: computedDiscountTotal,
      notes_extra: params.notes_extra || null,
      lines: formattedLines
    }

    const todayDate = new Date().toISOString().split('T')[0]
    const isValidUUID = (u?: string | null) =>
      !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(u).trim())

    const salePayload = {
      company_id: params.company_id,
      order_number: orderNum,
      order_type: 'bon_de_commande',
      order_date: todayDate,
      subtotal_ht: params.total_ht,
      tva_amount: params.total_tva,
      aib_amount: params.total_aib,
      total_amount: params.total_ttc,
      total_cost: computedTotalCost,
      paid_amount: 0,
      credit_amount: 0,
      payment_status: 'en_attente',
      status: 'pending_cashier',
      sector_slug: cleanSector,
      created_by: isValidUUID(params.seller_id) ? params.seller_id : null,
      customer_name: params.customer_name || 'Client Comptoir',
      customer_id: isValidUUID(params.customer_id) ? params.customer_id : null,
      notes: JSON.stringify(notesPayload)
    }

    const { data: savedOrder, error: orderError } = await supabase
      .from('sales_orders')
      .insert(salePayload)
      .select('id')
      .single()

    if (orderError || !savedOrder?.id) {
      throw new Error(orderError?.message || 'Erreur lors de la création du bon de commande')
    }

    // Enregistrement des lignes d'articles dans sales_order_items
    const lineItems = formattedLines.map(line => ({
      order_id: savedOrder.id,
      product_id: isValidUUID(line.product.id) ? line.product.id : null,
      product_name: line.product.name,
      quantity: line.qty,
      unit_price: line.unitPrice,
      unit_cost: Number(line.product.cost_price || 0),
      tva_rate: 0,
      total_ht: line.total_ht,
      total_ttc: line.total_ttc,
      company_id: params.company_id,
      sector_slug: cleanSector
    }))

    try {
      await supabase.from('sales_order_items').insert(lineItems)
    } catch (e) {
      console.warn('[salesCircuitService] Avertissement insertion items:', e)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gestio:bon_transmitted', { detail: { orderNum, orderId: savedOrder.id } }))
    }

    return {
      success: true,
      orderId: savedOrder.id,
      orderNumber: orderNum
    }
  } catch (err: any) {
    console.error('[salesCircuitService] Exception creerEtTransmettreBon:', err)
    return { success: false, error: err.message || 'Impossible de transmettre le bon' }
  }
}

// ─── 5. ENCAISSEMENT D'UN BON PAR LA CAISSIÈRE (SÉCURITÉ & ATOMICITÉ) ──────────

export type EncaissementPaymentMethod =
  | 'especes'
  | 'momo_mtn'
  | 'momo_moov'
  | 'mtn_momo'
  | 'moov_momo'
  | 'wave'
  | 'momo'
  | 'banque'
  | 'carte'
  | 'virement'
  | 'cheque'
  | 'credit'
  | 'mixte'

export interface MultiPaymentSplitItem {
  method: EncaissementPaymentMethod
  amount: number
  reference?: string
}

export interface EncaisserBonParams {
  orderId: string
  companyId: string
  sectorSlug: string
  caisseId?: string | null
  caisseSessionId?: string | null
  cashierId: string
  cashierName: string
  montantEncaisse: number
  modePaiement: EncaissementPaymentMethod
  isMultiPayment?: boolean
  payments?: MultiPaymentSplitItem[]
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  dueDate?: string | null
  notes?: string
  _simulateFailureAtStep?: 'after_order_update' | 'after_stock_update' | 'after_debt_insert'
}

/**
 * Encaisse un bon de commande avec :
 * - Verrou anti-double-clic et anti-concurrence
 * - Vérification stricte de la session de caisse ouverte dans `public.cash_sessions` (`sales_orders_cash_session_id_fkey`)
 * - Prise en charge du paiement simple, du paiement à Crédit et du Paiement en plusieurs modes
 * - Création automatique de la créance dans `client_debts` et mise à jour de `customers.current_debt` uniquement pour la part crédit
 * - Enregistrement des mouvements de trésorerie/caisse uniquement pour les montants réellement encaissés
 * - Déduction atomique de `stock_vente` (colonne SQL + `sector_meta`) avec compensation rollback en cas d'échec
 */
export async function encaisserBonDeCommande(
  params: EncaisserBonParams
): Promise<{
  success: boolean
  transactionRef?: string
  cashSessionId?: string
  paidCash?: number
  paidMomo?: number
  paidBankCard?: number
  creditAmount?: number
  debtId?: string | null
  error?: string
}> {
  if (!params.orderId) return { success: false, error: 'Identifiant du bon manquant.' }
  if (!params.companyId) return { success: false, error: 'Identifiant entreprise manquant.' }

  // Protection anti-double-clic / exécution concurrente sur le même bon
  if (inFlightEncaissements.has(params.orderId)) {
    return {
      success: false,
      error: 'Une validation d\'encaissement est déjà en cours pour cette commande. Veuillez patienter.'
    }
  }

  inFlightEncaissements.add(params.orderId)

  // États pour rollback compensatoire si une étape obligatoire échoue
  let orderUpdated = false
  let previousOrderSnapshot: any = null
  const stockRollbacks: Array<{ prodId: string; prevStockVente: number; prevCurrentStock: number; prevMeta: any }> = []
  const insertedStockMovementIds: string[] = []
  let createdDebtId: string | null = null
  let updatedCustomerDebtInfo: { customerId: string; previousDebt: number } | null = null

  try {
    const cleanSector = normalizeCircuitSectorSlug(params.sectorSlug)

    // 1. CONTRÔLE DE LA COMMANDE : Existence, appartenance à l'entreprise et au secteur, et statut
    const { data: currentOrder, error: fetchErr } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', params.orderId)
      .eq('company_id', params.companyId)
      .maybeSingle()

    if (fetchErr || !currentOrder) {
      return {
        success: false,
        error: 'Le bon de commande est introuvable ou n\'appartient pas à votre établissement.'
      }
    }

    const orderSector = normalizeCircuitSectorSlug(currentOrder.sector_slug)
    if (orderSector && cleanSector && orderSector !== cleanSector) {
      return {
        success: false,
        error: `Violation d'isolation sectorielle : cette commande appartient au secteur "${orderSector}" et ne peut pas être encaissée dans "${cleanSector}".`
      }
    }

    const stUpper = String(currentOrder.status || '').toUpperCase().trim()
    const payStUpper = String(currentOrder.payment_status || '').toUpperCase().trim()

    if (stUpper === 'ANNULE' || stUpper === 'ANNULÉE' || stUpper === 'CANCELLED' || payStUpper === 'ANNULE') {
      return {
        success: false,
        error: `Ce bon (${currentOrder.order_number}) a été annulé et ne peut plus être encaissé.`
      }
    }

    const currentTotal = Math.round(Number(currentOrder.total_amount || 0))
    const currentPaid = Math.round(Number(currentOrder.paid_amount || 0))
    const currentCredit = Math.round(Number(currentOrder.credit_amount || 0))
    const remaining = Math.max(0, currentTotal - currentPaid - currentCredit)

    if (remaining <= 0 || stUpper === 'COMPLET') {
      return {
        success: false,
        error: `Ce bon (${currentOrder.order_number}) a déjà été entièrement réglé/encaissé et ne peut pas être encaissé une seconde fois.`
      }
    }

    // 2. VÉRIFICATION STRICTE DE LA SESSION DE CAISSE OUVERTE (Correction sales_orders_cash_session_id_fkey)
    const sessionCheck = await resolveValidCashSession(
      params.companyId,
      cleanSector,
      params.caisseSessionId,
      params.caisseId,
      params.cashierId
    )

    if (!sessionCheck.valid || !sessionCheck.cashSessionId) {
      return {
        success: false,
        error: sessionCheck.error || 'Aucune session de caisse valide n\'est ouverte pour ce secteur.'
      }
    }

    const validCashSessionId = sessionCheck.cashSessionId
    const validCaisseId = sessionCheck.caisseId

    // 3. VALIDATION DES MODES DE RÈGLEMENT (Simple, Crédit ou Paiement en plusieurs modes)
    let breakdown: Array<{ method: EncaissementPaymentMethod; amount: number; reference?: string }> = []

    if (params.isMultiPayment || (Array.isArray(params.payments) && params.payments.length > 0)) {
      const rawPayments = params.payments || []
      if (rawPayments.length === 0) {
        return {
          success: false,
          error: 'Veuillez répartir le montant sur au moins un mode de paiement.'
        }
      }

      for (const p of rawPayments) {
        const amt = Number(p.amount)
        if (isNaN(amt) || amt < 0) {
          return {
            success: false,
            error: `Montant invalide ou négatif (${p.amount}) pour le mode "${p.method}".`
          }
        }
      }

      const positivePayments = rawPayments
        .map(p => ({
          method: String(p.method || '').toLowerCase().trim() as EncaissementPaymentMethod,
          amount: Math.round(Number(p.amount || 0)),
          reference: p.reference
        }))
        .filter(p => p.amount > 0)

      if (positivePayments.length === 0) {
        return {
          success: false,
          error: 'Tous les montants saisis sont nuls. Veuillez saisir les montants à répartir.'
        }
      }

      const sumAllocated = positivePayments.reduce((s, p) => s + p.amount, 0)
      if (Math.abs(sumAllocated - remaining) > 1) {
        return {
          success: false,
          error: `La somme des paiements répartis (${sumAllocated} FCFA) ne correspond pas au montant exigible (${remaining} FCFA). Reste à répartir : ${remaining - sumAllocated} FCFA.`
        }
      }

      // Regrouper proprement les lignes de même mode pour éviter tout doublon de règlement
      const grouped = new Map<EncaissementPaymentMethod, number>()
      for (const p of positivePayments) {
        grouped.set(p.method, (grouped.get(p.method) || 0) + p.amount)
      }
      breakdown = Array.from(grouped.entries()).map(([method, amount]) => ({ method, amount }))
    } else {
      const rawAmount = Math.round(Number(params.montantEncaisse))
      if (isNaN(rawAmount) || rawAmount <= 0) {
        return {
          success: false,
          error: 'Le montant à encaisser doit être strictement supérieur à zéro.'
        }
      }
      if (rawAmount > remaining + 1) {
        return {
          success: false,
          error: `Le montant saisi (${rawAmount} FCFA) dépasse le montant restant à encaisser (${remaining} FCFA).`
        }
      }
      const normalizedMethod = String(params.modePaiement || 'especes').toLowerCase().trim() as EncaissementPaymentMethod
      breakdown = [{ method: normalizedMethod, amount: Math.min(rawAmount, remaining) }]
    }

    // Calcul des parts exactes par canal financier
    let paidCash = 0
    let paidMomo = 0
    let paidBankCard = 0
    let creditPart = 0

    for (const item of breakdown) {
      const m = item.method
      if (m === 'especes') {
        paidCash += item.amount
      } else if (['momo_mtn', 'momo_moov', 'mtn_momo', 'moov_momo', 'wave', 'momo'].includes(m)) {
        paidMomo += item.amount
      } else if (['banque', 'carte', 'virement', 'cheque'].includes(m)) {
        paidBankCard += item.amount
      } else if (m === 'credit') {
        creditPart += item.amount
      } else {
        return {
          success: false,
          error: `Mode de règlement non reconnu : "${m}".`
        }
      }
    }

    const immediatelyPaid = paidCash + paidMomo + paidBankCard
    const totalSettledNow = immediatelyPaid + creditPart

    // 4. CONTRÔLE DU CLIENT ET DES RÈGLES DE CRÉDIT SI UNE PART EST À CRÉDIT (Section 5 & 6)
    const isValidUUID = (u?: string | null) =>
      !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(u).trim())

    let effectiveCustomerId = isValidUUID(params.customerId)
      ? String(params.customerId).trim()
      : (isValidUUID(currentOrder.customer_id) ? String(currentOrder.customer_id).trim() : null)
    let effectiveCustomerName = String(params.customerName || currentOrder.customer_name || '').trim()
    let effectiveCustomerPhone = String(params.customerPhone || '').trim()
    let customerRecord: any = null

    if (creditPart > 0) {
      if (
        !effectiveCustomerId ||
        !effectiveCustomerName ||
        effectiveCustomerName.toLowerCase() === 'client comptoir' ||
        effectiveCustomerName.toLowerCase() === 'anonyme'
      ) {
        return {
          success: false,
          error: 'Un règlement à crédit exige obligatoirement la sélection d\'un client identifié (le Client Comptoir n\'est pas autorisé à crédit).'
        }
      }

      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select('id, code, name, phone, current_debt, credit_limit, credit_authorized, is_active, sector_slug')
        .eq('id', effectiveCustomerId)
        .eq('company_id', params.companyId)
        .maybeSingle()

      if (custErr || !custData) {
        return {
          success: false,
          error: 'Le client sélectionné pour le crédit est introuvable dans la base de données.'
        }
      }

      if (custData.credit_authorized === false) {
        return {
          success: false,
          error: `Le client "${custData.name}" n'est pas autorisé à bénéficier d'un règlement à crédit.`
        }
      }

      const curCustDebt = Number(custData.current_debt || 0)
      const creditLimit = Number(custData.credit_limit || 0)
      if (creditLimit > 0 && curCustDebt + creditPart > creditLimit) {
        return {
          success: false,
          error: `Plafond de crédit dépassé pour "${custData.name}" : encours actuel ${curCustDebt} FCFA + crédit demandé ${creditPart} FCFA > plafond ${creditLimit} FCFA.`
        }
      }

      customerRecord = custData
      effectiveCustomerName = custData.name || effectiveCustomerName
      effectiveCustomerPhone = custData.phone || effectiveCustomerPhone
    }

    // 5. PARSING DES NOTES ET VÉRIFICATION DU STOCK AVANT ÉCRITURE (Section 3.4 & Section 8)
    let notesParsed: any = {}
    if (typeof currentOrder.notes === 'string') {
      try {
        notesParsed = JSON.parse(currentOrder.notes)
      } catch (_) {}
    } else if (currentOrder.notes && typeof currentOrder.notes === 'object') {
      notesParsed = currentOrder.notes
    }

    const newPaid = currentPaid + immediatelyPaid
    const newCredit = currentCredit + creditPart
    const isSoldOut = (newPaid + newCredit) >= currentTotal

    // Charger les lignes depuis notes.lines ou sales_order_items
    let orderLines: any[] = Array.isArray(notesParsed.lines) ? notesParsed.lines : []
    if (orderLines.length === 0) {
      const { data: dbOrderItems } = await supabase
        .from('sales_order_items')
        .select('*')
        .eq('order_id', params.orderId)
      if (dbOrderItems && dbOrderItems.length > 0) {
        orderLines = dbOrderItems.map((it: any) => ({
          product: {
            id: it.product_id,
            name: it.product_name,
            cost_price: it.unit_cost,
            is_recipe: false
          },
          qty: it.quantity,
          unitPrice: it.unit_price
        }))
      }
    }

    const productsToDeduct: Array<{
      prodId: string
      prodName: string
      qty: number
      unitCost: number
      curStockVente: number
      curCurrentStock: number
      curMeta: any
    }> = []

    if (!notesParsed.stock_already_deducted && orderLines.length > 0 && isSoldOut) {
      const physicalLines = orderLines.filter((l: any) => !l.product?.is_recipe && isValidUUID(l.product?.id || l.product_id))
      for (const line of physicalLines) {
        const prodId = String(line.product?.id || line.product_id)
        const qty = Number(line.qty ?? line.quantity ?? 1)
        if (!prodId || qty <= 0) continue

        const { data: prodData, error: pErr } = await supabase
          .from('products')
          .select('id, name, stock_vente, stock_magasin, sector_meta, cost_price')
          .eq('id', prodId)
          .eq('company_id', params.companyId)
          .maybeSingle()

        if (pErr || !prodData) {
          return {
            success: false,
            error: `Article introuvable en stock lors de la validation : "${line.product?.name || prodId}".`
          }
        }

        const curMeta = prodData.sector_meta || {}
        const curStockVente = Number(prodData.stock_vente ?? curMeta.stock_vente ?? 0)
        const curCurrentStock = curStockVente

        if (curStockVente < qty) {
          return {
            success: false,
            error: `Stock vente insuffisant pour "${prodData.name}" : demandé ${qty}, disponible ${curStockVente}.`
          }
        }

        productsToDeduct.push({
          prodId,
          prodName: prodData.name,
          qty,
          unitCost: Number(line.product?.cost_price ?? prodData.cost_price ?? 0),
          curStockVente,
          curCurrentStock,
          curMeta
        })
      }
    }

    // 6. PRÉPARATION DE LA MISE À JOUR ATOMIQUE DE LA COMMANDE
    previousOrderSnapshot = {
      paid_amount: currentOrder.paid_amount,
      credit_amount: currentOrder.credit_amount,
      status: currentOrder.status,
      payment_status: currentOrder.payment_status,
      payment_method: currentOrder.payment_method,
      cash_session_id: currentOrder.cash_session_id,
      customer_id: currentOrder.customer_id,
      customer_name: currentOrder.customer_name,
      notes: currentOrder.notes
    }

    const transRef = `ENC-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    const nowIso = new Date().toISOString()

    const encaissementHistorique = Array.isArray(notesParsed.encaissements) ? [...notesParsed.encaissements] : []
    encaissementHistorique.push({
      transaction_ref: transRef,
      caisse_id: validCaisseId,
      caisse_session_id: validCashSessionId,
      cashier_id: params.cashierId,
      cashier_name: params.cashierName,
      amount: immediatelyPaid,
      credit_amount: creditPart,
      total_settled: totalSettledNow,
      payment_method: breakdown.length > 1 ? 'mixte' : breakdown[0].method,
      payments: breakdown,
      date: nowIso
    })

    const updatedNotes: any = {
      ...notesParsed,
      lines: orderLines,
      encaissements: encaissementHistorique,
      payment_breakdown: breakdown,
      payments: breakdown,
      encaisse_par: params.cashierName,
      encaisse_par_id: params.cashierId,
      date_dernier_encaissement: nowIso,
      derniere_transaction_ref: transRef,
      stock_already_deducted: notesParsed.stock_already_deducted || (isSoldOut && productsToDeduct.length > 0)
    }
    if (params.notes) {
      updatedNotes.cashier_notes = params.notes
    }

    const newStatus = isSoldOut ? 'COMPLET' : 'partiellement_paye'
    const effectivePaymentMethod = breakdown.length > 1 ? 'mixte' : breakdown[0].method
    let newPaymentStatus = 'partiel'
    if (isSoldOut) {
      if (creditPart > 0 && newPaid === 0) {
        newPaymentStatus = 'credit'
      } else if (creditPart > 0 && newPaid > 0) {
        newPaymentStatus = 'partiel'
      } else if (breakdown.length > 1) {
        newPaymentStatus = 'mixte'
      } else if (breakdown[0].method === 'especes') {
        newPaymentStatus = 'espece'
      } else {
        newPaymentStatus = breakdown[0].method
      }
    }

    const { error: updateErr } = await supabase
      .from('sales_orders')
      .update({
        paid_amount: newPaid,
        credit_amount: newCredit,
        status: newStatus,
        payment_status: newPaymentStatus,
        payment_method: effectivePaymentMethod,
        cash_session_id: validCashSessionId,
        customer_id: effectiveCustomerId || currentOrder.customer_id || null,
        customer_name: effectiveCustomerName || currentOrder.customer_name || 'Client Comptoir',
        notes: JSON.stringify(updatedNotes)
      })
      .eq('id', params.orderId)
      .eq('company_id', params.companyId)

    if (updateErr) {
      throw new Error(`Erreur mise à jour commande : ${updateErr.message}`)
    }
    orderUpdated = true

    if (params._simulateFailureAtStep === 'after_order_update') {
      throw new Error('Échec simulé après mise à jour de la commande (Test d\'atomicité)')
    }

    // 7. DÉSTOCKAGE SYNCHRONISÉ (Colonne SQL stock_vente + sector_meta.stock_vente + stock_movements)
    if (productsToDeduct.length > 0) {
      for (const item of productsToDeduct) {
        const newStockVente = Math.max(0, Math.round((item.curStockVente - item.qty) * 1000) / 1000)
        const newCurrentStock = Math.max(0, Math.round((item.curCurrentStock - item.qty) * 1000) / 1000)

        const { error: stockUpdErr } = await supabase
          .from('products')
          .update({
            stock_vente: newStockVente,
            sector_meta: { ...item.curMeta, stock_vente: newStockVente },
            updated_at: nowIso
          })
          .eq('id', item.prodId)
          .eq('company_id', params.companyId)

        if (stockUpdErr) {
          throw new Error(`Erreur mise à jour du stock pour "${item.prodName}" : ${stockUpdErr.message}`)
        }

        stockRollbacks.push({
          prodId: item.prodId,
          prevStockVente: item.curStockVente,
          prevCurrentStock: item.curCurrentStock,
          prevMeta: item.curMeta
        })

        const { data: insertedMvt, error: mvtErr } = await supabase
          .from('stock_movements')
          .insert({
            company_id: params.companyId,
            sector_slug: cleanSector,
            product_id: item.prodId,
            movement_type: 'VENTE_BON_COMMANDE',
            reference_type: 'sales_order',
            reference_id: params.orderId,
            reference_number: currentOrder.order_number,
            quantity: -item.qty,
            previous_stock: item.curStockVente,
            new_stock: newStockVente,
            unit_cost: item.unitCost,
            total_cost: Math.round(item.qty * item.unitCost),
            notes: `Encaissement Bon ${currentOrder.order_number} par ${params.cashierName}`
          })
          .select('id')
          .maybeSingle()

        if (mvtErr) {
          throw new Error(`Erreur création mouvement de stock pour "${item.prodName}" : ${mvtErr.message}`)
        }
        if (insertedMvt?.id) {
          insertedStockMovementIds.push(insertedMvt.id)
        }
      }

      invalidateCache('prods_')
    }

    if (params._simulateFailureAtStep === 'after_stock_update') {
      throw new Error('Échec simulé après déstockage (Test d\'atomicité)')
    }

    // 8. CRÉATION AUTOMATIQUE DE LA CRÉANCE CLIENT (UNIQUEMENT POUR LA PART CRÉDIT > 0, SANS DOUBLON)
    if (creditPart > 0 && effectiveCustomerId && customerRecord) {
      // Vérifier qu'aucune créance n'a déjà été créée pour cette commande
      const alreadyCreatedDebtId = notesParsed.created_debt_id || null
      if (!alreadyCreatedDebtId) {
        const dueDateStr = params.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

        const { data: insertedDebt, error: debtErr } = await supabase
          .from('client_debts')
          .insert({
            company_id: params.companyId,
            sector_code: cleanSector,
            client_id: effectiveCustomerId,
            total_dette: creditPart,
            total_rembourse: 0,
            solde_du: creditPart,
            status: 'en_cours',
            created_at: nowIso,
            updated_at: nowIso
          })
          .select('id')
          .single()

        if (debtErr || !insertedDebt?.id) {
          throw new Error(`Erreur lors de l'enregistrement de la créance client : ${debtErr?.message || 'Échec insertion client_debts'}`)
        }

        createdDebtId = insertedDebt.id

        // Enregistrer également le lien facture <-> créance dans creances_clients si disponible
        try {
          await supabase.from('creances_clients').insert({
            company_id: params.companyId,
            client_id: effectiveCustomerId,
            facture_id: params.orderId,
            montant_initial_ttc: creditPart,
            montant_restant_ttc: creditPart,
            statut: newPaid > 0 ? 'partiel' : 'impayé',
            created_at: nowIso
          })
        } catch (_) {}

        // Enrichir les notes de la commande avec la traçabilité de la créance
        updatedNotes.created_debt_id = createdDebtId
        updatedNotes.debt_reference = currentOrder.order_number
        updatedNotes.debt_due_date = dueDateStr
        await supabase
          .from('sales_orders')
          .update({ notes: JSON.stringify(updatedNotes) })
          .eq('id', params.orderId)
          .eq('company_id', params.companyId)

        // Mettre à jour le solde débiteur du client dans public.customers
        const prevCustomerDebt = Number(customerRecord.current_debt || 0)
        const nextCustomerDebt = Math.round(prevCustomerDebt + creditPart)

        const { error: custUpdErr } = await supabase
          .from('customers')
          .update({
            current_debt: nextCustomerDebt,
            updated_at: nowIso
          })
          .eq('id', effectiveCustomerId)
          .eq('company_id', params.companyId)

        if (custUpdErr) {
          throw new Error(`Erreur lors de la mise à jour du solde client : ${custUpdErr.message}`)
        }

        updatedCustomerDebtInfo = {
          customerId: effectiveCustomerId,
          previousDebt: prevCustomerDebt
        }
      } else {
        createdDebtId = alreadyCreatedDebtId
      }
    }

    if (params._simulateFailureAtStep === 'after_debt_insert') {
      throw new Error('Échec simulé après création de la créance (Test d\'atomicité)')
    }

    // 9. ENREGISTREMENT DES MOUVEMENTS DE TRÉSORERIE & CAISSE (UNIQUEMENT POUR LES SOMMES EFFECTIVEMENT ENCAISSÉES)
    // RÈGLE FONDAMENTALE : Le crédit n'augmente JAMAIS les espèces ni le Mobile Money !
    const sellerName = notesParsed.seller_name || notesParsed.serveur_nom || 'Vendeur'
    const modeLabel = breakdown.map(b => `${b.method.toUpperCase()}: ${b.amount}`).join(' + ')

    if (paidCash > 0 || paidMomo > 0) {
      await enregistrerMouvementCaisse({
        company_id: params.companyId,
        sector_slug: cleanSector,
        caisse_id: validCaisseId || undefined,
        caisse_session_id: validCashSessionId,
        type: 'vente',
        sens: 'entree',
        montant_especes: paidCash,
        montant_momo: paidMomo,
        source_module: 'bon_de_commande',
        source_id: currentOrder.order_number,
        motif: `Encaissement Bon ${currentOrder.order_number} (${modeLabel}) - Vendeur: ${sellerName}`,
        user_name: params.cashierName,
        user_id: params.cashierId
      })
    }

    if (paidCash > 0) {
      await enregistrerEntreeCaisse({
        company_id: params.companyId,
        secteur_id: cleanSector,
        caisse_id: validCaisseId || null,
        montant: paidCash,
        mode_paiement: 'espece',
        source: 'VENTE',
        reference_id: transRef
      })
    }

    if (paidMomo > 0) {
      await enregistrerEntreeCaisse({
        company_id: params.companyId,
        secteur_id: cleanSector,
        caisse_id: validCaisseId || null,
        montant: paidMomo,
        mode_paiement: 'mtn_momo',
        source: 'VENTE',
        reference_id: transRef
      })
    }

    // 10. COMPTABILISATION AUTOMATIQUE SYSCOHADA (JV + JC/JB)
    try {
      await comptabiliserVenteAuto({
        companyId: params.companyId,
        sectorSlug: cleanSector,
        saleId: params.orderId,
        orderNumber: currentOrder.order_number,
        orderDate: currentOrder.order_date,
        totalTtc: currentTotal,
        tvaAmount: Number(currentOrder.tva_amount || 0),
        aibAmount: Number(currentOrder.aib_amount || 0),
        customerName: effectiveCustomerName || 'Client Comptoir',
        customerId: effectiveCustomerId,
        paymentMethod: effectivePaymentMethod,
        paymentStatus: newPaymentStatus,
        paidAmount: newPaid,
        creditAmount: newCredit,
        createdById: isValidUUID(params.cashierId) ? params.cashierId : null,
        isMultiPayment: breakdown.length > 1,
        payments: breakdown
          .filter(b => b.method !== 'credit' && b.amount > 0)
          .map(b => ({ method: b.method, amount: b.amount }))
      })
    } catch (comptaErr) {
      console.warn('[salesCircuitService] Avertissement comptabilisation auto:', comptaErr)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gestio:bon_encaisse', { detail: { orderId: params.orderId, transactionRef: transRef } }))
      window.dispatchEvent(new CustomEvent('gestio:transaction_created'))
    }

    return {
      success: true,
      transactionRef: transRef,
      cashSessionId: validCashSessionId,
      paidCash,
      paidMomo,
      paidBankCard,
      creditAmount: creditPart,
      debtId: createdDebtId
    }
  } catch (err: any) {
    console.error('[salesCircuitService] Exception encaisserBonDeCommande — déclenchement du rollback:', err)

    // COMPENSATION ATOMIQUE (ROLLBACK) EN CAS D'ÉCHEC PARTIEL
    try {
      if (updatedCustomerDebtInfo) {
        await supabase
          .from('customers')
          .update({ current_debt: updatedCustomerDebtInfo.previousDebt })
          .eq('id', updatedCustomerDebtInfo.customerId)
          .eq('company_id', params.companyId)
      }
      if (createdDebtId) {
        await supabase
          .from('client_debts')
          .delete()
          .eq('id', createdDebtId)
          .eq('company_id', params.companyId)
      }
      if (insertedStockMovementIds.length > 0) {
        await supabase
          .from('stock_movements')
          .delete()
          .in('id', insertedStockMovementIds)
      }
      for (const rb of stockRollbacks) {
        await supabase
          .from('products')
          .update({
            stock_vente: rb.prevStockVente,
            sector_meta: rb.prevMeta
          })
          .eq('id', rb.prodId)
          .eq('company_id', params.companyId)
      }
      if (orderUpdated && previousOrderSnapshot) {
        await supabase
          .from('sales_orders')
          .update(previousOrderSnapshot)
          .eq('id', params.orderId)
          .eq('company_id', params.companyId)
      }
    } catch (rollbackErr) {
      console.error('[salesCircuitService] Erreur lors du rollback compensatoire:', rollbackErr)
    }

    return {
      success: false,
      error: err.message || 'Impossible de valider l\'encaissement'
    }
  } finally {
    inFlightEncaissements.delete(params.orderId)
  }
}

// ─── 6. ANNULATION D'UN BON EN ATTENTE (AVEC TRACE D'AUDIT) ───────────────────

export async function annulerBonDeCommande(
  orderId: string,
  companyId: string,
  motif: string,
  userName: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!orderId) return { success: false, error: 'Identifiant bon manquant' }

  try {
    const { data: order, error: fetchErr } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .single()

    if (fetchErr || !order) {
      return { success: false, error: 'Bon introuvable' }
    }

    if (Number(order.paid_amount || 0) > 0 || Number(order.credit_amount || 0) > 0 || order.status === 'COMPLET') {
      return { success: false, error: 'Impossible d\'annuler un bon ayant déjà fait l\'objet d\'un encaissement ou d\'une validation à crédit' }
    }

    let notesParsed: any = {}
    if (typeof order.notes === 'string') {
      try {
        notesParsed = JSON.parse(order.notes)
      } catch (_) {}
    } else if (order.notes && typeof order.notes === 'object') {
      notesParsed = order.notes
    }

    const updatedNotes = {
      ...notesParsed,
      annule_le: new Date().toISOString(),
      annule_par: userName,
      annule_par_id: userId,
      motif_annulation: motif
    }

    const { error: updErr } = await supabase
      .from('sales_orders')
      .update({
        status: 'ANNULE',
        payment_status: 'annule',
        notes: JSON.stringify(updatedNotes)
      })
      .eq('id', orderId)
      .eq('company_id', companyId)

    if (updErr) throw updErr

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gestio:bon_annule', { detail: { orderId } }))
    }

    return { success: true }
  } catch (err: any) {
    console.error('[salesCircuitService] Exception annulerBonDeCommande:', err)
    return { success: false, error: err.message || 'Impossible d\'annuler le bon' }
  }
}
