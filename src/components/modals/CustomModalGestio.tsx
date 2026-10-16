// =============================================================================
// GESTIO 229 ERP — Composant CustomModalGestio & Système Modal Global
// Design Pro : Overlay sombre flou, Fond blanc, border-radius 16px,
// Header bleu nuit #0a1931 avec Logo GESTIO 229 + Domaine www.gestio229.com,
// Icône X rouge si erreur, Check vert #00b050 si succès, Bouton OK vert #00b050.
// Élimination totale des alertes natives du navigateur.
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Check, X, AlertTriangle, HelpCircle, Info, ShieldCheck } from 'lucide-react'

export type GestioModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'prompt'

export interface GestioModalConfig {
  id?: string
  type?: GestioModalType
  title?: string
  message: string
  domaine?: string // Par défaut: 'www.gestio229.com'
  confirmText?: string
  cancelText?: string
  defaultValue?: string
  placeholder?: string
  onConfirm?: (value?: string) => void
  onCancel?: () => void
}

type ModalResolver = (value: boolean | string | null) => void

let currentResolver: ModalResolver | null = null
let modalListener: ((config: GestioModalConfig | null) => void) | null = null

/**
 * Fonction impérative globale pour afficher une modale GESTIO 229
 */
export function showModal(config: GestioModalConfig): Promise<any> {
  return new Promise((resolve) => {
    currentResolver = resolve
    const finalConfig: GestioModalConfig = {
      type: config.type || 'info',
      domaine: config.domaine || 'www.gestio229.com',
      confirmText: config.confirmText || 'OK',
      cancelText: config.cancelText || 'Annuler',
      ...config,
    }

    if (modalListener) {
      modalListener(finalConfig)
    } else {
      console.warn('[CustomModalGestio] Aucun listener monté. Résolution immédiate.')
      resolve(true)
    }
  })
}

/** Alias raccourcis */
export function showSuccess(message: string, title: string = 'Succès'): Promise<boolean> {
  return showModal({
    type: 'success',
    title,
    message,
    domaine: 'www.gestio229.com',
    confirmText: 'OK',
  })
}

export function showError(message: string, title: string = 'Enregistrement échoué'): Promise<boolean> {
  return showModal({
    type: 'error',
    title,
    message,
    domaine: 'www.gestio229.com',
    confirmText: 'OK',
  })
}

export function showConfirm(message: string, title: string = 'Confirmation requise'): Promise<boolean> {
  return showModal({
    type: 'confirm',
    title,
    message,
    domaine: 'www.gestio229.com',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
  }).then((res) => Boolean(res))
}

export function showPrompt(message: string, defaultValue: string = '', title: string = 'Saisie requise'): Promise<string | null> {
  return showModal({
    type: 'prompt',
    title,
    message,
    defaultValue,
    domaine: 'www.gestio229.com',
    confirmText: 'Valider',
    cancelText: 'Annuler',
  })
}

export function closeCustomModal(): void {
  if (modalListener) {
    modalListener(null)
  }
  if (currentResolver) {
    currentResolver(false)
    currentResolver = null
  }
}

/**
 * Interception globale de window.alert, window.confirm, window.prompt
 * Empêche définitivement l'apparition de toute popup native "gestio229.vercel.app indique"
 */
export function installGlobalModalInterceptors(): void {
  if (typeof window === 'undefined') return

  // Sauvegarde des originaux si besoin de débug bas niveau
  const originalAlert = window.alert.bind(window)
  const originalConfirm = window.confirm.bind(window)
  const originalPrompt = window.prompt.bind(window)

  window.__native_alert__ = originalAlert
  window.__native_confirm__ = originalConfirm
  window.__native_prompt__ = originalPrompt

  window.alert = (msg?: any) => {
    const text = String(msg ?? '')
    const isError = text.includes('❌') || /erreur|échoué|fail|invalide|interdit/i.test(text)
    const isSuccess = text.includes('✅') || text.includes('✓') || /succès|enregistré avec succès|validé/i.test(text)
    const type: GestioModalType = isError ? 'error' : isSuccess ? 'success' : 'info'
    const title = isError ? 'Erreur Système' : isSuccess ? 'Succès' : 'Information GESTIO 229'

    showModal({
      type,
      title,
      message: text,
      domaine: 'www.gestio229.com',
      confirmText: 'OK',
    })
  }

  window.confirm = (msg?: any): boolean => {
    // Note: window.confirm synchrone ne peut pas bloquer la boucle JS sans bloquer le rendu,
    // mais pour le code appelant synchrone immédiat on déclenche la modale async
    showConfirm(String(msg ?? ''), 'Confirmation')
    return false
  }

  window.prompt = (msg?: any, _defaultText?: string): string | null => {
    showPrompt(String(msg ?? ''), _defaultText ?? '', 'Saisie')
    return null
  }
}

declare global {
  interface Window {
    __native_alert__?: (msg?: any) => void
    __native_confirm__?: (msg?: any) => boolean
    __native_prompt__?: (msg?: any, def?: string) => string | null
  }
}

export interface CustomModalGestioProps {
  // Optionnel : utilisation en composant contrôlé direct
  isOpen?: boolean
  onClose?: () => void
  type?: GestioModalType
  title?: string
  message?: string
  domaine?: string
  confirmText?: string
  cancelText?: string
  defaultValue?: string
  onConfirm?: (val?: string) => void
}

export const CustomModalGestio: React.FC<CustomModalGestioProps> = (props) => {
  const [globalConfig, setGlobalConfig] = useState<GestioModalConfig | null>(null)
  const [promptValue, setPromptValue] = useState<string>('')

  useEffect(() => {
    modalListener = (cfg) => {
      setGlobalConfig(cfg)
      if (cfg && cfg.type === 'prompt') {
        setPromptValue(cfg.defaultValue || '')
      }
    }
    return () => {
      modalListener = null
    }
  }, [])

  // Déterminer la source de la config (props contrôlées ou état global impératif)
  const isControlled = typeof props.isOpen === 'boolean'
  const active = isControlled ? props.isOpen : Boolean(globalConfig)

  const config: GestioModalConfig = isControlled
    ? {
        type: props.type || 'info',
        title: props.title,
        message: props.message || '',
        domaine: props.domaine || 'www.gestio229.com',
        confirmText: props.confirmText || 'OK',
        cancelText: props.cancelText || 'Annuler',
        defaultValue: props.defaultValue || '',
        onConfirm: props.onConfirm,
        onCancel: props.onClose,
      }
    : globalConfig || {
        type: 'info',
        message: '',
        domaine: 'www.gestio229.com',
      }

  if (!active) return null

  const modalType = config.type || 'info'
  const domaineAffiché = config.domaine || 'www.gestio229.com'

  const handleConfirm = () => {
    if (isControlled) {
      if (props.onConfirm) props.onConfirm(promptValue)
      if (props.onClose) props.onClose()
    } else {
      if (config.onConfirm) config.onConfirm(promptValue)
      if (currentResolver) {
        currentResolver(modalType === 'prompt' ? promptValue : true)
        currentResolver = null
      }
      setGlobalConfig(null)
    }
  }

  const handleCancel = () => {
    if (isControlled) {
      if (props.onClose) props.onClose()
    } else {
      if (config.onCancel) config.onCancel()
      if (currentResolver) {
        currentResolver(modalType === 'confirm' ? false : null)
        currentResolver = null
      }
      setGlobalConfig(null)
    }
  }

  // Titres par défaut si non fournis
  const displayTitle =
    config.title ||
    (modalType === 'error'
      ? 'Enregistrement échoué'
      : modalType === 'success'
      ? 'Opération réussie'
      : modalType === 'warning'
      ? 'Avertissement'
      : modalType === 'confirm'
      ? 'Confirmation requise'
      : modalType === 'prompt'
      ? 'Saisie d\'information'
      : 'GESTIO 229')

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && modalType !== 'confirm' && modalType !== 'prompt') {
          handleCancel()
        }
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[16px] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col animate-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100"
        style={{ borderRadius: '16px' }}
      >
        {/* Header : Fond bleu nuit #0a1931, Logo GESTIO 229 + Domaine www.gestio229.com en blanc */}
        <div
          className="px-5 py-3.5 flex items-center justify-between text-white border-b border-slate-800 select-none"
          style={{ backgroundColor: '#0a1931' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4 text-[#00b050]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs tracking-wider text-white">GESTIO 229</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono font-medium text-emerald-400 tracking-wide bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
              {domaineAffiché}
            </span>
          </div>
        </div>

        {/* Corps : Icône X rouge si erreur, Check vert #00b050 si succès, Message centré */}
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {/* Icône selon type */}
          {modalType === 'error' && (
            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 shadow-sm animate-in zoom-in duration-200">
              <X className="w-8 h-8 stroke-[3]" />
            </div>
          )}

          {modalType === 'success' && (
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-[#00b050] shadow-sm animate-in zoom-in duration-200">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
          )}

          {modalType === 'warning' && (
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-500 shadow-sm animate-in zoom-in duration-200">
              <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
            </div>
          )}

          {(modalType === 'confirm' || modalType === 'info') && (
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm animate-in zoom-in duration-200">
              {modalType === 'confirm' ? <HelpCircle className="w-8 h-8 stroke-[2.5]" /> : <Info className="w-8 h-8 stroke-[2.5]" />}
            </div>
          )}

          {modalType === 'prompt' && (
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-[#00b050] shadow-sm animate-in zoom-in duration-200">
              <HelpCircle className="w-8 h-8 stroke-[2.5]" />
            </div>
          )}

          {/* Titre */}
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white px-2">
            {displayTitle}
          </h3>

          {/* Message centré */}
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto w-full px-2">
            {config.message}
          </div>

          {/* Champ de saisie pour Prompt */}
          {modalType === 'prompt' && (
            <div className="w-full pt-1">
              <input
                type="text"
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm()
                  if (e.key === 'Escape') handleCancel()
                }}
                placeholder={config.placeholder || 'Saisissez votre réponse...'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#00b050] focus:border-[#00b050] transition shadow-sm"
              />
            </div>
          )}
        </div>

        {/* Footer : Bouton OK vert #00b050 avec texte blanc */}
        <div className="px-6 pb-6 pt-2 flex items-center justify-center gap-3 w-full">
          {(modalType === 'confirm' || modalType === 'prompt') ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm transition active:scale-95"
              >
                {config.cancelText || 'Annuler'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md transition active:scale-95"
                style={{ backgroundColor: '#00b050' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#009643')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b050')}
              >
                {config.confirmText || 'Confirmer'}
              </button>
            </>
          ) : (
            <button
              type="button"
              autoFocus
              onClick={handleConfirm}
              className="w-full max-w-[200px] px-6 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md transition active:scale-95 text-center"
              style={{ backgroundColor: '#00b050' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#009643')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b050')}
            >
              {config.confirmText || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CustomModalGestio
