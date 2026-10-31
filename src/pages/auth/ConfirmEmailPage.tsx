// =============================================================================
// GESTIO 229 SaaS — ConfirmEmailPage : Blocage d'accès et vérification obligatoire
// =============================================================================

import React, { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Mail, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export const ConfirmEmailPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const queryParams = new URLSearchParams(location.search)
  const urlEmail = queryParams.get('email') || (location.state as any)?.email || ''

  const [emailInput, setEmailInput] = useState<string>(urlEmail)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)

  const handleResend = async () => {
    const target = emailInput.trim().toLowerCase()
    if (!target || !target.includes('@')) {
      setResendError('Veuillez renseigner une adresse email valide.')
      return
    }

    setResendLoading(true)
    setResendSuccess(null)
    setResendError(null)

    try {
      // 1. Tenter le renvoi par notre endpoint serveur avec traçabilité et journalisation
      const res = await fetch('/api/resend-confirmation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setResendSuccess(data.message || '✅ Nouveau lien envoyé ! Pensez à vérifier vos spams ou courriers indésirables.')
        return
      }

      // 2. Repli Supabase Auth
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true&email=${encodeURIComponent(target)}`,
        },
      })

      if (error) throw error

      setResendSuccess('✅ Nouveau lien envoyé ! Pensez à vérifier vos spams ou courriers indésirables.')
    } catch (err: any) {
      setResendError(err.message || "Erreur lors de l'envoi de l'email.")
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fadeIn">
        {/* Icône d'en-tête */}
        <div className="w-20 h-20 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-amber-500/10">
          <Mail className="w-10 h-10 animate-bounce" />
        </div>

        {/* Titres */}
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30 mb-3">
            <ShieldAlert className="w-3.5 h-3.5" />
            Activation de compte requise
          </span>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Confirmez votre adresse email
          </h1>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Pour accéder à votre espace <strong>GESTIO 229 (HUB)</strong>, vous devez obligatoirement confirmer votre adresse email.
          </p>
        </div>

        {/* Bloc d'instructions */}
        <div className="bg-slate-950/70 border border-amber-500/30 rounded-2xl p-5 text-left space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <p className="text-xs text-slate-200 leading-relaxed">
              Nous avons envoyé un lien de confirmation à{' '}
              <strong className="text-emerald-400 font-mono text-xs">{emailInput || 'votre adresse email'}</strong>.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <p className="text-xs text-slate-200 leading-relaxed">
              Cliquez sur le lien reçu dans votre messagerie pour activer immédiatement votre compte.
            </p>
          </div>
          <div className="flex items-start gap-3 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200 leading-relaxed">
              <strong>Pensez à vérifier vos SPAM :</strong> Si le mail n'apparaît pas dans votre boîte de réception principale d'ici 1 minute, vérifiez votre dossier <em>Courriers indésirables / Spams</em>.
            </p>
          </div>
        </div>

        {/* Messages d'état */}
        {resendSuccess && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold text-left flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{resendSuccess}</span>
          </div>
        )}

        {resendError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold text-left flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{resendError}</span>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="space-y-3 pt-2">
          {/* Bouton principal : Vers Login */}
          <button
            type="button"
            onClick={() => navigate(`/login?confirmed_reminder=1&email=${encodeURIComponent(emailInput)}`, { replace: true })}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>J'ai confirmé mon email → Se connecter</span>
          </button>

          {/* Bouton secondaire : Renvoyer l'email */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="text-xs font-bold text-slate-400 hover:text-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
              <span>{resendLoading ? 'Envoi en cours...' : "Vous n'avez pas reçu le mail ? Renvoyer le lien"}</span>
            </button>
          </div>
        </div>

        {/* Pied de page */}
        <div className="border-t border-slate-800 pt-4 text-xs text-slate-500 flex items-center justify-between">
          <Link to="/register" className="hover:text-slate-300 transition-colors">
            ← Modifier mes informations
          </Link>
          <Link to="/login" className="text-emerald-400 font-bold hover:underline">
            Page de connexion
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ConfirmEmailPage
