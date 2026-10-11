import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import clsx from 'clsx'
import {
  Bike,
  Plus,
  RefreshCw,
  Search,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Printer,
  X,
  ShieldAlert,
  MapPin,
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Users,
  Award,
  FileText,
  UserPlus,
  UserCheck,
  ChevronRight,
  Filter,
  Edit,
  Trash2,
  Eye,
  Link,
  Unlink
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  matricule: string
  nom_complet: string
  telephone: string
  email?: string
  zone_collecte: string
  plafond_especes: number
  commission_taux_pct: number
  solde_especes_detenu: number
  total_collecte_jour: number
  nb_membres_actifs: number
  statut: 'ACTIF' | 'CONGE' | 'SUSPENDU' | 'INACTIF'
  created_at: string
}

interface Adherent {
  id: string
  numero_adherent: string
  nom: string
  prenom: string
  telephone: string
  adresse?: string
  ville?: string
  type_cotisation: 'EPARGNE' | 'TONTINE' | 'CREDIT' | 'MIXTE'
  montant_cotisation_habituel: number
  periodicite: 'JOURNALIER' | 'HEBDOMADAIRE' | 'MENSUEL'
  statut: 'ACTIF' | 'INACTIF' | 'SUSPENDU'
  created_at: string
}

interface Affectation {
  id: string
  agent_id: string
  adherent_id: string
  ordre_tournee: number
}

interface CollecteTerrain {
  id: string
  reference: string
  agent_id: string
  agent_nom: string
  membre_id?: string
  adherent_id?: string
  membre_nom: string
  type_collecte: 'EPARGNE' | 'TONTINE' | 'REMBOURSEMENT_CREDIT'
  montant: number
  date_collecte: string
  statut_reversement: 'NON_REVERSE' | 'EN_ATTENTE_VALIDATION' | 'REVERSE_VALIDE'
  observation?: string
}

interface Reversement {
  id: string
  reference: string
  agent_id: string
  agent_nom: string
  montant_declare: number
  montant_recu: number
  ecart: number
  date_declaration: string
  date_validation?: string
  caissier_nom?: string
  statut: 'DECLARE' | 'VALIDE' | 'REJETE' | 'AVEC_ECART'
  observation?: string
}

// ─── Composant Principal ───────────────────────────────────────────────────────

type MainTab = 'AGENTS' | 'ADHERENTS'
type AgentTab = 'COLLECTES' | 'TOURNEE_JOUR' | 'CLOTURE_TOURNEE' | 'REVERSEMENTS' | 'COMMISSIONS'
type FilterStatut = 'TOUS' | 'ACTIF' | 'INACTIF' | 'SUSPENDU'

export const AgentsCollecteursPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  // ── État de chargement
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Données
  const [agents, setAgents] = useState<Agent[]>([])
  const [adherents, setAdherents] = useState<Adherent[]>([])
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [collectes, setCollectes] = useState<CollecteTerrain[]>([])
  const [reversements, setReversements] = useState<Reversement[]>([])
  const [tourneesClotures, setTourneesClotures] = useState<any[]>([])
  const [commissionsTMF, setCommissionsTMF] = useState<any[]>([])

  // ── Sélection & navigation
  const [mainTab, setMainTab] = useState<MainTab>('AGENTS')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [selectedAdherent, setSelectedAdherent] = useState<Adherent | null>(null)
  const [agentTab, setAgentTab] = useState<AgentTab>('COLLECTES')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchAdherent, setSearchAdherent] = useState('')
  const [filterStatut, setFilterStatut] = useState<FilterStatut>('TOUS')
  const [filterTypeCotisation, setFilterTypeCotisation] = useState<string>('TOUS')
  const [clotureTicket, setClotureTicket] = useState<any | null>(null)

  // ── Modals
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [showAddAdherentModal, setShowAddAdherentModal] = useState(false)
  const [showEditAdherentModal, setShowEditAdherentModal] = useState(false)
  const [showCollecteModal, setShowCollecteModal] = useState(false)
  const [showReversementModal, setShowReversementModal] = useState(false)
  const [showValidateModal, setShowValidateModal] = useState(false)
  const [showAffectModal, setShowAffectModal] = useState(false)
  const [showViewAdherentModal, setShowViewAdherentModal] = useState(false)
  const [selectedReversementToValidate, setSelectedReversementToValidate] = useState<Reversement | null>(null)

  // ── Formulaires
  const [newAgent, setNewAgent] = useState({
    nom_complet: '',
    telephone: '',
    email: '',
    zone_collecte: '',
    plafond_especes: '1000000',
    commission_taux_pct: '2'
  })
  const [newAdherent, setNewAdherent] = useState({
    nom: '',
    prenom: '',
    telephone: '',
    adresse: '',
    ville: 'Cotonou',
    type_cotisation: 'EPARGNE' as 'EPARGNE' | 'TONTINE' | 'CREDIT' | 'MIXTE',
    montant_cotisation_habituel: '2000',
    periodicite: 'JOURNALIER' as 'JOURNALIER' | 'HEBDOMADAIRE' | 'MENSUEL'
  })
  const [editAdherentData, setEditAdherentData] = useState<Partial<Adherent>>({})
  const [collecteForm, setCollecteForm] = useState({
    adherent_id: '',
    type_collecte: 'EPARGNE' as 'EPARGNE' | 'TONTINE' | 'REMBOURSEMENT_CREDIT',
    montant: '',
    observation: ''
  })
  const [revForm, setRevForm] = useState({ montant_declare: '', observation: '' })
  const [valForm, setValForm] = useState({ montant_recu: '', observation: '' })
  // Agents à affecter à l'adhérent sélectionné
  const [selectedAgentsToAffect, setSelectedAgentsToAffect] = useState<string[]>([])

  // ─── 1. Chargement des données ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setLoadError(null)

    try {
      // Charger agents
      const agRes = await supabaseTenant('microfinance_agents')
        .select('*')
        .order('nom_complet', { ascending: true })

      if (agRes.error) {
        console.error('[AgentsCollecteurs] Erreur agents:', agRes.error)
        setLoadError(`Agents: ${agRes.error.message}`)
        toast.error(`Erreur chargement agents : ${agRes.error.message}`)
        setLoading(false)
        return
      }

      setAgents(agRes.data || [])

      // Charger adhérents
      const adhRes = await supabaseTenant('microfinance_adherents')
        .select('*')
        .order('nom', { ascending: true })

      if (adhRes.error) {
        console.error('[AgentsCollecteurs] Erreur adhérents:', adhRes.error)
        // Pas bloquant, on continue
        toast.error(`Attention: adhérents inaccessibles — ${adhRes.error.message}`)
      } else {
        setAdherents(adhRes.data || [])
      }

      // Charger affectations
      const affRes = await supabaseTenant('microfinance_affectations_agents')
        .select('*')

      if (!affRes.error) {
        setAffectations(affRes.data || [])
      }

      // Charger collectes et reversements en parallèle
      const [colRes, revRes, cloRes, comRes] = await Promise.allSettled([
        supabaseTenant('microfinance_collectes_terrain')
          .select('*')
          .order('date_collecte', { ascending: false })
          .limit(200),
        supabaseTenant('microfinance_reversements_agents')
          .select('*')
          .order('date_declaration', { ascending: false })
          .limit(100),
        supabaseTenant('microfinance_tournees_clotures')
          .select('*')
          .order('date_tournee', { ascending: false })
          .limit(50),
        supabaseTenant('microfinance_commissions_tmf')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
      ])

      if (colRes.status === 'fulfilled' && !colRes.value.error) setCollectes(colRes.value.data || [])
      if (revRes.status === 'fulfilled' && !revRes.value.error) setReversements(revRes.value.data || [])
      if (cloRes.status === 'fulfilled' && !cloRes.value.error) setTourneesClotures(cloRes.value.data || [])
      if (comRes.status === 'fulfilled' && !comRes.value.error) setCommissionsTMF(comRes.value.data || [])

      // Sélection automatique du premier agent
      const agentsList = agRes.data || []
      if (agentsList.length > 0) {
        if (!selectedAgent) {
          setSelectedAgent(agentsList[0])
        } else {
          const refreshed = agentsList.find((a: Agent) => a.id === selectedAgent.id)
          if (refreshed) setSelectedAgent(refreshed)
        }
      } else {
        setSelectedAgent(null)
      }
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur inattendue:', err)
      const msg = err?.message || 'Erreur inconnue'
      setLoadError(msg)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast, selectedAgent])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // ─── 2. Statistiques ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let soldeDetenuTotal = 0
    let collectesJourTotal = 0
    let nbAgentsActifs = 0
    let alertesPlafond = 0

    agents.forEach(a => {
      if (a.statut === 'ACTIF') {
        nbAgentsActifs++
        soldeDetenuTotal += Number(a.solde_especes_detenu || 0)
        collectesJourTotal += Number(a.total_collecte_jour || 0)
        if (Number(a.solde_especes_detenu || 0) >= Number(a.plafond_especes || 1000000)) {
          alertesPlafond++
        }
      }
    })

    return { soldeDetenuTotal, collectesJourTotal, nbAgentsActifs, alertesPlafond }
  }, [agents])

  // ─── 3. Adhérents affectés à l'agent sélectionné ─────────────────────────

  const adherentsAffectes = useMemo(() => {
    if (!selectedAgent) return []
    const ids = affectations
      .filter(af => af.agent_id === selectedAgent.id)
      .sort((a, b) => a.ordre_tournee - b.ordre_tournee)
      .map(af => af.adherent_id)
    return ids.map(id => adherents.find(a => a.id === id)).filter(Boolean) as Adherent[]
  }, [selectedAgent, affectations, adherents])

  // ─── 4. Stats du tableau de bord agent ────────────────────────────────────

  const agentDashStats = useMemo(() => {
    if (!selectedAgent) return null
    const aujourd = new Date().toISOString().slice(0, 10)
    const collectesAujourd = collectes.filter(c =>
      c.agent_id === selectedAgent.id &&
      c.date_collecte?.slice(0, 10) === aujourd
    )
    const totalAujourd = collectesAujourd.reduce((s, c) => s + Number(c.montant || 0), 0)
    const nbAdherentsAffectes = adherentsAffectes.length
    const nbVisites = new Set(collectesAujourd.map(c => c.adherent_id || c.membre_id)).size
    const nbRestants = nbAdherentsAffectes - nbVisites

    return { totalAujourd, nbAdherentsAffectes, nbVisites, nbRestants }
  }, [selectedAgent, collectes, adherentsAffectes])

  // ─── 5. Création d'un Agent ────────────────────────────────────────────────

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgent.nom_complet || !newAgent.telephone || !newAgent.zone_collecte) {
      toast.error('Veuillez renseigner les champs requis')
      return
    }
    try {
      const matricule = `AGT-${Date.now().toString().slice(-5)}`
      const { data, error } = await supabaseTenant('microfinance_agents')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          matricule,
          nom_complet: newAgent.nom_complet,
          telephone: newAgent.telephone,
          email: newAgent.email,
          zone_collecte: newAgent.zone_collecte,
          plafond_especes: Number(newAgent.plafond_especes) || 1000000,
          commission_taux_pct: Number(newAgent.commission_taux_pct) || 2,
          solde_especes_detenu: 0,
          total_collecte_jour: 0,
          nb_membres_actifs: 0,
          statut: 'ACTIF'
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Agent collecteur enregistré !')
      setShowAddAgentModal(false)
      setNewAgent({ nom_complet: '', telephone: '', email: '', zone_collecte: '', plafond_especes: '1000000', commission_taux_pct: '2' })
      await loadData()
      if (data) setSelectedAgent(data)
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur création agent:', err)
      toast.error(`Erreur : ${err?.message || 'Création échouée'}`)
    }
  }

  // ─── 6. Création d'un Adhérent ────────────────────────────────────────────

  const handleCreateAdherent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAdherent.nom || !newAdherent.telephone) {
      toast.error('Nom et téléphone sont obligatoires')
      return
    }
    try {
      const numero = `ADH-${Date.now().toString().slice(-6)}`
      const { error } = await supabaseTenant('microfinance_adherents')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          numero_adherent: numero,
          nom: newAdherent.nom.trim(),
          prenom: newAdherent.prenom.trim(),
          telephone: newAdherent.telephone.trim(),
          adresse: newAdherent.adresse,
          ville: newAdherent.ville || 'Cotonou',
          type_cotisation: newAdherent.type_cotisation,
          montant_cotisation_habituel: Number(newAdherent.montant_cotisation_habituel) || 0,
          periodicite: newAdherent.periodicite,
          statut: 'ACTIF',
          cree_par: user?.full_name || user?.email || 'Admin'
        })

      if (error) throw error

      toast.success('Adhérent enregistré avec succès !')
      setShowAddAdherentModal(false)
      setNewAdherent({ nom: '', prenom: '', telephone: '', adresse: '', ville: 'Cotonou', type_cotisation: 'EPARGNE', montant_cotisation_habituel: '2000', periodicite: 'JOURNALIER' })
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur création adhérent:', err)
      toast.error(`Erreur : ${err?.message || 'Création échouée'}`)
    }
  }

  // ─── 7. Modification d'un Adhérent ────────────────────────────────────────

  const handleEditAdherent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAdherent) return
    try {
      const { error } = await supabaseTenant('microfinance_adherents')
        .update({
          nom: editAdherentData.nom || selectedAdherent.nom,
          prenom: editAdherentData.prenom ?? selectedAdherent.prenom,
          telephone: editAdherentData.telephone || selectedAdherent.telephone,
          adresse: editAdherentData.adresse ?? selectedAdherent.adresse,
          ville: editAdherentData.ville ?? selectedAdherent.ville,
          type_cotisation: editAdherentData.type_cotisation || selectedAdherent.type_cotisation,
          montant_cotisation_habituel: editAdherentData.montant_cotisation_habituel ?? selectedAdherent.montant_cotisation_habituel,
          periodicite: editAdherentData.periodicite || selectedAdherent.periodicite,
          statut: editAdherentData.statut || selectedAdherent.statut,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedAdherent.id)

      if (error) throw error

      toast.success('Adhérent mis à jour !')
      setShowEditAdherentModal(false)
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur modification adhérent:', err)
      toast.error(`Erreur : ${err?.message || 'Modification échouée'}`)
    }
  }

  // ─── 8. Affecter / désaffecter des adhérents à un agent ──────────────────

  const handleSaveAffectations = async () => {
    if (!selectedAgent) return
    try {
      // Supprimer les anciennes affectations de cet agent
      const { error: delErr } = await supabaseTenant('microfinance_affectations_agents')
        .delete()
        .eq('agent_id', selectedAgent.id)

      if (delErr) throw delErr

      // Insérer les nouvelles affectations
      if (selectedAgentsToAffect.length > 0) {
        const rows = selectedAgentsToAffect.map((adherentId, idx) => ({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          agent_id: selectedAgent.id,
          adherent_id: adherentId,
          ordre_tournee: idx
        }))

        const { error: insErr } = await supabaseTenant('microfinance_affectations_agents').insert(rows)
        if (insErr) throw insErr
      }

      toast.success('Affectations mises à jour !')
      setShowAffectModal(false)
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur affectations:', err)
      toast.error(`Erreur : ${err?.message || 'Affectation échouée'}`)
    }
  }

  // ─── 9. Pointer une Collecte Terrain ──────────────────────────────────────

  const handleSaveCollecte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent) return

    const adherent = adherentsAffectes.find(a => a.id === collecteForm.adherent_id)
      || adherents.find(a => a.id === collecteForm.adherent_id)

    if (!adherent) {
      toast.error('Veuillez sélectionner un adhérent')
      return
    }

    const montant = Number(collecteForm.montant)
    if (!montant || montant <= 0) {
      toast.error('Veuillez saisir un montant valide')
      return
    }

    // Vérifier plafond d'espèces
    const nouveauSolde = Number(selectedAgent.solde_especes_detenu || 0) + montant
    if (nouveauSolde > Number(selectedAgent.plafond_especes || 1000000)) {
      toast.error(`Plafond dépassé (${(selectedAgent.plafond_especes || 1000000).toLocaleString('fr-FR')} FCFA). L'agent doit reverser en caisse.`)
      return
    }

    try {
      const ref = `COL-${Date.now().toString().slice(-7)}`
      const { error: colErr } = await supabaseTenant('microfinance_collectes_terrain').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        reference: ref,
        agent_id: selectedAgent.id,
        agent_nom: selectedAgent.nom_complet,
        adherent_id: adherent.id,
        membre_id: adherent.id,
        membre_nom: `${adherent.prenom} ${adherent.nom}`.trim(),
        type_collecte: collecteForm.type_collecte,
        montant: montant,
        date_collecte: new Date().toISOString(),
        statut_reversement: 'NON_REVERSE',
        observation: collecteForm.observation
      })

      if (colErr) throw colErr

      // Mettre à jour le solde de l'agent
      const { error: updErr } = await supabaseTenant('microfinance_agents')
        .update({
          solde_especes_detenu: nouveauSolde,
          total_collecte_jour: Number(selectedAgent.total_collecte_jour || 0) + montant
        })
        .eq('id', selectedAgent.id)

      if (updErr) console.warn('[AgentsCollecteurs] Avertissement mise à jour solde agent:', updErr)

      toast.success('Collecte enregistrée ! Reçu émis.')
      setShowCollecteModal(false)
      setCollecteForm({ adherent_id: '', type_collecte: 'EPARGNE', montant: '', observation: '' })
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur collecte:', err)
      toast.error(`Erreur : ${err?.message || 'Enregistrement échoué'}`)
    }
  }

  // ─── 10. Déclaration de Reversement ───────────────────────────────────────

  const handleSaveReversement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent) return
    const montant = Number(revForm.montant_declare)
    if (!montant || montant <= 0) { toast.error('Veuillez saisir un montant'); return }
    if (montant > Number(selectedAgent.solde_especes_detenu || 0)) {
      toast.error('Le montant déclaré dépasse les espèces détenues')
      return
    }
    try {
      const ref = `REV-${Date.now().toString().slice(-6)}`
      const { error } = await supabaseTenant('microfinance_reversements_agents').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        reference: ref,
        agent_id: selectedAgent.id,
        agent_nom: selectedAgent.nom_complet,
        montant_declare: montant,
        montant_recu: 0,
        ecart: 0,
        date_declaration: new Date().toISOString(),
        statut: 'DECLARE',
        observation: revForm.observation
      })
      if (error) throw error
      toast.success('Déclaration de versement transmise à la caisse !')
      setShowReversementModal(false)
      setRevForm({ montant_declare: '', observation: '' })
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur reversement:', err)
      toast.error(`Erreur : ${err?.message}`)
    }
  }

  // ─── 11. Validation Caissier ───────────────────────────────────────────────

  const handleValidateReversement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedReversementToValidate) return
    const declare = Number(selectedReversementToValidate.montant_declare)
    const recu = Number(valForm.montant_recu)
    const ecart = recu - declare
    const statut = ecart === 0 ? 'VALIDE' : 'AVEC_ECART'
    try {
      const { error: revErr } = await supabaseTenant('microfinance_reversements_agents')
        .update({ montant_recu: recu, ecart, date_validation: new Date().toISOString(), caissier_nom: user?.full_name || user?.email || 'Caissier', statut, observation: valForm.observation || selectedReversementToValidate.observation })
        .eq('id', selectedReversementToValidate.id)
      if (revErr) throw revErr

      const agentTarget = agents.find(a => a.id === selectedReversementToValidate.agent_id)
      if (agentTarget) {
        const updatedSolde = Math.max(0, Number(agentTarget.solde_especes_detenu || 0) - recu)
        await supabaseTenant('microfinance_agents').update({ solde_especes_detenu: updatedSolde }).eq('id', agentTarget.id)
      }

      toast.success(ecart === 0 ? 'Reversement validé !' : `Validé avec un écart de ${ecart.toLocaleString('fr-FR')} FCFA`)
      setShowValidateModal(false)
      setSelectedReversementToValidate(null)
      setValForm({ montant_recu: '', observation: '' })
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur validation:', err)
      toast.error(`Erreur : ${err?.message}`)
    }
  }

  // ─── 12. Clôture de Tournée Terrain ───────────────────────────────────────

  const handleClotureTournee = async (agent: Agent) => {
    if (!agent) return
    const totalCollecte = Number(agent.total_collecte_jour) || 0
    if (totalCollecte <= 0 && Number(agent.solde_especes_detenu || 0) <= 0) {
      toast.error("Aucune collecte effectuée aujourd'hui à clôturer.")
      return
    }
    const commRate = Number(agent.commission_taux_pct) || 2
    const commissionsAgent = Math.round((totalCollecte * commRate) / 100)
    const versementNet = Math.max(0, totalCollecte - commissionsAgent)
    const ref = `CLOT-${Date.now().toString().slice(-6)}`
    try {
      const { data: clotureData, error: clotureErr } = await supabaseTenant('microfinance_tournees_clotures')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          reference: ref,
          agent_id: agent.id,
          agent_nom: agent.nom_complet,
          date_tournee: new Date().toISOString().slice(0, 10),
          zone_collecte: agent.zone_collecte,
          nb_membres_visites: collectes.filter(c => c.agent_id === agent.id).length,
          nb_paiements: collectes.filter(c => c.agent_id === agent.id).length,
          total_collecte: totalCollecte,
          commissions_agent: commissionsAgent,
          montant_reverse_caisse: versementNet,
          ecart: 0,
          heure_cloture: new Date().toISOString()
        })
        .select()
        .single()

      if (clotureErr) throw clotureErr

      await Promise.allSettled([
        supabaseTenant('microfinance_commissions_tmf').insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          agent_id: agent.id,
          agent_nom: agent.nom_complet,
          type_produit: 'COLLECTE_JOUR',
          base_calcul: totalCollecte,
          taux_commission: commRate,
          montant_commission: commissionsAgent,
          statut_paiement: 'A_PAYER'
        }),
        supabaseTenant('microfinance_agents')
          .update({ total_collecte_jour: 0 })
          .eq('id', agent.id)
      ])

      toast.success('Clôture de tournée enregistrée !')
      if (clotureData) {
        setClotureTicket({ ...clotureData, agent_matricule: agent.matricule, cloture_par: user?.full_name || user?.email || 'Superviseur' })
      }
      await loadData()
    } catch (err: any) {
      console.error('[AgentsCollecteurs] Erreur clôture:', err)
      toast.error(`Erreur : ${err?.message}`)
    }
  }

  // ─── Filtres Adhérents ─────────────────────────────────────────────────────

  const adherentsFiltres = useMemo(() => {
    return adherents.filter(a => {
      const nomComplet = `${a.prenom} ${a.nom}`.toLowerCase()
      const matchSearch = !searchAdherent ||
        nomComplet.includes(searchAdherent.toLowerCase()) ||
        a.telephone.includes(searchAdherent) ||
        (a.numero_adherent || '').toLowerCase().includes(searchAdherent.toLowerCase())
      const matchStatut = filterStatut === 'TOUS' || a.statut === filterStatut
      const matchType = filterTypeCotisation === 'TOUS' || a.type_cotisation === filterTypeCotisation
      return matchSearch && matchStatut && matchType
    })
  }, [adherents, searchAdherent, filterStatut, filterTypeCotisation])

  // ─── Agents filtrés ────────────────────────────────────────────────────────

  const agentsFiltres = useMemo(() => {
    return agents.filter(a =>
      a.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.zone_collecte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.matricule.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [agents, searchTerm])

  // ════════════════════════════════════════════════════════════════════════════
  // RENDU
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">

      {/* ── EN-TÊTE ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Agents Collecteurs & Adhérents
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Tournées terrain, adhérents, pointages & contrôle des reversements caisse
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <button
            onClick={() => setShowAddAdherentModal(true)}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-200 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nouvel Adhérent</span>
          </button>

          <button
            onClick={() => setShowAddAgentModal(true)}
            className="px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-black shadow-md shadow-teal-200 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvel Agent</span>
          </button>
        </div>
      </div>

      {/* ── Erreur de chargement ──────────────────────────────────────────── */}
      {loadError && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-medium">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-900 mb-1">Erreur lors du chargement</p>
            <p>{loadError}</p>
            <p className="mt-1 text-rose-600">
              Vérifiez les politiques RLS dans Supabase &gt; Authentication &gt; Policies &gt; <code>microfinance_agents</code>
            </p>
          </div>
        </div>
      )}

      {/* ── STATS ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Agents Terrain</span>
            <Bike className="w-5 h-5 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.nbAgentsActifs}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Collecteurs actifs</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Adhérents</span>
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-700">{adherents.filter(a => a.statut === 'ACTIF').length}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Adhérents actifs enregistrés</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Espèces en Poche</span>
            <DollarSign className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600">
            {stats.soldeDetenuTotal.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Total non reversé</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Alertes Plafond</span>
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div className={`text-2xl font-black ${stats.alertesPlafond > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {stats.alertesPlafond}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Seuil dépassé</p>
        </div>
      </div>

      {/* ── ONGLETS PRINCIPAUX ────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {([
          { id: 'AGENTS', label: `Agents (${agents.length})`, icon: Bike },
          { id: 'ADHERENTS', label: `Adhérents (${adherents.length})`, icon: Users }
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            className={clsx(
              'px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all',
              mainTab === tab.id
                ? tab.id === 'AGENTS' ? 'bg-teal-600 text-white shadow-md shadow-teal-200' : 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ONGLET AGENTS                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === 'AGENTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LISTE DES AGENTS ──────────────────────────────────────────── */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-900">Corps des Collecteurs</span>
                <span className="text-xs font-bold text-slate-400">{agents.length}</span>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nom, Zone, Matricule..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                  <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">Chargement...</p>
                </div>
              ) : agentsFiltres.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 p-6">
                  <Bike className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-700">Aucun agent collecteur</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    Enregistrez vos agents de terrain.
                  </p>
                  <button onClick={() => setShowAddAgentModal(true)} className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-xl">
                    + Nouvel Agent
                  </button>
                </div>
              ) : (
                agentsFiltres.map(a => {
                  const isSelected = selectedAgent?.id === a.id
                  const ratioPlafond = a.plafond_especes > 0 ? (a.solde_especes_detenu / a.plafond_especes) * 100 : 0
                  const isAlerte = a.solde_especes_detenu >= a.plafond_especes
                  const nbAffectes = affectations.filter(af => af.agent_id === a.id).length

                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAgent(a)}
                      className={`p-4 rounded-3xl border cursor-pointer transition-all ${isSelected
                        ? 'bg-teal-50/60 border-teal-500 shadow-md ring-1 ring-teal-500'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">{a.matricule}</span>
                            <span className="text-xs font-black text-slate-900">{a.nom_complet}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{a.zone_collecte}</span>
                          </p>
                          <p className="text-[10px] text-indigo-500 font-semibold mt-0.5">
                            {nbAffectes} adhérent{nbAffectes !== 1 ? 's' : ''} affecté{nbAffectes !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-black ${isAlerte ? 'text-rose-600' : 'text-slate-900'}`}>
                            {Number(a.solde_especes_detenu).toLocaleString('fr-FR')} F
                          </span>
                          <p className="text-[10px] text-slate-400">en caisse mobile</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                          <span>Plafond: {Number(a.plafond_especes).toLocaleString('fr-FR')} F</span>
                          <span className={isAlerte ? 'text-rose-600 font-black' : ''}>{ratioPlafond.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isAlerte ? 'bg-rose-500' : ratioPlafond > 70 ? 'bg-amber-500' : 'bg-teal-600'}`}
                            style={{ width: `${Math.min(100, ratioPlafond)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── DÉTAIL DE L'AGENT SÉLECTIONNÉ ────────────────────────────── */}
          <div className="lg:col-span-8">
            {selectedAgent ? (
              <div className="space-y-4">

                {/* Carte En-tête Agent */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-teal-700 bg-teal-100 px-2.5 py-0.5 rounded-full">{selectedAgent.matricule}</span>
                        <h2 className="text-xl font-black text-slate-900">{selectedAgent.nom_complet}</h2>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Zone: <span className="font-semibold text-slate-700">{selectedAgent.zone_collecte}</span>
                        {' '}• Tél: {selectedAgent.telephone}
                        {' '}• Com: {selectedAgent.commission_taux_pct}%
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          const currentIds = affectations
                            .filter(af => af.agent_id === selectedAgent.id)
                            .map(af => af.adherent_id)
                          setSelectedAgentsToAffect(currentIds)
                          setShowAffectModal(true)
                        }}
                        className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 flex items-center gap-1.5"
                      >
                        <Link className="w-3.5 h-3.5" />
                        <span>Affecter Adhérents</span>
                      </button>
                      <button
                        onClick={() => setShowCollecteModal(true)}
                        className="px-3.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-teal-200 flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Pointer Collecte</span>
                      </button>
                      <button
                        onClick={() => {
                          setRevForm({ montant_declare: selectedAgent.solde_especes_detenu.toString(), observation: '' })
                          setShowReversementModal(true)
                        }}
                        className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-200 flex items-center gap-1.5"
                      >
                        <ArrowDownLeft className="w-4 h-4" />
                        <span>Reversement</span>
                      </button>
                      <button
                        onClick={() => handleClotureTournee(selectedAgent)}
                        className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 flex items-center gap-1.5"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Clôturer Tournée</span>
                      </button>
                    </div>
                  </div>

                  {/* KPIs agent */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-teal-50/40 p-4 rounded-2xl border border-teal-100">
                    <div>
                      <span className="text-[10px] font-bold text-teal-800 uppercase">Espèces Détenues</span>
                      <div className="text-base font-black text-slate-900">{Number(selectedAgent.solde_especes_detenu).toLocaleString('fr-FR')} F</div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-teal-800 uppercase">Plafond Autorisé</span>
                      <div className="text-base font-black text-slate-900">{Number(selectedAgent.plafond_especes).toLocaleString('fr-FR')} F</div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-teal-800 uppercase">Collecte Jour</span>
                      <div className="text-base font-black text-emerald-600">{Number(selectedAgent.total_collecte_jour).toLocaleString('fr-FR')} F</div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-teal-800 uppercase">Adhérents Affectés</span>
                      <div className="text-base font-black text-indigo-700">{adherentsAffectes.length}</div>
                    </div>
                  </div>

                  {/* Mini tableau de bord tournée */}
                  {agentDashStats && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase">Visités Aujourd'hui</p>
                        <p className="text-xl font-black text-emerald-800">{agentDashStats.nbVisites}</p>
                        <p className="text-[10px] text-emerald-600">/ {agentDashStats.nbAdherentsAffectes}</p>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                        <p className="text-[10px] font-bold text-amber-700 uppercase">À Visiter</p>
                        <p className="text-xl font-black text-amber-800">{Math.max(0, agentDashStats.nbRestants)}</p>
                        <p className="text-[10px] text-amber-600">Restants</p>
                      </div>
                      <div className="p-3 bg-teal-50 rounded-2xl border border-teal-100 text-center">
                        <p className="text-[10px] font-bold text-teal-700 uppercase">Cumul Jour</p>
                        <p className="text-sm font-black text-teal-800">{agentDashStats.totalAujourd.toLocaleString('fr-FR')} F</p>
                        <p className="text-[10px] text-teal-600">FCFA collectés</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Onglets Agent */}
                <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto text-xs font-bold">
                  {([
                    { id: 'COLLECTES', label: `Journal (${collectes.filter(c => c.agent_id === selectedAgent.id).length})`, icon: CheckCircle2 },
                    { id: 'TOURNEE_JOUR', label: `Tournée (${adherentsAffectes.length})`, icon: Users },
                    { id: 'CLOTURE_TOURNEE', label: 'Clôtures', icon: Calendar },
                    { id: 'REVERSEMENTS', label: `Reversements (${reversements.filter(r => r.agent_id === selectedAgent.id).length})`, icon: ArrowDownLeft },
                    { id: 'COMMISSIONS', label: 'Commissions', icon: Award }
                  ] as { id: AgentTab; label: string; icon: any }[]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setAgentTab(tab.id)}
                      className={clsx(
                        'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                        agentTab === tab.id ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* ── Onglet Journal Collectes ────────────────────────────── */}
                {agentTab === 'COLLECTES' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Dernières Collectes ({collectes.filter(c => c.agent_id === selectedAgent.id).length})
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="py-3 px-3">Réf</th>
                            <th className="py-3 px-3">Heure</th>
                            <th className="py-3 px-3">Adhérent</th>
                            <th className="py-3 px-3">Type</th>
                            <th className="py-3 px-3 text-right">Montant</th>
                            <th className="py-3 px-3 text-center">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {collectes.filter(c => c.agent_id === selectedAgent.id).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400">Aucune collecte pointée pour le moment.</td>
                            </tr>
                          ) : (
                            collectes.filter(c => c.agent_id === selectedAgent.id).map(c => (
                              <tr key={c.id} className="hover:bg-slate-50/80">
                                <td className="py-2.5 px-3 font-mono font-bold text-teal-700">{c.reference}</td>
                                <td className="py-2.5 px-3 text-slate-500">
                                  {new Date(c.date_collecte).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-900">{c.membre_nom}</td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{c.type_collecte}</span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-emerald-600">
                                  +{Number(c.montant).toLocaleString('fr-FR')} F
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${c.statut_reversement === 'REVERSE_VALIDE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {c.statut_reversement}
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

                {/* ── Onglet Tournée du Jour ──────────────────────────────── */}
                {agentTab === 'TOURNEE_JOUR' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Feuille de Tournée — Zone {selectedAgent.zone_collecte}
                      </h4>
                      <p className="text-[11px] text-slate-500">Adhérents affectés à cet agent</p>
                    </div>

                    {adherentsAffectes.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="font-bold">Aucun adhérent affecté à cet agent.</p>
                        <button
                          onClick={() => {
                            setSelectedAgentsToAffect([])
                            setShowAffectModal(true)
                          }}
                          className="mt-3 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-xs hover:bg-indigo-100"
                        >
                          Affecter des adhérents
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {adherentsAffectes.map((adh, idx) => {
                          const collectesAdh = collectes.filter(c =>
                            c.agent_id === selectedAgent.id &&
                            (c.adherent_id === adh.id || c.membre_id === adh.id) &&
                            c.date_collecte?.slice(0, 10) === new Date().toISOString().slice(0, 10)
                          )
                          const dejaPasse = collectesAdh.length > 0

                          return (
                            <div
                              key={adh.id}
                              className={`flex items-center justify-between p-3 rounded-2xl border text-xs transition ${dejaPasse
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-slate-50 border-slate-100 hover:bg-white hover:border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${dejaPasse ? 'bg-emerald-200 text-emerald-800' : 'bg-teal-100 text-teal-800'}`}>
                                  {dejaPasse ? '✓' : `${idx + 1}`}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-900">{adh.prenom} {adh.nom}</span>
                                  <p className="text-[10px] text-slate-400">
                                    {adh.telephone} • {adh.type_cotisation} • {Number(adh.montant_cotisation_habituel).toLocaleString('fr-FR')} F
                                  </p>
                                  {dejaPasse && (
                                    <p className="text-[10px] text-emerald-600 font-semibold">
                                      ✓ Collecté: {collectesAdh.reduce((s, c) => s + Number(c.montant), 0).toLocaleString('fr-FR')} F
                                    </p>
                                  )}
                                </div>
                              </div>

                              {!dejaPasse && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setCollecteForm({
                                        adherent_id: adh.id,
                                        type_collecte: adh.type_cotisation === 'TONTINE' ? 'TONTINE' : 'EPARGNE',
                                        montant: String(adh.montant_cotisation_habituel || '2000'),
                                        observation: `Tournée terrain — ${adh.periodicite}`
                                      })
                                      setShowCollecteModal(true)
                                    }}
                                    className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-xl text-xs"
                                  >
                                    + Encaisser
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Onglet Clôture Tournée ──────────────────────────────── */}
                {agentTab === 'CLOTURE_TOURNEE' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Bilan Journalier de la Tournée</h4>
                        <p className="text-[11px] text-slate-500">Date: {new Date().toLocaleDateString('fr-FR')} • Agent: {selectedAgent.nom_complet}</p>
                      </div>
                      <button
                        onClick={() => handleClotureTournee(selectedAgent)}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 flex items-center gap-2"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Valider Clôture Tournée</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Total Collecté Aujourd'hui</span>
                        <div className="text-lg font-black text-slate-900 mt-1">{Number(selectedAgent.total_collecte_jour).toLocaleString('fr-FR')} FCFA</div>
                      </div>
                      <div className="p-4 bg-teal-50/60 rounded-2xl border border-teal-100">
                        <span className="text-[10px] uppercase font-bold text-teal-800">Commission Agent ({selectedAgent.commission_taux_pct}%)</span>
                        <div className="text-lg font-black text-teal-700 mt-1">
                          {((Number(selectedAgent.total_collecte_jour || 0) * Number(selectedAgent.commission_taux_pct || 2)) / 100).toLocaleString('fr-FR')} FCFA
                        </div>
                      </div>
                      <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                        <span className="text-[10px] uppercase font-bold text-emerald-800">Versement Net Caisse</span>
                        <div className="text-lg font-black text-emerald-700 mt-1">
                          {(Number(selectedAgent.total_collecte_jour || 0) - (Number(selectedAgent.total_collecte_jour || 0) * Number(selectedAgent.commission_taux_pct || 2)) / 100).toLocaleString('fr-FR')} FCFA
                        </div>
                      </div>
                    </div>

                    <div className="pt-3">
                      <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                        Historique des Tournées Clôturées ({tourneesClotures.filter(tc => tc.agent_id === selectedAgent.id).length})
                      </h5>
                      {tourneesClotures.filter(tc => tc.agent_id === selectedAgent.id).length === 0 ? (
                        <p className="text-xs text-slate-400 py-3">Aucune clôture archivée pour cet agent.</p>
                      ) : (
                        <div className="space-y-2">
                          {tourneesClotures.filter(tc => tc.agent_id === selectedAgent.id).map(tc => (
                            <div key={tc.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-mono font-bold text-indigo-700">{tc.reference}</span>
                                <p className="text-[11px] text-slate-500">{new Date(tc.date_tournee).toLocaleDateString('fr-FR')} • {tc.nb_paiements} paiements</p>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <span className="font-black text-slate-900">{Number(tc.total_collecte).toLocaleString('fr-FR')} F</span>
                                  <p className="text-[10px] text-teal-600">Com: {Number(tc.commissions_agent).toLocaleString('fr-FR')} F</p>
                                </div>
                                <button onClick={() => setClotureTicket(tc)} className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600" title="Imprimer">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Onglet Reversements ─────────────────────────────────── */}
                {agentTab === 'REVERSEMENTS' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <ArrowDownLeft className="w-4 h-4 text-amber-500" />
                      Reversements Caisse ({reversements.filter(r => r.agent_id === selectedAgent.id).length})
                    </h4>
                    {reversements.filter(r => r.agent_id === selectedAgent.id).length === 0 ? (
                      <p className="text-xs text-slate-400 py-3">Aucun reversement pour cet agent.</p>
                    ) : (
                      <div className="space-y-2">
                        {reversements.filter(r => r.agent_id === selectedAgent.id).map(r => (
                          <div key={r.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${r.statut === 'VALIDE' ? 'bg-emerald-100 text-emerald-700' : r.statut === 'DECLARE' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                {r.statut === 'VALIDE' ? '✓' : '⏳'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-indigo-600">{r.reference}</span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${r.statut === 'VALIDE' ? 'bg-emerald-100 text-emerald-700' : r.statut === 'DECLARE' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {r.statut}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">Déclaré: {Number(r.montant_declare).toLocaleString('fr-FR')} F • Le {new Date(r.date_declaration).toLocaleString('fr-FR')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-black text-slate-900">{Number(r.montant_recu || r.montant_declare).toLocaleString('fr-FR')} FCFA</span>
                                {r.ecart !== 0 && <p className={`text-[10px] font-bold ${r.ecart < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>Écart: {r.ecart > 0 ? `+${r.ecart}` : r.ecart} F</p>}
                              </div>
                              {r.statut === 'DECLARE' && (
                                <button
                                  onClick={() => { setSelectedReversementToValidate(r); setValForm({ montant_recu: r.montant_declare.toString(), observation: '' }); setShowValidateModal(true) }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px]"
                                >
                                  Réceptionner
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Onglet Commissions ──────────────────────────────────── */}
                {agentTab === 'COMMISSIONS' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Award className="w-4 h-4 text-teal-600" />
                        Commissions Collecteur TMF
                      </h4>
                      <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-xl">
                        Taux: {selectedAgent.commission_taux_pct}%
                      </span>
                    </div>
                    {commissionsTMF.filter(cm => cm.agent_id === selectedAgent.id).length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-xs">Aucune commission enregistrée. Elles sont générées lors des clôtures de tournée.</p>
                    ) : (
                      <div className="space-y-2">
                        {commissionsTMF.filter(cm => cm.agent_id === selectedAgent.id).map(cm => (
                          <div key={cm.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-slate-800">{cm.type_produit}</span>
                              <p className="text-[11px] text-slate-500">Base: {Number(cm.base_calcul).toLocaleString('fr-FR')} F • Taux: {cm.taux_commission}%</p>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-teal-700">+{Number(cm.montant_commission).toLocaleString('fr-FR')} FCFA</span>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{cm.statut_paiement}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
                <Bike className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-black text-slate-800">Sélectionnez un collecteur</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Choisissez un agent pour suivre sa caisse mobile, valider ses reversements ou contrôler ses tournées.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ONGLET ADHÉRENTS                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === 'ADHERENTS' && (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Nom, téléphone, identifiant..."
                value={searchAdherent}
                onChange={e => setSearchAdherent(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
              />
            </div>
            <select
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value as FilterStatut)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="TOUS">Tous statuts</option>
              <option value="ACTIF">Actif</option>
              <option value="INACTIF">Inactif</option>
              <option value="SUSPENDU">Suspendu</option>
            </select>
            <select
              value={filterTypeCotisation}
              onChange={e => setFilterTypeCotisation(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="TOUS">Tous types</option>
              <option value="EPARGNE">Épargne</option>
              <option value="TONTINE">Tontine</option>
              <option value="CREDIT">Crédit</option>
              <option value="MIXTE">Mixte</option>
            </select>
            <span className="text-xs font-bold text-slate-500">{adherentsFiltres.length} résultat(s)</span>
          </div>

          {/* Tableau des adhérents */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">N° Adhérent</th>
                  <th className="py-3 px-4">Nom Complet</th>
                  <th className="py-3 px-4">Téléphone</th>
                  <th className="py-3 px-4">Type Cotisation</th>
                  <th className="py-3 px-4 text-right">Cotisation Hab.</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-center">Agent(s)</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {loading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Chargement...</td></tr>
                ) : adherentsFiltres.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="font-bold text-slate-700 text-sm">Aucun adhérent enregistré</p>
                      <button onClick={() => setShowAddAdherentModal(true)} className="mt-3 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-xs hover:bg-indigo-100">
                        + Enregistrer un adhérent
                      </button>
                    </td>
                  </tr>
                ) : (
                  adherentsFiltres.map(adh => {
                    const agentsAffectes = affectations
                      .filter(af => af.adherent_id === adh.id)
                      .map(af => agents.find(a => a.id === af.agent_id)?.nom_complet)
                      .filter(Boolean)

                    return (
                      <tr key={adh.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">{adh.numero_adherent || '—'}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{adh.prenom} {adh.nom}</td>
                        <td className="py-2.5 px-4 text-slate-600">{adh.telephone}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            adh.type_cotisation === 'EPARGNE' ? 'bg-emerald-100 text-emerald-700' :
                            adh.type_cotisation === 'TONTINE' ? 'bg-indigo-100 text-indigo-700' :
                            adh.type_cotisation === 'CREDIT' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {adh.type_cotisation}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-black text-slate-800">
                          {Number(adh.montant_cotisation_habituel || 0).toLocaleString('fr-FR')} F
                          <p className="text-[10px] text-slate-400 font-normal">{adh.periodicite}</p>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            adh.statut === 'ACTIF' ? 'bg-emerald-100 text-emerald-700' :
                            adh.statut === 'SUSPENDU' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {adh.statut}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center text-[10px] text-indigo-600 font-semibold">
                          {agentsAffectes.length > 0
                            ? agentsAffectes.slice(0, 2).join(', ') + (agentsAffectes.length > 2 ? '...' : '')
                            : <span className="text-slate-300">Non affecté</span>
                          }
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setSelectedAdherent(adh); setShowViewAdherentModal(true) }}
                              className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-indigo-600"
                              title="Voir la fiche"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setSelectedAdherent(adh); setEditAdherentData({ ...adh }); setShowEditAdherentModal(true) }}
                              className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-teal-600"
                              title="Modifier"
                            >
                              <Edit className="w-3.5 h-3.5" />
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
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {/* Modal Nouvel Agent */}
      {showAddAgentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Enregistrer un Agent Collecteur</h3>
              <button onClick={() => setShowAddAgentModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateAgent} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom Complet *</label>
                <input type="text" required placeholder="Ex: TOSSOU Marc" value={newAgent.nom_complet} onChange={e => setNewAgent({ ...newAgent, nom_complet: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone *</label>
                  <input type="text" required placeholder="+229 ..." value={newAgent.telephone} onChange={e => setNewAgent({ ...newAgent, telephone: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Zone de Collecte *</label>
                  <input type="text" required placeholder="Ex: Dantokpa..." value={newAgent.zone_collecte} onChange={e => setNewAgent({ ...newAgent, zone_collecte: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Plafond Espèces (FCFA)</label>
                  <input type="number" value={newAgent.plafond_especes} onChange={e => setNewAgent({ ...newAgent, plafond_especes: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Taux Com. (%)</label>
                  <input type="number" step="0.1" value={newAgent.commission_taux_pct} onChange={e => setNewAgent({ ...newAgent, commission_taux_pct: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900" />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddAgentModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nouvel Adhérent */}
      {showAddAdherentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Enregistrer un Adhérent</h3>
              <button onClick={() => setShowAddAdherentModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateAdherent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom *</label>
                  <input type="text" required placeholder="HOUNKPATIN" value={newAdherent.nom} onChange={e => setNewAdherent({ ...newAdherent, nom: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prénom</label>
                  <input type="text" placeholder="Marie" value={newAdherent.prenom} onChange={e => setNewAdherent({ ...newAdherent, prenom: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Téléphone *</label>
                <input type="text" required placeholder="+229 97..." value={newAdherent.telephone} onChange={e => setNewAdherent({ ...newAdherent, telephone: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adresse</label>
                <input type="text" placeholder="Ex: Akpakpa, rue..." value={newAdherent.adresse} onChange={e => setNewAdherent({ ...newAdherent, adresse: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type de Cotisation</label>
                  <select value={newAdherent.type_cotisation} onChange={e => setNewAdherent({ ...newAdherent, type_cotisation: e.target.value as any })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                    <option value="EPARGNE">Épargne</option>
                    <option value="TONTINE">Tontine</option>
                    <option value="CREDIT">Crédit</option>
                    <option value="MIXTE">Mixte</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Périodicité</label>
                  <select value={newAdherent.periodicite} onChange={e => setNewAdherent({ ...newAdherent, periodicite: e.target.value as any })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                    <option value="JOURNALIER">Journalier</option>
                    <option value="HEBDOMADAIRE">Hebdomadaire</option>
                    <option value="MENSUEL">Mensuel</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Habituel de Cotisation (FCFA)</label>
                <input type="number" min="0" value={newAdherent.montant_cotisation_habituel} onChange={e => setNewAdherent({ ...newAdherent, montant_cotisation_habituel: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900" />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddAdherentModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200">Enregistrer Adhérent</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modifier Adhérent */}
      {showEditAdherentModal && selectedAdherent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Modifier l'Adhérent</h3>
              <button onClick={() => setShowEditAdherentModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleEditAdherent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom *</label>
                  <input type="text" required value={editAdherentData.nom || ''} onChange={e => setEditAdherentData({ ...editAdherentData, nom: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prénom</label>
                  <input type="text" value={editAdherentData.prenom || ''} onChange={e => setEditAdherentData({ ...editAdherentData, prenom: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Téléphone *</label>
                <input type="text" required value={editAdherentData.telephone || ''} onChange={e => setEditAdherentData({ ...editAdherentData, telephone: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adresse</label>
                <input type="text" value={editAdherentData.adresse || ''} onChange={e => setEditAdherentData({ ...editAdherentData, adresse: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type Cotisation</label>
                  <select value={editAdherentData.type_cotisation || 'EPARGNE'} onChange={e => setEditAdherentData({ ...editAdherentData, type_cotisation: e.target.value as any })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                    <option value="EPARGNE">Épargne</option>
                    <option value="TONTINE">Tontine</option>
                    <option value="CREDIT">Crédit</option>
                    <option value="MIXTE">Mixte</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Statut</label>
                  <select value={editAdherentData.statut || 'ACTIF'} onChange={e => setEditAdherentData({ ...editAdherentData, statut: e.target.value as any })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                    <option value="ACTIF">Actif</option>
                    <option value="INACTIF">Inactif</option>
                    <option value="SUSPENDU">Suspendu</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Habituel (FCFA)</label>
                <input type="number" min="0" value={editAdherentData.montant_cotisation_habituel || 0} onChange={e => setEditAdherentData({ ...editAdherentData, montant_cotisation_habituel: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900" />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditAdherentModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200">Enregistrer les modifications</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Vue Fiche Adhérent */}
      {showViewAdherentModal && selectedAdherent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Fiche Adhérent</h3>
              <button onClick={() => setShowViewAdherentModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-700 uppercase">Identifiant</p>
                <p className="font-black text-indigo-900 font-mono">{selectedAdherent.numero_adherent || '—'}</p>
              </div>
              {([
                ['Nom Complet', `${selectedAdherent.prenom} ${selectedAdherent.nom}`],
                ['Téléphone', selectedAdherent.telephone],
                ['Adresse', selectedAdherent.adresse || '—'],
                ['Ville', selectedAdherent.ville || '—'],
                ['Type de Cotisation', selectedAdherent.type_cotisation],
                ['Montant Habituel', `${Number(selectedAdherent.montant_cotisation_habituel || 0).toLocaleString('fr-FR')} FCFA`],
                ['Périodicité', selectedAdherent.periodicite],
                ['Statut', selectedAdherent.statut],
                ['Depuis le', new Date(selectedAdherent.created_at).toLocaleDateString('fr-FR')]
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex items-start justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400 font-semibold">{label}</span>
                  <span className="font-bold text-slate-800 text-right max-w-[60%]">{val}</span>
                </div>
              ))}
              <div>
                <p className="text-slate-400 font-semibold mb-1">Agent(s) affecté(s)</p>
                {affectations.filter(af => af.adherent_id === selectedAdherent.id).length === 0 ? (
                  <p className="text-slate-300">Non affecté à un agent</p>
                ) : (
                  affectations
                    .filter(af => af.adherent_id === selectedAdherent.id)
                    .map(af => {
                      const ag = agents.find(a => a.id === af.agent_id)
                      return ag ? <p key={af.id} className="font-bold text-teal-700">{ag.nom_complet} — {ag.zone_collecte}</p> : null
                    })
                )}
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => { setShowViewAdherentModal(false); setEditAdherentData({ ...selectedAdherent }); setShowEditAdherentModal(true) }}
                className="px-4 py-2 rounded-xl font-bold bg-teal-50 text-teal-700 hover:bg-teal-100"
              >
                <Edit className="w-3.5 h-3.5 inline mr-1" />Modifier
              </button>
              <button onClick={() => setShowViewAdherentModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Affecter des Adhérents à l'Agent */}
      {showAffectModal && selectedAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Affecter des Adhérents</h3>
                <p className="text-xs text-slate-500">Agent : {selectedAgent.nom_complet}</p>
              </div>
              <button onClick={() => setShowAffectModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-slate-500">Sélectionnez les adhérents à affecter à cet agent pour ses tournées terrain. Cochez ceux qui doivent apparaître dans la feuille de tournée.</p>

            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrer les adhérents..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                onChange={e => setSearchAdherent(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {adherents.filter(a =>
                a.statut === 'ACTIF' &&
                (!searchAdherent || `${a.prenom} ${a.nom}`.toLowerCase().includes(searchAdherent.toLowerCase()) || a.telephone.includes(searchAdherent))
              ).map(adh => {
                const isChecked = selectedAgentsToAffect.includes(adh.id)
                return (
                  <label key={adh.id} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition ${isChecked ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedAgentsToAffect(prev => [...prev, adh.id])
                        } else {
                          setSelectedAgentsToAffect(prev => prev.filter(id => id !== adh.id))
                        }
                      }}
                      className="accent-indigo-600 w-4 h-4"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-slate-900">{adh.prenom} {adh.nom}</span>
                      <p className="text-[10px] text-slate-400">{adh.telephone} • {adh.type_cotisation} • {Number(adh.montant_cotisation_habituel || 0).toLocaleString('fr-FR')} F/{adh.periodicite.toLowerCase()}</p>
                    </div>
                    {isChecked && <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />}
                  </label>
                )
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">{selectedAgentsToAffect.length} adhérent(s) sélectionné(s)</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAffectModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button onClick={handleSaveAffectations} className="px-5 py-2 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200">Enregistrer les affectations</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Collecte Terrain */}
      {showCollecteModal && selectedAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Pointer une Collecte Terrain</h3>
                <p className="text-xs text-slate-500">Collecteur : {selectedAgent.nom_complet}</p>
              </div>
              <button onClick={() => setShowCollecteModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSaveCollecte} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adhérent *</label>
                <select
                  required
                  value={collecteForm.adherent_id}
                  onChange={e => {
                    const adh = adherents.find(a => a.id === e.target.value)
                    setCollecteForm({
                      ...collecteForm,
                      adherent_id: e.target.value,
                      montant: adh ? String(adh.montant_cotisation_habituel || '') : collecteForm.montant,
                      type_collecte: adh ? (adh.type_cotisation === 'TONTINE' ? 'TONTINE' : 'EPARGNE') : collecteForm.type_collecte
                    })
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="">Sélectionner l'adhérent visité...</option>
                  {/* Adhérents affectés en priorité */}
                  {adherentsAffectes.length > 0 && (
                    <optgroup label="Adhérents affectés à cet agent">
                      {adherentsAffectes.map(a => (
                        <option key={a.id} value={a.id}>{a.prenom} {a.nom} — {a.type_cotisation} {Number(a.montant_cotisation_habituel).toLocaleString('fr-FR')} F</option>
                      ))}
                    </optgroup>
                  )}
                  {/* Tous les adhérents actifs */}
                  <optgroup label="Tous les adhérents actifs">
                    {adherents.filter(a => a.statut === 'ACTIF' && !adherentsAffectes.find(af => af.id === a.id)).map(a => (
                      <option key={a.id} value={a.id}>{a.prenom} {a.nom} — {a.telephone}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type d'Opération</label>
                  <select value={collecteForm.type_collecte} onChange={e => setCollecteForm({ ...collecteForm, type_collecte: e.target.value as any })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                    <option value="EPARGNE">Dépôt Épargne</option>
                    <option value="TONTINE">Cotisation Tontine</option>
                    <option value="REMBOURSEMENT_CREDIT">Remboursement Prêt</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={collecteForm.montant}
                    onChange={e => setCollecteForm({ ...collecteForm, montant: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observation</label>
                <input type="text" placeholder="Ex: Tournée marché du matin..." value={collecteForm.observation} onChange={e => setCollecteForm({ ...collecteForm, observation: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>

              {/* Info plafond */}
              <div className={`text-[11px] font-semibold p-2 rounded-xl ${Number(selectedAgent.solde_especes_detenu) + Number(collecteForm.montant || 0) > Number(selectedAgent.plafond_especes) ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-teal-50 text-teal-700 border border-teal-100'}`}>
                Espèces après collecte : {(Number(selectedAgent.solde_especes_detenu) + Number(collecteForm.montant || 0)).toLocaleString('fr-FR')} / {Number(selectedAgent.plafond_especes).toLocaleString('fr-FR')} FCFA (plafond)
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowCollecteModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200">Valider la Collecte</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reversement */}
      {showReversementModal && selectedAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Déclarer un Versement Caisse</h3>
                <p className="text-xs text-slate-500">Collecteur : {selectedAgent.nom_complet}</p>
              </div>
              <button onClick={() => setShowReversementModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveReversement} className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <span className="text-[10px] font-bold text-amber-800 uppercase">Espèces Détenues en Poche</span>
                <div className="text-lg font-black text-amber-900">{Number(selectedAgent.solde_especes_detenu).toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Déclaré Déposé (FCFA) *</label>
                <input type="number" required min="500" value={revForm.montant_declare} onChange={e => setRevForm({ ...revForm, montant_declare: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Observation</label>
                <input type="text" placeholder="Ex: Fin de tournée Dantokpa..." value={revForm.observation} onChange={e => setRevForm({ ...revForm, observation: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none" />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowReversementModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200">Transmettre à la Caisse</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Validation Caissier */}
      {showValidateModal && selectedReversementToValidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Réceptionner en Caisse</h3>
                <p className="text-xs text-slate-500">{selectedReversementToValidate.agent_nom} ({selectedReversementToValidate.reference})</p>
              </div>
              <button onClick={() => setShowValidateModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleValidateReversement} className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Montant Déclaré par l'Agent</span>
                <div className="text-lg font-black text-slate-900">{Number(selectedReversementToValidate.montant_declare).toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Réel Compté en Caisse (FCFA) *</label>
                <input type="number" required min="0" value={valForm.montant_recu} onChange={e => setValForm({ ...valForm, montant_recu: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-emerald-700" />
              </div>
              {Number(valForm.montant_recu) !== Number(selectedReversementToValidate.montant_declare) && Number(valForm.montant_recu) > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 font-bold">
                  Écart : {(Number(valForm.montant_recu) - Number(selectedReversementToValidate.montant_declare)).toLocaleString('fr-FR')} FCFA
                </div>
              )}
              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowValidateModal(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200">Valider l'Encaissement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bordereau Clôture Tournée */}
      {clotureTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs font-mono">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h3 className="font-black text-slate-900 text-base">{company?.name || 'GESTIO IMF'}</h3>
              <p className="text-[10px] text-slate-500">BORDEREAU DE CLÔTURE DE TOURNÉE</p>
              <p className="text-[11px] font-bold text-indigo-700 mt-1">{clotureTicket.reference}</p>
            </div>
            <div className="space-y-1.5 text-slate-700">
              {([
                ['Date tournée', new Date(clotureTicket.date_tournee).toLocaleDateString('fr-FR')],
                ['Agent Collecteur', clotureTicket.agent_nom],
                ['Zone de tournée', clotureTicket.zone_collecte || 'Toutes zones'],
                ['Paiements pointés', `${clotureTicket.nb_paiements} reçus`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between"><span>{l}:</span><span className="font-bold">{v}</span></div>
              ))}
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 font-black text-sm text-slate-900">
                <span>TOTAL COLLECTÉ:</span>
                <span>{Number(clotureTicket.total_collecte).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between text-[11px] text-teal-700">
                <span>Commission Agent:</span>
                <span>-{Number(clotureTicket.commissions_agent).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between text-xs font-black text-emerald-700 border-t border-slate-200 pt-1">
                <span>NET REVERSÉ CAISSE:</span>
                <span>{Number(clotureTicket.montant_reverse_caisse).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
            <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-400">
              <p>Clôture validée par {clotureTicket.cloture_par || user?.full_name || 'Superviseur'}</p>
              <p className="mt-1 font-sans">Document conforme procédures SFD</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => window.print()} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 font-sans">
                <Printer className="w-4 h-4" /><span>Imprimer</span>
              </button>
              <button onClick={() => setClotureTicket(null)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl font-sans">Fermer</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default AgentsCollecteursPage
