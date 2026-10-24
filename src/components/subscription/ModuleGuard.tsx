// =============================================================================
// GESTIO 229 SaaS — GARDE D'ACCÈS AUX MODULES (ModuleGuard V4 — Section 4 & 11)
// =============================================================================
// Bloque l'accès aux modules opérationnels lorsque :
// 1. Le secteur courant est 'en_attente_paiement' ou 'expire' (seuls 'dashboard' et 'abonnement' sont accessibles).
// 2. L'entreprise est en Pack Starter (5 000 FCFA) et tente d'accéder à un module avancé.
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Lock, Sparkles, ArrowRight, CheckCircle2, CreditCard, LayoutDashboard } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { checkModuleAccess, ALWAYS_ACCESSIBLE_SECTOR_MODULES } from '../../core/subscription/subscriptionEngine'
import { evaluerAccesSecteur, VerificationAccesSecteurResult, canonicalSectorSlug } from '../../services/abonnementService'

interface ModuleGuardProps {
  moduleId: string
  moduleTitle?: string
  children: React.ReactNode
}

export const ModuleGuard: React.FC<ModuleGuardProps> = ({
  moduleId,
  moduleTitle = 'Fonctionnalité Avancée',
  children,
}) => {
  const navigate = useNavigate()
  const { sectorSlug } = useParams<{ sectorSlug?: string }>()
  const { company, user } = useAuthStore()
  const [sectorAccess, setSectorAccess] = useState<VerificationAccesSecteurResult | null>(null)

  const cleanSector = sectorSlug ? canonicalSectorSlug(sectorSlug) : ''
  const normMod = (moduleId || '').toLowerCase().trim()

  useEffect(() => {
    let mounted = true
    if (!company?.id || !cleanSector) return
    evaluerAccesSecteur(company.id, cleanSector, company.created_at, true)
      .then((res) => {
        if (mounted) setSectorAccess(res)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [company?.id, cleanSector, moduleId])

  if (user?.role === 'super_admin' || user?.is_super_admin) {
    return <>{children}</>
  }

  // Le Tableau de bord et le module Abonnement restent toujours accessibles (Section 4)
  if (ALWAYS_ACCESSIBLE_SECTOR_MODULES.has(normMod)) {
    return <>{children}</>
  }

  const abonnementHref = cleanSector ? `/app/${cleanSector}/abonnement` : '/abonnement'
  const dashboardHref = cleanSector ? `/app/${cleanSector}/tableau-bord` : '/dashboard'

  // Si l'abonnement spécifique du secteur est en attente de paiement ou expiré
  if (sectorAccess && !sectorAccess.autorise) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900/95 border border-amber-500/40 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            {sectorAccess.badgeLabel}
          </span>

          <h2 className="text-xl font-bold text-white mb-2">
            {moduleTitle} — Module verrouillé
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {sectorAccess.statutEffectif === 'en_attente_paiement'
              ? 'Votre secteur a été ajouté avec succès. Pour accéder à l\'ensemble de ses fonctionnalités, veuillez activer votre abonnement.'
              : sectorAccess.messageVerrouillage ||
                'L\'abonnement de ce secteur est arrivé à expiration. Veuillez activer ou renouveler votre abonnement pour débloquer ce module.'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate(dashboardHref)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-400" />
              Tableau de bord
            </button>
            <button
              onClick={() => navigate(abonnementHref)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Activer mon abonnement
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const access = checkModuleAccess(moduleId, company)

  if (access.allowed) {
    return <>{children}</>
  }

  const isExpired = access.reason === 'expired'

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-900/95 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-8 h-8 text-emerald-400" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          {isExpired ? 'Période d\'essai terminée' : 'Forfait Supérieur Requis'}
        </span>

        <h2 className="text-xl font-bold text-white mb-2">
          {isExpired ? 'Votre abonnement a expiré' : `Débloquez « ${moduleTitle} »`}
        </h2>

        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          {isExpired
            ? 'Votre période d\'essai gratuit de 30 jours est arrivée à échéance. Souscrivez à un abonnement pour retrouver immédiatement l\'accès à toutes vos données et fonctionnalités.'
            : `Votre forfait actuel (Pack Starter — 5 000 FCFA/mois) couvre les opérations essentielles. Passez au Pack Entreprise (10 000 FCFA/mois) pour activer ce module avancé.`}
        </p>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-left space-y-2 mb-6">
          <p className="text-xs font-semibold text-slate-300 mb-2">
            Inclus dans le Pack Entreprise (10 000 FCFA / mois) :
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Comptabilité SYSCOHADA complète (Bilan, Grand Livre, Journaux)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Trésorerie multi-banques, Mobile Money & rapprochements</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Rapports analytiques avancés, marges nettes & utilisateurs illimités</span>
          </div>
        </div>

        <button
          onClick={() => navigate(abonnementHref)}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
        >
          {isExpired ? 'Renouveler mon abonnement' : 'Passer au Pack Entreprise (10 000 FCFA)'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default ModuleGuard
