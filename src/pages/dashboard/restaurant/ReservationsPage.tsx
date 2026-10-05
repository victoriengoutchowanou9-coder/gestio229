import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calendar, Plus, RefreshCw, Users, Clock, CheckCircle2,
  Phone, UserCheck, AlertTriangle, X, Search, Check, Ban
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const ReservationsPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [reservations, setReservations] = useState<any[]>([])
  const [tables, setTables] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    client_nom: '',
    client_tel: '',
    nb_personnes: 2,
    table_numero: '',
    zone: 'Salle principale',
    date_reservation: new Date().toISOString().slice(0, 10),
    heure_reservation: '19:30',
    acompte: 0,
    commentaire: ''
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [resData, tabData] = await Promise.all([
        supabaseTenant('restaurant_reservations').select('*').order('date_reservation', { ascending: false }),
        supabaseTenant('restaurant_tables').select('id, numero_table, zone, capacite, statut')
      ])

      setReservations(resData.data || [])
      if (tabData.data && tabData.data.length > 0) {
        setTables(tabData.data)
      }
    } catch (err: any) {
      console.error('[Reservations] Erreur chargement:', err.message)
      setReservations([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_nom.trim() || !form.client_tel.trim()) {
      toast.error('Champs requis', 'Veuillez renseigner le nom et téléphone du client.')
      return
    }

    try {
      await supabaseTenant('restaurant_reservations').insert({
        client_nom: form.client_nom.trim(),
        client_tel: form.client_tel.trim(),
        nb_personnes: Number(form.nb_personnes),
        table_numero: form.table_numero || 'À assigner',
        zone: form.zone,
        date_reservation: form.date_reservation,
        heure_reservation: form.heure_reservation,
        acompte: Number(form.acompte) || 0,
        commentaire: form.commentaire,
        statut: 'CONFIRMEE'
      })

      // Marquer la table comme réservée si sélectionnée
      if (form.table_numero) {
        await supabaseTenant('restaurant_tables')
          .update({ statut: 'RESERVEE' })
          .eq('numero_table', form.table_numero)
      }

      toast.success('Réservation enregistrée', `Réservation pour ${form.client_nom} confirmée.`)
      setShowModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleUpdateStatut = async (id: string, newStatut: string, tableNum?: string) => {
    try {
      await supabaseTenant('restaurant_reservations')
        .update({ statut: newStatut, updated_at: new Date().toISOString() })
        .eq('id', id)

      // Si le client est installé, mettre la table en OCCUPEE
      if (newStatut === 'INSTALLEE' && tableNum) {
        await supabaseTenant('restaurant_tables')
          .update({ statut: 'OCCUPEE' })
          .eq('numero_table', tableNum)
      }

      toast.success('Statut mis à jour', `Réservation passée en ${newStatut}.`)
      setReservations(prev => prev.map(r => r.id === id ? { ...r, statut: newStatut } : r))
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const filtered = useMemo(() => {
    return reservations.filter(r => {
      const matchStatut = filterStatut === 'TOUS' || r.statut === filterStatut
      const matchSearch = !search ||
        r.client_nom.toLowerCase().includes(search.toLowerCase()) ||
        r.client_tel.includes(search) ||
        (r.table_numero && r.table_numero.toLowerCase().includes(search.toLowerCase()))
      return matchStatut && matchSearch
    })
  }, [reservations, filterStatut, search])

  const getBadge = (st: string) => {
    switch (st) {
      case 'CONFIRMEE': return 'bg-emerald-100 text-emerald-800'
      case 'ARRIVEE': return 'bg-indigo-100 text-indigo-800'
      case 'INSTALLEE': return 'bg-blue-100 text-blue-800'
      case 'RESERVEE': return 'bg-amber-100 text-amber-800'
      case 'TERMINEE': return 'bg-slate-100 text-slate-800'
      case 'ANNULEE':
      case 'NO_SHOW': return 'bg-rose-100 text-rose-800'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-rose-600" />
            Réservations de Tables
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestion du carnet des réservations, affectation de tables et gestion des arrivées
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle Réservation
          </button>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, table..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
          {['TOUS', 'CONFIRMEE', 'ARRIVEE', 'INSTALLEE', 'RESERVEE', 'NO_SHOW'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatut(st)}
              className={clsx(
                'px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap',
                filterStatut === st ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table des réservations */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">Aucune réservation enregistrée</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">Enregistrez les réservations de vos clients pour planifier le service.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nouvelle réservation
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Client & Contact</th>
                <th className="py-3 px-4">Date & Heure</th>
                <th className="py-3 px-4 text-center">Couverts</th>
                <th className="py-3 px-4">Table Assignée</th>
                <th className="py-3 px-4 text-right">Acompte</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3 px-4">
                    <p className="font-black text-slate-900">{r.client_nom}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{r.client_tel}</p>
                    {r.commentaire && <p className="text-[10px] text-rose-600 italic mt-0.5">{r.commentaire}</p>}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">
                    {r.date_reservation} à {r.heure_reservation}
                  </td>
                  <td className="py-3 px-4 text-center font-bold font-mono text-slate-800">
                    {r.nb_personnes} pers.
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-black font-mono bg-slate-100 px-2 py-0.5 rounded-lg text-slate-800">
                      {r.table_numero}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">({r.zone})</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                    {Number(r.acompte) > 0 ? fmt(r.acompte) : '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={clsx('px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider', getBadge(r.statut))}>
                      {r.statut}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.statut !== 'INSTALLEE' && (
                        <button
                          onClick={() => handleUpdateStatut(r.id, 'INSTALLEE', r.table_numero)}
                          title="Installer à table"
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-sm transition"
                        >
                          <Check className="w-3 h-3" /> Installer
                        </button>
                      )}
                      {r.statut === 'CONFIRMEE' && (
                        <button
                          onClick={() => handleUpdateStatut(r.id, 'ARRIVEE')}
                          title="Marquer comme arrivé"
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[10px] transition"
                        >
                          Arrivé
                        </button>
                      )}
                      {r.statut !== 'ANNULEE' && r.statut !== 'NO_SHOW' && (
                        <button
                          onClick={() => handleUpdateStatut(r.id, 'NO_SHOW')}
                          title="Client absent (No-show)"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Modal Nouvelle Réservation */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Nouvelle Réservation de Table</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReservation} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom du Client *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: M. Mensah, Société ABC"
                  value={form.client_nom}
                  onChange={e => setForm({ ...form, client_nom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Téléphone de contact *</label>
                <input
                  type="tel"
                  required
                  placeholder="+229 97 00 00 00"
                  value={form.client_tel}
                  onChange={e => setForm({ ...form, client_tel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={form.date_reservation}
                    onChange={e => setForm({ ...form, date_reservation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Heure</label>
                  <input
                    type="time"
                    required
                    value={form.heure_reservation}
                    onChange={e => setForm({ ...form, heure_reservation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Couverts (personnes)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.nb_personnes}
                    onChange={e => setForm({ ...form, nb_personnes: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Table réservée</label>
                  <input
                    type="text"
                    placeholder="Ex: T 03, VIP 01"
                    value={form.table_numero}
                    onChange={e => setForm({ ...form, table_numero: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Acompte versé (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="0"
                  value={form.acompte}
                  onChange={e => setForm({ ...form, acompte: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold text-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Commentaires & demandes spéciales</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Anniversaire, gâteau à servir, table au calme..."
                  value={form.commentaire}
                  onChange={e => setForm({ ...form, commentaire: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md shadow-rose-600/20"
                >
                  Confirmer la Réservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReservationsPage
