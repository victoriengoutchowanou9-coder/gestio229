// =============================================================================
// GESTIO 229 SaaS — Module Vendeur : Prise de Commande & Bons en Piste
// =============================================================================
// Mode 2 : Séparation Vendeur / Caissière
// Permet aux vendeurs d'établir des bons de commande depuis le stock réel,
// de gérer leur panier et de les transmettre instantanément à la caisse.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ClipboardList, Search, Plus, Minus, Trash2, ShoppingCart, Send,
  RefreshCw, AlertTriangle, User, Clock, ArrowRightLeft, X, Printer,
  CheckCircle2, Package, Check, ArrowRight
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { supabase } from '../../../lib/supabase'
import {
  creerEtTransmettreBon,
  fetchPendingBons,
  PendingBon,
  normalizeCircuitSectorSlug
} from '../../../services/salesCircuitService'
import clsx from 'clsx'

interface ProductItem {
  id: string
  code: string
  name: string
  selling_price: number
  cost_price?: number
  unit?: string
  category?: string
  barcode?: string
  stock_vente: number
  is_active?: boolean
  coef?: number
  is_recipe?: boolean
}

interface CartItem {
  product: ProductItem
  qty: number
  unitPrice: number
  discount: number
  total_ttc: number
}

export const VendeurPage: React.FC = () => {
  const { companyId, sectorSlug, currentSectorSlug, company, supabaseTenant } = useTenant()
  const { user, currentProfile } = useAuthStore()
  const { toast } = useUIStore()

  const cleanSector = normalizeCircuitSectorSlug(currentSectorSlug || sectorSlug || '')
  const sellerName = currentProfile?.full_name || user?.full_name || user?.email?.split('@')[0] || 'Vendeur'
  const sellerId = currentProfile?.id || user?.id || ''

  // Données
  const [products, setProducts] = useState<ProductItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  // Filtres
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('TOUS')

  // Panier
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customCustomerName, setCustomCustomerName] = useState<string>('')
  const [notesExtra, setNotesExtra] = useState<string>('')

  // État de validation & anti-double-clic
  const [transmitting, setTransmitting] = useState(false)
  const [lastTransmittedBon, setLastTransmittedBon] = useState<any>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  // Modal Bons transmis en attente
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [pendingBons, setPendingBons] = useState<PendingBon[]>([])
  const [loadingPending, setLoadingPending] = useState(false)

  // ─── 1. Chargement des produits du stock réel ─────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!companyId) return
    setLoadingProducts(true)
    try {
      // 1. Produits réels filtrés par entreprise et secteur
      const { data: prods, error: pErr } = await supabaseTenant('products')
        .select('*')
        .order('name')

      if (pErr) throw pErr

      const mapped: ProductItem[] = (prods || [])
        .filter((p: any) => p.is_active !== false)
        .map((p: any) => {
          const meta = p.sector_meta || {}
          // Stock réel destiné à la vente
          const realStock = Number(p.stock_vente ?? meta.stock_vente ?? p.current_stock ?? p.quantity ?? 0)
          return {
            id: p.id,
            code: p.code || '',
            name: p.name || 'Produit',
            selling_price: Number(p.selling_price || 0),
            cost_price: Number(p.cost_price || 0),
            unit: p.unit || 'Unité',
            category: p.category_name || p.category || 'Général',
            barcode: p.barcode || '',
            stock_vente: Math.max(0, realStock),
            is_active: p.is_active !== false,
            coef: Number(p.coef || 1),
            is_recipe: Boolean(p.is_recipe)
          }
        })

      setProducts(mapped)

      // Extraction des catégories uniques
      const cats = Array.from(new Set(mapped.map(p => p.category || 'Général').filter(Boolean)))
      setCategories(cats)

      // 2. Clients pour sélection
      const { data: cliData } = await supabaseTenant('clients')
        .select('id, nom, prenom, telephone')
        .order('nom')
      setClients(cliData || [])

    } catch (err: any) {
      console.warn('[VendeurPage] Erreur chargement produits:', err)
      toast.error('Erreur catalogue', 'Impossible de charger le stock du secteur.')
    } finally {
      setLoadingProducts(false)
    }
  }, [companyId, supabaseTenant, toast])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // ─── 2. Chargement des bons en attente ─────────────────────────────────────
  const loadPendingBons = useCallback(async () => {
    if (!companyId) return
    setLoadingPending(true)
    try {
      const list = await fetchPendingBons(companyId, cleanSector)
      setPendingBons(list)
    } finally {
      setLoadingPending(false)
    }
  }, [companyId, cleanSector])

  useEffect(() => {
    const handleBonEvent = () => {
      loadPendingBons()
    }
    window.addEventListener('gestio:bon_transmitted', handleBonEvent)
    window.addEventListener('gestio:bon_encaisse', handleBonEvent)
    window.addEventListener('gestio:bon_annule', handleBonEvent)
    return () => {
      window.removeEventListener('gestio:bon_transmitted', handleBonEvent)
      window.removeEventListener('gestio:bon_encaisse', handleBonEvent)
      window.removeEventListener('gestio:bon_annule', handleBonEvent)
    }
  }, [loadPendingBons])

  // ─── 3. Filtrage du catalogue produits ────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return products.filter(p => {
      const matchCat = selectedCategory === 'TOUS' || p.category === selectedCategory
      if (!matchCat) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      )
    })
  }, [products, searchQuery, selectedCategory])

  // ─── 4. Gestion du Panier Vendeur ─────────────────────────────────────────
  const addToCart = (product: ProductItem) => {
    // Si stock strictement à 0, bloquer
    if (product.stock_vente <= 0) {
      toast.error('Stock épuisé', `Le produit ${product.name} n'est pas disponible en stock vente.`)
      return
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        // Contrôle anti-dépassement stock
        if (existing.qty + 1 > product.stock_vente) {
          toast.error('Stock insuffisant', `Stock maximum disponible atteint (${product.stock_vente} ${product.unit}).`)
          return prev
        }
        return prev.map(item =>
          item.product.id === product.id
            ? {
                ...item,
                qty: item.qty + 1,
                total_ttc: (item.qty + 1) * item.unitPrice
              }
            : item
        )
      }

      return [
        ...prev,
        {
          product,
          qty: 1,
          unitPrice: product.selling_price,
          discount: 0,
          total_ttc: product.selling_price
        }
      ]
    })
  }

  const updateQuantity = (productId: string, newQty: number) => {
    const prod = products.find(p => p.id === productId)
    if (!prod) return

    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }

    if (newQty > prod.stock_vente) {
      toast.error('Stock insuffisant', `Quantité limitée au stock disponible (${prod.stock_vente} ${prod.unit}).`)
      newQty = prod.stock_vente
    }

    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? {
              ...item,
              qty: newQty,
              total_ttc: Math.round(newQty * item.unitPrice)
            }
          : item
      )
    )
  }

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }

  const clearCart = () => {
    setCart([])
    setSelectedCustomerId('')
    setCustomCustomerName('')
    setNotesExtra('')
  }

  // Calculs totaux
  const totalTTC = cart.reduce((sum, item) => sum + item.total_ttc, 0)
  const totalArticles = cart.reduce((sum, item) => sum + item.qty, 0)

  // ─── 5. Transmission du Bon de Commande à la Caisse ───────────────────────
  const handleValiderEtTransmettre = async () => {
    if (cart.length === 0) {
      toast.error('Panier vide', 'Veuillez ajouter au moins un produit au panier.')
      return
    }

    // Vérification stricte des stocks disponibles pour chaque ligne
    for (const item of cart) {
      if (item.qty > item.product.stock_vente) {
        toast.error(
          'Stock insuffisant',
          `La quantité de "${item.product.name}" (${item.qty}) dépasse le stock disponible (${item.product.stock_vente}).`
        )
        return
      }
    }

    setTransmitting(true)
    try {
      // Déterminer le nom du client
      const selectedCli = clients.find(c => c.id === selectedCustomerId)
      const clientName = customCustomerName.trim() || (selectedCli ? `${selectedCli.nom} ${selectedCli.prenom || ''}`.trim() : 'Client Comptoir')

      const res = await creerEtTransmettreBon({
        company_id: companyId || '',
        sector_slug: cleanSector,
        seller_id: sellerId,
        seller_name: sellerName,
        customer_id: selectedCustomerId || null,
        customer_name: clientName,
        items: cart.map(i => ({
          product: i.product,
          qty: i.qty,
          unitPrice: i.unitPrice,
          discount: i.discount
        })),
        total_ht: totalTTC,
        total_tva: 0,
        total_aib: 0,
        total_ttc: totalTTC,
        notes_extra: notesExtra || undefined
      })

      if (!res.success) {
        throw new Error(res.error || 'Erreur lors de la création du bon.')
      }

      const receipt = {
        orderNumber: res.orderNumber,
        date: new Date().toLocaleDateString('fr-BJ', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        heure: new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' }),
        sellerName,
        customerName: clientName,
        items: [...cart],
        totalTTC,
        notes: notesExtra
      }

      setLastTransmittedBon(receipt)
      setShowReceiptModal(true)
      clearCart()

      toast.success(
        'Commande transmise à la caisse !',
        `Bon N° ${res.orderNumber} généré avec succès (${formatFCFA(totalTTC)}). Prêt pour encaissement.`
      )

      // Actualiser le compteur de bons
      loadPendingBons()

    } catch (err: any) {
      console.error('[VendeurPage] Erreur transmission bon:', err)
      toast.error('Erreur transmission', err.message || 'Impossible de transmettre la commande.')
    } finally {
      setTransmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-5 lg:p-6 space-y-5 animate-fadeIn">
      {/* ─── BANDEAU SUPÉRIEUR VENDEUR ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white shadow-md shadow-amber-500/20 font-black">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Module Vendeur & Prise de Commande
              </h1>
              <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Mode 2 : Séparation Vendeur / Caissière
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Établissement des bons de commande depuis le stock réel • Transmission directe à la caisse
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Vendeur connecté</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-end gap-1">
              <User className="w-3.5 h-3.5 text-amber-500" />
              {sellerName}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              loadPendingBons()
              setShowPendingModal(true)
            }}
            className="px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-xs"
          >
            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
            <span>Bons en attente de caisse</span>
            {pendingBons.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[10px] font-black">
                {pendingBons.length}
              </span>
            )}
          </button>

          <button
            onClick={loadProducts}
            disabled={loadingProducts}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl transition"
            title="Actualiser le stock"
          >
            <RefreshCw className={clsx('w-4 h-4', loadingProducts && 'animate-spin text-amber-600')} />
          </button>
        </div>
      </div>

      {/* ─── CORPS PRINCIPAL : CATALOGUE GAUCHE & PANIER DROITE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLONNE GAUCHE (7 ou 8 cols) : RECHERCHE & CATALOGUE */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Barre de recherche & Filtres catégories */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Rechercher par nom d'article, code ou référence..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Onglets Catégories */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('TOUS')}
                className={clsx(
                  'px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap',
                  selectedCategory === 'TOUS'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                Tous ({products.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap',
                    selectedCategory === cat
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grille Produits */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Articles disponibles : <strong>{filteredProducts.length}</strong></span>
              <span>Stock réel vérifié</span>
            </div>

            {loadingProducts ? (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                <span>Chargement du catalogue en cours...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <Package className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <p className="font-bold text-slate-600 dark:text-slate-400">Aucun produit trouvé</p>
                <p className="text-[11px] text-slate-400 mt-1">Modifiez vos critères de recherche ou sélectionnez une autre catégorie.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredProducts.map(p => {
                  const inCart = cart.find(ci => ci.product.id === p.id)
                  const isAvailable = p.stock_vente > 0

                  return (
                    <div
                      key={p.id}
                      className={clsx(
                        'p-4 rounded-2xl border transition relative flex flex-col justify-between group',
                        inCart
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700'
                          : 'bg-slate-50/60 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase truncate">
                            {p.code || 'ART'}
                          </span>
                          <span className={clsx(
                            'text-[10px] px-2 py-0.5 rounded-full font-bold',
                            isAvailable
                              ? p.stock_vente <= 5
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                          )}>
                            {isAvailable ? `${p.stock_vente} en stock` : 'Épuisé'}
                          </span>
                        </div>

                        <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">
                          {p.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{p.category}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                            {formatFCFA(p.selling_price)}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-sans">TTC</span>
                        </div>

                        {inCart ? (
                          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                            <button
                              type="button"
                              onClick={() => updateQuantity(p.id, inCart.qty - 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black font-mono px-1 min-w-[20px] text-center">
                              {inCart.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(p)}
                              className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold hover:bg-amber-400"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => addToCart(p)}
                            className={clsx(
                              'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs',
                              isAvailable
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 cursor-pointer'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                            )}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Ajouter</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLONNE DROITE (5 ou 4 cols) : PANIER & VALIDATION COMMANDE */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4 sticky top-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-500" />
                <h2 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                  Panier de Vente
                </h2>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-[11px] text-rose-500 hover:underline font-bold"
                >
                  Vider
                </button>
              )}
            </div>

            {/* Sélection Client (Optionnel) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Client (Optionnel)
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value)
                  if (e.target.value) setCustomCustomerName('')
                }}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-amber-500"
              >
                <option value="">Client Comptoir Standard</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nom} {c.prenom || ''} {c.telephone ? `(${c.telephone})` : ''}
                  </option>
                ))}
              </select>

              {!selectedCustomerId && (
                <input
                  type="text"
                  placeholder="Ou saisir le nom du client au comptoir..."
                  value={customCustomerName}
                  onChange={(e) => setCustomCustomerName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              )}
            </div>

            {/* Liste des Lignes du Panier */}
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <ShoppingCart className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                  <p className="font-bold">Votre panier est vide</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cliquez sur « Ajouter » sur un produit du catalogue.</p>
                </div>
              ) : (
                cart.map(item => (
                  <div
                    key={item.product.id}
                    className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {formatFCFA(item.unitPrice)} / {item.product.unit || 'U'}
                      </p>
                    </div>

                    {/* Contrôles Quantité */}
                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.qty - 1)}
                        className="w-5 h-5 rounded flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-black font-mono px-1 min-w-[20px] text-center">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.qty + 1)}
                        className="w-5 h-5 rounded flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-right">
                      <span className="font-black font-mono text-slate-900 dark:text-white block">
                        {formatFCFA(item.total_ttc)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-slate-400 hover:text-rose-500 p-0.5 inline-block"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Note / Observation de commande */}
            {cart.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Instruction / Note de commande (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Emballage cadeau, livraison prévue..."
                  value={notesExtra}
                  onChange={(e) => setNotesExtra(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* Récapitulatif Financier */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Nombre d'articles :</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{totalArticles}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                  Total Commande TTC :
                </span>
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {formatFCFA(totalTTC)}
                </span>
              </div>
            </div>

            {/* Bouton de Validation & Transmission */}
            <button
              type="button"
              disabled={cart.length === 0 || transmitting}
              onClick={handleValiderEtTransmettre}
              className={clsx(
                'w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition',
                cart.length > 0 && !transmitting
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-amber-500/20 cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              )}
            >
              {transmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Transmission à la caisse en cours...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Valider et transmettre à la caisse ({formatFCFA(totalTTC)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODAL REÇU / BON DE COMMANDE TRANSMIS ─── */}
      {showReceiptModal && lastTransmittedBon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowReceiptModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-black text-slate-900 dark:text-white text-base">
                Commande Validée & Transmise !
              </h3>
              <p className="text-xs text-slate-500">
                La commande est immédiatement disponible en caisse pour règlement.
              </p>
            </div>

            {/* Ticket Bon de Commande Imprimable */}
            <div id="bon-receipt-view" className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 font-mono text-xs border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="border-b border-dashed border-slate-300 dark:border-slate-700 pb-2 text-center">
                <p className="font-bold text-slate-900 dark:text-white uppercase">
                  {company?.name || 'GESTIO 229'}
                </p>
                <p className="text-[10px] text-slate-500">BON DE COMMANDE EN ATTENTE</p>
                <p className="text-[11px] font-black text-amber-600 mt-1">
                  N° {lastTransmittedBon.orderNumber}
                </p>
                <p className="text-[10px] text-slate-400">
                  {lastTransmittedBon.date} à {lastTransmittedBon.heure}
                </p>
              </div>

              <div className="space-y-1 py-1 border-b border-dashed border-slate-300 dark:border-slate-700 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vendeur :</span>
                  <span className="font-bold">{lastTransmittedBon.sellerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Client :</span>
                  <span className="font-bold">{lastTransmittedBon.customerName}</span>
                </div>
              </div>

              <div className="space-y-1 py-1 border-b border-dashed border-slate-300 dark:border-slate-700 text-[11px]">
                {lastTransmittedBon.items.map((line: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate max-w-[200px]">{line.qty}x {line.product.name}</span>
                    <span className="font-bold">{formatFCFA(line.total_ttc)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-baseline pt-1">
                <span className="font-bold">TOTAL À ENCAISSER :</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                  {formatFCFA(lastTransmittedBon.totalTTC)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" /> Imprimer le Bon
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition"
              >
                Nouvelle commande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL SUIVI DES BONS EN ATTENTE DE CAISSE ─── */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[85vh] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Bons de Commande en Attente d'Encaissement
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Secteur : {cleanSector} • Transmis à la caisse
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPendingModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingPending ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Chargement des bons...</span>
                </div>
              ) : pendingBons.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  Aucun bon en attente d'encaissement pour le secteur {cleanSector}.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">N° Bon</th>
                        <th className="p-3">Heure</th>
                        <th className="p-3">Vendeur</th>
                        <th className="p-3">Client</th>
                        <th className="p-3 text-right">Montant Total</th>
                        <th className="p-3 text-right">Reste à payer</th>
                        <th className="p-3 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {pendingBons.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition">
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{b.order_number}</td>
                          <td className="p-3 font-sans text-slate-500 text-[11px]">
                            {new Date(b.created_at).toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-3 font-sans text-slate-700 dark:text-slate-300 font-medium">
                            {b.seller_name || 'Vendeur'}
                          </td>
                          <td className="p-3 font-sans text-slate-800 dark:text-slate-200">
                            {b.customer_name || 'Client Comptoir'}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                            {formatFCFA(b.total_amount)}
                          </td>
                          <td className="p-3 text-right font-black text-amber-600">
                            {formatFCFA(b.remaining_balance)}
                          </td>
                          <td className="p-3 text-center font-sans">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                              En attente caisse
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VendeurPage
