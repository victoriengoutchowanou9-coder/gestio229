// =============================================================================
// GESTIO 229 SaaS — Caisse Ultra-Rapide Professionnelle Supermarché & Supérette
// Scanner HID Bluetooth/USB, Touches Rapides Clavier F1-F12, Multi-Panier / En Attente,
// Encaissement Espèces avec Monnaie, Mixte & Mobile Money, Impression Thermique 58/80mm
// Respect strict de la BDD Supabase, isolation (company_id + sector_slug='supermarche')
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Barcode, Search, ShoppingCart, Trash2, Plus, Minus, CreditCard,
  Printer, PauseCircle, PlayCircle, RefreshCw, AlertCircle, CheckCircle2,
  DollarSign, Smartphone, ArrowRight, User, X, Tag, FileText, Check, Lock,
  Clock, RotateCcw, AlertTriangle, ShieldCheck, Download
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { useAppContext } from '../../../contexts/AppContext'
import { formatFCFA } from '../../../utils/tax'
import { checkSectorCaisseStatus } from '../../../services/caisseSectorService'
import { enregistrerEntreeCaisse } from '../../../services/caisseDepensesService'
import { imprimerTicketThermique, telechargerTicketPDF, TicketData } from '../../../utils/thermalPrinter'
import { filterItemsForSector, getActiveSectorSlug } from '../../../lib/sectorClient'

const fmt = (n: number = 0) => formatFCFA(n)

export interface SupermarcheProduct {
  id: string
  code: string
  name: string
  unit: string
  selling_price: number
  cost_price: number
  current_stock: number
  stock_vente?: number
  stock_magasin?: number
  category?: string
  barcode?: string
  dlc_date?: string
}

export interface CartLine {
  product: SupermarcheProduct
  qty: number
  unitPrice: number
  discountPct: number
  totalLine: number
}

export interface ParkedTicket {
  id: string
  clientName: string
  savedAt: string
  lines: CartLine[]
}

export const SupermarcheCaissePage: React.FC = () => {
  const { user } = useAuthStore()
  const { toast } = useUIStore() as any
  const { companyId, sectorSlug } = useTenant()
  const { companyName } = useAppContext()

  const activeSector = sectorSlug || 'supermarche'

  // ─── Références DOM ────────────────────────────────────────────────────────
  const scanInputRef = useRef<HTMLInputElement>(null)
  const cashAmountInputRef = useRef<HTMLInputElement>(null)

  // ─── État Général ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<SupermarcheProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous')
  const [caisseOpen, setCaisseOpen] = useState(true)
  const [caisseMessage, setCaisseMessage] = useState('')

  // ─── Scanner & Recherche ───────────────────────────────────────────────────
  const [scanInput, setScanInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null)

  // ─── Panier en cours ───────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([])
  const [clientNom, setClientNom] = useState('Client Comptoir')
  const [clientTel, setClientTel] = useState('')
  const [parkedTickets, setParkedTickets] = useState<ParkedTicket[]>([])

  // ─── Encaissement ──────────────────────────────────────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'carte' | 'mixte' | 'credit'>('especes')
  const [amountReceived, setAmountReceived] = useState<number>(0)
  const [mixtePayments, setMixtePayments] = useState<{
    especes: number
    momo: number
    carte: number
  }>({ especes: 0, momo: 0, carte: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Confirmation de Vente & Ticket ────────────────────────────────────────
  const [lastCompletedSale, setLastCompletedSale] = useState<any | null>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [autoPrintTicket, setAutoPrintTicket] = useState(true)

  // ─── Refocaliser automatiquement le scanner ────────────────────────────────
  const refocaliserScanner = useCallback(() => {
    setTimeout(() => {
      if (scanInputRef.current && !showPaymentModal && !showSuccessModal) {
        scanInputRef.current.focus()
      }
    }, 80)
  }, [showPaymentModal, showSuccessModal])

  // ─── 1. Chargement du catalogue Produits ───────────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // 1. Vérifier le statut de la caisse
      const caisseStat = await checkSectorCaisseStatus(companyId, activeSector)
      setCaisseOpen(caisseStat.isOpen)
      if (!caisseStat.isOpen) {
        setCaisseMessage(caisseStat.message || 'La session de caisse est fermée.')
      }

      // 2. Charger les articles isolés du supermarché
      let rawProds: any[] = []
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('company_id', companyId)
        .neq('is_active', false)
        .order('name', { ascending: true })

      if (error) throw error

      // Isolation stricte : filtrer pour que SEULS les produits Supermarché apparaissent
      rawProds = filterItemsForSector(data || [], activeSector)

      const mapped: SupermarcheProduct[] = rawProds.map((p: any) => ({
        id: p.id,
        code: p.code || p.sku || 'ART',
        name: p.name,
        unit: p.unit || 'u',
        selling_price: Number(p.selling_price || 0),
        cost_price: Number(p.cost_price || 0),
        current_stock: Number(p.stock_vente ?? p.current_stock ?? 0),
        stock_vente: Number(p.stock_vente ?? p.current_stock ?? 0),
        stock_magasin: Number(p.stock_magasin ?? 0),
        category: p.category || 'Alimentation',
        barcode: p.barcode || p.code_barre || p.code || '',
        dlc_date: p.dlc_date || p.peremption_date
      }))

      setProducts(mapped)

      // Catégories uniques
      const cats = Array.from(new Set(mapped.map((p) => p.category).filter(Boolean))) as string[]
      setCategories(['Tous', ...cats])
    } catch (err: any) {
      console.error('Erreur chargement supermarché :', err)
      toast.error('Erreur catalogue', err.message)
    } finally {
      setLoading(false)
      refocaliserScanner()
    }
  }, [companyId, activeSector, toast, refocaliserScanner])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // ─── 2. Ajout au panier (Scanner ou Clic) ───────────────────────────────────
  const ajouterAuPanier = useCallback(
    (product: SupermarcheProduct, qtyToAdd: number = 1) => {
      setCart((prev) => {
        const existingIndex = prev.findIndex((item) => item.product.id === product.id)
        if (existingIndex > -1) {
          const updated = [...prev]
          const existing = updated[existingIndex]
          const newQty = existing.qty + qtyToAdd

          // Vérification avertissement de stock (sans bloquer la vente si autorisé)
          if (newQty > product.current_stock) {
            toast.warning(
              `Stock faible pour ${product.name}`,
              `Disponible : ${product.current_stock} ${product.unit}. Total demandé : ${newQty}.`
            )
          }

          const lineTotal = newQty * existing.unitPrice * (1 - existing.discountPct / 100)
          updated[existingIndex] = {
            ...existing,
            qty: newQty,
            totalLine: lineTotal
          }
          return updated
        } else {
          if (qtyToAdd > product.current_stock) {
            toast.warning(
              `Stock faible pour ${product.name}`,
              `Disponible : ${product.current_stock} ${product.unit}.`
            )
          }

          const lineTotal = qtyToAdd * product.selling_price
          return [
            ...prev,
            {
              product,
              qty: qtyToAdd,
              unitPrice: product.selling_price,
              discountPct: 0,
              totalLine: lineTotal
            }
          ]
        }
      })

      refocaliserScanner()
    },
    [toast, refocaliserScanner]
  )

  // ─── 3. Traitement Scan Code-Barres HID (Touche Entrée / Scanner) ───────────
  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = scanInput.trim()
    if (!code) return

    setLastScannedCode(code)

    // Recherche exacte par code-barres ou code article
    const found = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
        p.code.toLowerCase() === code.toLowerCase()
    )

    if (found) {
      ajouterAuPanier(found, 1)
      setScanInput('')
      toast.success(`Ajouté : ${found.name}`, `${fmt(found.selling_price)}`)
    } else {
      toast.error('Code inconnu', `Aucun produit correspondant au code « ${code} ».`)
      // Proposer une recherche partielle
      setSearchTerm(code)
      setScanInput('')
    }

    refocaliserScanner()
  }

  // ─── 4. Modification de ligne de panier ─────────────────────────────────────
  const modifierQuantite = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== productId) return line
          const newQty = Math.max(0, line.qty + delta)
          if (newQty === 0) return null
          return {
            ...line,
            qty: newQty,
            totalLine: newQty * line.unitPrice * (1 - line.discountPct / 100)
          }
        })
        .filter(Boolean) as CartLine[]
    )
    refocaliserScanner()
  }

  const supprimerLigne = (productId: string) => {
    setCart((prev) => prev.filter((line) => line.product.id !== productId))
    refocaliserScanner()
  }

  const viderTicket = () => {
    if (cart.length === 0) return
    if (window.confirm('Voulez-vous vraiment vider l\'ensemble du ticket en cours ?')) {
      setCart([])
      setClientNom('Client Comptoir')
      setClientTel('')
      toast.info('Ticket vidé')
      refocaliserScanner()
    }
  }

  // ─── 5. Gestion des Tickets en attente (Park/Resume) ────────────────────────
  const mettreEnAttente = () => {
    if (cart.length === 0) {
      toast.error('Panier vide', 'Rien à mettre en attente.')
      return
    }

    const ticketParke: ParkedTicket = {
      id: `ATT-${Date.now().toString().slice(-4)}`,
      clientName: clientNom || 'Client Comptoir',
      savedAt: new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' }),
      lines: [...cart]
    }

    setParkedTickets((prev) => [...prev, ticketParke])
    setCart([])
    setClientNom('Client Comptoir')
    setClientTel('')
    toast.success(`Ticket ${ticketParke.id} mis en attente !`, `${ticketParke.lines.length} articles`)
    refocaliserScanner()
  }

  const reprendreTicket = (ticket: ParkedTicket) => {
    if (cart.length > 0) {
      if (!window.confirm('Le panier actuel n\'est pas vide. L\'écraser pour reprendre le ticket en attente ?')) {
        return
      }
    }

    setCart(ticket.lines)
    setClientNom(ticket.clientName)
    setParkedTickets((prev) => prev.filter((t) => t.id !== ticket.id))
    toast.info(`Ticket ${ticket.id} repris`, 'Prêt pour l\'encaissement.')
    refocaliserScanner()
  }

  // ─── 6. Calculs Financiers ─────────────────────────────────────────────────
  const sousTotal = useMemo(() => cart.reduce((sum, l) => sum + l.totalLine, 0), [cart])
  const remiseTotale = useMemo(
    () => cart.reduce((sum, l) => sum + l.qty * l.unitPrice * (l.discountPct / 100), 0),
    [cart]
  )
  const totalNet = sousTotal

  // Rendu de monnaie pour espèces
  const monnaieRendue = useMemo(() => {
    if (paymentMethod === 'especes' && amountReceived > totalNet) {
      return amountReceived - totalNet
    }
    return 0
  }, [paymentMethod, amountReceived, totalNet])

  // Reste à payer pour paiement mixte
  const totalMixteRegle = useMemo(
    () => Number(mixtePayments.especes || 0) + Number(mixtePayments.momo || 0) + Number(mixtePayments.carte || 0),
    [mixtePayments]
  )
  const resteMixteAPayer = useMemo(() => Math.max(0, totalNet - totalMixteRegle), [totalNet, totalMixteRegle])

  // ─── 7. Raccourcis Clavier Globaux (F1: Focus Scan, F2: Attente, F4: Encaisser, Esc: Annuler) ─
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        refocaliserScanner()
      } else if (e.key === 'F2') {
        e.preventDefault()
        mettreEnAttente()
      } else if (e.key === 'F4') {
        e.preventDefault()
        if (cart.length > 0) {
          ouvrirEncaissement()
        }
      } else if (e.key === 'Escape') {
        if (showPaymentModal) setShowPaymentModal(false)
        if (showSuccessModal) setShowSuccessModal(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cart, refocaliserScanner, showPaymentModal, showSuccessModal])

  // ─── 8. Ouverture Modale Encaissement ──────────────────────────────────────
  const ouvrirEncaissement = () => {
    if (cart.length === 0) {
      toast.error('Panier vide', 'Ajoutez au moins un produit avant d\'encaisser.')
      return
    }
    setAmountReceived(totalNet)
    setMixtePayments({ especes: totalNet, momo: 0, carte: 0 })
    setShowPaymentModal(true)
    setTimeout(() => {
      if (cashAmountInputRef.current) cashAmountInputRef.current.focus()
    }, 100)
  }

  // ─── 9. Validation Atomique de la Vente dans Supabase ──────────────────────
  const validerVente = async () => {
    if (isSubmitting) return
    if (!companyId) return

    // Contrôles des montants
    if (paymentMethod === 'especes' && amountReceived < totalNet) {
      toast.error('Montant insuffisant', `Reçu : ${fmt(amountReceived)} | Attendu : ${fmt(totalNet)}`)
      return
    }
    if (paymentMethod === 'mixte' && totalMixteRegle !== totalNet) {
      toast.error('Paiement mixte incomplet', `Reste à payer : ${fmt(resteMixteAPayer)}`)
      return
    }

    setIsSubmitting(true)
    try {
      const dateNow = new Date().toISOString()
      const orderNumber = `SM-${Date.now().toString().slice(-6)}`

      // 1. Enregistrement dans sales_orders
      const { data: orderData, error: orderErr } = await supabase
        .from('sales_orders')
        .insert({
          company_id: companyId,
          order_number: orderNumber,
          customer_name: clientNom || 'Client Comptoir',
          customer_phone: clientTel || null,
          sector_slug: activeSector,
          subtotal_ht: Math.round(totalNet / 1.18),
          tva_amount: Math.round(totalNet - totalNet / 1.18),
          total_amount: totalNet,
          paid_amount: totalNet,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'credit' ? 'CREDIT' : 'PAID',
          created_by: user?.id,
          created_at: dateNow
        })
        .select()
        .single()

      if (orderErr) throw orderErr

      // 2. Enregistrement des lignes d'articles & Décrémentation Stock
      for (const line of cart) {
        // Enregistrer la ligne de vente
        await supabase.from('sales_order_items').insert({
          order_id: orderData.id,
          product_id: line.product.id,
          product_name: line.product.name,
          quantity: line.qty,
          unit_price: line.unitPrice,
          total_price: line.totalLine
        })

        // Décrémenter le stock dans products
        const nouveauStockVente = Math.max(0, line.product.current_stock - line.qty)
        await supabase
          .from('products')
          .update({
            current_stock: nouveauStockVente,
            stock_vente: nouveauStockVente,
            updated_at: dateNow
          })
          .eq('id', line.product.id)
      }

      // 3. Mouvement de caisse si paiement comptant (espèces ou MoMo)
      if (paymentMethod === 'especes') {
        try {
          await enregistrerEntreeCaisse({
            companyId,
            secteurSlug: activeSector,
            montant: totalNet,
            typeFond: 'especes',
            motif: `Vente supermarché ${orderNumber}`,
            reference: orderNumber
          })
        } catch (_) {}
      } else if (paymentMethod === 'momo_mtn' || paymentMethod === 'momo_moov') {
        try {
          await enregistrerEntreeCaisse({
            companyId,
            secteurSlug: activeSector,
            montant: totalNet,
            typeFond: 'mtn_momo',
            motif: `Vente supermarché ${orderNumber} (${paymentMethod})`,
            reference: orderNumber
          })
        } catch (_) {}
      }

      // 4. Objet Ticket pour impression
      const ticketInfo: TicketData = {
        company: {
          name: companyName || 'GESTIO 229 SUPERMARCHÉ',
          phone: user?.phone || '+229 01 00 00 00',
          ifu: user?.user_metadata?.ifu || 'En cours'
        },
        sale: {
          orderNumber,
          date: dateNow,
          cashierName: user?.user_metadata?.full_name || user?.email || 'Caissier',
          customerName: clientNom,
          isDuplicate: false
        },
        lines: cart.map((l) => ({
          code: l.product.code,
          name: l.product.name,
          qty: l.qty,
          unit: l.product.unit,
          unitPrice: l.unitPrice,
          discount: l.discountPct,
          total: l.totalLine
        })),
        totals: {
          subtotal: sousTotal,
          discount: remiseTotale,
          totalNet,
          amountReceived: paymentMethod === 'especes' ? amountReceived : undefined,
          changeGiven: paymentMethod === 'especes' ? monnaieRendue : undefined
        },
        payments:
          paymentMethod === 'mixte'
            ? [
                { method: 'Espèces', amount: mixtePayments.especes },
                { method: 'MoMo', amount: mixtePayments.momo },
                { method: 'Carte', amount: mixtePayments.carte }
              ].filter((p) => p.amount > 0)
            : [{ method: paymentMethod.toUpperCase(), amount: totalNet }],
        footerMessage: 'GESTIO 229 vous remercie de votre visite !'
      }

      setLastCompletedSale(ticketInfo)
      setShowPaymentModal(false)
      setShowSuccessModal(true)

      // Impression automatique si activée
      if (autoPrintTicket) {
        imprimerTicketThermique(ticketInfo, { width: '80mm', autoPrint: true })
      }

      // Réinitialiser le panier
      setCart([])
      setClientNom('Client Comptoir')
      setClientTel('')

      toast.success('Vente validée avec succès !', `N° Ticket : ${orderNumber}`)
      loadProducts()
    } catch (err: any) {
      console.error('Erreur validation vente supermarché :', err)
      toast.error('Échec de validation', err.message || 'Impossible d\'enregistrer la vente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtrage rapide pour le pavé tactile / recherche manuelle
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'Tous' || p.category === selectedCategory
      const matchSearch =
        !searchTerm ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
      return matchCat && matchSearch
    })
  }, [products, selectedCategory, searchTerm])

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4.5rem)] gap-3 p-3 bg-slate-900 text-slate-100 font-sans select-none overflow-hidden">
      {/* ════════════════════════════════════════════════════════════════════════
          PANNEAU DE GAUCHE (60%) : Scanner, Raccourcis, Pavé Produits
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-slate-800/90 rounded-2xl border border-slate-700/80 p-3 overflow-hidden shadow-xl">
        {/* BARRE D'ACTION SUPÉRIEURE : Scanner HID Permanent */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/30 flex items-center gap-2 mb-3 shadow-inner">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Barcode className="w-5 h-5 animate-pulse" />
          </div>
          <form onSubmit={handleScanSubmit} className="flex-1 flex items-center gap-2">
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="SCANNER CODE-BARRES ICI (ou saisir et taper Entrée) [F1]"
              className="w-full bg-transparent text-emerald-300 font-mono text-sm sm:text-base font-bold placeholder:text-slate-500 focus:outline-none"
              autoFocus
            />
            {scanInput && (
              <button
                type="submit"
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shrink-0 transition"
              >
                Ajouter
              </button>
            )}
          </form>

          {/* Raccourcis clavier affichés */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 border-l border-slate-700 pl-3">
            <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-600">F1 Scan</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-600">F2 Attente</span>
            <span className="bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-700">F4 Encaisser</span>
          </div>
        </div>

        {/* RECHERCHE MANUELLE & CATÉGORIES TACTILES */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-2">
          {/* Recherche texte */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Recherche manuelle par nom, réf..."
              className="w-full bg-slate-900/90 text-slate-200 pl-9 pr-3 py-1.5 rounded-xl border border-slate-700 text-xs focus:border-emerald-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Rafraîchir */}
          <button
            onClick={loadProducts}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 transition shrink-0"
            title="Rafraîchir les produits"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>

        {/* Onglets Catégories horizontales déroulantes */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2 scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-700/40 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* GRILLE TACTILE DES PRODUITS */}
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 content-start">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-2xl border border-dashed border-slate-700/80 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mb-3">
                <ShoppingCart className="w-6 h-6 stroke-1" />
              </div>
              <p className="font-bold text-sm text-slate-300">Aucun produit en stock Supermarché</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Le stock de ce secteur est actuellement vide. Créez des articles dans le menu <strong>Stocks &gt; Nouveau Produit</strong> pour les retrouver ici.
              </p>
            </div>
          ) : (
            filteredProducts.map((p) => {
              const lowStock = p.current_stock <= 3
              return (
                <button
                  key={p.id}
                  onClick={() => ajouterAuPanier(p, 1)}
                  className="flex flex-col justify-between p-2.5 bg-slate-900/60 hover:bg-slate-700/60 active:scale-[0.98] border border-slate-700/60 rounded-xl text-left transition h-24 group relative overflow-hidden"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-100 line-clamp-2 group-hover:text-emerald-400 transition">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {p.code}
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-1">
                    <span className="text-xs font-black text-emerald-400">
                      {fmt(p.selling_price)}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                        p.current_stock <= 0
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : lowStock
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p.current_stock} {p.unit}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          PANNEAU DE DROITE (40%) : Ticket de Caisse Actuel & Encaissement
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[420px] flex flex-col bg-slate-800/95 rounded-2xl border border-slate-700/80 p-3 overflow-hidden shadow-2xl">
        {/* EN-TÊTE DU TICKET */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-700 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Ticket en cours</h2>
              <p className="text-[10px] text-slate-400">{cart.length} ligne(s) d'articles</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={mettreEnAttente}
              disabled={cart.length === 0}
              className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition disabled:opacity-40"
              title="Mettre le ticket en attente [F2]"
            >
              <PauseCircle className="w-3.5 h-3.5" /> Attente
            </button>
            <button
              onClick={viderTicket}
              disabled={cart.length === 0}
              className="p-1.5 bg-rose-900/30 hover:bg-rose-900/50 text-rose-400 border border-rose-700/40 rounded-lg transition disabled:opacity-40"
              title="Vider le ticket"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CLIENT COMPTOIR & TICKETS EN ATTENTE ACTIFS */}
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center gap-1.5 bg-slate-900/70 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={clientNom}
              onChange={(e) => setClientNom(e.target.value)}
              placeholder="Nom du Client (Client Comptoir)"
              className="bg-transparent flex-1 text-slate-200 text-xs font-medium focus:outline-none"
            />
          </div>

          {/* Affichage des tickets en attente si existants */}
          {parkedTickets.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {parkedTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => reprendreTicket(t)}
                  className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 hover:bg-amber-500/30 transition"
                >
                  <PlayCircle className="w-3 h-3 text-amber-400" />
                  {t.id} ({t.lines.length})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* LISTE DÉROULANTE DES LIGNES DU PANIER */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 mb-2 scrollbar-thin">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-8">
              <ShoppingCart className="w-8 h-8 mb-2 stroke-1 opacity-50" />
              Panier vide. Scannez un article pour commencer.
            </div>
          ) : (
            cart.map((line) => (
              <div
                key={line.product.id}
                className="flex items-center justify-between p-2 bg-slate-900/80 rounded-xl border border-slate-700/60 text-xs hover:border-slate-600 transition"
              >
                <div className="flex-1 mr-2 min-w-0">
                  <div className="font-bold text-slate-200 truncate">{line.product.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {line.qty} {line.product.unit} x {fmt(line.unitPrice)}
                  </div>
                </div>

                {/* Contrôles de quantité */}
                <div className="flex items-center gap-1 mr-2 shrink-0">
                  <button
                    onClick={() => modifierQuantite(line.product.id, -1)}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center font-bold text-emerald-400 font-mono text-xs">
                    {line.qty}
                  </span>
                  <button
                    onClick={() => modifierQuantite(line.product.id, 1)}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-black text-slate-100">{fmt(line.totalLine)}</div>
                  <button
                    onClick={() => supprimerLigne(line.product.id)}
                    className="text-[10px] text-rose-400 hover:text-rose-300"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* BAS DU PANNEAU : TOTAUX & BOUTON D'ENCAISSEMENT DIRECT */}
        <div className="pt-2 border-t border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Sous-total :</span>
            <span className="font-mono">{fmt(sousTotal)}</span>
          </div>

          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-emerald-500/40 shadow-inner">
            <span className="text-sm font-bold text-slate-200">TOTAL NET :</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              {fmt(totalNet)}
            </span>
          </div>

          <button
            onClick={ouvrirEncaissement}
            disabled={cart.length === 0}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white rounded-xl font-black text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition disabled:opacity-40"
          >
            <span>ENCAISSER [F4]</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL D'ENCAISSEMENT PROFESSIONNEL ULTRA-RAPIDE
         ════════════════════════════════════════════════════════════════════════ */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 max-w-lg w-full rounded-3xl p-5 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold">Encaissement du Ticket</h3>
                <p className="text-xs text-slate-400">{clientNom} • {cart.length} article(s)</p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total à payer en évidence */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/50 text-center">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Montant Net à Payer</span>
              <div className="text-3xl font-black text-emerald-400 font-mono mt-0.5">
                {fmt(totalNet)}
              </div>
            </div>

            {/* Choix du mode de paiement */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('especes')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  paymentMethod === 'especes'
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <DollarSign className="w-4 h-4" /> Espèces
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('momo_mtn')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  paymentMethod === 'momo_mtn'
                    ? 'bg-amber-500 border-amber-300 text-slate-950 shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" /> MTN MoMo
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('momo_moov')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  paymentMethod === 'momo_moov'
                    ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" /> Moov Money
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('carte')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  paymentMethod === 'carte'
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" /> Carte Bancaire
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('mixte')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  paymentMethod === 'mixte'
                    ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Tag className="w-4 h-4" /> Paiement Mixte
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  paymentMethod === 'credit'
                    ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <User className="w-4 h-4" /> Crédit Client
              </button>
            </div>

            {/* Formulaire selon méthode */}
            {paymentMethod === 'especes' && (
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1">Montant Reçu en Espèces</label>
                  <input
                    ref={cashAmountInputRef}
                    type="number"
                    value={amountReceived || ''}
                    onChange={(e) => setAmountReceived(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xl font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Coupures rapides */}
                <div className="flex gap-1.5 flex-wrap">
                  {[totalNet, 1000, 2000, 5000, 10000, 20000].filter((v) => v >= totalNet).slice(0, 5).map((montant) => (
                    <button
                      key={montant}
                      type="button"
                      onClick={() => setAmountReceived(montant)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-mono font-semibold"
                    >
                      {fmt(montant)}
                    </button>
                  ))}
                </div>

                {/* Monnaie à rendre */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-300">Monnaie à rendre :</span>
                  <span className={`text-xl font-mono font-black ${monnaieRendue > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {fmt(monnaieRendue)}
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === 'mixte' && (
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1">Espèces</label>
                    <input
                      type="number"
                      value={mixtePayments.especes || ''}
                      onChange={(e) =>
                        setMixtePayments((prev) => ({ ...prev, especes: Number(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono font-bold text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1">MoMo</label>
                    <input
                      type="number"
                      value={mixtePayments.momo || ''}
                      onChange={(e) =>
                        setMixtePayments((prev) => ({ ...prev, momo: Number(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono font-bold text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1">Carte</label>
                    <input
                      type="number"
                      value={mixtePayments.carte || ''}
                      onChange={(e) =>
                        setMixtePayments((prev) => ({ ...prev, carte: Number(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono font-bold text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                  <span>Reste à payer :</span>
                  <span className={`font-mono font-bold ${resteMixteAPayer === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fmt(resteMixteAPayer)}
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === 'credit' && (
              <div className="p-3 bg-amber-950/30 border border-amber-800 rounded-xl text-xs text-amber-300">
                ⚠️ Une vente à crédit engage la responsabilité du client identifié ({clientNom}). Le compte client sera débité.
              </div>
            )}

            {/* Validation */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={validerVente}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition text-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Validation en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmer l'Encaissement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL DE SUCCÈS & RÉIMPRESSION TICKET
         ════════════════════════════════════════════════════════════════════════ */}
      {showSuccessModal && lastCompletedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-3xl p-6 shadow-2xl text-center space-y-4 text-slate-100">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white">Vente Enregistrée !</h3>
              <p className="text-xs text-slate-400 mt-1">Ticket n° {lastCompletedSale.sale.orderNumber}</p>
            </div>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs font-mono space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Montant Net :</span>
                <span className="font-bold text-emerald-400">{fmt(lastCompletedSale.totals.totalNet)}</span>
              </div>
              {lastCompletedSale.totals.changeGiven > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Monnaie rendue :</span>
                  <span className="font-bold text-amber-400">{fmt(lastCompletedSale.totals.changeGiven)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => imprimerTicketThermique(lastCompletedSale, { width: '80mm', autoPrint: true })}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" /> Réimprimer Ticket
              </button>
              <button
                onClick={() => telechargerTicketPDF(lastCompletedSale)}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold transition"
                title="Télécharger Ticket PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
              >
                Nouvelle Vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SupermarcheCaissePage
