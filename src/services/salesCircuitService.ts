// =============================================================================
// GESTIO 229 SaaS — Service Circuit de Vente et d'Encaissement Multi-Secteurs
// =============================================================================
// Supporte 2 modes configurables par entreprise :
// - MODE 1 : 'INTEGRE' (Vente et encaissement par le même utilisateur - Défaut)
// - MODE 2 : 'SEPARE_VENDEUR_CAISSIERE' (Séparation entre vendeur et caissière)
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'
import { enregistrerEntreeCaisse } from './caisseDepensesService'
import { invalidateCache } from '../utils/cache'

export type SalesCircuitMode = 'INTEGRE' | 'SEPARE_VENDEUR_CAISSIERE'

export interface PendingBonItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
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
  total_amount: number
  paid_amount: number
  remaining_balance: number
  payment_status: string
  status: string
  notes?: any
  items: PendingBonItem[]
  stock_already_deducted?: boolean
}

// ─── 1. GESTION PERSISTANTE DU MODE DE CIRCUIT PAR ENTREPRISE ────────────────

const CIRCUIT_STORAGE_PREFIX = 'gestio229_sales_circuit_'

/**
 * Récupère le mode de circuit de vente configuré pour l'entreprise
 * Priorité : Supabase (companies.sales_circuit_mode) -> localStorage -> Défaut 'INTEGRE'
 */
export async function getSalesCircuitMode(companyId: string): Promise<SalesCircuitMode> {
  if (!companyId) return 'INTEGRE'

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('sales_circuit_mode' as any)
      .eq('id', companyId)
      .maybeSingle()

    if (!error && (data as any)?.sales_circuit_mode) {
      const mode = (data as any).sales_circuit_mode as SalesCircuitMode
      if (mode === 'INTEGRE' || mode === 'SEPARE_VENDEUR_CAISSIERE') {
        try {
          localStorage.setItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}`, mode)
        } catch (_) {}
        return mode
      }
    }
  } catch (err) {
    // Colonne inexistante en base ou problème réseau, fallback local
    console.warn('[salesCircuitService] Fallback lecture mode circuit:', err)
  }

  try {
    const local = localStorage.getItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}`)
    if (local === 'INTEGRE' || local === 'SEPARE_VENDEUR_CAISSIERE') {
      return local
    }
  } catch (_) {}

  return 'INTEGRE'
}

/**
 * Enregistre le choix du mode de circuit pour l'entreprise
 */
export async function setSalesCircuitMode(
  companyId: string,
  mode: SalesCircuitMode
): Promise<{ success: boolean; error?: string }> {
  if (!companyId) return { success: false, error: 'Identifiant entreprise manquant' }

  try {
    localStorage.setItem(`${CIRCUIT_STORAGE_PREFIX}${companyId}`, mode)
  } catch (_) {}

  try {
    const { error } = await supabase
      .from('companies')
      .update({
        sales_circuit_mode: mode,
        updated_at: new Date().toISOString()
      } as any)
      .eq('id', companyId)

    if (error) {
      console.warn('[salesCircuitService] Mise à jour base ignorée (colonne optionnelle):', error.message)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gestio:sales_circuit_changed', { detail: { mode, companyId } }))
    }

    return { success: true }
  } catch (err: any) {
    console.warn('[salesCircuitService] Exception setSalesCircuitMode:', err)
    return { success: true }
  }
}

// ─── 2. VÉRIFICATION DES OPÉRATIONS EN COURS AVANT CHANGEMENT DE MODE ────────

/**
 * Compte le nombre de bons en attente d'encaissement pour l'entreprise
 */
export async function getPendingBonsCount(companyId: string, sectorSlug?: string): Promise<number> {
  if (!companyId) return 0

  try {
    let query = supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or('status.eq.pending_cashier,status.eq.partiellement_paye,payment_status.eq.en_attente')

    if (sectorSlug) {
      const clean = sectorSlug.replace(/^sec-/, '').toLowerCase()
      query = query.eq('sector_slug', clean)
    }

    const { count, error } = await query
    if (error) {
      console.warn('[salesCircuitService] Erreur comptage bons:', error.message)
      return 0
    }

    return count || 0
  } catch (err) {
    console.warn('[salesCircuitService] Exception getPendingBonsCount:', err)
    return 0
  }
}

// ─── 3. RÉCUPÉRATION DES BONS EN ATTENTE D'ENCAISSEMENT ───────────────────────

/**
 * Charge tous les bons en attente pour la caissière
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
      const clean = sectorSlug.replace(/^sec-/, '').toLowerCase()
      query = query.eq('sector_slug', clean)
    }

    const { data, error } = await query

    if (error) {
      console.error('[salesCircuitService] Erreur fetchPendingBons:', error)
      return []
    }

    return (data || []).map((order: any) => {
      let notesParsed: any = {}
      if (typeof order.notes === 'string') {
        try {
          notesParsed = JSON.parse(order.notes)
        } catch (_) {}
      } else if (order.notes && typeof order.notes === 'object') {
        notesParsed = order.notes
      }

      // Extraction des items
      let items: PendingBonItem[] = []
      if (Array.isArray(notesParsed.lines)) {
        items = notesParsed.lines.map((l: any) => ({
          product_id: l.product?.id || l.product_id || '',
          product_name: l.product?.name || l.product_name || 'Article',
          quantity: Number(l.qty || l.quantity || 1),
          unit_price: Number(l.unitPrice || l.unit_price || 0),
          total_ttc: Number(l.total_ttc || (l.qty * l.unitPrice) || 0),
          unit_cost: Number(l.product?.cost_price || l.unit_cost || 0),
          coef: Number(l.product?.coef || 1),
          is_recipe: Boolean(l.product?.is_recipe)
        }))
      }

      const totalAmount = Number(order.total_amount || 0)
      const paidAmount = Number(order.paid_amount || 0)
      const remainingBalance = Math.max(0, totalAmount - paidAmount)

      return {
        id: order.id,
        order_number: order.order_number,
        company_id: order.company_id,
        sector_slug: order.sector_slug,
        customer_id: order.customer_id,
        customer_name: order.customer_name || notesParsed.customer_name || 'Client Comptoir',
        seller_id: order.created_by,
        seller_name: notesParsed.seller_name || notesParsed.serveur_nom || 'Vendeur',
        created_at: order.created_at,
        total_amount: totalAmount,
        paid_amount: paidAmount,
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
 * Crée un Bon de Commande validé et le transmet directement à la caisse
 */
export async function creerEtTransmettreBon(
  params: TransmitBonParams
): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string }> {
  try {
    const rawSector = (params.sector_slug || 'GEN').replace(/^sec-/, '')
    const secteurCode = rawSector.substring(0, 3).toUpperCase()
    let dateStr = ''
    try {
      dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' }).replace(/-/g, '')
    } catch {
      dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    }
    const randStr = Math.random().toString(36).substring(2, 6).toUpperCase()
    const timeStr = Date.now().toString().slice(-4)
    const orderNum = `BC-${secteurCode}-${dateStr}-${timeStr}-${randStr}`

    const notesPayload = {
      sector_slug: params.sector_slug,
      seller_id: params.seller_id,
      seller_name: params.seller_name,
      customer_name: params.customer_name || 'Client Comptoir',
      transmitted_to_caisse: true,
      transmitted_at: new Date().toISOString(),
      stock_already_deducted: false, // Le déstockage aura lieu à l'encaissement effectif
      notes_extra: params.notes_extra || null,
      lines: params.items.map(i => ({
        product: {
          id: i.product.id,
          code: i.product.code,
          name: i.product.name,
          cost_price: i.product.cost_price,
          selling_price: i.unitPrice,
          coef: i.product.coef,
          is_recipe: i.product.is_recipe
        },
        qty: i.qty,
        unitPrice: i.unitPrice,
        discount: i.discount || 0
      }))
    }

    const todayDate = new Date().toISOString().split('T')[0]

    const salePayload = {
      company_id: params.company_id,
      order_number: orderNum,
      order_type: 'bon_de_commande',
      order_date: todayDate,
      subtotal_ht: params.total_ht,
      tva_amount: params.total_tva,
      aib_amount: params.total_aib,
      total_amount: params.total_ttc,
      total_cost: 0,
      paid_amount: 0,
      credit_amount: 0,
      payment_status: 'en_attente',
      status: 'pending_cashier',
      sector_slug: params.sector_slug.replace(/^sec-/, '').toLowerCase(),
      created_by: params.seller_id || null,
      customer_name: params.customer_name || 'Client Comptoir',
      customer_id: params.customer_id || null,
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

    // Enregistrement des lignes d'articles
    const lineItems = params.items.map(line => ({
      order_id: savedOrder.id,
      product_id: line.product.id,
      product_name: line.product.name,
      quantity: line.qty,
      unit_price: line.unitPrice,
      unit_cost: Number(line.product.cost_price || 0),
      tva_rate: 0,
      total_ht: Math.round(line.qty * line.unitPrice),
      total_ttc: Math.round(line.qty * line.unitPrice),
      company_id: params.company_id,
      sector_slug: params.sector_slug.replace(/^sec-/, '').toLowerCase()
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

export interface EncaisserBonParams {
  orderId: string
  companyId: string
  sectorSlug: string
  caisseId?: string | null
  caisseSessionId?: string | null
  cashierId: string
  cashierName: string
  montantEncaisse: number
  modePaiement: 'especes' | 'momo_mtn' | 'momo_moov' | 'wave' | 'banque' | 'carte'
  notes?: string
}

/**
 * Encaisse un bon de commande avec vérification de concurrence et anti-double-clic
 */
export async function encaisserBonDeCommande(
  params: EncaisserBonParams
): Promise<{ success: boolean; transactionRef?: string; error?: string }> {
  if (!params.orderId) return { success: false, error: 'Identifiant du bon manquant' }
  if (params.montantEncaisse <= 0) return { success: false, error: 'Le montant à encaisser doit être supérieur à zéro' }

  try {
    // 1. CONTRÔLE DE CONCURRENCE : Relecture immédiate en base
    const { data: currentOrder, error: fetchErr } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', params.orderId)
      .eq('company_id', params.companyId)
      .single()

    if (fetchErr || !currentOrder) {
      return { success: false, error: 'Le bon de commande est introuvable ou n\'appartient pas à votre entreprise' }
    }

    const currentTotal = Number(currentOrder.total_amount || 0)
    const currentPaid = Number(currentOrder.paid_amount || 0)
    const remaining = Math.max(0, currentTotal - currentPaid)

    // Vérifier si le bon a déjà été totalement encaissé par une autre caissière
    if (remaining <= 0 || (currentOrder.status === 'COMPLET' && currentPaid >= currentTotal)) {
      return {
        success: false,
        error: `Ce bon (${currentOrder.order_number}) a déjà été entièrement encaissé par une autre session.`
      }
    }

    // Le montant saisi ne peut pas dépasser le solde restant
    const montantValide = Math.min(params.montantEncaisse, remaining)
    const newPaid = currentPaid + montantValide
    const isSoldOut = newPaid >= currentTotal

    // Référence unique de transaction d'encaissement
    const transRef = `ENC-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    // Parsing et enrichissement des notes
    let notesParsed: any = {}
    if (typeof currentOrder.notes === 'string') {
      try {
        notesParsed = JSON.parse(currentOrder.notes)
      } catch (_) {}
    } else if (currentOrder.notes && typeof currentOrder.notes === 'object') {
      notesParsed = currentOrder.notes
    }

    const encaissementHistorique = Array.isArray(notesParsed.encaissements) ? [...notesParsed.encaissements] : []
    encaissementHistorique.push({
      transaction_ref: transRef,
      caisse_id: params.caisseId,
      caisse_session_id: params.caisseSessionId,
      cashier_id: params.cashierId,
      cashier_name: params.cashierName,
      amount: montantValide,
      payment_method: params.modePaiement,
      date: new Date().toISOString()
    })

    const updatedNotes = {
      ...notesParsed,
      encaissements: encaissementHistorique,
      encaisse_par: params.cashierName,
      encaisse_par_id: params.cashierId,
      date_dernier_encaissement: new Date().toISOString(),
      derniere_transaction_ref: transRef
    }

    // 2. MISE À JOUR DU STATUT DU BON DE COMMANDE
    const newStatus = isSoldOut ? 'COMPLET' : 'partiellement_paye'
    const newPaymentStatus = isSoldOut
      ? (params.modePaiement === 'especes' ? 'espece' : params.modePaiement)
      : 'partiel'

    const { error: updateErr } = await supabase
      .from('sales_orders')
      .update({
        paid_amount: newPaid,
        status: newStatus,
        payment_status: newPaymentStatus,
        payment_method: params.modePaiement,
        cash_session_id: params.caisseSessionId || currentOrder.cash_session_id || null,
        notes: JSON.stringify(updatedNotes)
      })
      .eq('id', params.orderId)

    if (updateErr) {
      throw new Error(`Erreur mise à jour commande: ${updateErr.message}`)
    }

    // 3. ENREGISTREMENT DES MOUVEMENTS DE TRÉSORERIE & CAISSE
    const isEspeces = params.modePaiement === 'especes'
    const isMomo = ['momo_mtn', 'momo_moov', 'mtn_momo', 'wave'].includes(params.modePaiement)
    const paidCash = isEspeces ? montantValide : 0
    const paidMomo = isMomo ? montantValide : 0

    const sellerName = notesParsed.seller_name || notesParsed.serveur_nom || 'Vendeur'

    await enregistrerMouvementCaisse({
      company_id: params.companyId,
      sector_slug: params.sectorSlug,
      caisse_id: params.caisseId || null,
      caisse_session_id: params.caisseSessionId || null,
      type: 'vente',
      sens: 'entree',
      montant_especes: paidCash,
      montant_momo: paidMomo,
      source_module: 'bon_de_commande',
      source_id: currentOrder.order_number,
      reference_id: transRef,
      motif: `Encaissement Bon ${currentOrder.order_number} (${params.modePaiement.toUpperCase()}) - Vendeur: ${sellerName}`,
      user_name: params.cashierName,
      user_id: params.cashierId
    })

    if (paidCash > 0) {
      await enregistrerEntreeCaisse({
        company_id: params.companyId,
        secteur_id: params.sectorSlug,
        caisse_id: params.caisseId || null,
        montant: paidCash,
        mode_paiement: 'espece',
        source: 'VENTE',
        reference_id: transRef
      })
    } else if (paidMomo > 0) {
      await enregistrerEntreeCaisse({
        company_id: params.companyId,
        secteur_id: params.sectorSlug,
        caisse_id: params.caisseId || null,
        montant: paidMomo,
        mode_paiement: 'mtn_momo',
        source: 'VENTE',
        reference_id: transRef
      })
    }

    // 4. GESTION DU STOCK SANS DOUBLE COMPTAGE
    // Si le bon n'a pas encore déstocké, on effectue le déstockage des produits physiques
    if (!notesParsed.stock_already_deducted && Array.isArray(notesParsed.lines) && isSoldOut) {
      try {
        const physicalItems = notesParsed.lines.filter((l: any) => !l.product?.is_recipe)
        for (const line of physicalItems) {
          const prodId = line.product?.id
          const qty = Number(line.qty || 1)
          if (!prodId || qty <= 0) continue

          const { data: prodData } = await supabase
            .from('products')
            .select('id, sector_meta, stock_vente')
            .eq('id', prodId)
            .maybeSingle()

          if (prodData) {
            const curMeta = prodData.sector_meta || {}
            const curStock = Number(prodData.stock_vente ?? curMeta.stock_vente ?? 0)
            const newStock = Math.max(0, Math.round((curStock - qty) * 1000) / 1000)
            await supabase
              .from('products')
              .update({
                sector_meta: { ...curMeta, stock_vente: newStock },
                updated_at: new Date().toISOString()
              })
              .eq('id', prodId)

            // Tracé mouvement de stock
            await supabase.from('stock_movements').insert({
              company_id: params.companyId,
              sector_slug: params.sectorSlug,
              product_id: prodId,
              movement_type: 'VENTE_BON_COMMANDE',
              reference_type: 'sales_order',
              reference_id: params.orderId,
              reference_number: currentOrder.order_number,
              quantity: -qty,
              previous_stock: curStock,
              new_stock: newStock,
              unit_cost: Number(line.product?.cost_price || 0),
              total_cost: Math.round(qty * Number(line.product?.cost_price || 0)),
              notes: `Encaissement Bon ${currentOrder.order_number} par ${params.cashierName}`
            })
          }
        }

        // Marquer le déstockage comme effectué
        updatedNotes.stock_already_deducted = true
        await supabase
          .from('sales_orders')
          .update({ notes: JSON.stringify(updatedNotes) })
          .eq('id', params.orderId)

        invalidateCache('prods_')
      } catch (stockErr) {
        console.warn('[salesCircuitService] Avertissement déstockage à l\'encaissement:', stockErr)
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gestio:bon_encaisse', { detail: { orderId: params.orderId, transactionRef: transRef } }))
      window.dispatchEvent(new CustomEvent('gestio:transaction_created'))
    }

    return {
      success: true,
      transactionRef: transRef
    }
  } catch (err: any) {
    console.error('[salesCircuitService] Exception encaisserBonDeCommande:', err)
    return { success: false, error: err.message || 'Impossible de valider l\'encaissement' }
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

    if (Number(order.paid_amount || 0) > 0) {
      return { success: false, error: 'Impossible d\'annuler un bon ayant déjà fait l\'objet d\'un encaissement partiel ou total' }
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
