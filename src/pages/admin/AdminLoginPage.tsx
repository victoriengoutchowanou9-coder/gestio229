// =============================================================================
// GESTIO 229 ADMIN — Page de Connexion Super Administrateur
// Totalement séparée de la connexion entreprise (/admin/login)
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../../store/adminStore'
import { Eye, EyeOff, Shield, LogIn } from 'lucide-react'

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate()
  const { login, isAuthenticated, isLoading, errorMessage, clearError } = useAdminStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Si déjà connecté → redirection vers le dashboard
  useEffect(() => {
    if (isAuthenticated) navigate('/admin/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (!username.trim() || !password) return
    const result = await login(username.trim(), password)
    if (result.success) {
      navigate('/admin/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4">
      {/* Fond décoratif */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card principale */}
        <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
          {/* En-tête */}
          <div className="bg-gradient-to-r from-emerald-900/60 to-slate-900/60 border-b border-slate-700 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              GESTIO 229 ADMIN
            </h1>
            <p className="text-emerald-400 text-sm font-medium mt-1">
              Espace privé du concepteur
            </p>
            <div className="mt-3 inline-flex items-center gap-2 bg-slate-800/60 border border-slate-600 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-slate-300 text-xs font-semibold">ESPACE PROPRIÉTAIRE / SUPER ADMIN</span>
            </div>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {/* Erreur */}
            {errorMessage && (
              <div className="bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3 text-red-300 text-sm">
                {errorMessage}
              </div>
            )}

            {/* Identifiant */}
            <div className="space-y-2">
              <label className="block text-slate-300 text-sm font-semibold">Identifiant</label>
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={username}
                onChange={(e) => { setUsername(e.target.value); clearError() }}
                placeholder="Votre identifiant"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm"
                required
                disabled={isLoading}
              />
            </div>

            {/* Mot de passe */}
            <div className="space-y-2">
              <label className="block text-slate-300 text-sm font-semibold">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError() }}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition text-sm"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Bouton connexion */}
            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-emerald-900/30 text-sm"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Vérification en cours...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  SE CONNECTER
                </>
              )}
            </button>
          </form>

          {/* Pied de page */}
          <div className="border-t border-slate-800 px-8 py-4 text-center">
            <p className="text-slate-600 text-xs">
              Accès réservé exclusivement au propriétaire de la plateforme.
            </p>
          </div>
        </div>

        {/* Lien retour discret */}
        <p className="text-center mt-6 text-slate-600 text-xs">
          <a href="/login" className="hover:text-slate-400 transition">
            ← Espace Entreprises
          </a>
        </p>
      </div>
    </div>
  )
}

export default AdminLoginPage
