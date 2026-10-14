// =============================================================================
// GESTIO 229 SaaS — HubSkeleton : Squelette instantané du Hub Multi-Services
// Remplace le spinner plein écran par un squelette élégant & immédiat (< 50ms)
// =============================================================================

import React from 'react'
import { Skeleton } from './Skeleton'

export const HubSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 animate-fadeIn">
      {/* Header du Hub */}
      <div className="w-full max-w-none px-3 lg:px-4 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-44 !rounded-full" />
              <Skeleton className="h-4 w-28 !rounded-full" />
            </div>
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-28 !rounded-xl" />
            <Skeleton className="h-10 w-36 !rounded-xl" />
          </div>
        </div>
      </div>

      {/* 4 Cartes Totaux Consolidés */}
      <div className="w-full max-w-none px-3 lg:px-4 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="w-7 h-7 !rounded-lg" />
              </div>
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </div>

      {/* Grille des Établissements / Sous-Logiciels */}
      <div className="w-full max-w-none px-3 lg:px-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-32 !rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 !rounded-2xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-6 w-16 !rounded-full" />
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
              <Skeleton className="h-10 w-full !rounded-xl mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HubSkeleton
