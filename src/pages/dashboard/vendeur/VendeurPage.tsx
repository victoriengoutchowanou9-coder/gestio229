// =============================================================================
// GESTIO 229 SaaS — Module Vendeur : Prise de Commande & Bons en Piste
// =============================================================================
// Mode 2 : Séparation Vendeur / Caissière
// Permet aux vendeurs d'établir des bons de commande depuis le stock réel,
// d'afficher clairement Stock vente et Stock magasin, de choisir la quantité
// souhaitée à l'ajout, et de transmettre instantanément à la caisse.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ClipboardList, Search, Plus, Minus, Trash2, ShoppingCart, Send,
  RefreshCw, AlertTriangle, User, Clock, ArrowRightLeft, X, Printer,
  CheckCircle2, Package, Check, ArrowRight, Eye, Warehouse, Store
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { filterItemsForSector } from '../../../lib/sectorClient'
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
  ucd?: string
  category?: string
  barcode?: string
  stock_vente: number
  stock_magasin: number
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

  // Interface de sélection de quantité au clic sur « Ajouter » (Section 3)
  const [addingProduct, setAddingProduct] = useState<ProductItem | null>(null)
  const [addingQtyInput, setAddingQtyInput] = useState<string>('1')
  const [addingQtyError, setAddingQtyError] = useState<string>('')

  // État de validation & anti-double-clic
  const [transmitting, setTransmitting] = useState(false)
  const [lastTransmittedBon, setLastTransmittedBon] = useState<any>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  // Modal Bons transmis en attente & Détail d'un bon (Œil)
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [pendingBons, setPendingBons] = useState<PendingBon[]>([])
  const [loadingPending, setLoadingPending] = useState(false)
  const [selectedBonDetail, setSelectedBonDetail] = useState<PendingBon | null>(null)

  // ─── 1. Chargement des produits du stock réel (Stock vente + Stock magasin séparés) ───
  const loadProducts = useCallback(async () => {
    if (!companyId) return
    setLoadingProducts(true)
    try {
      const { data: prods, error: pErr } = await supabaseTenant('products')
        .select('*')
        .order('name')

      if (pErr) throw pErr

      const sectorProds = filterItemsForSector(prods || [], cleanSector)

      const mapped: ProductItem[] = sectorProds
        .filter((p: any) => p.is_active !== false)
        .map((p: any) => {
          const meta = p.sector_meta || {}
          // Stock réel disponible pour la vente (distinct du stock magasin)
          const realStockVente = Number(p.stock_vente ?? meta.stock_vente ?? p.current_stock ?? 0)
          // Stock réel disponible en magasin / réserve
          const realStockMagasin = Number(p.stock_magasin ?? meta.stock_magasin ?? 0)
          const unitVente = p.unit || meta.uv || 'unités'
          const unitMagasin = meta.ucd || p.unit || 'unités'

          return {
            id: p.id,
            code: p.code || meta.code || '',
            name: p.name || 'Article',
            selling_price: Number(p.selling_price || 0),
            cost_price: Number(p.cost_price || 0),
            unit: unitVente,
            ucd: unitMagasin,
            category: p.category_name || p.category || meta.category || 'Général',
            barcode: p.barcode || '',
            stock_vente: Math.max(0, Math.round(realStockVente * 1000) / 1000),
            stock_magasin: Math.max(0, Math.round(realStockMagasin * 1000) / 1000),
            is_active: p.is_active !== false,
            coef: Number(p.coef || meta.coef || 1),
            is_recipe: Boolean(p.is_recipe || meta.is_recipe)
          }
        })

      setProducts(mapped)

      const cats = Array.from(new Set(mapped.map(p => p.category || 'Général').filter(Boolean)))
      setCategories(cats)

      // Clients réels du secteur depuis public.customers
      const { data: cliData } = await supabaseTenant('customers')
        .select('id, code, name, phone, current_debt, credit_limit, credit_authorized, is_active')
        .order('name')

      setClients((cliData || []).filter((c: any) => c.is_active !== false))
    } catch (err: any) {
      console.warn('[VendeurPage] Erreur chargement produits:', err)
      toast.error('Erreur catalogue', 'Impossible de charger le stock du secteur.')
    } finally {
      setLoadingProducts(false)
    }
  }, [companyId, cleanSector, supabaseTenant, toast])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // ─── 2. Chargement des bons en attente & synchronisation temps réel ───
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
    loadPendingBons()
    const handleBonEvent = () => {
      loadPendingBons()
      loadProducts()
    }
    window.addEventListener('gestio:bon_transmitted', handleBonEvent)
    window.addEventListener('gestio:bon_encaisse', handleBonEvent)
    window.addEventListener('gestio:bon_annule', handleBonEvent)
    window.addEventListener('gestio:transaction_created', handleBonEvent)
    return () => {
      window.removeEventListener('gestio:bon_transmitted', handleBonEvent)
      window.removeEventListener('gestio:bon_encaisse', handleBonEvent)
      window.removeEventListener('gestio:bon_annule', handleBonEvent)
      window.removeEventListener('gestio:transaction_created', handleBonEvent)
    }
  }, [loadPendingBons, loadProducts])

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

  // ─── 4. Sélection de quantité à l'ajout (Section 3) ────────────────────────
  const openQuantitySelector = (product: ProductItem) => {
    if (!product.is_recipe && product.stock_vente <= 0) {
      toast.error(
        'Stock vente épuisé',
        product.stock_magasin > 0
          ? `Stock vente : 0 (${product.stock_magasin} disponible en magasin — veuillez d'abord effectuer un transfert vers le stock vente).`
          : `L'article "${product.name}" n'est plus disponible en stock vente.`
      )
      return
    }

    const existingInCart = cart.find(ci => ci.product.id === product.id)
    const alreadyInCartQty = existingInCart ? existingInCart.qty : 0
    const remainingAddable = product.is_recipe ? 999999 : Math.max(0, product.stock_vente - alreadyInCartQty)

    if (!product.is_recipe && remainingAddable <= 0) {
      toast.error(
        'Stock vente maximum atteint',
        `Vous avez déjà sélectionné tout le stock vente disponible (${product.stock_vente}) pour "${product.name}".`
      )
      return
    }

    setAddingProduct(product)
    setAddingQtyInput('1')
    setAddingQtyError('')
  }

  const parsedAddingQty = useMemo(() => {
    const val = Number(String(addingQtyInput).replace(',', '.'))
    return isNaN(val) ? 0 : Math.round(val * 1000) / 1000
  }, [addingQtyInput])

  const maxAddableForModal = useMemo(() => {
    if (!addingProduct) return 0
    if (addingProduct.is_recipe) return 999999
    const existing = cart.find(ci => ci.product.id === addingProduct.id)
    const inCartQty = existing ? existing.qty : 0
    return Math.max(0, Math.round((addingProduct.stock_vente - inCartQty) * 1000) / 1000)
  }, [addingProduct, cart])

  const handleAdjustModalQty = (delta: number) => {
    if (!addingProduct) return
    const current = parsedAddingQty > 0 ? parsedAddingQty : 1
    // Le bouton « − » ne doit jamais permettre une quantité nulle ou négative
    let next = Math.round((current + delta) * 1000) / 1000
    if (next < 1) next = 1
    if (!addingProduct.is_recipe && next > maxAddableForModal) {
      next = maxAddableForModal
      setAddingQtyError(`Quantité limitée au stock vente disponible (${maxAddableForModal} unités).`)
    } else {
      setAddingQtyError('')
    }
    setAddingQtyInput(String(next))
  }

  const handleModalQtyInputChange = (raw: string) => {
    setAddingQtyInput(raw)
    if (!addingProduct) return
    const num = Number(raw.replace(',', '.'))
    if (!raw.trim() || isNaN(num) || num <= 0) {
      setAddingQtyError('La quantité doit être strictement positive (> 0).')
    } else if (!addingProduct.is_recipe && num > maxAddableForModal) {
      setAddingQtyError(`Stock vente insuffisant : maximum disponible à ajouter = ${maxAddableForModal}.`)
    } else {
      setAddingQtyError('')
    }
  }

  const confirmAddProductWithQty = () => {
    if (!addingProduct) return
    const qty = parsedAddingQty

    if (isNaN(qty) || qty <= 0) {
      setAddingQtyError('Veuillez saisir une quantité strictement positive.')
      return
    }

    if (!addingProduct.is_recipe && qty > maxAddableForModal) {
      setAddingQtyError(`Quantité refusée : dépasse le stock vente disponible (${maxAddableForModal}).`)
      return
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === addingProduct.id)
      if (existing) {
        const updatedQty = Math.round((existing.qty + qty) * 1000) / 1000
        return prev.map(item =>
          item.product.id === addingProduct.id
            ? {
                ...item,
                qty: updatedQty,
                total_ttc: Math.max(0, Math.round(updatedQty * item.unitPrice - item.discount))
              }
            : item
        )
      }

      return [
        ...prev,
        {
          product: addingProduct,
          qty,
          unitPrice: addingProduct.selling_price,
          discount: 0,
          total_ttc: Math.round(qty * addingProduct.selling_price)
        }
      ]
    })

    toast.success(
      'Article ajouté',
      `${qty} × ${addingProduct.name} ajouté(s) à la commande.`
    )
    setAddingProduct(null)
    setAddingQtyInput('1')
    setAddingQtyError('')
  }

  const updateQuantity = (productId: string, newQty: number) => {
    const prod = products.find(p => p.id === productId)
    if (!prod) return

    if (isNaN(newQty) || newQty <= 0) {
      toast.error('Quantité invalide', 'La quantité doit être strictement positive.')
      return
    }

    if (!prod.is_recipe && newQty > prod.stock_vente) {
      toast.error('Stock vente insuffisant', `Quantité limitée au stock vente disponible (${prod.stock_vente}).`)
      newQty = prod.stock_vente
    }

    const roundedQty = Math.round(newQty * 1000) / 1000

    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? {
              ...item,
              qty: roundedQty,
              total_ttc: Math.max(0, Math.round(roundedQty * item.unitPrice - item.discount))
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

    // Vérification locale des quantités et des stocks disponibles
    for (const item of cart) {
      if (isNaN(item.qty) || item.qty <= 0) {
        toast.error('Quantité invalide', `La quantité pour "${item.product.name}" doit être strictement positive.`)
        return
      }
      if (!item.product.is_recipe && item.qty > item.product.stock_vente) {
        toast.error(
          'Stock vente insuffisant',
          `La quantité de "${item.product.name}" (${item.qty}) dépasse le stock vente disponible (${item.product.stock_vente}).`
        )
        return
      }
    }

    setTransmitting(true)
    try {
      const selectedCli = clients.find(c => c.id === selectedCustomerId)
      const clientName =
        customCustomerName.trim() ||
        (selectedCli ? (selectedCli.name || `${selectedCli.nom || ''} ${selectedCli.prenom || ''}`).trim() : 'Client Comptoir')

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

      loadPendingBons()
      loadProducts()
    } catch (err: any) {
      console.error('[VendeurPage] Erreur transmission bon:', err)
      toast.error('Erreur transmission', err.message || 'Impossible de transmettre la commande.')
      loadProducts()
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
                Circuit Vente & Caisse Activé
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Affichage distinct Stock vente / Stock magasin • Transmission directe des bons à la caisse
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

          {/* Grille Produits (Section 2 : Nom, Référence, Prix de vente, Stock vente, Stock magasin) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Articles du secteur : <strong>{filteredProducts.length}</strong></span>
              <span>Stocks réels (Vente & Magasin séparés)</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredProducts.map(p => {
                  const inCart = cart.find(ci => ci.product.id === p.id)
                  const isAvailable = p.is_recipe || p.stock_vente > 0

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
                      <div className="space-y-2">
                        {/* Référence / Code et badge panier */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase truncate">
                            Réf: {p.code || 'SANS-REF'}
                          </span>
                          {inCart && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-amber-500 text-slate-950">
                              Dans la commande : {inCart.qty}
                            </span>
                          )}
                        </div>

                        {/* Nom de l'article */}
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">
                            {p.name}
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">{p.category}</p>
                        </div>

                        {/* Affichage séparé et explicite de Stock vente et Stock magasin (Section 2.1) */}
                        <div className="pt-1.5 space-y-1.5">
                          <div className={clsx(
                            'flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-bold border',
                            isAvailable
                              ? p.stock_vente <= 5 && !p.is_recipe
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                          )}>
                            <span className="flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 shrink-0" />
                              <span>Stock vente :</span>
                            </span>
                            <span className="font-mono font-black">
                              {p.is_recipe ? 'Sur commande' : `${p.stock_vente} unités`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800">
                            <span className="flex items-center gap-1.5">
                              <Warehouse className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                              <span>Stock magasin :</span>
                            </span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {p.is_recipe ? 'N/A' : `${p.stock_magasin} unités`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Prix de vente applicable et bouton « Ajouter » */}
                      <div className="mt-3.5 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Prix de vente</span>
                          <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                            {formatFCFA(p.selling_price)}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => openQuantitySelector(p)}
                          className={clsx(
                            'px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs',
                            isAvailable
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 cursor-pointer'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          )}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Ajouter</span>
                        </button>
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
                  Panier de Commande
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
                    {c.name || `${c.nom || ''} ${c.prenom || ''}`.trim()} {c.phone ? `(${c.phone})` : ''}
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

            {/* Liste des Lignes du Panier avec saisie directe + boutons − et + */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <ShoppingCart className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                  <p className="font-bold">Votre panier est vide</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cliquez sur « Ajouter » sur un article pour choisir la quantité.</p>
                </div>
              ) : (
                cart.map(item => (
                  <div
                    key={item.product.id}
                    className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {item.product.code ? `[${item.product.code}] ` : ''}{formatFCFA(item.unitPrice)} / u
                      </p>
                      {!item.product.is_recipe && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Dispo vente : {item.product.stock_vente}
                        </p>
                      )}
                    </div>

                    {/* Contrôles Quantité : bouton −, champ numérique direct, bouton + */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                      <button
                        type="button"
                        disabled={item.qty <= 1}
                        onClick={() => updateQuantity(item.product.id, Math.max(1, item.qty - 1))}
                        className={clsx(
                          'w-6 h-6 rounded-lg flex items-center justify-center transition',
                          item.qty <= 1
                            ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        )}
                        title="Diminuer la quantité"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <input
                        type="number"
                        min={1}
                        max={item.product.is_recipe ? undefined : item.product.stock_vente}
                        step="any"
                        value={item.qty}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          if (!isNaN(val) && val > 0) {
                            updateQuantity(item.product.id, val)
                          }
                        }}
                        className="w-12 text-center text-xs font-black font-mono bg-transparent text-slate-900 dark:text-white focus:outline-none"
                      />

                      <button
                        type="button"
                        disabled={!item.product.is_recipe && item.qty >= item.product.stock_vente}
                        onClick={() => updateQuantity(item.product.id, item.qty + 1)}
                        className={clsx(
                          'w-6 h-6 rounded-lg flex items-center justify-center transition',
                          !item.product.is_recipe && item.qty >= item.product.stock_vente
                            ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        )}
                        title="Augmenter la quantité"
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
                        title="Retirer l'article"
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
                <span>Quantité totale d'articles :</span>
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
                  <span>Vérification du stock & transmission...</span>
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

      {/* ─── MODAL DE SÉLECTION DE QUANTITÉ AU CLIC SUR « AJOUTER » (SECTION 3) ─── */}
      {addingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                  Réf : {addingProduct.code || 'SANS-REF'}
                </span>
                <h3 className="font-black text-base text-slate-900 dark:text-white mt-1">
                  {addingProduct.name}
                </h3>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                  Prix unitaire : {formatFCFA(addingProduct.selling_price)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddingProduct(null)}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rappel des stocks vente & magasin */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
                  Stock vente disponible
                </span>
                <span className="font-mono font-black text-sm text-emerald-800 dark:text-emerald-300">
                  {addingProduct.is_recipe ? 'Illimité' : `${maxAddableForModal} unités`}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                  Stock magasin
                </span>
                <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-200">
                  {addingProduct.is_recipe ? 'N/A' : `${addingProduct.stock_magasin} unités`}
                </span>
              </div>
            </div>

            {/* Contrôleur de quantité : bouton −, champ numérique direct, bouton + */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 block text-center">
                Choisir la quantité à ajouter
              </label>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={parsedAddingQty <= 1}
                  onClick={() => handleAdjustModalQty(-1)}
                  className={clsx(
                    'w-12 h-12 rounded-2xl font-black text-lg flex items-center justify-center border transition',
                    parsedAddingQty <= 1
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 cursor-pointer'
                  )}
                  title="Diminuer la quantité (−)"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <input
                  type="number"
                  min={1}
                  max={addingProduct.is_recipe ? undefined : maxAddableForModal}
                  step="any"
                  autoFocus
                  value={addingQtyInput}
                  onChange={(e) => handleModalQtyInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && parsedAddingQty > 0 && !addingQtyError) {
                      e.preventDefault()
                      confirmAddProductWithQty()
                    }
                  }}
                  className="w-28 h-12 text-center text-xl font-black font-mono bg-slate-50 dark:bg-slate-950 border-2 border-amber-500 rounded-2xl text-slate-900 dark:text-white focus:outline-none"
                />

                <button
                  type="button"
                  disabled={!addingProduct.is_recipe && parsedAddingQty >= maxAddableForModal}
                  onClick={() => handleAdjustModalQty(1)}
                  className={clsx(
                    'w-12 h-12 rounded-2xl font-black text-lg flex items-center justify-center border transition',
                    !addingProduct.is_recipe && parsedAddingQty >= maxAddableForModal
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-500 cursor-pointer'
                  )}
                  title="Augmenter la quantité (+)"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {addingQtyError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{addingQtyError}</span>
                </div>
              )}
            </div>

            {/* Aperçu immédiat de la quantité sélectionnée et du montant de la ligne */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Quantité sélectionnée
                </span>
                <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-200">
                  {parsedAddingQty > 0 ? parsedAddingQty : 0} × {formatFCFA(addingProduct.selling_price)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Montant de la ligne
                </span>
                <span className="font-mono font-black text-lg text-emerald-600 dark:text-emerald-400">
                  {formatFCFA(parsedAddingQty > 0 ? Math.round(parsedAddingQty * addingProduct.selling_price) : 0)}
                </span>
              </div>
            </div>

            {/* Actions Annuler / Confirmer l'ajout */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setAddingProduct(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  parsedAddingQty <= 0 ||
                  Boolean(addingQtyError) ||
                  (!addingProduct.is_recipe && parsedAddingQty > maxAddableForModal)
                }
                onClick={confirmAddProductWithQty}
                className={clsx(
                  'flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition',
                  parsedAddingQty > 0 && !addingQtyError && (addingProduct.is_recipe || parsedAddingQty <= maxAddableForModal)
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                )}
              >
                <Check className="w-4 h-4" />
                <span>Confirmer l'ajout</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[85vh] p-6 shadow-2xl flex flex-col gap-4">
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
                        <th className="p-3">Date & Heure</th>
                        <th className="p-3">Vendeur</th>
                        <th className="p-3">Client</th>
                        <th className="p-3 text-right">Montant Total</th>
                        <th className="p-3 text-right">Reste à payer</th>
                        <th className="p-3 text-center">Statut</th>
                        <th className="p-3 text-center">Détails</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {pendingBons.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition">
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{b.order_number}</td>
                          <td className="p-3 font-sans text-slate-500 text-[11px]">
                            {new Date(b.created_at).toLocaleString('fr-BJ', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
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
                          <td className="p-3 text-center font-sans">
                            <button
                              type="button"
                              onClick={() => setSelectedBonDetail(b)}
                              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-600 dark:text-slate-300 transition inline-flex items-center justify-center"
                              title="Voir les détails de la commande"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
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

      {/* ─── MODAL DÉTAIL D'UNE COMMANDE (ICÔNE ŒIL) ─── */}
      {selectedBonDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[88vh] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                  Détails de la commande
                </span>
                <h3 className="font-black text-base text-slate-900 dark:text-white mt-1 font-mono">
                  {selectedBonDetail.order_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBonDetail(null)}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Date & Heure</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {new Date(selectedBonDetail.created_at).toLocaleString('fr-BJ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Vendeur</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {selectedBonDetail.seller_name || 'Vendeur'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Client</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {selectedBonDetail.customer_name || 'Client Comptoir'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Statut</span>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                  {selectedBonDetail.status === 'partiellement_paye' ? 'Partiellement payé' : 'En attente d\'encaissement'}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">Réf.</th>
                    <th className="p-2.5">Article</th>
                    <th className="p-2.5 text-center">Qté</th>
                    <th className="p-2.5 text-right">Prix Unitaire</th>
                    <th className="p-2.5 text-right">Remise</th>
                    <th className="p-2.5 text-right">Montant Ligne</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedBonDetail.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-mono text-[11px] text-slate-500">{it.product_code || '—'}</td>
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white">{it.product_name}</td>
                      <td className="p-2.5 text-center font-mono font-bold">{it.quantity}</td>
                      <td className="p-2.5 text-right font-mono">{formatFCFA(it.unit_price)}</td>
                      <td className="p-2.5 text-right font-mono text-slate-500">{formatFCFA(Number(it.discount || 0))}</td>
                      <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-white">{formatFCFA(it.total_ttc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Sous-total HT :</span>
                <span className="font-mono font-bold">{formatFCFA(Number(selectedBonDetail.subtotal_ht ?? selectedBonDetail.total_amount))}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Remises :</span>
                <span className="font-mono font-bold">{formatFCFA(Number(selectedBonDetail.discount_total || 0))}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Taxes (TVA + AIB) :</span>
                <span className="font-mono font-bold">
                  {formatFCFA(Number(selectedBonDetail.tva_amount || 0) + Number(selectedBonDetail.aib_amount || 0))}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200 dark:border-slate-800">
                <span className="font-black uppercase text-slate-900 dark:text-white">Montant Total à Encaisser :</span>
                <span className="font-mono font-black text-base text-emerald-600 dark:text-emerald-400">
                  {formatFCFA(selectedBonDetail.remaining_balance)}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBonDetail(null)}
                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
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
