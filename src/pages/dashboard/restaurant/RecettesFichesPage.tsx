import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen, Plus, RefreshCw, Scale, DollarSign, PieChart,
  Percent, Trash2, Edit3, ChevronRight, X, AlertCircle, Sparkles
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const RecettesFichesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [fiches, setFiches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlat, setSelectedPlat] = useState<string>('Tous')
  const [showModal, setShowModal] = useState(false)

  const [form, setForm] = useState({
    plat_nom: '',
    ingredient_nom: '',
    quantite_necessaire: 1,
    unite: 'kg',
    cout_unitaire: 0,
    notes: ''
  })

  const defaultFiches = [
    { id: 'f1', plat_nom: 'Poulet Braisé Entier', ingredient_nom: 'Poulet fermier frais', quantite_necessaire: 1, unite: 'pièce', cout_unitaire: 2800, cout_matiere_ligne: 2800 },
    { id: 'f2', plat_nom: 'Poulet Braisé Entier', ingredient_nom: 'Épices & Marinade maquis', quantite_necessaire: 0.15, unite: 'kg', cout_unitaire: 3000, cout_matiere_ligne: 450 },
    { id: 'f3', plat_nom: 'Poulet Braisé Entier', ingredient_nom: 'Huile végétale', quantite_necessaire: 0.05, unite: 'L', cout_unitaire: 1200, cout_matiere_ligne: 60 },
    { id: 'f4', plat_nom: 'Poulet Braisé Entier', ingredient_nom: 'Oignons & Piments frais', quantite_necessaire: 0.20, unite: 'kg', cout_unitaire: 800, cout_matiere_ligne: 160 },
    { id: 'f5', plat_nom: 'Poulet Braisé Entier', ingredient_nom: 'Charbon de bois de cuisson', quantite_necessaire: 0.50, unite: 'kg', cout_unitaire: 300, cout_matiere_ligne: 150 },

    { id: 'f6', plat_nom: 'Cocktail Mojito Passion', ingredient_nom: 'Rhum blanc', quantite_necessaire: 0.05, unite: 'L', cout_unitaire: 6000, cout_matiere_ligne: 300 },
    { id: 'f7', plat_nom: 'Cocktail Mojito Passion', ingredient_nom: 'Sirop de fruit de la passion', quantite_necessaire: 0.03, unite: 'L', cout_unitaire: 4000, cout_matiere_ligne: 120 },
    { id: 'f8', plat_nom: 'Cocktail Mojito Passion', ingredient_nom: 'Feuilles de menthe fraîche', quantite_necessaire: 1, unite: 'botte', cout_unitaire: 100, cout_matiere_ligne: 100 },
    { id: 'f9', plat_nom: 'Cocktail Mojito Passion', ingredient_nom: 'Eau gazeuse & Glace', quantite_necessaire: 0.20, unite: 'L', cout_unitaire: 500, cout_matiere_ligne: 100 },

    { id: 'f10', plat_nom: 'Poisson Braisé Capitaine', ingredient_nom: 'Poisson Capitaine 800g', quantite_necessaire: 0.8, unite: 'kg', cout_unitaire: 4500, cout_matiere_ligne: 3600 },
    { id: 'f11', plat_nom: 'Poisson Braisé Capitaine', ingredient_nom: 'Sauce tomate & garniture', quantite_necessaire: 1, unite: 'portion', cout_unitaire: 400, cout_matiere_ligne: 400 }
  ]

  const loadFiches = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_fiches_techniques')
        .select('*')
        .order('plat_nom')

      if (error) throw error
      if (data && data.length > 0) {
        setFiches(data)
      } else {
        setFiches(defaultFiches)
      }
    } catch (err: any) {
      console.warn('[Recettes] Fallback recettes:', err.message)
      setFiches(defaultFiches)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadFiches()
  }, [loadFiches])

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault()
    const coutLigne = Math.round(Number(form.quantite_necessaire) * Number(form.cout_unitaire))
    try {
      await supabaseTenant('restaurant_fiches_techniques')
        .insert({
          plat_nom: form.plat_nom.trim(),
          ingredient_nom: form.ingredient_nom.trim(),
          quantite_necessaire: Number(form.quantite_necessaire),
          unite: form.unite,
          cout_unitaire: Number(form.cout_unitaire),
          cout_matiere_ligne: coutLigne,
          notes: form.notes
        })

      toast.success('Ingrédient ajouté', `${form.ingredient_nom} ajouté à la recette ${form.plat_nom}.`)
      setShowModal(false)
      loadFiches()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Regroupement par plat pour calculer le coût matière global de chaque plat
  const platsGroupes = useMemo(() => {
    const map: Record<string, { plat: string; ingredients: any[]; coutTotal: number; prixVenteEstime: number }> = {}
    fiches.forEach(f => {
      if (!map[f.plat_nom]) {
        // Estimation du prix de vente basé sur un Food Cost moyen de 35%
        map[f.plat_nom] = {
          plat: f.plat_nom,
          ingredients: [],
          coutTotal: 0,
          prixVenteEstime: 0
        }
      }
      map[f.plat_nom].ingredients.push(f)
      map[f.plat_nom].coutTotal += Number(f.cout_matiere_ligne) || 0
    })

    Object.values(map).forEach(p => {
      // Prix de vente cible pour une marge saine en restauration (coefficient 2.8 à 3.0)
      p.prixVenteEstime = Math.round((p.coutTotal * 2.85) / 500) * 500
    })

    return map
  }, [fiches])

  const platsList = useMemo(() => ['Tous', ...Object.keys(platsGroupes)], [platsGroupes])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-rose-600" />
            Fiches Techniques & Coût Matière
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Recettes, décomposition des ingrédients, calcul du Food Cost / Beverage Cost et rentabilité des portions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadFiches}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition"
            title="Rafraîchir"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nouvel Ingrédient Recette
          </button>
        </div>
      </div>

      {/* Cartes Synthèse Rentabilité par Plat */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.values(platsGroupes).map(p => {
          const foodCostPct = p.prixVenteEstime > 0 ? ((p.coutTotal / p.prixVenteEstime) * 100).toFixed(1) : '0'
          const margeBrute = p.prixVenteEstime - p.coutTotal

          return (
            <div key={p.plat} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-slate-900 text-sm">{p.plat}</h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    {p.ingredients.length} ingrédient(s)
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Coût Matière Direct :</span>
                    <strong className="text-slate-900 font-mono">{fmt(p.coutTotal)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Prix Vente Conseillé :</span>
                    <strong className="text-rose-600 font-mono">{fmt(p.prixVenteEstime)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Marge Brute Estimée :</span>
                    <strong className="text-emerald-600 font-mono">{fmt(margeBrute)}</strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400">Ratio Coût / Vente :</span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold font-mono">
                  {foodCostPct} % Food Cost
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tableau détaillé des fiches techniques */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-black text-slate-900 text-sm">Décomposition Détaillée des Recettes</h3>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {platsList.map(pl => (
              <button
                key={pl}
                onClick={() => setSelectedPlat(pl)}
                className={clsx(
                  'px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap',
                  selectedPlat === pl ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {pl}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Plat / Recette</th>
                <th className="py-3 px-4">Matière Première</th>
                <th className="py-3 px-4 text-center">Quantité Dosée</th>
                <th className="py-3 px-4 text-right">Coût Unitaire</th>
                <th className="py-3 px-4 text-right">Coût Ligne</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fiches
                .filter(f => selectedPlat === 'Tous' || f.plat_nom === selectedPlat)
                .map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-black text-slate-900">{f.plat_nom}</td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{f.ingredient_nom}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                      {f.quantite_necessaire} {f.unite}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500">{fmt(f.cout_unitaire)}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-rose-600">
                      {fmt(f.cout_matiere_ligne)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout Ingrédient */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Ajouter Ingrédient à une Recette</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom du Plat ou Boisson *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Poulet Braisé, Cocktail Mojito, Riz Gras"
                  value={form.plat_nom}
                  onChange={e => setForm({ ...form, plat_nom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Matière Première / Ingrédient *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Poulet entier, Tomate fraîche, Rhum"
                  value={form.ingredient_nom}
                  onChange={e => setForm({ ...form, ingredient_nom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Quantité dosée</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={form.quantite_necessaire}
                    onChange={e => setForm({ ...form, quantite_necessaire: Number(e.target.value) })}
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
                    <option value="kg">kg</option>
                    <option value="g">g (gramme)</option>
                    <option value="L">L (Litre)</option>
                    <option value="cl">cl (centilitre)</option>
                    <option value="pièce">pièce</option>
                    <option value="dose">dose (verre)</option>
                    <option value="portion">portion</option>
                    <option value="botte">botte</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Coût Unitaire Moyen (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="Ex: 2800"
                  value={form.cout_unitaire}
                  onChange={e => setForm({ ...form, cout_unitaire: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold"
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

export default RecettesFichesPage
