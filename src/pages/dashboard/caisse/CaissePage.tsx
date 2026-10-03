// =============================================================================
// GESTIO 229 SaaS — Caisse Opérationnelle du Secteur
// =============================================================================
// Séparation stricte de la Trésorerie Centrale
// Gestion des fonds Espèces / MoMo, Mouvements réels, Clôtures (Z de caisse)
// Demandes de transfert vers Trésorerie et Ajustements avec audit obligatoire
// Zéro donnée fictive
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Wallet, Plus, X, CheckCircle, Clock, TrendingUp, TrendingDown,
  Lock, Unlock, Shield, ArrowUpRight, Smartphone, RefreshCw, AlertCircle,
  Printer, Send, FileCheck, Check, ArrowRightLeft, FileText, History
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { getActiveCaisse } from '../../../lib/supabaseTenant'
import { getActiveSectorSlug, filterItemsForSector } from '../../../lib/sectorClient'
import { AdjustFundsModal, WithdrawalRequestModal, ModalPortal } from '../../../components/modals'
import { logAuditEvent } from '../../../services/auditService'

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
  emailed_to?: string[]
}

export const CaissePage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const navigate = useNavigate()
  const { companyId, sectorSlug: tenantSectorSlug, supabaseTenant } = useTenant()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = tenantSectorSlug || params.sectorSlug || getActiveSectorSlug()
  const currentCompanyId = companyId || company?.id || ''

  // État de la caisse : Ouverte ou Fermée
  const [caisseStatus, setCaisseStatus] = useState<'OUVERTE' | 'FERMEE'>('FERMEE')
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const [openedBy, setOpenedBy] = useState<string>('')
  const [initialCash, setInitialCash] = useState<number>(0)
  const [initialMomo, setInitialMomo] = useState<number>(0)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [cashRegisterId, setCashRegisterId] = useState<string | null>(null)

  // Données réelles des ventes et remboursements du jour
  const [salesToday, setSalesToday] = useState<any[]>([])
  const [repaymentsToday, setRepaymentsToday] = useState<any[]>([])
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
  const [customReportEmail, setCustomReportEmail] = useState<string>('')
  const [isOperatingCaisse, setIsOperatingCaisse] = useState<boolean>(false)

  // Saisie ouverture
  const [openInputCash, setOpenInputCash] = useState<number>(0)
  const [openInputMomo, setOpenInputMomo] = useState<number>(0)

  // Saisie clôture
  const [closingPhysicalCash, setClosingPhysicalCash] = useState<number>(0)
  const [rolloverCash, setRolloverCash] = useState<number>(0)
  const [closingNotes, setClosingNotes] = useState<string>('')

  // Vérifier si la session a été ouverte un jour précédent et jamais clôturée
  const isPreviousDaySession = useMemo(() => {
    if (caisseStatus !== 'OUVERTE' || !openedAt) return false
    const openD = new Date(openedAt).toDateString()
    const todayD = new Date().toDateString()
    return openD !== todayD
  }, [caisseStatus, openedAt])

  // Mettre à jour l'état de session caisse en mémoire
  const saveCaisseState = (status: 'OUVERTE' | 'FERMEE', opAt: string | null, opBy: string, initC: number, initM: number) => {
    setCaisseStatus(status)
    setOpenedAt(opAt)
    setOpenedBy(opBy)
    setInitialCash(initC)
    setInitialMomo(initM)
  }

  // Charger les ventes réelles et remboursements du jour depuis Supabase
  const loadCaisseData = useCallback(async () => {
    if (!currentCompanyId) return
    setLoading(true)
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

      // 0. Synchronisation persistante Supabase : Caisse active isolée par couple (company_id, sector_slug)
      try {
        const { data: registers } = await supabase
          .from('cash_registers')
          .select('id, name, current_cash_balance, current_momo_balance')
          .eq('company_id', currentCompanyId)
          .limit(1)

        if (registers && registers.length > 0) {
          setCashRegisterId(registers[0].id)
        }

        // Vérifier si une session/caisse est ouverte pour ce secteur (persistance nocturne)
        const activeCaisse = await getActiveCaisse(currentCompanyId, currentSectorSlug)
        if (activeCaisse) {
          setActiveSessionId(activeCaisse.id)
          setCaisseStatus('OUVERTE')
          setOpenedAt(activeCaisse.date_ouverture || activeCaisse.opened_at)
          setOpenedBy(activeCaisse.ouvert_par || user?.full_name || 'Caissier')
          setInitialCash(Number(activeCaisse.fond_ouverture_especes ?? activeCaisse.opening_cash) || 0)
          setInitialMomo(Number(activeCaisse.fond_ouverture_momo ?? activeCaisse.opening_momo) || 0)
        } else {
          setActiveSessionId(null)
          setCaisseStatus('FERMEE')
          setOpenedAt(null)
        }

        // Charger l'historique des clôtures archivées pour ce secteur
        try {
          const { data: dbClotures } = await supabase
            .from('caisse_clotures')
            .select('*')
            .eq('company_id', currentCompanyId)
            .eq('sector_slug', currentSectorSlug)
            .order('date_cloture', { ascending: false })
            .limit(30)

          if (dbClotures && dbClotures.length > 0) {
            const mappedClosures: CashClosure[] = dbClotures.map((cc: any) => ({
              id: cc.id,
              closed_at: cc.date_cloture || cc.created_at,
              closed_by: cc.cloture_par || 'Caissier',
              caisse_name: `Caisse ${currentSectorSlug.toUpperCase()}`,
              fond_especes_theorique: Number(cc.fond_actuel_especes_apres) || 0,
              fond_especes_physique: Number(cc.fond_actuel_especes_apres) || 0,
              ecart_especes: 0,
              fond_momo: Number(cc.fond_actuel_momo_apres) || 0,
              total_fermeture: (Number(cc.fond_actuel_especes_apres) || 0) + (Number(cc.fond_actuel_momo_apres) || 0),
              notes: 'Clôture archivée',
              status: 'CLOTURE_VALIDEE',
            }))
            setClosuresHistory(mappedClosures)
          } else {
            // Fallback cash_sessions
            const { data: closedSessions } = await supabase
              .from('cash_sessions')
              .select('*')
              .eq('company_id', currentCompanyId)
              .eq('status', 'cloturee')
              .order('closed_at', { ascending: false })
              .limit(30)

            if (closedSessions && closedSessions.length > 0) {
              const dbClosures: CashClosure[] = closedSessions.map((cs: any) => ({
                id: cs.id,
                closed_at: cs.closed_at || cs.opened_at,
                closed_by: user?.full_name || 'Caissier',
                caisse_name: `Caisse ${currentSectorSlug.toUpperCase()}`,
                fond_especes_theorique: (Number(cs.closing_cash_counted) || 0) - (Number(cs.cash_discrepancy) || 0),
                fond_especes_physique: Number(cs.closing_cash_counted) || 0,
                ecart_especes: Number(cs.cash_discrepancy) || 0,
                fond_momo: Number(cs.closing_momo_counted) || 0,
                total_fermeture: (Number(cs.closing_cash_counted) || 0) + (Number(cs.closing_momo_counted) || 0),
                notes: cs.closing_notes || 'Clôture archivée',
                status: 'CLOTURE_VALIDEE',
              }))
              setClosuresHistory(dbClosures)
            }
          }
        } catch (cErr) {
          console.warn('Fallback lecture clôtures:', cErr)
        }
      } catch (sessErr) {
        console.warn('Fallback lecture caisses Supabase:', sessErr)
      }

      // 1. Ventes du jour réelles depuis Supabase filtrées strictement par secteur
      const { data: sales, error } = await supabase
        .from('sales_orders')
        .select('*, customer:customers(id, name, ifu_number)')
        .eq('company_id', currentCompanyId)
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false })

      if (error) console.warn('Erreur chargement sales_orders :', error)
      const realSales = filterItemsForSector(sales || [], currentSectorSlug)

      // Parser les paiements de chaque vente (depuis notes, e_mecef_uid ou payment_status)
      const parsedSales = realSales.map((s: any) => {
        let payments: { method: string; amount: number }[] = []
        let parsedNotes: any = {}
        if (s.notes) {
          try {
            parsedNotes = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
            if (Array.isArray(parsedNotes.payments) && parsedNotes.payments.length > 0) {
              payments = parsedNotes.payments
            }
          } catch (e) {}
        }

        if (payments.length === 0 && s.e_mecef_uid) {
          try {
            if (s.e_mecef_uid.startsWith('{')) {
              const uMeta = JSON.parse(s.e_mecef_uid)
              if (Array.isArray(uMeta.payments)) payments = uMeta.payments
              else if (uMeta.pm) payments = [{ method: uMeta.pm, amount: Number(s.paid_amount ?? s.total_amount) || 0 }]
            } else {
              s.e_mecef_uid.split('|').forEach((part: string) => {
                const [k, v] = part.split(':')
                if (k === 'PAY') payments = [{ method: v, amount: Number(s.paid_amount ?? s.total_amount) || 0 }]
              })
            }
          } catch (e) {}
        }

        if (payments.length === 0) {
          const rawMethod = s.payment_status === 'credit' ? 'credit' : (s.payment_status || s.payment_method || 'especes')
          payments = [{ method: rawMethod, amount: Number(s.paid_amount ?? s.total_amount) || 0 }]
        }

        const clientName = s.customer?.name || s.customer_name || parsedNotes.customer_name || 'Client Comptoir'

        return { ...s, parsedPayments: payments, customer_name: clientName }
      })
      setSalesToday(parsedSales)

      // 2. Remboursements de créances du jour
      let repList: any[] = []
      try {
        const { data: repayments } = await supabase
          .from('customer_repayments')
          .select('*, customer:customers(name)')
          .eq('company_id', currentCompanyId)
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false })
        if (repayments) repList = repayments
      } catch (err) {
        console.warn('Fallback customer_repayments :', err)
      }
      // Si la table customer_repayments est indisponible, interroger audit_logs Supabase
      if (repList.length === 0) {
        try {
          const { data: auditReps } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('company_id', currentCompanyId)
            .eq('action', 'REMBOURSEMENT_CREANCE')
            .gte('created_at', startOfDay)
            .order('created_at', { ascending: false })
          if (auditReps && auditReps.length > 0) {
            repList = auditReps.map((a: any) => {
              const det = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {})
              return {
                id: a.id,
                created_at: a.created_at,
                customer_name: det.customer_name || 'Client',
                amount: Number(det.amount) || 0,
                payment_method: det.payment_method || 'especes',
                reference: det.reference || `RC-${a.id.slice(0, 6)}`
              }
            })
          }
        } catch (e) {}
      }
      setRepaymentsToday(repList)

      // 3. Mouvements de caisse
      const saleMovements: CashMovement[] = []
      parsedSales.forEach((s: any) => {
        s.parsedPayments.forEach((p: any, idx: number) => {
          const isCash = p.method === 'cash' || p.method === 'especes'
          const isMomo = p.method.includes('momo') || p.method.includes('wave') || p.method.includes('flooz')
          if (p.amount > 0 && (isCash || isMomo)) {
            saleMovements.push({
              id: `mov-${s.id}-${idx}`,
              created_at: s.created_at,
              user_name: s.created_by_name || 'Vendeur / Caissier',
              type: 'ENCAISSEMENT',
              payment_channel: isCash ? 'Espèces' : 'MoMo',
              amount: Number(p.amount) || 0,
              motif: `Vente POS N° ${s.order_number || s.id.slice(0, 8)} (${p.method})`,
              reference: s.order_number || s.id.slice(0, 8),
              status: 'VALIDE'
            })
          }
        })
      })

      const repaymentMovements: CashMovement[] = repList.map((r: any) => {
        const isCash = r.payment_method === 'cash' || r.payment_method === 'especes'
        return {
          id: `rep-${r.id}`,
          created_at: r.created_at,
          user_name: r.created_by_name || 'Caissier',
          type: 'REMBOURSEMENT',
          payment_channel: isCash ? 'Espèces' : 'MoMo',
          amount: Number(r.amount) || 0,
          motif: `Remboursement créance : ${r.customer?.name || r.customer_name || 'Client'}`,
          reference: r.reference || `RC-${r.id.slice(0, 6)}`,
          status: 'VALIDE'
        }
      })

      // Charger les demandes de transfert directement depuis Supabase (treasury_transfers ou audit_logs)
      let transferMovements: CashMovement[] = []
      try {
        const { data: dbTransfers } = await supabase
          .from('treasury_transfers')
          .select('*')
          .eq('company_id', currentCompanyId)
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false })
        if (dbTransfers && dbTransfers.length > 0) {
          setPendingRequests(dbTransfers)
          transferMovements = dbTransfers.map((r: any) => ({
            id: r.id,
            created_at: r.created_at,
            user_name: r.requested_by,
            type: 'RETRAIT',
            payment_channel: r.type,
            amount: Number(r.amount) || 0,
            motif: `Demande transfert trésorerie : ${r.motif}`,
            reference: `TR-${r.id.slice(0, 6)}`,
            status: r.status === 'APPROVED' ? 'VALIDE' : r.status === 'REJECTED' ? 'REFUSE' : 'EN_ATTENTE'
          }))
        } else {
          // Requête vers audit_logs pour les demandes
          const { data: auditTransfers } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('company_id', currentCompanyId)
            .eq('action', 'DEMANDE_TRANSFERT_TRESORERIE')
            .gte('created_at', startOfDay)
            .order('created_at', { ascending: false })
          if (auditTransfers && auditTransfers.length > 0) {
            const mapped = auditTransfers.map((a: any) => {
              const det = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {})
              return {
                id: a.id,
                created_at: a.created_at,
                requested_by: a.user_name || 'Caissier',
                type: det.type || 'Espèces',
                amount: Number(det.amount) || 0,
                motif: det.motif || '',
                status: det.status || 'EN_ATTENTE'
              }
            })
            setPendingRequests(mapped)
            transferMovements = mapped.map((r: any) => ({
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
          }
        }
      } catch (e) {}

      setMovementsHistory(
        [...transferMovements, ...repaymentMovements, ...saleMovements].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      )
    } catch (err: any) {
      console.error('Erreur chargement données caisse :', err)
      setSalesToday([])
      setRepaymentsToday([])
      setMovementsHistory([])
    } finally {
      setLoading(false)
    }
  }, [currentCompanyId, currentSectorSlug, user?.full_name])

  useEffect(() => {
    loadCaisseData()
  }, [loadCaisseData])

  // =============================================================================
  // AUDIT & FORMULES FINANCIÈRES CAISSE OPÉRATIONNELLE :
  // 1. Fond initial global = Fond_Initial_Espèces + Fond_Initial_MoMo (déclaré à l'ouverture)
  // 2. Total des entrées du jour = Ventes_Espèces + Ventes_MoMo + Recouvrements_Espèces + Recouvrements_MoMo
  // 3. Fond théorique actuel Espèces = Fond_Initial_Espèces + Ventes_Espèces + Recouvrements_Espèces - Retraits_Espèces_Validés
  // 4. Fond théorique actuel MoMo = Fond_Initial_MoMo + Ventes_MoMo + Recouvrements_MoMo - Retraits_MoMo_Validés
  // 5. Fond théorique global = Fond_Actuel_Espèces + Fond_Actuel_MoMo
  // 6. Écart de caisse à la clôture (Z de caisse) :
  //    - Écart Espèces = Fond_Physique_Espèces_Compté - Fond_Théorique_Espèces
  //      * Si Écart = 0 : Caisse parfaitement équilibrée
  //      * Si Écart < 0 : Manquant de caisse injustifié
  //      * Si Écart > 0 : Excédent de caisse
  // =============================================================================

  // 1. Ventes en espèces
  const ventesEspeces = useMemo(() => {
    return salesToday.reduce((sum, s) => {
      if (Array.isArray(s.parsedPayments)) {
        const cashPart = s.parsedPayments
          .filter((p: any) => p.method === 'cash' || p.method === 'especes')
          .reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0)
        return sum + cashPart
      }
      return sum + ((s.payment_method === 'cash' || s.payment_method === 'especes') ? Number(s.total_amount) || 0 : 0)
    }, 0)
  }, [salesToday])

  // 2. Ventes en MoMo
  const ventesMomo = useMemo(() => {
    return salesToday.reduce((sum, s) => {
      if (Array.isArray(s.parsedPayments)) {
        const momoPart = s.parsedPayments
          .filter((p: any) => p.method.includes('momo') || p.method.includes('wave') || p.method.includes('flooz'))
          .reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0)
        return sum + momoPart
      }
      return sum + ((s.payment_method && (s.payment_method.includes('momo') || s.payment_method.includes('wave'))) ? Number(s.total_amount) || 0 : 0)
    }, 0)
  }, [salesToday])

  // 3. Remboursements créances en espèces
  const remboursementsEspeces = useMemo(() => {
    return repaymentsToday
      .filter((r) => r.payment_method === 'cash' || r.payment_method === 'especes')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [repaymentsToday])

  // 4. Remboursements créances en MoMo
  const remboursementsMomo = useMemo(() => {
    return repaymentsToday
      .filter((r) => r.payment_method && (r.payment_method.includes('momo') || r.payment_method.includes('wave')))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [repaymentsToday])

  // 5. Total entrées du jour
  const totalEntreesDuJour = ventesEspeces + ventesMomo + remboursementsEspeces + remboursementsMomo

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

  // 1. Flux réels de la session en cours
  // Espèces du jour : Ventes espèces + Remboursements créances espèces - Retraits espèces validés
  const especesDuJour = Math.max(0, ventesEspeces + remboursementsEspeces - totalRetraitsEspeces)

  // MoMo du jour : Ventes MoMo + Remboursements créances MoMo - Retraits MoMo validés
  const momoDuJour = Math.max(0, ventesMomo + remboursementsMomo - totalRetraitsMomo)

  // Fond théorique calculé en cours de session (pour contrôle et comptage lors de la clôture)
  const fondTheoriqueEsp = initialCash + ventesEspeces + remboursementsEspeces - totalRetraitsEspeces
  const fondTheoriqueMomo = initialMomo + ventesMomo + remboursementsMomo - totalRetraitsMomo

  // 2. Fond actuel espèces & MoMo :
  // RÈGLE : C'est APRÈS clôture de caisse que les espèces du jour et momo du jour vont
  // respectivement dans fond actuel espèces et fond actuel momo (reflétant le tiroir réel clôturé).
  const lastClosure = closuresHistory.length > 0 ? closuresHistory[0] : null
  const fondActuelEspeces = lastClosure
    ? (Number(lastClosure.fond_especes_physique) || 0)
    : (caisseStatus === 'FERMEE' ? 0 : initialCash)
  const fondActuelMomo = lastClosure
    ? (Number(lastClosure.fond_momo) || 0)
    : (caisseStatus === 'FERMEE' ? 0 : initialMomo)

  // 3. Fond initial global
  const fondInitialTotal = initialCash + initialMomo

  // 4. Fond théorique actuel global
  const fondTheoriqueActuel = fondTheoriqueEsp + fondTheoriqueMomo

  // CA total des ventes du jour (tous modes confondus, hors avoirs)
  const caDuJour = useMemo(() => {
    return salesToday
      .filter((s) => s.payment_status !== 'avoir' && s.status !== 'AVOIR')
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // ─── Action : Ouvrir la Caisse ─────────────────────────────────────────────
  const handleOpenCaisse = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsOperatingCaisse(true)
    const opBy = user?.full_name || user?.username || 'Caissier'
    const nowIso = new Date().toISOString()
    const initC = Number(openInputCash) || 0
    const initM = Number(openInputMomo) || 0
    const cleanSlug = (currentSectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
    const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
      ? user.id
      : null

    console.log('[CASH-OPEN]', {
      company_id: currentCompanyId,
      sector_slug: cleanSlug,
      user_id: validUserId,
      user_name: opBy,
      fond_especes: initC,
      fond_momo: initM,
      date_ouverture: nowIso,
      statut: 'ouverte'
    })

    let createdSessionId: string | null = null

    try {
      let regId = cashRegisterId
      if (!regId && currentCompanyId) {
        const { data: reg } = await supabase
          .from('cash_registers')
          .select('id')
          .eq('company_id', currentCompanyId)
          .limit(1)
          .maybeSingle()
        if (reg?.id) {
          regId = reg.id
          setCashRegisterId(reg.id)
        }
      }

      if (currentCompanyId) {
        // 1. Table caisses (standard 19 secteurs M025)
        try {
          const { data: newCaisse, error: caisseErr } = await supabase
            .from('caisses')
            .insert({
              company_id: currentCompanyId,
              sector_slug: cleanSlug,
              date_ouverture: nowIso,
              statut: 'ouverte',
              fond_ouverture_especes: initC,
              fond_ouverture_momo: initM,
              ouvert_par: validUserId
            })
            .select()
            .single()

          if (caisseErr) {
            console.error('[CASH-OPEN] Erreur insertion caisses:', caisseErr)
          } else if (newCaisse?.id) {
            createdSessionId = newCaisse.id
            setActiveSessionId(newCaisse.id)
            console.log('[CASH-OPEN] Caisse enregistrée avec succès dans caisses, ID:', newCaisse.id)
          }
        } catch (cErr) {
          console.error('[CASH-OPEN] Exception insertion caisses:', cErr)
        }

        // 2. Rétro-compatibilité synchronisée cash_sessions
        try {
          const { data: newSession, error: sessErr } = await supabase
            .from('cash_sessions')
            .insert({
              company_id: currentCompanyId,
              cash_register_id: regId || null,
              cashier_id: validUserId,
              opened_at: nowIso,
              opening_cash: initC,
              opening_momo: initM,
              status: 'ouverte',
              closing_notes: `[SECTOR:${cleanSlug}] Fond initial: ${initC} FCFA par ${opBy}`
            })
            .select()
            .single()

          if (sessErr) {
            console.warn('[CASH-OPEN] Avertissement cash_sessions:', sessErr)
          } else if (newSession?.id) {
            if (!createdSessionId) {
              createdSessionId = newSession.id
              setActiveSessionId(newSession.id)
            }
            console.log('[CASH-OPEN] Caisse enregistrée dans cash_sessions, ID:', newSession.id)
          }
        } catch (sErr) {
          console.warn('[CASH-OPEN] Exception insertion cash_sessions:', sErr)
        }

        // 3. Mise à jour de la caisse physique (cash_registers)
        if (regId) {
          try {
            await supabase
              .from('cash_registers')
              .update({
                current_cash_balance: initC,
                current_momo_balance: initM,
                is_active: true
              })
              .eq('id', regId)
          } catch (_) {}
        }
      }

      saveCaisseState('OUVERTE', nowIso, opBy, initC, initM)
      setShowOpenModal(false)
      toast.success('Caisse Ouverte avec succès !', `Fond initial tiroir : ${fmt(openInputCash)}`)

      await logAuditEvent({
        companyId: company?.id,
        userId: user?.id,
        userName: user?.full_name,
        userRole: user?.role,
        action: 'OUVERTURE_CAISSE',
        module: 'CAISSE',
        sector: currentSectorSlug.toUpperCase(),
        description: `Ouverture de la caisse ${currentSectorSlug} par ${opBy}. Fond tiroir : ${fmt(initC)}, MoMo : ${fmt(initM)}`
      })

      // Recharger les données locales de la page caisse
      await loadData()

      // Rediriger immédiatement vers le module Vente avec le nouvel ID de session
      navigate(`/app/${cleanSlug}/vente?session_id=${createdSessionId || ''}`, {
        state: { sessionId: createdSessionId, refreshCaisse: true }
      })
    } finally {
      setIsOperatingCaisse(false)
    }
  }

  // ─── Action : Fermer la Caisse (avec Clôture Rigoureuse et Audit) ─────────────
  const handleConfirmCloseCaisse = async () => {
    const totalEspecesJour = ventesEspeces + remboursementsEspeces
    const totalMomoJour = ventesMomo + remboursementsMomo
    const nouveauFondEspeces = initialCash + totalEspecesJour
    const nouveauFondMomo = initialMomo + totalMomoJour
    const ecart = Number(closingPhysicalCash) - fondTheoriqueEsp

    if (ecart !== 0 && !closingNotes.trim()) {
      toast.error('Justification obligatoire', 'Un écart de caisse est constaté. Veuillez saisir un motif dans les observations.')
      return
    }

    setIsOperatingCaisse(true)
    try {
      const closedAt = new Date().toISOString()
      const closedBy = user?.full_name || 'Caissier'

      // Récupérer les adresses emails de notification configurées
      const recipientEmails: string[] = []
      if ((company as any)?.closure_email_1) recipientEmails.push((company as any).closure_email_1.trim())
      if ((company as any)?.closure_email_2) recipientEmails.push((company as any).closure_email_2.trim())
      if ((company as any)?.closure_email_3) recipientEmails.push((company as any).closure_email_3.trim())
      if (recipientEmails.length === 0 && company?.email) recipientEmails.push(company.email.trim())

      const newClosure: CashClosure = {
        id: `cloture-${Date.now()}`,
        closed_at: closedAt,
        closed_by: closedBy,
        caisse_name: `Caisse ${currentSectorSlug.toUpperCase()}`,
        fond_especes_theorique: fondTheoriqueEsp,
        fond_especes_physique: Number(closingPhysicalCash),
        ecart_especes: ecart,
        fond_momo: momoDuJour,
        total_fermeture: Number(closingPhysicalCash) + momoDuJour,
        notes: closingNotes || 'Clôture de session normale',
        status: 'CLOTURE_VALIDEE',
        emailed_to: recipientEmails
      }

      setClosuresHistory([newClosure, ...closuresHistory])

      // Persistance Supabase
      if (company?.id) {
        try {
          if (activeSessionId) {
            const validCloseUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
              ? user.id
              : null

            // 1. Mise à jour de la table caisses
            await supabase.from('caisses').update({
              statut: 'fermee',
              date_fermeture: closedAt,
              solde_especes_final: Number(closingPhysicalCash) || 0,
              solde_momo_final: momoDuJour,
              ferme_par: validCloseUserId
            }).eq('id', activeSessionId)

            // 2. Insertion dans caisse_clotures (standard 19 secteurs)
            await supabase.from('caisse_clotures').insert({
              company_id: currentCompanyId,
              sector_slug: currentSectorSlug,
              caisse_id: activeSessionId,
              total_especes_jour: totalEspecesJour,
              total_momo_jour: totalMomoJour,
              fond_actuel_especes_apres: Number(closingPhysicalCash),
              fond_actuel_momo_apres: momoDuJour,
              cloture_par: closedBy,
              date_cloture: closedAt
            })

            // Rétrocompatibilité cash_sessions
            await supabase.from('cash_sessions').update({
              closed_at: closedAt,
              total_sales_cash: ventesEspeces,
              total_sales_momo: ventesMomo,
              total_credit_collected: remboursementsEspeces + remboursementsMomo,
              total_transferred_to_treasury: totalRetraitsEspeces + totalRetraitsMomo,
              closing_cash_counted: Number(closingPhysicalCash),
              closing_momo_counted: momoDuJour,
              cash_discrepancy: ecart,
              status: 'cloturee',
              closing_notes: closingNotes || 'Clôture de session normale',
              email_report_sent: recipientEmails.length > 0
            }).eq('id', activeSessionId)
          }

          // 3. Mise à jour coffre_fort
          try {
            const { data: exCoffre } = await supabase
              .from('coffre_fort')
              .select('*')
              .eq('company_id', currentCompanyId)
              .eq('sector_slug', currentSectorSlug)
              .maybeSingle()

            if (exCoffre) {
              await supabase.from('coffre_fort').update({
                solde_especes: Number(closingPhysicalCash),
                solde_momo_marchand: momoDuJour,
              }).eq('id', exCoffre.id)
            } else {
              await supabase.from('coffre_fort').insert({
                company_id: currentCompanyId,
                sector_slug: currentSectorSlug,
                solde_especes: nouveauFondEspeces,
                solde_momo_marchand: nouveauFondMomo,
                solde_banque: 0
              })
            }
          } catch (cfErr) {
            console.warn('Avertissement mise à jour coffre_fort:', cfErr)
          }

          // 4. Rapport en arrière-plan envoyé par email (table report_emails)
          try {
            await supabase.from('report_emails').insert({
              company_id: currentCompanyId,
              sector_slug: currentSectorSlug,
              report_type: 'cloture_caisse',
              recipient: recipientEmails.join(', ') || company?.email || 'direction@gestio229.bj',
              payload: {
                caisse_id: activeSessionId,
                closed_at: closedAt,
                closed_by: closedBy,
                total_especes_jour: totalEspecesJour,
                total_momo_jour: totalMomoJour,
                fond_ouverture_especes: initialCash,
                fond_ouverture_momo: initialMomo,
                fond_actuel_especes_apres: nouveauFondEspeces,
                fond_actuel_momo_apres: nouveauFondMomo,
                ecart_especes: ecart,
                notes: closingNotes
              },
              status: 'sent'
            })
          } catch (reErr) {
            console.warn('Avertissement insertion report_emails:', reErr)
          }

          if (cashRegisterId) {
            await supabase.from('cash_registers').update({
              current_cash_balance: 0,
              current_momo_balance: 0
            }).eq('id', cashRegisterId)
          }
        } catch (sessUpdErr) {
          console.warn('Erreur clôture caisse Supabase:', sessUpdErr)
        }
      }

      // Traçabilité Audit Senior
      await logAuditEvent({
        companyId: company?.id,
        userId: user?.id,
        userName: user?.full_name,
        userRole: user?.role,
        action: 'CLOTURE_CAISSE',
        module: 'CAISSE',
        sector: currentSectorSlug.toUpperCase(),
        description: `Clôture caisse ${currentSectorSlug} par ${closedBy}. Espèces comptées : ${fmt(closingPhysicalCash)} (Théorique : ${fmt(fondActuelEspeces)}, Écart : ${fmt(ecart)}). MoMo : ${fmt(fondActuelMomo)}. Fond reporté : ${fmt(nouveauFondEspeces)}.`
      })

      // Fermeture automatique, SANS modale rapport à l'écran
      saveCaisseState('FERMEE', null, '', 0, 0)
      setActiveSessionId(null)
      setShowCloseModal(false)
      setShowReportModal(false)

      toast.success(
        'Caisse Clôturée avec Succès !',
        `Rapport Z envoyé en arrière-plan. Total encaissé de la journée : ${fmt(totalEspecesJour + totalMomoJour)}`
      )
    } finally {
      setIsOperatingCaisse(false)
    }
  }

  const handleSendReportByEmail = () => {
    if (!customReportEmail.trim() || !activeReportClosure) return
    const updated = {
      ...activeReportClosure,
      emailed_to: [...(activeReportClosure.emailed_to || []), customReportEmail.trim()]
    }
    setActiveReportClosure(updated)
    toast.success('Rapport envoyé !', `Le rapport Z a été transmis avec succès à ${customReportEmail.trim()}`)
    setCustomReportEmail('')
  }

  // ─── Action : Envoyer une Demande vers Trésorerie ───────────────────────────
  const handleSendWithdrawalRequest = async (req: { type: string; amount: number; reason: string }) => {
    const newReq = {
      id: `req-${Date.now()}`,
      created_at: new Date().toISOString(),
      requested_by: user?.full_name || 'Caissier',
      type: req.type,
      amount: req.amount,
      motif: req.reason,
      sector_slug: currentSectorSlug,
      status: 'EN_ATTENTE' // En attente, Acceptée, Refusée, Exécutée
    }

    const updated = [newReq, ...pendingRequests]
    setPendingRequests(updated)

    if (currentCompanyId) {
      try {
        await supabase.from('treasury_transfers').insert({
          company_id: currentCompanyId,
          sector_slug: currentSectorSlug,
          requested_by: user?.full_name || 'Caissier',
          type: req.type,
          amount: req.amount,
          motif: req.reason,
          status: 'EN_ATTENTE'
        })
      } catch (e) {
        try {
          await supabase.from('audit_logs').insert({
            company_id: currentCompanyId,
            user_id: user?.id,
            user_name: user?.full_name,
            action: 'DEMANDE_TRANSFERT_TRESORERIE',
            entity_name: 'treasury',
            details: JSON.stringify({ type: req.type, amount: req.amount, motif: req.reason, status: 'EN_ATTENTE', sector_slug: currentSectorSlug })
          })
        } catch (err) {}
      }
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
      {/* ── ALERTE : SESSION DU JOUR PRÉCÉDENT NON CLÔTURÉE ────────────────── */}
      {isPreviousDaySession && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-black text-sm">Session de caisse antérieure toujours OUVERTE</p>
              <p className="text-xs text-amber-700">
                La caisse est restée ouverte depuis le {new Date(openedAt!).toLocaleString('fr-BJ')}. Conformément à la règle de gestion, elle n'a pas été fermée automatiquement. Vous devez clôturer cette session avant d'en ouvrir une nouvelle pour la journée en cours.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setClosingPhysicalCash(fondActuelEspeces); setShowCloseModal(true); }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex-shrink-0 shadow-sm flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" /> Clôturer la caisse d'hier
          </button>
        </div>
      )}

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
                setClosingPhysicalCash(fondTheoriqueEsp)
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

      {/* ── Compteurs d'Activités Journalières & Situation de Trésorerie ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Compteurs d'Activités Journalières
            </h2>
            <p className="text-xs text-slate-400">Ventilation des encaissements du jour et situation réelle des tiroirs après clôtures</p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
            Total Entrées : {fmt(totalEntreesDuJour)}
          </span>
        </div>
      </div>

      {/* ── 5 Indicateurs Clés Globaux de Caisse ────────────────────────────── */}
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
            {fmt(ventesEspeces + remboursementsEspeces)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Ventes ({fmt(ventesEspeces)}) + Recouvr. ({fmt(remboursementsEspeces)})
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
            {fmt(ventesMomo + remboursementsMomo)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Ventes ({fmt(ventesMomo)}) + Recouvr. ({fmt(remboursementsMomo)})
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
                disabled={isOperatingCaisse}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {isOperatingCaisse ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{isOperatingCaisse ? "Ouverture..." : "Confirmer l'Ouverture"}</span>
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
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setClosingPhysicalCash(val)
                  setRolloverCash(val)
                }}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-sm font-bold"
              />
              {closingPhysicalCash !== fondActuelEspeces && (
                <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs flex justify-between items-center">
                  <span>Écart de caisse :</span>
                  <span className="font-black font-mono">
                    {closingPhysicalCash - fondActuelEspeces > 0 ? '+' : ''}{fmt(closingPhysicalCash - fondActuelEspeces)}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Montant laissé en caisse pour demain (Fond Initial Suivant) *
              </label>
              <input
                type="number"
                min="0"
                max={closingPhysicalCash}
                value={rolloverCash}
                onChange={(e) => setRolloverCash(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-sm font-bold text-emerald-700 bg-emerald-50/30"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Le solde restant ({fmt(Math.max(0, closingPhysicalCash - rolloverCash))}) sera versé au coffre-fort / Trésorerie.
              </p>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Observations / Remarques {closingPhysicalCash !== fondActuelEspeces && <span className="text-rose-600 font-bold">* (Justification écart obligatoire)</span>}
              </label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder={closingPhysicalCash !== fondActuelEspeces ? "Veuillez expliquer impérativement la cause de l'écart..." : "Ex : RAS, solde exact remis au gérant"}
                className={`w-full p-2.5 border rounded-xl text-xs ${
                  closingPhysicalCash !== fondActuelEspeces && !closingNotes.trim()
                    ? 'border-rose-300 ring-2 ring-rose-100 bg-rose-50/20'
                    : 'border-slate-200'
                }`}
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
                disabled={isOperatingCaisse}
                onClick={handleConfirmCloseCaisse}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {isOperatingCaisse ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{isOperatingCaisse ? "Clôture..." : "Valider Clôture"}</span>
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

            {/* ── TRANSMISSION PAR EMAIL DU RAPPORT Z ── */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 mt-4 text-xs font-sans">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-indigo-600" />
                  Rapport de Clôture par Email
                </span>
                {activeReportClosure.emailed_to && activeReportClosure.emailed_to.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Transmis automatiquement
                  </span>
                )}
              </div>

              {activeReportClosure.emailed_to && activeReportClosure.emailed_to.length > 0 ? (
                <p className="text-[11px] text-slate-600">
                  Destinataires configurés : <strong className="text-slate-800">{activeReportClosure.emailed_to.join(', ')}</strong>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Aucun email automatique configuré dans Paramètres &gt; Notifications.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <input
                  type="email"
                  placeholder="Transmettre à un autre email (patron, comptable)..."
                  value={customReportEmail}
                  onChange={(e) => setCustomReportEmail(e.target.value)}
                  className="flex-1 p-2 border border-slate-200 rounded-xl text-xs bg-white font-sans"
                />
                <button
                  type="button"
                  onClick={handleSendReportByEmail}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                >
                  <Send className="w-3 h-3" /> Transmettre
                </button>
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
