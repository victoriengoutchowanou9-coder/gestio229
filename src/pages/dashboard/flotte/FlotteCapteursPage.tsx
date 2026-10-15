// =============================================================================
// GESTIO 229 SaaS — Capteurs IoT & Chaîne du Froid Flotte
// Sondes BLE de température, humidité, contacts de porte & jauges carburant CAN
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Thermometer,
  Plus,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Droplets,
  Activity,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getCapteursFlotte,
  type FlotteCapteur,
} from '../../../services/flotteService'

export const FlotteCapteursPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [capteurs, setCapteurs] = useState<FlotteCapteur[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const list = await getCapteursFlotte(companyId)
      setCapteurs(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Thermometer className="w-6 h-6 text-sky-600" />
            <span>Capteurs IoT & Chaîne du Froid</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Télémétrie des températures frigo (-18°C), sondes de cuve et capteurs d'ouverture de porte
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-xs font-semibold rounded-xl flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Passerelle BLE Active</span>
          </span>
        </div>
      </div>

      {/* Grille des Capteurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {capteurs.map((c) => {
          const isTemp = c.type_capteur === 'TEMPERATURE'
          const isDoor = c.type_capteur === 'PORTE'
          const isFuel = c.type_capteur === 'NIVEAU_CARBURANT'

          return (
            <div
              key={c.id}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                    {c.type_capteur}
                  </span>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {c.nom_capteur}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Véhicule : <strong className="text-slate-700 dark:text-slate-200">{c.vehicule_immat}</strong>
                  </div>
                </div>

                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow" />
              </div>

              {/* Affichage de la valeur */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Mesure en Direct</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                    {isDoor ? (c.valeur_actuelle === 0 ? 'Fermée' : 'Ouverte') : `${c.valeur_actuelle} ${c.unite}`}
                  </div>
                </div>

                <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  {isTemp ? <Thermometer className="w-5 h-5" /> : isDoor ? <CheckCircle2 className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <div className="flex justify-between py-0.5">
                  <span>Adresse MAC BLE :</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {c.identifiant_mac || 'BLE:00:11:22:33:44'}
                  </span>
                </div>
                {c.seuil_min && (
                  <div className="flex justify-between py-0.5">
                    <span>Plage Normale :</span>
                    <span className="font-semibold text-emerald-600">
                      {c.seuil_min}°C à {c.seuil_max}°C
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-0.5">
                  <span>Dernier ping :</span>
                  <span className="text-[11px]">En direct</span>
                </div>
              </div>
            </div>
          )
        })}

        {capteurs.length === 0 && (
          <div className="col-span-3 p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucun capteur IoT associé pour le moment.
          </div>
        )}
      </div>
    </div>
  )
}

export default FlotteCapteursPage
