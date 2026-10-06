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
  FileText
} from 'lucide-react'

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

interface CollecteTerrain {
  id: string
  reference: string
  agent_id: string
  agent_nom: string
  membre_id?: string
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

export const AgentsCollecteursPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<Agent[]>([])
  const [collectes, setCollectes] = useState<CollecteTerrain[]>([])
  const [reversements, setReversements] = useState<Reversement[]>([])
  const [membres, setMembres] = useState<any[]>([])

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'COLLECTES' | 'TOURNEE_JOUR' | 'CLOTURE_TOURNEE' | 'REVERSEMENTS' | 'COMMISSIONS'>('COLLECTES')
  const [tourneesClotures, setTourneesClotures] = useState<any[]>([])
  const [commissionsTMF, setCommissionsTMF] = useState<any[]>([])
  const [clotureTicket, setClotureTicket] = useState<any | null>(null)

  // Modals
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [showCollecteModal, setShowCollecteModal] = useState(false)
  const [showReversementModal, setShowReversementModal] = useState(false)
  const [showValidateModal, setShowValidateModal] = useState(false)
  const [selectedReversementToValidate, setSelectedReversementToValidate] = useState<Reversement | null>(null)

  // Formulaire Nouvel Agent
  const [newAgent, setNewAgent] = useState({
    nom_complet: '',
    telephone: '',
    email: '',
    zone_collecte: '',
    plafond_especes: '1000000',
    commission_taux_pct: '2'
  })

  // Formulaire Collecte Terrain
  const [collecteForm, setCollecteForm] = useState({
    membre_id: '',
    type_collecte: 'EPARGNE' as 'EPARGNE' | 'TONTINE' | 'REMBOURSEMENT_CREDIT',
    montant: '',
    observation: ''
  })

  // Formulaire Reversement Caisse
  const [revForm, setRevForm] = useState({
    montant_declare: '',
    observation: ''
  })

  // Formulaire Validation Caissier
  const [valForm, setValForm] = useState({
    montant_recu: '',
    observation: ''
  })

  // 1. Chargement
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [agRes, colRes, revRes, memRes, cloRes, comRes] = await Promise.all([
        supabaseTenant('microfinance_agents').select('*').order('nom_complet', { ascending: true }),
        supabaseTenant('microfinance_collectes_terrain').select('*').order('date_collecte', { ascending: false }).limit(100),
        supabaseTenant('microfinance_reversements_agents').select('*').order('date_declaration', { ascending: false }),
        supabaseTenant('microfinance_membres').select('id, nom_complet, telephone').eq('statut', 'ACTIF').order('nom_complet'),
        supabaseTenant('microfinance_tournees_clotures').select('*').order('date_tournee', { ascending: false }).limit(50),
        supabaseTenant('microfinance_commissions_tmf').select('*').order('created_at', { ascending: false }).limit(50)
      ])

      if (agRes.error) throw agRes.error
      if (colRes.error) throw colRes.error
      if (revRes.error) throw revRes.error
      if (memRes.error) throw memRes.error

      setAgents(agRes.data || [])
      setCollectes(colRes.data || [])
      setReversements(revRes.data || [])
      setMembres(memRes.data || [])
      setTourneesClotures(cloRes.data || [])
      setCommissionsTMF(comRes.data || [])

      if (agRes.data && agRes.data.length > 0) {
        if (!selectedAgent) {
          setSelectedAgent(agRes.data[0])
        } else {
          const refreshed = agRes.data.find((a: Agent) => a.id === selectedAgent.id)
          if (refreshed) setSelectedAgent(refreshed)
        }
      } else {
        setSelectedAgent(null)
      }
    } catch (err: any) {
      console.error('Erreur chargement agents:', err)
      toast.error('Erreur lors du chargement des agents')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast, selectedAgent])

  useEffect(() => {
    loadData()
  }, [companyId])

  // 2. Stats Globales Sécurité Espèces
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

    return {
      soldeDetenuTotal,
      collectesJourTotal,
      nbAgentsActifs,
      alertesPlafond
    }
  }, [agents])

  // 3. Création d'un Agent Collecteur
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgent.nom_complet || !newAgent.telephone || !newAgent.zone_collecte) {
      toast.error('Veuillez renseigner les champs requis')
      return
    }

    try {
      const matricule = `AGT-${Date.now().toString().slice(-4)}`
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
      setNewAgent({
        nom_complet: '',
        telephone: '',
        email: '',
        zone_collecte: '',
        plafond_especes: '1000000',
        commission_taux_pct: '2'
      })
      await loadData()
      setSelectedAgent(data)
    } catch (err: any) {
      console.error('Erreur création agent:', err)
      toast.error('Erreur lors de la création de l\'agent')
    }
  }

  // 4. Enregistrement d'une Collecte de Terrain
  const handleSaveCollecte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent) return
    const membre = membres.find(m => m.id === collecteForm.membre_id)
    if (!membre) {
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
      toast.error(
        `Plafond d'espèces dépassé (${selectedAgent.plafond_especes.toLocaleString(
          'fr-FR'
        )} FCFA). L'agent doit effectuer un versement en caisse.`
      )
      return
    }

    try {
      const ref = `COL-${Date.now().toString().slice(-6)}`
      const { error: colErr } = await supabaseTenant('microfinance_collectes_terrain').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        reference: ref,
        agent_id: selectedAgent.id,
        agent_nom: selectedAgent.nom_complet,
        membre_id: membre.id,
        membre_nom: membre.nom_complet,
        type_collecte: collecteForm.type_collecte,
        montant: montant,
        date_collecte: new Date().toISOString(),
        statut_reversement: 'NON_REVERSE',
        observation: collecteForm.observation
      })

      if (colErr) throw colErr

      // Mettre à jour le solde d'espèces détenu par l'agent
      await supabaseTenant('microfinance_agents')
        .update({
          solde_especes_detenu: nouveauSolde,
          total_collecte_jour: Number(selectedAgent.total_collecte_jour || 0) + montant
        })
        .eq('id', selectedAgent.id)

      toast.success('Collecte enregistrée ! Reçu émis.')
      setShowCollecteModal(false)
      setCollecteForm({
        membre_id: '',
        type_collecte: 'EPARGNE',
        montant: '',
        observation: ''
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur enregistrement collecte:', err)
      toast.error('Erreur lors de l\'enregistrement de la collecte')
    }
  }

  // 5. Déclaration de Reversement en Caisse par l'Agent
  const handleSaveReversement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent) return
    const montant = Number(revForm.montant_declare)
    if (!montant || montant <= 0) {
      toast.error('Veuillez saisir un montant')
      return
    }

    if (montant > Number(selectedAgent.solde_especes_detenu || 0)) {
      toast.error('Le montant déclaré dépasse les espèces détenues par l\'agent')
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
      console.error('Erreur déclaration versement:', err)
      toast.error('Erreur lors de la déclaration')
    }
  }

  // 6. Validation du Reversement par le Caissier
  const handleValidateReversement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedReversementToValidate) return

    const declare = Number(selectedReversementToValidate.montant_declare)
    const recu = Number(valForm.montant_recu)
    const ecart = recu - declare
    const statut = ecart === 0 ? 'VALIDE' : 'AVEC_ECART'

    try {
      // 1. Mettre à jour le reversement
      const { error: revErr } = await supabaseTenant('microfinance_reversements_agents')
        .update({
          montant_recu: recu,
          ecart: ecart,
          date_validation: new Date().toISOString(),
          caissier_nom: user?.full_name || user?.email || 'Caissier Principal',
          statut: statut,
          observation: valForm.observation || selectedReversementToValidate.observation
        })
        .eq('id', selectedReversementToValidate.id)

      if (revErr) throw revErr

      // 2. Déduire le montant reçu du solde d'espèces détenu par l'agent
      const agentTarget = agents.find(a => a.id === selectedReversementToValidate.agent_id)
      if (agentTarget) {
        const updatedSolde = Math.max(0, Number(agentTarget.solde_especes_detenu || 0) - recu)
        await supabaseTenant('microfinance_agents')
          .update({ solde_especes_detenu: updatedSolde })
          .eq('id', agentTarget.id)
      }

      toast.success(ecart === 0 ? 'Reversement validé avec succès !' : `Reversement validé avec un écart de ${ecart} FCFA`)
      setShowValidateModal(false)
      setSelectedReversementToValidate(null)
      setValForm({ montant_recu: '', observation: '' })
      await loadData()
    } catch (err: any) {
      console.error('Erreur validation caisse:', err)
      toast.error('Erreur lors de la validation')
    }
  }

  // 7. Clôture de Tournée Terrain
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

      // Enregistrer la commission
      await supabaseTenant('microfinance_commissions_tmf').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        agent_id: agent.id,
        agent_nom: agent.nom_complet,
        type_produit: 'COLLECTE_JOUR',
        base_calcul: totalCollecte,
        taux_commission: commRate,
        montant_commission: commissionsAgent,
        statut_paiement: 'A_PAYER'
      })

      // Réinitialiser la collecte du jour de l'agent
      await supabaseTenant('microfinance_agents')
        .update({
          total_collecte_jour: 0
        })
        .eq('id', agent.id)

      toast.success('Clôture de tournée enregistrée et bordereau généré !')
      setClotureTicket({
        ...clotureData,
        agent_matricule: agent.matricule,
        cloture_par: user?.full_name || user?.email || 'Superviseur Terrain'
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur clôture tournée:', err)
      toast.error('Erreur lors de la clôture de la tournée')
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">
      {/* 1. EN-TÊTE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Agents Collecteurs & Sécurité des Espèces
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Tournées terrain, plafonds de collecte, pointages & contrôle des reversements caisse
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
            onClick={() => setShowAddAgentModal(true)}
            className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-teal-200 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvel Agent Collecteur</span>
          </button>
        </div>
      </div>

      {/* 2. STATS CONTRÔLE ESPÈCES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Agents sur le Terrain</span>
            <Bike className="w-5 h-5 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.nbAgentsActifs}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Collecteurs actifs enregistrés</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Espèces Détenues en Poche</span>
            <DollarSign className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">
            {stats.soldeDetenuTotal.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Total espèces en circulation non reversé</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Collecte du Jour</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {stats.collectesJourTotal.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Cumul collecté sur la journée</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Alertes Plafond Risque</span>
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${stats.alertesPlafond > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats.alertesPlafond}
            </span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              agents
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Dépassement du seuil de trésorerie</p>
        </div>
      </div>

      {/* 3. VUE PRINCIPALE : AGENTS À GAUCHE / OPÉRATIONS & REVERSEMENTS À DROITE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLONNE GAUCHE : LISTE AGENTS (4 cols) */}
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
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">Chargement...</p>
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 p-6">
                <Bike className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Aucun agent collecteur</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Enregistrez vos agents de terrain pour suivre leurs collectes et leurs espèces.
                </p>
                <button
                  onClick={() => setShowAddAgentModal(true)}
                  className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-xl"
                >
                  + Nouvel Agent
                </button>
              </div>
            ) : (
              agents
                .filter(
                  a =>
                    a.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    a.zone_collecte.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    a.matricule.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map(a => {
                  const isSelected = selectedAgent?.id === a.id
                  const ratioPlafond = a.plafond_especes > 0 ? (a.solde_especes_detenu / a.plafond_especes) * 100 : 0
                  const isAlerte = a.solde_especes_detenu >= a.plafond_especes

                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAgent(a)}
                      className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-teal-50/60 border-teal-500 shadow-md ring-1 ring-teal-500'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                              {a.matricule}
                            </span>
                            <span className="text-xs font-black text-slate-900">{a.nom_complet}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{a.zone_collecte}</span>
                          </p>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-xs font-black ${
                              isAlerte ? 'text-rose-600 font-black' : 'text-slate-900'
                            }`}
                          >
                            {a.solde_especes_detenu.toLocaleString('fr-FR')} F
                          </span>
                          <p className="text-[10px] text-slate-400">en caisse mobile</p>
                        </div>
                      </div>

                      {/* Barre plafond de sécurité */}
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                          <span>Plafond: {a.plafond_especes.toLocaleString('fr-FR')} F</span>
                          <span className={isAlerte ? 'text-rose-600 font-black' : ''}>{ratioPlafond.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isAlerte ? 'bg-rose-500' : ratioPlafond > 70 ? 'bg-amber-500' : 'bg-teal-600'
                            }`}
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

        {/* COLONNE DROITE : DÉTAIL DE L'AGENT SÉLECTIONNÉ (8 cols) */}
        <div className="lg:col-span-8">
          {selectedAgent ? (
            <div className="space-y-4">
              {/* Carte En-tête Agent */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-teal-700 bg-teal-100 px-2.5 py-0.5 rounded-full">
                        {selectedAgent.matricule}
                      </span>
                      <h2 className="text-xl font-black text-slate-900">{selectedAgent.nom_complet}</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Zone: <span className="font-semibold text-slate-700">{selectedAgent.zone_collecte}</span> • Tél: {selectedAgent.telephone} • Com: {selectedAgent.commission_taux_pct}%
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCollecteModal(true)}
                      className="px-3.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-teal-200 flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Pointer Collecte</span>
                    </button>

                    <button
                      onClick={() => {
                        setRevForm({
                          montant_declare: selectedAgent.solde_especes_detenu.toString(),
                          observation: ''
                        })
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
                      title="Clôturer la journée et calculer les commissions"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Clôturer Tournée</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-teal-50/40 p-4 rounded-2xl border border-teal-100">
                  <div>
                    <span className="text-[10px] font-bold text-teal-800 uppercase">Espèces Détenues</span>
                    <div className="text-base font-black text-slate-900">
                      {selectedAgent.solde_especes_detenu.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-teal-800 uppercase">Plafond Autorisé</span>
                    <div className="text-base font-black text-slate-900">
                      {selectedAgent.plafond_especes.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-teal-800 uppercase">Collecte Jour</span>
                    <div className="text-base font-black text-emerald-600">
                      {Number(selectedAgent.total_collecte_jour).toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-teal-800 uppercase">Commissions Estimées</span>
                    <div className="text-base font-black text-teal-700">
                      {(
                        (Number(selectedAgent.total_collecte_jour || 0) * Number(selectedAgent.commission_taux_pct || 2)) /
                        100
                      ).toLocaleString('fr-FR')}{' '}
                      F
                    </div>
                  </div>
                </div>
              </div>

              {/* Barre d'onglets de l'agent */}
              <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto text-xs font-bold">
                <button
                  onClick={() => setActiveTab('COLLECTES')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                    activeTab === 'COLLECTES'
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Journal Collectes ({collectes.filter(c => c.agent_id === selectedAgent.id).length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('TOURNEE_JOUR')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                    activeTab === 'TOURNEE_JOUR'
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Tournée du Jour ({membres.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('CLOTURE_TOURNEE')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                    activeTab === 'CLOTURE_TOURNEE'
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Clôture Tournée ({tourneesClotures.filter(tc => tc.agent_id === selectedAgent.id).length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('REVERSEMENTS')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                    activeTab === 'REVERSEMENTS'
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Reversements Caisse ({reversements.filter(r => r.agent_id === selectedAgent.id).length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('COMMISSIONS')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0',
                    activeTab === 'COMMISSIONS'
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Commissions TMF</span>
                </button>
              </div>

              {/* ONGLET 1 : JOURNAL DES COLLECTES */}
              {activeTab === 'COLLECTES' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Dernières Collectes de l'Agent ({collectes.filter(c => c.agent_id === selectedAgent.id).length})
                      </span>
                    </div>
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
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              Aucune collecte pointée pour le moment.
                            </td>
                          </tr>
                        ) : (
                          collectes
                            .filter(c => c.agent_id === selectedAgent.id)
                            .map(c => (
                              <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3 font-mono font-bold text-teal-700">{c.reference}</td>
                                <td className="py-2.5 px-3 text-slate-500">
                                  {new Date(c.date_collecte).toLocaleTimeString('fr-FR', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-900">{c.membre_nom}</td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                    {c.type_collecte}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-emerald-600">
                                  +{c.montant.toLocaleString('fr-FR')} F
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span
                                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                      c.statut_reversement === 'REVERSE_VALIDE'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
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

              {/* ONGLET 2 : TOURNÉE DU JOUR & POINTAGE RAPIDE */}
              {activeTab === 'TOURNEE_JOUR' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Feuille de Tournée Terrain — Zone {selectedAgent.zone_collecte}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Pointez directement les passages chez les membres de la zone
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {membres.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">Aucun membre enregistré.</p>
                    ) : (
                      membres.slice(0, 15).map(m => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs hover:bg-white hover:border-slate-200 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                              👤
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">{m.nom_complet}</span>
                              <p className="text-[10px] text-slate-400">{m.telephone || 'Sans tél'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setCollecteForm({
                                  membre_id: m.id,
                                  type_collecte: 'EPARGNE',
                                  montant: '2000',
                                  observation: 'Collecte tournée terrain'
                                })
                                setShowCollecteModal(true)
                              }}
                              className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-xl text-xs transition"
                            >
                              + Encaisser Épargne
                            </button>
                            <button
                              onClick={() => {
                                setCollecteForm({
                                  membre_id: m.id,
                                  type_collecte: 'TONTINE',
                                  montant: '1000',
                                  observation: 'Mise Tontine Journalière'
                                })
                                setShowCollecteModal(true)
                              }}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition"
                            >
                              + Tontine
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ONGLET 3 : CLÔTURE DE TOURNÉE */}
              {activeTab === 'CLOTURE_TOURNEE' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Bilan Journalier de la Tournée Terrain
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Date: {new Date().toLocaleDateString('fr-FR')} • Agent: {selectedAgent.nom_complet}
                      </p>
                    </div>

                    <button
                      onClick={() => handleClotureTournee(selectedAgent)}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 flex items-center gap-2"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Valider la Clôture de Tournée</span>
                    </button>
                  </div>

                  {/* Synthèse Clôture */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Total Collecté Aujourd'hui</span>
                      <div className="text-lg font-black text-slate-900 mt-1">
                        {Number(selectedAgent.total_collecte_jour).toLocaleString('fr-FR')} FCFA
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {collectes.filter(c => c.agent_id === selectedAgent.id).length} reçus émis
                      </p>
                    </div>

                    <div className="p-4 bg-teal-50/60 rounded-2xl border border-teal-100">
                      <span className="text-[10px] uppercase font-bold text-teal-800">
                        Commission Agent ({selectedAgent.commission_taux_pct}%)
                      </span>
                      <div className="text-lg font-black text-teal-700 mt-1">
                        {(
                          (Number(selectedAgent.total_collecte_jour || 0) * Number(selectedAgent.commission_taux_pct || 2)) /
                          100
                        ).toLocaleString('fr-FR')}{' '}
                        FCFA
                      </div>
                      <p className="text-[10px] text-teal-600 mt-0.5">À déduire ou payer en fin de période</p>
                    </div>

                    <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                      <span className="text-[10px] uppercase font-bold text-emerald-800">Versement Net Caisse</span>
                      <div className="text-lg font-black text-emerald-700 mt-1">
                        {(
                          Number(selectedAgent.total_collecte_jour || 0) -
                          (Number(selectedAgent.total_collecte_jour || 0) * Number(selectedAgent.commission_taux_pct || 2)) / 100
                        ).toLocaleString('fr-FR')}{' '}
                        FCFA
                      </div>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Montant net attendu au guichet</p>
                    </div>
                  </div>

                  {/* Historique des Clôtures passées */}
                  <div className="pt-3">
                    <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                      Historique des Tournées Clôturées ({tourneesClotures.filter(tc => tc.agent_id === selectedAgent.id).length})
                    </h5>

                    {tourneesClotures.filter(tc => tc.agent_id === selectedAgent.id).length === 0 ? (
                      <p className="text-xs text-slate-400 py-3">Aucune clôture archivée pour cet agent.</p>
                    ) : (
                      <div className="space-y-2">
                        {tourneesClotures
                          .filter(tc => tc.agent_id === selectedAgent.id)
                          .map(tc => (
                            <div
                              key={tc.id}
                              className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-mono font-bold text-indigo-700">{tc.reference}</span>
                                <p className="text-[11px] text-slate-500">
                                  {new Date(tc.date_tournee).toLocaleDateString('fr-FR')} • {tc.nb_paiements} paiements
                                </p>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <span className="font-black text-slate-900">
                                    {Number(tc.total_collecte).toLocaleString('fr-FR')} F
                                  </span>
                                  <p className="text-[10px] text-teal-600">
                                    Com: {Number(tc.commissions_agent).toLocaleString('fr-FR')} F
                                  </p>
                                </div>
                                <button
                                  onClick={() => setClotureTicket(tc)}
                                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600"
                                  title="Imprimer Bordereau"
                                >
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

              {/* ONGLET 4 : REVERSEMENTS CAISSE & ÉCARTS */}
              {activeTab === 'REVERSEMENTS' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowDownLeft className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Reversements Caisse & Contrôle des Écarts ({reversements.filter(r => r.agent_id === selectedAgent.id).length})
                      </h4>
                    </div>
                  </div>

                  {reversements.filter(r => r.agent_id === selectedAgent.id).length === 0 ? (
                    <p className="text-xs text-slate-400 py-3">Aucun reversement enregistré pour cet agent.</p>
                  ) : (
                    <div className="space-y-2">
                      {reversements
                        .filter(r => r.agent_id === selectedAgent.id)
                        .map(r => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                                  r.statut === 'VALIDE'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : r.statut === 'DECLARE'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {r.statut === 'VALIDE' ? '✓' : '⏳'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-indigo-600">{r.reference}</span>
                                  <span
                                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                      r.statut === 'VALIDE'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : r.statut === 'DECLARE'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-rose-100 text-rose-700'
                                    }`}
                                  >
                                    {r.statut}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Déclaré: {Number(r.montant_declare).toLocaleString('fr-FR')} F • Le{' '}
                                  {new Date(r.date_declaration).toLocaleString('fr-FR')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-black text-slate-900">
                                  {Number(r.montant_recu || r.montant_declare).toLocaleString('fr-FR')} FCFA
                                </span>
                                {r.ecart !== 0 && (
                                  <p className={`text-[10px] font-bold ${r.ecart < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    Écart: {r.ecart > 0 ? `+${r.ecart}` : r.ecart} F
                                  </p>
                                )}
                              </div>

                              {r.statut === 'DECLARE' && (
                                <button
                                  onClick={() => {
                                    setSelectedReversementToValidate(r)
                                    setValForm({ montant_recu: r.montant_declare.toString(), observation: '' })
                                    setShowValidateModal(true)
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px]"
                                >
                                  Réceptionner en Caisse
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ONGLET 5 : COMMISSIONS TMF */}
              {activeTab === 'COMMISSIONS' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Award className="w-4 h-4 text-teal-600" />
                      État des Commissions Collecteur TMF
                    </h4>
                    <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-xl">
                      Taux contractuel : {selectedAgent.commission_taux_pct} %
                    </span>
                  </div>

                  {commissionsTMF.filter(cm => cm.agent_id === selectedAgent.id).length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Aucune commission enregistrée pour le moment. Elles sont générées lors des clôtures de tournée.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {commissionsTMF
                        .filter(cm => cm.agent_id === selectedAgent.id)
                        .map(cm => (
                          <div
                            key={cm.id}
                            className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-800">{cm.type_produit}</span>
                              <p className="text-[11px] text-slate-500">
                                Base de calcul : {Number(cm.base_calcul).toLocaleString('fr-FR')} F • Taux: {cm.taux_commission}%
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-teal-700">
                                +{Number(cm.montant_commission).toLocaleString('fr-FR')} FCFA
                              </span>
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
                Choisissez un agent de terrain pour suivre sa caisse mobile, valider ses reversements ou contrôler ses tournées.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1 : NOUVEL AGENT */}
      {showAddAgentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Enregistrer un Agent Collecteur</h3>
              <button
                onClick={() => setShowAddAgentModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom Complet *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: TOSSOU Marc"
                  value={newAgent.nom_complet}
                  onChange={e => setNewAgent({ ...newAgent, nom_complet: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone *</label>
                  <input
                    type="text"
                    required
                    placeholder="+229 ..."
                    value={newAgent.telephone}
                    onChange={e => setNewAgent({ ...newAgent, telephone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Zone de Collecte *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Dantokpa, Akpakpa..."
                    value={newAgent.zone_collecte}
                    onChange={e => setNewAgent({ ...newAgent, zone_collecte: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Plafond Espèces (FCFA)</label>
                  <input
                    type="number"
                    value={newAgent.plafond_especes}
                    onChange={e => setNewAgent({ ...newAgent, plafond_especes: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Taux Com. (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newAgent.commission_taux_pct}
                    onChange={e => setNewAgent({ ...newAgent, commission_taux_pct: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAgentModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200"
                >
                  Enregistrer Collecteur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2 : POINTER COLLECTE TERRAIN */}
      {showCollecteModal && selectedAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Pointer une Collecte Terrain</h3>
                <p className="text-xs text-slate-500">Collecteur: {selectedAgent.nom_complet}</p>
              </div>
              <button
                onClick={() => setShowCollecteModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCollecte} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adhérent *</label>
                <select
                  required
                  value={collecteForm.membre_id}
                  onChange={e => setCollecteForm({ ...collecteForm, membre_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="">Sélectionner l'adhérent visité...</option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nom_complet}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type d'Opération</label>
                  <select
                    value={collecteForm.type_collecte}
                    onChange={e => setCollecteForm({ ...collecteForm, type_collecte: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="EPARGNE">Dépôt Épargne</option>
                    <option value="TONTINE">Cotisation Tontine</option>
                    <option value="REMBOURSEMENT_CREDIT">Remboursement Prêt</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant Encaissé (FCFA) *</label>
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
                <input
                  type="text"
                  placeholder="Ex: Tournée marché du matin..."
                  value={collecteForm.observation}
                  onChange={e => setCollecteForm({ ...collecteForm, observation: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCollecteModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-200"
                >
                  Valider la Collecte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3 : DÉCLARATION REVERSEMENT */}
      {showReversementModal && selectedAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Déclarer un Versement Caisse</h3>
                <p className="text-xs text-slate-500">Collecteur: {selectedAgent.nom_complet}</p>
              </div>
              <button
                onClick={() => setShowReversementModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReversement} className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <span className="text-[10px] font-bold text-amber-800 uppercase">Espèces Détenues en Poche</span>
                <div className="text-lg font-black text-amber-900">
                  {selectedAgent.solde_especes_detenu.toLocaleString('fr-FR')} FCFA
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Déclaré Déposé (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="500"
                  value={revForm.montant_declare}
                  onChange={e => setRevForm({ ...revForm, montant_declare: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReversementModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200"
                >
                  Transmettre à la Caisse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4 : VALIDATION CAISSIER */}
      {showValidateModal && selectedReversementToValidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Réceptionner le Versement en Caisse</h3>
                <p className="text-xs text-slate-500">
                  {selectedReversementToValidate.agent_nom} ({selectedReversementToValidate.reference})
                </p>
              </div>
              <button
                onClick={() => setShowValidateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleValidateReversement} className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Montant Déclaré par l'Agent</span>
                <div className="text-lg font-black text-slate-900">
                  {Number(selectedReversementToValidate.montant_declare).toLocaleString('fr-FR')} FCFA
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Réel Compté en Caisse (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={valForm.montant_recu}
                  onChange={e => setValForm({ ...valForm, montant_recu: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-emerald-700"
                />
              </div>

              {Number(valForm.montant_recu) !== Number(selectedReversementToValidate.montant_declare) && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-[11px] font-bold">
                  Écart constaté :{' '}
                  {(
                    Number(valForm.montant_recu) - Number(selectedReversementToValidate.montant_declare)
                  ).toLocaleString('fr-FR')}{' '}
                  FCFA
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowValidateModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200"
                >
                  Valider l'Encaissement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BORDEREAU OFFICIEL DE CLÔTURE DE TOURNÉE */}
      {clotureTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs font-mono">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h3 className="font-black text-slate-900 text-base">{company?.name || 'GESTIO IMF'}</h3>
              <p className="text-[10px] text-slate-500">BORDEREAU DE CLÔTURE DE TOURNÉE</p>
              <p className="text-[11px] font-bold text-indigo-700 mt-1">{clotureTicket.reference}</p>
            </div>

            <div className="space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span>Date tournée:</span>
                <span>{new Date(clotureTicket.date_tournee).toLocaleDateString('fr-FR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Agent Collecteur:</span>
                <span className="font-bold">{clotureTicket.agent_nom}</span>
              </div>
              <div className="flex justify-between">
                <span>Zone de tournée:</span>
                <span>{clotureTicket.zone_collecte || 'Toutes zones'}</span>
              </div>
              <div className="flex justify-between">
                <span>Paiements pointés:</span>
                <span className="font-bold">{clotureTicket.nb_paiements} reçus</span>
              </div>
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
              <p className="mt-1 font-sans">Document conforme procédures de collecte terrain SFD</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 font-sans"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Bordereau</span>
              </button>
              <button
                onClick={() => setClotureTicket(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl font-sans"
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

export default AgentsCollecteursPage
