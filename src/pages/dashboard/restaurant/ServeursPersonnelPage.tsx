import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Plus, RefreshCw, Award, Percent, DollarSign,
  Phone, UserCheck, Shield, ChevronRight, X, Search,
  Wine, Wallet, ArrowDownRight, CheckCircle2, Clock,
  AlertTriangle, FileText, Check, ShieldAlert
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useAuthStore } from '../../../store/authStore'
import { formatFCFA } from '../../../utils/tax'
import {
  attribuerBoissonServeuse,
  enregistrerVersementServeur,
  cloturerSessionServeuse,
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
  const [selectedCreanceToPay, setSelectedCreanceToPay] = useState<any | null>(null)
  const [paiementMontant, setPaiementMontant] = useState<number>(0)
  const [paiementMode, setPaiementMode] = useState<string>('ESPECES')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modales
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [showRemiseModal, setShowRemiseModal] = useState(false)
  const [showVersementModal, setShowVersementModal] = useState(false)
  const [showClotureModal, setShowClotureModal] = useState(false)
  const [showPresenceModal, setShowPresenceModal] = useState(false)
  const [showPlainteModal, setShowPlainteModal] = useState(false)
  const [showPaiementCreanceModal, setShowPaiementCreanceModal] = useState(false)

  const [selectedSession, setSelectedSession] = useState<ServeurSession | null>(null)
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

  const [clotureForm, setClotureForm] = useState({
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
      const [srvRes, sessRes, confRes, vmtRes, presRes, pltRes, creanceRes] = await Promise.all([
        supabaseTenant('restaurant_serveurs').select('*').order('nom_complet'),
        supabaseTenant('restaurant_sessions_serveurs').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseTenant('restaurant_boissons_confiees').select('*').order('created_at', { ascending: false }).limit(100),
        supabaseTenant('restaurant_versements_serveurs').select('*').order('date_versement', { ascending: false }).limit(100),
        supabaseTenant('restaurant_presences').select('*').order('date_presence', { ascending: false }).limit(50),
        supabaseTenant('restaurant_plaintes_incidents').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseTenant('restaurant_creances_serveuses').select('*').order('date_creation', { ascending: false }).limit(100)
      ])

      setPersonnel(srvRes.data || [])
      setSessions(sessRes.data || [])
      setBoissonsConfiees(confRes.data || [])
      setVersements(vmtRes.data || [])
      setPresences(presRes.data || [])
      setPlaintes(pltRes.data || [])
      setCreances(creanceRes.data || [])

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
    if (!sessionForm.serveur_nom.trim()) return
    try {
      const { data, error } = await supabaseTenant('restaurant_sessions_serveurs').insert({
        serveur_nom: sessionForm.serveur_nom.trim(),
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
      toast.success('Session ouverte', `Session bar ouverte pour ${sessionForm.serveur_nom}.`)
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
      company_id: companyId,
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
      remis_par: user?.user_metadata?.full_name || user?.email || 'Gérant Bar',
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
      company_id: companyId,
      session_id: selectedSession.id,
      serveur_nom: selectedSession.serveur_nom,
      montant: Number(versementForm.montant),
      mode_reglement: versementForm.mode_reglement,
      recu_par: user?.user_metadata?.full_name || user?.email || 'Gérant',
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

  const handleCloture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession) return

    const res = await cloturerSessionServeuse({
      session_id: selectedSession.id,
      cloture_par: user?.user_metadata?.full_name || user?.email || 'Gérant',
      justification_ecart: clotureForm.justification_ecart
    })

    if (res.success) {
      toast.success('Session clôturée', `Clôture validée. Écart final : ${fmt(res.ecart)}`)
      setShowClotureModal(false)
      loadAllData()
    } else {
      toast.error('Erreur', 'Impossible de clôturer la session.')
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
        enregistre_par: user?.user_metadata?.full_name || user?.email || 'Gérant',
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
        responsable_suivi: plainteForm.responsable_suivi.trim() || (user?.user_metadata?.full_name || 'Gérant'),
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
          {/* Liste des sessions actives */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sessions.map(s => {
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
          </div>

          {/* Détail de la session sélectionnée */}
          {selectedSession && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">
                      Compte Bar : {selectedSession.serveur_nom}
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
                  </p>
                </div>

                {selectedSession.statut === 'OUVERTE' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRemiseModal(true)}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Remettre Boissons
                    </button>
                    <button
                      onClick={() => setShowVersementModal(true)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm"
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Encaisser Versement
                    </button>
                    <button
                      onClick={() => setShowClotureModal(true)}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Clôturer Session
                    </button>
                  </div>
                )}
              </div>

              {/* 2 Grilles : Boissons confiées & Versements reçus */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Boissons confiées */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                    <Wine className="w-4 h-4 text-rose-600" />
                    Articles & Boissons Confiés
                  </h4>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase">
                        <tr>
                          <th className="p-3">Boisson</th>
                          <th className="p-3 text-center">Qté Remise</th>
                          <th className="p-3 text-right">Prix Unit.</th>
                          <th className="p-3 text-right">Total Dû</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {boissonsConfiees
                          .filter(b => b.session_id === selectedSession.id)
                          .map((b, i) => (
                            <tr key={i} className="hover:bg-slate-50/60">
                              <td className="p-3 font-bold text-slate-900">{b.produit_nom}</td>
                              <td className="p-3 text-center font-mono font-bold text-slate-700">{b.qte_remise}</td>
                              <td className="p-3 text-right font-mono text-slate-500">{fmt(b.prix_vente_unitaire)}</td>
                              <td className="p-3 text-right font-mono font-black text-rose-600">{fmt(b.total_valeur_remise)}</td>
                            </tr>
                          ))}
                        {boissonsConfiees.filter(b => b.session_id === selectedSession.id).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-slate-400">Aucune boisson remise sur cette session.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Versements successifs */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    Versements Successifs Effectués au Gérant
                  </h4>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
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

      {/* ── MODALE 4 : CLÔTURE DE SESSION ── */}
      {showClotureModal && selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-900 text-base">Clôturer Définitivement la Session</h3>
              <button onClick={() => setShowClotureModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCloture} className="space-y-3.5">
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-xs space-y-1.5">
                <div className="flex justify-between font-bold text-slate-700">
                  <span>Total Boissons Confiées :</span>
                  <span className="font-mono">{fmt(selectedSession.total_boissons_confiees_ttc)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-700">
                  <span>Total Versé :</span>
                  <span className="font-mono text-emerald-600">{fmt(selectedSession.total_versements_recus)}</span>
                </div>
                <div className="flex justify-between font-black text-rose-900 border-t border-rose-200 pt-1.5">
                  <span>Écart / Solde Non Réglé :</span>
                  <span className="font-mono">{fmt(selectedSession.solde_restant_a_remettre)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Justification / Motif de l'écart (le cas échéant)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Reste 3 bouteilles en caisse frigo, ou dette client..."
                  value={clotureForm.justification_ecart}
                  onChange={e => setClotureForm({ ...clotureForm, justification_ecart: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-xs outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowClotureModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md">Confirmer Clôture</button>
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
              <button onClick={() => setSelectedStaffDetail(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
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

                  {/* Tableau des commandes et créances */}
                  <div className="space-y-3">
                    <h4 className="font-black text-xs text-slate-900 uppercase tracking-wider">Commandes & Produits Imputés</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="p-3">Date & Commande</th>
                            <th className="p-3">Circuit</th>
                            <th className="p-3 text-right">Montant Initial</th>
                            <th className="p-3 text-right">Payé</th>
                            <th className="p-3 text-right">Solde Dû</th>
                            <th className="p-3 text-center">Consignes</th>
                            <th className="p-3 text-center">Statut</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {staffCreances.map((c: any) => {
                            const btlsRestantes = Math.max(0, (Number(c.consignes_bouteilles_dues) || 0) - (Number(c.consignes_bouteilles_rendues) || 0))
                            return (
                              <tr key={c.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-mono font-bold text-slate-900">
                                  {c.order_number}
                                  <span className="text-[10px] text-slate-400 block font-normal">{new Date(c.date_creation).toLocaleDateString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}</span>
                                </td>
                                <td className="p-3">
                                  <span className={clsx('px-2 py-0.5 rounded text-[10px] font-black', c.circuit === 'CUISINE' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800')}>
                                    {c.circuit}
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
                                  <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', c.statut === 'PAYE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
                                    {c.statut}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  {c.solde_restant > 0 && (
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
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {staffCreances.length === 0 && (
                            <tr>
                              <td colSpan={8} className="p-8 text-center text-slate-400">Aucune commande ou créance enregistrée pour cette serveuse.</td>
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
    </div>
  )
}

export default ServeursPersonnelPage
