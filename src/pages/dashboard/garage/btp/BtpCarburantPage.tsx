// =============================================================================
// GESTIO 229 SaaS — Carburant, Cuves & Lubrifiants BTP
// Conforme Spécification Section 5.6
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Fuel, Plus, Search, AlertTriangle, CheckCircle2, DollarSign,
  TrendingDown, TrendingUp, RefreshCw, X, Eye, Gauge, Truck
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { BtpCuve, BtpCarburantPlein, BtpMateriel } from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BtpCarburantPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [cuves, setCuves] = useState<BtpCuve[]>([])
  const [pleins, setPleins] = useState<BtpCarburantPlein[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modale Nouveau Plein
  const [showPleinModal, setShowPleinModal] = useState(false)
  const [selectedMat, setSelectedMat] = useState<BtpMateriel | null>(null)
  const [formPlein, setFormPlein] = useState({
    cuve_id: '',
    materiel_id: '',
    quantite_litres: 100,
    prix_litre: 650,
    compteur_heures: 0,
    compteur_km: 0,
    conducteur_nom: '',
    pompiste_distributeur: 'Pompiste Chantier',
    notes: ''
  })

  // Modale Nouvelle Cuve
  const [showCuveModal, setShowCuveModal] = useState(false)
  const [formCuve, setFormCuve] = useState({
    code_cuve: 'CUV-01',
    type_carburant: 'Gasoil',
    capacite_max_litres: 10000,
    stock_actuel_litres: 5000,
    seuil_alerte_litres: 1500,
    prix_moyen_achat_litre: 650
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cuvRes, plnRes, matRes] = await Promise.all([
        supabaseTenant('btp_cuves').select('*').order('code_cuve'),
        supabaseTenant('btp_carburant_pleins').select('*').order('date_plein', { ascending: false }).limit(100),
        supabaseTenant('btp_materiels').select('*').order('code_materiel')
      ])

      setCuves(cuvRes.data || [])
      setPleins(plnRes.data || [])
      setMateriels(matRes.data || [])
    } catch (err: any) {
      console.warn('[BtpCarburant] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSelectMateriel = (matId: string) => {
    const m = materiels.find(x => x.id === matId)
    setSelectedMat(m || null)
    setFormPlein(prev => ({
      ...prev,
      materiel_id: matId,
      compteur_heures: m?.compteur_heures_actuel || 0,
      compteur_km: m?.compteur_km_actuel || 0,
      conducteur_nom: m?.conducteur_habituel_nom || prev.conducteur_nom
    }))
  }

  // Calcul du ratio de consommation et détection de surconsommation
  const handleSavePlein = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formPlein.materiel_id || formPlein.quantite_litres <= 0) {
      toast.error('Champs requis', 'Veuillez sélectionner un matériel et une quantité valide.')
      return
    }

    try {
      const mat = materiels.find(m => m.id === formPlein.materiel_id)
      const numBon = `BON-CARB-${Math.floor(10000 + Math.random() * 90000)}`
      const montant = formPlein.quantite_litres * formPlein.prix_litre

      // Ratio consommation
      let ratio = 0
      let isSurconso = false
      if (mat) {
        if (mat.type_compteur === 'HEURES_MOTEUR') {
          const deltaH = Math.max(1, formPlein.compteur_heures - (mat.compteur_heures_actuel || 0))
          ratio = formPlein.quantite_litres / deltaH
          if (mat.conso_theorique_moyenne > 0 && ratio > mat.conso_theorique_moyenne * 1.35) {
            isSurconso = true
          }
        } else {
          const deltaKm = Math.max(1, formPlein.compteur_km - (mat.compteur_km_actuel || 0))
          ratio = (formPlein.quantite_litres / deltaKm) * 100
          if (mat.conso_theorique_moyenne > 0 && ratio > mat.conso_theorique_moyenne * 1.35) {
            isSurconso = true
          }
        }
      }

      const payload: Partial<BtpCarburantPlein> = {
        company_id: companyId || '',
        numero_bon: numBon,
        cuve_id: formPlein.cuve_id || undefined,
        materiel_id: formPlein.materiel_id,
        materiel_code: mat?.code_materiel,
        quantite_litres: formPlein.quantite_litres,
        prix_litre: formPlein.prix_litre,
        montant_total: montant,
        compteur_heures: formPlein.compteur_heures,
        compteur_km: formPlein.compteur_km,
        conducteur_nom: formPlein.conducteur_nom,
        pompiste_distributeur: formPlein.pompiste_distributeur,
        consommation_calculee_ratio: Math.round(ratio * 10) / 10,
        est_surconsommation_anormale: isSurconso,
        notes: formPlein.notes
      }

      const { error } = await supabaseTenant('btp_carburant_pleins').insert([payload])
      if (error) throw error

      // Mettre à jour le stock de la cuve si sélectionnée
      if (formPlein.cuve_id) {
        const targetCuve = cuves.find(c => c.id === formPlein.cuve_id)
        if (targetCuve) {
          const newStock = Math.max(0, targetCuve.stock_actuel_litres - formPlein.quantite_litres)
          await supabaseTenant('btp_cuves')
            .update({ stock_actuel_litres: newStock })
            .eq('id', formPlein.cuve_id)
        }
      }

      // Mettre à jour le compteur du matériel
      if (mat) {
        await supabaseTenant('btp_materiels')
          .update({
            compteur_heures_actuel: formPlein.compteur_heures || mat.compteur_heures_actuel,
            compteur_km_actuel: formPlein.compteur_km || mat.compteur_km_actuel,
            compteur_derniere_maj: new Date().toISOString()
          })
          .eq('id', mat.id)
      }

      if (isSurconso) {
        toast.warning(
          'Alerte Surconsommation !',
          `La consommation calculée (${Math.round(ratio)} L) dépasse de plus de 35% la moyenne habituelle (${mat?.conso_theorique_moyenne} L).`
        )
      } else {
        toast.success('Plein enregistré', `Bon ${numBon} de ${formPlein.quantite_litres} L validé.`)
      }

      setShowPleinModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleCreateCuve = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabaseTenant('btp_cuves').insert([{
        company_id: companyId,
        ...formCuve
      }])
      if (error) throw error
      toast.success('Cuve ajoutée', `La cuve ${formCuve.code_cuve} a été enregistrée.`)
      setShowCuveModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur cuve', err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Fuel className="w-6 h-6 text-amber-600" />
            Gestion Carburant, Cuves & Distributions BTP
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Approvisionnements de cuves, bons de pleins, calculs L/100km & L/h et détection de surconsommation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPleinModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Enregistrer un Plein
          </button>
          <button
            onClick={() => setShowCuveModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouvelle Cuve
          </button>
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Cuves de Carburant Actives ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cuves.map((c) => {
          const pct = Math.round((c.stock_actuel_litres / c.capacite_max_litres) * 100)
          const isLow = c.stock_actuel_litres <= c.seuil_alerte_litres

          return (
            <div key={c.id} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono font-black text-sm text-amber-700 dark:text-amber-400">{c.code_cuve}</span>
                <span className={clsx(
                  'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  isLow ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-emerald-100 text-emerald-800'
                )}>
                  {isLow ? 'Niveau Critique' : 'Niveau OK'}
                </span>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {Number(c.stock_actuel_litres).toLocaleString()} L
                  </span>
                  <span className="text-xs text-slate-500 font-bold">/ {Number(c.capacite_max_litres).toLocaleString()} L</span>
                </div>

                {/* Barre de jauge de cuve */}
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500', isLow ? 'bg-rose-500' : 'bg-amber-500')}
                    style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500 flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <span>Type : <strong>{c.type_carburant}</strong></span>
                <span>Prix moyen : <strong>{fmt(c.prix_moyen_achat_litre)}/L</strong></span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Historique des Pleins et Distributions ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Fuel className="w-5 h-5 text-amber-600" />
            Historique des Pleins et Consommations Calculées
          </h2>
        </div>

        {pleins.length === 0 ? (
          <div className="text-center py-12 p-6 text-xs text-slate-500">
            Aucun plein enregistré. Utilisez le bouton "Enregistrer un Plein" ci-dessus.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">N° Bon</th>
                  <th className="py-3 px-4">Date & Heure</th>
                  <th className="py-3 px-4">Matériel</th>
                  <th className="py-3 px-4">Litres</th>
                  <th className="py-3 px-4">Montant TTC</th>
                  <th className="py-3 px-4">Compteur Relevé</th>
                  <th className="py-3 px-4">Conducteur</th>
                  <th className="py-3 px-4">Consommation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pleins.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {p.numero_bon}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(p.date_plein).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <span className="text-amber-600 mr-1.5">{p.materiel_code || 'ENG'}</span>
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900 dark:text-white">
                      {Number(p.quantite_litres).toLocaleString()} L
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">
                      {fmt(p.montant_total || 0)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {p.compteur_heures ? `${p.compteur_heures} h` : `${p.compteur_km} km`}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {p.conducteur_nom || 'Non renseigné'}
                    </td>
                    <td className="py-3 px-4">
                      {p.est_surconsommation_anormale ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Alerte Surconso ({p.consommation_calculee_ratio})
                        </span>
                      ) : p.consommation_calculee_ratio ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {p.consommation_calculee_ratio} {p.compteur_heures ? 'L/h' : 'L/100'}
                        </span>
                      ) : (
                        <span className="text-slate-400">Normale</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modale Formulaire Plein ── */}
      {showPleinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Fuel className="w-5 h-5 text-amber-600" />
                Enregistrer un Plein de Carburant
              </h3>
              <button onClick={() => setShowPleinModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlein} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Matériel Bénéficiaire *
                  </label>
                  <select
                    required
                    value={formPlein.materiel_id}
                    onChange={(e) => handleSelectMateriel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir engin / camion --</option>
                    {materiels.map(m => (
                      <option key={m.id} value={m.id}>{m.code_materiel} — {m.designation}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Cuve Source
                  </label>
                  <select
                    value={formPlein.cuve_id}
                    onChange={(e) => setFormPlein({ ...formPlein, cuve_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Station externe / Fournisseur</option>
                    {cuves.map(c => (
                      <option key={c.id} value={c.id}>{c.code_cuve} ({Number(c.stock_actuel_litres).toLocaleString()} L dispo)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Quantité (Litres) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formPlein.quantite_litres}
                    onChange={(e) => setFormPlein({ ...formPlein, quantite_litres: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Prix par Litre (FCFA)
                  </label>
                  <input
                    type="number"
                    value={formPlein.prix_litre}
                    onChange={(e) => setFormPlein({ ...formPlein, prix_litre: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compteur Heures Moteur
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formPlein.compteur_heures}
                    onChange={(e) => setFormPlein({ ...formPlein, compteur_heures: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compteur KM
                  </label>
                  <input
                    type="number"
                    value={formPlein.compteur_km}
                    onChange={(e) => setFormPlein({ ...formPlein, compteur_km: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nom du Conducteur / Opérateur
                </label>
                <input
                  type="text"
                  value={formPlein.conducteur_nom}
                  onChange={(e) => setFormPlein({ ...formPlein, conducteur_nom: e.target.value })}
                  placeholder="Nom du chauffeur qui a fait le plein"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPleinModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Valider le Bon de Carburant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Nouvelle Cuve ── */}
      {showCuveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white">Ajouter une Cuve Interne</h3>
              <button onClick={() => setShowCuveModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCuve} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Code Cuve *
                </label>
                <input
                  type="text"
                  required
                  value={formCuve.code_cuve}
                  onChange={(e) => setFormCuve({ ...formCuve, code_cuve: e.target.value })}
                  placeholder="Ex: CUV-CHANTIER-RNIE"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Capacité Max (L)
                  </label>
                  <input
                    type="number"
                    value={formCuve.capacite_max_litres}
                    onChange={(e) => setFormCuve({ ...formCuve, capacite_max_litres: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Stock Initial (L)
                  </label>
                  <input
                    type="number"
                    value={formCuve.stock_actuel_litres}
                    onChange={(e) => setFormCuve({ ...formCuve, stock_actuel_litres: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCuveModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Créer la Cuve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpCarburantPage
