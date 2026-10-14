// =============================================================================
// GESTIO 229 SaaS — Module Appel Journalier, Absences & Discipline
// Appel par classe, justification médicale & alerte WhatsApp parents
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Calendar, CheckCircle2, Clock, AlertTriangle, ShieldCheck,
  Search, Filter, MessageSquare, Check, X, ShieldAlert,
  Users, UserCheck, UserX, FileText, Send
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { supabase } from '../../../lib/supabase'
import {
  getClasses, getElevesApprenants, getAbsencesRetards, enregistrerAppel
} from '../../../services/ecoleService'

export const EcoleAbsencesPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClasse, setSelectedClasse] = useState('')
  const [dateAppel, setDateAppel] = useState(new Date().toISOString().split('T')[0])
  const [eleves, setEleves] = useState<any[]>([])

  // Statut d'appel par élève : 'PRESENT' | 'ABSENT' | 'RETARD'
  const [appelState, setAppelState] = useState<Record<string, { statut: 'PRESENT' | 'ABSENT' | 'RETARD'; motif: string; justifie: boolean }>>({})
  const [historiqueAbsences, setHistoriqueAbsences] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cls, abs] = await Promise.all([
        getClasses(companyId),
        getAbsencesRetards(companyId, { date: dateAppel })
      ])

      setClasses(cls || [])
      setHistoriqueAbsences(abs || [])

      const initCls = cls?.[0]?.id || ''
      setSelectedClasse(initCls)

      if (initCls) {
        const els = await getElevesApprenants(companyId, { classeId: initCls, statut: 'ACTIF' })
        setEleves(els || [])

        // Initialiser tout le monde en Présent par défaut
        const map: Record<string, any> = {}
        els.forEach((e: any) => {
          map[e.id] = { statut: 'PRESENT', motif: '', justifie: false }
        })
        setAppelState(map)
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId, dateAppel])

  const handleSelectClasse = async (classeId: string) => {
    setSelectedClasse(classeId)
    setLoading(true)
    try {
      const els = await getElevesApprenants(companyId, { classeId, statut: 'ACTIF' })
      setEleves(els || [])
      const map: Record<string, any> = {}
      els.forEach((e: any) => {
        map[e.id] = { statut: 'PRESENT', motif: '', justifie: false }
      })
      setAppelState(map)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAppel = async () => {
    setSubmitting(true)
    try {
      // Filtrer les absences et retards
      const incidents: any[] = []
      Object.entries(appelState).forEach(([eleveId, data]) => {
        if (data.statut === 'ABSENT' || data.statut === 'RETARD') {
          incidents.push({
            eleve_id: eleveId,
            classe_id: selectedClasse,
            date_evenement: dateAppel,
            type: data.statut,
            motif: data.motif || (data.statut === 'ABSENT' ? 'Non communiqué' : 'Arrivée tardive'),
            est_justifie: data.justifie,
            saisie_par: 'Surveillant Général'
          })
        }
      })

      if (incidents.length > 0) {
        await enregistrerAppel(companyId, incidents)
      }

      toast.success(
        'Appel validé !',
        `Appel enregistré pour ${eleves.length} élèves. (${incidents.length} anomalies signalées).`
      )

      const updated = await getAbsencesRetards(companyId, { date: dateAppel })
      setHistoriqueAbsences(updated || [])
    } catch (err: any) {
      toast.error('Erreur validation appel', err?.message)
    } finally {
      setSubmitting(false)
    }
  }

  const getParentWhatsAppLink = (eleve: any, type: string) => {
    if (!eleve?.responsable_contact) return null
    const clean = eleve.responsable_contact.replace(/[^0-9]/g, '')
    const msg = encodeURIComponent(
      `Bonjour M./Mme ${eleve.responsable_nom || ''}, l'administration vous informe que votre enfant ${eleve.nom} ${eleve.prenom} a été enregistré comme ${type === 'ABSENT' ? 'ABSENT(E)' : 'EN RETARD'} en classe de ${eleve.classe_nom} ce ${new Date(dateAppel).toLocaleDateString('fr-FR')}. Merci de contacter l'école.`
    )
    return `https://wa.me/${clean}?text=${msg}`
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Appel Journalier, Présences & Justificatifs
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
              Notification Parents WhatsApp
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pointage rapide par classe, alertes d'absences injustifiées et transmission directe aux responsables légaux.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateAppel}
            onChange={(e) => setDateAppel(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
          />
        </div>
      </div>

      {/* ── BARRE DE SÉLECTION CLASSE ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Classe :</span>
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const allPresent: any = {}
              eleves.forEach((e) => {
                allPresent[e.id] = { statut: 'PRESENT', motif: '', justifie: false }
              })
              setAppelState(allPresent)
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
          >
            Tous Présents ✓
          </button>
        </div>
      </div>

      {/* ── TABLEAU DE POINTAGE DE L'APPEL ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4">Élève & Matricule</th>
                <th className="py-3 px-4 text-center">Pointage Présence</th>
                <th className="py-3 px-4">Motif / Justification</th>
                <th className="py-3 px-4 text-right">Relance Parent WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    Chargement des effectifs de la classe...
                  </td>
                </tr>
              ) : eleves.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 italic">
                    Aucun élève dans cette classe.
                  </td>
                </tr>
              ) : (
                eleves.map((el) => {
                  const state = appelState[el.id] || { statut: 'PRESENT', motif: '', justifie: false }
                  const waLink = getParentWhatsAppLink(el, state.statut)

                  return (
                    <tr
                      key={el.id}
                      className={`transition-colors ${
                        state.statut === 'ABSENT'
                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                          : state.statut === 'RETARD'
                          ? 'bg-amber-50/50 dark:bg-amber-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center ${
                            state.statut === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60'
                              : state.statut === 'RETARD'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60'
                          }`}>
                            {el.nom?.[0]}{el.prenom?.[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {el.nom} {el.prenom}
                            </p>
                            <span className="font-mono text-[10px] text-slate-400">
                              {el.matricule}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setAppelState({ ...appelState, [el.id]: { ...state, statut: 'PRESENT' } })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              state.statut === 'PRESENT'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Présent
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppelState({ ...appelState, [el.id]: { ...state, statut: 'RETARD' } })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              state.statut === 'RETARD'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Retard
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppelState({ ...appelState, [el.id]: { ...state, statut: 'ABSENT' } })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              state.statut === 'ABSENT'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Absent
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {state.statut !== 'PRESENT' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={state.motif}
                              onChange={(e) => setAppelState({
                                ...appelState,
                                [el.id]: { ...state, motif: e.target.value }
                              })}
                              placeholder="Motif (ex: Certificat médical)..."
                              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-48"
                            />
                            <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={state.justifie}
                                onChange={(e) => setAppelState({
                                  ...appelState,
                                  [el.id]: { ...state, justifie: e.target.checked }
                                })}
                                className="rounded text-lime-600"
                              />
                              <span>Justifiée</span>
                            </label>
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Assidu
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {state.statut !== 'PRESENT' && waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-sm"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Notifier WhatsApp</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={handleSaveAppel}
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-lime-600/25 transition-all disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Enregistrer & Clôturer l'Appel du Jour</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EcoleAbsencesPage
