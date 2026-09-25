// =============================================================================
// GESTIO 229 SaaS — Rapports & Statistiques Financières
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { BarChart3, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight, RefreshCw, Calendar } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

const ReportingPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [period, setPeriod] = useState<'today' | 'month' | 'year'>('month')
  const [loading, setLoading] = useState(true)

  const [metrics, setMetrics] = useState({
    revenue: 0,
    salesCount: 0,
    expensesTotal: 0,
    customersCount: 0,
    productsCount: 0,
  })

  const loadMetrics = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [
        { data: sales },
        { data: expenses },
        { count: custCount },
        { count: prodCount },
      ] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('total_amount, created_at')
          .eq('company_id', company.id),
        supabase
          .from('expenses')
          .select('amount, expense_date')
          .eq('company_id', company.id),
        supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id),
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id),
      ])

      const totalRev = (sales || []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
      const totalExp = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      setMetrics({
        revenue: totalRev,
        salesCount: (sales || []).length,
        expensesTotal: totalExp,
        customersCount: custCount || 0,
        productsCount: prodCount || 0,
      })
    } catch (err: any) {
      toast.error('Erreur chargement rapports', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  const netMargin = metrics.revenue - metrics.expensesTotal
  const marginPercentage = metrics.revenue > 0 ? ((netMargin / metrics.revenue) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rapports & Analyses</h1>
          <p className="text-slate-500 text-sm mt-1">Tableau de bord de performance financière et indicateurs clés</p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                period === p
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p === 'today' ? "Aujourd'hui" : p === 'month' ? 'Ce mois' : 'Cette année'}
            </button>
          ))}
          <button
            onClick={loadMetrics}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Chiffre d'Affaires</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{fmt(metrics.revenue)}</p>
          <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-2">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{metrics.salesCount} vente(s) enregistrée(s)</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Total Charges</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{fmt(metrics.expensesTotal)}</p>
          <div className="flex items-center gap-1 text-xs text-red-600 font-semibold mt-2">
            <span>Dépenses décaissées</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Bénéfice Net Opérationnel</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-black ${netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmt(netMargin)}
          </p>
          <p className="text-xs text-slate-400 mt-2">Marge nette globale : {marginPercentage}%</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-400">Actifs & Base Tiers</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{metrics.productsCount} articles</p>
          <p className="text-xs text-slate-400 mt-2">{metrics.customersCount} clients référencés</p>
        </div>
      </div>

      {/* Détails consolidés */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4">Structure du Résultat d'Exploitation</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1.5 font-medium">
              <span className="text-slate-600">Encaissements Ventes (Produits)</span>
              <span className="text-emerald-700 font-bold">{fmt(metrics.revenue)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1.5 font-medium">
              <span className="text-slate-600">Charges d'Exploitation (Dépenses)</span>
              <span className="text-red-600 font-bold">{fmt(metrics.expensesTotal)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div
                className="bg-red-500 h-2.5 rounded-full"
                style={{
                  width: `${metrics.revenue > 0 ? Math.min(100, (metrics.expensesTotal / metrics.revenue) * 100) : 0}%`
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
