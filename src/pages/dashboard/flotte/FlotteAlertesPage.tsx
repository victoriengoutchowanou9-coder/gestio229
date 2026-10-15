// =============================================================================
// GESTIO 229 SaaS — Centre d'Alertes & Incidents Sécurité Flotte
// Excès de vitesse, sorties de zone, batterie faible, freinages brusques
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Clock,
  MapPin,
  Truck,
  Check,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getAlertesFlotte,
  acquitterAlerteFlotte,
  type FlotteAlerte,
} from '../../../services/flotteService'

export const FlotteAlertesPage: React.FC = () => {
  const { company, user } = useTenant()
  const companyId = company?.id || ''
  const userName = user?.email || 'Gestionnaire Flotte'

  const [alertes, setAlertes] = useState<FlotteAlerte[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filterGravite, setFilterGravite] = useState<string>('TOUS')
  const [filterStatut, setFilterStatut] = useState<string>('NON_ACQUITTEES')

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const list = await getAlertesFlotte(companyId)
      setAlertes(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleAcquitter = async (id: string) => {
    await acquitterAlerteFlotte(companyId, id, userName)
    setAlertes((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, est_acquittee: true, acquittee_par: userName, acquittee_at: new Date().toISOString() }
          : a
      )
    )
  }

  const filtered = alertes.filter((a) => {
    const matchGravite = filterGravite === 'TOUS' || a.gravite === filterGravite
    const matchStatut =
      filterStatut === 'TOUS' ||
      (filterStatut === 'NON_ACQUITTEES' && !a.est_acquittee) ||
      (filterStatut === 'ACQUITTEES' && a.est_acquittee)
    return matchGravite && matchStatut
  })

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
            <span>Centre d'Alertes & Sécurité Flotte</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Journal en temps réel des incidents de conduite, survitesse, déconnexions et anomalies
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl"
          >
            <option value="NON_ACQUITTEES">À traiter ({alertes.filter((a) => !a.est_acquittee).length})</option>
            <option value="ACQUITTEES">Acquittées</option>
            <option value="TOUS">Toutes ({alertes.length})</option>
          </select>

          <select
            value={filterGravite}
            onChange={(e) => setFilterGravite(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl"
          >
            <option value="TOUS">Toutes gravités</option>
            <option value="CRITIQUE">Critique</option>
            <option value="AVERTISSEMENT">Avertissement</option>
            <option value="INFO">Information</option>
          </select>
        </div>
      </div>

      {/* Liste des Alertes */}
      <div className="space-y-3">
        {filtered.map((a) => (
          <div
            key={a.id}
            className={`p-5 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              a.gravite === 'CRITIQUE'
                ? 'bg-rose-500/10 border-rose-500/30'
                : a.gravite === 'AVERTISSEMENT'
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {a.vehicule_immat || 'Véhicule'}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    a.gravite === 'CRITIQUE'
                      ? 'bg-rose-600 text-white'
                      : a.gravite === 'AVERTISSEMENT'
                      ? 'bg-amber-500 text-white'
                      : 'bg-sky-500 text-white'
                  }`}
                >
                  {a.type_alerte}
                </span>

                {a.est_acquittee ? (
                  <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Acquittée par {a.acquittee_par}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-rose-600 font-bold">Non traitée</span>
                )}
              </div>

              <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">{a.message}</p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                </span>
                {a.latitude && (
                  <span className="font-mono text-[11px] text-sky-600">
                    GPS: {a.latitude?.toFixed(4)}, {a.longitude?.toFixed(4)}
                  </span>
                )}
              </div>
            </div>

            {!a.est_acquittee && (
              <button
                onClick={() => handleAcquitter(a.id)}
                className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>Acquitter l'incident</span>
              </button>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucune alerte pour ce filtre.
          </div>
        )}
      </div>
    </div>
  )
}

export default FlotteAlertesPage
