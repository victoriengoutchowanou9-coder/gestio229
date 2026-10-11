// =============================================================================
// GESTIO 229 ADMIN — Page Entreprises
// Liste complète de toutes les entreprises avec statuts visuels et actions
// =============================================================================

import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminCompanies } from '../../hooks/useAdminData'
import {
  Search, Filter, Eye, RefreshCw, Building2,
  CheckCircle2, Clock, XCircle, AlertOctagon
} from 'lucide-react'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getStatusBadge(status: string, createdAt: string) {
  const now = new Date()
  const created = new Date(createdAt)
  const trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
  const isTrialExpired = status === 'trial' && now > trialEnd

  if (isTrialExpired || status === 'expired') {
    return { label: 'EXPIRÉ', color: 'bg-red-900/40 text-red-400 border-red-700', icon: '🔴' }
  }
  switch (status) {
    case 'active': return { label: 'ACTIF', color: 'bg-emerald-900/40 text-emerald-400 border-emerald-700', icon: '🟢' }
    case 'trial': return { label: 'ESSAI', color: 'bg-orange-900/40 text-orange-400 border-orange-700', icon: '🟠' }
    case 'suspended': return { label: 'SUSPENDU', color: 'bg-slate-800 text-slate-400 border-slate-600', icon: '⚫' }
    default: return { label: status.toUpperCase(), color: 'bg-slate-800 text-slate-400 border-slate-600', icon: '❓' }
  }
}

function getSectors(company: any): string[] {
  const sects = company.selected_sectors || company.sectors || []
  if (Array.isArray(sects)) return sects.map((s: string) => s.replace(/^sec-/, '').toLowerCase())
  if (company.active_sector) return [company.active_sector.replace(/^sec-/, '').toLowerCase()]
  return []
}

function getPlanLabel(company: any): string {
  const plan = company.subscription_plan || company.plan || ''
  if (!plan) return '—'
  const sects = getSectors(company).length
  if (plan === 'starter') return 'Starter 5K'
  if (plan === 'entreprise') return 'Entreprise 10K'
  if (sects > 1) return `Multi ${sects} act.`
  return plan
}

const AdminCompanies: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') || 'all'
  const { companies, loading, error, reload } = useAdminCompanies()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialFilter)

  const filtered = companies.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.ifu_number?.includes(q)
    const s = c.subscription_status || 'trial'
    const now = new Date()
    const created = new Date(c.created_at)
    const trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
    const isTrialExpired = s === 'trial' && now > trialEnd

    let matchStatus = true
    if (statusFilter === 'active') matchStatus = s === 'active'
    else if (statusFilter === 'trial') matchStatus = s === 'trial' && !isTrialExpired
    else if (statusFilter === 'expired') matchStatus = s === 'expired' || isTrialExpired
    else if (statusFilter === 'suspended') matchStatus = s === 'suspended'
    else if (statusFilter === 'inactive') matchStatus = s === 'suspended' || s === 'expired' || isTrialExpired

    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Entreprises</h1>
          <p className="text-slate-400 text-sm">{companies.length} entreprises inscrites sur la plateforme</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par nom, email, IFU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl p-1">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'active', label: '🟢 Actif' },
            { key: 'trial', label: '🟠 Essai' },
            { key: 'inactive', label: '🔴 Inactif' },
            { key: 'suspended', label: '⚫ Suspendu' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${statusFilter === key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Résultat */}
      <p className="text-slate-500 text-xs">{filtered.length} entreprise(s) affichée(s)</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Entreprise', 'IFU', 'Téléphone', 'Email', 'Secteurs', 'Inscription', 'Formule', 'Statut', 'Utilisateurs', 'Actions'].map((h) => (
                    <th key={h} className="text-left text-slate-500 text-xs font-semibold px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-slate-500 py-12 text-sm">
                      Aucune entreprise trouvée
                    </td>
                  </tr>
                ) : filtered.map((c) => {
                  const badge = getStatusBadge(c.subscription_status, c.created_at)
                  const sectors = getSectors(c)
                  return (
                    <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-900/40 rounded-lg flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0">
                            {c.name?.charAt(0)?.toUpperCase() || 'E'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate max-w-[180px]">{c.name}</p>
                            {c.city && <p className="text-slate-500 text-xs">{c.city}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{c.ifu_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate">{c.email || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[120px]">
                          {sectors.slice(0, 2).map((s) => (
                            <span key={s} className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                              {s}
                            </span>
                          ))}
                          {sectors.length > 2 && (
                            <span className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded">+{sectors.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{getPlanLabel(c)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border ${badge.color}`}>
                          {badge.icon} {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs text-center">{c.userCount || 0}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/companies/${c.id}`}
                          className="flex items-center gap-1.5 bg-emerald-700/30 hover:bg-emerald-600/50 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Voir
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

export default AdminCompanies
