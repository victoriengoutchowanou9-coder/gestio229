// src/components/common/SplashScreen.tsx
// =============================================================================
// GESTIO 229 — Native-Feel Splash Screen (React Component)
// Affiche le fond #0a1931, le logo GESTIO 229 animé (pulse), le texte et le spinner
// =============================================================================

import React from 'react'

interface SplashScreenProps {
  message?: string
  submessage?: string
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  message = 'Chargement...',
  submessage = 'Initialisation sécurisée de votre session'
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-[#0a1931] text-white select-none px-4"
      style={{ backgroundColor: '#0a1931' }}
    >
      {/* Container Logo centré avec animation pulse */}
      <div className="relative mb-6 flex flex-col items-center">
        {/* Halo lumineux discret */}
        <div className="absolute -inset-4 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Badge Logo avec pulsation fluide */}
        <div className="relative w-28 h-28 rounded-3xl bg-[#0f244a] border border-emerald-500/30 shadow-2xl shadow-black/60 flex items-center justify-center animate-pulse p-3">
          <img
            src="/icon-192.png"
            alt="Logo GESTIO 229"
            width={88}
            height={88}
            className="w-full h-full object-contain rounded-2xl"
          />
        </div>

        {/* Titre GESTIO 229 */}
        <div className="mt-4 flex items-center gap-1.5 text-2xl font-black tracking-tight text-white">
          <span>GESTIO</span>
          <span className="text-amber-400">229</span>
        </div>

        {/* Sous-titre entreprise */}
        <div className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase mt-1">
          STE GESTIO SARL
        </div>
      </div>

      {/* Spinner + Texte Chargement */}
      <div className="flex flex-col items-center gap-3 mt-2">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
          <span className="text-sm font-medium text-slate-200 tracking-wide">
            {message}
          </span>
        </div>

        {submessage && (
          <p className="text-xs text-slate-400 font-normal text-center max-w-xs animate-fadeIn">
            {submessage}
          </p>
        )}
      </div>

      {/* Footer standard Bénin */}
      <div className="absolute bottom-6 text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
        RÉPUBLIQUE DU BÉNIN &bull; ERP & CAISSE
      </div>
    </div>
  )
}

export default SplashScreen
