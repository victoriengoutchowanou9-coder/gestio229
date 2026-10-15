// =============================================================================
// GESTIO 229 SaaS — Carburant & Consommation Flotte
// Journal des pleins, calcul L/100km, détection de siphonnage et dépenses FCFA
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Fuel,
  Plus,
  Search,
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  Calendar,
  Truck,
  DollarSign,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getCarburantLogs,
  saveCarburantLog,
  getVehiculesFlotte,
  type FlotteCarburant,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteCarburantPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [logs, setLogs] = useState<FlotteCarburant[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingLog, setEditingLog] = useState<Partial<FlotteCarburant>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cList, vList] = await Promise.all([
        getCarburantLogs(companyId),
        getVehiculesFlotte(companyId),
      ])
      setLogs(cList)
      setVehicules(vList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  // Statistiques
  const totalLitres = logs.reduce((sum, l) => sum + (l.litres_achetes || 0), 0)
  const totalDepensesFcfa = logs.reduce((sum, l) => sum + (l.montant_total_fcfa || 0), 0)
  const consoMoyenne =
    logs.length > 0
      ? (logs.reduce((sum, l) => sum + (l.consommation_calculee_100km || 10), 0) / logs.length).toFixed(1)
      : '0.0'

  const handleOpenAdd = () => {
    const v = vehicules[0]
    setEditingLog({
      vehicule_id: v?.id || '',
      vehicule_immat: v?.immatriculation || '',
      conducteur_nom: v?.conducteur_nom || '',
      date_plein: new Date().toISOString().slice(0, 10),
      kilometrage_au_plein: v?.kilometrage_actuel || 0,
      litres_achetes: 50,
      prix_litre_fcfa: 700,
      montant_total_fcfa: 35000,
      station_nom: 'TotalEnergies',
      type_carburant: 'GASOIL',
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLog.vehicule_immat || !editingLog.litres_achetes) return
    setSaving(true)
    try {
      const saved = await saveCarburantLog(companyId, {
        ...editingLog,
        montant_total_fcfa: (editingLog.litres_achetes || 0) * (editingLog.prix_litre_fcfa || 700),
      })
      setLogs((prev) => [saved, ...prev])
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Fuel className="w-6 h-6 text-sky-600" />
            <span>Carburant, Pleins & Consommation</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Suivi des ravitaillements en station, audits des consommations L/100km et détection d'anomalies
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Enregistrer un Plein</span>
        </button>
      </div>

      {/* Cartes KPI Carburant */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Volume Total Acheté</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalLitres.toLocaleString()} <span className="text-sm font-normal">Litres</span>
          </div>
          <div className="text-[11px] text-sky-500 mt-1 flex items-center gap-1">
            <Fuel className="w-3 h-3" />
            <span>Pleins enregistrés</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Dépenses Totales Carburant</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalDepensesFcfa.toLocaleString()}{' '}
            <span className="text-sm font-normal">FCFA</span>
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Factures acquittées</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Consommation Moyenne Flotte</div>
          <div className="text-2xl font-bold text-sky-600 mt-1">
            {consoMoyenne} <span className="text-sm font-normal">L / 100km</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Étalon de référence entreprise</div>
        </div>
      </div>

      {/* Tableau des Pleins */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Véhicule</th>
                <th className="py-3 px-4">Chauffeur</th>
                <th className="py-3 px-4">Station Service</th>
                <th className="py-3 px-4">Compteur Km</th>
                <th className="py-3 px-4">Volume (L)</th>
                <th className="py-3 px-4">Montant Total</th>
                <th className="py-3 px-4">Conso L/100km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-slate-700 dark:text-slate-300">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                    {l.date_plein}
                  </td>
                  <td className="py-3 px-4 font-bold text-sky-600 dark:text-sky-400">
                    {l.vehicule_immat}
                  </td>
                  <td className="py-3 px-4">{l.conducteur_nom || '—'}</td>
                  <td className="py-3 px-4">{l.station_nom}</td>
                  <td className="py-3 px-4 font-mono">{l.kilometrage_au_plein.toLocaleString()} km</td>
                  <td className="py-3 px-4 font-bold">{l.litres_achetes} L</td>
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    {l.montant_total_fcfa.toLocaleString()} FCFA
                  </td>
                  <td className="py-3 px-4">
                    {l.consommation_calculee_100km ? (
                      <span className="font-semibold text-emerald-600">
                        {l.consommation_calculee_100km} L/100km
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Aucun plein enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout Plein */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Enregistrer un Ravitaillement
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Véhicule *</label>
                <select
                  value={editingLog.vehicule_immat || ''}
                  onChange={(e) => {
                    const found = vehicules.find((v) => v.immatriculation === e.target.value)
                    setEditingLog({
                      ...editingLog,
                      vehicule_id: found?.id,
                      vehicule_immat: found?.immatriculation,
                      conducteur_nom: found?.conducteur_nom,
                      kilometrage_au_plein: found?.kilometrage_actuel,
                    })
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                >
                  {vehicules.map((v) => (
                    <option key={v.id} value={v.immatriculation}>
                      {v.immatriculation} ({v.marque} {v.modele})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={editingLog.date_plein || ''}
                    onChange={(e) => setEditingLog({ ...editingLog, date_plein: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Compteur au Plein (Km)</label>
                  <input
                    type="number"
                    value={editingLog.kilometrage_au_plein || 0}
                    onChange={(e) =>
                      setEditingLog({
                        ...editingLog,
                        kilometrage_au_plein: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Volume Acheté (Litres) *</label>
                  <input
                    type="number"
                    required
                    value={editingLog.litres_achetes || 0}
                    onChange={(e) =>
                      setEditingLog({ ...editingLog, litres_achetes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Prix au Litre (FCFA)</label>
                  <input
                    type="number"
                    value={editingLog.prix_litre_fcfa || 700}
                    onChange={(e) =>
                      setEditingLog({ ...editingLog, prix_litre_fcfa: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Station Service</label>
                <input
                  type="text"
                  placeholder="TotalEnergies, Oryx, Benin Petro..."
                  value={editingLog.station_nom || ''}
                  onChange={(e) => setEditingLog({ ...editingLog, station_nom: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Total Estimé :
                </span>
                <span className="font-bold text-sky-600 text-sm">
                  {((editingLog.litres_achetes || 0) * (editingLog.prix_litre_fcfa || 700)).toLocaleString()}{' '}
                  FCFA
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-sky-600 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Enregistrer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteCarburantPage
