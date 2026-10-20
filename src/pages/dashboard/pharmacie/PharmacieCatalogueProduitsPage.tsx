// =============================================================================
// GESTIO 229 — CATALOGUE PHARMACEUTIQUE & FICHES PRODUITS
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  Pill,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  ThermometerSnowflake,
  Shield,
  FileText,
  AlertCircle,
  Edit2,
  Layers,
  Building2,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieProduit,
  ClasseReglementaire,
  ConditionConservation,
} from '../../../services/pharmacieService'

export default function PharmacieCatalogueProduitsPage() {
  const { currentCompany } = useTenant()
  const companyId = currentCompany?.id || ''

  const [produits, setProduits] = useState<PharmacieProduit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClasse, setFilterClasse] = useState<string>('TOUS')
  const [filterConservation, setFilterConservation] = useState<string>('TOUS')

  // Modal création / édition
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduit, setEditingProduit] = useState<Partial<PharmacieProduit> | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [messageSucces, setMessageSucces] = useState('')

  const chargerProduits = async () => {
    try {
      setLoading(true)
      const data = await pharmacieService.getProduits(companyId)
      setProduits(data)
    } catch (err) {
      console.error('Erreur chargement catalogue:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerProduits()
  }, [companyId])

  const handleOpenModal = (prod?: PharmacieProduit) => {
    if (prod) {
      setEditingProduit({ ...prod })
    } else {
      setEditingProduit({
        nom_commercial: '',
        dci: '',
        forme_galenique: 'Comprimé',
        dosage: '',
        conditionnement: 'Boîte',
        unite_vente: 'Boîte',
        laboratoire_fabricant: '',
        famille_therapeutique: '',
        classe_tableau: 'OTC',
        necessite_ordonnance: false,
        conditions_conservation: 'AMBIANTE',
        prix_achat_ht: 0,
        prix_vente_ttc: 0,
        taux_remboursement_ss: 80,
        stock_minimum_alerte: 10,
        stock_securite: 5,
        est_generique: false,
        est_actif: true,
      })
    }
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduit?.nom_commercial) return
    try {
      setSaveLoading(true)
      await pharmacieService.saveProduit(companyId, editingProduit)
      setModalOpen(false)
      setMessageSucces('Produit pharmaceutique enregistré avec succès.')
      setTimeout(() => setMessageSucces(''), 4000)
      chargerProduits()
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l’enregistrement')
    } finally {
      setSaveLoading(false)
    }
  }

  const filteredProduits = produits.filter((p) => {
    const matchSearch =
      p.nom_commercial.toLowerCase().includes(search.toLowerCase()) ||
      p.dci.toLowerCase().includes(search.toLowerCase()) ||
      (p.code_cip_acl || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.laboratoire_fabricant || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.famille_therapeutique || '').toLowerCase().includes(search.toLowerCase())

    const matchClasse = filterClasse === 'TOUS' || p.classe_tableau === filterClasse
    const matchConservation = filterConservation === 'TOUS' || p.conditions_conservation === filterConservation

    return matchSearch && matchClasse && matchConservation
  })

  const getClasseBadge = (classe: ClasseReglementaire) => {
    switch (classe) {
      case 'LISTE_I':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">Cadre Rouge - Liste I (Ordonnance)</span>
      case 'LISTE_II':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">Cadre Vert - Liste II</span>
      case 'STUPEFIANT':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 border border-purple-400">Stupéfiant (Réglementé)</span>
      case 'OTC':
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Vente Libre (OTC)</span>
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <Pill className="w-4 h-4" /> Référentiel Médicaments & Produits de Santé
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Catalogue Pharmaceutique & Fiches Produits
          </h1>
          <p className="text-sm text-slate-500">
            Dénomination Commune Internationale (DCI), forme, dosage, classe réglementaire, conservation et conditionnement.
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition"
        >
          <Plus className="w-4 h-4" /> Nouveau Produit
        </button>
      </div>

      {messageSucces && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {messageSucces}
        </div>
      )}

      {/* Barre de Recherche & Filtres */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par Nom commercial, DCI (ex: Paracétamol), code CIP, fabricant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterClasse}
            onChange={(e) => setFilterClasse(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none"
          >
            <option value="TOUS">Toutes les classes</option>
            <option value="OTC">OTC / Vente libre</option>
            <option value="LISTE_I">Liste I (Cadre Rouge)</option>
            <option value="LISTE_II">Liste II (Cadre Vert)</option>
            <option value="STUPEFIANT">Stupéfiants</option>
          </select>

          <select
            value={filterConservation}
            onChange={(e) => setFilterConservation(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none"
          >
            <option value="TOUS">Toute conservation</option>
            <option value="AMBIANTE">Température ambiante</option>
            <option value="FROID_2_8">Chaîne du froid (2°C - 8°C)</option>
            <option value="ABRI_LUMIERE">À l'abri de la lumière</option>
          </select>
        </div>
      </div>

      {/* Tableau du Catalogue */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Produit & DCI</th>
                <th className="px-4 py-3">Forme & Dosage</th>
                <th className="px-4 py-3">Réglementation</th>
                <th className="px-4 py-3">Conservation</th>
                <th className="px-4 py-3 text-right">Prix Achat HT</th>
                <th className="px-4 py-3 text-right">Prix Vente TTC</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Chargement du catalogue pharmaceutique...
                  </td>
                </tr>
              ) : produits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="max-w-md mx-auto space-y-2">
                      <Pill className="w-10 h-10 text-slate-300 mx-auto" />
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-base">Aucun médicament dans le catalogue</div>
                      <p className="text-xs text-slate-500">
                        Votre catalogue officinal est actuellement vide. Ajoutez vos premiers médicaments et dispositifs médicaux pour démarrer la gestion.
                      </p>
                      <button
                        onClick={() => handleOpenModal()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow mt-2"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ajouter un Médicament
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredProduits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aucun médicament ou produit de santé correspondant aux critères de recherche.
                  </td>
                </tr>
              ) : (
                filteredProduits.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        {prod.nom_commercial}
                        {prod.est_generique && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                            Générique
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                        DCI : {prod.dci || '—'}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>CIP: {prod.code_cip_acl || '—'}</span>
                        <span>• Labo: {prod.laboratoire_fabricant || '—'}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {prod.forme_galenique} {prod.dosage}
                      </div>
                      <div className="text-xs text-slate-500">
                        {prod.conditionnement} ({prod.unite_vente})
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div>{getClasseBadge(prod.classe_tableau)}</div>
                        {prod.necessite_ordonnance && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Ordonnance Obligatoire
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {prod.conditions_conservation === 'FROID_2_8' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                          <ThermometerSnowflake className="w-3.5 h-3.5" /> 2°C - 8°C (Frigo)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          Température ambiante
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {(prod.prix_achat_ht || 0).toLocaleString('fr-FR')} F
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {(prod.prix_vente_ttc || 0).toLocaleString('fr-FR')} F
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleOpenModal(prod)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition"
                        title="Modifier la fiche"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Fiche Produit Pharmaceutique */}
      {modalOpen && editingProduit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 my-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Pill className="w-5 h-5 text-emerald-600" />
              {editingProduit.id ? 'Modifier la Fiche Produit' : 'Créer un Produit Pharmaceutique'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Renseignez les données d'identification réglementaire, galénique et tarifaire.
            </p>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom Commercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduit.nom_commercial || ''}
                    onChange={(e) => setEditingProduit({ ...editingProduit, nom_commercial: e.target.value })}
                    placeholder="Ex: Paracétamol Biogaran"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    DCI (Dénomination Commune Internationale) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduit.dci || ''}
                    onChange={(e) => setEditingProduit({ ...editingProduit, dci: e.target.value })}
                    placeholder="Ex: Paracétamol"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Code CIP / ACL / Barres
                  </label>
                  <input
                    type="text"
                    value={editingProduit.code_cip_acl || ''}
                    onChange={(e) => setEditingProduit({ ...editingProduit, code_cip_acl: e.target.value })}
                    placeholder="Ex: 3400936081234"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Laboratoire / Fabricant
                  </label>
                  <input
                    type="text"
                    value={editingProduit.laboratoire_fabricant || ''}
                    onChange={(e) => setEditingProduit({ ...editingProduit, laboratoire_fabricant: e.target.value })}
                    placeholder="Ex: Sanofi, Biogaran, Siphat..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Forme Galénique
                  </label>
                  <select
                    value={editingProduit.forme_galenique || 'Comprimé'}
                    onChange={(e) => setEditingProduit({ ...editingProduit, forme_galenique: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  >
                    <option value="Comprimé">Comprimé</option>
                    <option value="Comprimé effervescent">Comprimé effervescent</option>
                    <option value="Gélule">Gélule</option>
                    <option value="Sirop">Sirop / Suspension buvable</option>
                    <option value="Solution injectable">Solution injectable (Ampoule / Stylo)</option>
                    <option value="Pommade / Gel">Pommade / Crème / Gel</option>
                    <option value="Collyre">Collyre (Gouttes ophtalmiques)</option>
                    <option value="Suppositoire">Suppositoire</option>
                    <option value="Sachet poudre">Sachet poudre</option>
                    <option value="Dispositif médical">Dispositif médical / Consommable</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dosage
                  </label>
                  <input
                    type="text"
                    value={editingProduit.dosage || ''}
                    onChange={(e) => setEditingProduit({ ...editingProduit, dosage: e.target.value })}
                    placeholder="Ex: 1000 mg, 500 mg, 250 mg/5 mL"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Conditionnement & Unité
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editingProduit.conditionnement || ''}
                      onChange={(e) => setEditingProduit({ ...editingProduit, conditionnement: e.target.value })}
                      placeholder="Boîte de 16"
                      className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                    />
                    <input
                      type="text"
                      value={editingProduit.unite_vente || ''}
                      onChange={(e) => setEditingProduit({ ...editingProduit, unite_vente: e.target.value })}
                      placeholder="Boîte"
                      className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Classe Réglementaire
                  </label>
                  <select
                    value={editingProduit.classe_tableau || 'OTC'}
                    onChange={(e) =>
                      setEditingProduit({
                        ...editingProduit,
                        classe_tableau: e.target.value as ClasseReglementaire,
                        necessite_ordonnance: e.target.value !== 'OTC',
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  >
                    <option value="OTC">Vente libre (OTC)</option>
                    <option value="LISTE_I">Liste I (Cadre Rouge - Ordonnance obligatoire)</option>
                    <option value="LISTE_II">Liste II (Cadre Vert - Ordonnance requise)</option>
                    <option value="STUPEFIANT">Stupéfiants (Prescription sécurisée)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Conservation
                  </label>
                  <select
                    value={editingProduit.conditions_conservation || 'AMBIANTE'}
                    onChange={(e) =>
                      setEditingProduit({
                        ...editingProduit,
                        conditions_conservation: e.target.value as ConditionConservation,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  >
                    <option value="AMBIANTE">Température ambiante (&le; 25°C)</option>
                    <option value="FROID_2_8">Chaîne du Froid : 2°C à 8°C (Frigo)</option>
                    <option value="ABRI_LUMIERE">À l'abri de la lumière</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ordonnance Obligatoire
                  </label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduit.necessite_ordonnance)}
                        onChange={(e) => setEditingProduit({ ...editingProduit, necessite_ordonnance: e.target.checked })}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>Exiger ordonnance lors de la vente</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Prix Achat HT (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingProduit.prix_achat_ht || 0}
                    onChange={(e) => setEditingProduit({ ...editingProduit, prix_achat_ht: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Prix Vente Public TTC (FCFA) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editingProduit.prix_vente_ttc || 0}
                    onChange={(e) => setEditingProduit({ ...editingProduit, prix_vente_ttc: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow"
                >
                  {saveLoading ? 'Enregistrement...' : 'Enregistrer le Produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
