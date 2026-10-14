// =============================================================================
// GESTIO 229 SaaS — Écran de Sélection des Deux Versions Métier Garage
// Conforme Spécification Section 2 :
// Carte A : Garage & Mécanique classique
// Carte B : Parc Matériel BTP & Maintenance Multisite
// =============================================================================

import React, { useState } from 'react'
import {
  Wrench, Truck, Check, ArrowRight, ShieldCheck, Car,
  HardHat, Building2, Fuel, Users, ClipboardCheck, DollarSign,
  Layers, Package, Sparkles
} from 'lucide-react'
import { useGarageConfig } from '../../../hooks/useGarageConfig'
import { useUIStore } from '../../../store/uiStore'

interface Props {
  onSelected?: (mode: 'CLASSIC' | 'BTP_MULTISITE') => void | Promise<void>
}

export const GarageVersionSelector: React.FC<Props> = ({ onSelected }) => {
  const { selectVersion, loading } = useGarageConfig()
  const { toast } = useUIStore()
  const [submitting, setSubmitting] = useState<'CLASSIC' | 'BTP_MULTISITE' | null>(null)

  const handleSelect = async (mode: 'CLASSIC' | 'BTP_MULTISITE') => {
    setSubmitting(mode)
    try {
      const ok = await selectVersion(mode)
      if (ok) {
        toast.success(
          'Version activée avec succès !',
          mode === 'CLASSIC'
            ? 'Votre établissement est configuré en mode Garage & Mécanique classique.'
            : 'Votre établissement est configuré en mode Parc Matériel BTP & Maintenance Multisite.'
        )
        if (onSelected) {
          await onSelected(mode)
        }
      } else {
        toast.error('Erreur', 'Impossible de sauvegarder votre choix. Veuillez réessayer.')
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Une anomalie est survenue.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl w-full text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Secteur Atelier, Garage & Mécanique
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
          Choisissez votre solution de gestion
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Sélectionnez la version adaptée à votre activité. Votre choix configure l'ensemble des modules, menus et tableaux de bord de votre établissement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl w-full">
        {/* ── CARTE A : Garage & Mécanique classique ── */}
        <div className="relative group bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-xl transition-all duration-300 flex flex-col justify-between hover:shadow-emerald-500/10 hover:-translate-y-1">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Wrench className="w-7 h-7" />
            </div>

            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Garage & Mécanique classique
              </h2>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Atelier Pro
              </span>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Solution complète pour garages indépendants, ateliers de réparation, mécaniciens, carrossiers et centres automobiles.
            </p>

            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-5 mb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                Fonctionnalités métier incluses :
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Clients et véhicules</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Réception & Diagnostic</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Devis & Conversion OR</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Ordres de réparation (OR)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Mécaniciens & Planning</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Pièces détachées & Stock</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Achats & Fournisseurs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Caisse, Factures & Dépenses</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Assurances & Sinistres</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>Rentabilité par réparation</span>
                </li>
              </ul>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || submitting !== null}
            onClick={() => handleSelect('CLASSIC')}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting === 'CLASSIC' ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <span>Choisir la version classique</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* ── CARTE B : Parc Matériel BTP & Maintenance Multisite ── */}
        <div className="relative group bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border-2 border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 shadow-xl transition-all duration-300 flex flex-col justify-between hover:shadow-amber-500/10 hover:-translate-y-1">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Truck className="w-7 h-7" />
            </div>

            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Parc Matériel BTP & Multisite
              </h2>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                Flotte & Chantiers
              </span>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Solution complète pour entreprises de BTP, travaux publics et transport lourd possédant camions, engins, plusieurs ateliers et chantiers.
            </p>

            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-5 mb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                Fonctionnalités métier incluses :
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Parc engins & camions</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Compteurs Km & Heures moteur</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Organisation multisite & Ateliers</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Chantiers & Affectations</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Maintenance préventive & seuils</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Pannes chantier & Dépannage</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Cuves & Carburant (L/100, L/h)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Stocks pièces multisites</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Chauffeurs & CACES / Permis</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>Coûts de revient machine & TCO</span>
                </li>
              </ul>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || submitting !== null}
            onClick={() => handleSelect('BTP_MULTISITE')}
            className="w-full py-4 px-6 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting === 'BTP_MULTISITE' ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <span>Choisir la version BTP multisite</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>Ce choix est enregistré pour l'établissement. Vous pourrez changer de version à tout moment dans la Configuration sans aucune perte de données.</span>
      </div>
    </div>
  )
}

export default GarageVersionSelector
