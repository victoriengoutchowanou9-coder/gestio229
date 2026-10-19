// =============================================================================
// GESTIO 229 SaaS — Fenêtre Dédiée Nomenclature BOM (Imprimerie & Sérigraphie)
// Gestion avancée des matières premières associées, synchronisation automatique
// avec « Matières premières -> Stock vente », calculs des coûts, gâche et bases
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  Layers, Plus, Trash2, Edit2, AlertTriangle, CheckCircle2,
  X, RefreshCw, Search, ShieldAlert, Package, Minus
} from 'lucide-react'
import {
  PrestationMatiereBOM,
  MatierePremiere
} from '../../../services/imprimerieService'

interface ImprimerieBomModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (updatedBom: PrestationMatiereBOM[]) => void
  prestationNom: string
  modeCalculPrestation?: string
  initialBom: PrestationMatiereBOM[]
  matieresDisponibles: MatierePremiere[]
  onReloadMatieres?: () => Promise<void>
}

export const ImprimerieBomModal: React.FC<ImprimerieBomModalProps> = ({
  isOpen,
  onClose,
  onSave,
  prestationNom,
  modeCalculPrestation = 'm2',
  initialBom,
  matieresDisponibles,
  onReloadMatieres
}) => {
  if (!isOpen) return null

  // Liste locale et temporaire des matières associées au BOM
  const [bomItems, setBomItems] = useState<PrestationMatiereBOM[]>(() => {
    return initialBom.map(item => ({ ...item }))
  })

  // Réinitialisation de l'état temporaire à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setBomItems(initialBom.map(item => ({ ...item })))
      setEditingIndex(null)
      setFormError(null)
      setApplyError(null)
      setSuccessFeedback(null)
    }
  }, [isOpen, initialBom])

  // Recherche dans les matières premières disponibles
  const [searchMatiere, setSearchMatiere] = useState('')

  // Mode édition d'une ligne existante
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Formulaire d'ajout / modification d'une matière
  const [selectedMatiereId, setSelectedMatiereId] = useState<string>('')
  const [quantite, setQuantite] = useState<number>(1)
  const [baseCalcul, setBaseCalcul] = useState<'m2' | 'piece' | 'unite' | 'ml'>(
    modeCalculPrestation === 'm2' ? 'm2' : 'piece'
  )
  const [tauxGache, setTauxGache] = useState<number>(5)
  const [prixVenteRef, setPrixVenteRef] = useState<number>(0)
  const [formError, setFormError] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null)

  // Matières disponibles filtrées par recherche
  const filteredMatieresDisponibles = useMemo(() => {
    if (!searchMatiere.trim()) return matieresDisponibles
    const q = searchMatiere.toLowerCase()
    return matieresDisponibles.filter(m =>
      m.nom.toLowerCase().includes(q) ||
      (m.code && m.code.toLowerCase().includes(q)) ||
      (m.categorie && m.categorie.toLowerCase().includes(q))
    )
  }, [matieresDisponibles, searchMatiere])

  // Matière sélectionnée dans le catalogue
  const selectedMatiere = useMemo(() => {
    return matieresDisponibles.find(m => m.id === selectedMatiereId) || null
  }, [matieresDisponibles, selectedMatiereId])

  // Initialisation à la première matière disponible si formulaire vide
  useEffect(() => {
    if (editingIndex === null) {
      const targetList = filteredMatieresDisponibles.length > 0 ? filteredMatieresDisponibles : matieresDisponibles
      if (targetList.length > 0 && (!selectedMatiereId || !targetList.some(m => m.id === selectedMatiereId))) {
        handleSelectMatiere(targetList[0].id)
      }
    }
  }, [filteredMatieresDisponibles, matieresDisponibles, selectedMatiereId, editingIndex])

  // Sélection d'une matière et récupération automatique du prix de vente stock vente
  const handleSelectMatiere = (matiereId: string) => {
    setSelectedMatiereId(matiereId)
    setFormError(null)
    setApplyError(null)

    const mat = matieresDisponibles.find(m => m.id === matiereId)
    if (mat) {
      const pv = Number(mat.prix_vente || 0)
      setPrixVenteRef(pv)
    }
  }

  // Calcul instantané du coût estimé de la ligne en cours de saisie
  const liveCoutLigne = useMemo(() => {
    const qte = Number(quantite || 0)
    const pu = Number(prixVenteRef || 0)
    const gache = Number(tauxGache || 0)
    return Math.round(qte * pu * (1 + gache / 100) * 100) / 100
  }, [quantite, prixVenteRef, tauxGache])

  // Coût total estimé des matières dans la nomenclature
  const totalCoutMatieres = useMemo(() => {
    return bomItems.reduce((acc, item) => acc + (item.cout_total_prevu || 0), 0)
  }, [bomItems])

  // Édition d'une ligne existante
  const handleStartEdit = (index: number) => {
    const item = bomItems[index]
    if (!item) return
    setEditingIndex(index)
    setSelectedMatiereId(item.matiere_id)
    setQuantite(Number(item.quantite_prevue || 1))
    setBaseCalcul((item.base_calcul as any) || (modeCalculPrestation === 'm2' ? 'm2' : 'piece'))
    setTauxGache(Number(item.taux_gache || 0))
    setPrixVenteRef(Number(item.prix_vente_ref || item.cout_unitaire_prevu || 0))
    setFormError(null)
    setApplyError(null)
    setSuccessFeedback(null)
  }

  // Annuler l'édition en cours
  const handleCancelEdit = () => {
    setEditingIndex(null)
    setFormError(null)
    setApplyError(null)
    if (matieresDisponibles.length > 0) {
      handleSelectMatiere(matieresDisponibles[0].id)
      setQuantite(1)
      setTauxGache(5)
      setBaseCalcul(modeCalculPrestation === 'm2' ? 'm2' : 'piece')
    }
  }

  // Modification directe de la quantité dans la liste
  const handleUpdateItemQuantity = (index: number, newQte: number) => {
    if (newQte <= 0) return
    setBomItems(prev => {
      const copy = [...prev]
      const item = { ...copy[index] }
      item.quantite_prevue = Number(newQte)
      const pu = Number(item.prix_vente_ref || item.cout_unitaire_prevu || 0)
      const gache = Number(item.taux_gache || 0)
      item.cout_total_prevu = Math.round(newQte * pu * (1 + gache / 100) * 100) / 100
      copy[index] = item
      return copy
    })
  }

  // Suppression d'une matière
  const handleRemoveItem = (index: number) => {
    setBomItems(prev => prev.filter((_, i) => i !== index))
    if (editingIndex === index) {
      handleCancelEdit()
    }
  }

  // Ajout ou mise à jour de la matière dans la nomenclature locale
  const handleSubmitItem = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setApplyError(null)

    if (!selectedMatiere) {
      setFormError('Veuillez sélectionner une matière première dans la liste.')
      return
    }

    if (quantite <= 0) {
      setFormError('La quantité par unité doit être strictement supérieure à 0.')
      return
    }

    if (prixVenteRef <= 0) {
      setFormError(
        'Cette matière ne possède pas de prix de vente valide dans le stock vente. ' +
        'Veuillez renseigner un prix de référence positif.'
      )
      return
    }

    const coutTotal = Math.round(quantite * prixVenteRef * (1 + (tauxGache || 0) / 100) * 100) / 100

    const newItem: PrestationMatiereBOM = {
      id: editingIndex !== null ? bomItems[editingIndex]?.id : undefined,
      matiere_id: selectedMatiere.id,
      matiere_nom: selectedMatiere.nom,
      matiere_code: selectedMatiere.code,
      quantite_prevue: Number(quantite),
      unite: selectedMatiere.unite || 'u',
      base_calcul: baseCalcul,
      taux_gache: Number(tauxGache || 0),
      prix_vente_ref: Number(prixVenteRef),
      cout_unitaire_prevu: Number(prixVenteRef),
      cout_total_prevu: coutTotal,
      stock_disponible: selectedMatiere.stock_vente ?? selectedMatiere.stock_actuel ?? 0,
    }

    if (editingIndex !== null) {
      // Mise à jour de la ligne sélectionnée
      setBomItems(prev => {
        const copy = [...prev]
        copy[editingIndex] = newItem
        return copy
      })
      handleCancelEdit()
      setSuccessFeedback('Matière mise à jour dans la nomenclature.')
    } else {
      // Vérification des doublons : fusion ou ajout
      const existingIdx = bomItems.findIndex(i => i.matiere_id === selectedMatiere.id)
      if (existingIdx >= 0) {
        const updated = [...bomItems]
        updated[existingIdx] = newItem
        setBomItems(updated)
        setSuccessFeedback(`Quantité mise à jour pour ${selectedMatiere.nom}.`)
      } else {
        setBomItems(prev => [...prev, newItem])
        setSuccessFeedback(`Matière « ${selectedMatiere.nom} » ajoutée ! Vous pouvez en ajouter d'autres.`)
      }

      // Réinitialiser les champs tout en conservant une saisie rapide pour la prochaine matière
      setQuantite(1)
      setTauxGache(5)
    }

    // Effacer le message de succès après 3 secondes
    setTimeout(() => {
      setSuccessFeedback(null)
    }, 3000)
  }

  // Validation rigoureuse et application des matières à la prestation
  const handleSaveAndClose = () => {
    setApplyError(null)

    // Vérifier les quantités
    for (let i = 0; i < bomItems.length; i++) {
      const item = bomItems[i]
      if (!item.quantite_prevue || Number(item.quantite_prevue) <= 0) {
        setApplyError(`La quantité pour « ${item.matiere_nom} » doit être strictement supérieure à 0.`)
        return
      }
    }

    // Dédoublonnage et consolidation par matière
    const dedupMap = new Map<string, PrestationMatiereBOM>()
    for (const item of bomItems) {
      const key = item.matiere_id
      const pu = Number(item.prix_vente_ref || item.cout_unitaire_prevu || 0)
      const gache = Number(item.taux_gache || 0)
      const qte = Number(item.quantite_prevue || 0)

      if (dedupMap.has(key)) {
        const existing = dedupMap.get(key)!
        const combinedQte = Number(existing.quantite_prevue || 0) + qte
        const combinedCout = Math.round(combinedQte * pu * (1 + gache / 100) * 100) / 100
        dedupMap.set(key, {
          ...existing,
          quantite_prevue: combinedQte,
          cout_total_prevu: combinedCout,
        })
      } else {
        const coutTotal = Math.round(qte * pu * (1 + gache / 100) * 100) / 100
        dedupMap.set(key, {
          ...item,
          quantite_prevue: qte,
          cout_unitaire_prevu: pu,
          prix_vente_ref: pu,
          cout_total_prevu: coutTotal,
        })
      }
    }

    const validatedBom = Array.from(dedupMap.values())
    onSave(validatedBom)
    onClose()
  }

  const modalTitle = prestationNom && prestationNom.trim()
    ? `Nomenclature (BOM) — ${prestationNom.trim()}`
    : 'Nomenclature (BOM) — Nouvelle Prestation'

  return (
    <div
      className="fixed inset-0 z-70 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn"
      style={{ zIndex: 70 }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 space-y-5 my-6 shadow-2xl border border-slate-200 animate-scaleUp relative"
        style={{ zIndex: 71 }}
      >
        
        {/* ── En-tête de la fenêtre BOM ── */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-700 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                {modalTitle}
              </h3>
              <p className="text-xs text-slate-500">
                Sélection des matières premières, calcul des coûts, gâche et synchronisation automatique avec le stock vente
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition"
            title="Fermer sans appliquer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Indicateur financier synthétique ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase block mb-0.5">Matières configurées</span>
            <span className="text-base font-black text-slate-900">{bomItems.length} matériau(x)</span>
          </div>

          <div className="p-3.5 bg-pink-50/70 rounded-2xl border border-pink-200">
            <span className="text-[11px] font-bold text-pink-700 uppercase block mb-0.5">Coût Total des Matières</span>
            <span className="text-lg font-black text-pink-700">
              {totalCoutMatieres.toLocaleString('fr-FR')} FCFA
            </span>
            <span className="text-[10px] text-pink-500 block">Par unité de production de base</span>
          </div>

          <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase block mb-0.5">Synchronisation Stock</span>
              <span className="text-xs font-semibold text-emerald-800">Prix de vente du Stock vente</span>
            </div>
            {onReloadMatieres && (
              <button
                type="button"
                onClick={() => onReloadMatieres()}
                className="p-1.5 hover:bg-emerald-100 text-emerald-700 rounded-lg transition"
                title="Actualiser les matières premières"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Message de succès temporaire */}
        {successFeedback && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successFeedback}</span>
          </div>
        )}

        {/* Message d'erreur de validation d'application */}
        {applyError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 animate-fadeIn">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{applyError}</span>
          </div>
        )}

        {/* ── Tableau des matières associées à la prestation ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-pink-600" /> Matières dans la Nomenclature BOM
            </h4>
            <span className="text-[11px] font-medium text-slate-400">
              {bomItems.length === 0 ? 'Aucune matière' : `${bomItems.length} entrée(s)`}
            </span>
          </div>

          {bomItems.length === 0 ? (
            <div className="text-center py-8 bg-slate-50/60 rounded-2xl border border-dashed border-slate-300 text-slate-400 text-xs">
              <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              Aucun matériau associé pour l'instant.
              <p className="text-[11px] text-slate-400 mt-1">
                Sélectionnez une matière première ci-dessous (bâche, vinyle, encre...) et cliquez sur « Ajouter ».
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-56">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="px-3.5 py-2.5">Matériau / Matière</th>
                      <th className="px-3 py-2.5 text-center">Quantité & Unité</th>
                      <th className="px-3 py-2.5 text-center">Base calcul</th>
                      <th className="px-3 py-2.5 text-center">Gâche (%)</th>
                      <th className="px-3 py-2.5 text-right">Prix Unitaire Réf.</th>
                      <th className="px-3.5 py-2.5 text-right">Coût Total</th>
                      <th className="px-3 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bomItems.map((item, idx) => {
                      const hasAlert = !item.prix_vente_ref || item.prix_vente_ref <= 0
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 transition ${editingIndex === idx ? 'bg-pink-50/50' : ''}`}
                        >
                          <td className="px-3.5 py-2.5 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              {hasAlert && (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Prix manquant" />
                              )}
                              <span>{item.matiere_nom}</span>
                            </div>
                            {item.matiere_code && (
                              <span className="text-[10px] text-slate-400 block font-mono">{item.matiere_code}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(idx, Math.max(0.1, Math.round((Number(item.quantite_prevue || 1) - 0.5) * 10) / 10))}
                                className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-pink-600 font-bold"
                                title="Diminuer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                step="0.1"
                                min="0.001"
                                value={item.quantite_prevue}
                                onChange={(e) => handleUpdateItemQuantity(idx, Number(e.target.value))}
                                className="w-14 text-center bg-white border border-slate-300 rounded font-bold text-xs py-0.5"
                              />
                              <span className="text-[11px] font-semibold text-slate-600">{item.unite}</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(idx, Math.round((Number(item.quantite_prevue || 1) + 0.5) * 10) / 10)}
                                className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-pink-600 font-bold"
                                title="Augmenter"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-600">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] font-semibold">
                              {item.base_calcul === 'm2' ? 'par m²' : item.base_calcul === 'piece' ? 'par pièce' : item.base_calcul || 'par unité'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-700 font-semibold">
                            {item.taux_gache ? `+${item.taux_gache}%` : '0%'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                            {hasAlert ? (
                              <span className="text-amber-600 font-bold text-[11px]">Non défini</span>
                            ) : (
                              `${Number(item.prix_vente_ref || item.cout_unitaire_prevu || 0).toLocaleString('fr-FR')} F`
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black text-pink-700">
                            {Number(item.cout_total_prevu || 0).toLocaleString('fr-FR')} F
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(idx)}
                                className="p-1.5 text-slate-500 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition"
                                title="Modifier cette matière"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Supprimer de la nomenclature"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Formulaire « Ajouter / Modifier un matériau à la nomenclature » ── */}
        <form onSubmit={handleSubmitItem} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-pink-600" />
              {editingIndex !== null ? 'Modifier le matériau sélectionné' : 'Ajouter un matériau à la nomenclature'}
            </h4>
            {editingIndex !== null && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                Annuler la modification
              </button>
            )}
          </div>

          {/* Recherche rapide de matière */}
          {editingIndex === null && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher une matière dans le catalogue (ex : bâche, encre, vinyle...)"
                value={searchMatiere}
                onChange={(e) => setSearchMatiere(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
          )}

          {/* Message d'erreur éventuel */}
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Grille des champs */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end">
            
            {/* 1. Sélection Matière */}
            <div className="sm:col-span-5">
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Matière Première (Stock Vente) *
              </label>
              <select
                value={selectedMatiereId}
                onChange={(e) => handleSelectMatiere(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-pink-500 focus:outline-none"
              >
                {filteredMatieresDisponibles.length === 0 ? (
                  <option value="">Aucune matière trouvée</option>
                ) : (
                  filteredMatieresDisponibles.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nom} — {m.unite} (Stock: {m.stock_vente ?? m.stock_actuel ?? 0} | Prix: {Number(m.prix_vente || 0).toLocaleString('fr-FR')} F)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. Quantité par unité de production */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Qté par unité *
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={quantite}
                onChange={(e) => setQuantite(Number(e.target.value))}
                placeholder="Ex: 1"
                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-center focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>

            {/* 3. Base de calcul */}
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Base de calcul
              </label>
              <select
                value={baseCalcul}
                onChange={(e) => setBaseCalcul(e.target.value as any)}
                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
              >
                <option value="m2">par m²</option>
                <option value="piece">par pièce</option>
                <option value="unite">par unité</option>
                <option value="ml">au mètre linéaire</option>
              </select>
            </div>

            {/* 4. Pourcentage de gâche */}
            <div className="sm:col-span-1">
              <label className="text-[11px] font-bold text-slate-700 block mb-1" title="Pourcentage de gâche / chute">
                Gâche (%)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={tauxGache}
                onChange={(e) => setTauxGache(Number(e.target.value))}
                placeholder="5"
                className="w-full px-2 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-center focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>

            {/* 5. Bouton Ajouter / Mettre à jour */}
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {editingIndex !== null ? 'Mettre à jour' : 'Ajouter'}
              </button>
            </div>
          </div>

          {/* Détails et Prix du stock vente */}
          {selectedMatiere && (
            <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-slate-600">
                <span>
                  <strong>Unité de consommation :</strong> {selectedMatiere.unite || 'u'}
                </span>
                <span>•</span>
                <span>
                  <strong>Stock disponible :</strong> {selectedMatiere.stock_vente ?? selectedMatiere.stock_actuel ?? 0} {selectedMatiere.unite}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <strong>Prix unitaire réf. stock vente :</strong>
                  <input
                    type="number"
                    value={prixVenteRef}
                    onChange={(e) => setPrixVenteRef(Number(e.target.value))}
                    className="w-24 px-1.5 py-0.5 bg-white border border-slate-300 rounded-md font-bold text-slate-900 text-right"
                    title="Synchronisé avec le stock vente, modifiable pour cette recette"
                  />
                  <span>F</span>
                </span>
              </div>

              <div className="font-bold text-slate-700">
                Coût estimé ligne : <span className="text-pink-700 font-black">{liveCoutLigne.toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          )}

          {/* Avertissement si aucun prix */}
          {selectedMatiere && (!prixVenteRef || prixVenteRef <= 0) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Attention : Aucun prix de vente configuré dans le stock vente pour « {selectedMatiere.nom} » !</strong>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Conformément aux règles GESTIO 229, le coût matière dans la nomenclature utilise le prix de vente enregistré dans le module Matières Premières (stock vente). Veuillez saisir un prix de référence valide ci-dessus.
                </p>
              </div>
            </div>
          )}
        </form>

        {/* ── Boutons d'action finale ── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Fermer sans appliquer
          </button>

          <button
            type="button"
            onClick={handleSaveAndClose}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            Appliquer à la prestation ({bomItems.length} matière{bomItems.length > 1 ? 's' : ''})
          </button>
        </div>

      </div>
    </div>
  )
}

export default ImprimerieBomModal
