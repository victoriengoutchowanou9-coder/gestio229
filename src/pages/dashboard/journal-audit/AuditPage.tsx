// =============================================================================
// GESTIO 229 SaaS — Journal d'Audit & Traçabilité
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Shield, RefreshCw, Search, Clock, UserCheck } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

interface AuditLog {
  id: string
  action: string
  entity_name?: string
  entity_id?: string
  details?: any
  ip_address?: string
  user_email?: string
  created_at: string
}

const AuditPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadAuditLogs = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setLogs(data || [])
    } catch (err: any) {
      toast.error('Erreur chargement logs audit', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  const filtered = logs.filter((l) =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    (l.entity_name && l.entity_name.toLowerCase().includes(search.toLowerCase())) ||
    (l.user_email && l.user_email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Journal d'Audit & Sécurité</h1>
          <p className="text-slate-500 text-sm mt-1">Historique certifié des événements et des actions sur le tenant</p>
        </div>
        <button
          onClick={loadAuditLogs}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
        <Shield className="w-6 h-6 text-emerald-600 flex-shrink-0" />
        <p className="text-xs text-emerald-800 leading-relaxed">
          <strong>Intégrité garantie :</strong> Chaque écriture, modification de tarif, encaissement ou clôture de caisse fait l'objet d'un horodatage inaltérable avec identifiant d'opérateur conforme aux préconisations d'audit OHADA.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par action, table ou utilisateur..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Table Logs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold">Aucun événement enregistré</p>
            <p className="text-slate-400 text-sm">Les événements de sécurité et d'administration apparaîtront ici.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Horodatage</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Entité Ciblée</th>
                  <th className="px-5 py-3">Utilisateur</th>
                  <th className="px-5 py-3">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500 font-mono">
                      {new Date(log.created_at).toLocaleString('fr-BJ')}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-800">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{log.entity_name || 'Système'}</td>
                    <td className="px-5 py-3 font-medium text-slate-600">{log.user_email || 'Automatique'}</td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-[11px] truncate max-w-xs">
                      {log.details ? JSON.stringify(log.details) : '-'}
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

export default AuditPage
