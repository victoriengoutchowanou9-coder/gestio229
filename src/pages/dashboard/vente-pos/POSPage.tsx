// =============================================================================
// GESTIO 229 SaaS — Module 1 : Gestion Commerciale & Point de Vente (POS)
// Multi-paiements, Ventes à crédit, Ventes différées, Factures A4 & Tickets 80mm
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Printer, Check, X,
  Package, RefreshCw, UserCheck, CreditCard, Clock, FileText,
  AlertCircle, Receipt, RotateCcw, ArrowRight, ShieldCheck, QrCode
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { ModalPortal } from '../../../components/modals'
import clsx from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string
  code: string
  name: string
  unit: string
  selling_price: number
  cost_price: number
  current_stock?: number
  category?: { name: string }
}

interface CartItem {
  product: Product
  qty: number
  unitPrice: number
  discount: number
}

interface Customer {
  id: string
  code: string
  name: string
  phone: string
  current_debt?: number
}

interface SplitPayments {
  especes: number
  momo_mtn: number
  momo_moov: number
  wave: number
  carte: number
  credit: number
}

interface SaleRecord {
  id: string
  order_number: string
  date: string
  customer_name: string
  total_amount: number
  amount_paid: number
  credit_amount: number
  payment_breakdown: Partial<SplitPayments>
  is_deferred: boolean // Vente différée (BL en attente)
  status: 'COMPLET' | 'A_LIVRER' | 'AVOIR'
  lines: CartItem[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

// ─── POSPage Component ───────────────────────────────────────────────────────

export const POSPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  // Navigation interne
  const [activeTab, setActiveTab] = useState<'pos' | 'historique'>('pos')

  // Catalogue & Panier
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Client sélectionné
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId)

  // Vente différée
  const [isDeferred, setIsDeferred] = useState(false)

  // Modal de paiement & Split Payment
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payments, setPayments] = useState<SplitPayments>({
    especes: 0,
    momo_mtn: 0,
    momo_moov: 0,
    wave: 0,
    carte: 0,
    credit: 0,
  })
  const [cashReceivedInput, setCashReceivedInput] = useState('')

  // Impression Reçu & Facture A4
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [printFormat, setPrintFormat] = useState<'ticket80' | 'factureA4'>('ticket80')
  const [currentSale, setCurrentSale] = useState<SaleRecord | null>(null)

  // Historique & Avoirs
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([
    {
      id: 'sale-001',
      order_number: 'VTE-2026-1042',
      date: new Date(Date.now() - 3600000).toISOString(),
      customer_name: 'Client Comptoir',
      total_amount: 56000,
      amount_paid: 56000,
      credit_amount: 0,
      payment_breakdown: { especes: 56000 },
      is_deferred: false,
      status: 'COMPLET',
      lines: [
        { product: { id: '1', code: 'RIZ-001', name: 'Riz Parfumé 50kg (Sac)', unit: 'Sac', selling_price: 28000, cost_price: 24500 }, qty: 2, unitPrice: 28000, discount: 0 }
      ]
    },
    {
      id: 'sale-002',
      order_number: 'VTE-2026-1041',
      date: new Date(Date.now() - 7200000).toISOString(),
      customer_name: 'ÉTABLISSEMENT VIGNON',
      total_amount: 125000,
      amount_paid: 75000,
      credit_amount: 50000,
      payment_breakdown: { momo_mtn: 75000, credit: 50000 },
      is_deferred: true,
      status: 'A_LIVRER',
      lines: [
        { product: { id: '2', code: 'HUI-002', name: 'Huile Végétale 20L (Bidon)', unit: 'Bidon', selling_price: 21500, cost_price: 18000 }, qty: 5, unitPrice: 21500, discount: 0 }
      ]
    }
  ])
  const [historySearch, setHistorySearch] = useState('')

  // ─── Chargement des données ────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [{ data: prods }, { data: custs }] = await Promise.all([
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
          .order('name')
      ])

      setProducts(prods || [])
      setCustomers(custs || [])
    } catch {
      // Mock par défaut si hors-ligne ou tables initiales
      setProducts([
        { id: '1', code: 'RIZ-001', name: 'Riz Parfumé 50kg (Sac)', unit: 'Sac', selling_price: 28000, cost_price: 24500, current_stock: 45 },
        { id: '2', code: 'HUI-002', name: 'Huile Végétale 20L (Bidon)', unit: 'Bidon', selling_price: 21500, cost_price: 18000, current_stock: 30 },
        { id: '3', code: 'SUC-003', name: 'Sucre Blanc 50kg', unit: 'Sac', selling_price: 25000, cost_price: 22000, current_stock: 12 },
        { id: '4', code: 'SAV-004', name: 'Savon Carton 40pcs', unit: 'Carton', selling_price: 9500, cost_price: 7800, current_stock: 25 },
      ])
      setCustomers([
        { id: 'c-001', code: 'CLI-001', name: 'ETS VIGNON ET FILS', phone: '+229 97 12 34 56', current_debt: 50000 },
        { id: 'c-002', code: 'CLI-002', name: 'PHARMACIE DE L\'ÉTOILE', phone: '+229 95 88 77 66', current_debt: 0 },
      ])
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Actions Panier ────────────────────────────────────────────────────────

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i
        )
      }
      return [...prev, { product, qty: 1, unitPrice: product.selling_price, discount: 0 }]
    })
  }

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    )
  }

  const updateDiscount = (productId: string, discount: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, discount: Math.max(0, discount) } : i
      )
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

  const subtotal = cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
  const totalDiscount = cart.reduce((sum, i) => sum + i.qty * i.discount, 0)
  const totalNetTTC = Math.max(0, subtotal - totalDiscount)

  // Ventilation TVA & AIB (Norme e-MECeF Bénin)
  const tvaRate = 0.18
  const aibRate = 0.01
  const totalHT = Math.round(totalNetTTC / (1 + tvaRate))
  const montantTVA = totalNetTTC - totalHT
  const montantAIB = Math.round(totalHT * aibRate)

  // Totaux Paiements
  const sumAssigned = Object.values(payments).reduce((a, b) => a + b, 0)
  const remainingToPay = Math.max(0, totalNetTTC - sumAssigned)
  const cashRec = parseFloat(cashReceivedInput) || 0
  const cashChange = payments.especes > 0 && cashRec > payments.especes ? cashRec - payments.especes : 0

  // Ouvrir modal de paiement avec pré-remplissage en espèces
  const handleOpenPayment = () => {
    if (cart.length === 0) return
    setPayments({
      especes: totalNetTTC,
      momo_mtn: 0,
      momo_moov: 0,
      wave: 0,
      carte: 0,
      credit: 0,
    })
    setCashReceivedInput(String(totalNetTTC))
    setShowPaymentModal(true)
  }

  // Valider la Vente
  const handleValidateSale = async () => {
    if (sumAssigned !== totalNetTTC) {
      toast.error('Montant incomplet', `Reste à affecter : ${fmt(remainingToPay)}`)
      return
    }

    if (payments.credit > 0 && !selectedCustomerId) {
      toast.error('Client Obligatoire', 'Veuillez sélectionner un client pour toute vente à crédit.')
      return
    }

    setPaying(true)
    try {
      const orderNum = `VTE-2026-${String(Math.floor(1000 + Math.random() * 9000))}`
      const newSale: SaleRecord = {
        id: `sale-${Date.now()}`,
        order_number: orderNum,
        date: new Date().toISOString(),
        customer_name: selectedCustomer ? selectedCustomer.name : 'Client Comptoir',
        total_amount: totalNetTTC,
        amount_paid: totalNetTTC - payments.credit,
        credit_amount: payments.credit,
        payment_breakdown: { ...payments },
        is_deferred: isDeferred,
        status: isDeferred ? 'A_LIVRER' : 'COMPLET',
        lines: [...cart]
      }

      setSalesHistory([newSale, ...salesHistory])
      setCurrentSale(newSale)
      setShowPaymentModal(false)
      setShowInvoiceModal(true)
      clearCart()
      toast.success('Vente enregistrée avec succès !', `Réf : ${orderNum}`)
    } finally {
      setPaying(false)
    }
  }

  // Émettre Facture d'Avoir
  const handleCreateAvoir = (sale: SaleRecord) => {
    if (sale.status === 'AVOIR') {
      toast.error('Déjà annulé', 'Cette facture fait déjà l\'objet d\'un avoir.')
      return
    }
    const updated = salesHistory.map((s) =>
      s.id === sale.id ? { ...s, status: 'AVOIR' as const } : s
    )
    setSalesHistory(updated)
    toast.success('Facture d\'Avoir générée', `Avoir créé sur la vente ${sale.order_number}`)
  }

  // Filtrage Catalogue
  const filteredProducts = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  )

  // Filtrage Historique
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
            Module 1 : Ventes & Point de Vente (POS)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-paiements (Espèces + MoMo + Carte + Crédit), Ventes différées & e-MECeF Bénin
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
                title="Actualiser"
              >
                <RefreshCw className={clsx('w-4 h-4 text-slate-500', loading && 'animate-spin')} />
              </button>
            </div>

            {/* Grille des articles */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 pr-1">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="flex flex-col justify-between p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition group active:scale-[0.98]"
                >
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 block truncate">{p.code}</span>
                    <p className="font-semibold text-xs text-slate-800 line-clamp-2 mt-0.5 group-hover:text-emerald-700">{p.name}</p>
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-200/60 flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-500">{p.unit}</span>
                    <span className="text-xs font-black text-emerald-700 font-mono">{fmt(p.selling_price)}</span>
                  </div>
                </button>
              ))}
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
                      {c.name} {c.current_debt ? `(Dette : ${fmt(c.current_debt)})` : ''}
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
                  <span>📦 Vente Différée (BL en attente de livraison)</span>
                </label>
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-red-500 hover:underline text-[11px] font-semibold">
                    Vider panier
                  </button>
                )}
              </div>
            </div>

            {/* Liste des articles du panier */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                  <ShoppingCart className="w-10 h-10 mb-2 stroke-1" />
                  <p className="text-xs">Votre panier est vide</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="bg-slate-50 rounded-xl p-2.5 flex items-center justify-between gap-2 border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{item.product.name}</p>
                      <p className="text-[11px] text-emerald-700 font-mono font-bold">{fmt(item.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQty(item.product.id, -1)}
                        className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="w-7 text-center text-xs font-bold">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.product.id, 1)}
                        className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center hover:bg-emerald-200 text-xs font-bold text-emerald-800"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-400 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totaux & Bouton d'encaissement */}
            {cart.length > 0 && (
              <div className="border-t border-slate-200 p-4 space-y-2.5 bg-slate-50/70">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Sous-total HT</span>
                  <span className="font-mono">{fmt(totalHT)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>TVA (18%)</span>
                  <span className="font-mono">{fmt(montantTVA)}</span>
                </div>
                <div className="flex justify-between text-base font-black border-t border-slate-200 pt-2 text-slate-900">
                  <span>TOTAL TTC</span>
                  <span className="text-emerald-700 font-mono">{fmt(totalNetTTC)}</span>
                </div>

                <button
                  onClick={handleOpenPayment}
                  className="w-full py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-md shadow-emerald-900/20 text-xs uppercase tracking-wider active:scale-[0.98]"
                >
                  <CreditCard className="w-4 h-4" /> [ Encaisser la Vente ]
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── VUE 2 : HISTORIQUE DES VENTES & AVOIRS ──────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Rechercher par n° facture ou nom client..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-xs text-slate-500">Total : {filteredHistory.length} ventes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Réf / Facture</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Montant Total</th>
                  <th className="p-3 text-right">Payé</th>
                  <th className="p-3 text-right">Crédit</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredHistory.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-bold text-slate-900">{sale.order_number}</td>
                    <td className="p-3 font-sans text-slate-600">{new Date(sale.date).toLocaleDateString('fr-BJ')}</td>
                    <td className="p-3 font-sans font-medium text-slate-800">{sale.customer_name}</td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(sale.total_amount)}</td>
                    <td className="p-3 text-right text-emerald-600 font-bold">{fmt(sale.amount_paid)}</td>
                    <td className="p-3 text-right text-red-600 font-bold">{fmt(sale.credit_amount)}</td>
                    <td className="p-3 text-center font-sans">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-bold',
                        sale.status === 'COMPLET' ? 'bg-emerald-100 text-emerald-800' :
                        sale.status === 'A_LIVRER' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      )}>
                        {sale.status === 'A_LIVRER' ? '📦 À Livrer' : sale.status === 'AVOIR' ? '↩️ Annulé / Avoir' : '✅ Réglé'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => { setCurrentSale(sale); setShowInvoiceModal(true); }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                          title="Imprimer / Visualiser"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {sale.status !== 'AVOIR' && (
                          <button
                            onClick={() => handleCreateAvoir(sale)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 transition"
                            title="Créer Facture d'Avoir"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL DE PAIEMENT MULTI-MODES (SPLIT PAYMENT) ───────────────────── */}
      <ModalPortal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} id="modal-split-payment">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Règlement Multi-Modes</h3>
              <p className="text-xs text-slate-500">Ventilez les règlements (Espèces, MoMo, Wave, Crédit)</p>
            </div>
            <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-emerald-50 rounded-2xl p-4 mb-4 flex justify-between items-center border border-emerald-100">
            <div>
              <span className="text-xs text-emerald-800 font-medium">Net TTC à Encaisser</span>
              <p className="text-xl font-black text-emerald-900 font-mono">{fmt(totalNetTTC)}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium">Reste à ventiler</span>
              <p className={clsx('text-base font-black font-mono', remainingToPay > 0 ? 'text-amber-600' : 'text-emerald-700')}>
                {fmt(remainingToPay)}
              </p>
            </div>
          </div>

          {/* Saisie par mode de paiement */}
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">💵 Espèces (FCFA)</label>
                <input
                  type="number"
                  value={payments.especes || ''}
                  onChange={(e) => setPayments({ ...payments, especes: Math.max(0, Number(e.target.value)) })}
                  placeholder="0"
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono text-sm"
                />
              </div>
              <div>
                <label className="font-bold text-amber-600 block mb-1">📱 MTN MoMo</label>
                <input
                  type="number"
                  value={payments.momo_mtn || ''}
                  onChange={(e) => setPayments({ ...payments, momo_mtn: Math.max(0, Number(e.target.value)) })}
                  placeholder="0"
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-blue-600 block mb-1">📱 Moov Money</label>
                <input
                  type="number"
                  value={payments.momo_moov || ''}
                  onChange={(e) => setPayments({ ...payments, momo_moov: Math.max(0, Number(e.target.value)) })}
                  placeholder="0"
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono text-sm"
                />
              </div>
              <div>
                <label className="font-bold text-sky-600 block mb-1">🌊 Wave Bénin</label>
                <input
                  type="number"
                  value={payments.wave || ''}
                  onChange={(e) => setPayments({ ...payments, wave: Math.max(0, Number(e.target.value)) })}
                  placeholder="0"
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-indigo-600 block mb-1">💳 Carte Bancaire</label>
                <input
                  type="number"
                  value={payments.carte || ''}
                  onChange={(e) => setPayments({ ...payments, carte: Math.max(0, Number(e.target.value)) })}
                  placeholder="0"
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono text-sm"
                />
              </div>
              <div>
                <label className="font-bold text-rose-600 block mb-1">📝 Vente à Crédit</label>
                <input
                  type="number"
                  value={payments.credit || ''}
                  onChange={(e) => setPayments({ ...payments, credit: Math.max(0, Number(e.target.value)) })}
                  placeholder="0"
                  className="w-full p-2 border border-rose-200 rounded-xl font-mono text-sm bg-rose-50/40"
                />
              </div>
            </div>

            {/* Rendu monnaie espèces */}
            {payments.especes > 0 && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 mt-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-600 font-semibold">Montant remis par le client :</label>
                  <input
                    type="number"
                    value={cashReceivedInput}
                    onChange={(e) => setCashReceivedInput(e.target.value)}
                    placeholder="Montant remis"
                    className="w-36 p-1.5 border border-slate-200 rounded-lg font-mono text-xs text-right"
                  />
                </div>
                {cashChange > 0 && (
                  <p className="text-emerald-700 font-bold text-right font-mono">
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
              disabled={paying || remainingToPay > 0}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Confirmer la Vente
            </button>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL IMPRESSION : TICKET 80MM / FACTURE A4 NORMALISÉE ───────────── */}
      <ModalPortal isOpen={showInvoiceModal && !!currentSale} onClose={() => setShowInvoiceModal(false)} id="modal-invoice-print">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Format :</span>
              <button
                onClick={() => setPrintFormat('ticket80')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition',
                  printFormat === 'ticket80' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                Ticket 80mm
              </button>
              <button
                onClick={() => setPrintFormat('factureA4')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition',
                  printFormat === 'factureA4' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                Facture A4 Pro
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
              <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Rendu imprimable */}
          {printFormat === 'ticket80' ? (
            /* Format Ticket 80mm */
            <div className="mx-auto max-w-[80mm] p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl font-mono text-xs space-y-3">
              <div className="text-center space-y-1">
                <p className="font-black text-sm uppercase">{company?.name ?? 'GESTIO 229 BOUTIQUE'}</p>
                <p className="text-[10px] text-slate-500">IFU : {company?.ifu_number || '3201888999000'}</p>
                <p className="text-[10px] text-slate-500">RCCM : {company?.rccm_number || 'RB/COT/26 B 1000'}</p>
                <p className="text-[10px] text-slate-500">{new Date(currentSale?.date || '').toLocaleString('fr-BJ')}</p>
              </div>

              <div className="border-t border-b border-dashed border-slate-300 py-2 space-y-1">
                <p className="font-bold">Facture : {currentSale?.order_number}</p>
                <p>Client : {currentSale?.customer_name}</p>
                {currentSale?.is_deferred && <p className="font-bold text-amber-700">[ BON DE LIVRAISON EN ATTENTE ]</p>}
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
                <p className="text-[10px] text-slate-500">Dont TVA 18% : {fmt(Math.round((currentSale?.total_amount || 0) * 0.18 / 1.18))}</p>
                <p className="text-xs text-emerald-700 font-bold">Payé : {fmt(currentSale?.amount_paid || 0)}</p>
                {(currentSale?.credit_amount || 0) > 0 && (
                  <p className="text-xs text-rose-600 font-bold">Reste Dû : {fmt(currentSale?.credit_amount || 0)}</p>
                )}
              </div>

              <div className="text-center pt-2 border-t border-slate-200 text-[10px] text-slate-400 space-y-1">
                <div className="w-16 h-16 bg-slate-200 rounded mx-auto flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-slate-600" />
                </div>
                <p>NIM e-MECeF : 001-BENIN-2026</p>
                <p>Merci pour votre visite !</p>
              </div>
            </div>
          ) : (
            /* Format Facture A4 Normalisée */
            <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5 text-xs font-sans">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase">{company?.name ?? 'GESTIO 229 ENTREPRISE'}</h2>
                  <p className="text-slate-500">IFU : {company?.ifu_number || '3201888999000'} • RCCM : {company?.rccm_number || 'RB/COT/26 B 1000'}</p>
                  <p className="text-slate-500">{company?.address || 'Cotonou, République du Bénin'}</p>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-xs">
                    FACTURE NORMALISÉE
                  </span>
                  <p className="font-mono font-bold text-sm mt-1">{currentSale?.order_number}</p>
                  <p className="text-slate-500">Date : {new Date(currentSale?.date || '').toLocaleDateString('fr-BJ')}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl">
                <p className="font-bold text-slate-700">Client / Destinataire :</p>
                <p className="text-sm font-semibold text-slate-900">{currentSale?.customer_name}</p>
              </div>

              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Désignation</th>
                    <th className="p-2.5 text-center">Qté</th>
                    <th className="p-2.5 text-right">PU TTC</th>
                    <th className="p-2.5 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSale?.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-medium">{l.product.name}</td>
                      <td className="p-2.5 text-center font-mono">{l.qty} {l.product.unit}</td>
                      <td className="p-2.5 text-right font-mono">{fmt(l.unitPrice)}</td>
                      <td className="p-2.5 text-right font-mono font-bold">{fmt(l.qty * l.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end pt-3 border-t border-slate-200">
                <div className="w-64 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span>Total HT :</span>
                    <span>{fmt(Math.round((currentSale?.total_amount || 0) / 1.18))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TVA (18%) :</span>
                    <span>{fmt(Math.round((currentSale?.total_amount || 0) * 0.18 / 1.18))}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t border-slate-200 pt-1 text-slate-900 font-black">
                    <span>TOTAL TTC :</span>
                    <span>{fmt(currentSale?.total_amount || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>
    </div>
  )
}

export default POSPage
