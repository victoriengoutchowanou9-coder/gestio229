import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import clsx from 'clsx'
import {
  Landmark,
  Wallet,
  Smartphone,
  ArrowRightLeft,
  Plus,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  X,
  CreditCard,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  FileText
} from 'lucide-react'

interface TresorerieCompte {
  id: string
  company_id: string
  sector_slug: string
  type_compte: 'CAISSE_CENTRALE' | 'CAISSE_AGENCE' | 'BANQUE' | 'MOBILE_MONEY'
  code_compte: string
  libelle: string
  numero_compte?: string
  etablissement?: string
  solde_initial: number
  solde_actuel: number
  devise: string
  est_actif: boolean
  created_at: string
}

interface RecetteAdministrative {
  id: string
  reference: string
  membre_id?: string
  membre_nom?: string
  type_recette: 'ADHESION' | 'FRAIS_CARTE' | 'TENUE_COMPTE' | 'FRAIS_DOSSIER_CREDIT' | 'FRAIS_RETRAIT' | 'FRAIS_TRANSFERT' | 'AUTRES_RECETTES'
  montant: number
  mode_paiement: 'ESPECES' | 'MTN_MOMO' | 'MOOV_MONEY' | 'BANQUE' | 'COMPTE_EPARGNE'
  compte_tresorerie_nom?: string
  agent_nom?: string
  statut: 'ENCAISSE' | 'EN_ATTENTE' | 'ANNULE'
  observation?: string
  created_at: string
}

interface TransfertInterne {
  id: string
  reference: string
  compte_source_id?: string
  compte_source_nom: string
  compte_dest_id?: string
  compte_dest_nom: string
  montant: number
  frais_transfert: number
  date_transfert: string
  motif?: string
  initiateur_nom?: string
  statut: 'VALIDE' | 'EN_ATTENTE' | 'ANNULE'
  created_at: string
}

