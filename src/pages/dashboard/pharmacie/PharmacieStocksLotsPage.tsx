// =============================================================================
// GESTIO 229 — GESTION DES STOCKS PHARMACEUTIQUES, LOTS & PRINCIPE FEFO
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  Layers,
  Search,
  Plus,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Ban,
  CheckCircle2,
  Building,
  Filter,
  Calendar,
  Eye,
  FileSpreadsheet,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieLot,
  PharmacieProduit,
  PharmacieDepot,
  StatutLot,
} from '../../../services/pharmacieService'

export default function PharmacieStocksLotsPage() {
  const { currentCompany } = useTenant()
  const companyId = currentCompany?.id || ''

  const [lots, setLots] = useState<PharmacieLot[]>([])
  const [produits, setProduits] = useState<PharmacieProduit[]>([])
  const [depots, setDepots] = useState<PharmacieDepot[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterDepot, setFilterDepot] = useState<string>('TOUS')
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')
  const [filterPeremption, setFilterPeremption] = useState<string>('TOUS') // TOUS, EXPIRE, 30J, 90J

  // Modal Ajout de Lot
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLot, setEditingLot] = useState<Partial<PharmacieLot> | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [messageAction, setMessageAction] = useState('')

  // Modal Blocage / Quarantaine
  const [blocageModal, setBlocageModal] = useState<{ open: boolean; lot?: PharmacieLot; action: 'BLOQUE' | 'EN_QUARANTAINE' | 'REBUTE_DETRUIT'; motif: string }>({
    open: false,
    action: 'BLOQUE',
    motif: '',
  })

  const chargerDonnees = async () => {
    try {
      setLoading(true)
      const [l, p, d] = await Promise.all([
        pharmacieService.getLots(companyId),
        pharmacieService.getProduits(companyId),
        pharmacieService.getDepots(companyId),
      ])
      setLots(l)
      setProduits(p)
      setDepots(d)
    } catch (err) {
      console.error('Erreur chargement stocks lots:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerDonnees()
  }, [companyId])

  const handleOpenNouveauLot = () => {
    setEditingLot({
      produit_id: produits[0]?.id || '',
      produit_nom: produits[0]?.nom_commercial || '',
      numero_lot: '',
      date_peremption: '',
      depot_id: depots[0]?.id || '',
      depot_nom: depots[0]?.nom || '',
      emplacement_rayon: '',
      quantite_initiale: 1,
      quantite_actuelle: 1,
      fournisseur_nom: '',
      prix_achat_unitaire: produits[0]?.prix_achat_ht || 0,
      statut: 'DISPONIBLE',
    })
    setModalOpen(true)
  }

  const handleSaveLot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLot?.numero_lot || !editingLot?.date_peremption || !editingLot?.produit_id) {
      alert('Veuillez renseigner le produit, le numéro de lot et la date de péremption.')
      return
    }

    try {
      setSaveLoading(true)
      const selProd = produits.find((p) => p.id === editingLot.produit_id)
      const selDepot = depots.find((d) => d.id === editingLot.depot_id)

      await pharmacieService.saveLot(companyId, {
        ...editingLot,
        produit_nom: selProd?.nom_commercial || editingLot.produit_nom,
        depot_nom: selDepot?.nom || editingLot.depot_nom,
      })

      setModalOpen(false)
      setMessageAction('Lot pharmaceutique enregistré avec succès.')
      setTimeout(() => setMessageAction(''), 4000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur enregistrement lot')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleValiderBlocage = async () => {
    if (!blocageModal.lot || !blocageModal.motif.trim()) {
      alert('Veuillez indiquer le motif obligatoire de blocage / quarantaine.')
      return
    }

    try {
      await pharmacieService.saveLot(companyId, {
        ...blocageModal.lot,
        statut: blocageModal.action,
        motif_blocage: blocageModal.motif,
      })

      setBlocageModal({ open: false, action: 'BLOQUE', motif: '' })
      setMessageAction(`Lot ${blocageModal.lot.numero_lot} passé en statut [${blocageModal.action}] avec traçabilité.`)
      setTimeout(() => setMessageAction(''), 4000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur lors du blocage du lot')
    }
  }

  const handleDebloquer = async (lot: PharmacieLot) => {
    if (!window.confirm(`Confirmez-vous le déblocage et la remise en vente du lot ${lot.numero_lot} ?`)) return
    try {
      await pharmacieService.saveLot(companyId, {
        ...lot,
        statut: 'DISPONIBLE',
        motif_blocage: undefined,
      })
      setMessageAction(`Lot ${lot.numero_lot} remis en circulation disponible.`)
      setTimeout(() => setMessageAction(''), 4000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur déblocage')
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const d30 = new Date()
  d30.setDate(d30.getDate() + 30)
  const d90 = new Date()
  d90.setDate(d90.getDate() + 90)

  const filteredLots = lots.filter((lot) => {
    const matchSearch =
      lot.produit_nom.toLowerCase().includes(search.toLowerCase()) ||
      lot.numero_lot.toLowerCase().includes(search.toLowerCase()) ||
      (lot.emplacement_rayon || '').toLowerCase().includes(search.toLowerCase()) ||
      (lot.fournisseur_nom || '').toLowerCase().includes(search.toLowerCase())

    const matchDepot = filterDepot === 'TOUS' || lot.depot_id === filterDepot
    const matchStatut = filterStatut === 'TOUS' || lot.statut === filterStatut

    let matchPeremption = true
    if (filterPeremption === 'EXPIRE') {
      matchPeremption = lot.date_peremption < todayStr || lot.statut === 'BLOQUE'
    } else if (filterPeremption === '30J') {
      matchPeremption = lot.date_peremption >= todayStr && lot.date_peremption <= d30.toISOString().slice(0, 10)
    } else if (filterPeremption === '90J') {
      matchPeremption = lot.date_peremption >= todayStr && lot.date_peremption <= d90.toISOString().slice(0, 10)
    }

    return matchSearch && matchDepot && matchStatut && matchPeremption
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            <Layers className="w-4 h-4" /> Traçabilité Stricte & Principe FEFO (First Expired, First Out)
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Stocks Pharmaceutiques & Suivi des Lots
          </h1>
          <p className="text-sm text-slate-500">
            Gestion des péremptions, emplacements par dépôt, mise en quarantaine et blocage des lots périmés ou défectueux.
          </p>
        </div>

        <button
          onClick={handleOpenNouveauLot}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow transition"
        >
          <Plus className="w-4 h-4" /> Réceptionner / Ajouter un Lot
        </button>
      </div>

      {messageAction && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {messageAction}
        </div>
      )}

      {/* Barre de Recherche et Filtres */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrer par médicament, N° de lot fabricant, rayon ou fournisseur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterDepot}
            onChange={(e) => setFilterDepot(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none"
          >
            <option value="TOUS">Tous les dépôts</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>

          <select
            value={filterPeremption}
            onChange={(e) => setFilterPeremption(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none font-medium"
          >
            <option value="TOUS">Toutes péremptions</option>
            <option value="30J">Expire &le; 30 jours (Critique)</option>
            <option value="90J">Expire &le; 90 jours (Alerte)</option>
            <option value="EXPIRE">Déjà Périmés / Bloqués</option>
          </select>

          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none"
          >
            <option value="TOUS">Tous statuts</option>
            <option value="DISPONIBLE">Disponible à la vente</option>
            <option value="EN_QUARANTAINE">En quarantaine</option>
            <option value="BLOQUE">Bloqué</option>
            <option value="RAPPELE">Rappel sanitaire</option>
          </select>
        </div>
      </div>

      {/* Tableau des Lots (Trié FEFO) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Priorité FEFO / Péremption</th>
                <th className="px-4 py-3">Médicament</th>
                <th className="px-4 py-3">N° Lot Fabricant</th>
                <th className="px-4 py-3">Dépôt & Emplacement</th>
                <th className="px-4 py-3 text-right">Quantité Stock</th>
                <th className="px-4 py-3">Statut Lot</th>
                <th className="px-4 py-3 text-center">Actions Décision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Chargement des lots pharmaceutiques...
                  </td>
                </tr>
              ) : lots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="max-w-md mx-auto space-y-2">
                      <Layers className="w-10 h-10 text-slate-300 mx-auto" />
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-base">Aucun lot pharmaceutique en stock</div>
                      <p className="text-xs text-slate-500">
                        Votre stock officinal est vierge. Enregistrez vos premiers lots réels pour activer la traçabilité FEFO et le suivi des péremptions.
                      </p>
                      <button
                        onClick={handleOpenNouveauLot}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow mt-2"
                      >
                        <Plus className="w-3.5 h-3.5" /> Enregistrer un Lot
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredLots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aucun lot ne correspond aux critères de recherche.
                  </td>
                </tr>
              ) : (
                filteredLots.map((lot, idx) => {
                  const isExpired = lot.date_peremption < todayStr
                  const is30j = !isExpired && lot.date_peremption <= d30.toISOString().slice(0, 10)
                  const is90j = !isExpired && !is30j && lot.date_peremption <= d90.toISOString().slice(0, 10)

                  return (
                    <tr
                      key={lot.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-750 transition ${
                        isExpired || lot.statut !== 'DISPONIBLE'
                          ? 'bg-rose-50/40 dark:bg-rose-950/20'
                          : is30j
                          ? 'bg-amber-50/40 dark:bg-amber-950/20'
                          : ''
                      }`}
                    >
                      {/* Péremption & Priorité FEFO */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {lot.date_peremption}
                            </div>
                            {isExpired ? (
                              <span className="text-[10px] text-rose-600 font-extrabold uppercase">
                                Périmé (Interdit vente)
                              </span>
                            ) : is30j ? (
                              <span className="text-[10px] text-amber-700 font-bold uppercase">
                                Alerte &le; 30 jours
                              </span>
                            ) : is90j ? (
                              <span className="text-[10px] text-amber-600 font-semibold">
                                À surveiller (&le; 90j)
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-medium">Conforme</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Médicament */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{lot.produit_nom}</div>
                        <div className="text-xs text-slate-500">
                          Fournisseur: {lot.fournisseur_nom || 'Direct'}
                        </div>
                      </td>

                      {/* N° Lot */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">
                          {lot.numero_lot}
                        </span>
                      </td>

                      {/* Emplacement */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {lot.depot_nom}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lot.emplacement_rayon || 'Non spécifié'}
                        </div>
                      </td>

                      {/* Quantité */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-black text-slate-900 dark:text-white text-base">
                          {lot.quantite_actuelle}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Initiale: {lot.quantite_initiale}
                        </div>
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-3">
                        {lot.statut === 'DISPONIBLE' && !isExpired ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Disponible
                          </span>
                        ) : lot.statut === 'EN_QUARANTAINE' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            En Quarantaine
                          </span>
                        ) : lot.statut === 'RAPPELE' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white animate-pulse">
                            Rappel Officiel
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Bloqué
                          </span>
                        )}
                        {lot.motif_blocage && (
                          <div className="text-[10px] text-rose-600 mt-0.5 max-w-[180px] truncate" title={lot.motif_blocage}>
                            {lot.motif_blocage}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {lot.statut === 'DISPONIBLE' ? (
                            <button
                              onClick={() =>
                                setBlocageModal({
                                  open: true,
                                  lot,
                                  action: 'BLOQUE',
                                  motif: isExpired ? 'Péremption constatée' : '',
                                })
                              }
                              className="px-2 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 rounded border border-rose-200 transition flex items-center gap-1"
                              title="Bloquer ce lot"
                            >
                              <Ban className="w-3.5 h-3.5" /> Bloquer
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDebloquer(lot)}
                              className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition flex items-center gap-1"
                              title="Débloquer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Débloquer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Réception / Nouveau Lot */}
      {modalOpen && editingLot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-600" />
              Réceptionner & Enregistrer un Lot
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              La traçabilité par lot garantit l'application stricte du principe FEFO lors des délivrances.
            </p>

            <form onSubmit={handleSaveLot} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Médicament / Produit *
                </label>
                <select
                  required
                  value={editingLot.produit_id || ''}
                  onChange={(e) => {
                    const sel = produits.find((p) => p.id === e.target.value)
                    setEditingLot({
                      ...editingLot,
                      produit_id: e.target.value,
                      produit_nom: sel?.nom_commercial || '',
                    })
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                >
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom_commercial} ({p.forme_galenique} {p.dosage})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Numéro de Lot Fabricant *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: SNF-2026-90"
                    value={editingLot.numero_lot || ''}
                    onChange={(e) => setEditingLot({ ...editingLot, numero_lot: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg uppercase font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Date de Péremption *
                  </label>
                  <input
                    type="date"
                    required
                    value={editingLot.date_peremption || ''}
                    onChange={(e) => setEditingLot({ ...editingLot, date_peremption: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dépôt de Stockage *
                  </label>
                  <select
                    value={editingLot.depot_id || ''}
                    onChange={(e) => {
                      const d = depots.find((x) => x.id === e.target.value)
                      setEditingLot({ ...editingLot, depot_id: e.target.value, depot_nom: d?.nom || '' })
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  >
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Emplacement / Rayon
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Rayon B, Tiroir 3"
                    value={editingLot.emplacement_rayon || ''}
                    onChange={(e) => setEditingLot({ ...editingLot, emplacement_rayon: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quantité Reçue (Boîtes) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingLot.quantite_initiale || 1}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setEditingLot({ ...editingLot, quantite_initiale: v, quantite_actuelle: v })
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fournisseur / Grossiste
                  </label>
                  <input
                    type="text"
                    placeholder="Nom du fournisseur ou grossiste-répartiteur"
                    value={editingLot.fournisseur_nom || ''}
                    onChange={(e) => setEditingLot({ ...editingLot, fournisseur_nom: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow"
                >
                  {saveLoading ? 'Enregistrement...' : 'Valider Entrée en Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Blocage / Quarantaine de Lot */}
      {blocageModal.open && blocageModal.lot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-rose-600 mb-1 flex items-center gap-2">
              <Ban className="w-5 h-5" />
              Blocage / Quarantaine du Lot {blocageModal.lot.numero_lot}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Ce lot sera immédiatement retiré de la vente au comptoir et ne pourra plus être délivré aux patients.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Type d'Action
                </label>
                <select
                  value={blocageModal.action}
                  onChange={(e) => setBlocageModal({ ...blocageModal, action: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                >
                  <option value="BLOQUE">Bloquer le lot (Interdit à la vente)</option>
                  <option value="EN_QUARANTAINE">Mettre en quarantaine (En attente d'analyse)</option>
                  <option value="REBUTE_DETRUIT">Mise au rebut pour destruction sous PV</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motif Obligatoire *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ex: Date de péremption dépassée, défaut d'opalescence, signalement patient..."
                  value={blocageModal.motif}
                  onChange={(e) => setBlocageModal({ ...blocageModal, motif: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setBlocageModal({ open: false, action: 'BLOQUE', motif: '' })}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleValiderBlocage}
                  className="px-5 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow"
                >
                  Confirmer le Blocage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
