import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Trash2, Plus, RefreshCw, AlertTriangle, ShieldCheck,
  Scale, DollarSign, Calendar, Filter, X, Search
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useAuthStore } from '../../../store/authStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const PertesGaspillagePage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { user } = useAuthStore()
  const { toast } = useUIStore()

  const [pertes, setPertes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterMotif, setFilterMotif] = useState<string>('TOUS')
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    produit_nom: '',
    categorie: 'Boissons',
    quantite: 1,
    unite: 'bouteille',
    valeur_estimee: 0,
    motif: 'CASSE',
    notes: ''
  })

  const loadPertes = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_pertes_gaspillage')
        .select('*')
        .order('date_constat', { ascending: false })

      if (error) throw error
      setPertes(data || [])
    } catch (err: any) {
      console.error('[Pertes] Erreur chargement pertes:', err.message)
      setPertes([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadPertes()
  }, [loadPertes])

  const handleSavePerte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.produit_nom.trim()) {
      toast.error('Champs requis', 'Veuillez renseigner le nom de l\'article.')
      return
    }

    try {
      await supabaseTenant('restaurant_pertes_gaspillage').insert({
        produit_nom: form.produit_nom.trim(),
        categorie: form.categorie,
        quantite: Number(form.quantite),
        unite: form.unite,
        valeur_estimee: Number(form.valeur_estimee),
        motif: form.motif,
        date_constat: new Date().toISOString().slice(0, 10),
        declare_par: user?.user_metadata?.full_name || user?.email || 'Serveur / Barman',
        valide_par: 'En attente',
        notes: form.notes
      })

      toast.success('Déclaration enregistrée', `Perte de ${form.produit_nom} enregistrée avec succès.`)
      setShowModal(false)
      loadPertes()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const stats = useMemo(() => {
    const totalValeur = pertes.reduce((sum, p) => sum + (Number(p.valeur_estimee) || 0), 0)
    const casseValeur = pertes.filter(p => p.motif === 'CASSE').reduce((sum, p) => sum + (Number(p.valeur_estimee) || 0), 0)
    const offertsValeur = pertes.filter(p => p.motif === 'OFFERT').reduce((sum, p) => sum + (Number(p.valeur_estimee) || 0), 0)
    const erreursValeur = pertes.filter(p => p.motif === 'ERREUR_COMMANDE').reduce((sum, p) => sum + (Number(p.valeur_estimee) || 0), 0)
    return { totalValeur, casseValeur, offertsValeur, erreursValeur }
  }, [pertes])

  const filtered = useMemo(() => {
    return pertes.filter(p => {
      const matchMotif = filterMotif === 'TOUS' || p.motif === filterMotif
      const matchSearch = !search ||
        p.produit_nom.toLowerCase().includes(search.toLowerCase()) ||
        p.declare_par.toLowerCase().includes(search.toLowerCase())
      return matchMotif && matchSearch
    })
  }, [pertes, filterMotif, search])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Trash2 className="w-6 h-6 text-rose-600" />
            Pertes, Casses & Gaspillage
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enregistrement des casses de verres/bouteilles, offerts commerciaux, avaries cuisine et traçabilité des écarts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadPertes} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Déclarer une Perte / Casse
          </button>
        </div>
      </div>

      {/* Cartes KPI Pertes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-rose-50/70 p-4 rounded-3xl border border-rose-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-rose-800 uppercase">Pertes Totales Constatées</span>
          <p className="text-2xl font-black text-rose-600 font-mono mt-1">{fmt(stats.totalValeur)}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Casses (Bouteilles / Vaisselle)</span>
          <p className="text-xl font-black text-slate-900 font-mono mt-1">{fmt(stats.casseValeur)}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Offerts Commerciaux VIP</span>
          <p className="text-xl font-black text-slate-900 font-mono mt-1">{fmt(stats.offertsValeur)}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Erreurs Cuisine / Service</span>
          <p className="text-xl font-black text-slate-900 font-mono mt-1">{fmt(stats.erreursValeur)}</p>
        </div>
      </div>

      {/* Tableau des pertes */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher article, déclarant..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
            {['TOUS', 'CASSE', 'OFFERT', 'ERREUR_COMMANDE', 'PERIME', 'CONSOMMATION_INTERNE'].map(m => (
              <button
                key={m}
                onClick={() => setFilterMotif(m)}
                className={clsx(
                  'px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap',
                  filterMotif === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {m.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">Aucune perte ou casse enregistrée</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">Aucune avarie, bouteille cassée ou produit périmé constaté.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Déclarer une perte
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Article & Catégorie</th>
                  <th className="py-3 px-4 text-center">Quantité</th>
                  <th className="py-3 px-4 text-right">Valeur Perdue</th>
                  <th className="py-3 px-4">Motif Justifié</th>
                  <th className="py-3 px-4">Déclaré Par</th>
                  <th className="py-3 px-4">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono text-slate-500">{p.date_constat}</td>
                    <td className="py-3 px-4">
                      <p className="font-black text-slate-900">{p.produit_nom}</p>
                      <p className="text-[10px] text-slate-400">{p.categorie}</p>
                      {p.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">{p.notes}</p>}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                      {p.quantite} {p.unite}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-rose-600">
                      {fmt(p.valeur_estimee)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-800">
                        {p.motif.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{p.declare_par}</td>
                    <td className="py-3 px-4 font-semibold text-emerald-700">{p.valide_par || 'Validé'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Déclaration de Perte */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Déclarer une Perte / Casse</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePerte} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Désignation de l'Article *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Castel 65cl, Bœuf rôti, Verre à cocktail"
                  value={form.produit_nom}
                  onChange={e => setForm({ ...form, produit_nom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Catégorie</label>
                  <select
                    value={form.categorie}
                    onChange={e => setForm({ ...form, categorie: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                  >
                    <option value="Boissons">Boissons & Bar</option>
                    <option value="Plats">Plats & Cuisine</option>
                    <option value="Ingrédients">Matières premières</option>
                    <option value="Vaisselle">Vaisselle & Verrerie</option>
                    <option value="Emballages">Emballages</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Motif obligatoire</label>
                  <select
                    value={form.motif}
                    onChange={e => setForm({ ...form, motif: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold text-rose-700"
                  >
                    <option value="CASSE">Casse / Bouteille brisée</option>
                    <option value="OFFERT">Offert commercial VIP</option>
                    <option value="ERREUR_COMMANDE">Erreur de commande</option>
                    <option value="PERIME">Périmé / Avarie</option>
                    <option value="CONSOMMATION_INTERNE">Consommation interne</option>
                    <option value="ALTERATION">Mauvaise cuisson / Altération</option>
                    <option value="VOL_PRESUME">Manquant / Vol présumé</option>
                    <option value="AUTRE">Autre motif</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Quantité</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={form.quantite}
                    onChange={e => setForm({ ...form, quantite: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Unité</label>
                  <select
                    value={form.unite}
                    onChange={e => setForm({ ...form, unite: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                  >
                    <option value="bouteille">bouteille</option>
                    <option value="verre">verre</option>
                    <option value="portion">portion</option>
                    <option value="kg">kg</option>
                    <option value="pièce">pièce</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Valeur Estimée Perdue (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  placeholder="Ex: 3000"
                  value={form.valeur_estimee}
                  onChange={e => setForm({ ...form, valeur_estimee: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold text-rose-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Circonstances / Justification</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Bouteille glissée lors de la mise en bac à glaçons..."
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
                  Valider la Déclaration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PertesGaspillagePage
