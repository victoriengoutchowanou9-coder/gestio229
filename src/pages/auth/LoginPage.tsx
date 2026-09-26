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
    <div className="min-h-screen flex bg-gradient-to-br from-emerald-50 via-white to-slate-100">
      {/* Panel gauche — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-700 to-emerald-900 flex-col items-center justify-center p-12 text-white">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-3xl bg-white/20 flex items-center justify-center mx-auto mb-6 backdrop-blur-sm shadow-xl">
            <span className="text-4xl font-black text-white">G</span>
          </div>
          <h1 className="text-4xl font-black mb-3">GESTIO 229</h1>
          <p className="text-emerald-200 text-lg font-medium mb-2">Votre gestion, au standard du Bénin</p>
          <p className="text-emerald-300 text-sm leading-relaxed">
            Plateforme ERP & SaaS Multi-Activités — Commerce, Poissonnerie, Quincaillerie,
            Pharmacie, Restaurant et bien plus.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 text-left">
            <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-2xl font-black">100%</p>
              <p className="text-emerald-300 text-xs mt-1">Conforme DGI Bénin (e-MECeF)</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-2xl font-black">15+</p>
              <p className="text-emerald-300 text-xs mt-1">Secteurs métiers intégrés</p>
            </div>
          </div>
        </div>
      </div>

      {/* Panel droit — formulaire unifié */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <span className="text-3xl font-black text-white">G</span>
            </div>
            <h1 className="text-2xl font-black text-slate-800">GESTIO 229</h1>
            <p className="text-xs text-slate-500 mt-1">SaaS Multi-Secteurs & Multi-Tenants</p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Connexion</h2>
              <p className="text-slate-500 text-xs mt-1">
                Administrateurs (email) & Utilisateurs internes (identifiant)
              </p>
            </div>

            {/* Notification de confirmation email réussie */}
            {confirmedSuccess && (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-300 rounded-2xl p-4 mb-6 animate-fadeIn">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900">
                  <p className="font-bold">Adresse email confirmée avec succès !</p>
                  <p className="mt-0.5">Saisissez votre mot de passe pour ouvrir immédiatement votre HUB.</p>
                </div>
              </div>
            )}

            {/* Notification après inscription (attente confirmation email) */}
            {isRegistered && !confirmedSuccess && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6">
                <Mail className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold">Compte enregistré !</p>
                  <p className="mt-0.5">Vérifiez vos emails et cliquez sur le lien d'activation avant de vous connecter.</p>
                </div>
              </div>
            )}

            {/* Message d'erreur */}
            {errorMessage && (
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 animate-shake">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 font-medium leading-relaxed">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Champ Unique : Adresse email / Identifiant */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
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
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition disabled:bg-slate-100"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Admin : utilisez votre email. Utilisateur de secteur : utilisez votre identifiant.
                </p>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Mot de passe
                </label>
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
                    className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
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
            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                Vous n'avez pas encore d'espace ?{' '}
                <Link to="/register" className="text-emerald-600 font-bold hover:underline">
                  Inscrire mon entreprise
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
