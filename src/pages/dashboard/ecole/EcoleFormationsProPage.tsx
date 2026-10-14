// =============================================================================
// GESTIO 229 SaaS — Module Centre de Formation Professionnelle & Certifications
// Catalogue de formations, sessions calendaires et certificats certifiants
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Award, Layers, Calendar, Plus, Users, CheckCircle2,
  FileCheck, Printer, Search, Sparkles, X, Check,
  Clock, ShieldCheck, Download
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { supabase } from '../../../lib/supabase'
import {
  getFormationsCatalogue, getSessionsFormation, getAttestationsCertificats,
  getElevesApprenants, emettreCertificat
} from '../../../services/ecoleService'

export const EcoleFormationsProPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [formations, setFormations] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [certificats, setCertificats] = useState<any[]>([])
  const [apprenants, setApprenants] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<'catalogue' | 'sessions' | 'certificats'>('catalogue')

  // Modals
  const [showAddFormationModal, setShowAddFormationModal] = useState(false)
  const [showCertifModal, setShowCertifModal] = useState(false)
  const [selectedCertifPrint, setSelectedCertifPrint] = useState<any | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Formulaire Formation
  const [formationData, setFormationData] = useState({
    code: 'DEV-WEB',
    titre: 'Développement Web Fullstack & Mobile',
    domaine: 'Informatique & Technologies',
    duree_heures: 80,
    tarif_ht: 180000,
    description: 'Formation pratique intensive avec projets réels et mentorat.',
    est_certifiante: true
  })

  // Formulaire Émission Certificat
  const [certifData, setCertifData] = useState({
    eleve_apprenant_id: '',
    formation_id: '',
    session_id: '',
    type_document: 'CERTIFICAT_REUSSITE',
    mention: 'Très Bien',
    valide_par: 'Direction Pédagogique'
  })

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [form, sess, cert, app] = await Promise.all([
        getFormationsCatalogue(companyId),
        getSessionsFormation(companyId),
        getAttestationsCertificats(companyId),
        getElevesApprenants(companyId)
      ])
      setFormations(form || [])
      setSessions(sess || [])
      setCertificats(cert || [])
      setApprenants(app || [])

      if (form?.length > 0 && !certifData.formation_id) {
        setCertifData((prev) => ({ ...prev, formation_id: form[0].id }))
      }
      if (app?.length > 0 && !certifData.eleve_apprenant_id) {
        setCertifData((prev) => ({ ...prev, eleve_apprenant_id: app[0].id }))
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

  const handleCreateFormation = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error } = await supabase.from('ecole_formations_catalogue').insert([{
        ...formationData,
        company_id: companyId,
        statut: 'ACTIF'
      }])

      if (error) throw error

      toast.success('Formation ajoutée au catalogue !')
      setShowAddFormationModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur création', err?.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEmettreCertificat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certifData.eleve_apprenant_id || !certifData.formation_id) {
      toast.error('Erreur', 'Veuillez sélectionner un apprenant et une formation.')
      return
    }

    setSubmitting(true)
    try {
      const cert = await emettreCertificat(companyId, certifData)
      toast.success('Certificat émis !', `Numéro officiel : ${cert.numero_certificat}`)
      setShowCertifModal(false)
      loadData()

      const apprenant = apprenants.find((a) => a.id === cert.eleve_apprenant_id)
      const formation = formations.find((f) => f.id === cert.formation_id)
      setSelectedCertifPrint({
        ...cert,
        apprenant_nom: `${apprenant?.nom} ${apprenant?.prenom}`,
        apprenant_matricule: apprenant?.matricule,
        formation_titre: formation?.titre
      })
    } catch (err: any) {
      toast.error('Erreur émission', err?.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fmtMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val) + ' FCFA'
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Formations Professionnelles & Certifications
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
              Certificats sécurisés & QR-Code
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestion du catalogue des programmes, sessions calendaires et délivrance des attestations et parchemins officiels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFormationModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Programme</span>
          </button>
          <button
            onClick={() => setShowCertifModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/25 transition-all"
          >
            <Award className="w-4 h-4" />
            <span>Émettre Certificat</span>
          </button>
        </div>
      </div>

      {/* ── ONGLETS ── */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { key: 'catalogue', label: `Catalogue Formations (${formations.length})`, icon: Layers },
          { key: 'sessions', label: `Sessions Calendaires (${sessions.length})`, icon: Calendar },
          { key: 'certificats', label: `Certificats Délivrés (${certificats.length})`, icon: Award }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── CONTENU ONGLET 1 : CATALOGUE ── */}
      {activeTab === 'catalogue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formations.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Aucun programme au catalogue. Cliquez sur "Nouveau Programme".</p>
            </div>
          ) : (
            formations.map((f) => (
              <div
                key={f.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                      {f.code}
                    </span>
                    {f.est_certifiante && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Certifiante
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                    {f.titre}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 line-clamp-2">
                    {f.description || f.domaine}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 mb-4">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {f.duree_heures}h
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {fmtMoney(Number(f.tarif_ht || 0))}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-400">Domaine : {f.domaine}</span>
                  <button
                    onClick={() => {
                      setCertifData((prev) => ({ ...prev, formation_id: f.id }))
                      setShowCertifModal(true)
                    }}
                    className="text-blue-600 hover:text-blue-700 font-bold"
                  >
                    + Certifier
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CONTENU ONGLET 2 : SESSIONS CALENDAIRES ── */}
      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase font-bold">
                <tr>
                  <th className="py-3 px-4">Session & Intitulé</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4">Capacité</th>
                  <th className="py-3 px-4">Lieu / Salle</th>
                  <th className="py-3 px-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      Aucune session planifiée actuellement.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {s.intitule}
                        <span className="block font-mono text-[10px] text-slate-400">{s.code_session}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        Du {new Date(s.date_debut).toLocaleDateString('fr-FR')} au {new Date(s.date_fin).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {s.inscrits_count || 0} / {s.capacite_max} inscrits
                      </td>
                      <td className="py-3 px-4 text-slate-500">{s.lieu_ou_lien}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                          {s.statut}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET 3 : CERTIFICATS DÉLIVRÉS ── */}
      {activeTab === 'certificats' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase font-bold">
                <tr>
                  <th className="py-3 px-4">N° Certificat & Hash</th>
                  <th className="py-3 px-4">Apprenant Récipiendaire</th>
                  <th className="py-3 px-4">Mention</th>
                  <th className="py-3 px-4">Date de délivrance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {certificats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      Aucun certificat émis pour le moment.
                    </td>
                  </tr>
                ) : (
                  certificats.map((c) => {
                    const app = apprenants.find((a) => a.id === c.eleve_apprenant_id)
                    const form = formations.find((f) => f.id === c.formation_id)

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            {c.numero_certificat}
                          </span>
                          <span className="block font-mono text-[10px] text-slate-400">
                            Hash : {c.hash_verification || 'VERIF-OK'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {app?.nom} {app?.prenom}
                          </p>
                          <span className="text-[11px] text-slate-500">{form?.titre}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Mention {c.mention}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {c.date_obtention ? new Date(c.date_obtention).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedCertifPrint({
                              ...c,
                              apprenant_nom: `${app?.nom} ${app?.prenom}`,
                              apprenant_matricule: app?.matricule,
                              formation_titre: form?.titre
                            })}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Parchemin</span>
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
      )}

      {/* ── MODAL NOUVELLE FORMATION ── */}
      {showAddFormationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Ajouter une Formation</h3>
              <button onClick={() => setShowAddFormationModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFormation} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Code Programme</label>
                <input
                  type="text"
                  required
                  value={formationData.code}
                  onChange={(e) => setFormationData({ ...formationData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Titre de la Formation *</label>
                <input
                  type="text"
                  required
                  value={formationData.titre}
                  onChange={(e) => setFormationData({ ...formationData, titre: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Durée (heures)</label>
                  <input
                    type="number"
                    value={formationData.duree_heures}
                    onChange={(e) => setFormationData({ ...formationData, duree_heures: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tarif (FCFA)</label>
                  <input
                    type="number"
                    value={formationData.tarif_ht}
                    onChange={(e) => setFormationData({ ...formationData, tarif_ht: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowAddFormationModal(false)} className="px-3 py-2 rounded-xl text-xs text-slate-500">
                  Annuler
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL ÉMISSION CERTIFICAT ── */}
      {showCertifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-600" />
                Émettre une Attestation / Certificat
              </h3>
              <button onClick={() => setShowCertifModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEmettreCertificat} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Apprenant Récipiendaire *</label>
                <select
                  value={certifData.eleve_apprenant_id}
                  onChange={(e) => setCertifData({ ...certifData, eleve_apprenant_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                >
                  {apprenants.map((a) => (
                    <option key={a.id} value={a.id}>{a.nom} {a.prenom} ({a.matricule})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Formation suivie *</label>
                <select
                  value={certifData.formation_id}
                  onChange={(e) => setCertifData({ ...certifData, formation_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                >
                  {formations.map((f) => (
                    <option key={f.id} value={f.id}>{f.titre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Type de Document</label>
                  <select
                    value={certifData.type_document}
                    onChange={(e) => setCertifData({ ...certifData, type_document: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                  >
                    <option value="CERTIFICAT_REUSSITE">Certificat de Réussite</option>
                    <option value="ATTESTATION_SUIVI">Attestation de Suivi</option>
                    <option value="DIPLOME">Diplôme Professionnel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mention</label>
                  <select
                    value={certifData.mention}
                    onChange={(e) => setCertifData({ ...certifData, mention: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border text-slate-900 dark:text-white"
                  >
                    <option value="Passable">Passable</option>
                    <option value="Assez Bien">Assez Bien</option>
                    <option value="Bien">Bien</option>
                    <option value="Très Bien">Très Bien</option>
                    <option value="Excellent">Excellent</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowCertifModal(false)} className="px-3 py-2 rounded-xl text-xs text-slate-500">
                  Annuler
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs">
                  Générer le Certificat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL PARCHEMIN DU CERTIFICAT IMPRIMABLE ── */}
      {selectedCertifPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-amber-50 text-slate-900 rounded-3xl max-w-2xl w-full p-8 border-4 border-amber-300 shadow-2xl relative text-center">
            <button
              onClick={() => setSelectedCertifPrint(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <span className="text-[11px] font-black uppercase tracking-widest text-blue-900 block mb-2">
              RÉPUBLIQUE DU BÉNIN • MINISTÈRE DE LA FORMATION PROFESSIONNELLE
            </span>

            <h2 className="text-2xl font-serif font-black text-slate-900 mb-1">
              CERTIFICAT D'APTITUDE PROFESSIONNELLE
            </h2>
            <p className="text-xs font-mono text-slate-600 mb-6 font-bold">
              N° Enregistrement : {selectedCertifPrint.numero_certificat}
            </p>

            <p className="text-sm text-slate-700 italic mb-2">Il est certifié que :</p>
            <h3 className="text-xl font-bold font-serif text-blue-950 uppercase mb-4">
              {selectedCertifPrint.apprenant_nom}
            </h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto mb-4">
              a validé avec succès l'ensemble des modules théoriques et pratiques de la formation en :
            </p>

            <div className="p-3 bg-white/80 rounded-xl border border-amber-200 max-w-md mx-auto mb-4">
              <strong className="text-base text-slate-900 font-bold block">
                {selectedCertifPrint.formation_titre}
              </strong>
              <span className="text-xs text-emerald-700 font-bold">
                Mention : {selectedCertifPrint.mention}
              </span>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-600 pt-4 border-t border-amber-200 mt-6">
              <div>
                <span>Délivré le : {new Date(selectedCertifPrint.date_obtention).toLocaleDateString('fr-FR')}</span>
                <span className="block font-mono text-[9px] text-slate-400">Hash anti-fraude : {selectedCertifPrint.hash_verification}</span>
              </div>
              <div className="text-right">
                <span className="font-bold">Le Directeur Pédagogique</span>
                <span className="block text-[10px] italic">(Signature & Sceau Officiel)</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer le Parchemin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcoleFormationsProPage
