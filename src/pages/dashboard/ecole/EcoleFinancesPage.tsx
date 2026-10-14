// =============================================================================
// GESTIO 229 SaaS — Module Finances, Scolarité & Reçus Officiels
// Encaissements multi-modes, reçus PDF certifiés et relances WhatsApp
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  DollarSign, Receipt, Printer, Send, MessageSquare,
  AlertTriangle, CheckCircle2, Search, Filter, Plus,
  CreditCard, Smartphone, Check, X, Users, ArrowUpRight
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import {
  getElevesApprenants, getPaiementsRecus, enregistrerPaiement,
  generateReceiptNumber
} from '../../../services/ecoleService'

export const EcoleFinancesPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [eleves, setEleves] = useState<any[]>([])
  const [paiements, setPaiements] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('ALL')

  // Modals
  const [showEncaissementModal, setShowEncaissementModal] = useState<any | null>(null)
  const [showRecuModal, setShowRecuModal] = useState<any | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Formulaire d'encaissement
  const [formData, setFormData] = useState({
    montant: 50000,
    mode_paiement: 'ESPECES',
    reference_transaction: '',
    observations: 'Versement Scolarité Tranche 1'
  })

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [els, paies] = await Promise.all([
        getElevesApprenants(companyId),
        getPaiementsRecus(companyId, { limit: 50 })
      ])
      setEleves(els || [])
      setPaiements(paies || [])
    } catch (err: any) {
      toast.error('Erreur', err?.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleOpenEncaissement = (eleve: any) => {
    const reste = Math.max(0, Number(eleve.frais_scolarite_total || 0) - Number(eleve.frais_scolarite_paye || 0))
    setFormData({
      montant: reste > 0 ? Math.min(reste, 50000) : 10000,
      mode_paiement: 'ESPECES',
      reference_transaction: '',
      observations: `Paiement scolarité - ${eleve.nom} ${eleve.prenom}`
    })
    setShowEncaissementModal(eleve)
  }

  const handleSavePaiement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showEncaissementModal) return
    if (formData.montant <= 0) {
      toast.error('Erreur', 'Le montant versé doit être supérieur à 0.')
      return
    }

    setSubmitting(true)
    try {
      const paiement = await enregistrerPaiement(companyId, {
        eleve_id: showEncaissementModal.id,
        montant: Number(formData.montant),
        mode_paiement: formData.mode_paiement,
        reference_transaction: formData.reference_transaction,
        observations: formData.observations
      })

      toast.success(
        'Paiement encaissé avec succès !',
        `Reçu officiel N° ${paiement.numero_recu} généré.`
      )

      setShowEncaissementModal(null)
      setShowRecuModal({
        ...paiement,
        eleve_nom: `${showEncaissementModal.nom} ${showEncaissementModal.prenom}`,
        matricule: showEncaissementModal.matricule,
        classe_nom: showEncaissementModal.classe_nom
      })

      loadData()
    } catch (err: any) {
      toast.error('Erreur encaissement', err?.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fmtMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val) + ' FCFA'
  }

  // Filtrage élèves
  const filteredEleves = eleves.filter((el) => {
    const reste = Math.max(0, Number(el.frais_scolarite_total || 0) - Number(el.frais_scolarite_paye || 0))
    if (filtreStatut === 'SOLDE' && reste > 0) return false
    if (filtreStatut === 'IMPAYE' && reste === 0) return false
    if (search) {
      const s = search.toLowerCase()
      return (
        el.nom?.toLowerCase().includes(s) ||
        el.prenom?.toLowerCase().includes(s) ||
        el.matricule?.toLowerCase().includes(s)
      )
    }
    return true
  })

  // Relance WhatsApp
  const handleRelanceWhatsApp = (el: any) => {
    if (!el.responsable_contact) {
      toast.error('Contact manquant', 'Aucun contact WhatsApp n\'est renseigné pour cet élève.')
      return
    }
    const clean = el.responsable_contact.replace(/[^0-9]/g, '')
    const reste = Math.max(0, Number(el.frais_scolarite_total || 0) - Number(el.frais_scolarite_paye || 0))
    const msg = encodeURIComponent(
      `Bonjour M./Mme ${el.responsable_nom || ''}, l'administration de l'établissement vous rappelle que le solde restant des frais de scolarité pour votre enfant ${el.nom} ${el.prenom} (${el.classe_nom}) est de ${fmtMoney(reste)}. Merci de régulariser la situation dans les meilleurs délais.`
    )
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Finances, Frais de Scolarité & Reçus
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
              Trésorerie & Recouvrement
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enregistrement des versements, génération des reçus officiels infalsifiables et relances automatiques WhatsApp.
          </p>
        </div>
      </div>

      {/* ── BARRE DE RECHERCHE ET FILTRES ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher élève par nom ou matricule..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'IMPAYE', 'SOLDE'].map((st) => (
            <button
              key={st}
              onClick={() => setFiltreStatut(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filtreStatut === st
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' && 'Tous les élèves'}
              {st === 'IMPAYE' && 'Solde Restant Dû'}
              {st === 'SOLDE' && 'Scolarités Soldées'}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABLEAU DE SITUATION DES SCOLARITÉS ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4">Élève & Matricule</th>
                <th className="py-3 px-4">Classe</th>
                <th className="py-3 px-4">Total Exigible</th>
                <th className="py-3 px-4">Déjà Versé</th>
                <th className="py-3 px-4">Reste Dû</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chargement des situations financières...
                  </td>
                </tr>
              ) : filteredEleves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Aucun élève ne correspond aux critères.
                  </td>
                </tr>
              ) : (
                filteredEleves.map((el) => {
                  const reste = Math.max(0, Number(el.frais_scolarite_total || 0) - Number(el.frais_scolarite_paye || 0))

                  return (
                    <tr key={el.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {el.nom} {el.prenom}
                        </p>
                        <span className="font-mono text-[10px] text-slate-400">
                          {el.matricule}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {el.classe_nom || 'Non assigné'}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {fmtMoney(Number(el.frais_scolarite_total || 0))}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtMoney(Number(el.frais_scolarite_paye || 0))}
                      </td>

                      <td className="py-3.5 px-4">
                        {reste > 0 ? (
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            {fmtMoney(reste)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            Soldé ✓
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {reste > 0 && (
                            <button
                              onClick={() => handleRelanceWhatsApp(el)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                              title="Relancer le parent sur WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Relancer</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEncaissement(el)}
                            className="px-3 py-1.5 rounded-lg bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs inline-flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Encaisser</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL D'ENCAISSEMENT ── */}
      {showEncaissementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-lime-600" />
                  Encaissement Frais de Scolarité
                </h3>
                <p className="text-xs text-slate-500">
                  {showEncaissementModal.nom} {showEncaissementModal.prenom} ({showEncaissementModal.matricule})
                </p>
              </div>
              <button onClick={() => setShowEncaissementModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaiement} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Montant à encaisser (FCFA) *
                </label>
                <input
                  type="number"
                  required
                  value={formData.montant}
                  onChange={(e) => setFormData({ ...formData, montant: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl text-base font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mode de règlement *
                </label>
                <select
                  value={formData.mode_paiement}
                  onChange={(e) => setFormData({ ...formData, mode_paiement: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="ESPECES">Espèces</option>
                  <option value="MOMO_MTN">Mobile Money (MTN MoMo)</option>
                  <option value="MOMO_MOOV">Moov Money (Flooz)</option>
                  <option value="VIREMENT">Virement bancaire</option>
                  <option value="CHEQUE">Chèque</option>
                  <option value="CARTE">Carte Bancaire</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Référence de transaction (N° reçu MoMo, chèque, etc.)
                </label>
                <input
                  type="text"
                  value={formData.reference_transaction}
                  onChange={(e) => setFormData({ ...formData, reference_transaction: e.target.value })}
                  placeholder="Ex: TXN-8947239"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motif / Observations
                </label>
                <input
                  type="text"
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEncaissementModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500"
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
                      <span>Valider & Générer Reçu</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL REÇU OFFICIEL IMPRIMABLE ── */}
      {showRecuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white text-slate-900 rounded-3xl max-w-md w-full p-8 border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-lime-700">GESTIO 229 ÉDUCATION</span>
                <h3 className="text-base font-black">REÇU OFFICIEL DE PAIEMENT</h3>
                <p className="text-xs text-slate-500 font-mono font-bold">{showRecuModal.numero_recu}</p>
              </div>
              <button onClick={() => setShowRecuModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs mb-6">
              <div className="p-3 rounded-xl bg-slate-50 space-y-1">
                <p>Élève : <strong>{showRecuModal.eleve_nom}</strong></p>
                <p>Matricule : <span className="font-mono">{showRecuModal.matricule}</span></p>
                <p>Classe : <span>{showRecuModal.classe_nom}</span></p>
              </div>

              <div className="flex justify-between items-center py-2 border-y">
                <span className="text-slate-600">Montant Encaissé :</span>
                <span className="text-xl font-black text-lime-800">{fmtMoney(Number(showRecuModal.montant))}</span>
              </div>

              <div className="space-y-1 text-slate-500 text-[11px]">
                <p>Mode : <strong>{showRecuModal.mode_paiement}</strong></p>
                {showRecuModal.reference_transaction && (
                  <p>Référence : <span className="font-mono">{showRecuModal.reference_transaction}</span></p>
                )}
                <p>Date : {new Date(showRecuModal.date_paiement).toLocaleString('fr-FR')}</p>
                <p>Caissier : {showRecuModal.encaisse_par}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                onClick={() => window.print()}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-800"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer le Reçu</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcoleFinancesPage
