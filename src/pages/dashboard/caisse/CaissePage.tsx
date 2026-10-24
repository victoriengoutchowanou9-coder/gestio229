// =============================================================================
// GESTIO 229 SaaS — Caisse Opérationnelle du Secteur
// =============================================================================
// Séparation stricte de la Trésorerie Centrale
// Gestion des fonds Espèces / MoMo, Mouvements réels, Clôtures (Z de caisse)
// Demandes de transfert vers Trésorerie et Ajustements avec audit obligatoire
// Zéro donnée fictive
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { clsx } from 'clsx'
import { cn } from '../../../lib/utils'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Wallet, Plus, X, CheckCircle, Clock, TrendingUp, TrendingDown,
  Lock, Unlock, Shield, ArrowUpRight, Smartphone, RefreshCw, AlertCircle,
  Printer, Send, FileCheck, Check, ArrowRightLeft, FileText, History, Building2, Download, Mail,
  Receipt, Trash2
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { getActiveCaisse } from '../../../lib/supabaseTenant'
import { getActiveSectorSlug, filterItemsForSector } from '../../../lib/sectorClient'
import { AdjustFundsModal, WithdrawalRequestModal, ModalPortal } from '../../../components/modals'
import { DestinatairesReportModal } from '../../../components/caisse/DestinatairesReportModal'
import { getDestinatairesActifs } from '../../../services/destinatairesReportService'
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
  cloturerSessionCaisseAutomatique,
  getFondInitialOuverture,
  enregistrerMouvementCaisse,
  getFondsActuelsBySector,
  getCaisseJournaliereBySector,
  cloturerCaisseOfficielle
} from '../../../services/caisseSectorService'
import ClotureCaisse from './ClotureCaisse'
import { useAppContext } from '../../../contexts/AppContext'
import { useSalesCircuitConfig } from '../../../hooks/useSalesCircuitConfig'
import {
  fetchPendingBons,
  encaisserBonDeCommande,
  annulerBonDeCommande,
  PendingBon
} from '../../../services/salesCircuitService'

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

  const [lastClosure, setLastClosure] = useState<{ fond_reel_especes: number; fond_reel_momo: number }>({ fond_reel_especes: 0, fond_reel_momo: 0 })
  const [allCloturesTotals, setAllCloturesTotals] = useState<{ especes: number; momo: number }>({ especes: 0, momo: 0 })
  const [allDepensesTotals, setAllDepensesTotals] = useState<{ especes: number; momo: number }>({ especes: 0, momo: 0 })
  // Prestations Graphiques transmises par le graphiste prêtes à être encaissées (Module Imprimerie)
  const [prestationsGraphiquesAEncaisser, setPrestationsGraphiquesAEncaisser] = useState<any[]>([])
  const [encaissementPrestationModal, setEncaissementPrestationModal] = useState<any | null>(null)
  const [montantSaisiPrestation, setMontantSaisiPrestation] = useState<number | ''>('')
  const [modePaiementPrestation, setModePaiementPrestation] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'cheque'>('especes')
  const [notePrestationCaisse, setNotePrestationCaisse] = useState<string>('')
  const [isProcessingPrestationCaisse, setIsProcessingPrestationCaisse] = useState<boolean>(false)

  // ── Organisation des Ventes & Bons de Commande en attente d'encaissement ──
  const {
    circuitMode,
    isIntegrated: isCircuitIntegrated,
    isSeparated: isCircuitSeparated
  } = useSalesCircuitConfig(currentSectorSlug)

  const [bonsEnAttente, setBonsEnAttente] = useState<PendingBon[]>([])
  const [loadingBonsEnAttente, setLoadingBonsEnAttente] = useState<boolean>(false)
  const [bonAEncaisser, setBonAEncaisser] = useState<PendingBon | null>(null)
  const [montantEncaissementBon, setMontantEncaissementBon] = useState<number>(0)
  const [modePaiementBon, setModePaiementBon] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'wave' | 'banque' | 'carte'>('especes')
  const [noteEncaissementBon, setNoteEncaissementBon] = useState<string>('')
  const [isProcessingEncaissementBon, setIsProcessingEncaissementBon] = useState<boolean>(false)
  const [receiptSuccessBon, setReceiptSuccessBon] = useState<any | null>(null)

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showDestinatairesModal, setShowDestinatairesModal] = useState(false)
  const [activeReportClosure, setActiveReportClosure] = useState<CashClosure | null>(null)
  const [customReportEmail, setCustomReportEmail] = useState<string>('')
  const [isSendingReportMail, setIsSendingReportMail] = useState<boolean>(false)
  const [isOperatingCaisse, setIsOperatingCaisse] = useState<boolean>(false)
  const [totalCreances, setTotalCreances] = useState<number>(0)

  // Droits d'accès d'administration (Rapport par Email & Gestion Destinataires)
  const userRole = ((user?.role || '') as string).toLowerCase()
  const isAdminOrManager = ['admin', 'administrateur', 'super_admin', 'dirigeant', 'gerant', 'patron'].includes(userRole)

  // Saisie ouverture (calculée automatiquement - non modifiable par l'utilisateur)
  const [openInputCash, setOpenInputCash] = useState<number>(0)
  const [openInputMomo, setOpenInputMomo] = useState<number>(0)

  // Calcul automatique des fonds initiaux dès l'ouverture du modal (PARTIE 1)
  useEffect(() => {
    if (!showOpenModal) return
    const compId = currentCompanyId || company?.id
    const secId = secteurActif?.id
    if (!compId) return
    ;(async () => {
      const initRes = await getFondInitialOuverture(compId, currentSectorSlug, cashRegisterId || caisseActive?.id, secId)
      setOpenInputCash(initRes.fondInitialEspeces)
      setOpenInputMomo(initRes.fondInitialMomo)
    })()
  }, [showOpenModal, currentCompanyId, company?.id, currentSectorSlug, cashRegisterId, caisseActive?.id, secteurActif?.id])

  // Saisie clôture
  const [closingPhysicalCash, setClosingPhysicalCash] = useState<number>(0)
  const [rolloverCash, setRolloverCash] = useState<number>(0)
  const [closingNotes, setClosingNotes] = useState<string>('')
  const [ecartReason, setEcartReason] = useState<string>('')

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

  // ── Chargement des Bons de Commande en attente d'encaissement (Mode Séparé) ──
  const loadBonsEnAttente = useCallback(async () => {
    const compId = currentCompanyId || company?.id
    if (!compId) return
    try {
      setLoadingBonsEnAttente(true)
      const list = await fetchPendingBons(compId, currentSectorSlug)
      setBonsEnAttente(list)
    } catch (err) {
      console.warn('[CaissePage] Erreur chargement bons en attente:', err)
    } finally {
      setLoadingBonsEnAttente(false)
    }
  }, [currentCompanyId, company?.id, currentSectorSlug])

  useEffect(() => {
    loadBonsEnAttente()

    const handleBonEvent = () => {
      loadBonsEnAttente()
    }

    window.addEventListener('gestio:bon_transmitted', handleBonEvent)
    window.addEventListener('gestio:bon_encaisse', handleBonEvent)
    window.addEventListener('gestio:bon_annule', handleBonEvent)
    return () => {
      window.removeEventListener('gestio:bon_transmitted', handleBonEvent)
      window.removeEventListener('gestio:bon_encaisse', handleBonEvent)
      window.removeEventListener('gestio:bon_annule', handleBonEvent)
    }
  }, [loadBonsEnAttente])

  // ── Validation de l'encaissement d'un Bon par la Caissière ──
  const handleValiderEncaissementBon = async () => {
    if (!bonAEncaisser || isProcessingEncaissementBon) return
    if (montantEncaissementBon <= 0) {
      toast.error('Montant invalide', 'Le montant à encaisser doit être supérieur à zéro.')
      return
    }

    // Contrôle d'état de caisse
    if (caisseStatus !== 'OUVERTE' && (!sessionDuJour || sessionDuJour.statut === 'fermée')) {
      toast.error('Caisse fermée', 'Veuillez ouvrir la caisse avant de procéder à l\'encaissement.')
      return
    }

    setIsProcessingEncaissementBon(true)

    try {
      const activeCompId = currentCompanyId || company?.id || ''
      const res = await encaisserBonDeCommande({
        orderId: bonAEncaisser.id,
        companyId: activeCompId,
        sectorSlug: currentSectorSlug,
        caisseId: cashRegisterId || caisseActive?.id || null,
        caisseSessionId: activeSessionId || sessionDuJour?.id || null,
        cashierId: user?.id || '',
        cashierName: user?.full_name || 'Caissière',
        montantEncaisse: montantEncaissementBon,
        modePaiement: modePaiementBon,
        notes: noteEncaissementBon
      })

      if (!res.success) {
        toast.error('Encaissement impossible', res.error || 'Erreur lors de l\'encaissement.')
        setIsProcessingEncaissementBon(false)
        return
      }

      toast.success(
        'Encaissement validé avec succès !',
        `Bon ${bonAEncaisser.order_number} encaissé (${fmt(montantEncaissementBon)}).`
      )

      setReceiptSuccessBon({
        transaction_ref: res.transactionRef,
        order_number: bonAEncaisser.order_number,
        date: new Date().toISOString(),
        customer_name: bonAEncaisser.customer_name,
        seller_name: bonAEncaisser.seller_name,
        cashier_name: user?.full_name || 'Caissière',
        amount_paid: montantEncaissementBon,
        payment_method: modePaiementBon,
        remaining_balance: Math.max(0, bonAEncaisser.remaining_balance - montantEncaissementBon),
        items: bonAEncaisser.items
      })

      setBonAEncaisser(null)
      await Promise.all([loadBonsEnAttente(), loadCaisseData(), loadSessions()])
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Une anomalie est survenue.')
    } finally {
      setIsProcessingEncaissementBon(false)
    }
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

      // 3. Charger l'Historique réel et persistant des mouvements de caisse (RÈGLE 4)
      let allDbMovements: CashMovement[] = []
      try {
        const { data: dbMvts } = await supabase
          .from('caisse_mouvements')
          .select('*')
          .eq('company_id', currentCompanyId)
          .eq('sector_slug', currentSectorSlug)
          .order('created_at', { ascending: false })
          .limit(100)

        if (dbMvts && dbMvts.length > 0) {
          allDbMovements = dbMvts.map((m: any) => {
            const isCash = (m.montant_especes > 0) || (m.type === 'especes') || (!m.montant_momo && m.sens === 'entree')
            const isMomo = (m.montant_momo > 0) || (m.type === 'momo')
            const channel = (isCash && isMomo) ? 'Tous' : isMomo ? 'MoMo' : 'Espèces'

            let movType: CashMovement['type'] = 'ENCAISSEMENT'
            if (m.type === 'cloture') movType = 'CLOTURE'
            else if (m.type === 'depense' || m.sens === 'sortie') movType = 'RETRAIT'
            else if (m.type === 'reglement_client') movType = 'REMBOURSEMENT'
            else if (m.type === 'ajustement') movType = 'AJUSTEMENT'
            else if (m.type === 'transfert' || m.type === 'retrait') movType = 'TRANSFERT'

            return {
              id: m.id,
              created_at: m.created_at,
              user_name: m.user_name || 'Caissier',
              type: movType,
              payment_channel: channel,
              amount: Number(m.montant) || 0,
              motif: m.motif || `Mouvement ${m.type}`,
              reference: m.source_id || m.reference_id || `MVT-${m.id.slice(0, 6)}`,
              status: 'VALIDE' as const
            }
          })
        }
      } catch (mvtErr) {
        console.warn('Erreur chargement caisse_mouvements:', mvtErr)
      }

      // Si caisse_mouvements n'a pas encore de lignes, utiliser les mouvements calculés en mémoire
      if (allDbMovements.length > 0) {
        setMovementsHistory(allDbMovements)
      } else {
        setMovementsHistory(
          [...transferMovements, ...depensesMovements, ...repaymentMovements, ...saleMovements].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        )
      }

      // 5. Charger les fonds actuels officiels & compteurs journaliers (Isolation Stricte Secteur M048)
      const secId = secteurActif?.id
      const cId = cashRegisterId || caisseActive?.id
      const todayDate = new Date().toISOString().split('T')[0]
      if (currentCompanyId && secId) {
        try {
          const fondRes = await getFondsActuelsBySector(currentCompanyId, secId, cId, currentSectorSlug)
          setFondsActuelsData(fondRes)

          const jourRes = await getCaisseJournaliereBySector(currentCompanyId, secId, cId, todayDate)
          setCaisseJourData(jourRes)

          // Récupérer automatiquement le solde reporté de la dernière clôture validée
          const initRes = await getFondInitialOuverture(currentCompanyId, currentSectorSlug, cId, secId)
          const repEsp = initRes.fondInitialEspeces
          const repMo = initRes.fondInitialMomo

          setLastClosure({
            fond_reel_especes: repEsp,
            fond_reel_momo: repMo,
          })

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

          // Charger toutes les demandes de retrait de caisse du secteur actif (en attente & validées)
          let loadedRequests: any[] = []
          try {
            let retQuery = supabase
              .from('demandes_retrait')
              .select('*')
              .eq('company_id', currentCompanyId)
              .gte('created_at', startOfDay)
              .neq('statut', 'refuse')
              .neq('statut', 'REJECTED')
              .order('created_at', { ascending: false })

            const activeRegId = cashRegisterId || caisseActive?.id
            if (activeRegId) {
              retQuery = retQuery.eq('caisse_id', activeRegId)
            }

            const { data: retData } = await retQuery

            if (retData && retData.length > 0) {
              loadedRequests = retData.map((r: any) => ({
                id: r.id,
                created_at: r.created_at,
                requested_by: r.demandeur_nom || 'Caissier',
                type: (r.mode_paiement === 'momo') ? 'MoMo' : 'Espèces',
                amount: Number(r.montant) || 0,
                motif: r.motif || 'Retrait caisse vers trésorerie',
                sector_slug: currentSectorSlug,
                status: (r.statut === 'valide' || r.statut === 'APPROVED') ? 'APPROVED' : 'EN_ATTENTE'
              }))
            }
          } catch (_) {}

          if (loadedRequests.length === 0) {
            try {
              const { data: transData } = await supabase
                .from('treasury_transfers')
                .select('*')
                .eq('company_id', currentCompanyId)
                .eq('sector_slug', currentSectorSlug)
                .gte('created_at', startOfDay)
                .neq('status', 'REJECTED')
                .neq('status', 'refuse')
                .order('created_at', { ascending: false })

              if (transData && transData.length > 0) {
                loadedRequests = transData
                  .filter((t: any) => !t.motif?.startsWith('[DÉCAISSEMENT]'))
                  .map((t: any) => ({
                    id: t.id,
                    created_at: t.created_at,
                    requested_by: t.requested_by || 'Caissier',
                    type: String(t.type || '').toLowerCase().includes('mo') ? 'MoMo' : 'Espèces',
                    amount: Number(t.amount) || 0,
                    motif: t.motif || 'Versement caisse vers trésorerie',
                    sector_slug: t.sector_slug || currentSectorSlug,
                    status: (t.status === 'APPROVED' || t.status === 'valide') ? 'APPROVED' : 'EN_ATTENTE'
                  }))
              }
            } catch (_) {}
          }

          // Fallback stockage local si réseau indisponible
          if (loadedRequests.length === 0) {
            try {
              const cached = JSON.parse(localStorage.getItem(`gestio_caisse_pending_requests_${currentCompanyId}_${currentSectorSlug}`) || '[]')
              if (Array.isArray(cached) && cached.length > 0) {
                loadedRequests = cached
              }
            } catch (_) {}
          }

          setPendingRequests(loadedRequests)

          const rEsp = loadedRequests.filter(r => r.type === 'Espèces' && r.status !== 'REFUSE').reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
          const rMo = loadedRequests.filter(r => r.type === 'MoMo' && r.status !== 'REFUSE').reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
          setAllRetraitsTotals({ especes: rEsp, momo: rMo })
          // 6. Total créances du secteur actif de l'entreprise pour le rapport
          try {
            const { data: dbClients } = await supabase
              .from('customers')
              .select('current_debt, sector_slug')
              .eq('company_id', currentCompanyId)
              .eq('sector_slug', currentSectorSlug)
              .neq('is_active', false)
            if (dbClients && dbClients.length > 0) {
              const cTot = dbClients.reduce((acc, c: any) => acc + (Number(c.current_debt ?? 0)), 0)
              setTotalCreances(cTot)
            }
          } catch (_) {}

          // 7. Si secteur imprimerie : charger les prestations graphiques transmises à la caisse
          if (currentSectorSlug === 'imprimerie' || currentSectorSlug === 'impression') {
            try {
              const { imprimerieService } = await import('../../../services/imprimerieService')
              const allVars = await imprimerieService.getPrestationsVariables(currentCompanyId, currentSectorSlug)
              // Filtrer celles transmises à la caisse ou partiellement encaissées avec solde > 0
              const aEncaisser = allVars.filter((v: any) =>
                ['transmise_caisse', 'partiellement_encaissee'].includes(v.statut) && Number(v.solde_restant || 0) > 0
              )
              setPrestationsGraphiquesAEncaisser(aEncaisser)
            } catch (errP) {
              console.warn('Erreur chargement prestations graphiques pour caisse:', errP)
            }
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

  // ─── Indicateurs Spéciaux pour Rapport PDF & Email ──────────────────────────
  const margeBruteJour = useMemo(() => {
    return salesToday.reduce((acc, s) => {
      const totAmt = Number(s.total_amount || 0)
      const totCost = Number(s.total_cost || 0)
      return acc + (totAmt - totCost)
    }, 0)
  }, [salesToday])

  const top5ProduitsJour = useMemo(() => {
    const agg: Record<string, { quantite: number; totalVentes: number }> = {}
    salesToday.forEach((s: any) => {
      let lines = Array.isArray(s.lines) ? s.lines : null
      if (!lines && s.notes) {
        try {
          const pNotes = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          if (Array.isArray(pNotes.lines)) lines = pNotes.lines
        } catch (_) {}
      }
      if (Array.isArray(lines) && lines.length > 0) {
        lines.forEach((l: any) => {
          const pName = l.product?.name || l.name || 'Produit'
          const q = Number(l.qty || l.quantity || 1)
          const t = Number(l.unitPrice || l.unit_price || 0) * q || (Number(s.total_amount || 0) / lines.length)
          if (!agg[pName]) agg[pName] = { quantite: 0, totalVentes: 0 }
          agg[pName].quantite += q
          agg[pName].totalVentes += t
        })
      } else {
        const pName = s.customer_name ? `Vente ${s.customer_name}` : `Vente #${s.order_number || s.id?.slice(0, 6) || 'CMD'}`
        if (!agg[pName]) agg[pName] = { quantite: 0, totalVentes: 0 }
        agg[pName].quantite += 1
        agg[pName].totalVentes += Number(s.total_amount || 0)
      }
    })

    return Object.entries(agg)
      .map(([nom, val]) => ({ nom, quantite: val.quantite, totalVentes: val.totalVentes }))
      .sort((a, b) => b.totalVentes - a.totalVentes)
      .slice(0, 5)
  }, [salesToday])

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
  // RÈGLES MÉTIER OFFICIELLES GESTIO 229 CAISSE : FOND ACTUEL vs SOLDE THÉORIQUE
  // 1. Espèces du jour = ventes espèces du jour + remboursements espèces
  //    Momo du jour = ventes Momo du jour + remboursements Momo du jour
  // 2. Fond Initial Matin = dernier montant laissé lors de la clôture de la veille
  // 3. Fond Actuel Espèces = Solde Théorique = Fond Initial Matin + Entrées jour (Espèces) - Dépenses - Versements
  // =============================================================================

  // Variables explicites déclarées pour éviter toute ReferenceError
  const sumVentesEspeces = Number(ventesEspeces) || 0
  const sumVentesMomo = Number(ventesMomo) || 0
  const sumDepensesEspeces = Number(depensesEspeces) || 0
  const sumDepensesMomo = Number(depensesMomo) || 0
  const sumRemboursements = (Number(remboursementsEspeces) || 0) + (Number(remboursementsMomo) || 0)

  // 1. Compteurs Du Jour (Uniquement encaissements : ventes + remboursements)
  const especesDuJour = caisseJourData.especes_du_jour > 0
    ? caisseJourData.especes_du_jour
    : (sumVentesEspeces + (Number(remboursementsEspeces) || 0))

  const momoDuJour = caisseJourData.momo_du_jour > 0
    ? caisseJourData.momo_du_jour
    : (sumVentesMomo + (Number(remboursementsMomo) || 0))

  const nbVentesDuJour = caisseJourData.nb_ventes > 0
    ? caisseJourData.nb_ventes
    : salesToday.length

  const depensesEspecesJour = sumDepensesEspeces
  const depensesMomoJour = sumDepensesMomo
  const retraitsEspecesJour = totalRetraitsEspeces
  const retraitsMomoJour = totalRetraitsMomo

  // 2. Fond Initial / Report réel du matin (RÈGLE MÉTIER OFFICIELLE) :
  // Le Report doit correspondre au Fond Initial Matin réel laissé lors de la dernière clôture.
  // Ne jamais afficher 0 si un fond persistant existe en caisse.
  const reportEspecesRaw = Number(lastClosure.fond_reel_especes) || Number(fondsActuelsData.fond_initial_especes) || initialCash
  const netMouvementsEspecesJour = especesDuJour - depensesEspecesJour - retraitsEspecesJour
  const fondSecteurEsp = Number(fondsActuelsData.fond_actuel_especes) || 0

  const reportEspeces = reportEspecesRaw > 0
    ? reportEspecesRaw
    : (fondSecteurEsp > netMouvementsEspecesJour && fondSecteurEsp > 0
        ? Math.max(0, fondSecteurEsp - netMouvementsEspecesJour)
        : reportEspecesRaw)

  const reportMomoRaw = Number(lastClosure.fond_reel_momo) || Number(fondsActuelsData.fond_initial_momo) || initialMomo
  const netMouvementsMomoJour = momoDuJour - depensesMomoJour - retraitsMomoJour
  const fondSecteurMomo = Number(fondsActuelsData.fond_actuel_momo) || 0

  const reportMomo = reportMomoRaw > 0
    ? reportMomoRaw
    : (fondSecteurMomo > netMouvementsMomoJour && fondSecteurMomo > 0
        ? Math.max(0, fondSecteurMomo - netMouvementsMomoJour)
        : reportMomoRaw)

  const fondInitialEspeces = (caisseStatus === 'OUVERTE' && initialCash > 0) ? initialCash : reportEspeces
  const fondInitialMomo = (caisseStatus === 'OUVERTE' && initialMomo > 0) ? initialMomo : reportMomo

  // 3. FOND ACTUEL & SOLDE THÉORIQUE (RÈGLE MÉTIER OFFICIELLE) :
  // Fond Actuel Espèces = Fond Initial du Matin (clôture veille) + Somme ventes Espèces du jour + Autres entrées espèces - Dépenses espèces - Versements banque/retraits
  const fondTheoriqueEsp = fondInitialEspeces + especesDuJour - depensesEspecesJour - retraitsEspecesJour
  const fondTheoriqueMomo = fondInitialMomo + momoDuJour - depensesMomoJour - retraitsMomoJour

  const fondActuelEspeces = fondTheoriqueEsp
  const fondActuelMomo = fondTheoriqueMomo

  // 4. Fond initial global
  const fondInitialTotal = fondInitialEspeces + fondInitialMomo

  // 5. Fond théorique actuel global
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
    if (isOperatingCaisse) return
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

  // ─── Action : Fermer la Caisse (Automatique sans saisie manuelle) ─────────────
  const handleConfirmCloseCaisse = async () => {
    if (isOperatingCaisse) return
    setIsOperatingCaisse(true)

    try {
      const closedAt = new Date().toISOString()
      const closedBy = user?.full_name || user?.username || 'Caissier'
      const opNotes = closingNotes.trim()

      // 1. Clôture automatique avec recalcul côté serveur/service fiable
      const closeRes = await cloturerSessionCaisseAutomatique({
        sessionId: activeSessionId || undefined,
        caisseId: cashRegisterId || caisseActive?.id,
        companyId: currentCompanyId,
        sectorSlug: currentSectorSlug,
        secteurId: secteurActif?.id,
        userId: user?.id,
        userName: closedBy,
        notes: opNotes || 'Clôture de session validée',
        fallbackFondInitialEsp: fondInitialEspeces,
        fallbackFondInitialMomo: fondInitialMomo,
        fallbackEspecesJour: especesDuJour,
        fallbackMomoJour: momoDuJour,
        fallbackDepensesEsp: sumDepensesEspeces,
        fallbackRetraitsEsp: retraitsEspecesJour,
        fallbackRetraitsMomo: retraitsMomoJour,
        fallbackFondTheoriqueEsp: fondTheoriqueEsp,
        fallbackFondTheoriqueMomo: fondTheoriqueMomo,
      })

      if (!closeRes.success) {
        toast.error('Erreur lors de la clôture', closeRes.error || 'Impossible de clôturer la caisse.')
        setIsOperatingCaisse(false)
        return
      }

      const syn = closeRes.synthese
      const finalSoldeTheoriqueEsp = syn.soldeTheoriqueEspeces
      const finalSoldeTheoriqueMomo = syn.soldeTheoriqueMomo
      const finalMontantConserve = syn.montantConserve
      const finalEspecesJour = syn.entreesEspeces
      const finalMomoJour = syn.entreesMomo

      // 2. Destinataires actifs configurés
      let recipientEmails: string[] = []
      try {
        const destActifs = await getDestinatairesActifs(currentCompanyId)
        recipientEmails = destActifs.map((d) => d.email.trim().toLowerCase()).filter(Boolean)
      } catch (_) {}

      // Fallbacks légitimes si aucun destinataire spécifique n'est configuré
      if ((company as any)?.closure_email_1) recipientEmails.push((company as any).closure_email_1.trim().toLowerCase())
      if ((company as any)?.closure_email_2) recipientEmails.push((company as any).closure_email_2.trim().toLowerCase())
      if ((company as any)?.closure_email_3) recipientEmails.push((company as any).closure_email_3.trim().toLowerCase())
      if (company?.email) recipientEmails.push(company.email.trim().toLowerCase())
      recipientEmails = Array.from(new Set(recipientEmails.filter(Boolean)))

      const newClosure: CashClosure = {
        id: `cloture-${Date.now()}`,
        closed_at: closedAt,
        closed_by: closedBy,
        caisse_name: caisseActive?.nom || `Caisse ${currentSectorSlug.toUpperCase()}`,
        fond_especes_theorique: finalSoldeTheoriqueEsp,
        fond_especes_physique: finalSoldeTheoriqueEsp,
        ecart_especes: 0,
        fond_momo: finalSoldeTheoriqueMomo,
        total_fermeture: finalSoldeTheoriqueEsp + finalSoldeTheoriqueMomo,
        notes: opNotes || 'Clôture automatique validée',
        status: 'CLOTURE_VALIDEE',
        emailed_to: recipientEmails
      }

      setClosuresHistory([newClosure, ...closuresHistory])
      setActiveReportClosure(newClosure)

      // Transfert officiel M048
      const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ? user.id : null
      try {
        await cloturerCaisseOfficielle(currentCompanyId, secteurActif.id, cashRegisterId || caisseActive.id, validUserId, {
          fond_initial: syn.fondInitialEspeces,
          total_entrees: finalEspecesJour,
          total_sorties: syn.depensesEspeces + syn.versementsEspeces,
          fond_theorique: finalSoldeTheoriqueEsp,
          fond_reel: finalSoldeTheoriqueEsp,
          ecart: 0,
          fond_initial_matin: syn.fondInitialEspeces,
          total_entrees_jour: finalEspecesJour,
          total_depenses_jour: syn.depensesEspeces,
          solde_theorique: finalSoldeTheoriqueEsp,
          fond_initial_suivant: finalMontantConserve,
          montant_laisse: finalMontantConserve,
          versement_coffre: syn.montantReverse,
          commentaire: opNotes || 'Clôture de session validée',
        })
      } catch (clotErr) {
        console.warn('Erreur cloturerCaisseOfficielle:', clotErr)
      }

      // ── 3. ENVOI AUTOMATIQUE INSTANTANÉ DU RAPPORT PDF VIA GMAIL SMTP ──
      try {
        const heureActuelle = new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
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
            nom: caisseActive?.nom || `Caisse ${currentSectorSlug.toUpperCase()}`,
            id: cashRegisterId || caisseActive?.id
          },
          session: {
            id: newClosure.id,
            dateCloture: closedAt,
            fermePar: closedBy
          },
          user: {
            nom: closedBy
          },
          date: closedAt,
          heure: heureActuelle,
          synthese: {
            fondInitialEspeces: syn.fondInitialEspeces,
            encaissementsEspeces: finalEspecesJour,
            depensesEspeces: syn.depensesEspeces,
            fondTheoriqueEspeces: finalSoldeTheoriqueEsp,
            fondTheoriqueMomo: finalSoldeTheoriqueMomo,
            fondReelEspeces: finalSoldeTheoriqueEsp,
            fondReelMomo: finalSoldeTheoriqueMomo,
            ecartEspeces: 0,
            ecartMomo: 0,
            caDuJour: syn.caDuJour || caDuJour,
            especesDuJour: finalEspecesJour,
            momoDuJour: finalMomoJour,
            fondActuel: finalMontantConserve + finalSoldeTheoriqueMomo,
            fondActuelEspeces: finalMontantConserve,
            fondActuelMomo: finalSoldeTheoriqueMomo,
            totalDepensesJour: syn.depensesEspeces + syn.depensesMomo,
            totalRemboursementsJour: sumRemboursements,
            remboursement: sumRemboursements,
            margeBruteJour: margeBruteJour,
            totalCreances: totalCreances
          },
          top5Produits: top5ProduitsJour,
          mouvements: movementsHistory.map((m) => ({
            heure: new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            type: m.type,
            montant: m.amount,
            mode: m.payment_channel,
            motif: m.motif,
            reference: m.reference
          })),
          notes: opNotes || 'Clôture automatique validée'
        }

        const { blob } = genererRapportCaissePDF(donneesPDF, { save: false })
        const pdfBase64 = await blobToBase64(blob)

        const res = await envoyerRapportCaisseMail({
          companyId: currentCompanyId,
          secteurId: currentSectorSlug,
          caisseId: cashRegisterId || caisseActive?.id,
          date: new Date(closedAt).toLocaleDateString('fr-BJ'),
          heure: heureActuelle,
          pdfBase64,
          emails: recipientEmails.length > 0 ? recipientEmails : undefined,
          metadata: {
            nomCaissier: closedBy,
            secteurNom: secteurActif?.nom || currentSectorSlug.toUpperCase(),
            entreprise: company?.name || 'GESTIO 229',
            caDuJour: syn.caDuJour || caDuJour,
            especesDuJour: finalEspecesJour,
            momoDuJour: finalMomoJour,
            fondActuel: finalMontantConserve + finalSoldeTheoriqueMomo,
            totalDepensesJour: syn.depensesEspeces + syn.depensesMomo,
            totalRemboursementsJour: sumRemboursements,
            remboursement: sumRemboursements,
            margeBruteJour: margeBruteJour,
            totalCreances: totalCreances,
            top5Produits: top5ProduitsJour
          }
        })

        const sentRecipients = res.recipients || recipientEmails
        toast.success(
          'Rapport envoyé instantanément par email !',
          `Rapport de clôture transmis à ${sentRecipients.length} destinataire(s) (${sentRecipients.join(', ')}).`
        )
      } catch (mailErr: any) {
        console.warn('[sendRapportCaisse] Échec envoi direct :', mailErr)
        toast.warning(
          'Rapport généré mais email non envoyé',
          mailErr?.message || 'Vérifiez la configuration SMTP Vercel.'
        )
      }

      // 4. Fermeture locale de la caisse et réinitialisation UI
      saveCaisseState('FERMEE', null, '', 0, 0)
      setActiveSessionId(null)
      setShowCloseModal(false)
      setShowReportModal(false)
      setClosingNotes('')
      setEcartReason('')
      setLastClosure({
        fond_reel_especes: finalMontantConserve,
        fond_reel_momo: finalSoldeTheoriqueMomo,
      })

      toast.success(
        'Caisse clôturée avec succès !',
        `Nouveaux fonds actuels : ${fmt(finalSoldeTheoriqueEsp)} (Espèces) | MoMo : ${fmt(finalSoldeTheoriqueMomo)}`
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
        total_sorties: sumDepensesEspeces + retraitsEspecesJour,
        fond_theorique: fondTheoriqueEsp,
        fond_reel: fondTheoriqueEsp,
        ecart: 0,
        commentaire: 'Clôture de caisse directe validée',
        fond_initial_matin: fondInitialEspeces,
        total_entrees_jour: especesDuJour,
        total_depenses_jour: sumDepensesEspeces,
        solde_theorique: fondTheoriqueEsp,
        fond_initial_suivant: fondTheoriqueEsp,
        montant_laisse: fondTheoriqueEsp,
        versement_coffre: 0,
      })
      if (res.success) {
        toast.success(
          'Caisse clôturée, Fond actuel mis à jour',
          `Espèces clôturées : ${fmt(res.especes ?? especesDuJour)}, MoMo : ${fmt(res.momo ?? momoDuJour)}. Opérations du jour remises à 0.`
        )
        saveCaisseState('FERMEE', null, '', 0, 0)
        setActiveSessionId(null)
        setLastClosure({
          fond_reel_especes: fondTheoriqueEsp,
          fond_reel_momo: fondTheoriqueMomo,
        })
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


  // ─── Envoi du Rapport par Email avec PDF joint (API Brevo Backend) ───────────
  const handleSendReportByEmail = async () => {
    if (!activeReportClosure) return
    const emailCible = customReportEmail.trim()
    const allEmails = [...(activeReportClosure.emailed_to || [])]
    if (emailCible && !allEmails.includes(emailCible)) {
      allEmails.push(emailCible)
    }

    setIsSendingReportMail(true)
    try {
      const heureActuelle = new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
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
        heure: heureActuelle,
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
          momoDuJour: momoDuJour || activeReportClosure.fond_momo,
          fondActuel: fondActuelEspeces + fondActuelMomo,
          fondActuelEspeces: fondActuelEspeces,
          fondActuelMomo: fondActuelMomo,
          totalDepensesJour: sumDepensesEspeces + depensesMomoJour,
          totalRemboursementsJour: remboursementsEspeces + remboursementsMomo,
          remboursement: remboursementsEspeces + remboursementsMomo,
          margeBruteJour: margeBruteJour,
          totalCreances: totalCreances
        },
        top5Produits: top5ProduitsJour,
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

      // 1. Générer le PDF avec les 12 sections obligatoires
      const { blob } = genererRapportCaissePDF(donneesPDF, { save: false })
      const pdfBase64 = await blobToBase64(blob)

      // 2. Transmettre au backend /api/send-rapport-pdf (Gmail SMTP)
      const res = await envoyerRapportCaisseMail({
        companyId: currentCompanyId,
        secteurId: currentSectorSlug,
        caisseId: cashRegisterId || caisseActive?.id,
        date: new Date(activeReportClosure.closed_at).toLocaleDateString('fr-BJ'),
        heure: heureActuelle,
        pdfBase64,
        emails: allEmails.length > 0 ? allEmails : undefined,
        metadata: {
          nomCaissier: activeReportClosure.closed_by || user?.full_name || 'Caissier',
          secteurNom: secteurActif?.nom || currentSectorSlug.toUpperCase(),
          entreprise: company?.name || 'GESTIO 229',
          caDuJour: caDuJour,
          especesDuJour: especesDuJour,
          momoDuJour: momoDuJour || activeReportClosure.fond_momo,
          fondActuel: fondActuelEspeces + fondActuelMomo,
          totalDepensesJour: sumDepensesEspeces + depensesMomoJour,
          totalRemboursementsJour: remboursementsEspeces + remboursementsMomo,
          remboursement: remboursementsEspeces + remboursementsMomo,
          margeBruteJour: margeBruteJour,
          totalCreances: totalCreances,
          top5Produits: top5ProduitsJour
        }
      })

      const updatedEmails = Array.from(new Set([...allEmails, ...(res.recipients || [])]))
      const updated = {
        ...activeReportClosure,
        emailed_to: updatedEmails
      }
      setActiveReportClosure(updated)
      setCustomReportEmail('')

      toast.success(
        'Rapport envoyé avec succès !',
        `Rapport envoyé à ${updatedEmails.length} destinataire(s) (${updatedEmails.join(', ')}) via Gmail SMTP.`
      )
    } catch (err: any) {
      console.error('Erreur envoi rapport email:', err)
      toast.error('Erreur transmission', err?.message || 'Échec de l\'envoi du rapport par email.')
    } finally {
      setIsSendingReportMail(false)
    }
  }

  // ─── Action : Envoyer une Demande vers Trésorerie ───────────────────────────
  // RÈGLE CRITIQUE : Un retrait caisse → trésorerie est un VIREMENT INTERNE.
  // Il ne doit PAS être enregistré comme une 'depense' dans caisse_mouvements.
  // Il doit être statut 'en_attente' jusqu'à validation admin (double transaction).
  const handleSendWithdrawalRequest = async (req: { type: string; amount: number; reason: string }) => {
    const newReq = {
      id: `req-${Date.now()}`,
      created_at: new Date().toISOString(),
      requested_by: user?.full_name || 'Caissier',
      type: req.type,
      amount: req.amount,
      motif: req.reason,
      sector_slug: currentSectorSlug,
      status: 'EN_ATTENTE' // En attente de validation admin — aucune déduction encore
    }

    const updated = [newReq, ...pendingRequests]
    setPendingRequests(updated)

    if (currentCompanyId) {
      const validUserId = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ? user.id : null
      const modeP = req.type === 'MoMo' ? 'momo' : 'especes'

      // 1. Enregistrer dans demandes_retrait (statut en_attente — pas encore exécuté)
      try {
        await supabase.from('demandes_retrait').insert({
          company_id: currentCompanyId,
          secteur_id: secteurActif.id || null,
          caisse_id: cashRegisterId || caisseActive.id || null,
          mode_paiement: modeP,
          montant: req.amount,
          motif: req.reason,
          statut: 'en_attente', // Attend validation admin
          created_by: validUserId,
          demandeur_nom: user?.full_name || 'Caissier',
          created_at: new Date().toISOString()
        })
      } catch (_) {}

      // 2. Enregistrer dans treasury_transfers (pour la TresoreriePage admin)
      try {
        await supabase.from('treasury_transfers').insert({
          company_id: currentCompanyId,
          sector_slug: currentSectorSlug,
          requested_by: user?.full_name || 'Caissier',
          type: req.type, // 'Espèces' ou 'MoMo'
          amount: req.amount,
          motif: req.reason,
          status: 'EN_ATTENTE',
          created_at: new Date().toISOString()
        })
      } catch (e) {
        // Fallback audit_logs si treasury_transfers n'existe pas encore
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

      // 3. Enregistrer dans caisse_mouvements avec type 'retrait_tresorerie' (JAMAIS 'depense')
      //    Statut = 'en_attente' jusqu'à validation admin — c'est un virement interne non une dépense
      try {
        await supabase.from('caisse_mouvements').insert({
          company_id: currentCompanyId,
          sector_slug: currentSectorSlug,
          caisse_id: cashRegisterId || caisseActive?.id || null,
          type: 'retrait_tresorerie', // VIREMENT INTERNE — PAS une dépense
          sens: 'sortie_vers_tresorerie',
          montant: req.amount,
          montant_total: req.amount,
          montant_especes: modeP === 'especes' ? req.amount : 0,
          montant_momo: modeP === 'momo' ? req.amount : 0,
          motif: `Demande de virement vers Trésorerie — ${req.reason}`,
          source_module: 'caisse_retrait',
          source_id: newReq.id,
          user_name: user?.full_name || 'Caissier',
          user_id: validUserId,
          statut: 'en_attente', // Bloqué visuellement — pas encore comptabilisé dans le fond
          created_at: new Date().toISOString()
        })
      } catch (_) {}
    }

    try {
      localStorage.setItem(`gestio_caisse_pending_requests_${currentCompanyId}_${currentSectorSlug}`, JSON.stringify(updated))
    } catch (_) {}

    toast.success(
      'Retrait de caisse enregistré !',
      `Montant de ${fmt(req.amount)} (${req.type}) déduit immédiatement du fond de caisse et transmis à la Trésorerie.`
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
    if (loading) return
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
  const handleOuvrirCaisseJour = async () => {
    if (sessionAnterieureOuverte) {
      toast.error('Session antérieure non clôturée', 'Vous devez d\'abord clôturer la session antérieure.')
      return
    }
    const initRes = await getFondInitialOuverture(currentCompanyId, currentSectorSlug, cashRegisterId || caisseActive?.id, secteurActif?.id)
    setOpenInputCash(initRes.fondInitialEspeces)
    setOpenInputMomo(initRes.fondInitialMomo)
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

          {/* Bons de commande en attente d'encaissement (Mode Séparé) */}
          <button
            onClick={() => {
              loadBonsEnAttente()
              const elem = document.getElementById('section-bons-attente-caisse')
              if (elem) elem.scrollIntoView({ behavior: 'smooth' })
            }}
            className={clsx(
              "px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer",
              bonsEnAttente.length > 0
                ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            )}
            title="Consulter les bons de commande en attente d'encaissement"
          >
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
            <span>Bons en attente</span>
            {bonsEnAttente.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-600 text-white font-black">
                {bonsEnAttente.length}
              </span>
            )}
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
              onClick={async () => {
                if (isPreviousDaySession) {
                  toast.error("Session antérieure non clôturée", "Vous devez clôturer la session de la veille avant d'ouvrir la caisse aujourd'hui.")
                  return
                }
                const initRes = await getFondInitialOuverture(currentCompanyId, currentSectorSlug, cashRegisterId || caisseActive?.id, secteurActif?.id)
                setOpenInputCash(initRes.fondInitialEspeces)
                setOpenInputMomo(initRes.fondInitialMomo)
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
                setClosingNotes('')
                setEcartReason('')
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

          {/* Bouton Configuration Destinataires Rapport (Admin / Dirigeant uniquement) */}
          {isAdminOrManager && (
            <button
              onClick={() => setShowDestinatairesModal(true)}
              className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Configurer les destinataires recevant automatiquement le rapport à 23h00 et par envoi manuel"
            >
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              <span>Destinataires Rapport</span>
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
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5 font-medium">
            Report {fmt(fondInitialEspeces)} + Jour {fmt(especesDuJour)} - Dépenses {fmt(sumDepensesEspeces)}{retraitsEspecesJour > 0 ? ` - Versements ${fmt(retraitsEspecesJour)}` : ''}
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
          <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5 font-medium">
            Report {fmt(fondInitialMomo)} + Jour {fmt(momoDuJour)} - Dépenses {fmt(sumDepensesMomo)}{retraitsMomoJour > 0 ? ` - Versements ${fmt(retraitsMomoJour)}` : ''}
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

      {/* ── SECTION MÉTIER : BONS EN ATTENTE D'ENCAISSEMENT (MODE SÉPARÉ OU BONS EXISTANTS) ── */}
      {(isCircuitSeparated || bonsEnAttente.length > 0) && (
        <div id="section-bons-attente-caisse" className="bg-white border-2 border-amber-200/80 rounded-3xl p-5 shadow-xs space-y-3 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Bons en attente d'encaissement ({bonsEnAttente.length})
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    Mode Séparé Vendeur &bull; Caissière
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Commandes préparées et transmises par les vendeurs, prêtes pour règlement au comptoir caisse
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                Total restant à percevoir : {fmt(bonsEnAttente.reduce((acc, b) => acc + Number(b.remaining_balance || 0), 0))}
              </span>
              <button
                onClick={loadBonsEnAttente}
                disabled={loadingBonsEnAttente}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition shadow-xs cursor-pointer"
                title="Actualiser la liste"
              >
                <RefreshCw className={clsx("w-3.5 h-3.5", loadingBonsEnAttente && "animate-spin")} />
              </button>
            </div>
          </div>

          {loadingBonsEnAttente ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
              <span>Actualisation des bons en attente...</span>
            </div>
          ) : bonsEnAttente.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Aucun bon de commande en attente d'encaissement pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">N° Bon</th>
                    <th className="p-3">Date & Heure</th>
                    <th className="p-3">Vendeur</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Détail des articles</th>
                    <th className="p-3 text-right">Montant Total</th>
                    <th className="p-3 text-right">Déjà payé</th>
                    <th className="p-3 text-right font-black text-amber-700">Reste à payer</th>
                    <th className="p-3 text-center">Statut</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {bonsEnAttente.map((bon) => (
                    <tr key={bon.id} className="hover:bg-amber-50/20 transition">
                      <td className="p-3 font-bold text-slate-900">{bon.order_number}</td>
                      <td className="p-3 font-sans text-slate-500 text-[11px]">
                        {new Date(bon.created_at).toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                        <span className="block text-[10px] text-slate-400">{new Date(bon.created_at).toLocaleDateString('fr-BJ')}</span>
                      </td>
                      <td className="p-3 font-sans text-slate-700">
                        <span className="font-semibold text-slate-900">{bon.seller_name || 'Vendeur'}</span>
                      </td>
                      <td className="p-3 font-sans text-slate-800">
                        <span className="font-bold">{bon.customer_name || 'Client Comptoir'}</span>
                      </td>
                      <td className="p-3 font-sans text-slate-600 max-w-xs">
                        <div className="truncate text-[11px]" title={bon.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ')}>
                          {bon.items.length > 0
                            ? bon.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ')
                            : 'Commande comptoir'}
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">{fmt(bon.total_amount)}</td>
                      <td className="p-3 text-right font-medium text-slate-500">{fmt(bon.paid_amount)}</td>
                      <td className="p-3 text-right font-black text-amber-700">{fmt(bon.remaining_balance)}</td>
                      <td className="p-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          bon.paid_amount > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {bon.paid_amount > 0 ? 'Partiel' : 'En attente'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setBonAEncaisser(bon)
                              setMontantEncaissementBon(bon.remaining_balance)
                              setModePaiementBon('especes')
                              setNoteEncaissementBon('')
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Encaisser</span>
                          </button>
                          <button
                            onClick={async () => {
                              const reason = window.prompt(`Motif d'annulation pour le bon ${bon.order_number} :`, 'Annulation demandée par le client')
                              if (reason === null) return
                              try {
                                const activeCompId = currentCompanyId || company?.id || ''
                                const res = await annulerBonDeCommande(
                                  bon.id,
                                  activeCompId,
                                  reason.trim() || 'Annulé en caisse',
                                  user?.id,
                                  user?.full_name
                                )
                                if (res.success) {
                                  toast.success('Bon annulé', `Le bon ${bon.order_number} a été annulé avec succès.`)
                                  loadBonsEnAttente()
                                } else {
                                  toast.error('Erreur', res.error || 'Impossible d\'annuler ce bon.')
                                }
                              } catch (err: any) {
                                toast.error('Erreur', err?.message || 'Erreur lors de l\'annulation')
                              }
                            }}
                            className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                            title="Annuler ce bon de commande"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Annuler</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal d'Encaissement du Bon de Commande par la Caissière ── */}
      {bonAEncaisser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 text-xs animate-scaleUp">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                  <span>Encaissement du Bon de Commande</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Réf: {bonAEncaisser.order_number} &bull; Vendeur: <strong>{bonAEncaisser.seller_name}</strong>
                </p>
              </div>
              <button
                onClick={() => setBonAEncaisser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Récapitulatif pré-rempli non modifiable */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex justify-between text-slate-600">
                <span>Client :</span>
                <span className="font-bold text-slate-900">{bonAEncaisser.customer_name || 'Client Comptoir'}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Montant total de la commande :</span>
                <span className="font-bold text-slate-900">{fmt(bonAEncaisser.total_amount)}</span>
              </div>
              {bonAEncaisser.paid_amount > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Montant déjà réglé :</span>
                  <span className="font-medium text-emerald-600">{fmt(bonAEncaisser.paid_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-amber-800 font-black text-sm border-t border-slate-200 pt-2">
                <span>Solde restant à percevoir :</span>
                <span className="font-mono">{fmt(bonAEncaisser.remaining_balance)}</span>
              </div>

              {/* Lignes d'articles */}
              {bonAEncaisser.items.length > 0 && (
                <div className="mt-3 pt-2 border-t border-dashed border-slate-300">
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Détail des articles :</p>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {bonAEncaisser.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[11px] text-slate-700">
                        <span>{item.quantity} × {item.product_name}</span>
                        <span className="font-mono">{fmt(item.total_ttc || item.quantity * item.unit_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Formulaire d'encaissement caissière */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Montant réellement perçu (FCFA) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={bonAEncaisser.remaining_balance}
                  value={montantEncaissementBon || ''}
                  onChange={(e) => setMontantEncaissementBon(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-black text-base text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                {montantEncaissementBon < bonAEncaisser.remaining_balance && montantEncaissementBon > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    ⚠️ Paiement partiel : il restera un solde dû de {fmt(bonAEncaisser.remaining_balance - montantEncaissementBon)}.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mode de règlement *</label>
                <select
                  value={modePaiementBon}
                  onChange={(e) => setModePaiementBon(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="especes">💵 Espèces (Tiroir Caisse)</option>
                  <option value="momo_mtn">📱 MTN Mobile Money</option>
                  <option value="momo_moov">📱 Moov Money</option>
                  <option value="wave">🌊 Wave</option>
                  <option value="banque">🏦 Banque / Virement</option>
                  <option value="carte">💳 Carte Bancaire</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Note ou observation (facultatif)</label>
                <input
                  type="text"
                  value={noteEncaissementBon}
                  onChange={(e) => setNoteEncaissementBon(e.target.value)}
                  placeholder="Ex: Réf reçu, chèque N°..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isProcessingEncaissementBon}
                  onClick={() => setBonAEncaisser(null)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={isProcessingEncaissementBon || montantEncaissementBon <= 0}
                  onClick={handleValiderEncaissementBon}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isProcessingEncaissementBon ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validation en cours...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Valider l'encaissement</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Reçu d'Encaissement Imprimable ── */}
      {receiptSuccessBon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 text-xs animate-scaleUp">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-600 font-bold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Encaissement Réussi</span>
              </div>
              <button
                onClick={() => setReceiptSuccessBon(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ticket de caisse imprimable */}
            <div id="recu-caisse-printable" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 font-sans">
              <div className="text-center space-y-0.5 border-b border-slate-200 pb-2">
                <p className="font-black text-slate-900 text-sm">{company?.name || 'GESTIO 229'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">REÇU DE CAISSE</p>
                <p className="font-mono text-xs font-bold text-slate-700">Réf: {receiptSuccessBon.transaction_ref}</p>
                <p className="text-[10px] text-slate-400">{new Date(receiptSuccessBon.date).toLocaleString('fr-BJ')}</p>
              </div>

              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span>Bon de commande :</span>
                  <span className="font-bold text-slate-900">{receiptSuccessBon.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Client :</span>
                  <span className="font-bold text-slate-900">{receiptSuccessBon.customer_name || 'Comptoir'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vendeur :</span>
                  <span>{receiptSuccessBon.seller_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Caissière :</span>
                  <span>{receiptSuccessBon.cashier_name}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className="flex justify-between items-center font-bold">
                  <span>Mode de paiement :</span>
                  <span className="uppercase text-slate-900">{receiptSuccessBon.payment_method}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-black text-emerald-700">
                  <span>MONTANT ENCAISSÉ :</span>
                  <span className="font-mono text-base">{fmt(receiptSuccessBon.amount_paid)}</span>
                </div>
                {receiptSuccessBon.remaining_balance > 0 && (
                  <div className="flex justify-between items-center text-xs text-rose-700 font-bold">
                    <span>SOLDE RESTANT DÛ :</span>
                    <span className="font-mono">{fmt(receiptSuccessBon.remaining_balance)}</span>
                  </div>
                )}
              </div>

              <div className="text-center pt-2 border-t border-slate-200 text-[10px] text-slate-400">
                Merci de votre confiance !
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer le reçu</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptSuccessBon(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section Prestations Graphiques à encaisser (Imprimerie & Sérigraphie) ── */}
      {(currentSectorSlug === 'imprimerie' || currentSectorSlug === 'impression') && (
        <div className="bg-white border border-pink-200 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-pink-100 text-pink-700 rounded-xl">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Prestations graphiques à encaisser ({prestationsGraphiquesAEncaisser.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Validées par le graphiste, en attente de règlement au comptoir caisse
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-pink-700 bg-pink-50 px-2.5 py-1 rounded-full">
              Total à percevoir : {fmt(prestationsGraphiquesAEncaisser.reduce((acc, p) => acc + (Number(p.solde_restant || p.prix_vente || 0)), 0))}
            </span>
          </div>

          {prestationsGraphiquesAEncaisser.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Aucune prestation graphique en attente d’encaissement.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Réf</th>
                    <th className="p-3">Désignation</th>
                    <th className="p-3">Client</th>
                    <th className="p-3 text-right">Prix de vente</th>
                    <th className="p-3 text-right font-black text-indigo-700">Reste à payer</th>
                    <th className="p-3">Graphiste ayant validé</th>
                    <th className="p-3 text-center">Date validation</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {prestationsGraphiquesAEncaisser.map((pv) => (
                    <tr key={pv.id} className="hover:bg-pink-50/30 transition">
                      <td className="p-3 font-bold text-slate-900">{pv.reference}</td>
                      <td className="p-3 font-sans font-medium text-slate-900">{pv.designation}</td>
                      <td className="p-3 font-sans text-slate-700">
                        <span className="font-bold">{pv.client_nom || 'Client Comptoir'}</span>
                        {pv.client_tel && <span className="block text-[10px] text-slate-400">{pv.client_tel}</span>}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">{fmt(pv.prix_vente)}</td>
                      <td className="p-3 text-right font-black text-pink-700">{fmt(pv.solde_restant || pv.prix_vente)}</td>
                      <td className="p-3 font-sans text-slate-600">
                        <span className="font-semibold text-slate-800">{pv.graphiste_nom || 'Graphiste'}</span>
                      </td>
                      <td className="p-3 text-center font-sans text-slate-500 text-[11px]">
                        {pv.date_validation ? new Date(pv.date_validation).toLocaleDateString('fr-FR') : '--'}
                      </td>
                      <td className="p-3 text-right font-sans">
                        <button
                          onClick={() => {
                            setEncaissementPrestationModal(pv)
                            setMontantSaisiPrestation(pv.solde_restant || pv.prix_vente)
                            setModePaiementPrestation('especes')
                            setNotePrestationCaisse('')
                          }}
                          className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center gap-1"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Encaisser</span>
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

      {/* Modal d'Encaissement Prestation Graphique par la Caissière */}
      {encaissementPrestationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 text-xs animate-scaleUp">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-pink-600" />
                  Encaissement Prestation Graphique
                </h3>
                <p className="text-[11px] text-slate-400">
                  {encaissementPrestationModal.reference} — {encaissementPrestationModal.designation}
                </p>
              </div>
              <button
                onClick={() => setEncaissementPrestationModal(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Client :</span>
                <span className="font-bold text-slate-900 font-sans">{encaissementPrestationModal.client_nom || 'Client Comptoir'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Prix de vente total :</span>
                <span className="font-bold text-slate-900">{fmt(encaissementPrestationModal.prix_vente)}</span>
              </div>
              <div className="flex justify-between text-pink-700 font-black">
                <span className="font-sans">Reste à payer :</span>
                <span>{fmt(encaissementPrestationModal.solde_restant || encaissementPrestationModal.prix_vente)}</span>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const amt = Number(montantSaisiPrestation) || 0
                if (amt <= 0) {
                  toast.error('Montant invalide.')
                  return
                }
                setIsProcessingPrestationCaisse(true)
                try {
                  const { imprimerieService } = await import('../../../services/imprimerieService')
                  const res = await imprimerieService.encaisserPrestationVariable(
                    encaissementPrestationModal.id,
                    currentCompanyId,
                    amt,
                    modePaiementPrestation,
                    user,
                    notePrestationCaisse
                  )
                  toast.success(`Encaissement de ${fmt(amt)} validé en Caisse ! Reçu : ${res.referenceRecu}`)
                  setEncaissementPrestationModal(null)
                  // Recharger les données de la caisse
                  loadTransactions()
                  if (refreshFonds) refreshFonds()
                } catch (err: any) {
                  toast.error(err.message || 'Erreur encaissement.')
                } finally {
                  setIsProcessingPrestationCaisse(false)
                }
              }}
              className="space-y-3 pt-1"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant perçu en caisse (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={encaissementPrestationModal.solde_restant || encaissementPrestationModal.prix_vente}
                  value={montantSaisiPrestation}
                  onChange={(e) => setMontantSaisiPrestation(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-black text-base text-slate-900 focus:ring-2 focus:ring-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mode de règlement *</label>
                <select
                  value={modePaiementPrestation}
                  onChange={(e) => setModePaiementPrestation(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="especes">Espèces (Tiroir Caisse)</option>
                  <option value="momo_mtn">Mobile Money MTN</option>
                  <option value="momo_moov">Mobile Money MOOV</option>
                  <option value="banque">Virement Bancaire</option>
                  <option value="cheque">Chèque</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observation / Reçu (facultatif)</label>
                <input
                  type="text"
                  placeholder="Ex : Réglé au comptoir caisse..."
                  value={notePrestationCaisse}
                  onChange={(e) => setNotePrestationCaisse(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEncaissementPrestationModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessingPrestationCaisse || Number(montantSaisiPrestation) <= 0}
                  className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isProcessingPrestationCaisse ? 'Enregistrement...' : 'Confirmer encaissement'}</span>
                </button>
              </div>
            </form>
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
                Les fonds initiaux sont calculés automatiquement. La caisse démarre avec le solde de la dernière clôture.
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Fond Initial Espèces (Tiroir)
              </label>
              <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-600 flex items-center justify-between cursor-not-allowed select-none">
                <span>{fmt(openInputCash)}</span>
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Calculé automatiquement : dernier solde de clôture du tiroir, sinon solde du Coffre-Fort.
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Fond Initial Mobile Money MoMo
              </label>
              <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-600 flex items-center justify-between cursor-not-allowed select-none">
                <span>{fmt(openInputMomo)}</span>
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Calculé automatiquement : solde actuel du compte Caisse MoMo marchand.
              </p>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] font-medium flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
              <span>Montants verrouillés, calculés automatiquement. Contactez l'admin en cas d'erreur.</span>
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
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
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
            {/* Information d'automatisation */}
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900">
              <p className="font-medium text-[11px] leading-relaxed">
                Les montants de clôture sont <strong>calculés automatiquement</strong> à partir des opérations réellement enregistrées durant votre session. Aucune saisie financière manuelle n'est requise.
              </p>
            </div>

            {/* Récapitulatif officiel Flux Espèces (Tiroir) */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2 font-mono text-xs shadow-inner">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-sans font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Fond Initial ce matin (Espèces) :
                </span>
                <span className="font-bold text-slate-900">{fmt(fondInitialEspeces)}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-700">
                <span className="font-sans font-medium">+ Entrées de la session (Ventes & Recouvrements Espèces) :</span>
                <span className="font-bold">+{fmt(especesDuJour)}</span>
              </div>
              <div className="flex justify-between items-center text-rose-700">
                <span className="font-sans font-medium">- Dépenses & Versements sortants (Espèces) :</span>
                <span className="font-bold">-{fmt(sumDepensesEspeces + retraitsEspecesJour)}</span>
              </div>
              <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 text-sm">
                <span className="font-sans font-black text-slate-900">= Solde Théorique Final (Espèces) :</span>
                <span className="font-black text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded-lg">{fmt(fondTheoriqueEsp)}</span>
              </div>
            </div>

            {/* Récapitulatif officiel Flux Mobile Money */}
            <div className="bg-amber-50/50 border border-amber-200 p-3.5 rounded-2xl space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center text-amber-900 font-bold font-sans text-xs pb-1 border-b border-amber-200/60">
                <span>Compte Marchand Mobile Money</span>
                <span className="text-[10px] text-amber-700 font-normal">Isolé du tiroir d'espèces</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-sans font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Fond Initial MoMo :
                </span>
                <span className="font-bold text-slate-900">{fmt(fondInitialMomo)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-800">
                <span className="font-sans font-medium">+ Encaissements MoMo :</span>
                <span className="font-bold">+{fmt(momoDuJour)}</span>
              </div>
              {(depensesMomoJour + retraitsMomoJour > 0) && (
                <div className="flex justify-between items-center text-rose-700">
                  <span className="font-sans font-medium">- Sorties MoMo :</span>
                  <span className="font-bold">-{fmt(depensesMomoJour + retraitsMomoJour)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-amber-200 text-xs">
                <span className="font-sans font-black text-amber-900">= Solde Final Mobile Money :</span>
                <span className="font-black text-amber-900">{fmt(fondTheoriqueMomo)}</span>
              </div>
            </div>



            {/* Récapitulatif activité du jour */}
            <div className="p-3 bg-slate-100/70 rounded-xl text-slate-600 flex justify-between items-center text-xs">
              <span className="font-sans font-medium">Activité : {nbVentesDuJour} vente(s) validée(s)</span>
              <span className="font-mono font-bold text-slate-900">CA Total : {fmt(caDuJour)}</span>
            </div>

            {/* Observations facultatives */}
            <div>
              <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                Observations / Remarques (Facultatif)
              </label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Remarques éventuelles de clôture (ex: RAS, fin de vacation normale)..."
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 transition"
                rows={2}
              />
            </div>

            {/* Boutons d'action */}
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
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
                <span>{isOperatingCaisse ? "Clôture & envoi email en cours..." : "Confirmer la Clôture"}</span>
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
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {/* Bouton de renvoi manuel du rapport PDF */}
                <button
                  type="button"
                  onClick={handleSendReportByEmail}
                  disabled={isSendingReportMail}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition disabled:opacity-50"
                  title="Renvoyer le rapport complet avec PDF joint aux destinataires enregistrés (Gmail SMTP)"
                >
                  {isSendingReportMail ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> Renvoyer le PDF
                    </>
                  )}
                </button>
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
      {/* Modal Configuration Destinataires Rapport (Admin / Dirigeant) */}
      <DestinatairesReportModal
        isOpen={showDestinatairesModal}
        onClose={() => setShowDestinatairesModal(false)}
        companyId={currentCompanyId}
        isAdmin={isAdminOrManager}
      />
    </div>
  )
}

export const CaisseOperationnellePage = CaissePage
export default CaissePage
