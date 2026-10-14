// =============================================================================
// GESTIO 229 SaaS — Affectation des Mécaniciens & Suivi Travaux Parc BTP
// Conforme Spécification Section Module 1.2
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Search, Wrench, Clock, CheckCircle2,
  AlertTriangle, UserCheck, ShieldCheck, Edit3, X,
  FileText, Calendar, Award, Check
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import {
  BtpReparationMecanicien,
  BtpOrdreReparation,
  GarageMecanicien
} from '../../../../services/garageService'
import clsx from 'clsx'

const SPECIALITES_BTP = [
  'Mécanique générale',
  'Circuit hydraulique & Vérins',
  'Moteur diesel lourd & Culasse',
  'Électricité & Électronique engins',
  'Transmission & Boîtes powershift',
  'Pneumatique & Trains de roulement',
  'Soudure & Chaudronnerie godets',
  'Climatisation cabine'
]

export const BtpMecaniciensAffectationPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('ALL')

  const [affectations, setAffectations] = useState<BtpReparationMecanicien[]>([])
  const [ordres, setOrdres] = useState<BtpOrdreReparation[]>([])
  const [mecaniciens, setMecaniciens] = useState<GarageMecanicien[]>([])

  // Modale Nouvelle Affectation
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    ordre_id: '',
    mecanicien_id: '',
    fonction_intervention: 'Intervenant principal',
    specialite: 'Mécanique générale',
    temps_prevu_heures: 4,
    taches_attribuees: '',
    observations_chef_atelier: ''
  })

  // Modale Saisie Compte-Rendu / Heures réelles
  const [rapportModal, setRapportModal] = useState<BtpReparationMecanicien | null>(null)
  const [rapportForm, setRapportForm] = useState({
    temps_reel_heures: 0,
    compte_rendu: '',
    difficultes_rencontrees: '',
    statut_tache: 'TERMINE' as 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'SUSPENDU'
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [affRes, ordRes, mecRes] = await Promise.all([
        supabaseTenant('btp_reparation_mecaniciens').select('*').order('date_affectation', { ascending: false }),
        supabaseTenant('btp_ordres_reparation').select('*').neq('statut', 'ANNULE').order('created_at', { ascending: false }),
        supabaseTenant('garage_mecaniciens').select('*').order('nom_complet')
      ])

      setAffectations(affRes.data || [])
      setOrdres(ordRes.data || [])
      setMecaniciens(mecRes.data || [])
    } catch (err: any) {
      console.warn('[BtpMecaniciensAffectation] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSelectMecanicien = (mecId: string) => {
    const mec = mecaniciens.find(m => m.id === mecId)
    setForm(prev => ({
      ...prev,
      mecanicien_id: mecId,
      specialite: mec?.specialite || prev.specialite
    }))
  }

  const handleCreateAffectation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.ordre_id || !form.mecanicien_id) {
      toast.error('Champs requis', 'Veuillez sélectionner un ordre de réparation et un mécanicien.')
      return
    }

    setSubmitting(true)
    try {
      const mec = mecaniciens.find(m => m.id === form.mecanicien_id)
      const payload: Partial<BtpReparationMecanicien> = {
        company_id: companyId || '',
        ordre_id: form.ordre_id,
        mecanicien_id: form.mecanicien_id,
        nom_mecanicien: mec?.nom_complet || 'Mécanicien',
        specialite: form.specialite,
        fonction_intervention: form.fonction_intervention,
        temps_prevu_heures: Number(form.temps_prevu_heures) || 0,
        temps_reel_heures: 0,
        taches_attribuees: form.taches_attribuees || undefined,
        observations_chef_atelier: form.observations_chef_atelier || undefined,
        statut_tache: 'EN_ATTENTE',
        date_affectation: new Date().toISOString()
      }

      const { error } = await supabaseTenant('btp_reparation_mecaniciens').insert([payload])
      if (error) throw error

      // Mettre à jour le statut de l'ordre en MECANICIEN_AFFECTE si pas encore démarré
      await supabaseTenant('btp_ordres_reparation')
        .update({
          statut: 'MECANICIEN_AFFECTE',
          updated_at: new Date().toISOString()
        })
        .eq('id', form.ordre_id)
        .eq('statut', 'VALIDE')

      toast.success('Affectation enregistrée', `${mec?.nom_complet} a été affecté à l'intervention.`)
      setShowModal(false)
      setForm({
        ordre_id: '',
        mecanicien_id: '',
        fonction_intervention: 'Intervenant principal',
        specialite: 'Mécanique générale',
        temps_prevu_heures: 4,
        taches_attribuees: '',
        observations_chef_atelier: ''
      })
      loadData()
    } catch (err: any) {
      console.error('[handleCreateAffectation] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible d\'enregistrer l\'affectation.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveRapport = async () => {
    if (!rapportModal) return
    setSubmitting(true)
    try {
      const updates = {
        temps_reel_heures: Number(rapportForm.temps_reel_heures) || 0,
        compte_rendu: rapportForm.compte_rendu || undefined,
        difficultes_rencontrees: rapportForm.difficultes_rencontrees || undefined,
        statut_tache: rapportForm.statut_tache,
        date_fin_travail: rapportForm.statut_tache === 'TERMINE' ? new Date().toISOString() : undefined
      }

      const { error } = await supabaseTenant('btp_reparation_mecaniciens')
        .update(updates)
        .eq('id', rapportModal.id)

      if (error) throw error

      toast.success('Rapport enregistré', 'Les heures réelles et le compte rendu ont été mis à jour.')
      setRapportModal(null)
      loadData()
    } catch (err: any) {
      console.error('[handleSaveRapport] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible de mettre à jour le rapport.')
    } finally {
      setSubmitting(false)
    }
  }

  const getOrdreLabel = (ordreId: string) => {
    const o = ordres.find(x => x.id === ordreId)
    return o ? `${o.numero_or} — ${o.code_materiel || 'Engin'} (${o.marque || ''} ${o.modele || ''})` : ordreId
  }

  const filteredAffectations = affectations.filter(a => {
    const matchSearch =
      a.nom_mecanicien.toLowerCase().includes(search.toLowerCase()) ||
      a.specialite.toLowerCase().includes(search.toLowerCase()) ||
      (a.taches_attribuees && a.taches_attribuees.toLowerCase().includes(search.toLowerCase()))
    const matchStatut = filterStatut === 'ALL' || a.statut_tache === filterStatut
    return matchSearch && matchStatut
  })

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Gestion de la Main d'Œuvre BTP</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Affectation des Mécaniciens & Tâches
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Répartition des techniciens par spécialité, suivi des temps prévus/réels et comptes rendus d'intervention.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Affecter un mécanicien</span>
        </button>
      </div>

      {/* ── Cartes Synthèse ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400">Total Affectations</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{affectations.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-amber-500">Tâches en cours</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {affectations.filter(a => a.statut_tache === 'EN_COURS').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-emerald-500">Tâches terminées</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {affectations.filter(a => a.statut_tache === 'TERMINE').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-blue-500">Heures Réalisées</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {affectations.reduce((sum, a) => sum + (Number(a.temps_reel_heures) || 0), 0)} h
          </p>
        </div>
      </div>

      {/* ── Barre de recherche & Filtres ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher mécanicien, spécialité, tâche..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'EN_ATTENTE', 'EN_COURS', 'TERMINE'].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatut(st)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer',
                filterStatut === st
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              )}
            >
              {st === 'ALL' && 'Toutes'}
              {st === 'EN_ATTENTE' && 'En attente'}
              {st === 'EN_COURS' && 'En cours'}
              {st === 'TERMINE' && 'Terminées'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Liste des Affectations ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Chargement des affectations...</p>
          </div>
        ) : filteredAffectations.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucune tâche affectée</p>
            <p className="text-xs text-slate-400 mt-1">Affectez un mécanicien à un ordre de réparation ouvert.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredAffectations.map(aff => (
              <div key={aff.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {aff.nom_mecanicien}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400">
                      {aff.specialite}
                    </span>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-black uppercase',
                      aff.statut_tache === 'EN_ATTENTE' && 'bg-slate-100 text-slate-600',
                      aff.statut_tache === 'EN_COURS' && 'bg-amber-100 text-amber-700 border border-amber-300',
                      aff.statut_tache === 'TERMINE' && 'bg-emerald-100 text-emerald-700'
                    )}>
                      {aff.statut_tache}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Ordre :</strong> {getOrdreLabel(aff.ordre_id)}
                  </p>

                  {aff.taches_attribuees && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <strong>Tâche :</strong> {aff.taches_attribuees}
                    </p>
                  )}

                  {aff.compte_rendu && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl">
                      <strong>Compte rendu :</strong> {aff.compte_rendu}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                    <span>Temps prévu : <strong>{aff.temps_prevu_heures} h</strong></span>
                    <span>Temps réel : <strong className="text-slate-700 dark:text-slate-200">{aff.temps_reel_heures} h</strong></span>
                    <span>Affecté le : {new Date(aff.date_affectation).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setRapportModal(aff)
                      setRapportForm({
                        temps_reel_heures: aff.temps_reel_heures || aff.temps_prevu_heures,
                        compte_rendu: aff.compte_rendu || '',
                        difficultes_rencontrees: aff.difficultes_rencontrees || '',
                        statut_tache: aff.statut_tache
                      })
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Saisir Compte-Rendu</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Nouvelle Affectation ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Affectation Mécanicien
                  </h3>
                  <p className="text-xs text-slate-400">Attribuer une tâche d'intervention sur engin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAffectation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Ordre de Réparation *
                </label>
                <select
                  required
                  value={form.ordre_id}
                  onChange={e => setForm(prev => ({ ...prev, ordre_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">Sélectionner un ordre...</option>
                  {ordres.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.numero_or} — {o.code_materiel || 'Engin'} ({o.description_panne.substring(0, 40)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Mécanicien / Technicien *
                </label>
                <select
                  required
                  value={form.mecanicien_id}
                  onChange={e => handleSelectMecanicien(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">Sélectionner un mécanicien...</option>
                  {mecaniciens.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nom_complet} — {m.specialite}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Spécialité requise
                  </label>
                  <select
                    value={form.specialite}
                    onChange={e => setForm(prev => ({ ...prev, specialite: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    {SPECIALITES_BTP.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Temps prévu (heures)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.temps_prevu_heures}
                    onChange={e => setForm(prev => ({ ...prev, temps_prevu_heures: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Tâches spécifiques attribuées
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Dépose du vérin, changement des joints toriques, purge et essais..."
                  value={form.taches_attribuees}
                  onChange={e => setForm(prev => ({ ...prev, taches_attribuees: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md shadow-amber-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : 'Valider l\'affectation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Compte Rendu & Heures Réelles ── */}
      {rapportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Compte Rendu d'Intervention
                </h3>
                <p className="text-xs text-slate-400">Mécanicien : {rapportModal.nom_mecanicien}</p>
              </div>
              <button
                type="button"
                onClick={() => setRapportModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Heures réelles effectuées
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={rapportForm.temps_reel_heures}
                    onChange={e => setRapportForm(prev => ({ ...prev, temps_reel_heures: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Statut de la tâche
                  </label>
                  <select
                    value={rapportForm.statut_tache}
                    onChange={e => setRapportForm(prev => ({ ...prev, statut_tache: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="EN_COURS">En cours</option>
                    <option value="TERMINE">Terminée</option>
                    <option value="SUSPENDU">Suspendue</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Compte rendu des travaux réalisés
                </label>
                <textarea
                  rows={3}
                  placeholder="Détail des réparations faites, pièces remplacées..."
                  value={rapportForm.compte_rendu}
                  onChange={e => setRapportForm(prev => ({ ...prev, compte_rendu: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Difficultés rencontrées / Pièces supplémentaires
                </label>
                <input
                  type="text"
                  placeholder="Ex: Boulonnerie grippée, délai d'obtention filtre..."
                  value={rapportForm.difficultes_rencontrees}
                  onChange={e => setRapportForm(prev => ({ ...prev, difficultes_rencontrees: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRapportModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveRapport}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md shadow-amber-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Enregistrement...' : 'Valider le rapport'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpMecaniciensAffectationPage
