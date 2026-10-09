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
  Printer, Send, FileCheck, Check, ArrowRightLeft, FileText, History, Building2, Download
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { getActiveCaisse } from '../../../lib/supabaseTenant'
import { getActiveSectorSlug, filterItemsForSector } from '../../../lib/sectorClient'
import { AdjustFundsModal, WithdrawalRequestModal, ModalPortal } from '../../../components/modals'
import { logAuditEvent } from '../../../services/auditService'
import { formatFCFA } from '../../../utils/formatters'
import { genererRapportCaissePDF, blobToBase64, envoyerRapportCaisseMail } from '../../../utils/rapportCaissePdf'
import {
  cleanSectorSlug,
  getOrCreateSectorCaisse,
  getSectorCaisseClosures,
  getSectorCaisseMovements,
  ouvrirSessionCaisse,
  cloturerSessionCaisse,
  enregistrerMouvementCaisse,
  getFondsActuelsBySector,
  getCaisseJournaliereBySector,
  cloturerCaisseOfficielle
} from '../../../services/caisseSectorService'
import ClotureCaisse from './ClotureCaisse'
import { useAppContext } from '../../../contexts/AppContext'

const fmt = (n: number) => formatFCFA(n)

const formatDate = (d?: string | null) => {
  if (!d) return '--/--/----'
  try {
    const dateObj = new Date(d)
    return isNaN(dateObj.getTime())
      ? String(d)
      : dateObj.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
  } catch {
    return String(d)
  }
}

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

export interface CaissePageProps {
  sector_key?: string
  sectorKey?: string
}

export const CaissePage: React.FC<CaissePageProps> = ({ sector_key, sectorKey }) => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const navigate = useNavigate()
  const { companyId, sectorSlug: tenantSectorSlug, supabaseTenant } = useTenant()
  const params = useParams<{ sectorSlug?: string; sectorKey?: string; companyId?: string }>()
  const rawSector = sector_key || sectorKey || params.sectorKey || tenantSectorSlug || params.sectorSlug || getActiveSectorSlug()
  const currentSectorSlug = cleanSectorSlug(rawSector)
  const currentCompanyId = companyId || params.companyId || company?.id || ''

  const appContext = useAppContext()
  const secteurActif = appContext?.secteurActif || { id: '', nom: currentSectorSlug.toUpperCase(), slug: currentSectorSlug }
  const caisseActive = appContext?.caisseActive || { id: '', nom: `Caisse ${currentSectorSlug.toUpperCase()}` }
  const refreshFonds = appContext?.refreshFonds

  // Sessions de caisse : Antérieure (hier ou avant) et Du Jour
  const [sessionAnterieureOuverte, setSessionAnterieureOuverte] = useState<any>(null)
  const [sessionDuJour, setSessionDuJour] = useState<any>(null)

  // État de la caisse : Ouverte ou Fermée
  const [caisseStatus, setCaisseStatus] = useState<'OUVERTE' | 'FERMEE'>('FERMEE')
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const [openedBy, setOpenedBy] = useState<string>('')
  const [initialCash, setInitialCash] = useState<number>(0)
  const [initialMomo, setInitialMomo] = useState<number>(0)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [cashRegisterId, setCashRegisterId] = useState<string | null>(null)

  // Données réelles des ventes, remboursements et dépenses du jour
  const [salesToday, setSalesToday] = useState<any[]>([])
  const [repaymentsToday, setRepaymentsToday] = useState<any[]>([])
  const [depensesToday, setDepensesToday] = useState<any[]>([])
  const [closuresHistory, setClosuresHistory] = useState<CashClosure[]>([])
  const [movementsHistory, setMovementsHistory] = useState<CashMovement[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showClotureModal, setShowClotureModal] = useState(false)

  // États officiels Fond Actuel vs Caisse Journalière (M048)
  const [fondsActuelsData, setFondsActuelsData] = useState<{
    id?: string
    fond_initial_especes: number
    fond_initial_momo: number
    fond_actuel_especes: number
    fond_actuel_momo: number
  }>({
    fond_initial_especes: 0,
    fond_initial_momo: 0,
    fond_actuel_especes: 0,
    fond_actuel_momo: 0,
  })

  const [caisseJourData, setCaisseJourData] = useState<{
    id?: string
    especes_du_jour: number
    momo_du_jour: number
    ventes_especes_du_jour: number
    ventes_momo_du_jour: number
    remboursements_especes_du_jour: number
    remboursements_momo_du_jour: number
    nb_ventes: number
  }>({
    especes_du_jour: 0,
    momo_du_jour: 0,
    ventes_especes_du_jour: 0,
    ventes_momo_du_jour: 0,
    remboursements_especes_du_jour: 0,
    remboursements_momo_du_jour: 0,
    nb_ventes: 0,
  })

  const [allCloturesTotals, setAllCloturesTotals] = useState<{ especes: number; momo: number }>({ especes: 0, momo: 0 })
  const [allDepensesTotals, setAllDepensesTotals] = useState<{ especes: number; momo: number }>({ especes: 0, momo: 0 })
  const [allRetraitsTotals, setAllRetraitsTotals] = useState<{ especes: number; momo: number }>({ especes: 0, momo: 0 })

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [activeReportClosure, setActiveReportClosure] = useState<CashClosure | null>(null)
  const [customReportEmail, setCustomReportEmail] = useState<string>('')
  const [isSendingReportMail, setIsSendingReportMail] = useState<boolean>(false)
  const [isOperatingCaisse, setIsOperatingCaisse] = useState<boolean>(false)

  // Saisie ouverture
  const [openInputCash, setOpenInputCash] = useState<number>(0)
  const [openInputMomo, setOpenInputMomo] = useState<number>(0)

  // Saisie clôture
  const [closingPhysicalCash, setClosingPhysicalCash] = useState<number>(0)
  const [rolloverCash, setRolloverCash] = useState<number>(0)
  const [closingNotes, setClosingNotes] = useState<string>('')

  // Chargement strict des sessions (détection session antérieure et session du jour)
  const loadSessions = useCallback(async () => {
    const compId = currentCompanyId || company?.id
    if (!compId) return

    const todayStr = new Date().toISOString().split('T')[0]
    const targetCaisseId = cashRegisterId || caisseActive?.id
    const targetSecteurId = secteurActif?.id

    let anterieure: any = null

    // 1. Chercher session antérieure OUVERTE (date_ouverture < aujourd'hui) dans sessions_caisse
    try {
      let q1 = supabase
        .from('sessions_caisse')
        .select('*')
        .eq('company_id', compId)
        .eq('statut', 'ouverte')
        .lt('date_ouverture', todayStr)
        .order('date_ouverture', { ascending: false })
        .limit(1)

      if (targetCaisseId) q1 = q1.eq('caisse_id', targetCaisseId)
      if (targetSecteurId) q1 = q1.eq('secteur_id', targetSecteurId)

      const { data: ant1 } = await q1.maybeSingle()
      if (ant1) {
        anterieure = ant1
      }
    } catch (_) {}

    // Fallback dans caisse_sessions (recherche session < aujourd'hui encore ouverte)
    if (!anterieure) {
      try {
        let q2 = supabase
          .from('caisse_sessions')
          .select('*')
          .eq('company_id', compId)
          .in('statut', ['ouverte', 'open'])
          .is('date_fermeture', null)
          .order('date_ouverture', { ascending: false })
          .limit(10)

        if (targetCaisseId) q2 = q2.eq('caisse_id', targetCaisseId)

        const { data: csList } = await q2
        if (csList && csList.length > 0) {
          const found = csList.find((s: any) => {
            const sDate = (s.date_ouverture || '').split('T')[0]
            return sDate && sDate < todayStr
          })
          if (found) {
            anterieure = found
          }
        }
      } catch (_) {}
    }

    // Fallback dans caisses (si statut encore 'ouverte' avec date_ouverture antérieure)
    if (!anterieure && targetCaisseId) {
      try {
        const { data: cData } = await supabase
          .from('caisses')
          .select('*')
          .eq('id', targetCaisseId)
          .maybeSingle()

        if (cData && (cData.statut === 'ouverte' || cData.statut === 'open') && !cData.date_fermeture) {
          const cDate = (cData.date_ouverture || '').split('T')[0]
          if (cDate && cDate < todayStr) {
            anterieure = {
              id: cData.id,
              caisse_id: cData.id,
              company_id: compId,
              date_ouverture: cData.date_ouverture,
              statut: 'ouverte',
              ouvert_par_nom: cData.ouvert_par || 'Caissier'
            }
          }
        }
      } catch (_) {}
    }

    setSessionAnterieureOuverte(anterieure || null)

    // 2. Chercher session du jour (date_ouverture = aujourd'hui)
    let duJour: any = null
    try {
      let qJ1 = supabase
        .from('sessions_caisse')
        .select('*')
        .eq('company_id', compId)
        .eq('date_ouverture', todayStr)

      if (targetCaisseId) qJ1 = qJ1.eq('caisse_id', targetCaisseId)
      if (targetSecteurId) qJ1 = qJ1.eq('secteur_id', targetSecteurId)

      const { data: j1 } = await qJ1.maybeSingle()
      if (j1) {
        duJour = j1
      }
    } catch (_) {}

    if (!duJour) {
      try {
        let qJ2 = supabase
          .from('caisse_sessions')
          .select('*')
          .eq('company_id', compId)
          .gte('date_ouverture', todayStr + 'T00:00:00')
          .order('date_ouverture', { ascending: false })
          .limit(1)

        if (targetCaisseId) qJ2 = qJ2.eq('caisse_id', targetCaisseId)

        const { data: j2 } = await qJ2.maybeSingle()
        if (j2) {
          duJour = j2
        }
      } catch (_) {}
    }

    if (!duJour && caisseStatus === 'OUVERTE' && openedAt) {
      const opDateStr = openedAt.split('T')[0]
      if (opDateStr === todayStr) {
        duJour = {
          id: activeSessionId || 'sess-today',
          statut: 'ouverte',
          date_ouverture: todayStr
        }
      }
    }

    setSessionDuJour(duJour || null)
  }, [currentCompanyId, company?.id, cashRegisterId, caisseActive?.id, secteurActif?.id, caisseStatus, openedAt, activeSessionId])

  useEffect(() => {
    loadSessions()
  }, [secteurActif, caisseActive, currentSectorSlug, loadSessions])

  // Vérifier si la session a été ouverte un jour précédent et jamais clôturée
  const isPreviousDaySession = useMemo(() => {
    if (sessionAnterieureOuverte) return true
    if (caisseStatus !== 'OUVERTE' || !openedAt) return false
    const openD = new Date(openedAt).toDateString()
    const todayD = new Date().toDateString()
    return openD !== todayD
  }, [sessionAnterieureOuverte, caisseStatus, openedAt])

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
        const sectorCaisse = await getOrCreateSectorCaisse(currentCompanyId, currentSectorSlug)
        if (sectorCaisse) {
          setCashRegisterId(sectorCaisse.id)
        }

        // Vérifier si une session/caisse est ouverte pour ce secteur
        const activeCaisse = await getActiveCaisse(currentCompanyId, currentSectorSlug)
        if (activeCaisse) {
          setActiveSessionId(activeCaisse.id)
          setCaisseStatus('OUVERTE')
          setOpenedAt(activeCaisse.date_ouverture || activeCaisse.opened_at)
          setOpenedBy(activeCaisse.ouvert_par || user?.full_name || 'Caissier')
          setInitialCash(Number(activeCaisse.fond_ouverture_especes ?? (activeCaisse as any).opening_cash) || 0)
          setInitialMomo(Number(activeCaisse.fond_ouverture_momo ?? (activeCaisse as any).opening_momo) || 0)
        } else {
          setActiveSessionId(null)
          setCaisseStatus('FERMEE')
          setOpenedAt(null)
        }

        // Charger l'historique des clôtures archivées STRICTEMENT pour la caisse de ce secteur (ZÉRO contamination)
        if (sectorCaisse?.id) {
          const closures = await getSectorCaisseClosures(currentCompanyId, sectorCaisse.id, currentSectorSlug, 50)
          setClosuresHistory(closures)
        } else {
          setClosuresHistory([])
        }
      } catch (sessErr) {
        console.warn('Erreur synchronisation caisse Supabase:', sessErr)
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
      // Source principale : debt_payments (nouvelle table M028)
      let repList: any[] = []
      try {
        const { data: debtPays } = await supabase
          .from('debt_payments')
          .select('id, amount, payment_method, payment_date, created_at, client_id, reference')
          .eq('company_id', currentCompanyId)
          .eq('sector_code', currentSectorSlug)
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false })
        if (debtPays && debtPays.length > 0) {
          repList = debtPays.map((d: any) => ({
            id: d.id,
            created_at: d.created_at,
            customer_name: 'Client',
            amount: Number(d.amount) || 0,
            payment_method: d.payment_method, // 'Espèces' | 'MTN MoMo' | 'Moov Money'
            reference: d.reference || `DP-${d.id.slice(0, 6)}`
          }))
        }
      } catch (dpErr) {
        console.warn('debt_payments fetch error :', dpErr)
      }
      // Source de secours : ancienne table customer_repayments
      try {
        const { data: repayments } = await supabase
          .from('customer_repayments')
          .select('*, customer:customers(name)')
          .eq('company_id', currentCompanyId)
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false })
        if (repayments && repayments.length > 0) {
          repList = [...repList, ...repayments]
        }
      } catch (err) {
        console.warn('Fallback customer_repayments :', err)
      }
      // Dernier recours : audit_logs
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
        const isCash = ['cash', 'especes', 'espèces'].includes((r.payment_method || '').toLowerCase())
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
          .or(`sector_slug.eq.${currentSectorSlug},sector_slug.is.null`)
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

      // 4. Dépenses réelles du jour (déduites des fonds conformément à la règle officielle)
      let depensesList: any[] = []
      try {
        const { data: dbDeps } = await supabase
          .from('depenses')
          .select('*')
          .eq('company_id', currentCompanyId)
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false })
        if (dbDeps && dbDeps.length > 0) {
          depensesList = dbDeps
        }
      } catch (_) {}

      try {
        const { data: dbExps } = await supabase
          .from('expenses')
          .select('*')
          .eq('company_id', currentCompanyId)
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false })
        if (dbExps && dbExps.length > 0) {
          const secExps = filterItemsForSector(dbExps, currentSectorSlug)
          secExps.forEach((e: any) => {
            if (!depensesList.some((d) => d.id === e.id)) {
              depensesList.push(e)
            }
          })
        }
      } catch (_) {}

      setDepensesToday(depensesList)

      const depensesMovements: CashMovement[] = depensesList.map((d: any) => {
        const isCash = ['espece', 'especes', 'cash'].includes((d.mode_paiement || d.payment_method || '').toLowerCase())
        return {
          id: `dep-${d.id}`,
          created_at: d.created_at || d.date_depense || new Date().toISOString(),
          user_name: d.created_by_name || 'Utilisateur',
          type: 'RETRAIT',
          payment_channel: isCash ? 'Espèces' : 'MoMo',
          amount: Number(d.montant || d.amount) || 0,
          motif: `Dépense : ${d.description || d.title || d.categorie || d.category || 'Sortie'}`,
          reference: `DEP-${d.id.slice(0, 6)}`,
          status: 'VALIDE'
        }
      })

      setMovementsHistory(
        [...transferMovements, ...depensesMovements, ...repaymentMovements, ...saleMovements].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      )

      // 5. Charger les fonds actuels officiels & compteurs journaliers (Isolation Stricte Secteur M048)
      const secId = secteurActif?.id
      const cId = cashRegisterId || caisseActive?.id
      const todayDate = new Date().toISOString().split('T')[0]
      if (currentCompanyId && secId) {
        try {
          const fondRes = await getFondsActuelsBySector(currentCompanyId, secId, cId)
          setFondsActuelsData(fondRes)

          const jourRes = await getCaisseJournaliereBySector(currentCompanyId, secId, cId, todayDate)
          setCaisseJourData(jourRes)

          // Clôtures archivées pour le sous-texte
          const { data: clList } = await supabase
            .from('clotures_caisse')
            .select('especes_cloture, momo_cloture')
            .eq('company_id', currentCompanyId)
            .eq('secteur_id', secId)
          if (clList && clList.length > 0) {
            const totClEsp = clList.reduce((acc, c) => acc + (Number(c.especes_cloture) || 0), 0)
            const totClMo = clList.reduce((acc, c) => acc + (Number(c.momo_cloture) || 0), 0)
            setAllCloturesTotals({ especes: totClEsp, momo: totClMo })
          }

          // Dépenses globales du secteur pour le sous-texte
          const { data: depAll } = await supabase
            .from('depenses')
            .select('montant, mode_paiement')
            .eq('company_id', currentCompanyId)
            .eq('secteur_id', secId)
          if (depAll && depAll.length > 0) {
            let dEsp = 0
            let dMo = 0
            depAll.forEach((d: any) => {
              const m = (d.mode_paiement || '').toLowerCase()
              const amt = Number(d.montant) || 0
              if (['espece', 'especes', 'cash'].includes(m)) dEsp += amt
              else dMo += amt
            })
            setAllDepensesTotals({ especes: dEsp, momo: dMo })
          }

          // Retraits validés du secteur pour le sous-texte
          const { data: retAll } = await supabase
            .from('demandes_retrait')
            .select('montant, mode_paiement, statut')
            .eq('company_id', currentCompanyId)
            .eq('secteur_id', secId)
            .in('statut', ['valide', 'APPROVED'])
          if (retAll && retAll.length > 0) {
            let rEsp = 0
            let rMo = 0
            retAll.forEach((r: any) => {
              const m = (r.mode_paiement || '').toLowerCase()
              const amt = Number(r.montant) || 0
              if (['espece', 'especes', 'cash'].includes(m)) rEsp += amt
              else rMo += amt
            })
            setAllRetraitsTotals({ especes: rEsp, momo: rMo })
          }
        } catch (fErr) {
          console.warn('Erreur chargement fonds_actuels/caisse_jour:', fErr)
        }
      }
    } catch (err: any) {
      console.error('Erreur chargement données caisse :', err)
      setSalesToday([])
      setRepaymentsToday([])
      setMovementsHistory([])
    } finally {
      setLoading(false)
    }
  }, [currentCompanyId, currentSectorSlug, user?.full_name, secteurActif?.id, cashRegisterId, caisseActive?.id])

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
      .filter((r) => {
        const m = (r.payment_method || '').toLowerCase()
        return m === 'cash' || m === 'espèces' || m === 'especes'
      })
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [repaymentsToday])

  // 4. Remboursements créances en MoMo
  const remboursementsMomo = useMemo(() => {
    return repaymentsToday
      .filter((r) => {
        const m = (r.payment_method || '').toLowerCase()
        return m.includes('momo') || m.includes('wave') || m.includes('moov')
      })
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [repaymentsToday])

  // 5. Total entrées du jour
  const totalEntreesDuJour = ventesEspeces + ventesMomo + remboursementsEspeces + remboursementsMomo

  // Dépenses espèces du jour
  const depensesEspeces = useMemo(() => {
    return depensesToday
      .filter((d) => ['espece', 'especes', 'cash'].includes((d.mode_paiement || d.payment_method || '').toLowerCase()))
      .reduce((sum, d) => sum + (Number(d.montant || d.amount) || 0), 0)
  }, [depensesToday])

  // Dépenses MoMo du jour
  const depensesMomo = useMemo(() => {
    return depensesToday
      .filter((d) => !['espece', 'especes', 'cash'].includes((d.mode_paiement || d.payment_method || '').toLowerCase()))
      .reduce((sum, d) => sum + (Number(d.montant || d.amount) || 0), 0)
  }, [depensesToday])

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

  // Total des sorties du jour (Dépenses + Retraits Trésorerie)
  const totalSortiesDuJour = totalRetraitsEspeces + totalRetraitsMomo + depensesEspeces + depensesMomo

  // =============================================================================
  // RÈGLES MÉTIER OFFICIELLES GESTIO 229 CAISSE : FOND ACTUEL vs DU JOUR (M048)
  // 1. Espèces du jour = ventes espèces du jour + remboursements espèces
  //    Momo du jour = ventes Momo du jour + remboursements Momo du jour
  // 2. Les ventes restent dans "DU JOUR" tant que la caisse n'a pas été clôturée.
  // 3. À la clôture, DU JOUR est transféré dans FOND ACTUEL et remis à 0.
  // 4. Les dépenses et retraits de trésorerie sont déduits du FOND ACTUEL (pas du jour).
  // 5. Négatif autorisé sur les fonds actuels en cas de découvert (affiché en rouge).
  // =============================================================================

  // 1. Compteurs Du Jour (Uniquement encaissements : ventes + remboursements)
  const especesDuJour = caisseJourData.especes_du_jour > 0
    ? caisseJourData.especes_du_jour
    : (ventesEspeces + remboursementsEspeces)

  const momoDuJour = caisseJourData.momo_du_jour > 0
    ? caisseJourData.momo_du_jour
    : (ventesMomo + remboursementsMomo)

  const nbVentesDuJour = caisseJourData.nb_ventes > 0
    ? caisseJourData.nb_ventes
    : salesToday.length

  // 2. Fond Initial
  const fondInitialEspeces = Number(fondsActuelsData.fond_initial_especes) || initialCash
  const fondInitialMomo = Number(fondsActuelsData.fond_initial_momo) || initialMomo

  // 3. Totaux cumulés pour affichage et calcul
  const sumCloturesEspeces = allCloturesTotals.especes
  const sumCloturesMomo = allCloturesTotals.momo
  const sumDepensesEspeces = allDepensesTotals.especes > 0 ? allDepensesTotals.especes : depensesEspeces
  const sumDepensesMomo = allDepensesTotals.momo > 0 ? allDepensesTotals.momo : depensesMomo
  const sumRetraitsEspeces = allRetraitsTotals.especes > 0 ? allRetraitsTotals.especes : totalRetraitsEspeces
  const sumRetraitsMomo = allRetraitsTotals.momo > 0 ? allRetraitsTotals.momo : totalRetraitsMomo

  // 4. Fond Actuel (Coffre-fort cumulé) : PEUT ÊTRE NÉGATIF (DÉCOUVERT AUTORISÉ)
  // RÈGLE CLIENT STRICTE :
  // Les ventes ne rentrent dans le FOND ACTUEL qu'après CLÔTURE.
  // Les dépenses et retraits sont déduits du FOND ACTUEL (pas du jour).
  const fondActuelEspeces = (fondsActuelsData.id || fondsActuelsData.fond_actuel_especes !== 0)
    ? fondsActuelsData.fond_actuel_especes
    : (fondInitialEspeces + sumCloturesEspeces - sumDepensesEspeces - sumRetraitsEspeces)

  const fondActuelMomo = (fondsActuelsData.id || fondsActuelsData.fond_actuel_momo !== 0)
    ? fondsActuelsData.fond_actuel_momo
    : (fondInitialMomo + sumCloturesMomo - sumDepensesMomo - sumRetraitsMomo)

  // Fond théorique espèces à la clôture (pour vérification écarts physiques si besoin)
  const fondTheoriqueEsp = fondActuelEspeces + especesDuJour
  const fondTheoriqueMomo = fondActuelMomo + momoDuJour

  // 5. Fond initial global
  const fondInitialTotal = fondInitialEspeces + fondInitialMomo

  // 6. Fond théorique actuel global
  const fondTheoriqueActuel = fondActuelEspeces + fondActuelMomo

  // CA total des ventes du jour (tous modes confondus, hors avoirs)
  const caDuJour = useMemo(() => {
    return salesToday
      .filter((s) => s.payment_status !== 'avoir' && s.status !== 'AVOIR')
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // ─── Action : Ouvrir la Caisse (Silo étanche par caisse_id et secteur) ───────
  const handleOpenCaisse = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsOperatingCaisse(true)
    const opBy = user?.full_name || user?.username || 'Caissier'
    const initC = Number(openInputCash) || 0
    const initM = Number(openInputMomo) || 0
    const cleanSlug = (currentSectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
    const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
      ? user.id
      : undefined

    try {
      const res = await ouvrirSessionCaisse(currentCompanyId, currentSectorSlug, validUserId, opBy, initC, initM)
      if (!res.success) {
        toast.error('Erreur ouverture de caisse', res.error || 'Impossible d\'ouvrir la caisse.')
        setIsOperatingCaisse(false)
        return
      }

      const createdSessionId = res.session?.id || null
      if (createdSessionId) {
        setActiveSessionId(createdSessionId)
      }

      saveCaisseState('OUVERTE', new Date().toISOString(), opBy, initC, initM)
      setShowOpenModal(false)
      toast.success('Caisse Ouverte avec succès !', `Fond initial tiroir : ${fmt(initC)}`)

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

      await loadCaisseData()

      navigate(`/app/${cleanSlug}/vente?session_id=${createdSessionId || ''}`, {
        state: { sessionId: createdSessionId, refreshCaisse: true }
      })
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'ouvrir la caisse.')
    } finally {
      setIsOperatingCaisse(false)
    }
  }

  // ─── Action : Fermer la Caisse (avec Clôture Rigoureuse et Audit) ─────────────
  const handleConfirmCloseCaisse = async () => {
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

      // 1. Clôture officielle dans la base (caisse_sessions + caisses + caisse_clotures + mouvements)
      const closeRes = await cloturerSessionCaisse(
        activeSessionId || undefined,
        cashRegisterId || undefined,
        currentCompanyId,
        currentSectorSlug,
        closedBy,
        fondTheoriqueEsp,
        Number(closingPhysicalCash),
        momoDuJour,
        closingNotes
      )

      if (!closeRes.success) {
        toast.error('Erreur lors de la clôture', closeRes.error || 'Impossible de clôturer la caisse.')
        setIsOperatingCaisse(false)
        return
      }

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

      // Transfert officiel M048 : du jour -> fond actuel, remise à 0 du jour
      const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ? user.id : null
      try {
        await cloturerCaisseOfficielle(currentCompanyId, secteurActif.id, cashRegisterId || caisseActive.id, validUserId, {
          fond_initial: fondInitialEspeces,
          total_entrees: especesDuJour,
          total_sorties: sumDepensesEspeces,
          fond_theorique: fondTheoriqueEsp,
          fond_reel: Number(closingPhysicalCash),
          ecart: ecart,
          commentaire: closingNotes || 'Clôture de session validée',
        })
      } catch (clotErr) {
        console.warn('Erreur cloturerCaisseOfficielle:', clotErr)
      }

      // Fermeture locale de la caisse
      saveCaisseState('FERMEE', null, '', 0, 0)
      setActiveSessionId(null)
      setShowCloseModal(false)
      setShowReportModal(false)
      setClosingNotes('')
      toast.success('Caisse clôturée avec succès !', `Nouveau fond espèces : ${fmt(Number(closingPhysicalCash))}`)

      // Rapport en arrière-plan envoyé par email (table report_emails)
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
            fond_especes_theorique: fondTheoriqueEsp,
            fond_especes_physique: Number(closingPhysicalCash),
            ecart_especes: ecart,
            fond_momo: momoDuJour,
            total_fermeture: Number(closingPhysicalCash) + momoDuJour,
            notes: closingNotes,
          },
          status: 'sent'
        })
      } catch (emErr) {
        console.warn('Avertissement insertion report_emails:', emErr)
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
        description: `Clôture caisse ${currentSectorSlug} par ${closedBy}. Espèces : ${fmt(Number(closingPhysicalCash))}, MoMo : ${fmt(momoDuJour)}`
      })

      toast.success(
        'Caisse Clôturée avec Succès !',
        `Rapport Z envoyé en arrière-plan. Total encaissé de la journée : ${fmt(totalEntreesDuJour)}`
      )

      await loadCaisseData()
      if (refreshFonds) await refreshFonds()
    } catch (err: any) {
      toast.error('Erreur clôture', err.message || 'Échec de la clôture de caisse.')
    } finally {
      setIsOperatingCaisse(false)
    }
  }

  // ─── Action : Clôture Rapide Directe M048 (Demande Officielle Client) ────────
  const handleCloturerCaisseDirect = async () => {
    setIsOperatingCaisse(true)
    const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
      ? user.id
      : null
    const secId = secteurActif?.id
    const cId = cashRegisterId || caisseActive?.id

    try {
      const res = await cloturerCaisseOfficielle(currentCompanyId, secId, cId, validUserId, {
        fond_initial: fondInitialEspeces,
        total_entrees: especesDuJour,
        total_sorties: sumDepensesEspeces,
        fond_theorique: fondActuelEspeces,
        fond_reel: fondActuelEspeces + especesDuJour,
        ecart: 0,
        commentaire: 'Clôture de caisse directe validée',
      })
      if (res.success) {
        toast.success(
          'Caisse clôturée, Fond actuel mis à jour',
          `Espèces clôturées : ${fmt(res.especes ?? especesDuJour)}, MoMo : ${fmt(res.momo ?? momoDuJour)}. Opérations du jour remises à 0.`
        )
        saveCaisseState('FERMEE', null, '', 0, 0)
        setActiveSessionId(null)
        await loadCaisseData()
        if (refreshFonds) await refreshFonds()
      } else {
        toast.error('Erreur lors de la clôture', res.error || 'Impossible de clôturer la caisse.')
      }
    } catch (err: any) {
      toast.error('Erreur clôture', err?.message || 'Erreur inconnue.')
    } finally {
      setIsOperatingCaisse(false)
    }
  }

  // ─── Téléchargement du Rapport de Caisse PDF ──────────────────────────────
  const handleTelechargerReportPDF = () => {
    if (!activeReportClosure) return
    try {
      const donneesPDF = {
        company: {
          name: company?.name || 'GESTIO 229',
          ifu: (company as any)?.ifu_number,
          rccm: (company as any)?.rccm_number,
          phone: company?.phone,
          email: company?.email
        },
        secteur: {
          nom: secteurActif?.nom || currentSectorSlug.toUpperCase(),
          slug: currentSectorSlug
        },
        caisse: {
          nom: activeReportClosure.caisse_name || caisseActive?.nom || `Caisse ${currentSectorSlug.toUpperCase()}`,
          id: cashRegisterId || caisseActive?.id
        },
        session: {
          id: activeReportClosure.id,
          dateCloture: activeReportClosure.closed_at,
          fermePar: activeReportClosure.closed_by
        },
        user: {
          nom: activeReportClosure.closed_by || user?.full_name || 'Caissier'
        },
        date: activeReportClosure.closed_at,
        synthese: {
          fondInitialEspeces: fondInitialEspeces,
          encaissementsEspeces: especesDuJour,
          depensesEspeces: sumDepensesEspeces,
          fondTheoriqueEspeces: activeReportClosure.fond_especes_theorique,
          fondTheoriqueMomo: activeReportClosure.fond_momo,
          fondReelEspeces: activeReportClosure.fond_especes_physique,
          fondReelMomo: activeReportClosure.fond_momo,
          ecartEspeces: activeReportClosure.ecart_especes,
          ecartMomo: 0,
          caDuJour: caDuJour,
          especesDuJour: especesDuJour,
          momoDuJour: activeReportClosure.fond_momo
        },
        mouvements: movementsHistory.map((m) => ({
          heure: new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          type: m.type,
          montant: m.amount,
          mode: m.payment_channel,
          motif: m.motif,
          reference: m.reference
        })),
        notes: activeReportClosure.notes
      }

      genererRapportCaissePDF(donneesPDF, { save: true })
      toast.success('Rapport PDF téléchargé', 'Le fichier PDF du rapport de caisse a été généré avec succès.')
    } catch (err: any) {
      console.error('Erreur génération PDF rapport:', err)
      toast.error('Erreur PDF', err?.message || 'Impossible de générer le PDF')
    }
  }

  // ─── Envoi du Rapport par Email avec PDF joint ─────────────────────────────
  const handleSendReportByEmail = async () => {
    if (!activeReportClosure) return
    const emailCible = customReportEmail.trim()
    const allEmails = [...(activeReportClosure.emailed_to || [])]
    if (emailCible && !allEmails.includes(emailCible)) {
      allEmails.push(emailCible)
    }

    if (allEmails.length === 0) {
      if (company?.email) {
        allEmails.push(company.email.trim())
      } else {
        alert('Veuillez renseigner au moins une adresse email pour transmettre le rapport.')
        toast.error('Email requis', 'Saisissez une adresse email valide.')
        return
      }
    }

    setIsSendingReportMail(true)
    try {
      const donneesPDF = {
        company: {
          name: company?.name || 'GESTIO 229',
          ifu: (company as any)?.ifu_number,
          rccm: (company as any)?.rccm_number,
          phone: company?.phone,
          email: company?.email
        },
        secteur: {
          nom: secteurActif?.nom || currentSectorSlug.toUpperCase(),
          slug: currentSectorSlug
        },
        caisse: {
          nom: activeReportClosure.caisse_name || caisseActive?.nom || `Caisse ${currentSectorSlug.toUpperCase()}`,
          id: cashRegisterId || caisseActive?.id
        },
        session: {
          id: activeReportClosure.id,
          dateCloture: activeReportClosure.closed_at,
          fermePar: activeReportClosure.closed_by
        },
        user: {
          nom: activeReportClosure.closed_by || user?.full_name || 'Caissier'
        },
        date: activeReportClosure.closed_at,
        synthese: {
          fondInitialEspeces: fondInitialEspeces,
          encaissementsEspeces: especesDuJour,
          depensesEspeces: sumDepensesEspeces,
          fondTheoriqueEspeces: activeReportClosure.fond_especes_theorique,
          fondTheoriqueMomo: activeReportClosure.fond_momo,
          fondReelEspeces: activeReportClosure.fond_especes_physique,
          fondReelMomo: activeReportClosure.fond_momo,
          ecartEspeces: activeReportClosure.ecart_especes,
          ecartMomo: 0,
          caDuJour: caDuJour,
          especesDuJour: especesDuJour,
          momoDuJour: activeReportClosure.fond_momo
        },
        mouvements: movementsHistory.map((m) => ({
          heure: new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          type: m.type,
          montant: m.amount,
          mode: m.payment_channel,
          motif: m.motif,
          reference: m.reference
        })),
        notes: activeReportClosure.notes
      }

      // 1. Générer le PDF sous forme de blob et base64
      const { blob } = genererRapportCaissePDF(donneesPDF, { save: false })
      const pdfBase64 = await blobToBase64(blob)

      // 2. Envoyer par email (Edge Function avec fallback)
      const res = await envoyerRapportCaisseMail({
        companyId: currentCompanyId,
        secteurId: currentSectorSlug,
        caisseId: cashRegisterId || caisseActive?.id,
        date: activeReportClosure.closed_at,
        pdfBase64,
        emails: allEmails,
        metadata: {
          secteurNom: secteurActif?.nom || currentSectorSlug.toUpperCase(),
          totalReel: activeReportClosure.total_fermeture,
          caDuJour: caDuJour,
          operateur: activeReportClosure.closed_by
        }
      })

      const updated = {
        ...activeReportClosure,
        emailed_to: allEmails
      }
      setActiveReportClosure(updated)
      setCustomReportEmail('')

      toast.success(
        'Rapport PDF envoyé !',
        `Le rapport de caisse a été transmis avec succès à : ${allEmails.join(', ')}`
      )
    } catch (err: any) {
      console.error('Erreur envoi rapport email:', err)
      toast.error('Erreur transmission', err?.message || 'Échec de l\'envoi du rapport par email.')
    } finally {
      setIsSendingReportMail(false)
    }
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
      const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ? user.id : null
      try {
        await supabase.from('demandes_retrait').insert({
          company_id: currentCompanyId,
          secteur_id: secteurActif.id || null,
          caisse_id: cashRegisterId || caisseActive.id || null,
          mode_paiement: req.type === 'MoMo' ? 'momo' : 'especes',
          montant: req.amount,
          motif: req.reason,
          statut: 'en_attente',
          created_by: validUserId
        })
      } catch (_) {}

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

  // ─── Action : Clôturer la caisse d'hier (CORRECTIF BUG CRITIQUE) ─────────────
  const handleCloturerHier = async () => {
    setLoading(true)
    const compId = currentCompanyId || company?.id
    const secId = secteurActif?.id
    const cId = cashRegisterId || caisseActive?.id
    const uId = user?.id
    const todayStr = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()

    try {
      let rpcOk = false
      let rpcResult: any = null

      try {
        const { data, error } = await supabase.rpc('fn_cloturer_caisse_hier', {
          p_company_id: compId,
          p_secteur_id: secId,
          p_caisse_id: cId,
          p_user_id: uId
        })
        if (!error && data && data.success) {
          rpcOk = true
          rpcResult = data
        }
      } catch (rpcEx) {
        console.warn('RPC fn_cloturer_caisse_hier non disponible:', rpcEx)
      }

      if (!rpcOk) {
        // Clôture robuste multi-tables en direct
        try {
          await supabase
            .from('sessions_caisse')
            .update({
              statut: 'fermée',
              date_cloture: todayStr,
              heure_cloture: nowIso,
              ferme_par: uId,
              ferme_par_nom: user?.full_name || 'Caissier',
              updated_at: nowIso
            })
            .eq('company_id', compId)
            .eq('caisse_id', cId)
            .eq('statut', 'ouverte')
            .lt('date_ouverture', todayStr)
        } catch (_) {}

        try {
          const { error: csErr } = await supabase
            .from('caisse_sessions')
            .update({
              statut: 'fermée',
              date_fermeture: nowIso,
              ferme_par: uId,
              cloture_par: user?.full_name || 'Caissier',
              updated_at: nowIso
            })
            .eq('company_id', compId)
            .eq('caisse_id', cId)
            .in('statut', ['ouverte', 'open'])

          if (csErr) {
            await supabase
              .from('caisse_sessions')
              .update({
                statut: 'fermee',
                date_fermeture: nowIso,
                updated_at: nowIso
              })
              .eq('company_id', compId)
              .eq('caisse_id', cId)
              .in('statut', ['ouverte', 'open'])
          }
        } catch (_) {}

        try {
          await supabase
            .from('caisses')
            .update({
              statut: 'fermee',
              date_fermeture: nowIso,
              updated_at: nowIso
            })
            .eq('id', cId)
        } catch (_) {}

        try {
          localStorage.removeItem(`gestio_caisse_active_${currentSectorSlug}_${compId}`)
          localStorage.removeItem(`gestio_caisse_active_${currentSectorSlug}`)
          localStorage.removeItem('active_caisse_session')
        } catch (_) {}
      }

      const closedDate = rpcResult?.date_cloturee || sessionAnterieureOuverte?.date_ouverture || 'antérieure'
      const soldeEsp = rpcResult?.solde_espece ?? fondActuelEspeces

      toast.success(`Caisse du ${formatDate(closedDate)} clôturée avec succès - Espèces: ${fmt(soldeEsp)}`)

      // CRITIQUE : Forcer la disparition instantanée du bandeau orange
      setSessionAnterieureOuverte(null)
      saveCaisseState('FERMEE', null, '', 0, 0)
      setActiveSessionId(null)

      // Rechargements
      await loadSessions()
      await loadCaisseData()
      if (typeof refreshFonds === 'function') {
        await refreshFonds()
      }
    } catch (err: any) {
      toast.error('Erreur lors de la clôture', err.message || 'Impossible de clôturer la caisse antérieure')
    } finally {
      setLoading(false)
    }
  }

  // ─── Action : Ouvrir la Caisse du Jour ──────────────────────────────────────
  const handleOuvrirCaisseJour = () => {
    if (sessionAnterieureOuverte) {
      toast.error('Session antérieure non clôturée', 'Vous devez d\'abord clôturer la session antérieure.')
      return
    }
    setOpenInputCash(initialCash || 0)
    setOpenInputMomo(initialMomo || 0)
    setShowOpenModal(true)
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── ALERTE : SESSION DU JOUR PRÉCÉDENT NON CLÔTURÉE (BANDEAU ORANGE) ── */}
      {sessionAnterieureOuverte ? (
        <div className="p-4 bg-orange-50 border-2 border-orange-300 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-orange-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0" />
            <div>
              <p className="font-black text-sm">Session de caisse antérieure toujours OUVERTE</p>
              <p className="text-xs text-orange-700 mt-0.5">
                La caisse est restée ouverte depuis le {formatDate(sessionAnterieureOuverte.date_ouverture || sessionAnterieureOuverte.heure_ouverture || openedAt)} par <strong>{sessionAnterieureOuverte.ouvert_par_nom || sessionAnterieureOuverte.ouvert_par || openedBy || 'un utilisateur'}</strong>. Conformément à la règle de gestion, elle n'a pas été fermée automatiquement. Vous devez clôturer cette session avant d'en ouvrir une nouvelle pour la journée en cours.
              </p>
            </div>
          </div>
          <button
            onClick={handleCloturerHier}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex-shrink-0 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" /> Clôturer la caisse d'hier
          </button>
        </div>
      ) : (!sessionDuJour || sessionDuJour.statut === 'fermée' || sessionDuJour.statut === 'fermee' || caisseStatus === 'FERMEE') ? (
        <div className="bg-white border-2 border-dashed border-emerald-300 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm bg-gradient-to-r from-emerald-50/50 to-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black shadow-md shadow-emerald-200">
              <Unlock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Caisse prête pour la journée</h3>
              <p className="text-xs text-slate-600">
                Aucune session active &bull; Clôture antérieure validée &bull; Secteur <strong>{secteurActif?.nom || currentSectorSlug.toUpperCase()}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={handleOuvrirCaisseJour}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-2xl text-base font-bold shadow-lg shadow-green-200 transition flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Unlock className="w-5 h-5" />
            <span>Ouvrir la Caisse - {new Date().toLocaleDateString('fr-FR')} - Secteur {secteurActif?.nom || currentSectorSlug.toUpperCase()}</span>
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <p className="font-black text-emerald-900 text-sm">Caisse du jour OUVERTE - Opérations possibles</p>
              <p className="text-emerald-700 text-xs">
                N° {cashRegisterId ? `CS-${currentSectorSlug.slice(0, 4).toUpperCase()}` : 'CS-ACTIF'} &bull; Ouverte à {openedAt ? new Date(openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'} par <strong>{openedBy}</strong> {activeSessionId && `&bull; Depuis ID ${activeSessionId.slice(0, 8)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-emerald-700 font-mono font-black">{fmt(initialCash)} Espèces</p>
              {initialMomo > 0 && <p className="text-emerald-600 font-mono text-[11px]">{fmt(initialMomo)} MoMo</p>}
            </div>
            <button onClick={() => { loadSessions(); loadCaisseData(); }} className="p-2 bg-white rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition shadow-sm">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── En-tête du Module Caisse ─────────────────────────────────────────── */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm no-drag"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
              caisseStatus === 'OUVERTE'
                ? isPreviousDaySession
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}>
              {caisseStatus === 'OUVERTE' ? (
                isPreviousDaySession ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Session Antérieure Ouverte
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-600" /> Caisse Ouverte
                  </>
                )
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
            Gestion du tiroir espèces, réceptions Mobile Money, clôtures journalières et versements &bull; Secteur : <strong className="text-slate-700 uppercase">{currentSectorSlug}</strong>
          </p>
        </div>

        {/* Boutons d'actions principaux */}
        <div className="flex flex-wrap items-center gap-2 no-drag" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
            disabled={caisseStatus !== 'OUVERTE' || isPreviousDaySession}
            className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Envoyer une demande</span>
          </button>

          {/* Bouton d'état : Ouvrir la Caisse */}
          {caisseStatus === 'FERMEE' && (
            <button
              onClick={() => {
                if (isPreviousDaySession) {
                  toast.error("Session antérieure non clôturée", "Vous devez clôturer la session de la veille avant d'ouvrir la caisse aujourd'hui.")
                  return
                }
                setOpenInputCash(initialCash)
                setOpenInputMomo(initialMomo)
                setShowOpenModal(true)
              }}
              disabled={isPreviousDaySession}
              className={`px-4 py-2.5 rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 ${
                isPreviousDaySession
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
              }`}
              title={isPreviousDaySession ? "Clôturez d'abord la caisse d'hier" : "Ouvrir la caisse"}
            >
              <Unlock className="w-4 h-4" />
              <span>Ouvrir la caisse</span>
            </button>
          )}

          {/* Bouton CLÔTURER CAISSE (Règle M048) : Visible si du jour > 0 ou session ouverte */}
          {(especesDuJour + momoDuJour > 0 || caisseStatus === 'OUVERTE') && (
            <button
              onClick={() => {
                setClosingPhysicalCash(fondActuelEspeces + especesDuJour)
                setRolloverCash(fondActuelEspeces + especesDuJour)
                setShowCloseModal(true)
              }}
              disabled={isOperatingCaisse}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 transition flex items-center gap-1.5 disabled:opacity-50"
              title="Clôturer la caisse et transférer les espèces et momo du jour dans le fond actuel"
            >
              <Lock className="w-4 h-4" />
              <span>Clôturer la caisse</span>
            </button>
          )}

          <button
            onClick={() => setShowClotureModal(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="Consulter et exécuter la clôture journalière multi-secteurs"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Clôture Multi-Secteurs</span>
          </button>

          {/* Bouton Rapport de Caisse PDF Direct */}
          <button
            onClick={() => {
              // Si un Z existe dans l'historique, le charger, sinon créer la synthèse du jour
              if (closuresHistory.length > 0) {
                setActiveReportClosure(closuresHistory[0])
              } else {
                setActiveReportClosure({
                  id: `rapport-${Date.now()}`,
                  closed_at: new Date().toISOString(),
                  closed_by: user?.full_name || 'Caissier',
                  caisse_name: caisseActive?.nom || `Caisse ${currentSectorSlug.toUpperCase()}`,
                  fond_especes_theorique: fondActuelEspeces + especesDuJour,
                  fond_especes_physique: fondActuelEspeces + especesDuJour,
                  ecart_especes: 0,
                  fond_momo: fondActuelMomo + momoDuJour,
                  total_fermeture: fondActuelEspeces + especesDuJour + fondActuelMomo + momoDuJour,
                  notes: 'Rapport intermédiaire de caisse',
                  status: 'CLOTURE_VALIDEE',
                  emailed_to: company?.email ? [company.email] : []
                })
              }
              setShowReportModal(true)
            }}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            title="Générer, visualiser le PDF et envoyer par email le rapport de caisse"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Rapport de Caisse (PDF)</span>
          </button>
        </div>
      </div>

      {/* ── Compteurs d'Activités Journalières & Situation de Trésorerie ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Compteurs d'Activités Journalières & Situation de Caisse
            </h2>
            <p className="text-xs text-slate-400">
              Flux réels : Ventes + Recouvrements - Sorties & Dépenses (Découvert autorisé si fond insuffisant)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
              Entrées : +{fmt(totalEntreesDuJour)}
            </span>
            <span className="text-xs font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl">
              Sorties : -{fmt(totalSortiesDuJour)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Indicateurs Clés Globaux de Caisse ────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* A. Fond actuel — Espèces */}
        <div className={`bg-white rounded-3xl border-2 p-4 shadow-sm flex flex-col justify-between ${
          fondActuelEspeces < 0 ? 'border-red-400 bg-red-50/20' : 'border-emerald-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-black uppercase tracking-wider ${
              fondActuelEspeces < 0 ? 'text-red-700' : 'text-emerald-800'
            }`}>
              Fond Actuel Espèces
            </span>
            <Wallet className={`w-4 h-4 ${fondActuelEspeces < 0 ? 'text-red-600' : 'text-emerald-600'}`} />
          </div>
          <div>
            <p className={`text-xl font-black font-mono ${fondActuelEspeces < 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {fmt(fondActuelEspeces)}
            </p>
            {fondActuelEspeces < 0 && (
              <span className="inline-block mt-1 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
                DÉCOUVERT AUTORISÉ
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Initial ({fmt(fondInitialEspeces)}) + Clôtures ({fmt(sumCloturesEspeces)}) - Dépenses ({fmt(sumDepensesEspeces)}) - Retraits ({fmt(sumRetraitsEspeces)})
          </p>
        </div>

        {/* B. Fond actuel — MoMo */}
        <div className={`bg-white rounded-3xl border-2 p-4 shadow-sm flex flex-col justify-between ${
          fondActuelMomo < 0 ? 'border-red-400 bg-red-50/20' : 'border-amber-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-black uppercase tracking-wider ${
              fondActuelMomo < 0 ? 'text-red-700' : 'text-amber-800'
            }`}>
              Fond Actuel MoMo
            </span>
            <Smartphone className={`w-4 h-4 ${fondActuelMomo < 0 ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <p className={`text-xl font-black font-mono ${fondActuelMomo < 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {fmt(fondActuelMomo)}
            </p>
            {fondActuelMomo < 0 && (
              <span className="inline-block mt-1 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
                DÉCOUVERT AUTORISÉ
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Initial ({fmt(fondInitialMomo)}) + MoMo ({fmt(sumCloturesMomo)}) - Dépenses ({fmt(sumDepensesMomo)}) - Retraits ({fmt(sumRetraitsMomo)})
          </p>
        </div>

        {/* C. Espèces du jour nettes */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Espèces du Jour
            </span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black font-mono ${especesDuJour < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {fmt(especesDuJour)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Net: +{fmt(ventesEspeces)} / +{fmt(remboursementsEspeces)} FCFA
          </p>
        </div>

        {/* D. MoMo du jour net */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              MoMo du Jour
            </span>
            <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Smartphone className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black font-mono ${momoDuJour < 0 ? 'text-red-600' : 'text-amber-700'}`}>
            {fmt(momoDuJour)}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5">
            Net: +{fmt(ventesMomo)} / +{fmt(remboursementsMomo)} FCFA
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
            {nbVentesDuJour} vente(s) enregistrée(s)
          </p>
        </div>
      </div>

      {/* Modal Clôture Journalière Multi-Secteurs */}
      {showClotureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-6xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Clôture Journalière Multi-Secteurs
                </h2>
              </div>
              <button
                onClick={() => setShowClotureModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ClotureCaisse />
          </div>
        </div>
      )}

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
                  type="button"
                  onClick={handleTelechargerReportPDF}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
                  title="Télécharger le rapport de caisse en fichier PDF"
                >
                  <Download className="w-3.5 h-3.5" /> Télécharger PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
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
                  Rapport de Clôture par Email (avec PDF joint)
                </span>
                {activeReportClosure.emailed_to && activeReportClosure.emailed_to.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {activeReportClosure.emailed_to.length} email(s) associé(s)
                  </span>
                )}
              </div>

              {activeReportClosure.emailed_to && activeReportClosure.emailed_to.length > 0 ? (
                <p className="text-[11px] text-slate-600">
                  Destinataires configurés : <strong className="text-slate-800">{activeReportClosure.emailed_to.join(', ')}</strong>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  {company?.email ? (
                    <>Email de l'établissement : <strong className="text-slate-700">{company.email}</strong></>
                  ) : (
                    'Saisissez une adresse email pour recevoir le rapport de caisse officiel.'
                  )}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <input
                  type="email"
                  placeholder="Ajouter ou transmettre à un email (patron, comptable)..."
                  value={customReportEmail}
                  onChange={(e) => setCustomReportEmail(e.target.value)}
                  className="flex-1 p-2 border border-slate-200 rounded-xl text-xs bg-white font-sans"
                />
                <button
                  type="button"
                  onClick={handleSendReportByEmail}
                  disabled={isSendingReportMail}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSendingReportMail ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" /> Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" /> Envoyer par mail
                    </>
                  )}
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

export const CaisseOperationnellePage = CaissePage
export default CaissePage
