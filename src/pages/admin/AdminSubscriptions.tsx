// =============================================================================
// GESTIO 229 ADMIN — Gestion des Abonnements Multi-Secteurs & Paiements Manuels
// =============================================================================
// Implémentation complète des Sections 5 et 7 du cahier des charges :
// 1. Visualisation des entreprises et de tous leurs secteurs associés avec statut :
//    - Gratuit (Essai gratuit)
//    - Payant / Actif
//    - En attente de paiement
//    - Expiré
//    - Suspendu
// 2. Actions Super Admin sur un secteur ou l'entreprise entière :
//    - Activer manuellement / Prolonger (1, 2, 3, 4, 6, 12 mois ou toute durée supérieure)
//    - Modifier les dates de début et de fin
//    - Suspendre ou réactiver un abonnement
//    - Enregistrement systématique dans le journal d'audit (admin_audit_logs + subscription_history)
// 3. Validation / Rejet des demandes de paiement manuel (avec aperçu de la preuve et anti-doublon)
// 4. Configuration rapide des coordonnées de paiement manuel
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAdminCompanies } from '../../hooks/useAdminData'
import {
  CreditCard, RefreshCw, Eye, CheckCircle2, XCircle, Clock,
  Shield, Layers, Smartphone, Calendar, PlusCircle, Lock, Unlock,
  Save, AlertCircle, Check
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  listerDemandesPaiementManuel,
  validerDemandePaiementManuel,
  rejeterDemandePaiementManuel,
  activerOuProlongerAbonnement,
  modifierStatutAbonnementSecteur,
  getParametresPaiementManuel,
  sauvegarderParametresPaiementManuel,
  DemandePaiementAbonnement,
  AbonnementGlobalRow,
  AbonnementSecteurRow,
  ParametresPaiementManuel,
  DEFAULT_MANUAL_PAYMENT_SETTINGS,
  toSecteurCode,
  fromSecteurCodeToSlug,
  calcDaysRemaining,
} from '../../services/abonnementService'
import { calculateRenewalDates } from '../../core/subscription/subscriptionEngine'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const AdminSubscriptions: React.FC = () => {
  const { companies, loading, reload } = useAdminCompanies()

  const [activeTab, setActiveTab] = useState<'companies' | 'payments' | 'settings'>('companies')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Données multi-secteurs chargées depuis Supabase
  const [globalsMap, setGlobalsMap] = useState<Record<string, AbonnementGlobalRow>>({})
  const [secteursMap, setSecteursMap] = useState<Record<string, AbonnementSecteurRow[]>>({})
  const [paymentRequests, setPaymentRequests] = useState<DemandePaiementAbonnement[]>([])
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'en_attente' | 'valide' | 'rejete'>('all')
  const [manualSettings, setManualSettings] = useState<ParametresPaiementManuel>(
    DEFAULT_MANUAL_PAYMENT_SETTINGS
  )

  // Modales d'action Super Admin
  const [actionModal, setActionModal] = useState<{
    company: any
    sectorSlug: string // 'all' ou slug spécifique
  } | null>(null)
  const [durationMonths, setDurationMonths] = useState<number>(1)
  const [customDuration, setCustomDuration] = useState<string>('')
  const [amountFcfa, setAmountFcfa] = useState<number>(10000)
  const [paymentMethod, setPaymentMethod] = useState<string>('Dépôt Mobile Money')
  const [paymentRef, setPaymentRef] = useState<string>('')
  const [motif, setMotif] = useState<string>('')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [processingAction, setProcessingAction] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modale de rejet de paiement manuel
  const [rejectModalReq, setRejectModalReq] = useState<DemandePaiementAbonnement | null>(null)
  const [rejectReason, setRejectReason] = useState<string>('')
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null)

  const loadSubscriptionDetails = async () => {
    try {
      const [{ data: gRows }, { data: sRows }, reqs, settings] = await Promise.all([
        supabase.from('abonnements_global').select('*'),
        supabase.from('abonnements_secteurs').select('*').order('created_at', { ascending: true }),
        listerDemandesPaiementManuel(),
        getParametresPaiementManuel(),
      ])

      const gMap: Record<string, AbonnementGlobalRow> = {}
      for (const g of gRows || []) {
        gMap[g.entreprise_id] = g as AbonnementGlobalRow
      }

      const sMap: Record<string, AbonnementSecteurRow[]> = {}
      for (const s of sRows || []) {
        if (!sMap[s.entreprise_id]) sMap[s.entreprise_id] = []
        sMap[s.entreprise_id].push(s as AbonnementSecteurRow)
      }

      setGlobalsMap(gMap)
      setSecteursMap(sMap)
      setPaymentRequests(reqs)
      setManualSettings(settings)
    } catch (err) {
      console.warn('[AdminSubscriptions] Erreur chargement:', err)
    }
  }

  useEffect(() => {
    loadSubscriptionDetails()
  }, [companies.length])

  const handleRefreshAll = async () => {
    reload()
    await loadSubscriptionDetails()
  }

  // Résoudre le statut détaillé d'un secteur pour l'affichage Super Admin (Section 5.1)
  const resolveSectorDisplayStatus = (
    comp: any,
    sectorSlug: string,
    secIndex: number
  ): {
    code: 'gratuit' | 'actif' | 'en_attente' | 'expire' | 'suspendu'
    label: string
    badgeClass: string
    expiresAt: string | null
    daysLeft: number
  } => {
    const g = globalsMap[comp.id]
    const sList = secteursMap[comp.id] || []
    const targetCode = toSecteurCode(sectorSlug)
    const sRow = sList.find((r) => toSecteurCode(r.secteur_code) === targetCode)
    const now = new Date()

    if (comp.subscription_status === 'suspended' || g?.statut_global === 'suspendu' || sRow?.statut_specifique === 'suspendu') {
      return {
        code: 'suspendu',
        label: 'Suspendu',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-600',
        expiresAt: null,
        daysLeft: 0,
      }
    }

    if (sRow?.statut_specifique === 'en_attente_paiement') {
      return {
        code: 'en_attente',
        label: 'En attente de paiement',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        expiresAt: null,
        daysLeft: 0,
      }
    }

    if (sRow?.statut_specifique === 'actif' && !sRow.rattache_au_global && sRow.date_fin_specifique) {
      const fin = new Date(sRow.date_fin_specifique)
      const days = calcDaysRemaining(fin)
      if (fin >= now) {
        return {
          code: 'actif',
          label: `Payant / Actif (${days}j)`,
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          expiresAt: sRow.date_fin_specifique,
          daysLeft: days,
        }
      }
      return {
        code: 'expire',
        label: 'Expiré',
        badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
        expiresAt: sRow.date_fin_specifique,
        daysLeft: 0,
      }
    }

    const finGlobal = g?.date_fin_global
      ? new Date(g.date_fin_global)
      : new Date(new Date(comp.created_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    const daysGlobal = calcDaysRemaining(finGlobal)
    const isGlobalExpired = g?.statut_global === 'expire' || finGlobal < now

    if ((g?.statut_global === 'essai' || comp.subscription_status === 'trial') && secIndex >= 3) {
      return {
        code: 'en_attente',
        label: 'En attente de paiement (>3)',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        expiresAt: null,
        daysLeft: 0,
      }
    }

    if (isGlobalExpired) {
      return {
        code: 'expire',
        label: 'Expiré',
        badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
        expiresAt: finGlobal.toISOString(),
        daysLeft: 0,
      }
    }

    if (g?.statut_global === 'actif' || comp.subscription_status === 'active') {
      return {
        code: 'actif',
        label: `Payant / Actif (${daysGlobal}j)`,
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        expiresAt: finGlobal.toISOString(),
        daysLeft: daysGlobal,
      }
    }

    return {
      code: 'gratuit',
      label: `Essai gratuit (${daysGlobal}j)`,
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      expiresAt: finGlobal.toISOString(),
      daysLeft: daysGlobal,
    }
  }

  const openActivationModal = (comp: any, sectorSlug: string = 'all') => {
    const g = globalsMap[comp.id]
    const sList = secteursMap[comp.id] || []
    let currentExp: string | null = null
    if (sectorSlug === 'all' && g?.statut_global === 'actif') {
      currentExp = g.date_fin_global
    } else if (sectorSlug !== 'all') {
      const sRow = sList.find((r) => toSecteurCode(r.secteur_code) === toSecteurCode(sectorSlug))
      if (sRow?.statut_specifique === 'actif' && sRow.date_fin_specifique) {
        currentExp = sRow.date_fin_specifique
      }
    }

    const dates = calculateRenewalDates(currentExp, 1, new Date())
    setActionModal({ company: comp, sectorSlug })
    setDurationMonths(1)
    setCustomDuration('')
    setAmountFcfa(sectorSlug === 'all' ? 10000 : 5000)
    setPaymentMethod('Dépôt Mobile Money')
    setPaymentRef('')
    setMotif('Activation / Prolongation manuelle par Super Admin')
    setCustomStartDate(dates.effectiveStartDate.toISOString().slice(0, 10))
    setCustomEndDate(dates.newExpirationDate.toISOString().slice(0, 10))
  }

  const handleDurationSelect = (months: number) => {
    setDurationMonths(months)
    if (!actionModal) return
    const g = globalsMap[actionModal.company.id]
    const sList = secteursMap[actionModal.company.id] || []
    let currentExp: string | null = null
    if (actionModal.sectorSlug === 'all' && g?.statut_global === 'actif') {
      currentExp = g.date_fin_global
    } else if (actionModal.sectorSlug !== 'all') {
      const sRow = sList.find(
        (r) => toSecteurCode(r.secteur_code) === toSecteurCode(actionModal.sectorSlug)
      )
      if (sRow?.statut_specifique === 'actif' && sRow.date_fin_specifique) {
        currentExp = sRow.date_fin_specifique
      }
    }
    const dates = calculateRenewalDates(currentExp, months, new Date())
    setCustomStartDate(dates.effectiveStartDate.toISOString().slice(0, 10))
    setCustomEndDate(dates.newExpirationDate.toISOString().slice(0, 10))
    const unit = actionModal.sectorSlug === 'all' ? 10000 : 5000
    setAmountFcfa(unit * months)
  }

  const handleConfirmManualActivation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionModal) return
    setProcessingAction(true)
    setFeedback(null)

    const res = await activerOuProlongerAbonnement({
      entrepriseId: actionModal.company.id,
      companyName: actionModal.company.name,
      sectorSlug: actionModal.sectorSlug,
      dureeMois: durationMonths,
      planCode: actionModal.sectorSlug === 'all' ? 'entreprise' : 'secteur',
      montantFcfa: amountFcfa,
      modePaiement: paymentMethod,
      referencePaiement: paymentRef,
      motif: motif || 'Activation manuelle par Super Admin',
      performedBy: 'Super Admin',
      customStartDate: customStartDate ? new Date(customStartDate).toISOString() : undefined,
      customEndDate: customEndDate ? new Date(`${customEndDate}T23:59:59`).toISOString() : undefined,
    })

    setProcessingAction(false)
    if (res.success) {
      setFeedback({
        type: 'success',
        text: `Abonnement activé / prolongé avec succès pour ${actionModal.company.name} (${
          actionModal.sectorSlug === 'all' ? 'Global' : actionModal.sectorSlug.toUpperCase()
        }) jusqu'au ${res.dateFin.toLocaleDateString('fr-FR')}.`,
      })
      setActionModal(null)
      await handleRefreshAll()
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Erreur lors de l\'activation.',
      })
    }
  }

  const handleQuickStatusChange = async (
    comp: any,
    sectorSlug: string,
    nouveauStatut: 'actif' | 'en_attente_paiement' | 'expire' | 'suspendu'
  ) => {
    setProcessingAction(true)
    const res = await modifierStatutAbonnementSecteur({
      entrepriseId: comp.id,
      companyName: comp.name,
      sectorSlug,
      nouveauStatut,
      motif: `Modification directe du statut (${nouveauStatut}) par Super Admin`,
      performedBy: 'Super Admin',
    })
    setProcessingAction(false)
    if (res.success) {
      setFeedback({
        type: 'success',
        text: `Statut mis à jour (${nouveauStatut}) pour ${comp.name}.`,
      })
      await handleRefreshAll()
    }
  }

  const handleApprovePaymentRequest = async (req: DemandePaiementAbonnement) => {
    setProcessingAction(true)
    setFeedback(null)
    const res = await validerDemandePaiementManuel(req.id, 'Super Admin', 'Dépôt vérifié et validé')
    setProcessingAction(false)
    if (res.success) {
      setFeedback({
        type: 'success',
        text: `Paiement de ${req.total_amount.toLocaleString('fr-FR')} FCFA validé pour ${req.company_name}. Abonnement actif jusqu'au ${res.dateFin?.toLocaleDateString('fr-FR')}.`,
      })
      await handleRefreshAll()
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Erreur lors de la validation du paiement.',
      })
    }
  }

  const handleRejectPaymentRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectModalReq || !rejectReason.trim()) return
    setProcessingAction(true)
    setFeedback(null)
    const res = await rejeterDemandePaiementManuel(rejectModalReq.id, rejectReason.trim(), 'Super Admin')
    setProcessingAction(false)
    if (res.success) {
      setFeedback({
        type: 'success',
        text: `La demande de paiement de ${rejectModalReq.company_name} a été rejetée et l'utilisateur a été notifié.`,
      })
      setRejectModalReq(null)
      setRejectReason('')
      await handleRefreshAll()
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Erreur lors du rejet.',
      })
    }
  }

  const handleSaveManualSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcessingAction(true)
    setFeedback(null)
    const res = await sauvegarderParametresPaiementManuel(manualSettings, 'Super Admin')
    setProcessingAction(false)
    if (res.success) {
      setFeedback({
        type: 'success',
        text: 'Coordonnées de paiement manuel mises à jour avec succès.',
      })
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Erreur lors de la sauvegarde.',
      })
    }
  }

  const pendingPaymentsCount = paymentRequests.filter((r) => r.status === 'en_attente').length
  const filteredPayments =
    paymentFilter === 'all'
      ? paymentRequests
      : paymentRequests.filter((r) => r.status === paymentFilter)

  const filteredCompanies = companies.filter((c) => {
    if (statusFilter === 'all') return true
    const g = globalsMap[c.id]
    const s = c.subscription_status || 'trial'
    if (statusFilter === 'active') return s === 'active' || g?.statut_global === 'actif'
    if (statusFilter === 'trial') return s === 'trial' && g?.statut_global !== 'expire'
    if (statusFilter === 'expired') return s === 'expired' || g?.statut_global === 'expire'
    if (statusFilter === 'pending') {
      const sList = secteursMap[c.id] || []
      return sList.some((r) => r.statut_specifique === 'en_attente_paiement')
    }
    return true
  })

  return (
    <div className="space-y-5 pb-12">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">
            Gestion des Abonnements Multi-Secteurs
          </h1>
          <p className="text-slate-400 text-sm">
            Contrôle par secteur (Essai gratuit, Actif, En attente de paiement, Expiré), validation des dépôts manuels et prolongations
          </p>
        </div>
        <button
          onClick={handleRefreshAll}
          className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Navigation par onglets Super Admin */}
      <div className="flex flex-wrap gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
        <button
          onClick={() => setActiveTab('companies')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'companies'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Entreprises & Secteurs ({companies.length})
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'payments'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Demandes de Paiement Manuel ({paymentRequests.length})
          {pendingPaymentsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">
              {pendingPaymentsCount} en attente
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'settings'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Coordonnées de Dépôt Manuel
        </button>
      </div>

      {/* ONGLET 1 : ENTREPRISES & SECTEURS (Section 5.1 & 5.2) */}
      {activeTab === 'companies' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
            {[
              { key: 'all', label: 'Toutes les entreprises' },
              { key: 'active', label: '🟢 Payant / Actif' },
              { key: 'trial', label: '🔵 Essai gratuit' },
              { key: 'pending', label: '🟠 Secteurs en attente de paiement' },
              { key: 'expired', label: '🔴 Expiré' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === key
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCompanies.map((c) => {
                const rawSectors: string[] = Array.isArray(c.selected_sectors) && c.selected_sectors.length > 0
                  ? c.selected_sectors
                  : Array.isArray(c.sectors) && c.sectors.length > 0
                  ? c.sectors
                  : c.active_sector
                  ? [c.active_sector]
                  : []
                const dbSectors = (secteursMap[c.id] || []).map((r) =>
                  fromSecteurCodeToSlug(r.secteur_code)
                )
                const allCompanySectors = Array.from(
                  new Set(
                    [...rawSectors, ...dbSectors]
                      .map((s) => fromSecteurCodeToSlug(s))
                      .filter(Boolean)
                  )
                )
                const g = globalsMap[c.id]

                return (
                  <div
                    key={c.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-white font-bold text-base">{c.name}</h3>
                          <span className="text-xs text-slate-400">{c.email}</span>
                          <span className="text-xs text-slate-500">• {c.phone || 'Sans tél.'}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Inscrit le {formatDate(c.created_at)} •{' '}
                          <strong className="text-slate-200">
                            {allCompanySectors.length} secteur(s)
                          </strong>{' '}
                          • Échéance globale :{' '}
                          <strong className="text-emerald-400">
                            {formatDate(g?.date_fin_global)}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openActivationModal(c, 'all')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Activer / Prolonger Global
                        </button>

                        <Link
                          to={`/admin/companies/${c.id}`}
                          className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Fiche complète
                        </Link>
                      </div>
                    </div>

                    {/* Liste détaillée des secteurs de l'entreprise (Section 5.1) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {allCompanySectors.map((slug, idx) => {
                        const st = resolveSectorDisplayStatus(c, slug, idx)
                        return (
                          <div
                            key={slug}
                            className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between gap-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-bold text-white uppercase">{slug}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {st.expiresAt
                                    ? `Expire le ${formatDate(st.expiresAt)}`
                                    : 'Aucun abonnement payé'}
                                </p>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.badgeClass}`}
                              >
                                {st.label}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-800/80 flex-wrap">
                              <button
                                type="button"
                                onClick={() => openActivationModal(c, slug)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition"
                                title="Activer, renouveler ou modifier les dates d'expiration"
                              >
                                Activer / Modifier
                              </button>

                              <div className="flex items-center gap-1">
                                {st.code === 'suspendu' ? (
                                  <button
                                    type="button"
                                    disabled={processingAction}
                                    onClick={() => handleQuickStatusChange(c, slug, 'actif')}
                                    className="px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] font-semibold flex items-center gap-1"
                                    title="Réactiver ce secteur"
                                  >
                                    <Unlock className="w-3 h-3" />
                                    Réactiver
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={processingAction}
                                    onClick={() => handleQuickStatusChange(c, slug, 'suspendu')}
                                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-amber-950/60 text-slate-400 hover:text-amber-300 text-[10px] font-semibold flex items-center gap-1"
                                    title="Suspendre l'accès à ce secteur"
                                  >
                                    <Lock className="w-3 h-3" />
                                    Suspendre
                                  </button>
                                )}

                                {st.code !== 'expire' && st.code !== 'en_attente' && (
                                  <button
                                    type="button"
                                    disabled={processingAction}
                                    onClick={() => handleQuickStatusChange(c, slug, 'expire')}
                                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 text-[10px] font-semibold flex items-center gap-1"
                                    title="Désactiver / Marquer comme expiré"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Désactiver
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ONGLET 2 : DEMANDES DE PAIEMENT MANUEL (Section 7.2 & 7.3) */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
            {[
              { key: 'all', label: `Toutes (${paymentRequests.length})` },
              {
                key: 'en_attente',
                label: `🟠 En attente de validation (${pendingPaymentsCount})`,
              },
              {
                key: 'valide',
                label: `🟢 Validées (${paymentRequests.filter((r) => r.status === 'valide').length})`,
              },
              {
                key: 'rejete',
                label: `🔴 Rejetées (${paymentRequests.filter((r) => r.status === 'rejete').length})`,
              },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPaymentFilter(key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  paymentFilter === key
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {filteredPayments.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                Aucune demande de paiement manuel dans cette catégorie.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Entreprise</th>
                      <th className="py-3 px-4">Secteur(s)</th>
                      <th className="py-3 px-4">Durée</th>
                      <th className="py-3 px-4">Montant</th>
                      <th className="py-3 px-4">Dépôt / Réf.</th>
                      <th className="py-3 px-4">Preuve</th>
                      <th className="py-3 px-4">Statut / Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredPayments.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          {formatDate(req.created_at)}
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{req.company_name}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {req.sector_slug === 'all'
                            ? 'Global (Tous secteurs)'
                            : `Secteur ${req.sector_slug.toUpperCase()}`}
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">
                          {req.duration_months} mois
                        </td>
                        <td className="py-3 px-4 font-extrabold text-emerald-400">
                          {req.total_amount.toLocaleString('fr-FR')} FCFA
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div>{req.payment_operator}</div>
                          <div className="font-mono text-[11px] text-emerald-300">
                            Réf: {req.transaction_reference}
                          </div>
                          {req.payer_phone && (
                            <div className="text-[11px] text-slate-400">Tél: {req.payer_phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {req.proof_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewProofUrl(req.proof_url)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Voir capture
                            </button>
                          ) : (
                            <span className="text-slate-500">Sans capture</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {req.status === 'en_attente' ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={processingAction}
                                onClick={() => handleApprovePaymentRequest(req)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Valider
                              </button>
                              <button
                                type="button"
                                disabled={processingAction}
                                onClick={() => {
                                  setRejectModalReq(req)
                                  setRejectReason('')
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 font-bold text-[11px]"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Rejeter
                              </button>
                            </div>
                          ) : req.status === 'valide' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Validé
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-bold text-[11px]">
                                <XCircle className="w-3.5 h-3.5" />
                                Rejeté
                              </span>
                              {req.rejection_reason && (
                                <p className="text-[10px] text-red-300 mt-1">
                                  Motif : {req.rejection_reason}
                                </p>
                              )}
                            </div>
                          )}
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

      {/* ONGLET 3 : CONFIGURATION DES COORDONNÉES DE PAIEMENT MANUEL (Section 7.1) */}
      {activeTab === 'settings' && (
        <form
          onSubmit={handleSaveManualSettings}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-3xl space-y-4"
        >
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            Paramètres du Paiement Manuel (Modifiables sans changer le code)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Numéro de téléphone destiné aux dépôts *
              </label>
              <input
                type="text"
                required
                value={manualSettings.deposit_phone}
                onChange={(e) =>
                  setManualSettings((p) => ({ ...p, deposit_phone: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nom du titulaire / bénéficiaire *
              </label>
              <input
                type="text"
                required
                value={manualSettings.beneficiary_name}
                onChange={(e) =>
                  setManualSettings((p) => ({ ...p, beneficiary_name: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Service de paiement / Opérateur *
              </label>
              <input
                type="text"
                required
                value={manualSettings.payment_operator}
                onChange={(e) =>
                  setManualSettings((p) => ({ ...p, payment_operator: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Numéro WhatsApp pour recevoir les preuves *
              </label>
              <input
                type="text"
                required
                value={manualSettings.whatsapp_number}
                onChange={(e) =>
                  setManualSettings((p) => ({ ...p, whatsapp_number: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Instructions de paiement affichées à l'utilisateur *
            </label>
            <textarea
              rows={3}
              required
              value={manualSettings.payment_instructions}
              onChange={(e) =>
                setManualSettings((p) => ({ ...p, payment_instructions: e.target.value }))
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={processingAction}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Save className="w-4 h-4" />
              Enregistrer les coordonnées
            </button>
          </div>
        </form>
      )}

      {/* MODALE D'ACTIVATION / PROLONGATION MANUELLE (Section 5.2 & 5.3) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <form
            onSubmit={handleConfirmManualActivation}
            className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  Activer / Prolonger un abonnement
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Entreprise : <strong className="text-white">{actionModal.company.name}</strong> •{' '}
                  Portée :{' '}
                  <strong className="text-emerald-400">
                    {actionModal.sectorSlug === 'all'
                      ? 'Tous les secteurs (Global)'
                      : `Secteur ${actionModal.sectorSlug.toUpperCase()}`}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Sélection rapide de la durée : 1, 2, 3, 4, 6, 12 mois ou personnalisée */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Durée d'abonnement (1, 2, 3, 4 mois ou plus)
              </label>
              <div className="grid grid-cols-6 gap-2 mb-2">
                {[1, 2, 3, 4, 6, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setCustomDuration('')
                      handleDurationSelect(m)
                    }}
                    className={`py-2 rounded-xl border text-xs font-bold ${
                      durationMonths === m && !customDuration
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    {m} mois
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Autre durée (mois) :</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  placeholder="Ex: 5"
                  value={customDuration}
                  onChange={(e) => {
                    setCustomDuration(e.target.value)
                    const n = parseInt(e.target.value, 10)
                    if (!isNaN(n) && n >= 1) handleDurationSelect(n)
                  }}
                  className="w-24 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date de début
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date de fin (calculée auto)
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Montant associé (FCFA)
                </label>
                <input
                  type="number"
                  min={0}
                  value={amountFcfa}
                  onChange={(e) => setAmountFcfa(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Référence de paiement
                </label>
                <input
                  type="text"
                  placeholder="Ex: Reçu MoMo / Espèces"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Motif de l'opération (Traçabilité Audit) *
              </label>
              <input
                type="text"
                required
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={processingAction}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                {processingAction ? 'Validation...' : 'Confirmer et Activer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODALE DE REJET D'UNE DEMANDE DE PAIEMENT MANUEL */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <form
            onSubmit={handleRejectPaymentRequest}
            className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              Rejeter la demande de paiement
            </h3>
            <p className="text-xs text-slate-300">
              Entreprise : <strong>{rejectModalReq.company_name}</strong> ({rejectModalReq.total_amount.toLocaleString('fr-FR')} FCFA).
              L'abonnement ne sera pas activé et l'utilisateur recevra une notification avec le motif ci-dessous.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Motif du rejet *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Ex: Référence de transaction introuvable ou montant reçu incomplet..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalReq(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={processingAction}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
              >
                Confirmer le rejet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODALE D'APERÇU DE PREUVE DE PAIEMENT */}
      {previewProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
          onClick={() => setPreviewProofUrl(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Preuve de paiement soumise</h3>
              <button
                type="button"
                onClick={() => setPreviewProofUrl(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Fermer
              </button>
            </div>
            <img
              src={previewProofUrl}
              alt="Preuve de paiement"
              className="w-full max-h-[70vh] object-contain rounded-xl bg-slate-950"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminSubscriptions
