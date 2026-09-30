// =============================================================================
// GESTIO 229 SaaS — Gestion des Stocks & Inventaire (Norme Bénin/UEMOA)
// Double Stock (Magasin UCD & Vente UV), Transferts avec traçabilité,
// Inventaire physique avec calcul automatique des écarts, Valorisation Achat & Vente
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Package, Plus, Search, AlertTriangle, CheckCircle, RefreshCw,
  Printer, ArrowRightLeft, ClipboardCheck, FileSpreadsheet, Download,
  Check, X, ArrowUpRight, ArrowDownRight, Layers, DollarSign,
  Edit2, Trash2, Calendar, FileText
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector } from '../../../lib/sectorClient'
import { NewProductModal, StockSheetModal, ModalPortal } from '../../../components/modals'
import { formatFCFA } from '../../../utils/tax'
import { logAuditEvent } from '../../../services/auditService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

interface ProductStock {
  id: string
  code: string
  name: string
  unit: string
  ucd?: string
  uv?: string
  coef?: number
  cost_price: number    // Prix d'achat TTC
  selling_price: number // Prix de vente TTC
  stock_magasin: number // Stock principal / Réserve (UCD)
  stock_vente: number   // Stock rayon / Point de vente (UV)
  min_stock_alert: number
  category?: { name: string }
  batch_pricing?: any
  sector_meta?: any
}

interface InventoryItem {
  productId: string
  code: string
  name: string
  unit: string
  stockTheorique: number
  stockPhysique: number
  ecart: number
  valeurEcart: number
  observation?: string
}

export interface InventoryHistoryRecord {
  id: string
  date: string
  validated_by: string
  items_count: number
  total_ecart_valeur: number
  items: InventoryItem[]
}

interface DailyStockRow {
  productId: string
  code: string
  name: string
  unit: string
  stockInitial: number
  entrees: number
  sorties: number
  stockFinal: number
  valeurAchat: number
  valeurVente: number
}

export const StocksPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  const [activeTab, setActiveTab] = useState<'double_stock' | 'inventaire' | 'fiche_journaliere'>('double_stock')

  const [products, setProducts] = useState<ProductStock[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showNewProductModal, setShowNewProductModal] = useState(false)
  const [showStockSheetModal, setShowStockSheetModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showValuationModal, setShowValuationModal] = useState(false)

  // État Transfert (Direction & Paramètres)
  const [transferDirection, setTransferDirection] = useState<'magasin_to_vente' | 'vente_to_magasin'>('magasin_to_vente')
  const [transferProdId, setTransferProdId] = useState('')
  const [transferQty, setTransferQty] = useState<number>(0)
  const [transferMotif, setTransferMotif] = useState('Réapprovisionnement Rayon Vente POS')

  // État Transfert en Masse (Plusieurs produits)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false)
  const [bulkTransferQtys, setBulkTransferQtys] = useState<Record<string, number>>({})
  const [bulkTransferMotif, setBulkTransferMotif] = useState('Réapprovisionnement Rayon Vente POS')
  const [isProcessingBulkTransfer, setIsProcessingBulkTransfer] = useState(false)

  // Édition rapide de produit
  const [editingProduct, setEditingProduct] = useState<ProductStock | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    cost_price: number
    selling_price: number
    min_stock_alert: number
    stock_magasin: number
    stock_vente: number
  }>({ name: '', cost_price: 0, selling_price: 0, min_stock_alert: 5, stock_magasin: 0, stock_vente: 0 })

  // Filtres de Date Fiche Journalière de Stock
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'single' | 'period'>('today')
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [periodSalesItems, setPeriodSalesItems] = useState<Record<string, number>>({})

  // État Inventaire Physique & Historique
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([])
  const [inventoryHistory, setInventoryHistory] = useState<InventoryHistoryRecord[]>([])
  const [selectedHistoryForPrint, setSelectedHistoryForPrint] = useState<InventoryHistoryRecord | null>(null)
  const [showHistoryPrintModal, setShowHistoryPrintModal] = useState(false)

  // ─── Chargement réel depuis Supabase (zéro donnée fictive) ──────────────────

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:product_categories(id, name)')
        .eq('company_id', company.id)
        .neq('is_active', false)
        .order('name')

      if (error) throw error

      // Isolation stricte par sous-logiciel (aucun mélange de données)
      const sectorFilteredData = filterItemsForSector(data || [], currentSectorSlug)

      const mapped: ProductStock[] = sectorFilteredData.map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit || p.uv || p.sector_meta?.uv || 'Pièce',
        ucd: p.ucd || p.sector_meta?.ucd || 'Carton',
        uv: p.uv || p.sector_meta?.uv || p.unit || 'Pièce',
        coef: Number(p.coef || p.sector_meta?.coef) || 1,
        cost_price: Number(p.cost_price) || 0,
        selling_price: Number(p.selling_price) || 0,
        stock_magasin: Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0),
        stock_vente: Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0),
        min_stock_alert: Number(p.min_stock_alert) || 5,
        category: p.category,
        batch_pricing: p.batch_pricing || p.sector_meta?.batch_pricing || null,
        sector_meta: p.sector_meta,
      }))

      setProducts(mapped)
    } catch (err: any) {
      toast.error('Erreur chargement stocks', err.message)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Synchronisation temps réel avec Supabase
  useEffect(() => {
    if (!company?.id) return

    const channel = supabase
      .channel(`products-stocks-${company.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `company_id=eq.${company.id}`
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [company?.id, loadData])

  // Charger l'historique des inventaires
  useEffect(() => {
    if (!company?.id) return
    const storedHistory = localStorage.getItem(`gestio_inventory_history_${company.id}`)
    if (storedHistory) {
      try {
        setInventoryHistory(JSON.parse(storedHistory))
      } catch (e) {}
    }
  }, [company?.id])

  // Synchroniser la grille d'inventaire quand les produits réels changent
  useEffect(() => {
    setInventoryList(
      products.map((p) => {
        const totalTheo = p.stock_magasin + p.stock_vente
        return {
          productId: p.id,
          code: p.code,
          name: p.name,
          unit: p.unit,
          stockTheorique: totalTheo,
          stockPhysique: totalTheo,
          ecart: 0,
          valeurEcart: 0,
          observation: ''
        }
      })
    )
  }, [products])

  // ─── Chargement Activité Période pour la Fiche Journalière ──────────────
  const loadPeriodActivity = useCallback(async () => {
    if (!company?.id) return
    try {
      let startIso = ''
      let endIso = ''
      const now = new Date()

      if (dateFilterMode === 'today') {
        startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
        endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      } else if (dateFilterMode === 'yesterday') {
        const y = new Date(now)
        y.setDate(y.getDate() - 1)
        startIso = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString()
        endIso = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59).toISOString()
      } else if (dateFilterMode === 'single') {
        const d = new Date(customDate)
        startIso = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
        endIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString()
      } else {
        const s = new Date(startDate)
        const e = new Date(endDate)
        startIso = new Date(s.getFullYear(), s.getMonth(), s.getDate()).toISOString()
        endIso = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59).toISOString()
      }

      const { data: sales } = await supabase
        .from('sales_orders')
        .select('*, items:sales_order_items(*)')
        .eq('company_id', company.id)
        .gte('created_at', startIso)
        .lte('created_at', endIso)

      const salesMap: Record<string, number> = {}
      if (sales) {
        sales.forEach((s: any) => {
          if (s.items && Array.isArray(s.items) && s.items.length > 0) {
            s.items.forEach((it: any) => {
              const pId = it.product_id
              if (pId) {
                salesMap[pId] = (salesMap[pId] || 0) + (Number(it.quantity) || 0)
              }
            })
          } else if (s.notes) {
            try {
              const parsed = JSON.parse(s.notes)
              if (Array.isArray(parsed.lines)) {
                parsed.lines.forEach((l: any) => {
                  const pId = l.product?.id || l.productId
                  if (pId) {
                    salesMap[pId] = (salesMap[pId] || 0) + (Number(l.qty) || 0)
                  }
                })
              }
            } catch (e) {}
          }
        })
      }
      setPeriodSalesItems(salesMap)
    } catch (e) {
      console.warn('Erreur chargement activite periode stock', e)
    }
  }, [company?.id, dateFilterMode, customDate, startDate, endDate])

  useEffect(() => {
    if (activeTab === 'fiche_journaliere') {
      loadPeriodActivity()
    }
  }, [activeTab, loadPeriodActivity])

  // ─── Actions Double Stock : Transfert Individuel (Bi-directionnel) ─────────

  const handleExecuteTransfer = async () => {
    const prod = products.find((p) => p.id === transferProdId)
    if (!prod) {
      toast.error('Sélection requise', 'Veuillez choisir un article.')
      return
    }
    if (transferQty <= 0) {
      toast.error('Quantité invalide', 'La quantité transférée doit être supérieure à 0.')
      return
    }

    const coef = prod.coef || 1

    if (transferDirection === 'magasin_to_vente') {
      if (transferQty > prod.stock_magasin) {
        toast.error('Stock insuffisant en magasin', `Stock disponible : ${prod.stock_magasin} ${prod.ucd || 'UCD'}`)
        return
      }
    } else {
      if (transferQty > prod.stock_vente) {
        toast.error('Stock insuffisant en rayon vente', `Stock disponible : ${prod.stock_vente} ${prod.uv || 'UV'}`)
        return
      }
    }

    try {
      let newMagasin = prod.stock_magasin
      let newVente = prod.stock_vente

      if (transferDirection === 'magasin_to_vente') {
        const addedVente = transferQty * coef
        newMagasin = Math.max(0, Math.round((prod.stock_magasin - transferQty) * 1000) / 1000)
        newVente = Math.round((prod.stock_vente + addedVente) * 1000) / 1000
      } else {
        const addedMagasin = transferQty / coef
        newVente = Math.max(0, Math.round((prod.stock_vente - transferQty) * 1000) / 1000)
        newMagasin = Math.round((prod.stock_magasin + addedMagasin) * 1000) / 1000
      }

      const currentMeta = prod.sector_meta || {}
      const updatedMeta = {
        ...currentMeta,
        stock_magasin: newMagasin,
        stock_vente: newVente
      }

      let updRes = await supabase
        .from('products')
        .update({
          stock_magasin: newMagasin,
          stock_vente: newVente,
          sector_meta: updatedMeta
        })
        .eq('id', prod.id)

      if (updRes.error && updRes.error.code === 'PGRST204') {
        updRes = await supabase
          .from('products')
          .update({
            sector_meta: updatedMeta
          })
          .eq('id', prod.id)
      }

      if (updRes.error) throw updRes.error

      await logAuditEvent({
        action: 'TRANSFERT_STOCK',
        module: 'STOCKS',
        sector: 'COMMERCIAL',
        description: `Transfert ${transferDirection === 'magasin_to_vente' ? 'Magasin -> Vente' : 'Vente -> Magasin'} de ${transferQty} ${transferDirection === 'magasin_to_vente' ? (prod.ucd || 'UCD') : (prod.uv || 'UV')} pour ${prod.name}. Motif: ${transferMotif}`
      })

      setProducts((prev) =>
        prev.map((p) =>
          p.id === prod.id ? { ...p, stock_magasin: newMagasin, stock_vente: newVente, sector_meta: updatedMeta } : p
        )
      )

      setShowTransferModal(false)
      setTransferQty(0)
      toast.success(
        'Transfert effectué !',
        `Mise à jour des stocks validée avec application du coefficient de conversion (${coef}).`
      )
    } catch (err: any) {
      toast.error('Erreur transfert', err.message)
    }
  }

  // ─── Actions Double Stock : Transfert en Masse (Bi-directionnel) ───────────

  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    )
  }

  const handleSelectAllProducts = () => {
    const available = products
      .filter((p) => (transferDirection === 'magasin_to_vente' ? p.stock_magasin > 0 : p.stock_vente > 0))
      .map((p) => p.id)
    if (selectedProductIds.length === available.length && available.length > 0) {
      setSelectedProductIds([])
    } else {
      setSelectedProductIds(available)
    }
  }

  const handleOpenBulkTransferModal = () => {
    const initialQtys: Record<string, number> = {}
    selectedProductIds.forEach((id) => {
      const prod = products.find((p) => p.id === id)
      if (prod) {
        const sourceStock = transferDirection === 'magasin_to_vente' ? prod.stock_magasin : prod.stock_vente
        initialQtys[id] = sourceStock >= 1 ? 1 : sourceStock
      }
    })
    setBulkTransferQtys(initialQtys)
    setShowBulkTransferModal(true)
  }

  const handleExecuteBulkTransfer = async () => {
    const itemsToTransfer = selectedProductIds
      .map((id) => {
        const prod = products.find((p) => p.id === id)
        const qty = Number(bulkTransferQtys[id]) || 0
        return { prod, qty }
      })
      .filter((item) => item.prod && item.qty > 0)

    if (itemsToTransfer.length === 0) {
      toast.error('Quantité requise', 'Veuillez saisir au moins une quantité supérieure à 0.')
      return
    }

    for (const item of itemsToTransfer) {
      const sourceStock = transferDirection === 'magasin_to_vente' ? (item.prod?.stock_magasin || 0) : (item.prod?.stock_vente || 0)
      if (item.qty > sourceStock) {
        toast.error(
          'Stock insuffisant',
          `Quantité pour ${item.prod?.name} (${item.qty}) dépasse le stock disponible (${sourceStock}).`
        )
        return
      }
    }

    setIsProcessingBulkTransfer(true)
    try {
      for (const item of itemsToTransfer) {
        if (!item.prod) continue
        const coef = item.prod.coef || 1
        let newMagasin = item.prod.stock_magasin
        let newVente = item.prod.stock_vente

        if (transferDirection === 'magasin_to_vente') {
          newMagasin = Math.max(0, Math.round((item.prod.stock_magasin - item.qty) * 1000) / 1000)
          newVente = Math.round((item.prod.stock_vente + (item.qty * coef)) * 1000) / 1000
        } else {
          newVente = Math.max(0, Math.round((item.prod.stock_vente - item.qty) * 1000) / 1000)
          newMagasin = Math.round((item.prod.stock_magasin + (item.qty / coef)) * 1000) / 1000
        }

        const currentMeta = item.prod.sector_meta || {}
        const updatedMeta = {
          ...currentMeta,
          stock_magasin: newMagasin,
          stock_vente: newVente
        }

        let updRes = await supabase
          .from('products')
          .update({
            stock_magasin: newMagasin,
            stock_vente: newVente,
            sector_meta: updatedMeta
          })
          .eq('id', item.prod.id)

        if (updRes.error && updRes.error.code === 'PGRST204') {
          updRes = await supabase
            .from('products')
            .update({
              sector_meta: updatedMeta
            })
            .eq('id', item.prod.id)
        }

        if (updRes.error) throw updRes.error
      }

      await logAuditEvent({
        action: 'TRANSFERT_STOCK',
        module: 'STOCKS',
        sector: 'COMMERCIAL',
        description: `Transfert groupé (${transferDirection === 'magasin_to_vente' ? 'Magasin -> Vente' : 'Vente -> Magasin'}) de ${itemsToTransfer.length} produit(s). Motif: ${bulkTransferMotif}`
      })

      await loadData()
      setSelectedProductIds([])
      setShowBulkTransferModal(false)
      toast.success(
        'Transfert en masse validé !',
        `${itemsToTransfer.length} produit(s) transféré(s) avec succès selon le sens ${transferDirection === 'magasin_to_vente' ? 'Magasin ➔ Vente' : 'Vente ➔ Magasin'}.`
      )
    } catch (err: any) {
      toast.error('Erreur transfert groupé', err.message)
    } finally {
      setIsProcessingBulkTransfer(false)
    }
  }

  // ─── Actions Modification & Suppression de Produit ────────────────────────

  const handleOpenEditProduct = (p: ProductStock) => {
    setEditingProduct(p)
    setEditForm({
      name: p.name,
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      min_stock_alert: p.min_stock_alert,
      stock_magasin: p.stock_magasin,
      stock_vente: p.stock_vente
    })
  }

  const handleSaveProductEdit = async () => {
    if (!editingProduct) return
    try {
      const currentMeta = editingProduct.sector_meta || {}
      const updatedMeta = {
        ...currentMeta,
        stock_magasin: Number(editForm.stock_magasin) || 0,
        stock_vente: Number(editForm.stock_vente) || 0
      }

      let updRes = await supabase
        .from('products')
        .update({
          name: editForm.name,
          cost_price: Number(editForm.cost_price) || 0,
          selling_price: Number(editForm.selling_price) || 0,
          min_stock_alert: Number(editForm.min_stock_alert) || 5,
          stock_magasin: Number(editForm.stock_magasin) || 0,
          stock_vente: Number(editForm.stock_vente) || 0,
          sector_meta: updatedMeta
        })
        .eq('id', editingProduct.id)

      if (updRes.error && updRes.error.code === 'PGRST204') {
        updRes = await supabase
          .from('products')
          .update({
            name: editForm.name,
            cost_price: Number(editForm.cost_price) || 0,
            selling_price: Number(editForm.selling_price) || 0,
            min_stock_alert: Number(editForm.min_stock_alert) || 5,
            sector_meta: updatedMeta
          })
          .eq('id', editingProduct.id)
      }

      if (updRes.error) throw updRes.error

      await logAuditEvent({
        action: 'MODIFICATION_PRODUIT',
        module: 'STOCKS',
        sector: 'COMMERCIAL',
        description: `Modification de l'article "${editForm.name}" (${editingProduct.code}) par ${user?.full_name || 'Utilisateur'}`
      })

      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: editForm.name,
                cost_price: Number(editForm.cost_price) || 0,
                selling_price: Number(editForm.selling_price) || 0,
                min_stock_alert: Number(editForm.min_stock_alert) || 5,
                stock_magasin: Number(editForm.stock_magasin) || 0,
                stock_vente: Number(editForm.stock_vente) || 0,
                sector_meta: updatedMeta
              }
            : p
        )
      )

      setEditingProduct(null)
      toast.success('Produit modifié', `Les informations de ${editForm.name} ont été mises à jour.`)
    } catch (e: any) {
      toast.error('Erreur mise à jour', e.message)
    }
  }

  const handleDeleteProduct = async (p: ProductStock) => {
    if (!window.confirm(`Confirmez-vous l'archivage / suppression du produit "${p.name}" (${p.code}) ?`)) {
      return
    }
    try {
      const { error } = await supabase
        .from('products')
        .update({
          is_active: false,
          sector_meta: {
            ...((p as any).sector_meta || {}),
            deleted_at: new Date().toISOString(),
            deleted_by: user?.id || null,
            deletion_reason: 'Archivage / suppression logique utilisateur'
          }
        })
        .eq('id', p.id)

      if (error) throw error

      await logAuditEvent({
        companyId: company?.id,
        userId: user?.id,
        userName: user?.full_name,
        userRole: user?.role,
        action: 'SUPPRESSION_LOGIQUE_PRODUIT',
        module: 'STOCKS',
        sector: currentSectorSlug.toUpperCase(),
        description: `Suppression logique (soft delete) du produit "${p.name}" (${p.code}) par ${user?.full_name || 'Utilisateur'}`
      })

      setProducts((prev) => prev.filter((item) => item.id !== p.id))
      toast.success('Produit retiré', `Le produit ${p.name} a été archivé des stocks actifs tout en préservant l'historique comptable.`)
    } catch (e: any) {
      toast.error('Erreur suppression', e.message)
    }
  }

  // ─── Actions Inventaire Physique ──────────────────────────────────────────

  const handlePhysicalStockChange = (productId: string, val: number) => {
    setInventoryList((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const phys = Math.max(0, val)
          const diff = Math.round((phys - item.stockTheorique) * 1000) / 1000
          const prod = products.find((p) => p.id === productId)
          const unitCost = prod?.cost_price || 0
          return {
            ...item,
            stockPhysique: phys,
            ecart: diff,
            valeurEcart: Math.round(diff * unitCost)
          }
        }
        return item
      })
    )
  }

  const handleObservationChange = (productId: string, val: string) => {
    setInventoryList((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, observation: val } : item))
    )
  }

  const handleValidateInventory = async () => {
    try {
      // Mettre à jour chaque produit réaligné
      for (const item of inventoryList) {
        if (item.ecart !== 0) {
          const prod = products.find((p) => p.id === item.productId)
          if (prod) {
            const newVente = Math.max(0, item.stockPhysique - prod.stock_magasin)
            const currentMeta = prod.sector_meta || {}
            const updatedMeta = {
              ...currentMeta,
              stock_vente: newVente
            }

            let updRes = await supabase
              .from('products')
              .update({ stock_vente: newVente, sector_meta: updatedMeta })
              .eq('id', prod.id)

            if (updRes.error && updRes.error.code === 'PGRST204') {
              updRes = await supabase
                .from('products')
                .update({ sector_meta: updatedMeta })
                .eq('id', prod.id)
            }
          }
        }
      }

      await loadData()
      const totalEcarts = inventoryList.reduce((s, i) => s + i.valeurEcart, 0)

      // Archiver la fiche d'inventaire dans l'historique
      const newRecord: InventoryHistoryRecord = {
        id: `inv-${Date.now()}`,
        date: new Date().toISOString(),
        validated_by: user?.full_name || 'Responsable Stock',
        items_count: inventoryList.length,
        total_ecart_valeur: totalEcarts,
        items: JSON.parse(JSON.stringify(inventoryList))
      }
      const updatedHistory = [newRecord, ...inventoryHistory]
      setInventoryHistory(updatedHistory)
      if (company?.id) {
        localStorage.setItem(`gestio_inventory_history_${company.id}`, JSON.stringify(updatedHistory))
      }

      toast.success(
        'Inventaire validé !',
        `Stock réaligné avec succès. Écart net valorisé : ${fmt(totalEcarts)}. Fiche archivée avec observations.`
      )
    } catch (err: any) {
      toast.error('Erreur inventaire', err.message)
    }
  }

  // ─── Fiche Journalière de Stock ───────────────────────────────────────────

  const dailyStockData: DailyStockRow[] = useMemo(() => {
    return products.map((p) => {
      const final = p.stock_magasin + p.stock_vente
      return {
        productId: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        stockInitial: final, // Réel sans simulation artificielle
        entrees: 0,
        sorties: 0,
        stockFinal: final,
        valeurAchat: Math.round(final * p.cost_price),
        valeurVente: Math.round(final * p.selling_price)
      }
    })
  }, [products])

  // ─── Métriques de Valorisation Réelle des Stocks ───────────────────────────

  // Stock Magasin : quantité et valeur au prix d'achat
  const totalMagasinQty = products.reduce((sum, p) => sum + (p.stock_magasin || 0), 0)
  const totalMagasinValAchat = products.reduce((sum, p) => sum + (p.cost_price || 0) * (p.stock_magasin || 0), 0)

  // Stock Vente : quantité, valeur au prix d'achat et valeur au prix de vente
  const totalVenteQty = products.reduce((sum, p) => sum + (p.stock_vente || 0), 0)
  const totalVenteValAchat = products.reduce((sum, p) => sum + (p.cost_price || 0) * (p.stock_vente || 0), 0)
  const totalVenteValVente = products.reduce((sum, p) => sum + (p.selling_price || 0) * (p.stock_vente || 0), 0)

  // Valeur Globale
  const totalStockValAchat = totalMagasinValAchat + totalVenteValAchat

  const filteredProducts = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* ── En-tête & Onglets ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            Stocks & Inventaire
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Double Stock (Magasin UCD & Vente UV), Transferts, Inventaire avec écarts et Valorisation Achat/Vente
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('double_stock')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'double_stock'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <Layers className="w-4 h-4" /> Double Stock
          </button>
          <button
            onClick={() => setActiveTab('inventaire')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'inventaire'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <ClipboardCheck className="w-4 h-4" /> Inventaire Physique
          </button>
          <button
            onClick={() => setActiveTab('fiche_journaliere')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'fiche_journaliere'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <FileSpreadsheet className="w-4 h-4" /> Fiche Journalière
          </button>

          <button
            onClick={() => setShowValuationModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" /> État des Stocks
          </button>
        </div>
      </div>

      {/* ── KPIs Stocks : Séparation Magasin (UCD) et Vente (UV) avec Valorisation ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stock Magasin */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block mb-0.5">
              Stock Magasin (Réserve UCD)
            </span>
            <p className="text-xl font-black text-slate-900 font-mono">{fmt(totalMagasinValAchat)}</p>
            <span className="text-[10px] text-slate-500 font-medium">
              Qté totale : <strong>{totalMagasinQty} unités</strong> (Valeur Achat)
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Stock Vente */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-0.5">
              Stock Vente (Rayon POS UV)
            </span>
            <p className="text-xl font-black text-emerald-800 font-mono">{fmt(totalVenteValAchat)}</p>
            <span className="text-[10px] text-slate-500 font-medium">
              Valeur Vente : <strong className="text-emerald-700">{fmt(totalVenteValVente)}</strong> ({totalVenteQty} UV)
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Valeur Globale Réelle */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-0.5">
              Valorisation Totale Achat
            </span>
            <p className="text-xl font-black text-slate-900 font-mono">{fmt(totalStockValAchat)}</p>
            <span className="text-[10px] text-slate-500 font-medium">
              {products.length} référence(s) en catalogue
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {activeTab === 'double_stock' && (
        /* ── TAB 1 : DOUBLE STOCK & TRANSFERTS ───────────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par code ou désignation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              {selectedProductIds.length > 0 && (
                <button
                  onClick={handleOpenBulkTransferModal}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm animate-in fade-in"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Transférer la sélection ({selectedProductIds.length})
                </button>
              )}
              <button
                onClick={() => setShowNewProductModal(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Nouveau Produit
              </button>
              <button
                onClick={loadData}
                className="p-1.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
                title="Actualiser"
              >
                <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5 text-center w-8">
                    <input
                      type="checkbox"
                      checked={
                        selectedProductIds.length > 0 &&
                        selectedProductIds.length === products.filter((p) => (transferDirection === 'magasin_to_vente' ? p.stock_magasin > 0 : p.stock_vente > 0)).length
                      }
                      onChange={handleSelectAllProducts}
                      title="Tout sélectionner pour le transfert groupé"
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-2.5">Réf</th>
                  <th className="p-2.5">Désignation</th>
                  <th className="p-2.5">Unité</th>
                  <th className="p-2.5 text-right">Prix d'achat TTC</th>
                  <th className="p-2.5 text-right">Prix de Vente TTC</th>
                  <th className="p-2.5 text-center bg-indigo-50/70 text-indigo-900">Stock Magasin (UCD)</th>
                  <th className="p-2.5 text-right bg-indigo-50/40 text-indigo-900">Valeur Stock Magasin TTC</th>
                  <th className="p-2.5 text-center bg-emerald-50/70 text-emerald-900">Stock Vente (UV)</th>
                  <th className="p-2.5 text-right bg-emerald-50/40 text-emerald-900">Valeur Stock Vente TTC</th>
                  <th className="p-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 font-sans">
                      {loading ? 'Chargement...' : 'Aucun produit trouvé dans cette entreprise.'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const ucdUnit = p.ucd || 'Carton'
                    const uvUnit = p.uv || p.unit || 'Pièce'
                    const coef = p.coef || 1
                    const valeurMagasinTTC = p.stock_magasin * coef * p.cost_price
                    const valeurVenteTTC = p.stock_vente * p.selling_price

                    return (
                      <tr
                        key={p.id}
                        className={clsx(
                          'hover:bg-slate-50/80 transition',
                          selectedProductIds.includes(p.id) && 'bg-indigo-50/40'
                        )}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(p.id)}
                            onChange={() => handleToggleSelectProduct(p.id)}
                            disabled={transferDirection === 'magasin_to_vente' ? p.stock_magasin <= 0 : p.stock_vente <= 0}
                            title={
                              (transferDirection === 'magasin_to_vente' ? p.stock_magasin <= 0 : p.stock_vente <= 0)
                                ? 'Stock source vide'
                                : 'Sélectionner pour transfert'
                            }
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                          />
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 font-mono">{p.code}</td>
                        <td className="p-2.5 font-sans font-semibold text-slate-800">{p.name}</td>
                        <td className="p-2.5 font-sans text-slate-500">{uvUnit}</td>
                        <td className="p-2.5 text-right font-mono">{fmt(p.cost_price)}</td>
                        <td className="p-2.5 text-right text-emerald-700 font-bold font-mono">{fmt(p.selling_price)}</td>
                        <td className="p-2.5 text-center bg-indigo-50/30 font-black text-indigo-900 font-mono text-xs">
                          {p.stock_magasin} {ucdUnit}
                        </td>
                        <td className="p-2.5 text-right bg-indigo-50/20 font-bold text-slate-700 font-mono">
                          {fmt(valeurMagasinTTC)}
                        </td>
                        <td className="p-2.5 text-center bg-emerald-50/30 font-black text-emerald-900 font-mono text-xs">
                          {p.stock_vente} {uvUnit}
                        </td>
                        <td className="p-2.5 text-right bg-emerald-50/20 font-bold text-emerald-700 font-mono">
                          {fmt(valeurVenteTTC)}
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setTransferProdId(p.id); setShowTransferModal(true); }}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              title="Transférer le stock"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">Transférer</span>
                            </button>
                            <button
                              onClick={() => handleOpenEditProduct(p)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition"
                              title="Modifier l'article"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs transition"
                              title="Supprimer l'article"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'inventaire' && (
        /* ── TAB 2 : INVENTAIRE PHYSIQUE & AJUSTEMENTS ───────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Saisie d'Inventaire Physique</h3>
              <p className="text-xs text-slate-500">Saisissez les quantités réellement comptées. L'ERP calcule l'écart et régularise.</p>
            </div>
            <button
              onClick={handleValidateInventory}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" /> Valider l'Inventaire & Régulariser
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Désignation</th>
                  <th className="p-3 text-center">Stock Théorique</th>
                  <th className="p-3 text-center bg-amber-50/70 text-amber-900">Stock Physique Compté</th>
                  <th className="p-3 text-center">Écart (Qté)</th>
                  <th className="p-3 text-right">Valeur Écart (FCFA)</th>
                  <th className="p-3">Observation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {inventoryList.map((item) => (
                  <tr key={item.productId} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-bold text-slate-900">{item.code}</td>
                    <td className="p-3 font-sans font-medium text-slate-800">{item.name}</td>
                    <td className="p-3 text-center font-bold text-slate-600">{item.stockTheorique}</td>
                    <td className="p-3 text-center bg-amber-50/40">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.stockPhysique}
                        onChange={(e) => handlePhysicalStockChange(item.productId, Number(e.target.value))}
                        className="w-24 p-1 text-center font-bold font-mono border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="p-3 text-center font-bold">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-xs',
                        item.ecart === 0 ? 'bg-slate-100 text-slate-600' :
                        item.ecart > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      )}>
                        {item.ecart > 0 ? `+${item.ecart}` : item.ecart}
                      </span>
                    </td>
                    <td className={clsx('p-3 text-right font-bold', item.valeurEcart < 0 ? 'text-red-600' : item.valeurEcart > 0 ? 'text-emerald-600' : 'text-slate-500')}>
                      {fmt(item.valeurEcart)}
                    </td>
                    <td className="p-3 font-sans">
                      <input
                        type="text"
                        placeholder="Remarque (perte, casse, vol, périmé...)"
                        value={item.observation || ''}
                        onChange={(e) => handleObservationChange(item.productId, e.target.value)}
                        className="w-full min-w-[160px] p-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── HISTORIQUE DES INVENTAIRES PASSÉS AVEC OPTION IMPRIMER ── */}
          {inventoryHistory.length > 0 && (
            <div className="pt-6 border-t border-slate-200 mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                    Historique des Inventaires Passés ({inventoryHistory.length})
                  </h4>
                  <p className="text-xs text-slate-500">Archives des contrôles physiques de stocks et observations consignées</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Date & Heure</th>
                      <th className="p-2.5">Responsable</th>
                      <th className="p-2.5 text-center">Articles contrôlés</th>
                      <th className="p-2.5 text-right">Écart Net Valorisé</th>
                      <th className="p-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {inventoryHistory.map((hist) => (
                      <tr key={hist.id} className="hover:bg-slate-50 transition">
                        <td className="p-2.5 font-mono font-semibold text-slate-900">
                          {new Date(hist.date).toLocaleString('fr-BJ')}
                        </td>
                        <td className="p-2.5 text-slate-600">{hist.validated_by}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-700">{hist.items_count} réf</td>
                        <td className={clsx(
                          'p-2.5 text-right font-mono font-bold',
                          hist.total_ecart_valeur < 0 ? 'text-red-600' : hist.total_ecart_valeur > 0 ? 'text-emerald-600' : 'text-slate-500'
                        )}>
                          {fmt(hist.total_ecart_valeur)}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => { setSelectedHistoryForPrint(hist); setShowHistoryPrintModal(true); }}
                            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 mx-auto shadow-sm"
                          >
                            <Printer className="w-3 h-3" /> Imprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'fiche_journaliere' && (
        /* ── TAB 3 : FICHE JOURNALIÈRE DE STOCK (QUANTITÉS PURES & FILTRES) ── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Fiche de Stock Journalière (Quantités Pures)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Rapport d'activité des flux physiques : Stock début + Entrées (BL) - Sorties (Ventes) = Stocks réels
              </p>
            </div>

            {/* Filtres de Date & Exports */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-700">
                <button
                  type="button"
                  onClick={() => setDateFilterMode('today')}
                  className={clsx('px-2.5 py-1 rounded-lg transition', dateFilterMode === 'today' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-600 hover:text-slate-900')}
                >
                  Aujourd'hui
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('yesterday')}
                  className={clsx('px-2.5 py-1 rounded-lg transition', dateFilterMode === 'yesterday' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-600 hover:text-slate-900')}
                >
                  Hier
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('single')}
                  className={clsx('px-2.5 py-1 rounded-lg transition', dateFilterMode === 'single' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-600 hover:text-slate-900')}
                >
                  Date précise
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('period')}
                  className={clsx('px-2.5 py-1 rounded-lg transition', dateFilterMode === 'period' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-600 hover:text-slate-900')}
                >
                  Période
                </button>
              </div>

              {dateFilterMode === 'single' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="p-1.5 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                />
              )}

              {dateFilterMode === 'period' && (
                <div className="flex items-center gap-1 text-xs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="p-1.5 border border-slate-200 rounded-xl font-mono text-xs font-bold"
                  />
                  <span className="text-slate-400">à</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="p-1.5 border border-slate-200 rounded-xl font-mono text-xs font-bold"
                  />
                </div>
              )}

              {/* Export Excel / CSV */}
              <button
                type="button"
                onClick={() => {
                  const headers = ['Réf', 'Produit', 'Stock Début (UV)', 'Approvisionnements Entrées', 'Ventes Sorties', 'Stock Magasin Actuel (UCD)', 'Stock Vente Actuel (UV)']
                  const rows = filteredProducts.map((p) => {
                    const sorties = periodSalesItems[p.id] || 0
                    const entrees = 0
                    const stockDebut = Math.max(0, Math.round((p.stock_vente + sorties - entrees) * 100) / 100)
                    return [
                      p.code,
                      `"${p.name.replace(/"/g, '""')}"`,
                      stockDebut,
                      entrees,
                      sorties,
                      `${p.stock_magasin} ${p.ucd || 'Carton'}`,
                      `${p.stock_vente} ${p.uv || p.unit || 'Pièce'}`
                    ]
                  })
                  const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `fiche_journaliere_stock_${new Date().toISOString().slice(0, 10)}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                  toast.success('Export CSV généré', 'La fiche journalière a été téléchargée.')
                }}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> Exporter Excel/CSV
              </button>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Produit (Réf / Désignation)</th>
                  <th className="p-3 text-center bg-slate-50 text-slate-800 font-black">Stock Début (UV)</th>
                  <th className="p-3 text-center bg-emerald-50 text-emerald-900">Appro du Jour (Entrées)</th>
                  <th className="p-3 text-center bg-rose-50 text-rose-900">Ventes du Jour (Sorties)</th>
                  <th className="p-3 text-center bg-indigo-50/70 text-indigo-900 font-black">Stock Magasin Actuel (UCD)</th>
                  <th className="p-3 text-center bg-emerald-50/70 text-emerald-900 font-black">Stock Vente Actuel (UV)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                      Aucun produit répertorié.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const sorties = periodSalesItems[p.id] || 0
                    const entrees = 0
                    const stockDebut = Math.max(0, Math.round((p.stock_vente + sorties - entrees) * 100) / 100)
                    const ucdUnit = p.ucd || 'Carton'
                    const uvUnit = p.uv || p.unit || 'Pièce'

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="text-slate-400 font-mono text-[11px] block">{p.code}</span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700 bg-slate-50/40">
                          {stockDebut} {uvUnit}
                        </td>
                        <td className="p-3 text-center font-bold text-emerald-700 bg-emerald-50/30">
                          +{entrees} {uvUnit}
                        </td>
                        <td className="p-3 text-center font-bold text-rose-700 bg-rose-50/30">
                          -{sorties} {uvUnit}
                        </td>
                        <td className="p-3 text-center font-black text-indigo-900 bg-indigo-50/20 text-xs">
                          {p.stock_magasin} {ucdUnit}
                        </td>
                        <td className="p-3 text-center font-black text-emerald-900 bg-emerald-50/20 text-xs">
                          {p.stock_vente} {uvUnit}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL TRANSFERT DE STOCK INDIVIDUEL (BI-DIRECTIONNEL) ───────────── */}
      <ModalPortal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} id="modal-transfer-stock">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
              Transfert de Stock Interne
            </h3>
            <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Sélection Sens de transfert */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Sens du transfert</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransferDirection('magasin_to_vente')}
                  className={clsx(
                    'p-2.5 rounded-xl border text-center font-bold transition text-xs',
                    transferDirection === 'magasin_to_vente'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Magasin ➔ Rayon Vente
                </button>
                <button
                  type="button"
                  onClick={() => setTransferDirection('vente_to_magasin')}
                  className={clsx(
                    'p-2.5 rounded-xl border text-center font-bold transition text-xs',
                    transferDirection === 'vente_to_magasin'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Rayon Vente ➔ Magasin
                </button>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Article à transférer</label>
              <select
                value={transferProdId}
                onChange={(e) => setTransferProdId(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-white font-medium"
              >
                <option value="">Sélectionnez un article</option>
                {products.map((p) => {
                  const ucd = p.ucd || 'Carton'
                  const uv = p.uv || p.unit || 'Pièce'
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} (Magasin : {p.stock_magasin} {ucd} | Rayon : {p.stock_vente} {uv})
                    </option>
                  )
                })}
              </select>
            </div>

            {(() => {
              const selectedProd = products.find((p) => p.id === transferProdId)
              if (!selectedProd) return null
              const coef = selectedProd.coef || 1
              const ucd = selectedProd.ucd || 'Carton'
              const uv = selectedProd.uv || selectedProd.unit || 'Pièce'
              const sourceMax = transferDirection === 'magasin_to_vente' ? selectedProd.stock_magasin : selectedProd.stock_vente
              const sourceUnit = transferDirection === 'magasin_to_vente' ? ucd : uv
              const targetUnit = transferDirection === 'magasin_to_vente' ? uv : ucd
              const resultingQty = transferDirection === 'magasin_to_vente' ? transferQty * coef : Math.round((transferQty / coef) * 100) / 100

              return (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Stock source disponible :</span>
                    <strong className="font-mono text-slate-900">{sourceMax} {sourceUnit}</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Rapport de conversion :</span>
                    <strong className="font-mono text-indigo-700">1 {ucd} = {coef} {uv}</strong>
                  </div>
                  {transferQty > 0 && (
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-emerald-800">
                      <span className="font-bold">Quantité ajoutée au stock cible :</span>
                      <strong className="font-mono text-sm">+{resultingQty} {targetUnit}</strong>
                    </div>
                  )}
                </div>
              )
            })()}

            <div>
              <label className="font-bold text-slate-700 block mb-1">Quantité à transférer</label>
              <input
                type="number"
                step="any"
                min="0.001"
                value={transferQty || ''}
                onChange={(e) => setTransferQty(Number(e.target.value))}
                placeholder="Nombre d'unités"
                className="w-full p-2 border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Motif du transfert</label>
              <input
                type="text"
                value={transferMotif}
                onChange={(e) => setTransferMotif(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={() => setShowTransferModal(false)}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={handleExecuteTransfer}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" /> Valider le Transfert
            </button>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL ÉTAT VALORISÉ DES STOCKS (IMPRESSION OFFICIELLE) ───────────── */}
      <ModalPortal isOpen={showValuationModal} onClose={() => setShowValuationModal(false)} id="modal-stock-valuation">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="font-black text-slate-900 text-base">État des Stocks & Valorisation Complète</h3>
              <p className="text-xs text-slate-500">Document d'inventaire officiel pour la Direction & Comptabilité</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
              <button onClick={() => setShowValuationModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-xs font-sans">
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <div>
                <p className="font-black uppercase text-sm text-slate-900">{company?.name || 'ENTREPRISE'}</p>
                <p className="text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-700">Date d'édition :</p>
                <p className="font-mono text-slate-500">{new Date().toLocaleString('fr-BJ')}</p>
              </div>
            </div>

            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-200 font-bold text-slate-800">
                <tr>
                  <th className="p-2">Désignation</th>
                  <th className="p-2 text-center">Magasin</th>
                  <th className="p-2 text-center">Vente</th>
                  <th className="p-2 text-right">PU Achat</th>
                  <th className="p-2 text-right">Total Achat</th>
                  <th className="p-2 text-right">Total Vente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {products.map((p) => {
                  const totalQty = p.stock_magasin + p.stock_vente
                  const valAchat = totalQty * p.cost_price
                  const valVente = totalQty * p.selling_price
                  return (
                    <tr key={p.id}>
                      <td className="p-2 font-sans font-medium text-slate-800">{p.name}</td>
                      <td className="p-2 text-center">{p.stock_magasin}</td>
                      <td className="p-2 text-center">{p.stock_vente}</td>
                      <td className="p-2 text-right">{fmt(p.cost_price)}</td>
                      <td className="p-2 text-right font-bold">{fmt(valAchat)}</td>
                      <td className="p-2 text-right font-bold text-emerald-800">{fmt(valVente)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-200 font-black text-slate-900 border-t-2 border-slate-400">
                <tr>
                  <td colSpan={4} className="p-2 text-right uppercase">Totaux Généraux :</td>
                  <td className="p-2 text-right font-mono">{fmt(totalStockValAchat)}</td>
                  <td className="p-2 text-right font-mono text-emerald-800">{fmt(totalVenteValVente + (totalMagasinQty * (products[0]?.selling_price || 0)))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL TRANSFERT EN MASSE (PLUSIEURS PRODUITS) ──────────────────── */}
      <ModalPortal isOpen={showBulkTransferModal} onClose={() => setShowBulkTransferModal(false)} id="modal-bulk-transfer">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-3xl w-full border border-slate-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                Transfert Multiple de Produits
              </h3>
              <p className="text-xs text-slate-500">
                Transférez les {selectedProductIds.length} produit(s) sélectionné(s) avec conversion automatique de stocks
              </p>
            </div>
            <button onClick={() => setShowBulkTransferModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Sens du transfert */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Sens du transfert groupé :</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransferDirection('magasin_to_vente')}
                  className={clsx(
                    'p-2.5 rounded-xl border text-center font-bold transition text-xs',
                    transferDirection === 'magasin_to_vente'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Magasin (UCD) ➔ Rayon Vente (UV)
                </button>
                <button
                  type="button"
                  onClick={() => setTransferDirection('vente_to_magasin')}
                  className={clsx(
                    'p-2.5 rounded-xl border text-center font-bold transition text-xs',
                    transferDirection === 'vente_to_magasin'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Rayon Vente (UV) ➔ Magasin (UCD)
                </button>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Motif commun du transfert</label>
              <input
                type="text"
                value={bulkTransferMotif}
                onChange={(e) => setBulkTransferMotif(e.target.value)}
                placeholder="Ex: Réapprovisionnement Rayon Vente POS..."
                className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-slate-50"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Article</th>
                    <th className="p-2.5 text-center">Stock Source Dispo</th>
                    <th className="p-2.5 text-center">Conversion</th>
                    <th className="p-2.5 text-center bg-indigo-50/70 text-indigo-900">Qté à Transférer</th>
                    <th className="p-2.5 text-center bg-emerald-50/70 text-emerald-900">Cible Résultante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {selectedProductIds.map((id) => {
                    const prod = products.find((p) => p.id === id)
                    if (!prod) return null
                    const val = bulkTransferQtys[id] ?? 0
                    const coef = prod.coef || 1
                    const ucd = prod.ucd || 'Carton'
                    const uv = prod.uv || prod.unit || 'Pièce'
                    const sourceStock = transferDirection === 'magasin_to_vente' ? prod.stock_magasin : prod.stock_vente
                    const sourceUnit = transferDirection === 'magasin_to_vente' ? ucd : uv
                    const targetUnit = transferDirection === 'magasin_to_vente' ? uv : ucd
                    const resultingQty = transferDirection === 'magasin_to_vente' ? Math.round((val * coef) * 1000) / 1000 : Math.round((val / coef) * 100) / 100

                    return (
                      <tr key={id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-medium text-slate-800">
                          {prod.name} <span className="text-slate-400 font-mono text-[11px]">({prod.code})</span>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-900">
                          {sourceStock} {sourceUnit}
                        </td>
                        <td className="p-2.5 text-center text-slate-500 font-sans text-[11px]">
                          1 {ucd} = {coef} {uv}
                        </td>
                        <td className="p-2.5 text-center bg-indigo-50/40">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={sourceStock}
                            value={val || ''}
                            onChange={(e) =>
                              setBulkTransferQtys((prev) => ({
                                ...prev,
                                [id]: Number(e.target.value)
                              }))
                            }
                            placeholder="0"
                            className="w-24 p-1.5 text-center font-bold font-mono border border-indigo-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="p-2.5 text-center bg-emerald-50/40 font-bold text-emerald-800">
                          +{resultingQty} {targetUnit}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkTransferModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkTransfer}
                disabled={isProcessingBulkTransfer}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isProcessingBulkTransfer ? 'Transfert en cours...' : `Valider tous les transferts (${selectedProductIds.length})`}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL ÉDITION RAPIDE PRODUIT ───────────────────────────────────── */}
      {editingProduct && (
        <ModalPortal isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} id="modal-edit-product">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">{editingProduct.code}</span>
                <h3 className="font-bold text-slate-900 text-base">Modifier l'article</h3>
              </div>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveProductEdit()
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="font-bold text-slate-700 block mb-1">Désignation *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Prix d'Achat TTC</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.cost_price}
                    onChange={(e) => setEditForm({ ...editForm, cost_price: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Prix de Vente TTC *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editForm.selling_price}
                    onChange={(e) => setEditForm({ ...editForm, selling_price: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Stock Magasin ({editingProduct.ucd || 'UCD'})</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editForm.stock_magasin}
                    onChange={(e) => setEditForm({ ...editForm, stock_magasin: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono text-indigo-700 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Stock Vente ({editingProduct.uv || editingProduct.unit || 'UV'})</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editForm.stock_vente}
                    onChange={(e) => setEditForm({ ...editForm, stock_vente: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono text-emerald-700 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Seuil Alerte Stock Minimum</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.min_stock_alert}
                  onChange={(e) => setEditForm({ ...editForm, min_stock_alert: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}

      {/* ── MODAL IMPRESSION FICHE D'INVENTAIRE OFFICIELLE ────────────────────── */}
      <ModalPortal isOpen={showHistoryPrintModal} onClose={() => setShowHistoryPrintModal(false)} id="modal-inventory-print">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-3xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="font-black text-slate-900 text-base">Fiche d'Inventaire Physique avec Observations</h3>
              <p className="text-xs text-slate-500">Document d'audit et régularisation conforme SYSCOHADA</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
              <button onClick={() => setShowHistoryPrintModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {selectedHistoryForPrint && (
            <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 text-xs font-sans">
              <div className="flex justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="font-black uppercase text-base text-slate-900">{company?.name || 'ENTREPRISE'}</h2>
                  <p className="text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
                  <p className="text-slate-500">{company?.address || 'Bénin'}</p>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    FICHE D'INVENTAIRE PHYSIQUE
                  </span>
                  <p className="font-bold text-slate-800 mt-1">Date : {new Date(selectedHistoryForPrint.date).toLocaleString('fr-BJ')}</p>
                  <p className="text-slate-500">Responsable : {selectedHistoryForPrint.validated_by}</p>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 font-bold text-slate-800 border-b border-slate-200">
                  <tr>
                    <th className="p-2">Code</th>
                    <th className="p-2">Désignation</th>
                    <th className="p-2 text-center">Théorique</th>
                    <th className="p-2 text-center">Compté</th>
                    <th className="p-2 text-center">Écart</th>
                    <th className="p-2 text-right">Valeur Écart</th>
                    <th className="p-2">Observation / Motif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {selectedHistoryForPrint.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 font-bold text-slate-800">{it.code}</td>
                      <td className="p-2 font-sans font-medium text-slate-800">{it.name}</td>
                      <td className="p-2 text-center text-slate-600">{it.stockTheorique}</td>
                      <td className="p-2 text-center font-bold text-slate-900">{it.stockPhysique}</td>
                      <td className="p-2 text-center font-bold">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[11px]',
                          it.ecart === 0 ? 'text-slate-500' : it.ecart > 0 ? 'text-emerald-700' : 'text-red-700'
                        )}>
                          {it.ecart > 0 ? `+${it.ecart}` : it.ecart}
                        </span>
                      </td>
                      <td className={clsx('p-2 text-right font-bold', it.valeurEcart < 0 ? 'text-red-600' : it.valeurEcart > 0 ? 'text-emerald-600' : 'text-slate-500')}>
                        {fmt(it.valeurEcart)}
                      </td>
                      <td className="p-2 font-sans text-slate-600 italic">
                        {it.observation || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={5} className="p-2 text-right uppercase">Écart Net Global :</td>
                    <td className="p-2 text-right font-mono">{fmt(selectedHistoryForPrint.total_ecart_valeur)}</td>
                    <td className="p-2 text-slate-500 font-sans text-[11px]">{selectedHistoryForPrint.items_count} références</td>
                  </tr>
                </tfoot>
              </table>

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center">
                <div className="space-y-12">
                  <p className="font-bold text-slate-700">Le Responsable d'Inventaire</p>
                  <p className="text-slate-400 italic text-[11px]">Signature & Date</p>
                </div>
                <div className="space-y-12">
                  <p className="font-bold text-slate-700">La Direction / Gérant</p>
                  <p className="text-slate-400 italic text-[11px]">Signature & Cachet</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>

      {/* Modals existantes */}
      <NewProductModal
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        onSuccess={() => {
          loadData()
        }}
      />
      <StockSheetModal
        isOpen={showStockSheetModal}
        onClose={() => setShowStockSheetModal(false)}
        products={products}
      />
    </div>
  )
}

export default StocksPage