export const MicrofinanceTresoreriePage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'COMPTES' | 'RECETTES' | 'TRANSFERTS'>('COMPTES')

  // Données
  const [comptes, setComptes] = useState<TresorerieCompte[]>([])
  const [recettes, setRecettes] = useState<RecetteAdministrative[]>([])
  const [transferts, setTransferts] = useState<TransfertInterne[]>([])
  const [membres, setMembres] = useState<any[]>([])

  // Filtres
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTypeRecette, setFilterTypeRecette] = useState('ALL')

  // Modals
  const [showAddCompteModal, setShowAddCompteModal] = useState(false)
  const [showAddRecetteModal, setShowAddRecetteModal] = useState(false)
  const [showTransfertModal, setShowTransfertModal] = useState(false)
  const [receiptTicket, setReceiptTicket] = useState<any | null>(null)

  // Formulaires
  const [compteForm, setCompteForm] = useState({
    type_compte: 'BANQUE' as 'CAISSE_CENTRALE' | 'CAISSE_AGENCE' | 'BANQUE' | 'MOBILE_MONEY',
    libelle: '',
    numero_compte: '',
    etablissement: '',
    solde_initial: '0'
  })

  const [recetteForm, setRecetteForm] = useState({
    membre_id: '',
    type_recette: 'ADHESION' as 'ADHESION' | 'FRAIS_CARTE' | 'TENUE_COMPTE' | 'FRAIS_DOSSIER_CREDIT' | 'FRAIS_RETRAIT' | 'AUTRES_RECETTES',
    montant: '5000',
    mode_paiement: 'ESPECES' as 'ESPECES' | 'MTN_MOMO' | 'MOOV_MONEY' | 'BANQUE' | 'COMPTE_EPARGNE',
    compte_tresorerie_nom: 'Caisse centrale',
    observation: ''
  })

  const [transfertForm, setTransfertForm] = useState({
    compte_source_id: '',
    compte_dest_id: '',
    montant: '',
    frais_transfert: '0',
    motif: 'Réapprovisionnement'
  })

  // 1. Chargement des Données
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cptRes, recRes, trfRes, mbrRes] = await Promise.all([
        supabaseTenant('microfinance_tresorerie_comptes').select('*').order('type_compte', { ascending: true }),
        supabaseTenant('microfinance_recettes_administratives').select('*').order('created_at', { ascending: false }).limit(100),
        supabaseTenant('microfinance_tresorerie_transferts').select('*').order('created_at', { ascending: false }).limit(100),
        supabaseTenant('microfinance_membres').select('id, nom_complet, telephone').eq('statut', 'ACTIF').order('nom_complet')
      ])

      setComptes(cptRes.data || [])
      setRecettes(recRes.data || [])
      setTransferts(trfRes.data || [])
      setMembres(mbrRes.data || [])
    } catch (err: any) {
      console.error('Erreur chargement trésorerie SFD:', err)
      toast.error('Erreur lors du chargement de la trésorerie')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 2. Statistiques Globales de Trésorerie
  const stats = useMemo(() => {
    let totalLiquidites = 0
    let totalCaisses = 0
    let totalBanques = 0
    let totalMobileMoney = 0

    comptes.forEach(c => {
      const solde = Number(c.solde_actuel || 0)
      totalLiquidites += solde
      if (c.type_compte === 'CAISSE_CENTRALE' || c.type_compte === 'CAISSE_AGENCE') {
        totalCaisses += solde
      } else if (c.type_compte === 'BANQUE') {
        totalBanques += solde
      } else if (c.type_compte === 'MOBILE_MONEY') {
        totalMobileMoney += solde
      }
    })

    const totalRecettesMois = recettes.reduce((acc, r) => acc + (Number(r.montant) || 0), 0)

    return {
      totalLiquidites,
      totalCaisses,
      totalBanques,
      totalMobileMoney,
      totalRecettesMois,
      nbComptes: comptes.length
    }
  }, [comptes, recettes])

  // 3. Création Compte Trésorerie
  const handleCreateCompte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!compteForm.libelle) {
      toast.error('Veuillez renseigner le libellé du compte')
      return
    }

    try {
      const code = `CPT-${Date.now().toString().slice(-4)}`
      const initial = Number(compteForm.solde_initial) || 0

      const { error } = await supabaseTenant('microfinance_tresorerie_comptes').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        type_compte: compteForm.type_compte,
        code_compte: code,
        libelle: compteForm.libelle,
        numero_compte: compteForm.numero_compte,
        etablissement: compteForm.etablissement,
        solde_initial: initial,
        solde_actuel: initial,
        devise: 'XOF',
        est_actif: true
      })

      if (error) throw error

      toast.success('Compte de trésorerie créé avec succès !')
      setShowAddCompteModal(false)
      setCompteForm({
        type_compte: 'BANQUE',
        libelle: '',
        numero_compte: '',
        etablissement: '',
        solde_initial: '0'
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur création compte:', err)
      toast.error('Erreur lors de la création du compte')
    }
  }

  // 4. Enregistrement Recette Administrative
  const handleSaveRecette = async (e: React.FormEvent) => {
    e.preventDefault()
    const montant = Number(recetteForm.montant)
    if (!montant || montant <= 0) {
      toast.error('Veuillez saisir un montant valide')
      return
    }

    const membre = membres.find(m => m.id === recetteForm.membre_id)
    const ref = `REC-${Date.now().toString().slice(-6)}`

    try {
      const { data, error } = await supabaseTenant('microfinance_recettes_administratives')
        .insert({
          company_id: companyId,
          sector_slug: sectorSlug || 'microfinance',
          reference: ref,
          membre_id: membre ? membre.id : null,
          membre_nom: membre ? membre.nom_complet : 'Adhérent Passager',
          type_recette: recetteForm.type_recette,
          montant: montant,
          mode_paiement: recetteForm.mode_paiement,
          compte_tresorerie_nom: recetteForm.compte_tresorerie_nom,
          agent_nom: user?.full_name || user?.email || 'Caissier Guichet',
          statut: 'ENCAISSE',
          observation: recetteForm.observation
        })
        .select()
        .single()

      if (error) throw error

      // Mettre à jour le solde du compte de trésorerie sélectionné si applicable
      const targetCompte = comptes.find(c => c.libelle.toLowerCase() === recetteForm.compte_tresorerie_nom.toLowerCase())
      if (targetCompte) {
        await supabaseTenant('microfinance_tresorerie_comptes')
          .update({
            solde_actuel: Number(targetCompte.solde_actuel || 0) + montant
          })
          .eq('id', targetCompte.id)
      }

      toast.success('Recette administrative encaissée avec succès !')
      setReceiptTicket({
        ...data,
        membre_tel: membre?.telephone
      })
      setShowAddRecetteModal(false)
      setRecetteForm({
        membre_id: '',
        type_recette: 'ADHESION',
        montant: '5000',
        mode_paiement: 'ESPECES',
        compte_tresorerie_nom: 'Caisse centrale',
        observation: ''
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur encaissement recette:', err)
      toast.error("Erreur lors de l'enregistrement de la recette")
    }
  }

  // 5. Enregistrement Virement Interne
  const handleSaveTransfert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transfertForm.compte_source_id || !transfertForm.compte_dest_id) {
      toast.error('Veuillez sélectionner les comptes source et destination')
      return
    }
    if (transfertForm.compte_source_id === transfertForm.compte_dest_id) {
      toast.error('Les comptes source et destination doivent être distincts')
      return
    }

    const montant = Number(transfertForm.montant)
    if (!montant || montant <= 0) {
      toast.error('Veuillez saisir un montant valide')
      return
    }

    const cSource = comptes.find(c => c.id === transfertForm.compte_source_id)
    const cDest = comptes.find(c => c.id === transfertForm.compte_dest_id)

    if (!cSource || !cDest) return

    if (Number(cSource.solde_actuel || 0) < montant) {
      toast.error(`Solde insuffisant sur le compte source (${Number(cSource.solde_actuel).toLocaleString('fr-FR')} FCFA)`)
      return
    }

    const frais = Number(transfertForm.frais_transfert) || 0
    const ref = `TRF-${Date.now().toString().slice(-6)}`

    try {
      const { error: trfErr } = await supabaseTenant('microfinance_tresorerie_transferts').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        reference: ref,
        compte_source_id: cSource.id,
        compte_source_nom: cSource.libelle,
        compte_dest_id: cDest.id,
        compte_dest_nom: cDest.libelle,
        montant: montant,
        frais_transfert: frais,
        date_transfert: new Date().toISOString().slice(0, 10),
        motif: transfertForm.motif,
        initiateur_nom: user?.full_name || user?.email || 'Gestionnaire Trésorerie',
        statut: 'VALIDE'
      })

      if (trfErr) throw trfErr

      // Débit source
      await supabaseTenant('microfinance_tresorerie_comptes')
        .update({
          solde_actuel: Math.max(0, Number(cSource.solde_actuel || 0) - (montant + frais))
        })
        .eq('id', cSource.id)

      // Crédit destination
      await supabaseTenant('microfinance_tresorerie_comptes')
        .update({
          solde_actuel: Number(cDest.solde_actuel || 0) + montant
        })
        .eq('id', cDest.id)

      toast.success('Virement interne effectué avec succès !')
      setShowTransfertModal(false)
      setTransfertForm({
        compte_source_id: '',
        compte_dest_id: '',
        montant: '',
        frais_transfert: '0',
        motif: 'Réapprovisionnement'
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur transfert interne:', err)
      toast.error('Erreur lors du virement interne')
    }
  }

  // Filtrage des recettes
  const filteredRecettes = useMemo(() => {
    return recettes.filter(r => {
      const matchSearch =
        r.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.membre_nom && r.membre_nom.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchType = filterTypeRecette === 'ALL' || r.type_recette === filterTypeRecette
      return matchSearch && matchType
    })
  }, [recettes, searchTerm, filterTypeRecette])

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">
      {/* 1. EN-TÊTE TRÉSORERIE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Trésorerie Multi-Canaux & Recettes SFD
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Caisses d'agences, Banques, Mobile Money (MTN MoMo/Moov), virements internes & recettes administratives
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-2"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <button
            onClick={() => setShowAddRecetteModal(true)}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-200 flex items-center gap-2 transition"
          >
            <Receipt className="w-4 h-4" />
            <span>Encaisser Recette</span>
          </button>

          <button
            onClick={() => setShowTransfertModal(true)}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-200 flex items-center gap-2 transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Virement Interne</span>
          </button>

          <button
            onClick={() => setShowAddCompteModal(true)}
            className="px-4 py-3 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-black shadow-md flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Compte</span>
          </button>
        </div>
      </div>

      {/* 2. STATS GLOBALES TRÉSORERIE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Liquidités Globales SFD
          </span>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1">
            {stats.totalLiquidites.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{stats.nbComptes} comptes actifs consolidés</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Caisses Guichet</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-lg font-black text-slate-900 font-mono">
            {stats.totalCaisses.toLocaleString('fr-FR')} <span className="text-xs">F</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Espèces physiques en agences</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Avoirs Bancaires</span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-lg font-black text-slate-900 font-mono">
            {stats.totalBanques.toLocaleString('fr-FR')} <span className="text-xs">F</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Ecobank, BOA, Coris...</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Mobile Money</span>
            <Smartphone className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-black text-slate-900 font-mono">
            {stats.totalMobileMoney.toLocaleString('fr-FR')} <span className="text-xs">F</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">MTN MoMo & Moov Pro</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Recettes SFD</span>
            <Receipt className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-lg font-black text-indigo-700 font-mono">
            {stats.totalRecettesMois.toLocaleString('fr-FR')} <span className="text-xs">F</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Adhésions, dossiers, frais</p>
        </div>
      </div>

      {/* 3. SÉLECTEUR D'ONGLETS PRINCIPAUX */}
      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl text-xs font-bold w-fit">
        <button
          onClick={() => setActiveTab('COMPTES')}
          className={clsx(
            'px-4 py-2.5 rounded-xl transition flex items-center gap-2',
            activeTab === 'COMPTES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Landmark className="w-4 h-4 text-amber-500" />
          <span>Comptes de Trésorerie ({comptes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('RECETTES')}
          className={clsx(
            'px-4 py-2.5 rounded-xl transition flex items-center gap-2',
            activeTab === 'RECETTES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Receipt className="w-4 h-4 text-emerald-600" />
          <span>Recettes Administratives ({recettes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('TRANSFERTS')}
          className={clsx(
            'px-4 py-2.5 rounded-xl transition flex items-center gap-2',
            activeTab === 'TRANSFERTS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
          <span>Virements & Transferts Internes ({transferts.length})</span>
        </button>
      </div>

      {/* 4. ONGLET 1 : COMPTES DE TRÉSORERIE */}
      {activeTab === 'COMPTES' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comptes.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-slate-200">
                <Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Aucun compte de trésorerie configuré</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Ajoutez vos comptes de caisse guichet, banques partenaires et numéros marchands Mobile Money.
                </p>
                <button
                  onClick={() => setShowAddCompteModal(true)}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs"
                >
                  + Ajouter un Compte
                </button>
              </div>
            ) : (
              comptes.map(c => {
                const isCaisse = c.type_compte === 'CAISSE_CENTRALE' || c.type_compte === 'CAISSE_AGENCE'
                const isBanque = c.type_compte === 'BANQUE'
                const isMoMo = c.type_compte === 'MOBILE_MONEY'

                return (
                  <div
                    key={c.id}
                    className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            'w-10 h-10 rounded-2xl flex items-center justify-center font-bold',
                            isCaisse && 'bg-amber-100 text-amber-700',
                            isBanque && 'bg-blue-100 text-blue-700',
                            isMoMo && 'bg-emerald-100 text-emerald-700'
                          )}
                        >
                          {isCaisse && <Wallet className="w-5 h-5" />}
                          {isBanque && <Building2 className="w-5 h-5" />}
                          {isMoMo && <Smartphone className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">{c.libelle}</h4>
                          <span className="text-[10px] font-mono text-slate-400">{c.code_compte}</span>
                        </div>
                      </div>

                      <span
                        className={clsx(
                          'text-[10px] font-black uppercase px-2 py-0.5 rounded-full',
                          c.est_actif ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {c.type_compte.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Solde Actuel Disponible</span>
                      <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                        {Number(c.solde_actuel || 0).toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
                      </div>
                      {c.numero_compte && (
                        <p className="text-[11px] font-mono text-slate-500 mt-1">N° : {c.numero_compte}</p>
                      )}
                      {c.etablissement && (
                        <p className="text-[10px] text-slate-400">Établissement : {c.etablissement}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>Solde initial: {Number(c.solde_initial || 0).toLocaleString('fr-FR')} F</span>
                      <span className="text-emerald-600 font-bold">Actif ✓</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* 5. ONGLET 2 : RECETTES ADMINISTRATIVES */}
      {activeTab === 'RECETTES' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher référence, adhérent..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
              />
              <select
                value={filterTypeRecette}
                onChange={e => setFilterTypeRecette(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="ALL">Tous les types de recettes</option>
                <option value="ADHESION">Frais d'Adhésion Membre</option>
                <option value="FRAIS_DOSSIER_CREDIT">Frais de Dossier Crédit</option>
                <option value="FRAIS_CARTE">Délivrance Carte / Livret</option>
                <option value="TENUE_COMPTE">Tenue de Compte</option>
                <option value="FRAIS_RETRAIT">Frais de Retrait / Pénalités</option>
                <option value="AUTRES_RECETTES">Autres Recettes</option>
              </select>
            </div>

            <span className="text-xs font-bold text-slate-400">{filteredRecettes.length} recette(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Réf</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Adhérent</th>
                  <th className="py-3 px-4">Type de Recette</th>
                  <th className="py-3 px-4">Canal</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredRecettes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Aucune recette administrative enregistrée.
                    </td>
                  </tr>
                ) : (
                  filteredRecettes.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">{r.reference}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(r.created_at).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{r.membre_nom || 'Adhérent Passager'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700">
                          {r.type_recette.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{r.mode_paiement}</td>
                      <td className="py-3 px-4 text-right font-black text-emerald-700">
                        +{Number(r.montant).toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setReceiptTicket(r)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 transition"
                          title="Imprimer Reçu Officiel"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. ONGLET 3 : TRANSFERTS & VIREMENTS INTERNES */}
      {activeTab === 'TRANSFERTS' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-900 tracking-wider">
              Historique des Mouvements Inter-Comptes ({transferts.length})
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Réf</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Compte Source</th>
                  <th className="py-3 px-4">Compte Destination</th>
                  <th className="py-3 px-4">Motif</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {transferts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Aucun virement interne effectué.
                    </td>
                  </tr>
                ) : (
                  transferts.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">{t.reference}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(t.date_transfert).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 px-4 text-rose-600 font-bold">{t.compte_source_nom}</td>
                      <td className="py-3 px-4 text-emerald-600 font-bold">{t.compte_dest_nom}</td>
                      <td className="py-3 px-4 text-slate-600">{t.motif || 'Virement interne'}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {Number(t.montant).toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700">
                          {t.statut}
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

      {/* 7. MODAL NOUVEAU COMPTE */}
      {showAddCompteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Nouveau Compte de Trésorerie</h3>
              <button
                onClick={() => setShowAddCompteModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCompte} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Type de Compte</label>
                <select
                  value={compteForm.type_compte}
                  onChange={e => setCompteForm({ ...compteForm, type_compte: e.target.value as any })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="CAISSE_CENTRALE">Caisse Centrale (Guichet)</option>
                  <option value="CAISSE_AGENCE">Caisse Annexe / Agence</option>
                  <option value="BANQUE">Compte Bancaire (BOA, Ecobank, Coris...)</option>
                  <option value="MOBILE_MONEY">Compte Mobile Money (MTN MoMo, Moov)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom / Libellé du Compte *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ecobank Compte Principal, MTN MoMo Caisse 1..."
                  value={compteForm.libelle}
                  onChange={e => setCompteForm({ ...compteForm, libelle: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">N° de Compte / Téléphone</label>
                  <input
                    type="text"
                    placeholder="Ex: 0123456789 ou 97000000"
                    value={compteForm.numero_compte}
                    onChange={e => setCompteForm({ ...compteForm, numero_compte: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Établissement</label>
                  <input
                    type="text"
                    placeholder="Ex: BOA, MTN, Moov"
                    value={compteForm.etablissement}
                    onChange={e => setCompteForm({ ...compteForm, etablissement: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Solde Initial (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  value={compteForm.solde_initial}
                  onChange={e => setCompteForm({ ...compteForm, solde_initial: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCompteModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-black bg-slate-900 hover:bg-black text-white shadow-md"
                >
                  Créer le Compte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL ENCAISSEMENT RECETTE */}
      {showAddRecetteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Encaisser Recette Administrative</h3>
              <button
                onClick={() => setShowAddRecetteModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecette} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adhérent Concerné</label>
                <select
                  value={recetteForm.membre_id}
                  onChange={e => setRecetteForm({ ...recetteForm, membre_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="">Adhérent Passager (Non rattaché)</option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nom_complet} ({m.telephone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nature de la Recette *</label>
                <select
                  value={recetteForm.type_recette}
                  onChange={e => setRecetteForm({ ...recetteForm, type_recette: e.target.value as any })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="ADHESION">Frais d'Adhésion Membre (5 000 F)</option>
                  <option value="FRAIS_DOSSIER_CREDIT">Frais d'Étude de Dossier Crédit</option>
                  <option value="FRAIS_CARTE">Délivrance Carte Membre / Carnet Tontine</option>
                  <option value="TENUE_COMPTE">Frais de Tenue de Compte</option>
                  <option value="FRAIS_RETRAIT">Frais de Retrait Guichet / Pénalités</option>
                  <option value="AUTRES_RECETTES">Autres Recettes Administratives</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={recetteForm.montant}
                    onChange={e => setRecetteForm({ ...recetteForm, montant: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Canal</label>
                  <select
                    value={recetteForm.mode_paiement}
                    onChange={e => setRecetteForm({ ...recetteForm, mode_paiement: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="ESPECES">Espèces (Guichet)</option>
                    <option value="MTN_MOMO">MTN Mobile Money</option>
                    <option value="MOOV_MONEY">Moov Money</option>
                    <option value="BANQUE">Virement Bancaire</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Compte de Trésorerie Encaissé</label>
                <select
                  value={recetteForm.compte_tresorerie_nom}
                  onChange={e => setRecetteForm({ ...recetteForm, compte_tresorerie_nom: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="Caisse centrale">Caisse centrale</option>
                  {comptes.map(c => (
                    <option key={c.id} value={c.libelle}>
                      {c.libelle} ({c.type_compte})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observation</label>
                <input
                  type="text"
                  placeholder="Notes optionnelles..."
                  value={recetteForm.observation}
                  onChange={e => setRecetteForm({ ...recetteForm, observation: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddRecetteModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200"
                >
                  Encaisser & Émettre Reçu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL VIREMENT INTERNE */}
      {showTransfertModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Virement Interne / Transfert de Fonds</h3>
              <button
                onClick={() => setShowTransfertModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfert} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Compte Source (À débiter) *</label>
                <select
                  required
                  value={transfertForm.compte_source_id}
                  onChange={e => setTransfertForm({ ...transfertForm, compte_source_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-rose-700"
                >
                  <option value="">Sélectionner compte source...</option>
                  {comptes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.libelle} — Solde: {Number(c.solde_actuel).toLocaleString('fr-FR')} F
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Compte Destination (À créditer) *</label>
                <select
                  required
                  value={transfertForm.compte_dest_id}
                  onChange={e => setTransfertForm({ ...transfertForm, compte_dest_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-700"
                >
                  <option value="">Sélectionner compte destination...</option>
                  {comptes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.libelle} — Solde: {Number(c.solde_actuel).toLocaleString('fr-FR')} F
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant à Transférer (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="500"
                    value={transfertForm.montant}
                    onChange={e => setTransfertForm({ ...transfertForm, montant: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Frais de Transfert (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    value={transfertForm.frais_transfert}
                    onChange={e => setTransfertForm({ ...transfertForm, frais_transfert: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif / Justificatif</label>
                <input
                  type="text"
                  placeholder="Ex: Approvisionnement guichet, Dépôt banque..."
                  value={transfertForm.motif}
                  onChange={e => setTransfertForm({ ...transfertForm, motif: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransfertModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200"
                >
                  Exécuter le Virement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. REÇU OFFICIEL DE RECETTE ADMINISTRATIVE IMPRIMABLE */}
      {receiptTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs font-mono">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h3 className="font-black text-slate-900 text-base">{company?.name || 'GESTIO IMF'}</h3>
              <p className="text-[10px] text-slate-500">REÇU OFFICIEL DE RECETTE ADMINISTRATIVE</p>
              <p className="text-[11px] font-bold text-indigo-700 mt-1">{receiptTicket.reference}</p>
            </div>

            <div className="space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(receiptTicket.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Adhérent:</span>
                <span className="font-bold">{receiptTicket.membre_nom || 'Passager'}</span>
              </div>
              <div className="flex justify-between">
                <span>Motif:</span>
                <span className="font-bold">{receiptTicket.type_recette.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Canal:</span>
                <span>{receiptTicket.mode_paiement}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 font-black text-sm text-slate-900">
                <span>MONTANT ENCAISSÉ:</span>
                <span>{Number(receiptTicket.montant).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[10px] text-slate-400">
              <p>Émis par {receiptTicket.agent_nom}</p>
              <p className="mt-1 font-sans">Merci pour votre confiance !</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 font-sans"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Reçu</span>
              </button>
              <button
                onClick={() => setReceiptTicket(null)}
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

export default MicrofinanceTresoreriePage
