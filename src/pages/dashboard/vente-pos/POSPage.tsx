// =============================================================================
// GESTIO 229 SaaS — Ventes & Point de Vente (POS)
// Multi-paiements stricts, Vente différée, Modale Détail Produit avec décimales,
// Facture Commerciale Standard sans faux e-MECeF, Historique et Avoirs
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  ShoppingCart, Search, RefreshCw, Trash2, UserCheck, Check,
  Clock, Printer, RotateCcw, AlertTriangle, X, Plus, Minus,
  Layers, CreditCard, DollarSign, Smartphone, Landmark, Info, Download,
  ChevronRight, ArrowDown
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { ModalPortal } from '../../../components/modals'
import { calculateTaxFromTTC, formatFCFA } from '../../../utils/tax'
import {
  BatchPricingConfig,
  calculateBatchLinePrice,
  formatUvQty,
  getBatchTiersList
} from '../../../utils/batchPricing'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Product {
  id: string
  code: string
  name: string
  unit: string
  selling_price: number // Prix TTC
  cost_price: number    // Coût TTC
  coef?: number
  ucd?: string
  uv?: string
  current_stock?: number
  stock_vente?: number
  stock_magasin?: number
  is_vat_subject?: boolean
  vat_rate?: number
  is_aib_subject?: boolean
  aib_rate?: number
  category?: { name: string }
  batch_pricing?: BatchPricingConfig
  sector_meta?: any
}

interface Customer {
  id: string
  code: string
  name: string
  phone: string
  ifu_number?: string
  credit_limit?: number
  current_debt: number
  credit_authorized?: boolean
  discount_eligible?: boolean
  discount_rate?: number
}

interface CartItem {
  product: Product
  qty: number
  unitPrice: number // TTC
  discount: number
  batchTierLabel?: string
  isBatchTier?: boolean
}

interface PaymentLine {
  method: 'especes' | 'momo_mtn' | 'momo_moov' | 'wave' | 'banque' | 'credit'
  amount: number
}

interface SaleRecord {
  id: string
  order_number: string
  date: string
  customer_name: string
  customer_id?: string
  customer_ifu?: string
  total_amount: number
  total_ht: number
  total_tva: number
  total_aib: number
  total_exonere?: number
  amount_paid: number
  credit_amount: number
  payments: PaymentLine[]
  is_deferred: boolean
  status: 'COMPLET' | 'A_LIVRER' | 'AVOIR'
  lines: CartItem[]
}

export const POSPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  // Navigation interne
  const [activeTab, setActiveTab] = useState<'pos' | 'historique'>('pos')

  // Données réelles chargées depuis Supabase (aucune donnée fictive)
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Client sélectionné (défaut = vide = Client Comptoir)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId)

  // Vente différée
  const [isDeferred, setIsDeferred] = useState(false)

  // Modale Détail Produit (clic sur un article du catalogue)
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null)
  const [detailQty, setDetailQty] = useState<number>(1)

  // Panneau Panier & Checkout Intégré Glissant (Toujours visible par défaut sur grand écran)
  const [isCartVisible, setIsCartVisible] = useState(true)
  const [isMultiMode, setIsMultiMode] = useState(false)
  const [singleMethod, setSingleMethod] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('especes')

  // Multi-modes : Déploiement instantané Mode 1 et Mode 2
  const [multiMode1Canal, setMultiMode1Canal] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('especes')
  const [multiMode1Amount, setMultiMode1Amount] = useState<number>(0)
  const [multiMode2Canal, setMultiMode2Canal] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('momo_mtn')
  const [multiMode2Amount, setMultiMode2Amount] = useState<number>(0)

  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [paying, setPaying] = useState(false)

  // Facture et Impression
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [printFormat, setPrintFormat] = useState<'ticket80' | 'factureA4'>('factureA4')
  const [currentSale, setCurrentSale] = useState<SaleRecord | null>(null)

  // Historique des ventes réelles
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([])
  const [historySearch, setHistorySearch] = useState('')

  // ─── Chargement réel des données depuis Supabase ───────────────────────────

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [{ data: prods, error: prodErr }, { data: custs, error: custErr }, { data: sales, error: saleErr }] =
        await Promise.all([
          supabase
            .from('products')
            .select('*, category:product_categories(name)')
            .eq('company_id', company.id)
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('customers')
            .select('*')
            .eq('company_id', company.id)
            .order('name'),
          supabase
            .from('sales_orders')
            .select('*, customer:customers(id, name, ifu_number), items:sales_order_items(*)')
            .eq('company_id', company.id)
            .order('created_at', { ascending: false })
            .limit(100)
        ])

      if (prodErr) throw prodErr
      if (custErr) throw custErr

      // Isolation stricte par sous-logiciel (aucun mélange inter-secteurs)
      const sectorFilteredProds = filterItemsForSector(prods || [], currentSectorSlug)

      const mappedProds = sectorFilteredProds.map((p: any) => ({
        ...p,
        selling_price: Number(p.selling_price) || 0,
        cost_price: Number(p.cost_price) || 0,
        stock_magasin: Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0),
        stock_vente: Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0),
        coef: Number(p.coef || p.sector_meta?.coef || 1),
        ucd: p.ucd || p.sector_meta?.ucd || 'Carton',
        uv: p.uv || p.sector_meta?.uv || p.unit || 'Pièce',
        batch_pricing: p.batch_pricing || p.sector_meta?.batch_pricing || null,
      }))
      setProducts(mappedProds)

      // Charger les clients avec métadonnées de crédit et remise
      const mappedCusts: Customer[] = (custs || []).map((c: any) => {
        const creditLimit = Number(c.credit_limit) || 0
        const isCreditAuth = Boolean(c.credit_authorized) || (creditLimit > 0)
        const isDiscount = Boolean(c.discount_eligible)
        const discountRate = Number(c.discount_rate) || 0

        return {
          ...c,
          credit_limit: creditLimit,
          credit_authorized: isCreditAuth,
          discount_eligible: isDiscount,
          discount_rate: discountRate,
        }
      })
      setCustomers(mappedCusts)

      // Transformer les ventes réelles chargées depuis Supabase avec leurs lignes réelles
      // Isolation stricte : ne charger que les ventes du sous-logiciel actif
      if (sales && !saleErr) {
        const sectorFilteredSales = filterItemsForSector(sales, currentSectorSlug)
        const mappedSales: SaleRecord[] = sectorFilteredSales.map((s: any) => {
          let parsedNotes: any = {}
          try {
            if (s.notes) parsedNotes = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          } catch (e) {}

          let metaFromUid: any = {}
          if (s.e_mecef_uid) {
            try {
              if (s.e_mecef_uid.startsWith('{')) {
                metaFromUid = JSON.parse(s.e_mecef_uid)
              } else {
                s.e_mecef_uid.split('|').forEach((part: string) => {
                  const [k, v] = part.split(':')
                  if (k === 'PAY') metaFromUid.pm = v
                  if (k === 'CL') metaFromUid.cn = v
                  if (k === 'ST') metaFromUid.st = v
                })
              }
            } catch (e) {}
          }

          // 1. Récupération des lignes depuis sales_order_items (source de vérité Supabase)
          let lines: CartItem[] = []
          if (s.items && Array.isArray(s.items) && s.items.length > 0) {
            lines = s.items.map((item: any) => ({
              product: {
                id: item.product_id || item.id,
                code: item.product_id ? item.product_id.slice(0, 8) : 'ART',
                name: item.product_name || 'Article',
                unit: 'Pièce',
                selling_price: Number(item.unit_price) || 0,
                cost_price: Number(item.unit_cost) || 0,
                is_vat_subject: Number(item.tva_rate) > 0,
                vat_rate: Number(item.tva_rate) || 0,
              },
              qty: Number(item.quantity) || 1,
              unitPrice: Number(item.unit_price) || 0,
              discount: 0,
            }))
          } else if (parsedNotes.lines && Array.isArray(parsedNotes.lines)) {
            lines = parsedNotes.lines.map((l: any) => ({
              product: l.product || {
                id: l.productId || l.id,
                code: l.code || 'ART',
                name: l.name || 'Article',
                unit: l.unit || 'Pièce',
                selling_price: l.unitPrice || 0,
                cost_price: 0,
              },
              qty: Number(l.qty) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              discount: Number(l.discount) || 0,
              batchTierLabel: l.batchTierLabel,
            }))
          }

          const clientName = s.customer?.name || s.customer_name || parsedNotes.customer_name || metaFromUid.cn || 'Client Comptoir'
          const clientIfu = s.customer?.ifu_number || s.customer_ifu || parsedNotes.customer_ifu || null

          let paymentsList: PaymentLine[] = []
          if (Array.isArray(parsedNotes.payments) && parsedNotes.payments.length > 0) {
            paymentsList = parsedNotes.payments
          } else if (metaFromUid.payments && Array.isArray(metaFromUid.payments)) {
            paymentsList = metaFromUid.payments
          } else {
            const rawMethod = metaFromUid.pm || s.payment_method || (s.payment_status === 'credit' ? 'credit' : (s.payment_status || 'especes'))
            paymentsList = [
              {
                method: rawMethod as any,
                amount: Number(s.paid_amount ?? s.total_amount) || 0
              }
            ]
          }

          const isDeferredSale = s.order_type === 'pos_deferred' || s.status === 'pending_delivery' || metaFromUid.st === 'A_LIVRER'
          const isAvoir = s.payment_status === 'avoir' || s.status === 'cancelled' || metaFromUid.st === 'AVOIR'

          return {
            id: s.id,
            order_number: s.order_number || `VTE-${s.id.slice(0, 6)}`,
            date: s.order_date || s.created_at || new Date().toISOString(),
            customer_name: clientName,
            customer_id: s.customer_id,
            customer_ifu: clientIfu,
            total_amount: Number(s.total_amount) || 0,
            total_ht: Number(s.subtotal_ht ?? s.total_ht) || Math.round((Number(s.total_amount) || 0) / 1.18),
            total_tva: Number(s.tva_amount ?? s.total_tax) || 0,
            total_aib: Number(s.aib_amount) || 0,
            total_exonere: Number(parsedNotes.total_exonere) || 0,
            amount_paid: Number(s.paid_amount ?? s.amount_paid) || (s.payment_status === 'credit' ? 0 : Number(s.total_amount) || 0),
            credit_amount: Number(s.credit_amount) || (s.payment_status === 'credit' ? Number(s.total_amount) || 0 : 0),
            payments: paymentsList,
            is_deferred: isDeferredSale,
            status: isAvoir ? 'AVOIR' : isDeferredSale ? 'A_LIVRER' : 'COMPLET',
            lines,
          }
        })
        setSalesHistory(mappedSales)
      }
    } catch (err: any) {
      toast.error('Erreur chargement données', err.message)
      setProducts([])
      setCustomers([])
      setSalesHistory([])
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Synchronisation temps réel Supabase dans le POS
  useEffect(() => {
    if (!company?.id) return

    const channel = supabase
      .channel(`products-pos-${company.id}`)
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

  // ─── Gestion de la Modale Détail Produit ───────────────────────────────────

  const handleOpenProductDetail = (product: Product) => {
    setSelectedProductForDetail(product)
    setDetailQty(1)
  }

  const handleConfirmAddToCart = () => {
    if (!selectedProductForDetail) return
    const qty = Number(detailQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Quantité invalide', 'Veuillez saisir une quantité supérieure à 0.')
      return
    }

    const match = calculateBatchLinePrice(
      qty,
      selectedProductForDetail.batch_pricing,
      selectedProductForDetail.selling_price
    )

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === selectedProductForDetail.id)
      if (existing) {
        const combinedQty = Math.round((existing.qty + qty) * 1000) / 1000
        const combinedMatch = calculateBatchLinePrice(
          combinedQty,
          selectedProductForDetail.batch_pricing,
          selectedProductForDetail.selling_price
        )
        return prev.map((i) =>
          i.product.id === selectedProductForDetail.id
            ? {
                ...i,
                qty: combinedQty,
                unitPrice: combinedMatch.effectiveUnitPriceTtc,
                batchTierLabel: combinedMatch.matchedTierLabel,
                isBatchTier: combinedMatch.isMatched,
              }
            : i
        )
      }
      return [
        ...prev,
        {
          product: selectedProductForDetail,
          qty,
          unitPrice: match.effectiveUnitPriceTtc,
          discount: 0,
          batchTierLabel: match.matchedTierLabel,
          isBatchTier: match.isMatched,
        }
      ]
    })

    setSelectedProductForDetail(null)
    setDetailQty(1)
    setIsCartVisible(true) // Glissement immédiat et visibilité du panier à droite lors de l'ajout
  }

  const updateCartItemQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }
    const safeQty = Math.round(newQty * 1000) / 1000
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i
        const match = calculateBatchLinePrice(
          safeQty,
          i.product.batch_pricing,
          i.product.selling_price
        )
        return {
          ...i,
          qty: safeQty,
          unitPrice: match.effectiveUnitPriceTtc,
          batchTierLabel: match.matchedTierLabel,
          isBatchTier: match.isMatched,
        }
      })
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  const clearCart = () => {
    setCart([])
    setSelectedCustomerId('')
    setIsDeferred(false)
  }

  // =============================================================================
  // AUDIT & FORMULES FINANCIÈRES VENTE & POINT DE VENTE (POS) :
  // 1. Sous-total TTC brut :
  //    Somme(quantité * prix_unitaire_TTC)
  // 2. Remise totale :
  //    Somme(quantité * remise_unitaire)
  // 3. Total Net TTC à payer :
  //    Max(0, Sous-total TTC brut - Remise totale)
  // 4. Décomposition fiscale stricte (UEMOA / Bénin DGI) :
  //    - Pour les articles assujettis TVA (taux standard 18%) :
  //      * HT = Ligne TTC / (1 + taux_tva / 100) = Ligne TTC / 1.18
  //      * TVA = Ligne TTC - Ligne HT
  //      * AIB (si applicable, 1% pour commerçants immatriculés IFU ou 5% non immatriculés) = Ligne HT * (taux_aib / 100)
  //    - Pour les articles exonérés de TVA :
  //      * HT = Ligne TTC, TVA = 0 FCFA
  // 5. Encaissement Espèces & Monnaie :
  //    - Monnaie à rendre = Max(0, Espèces remises - Total Net TTC)
  // 6. Règle multi-modes de paiement :
  //    - Équilibre strict obligatoire : Mode 1 (montant) + Mode 2 (montant) === Total Net TTC
  // =============================================================================

  const subtotalTTC = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
  }, [cart])

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty * i.discount, 0)
  }, [cart])

  const totalNetTTC = Math.max(0, subtotalTTC - totalDiscount)

  // Décomposition fiscale ligne par ligne rigoureuse
  const cartFiscalSummary = useMemo(() => {
    let ht = 0
    let tva = 0
    let aib = 0
    let totalExonere = 0

    cart.forEach((item) => {
      const lineTtc = item.qty * item.unitPrice - item.qty * item.discount
      const isVat = Boolean(item.product.is_vat_subject ?? (item.product.vat_rate && item.product.vat_rate > 0) ?? false)
      const vatRate = isVat ? (item.product.vat_rate || 18) : 0
      const isAib = Boolean(item.product.is_aib_subject ?? item.product.sector_meta?.is_aib_subject ?? false)
      const aibRate = isAib ? (item.product.aib_rate || 1) : 0

      const tax = calculateTaxFromTTC(
        lineTtc,
        isVat,
        vatRate,
        isAib,
        aibRate
      )
      ht += tax.htPrice
      tva += tax.vatAmount
      aib += tax.aibAmount
      if (!isVat) {
        totalExonere += lineTtc
      }
    })

    return {
      ht: Math.round(ht * 100) / 100,
      tva: Math.round(tva * 100) / 100,
      aib: Math.round(aib * 100) / 100,
      totalExonere: Math.round(totalExonere * 100) / 100,
    }
  }, [cart])

  // ─── Gestion des Modes de Paiement (Panier & Checkout Intégré) ──────────────

  // Synchronisation des montants lors des variations du Total TTC
  useEffect(() => {
    if (!cashReceivedInput || Number(cashReceivedInput) < totalNetTTC) {
      setCashReceivedInput(String(totalNetTTC))
    }
    if (isMultiMode) {
      if (multiMode1Amount > totalNetTTC) {
        setMultiMode1Amount(totalNetTTC)
        setMultiMode2Amount(0)
      } else {
        setMultiMode2Amount(Math.max(0, Math.round(totalNetTTC - multiMode1Amount)))
      }
    } else {
      setMultiMode1Amount(totalNetTTC)
      setMultiMode2Amount(0)
    }
  }, [totalNetTTC])

  const handleToggleMultiMode = (checked: boolean) => {
    setIsMultiMode(checked)
    if (checked) {
      const half = Math.round(totalNetTTC / 2)
      setMultiMode1Amount(half)
      setMultiMode2Amount(totalNetTTC - half)
      if (multiMode1Canal === multiMode2Canal) {
        setMultiMode2Canal(multiMode1Canal === 'especes' ? 'momo_mtn' : 'especes')
      }
    }
  }

  const handleMode1AmountChange = (val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val)
    setMultiMode1Amount(safeVal)
    // Ajustement automatique instantané du montant 2 avec le reliquat exact
    setMultiMode2Amount(Math.max(0, Math.round(totalNetTTC - safeVal)))
  }

  const handleMode2AmountChange = (val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val)
    setMultiMode2Amount(safeVal)
  }

  // Calculs en temps réel multi-modes
  const multiSum = Math.round((multiMode1Amount + multiMode2Amount) * 100) / 100
  const multiDiff = Math.round((totalNetTTC - multiSum) * 100) / 100
  const isMultiBalanced = isMultiMode && Math.abs(multiDiff) === 0 && totalNetTTC > 0 && multiMode1Amount >= 0 && multiMode2Amount >= 0

  // Calculs espèces en mode unique
  const isCash = singleMethod === 'especes'
  const cashGiven = Number(cashReceivedInput) || 0
  const cashChange = Math.max(0, cashGiven - totalNetTTC)
  const isCashInsufficient = isCash && cashGiven < totalNetTTC

  // Règle de validation stricte : Déverrouillage uniquement si équilibre parfait
  const isPaymentValid = isMultiMode
    ? isMultiBalanced
    : (!isCashInsufficient && totalNetTTC > 0)

  const canValidateSale = cart.length > 0 && isPaymentValid && !paying

  // Libellé dynamique du bouton de validation selon l'équilibre
  const validationButtonText = useMemo(() => {
    if (cart.length === 0) return 'Panier vide'
    if (paying) return 'Validation en cours...'

    if (isMultiMode) {
      if (multiDiff > 0) {
        return `Validation impossible : Somme ≠ Total TTC (Reste ${fmt(multiDiff)})`
      }
      if (multiDiff < 0) {
        return `Validation impossible : Somme ≠ Total TTC (Trop perçu ${fmt(Math.abs(multiDiff))})`
      }
      return `Valider la Vente (${fmt(totalNetTTC)})`
    } else {
      if (isCashInsufficient) {
        return `Validation impossible : Espèces insuffisantes (Reste ${fmt(totalNetTTC - cashGiven)})`
      }
      return `Valider la Vente (${fmt(totalNetTTC)})`
    }
  }, [cart.length, paying, isMultiMode, multiDiff, totalNetTTC, isCashInsufficient, cashGiven])

  // ─── Validation de la Vente ────────────────────────────────────────────────

  const handleValidateSale = async () => {
    // 1. Contrôle strict des montants
    if (isMultiMode) {
      if (Math.abs(multiDiff) > 0.01) {
        toast.error('Paiement non équilibré', `La somme des règlements (${fmt(multiSum)}) doit être strictement égale au Total TTC (${fmt(totalNetTTC)}).`)
        return
      }
      if (multiMode1Amount < 0 || multiMode2Amount < 0) {
        toast.error('Montant invalide', 'Les montants des règlements ne peuvent pas être négatifs.')
        return
      }
    } else if (isCash && cashGiven < totalNetTTC) {
      toast.error('Espèces insuffisantes', `Le montant remis (${fmt(cashGiven)}) est inférieur au total TTC (${fmt(totalNetTTC)}).`)
      return
    }

    // 2. Contrôle crédit obligatoire
    const creditAmount = isMultiMode
      ? ((multiMode1Canal === 'credit' ? multiMode1Amount : 0) + (multiMode2Canal === 'credit' ? multiMode2Amount : 0))
      : (singleMethod === 'credit' ? totalNetTTC : 0)

    if (creditAmount > 0) {
      if (!selectedCustomerId) {
        toast.error('Client Obligatoire', 'Veuillez sélectionner un client pour une vente à crédit.')
        return
      }
      if (selectedCustomer && selectedCustomer.credit_authorized === false) {
        toast.error('Crédit non autorisé', `Le client ${selectedCustomer.name} n'est pas autorisé aux achats à crédit.`)
        return
      }
    }

    setPaying(true)
    try {
      const orderNum = `VTE-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`

      const paymentsList: PaymentLine[] = isMultiMode
        ? [
            ...(multiMode1Amount > 0 ? [{ method: multiMode1Canal as any, amount: multiMode1Amount }] : []),
            ...(multiMode2Amount > 0 ? [{ method: multiMode2Canal as any, amount: multiMode2Amount }] : []),
          ]
        : [{ method: singleMethod as any, amount: totalNetTTC }]

      const primaryMethod = isMultiMode
        ? (paymentsList.find(p => p.amount > 0)?.method || 'especes')
        : singleMethod

      const totalCost = cart.reduce((sum, item) => sum + item.qty * (item.product.cost_price || 0), 0)

      const notesPayload = {
        sector_slug: currentSectorSlug,
        payments: paymentsList,
        customer_name: selectedCustomer ? selectedCustomer.name : 'Client Comptoir',
        customer_ifu: selectedCustomer?.ifu_number || null,
        is_deferred: isDeferred,
        total_exonere: cartFiscalSummary.totalExonere,
        lines: cart.map(c => ({
          product: {
            id: c.product.id,
            code: c.product.code,
            name: c.product.name,
            unit: c.product.unit || c.product.uv || 'Pièce',
            cost_price: c.product.cost_price,
            selling_price: c.product.selling_price,
            is_vat_subject: c.product.is_vat_subject,
            vat_rate: c.product.vat_rate,
            is_aib_subject: c.product.is_aib_subject,
            aib_rate: c.product.aib_rate
          },
          qty: c.qty,
          unitPrice: c.unitPrice,
          discount: c.discount
        }))
      }

      // 1. Insertion garantie en base de données Supabase dans sales_orders
      const custName = selectedCustomer ? selectedCustomer.name : 'Client Comptoir'
      const todayDate = new Date().toISOString().split('T')[0]
      const encodedMeta = `PAY:${primaryMethod}|CL:${custName.slice(0, 20)}|SEC:${currentSectorSlug}|ST:${isDeferred ? 'A_LIVRER' : 'COMPLET'}`.slice(0, 100)

      // Payload strictement conforme aux colonnes réelles de sales_orders dans Supabase
      const baseSalePayload: any = {
        company_id: company.id,
        customer_id: selectedCustomer?.id || null,
        order_number: orderNum,
        order_type: isDeferred ? 'pos_deferred' : 'pos_direct',
        order_date: todayDate,
        subtotal_ht: cartFiscalSummary.ht,
        tva_amount: cartFiscalSummary.tva,
        aib_amount: cartFiscalSummary.aib,
        total_amount: totalNetTTC,
        total_cost: totalCost,
        paid_amount: totalNetTTC - creditAmount,
        credit_amount: creditAmount,
        payment_status: creditAmount >= totalNetTTC ? 'credit' : primaryMethod,
        e_mecef_uid: encodedMeta,
        created_by: user?.id || null
      }

      // Payload étendu si des colonnes optionnelles ont été ajoutées (ex: M014/M018)
      const fullSalePayload: any = {
        ...baseSalePayload,
        sector_slug: currentSectorSlug,
        payment_method: primaryMethod,
        customer_name: custName,
        status: isDeferred ? 'pending_delivery' : 'COMPLET',
        notes: JSON.stringify(notesPayload)
      }

      let savedDbSale: any = null

      // Tentative avec colonnes étendues d'abord
      const { data: dbSale, error: dbSaleErr } = await supabase
        .from('sales_orders')
        .insert(fullSalePayload)
        .select()
        .single()

      if (!dbSaleErr && dbSale) {
        savedDbSale = dbSale
      } else {
        // Fallback garanti sur le schéma natif Supabase (sans sector_slug ni colonnes manquantes)
        const { data: fbSale, error: fbErr } = await supabase
          .from('sales_orders')
          .insert(baseSalePayload)
          .select()
          .single()

        if (fbErr || !fbSale) {
          console.error('Erreur critique insertion sales_orders:', fbErr)
          throw new Error(`Échec d'enregistrement de la vente dans Supabase : ${fbErr?.message || 'Erreur inconnue'}`)
        }
        savedDbSale = fbSale
      }

      if (!savedDbSale?.id) {
        throw new Error("L'identifiant de la vente n'a pas pu être validé par Supabase.")
      }

      // 2. Insertion des lignes réelles dans sales_order_items (source de vérité Supabase)
      const lineItems = cart.map((line) => {
        const isTaxed = line.product.is_vat_subject && (line.product.vat_rate || 18) > 0
        const lineTotal = line.qty * line.unitPrice
        const lineHt = isTaxed ? Math.round((lineTotal / (1 + (line.product.vat_rate || 18) / 100)) * 100) / 100 : lineTotal
        return {
          order_id: savedDbSale.id,
          product_id: line.product.id,
          product_name: line.product.name,
          quantity: line.qty,
          unit_price: line.unitPrice,
          unit_cost: line.product.cost_price || 0,
          tva_rate: isTaxed ? (line.product.vat_rate || 18) : 0,
          total_ht: lineHt,
          total_ttc: lineTotal
        }
      })
      const { error: linesErr } = await supabase.from('sales_order_items').insert(lineItems)
      if (linesErr) {
        console.warn('Avertissement insertion sales_order_items:', linesErr.message)
      }

      // 3. Déstockage strict dans le Stock Vente (en UV) sans altérer le Stock Magasin (en UCD)
      for (const line of cart) {
        if (line.product?.id) {
          try {
            const currentStockVente = Number(line.product.stock_vente ?? line.product.sector_meta?.stock_vente ?? 0)
            const currentStockMagasin = Number(line.product.stock_magasin ?? line.product.sector_meta?.stock_magasin ?? 0)
            const newStockVente = Math.max(0, Math.round((currentStockVente - line.qty) * 1000) / 1000)

            const currentMeta = line.product.sector_meta || {}
            const updatedMeta = {
              ...currentMeta,
              stock_vente: newStockVente,
              stock_magasin: currentStockMagasin, // Reste intact en UCD
              ucd: line.product.ucd || currentMeta.ucd || 'Carton',
              uv: line.product.uv || currentMeta.uv || line.product.unit || 'Pièce',
              coef: Number(line.product.coef || currentMeta.coef || 1)
            }

            // Mise à jour de la table products
            await supabase
              .from('products')
              .update({ sector_meta: updatedMeta })
              .eq('id', line.product.id)

            // Traçabilité mouvement de stock dans stock_movements
            await supabase.from('stock_movements').insert({
              company_id: company.id,
              product_id: line.product.id,
              movement_type: 'VENTE_POS',
              reference_type: 'sales_order',
              reference_id: savedDbSale.id,
              reference_number: orderNum,
              quantity: -line.qty,
              previous_stock: currentStockVente,
              new_stock: newStockVente,
              unit_cost: line.product.cost_price || 0,
              total_cost: (line.product.cost_price || 0) * line.qty,
              notes: `Vente POS ${orderNum} - Déstockage Stock Vente : ${line.qty} ${line.product.uv || line.product.unit || 'UV'}`
            })

            setProducts((prev) =>
              prev.map((p) => (p.id === line.product.id ? { ...p, stock_vente: newStockVente, sector_meta: updatedMeta } : p))
            )
          } catch (err: any) {
            console.warn('Erreur déstockage ligne vente :', err?.message)
          }
        }
      }

      // 4. Si client avec crédit, mise à jour de la créance dans Supabase
      if (selectedCustomer && creditAmount > 0) {
        const newDebt = (Number(selectedCustomer.current_debt) || 0) + creditAmount
        await supabase
          .from('customers')
          .update({ current_debt: newDebt })
          .eq('id', selectedCustomer.id)

        setCustomers((prev) =>
          prev.map((c) => (c.id === selectedCustomer.id ? { ...c, current_debt: newDebt } : c))
        )
      }

      // 5. Synchronisation Caisse en temps réel & persistance Supabase
      const paidCash = isMultiMode
        ? ((multiMode1Canal === 'especes' ? multiMode1Amount : 0) + (multiMode2Canal === 'especes' ? multiMode2Amount : 0))
        : (singleMethod === 'especes' ? totalNetTTC : 0)

      const paidMomo = isMultiMode
        ? (
            (['momo_mtn', 'momo_moov'].includes(multiMode1Canal) ? multiMode1Amount : 0) +
            (['momo_mtn', 'momo_moov'].includes(multiMode2Canal) ? multiMode2Amount : 0)
          )
        : (['momo_mtn', 'momo_moov'].includes(singleMethod) ? totalNetTTC : 0)

      if (paidCash > 0 || paidMomo > 0) {
        try {
          const { data: registers } = await supabase
            .from('cash_registers')
            .select('*')
            .eq('company_id', company.id)
            .limit(1)

          if (registers && registers.length > 0) {
            const reg = registers[0]
            await supabase
              .from('cash_registers')
              .update({
                current_cash_balance: (Number(reg.current_cash_balance) || 0) + paidCash,
                current_momo_balance: (Number(reg.current_momo_balance) || 0) + paidMomo
              })
              .eq('id', reg.id)
          } else {
            await supabase
              .from('cash_registers')
              .insert({
                company_id: company.id,
                name: 'Caisse Principale POS',
                current_cash_balance: paidCash,
                current_momo_balance: paidMomo,
                is_active: true
              })
          }
        } catch (e) {
          console.warn('Avertissement cash_registers Supabase:', e)
        }
      }

      // 6. Traçabilité Journal d'Audit automatique dans Supabase
      try {
        const { logAuditEvent } = await import('../../../services/auditService')
        await logAuditEvent({
          companyId: company.id,
          userId: user?.id,
          userName: user?.full_name || user?.username,
          userRole: user?.role,
          module: 'Vente-POS',
          action: 'VENTE',
          description: `Vente N° ${orderNum} enregistrée - Montant: ${fmt(totalNetTTC)} (${primaryMethod}) - Client: ${custName}`,
          entityName: 'sales_orders',
          entityId: savedDbSale.id
        })
      } catch (e) {}

      const newSale: SaleRecord = {
        id: savedDbSale.id,
        order_number: orderNum,
        date: new Date().toISOString(),
        customer_name: custName,
        customer_id: selectedCustomer?.id,
        customer_ifu: selectedCustomer?.ifu_number,
        total_amount: totalNetTTC,
        total_ht: cartFiscalSummary.ht,
        total_tva: cartFiscalSummary.tva,
        total_aib: cartFiscalSummary.aib,
        total_exonere: cartFiscalSummary.totalExonere,
        amount_paid: totalNetTTC - creditAmount,
        credit_amount: creditAmount,
        payments: paymentsList,
        is_deferred: isDeferred,
        status: isDeferred ? 'A_LIVRER' : 'COMPLET',
        lines: [...cart],
      }

      setSalesHistory([newSale, ...salesHistory.filter(s => s.id !== newSale.id)])
      setCurrentSale(newSale)
      setShowInvoiceModal(true)
      clearCart()
      toast.success('Vente enregistrée avec succès !', `Réf : ${orderNum}`)
    } catch (err: any) {
      toast.error('Erreur validation vente', err.message)
    } finally {
      setPaying(false)
    }
  }

  // ─── Facture d'Avoir Réelle avec Supabase ──────────────────────────────────

  const handleCreateAvoir = async (sale: SaleRecord) => {
    if (sale.status === 'AVOIR') {
      toast.error('Opération impossible', 'Cette facture fait déjà l\'objet d\'un avoir.')
      return
    }

    try {
      // 1. Mettre à jour sales_orders dans Supabase
      await supabase
        .from('sales_orders')
        .update({
          payment_status: 'avoir',
          e_mecef_uid: `PAY:avoir|CL:${sale.customer_name.slice(0, 30)}|ST:AVOIR`.slice(0, 100)
        })
        .eq('id', sale.id)

      // 2. Si crédit, restaurer la dette du client dans Supabase
      if (sale.credit_amount > 0 && sale.customer_id) {
        const cust = customers.find((c) => c.id === sale.customer_id)
        if (cust) {
          const updatedDebt = Math.max(0, (cust.current_debt || 0) - sale.credit_amount)
          await supabase
            .from('customers')
            .update({ current_debt: updatedDebt })
            .eq('id', cust.id)

          setCustomers((prev) =>
            prev.map((c) => (c.id === cust.id ? { ...c, current_debt: updatedDebt } : c))
          )
        }
      }

      // 3. Réintégrer le stock dans le Stock Vente (en UV)
      for (const line of sale.lines) {
        if (line.product?.id) {
          const prod = products.find((p) => p.id === line.product.id)
          const currentStockVente = Number(prod?.stock_vente ?? prod?.sector_meta?.stock_vente ?? 0)
          const currentStockMagasin = Number(prod?.stock_magasin ?? prod?.sector_meta?.stock_magasin ?? 0)
          const restoredStockVente = Math.round((currentStockVente + line.qty) * 1000) / 1000

          const currentMeta = prod?.sector_meta || {}
          const updatedMeta = { ...currentMeta, stock_vente: restoredStockVente, stock_magasin: currentStockMagasin }

          await supabase
            .from('products')
            .update({ sector_meta: updatedMeta })
            .eq('id', line.product.id)

          await supabase.from('stock_movements').insert({
            company_id: company.id,
            product_id: line.product.id,
            movement_type: 'RETOUR_AVOIR',
            reference_type: 'sales_order',
            reference_id: sale.id,
            reference_number: `AVOIR-${sale.order_number}`,
            quantity: line.qty,
            previous_stock: currentStockVente,
            new_stock: restoredStockVente,
            unit_cost: line.product.cost_price || 0,
            total_cost: (line.product.cost_price || 0) * line.qty,
            notes: `Retour Stock Vente sur Avoir ${sale.order_number}`
          })

          setProducts((prev) =>
            prev.map((p) => (p.id === line.product.id ? { ...p, stock_vente: restoredStockVente, sector_meta: updatedMeta } : p))
          )
        }
      }

      const updated = salesHistory.map((s) =>
        s.id === sale.id ? { ...s, status: 'AVOIR' as const } : s
      )
      setSalesHistory(updated)
      toast.success('Facture d\'Avoir générée', `Avoir créé avec succès pour la vente ${sale.order_number}`)
    } catch (err: any) {
      toast.error('Erreur création avoir', err.message)
    }
  }

  // ─── Génération et Téléchargement PDF de Facture ───────────────────────────

  const handleDownloadPDF = (sale: SaleRecord) => {
    try {
      const doc = new jsPDF()

      // En-tête de l'entreprise
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(5, 150, 105)
      doc.text(company?.name || 'GESTIO 229 ERP', 14, 20)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text(`IFU : ${company?.ifu_number || 'Non renseigné'}  |  RCCM : ${company?.rccm_number || 'Non renseigné'}`, 14, 26)
      doc.text(`${company?.address ? `${company.address}, ` : ''}${company?.city || 'Cotonou, République du Bénin'}`, 14, 31)
      doc.text(`Tél : ${company?.phone || '+229 01 00 00 00'}  |  Email : ${company?.email || 'contact@gestio229.bj'}`, 14, 36)

      // Bloc Titre & Réf Facture
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      const docTitle = sale.status === 'AVOIR' ? "FACTURE D'AVOIR" : 'FACTURE DE VENTE'
      doc.text(docTitle, 135, 20)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`N° : ${sale.order_number}`, 135, 26)
      doc.text(`Date : ${new Date(sale.date).toLocaleString('fr-BJ')}`, 135, 31)
      doc.text(`Caisse : Caisse Principale POS`, 135, 36)

      doc.setDrawColor(226, 232, 240)
      doc.line(14, 42, 196, 42)

      // Bloc Facturé à
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(14, 46, 182, 16, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text('FACTURÉ À :', 18, 52)
      doc.setTextColor(15, 23, 42)
      doc.setFontSize(11)
      doc.text(sale.customer_name || 'Client Comptoir', 18, 58)

      if (sale.customer_ifu) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text(`N° IFU : ${sale.customer_ifu}`, 120, 58)
      }

      // Tableau des Lignes
      const tableData = sale.lines.map((l) => [
        l.product.code || 'ART',
        l.product.name,
        String(l.qty),
        l.product.unit || 'Pièce',
        fmt(l.unitPrice),
        fmt(l.qty * l.unitPrice)
      ])

      autoTable(doc, {
        startY: 68,
        head: [['Réf', 'Désignation', 'Qté', 'Unité', 'Prix Unit. TTC', 'Total TTC']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 41, 59]
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 'auto' },
          2: { halign: 'center', cellWidth: 18 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'right', cellWidth: 32 },
          5: { halign: 'right', cellWidth: 35 }
        }
      })

      const finalY = (doc as any).lastAutoTable.finalY + 10
      const startX = 120

      // Totaux
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text('Total Hors Taxes :', startX, finalY)
      doc.text(fmt(sale.total_ht), 196, finalY, { align: 'right' })

      doc.text('Total TVA (18%) :', startX, finalY + 6)
      doc.text(fmt(sale.total_tva), 196, finalY + 6, { align: 'right' })

      if (sale.total_aib && sale.total_aib > 0) {
        doc.text('Total AIB :', startX, finalY + 12)
        doc.text(fmt(sale.total_aib), 196, finalY + 12, { align: 'right' })
      }

      const netY = (sale.total_aib && sale.total_aib > 0) ? finalY + 18 : finalY + 12

      doc.setDrawColor(203, 213, 225)
      doc.line(startX, netY - 2, 196, netY - 2)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('NET À PAYER :', startX, netY + 4)
      doc.setTextColor(5, 150, 105)
      doc.text(fmt(sale.total_amount), 196, netY + 4, { align: 'right' })

      // Règlements
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(71, 85, 105)
      doc.text('Règlements :', 14, finalY)
      doc.setFont('helvetica', 'normal')
      let pY = finalY + 6
      sale.payments.forEach((p) => {
        doc.text(`• ${p.method.replace('_', ' ').toUpperCase()} : ${fmt(p.amount)}`, 14, pY)
        pY += 5
      })
      if (sale.credit_amount > 0) {
        doc.setTextColor(225, 29, 72)
        doc.setFont('helvetica', 'bold')
        doc.text(`• Reste Dû (Crédit) : ${fmt(sale.credit_amount)}`, 14, pY)
      }

      // Mentions Légales
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(148, 163, 184)
      doc.text('Facture commerciale émise par GESTIO 229 ERP — République du Bénin', 105, 280, { align: 'center' })

      doc.save(`Facture_${sale.order_number}.pdf`)
      toast.success('Facture PDF générée', `Téléchargement : Facture_${sale.order_number}.pdf`)
    } catch (e: any) {
      console.error('Erreur génération PDF:', e)
      toast.error('Erreur génération PDF', e.message)
    }
  }

  // Filtrages
  const filteredProducts = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  )

  const filteredHistory = salesHistory.filter(
    (s) =>
      !historySearch ||
      s.order_number.toLowerCase().includes(historySearch.toLowerCase()) ||
      s.customer_name.toLowerCase().includes(historySearch.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* ── En-tête & Onglets ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" />
            Vente & POS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Saisie TTC, Décomposition fiscale automatique HT & TVA, Multi-règlements et Facturation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'pos'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <ShoppingCart className="w-4 h-4" /> Point de Vente
          </button>
          <button
            onClick={() => setActiveTab('historique')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'historique'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <Clock className="w-4 h-4" /> Historique ({salesHistory.length})
          </button>
        </div>
      </div>

      {activeTab === 'pos' ? (
        /* ── VUE 1 : POINT DE VENTE (CATALOGUE & PANIER INTÉGRÉ GLISSANT À DROITE) ── */
        <div className="flex flex-col lg:flex-row gap-4 items-start relative">
          {/* CATALOGUE GAUCHE */}
          <div className="flex-1 w-full min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden h-[calc(100vh-13rem)] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Rechercher produit par désignation ou code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={loadData}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                title="Actualiser les produits"
              >
                <RefreshCw className={clsx('w-4 h-4 text-slate-500', loading && 'animate-spin')} />
              </button>

              {/* Bouton bascule Panier (Permet d'agrandir le catalogue à 100% ou de rouvrir le panier) */}
              <button
                type="button"
                onClick={() => setIsCartVisible(!isCartVisible)}
                className={clsx(
                  'px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm',
                  isCartVisible
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                )}
                title={isCartVisible ? 'Masquer le panneau panier' : 'Afficher le panneau panier'}
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isCartVisible ? 'Masquer Panier' : `Panier (${cart.length})`}
                </span>
                {cart.length > 0 && !isCartVisible && (
                  <span className="bg-white text-emerald-700 text-[10px] font-black rounded-full px-1.5 py-0.5 ml-1">
                    {fmt(totalNetTTC)}
                  </span>
                )}
              </button>
            </div>

            {/* Grille des articles sous forme de cartes professionnelles */}
            <div className={clsx(
              'flex-1 overflow-y-auto grid gap-3 pr-1 pb-4',
              isCartVisible
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            )}>
              {filteredProducts.length === 0 ? (
                <div className="col-span-full p-8 text-center text-slate-400 text-xs">
                  {loading ? 'Chargement des articles...' : 'Aucun produit actif disponible.'}
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const stockVente = Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0)
                  const stockMagasin = Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0)
                  const wholesalePrice = Number(p.wholesale_price || p.sector_meta?.price_vente_ucd_ttc || 0)
                  const unitVente = p.uv || p.unit || 'Pièce'
                  const unitMagasin = p.ucd || 'Carton'

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleOpenProductDetail(p)}
                      className="group relative flex flex-col justify-between p-3.5 bg-white hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-400 rounded-2xl text-left transition-all duration-150 shadow-sm hover:shadow cursor-pointer select-none"
                    >
                      <div>
                        {/* En-tête : Référence + Badge Stock Vente */}
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {p.code}
                          </span>
                          <span
                            className={clsx(
                              'text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5',
                              stockVente > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            )}
                            title={`Stock disponible vente directe : ${stockVente} ${unitVente}`}
                          >
                            Vente : {stockVente} {unitVente}
                          </span>
                        </div>

                        {/* Vignette Produit avec Photo ou Icône et Nom */}
                        <div className="flex items-start gap-2.5 my-1">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-100/60 flex items-center justify-center flex-shrink-0 text-slate-600 group-hover:text-emerald-700 transition">
                            <Layers className="w-5 h-5" />
                          </div>
                          <p className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 line-clamp-2 leading-tight">
                            {p.name}
                          </p>
                        </div>

                        {/* Stock Magasin disponible */}
                        <div className="text-[10px] text-slate-500 flex items-center justify-between mt-1 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100 font-medium">
                          <span>Stock Magasin :</span>
                          <span className="font-bold text-indigo-700 font-mono">{stockMagasin} {unitMagasin}</span>
                        </div>
                      </div>

                      {/* Tarification : Prix unitaire détail & Prix de gros */}
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-slate-500 font-medium">Prix Détail ({unitVente}) :</span>
                          <span className="text-xs font-black text-emerald-700 font-mono">{fmt(p.selling_price)}</span>
                        </div>
                        {wholesalePrice > 0 && (
                          <div className="flex items-baseline justify-between text-[10px] text-slate-500">
                            <span>Prix Gros ({unitMagasin}) :</span>
                            <span className="font-mono font-semibold text-slate-700">{fmt(wholesalePrice)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── PANNEAU PANIER GLISSANT & ENCAISSEMENT DIRECTEMENT INTÉGRÉ À DROITE ── */}
          {isCartVisible && (
            <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-13rem)] overflow-hidden transition-all duration-300">
              {/* En-tête Panier */}
              <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50/90 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-xs">Panier & Encaissement</h3>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {cart.length === 0 ? 'Aucun article' : `${cart.length} article${cart.length > 1 ? 's' : ''} au panier`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg hover:bg-rose-50 transition"
                      title="Vider tout le panier"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Vider
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCartVisible(false)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-200/60 transition"
                    title="Masquer le panneau panier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Corps Défilable Interne : Client, Articles, Totaux Fiscaux, Règlements */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
                {/* 1. Sélection Client & Vente Différée */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-xl p-2 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">👤 Client Comptoir (Par défaut)</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.current_debt > 0 ? `(Dette : ${fmt(c.current_debt)})` : ''}
                          {c.credit_authorized === false ? ' [Crédit non autorisé]' : ''}
                          {c.discount_eligible && (c.discount_rate || 0) > 0 ? ` [Remise ${c.discount_rate}%]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCustomer && selectedCustomer.discount_eligible && (selectedCustomer.discount_rate || 0) > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-xl border border-amber-200">
                      <span>🏷️ Remise Client : -{selectedCustomer.discount_rate}% accordée</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={isDeferred}
                        onChange={(e) => setIsDeferred(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>📦 Vente Différée (Bon de Livraison)</span>
                    </label>
                  </div>
                </div>

                {/* 2. Liste des lignes du Panier */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Articles au Panier ({cart.length})
                  </h4>

                  {cart.length === 0 ? (
                    <div className="p-5 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                      <ShoppingCart className="w-7 h-7 mb-1.5 stroke-[1.5] text-slate-300 mx-auto" />
                      <p className="font-semibold text-xs text-slate-600">Panier vide</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Cliquez sur un produit du catalogue à gauche</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto pr-1">
                      {cart.map((item) => {
                        const lineTotal = item.qty * item.unitPrice - item.qty * item.discount
                        return (
                          <div key={item.product.id} className="py-2 first:pt-0 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs text-slate-800 truncate">{item.product.name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-[10px] text-slate-500 font-mono">
                                  {fmt(item.unitPrice)} / {item.product.unit || 'Pièce'}
                                </p>
                                {item.batchTierLabel && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1 rounded">
                                    {item.batchTierLabel}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
                              <button
                                type="button"
                                onClick={() => updateCartItemQty(item.product.id, item.qty - 1)}
                                className="w-5 h-5 bg-white rounded-lg flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 transition"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <input
                                type="number"
                                step="any"
                                value={item.qty}
                                onChange={(e) => updateCartItemQty(item.product.id, Number(e.target.value))}
                                className="w-10 text-center text-xs font-mono font-bold bg-transparent border-0 focus:ring-0 p-0"
                              />
                              <button
                                type="button"
                                onClick={() => updateCartItemQty(item.product.id, item.qty + 1)}
                                className="w-5 h-5 bg-white rounded-lg flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 transition"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            <div className="text-right min-w-[70px]">
                              <p className="font-bold text-xs text-slate-900 font-mono">{fmt(lineTotal)}</p>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.product.id)}
                                className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold"
                              >
                                Retirer
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 3. Récapitulatif Sous-total, TVA, Total TTC */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>Sous-total HT :</span>
                    <span className="font-mono font-bold">{fmt(cartFiscalSummary.ht)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>TVA (18%) :</span>
                    <span className="font-mono font-bold">{fmt(cartFiscalSummary.tva)}</span>
                  </div>
                  {cartFiscalSummary.aib > 0 && (
                    <div className="flex justify-between text-slate-600 text-[11px]">
                      <span>AIB (Calculé sur HT) :</span>
                      <span className="font-mono font-bold">{fmt(cartFiscalSummary.aib)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-1.5 border-t border-slate-200">
                    <span className="text-slate-800 uppercase tracking-tight text-xs">TOTAL TTC :</span>
                    <span className="font-mono text-emerald-700 text-base font-black">{fmt(totalNetTTC)}</span>
                  </div>
                </div>

                {/* 4. VISIBILITÉ DIRECTE SOUS LE TOTAL TTC (MODES DE RÈGLEMENT) */}
                <div className="pt-1 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mode de Paiement</span>
                    </h4>

                    {/* Case à cocher ☐ Paiement par plusieurs modes */}
                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 transition">
                      <input
                        type="checkbox"
                        checked={isMultiMode}
                        onChange={(e) => handleToggleMultiMode(e.target.checked)}
                        className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer rounded"
                      />
                      <span className="text-[10px] font-bold text-slate-800">Plusieurs modes</span>
                    </label>
                  </div>

                  {!isMultiMode ? (
                    /* DÉCOCHÉE (MODE UNIQUE) : 5 boutons de paiement directs */
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'especes', label: '💵 Espèces' },
                          { id: 'momo_mtn', label: '📱 MTN MoMo' },
                          { id: 'momo_moov', label: '📱 Moov' },
                          { id: 'banque', label: '🏦 Banque' },
                          { id: 'credit', label: '📝 Crédit' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSingleMethod(m.id as any)}
                            className={clsx(
                              'p-2 rounded-xl border text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-sm',
                              singleMethod === m.id
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-600/20'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Si Espèces sélectionné : champ « Espèces reçues » + Monnaie à rendre en temps réel */}
                      {singleMethod === 'especes' && (
                        <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <label className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Espèces reçues :</span>
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={cashReceivedInput}
                                onChange={(e) => setCashReceivedInput(e.target.value)}
                                placeholder={String(totalNetTTC)}
                                className="w-28 p-1 border border-emerald-300 rounded-lg font-mono text-xs font-bold text-right bg-white focus:ring-2 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => setCashReceivedInput(String(totalNetTTC))}
                                className="px-1.5 py-1 bg-emerald-200/80 hover:bg-emerald-300 text-emerald-900 rounded-md text-[9px] font-black"
                                title="Montant exact remis"
                              >
                                Exact
                              </button>
                            </div>
                          </div>

                          {cashGiven >= totalNetTTC ? (
                            <div className="flex justify-between items-center pt-1 border-t border-emerald-200/80 text-[11px] font-bold">
                              <span className="text-emerald-900">Monnaie à rendre :</span>
                              <span className="font-mono text-emerald-700 text-xs font-black">
                                👉 {fmt(cashChange)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center pt-1 border-t border-rose-200 text-[11px] font-bold text-rose-700">
                              <span>⚠️ Manque :</span>
                              <span className="font-mono font-black">
                                {fmt(totalNetTTC - cashGiven)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* COCHÉE (MULTI-MODES) : Mode 1 et Mode 2 équilibrés */
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="text-[10px] font-bold text-slate-700">
                        Ventilation des règlements sur 2 modes :
                      </p>

                      {/* Mode 1 */}
                      <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">MODE 1</span>
                        <div className="grid grid-cols-12 gap-1.5">
                          <select
                            value={multiMode1Canal}
                            onChange={(e) => setMultiMode1Canal(e.target.value as any)}
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg text-[11px] font-bold bg-white"
                          >
                            <option value="especes">💵 Espèces</option>
                            <option value="momo_mtn">📱 MTN MoMo</option>
                            <option value="momo_moov">📱 Moov</option>
                            <option value="banque">🏦 Banque</option>
                            <option value="credit">📝 Crédit</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={multiMode1Amount || ''}
                            onChange={(e) => handleMode1AmountChange(Number(e.target.value))}
                            placeholder="Montant 1"
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg font-mono text-[11px] font-bold text-right"
                          />
                        </div>
                      </div>

                      {/* Mode 2 */}
                      <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">MODE 2 (AJUSTÉ)</span>
                        <div className="grid grid-cols-12 gap-1.5">
                          <select
                            value={multiMode2Canal}
                            onChange={(e) => setMultiMode2Canal(e.target.value as any)}
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg text-[11px] font-bold bg-white"
                          >
                            <option value="especes">💵 Espèces</option>
                            <option value="momo_mtn">📱 MTN MoMo</option>
                            <option value="momo_moov">📱 Moov</option>
                            <option value="banque">🏦 Banque</option>
                            <option value="credit">📝 Crédit</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={multiMode2Amount || ''}
                            onChange={(e) => handleMode2AmountChange(Number(e.target.value))}
                            placeholder="Montant 2"
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg font-mono text-[11px] font-bold text-right"
                          />
                        </div>
                      </div>

                      {/* Contrôle équilibre */}
                      <div className="pt-0.5">
                        {multiDiff > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>⚠️ Reste à percevoir : {fmt(multiDiff)}</span>
                          </div>
                        )}
                        {multiDiff < 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>⚠️ Trop perçu : {fmt(Math.abs(multiDiff))}</span>
                          </div>
                        )}
                        {multiDiff === 0 && totalNetTTC > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>✓ Équilibré ({fmt(totalNetTTC)})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pied du Panier : Bouton Valider la Vente en 1 clic */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  disabled={!canValidateSale}
                  onClick={handleValidateSale}
                  className={clsx(
                    'w-full py-3 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-sm',
                    canValidateSale
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-600/20'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  )}
                >
                  {paying ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{validationButtonText}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── VUE 2 : HISTORIQUE DES VENTES & AVOIRS ──────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par N° facture ou client..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 self-end sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Réf Facture</th>
                  <th className="p-3">Date & Heure</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Total TTC</th>
                  <th className="p-3 text-right">Payé</th>
                  <th className="p-3 text-right">Crédit</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                      Aucune vente enregistrée sur cette période.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition font-sans">
                      <td className="p-3 font-mono font-bold text-slate-900">{s.order_number}</td>
                      <td className="p-3 text-slate-500 font-mono">
                        {new Date(s.date).toLocaleDateString('fr-BJ')} à {new Date(s.date).toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{s.customer_name}</td>
                      <td className="p-3 text-right font-black font-mono text-slate-900">{fmt(s.total_amount)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700 font-bold">{fmt(s.amount_paid)}</td>
                      <td className="p-3 text-right font-mono text-rose-600 font-bold">
                        {s.credit_amount > 0 ? fmt(s.credit_amount) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          s.status === 'COMPLET' ? 'bg-emerald-100 text-emerald-800' :
                          s.status === 'A_LIVRER' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        )}>
                          {s.status === 'COMPLET' ? 'Payé' : s.status === 'A_LIVRER' ? 'Différé' : 'Avoir'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleDownloadPDF(s)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs"
                            title="Télécharger Facture PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setCurrentSale(s); setShowInvoiceModal(true); }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                            title="Aperçu & Imprimer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {s.status !== 'AVOIR' && (
                            <button
                              onClick={() => handleCreateAvoir(s)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs"
                              title="Créer Facture d'Avoir"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL 1 : DÉTAILS PRODUIT (CLIC ARTICLE DU CATALOGUE) ─────────────── */}
      {selectedProductForDetail && (
        <ModalPortal isOpen={!!selectedProductForDetail} onClose={() => setSelectedProductForDetail(null)} id="modal-product-detail">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">{selectedProductForDetail.code}</span>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight mt-0.5">
                  {selectedProductForDetail.name}
                </h3>
                <span className="text-xs text-slate-500">{selectedProductForDetail.unit}</span>
              </div>
              <button onClick={() => setSelectedProductForDetail(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Prix Unitaire de Base (TTC) :</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  {fmt(selectedProductForDetail.selling_price)}
                </span>
              </div>

              {/* Paliers par lot préenregistrés (quantités UV) si configurés */}
              {selectedProductForDetail.batch_pricing?.enabled && (
                (() => {
                  const tiers = getBatchTiersList(
                    selectedProductForDetail.batch_pricing.coef,
                    selectedProductForDetail.batch_pricing
                  ).filter((t) => t.priceTtc > 0)

                  if (tiers.length === 0) return null

                  return (
                    <div className="space-y-1.5 p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                      <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 block">
                        Paliers par Lot Préenregistrés (Quantités en {selectedProductForDetail.unit}) :
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {tiers.map((t) => {
                          const isSel = Math.abs(detailQty - t.uvQty) < 0.005
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setDetailQty(t.uvQty)}
                              className={clsx(
                                'px-2.5 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 shadow-sm',
                                isSel
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900'
                              )}
                            >
                              <span className="font-mono">{formatUvQty(t.uvQty)} {selectedProductForDetail.unit}</span>
                              <span className={clsx('text-[10px] font-mono', isSel ? 'text-emerald-100' : 'text-emerald-700 dark:text-emerald-400')}>
                                ({fmt(t.priceTtc)})
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()
              )}

              {/* Sélecteur de quantité numérique décimale avec boutons fractionnés */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Quantité à Vendre ({selectedProductForDetail.unit}) :
                </label>
                <div className="flex items-center gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.max(0.1, Math.round((detailQty - 1) * 100) / 100))}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="-1"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.max(0.05, Math.round((detailQty - 0.5) * 100) / 100))}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="-0.5"
                  >
                    -0.5
                  </button>

                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    value={detailQty}
                    onChange={(e) => setDetailQty(Math.max(0.001, Number(e.target.value)))}
                    className="flex-1 p-2 text-center text-lg font-black font-mono border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />

                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.round((detailQty + 0.5) * 100) / 100)}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="+0.5"
                  >
                    +0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.round((detailQty + 1) * 100) / 100)}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="+1"
                  >
                    +1
                  </button>
                </div>

                {/* Raccourcis directs de quantités fractionnées et entières */}
                <div className="flex flex-wrap gap-1">
                  {[0.25, 0.5, 0.75, 1, 1.5, 2, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDetailQty(preset)}
                      className={clsx(
                        'px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition border',
                        Math.abs(detailQty - preset) < 0.001
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      )}
                    >
                      {preset} {selectedProductForDetail.unit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Ligne = Calcul automatique selon palier ou tarif standard UV */}
              {(() => {
                const match = calculateBatchLinePrice(
                  detailQty,
                  selectedProductForDetail.batch_pricing,
                  selectedProductForDetail.selling_price
                )

                return (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">Total de la Ligne :</span>
                      {selectedProductForDetail.batch_pricing?.enabled && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block mt-0.5">
                          {match.isMatched
                            ? `✓ ${match.matchedTierLabel} appliqué`
                            : `Tarif standard UV (${formatUvQty(detailQty)} × ${fmt(match.effectiveUnitPriceTtc)})`}
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      {fmt(match.totalLineTtc)}
                    </span>
                  </div>
                )
              })()}
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setSelectedProductForDetail(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToCart}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" /> Ajouter au panier
              </button>
            </div>
          </div>
        </ModalPortal>
      )}


      {/* ── MODAL 3 : FACTURE COMMERCIALE STANDARD GESTIO 229 (AUCUN FAUX E-MECEF) */}
      <ModalPortal isOpen={showInvoiceModal && !!currentSale} onClose={() => setShowInvoiceModal(false)} id="modal-invoice-standard">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPrintFormat('factureA4')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition',
                  printFormat === 'factureA4' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                Facture A4 Standard
              </button>
              <button
                onClick={() => setPrintFormat('ticket80')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition',
                  printFormat === 'ticket80' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                Ticket Caisse 80mm
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => currentSale && handleDownloadPDF(currentSale)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" /> Télécharger PDF
              </button>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
              <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {printFormat === 'factureA4' ? (
            /* ── FACTURE COMMERCIALE A4 STANDARD (CONFORME RÈGLES 24 & 25) ── */
            <div id="invoice-a4-standard" className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5 text-xs font-sans text-slate-800">
              {/* Entête Entreprise & Numéro */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div className="flex items-start gap-3.5">
                  {company?.logo_url && (
                    <img
                      src={company.logo_url}
                      alt="Logo"
                      className="w-16 h-16 object-contain rounded-xl border border-slate-200 p-1 bg-white flex-shrink-0"
                    />
                  )}
                  <div>
                    <h2 className="text-lg font-black text-slate-900 uppercase">{company?.name ?? 'GESTIO 229 ENTREPRISE'}</h2>
                    <p className="text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'} • RCCM : {company?.rccm_number || 'Non renseigné'}</p>
                    <p className="text-slate-500">{company?.address ? `${company.address}, ` : ''}{company?.city || 'Cotonou, République du Bénin'}</p>
                    <p className="text-slate-500">Tél : {company?.phone || '+229 01 00 00 00'} • Email : {company?.email || 'contact@gestio229.bj'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 bg-slate-100 text-slate-800 rounded-lg font-black text-xs uppercase tracking-wider">
                    {currentSale?.status === 'AVOIR' ? 'FACTURE D\'AVOIR' : 'FACTURE DE VENTE'}
                  </span>
                  <p className="font-mono font-bold text-sm mt-1.5">{currentSale?.order_number}</p>
                  <p className="text-slate-500">Date : {new Date(currentSale?.date || '').toLocaleString('fr-BJ')}</p>
                  <p className="text-slate-500 text-[11px] font-medium">Caisse : Caisse Principale POS</p>
                </div>
              </div>

              {/* Bloc Client */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Facturé à :</span>
                  <p className="text-sm font-bold text-slate-900">{currentSale?.customer_name}</p>
                  {currentSale?.customer_ifu && (
                    <p className="text-slate-500 font-mono text-[11px]">N° IFU Client : {currentSale.customer_ifu}</p>
                  )}
                </div>
                {currentSale?.is_deferred && (
                  <div className="text-right">
                    <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                      BON DE LIVRAISON EN ATTENTE
                    </span>
                  </div>
                )}
              </div>

              {/* Tableau des Lignes Facturées */}
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Réf</th>
                    <th className="p-2.5">Désignation</th>
                    <th className="p-2.5 text-center">Qté</th>
                    <th className="p-2.5 text-center">Unité</th>
                    <th className="p-2.5 text-right">Prix Unit. TTC</th>
                    <th className="p-2.5 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSale?.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-mono text-slate-500">{l.product.code}</td>
                      <td className="p-2.5 font-medium text-slate-900">{l.product.name}</td>
                      <td className="p-2.5 text-center font-mono font-bold">{l.qty}</td>
                      <td className="p-2.5 text-center text-slate-500">{l.product.unit}</td>
                      <td className="p-2.5 text-right font-mono">{fmt(l.unitPrice)}</td>
                      <td className="p-2.5 text-right font-mono font-bold">{fmt(l.qty * l.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Récapitulatif Fiscal & Financier */}
              <div className="flex justify-between items-start pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-700">Règlements effectués :</p>
                  {currentSale?.payments.map((p, idx) => (
                    <p key={idx} className="capitalize">
                      • {p.method.replace('_', ' ')} : <strong>{fmt(p.amount)}</strong>
                    </p>
                  ))}
                  {currentSale?.credit_amount > 0 && (
                    <p className="text-rose-600 font-bold">
                      • Montant restant dû (Crédit) : {fmt(currentSale.credit_amount)}
                    </p>
                  )}
                </div>

                <div className="w-56 space-y-1.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Hors Taxes :</span>
                    <span className="font-mono font-bold">{fmt(currentSale?.total_ht || 0)}</span>
                  </div>
                  {(currentSale?.total_exonere || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Exonéré :</span>
                      <span className="font-mono font-bold">{fmt(currentSale.total_exonere)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total TVA (18%) :</span>
                    <span className="font-mono font-bold">{fmt(currentSale?.total_tva || 0)}</span>
                  </div>
                  {currentSale?.total_aib > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total AIB :</span>
                      <span className="font-mono font-bold">{fmt(currentSale.total_aib)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
                    <span>NET À PAYER :</span>
                    <span className="font-mono text-emerald-800">{fmt(currentSale?.total_amount || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Mentions Légales Standard (Pas de fausses mentions e-MECeF) */}
              <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 space-y-0.5">
                <p>Facture commerciale émise par GESTIO 229 ERP — République du Bénin</p>
                <p>Pour tout renseignement, veuillez contacter la Direction de {company?.name}.</p>
              </div>
            </div>
          ) : (
            /* ── TICKET DE CAISSE 80MM STANDARD (SANS FAUX NUMÉROS FISCAUX) ── */
            <div className="mx-auto max-w-[80mm] p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl font-mono text-xs space-y-3">
              <div className="text-center space-y-1">
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt="Logo"
                    className="w-12 h-12 object-contain mx-auto mb-1"
                  />
                )}
                <p className="font-black text-sm uppercase">{company?.name ?? 'GESTIO 229 BOUTIQUE'}</p>
                {company?.address && <p className="text-[10px] text-slate-500">{company.address}, {company.city || 'Bénin'}</p>}
                <p className="text-[10px] text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
                {company?.phone && <p className="text-[10px] text-slate-500">Tél : {company.phone}</p>}
                <p className="text-[10px] text-slate-500">{new Date(currentSale?.date || '').toLocaleString('fr-BJ')}</p>
              </div>

              <div className="border-t border-b border-dashed border-slate-300 py-1.5 space-y-0.5 text-[11px]">
                <p className="font-bold">Facture : {currentSale?.order_number}</p>
                <p>Client : {currentSale?.customer_name}</p>
              </div>

              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pb-1">Article</th>
                    <th className="text-center pb-1">Qté</th>
                    <th className="text-right pb-1">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSale?.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1">{l.product.name}</td>
                      <td className="py-1 text-center">{l.qty}</td>
                      <td className="py-1 text-right">{fmt(l.qty * l.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-right">
                <p className="font-black text-sm">TOTAL TTC : {fmt(currentSale?.total_amount || 0)}</p>
                <p className="text-[10px] text-slate-500">Dont TVA : {fmt(currentSale?.total_tva || 0)}</p>
                <p className="text-xs text-emerald-700 font-bold">Payé : {fmt(currentSale?.amount_paid || 0)}</p>
                {(currentSale?.credit_amount || 0) > 0 && (
                  <p className="text-xs text-rose-600 font-bold">Reste Dû : {fmt(currentSale?.credit_amount || 0)}</p>
                )}
              </div>

              <div className="text-center pt-2 border-t border-slate-200 text-[10px] text-slate-400">
                <p>Merci pour votre visite !</p>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>
    </div>
  )
}

export default POSPage
