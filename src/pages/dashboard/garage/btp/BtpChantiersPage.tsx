// =============================================================================
// GESTIO 229 SaaS — Chantiers BTP & Affectations Matériels
// Conforme Spécification Section 5.8
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  HardHat, Plus, Search, Building2, Truck, Calendar,
  DollarSign, CheckCircle2, AlertTriangle, ArrowRight, X, RefreshCw
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { BtpChantier, BtpMateriel, BtpAffectationMateriel } from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BtpChantiersPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [chantiers, setChantiers] = useState<BtpChantier[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [affectations, setAffectations] = useState<BtpAffectationMateriel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modale Nouveau Chantier
  const [showChantierModal, setShowChantierModal] = useState(false)
  const [chantierForm, setChantierForm] = useState({
    code_chantier: '',
    nom_chantier: '',
    client_nom: '',
    chef_chantier_nom: '',
    chef_chantier_tel: '',
    localisation: '',
    ville: 'Cotonou',
    budget_previsionnel: 0,
    date_debut: new Date().toISOString().split('T')[0],
    date_fin_prevue: '',
    statut: 'EN_COURS'
  })

  // Modale Affecter Matériel au Chantier
  const [showAffectModal, setShowAffectModal] = useState(false)
  const [affectForm, setAffectForm] = useState({
    chantier_id: '',
    materiel_id: '',
    compteur_depart: 0,
    conducteur_nom: '',
    date_retour_prevue: '',
    taux_horaire_facturation_interne: 25000
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [chtRes, matRes, affRes] = await Promise.all([
        supabaseTenant('btp_chantiers').select('*').order('created_at', { ascending: false }),
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_affectations_materiels').select('*').order('date_affectation', { ascending: false })
      ])

      setChantiers(chtRes.data || [])
      setMateriels(matRes.data || [])
      setAffectations(affRes.data || [])
    } catch (err: any) {
      console.warn('[BtpChantiers] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreateChantier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chantierForm.code_chantier.trim() || !chantierForm.nom_chantier.trim()) {
      toast.error('Champs requis', 'Veuillez renseigner le code et le nom du chantier.')
      return
    }

    try {
      const payload: Partial<BtpChantier> = {
        company_id: companyId || '',
        ...chantierForm,
        code_chantier: chantierForm.code_chantier.toUpperCase().trim(),
        statut: chantierForm.statut as any
      }

      const { error } = await supabaseTenant('btp_chantiers').insert([payload])
      if (error) throw error

      toast.success('Chantier créé', `Le chantier ${chantierForm.nom_chantier} a été enregistré.`)
      setShowChantierModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur chantier', err.message)
    }
  }

  const handleAffecterMateriel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!affectForm.chantier_id || !affectForm.materiel_id) {
      toast.error('Sélection requise', 'Veuillez sélectionner un chantier et un matériel.')
      return
    }

    try {
      const mat = materiels.find(m => m.id === affectForm.materiel_id)
      const cht = chantiers.find(c => c.id === affectForm.chantier_id)

      const payload: Partial<BtpAffectationMateriel> = {
        company_id: companyId || '',
        chantier_id: affectForm.chantier_id,
        chantier_nom: cht?.nom_chantier,
        materiel_id: affectForm.materiel_id,
        materiel_code: mat?.code_materiel,
        compteur_depart: affectForm.compteur_depart,
        conducteur_nom: affectForm.conducteur_nom || mat?.conducteur_habituel_nom,
        date_retour_prevue: affectForm.date_retour_prevue || undefined,
        taux_horaire_facturation_interne: affectForm.taux_horaire_facturation_interne,
        heures_ou_km_effectues: 0,
        cout_total_interne: 0,
        statut: 'EN_COURS'
      }

      const { error } = await supabaseTenant('btp_affectations_materiels').insert([payload])
      if (error) throw error

      // Mettre à jour l'engin vers le statut AFFECTE_CHANTIER
      await supabaseTenant('btp_materiels')
        .update({
          statut: 'AFFECTE_CHANTIER',
          site_nom: cht?.nom_chantier
        })
        .eq('id', affectForm.materiel_id)

      toast.success('Matériel mobilisé', `L'engin ${mat?.code_materiel} est maintenant affecté au chantier ${cht?.nom_chantier}.`)
      setShowAffectModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur affectation', err.message)
    }
  }

  const filteredChantiers = chantiers.filter(c =>
    !search ||
    c.code_chantier.toLowerCase().includes(search.toLowerCase()) ||
    c.nom_chantier.toLowerCase().includes(search.toLowerCase()) ||
    c.client_nom.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <HardHat className="w-6 h-6 text-amber-600" />
            Chantiers BTP & Affectations Matériels
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Déploiement des engins et camions sur chantiers, relevés compteurs départ/retour et budgets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAffectModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            Affecter un Matériel
          </button>
          <button
            onClick={() => setShowChantierModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouveau Chantier
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

      {/* ── Recherche ── */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par code, nom de chantier ou client..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
      </div>

      {/* ── Grille des Chantiers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredChantiers.map((c) => {
          const enginsSurChantier = affectations.filter(a => a.chantier_id === c.id && a.statut === 'EN_COURS')

          return (
            <div key={c.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-black text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-md">
                    {c.code_chantier}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                    {c.statut}
                  </span>
                </div>

                <h3 className="text-lg font-black text-slate-900 dark:text-white">{c.nom_chantier}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Client : <strong>{c.client_nom}</strong> — Ville : {c.ville}</p>

                <div className="grid grid-cols-2 gap-3 my-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Budget Alloué</span>
                    <strong className="text-slate-900 dark:text-white font-black">{fmt(c.budget_previsionnel || 0)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Chef de Chantier</span>
                    <strong className="text-slate-900 dark:text-white">{c.chef_chantier_nom || 'Non assigné'}</strong>
                  </div>
                </div>

                {/* Engins mobilisés sur ce chantier */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Matériels Mobilisés sur Site ({enginsSurChantier.length}) :
                  </h4>
                  {enginsSurChantier.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Aucun engin affecté actuellement à ce chantier.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {enginsSurChantier.map(a => (
                        <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-bold">
                          <Truck className="w-3.5 h-3.5" />
                          <span>{a.materiel_code || 'Engin'}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
                <span>Démarré le {new Date(c.date_debut).toLocaleDateString()}</span>
                {c.date_fin_prevue && <span>Fin prévue : {new Date(c.date_fin_prevue).toLocaleDateString()}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modale Formulaire Chantier ── */}
      {showChantierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white">Créer un Chantier BTP</h3>
              <button onClick={() => setShowChantierModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChantier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Code Chantier *
                </label>
                <input
                  type="text"
                  required
                  value={chantierForm.code_chantier}
                  onChange={(e) => setChantierForm({ ...chantierForm, code_chantier: e.target.value })}
                  placeholder="Ex: CHT-2026-RNIE1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nom du Chantier *
                </label>
                <input
                  type="text"
                  required
                  value={chantierForm.nom_chantier}
                  onChange={(e) => setChantierForm({ ...chantierForm, nom_chantier: e.target.value })}
                  placeholder="Ex: Bitumage Axe Cotonou - Ouidah"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Client / Maître d'Ouvrage *
                </label>
                <input
                  type="text"
                  required
                  value={chantierForm.client_nom}
                  onChange={(e) => setChantierForm({ ...chantierForm, client_nom: e.target.value })}
                  placeholder="Ministère, Particulier ou Société"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Chef de Chantier
                  </label>
                  <input
                    type="text"
                    value={chantierForm.chef_chantier_nom}
                    onChange={(e) => setChantierForm({ ...chantierForm, chef_chantier_nom: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Budget (FCFA)
                  </label>
                  <input
                    type="number"
                    value={chantierForm.budget_previsionnel}
                    onChange={(e) => setChantierForm({ ...chantierForm, budget_previsionnel: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowChantierModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Créer le Chantier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Formulaire Affectation ── */}
      {showAffectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white">Affecter un Engin au Chantier</h3>
              <button onClick={() => setShowAffectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAffecterMateriel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Chantier Destinataire *
                </label>
                <select
                  required
                  value={affectForm.chantier_id}
                  onChange={(e) => setAffectForm({ ...affectForm, chantier_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">-- Sélectionner le chantier --</option>
                  {chantiers.map(c => (
                    <option key={c.id} value={c.id}>{c.code_chantier} — {c.nom_chantier}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Matériel / Engin *
                </label>
                <select
                  required
                  value={affectForm.materiel_id}
                  onChange={(e) => {
                    const mId = e.target.value
                    const m = materiels.find(x => x.id === mId)
                    setAffectForm({
                      ...affectForm,
                      materiel_id: mId,
                      compteur_depart: m ? (m.type_compteur === 'HEURES_MOTEUR' ? m.compteur_heures_actuel : m.compteur_km_actuel) : 0,
                      conducteur_nom: m?.conducteur_habituel_nom || ''
                    })
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">-- Sélectionner l'engin disponible --</option>
                  {materiels.map(m => (
                    <option key={m.id} value={m.id}>{m.code_materiel} — {m.designation}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compteur Départ
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={affectForm.compteur_depart}
                    onChange={(e) => setAffectForm({ ...affectForm, compteur_depart: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Chauffeur / Opérateur
                  </label>
                  <input
                    type="text"
                    value={affectForm.conducteur_nom}
                    onChange={(e) => setAffectForm({ ...affectForm, conducteur_nom: e.target.value })}
                    placeholder="Nom de l'opérateur"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAffectModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Mobiliser sur Chantier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpChantiersPage
