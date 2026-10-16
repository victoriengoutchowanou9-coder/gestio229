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
  Scissors,
  Croissant,
  Truck,
  Layers,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  PhoneCall,
  X
} from 'lucide-react'

import { formatFCFA } from '../../core/subscription/subscriptionEngine'

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
    id: 'sec-quincaillerie',
    slug: 'quincaillerie',
    name: 'Quincaillerie & Matériaux',
    description: 'Ciment, fer à béton, outillage, plomberie, électricité, vente gros/détail et suivi chantiers.',
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
    name: 'Bar, Restaurant, Maquis & Fast Food',
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
    color: '#10B981',
    popular: true
  },
  {
    id: 'sec-pharmacie',
    slug: 'pharmacie',
    name: 'Pharmacie & Dépôt Médical',
    description: 'Gestion des ordonnances, numéros de lot, dates de péremption et alertes santé.',
    icon: 'Pill',
    color: '#8B5CF6',
    popular: true
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
    slug: 'immobilier',
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
    slug: 'imprimerie',
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
    slug: 'agrobusiness',
    name: 'Agro-Business & Élevage',
    description: 'Production agricole, intrants, provendes, cheptel, récoltes et ventes en gros.',
    icon: 'Sprout',
    color: '#22C55E'
  },
  {
    id: 'sec-cosmetique',
    slug: 'cosmetiques',
    name: 'Cosmétiques & Salons de Beauté',
    description: 'Prestations de soins, produits de beauté, coiffure et forfaits esthétiques.',
    icon: 'Sparkles',
    color: '#F43F5E'
  },
  {
    id: 'sec-mercerie',
    slug: 'mercerie',
    name: 'Mercerie & Couture',
    description: 'Tissus au mètre, boutons, fermetures, commandes sur-mesure et retouches.',
    icon: 'Scissors',
    color: '#DB2777'
  },
  {
    id: 'sec-boutique',
    slug: 'boutique',
    name: 'Boutique & Magasin',
    description: 'Vente au détail, prêt-à-porter, alimentation générale, bazar et accessoires.',
    icon: 'Store',
    color: '#3B82F6',
    popular: true
  },
  {
    id: 'sec-boulangerie',
    slug: 'boulangerie',
    name: 'Boulangerie & Pâtisserie',
    description: 'Pains, viennoiseries, pâtisseries, gestion des fournées et invendus.',
    icon: 'Croissant',
    color: '#D97706'
  },
  {
    id: 'sec-transport',
    slug: 'transport',
    name: 'Transport & Logistique',
    description: 'Flotte de véhicules, suivi des trajets, bordereaux de livraison et fret.',
    icon: 'Truck',
    color: '#2563EB'
  }
]

interface SectorSelectorProps {
  selected: string[]
  onToggle: (id: string) => void
  onContinue: (planSlug: string) => void
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
  const [showMultiSectorModal, setShowMultiSectorModal] = useState(false)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)

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
      case 'Scissors': return <Scissors {...props} />
      case 'Croissant': return <Croissant {...props} />
      case 'Truck': return <Truck {...props} />
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

  // RÈGLE ABSOLUE CDC SECTION 2 : UN SEUL SECTEUR PRINCIPAL AUTORISÉ EN INSCRIPTION GRATUITE
  const handleSelectSector = (id: string) => {
    const isCurrentlySelected = selected.includes(id)

    // Si l'utilisateur clique sur le même secteur déjà sélectionné, il reste sélectionné
    if (isCurrentlySelected) {
      return
    }

    // Si un secteur est déjà choisi et qu'il en choisit un autre, on remplace le secteur principal
    onToggle(id)
    setWarningMessage(null)
  }

  const handleMultiSectorDemand = () => {
    setShowMultiSectorModal(true)
  }

  const selectedSectorObj = ALL_SECTORS.find((s) => selected.includes(s.id) || selected.includes(s.slug))
  const count = selected.length

  return (
    <div className="space-y-6">
      {/* En-tête de l'étape 2 avec règle claire */}
      <div className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-2">
          <Layers className="w-3.5 h-3.5" /> Étape 2 sur 2 : Secteur d'Activité Principal
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Quel est votre secteur d'activité principal ?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Sélectionnez <strong>un seul secteur principal</strong> pour démarrer votre période d'essai gratuit de 30 jours.
        </p>
      </div>

      {/* Message d'avertissement réglementaire si tentative multi-secteurs */}
      {warningMessage && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-semibold flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* Barre de recherche + bouton demande multisecteur */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher votre secteur principal (ex: quincaillerie, restaurant, boutique...)"
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

        <button
          type="button"
          onClick={handleMultiSectorDemand}
          className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 flex items-center justify-center gap-2 transition"
          title="Demander plusieurs secteurs d'activité"
        >
          <Layers className="w-4 h-4 text-indigo-600" />
          <span>Besoin de plusieurs activités ?</span>
        </button>
      </div>

      {/* Raccourcis fréquents (sélection unique) */}
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
              onClick={() => handleSelectSector(item.id)}
              className={`px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              {isSelected ? '✓ ' : ''}
              {name}
            </button>
          )
        })}
      </div>

      {/* Grille des secteurs (sélection unique radio-style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[440px] overflow-y-auto p-1 pr-2">
        {filteredSectors.map((sector) => {
          const isChecked = selected.includes(sector.id) || selected.includes(sector.slug)
          return (
            <div
              key={sector.id}
              onClick={() => handleSelectSector(sector.id)}
              className={`relative group rounded-2xl p-4 cursor-pointer border-2 transition-all select-none flex flex-col justify-between ${
                isChecked
                  ? 'bg-indigo-50/90 border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
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

                  {/* Radio Indicator (un seul secteur autorisé) */}
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isChecked
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm scale-105'
                        : 'border-slate-300 bg-white group-hover:border-indigo-400'
                    }`}
                  >
                    {isChecked && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
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

      {/* Encart récapitulatif & niveau d'accès (CDC Section 3 & 8) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-900 to-indigo-950 p-4 sm:p-5 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Secteur principal choisi :
              </span>
              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-500 text-white">
                {selectedSectorObj ? selectedSectorObj.name : 'Aucun'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-slate-900 uppercase tracking-wider">
                🎁 Période d'Essai 30 Jours Gratuite
              </span>
            </div>

            {count === 0 ? (
              <p className="text-sm text-amber-300">
                ⚠️ Veuillez sélectionner <strong>1 secteur d'activité principal</strong> pour continuer.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-slate-300">
                  Votre période d'essai gratuit de <strong>30 jours (0 FCFA)</strong> sera configurée pour ce secteur.
                </p>
                <p className="text-[11px] text-emerald-300 font-medium">
                  ✓ Abonnement standard : {formatFCFA(5000)} / mois à l'issue de l'essai.
                </p>
              </div>
            )}
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
              onClick={() => onContinue('starter')}
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
                  <span>Démarrage de l'essai gratuit...</span>
                </>
              ) : (
                <>
                  <span>Démarrer l'Essai Gratuit 1 Mois</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Demande Accès Multisecteur (CDC Section 3 & 8) */}
      {showMultiSectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-indigo-700 font-black text-lg">
                <Layers className="w-5 h-5 text-indigo-600" />
                <span>Offre Professionnelle Multi-Secteurs</span>
              </div>
              <button
                onClick={() => setShowMultiSectorModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-900 text-sm leading-relaxed font-medium">
              « Vous souhaitez utiliser plusieurs secteurs d'activité sur GESTIO229 ? Veuillez contacter notre équipe pour étudier votre besoin et définir une formule adaptée. »
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Pour des raisons de sécurité et d'adaptation personnalisée, l'exploitation simultanée de plusieurs secteurs d'activité est soumise à étude et validation par le Super Administrateur Back-Office.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Contact concepteur / Direction :</span>
                <span className="font-bold text-slate-900">+229 97 00 00 00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Email commercial :</span>
                <span className="font-bold text-indigo-600">contact@gestio229.bj</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Procédure :</span>
                <span className="font-bold text-emerald-700">Étude sous 24h &amp; attribution sur mesure</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowMultiSectorModal(false)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
              >
                J'ai compris, continuer avec 1 secteur principal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SectorSelector
