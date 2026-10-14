// =============================================================================
// GESTIO 229 SaaS — Module Bibliothèque, Dépôt Documentaire & Prêts
// Workflow de validation des épreuves/cours & prêts physiques de livres
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Library, BookOpen, Plus, FileText, CheckCircle2,
  Clock, AlertTriangle, Search, Filter, ArrowRight,
  Download, Upload, Check, X, Users
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { supabase } from '../../../lib/supabase'
import {
  getBibliothequeDocuments, getPretsLivres, getMatieres
} from '../../../services/ecoleService'

export const EcoleBibliothequePage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<any[]>([])
  const [prets, setPrets] = useState<any[]>([])
  const [matieres, setMatieres] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'documents' | 'prets'>('documents')

  // Modals
  const [showAddDocModal, setShowAddDocModal] = useState(false)
  const [showPretModal, setShowPretModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Formulaire Document
  const [docData, setDocData] = useState({
    code: 'DOC-MATHS-01',
    titre: 'Cours & Exercices Corrigés - Fonctions Numériques',
    type_ressource: 'SUPPORT_COURS',
    auteur: 'Prof. SOSSOU',
    annee_edition: 2025,
    matiere_module_id: '',
    statut_workflow: 'PUBLIE',
    exemplaires_total: 5,
    exemplaires_disponibles: 5
  })

  // Formulaire Prêt
  const [pretData, setPretData] = useState({
    document_id: '',
    emprunteur_nom: '',
    emprunteur_type: 'ELEVE',
    date_retour_prevue: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  })

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [docs, prts, mats] = await Promise.all([
        getBibliothequeDocuments(companyId),
        getPretsLivres(companyId),
        getMatieres(companyId)
      ])
      setDocuments(docs || [])
      setPrets(prts || [])
      setMatieres(mats || [])

      if (docs?.length > 0 && !pretData.document_id) {
        setPretData((prev) => ({ ...prev, document_id: docs[0].id }))
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error } = await supabase.from('ecole_bibliotheque_documents').insert([{
        ...docData,
        company_id: companyId
      }])
      if (error) throw error
      toast.success('Document ajouté à la bibliothèque !')
      setShowAddDocModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreatePret = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pretData.emprunteur_nom) {
      toast.error('Erreur', 'Veuillez renseigner le nom de l\'emprunteur.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('ecole_prets_livres').insert([{
        ...pretData,
        company_id: companyId,
        date_pret: new Date().toISOString().split('T')[0],
        statut: 'EN_COURS'
      }])
      if (error) throw error
      toast.success('Prêt enregistré !')
      setShowPretModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestituerPret = async (pretId: string) => {
    try {
      await supabase
        .from('ecole_prets_livres')
        .update({
          statut: 'RENDU',
          date_retour_effective: new Date().toISOString().split('T')[0]
        })
        .eq('id', pretId)
      toast.success('Livre restitué avec succès.')
      loadData()
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
              Bibliothèque, Dépôt Pédagogique & Prêts
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
              Workflow & Prêts
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestion des supports de cours, validation des épreuves et suivi des emprunts physiques de manuels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddDocModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Document</span>
          </button>
          <button
            onClick={() => setShowPretModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 transition-all"
          >
            <BookOpen className="w-4 h-4" />
            <span>Enregistrer un Prêt</span>
          </button>
        </div>
      </div>

      {/* ── ONGLETS ── */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
            activeTab === 'documents'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Fonds Documentaire ({documents.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('prets')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
            activeTab === 'prets'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Prêts & Retours ({prets.length})</span>
        </button>
      </div>

      {/* ── TAB 1 : DOCUMENTS ── */}
      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Library className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Aucun document dans le catalogue pour l'instant.</p>
            </div>
          ) : (
            documents.map((d) => (
              <div
                key={d.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">
                      {d.code}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {d.statut_workflow}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1 line-clamp-2">
                    {d.titre}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Auteur : <strong>{d.auteur || 'Collectif'}</strong> ({d.annee_edition || '2025'})
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
                  <span>Type : {d.type_ressource}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {d.exemplaires_disponibles} / {d.exemplaires_total} dispos
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB 2 : PRÊTS DE LIVRES ── */}
      {activeTab === 'prets' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase font-bold">
                <tr>
                  <th className="py-3 px-4">Livre / Ouvrage</th>
                  <th className="py-3 px-4">Emprunteur</th>
                  <th className="py-3 px-4">Date Prêt</th>
                  <th className="py-3 px-4">Retour Prévu</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {prets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      Aucun prêt enregistré actuellement.
                    </td>
                  </tr>
                ) : (
                  prets.map((p) => {
                    const doc = documents.find((d) => d.id === p.document_id)
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {doc?.titre || 'Ouvrage'}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                          {p.emprunteur_nom}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(p.date_pret).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {new Date(p.date_retour_prevue).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            p.statut === 'RENDU'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {p.statut}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.statut !== 'RENDU' && (
                            <button
                              onClick={() => handleRestituerPret(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Restituer</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL NOUVEAU DOCUMENT ── */}
      {showAddDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <h3 className="font-bold text-slate-900 dark:text-white">Ajouter un Document</h3>
              <button onClick={() => setShowAddDocModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDoc} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Titre du document *</label>
                <input
                  type="text"
                  required
                  value={docData.titre}
                  onChange={(e) => setDocData({ ...docData, titre: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <select
                    value={docData.type_ressource}
                    onChange={(e) => setDocData({ ...docData, type_ressource: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                  >
                    <option value="SUPPORT_COURS">Support de Cours</option>
                    <option value="EPREUVE">Épreuve d'Examen</option>
                    <option value="LIVRE">Livre / Manuel</option>
                    <option value="CORRIGE">Corrigé / TD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Auteur</label>
                  <input
                    type="text"
                    value={docData.auteur}
                    onChange={(e) => setDocData({ ...docData, auteur: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowAddDocModal(false)} className="px-3 py-2 rounded-xl text-xs text-slate-500">
                  Annuler
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL NOUVEAU PRÊT ── */}
      {showPretModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <h3 className="font-bold text-slate-900 dark:text-white">Enregistrer un Prêt</h3>
              <button onClick={() => setShowPretModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePret} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ouvrage *</label>
                <select
                  value={pretData.document_id}
                  onChange={(e) => setPretData({ ...pretData, document_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.titre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nom de l'emprunteur *</label>
                <input
                  type="text"
                  required
                  placeholder="Élève ou Enseignant..."
                  value={pretData.emprunteur_nom}
                  onChange={(e) => setPretData({ ...pretData, emprunteur_nom: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Date limite de retour</label>
                <input
                  type="date"
                  value={pretData.date_retour_prevue}
                  onChange={(e) => setPretData({ ...pretData, date_retour_prevue: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowPretModal(false)} className="px-3 py-2 rounded-xl text-xs text-slate-500">
                  Annuler
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs">
                  Valider le Prêt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcoleBibliothequePage
