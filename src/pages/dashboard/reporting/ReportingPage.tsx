// =============================================================================
// GESTIO 229 SaaS — Rapports & Statistiques Financières (V1.0 Bénin & UEMOA)
// Filtres par période (jour, semaine, mois, année), marges brutes & nettes,
// analyse des règlements et rapport imprimable pour la Direction
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight,
  RefreshCw, Calendar, Printer, Download, Filter, Users, Package,
  CreditCard, Smartphone, CheckCircle2, ShoppingBag, PieChart
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface SaleRecord {
  id: string
  order_number: string
  order_date: string
  total_amount: number
  payment_method: string
  customer_name?: string
  status: string
  created_at: string
}

interface ExpenseRecord {
  id: string
  expense_date: string
  amount: number
  category: string
  description?: string
}

interface CustomerRecord {
  id: string
  name: string
  current_debt: number
}

const ReportingPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  // Filtres
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('month')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // Données
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [productsCount, setProductsCount] = useState<number>(0)

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [
        { data: salesData },
        { data: expData },
        { data: custData },
        { count: prodCount }
      ] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('id, order_number, order_date, total_amount, payment_method, customer_name, status, created_at')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, expense_date, amount, category, description')
          .eq('company_id', company.id)
          .order('expense_date', { ascending: false }),
        supabase
          .from('customers')
          .select('id, name, current_debt')
          .eq('company_id', company.id),
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id)
      ])

      setSales((salesData as any) || [])
      setExpenses((expData as any) || [])
      setCustomers((custData as any) || [])
      setProductsCount(prodCount || 0)
    } catch (err: any) {
      toast.error('Erreur chargement rapports', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtrage selon la période choisie
  const filteredSales = useMemo(() => {
    const now = new Date()
    return sales.filter((s) => {
      const d = new Date(s.order_date || s.created_at)
      if (period === 'today') {
        const isSameDay =
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        if (!isSameDay) return false
      } else if (period === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        if (d < oneWeekAgo) return false
      } else if (period === 'month') {
        const isSameMonth =
          d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        if (!isSameMonth) return false
      } else if (period === 'year') {
        const isSameYear = d.getFullYear() === now.getFullYear()
        if (!isSameYear) return false
      }

      if (paymentFilter !== 'all' && s.payment_method !== paymentFilter) {
        return false
      }

      return true
    })
  }, [sales, period, paymentFilter])

  const filteredExpenses = useMemo(() => {
    const now = new Date()
    return expenses.filter((e) => {
      const d = new Date(e.expense_date)
      if (period === 'today') {
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        )
      } else if (period === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return d >= oneWeekAgo
      } else if (period === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      } else if (period === 'year') {
        return d.getFullYear() === now.getFullYear()
      }
      return true
    })
  }, [expenses, period])

  // Calculs financiers
  const totalRevenue = filteredSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const netMargin = totalRevenue - totalExpenses
  const marginPercentage = totalRevenue > 0 ? ((netMargin / totalRevenue) * 100).toFixed(1) : '0'

  // Ventilation des encaissements par mode
  const paymentBreakdown = useMemo(() => {
    const stats: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      momo: { count: 0, total: 0 },
      wave: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
      bank: { count: 0, total: 0 }
    }

    filteredSales.forEach((s) => {
      const m = s.payment_method || 'cash'
      if (!stats[m]) stats[m] = { count: 0, total: 0 }
      stats[m].count += 1
      stats[m].total += Number(s.total_amount) || 0
    })

    return stats
  }, [filteredSales])

  // Top clients de la période
  const topClients = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {}
    filteredSales.forEach((s) => {
      const cName = s.customer_name || 'Client Comptoir'
      if (!map[cName]) map[cName] = { count: 0, total: 0 }
      map[cName].count += 1
      map[cName].total += Number(s.total_amount) || 0
    })

    return Object.entries(map)
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [filteredSales])

  const periodLabel =
    period === 'today'
      ? "Aujourd'hui"
      : period === 'week'
      ? 'Ces 7 derniers jours'
      : period === 'month'
      ? 'Ce mois-ci'
      : period === 'year'
      ? 'Cette année en cours'
      : 'Toute la période'

  return (
    <div className="space-y-6">
      {/* En-tête & Filtres de Période */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rapports & Statistiques Financières</h1>
          <p className="text-slate-500 text-sm mt-1">
            Analyse d'activité pour {company?.name || 'votre établissement'} — Période : {periodLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'week', 'month', 'year', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                period === p
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p === 'today'
                ? "Aujourd'hui"
                : p === 'week'
                ? 'Semaine'
                : p === 'month'
                ? 'Mois'
                : p === 'year'
                ? 'Année'
                : 'Tout'}
            </button>
          ))}

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            title="Imprimer le rapport de synthèse"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimer Rapport
          </button>

          <button
            onClick={loadData}
            title="Rafraîchir les données"
            className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards Financiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Chiffre d'Affaires</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{fmt(totalRevenue)}</p>
          <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-2">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{filteredSales.length} transaction(s)</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Total Dépenses</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{fmt(totalExpenses)}</p>
          <div className="flex items-center gap-1 text-xs text-red-600 font-semibold mt-2">
            <span>{filteredExpenses.length} décaissement(s)</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Marge Nette d'Exploitation</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-black ${netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmt(netMargin)}
          </p>
          <p className="text-xs text-slate-400 mt-2">Taux de marge : {marginPercentage}%</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Actifs & Base Tiers</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{productsCount} articles</p>
          <p className="text-xs text-slate-400 mt-2">{customers.length} clients référencés</p>
        </div>
      </div>

      {/* Grille Double : Ventilation des modes de paiement & Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventilation par Mode de Paiement */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Répartition des Encaissements
            </h3>
            <span className="text-xs text-slate-400 font-mono">100% traçabilité</span>
          </div>

          <div className="space-y-3">
            {[
              { id: 'cash', label: 'Espèces (Tiroir Caisse)', color: 'bg-emerald-500', data: paymentBreakdown.cash },
              { id: 'momo', label: 'MTN Mobile Money', color: 'bg-amber-500', data: paymentBreakdown.momo },
              { id: 'wave', label: 'Wave Bénin', color: 'bg-blue-500', data: paymentBreakdown.wave },
              { id: 'credit', label: 'Ventes à Crédit (Créances)', color: 'bg-red-500', data: paymentBreakdown.credit },
              { id: 'bank', label: 'Virement / Chèque Bancaire', color: 'bg-indigo-500', data: paymentBreakdown.bank },
            ].map((item) => {
              const pct = totalRevenue > 0 ? ((item.data.total / totalRevenue) * 100).toFixed(1) : '0'
              return (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    <span className="font-black text-slate-900">{fmt(item.data.total)} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div className={`${item.color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Clients de la Période */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Top Clients de la Période
            </h3>
            <span className="text-xs text-slate-400">Classement par CA</span>
          </div>

          {topClients.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Aucune vente sur cette période.</p>
          ) : (
            <div className="space-y-2">
              {topClients.map((c, index) => (
                <div key={c.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-[10px]">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-bold text-slate-800">{c.name}</p>
                      <p className="text-[11px] text-slate-400">{c.count} achat(s) enregistré(s)</p>
                    </div>
                  </div>
                  <span className="font-black text-emerald-700 text-sm">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Résumé de Performance d'Exploitation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4">Structure Consolidée du Résultat d'Exploitation</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1.5 font-medium">
              <span className="text-slate-600">Total Produits d'Exploitation (Chiffre d'Affaires)</span>
              <span className="text-emerald-700 font-bold">{fmt(totalRevenue)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1.5 font-medium">
              <span className="text-slate-600">Total Charges d'Exploitation (Dépenses Décaissées)</span>
              <span className="text-red-600 font-bold">{fmt(totalExpenses)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div
                className="bg-red-500 h-2.5 rounded-full"
                style={{
                  width: `${totalRevenue > 0 ? Math.min(100, (totalExpenses / totalRevenue) * 100) : 0}%`
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportingPage
