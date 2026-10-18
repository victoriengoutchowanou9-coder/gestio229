import React, { useEffect, useState } from 'react'
import { Download, X, Smartphone, CheckCircle } from 'lucide-react'

export const PwaInstallBanner: React.FC = () => {
  const [canInstall, setCanInstall] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // 1. Vérifier si l'application est déjà exécutée en mode autonome (PWA / WebAPK installé)
    const checkStandalone = () => {
      const isStandaloneMode =
        (typeof window !== 'undefined' &&
          (window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true ||
            document.referrer.includes('android-app://') ||
            window.location.search.includes('pwa=1'))) ||
        false
      setIsStandalone(Boolean(isStandaloneMode))
    }

    checkStandalone()

    // 2. Détection du prompt d'installation Android Chrome (WebAPK)
    const checkPrompt = () => {
      if (typeof window !== 'undefined') {
        const hasPrompt = Boolean((window as any).__gestio_deferred_prompt)
        setCanInstall(hasPrompt)
      }
    }

    checkPrompt()

    const handleInstallable = () => {
      setCanInstall(true)
    }

    const handleInstalled = () => {
      setIsStandalone(true)
      setCanInstall(false)
      setShowModal(false)
    }

    const handleCustomTrigger = () => {
      handleTriggerInstall()
    }

    window.addEventListener('gestio-pwa-installable', handleInstallable)
    window.addEventListener('gestio-pwa-installed', handleInstalled)
    window.addEventListener('gestio-trigger-pwa-install', handleCustomTrigger)

    // Vérifier si temporairement masqué pour la session
    const dismissedSession = sessionStorage.getItem('gestio_install_banner_dismissed')
    if (dismissedSession) {
      setIsDismissed(true)
    }

    return () => {
      window.removeEventListener('gestio-pwa-installable', handleInstallable)
      window.removeEventListener('gestio-pwa-installed', handleInstalled)
      window.removeEventListener('gestio-trigger-pwa-install', handleCustomTrigger)
    }
  }, [])

  const handleTriggerInstall = async () => {
    const prompt = typeof window !== 'undefined' ? (window as any).__gestio_deferred_prompt : null
    if (prompt) {
      try {
        prompt.prompt()
        const choice = await prompt.userChoice
        if (choice && choice.outcome === 'accepted') {
          ;(window as any).__gestio_deferred_prompt = null
          setCanInstall(false)
          setIsDismissed(true)
        }
      } catch (err) {
        setShowModal(true)
      }
    } else {
      setShowModal(true)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      sessionStorage.setItem('gestio_install_banner_dismissed', 'true')
    } catch (_) {}
  }

  // Ne pas afficher si déjà en mode standalone PWA ou si l'utilisateur a fermé le bandeau
  if (isStandalone || isDismissed) return null

  return (
    <>
      {/* Bandeau discret en bas d'écran sur mobile / tablette */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[99999] sm:max-w-md bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border border-emerald-500/40 text-white rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center shrink-0 shadow-md border border-emerald-400/30">
            <img src="/icon-192.png" alt="GESTIO 229" className="w-8 h-8 rounded-lg object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Installer GESTIO 229</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                PWA WebAPK
              </span>
            </p>
            <p className="text-[11px] text-slate-300 truncate">
              Démarrage direct sans l'écran Chrome
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTriggerInstall}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/40 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Installer</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Masquer pour cette session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modale d'instructions si le navigateur requiert l'action manuelle via le menu Chrome */}
      {showModal && (
        <div className="fixed inset-0 z-[999999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-sm w-full p-6 text-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <Smartphone className="w-7 h-7" />
            </div>

            <h3 className="text-base font-extrabold text-center text-white mb-2">
              Installation sur Android (WebAPK)
            </h3>
            <p className="text-xs text-slate-300 text-center mb-5 leading-relaxed">
              Pour supprimer définitivement l'apparition de l'écran Google Chrome au démarrage et obtenir un lancement instantané :
            </p>

            <div className="space-y-3 mb-6 bg-slate-800/80 rounded-2xl p-4 border border-slate-700/60 text-xs">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span className="text-slate-200">
                  Appuyez sur le menu <strong>⋮ (3 points verticaux)</strong> en haut à droite de Google Chrome.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span className="text-slate-200">
                  Choisissez <strong>« Installer l'application »</strong> (ou « Ajouter à l'écran d'accueil »).
                </span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-slate-300 text-[11px]">
                  Android installe alors l'APK autonome GESTIO 229 avec son propre écran de démarrage vert officiel.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default PwaInstallBanner
