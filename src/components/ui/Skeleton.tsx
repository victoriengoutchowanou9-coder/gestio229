// =============================================================================
// GESTIO 229 SaaS — Skeleton : Indicateur de chargement léger & modulaire
// Remplace le spinner plein écran par des cartes et grilles squelettes
// =============================================================================

import React from 'react'

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-700/60 ${className}`}
    />
  )
}

/**
 * ModuleSkeleton : Squelette moderne standard affiché pendant le chargement
 * ou la transition d'un module (< 300ms) sans jamais masquer le Header ou la Sidebar
 */
export const ModuleSkeleton: React.FC = () => {
  return (
    <div className="space-y-5 animate-fadeIn p-2 md:p-4">
      {/* En-tête du module */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 shadow-sm">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 !rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28 !rounded-xl" />
          <Skeleton className="h-10 w-36 !rounded-xl" />
        </div>
      </div>

      {/* Grille de 4 cartes KPI métriques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 shadow-sm space-y-3"
          >
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="w-6 h-6 !rounded-lg" />
            </div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>

      {/* Section principale : Tableau ou Grille */}
      <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-56 !rounded-xl" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 py-2 border-b border-slate-50 dark:border-slate-700/30">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40 hidden sm:block" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20 hidden md:block" />
              <Skeleton className="h-7 w-20 !rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ModuleSkeleton
