import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, Plus, RefreshCw, Calendar, Users, DollarSign,
  TrendingUp, Award, Music, X, Search
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const EvenementsPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [evenements, setEvenements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    titre: '',
    type_evenement: 'Soirée',
    date_evenement: new Date().toISOString().slice(0, 10),
    heure_debut: '20:00',
    heure_fin: '03:00',
    nb_participants: 50,
    budget_prevu: 100000,
    recettes_realisees: 0,
    depenses_realisees: 0,
    notes: ''
  })

  const loadEvenements = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_evenements')
        .select('*')
        .order('date_evenement', { ascending: false })

      if (error) throw error
      setEvenements(data || [])
    } catch (err: any) {
      console.error('[Evenements] Erreur chargement:', err.message)
      setEvenements([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadEvenements()
  }, [loadEvenements])

  const handleSaveEvenement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.titre.trim()) {
      toast.error('Champs requis', 'Veuillez renseigner le titre de l\'événement.')
      return
    }

    const rec = Number(form.recettes_realisees) || 0
    const dep = Number(form.depenses_realisees) || 0
    const net = rec - dep

    try {
      await supabaseTenant('restaurant_evenements').insert({
        titre: form.titre.trim(),
        type_evenement: form.type_evenement,
        date_evenement: form.date_evenement,
        heure_debut: form.heure_debut,
        heure_fin: form.heure_fin,
        nb_participants: Number(form.nb_participants) || 0,
        budget_prevu: Number(form.budget_prevu) || 0,
        recettes_realisees: rec,
        depenses_realisees: dep,
        benefice_net: net,
        statut: 'PROGRAMME',
        notes: form.notes
      })

      toast.success('Événement programmé', `${form.titre} a été enregistré.`)
      setShowModal(false)
      loadEvenements()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const stats = useMemo(() => {
    const totalRecettes = evenements.reduce((sum, e) => sum + (Number(e.recettes_realisees) || 0), 0)
    const totalDepenses = evenements.reduce((sum, e) => sum + (Number(e.depenses_realisees) || 0), 0)
    const totalBenefice = totalRecettes - totalDepenses
    return { totalRecettes, totalDepenses, totalBenefice }
  }, [evenements])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Music className="w-6 h-6 text-rose-600" />
            Événements & Soirées Thématiques
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Programmation de soirées, anniversaires, concerts, karaokés et calcul de rentabilité directe
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadEvenements} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Programmer un Événement
          </button>
        </div>
      </div>

      {/* Cartes Rentabilité Événements */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Recettes Totales Événements</span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">{fmt(stats.totalRecettes)}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Dépenses Réalisées (Artistes, Déco)</span>
          <p className="text-xl font-black text-rose-600 font-mono mt-1">{fmt(stats.totalDepenses)}</p>
        </div>
        <div className="bg-emerald-50/60 p-5 rounded-3xl border border-emerald-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-emerald-800 uppercase">Bénéfice Net Réalisé</span>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">{fmt(stats.totalBenefice)}</p>
        </div>
      </div>

      {/* Liste des Événements */}
      {evenements.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
          <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">Aucun événement programmé</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Créez votre première soirée ou prestation pour suivre sa rentabilité.</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Programmer un événement
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evenements.map((e) => {
            const benef = Number(e.benefice_net) || (Number(e.recettes_realisees) - Number(e.depenses_realisees))

            return (
              <div key={e.id} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 uppercase">
                      {e.type_evenement}
                    </span>
                    <span className={clsx(
                      'text-[10px] font-black px-2 py-0.5 rounded-full',
                      e.statut === 'TERMINE' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                    )}>
                      {e.statut}
                    </span>
                  </div>

                  <h3 className="font-black text-slate-900 text-base">{e.titre}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    📅 {e.date_evenement} • De {e.heure_debut} à {e.heure_fin} • ~{e.nb_participants} participants
                  </p>
                  {e.notes && <p className="text-xs text-slate-500 italic mt-2 bg-slate-50 p-2.5 rounded-xl">{e.notes}</p>}
                </div>

                {/* Bilan Financier Événement */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Recettes</span>
                    <p className="font-mono font-black text-slate-900">{fmt(Number(e.recettes_realisees) || 0)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Dépenses</span>
                    <p className="font-mono font-bold text-rose-600">{fmt(Number(e.depenses_realisees) || 0)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold block">Bénéfice</span>
                    <p className="font-mono font-black text-emerald-600">{fmt(benef)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Programmer Événement */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Programmer un Événement</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvenement} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Titre de l'événement *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Soirée Karaoké & Grillades, Concert Acoustique"
                  value={form.titre}
                  onChange={e => setForm({ ...form, titre: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Type d'événement</label>
                  <select
                    value={form.type_evenement}
                    onChange={e => setForm({ ...form, type_evenement: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                  >
                    <option value="Karaoké">Karaoké</option>
                    <option value="Anniversaire">Anniversaire</option>
                    <option value="Concert">Concert / Live</option>
                    <option value="Soirée_VIP">Soirée VIP</option>
                    <option value="Mariage">Mariage</option>
                    <option value="Privé">Privatisation</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={form.date_evenement}
                    onChange={e => setForm({ ...form, date_evenement: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Heure début</label>
                  <input
                    type="time"
                    value={form.heure_debut}
                    onChange={e => setForm({ ...form, heure_debut: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Heure fin</label>
                  <input
                    type="time"
                    value={form.heure_fin}
                    onChange={e => setForm({ ...form, heure_fin: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Capacité attendue</label>
                  <input
                    type="number"
                    min="1"
                    value={form.nb_participants}
                    onChange={e => setForm({ ...form, nb_participants: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Budget prévisionnel (F)</label>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={form.budget_prevu}
                    onChange={e => setForm({ ...form, budget_prevu: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes & organisation</label>
                <textarea
                  rows={2}
                  placeholder="Ex: DJ invité, sono à vérifier, pack boissons prépayé..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
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
                  Enregistrer l'Événement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default EvenementsPage
