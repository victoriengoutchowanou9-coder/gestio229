import React, { useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'

export const PwaUpdateToast: React.FC = () => {
  const [show, setShow] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const handleUpdateAvailable = () => {
      // Si rechargé il y a moins de 5 minutes, ne pas afficher
      try {
        const lastReloadStr = sessionStorage.getItem('pwa-reloaded-at')
        if (lastReloadStr) {
          const lastReload = parseInt(lastReloadStr, 10)
          if (!isNaN(lastReload) && Date.now() - lastReload < 15 * 1000) {
            return
          }
        }
      } catch (_) {}

      setShow(true)
    }

    window.addEventListener('gestio-pwa-update-available', handleUpdateAvailable)
    return () => {
      window.removeEventListener('gestio-pwa-update-available', handleUpdateAvailable)
    }
  }, [])

  const handleApplyUpdate = async () => {
    setIsUpdating(true)
    try {
      sessionStorage.setItem('pwa-reloaded-at', String(Date.now()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } catch (_) {}
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
          <p className="text-[11px] text-slate-400 truncate">Une nouvelle version est prête</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleApplyUpdate}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          {isUpdating ? '...' : 'Actualiser'}
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default PwaUpdateToast
