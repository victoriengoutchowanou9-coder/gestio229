// =============================================================================
// GESTIO 229 SaaS — Module : Prestations à Coût Variable (PAO / Graphisme)
// Conforme Spécifications : Sans matière première en stock, validation graphiste,
// ajout de la marge brute à la période, transmission à la caisse pour encaissement
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  Palette, Plus, Clock, Calendar, CheckCircle2, DollarSign,
  AlertCircle, ShieldCheck, ArrowRight, RefreshCw, X, Receipt,
  UserCheck, Building2, Send, FileCheck2, Ban, Info
} from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import {
  imprimerieService,
  PrestationVariable,
  StatutPrestationVariable
} from '../../../services/imprimerieService'
import { showModal as showCustomModal } from '../../../components/modals/CustomModalGestio'

interface PrestationsVariablesModuleProps {
  companyId: string
  activeSector: string
  onRefreshData?: () => void
}

export const PrestationsVariablesModule: React.FC<PrestationsVariablesModuleProps> = ({
  companyId,
  activeSector,
  onRefreshData
}) => {
  const { user } = useAuthStore()

  // Permissions & Rôles
  const userRole = (user?.role || '').toLowerCase()
  const isGraphiste = userRole.includes('graphiste') || userRole.includes('operateur') || userRole === 'admin' || userRole === 'gerant' || userRole === 'gestionnaire' || userRole === 'commercial'
  const isCaissiere = userRole.includes('caissier') || userRole.includes('caisse') || userRole === 'admin' || userRole === 'gerant' || userRole === 'gestionnaire'
  const isAdmin = userRole === 'admin' || userRole === 'gerant' || userRole === 'gestionnaire' || userRole === 'responsable_imprimerie'

  // Onglets principaux spécifiés au cahier des charges :
  // • Nouvelle prestation
  // • En attente
  // • Aujourd'hui
  // • Toutes (vue complémentaire conservée)
  const [activeTab, setActiveTab] = useState<'nouveau' | 'en_attente' | 'aujourdhui' | 'toutes'>('nouveau')

  const [prestations, setPrestations] = useState<PrestationVariable[]>([])
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Array<{ id: string; name: string; phone?: string }>>([])

  // Formulaire "Nouvelle prestation"
  const [designation, setDesignation] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientNomLibre, setClientNomLibre] = useState('')
  const [clientTelLibre, setClientTelLibre] = useState('')
  const [modeRealisation, setModeRealisation] = useState<'interne' | 'externe'>('interne')
  
  // Prix de vente obligatoire (FCFA)
  const [prixVente, setPrixVente] = useState<number | ''>('')
  
  // Coût de réalisation facultatif (FCFA) : string vide si non renseigné (≠ 0)
  const [coutRealisation, setCoutRealisation] = useState<number | ''>('')
  
  // Note facultative
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Modale Encaissement Caisse Rapide
  const [encaissementModalItem, setEncaissementModalItem] = useState<PrestationVariable | null>(null)
  const [montantEncaissement, setMontantEncaissement] = useState<number | ''>('')
  const [modePaiement, setModePaiement] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'cheque'>('especes')
  const [noteEncaissement, setNoteEncaissement] = useState('')
  const [isProcessingEncaissement, setIsProcessingEncaissement] = useState(false)

  // Charger les prestations à coût variable
  const fetchPrestations = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const list = await imprimerieService.getPrestationsVariables(companyId, activeSector)
      setPrestations(list)
    } catch (e) {
      console.warn('Erreur chargement prestations variables:', e)
    } finally {
      setLoading(false)
    }
  }

  // Charger les clients pour la saisie assistée
  const fetchClients = async () => {
    if (!companyId) return
    try {
      const { supabase } = await import('../../../lib/supabase')
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .order('name')
        .limit(100)
      if (data) setClients(data)
    } catch (e) {}
  }

  useEffect(() => {
    fetchPrestations()
    fetchClients()
  }, [companyId, activeSector])

  // ─── CALCUL ARITHMÉTIQUE DE LA MARGE BRUTE ─────────────────────────────────
  // Règle cahier des charges :
  // Marge brute = Prix de vente - Coût de réalisation.
  // Si le coût est vide (non renseigné) : traité comme 0 pour le calcul arithmétique,
  // avec indication claire que le coût n'a pas été renseigné.
  const parsedPrixVente = Number(prixVente) || 0
  const isCoutRenseigne = coutRealisation !== '' && coutRealisation !== null && coutRealisation !== undefined
  const parsedCout = isCoutRenseigne ? Math.max(0, Number(coutRealisation)) : 0
  const margeCalculee = parsedPrixVente - parsedCout
  const tauxMargeCalcule = parsedPrixVente > 0 ? (margeCalculee / parsedPrixVente) * 100 : 0

  // ─── REINITIALISATION DU FORMULAIRE ─────────────────────────────────────────
  const handleResetForm = () => {
    if (designation || prixVente || coutRealisation || note) {
      if (!window.confirm('Voulez-vous vraiment effacer les données saisies dans le formulaire ?')) {
        return
      }
    }
    setDesignation('')
    setSelectedClientId('')
    setClientNomLibre('')
    setClientTelLibre('')
    setModeRealisation('interne')
    setPrixVente('')
    setCoutRealisation('')
    setNote('')
  }

  // ─── SOUMISSION DU FORMULAIRE : CRÉATION PRESTATION ─────────────────────────
  const handleSubmitNouvellePrestation = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!companyId) return
    if (!designation.trim()) {
      showCustomModal({ type: 'error', title: 'Champ obligatoire', message: 'Veuillez saisir la désignation de la prestation.' })
      return
    }

    if (parsedPrixVente <= 0) {
      showCustomModal({ type: 'error', title: 'Prix de vente requis', message: 'Veuillez saisir un prix de vente valide supérieur à zéro.' })
      return
    }

    setIsSubmitting(true)
    try {
      // Déterminer le client
      let clientNom = clientNomLibre.trim()
      let clientTel = clientTelLibre.trim()
      if (selectedClientId) {
        const found = clients.find((c) => c.id === selectedClientId)
        if (found) {
          clientNom = found.name
          clientTel = found.phone || clientTel
        }
      }

      await imprimerieService.savePrestationVariable(
        {
          company_id: companyId,
          sector_slug: activeSector,
          designation: designation.trim(),
          client_id: selectedClientId || undefined,
          client_nom: clientNom || 'Client Comptoir',
          client_tel: clientTel || undefined,
          mode_realisation: modeRealisation,
          prix_vente: parsedPrixVente,
          cout_realisation: isCoutRenseigne ? parsedCout : null, // null si non renseigné (≠ 0)
          note: note.trim() || undefined,
        },
        user
      )

      showCustomModal({
        type: 'success',
        title: 'Prestation enregistrée',
        message: 'La prestation à coût variable a été créée. Elle est maintenant dans l’onglet « En attente » pour validation par le graphiste.',
      })

      // Réinitialiser et basculer vers l'onglet "En attente"
      setDesignation('')
      setSelectedClientId('')
      setClientNomLibre('')
      setClientTelLibre('')
      setPrixVente('')
      setCoutRealisation('')
      setNote('')
      await fetchPrestations()
      onRefreshData?.()
      setActiveTab('en_attente')
    } catch (err: any) {
      showCustomModal({ type: 'error', title: 'Erreur', message: err.message || 'Impossible d’enregistrer la prestation.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── VALIDATION PAR LE GRAPHISTE ────────────────────────────────────────────
  // RÈGLE ESSENTIELLE :
  // La validation par le graphiste :
  // 1. Ajoute la marge brute à la marge de la période concernée (une seule fois, idempotent)
  // 2. Transmet la prestation au module Caisse pour encaissement
  // 3. Ne constitue pas un encaissement (aucun paiement automatique)
  const handleValiderGraphiste = async (item: PrestationVariable) => {
    if (!window.confirm(`Confirmez-vous la validation de la prestation « ${item.designation} » pour un montant de ${item.prix_vente.toLocaleString('fr-FR')} FCFA ?\n\nCette action transmettra la prestation à la caisse et intégrera sa marge brute (${item.marge_brute.toLocaleString('fr-FR')} FCFA) aux rapports financiers.`)) {
      return
    }

    try {
      await imprimerieService.validerPrestationVariableParGraphiste(item.id, companyId, user)
      showCustomModal({
        type: 'success',
        title: 'Prestation Validée par le Graphiste',
        message: `La prestation ${item.reference} a été validée avec succès ! Sa marge brute (+${item.marge_brute.toLocaleString('fr-FR')} F) a été intégrée à la période et le dossier est disponible en Caisse.`,
      })
      await fetchPrestations()
      onRefreshData?.()
    } catch (err: any) {
      showCustomModal({ type: 'error', title: 'Erreur validation', message: err.message || 'Impossible de valider.' })
    }
  }

  // ─── ANNULATION DE LA PRESTATION ───────────────────────────────────────────
  const handleAnnuler = async (item: PrestationVariable) => {
    const motif = window.prompt(`Motif de l'annulation pour la prestation ${item.reference} :`, 'Prestation annulée par le client')
    if (motif === null) return

    try {
      await imprimerieService.annulerPrestationVariable(item.id, companyId, user, motif)
      showCustomModal({
        type: 'info',
        title: 'Prestation Annulée',
        message: `La prestation ${item.reference} a été annulée. Elle ne contribuera pas à la marge brute.`,
      })
      await fetchPrestations()
      onRefreshData?.()
    } catch (err: any) {
      showCustomModal({ type: 'error', title: 'Erreur annulation', message: err.message || 'Action impossible.' })
    }
  }

  // ─── ENCAISSEMENT PAR LA CAISSIÈRE ───────────────────────────────────────────
  const handleOpenEncaissementModal = (item: PrestationVariable) => {
    setEncaissementModalItem(item)
    setMontantEncaissement(item.solde_restant > 0 ? item.solde_restant : item.prix_vente)
    setModePaiement('especes')
    setNoteEncaissement('')
  }

  const handleConfirmerEncaissement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!encaissementModalItem || !companyId) return

    const montant = Number(montantEncaissement) || 0
    if (montant <= 0) {
      showCustomModal({ type: 'error', title: 'Montant invalide', message: 'Veuillez saisir un montant supérieur à zéro.' })
      return
    }

    setIsProcessingEncaissement(true)
    try {
      const res = await imprimerieService.encaisserPrestationVariable(
        encaissementModalItem.id,
        companyId,
        montant,
        modePaiement,
        user,
        noteEncaissement
      )

      showCustomModal({
        type: 'success',
        title: 'Encaissement Réussi',
        message: `Paiement de ${montant.toLocaleString('fr-FR')} FCFA enregistré en Caisse ! N° Reçu : ${res.referenceRecu}. Solde restant : ${res.prestation.solde_restant.toLocaleString('fr-FR')} FCFA.`,
      })

      setEncaissementModalItem(null)
      await fetchPrestations()
      onRefreshData?.()
    } catch (err: any) {
      showCustomModal({ type: 'error', title: 'Erreur caisse', message: err.message || 'Impossible d’enregistrer le règlement.' })
    } finally {
      setIsProcessingEncaissement(false)
    }
  }

  // ─── FILTRES PAR ONGLETS ───────────────────────────────────────────────────
  const todayDateStr = new Date().toISOString().split('T')[0]

  const prestationsEnAttente = useMemo(() => {
    return prestations.filter((p) => p.statut === 'en_attente_validation' || p.statut === 'brouillon')
  }, [prestations])

  const prestationsAujourdhui = useMemo(() => {
    return prestations.filter((p) => {
      const d = p.created_at ? p.created_at.split('T')[0] : ''
      const dVal = p.date_validation ? p.date_validation.split('T')[0] : ''
      return d === todayDateStr || dVal === todayDateStr
    })
  }, [prestations, todayDateStr])

  // Total marges validées et en attente
  const stats = useMemo(() => {
    const totalEnAttente = prestationsEnAttente.reduce((acc, p) => acc + (p.prix_vente || 0), 0)
    const margeEnAttente = prestationsEnAttente.reduce((acc, p) => acc + (p.marge_brute || 0), 0)

    const validees = prestations.filter((p) => ['validee_graphiste', 'transmise_caisse', 'partiellement_encaissee', 'encaissee'].includes(p.statut))
    const totalTransmisCaisse = validees.reduce((acc, p) => acc + (p.prix_vente || 0), 0)
    const totalEncaisse = validees.reduce((acc, p) => acc + (p.montant_encaisse || 0), 0)
    const margeBruteValidee = validees.reduce((acc, p) => acc + (p.marge_brute || 0), 0)

    return {
      totalEnAttente,
      margeEnAttente,
      totalTransmisCaisse,
      totalEncaisse,
      margeBruteValidee,
    }
  }, [prestations, prestationsEnAttente])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── BANDEAU SYNTHÉTIQUE ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">En attente Graphiste</span>
          <p className="text-lg font-black text-amber-600 mt-0.5">{prestationsEnAttente.length} dossier(s)</p>
          <span className="text-[10px] text-slate-500 font-medium">{stats.totalEnAttente.toLocaleString('fr-FR')} F à valider</span>
        </div>

        <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase block">Marge Brute Ajoutée</span>
          <p className="text-lg font-black text-emerald-700 mt-0.5">+{stats.margeBruteValidee.toLocaleString('fr-FR')} F</p>
          <span className="text-[10px] text-emerald-600 font-medium">Intégrée à la période</span>
        </div>

        <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-200 shadow-xs">
          <span className="text-[10px] font-bold text-indigo-700 uppercase block">Transmis à la Caisse</span>
          <p className="text-lg font-black text-indigo-700 mt-0.5">{stats.totalTransmisCaisse.toLocaleString('fr-FR')} F</p>
          <span className="text-[10px] text-indigo-500 font-medium">Prix de vente total</span>
        </div>

        <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-200 shadow-xs">
          <span className="text-[10px] font-bold text-purple-700 uppercase block">Réellement Encaissé</span>
          <p className="text-lg font-black text-purple-700 mt-0.5">{stats.totalEncaisse.toLocaleString('fr-FR')} F</p>
          <span className="text-[10px] text-purple-500 font-medium">Règlements reçus</span>
        </div>
      </div>

      {/* ── ONGLETS PRINCIPAUX ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('nouveau')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
            activeTab === 'nouveau'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Plus className="w-4 h-4" /> Nouvelle prestation
        </button>

        <button
          onClick={() => setActiveTab('en_attente')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
            activeTab === 'en_attente'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" /> En attente ({prestationsEnAttente.length})
        </button>

        <button
          onClick={() => setActiveTab('aujourdhui')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
            activeTab === 'aujourdhui'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" /> Aujourd'hui ({prestationsAujourdhui.length})
        </button>

        <button
          onClick={() => setActiveTab('toutes')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
            activeTab === 'toutes'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <span>Toutes les prestations ({prestations.length})</span>
        </button>

        <button
          onClick={fetchPrestations}
          className="ml-auto p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
          title="Actualiser les données"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
        </button>
      </div>

      {/* ── VUE 1 : FORMULAIRE NOUVELLE PRESTATION ──────────────────────────── */}
      {activeTab === 'nouveau' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs max-w-3xl space-y-5 animate-scaleUp">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Palette className="w-5 h-5 text-pink-600" /> Saisie d’une Prestation à Coût Variable
              </h2>
              <p className="text-xs text-slate-500">
                Prestations intellectuelles & graphiques sans déduction de matière en stock (logo, retouche, PAO, maquette...)
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitNouvellePrestation} className="space-y-4 text-xs">
            {/* 1. Désignation */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Désignation de la prestation *
              </label>
              <input
                type="text"
                required
                placeholder="Ex : Création de logo d'entreprise, Retouche photo HD, Maquette packaging..."
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Exemples : conception graphique, mise en page de rapport, dépliant sur mesure, création de charte.
              </span>
            </div>

            {/* 2. Client & Mode de réalisation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Client (facultatif)</label>
                <div className="space-y-1.5">
                  <select
                    value={selectedClientId}
                    onChange={(e) => {
                      setSelectedClientId(e.target.value)
                      if (e.target.value) {
                        const c = clients.find((cl) => cl.id === e.target.value)
                        if (c) {
                          setClientNomLibre(c.name)
                          setClientTelLibre(c.phone || '')
                        }
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  >
                    <option value="">— Sélectionner un client enregistré —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Ou saisir un nom libre (ex : Entreprise ABC, Particulier...)"
                    value={clientNomLibre}
                    onChange={(e) => {
                      setClientNomLibre(e.target.value)
                      if (selectedClientId) setSelectedClientId('')
                    }}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mode de réalisation</label>
                <select
                  value={modeRealisation}
                  onChange={(e) => setModeRealisation(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="interne">Réalisation Interne (Graphiste atelier)</option>
                  <option value="externe">Réalisation Externe (Prestataire / Freelance)</option>
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Permet d'identifier les prestations déléguées à un graphiste externe ou sous-traitant.
                </span>
              </div>
            </div>

            {/* 3. Prix de vente & Coût de réalisation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Prix de vente (FCFA) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="0"
                  value={prixVente}
                  onChange={(e) => setPrixVente(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-black text-base text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Montant facturé et à encaisser auprès du client.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Coût de réalisation (FCFA)</label>
                  <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                    Facultatif
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="Laisser vide si aucun coût"
                  value={coutRealisation}
                  onChange={(e) => setCoutRealisation(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {isCoutRenseigne
                    ? `Coût renseigné : ${Number(coutRealisation).toLocaleString('fr-FR')} FCFA`
                    : 'Non renseigné (traité arithmétiquement comme 0 F pour la marge).'}
                </span>
              </div>
            </div>

            {/* ── ZONE DE MARGE BRUTE CALCULÉE EN TEMPS RÉEL ─────────────────────── */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-900 uppercase block">
                    Marge brute calculée en direct
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium">
                    Formule : Prix de vente ({parsedPrixVente.toLocaleString('fr-FR')} F) − Coût ({isCoutRenseigne ? `${parsedCout.toLocaleString('fr-FR')} F` : '0 F'})
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-emerald-700 font-mono">
                    {margeCalculee.toLocaleString('fr-FR')} FCFA
                  </p>
                  <p className="text-[10px] font-bold text-emerald-600">
                    Taux de marge : {tauxMargeCalcule.toFixed(1)}%
                  </p>
                </div>
              </div>

              {!isCoutRenseigne && (
                <div className="text-[11px] text-amber-800 bg-amber-50/80 p-2 rounded-xl border border-amber-200 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>
                    <strong>Coût non renseigné :</strong> la marge calculée est de {margeCalculee.toLocaleString('fr-FR')} FCFA.
                  </span>
                </div>
              )}
            </div>

            {/* Note & instructions */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Note / Instructions de conception (facultatif)
              </label>
              <textarea
                rows={2}
                placeholder="Précisions graphiques, couleurs souhaitées, format vectoriel, délai..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            {/* Boutons d'action */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition"
              >
                Réinitialiser
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !designation.trim() || parsedPrixVente <= 0}
                className="px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Enregistrement...' : 'Valider ma prestation (+)'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── VUE 2, 3, 4 : TABLEAU DES PRESTATIONS ──────────────────────────── */}
      {activeTab !== 'nouveau' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                {activeTab === 'en_attente' && 'Prestations en Attente de Validation par le Graphiste'}
                {activeTab === 'aujourdhui' && 'Prestations créées ou validées aujourd’hui'}
                {activeTab === 'toutes' && 'Toutes les Prestations à Coût Variable'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {activeTab === 'en_attente' && 'Examinez la prestation et cliquez sur « Valider » pour intégrer sa marge brute à la période et transmettre à la caisse.'}
                {activeTab === 'aujourdhui' && 'Suivi journalier des dossiers graphiques et transmission caisse.'}
                {activeTab === 'toutes' && 'Historique complet des prestations, marges et règlements.'}
              </p>
            </div>
          </div>

          {(() => {
            const listToDisplay = activeTab === 'en_attente'
              ? prestationsEnAttente
              : activeTab === 'aujourdhui'
              ? prestationsAujourdhui
              : prestations

            if (listToDisplay.length === 0) {
              return (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Aucune prestation trouvée pour cette vue.
                </div>
              )
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Réf</th>
                      <th className="p-3">Désignation</th>
                      <th className="p-3">Client</th>
                      <th className="p-3 text-right">Prix Vente</th>
                      <th className="p-3 text-right">Coût Réal.</th>
                      <th className="p-3 text-right font-black text-emerald-800">Marge Brute</th>
                      <th className="p-3 text-center">Statut</th>
                      <th className="p-3">Validation Graphiste</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {listToDisplay.map((p) => {
                      const isEnAttente = p.statut === 'en_attente_validation' || p.statut === 'brouillon'
                      const isTransmise = p.statut === 'transmise_caisse'
                      const isSoldee = p.statut === 'encaissee'
                      const isPartiel = p.statut === 'partiellement_encaissee'
                      const isAnnulee = p.statut === 'annulee'

                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono font-bold text-slate-900">{p.reference}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{p.designation}</span>
                            <span className="text-[10px] text-slate-400 capitalize">
                              Mode : {p.mode_realisation}
                              {p.note ? ` • ${p.note}` : ''}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-800 block">{p.client_nom || 'Client Comptoir'}</span>
                            {p.client_tel && <span className="text-[10px] text-slate-400">{p.client_tel}</span>}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900 font-mono">
                            {Number(p.prix_vente).toLocaleString('fr-FR')} F
                          </td>
                          <td className="p-3 text-right font-mono">
                            {p.cout_realisation !== null && p.cout_realisation !== undefined ? (
                              <span className="text-slate-700 font-semibold">{Number(p.cout_realisation).toLocaleString('fr-FR')} F</span>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">Non renseigné (0 F)</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black text-emerald-700 font-mono">
                            +{Number(p.marge_brute).toLocaleString('fr-FR')} F
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block ${
                              isEnAttente
                                ? 'bg-amber-100 text-amber-800'
                                : isTransmise
                                ? 'bg-blue-100 text-blue-800'
                                : isPartiel
                                ? 'bg-purple-100 text-purple-800'
                                : isSoldee
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {isEnAttente && 'En attente graphiste'}
                              {isTransmise && 'Transmise à la Caisse'}
                              {isPartiel && `Acompte (${Number(p.montant_encaisse).toLocaleString('fr-FR')} F)`}
                              {isSoldee && 'Encaissée (Soldée)'}
                              {isAnnulee && 'Annulée'}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-600">
                            {p.graphiste_nom ? (
                              <div>
                                <span className="font-bold text-slate-800 block">{p.graphiste_nom}</span>
                                {p.date_validation && (
                                  <span className="text-[10px] text-slate-400">
                                    {new Date(p.date_validation).toLocaleDateString('fr-FR')} à {new Date(p.date_validation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Non validée</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 1. Bouton Validation Graphiste */}
                              {isEnAttente && (
                                <button
                                  onClick={() => handleValiderGraphiste(p)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold shadow-xs transition flex items-center gap-1"
                                  title="Valider par le graphiste : ajoute la marge à la période et transmet à la caisse"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Valider</span>
                                </button>
                              )}

                              {/* 2. Bouton Encaisser (Accessible si transmise ou paiement partiel) */}
                              {(isTransmise || isPartiel) && (
                                <button
                                  onClick={() => handleOpenEncaissementModal(p)}
                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold shadow-xs transition flex items-center gap-1"
                                  title="Encaisser en Caisse le montant réel du prix de vente"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  <span>Encaisser</span>
                                </button>
                              )}

                              {/* 3. Bouton Annuler */}
                              {!isSoldee && !isAnnulee && (
                                <button
                                  onClick={() => handleAnnuler(p)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="Annuler la prestation"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── MODAL D'ENCAISSEMENT PAR LA CAISSIÈRE ───────────────────────────── */}
      {encaissementModalItem && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  Encaissement en Caisse
                </h3>
                <p className="text-[11px] text-slate-400">
                  Prestation : {encaissementModalItem.reference} — {encaissementModalItem.designation}
                </p>
              </div>
              <button onClick={() => setEncaissementModalItem(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Récapitulatif financier */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Prix de vente total :</span>
                <span className="font-bold text-slate-900">{Number(encaissementModalItem.prix_vente).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Déjà réglé :</span>
                <span className="font-bold text-emerald-700">{Number(encaissementModalItem.montant_encaisse || 0).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-indigo-900 font-black">
                <span>Reste à payer :</span>
                <span>{Number(encaissementModalItem.solde_restant).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>

            <form onSubmit={handleConfirmerEncaissement} className="space-y-3 pt-1">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant perçu (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={encaissementModalItem.solde_restant}
                  value={montantEncaissement}
                  onChange={(e) => setMontantEncaissement(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-black text-base text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mode de règlement *</label>
                <select
                  value={modePaiement}
                  onChange={(e) => setModePaiement(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="especes">Espèces (Caisse)</option>
                  <option value="momo_mtn">Mobile Money MTN</option>
                  <option value="momo_moov">Mobile Money MOOV</option>
                  <option value="banque">Virement Bancaire</option>
                  <option value="cheque">Chèque</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observation / Reçu (facultatif)</label>
                <input
                  type="text"
                  placeholder="Ex : Réglé en espèces au comptoir..."
                  value={noteEncaissement}
                  onChange={(e) => setNoteEncaissement(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEncaissementModalItem(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessingEncaissement || Number(montantEncaissement) <= 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isProcessingEncaissement ? 'Enregistrement...' : 'Confirmer l’encaissement'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PrestationsVariablesModule
