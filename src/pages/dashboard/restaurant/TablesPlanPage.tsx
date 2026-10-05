import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Utensils, Plus, RefreshCw, Users, Clock, CheckCircle2,
  DollarSign, Sparkles, AlertTriangle, Eye, ChevronRight, X,
  LayoutGrid, Layers, UserCheck, Search, ShoppingBag
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useAuthStore } from '../../../store/authStore'
import { formatFCFA } from '../../../utils/tax'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const TablesPlanPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { user } = useAuthStore()
  const { toast } = useUIStore()
  const navigate = useNavigate()

  const [tables, setTables] = useState<any[]>([])
  const [zones, setZones] = useState<string[]>(['Toutes', 'Salle principale', 'Terrasse', 'VIP', 'Bar', 'Patio'])
  const [selectedZone, setSelectedZone] = useState<string>('Toutes')
  const [loading, setLoading] = useState(true)

  // Modale création/édition de table
  const [showTableModal, setShowTableModal] = useState(false)
  const [editingTable, setEditingTable] = useState<any | null>(null)
  const [tableForm, setTableForm] = useState({
    numero_table: '',
    nom: '',
    zone: 'Salle principale',
    capacite: 4,
    statut: 'LIBRE'
  })

  // Modale détails table rapide
  const [activeTableDetail, setActiveTableDetail] = useState<any | null>(null)

  const loadTables = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_tables')
        .select('*')
        .order('numero_table')

      if (error) throw error
      if (data) {
        setTables(data)
        const uniqueZones = Array.from(new Set(data.map((t: any) => t.zone).filter(Boolean)))
        if (uniqueZones.length > 0) {
          setZones(['Toutes', ...uniqueZones])
        }
      } else {
        setTables([])
      }
    } catch (err: any) {
      console.error('[TablesPlanPage] Erreur chargement tables:', err.message)
      setTables([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadTables()
  }, [loadTables])

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tableForm.numero_table.trim()) {
      toast.error('Erreur', 'Veuillez saisir le numéro de table.')
      return
    }

    try {
      if (editingTable) {
        await supabaseTenant('restaurant_tables')
          .update({
            numero_table: tableForm.numero_table,
            nom: tableForm.nom,
            zone: tableForm.zone,
            capacite: Number(tableForm.capacite),
            statut: tableForm.statut,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTable.id)
        toast.success('Table mise à jour', `La table ${tableForm.numero_table} a été modifiée.`)
      } else {
        await supabaseTenant('restaurant_tables')
          .insert({
            numero_table: tableForm.numero_table,
            nom: tableForm.nom,
            zone: tableForm.zone,
            capacite: Number(tableForm.capacite),
            statut: 'LIBRE',
            montant_actuel: 0
          })
        toast.success('Table créée', `La table ${tableForm.numero_table} est prête.`)
      }
      setShowTableModal(false)
      setEditingTable(null)
      loadTables()
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'enregistrer la table.')
    }
  }

  const handleUpdateStatus = async (tableId: string, newStatus: string) => {
    try {
      await supabaseTenant('restaurant_tables')
        .update({ statut: newStatus, updated_at: new Date().toISOString() })
        .eq('id', tableId)
      toast.success('Statut changé', `Table passée en ${newStatus}.`)
      setTables(prev => prev.map(t => t.id === tableId ? { ...t, statut: newStatus } : t))
      if (activeTableDetail?.id === tableId) {
        setActiveTableDetail((prev: any) => ({ ...prev, statut: newStatus }))
      }
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const filteredTables = useMemo(() => {
    if (selectedZone === 'Toutes') return tables
    return tables.filter(t => t.zone === selectedZone)
  }, [tables, selectedZone])

  const stats = useMemo(() => {
    const total = tables.length
    const occup = tables.filter(t => t.statut === 'OCCUPEE').length
    const libres = tables.filter(t => t.statut === 'LIBRE').length
    const reservees = tables.filter(t => t.statut === 'RESERVEE').length
    const caEnCours = tables.reduce((acc, t) => acc + (Number(t.montant_actuel) || 0), 0)
    return { total, occup, libres, reservees, caEnCours }
  }, [tables])

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'OCCUPEE':
        return { label: 'Occupée', bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-400', glow: 'shadow-rose-500/20' }
      case 'LIBRE':
        return { label: 'Libre', bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-400', glow: 'shadow-emerald-500/20' }
      case 'RESERVEE':
        return { label: 'Réservée', bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-400', glow: 'shadow-amber-500/20' }
      case 'EN_PREPARATION':
        return { label: 'Préparation', bg: 'bg-indigo-500', text: 'text-white', border: 'border-indigo-400', glow: 'shadow-indigo-500/20' }
      case 'EN_ATTENTE_PAIEMENT':
        return { label: 'Addition demandée', bg: 'bg-purple-600', text: 'text-white', border: 'border-purple-400', glow: 'shadow-purple-500/20' }
      default:
        return { label: statut, bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-400', glow: '' }
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Utensils className="w-6 h-6 text-rose-600" />
            Plan de Salle & Tables
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestion visuelle des tables, suivi des additions en cours, réservations et zones de service
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTables}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => {
              setEditingTable(null)
              setTableForm({ numero_table: '', nom: '', zone: 'Salle principale', capacite: 4, statut: 'LIBRE' })
              setShowTableModal(true)
            }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle Table
          </button>
        </div>
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Tables</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-emerald-50/60 p-4 rounded-3xl border border-emerald-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-emerald-800 uppercase">Tables Libres</span>
          <p className="text-2xl font-black text-emerald-700 mt-1">{stats.libres}</p>
        </div>
        <div className="bg-rose-50/60 p-4 rounded-3xl border border-rose-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-rose-800 uppercase">Tables Occupées</span>
          <p className="text-2xl font-black text-rose-600 mt-1">{stats.occup}</p>
        </div>
        <div className="bg-amber-50/60 p-4 rounded-3xl border border-amber-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-amber-800 uppercase">Réservations</span>
          <p className="text-2xl font-black text-amber-700 mt-1">{stats.reservees}</p>
        </div>
        <div className="bg-indigo-50/60 p-4 rounded-3xl border border-indigo-200/80 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-indigo-800 uppercase">Additions En Cours</span>
          <p className="text-xl font-black text-indigo-700 font-mono mt-1">{fmt(stats.caEnCours)}</p>
        </div>
      </div>

      {/* Filtres par Zones */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {zones.map(z => (
          <button
            key={z}
            onClick={() => setSelectedZone(z)}
            className={clsx(
              'px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition shadow-sm',
              selectedZone === z
                ? 'bg-slate-900 text-white shadow-slate-900/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            )}
          >
            {z}
          </button>
        ))}
      </div>

      {/* Grille Visuelle des Tables */}
      {filteredTables.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
          <Utensils className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">Aucune table enregistrée</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Créez votre première table pour organiser votre salle.</p>
          <button
            onClick={() => {
              setEditingTable(null)
              setTableForm({ numero_table: '', nom: '', zone: 'Salle principale', capacite: 4, statut: 'LIBRE' })
              setShowTableModal(true)
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Ajouter une table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTables.map((t) => {
            const badge = getStatusBadge(t.statut)
            const montant = Number(t.montant_actuel) || 0

            return (
              <div
                key={t.id}
                onClick={() => setActiveTableDetail(t)}
                className={clsx(
                  'group relative bg-white rounded-3xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer select-none flex flex-col justify-between min-h-[170px]',
                  t.statut === 'OCCUPEE' ? 'border-rose-300 ring-2 ring-rose-500/10' : 'border-slate-200 hover:border-slate-400'
                )}
              >
                <div>
                  {/* En-tête carte */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xs text-slate-800 font-mono">
                        {t.numero_table}
                      </span>
                      <div>
                        <h3 className="font-black text-sm text-slate-900 leading-tight">{t.nom || t.numero_table}</h3>
                        <p className="text-[10px] text-slate-400 font-semibold">{t.zone}</p>
                      </div>
                    </div>
                    <span className={clsx('px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase', badge.bg, badge.text)}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Détails : capacité et serveur */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-3">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {t.capacite} places
                    </span>
                    {t.serveur_assigne && (
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <UserCheck className="w-3.5 h-3.5 text-rose-500" />
                        {t.serveur_assigne}
                      </span>
                    )}
                  </div>
                </div>

                {/* Addition en cours */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Note actuelle</span>
                    <p className={clsx('font-mono font-black text-sm', montant > 0 ? 'text-rose-600' : 'text-slate-400')}>
                      {montant > 0 ? fmt(montant) : '0 FCFA'}
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 group-hover:bg-rose-50 text-slate-400 group-hover:text-rose-600 rounded-xl transition">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Détails & Actions Table */}
      {activeTableDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black font-mono">
                  {activeTableDetail.numero_table}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">{activeTableDetail.nom || activeTableDetail.numero_table}</h3>
                  <p className="text-xs text-slate-400">{activeTableDetail.zone} • {activeTableDetail.capacite} couverts</p>
                </div>
              </div>
              <button onClick={() => setActiveTableDetail(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Note & Montant */}
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Montant Addition En Cours</span>
                <p className="text-2xl font-black text-rose-600 font-mono mt-0.5">
                  {fmt(Number(activeTableDetail.montant_actuel) || 0)}
                </p>
              </div>
              <button
                onClick={() => {
                  navigate(`/app/${sectorSlug}/vente-pos?table=${activeTableDetail.numero_table}`)
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition"
              >
                <ShoppingBag className="w-4 h-4" /> Ouvrir Commande
              </button>
            </div>

            {/* Changement rapide de statut */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">Changer le statut de la table :</label>
              <div className="grid grid-cols-3 gap-2">
                {['LIBRE', 'OCCUPEE', 'RESERVEE', 'EN_PREPARATION', 'EN_ATTENTE_PAIEMENT', 'NETTOYAGE'].map(st => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(activeTableDetail.id, st)}
                    className={clsx(
                      'py-2 px-2 rounded-xl text-xs font-bold border transition',
                      activeTableDetail.statut === st
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                    )}
                  >
                    {st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setEditingTable(activeTableDetail)
                  setTableForm({
                    numero_table: activeTableDetail.numero_table,
                    nom: activeTableDetail.nom || '',
                    zone: activeTableDetail.zone || 'Salle principale',
                    capacite: activeTableDetail.capacite || 4,
                    statut: activeTableDetail.statut
                  })
                  setActiveTableDetail(null)
                  setShowTableModal(true)
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                Modifier les infos de la table
              </button>
              <button
                onClick={() => setActiveTableDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajout / Modification Table */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">
                {editingTable ? 'Modifier la Table' : 'Ajouter une Nouvelle Table'}
              </h3>
              <button onClick={() => setShowTableModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Numéro / Code Table *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: T 07, VIP 02, BAR 03"
                  value={tableForm.numero_table}
                  onChange={e => setTableForm({ ...tableForm, numero_table: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom / Description</label>
                <input
                  type="text"
                  placeholder="Ex: Table vue piscine, Coin terrasse"
                  value={tableForm.nom}
                  onChange={e => setTableForm({ ...tableForm, nom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Zone de Salle</label>
                  <select
                    value={tableForm.zone}
                    onChange={e => setTableForm({ ...tableForm, zone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                  >
                    <option value="Salle principale">Salle principale</option>
                    <option value="Terrasse">Terrasse</option>
                    <option value="VIP">VIP</option>
                    <option value="Bar">Bar</option>
                    <option value="Patio">Patio</option>
                    <option value="Jardin">Jardin</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Capacité (couverts)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={tableForm.capacite}
                    onChange={e => setTableForm({ ...tableForm, capacite: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTableModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md shadow-rose-600/20"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TablesPlanPage
