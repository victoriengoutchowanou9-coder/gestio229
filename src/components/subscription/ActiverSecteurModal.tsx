// =============================================================================
// GESTIO 229 SaaS — MODALE CLAIRE D'INFORMATION & ABONNEMENT SECTEUR
// Conforme aux directives :
// 1. Présente clairement le secteur concerné
// 2. Affiche son statut d'abonnement (Actif, En attente, Expiré, Non activé)
// 3. Présente les formules disponibles (Starter 5 000 F vs Entreprise 10 000 F)
// 4. Affiche les tarifs selon la durée (1, 3, 6, 12 mois avec remises)
// 5. Liste l'ensemble des fonctionnalités incluses dans ce secteur
// 6. SYSTÈME 100% MANUEL : Aucun auto-déblocage client, validation exclusive Super Admin
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CreditCard, X, ArrowRight, Lock, CheckCircle2,
  Clock, ShieldCheck, Sparkles, AlertCircle, ChevronRight, Check
} from 'lucide-react'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'
import {
  getSectorFeatureInfo,
  calculateDurationPrice,
  SINGLE_SECTOR_STARTER_PRICE,
  SINGLE_SECTOR_ENTERPRISE_PRICE
} from '../../core/subscription/subscriptionEngine'
import { supabase } from '../../lib/supabase'
import { toSecteurCode, canonicalSectorSlug } from '../../services/abonnementService'

interface ActiverSecteurModalProps {
  isOpen: boolean
  entrepriseId?: string
  companyId?: string
  sectorSlug?: string
  sectorSlugOrCode?: string
  sectorName?: string
  onClose: () => void
  onActivated?: (sectorSlug: string) => void
}

