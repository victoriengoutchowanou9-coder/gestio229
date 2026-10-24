// =============================================================================
// GESTIO 229 SaaS — MODALE D'INFORMATION SECTEUR (Refonte V4 — Section 3 & 4)
// =============================================================================
// La première activation gratuite individuelle de 30 jours par secteur est supprimée.
// Cette modale permet soit d'ouvrir le Tableau de bord du secteur, soit d'accéder
// directement à la page d'activation d'abonnement.
// =============================================================================

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, X, ArrowRight, LayoutDashboard, Lock } from 'lucide-react'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'

interface ActiverSecteurModalProps {
  isOpen: boolean
  entrepriseId: string
  sectorSlug: string
  sectorName?: string
  onClose: () => void
  onActivated: (sectorSlug: string) => void
}

export const ActiverSecteurModal: React.FC<ActiverSecteurModalProps> = ({
  isOpen,
  sectorSlug,
  sectorName,
  onClose,
  onActivated,
}) => {
  const navigate = useNavigate()

  if (!isOpen) return null

  const cleanSlug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
  const catalogMeta = ALL_SECTORS_CATALOG.find((s) => s.slug === cleanSlug)
  const displayName = sectorName || catalogMeta?.name || cleanSlug.toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-5">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
          Abonnement requis • {displayName}
        </span>

        <h3 className="text-xl font-bold text-white mb-2">
          Activer l'abonnement du secteur {displayName} ?
        </h3>

        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          Votre secteur <strong className="text-white">{displayName}</strong> a été ajouté avec succès.
          Pour accéder à l'ensemble de ses fonctionnalités opérationnelles, veuillez activer votre abonnement.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate(`/app/${cleanSlug}/abonnement`)
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/25 transition-all"
          >
            <CreditCard className="w-4 h-4" />
            Activer mon abonnement
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onActivated(cleanSlug)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <LayoutDashboard className="w-4 h-4 text-emerald-400" />
            Ouvrir le Tableau de bord du secteur
          </button>
        </div>
      </div>
    </div>
  )
}

export default ActiverSecteurModal
