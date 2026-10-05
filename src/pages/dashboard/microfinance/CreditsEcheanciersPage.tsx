import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
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
  ChevronDown
} from 'lucide-react'

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

  // Modals
  const [showAddCreditModal, setShowAddCreditModal] = useState(false)
  const [showRemboursementModal, setShowRemboursementModal] = useState(false)
  const [selectedEcheance, setSelectedEcheance] = useState<Echeance | null>(null)
  const [lastRemboursementTicket, setLastRemboursementTicket] = useState<any | null>(null)

  // Formulaire Nouveau Crédit
  const [newCredit, setNewCredit] = useState({
    membre_id: '',
    objet_credit: '',
    activite_financee: '',
    montant_demande: '',
    montant_accorde: '',
    duree_mois: '12',
    periodicite: 'MENSUELLE',
    taux_interet: '12', // Taux annuel UEMOA
    frais_dossier: '0',
    garanties: '',
    caution_nom: '',
    caution_tel: '',
    agent_credit_nom: user?.name || 'Agent Crédit'
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

  // 2. Charger les échéances et remboursements d'un crédit spécifique
  const loadCreditDetails = async (creditId: string) => {
    try {
      const [echRes, rembRes] = await Promise.all([
        supabaseTenant('microfinance_credit_echeances')
          .select('*')
          .eq('credit_id', creditId)
          .order('numero_echeance', { ascending: true }),
        supabaseTenant('microfinance_credit_remboursements')
          .select('*')
          .eq('credit_id', creditId)
          .order('date_remboursement', { ascending: false })
      ])

      if (echRes.error) throw echRes.error
      if (rembRes.error) throw rembRes.error

      setEcheances(echRes.data || [])
      setRemboursements(rembRes.data || [])
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
          garanties: newCredit.garanties,
          caution_nom: newCredit.caution_nom,
          caution_tel: newCredit.caution_tel,
          statut: 'EN_COURS',
          date_demande: new Date().toISOString().slice(0, 10),
          date_approbation: new Date().toISOString().slice(0, 10),
          date_decaissement: new Date().toISOString().slice(0, 10),
          agent_credit_nom: newCredit.agent_credit_nom,
          valide_par: user?.name || 'Comité de Crédit'
        })
        .select()
        .single()

      if (creditErr) throw creditErr

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
        taux_interet: '12',
        frais_dossier: '0',
        garanties: '',
        caution_nom: '',
        caution_tel: '',
        agent_credit_nom: user?.name || 'Agent Crédit'
      })
      await loadData()
      handleSelectCredit(insertedCredit)
    } catch (err: any) {
      console.error('Erreur création crédit:', err)
      toast.error('Erreur lors de la création du crédit')
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
          recu_par: user?.name || 'Caissier Guichet',
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

              {/* Échéancier Détaillé */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Échéancier d'Amortissement ({echeances.length} mensualités)
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    Cliquez sur une échéance pour solder
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

              {/* Historique des remboursements du crédit */}
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
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs"
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

                        <div className="text-right">
                          <span className="font-black text-emerald-700">
                            +{r.montant_verse.toLocaleString('fr-FR')} FCFA
                          </span>
                          <p className="text-[10px] text-slate-400">
                            Cap: {r.ventilation_principal.toLocaleString('fr-FR')} | Int: {r.ventilation_interet.toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                <h3 className="text-base font-black text-slate-900">Octroi Nouveau Dossier de Crédit</h3>
              </div>
              <button
                onClick={() => setShowAddCreditModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCredit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Choix Membre */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Adhérent Emprunteur <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={newCredit.membre_id}
                  onChange={e => setNewCredit({ ...newCredit, membre_id: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Sélectionner un membre...</option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nom_complet} ({m.numero_membre}) - Solde Épargne: {Number(m.solde_epargne_total).toLocaleString('fr-FR')} F
                    </option>
                  ))}
                </select>
              </div>

              {/* Objet et Activité */}
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
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Secteur / Activité Financée</label>
                  <input
                    type="text"
                    placeholder="Ex: Commerce général, Maraîchage..."
                    value={newCredit.activite_financee}
                    onChange={e => setNewCredit({ ...newCredit, activite_financee: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
              </div>

              {/* Conditions Financières */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100">
                <div>
                  <label className="block font-bold text-indigo-900 mb-1">
                    Montant Accordé (FCFA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="10000"
                    placeholder="Ex: 500000"
                    value={newCredit.montant_accorde}
                    onChange={e => setNewCredit({ ...newCredit, montant_accorde: e.target.value })}
                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black text-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-indigo-900 mb-1">Durée (Mois)</label>
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
                <div>
                  <label className="block font-bold text-indigo-900 mb-1">Taux Annuel (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newCredit.taux_interet}
                    onChange={e => setNewCredit({ ...newCredit, taux_interet: e.target.value })}
                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Garanties et Cautions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Garanties Matérielles</label>
                  <input
                    type="text"
                    placeholder="Ex: Titre foncier, Moto Sanili, Stock boutique..."
                    value={newCredit.garanties}
                    onChange={e => setNewCredit({ ...newCredit, garanties: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Caution Solidaire (Nom & Tél)</label>
                  <input
                    type="text"
                    placeholder="Ex: KOFFI Paul (+229 97 00 00 00)"
                    value={newCredit.caution_nom}
                    onChange={e => setNewCredit({ ...newCredit, caution_nom: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-slate-500 font-semibold">Total à rembourser estimé :</span>
                  <div className="text-base font-black text-indigo-700">
                    {(
                      (Number(newCredit.montant_accorde) || 0) +
                      ((Number(newCredit.montant_accorde) || 0) * (Number(newCredit.taux_interet) || 12) * (Number(newCredit.duree_mois) || 12)) / 1200
                    ).toLocaleString('fr-FR')}{' '}
                    FCFA
                  </div>
                </div>
                <span className="text-[11px] font-bold text-slate-400">Échéancier généré automatiquement</span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCreditModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                >
                  Valider & Décaisser le Prêt
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
    </div>
  )
}

export default CreditsEcheanciersPage