export const ActiverSecteurModal: React.FC<ActiverSecteurModalProps> = ({
  isOpen,
  entrepriseId,
  companyId,
  sectorSlug,
  sectorSlugOrCode,
  sectorName,
  onClose,
}) => {
  const navigate = useNavigate()
  const effectiveCompanyId = entrepriseId || companyId || ''
  const rawSlug = sectorSlug || sectorSlugOrCode || ''
  const [selectedDuration, setSelectedDuration] = useState<number>(1)
  const [selectedPlanTier, setSelectedPlanTier] = useState<'starter' | 'entreprise'>('entreprise')
  const [sectorSubStatus, setSectorSubStatus] = useState<{
    code: 'actif' | 'en_attente' | 'expire' | 'non_active'
    label: string
    dateFin: string | null
    badgeClass: string
  }>({
    code: 'non_active',
    label: 'Non activé — Activation requise',
    dateFin: null,
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  })
  const [loadingStatus, setLoadingStatus] = useState(false)

  const cleanSlug = canonicalSectorSlug(rawSlug || '')
  const catalogMeta = ALL_SECTORS_CATALOG.find((s) => s.slug === cleanSlug)
  const displayName = sectorName || catalogMeta?.name || cleanSlug.toUpperCase()
  const featureInfo = getSectorFeatureInfo(cleanSlug)

  useEffect(() => {
    if (!isOpen || !effectiveCompanyId || !cleanSlug) return

    let isMounted = true
    setLoadingStatus(true)

    async function checkStatus() {
      try {
        const targetCode = toSecteurCode(cleanSlug)

        // 1. Vérifier abonnements_secteurs
        const { data: sRow } = await supabase
          .from('abonnements_secteurs')
          .select('*')
          .eq('entreprise_id', effectiveCompanyId)
          .eq('secteur_code', targetCode)
          .maybeSingle()

        // 2. Vérifier si une demande est en attente
        const { data: reqRow } = await supabase
          .from('demandes_paiement_abonnement')
          .select('id, status, created_at')
          .eq('company_id', effectiveCompanyId)
          .eq('sector_slug', cleanSlug)
          .eq('status', 'en_attente')
          .maybeSingle()

        // 3. Vérifier abonnements_global
        const { data: gRow } = await supabase
          .from('abonnements_global')
          .select('*')
          .eq('entreprise_id', effectiveCompanyId)
          .maybeSingle()

        if (!isMounted) return

        const now = new Date()

        if (sRow?.statut_specifique === 'actif' && sRow.date_fin_specifique) {
          const fin = new Date(sRow.date_fin_specifique)
          if (fin > now) {
            setSectorSubStatus({
              code: 'actif',
              label: `Abonnement Actif (Jusqu'au ${fin.toLocaleDateString('fr-FR')})`,
              dateFin: sRow.date_fin_specifique,
              badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            })
            return
          } else {
            setSectorSubStatus({
              code: 'expire',
              label: `Abonnement Expiré le ${fin.toLocaleDateString('fr-FR')}`,
              dateFin: sRow.date_fin_specifique,
              badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40'
            })
            return
          }
        }

        if (reqRow) {
          setSectorSubStatus({
            code: 'en_attente',
            label: 'Demande en attente de validation par le Super Admin',
            dateFin: null,
            badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          })
          return
        }

        if (gRow?.statut_global === 'actif' && gRow.date_fin_global && new Date(gRow.date_fin_global) > now) {
          const fin = new Date(gRow.date_fin_global)
          setSectorSubStatus({
            code: 'actif',
            label: `Couvert par l'Abonnement Global (Jusqu'au ${fin.toLocaleDateString('fr-FR')})`,
            dateFin: gRow.date_fin_global,
            badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          })
          return
        }

        if (gRow?.statut_global === 'essai' && gRow.date_fin_global && new Date(gRow.date_fin_global) > now) {
          const fin = new Date(gRow.date_fin_global)
          setSectorSubStatus({
            code: 'actif',
            label: `Essai Gratuit Actif (Jusqu'au ${fin.toLocaleDateString('fr-FR')})`,
            dateFin: gRow.date_fin_global,
            badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40'
          })
          return
        }

        setSectorSubStatus({
          code: 'non_active',
          label: 'Non activé — Activation requise',
          dateFin: null,
          badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
        })
      } catch (_) {
        if (isMounted) {
          setSectorSubStatus({
            code: 'non_active',
            label: 'Statut en cours de vérification',
            dateFin: null,
            badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
          })
        }
      } finally {
        if (isMounted) setLoadingStatus(false)
      }
    }

    checkStatus()

    return () => {
      isMounted = false
    }
  }, [isOpen, effectiveCompanyId, cleanSlug])

  if (!isOpen) return null

  const basePrice =
    selectedPlanTier === 'starter'
      ? SINGLE_SECTOR_STARTER_PRICE
      : SINGLE_SECTOR_ENTERPRISE_PRICE

  const durationPricing = calculateDurationPrice(basePrice, selectedDuration)

  const handleGoToSubscriptionPage = () => {
    onClose()
    navigate(`/app/${cleanSlug}/abonnement`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8">
        {/* En-tête */}
        <div className="relative p-6 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/50 border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CreditCard className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${sectorSubStatus.badgeClass}`}>
                  {sectorSubStatus.code === 'actif' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {sectorSubStatus.code === 'en_attente' && <Clock className="w-3.5 h-3.5 text-amber-400" />}
                  {sectorSubStatus.code === 'expire' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  {sectorSubStatus.code === 'non_active' && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  {sectorSubStatus.label}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white">
                Secteur : {displayName}
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {featureInfo.tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Corps de la modale */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* 1. Description du secteur */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              {featureInfo.description}
            </p>
          </div>

          {/* 2. Choix de la formule */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              1. Formules disponibles pour ce secteur
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setSelectedPlanTier('starter')}
                className={`cursor-pointer p-4 rounded-2xl border transition-all ${
                  selectedPlanTier === 'starter'
                    ? 'bg-slate-800/90 border-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">Formule Starter</span>
                  <span className="text-sm font-extrabold text-emerald-400">5 000 FCFA</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Par mois • Modules essentiels : Vente comptoir, Caisse journalière, Gestion de stock de base, Clients.
                </p>
              </div>

              <div
                onClick={() => setSelectedPlanTier('entreprise')}
                className={`cursor-pointer p-4 rounded-2xl border transition-all ${
                  selectedPlanTier === 'entreprise'
                    ? 'bg-slate-800/90 border-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Formule Entreprise (Recommandée)
                  </span>
                  <span className="text-sm font-extrabold text-emerald-400">10 000 FCFA</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Par mois • Toutes fonctionnalités débloquées : Comptabilité SYSCOHADA Révisé, Trésorerie, Multi-caisses, Rapports.
                </p>
              </div>
            </div>
          </div>

          {/* 3. Choix de la durée */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              2. Durée & Tarifs applicables
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[1, 3, 6, 12].map((m) => {
                const calc = calculateDurationPrice(basePrice, m)
                const isSelected = selectedDuration === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedDuration(m)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-emerald-600/20 border-emerald-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-bold">{m} Mois</p>
                    <p className="text-sm font-extrabold text-emerald-400 mt-0.5">
                      {calc.netTotal.toLocaleString('fr-FR')} F
                    </p>
                    {calc.discountPercent > 0 ? (
                      <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                        -{calc.discountPercent}%
                      </span>
                    ) : (
                      <span className="inline-block mt-1 text-[10px] text-slate-500">Tarif standard</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 4. Fonctionnalités incluses dans le secteur */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              3. Fonctionnalités incluses dans le secteur {displayName}
            </label>
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(selectedPlanTier === 'starter'
                  ? featureInfo.starterFeatures
                  : [...featureInfo.starterFeatures, ...featureInfo.enterpriseFeatures.filter((f) => !f.includes('Toutes les fonctionnalités'))]
                ).map((feat, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5. Avertissement obligatoire sur le mode 100% Manuel */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300 mb-1">
                Système d'abonnement entièrement manuel
              </p>
              <p>
                Les activations et renouvellements d'abonnements sont validés exclusivement par le <strong>Concepteur GESTIO 229</strong> depuis le Super Admin.
                Après soumission de votre demande, votre secteur sera activé dès vérification de votre règlement par Mobile Money.
              </p>
            </div>
          </div>
        </div>

        {/* Pied de modale */}
        <div className="p-6 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Montant pour {selectedDuration} mois</p>
            <p className="text-xl font-extrabold text-emerald-400">
              {durationPricing.netTotal.toLocaleString('fr-FR')}{' '}
              <span className="text-xs text-slate-400 font-normal">FCFA</span>
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Fermer
            </button>

            <button
              type="button"
              onClick={handleGoToSubscriptionPage}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Demander l'activation / le renouvellement
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActiverSecteurModal
