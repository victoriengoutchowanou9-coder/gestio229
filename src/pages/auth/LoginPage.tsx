// =============================================================================
// GESTIO 229 SaaS — Page Login Unifiée (Administrateur & Utilisateurs Internes)
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { UserCheck, Lock, Eye, EyeOff, LogIn, AlertCircle, CheckCircle2, Mail, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, status, errorMessage, clearError, refreshTenantContext } = useAuthStore()

  const urlEmail = searchParams.get('email') || ''
  const isConfirmed = searchParams.get('confirmed') === 'true' || searchParams.get('confirmed') === '1'
  const isRegistered = searchParams.get('registered') === '1' || searchParams.get('success') === 'compte_cree'

  const [identifier, setIdentifier] = useState(urlEmail || '')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [confirmedSuccess, setConfirmedSuccess] = useState(isConfirmed)

  // Modal Mot de passe oublié
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [forgotError, setForgotError] = useState('')

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError('Veuillez saisir une adresse email valide.')
      return
    }

    setForgotLoading(true)
    setForgotError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/login`
      })
      if (error) throw error
      setForgotSuccess(true)
    } catch (err: any) {
      setForgotError(err.message || 'Impossible d\'envoyer le lien de réinitialisation.')
    } finally {
      setForgotLoading(false)
    }
  }

  useEffect(() => {
    if (urlEmail) {
      setIdentifier(urlEmail)
    }

    // Détection d'un retour de lien magique ou confirmation de hash Supabase
    if (window.location.hash.includes('access_token')) {
      setConfirmedSuccess(true)
      // Tenter de récupérer la session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) {
          setIdentifier(session.user.email)
        }
      })
    }
  }, [urlEmail])

  const isLoading = status === 'loading'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    const result = await login(identifier, password)
    if (result.success) {
      const target = result.redirectTo || '/hub'
      navigate(target, { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Panel gauche — Image professionnelle Port Conteneurs & Import/Export */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 text-white overflow-hidden">
        {/* Image de fond : Port Autonome & Conteneurs */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-105"
          style={{ backgroundImage: "url('/images/port-cotonou.jpg')" }}
        />
        {/* Overlay dégradé professionnel */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-emerald-950/75 to-slate-900/90 backdrop-blur-[2px]" />

        {/* Header panel gauche */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center font-black text-2xl text-white shadow-lg">
              G
            </div>
            <div>
              <span className="font-black text-2xl tracking-tight text-white">GESTIO 229</span>
              <span className="ml-2 text-[10px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full">
                SaaS Entreprise Bénin 🇧🇯
              </span>
            </div>
          </div>
        </div>

        {/* Message central portuaire & échanges ouest-africains */}
        <div className="relative z-10 max-w-lg my-auto py-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 mb-4 backdrop-blur-sm">
            Commerce · Import/Export · Logistique · UEMOA
          </span>
          <h1 className="text-3xl xl:text-4xl font-black leading-tight text-white">
            La plateforme intégrée des entreprises en Afrique de l'Ouest
          </h1>
          <p className="text-emerald-100/90 text-sm mt-3 leading-relaxed">
            Du commerce général aux flux maritimes et import-export, pilotez vos ventes, stocks, caisses et comptabilité SYSCOHADA en toute sérénité.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 text-left">
            <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md border border-white/10">
              <p className="text-2xl font-black text-emerald-300">100% Conforme</p>
              <p className="text-slate-200 text-xs mt-1">DGI Bénin (e-MECeF) & SYSCOHADA Révisé</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md border border-white/10">
              <p className="text-2xl font-black text-emerald-300">15+ Métiers</p>
              <p className="text-slate-200 text-xs mt-1">Poissonnerie, Quincaillerie, Print, etc.</p>
            </div>
          </div>
        </div>

        {/* Footer panel gauche */}
        <div className="relative z-10 text-xs text-emerald-200/70">
          © 2026 GESTIO 229 ERP · Hub Économique & Commercial UEMOA
        </div>
      </div>

      {/* Panel droit — formulaire unifié */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo & Bannière portuaire mobile */}
          <div className="lg:hidden text-center mb-6">
            <div className="relative rounded-2xl overflow-hidden shadow-md mb-4 h-28 border border-slate-200 dark:border-slate-700">
              <img
                src="/images/port-cotonou.jpg"
                alt="Port Autonome de Cotonou - Commerce & Logistique"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-transparent flex items-end p-3">
                <span className="text-[10px] font-bold text-white uppercase tracking-wider bg-emerald-600/80 backdrop-blur-sm px-2.5 py-0.5 rounded-md">
                  Port de Cotonou · Commerce &amp; Logistique
                </span>
              </div>
            </div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">GESTIO 229</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">SaaS Multi-Secteurs &amp; Multi-Tenants</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Connexion</h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                Administrateurs (email) &amp; Utilisateurs internes (identifiant)
              </p>
            </div>

            {/* Notification de confirmation email réussie */}
            {confirmedSuccess && (
              <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-2xl p-4 mb-6 animate-fadeIn">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 dark:text-emerald-200">
                  <p className="font-bold">Adresse email confirmée avec succès !</p>
                  <p className="mt-0.5">Saisissez votre mot de passe pour ouvrir immédiatement votre HUB.</p>
                </div>
              </div>
            )}

            {/* Notification après inscription (attente confirmation email) */}
            {isRegistered && !confirmedSuccess && (
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-2xl p-4 mb-6">
                <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-bold">Compte enregistré !</p>
                  <p className="mt-0.5">Vérifiez vos emails et cliquez sur le lien d'activation avant de vous connecter.</p>
                </div>
              </div>
            )}

            {/* Message d'erreur */}
            {errorMessage && (
              <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 mb-6 animate-shake">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Champ Unique : Adresse email / Identifiant */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Adresse email / Identifiant
                </label>
                <div className="relative">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin@monentreprise.bj ou identifiant"
                    required
                    disabled={isLoading}
                    autoComplete="username"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition disabled:bg-slate-100"
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Admin : utilisez votre email. Utilisateur de secteur : utilisez votre identifiant.
                </p>
              </div>

              {/* Mot de passe avec lien Oublié */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Mot de passe
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(identifier.includes('@') ? identifier : '')
                      setForgotSuccess(false)
                      setForgotError('')
                      setShowForgotModal(true)
                    }}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="w-full pl-11 pr-12 py-3 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Bouton de connexion */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Se connecter</span>
                  </>
                )}
              </button>
            </form>

            {/* Lien Inscription */}
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vous n'avez pas encore d'espace ?{' '}
                <Link to="/register" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
                  Inscrire mon entreprise (1er mois gratuit)
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL MOT DE PASSE OUBLIÉ (CDC Section 11) */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <Mail className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Mot de passe oublié
                </h3>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg"
              >
                ×
              </button>
            </div>

            {forgotSuccess ? (
              <div className="space-y-4 text-center py-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Lien de réinitialisation envoyé !
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Consultez votre boîte de réception à l'adresse <strong>{forgotEmail}</strong> et suivez les instructions pour définir un nouveau mot de passe.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition"
                >
                  Retour à la connexion
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Saisissez l'adresse email associée à votre compte administrateur. Vous recevrez un lien sécurisé pour réinitialiser votre mot de passe.
                </p>

                {forgotError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                    {forgotError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Votre Adresse Email
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="admin@monentreprise.bj"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {forgotLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Envoyer le lien</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
