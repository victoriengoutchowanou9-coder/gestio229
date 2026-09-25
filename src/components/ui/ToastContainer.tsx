// =============================================================================
// GESTIO 229 SaaS — Toast Notification Container
// =============================================================================

import React from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import clsx from 'clsx'

const ICONS = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />,
  error:   <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
  info:    <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
}

const COLORS = {
  success: 'border-emerald-200 bg-emerald-50',
  error:   'border-red-200 bg-red-50',
  warning: 'border-amber-200 bg-amber-50',
  info:    'border-blue-200 bg-blue-50',
}

const ToastContainer: React.FC = () => {
  const notifications = useUIStore((s) => s.notifications)
  const removeNotification = useUIStore((s) => s.removeNotification)

  if (!notifications.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-slide-in-left',
            COLORS[n.type]
          )}
        >
          {ICONS[n.type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{n.title}</p>
            {n.message && <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>}
          </div>
          <button
            onClick={() => removeNotification(n.id)}
            className="text-slate-400 hover:text-slate-600 transition flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
