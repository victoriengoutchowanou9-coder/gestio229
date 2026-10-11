// =============================================================================
// GESTIO 229 ADMIN — Page Avis & Suggestions
// =============================================================================

import React, { useState } from 'react'
import { useAdminFeedbacks } from '../../hooks/useAdminData'
import { adminApiFetch } from '../../store/adminStore'
import { MessageSquare, RefreshCw, Filter, ChevronDown, ChevronUp, CheckCircle, Circle } from 'lucide-react'

function formatDate(d: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_COLORS: Record<string, string> = {
  nouveau: 'bg-blue-900/40 text-blue-400 border-blue-700',
  en_cours: 'bg-orange-900/40 text-orange-400 border-orange-700',
  traite: 'bg-emerald-900/40 text-emerald-400 border-emerald-700',
  rejete: 'bg-red-900/40 text-red-400 border-red-700',
}

const STATUS_EMOJI: Record<string, string> = {
  nouveau: '🆕',
  en_cours: '🔵',
  traite: '🟢',
  rejete: '🔴',
}

const TYPE_LABELS: Record<string, string> = {
  avis: 'Avis',
  suggestion: 'Suggestion',
  bug: 'Bug / Problème',
  demande_fonctionnalite: 'Demande fonctionnalité',
  difficulte: "Difficulté d'utilisation",
}

const AdminFeedbacks: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { feedbacks, loading, error, reload } = useAdminFeedbacks({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleStatusChange = async (feedbackId: string, newStatus: string) => {
    setUpdatingId(feedbackId)
    try {
      const res = await adminApiFetch('/api/admin-feedback', {
        method: 'POST',
        body: JSON.stringify({ action: 'update_status', feedback_id: feedbackId, status: newStatus }),
      })
      const data = await res.json()
      if (data.success) reload()
    } catch (e) {}
    finally { setUpdatingId(null) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Avis & Suggestions</h1>
          <p className="text-slate-400 text-sm">{feedbacks.length} retour(s) reçu(s)</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-1 flex gap-1">
          {[
            { value: '', label: 'Tous' },
            { value: 'nouveau', label: '🆕 Nouveau' },
            { value: 'en_cours', label: '🔵 En cours' },
            { value: 'traite', label: '🟢 Traité' },
            { value: 'rejete', label: '🔴 Rejeté' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${statusFilter === value ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="">Tous les types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl">
          <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">Aucun avis ou suggestion pour cette sélection</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((fb) => {
            const isExpanded = expandedId === fb.id
            const statusColor = STATUS_COLORS[fb.status] || STATUS_COLORS.nouveau
            return (
              <div key={fb.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="flex items-start gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-white font-semibold text-sm truncate">{fb.subject}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${statusColor}`}>
                        {STATUS_EMOJI[fb.status]} {fb.status?.replace(/_/g, ' ')?.toUpperCase()}
                      </span>
                      <span className="bg-slate-800 text-slate-400 text-[11px] px-2 py-0.5 rounded-lg">
                        {TYPE_LABELS[fb.type] || fb.type}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      {fb.company_name && <span>🏢 {fb.company_name}</span>}
                      {fb.sector_slug && <span>📂 {fb.sector_slug}</span>}
                      {fb.user_name && <span>👤 {fb.user_name}</span>}
                      <span>📅 {formatDate(fb.created_at)}</span>
                    </div>
                  </div>

                  <button onClick={() => setExpandedId(isExpanded ? null : fb.id)}
                    className="flex-shrink-0 text-slate-400 hover:text-white p-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-800 p-4 space-y-4">
                    <div className="bg-slate-800/50 rounded-xl p-3">
                      <p className="text-slate-300 text-sm leading-relaxed">{fb.message}</p>
                    </div>

                    {fb.admin_response && (
                      <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-3">
                        <p className="text-emerald-400 text-xs font-semibold mb-1">Réponse Admin</p>
                        <p className="text-emerald-200 text-sm">{fb.admin_response}</p>
                      </div>
                    )}

                    {/* Changer le statut */}
                    <div className="flex flex-wrap gap-2">
                      <span className="text-slate-500 text-xs self-center">Changer le statut :</span>
                      {['nouveau', 'en_cours', 'traite', 'rejete'].map((s) => (
                        <button key={s} disabled={updatingId === fb.id || fb.status === s}
                          onClick={() => handleStatusChange(fb.id, s)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition ${fb.status === s ? STATUS_COLORS[s] : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'} disabled:opacity-50`}>
                          {STATUS_EMOJI[s]} {s.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminFeedbacks
