// =============================================================================
// GESTIO 229 SaaS — SectorGuard : Isolation Stricte & Gestion Dynamique d'Accès
// =============================================================================
// Règle 3 & 5 (CDC) :
// - Si abonnements_secteurs.rattache_au_global = false ET now <= date_fin_specifique : ACCES OK
// - Si rattache_au_global = true : vérifie abonnements_global.date_fin_global
// - Si pas de ligne du tout : au lieu de l'erreur "Secteur non souscrit", modale
//   d'activation de l'essai gratuit de 30 jours INDÉPENDANT.
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Link, useParams, useLocation, Navigate, useNavigate } from 'react-router-dom'
import {
  Lock, ArrowLeft, ShieldAlert, Sparkles, Clock, AlertTriangle,
  CheckCircle2, Calendar, Shield, Loader2, ArrowRight
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { getActiveSectorSlug, canonicalSectorSlug } from '../../lib/sectorClient'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'
import { normalizeSectorSlug } from '../../core/team/sectorRoles'
import {
  checkSecteurAccess,
  activerEssaiIndividuelSecteur,
  SecteurAccessCheck
} from '../../services/abonnementService'
import { ModuleSkeleton } from '../ui/Skeleton'

interface SectorGuardProps {
  children: React.ReactNode
}

export const SectorGuard: React.FC<SectorGuardProps> = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<{ sectorSlug?: string; sectorKey?: string }>()
  const company = useAuthStore((s) => s.company) || useAuthStore.getState().company
  const status = useAuthStore((s) => s.status) || useAuthStore.getState().status
  const user = useAuthStore((s) => s.user)
  const refreshTenantContext = useAuthStore((s) => s.refreshTenantContext)

  const [accessCheck, setAccessCheck] = useState<SecteurAccessCheck | null>(null)
  const [checking, setChecking] = useState(true)
  const [activating, setActivating] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)

  // 1. L'accès à l'abonnement est toujours autorisé
  const isAbonnementRoute = location.pathname.includes('/abonnement') || location.pathname.includes('/subscription')
  if (isAbonnementRoute) {
    return <>{children}</>
  }

  // 2. Attente initialisation store
  if (!company && (status === 'idle' || status === 'loading')) {
    return <ModuleSkeleton />
  }

  const isAdmin = !user || user.role === 'administrateur' || user.role === 'super_admin'
  const targetSectorSlug = params.sectorKey || params.sectorSlug || getActiveSectorSlug() || 'boutique'
  const targetClean = canonicalSectorSlug(targetSectorSlug)

  // 3. Vérification dynamique de l'accès selon la règle métier finale
  useEffect(() => {
    let isMounted = true
    if (!company?.id) {
      setChecking(false)
      return
    }

    setChecking(true)
    checkSecteurAccess(company.id, targetClean, company)
      .then((res) => {
        if (isMounted) {
          setAccessCheck(res)
          setChecking(false)
        }
      })
      .catch((err) => {
        console.warn('[SectorGuard] Erreur checkSecteurAccess:', err)
        if (isMounted) {
          setChecking(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [company?.id, targetClean])

  if (checking) {
    return <ModuleSkeleton />
  }

  // 4. Utilisateurs internes (non-admin) : vérification de leur secteur assigné
  if (!isAdmin && user) {
    const perm = (typeof user.permissions === 'object' && user.permissions) ? user.permissions : {}
    const userSector = normalizeSectorSlug(
      perm.sector_slug || perm.sector || perm.assigned_sector || perm.sector_id || user.sector_id || user.sector_slug || ''
    )

    if (userSector && targetClean && userSector !== targetClean && canonicalSectorSlug(userSector) !== targetClean) {
      let dest = 'tableau-bord'
      if (user.role === 'caissier' || user.role === 'vendeur') dest = 'vente-pos'
      else if (user.role === 'magasinier') dest = 'stocks'
      else if (user.role === 'comptable') dest = 'syscohada'
      return <Navigate to={`/app/${userSector}/${dest}`} replace />
    }
  }

  // 5. Si accès autorisé par le moteur d'abonnement : rendu normal
  if (accessCheck?.allowed) {
    return <>{children}</>
  }

  const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === targetClean)
  const sectorName = meta?.name || meta?.label || targetSectorSlug
  const sectorEmoji = meta?.emoji || '🏢'

  // Action d'activation immédiate de l'essai individuel de 30 jours
  const handleActiverEssai = async () => {
    if (!company?.id) return
    setActivating(true)
    setActivationError(null)

    const res = await activerEssaiIndividuelSecteur(company.id, targetClean, sectorName)
    setActivating(false)

    if (res.success) {
      if (refreshTenantContext) await refreshTenantContext()
      // Re-vérifier l'accès immédiatement pour débloquer l'écran
      const updated = await checkSecteurAccess(company.id, targetClean, company)
      setAccessCheck(updated)
    } else {
      setActivationError(res.error || "Impossible d'activer l'essai pour ce secteur.")
    }
  }

  // 6. RÈGLE 3 : CAS D'UN SECTEUR NON ACTIVÉ -> MODALE / ÉCRAN D'ACTIVATION ESSAI INDÉPENDANT 30J
  // Au lieu de l'ancienne erreur "Secteur non souscrit", on présente la modale d'activation
  if (!accessCheck?.isEnLigne || accessCheck?.needsActivationModal) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-6 sm:p-8 bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white">
            <div className="flex items-center gap-3.5 mb-3">
              <span className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-3xl border border-white/20 shadow-inner">
                {sectorEmoji}
              </span>
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-slate-950 shadow-sm">
                  1ère Activation Disponible
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white mt-1">
                  Activer {sectorName} ?
                </h2>
              </div>
            </div>
            <p className="text-xs text-emerald-50/90 leading-relaxed">
              Sous-logiciel d'exploitation autonome conforme au standard UEMOA / Bénin.
            </p>
          </div>

          {/* Corps de la modale conforme à la règle 3 du CDC */}
          <div className="p-6 sm:p-8 space-y-5">
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
              <p className="text-sm font-semibold text-slate-800 dark:text-emerald-100 leading-relaxed">
                C'est votre <span className="font-black text-emerald-600 dark:text-emerald-400">1ère activation</span> pour ce secteur.
                Il bénéficie de <span className="font-black text-emerald-600 dark:text-emerald-400">30 jours d'essai gratuit INDÉPENDANT</span>.
              </p>
              <p className="text-xs text-slate-600 dark:text-emerald-200/80 mt-2">
                Après ces 30 jours, il rejoindra automatiquement votre abonnement global existant.
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>Accès complet à 100% des modules métier de <strong>{sectorName}</strong></span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                <Calendar size={16} className="text-emerald-500 shrink-0" />
                <span>30 jours d'essai autonome, même si votre abonnement global arrive à échéance avant</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                <Shield size={16} className="text-emerald-500 shrink-0" />
                <span>Séparation stricte des données et facturation certifiée e-MECeF</span>
              </div>
            </div>

            {activationError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                {activationError}
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleActiverEssai}
                disabled={activating}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {activating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Activation en cours...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Activer l'essai gratuit de 30 jours</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <Link
                to="/hub"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
              >
                <ArrowLeft size={16} />
                <span>Retour au HUB</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 7. CAS D'EXPIRATION DU GLOBAL OU DU SECTEUR
  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl border border-amber-200 dark:border-amber-900/60 p-8 shadow-xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Clock className="w-8 h-8" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          Abonnement Expiré
        </span>

        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          Période de Validité Écoulée
        </h2>

        <p className="text-slate-600 dark:text-slate-300 text-sm mt-3 leading-relaxed">
          La période d'accès pour <strong>{sectorName}</strong> est arrivée à échéance.
          Renouvelez votre abonnement global pour réactiver l'ensemble de vos secteurs rattachés.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/dashboard/abonnement"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition"
          >
            <Sparkles className="w-4 h-4" />
            Renouveler l'abonnement
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

export default SectorGuard
