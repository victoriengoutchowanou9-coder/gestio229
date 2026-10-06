// =============================================================================
// GESTIO 229 SaaS — ModuleGuard : Contrôle d'Accès Sécurisé par Abonnement
// =============================================================================
// Empêche un utilisateur avec un forfait restreint (ex: Plan Starter) d'accéder
// directement aux routes réservées (Trésorerie, Reporting, SYSCOHADA...)
// par saisie d'URL directe.
// =============================================================================

import React from 'react'
import { Link } from 'react-router-dom'
import { Lock, ShieldAlert, ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { checkModuleAccess } from '../../core/subscription/subscriptionEngine'
import SectorLoader from '../../lib/SectorLoader'

interface ModuleGuardProps {
  moduleId: string
  children: React.ReactNode
}

export const ModuleGuard: React.FC<ModuleGuardProps> = ({ moduleId, children }) => {
  const company = useAuthStore((s) => s.company)
  const user = useAuthStore((s) => s.user)

  // 1. Contrôle abonnement entreprise
  const access = checkModuleAccess(moduleId, company)

  if (access.allowed) {
    // 2. Contrôle droits & permissions de l'utilisateur interne (RBAC)
    const hasUserAccess = SectorLoader.canAccess(user, moduleId, 'view', company)
    if (!hasUserAccess) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl border border-red-200 dark:border-red-900/60 p-8 shadow-xl text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
              <Lock className="w-8 h-8" />
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 mb-3">
              <ShieldAlert className="w-3.5 h-3.5" />
              Accès Refusé
            </span>

            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Module Non Autorisé
            </h2>

            <p className="text-slate-600 dark:text-slate-300 text-sm mt-3 leading-relaxed">
              Votre profil collaborateur ne dispose pas des droits d'accès nécessaires pour exploiter ce module.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/hub"
                className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retourner au HUB</span>
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return <>{children}</>
  }

  const isStarter = access.reason === 'starter_restriction'
  const isExpired = access.reason === 'expired'
  const isSuspended = access.reason === 'suspended'

  const badgeText = isExpired
    ? "Période d'Essai de 30 Jours Expirée"
    : isSuspended
    ? 'Compte Suspendu'
    : isStarter
    ? 'Module Non Inclus dans le Plan Starter'
    : 'Abonnement Requis'

  const titleText = isExpired
    ? 'Essai Gratuit Terminé'
    : isSuspended
    ? 'Accès Suspendu'
    : isStarter
    ? 'Débloquez les fonctionnalités avancées'
    : 'Accès Restreint'

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-xl text-center animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          {badgeText}
        </span>

        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          {titleText}
        </h2>

        <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 leading-relaxed">
          {access.message || 'Ce module requiert un abonnement actif supérieur.'}
        </p>

        {isStarter && (
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Le Plan Entreprise (10 000 FCFA/mois) débloque :
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Trésorerie complète, banques & multi-liquidités</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Rapports & analyses décisionnelles avancées</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Inventaire physique chiffré avec suivi des écarts</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Comptabilité SYSCOHADA Révisé conforme DGI Bénin</span>
              </li>
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/hub"
            className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retourner au HUB</span>
          </Link>

          <Link
            to="/dashboard/abonnement"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isExpired || isSuspended ? 'Consulter les formules & Activer' : 'Passer au Plan Supérieur'}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ModuleGuard
