// =============================================================================
// GESTIO 229 SaaS — Module 2 : Gestion des Stocks & Inventaire (Norme Bénin/UEMOA)
// Double Stock (Magasin UCD & Vente UV), Transferts avec traçabilité,
// Inventaire physique avec calcul automatique des écarts, Valorisation Achat & Vente
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package, Plus, Search, AlertTriangle, CheckCircle, RefreshCw,
  Printer, ArrowRightLeft, ClipboardCheck, FileSpreadsheet, Download,
  Check, X, ArrowUpRight, ArrowDownRight, Layers, DollarSign
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { NewProductModal, StockSheetModal, ModalPortal } from '../../../components/modals'
import { formatFCFA } from '../../../utils/tax'
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
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'double_stock' | 'inventaire' | 'fiche_journaliere'>('double_stock')

  const [products, setProducts] = useState<ProductStock[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showNewProductModal, setShowNewProductModal] = useState(false)
  const [showStockSheetModal, setShowStockSheetModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showValuationModal, setShowValuationModal] = useState(false)

  // État Transfert de Stock (Magasin -> Vente)
  const [transferProdId, setTransferProdId] = useState('')
  const [transferQty, setTransferQty] = useState<number>(0)
  const [transferMotif, setTransferMotif] = useState('Réapprovisionnement Rayon Vente POS')

  // État Inventaire Physique
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([])

  // ─── Chargement réel depuis Supabase (zéro donnée fictive) ──────────────────

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:product_categories(id, name)')
        .eq('company_id', company.id)
        .order('name')

      if (error) throw error

      const mapped: ProductStock[] = (data || []).map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit || 'Pièce',
        ucd: p.ucd || 'Carton',
        uv: p.uv || p.unit || 'Pièce',
        coef: Number(p.coef) || 1,
        cost_price: Number(p.cost_price) || 0,
        selling_price: Number(p.selling_price) || 0,
        stock_magasin: Number(p.stock_magasin) || 0,
        stock_vente: Number(p.stock_vente) || 0,
        min_stock_alert: Number(p.min_stock_alert) || 5,
        category: p.category
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
          valeurEcart: 0
        }
      })
    )
  }, [products])

  // ─── Actions Double Stock : Transfert Magasin -> Vente ─────────────────────

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
    if (transferQty > prod.stock_magasin) {
      toast.error('Stock insuffisant en magasin', `Stock magasin disponible : ${prod.stock_magasin} ${prod.unit}`)
      return
    }

    try {
      const newMagasin = Math.round((prod.stock_magasin - transferQty) * 1000) / 1000
      const newVente = Math.round((prod.stock_vente + transferQty) * 1000) / 1000

      // Mise à jour réelle Supabase
      const { error } = await supabase
        .from('products')
        .update({
          stock_magasin: newMagasin,
          stock_vente: newVente
        })
        .eq('id', prod.id)

      if (error) throw error

      setProducts((prev) =>
        prev.map((p) =>
          p.id === prod.id ? { ...p, stock_magasin: newMagasin, stock_vente: newVente } : p
        )
      )

      setShowTransferModal(false)
      setTransferQty(0)
      toast.success(
        'Transfert effectué !',
        `Transféré ${transferQty} ${prod.unit} du Magasin vers le Stock Vente POS.`
      )
    } catch (err: any) {
      toast.error('Erreur transfert', err.message)
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

  const handleValidateInventory = async () => {
    try {
      // Mettre à jour chaque produit réaligné
      for (const item of inventoryList) {
        if (item.ecart !== 0) {
          const prod = products.find((p) => p.id === item.productId)
          if (prod) {
            const newVente = Math.max(0, item.stockPhysique - prod.stock_magasin)
            await supabase
              .from('products')
              .update({ stock_vente: newVente })
              .eq('id', prod.id)
          }
        }
      }

      await loadData()
      const totalEcarts = inventoryList.reduce((s, i) => s + i.valeurEcart, 0)
      toast.success(
        'Inventaire validé !',
        `Stock réaligné avec succès. Écart net valorisé : ${fmt(totalEcarts)}`
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
            Module 2 : Gestion des Stocks & Inventaire
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
                  <th className="p-3">Réf</th>
                  <th className="p-3">Désignation</th>
                  <th className="p-3">Unité</th>
                  <th className="p-3 text-right">Prix Achat TTC</th>
                  <th className="p-3 text-right">Prix Vente TTC</th>
                  <th className="p-3 text-center bg-indigo-50/70 text-indigo-900">Stock Magasin (UCD)</th>
                  <th className="p-3 text-center bg-emerald-50/70 text-emerald-900">Stock Vente (UV)</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                      {loading ? 'Chargement...' : 'Aucun produit trouvé dans cette entreprise.'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-bold text-slate-900">{p.code}</td>
                      <td className="p-3 font-sans font-semibold text-slate-800">{p.name}</td>
                      <td className="p-3 font-sans text-slate-500">{p.unit}</td>
                      <td className="p-3 text-right">{fmt(p.cost_price)}</td>
                      <td className="p-3 text-right text-emerald-700 font-bold">{fmt(p.selling_price)}</td>
                      <td className="p-3 text-center bg-indigo-50/30 font-black text-indigo-800 text-sm">
                        {p.stock_magasin} {p.unit}
                      </td>
                      <td className="p-3 text-center bg-emerald-50/30 font-black text-emerald-800 text-sm">
                        {p.stock_vente} {p.unit}
                      </td>
                      <td className="p-3 text-center font-sans">
                        <button
                          onClick={() => { setTransferProdId(p.id); setShowTransferModal(true); }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 mx-auto"
                        >
                          <ArrowRightLeft className="w-3 h-3" /> Transférer
                        </button>
                      </td>
                    </tr>
                  ))
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'fiche_journaliere' && (
        /* ── TAB 3 : FICHE JOURNALIÈRE DE STOCK ──────────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Fiche de Stock Journalière (Rapport Quotidien)</h3>
              <p className="text-xs text-slate-500">Traçabilité : Stock Initial + Entrées (BL) - Sorties (Ventes) = Stock Final</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer / Export PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Article</th>
                  <th className="p-3 text-center">Stock Magasin</th>
                  <th className="p-3 text-center">Stock Vente</th>
                  <th className="p-3 text-center font-black">Stock Total Final</th>
                  <th className="p-3 text-right">Valeur Achat (FCFA)</th>
                  <th className="p-3 text-right">Valeur Vente (FCFA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {dailyStockData.map((row) => (
                  <tr key={row.productId} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-sans font-medium text-slate-800">{row.name} ({row.code})</td>
                    <td className="p-3 text-center text-indigo-700 font-bold">{products.find(p => p.id === row.productId)?.stock_magasin || 0}</td>
                    <td className="p-3 text-center text-emerald-700 font-bold">{products.find(p => p.id === row.productId)?.stock_vente || 0}</td>
                    <td className="p-3 text-center font-black text-slate-900">{row.stockFinal}</td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(row.valeurAchat)}</td>
                    <td className="p-3 text-right font-black text-emerald-800">{fmt(row.valeurVente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL TRANSFERT DE STOCK ─────────────────────────────────────────── */}
      <ModalPortal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} id="modal-transfer-stock">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
              Transfert Magasin ➔ Rayon Vente
            </h3>
            <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Article à transférer</label>
              <select
                value={transferProdId}
                onChange={(e) => setTransferProdId(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-white font-medium"
              >
                <option value="">Sélectionnez un article</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Magasin : {p.stock_magasin} {p.unit} | Rayon : {p.stock_vente})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Quantité à transférer</label>
              <input
                type="number"
                step="any"
                min="0.001"
                value={transferQty || ''}
                onChange={(e) => setTransferQty(Number(e.target.value))}
                placeholder="Nombre d'unités (ex: 2.5)"
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
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
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
