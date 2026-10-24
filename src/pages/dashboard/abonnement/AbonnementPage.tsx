// =============================================================================
// GESTIO 229 SaaS — PAGE MON ABONNEMENT & RÉABONNEMENT (Refonte V4)
// =============================================================================
// Implémentation complète des Sections 6, 7, 8, 9, 10, 12 et 13 :
// - Conservation du design et de la structure existante
// - Choix de la portée : Abonnement Global (tous secteurs) ou Secteur spécifique
// - Choix de la durée : 1, 2, 3, 4, 6, 12 mois ou toute durée supérieure personnalisée
// - Récapitulatif complet avant paiement : Secteur(s), Durée, Prix applicable,
//   Remises, Montant total, Date de début prévue, Date de fin prévue
// - Deux modes de paiement :
//   1. « Manuel » : Infos configurées par le Super Admin + Bouton WhatsApp +
//      Formulaire de soumission avec upload direct de preuve/capture -> « En attente de validation »
//   2. « Automatique » : Message officiel « Le paiement automatique sera bientôt disponible... »
// - Suivi des demandes de paiement (En attente, Validé, Rejeté) et Notifications
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  CreditCard, CheckCircle2, Sparkles, ShieldCheck, Calendar,
  Building2, Smartphone, RefreshCw, AlertCircle, Lock, Unlock,
  Clock, Upload, MessageSquare, Send, Eye, XCircle, Bell, Check, Info, Layers
} from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import {
  calculateSubscriptionPrice,
  calculateDurationPrice,
  calculateRenewalDates,
  getSectorFeatureInfo,
  EXTRA_SECTOR_MONTHLY_PRICE,
  SINGLE_SECTOR_ENTERPRISE_PRICE,
  SINGLE_SECTOR_STARTER_PRICE,
} from '../../../core/subscription/subscriptionEngine'
import { SECTORS_LIST } from '../../../components/auth/SectorSelector'
import {
  verifierOuCreerAbonnementGlobal,
  chargerTousStatutsSecteurs,
  getParametresPaiementManuel,
  soumettreDemandePaiementManuel,
  listerDemandesPaiementManuel,
  listerNotificationsAbonnement,
  marquerNotificationAbonnementLue,
  AbonnementGlobalRow,
  VerificationAccesSecteurResult,
  ParametresPaiementManuel,
  DemandePaiementAbonnement,
  SubscriptionNotificationItem,
  canonicalSectorSlug,
} from '../../../services/abonnementService'
import {
  AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE,
  initiateAutomaticSubscriptionPayment,
} from '../../../services/payment/paymentGatewayService'

const PRESET_DURATIONS = [1, 2, 3, 4, 6, 12]

export const AbonnementPage: React.FC = () => {
  const { sectorSlug: routeSectorSlug } = useParams<{ sectorSlug?: string }>()
  const { company } = useAuthStore()

  // Secteurs de l'entreprise
  const currentSectors: string[] = useMemo(() => {
    const raw =
      company?.selected_sectors?.length
        ? company.selected_sectors
        : company?.sectors?.length
        ? company.sectors
        : company?.active_sector
        ? [company.active_sector]
        : ['boutique']
    return Array.from(new Set(raw.map((s: string) => canonicalSectorSlug(s)).filter(Boolean)))
  }, [company])

  // États chargés depuis Supabase
  const [globalSub, setGlobalSub] = useState<AbonnementGlobalRow | null>(null)
  const [secteursStatus, setSecteursStatus] = useState<Record<string, VerificationAccesSecteurResult>>({})
  const [manualSettings, setManualSettings] = useState<ParametresPaiementManuel | null>(null)
  const [paymentRequests, setPaymentRequests] = useState<DemandePaiementAbonnement[]>([])
  const [notifications, setNotifications] = useState<SubscriptionNotificationItem[]>([])
  const [loadingSubData, setLoadingSubData] = useState(true)

  // Configuration du réabonnement (Section 6)
  // Cible : 'all' (Global) ou un slug de secteur spécifique
  const [targetScope, setTargetScope] = useState<string>(() => {
    if (routeSectorSlug) return canonicalSectorSlug(routeSectorSlug)
    return 'all'
  })
  const [singleTier, setSingleTier] = useState<'starter' | 'entreprise'>(
    company?.subscription_plan === 'starter' ? 'starter' : 'entreprise'
  )
  const [durationMonths, setDurationMonths] = useState<number>(1)
  const [customDurationInput, setCustomDurationInput] = useState<string>('')

  // Mode de paiement sélectionné : 'manuel' | 'automatique' | null
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'manuel' | 'automatique' | null>('manuel')
  const [autoPaymentMessage, setAutoPaymentMessage] = useState<string | null>(null)

  // Formulaire de paiement manuel (Section 7.2)
  const [payerPhone, setPayerPhone] = useState(company?.phone || '')
  const [selectedOperator, setSelectedOperator] = useState('MTN Mobile Money')
  const [transactionRef, setTransactionRef] = useState('')
  const [proofDataUrl, setProofDataUrl] = useState<string>('')
  const [proofFileName, setProofFileName] = useState<string>('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null)

  const loadAllSubscriptionData = async () => {
    if (!company?.id) return
    setLoadingSubData(true)
    try {
      const [g, sMap, settings, reqs, notifs] = await Promise.all([
        verifierOuCreerAbonnementGlobal(company.id, company.created_at),
        chargerTousStatutsSecteurs(company.id, currentSectors, company.created_at),
        getParametresPaiementManuel(),
        listerDemandesPaiementManuel({ companyId: company.id }),
        listerNotificationsAbonnement(company.id),
      ])
      setGlobalSub(g)
      setSecteursStatus(sMap)
      setManualSettings(settings)
      setPaymentRequests(reqs)
      setNotifications(notifs)

      // Si le secteur courant de l'URL est en attente de paiement ou expiré, le présélectionner
      if (routeSectorSlug) {
        const cleanRoute = canonicalSectorSlug(routeSectorSlug)
        const st = sMap[cleanRoute]
        if (st && !st.autorise) {
          setTargetScope(cleanRoute)
        }
      }
    } finally {
      setLoadingSubData(false)
    }
  }

  useEffect(() => {
    loadAllSubscriptionData()
  }, [company?.id, currentSectors.join(',')])

  // Calcul du tarif mensuel applicable selon la portée choisie (Section 6.1 & 9)
  const pricingSummary = useMemo(() => {
    if (targetScope === 'all') {
      const calc = calculateSubscriptionPrice(currentSectors.length, singleTier)
      return {
        scopeLabel:
          currentSectors.length > 1
            ? `Abonnement Global (${currentSectors.length} secteurs)`
            : `Secteur ${SECTORS_LIST.find((s) => s.slug === currentSectors[0])?.name || currentSectors[0]?.toUpperCase()}`,
        sectorsCovered: currentSectors,
        planSlug: calc.planSlug,
        planName: calc.planName,
        monthlyPrice: calc.priceMonthly,
        breakdown: calc.breakdown,
      }
    }

    // Abonnement pour un secteur spécifique
    const secMeta = SECTORS_LIST.find((s) => s.slug === targetScope)
    const secName = secMeta?.name || targetScope.toUpperCase()
    const isGlobalInActiveTrial =
      globalSub?.statut_global === 'essai' && new Date(globalSub.date_fin_global) > new Date()
    const secState = secteursStatus[targetScope]

    // Si c'est un secteur supplémentaire au-delà des 3 secteurs d'essai gratuit (ou si l'entreprise a déjà >= 3 secteurs actifs)
    const activeSectorsCount = Object.values(secteursStatus).filter((s) => s.autorise).length
    let unitMonthly = SINGLE_SECTOR_ENTERPRISE_PRICE

    if (currentSectors.length === 1 && singleTier === 'starter') {
      unitMonthly = SINGLE_SECTOR_STARTER_PRICE
    } else if (
      (isGlobalInActiveTrial && secState?.statutEffectif === 'en_attente_paiement') ||
      activeSectorsCount >= 3
    ) {
      unitMonthly = EXTRA_SECTOR_MONTHLY_PRICE
    } else if (activeSectorsCount === 1) {
      unitMonthly = 5000 // Passage de 1 secteur (10 000 F) à 2 secteurs (15 000 F) = +5 000 F
    } else if (activeSectorsCount === 2) {
      unitMonthly = 10000 // Passage de 2 secteurs (15 000 F) à 3 secteurs (25 000 F) = +10 000 F
    }

    return {
      scopeLabel: `Secteur : ${secName}`,
      sectorsCovered: [targetScope],
      planSlug: currentSectors.length === 1 && singleTier === 'starter' ? 'starter' : 'entreprise',
      planName: `Abonnement Secteur — ${secName}`,
      monthlyPrice: unitMonthly,
      breakdown: `Activation / renouvellement du secteur ${secName} (${unitMonthly.toLocaleString('fr-FR')} FCFA / mois)`,
    }
  }, [targetScope, currentSectors, singleTier, globalSub, secteursStatus])

  // Calcul selon la durée choisie (1, 2, 3, 4, 6, 12 ou durée personnalisée >= 1 mois)
  const durationCalc = useMemo(
    () => calculateDurationPrice(pricingSummary.monthlyPrice, durationMonths),
    [pricingSummary.monthlyPrice, durationMonths]
  )

  // Calcul des dates de début et de fin prévues (Section 6.2 & Section 10)
  const expectedDates = useMemo(() => {
    let currentExp: Date | null = null
    if (targetScope === 'all') {
      if (globalSub?.statut_global === 'actif' && globalSub.date_fin_global) {
        currentExp = new Date(globalSub.date_fin_global)
      }
    } else {
      const st = secteursStatus[targetScope]
      if (st?.statutEffectif === 'actif' && st.dateFinEffective) {
        currentExp = st.dateFinEffective
      }
    }
    return calculateRenewalDates(currentExp, durationMonths, new Date())
  }, [targetScope, globalSub, secteursStatus, durationMonths])

  // Jours restants globaux
  const globalDaysRemaining = useMemo(() => {
    if (!globalSub?.date_fin_global) return 0
    const diff = new Date(globalSub.date_fin_global).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [globalSub])

  const handleProofFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      setSubmitFeedback({
        type: 'error',
        text: 'Le fichier de preuve ne doit pas dépasser 4 Mo.',
      })
      return
    }
    setProofFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProofDataUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSelectAutomaticPayment = async () => {
    setSelectedPaymentMode('automatique')
    setSubmitFeedback(null)
    if (!company?.id) return
    const res = await initiateAutomaticSubscriptionPayment({
      companyId: company.id,
      companyName: company.name,
      sectorSlug: targetScope,
      durationMonths,
      amountFcfa: durationCalc.netTotal,
      payerPhone,
    })
    setAutoPaymentMessage(res.message || AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE)
  }

  const handleSubmitManualPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) return

    setSubmittingPayment(true)
    setSubmitFeedback(null)

    try {
      const res = await soumettreDemandePaiementManuel({
        companyId: company.id,
        companyName: company.name,
        sectorSlug: targetScope,
        sectorsCovered: pricingSummary.sectorsCovered,
        planSlug: pricingSummary.planSlug,
        durationMonths,
        unitPriceMonthly: pricingSummary.monthlyPrice,
        discountAmount: durationCalc.discountAmount,
        totalAmount: durationCalc.netTotal,
        paymentOperator: selectedOperator,
        payerPhone,
        transactionReference: transactionRef,
        proofDataUrl,
        notes: paymentNotes,
        expectedStartAt: expectedDates.effectiveStartDate.toISOString(),
        expectedEndAt: expectedDates.newExpirationDate.toISOString(),
      })

      if (!res.success) {
        setSubmitFeedback({
          type: 'error',
          text: res.error || 'Impossible d\'enregistrer la demande de paiement.',
        })
      } else {
        setSubmitFeedback({
          type: 'success',
          text: `Votre demande de validation de paiement (${durationCalc.netTotal.toLocaleString('fr-FR')} FCFA pour ${durationMonths} mois) a été enregistrée avec le statut « En attente de validation ». Votre abonnement sera activé dès vérification par l'administration.`,
        })
        setTransactionRef('')
        setProofDataUrl('')
        setProofFileName('')
        setPaymentNotes('')
        await loadAllSubscriptionData()
      }
    } catch (err: any) {
      setSubmitFeedback({
        type: 'error',
        text: err?.message || 'Erreur lors de l\'envoi de la demande.',
      })
    } finally {
      setSubmittingPayment(false)
    }
  }

  const buildWhatsAppProofLink = () => {
    const rawWhatsapp = manualSettings?.whatsapp_number || '+2290197000000'
    const cleanDigits = rawWhatsapp.replace(/[^0-9]/g, '')
    const msg = encodeURIComponent(
      `Bonjour Administration GESTIO 229,\n\n` +
        `Voici ma preuve de paiement d'abonnement :\n` +
        `• Entreprise : ${company?.name || ''}\n` +
        `• Portée : ${pricingSummary.scopeLabel}\n` +
        `• Durée : ${durationMonths} mois\n` +
        `• Montant : ${durationCalc.netTotal.toLocaleString('fr-FR')} FCFA\n` +
        `• Référence transaction : ${transactionRef || 'Voir capture jointe'}\n` +
        `• Téléphone déposant : ${payerPhone || company?.phone || ''}`
    )
    return `https://wa.me/${cleanDigits}?text=${msg}`
  }

  const unreadNotifs = notifications.filter((n) => !n.is_read)

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* 1. Bandeau d'En-tête : Abonnement Global & Essai Gratuit (3 Secteurs Max) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-white">
                  Abonnement Global & Secteurs d'Activité
                </h1>
                {globalSub?.statut_global === 'essai' && globalDaysRemaining > 0 ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Essai Gratuit Unique (Max 3 secteurs) • {globalDaysRemaining} jour(s) restant(s)
                  </span>
                ) : globalSub?.statut_global === 'actif' && globalDaysRemaining > 0 ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Abonnement Global Actif • {globalDaysRemaining} jour(s) restant(s)
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                    Période globale expirée — Renouvellement requis
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Entreprise : <strong className="text-slate-200">{company?.name}</strong> •{' '}
                {currentSectors.length} secteur(s) rattaché(s)
              </p>
              {globalSub && (
                <p className="text-xs text-emerald-400/90 mt-1 font-medium">
                  Période globale : du{' '}
                  {new Date(globalSub.date_debut_global).toLocaleDateString('fr-FR')} au{' '}
                  {new Date(globalSub.date_fin_global).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-5 py-3 text-right">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">
              Montant Total ({durationMonths} mois)
            </p>
            <p className="text-2xl font-extrabold text-emerald-400">
              {durationCalc.netTotal.toLocaleString('fr-FR')}{' '}
              <span className="text-xs font-normal text-slate-400">FCFA</span>
            </p>
            <p className="text-[11px] text-slate-500">{pricingSummary.scopeLabel}</p>
          </div>
        </div>
      </div>

      {/* Notifications d'abonnement non lues (Section 13) */}
      {unreadNotifs.length > 0 && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications d'abonnement ({unreadNotifs.length})
            </h3>
          </div>
          <div className="space-y-2">
            {unreadNotifs.slice(0, 3).map((n) => (
              <div
                key={n.id}
                className="flex items-start justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs"
              >
                <div>
                  <p className="font-bold text-white">{n.title}</p>
                  <p className="text-slate-300 mt-0.5">{n.message}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await marquerNotificationAbonnementLue(n.id)
                    setNotifications((prev) =>
                      prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
                    )
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] shrink-0"
                >
                  Marquer lu
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Tableau d'état des secteurs de l'entreprise (Section 12) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              État des Abonnements par Secteur ({currentSectors.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              L'essai gratuit initial de 30 jours couvre au maximum vos 3 premiers secteurs. Cliquez sur un secteur pour l'activer ou le prolonger individuellement.
            </p>
          </div>
          {loadingSubData && <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentSectors.map((slug) => {
            const secMeta = SECTORS_LIST.find((s) => s.slug === slug)
            const st = secteursStatus[slug]
            const Icon = secMeta?.icon || Building2
            const isSelectedTarget = targetScope === slug

            const badgeColors: Record<string, string> = {
              emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
              blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
              amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
              red: 'bg-red-500/15 text-red-300 border-red-500/30',
              slate: 'bg-slate-800 text-slate-400 border-slate-700',
            }

            return (
              <div
                key={slug}
                onClick={() => setTargetScope(slug)}
                className={`cursor-pointer p-4 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                  isSelectedTarget
                    ? 'bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500'
                    : st?.statutEffectif === 'en_attente_paiement'
                    ? 'bg-amber-950/15 border-amber-500/30 hover:border-amber-500/60'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${
                        secMeta?.color || 'from-emerald-500 to-teal-600'
                      } flex items-center justify-center shrink-0`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {secMeta?.name || slug.toUpperCase()}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {st?.statutEffectif === 'essai_gratuit'
                          ? 'Couvert par l\'essai gratuit (30j)'
                          : st?.statutEffectif === 'actif'
                          ? st.rattacheAuGlobal
                            ? 'Couvert par l\'abonnement global'
                            : 'Abonnement sectoriel actif'
                          : st?.statutEffectif === 'en_attente_paiement'
                          ? 'En attente d\'activation'
                          : 'Abonnement expiré'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      badgeColors[st?.badgeColor || 'slate']
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {st?.badgeLabel || 'Chargement...'}
                  </span>

                  <div className="text-right">
                    {st?.dateFinEffective ? (
                      <span className="text-[11px] text-slate-400 block">
                        Échéance : {st.dateFinEffective.toLocaleDateString('fr-FR')} ({st.joursRestants}j)
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-400 font-semibold block">
                        Activer ce secteur →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. Grille Principale : Configuration de la Durée & Récapitulatif + Paiement Manuel / Automatique */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne Gauche (2/3) : Portée, Formule et Durée */}
        <div className="lg:col-span-2 space-y-6">
          {/* 3.1 Sélection de la portée (Global vs Secteur spécifique) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              1. Choisissez le périmètre de l'abonnement
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Vous pouvez souscrire ou prolonger l'abonnement global (tous vos secteurs) ou activer un secteur spécifique.
            </p>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setTargetScope('all')}
                className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                  targetScope === 'all'
                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                Tous mes secteurs ({currentSectors.length}) — Formule Globale
              </button>

              {currentSectors.map((slug) => {
                const secMeta = SECTORS_LIST.find((s) => s.slug === slug)
                const st = secteursStatus[slug]
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => setTargetScope(slug)}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
                      targetScope === slug
                        ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{secMeta?.name || slug.toUpperCase()}</span>
                    {st && !st.autorise && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                        À activer
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Si 1 seul secteur : choix Starter (5 000 F) vs Entreprise (10 000 F) */}
            {currentSectors.length === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSingleTier('starter')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    singleTier === 'starter'
                      ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white">Pack Starter</span>
                    <span className="text-base font-extrabold text-emerald-400">5 000 FCFA / mois</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Ventes POS, Caisse, Stock, Clients & Dépenses (jusqu'à 2 utilisateurs).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSingleTier('entreprise')}
                  className={`p-4 rounded-xl border text-left transition-all relative ${
                    singleTier === 'entreprise'
                      ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold">
                    Complet
                  </span>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white">Pack Entreprise</span>
                    <span className="text-base font-extrabold text-emerald-400">10 000 FCFA / mois</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Tous les modules débloqués : Comptabilité SYSCOHADA, Trésorerie, Rapports, Utilisateurs illimités.
                  </p>
                </button>
              </div>
            )}
          </div>

          {/* 3.2 Choix de la durée d'abonnement : 1, 2, 3, 4, 6, 12 mois ou durée personnalisée (Section 6.1) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              2. Choisissez la durée d'abonnement
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Sélectionnez 1 mois, 2 mois, 3 mois, 4 mois ou toute durée supérieure. Le montant total et la date d'échéance sont calculés automatiquement.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 mb-4">
              {PRESET_DURATIONS.map((m) => {
                const dCalc = calculateDurationPrice(pricingSummary.monthlyPrice, m)
                const isSelected = durationMonths === m && customDurationInput === ''
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setDurationMonths(m)
                      setCustomDurationInput('')
                    }}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {dCalc.discountPercent > 0 && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold">
                        -{dCalc.discountPercent}%
                      </span>
                    )}
                    <p className="text-xs font-bold text-white">{m} Mois</p>
                    <p className="text-sm font-extrabold text-emerald-400 mt-1">
                      {dCalc.netTotal.toLocaleString('fr-FR')} F
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Champ pour toute autre durée supérieure personnalisée (Section 6.1) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
              <label className="text-xs text-slate-300 font-medium">
                Ou saisir une autre durée personnalisée (en mois, ex: 5, 8, 18, 24 mois) :
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  placeholder="Ex: 5"
                  value={customDurationInput}
                  onChange={(e) => {
                    const val = e.target.value
                    setCustomDurationInput(val)
                    const num = parseInt(val, 10)
                    if (!isNaN(num) && num >= 1) {
                      setDurationMonths(num)
                    }
                  }}
                  className="w-28 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                />
                <span className="text-xs text-slate-400 font-semibold">mois</span>
              </div>
            </div>
          </div>

          {/* 3.3 Grille Tarifaire Officielle de Référence */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Barème Officiel GESTIO 229 (sans prix codé arbitrairement)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <p className="text-slate-400 font-medium">1 Secteur (Starter)</p>
                <p className="text-sm font-bold text-white mt-0.5">5 000 F / mois</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <p className="text-slate-400 font-medium">1 Secteur (Complet)</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">10 000 F / mois</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <p className="text-slate-400 font-medium">2 Secteurs</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">15 000 F / mois</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <p className="text-slate-400 font-medium">3 Secteurs</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">25 000 F / mois</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <p className="text-slate-400 font-medium">&gt; 3 Secteurs</p>
                <p className="text-sm font-bold text-amber-400 mt-0.5">+5 000 F / secteur</p>
              </div>
            </div>
          </div>

          {/* 3.4 Fonctionnalités incluses dans le secteur sélectionné */}
          {(() => {
            const activeSectorSlug = targetScope === 'all' ? (currentSectors[0] || 'boutique') : targetScope
            const activeFeatureInfo = getSectorFeatureInfo(activeSectorSlug)
            const featureList = singleTier === 'starter' && currentSectors.length === 1
              ? activeFeatureInfo.starterFeatures
              : [...activeFeatureInfo.starterFeatures, ...activeFeatureInfo.enterpriseFeatures.filter((f) => !f.includes('Toutes les fonctionnalités'))]

            return (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Fonctionnalités incluses — {activeFeatureInfo.name}
                  </h2>
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    {targetScope === 'all' ? 'Pack Global' : 'Secteur Spécifique'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  {activeFeatureInfo.description}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {featureList.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Colonne Droite (1/3) : Récapitulatif Obligatoire & Modes de Paiement « Manuel » et « Automatique » */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between h-fit space-y-5">
          <div>
            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Récapitulatif & Paiement
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Vérifiez les détails de votre abonnement avant de choisir votre mode de règlement.
            </p>

            {/* Récapitulatif obligatoire (Section 6.2) */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs mb-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-400">Secteur(s) concerné(s)</span>
                <span className="font-bold text-white text-right">{pricingSummary.scopeLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Durée choisie</span>
                <span className="font-bold text-white">{durationMonths} mois</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Prix mensuel applicable</span>
                <span className="font-semibold text-slate-200">
                  {pricingSummary.monthlyPrice.toLocaleString('fr-FR')} FCFA / mois
                </span>
              </div>
              {durationCalc.discountAmount > 0 && (
                <div className="flex items-center justify-between text-emerald-400">
                  <span>Remise durée (-{durationCalc.discountPercent}%)</span>
                  <span className="font-bold">
                    -{durationCalc.discountAmount.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-400">Date de début prévue</span>
                <span className="font-semibold text-slate-200">
                  {expectedDates.effectiveStartDate.toLocaleDateString('fr-FR')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Date de fin prévue</span>
                <span className="font-bold text-emerald-400">
                  {expectedDates.newExpirationDate.toLocaleDateString('fr-FR')}
                </span>
              </div>
              {expectedDates.isExtensionBeforeExpiry && (
                <p className="text-[11px] text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                  ✓ Prolongation avant échéance : vos {expectedDates.preservedDays} jour(s) restants sont intégralement conservés.
                </p>
              )}
              <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Montant total à payer</span>
                <span className="text-lg font-extrabold text-emerald-400">
                  {durationCalc.netTotal.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            {/* Deux boutons de mode de paiement (Section 6) : 1. Manuel | 2. Automatique */}
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Mode de paiement
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPaymentMode('manuel')
                    setAutoPaymentMessage(null)
                  }}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    selectedPaymentMode === 'manuel'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  1. Manuel
                </button>

                <button
                  type="button"
                  onClick={handleSelectAutomaticPayment}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    selectedPaymentMode === 'automatique'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  2. Automatique <span className="text-[10px] opacity-75 font-normal">(Bientôt)</span>
                </button>
              </div>
            </div>

            {/* Contenu Mode « Automatique » (Section 8) */}
            {selectedPaymentMode === 'automatique' && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200 leading-relaxed font-medium">
                    {autoPaymentMessage || AUTOMATIC_PAYMENT_UNAVAILABLE_MESSAGE}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMode('manuel')}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                >
                  Utiliser le paiement manuel dès maintenant
                </button>
              </div>
            )}

            {/* Contenu Mode « Manuel » (Section 7) */}
            {selectedPaymentMode === 'manuel' && (
              <div className="space-y-4">
                {/* Coordonnées de dépôt configurées par le Super Admin (Section 7.1 & 7.2) */}
                <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-4 space-y-2 text-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Coordonnées officielles de dépôt
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Montant exact :</span>
                    <span className="font-extrabold text-white text-sm">
                      {durationCalc.netTotal.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Numéro de dépôt :</span>
                    <span className="font-mono font-bold text-emerald-300 text-sm">
                      {manualSettings?.deposit_phone || '+229 01 97 00 00 00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bénéficiaire :</span>
                    <span className="font-bold text-white">
                      {manualSettings?.beneficiary_name || 'GESTIO 229 SARL'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Service / Opérateur :</span>
                    <span className="font-semibold text-slate-200 text-right">
                      {manualSettings?.payment_operator || 'MTN MoMo / Moov Money'}
                    </span>
                  </div>
                  {manualSettings?.payment_instructions && (
                    <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-slate-300 whitespace-pre-line leading-relaxed">
                      {manualSettings.payment_instructions}
                    </div>
                  )}

                  {/* Bouton d'envoi de preuve par WhatsApp (Section 7.2 point 2) */}
                  <div className="pt-2">
                    <a
                      href={buildWhatsAppProofLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Envoyer la preuve sur WhatsApp ({manualSettings?.whatsapp_number || '+229 01 97 00 00 00'})
                    </a>
                  </div>
                </div>

                {/* Formulaire de soumission directe dans le logiciel (Section 7.2 point 3) */}
                <form onSubmit={handleSubmitManualPayment} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Opérateur utilisé pour le dépôt *
                    </label>
                    <select
                      value={selectedOperator}
                      onChange={(e) => setSelectedOperator(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="MTN Mobile Money">MTN Mobile Money</option>
                      <option value="Moov Money">Moov Money</option>
                      <option value="Celtiis Cash">Celtiis Cash</option>
                      <option value="Virement / Dépôt Bancaire">Virement / Dépôt Bancaire</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Numéro de téléphone ayant effectué le dépôt *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Ex: +229 01 97 00 00 00"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Référence / ID de la transaction Mobile Money *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: ID 24981039482"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Capture d'écran / Preuve de paiement (Image)
                    </label>
                    <label className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-700 rounded-xl text-xs text-slate-300 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <span className="truncate">
                        {proofFileName ? `Preuve jointe : ${proofFileName}` : 'Joindre une capture de paiement'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProofFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {submitFeedback && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        submitFeedback.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-red-500/10 border-red-500/30 text-red-300'
                      }`}
                    >
                      {submitFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <span>{submitFeedback.text}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submittingPayment}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Send className="w-4 h-4" />
                    {submittingPayment
                      ? 'Envoi de la demande...'
                      : 'Soumettre ma demande de validation'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Historique des demandes de paiement de l'entreprise (Section 7.2 & 12) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-400" />
          Historique de vos demandes de paiement & validations ({paymentRequests.length})
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Suivez en temps réel l'état de vos paiements soumis (« En attente de validation », « Validé » ou « Rejeté »).
        </p>

        {paymentRequests.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400">
            Aucune demande de paiement manuel soumise pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Périmètre</th>
                  <th className="py-3 px-3">Durée</th>
                  <th className="py-3 px-3">Montant</th>
                  <th className="py-3 px-3">Opérateur & Réf.</th>
                  <th className="py-3 px-3">Preuve</th>
                  <th className="py-3 px-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {paymentRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-950/50">
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      {new Date(req.created_at).toLocaleDateString('fr-FR')}{' '}
                      <span className="text-slate-500">
                        {new Date(req.created_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-white">
                      {req.sector_slug === 'all'
                        ? 'Abonnement Global'
                        : `Secteur ${req.sector_slug.toUpperCase()}`}
                    </td>
                    <td className="py-3 px-3 text-slate-300">{req.duration_months} mois</td>
                    <td className="py-3 px-3 font-bold text-emerald-400">
                      {req.total_amount.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      <div>{req.payment_operator}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        Réf: {req.transaction_reference}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {req.proof_url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewProofUrl(req.proof_url)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Voir preuve
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {req.status === 'valide' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                          <Check className="w-3 h-3" />
                          Validé (Actif)
                        </span>
                      ) : req.status === 'rejete' ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-bold text-[11px]">
                            <XCircle className="w-3 h-3" />
                            Rejeté
                          </span>
                          {req.rejection_reason && (
                            <p className="text-[11px] text-red-300 mt-1">
                              Motif : {req.rejection_reason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                          <Clock className="w-3 h-3" />
                          En attente de validation
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale d'aperçu de preuve de paiement */}
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
              <h3 className="text-sm font-bold text-white">Preuve de paiement jointe</h3>
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

export default AbonnementPage
