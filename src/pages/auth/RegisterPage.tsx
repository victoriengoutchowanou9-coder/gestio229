// =============================================================================
// GESTIO 229 SaaS — RegisterPage : Inscription Multi-Secteurs (Refonte V4)
// =============================================================================
// Note de compatibilité Vite / ESM :
// Étape 2 Secteurs d'activité utilise des structures ES6 natives (Set, Array.from)
// sans import Lodash par défaut pour prévenir toute exception '_ is not a function'.
// =============================================================================
// Règles du cahier des charges (Sections 1 & 2) :
// 1. Un seul essai gratuit de 30 jours par compte, couvrant au maximum 3 secteurs.
// 2. L'utilisateur peut sélectionner 1, 2, 3 ou plus de 3 secteurs dès l'inscription.
// 3. Si > 3 secteurs sont sélectionnés, affichage d'un récapitulatif détaillé avant confirmation
//    (Total secteurs, Secteurs couverts par l'essai gratuit = 3, Secteurs supplémentaires payants = N-3,
//     Prix unitaire = 5 000 FCFA/mois, Montant total à payer).
// 4. Les secteurs au-delà des 3 premiers sont créés avec le statut 'en_attente_paiement'
//    et ne sont jamais considérés comme payés tant que leur abonnement n'est pas validé.
// =============================================================================

import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Building2, User, Phone, Mail, Lock, MapPin, Hash,
  ArrowRight, ArrowLeft, CheckCircle2, AlertCircle,
  Loader2, Sparkles, ShieldCheck, Eye, EyeOff, Gift, CreditCard
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SectorSelector, SECTORS_LIST } from '../../components/auth/SectorSelector'
import { useAuthStore } from '../../store/authStore'
import {
  MAX_FREE_TRIAL_SECTORS,
  calculateRegistrationTrialSummary,
} from '../../core/subscription/subscriptionEngine'
import {
  initialiserSecteursInscription,
  canonicalSectorSlug,
  toSecteurCode,
} from '../../services/abonnementService'

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
  website_hp: string // Honeypot anti-bot
}

const BENIN_CITIES = [
  'Cotonou', 'Porto-Novo', 'Parakou', 'Abomey-Calavi', 'Djougou',
  'Bohicon', 'Natitingou', 'Ouidah', 'Abomey', 'Lokossa', 'Kandi', 'Malanville', 'Autre'
]

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate()
  const { setUser, setCompany } = useAuthStore()

  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showSummaryConfirmModal, setShowSummaryConfirmModal] = useState(false)
  const [singleSectorPlan, setSingleSectorPlan] = useState<'starter' | 'entreprise'>('entreprise')

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
    website_hp: '',
  })

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
    }
  }

  const createOrLinkCompanyDirectly = async (cleanEmail: string, chosenSectors: string[]) => {
    const now = new Date()
    const trialEndsDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const primarySector = chosenSectors[0] || 'boutique'
    const freeTrialSectors = chosenSectors.slice(0, MAX_FREE_TRIAL_SECTORS)

    const { data: existingComp } = await supabase
      .from('companies')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle()

    const chosenPlan = chosenSectors.length > 1 ? 'multisecteur_pro' : singleSectorPlan

    if (existingComp) {
      const { data: updated, error: updErr } = await supabase
        .from('companies')
        .update({
          name: form.company_name.trim(),
          phone: form.phone.trim(),
          city: form.city,
          country: form.country,
          active_sector: primarySector,
          selected_sectors: chosenSectors,
          sectors: chosenSectors,
          onboarding_completed: true,
          subscription_status: 'trial',
          subscription_plan: chosenPlan,
          plan: chosenPlan,
          updated_at: now.toISOString(),
        })
        .eq('id', existingComp.id)
        .select()
        .single()

      if (updErr) throw updErr
      return { company: updated, trialEndsDate, freeTrialSectors }
    }

    const { data: inserted, error: insErr } = await supabase
      .from('companies')
      .insert({
        name: form.company_name.trim(),
        ifu_number: form.ifu_number.trim() || '0000000000000',
        phone: form.phone.trim(),
        email: cleanEmail,
        country: form.country,
        city: form.city,
        active_sector: primarySector,
        selected_sectors: chosenSectors,
        sectors: chosenSectors,
        subscription_status: 'trial',
        onboarding_completed: true,
        currency: 'FCFA',
        subscription_plan: chosenPlan,
        plan: chosenPlan,
      })
      .select()
      .single()

    if (insErr) throw insErr
    return { company: inserted, trialEndsDate, freeTrialSectors }
  }

  const executeRegistration = async () => {
    const cleanSectors = Array.from(
      new Set(form.selected_sectors.map((s) => canonicalSectorSlug(s)).filter(Boolean))
    )
    if (cleanSectors.length === 0) {
      setError('Veuillez sélectionner au moins un secteur d\'activité.')
      return
    }

    setLoading(true)
    setError(null)
    setShowSummaryConfirmModal(false)

    const primarySector = cleanSectors[0]
    const cleanEmail = form.email.trim().toLowerCase()

    try {
      // 1. Appel de l'API serveur sécurisée /api/auth-register
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
            website_hp: form.website_hp,
          }),
        })

        const contentType = apiRes.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const json = await apiRes.json()
          if (json.success && json.data?.companyId) {
            companyId = json.data.companyId
          }
        }
      } catch (_) {
        // Fallback direct Supabase en environnement Vite local
      }

      // 2. Créer ou récupérer le compte Supabase Auth
      let authUserId: string | null = null

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

      authUserId = authData?.user?.id ?? null

      if (!authUserId) {
        throw new Error('Impossible d\'initialiser la session utilisateur. Veuillez vérifier vos informations.')
      }

      // 3. Créer ou récupérer l'entreprise dans `companies`
      if (!companyId) {
        const directRes = await createOrLinkCompanyDirectly(cleanEmail, cleanSectors)
        companyData = directRes.company
        companyId = companyData.id
      } else {
        const { data: fetchedComp } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .single()
        companyData = fetchedComp
      }

      if (!companyId || !companyData) {
        throw new Error('Erreur lors de l\'enregistrement de l\'entreprise.')
      }

      // 4. Initialiser l'essai gratuit de 30 jours (max 3 secteurs) et les secteurs supplémentaires ('en_attente_paiement')
      const now = new Date()
      const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const initialPlan = cleanSectors.length === 1 ? singleSectorPlan : 'entreprise'
      await initialiserSecteursInscription(companyId, cleanSectors, now, trialEnds, initialPlan)

      // 5. Enregistrer les activités dans `company_activities` et `caisses`
      for (let i = 0; i < cleanSectors.length; i++) {
        const slug = cleanSectors[i]
        const isFreeTrial = i < MAX_FREE_TRIAL_SECTORS
        const secMeta = SECTORS_LIST.find((s) => s.slug === slug)
        try {
          const { data: existingAct } = await supabase
            .from('company_activities')
            .select('id')
            .eq('company_id', companyId)
            .eq('sector_slug', slug)
            .maybeSingle()

          if (!existingAct) {
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
          }
        } catch (_) {}
      }

      // 6. Créer ou mettre à jour le profil utilisateur Administrateur
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

      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .or(`auth_user_id.eq.${authUserId},email.ilike.${cleanEmail}`)
        .maybeSingle()

      let profileData: any

      if (existingProfile) {
        const { data: updatedProf, error: pUpdErr } = await supabase
          .from('user_profiles')
          .update({
            company_id: companyId,
            auth_user_id: authUserId,
            full_name: form.responsible_name.trim(),
            username: cleanEmail,
            email: cleanEmail,
            phone: form.phone.trim(),
            role: 'administrateur',
            is_active: true,
            permissions: defaultAdminPermissions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingProfile.id)
          .select()
          .single()
        if (pUpdErr) throw pUpdErr
        profileData = updatedProf
      } else {
        const { data: newProf, error: pInsErr } = await supabase
          .from('user_profiles')
          .insert({
            company_id: companyId,
            auth_user_id: authUserId,
            full_name: form.responsible_name.trim(),
            username: cleanEmail,
            email: cleanEmail,
            phone: form.phone.trim(),
            role: 'administrateur',
            is_active: true,
            permissions: defaultAdminPermissions,
          })
          .select()
          .single()
        if (pInsErr) throw pInsErr
        profileData = newProf
      }

      // 7. Règle métier : l'utilisateur doit obligatoirement confirmer son email avant de se connecter
      if (authData?.session) {
        await supabase.auth.signOut().catch(() => {})
      }

      // Redirection vers la page de connexion avec la notification explicite de confirmation d'email
      navigate(`/login?registered=1&email=${encodeURIComponent(cleanEmail)}`, { replace: true })
    } catch (err: any) {
      console.error('[RegisterPage] Erreur inscription :', err)
      setError(err.message || 'Une erreur est survenue lors de la création de votre compte.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.selected_sectors.length === 0) {
      setError('Veuillez sélectionner au moins un secteur d\'activité.')
      return
    }

    // Si plus de 3 secteurs sont sélectionnés, afficher la modale de confirmation du récapitulatif (Section 2.2)
    if (form.selected_sectors.length > MAX_FREE_TRIAL_SECTORS) {
      setShowSummaryConfirmModal(true)
      return
    }

    await executeRegistration()
  }

  const registrationSummary = calculateRegistrationTrialSummary(form.selected_sectors, 1)

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
              Secteurs d'Activité
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
              {/* Champ Honeypot invisible anti-robots */}
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
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Sélectionnez vos secteurs d'activité
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Votre essai gratuit unique de <strong className="text-emerald-400">30 jours</strong> couvre jusqu'à{' '}
                  <strong className="text-white">3 secteurs d'activité</strong>. Vous pouvez également sélectionner des secteurs supplémentaires dès maintenant.
                </p>
              </div>

              <SectorSelector
                selectedSectors={form.selected_sectors}
                onChange={handleSectorChange}
              />

              {form.selected_sectors.length === 1 && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      Formule choisie pour ce secteur (après votre mois gratuit) :
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Ce plan sera retenu par défaut lors de vos futurs renouvellements dans « Mon Abonnement ».
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSingleSectorPlan('starter')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        singleSectorPlan === 'starter'
                          ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Starter</span>
                        <span className="text-xs font-extrabold text-emerald-400">5 000 FCFA / mois</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Modules essentiels : Ventes POS, Caisse, Stock, Clients.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSingleSectorPlan('entreprise')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        singleSectorPlan === 'entreprise'
                          ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">1 Secteur (Complet)</span>
                        <span className="text-xs font-extrabold text-emerald-400">10 000 FCFA / mois</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Tous les modules débloqués (Comptabilité SYSCOHADA, Trésorerie, Rapports).
                      </p>
                    </button>
                  </div>
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
                      Création de votre espace...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {form.selected_sectors.length > MAX_FREE_TRIAL_SECTORS
                        ? `Vérifier le récapitulatif (${form.selected_sectors.length} secteurs)`
                        : `Démarrer mon essai gratuit (${form.selected_sectors.length} secteur${form.selected_sectors.length > 1 ? 's' : ''})`}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modale de confirmation du récapitulatif si > 3 secteurs sélectionnés (Section 2.2) */}
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
                  Veuillez vérifier le récapitulatif de vos secteurs avant de créer votre compte
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 mb-4 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Nombre total de secteurs sélectionnés</span>
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
                <span className="text-slate-400">Prix unitaire par secteur supplémentaire</span>
                <span className="font-semibold text-slate-200">
                  {registrationSummary.unitPricePerExtraSector.toLocaleString('fr-FR')} FCFA / mois
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-bold text-white">Montant total à payer (secteurs suppl.)</span>
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
                <strong>Secteurs supplémentaires (en attente de paiement) :</strong>{' '}
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
                Modifier mes secteurs
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
