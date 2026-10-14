// =============================================================================
// GESTIO 229 SaaS — Planning Atelier & Mécaniciens
// Conforme Spécification Section 4.5
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Calendar, Clock, Wrench, CheckCircle2,
  AlertTriangle, Phone, Award, DollarSign, X, RefreshCw, Layers
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { GarageMecanicien, GarageOrdreReparation } from '../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

const SPECIALITES_MECANIQUE = [
  'Mécanique générale',
  'Moteur & Culasse',
  'Électricité & Électronique',
  'Diagnostic valise & Capteurs',
  'Climatisation & Froid',
  'Freinage & Suspension',
  'Pneumatique & Géométrie',
  'Carrosserie & Tôlerie',
  'Peinture & Finition'
]

export const GaragePlanningPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [mecaniciens, setMecaniciens] = useState<GarageMecanicien[]>([])
  const [ordres, setOrdres] = useState<GarageOrdreReparation[]>([])
  const [loading, setLoading] = useState(true)

  // Modale Nouveau Mécanicien
  const [showModal, setShowModal] = useState(false)
  const [editingMec, setEditingMec] = useState<GarageMecanicien | null>(null)
  const [form, setForm] = useState({
    nom_complet: '',
    telephone: '',
    specialite: 'Mécanique générale',
    taux_horaire_facture: 5000,
    taux_horaire_cout: 2500,
    statut: 'DISPONIBLE'
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [mecRes, ordRes] = await Promise.all([
        supabaseTenant('garage_mecaniciens').select('*').order('nom_complet'),
        supabaseTenant('garage_ordres_reparation').select('*').eq('statut', 'EN_COURS')
      ])

      setMecaniciens(mecRes.data || [])
      setOrdres(ordRes.data || [])
    } catch (err: any) {
      console.warn('[GaragePlanning] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreateModal = () => {
    setEditingMec(null)
    setForm({
      nom_complet: '',
      telephone: '',
      specialite: 'Mécanique générale',
      taux_horaire_facture: 5000,
      taux_horaire_cout: 2500,
      statut: 'DISPONIBLE'
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nom_complet.trim()) {
      toast.error('Nom requis', 'Veuillez saisir le nom complet du mécanicien.')
      return
    }

    try {
      if (editingMec) {
        const { error } = await supabaseTenant('garage_mecaniciens')
          .update(form)
          .eq('id', editingMec.id)
        if (error) throw error
        toast.success('Mécanicien mis à jour', `La fiche de ${form.nom_complet} a été modifiée.`)
      } else {
        const { error } = await supabaseTenant('garage_mecaniciens').insert([{
          company_id: companyId,
          ...form
        }])
        if (error) throw error
        toast.success('Mécanicien enregistré', `${form.nom_complet} fait désormais partie de l'équipe.`)
      }
      setShowModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleDelete = async (mec: GarageMecanicien) => {
    if (!window.confirm(`Supprimer le technicien ${mec.nom_complet} ?`)) return
    try {
      const { error } = await supabaseTenant('garage_mecaniciens').delete().eq('id', mec.id)
      if (error) throw error
      toast.success('Supprimé', `${mec.nom_complet} a été retiré.`)
      loadData()
    } catch (err: any) {
      toast.error('Erreur suppression', err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Équipe de Mécaniciens & Planning Atelier
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestion des compétences, disponibilités, postes de travail et interventions en cours.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Ajouter un Technicien
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

      {/* ── Grille de l'Équipe ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {mecaniciens.map((mec) => {
          const ordresActifs = ordres.filter(o => o.mecanicien_id === mec.id || o.mecanicien_nom === mec.nom_complet)

          return (
            <div
              key={mec.id}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
                      {mec.nom_complet.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-slate-900 dark:text-white">{mec.nom_complet}</h3>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{mec.specialite}</p>
                    </div>
                  </div>

                  <span className={clsx(
                    'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                    mec.statut === 'DISPONIBLE' ? 'bg-emerald-100 text-emerald-800' :
                    mec.statut === 'EN_INTERVENTION' ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-600'
                  )}>
                    {mec.statut}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 my-4 border-t border-b border-slate-100 dark:border-slate-800 py-3">
                  {mec.telephone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{mec.telephone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Taux horaire facturé client :</span>
                    <strong className="text-slate-800 dark:text-slate-200">{fmt(mec.taux_horaire_facture || 0)}/h</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Coût horaire interne atelier :</span>
                    <strong className="text-slate-800 dark:text-slate-200">{fmt(mec.taux_horaire_cout || 0)}/h</strong>
                  </div>
                </div>

                {/* Interventions en cours */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Travaux en cours ({ordresActifs.length}) :
                  </p>
                  {ordresActifs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Aucune réparation assignée actuellement.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {ordresActifs.map(o => (
                        <div key={o.id} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs flex justify-between items-center">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{o.numero_or}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{o.immatriculation}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setEditingMec(mec)
                    setForm({
                      nom_complet: mec.nom_complet,
                      telephone: mec.telephone || '',
                      specialite: mec.specialite,
                      taux_horaire_facture: mec.taux_horaire_facture || 5000,
                      taux_horaire_cout: mec.taux_horaire_cout || 2500,
                      statut: mec.statut
                    })
                    setShowModal(true)
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(mec)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                >
                  Supprimer
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modale Formulaire Technicien ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                {editingMec ? 'Modifier Technicien' : 'Ajouter un Mécanicien'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nom Complet *
                </label>
                <input
                  type="text"
                  required
                  value={form.nom_complet}
                  onChange={(e) => setForm({ ...form, nom_complet: e.target.value })}
                  placeholder="Ex: Koffi Mensah"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Téléphone
                </label>
                <input
                  type="text"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  placeholder="+229 ..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Spécialité Principale
                </label>
                <select
                  value={form.specialite}
                  onChange={(e) => setForm({ ...form, specialite: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  {SPECIALITES_MECANIQUE.map(sp => (
                    <option key={sp} value={sp}>{sp}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Taux Horaire Facturé
                  </label>
                  <input
                    type="number"
                    value={form.taux_horaire_facture}
                    onChange={(e) => setForm({ ...form, taux_horaire_facture: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Coût Horaire Interne
                  </label>
                  <input
                    type="number"
                    value={form.taux_horaire_cout}
                    onChange={(e) => setForm({ ...form, taux_horaire_cout: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Statut
                </label>
                <select
                  value={form.statut}
                  onChange={(e) => setForm({ ...form, statut: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="DISPONIBLE">Disponible</option>
                  <option value="EN_INTERVENTION">En intervention</option>
                  <option value="CONGE">En congé</option>
                  <option value="INACTIF">Inactif</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
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

export default GaragePlanningPage
