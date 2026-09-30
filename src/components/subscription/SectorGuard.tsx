// =============================================================================
// GESTIO 229 SaaS — SectorGuard : Isolation Stricte des Sous-Logiciels
// =============================================================================
// Règle formelle : Une entreprise ne peut accéder qu'aux secteurs d'activité
// qu'elle a souscrits. Les autres secteurs ne doivent pas être accessibles.
// =============================================================================

import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { Lock, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getActiveSectorSlug, isSectorSubscribed } from '../../lib/sectorClient'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'

interface SectorGuardProps {
  children: React.ReactNode
}

export const SectorGuard: React.FC<SectorGuardProps> = ({ children }) => {
  const { company } = useAuthStore()
  const params = useParams<{ sectorSlug?: string }>()
  
  // Le secteur ciblé vient soit de l'URL (/app/:sectorSlug/...) soit de l'état actif
  const targetSectorSlug = params.sectorSlug || getActiveSectorSlug()
  const allowed = isSectorSubscribed(targetSectorSlug, company)

  if (allowed) {
    return <>{children}</>
  }

  const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === targetSectorSlug)
  const sectorName = meta?.name || targetSectorSlug

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl border border-red-200 dark:border-red-900/60 p-8 shadow-xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          Sous-Logiciel Non Accessible
        </span>

        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          Accès Refusé
        </h2>

        <p className="text-slate-600 dark:text-slate-300 text-sm mt-3 leading-relaxed">
          Le sous-logiciel <strong>{sectorName}</strong> n’a pas été souscrit lors de l’inscription de votre entreprise.
          Les données et fonctionnalités de ce secteur sont strictement cloisonnées.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/hub"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Retourner au HUB GESTIO 229
          </Link>

          <Link
            to="/dashboard/abonnement"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold text-sm hover:bg-emerald-100 transition"
          >
            Souscrire à ce secteur
          </Link>
        </div>
      </div>
    </div>
  )
}

export default SectorGuard
