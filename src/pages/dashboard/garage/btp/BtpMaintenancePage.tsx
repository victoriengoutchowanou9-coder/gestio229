// =============================================================================
// GESTIO 229 SaaS — Maintenance Préventive & Corrective BTP
// Conforme Spécification Section 5.4
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Wrench, Plus, Search, Calendar, Clock, AlertTriangle,
  CheckCircle2, DollarSign, Layers, ShieldAlert, X, RefreshCw
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { BtpOrdreMaintenance, BtpMateriel, BtpMaintenancePlan } from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BtpMaintenancePage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'ORDRES' | 'PLANS'>('ORDRES')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [ordres, setOrdres] = useState<BtpOrdreMaintenance[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [plans, setPlans] = useState<BtpMaintenancePlan[]>([])

  // Modale Nouvel Ordre
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [orderForm, setOrderForm] = useState({
    materiel_id: '',
    type_intervention: 'PREVENTIVE',
    urgence: 'NORMALE',
    diagnostic_panne: '',
    travaux_effectues: '',
    technicien_interne: '',
    prestataire_externe: '',
    cout_pieces: 0,
    cout_main_oeuvre: 0,
    cout_prestataire: 0,
    temps_arret_heures: 0,
    statut: 'PLANIFIE'
  })

  // Modale Nouveau Plan
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planForm, setPlanForm] = useState({
    titre: '',
    categorie_materiel: 'Pelle mécanique',
    periodicite_heures: 250,
    periodicite_km: 10000,
    operations_programmees: 'Vidange huile moteur 15W40, Remplacement filtre huile, Remplacement filtre gasoil, Graissage axes godet et flèche, Contrôle niveau hydraulique'
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [ordRes, matRes, plnRes] = await Promise.all([
        supabaseTenant('btp_ordres_maintenance').select('*, materiel:btp_materiels(*)').order('created_at', { ascending: false }),
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_maintenance_plans').select('*').order('created_at', { ascending: false })
      ])

      setOrdres(ordRes.data || [])
      setMateriels(matRes.data || [])
      setPlans(plnRes.data || [])
    } catch (err: any) {
      console.warn('[BtpMaintenance] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderForm.materiel_id) {
      toast.error('Matériel requis', 'Veuillez sélectionner un matériel concerné.')
      return
    }

    try {
      const mat = materiels.find(m => m.id === orderForm.materiel_id)
      const numOm = `OM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const totalCout = Number(orderForm.cout_pieces) + Number(orderForm.cout_main_oeuvre) + Number(orderForm.cout_prestataire)
      const curCompteur = mat ? (mat.type_compteur === 'HEURES_MOTEUR' ? mat.compteur_heures_actuel : mat.compteur_km_actuel) : 0

      const payload: Partial<BtpOrdreMaintenance> = {
        company_id: companyId || '',
        numero_om: numOm,
        materiel_id: orderForm.materiel_id,
        type_intervention: orderForm.type_intervention as any,
        urgence: orderForm.urgence as any,
        diagnostic_panne: orderForm.diagnostic_panne,
        travaux_effectues: orderForm.travaux_effectues,
        technicien_interne: orderForm.technicien_interne,
        prestataire_externe: orderForm.prestataire_externe,
        cout_pieces: orderForm.cout_pieces,
        cout_main_oeuvre: orderForm.cout_main_oeuvre,
        cout_prestataire: orderForm.cout_prestataire,
        cout_total: totalCout,
        temps_arret_heures: orderForm.temps_arret_heures,
        compteur_au_declenchement: curCompteur,
        statut: orderForm.statut as any,
        pieces_destockees: false
      }

      const { error } = await supabaseTenant('btp_ordres_maintenance').insert([payload])
      if (error) throw error

      // Mettre à jour le statut du matériel si panne
      if (orderForm.type_intervention === 'CORRECTIVE_PANNE') {
        await supabaseTenant('btp_materiels')
          .update({ statut: 'EN_PANNE' })
          .eq('id', orderForm.materiel_id)
      }

      toast.success('Ordre créé', `Ordre de maintenance ${numOm} programmé avec succès.`)
      setShowOrderModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur création OM', err.message)
    }
  }

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planForm.titre.trim()) {
      toast.error('Titre requis', 'Veuillez saisir un titre pour le plan de maintenance.')
      return
    }

    try {
      const ops = planForm.operations_programmees.split(',').map(s => s.trim()).filter(Boolean)
      const payload: Partial<BtpMaintenancePlan> = {
        company_id: companyId || '',
        titre: planForm.titre,
        categorie_materiel: planForm.categorie_materiel,
        periodicite_heures: planForm.periodicite_heures,
        periodicite_km: planForm.periodicite_km,
        operations_programmees: ops,
        pieces_recommandees: [],
        est_actif: true
      }

      const { error } = await supabaseTenant('btp_maintenance_plans').insert([payload])
      if (error) throw error

      toast.success('Plan enregistré', `Le plan "${planForm.titre}" est désormais actif.`)
      setShowPlanModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur plan', err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-amber-600" />
            Maintenance Préventive & Corrective BTP
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Interventions par seuils de compteurs d'heures, pannes sur chantier et plans d'entretien constructeur.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('ORDRES')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition',
                activeTab === 'ORDRES' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Ordres de Maintenance ({ordres.length})
            </button>
            <button
              onClick={() => setActiveTab('PLANS')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition',
                activeTab === 'PLANS' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Plans d'Entretien ({plans.length})
            </button>
          </div>

          <button
            onClick={() => activeTab === 'ORDRES' ? setShowOrderModal(true) : setShowPlanModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'ORDRES' ? 'Nouvelle Intervention' : 'Nouveau Plan'}
          </button>
        </div>
      </div>

      {/* ── Onglet Ordres de Maintenance ── */}
      {activeTab === 'ORDRES' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {ordres.length === 0 ? (
            <div className="text-center py-12 p-6">
              <Wrench className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucune intervention de maintenance</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                Déclarez une panne ou planifiez la révision périodique d'un engin.
              </p>
              <button
                onClick={() => setShowOrderModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Déclarer une Intervention
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">N° OM</th>
                    <th className="py-3 px-4">Engin / Matériel</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Urgence</th>
                    <th className="py-3 px-4">Compteur</th>
                    <th className="py-3 px-4">Temps Arrêt</th>
                    <th className="py-3 px-4 text-right">Coût Total</th>
                    <th className="py-3 px-4">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ordres.map((om) => {
                    const mat = om.materiel || materiels.find(m => m.id === om.materiel_id)

                    return (
                      <tr key={om.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white">
                          {om.numero_om}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          <span className="text-amber-700 dark:text-amber-400 mr-1.5">{mat?.code_materiel || 'ENG'}</span>
                          <span>{mat?.designation || 'Matériel BTP'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={clsx(
                            'px-2 py-0.5 rounded text-[10px] font-bold',
                            om.type_intervention === 'CORRECTIVE_PANNE' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          )}>
                            {om.type_intervention === 'CORRECTIVE_PANNE' ? 'Panne Chantier' : 'Entretien Préventif'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={clsx(
                            'font-bold text-[11px]',
                            om.urgence === 'URGENCE_ARRET_CHANTIER' ? 'text-rose-600 font-black' :
                            om.urgence === 'HAUTE' ? 'text-amber-600' : 'text-slate-600'
                          )}>
                            {om.urgence}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {Number(om.compteur_au_declenchement || 0).toLocaleString()} {mat?.type_compteur === 'HEURES_MOTEUR' ? 'h' : 'km'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {om.temps_arret_heures ? `${om.temps_arret_heures} h d'arrêt` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                          {fmt(om.cout_total || 0)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {om.statut}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Plans d'Entretien ── */}
      {activeTab === 'PLANS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((pln) => (
            <div key={pln.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                    {pln.categorie_materiel || 'Tous engins'}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-600">
                    {pln.periodicite_heures ? `Toutes les ${pln.periodicite_heures}h` : `${pln.periodicite_km} km`}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-2">{pln.titre}</h3>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 my-3">
                  <p className="text-[11px] font-bold uppercase text-slate-400 mb-2">Opérations prévues :</p>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {(pln.operations_programmees || []).map((op, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span>{op}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex justify-between">
                <span>Plan actif</span>
                <span>Configuré BTP</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modale Formulaire Intervention ── */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" />
                Déclarer un Ordre de Maintenance BTP
              </h3>
              <button onClick={() => setShowOrderModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Matériel Concerné *
                </label>
                <select
                  required
                  value={orderForm.materiel_id}
                  onChange={(e) => setOrderForm({ ...orderForm, materiel_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">-- Sélectionner l'engin ou le camion --</option>
                  {materiels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.code_materiel} — {m.designation} ({m.categorie})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Type d'Intervention
                  </label>
                  <select
                    value={orderForm.type_intervention}
                    onChange={(e) => setOrderForm({ ...orderForm, type_intervention: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="PREVENTIVE">Entretien Préventif Programmé</option>
                    <option value="CORRECTIVE_PANNE">Panne sur Chantier / Correctif</option>
                    <option value="DIAGNOSTIC">Diagnostic & Contrôle</option>
                    <option value="CONTROLE_LEGAL">Contrôle Réglementaire / Visite</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Degré d'Urgence
                  </label>
                  <select
                    value={orderForm.urgence}
                    onChange={(e) => setOrderForm({ ...orderForm, urgence: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="NORMALE">Normale</option>
                    <option value="HAUTE">Haute</option>
                    <option value="URGENCE_ARRET_CHANTIER">Arrêt Chantier Critique</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Diagnostic de Panne / Constat
                </label>
                <textarea
                  rows={2}
                  value={orderForm.diagnostic_panne}
                  onChange={(e) => setOrderForm({ ...orderForm, diagnostic_panne: e.target.value })}
                  placeholder="Description des symptômes ou de la panne..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Coût Pièces (FCFA)
                  </label>
                  <input
                    type="number"
                    value={orderForm.cout_pieces}
                    onChange={(e) => setOrderForm({ ...orderForm, cout_pieces: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Coût MO Interne (FCFA)
                  </label>
                  <input
                    type="number"
                    value={orderForm.cout_main_oeuvre}
                    onChange={(e) => setOrderForm({ ...orderForm, cout_main_oeuvre: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Prestataire Externe (FCFA)
                  </label>
                  <input
                    type="number"
                    value={orderForm.cout_prestataire}
                    onChange={(e) => setOrderForm({ ...orderForm, cout_prestataire: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Valider l'Intervention
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Formulaire Plan ── */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white">Nouveau Plan de Maintenance</h3>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Titre du Plan *
                </label>
                <input
                  type="text"
                  required
                  value={planForm.titre}
                  onChange={(e) => setPlanForm({ ...planForm, titre: e.target.value })}
                  placeholder="Ex: Entretien 250H Pelles et Chargeuses"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Périodicité (Heures)
                  </label>
                  <input
                    type="number"
                    value={planForm.periodicite_heures}
                    onChange={(e) => setPlanForm({ ...planForm, periodicite_heures: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Périodicité (KM)
                  </label>
                  <input
                    type="number"
                    value={planForm.periodicite_km}
                    onChange={(e) => setPlanForm({ ...planForm, periodicite_km: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Opérations Programmées (séparées par des virgules)
                </label>
                <textarea
                  rows={3}
                  value={planForm.operations_programmees}
                  onChange={(e) => setPlanForm({ ...planForm, operations_programmees: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Enregistrer le Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpMaintenancePage
