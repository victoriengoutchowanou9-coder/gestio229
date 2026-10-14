// =============================================================================
// GESTIO 229 SaaS — Module Élèves & Apprenants (Inscriptions & Fiches)
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Users, UserPlus, Search, Filter, Phone, MessageSquare,
  GraduationCap, CheckCircle2, AlertCircle, FileText, Download,
  Printer, MoreVertical, Edit2, Trash2, Eye, ShieldCheck,
  Building, Calendar, CreditCard, Sparkles, X, Check
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useEcoleConfig } from '../../../hooks/useEcoleConfig'
import {
  getElevesApprenants, getClasses, createEleveApprenant,
  updateEleveApprenant, generateSchoolIdentifier
} from '../../../services/ecoleService'

export const EcoleInscriptionsPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()
  const { isFormationPro } = useEcoleConfig()

  const [loading, setLoading] = useState(true)
  const [eleves, setEleves] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selectedClasse, setSelectedClasse] = useState('ALL')
  const [selectedStatut, setSelectedStatut] = useState('ALL')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState<any | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Formulaire d'inscription
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    sexe: 'M',
    date_naissance: '',
    lieu_naissance: '',
    nationalite: 'Béninoise',
    adresse: '',
    classe_actuelle_id: '',
    classe_nom: '',
    responsable_nom: '',
    responsable_contact: '',
    responsable_email: '',
    frais_scolarite_total: 150000,
    statut: 'ACTIF',
    type_profil: isFormationPro ? 'APPRENANT' : 'ELEVE'
  })

  // Génération prévisionnelle de matricule
  const [generatedId, setGeneratedId] = useState(() => generateSchoolIdentifier(1))

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [el, cls] = await Promise.all([
        getElevesApprenants(companyId, {
          classeId: selectedClasse,
          statut: selectedStatut,
          search
        }),
        getClasses(companyId)
      ])
      setEleves(el || [])
      setClasses(cls || [])
      setGeneratedId(generateSchoolIdentifier((el?.length || 0) + 1))
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Impossible de charger les données.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId, selectedClasse, selectedStatut])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadData()
  }

  const handleOpenAdd = () => {
    const nextSeq = eleves.length + 1
    const ids = generateSchoolIdentifier(nextSeq)
    setGeneratedId(ids)
    setFormData({
      nom: '',
      prenom: '',
      sexe: 'M',
      date_naissance: '',
      lieu_naissance: '',
      nationalite: 'Béninoise',
      adresse: '',
      classe_actuelle_id: classes[0]?.id || '',
      classe_nom: classes[0]?.nom || '',
      responsable_nom: '',
      responsable_contact: '',
      responsable_email: '',
      frais_scolarite_total: 150000,
      statut: 'ACTIF',
      type_profil: isFormationPro ? 'APPRENANT' : 'ELEVE'
    })
    setShowAddModal(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nom || !formData.prenom) {
      toast.error('Erreur', 'Le nom et le prénom sont obligatoires.')
      return
    }

    setSubmitting(true)
    try {
      await createEleveApprenant(companyId, {
        ...formData,
        matricule: generatedId.matricule,
        identifiant_national_unique: generatedId.identifiantUnique,
        frais_scolarite_paye: 0
      })
      toast.success(
        'Inscription validée !',
        `${formData.prenom} ${formData.nom} est inscrit avec le matricule ${generatedId.matricule}.`
      )
      setShowAddModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur inscription', err?.message || 'Une anomalie est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  const fmtMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val) + ' FCFA'
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER DE LA PAGE ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Gestion des {isFormationPro ? 'Apprenants & Stagiaires' : 'Élèves & Inscriptions'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300">
              {eleves.length} inscrits
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Matricules officiels, identifiants uniques sécurisés et fiches de renseignements.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-lime-600/25 transition-all active:scale-[0.98]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nouvelle Inscription</span>
        </button>
      </div>

      {/* ── FILTRES & RECHERCHE ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, matricule, ID..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Filtre Classe */}
          <select
            value={selectedClasse}
            onChange={(e) => setSelectedClasse(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="ALL">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>

          {/* Filtre Statut */}
          <select
            value={selectedStatut}
            onChange={(e) => setSelectedStatut(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIF">Actif</option>
            <option value="SUSPENDU">Suspendu</option>
            <option value="SORTI">Sorti</option>
            <option value="DIPLOME">Diplômé</option>
          </select>
        </div>
      </div>

      {/* ── TABLEAU DES ÉLÈVES ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 text-[11px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4">Identité & Matricule</th>
                <th className="py-3 px-4">Classe / Filière</th>
                <th className="py-3 px-4">Parent / Contact WhatsApp</th>
                <th className="py-3 px-4">Frais Scolaires</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chargement des dossiers d'inscriptions...
                  </td>
                </tr>
              ) : eleves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Aucun élève trouvé. Cliquez sur "Nouvelle Inscription" pour commencer.
                  </td>
                </tr>
              ) : (
                eleves.map((el) => {
                  const reste = Math.max(0, Number(el.frais_scolarite_total || 0) - Number(el.frais_scolarite_paye || 0))
                  const cleanTel = el.responsable_contact ? el.responsable_contact.replace(/[^0-9]/g, '') : ''

                  return (
                    <tr key={el.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-lime-500/10 text-lime-700 dark:text-lime-300 font-bold flex items-center justify-center flex-shrink-0">
                            {el.nom?.[0]}{el.prenom?.[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {el.nom} {el.prenom}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold text-slate-700 dark:text-slate-300">
                                {el.matricule}
                              </span>
                              {el.identifiant_national_unique && (
                                <span className="font-mono text-slate-400">
                                  ID: {el.identifiant_national_unique}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {el.classe_nom || 'Non affecté'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {el.responsable_nom || 'Non renseigné'}
                          </p>
                          {el.responsable_contact && (
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span>{el.responsable_contact}</span>
                              {cleanTel && (
                                <a
                                  href={`https://wa.me/${cleanTel}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                  title="Discuter sur WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {fmtMoney(Number(el.frais_scolarite_paye || 0))}
                          </span>
                          <span className="text-[11px] text-slate-400"> / {fmtMoney(Number(el.frais_scolarite_total || 0))}</span>
                        </div>
                        {reste > 0 ? (
                          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">
                            Reste : {fmtMoney(reste)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">
                            Soldé ✓
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          el.statut === 'ACTIF'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {el.statut}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setShowDetailModal(el)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Fiche</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL NOUVELLE INSCRIPTION ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-lime-600" />
                  Nouvelle Inscription ({isFormationPro ? 'Apprenant' : 'Élève'})
                </h3>
                <p className="text-xs text-slate-500">
                  Génération automatique des identifiants réglementaires
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aperçu Identifiant Généré */}
            <div className="mb-6 p-4 rounded-2xl bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-lime-700 dark:text-lime-300">
                  Identifiants uniques attribués
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <div>
                    <span className="text-xs text-slate-500">Matricule : </span>
                    <strong className="font-mono text-sm text-slate-900 dark:text-white">
                      {generatedId.matricule}
                    </strong>
                  </div>
                  <div className="h-4 w-px bg-lime-300 dark:bg-lime-800" />
                  <div>
                    <span className="text-xs text-slate-500">ID National : </span>
                    <strong className="font-mono text-sm text-lime-700 dark:text-lime-300">
                      {generatedId.identifiantUnique}
                    </strong>
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-lime-600 text-white text-[10px] font-bold tracking-wide">
                Généré sans collision
              </span>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom de famille *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value.toUpperCase() })}
                    placeholder="Ex: KPATENON"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Prénom(s) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.prenom}
                    onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                    placeholder="Ex: Jean-Eudes"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sexe
                  </label>
                  <select
                    value={formData.sexe}
                    onChange={(e) => setFormData({ ...formData, sexe: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Date de naissance
                  </label>
                  <input
                    type="date"
                    value={formData.date_naissance}
                    onChange={(e) => setFormData({ ...formData, date_naissance: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lieu de naissance
                  </label>
                  <input
                    type="text"
                    value={formData.lieu_naissance}
                    onChange={(e) => setFormData({ ...formData, lieu_naissance: e.target.value })}
                    placeholder="Ex: Cotonou"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Classe & Scolarité */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Classe / Filière
                  </label>
                  <select
                    value={formData.classe_actuelle_id}
                    onChange={(e) => {
                      const sel = classes.find(c => c.id === e.target.value)
                      setFormData({
                        ...formData,
                        classe_actuelle_id: e.target.value,
                        classe_nom: sel?.nom || ''
                      })
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Sélectionner une classe</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Frais de scolarité total (FCFA)
                  </label>
                  <input
                    type="number"
                    value={formData.frais_scolarite_total}
                    onChange={(e) => setFormData({ ...formData, frais_scolarite_total: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Responsable légal / Parent */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white block mb-2">
                  Parent / Tuteur Responsable (WhatsApp & Notifications)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Nom du tuteur</label>
                    <input
                      type="text"
                      value={formData.responsable_nom}
                      onChange={(e) => setFormData({ ...formData, responsable_nom: e.target.value })}
                      placeholder="M. KPATENON Paul"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Numéro WhatsApp</label>
                    <input
                      type="text"
                      value={formData.responsable_contact}
                      onChange={(e) => setFormData({ ...formData, responsable_contact: e.target.value })}
                      placeholder="+229 97 00 00 00"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.responsable_email}
                      onChange={(e) => setFormData({ ...formData, responsable_email: e.target.value })}
                      placeholder="parent@gmail.com"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                      <span>Enregistrer l'inscription</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL FICHE ÉLÈVE DÉTAILLÉE ── */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-lime-500/10 text-lime-700 dark:text-lime-300 font-black text-lg flex items-center justify-center">
                  {showDetailModal.nom?.[0]}{showDetailModal.prenom?.[0]}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {showDetailModal.nom} {showDetailModal.prenom}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Classe : <strong>{showDetailModal.classe_nom || 'Non renseigné'}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <div>
                  <span className="text-[11px] text-slate-400 block">Matricule Officiel</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {showDetailModal.matricule}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">ID National Unique</span>
                  <span className="font-mono font-bold text-lime-600 dark:text-lime-400 text-sm">
                    {showDetailModal.identifiant_national_unique || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Date d'inscription</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {showDetailModal.date_inscription ? new Date(showDetailModal.date_inscription).toLocaleDateString('fr-FR') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Statut académique</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {showDetailModal.statut}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Situation Financière
                </span>
                <div className="flex justify-between items-center text-xs">
                  <span>Frais annuels exigibles :</span>
                  <strong className="text-slate-900 dark:text-white">
                    {fmtMoney(Number(showDetailModal.frais_scolarite_total || 0))}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>Montant déjà versé :</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {fmtMoney(Number(showDetailModal.frais_scolarite_paye || 0))}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Reste à recouvrer :</span>
                  <strong className="text-rose-600 dark:text-rose-400">
                    {fmtMoney(Math.max(0, Number(showDetailModal.frais_scolarite_total || 0) - Number(showDetailModal.frais_scolarite_paye || 0)))}
                  </strong>
                </div>
              </div>

              {showDetailModal.responsable_nom && (
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Contact Parent / Tuteur
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {showDetailModal.responsable_nom}
                  </p>
                  <p className="text-xs text-slate-500">
                    Téléphone : {showDetailModal.responsable_contact || '—'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 hover:bg-slate-200"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer la Fiche</span>
              </button>
              <button
                onClick={() => setShowDetailModal(null)}
                className="px-4 py-2 rounded-xl bg-lime-600 text-white text-xs font-bold hover:bg-lime-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcoleInscriptionsPage
