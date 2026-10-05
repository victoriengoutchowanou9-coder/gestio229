import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  Users2,
  Plus,
  RefreshCw,
  Search,
  Calendar,
  DollarSign,
  Award,
  CheckCircle2,
  Clock,
  ArrowRight,
  Printer,
  X,
  Layers,
  Sparkles,
  PiggyBank
} from 'lucide-react'

interface TontineGroupe {
  id: string
  code_groupe: string
  nom_groupe: string
  responsable_nom: string
  responsable_tel?: string
  periodicite: 'QUOTIDIENNE' | 'HEBDOMADAIRE' | 'MENSUELLE'
  montant_mise: number
  nb_membres_max: number
  statut: 'ACTIF' | 'EN_FORMATION' | 'CLOTURE'
  notes?: string
  created_at: string
}

interface TontineCycle {
  id: string
  groupe_id: string
  groupe_nom: string
  numero_cycle: number
  date_debut: string
  date_fin?: string
  montant_mise: number
  cagnotte_par_tour: number
  tour_actuel: number
  nb_tours_total: number
  montant_collecte_cumul: number
  statut: 'EN_COURS' | 'CLOTURE' | 'PLANIFIE'
}

interface TontineCotisation {
  id: string
  reference: string
  cycle_id: string
  groupe_id?: string
  membre_id?: string
  membre_nom: string
  date_cotisation: string
  montant: number
  tour_numero: number
  statut: 'PAYE' | 'EN_ATTENTE' | 'RETARD'
  agent_collecteur_nom?: string
}

interface TontineDecaissement {
  id: string
  reference: string
  cycle_id: string
  groupe_id?: string
  beneficiaire_id?: string
  beneficiaire_nom: string
  tour_numero: number
  montant_brut: number
  deductions_penalites: number
  montant_net_verse: number
  date_versement: string
  valide_par?: string
}

export const TontinesCyclesPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [groupes, setGroupes] = useState<TontineGroupe[]>([])
  const [cycles, setCycles] = useState<TontineCycle[]>([])
  const [membres, setMembres] = useState<any[]>([])

  const [selectedCycle, setSelectedCycle] = useState<TontineCycle | null>(null)
  const [cotisations, setCotisations] = useState<TontineCotisation[]>([])
  const [decaissements, setDecaissements] = useState<TontineDecaissement[]>([])

  // Filtres
  const [searchTerm, setSearchTerm] = useState('')

  // Modals
  const [showAddGroupeModal, setShowAddGroupeModal] = useState(false)
  const [showAddCycleModal, setShowAddCycleModal] = useState(false)
  const [showCotisationModal, setShowCotisationModal] = useState(false)
  const [showDecaissementModal, setShowDecaissementModal] = useState(false)
  const [lastTicket, setLastTicket] = useState<any | null>(null)

  // Forms
  const [newGroupe, setNewGroupe] = useState({
    nom_groupe: '',
    responsable_nom: '',
    responsable_tel: '',
    periodicite: 'QUOTIDIENNE' as 'QUOTIDIENNE' | 'HEBDOMADAIRE' | 'MENSUELLE',
    montant_mise: '1000',
    nb_membres_max: '30',
    notes: ''
  })

  const [newCycle, setNewCycle] = useState({
    groupe_id: '',
    date_debut: new Date().toISOString().slice(0, 10),
    nb_tours_total: '12'
  })

  const [cotisationForm, setCotisationForm] = useState({
    membre_id: '',
    montant: '',
    tour_numero: '1',
    agent_collecteur_nom: user?.name || 'Agent Tontine'
  })

  const [decaissementForm, setDecaissementForm] = useState({
    beneficiaire_id: '',
    tour_numero: '1',
    deductions: '0'
  })

  // 1. Chargement initial
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [groupesRes, cyclesRes, membresRes] = await Promise.all([
        supabaseTenant('tontine_groupes').select('*').order('created_at', { ascending: false }),
        supabaseTenant('tontine_cycles').select('*').order('created_at', { ascending: false }),
        supabaseTenant('microfinance_membres').select('id, nom_complet, telephone').eq('statut', 'ACTIF').order('nom_complet')
      ])

      if (groupesRes.error) throw groupesRes.error
      if (cyclesRes.error) throw cyclesRes.error
      if (membresRes.error) throw membresRes.error

      setGroupes(groupesRes.data || [])
      setCycles(cyclesRes.data || [])
      setMembres(membresRes.data || [])

      // Restaurer ou sélectionner premier cycle actif
      if (cyclesRes.data && cyclesRes.data.length > 0) {
        const toSelect = selectedCycle
          ? cyclesRes.data.find((c: TontineCycle) => c.id === selectedCycle.id) || cyclesRes.data[0]
          : cyclesRes.data[0]
        setSelectedCycle(toSelect)
        loadCycleDetails(toSelect.id)
      } else {
        setSelectedCycle(null)
      }
    } catch (err: any) {
      console.error('Erreur chargement tontines:', err)
      toast.error('Erreur lors du chargement des tontines')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast, selectedCycle])

  useEffect(() => {
    loadData()
  }, [companyId])

  // 2. Charger les cotisations et décaissements du cycle sélectionné
  const loadCycleDetails = async (cycleId: string) => {
    try {
      const [cotRes, decRes] = await Promise.all([
        supabaseTenant('tontine_cotisations').select('*').eq('cycle_id', cycleId).order('date_cotisation', { ascending: false }),
        supabaseTenant('tontine_decaissements').select('*').eq('cycle_id', cycleId).order('date_versement', { ascending: false })
      ])

      if (cotRes.error) throw cotRes.error
      if (decRes.error) throw decRes.error

      setCotisations(cotRes.data || [])
      setDecaissements(decRes.data || [])
    } catch (err: any) {
      console.error('Erreur chargement détails cycle:', err)
    }
  }

  const handleSelectCycle = (cycle: TontineCycle) => {
    setSelectedCycle(cycle)
    loadCycleDetails(cycle.id)
  }

  // 3. Statistiques Globales Tontine
  const stats = useMemo(() => {
    let cagnotteTotale = 0
    let cotisationsCumul = 0
    let nbGroupesActifs = groupes.filter(g => g.statut === 'ACTIF').length
    let nbCyclesEnCours = cycles.filter(c => c.statut === 'EN_COURS').length

    cycles.forEach(c => {
      cagnotteTotale += Number(c.cagnotte_par_tour || 0)
      cotisationsCumul += Number(c.montant_collecte_cumul || 0)
    })

    return {
      cagnotteTotale,
      cotisationsCumul,
      nbGroupesActifs,
      nbCyclesEnCours
    }
  }, [groupes, cycles])

  // 4. Création Groupe de Tontine
  const handleCreateGroupe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupe.nom_groupe || !newGroupe.montant_mise) {
      toast.error('Veuillez renseigner le nom et la mise')
      return
    }

    try {
      const code = `GRP-${Date.now().toString().slice(-5)}`
      const { data: grpData, error } = await supabaseTenant('tontine_groupes')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          code_groupe: code,
          nom_groupe: newGroupe.nom_groupe,
          responsable_nom: newGroupe.responsable_nom || 'Responsable Groupe',
          responsable_tel: newGroupe.responsable_tel,
          periodicite: newGroupe.periodicite,
          montant_mise: Number(newGroupe.montant_mise),
          nb_membres_max: Number(newGroupe.nb_membres_max) || 30,
          statut: 'ACTIF',
          notes: newGroupe.notes
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Groupe de tontine créé avec succès !')
      setShowAddGroupeModal(false)
      setNewGroupe({
        nom_groupe: '',
        responsable_nom: '',
        responsable_tel: '',
        periodicite: 'QUOTIDIENNE',
        montant_mise: '1000',
        nb_membres_max: '30',
        notes: ''
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur création groupe:', err)
      toast.error('Erreur lors de la création du groupe')
    }
  }

  // 5. Lancer un Nouveau Cycle de Tontine
  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault()
    const groupe = groupes.find(g => g.id === newCycle.groupe_id)
    if (!groupe) {
      toast.error('Veuillez sélectionner un groupe')
      return
    }

    const nbTours = Number(newCycle.nb_tours_total) || 12
    const cagnotteTour = Number(groupe.montant_mise) * nbTours

    try {
      const { data: cycleData, error } = await supabaseTenant('tontine_cycles')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          groupe_id: groupe.id,
          groupe_nom: groupe.nom_groupe,
          numero_cycle: 1,
          date_debut: newCycle.date_debut,
          montant_mise: groupe.montant_mise,
          cagnotte_par_tour: cagnotteTour,
          tour_actuel: 1,
          nb_tours_total: nbTours,
          montant_collecte_cumul: 0,
          statut: 'EN_COURS'
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Nouveau cycle de tontine démarré !')
      setShowAddCycleModal(false)
      await loadData()
      handleSelectCycle(cycleData)
    } catch (err: any) {
      console.error('Erreur démarrage cycle:', err)
      toast.error('Erreur lors du lancement du cycle')
    }
  }

  // 6. Enregistrer une Cotisation
  const handleSaveCotisation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCycle) return
    const membre = membres.find(m => m.id === cotisationForm.membre_id)
    if (!membre) {
      toast.error('Veuillez sélectionner un adhérent')
      return
    }

    const montant = Number(cotisationForm.montant) || Number(selectedCycle.montant_mise)
    const ref = `COT-${Date.now().toString().slice(-6)}`

    try {
      const { data: cotData, error } = await supabaseTenant('tontine_cotisations')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          reference: ref,
          cycle_id: selectedCycle.id,
          groupe_id: selectedCycle.groupe_id,
          membre_id: membre.id,
          membre_nom: membre.nom_complet,
          date_cotisation: new Date().toISOString().slice(0, 10),
          montant: montant,
          tour_numero: Number(cotisationForm.tour_numero) || selectedCycle.tour_actuel,
          statut: 'PAYE',
          agent_collecteur_nom: cotisationForm.agent_collecteur_nom
        })
        .select()
        .single()

      if (error) throw error

      // Mettre à jour cumul collecté sur le cycle
      const newCumul = Number(selectedCycle.montant_collecte_cumul || 0) + montant
      await supabaseTenant('tontine_cycles')
        .update({ montant_collecte_cumul: newCumul })
        .eq('id', selectedCycle.id)

      toast.success('Mise encaissée avec succès !')
      setLastTicket({
        ...cotData,
        type: 'COTISATION',
        groupe_nom: selectedCycle.groupe_nom,
        cagnotte: selectedCycle.cagnotte_par_tour
      })
      setShowCotisationModal(false)
      await loadData()
      loadCycleDetails(selectedCycle.id)
    } catch (err: any) {
      console.error('Erreur cotisation:', err)
      toast.error('Erreur lors de la cotisation')
    }
  }

  // 7. Décaisser la Cagnotte au Bénéficiaire du Tour
  const handleSaveDecaissement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCycle) return
    const beneficiaire = membres.find(m => m.id === decaissementForm.beneficiaire_id)
    if (!beneficiaire) {
      toast.error('Veuillez sélectionner un bénéficiaire')
      return
    }

    const brut = Number(selectedCycle.cagnotte_par_tour)
    const dedu = Number(decaissementForm.deductions) || 0
    const net = brut - dedu
    const ref = `TDEC-${Date.now().toString().slice(-6)}`

    try {
      const { data: decData, error } = await supabaseTenant('tontine_decaissements')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          reference: ref,
          cycle_id: selectedCycle.id,
          groupe_id: selectedCycle.groupe_id,
          beneficiaire_id: beneficiaire.id,
          beneficiaire_nom: beneficiaire.nom_complet,
          tour_numero: Number(decaissementForm.tour_numero) || selectedCycle.tour_actuel,
          montant_brut: brut,
          deductions_penalites: dedu,
          montant_net_verse: net,
          date_versement: new Date().toISOString().slice(0, 10),
          valide_par: user?.name || 'Responsable Tontine'
        })
        .select()
        .single()

      if (error) throw error

      // Incrémenter tour du cycle si possible
      const nextTour = Math.min(selectedCycle.nb_tours_total, selectedCycle.tour_actuel + 1)
      const nextStatut = selectedCycle.tour_actuel >= selectedCycle.nb_tours_total ? 'CLOTURE' : 'EN_COURS'

      await supabaseTenant('tontine_cycles')
        .update({ tour_actuel: nextTour, statut: nextStatut })
        .eq('id', selectedCycle.id)

      toast.success('Cagnotte décaissée avec succès au bénéficiaire !')
      setLastTicket({
        ...decData,
        type: 'DECAISSEMENT',
        groupe_nom: selectedCycle.groupe_nom
      })
      setShowDecaissementModal(false)
      await loadData()
      loadCycleDetails(selectedCycle.id)
    } catch (err: any) {
      console.error('Erreur décaissement cagnotte:', err)
      toast.error('Erreur lors du versement de la cagnotte')
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">
      {/* 1. EN-TÊTE PROFESSIONNEL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <PiggyBank className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Tontines Mutuelles & Gestion des Cycles
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Groupes d'épargne rotative, cotisations périodiques & attribution des cagnottes
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
            onClick={() => setShowAddGroupeModal(true)}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <Users2 className="w-4 h-4" />
            <span>Nouveau Groupe</span>
          </button>

          <button
            onClick={() => setShowAddCycleModal(true)}
            className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-amber-200 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Lancer un Cycle</span>
          </button>
        </div>
      </div>

      {/* 2. STATS CLÉS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Groupes Actifs</span>
            <Users2 className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.nbGroupesActifs}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Communautés mutualistes enregistrées</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Cycles Ouverts</span>
            <Layers className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600">{stats.nbCyclesEnCours}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Rotations actives en cours</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Cumul Cotisé</span>
            <DollarSign className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {stats.cotisationsCumul.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Mises encaissées sur tous les cycles</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Cagnottes Prévues</span>
            <Sparkles className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.cagnotteTotale.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Volume rotatif par tour de table</p>
        </div>
      </div>

      {/* 3. STRUCTURE DE NAVIGATION PAR CYCLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLONNE GAUCHE : LISTE DES CYCLES (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-slate-900">Cycles de Tontine</span>
              <span className="text-xs font-bold text-slate-400">{cycles.length}</span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher groupe..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">Chargement...</p>
              </div>
            ) : cycles.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 p-6">
                <PiggyBank className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Aucun cycle actif</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Créez un groupe puis lancez votre premier cycle de tontine.
                </p>
                <button
                  onClick={() => setShowAddCycleModal(true)}
                  className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl"
                >
                  + Lancer un Cycle
                </button>
              </div>
            ) : (
              cycles
                .filter(c => c.groupe_nom.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(c => {
                  const isSelected = selectedCycle?.id === c.id
                  const progressPct = c.nb_tours_total > 0 ? (c.tour_actuel / c.nb_tours_total) * 100 : 0

                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCycle(c)}
                      className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-50/60 border-amber-500 shadow-md ring-1 ring-amber-500'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Cycle n°{c.numero_cycle}
                            </span>
                            <span className="text-xs font-black text-slate-900">{c.groupe_nom}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Mise : <span className="font-bold text-slate-800">{c.montant_mise.toLocaleString('fr-FR')} F</span>
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-600">
                            {c.cagnotte_par_tour.toLocaleString('fr-FR')} F
                          </span>
                          <p className="text-[10px] text-slate-400">par tour</p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                          <span>Tour {c.tour_actuel} / {c.nb_tours_total}</span>
                          <span>{progressPct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>

        {/* COLONNE DROITE : DÉTAIL DU CYCLE SÉLECTIONNÉ (8 cols) */}
        <div className="lg:col-span-8">
          {selectedCycle ? (
            <div className="space-y-4">
              {/* Carte En-tête du Cycle */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {selectedCycle.statut}
                      </span>
                      <h2 className="text-xl font-black text-slate-900">{selectedCycle.groupe_nom}</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Démarré le {new Date(selectedCycle.date_debut).toLocaleDateString('fr-FR')} • Cycle n°{selectedCycle.numero_cycle}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCotisationForm({
                          ...cotisationForm,
                          montant: selectedCycle.montant_mise.toString(),
                          tour_numero: selectedCycle.tour_actuel.toString()
                        })
                        setShowCotisationModal(true)
                      }}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-200 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Encaisser Cotisation</span>
                    </button>

                    <button
                      onClick={() => {
                        setDecaissementForm({
                          beneficiaire_id: '',
                          tour_numero: selectedCycle.tour_actuel.toString(),
                          deductions: '0'
                        })
                        setShowDecaissementModal(true)
                      }}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-200 flex items-center gap-2"
                    >
                      <Award className="w-4 h-4" />
                      <span>Attribuer Cagnotte</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Mise Individuelle</span>
                    <div className="text-sm font-black text-slate-900">
                      {selectedCycle.montant_mise.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Tour Actuel</span>
                    <div className="text-sm font-black text-amber-700">
                      {selectedCycle.tour_actuel} / {selectedCycle.nb_tours_total}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Cagnotte du Tour</span>
                    <div className="text-sm font-black text-emerald-600">
                      {selectedCycle.cagnotte_par_tour.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Cumul Encaissé</span>
                    <div className="text-sm font-black text-slate-900">
                      {Number(selectedCycle.montant_collecte_cumul).toLocaleString('fr-FR')} F
                    </div>
                  </div>
                </div>
              </div>

              {/* Tableau des Cotisations Récentes */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Mises et Cotisations Encaissées ({cotisations.length})
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-3">Réf</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Adhérent</th>
                        <th className="py-3 px-3 text-center">Tour</th>
                        <th className="py-3 px-3 text-right">Montant</th>
                        <th className="py-3 px-3">Collecteur</th>
                        <th className="py-3 px-3 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {cotisations.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Aucune cotisation encaissée pour ce cycle.
                          </td>
                        </tr>
                      ) : (
                        cotisations.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{c.reference}</td>
                            <td className="py-2.5 px-3 text-slate-600">{new Date(c.date_cotisation).toLocaleDateString('fr-FR')}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{c.membre_nom}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-600">N°{c.tour_numero}</td>
                            <td className="py-2.5 px-3 text-right font-black text-emerald-600">
                              +{c.montant.toLocaleString('fr-FR')} F
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">{c.agent_collecteur_nom || 'Guichet'}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                {c.statut}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historique des Décaissements / Cagnottes Versées */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Bénéficiaires des Cagnottes du Cycle ({decaissements.length})
                  </h4>
                </div>

                {decaissements.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3">Aucune cagnotte versée pour l'instant.</p>
                ) : (
                  <div className="space-y-2">
                    {decaissements.map(d => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/50 border border-amber-100 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black">
                            {d.tour_numero}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 text-sm">{d.beneficiaire_nom}</span>
                            <p className="text-[11px] text-slate-500">
                              Tour n°{d.tour_numero} • Versé le {new Date(d.date_versement).toLocaleDateString('fr-FR')} • Réf: {d.reference}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-black text-emerald-700">
                            {d.montant_net_verse.toLocaleString('fr-FR')} FCFA
                          </div>
                          {d.deductions_penalites > 0 && (
                            <span className="text-[10px] text-rose-500">
                              (Retenue: {d.deductions_penalites.toLocaleString('fr-FR')} F)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
              <PiggyBank className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-800">Sélectionnez un cycle de tontine</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Choisissez un groupe dans la colonne de gauche pour enregistrer les cotisations ou attribuer la cagnotte au bénéficiaire du tour.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1 : CRÉATION GROUPE */}
      {showAddGroupeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Créer un Groupe de Tontine</h3>
              <button
                onClick={() => setShowAddGroupeModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroupe} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom du Groupe *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tontine Femmes Solidaires Dantokpa"
                  value={newGroupe.nom_groupe}
                  onChange={e => setNewGroupe({ ...newGroupe, nom_groupe: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Responsable</label>
                  <input
                    type="text"
                    placeholder="Mme BOKO"
                    value={newGroupe.responsable_nom}
                    onChange={e => setNewGroupe({ ...newGroupe, responsable_nom: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    placeholder="+229 ..."
                    value={newGroupe.responsable_tel}
                    onChange={e => setNewGroupe({ ...newGroupe, responsable_tel: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Périodicité</label>
                  <select
                    value={newGroupe.periodicite}
                    onChange={e => setNewGroupe({ ...newGroupe, periodicite: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="QUOTIDIENNE">Quotidienne</option>
                    <option value="HEBDOMADAIRE">Hebdomadaire</option>
                    <option value="MENSUELLE">Mensuelle</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mise (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={newGroupe.montant_mise}
                    onChange={e => setNewGroupe({ ...newGroupe, montant_mise: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddGroupeModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200"
                >
                  Enregistrer Groupe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2 : NOUVEAU CYCLE */}
      {showAddCycleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Démarrer un Cycle de Tontine</h3>
              <button
                onClick={() => setShowAddCycleModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCycle} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Sélectionner le Groupe *</label>
                <select
                  required
                  value={newCycle.groupe_id}
                  onChange={e => setNewCycle({ ...newCycle, groupe_id: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="">Choisir un groupe...</option>
                  {groupes.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.nom_groupe} (Mise: {Number(g.montant_mise).toLocaleString('fr-FR')} F - {g.periodicite})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nombre de Tours *</label>
                  <input
                    type="number"
                    required
                    min="2"
                    max="100"
                    value={newCycle.nb_tours_total}
                    onChange={e => setNewCycle({ ...newCycle, nb_tours_total: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date Démarrage</label>
                  <input
                    type="date"
                    value={newCycle.date_debut}
                    onChange={e => setNewCycle({ ...newCycle, date_debut: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCycleModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200"
                >
                  Lancer le Cycle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3 : ENCAISSER COTISATION */}
      {showCotisationModal && selectedCycle && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Encaisser une Cotisation</h3>
                <p className="text-xs text-slate-500">{selectedCycle.groupe_nom}</p>
              </div>
              <button
                onClick={() => setShowCotisationModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCotisation} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adhérent Cotisant *</label>
                <select
                  required
                  value={cotisationForm.membre_id}
                  onChange={e => setCotisationForm({ ...cotisationForm, membre_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="">Sélectionner un membre...</option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nom_complet} ({m.telephone || 'Sans tél'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant Mise (FCFA) *</label>
                  <input
                    type="number"
                    required
                    value={cotisationForm.montant}
                    onChange={e => setCotisationForm({ ...cotisationForm, montant: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Numéro du Tour</label>
                  <input
                    type="number"
                    value={cotisationForm.tour_numero}
                    onChange={e => setCotisationForm({ ...cotisationForm, tour_numero: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCotisationModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200"
                >
                  Valider Cotisation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4 : ATTRIBUER CAGNOTTE */}
      {showDecaissementModal && selectedCycle && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Attribuer la Cagnotte du Tour</h3>
                <p className="text-xs text-slate-500">
                  {selectedCycle.groupe_nom} - Tour n°{selectedCycle.tour_actuel}
                </p>
              </div>
              <button
                onClick={() => setShowDecaissementModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDecaissement} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Bénéficiaire du Tour *</label>
                <select
                  required
                  value={decaissementForm.beneficiaire_id}
                  onChange={e => setDecaissementForm({ ...decaissementForm, beneficiaire_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="">Sélectionner l'adhérent qui prend la main...</option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nom_complet}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <span className="text-[10px] font-bold text-amber-800 uppercase">Cagnotte Brute Prévue</span>
                <div className="text-lg font-black text-emerald-700">
                  {selectedCycle.cagnotte_par_tour.toLocaleString('fr-FR')} FCFA
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Déductions / Retenues de gestion (FCFA)</label>
                <input
                  type="number"
                  value={decaissementForm.deductions}
                  onChange={e => setDecaissementForm({ ...decaissementForm, deductions: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDecaissementModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-200"
                >
                  Décaisser la Cagnotte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5 : TICKET IMPRIMABLE */}
      {lastTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs font-mono">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h3 className="font-black text-slate-900 text-base">{company?.name || 'GESTIO TONTINE'}</h3>
              <p className="text-[10px] text-slate-500 uppercase font-sans">
                {lastTicket.type === 'COTISATION' ? 'REÇU COTISATION TONTINE' : 'REÇU DÉCAISSEMENT CAGNOTTE'}
              </p>
              <p className="text-[11px] font-bold text-amber-700 mt-1">{lastTicket.reference}</p>
            </div>

            <div className="space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span>Groupe:</span>
                <span className="font-bold">{lastTicket.groupe_nom}</span>
              </div>
              <div className="flex justify-between">
                <span>Adhérent:</span>
                <span className="font-bold">{lastTicket.membre_nom || lastTicket.beneficiaire_nom}</span>
              </div>
              <div className="flex justify-between">
                <span>Tour N°:</span>
                <span>{lastTicket.tour_numero}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 font-black text-sm text-slate-900">
                <span>MONTANT:</span>
                <span>
                  {Number(lastTicket.montant || lastTicket.montant_net_verse).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 font-sans"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer</span>
              </button>
              <button
                onClick={() => setLastTicket(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl font-sans"
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

export default TontinesCyclesPage
