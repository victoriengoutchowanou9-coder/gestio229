// =============================================================================
// GESTIO 229 SaaS — Écran de Sélection du Profil École & Centre de Formation
// Support des 3 profils :
// 1. Établissement Scolaire (Maternelle, Primaire, Collège, Lycée)
// 2. Centre de Formation Professionnelle & Continue
// 3. Établissement Mixte (Double cursus Scolaire & Formations Certifiantes)
// =============================================================================

import React, { useState } from 'react'
import {
  GraduationCap, Award, BookOpen, Check, ArrowRight,
  ShieldCheck, Users, Calendar, DollarSign, Sparkles,
  Layers, FileText, CheckCircle2
} from 'lucide-react'
import { useEcoleConfig } from '../../../hooks/useEcoleConfig'
import { useUIStore } from '../../../store/uiStore'
import { EcoleTypeEtablissement } from '../../../services/ecoleService'

interface Props {
  onSelected?: (mode: EcoleTypeEtablissement) => void
}

export const EcoleVersionSelector: React.FC<Props> = ({ onSelected }) => {
  const { selectType, loading } = useEcoleConfig()
  const { toast } = useUIStore()
  const [submitting, setSubmitting] = useState<EcoleTypeEtablissement | null>(null)

  const handleSelect = async (mode: EcoleTypeEtablissement) => {
    setSubmitting(mode)
    try {
      const ok = await selectType(mode)
      if (ok) {
        toast.success(
          'Profil configuré avec succès !',
          mode === 'SCOLAIRE'
            ? 'Votre établissement est configuré en mode Établissement Scolaire.'
            : mode === 'FORMATION_PRO'
            ? 'Votre établissement est configuré en mode Centre de Formation Professionnelle.'
            : 'Votre établissement est configuré en mode Établissement Mixte (Scolaire + Formation).'
        )
        if (onSelected) {
          onSelected(mode)
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
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-500/10 border border-lime-500/20 text-lime-600 dark:text-lime-400 text-xs font-bold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Secteur Éducation & Centre de Formation
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
          Configurez votre profil d'établissement
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Sélectionnez la typologie de votre structure. Cette configuration ajuste instantanément vos tableaux de bord, vos fiches d'apprenants, vos évaluations et vos attestations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl w-full">
        {/* ── CARTE 1 : Établissement Scolaire ── */}
        <div className="relative group bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border-2 border-slate-200 dark:border-slate-800 hover:border-lime-500 dark:hover:border-lime-500 shadow-xl transition-all duration-300 flex flex-col justify-between hover:shadow-lime-500/10 hover:-translate-y-1">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-lime-50 dark:bg-lime-950/60 text-lime-600 dark:text-lime-400 flex items-center justify-center mb-6 ring-8 ring-lime-500/10 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-7 h-7" />
            </div>

            <span className="inline-block px-3 py-1 text-xs font-bold tracking-wide uppercase rounded-full bg-lime-100 dark:bg-lime-950/60 text-lime-700 dark:text-lime-300 mb-2">
              Profil 1 — Cursus Général
            </span>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Établissement Scolaire
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Pour Écoles Primaires, Collèges, Lycées et Complexes Scolaires. Gestion intégrale des années académiques, trimestres, coefficients, devoirs et bulletins PDF.
            </p>

            <div className="space-y-3 mb-8">
              {[
                { icon: Users, text: 'Élèves, matricules uniques & parents WhatsApp' },
                { icon: Calendar, text: 'Emploi du temps & détection des conflits de salle' },
                { icon: BookOpen, text: 'Saisie des notes, moyennes pondérées & bulletins PDF' },
                { icon: DollarSign, text: 'Échéanciers scolarité & reçus de versement' },
                { icon: ShieldCheck, text: 'Appel journalier, absences & discipline' }
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  <div className="w-5 h-5 rounded-full bg-lime-500/10 text-lime-600 dark:text-lime-400 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                  <span>{feat.text}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleSelect('SCOLAIRE')}
            disabled={Boolean(submitting) || loading}
            className="w-full py-3.5 px-4 rounded-xl bg-lime-600 hover:bg-lime-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-lime-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {submitting === 'SCOLAIRE' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Activer le mode Scolaire</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* ── CARTE 2 : Centre de Formation Pro ── */}
        <div className="relative group bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 shadow-xl transition-all duration-300 flex flex-col justify-between hover:shadow-blue-500/10 hover:-translate-y-1">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6 ring-8 ring-blue-500/10 group-hover:scale-110 transition-transform">
              <Award className="w-7 h-7" />
            </div>

            <span className="inline-block px-3 py-1 text-xs font-bold tracking-wide uppercase rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 mb-2">
              Profil 2 — Professionnel & Métiers
            </span>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Centre de Formation Pro
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Pour Instituts Professionnels, Cabinets de formation et Académies certifiantes. Gestion par modules, sessions calendaires et génération de certificats vérifiables.
            </p>

            <div className="space-y-3 mb-8">
              {[
                { icon: Layers, text: 'Catalogue de formations & sessions intensives' },
                { icon: Award, text: 'Certificats & attestations avec QR code de vérification' },
                { icon: Users, text: 'Gestion des apprenants, stagiaires & formateurs' },
                { icon: DollarSign, text: 'Facturation par session / modules & acomptes' },
                { icon: CheckCircle2, text: 'Assiduité par séance & compétences validées' }
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  <div className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                  <span>{feat.text}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleSelect('FORMATION_PRO')}
            disabled={Boolean(submitting) || loading}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {submitting === 'FORMATION_PRO' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Activer le mode Formation Pro</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* ── CARTE 3 : Établissement Mixte ── */}
        <div className="relative group bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border-2 border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 shadow-xl transition-all duration-300 flex flex-col justify-between hover:shadow-purple-500/10 hover:-translate-y-1">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6 ring-8 ring-purple-500/10 group-hover:scale-110 transition-transform">
              <FileText className="w-7 h-7" />
            </div>

            <span className="inline-block px-3 py-1 text-xs font-bold tracking-wide uppercase rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 mb-2">
              Profil 3 — Cursus Hybride
            </span>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Établissement Mixte
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Pour Universités, Grandes Écoles et Centres d'enseignement offrant à la fois des classes académiques annuelles et des formations certifiantes à la carte.
            </p>

            <div className="space-y-3 mb-8">
              {[
                { icon: Sparkles, text: 'Tous les modules Scolaires et Formation réunis' },
                { icon: GraduationCap, text: 'Classes régulières + Sessions de formation pro' },
                { icon: BookOpen, text: 'Bulletins de notes & Certificats de réussite' },
                { icon: Layers, text: 'Bibliothèque documentaire & Prêts de livres' },
                { icon: DollarSign, text: 'Consolidation financière globale' }
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  <div className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                  <span>{feat.text}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleSelect('MIXTE')}
            disabled={Boolean(submitting) || loading}
            className="w-full py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {submitting === 'MIXTE' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Activer le mode Mixte</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EcoleVersionSelector
