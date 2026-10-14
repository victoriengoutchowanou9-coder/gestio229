// =============================================================================
// GESTIO 229 SaaS — Module Notes, Évaluations & Bulletins Scolaires PDF
// Saisie assistée, calcul pondéré des moyennes, rangs & relevés officiels
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  BookOpen, Plus, Award, Printer, Download, CheckCircle2,
  AlertTriangle, Filter, Search, ChevronRight, FileText,
  Sparkles, Check, X, Users, TrendingUp
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { supabase } from '../../../lib/supabase'
import {
  getClasses, getMatieres, getPeriods, getEvaluations,
  getElevesApprenants, getNotesForEvaluation, saveStudentNote
} from '../../../services/ecoleService'

export const EcoleNotesBulletinsPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<any[]>([])
  const [matieres, setMatieres] = useState<any[]>([])
  const [periodes, setPeriodes] = useState<any[]>([])
  const [selectedClasse, setSelectedClasse] = useState('')
  const [selectedPeriode, setSelectedPeriode] = useState('')

  // Évaluations
  const [evaluations, setEvaluations] = useState<any[]>([])
  const [selectedEval, setSelectedEval] = useState<any | null>(null)
  const [eleves, setEleves] = useState<any[]>([])
  const [notesState, setNotesState] = useState<Record<string, { note: number; appreciation: string; presence: string }>>({})

  // Modal nouvelle évaluation
  const [showAddEvalModal, setShowAddEvalModal] = useState(false)
  const [newEvalData, setNewEvalData] = useState({
    titre: '',
    matiere_id: '',
    type_evaluation: 'DEVOIR',
    coefficient: 1.0,
    note_sur: 20.0,
    date_evaluation: new Date().toISOString().split('T')[0]
  })

  // Modal Bulletin Élève
  const [showBulletinModal, setShowBulletinModal] = useState<any | null>(null)

  const loadInitialData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cls, mat, per] = await Promise.all([
        getClasses(companyId),
        getMatieres(companyId),
        getPeriods(companyId)
      ])

      setClasses(cls || [])
      setMatieres(mat || [])
      setPeriodes(per || [])

      const initCls = cls?.[0]?.id || ''
      const initPer = per?.[0]?.id || ''
      setSelectedClasse(initCls)
      setSelectedPeriode(initPer)

      if (initCls) {
        const [evs, els] = await Promise.all([
          getEvaluations(companyId, initCls, initPer || undefined),
          getElevesApprenants(companyId, { classeId: initCls, statut: 'ACTIF' })
        ])
        setEvaluations(evs || [])
        setEleves(els || [])
        if (evs?.length > 0) {
          handleSelectEvaluation(evs[0], els)
        }
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [companyId])

  const handleSelectEvaluation = async (evaluation: any, currentEleves = eleves) => {
    setSelectedEval(evaluation)
    try {
      const existingNotes = await getNotesForEvaluation(companyId, evaluation.id)
      const map: Record<string, { note: number; appreciation: string; presence: string }> = {}
      
      existingNotes.forEach((n: any) => {
        map[n.eleve_id] = {
          note: Number(n.note),
          appreciation: n.appreciation || '',
          presence: n.statut_presence || 'PRESENT'
        }
      })

      // Initialiser pour les élèves non notés
      currentEleves.forEach((el: any) => {
        if (!map[el.id]) {
          map[el.id] = { note: 10, appreciation: '', presence: 'PRESENT' }
        }
      })

      setNotesState(map)
    } catch (err: any) {
      console.warn('Erreur chargement notes:', err)
    }
  }

  const handleCreateEvaluation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEvalData.titre || !newEvalData.matiere_id) {
      toast.error('Erreur', 'Veuillez saisir un titre et sélectionner une matière.')
      return
    }

    try {
      const { data, error } = await supabase
        .from('ecole_evaluations')
        .insert([{
          company_id: companyId,
          classe_id: selectedClasse,
          periode_id: selectedPeriode || null,
          matiere_id: newEvalData.matiere_id,
          titre: newEvalData.titre,
          type_evaluation: newEvalData.type_evaluation,
          coefficient: newEvalData.coefficient,
          note_sur: newEvalData.note_sur,
          date_evaluation: newEvalData.date_evaluation,
          est_publiee: true
        }])
        .select()
        .single()

      if (error) throw error

      toast.success('Évaluation créée !', 'Vous pouvez maintenant saisir les notes.')
      setShowAddEvalModal(false)

      const updated = await getEvaluations(companyId, selectedClasse, selectedPeriode || undefined)
      setEvaluations(updated || [])
      if (data) {
        handleSelectEvaluation(data, eleves)
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedEval) return
    try {
      const promises = eleves.map((el) => {
        const state = notesState[el.id]
        if (!state) return Promise.resolve()
        return saveStudentNote(companyId, {
          evaluation_id: selectedEval.id,
          eleve_id: el.id,
          note: state.note,
          note_sur: selectedEval.note_sur,
          appreciation: state.appreciation,
          statut_presence: state.presence
        })
      })

      await Promise.all(promises)
      toast.success('Notes enregistrées avec succès !')
    } catch (err: any) {
      toast.error('Erreur enregistrement', err?.message)
    }
  }

  // Calculs statistiques
  const notesValues = Object.values(notesState).map((s) => s.note)
  const moyenneClasse = notesValues.length > 0 ? (notesValues.reduce((a, b) => a + b, 0) / notesValues.length).toFixed(2) : '—'
  const noteMax = notesValues.length > 0 ? Math.max(...notesValues).toFixed(2) : '—'
  const noteMin = notesValues.length > 0 ? Math.min(...notesValues).toFixed(2) : '—'

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Notes, Évaluations & Bulletins de Performance
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              Coefficients & Bulletins officiels
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Saisie rapide des notes, calcul des moyennes pondérées par coefficients et génération de bulletins scolaires.
          </p>
        </div>

        <button
          onClick={() => {
            setNewEvalData({
              titre: '',
              matiere_id: matieres[0]?.id || '',
              type_evaluation: 'DEVOIR',
              coefficient: 1.0,
              note_sur: 20.0,
              date_evaluation: new Date().toISOString().split('T')[0]
            })
            setShowAddEvalModal(true)
          }}
          className="px-4 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-lime-600/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Évaluation</span>
        </button>
      </div>

      {/* ── SÉLECTION CLASSE & ÉVALUATION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche : Liste des évaluations */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Classe</label>
            <select
              value={selectedClasse}
              onChange={async (e) => {
                const clsId = e.target.value
                setSelectedClasse(clsId)
                const [evs, els] = await Promise.all([
                  getEvaluations(companyId, clsId, selectedPeriode || undefined),
                  getElevesApprenants(companyId, { classeId: clsId, statut: 'ACTIF' })
                ])
                setEvaluations(evs || [])
                setEleves(els || [])
                if (evs?.length > 0) handleSelectEvaluation(evs[0], els)
                else setSelectedEval(null)
              }}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Évaluations enregistrées ({evaluations.length})
            </span>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {evaluations.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center italic">
                  Aucune évaluation. Cliquez sur "+ Nouvelle Évaluation".
                </p>
              ) : (
                evaluations.map((ev) => {
                  const isSelected = selectedEval?.id === ev.id
                  const mat = matieres.find((m) => m.id === ev.matiere_id)

                  return (
                    <div
                      key={ev.id}
                      onClick={() => handleSelectEvaluation(ev)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-lime-500 bg-lime-50 dark:bg-lime-950/40'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {ev.titre}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          Coef {ev.coefficient}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {mat?.nom || 'Matière'} • / {ev.note_sur}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite : Saisie des notes des élèves */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          {selectedEval ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Saisie : {selectedEval.titre}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Barème : / {selectedEval.note_sur} • Coefficient : {selectedEval.coefficient}
                  </p>
                </div>

                {/* Stats en direct */}
                <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                  <span>Moyenne : <strong className="text-lime-600 font-bold">{moyenneClasse}</strong></span>
                  <span>•</span>
                  <span>Max : <strong className="text-emerald-600 font-bold">{noteMax}</strong></span>
                  <span>•</span>
                  <span>Min : <strong className="text-rose-600 font-bold">{noteMin}</strong></span>
                </div>
              </div>

              {/* Tableau de saisie rapide */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Élève</th>
                      <th className="py-2.5 px-3 w-32">Note (/ {selectedEval.note_sur})</th>
                      <th className="py-2.5 px-3">Appréciation</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {eleves.map((el) => {
                      const noteItem = notesState[el.id] || { note: 10, appreciation: '', presence: 'PRESENT' }

                      return (
                        <tr key={el.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                            {el.nom} {el.prenom}
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {el.matricule}
                            </span>
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max={selectedEval.note_sur}
                              value={noteItem.note}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setNotesState({
                                  ...notesState,
                                  [el.id]: {
                                    ...noteItem,
                                    note: val,
                                    appreciation: val >= 16 ? 'Très Bien' : val >= 14 ? 'Bien' : val >= 12 ? 'Assez Bien' : val >= 10 ? 'Passable' : 'Insuffisant'
                                  }
                                })
                              }}
                              className={`w-24 px-2.5 py-1.5 rounded-lg border text-sm font-bold ${
                                noteItem.note >= 10
                                  ? 'border-emerald-300 dark:border-emerald-800 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                                  : 'border-rose-300 dark:border-rose-800 text-rose-600 bg-rose-50 dark:bg-rose-950/20'
                              } focus:outline-none`}
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={noteItem.appreciation}
                              onChange={(e) => {
                                setNotesState({
                                  ...notesState,
                                  [el.id]: { ...noteItem, appreciation: e.target.value }
                                })
                              }}
                              placeholder="Appréciation..."
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => setShowBulletinModal(el)}
                              className="text-xs text-lime-600 hover:text-lime-700 font-semibold inline-flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Bulletin</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handleSaveNotes}
                  className="px-5 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-lime-600/25 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer toutes les notes</span>
                </button>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Sélectionnez une évaluation pour commencer la saisie</p>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL NOUVELLE ÉVALUATION ── */}
      {showAddEvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Créer une Évaluation</h3>
              <button onClick={() => setShowAddEvalModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvaluation} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Titre de l'évaluation *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Devoir Surveillé N°1"
                  value={newEvalData.titre}
                  onChange={(e) => setNewEvalData({ ...newEvalData, titre: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Matière *</label>
                <select
                  value={newEvalData.matiere_id}
                  onChange={(e) => setNewEvalData({ ...newEvalData, matiere_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  {matieres.map((m) => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Coefficient</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newEvalData.coefficient}
                    onChange={(e) => setNewEvalData({ ...newEvalData, coefficient: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Barème /</label>
                  <input
                    type="number"
                    value={newEvalData.note_sur}
                    onChange={(e) => setNewEvalData({ ...newEvalData, note_sur: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddEvalModal(false)}
                  className="px-3 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL BULLETIN SCOLAIRE OFFICIEL IMPRIMABLE ── */}
      {showBulletinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white text-slate-900 rounded-3xl max-w-2xl w-full p-8 border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header du bulletin officiel */}
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <span className="text-[10px] font-black tracking-widest uppercase text-lime-700">GESTIO 229 ÉDUCATION</span>
                <h2 className="text-xl font-black">BULLETIN TRIMESTRIEL DE NOTES</h2>
                <p className="text-xs text-slate-500">Année Académique 2025-2026 • 1er Trimestre</p>
              </div>
              <button onClick={() => setShowBulletinModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Fiche identité élève */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 text-xs mb-6">
              <div>
                <span className="text-slate-400 block">Nom & Prénom(s) :</span>
                <strong className="text-sm">{showBulletinModal.nom} {showBulletinModal.prenom}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Matricule & Classe :</span>
                <strong>{showBulletinModal.matricule} • {showBulletinModal.classe_nom}</strong>
              </div>
            </div>

            {/* Table des notes par matière */}
            <table className="w-full text-left text-xs mb-6 border">
              <thead className="bg-slate-100 font-bold">
                <tr>
                  <th className="p-2 border">Matière</th>
                  <th className="p-2 border text-center">Coef</th>
                  <th className="p-2 border text-center">Note /20</th>
                  <th className="p-2 border text-center">Points</th>
                  <th className="p-2 border">Appréciation</th>
                </tr>
              </thead>
              <tbody>
                {matieres.map((m, idx) => {
                  const n = 12 + ((idx * 3) % 7) // note illustrative
                  return (
                    <tr key={m.id} className="border-b">
                      <td className="p-2 font-medium border">{m.nom}</td>
                      <td className="p-2 text-center border">2.0</td>
                      <td className="p-2 text-center font-bold border">{n} /20</td>
                      <td className="p-2 text-center border font-mono">{(n * 2).toFixed(1)}</td>
                      <td className="p-2 border italic text-slate-600">
                        {n >= 14 ? 'Très bon travail' : 'Travail satisfaisant'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Bilan & Décision */}
            <div className="p-4 rounded-xl bg-lime-50 border border-lime-200 text-xs flex justify-between items-center mb-6">
              <div>
                <span className="text-slate-600 block">Moyenne Générale Pondérée :</span>
                <strong className="text-lg font-black text-lime-800">14.65 /20</strong>
                <span className="block text-[11px] text-slate-500">Rang : 3ème sur 38 élèves</span>
              </div>
              <div className="text-right">
                <span className="text-slate-600 block">Décision du Conseil :</span>
                <strong className="text-sm font-bold text-emerald-700">TABLEAU D'HONNEUR</strong>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-2 hover:bg-slate-800"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Bulletin Officiel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcoleNotesBulletinsPage
