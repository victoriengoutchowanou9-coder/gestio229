// =============================================================================
// GESTIO 229 SaaS — Page Mon Abonnement & Renouvellement Conforme CDC
// =============================================================================
// Formules officielles :
// - Starter : 5 000 FCFA / mois (1 activité, modules essentiels)
// - Entreprise : 10 000 FCFA / mois (1 activité, tous modules)
// - 2 Activités : 15 000 FCFA / mois (2 activités, tous modules)
// - 3 Activités : 25 000 FCFA / mois (3 activités, tous modules)
// - > 3 Activités : 25 000 + ((N - 3) * 5 000) FCFA / mois
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CreditCard, CheckCircle, ShieldCheck, Clock, RefreshCw, Zap,
  ArrowRight, Lock, Check, Smartphone, AlertTriangle, AlertCircle,
  HelpCircle, Calendar, ChevronRight, X, History, Sparkles, Building2
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  calculateSubscriptionPrice,
  formatFCFA,
  getCompanySubscriptionInfo,
  STARTER_ACCESSIBLE_MODULES,
  ADVANCED_MODULES,
  PlanConfig
} from '../../../core/subscription/subscriptionEngine'
import { MoMoService, MoMoPaymentStatus } from '../../../services/payment/momoService'
import clsx from 'clsx'

// Liste exhaustive des modules opérationnels réels du projet
const REAL_MODULES_LIST = [
  { id: 'dashboard', name: 'Tableau de bord', description: 'Indicateurs clés et vue consolidée du secteur' },
  { id: 'ventes', name: 'Vente & POS', description: 'Caisse tactile, panier, tickets et certification e-MECeF' },
  { id: 'stock', name: 'Gestion des Stocks', description: 'Double stock Magasin/POS, alertes et réapprovisionnement' },
  { id: 'caisse', name: 'Caisse du jour', description: 'Ouverture, encaissements espèces/MoMo et clôture' },
  { id: 'clients', name: 'Clients & Créances', description: 'Comptes clients, dettes, plafonds et relances' },
  { id: 'depenses', name: 'Dépenses & Charges', description: 'Suivi des frais de fonctionnement et factures' },
  { id: 'finances', name: 'Trésorerie & Banques', description: 'Liquidités, rapprochement, transferts et décaissements' },
  { id: 'rapports', name: 'Reporting Avancé', description: 'Analyses de marge nette, statistiques et décisionnel' },
  { id: 'inventaire', name: 'Inventaire Physique', description: 'Comptage physique avec valorisation des écarts en FCFA' },
  { id: 'syscohada', name: 'Comptabilité SYSCOHADA', description: 'Livre Journal, Grand Livre, Balance 6 colonnes et SMT' },
]

export const AbonnementPage: React.FC = () => {
  const { company, refreshTenantContext } = useAuthStore()
  const { toast } = useUIStore()

  // Calcul des données d'abonnement / essai
  const subInfo = useMemo(() => getCompanySubscriptionInfo(company), [company])

  // Sélecteur pour calculatrice dynamique (>3 activités)
  const [interactiveActivities, setInteractiveActivities] = useState<number>(
    subInfo.activityCount > 3 ? subInfo.activityCount : 4
  )

  // Plan sélectionné pour renouvellement
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>(
    subInfo.planSlug.includes('starter') ? 'starter' : 'entreprise'
  )

  // Modal de renouvellement
  const [showRenewModal, setShowRenewModal] = useState(false)
  const [renewPlanConfig, setRenewPlanConfig] = useState<PlanConfig | null>(null)

  // Gestion MoMo dans le modal
  const [momoPhone, setMomoPhone] = useState(company?.phone || '')
  const [momoStatus, setMomoStatus] = useState<MoMoPaymentStatus | 'idle'>('idle')
  const [momoReference, setMomoReference] = useState<string>('')
  const [momoMessage, setMomoMessage] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Historique des paiements depuis BDD
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Charger l'historique des paiements réels
  const loadPaymentHistory = useCallback(async () => {
    if (!company?.id) return
    setLoadingHistory(true)
    try {
      const { data } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(10)

      setPaymentHistory(data || [])
    } catch (e) {
      // Ignorer si la table est vide
    } finally {
      setLoadingHistory(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadPaymentHistory()
  }, [loadPaymentHistory])

  // Ouvrir le modal de renouvellement pour un plan spécifique
  const openRenewModal = (planConfig: PlanConfig) => {
    setRenewPlanConfig(planConfig)
    setMomoStatus('idle')
    setMomoMessage('')
    setShowRenewModal(true)
  }

  // Initier le paiement MTN MoMo
  const handleInitiateMoMo = async () => {
    if (!company?.id || !renewPlanConfig) return
    if (!momoPhone || momoPhone.trim().length < 8) {
      toast.error('Numéro invalide', 'Veuillez saisir votre numéro MTN Mobile Money à 8 ou 10 chiffres.')
      return
    }

    setIsProcessing(true)
    setMomoStatus('initiated')
    setMomoMessage('Initialisation de la transaction auprès de MTN Bénin...')

    try {
      const res = await MoMoService.initiatePayment({
        companyId: company.id,
        companyName: company.name || 'Entreprise',
        payerPhone: momoPhone,
        amount: renewPlanConfig.priceMonthly,
        planSlug: renewPlanConfig.slug,
        activityCount: renewPlanConfig.activityCount,
        description: `Abonnement GESTIO 229 - ${renewPlanConfig.name}`
      })

      setMomoReference(res.reference)
      setMomoStatus(res.status)
      setMomoMessage(res.message + (res.instruction ? `\n${res.instruction}` : ''))

      if (res.success) {
        toast.info('Demande MoMo envoyée', 'Validez le débit sur votre téléphone portable.')
        await loadPaymentHistory()
      } else {
        toast.error('Échec initiation MoMo', res.message)
      }
    } catch (err: any) {
      setMomoStatus('failed')
      setMomoMessage(err.message || 'Erreur lors de l\'appel MoMo.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Vérifier le statut d'un paiement en attente
  const handleCheckMoMoStatus = async () => {
    if (!momoReference) return
    setIsProcessing(true)
    try {
      const res = await MoMoService.checkPaymentStatus(momoReference)
      setMomoStatus(res.status)
      if (res.status === 'successful') {
        toast.success('Paiement MoMo confirmé !', 'Activation de votre abonnement en cours...')
        await handleFinalizeActivation()
      } else if (res.status === 'failed') {
        toast.error('Paiement non validé', 'La transaction a été rejetée ou a expiré.')
      } else {
        toast.info('En attente', 'La transaction est toujours en attente de validation sur votre téléphone.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Finalisation post-confirmation
  const handleFinalizeActivation = async () => {
    if (!company?.id || !renewPlanConfig) return
    setIsProcessing(true)
    try {
      const ok = await MoMoService.finalizeVerifiedPayment(
        momoReference,
        company.id,
        renewPlanConfig.slug
      )
      if (ok) {
        toast.success('Abonnement Activé avec Succès !', `Votre licence ${renewPlanConfig.name} est désormais active pour 30 jours.`)
        await refreshTenantContext()
        await loadPaymentHistory()
        setShowRenewModal(false)
      } else {
        toast.error('Erreur', 'Impossible d\'activer automatiquement la licence.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Annuler la demande en cours
  const handleCancelMoMo = async () => {
    if (momoReference) {
      await MoMoService.cancelPayment(momoReference)
    }
    setMomoStatus('cancelled')
    setMomoMessage('Transaction annulée.')
    await loadPaymentHistory()
  }

  // Plan dynamique calculé pour > 3 activités
  const multiPlanCalculated = useMemo(() => {
    return calculateSubscriptionPrice(interactiveActivities)
  }, [interactiveActivities])

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* ─── En-tête de la Page ───────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Mon Abonnement & Tarifs SaaS</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Formules transparentes, premier mois gratuit sans engagement et renouvellement sécurisé par MTN Mobile Money.
        </p>
      </div>

      {/* ─── SECTION 7 : BANNIÈRE PREMIER MOIS GRATUIT / STATUT ───────── */}
      <div className={clsx(
        'rounded-3xl p-6 sm:p-7 border shadow-sm transition-all',
        subInfo.isTrial
          ? 'bg-gradient-to-br from-amber-500/10 via-amber-50 to-white dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-800 border-amber-300 dark:border-amber-800'
          : subInfo.isActive
          ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-white dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800 border-emerald-300 dark:border-emerald-800'
          : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800'
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={clsx(
              'w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm',
              subInfo.isTrial ? 'bg-amber-500 text-white' :
              subInfo.isActive ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            )}>
              {subInfo.isTrial ? <Clock className="w-7 h-7" /> :
               subInfo.isActive ? <ShieldCheck className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">
                  {subInfo.isTrial ? 'Période d\'Essai Gratuit (1er Mois Offert)' :
                   subInfo.isActive ? 'Licence Entreprise Active' : 'Abonnement Expiré'}
                </h3>
                <span className={clsx(
                  'text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider',
                  subInfo.isTrial ? 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200' :
                  subInfo.isActive ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200' :
                  'bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-200'
                )}>
                  {subInfo.statusLabel}
                </span>
              </div>

              {subInfo.isTrial ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Votre période d’essai de <strong>1 mois gratuit</strong> est en cours. Aucun paiement n'a été prélevé.
                  Elle vous permet de tester librement l'ERP GESTIO 229 avec toutes vos activités.
                </p>
              ) : subInfo.isActive ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  Votre compte bénéficie d'un accès complet à vos modules et à la certification fiscale DGI.
                </p>
              ) : (
                <p className="text-sm text-red-700 dark:text-red-300 mt-1.5 leading-relaxed">
                  Votre période d'abonnement a pris fin. Renouvelez votre forfait pour débloquer l'accès à vos secteurs.
                </p>
              )}

              {/* Métriques d'Essai & Dates */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Date de début</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{subInfo.startDate}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Date d'expiration</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{subInfo.endDate}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Jours restants</span>
                  <span className={clsx(
                    'text-xs font-black',
                    subInfo.daysRemaining > 7 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  )}>
                    {subInfo.daysRemaining} jour{subInfo.daysRemaining > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Montant après essai</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {formatFCFA(subInfo.futurePrice)} <span className="font-normal text-[10px] text-slate-400">/mois</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bouton d'action principal */}
          <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col gap-2">
            <button
              onClick={() => openRenewModal(calculateSubscriptionPrice(subInfo.activityCount, subInfo.planSlug.includes('starter') ? 'starter' : 'entreprise'))}
              className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>RENOUVELER MON ABONNEMENT</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── SECTION 3 & 5 : GRILLE DES 4 PLANS OFFICIELS + PLUS DE 3 ACTIVITÉS ─── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              Grille Tarifaire Officielle GESTIO 229
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tarifs garantis par logique métier backend (en Francs CFA / mois)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. PLAN STARTER */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col justify-between hover:shadow-lg transition-all">
            <div>
              <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 mb-3">
                1 Activité
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">PLAN STARTER</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
                Pour les petites entreprises démarrant leur gestion.
              </p>

              <div className="my-5">
                <span className="text-3xl font-black text-slate-900 dark:text-white">5 000</span>
                <span className="text-xs font-semibold text-slate-400 ml-1">FCFA / mois</span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200 text-[11px] uppercase">Modules essentiels :</p>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Tableau de bord</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Vente & POS</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Gestion des Stocks</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Caisse du jour</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Clients & Créances</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dépenses courantes</span>
                </div>

                <p className="font-bold text-amber-700 dark:text-amber-400 text-[11px] uppercase pt-2">Non inclus :</p>
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Trésorerie & Banques</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Reporting avancé</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Inventaire physique</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Comptabilité SYSCOHADA</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => openRenewModal(calculateSubscriptionPrice(1, 'starter'))}
              className="mt-6 w-full py-3 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition"
            >
              Choisir le Starter (5 000 F)
            </button>
          </div>

          {/* 2. PLAN ENTREPRISE */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-emerald-500 dark:border-emerald-500 p-6 flex flex-col justify-between shadow-md relative hover:shadow-xl transition-all">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
              Recommandé (1 Activité)
            </span>

            <div>
              <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 mb-3">
                1 Activité complète
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">PLAN ENTREPRISE</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
                Accès à TOUS les modules sans restriction pour votre secteur.
              </p>

              <div className="my-5">
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">10 000</span>
                <span className="text-xs font-semibold text-slate-400 ml-1">FCFA / mois</span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <p className="font-bold text-emerald-700 dark:text-emerald-300 text-[11px] uppercase">Tout le Starter plus :</p>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Trésorerie & Décaissements</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Reporting & Décisionnel</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Inventaire physique chiffré</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Comptabilité SYSCOHADA Révisé</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Modules spécialisés du secteur</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Facturation normalisée e-MECeF</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => openRenewModal(calculateSubscriptionPrice(1, 'entreprise'))}
              className="mt-6 w-full py-3 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition"
            >
              Choisir Entreprise (10 000 F)
            </button>
          </div>

          {/* 3. PLAN 2 ACTIVITÉS */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col justify-between hover:shadow-lg transition-all">
            <div>
              <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-3">
                2 Activités
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">PLAN 2 ACTIVITÉS</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
                Pour gérer deux secteurs distincts (ex: Poissonnerie + Quincaillerie).
              </p>

              <div className="my-5">
                <span className="text-3xl font-black text-slate-900 dark:text-white">15 000</span>
                <span className="text-xs font-semibold text-slate-400 ml-1">FCFA / mois</span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <p className="font-bold text-indigo-700 dark:text-indigo-300 text-[11px] uppercase">Avantages inclus :</p>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>2 activités indépendantes</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Tous les modules pour chaque activité</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Comptabilité SYSCOHADA</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Trésorerie & Reporting</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Séparation stricte des données</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Accès au HUB central</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => openRenewModal(calculateSubscriptionPrice(2))}
              className="mt-6 w-full py-3 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition"
            >
              Choisir 2 Activités (15 000 F)
            </button>
          </div>

          {/* 4. PLAN 3 ACTIVITÉS */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col justify-between hover:shadow-lg transition-all">
            <div>
              <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 mb-3">
                3 Activités
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">PLAN 3 ACTIVITÉS</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
                Pour les entreprises multiservices regroupant 3 métiers.
              </p>

              <div className="my-5">
                <span className="text-3xl font-black text-slate-900 dark:text-white">25 000</span>
                <span className="text-xs font-semibold text-slate-400 ml-1">FCFA / mois</span>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <p className="font-bold text-purple-700 dark:text-purple-300 text-[11px] uppercase">Avantages inclus :</p>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>3 activités indépendantes</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Tous les modules inclus</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Comptabilité SYSCOHADA</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>HUB consolidé temps réel</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Gestion des stocks par secteur</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Support prioritaire VIP</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => openRenewModal(calculateSubscriptionPrice(3))}
              className="mt-6 w-full py-3 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 transition"
            >
              Choisir 3 Activités (25 000 F)
            </button>
          </div>
        </div>
      </div>

      {/* ─── PLUS DE 3 ACTIVITÉS : CALCULATEUR INTERACTIF AUTOMATIQUE ─── */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-xl">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 mb-2">
              Formule Évolutive : Plus de 3 Activités
            </span>
            <h3 className="text-2xl font-black">
              25 000 FCFA pour 3 activités + 5 000 FCFA / activité supplémentaire
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
              Vous avez 4, 5, 6 ou 10 secteurs d'activités ? Ajustez le nombre pour voir le montant calculé automatiquement par notre logique métier.
            </p>

            {/* Curseur de sélection du nombre d'activités */}
            <div className="mt-5 flex items-center gap-4">
              <span className="text-xs font-bold text-indigo-300">Nombre d'activités :</span>
              <div className="flex items-center gap-2">
                {[4, 5, 6, 7, 8, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setInteractiveActivities(num)}
                    className={clsx(
                      'w-9 h-9 rounded-xl text-xs font-black transition-all',
                      interactiveActivities === num
                        ? 'bg-emerald-500 text-white shadow-md scale-110'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 text-center shrink-0 min-w-[260px]">
            <span className="text-[11px] uppercase font-bold text-indigo-300 block">Montant Calculé :</span>
            <p className="text-3xl font-black text-white mt-1">
              {formatFCFA(multiPlanCalculated.priceMonthly)}
            </p>
            <span className="text-xs text-slate-300 block mt-0.5">
              pour {interactiveActivities} activités ({formatFCFA(25000)} + {(interactiveActivities - 3)} × {formatFCFA(5000)})
            </span>

            <button
              onClick={() => openRenewModal(multiPlanCalculated)}
              className="mt-4 w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-extrabold text-xs rounded-xl shadow-md transition"
            >
              Choisir {interactiveActivities} Activités
            </button>
          </div>
        </div>
      </div>

      {/* ─── SECTION 6 : TABLEAU COMPARATIF DES MODULES INCLUS ───────── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
            Comparatif des Modules Réellement Inclus
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tableau officiel de compatibilité selon votre formule d'abonnement
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-700 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-5 py-3">Module Opérationnel</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-center">Plan Starter (5 000 F)</th>
                <th className="px-5 py-3 text-center">Plan Entreprise & Multi (≥ 10 000 F)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {REAL_MODULES_LIST.map((mod) => {
                const isStarterAllowed = STARTER_ACCESSIBLE_MODULES.includes(mod.id)
                return (
                  <tr key={mod.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                    <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{mod.name}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{mod.description}</td>
                    <td className="px-5 py-3 text-center">
                      {isStarterAllowed ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                          <Check className="w-3.5 h-3.5" /> Inclus
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                          <Lock className="w-3 h-3" /> Non inclus
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                        <Check className="w-3.5 h-3.5" /> Inclus
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── SECTION 10 : HISTORIQUE DES ABONNEMENTS ET PAIEMENTS ─────── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              <span>Historique des Souscriptions & Paiements</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Journal d'audit de vos renouvellements et transactions MTN MoMo
            </p>
          </div>

          <button
            onClick={loadPaymentHistory}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
            title="Rafraîchir l'historique"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {paymentHistory.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
            <CreditCard className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="font-semibold text-slate-600 dark:text-slate-400">Aucun historique de paiement pour le moment</p>
            <p className="mt-1">Votre entreprise fonctionne actuellement sous le premier mois d'essai gratuit offert.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold text-slate-700 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Référence</th>
                  <th className="px-5 py-3">Méthode</th>
                  <th className="px-5 py-3">Montant</th>
                  <th className="px-5 py-3">Période</th>
                  <th className="px-5 py-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {paymentHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(item.created_at).toLocaleDateString('fr-BJ')}
                    </td>
                    <td className="px-5 py-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {item.reference}
                    </td>
                    <td className="px-5 py-3 font-semibold text-amber-600 dark:text-amber-400">
                      MTN Mobile Money
                    </td>
                    <td className="px-5 py-3 font-black text-slate-800 dark:text-slate-100">
                      {formatFCFA(item.amount)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {item.period_start || '-'} au {item.period_end || '-'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={clsx(
                        'px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px]',
                        item.status === 'success' || item.status === 'successful'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : item.status === 'pending'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                      )}>
                        {item.status === 'success' ? 'Réussi' : item.status === 'pending' ? 'En attente' : 'Échoué'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── SECTION 8 & 9 : MODAL DE RENOUVELLEMENT & PAIEMENT MTN MOMO ─── */}
      {showRenewModal && renewPlanConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    Renouvellement d'Abonnement
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Récapitulatif avant confirmation de paiement
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRenewModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps du Récapitulatif (CDC Partie 8) */}
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Formule choisie :</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{renewPlanConfig.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Activités couvertes :</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{renewPlanConfig.activityCount} secteur(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Période de validité :</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">30 jours (1 mois renouvelable)</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-sm">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Montant total à payer :</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">
                    {formatFCFA(renewPlanConfig.priceMonthly)}
                  </span>
                </div>
              </div>

              {/* Interface MTN MoMo (CDC Partie 9) */}
              <div className="p-5 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    Payer avec MTN Mobile Money (Bénin)
                  </h4>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Renseignez votre numéro de compte MTN MoMo pour initier la demande de prélèvement.
                </p>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Numéro de Téléphone MTN Bénin *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      +229
                    </span>
                    <input
                      type="tel"
                      value={momoPhone}
                      onChange={(e) => setMomoPhone(e.target.value)}
                      placeholder="97 00 00 00"
                      disabled={momoStatus === 'pending' || isProcessing}
                      className="w-full pl-14 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Statut dynamique MoMo */}
                {momoStatus !== 'idle' && (
                  <div className={clsx(
                    'p-3.5 rounded-xl border text-xs font-medium space-y-1',
                    momoStatus === 'pending' ? 'bg-amber-100 dark:bg-amber-900/60 border-amber-300 text-amber-900 dark:text-amber-200' :
                    momoStatus === 'successful' ? 'bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 text-emerald-900 dark:text-emerald-200' :
                    'bg-red-100 dark:bg-red-900/60 border-red-300 text-red-900 dark:text-red-200'
                  )}>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="w-2 h-2 rounded-full animate-ping bg-current" />
                      <span>Statut : {momoStatus === 'pending' ? 'En attente' : momoStatus === 'successful' ? 'Réussi' : momoStatus === 'initiated' ? 'Initié' : 'Échoué'}</span>
                    </div>
                    <p className="whitespace-pre-line text-[11px]">{momoMessage}</p>
                    {momoReference && (
                      <p className="text-[10px] opacity-75 font-mono">Réf : {momoReference}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Modal Actions */}
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowRenewModal(false)}
                className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Fermer
              </button>

              <div className="flex items-center gap-2">
                {momoStatus === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelMoMo}
                      className="px-3 py-2 text-xs font-bold text-red-600 hover:underline"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleCheckMoMoStatus}
                      disabled={isProcessing}
                      className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <RefreshCw className={clsx('w-3.5 h-3.5', isProcessing && 'animate-spin')} />
                      <span>Vérifier validation</span>
                    </button>
                  </>
                )}

                {momoStatus === 'idle' && (
                  <button
                    type="button"
                    onClick={handleInitiateMoMo}
                    disabled={isProcessing}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition shadow-md shadow-emerald-600/20 flex items-center gap-2"
                  >
                    <span>Lancer le Paiement MoMo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AbonnementPage
