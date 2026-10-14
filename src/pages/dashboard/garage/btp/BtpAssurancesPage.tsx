// =============================================================================
// GESTIO 229 SaaS — Assurances, Échéances & Sinistres Flotte BTP
// Conforme Spécification Section Module 3
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Shield, Plus, Search, Calendar, AlertTriangle, CheckCircle2,
  DollarSign, Clock, FileText, ChevronRight, X, Phone, User,
  Building2, Truck, RefreshCw, Eye, ShieldAlert, FileCheck, Layers
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import {
  BtpAssuranceContrat,
  BtpAssurancePaiement,
  BtpSinistre,
  BtpMateriel,
  BtpOrdreReparation
} from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

const TYPES_ASSURANCE_BTP = [
  'Tous Risques Engins BTP',
  'Bris de Machine & Hydraulique',
  'Dommages aux Engins & Véhicules',
  'Responsabilité Civile Automobile Flotte',
  'Transport de Matériel & Porte-char',
  'Responsabilité Civile Professionnelle Chantiers'
]

export const BtpAssurancesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'CONTRATS' | 'PAIEMENTS' | 'SINISTRES'>('CONTRATS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  const [contrats, setContrats] = useState<BtpAssuranceContrat[]>([])
  const [paiements, setPaiements] = useState<BtpAssurancePaiement[]>([])
  const [sinistres, setSinistres] = useState<BtpSinistre[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [ordresReparation, setOrdresReparation] = useState<BtpOrdreReparation[]>([])

  // Modale Nouveau Contrat
  const [showContratModal, setShowContratModal] = useState(false)
  const [contratForm, setContratForm] = useState({
    numero_contrat: '',
    compagnie_assurance: '',
    courtier_intermediaire: '',
    type_assurance: 'Tous Risques Engins BTP',
    engins_couverts: [] as string[],
    date_prise_effet: new Date().toISOString().split('T')[0],
    date_expiration: '',
    montant_prime_annuelle: 0,
    franchise: 0,
    frequence_paiement: 'ANNUELLE' as 'ANNUELLE' | 'SEMESTRIELLE' | 'TRIMESTRIELLE' | 'MENSUELLE',
    delai_alerte_jours: 30,
    contact_assureur: '',
    notes: ''
  })

  // Modale Nouveau Paiement
  const [showPaiementModal, setShowPaiementModal] = useState(false)
  const [paiementForm, setPaiementForm] = useState({
    contrat_id: '',
    echeance_label: 'Prime Annuelle 2026',
    montant_du: 0,
    montant_paye: 0,
    date_paiement: new Date().toISOString().split('T')[0],
    mode_paiement: 'Virement bancaire',
    reference_transaction: '',
    notes: ''
  })

  // Modale Déclaration Sinistre
  const [showSinistreModal, setShowSinistreModal] = useState(false)
  const [sinistreForm, setSinistreForm] = useState({
    contrat_id: '',
    materiel_id: '',
    ordre_reparation_id: '',
    date_incident: new Date().toISOString().split('T')[0],
    lieu_incident: '',
    description_faits: '',
    personnes_impliquees: '',
    responsable_declaration: '',
    reference_assureur: '',
    estimation_dommages: 0,
    montant_reclame: 0,
    franchise_applicable: 0
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cntRes, payRes, sinRes, matRes, orRes] = await Promise.all([
        supabaseTenant('btp_assurances_contrats').select('*').order('date_expiration'),
        supabaseTenant('btp_assurances_paiements').select('*').order('date_paiement', { ascending: false }),
        supabaseTenant('btp_sinistres').select('*').order('date_incident', { ascending: false }),
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_ordres_reparation').select('*').order('created_at', { ascending: false }).limit(50)
      ])

      setContrats(cntRes.data || [])
      setPaiements(payRes.data || [])
      setSinistres(sinRes.data || [])
      setMateriels(matRes.data || [])
      setOrdresReparation(orRes.data || [])
    } catch (err: any) {
      console.warn('[BtpAssurances] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Détection des alertes d'échéances configurables (60j, 30j, 15j, 7j)
  const contratsAlertes = useMemo(() => {
    const today = new Date().getTime()
    return contrats.filter(c => {
      const exp = new Date(c.date_expiration).getTime()
      const diffJours = Math.ceil((exp - today) / (1000 * 60 * 60 * 24))
      return diffJours <= (c.delai_alerte_jours || 30) && c.statut !== 'RESILIE'
    })
  }, [contrats])

  // Création Contrat
  const handleCreateContrat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contratForm.numero_contrat.trim() || !contratForm.compagnie_assurance.trim() || !contratForm.date_expiration) {
      toast.error('Champs requis', 'Veuillez renseigner le numéro de contrat, la compagnie et la date d\'expiration.')
      return
    }

    setSubmitting(true)
    try {
      const prime = Number(contratForm.montant_prime_annuelle) || 0
      const payload: Partial<BtpAssuranceContrat> = {
        company_id: companyId || '',
        numero_contrat: contratForm.numero_contrat.trim(),
        compagnie_assurance: contratForm.compagnie_assurance.trim(),
        courtier_intermediaire: contratForm.courtier_intermediaire || undefined,
        type_assurance: contratForm.type_assurance,
        engins_couverts: contratForm.engins_couverts,
        date_prise_effet: contratForm.date_prise_effet,
        date_expiration: contratForm.date_expiration,
        montant_prime_annuelle: prime,
        franchise: Number(contratForm.franchise) || 0,
        frequence_paiement: contratForm.frequence_paiement,
        delai_alerte_jours: Number(contratForm.delai_alerte_jours) || 30,
        montant_total_paye: 0,
        solde_restant: prime,
        statut: 'ACTIF',
        contact_assureur: contratForm.contact_assureur || undefined,
        notes: contratForm.notes || undefined
      }

      const { error } = await supabaseTenant('btp_assurances_contrats').insert([payload])
      if (error) throw error

      toast.success('Contrat enregistré', `La police ${contratForm.numero_contrat} est active.`)
      setShowContratModal(false)
      loadData()
    } catch (err: any) {
      console.error('[handleCreateContrat] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible d\'enregistrer le contrat.')
    } finally {
      setSubmitting(false)
    }
  }

  // Enregistrement Paiement de Prime
  const handleCreatePaiement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paiementForm.contrat_id || !paiementForm.montant_paye) {
      toast.error('Champs requis', 'Veuillez sélectionner le contrat et le montant payé.')
      return
    }

    setSubmitting(true)
    try {
      const contrat = contrats.find(c => c.id === paiementForm.contrat_id)
      const montantPaye = Number(paiementForm.montant_paye) || 0
      const montantDu = Number(paiementForm.montant_du) || (contrat?.solde_restant || 0)
      const soldeEch = Math.max(0, montantDu - montantPaye)

      const payload: Partial<BtpAssurancePaiement> = {
        company_id: companyId || '',
        contrat_id: paiementForm.contrat_id,
        echeance_label: paiementForm.echeance_label,
        montant_du: montantDu,
        montant_paye: montantPaye,
        solde_echeance: soldeEch,
        date_paiement: paiementForm.date_paiement,
        mode_paiement: paiementForm.mode_paiement,
        reference_transaction: paiementForm.reference_transaction || undefined,
        statut_validation: 'VALIDE',
        utilisateur_nom: 'Responsable Administratif / Financier',
        notes: paiementForm.notes || undefined
      }

      const { error: payErr } = await supabaseTenant('btp_assurances_paiements').insert([payload])
      if (payErr) throw payErr

      // Mettre à jour le solde du contrat
      if (contrat) {
        const nouveauTotalPaye = (contrat.montant_total_paye || 0) + montantPaye
        const nouveauSolde = Math.max(0, (contrat.montant_prime_annuelle || 0) - nouveauTotalPaye)
        await supabaseTenant('btp_assurances_contrats')
          .update({
            montant_total_paye: nouveauTotalPaye,
            solde_restant: nouveauSolde,
            updated_at: new Date().toISOString()
          })
          .eq('id', contrat.id)
      }

      toast.success('Paiement enregistré', `Règlement de ${fmt(montantPaye)} validé.`)
      setShowPaiementModal(false)
      loadData()
    } catch (err: any) {
      console.error('[handleCreatePaiement] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible d\'enregistrer le paiement.')
    } finally {
      setSubmitting(false)
    }
  }

  // Déclaration Sinistre
  const handleCreateSinistre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sinistreForm.materiel_id || !sinistreForm.description_faits.trim()) {
      toast.error('Champs requis', 'Veuillez sélectionner l\'engin concerné et décrire les faits.')
      return
    }

    setSubmitting(true)
    try {
      const mat = materiels.find(m => m.id === sinistreForm.materiel_id)
      const numSin = `SIN-BTP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

      const payload: Partial<BtpSinistre> = {
        company_id: companyId || '',
        numero_declaration: numSin,
        contrat_id: sinistreForm.contrat_id || undefined,
        materiel_id: sinistreForm.materiel_id,
        ordre_reparation_id: sinistreForm.ordre_reparation_id || undefined,
        code_materiel: mat?.code_materiel,
        immatriculation: mat?.immatriculation,
        date_incident: new Date(sinistreForm.date_incident).toISOString(),
        lieu_incident: sinistreForm.lieu_incident || undefined,
        description_faits: sinistreForm.description_faits,
        personnes_impliquees: sinistreForm.personnes_impliquees || undefined,
        responsable_declaration: sinistreForm.responsable_declaration || undefined,
        reference_assureur: sinistreForm.reference_assureur || undefined,
        estimation_dommages: Number(sinistreForm.estimation_dommages) || 0,
        montant_reclame: Number(sinistreForm.montant_reclame) || 0,
        franchise_applicable: Number(sinistreForm.franchise_applicable) || 0,
        montant_propose_assureur: 0,
        montant_indemnise: 0,
        statut: 'DECLARE',
        prise_en_charge_confirmee: false
      }

      const { error } = await supabaseTenant('btp_sinistres').insert([payload])
      if (error) throw error

      toast.success('Sinistre déclaré', `Dossier ${numSin} créé avec succès.`)
      setShowSinistreModal(false)
      loadData()
    } catch (err: any) {
      console.error('[handleCreateSinistre] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible d\'enregistrer le sinistre.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Shield className="w-3.5 h-3.5" />
            <span>Assurances & Sinistres Flotte BTP</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Gestion des Polices, Primes & Sinistres
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Suivi des contrats de flotte, détection des échéances proches, paiements et liaisons avec les réparations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'CONTRATS' && (
            <button
              type="button"
              onClick={() => setShowContratModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Contrat</span>
            </button>
          )}
          {activeTab === 'PAIEMENTS' && (
            <button
              type="button"
              onClick={() => setShowPaiementModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Enregistrer un Paiement</span>
            </button>
          )}
          {activeTab === 'SINISTRES' && (
            <button
              type="button"
              onClick={() => setShowSinistreModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Déclarer un Sinistre</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Bandeau Échéances Proches ── */}
      {contratsAlertes.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Alerte Renouvellement : {contratsAlertes.length} contrat(s) arrivent à échéance
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Pensez à renouveler vos polices de flotte auprès de vos compagnies d'assurance ou courtiers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Onglets ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('CONTRATS')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer',
            activeTab === 'CONTRATS'
              ? 'bg-amber-600 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <Shield className="w-4 h-4" />
          <span>Contrats d'Assurance ({contrats.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PAIEMENTS')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer',
            activeTab === 'PAIEMENTS'
              ? 'bg-amber-600 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <DollarSign className="w-4 h-4" />
          <span>Suivi des Primes ({paiements.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SINISTRES')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer',
            activeTab === 'SINISTRES'
              ? 'bg-amber-600 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Registre Sinistres ({sinistres.length})</span>
        </button>
      </div>

      {/* ── CONTENU ONGLET 1 : CONTRATS ── */}
      {activeTab === 'CONTRATS' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-400">Chargement des polices d'assurance...</p>
              </div>
            ) : contrats.length === 0 ? (
              <div className="p-12 text-center">
                <Shield className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucun contrat d'assurance enregistré</p>
                <p className="text-xs text-slate-400 mt-1">Ajoutez les polices couvrant vos engins et véhicules BTP.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {contrats.map(c => {
                  const today = new Date().getTime()
                  const expDate = new Date(c.date_expiration).getTime()
                  const diffJours = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24))
                  const isExpiring = diffJours <= 30 && diffJours > 0
                  const isExpired = diffJours <= 0

                  return (
                    <div key={c.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
                            {c.numero_contrat}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            {c.type_assurance}
                          </span>
                          {isExpired ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">Expiré</span>
                          ) : isExpiring ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 animate-pulse">
                              Échéance dans {diffJours} jours
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700">Actif</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-sm font-bold text-slate-900 dark:text-white">
                          <Building2 className="w-4 h-4 text-amber-600" />
                          <span>{c.compagnie_assurance}</span>
                          {c.courtier_intermediaire && (
                            <span className="text-xs text-slate-400 font-normal">
                              (Courtier: {c.courtier_intermediaire})
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <span>Effet : <strong>{new Date(c.date_prise_effet).toLocaleDateString('fr-FR')}</strong></span>
                          <span>Expiration : <strong className={clsx(isExpired && 'text-red-600', isExpiring && 'text-amber-600')}>{new Date(c.date_expiration).toLocaleDateString('fr-FR')}</strong></span>
                          <span>Prime annuelle : <strong className="text-slate-900 dark:text-white">{fmt(c.montant_prime_annuelle)}</strong></span>
                          <span>Solde à régler : <strong className="text-red-600 dark:text-red-400">{fmt(c.solde_restant)}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end lg:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            setPaiementForm({
                              contrat_id: c.id,
                              echeance_label: `Prime ${new Date().getFullYear()}`,
                              montant_du: c.solde_restant || c.montant_prime_annuelle,
                              montant_paye: c.solde_restant || c.montant_prime_annuelle,
                              date_paiement: new Date().toISOString().split('T')[0],
                              mode_paiement: 'Virement bancaire',
                              reference_transaction: '',
                              notes: ''
                            })
                            setShowPaiementModal(true)
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                        >
                          Régler la prime
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET 2 : PAIEMENTS ── */}
      {activeTab === 'PAIEMENTS' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {paiements.length === 0 ? (
            <div className="p-12 text-center">
              <DollarSign className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucun paiement enregistré</p>
              <p className="text-xs text-slate-400 mt-1">Enregistrez les règlements de primes pour le suivi financier.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Contrat / Échéance</th>
                    <th className="p-3">Mode & Référence</th>
                    <th className="p-3 text-right">Montant Dû</th>
                    <th className="p-3 text-right">Montant Payé</th>
                    <th className="p-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paiements.map(p => (
                    <tr key={p.id}>
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">
                        {new Date(p.date_paiement).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{p.echeance_label || 'Prime'}</p>
                      </td>
                      <td className="p-3 text-slate-500">
                        {p.mode_paiement} {p.reference_transaction ? `(${p.reference_transaction})` : ''}
                      </td>
                      <td className="p-3 text-right font-semibold">{fmt(p.montant_du)}</td>
                      <td className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400">{fmt(p.montant_paye)}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          {p.statut_validation}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CONTENU ONGLET 3 : SINISTRES ── */}
      {activeTab === 'SINISTRES' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {sinistres.length === 0 ? (
            <div className="p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucun sinistre déclaré</p>
              <p className="text-xs text-slate-400 mt-1">Tous les engins et véhicules du parc sont en situation régulière.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sinistres.map(s => (
                <div key={s.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
                        {s.numero_declaration}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                        {s.statut}
                      </span>
                      <span className="text-xs text-slate-400">
                        Incident du {new Date(s.date_incident).toLocaleDateString('fr-FR')}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Engin : {s.code_materiel || 'Matériel BTP'} {s.immatriculation ? `(${s.immatriculation})` : ''}
                    </p>

                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      <strong>Faits :</strong> {s.description_faits}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <span>Dommages estimés : <strong>{fmt(s.estimation_dommages)}</strong></span>
                      <span>Réclamé : <strong>{fmt(s.montant_reclame)}</strong></span>
                      <span>Franchise : <strong>{fmt(s.franchise_applicable)}</strong></span>
                      {Number(s.montant_indemnise) > 0 && (
                        <span className="text-emerald-600 font-bold">Indemnisé : {fmt(s.montant_indemnise)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal Nouveau Contrat ── */}
      {showContratModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Nouveau Contrat d'Assurance
              </h3>
              <button type="button" onClick={() => setShowContratModal(false)} className="p-1 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContrat} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Numéro Police *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: POL-2026-CAT-01"
                    value={contratForm.numero_contrat}
                    onChange={e => setContratForm(prev => ({ ...prev, numero_contrat: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Compagnie *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: NSIA, SANLAM, SUNU..."
                    value={contratForm.compagnie_assurance}
                    onChange={e => setContratForm(prev => ({ ...prev, compagnie_assurance: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Type de couverture</label>
                <select
                  value={contratForm.type_assurance}
                  onChange={e => setContratForm(prev => ({ ...prev, type_assurance: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  {TYPES_ASSURANCE_BTP.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Date d'effet</label>
                  <input
                    type="date"
                    value={contratForm.date_prise_effet}
                    onChange={e => setContratForm(prev => ({ ...prev, date_prise_effet: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Date d'expiration *</label>
                  <input
                    type="date"
                    required
                    value={contratForm.date_expiration}
                    onChange={e => setContratForm(prev => ({ ...prev, date_expiration: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Prime Annuelle (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    value={contratForm.montant_prime_annuelle}
                    onChange={e => setContratForm(prev => ({ ...prev, montant_prime_annuelle: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Franchise (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    value={contratForm.franchise}
                    onChange={e => setContratForm(prev => ({ ...prev, franchise: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowContratModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md shadow-amber-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer le contrat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Paiement Prime ── */}
      {showPaiementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Enregistrer un Règlement de Prime
            </h3>
            <form onSubmit={handleCreatePaiement} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contrat concerné *</label>
                <select
                  required
                  value={paiementForm.contrat_id}
                  onChange={e => setPaiementForm(prev => ({ ...prev, contrat_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">Sélectionner un contrat...</option>
                  {contrats.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.numero_contrat} — {c.compagnie_assurance} (Solde: {fmt(c.solde_restant)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Montant payé (FCFA) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={paiementForm.montant_paye}
                  onChange={e => setPaiementForm(prev => ({ ...prev, montant_paye: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Mode de règlement</label>
                  <select
                    value={paiementForm.mode_paiement}
                    onChange={e => setPaiementForm(prev => ({ ...prev, mode_paiement: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Virement bancaire">Virement bancaire</option>
                    <option value="Chèque">Chèque</option>
                    <option value="Espèces">Espèces</option>
                    <option value="Mobile Money">Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Référence transaction</label>
                  <input
                    type="text"
                    placeholder="N° chèque / virement"
                    value={paiementForm.reference_transaction}
                    onChange={e => setPaiementForm(prev => ({ ...prev, reference_transaction: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaiementModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Validation...' : 'Valider le règlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Déclaration Sinistre ── */}
      {showSinistreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4 my-8">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Déclaration de Sinistre Flotte BTP
            </h3>
            <form onSubmit={handleCreateSinistre} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Engin concerné *</label>
                <select
                  required
                  value={sinistreForm.materiel_id}
                  onChange={e => setSinistreForm(prev => ({ ...prev, materiel_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">Sélectionner un engin...</option>
                  {materiels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.code_materiel} — {m.marque} {m.modele}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Description des faits *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Circonstances précises de l'accident ou du bris de machine..."
                  value={sinistreForm.description_faits}
                  onChange={e => setSinistreForm(prev => ({ ...prev, description_faits: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Lieu de l'incident</label>
                  <input
                    type="text"
                    placeholder="Chantier, route..."
                    value={sinistreForm.lieu_incident}
                    onChange={e => setSinistreForm(prev => ({ ...prev, lieu_incident: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Estimation Dommages (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    value={sinistreForm.estimation_dommages}
                    onChange={e => setSinistreForm(prev => ({ ...prev, estimation_dommages: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Ordre de Réparation lié</label>
                <select
                  value={sinistreForm.ordre_reparation_id}
                  onChange={e => setSinistreForm(prev => ({ ...prev, ordre_reparation_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                >
                  <option value="">Aucun ordre lié pour l'instant</option>
                  {ordresReparation.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.numero_or} ({o.code_materiel || 'Engin'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSinistreModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md shadow-red-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Déclaration...' : 'Enregistrer la déclaration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpAssurancesPage
