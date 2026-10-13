import React from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import ModalPortal from './ModalPortal'

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
  itemName?: string
  variant?: 'danger' | 'warning' | 'info'
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'gestio229.com indique',
  message,
  confirmText = 'OK',
  cancelText = 'Annuler',
  isLoading = false,
  variant = 'danger'
}) => {
  if (!isOpen) return null

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} zIndex={100} id="modal-confirm-dialog">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        {/* En-tête coloré et pro */}
        <div className="bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-xl backdrop-blur-sm">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[11px] font-mono tracking-wider uppercase text-rose-100 font-bold block">
                Message Système
              </span>
              <h3 id="confirm-modal-title" className="text-sm font-black tracking-tight text-white">
                {title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps avec message dynamique */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl shrink-0 mt-0.5 border border-rose-100">
              <Trash2 className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-700 leading-relaxed break-words">
              {message}
            </p>
          </div>
        </div>

        {/* Pied de page avec boutons bien visibles */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-bold text-xs transition shadow-sm active:scale-95"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
            }}
            disabled={isLoading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition shadow-md active:scale-95 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
            ) : null}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}

export default ConfirmModal
