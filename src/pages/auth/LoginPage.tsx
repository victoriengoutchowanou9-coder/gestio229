// =============================================================================
// GESTIO 229 SaaS — Page Login
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, status, errorMessage, clearError } = useAuthStore()

  const urlEmail = searchParams.get('email') || ''
  const isSuccess = searchParams.get('success') === 'compte_cree' || searchParams.get('activated') === '1'

  const [email, setEmail] = useState(urlEmail || '')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => {
    if (urlEmail) {
      setEmail(urlEmail)
    }
  }, [urlEmail])

  const isLoading = status === 'loading'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    const result = await login(email, password)
    if (result.success) {
      // CORRECTION: Redirection stricte vers le HUB
      navigate('/hub', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-emerald-50 via-white to-slate-100">
      {/* Panel gauche — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-700 to-emerald-900 flex-col items-center justify-center p-12 text-white">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-3xl bg-white/20 flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <span className="text-4xl font-black text-white">G</span>
          </div>
          <h1 className="text-4xl font-black mb-3">GESTIO 229</h1>
          <p className="text-emerald-200 text-lg font-medium mb-2">Votre gestion, au standard du Bénin</p>
          <p className="text-emerald-300 text-sm">
            Logiciel ERP multi-activités — Commerce, Restaurant, Pharmacie,<br />
            Station-service et plus encore.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: 'Entreprises actives', value: '1 200+' },
              { label: 'Secteurs supportés', value: '12+' },
              { label: 'Uptime', value: '99.9%' },
              { label: 'Support Bénin', value: '24/7' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 rounded-2xl p-4">
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-emerald-300 text-xs mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel droit — formulaire */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl font-black text-white">G</span>
            </div>
            <h1 className="text-2xl font-black text-slate-800">GESTIO 229</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Connexion</h2>
            <p className="text-slate-500 text-sm mb-6">Accédez à votre espace de gestion</p>

            {/* Notification de succès après inscription */}
            {isSuccess && (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-300 rounded-xl p-4 mb-6">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800">
                  <p className="font-bold">Compte initialisé avec succès !</p>
                  <p className="mt-0.5">Saisissez votre mot de passe pour ouvrir votre <strong>HUB Central</strong>.</p>
                </div>
              </div>
            )}

            {/* Erreur */}
            {errorMessage && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Adresse email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@monentreprise.bj"
                    required
                    disabled={isLoading}
                    className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
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
                    className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Bouton connexion */}
              <button
                type="submit"
                disabled={isLoading || !email || !password}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all',
                  isLoading || !email || !password
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] shadow-lg shadow-emerald-200'
                )}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Se connecter
                  </>
                )}
              </button>
            </form>

            {/* Compte test */}
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
              <p className="text-xs font-semibold text-emerald-700 mb-1">🧪 Compte de démonstration</p>
              <p className="text-xs text-emerald-600">
                Email : <code className="bg-white px-1 rounded">admin@gestio229.bj</code><br />
                Mot de passe : <code className="bg-white px-1 rounded">Gestio229!</code>
              </p>
            </div>

            <p className="text-center text-sm text-slate-500 mt-6">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-emerald-600 font-semibold hover:underline">
                Créer un compte
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
