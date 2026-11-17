import React, { useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'

export const PwaUpdateToast: React.FC = () => {
  const [show, setShow] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [newVersion, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<{ serverVersion?: string; localVersion?: string }>
      const incomingVersion = customEvent.detail?.serverVersion || ''

      try {
        // Si l'utilisateur a déjà fermé la notification pour cette version, ne pas l'afficher
        const dismissed = sessionStorage.getItem('gestio-pwa-dismissed-version')
        if (incomingVersion && dismissed === incomingVersion) {
          return
        }

        // Si rechargé il y a moins de 15 secondes, ignorer
        const lastReloadStr = sessionStorage.getItem('pwa-reloaded-at')
        if (lastReloadStr) {
          const lastReload = parseInt(lastReloadStr, 10)
          if (!isNaN(lastReload) && Date.now() - lastReload < 15 * 1000) {
            return
          }
        }
      } catch (_) {}

      if (incomingVersion) {
        setNewVersion(incomingVersion)
      }
      setShow(true)
    }

    window.addEventListener('gestio-pwa-update-available', handleUpdateAvailable as EventListener)
    return () => {
      window.removeEventListener('gestio-pwa-update-available', handleUpdateAvailable as EventListener)
    }
  }, [])

  // Fermeture par l'utilisateur (X) : mémoriser la version ignorée pour ne plus interrompre
  const handleDismiss = () => {
    setShow(false)
    try {
      if (newVersion) {
        sessionStorage.setItem('gestio-pwa-dismissed-version', newVersion)
      }
    } catch (_) {}
  }

  // Application manuelle de la mise à jour au clic sur « Actualiser »
  // Ne recharge JAMAIS automatiquement : l'utilisateur décide quand actualiser
  const handleApplyUpdate = async () => {
    setIsUpdating(true)
    try {
      sessionStorage.setItem('pwa-reloaded-at', String(Date.now()))
      if (newVersion) {
        localStorage.setItem('pwa-version', newVersion)
        sessionStorage.setItem('gestio-pwa-dismissed-version', newVersion)
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      }
    } catch (_) {}

    // Rechargement propre de la page courante (conserve l'URL exacte, aucune redirection vers /)
    window.location.reload()
  }

  if (!show) return null

  return (
    <div className="fixed top-4 right-4 z-[999999] max-w-sm w-full bg-slate-900/95 text-white backdrop-blur-md border border-emerald-500/30 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <RotateCcw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-100">Mise à jour disponible</p>
          <p className="text-[11px] text-slate-400 truncate">Une nouvelle version de GESTIO 229 est prête.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleApplyUpdate}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          {isUpdating ? 'Mise à jour...' : 'Actualiser'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition cursor-pointer"
          aria-label="Fermer la notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default PwaUpdateToast
