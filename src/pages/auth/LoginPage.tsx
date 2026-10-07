// =============================================================================
// GESTIO 229 SaaS — Page Login Unifiée (Administrateur & Utilisateurs Internes)
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  UserCheck, Lock, Eye, EyeOff, LogIn, AlertCircle, CheckCircle2,
  Mail, Download, Smartphone, Laptop, Clock, Sparkles, Sun, Moon,
  ShieldCheck, HelpCircle, X
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'
import { rateLimiter } from '../../lib/rateLimiter'

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
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const errorParam = searchParams.get('error')
  const [urlError, setUrlError] = useState<string | null>(
    errorParam === 'sector_unsubscribed' ? "Secteur non souscrit, contactez l'administrateur." : null
  )

  // Modal Mot de passe oublié
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [forgotError, setForgotError] = useState('')

  // Modal Définition Nouveau Mot de passe (Password Recovery)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetPwdLoading, setResetPwdLoading] = useState(false)
  const [resetPwdError, setResetPwdError] = useState('')
  const [resetPwdSuccess, setResetPwdSuccess] = useState(false)

  // Horloge temps réel (Mardi 29 septembre 2026 — 14:35)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  // Installation PWA (PC & Mobile)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(
    typeof window !== 'undefined' ? (window as any).__gestio_deferred_prompt || null : null
  )
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [isAppInstalled, setIsAppInstalled] = useState(false)

  // Détection de la plateforme (iOS, Android, Desktop)
  const userPlatform = useMemo<'ios' | 'android' | 'desktop'>(() => {
    if (typeof navigator === 'undefined') return 'desktop'
    const ua = navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua)) return 'ios'
    if (/android/.test(ua)) return 'android'
    return 'desktop'
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // ── Détection robuste d'installation PWA ────────────────────────────────
    // Règle : le bouton "Installer" doit TOUJOURS se réactiver si l'app
    // n'est plus installée (désinstallée). On NE se fie JAMAIS uniquement
    // au localStorage — on vérifie l'état réel du navigateur à chaque fois.

    const isReallyInstalled = (): boolean => {
      // Vérification de l'environnement d'affichage (standalone = app installée active)
      const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches
      const standaloneNav = (window.navigator as any).standalone === true
      const androidApp = document.referrer.startsWith('android-app://')
      return standaloneMedia || standaloneNav || androidApp
    }

    const updateInstallState = () => {
      const installed = isReallyInstalled()
      setIsAppInstalled(installed)
      // Synchroniser le localStorage avec la réalité (si désinstallé, on nettoie)
      if (!installed) {
        try { localStorage.removeItem('gestio_pwa_installed') } catch (_) {}
      }
    }

    // Vérification initiale
    updateInstallState()

    // 2. Vérifier si un prompt a déjà été capturé avant le montage React
    if ((window as any).__gestio_deferred_prompt) {
      setDeferredPrompt((window as any).__gestio_deferred_prompt)
    }

    // 3. Écouter l'événement standard beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      ;(window as any).__gestio_deferred_prompt = e
      setDeferredPrompt(e)
      // Si on reçoit beforeinstallprompt, l'app n'est PAS installée → réactiver le bouton
      setIsAppInstalled(false)
      try { localStorage.removeItem('gestio_pwa_installed') } catch (_) {}
    }

    // 4. Écouter l'événement personnalisé dispatched par index.html
    const handleCustomPrompt = (e: any) => {
      if (e.detail) {
        setDeferredPrompt(e.detail)
        setIsAppInstalled(false)
      }
    }

    // 5. Écouter la confirmation d'installation
    const handleAppInstalled = () => {
      setIsAppInstalled(true)
      setDeferredPrompt(null)
      ;(window as any).__gestio_deferred_prompt = null
      try {
        localStorage.setItem('gestio_pwa_installed', 'true')
      } catch (e) {}
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('gestio-pwa-installable', handleCustomPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('gestio-pwa-installed', handleAppInstalled)

    // 6. Écouter les changements de display-mode (détecte désinstallation en direct)
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsAppInstalled(true)
      } else {
        // L'app vient de sortir du mode standalone → désinstallée ou changement de fenêtre
        setIsAppInstalled(false)
        setDeferredPrompt(null)
        try { localStorage.removeItem('gestio_pwa_installed') } catch (_) {}
      }
    }
    mediaQuery.addEventListener?.('change', handleMediaChange)

    // 7. Polling toutes les 3 secondes pour détecter les désinstallations (surtout mobile)
    const pollInterval = setInterval(() => {
      const nowInstalled = isReallyInstalled()
      setIsAppInstalled((prev) => {
        if (prev !== nowInstalled) {
          if (!nowInstalled) {
            // Désinstallé : remettre le deferredPrompt si disponible pour réactiver le bouton
            try { localStorage.removeItem('gestio_pwa_installed') } catch (_) {}
          }
          return nowInstalled
        }
        return prev
      })
    }, 3000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('gestio-pwa-installable', handleCustomPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('gestio-pwa-installed', handleAppInstalled)
      mediaQuery.removeEventListener?.('change', handleMediaChange)
      clearInterval(pollInterval)
    }
  }, [])

  const handleInstallClick = async () => {
    const prompt = deferredPrompt || (window as any).__gestio_deferred_prompt
    if (prompt) {
      try {
        await prompt.prompt()
        const { outcome } = await prompt.userChoice
        if (outcome === 'accepted') {
          setIsAppInstalled(true)
          try {
            localStorage.setItem('gestio_pwa_installed', 'true')
          } catch (e) {}
        }
      } catch (err) {
        console.warn('[PWA] Erreur lors de l\'installation native :', err)
        setShowInstallGuide(true)
      } finally {
        setDeferredPrompt(null)
        ;(window as any).__gestio_deferred_prompt = null
      }
    } else {
      setShowInstallGuide(true)
    }
  }

  // Formatage date en français avec majuscule : Mardi 29 septembre 2026 — 14:35
  const formattedDateTime = useMemo(() => {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ]
    const dayName = days[currentTime.getDay()]
    const dayNum = currentTime.getDate()
    const monthName = months[currentTime.getMonth()]
    const year = currentTime.getFullYear()
    const hours = String(currentTime.getHours()).padStart(2, '0')
    const minutes = String(currentTime.getMinutes()).padStart(2, '0')
    return `${dayName} ${dayNum} ${monthName} ${year} — ${hours}:${minutes}`
  }, [currentTime])

  // Pensée de l'entrepreneur avec rotation jour (05h-17h) / soir (18h-04h)
  const entrepreneurQuote = useMemo(() => {
    const hour = currentTime.getHours()
    const isMorning = hour >= 5 && hour < 18
    const morningQuotes = [
      { text: "Le succès en affaires n'est pas le fruit du hasard, mais de la constance dans l'effort et de la maîtrise quotidienne de ses chiffres.", author: "Discipline Commerciale & Croissance" },
      { text: "Chaque matin en Afrique, le commerce s'éveille : structurez vos ambitions et transformez chaque opportunité en valeur durable.", author: "Action & Leadership Africain" },
      { text: "L'excellence opérationnelle commence par une gestion rigoureuse dès la première vente du jour.", author: "Rigueur Opérationnelle & Caisse" },
      { text: "La rapidité d'exécution et la fidélité de vos clients se bâtissent sur la précision de vos comptes.", author: "Efficacité & Confiance Client" },
    ]
    const eveningQuotes = [
      { text: "Faites le bilan de votre journée avec lucidité : ce qui est mesuré avec précision se développe avec certitude.", author: "Bilan du Soir & Stratégie" },
      { text: "La paix d'esprit de l'entrepreneur repose sur une caisse exacte et une vision limpide de ses stocks.", author: "Sérénité du Dirigeant & Clôture" },
      { text: "Bâtir une entreprise pérenne, c'est semer la rigueur aujourd'hui pour récolter la prospérité demain.", author: "Vision Long Terme & Pérennité" },
      { text: "Une journée bien clôturée est le meilleur tremplin pour les victoires de demain.", author: "Préparation & Contrôle de Gestion" },
    ]
    const list = isMorning ? morningQuotes : eveningQuotes
    const dayIndex = currentTime.getDate() % list.length
    return {
      quote: list[dayIndex].text,
      theme: list[dayIndex].author,
      isMorning
    }
  }, [currentTime])

  // Réinitialisation de mot de passe intelligente (Email + Réinitialisation Directe Secours)
  const [resetStep, setResetStep] = useState<'request' | 'direct_reset'>('request')
  const [directPhone, setDirectPhone] = useState('')
  const [directNewPassword, setDirectNewPassword] = useState('')

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetEmail = forgotEmail.trim().toLowerCase()
    if (!targetEmail) {
      setForgotError('Veuillez saisir votre adresse email.')
      return
    }

    setForgotLoading(true)
    setForgotError('')
    try {
      // 1. Tenter l'envoi classique via Supabase Auth
      let emailSent = false
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
          redirectTo: `${window.location.origin}/login`
        })
        if (!error) emailSent = true
      } catch (_) {}

      // 2. Vérifier si le profil existe dans user_profiles
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, phone')
        .ilike('email', targetEmail)
        .maybeSingle()

      if (!profile) {
        if (!emailSent) {
          throw new Error('Aucun compte trouvé avec cette adresse email.')
        }
      }

      // Si l'email a pu être demandé ou si le profil existe, proposer la double option
      setForgotSuccess(true)
    } catch (err: any) {
      // Si l'envoi par email échoue (SMTP Supabase limité), basculer immédiatement en réinitialisation directe
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, phone')
        .ilike('email', targetEmail)
        .maybeSingle()

      if (profile) {
        setResetStep('direct_reset')
        setForgotError('')
      } else {
        setForgotError(err.message || 'Impossible de réinitialiser le mot de passe.')
      }
    } finally {
      setForgotLoading(false)
    }
  }

  const handleDirectResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetEmail = forgotEmail.trim().toLowerCase()
    if (!directNewPassword || directNewPassword.length < 6) {
      setForgotError('Le nouveau mot de passe doit comporter au moins 6 caractères.')
      return
    }

    setForgotLoading(true)
    setForgotError('')
    try {
      // Vérifier le profil
      const { data: profile, error: pErr } = await supabase
        .from('user_profiles')
        .select('id, phone, email')
        .ilike('email', targetEmail)
        .maybeSingle()

      if (pErr || !profile) {
        throw new Error('Compte introuvable.')
      }

      // Si un numéro a été renseigné lors de l'inscription, vérifier la concordance
      if (profile.phone && directPhone.trim()) {
        const cleanProfPhone = profile.phone.replace(/\D/g, '')
        const cleanInputPhone = directPhone.replace(/\D/g, '')
        if (cleanProfPhone && cleanInputPhone && !cleanProfPhone.endsWith(cleanInputPhone) && !cleanInputPhone.endsWith(cleanProfPhone)) {
          throw new Error('Le numéro de téléphone ne correspond pas au compte enregistré.')
        }
      }

      // Mettre à jour immédiatement pos_pin_code dans user_profiles
      const { error: updErr } = await supabase
        .from('user_profiles')
        .update({
          pos_pin_code: directNewPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updErr) throw updErr

      // Tenter également sur Supabase Auth si une session est active
      try {
        await supabase.auth.updateUser({ password: directNewPassword })
      } catch (_) {}

      // Préremplir le formulaire de login
      setIdentifier(targetEmail)
      setPassword(directNewPassword)
      setShowForgotModal(false)
      setResetStep('request')
      setForgotSuccess(false)
      setConfirmedSuccess(true)
    } catch (err: any) {
      setForgotError(err.message || 'Échec de la réinitialisation directe.')
    } finally {
      setForgotLoading(false)
    }
  }

  useEffect(() => {
    if (urlEmail) {
      setIdentifier(urlEmail)
    }

    const code = searchParams.get('code')
    if (code) {
      setConfirmedSuccess(true)
      supabase.auth.exchangeCodeForSession(code).then(({ data }) => {
        if (data?.session?.user?.email) {
          setIdentifier(data.session.user.email)
        }
      }).catch((e) => {
        console.warn('[LoginPage] Code exchange warning:', e)
      })
    } else if (window.location.hash.includes('access_token') || isConfirmed) {
      setConfirmedSuccess(true)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) {
          setIdentifier(session.user.email)
        }
      })
    }

    // Écouter l'événement Supabase de réinitialisation de mot de passe (clic sur lien email)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPasswordModal(true)
        if (session?.user?.email) {
          setIdentifier(session.user.email)
        }
      }
    })

    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      setShowResetPasswordModal(true)
    }

    return () => {
      subscription?.unsubscribe()
    }
  }, [urlEmail, isConfirmed, searchParams])

  const handleUpdateNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetPwdError('')
    if (newPassword.length < 6) {
      setResetPwdError('Le mot de passe doit comporter au moins 6 caractères.')
      return
    }
    if (newPassword !== confirmPassword) {
      setResetPwdError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setResetPwdLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setResetPwdSuccess(true)
      setTimeout(() => {
        setShowResetPasswordModal(false)
        navigate('/hub', { replace: true })
      }, 1500)
    } catch (err: any) {
      setResetPwdError(err.message || 'Impossible de mettre à jour le mot de passe.')
    } finally {
      setResetPwdLoading(false)
    }
  }

  const isLoading = status === 'loading'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setUrlError(null)
    setRateLimitError(null)

    const rawInput = identifier.trim()
    const limiterKey = `login:${rawInput.toLowerCase()}`
    const check = rateLimiter.checkRateLimit(limiterKey, 5, 60000, 15 * 60 * 1000)
    if (!check.allowed) {
      setRateLimitError(check.lockoutMessage || 'Trop de tentatives. Veuillez patienter avant de réessayer.')
      return
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SÉPARATION STRICTE DES TYPES DE COMPTES :
    // 1. Email (contient '@') -> Supabase Auth (Admin / Propriétaire)
    // 2. Identifiant (sans '@') -> Table interne user_profiles (Caissier, etc.)
    // ─────────────────────────────────────────────────────────────────────────
    const isEmail = rawInput.includes('@')
    const result = await login(rawInput, password)
    if (result.success) {
      rateLimiter.resetLimit(limiterKey)
      const target = result.redirectTo || (isEmail ? '/hub' : '/app')
      navigate(target, { replace: true })
    } else {
      const failStatus = rateLimiter.recordFailure(limiterKey, 5, 60000, 15 * 60 * 1000)
      if (!failStatus.allowed) {
        setRateLimitError(failStatus.lockoutMessage || null)
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-900 text-slate-100">
      {/* Panel gauche — Image plein écran Port & Conteneurs (sans bandes blanches) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-10 xl:p-14 text-white overflow-hidden bg-slate-950">
        {/* Image de fond : 100% de la partie gauche, sans bandes blanches */}
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center transition-transform duration-1000 scale-100"
          style={{ backgroundImage: "url('/images/port-cotonou.jpg')" }}
        />
        {/* Léger overlay sombre pour améliorer la lisibilité tout en conservant une image bien visible */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-900/75 backdrop-blur-[1px]" />

        {/* Header panel gauche */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-emerald-500/20">
              G
            </div>
            <div>
              <span className="font-black text-2xl tracking-tight text-white">GESTIO 229</span>
              <span className="ml-2 text-[10px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded-full">
                SaaS Entreprise Bénin 🇧🇯
              </span>
            </div>
          </div>
          <span className="text-xs text-emerald-200/80 font-medium bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            Hub Commercial UEMOA
          </span>
        </div>

        {/* Message central portuaire & échanges ouest-africains */}
        <div className="relative z-10 max-w-lg my-auto py-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 mb-4 backdrop-blur-sm">
            Commerce · Import/Export · Logistique · UEMOA
          </span>
          <h1 className="text-3xl xl:text-4xl font-black leading-tight text-white drop-shadow-md">
            La plateforme intégrée des entreprises en Afrique de l'Ouest
          </h1>
          <p className="text-emerald-100/90 text-sm mt-3 leading-relaxed drop-shadow">
            Du commerce général aux flux maritimes et import-export, pilotez vos ventes, stocks, caisses et comptabilité SYSCOHADA en toute sérénité.
          </p>

          {/* Badges 100% Conforme & 15+ Métiers */}
          <div className="mt-6 grid grid-cols-2 gap-4 text-left">
            <div className="bg-slate-900/60 rounded-2xl p-4 backdrop-blur-md border border-white/15 shadow-lg">
              <p className="text-2xl font-black text-emerald-400">100% Conforme</p>
              <p className="text-slate-200 text-xs mt-1">DGI Bénin (e-MECeF) & SYSCOHADA Révisé</p>
            </div>
            <div className="bg-slate-900/60 rounded-2xl p-4 backdrop-blur-md border border-white/15 shadow-lg">
              <p className="text-2xl font-black text-emerald-400">15+ Métiers</p>
              <p className="text-slate-200 text-xs mt-1">Poissonnerie, Quincaillerie, Print, etc.</p>
            </div>
          </div>

          {/* SOUS LES BADGES : Date & Heure temps réel + Pensée de l'entrepreneur */}
          <div className="mt-5 space-y-3">
            {/* Date et Heure en temps réel (ex: Mardi 29 septembre 2026 — 14:35) */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-950/70 backdrop-blur-md border border-emerald-500/30 rounded-2xl text-white shadow-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-bold tracking-wide">
                {formattedDateTime}
              </span>
            </div>

            {/* Pensée de l'entrepreneur du jour avec rotation matin (05h-17h) / soir (18h-04h) */}
            <div className="p-4 bg-slate-950/75 backdrop-blur-md border border-white/15 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {entrepreneurQuote.isMorning ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-300" />
                  )}
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                    Pensée de l'entrepreneur du jour
                  </span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                  {entrepreneurQuote.isMorning ? '05h–17h · Action' : '18h–04h · Bilan'}
                </span>
              </div>
              <p className="text-xs italic text-slate-100 leading-relaxed font-serif">
                « {entrepreneurQuote.quote} »
              </p>
              <p className="text-[10px] font-semibold text-emerald-300 mt-2 text-right">
                — {entrepreneurQuote.theme}
              </p>
            </div>
          </div>
        </div>

        {/* Footer panel gauche */}
        <div className="relative z-10 flex items-center justify-between text-xs text-emerald-200/70 border-t border-white/10 pt-4">
          <span>© 2026 GESTIO 229 ERP · Hub Économique & Commercial</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Système Sécurisé Bénin
          </span>
        </div>
      </div>

      {/* Panel droit — Formulaire unifié & Actions PWA */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
        {/* Barre du haut : Bouton Installer l'application (PC & Mobile) — Masqué si déjà installée */}
        {!isAppInstalled ? (
          <div className="w-full max-w-md mx-auto flex items-center justify-between mb-4 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Application disponible
              </span>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              title="Installer GESTIO 229 sur votre ordinateur ou smartphone"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Installer l'application</span>
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md mx-auto flex items-center justify-end mb-4 animate-fadeIn">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full text-[11px] font-semibold border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Application installée</span>
            </span>
          </div>
        )}

        <div className="w-full max-w-md mx-auto my-auto">
          {/* Logo & Bannière portuaire mobile avec Date/Heure et Pensée */}
          <div className="lg:hidden text-center mb-6">
            <div className="relative rounded-2xl overflow-hidden shadow-md mb-4 h-32 border border-slate-200 dark:border-slate-700">
              <img
                src="/images/port-cotonou.jpg"
                alt="Port Autonome de Cotonou - Commerce & Logistique"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/40 to-transparent flex flex-col justify-end p-3 text-left">
                <span className="text-[10px] font-bold text-white uppercase tracking-wider bg-emerald-600/80 backdrop-blur-sm px-2 py-0.5 rounded-md inline-block w-fit mb-1">
                  Port de Cotonou · Commerce &amp; Logistique
                </span>
                <span className="text-[11px] font-bold text-slate-100 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" /> {formattedDateTime}
                </span>
              </div>
            </div>
            {/* Pensée mobile */}
            <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-4 text-left">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Pensée du jour
                </span>
                <span className="text-[9px] text-slate-400">
                  {entrepreneurQuote.isMorning ? '05h–17h' : '18h–04h'}
                </span>
              </div>
              <p className="text-xs italic text-slate-700 dark:text-slate-300">
                « {entrepreneurQuote.quote} »
              </p>
            </div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">GESTIO 229</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">SaaS Multi-Secteurs &amp; Multi-Tenants</p>
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

            {/* Message d'erreur, secteur non souscrit ou blocage Rate Limit */}
            {(urlError || rateLimitError || errorMessage) && (
              <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 mb-6 animate-shake">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-rose-700 dark:text-rose-300 font-medium leading-relaxed">
                  <p>{urlError || rateLimitError || errorMessage}</p>
                  {(errorMessage?.includes('Échec') || errorMessage?.includes('incorrect') || errorMessage?.includes('confirmé') || errorMessage?.includes('Réinitialiser') || urlError) && (
                    <div className="mt-2.5 pt-2 border-t border-rose-200/60 dark:border-rose-800/60 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(identifier.includes('@') ? identifier : '')
                          setShowForgotModal(true)
                        }}
                        className="text-emerald-700 dark:text-emerald-400 font-bold underline hover:opacity-80"
                      >
                        → Réinitialiser mon mot de passe en 1 clic
                      </button>
                    </div>
                  )}
                </div>
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
                  Demande traitée avec succès !
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Si le mail tarde à arriver dans votre boîte, vous pouvez également définir votre nouveau mot de passe directement ci-dessous.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetStep('direct_reset')}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition shadow-md shadow-emerald-600/20"
                  >
                    Définir mon nouveau mot de passe directement
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false)
                      setForgotSuccess(false)
                    }}
                    className="w-full py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Fermer et vérifier ma boîte mail
                  </button>
                </div>
              </div>
            ) : resetStep === 'direct_reset' ? (
              <form onSubmit={handleDirectResetSubmit} className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Réinitialisation directe pour <strong>{forgotEmail}</strong>. Définissez votre nouveau mot de passe pour vous connecter immédiatement.
                </p>

                {forgotError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                    {forgotError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Numéro de téléphone du compte (Vérification)
                  </label>
                  <input
                    type="tel"
                    value={directPhone}
                    onChange={(e) => setDirectPhone(e.target.value)}
                    placeholder="Ex: 0162272324"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nouveau mot de passe (min 6 caractères) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={directNewPassword}
                    onChange={(e) => setDirectNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep('request')
                      setForgotError('')
                    }}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Retour
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    {forgotLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Enregistrer et se connecter</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Saisissez l'adresse email associée à votre compte. Vous recevrez un lien ou pourrez réinitialiser votre mot de passe immédiatement en cas de retard d'email.
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

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!forgotEmail.trim()) {
                        setForgotError('Veuillez saisir votre adresse email.')
                        return
                      }
                      setResetStep('direct_reset')
                      setForgotError('')
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                  >
                    ⚡ Réinitialisation sans email
                  </button>
                  <div className="flex items-center gap-2">
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
                        <span>Envoyer / Continuer</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL DÉFINITION NOUVEAU MOT DE PASSE (PASSWORD RECOVERY) */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    Nouveau Mot de Passe
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Définissez un mot de passe sécurisé pour votre compte</p>
                </div>
              </div>
              <button
                onClick={() => setShowResetPasswordModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetPwdSuccess ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Mot de passe mis à jour avec succès !
                </h4>
                <p className="text-xs text-slate-500">
                  Connexion automatique en cours vers votre espace de gestion...
                </p>
              </div>
            ) : (
              <form onSubmit={handleUpdateNewPassword} className="space-y-4">
                {resetPwdError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                    {resetPwdError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nouveau mot de passe (min. 6 caractères)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetPasswordModal(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={resetPwdLoading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    {resetPwdLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Valider & Me Connecter</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL GUIDE D'INSTALLATION PWA (PC & MOBILE) */}
      {showInstallGuide && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    Installer l'application GESTIO 229
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Accès direct et fonctionnement fluide sur PC & Mobile</p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bouton direct si le prompt natif est disponible */}
            {(deferredPrompt || (typeof window !== 'undefined' && (window as any).__gestio_deferred_prompt)) && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-300 dark:border-emerald-700 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Installation automatique prête</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Votre navigateur supporte l'installation directe en un clic.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowInstallGuide(false)
                    handleInstallClick()
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Installer</span>
                </button>
              </div>
            )}

            <div className="space-y-3.5">
              {/* Option Android */}
              <div className={`p-4 rounded-2xl border transition ${
                userPlatform === 'android'
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-500/20'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>Sur Smartphone Android (Chrome)</span>
                  </div>
                  {userPlatform === 'android' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                      Votre appareil
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  1. Appuyez sur les <strong>3 points ⋮</strong> en haut à droite du navigateur.<br />
                  2. Sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.<br />
                  3. Validez : GESTIO 229 s'ouvrira en plein écran comme une application native.
                </p>
              </div>

              {/* Option iPhone / iPad */}
              <div className={`p-4 rounded-2xl border transition ${
                userPlatform === 'ios'
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-500/20'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <Smartphone className="w-4 h-4 text-indigo-600" />
                    <span>Sur iPhone / iPad (Safari)</span>
                  </div>
                  {userPlatform === 'ios' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900 dark:bg-indigo-800 dark:text-indigo-100">
                      Votre appareil
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  1. Appuyez sur l'icône de <strong>Partage ⎋</strong> (carré avec flèche vers le haut) au bas de l'écran Safari.<br />
                  2. Faites défiler et appuyez sur <strong>« Sur l'écran d'accueil »</strong>, puis confirmez <strong>« Ajouter »</strong>.
                </p>
              </div>

              {/* Option PC (Chrome / Edge / Windows / Mac) */}
              <div className={`p-4 rounded-2xl border transition ${
                userPlatform === 'desktop'
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-500/20'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <Laptop className="w-4 h-4 text-emerald-600" />
                    <span>Sur Ordinateur (Chrome, Edge, Brave)</span>
                  </div>
                  {userPlatform === 'desktop' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                      Votre appareil
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  1. Cliquez sur l'icône <strong>Installer</strong> (petit écran avec flèche) située dans la barre d'adresse tout à droite de votre navigateur.<br />
                  2. Ou ouvrez le menu <strong>⋮ (trois points)</strong> en haut à droite &gt; <strong>« Installer GESTIO 229 »</strong>.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/20"
              >
                Compris, fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
