// =============================================================================
// GESTIO 229 ADMIN — Page Finances & Revenus
// =============================================================================

import React, { useState } from 'react'
import { useAdminFinances } from '../../hooks/useAdminData'
import { DollarSign, TrendingUp, RefreshCw, BarChart3 } from 'lucide-react'

function formatFCFA(n: number = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' FCFA'
}

const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: '7 derniers jours' },
  { key: 'month', label: 'Mois en cours' },
  { key: 'prev_month', label: 'Mois précédent' },
  { key: '3_months', label: '3 derniers mois' },
  { key: 'year', label: 'Année en cours' },
]

const AdminFinances: React.FC = () => {
  const [period, setPeriod] = useState('month')
  const { data, loading, error, reload } = useAdminFinances(period)

  const bySector = data?.bySector || {}
  const sectorEntries = Object.entries(bySector).sort(([, a], [, b]) => (b as number) - (a as number))
  const monthlyHistory = data?.monthlyHistory || {}
  const monthKeys = Object.keys(monthlyHistory).sort().slice(-12)
  const maxMonth = Math.max(...monthKeys.map((k) => monthlyHistory[k] || 0), 1)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Finances & Revenus</h1>
          <p className="text-slate-400 text-sm">Transactions enregistrées dans le système de caisse</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Filtres période */}
      <div className="flex flex-wrap gap-2 bg-slate-900 border border-slate-700 rounded-xl p-1.5">
        {PERIODS.map(({ key, label }) => (
          <button key={key} onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${period === key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="w-11 h-11 bg-emerald-900/40 rounded-xl flex items-center justify-center mb-3">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-slate-400 text-xs font-medium mb-1">Revenus totaux</p>
              <p className="text-white text-2xl font-black">{formatFCFA(data?.totalRevenue || 0)}</p>
              <p className="text-slate-500 text-xs mt-1">{PERIODS.find(p => p.key === period)?.label}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="w-11 h-11 bg-blue-900/40 rounded-xl flex items-center justify-center mb-3">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-slate-400 text-xs font-medium mb-1">Transactions</p>
              <p className="text-white text-2xl font-black">{data?.transactionCount || 0}</p>
              <p className="text-slate-500 text-xs mt-1">Ventes enregistrées</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="w-11 h-11 bg-purple-900/40 rounded-xl flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <p className="text-slate-400 text-xs font-medium mb-1">Ticket moyen</p>
              <p className="text-white text-2xl font-black">
                {data?.transactionCount > 0 ? formatFCFA((data?.totalRevenue || 0) / data.transactionCount) : '—'}
              </p>
              <p className="text-slate-500 text-xs mt-1">Par transaction</p>
            </div>
          </div>

          {/* Revenus par secteur */}
          {sectorEntries.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                Revenus par secteur
              </h3>
              <div className="space-y-3">
                {sectorEntries.map(([sector, amount]) => {
                  const pct = data?.totalRevenue > 0 ? ((amount as number) / data.totalRevenue) * 100 : 0
                  return (
                    <div key={sector}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 capitalize">{sector}</span>
                        <div className="flex gap-3">
                          <span className="text-emerald-400 font-semibold">{formatFCFA(amount as number)}</span>
                          <span className="text-slate-500">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Graphique mensuel */}
          {monthKeys.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Évolution mensuelle des revenus (12 derniers mois)
              </h3>
              <div className="flex items-end gap-2 h-40">
                {monthKeys.map((key) => {
                  const value = monthlyHistory[key] || 0
                  const pct = maxMonth > 0 ? (value / maxMonth) * 100 : 0
                  const [year, month] = key.split('-')
                  const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('fr-FR', { month: 'short' })
                  return (
                    <div key={key} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end h-28">
                        <div
                          className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-t transition cursor-default"
                          style={{ height: `${Math.max(4, pct)}%` }}
                          title={`${key}: ${formatFCFA(value)}`}
                        />
                      </div>
                      <span className="text-slate-500 text-[10px]">{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminFinances
