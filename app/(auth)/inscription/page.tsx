// =============================================================================
// GESTIO 229 SaaS — Inscription Multi-Secteurs & Multi-Tenants (Stepper 2 Étapes)
// =============================================================================

import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Building2,
  User,
  Phone,
  Mail,
  Lock,
  MapPin,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Globe,
  Sparkles
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import SectorSelector, { ALL_SECTORS } from '../../components/auth/SectorSelector'

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    company_name: '',
    ifu_number: '',
    responsible_name: '',
    phone: '',
    email: '',
    password: '',
    country: 'Bénin',
    city: 'Cotonou',
    selected_sectors: [] as string[]
  })

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const toggleSector = (id: string) => {
    setForm((prev) => {
      const exists = prev.selected_sectors.includes(id)
      return {
        ...prev,
        selected_sectors: exists
          ? prev.selected_sectors.filter((s) => s !== id)
          : [...prev.selected_sectors, id]
      }
    })
  }

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.company_name.trim()) {
      setError("Veuillez saisir le nom de l'entreprise.")
      return
    }
    if (!form.responsible_name.trim()) {
      setError('Veuillez renseigner le nom du responsable.')
      return
    }
    if (!form.phone.trim()) {
      setError('Veuillez saisir un numéro de téléphone valide.')
      return
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setError('Veuillez saisir une adresse email valide.')
      return
    }
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFinalSubmit = async () => {
    if (form.selected_sectors.length === 0) {
      setError('Veuillez sélectionner au moins un secteur d’activité.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 1. Création du compte utilisateur Auth Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password
      })

      if (authError && !authError.message.includes('already registered')) {
        throw new Error(authError.message)
      }

      // 2. Création de l'entreprise (Company)
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: form.company_name.trim(),
          ifu_number: form.ifu_number.trim() || '0000000000000',
          phone: form.phone.trim(),
          email: form.email.trim().toLowerCase(),
          country: form.country,
          city: form.city.trim(),
          subscription_status: 'active',
          onboarding_completed: true,
          currency: 'FCFA'
        })
        .select()
        .single()

      if (companyError) throw new Error(companyError.message)

      // 3. Liaison Multi-Secteurs (company_sectors)
      // On insère pour chaque secteur coché (ex: Quincaillerie + Poissonnerie + Restaurant)
      for (const sectorKey of form.selected_sectors) {
        const matchedSector = ALL_SECTORS.find(
          (s) => s.id === sectorKey || s.slug === sectorKey
        )
        const slug = matchedSector ? matchedSector.slug : sectorKey

        await supabase.from('company_sectors').insert({
          company_id: company.id,
          sector_slug: slug,
          sector_name: matchedSector ? matchedSector.name : slug,
          is_configured: true,
          configuration: {
            currency: 'FCFA',
            billing_mode: 'direct',
            point_of_sale_name: `${form.company_name} — ${matchedSector ? matchedSector.name : slug}`
          }
        })
      }

      // 4. Création de l'abonnement Solo ou Multiservices
      const planType = form.selected_sectors.length > 1 ? 'MULTISERVICES' : 'SOLO'
      const expiresDate = new Date()
      expiresDate.setDate(expiresDate.getDate() + 30) // 30 jours offerts / essai actif

      await supabase.from('subscriptions').insert({
        company_id: company.id,
        plan: planType,
        status: 'active',
        sectors_count: form.selected_sectors.length,
        price_monthly: planType === 'MULTISERVICES' ? 25000 : 10000,
        currency: 'FCFA',
        starts_at: new Date().toISOString(),
        expires_at: expiresDate.toISOString()
      })

      // 5. Profil Administrateur
      await supabase.from('user_profiles').insert({
        company_id: company.id,
        auth_user_id: authData?.user?.id,
        full_name: form.responsible_name.trim(),
        username: form.email.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: 'administrateur',
        is_active: true
      })

      setSuccess(true)
      setTimeout(() => {
        navigate('/tableau-de-bord')
      }, 2000)
    } catch (err: any) {
      console.error('[GESTIO 229] Erreur inscription:', err)
      setError(err.message || "Une erreur est survenue lors de l'inscription.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl animate-scaleUp">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">Entreprise configurée avec succès !</h2>
          <p className="text-slate-600 text-sm mt-2">
            Bienvenue sur GESTIO 229, <strong>{form.company_name}</strong>.
            Vos <strong>{form.selected_sectors.length} secteurs d'activités</strong> ont été initialisés.
          </p>
          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium">
            Redirection automatique vers votre <strong>Tableau de Bord</strong>...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
      {/* Barre de navigation simplifiée */}
      <header className="bg-slate-900 border-b border-slate-800 text-white py-4 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center font-black text-white text-base shadow-md">
              G
            </div>
            <div>
              <span className="font-black text-lg tracking-tight">GESTIO 229</span>
              <span className="ml-2 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                SaaS Bénin 🇧🇯
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Déjà inscrit ?{' '}
            <Link to="/connexion" className="text-indigo-400 font-bold hover:underline">
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      {/* Corps principal */}
      <main className="flex-1 py-8 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        {/* Stepper visuel 1 -> 2 */}
        <div className="mb-8 max-w-lg mx-auto">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 -z-0" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-600 transition-all duration-500 -z-0"
              style={{ width: step === 1 ? '0%' : '100%' }}
            />

            <div className="flex flex-col items-center gap-1 z-10">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  step >= 1 ? 'bg-indigo-600 text-white shadow-md ring-4 ring-white' : 'bg-slate-300 text-slate-600'
                }`}
              >
                1
              </div>
              <span className="text-[11px] font-bold text-slate-700">Entreprise &amp; Contact</span>
            </div>

            <div className="flex flex-col items-center gap-1 z-10">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  step === 2 ? 'bg-indigo-600 text-white shadow-md ring-4 ring-white' : 'bg-slate-300 text-slate-600'
                }`}
              >
                2
              </div>
              <span className="text-[11px] font-bold text-slate-700">Choix Multi-Secteurs</span>
            </div>
          </div>
        </div>

        {/* Message d'erreur global */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-semibold flex items-center gap-3 animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Contenu de l'étape */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xl">
          {step === 1 ? (
            <form onSubmit={handleStep1Submit} className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  Informations sur votre Entreprise
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Renseignez les données légales et les coordonnées de contact de votre établissement.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Nom Entreprise */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nom Commercial / Raison Sociale *
                  </label>
                  <div className="relative">
                    <Building2 className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={form.company_name}
                      onChange={(e) => update('company_name', e.target.value)}
                      placeholder="Ex: ETS BIO BÉNIN, QUINCAILLERIE DU NORD..."
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Numéro IFU */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Numéro IFU (13 chiffres)
                  </label>
                  <div className="relative">
                    <FileText className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={13}
                      value={form.ifu_number}
                      onChange={(e) => update('ifu_number', e.target.value)}
                      placeholder="Ex: 3202612345678"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Nom du Responsable */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nom &amp; Prénom du Responsable *
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={form.responsible_name}
                      onChange={(e) => update('responsible_name', e.target.value)}
                      placeholder="Ex: KODJO Jean-Baptiste"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Téléphone / WhatsApp */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Téléphone / WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      placeholder="+229 97 00 00 00"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Email professionnel */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Email de connexion *
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="contact@monentreprise.bj"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Mot de passe */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Mot de passe sécurisé *
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      placeholder="Minimum 6 caractères"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Pays */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Pays
                  </label>
                  <div className="relative">
                    <Globe className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={form.country}
                      onChange={(e) => update('country', e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="Bénin">Bénin 🇧🇯</option>
                      <option value="Togo">Togo 🇹🇬</option>
                      <option value="Côte d'Ivoire">Côte d'Ivoire 🇨🇮</option>
                      <option value="Sénégal">Sénégal 🇸🇳</option>
                      <option value="Burkina Faso">Burkina Faso 🇧🇫</option>
                      <option value="Niger">Niger 🇳🇪</option>
                    </select>
                  </div>
                </div>

                {/* Ville */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Ville
                  </label>
                  <div className="relative">
                    <MapPin className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => update('city', e.target.value)}
                      placeholder="Cotonou, Calavi, Porto-Novo, Parakou..."
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-sm rounded-xl shadow-lg shadow-indigo-950/30 flex items-center space-x-2 transition-all"
                >
                  <span>Continuer vers le Choix des Secteurs</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <SectorSelector
              selected={form.selected_sectors}
              onToggle={toggleSector}
              onBack={() => setStep(1)}
              onContinue={handleFinalSubmit}
              submitting={loading}
            />
          )}
        </div>
      </main>

      {/* Pied de page */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200">
        © 2026 GESTIO 229 ERP Bénin · Conforme SYSCOHADA &amp; DGI e-MECeF
      </footer>
    </div>
  )
}

export default RegisterPage
