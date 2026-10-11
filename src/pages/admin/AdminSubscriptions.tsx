// =============================================================================
// GESTIO 229 ADMIN — Pages Abonnements & Paramètres (placeholders complets)
// =============================================================================

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminCompanies } from '../../hooks/useAdminData'
import { CreditCard, RefreshCw, Eye, AlertTriangle } from 'lucide-react'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
    case 'trial': return 'bg-orange-900/40 text-orange-400 border-orange-700'
    case 'expired': return 'bg-red-900/40 text-red-400 border-red-700'
    case 'suspended': return 'bg-slate-800 text-slate-400 border-slate-600'
    default: return 'bg-slate-800 text-slate-400 border-slate-600'
  }
}

export const AdminSubscriptions: React.FC = () => {
  const [searchParams] = [new URLSearchParams(window.location.search)]
  const initialFilter = searchParams.get('filter') || 'all'
  const { companies, loading, reload } = useAdminCompanies()
  const [statusFilter, setStatusFilter] = useState(initialFilter)

  const now = new Date()

  const filtered = companies.filter((c) => {
    const s = c.subscription_status || 'trial'
    const created = new Date(c.created_at)
    const trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
    const daysToExpiry = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (statusFilter === 'expiring') return s === 'trial' && daysToExpiry >= 0 && daysToExpiry <= 7
    if (statusFilter === 'active') return s === 'active'
    if (statusFilter === 'trial') return s === 'trial'
    if (statusFilter === 'expired') return s === 'expired' || (s === 'trial' && daysToExpiry < 0)
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Abonnements</h1>
          <p className="text-slate-400 text-sm">Gestion des abonnements de toutes les entreprises</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1.5">
        {[
          { key: 'all', label: 'Tous' },
          { key: 'active', label: '🟢 Actif' },
          { key: 'trial', label: '🟠 Essai' },
          { key: 'expired', label: '🔴 Expiré' },
          { key: 'expiring', label: '⚠️ Expirant bientôt' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${statusFilter === key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Entreprise', 'Formule', 'Secteurs', 'Inscription', 'Expiration (estimée)', 'Statut', 'Action'].map((h) => (
                    <th key={h} className="text-left text-slate-500 text-xs font-semibold px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-slate-500 py-12">Aucune entreprise</td></tr>
                ) : filtered.map((c) => {
                  const created = new Date(c.created_at)
                  const trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
                  const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  const status = c.subscription_status || 'trial'
                  const isExpiringSoon = status === 'trial' && daysLeft >= 0 && daysLeft <= 7
                  const sectors = (c.selected_sectors || c.sectors || []).map((s: string) => s.replace(/^sec-/, '').toLowerCase())

                  return (
                    <tr key={c.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition ${isExpiringSoon ? 'bg-yellow-900/10' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm font-semibold">{c.name}</p>
                        <p className="text-slate-500 text-xs">{c.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs capitalize">{c.subscription_plan || c.plan || 'essai'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{sectors.slice(0, 2).join(', ')}{sectors.length > 2 ? `...` : ''}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <p className={isExpiringSoon ? 'text-yellow-400 font-bold' : 'text-slate-300'}>
                            {formatDate(trialEnd.toISOString())}
                          </p>
                          {isExpiringSoon && <p className="text-yellow-500">⚠️ {daysLeft}j restants</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${getStatusBadge(status)}`}>
                          {status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/companies/${c.id}`}
                          className="flex items-center gap-1.5 bg-emerald-700/30 hover:bg-emerald-600/50 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                          <Eye className="w-3.5 h-3.5" />
                          Gérer
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminSubscriptions
