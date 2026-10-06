import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import clsx from 'clsx'
import {
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  ArrowRight,
  FileText,
  Printer,
  X,
  Clock,
  TrendingUp,
  Percent,
  ChevronRight,
  ShieldAlert,
  ChevronDown,
  PhoneCall,
  UserCheck,
  ShieldCheck,
  Award
} from 'lucide-react'

interface Garantie {
  id: string
  credit_id: string
  type_garantie: string
  description?: string
  valeur_estimee: number
  valeur_retenue: number
  statut: string
}

interface Garant {
  id: string
  credit_id: string
  nom_complet: string
  telephone: string
  montant_engagement: number
  statut: string
}

interface Relance {
  id: string
  credit_id: string
  date_relance: string
  type_relance: string
  agent_nom: string
  interlocuteur?: string
  resultat?: string
  promesse_paiement_date?: string
  promesse_montant?: number
  observation?: string
  statut: string
}

interface Credit {
  id: string
  company_id: string
  sector_slug: string
  reference: string
  membre_id: string
  membre_nom: string
  membre_tel?: string
  activite_financee?: string
  objet_credit: string
  montant_demande: number
  montant_accorde: number
  duree_mois: number
  periodicite: 'MENSUELLE' | 'HEBDOMADAIRE' | 'JOURNALIERE' | 'QUINDENAIRE'
  taux_interet: number
  montant_interet: number
  frais_dossier: number
  montant_total_du: number
  montant_rembourse: number
  solde_restant: number
  garanties?: string
  caution_nom?: string
  caution_tel?: string
  statut: 'DEMANDE' | 'ANALYSE' | 'VALIDE' | 'APPROUVE' | 'DECAISSE' | 'EN_COURS' | 'SOLDE' | 'EN_RETARD' | 'CONTENTIEUX' | 'REJETE'
  date_demande: string
  date_approbation?: string
  date_decaissement?: string
  date_echeance_finale?: string
  agent_credit_nom?: string
  valide_par?: string
  created_at: string
}

interface Echeance {
  id: string
  credit_id: string
  credit_ref: string
  membre_id?: string
  membre_nom: string
  numero_echeance: number
  date_echeance: string
  part_principal: number
  part_interet: number
  part_frais: number
  montant_total: number
  montant_paye: number
  solde_echeance: number
  date_paiement?: string
  jours_retard: number
  statut: 'A_VENIR' | 'ECHUE' | 'PARTIELLEMENT_PAYEE' | 'PAYEE' | 'EN_RETARD' | 'IMPAYEE'
}

interface Remboursement {
  id: string
  reference: string
  credit_id: string
  credit_ref: string
  echeance_id?: string
  membre_nom: string
  montant_verse: number
  ventilation_principal: number
  ventilation_interet: number
  ventilation_penalite: number
  ventilation_frais: number
  mode_paiement: string
  recu_par: string
  date_remboursement: string
}

export const CreditsEcheanciersPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [credits, setCredits] = useState<Credit[]>([])
  const [membres, setMembres] = useState<any[]>([])
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null)
  const [echeances, setEcheances] = useState<Echeance[]>([])
  const [remboursements, setRemboursements] = useState<Remboursement[]>([])

  // Filtres
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('ALL')

  // Modals & Navigation
  const [showAddCreditModal, setShowAddCreditModal] = useState(false)
  const [showRemboursementModal, setShowRemboursementModal] = useState(false)
  const [showAddRelanceModal, setShowAddRelanceModal] = useState(false)
  const [selectedEcheance, setSelectedEcheance] = useState<Echeance | null>(null)
  const [lastRemboursementTicket, setLastRemboursementTicket] = useState<any | null>(null)
  const [activeCreditTab, setActiveCreditTab] = useState<'ECHEANCIER' | 'REGLEMENTS' | 'GARANTIES' | 'RELANCES' | 'DECISION'>('ECHEANCIER')

  // Détails étendus du crédit sélectionné
  const [garanties, setGaranties] = useState<Garantie[]>([])
  const [garants, setGarants] = useState<Garant[]>([])
  const [relances, setRelances] = useState<Relance[]>([])

  // Formulaire Relance
  const [relanceForm, setRelanceForm] = useState({
    type_relance: 'APPEL',
    interlocuteur: '',
    resultat: 'PROMESSE_REGLEMENT',
    promesse_paiement_date: '',
    promesse_montant: '',
    observation: ''
  })

  // Formulaire Nouveau Crédit — SFD Conforme UEMOA & Loi 2025-14
  const [newCredit, setNewCredit] = useState({
    membre_id: '',
    objet_credit: '',
    activite_financee: '',
    montant_demande: '500000',
    montant_accorde: '500000',
    duree_mois: '12',
    periodicite: 'MENSUELLE' as 'MENSUELLE' | 'HEBDOMADAIRE' | 'JOURNALIERE' | 'QUINDENAIRE',
    type_remboursement: 'ECHEANCES_CONSTANTES',
    taux_interet: '12', // Taux annuel
    frais_dossier: '5000',
    assurance_pct: '1',
    // Analyse Capacité de Remboursement
    revenus_mensuels: '250000',
    charges_mensuelles: '80000',
    mensualites_existantes: '0',
    avis_analyste: 'FAVORABLE',
    // Garanties & Multi-Garants
    type_garantie: 'CAUTION_SOLIDAIRE',
    valeur_garantie_declaree: '700000',
    taux_retenue_pct: '70',
    description_garantie: '',
    garant1_nom: '',
    garant1_tel: '',
    garant1_engagement: '250000',
    garant2_nom: '',
    garant2_tel: '',
    garant2_engagement: '',
    garant3_nom: '',
    garant3_tel: '',
    garant3_engagement: '',
    agent_credit_nom: user?.full_name || user?.email || 'Agent Crédit'
  })

  // Formulaire Remboursement
  const [rembForm, setRembForm] = useState({
    montant_verse: '',
    mode_paiement: 'ESPECES',
    part_capital: '',
    part_interet: '',
    penalites: '0',
    observation: ''
  })

  // 1. Chargement des Crédits & Membres
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [creditsRes, membresRes] = await Promise.all([
        supabaseTenant('microfinance_credits')
          .select('*')
          .order('created_at', { ascending: false }),
        supabaseTenant('microfinance_membres')
          .select('id, numero_membre, nom_complet, telephone, solde_epargne_total, statut')
          .eq('statut', 'ACTIF')
          .order('nom_complet', { ascending: true })
      ])

      if (creditsRes.error) throw creditsRes.error
      if (membresRes.error) throw membresRes.error

      setCredits(creditsRes.data || [])
      setMembres(membresRes.data || [])

      // Si un crédit était déjà sélectionné, rafraîchir ses échéances
      if (selectedCredit) {
        const refreshedCredit = (creditsRes.data || []).find((c: Credit) => c.id === selectedCredit.id)
        if (refreshedCredit) {
          setSelectedCredit(refreshedCredit)
          loadCreditDetails(refreshedCredit.id)
        }
      }
    } catch (err: any) {
      console.error('Erreur chargement crédits:', err)
      toast.error('Erreur lors du chargement des dossiers de crédit')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast, selectedCredit])

  useEffect(() => {
    loadData()
  }, [companyId])

  // 2. Charger les détails complets (échéances, règlements, garanties, garants, relances)
  const loadCreditDetails = async (creditId: string) => {
    try {
      const [echRes, rembRes, garRes, gtRes, relRes] = await Promise.all([
        supabaseTenant('microfinance_credit_echeances')
          .select('*')
          .eq('credit_id', creditId)
          .order('numero_echeance', { ascending: true }),
        supabaseTenant('microfinance_credit_remboursements')
          .select('*')
          .eq('credit_id', creditId)
          .order('date_remboursement', { ascending: false }),
        supabaseTenant('microfinance_credit_garanties')
          .select('*')
          .eq('credit_id', creditId),
        supabaseTenant('microfinance_credit_garants')
          .select('*')
          .eq('credit_id', creditId),
        supabaseTenant('microfinance_credit_relances')
          .select('*')
          .eq('credit_id', creditId)
          .order('date_relance', { ascending: false })
      ])

      setEcheances(echRes.data || [])
      setRemboursements(rembRes.data || [])
      setGaranties(garRes.data || [])
      setGarants(gtRes.data || [])
      setRelances(relRes.data || [])
    } catch (err: any) {
      console.error('Erreur chargement détails crédit:', err)
    }
  }

  const handleSelectCredit = (credit: Credit) => {
    setSelectedCredit(credit)
    loadCreditDetails(credit.id)
  }

  // 3. Calculs Statistiques Portefeuille
  const stats = useMemo(() => {
    let encoursTotal = 0
    let rembourseTotal = 0
    let montantRetard = 0
    let nbRetards = 0
    let nbActifs = 0

    credits.forEach(c => {
      if (['DECAISSE', 'EN_COURS', 'EN_RETARD'].includes(c.statut)) {
        encoursTotal += Number(c.solde_restant || 0)
        rembourseTotal += Number(c.montant_rembourse || 0)
        nbActifs++
        if (c.statut === 'EN_RETARD') {
          montantRetard += Number(c.solde_restant || 0)
          nbRetards++
        }
      }
    })

    const parTaux = encoursTotal > 0 ? (montantRetard / encoursTotal) * 100 : 0

    return {
      encoursTotal,
      rembourseTotal,
      montantRetard,
      nbRetards,
      nbActifs,
      parTaux: parTaux.toFixed(2),
      totalDossiers: credits.length
    }
  }, [credits])

  // Filtrage
  const filteredCredits = useMemo(() => {
    return credits.filter(c => {
      const matchSearch =
        c.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.membre_nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.objet_credit && c.objet_credit.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchStatut = filterStatut === 'ALL' || c.statut === filterStatut
      return matchSearch && matchStatut
    })
  }, [credits, searchTerm, filterStatut])

  // Calcul Automatique du TEG & Alerte Seuil d'Usure UEMOA (27% paramétrable)
  const calcTeg = useMemo(() => {
    const montant = Number(newCredit.montant_accorde) || Number(newCredit.montant_demande) || 500000
    const duree = Number(newCredit.duree_mois) || 12
    const tauxNominal = Number(newCredit.taux_interet) || 12
    const frais = Number(newCredit.frais_dossier) || 0
    const assurance = Number(newCredit.assurance_pct) || 0
    // TEG = Taux nominal + (frais / montant) * (12 / duree) * 100 + assurance
    const teg = tauxNominal + ((frais / Math.max(1, montant)) * (12 / Math.max(1, duree)) * 100) + assurance
    const isUsure = teg > 27.0
    return { teg: Number(teg.toFixed(2)), isUsure }
  }, [newCredit.montant_accorde, newCredit.montant_demande, newCredit.duree_mois, newCredit.taux_interet, newCredit.frais_dossier, newCredit.assurance_pct])

  // Analyse Temps Réel de la Capacité de Remboursement
  const calcCapacite = useMemo(() => {
    const rev = Number(newCredit.revenus_mensuels) || 0
    const charges = Number(newCredit.charges_mensuelles) || 0
    const mensExist = Number(newCredit.mensualites_existantes) || 0
    const montant = Number(newCredit.montant_accorde) || 0
    const duree = Number(newCredit.duree_mois) || 12
    const taux = Number(newCredit.taux_interet) || 12
    const totalInteret = (montant * taux * duree) / 1200
    const totalDu = montant + totalInteret + (Number(newCredit.frais_dossier) || 0)
    const mensualiteNouv = duree > 0 ? totalDu / duree : 0

    const revDispo = rev - charges
    const ratioEndettement = rev > 0 ? ((mensualiteNouv + mensExist) / rev) * 100 : 0
    const capaciteMax = revDispo * 0.40 - mensExist

    return {
      mensualiteNouv: Math.round(mensualiteNouv),
      revDispo,
      ratioEndettement: Number(ratioEndettement.toFixed(1)),
      capaciteMax: Math.round(capaciteMax),
      isSurEndette: ratioEndettement > 40
    }
  }, [newCredit])

  // 4. Création d'un Nouveau Crédit avec Amortissement Automatique
  const handleCreateCredit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCredit.membre_id || !newCredit.montant_accorde || !newCredit.objet_credit) {
      toast.error('Veuillez renseigner les champs obligatoires')
      return
    }

    const membre = membres.find(m => m.id === newCredit.membre_id)
    if (!membre) {
      toast.error('Adhérent introuvable')
      return
    }

    const accorde = Number(newCredit.montant_accorde)
    const duree = Number(newCredit.duree_mois) || 12
    const taux = Number(newCredit.taux_interet) || 12
    const frais = Number(newCredit.frais_dossier) || 0

    // Calcul Intérêt simple dégressif / amortissement constant
    const totalInteret = accorde * (taux / 100) * (duree / 12)
    const totalDu = accorde + totalInteret + frais

    try {
      const ref = `CRD-${Date.now().toString().slice(-6)}`

      const { data: insertedCredit, error: creditErr } = await supabaseTenant('microfinance_credits')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          reference: ref,
          membre_id: membre.id,
          membre_nom: membre.nom_complet,
          membre_tel: membre.telephone,
          activite_financee: newCredit.activite_financee,
          objet_credit: newCredit.objet_credit,
          montant_demande: Number(newCredit.montant_demande) || accorde,
          montant_accorde: accorde,
          duree_mois: duree,
          periodicite: newCredit.periodicite,
          taux_interet: taux,
          montant_interet: totalInteret,
          frais_dossier: frais,
          montant_total_du: totalDu,
          montant_rembourse: 0,
          solde_restant: totalDu,
          garanties: `${newCredit.type_garantie} (Valeur: ${newCredit.valeur_garantie_declaree} F)`,
          caution_nom: newCredit.garant1_nom || 'Sans caution externe',
          caution_tel: newCredit.garant1_tel || '',
          statut: 'EN_COURS',
          date_demande: new Date().toISOString().slice(0, 10),
          date_approbation: new Date().toISOString().slice(0, 10),
          date_decaissement: new Date().toISOString().slice(0, 10),
          agent_credit_nom: newCredit.agent_credit_nom,
          valide_par: user?.full_name || user?.email || 'Comité de Crédit'
        })
        .select()
        .single()

      if (creditErr) throw creditErr

      // Insertion Garantie Réelle Structurée
      if (Number(newCredit.valeur_garantie_declaree) > 0) {
        const valRetenue = Math.round(Number(newCredit.valeur_garantie_declaree) * 0.7)
        await supabaseTenant('microfinance_credit_garanties').insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          credit_id: insertedCredit.id,
          type_garantie: newCredit.type_garantie,
          valeur_estimee: Number(newCredit.valeur_garantie_declaree),
          valeur_retenue: valRetenue,
          description: newCredit.description_garantie || `Garantie déclarée ${newCredit.type_garantie}`,
          statut: 'ACTIF'
        })
      }

      // Insertion Garants Multiples Solidaires
      const garantsToInsert = []
      if (newCredit.garant1_nom) {
        garantsToInsert.push({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          credit_id: insertedCredit.id,
          nom_complet: newCredit.garant1_nom,
          telephone: newCredit.garant1_tel,
          montant_engagement: Number(newCredit.garant1_engagement) || accorde,
          statut: 'ACTIF'
        })
      }
      if (newCredit.garant2_nom) {
        garantsToInsert.push({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          credit_id: insertedCredit.id,
          nom_complet: newCredit.garant2_nom,
          telephone: newCredit.garant2_tel,
          montant_engagement: Number(newCredit.garant2_engagement) || 0,
          statut: 'ACTIF'
        })
      }
      if (newCredit.garant3_nom) {
        garantsToInsert.push({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          credit_id: insertedCredit.id,
          nom_complet: newCredit.garant3_nom,
          telephone: newCredit.garant3_tel,
          montant_engagement: Number(newCredit.garant3_engagement) || 0,
          statut: 'ACTIF'
        })
      }
      if (garantsToInsert.length > 0) {
        await supabaseTenant('microfinance_credit_garants').insert(garantsToInsert)
      }

      // Génération de l'échéancier automatique
      const capitalParMois = accorde / duree
      const interetParMois = totalInteret / duree
      const fraisPremierMois = frais

      const echeancesToInsert = []
      const today = new Date()

      for (let i = 1; i <= duree; i++) {
        const dateEch = new Date(today.getFullYear(), today.getMonth() + i, today.getDate())
        const fraisEch = i === 1 ? fraisPremierMois : 0
        const totalEch = capitalParMois + interetParMois + fraisEch

        echeancesToInsert.push({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          credit_id: insertedCredit.id,
          credit_ref: ref,
          membre_id: membre.id,
          membre_nom: membre.nom_complet,
          numero_echeance: i,
          date_echeance: dateEch.toISOString().slice(0, 10),
          part_principal: capitalParMois,
          part_interet: interetParMois,
          part_frais: fraisEch,
          montant_total: totalEch,
          montant_paye: 0,
          solde_echeance: totalEch,
          jours_retard: 0,
          statut: 'A_VENIR'
        })
      }

      const { error: echErr } = await supabaseTenant('microfinance_credit_echeances').insert(echeancesToInsert)
      if (echErr) {
        console.warn('Erreur insertion échéancier auto:', echErr)
      }

      // Mise à jour encours du membre
      await supabaseTenant('microfinance_membres')
        .update({
          encours_credit_total: (Number(membre.encours_credit_total) || 0) + totalDu
        })
        .eq('id', membre.id)

      toast.success('Dossier de crédit octroyé et échéancier généré !')
      setShowAddCreditModal(false)
      setNewCredit({
        membre_id: '',
        objet_credit: '',
        activite_financee: '',
        montant_demande: '',
        montant_accorde: '',
        duree_mois: '12',
        periodicite: 'MENSUELLE',
        type_remboursement: 'ECHEANCES_CONSTANTES',
        taux_interet: '12',
        frais_dossier: '0',
        assurance_pct: '1',
        revenus_mensuels: '250000',
        charges_mensuelles: '80000',
        mensualites_existantes: '0',
        avis_analyste: 'FAVORABLE',
        type_garantie: 'CAUTION_SOLIDAIRE',
        valeur_garantie_declaree: '700000',
        taux_retenue_pct: '70',
        description_garantie: '',
        garant1_nom: '',
        garant1_tel: '',
        garant1_engagement: '250000',
        garant2_nom: '',
        garant2_tel: '',
        garant2_engagement: '',
        garant3_nom: '',
        garant3_tel: '',
        garant3_engagement: '',
        agent_credit_nom: user?.full_name || user?.email || 'Agent Crédit'
      })
      await loadData()
      handleSelectCredit(insertedCredit)
    } catch (err: any) {
      console.error('Erreur création crédit:', err)
      toast.error('Erreur lors de la création du crédit')
    }
  }

  // 4b. Workflow Comité & Statuts Crédit
  const handleUpdateCreditStatus = async (newStatut: string) => {
    if (!selectedCredit) return
    try {
      const updates: any = { statut: newStatut }
      if (newStatut === 'APPROUVE' || newStatut === 'VALIDE') {
        updates.date_approbation = new Date().toISOString().slice(0, 10)
        updates.valide_par = user?.full_name || user?.email || 'Comité de Crédit'
      }
      if (newStatut === 'DECAISSE') {
        updates.date_decaissement = new Date().toISOString().slice(0, 10)
      }

      const { error } = await supabaseTenant('microfinance_credits')
        .update(updates)
        .eq('id', selectedCredit.id)

      if (error) throw error

      toast.success(`Statut du crédit actualisé : ${newStatut}`)
      const updated = { ...selectedCredit, ...updates }
      setSelectedCredit(updated)
      await loadData()
    } catch (err: any) {
      console.error('Erreur mise à jour statut:', err)
      toast.error('Erreur lors du changement de statut')
    }
  }

  // 4c. Recouvrement / Enregistrement d'une Relance
  const handleSaveRelance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCredit) return
    try {
      const { error } = await supabaseTenant('microfinance_credit_relances').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        credit_id: selectedCredit.id,
        date_relance: new Date().toISOString(),
        type_relance: relanceForm.type_relance,
        agent_nom: user?.full_name || user?.email || 'Agent Recouvrement',
        interlocuteur: relanceForm.interlocuteur || selectedCredit.membre_nom,
        resultat: relanceForm.resultat,
        promesse_paiement_date: relanceForm.promesse_paiement_date || null,
        promesse_montant: Number(relanceForm.promesse_montant) || null,
        observation: relanceForm.observation,
        statut: 'EFFECTUEE'
      })

      if (error) throw error

      toast.success('Action de relance / recouvrement consignée !')
      setShowAddRelanceModal(false)
      setRelanceForm({
        type_relance: 'APPEL',
        interlocuteur: '',
        resultat: 'PROMESSE_REGLEMENT',
        promesse_paiement_date: '',
        promesse_montant: '',
        observation: ''
      })
      await loadCreditDetails(selectedCredit.id)
    } catch (err: any) {
      console.error('Erreur enregistrement relance:', err)
      toast.error("Erreur lors de l'enregistrement de la relance")
    }
  }

  // 5. Enregistrement d'un Remboursement
  const handleOpenRemboursement = (ech?: Echeance) => {
    if (!selectedCredit) return
    setSelectedEcheance(ech || null)

    const suggestMontant = ech ? ech.solde_echeance : Math.min(selectedCredit.solde_restant, 50000)
    const partCap = ech ? ech.part_principal : suggestMontant * 0.8
    const partInt = ech ? ech.part_interet : suggestMontant * 0.2

    setRembForm({
      montant_verse: suggestMontant.toString(),
      mode_paiement: 'ESPECES',
      part_capital: Math.round(partCap).toString(),
      part_interet: Math.round(partInt).toString(),
      penalites: '0',
      observation: ech ? `Règlement échéance n°${ech.numero_echeance}` : 'Remboursement crédit'
    })
    setShowRemboursementModal(true)
  }

  const handleSaveRemboursement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCredit) return
    const verse = Number(rembForm.montant_verse)
    if (!verse || verse <= 0) {
      toast.error('Veuillez saisir un montant valide')
      return
    }

    const ref = `REM-${Date.now().toString().slice(-6)}`
    const partCapital = Number(rembForm.part_capital) || verse * 0.8
    const partInteret = Number(rembForm.part_interet) || verse * 0.2
    const penalites = Number(rembForm.penalites) || 0

    try {
      // 1. Insérer remboursement
      const { data: rembData, error: rembErr } = await supabaseTenant('microfinance_credit_remboursements')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          reference: ref,
          credit_id: selectedCredit.id,
          credit_ref: selectedCredit.reference,
          echeance_id: selectedEcheance ? selectedEcheance.id : null,
          membre_id: selectedCredit.membre_id,
          membre_nom: selectedCredit.membre_nom,
          montant_verse: verse,
          ventilation_principal: partCapital,
          ventilation_interet: partInteret,
          ventilation_penalite: penalites,
          ventilation_frais: 0,
          mode_paiement: rembForm.mode_paiement,
          recu_par: user?.full_name || user?.email || 'Caissier Guichet',
          date_remboursement: new Date().toISOString()
        })
        .select()
        .single()

      if (rembErr) throw rembErr

      // 2. Mettre à jour l'échéance si rattachée
      if (selectedEcheance) {
        const newPaye = (Number(selectedEcheance.montant_paye) || 0) + verse
        const newSolde = Math.max(0, Number(selectedEcheance.montant_total) - newPaye)
        const nouveauStatut = newSolde === 0 ? 'PAYEE' : 'PARTIELLEMENT_PAYEE'

        await supabaseTenant('microfinance_credit_echeances')
          .update({
            montant_paye: newPaye,
            solde_echeance: newSolde,
            date_paiement: new Date().toISOString().slice(0, 10),
            statut: nouveauStatut
          })
          .eq('id', selectedEcheance.id)
      }

      // 3. Mettre à jour le crédit
      const newTotalRembourse = (Number(selectedCredit.montant_rembourse) || 0) + verse
      const newSoldeCredit = Math.max(0, Number(selectedCredit.montant_total_du) - newTotalRembourse)
      const nouveauStatutCredit = newSoldeCredit === 0 ? 'SOLDE' : selectedCredit.statut

      await supabaseTenant('microfinance_credits')
        .update({
          montant_rembourse: newTotalRembourse,
          solde_restant: newSoldeCredit,
          statut: nouveauStatutCredit
        })
        .eq('id', selectedCredit.id)

      // 4. Mettre à jour encours du membre
      const { data: membreData } = await supabaseTenant('microfinance_membres')
        .select('encours_credit_total')
        .eq('id', selectedCredit.membre_id)
        .single()

      if (membreData) {
        const updatedEncours = Math.max(0, (Number(membreData.encours_credit_total) || 0) - verse)
        await supabaseTenant('microfinance_membres')
          .update({ encours_credit_total: updatedEncours })
          .eq('id', selectedCredit.membre_id)
      }

      toast.success('Remboursement enregistré avec succès !')
      setLastRemboursementTicket({
        ...rembData,
        solde_restant: newSoldeCredit,
        membre_nom: selectedCredit.membre_nom,
        credit_ref: selectedCredit.reference
      })
      setShowRemboursementModal(false)

      await loadData()
      await loadCreditDetails(selectedCredit.id)
    } catch (err: any) {
      console.error('Erreur remboursement:', err)
      toast.error('Erreur lors du remboursement')
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">
      {/* 1. EN-TÊTE PROFESSIONNEL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Portefeuille Crédits & Échéanciers
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Octroi, amortissements, recouvrement & surveillance du risque (PAR 30/90 UEMOA)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <button
            onClick={() => setShowAddCreditModal(true)}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Dossier Prêt</span>
          </button>
        </div>
      </div>

      {/* 2. STATS PORTEFEUILLE UEMOA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Encours Brut Sain</span>
            <DollarSign className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.encoursTotal.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-slate-400">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {stats.nbActifs} prêts en cours d'amortissement
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Recouvré</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {stats.rembourseTotal.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-emerald-400">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Cumul des échéances encaissées
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Créances en Souffrance</span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">
            {stats.montantRetard.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-amber-400">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {stats.nbRetards} dossiers avec retard de paiement
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Ratio PAR (Portefeuille Risque)</span>
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${Number(stats.parTaux) > 5 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {stats.parTaux} %
            </span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              Norme &le; 5%
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Indicateur prudentiel loi 2025-14
          </p>
        </div>
      </div>

      {/* 3. VUE PRINCIPALE : DOSSIERS À GAUCHE / DÉTAIL & ÉCHÉANCIER À DROITE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLONNE GAUCHE : LISTE DES CRÉDITS (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-slate-900">Dossiers de Prêt</span>
              <span className="text-xs font-bold text-slate-400">{filteredCredits.length} résultat(s)</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Réf, Adhérent, Projet..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <select
                value={filterStatut}
                onChange={e => setFilterStatut(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tous statuts</option>
                <option value="EN_COURS">En cours</option>
                <option value="EN_RETARD">En retard</option>
                <option value="SOLDE">Soldé</option>
                <option value="DEMANDE">Demande</option>
              </select>
            </div>
          </div>

          {/* Liste Scrollable */}
          <div className="space-y-2.5 max-h-[650px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">Chargement des crédits...</p>
              </div>
            ) : filteredCredits.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-6">
                <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Aucun crédit trouvé</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Aucun dossier de prêt ne correspond à vos critères.
                </p>
                <button
                  onClick={() => setShowAddCreditModal(true)}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-all"
                >
                  + Nouveau Dossier Prêt
                </button>
              </div>
            ) : (
              filteredCredits.map(c => {
                const isSelected = selectedCredit?.id === c.id
                const pctRemb = c.montant_total_du > 0 ? (c.montant_rembourse / c.montant_total_du) * 100 : 0

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCredit(c)}
                    className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-indigo-600 font-mono">{c.reference}</span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              c.statut === 'EN_COURS'
                                ? 'bg-indigo-100 text-indigo-700'
                                : c.statut === 'SOLDE'
                                ? 'bg-emerald-100 text-emerald-700'
                                : c.statut === 'EN_RETARD'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.statut}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 mt-1">{c.membre_nom}</h4>
                        <p className="text-[11px] font-medium text-slate-500 line-clamp-1">{c.objet_credit}</p>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-black text-slate-900">
                          {c.montant_accorde.toLocaleString('fr-FR')} <span className="text-[10px]">F</span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400">{c.duree_mois} mois</span>
                      </div>
                    </div>

                    {/* Barre de progression remboursement */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                        <span>Solde dû: {c.solde_restant.toLocaleString('fr-FR')} F</span>
                        <span>{pctRemb.toFixed(0)}% remboursé</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            c.statut === 'SOLDE'
                              ? 'bg-emerald-500'
                              : c.statut === 'EN_RETARD'
                              ? 'bg-rose-500'
                              : 'bg-indigo-600'
                          }`}
                          style={{ width: `${Math.min(100, pctRemb)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* COLONNE DROITE : DÉTAIL DU DOSSIER & AMORTISSEMENT (7 cols) */}
        <div className="lg:col-span-7">
          {selectedCredit ? (
            <div className="space-y-4">
              {/* Carte Récapitulative du Dossier Sélectionné */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">RÉFÉRENCE</span>
                      <span className="text-base font-black text-indigo-700 font-mono">{selectedCredit.reference}</span>
                      <span
                        className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full ${
                          selectedCredit.statut === 'SOLDE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : selectedCredit.statut === 'EN_RETARD'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}
                      >
                        {selectedCredit.statut}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mt-1">{selectedCredit.membre_nom}</h3>
                    <p className="text-xs text-slate-500">
                      Tél: {selectedCredit.membre_tel || 'Non renseigné'} • Objet: {selectedCredit.objet_credit}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenRemboursement()}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-200 flex items-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Encaisser Remboursement</span>
                    </button>
                  </div>
                </div>

                {/* Métriques Financières du Prêt */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Capital Accordé</span>
                    <div className="text-sm font-black text-slate-900">
                      {selectedCredit.montant_accorde.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Taux / Durée</span>
                    <div className="text-sm font-black text-slate-900">
                      {selectedCredit.taux_interet}% • {selectedCredit.duree_mois} mois
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Total Dû (TTC)</span>
                    <div className="text-sm font-black text-slate-900">
                      {selectedCredit.montant_total_du.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Solde Restant</span>
                    <div className="text-sm font-black text-rose-600">
                      {selectedCredit.solde_restant.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                </div>

                {/* Garanties & Cautions */}
                {(selectedCredit.garanties || selectedCredit.caution_nom) && (
                  <div className="text-xs bg-amber-50/50 border border-amber-200 p-3 rounded-2xl text-amber-900">
                    <span className="font-bold">Garanties & Cautions : </span>
                    {selectedCredit.garanties && <span>{selectedCredit.garanties} </span>}
                    {selectedCredit.caution_nom && (
                      <span>
                        (Caution: {selectedCredit.caution_nom} {selectedCredit.caution_tel && `- ${selectedCredit.caution_tel}`})
                      </span>
                    )}
                  </div>
                )}
              </div>

                {/* Barre d'onglets du dossier sélectionné */}
                <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto text-xs font-bold">
                  <button
                    onClick={() => setActiveCreditTab('ECHEANCIER')}
                    className={clsx(
                      'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                      activeCreditTab === 'ECHEANCIER'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Échéancier ({echeances.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveCreditTab('REGLEMENTS')}
                    className={clsx(
                      'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                      activeCreditTab === 'REGLEMENTS'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Règlements ({remboursements.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveCreditTab('GARANTIES')}
                    className={clsx(
                      'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                      activeCreditTab === 'GARANTIES'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Garanties & Garants ({garanties.length + garants.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveCreditTab('RELANCES')}
                    className={clsx(
                      'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                      activeCreditTab === 'RELANCES'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Recouvrement & Relances ({relances.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveCreditTab('DECISION')}
                    className={clsx(
                      'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                      activeCreditTab === 'DECISION'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Workflow & Décisions</span>
                  </button>
                </div>

                {/* ONGLET 1 : ÉCHÉANCIER */}
                {activeCreditTab === 'ECHEANCIER' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Échéancier d'Amortissement ({echeances.length} mensualités)
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">
                        Cliquez sur une mensualité pour encaisser
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="py-3 px-3 text-center">N°</th>
                            <th className="py-3 px-3">Date Échéance</th>
                            <th className="py-3 px-3 text-right">Principal</th>
                            <th className="py-3 px-3 text-right">Intérêt</th>
                            <th className="py-3 px-3 text-right">Total Éch.</th>
                            <th className="py-3 px-3 text-right">Payé</th>
                            <th className="py-3 px-3 text-center">Statut</th>
                            <th className="py-3 px-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {echeances.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-slate-400">
                                Aucune échéance enregistrée pour ce crédit.
                              </td>
                            </tr>
                          ) : (
                            echeances.map(ech => (
                              <tr key={ech.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3 text-center font-bold text-slate-700">{ech.numero_echeance}</td>
                                <td className="py-2.5 px-3 font-semibold text-slate-800">
                                  {new Date(ech.date_echeance).toLocaleDateString('fr-FR')}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-600">
                                  {ech.part_principal.toLocaleString('fr-FR')} F
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-500">
                                  {ech.part_interet.toLocaleString('fr-FR')} F
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-slate-900">
                                  {ech.montant_total.toLocaleString('fr-FR')} F
                                </td>
                                <td className="py-2.5 px-3 text-right text-emerald-600 font-bold">
                                  {ech.montant_paye.toLocaleString('fr-FR')} F
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span
                                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                      ech.statut === 'PAYEE'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : ech.statut === 'PARTIELLEMENT_PAYEE'
                                        ? 'bg-amber-100 text-amber-700'
                                        : ech.statut === 'EN_RETARD' || ech.statut === 'IMPAYEE'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {ech.statut}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {ech.solde_echeance > 0 ? (
                                    <button
                                      onClick={() => handleOpenRemboursement(ech)}
                                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded-lg transition-all"
                                    >
                                      Payer
                                    </button>
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ONGLET 2 : HISTORIQUE RÈGLEMENTS */}
                {activeCreditTab === 'REGLEMENTS' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Historique des Règlements Encaissés ({remboursements.length})
                    </h4>

                    {remboursements.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3">Aucun versement enregistré sur ce crédit.</p>
                    ) : (
                      <div className="space-y-2">
                        {remboursements.map(r => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                                ✓
                              </div>
                              <div>
                                <span className="font-mono font-bold text-indigo-600">{r.reference}</span>
                                <p className="text-[11px] text-slate-500">
                                  {new Date(r.date_remboursement).toLocaleDateString('fr-FR')} • {r.mode_paiement} • Reçu par: {r.recu_par}
                                </p>
                              </div>
                            </div>

                            <div className="text-right flex items-center gap-3">
                              <div>
                                <span className="font-black text-emerald-700">
                                  +{r.montant_verse.toLocaleString('fr-FR')} FCFA
                                </span>
                                <p className="text-[10px] text-slate-400">
                                  Cap: {r.ventilation_principal.toLocaleString('fr-FR')} | Int: {r.ventilation_interet.toLocaleString('fr-FR')}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  setLastRemboursementTicket({
                                    ...r,
                                    solde_restant: selectedCredit.solde_restant,
                                    membre_nom: selectedCredit.membre_nom,
                                    credit_ref: selectedCredit.reference
                                  })
                                }}
                                className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600"
                                title="Réimprimer Reçu"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ONGLET 3 : GARANTIES & GARANTS */}
                {activeCreditTab === 'GARANTIES' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Sûretés & Garanties Réelles
                      </h4>
                      {garanties.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-2xl">
                          Aucune garantie matérielle enregistrée séparément. Mention contrat : {selectedCredit.garanties || 'Néant'}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {garanties.map(g => (
                            <div key={g.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold text-slate-800">{g.type_garantie}</span>
                                <p className="text-[11px] text-slate-500">{g.description || 'Sans description'}</p>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-slate-700">Déclarée : {Number(g.valeur_estimee).toLocaleString('fr-FR')} F</span>
                                <p className="font-black text-emerald-700 text-[11px]">Retenue (70%) : {Number(g.valeur_retenue).toLocaleString('fr-FR')} F</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-indigo-600" />
                        Cautions Solidaires (Multi-Garants)
                      </h4>
                      {garants.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-2xl">
                          Caution mentionnée : {selectedCredit.caution_nom || 'Aucune caution'}{' '}
                          {selectedCredit.caution_tel && `(${selectedCredit.caution_tel})`}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {garants.map(gt => (
                            <div key={gt.id} className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-xs">
                              <span className="font-black text-slate-900">{gt.nom_complet}</span>
                              <p className="text-[11px] text-slate-600">Tél : {gt.telephone}</p>
                              <p className="text-[11px] font-bold text-indigo-700 mt-1">
                                Engagement : {Number(gt.montant_engagement).toLocaleString('fr-FR')} FCFA
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ONGLET 4 : RECOUVREMENT & RELANCES */}
                {activeCreditTab === 'RELANCES' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <PhoneCall className="w-4 h-4 text-indigo-600" />
                        Piste d'Audit Recouvrement ({relances.length} actions)
                      </h4>
                      <button
                        onClick={() => setShowAddRelanceModal(true)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nouvelle Relance</span>
                      </button>
                    </div>

                    {relances.length === 0 ? (
                      <div className="text-center py-6 bg-slate-50 rounded-2xl text-slate-400 text-xs">
                        Aucune relance consignée pour ce prêt.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {relances.map(rel => (
                          <div key={rel.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-black text-indigo-700">
                                {rel.type_relance} • {rel.resultat}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(rel.date_relance).toLocaleString('fr-FR')}
                              </span>
                            </div>
                            <p className="text-slate-600">
                              Interlocuteur : <strong>{rel.interlocuteur || 'Adhérent'}</strong> • Agent : {rel.agent_nom}
                            </p>
                            {rel.observation && <p className="text-slate-500 italic">« {rel.observation} »</p>}
                            {rel.promesse_paiement_date && (
                              <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                Promesse : {new Date(rel.promesse_paiement_date).toLocaleDateString('fr-FR')}{' '}
                                {rel.promesse_montant ? `(${Number(rel.promesse_montant).toLocaleString('fr-FR')} F)` : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ONGLET 5 : WORKFLOW & DÉCISIONS COMITÉ */}
                {activeCreditTab === 'DECISION' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Award className="w-4 h-4 text-indigo-600" />
                      Cycle de Vie & Workflow 7 Étapes
                    </h4>

                    {/* Étapes Visuelles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      {[
                        { key: 'DEMANDE', label: '1. Demande', active: selectedCredit.statut === 'DEMANDE' },
                        { key: 'ANALYSE', label: '2. Analyse', active: selectedCredit.statut === 'ANALYSE' },
                        { key: 'APPROUVE', label: '3. Comité / Approbation', active: ['APPROUVE', 'VALIDE'].includes(selectedCredit.statut) },
                        { key: 'DECAISSE', label: '4. Décaissement', active: ['DECAISSE', 'EN_COURS', 'SOLDE'].includes(selectedCredit.statut) }
                      ].map((step, idx) => (
                        <div
                          key={step.key}
                          className={clsx(
                            'p-3 rounded-2xl border text-xs font-bold transition-all',
                            step.active
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          )}
                        >
                          {step.label}
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                      <span className="text-xs font-bold text-slate-700 block">
                        Actions Opérationnelles (Droits Analyste & Comité) :
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedCredit.statut === 'DEMANDE' && (
                          <button
                            onClick={() => handleUpdateCreditStatus('ANALYSE')}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition"
                          >
                            Passer en Analyse Risque
                          </button>
                        )}

                        {['DEMANDE', 'ANALYSE'].includes(selectedCredit.statut) && (
                          <>
                            <button
                              onClick={() => handleUpdateCreditStatus('APPROUVE')}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition"
                            >
                              Approuver par Comité de Prêt
                            </button>
                            <button
                              onClick={() => handleUpdateCreditStatus('REJETE')}
                              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition"
                            >
                              Rejeter le Dossier
                            </button>
                          </>
                        )}

                        {['APPROUVE', 'VALIDE'].includes(selectedCredit.statut) && (
                          <button
                            onClick={() => handleUpdateCreditStatus('DECAISSE')}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition"
                          >
                            Confirmer Décaissement Caisse
                          </button>
                        )}

                        {['DECAISSE', 'EN_COURS'].includes(selectedCredit.statut) && (
                          <>
                            <button
                              onClick={() => handleUpdateCreditStatus('EN_RETARD')}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition"
                            >
                              Reclasser en Souffrance / Retard
                            </button>
                            <button
                              onClick={() => handleUpdateCreditStatus('CONTENTIEUX')}
                              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs transition"
                            >
                              Transférer au Contentieux Judiciaire
                            </button>
                          </>
                        )}

                        {selectedCredit.statut === 'EN_RETARD' && (
                          <button
                            onClick={() => handleUpdateCreditStatus('CONTENTIEUX')}
                            className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs transition"
                          >
                            Transférer au Contentieux
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
              <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-800">Sélectionnez un dossier de crédit</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Choisissez un prêt dans la colonne de gauche pour consulter son échéancier d'amortissement, encaisser un remboursement ou imprimer son reçu.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. MODAL NOUVEAU DOSSIER DE CRÉDIT */}
      {showAddCreditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scaleUp">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-base font-black text-slate-900">Nouvelle Demande de Crédit SFD</h3>
                  <p className="text-[11px] text-slate-500">Conforme Loi 2025-14 & Plafond d'usure UEMOA (27%)</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddCreditModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCredit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* ALERTE TEG EN TEMPS RÉEL & SEUIL D'USURE */}
              <div className={clsx(
                'p-4 rounded-2xl border text-xs flex items-start gap-3 transition-all',
                calcTeg.isUsure
                  ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-sm'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm'
              )}>
                {calcTeg.isUsure ? (
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm uppercase tracking-wider">
                      TEG Calculé Automatiquement : {calcTeg.teg} %
                    </span>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-black',
                      calcTeg.isUsure ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                    )}>
                      {calcTeg.isUsure ? 'SEUIL USURE DÉPASSÉ' : 'CONFORME UEMOA'}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1">
                    {calcTeg.isUsure
                      ? `⚠️ Attention : Le TEG calculé (${calcTeg.teg}%) dépasse le seuil réglementaire d'usure fixé à 27 % par la réglementation UEMOA et la loi béninoise n°2025-14. Vous devez réduire le taux d'intérêt nominal ou les frais de dossier.`
                      : `Le Taux Effectif Global (${calcTeg.teg}%) respecte le seuil maximal d'usure de 27% (taux d'intérêt, frais de dossier et assurance inclus).`}
                  </p>
                </div>
              </div>

              {/* SECTION 1 : ADHÉRENT ET PROJET */}
              <div className="space-y-3">
                <h4 className="font-black uppercase text-slate-400 text-[10px] tracking-wider">1. Identification du Membre & Objet</h4>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Adhérent Emprunteur <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={newCredit.membre_id}
                    onChange={e => setNewCredit({ ...newCredit, membre_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="">Sélectionner un membre...</option>
                    {membres.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nom_complet} ({m.numero_membre}) - Solde Épargne: {Number(m.solde_epargne_total).toLocaleString('fr-FR')} F
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Objet du Prêt <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Fond de roulement commerce, Stock vivrier..."
                      value={newCredit.objet_credit}
                      onChange={e => setNewCredit({ ...newCredit, objet_credit: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Secteur / Activité Financée</label>
                    <input
                      type="text"
                      placeholder="Ex: Commerce général, Maraîchage..."
                      value={newCredit.activite_financee}
                      onChange={e => setNewCredit({ ...newCredit, activite_financee: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2 : CONDITIONS FINANCIÈRES & TAUX */}
              <div className="space-y-3 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100">
                <h4 className="font-black uppercase text-indigo-900 text-[10px] tracking-wider">2. Paramètres Financiers & Modalités</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">
                      Montant Demandé (FCFA)
                    </label>
                    <input
                      type="number"
                      min="10000"
                      value={newCredit.montant_demande}
                      onChange={e => setNewCredit({ ...newCredit, montant_demande: e.target.value, montant_accorde: e.target.value })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">
                      Montant Accordé (FCFA) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="10000"
                      value={newCredit.montant_accorde}
                      onChange={e => setNewCredit({ ...newCredit, montant_accorde: e.target.value })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">Durée (Mois)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="60"
                      value={newCredit.duree_mois}
                      onChange={e => setNewCredit({ ...newCredit, duree_mois: e.target.value })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">Taux Annuel Nominal (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCredit.taux_interet}
                      onChange={e => setNewCredit({ ...newCredit, taux_interet: e.target.value })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">Frais Dossier (FCFA)</label>
                    <input
                      type="number"
                      value={newCredit.frais_dossier}
                      onChange={e => setNewCredit({ ...newCredit, frais_dossier: e.target.value })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">Assurance (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCredit.assurance_pct}
                      onChange={e => setNewCredit({ ...newCredit, assurance_pct: e.target.value })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1">Périodicité</label>
                    <select
                      value={newCredit.periodicite}
                      onChange={e => setNewCredit({ ...newCredit, periodicite: e.target.value as any })}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                    >
                      <option value="MENSUELLE">Mensuelle</option>
                      <option value="HEBDOMADAIRE">Hebdomadaire</option>
                      <option value="QUINDENAIRE">Quinzaine</option>
                      <option value="JOURNALIERE">Journalière</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 3 : ANALYSE DE LA CAPACITÉ DE REMBOURSEMENT */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-black uppercase text-slate-600 text-[10px] tracking-wider">3. Analyse de la Capacité de Remboursement</h4>
                  <span className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-black',
                    calcCapacite.isSurEndette ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  )}>
                    Endettement : {calcCapacite.ratioEndettement} % {calcCapacite.isSurEndette ? '(Élevé > 40%)' : '(Admissible < 40%)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Revenus Mensuels (FCFA)</label>
                    <input
                      type="number"
                      value={newCredit.revenus_mensuels}
                      onChange={e => setNewCredit({ ...newCredit, revenus_mensuels: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Charges Mensuelles (FCFA)</label>
                    <input
                      type="number"
                      value={newCredit.charges_mensuelles}
                      onChange={e => setNewCredit({ ...newCredit, charges_mensuelles: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mensualités Existantes (FCFA)</label>
                    <input
                      type="number"
                      value={newCredit.mensualites_existantes}
                      onChange={e => setNewCredit({ ...newCredit, mensualites_existantes: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-[11px] border-t border-slate-200">
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Revenu Disponible Net</span>
                    <span className="font-mono font-black text-slate-900">{calcCapacite.revDispo.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Nouvelle Mensualité Estimée</span>
                    <span className="font-mono font-black text-indigo-700">{calcCapacite.mensualiteNouv.toLocaleString('fr-FR')} FCFA / mois</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Capacité Max Résiduelle (40%)</span>
                    <span className="font-mono font-black text-emerald-700">{calcCapacite.capaciteMax.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
              </div>

              {/* SECTION 4 : GARANTIES & CAUTION SOLIDAIRE MULTI-GARANTS */}
              <div className="space-y-3 bg-amber-50/40 p-4 rounded-2xl border border-amber-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-black uppercase text-amber-900 text-[10px] tracking-wider">4. Garanties & Caution Solidaire Multi-Garants</h4>
                  <span className="text-[10px] font-bold text-amber-800">
                    Règle SFD : Valeur retenue suggérée = 70% valeur déclarée
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Type de Sûreté</label>
                    <select
                      value={newCredit.type_garantie}
                      onChange={e => setNewCredit({ ...newCredit, type_garantie: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                    >
                      <option value="CAUTION_SOLIDAIRE">Caution Solidaire Multi-Garants</option>
                      <option value="EPARGNE_BLOQUEE">Épargne Bloquée Nantie</option>
                      <option value="GARANTIE_MATERIELLE">Garantie Matérielle (Véhicule, Stock)</option>
                      <option value="GARANTIE_IMMOBILIERE">Garantie Immobilière / Titre</option>
                      <option value="DEPOT_GARANTIE">Dépôt de Garantie Espèces</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Valeur Déclarée (FCFA)</label>
                    <input
                      type="number"
                      value={newCredit.valeur_garantie_declaree}
                      onChange={e => setNewCredit({ ...newCredit, valeur_garantie_declaree: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Valeur Retenue Suggérée (70%)</label>
                    <div className="w-full p-2 bg-amber-100/60 border border-amber-200 rounded-xl font-mono font-black text-amber-900">
                      {(Math.round((Number(newCredit.valeur_garantie_declaree) || 0) * 0.70)).toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                </div>

                {/* GARANTS MULTIPLES SOLIDAIRES (GARANT 1, 2, 3) */}
                <div className="space-y-2 pt-2 border-t border-amber-200/60">
                  <p className="text-[10px] font-black uppercase text-amber-900 tracking-wider">Garants Solidaires Rattachés (Multi-Garants) :</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-2.5 bg-white rounded-xl border border-amber-200 space-y-1.5">
                      <span className="font-bold text-[10px] text-amber-900 block">GARANT 1 (Principal) :</span>
                      <input
                        type="text"
                        placeholder="Nom complet"
                        value={newCredit.garant1_nom}
                        onChange={e => setNewCredit({ ...newCredit, garant1_nom: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Téléphone"
                        value={newCredit.garant1_tel}
                        onChange={e => setNewCredit({ ...newCredit, garant1_tel: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Engagement FCFA"
                        value={newCredit.garant1_engagement}
                        onChange={e => setNewCredit({ ...newCredit, garant1_engagement: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-amber-200 space-y-1.5">
                      <span className="font-bold text-[10px] text-amber-900 block">GARANT 2 (Optionnel) :</span>
                      <input
                        type="text"
                        placeholder="Nom complet"
                        value={newCredit.garant2_nom}
                        onChange={e => setNewCredit({ ...newCredit, garant2_nom: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Téléphone"
                        value={newCredit.garant2_tel}
                        onChange={e => setNewCredit({ ...newCredit, garant2_tel: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Engagement FCFA"
                        value={newCredit.garant2_engagement}
                        onChange={e => setNewCredit({ ...newCredit, garant2_engagement: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-amber-200 space-y-1.5">
                      <span className="font-bold text-[10px] text-amber-900 block">GARANT 3 (Optionnel) :</span>
                      <input
                        type="text"
                        placeholder="Nom complet"
                        value={newCredit.garant3_nom}
                        onChange={e => setNewCredit({ ...newCredit, garant3_nom: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Téléphone"
                        value={newCredit.garant3_tel}
                        onChange={e => setNewCredit({ ...newCredit, garant3_tel: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Engagement FCFA"
                        value={newCredit.garant3_engagement}
                        onChange={e => setNewCredit({ ...newCredit, garant3_engagement: e.target.value })}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SYNTHÈSE TOTALE */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-slate-400 font-semibold text-xs">Total à rembourser (Principal + Intérêts + Frais) :</span>
                  <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                    {(
                      (Number(newCredit.montant_accorde) || 0) +
                      ((Number(newCredit.montant_accorde) || 0) * (Number(newCredit.taux_interet) || 12) * (Number(newCredit.duree_mois) || 12)) / 1200 +
                      (Number(newCredit.frais_dossier) || 0)
                    ).toLocaleString('fr-FR')}{' '}
                    FCFA
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Échéance mensuelle indicative :</span>
                  <p className="font-mono font-black text-white text-base">
                    {calcCapacite.mensualiteNouv.toLocaleString('fr-FR')} FCFA / mois
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCreditModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={clsx(
                    'px-6 py-2.5 rounded-xl font-black text-white shadow-lg transition-all',
                    calcTeg.isUsure
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                  )}
                >
                  {calcTeg.isUsure ? 'Confirmer malgré TEG Usuraire' : 'Valider la Demande & Générer Échéancier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL ENCAISSEMENT REMBOURSEMENT */}
      {showRemboursementModal && selectedCredit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Encaisser un Remboursement</h3>
                <p className="text-xs text-slate-500">
                  {selectedCredit.membre_nom} ({selectedCredit.reference})
                </p>
              </div>
              <button
                onClick={() => setShowRemboursementModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRemboursement} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Versé (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="500"
                  value={rembForm.montant_verse}
                  onChange={e => {
                    const val = e.target.value
                    const vNum = Number(val) || 0
                    setRembForm({
                      ...rembForm,
                      montant_verse: val,
                      part_capital: Math.round(vNum * 0.8).toString(),
                      part_interet: Math.round(vNum * 0.2).toString()
                    })
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Part Capital</label>
                  <input
                    type="number"
                    value={rembForm.part_capital}
                    onChange={e => setRembForm({ ...rembForm, part_capital: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Part Intérêts</label>
                  <input
                    type="number"
                    value={rembForm.part_interet}
                    onChange={e => setRembForm({ ...rembForm, part_interet: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Canal de Règlement</label>
                <select
                  value={rembForm.mode_paiement}
                  onChange={e => setRembForm({ ...rembForm, mode_paiement: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="ESPECES">Espèces (Guichet)</option>
                  <option value="MOBILE_MONEY">Mobile Money (MTN / Moov / Celtiis)</option>
                  <option value="COLLECTEUR">Agent Collecteur Terrain</option>
                  <option value="VIREMENT">Virement Bancaire</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRemboursementModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200"
                >
                  Encaisser & Imprimer Reçu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL REÇU OFFICIEL DE REMBOURSEMENT */}
      {lastRemboursementTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs font-mono">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h3 className="font-black text-slate-900 text-base">{company?.name || 'GESTIO IMF'}</h3>
              <p className="text-[10px] text-slate-500">REÇU OFFICIEL DE REMBOURSEMENT</p>
              <p className="text-[11px] font-bold text-indigo-700 mt-1">{lastRemboursementTicket.reference}</p>
            </div>

            <div className="space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(lastRemboursementTicket.date_remboursement).toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Adhérent:</span>
                <span className="font-bold">{lastRemboursementTicket.membre_nom}</span>
              </div>
              <div className="flex justify-between">
                <span>Réf Crédit:</span>
                <span>{lastRemboursementTicket.credit_ref}</span>
              </div>
              <div className="flex justify-between">
                <span>Canal:</span>
                <span>{lastRemboursementTicket.mode_paiement}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 font-black text-sm text-slate-900">
                <span>MONTANT VERSÉ:</span>
                <span>{Number(lastRemboursementTicket.montant_verse).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Solde Restant Crédit:</span>
                <span>{Number(lastRemboursementTicket.solde_restant).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-400">
              <p>Reçu imprimé par {lastRemboursementTicket.recu_par}</p>
              <p className="mt-1 font-sans">Merci pour votre confiance !</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 font-sans"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer</span>
              </button>
              <button
                onClick={() => setLastRemboursementTicket(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl font-sans"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL NOUVELLE ACTION DE RECOUVREMENT / RELANCE */}
      {showAddRelanceModal && selectedCredit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Nouvelle Relance / Action Recouvrement</h3>
                <p className="text-xs text-slate-500">
                  {selectedCredit.membre_nom} ({selectedCredit.reference})
                </p>
              </div>
              <button
                onClick={() => setShowAddRelanceModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRelance} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Type d'Action de Relance</label>
                <select
                  value={relanceForm.type_relance}
                  onChange={e => setRelanceForm({ ...relanceForm, type_relance: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="APPEL">Appel Téléphonique</option>
                  <option value="VISITE">Visite à Domicile / Activité</option>
                  <option value="SMS">Message SMS / WhatsApp</option>
                  <option value="COURRIER">Courrier Simple de Relance</option>
                  <option value="SOMMATION">Sommation d'Huissier</option>
                  <option value="CONVOCATION">Convocation au Bureau SFD</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Interlocuteur Reçu / Contacté</label>
                <input
                  type="text"
                  placeholder={selectedCredit.membre_nom}
                  value={relanceForm.interlocuteur}
                  onChange={e => setRelanceForm({ ...relanceForm, interlocuteur: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Résultat de la Démarche</label>
                <select
                  value={relanceForm.resultat}
                  onChange={e => setRelanceForm({ ...relanceForm, resultat: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="PROMESSE_REGLEMENT">Promesse de Règlement</option>
                  <option value="DEMANDE_RECHELONNEMENT">Demande de Rééchelonnement</option>
                  <option value="LITIGE_CONTESTATION">Litige / Contestation</option>
                  <option value="ABSENT_INJOIGNABLE">Absent / Injoignable</option>
                  <option value="REFUS_PAIEMENT">Refus Catégorique de Paiement</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date Promesse</label>
                  <input
                    type="date"
                    value={relanceForm.promesse_paiement_date}
                    onChange={e => setRelanceForm({ ...relanceForm, promesse_paiement_date: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant Promis (F)</label>
                  <input
                    type="number"
                    placeholder="Ex: 50000"
                    value={relanceForm.promesse_montant}
                    onChange={e => setRelanceForm({ ...relanceForm, promesse_montant: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observation / Compte-rendu</label>
                <textarea
                  rows={3}
                  placeholder="Notes de l'agent sur la situation..."
                  value={relanceForm.observation}
                  onChange={e => setRelanceForm({ ...relanceForm, observation: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddRelanceModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                >
                  Consigner la Relance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreditsEcheanciersPage
