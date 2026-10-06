// =============================================================================
// GESTIO 229 SaaS — Catalogue des Prestations & Fiches de Rentabilité BOM
// Imprimerie & Sérigraphie — Nomenclature Matières, Coûts de Revient & Marges
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Printer, Plus, RefreshCw, Layers, DollarSign, TrendingUp,
  Sliders, Search, Edit3, Trash2, CheckCircle2, AlertTriangle,
  X, Save, FileText, ChevronRight, Eye
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  imprimerieService,
  PrestationImprimerie,
  MatierePremiere,
  PrestationMatiereBOM,
  ModeCalcul
} from '../../../services/imprimerieService'

export const ImprimeriePrestationsPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { company } = useAuthStore()
  const { toast } = useUIStore() as any

  const activeSector = sectorSlug || 'imprimerie'

  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategorie, setSelectedCategorie] = useState('TOUTES')

  // Modals
  const [showModal, setShowModal] = useState(false)
  const [editingPrestation, setEditingPrestation] = useState<PrestationImprimerie | null>(null)
  const [showRentabiliteModal, setShowRentabiliteModal] = useState(false)
  const [viewingPrestation, setViewingPrestation] = useState<PrestationImprimerie | null>(null)

  // Form State
  const [form, setForm] = useState<{
    code: string
    nom: string
    categorie: string
    description: string
    mode_calcul: ModeCalcul
    unite_facturation: string
    prix_vente: number
    prix_minimum: number
    prix_gros: number
    tva_applicable: boolean
    aib_applicable: boolean
    cout_mo_defaut: number
    cout_finition_defaut: number
    cout_autres_defaut: number
    matieresBom: PrestationMatiereBOM[]
  }>({
    code: '',
    nom: '',
    categorie: 'Grand Format',
    description: '',
    mode_calcul: 'm2',
    unite_facturation: 'm2',
    prix_vente: 4000,
    prix_minimum: 3000,
    prix_gros: 3500,
    tva_applicable: false,
    aib_applicable: false,
    cout_mo_defaut: 300,
    cout_finition_defaut: 200,
    cout_autres_defaut: 0,
    matieresBom: [],
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

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [presList, matsList] = await Promise.all([
        imprimerieService.getPrestations(companyId, activeSector),
        imprimerieService.getMatieres(companyId, activeSector),
      ])
      setPrestations(presList)
      setMatieres(matsList)
    } catch (err) {
      console.error('Erreur chargement prestations:', err)
      notify('error', 'Erreur de chargement des prestations.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Ouvrir modal création ou édition
  const handleOpenModal = (pres?: PrestationImprimerie) => {
    if (pres) {
      setEditingPrestation(pres)
      setForm({
        code: pres.code,
        nom: pres.nom,
        categorie: pres.categorie,
        description: pres.description || '',
        mode_calcul: pres.mode_calcul,
        unite_facturation: pres.unite_facturation,
        prix_vente: pres.prix_vente,
        prix_minimum: pres.prix_minimum,
        prix_gros: pres.prix_gros,
        tva_applicable: pres.tva_applicable,
        aib_applicable: pres.aib_applicable,
        cout_mo_defaut: pres.cout_mo_defaut,
        cout_finition_defaut: pres.cout_finition_defaut,
        cout_autres_defaut: pres.cout_autres_defaut,
        matieresBom: pres.matieres_bom || [],
      })
    } else {
      setEditingPrestation(null)
      setForm({
        code: `PRES-${Date.now().toString().slice(-5)}`,
        nom: '',
        categorie: 'Grand Format',
        description: '',
        mode_calcul: 'm2',
        unite_facturation: 'm2',
        prix_vente: 4000,
        prix_minimum: 3000,
        prix_gros: 3500,
        tva_applicable: false,
        aib_applicable: false,
        cout_mo_defaut: 300,
        cout_finition_defaut: 200,
        cout_autres_defaut: 0,
        matieresBom: [],
      })
    }
    setShowModal(true)
  }

  // BOM Management
  const handleAddMatiereBom = () => {
    if (matieres.length === 0) {
      notify('error', 'Aucune matière première enregistrée en stock.')
      return
    }
    const defaultMat = matieres[0]
    setForm((p) => ({
      ...p,
      matieresBom: [
        ...p.matieresBom,
        {
          matiere_id: defaultMat.id,
          matiere_nom: defaultMat.nom,
          quantite_prevue: 1,
          unite: defaultMat.unite,
          cout_unitaire_prevu: defaultMat.cout_moyen || 0,
          cout_total_prevu: defaultMat.cout_moyen || 0,
        },
      ],
    }))
  }

  const handleUpdateMatiereBom = (index: number, field: string, val: any) => {
    setForm((p) => {
      const updated = [...p.matieresBom]
      const current = { ...updated[index], [field]: val }

      if (field === 'matiere_id') {
        const mat = matieres.find((m) => m.id === val)
        if (mat) {
          current.matiere_nom = mat.nom
          current.unite = mat.unite
          current.cout_unitaire_prevu = mat.cout_moyen || 0
        }
      }

      current.cout_total_prevu = Number(current.quantite_prevue || 0) * Number(current.cout_unitaire_prevu || 0)
      updated[index] = current
      return { ...p, matieresBom: updated }
    })
  }

  const handleRemoveMatiereBom = (index: number) => {
    setForm((p) => ({
      ...p,
      matieresBom: p.matieresBom.filter((_, i) => i !== index),
    }))
  }

  // Calcul instantané des coûts dans le formulaire
  const formCoutMatieres = form.matieresBom.reduce((acc, m) => acc + (m.cout_total_prevu || 0), 0)
  const formCoutRevient = formCoutMatieres + form.cout_mo_defaut + form.cout_finition_defaut + form.cout_autres_defaut
  const formMargeTheorique = form.prix_vente - formCoutRevient
  const formTauxMarge = form.prix_vente > 0 ? (formMargeTheorique / form.prix_vente) * 100 : 0

  // Sauvegarde
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !form.nom.trim()) {
      notify('error', 'Veuillez saisir un nom pour la prestation.')
      return
    }

    try {
      await imprimerieService.savePrestation(
        {
          id: editingPrestation?.id,
          company_id: companyId,
          sector_slug: activeSector,
          code: form.code,
          nom: form.nom,
          categorie: form.categorie,
          description: form.description,
          mode_calcul: form.mode_calcul,
          unite_facturation: form.unite_facturation,
          prix_vente: form.prix_vente,
          prix_minimum: form.prix_minimum,
          prix_gros: form.prix_gros,
          tva_applicable: form.tva_applicable,
          aib_applicable: form.aib_applicable,
          cout_mo_defaut: form.cout_mo_defaut,
          cout_finition_defaut: form.cout_finition_defaut,
          cout_autres_defaut: form.cout_autres_defaut,
          est_actif: true,
        },
        form.matieresBom
      )
      notify('success', 'Prestation enregistrée avec sa nomenclature BOM !')
      setShowModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur enregistrement.')
    }
  }

  const filteredPrestations = prestations.filter((p) => {
    const matchSearch = p.nom.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategorie === 'TOUTES' || p.categorie === selectedCategorie
    return matchSearch && matchCat
  })

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">
      {/* ── Entête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <Printer className="w-6 h-6 text-pink-600" /> Catalogue des Prestations & BOM
          </h1>
          <p className="text-xs text-slate-500">
            Définition des prix au m², à l'unité, recettes de matières et marges prévisionnelles
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle Prestation
          </button>
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
            placeholder="Rechercher par nom de prestation, code..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
          />
        </div>

        <select
          value={selectedCategorie}
          onChange={(e) => setSelectedCategorie(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
        >
          <option value="TOUTES">Toutes les catégories</option>
          <option value="Grand Format">Grand Format (Bâches, Vinyles)</option>
          <option value="Papeterie">Papeterie (Flyers, Affiches, Cartes)</option>
          <option value="Textile / Sérigraphie">Textile / Sérigraphie / DTF</option>
          <option value="Finition">Finition & Façonnage</option>
          <option value="Graphisme">Graphisme & B.A.T.</option>
        </select>
      </div>

      {/* ── Liste des Prestations ── */}
      {filteredPrestations.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs">
          Aucune prestation enregistrée.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPrestations.map((p) => {
            const marge = p.marge_theorique || 0
            const taux = p.taux_marge_theorique || 0
            const coutRevient = p.cout_revient_theorique || 0
            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-pink-300 transition-all p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-500 text-[11px]">{p.code}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-700">
                      {p.categorie}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm mt-1">{p.nom}</h3>
                  <p className="text-[11px] text-slate-400">
                    Mode : <strong className="text-slate-600 uppercase">{p.mode_calcul}</strong> • Unité : {p.unite_facturation}
                  </p>

                  {/* Analyse Coût & Marge */}
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Prix de Vente :</span>
                      <span className="font-black text-slate-900">{p.prix_vente.toLocaleString('fr-FR')} F</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coût de Revient :</span>
                      <span className="font-semibold text-rose-600">{coutRevient.toLocaleString('fr-FR')} F</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-700 font-bold">Marge Brute :</span>
                      <span className="font-black text-emerald-700">
                        {marge.toLocaleString('fr-FR')} F ({taux.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  {/* Matières liées */}
                  {p.matieres_bom && p.matieres_bom.length > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700">{p.matieres_bom.length} matière(s) BOM : </span>
                      {p.matieres_bom.map((b) => b.matiere_nom).join(', ')}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setViewingPrestation(p)
                      setShowRentabiliteModal(true)
                    }}
                    className="text-xs font-bold text-pink-600 hover:underline flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> Fiche Rentabilité
                  </button>

                  <button
                    onClick={() => handleOpenModal(p)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                    title="Modifier la prestation"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL NOUVELLE / ÉDITION PRESTATION + BOM ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 my-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {editingPrestation ? 'Modifier la Prestation' : 'Nouvelle Prestation & Nomenclature (BOM)'}
                </h3>
                <p className="text-xs text-slate-500">Configuration des prix, unités et consommation théorique</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nom de la prestation *</label>
                  <input
                    type="text"
                    required
                    value={form.nom}
                    onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                    placeholder="Ex: Impression Bâche 510g"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catégorie</label>
                  <select
                    value={form.categorie}
                    onChange={(e) => setForm((p) => ({ ...p, categorie: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="Grand Format">Grand Format</option>
                    <option value="Papeterie">Papeterie</option>
                    <option value="Textile / Sérigraphie">Textile / Sérigraphie / DTF</option>
                    <option value="Finition">Finition & Façonnage</option>
                    <option value="Graphisme">Graphisme</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mode de Calcul</label>
                  <select
                    value={form.mode_calcul}
                    onChange={(e) => setForm((p) => ({ ...p, mode_calcul: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="m2">Au m² (Surface)</option>
                    <option value="unite">À l'unité (Pièce)</option>
                    <option value="page">À la page</option>
                    <option value="heure">À l'heure</option>
                    <option value="forfait">Forfait fixe</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Prix de Vente (FCFA) *</label>
                  <input
                    type="number"
                    required
                    value={form.prix_vente}
                    onChange={(e) => setForm((p) => ({ ...p, prix_vente: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Prix Minimum (FCFA)</label>
                  <input
                    type="number"
                    value={form.prix_minimum}
                    onChange={(e) => setForm((p) => ({ ...p, prix_minimum: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Nomenclature Matières (BOM) */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 uppercase tracking-wide">
                    Matières Premières Associées (BOM)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddMatiereBom}
                    className="text-xs font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter une matière
                  </button>
                </div>

                {form.matieresBom.length === 0 ? (
                  <p className="text-slate-400 italic py-2">
                    Aucune matière liée. Le coût matières sera calculé à 0 F.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {form.matieresBom.map((m, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <select
                            value={m.matiere_id}
                            onChange={(e) => handleUpdateMatiereBom(idx, 'matiere_id', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                          >
                            {matieres.map((mat) => (
                              <option key={mat.id} value={mat.id}>{mat.nom} ({mat.unite})</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            step="0.01"
                            value={m.quantite_prevue}
                            onChange={(e) => handleUpdateMatiereBom(idx, 'quantite_prevue', Number(e.target.value))}
                            placeholder="Quantité"
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                          />
                        </div>
                        <div className="col-span-3 text-right font-black text-slate-800">
                          {m.cout_total_prevu?.toLocaleString('fr-FR')} F
                        </div>
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveMatiereBom(idx)}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Autres Frais (Main d'œuvre & Finition) */}
              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Main-d'œuvre (F)</label>
                  <input
                    type="number"
                    value={form.cout_mo_defaut}
                    onChange={(e) => setForm((p) => ({ ...p, cout_mo_defaut: Number(e.target.value) }))}
                    className="w-full px-2 py-1 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Finition / Façonnage (F)</label>
                  <input
                    type="number"
                    value={form.cout_finition_defaut}
                    onChange={(e) => setForm((p) => ({ ...p, cout_finition_defaut: Number(e.target.value) }))}
                    className="w-full px-2 py-1 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Autres frais (F)</label>
                  <input
                    type="number"
                    value={form.cout_autres_defaut}
                    onChange={(e) => setForm((p) => ({ ...p, cout_autres_defaut: Number(e.target.value) }))}
                    className="w-full px-2 py-1 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Résumé de Calcul Automatique */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between font-bold text-xs">
                <div>
                  <span className="text-slate-600 block">Coût Revient Estimé : {formCoutRevient.toLocaleString('fr-FR')} F</span>
                  <span className="text-[10px] text-slate-400">Matières + MO + Finition</span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-800 text-sm block">Marge : {formMargeTheorique.toLocaleString('fr-FR')} F</span>
                  <span className="text-emerald-600 text-[10px] font-black">Taux : {formTauxMarge.toFixed(1)}%</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-black shadow-xs transition"
                >
                  Enregistrer la Prestation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL FICHE DE RENTABILITÉ D'UNE PRESTATION ── */}
      {showRentabiliteModal && viewingPrestation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">{viewingPrestation.nom}</h3>
                <p className="text-slate-400 font-mono text-[11px]">{viewingPrestation.code}</p>
              </div>
              <button onClick={() => setShowRentabiliteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 p-3 bg-slate-50 rounded-2xl">
              <div className="flex justify-between">
                <span className="text-slate-500">Prix de vente unitaire :</span>
                <span className="font-black text-slate-900">{viewingPrestation.prix_vente.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Coût matières théorique :</span>
                <span className="font-bold text-slate-700">
                  {viewingPrestation.matieres_bom?.reduce((acc, m) => acc + m.cout_total_prevu, 0).toLocaleString('fr-FR')} F
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Main-d'œuvre :</span>
                <span className="font-bold text-slate-700">{viewingPrestation.cout_mo_defaut.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Finition :</span>
                <span className="font-bold text-slate-700">{viewingPrestation.cout_finition_defaut.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                <span className="text-slate-600">Coût de revient total :</span>
                <span className="text-rose-600">{viewingPrestation.cout_revient_theorique?.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-black text-sm">
                <span className="text-slate-800">Marge Brute :</span>
                <span className="text-emerald-700">{viewingPrestation.marge_theorique?.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="text-right text-[10px] text-emerald-600 font-black">
                Taux de marge : {viewingPrestation.taux_marge_theorique?.toFixed(1)}%
              </div>
            </div>

            <button
              onClick={() => setShowRentabiliteModal(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-slate-700 transition"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImprimeriePrestationsPage
