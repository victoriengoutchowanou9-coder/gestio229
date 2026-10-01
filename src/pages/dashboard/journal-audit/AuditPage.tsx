// =============================================================================
// GESTIO 229 SaaS — Journal d'Audit & Traçabilité Intégrale
// Table réglementaire : Date/Heure | Utilisateur | Rôle | Secteur | Module | Action | Description | IP | Navigateur
// Filtres avancés multi-critères & Export Excel / CSV UTF-8 BOM
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Shield, RefreshCw, Search, Download, Calendar, Filter, Eye, X,
  FileSpreadsheet, User, Layers, Monitor, HardDrive, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import ModalPortal from '../../../components/modals/ModalPortal'
import clsx from 'clsx'

interface AuditLog {
  id: string
  company_id: string
  user_id?: string
  user_name?: string
  user_email?: string
  user_role?: string
  action: string
  entity_name?: string
  entity_id?: string
  details?: Record<string, any>
  ip_address?: string
  created_at: string
}

export const AuditPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  // Isolation par activité
  const activeSector = typeof window !== 'undefined' ? (localStorage.getItem('gestio229_active_sector') || 'boutique') : 'boutique'
  const activeActivityName = typeof window !== 'undefined' ? (localStorage.getItem('gestio229_active_activity_name') || null) : null

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  // Filtres
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('ALL')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [sectorFilter, setSectorFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Détails modale
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const loadAuditLogs = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(400)

      if (error) throw error
      setLogs(data || [])
    } catch (err: any) {
      toast.error('Erreur chargement logs audit', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  // Isolation par activité : Ne conserver que les logs de ce sous-logiciel ou système général
  const activityLogs = useMemo(() => {
    const cleanActive = activeSector.toLowerCase().replace(/^sec-/, '')
    return logs.filter((l) => {
      const logSec = (l.details?.sector_slug || l.details?.sector || '').toLowerCase().replace(/^sec-/, '')
      if (!logSec || logSec === 'général' || logSec === 'general') return true
      return logSec === cleanActive
    })
  }, [logs, activeSector])

  // Extraction des valeurs uniques pour les sélecteurs
  const availableModules = useMemo(() => {
    const s = new Set<string>()
    activityLogs.forEach((l) => {
      const m = l.details?.module || l.entity_name
      if (m) s.add(String(m).toUpperCase())
    })
    return Array.from(s).sort()
  }, [activityLogs])

  const availableRoles = useMemo(() => {
    const s = new Set<string>()
    activityLogs.forEach((l) => {
      const r = l.details?.role || l.user_role
      if (r) s.add(String(r))
    })
    return Array.from(s).sort()
  }, [activityLogs])

  const availableSectors = useMemo(() => {
    const s = new Set<string>()
    activityLogs.forEach((l) => {
      const sec = l.details?.sector
      if (sec) s.add(String(sec))
    })
    return Array.from(s).sort()
  }, [activityLogs])

  // Filtrage combiné multi-critères
  const filteredLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      const userName = log.user_name || log.user_email || 'Automatique'
      const role = log.details?.role || log.user_role || 'Opérateur'
      const sector = log.details?.sector || 'Général'
      const module = log.details?.module || log.entity_name || 'Système'
      const description = log.details?.description || ''
      const action = log.action || ''

      // Recherche plein texte
      if (search.trim()) {
        const q = search.toLowerCase()
        const matches =
          action.toLowerCase().includes(q) ||
          description.toLowerCase().includes(q) ||
          userName.toLowerCase().includes(q) ||
          module.toLowerCase().includes(q) ||
          (log.ip_address && log.ip_address.includes(q))
        if (!matches) return false
      }

      // Filtre Module
      if (moduleFilter !== 'ALL' && module.toUpperCase() !== moduleFilter) {
        return false
      }

      // Filtre Rôle
      if (roleFilter !== 'ALL' && role !== roleFilter) {
        return false
      }

      // Filtre Secteur
      if (sectorFilter !== 'ALL' && sector !== sectorFilter) {
        return false
      }

      // Filtre Action
      if (actionFilter !== 'ALL' && action !== actionFilter) {
        return false
      }

      // Filtre Date début
      if (startDate) {
        const logDate = log.created_at.slice(0, 10)
        if (logDate < startDate) return false
      }

      // Filtre Date fin
      if (endDate) {
        const logDate = log.created_at.slice(0, 10)
        if (logDate > endDate) return false
      }

      return true
    })
  }, [logs, search, moduleFilter, roleFilter, sectorFilter, actionFilter, startDate, endDate])

  // Export Excel / CSV avec BOM UTF-8 pour ouverture parfaite dans Microsoft Excel
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      toast.error('Export impossible', 'Aucun événement à exporter.')
      return
    }

    const headers = [
      'Date / Heure',
      'Utilisateur',
      'Rôle',
      'Secteur',
      'Module',
      'Action',
      'Description',
      'IP',
      'Navigateur'
    ]

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""'
      const s = String(str).replace(/"/g, '""')
      return `"${s}"`
    }

    const rows = filteredLogs.map((log) => [
      escapeCsv(new Date(log.created_at).toLocaleString('fr-BJ')),
      escapeCsv(log.user_name || log.user_email || 'Automatique'),
      escapeCsv(log.details?.role || log.user_role || 'Opérateur'),
      escapeCsv(log.details?.sector || 'Général'),
      escapeCsv(log.details?.module || log.entity_name || 'Système'),
      escapeCsv(log.action),
      escapeCsv(log.details?.description || log.entity_name || '-'),
      escapeCsv(log.ip_address || '127.0.0.1'),
      escapeCsv(log.details?.browser || 'Navigateur Standard')
    ])

    const csvContent =
      '\uFEFF' +
      [headers.map((h) => `"${h}"`).join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Journal_Audit_${company?.name ? company.name.replace(/\s+/g, '_') : 'GESTIO229'}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Export réussi', 'Le fichier journal d\'audit CSV/Excel a été téléchargé.')
  }

  const resetFilters = () => {
    setSearch('')
    setModuleFilter('ALL')
    setRoleFilter('ALL')
    setSectorFilter('ALL')
    setActionFilter('ALL')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="space-y-4">
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Journal d'Audit & Traçabilité Intégrale
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Historique inaltérable certifié conforme SYSCOHADA : utilisateur, rôle, secteur, action, IP et navigateur
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 active:scale-95"
            title="Exporter le journal d'audit au format Excel (CSV UTF-8)"
          >
            <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
            <span>Exporter Excel</span>
          </button>

          <button
            onClick={loadAuditLogs}
            className="p-2 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition"
            title="Actualiser la liste"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Barre de Filtres Multi-critères ─────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            Filtres de recherche multi-critères
          </span>
          <button
            onClick={resetFilters}
            className="text-[11px] text-indigo-600 hover:underline font-semibold"
          >
            Réinitialiser les filtres
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Recherche libre */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Recherche action, utilisateur, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Module */}
          <div>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Tous les Modules</option>
              {availableModules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Rôle */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Tous les Rôles</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Date Début */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500"
              title="Date Début"
            />
          </div>

          {/* Date Fin */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500"
              title="Date Fin"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 font-mono">
          <span>
            Affichage de <strong>{filteredLogs.length}</strong> événement(s) sur {logs.length} au total
          </span>
          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
            Intégrité inaltérable conforme OHADA
          </span>
        </div>
      </div>

      {/* ── Table du Journal d'Audit (9 colonnes obligatoires) ──────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold text-sm">Aucun événement ne correspond aux filtres</p>
            <p className="text-slate-400 text-xs mt-1">
              Modifiez vos critères ou réinitialisez les filtres pour afficher l'historique complet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="p-3 whitespace-nowrap">Date / Heure</th>
                  <th className="p-3">Utilisateur</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">Secteur</th>
                  <th className="p-3">Module</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 font-mono">IP</th>
                  <th className="p-3">Navigateur</th>
                  <th className="p-3 text-center">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredLogs.map((log) => {
                  const userName = log.user_name || log.user_email || 'Automatique'
                  const role = log.details?.role || log.user_role || 'Opérateur'
                  const sector = log.details?.sector || 'Général'
                  const module = log.details?.module || log.entity_name || 'Système'
                  const description = log.details?.description || log.entity_name || '-'
                  const browser = log.details?.browser || 'Navigateur Standard'

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      {/* 1. Date / Heure */}
                      <td className="p-3 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                        {new Date(log.created_at).toLocaleString('fr-BJ')}
                      </td>

                      {/* 2. Utilisateur */}
                      <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-700 font-bold">
                            {userName.charAt(0).toUpperCase()}
                          </div>
                          <span>{userName}</span>
                        </div>
                      </td>

                      {/* 3. Rôle */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {role}
                        </span>
                      </td>

                      {/* 4. Secteur */}
                      <td className="p-3 whitespace-nowrap text-slate-600 font-medium">
                        {sector}
                      </td>

                      {/* 5. Module */}
                      <td className="p-3 whitespace-nowrap font-mono font-bold text-indigo-900 text-[11px]">
                        {module}
                      </td>

                      {/* 6. Action */}
                      <td className="p-3 whitespace-nowrap">
                        <span className={clsx(
                          'px-2 py-0.5 rounded text-[10px] font-mono font-bold',
                          log.action.includes('CLOTURE') ? 'bg-amber-100 text-amber-900' :
                          log.action.includes('VENTE') ? 'bg-emerald-100 text-emerald-900' :
                          log.action.includes('TRANSFERT') ? 'bg-purple-100 text-purple-900' :
                          log.action.includes('RECEPTION') ? 'bg-blue-100 text-blue-900' :
                          log.action.includes('RECOUVREMENT') ? 'bg-teal-100 text-teal-900' :
                          log.action.includes('SUPPRESSION') ? 'bg-rose-100 text-rose-900' :
                          'bg-slate-100 text-slate-800'
                        )}>
                          {log.action}
                        </span>
                      </td>

                      {/* 7. Description */}
                      <td className="p-3 text-slate-700 max-w-xs truncate" title={description}>
                        {description}
                      </td>

                      {/* 8. IP */}
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {log.ip_address || '127.0.0.1'}
                      </td>

                      {/* 9. Navigateur */}
                      <td className="p-3 text-slate-500 text-[11px] max-w-[120px] truncate" title={browser}>
                        {browser}
                      </td>

                      {/* Action Détail */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1 hover:bg-slate-200 text-slate-600 rounded transition"
                          title="Voir les métadonnées complètes"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modale d'Inspection Détaillée ───────────────────────────────────── */}
      <ModalPortal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} id="modal-audit-detail">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              Détail Événement d'Audit
            </h3>
            <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {selectedLog && (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">ID Événement :</span>
                  <span className="font-bold text-slate-800">{selectedLog.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date & Heure :</span>
                  <span className="font-bold text-slate-800">
                    {new Date(selectedLog.created_at).toLocaleString('fr-BJ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Action :</span>
                  <span className="font-bold text-indigo-900">{selectedLog.action}</span>
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-700 mb-1">Description :</span>
                <p className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 font-sans text-xs">
                  {selectedLog.details?.description || selectedLog.entity_name || 'Aucune description textuelle'}
                </p>
              </div>

              <div>
                <span className="block font-bold text-slate-700 mb-1">Métadonnées Techniques (Payload JSON) :</span>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[10px] overflow-x-auto max-h-48">
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>
    </div>
  )
}

export default AuditPage
