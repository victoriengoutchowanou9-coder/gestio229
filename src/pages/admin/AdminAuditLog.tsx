// =============================================================================
// GESTIO 229 ADMIN — Page Journal d'Audit Super Admin
// =============================================================================

import React, { useState } from 'react'
import { useAdminAuditLogs } from '../../hooks/useAdminData'
import { ClipboardList, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

function formatDate(d: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const AdminAuditLog: React.FC = () => {
  const { logs, loading, error, reload } = useAdminAuditLogs()
  const [search, setSearch] = useState('')

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase()
    return !q || l.action?.toLowerCase().includes(q) || l.company_name?.toLowerCase().includes(q) || l.result?.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Journal d'Audit</h1>
          <p className="text-slate-400 text-sm">{logs.length} entrée(s) — actions sensibles du Super Admin</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 text-amber-300 text-xs">
        🔒 Le journal d'audit est en lecture seule et ne peut pas être supprimé depuis cette interface.
      </div>

      <div className="relative">
        <input type="text" placeholder="Filtrer par action, entreprise, résultat..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Date & Heure', 'Action', 'Entreprise', 'Secteur', 'Résultat', 'IP', 'Détails'].map((h) => (
                    <th key={h} className="text-left text-slate-500 text-xs font-semibold px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-slate-500 py-12 text-sm">Aucune entrée d'audit</td></tr>
                ) : filtered.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3">
                      {log.action === 'BLOCAGE_ACCES' ? (
                        <span className="text-amber-300 bg-amber-950/60 border border-amber-800 text-xs font-semibold px-2 py-0.5 rounded">
                          🔒 BLOCAGE ACCÈS
                        </span>
                      ) : log.action === 'DEBLOCAGE_ACCES' ? (
                        <span className="text-emerald-300 bg-emerald-950/60 border border-emerald-800 text-xs font-semibold px-2 py-0.5 rounded">
                          🔓 DÉBLOCAGE ACCÈS
                        </span>
                      ) : log.action === 'SUPPRESSION_LOGIQUE' ? (
                        <span className="text-red-300 bg-red-950/60 border border-red-800 text-xs font-semibold px-2 py-0.5 rounded">
                          🗑️ SUPPRESSION LOGIQUE
                        </span>
                      ) : log.action === 'RESTAURATION_ENTREPRISE' ? (
                        <span className="text-cyan-300 bg-cyan-950/60 border border-cyan-800 text-xs font-semibold px-2 py-0.5 rounded">
                          🔄 RESTAURATION
                        </span>
                      ) : log.action === 'SUPPRESSION_DEFINITIVE' ? (
                        <span className="text-rose-300 bg-rose-950/80 border border-rose-800 text-xs font-semibold px-2 py-0.5 rounded">
                          ⚠️ SUPPR. DÉFINITIVE
                        </span>
                      ) : (
                        <span className="text-white text-xs font-semibold font-mono bg-slate-800 px-2 py-0.5 rounded">
                          {log.action}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs font-medium">{log.company_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{log.sector_slug || '—'}</td>
                    <td className="px-4 py-3">
                      {log.result === 'success' ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Succès
                        </span>
                      ) : log.result === 'failure' ? (
                        <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                          <XCircle className="w-3 h-3" /> Échec
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-400 text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" /> {log.result}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{log.ip_address || '—'}</td>
                    <td className="px-4 py-3 text-xs max-w-[260px] truncate">
                      {log.details?.motif || log.details?.reason ? (
                        <span className="text-slate-300 font-medium">
                          Motif : <strong className="text-amber-200">{log.details.motif || log.details.reason}</strong>
                        </span>
                      ) : log.details && typeof log.details === 'object' ? (
                        <span className="text-slate-500">
                          {Object.entries(log.details).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAuditLog
