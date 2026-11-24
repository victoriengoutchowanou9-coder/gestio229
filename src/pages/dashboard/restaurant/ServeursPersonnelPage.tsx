import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Plus, RefreshCw, Award, Percent, DollarSign,
  Phone, UserCheck, Shield, ChevronRight, X, Search,
  Wine, Wallet, ArrowDownRight, CheckCircle2, Clock,
  AlertTriangle, FileText, Check, ShieldAlert, RotateCcw, Package,
  Sparkles, Utensils
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useAuthStore } from '../../../store/authStore'
import { formatFCFA } from '../../../utils/tax'
import {
  attribuerBoissonServeuse,
  enregistrerVersementServeur,
  cloturerSessionServeuse,
  cloturerSessionServeuseEtVerserCaisse,
  obtenirSuiviSessionServeuse,
  SessionSuiviDetail,
  enregistrerRetourEmballageSession,
  ServeurSession,
  BoissonConfiee,
  VersementServeur
} from '../../../services/restaurantService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const ServeursPersonnelPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { user } = useAuthStore()
  const { toast } = useUIStore()

  // Navigation par onglets
  const [activeTab, setActiveTab] = useState<'EQUIPE' | 'SESSIONS_BAR' | 'PRESENCES' | 'PLAINTES'>('SESSIONS_BAR')

  // Données
  const [personnel, setPersonnel] = useState<any[]>([])
  const [sessions, setSessions] = useState<ServeurSession[]>([])
  const [boissonsConfiees, setBoissonsConfiees] = useState<BoissonConfiee[]>([])
  const [versements, setVersements] = useState<VersementServeur[]>([])
  const [presences, setPresences] = useState<any[]>([])
  const [plaintes, setPlaintes] = useState<any[]>([])
  const [creances, setCreances] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [commandesList, setCommandesList] = useState<any[]>([])
  const [staffModalTab, setStaffModalTab] = useState<'COMMANDES' | 'PAIEMENTS' | 'HISTORIQUE' | 'BOUTEILLES' | 'ANNULATIONS' | 'SESSIONS'>('COMMANDES')
  const [selectedCreanceForBottles, setSelectedCreanceForBottles] = useState<any | null>(null)
  const [bottleReturnQty, setBottleReturnQty] = useState<number>(1)
  const [showBottleReturnModal, setShowBottleReturnModal] = useState<boolean>(false)
  const [selectedCreanceToPay, setSelectedCreanceToPay] = useState<any | null>(null)
  const [paiementMontant, setPaiementMontant] = useState<number>(0)
  const [paiementMode, setPaiementMode] = useState<string>('ESPECES')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSessionStatut, setFilterSessionStatut] = useState<'ALL' | 'OUVERTE' | 'CLOTUREE'>('OUVERTE')

  // Modales
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [showRemiseModal, setShowRemiseModal] = useState(false)
  const [showVersementModal, setShowVersementModal] = useState(false)
  const [showRetourEmballageModal, setShowRetourEmballageModal] = useState(false)
  const [showClotureModal, setShowClotureModal] = useState(false)
  const [showPresenceModal, setShowPresenceModal] = useState(false)
  const [showPlainteModal, setShowPlainteModal] = useState(false)
  const [showPaiementCreanceModal, setShowPaiementCreanceModal] = useState(false)

  const [selectedSession, setSelectedSession] = useState<ServeurSession | null>(null)
  const [sessionSuiviDetail, setSessionSuiviDetail] = useState<SessionSuiviDetail | null>(null)
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<any | null>(null)

  // Formulaires
  const [memberForm, setMemberForm] = useState({
    matricule: '',
    nom_complet: '',
    role: 'SERVEUR',
    telephone: '',
    zone_attribuee: 'Salle principale',
    taux_commission: 2,
    notes: ''
  })

  const [sessionForm, setSessionForm] = useState({
    serveur_nom: '',
    fonds_initial: 0,
    notes: ''
  })

  const [remiseForm, setRemiseForm] = useState({
    produit_nom: '',
    qte_remise: 10,
    prix_vente_unitaire: 1000,
    cout_achat_unitaire: 600,
    notes: ''
  })

  const [versementForm, setVersementForm] = useState({
    montant: 20000,
    mode_reglement: 'ESPECES' as const,
    commentaire: ''
  })

  const [retourEmballageForm, setRetourEmballageForm] = useState({
    boisson_id: '',
    format_bouteille: '12T' as '12T' | '20T' | '24T' | 'BOUTEILLE_65CL' | 'BOUTEILLE_50CL' | 'EAU_MINERALE' | 'AUTRE',
    designation: '',
    qte_rendue: 1,
    max_rendable: 1,
    notes: ''
  })

  const [clotureForm, setClotureForm] = useState({
    montant_verse: 0,
    mode_reglement: 'ESPECES',
    justification_ecart: ''
  })

  const [presenceForm, setPresenceForm] = useState({
    nom_complet: '',
    heure_prevue_arrivee: '17:00',
    heure_reelle_arrivee: '17:00',
    statut: 'PRESENT',
    commentaire: ''
  })

  const [plainteForm, setPlainteForm] = useState({
    personne_concernee: '',
    type_incident: 'ERREUR_CAISSE',
    gravite: 'MOYENNE',
    description: '',
    responsable_suivi: ''
  })

  // Chargement des données
  const loadAllData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [srvRes, sessRes, confRes, vmtRes, presRes, pltRes, creanceRes, reglRes, cmdRes] = await Promise.all([
        supabaseTenant('restaurant_serveurs').select('*').order('nom_complet'),
        supabaseTenant('restaurant_sessions_serveurs').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseTenant('restaurant_boissons_confiees').select('*').order('created_at', { ascending: false }).limit(100),
        supabaseTenant('restaurant_versements_serveurs').select('*').order('date_versement', { ascending: false }).limit(100),
        supabaseTenant('restaurant_presences').select('*').order('date_presence', { ascending: false }).limit(50),
        supabaseTenant('restaurant_plaintes_incidents').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseTenant('restaurant_creances_serveuses').select('*').order('date_creation', { ascending: false }).limit(100),
        supabaseTenant('restaurant_reglements_serveuses').select('*').order('date_reglement', { ascending: false }).limit(100),
        supabaseTenant('restaurant_commandes').select('*').order('created_at', { ascending: false }).limit(100)
      ])

      setPersonnel(srvRes.data || [])
      setSessions(sessRes.data || [])
      setBoissonsConfiees(confRes.data || [])
      setVersements(vmtRes.data || [])
      setPresences(presRes.data || [])
      setPlaintes(pltRes.data || [])
      setCreances(creanceRes.data || [])
      setReglements(reglRes.data || [])
      setCommandesList(cmdRes.data || [])

      if (selectedSession) {
        const updated = (sessRes.data || []).find((s: any) => s.id === selectedSession.id)
        if (updated) setSelectedSession(updated)
      }
    } catch (err: any) {
      console.warn('[ServeursPersonnelPage] Notice load:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, selectedSession])

  useEffect(() => {
    loadAllData()
  }, [companyId])

  // Chargement automatique du suivi bivalent (Bar + Restaurant) en temps réel
  useEffect(() => {
    if (!selectedSession?.id || !companyId) {
      setSessionSuiviDetail(null)
      return
    }
    let isMounted = true
    obtenirSuiviSessionServeuse(selectedSession.id, companyId)
      .then((detail) => {
        if (isMounted) setSessionSuiviDetail(detail)
      })
      .catch((err) => {
        console.warn('[ServeursPersonnelPage] Erreur chargement suivi session:', err)
      })
    return () => { isMounted = false }
  }, [selectedSession?.id, companyId])

  // Actions
  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberForm.nom_complet.trim() || !memberForm.matricule.trim()) return
    try {
      await supabaseTenant('restaurant_serveurs').insert({
        matricule: memberForm.matricule.trim().toUpperCase(),
        nom_complet: memberForm.nom_complet.trim(),
        role: memberForm.role,
        telephone: memberForm.telephone,
        zone_attribuee: memberForm.zone_attribuee,
        taux_commission: Number(memberForm.taux_commission) || 0,
        statut: 'ACTIF',
        notes: memberForm.notes
      })
      toast.success('Membre ajouté', `${memberForm.nom_complet} enregistré.`)
      setShowMemberModal(false)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault()
    const srvNom = sessionForm.serveur_nom.trim()
    if (!srvNom) return
    try {
      // 1. Rechercher ou créer automatiquement la serveuse dans restaurant_serveurs
      let srvId: string | null = null
      const existing = personnel.find(p => p.nom_complet && p.nom_complet.trim().toLowerCase() === srvNom.toLowerCase())
      if (existing) {
        srvId = existing.id
      } else {
        try {
          const { data: newSrv } = await supabaseTenant('restaurant_serveurs').insert({
            matricule: `SRV-${srvNom.replace(/\s+/g, '').slice(0, 3).toUpperCase()}`,
            nom_complet: srvNom,
            role: 'SERVEUR',
            telephone: '',
            zone_attribuee: 'Salle principale',
            taux_commission: 2,
            statut: 'ACTIF',
            notes: 'Enregistrée automatiquement lors de l\'ouverture de session'
          }).select('id').maybeSingle()
          if (newSrv) srvId = newSrv.id
        } catch (autoErr) {
          console.warn('[ServeursPersonnelPage] Notice création automatique serveuse:', autoErr)
        }
      }

      // 2. Insérer la session avec serveur_id lié
      const { data, error } = await supabaseTenant('restaurant_sessions_serveurs').insert({
        serveur_id: srvId,
        serveur_nom: srvNom,
        date_session: new Date().toISOString().slice(0, 10),
        heure_ouverture: new Date().toISOString(),
        fonds_initial: Number(sessionForm.fonds_initial) || 0,
        statut: 'OUVERTE',
        total_boissons_confiees_ttc: 0,
        total_ventes_declarees_ttc: 0,
        total_versements_recus: 0,
        solde_restant_a_remettre: 0,
        ecart_financier: 0,
        notes: sessionForm.notes
      }).select().single()

      if (error) throw error
      toast.success('Session ouverte', `Session bar ouverte pour ${srvNom}.`)
      setShowSessionModal(false)
      setSelectedSession(data)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur ouverture', err.message)
    }
  }

  const handleRemiseBoisson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession || !remiseForm.produit_nom.trim() || remiseForm.qte_remise <= 0) return

    const success = await attribuerBoissonServeuse({
      company_id: companyId || '',
      session_id: selectedSession.id,
      serveur_nom: selectedSession.serveur_nom,
      produit_nom: remiseForm.produit_nom.trim(),
      qte_remise: Number(remiseForm.qte_remise),
      qte_retournee: 0,
      qte_vendue: 0,
      qte_offerte: 0,
      qte_cassee: 0,
      qte_restante_declaree: Number(remiseForm.qte_remise),
      prix_vente_unitaire: Number(remiseForm.prix_vente_unitaire),
      cout_achat_unitaire: Number(remiseForm.cout_achat_unitaire),
      total_valeur_remise: Number(remiseForm.qte_remise) * Number(remiseForm.prix_vente_unitaire),
      remis_par: ((user as any)?.user_metadata?.full_name || (user as any)?.full_name) || user?.email || 'Gérant Bar',
      notes: remiseForm.notes,
      sector_slug: 'restaurant'
    })

    if (success) {
      toast.success('Boissons remises', `${remiseForm.qte_remise}x ${remiseForm.produit_nom} confiés à ${selectedSession.serveur_nom}.`)
      setShowRemiseModal(false)
      loadAllData()
    } else {
      toast.error('Erreur', 'Impossible d’attribuer les boissons.')
    }
  }

  const handleVersement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession || versementForm.montant <= 0) return

    const res = await enregistrerVersementServeur({
      company_id: companyId || '',
      session_id: selectedSession.id,
      serveur_nom: selectedSession.serveur_nom,
      montant: Number(versementForm.montant),
      mode_reglement: versementForm.mode_reglement,
      recu_par: ((user as any)?.user_metadata?.full_name || (user as any)?.full_name) || user?.email || 'Gérant',
      commentaire: versementForm.commentaire
    })

    if (res.success) {
      toast.success('Versement encaissé', `Reçu ${refFormat(res.reference)} : ${fmt(versementForm.montant)}. Reste dû : ${fmt(res.soldeApres)}`)
      setShowVersementModal(false)
      loadAllData()
    } else {
      toast.error('Erreur', 'Échec enregistrement versement.')
    }
  }

  const detectFormatBouteille = (nom: string): '12T' | '20T' | '24T' | 'BOUTEILLE_65CL' | 'BOUTEILLE_50CL' | 'EAU_MINERALE' | 'AUTRE' => {
    const n = (nom || '').toLowerCase()
    if (n.includes('eau') || n.includes('posso') || n.includes('fifa')) return 'EAU_MINERALE'
    if (n.includes('12t') || n.includes('12 t') || n.includes('casier 12')) return '12T'
    if (n.includes('20t') || n.includes('20 t') || n.includes('casier 20')) return '20T'
    if (n.includes('24t') || n.includes('24 t') || n.includes('casier 24')) return '24T'
    if (n.includes('65cl') || n.includes('65 cl') || n.includes('60cl')) return 'BOUTEILLE_65CL'
    if (n.includes('50cl') || n.includes('33cl') || n.includes('50 cl')) return 'BOUTEILLE_50CL'
    return 'BOUTEILLE_65CL'
  }

  const handleRetourEmballage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession || retourEmballageForm.qte_rendue <= 0) return

    if (retourEmballageForm.max_rendable > 0 && retourEmballageForm.qte_rendue > retourEmballageForm.max_rendable) {
      toast.warning('Quantité excessive', `Le nombre d'emballages à rendre ne peut pas excéder ${retourEmballageForm.max_rendable}.`)
      return
    }

    const res = await enregistrerRetourEmballageSession({
      company_id: companyId || '',
      session_id: selectedSession.id,
      serveur_nom: selectedSession.serveur_nom,
      boisson_id: retourEmballageForm.boisson_id || undefined,
      format_bouteille: retourEmballageForm.format_bouteille,
      designation: retourEmballageForm.designation,
      qte_rendue: Number(retourEmballageForm.qte_rendue),
      receptionne_par: ((user as any)?.user_metadata?.full_name || (user as any)?.full_name) || user?.email || 'Gérant Bar',
      notes: retourEmballageForm.notes
    })

    if (res.success) {
      toast.success(
        'Retour d’emballages enregistré',
        `${retourEmballageForm.qte_rendue} emballages enregistrés pour ${selectedSession.serveur_nom}. (Aucune modification du stock de boisson pleine liquide)`
      )
      setShowRetourEmballageModal(false)
      loadAllData()
    } else {
      toast.error('Erreur', 'Impossible d’enregistrer le retour d’emballages.')
    }
  }

  const handleCloture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession) return

    const res = await cloturerSessionServeuseEtVerserCaisse({
      session_id: selectedSession.id,
      company_id: companyId || '',
      serveur_nom: selectedSession.serveur_nom,
      montant_verse: Number(clotureForm.montant_verse) || 0,
      mode_reglement: clotureForm.mode_reglement || 'ESPECES',
      cloture_par: ((user as any)?.user_metadata?.full_name || (user as any)?.full_name) || user?.email || 'Gérant',
      justification_ecart: clotureForm.justification_ecart
    })

    if (res.success) {
      toast.success(
        'Session clôturée & Versement Caisse validé',
        `Versement de ${fmt(res.montant_verse)} validé en Caisse (Réf: ${res.reference_versement}). Écart: ${fmt(res.ecart)}`
      )
      setShowClotureModal(false)
      loadAllData()
    } else {
      toast.error('Erreur', res.error || 'Impossible de clôturer la session.')
    }
  }

  const handleSavePresence = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!presenceForm.nom_complet.trim()) return
    try {
      await supabaseTenant('restaurant_presences').insert({
        nom_complet: presenceForm.nom_complet.trim(),
        date_presence: new Date().toISOString().slice(0, 10),
        heure_prevue_arrivee: presenceForm.heure_prevue_arrivee,
        heure_reelle_arrivee: presenceForm.heure_reelle_arrivee,
        statut: presenceForm.statut,
        enregistre_par: ((user as any)?.user_metadata?.full_name || (user as any)?.full_name) || user?.email || 'Gérant',
        commentaire: presenceForm.commentaire
      })
      toast.success('Pointage enregistré', `Présence notée pour ${presenceForm.nom_complet}.`)
      setShowPresenceModal(false)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleSavePlainte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plainteForm.personne_concernee.trim() || !plainteForm.description.trim()) return
    try {
      await supabaseTenant('restaurant_plaintes_incidents').insert({
        personne_concernee: plainteForm.personne_concernee.trim(),
        type_incident: plainteForm.type_incident,
        gravite: plainteForm.gravite,
        description: plainteForm.description.trim(),
        responsable_suivi: plainteForm.responsable_suivi.trim() || (((user as any)?.user_metadata?.full_name || (user as any)?.full_name) || 'Gérant'),
        statut: 'SIGNALÉ'
      })
      toast.success('Incident consigné', `Dossier ouvert confidentiellement.`)
      setShowPlainteModal(false)
      loadAllData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const refFormat = (ref: string) => ref || 'REF-N/A'

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-rose-600" />
            Personnel, Comptes Serveuses & Clôtures Service
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Boissons confiées au bar, encaissements successifs, clôtures de caisse, registre de présence et incidents
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadAllData} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          {activeTab === 'SESSIONS_BAR' && (
            <button
              onClick={() => setShowSessionModal(true)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
            >
              <Plus className="w-4 h-4" /> Ouvrir Session Serveuse
            </button>
          )}
          {activeTab === 'EQUIPE' && (
            <button
              onClick={() => setShowMemberModal(true)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
            >
              <Plus className="w-4 h-4" /> Nouveau Membre
            </button>
          )}
          {activeTab === 'PRESENCES' && (
            <button
              onClick={() => setShowPresenceModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
            >
              <Clock className="w-4 h-4" /> Pointer Arrivée / Départ
            </button>
          )}
          {activeTab === 'PLAINTES' && (
            <button
              onClick={() => setShowPlainteModal(true)}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"
            >
              <ShieldAlert className="w-4 h-4" /> Signaler un Incident
            </button>
          )}
        </div>
      </div>

      {/* Onglets navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('SESSIONS_BAR')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition',
            activeTab === 'SESSIONS_BAR' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          <Wine className="w-4 h-4" /> Comptes Serveuses & Clôtures Bar ({sessions.filter(s => s.statut === 'OUVERTE').length} actives)
        </button>
        <button
          onClick={() => setActiveTab('EQUIPE')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition',
            activeTab === 'EQUIPE' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          <Users className="w-4 h-4" /> Effectif & Équipe ({personnel.length})
        </button>
        <button
          onClick={() => setActiveTab('PRESENCES')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition',
            activeTab === 'PRESENCES' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          <Clock className="w-4 h-4" /> Registre Présences & Horaires
        </button>
        <button
          onClick={() => setActiveTab('PLAINTES')}
          className={clsx(
            'px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition',
            activeTab === 'PLAINTES' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          <ShieldAlert className="w-4 h-4" /> Plaintes & Incidents Confidentiels
        </button>
      </div>

      {/* ── ONGLET 1 : SESSIONS SERVEUSES, BOISSONS CONFIÉES & VERSEMENTS ── */}
      {activeTab === 'SESSIONS_BAR' && (
        <div className="space-y-6">
          {/* Filtre sessions : Actives vs Historique clôturé */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterSessionStatut('OUVERTE')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs font-black transition',
                filterSessionStatut === 'OUVERTE' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              Sessions Ouvertes ({sessions.filter(s => s.statut === 'OUVERTE').length})
            </button>
            <button
              onClick={() => setFilterSessionStatut('CLOTUREE')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs font-black transition',
                filterSessionStatut === 'CLOTUREE' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              Historique Clôturées ({sessions.filter(s => s.statut === 'CLOTUREE').length})
            </button>
            <button
              onClick={() => setFilterSessionStatut('ALL')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs font-black transition',
                filterSessionStatut === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              Toutes ({sessions.length})
            </button>
          </div>

          {/* Liste des sessions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sessions
              .filter(s => filterSessionStatut === 'ALL' || s.statut === filterSessionStatut)
              .map(s => {
                const isSelected = selectedSession?.id === s.id
                const isCloturee = s.statut === 'CLOTUREE'

                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSession(s)}
                    className={clsx(
                      'p-5 rounded-3xl border cursor-pointer transition-all flex flex-col justify-between shadow-sm',
                      isSelected ? 'ring-2 ring-rose-500 bg-rose-50/20 border-rose-300' : 'bg-white border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                          <Wine className="w-4 h-4 text-rose-600" />
                          {s.serveur_nom}
                        </span>
                        <span className={clsx(
                          'text-[10px] font-black px-2 py-0.5 rounded-full uppercase',
                          isCloturee ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'
                        )}>
                          {s.statut}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-500">
                          <span>Boissons Confiées :</span>
                          <strong className="text-slate-900 font-mono">{fmt(s.total_boissons_confiees_ttc)}</strong>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Total Versé au Gérant :</span>
                          <strong className="text-emerald-600 font-mono">{fmt(s.total_versements_recus)}</strong>
                        </div>
                        <div className="flex justify-between text-slate-700 font-bold border-t border-slate-100 pt-1.5">
                          <span>Solde Dû par Serveuse :</span>
                          <strong className={clsx('font-mono font-black', s.solde_restant_a_remettre > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                            {fmt(s.solde_restant_a_remettre)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Date : {s.date_session}</span>
                      <span className="text-rose-600 font-bold">Sélectionner →</span>
                    </div>
                  </div>
                )
              })}
            {sessions.filter(s => filterSessionStatut === 'ALL' || s.statut === filterSessionStatut).length === 0 && (
              <div className="col-span-3 p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400 text-xs">
                Aucune session trouvée pour ce filtre.
              </div>
            )}
          </div>

          {/* Détail de la session sélectionnée */}
          {selectedSession && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">
                      Compte Serveuse : {selectedSession.serveur_nom}
                    </h3>
                    <span className={clsx(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      selectedSession.statut === 'OUVERTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    )}>
                      {selectedSession.statut}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ouverte le {new Date(selectedSession.heure_ouverture).toLocaleDateString('fr-FR')} • Fonds initial : {fmt(selectedSession.fonds_initial)}
                    {selectedSession.heure_cloture && ` • Clôturée le ${new Date(selectedSession.heure_cloture).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>

                {selectedSession.statut === 'OUVERTE' && (
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      onClick={() => setShowRemiseModal(true)}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> Remettre Boissons
                    </button>
                    <button
                      onClick={() => {
                        const items = boissonsConfiees.filter(b => b.session_id === selectedSession.id)
                        const firstItem = items[0]
                        const fmtDetected = firstItem ? detectFormatBouteille(firstItem.produit_nom) : '12T'
                        const maxR = firstItem ? Math.max(0, Number(firstItem.qte_remise || 0) - Number(firstItem.qte_retournee || 0)) : 10
                        setRetourEmballageForm({
                          boisson_id: firstItem?.id || '',
                          format_bouteille: fmtDetected,
                          designation: firstItem?.produit_nom || 'Bouteilles Bar',
                          qte_rendue: Math.min(maxR, 1),
                          max_rendable: maxR,
                          notes: ''
                        })
                        setShowRetourEmballageModal(true)
                      }}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retour Emballage
                    </button>
                    <button
                      onClick={() => setShowVersementModal(true)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition"
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Encaisser Versement
                    </button>
                    <button
                      onClick={() => {
    const reste = sessionSuiviDetail?.solde_restant ?? selectedSession.solde_restant_a_remettre ?? 0
    setClotureForm({
      montant_verse: reste,
      mode_reglement: 'ESPECES',
      justification_ecart: ''
    })
    setShowClotureModal(true)
  }}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Clôturer Session
                    </button>
                  </div>
                )}
              </div>

              {/* ── SECTION BIVALVE : SESSION DE SERVICE UNIFIÉE AVEC DEUX SUIVIS DISTINCTS ── */}
              <div className="space-y-6 bg-slate-50/80 p-5 rounded-3xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-rose-600" />
                      Session de Service — {selectedSession.serveur_nom}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Réf: SESS-{selectedSession.id.slice(0, 8).toUpperCase()} • Deux suivis indépendants et accumulation automatique
                    </p>
                  </div>
                  <span className={clsx(
                    'text-xs font-black px-3 py-1 rounded-full uppercase',
                    selectedSession.statut === 'OUVERTE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-700'
                  )}>
                    {selectedSession.statut}
                  </span>
                </div>

                {/* ── SECTION 1 : BAR ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
                      <Wine className="w-4 h-4 text-amber-600" />
                      SECTION 1 : BAR (Boissons & Produits Bar)
                    </h5>
                    <span className="text-xs font-black text-amber-950 font-mono bg-amber-100/80 px-2.5 py-0.5 rounded-lg border border-amber-200">
                      Total BAR : {fmt(sessionSuiviDetail?.total_bar ?? selectedSession.total_bar_ttc ?? 0)}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-amber-50/70 text-amber-950 font-black text-[10px] uppercase border-b border-amber-200/60">
                        <tr>
                          <th className="p-3">Produit Bar</th>
                          <th className="p-3 text-center">Quantité Vente</th>
                          <th className="p-3 text-right">Prix Unitaire</th>
                          <th className="p-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sessionSuiviDetail && sessionSuiviDetail.bar_items.length > 0 ? (
                          sessionSuiviDetail.bar_items.map((b, idx) => (
                            <tr key={idx} className="hover:bg-amber-50/20 transition">
                              <td className="p-3 font-bold text-slate-900">{b.nom}</td>
                              <td className="p-3 text-center font-mono font-black text-slate-800 bg-slate-50/50">{b.quantite}</td>
                              <td className="p-3 text-right font-mono text-slate-600">{fmt(b.prix_unitaire)}</td>
                              <td className="p-3 text-right font-mono font-black text-amber-700">{fmt(b.total)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                              Aucune vente BAR enregistrée pour cette session.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {sessionSuiviDetail && sessionSuiviDetail.bar_items.length > 0 && (
                        <tfoot className="bg-amber-50/50 border-t border-amber-200/80 font-black text-xs">
                          <tr>
                            <td colSpan={3} className="p-3 text-amber-950 uppercase">Total Ventes BAR :</td>
                            <td className="p-3 text-right font-mono text-amber-700 text-sm">{fmt(sessionSuiviDetail.total_bar)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* ── SECTION 2 : RESTAURANT / MAQUIS ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black uppercase text-rose-900 flex items-center gap-1.5">
                      <Utensils className="w-4 h-4 text-rose-600" />
                      SECTION 2 : RESTAURANT / MAQUIS (Plats & Repas)
                    </h5>
                    <span className="text-xs font-black text-rose-950 font-mono bg-rose-100/80 px-2.5 py-0.5 rounded-lg border border-rose-200">
                      Total RESTAURANT : {fmt(sessionSuiviDetail?.total_restaurant ?? selectedSession.total_restaurant_ttc ?? 0)}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-rose-50/70 text-rose-950 font-black text-[10px] uppercase border-b border-rose-200/60">
                        <tr>
                          <th className="p-3">Plat / Repas</th>
                          <th className="p-3 text-center">Quantité Vendue</th>
                          <th className="p-3 text-right">Prix Unitaire</th>
                          <th className="p-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sessionSuiviDetail && sessionSuiviDetail.restaurant_items.length > 0 ? (
                          sessionSuiviDetail.restaurant_items.map((r, idx) => (
                            <tr key={idx} className="hover:bg-rose-50/20 transition">
                              <td className="p-3 font-bold text-slate-900">{r.nom}</td>
                              <td className="p-3 text-center font-mono font-black text-slate-800 bg-slate-50/50">{r.quantite}</td>
                              <td className="p-3 text-right font-mono text-slate-600">{fmt(r.prix_unitaire)}</td>
                              <td className="p-3 text-right font-mono font-black text-rose-700">{fmt(r.total)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                              Aucune vente RESTAURANT / MAQUIS enregistrée pour cette session.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {sessionSuiviDetail && sessionSuiviDetail.restaurant_items.length > 0 && (
                        <tfoot className="bg-rose-50/50 border-t border-rose-200/80 font-black text-xs">
                          <tr>
                            <td colSpan={3} className="p-3 text-rose-950 uppercase">Total Ventes RESTAURANT :</td>
                            <td className="p-3 text-right font-mono text-rose-700 text-sm">{fmt(sessionSuiviDetail.total_restaurant)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* ── RÉCAPITULATIF FINANCIER DE LA SESSION ── */}
                <div className="bg-white p-4 rounded-2xl border-2 border-indigo-200 shadow-sm space-y-2">
                  <h5 className="text-xs font-black uppercase text-indigo-950 tracking-wider flex items-center gap-1.5 border-b pb-2">
                    <DollarSign className="w-4 h-4 text-indigo-600" />
                    Récapitulatif Financier de la Session
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                    <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200/60">
                      <span className="text-[10px] uppercase font-bold text-amber-800 block">Total BAR</span>
                      <strong className="text-sm font-black font-mono text-amber-900">
                        {fmt(sessionSuiviDetail?.total_bar ?? selectedSession.total_bar_ttc ?? 0)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200/60">
                      <span className="text-[10px] uppercase font-bold text-rose-800 block">Total RESTAURANT</span>
                      <strong className="text-sm font-black font-mono text-rose-900">
                        {fmt(sessionSuiviDetail?.total_restaurant ?? selectedSession.total_restaurant_ttc ?? 0)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-200/60">
                      <span className="text-[10px] uppercase font-bold text-indigo-800 block">Total Attendu</span>
                      <strong className="text-sm font-black font-mono text-indigo-950">
                        {fmt(sessionSuiviDetail?.total_general ?? selectedSession.total_ventes_declarees_ttc ?? 0)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/60">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">Déjà Versé Gérant</span>
                      <strong className="text-sm font-black font-mono text-emerald-700">
                        {fmt(selectedSession.total_versements_recus ?? 0)}
                      </strong>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Solde Restant à Reverser par la Serveuse :</span>
                    <strong className={clsx(
                      'text-base font-black font-mono px-3 py-1 rounded-xl',
                      (sessionSuiviDetail?.solde_restant ?? selectedSession.solde_restant_a_remettre ?? 0) > 0
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    )}>
                      {fmt(sessionSuiviDetail?.solde_restant ?? selectedSession.solde_restant_a_remettre ?? 0)}
                    </strong>
                  </div>
                </div>

                {/* ── HISTORIQUE CONSULTABLE DE TOUTES LES VENTES DE LA SESSION ── */}
                {sessionSuiviDetail && sessionSuiviDetail.historique_ventes && sessionSuiviDetail.historique_ventes.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-600" />
                      Historique des Ventes Réalisées ({sessionSuiviDetail.historique_ventes.length} transactions)
                    </h5>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-60 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase sticky top-0">
                          <tr>
                            <th className="p-2.5">N° Commande</th>
                            <th className="p-2.5">Date / Heure</th>
                            <th className="p-2.5 text-center">Circuit</th>
                            <th className="p-2.5 text-center">Table</th>
                            <th className="p-2.5">Détail Articles</th>
                            <th className="p-2.5 text-right">Montant</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sessionSuiviDetail.historique_ventes.map((h, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono font-bold text-slate-800">{h.order_number}</td>
                              <td className="p-2.5 text-slate-500 text-[11px]">{new Date(h.date).toLocaleTimeString('fr-FR')}</td>
                              <td className="p-2.5 text-center">
                                <span className={clsx(
                                  'text-[10px] font-black px-2 py-0.5 rounded-full',
                                  h.circuit === 'BAR' ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'
                                )}>
                                  {h.circuit}
                                </span>
                              </td>
                              <td className="p-2.5 text-center font-bold text-slate-700">{h.table_numero || 'Comptoir'}</td>
                              <td className="p-2.5 text-slate-600 text-[11px]">
                                {h.items && h.items.length > 0
                                  ? h.items.map(it => `${it.quantite}x ${it.nom}`).join(', ')
                                  : 'Vente directe'}
                              </td>
                              <td className="p-2.5 text-right font-mono font-black text-slate-900">{fmt(h.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* TABLEAU DE SUIVI DES BOUTEILLES & EMBALLAGES PAR SERVEUSE (EXIGENCE PAGES 5-8) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-600" />
                    Tableau de Suivi des Bouteilles, Eaux & Emballages
                  </h4>
                  <span className="text-[11px] text-slate-500 font-bold">
                    Formats gérés : Casier 12T, 20T, 24T, Bouteilles 65cl, Eaux
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-black text-[10px] uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-3">Bouteille / Eau</th>
                        <th className="p-3 text-center">Format</th>
                        <th className="p-3 text-center">Qté Remise</th>
                        <th className="p-3 text-right">Prix Unit.</th>
                        <th className="p-3 text-right">Total Dû</th>
                        <th className="p-3 text-center">Sorties</th>
                        <th className="p-3 text-center">Rendus</th>
                        <th className="p-3 text-center text-amber-900 font-black">À Retourner</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {boissonsConfiees
                        .filter(b => b.session_id === selectedSession.id)
                        .map((b, i) => {
                          const formatBtl = detectFormatBouteille(b.produit_nom)
                          const totalSorties = Number(b.qte_remise || 0)
                          const rendus = Number(b.qte_retournee || 0)
                          const aRetourner = Math.max(0, totalSorties - rendus)

                          return (
                            <tr key={i} className="hover:bg-slate-50/60 transition">
                              <td className="p-3 font-black text-slate-900">{b.produit_nom}</td>
                              <td className="p-3 text-center">
                                <span className={clsx(
                                  'text-[10px] font-black px-2 py-0.5 rounded-full',
                                  formatBtl === '12T' ? 'bg-amber-100 text-amber-800' :
                                  formatBtl === '20T' ? 'bg-blue-100 text-blue-800' :
                                  formatBtl === '24T' ? 'bg-purple-100 text-purple-800' :
                                  formatBtl === 'EAU_MINERALE' ? 'bg-cyan-100 text-cyan-800' :
                                  'bg-slate-100 text-slate-700'
                                )}>
                                  {formatBtl}
                                </span>
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-slate-700">{b.qte_remise}</td>
                              <td className="p-3 text-right font-mono text-slate-600">{fmt(b.prix_vente_unitaire)}</td>
                              <td className="p-3 text-right font-mono font-black text-rose-600">{fmt(b.total_valeur_remise)}</td>
                              <td className="p-3 text-center font-mono font-bold text-slate-800">{totalSorties}</td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-600">{rendus}</td>
                              <td className="p-3 text-center font-mono font-black text-amber-700">
                                {aRetourner > 0 ? (
                                  <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                                    {aRetourner}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-bold">Soldé (0)</span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                {selectedSession.statut === 'OUVERTE' && aRetourner > 0 && (
                                  <button
                                    onClick={() => {
                                      setRetourEmballageForm({
                                        boisson_id: b.id || '',
                                        format_bouteille: formatBtl,
                                        designation: b.produit_nom,
                                        qte_rendue: 1,
                                        max_rendable: aRetourner,
                                        notes: ''
                                      })
                                      setShowRetourEmballageModal(true)
                                    }}
                                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition"
                                  >
                                    Retourner
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      {boissonsConfiees.filter(b => b.session_id === selectedSession.id).length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-400">
                            Aucune boisson remise sur cette session.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* GRILLES : Versements & Commandes avec séparation Bar / Cuisine */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Versements successifs au gérant */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    Versements Effectués au Gérant
                  </h4>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase">
                        <tr>
                          <th className="p-3">Heure & Réf</th>
                          <th className="p-3">Mode</th>
                          <th className="p-3 text-right">Montant Versé</th>
                          <th className="p-3 text-right">Reste Dû</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {versements
                          .filter(v => v.session_id === selectedSession.id)
                          .map((v, i) => (
                            <tr key={i} className="hover:bg-slate-50/60">
                              <td className="p-3 font-mono text-[11px] text-slate-600">
                                {v.reference || 'VMT'}
                              </td>
                              <td className="p-3 font-bold text-slate-700">{v.mode_reglement}</td>
                              <td className="p-3 text-right font-mono font-black text-emerald-600">+{fmt(v.montant)}</td>
                              <td className="p-3 text-right font-mono font-bold text-slate-700">{fmt(v.solde_apres)}</td>
                            </tr>
                          ))}
                        {versements.filter(v => v.session_id === selectedSession.id).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-slate-400">Aucun versement enregistré pour le moment.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Commandes prises ou servies par cette serveuse */}
                {(() => {
                  const sessionCreances = creances.filter(c => c.serveur_nom === selectedSession.serveur_nom)
                  const subtotalBar = sessionCreances.filter(c => c.circuit === 'BAR').reduce((sum, c) => sum + (Number(c.montant_initial) || 0), 0)
                  const subtotalCuisine = sessionCreances.filter(c => c.circuit === 'CUISINE').reduce((sum, c) => sum + (Number(c.montant_initial) || 0), 0)
                  const totalOrders = subtotalBar + subtotalCuisine

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          Commandes & Additions Servies
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                          <span className="text-blue-600">Bar : {fmt(subtotalBar)}</span>
                          <span>•</span>
                          <span className="text-orange-600">Cuisine : {fmt(subtotalCuisine)}</span>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase">
                            <tr>
                              <th className="p-3">Commande</th>
                              <th className="p-3 text-center">Circuit</th>
                              <th className="p-3 text-right">Total TTC</th>
                              <th className="p-3 text-right">Reste Dû</th>
                              <th className="p-3 text-center">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sessionCreances.map((c, i) => (
                              <tr key={i} className="hover:bg-slate-50/60">
                                <td className="p-3 font-mono font-bold text-slate-900">{c.order_number}</td>
                                <td className="p-3 text-center">
                                  <span className={clsx('px-2 py-0.5 rounded text-[10px] font-black', c.circuit === 'CUISINE' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800')}>
                                    {c.circuit}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-slate-700">{fmt(c.montant_initial)}</td>
                                <td className="p-3 text-right font-mono font-black text-rose-600">{fmt(c.solde_restant)}</td>
                                <td className="p-3 text-center">
                                  <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-black', c.statut === 'PAYE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
                                    {c.statut}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {sessionCreances.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-slate-400">Aucune commande associée à cette serveuse.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET 2 : EFFECTIF ET ÉQUIPE ── */}
      {activeTab === 'EQUIPE' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par nom ou rôle..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Matricule & Nom</th>
                  <th className="py-3 px-4">Poste / Rôle</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Zone Assignée</th>
                  <th className="py-3 px-4 text-center">Commission</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {personnel
                  .filter(p => !search || p.nom_complet.toLowerCase().includes(search.toLowerCase()))
                  .map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition cursor-pointer">
                      <td className="py-3 px-4 font-black text-slate-900" onClick={() => setSelectedStaffDetail(p)}>
                        <span className="hover:text-rose-600 flex items-center gap-1.5">
                          {p.nom_complet}
                          <span className="text-[10px] text-rose-500 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">Voir fiche & créances →</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">{p.matricule}</span>
                      </td>
                      <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">{p.role}</span></td>
                      <td className="py-3 px-4 font-mono text-slate-600">{p.telephone || '-'}</td>
                      <td className="py-3 px-4 font-bold text-slate-700">{p.zone_attribuee}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">{p.taux_commission} %</td>
                      <td className="py-3 px-4 text-center"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">{p.statut}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ONGLET 3 : PRÉSENCES & HORAIRES ── */}
      {activeTab === 'PRESENCES' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm">Feuille de Présence & Assiduité du Service</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employé(e)</th>
                  <th className="py-3 px-4 text-center">Arrivée Prévue</th>
                  <th className="py-3 px-4 text-center">Arrivée Réelle</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4">Pointé Par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {presences.map((pr, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono text-slate-500">{pr.date_presence}</td>
                    <td className="py-3 px-4 font-black text-slate-900">{pr.nom_complet}</td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">{pr.heure_prevue_arrivee || '17:00'}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">{pr.heure_reelle_arrivee || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-black',
                        pr.statut === 'RETARD' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      )}>
                        {pr.statut}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{pr.enregistre_par}</td>
                  </tr>
                ))}
                {presences.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">Aucun pointage de présence enregistré.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ONGLET 4 : PLAINTES & INCIDENTS ── */}
      {activeTab === 'PLAINTES' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Registre Confidentiel des Incidents & Plaintes
              </h3>
              <p className="text-[11px] text-slate-400">Accès restreint à la direction et au gérant.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date & Réf</th>
                  <th className="py-3 px-4">Personne Concernée</th>
                  <th className="py-3 px-4">Type Incident</th>
                  <th className="py-3 px-4 text-center">Gravité</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plaintes.map((pl, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{pl.reference}</td>
                    <td className="py-3 px-4 font-black text-slate-900">{pl.personne_concernee}</td>
                    <td className="py-3 px-4 font-bold text-slate-700">{pl.type_incident}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-black',
                        pl.gravite === 'CRITIQUE' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      )}>
                        {pl.gravite}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{pl.description}</td>
                    <td className="py-3 px-4 text-center font-bold text-slate-700">{pl.statut}</td>
                  </tr>
                ))}
                {plaintes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">Aucun incident consigné.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODALE 1 : OUVRIR SESSION SERVEUSE ── */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Ouvrir Session Serveuse / Bar</h3>
              <button onClick={() => setShowSessionModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleOpenSession} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom de la Serveuse / Serveur *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Awa Traoré"
                  value={sessionForm.serveur_nom}
                  onChange={e => setSessionForm({ ...sessionForm, serveur_nom: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Fonds Initial Remis (F CFA)</label>
                <input
                  type="number"
                  min="0"
                  value={sessionForm.fonds_initial}
                  onChange={e => setSessionForm({ ...sessionForm, fonds_initial: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-mono outline-none"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowSessionModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md">Ouvrir Session</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 2 : REMISE DE BOISSONS ── */}
      {showRemiseModal && selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Remise de Boissons à {selectedSession.serveur_nom}</h3>
              <button onClick={() => setShowRemiseModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleRemiseBoisson} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Désignation de la Boisson *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Béninoise 65cl, Beaufort, Coca 33cl"
                  value={remiseForm.produit_nom}
                  onChange={e => setRemiseForm({ ...remiseForm, produit_nom: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Quantité remise</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={remiseForm.qte_remise}
                    onChange={e => setRemiseForm({ ...remiseForm, qte_remise: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Prix de vente unitaire</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={remiseForm.prix_vente_unitaire}
                    onChange={e => setRemiseForm({ ...remiseForm, prix_vente_unitaire: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold outline-none text-rose-600"
                  />
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl text-xs flex justify-between font-bold text-rose-900">
                <span>Valeur totale confiée :</span>
                <span className="font-mono">{fmt(remiseForm.qte_remise * remiseForm.prix_vente_unitaire)}</span>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowRemiseModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md">Valider Remise</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 2.b : RETOUR D'EMBALLAGES / BOUTEILLES (EXIGENCE PAGES 5-8) ── */}
      {showRetourEmballageModal && selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Retour d'Emballages / Bouteilles Vides</h3>
                  <p className="text-[10px] text-slate-400">Serveuse : {selectedSession.serveur_nom}</p>
                </div>
              </div>
              <button onClick={() => setShowRetourEmballageModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleRetourEmballage} className="space-y-3.5">
              <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Article :</span>
                  <span>{retourEmballageForm.designation || 'Bouteilles retournées'}</span>
                </div>
                {retourEmballageForm.max_rendable > 0 && (
                  <div className="flex justify-between font-bold text-amber-800">
                    <span>Emballages en attente de retour :</span>
                    <span className="font-mono">{retourEmballageForm.max_rendable}</span>
                  </div>
                )}
                <p className="text-[10px] text-amber-700 pt-1 border-t border-amber-200">
                  🛡️ <strong>Règle d'or :</strong> L'emballage vide n'est pas une boisson pleine. Ce retour n'augmente jamais le stock de boisson liquide.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Format de l'emballage *</label>
                <select
                  value={retourEmballageForm.format_bouteille}
                  onChange={e => setRetourEmballageForm({ ...retourEmballageForm, format_bouteille: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold outline-none"
                >
                  <option value="12T">Casier 12 Trous (12T)</option>
                  <option value="20T">Casier 20 Trous (20T)</option>
                  <option value="24T">Casier 24 Trous (24T)</option>
                  <option value="BOUTEILLE_65CL">Bouteille Verre 65cl (Unité)</option>
                  <option value="BOUTEILLE_50CL">Bouteille Verre 50cl / 33cl (Unité)</option>
                  <option value="EAU_MINERALE">Bouteille Eau Minérale</option>
                  <option value="AUTRE">Autre Format</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Quantité d'emballages retournés *</label>
                <input
                  type="number"
                  min="1"
                  max={retourEmballageForm.max_rendable > 0 ? retourEmballageForm.max_rendable : undefined}
                  required
                  value={retourEmballageForm.qte_rendue}
                  onChange={e => setRetourEmballageForm({ ...retourEmballageForm, qte_rendue: Math.max(1, Number(e.target.value)) })}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-black font-mono text-amber-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Observations</label>
                <input
                  type="text"
                  placeholder="Ex: Casier complet rendu au comptoir..."
                  value={retourEmballageForm.notes}
                  onChange={e => setRetourEmballageForm({ ...retourEmballageForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowRetourEmballageModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md">Valider Retour Emballage</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 3 : VERSEMENT SUCCESSIF AU GÉRANT ── */}
      {showVersementModal && selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Encaisser Versement de {selectedSession.serveur_nom}</h3>
              <button onClick={() => setShowVersementModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleVersement} className="space-y-3.5">
              <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-slate-500">
                  <span>Solde restant dû par la serveuse :</span>
                  <strong className="text-rose-600 font-mono font-bold">{fmt(selectedSession.solde_restant_a_remettre)}</strong>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Montant Versé (F CFA) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={versementForm.montant}
                  onChange={e => setVersementForm({ ...versementForm, montant: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-xl text-base font-mono font-black text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mode de règlement</label>
                <select
                  value={versementForm.mode_reglement}
                  onChange={e => setVersementForm({ ...versementForm, mode_reglement: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold outline-none"
                >
                  <option value="ESPECES">Espèces (Caisse)</option>
                  <option value="MTN_MOMO">MTN Mobile Money</option>
                  <option value="MOOV_MONEY">Moov Money</option>
                  <option value="CARTE">Carte Bancaire / TPE</option>
                </select>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowVersementModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md">Encaisser & Reçu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 4 : CLÔTURE DE SESSION ET VERSEMENT À LA CAISSE (EXIGENCE POINT 7) ── */}
      {showClotureModal && selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-rose-600" />
                  RÉCAPITULATIF DE CLÔTURE DE SESSION
                </h3>
                <p className="text-xs text-slate-500">
                  Serveuse : <strong className="text-slate-800">{selectedSession.serveur_nom}</strong> • Réf : SESS-{selectedSession.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <button onClick={() => setShowClotureModal(false)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleCloture} className="space-y-4 text-xs">
              {/* Horodatage & Détails de session */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Date de Session</span>
                  <strong className="text-slate-800">{selectedSession.date_session}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Heure Ouverture</span>
                  <strong className="text-slate-800">{new Date(selectedSession.heure_ouverture).toLocaleTimeString('fr-FR')}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Heure Clôture</span>
                  <strong className="text-rose-600">{new Date().toLocaleTimeString('fr-FR')}</strong>
                </div>
              </div>

              {/* DÉTAIL BAR */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-black text-amber-900 uppercase flex items-center gap-1">
                    <Wine className="w-3.5 h-3.5 text-amber-600" /> DÉTAIL BAR
                  </span>
                  <span className="font-mono font-bold text-amber-800">
                    Total BAR : {fmt(sessionSuiviDetail?.total_bar ?? selectedSession.total_bar_ttc ?? 0)}
                  </span>
                </div>
                <div className="border border-amber-200/60 rounded-xl overflow-hidden max-h-32 overflow-y-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-amber-50 text-amber-900 font-bold uppercase sticky top-0">
                      <tr>
                        <th className="p-1.5">Produit</th>
                        <th className="p-1.5 text-center">Quantité</th>
                        <th className="p-1.5 text-right">P.U.</th>
                        <th className="p-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100/60">
                      {sessionSuiviDetail && sessionSuiviDetail.bar_items.length > 0 ? (
                        sessionSuiviDetail.bar_items.map((b, i) => (
                          <tr key={i}>
                            <td className="p-1.5">{b.nom}</td>
                            <td className="p-1.5 text-center font-mono">{b.quantite}</td>
                            <td className="p-1.5 text-right font-mono">{fmt(b.prix_unitaire)}</td>
                            <td className="p-1.5 text-right font-mono font-bold text-amber-800">{fmt(b.total)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={4} className="p-2 text-center text-slate-400">Aucun produit bar</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DÉTAIL RESTAURANT / MAQUIS */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-black text-rose-900 uppercase flex items-center gap-1">
                    <Utensils className="w-3.5 h-3.5 text-rose-600" /> DÉTAIL RESTAURANT / MAQUIS
                  </span>
                  <span className="font-mono font-bold text-rose-800">
                    Total RESTAURANT : {fmt(sessionSuiviDetail?.total_restaurant ?? selectedSession.total_restaurant_ttc ?? 0)}
                  </span>
                </div>
                <div className="border border-rose-200/60 rounded-xl overflow-hidden max-h-32 overflow-y-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-rose-50 text-rose-900 font-bold uppercase sticky top-0">
                      <tr>
                        <th className="p-1.5">Plat</th>
                        <th className="p-1.5 text-center">Quantité</th>
                        <th className="p-1.5 text-right">P.U.</th>
                        <th className="p-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100/60">
                      {sessionSuiviDetail && sessionSuiviDetail.restaurant_items.length > 0 ? (
                        sessionSuiviDetail.restaurant_items.map((r, i) => (
                          <tr key={i}>
                            <td className="p-1.5">{r.nom}</td>
                            <td className="p-1.5 text-center font-mono">{r.quantite}</td>
                            <td className="p-1.5 text-right font-mono">{fmt(r.prix_unitaire)}</td>
                            <td className="p-1.5 text-right font-mono font-bold text-rose-800">{fmt(r.total)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={4} className="p-2 text-center text-slate-400">Aucun plat restaurant</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SYNTHÈSE FINANCIÈRE & SAISIE DU VERSEMENT */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span className="font-bold text-slate-300">SYNTHÈSE FINANCIÈRE</span>
                  <span className="text-[10px] text-rose-400 font-bold uppercase">Circuit Vente ➔ Session ➔ Clôture ➔ Versement ➔ Caisse</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Ventes BAR</span>
                    <strong className="text-amber-400 font-mono">{fmt(sessionSuiviDetail?.total_bar ?? 0)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Ventes RESTAURANT</span>
                    <strong className="text-rose-400 font-mono">{fmt(sessionSuiviDetail?.total_restaurant ?? 0)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Général Attendu</span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      {fmt(sessionSuiviDetail?.total_general ?? selectedSession.total_ventes_declarees_ttc ?? 0)}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">
                      Montant Effectivement Versé (FCFA) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={clotureForm.montant_verse}
                      onChange={e => setClotureForm({ ...clotureForm, montant_verse: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-800 text-white font-mono font-black text-sm rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-200 block mb-1">
                      Mode de Règlement *
                    </label>
                    <select
                      value={clotureForm.mode_reglement}
                      onChange={e => setClotureForm({ ...clotureForm, mode_reglement: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="ESPECES">Espèces (Caisse)</option>
                      <option value="MTN_MOMO">MTN Mobile Money</option>
                      <option value="MOOV_MONEY">Moov Money</option>
                      <option value="CARTE_BANCAIRE">Carte Bancaire</option>
                      <option value="VIREMENT">Virement Bancaire</option>
                    </select>
                  </div>
                </div>

                {/* Écart et solde restant */}
                {(() => {
                  const totalAttendu = sessionSuiviDetail?.total_general ?? selectedSession.total_ventes_declarees_ttc ?? 0
                  const dejaVerse = selectedSession.total_versements_recus ?? 0
                  const verseMaintenant = Number(clotureForm.montant_verse) || 0
                  const ecart = totalAttendu - (dejaVerse + verseMaintenant)

                  return (
                    <div className="p-3 bg-slate-800 rounded-xl flex items-center justify-between text-xs border border-slate-700">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Écart financier constaté :</span>
                        <strong className={clsx('font-mono font-black', ecart === 0 ? 'text-emerald-400' : 'text-amber-400')}>
                          {ecart === 0 ? 'Aucun écart (Session Soldée)' : `Écart de ${fmt(Math.abs(ecart))} ${ecart > 0 ? '(Manquant)' : '(Surplus)'}`}
                        </strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Alimentation Caisse :</span>
                        <strong className="text-emerald-400 font-mono">+{fmt(verseMaintenant)}</strong>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Justification si écart */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Justification / Remarques de clôture :
                </label>
                <textarea
                  rows={2}
                  placeholder="Commentaire de fin de service (optionnel si solde exact)..."
                  value={clotureForm.justification_ecart}
                  onChange={e => setClotureForm({ ...clotureForm, justification_ecart: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowClotureModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 transition flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Valider Clôture & Versement en Caisse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 5 : NOUVEAU MEMBRE ── */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Ajouter un Membre d'Équipe</h3>
              <button onClick={() => setShowMemberModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveMember} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Matricule *</label>
                  <input
                    type="text"
                    required
                    placeholder="SRV-001"
                    value={memberForm.matricule}
                    onChange={e => setMemberForm({ ...memberForm, matricule: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Poste / Rôle</label>
                  <select
                    value={memberForm.role}
                    onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                  >
                    <option value="SERVEUR">Serveur / Serveuse</option>
                    <option value="BARMAN">Barman / Barmaid</option>
                    <option value="CUISINIER">Cuisinier / Grillardin</option>
                    <option value="CAISSIER">Caissier(e)</option>
                    <option value="GERANT">Gérant</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet *</label>
                <input
                  type="text"
                  required
                  placeholder="Koffi Mensah"
                  value={memberForm.nom_complet}
                  onChange={e => setMemberForm({ ...memberForm, nom_complet: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="+229..."
                    value={memberForm.telephone}
                    onChange={e => setMemberForm({ ...memberForm, telephone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Commission (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={memberForm.taux_commission}
                    onChange={e => setMemberForm({ ...memberForm, taux_commission: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowMemberModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 6 : POINTAGE PRÉSENCE ── */}
      {showPresenceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Pointage de Présence Service</h3>
              <button onClick={() => setShowPresenceModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSavePresence} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom de l'employé(e) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Awa Traoré"
                  value={presenceForm.nom_complet}
                  onChange={e => setPresenceForm({ ...presenceForm, nom_complet: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Heure Arrivée Prévue</label>
                  <input
                    type="time"
                    value={presenceForm.heure_prevue_arrivee}
                    onChange={e => setPresenceForm({ ...presenceForm, heure_prevue_arrivee: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Heure Arrivée Réelle</label>
                  <input
                    type="time"
                    value={presenceForm.heure_reelle_arrivee}
                    onChange={e => setPresenceForm({ ...presenceForm, heure_reelle_arrivee: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Statut</label>
                <select
                  value={presenceForm.statut}
                  onChange={e => setPresenceForm({ ...presenceForm, statut: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                >
                  <option value="PRESENT">Présent(e) à l'heure</option>
                  <option value="RETARD">En retard</option>
                  <option value="EN_SERVICE">En service / En salle</option>
                  <option value="ABSENCE_JUSTIFIEE">Absence justifiée</option>
                  <option value="ABSENT">Absent(e) non justifié</option>
                </select>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowPresenceModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md">Enregistrer Pointage</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE 7 : SIGNALER INCIDENT ── */}
      {showPlainteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Consigner un Incident ou Plainte</h3>
              <button onClick={() => setShowPlainteModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSavePlainte} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Personne Concernée *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Serveur Koffi ou Client Table 4"
                  value={plainteForm.personne_concernee}
                  onChange={e => setPlainteForm({ ...plainteForm, personne_concernee: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Type d'incident</label>
                  <select
                    value={plainteForm.type_incident}
                    onChange={e => setPlainteForm({ ...plainteForm, type_incident: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                  >
                    <option value="ERREUR_CAISSE">Erreur de caisse / Écart</option>
                    <option value="DISPUTE_CLIENT">Dispute avec client</option>
                    <option value="RETARD_REPETE">Retard répété</option>
                    <option value="CASSE_REPETEE">Casse anormale</option>
                    <option value="COMPORTEMENT">Comportement inapproprié</option>
                    <option value="HYGIENE">Règle d'hygiène</option>
                    <option value="AUTRE">Autre incident</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Niveau de gravité</label>
                  <select
                    value={plainteForm.gravite}
                    onChange={e => setPlainteForm({ ...plainteForm, gravite: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                  >
                    <option value="FAIBLE">Faible</option>
                    <option value="MOYENNE">Moyenne</option>
                    <option value="GRAVE">Grave</option>
                    <option value="CRITIQUE">Critique</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description des faits *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Exposé objectif et confidentiel des faits constatés..."
                  value={plainteForm.description}
                  onChange={e => setPlainteForm({ ...plainteForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs outline-none"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowPlainteModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black shadow-md">Enregistrer Incident</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE INDIVIDUELLE PAR SERVEUSE (EXIGENCE POINT 9) ── */}
      {selectedStaffDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200 shadow-2xl space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center justify-center font-black text-lg">
                  {selectedStaffDetail.nom_complet.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{selectedStaffDetail.nom_complet}</h3>
                  <p className="text-xs text-slate-500">Matricule : {selectedStaffDetail.matricule} • Rôle : {selectedStaffDetail.role} • Zone : {selectedStaffDetail.zone_attribuee}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const newStatut = selectedStaffDetail.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF'
                    try {
                      await supabaseTenant('restaurant_serveurs').update({ statut: newStatut }).eq('id', selectedStaffDetail.id)
                      setSelectedStaffDetail({ ...selectedStaffDetail, statut: newStatut })
                      toast.success('Statut employé mis à jour', `${selectedStaffDetail.nom_complet} est maintenant ${newStatut}.`)
                      loadAllData()
                    } catch (err: any) {
                      toast.error('Erreur', err.message)
                    }
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm',
                    selectedStaffDetail.statut === 'ACTIF'
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  )}
                >
                  <Shield className="w-3.5 h-3.5" />
                  {selectedStaffDetail.statut === 'ACTIF' ? 'Désactiver Compte' : 'Réactiver Compte'}
                </button>
                <button onClick={() => setSelectedStaffDetail(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Récapitulatif financier de la serveuse */}
            {(() => {
              const staffCreances = creances.filter(c => c.serveur_nom === selectedStaffDetail.nom_complet)
              const totalBarDu = staffCreances.filter(c => c.circuit === 'BAR').reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)
              const totalCuisineDu = staffCreances.filter(c => c.circuit === 'CUISINE').reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)
              const totalGeneralDu = staffCreances.reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)
              const totalGeneralPaye = staffCreances.reduce((acc, c) => acc + Number(c.montant_paye || 0), 0)
              const totalBouteillesDues = staffCreances.reduce((acc, c) => acc + Math.max(0, (Number(c.consignes_bouteilles_dues) || 0) - (Number(c.consignes_bouteilles_rendues) || 0)), 0)

              return (
                <div className="space-y-6">
                  {/* Cartes financières */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Sous-total BAR</p>
                      <p className="text-sm font-black text-rose-600 font-mono mt-0.5">{fmt(totalBarDu)}</p>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Sous-total CUISINE</p>
                      <p className="text-sm font-black text-orange-600 font-mono mt-0.5">{fmt(totalCuisineDu)}</p>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Total Payé</p>
                      <p className="text-sm font-black text-emerald-600 font-mono mt-0.5">{fmt(totalGeneralPaye)}</p>
                    </div>
                    <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200">
                      <p className="text-[10px] font-black text-rose-700 uppercase">Solde Restant Dû</p>
                      <p className="text-base font-black text-rose-700 font-mono mt-0.5">{fmt(totalGeneralDu)}</p>
                    </div>
                    <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                      <p className="text-[10px] font-black text-amber-800 uppercase">Bouteilles Dues</p>
                      <p className="text-base font-black text-amber-900 font-mono mt-0.5">{totalBouteillesDues} btls</p>
                    </div>
                  </div>

                  {/* Sélecteur des 6 Sous-onglets Spécialisés (Point 9 des spécifications) */}
                  <div className="flex border-b border-slate-200 overflow-x-auto gap-1 pb-1">
                    <button
                      onClick={() => setStaffModalTab('COMMANDES')}
                      className={clsx(
                        'px-3.5 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
                        staffModalTab === 'COMMANDES'
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <FileText className="w-4 h-4" /> 1. Commandes en cours
                    </button>
                    <button
                      onClick={() => setStaffModalTab('PAIEMENTS')}
                      className={clsx(
                        'px-3.5 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
                        staffModalTab === 'PAIEMENTS'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <Wallet className="w-4 h-4" /> 2. Règlements Reçus
                    </button>
                    <button
                      onClick={() => setStaffModalTab('HISTORIQUE')}
                      className={clsx(
                        'px-3.5 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
                        staffModalTab === 'HISTORIQUE'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <CheckCircle2 className="w-4 h-4" /> 3. Ventes Soldées
                    </button>
                    <button
                      onClick={() => setStaffModalTab('BOUTEILLES')}
                      className={clsx(
                        'px-3.5 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
                        staffModalTab === 'BOUTEILLES'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <Wine className="w-4 h-4" /> 4. Retours Bouteilles
                    </button>
                    <button
                      onClick={() => setStaffModalTab('ANNULATIONS')}
                      className={clsx(
                        'px-3.5 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
                        staffModalTab === 'ANNULATIONS'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <RotateCcw className="w-4 h-4" /> 5. Annulations (4 min)
                    </button>
                    <button
                      onClick={() => setStaffModalTab('SESSIONS')}
                      className={clsx(
                        'px-3.5 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
                        staffModalTab === 'SESSIONS'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <Clock className="w-4 h-4" /> 6. Sessions & Clôture
                    </button>
                  </div>

                  {/* ── SOUS-ONGLET 1 : COMMANDES & PRODUITS EN COURS (BAR / CUISINE SÉPARÉS) ── */}
                  {staffModalTab === 'COMMANDES' && (
                    <div className="space-y-4">
                      {/* Séparation BAR et CUISINE */}
                      <div className="flex justify-between items-center">
                        <h4 className="font-black text-xs text-slate-900 uppercase tracking-wider">
                          Commandes en cours avec solde restant ({staffCreances.filter(c => Number(c.solde_restant || 0) > 0).length})
                        </h4>
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                            BAR : {fmt(totalBarDu)}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                            CUISINE : {fmt(totalCuisineDu)}
                          </span>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="p-3">Date & Commande</th>
                              <th className="p-3">Poste / Circuit</th>
                              <th className="p-3 text-right">Montant Initial</th>
                              <th className="p-3 text-right">Déjà Payé</th>
                              <th className="p-3 text-right">Solde Dû</th>
                              <th className="p-3 text-center">Consignes</th>
                              <th className="p-3 text-center">Statut</th>
                              <th className="p-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {staffCreances.filter(c => Number(c.solde_restant || 0) > 0).map((c: any) => {
                              const btlsRestantes = Math.max(0, (Number(c.consignes_bouteilles_dues) || 0) - (Number(c.consignes_bouteilles_rendues) || 0))
                              return (
                                <tr key={c.id} className="hover:bg-slate-50/50">
                                  <td className="p-3 font-mono font-bold text-slate-900">
                                    {c.order_number}
                                    <span className="text-[10px] text-slate-400 block font-normal">{new Date(c.date_creation).toLocaleDateString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </td>
                                  <td className="p-3">
                                    <span className={clsx('px-2 py-0.5 rounded text-[10px] font-black', c.circuit === 'CUISINE' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800')}>
                                      {c.circuit === 'CUISINE' ? '🍳 CUISINE' : '🍷 BAR'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right font-mono text-slate-600">{fmt(c.montant_initial)}</td>
                                  <td className="p-3 text-right font-mono font-bold text-emerald-600">{fmt(c.montant_paye)}</td>
                                  <td className="p-3 text-right font-mono font-black text-rose-600">{fmt(c.solde_restant)}</td>
                                  <td className="p-3 text-center font-mono">
                                    {c.consignes_bouteilles_dues > 0 ? (
                                      <span className="text-amber-800 font-bold text-[10px] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                        {btlsRestantes} / {c.consignes_bouteilles_dues}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800">
                                      {c.statut}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <button
                                      onClick={() => {
                                        setSelectedCreanceToPay(c)
                                        setPaiementMontant(Number(c.solde_restant) || 0)
                                        setShowPaiementCreanceModal(true)
                                      }}
                                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition shadow-sm"
                                    >
                                      Payer
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                            {staffCreances.filter(c => Number(c.solde_restant || 0) > 0).length === 0 && (
                              <tr>
                                <td colSpan={8} className="p-8 text-center text-slate-400">
                                  Toutes les commandes en cours sont intégralement soldées pour cette serveuse.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── SOUS-ONGLET 2 : HISTORIQUE DES RÈGLEMENTS REÇUS ── */}
                  {staffModalTab === 'PAIEMENTS' && (
                    <div className="space-y-4">
                      {(() => {
                        const staffReglements = reglements.filter(r => r.serveur_nom === selectedStaffDetail.nom_complet)
                        const totalEncaisse = staffReglements.reduce((acc, r) => acc + Number(r.montant || 0), 0)
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <h4 className="font-black text-xs text-slate-900 uppercase tracking-wider">
                                Règlements enregistrés ({staffReglements.length})
                              </h4>
                              <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                                Total Encaissé : {fmt(totalEncaisse)}
                              </span>
                            </div>

                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                                  <tr>
                                    <th className="p-3">Date Règlement</th>
                                    <th className="p-3">Référence Reçu</th>
                                    <th className="p-3">Mode de Règlement</th>
                                    <th className="p-3 text-right">Montant Encaissé</th>
                                    <th className="p-3 text-right">Encaissé Par</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {staffReglements.map((r: any) => (
                                    <tr key={r.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-mono text-slate-600">
                                        {new Date(r.date_reglement).toLocaleString('fr-BJ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                                      </td>
                                      <td className="p-3 font-mono font-bold text-slate-900">{r.reference || '-'}</td>
                                      <td className="p-3 font-bold text-slate-700">
                                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                                          {r.mode_reglement}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right font-mono font-black text-emerald-600">{fmt(r.montant)}</td>
                                      <td className="p-3 text-right text-slate-500">{r.recu_par || 'Gérant'}</td>
                                    </tr>
                                  ))}
                                  {staffReglements.length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="p-8 text-center text-slate-400">
                                        Aucun règlement spécifique enregistré pour le moment.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* ── SOUS-ONGLET 3 : HISTORIQUE DES VENTES SOLDÉES ── */}
                  {staffModalTab === 'HISTORIQUE' && (
                    <div className="space-y-4">
                      {(() => {
                        const payees = staffCreances.filter(c => c.statut === 'PAYE')
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <h4 className="font-black text-xs text-slate-900 uppercase tracking-wider">
                                Ventes Soldées & Archivées ({payees.length})
                              </h4>
                            </div>

                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                                  <tr>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">N° Commande</th>
                                    <th className="p-3">Circuit</th>
                                    <th className="p-3 text-right">Montant Total</th>
                                    <th className="p-3 text-right">Total Payé</th>
                                    <th className="p-3 text-center">Statut</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {payees.map((c: any) => (
                                    <tr key={c.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-mono text-slate-500">
                                        {new Date(c.date_creation).toLocaleDateString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                                      </td>
                                      <td className="p-3 font-mono font-bold text-slate-900">{c.order_number}</td>
                                      <td className="p-3">
                                        <span className={clsx('px-2 py-0.5 rounded text-[10px] font-black', c.circuit === 'CUISINE' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800')}>
                                          {c.circuit}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right font-mono text-slate-700">{fmt(c.montant_initial)}</td>
                                      <td className="p-3 text-right font-mono font-bold text-emerald-600">{fmt(c.montant_paye)}</td>
                                      <td className="p-3 text-center">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                                          SOLDÉ
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                  {payees.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="p-8 text-center text-slate-400">
                                        Aucune commande totalement soldée pour l'instant.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* ── SOUS-ONGLET 4 : RETOURS DE BOUTEILLES CONSIGNÉES ── */}
                  {staffModalTab === 'BOUTEILLES' && (
                    <div className="space-y-4">
                      {(() => {
                        const avecBtls = staffCreances.filter(c => Number(c.consignes_bouteilles_dues || 0) > 0)
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <h4 className="font-black text-xs text-slate-900 uppercase tracking-wider">
                                Suivi des Bouteilles Consignées ({avecBtls.length} commandes)
                              </h4>
                              <span className="text-xs font-black text-amber-900 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200">
                                Bouteilles Dues : {totalBouteillesDues} btls
                              </span>
                            </div>

                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                                  <tr>
                                    <th className="p-3">Commande</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3 text-center">Bouteilles Sorties</th>
                                    <th className="p-3 text-center">Bouteilles Rendues</th>
                                    <th className="p-3 text-center">Solde à Rendre</th>
                                    <th className="p-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {avecBtls.map((c: any) => {
                                    const btlsRestantes = Math.max(0, (Number(c.consignes_bouteilles_dues) || 0) - (Number(c.consignes_bouteilles_rendues) || 0))
                                    return (
                                      <tr key={c.id} className="hover:bg-slate-50/50">
                                        <td className="p-3 font-mono font-bold text-slate-900">{c.order_number}</td>
                                        <td className="p-3 text-slate-500 text-[11px]">
                                          {new Date(c.date_creation).toLocaleDateString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-3 text-center font-mono font-bold text-slate-800">{c.consignes_bouteilles_dues}</td>
                                        <td className="p-3 text-center font-mono font-bold text-emerald-600">{c.consignes_bouteilles_rendues || 0}</td>
                                        <td className="p-3 text-center font-mono font-black text-amber-900">
                                          {btlsRestantes > 0 ? (
                                            <span className="bg-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                                              {btlsRestantes} btls
                                            </span>
                                          ) : (
                                            <span className="text-emerald-600 font-bold">✓ Rendu</span>
                                          )}
                                        </td>
                                        <td className="p-3 text-right">
                                          {btlsRestantes > 0 && (
                                            <button
                                              onClick={() => {
                                                setSelectedCreanceForBottles(c)
                                                setBottleReturnQty(1)
                                                setShowBottleReturnModal(true)
                                              }}
                                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                                            >
                                              Enregistrer Retour
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                  {avecBtls.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="p-8 text-center text-slate-400">
                                        Aucune consigne de bouteille associée à cette serveuse.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* ── SOUS-ONGLET 5 : ANNULATIONS ET CORRECTIONS (DÉLAI 4 MIN) ── */}
                  {staffModalTab === 'ANNULATIONS' && (
                    <div className="space-y-4">
                      {(() => {
                        const cancelled = commandesList.filter(
                          (cmd: any) =>
                            (cmd.serveur_nom === selectedStaffDetail.nom_complet || cmd.serveur_id === selectedStaffDetail.id) &&
                            cmd.validation_status === 'ANNULE'
                        )
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <h4 className="font-black text-xs text-slate-900 uppercase tracking-wider">
                                Commandes Annulées ({cancelled.length})
                              </h4>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                                Règle d'or : 0 déstockage & 0 créance
                              </span>
                            </div>

                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                                  <tr>
                                    <th className="p-3">Date Annulation</th>
                                    <th className="p-3">N° Commande</th>
                                    <th className="p-3">Circuit</th>
                                    <th className="p-3 text-right">Montant Annulé</th>
                                    <th className="p-3">Motif d'Annulation</th>
                                    <th className="p-3 text-right">Annulé Par</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {cancelled.map((cmd: any) => (
                                    <tr key={cmd.id} className="hover:bg-slate-50/50">
                                      <td className="p-3 font-mono text-slate-500">
                                        {new Date(cmd.cancelled_at || cmd.updated_at || cmd.created_at).toLocaleString('fr-BJ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                      </td>
                                      <td className="p-3 font-mono font-bold text-slate-900">{cmd.numero_commande}</td>
                                      <td className="p-3">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-800">
                                          {cmd.circuit || 'BAR'}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right font-mono font-bold text-slate-600">{fmt(cmd.total_ttc || 0)}</td>
                                      <td className="p-3 text-rose-700 font-medium italic">{cmd.motif_annulation || 'Annulation avant 4 minutes'}</td>
                                      <td className="p-3 text-right text-slate-500">{cmd.annule_par || 'Gérant'}</td>
                                    </tr>
                                  ))}
                                  {cancelled.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="p-8 text-center text-slate-400">
                                        Aucune commande annulée pour cette serveuse.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* ── SOUS-ONGLET 6 : SITUATION DU COMPTE & SESSIONS ── */}
                  {staffModalTab === 'SESSIONS' && (
                    <div className="space-y-4">
                      {(() => {
                        const activeSession = sessions.find(s => s.serveur_nom === selectedStaffDetail.nom_complet && s.statut === 'OUVERTE')
                        const closedSessions = sessions.filter(s => s.serveur_nom === selectedStaffDetail.nom_complet && s.statut !== 'OUVERTE')
                        return (
                          <div className="space-y-4">
                            {/* Session active */}
                            {activeSession ? (
                              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                                    <h4 className="font-black text-xs text-purple-950 uppercase">Session Active en cours</h4>
                                  </div>
                                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                                    Ouverte à {activeSession.heure_ouverture || '--:--'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-4 gap-2 text-xs">
                                  <div className="bg-white p-2.5 rounded-xl border border-purple-100">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Fonds Initial</span>
                                    <span className="font-black font-mono text-slate-800">{fmt(activeSession.fonds_initial || 0)}</span>
                                  </div>
                                  <div className="bg-white p-2.5 rounded-xl border border-purple-100">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Confié</span>
                                    <span className="font-black font-mono text-purple-700">{fmt(activeSession.total_boissons_confiees_ttc || 0)}</span>
                                  </div>
                                  <div className="bg-white p-2.5 rounded-xl border border-purple-100">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Versé</span>
                                    <span className="font-black font-mono text-emerald-600">{fmt(activeSession.total_versements_recus || 0)}</span>
                                  </div>
                                  <div className="bg-white p-2.5 rounded-xl border border-purple-100">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Reste à Remettre</span>
                                    <span className="font-black font-mono text-rose-600">{fmt(activeSession.solde_restant_a_remettre || 0)}</span>
                                  </div>
                                </div>

                                <div className="pt-2 flex justify-end">
                                  <button
                                    onClick={() => {
                                      setSelectedSession(activeSession)
                                      setShowClotureModal(true)
                                    }}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center gap-1.5"
                                  >
                                    <Check className="w-4 h-4" /> Clôturer cette session de service
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex justify-between items-center">
                                <span>Aucune session active ouverte pour cette serveuse aujourd'hui.</span>
                                <button
                                  onClick={() => {
                                    setSessionForm({
                                      serveur_nom: selectedStaffDetail.nom_complet,
                                      fonds_initial: 0,
                                      notes: ''
                                    })
                                    setShowSessionModal(true)
                                  }}
                                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition"
                                >
                                  Ouvrir une session
                                </button>
                              </div>
                            )}

                            {/* Historique des sessions fermées */}
                            <div className="space-y-2">
                              <h5 className="font-black text-xs text-slate-800 uppercase tracking-wider">Sessions Précédentes Clôturées</h5>
                              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                                    <tr>
                                      <th className="p-2.5">Date</th>
                                      <th className="p-2.5 text-right">Ventes Déclarées</th>
                                      <th className="p-2.5 text-right">Versements</th>
                                      <th className="p-2.5 text-right">Écart Financier</th>
                                      <th className="p-2.5 text-center">Statut</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {closedSessions.map((s: any) => (
                                      <tr key={s.id} className="hover:bg-slate-50/50">
                                        <td className="p-2.5 font-mono text-slate-600">{s.date_session}</td>
                                        <td className="p-2.5 text-right font-mono text-slate-800">{fmt(s.total_ventes_declarees_ttc || 0)}</td>
                                        <td className="p-2.5 text-right font-mono text-emerald-600 font-bold">{fmt(s.total_versements_recus || 0)}</td>
                                        <td className="p-2.5 text-right font-mono font-black text-rose-600">{fmt(s.ecart_financier || 0)}</td>
                                        <td className="p-2.5 text-center">
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700">
                                            {s.statut}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                    {closedSessions.length === 0 && (
                                      <tr>
                                        <td colSpan={5} className="p-6 text-center text-slate-400">Aucune session précédente enregistrée.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* MODALE PAIEMENT CRÉANCE SERVEUSE */}
      {showPaiementCreanceModal && selectedCreanceToPay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-sm text-slate-900">Enregistrer un Règlement de Créance</h3>
              <button onClick={() => setShowPaiementCreanceModal(false)} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl text-xs space-y-1">
                <p><strong>Serveuse :</strong> {selectedCreanceToPay.serveur_nom}</p>
                <p><strong>Commande :</strong> {selectedCreanceToPay.order_number}</p>
                <p><strong>Solde restant dû :</strong> <span className="text-rose-600 font-black">{fmt(selectedCreanceToPay.solde_restant)}</span></p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Montant à encaisser (FCFA) *</label>
                <input
                  type="number"
                  min="1"
                  max={selectedCreanceToPay.solde_restant}
                  value={paiementMontant}
                  onChange={e => setPaiementMontant(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-black font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mode de règlement *</label>
                <select
                  value={paiementMode}
                  onChange={e => setPaiementMode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold"
                >
                  <option value="ESPECES">Espèces (Caisse)</option>
                  <option value="MTN_MOMO">MTN Mobile Money</option>
                  <option value="MOOV_MONEY">Moov Money</option>
                  <option value="CARTE">Carte Bancaire</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button onClick={() => setShowPaiementCreanceModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button
                  onClick={async () => {
                    const { payerCreanceServeuse } = await import('../../../services/restaurantService')
                    const res = await payerCreanceServeuse({
                      company_id: companyId || '',
                      creance_id: selectedCreanceToPay.id,
                      serveur_nom: selectedCreanceToPay.serveur_nom,
                      montant: paiementMontant,
                      mode_reglement: paiementMode,
                      recu_par: user?.full_name || 'Gérant'
                    })
                    if (res.success) {
                      toast.success('Règlement validé', `Encaissé : ${fmt(paiementMontant)}. Nouveau solde : ${fmt(res.soldeRestant)}`)
                      setShowPaiementCreanceModal(false)
                      loadAllData()
                    } else {
                      toast.error('Erreur', 'Impossible d enregistrer le règlement.')
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md"
                >
                  Confirmer Encaissement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALE RETOUR DE BOUTEILLES CONSIGNÉES */}
      {showBottleReturnModal && selectedCreanceForBottles && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-sm text-slate-900">Enregistrer un Retour de Bouteilles</h3>
              <button onClick={() => setShowBottleReturnModal(false)} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-2xl text-xs space-y-1 border border-amber-200">
                <p><strong>Serveuse :</strong> {selectedCreanceForBottles.serveur_nom}</p>
                <p><strong>Commande :</strong> {selectedCreanceForBottles.order_number}</p>
                <p><strong>Bouteilles sorties :</strong> {selectedCreanceForBottles.consignes_bouteilles_dues}</p>
                <p><strong>Déjà rendues :</strong> {selectedCreanceForBottles.consignes_bouteilles_rendues || 0}</p>
                <p><strong>Reste à rendre :</strong> <span className="text-amber-900 font-black font-mono">
                  {Math.max(0, (Number(selectedCreanceForBottles.consignes_bouteilles_dues) || 0) - (Number(selectedCreanceForBottles.consignes_bouteilles_rendues) || 0))} btls
                </span></p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nombre de bouteilles retournées *</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, (Number(selectedCreanceForBottles.consignes_bouteilles_dues) || 0) - (Number(selectedCreanceForBottles.consignes_bouteilles_rendues) || 0))}
                  value={bottleReturnQty}
                  onChange={e => setBottleReturnQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-black font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button onClick={() => setShowBottleReturnModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button
                  onClick={async () => {
                    const { enregistrerRetourBouteilles } = await import('../../../services/restaurantService')
                    const res = await enregistrerRetourBouteilles({
                      creance_id: selectedCreanceForBottles.id,
                      qte_rendue: bottleReturnQty
                    })
                    if (res.success) {
                      toast.success('Retour enregistré', `${bottleReturnQty} bouteille(s) retournée(s). Reste dû : ${res.resteDu}`)
                      setShowBottleReturnModal(false)
                      loadAllData()
                    } else {
                      toast.error('Erreur', 'Impossible d enregistrer le retour de bouteilles.')
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md"
                >
                  Confirmer le Retour
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServeursPersonnelPage
