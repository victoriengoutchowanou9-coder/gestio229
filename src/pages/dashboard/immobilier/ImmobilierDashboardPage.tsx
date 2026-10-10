// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Métier : Gestion Locative & Immobilière Pro
// Conforme : Données 100% réelles, zéro valeur fictive, isolation company_id
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Home, Key, FileCheck, AlertTriangle, Users,
  TrendingUp, TrendingDown, DollarSign, Wallet, RefreshCw,
  Calendar, ShieldCheck, ArrowUpRight, ArrowRight, Wrench,
  Percent, Clock, CheckCircle2, ChevronRight, FileText
} from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { immobilierService, ImmobilierKPIs } from '../../../services/immobilierService'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

export const ImmobilierDashboardPage: React.FC = () => {
  const { company } = useAuthStore()
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<ImmobilierKPIs>({
    nbBiens: 0,
    nbUnites: 0,
    occupes: 0,
    disponibles: 0,
    enTravaux: 0,
    tauxOccupation: 0,
    loyersAttendusMois: 0,
    loyersEncaissesMois: 0,
    tauxRecouvrement: 0,
    totalImpayes: 0,
    impayesMoins30j: 0,
    impayes30a60j: 0,
    impayesPlus60j: 0,
    contratsExpirentBientot: 0,
    cautionsEnDepot: 0,
    cautionsARestituer: 0,
    commissionsMois: 0,
    soldeProprietairesAttente: 0
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await immobilierService.getDashboardKPIs(companyId, sectorSlug)
      setKpis(res)
    } catch (err: any) {
      console.error('[IMMO-DASHBOARD] Erreur:', err)
      toast.error('Erreur', 'Impossible de charger les indicateurs immobiliers')
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const prefix = `/app/${sectorSlug || 'immobilier'}`

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête Métier */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-purple-500/30 border border-purple-400/40 rounded-full text-xs font-bold text-purple-200 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-purple-300" /> Gestion Locative & Immobilière Pro
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {company?.name || 'Agence Immobilière'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Tableau de Bord Immobilier
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Suivi en temps réel du parc de logements, recouvrement des loyers, impayés, cautions et commissions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-white transition flex items-center gap-2 text-xs font-bold shadow-sm"
              title="Actualiser les indicateurs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-300' : ''}`} />
              <span>Actualiser</span>
            </button>
            <Link
              to={`${prefix}/quittances`}
              className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <FileCheck className="w-4 h-4" />
              <span>Encaisser un Loyer</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Rangée 1 : Indicateurs Clés de Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taux d'Occupation */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Taux d'Occupation</span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-2xl">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {loading ? '…' : `${kpis.tauxOccupation} %`}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span className="font-bold text-emerald-600">{kpis.occupes} occupés</span> / {kpis.nbBiens} logements
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Disponibles : <strong className="text-slate-700">{kpis.disponibles}</strong></span>
            <span>En travaux : <strong className="text-amber-600">{kpis.enTravaux}</strong></span>
          </div>
        </div>

        {/* Loyers du Mois en cours */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Loyers du Mois</span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {loading ? '…' : fmt(kpis.loyersEncaissesMois)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sur <strong className="text-slate-800">{fmt(kpis.loyersAttendusMois)}</strong> attendus
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Taux recouvrement :</span>
            <span className={`font-bold px-2 py-0.5 rounded-full ${
              kpis.tauxRecouvrement >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {kpis.tauxRecouvrement} %
            </span>
          </div>
        </div>

        {/* Total Impayés */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Impayés</span>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className={`text-2xl sm:text-3xl font-black font-mono ${
              kpis.totalImpayes > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {loading ? '…' : fmt(kpis.totalImpayes)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cumul des loyers et charges en retard
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>&gt; 60 jours :</span>
            <span className="font-bold text-rose-700">{fmt(kpis.impayesPlus60j)}</span>
          </div>
        </div>

        {/* Commissions de Gestion */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Commissions Agence</span>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-700 font-mono">
              {loading ? '…' : fmt(kpis.commissionsMois)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Honoraires encaissés ce mois
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Dû bailleurs :</span>
            <span className="font-bold text-slate-700">{fmt(kpis.soldeProprietairesAttente)}</span>
          </div>
        </div>
      </div>

      {/* Rangée 2 : Échéancier des Impayés par Ancienneté & Alertes Contrats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Répartition des impayés */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Analyse des Arriérés par Ancienneté</h2>
              <p className="text-xs text-slate-500">Balance âgée des créances de loyers</p>
            </div>
            <Link to={`${prefix}/clients`} className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1">
              Voir locataires <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-1">
              <span className="text-xs font-bold text-amber-800">Moins de 30 jours</span>
              <p className="text-lg font-black text-amber-900 font-mono">{fmt(kpis.impayesMoins30j)}</p>
              <span className="text-[10px] text-amber-700 block">Relance courtoise recommandée</span>
            </div>
            <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200/80 space-y-1">
              <span className="text-xs font-bold text-orange-800">30 à 60 jours</span>
              <p className="text-lg font-black text-orange-900 font-mono">{fmt(kpis.impayes30a60j)}</p>
              <span className="text-[10px] text-orange-700 block">Mise en demeure requise</span>
            </div>
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/80 space-y-1">
              <span className="text-xs font-bold text-rose-800">Plus de 60 jours</span>
              <p className="text-lg font-black text-rose-900 font-mono">{fmt(kpis.impayesPlus60j)}</p>
              <span className="text-[10px] text-rose-700 block">Procédure de résiliation</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between text-xs text-slate-700">
            <span>Dépôts de garantie & Cautions en conservation :</span>
            <strong className="font-mono text-slate-900 text-sm">{fmt(kpis.cautionsEnDepot)}</strong>
          </div>
        </div>

        {/* Alertes & Échéances prioritaires */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" /> Actions Prioritaires
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <Link
              to={`${prefix}/contrats`}
              className="p-3 bg-purple-50/70 hover:bg-purple-100 border border-purple-200 rounded-2xl flex items-center justify-between transition text-purple-900"
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-purple-600" />
                <span>Baux expirant sous 30 jours</span>
              </div>
              <span className="px-2 py-0.5 rounded-full font-bold bg-purple-200 text-purple-800">
                {kpis.contratsExpirentBientot}
              </span>
            </Link>

            <Link
              to={`${prefix}/cautions`}
              className="p-3 bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200 rounded-2xl flex items-center justify-between transition text-emerald-900"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Cautions à restituer</span>
              </div>
              <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-200 text-emerald-800 font-mono">
                {fmt(kpis.cautionsARestituer)}
              </span>
            </Link>

            <Link
              to={`${prefix}/biens`}
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-between transition text-slate-700"
            >
              <div className="flex items-center gap-2.5">
                <Home className="w-4 h-4 text-slate-500" />
                <span>Logements disponibles à louer</span>
              </div>
              <span className="px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-800">
                {kpis.disponibles}
              </span>
            </Link>

            <Link
              to={`${prefix}/maintenances`}
              className="p-3 bg-amber-50/70 hover:bg-amber-100 border border-amber-200 rounded-2xl flex items-center justify-between transition text-amber-900"
            >
              <div className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4 text-amber-600" />
                <span>Logements en travaux / rénovation</span>
              </div>
              <span className="px-2 py-0.5 rounded-full font-bold bg-amber-200 text-amber-800">
                {kpis.enTravaux}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Raccourcis Métier */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Link
          to={`${prefix}/biens`}
          className="p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl transition flex flex-col items-center text-center gap-2 shadow-xs group"
        >
          <div className="p-3 bg-purple-100 text-purple-700 rounded-xl group-hover:scale-110 transition">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Biens & Logements</span>
        </Link>

        <Link
          to={`${prefix}/proprietaires`}
          className="p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl transition flex flex-col items-center text-center gap-2 shadow-xs group"
        >
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl group-hover:scale-110 transition">
            <Users className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Propriétaires & Mandats</span>
        </Link>

        <Link
          to={`${prefix}/contrats`}
          className="p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl transition flex flex-col items-center text-center gap-2 shadow-xs group"
        >
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:scale-110 transition">
            <Key className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Contrats & Échéances</span>
        </Link>

        <Link
          to={`${prefix}/quittances`}
          className="p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl transition flex flex-col items-center text-center gap-2 shadow-xs group"
        >
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl group-hover:scale-110 transition">
            <FileCheck className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Quittances & Reçus</span>
        </Link>

        <Link
          to={`${prefix}/cautions`}
          className="p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl transition flex flex-col items-center text-center gap-2 shadow-xs group"
        >
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl group-hover:scale-110 transition">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Cautions & Dépôts</span>
        </Link>

        <Link
          to={`${prefix}/maintenances`}
          className="p-4 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-2xl transition flex flex-col items-center text-center gap-2 shadow-xs group"
        >
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl group-hover:scale-110 transition">
            <Wrench className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Travaux & Maintenance</span>
        </Link>
      </div>
    </div>
  )
}

export default ImmobilierDashboardPage
