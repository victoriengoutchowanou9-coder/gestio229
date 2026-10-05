import React, { useState, useEffect } from 'react'
import {
  UtensilsCrossed, Users, UserCheck, Flame, Wine,
  Split, Gift, DollarSign, Check, X
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useLocation } from 'react-router-dom'
import clsx from 'clsx'

interface RestaurantOrderWidgetProps {
  onTableChange?: (tableNum: string) => void
  selectedTable: string
  setSelectedTable: (tableNum: string) => void
  couverts: number
  setCouverts: (n: number) => void
  serveur: string
  setServeur: (s: string) => void
}

export const RestaurantOrderWidget: React.FC<RestaurantOrderWidgetProps> = ({
  selectedTable,
  setSelectedTable,
  couverts,
  setCouverts,
  serveur,
  setServeur
}) => {
  const { companyId, supabaseTenant } = useTenant()
  const location = useLocation()

  const [tablesList, setTablesList] = useState<any[]>([])
  const [serveursList, setServeursList] = useState<any[]>([])

  useEffect(() => {
    // Vérifier si un paramètre d'URL table=... est passé
    const params = new URLSearchParams(location.search)
    const tableParam = params.get('table')
    if (tableParam) {
      setSelectedTable(tableParam)
    }
  }, [location.search, setSelectedTable])

  useEffect(() => {
    if (!companyId) return
    const fetchMeta = async () => {
      try {
        const [tabRes, srvRes] = await Promise.all([
          supabaseTenant('restaurant_tables').select('numero_table, nom, zone, statut'),
          supabaseTenant('restaurant_serveurs').select('nom_complet, role').eq('statut', 'ACTIF')
        ])
        if (tabRes.data) setTablesList(tabRes.data)
        if (srvRes.data) setServeursList(srvRes.data)
      } catch (err) {
        console.warn('[RestaurantOrderWidget] Tables fetch:', err)
      }
    }
    fetchMeta()
  }, [companyId, supabaseTenant])

  return (
    <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white rounded-3xl p-4 shadow-md border border-rose-900/40 mb-4 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              Service Salle & Tables
              {selectedTable && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full font-mono">
                  {selectedTable}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-300">
              Affectation de table, couverts et envoi direct aux postes Cuisine & Bar
            </p>
          </div>
        </div>

        {/* Sélecteurs Table, Couverts et Serveur */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Choix Table */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Table :</span>
            <select
              value={selectedTable}
              onChange={e => setSelectedTable(e.target.value)}
              className="bg-transparent text-xs font-black text-rose-400 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">Comptoir / Emporter</option>
              {tablesList.length === 0 ? (
                <>
                  <option value="T 01" className="bg-slate-900 text-white">T 01 (Salle)</option>
                  <option value="T 02" className="bg-slate-900 text-white">T 02 (Salle)</option>
                  <option value="T 03" className="bg-slate-900 text-white">T 03 (Salle)</option>
                  <option value="VIP 01" className="bg-slate-900 text-white">VIP 01</option>
                  <option value="TER 01" className="bg-slate-900 text-white">TER 01 (Terrasse)</option>
                  <option value="BAR 01" className="bg-slate-900 text-white">BAR 01 (Comptoir)</option>
                </>
              ) : (
                tablesList.map(t => (
                  <option key={t.numero_table} value={t.numero_table} className="bg-slate-900 text-white">
                    {t.numero_table} ({t.zone}) - {t.statut}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Couverts */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase">Couverts :</span>
            <input
              type="number"
              min="1"
              max="50"
              value={couverts}
              onChange={e => setCouverts(Math.max(1, Number(e.target.value)))}
              className="w-10 bg-transparent text-xs font-black font-mono text-white text-center focus:outline-none"
            />
          </div>

          {/* Serveur */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase">Serveur :</span>
            <select
              value={serveur}
              onChange={e => setServeur(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="Serveur de Salle" className="bg-slate-900 text-white">Serveur de Salle</option>
              {serveursList.map(s => (
                <option key={s.nom_complet} value={s.nom_complet} className="bg-slate-900 text-white">
                  {s.nom_complet}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
