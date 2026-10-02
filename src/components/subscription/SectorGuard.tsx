// =============================================================================
// GESTIO 229 SaaS — SectorGuard : Isolation Stricte des Sous-Logiciels
// =============================================================================
// Règle formelle : Une entreprise ne peut accéder qu'aux secteurs d'activité
// qu'elle a souscrits. Les autres secteurs ne doivent pas être accessibles.
// =============================================================================

import React from 'react'
import { Link, useParams, useLocation, Navigate } from 'react-router-dom'
import { Lock, ArrowLeft, ShieldAlert, Sparkles, Clock, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { getActiveSectorSlug, isSectorSubscribed } from '../../lib/sectorClient'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'
import { getCompanySubscriptionInfo } from '../../core/subscription/subscriptionEngine'

interface SectorGuardProps {
  children: React.ReactNode
}

export const SectorGuard: React.FC<SectorGuardProps> = ({ children }) => {
  const location = useLocation()
  const params = useParams<{ sectorSlug?: string }>()
  const { toast } = useUIStore()

  // 1. L'accès à la page d'abonnement est TOUJOURS autorisé (règle absolue CDC pour permettre le renouvellement)
  const isAbonnementRoute = location.pathname.includes('/abonnement') || location.pathname.includes('/subscription')
  if (isAbonnementRoute) {
    return <>{children}</>
  }

  const company = useAuthStore((s) => s.company) || useAuthStore.getState().company
  const status = useAuthStore((s) => s.status) || useAuthStore.getState().status

  // 2. Guard critique : en attente de l'initialisation du store d'authentification
  if (!company && (status === 'idle' || status === 'loading')) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Vérification de la période d'essai (30 jours) et de la validité de l'abonnement
  const subInfo = getCompanySubscriptionInfo(company)
  if (subInfo.isExpired || subInfo.isSuspended) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl border border-amber-200 dark:border-amber-900/60 p-8 shadow-xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <Clock className="w-8 h-8" />
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 mb-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            {subInfo.isSuspended ? 'Compte Suspendu' : "Période d'Essai de 30 Jours Expirée"}
          </span>

          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
            {subInfo.isSuspended ? 'Accès Suspendu' : 'Essai Gratuit Terminé'}
          </h2>

          <p className="text-slate-600 dark:text-slate-300 text-sm mt-3 leading-relaxed">
            {subInfo.isSuspended
              ? 'Votre compte est suspendu. Veuillez régulariser votre abonnement pour continuer à exploiter vos données.'
              : `Votre période d'essai gratuit de 30 jours pour ${company?.name || 'votre entreprise'} a pris fin le ${subInfo.endDate}. Veuillez activer une formule d'abonnement pour reprendre votre activité.`}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/dashboard/abonnement"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition"
            >
              <Sparkles className="w-4 h-4" />
              Consulter les formules & Activer
            </Link>

            <Link
              to="/hub"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Retourner au HUB
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Vérification de l'assignation sectorielle pour les utilisateurs internes (Non-admin)
  const user = useAuthStore((s) => s.user)
  const isAdmin = !user || user.role === 'administrateur' || user.role === 'super_admin'
  const targetSectorSlug = params.sectorSlug || getActiveSectorSlug()

  if (!isAdmin && user) {
    const perm = (typeof user.permissions === 'object' && user.permissions) ? user.permissions : {}
    const userSector = (perm.sector_slug || perm.sector_id || user.sector_id || '').toLowerCase().replace(/^sec-/, '').trim()
    const targetClean = (targetSectorSlug || '').toLowerCase().replace(/^sec-/, '').trim()

    // 1. Si le secteur assigné de l'utilisateur n'est pas souscrit par l'entreprise : blocage immédiat
    if (!userSector || !isSectorSubscribed(userSector, company)) {
      return (
        <div className="min-h-[75vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl border border-red-200 dark:border-red-900/60 p-8 shadow-xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 mb-3">
              Accès Interdit
            </span>
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Secteur Non Souscrit
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-3 leading-relaxed">
              Secteur non souscrit, contactez l'administrateur.
            </p>
            <div className="mt-6">
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )
    }

    // 2. Si l'utilisateur tente de naviguer vers un autre secteur que son secteur assigné : redirection directe
    if (userSector && targetClean && userSector !== targetClean) {
      let dest = 'tableau-bord'
      if (user.role === 'caissier' || user.role === 'vendeur') {
        dest = 'vente-pos'
      } else if (user.role === 'magasinier') {
        dest = 'stocks'
      } else if (user.role === 'comptable') {
        dest = 'syscohada'
      }
      return <Navigate to={`/app/${userSector}/${dest}`} replace />
    }
  }

  const allowed = isSectorSubscribed(targetSectorSlug, company)

  if (allowed) {
    return <>{children}</>
  }

  const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === targetSectorSlug)
  const sectorName = meta?.name || targetSectorSlug

  // Règle 4 : Si le secteur n'est pas souscrit par l'entreprise -> redirection HUB + toast "Secteur non souscrit"
  if (isAdmin) {
    toast.error('Secteur non souscrit', `Le sous-logiciel "${sectorName}" n'a pas été souscrit par votre entreprise.`)
    return <Navigate to="/hub" replace />
  }

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
          {isAdmin ? (
            <>
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
            </>
          ) : (
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition"
            >
              Se déconnecter
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SectorGuard
