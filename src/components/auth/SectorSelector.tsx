'use client'

import React, { useState, useMemo } from 'react'
import {
  Search,
  Check,
  Store,
  ShoppingBasket,
  Hammer,
  UtensilsCrossed,
  Pill,
  Fuel,
  BedDouble,
  GraduationCap,
  Home,
  Car,
  Printer,
  Wine,
  Banknote,
  Fish,
  Sprout,
  Sparkles,
  Layers,
  CheckCircle2,
  ArrowRight
} from 'lucide-react'

export interface SectorItem {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  color: string
  popular?: boolean
}

export const ALL_SECTORS: SectorItem[] = [
  {
    id: 'sec-boutique',
    slug: 'boutique',
    name: 'Boutique & Commerce Général',
    description: 'Vente au détail, épicerie, alimentation générale, bazar et prêt-à-porter.',
    icon: 'Store',
    color: '#3B82F6',
    popular: true
  },
  {
    id: 'sec-quincaillerie',
    slug: 'quincaillerie',
    name: 'Quincaillerie & Matériaux',
    description: 'Ciment, fer à béton, outillage, plomberie, électricité, vente en gros et détail.',
    icon: 'Hammer',
    color: '#F59E0B',
    popular: true
  },
  {
    id: 'sec-poissonnerie',
    slug: 'poissonnerie',
    name: 'Poissonnerie & Produits Frais',
    description: 'Poissons congelés, viandes, volailles, gestion des cartons, pesées et chambres froides.',
    icon: 'Fish',
    color: '#06B6D4',
    popular: true
  },
  {
    id: 'sec-restaurant',
    slug: 'restaurant',
    name: 'Restaurant, Maquis & Fast-Food',
    description: 'Gestion des tables, commandes cuisine, menus du jour, livraisons et boissons.',
    icon: 'UtensilsCrossed',
    color: '#EF4444',
    popular: true
  },
  {
    id: 'sec-supermarche',
    slug: 'supermarche',
    name: 'Supermarché & Supérette',
    description: 'Multiples rayons, douchette code-barres rapide, gestion des DLC et promotions.',
    icon: 'ShoppingBasket',
    color: '#10B981'
  },
  {
    id: 'sec-pharmacie',
    slug: 'pharmacie',
    name: 'Pharmacie & Dépôt Médical',
    description: 'Gestion des ordonnances, numéros de lot, dates de péremption et alertes santé.',
    icon: 'Pill',
    color: '#8B5CF6'
  },
  {
    id: 'sec-station',
    slug: 'station-service',
    name: 'Station-Service & Hydrocarbures',
    description: 'Index pompes, cuves, clôtures de postes pompistes, fûts et lubrifiants.',
    icon: 'Fuel',
    color: '#F97316'
  },
  {
    id: 'sec-hotel',
    slug: 'hotel',
    name: 'Hôtel, Résidence & Auberge',
    description: 'Planning des chambres, réservations, check-in/out, room-service et nuitées.',
    icon: 'BedDouble',
    color: '#6366F1'
  },
  {
    id: 'sec-ecole',
    slug: 'ecole',
    name: 'École & Centre de Formation',
    description: 'Frais de scolarité, effectifs élèves, tranches de paiement et reçus officiels.',
    icon: 'GraduationCap',
    color: '#84CC16'
  },
  {
    id: 'sec-location',
    slug: 'location',
    name: 'Gestion Locative & Immobilier',
    description: 'Contrats de bail, suivi des loyers mensuels, quittances et relances impayés.',
    icon: 'Home',
    color: '#A855F7'
  },
  {
    id: 'sec-garage',
    slug: 'garage',
    name: 'Atelier, Garage & Mécanique',
    description: 'Ordres de réparation, pièces détachées, devis mécanique et main d’œuvre.',
    icon: 'Car',
    color: '#64748B'
  },
  {
    id: 'sec-impression',
    slug: 'impression',
    name: 'Imprimerie & Sérigraphie',
    description: 'Devis sur mesure, suivi des BAT, tirages offset/numérique et sous-traitance.',
    icon: 'Printer',
    color: '#EC4899'
  },
  {
    id: 'sec-brasserie',
    slug: 'brasserie',
    name: 'Brasserie & Dépôt de Boissons',
    description: 'Gestion des casiers consignés, bouteilles pleines/vides et grossistes.',
    icon: 'Wine',
    color: '#EAB308'
  },
  {
    id: 'sec-microfinance',
    slug: 'microfinance',
    name: 'Microfinance & Tontine',
    description: 'Cotisations journalières, carnets de tontine, crédits et épargne solidaire.',
    icon: 'Banknote',
    color: '#14B8A6'
  },
  {
    id: 'sec-agro',
    slug: 'agroalimentaire',
    name: 'Agro-Business & Élevage',
    description: 'Production agricole, intrants, provendes, récoltes et ventes en gros.',
    icon: 'Sprout',
    color: '#22C55E'
  },
  {
    id: 'sec-cosmetique',
    slug: 'cosmetique',
    name: 'Cosmétique & Salon de Beauté',
    description: 'Prestations de soins, produits de beauté, coiffure et packs esthétiques.',
    icon: 'Sparkles',
    color: '#F43F5E'
  }
]

interface SectorSelectorProps {
  selected: string[]
  onToggle: (id: string) => void
  onContinue: () => void
  onBack: () => void
  submitting?: boolean
}

