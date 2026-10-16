// =============================================================================
// GESTIO 229 SaaS — Module Pédagogie, Matières & Emploi du Temps
// Détection automatique de conflits de salle et d'enseignants
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Calendar, Clock, Plus, BookOpen, Users, Building,
  AlertTriangle, CheckCircle2, X, Check, Filter, Layers,
  Sparkles, Trash2, Edit2
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { supabase } from '../../../lib/supabase'
import {
  getClasses, getMatieres, getEnseignants, getSalles,
  getEmploiDuTemps, checkEmploiDuTempsConflit
} from '../../../services/ecoleService'
import { showConfirm } from '../../../components/modals/CustomModalGestio'

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const CRENEAUX = [
  '08:00 - 10:00',
  '10:15 - 12:15',
  '15:00 - 17:00',
  '17:15 - 19:15'
]

export const EcolePedagogiePage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<any[]>([])
  const [matieres, setMatieres] = useState<any[]>([])
  const [enseignants, setEnseignants] = useState<any[]>([])
  const [salles, setSalles] = useState<any[]>([])
  const [selectedClasse, setSelectedClasse] = useState('')
  const [emploiDuTemps, setEmploiDuTemps] = useState<any[]>([])

  // Modal ajout créneau
  const [showAddModal, setShowAddModal] = useState(false)
  const [conflitAlerte, setConflitAlerte] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    classe_id: '',
    matiere_id: '',
    enseignant_id: '',
    salle_id: '',
    jour_semaine: 'LUNDI',
    heure_debut: '08:00',
    heure_fin: '10:00',
    couleur: '#84cc16'
  })

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cls, mat, ens, sal] = await Promise.all([
        getClasses(companyId),
        getMatieres(companyId),
        getEnseignants(companyId),
        getSalles(companyId)
      ])

      setClasses(cls || [])
      setMatieres(mat || [])
      setEnseignants(ens || [])
      setSalles(sal || [])

      const initialClasseId = cls?.[0]?.id || ''
      setSelectedClasse(initialClasseId)

      if (initialClasseId) {
        const edt = await getEmploiDuTemps(companyId, initialClasseId)
        setEmploiDuTemps(edt || [])
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Impossible de charger les données pédagogiques.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleSelectClasse = async (classeId: string) => {
    setSelectedClasse(classeId)
    setLoading(true)
    try {
      const edt = await getEmploiDuTemps(companyId, classeId)
      setEmploiDuTemps(edt || [])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAdd = (jour?: string, heureDebut?: string, heureFin?: string) => {
    setConflitAlerte(null)
    setFormData({
      classe_id: selectedClasse || classes[0]?.id || '',
      matiere_id: matieres[0]?.id || '',
      enseignant_id: enseignants[0]?.id || '',
      salle_id: salles[0]?.id || '',
      jour_semaine: jour || 'LUNDI',
      heure_debut: heureDebut || '08:00',
      heure_fin: heureFin || '10:00',
      couleur: '#84cc16'
    })
    setShowAddModal(true)
  }

  const handleCheckAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setConflitAlerte(null)

    try {
      // 1. Détection de conflits horaire / salle / enseignant
      const conflit = await checkEmploiDuTempsConflit(companyId, {
        jour: formData.jour_semaine,
        heureDebut: formData.heure_debut,
        heureFin: formData.heure_fin,
        salleId: formData.salle_id,
        enseignantId: formData.enseignant_id
      })

      if (conflit.hasConflict) {
        setConflitAlerte(conflit.reason || 'Conflit de planning détecté !')
        setSubmitting(false)
        return
      }

      // 2. Insertion
      const { error } = await supabase.from('ecole_emplois_du_temps').insert([{
        company_id: companyId,
        classe_id: formData.classe_id,
        matiere_id: formData.matiere_id,
        enseignant_id: formData.enseignant_id || null,
        salle_id: formData.salle_id || null,
        jour_semaine: formData.jour_semaine,
        heure_debut: formData.heure_debut,
        heure_fin: formData.heure_fin,
        couleur: formData.couleur
      }])

      if (error) throw error

      toast.success('Séance ajoutée !', 'Le cours a été programmé sans aucun conflit.')
      setShowAddModal(false)

      const updated = await getEmploiDuTemps(companyId, selectedClasse)
      setEmploiDuTemps(updated || [])
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Impossible d\'ajouter le cours.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSlot = async (id: string) => {
    const ok = await showConfirm('Voulez-vous vraiment retirer cette séance de cours ?', 'Retirer le cours')
    if (!ok) return
    try {
      await supabase.from('ecole_emplois_du_temps').delete().eq('id', id)
      toast.success('Séance supprimée.')
      const updated = await getEmploiDuTemps(companyId, selectedClasse)
      setEmploiDuTemps(updated || [])
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Pédagogie & Emploi du Temps Hebdomadaire
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
              Anti-conflit intelligent
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Planification des cours, allocation des salles et vérification en temps réel des disponibilités des enseignants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenAdd()}
            className="px-4 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-lime-600/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Programmer un Cours</span>
          </button>
        </div>
      </div>

      {/* ── SÉLECTION DE LA CLASSE ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Classe affichée :</span>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectClasse(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedClasse === c.id
                    ? 'bg-lime-600 text-white shadow-md shadow-lime-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {c.nom}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>{matieres.length} matières</span>
          <span>•</span>
          <span>{enseignants.length} enseignants</span>
          <span>•</span>
          <span>{salles.length} salles</span>
        </div>
      </div>

      {/* ── GRILLE DE L'EMPLOI DU TEMPS ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 overflow-x-auto shadow-sm">
        <div className="min-w-[800px] grid grid-cols-6 gap-3">
          {JOURS.map((jour) => {
            const slotsDuJour = emploiDuTemps.filter((s) => s.jour_semaine === jour)

            return (
              <div key={jour} className="space-y-3">
                <div className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-center font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {jour}
                </div>

                <div className="space-y-2.5 min-h-[350px]">
                  {slotsDuJour.length === 0 ? (
                    <div
                      onClick={() => handleOpenAdd(jour)}
                      className="h-28 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-2 text-slate-400 hover:border-lime-500 hover:text-lime-600 cursor-pointer transition-colors text-center"
                    >
                      <Plus className="w-5 h-5 mb-1" />
                      <span className="text-[11px] font-medium">Ajouter cours</span>
                    </div>
                  ) : (
                    slotsDuJour.map((slot) => {
                      const mat = matieres.find((m) => m.id === slot.matiere_id)
                      const prof = enseignants.find((e) => e.id === slot.enseignant_id)
                      const salle = salles.find((s) => s.id === slot.salle_id)

                      return (
                        <div
                          key={slot.id}
                          className="p-3 rounded-xl border border-lime-500/20 bg-lime-50 dark:bg-lime-950/30 shadow-sm relative group hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="font-mono text-[10px] font-bold text-lime-700 dark:text-lime-300 bg-lime-200/60 dark:bg-lime-900/60 px-1.5 py-0.5 rounded">
                              {slot.heure_debut} - {slot.heure_fin}
                            </span>
                            <button
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                              title="Retirer la séance"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <p className="font-bold text-slate-900 dark:text-white text-xs leading-snug">
                            {mat?.nom || 'Matière'}
                          </p>

                          {prof && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                              Prof : {prof.nom} {prof.prenom}
                            </p>
                          )}

                          {salle && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                              <Building className="w-3 h-3" />
                              <span>Salle : {salle.nom}</span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}

                  <button
                    onClick={() => handleOpenAdd(jour)}
                    className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Créneau</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MODAL PROGRAMMATION DE COURS ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-lime-600" />
                  Programmer une Séance de Cours
                </h3>
                <p className="text-xs text-slate-500">
                  Détection instantanée des conflits de salle et d'enseignant
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {conflitAlerte && (
              <div className="mb-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>{conflitAlerte}</span>
              </div>
            )}

            <form onSubmit={handleCheckAndSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Matière / Module *
                </label>
                <select
                  required
                  value={formData.matiere_id}
                  onChange={(e) => setFormData({ ...formData, matiere_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">Sélectionner une matière</option>
                  {matieres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Enseignant / Formateur
                  </label>
                  <select
                    value={formData.enseignant_id}
                    onChange={(e) => setFormData({ ...formData, enseignant_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Non assigné</option>
                    {enseignants.map((ens) => (
                      <option key={ens.id} value={ens.id}>
                        {ens.nom} {ens.prenom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Salle de cours
                  </label>
                  <select
                    value={formData.salle_id}
                    onChange={(e) => setFormData({ ...formData, salle_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Non assignée</option>
                    {salles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom} ({s.capacite} places)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Jour
                  </label>
                  <select
                    value={formData.jour_semaine}
                    onChange={(e) => setFormData({ ...formData, jour_semaine: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {JOURS.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Début
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.heure_debut}
                    onChange={(e) => setFormData({ ...formData, heure_debut: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fin
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.heure_fin}
                    onChange={(e) => setFormData({ ...formData, heure_fin: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-lime-600/25 disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Valider la séance</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcolePedagogiePage
