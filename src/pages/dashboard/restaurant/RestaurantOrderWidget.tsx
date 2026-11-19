import React, { useState, useEffect, useMemo } from 'react'
import {
  UtensilsCrossed, Users, UserCheck, Flame, Wine,
  Split, Gift, DollarSign, Check, X
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useLocation } from 'react-router-dom'
import clsx from 'clsx'

export interface RestaurantServerItem {
  id: string
  matricule?: string
  nom_complet: string
  role?: string
  telephone?: string
  has_open_session?: boolean
  active_session_id?: string | null
}

interface RestaurantOrderWidgetProps {
  onTableChange?: (tableNum: string) => void
  selectedTable: string
  setSelectedTable: (tableNum: string) => void
  couverts: number
  setCouverts: (n: number) => void
  serveur: string
  setServeur: (s: string) => void
  circuit?: 'BAR' | 'CUISINE'
  setCircuit?: (c: 'BAR' | 'CUISINE') => void
  serveursListProp?: RestaurantServerItem[]
  onServeurChange?: (srv: RestaurantServerItem) => void
}

export const RestaurantOrderWidget: React.FC<RestaurantOrderWidgetProps> = ({
  selectedTable,
  setSelectedTable,
  couverts,
  setCouverts,
  serveur,
  setServeur,
  circuit = 'BAR',
  setCircuit,
  serveursListProp,
  onServeurChange
}) => {
  const { companyId, supabaseTenant } = useTenant()
  const location = useLocation()

  const [tablesList, setTablesList] = useState<any[]>([])
  const [internalServeurs, setInternalServeurs] = useState<RestaurantServerItem[]>([])

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
        const [tabRes, srvRes, sessRes] = await Promise.all([
          supabaseTenant('restaurant_tables').select('*'),
          supabaseTenant('restaurant_serveurs').select('*').eq('statut', 'ACTIF'),
          supabaseTenant('restaurant_sessions_serveurs').select('*').eq('statut', 'OUVERTE')
        ])

        if (tabRes.data) setTablesList(tabRes.data)

        if (!serveursListProp || serveursListProp.length === 0) {
          const map = new Map<string, RestaurantServerItem>()
          if (srvRes.data) {
            srvRes.data.forEach((s: any) => {
              const name = (s.nom_complet || '').trim()
              if (!name) return
              map.set(name.toLowerCase(), {
                id: s.id,
                matricule: s.matricule || `SRV-${name.slice(0, 3).toUpperCase()}`,
                nom_complet: name,
                role: s.role || 'SERVEUR',
                telephone: s.telephone || '',
                has_open_session: false,
                active_session_id: null
              })
            })
          }
          if (sessRes.data) {
            sessRes.data.forEach((sess: any) => {
              const sNom = (sess.serveur_nom || '').trim()
              if (!sNom) return
              const key = sNom.toLowerCase()
              if (map.has(key)) {
                const existing = map.get(key)!
                existing.has_open_session = true
                existing.active_session_id = sess.id
                if (!existing.id && sess.serveur_id) existing.id = sess.serveur_id
              } else {
                map.set(key, {
                  id: sess.serveur_id || `sess-${sess.id}`,
                  matricule: `SRV-${sNom.slice(0, 3).toUpperCase()}`,
                  nom_complet: sNom,
                  role: 'SERVEUR',
                  telephone: '',
                  has_open_session: true,
                  active_session_id: sess.id
                })
              }
            })
          }
          setInternalServeurs(Array.from(map.values()))
        }
      } catch (err) {
        console.warn('[RestaurantOrderWidget] Fetch meta notice:', err)
      }
    }
    fetchMeta()
  }, [companyId, supabaseTenant, serveursListProp])

  const activeServeurs = useMemo(() => {
    const list = (serveursListProp && serveursListProp.length > 0) ? serveursListProp : internalServeurs
    return [...list].sort((a, b) => {
      if (a.has_open_session && !b.has_open_session) return -1
      if (!a.has_open_session && b.has_open_session) return 1
      return (a.nom_complet || '').localeCompare(b.nom_complet || '')
    })
  }, [serveursListProp, internalServeurs])

  const handleSelectServeur = (val: string) => {
    setServeur(val)
    if (!val) return
    const matched = activeServeurs.find(s => (s.nom_complet || '').trim().toLowerCase() === val.trim().toLowerCase())
    if (matched && onServeurChange) {
      onServeurChange(matched)
    }
  }

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
              Affectation de table, couverts et attribution du personnel de service
            </p>
          </div>
        </div>

        {/* Sélecteurs Circuit, Table, Couverts et Serveur */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode de Vente BAR ou RESTAURANT */}
          {setCircuit && (
            <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setCircuit('BAR')}
                className={clsx(
                  'px-3.5 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 shadow-sm',
                  circuit === 'BAR' ? 'bg-rose-600 text-white shadow-rose-600/30' : 'text-slate-400 hover:text-white'
                )}
              >
                <span>🍾</span> BAR
              </button>
              <button
                type="button"
                onClick={() => setCircuit('CUISINE')}
                className={clsx(
                  'px-3.5 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 shadow-sm',
                  circuit === 'CUISINE' ? 'bg-rose-600 text-white shadow-rose-600/30' : 'text-slate-400 hover:text-white'
                )}
              >
                <span>🍽️</span> RESTAURANT / MAQUIS
              </button>
            </div>
          )}

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
                  <option key={t.id || t.numero_table} value={t.numero_table} className="bg-slate-900 text-white">
                    {t.numero_table} {t.zone ? `(${t.zone})` : ''} {t.statut ? `- ${t.statut}` : ''}
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

          {/* Serveur(se) Responsable */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase">Serveuse :</span>
            <select
              value={serveur}
              onChange={e => handleSelectServeur(e.target.value)}
              className="bg-transparent text-xs font-bold text-rose-300 focus:outline-none cursor-pointer max-w-[200px]"
            >
              <option value="" className="bg-slate-900 text-slate-400">
                {activeServeurs.length === 0 ? '-- Aucune serveuse enregistrée --' : '-- Affecter Serveuse / Serveur --'}
              </option>
              {activeServeurs.map(s => (
                <option key={s.id || s.nom_complet} value={s.nom_complet} className="bg-slate-900 text-white">
                  {s.has_open_session ? '🟢 ' : '💁‍♀️ '} {s.nom_complet} {s.has_open_session ? '[Session active]' : ''} {s.matricule ? `(${s.matricule})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RestaurantOrderWidget
