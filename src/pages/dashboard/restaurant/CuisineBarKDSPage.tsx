import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Flame, Wine, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  ChefHat, GlassWater, Bell, Search, Check, Play, UserCheck
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import clsx from 'clsx'

export const CuisineBarKDSPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'TOUS' | 'CUISINE' | 'BAR'>('TOUS')
  const [lignes, setLignes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadKDSData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_commande_lignes')
        .select('*')
        .neq('statut_preparation', 'SERVI')
        .neq('statut_preparation', 'ANNULE')
        .order('heure_commande', { ascending: true })

      if (error) throw error
      setLignes(data || [])
    } catch (err: any) {
      console.error('[KDS] Erreur chargement KDS:', err.message)
      setLignes([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadKDSData()
    // Rafraîchissement automatique toutes les 30 secondes pour le direct cuisine
    const timer = setInterval(loadKDSData, 30000)
    return () => clearInterval(timer)
  }, [loadKDSData])

  const handleUpdateStatut = async (ligneId: string, nouveauStatut: string) => {
    try {
      const updates: any = { statut_preparation: nouveauStatut }
      if (nouveauStatut === 'PRET') updates.heure_prete = new Date().toISOString()
      if (nouveauStatut === 'SERVI') updates.heure_servie = new Date().toISOString()

      await supabaseTenant('restaurant_commande_lignes')
        .update(updates)
        .eq('id', ligneId)

      toast.success('Mise à jour', `Article passé en statut : ${nouveauStatut}`)
      setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, ...updates } : l))
    } catch (err: any) {
      toast.error('Erreur', err.message)
      setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, statut_preparation: nouveauStatut } : l))
    }
  }

  const filteredLignes = useMemo(() => {
    if (activeTab === 'TOUS') return lignes
    return lignes.filter(l => l.destination === activeTab)
  }, [lignes, activeTab])

  // Grouper les lignes par table / commande pour un affichage en bons de préparation
  const groupedOrders = useMemo(() => {
    const groups: Record<string, { table: string; commande: string; serveur: string; items: any[]; minTime: string }> = {}
    filteredLignes.forEach(l => {
      const key = `${l.table_numero || 'T'}-${l.commande_numero || 'CMD'}`
      if (!groups[key]) {
        groups[key] = {
          table: l.table_numero || 'Table',
          commande: l.commande_numero || 'CMD',
          serveur: l.serveur_nom || 'Serveur',
          items: [],
          minTime: l.heure_commande
        }
      }
      groups[key].items.push(l)
    })
    return Object.values(groups)
  }, [filteredLignes])

  const getMinutesElapsed = (iso: string) => {
    if (!iso) return 0
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    return Math.max(0, diff)
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête KDS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-5 rounded-3xl shadow-lg border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white flex items-center gap-2">
                Écran Cuisine & Bar (KDS Direct)
              </h1>
              <p className="text-xs text-slate-400">
                Tickets de préparation en temps réel • Suivi des temps d'attente et expédition
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sélecteur de Poste */}
          <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
            <button
              onClick={() => setActiveTab('TOUS')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs font-black transition',
                activeTab === 'TOUS' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              )}
            >
              Tous ({lignes.length})
            </button>
            <button
              onClick={() => setActiveTab('CUISINE')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1',
                activeTab === 'CUISINE' ? 'bg-orange-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
              )}
            >
              <Flame className="w-3.5 h-3.5" /> Cuisine
            </button>
            <button
              onClick={() => setActiveTab('BAR')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1',
                activeTab === 'BAR' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              )}
            >
              <Wine className="w-3.5 h-3.5" /> Bar
            </button>
          </div>

          <button
            onClick={loadKDSData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition"
            title="Rafraîchir"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Bons de Préparation en cours */}
      {groupedOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-black text-slate-900">Toutes les commandes sont prêtes et servies !</h3>
          <p className="text-xs text-slate-400 mt-1">Aucun ticket en attente de préparation pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupedOrders.map((order, idx) => {
            const minutes = getMinutesElapsed(order.minTime)
            const isLate = minutes >= 25
            const isWarning = minutes >= 15 && minutes < 25

            return (
              <div
                key={idx}
                className={clsx(
                  'bg-white rounded-3xl border shadow-sm flex flex-col justify-between overflow-hidden transition',
                  isLate ? 'border-rose-400 ring-2 ring-rose-500/20' : isWarning ? 'border-amber-300' : 'border-slate-200'
                )}
              >
                {/* En-tête Ticket */}
                <div className={clsx(
                  'p-4 flex items-center justify-between text-white',
                  isLate ? 'bg-rose-600' : isWarning ? 'bg-amber-600' : 'bg-slate-900'
                )}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-lg bg-white/20 px-2.5 py-0.5 rounded-xl">
                      {order.table}
                    </span>
                    <div>
                      <p className="text-[10px] font-bold text-white/80 uppercase">Serveur : {order.serveur}</p>
                      <p className="text-xs font-mono font-bold">{order.commande}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono font-black text-xs bg-black/25 px-2.5 py-1 rounded-xl">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{minutes} min</span>
                  </div>
                </div>

                {/* Liste des articles du bon */}
                <div className="p-4 space-y-3 flex-1 divide-y divide-slate-100">
                  {order.items.map((it: any) => {
                    const isCuisine = it.destination === 'CUISINE'
                    const isPret = it.statut_preparation === 'PRET'
                    const isEnPrep = it.statut_preparation === 'EN_PREPARATION'

                    return (
                      <div key={it.id} className="pt-2.5 first:pt-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-800 font-mono font-black text-xs flex items-center justify-center flex-shrink-0">
                              {it.quantite}x
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={clsx(
                                  'text-[10px] font-black px-1.5 py-0.5 rounded',
                                  isCuisine ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                                )}>
                                  {isCuisine ? 'Cuisine' : 'Bar'}
                                </span>
                                <h4 className="font-bold text-xs text-slate-900">{it.designation}</h4>
                              </div>
                              {it.notes_cuisson && (
                                <p className="text-[11px] text-rose-600 font-semibold mt-0.5 italic">
                                  Note : {it.notes_cuisson}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Statut Badge */}
                          <span className={clsx(
                            'text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider',
                            isPret ? 'bg-emerald-100 text-emerald-800' : isEnPrep ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          )}>
                            {it.statut_preparation}
                          </span>
                        </div>

                        {/* Actions directes par ligne */}
                        <div className="flex items-center gap-1.5 mt-2 justify-end">
                          {it.statut_preparation === 'NOUVEAU' && (
                            <button
                              onClick={() => handleUpdateStatut(it.id, 'EN_PREPARATION')}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black rounded-lg flex items-center gap-1 transition"
                            >
                              <Play className="w-3 h-3" /> En Préparation
                            </button>
                          )}
                          {it.statut_preparation !== 'PRET' && (
                            <button
                              onClick={() => handleUpdateStatut(it.id, 'PRET')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg flex items-center gap-1 shadow-sm transition"
                            >
                              <Check className="w-3 h-3" /> Prêt à Servir
                            </button>
                          )}
                          {it.statut_preparation === 'PRET' && (
                            <button
                              onClick={() => handleUpdateStatut(it.id, 'SERVI')}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-black text-white text-[10px] font-black rounded-lg flex items-center gap-1 transition"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Marquer Servi
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Pied de carte : validation globale */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {order.items.length} article(s) à préparer
                  </span>
                  <button
                    onClick={() => {
                      order.items.forEach((it: any) => handleUpdateStatut(it.id, 'PRET'))
                      toast.success('Tout le bon est prêt !', `Table ${order.table} prête à être servie.`)
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition"
                  >
                    <Check className="w-3.5 h-3.5" /> Tout Marquer Prêt
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CuisineBarKDSPage
