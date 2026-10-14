// =============================================================================
// GESTIO 229 SaaS — Dashboard Exécutif École & Centre de Formation
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  GraduationCap, Users, DollarSign, Calendar, BookOpen,
  Award, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  ArrowUpRight, UserPlus, Receipt, FileText, ChevronRight,
  Filter, Sparkles, Building2, Library, ShieldAlert
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTenant } from '../../../hooks/useTenant'
import { useEcoleConfig } from '../../../hooks/useEcoleConfig'
import {
  getActiveSchoolYear, getElevesApprenants, getPaiementsRecus,
  getAbsencesRetards, getClasses, getFormationsCatalogue,
  getSessionsFormation, getAttestationsCertificats
} from '../../../services/ecoleService'

export const EcoleDashboardPage: React.FC = () => {
  const { companyId } = useTenant()
  const { isScolaire, isFormationPro, isMixte, typeEtablissement } = useEcoleConfig()

  const [loading, setLoading] = useState(true)
  const [anneeActive, setAnneeActive] = useState<any>(null)
  const [eleves, setEleves] = useState<any[]>([])
  const [paiements, setPaiements] = useState<any[]>([])
  const [absences, setAbsences] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [formations, setFormations] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [certificats, setCertificats] = useState<any[]>([])

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      if (!companyId) return
      setLoading(true)
      try {
        const [annee, el, paie, abs, cls, form, sess, cert] = await Promise.all([
          getActiveSchoolYear(companyId).catch(() => null),
          getElevesApprenants(companyId).catch(() => []),
          getPaiementsRecus(companyId, { limit: 10 }).catch(() => []),
          getAbsencesRetards(companyId).catch(() => []),
          getClasses(companyId).catch(() => []),
          getFormationsCatalogue(companyId).catch(() => []),
          getSessionsFormation(companyId).catch(() => []),
          getAttestationsCertificats(companyId).catch(() => [])
        ])

        if (isMounted) {
          setAnneeActive(annee)
          setEleves(el || [])
          setPaiements(paie || [])
          setAbsences(abs || [])
          setClasses(cls || [])
          setFormations(form || [])
          setSessions(sess || [])
          setCertificats(cert || [])
        }
      } catch (err) {
        console.warn('[EcoleDashboardPage] Erreur chargement:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadData()
    return () => { isMounted = false }
  }, [companyId])

  // Métriques financières calculées
  const totalFraisPrevu = eleves.reduce((acc, el) => acc + (Number(el.frais_scolarite_total) || 0), 0)
  const totalFraisPaye = eleves.reduce((acc, el) => acc + (Number(el.frais_scolarite_paye) || 0), 0)
  const soldeRestantDu = Math.max(0, totalFraisPrevu - totalFraisPaye)
  const tauxRecouvrement = totalFraisPrevu > 0 ? Math.round((totalFraisPaye / totalFraisPrevu) * 100) : 0

  // Métriques effectifs
  const effectifTotal = eleves.length
  const elevesActifs = eleves.filter(e => e.statut === 'ACTIF').length
  const absencesNonJustifiees = absences.filter(a => !a.est_justifie).length

  const fmtMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val) + ' FCFA'
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER CONTEXTUEL AVEC BADGES ── */}
      <div className="bg-gradient-to-r from-lime-900 via-emerald-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden border border-lime-500/20">
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-lime-500/20 text-lime-300 border border-lime-500/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {isScolaire && 'Établissement Scolaire'}
                {isFormationPro && 'Centre de Formation Pro'}
                {isMixte && 'Établissement Mixte (Scolaire & Formation)'}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 text-slate-200 border border-white/10 text-xs font-medium">
                Année : {anneeActive?.libelle || 'Année Académique Active'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-lime-400" />
              Pilotage Académique & Pédagogique
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Supervision en temps réel des effectifs, du recouvrement des frais scolaires, des plannings de cours et du suivi de l'assiduité.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="../eleves"
              className="px-4 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-lime-500/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Inscrire un {isFormationPro ? 'Apprenant' : 'Élève'}</span>
            </Link>
            <Link
              to="../frais"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-all border border-white/15"
            >
              <Receipt className="w-4 h-4" />
              <span>Encaisser Frais</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── KPI GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Effectif */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isFormationPro ? 'Apprenants Inscrits' : 'Effectif Élèves'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-lime-500/10 text-lime-600 dark:text-lime-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {loading ? '—' : effectifTotal}
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {elevesActifs} actifs
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Répartis sur {classes.length} classes / groupes
          </p>
        </div>

        {/* KPI 2 : Frais Scolarité Encaissés */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Frais Encaissés
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {loading ? '—' : fmtMoney(totalFraisPaye)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Taux de recouvrement</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{tauxRecouvrement}%</span>
          </div>
        </div>

        {/* KPI 3 : Reste à Recouvrer */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reste à Recouvrer
            </span>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {loading ? '—' : fmtMoney(soldeRestantDu)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Solde total attendu sur l'année
          </p>
        </div>

        {/* KPI 4 : Assiduité / Formations */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isFormationPro ? 'Certificats Émis' : 'Absences non Justifiées'}
            </span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isFormationPro
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {isFormationPro ? <Award className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {loading ? '—' : isFormationPro ? certificats.length : absencesNonJustifiees}
            </span>
            <span className="text-xs font-medium text-slate-500">
              {isFormationPro ? 'délivrés' : 'dossiers à régulariser'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isFormationPro ? `${sessions.length} sessions actives` : 'Appels & alertes parents'}
          </p>
        </div>
      </div>

      {/* ── BARRE DE PROGRESSION DU RECOUVREMENT FINANCIER ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Progression Globale du Recouvrement des Frais de Scolarité
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Encaissé : <strong className="text-emerald-600">{fmtMoney(totalFraisPaye)}</strong> sur un budget prévisionnel de <strong className="text-slate-900 dark:text-white">{fmtMoney(totalFraisPrevu)}</strong>
            </p>
          </div>
          <span className="text-lg font-black text-lime-600 dark:text-lime-400 self-start sm:self-auto">
            {tauxRecouvrement}%
          </span>
        </div>
        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-lime-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, tauxRecouvrement))}%` }}
          />
        </div>
      </div>

      {/* ── GRILLE DES ACCÈS DIRECTS AUX MODULES MÉTIERS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Module 1: Inscriptions & Élèves */}
        <Link
          to="../eleves"
          className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-lime-500 dark:hover:border-lime-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-lime-50 dark:bg-lime-950/60 text-lime-600 dark:text-lime-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-lime-600 transition-colors">
              Élèves & Apprenants
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Dossiers d'inscriptions, matricules uniques, pièces jointes et contacts parents WhatsApp.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-lime-600 dark:text-lime-400 mt-4">
            <span>Gérer les dossiers</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Module 2: Pédagogie & Emploi du temps */}
        <Link
          to="../pedagogie"
          className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">
              Pédagogie & Planning
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Classes, matières, coefficients et emploi du temps avec détection automatique de conflits.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-4">
            <span>Accéder au planning</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Module 3: Notes & Bulletins */}
        <Link
          to="../notes"
          className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BookOpen className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-emerald-600 transition-colors">
              Notes & Bulletins PDF
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Saisie des devoirs, calcul des moyennes pondérées, rangs et génération de bulletins officiels.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-4">
            <span>Consulter les notes</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Module 4: Finances & Frais de Scolarité */}
        <Link
          to="../frais"
          className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-amber-600 transition-colors">
              Finances & Scolarité
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Échéanciers par tranches, encaissements multi-modes (Espèces, MoMo) et reçus officiels.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 mt-4">
            <span>Suivre la trésorerie</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Modules supplémentaires selon profil */}
        {(isFormationPro || isMixte) && (
          <Link
            to="../formations-pro"
            className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Award className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-purple-600 transition-colors">
                Formations Pro & Certificats
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                Catalogue de modules, sessions programmées et émission d'attestations certifiées QR-Code.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 mt-4">
              <span>Gérer les formations</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        )}

        <Link
          to="../absences"
          className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-rose-500 dark:hover:border-rose-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-rose-600 transition-colors">
              Absences & Discipline
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Appel journalier par classe, justification médicale et registre des sanctions disciplinaires.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 mt-4">
            <span>Faire l'appel</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link
          to="../bibliotheque"
          className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Library className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-indigo-600 transition-colors">
              Bibliothèque & Supports
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Dépôt documentaire, supports de cours, épreuves d'examens et gestion des prêts physiques.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-4">
            <span>Ouvrir la bibliothèque</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* ── DERNIERS PAIEMENTS ENREGISTRÉS & SITUATION RÉCENTE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table Derniers Encaissements */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Derniers Encaissements Reçus</h3>
              <p className="text-xs text-slate-500">Paiements de scolarité récents avec numéros de reçus officiels</p>
            </div>
            <Link to="../frais" className="text-xs font-semibold text-lime-600 hover:underline">
              Voir tout
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {paiements.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center italic">Aucun paiement enregistré pour l'instant.</p>
            ) : (
              paiements.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                      {p.mode_paiement?.substring(0, 3) || 'ESP'}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {p.numero_recu}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(p.date_paiement).toLocaleDateString('fr-FR')} • {p.mode_paiement}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                    +{fmtMoney(Number(p.montant))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dernières Inscriptions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">
                Derniers {isFormationPro ? 'Apprenants' : 'Élèves'} Inscrits
              </h3>
              <p className="text-xs text-slate-500">Matricule et identifiant unique générés</p>
            </div>
            <Link to="../eleves" className="text-xs font-semibold text-lime-600 hover:underline">
              Voir tous
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {eleves.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center italic">Aucun élève enregistré.</p>
            ) : (
              eleves.slice(0, 5).map((el) => (
                <div key={el.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-lime-500/10 text-lime-700 dark:text-lime-300 flex items-center justify-center font-bold text-xs">
                      {el.nom?.[0]}{el.prenom?.[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {el.nom} {el.prenom}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Matricule : <span className="font-mono font-medium">{el.matricule}</span> • {el.classe_nom || 'Sans classe'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    el.statut === 'ACTIF'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {el.statut}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EcoleDashboardPage
