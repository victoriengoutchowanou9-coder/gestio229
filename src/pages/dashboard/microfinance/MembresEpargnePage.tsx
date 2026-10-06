import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Plus, RefreshCw, Search, Wallet, ArrowDownRight, ArrowUpRight,
  Printer, CheckCircle2, AlertTriangle, Eye, X, ShieldCheck, FileText,
  UserCheck, CreditCard, ChevronRight, Lock, Shield, Award, History,
  Layers, Building, Calendar, Phone, Mail, MapPin, Briefcase, FileCheck,
  DollarSign, Download, ArrowRight, User
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const EPARGNE_PRODUITS = [
  { code: 'EPARGNE_ORDINAIRE', label: 'Épargne Ordinaire (À vue)', taux: 3.5, depotMin: 1000, desc: 'Dépôts et retraits libres, rémunéré trimestriellement' },
  { code: 'EPARGNE_OBLIGATOIRE', label: 'Épargne Obligatoire (Nantie)', taux: 3.0, depotMin: 5000, desc: 'Garantie préalable nantie pour accès aux crédits' },
  { code: 'EPARGNE_CONTRACTUELLE', label: 'Épargne Contractuelle', taux: 4.5, depotMin: 5000, desc: 'Cotisation mensuelle programmée sur durée contractuelle' },
  { code: 'EPARGNE_PROJET', label: 'Épargne Projet', taux: 5.0, depotMin: 10000, desc: 'Constitution de fonds pour investissement ou équipement' },
  { code: 'EPARGNE_BLOQUEE', label: 'Épargne Bloquée', taux: 6.0, depotMin: 25000, desc: 'Fonds bloqués sur période convenue (min 6 mois)' },
  { code: 'EPARGNE_A_TERME', label: 'Dépôt à Terme (DAT)', taux: 6.5, depotMin: 50000, desc: 'Placement à terme fixe avec intérêts garantis' },
  { code: 'EPARGNE_GARANTIE', label: 'Épargne de Garantie Crédit', taux: 0.0, depotMin: 10000, desc: 'Gage financier spécifique pour cautionnement' }
]

export const MembresEpargnePage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { user, company } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'membres' | 'comptes' | 'operations'>('membres')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [membres, setMembres] = useState<any[]>([])
  const [comptes, setComptes] = useState<any[]>([])
  const [operations, setOperations] = useState<any[]>([])

  // Modales & Fiche Membre 10 onglets
  const [showMembreModal, setShowMembreModal] = useState(false)
  const [showCompteModal, setShowCompteModal] = useState(false)
  const [showOperationModal, setShowOperationModal] = useState(false)
  const [selectedMembreDetail, setSelectedMembreDetail] = useState<any | null>(null)
  const [activeMemberTab, setActiveMemberTab] = useState<'profil' | 'epargne' | 'credits' | 'remboursements' | 'tontines' | 'garanties' | 'transactions' | 'parts_sociales' | 'documents' | 'historique'>('profil')
  const [memberCredits, setMemberCredits] = useState<any[]>([])
  const [memberRembs, setMemberRembs] = useState<any[]>([])
  const [memberTontines, setMemberTontines] = useState<any[]>([])
  const [memberGaranties, setMemberGaranties] = useState<any[]>([])
  const [loadingMemberDetails, setLoadingMemberDetails] = useState(false)
  const [printRecuData, setPrintRecuData] = useState<any | null>(null)
  const [printReleveCompte, setPrintReleveCompte] = useState<any | null>(null)
  const [printCarteMembre, setPrintCarteMembre] = useState<any | null>(null)

  // Formulaire Membre
  const [membreForm, setMembreForm] = useState({
    civilite: 'M.',
    nom_complet: '',
    sexe: 'M',
    date_naissance: '',
    telephone: '',
    email: '',
    adresse: '',
    ville: 'Cotonou',
    profession: '',
    secteur_activite: 'Commerce',
    piece_identite_type: 'CIP',
    piece_identite_numero: '',
    piece_expire_le: '',
    ifu: '',
    personne_contact_nom: '',
    personne_contact_tel: '',
    beneficiaire_nom: '',
    beneficiaire_tel: '',
    kyc_niveau_risque: 'FAIBLE',
    agent_collecteur_nom: '',
    statut: 'ACTIF'
  })

  // Formulaire Compte
  const [compteForm, setCompteForm] = useState({
    membre_id: '',
    type_compte: 'EPARGNE_LIBRE',
    taux_remuneration: 3.5,
    depot_initial: 0
  })

  // Formulaire Opération (Dépôt / Retrait)
  const [operationForm, setOperationForm] = useState({
    compte_id: '',
    type_operation: 'DEPOT',
    montant: '',
    frais_operation: '0',
    mode_reglement: 'ESPECES',
    observation: ''
  })

  const loadAllData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [mRes, cRes, oRes] = await Promise.all([
        supabaseTenant('microfinance_membres').select('*').order('created_at', { ascending: false }),
        supabaseTenant('microfinance_comptes_epargne').select('*').order('created_at', { ascending: false }),
        supabaseTenant('microfinance_epargne_operations').select('*').order('date_operation', { ascending: false }).limit(100)
      ])

      setMembres(mRes.data || [])
      setComptes(cRes.data || [])
      setOperations(oRes.data || [])
    } catch (err: any) {
      console.error('[MembresEpargnePage] Erreur:', err.message)
      setMembres([])
      setComptes([])
      setOperations([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const loadMemberSubData = useCallback(async (m: any) => {
    if (!m?.id) return
    setLoadingMemberDetails(true)
    try {
      const [credRes, rembRes, tontRes, garRes] = await Promise.all([
        supabaseTenant('microfinance_credits').select('*').eq('membre_id', m.id).order('created_at', { ascending: false }),
        supabaseTenant('microfinance_credit_remboursements').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseTenant('microfinance_tontine_journaliere_contrats').select('*').eq('membre_id', m.id),
        supabaseTenant('microfinance_credit_garanties').select('*').limit(50)
      ])
      setMemberCredits(credRes.data || [])
      setMemberRembs((rembRes.data || []).filter((r: any) => r.membre_nom === m.nom_complet || credRes.data?.some((c: any) => c.id === r.credit_id)))
      setMemberTontines(tontRes.data || [])
      setMemberGaranties(garRes.data || [])
    } catch (err: any) {
      console.warn('Erreur chargement sous-dossiers membre:', err.message)
    } finally {
      setLoadingMemberDetails(false)
    }
  }, [supabaseTenant])

  const openMembreDetail = (m: any) => {
    setSelectedMembreDetail(m)
    setActiveMemberTab('profil')
    loadMemberSubData(m)
  }

  // Enregistrement nouveau membre
  const handleSaveMembre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!membreForm.nom_complet.trim() || !membreForm.telephone.trim()) {
      toast.error('Champs requis', 'Le nom et le téléphone sont obligatoires.')
      return
    }

    try {
      const numero_membre = `MBR-${Date.now().toString().slice(-6)}`
      const { data: newMembre, error } = await supabaseTenant('microfinance_membres')
        .insert({
          numero_membre,
          civilite: membreForm.civilite,
          nom_complet: membreForm.nom_complet.trim(),
          sexe: membreForm.sexe,
          telephone: membreForm.telephone.trim(),
          email: membreForm.email.trim() || null,
          adresse: membreForm.adresse.trim(),
          ville: membreForm.ville.trim(),
          profession: membreForm.profession.trim(),
          secteur_activite: membreForm.secteur_activite,
          piece_identite_type: membreForm.piece_identite_type,
          piece_identite_numero: membreForm.piece_identite_numero.trim(),
          piece_expire_le: membreForm.piece_expire_le || null,
          ifu: membreForm.ifu.trim() || null,
          personne_contact_nom: membreForm.personne_contact_nom.trim(),
          personne_contact_tel: membreForm.personne_contact_tel.trim(),
          beneficiaire_nom: membreForm.beneficiaire_nom.trim(),
          beneficiaire_tel: membreForm.beneficiaire_tel.trim(),
          kyc_statut: 'COMPLET',
          kyc_niveau_risque: membreForm.kyc_niveau_risque,
          agent_collecteur_nom: membreForm.agent_collecteur_nom.trim() || null,
          statut: 'ACTIF'
        })
        .select()
        .single()

      if (error) throw error

      // Création automatique du compte épargne libre par défaut
      if (newMembre) {
        const numero_compte = `CPT-${Date.now().toString().slice(-7)}`
        await supabaseTenant('microfinance_comptes_epargne').insert({
          numero_compte,
          membre_id: newMembre.id,
          membre_nom: newMembre.nom_complet,
          type_compte: 'EPARGNE_LIBRE',
          solde: 0,
          taux_remuneration: 3.5,
          statut: 'ACTIF'
        })
      }

      toast.success('Adhérent enregistré', `Membre ${numero_membre} créé avec son compte d'épargne.`)
      setShowMembreModal(false)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'enregistrer le membre.')
    }
  }

  // Ouverture nouveau compte d'épargne pour un membre existant
  const handleSaveCompte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!compteForm.membre_id) {
      toast.error('Sélection requise', 'Veuillez choisir le membre bénéficiaire.')
      return
    }

    const membre = membres.find(m => m.id === compteForm.membre_id)
    if (!membre) return

    try {
      const numero_compte = `CPT-${Date.now().toString().slice(-7)}`
      const { error } = await supabaseTenant('microfinance_comptes_epargne').insert({
        numero_compte,
        membre_id: membre.id,
        membre_nom: membre.nom_complet,
        type_compte: compteForm.type_compte,
        solde: Number(compteForm.depot_initial) || 0,
        taux_remuneration: Number(compteForm.taux_remuneration) || 0,
        statut: 'ACTIF'
      })

      if (error) throw error

      toast.success('Compte ouvert', `Compte ${numero_compte} ouvert pour ${membre.nom_complet}.`)
      setShowCompteModal(false)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'ouvrir le compte.')
    }
  }

  // Dépôt ou Retrait sur compte d'épargne
  const handleSaveOperation = async (e: React.FormEvent) => {
    e.preventDefault()
    const montant = Number(operationForm.montant)
    const frais = Number(operationForm.frais_operation) || 0

    if (!operationForm.compte_id || montant <= 0) {
      toast.error('Montant invalide', 'Veuillez saisir un montant supérieur à 0.')
      return
    }

    const compte = comptes.find(c => c.id === operationForm.compte_id)
    if (!compte) return

    const soldeAvant = Number(compte.solde) || 0
    let soldeApres = soldeAvant

    if (operationForm.type_operation === 'RETRAIT') {
      if (soldeAvant < montant + frais) {
        toast.error('Solde insuffisant', `Le solde actuel (${fmt(soldeAvant)}) ne permet pas ce retrait de ${fmt(montant + frais)}.`)
        return
      }
      soldeApres = soldeAvant - montant - frais
    } else {
      soldeApres = soldeAvant + montant - frais
    }

    try {
      const reference = `${operationForm.type_operation === 'DEPOT' ? 'DEP' : 'RET'}-${Date.now().toString().slice(-8)}`

      // 1. Enregistrement de l'opération
      const { data: newOp, error: opErr } = await supabaseTenant('microfinance_epargne_operations').insert({
        reference,
        compte_id: compte.id,
        numero_compte: compte.numero_compte,
        membre_id: compte.membre_id,
        membre_nom: compte.membre_nom,
        type_operation: operationForm.type_operation,
        montant,
        frais_operation: frais,
        solde_avant: soldeAvant,
        solde_apres: soldeApres,
        mode_reglement: operationForm.mode_reglement,
        agent_nom: user?.email || 'Caissier',
        observation: operationForm.observation.trim() || null
      }).select().single()

      if (opErr) throw opErr

      // 2. Mise à jour du solde du compte
      await supabaseTenant('microfinance_comptes_epargne')
        .update({ solde: soldeApres, updated_at: new Date().toISOString() })
        .eq('id', compte.id)

      // 3. Mise à jour du solde total du membre
      const { data: allMemberAccounts } = await supabaseTenant('microfinance_comptes_epargne')
        .select('solde')
        .eq('membre_id', compte.membre_id)

      const totalMembre = (allMemberAccounts || []).reduce((s: number, a: any) => s + (Number(a.solde) || 0), 0)
      await supabaseTenant('microfinance_membres')
        .update({ solde_epargne_total: totalMembre, updated_at: new Date().toISOString() })
        .eq('id', compte.membre_id)

      toast.success('Opération validée', `${operationForm.type_operation === 'DEPOT' ? 'Dépôt' : 'Retrait'} de ${fmt(montant)} enregistré.`)
      setShowOperationModal(false)

      // Préparer le reçu d'impression
      setPrintRecuData(newOp)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'enregistrer l\'opération.')
    }
  }

  // Filtres
  const filteredMembres = useMemo(() => {
    return membres.filter(m => {
      const q = search.toLowerCase()
      return (
        m.nom_complet?.toLowerCase().includes(q) ||
        m.numero_membre?.toLowerCase().includes(q) ||
        m.telephone?.includes(q)
      )
    })
  }, [membres, search])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-600" />
            Membres & Comptes d'Épargne
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Fichier central des adhérents, conformité KYC/LBC-FT, gestion des comptes et mouvements d'épargne
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadAllData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition"
            title="Rafraîchir"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowOperationModal(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-sm transition"
          >
            <Wallet className="w-4 h-4" /> Dépôt / Retrait
          </button>
          <button
            onClick={() => setShowMembreModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition"
          >
            <Plus className="w-4 h-4" /> Nouvel Adhérent
          </button>
        </div>
      </div>

      {/* Navigation Onglets */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('membres')}
          className={clsx(
            'px-4 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2',
            activeTab === 'membres' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          )}
        >
          <Users className="w-4 h-4" /> Fichier Adhérents ({membres.length})
        </button>
        <button
          onClick={() => setActiveTab('comptes')}
          className={clsx(
            'px-4 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2',
            activeTab === 'comptes' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          )}
        >
          <CreditCard className="w-4 h-4" /> Comptes d'Épargne ({comptes.length})
        </button>
        <button
          onClick={() => setActiveTab('operations')}
          className={clsx(
            'px-4 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2',
            activeTab === 'operations' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          )}
        >
          <FileText className="w-4 h-4" /> Historique Mouvements ({operations.length})
        </button>
      </div>

      {/* Recherche */}
      <div className="relative w-full sm:w-96">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Rechercher par nom, n° membre ou téléphone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {/* ONGLET 1 : FICHIER ADHÉRENTS */}
      {activeTab === 'membres' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          {filteredMembres.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">Aucun membre enregistré</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">Créez la première fiche adhérent pour démarrer la gestion.</p>
              <button
                onClick={() => setShowMembreModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Nouvel Adhérent
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">N° Membre & Identité</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Profession / Activité</th>
                    <th className="py-3 px-4">Pièce Identité</th>
                    <th className="py-3 px-4 text-center">KYC / Risque</th>
                    <th className="py-3 px-4 text-right">Épargne Totale</th>
                    <th className="py-3 px-4 text-center">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembres.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                            {m.civilite}
                          </span>
                          <div>
                            <p className="font-black text-slate-900">{m.nom_complet}</p>
                            <p className="text-[10px] font-mono text-slate-400">{m.numero_membre}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-700">{m.telephone}</td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{m.profession || 'Commerçant'}</p>
                        <p className="text-[10px] text-slate-400">{m.ville}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-700">{m.piece_identite_type} : </span>
                        <span className="font-mono text-slate-500">{m.piece_identite_numero || '-'}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[9px] font-black',
                          m.kyc_niveau_risque === 'FAIBLE' ? 'bg-emerald-100 text-emerald-800' :
                          m.kyc_niveau_risque === 'MOYEN' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        )}>
                          KYC {m.kyc_niveau_risque}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                        {fmt(Number(m.solde_epargne_total) || 0)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          m.statut === 'ACTIF' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        )}>
                          {m.statut}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openMembreDetail(m)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition inline-flex items-center gap-1"
                          title="Voir la fiche"
                        >
                          <Eye className="w-3.5 h-3.5" /> Fiche
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ONGLET 2 : COMPTES D'ÉPARGNE */}
      {activeTab === 'comptes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCompteModal(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Ouvrir un Compte d'Épargne
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            {comptes.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-700">Aucun compte d'épargne</h3>
                <p className="text-xs text-slate-400 mt-1">Ouvrez des comptes pour vos membres pour gérer leurs soldes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">N° Compte</th>
                      <th className="py-3 px-4">Membre Titulaire</th>
                      <th className="py-3 px-4">Type de Produit</th>
                      <th className="py-3 px-4 text-center">Taux Rémunéré</th>
                      <th className="py-3 px-4 text-right">Solde Actuel</th>
                      <th className="py-3 px-4 text-center">Statut</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comptes.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-mono font-black text-slate-800">{c.numero_compte}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{c.membre_nom}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                            {c.type_compte.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                          {c.taux_remuneration} %
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                          {fmt(Number(c.solde))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {c.statut}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setOperationForm(f => ({ ...f, compte_id: c.id }))
                              setShowOperationModal(true)
                            }}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition"
                          >
                            Opérer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ONGLET 3 : HISTORIQUE DES MOUVEMENTS */}
      {activeTab === 'operations' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          {operations.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">Aucune opération d'épargne</h3>
              <p className="text-xs text-slate-400 mt-1">Les dépôts et retraits apparaîtront ici avec édition de reçus.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Date & Réf</th>
                    <th className="py-3 px-4">Membre & Compte</th>
                    <th className="py-3 px-4">Type Opération</th>
                    <th className="py-3 px-4 text-right">Montant</th>
                    <th className="py-3 px-4 text-right">Solde Après</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Agent / Caisse</th>
                    <th className="py-3 px-4 text-right">Reçu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {operations.map((op) => (
                    <tr key={op.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono text-slate-500">
                        <p className="font-bold text-slate-900">{op.reference}</p>
                        <p className="text-[10px]">{new Date(op.date_operation).toLocaleString('fr-FR')}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{op.membre_nom}</p>
                        <p className="font-mono text-[10px] text-slate-400">{op.numero_compte}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px] font-black',
                          op.type_operation === 'DEPOT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        )}>
                          {op.type_operation}
                        </span>
                      </td>
                      <td className={clsx('py-3 px-4 text-right font-mono font-black', op.type_operation === 'DEPOT' ? 'text-emerald-600' : 'text-rose-600')}>
                        {op.type_operation === 'DEPOT' ? '+' : '-'}{fmt(Number(op.montant))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {fmt(Number(op.solde_apres))}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-600">{op.mode_reglement}</td>
                      <td className="py-3 px-4 text-slate-500">{op.agent_nom}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setPrintRecuData(op)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition"
                          title="Imprimer le reçu officiel"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Création Membre */}
      {showMembreModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Fiche d'Adhésion Nouveau Membre
              </h3>
              <button onClick={() => setShowMembreModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMembre} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Civilité</label>
                  <select
                    value={membreForm.civilite}
                    onChange={e => setMembreForm({ ...membreForm, civilite: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                  >
                    <option value="M.">M.</option>
                    <option value="Mme">Mme</option>
                    <option value="Mlle">Mlle</option>
                    <option value="Groupe">Groupe Solidaire</option>
                    <option value="Entreprise">Entreprise</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Nom Complet / Raison Sociale *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: HOUESSOU Sènakpon Paul"
                    value={membreForm.nom_complet}
                    onChange={e => setMembreForm({ ...membreForm, nom_complet: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Téléphone Principal *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: +229 97 00 11 22"
                    value={membreForm.telephone}
                    onChange={e => setMembreForm({ ...membreForm, telephone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Ville / Quartier</label>
                  <input
                    type="text"
                    placeholder="Ex: Cotonou, Akpakpa"
                    value={membreForm.ville}
                    onChange={e => setMembreForm({ ...membreForm, ville: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Type de Pièce</label>
                  <select
                    value={membreForm.piece_identite_type}
                    onChange={e => setMembreForm({ ...membreForm, piece_identite_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                  >
                    <option value="CIP">CIP (Bénin)</option>
                    <option value="CNI">Carte Nationale d'Identité</option>
                    <option value="PASSEPORT">Passeport</option>
                    <option value="PERMIS">Permis de conduire</option>
                    <option value="RAVE">Certificat RAVE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Numéro de la Pièce</label>
                  <input
                    type="text"
                    placeholder="Numéro identifiant"
                    value={membreForm.piece_identite_numero}
                    onChange={e => setMembreForm({ ...membreForm, piece_identite_numero: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Niveau de Risque KYC</label>
                  <select
                    value={membreForm.kyc_niveau_risque}
                    onChange={e => setMembreForm({ ...membreForm, kyc_niveau_risque: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none font-bold"
                  >
                    <option value="FAIBLE">Faible (Standard)</option>
                    <option value="MOYEN">Moyen (Vigilance)</option>
                    <option value="ELEVE">Élevé (Renforcé)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Profession / Activité</label>
                  <input
                    type="text"
                    placeholder="Ex: Revendeuse tissus, Mécanicien"
                    value={membreForm.profession}
                    onChange={e => setMembreForm({ ...membreForm, profession: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Agent Collecteur Assigné</label>
                  <input
                    type="text"
                    placeholder="Nom du collecteur terrain"
                    value={membreForm.agent_collecteur_nom}
                    onChange={e => setMembreForm({ ...membreForm, agent_collecteur_nom: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMembreModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md shadow-indigo-600/30"
                >
                  Enregistrer l'Adhérent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ouverture Compte */}
      {showCompteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Ouvrir un Compte d'Épargne</h3>
              <button onClick={() => setShowCompteModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompte} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Membre Titulaire *</label>
                <select
                  required
                  value={compteForm.membre_id}
                  onChange={e => setCompteForm({ ...compteForm, membre_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none font-bold"
                >
                  <option value="">Sélectionner un membre...</option>
                  {membres.map(m => (
                    <option key={m.id} value={m.id}>{m.nom_complet} ({m.numero_membre})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Produit d'Épargne Professionnel (SFD)</label>
                <select
                  value={compteForm.type_compte}
                  onChange={e => {
                    const sel = EPARGNE_PRODUITS.find(p => p.code === e.target.value)
                    setCompteForm({
                      ...compteForm,
                      type_compte: e.target.value,
                      taux_remuneration: sel ? sel.taux : 3.5,
                      depot_initial: sel ? sel.depotMin : 0
                    })
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none font-bold"
                >
                  {EPARGNE_PRODUITS.map(p => (
                    <option key={p.code} value={p.code}>
                      {p.label} (Taux: {p.taux}% • Min: {fmt(p.depotMin)})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  {EPARGNE_PRODUITS.find(p => p.code === compteForm.type_compte)?.desc}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Taux Intérêt Annuel %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={compteForm.taux_remuneration}
                    onChange={e => setCompteForm({ ...compteForm, taux_remuneration: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Dépôt Initial (FCFA)</label>
                  <input
                    type="number"
                    value={compteForm.depot_initial}
                    onChange={e => setCompteForm({ ...compteForm, depot_initial: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompteModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-black rounded-xl text-xs"
                >
                  Valider l'Ouverture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dépôt / Retrait d'Épargne */}
      {showOperationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" />
                Opération Dépôt / Retrait d'Épargne
              </h3>
              <button onClick={() => setShowOperationModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOperation} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Type de Mouvement *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOperationForm({ ...operationForm, type_operation: 'DEPOT' })}
                    className={clsx(
                      'py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5',
                      operationForm.type_operation === 'DEPOT' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    <ArrowDownRight className="w-4 h-4" /> DÉPÔT
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationForm({ ...operationForm, type_operation: 'RETRAIT' })}
                    className={clsx(
                      'py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5',
                      operationForm.type_operation === 'RETRAIT' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    <ArrowUpRight className="w-4 h-4" /> RETRAIT
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Compte Bénéficiaire / Débiteur *</label>
                <select
                  required
                  value={operationForm.compte_id}
                  onChange={e => setOperationForm({ ...operationForm, compte_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none font-bold"
                >
                  <option value="">Sélectionner le compte...</option>
                  {comptes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.numero_compte} — {c.membre_nom} (Solde : {fmt(Number(c.solde))})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Montant Opération (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    placeholder="Montant FCFA"
                    value={operationForm.montant}
                    onChange={e => setOperationForm({ ...operationForm, montant: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Frais de Retrait / Gestion</label>
                  <input
                    type="number"
                    min="0"
                    value={operationForm.frais_operation}
                    onChange={e => setOperationForm({ ...operationForm, frais_operation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Mode de Règlement</label>
                <select
                  value={operationForm.mode_reglement}
                  onChange={e => setOperationForm({ ...operationForm, mode_reglement: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                >
                  <option value="ESPECES">Espèces (Guichet Caisse)</option>
                  <option value="MOBILE_MONEY">Mobile Money (MTN MoMo / Moov)</option>
                  <option value="VIREMENT_BANCAIRE">Virement Bancaire</option>
                  <option value="COLLECTEUR">Reçu par Collecteur Terrain</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Observation / Motif</label>
                <input
                  type="text"
                  placeholder="Ex: Versement bimensuel, Retrait pour urgence"
                  value={operationForm.observation}
                  onChange={e => setOperationForm({ ...operationForm, observation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOperationModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={clsx(
                    'px-5 py-2 text-white font-black rounded-xl text-xs shadow-md transition',
                    operationForm.type_operation === 'DEPOT' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  )}
                >
                  Valider & Imprimer Reçu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Reçu Officiel d'Épargne Imprimable */}
      {printRecuData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm">Reçu Officiel d'Épargne</h3>
              <button onClick={() => setPrintRecuData(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div id="recu-print-area" className="border border-dashed border-slate-300 p-4 rounded-2xl text-xs space-y-3 font-mono">
              <div className="text-center border-b border-slate-200 pb-2">
                <h4 className="font-black text-slate-900 text-sm uppercase">{company?.name || 'INSTITUTION DE MICROFINANCE'}</h4>
                <p className="text-[10px] text-slate-500">Agréée UEMOA • Loi 2025-14 Bénin</p>
                <p className="text-[10px] text-slate-400 mt-1 font-bold">REÇU DE CAISSE N° {printRecuData.reference}</p>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Date :</span>
                  <span className="font-bold">{new Date(printRecuData.date_operation).toLocaleString('fr-FR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Membre :</span>
                  <span className="font-bold">{printRecuData.membre_nom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">N° Compte :</span>
                  <span className="font-bold">{printRecuData.numero_compte}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Opération :</span>
                  <span className="font-black text-indigo-700">{printRecuData.type_operation}</span>
                </div>
              </div>

              <div className="border-t border-b border-slate-200 py-2 space-y-1">
                <div className="flex justify-between font-black text-sm">
                  <span>MONTANT :</span>
                  <span>{fmt(Number(printRecuData.montant))}</span>
                </div>
                {Number(printRecuData.frais_operation) > 0 && (
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Frais appliqués :</span>
                    <span>{fmt(Number(printRecuData.frais_operation))}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-slate-700 pt-1">
                  <span>NOUVEAU SOLDE :</span>
                  <span className="font-bold text-emerald-700">{fmt(Number(printRecuData.solde_apres))}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 text-center pt-1">
                <p>Opérateur : {printRecuData.agent_nom}</p>
                <p className="italic">Conservez ce reçu pour tout contrôle.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPrintRecuData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Fermer
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" /> Imprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALE FICHE MEMBRE COMPLÈTE — 10 ONGLETS MÉTIER SFD               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {selectedMembreDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp">
            {/* EN-TÊTE FICHE MEMBRE AVEC SOLDE GLOBAL */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
              <button
                onClick={() => setSelectedMembreDetail(null)}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-200 flex items-center justify-center text-xl font-black shadow-inner">
                    {selectedMembreDetail.nom_complet.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 font-mono font-bold">
                        {selectedMembreDetail.numero_membre}
                      </span>
                      <span className={clsx(
                        'text-xs px-2.5 py-0.5 rounded-full font-bold',
                        selectedMembreDetail.statut === 'ACTIF' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-300'
                      )}>
                        ● {selectedMembreDetail.statut}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                        KYC {selectedMembreDetail.kyc_niveau_risque}
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-white mt-1">
                      {selectedMembreDetail.civilite} {selectedMembreDetail.nom_complet}
                    </h2>
                    <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                      <span>{selectedMembreDetail.profession || 'Activité non spécifiée'}</span>
                      <span>•</span>
                      <span>{selectedMembreDetail.telephone}</span>
                      <span>•</span>
                      <span>{selectedMembreDetail.ville}</span>
                    </p>
                  </div>
                </div>

                {/* SYNTHÈSE FINANCIÈRE GLOBALE DU MEMBRE */}
                <div className="flex items-center gap-3 bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">Solde Épargne Total</p>
                    <p className="text-sm font-black text-emerald-400 font-mono">
                      {fmt(comptes.filter(c => c.membre_id === selectedMembreDetail.id).reduce((s, c) => s + Number(c.solde || 0), 0))}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-white/20" />
                  <div className="text-right">
                    <p className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">Encours Crédit Dû</p>
                    <p className="text-sm font-black text-rose-400 font-mono">
                      {fmt(memberCredits.reduce((s, c) => s + Number(c.solde_restant || 0), 0))}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-white/20" />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPrintCarteMembre(selectedMembreDetail)}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                      title="Imprimer Carte de Membre"
                    >
                      <User className="w-3.5 h-3.5" /> Carte
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                      title="Imprimer Fiche Complète"
                    >
                      <Printer className="w-3.5 h-3.5" /> Fiche
                    </button>
                  </div>
                </div>
              </div>

              {/* BARRE DES 10 ONGLETS DE NAVIGATION */}
              <div className="flex items-center gap-1 overflow-x-auto mt-6 pt-2 border-t border-white/10 scrollbar-none text-xs">
                {[
                  { id: 'profil', label: '1. Profil', icon: User },
                  { id: 'epargne', label: '2. Épargne', icon: Wallet },
                  { id: 'credits', label: '3. Crédits', icon: CreditCard },
                  { id: 'remboursements', label: '4. Remboursements', icon: CheckCircle2 },
                  { id: 'tontines', label: '5. Tontines', icon: Award },
                  { id: 'garanties', label: '6. Garanties', icon: Shield },
                  { id: 'transactions', label: '7. Transactions', icon: History },
                  { id: 'parts_sociales', label: '8. Parts Sociales', icon: Layers },
                  { id: 'documents', label: '9. Documents', icon: FileCheck },
                  { id: 'historique', label: '10. Historique', icon: Building }
                ].map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeMemberTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveMemberTab(tab.id as any)}
                      className={clsx(
                        'px-3 py-2 rounded-xl font-bold whitespace-nowrap transition flex items-center gap-1.5',
                        isActive
                          ? 'bg-white text-slate-900 shadow-md'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* CONTENU DE L'ONGLET ACTIF */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              {/* 1. ONGLET PROFIL */}
              {activeMemberTab === 'profil' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-600" /> État Civil & Identité
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Civilité & Nom :</span>
                          <span className="font-bold text-slate-900">{selectedMembreDetail.civilite} {selectedMembreDetail.nom_complet}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Sexe :</span>
                          <span className="font-bold text-slate-900">{selectedMembreDetail.sexe === 'M' ? 'Masculin' : 'Féminin'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Date Naissance :</span>
                          <span className="font-mono text-slate-700">{selectedMembreDetail.date_naissance || 'Non renseignée'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Profession :</span>
                          <span className="font-bold text-slate-800">{selectedMembreDetail.profession || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Activité Cible :</span>
                          <span className="font-bold text-indigo-700">{selectedMembreDetail.secteur_activite || 'Commerce'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-indigo-600" /> Coordonnées & Pièce
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Téléphone :</span>
                          <span className="font-mono font-bold text-slate-900">{selectedMembreDetail.telephone}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Email :</span>
                          <span className="text-slate-700">{selectedMembreDetail.email || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Adresse / Ville :</span>
                          <span className="text-slate-800 font-semibold">{selectedMembreDetail.adresse || ''}, {selectedMembreDetail.ville}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Pièce :</span>
                          <span className="font-bold text-slate-900">{selectedMembreDetail.piece_identite_type} N° {selectedMembreDetail.piece_identite_numero || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Expiration Pièce :</span>
                          <span className="font-mono text-slate-700">{selectedMembreDetail.piece_expire_le || 'Non renseignée'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Contacts & Adhésion
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Urgence / Contact :</span>
                          <span className="font-bold text-slate-900">{selectedMembreDetail.personne_contact_nom || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Tél Urgence :</span>
                          <span className="font-mono text-slate-700">{selectedMembreDetail.personne_contact_tel || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Bénéficiaire :</span>
                          <span className="font-bold text-slate-900">{selectedMembreDetail.beneficiaire_nom || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Agent Collecteur :</span>
                          <span className="font-semibold text-indigo-700">{selectedMembreDetail.agent_collecteur_nom || 'Non assigné'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Date Adhésion :</span>
                          <span className="font-mono text-slate-700">{new Date(selectedMembreDetail.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions de statut du membre */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Statut du Membre dans l'Institution</h4>
                      <p className="text-[11px] text-slate-500">Mettre à jour le statut réglementaire (Actif, Suspendu, Radié)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {['ACTIF', 'SUSPENDU', 'RADIE'].map((st) => (
                        <button
                          key={st}
                          onClick={async () => {
                            try {
                              await supabaseTenant('microfinance_membres').update({ statut: st }).eq('id', selectedMembreDetail.id)
                              setSelectedMembreDetail({ ...selectedMembreDetail, statut: st })
                              toast.success('Statut mis à jour', `Le membre est désormais ${st}.`)
                              loadAllData()
                            } catch (e: any) {
                              toast.error('Erreur', e.message)
                            }
                          }}
                          className={clsx(
                            'px-3 py-1.5 rounded-xl text-xs font-bold transition',
                            selectedMembreDetail.statut === st
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          )}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. ONGLET ÉPARGNE */}
              {activeMemberTab === 'epargne' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Comptes d'Épargne du Membre</h4>
                      <p className="text-xs text-slate-500">Liste des comptes actifs selon les 7 produits SFD</p>
                    </div>
                    <button
                      onClick={() => {
                        setCompteForm({ ...compteForm, membre_id: selectedMembreDetail.id })
                        setShowCompteModal(true)
                      }}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nouveau Compte
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {comptes.filter(c => c.membre_id === selectedMembreDetail.id).map((c) => (
                      <div key={c.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-slate-500">{c.numero_compte}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {c.statut}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{c.type_compte}</p>
                          <p className="text-lg font-black text-emerald-600 font-mono mt-0.5">{fmt(Number(c.solde))}</p>
                          <p className="text-[10px] text-slate-400">Rémunération : {c.taux_remuneration}% / an</p>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => {
                              setOperationForm(f => ({ ...f, compte_id: c.id }))
                              setShowOperationModal(true)
                            }}
                            className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs text-center transition"
                          >
                            Dépôt / Retrait
                          </button>
                          <button
                            onClick={() => setPrintReleveCompte(c)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 transition"
                          >
                            <FileText className="w-3 h-3" /> Relevé
                          </button>
                        </div>
                      </div>
                    ))}
                    {comptes.filter(c => c.membre_id === selectedMembreDetail.id).length === 0 && (
                      <div className="col-span-2 p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                        <p>Aucun compte d'épargne ouvert pour ce membre.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. ONGLET CRÉDITS */}
              {activeMemberTab === 'credits' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900">Dossiers de Crédit & Prêts</h4>
                  {memberCredits.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                      <p>Aucun crédit enregistré pour ce membre.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Référence</th>
                            <th className="py-2.5 px-3">Montant Accordé</th>
                            <th className="py-2.5 px-3">Durée</th>
                            <th className="py-2.5 px-3">Taux / TEG</th>
                            <th className="py-2.5 px-3 text-right">Solde Restant</th>
                            <th className="py-2.5 px-3 text-center">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {memberCredits.map(c => (
                            <tr key={c.id}>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{c.reference}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{fmt(Number(c.montant_accorde))}</td>
                              <td className="py-2.5 px-3">{c.duree_mois} mois</td>
                              <td className="py-2.5 px-3 font-mono">{c.taux_interet}%</td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-rose-600">{fmt(Number(c.solde_restant))}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                  {c.statut}
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

              {/* 4. ONGLET REMBOURSEMENTS */}
              {activeMemberTab === 'remboursements' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900">Historique des Échéances Remboursées</h4>
                  {memberRembs.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                      <p>Aucun remboursement enregistré pour le moment.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Réf Prêt</th>
                            <th className="py-2.5 px-3 text-right">Principal</th>
                            <th className="py-2.5 px-3 text-right">Intérêt</th>
                            <th className="py-2.5 px-3 text-right">Total Versé</th>
                            <th className="py-2.5 px-3">Mode</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {memberRembs.map((r, i) => (
                            <tr key={i}>
                              <td className="py-2.5 px-3 font-mono">{new Date(r.date_remboursement || r.created_at).toLocaleDateString('fr-FR')}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{r.credit_ref || '-'}</td>
                              <td className="py-2.5 px-3 text-right font-mono">{fmt(Number(r.ventilation_principal || 0))}</td>
                              <td className="py-2.5 px-3 text-right font-mono">{fmt(Number(r.ventilation_interet || 0))}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600">{fmt(Number(r.montant_verse || 0))}</td>
                              <td className="py-2.5 px-3">{r.mode_paiement}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 5. ONGLET TONTINES */}
              {activeMemberTab === 'tontines' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900">Participations Tontines (Collectives & 31 Jours)</h4>
                  {memberTontines.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                      <p>Aucun contrat de tontine associé à ce membre.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {memberTontines.map((t, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-bold text-xs text-indigo-700">{t.reference}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">{t.statut_cycle}</span>
                          </div>
                          <p className="text-xs text-slate-500">Mise journalière : <b className="text-slate-900">{fmt(Number(t.mise_journaliere))}</b></p>
                          <p className="text-xs text-slate-500">Épargne accumulée : <b className="text-emerald-600">{fmt(Number(t.montant_epargne_accumule))}</b> ({t.jours_payes}/31 jours)</p>
                          <p className="text-[10px] text-slate-400">Collecteur : {t.agent_collecteur_nom || '-'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 6. ONGLET GARANTIES */}
              {activeMemberTab === 'garanties' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900">Garanties Déposées & Cautions Solidaires</h4>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      Engagements et sûretés enregistrés
                    </div>
                    <p className="text-xs text-slate-500">
                      Sûretés réelles (matérielles, épargne bloquée, gage) et cautions solidaires avec valorisation conservatrice réglementaire (70%).
                    </p>
                    <div className="p-4 bg-slate-50 rounded-xl text-xs space-y-1">
                      <p className="font-bold text-slate-800">Valorisation indicative disponible :</p>
                      <p className="text-slate-600">Épargne bloquée nantissable : <span className="font-mono font-bold text-emerald-700">{fmt(comptes.filter(c => c.membre_id === selectedMembreDetail.id && c.type_compte === 'EPARGNE_BLOQUEE').reduce((s, c) => s + Number(c.solde), 0))}</span></p>
                    </div>
                  </div>
                </div>
              )}

              {/* 7. ONGLET TRANSACTIONS */}
              {activeMemberTab === 'transactions' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900">Journal Financier Consolidé du Membre</h4>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Réf</th>
                          <th className="py-2.5 px-3">Opération</th>
                          <th className="py-2.5 px-3 text-right">Montant</th>
                          <th className="py-2.5 px-3">Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {operations.filter(o => o.membre_id === selectedMembreDetail.id).map(op => (
                          <tr key={op.id}>
                            <td className="py-2.5 px-3 font-mono">{new Date(op.date_operation).toLocaleDateString('fr-FR')}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{op.reference}</td>
                            <td className="py-2.5 px-3">
                              <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', op.type_operation === 'DEPOT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
                                {op.type_operation}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">{fmt(Number(op.montant))}</td>
                            <td className="py-2.5 px-3">{op.mode_reglement}</td>
                          </tr>
                        ))}
                        {operations.filter(o => o.membre_id === selectedMembreDetail.id).length === 0 && (
                          <tr><td colSpan={5} className="p-8 text-center text-slate-400">Aucune opération financière trouvée.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 8. ONGLET PARTS SOCIALES */}
              {activeMemberTab === 'parts_sociales' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Participation au Capital Social & Statut Mutualiste
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Parts Souscrites</p>
                      <p className="text-base font-black text-slate-900 mt-1">1 part</p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">Parts Libérées</p>
                      <p className="text-base font-black text-emerald-700 mt-1">10 000 FCFA</p>
                    </div>
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                      <p className="text-[10px] font-bold text-indigo-600 uppercase">Qualité Membre</p>
                      <p className="text-base font-black text-indigo-700 mt-1">Sociétaire Validé</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Les parts sociales confèrent au membre la qualité de sociétaire conformément à la loi n°2025-14 et aux statuts de l'institution SFD.
                  </p>
                </div>
              )}

              {/* 9. ONGLET DOCUMENTS */}
              {activeMemberTab === 'documents' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-indigo-600" />
                    Dossier KYC & Pièces Justificatives
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-800">Copie Pièce d'Identité ({selectedMembreDetail.piece_identite_type})</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">CONFORME</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-800">Fiche d'Adhésion Signée & Spécimen de Signature</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">ARCHIVÉ</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-800">Justificatif de Domicile / Activité</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">VALIDÉ</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 10. ONGLET HISTORIQUE / AUDIT */}
              {activeMemberTab === 'historique' && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Building className="w-4 h-4 text-indigo-600" />
                    Piste d'Audit & Journal des Modifications
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                      <div>
                        <p className="font-bold text-slate-900">Création et adhésion initiale</p>
                        <p className="text-[10px] text-slate-500">Enregistré par {user?.email || 'Administrateur'}</p>
                      </div>
                      <span className="font-mono text-slate-400 text-[10px]">
                        {new Date(selectedMembreDetail.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* PIED DE MODALE */}
            <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center">
              <span className="text-[11px] text-slate-400">
                SFD ID: {selectedMembreDetail.id.slice(0, 8)}... • Agréé UEMOA
              </span>
              <button
                onClick={() => setSelectedMembreDetail(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold"
              >
                Fermer la Fiche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALE CARTE DE MEMBRE IMPRIMABLE                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {printCarteMembre && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm">Carte Officielle de Membre SFD</h3>
              <button onClick={() => setPrintCarteMembre(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div id="carte-membre-area" className="border-2 border-indigo-900 rounded-2xl p-5 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white space-y-4 shadow-lg">
              <div className="flex justify-between items-start border-b border-indigo-700/50 pb-2">
                <div>
                  <h4 className="font-black text-sm uppercase tracking-wider">{company?.name || 'INSTITUTION DE MICROFINANCE'}</h4>
                  <p className="text-[9px] text-indigo-300">CARTE D'ADHÉRENT • UEMOA BENIN</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-500/30 text-indigo-200">
                  {printCarteMembre.numero_membre}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-lg font-black text-white">
                  {printCarteMembre.nom_complet.slice(0, 2).toUpperCase()}
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-black text-white">{printCarteMembre.civilite} {printCarteMembre.nom_complet}</p>
                  <p className="text-[11px] text-indigo-200">{printCarteMembre.telephone}</p>
                  <p className="text-[10px] text-indigo-300">{printCarteMembre.profession || 'Adhérent'} • {printCarteMembre.ville}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-indigo-700/50 flex justify-between items-center text-[9px] text-indigo-300">
                <span>Adhésion : {new Date(printCarteMembre.created_at).toLocaleDateString('fr-FR')}</span>
                <span>Statut : {printCarteMembre.statut}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPrintCarteMembre(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Fermer
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" /> Imprimer Carte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALE RELEVÉ D'ÉPARGNE OFFICIEL                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {printReleveCompte && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm">Relevé de Compte d'Épargne</h3>
              <button onClick={() => setPrintReleveCompte(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div id="releve-print-area" className="p-6 border border-slate-200 rounded-2xl text-xs space-y-4">
              <div className="text-center border-b border-slate-200 pb-3">
                <h4 className="font-black text-slate-900 text-base uppercase">{company?.name || 'INSTITUTION DE MICROFINANCE'}</h4>
                <p className="text-[10px] text-slate-500">Système Financier Décentralisé • UEMOA</p>
                <h5 className="font-black text-indigo-700 text-xs mt-2 uppercase">RELEVÉ DE SITUATION D'ÉPARGNE</h5>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[11px] bg-slate-50 p-3 rounded-xl">
                <div>
                  <p><b className="text-slate-600">Titulaire :</b> {printReleveCompte.membre_nom}</p>
                  <p><b className="text-slate-600">N° Compte :</b> <span className="font-mono">{printReleveCompte.numero_compte}</span></p>
                </div>
                <div className="text-right">
                  <p><b className="text-slate-600">Produit :</b> {printReleveCompte.type_compte}</p>
                  <p><b className="text-slate-600">Solde Actuel :</b> <span className="font-mono font-black text-emerald-700">{fmt(Number(printReleveCompte.solde))}</span></p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-100 font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Référence</th>
                      <th className="py-2 px-2">Opération</th>
                      <th className="py-2 px-2 text-right">Montant</th>
                      <th className="py-2 px-2 text-right">Solde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {operations.filter(o => o.compte_id === printReleveCompte.id).map(op => (
                      <tr key={op.id}>
                        <td className="py-1.5 px-2 font-mono">{new Date(op.date_operation).toLocaleDateString('fr-FR')}</td>
                        <td className="py-1.5 px-2 font-mono text-slate-500">{op.reference}</td>
                        <td className="py-1.5 px-2">{op.type_operation}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold">{fmt(Number(op.montant))}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{fmt(Number(op.solde_apres))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-center text-[10px] text-slate-400 pt-3 border-t border-slate-200">
                Document délivré pour servir et valoir ce que de droit. Date d'édition : {new Date().toLocaleString('fr-FR')}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPrintReleveCompte(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Fermer
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" /> Imprimer Relevé
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MembresEpargnePage
