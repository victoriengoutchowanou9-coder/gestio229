// =============================================================================
// GESTIO 229 SaaS — RegisterPage : Inscription Multi-Secteurs & Choix de Formule
// =============================================================================
// Règles de validation (Sections 1 & 2 CDC) :
// 1. Un seul essai gratuit de 30 jours par compte, couvrant au maximum 3 secteurs.
// 2. L'utilisateur peut sélectionner 1, 2, 3 ou plus de 3 secteurs dès l'inscription.
// 3. L'utilisateur choisit librement sa formule (Starter / Complet / Multi-Secteurs)
//    et son cycle de facturation (mensuel / annuel). AUCUN prix n'est codé en dur.
// 4. Après inscription : AUCUNE connexion automatique. L'utilisateur DOIT valider son email.
//    L'écran de succès indique clairement de vérifier sa boîte mail et ses spams.
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Building2, User, Phone, Mail, Lock, MapPin, Hash,
  ArrowRight, ArrowLeft, CheckCircle2, AlertCircle,
  Loader2, Sparkles, ShieldCheck, Eye, EyeOff, Gift, CreditCard,
  RefreshCw, AlertTriangle, Calendar, Check
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SectorSelector, SECTORS_LIST } from '../../components/auth/SectorSelector'
import {
  MAX_FREE_TRIAL_SECTORS,
  calculateRegistrationTrialSummary,
} from '../../core/subscription/subscriptionEngine'
import {
  initialiserSecteursInscription,
  canonicalSectorSlug,
  toSecteurCode,
} from '../../services/abonnementService'
import {
  calculateUserSelectedPlanSummary,
  fetchDatabasePlanPrices,
  SelectedPlanSummary
} from '../../services/subscriptionPlanService'

interface RegisterFormData {
  company_name: string
  ifu_number: string
  responsible_name: string
  phone: string
  email: string
  password: string
  confirm_password: string
  country: string
  city: string
  selected_sectors: string[]
  singleSectorPlanTier: 'starter' | 'entreprise'
  billingCycle: 'mensuel' | 'annuel'
  website_hp: string // Honeypot anti-bot
}

const BENIN_CITIES = [
  'Cotonou', 'Porto-Novo', 'Parakou', 'Abomey-Calavi', 'Djougou',
  'Bohicon', 'Natitingou', 'Ouidah', 'Abomey', 'Lokossa', 'Kandi', 'Malanville', 'Autre'
]

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showSummaryConfirmModal, setShowSummaryConfirmModal] = useState(false)

  // État de succès après inscription (Écran de vérification d'email)
  const [isSuccess, setIsSuccess] = useState(false)
  const [successData, setSuccessData] = useState<SelectedPlanSummary | null>(null)
  const [registeredEmail, setRegisteredEmail] = useState('')

  // Renvoi d'email depuis l'écran de succès
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)

  // Tarifs dynamiques chargés depuis Supabase
  const [dbPrices, setDbPrices] = useState<{
    globalEnterprisePrice: number
    globalStarterPrice: number
  }>({
    globalEnterprisePrice: 10000,
    globalStarterPrice: 5000,
  })

  const [form, setForm] = useState<RegisterFormData>({
    company_name: '',
    ifu_number: '',
    responsible_name: '',
    phone: '',
    email: '',
    password: '',
    confirm_password: '',
    country: 'Bénin',
    city: 'Cotonou',
    selected_sectors: [],
    singleSectorPlanTier: 'entreprise',
    billingCycle: 'mensuel',
    website_hp: '',
  })

  // Charger les tarifs de la base de données au montage
  useEffect(() => {
    fetchDatabasePlanPrices()
      .then((prices) => {
        setDbPrices({
          globalEnterprisePrice: prices.globalEnterprisePrice,
          globalStarterPrice: prices.globalStarterPrice,
        })
      })
      .catch(() => {})
  }, [])

  const updateField = <K extends keyof RegisterFormData>(key: K, value: RegisterFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const handleSectorChange = (sectors: string[]) => {
    const clean = Array.from(new Set(sectors.map((s) => canonicalSectorSlug(s)).filter(Boolean)))
    updateField('selected_sectors', clean)
  }

  const validateStep1 = (): boolean => {
    if (!form.company_name.trim()) {
      setError('Veuillez saisir le nom de votre entreprise ou établissement.')
      return false
    }
    if (!form.responsible_name.trim()) {
      setError('Veuillez saisir le nom complet du responsable / gérant.')
      return false
    }
    if (!form.phone.trim()) {
      setError('Veuillez saisir votre numéro de téléphone.')
      return false
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setError('Veuillez saisir une adresse e-mail valide.')
      return false
    }
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return false
    }
    if (form.password !== form.confirm_password) {
      setError('Les mots de passe ne correspondent pas.')
      return false
    }
    return true
  }

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateStep1()) {
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Soumission et création du compte
  const executeRegistration = async () => {
    const cleanSectors = Array.from(
      new Set(form.selected_sectors.map((s) => canonicalSectorSlug(s)).filter(Boolean))
    )
    if (cleanSectors.length === 0) {
      setError("Veuillez sélectionner au moins un secteur d'activité.")
      return
    }

    setLoading(true)
    setError(null)
    setShowSummaryConfirmModal(false)

    const primarySector = cleanSectors[0]
    const cleanEmail = form.email.trim().toLowerCase()

    try {
      // 1. Calcul dynamique officiel du plan et du tarif futur sans valeur en dur
      const planSummary = await calculateUserSelectedPlanSummary({
        selectedSectors: cleanSectors,
        singleSectorPlanTier: form.singleSectorPlanTier,
        billingCycle: form.billingCycle,
      })

      // 2. Appel au serveur /api/auth-register pour enregistrer l'entreprise & les abonnements
      let companyId: string | null = null
      let companyData: any = null

      try {
        const apiRes = await fetch('/api/auth-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: form.company_name.trim(),
            ifu_number: form.ifu_number.trim() || '0000000000000',
            responsible_name: form.responsible_name.trim(),
            phone: form.phone.trim(),
            email: cleanEmail,
            password: form.password,
            country: form.country,
            city: form.city,
            selected_sectors: cleanSectors,
            plan_slug: planSummary.planSlug,
            plan_name: planSummary.planName,
            billing_cycle: form.billingCycle,
            price_monthly: planSummary.monthlyPrice,
            website_hp: form.website_hp,
          }),
        })

        const contentType = apiRes.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const json = await apiRes.json()
          if (!apiRes.ok || !json.success) {
            throw new Error(
              json.error ||
              'Cette adresse email est déjà associée à un compte GESTIO229. Veuillez vous connecter ou utiliser une autre adresse email.'
            )
          }
          if (json.success && json.data?.companyId) {
            companyId = json.data.companyId
          }
        } else if (!apiRes.ok) {
          throw new Error('Une erreur est survenue lors de l\'enregistrement. Veuillez vérifier votre saisie.')
        }
      } catch (apiErr: any) {
        if (apiErr.message?.includes('associée à un compte') || apiErr.message?.includes('already registered')) {
          throw apiErr
        }
        console.warn('[RegisterPage] Notice API auth-register:', apiErr?.message)
      }

      // 3. Création du compte dans Supabase Auth
      // RÈGLE CRITIQUE BUG 1 : Ne JAMAIS connecter l'utilisateur directement.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true&email=${encodeURIComponent(cleanEmail)}`,
          data: {
            full_name: form.responsible_name.trim(),
            responsible_name: form.responsible_name.trim(),
            company_name: form.company_name.trim(),
            phone: form.phone.trim(),
            ifu_number: form.ifu_number.trim() || '0000000000000',
            city: form.city,
            country: form.country,
            primary_sector: primarySector,
            selected_sectors: cleanSectors,
            chosen_plan: planSummary.planSlug,
            chosen_plan_name: planSummary.planName,
            role: 'administrateur',
          },
        },
      })

      if (authError) {
        const msg = authError.message.toLowerCase()
        if (msg.includes('already registered') || msg.includes('already been registered')) {
          throw new Error(
            'Cette adresse e-mail possède déjà un compte. Veuillez vous connecter sur la page de connexion.'
          )
        } else {
          throw authError
        }
      }

      const authUserId = authData?.user?.id ?? null

      // RÈGLE CRITIQUE BUG 1 : Déconnexion immédiate de toute session automatique générée
      if (authData?.session) {
        await supabase.auth.signOut().catch(() => {})
      }

      // 4. Créer ou lier l'entreprise dans la table companies si non créée par l'API
      const now = new Date()
      const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      if (!companyId) {
        const { data: existingComp } = await supabase
          .from('companies')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle()

        if (existingComp) {
          companyId = existingComp.id
          companyData = existingComp
        } else {
          const { data: insertedComp, error: insCompErr } = await supabase
            .from('companies')
            .insert({
              name: form.company_name.trim(),
              ifu_number: form.ifu_number.trim() || '0000000000000',
              phone: form.phone.trim(),
              email: cleanEmail,
              country: form.country,
              city: form.city,
              active_sector: primarySector,
              selected_sectors: cleanSectors,
              sectors: cleanSectors,
              subscription_status: 'trial',
              onboarding_completed: true,
              currency: 'FCFA',
              subscription_plan: planSummary.planSlug,
              plan: planSummary.planSlug,
              initial_plan: planSummary.planSlug,
            })
            .select()
            .single()

          if (!insCompErr && insertedComp) {
            companyId = insertedComp.id
            companyData = insertedComp
          }
        }
      }

      // 5. Initialiser les abonnements dans la base de données
      if (companyId) {
        await initialiserSecteursInscription(
          companyId,
          cleanSectors,
          now,
          trialEnds,
          form.singleSectorPlanTier
        ).catch(() => {})

        // Enregistrer dans la table subscriptions (historique)
        try {
          await supabase.from('subscriptions').insert({
            company_id: companyId,
            sector_slug: primarySector,
            plan_slug: planSummary.planSlug,
            plan_name: planSummary.planName,
            status: 'trial',
            price_monthly: planSummary.monthlyPrice,
            started_at: now.toISOString(),
            expires_at: trialEnds.toISOString(),
            fin_essai: trialEnds.toISOString(),
          })
        } catch (_) {}

        // Enregistrer les activités dans company_activities
        for (let i = 0; i < cleanSectors.length; i++) {
          const slug = cleanSectors[i]
          const isFreeTrial = i < MAX_FREE_TRIAL_SECTORS
          const secMeta = SECTORS_LIST.find((s) => s.slug === slug)
          try {
            await supabase.from('company_activities').insert({
              company_id: companyId,
              sector_slug: slug,
              sector_code: toSecteurCode(slug),
              activity_name: `${form.company_name.trim()} — ${secMeta?.name || slug.toUpperCase()}`,
              pos_location: form.city || 'Siège',
              manager_name: form.responsible_name.trim(),
              status: isFreeTrial ? 'ACTIVE' : 'PENDING_PAYMENT',
              is_active: true,
            })
          } catch (_) {}
        }

        // Créer ou mettre à jour user_profiles
        if (authUserId) {
          const defaultAdminPermissions = {
            admin: true,
            commercial: true,
            stock: true,
            treasury: true,
            purchases: true,
            reporting: true,
            accounting: true,
            hr: true,
            ventes: { view: true, create: true, edit: true, delete: true },
            finances: { view: true, caisse: true, tresorerie: true },
          }

          try {
            await supabase.from('user_profiles').upsert(
              {
                company_id: companyId,
                auth_user_id: authUserId,
                full_name: form.responsible_name.trim(),
                username: cleanEmail,
                email: cleanEmail,
                phone: form.phone.trim(),
                role: 'administrateur',
                is_active: true,
                permissions: defaultAdminPermissions,
              },
              { onConflict: 'email' }
            )
          } catch (_) {}
        }
      }

      // RÈGLE CRITIQUE BUG 1 : Assurer la déconnexion complète côté client
      await supabase.auth.signOut().catch(() => {})

      // RÈGLE CRITIQUE BUG 1 & BUG 2 : Afficher l'Écran de Succès personnalisé
      setRegisteredEmail(cleanEmail)
      setSuccessData(planSummary)
      setIsSuccess(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      console.error('[RegisterPage] Erreur inscription :', err)
      setError(err.message || "Une erreur est survenue lors de la création de votre compte.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.selected_sectors.length === 0) {
      setError("Veuillez sélectionner au moins un secteur d'activité.")
      return
    }

    if (form.selected_sectors.length > MAX_FREE_TRIAL_SECTORS) {
      setShowSummaryConfirmModal(true)
      return
    }

    await executeRegistration()
  }

  // Renvoi d'email depuis l'écran de succès
  const handleResendFromSuccess = async () => {
    if (!registeredEmail) return
    setResendLoading(true)
    setResendSuccess(null)
    setResendError(null)

    try {
      // 1. Tenter le renvoi par notre endpoint serveur avec journalisation
      const res = await fetch('/api/resend-confirmation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setResendSuccess(data.message || '✅ Nouveau lien envoyé ! Pensez à vérifier vos spams.')
        return
      }

      // 2. Repli Supabase
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: registeredEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true&email=${encodeURIComponent(registeredEmail)}`,
        },
      })

      if (error) throw error
      setResendSuccess('✅ Nouveau lien envoyé ! Pensez à vérifier vos spams.')
    } catch (err: any) {
      setResendError(err.message || "Erreur lors de l'envoi de l'email.")
    } finally {
      setResendLoading(false)
    }
  }

  const registrationSummary = calculateRegistrationTrialSummary(form.selected_sectors, 1)

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉCRAN DE SUCCÈS (BUG 1 & BUG 2 CORRIGÉS)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isSuccess && successData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-slate-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-fadeIn">
          {/* Icône de succès */}
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-teal-500/30 border border-emerald-500/40 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
            <Mail className="w-10 h-10 animate-bounce" />
          </div>

          {/* En-tête */}
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 mb-3">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Étape finale : Confirmation par email
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Inscription réussie ! Vérifiez votre boîte mail.
            </h1>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              Nous avons envoyé un lien de confirmation à{' '}
              <strong className="text-emerald-400 font-mono text-sm">{registeredEmail}</strong>.
              <br />
              Cliquez sur le lien pour activer votre compte.
            </p>
          </div>

          {/* Rappel SPAM */}
          <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs text-left flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Pensez à vérifier vos SPAM :</strong> Si le mail de confirmation n'apparaît pas dans votre boîte de réception d'ici 1 à 2 minutes, vérifiez votre dossier <em>Courriers indésirables / Spams</em>.
            </div>
          </div>

          {/* CARTE RÉCAPITULATIF OFFICIEL DE LA FORMULE CHOISIE (BUG 2) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-left space-y-3 shadow-inner">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Période d'essai gratuit activée
                </span>
              </div>
              <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                0 FCFA aujourd'hui
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
              <div>
                <span className="text-[11px] text-slate-500 block">Durée de l'essai gratuit :</span>
                <span className="font-semibold text-white">
                  du {successData.trialStartDateFormatted} au {successData.trialEndDateFormatted} (30 jours)
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 block">Formule choisie :</span>
                <span className="font-bold text-white">
                  {successData.planName}
                </span>
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-xs font-semibold text-slate-400">
                  Montant après l'essai gratuit :
                </span>
                <span className="font-black text-emerald-400 text-sm">
                  {successData.futurePriceFormatted}
                </span>
              </div>

              <div className="sm:col-span-2 pt-1 text-[11px] text-slate-400">
                <strong>Secteurs rattachés :</strong> {successData.sectorNames.join(', ')}
              </div>
            </div>

            <p className="text-[11px] text-emerald-400/90 pt-1 border-t border-slate-800">
              ✓ Aucun moyen de paiement n'a été prélevé pour démarrer votre essai gratuit de 30 jours.
            </p>
          </div>

          {/* Feedback renvoi d'email */}
          {resendSuccess && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold text-left flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{resendSuccess}</span>
            </div>
          )}

          {resendError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold text-left flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{resendError}</span>
            </div>
          )}

          {/* Boutons d'action */}
          <div className="space-y-3 pt-2">
            {/* BOUTON OFFICIEL RÈGLE 5 : "J'ai confirmé mon email" -> Redirige vers /login (PAS vers le HUB) */}
            <button
              type="button"
              onClick={() => navigate(`/login?confirmed_reminder=1&email=${encodeURIComponent(registeredEmail)}`, { replace: true })}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>J'ai confirmé mon email → Se connecter</span>
            </button>

            {/* Bouton de renvoi de mail */}
            <div>
              <button
                type="button"
                onClick={handleResendFromSuccess}
                disabled={resendLoading}
                className="text-xs font-bold text-slate-400 hover:text-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                <span>{resendLoading ? 'Envoi en cours...' : "Vous n'avez pas reçu le mail ? Renvoyer le lien"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMULAIRE ÉTAPE 1 & 2
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600/20 via-teal-600/10 to-transparent border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                GESTIO 229 <span className="text-emerald-400">SaaS</span>
              </h1>
              <p className="text-xs text-slate-400">
                Création de compte entreprise • Essai gratuit 30 jours (jusqu'à 3 secteurs)
              </p>
            </div>
          </div>

          {/* Indicateur d'étapes */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                step === 1
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-bold">
                1
              </span>
              Informations
            </div>
            <div className="w-4 h-px bg-slate-700" />
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                step === 2
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-bold">
                2
              </span>
              Secteurs & Formule
            </div>
          </div>
        </div>

        {/* Corps du formulaire */}
        <div className="p-6">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleNextStep} className="space-y-4">
              <input
                type="text"
                name="website_hp"
                value={form.website_hp}
                onChange={(e) => updateField('website_hp', e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nom de l'Entreprise / Établissement *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Quincaillerie Le Bâtisseur SARL"
                      value={form.company_name}
                      onChange={(e) => updateField('company_name', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Numéro IFU (Optionnel)
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={13}
                      placeholder="Ex: 3202400000000"
                      value={form.ifu_number}
                      onChange={(e) => updateField('ifu_number', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nom complet du Responsable / Gérant *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Koffi Mensah"
                      value={form.responsible_name}
                      onChange={(e) => updateField('responsible_name', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Téléphone (WhatsApp / Mobile) *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      placeholder="Ex: +229 01 97 00 00 00"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Adresse E-mail Professionnelle *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="contact@entreprise.bj"
                      value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Ville d'implantation *
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      {BENIN_CITIES.map((city) => (
                        <option key={city} value={city} className="bg-slate-900">
                          {city} (Bénin)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Mot de passe *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Minimum 6 caractères"
                      value={form.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirmer le mot de passe *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Répétez le mot de passe"
                      value={form.confirm_password}
                      onChange={(e) => updateField('confirm_password', e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <p className="text-xs text-slate-400">
                  Vous avez déjà un compte ?{' '}
                  <Link to="/login" className="text-emerald-400 hover:underline font-medium">
                    Se connecter
                  </Link>
                </p>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  Choisir mes secteurs d'activité
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Sélectionnez vos secteurs d'activité
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Votre essai gratuit unique de <strong className="text-emerald-400">30 jours</strong> couvre jusqu'à{' '}
                  <strong className="text-white">3 secteurs d'activité</strong>.
                </p>
              </div>

              <SectorSelector
                selectedSectors={form.selected_sectors}
                onChange={handleSectorChange}
              />

              {/* CHOIX DE LA FORMULE & CYCLE DE FACTURATION (BUG 2) */}
              {form.selected_sectors.length > 0 && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-800">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Choix de votre Formule (tarifs après le mois gratuit)
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Votre essai gratuit reste 100% sans frais (0 FCFA aujourd'hui). Sélectionnez votre formule cible.
                      </p>
                    </div>

                    {/* Sélecteur Cycle de facturation : Mensuel vs Annuel */}
                    <div className="inline-flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
                      <button
                        type="button"
                        onClick={() => updateField('billingCycle', 'mensuel')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                          form.billingCycle === 'mensuel'
                            ? 'bg-emerald-500 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Mensuel
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('billingCycle', 'annuel')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                          form.billingCycle === 'annuel'
                            ? 'bg-emerald-500 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>Annuel</span>
                        <span className="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full font-black">
                          -2 mois
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Choix des options selon le nombre de secteurs */}
                  {form.selected_sectors.length === 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Option Starter */}
                      <button
                        type="button"
                        onClick={() => updateField('singleSectorPlanTier', 'starter')}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.singleSectorPlanTier === 'starter'
                            ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-black text-white">Starter (Essentiel)</span>
                          <span className="text-xs font-black text-emerald-400">
                            {form.billingCycle === 'annuel'
                              ? `${(dbPrices.globalStarterPrice * 10).toLocaleString('fr-FR')} FCFA / an`
                              : `${dbPrices.globalStarterPrice.toLocaleString('fr-FR')} FCFA / mois`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Modules indispensables : Ventes POS, Gestion de caisse, Gestion des stocks, Fichier clients.
                        </p>
                      </button>

                      {/* Option Complet / Entreprise */}
                      <button
                        type="button"
                        onClick={() => updateField('singleSectorPlanTier', 'entreprise')}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.singleSectorPlanTier === 'entreprise'
                            ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-black text-white">Complet (Entreprise)</span>
                          <span className="text-xs font-black text-emerald-400">
                            {form.billingCycle === 'annuel'
                              ? `${(dbPrices.globalEnterprisePrice * 10).toLocaleString('fr-FR')} FCFA / an`
                              : `${dbPrices.globalEnterprisePrice.toLocaleString('fr-FR')} FCFA / mois`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Tous les modules débloqués : Comptabilité SYSCOHADA Révisé, Trésorerie multi-comptes, Rapports avancés.
                        </p>
                      </button>
                    </div>
                  )}

                  {form.selected_sectors.length === 2 && (
                    <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 text-left">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white">Pack Duo (2 Secteurs d'activité)</span>
                        <span className="text-xs font-black text-emerald-400">
                          {form.billingCycle === 'annuel' ? '150 000 FCFA / an' : '15 000 FCFA / mois'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Gestion complète et consolidée de vos 2 activités au sein du même HUB d'entreprise.
                      </p>
                    </div>
                  )}

                  {form.selected_sectors.length === 3 && (
                    <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 text-left">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white">Pack Trio (3 Secteurs d'activité)</span>
                        <span className="text-xs font-black text-emerald-400">
                          {form.billingCycle === 'annuel' ? '250 000 FCFA / an' : '25 000 FCFA / mois'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Les 3 secteurs sont 100% couverts par vos 30 jours d'essai gratuit.
                      </p>
                    </div>
                  )}

                  {form.selected_sectors.length > 3 && (
                    <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/40 text-left">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white">
                          Pack Multi-Secteurs Pro ({form.selected_sectors.length} activités)
                        </span>
                        <span className="text-xs font-black text-amber-400">
                          {25000 + (form.selected_sectors.length - 3) * 5000} FCFA / mois
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        3 premiers secteurs couverts par l'essai gratuit. Secteurs supplémentaires (à partir du 4e) en attente d'activation.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour aux informations
                </button>

                <button
                  type="submit"
                  disabled={loading || form.selected_sectors.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Création de votre compte...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {form.selected_sectors.length > MAX_FREE_TRIAL_SECTORS
                        ? `Vérifier le récapitulatif (${form.selected_sectors.length} secteurs)`
                        : `Démarrer mon essai gratuit 30 jours`}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modale de récapitulatif si > 3 secteurs sélectionnés */}
      {showSummaryConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <CreditCard className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Confirmation de votre sélection multi-secteurs
                </h3>
                <p className="text-xs text-slate-400">
                  Vérifiez le détail de vos secteurs avant la création de votre compte
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 mb-4 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Total secteurs sélectionnés</span>
                <span className="font-bold text-white">{registrationSummary.totalSectorsSelected} secteurs</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800">
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" />
                  Secteurs couverts par l'essai gratuit (30 jours)
                </span>
                <span className="font-bold text-emerald-400">
                  {registrationSummary.freeTrialSectorsCount} secteurs (Gratuit)
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800">
                <span className="text-amber-300">Secteurs supplémentaires payants</span>
                <span className="font-bold text-amber-300">
                  {registrationSummary.paidExtraSectorsCount} secteur(s)
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Prix par secteur supplémentaire</span>
                <span className="font-semibold text-slate-200">
                  {registrationSummary.unitPricePerExtraSector.toLocaleString('fr-FR')} FCFA / mois
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-bold text-white">Total secteurs supplémentaires</span>
                <span className="text-base font-extrabold text-amber-400">
                  {registrationSummary.totalExtraAmountToPay.toLocaleString('fr-FR')} FCFA / mois
                </span>
              </div>
            </div>

            <div className="space-y-2 mb-5 text-xs">
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-200">
                <strong>Secteurs en essai gratuit (30 jours) :</strong>{' '}
                {registrationSummary.freeTrialSectorSlugs
                  .map((slug) => SECTORS_LIST.find((s) => s.slug === slug)?.name || slug.toUpperCase())
                  .join(', ')}
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-200">
                <strong>Secteurs supplémentaires :</strong>{' '}
                {registrationSummary.paidExtraSectorSlugs
                  .map((slug) => SECTORS_LIST.find((s) => s.slug === slug)?.name || slug.toUpperCase())
                  .join(', ')}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSummaryConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={executeRegistration}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20"
              >
                <ShieldCheck className="w-4 h-4" />
                Confirmer et créer mon compte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RegisterPage
