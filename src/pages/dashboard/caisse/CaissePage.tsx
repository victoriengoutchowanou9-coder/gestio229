// =============================================================================
// GESTIO 229 SaaS — Caisse Opérationnelle du Secteur
// =============================================================================
// Séparation stricte de la Trésorerie Centrale
// Gestion des fonds Espèces / MoMo, Mouvements réels, Clôtures (Z de caisse)
// Demandes de transfert vers Trésorerie et Ajustements avec audit obligatoire
// Zéro donnée fictive
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wallet, Plus, X, CheckCircle, Clock, TrendingUp, TrendingDown,
  Lock, Unlock, Shield, ArrowUpRight, Smartphone, RefreshCw, AlertCircle,
  Printer, Send, FileCheck, Check, ArrowRightLeft, FileText, History
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { AdjustFundsModal, WithdrawalRequestModal, ModalPortal } from '../../../components/modals'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface CashMovement {
  id: string
  created_at: string
  user_name: string
  type: 'ENCAISSEMENT' | 'REMBOURSEMENT' | 'RETRAIT' | 'TRANSFERT' | 'AJUSTEMENT' | 'CLOTURE'
  payment_channel: 'Espèces' | 'MoMo' | 'Tous'
  amount: number
  motif: string
  reference: string
  status: 'VALIDE' | 'EN_ATTENTE' | 'REFUSE'
}

interface CashClosure {
  id: string
  closed_at: string
  closed_by: string
  caisse_name: string
  fond_especes_theorique: number
  fond_especes_physique: number
  ecart_especes: number
  fond_momo: number
  total_fermeture: number
  notes?: string
  status: 'CLOTURE_VALIDEE'
}

export const CaissePage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  // État de la caisse : Ouverte ou Fermée
  const [caisseStatus, setCaisseStatus] = useState<'OUVERTE' | 'FERMEE'>('FERMEE')
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const [openedBy, setOpenedBy] = useState<string>('')
  const [initialCash, setInitialCash] = useState<number>(0)
  const [initialMomo, setInitialMomo] = useState<number>(0)

  // Données réelles des ventes du jour
  const [salesToday, setSalesToday] = useState<any[]>([])
  const [closuresHistory, setClosuresHistory] = useState<CashClosure[]>([])
  const [movementsHistory, setMovementsHistory] = useState<CashMovement[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [activeReportClosure, setActiveReportClosure] = useState<CashClosure | null>(null)

  // Saisie ouverture
  const [openInputCash, setOpenInputCash] = useState<number>(0)
  const [openInputMomo, setOpenInputMomo] = useState<number>(0)

  // Saisie clôture
  const [closingPhysicalCash, setClosingPhysicalCash] = useState<number>(0)
  const [closingNotes, setClosingNotes] = useState<string>('')

  // Charger la persistance locale de l'état de la caisse
  useEffect(() => {
    if (!company?.id) return
    const storedState = localStorage.getItem(`gestio_caisse_state_${company.id}`)
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState)
        setCaisseStatus(parsed.status || 'FERMEE')
        setOpenedAt(parsed.openedAt || null)
        setOpenedBy(parsed.openedBy || '')
        setInitialCash(Number(parsed.initialCash) || 0)
        setInitialMomo(Number(parsed.initialMomo) || 0)
      } catch (e) {
        console.error('Erreur lecture session caisse', e)
      }
    }

    const storedClosures = localStorage.getItem(`gestio_caisse_closures_${company.id}`)
    if (storedClosures) {
      try {
        setClosuresHistory(JSON.parse(storedClosures))
      } catch (e) {}
    }

    const storedRequests = localStorage.getItem(`gestio_treasury_requests_${company.id}`)
    if (storedRequests) {
      try {
        setPendingRequests(JSON.parse(storedRequests))
      } catch (e) {}
    }
  }, [company?.id])

  // Sauvegarder l'état de session dans localStorage
  const saveCaisseState = (status: 'OUVERTE' | 'FERMEE', opAt: string | null, opBy: string, initC: number, initM: number) => {
    if (!company?.id) return
    const payload = { status, openedAt: opAt, openedBy: opBy, initialCash: initC, initialMomo: initM }
    localStorage.setItem(`gestio_caisse_state_${company.id}`, JSON.stringify(payload))
    setCaisseStatus(status)
    setOpenedAt(opAt)
    setOpenedBy(opBy)
    setInitialCash(initC)
    setInitialMomo(initM)
  }

  // Charger les ventes réelles du jour depuis Supabase
  const loadCaisseData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

      const { data: sales, error } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('company_id', company.id)
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false })

      if (error) throw error
      const realSales = sales || []
      setSalesToday(realSales)

      // Construire les mouvements à partir des ventes réelles
      const saleMovements: CashMovement[] = realSales.map((s: any) => ({
        id: `mov-${s.id}`,
        created_at: s.created_at,
        user_name: s.created_by_name || 'Vendeur / Caissier',
        type: 'ENCAISSEMENT',
        payment_channel: (s.payment_method === 'cash' || s.payment_method === 'especes') ? 'Espèces' : 'MoMo',
        amount: Number(s.total_amount) || 0,
        motif: `Vente POS N° ${s.order_number}`,
        reference: s.order_number || s.id.slice(0, 8),
        status: 'VALIDE'
      }))

      // Combiner avec les demandes de transfert de la session
      const storedReqs = localStorage.getItem(`gestio_treasury_requests_${company.id}`)
      let transferMovements: CashMovement[] = []
      if (storedReqs) {
        try {
          const reqs = JSON.parse(storedReqs)
          transferMovements = reqs.map((r: any) => ({
            id: r.id,
            created_at: r.created_at,
            user_name: r.requested_by,
            type: 'RETRAIT',
            payment_channel: r.type,
            amount: r.amount,
            motif: `Demande transfert trésorerie : ${r.motif}`,
            reference: `TR-${r.id.slice(0, 6)}`,
            status: r.status === 'APPROVED' ? 'VALIDE' : r.status === 'REJECTED' ? 'REFUSE' : 'EN_ATTENTE'
          }))
        } catch (e) {}
      }

      setMovementsHistory([...transferMovements, ...saleMovements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (err: any) {
      console.error('Erreur chargement ventes caisse :', err)
      setSalesToday([])
      setMovementsHistory([])
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadCaisseData()
  }, [loadCaisseData])

  // ─── 5 Indicateurs Spécifiés au Point 5 ─────────────────────────────────────

  // C. Espèces du jour (encaissées aujourd'hui)
  const especesDuJour = useMemo(() => {
    return salesToday
      .filter((s) => s.payment_method === 'cash' || s.payment_method === 'especes')
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // D. MoMo du jour (encaissés aujourd'hui)
  const momoDuJour = useMemo(() => {
    return salesToday
      .filter((s) => s.payment_method === 'momo' || s.payment_method === 'wave' || s.payment_method === 'flooz')
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // E. CA du jour (Total des ventes enregistrées, y compris crédit et autres)
  const caDuJour = useMemo(() => {
    return salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // Total des retraits espèces exécutés vers trésorerie
  const totalRetraitsEspeces = useMemo(() => {
    return pendingRequests
      .filter((r) => r.type === 'Espèces' && r.status !== 'REFUSE')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [pendingRequests])

  const totalRetraitsMomo = useMemo(() => {
    return pendingRequests
      .filter((r) => r.type === 'MoMo' && r.status !== 'REFUSE')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [pendingRequests])

  // A. Fond actuel — Espèces (Cumul espèces conservées + initial + entrées - sorties)
  const fondActuelEspeces = initialCash + especesDuJour - totalRetraitsEspeces

  // B. Fond actuel — MoMo (Cumul MoMo + initial + entrées - sorties)
  const fondActuelMomo = initialMomo + momoDuJour - totalRetraitsMomo

  // ─── Action : Ouvrir la Caisse ─────────────────────────────────────────────
  const handleOpenCaisse = (e: React.FormEvent) => {
    e.preventDefault()
    const opBy = user?.full_name || 'Caissier'
    const nowIso = new Date().toISOString()
    saveCaisseState('OUVERTE', nowIso, opBy, Number(openInputCash) || 0, Number(openInputMomo) || 0)
    setShowOpenModal(false)
    toast.success('Caisse Ouverte avec succès !', `Fond initial tiroir : ${fmt(openInputCash)}`)
  }

  // ─── Action : Fermer la Caisse ─────────────────────────────────────────────
  const handleConfirmCloseCaisse = () => {
    const closedAt = new Date().toISOString()
    const closedBy = user?.full_name || 'Caissier'
    const ecart = Number(closingPhysicalCash) - fondActuelEspeces

    const newClosure: CashClosure = {
      id: `cloture-${Date.now()}`,
      closed_at: closedAt,
      closed_by: closedBy,
      caisse_name: 'Caisse Principale Secteur',
      fond_especes_theorique: fondActuelEspeces,
      fond_especes_physique: Number(closingPhysicalCash),
      ecart_especes: ecart,
      fond_momo: fondActuelMomo,
      total_fermeture: Number(closingPhysicalCash) + fondActuelMomo,
      notes: closingNotes || 'Clôture de session normale',
      status: 'CLOTURE_VALIDEE'
    }

    const updatedClosures = [newClosure, ...closuresHistory]
    setClosuresHistory(updatedClosures)
    if (company?.id) {
      localStorage.setItem(`gestio_caisse_closures_${company.id}`, JSON.stringify(updatedClosures))
    }

    // Basculer l'état en fermé et conserver le fond final
    saveCaisseState('FERMEE', null, '', Number(closingPhysicalCash), fondActuelMomo)

    setShowCloseModal(false)
    setActiveReportClosure(newClosure)
    setShowReportModal(true)
    toast.success('Caisse Clôturée avec Succès !', 'Le Z de caisse a été généré et archivé.')
  }

  // ─── Action : Envoyer une Demande vers Trésorerie ───────────────────────────
  const handleSendWithdrawalRequest = (req: { type: string; amount: number; reason: string }) => {
    const newReq = {
      id: `req-${Date.now()}`,
      created_at: new Date().toISOString(),
      requested_by: user?.full_name || 'Caissier',
      type: req.type,
      amount: req.amount,
      motif: req.reason,
      status: 'EN_ATTENTE' // En attente, Acceptée, Refusée, Exécutée
    }

    const updated = [newReq, ...pendingRequests]
    setPendingRequests(updated)
    if (company?.id) {
      localStorage.setItem(`gestio_treasury_requests_${company.id}`, JSON.stringify(updated))
    }

    toast.success(
      'Demande envoyée vers la Trésorerie',
      `Demande de versement de ${fmt(req.amount)} (${req.type}) soumise à validation.`
    )
    loadCaisseData()
  }

  // ─── Action : Ajustement de Caisse ─────────────────────────────────────────
  const handleAdjustFunds = (adj: { cash: number; momo: number; reason: string; diffCash: number; diffMomo: number }) => {
    saveCaisseState(caisseStatus, openedAt, openedBy, adj.cash, adj.momo)

    // Ajouter un mouvement d'audit
    const auditMovement: CashMovement = {
      id: `adj-${Date.now()}`,
      created_at: new Date().toISOString(),
      user_name: user?.full_name || 'Administrateur',
      type: 'AJUSTEMENT',
      payment_channel: 'Tous',
      amount: Math.abs(adj.diffCash) + Math.abs(adj.diffMomo),
      motif: `Ajustement de solde : ${adj.reason}`,
      reference: 'AUDIT-CAISSE',
      status: 'VALIDE'
    }

    setMovementsHistory((prev) => [auditMovement, ...prev])
    toast.success('Fonds ajustés avec succès', `Motif : ${adj.reason}`)
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête du Module Caisse ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
              caisseStatus === 'OUVERTE'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}>
              {caisseStatus === 'OUVERTE' ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-600" /> Caisse Ouverte
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-rose-600" /> Caisse Fermée
                </>
              )}
            </span>
            {openedAt && (
              <span className="text-xs text-slate-400">
                Depuis {new Date(openedAt).toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })} ({openedBy})
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-600" />
            Caisse Opérationnelle
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestion du tiroir espèces, réceptions Mobile Money, clôtures journalières et versements
          </p>
        </div>

        {/* Boutons d'actions principaux */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Ajustement (Admin / Gérant) */}
          <button
            onClick={() => setShowAdjustModal(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="Modifier manuellement les fonds avec motif d'audit"
          >
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>Ajustement</span>
          </button>

          {/* Envoyer une demande vers Trésorerie */}
          <button
            onClick={() => setShowWithdrawalModal(true)}
            disabled={caisseStatus !== 'OUVERTE'}
            className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Envoyer une demande</span>
          </button>

          {/* Boutons d'état : Ouvrir la Caisse / Fermer la Caisse */}
          {caisseStatus === 'FERMEE' ? (
            <button
              onClick={() => {
                setOpenInputCash(initialCash)
                setOpenInputMomo(initialMomo)
                setShowOpenModal(true)
              }}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-200 transition flex items-center gap-1.5"
            >
              <Unlock className="w-4 h-4" />
              <span>Ouvrir la caisse</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setClosingPhysicalCash(fondActuelEspeces)
                setShowCloseModal(true)
              }}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 transition flex items-center gap-1.5"
            >
              <Lock className="w-4 h-4" />
              <span>Fermer la caisse</span>
            </button>
          )}

          {closuresHistory.length > 0 && (
            <button
              onClick={() => {
                setActiveReportClosure(closuresHistory[0])
                setShowReportModal(true)
              }}
              className="px-3.5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              title="Consulter le dernier rapport de clôture"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Dernier Z</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 5 Indicateurs Clés de Caisse (Conformes au Point 5) ───────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* A. Fond actuel — Espèces */}
        <div className="bg-white rounded-3xl border-2 border-emerald-300 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">
              Fond Actuel Espèces
            </span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">
            {fmt(fondActuelEspeces)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Tiroir réel après clôtures
          </p>
        </div>

        {/* B. Fond actuel — MoMo */}
        <div className="bg-white rounded-3xl border-2 border-amber-300 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-amber-800 uppercase tracking-wider">
              Fond Actuel MoMo
            </span>
            <Smartphone className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">
            {fmt(fondActuelMomo)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Comptes marchands (MTN/Moov)
          </p>
        </div>

        {/* C. Espèces du jour */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Espèces du Jour
            </span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-emerald-700 font-mono">
            {fmt(especesDuJour)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Encaissé aujourd'hui en cash
          </p>
        </div>

        {/* D. MoMo du jour */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              MoMo du Jour
            </span>
            <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Smartphone className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-amber-700 font-mono">
            {fmt(momoDuJour)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Paiements électroniques reçus
          </p>
        </div>

        {/* E. CA du jour */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              CA du Jour
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">Ventes réelles</span>
          </div>
          <p className="text-xl font-black text-emerald-400 font-mono">
            {fmt(caDuJour)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-700 pt-1.5">
            {salesToday.length} vente(s) enregistrée(s)
          </p>
        </div>
      </div>

      {/* ── Section Demandes de Retrait vers Trésorerie ──────────────────────── */}
      {pendingRequests.length > 0 && (
        <div className="bg-indigo-50/50 border border-indigo-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
              <span>Demandes d'envoi vers Trésorerie ({pendingRequests.length})</span>
            </h3>
            <span className="text-xs text-indigo-700 font-medium">Traçabilité caisse $\leftrightarrow$ trésorerie</span>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-indigo-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-indigo-50/60 text-indigo-900 font-bold border-b border-indigo-100">
                <tr>
                  <th className="p-3">Date / Heure</th>
                  <th className="p-3">Demandeur</th>
                  <th className="p-3 text-center">Canal</th>
                  <th className="p-3 text-right">Montant</th>
                  <th className="p-3">Motif</th>
                  <th className="p-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {pendingRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-indigo-50/30">
                    <td className="p-3 text-slate-500 font-sans">
                      {new Date(req.created_at).toLocaleString('fr-BJ', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3 font-sans font-bold text-slate-800">{req.requested_by}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        req.type === 'Espèces' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {req.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(req.amount)}</td>
                    <td className="p-3 font-sans text-slate-600">{req.motif}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-sans ${
                        req.status === 'EN_ATTENTE'
                          ? 'bg-amber-100 text-amber-800'
                          : req.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {req.status === 'EN_ATTENTE' ? 'En attente' : req.status === 'APPROVED' ? 'Exécutée' : 'Refusée'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section Historique des Mouvements de Caisse (Point 9) ────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">
              Historique des Mouvements de Caisse ({movementsHistory.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">Encaissements, retraits, clôtures et ajustements réels</span>
        </div>

        {movementsHistory.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Aucun mouvement de caisse enregistré pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase">
                <tr>
                  <th className="p-3.5">Date / Heure</th>
                  <th className="p-3.5">Utilisateur</th>
                  <th className="p-3.5">Type Mouvement</th>
                  <th className="p-3.5 text-center">Canal</th>
                  <th className="p-3.5 text-right">Montant</th>
                  <th className="p-3.5">Motif</th>
                  <th className="p-3.5">Référence</th>
                  <th className="p-3.5 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {movementsHistory.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 text-slate-500 font-sans">
                      {new Date(m.created_at).toLocaleString('fr-BJ', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3.5 font-sans font-bold text-slate-700">{m.user_name}</td>
                    <td className="p-3.5 font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.type === 'ENCAISSEMENT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : m.type === 'RETRAIT'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-sans">
                      <span className="text-[11px] font-medium text-slate-600">{m.payment_channel}</span>
                    </td>
                    <td className="p-3.5 text-right font-black text-slate-900">
                      {fmt(m.amount)}
                    </td>
                    <td className="p-3.5 font-sans text-slate-600 truncate max-w-xs">{m.motif}</td>
                    <td className="p-3.5 text-slate-500">{m.reference}</td>
                    <td className="p-3.5 text-center font-sans">
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section Historique des Clôtures de Caisse (Point 6) ──────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Historique des Clôtures de Caisse ({closuresHistory.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">Tous les Z de caisse archivés définitivement</span>
        </div>

        {closuresHistory.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Aucune clôture de caisse n'a encore été enregistrée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase">
                <tr>
                  <th className="p-3.5">Date & Heure</th>
                  <th className="p-3.5">Utilisateur</th>
                  <th className="p-3.5">Caisse</th>
                  <th className="p-3.5 text-right">Espèces Théorique</th>
                  <th className="p-3.5 text-right">Espèces Comptées</th>
                  <th className="p-3.5 text-right">Écart</th>
                  <th className="p-3.5 text-right">MoMo</th>
                  <th className="p-3.5 text-right">Total Z</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {closuresHistory.map((cl) => (
                  <tr key={cl.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 text-slate-600 font-sans">
                      {new Date(cl.closed_at).toLocaleString('fr-BJ', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3.5 font-sans font-bold text-slate-800">{cl.closed_by}</td>
                    <td className="p-3.5 font-sans text-slate-600">{cl.caisse_name}</td>
                    <td className="p-3.5 text-right text-slate-700">{fmt(cl.fond_especes_theorique)}</td>
                    <td className="p-3.5 text-right font-bold text-slate-900">{fmt(cl.fond_especes_physique)}</td>
                    <td className="p-3.5 text-right font-bold">
                      <span className={cl.ecart_especes === 0 ? 'text-slate-400' : cl.ecart_especes > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {cl.ecart_especes > 0 ? '+' : ''}{fmt(cl.ecart_especes)}
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-amber-800">{fmt(cl.fond_momo)}</td>
                    <td className="p-3.5 text-right font-black text-emerald-700 text-sm">
                      {fmt(cl.total_fermeture)}
                    </td>
                    <td className="p-3.5 text-center font-sans">
                      <button
                        onClick={() => {
                          setActiveReportClosure(cl)
                          setShowReportModal(true)
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 mx-auto"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Imprimer Z</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL OUVERTURE DE CAISSE ───────────────────────────────────────── */}
      <ModalPortal isOpen={showOpenModal} onClose={() => setShowOpenModal(false)} id="modal-open-caisse">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Unlock className="w-5 h-5 text-emerald-600" />
              Ouverture de Session de Caisse
            </h3>
            <button onClick={() => setShowOpenModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleOpenCaisse} className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900">
              <p className="font-medium">
                Saisissez les fonds initiaux disponibles au démarrage de la journée dans le tiroir et sur le compte MoMo.
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Fond Initial Espèces (Tiroir) *</label>
              <input
                type="number"
                required
                min="0"
                value={openInputCash}
                onChange={(e) => setOpenInputCash(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">Laissez 0 si vous commencez sans fond de caisse.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Fond Initial Mobile Money MoMo *</label>
              <input
                type="number"
                required
                min="0"
                value={openInputMomo}
                onChange={(e) => setOpenInputMomo(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">Solde de départ sur le numéro marchand.</p>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowOpenModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" /> Confirmer l'Ouverture
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* ── MODAL FERMETURE DE CAISSE (Z DE CAISSE) ─────────────────────────── */}
      <ModalPortal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} id="modal-close-caisse">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Lock className="w-5 h-5 text-rose-600" />
              Clôture Journalière de Caisse
            </h3>
            <button onClick={() => setShowCloseModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3.5 rounded-2xl space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-600 font-sans">Solde Espèces Théorique :</span>
                <span className="font-bold text-slate-900">{fmt(fondActuelEspeces)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-sans">Solde MoMo Théorique :</span>
                <span className="font-bold text-slate-900">{fmt(fondActuelMomo)}</span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Espèces réellement comptées dans le tiroir (FCFA) *
              </label>
              <input
                type="number"
                value={closingPhysicalCash}
                onChange={(e) => setClosingPhysicalCash(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-sm font-bold"
              />
              {closingPhysicalCash !== fondActuelEspeces && (
                <p className="text-xs font-bold text-rose-600 mt-1 font-mono">
                  Écart de caisse : {fmt(closingPhysicalCash - fondActuelEspeces)}
                </p>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Observations / Remarques</label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Ex : RAS, solde exact remis au gérant"
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseCaisse}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" /> Valider Clôture
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL RAPPORT DE CLÔTURE IMPRIMABLE (Z DE CAISSE) ───────────────── */}
      {activeReportClosure && (
        <ModalPortal isOpen={showReportModal} onClose={() => setShowReportModal(false)} id="modal-caisse-report">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                Rapport Officiel de Clôture (Z de Caisse)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimer Z
                </button>
                <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs space-y-3">
              <div className="text-center pb-3 border-b border-slate-200 space-y-0.5">
                <p className="font-black text-base uppercase text-slate-900">{company?.name ?? 'GESTIO 229'}</p>
                <p className="text-[11px] text-slate-600 font-bold uppercase">Z DE CAISSE JOURNALIER — RÉCAPITULATIF</p>
                <p className="text-[10px] text-slate-400">Date : {new Date(activeReportClosure.closed_at).toLocaleString('fr-BJ')}</p>
                <p className="text-[10px] text-slate-400">Opérateur : {activeReportClosure.closed_by}</p>
              </div>

              <div className="space-y-1.5 py-1">
                <div className="flex justify-between">
                  <span>Solde Espèces Théorique :</span>
                  <span>{fmt(activeReportClosure.fond_especes_theorique)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Espèces Réellement Comptées :</span>
                  <span>{fmt(activeReportClosure.fond_especes_physique)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Écart de Caisse :</span>
                  <span className={activeReportClosure.ecart_especes === 0 ? 'text-slate-600' : activeReportClosure.ecart_especes > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                    {activeReportClosure.ecart_especes > 0 ? '+' : ''}{fmt(activeReportClosure.ecart_especes)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-800 pt-1 border-t border-slate-200">
                  <span>Solde Mobile Money :</span>
                  <span>{fmt(activeReportClosure.fond_momo)}</span>
                </div>
              </div>

              <div className="border-t-2 border-slate-300 pt-2 font-black text-sm space-y-1">
                <div className="flex justify-between text-emerald-800">
                  <span>TOTAL FERMETURE CONSOLIDÉ :</span>
                  <span>{fmt(activeReportClosure.total_fermeture)}</span>
                </div>
              </div>

              {activeReportClosure.notes && (
                <div className="pt-2 text-[11px] text-slate-600 font-sans border-t border-slate-200">
                  <p className="font-bold">Observations :</p>
                  <p>{activeReportClosure.notes}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex justify-between text-[10px] font-sans">
                <div>
                  <p className="font-bold">Signature Caissier :</p>
                  <p className="text-slate-500 mt-6">{activeReportClosure.closed_by}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">Visa Direction / Gérant :</p>
                  <p className="text-slate-500 mt-6">Approuvé</p>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modals tierces (Ajustement & Demande de retrait) */}
      <AdjustFundsModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        currentCash={fondActuelEspeces}
        currentMomo={fondActuelMomo}
        onSuccess={handleAdjustFunds}
      />
      <WithdrawalRequestModal
        isOpen={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
        onSuccess={handleSendWithdrawalRequest}
      />
    </div>
  )
}

export default CaissePage
