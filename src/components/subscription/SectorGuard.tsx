// =============================================================================
// GESTIO 229 SaaS — SectorGuard : Isolation Stricte & Contrôle des Secteurs (CDC Section 2, 3, 5 & 8)
// =============================================================================
// RÈGLES DE SÉCURITÉ :
// 1. Un utilisateur ne peut JAMAIS accéder à un secteur non autorisé simplement en modifiant l'URL.
// 2. Si le secteur n'est pas autorisé pour l'entreprise :
//    Message : « Vous souhaitez utiliser plusieurs secteurs d'activité sur GESTIO229 ? Veuillez contacter notre équipe pour étudier votre besoin et définir une formule adaptée. »
// 3. Si l'essai gratuit ou l'abonnement est terminé :
//    Message : « Votre période d'essai est arrivée à son terme. Pour continuer à utiliser les fonctionnalités payantes de GESTIO229, veuillez souscrire à un abonnement ou contacter notre équipe. »
// 4. Aucune auto-activation gratuite pirate de secteurs supplémentaires.
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Link, useParams, useLocation, Navigate, useNavigate } from 'react-router-dom'
import {
  Lock, ArrowLeft, ShieldAlert, Sparkles, Clock, AlertTriangle,
  CheckCircle2, Calendar, Shield, Loader2, ArrowRight, Phone, Mail, Send
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { getActiveSectorSlug, canonicalSectorSlug, isSectorSubscribed } from '../../lib/sectorClient'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'
import { normalizeSectorSlug } from '../../core/team/sectorRoles'
import { checkSecteurAccess, SecteurAccessCheck } from '../../services/abonnementService'
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

  const [accessCheck, setAccessCheck] = useState<SecteurAccessCheck | null>(null)
  const [checking, setChecking] = useState(true)

  // État formulaire demande d'extension multi-secteur
  const [requestReason, setRequestReason] = useState('')
  const [requestSending, setRequestSending] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  // 1. L'accès à la page d'abonnement est toujours autorisé
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

  // Vérification de souscription directe
  const isSubscribed = isSectorSubscribed(targetClean, company)

  // 3. Vérification dynamique de l'accès
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

  // 5. Si le secteur est explicitement autorisé pour l'entreprise ET abonnement valide : rendu normal
  if (isSubscribed && accessCheck?.allowed) {
    return <>{children}</>
  }

  const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === targetClean)
  const sectorName = meta?.name || meta?.label || targetSectorSlug
  const sectorEmoji = meta?.emoji || '🏢'

  // Soumission de la demande multi-secteur au Super Administrateur
  const handleSubmitMultiSectorRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) return

    setRequestSending(true)
    setRequestError(null)

    try {
      const res = await fetch('/api/sector-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          company_name: company.name,
          user_id: user?.id,
          user_email: user?.email || company.email,
          user_phone: user?.phone || company.phone,
          requested_sectors: [targetClean],
          reason: requestReason.trim() || `Demande d'accès au secteur ${sectorName}`,
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setRequestSent(true)
      } else {
        setRequestError(data.error || 'Erreur lors de la soumission de la demande.')
      }
    } catch (err: any) {
      setRequestError(err.message || 'Erreur de connexion avec le serveur.')
    } finally {
      setRequestSending(false)
    }
  }

  // 6. CAS 1 : SECTEUR NON AUTORISÉ POUR CETTE ENTREPRISE (CDC Section 2, 3 & 8)
  // Message exact requis :
  // « Vous souhaitez utiliser plusieurs secteurs d'activité sur GESTIO229 ? Veuillez contacter notre équipe pour étudier votre besoin et définir une formule adaptée. »
  if (!isSubscribed) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-950 shadow-2xl overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="p-6 sm:p-8 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white">
            <div className="flex items-center gap-3.5 mb-3">
              <span className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-3xl border border-white/20 shadow-inner">
                {sectorEmoji}
              </span>
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500 text-white shadow-sm">
                  Accès Multisecteur Requis
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white mt-1">
                  Activité « {sectorName} »
                </h2>
              </div>
            </div>
            <p className="text-xs text-indigo-200 leading-relaxed">
              Votre compte actuel est rattaché à votre secteur d'activité principal.
            </p>
          </div>

          {/* Corps avec message obligatoire CDC */}
          <div className="p-6 sm:p-8 space-y-5">
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-950 dark:text-indigo-200 text-sm font-semibold leading-relaxed">
              « Vous souhaitez utiliser plusieurs secteurs d'activité sur GESTIO229 ? Veuillez contacter notre équipe pour étudier votre besoin et définir une formule adaptée. »
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              L'accès aux secteurs complémentaires fait l'objet d'une validation par le Super Administrateur de la plateforme afin de garantir le paramétrage optimal de vos flux comptables SYSCOHADA et factures e-MECeF.
            </p>

            {/* Formulaire de demande au Super Admin */}
            {requestSent ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Votre demande d'extension pour <strong>{sectorName}</strong> a été transmise au Super Administrateur. Notre équipe vous contactera rapidement.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmitMultiSectorRequest} className="space-y-3 pt-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Précisez votre besoin pour cette activité :
                </label>
                <textarea
                  rows={2}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Ex: Nous ouvrons un second établissement ou souhaitons gérer cette activité..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                {requestError && (
                  <p className="text-xs text-rose-600 font-semibold">{requestError}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={requestSending}
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {requestSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Envoyer la demande d'extension</span>
                  </button>

                  <Link
                    to="/hub"
                    className="py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Retour au HUB</span>
                  </Link>
                </div>
              </form>
            )}

            {/* Coordonnées directes */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-indigo-500" />
                <span>Support &amp; Concepteur : +229 97 00 00 00</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-500" />
                <span>contact@gestio229.bj</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 7. CAS 2 : PÉRIODE D'ESSAI OU ABONNEMENT TERMINÉ (CDC Section 3 & 8)
  // Message exact requis :
  // « Votre période d'essai est arrivée à son terme. Pour continuer à utiliser les fonctionnalités payantes de GESTIO229, veuillez souscrire à un abonnement ou contacter notre équipe. »
  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl border border-amber-200 dark:border-amber-900/60 p-8 shadow-xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Clock className="w-8 h-8" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          Période d'Essai Terminée
        </span>

        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          Essai Gratuit Échu
        </h2>

        <div className="p-4 my-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-950 dark:text-amber-200 text-xs sm:text-sm font-semibold leading-relaxed text-left">
          « Votre période d'essai est arrivée à son terme. Pour continuer à utiliser les fonctionnalités payantes de GESTIO229, veuillez souscrire à un abonnement ou contacter notre équipe. »
        </div>

        <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
          Toutes vos données (ventes, achats, stocks, écritures comptables) sont intégralement conservées en toute sécurité.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/dashboard/abonnement"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Souscrire à l'abonnement standard (5 000 FCFA/mois)</span>
          </Link>

          <Link
            to="/hub"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retourner au HUB</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default SectorGuard
