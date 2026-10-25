// =============================================================================
// GESTIO 229 SaaS — GARDE D'ACCÈS SECTEUR (SectorGuard V4 — Section 4 & 11)
// =============================================================================
// Règles du cahier des charges :
// 1. Tout secteur appartenant à l'entreprise (ou ajouté depuis le Hub) peut être ouvert :
//    l'utilisateur arrive sur le Tableau de bord du secteur (/app/:sectorSlug/tableau-bord).
// 2. Si l'abonnement du secteur est inactif ('en_attente_paiement' ou 'expire') :
//    - Le Tableau de bord ('tableau-bord') et le module Abonnement ('abonnement') restent accessibles.
//    - Tous les autres modules opérationnels du secteur sont verrouillés.
// 3. Si le secteur n'a pas encore été ajouté au compte de l'entreprise, propose de l'ajouter
//    ou de retourner au Hub.
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Lock, CreditCard, ArrowLeft, PlusCircle, LayoutDashboard } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { isSectorSubscribed } from '../../lib/sectorClient'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'
import {
  evaluerAccesSecteur,
  ajouterSecteurAuCompte,
  VerificationAccesSecteurResult,
  canonicalSectorSlug,
} from '../../services/abonnementService'

interface SectorGuardProps {
  children: React.ReactNode
}

export const SectorGuard: React.FC<SectorGuardProps> = ({ children }) => {
  const { sectorSlug } = useParams<{ sectorSlug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { company, user, status } = useAuthStore()

  const [accessState, setAccessState] = useState<VerificationAccesSecteurResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [addingSector, setAddingSector] = useState(false)

  const cleanSlug = sectorSlug ? canonicalSectorSlug(sectorSlug) : ''
  const isSubscribed = Boolean(company && cleanSlug && isSectorSubscribed(cleanSlug, company))

  // Déterminer le sous-chemin courant dans /app/:sectorSlug/...
  const pathParts = location.pathname.split('/').filter(Boolean)
  // pathParts = ['app', ':sectorSlug', ':subPath?']
  const currentSubPath = (pathParts[2] || 'tableau-bord').toLowerCase().trim()
  const isAlwaysAccessibleRoute =
    currentSubPath === 'tableau-bord' ||
    currentSubPath === 'dashboard' ||
    currentSubPath === 'abonnement'

  // FIX CRITIQUE REACT #300 : Les Hooks (useEffect) DOIVENT être exécutés inconditionnellement
  // au tout début du composant AVANT tout return conditionnel.
  useEffect(() => {
    let mounted = true
    if (!company?.id || !cleanSlug) return

    setChecking(true)
    evaluerAccesSecteur(company.id, cleanSlug, company.created_at, isSubscribed)
      .then((res) => {
        if (mounted) {
          setAccessState(res)
          setChecking(false)
        }
      })
      .catch(() => {
        if (mounted) setChecking(false)
      })

    return () => {
      mounted = false
    }
  }, [company?.id, cleanSlug, isSubscribed, location.pathname])

  // 1. État de chargement initial de l'authentification (FIX #300 - Toujours retourner un JSX valide, jamais null ou objet)
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-[50vh] p-10 flex flex-col items-center justify-center text-center">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white font-semibold">Chargement secteur {sectorSlug || '...'}...</p>
        <p className="text-xs text-slate-500 mt-1">Initialisation de la session...</p>
      </div>
    )
  }

  // 2. Si l'entreprise ou le secteur n'est pas sélectionné (FIX #300)
  if (!company?.id || !cleanSlug) {
    return (
      <div className="min-h-[50vh] p-10 flex flex-col items-center justify-center text-center">
        <p className="text-white font-bold text-lg mb-1">Secteur {sectorSlug || '...'} introuvable</p>
        <p className="text-sm text-slate-400 mb-6">Entreprise ou secteur non sélectionné</p>
        <button
          type="button"
          onClick={() => navigate('/hub')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition shadow-lg shadow-emerald-500/20"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au HUB
        </button>
      </div>
    )
  }

  // 3. Le Super Admin universel traverse librement
  if (user?.role === 'super_admin' || user?.is_super_admin) {
    return <>{children}</>
  }

  // Si le secteur est ajouté à l'entreprise (ou trouvé dans abonnements_secteurs) :
  // - Si l'abonnement du secteur est actif (`accessState.autorise === true`), tous les modules sont autorisés.
  // - Si l'abonnement du secteur est inactif (`en_attente_paiement` ou `expire`),
  //   le Tableau de bord ('tableau-bord') et le module Abonnement ('abonnement') restent accessibles !
  const sectorExistsInAccount =
    isSubscribed || (accessState && accessState.statutEffectif !== 'non_active') || Boolean(accessState?.autorise)

  if (sectorExistsInAccount) {
    if (checking && !accessState) {
      return <>{children}</>
    }

    // Compte suspendu par le Super Admin : seul le module abonnement est accessible
    if (accessState?.statutEffectif === 'suspendu' && currentSubPath !== 'abonnement') {
      return (
        <div className="min-h-[75vh] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-900/95 border border-rose-500/40 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto mb-5">
              <Lock className="w-8 h-8 text-rose-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Abonnement suspendu</h2>
            <p className="text-sm text-slate-300 mb-6">
              {accessState.messageVerrouillage ||
                'L\'accès à ce secteur a été suspendu par l\'administration. Vos données restent intégralement conservées.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/hub')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour au Hub
              </button>
              <button
                onClick={() => navigate(`/app/${cleanSlug}/abonnement`)}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                <CreditCard className="w-4 h-4" />
                Accéder à Mon Abonnement
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Si l'abonnement est actif OU si l'utilisateur consulte le Tableau de bord ou le module Abonnement -> Autoriser !
    if (!accessState || accessState.autorise || isAlwaysAccessibleRoute) {
      return <>{children}</>
    }

    // Sinon : l'utilisateur tente d'ouvrir un module opérationnel verrouillé (Ventes, Caisse, Stocks, etc.)
    // sur un secteur dont l'abonnement est en attente de paiement ou expiré (Section 4 Étape 3)
    const sectorInfo = ALL_SECTORS_CATALOG.find((s) => s.slug === cleanSlug)
    const sectorName = sectorInfo?.name || cleanSlug.toUpperCase()

    return (
      <div className="min-h-[75vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900/95 border border-amber-500/40 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
            {accessState.badgeLabel} • {sectorName}
          </span>

          <h2 className="text-xl font-bold text-white mb-2">
            Module verrouillé — Activation d'abonnement requise
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {accessState.statutEffectif === 'en_attente_paiement'
              ? 'Votre secteur a été ajouté avec succès. Pour accéder à l\'ensemble de ses fonctionnalités, veuillez activer votre abonnement.'
              : accessState.messageVerrouillage ||
                'L\'abonnement de ce secteur est arrivé à expiration. Veuillez renouveler votre abonnement pour débloquer l\'ensemble de ses modules opérationnels.'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate(`/app/${cleanSlug}/tableau-bord`)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-400" />
              Tableau de bord
            </button>

            <button
              onClick={() => navigate(`/app/${cleanSlug}/abonnement`)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Activer mon abonnement
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Cas où le secteur n'est pas encore ajouté au compte de l'entreprise
  const sectorInfo = ALL_SECTORS_CATALOG.find((s) => s.slug === cleanSlug)
  const sectorName = sectorInfo?.name || cleanSlug.toUpperCase()

  const handleAddAndOpenSector = async () => {
    if (!company?.id) return
    setAddingSector(true)
    await ajouterSecteurAuCompte(company.id, cleanSlug, company.name)
    setAddingSector(false)
    navigate(`/app/${cleanSlug}/tableau-bord`)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-900/95 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-8 h-8 text-amber-400" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold mb-3">
          Secteur non ajouté
        </span>

        <h2 className="text-xl font-bold text-white mb-2">
          Secteur « {sectorName} »
        </h2>

        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          Ce secteur d'activité n'est pas encore rattaché à votre entreprise{' '}
          <strong className="text-slate-200">{company.name}</strong>. Vous pouvez l'ajouter à votre espace dès maintenant.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate('/hub')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au Hub
          </button>

          <button
            onClick={handleAddAndOpenSector}
            disabled={addingSector}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            {addingSector ? 'Ajout en cours...' : `Ajouter et ouvrir ${sectorName}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SectorGuard
