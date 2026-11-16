// =============================================================================
// GESTIO 229 SaaS — SectorSelector : Sélection Multi-Secteurs & Multisite à l'Inscription
// =============================================================================
// Note de compatibilité Vite / ESM :
// Ne pas importer 'lodash' par défaut (ex: import _ from 'lodash') pour éviter
// l'erreur '_ is not a function' en production Vite. Utilisation exclusive de
// méthodes ES6 natives (Array.from, Set, filter, includes) ou d'imports nommés.
// =============================================================================
// Règles de gestion :
// 1. Un essai gratuit unique de 30 jours couvre jusqu'à 3 secteurs pour toute l'entreprise.
// 2. Les 3 secteurs gratuits sont partagés et librement répartissables entre tous les sites.
// 3. Tout secteur supplémentaire (à partir du 4e) est facturé 5 000 FCFA / mois.
// 4. Chaque secteur sélectionné est obligatoirement rattaché à un site d'exploitation.
// =============================================================================

import React from 'react'
import {
  Wrench, Fish, Utensils, ShoppingCart, Pill, Fuel,
  Building2, GraduationCap, Home, Car, Printer, Beer,
  Landmark, Sprout, Sparkles, Scissors, Store, Croissant,
  Truck, Check, ShieldCheck, AlertCircle, Navigation, CreditCard, Gift,
  MapPin
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

export interface AvailableSiteOption {
  id: string
  name: string
  city: string
  address?: string
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

export interface SectorSelectorProps {
  selectedSectors: string[]
  onChange: (sectors: string[]) => void
  maxSelection?: number
  onMultipleAttempt?: () => void
  availableSites?: AvailableSiteOption[]
  sectorSiteMap?: Record<string, string>
  onSectorSiteChange?: (sectorSlug: string, siteId: string) => void
}

export const SectorSelector: React.FC<SectorSelectorProps> = ({
  selectedSectors,
  onChange,
  availableSites = [],
  sectorSiteMap = {},
  onSectorSiteChange,
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
            <strong className="text-white">3 secteurs d'activité</strong> pour toute l'entreprise (répartissables librement entre tous vos sites). Au-delà de 3 secteurs, chaque secteur supplémentaire est facturé{' '}
            <strong className="text-amber-300">{EXTRA_SECTOR_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA / mois</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {summary.freeTrialSectorsCount} / {MAX_FREE_TRIAL_SECTORS} secteurs gratuits utilisés
          </span>
          {summary.paidExtraSectorsCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              +{summary.paidExtraSectorsCount} secteur(s) supplémentaire(s) ({EXTRA_SECTOR_MONTHLY_PRICE.toLocaleString('fr-FR')} F/mois)
            </span>
          )}
        </div>
      </div>

      {/* Grille des secteurs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
        {SECTORS_LIST.map((sector) => {
          const selectionIndex = selectedSectors.indexOf(sector.slug)
          const isSelected = selectionIndex !== -1
          const isFreeTrialSector = isSelected && selectionIndex < MAX_FREE_TRIAL_SECTORS
          const isPaidExtraSector = isSelected && selectionIndex >= MAX_FREE_TRIAL_SECTORS
          const Icon = sector.icon
          const assignedSiteId = sectorSiteMap[sector.slug] || (availableSites[0]?.id || '')

          return (
            <div
              key={sector.slug}
              role="button"
              tabIndex={0}
              onClick={() => toggleSector(sector.slug)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleSector(sector.slug)
                }
              }}
              className={`group relative flex flex-col justify-between p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                isFreeTrialSector
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
                  : isPaidExtraSector
                  ? 'bg-amber-500/15 border-amber-500 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500'
                  : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div>
                <div className="flex items-start gap-3">
                  {/* Icône métier */}
                  <div
                    className={`w-10 h-10 rounded-lg bg-gradient-to-br ${sector.color} flex items-center justify-center shrink-0 shadow-md`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  {/* Texte */}
                  <div className="flex-1 min-w-0 pr-6">
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

                    {/* Badge statut essai vs payant */}
                    {isFreeTrialSector && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3" />
                        Secteur #{selectionIndex + 1} • Gratuit (30j)
                      </span>
                    )}
                    {isPaidExtraSector && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <CreditCard className="w-3 h-3" />
                        Secteur #{selectionIndex + 1} • Supplément ({EXTRA_SECTOR_MONTHLY_PRICE.toLocaleString('fr-FR')} F/mois)
                      </span>
                    )}
                  </div>
                </div>

                {/* Case de sélection cochée */}
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
              </div>

              {/* Sélecteur de rattachement au site d'exploitation si sélectionné */}
              {isSelected && availableSites && availableSites.length > 0 && (
                <div
                  className="mt-2.5 pt-2 border-t border-slate-700/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    Site d'exploitation *
                  </label>
                  <select
                    value={assignedSiteId}
                    onChange={(e) => {
                      e.stopPropagation()
                      onSectorSiteChange?.(sector.slug, e.target.value)
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {availableSites.map((site) => (
                      <option key={site.id} value={site.id} className="bg-slate-900 text-white">
                        {site.name} ({site.city})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Récapitulatif obligatoire avant confirmation */}
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
                  Récapitulatif de votre sélection multi-secteurs & multisite
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

          {/* Ventilation des secteurs par site */}
          {availableSites && availableSites.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-300">
              <span className="text-slate-400 font-semibold block mb-1">
                Répartition par site d'exploitation :
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedSectors.map((slug) => {
                  const secMeta = SECTORS_LIST.find((s) => s.slug === slug)
                  const siteId = sectorSiteMap[slug] || availableSites[0]?.id
                  const siteObj = availableSites.find((s) => s.id === siteId) || availableSites[0]
                  return (
                    <span
                      key={slug}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-700 text-slate-200"
                    >
                      <span className="font-semibold text-emerald-300">{secMeta?.name || slug}</span>
                      <span className="text-slate-500">➔</span>
                      <span className="text-white font-medium">{siteObj?.name || 'Site'} ({siteObj?.city || 'Bénin'})</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

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