export const SectorSelector: React.FC<SectorSelectorProps> = ({
  selected,
  onToggle,
  onContinue,
  onBack,
  submitting = false
}) => {
  const [searchTerm, setSearchTerm] = useState('')

  const renderIcon = (iconName: string, isSelected: boolean) => {
    const props = { className: `w-6 h-6 transition-transform ${isSelected ? 'scale-110' : ''}` }
    switch (iconName) {
      case 'Store': return <Store {...props} />
      case 'Hammer': return <Hammer {...props} />
      case 'Fish': return <Fish {...props} />
      case 'UtensilsCrossed': return <UtensilsCrossed {...props} />
      case 'ShoppingBasket': return <ShoppingBasket {...props} />
      case 'Pill': return <Pill {...props} />
      case 'Fuel': return <Fuel {...props} />
      case 'BedDouble': return <BedDouble {...props} />
      case 'GraduationCap': return <GraduationCap {...props} />
      case 'Home': return <Home {...props} />
      case 'Car': return <Car {...props} />
      case 'Printer': return <Printer {...props} />
      case 'Wine': return <Wine {...props} />
      case 'Banknote': return <Banknote {...props} />
      case 'Sprout': return <Sprout {...props} />
      case 'Sparkles': return <Sparkles {...props} />
      default: return <Layers {...props} />
    }
  }

  const filteredSectors = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return ALL_SECTORS
    return ALL_SECTORS.filter(
      (sec) =>
        sec.name.toLowerCase().includes(term) ||
        sec.description.toLowerCase().includes(term) ||
        sec.slug.toLowerCase().includes(term)
    )
  }, [searchTerm])

  const count = selected.length
  const isSolo = count === 1
  const isMulti = count > 1

  return (
    <div className="space-y-6">
      {/* En-tête de l'étape 2 */}
      <div className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-2">
          <Layers className="w-3.5 h-3.5" /> Étape 2 sur 2 : Activités &amp; Secteurs
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Quelles activités exercez-vous ?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Sélectionnez un ou plusieurs secteurs d'activité pour configurer vos modules sur mesure (ex : <strong>Quincaillerie + Poissonnerie + Restaurant</strong>).
        </p>
      </div>

      {/* Barre de recherche en direct */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher un secteur (ex: quincaillerie, restaurant, poissonnerie, école...)"
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Raccourcis fréquents */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 font-medium">Suggestions :</span>
        {['Quincaillerie', 'Poissonnerie', 'Restaurant', 'Boutique'].map((name) => {
          const item = ALL_SECTORS.find((s) => s.name.toLowerCase().includes(name.toLowerCase()))
          if (!item) return null
          const isSelected = selected.includes(item.id) || selected.includes(item.slug)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              {isSelected ? '✓ ' : '+ '}
              {name}
            </button>
          )
        })}
      </div>

      {/* Grille 3 colonnes responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[440px] overflow-y-auto p-1 pr-2">
        {filteredSectors.map((sector) => {
          const isChecked = selected.includes(sector.id) || selected.includes(sector.slug)
          return (
            <div
              key={sector.id}
              onClick={() => onToggle(sector.id)}
              className={`relative group rounded-2xl p-4 cursor-pointer border-2 transition-all select-none flex flex-col justify-between ${
                isChecked
                  ? 'bg-indigo-50/80 border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                      isChecked
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                    }`}
                  >
                    {renderIcon(sector.icon, isChecked)}
                  </div>

                  {/* Checkbox Card indicator */}
                  <div
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isChecked
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm scale-105'
                        : 'border-slate-300 bg-white group-hover:border-indigo-400'
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-indigo-600 transition-colors">
                  {sector.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {sector.description}
                </p>
              </div>

              {sector.popular && (
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded">
                    Populaire au Bénin 🇧🇯
                  </span>
                </div>
              )}
            </div>
          )
        })}

        {filteredSectors.length === 0 && (
          <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Layers className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">Aucun secteur trouvé pour "{searchTerm}"</p>
            <p className="text-xs text-slate-500 mt-1">Essayez un autre mot-clé ou effacez la recherche.</p>
          </div>
        )}
      </div>

      {/* Encart dynamique du forfait sélectionné & Tarifs */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 p-4 sm:p-5 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Secteurs choisis :
              </span>
              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-500 text-white">
                {count} {count > 1 ? 'secteurs' : 'secteur'}
              </span>
            </div>

            <div className="mt-2">
              {count === 0 && (
                <p className="text-sm text-slate-300">
                  ⚠️ Veuillez sélectionner au moins <strong>1 secteur</strong> d'activité pour continuer.
                </p>
              )}

              {isSolo && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Forfait Solo Activité
                  </span>
                  <span className="text-lg font-black text-white">
                    10 000 FCFA <span className="text-xs font-normal text-slate-300">/ mois</span>
                  </span>
                </div>
              )}

              {isMulti && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" /> Forfait Multiservices ({count} activités regroupées)
                  </span>
                  <span className="text-lg font-black text-white">
                    25 000 FCFA <span className="text-xs font-normal text-slate-300">/ mois</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Boutons d'action Étape 2 */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold rounded-xl transition-all border border-slate-700"
            >
              Retour
            </button>

            <button
              type="button"
              onClick={onContinue}
              disabled={count === 0 || submitting}
              className={`px-6 py-3 text-sm font-extrabold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all ${
                count === 0 || submitting
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 active:scale-[0.98]'
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Création en cours...</span>
                </>
              ) : (
                <>
                  <span>Valider &amp; Créer mon compte</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SectorSelector
