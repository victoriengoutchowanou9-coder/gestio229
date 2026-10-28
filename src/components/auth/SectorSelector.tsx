// =============================================================================
// GESTIO 229 SaaS — SectorSelector : Sélection Multi-Secteurs à l'Inscription
// =============================================================================
// Note de compatibilité Vite / ESM :
// Ne pas importer 'lodash' par défaut (ex: import _ from 'lodash') pour éviter
// l'erreur '_ is not a function' en production Vite. Utilisation exclusive de
// méthodes ES6 natives (Array.from, Set, filter, includes) ou d'imports nommés.
// =============================================================================
// Section 1 & 2 du cahier des charges :
// - L'utilisateur peut sélectionner 1, 2, 3 ou plus de 3 secteurs dès l'inscription.
// - Les 3 premiers secteurs sélectionnés sont couverts par l'essai gratuit unique de 30 jours.
// - Tout secteur supplémentaire (à partir du 4e) nécessite un abonnement payant
//   (enregistré en attente de paiement jusqu'à validation).
// =============================================================================

import React from 'react'
import {
  Wrench, Fish, Utensils, ShoppingCart, Pill, Fuel,
  Building2, GraduationCap, Home, Car, Printer, Beer,
  Landmark, Sprout, Sparkles, Scissors, Store, Croissant,
  Truck, Check, ShieldCheck, AlertCircle, Navigation, CreditCard, Gift
} from 'lucide-react'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'
import {
  MAX_FREE_TRIAL_SECTORS,
  EXTRA_SECTOR_MONTHLY_PRICE,
  calculateRegistrationTrialSummary,
} from '../../core/subscription/subscriptionEngine'

export interface SectorOption {
  slug: string
  name: string
  description: string
  icon: React.ElementType
  color: string
  badge?: string
}

const ICON_MAP: Record<string, React.ElementType> = {
  Wrench, Fish, Utensils, ShoppingCart, Pill, Fuel,
  Building2, GraduationCap, Home, Car, Printer, Beer,
  Landmark, Sprout, Sparkles, Scissors, Store, Croissant,
  Truck, Navigation
}

const COLOR_PALETTE = [
  'from-orange-500 to-amber-600',
  'from-cyan-500 to-blue-600',
  'from-rose-500 to-red-600',
  'from-emerald-500 to-green-600',
  'from-teal-500 to-emerald-600',
  'from-yellow-500 to-orange-600',
  'from-indigo-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-slate-600 to-slate-800',
  'from-zinc-600 to-neutral-800',
  'from-violet-500 to-fuchsia-600',
  'from-amber-500 to-yellow-600',
  'from-emerald-600 to-teal-700',
  'from-lime-500 to-green-600',
  'from-pink-500 to-rose-600',
  'from-purple-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-amber-600 to-orange-700',
  'from-blue-600 to-cyan-700',
  'from-teal-600 to-cyan-700',
]

export const SECTORS_LIST: SectorOption[] = ALL_SECTORS_CATALOG.map((item, idx) => ({
  slug: item.slug,
  name: item.name,
  description: item.description,
  icon: ICON_MAP[item.icon] || Store,
  color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
  badge: item.badge,
}))

interface SectorSelectorProps {
  selectedSectors: string[]
  onChange: (sectors: string[]) => void
  maxSelection?: number
  onMultipleAttempt?: () => void
}

export const SectorSelector: React.FC<SectorSelectorProps> = ({
  selectedSectors,
  onChange,
}) => {
  const toggleSector = (slug: string) => {
    if (selectedSectors.includes(slug)) {
      onChange(selectedSectors.filter((s) => s !== slug))
    } else {
      onChange([...selectedSectors, slug])
    }
  }

  const summary = calculateRegistrationTrialSummary(selectedSectors, 1)

  return (
    <div className="space-y-4">
      {/* Bandeau Règle Officielle Essai Gratuit 30 Jours (Max 3 Secteurs) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/90 border border-emerald-500/30 rounded-xl px-4 py-3">
        <div className="flex items-start sm:items-center gap-2.5">
          <Gift className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
          <span className="text-xs text-slate-200 leading-relaxed">
            <strong className="text-emerald-400">Essai gratuit unique de 30 jours :</strong> couvre jusqu'à{' '}
            <strong className="text-white">3 secteurs d'activité</strong>. Au-delà de 3 secteurs, chaque secteur supplémentaire est facturé{' '}
            <strong className="text-amber-300">{EXTRA_SECTOR_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA / mois</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {summary.freeTrialSectorsCount} / {MAX_FREE_TRIAL_SECTORS} gratuit(s)
          </span>
          {summary.paidExtraSectorsCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              +{summary.paidExtraSectorsCount} payant(s)
            </span>
          )}
        </div>
      </div>

      {/* Grille des secteurs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
        {SECTORS_LIST.map((sector) => {
          const selectionIndex = selectedSectors.indexOf(sector.slug)
          const isSelected = selectionIndex !== -1
          const isFreeTrialSector = isSelected && selectionIndex < MAX_FREE_TRIAL_SECTORS
          const isPaidExtraSector = isSelected && selectionIndex >= MAX_FREE_TRIAL_SECTORS
          const Icon = sector.icon

          return (
            <button
              key={sector.slug}
              type="button"
              onClick={() => toggleSector(sector.slug)}
              className={`group relative flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150 ${
                isFreeTrialSector
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
                  : isPaidExtraSector
                  ? 'bg-amber-500/15 border-amber-500 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500'
                  : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              {/* Icône métier */}
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${sector.color} flex items-center justify-center shrink-0 shadow-md`}
              >
                <Icon className="w-5 h-5 text-white" />
              </div>

              {/* Texte */}
              <div className="flex-1 min-w-0 pr-5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p
                    className={`text-xs font-semibold truncate ${
                      isFreeTrialSector
                        ? 'text-emerald-300'
                        : isPaidExtraSector
                        ? 'text-amber-300'
                        : 'text-slate-200'
                    }`}
                  >
                    {sector.name}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-tight">
                  {sector.description}
                </p>

                {/* Badge statut essai vs payant sur la carte sélectionnée */}
                {isFreeTrialSector && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    Secteur #{selectionIndex + 1} • Essai gratuit (30j)
                  </span>
                )}
                {isPaidExtraSector && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <CreditCard className="w-3 h-3" />
                    Secteur #{selectionIndex + 1} • Supplément payant ({EXTRA_SECTOR_MONTHLY_PRICE.toLocaleString('fr-FR')} F/mois)
                  </span>
                )}
              </div>

              {/* Case de sélection */}
              <div
                className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-all text-[10px] font-bold ${
                  isFreeTrialSector
                    ? 'bg-emerald-500 text-white'
                    : isPaidExtraSector
                    ? 'bg-amber-500 text-slate-950'
                    : 'border border-slate-600 group-hover:border-slate-400'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* Récapitulatif obligatoire avant confirmation (Section 2.2) */}
      {selectedSectors.length > 0 && (
        <div
          className={`rounded-xl p-4 border transition-all ${
            summary.paidExtraSectorsCount > 0
              ? 'bg-amber-950/30 border-amber-500/40'
              : 'bg-emerald-950/25 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              {summary.paidExtraSectorsCount > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  Récapitulatif de votre sélection multi-secteurs
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Récapitulatif de votre essai gratuit (30 jours)
                </>
              )}
            </h4>
            <span className="text-xs font-bold text-slate-300">
              {summary.totalSectorsSelected} secteur(s) sélectionné(s)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 uppercase">Total sélectionné</p>
              <p className="text-sm font-bold text-white mt-0.5">
                {summary.totalSectorsSelected} secteur(s)
              </p>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5">
              <p className="text-[10px] text-emerald-300 uppercase">Couverts par l'essai (30j)</p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">
                {summary.freeTrialSectorsCount} secteur(s) (0 FCFA)
              </p>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 uppercase">Secteurs suppl. payants</p>
              <p className="text-sm font-bold text-amber-400 mt-0.5">
                {summary.paidExtraSectorsCount} × {summary.unitPricePerExtraSector.toLocaleString('fr-FR')} F
              </p>
            </div>
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-lg p-2.5">
              <p className="text-[10px] text-amber-300 uppercase">Montant à régler (Suppl.)</p>
              <p className="text-sm font-extrabold text-white mt-0.5">
                {summary.totalExtraAmountToPay.toLocaleString('fr-FR')} FCFA / mois
              </p>
            </div>
          </div>

          {summary.paidExtraSectorsCount > 0 && (
            <p className="text-[11px] text-amber-200/90 mt-2.5 leading-relaxed">
              <strong>Important :</strong> Vos <strong>3 premiers secteurs</strong> seront immédiatement actifs avec l'essai gratuit de 30 jours.
              Les <strong>{summary.paidExtraSectorsCount} secteur(s) supplémentaire(s)</strong> seront ajoutés à votre espace en statut{' '}
              <span className="underline font-semibold">« En attente de paiement »</span> et leurs modules opérationnels seront débloqués dès validation de leur abonnement.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default SectorSelector
