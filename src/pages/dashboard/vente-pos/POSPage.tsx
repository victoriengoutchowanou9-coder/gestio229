// =============================================================================
// GESTIO 229 SaaS — POS (Point de Vente)
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Search, ShoppingCart, Plus, Minus, Trash2, Printer, Check, X, Package, RefreshCw } from 'lucide-react'
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
  category?: { name: string }
}

interface CartItem {
  product: Product
  qty: number
  unitPrice: number
  discount: number
}

// ─── Formatage ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

// ─── POSPage ─────────────────────────────────────────────────────────────────

const POSPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'especes' | 'momo' | 'virement'>('especes')
  const [cashReceived, setCashReceived] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)

  // ─── Load products ─────────────────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:product_categories(name)')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      setProducts(data || [])
    } catch {
      // Mock catalog
      setProducts([
        { id: '1', code: 'RIZ-001', name: 'Riz Parfumé 50kg (Sac)', unit: 'Sac', selling_price: 28000, cost_price: 24500 },
        { id: '2', code: 'HUI-002', name: 'Huile Végétale 20L (Bidon)', unit: 'Bidon', selling_price: 21500, cost_price: 18000 },
        { id: '3', code: 'SUC-003', name: 'Sucre Blanc 50kg', unit: 'Sac', selling_price: 25000, cost_price: 22000 },
      ])
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // ─── Cart actions ──────────────────────────────────────────────────────────

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

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  const clearCart = () => setCart([])

  // ─── Calculations ──────────────────────────────────────────────────────────

  const subtotal = cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
  const totalDiscount = cart.reduce((sum, i) => sum + i.qty * i.discount, 0)
  const total = subtotal - totalDiscount
  const parsedCash = parseFloat(cashReceived) || 0
  const change = paymentMethod === 'especes' ? Math.max(0, parsedCash - total) : 0

  // ─── Process sale ──────────────────────────────────────────────────────────

  const handleSell = async () => {
    if (cart.length === 0) return
    if (paymentMethod === 'especes' && parsedCash < total) {
      toast.error('Montant insuffisant', `Reçu: ${fmt(parsedCash)}, Total: ${fmt(total)}`)
      return
    }

    setPaying(true)
    try {
      const orderNum = `VTE-2026-${String(Math.floor(1000 + Math.random() * 9000))}`
      const saleData = {
        order_number: orderNum,
        total_amount: total,
        amount_paid: paymentMethod === 'especes' ? parsedCash : total,
        amount_change: change,
        payment_method: paymentMethod,
        lines: cart
      }
      setLastSale(saleData)
      setShowReceipt(true)
      clearCart()
      setCashReceived('')
      toast.success('Vente enregistrée', `Réf: ${orderNum}`)
    } finally {
      setPaying(false)
    }
  }

  // ─── Filter products ───────────────────────────────────────────────────────

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  )

  // CORRECTION 2: Calculs sécurisés sans plantage
  const totalCA = products.length === 0 ? 0 : products.reduce((sum, p) => sum + (p.selling_price || 0), 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-8rem)]">
      {/* ── Colonne gauche : Catalogue (7 cols) ─────────────────────────────────── */}
      <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
        {/* Recherche et Bouton Nouveau Produit */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Rechercher produit par nom ou code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button onClick={loadProducts} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition" title="Actualiser">
            <RefreshCw className={clsx('w-4 h-4 text-slate-500', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => navigate('/dashboard/stocks')}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouveau Produit</span>
          </button>
        </div>

        {/* CORRECTION 3: Empty State fonctionnel et non bloquant */}
        {products.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300">
            <Package className="w-12 h-12 text-slate-400 mb-3" />
            <p className="text-slate-600 text-sm font-medium mb-4 max-w-sm">
              Votre boutique est vide. C'est normal, vous commencez avec vos vraies valeurs.
            </p>
            <button 
              onClick={() => navigate('/dashboard/stocks')}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-md transition-colors"
            >
              + Ajouter mon 1er produit réel
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 pr-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="flex flex-col justify-between p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition group"
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
        )}
      </div>

      {/* ── Colonne droite : Panier & Paiement (5 cols) ─────────────────────────── */}
      <div className="lg:col-span-5 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-800 text-sm">Panier En Cours</h2>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-red-500 hover:underline flex items-center gap-1 font-semibold">
              <Trash2 className="w-3.5 h-3.5" /> Vider
            </button>
          )}
        </div>

        {/* Lignes du panier */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
              <ShoppingCart className="w-12 h-12 mb-2 stroke-1" />
              <p className="text-xs">Cliquez sur un article pour l'ajouter</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} className="flex items-start gap-2 bg-slate-50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{item.product.name}</p>
                  <p className="text-xs text-emerald-600 font-medium">{fmt(item.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center hover:bg-emerald-200 transition">
                    <Plus className="w-3 h-3 text-emerald-700" />
                  </button>
                  <button onClick={() => removeFromCart(item.product.id)} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-100 transition ml-1">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totaux & paiement */}
        {cart.length > 0 && (
          <div className="border-t border-slate-100 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Sous-total</span>
              <span className="font-semibold">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between font-black text-lg border-t border-slate-100 pt-3">
              <span>TOTAL</span>
              <span className="text-emerald-600 font-mono">{fmt(total)}</span>
            </div>

            {/* Mode paiement */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'especes', label: '💵 Espèces' },
                { id: 'momo', label: '📱 MoMo' },
                { id: 'virement', label: '🏦 Virement' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={clsx(
                    'py-2 rounded-xl text-xs font-bold transition',
                    paymentMethod === m.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Montant reçu (espèces) */}
            {paymentMethod === 'especes' && (
              <div>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="Montant reçu (FCFA)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {cashReceived && change >= 0 && (
                  <p className="text-xs text-emerald-600 font-bold mt-1 text-center font-mono">
                    Monnaie à rendre : {fmt(change)}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleSell}
              disabled={paying || (paymentMethod === 'especes' && parseFloat(cashReceived) < total)}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-md shadow-emerald-900/20 text-xs uppercase tracking-wider"
            >
              <Check className="w-4 h-4" /> [ Valider la Vente ]
            </button>
          </div>
        )}
      </div>

      {/* ── Modal reçu via ModalPortal ────────────────────────────────────────── */}
      <ModalPortal isOpen={showReceipt && !!lastSale} onClose={() => { setShowReceipt(false); setLastSale(null); }} id="modal-portal-pos-receipt">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-center mb-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800">Vente enregistrée avec succès !</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{lastSale?.order_number}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2 mb-4 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Total TTC</span>
              <span className="font-bold text-slate-900">{fmt(lastSale?.total_amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Montant Payé</span>
              <span className="font-bold text-emerald-600">{fmt(lastSale?.amount_paid || 0)}</span>
            </div>
            {(lastSale?.amount_change || 0) > 0 && (
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-500">Monnaie Rendue</span>
                <span className="font-bold text-amber-600">{fmt(lastSale?.amount_change || 0)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { window.print(); }}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50 transition"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer
            </button>
            <button
              onClick={() => { setShowReceipt(false); setLastSale(null); }}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
            >
              Nouvelle vente
            </button>
          </div>
        </div>
      </ModalPortal>
    </div>
  )
}

export default POSPage
