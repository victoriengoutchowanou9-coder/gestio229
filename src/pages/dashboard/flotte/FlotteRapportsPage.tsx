// =============================================================================
// GESTIO 229 SaaS — Rapports & Télématique Flotte
// Synthèse kilométrique, coût total de possession (TCO), rentabilité & export CSV
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  BarChart3,
  Download,
  Printer,
  Truck,
  Fuel,
  Wrench,
  DollarSign,
  TrendingUp,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getVehiculesFlotte,
  getCarburantLogs,
  getMaintenanceFlotte,
  type FlotteVehicule,
  type FlotteCarburant,
  type FlotteMaintenance,
} from '../../../services/flotteService'

export const FlotteRapportsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [carburant, setCarburant] = useState<FlotteCarburant[]>([])
  const [maintenance, setMaintenance] = useState<FlotteMaintenance[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [vList, cList, mList] = await Promise.all([
        getVehiculesFlotte(companyId),
        getCarburantLogs(companyId),
        getMaintenanceFlotte(companyId),
      ])
      setVehicules(vList)
      setCarburant(cList)
      setMaintenance(mList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  // Calculs TCO
  const totalKmFlotte = vehicules.reduce((s, v) => s + (v.kilometrage_actuel || 0), 0)
  const totalCarburantFcfa = carburant.reduce((s, c) => s + (c.montant_total_fcfa || 0), 0)
  const totalMaintenanceFcfa = maintenance.reduce((s, m) => s + (m.cout_total_fcfa || 0), 0)
  const totalDepensesExploitation = totalCarburantFcfa + totalMaintenanceFcfa

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Immatriculation', 'Marque', 'Modele', 'Type', 'Kilometrage', 'Statut', 'Carburant']
    const rows = vehicules.map((v) => [
      v.immatriculation,
      v.marque,
      v.modele,
      v.type_vehicule,
      v.kilometrage_actuel,
      v.statut,
      v.type_carburant,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `rapport_flotte_${company?.name || 'gestio229'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-sky-600" />
            <span>Rapports Télématiques & Coûts d'Exploitation</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Audit des performances de la flotte, coût total de détention (TCO) et exports officiels
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exporter CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl shadow transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer</span>
          </button>
        </div>
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Kilométrage Global Flotte</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalKmFlotte.toLocaleString()} <span className="text-sm font-normal">km</span>
          </div>
          <div className="text-[11px] text-sky-500 mt-1">Parcours total consolidé</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Coût Carburant Enregistré</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalCarburantFcfa.toLocaleString()} <span className="text-sm font-normal">FCFA</span>
          </div>
          <div className="text-[11px] text-emerald-600 mt-1">Carburant consommé</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Dépenses Entretien & Ateliers</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalMaintenanceFcfa.toLocaleString()}{' '}
            <span className="text-sm font-normal">FCFA</span>
          </div>
          <div className="text-[11px] text-purple-500 mt-1">Pièces & main d'œuvre</div>
        </div>
      </div>

      {/* Tableau détaillé de TCO par Véhicule */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Tableau d'Exploitation & Ratio par Véhicule
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b text-slate-500 uppercase font-semibold">
                <th className="py-3 px-4">Véhicule</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Kilométrage</th>
                <th className="py-3 px-4">Dépenses Carburant</th>
                <th className="py-3 px-4">Dépenses Maintenance</th>
                <th className="py-3 px-4">Coût d'Exploitation Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {vehicules.map((v) => {
                const carbVeh = carburant
                  .filter((c) => c.vehicule_immat === v.immatriculation)
                  .reduce((sum, c) => sum + (c.montant_total_fcfa || 0), 0)
                const maintVeh = maintenance
                  .filter((m) => m.vehicule_immat === v.immatriculation)
                  .reduce((sum, m) => sum + (m.cout_total_fcfa || 0), 0)
                const totalVeh = carbVeh + maintVeh

                return (
                  <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {v.immatriculation} ({v.marque} {v.modele})
                    </td>
                    <td className="py-3 px-4">{v.type_vehicule}</td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      {v.kilometrage_actuel.toLocaleString()} km
                    </td>
                    <td className="py-3 px-4">{carbVeh.toLocaleString()} FCFA</td>
                    <td className="py-3 px-4">{maintVeh.toLocaleString()} FCFA</td>
                    <td className="py-3 px-4 font-bold text-sky-600 dark:text-sky-400">
                      {totalVeh.toLocaleString()} FCFA
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default FlotteRapportsPage
