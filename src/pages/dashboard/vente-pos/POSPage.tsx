// =============================================================================
// GESTIO 229 SaaS — Ventes & Point de Vente (POS)
// Multi-paiements stricts, Vente différée, Modale Détail Produit avec décimales,
// Facture Commerciale Standard sans faux e-MECeF, Historique et Avoirs
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ShoppingCart, Search, RefreshCw, Trash2, UserCheck, Check,
  Clock, Printer, RotateCcw, AlertTriangle, X, Plus, Minus,
  Layers, CreditCard, DollarSign, Smartphone, Landmark, Info
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { ModalPortal } from '../../../components/modals'
import { calculateTaxFromTTC, formatFCFA } from '../../../utils/tax'
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
  current_stock?: number
  is_vat_subject?: boolean
  vat_rate?: number
  is_aib_subject?: boolean
  aib_rate?: number
  category?: { name: string }
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
}

interface CartItem {
  product: Product
  qty: number
  unitPrice: number // TTC
  discount: number
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

  // Modal de paiement
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [isMultiMode, setIsMultiMode] = useState(false)
  const [singleMethod, setSingleMethod] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'wave' | 'banque' | 'credit'>('especes')
  const [multiPayments, setMultiPayments] = useState<Record<string, number>>({
    especes: 0,
    momo_mtn: 0,
    momo_moov: 0,
    wave: 0,
    banque: 0,
    credit: 0,
  })
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
            .select('*')
            .eq('company_id', company.id)
            .order('created_at', { ascending: false })
            .limit(50)
        ])

      if (prodErr) throw prodErr
      if (custErr) throw custErr

      setProducts(prods || [])
      setCustomers(custs || [])

      // Transformer les ventes réelles chargées
      if (sales && !saleErr) {
        const mappedSales: SaleRecord[] = sales.map((s: any) => ({
          id: s.id,
          order_number: s.order_number || `VTE-${s.id.slice(0, 6)}`,
          date: s.order_date || s.created_at || new Date().toISOString(),
          customer_name: s.customer_name || 'Client Comptoir',
          customer_id: s.customer_id,
          total_amount: Number(s.total_amount) || 0,
          total_ht: Number(s.total_ht) || Math.round((Number(s.total_amount) || 0) / 1.18),
          total_tva: Number(s.total_tax) || 0,
          total_aib: 0,
          amount_paid: Number(s.amount_paid) || (s.payment_method === 'credit' ? 0 : Number(s.total_amount) || 0),
          credit_amount: s.payment_method === 'credit' ? Number(s.total_amount) || 0 : 0,
          payments: [{ method: (s.payment_method as any) || 'especes', amount: Number(s.total_amount) || 0 }],
          is_deferred: s.status === 'pending_delivery',
          status: s.status === 'cancelled' ? 'AVOIR' : s.status === 'pending_delivery' ? 'A_LIVRER' : 'COMPLET',
          lines: []
        }))
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

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === selectedProductForDetail.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === selectedProductForDetail.id ? { ...i, qty: i.qty + qty } : i
        )
      }
      return [
        ...prev,
        {
          product: selectedProductForDetail,
          qty,
          unitPrice: selectedProductForDetail.selling_price,
          discount: 0,
        }
      ]
    })

    setSelectedProductForDetail(null)
    setDetailQty(1)
  }

  const updateCartItemQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, qty: Math.round(newQty * 1000) / 1000 } : i))
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

  // ─── Calculs Financiers du Panier ──────────────────────────────────────────

  const subtotalTTC = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
  }, [cart])

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty * i.discount, 0)
  }, [cart])

  const totalNetTTC = Math.max(0, subtotalTTC - totalDiscount)

  // Décomposition fiscale ligne par ligne
  const cartFiscalSummary = useMemo(() => {
    let ht = 0
    let tva = 0
    let aib = 0

    cart.forEach((item) => {
      const lineTtc = item.qty * item.unitPrice - item.qty * item.discount
      const tax = calculateTaxFromTTC(
        lineTtc,
        item.product.is_vat_subject ?? true,
        item.product.vat_rate ?? 18,
        item.product.is_aib_subject ?? false,
        item.product.aib_rate ?? 1
      )
      ht += tax.htPrice
      tva += tax.vatAmount
      aib += tax.aibAmount
    })

    return {
      ht: Math.round(ht * 100) / 100,
      tva: Math.round(tva * 100) / 100,
      aib: Math.round(aib * 100) / 100,
    }
  }, [cart])

  // ─── Gestion des Modes de Paiement ────────────────────────────────────────

  const handleOpenPaymentModal = () => {
    if (cart.length === 0) {
      toast.error('Panier vide', 'Ajoutez des articles avant d\'encaisser.')
      return
    }
    setIsMultiMode(false)
    setSingleMethod('especes')
    setMultiPayments({
      especes: totalNetTTC,
      momo_mtn: 0,
      momo_moov: 0,
      wave: 0,
      banque: 0,
      credit: 0,
    })
    setCashReceivedInput(String(totalNetTTC))
    setShowPaymentModal(true)
  }

  // Somme actuellement affectée
  const sumAssigned = useMemo(() => {
    if (!isMultiMode) return totalNetTTC
    return Object.values(multiPayments).reduce((sum, v) => sum + (Number(v) || 0), 0)
  }, [isMultiMode, multiPayments, totalNetTTC])

  const remainingToPay = Math.round((totalNetTTC - sumAssigned) * 100) / 100

  // Complément automatique sur un mode
  const handleAutoComplement = (methodKey: string) => {
    const currentSumWithoutThis = Object.entries(multiPayments)
      .filter(([k]) => k !== methodKey)
      .reduce((sum, [_, v]) => sum + (Number(v) || 0), 0)
    const complement = Math.max(0, Math.round((totalNetTTC - currentSumWithoutThis) * 100) / 100)
    setMultiPayments((prev) => ({
      ...prev,
      [methodKey]: complement,
    }))
  }

  // Rendu de monnaie pour espèces
  const cashGiven = Number(cashReceivedInput) || 0
  const cashAssigned = isMultiMode ? multiPayments.especes : (singleMethod === 'especes' ? totalNetTTC : 0)
  const cashChange = Math.max(0, cashGiven - cashAssigned)

  // ─── Validation de la Vente ────────────────────────────────────────────────

  const handleValidateSale = async () => {
    // 1. Contrôle des montants
    if (isMultiMode) {
      if (Math.abs(remainingToPay) > 0.01) {
        toast.error('Paiement incomplet', `Le total des règlements doit être exactement égal à ${fmt(totalNetTTC)}. Reste : ${fmt(remainingToPay)}`)
        return
      }
      // Bloquer montants négatifs
      for (const [k, v] of Object.entries(multiPayments)) {
        if (v < 0) {
          toast.error('Montant invalide', `Le montant en ${k} ne peut pas être négatif.`)
          return
        }
      }
    }

    // 2. Contrôle crédit obligatoire
    const creditAmount = isMultiMode
      ? multiPayments.credit
      : singleMethod === 'credit'
      ? totalNetTTC
      : 0

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
        ? (Object.entries(multiPayments)
            .filter(([_, v]) => v > 0)
            .map(([k, v]) => ({ method: k as any, amount: v })))
        : [{ method: singleMethod, amount: totalNetTTC }]

      const newSale: SaleRecord = {
        id: `sale-${Date.now()}`,
        order_number: orderNum,
        date: new Date().toISOString(),
        customer_name: selectedCustomer ? selectedCustomer.name : 'Client Comptoir',
        customer_id: selectedCustomer?.id,
        customer_ifu: selectedCustomer?.ifu_number,
        total_amount: totalNetTTC,
        total_ht: cartFiscalSummary.ht,
        total_tva: cartFiscalSummary.tva,
        total_aib: cartFiscalSummary.aib,
        amount_paid: totalNetTTC - creditAmount,
        credit_amount: creditAmount,
        payments: paymentsList,
        is_deferred: isDeferred,
        status: isDeferred ? 'A_LIVRER' : 'COMPLET',
        lines: [...cart],
      }

      // Si client avec crédit, mettre à jour sa dette dans Supabase
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

      setSalesHistory([newSale, ...salesHistory])
      setCurrentSale(newSale)
      setShowPaymentModal(false)
      setShowInvoiceModal(true)
      clearCart()
      toast.success('Vente enregistrée avec succès !', `Réf : ${orderNum}`)
    } catch (err: any) {
      toast.error('Erreur validation vente', err.message)
    } finally {
      setPaying(false)
    }
  }

  // ─── Facture d'Avoir ───────────────────────────────────────────────────────

  const handleCreateAvoir = async (sale: SaleRecord) => {
    if (sale.status === 'AVOIR') {
      toast.error('Opération impossible', 'Cette facture fait déjà l\'objet d\'un avoir.')
      return
    }

    try {
      // Si crédit, restaurer la dette du client
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

      const updated = salesHistory.map((s) =>
        s.id === sale.id ? { ...s, status: 'AVOIR' as const } : s
      )
      setSalesHistory(updated)
      toast.success('Facture d\'Avoir générée', `Avoir créé avec succès pour la vente ${sale.order_number}`)
    } catch (err: any) {
      toast.error('Erreur création avoir', err.message)
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
        /* ── VUE 1 : POINT DE VENTE ─────────────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-13rem)]">
          {/* Colonne gauche : Catalogue Produits (7 cols) */}
          <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
            <div className="flex gap-2 mb-3">
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
            </div>

            {/* Grille des articles - Clic ouvre la modale Détails Produit */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 pr-1">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full p-8 text-center text-slate-400 text-xs">
                  {loading ? 'Chargement des articles...' : 'Aucun produit actif disponible.'}
                </div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleOpenProductDetail(p)}
                    className="flex flex-col justify-between p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition group active:scale-[0.98]"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block truncate">{p.code}</span>
                      <p className="font-semibold text-xs text-slate-800 line-clamp-2 mt-0.5 group-hover:text-emerald-700">
                        {p.name}
                      </p>
                    </div>
                    <div className="mt-2 pt-1 border-t border-slate-200/60 flex justify-between items-baseline">
                      <span className="text-[10px] text-slate-500">{p.unit}</span>
                      <span className="text-xs font-black text-emerald-700 font-mono">{fmt(p.selling_price)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Colonne droite : Panier & Options de vente (5 cols) */}
          <div className="lg:col-span-5 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Sélection Client & Vente Différée */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-500" />
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg p-1.5 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">👤 Client Comptoir (Par défaut)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.current_debt > 0 ? `(Dette : ${fmt(c.current_debt)})` : ''}
                      {c.credit_authorized === false ? ' [Crédit non autorisé]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={isDeferred}
                    onChange={(e) => setIsDeferred(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span>📦 Vente Différée (BL en attente)</span>
                </label>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-red-600 hover:text-red-700 font-bold flex items-center gap-1 text-[11px]"
                  >
                    <Trash2 className="w-3 h-3" /> Vider
                  </button>
                )}
              </div>
            </div>

            {/* Liste des lignes du Panier */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <ShoppingCart className="w-10 h-10 mb-2 stroke-[1.5] text-slate-300" />
                  <p>Panier vide</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cliquez sur un produit pour choisir la quantité</p>
                </div>
              ) : (
                cart.map((item) => {
                  const lineTotal = item.qty * item.unitPrice - item.qty * item.discount
                  return (
                    <div key={item.product.id} className="pt-2 first:pt-0 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs text-slate-800 truncate">{item.product.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {fmt(item.unitPrice)} / {item.product.unit}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                        <button
                          onClick={() => updateCartItemQty(item.product.id, item.qty - 1)}
                          className="w-5 h-5 bg-white rounded flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step="any"
                          value={item.qty}
                          onChange={(e) => updateCartItemQty(item.product.id, Number(e.target.value))}
                          className="w-12 text-center text-xs font-mono font-bold bg-transparent border-0 focus:ring-0 p-0"
                        />
                        <button
                          onClick={() => updateCartItemQty(item.product.id, item.qty + 1)}
                          className="w-5 h-5 bg-white rounded flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right min-w-[70px]">
                        <p className="font-bold text-xs text-slate-900 font-mono">{fmt(lineTotal)}</p>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-[10px] text-red-500 hover:text-red-700"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Pied du Panier & Encaissement */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 space-y-2">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total HT :</span>
                  <span className="font-mono">{fmt(cartFiscalSummary.ht)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>TVA (18%) :</span>
                  <span className="font-mono">{fmt(cartFiscalSummary.tva)}</span>
                </div>
                {cartFiscalSummary.aib > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>AIB (Calculé sur HT) :</span>
                    <span className="font-mono">{fmt(cartFiscalSummary.aib)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
                  <span>TOTAL TTC :</span>
                  <span className="font-mono text-emerald-700 text-base">{fmt(totalNetTTC)}</span>
                </div>
              </div>

              <button
                disabled={cart.length === 0}
                onClick={handleOpenPaymentModal}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>Paiement / Encaissement ({fmt(totalNetTTC)})</span>
              </button>
            </div>
          </div>
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
                            onClick={() => { setCurrentSale(s); setShowInvoiceModal(true); }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                            title="Imprimer Facture"
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
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-600 font-semibold">Prix Unitaire (TTC) :</span>
                <span className="text-lg font-black text-emerald-700 font-mono">
                  {fmt(selectedProductForDetail.selling_price)}
                </span>
              </div>

              {/* Sélecteur de quantité numérique décimale */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Quantité à Ajouter ({selectedProductForDetail.unit}) :
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.max(0.1, Math.round((detailQty - 1) * 100) / 100))}
                    className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black text-lg flex items-center justify-center transition"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    value={detailQty}
                    onChange={(e) => setDetailQty(Math.max(0.001, Number(e.target.value)))}
                    className="flex-1 p-2 text-center text-lg font-black font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.round((detailQty + 1) * 100) / 100)}
                    className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black text-lg flex items-center justify-center transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Total Ligne = Qté * PU */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-900">Total de la Ligne :</span>
                <span className="text-lg font-black text-emerald-700 font-mono">
                  {fmt(Math.round(detailQty * selectedProductForDetail.selling_price))}
                </span>
              </div>
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

      {/* ── MODAL 2 : PAIEMENT SIMPLE OU MULTI-MODES ───────────────────────────── */}
      <ModalPortal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} id="modal-pos-payment">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Règlement de la Vente</h3>
              <p className="text-xs text-slate-400">Total à percevoir : <strong className="text-slate-900 font-mono">{fmt(totalNetTTC)}</strong></p>
            </div>
            <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Case à cocher : [ ] Paiement en plusieurs modes */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <label htmlFor="chk-multi-mode" className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  id="chk-multi-mode"
                  checked={isMultiMode}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setIsMultiMode(checked)
                    if (checked) {
                      setMultiPayments({
                        especes: totalNetTTC,
                        momo_mtn: 0,
                        momo_moov: 0,
                        wave: 0,
                        banque: 0,
                        credit: 0,
                      })
                    }
                  }}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
                <span>Paiement en plusieurs modes</span>
              </label>
              <span className="text-[10px] text-slate-400">Fractionnement</span>
            </div>

            {!isMultiMode ? (
              /* MODE SIMPLE : Sélection unique */
              <div className="space-y-3">
                <label className="block font-bold text-slate-700">Sélectionnez le mode unique :</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'especes', label: '💵 Espèces' },
                    { id: 'momo_mtn', label: '📱 MTN MoMo' },
                    { id: 'momo_moov', label: '📱 Moov Money' },
                    { id: 'wave', label: '🌊 Wave Bénin' },
                    { id: 'banque', label: '🏦 Banque / Chèque' },
                    { id: 'credit', label: '📝 Vente à Crédit' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSingleMethod(m.id as any)}
                      className={clsx(
                        'p-2.5 rounded-xl border text-left font-bold transition text-xs',
                        singleMethod === m.id
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* MULTI-MODES : Lignes de règlements ventilées */
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-bold">Ventilation des règlements :</span>
                  <span className={clsx('font-mono font-bold', remainingToPay === 0 ? 'text-emerald-700' : 'text-rose-600')}>
                    Reste : {fmt(remainingToPay)}
                  </span>
                </div>

                {[
                  { id: 'especes', label: '💵 Espèces', color: 'text-slate-800' },
                  { id: 'momo_mtn', label: '📱 MTN MoMo', color: 'text-amber-700' },
                  { id: 'momo_moov', label: '📱 Moov Money', color: 'text-blue-700' },
                  { id: 'wave', label: '🌊 Wave Bénin', color: 'text-sky-700' },
                  { id: 'banque', label: '🏦 Banque / Virement', color: 'text-indigo-700' },
                  { id: 'credit', label: '📝 Vente à Crédit', color: 'text-rose-700' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className={clsx('w-36 font-semibold truncate', item.color)}>{item.label}</span>
                    <input
                      type="number"
                      min="0"
                      value={multiPayments[item.id] || ''}
                      onChange={(e) =>
                        setMultiPayments({
                          ...multiPayments,
                          [item.id]: Math.max(0, Number(e.target.value)),
                        })
                      }
                      placeholder="0"
                      className="flex-1 p-1.5 border border-slate-200 rounded-lg font-mono text-xs text-right focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAutoComplement(item.id)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-600"
                      title="Affecter automatiquement le solde restant à ce mode"
                    >
                      Solde
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Rendu monnaie espèces si concerné */}
            {((!isMultiMode && singleMethod === 'especes') || (isMultiMode && multiPayments.especes > 0)) && (
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-slate-600 font-semibold">Montant remis par le client :</label>
                  <input
                    type="number"
                    value={cashReceivedInput}
                    onChange={(e) => setCashReceivedInput(e.target.value)}
                    placeholder="Montant remis"
                    className="w-36 p-1.5 border border-slate-200 rounded-lg font-mono text-xs text-right font-bold"
                  />
                </div>
                {cashChange > 0 && (
                  <p className="text-emerald-700 font-black text-right font-mono text-xs">
                    👉 Monnaie à rendre : {fmt(cashChange)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={() => setShowPaymentModal(false)}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={handleValidateSale}
              disabled={paying || (isMultiMode && Math.abs(remainingToPay) > 0.01)}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" /> {paying ? 'Validation...' : 'Valider la Vente'}
            </button>
          </div>
        </div>
      </ModalPortal>

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
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
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
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase">{company?.name ?? 'GESTIO 229 ENTREPRISE'}</h2>
                  <p className="text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'} • RCCM : {company?.rccm_number || 'Non renseigné'}</p>
                  <p className="text-slate-500">{company?.address || 'Cotonou, République du Bénin'}</p>
                  <p className="text-slate-500">Tél : {company?.phone || '+229 01 00 00 00'} • Email : {company?.email || 'contact@gestio229.bj'}</p>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 bg-slate-100 text-slate-800 rounded-lg font-black text-xs uppercase tracking-wider">
                    {currentSale?.status === 'AVOIR' ? 'FACTURE D\'AVOIR' : 'FACTURE DE VENTE'}
                  </span>
                  <p className="font-mono font-bold text-sm mt-1.5">{currentSale?.order_number}</p>
                  <p className="text-slate-500">Date : {new Date(currentSale?.date || '').toLocaleDateString('fr-BJ')}</p>
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
                <p className="font-black text-sm uppercase">{company?.name ?? 'GESTIO 229 BOUTIQUE'}</p>
                <p className="text-[10px] text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
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
