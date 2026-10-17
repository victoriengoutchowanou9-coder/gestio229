// =============================================================================
// GESTIO 229 SaaS — Modale Professionnelle : Nouveau Devis Imprimerie Multi-Prestations
// Secteur Impression & Sérigraphie — Calculette Surfaces m², Exemplaires, Main-d'œuvre,
// Fiscalité Paramétrable, Fiche Graphiste, Notes Internes & Envoi en Caisse
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FileText, Plus, X, Check, Calculator, Trash2, Edit3, User,
  Phone, Calendar, AlertTriangle, ShieldCheck, Lock, Sparkles,
  Layers, Palette, Clock, CheckCircle2, Search, ArrowRight, Printer
} from 'lucide-react'
import ModalPortal from '../../../components/modals/ModalPortal'
import {
  imprimerieService,
  DevisImprimerie,
  DevisLigne,
  PrestationImprimerie,
  ModeCalcul
} from '../../../services/imprimerieService'
import { supabase } from '../../../lib/supabase'
import { formatFCFA } from '../../../utils/tax'
import { showModal, showConfirm } from '../../../components/modals/CustomModalGestio'

interface NouveauDevisImprimerieModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (devis: DevisImprimerie, action?: 'saved' | 'caisse') => void
  companyId: string
  activeSector: string
  user: any
  company: any
  prestationsCatalog: PrestationImprimerie[]
  onPrestationCreated?: () => void
}

export const NouveauDevisImprimerieModal: React.FC<NouveauDevisImprimerieModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyId,
  activeSector,
  user,
  company,
  prestationsCatalog,
  onPrestationCreated,
}) => {
  // ── 1. ÉTATS DU DEVIS ──
  const [clientId, setClientId] = useState<string>('')
  const [clientNom, setClientNom] = useState<string>('Client Comptoir')
  const [clientTel, setClientTel] = useState<string>('')
  const [clientEmail, setClientEmail] = useState<string>('')
  const [dateValidite, setDateValidite] = useState<string>(
    new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
  )
  const [notesInternes, setNotesInternes] = useState<string>('')
  const [devisLignes, setDevisLignes] = useState<DevisLigne[]>([])

  // ── 2. ÉTATS SÉLECTION & RECHERCHE CLIENT ──
  const [clientsList, setClientsList] = useState<any[]>([])
  const [clientSearch, setClientSearch] = useState<string>('')
  const [showClientSearchDropdown, setShowClientSearchDropdown] = useState<boolean>(false)
  const [showQuickNewClientModal, setShowQuickNewClientModal] = useState<boolean>(false)
  const [newClientForm, setNewClientForm] = useState({ name: '', phone: '', address: '', ifu: '' })
  const [isSavingClient, setIsSavingClient] = useState<boolean>(false)

  // ── 3. ÉTAT SAISIE D'UNE PRESTATION ACTIVE ──
  const [selectedPrestationId, setSelectedPrestationId] = useState<string>('')
  const [designation, setDesignation] = useState<string>('Impression Bâche 2.5m')
  const [modeCalcul, setModeCalcul] = useState<ModeCalcul>('m2')
  const [modeSurface, setModeSurface] = useState<'auto' | 'manuel'>('auto')
  const [largeur, setLargeur] = useState<number>(2)
  const [hauteur, setHauteur] = useState<number>(2)
  const [surfaceManuelle, setSurfaceManuelle] = useState<number>(4)
  const [prixM2, setPrixM2] = useState<number>(2000)
  const [prixUnitaire, setPrixUnitaire] = useState<number>(2000)
  const [exemplaires, setExemplaires] = useState<number>(2)
  const [mainDoeuvre, setMainDoeuvre] = useState<number>(0)
  const [tvaPct, setTvaPct] = useState<number>(18)
  const [instructionsGraphiste, setInstructionsGraphiste] = useState<string>('')
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null)

  // ── 4. ÉTAT AJOUT RAPIDE D'UNE DÉSIGNATION CATALOGUE ──
  const [showQuickNewPrestation, setShowQuickNewPrestation] = useState<boolean>(false)
  const [newPresNom, setNewPresNom] = useState<string>('')
  const [newPresCat, setNewPresCat] = useState<string>('Grand Format')
  const [newPresMode, setNewPresMode] = useState<ModeCalcul>('m2')
  const [newPresPrix, setNewPresPrix] = useState<number>(3000)
  const [isSavingPres, setIsSavingPres] = useState<boolean>(false)

  // ── 5. CHARGEMENT CLIENTS SUPABASE ──
  const loadClients = useCallback(async () => {
    if (!companyId) return
    try {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, email, address, ifu')
        .eq('company_id', companyId)
        .order('name')
      setClientsList(data || [])
    } catch (err) {
      console.warn('Erreur chargement clients:', err)
    }
  }, [companyId])

  useEffect(() => {
    if (isOpen) {
      loadClients()
    }
  }, [isOpen, loadClients])

  // Filtrage des clients pour l'autocomplétion
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientsList.slice(0, 8)
    const q = clientSearch.toLowerCase().trim()
    return clientsList.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [clientsList, clientSearch])

  // ── CALCULS EN TEMPS RÉEL DE LA LIGNE EN COURS DE SAISIE ──
  const currentSurface = useMemo(() => {
    if (modeCalcul !== 'm2') return 1
    if (modeSurface === 'manuel') return Math.max(0, Number(surfaceManuelle) || 0)
    return Math.round(Math.max(0, Number(largeur) || 0) * Math.max(0, Number(hauteur) || 0) * 1000) / 1000
  }, [modeCalcul, modeSurface, largeur, hauteur, surfaceManuelle])

  const currentPrixUnitaire = useMemo(() => {
    if (modeCalcul === 'm2') {
      return Math.round(currentSurface * (Number(prixM2) || 0))
    }
    return Number(prixUnitaire) || 0
  }, [modeCalcul, currentSurface, prixM2, prixUnitaire])

  const currentMontantImpressions = useMemo(() => {
    return Math.round(currentPrixUnitaire * Math.max(1, Number(exemplaires) || 1))
  }, [currentPrixUnitaire, exemplaires])

  const currentTotalHt = useMemo(() => {
    return currentMontantImpressions + (Number(mainDoeuvre) || 0)
  }, [currentMontantImpressions, mainDoeuvre])

  const currentMontantTva = useMemo(() => {
    const rate = Number(tvaPct) || 0
    return Math.round(currentTotalHt * (rate / 100))
  }, [currentTotalHt, tvaPct])

  const currentTotalTtc = useMemo(() => {
    return currentTotalHt + currentMontantTva
  }, [currentTotalHt, currentMontantTva])

  // ── CALCULS GLOBAUX DU DEVIS ──
  const totalsDevis = useMemo(() => {
    let totImpressionsHt = 0
    let totMoHt = 0
    let totHt = 0
    let totTva = 0
    let totTtc = 0

    devisLignes.forEach((l) => {
      const surface = Number(l.surface_m2 || 1)
      const qty = Number(l.quantite || 1)
      const pu = Number(l.prix_unitaire || 0)
      const mo = Number(l.main_doeuvre || l.details_json?.main_doeuvre || 0)
      const isM2 = l.mode_calcul === 'm2'
      const baseImp = isM2 && surface > 0 ? surface * pu * qty : pu * qty

      const ht = Number(l.montant_ht || 0)
      const ttc = Number(l.montant_ttc || 0)
      const tva = ttc - ht

      totImpressionsHt += baseImp
      totMoHt += mo
      totHt += ht
      totTva += tva
      totTtc += ttc
    })

    return {
      totImpressionsHt: Math.round(totImpressionsHt),
      totMoHt: Math.round(totMoHt),
      totHt: Math.round(totHt),
      totTva: Math.round(totTva),
      totTtc: Math.round(totTtc),
    }
  }, [devisLignes])

  // ── SELECTION PRESTATION DEPUIS LE CATALOGUE ──
  const handleSelectPrestation = (presId: string) => {
    setSelectedPrestationId(presId)
    const p = prestationsCatalog.find((x) => x.id === presId)
    if (!p) return

    setDesignation(p.nom)
    setModeCalcul(p.mode_calcul || 'm2')
    setTvaPct(p.tva_applicable ? 18 : 0)

    if (p.mode_calcul === 'm2') {
      setPrixM2(p.prix_vente || 2000)
    } else {
      setPrixUnitaire(p.prix_vente || 2000)
    }
    setMainDoeuvre(p.cout_mo_defaut || 0)
  }

  // ── PRE-ENREGISTRER LA LIGNE DANS LE BROUILLON ──
  const handlePreSaveLine = () => {
    if (!designation.trim()) {
      showModal({ type: 'warning', title: 'Champ obligatoire', message: 'Veuillez saisir une désignation de prestation.' })
      return
    }

    if (modeCalcul === 'm2' && currentSurface <= 0) {
      showModal({ type: 'warning', title: 'Dimensions requises', message: 'La surface au m² doit être strictement supérieure à 0.' })
      return
    }

    if (Number(exemplaires) <= 0) {
      showModal({ type: 'warning', title: 'Quantité invalide', message: 'Le nombre d\'exemplaires doit être d\'au moins 1.' })
      return
    }

    const newLine: DevisLigne = {
      prestation_id: selectedPrestationId || undefined,
      designation: designation.trim(),
      mode_calcul: modeCalcul,
      largeur: modeSurface === 'auto' ? Number(largeur) : 1,
      hauteur: modeSurface === 'auto' ? Number(hauteur) : 1,
      surface_m2: currentSurface,
      quantite: Number(exemplaires),
      prix_unitaire: modeCalcul === 'm2' ? Number(prixM2) : Number(prixUnitaire),
      prix_m2: modeCalcul === 'm2' ? Number(prixM2) : undefined,
      main_doeuvre: Number(mainDoeuvre) || 0,
      instructions_graphiste: instructionsGraphiste.trim() || undefined,
      remise_pct: 0,
      montant_ht: currentTotalHt,
      tva_pct: Number(tvaPct) || 0,
      montant_ttc: currentTotalTtc,
      details_json: {
        mode_surface: modeSurface,
        main_doeuvre: Number(mainDoeuvre) || 0,
        instructions_graphiste: instructionsGraphiste.trim(),
        prix_m2: modeCalcul === 'm2' ? Number(prixM2) : undefined,
        exemplaires: Number(exemplaires),
      },
    }

    if (editingLineIndex !== null) {
      // Mise à jour de la ligne en cours d'édition
      setDevisLignes((prev) => {
        const copy = [...prev]
        copy[editingLineIndex] = newLine
        return copy
      })
      setEditingLineIndex(null)
    } else {
      // Ajout nouvelle ligne
      setDevisLignes((prev) => [...prev, newLine])
    }

    // Réinitialisation des champs pour la prestation suivante
    setDesignation('')
    setSelectedPrestationId('')
    setInstructionsGraphiste('')
    setMainDoeuvre(0)
    setEditingLineIndex(null)
  }

  // ── MODIFIER UNE LIGNE DU RECAPITULATIF ──
  const handleEditLine = (index: number) => {
    const l = devisLignes[index]
    if (!l) return

    setEditingLineIndex(index)
    setSelectedPrestationId(l.prestation_id || '')
    setDesignation(l.designation)
    setModeCalcul(l.mode_calcul)
    setLargeur(l.largeur || 2)
    setHauteur(l.hauteur || 2)
    setSurfaceManuelle(l.surface_m2 || 4)
    setModeSurface(l.details_json?.mode_surface || 'auto')
    setExemplaires(l.quantite || 1)
    setPrixM2(l.prix_m2 || l.prix_unitaire || 2000)
    setPrixUnitaire(l.prix_unitaire || 2000)
    setMainDoeuvre(l.main_doeuvre || l.details_json?.main_doeuvre || 0)
    setTvaPct(l.tva_pct || 0)
    setInstructionsGraphiste(l.instructions_graphiste || l.details_json?.instructions_graphiste || '')
  }

  // ── SUPPRIMER UNE LIGNE ──
  const handleDeleteLine = (index: number) => {
    setDevisLignes((prev) => prev.filter((_, i) => i !== index))
    if (editingLineIndex === index) {
      setEditingLineIndex(null)
    }
  }

  // ── CREATION RAPIDE DE CLIENT ──
  const handleSaveQuickClient = async () => {
    if (!newClientForm.name.trim()) {
      showModal({ type: 'warning', title: 'Nom obligatoire', message: 'Veuillez saisir le nom du client.' })
      return
    }

    setIsSavingClient(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          company_id: companyId,
          name: newClientForm.name.trim(),
          phone: newClientForm.phone.trim(),
          address: newClientForm.address.trim(),
          ifu: newClientForm.ifu.trim(),
        })
        .select()
        .single()

      if (error) throw error

      setClientId(data.id)
      setClientNom(data.name)
      setClientTel(data.phone || '')
      setClientEmail(data.email || '')
      setShowQuickNewClientModal(false)
      setNewClientForm({ name: '', phone: '', address: '', ifu: '' })
      loadClients()
    } catch (err: any) {
      showModal({ type: 'error', title: 'Erreur', message: err.message || 'Impossible de créer le client.' })
    } finally {
      setIsSavingClient(false)
    }
  }

  // ── CREATION RAPIDE DE PRESTATION CATALOGUE ──
  const handleSaveQuickPrestation = async () => {
    if (!newPresNom.trim()) {
      showModal({ type: 'warning', title: 'Nom obligatoire', message: 'Veuillez saisir le nom de la prestation.' })
      return
    }

    setIsSavingPres(true)
    try {
      const newPres = await imprimerieService.savePrestation({
        company_id: companyId,
        sector_slug: activeSector,
        nom: newPresNom.trim(),
        categorie: newPresCat,
        mode_calcul: newPresMode,
        prix_vente: Number(newPresPrix) || 2000,
        prix_minimum: Number(newPresPrix) * 0.8,
        prix_gros: Number(newPresPrix) * 0.9,
        unite_facturation: newPresMode === 'm2' ? 'm²' : 'unité',
        tva_applicable: true,
        aib_applicable: false,
        cout_mo_defaut: 0,
        cout_finition_defaut: 0,
        cout_autres_defaut: 0,
        est_actif: true,
      })

      setShowQuickNewPrestation(false)
      setNewPresNom('')
      if (onPrestationCreated) onPrestationCreated()

      // Sélection immédiate
      handleSelectPrestation(newPres.id)
    } catch (err: any) {
      showModal({ type: 'error', title: 'Erreur', message: err.message || 'Impossible de créer la désignation.' })
    } finally {
      setIsSavingPres(false)
    }
  }

  // ── ENREGISTREMENT DU DEVIS (Brouillon ou Validé) ──
  const handleFinalSave = async (statut: 'brouillon' | 'envoye' | 'accepte', andConvertCaisse: boolean = false) => {
    if (!clientNom.trim()) {
      showModal({ type: 'warning', title: 'Client requis', message: 'Veuillez spécifier le client ou cliquer sur "Comptoir".' })
      return
    }

    if (devisLignes.length === 0) {
      showModal({ type: 'warning', title: 'Devis vide', message: 'Veuillez pré-enregistrer au moins une prestation dans le devis.' })
      return
    }

    try {
      const saved = await imprimerieService.saveDevis(
        {
          company_id: companyId,
          sector_slug: activeSector,
          client_id: clientId || undefined,
          client_nom: clientNom.trim(),
          client_tel: clientTel.trim(),
          client_email: clientEmail.trim(),
          date_devis: new Date().toISOString().split('T')[0],
          date_validite: dateValidite,
          statut: statut,
          notes: notesInternes.trim() || undefined,
          notes_internes: notesInternes.trim() || undefined,
          commercial_nom: user?.full_name || 'Commercial',
        },
        devisLignes
      )

      if (andConvertCaisse) {
        // Validation et envoi direct en caisse (transformation en commande)
        await imprimerieService.transformerDevisEnCommande(saved.id, user)
        onSuccess(saved, 'caisse')
      } else {
        onSuccess(saved, 'saved')
      }

      onClose()
    } catch (err: any) {
      showModal({ type: 'error', title: 'Erreur enregistrement', message: err.message || 'Échec de l\'enregistrement du devis.' })
    }
  }

  if (!isOpen) return null

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-nouveau-devis" zIndex={60}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
        
        {/* ── EN-TÊTE MODALE ── */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">Nouveau Devis Imprimerie & Sérigraphie</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  MULTI-PRESTATIONS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Calculateur surfaces m², décomposition fiscale HT / TVA, fiche graphiste et validation caisse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── CORPS DE LA MODALE ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* ══ SECTION 1 : SÉLECTION DU CLIENT & VALIDITÉ ══ */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <User className="w-4 h-4 text-pink-600" />
                1. Sélection du Client
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setClientId('')
                    setClientNom('Client Comptoir')
                    setClientTel('')
                    setClientEmail('')
                    setClientSearch('')
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1 ${
                    clientNom === 'Client Comptoir'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Comptoir
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickNewClientModal(true)}
                  className="px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Client
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              {/* Recherche ou saisie client */}
              <div className="relative sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Nom du Client ou Société *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clientNom}
                    onChange={(e) => {
                      setClientNom(e.target.value)
                      setClientSearch(e.target.value)
                      setShowClientSearchDropdown(true)
                    }}
                    onFocus={() => setShowClientSearchDropdown(true)}
                    placeholder="Tapez pour rechercher un client ou saisir directement..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                  {clientNom && clientNom !== 'Client Comptoir' && (
                    <button
                      type="button"
                      onClick={() => {
                        setClientId('')
                        setClientNom('')
                        setClientTel('')
                        setClientSearch('')
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown d'autocomplétion client */}
                {showClientSearchDropdown && filteredClients.length > 0 && clientSearch && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredClients.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setClientId(c.id)
                          setClientNom(c.name)
                          setClientTel(c.phone || '')
                          setClientEmail(c.email || '')
                          setShowClientSearchDropdown(false)
                        }}
                        className="p-2.5 hover:bg-pink-50 dark:hover:bg-pink-950/30 cursor-pointer flex items-center justify-between text-xs transition"
                      >
                        <span className="font-bold text-slate-800 dark:text-slate-200">{c.name}</span>
                        <span className="text-[11px] text-slate-400">{c.phone || 'Sans tel'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Téléphone client */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Téléphone
                </label>
                <input
                  type="text"
                  value={clientTel}
                  onChange={(e) => setClientTel(e.target.value)}
                  placeholder="Ex: +229 97 00 00 00"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Date de validité */}
            <div className="flex items-center gap-3 pt-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Date de validité de l'offre :
              </label>
              <input
                type="date"
                value={dateValidite}
                onChange={(e) => setDateValidite(e.target.value)}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>
          </div>

          {/* ══ SECTION 2 : FORMULAIRE D'UNE PRESTATION & CALCULS AUTOMATIQUES ══ */}
          <div className="bg-pink-50/40 dark:bg-slate-800/80 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-pink-900/40 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-pink-100 dark:border-slate-700 pb-3">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-pink-800 dark:text-pink-300 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-pink-600" />
                  2. Saisie d'une Prestation & Calculette Métier
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {editingLineIndex !== null ? `Modification de la ligne #${editingLineIndex + 1}` : 'Configurez les dimensions, tirages et options de fabrication'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickNewPrestation(true)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-700 border border-pink-200 dark:border-slate-600 text-pink-700 dark:text-pink-300 hover:bg-pink-50 flex items-center gap-1 transition"
                >
                  <Plus className="w-3 h-3" />
                  + Ajouter une désignation
                </button>
              </div>
            </div>

            {/* Sélection de la désignation dans le catalogue */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Désignation active *
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedPrestationId}
                    onChange={(e) => handleSelectPrestation(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  >
                    <option value="">-- Choisir dans le catalogue ou personnaliser --</option>
                    {prestationsCatalog.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom} ({p.mode_calcul === 'm2' ? `${p.prix_vente} F/m²` : `${p.prix_vente} F`})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Intitulé sur le devis *
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Ex: Bâche 2.5m avec œillets tous les 50cm"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Mode de tarification & Champs dimensions */}
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Mode de calcul :</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModeCalcul('m2')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        modeCalcul === 'm2'
                          ? 'bg-pink-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Au m² (Surface)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeCalcul('unite')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        modeCalcul === 'unite'
                          ? 'bg-pink-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      À l'unité / Forfait
                    </button>
                  </div>
                </div>

                {modeCalcul === 'm2' && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] text-slate-500">Saisie surface :</span>
                    <button
                      type="button"
                      onClick={() => setModeSurface('auto')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        modeSurface === 'auto' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Largeur × Hauteur
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeSurface('manuel')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        modeSurface === 'manuel' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Surface Libre (m²)
                    </button>
                  </div>
                )}
              </div>

              {/* Ligne des calculs de dimension */}
              {modeCalcul === 'm2' ? (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-center">
                  {modeSurface === 'auto' ? (
                    <>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Largeur (m)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={largeur}
                          onChange={(e) => setLargeur(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-center font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hauteur (m)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={hauteur}
                          onChange={(e) => setHauteur(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-center font-bold"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Surface directe (m²)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={surfaceManuelle}
                        onChange={(e) => setSurfaceManuelle(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-center font-bold"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Surface calculée</label>
                    <div className="px-2.5 py-1.5 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800 rounded-lg text-xs text-center font-mono font-black text-pink-700 dark:text-pink-300">
                      {currentSurface.toFixed(2)} m²
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Prix au m² (F)</label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={prixM2}
                      onChange={(e) => setPrixM2(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-right font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">P.U. Unitaire (F)</label>
                    <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-right font-bold text-slate-800 dark:text-slate-200">
                      {formatFCFA(currentPrixUnitaire)}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-pink-600 uppercase block mb-1">Exemplaires *</label>
                    <input
                      type="number"
                      min="1"
                      value={exemplaires}
                      onChange={(e) => setExemplaires(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border-2 border-pink-500 rounded-lg text-xs text-center font-black text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Prix Unitaire (FCFA)</label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={prixUnitaire}
                      onChange={(e) => setPrixUnitaire(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-right font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-pink-600 uppercase block mb-1">Nombre d'exemplaires *</label>
                    <input
                      type="number"
                      min="1"
                      value={exemplaires}
                      onChange={(e) => setExemplaires(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border-2 border-pink-500 rounded-lg text-xs text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Sous-total Prestation</label>
                    <div className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-right font-bold text-slate-800 dark:text-slate-200">
                      {formatFCFA(currentMontantImpressions)}
                    </div>
                  </div>
                </div>
              )}

              {/* Ligne Main d'œuvre, TVA et Récap ligne */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 items-center">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Main-d'œuvre (Forfait FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={mainDoeuvre}
                    onChange={(e) => setMainDoeuvre(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-right font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Taux TVA (%)
                  </label>
                  <select
                    value={tvaPct}
                    onChange={(e) => setTvaPct(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold"
                  >
                    <option value={18}>18% (Standard UEMOA)</option>
                    <option value={0}>0% (Exonéré / Export)</option>
                    <option value={10}>10% (Taux réduit)</option>
                  </select>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Total HT Ligne</span>
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    {formatFCFA(currentTotalHt)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-pink-500 font-bold block">TOTAL TTC LIGNE</span>
                  <span className="font-black text-sm text-pink-700 dark:text-pink-400">
                    {formatFCFA(currentTotalTtc)}
                  </span>
                </div>
              </div>
            </div>

            {/* Instructions pour le Graphiste */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <Palette className="w-3.5 h-3.5 text-pink-500" />
                Instructions pour le Graphiste (optionnel) :
              </label>
              <input
                type="text"
                value={instructionsGraphiste}
                onChange={(e) => setInstructionsGraphiste(e.target.value)}
                placeholder="Ex: Fond perdu 3mm, couleurs CMJN, dégradé bleu/blanc, format horizontal, urgent..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>

            {/* Bouton Pré-enregistrer cette entrée */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handlePreSaveLine}
                className="px-5 py-2.5 rounded-xl font-black text-xs bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white shadow-md hover:shadow-lg transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingLineIndex !== null ? 'Valider la modification' : 'Pré-enregistrer cette entrée'}
              </button>
            </div>
          </div>

          {/* ══ SECTION 3 : RÉCAPITULATIF DES PRESTATIONS DU DEVIS ══ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-pink-600" />
                3. Récapitulatif des Prestations ({devisLignes.length})
              </span>
              {devisLignes.length > 0 && (
                <span className="text-[11px] text-slate-400 font-semibold">
                  Toute modification recalcule automatiquement les totaux
                </span>
              )}
            </div>

            {devisLignes.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
                Aucune prestation ajoutée pour l'instant. Configurez la calculette ci-dessus et cliquez sur <strong>« Pré-enregistrer cette entrée »</strong>.
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Désignation</th>
                      <th className="px-3 py-2.5 text-center">Format / m²</th>
                      <th className="px-3 py-2.5 text-center">Ex.</th>
                      <th className="px-3 py-2.5 text-right">P.U.</th>
                      <th className="px-3 py-2.5 text-right">M.O.</th>
                      <th className="px-3 py-2.5 text-center">TVA</th>
                      <th className="px-3 py-2.5 text-right">Total HT</th>
                      <th className="px-3 py-2.5 text-right">Total TTC</th>
                      <th className="px-3 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {devisLignes.map((l, idx) => (
                      <tr key={idx} className="hover:bg-pink-50/20 dark:hover:bg-slate-800/50 transition">
                        <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200">
                          {l.designation}
                          {l.instructions_graphiste && (
                            <span className="block text-[10px] text-pink-600 dark:text-pink-400 font-normal italic">
                              Graphiste : {l.instructions_graphiste}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono">
                          {l.mode_calcul === 'm2'
                            ? `${Number(l.largeur || 0).toFixed(2)}m × ${Number(l.hauteur || 0).toFixed(2)}m (${Number(l.surface_m2 || 0).toFixed(2)} m²)`
                            : 'Unité / Forfait'}
                        </td>
                        <td className="px-3 py-2.5 text-center font-black">{l.quantite}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{formatFCFA(l.prix_unitaire).replace(' FCFA', '')}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500">
                          {l.main_doeuvre ? formatFCFA(l.main_doeuvre).replace(' FCFA', '') : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400">
                          {l.tva_pct ? `${l.tva_pct}%` : 'Exo'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">
                          {formatFCFA(l.montant_ht).replace(' FCFA', '')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-black text-pink-700 dark:text-pink-400">
                          {formatFCFA(l.montant_ttc)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditLine(idx)}
                              className="p-1 text-slate-400 hover:text-pink-600 rounded hover:bg-slate-100 transition"
                              title="Modifier cette ligne"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLine(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition"
                              title="Supprimer cette ligne"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ══ SECTION 4 : NOTES INTERNES & TOTAUX GÉNÉRAUX ══ */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
            {/* Notes internes (Strictement exclues du devis client) */}
            <div className="sm:col-span-7 bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Notes Internes & Consignes Atelier (Optionnel)
              </label>
              <textarea
                rows={3}
                value={notesInternes}
                onChange={(e) => setNotesInternes(e.target.value)}
                placeholder="Remarques commerciales, suivi commercial, consignes d'équipe, conditions d'atelier..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400 italic">
                🔒 Confidentiel : ces notes restent strictement internes et n'apparaissent JAMAIS sur le devis remis au client.
              </p>
            </div>

            {/* Cartouche Totaux Devis */}
            <div className="sm:col-span-5 bg-slate-900 text-white p-4 rounded-2xl space-y-2.5 shadow-lg">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Total Impressions HT :</span>
                <span className="font-semibold">{formatFCFA(totalsDevis.totImpressionsHt)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Total Main-d'œuvre HT :</span>
                <span className="font-semibold">{formatFCFA(totalsDevis.totMoHt)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-300 border-t border-slate-800 pt-1.5">
                <span>Total Base HT :</span>
                <span className="font-bold text-white">{formatFCFA(totalsDevis.totHt)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Total TVA :</span>
                <span className="font-bold text-white">{formatFCFA(totalsDevis.totTva)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t-2 border-pink-500/80 pt-2">
                <span className="font-black text-pink-400 uppercase tracking-wider">NET À PAYER TTC :</span>
                <span className="font-black text-lg text-white">
                  {formatFCFA(totalsDevis.totTtc)}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── PIED DE PAGE & BOUTONS D'ACTION ── */}
        <div className="bg-slate-50 dark:bg-slate-800/80 p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition"
          >
            Annuler
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleFinalSave('brouillon', false)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-100 transition"
            >
              Enregistrer Brouillon
            </button>

            <button
              type="button"
              onClick={() => handleFinalSave('envoye', false)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-900 transition shadow-xs"
            >
              Enregistrer le Devis
            </button>

            <button
              type="button"
              onClick={() => handleFinalSave('accepte', true)}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition shadow-md flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Valider et Envoyer en Caisse
            </button>
          </div>
        </div>

      </div>

      {/* ── SOUS-MODALE : CRÉATION RAPIDE D'UN CLIENT ── */}
      {showQuickNewClientModal && (
        <ModalPortal isOpen={showQuickNewClientModal} onClose={() => setShowQuickNewClientModal(false)} id="modal-quick-client" zIndex={70}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">+ Nouveau Client Imprimerie</h4>
              <button onClick={() => setShowQuickNewClientModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nom / Société *</label>
                <input
                  type="text"
                  required
                  value={newClientForm.name}
                  onChange={(e) => setNewClientForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nom ou Raison Sociale"
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Téléphone</label>
                <input
                  type="text"
                  value={newClientForm.phone}
                  onChange={(e) => setNewClientForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+229 ..."
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Adresse / Ville</label>
                <input
                  type="text"
                  value={newClientForm.address}
                  onChange={(e) => setNewClientForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Cotonou..."
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">N° IFU (Optionnel)</label>
                <input
                  type="text"
                  value={newClientForm.ifu}
                  onChange={(e) => setNewClientForm((p) => ({ ...p, ifu: e.target.value }))}
                  placeholder="020..."
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuickNewClientModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSavingClient}
                onClick={handleSaveQuickClient}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                {isSavingClient ? 'Enregistrement...' : 'Créer et Sélectionner'}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── SOUS-MODALE : CRÉATION RAPIDE D'UNE DÉSIGNATION CATALOGUE ── */}
      {showQuickNewPrestation && (
        <ModalPortal isOpen={showQuickNewPrestation} onClose={() => setShowQuickNewPrestation(false)} id="modal-quick-prestation" zIndex={70}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">+ Ajouter une Prestation au Catalogue</h4>
              <button onClick={() => setShowQuickNewPrestation(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Intitulé de la Prestation *</label>
                <input
                  type="text"
                  required
                  value={newPresNom}
                  onChange={(e) => setNewPresNom(e.target.value)}
                  placeholder="Ex: Roll-up 85x200cm Luxe"
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Catégorie</label>
                  <select
                    value={newPresCat}
                    onChange={(e) => setNewPresCat(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl"
                  >
                    <option value="Grand Format">Grand Format</option>
                    <option value="Impression Numérique">Impression Numérique</option>
                    <option value="Sérigraphie">Sérigraphie</option>
                    <option value="Offset & Packaging">Offset & Packaging</option>
                    <option value="Enseignes & Signalétique">Enseignes</option>
                    <option value="Conception PAO">Conception PAO</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Mode de calcul</label>
                  <select
                    value={newPresMode}
                    onChange={(e) => setNewPresMode(e.target.value as ModeCalcul)}
                    className="w-full px-3 py-2 border rounded-xl"
                  >
                    <option value="m2">Au m²</option>
                    <option value="unite">À l'unité</option>
                    <option value="forfait">Forfait</option>
                    <option value="heure">À l'heure</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  {newPresMode === 'm2' ? 'Prix de vente au m² (FCFA)' : 'Prix unitaire (FCFA)'} *
                </label>
                <input
                  type="number"
                  required
                  value={newPresPrix}
                  onChange={(e) => setNewPresPrix(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuickNewPrestation(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSavingPres}
                onClick={handleSaveQuickPrestation}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-pink-600 text-white hover:bg-pink-700 shadow-sm"
              >
                {isSavingPres ? 'Enregistrement...' : 'Ajouter au catalogue'}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

    </ModalPortal>
  )
}
export default NouveauDevisImprimerieModal
