// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel: Brasserie & Dépôt de Boissons
// MODULE : Grilles Gros & Maquis — Tarification Dynamique par Paliers
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Tag, Plus, Search, RefreshCw, Pencil, Trash2, X, Check,
  AlertTriangle, DollarSign, BarChart2, ShieldAlert,
  ArrowUpDown, Sparkles, SlidersHorizontal, Info, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { formatFCFA } from '../../../utils/tax'
import {
  BrasserieGrille,
  fetchBrasserieGrilles,
  saveBrasserieGrille,
  deleteBrasserieGrille,
  fetchGrillePrix,
  saveGrillePrixBatch,
  deleteGrillePrix,
  checkGrillesOverlap
} from '../../../services/brasseriePricingService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BrasserieGrillesPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore() as any
  const { companyId, sectorSlug } = useTenant()

  const currentCompanyId = companyId || company?.id || ''
  const currentSectorSlug = sectorSlug || 'brasserie'

  // États principaux
  const [grilles, setGrilles] = useState<BrasserieGrille[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modale Création / Édition de Grille
  const [isGridModalOpen, setIsGridModalOpen] = useState(false)
  const [editingGrid, setEditingGrid] = useState<BrasserieGrille | null>(null)
  const [gridForm, setGridForm] = useState<{
    nom: string
    seuil_min: number | string
    seuil_max: number | string
    is_unlimited: boolean
    statut: 'ACTIF' | 'INACTIF'
    description: string
  }>({
    nom: '',
    seuil_min: 1,
    seuil_max: '',
    is_unlimited: false,
    statut: 'ACTIF',
    description: '',
  })
  const [gridOverlapError, setGridOverlapError] = useState<string | null>(null)
  const [savingGrid, setSavingGrid] = useState(false)

  // Modale Configuration des Prix d'une Grille
  const [activePriceGrid, setActivePriceGrid] = useState<BrasserieGrille | null>(null)
  const [priceGridMap, setPriceGridMap] = useState<Record<string, number>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceSearch, setPriceSearch] = useState('')
  const [discountPercentInput, setDiscountPercentInput] = useState<string>('')

  // Notification helper
  const notify = useCallback((type: 'success' | 'error' | 'warning', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else if (type === 'error') alert(msg)
    } catch { /* noop */ }
  }, [toast])

  // ─── Chargement des Produits et des Grilles ─────────────────────────────────
  const loadData = useCallback(async () => {
    if (!currentCompanyId) return
    setLoading(true)
    try {
      // 1. Charger les grilles
      const gridList = await fetchBrasserieGrilles(currentCompanyId, currentSectorSlug)
      setGrilles(gridList)

      // 2. Charger les produits du secteur
      const { data: prodsData, error: prodsErr } = await supabase
        .from('products')
        .select('*')
        .eq('company_id', currentCompanyId)
        .neq('is_active', false)
        .order('name')

      if (!prodsErr && prodsData) {
        setProducts(prodsData.map((p: any) => ({
          ...p,
          selling_price: Number(p.selling_price) || 0,
          cost_price: Number(p.cost_price) || 0,
        })))
      }
    } catch (err: any) {
      console.error('[BrasserieGrillesPage] Erreur chargement :', err)
      notify('error', 'Impossible de charger les grilles tarifaires.')
    } finally {
      setLoading(false)
    }
  }, [currentCompanyId, currentSectorSlug, notify])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Gestion de la Modale de Grille ─────────────────────────────────────────
  const handleOpenCreateGrid = () => {
    setEditingGrid(null)
    setGridForm({
      nom: '',
      seuil_min: 1,
      seuil_max: '',
      is_unlimited: false,
      statut: 'ACTIF',
      description: '',
    })
    setGridOverlapError(null)
    setIsGridModalOpen(true)
  }

  const handleOpenEditGrid = (g: BrasserieGrille) => {
    setEditingGrid(g)
    setGridForm({
      nom: g.nom,
      seuil_min: g.seuil_min,
      seuil_max: g.seuil_max !== null ? g.seuil_max : '',
      is_unlimited: g.seuil_max === null,
      statut: g.statut,
      description: g.description || '',
    })
    setGridOverlapError(null)
    setIsGridModalOpen(true)
  }

  // Contrôle en direct du formulaire de grille
  const handleGridFormChange = (field: string, value: any) => {
    const next = { ...gridForm, [field]: value }
    setGridForm(next)

    // Vérifier les chevauchements en temps réel
    const sMin = Number(next.seuil_min)
    const sMax = next.is_unlimited ? null : (next.seuil_max !== '' ? Number(next.seuil_max) : null)

    if (!isNaN(sMin)) {
      const check = checkGrillesOverlap(
        grilles,
        {
          nom: next.nom,
          seuil_min: sMin,
          seuil_max: sMax,
          statut: next.statut,
        },
        editingGrid?.id
      )
      setGridOverlapError(check.hasOverlap ? (check.message || 'Chevauchement de seuils détecté.') : null)
    }
  }

  const handleSaveGrid = async () => {
    if (!gridForm.nom.trim()) {
      notify('error', 'Le nom de la grille est obligatoire.')
      return
    }

    const sMin = Number(gridForm.seuil_min)
    if (isNaN(sMin) || sMin < 0) {
      notify('error', 'Le seuil minimum doit être un nombre supérieur ou égal à 0.')
      return
    }

    const sMax = gridForm.is_unlimited ? null : (gridForm.seuil_max !== '' ? Number(gridForm.seuil_max) : null)
    if (sMax !== null && sMax < sMin) {
      notify('error', 'Le seuil maximum doit être supérieur ou égal au seuil minimum.')
      return
    }

    // Validation stricte anti-chevauchement
    const check = checkGrillesOverlap(
      grilles,
      {
        nom: gridForm.nom,
        seuil_min: sMin,
        seuil_max: sMax,
        statut: gridForm.statut,
      },
      editingGrid?.id
    )

    if (check.hasOverlap) {
      setGridOverlapError(check.message || 'Chevauchement interdit avec une autre grille.')
      notify('error', check.message || 'Chevauchement de seuil interdit.')
      return
    }

    setSavingGrid(true)
    try {
      await saveBrasserieGrille(currentCompanyId, currentSectorSlug, {
        id: editingGrid?.id,
        nom: gridForm.nom.trim(),
        seuil_min: sMin,
        seuil_max: sMax,
        statut: gridForm.statut,
        description: gridForm.description.trim(),
      })
      notify('success', editingGrid ? 'Grille mise à jour avec succès.' : 'Grille créée avec succès.')
      setIsGridModalOpen(false)
      await loadData()
    } catch (err: any) {
      console.error(err)
      notify('error', `Erreur lors de l'enregistrement : ${err.message || err}`)
    } finally {
      setSavingGrid(false)
    }
  }

  const handleDeleteGrid = async (g: BrasserieGrille) => {
    if (!window.confirm(`Confirmez-vous la suppression définitive de la grille « ${g.nom} » ?\nTous les prix associés à cette grille seront supprimés.`)) {
      return
    }
    try {
      await deleteBrasserieGrille(currentCompanyId, g.id)
      notify('success', `Grille « ${g.nom} » supprimée.`)
      await loadData()
    } catch (err: any) {
      console.error(err)
      notify('error', `Suppression impossible : ${err.message || err}`)
    }
  }

  // ─── Gestion de la Modale des Prix par Grille ──────────────────────────────
  const handleOpenPricesModal = async (g: BrasserieGrille) => {
    setActivePriceGrid(g)
    setLoadingPrices(true)
    setPriceSearch('')
    setDiscountPercentInput('')
    try {
      const map = await fetchGrillePrix(currentCompanyId, g.id)
      setPriceGridMap(map)
    } catch (err) {
      console.error(err)
      notify('error', 'Impossible de charger les prix de la grille.')
    } finally {
      setLoadingPrices(false)
    }
  }

  const handlePriceItemChange = (prodId: string, value: string) => {
    const num = value === '' ? '' : Number(value)
    setPriceGridMap((prev) => {
      const next = { ...prev }
      if (num === '' || isNaN(num as number)) {
        delete next[prodId]
      } else {
        next[prodId] = Number(num)
      }
      return next
    })
  }

  // Appliquer une remise globale en % par rapport au prix standard
  const handleApplyGlobalDiscount = () => {
    const pct = Number(discountPercentInput)
    if (isNaN(pct) || pct <= 0 || pct >= 100) {
      notify('error', 'Veuillez saisir un pourcentage de remise valide (ex: 5 pour 5%).')
      return
    }

    const nextMap = { ...priceGridMap }
    products.forEach((p) => {
      const std = Number(p.selling_price) || 0
      if (std > 0) {
        // Prix remisé arrondi à l'entier
        nextMap[p.id] = Math.round(std * (1 - pct / 100))
      }
    })
    setPriceGridMap(nextMap)
    notify('success', `Remise de ${pct}% appliquée sur l'ensemble des produits du catalogue.`)
  }

  const handleSavePrices = async () => {
    if (!activePriceGrid) return
    setSavingPrices(true)
    try {
      const itemsToSave = Object.entries(priceGridMap).map(([prodId, prix]) => {
        const prod = products.find((p) => p.id === prodId)
        return {
          produit_id: prodId,
          prix_standard_fcfa: Number(prod?.selling_price) || 0,
          prix_grille_fcfa: Number(prix) || 0,
        }
      })

      await saveGrillePrixBatch(currentCompanyId, activePriceGrid.id, itemsToSave)
      notify('success', `Prix enregistrés pour la grille « ${activePriceGrid.nom} ».`)
      setActivePriceGrid(null)
      await loadData()
    } catch (err: any) {
      console.error(err)
      notify('error', `Erreur lors de l'enregistrement des prix : ${err.message || err}`)
    } finally {
      setSavingPrices(false)
    }
  }

  // Filtrage des grilles pour affichage
  const filteredGrilles = useMemo(() => {
    return grilles.filter((g) => {
      if (!search.trim()) return true
      const term = search.toLowerCase()
      return (
        g.nom.toLowerCase().includes(term) ||
        (g.description && g.description.toLowerCase().includes(term))
      )
    })
  }, [grilles, search])

  // Filtrage des produits dans la modale des prix
  const filteredProductsForPrice = useMemo(() => {
    return products.filter((p) => {
      if (!priceSearch.trim()) return true
      const term = priceSearch.toLowerCase()
      return (
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.category && p.category.toLowerCase().includes(term))
      )
    })
  }, [products, priceSearch])

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ─── En-tête de Page ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl shadow-md shadow-amber-500/20">
            <Tag className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Grilles Gros & Maquis</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Brasserie & Boissons
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Tarification dynamique par paliers de quantité de commande & prix personnalisés clients.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="Actualiser les données"
          >
            <RefreshCw className={clsx('w-5 h-5', loading && 'animate-spin')} />
          </button>
          <button
            onClick={handleOpenCreateGrid}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Nouvelle Grille</span>
          </button>
        </div>
      </div>

      {/* ─── Règle Métier Officielle (Bannière d'Information) ──────────────── */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-amber-50 border border-indigo-200/70 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm">
        <div className="p-2 bg-indigo-600 text-white rounded-xl flex-shrink-0 mt-0.5">
          <Info className="w-5 h-5" />
        </div>
        <div className="text-xs md:text-sm text-slate-700 space-y-1">
          <div className="font-bold text-indigo-900 flex items-center gap-2">
            <span>Règle Métier Fondamentale : Tarification dynamique sans attachement permanent du client</span>
          </div>
          <p className="text-slate-600">
            Un client n'est <strong>jamais bloqué</strong> dans une grille permanente (pas de « client Maquis » ou « client Gros »).
            Le système recalcule automatiquement la grille <strong>à chaque vente</strong> selon la <strong>quantité totale commandée</strong> (ex: 20 casiers → Grille Maquis, 101 casiers → Grille Super Gros).
            Un <strong>prix personnalisé</strong> configuré sur la fiche du client reste toutefois prioritaire.
          </p>
        </div>
      </div>

      {/* ─── Indicateurs Clés ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Grilles Actives</p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {grilles.filter((g) => g.statut === 'ACTIF').length} <span className="text-sm font-medium text-slate-400">/ {grilles.length}</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Tag className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Catalogue Boissons</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{products.length} articles</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <BarChart2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paliers Définis</p>
            <p className="text-2xl font-black text-amber-600 mt-1">
              {grilles.length > 0 ? `${Math.min(...grilles.map((g) => g.seuil_min))} casiers +` : 'Aucun'}
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <SlidersHorizontal className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sécurité Anti-Chevauchement</p>
            <p className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Paliers Validés
            </p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ─── Barre de Recherche et Liste des Grilles ──────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une grille..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {filteredGrilles.length} grille(s) affichée(s)
          </div>
        </div>

        {/* Tableau des Grilles */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200/70">
                <th className="py-3.5 px-4">Nom de la Grille</th>
                <th className="py-3.5 px-4">Palier de Quantité</th>
                <th className="py-3.5 px-4">Statut</th>
                <th className="py-3.5 px-4">Description</th>
                <th className="py-3.5 px-4 text-center">Prix Définis</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredGrilles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Tag className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Aucune grille tarifaire trouvée</p>
                    <p className="text-xs text-slate-400 mt-1">Créez votre première grille en cliquant sur « Nouvelle Grille » ci-dessus.</p>
                  </td>
                </tr>
              ) : (
                filteredGrilles.map((g) => {
                  const sMaxDisplay = g.seuil_max !== null && g.seuil_max !== undefined ? `${g.seuil_max} casiers` : 'Illimité (et plus)'
                  return (
                    <tr key={g.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900">{g.nom}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-xl font-bold text-xs">
                          <span>{g.seuil_min}</span>
                          <span className="text-amber-400">→</span>
                          <span>{sMaxDisplay}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={clsx(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold',
                            g.statut === 'ACTIF'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          )}
                        >
                          {g.statut}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-500 max-w-xs truncate">
                        {g.description || '—'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => handleOpenPricesModal(g)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition border border-indigo-200 shadow-sm"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Prix ({g.produits_count ?? 0})</span>
                        </button>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditGrid(g)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                            title="Modifier la grille"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteGrid(g)}
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Supprimer la grille"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* ─── MODALE : CRÉATION / MODIFICATION D'UNE GRILLE ────────────────── */}
      {isGridModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Tag className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg">
                  {editingGrid ? `Modifier : « ${editingGrid.nom} »` : 'Nouvelle Grille Tarifaire'}
                </h3>
              </div>
              <button
                onClick={() => setIsGridModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Message d'erreur de chevauchement */}
              {gridOverlapError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Alerte Chevauchement :</span> {gridOverlapError}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nom de la Grille *
                </label>
                <input
                  type="text"
                  value={gridForm.nom}
                  onChange={(e) => handleGridFormChange('nom', e.target.value)}
                  placeholder="Ex: Grille Maquis, Grille Gros, Super Gros, VIP..."
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Seuil Min (Casiers) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={gridForm.seuil_min}
                    onChange={(e) => handleGridFormChange('seuil_min', e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Inclusif (ex: 20)</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Seuil Max (Casiers)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    disabled={gridForm.is_unlimited}
                    value={gridForm.is_unlimited ? '' : gridForm.seuil_max}
                    onChange={(e) => handleGridFormChange('seuil_max', e.target.value)}
                    placeholder={gridForm.is_unlimited ? 'Illimité' : 'Ex: 50'}
                    className={clsx(
                      'w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none transition',
                      gridForm.is_unlimited
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500'
                    )}
                  />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      id="unlimited_checkbox"
                      checked={gridForm.is_unlimited}
                      onChange={(e) => handleGridFormChange('is_unlimited', e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="unlimited_checkbox" className="text-xs font-medium text-slate-600 cursor-pointer">
                      Pas de maximum (Illimité)
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Statut
                </label>
                <select
                  value={gridForm.statut}
                  onChange={(e) => handleGridFormChange('statut', e.target.value as any)}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                >
                  <option value="ACTIF">ACTIF (Appliquée automatiquement aux ventes)</option>
                  <option value="INACTIF">INACTIF (Désactivée)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={gridForm.description}
                  onChange={(e) => handleGridFormChange('description', e.target.value)}
                  placeholder="Notes explicatives..."
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsGridModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingGrid || Boolean(gridOverlapError)}
                onClick={handleSaveGrid}
                className={clsx(
                  'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-md transition',
                  gridOverlapError
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                )}
              >
                {savingGrid ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{editingGrid ? 'Enregistrer les modifications' : 'Créer la grille'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALE : CONFIGURATION DES PRIX PAR GRILLE ───────────────────── */}
      {activePriceGrid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">
                    Configurer les prix — Grille « {activePriceGrid.nom} »
                  </h3>
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-slate-950">
                    {activePriceGrid.seuil_min} à {activePriceGrid.seuil_max !== null ? `${activePriceGrid.seuil_max} casiers` : 'Illimité'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Définissez le prix appliqué aux produits lorsque la vente atteint ce palier de quantité.
                </p>
              </div>
              <button
                onClick={() => setActivePriceGrid(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Outils et Filtres */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={priceSearch}
                  onChange={(e) => setPriceSearch(e.target.value)}
                  placeholder="Filtrer un produit..."
                  className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              {/* Outil Remise Globale Rapide */}
              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <span className="text-xs text-slate-600 font-medium">Appliquer remise globale :</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={discountPercentInput}
                    onChange={(e) => setDiscountPercentInput(e.target.value)}
                    placeholder="Ex: 5"
                    className="w-20 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                  <button
                    type="button"
                    onClick={handleApplyGlobalDiscount}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-sm"
                  >
                    Calculer
                  </button>
                </div>
              </div>
            </div>

            {/* Liste des Produits & Tarifs */}
            <div className="p-4 overflow-y-auto flex-1">
              {loadingPrices ? (
                <div className="py-16 text-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-600">Chargement des prix...</p>
                </div>
              ) : filteredProductsForPrice.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="font-semibold text-slate-600">Aucun produit trouvé</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-4">Produit</th>
                        <th className="py-3 px-4 text-right">Prix Standard</th>
                        <th className="py-3 px-4 text-right">Prix Achat</th>
                        <th className="py-3 px-4 w-44 text-right">Prix Grille (FCFA)</th>
                        <th className="py-3 px-4 text-right">Marge Est.</th>
                        <th className="py-3 px-4 text-center">Statut Marge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredProductsForPrice.map((p) => {
                        const gridPriceVal = priceGridMap[p.id]
                        const hasCustomGridPrice = gridPriceVal !== undefined && gridPriceVal !== null
                        const effectivePrice = hasCustomGridPrice ? Number(gridPriceVal) : Number(p.selling_price)
                        const costPrice = Number(p.cost_price) || 0
                        const marge = effectivePrice - costPrice
                        const margePct = effectivePrice > 0 ? ((marge / effectivePrice) * 100).toFixed(1) : '0'
                        const isNegativeMargin = marge < 0
                        const isLowerThanStandard = hasCustomGridPrice && Number(gridPriceVal) < Number(p.selling_price)

                        return (
                          <tr
                            key={p.id}
                            className={clsx(
                              'hover:bg-slate-50 transition',
                              isNegativeMargin ? 'bg-rose-50/50' : hasCustomGridPrice ? 'bg-amber-50/20' : ''
                            )}
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{p.name}</div>
                              <div className="text-[10px] text-slate-400">{p.category || 'Boisson'} • {p.unit || 'Bouteille/Casier'}</div>
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-slate-600">
                              {fmt(p.selling_price)}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-400">
                              {costPrice > 0 ? fmt(costPrice) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  step="25"
                                  placeholder={String(p.selling_price)}
                                  value={gridPriceVal ?? ''}
                                  onChange={(e) => handlePriceItemChange(p.id, e.target.value)}
                                  className={clsx(
                                    'w-36 px-3 py-1.5 text-right font-bold text-xs rounded-xl border focus:outline-none transition',
                                    isNegativeMargin
                                      ? 'border-rose-400 bg-rose-50 text-rose-800 focus:ring-2 focus:ring-rose-400'
                                      : hasCustomGridPrice
                                      ? 'border-amber-400 bg-amber-50/80 text-amber-950 focus:ring-2 focus:ring-amber-400'
                                      : 'border-slate-200 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-400'
                                  )}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">
                              <span className={clsx(isNegativeMargin ? 'text-rose-600' : 'text-emerald-700')}>
                                {marge > 0 ? `+${fmt(marge)}` : fmt(marge)}
                              </span>
                              <div className="text-[10px] text-slate-400">{margePct}%</div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isNegativeMargin ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" /> Vente à perte
                                </span>
                              ) : isLowerThanStandard ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  Éco. : -{fmt(Number(p.selling_price) - Number(gridPriceVal))}
                                </span>
                              ) : hasCustomGridPrice ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Prix Spécifique
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">Prix Standard</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                {Object.keys(priceGridMap).length} produit(s) avec tarif personnalisé sur cette grille
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActivePriceGrid(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  disabled={savingPrices}
                  onClick={handleSavePrices}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition"
                >
                  {savingPrices ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Enregistrer les tarifs</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BrasserieGrillesPage
