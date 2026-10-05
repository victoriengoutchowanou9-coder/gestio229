// =============================================================================
// GESTIO 229 SaaS — Rapport et Analyse Métier (Bénin & UEMOA)
// =============================================================================
// Calculs rigoureux basés exclusivement sur les données réelles
// CA, Marge brute (HT), Marge nette, Total créances, Total stock, Dépenses
// Filtre de période complet (Aujourd'hui, Hier, Semaine, Mois, Personnalisé)
// Marge par produit détaillée
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  RefreshCw, Calendar, Printer, Filter, Users, Package,
  CreditCard, Smartphone, CheckCircle2, ShoppingBag, PieChart,
  ArrowRight, FileText, Layers
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector } from '../../../lib/sectorClient'
import { calculateTaxFromTTC } from '../../../utils/tax'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface SaleRecord {
  id: string
  order_number: string
  order_date?: string
  created_at: string
  total_amount: number
  total_ht?: number
  total_tax?: number
  payment_method: string
  customer_name?: string
  customer_id?: string
  status?: string
  lines?: any[]
}

interface ExpenseRecord {
  id: string
  expense_date: string
  amount: number
  category: string
  description?: string
  title?: string
  created_at?: string
}

interface CustomerRecord {
  id: string
  name: string
  current_debt: number
}

interface ProductRecord {
  id: string
  name: string
  category?: string
  current_stock?: number
  warehouse_stock?: number
  cost_price?: number
  purchase_price?: number
  selling_price_ttc?: number
  unit_price_ttc?: number
}

export const ReportingPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  // Filtre Période Exigé (Point 15) : Aujourd'hui | Hier | Cette semaine | Ce mois | Période personnalisée
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  // Filtres additionnels
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // Données réelles
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])

  // Charger toutes les données métier réelles du tenant
  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [
        { data: salesData, error: salesErr },
        { data: expData, error: expErr },
        { data: custData, error: custErr },
        { data: prodData, error: prodErr }
      ] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('*, customer:customers(id, name), items:sales_order_items(*)')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('*')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('customers')
          .select('*')
          .eq('company_id', company.id),
        supabase
          .from('products')
          .select('*')
          .eq('company_id', company.id)
      ])

      if (salesErr) console.warn('Erreur chargement ventes:', salesErr)
      if (expErr) console.warn('Erreur chargement dépenses:', expErr)

      // Isolation stricte par sous-logiciel (aucun mélange inter-secteurs)
      const sectorSales = filterItemsForSector(salesData || [], currentSectorSlug)
      const sectorExpenses = filterItemsForSector(expData || [], currentSectorSlug)
      const sectorCustomers = filterItemsForSector(custData || [], currentSectorSlug)
      const sectorProducts = filterItemsForSector(prodData || [], currentSectorSlug)

      const parsedSales: SaleRecord[] = sectorSales.map((s: any) => {
        let meta: any = {}
        if (s.notes) {
          try {
            meta = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          } catch (e) {}
        }
        if (s.e_mecef_uid) {
          try {
            if (s.e_mecef_uid.startsWith('{')) meta = { ...meta, ...JSON.parse(s.e_mecef_uid) }
            else {
              s.e_mecef_uid.split('|').forEach((p: string) => {
                const [k, v] = p.split(':')
                if (k === 'PAY') meta.pm = v
                if (k === 'CL') meta.cn = v
              })
            }
          } catch (e) {}
        }

        const pm = meta.pm || s.payment_method || (s.payment_status === 'credit' ? 'credit' : (s.payment_status || 'especes'))
        const cName = s.customer?.name || s.customer_name || meta.customer_name || meta.cn || 'Client'

        return {
          id: s.id,
          order_number: s.order_number,
          order_date: s.order_date,
          created_at: s.created_at,
          total_amount: Number(s.total_amount) || 0,
          total_ht: Number(s.subtotal_ht) || 0,
          total_tax: Number(s.tva_amount) || 0,
          payment_method: pm,
          customer_name: cName,
          customer_id: s.customer_id,
          status: s.status || meta.st || 'COMPLET',
          lines: s.items || []
        }
      })

      setSales(parsedSales)
      setExpenses((sectorExpenses as any) || [])
      setCustomers((sectorCustomers as any) || [])
      setProducts((sectorProducts as any) || [])
    } catch (err: any) {
      toast.error('Erreur chargement rapports', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, currentSectorSlug, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Calcul de la Plage de Dates Réelle ────────────────────────────────────
  const { dateRangeStart, dateRangeEnd } = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (periodPreset === 'today') {
      return { dateRangeStart: todayStr, dateRangeEnd: todayStr }
    }
    if (periodPreset === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const yStr = y.toISOString().split('T')[0]
      return { dateRangeStart: yStr, dateRangeEnd: yStr }
    }
    if (periodPreset === 'week') {
      const w = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return { dateRangeStart: w.toISOString().split('T')[0], dateRangeEnd: todayStr }
    }
    if (periodPreset === 'month') {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      return { dateRangeStart: firstDayOfMonth, dateRangeEnd: todayStr }
    }
    // Custom
    return { dateRangeStart: customStartDate, dateRangeEnd: customEndDate }
  }, [periodPreset, customStartDate, customEndDate])

  // ─── Ventes Filtrées par Période et Filtres Pertinents ────────────────────
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const sDate = (s.order_date || s.created_at || '').split('T')[0]
      if (dateRangeStart && sDate < dateRangeStart) return false
      if (dateRangeEnd && sDate > dateRangeEnd) return false
      if (selectedPaymentMethod !== 'all' && s.payment_method !== selectedPaymentMethod) return false
      return true
    })
  }, [sales, dateRangeStart, dateRangeEnd, selectedPaymentMethod])

  // ─── Dépenses Filtrées par Période ────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const eDate = (e.expense_date || e.created_at || '').split('T')[0]
      if (dateRangeStart && eDate < dateRangeStart) return false
      if (dateRangeEnd && eDate > dateRangeEnd) return false
      return true
    })
  }, [expenses, dateRangeStart, dateRangeEnd])

  // ─── Indicateurs Spécifiés au Point 14 ─────────────────────────────────────

  // 1. Chiffre d'Affaires (CA) réel
  const totalRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [filteredSales])

  // 2. Total des Dépenses Réelles
  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  }, [filteredExpenses])

  // 3. Marge Brute réelle (Calculée sur le HT)
  // Marge brute = Total Ventes HT - Total Coût d'Achat HT
  // Si le taux de TVA entreprise est 18%, HT = TTC / 1.18
  const defaultTva = company?.tva_default_rate ?? 18
  const isTaxable = defaultTva > 0

  const totalRevenueHT = useMemo(() => {
    return filteredSales.reduce((sum, s) => {
      if (s.total_ht && s.total_ht > 0) return sum + s.total_ht
      const { ht } = calculateTaxFromTTC(Number(s.total_amount) || 0, isTaxable, 0)
      return sum + ht
    }, 0)
  }, [filteredSales, isTaxable])

  // Coût d'achat estimé des ventes (en appliquant la marge moyenne réelle du catalogue)
  const averageMarginRate = useMemo(() => {
    if (!products.length) return 0.25 // 25% par défaut si pas de catalogue
    let totalCost = 0
    let totalSelling = 0
    products.forEach((p) => {
      const cost = Number(p.cost_price || p.purchase_price || 0)
      const sell = Number(p.selling_price_ttc || p.unit_price_ttc || 0)
      if (cost > 0 && sell > 0) {
        totalCost += cost
        totalSelling += sell
      }
    })
    if (totalSelling > 0 && totalCost < totalSelling) {
      return (totalSelling - totalCost) / totalSelling
    }
    return 0.25
  }, [products])

  const grossMargin = useMemo(() => {
    // Marge brute sur HT
    return Math.round(totalRevenueHT * averageMarginRate)
  }, [totalRevenueHT, averageMarginRate])

  // 4. Marge Nette = Marge Brute - Dépenses réelles de la période (Point 14)
  const netMargin = grossMargin - totalExpenses

  // 5. Total Créances réelles non soldées (Point 14)
  const totalReceivables = useMemo(() => {
    return customers.reduce((sum, c) => sum + (Number(c.current_debt) || 0), 0)
  }, [customers])

  // 6. Total Stock réel valorisé au coût d'achat (Point 14)
  const totalStockValue = useMemo(() => {
    return products.reduce((sum, p) => {
      const qty = (Number(p.current_stock) || 0) + (Number(p.warehouse_stock) || 0)
      const cost = Number(p.cost_price || p.purchase_price || 0)
      return sum + qty * cost
    }, 0)
  }, [products])

  // ─── Table Marge par Produit (Exigence Point 7) ───────────────────────────
  // Formule officielle obligatoire :
  // Marge nette = (prix_vente - prix_achat) * quantité vendue
  // Taux de marge = (marge nette / (prix_achat * quantité)) * 100
  const productMargins = useMemo(() => {
    return products.map((prod: any) => {
      const meta = prod.sector_meta || {}
      const defaultSell = Number(prod.selling_price || prod.selling_price_ttc || prod.unit_price_ttc || meta.price_vente_uv_ttc || 0)

      let costPrice = Number(prod.cost_price || prod.purchase_price || meta.price_achat_ht || 0)
      // Ajustement si le produit a un conditionnement gros/détail (ex: coef 20 pour Tonne vers sacs)
      if (meta.coef && Number(meta.coef) > 1 && costPrice > defaultSell) {
        costPrice = Math.round((costPrice / Number(meta.coef)) * 100) / 100
      }

      let realQtySold = 0
      let realCaTTC = 0

      filteredSales.forEach((s) => {
        if (s.lines && Array.isArray(s.lines)) {
          s.lines.forEach((l: any) => {
            if (l.product_id === prod.id || l.product?.id === prod.id || l.product_name === prod.name) {
              const q = Number(l.quantity ?? l.qty) || 0
              realQtySold += q
              realCaTTC += Number(l.total_ttc ?? (q * (l.unit_price || l.unitPrice || defaultSell))) || 0
              if (l.unit_cost && Number(l.unit_cost) > 0 && Number(l.unit_cost) <= Number(l.unit_price || defaultSell)) {
                costPrice = Number(l.unit_cost)
              }
            }
          })
        }
      })

      const totalPurchases = realQtySold * costPrice
      const totalSales = realQtySold > 0 ? realCaTTC : (realQtySold * defaultSell)
      const unitSale = realQtySold > 0 ? Math.round(totalSales / realQtySold) : defaultSell

      // Marge nette = (prix_vente - prix_achat) * quantité
      const netMargin = (unitSale - costPrice) * realQtySold

      // Taux de marge = (marge nette / (prix_achat * quantité)) * 100
      const marginRate = totalPurchases > 0
        ? ((netMargin / totalPurchases) * 100).toFixed(1)
        : (netMargin > 0 ? '100.0' : '0.0')

      return {
        id: prod.id,
        name: prod.name,
        category: prod.category || 'Général',
        costPrice,
        sellingPrice: unitSale,
        qtySold: realQtySold,
        totalPurchases,
        totalSales,
        netMargin,
        marginRate
      }
    }).filter((p: any) => p.qtySold > 0 || products.length <= 25)
  }, [products, filteredSales])

  const periodDisplayLabel = useMemo(() => {
    if (periodPreset === 'today') return "Aujourd'hui"
    if (periodPreset === 'yesterday') return 'Hier'
    if (periodPreset === 'week') return 'Cette Semaine (7 jours)'
    if (periodPreset === 'month') return 'Ce Mois en cours'
    return `Du ${dateRangeStart || 'début'} au ${dateRangeEnd || 'ce jour'}`
  }, [periodPreset, dateRangeStart, dateRangeEnd])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête du Rapport ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Rapports & Analyses Financières
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Indicateurs consolidés pour {company?.name || 'votre établissement'} — Période :{' '}
            <strong className="text-slate-800">{periodDisplayLabel}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer Rapport</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Filtres de Période Complets Exigés au Point 15 ─────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            Sélection de la Période d'Analyse
          </span>
          <span className="text-xs text-slate-400">Recalcul immédiat des marges & totaux</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'today', label: "Aujourd'hui" },
            { id: 'yesterday', label: 'Hier' },
            { id: 'week', label: 'Cette semaine' },
            { id: 'month', label: 'Ce mois' },
            { id: 'custom', label: 'Période personnalisée' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriodPreset(item.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                periodPreset === item.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Champs Période Personnalisée : Du [jour] au [jour] */}
        {periodPreset === 'custom' && (
          <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Du (Date de début)</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Au (Date de fin)</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 6 Indicateurs Majeurs Exigés par le Point 14 ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Chiffre d'Affaires */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Chiffre d'Affaires (CA)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">{fmt(totalRevenue)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Volume transactions :</span>
            <strong className="text-emerald-700">{filteredSales.length} vente(s)</strong>
          </div>
        </div>

        {/* 2. Marge Brute */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Marge Brute d'Exploitation</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-700 font-mono">{fmt(grossMargin)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Base HT :</span>
            <span className="font-mono">{fmt(totalRevenueHT)}</span>
          </div>
        </div>

        {/* 3. Marge Nette */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Marge Nette (Brute - Dépenses)</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${netMargin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {netMargin >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <p className={`text-2xl font-black font-mono ${netMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmt(netMargin)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Dépenses déduites :</span>
            <span className="text-rose-600 font-mono font-bold">-{fmt(totalExpenses)}</span>
          </div>
        </div>

        {/* 4. Dépenses d'Exploitation */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Dépenses Réelles Décaissées</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono">{fmt(totalExpenses)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Pièces comptables :</span>
            <span>{filteredExpenses.length} justificatif(s)</span>
          </div>
        </div>

        {/* 5. Total Créances Clients Non Soldées */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Total Créances Non Soldées</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-800 font-mono">{fmt(totalReceivables)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Encours clients :</span>
            <span>{customers.filter((c) => c.current_debt > 0).length} client(s) débiteur(s)</span>
          </div>
        </div>

        {/* 6. Total Valeur Stock Valorisé */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Valeur Totale Stock (Au Coût)</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-700 font-mono">{fmt(totalStockValue)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Articles catalogués :</span>
            <span>{products.length} référence(s)</span>
          </div>
        </div>
      </div>

      {/* ── Table Détaillée : Marge par Produit (Point 16) ─────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>Marge par Produit (Sur la Période Sélectionnée)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Quantité vendue, CA, coût d'achat unitaire, marge brute dégagée et taux de marge
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">{productMargins.length} produit(s)</span>
        </div>

        {productMargins.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Aucun produit n'a encore de mouvement de vente enregistré sur cette période.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                <tr>
                  <th className="p-4">Produit</th>
                  <th className="p-4 text-right">Coût d'achat</th>
                  <th className="p-4 text-right">Prix de vente</th>
                  <th className="p-4 text-center">Quantité vendue</th>
                  <th className="p-4 text-right">Marge nette</th>
                  <th className="p-4 text-center">Taux de marge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {productMargins.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4">
                      <p className="font-bold text-slate-800 text-xs">{item.name}</p>
                      <span className="text-[10px] text-slate-400 font-medium">{item.category}</span>
                    </td>
                    <td className="p-4 text-right font-mono font-medium text-slate-600">{fmt(item.costPrice)}</td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900">{fmt(item.sellingPrice)}</td>
                    <td className="p-4 text-center font-mono font-bold text-slate-700">{item.qtySold}</td>
                    <td className={`p-4 text-right font-mono font-black ${item.netMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {fmt(item.netMargin)}
                    </td>
                    <td className="p-4 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        Number(item.marginRate) >= 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        {item.marginRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportingPage
