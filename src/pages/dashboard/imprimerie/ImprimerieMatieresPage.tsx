// =============================================================================
// GESTIO 229 SaaS — Stock des Matières Premières & Consommables Imprimerie
// Bâches, Vinyles, Encres, Poudres/Films DTF, Textiles, Œillets, PMP & Alertes
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Layers, Plus, RefreshCw, AlertTriangle, ArrowDownRight, ArrowUpRight,
  Search, Edit3, DollarSign, Package, X, Save, CheckCircle2
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { imprimerieService, MatierePremiere } from '../../../services/imprimerieService'

export const ImprimerieMatieresPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const activeSector = sectorSlug || 'imprimerie'

  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('TOUTES')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showMouvementModal, setShowMouvementModal] = useState(false)
  const [selectedMatiere, setSelectedMatiere] = useState<MatierePremiere | null>(null)
  const [mouvementType, setMouvementType] = useState<'entree' | 'sortie'>('entree')
  const [mouvementQty, setMouvementQty] = useState<number>(1)
  const [mouvementNotes, setMouvementNotes] = useState<string>('')

  // Formulaire Matière
  const [form, setForm] = useState<{
    code: string
    nom: string
    categorie: string
    unite: string
    stock_actuel: number
    stock_minimum: number
    cout_moyen: number
    fournisseur_prefere: string
  }>({
    code: '',
    nom: '',
    categorie: 'Supports',
    unite: 'm2',
    stock_actuel: 50,
    stock_minimum: 10,
    cout_moyen: 600,
    fournisseur_prefere: '',
  })

  const notify = (type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else window.alert(msg)
    } catch {
      window.alert(msg)
    }
  }

  const loadMatieres = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const data = await imprimerieService.getMatieres(companyId, activeSector)
      setMatieres(data)
    } catch (err) {
      console.error('Erreur chargement matières:', err)
      notify('error', 'Erreur chargement des matières.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadMatieres()
  }, [loadMatieres])

  const handleOpenAddModal = (mat?: MatierePremiere) => {
    if (mat) {
      setSelectedMatiere(mat)
      setForm({
        code: mat.code,
        nom: mat.nom,
        categorie: mat.categorie,
        unite: mat.unite,
        stock_actuel: mat.stock_actuel,
        stock_minimum: mat.stock_minimum,
        cout_moyen: mat.cout_moyen,
        fournisseur_prefere: mat.fournisseur_prefere || '',
      })
    } else {
      setSelectedMatiere(null)
      setForm({
        code: `MAT-${Date.now().toString().slice(-5)}`,
        nom: '',
        categorie: 'Supports',
        unite: 'm2',
        stock_actuel: 50,
        stock_minimum: 10,
        cout_moyen: 600,
        fournisseur_prefere: '',
      })
    }
    setShowAddModal(true)
  }

  const handleSaveMatiere = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !form.nom.trim()) {
      notify('error', 'Veuillez saisir un nom pour la matière.')
      return
    }

    try {
      await imprimerieService.saveMatiere({
        id: selectedMatiere?.id,
        company_id: companyId,
        sector_slug: activeSector,
        code: form.code,
        nom: form.nom,
        categorie: form.categorie,
        unite: form.unite,
        stock_actuel: form.stock_actuel,
        stock_minimum: form.stock_minimum,
        cout_moyen: form.cout_moyen,
        dernier_cout_achat: form.cout_moyen,
        fournisseur_prefere: form.fournisseur_prefere,
        est_actif: true,
      })
      notify('success', 'Matière première enregistrée avec succès !')
      setShowAddModal(false)
      loadMatieres()
    } catch (err: any) {
      notify('error', err.message || 'Erreur enregistrement matière.')
    }
  }

  const handleMouvementStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMatiere || mouvementQty <= 0) return

    try {
      await imprimerieService.adjustStockMatiere(selectedMatiere.id, mouvementQty, mouvementType, mouvementNotes)
      notify('success', `Mouvement (${mouvementType === 'entree' ? '+ Entrée' : '- Sortie'}) de ${mouvementQty} ${selectedMatiere.unite} enregistré !`)
      setShowMouvementModal(false)
      loadMatieres()
    } catch (err: any) {
      notify('error', err.message || 'Erreur ajustement stock.')
    }
  }

  const filteredMatieres = matieres.filter((m) => {
    const matchSearch = m.nom.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'TOUTES' || m.categorie === filterCat
    return matchSearch && matchCat
  })

  const valeurTotaleStock = matieres.reduce((acc, m) => acc + Number(m.valeur_stock || 0), 0)
  const nbAlertes = matieres.filter((m) => Number(m.stock_actuel) <= Number(m.stock_minimum)).length

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">
      {/* ── Entête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-pink-600" /> Matières Premières & Consommables
          </h1>
          <p className="text-xs text-slate-500">
            Gestion des stocks de rouleaux, encres, vinyles, textiles, chutes et coût moyen pondéré (PMP)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadMatieres} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle Matière
          </button>
        </div>
      </div>

      {/* ── KPI Rapides ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-400">Total Références Matières</p>
          <p className="text-xl font-black text-slate-900 mt-1">{matieres.length}</p>
          <p className="text-[10px] text-slate-400">En catalogue</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-400">Valeur Totale du Stock</p>
          <p className="text-xl font-black text-emerald-700 mt-1">{valeurTotaleStock.toLocaleString('fr-FR')} FCFA</p>
          <p className="text-[10px] text-slate-400">Valorisation PMP</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-400">Alertes Stock Minimum</p>
          <p className={`text-xl font-black mt-1 ${nbAlertes > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{nbAlertes}</p>
          <p className="text-[10px] text-slate-400">Niveaux critiques</p>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une matière (Bâche, Vinyle, Encre, Film...)..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
          />
        </div>

        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
        >
          <option value="TOUTES">Toutes les catégories</option>
          <option value="Supports">Supports (Bâches, Vinyles, Papier)</option>
          <option value="Encres">Encres & Toners</option>
          <option value="Consommables">Consommables (Films, Poudres DTF)</option>
          <option value="Textiles">Textiles & T-shirts</option>
          <option value="Accessoires">Accessoires (Œillets, Spirales)</option>
        </select>
      </div>

      {/* ── Table des matières ── */}
      {filteredMatieres.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs">
          Aucune matière première trouvée.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Désignation</th>
                <th className="text-left px-4 py-3">Catégorie</th>
                <th className="text-center px-4 py-3">Unité</th>
                <th className="text-right px-4 py-3">Stock Actuel</th>
                <th className="text-right px-4 py-3">Seuil Alerte</th>
                <th className="text-right px-4 py-3">Coût Moyen (PMP)</th>
                <th className="text-right px-4 py-3">Valeur Stock</th>
                <th className="text-center px-4 py-3">Mouvements / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMatieres.map((m) => {
                const isCritique = Number(m.stock_actuel) <= Number(m.stock_minimum)
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-500">{m.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{m.nom}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-700">
                        {m.categorie}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{m.unite}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-black text-sm ${isCritique ? 'text-rose-600' : 'text-slate-900'}`}>
                        {m.stock_actuel} {m.unite}
                      </span>
                      {isCritique && (
                        <span className="text-[10px] text-rose-600 font-bold block flex items-center justify-end gap-1">
                          <AlertTriangle className="w-3 h-3" /> Stock bas
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{m.stock_minimum} {m.unite}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{Number(m.cout_moyen).toLocaleString('fr-FR')} F</td>
                    <td className="px-4 py-3 text-right font-black text-emerald-800">{Number(m.valeur_stock).toLocaleString('fr-FR')} F</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedMatiere(m)
                            setMouvementType('entree')
                            setMouvementQty(10)
                            setShowMouvementModal(true)
                          }}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-[10px] transition"
                          title="Entrée de stock"
                        >
                          + Entrée
                        </button>

                        <button
                          onClick={() => {
                            setSelectedMatiere(m)
                            setMouvementType('sortie')
                            setMouvementQty(1)
                            setShowMouvementModal(true)
                          }}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-[10px] transition"
                          title="Sortie de stock"
                        >
                          - Sortie
                        </button>

                        <button
                          onClick={() => handleOpenAddModal(m)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition"
                          title="Modifier"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL NOUVELLE MATIÈRE ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  {selectedMatiere ? 'Modifier la Matière' : 'Nouvelle Matière Première'}
                </h3>
                <p className="text-slate-500">Supports d'impression, encres ou consommables</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMatiere} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Désignation *</label>
                <input
                  type="text"
                  required
                  value={form.nom}
                  onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex: Bâche Frontlit 510g ou Vinyle Blanc Brillant"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catégorie</label>
                  <select
                    value={form.categorie}
                    onChange={(e) => setForm((p) => ({ ...p, categorie: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="Supports">Supports</option>
                    <option value="Encres">Encres</option>
                    <option value="Consommables">Consommables</option>
                    <option value="Textiles">Textiles</option>
                    <option value="Accessoires">Accessoires</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Unité</label>
                  <select
                    value={form.unite}
                    onChange={(e) => setForm((p) => ({ ...p, unite: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="m2">m² (Surface)</option>
                    <option value="ml">Mètre linéaire (ml)</option>
                    <option value="kg">Kilogramme (kg)</option>
                    <option value="l">Litre (l)</option>
                    <option value="feuille">Feuille / Rame</option>
                    <option value="rouleau">Rouleau</option>
                    <option value="piece">Pièce / T-shirt</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Stock Initial</label>
                  <input
                    type="number"
                    value={form.stock_actuel}
                    onChange={(e) => setForm((p) => ({ ...p, stock_actuel: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Seuil Alerte</label>
                  <input
                    type="number"
                    value={form.stock_minimum}
                    onChange={(e) => setForm((p) => ({ ...p, stock_minimum: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Coût Unitaire (F)</label>
                  <input
                    type="number"
                    value={form.cout_moyen}
                    onChange={(e) => setForm((p) => ({ ...p, cout_moyen: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-600">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-black shadow-xs transition">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL AJUSTEMENT MOUVEMENT STOCK ── */}
      {showMouvementModal && selectedMatiere && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  {mouvementType === 'entree' ? 'Entrée de Stock (Achat / Réception)' : 'Sortie de Stock'}
                </h3>
                <p className="text-slate-500 font-bold">{selectedMatiere.nom}</p>
              </div>
              <button onClick={() => setShowMouvementModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMouvementStock} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Quantité ({selectedMatiere.unite}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min={0.01}
                  value={mouvementQty}
                  onChange={(e) => setMouvementQty(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-base font-black text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Motif / Commentaire</label>
                <input
                  type="text"
                  value={mouvementNotes}
                  onChange={(e) => setMouvementNotes(e.target.value)}
                  placeholder="Ex: Réception commande fournisseur ou inventaire"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMouvementModal(false)} className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-600">
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-white rounded-xl font-bold shadow-xs transition ${
                    mouvementType === 'entree' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Valider {mouvementType === 'entree' ? "l'Entrée" : 'la Sortie'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImprimerieMatieresPage
