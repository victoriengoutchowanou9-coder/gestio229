import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Landmark, Users, Wallet, CreditCard, AlertTriangle, ArrowUpRight,
  ArrowDownRight, RefreshCw, Plus, Clock, CheckCircle2, ShieldCheck,
  TrendingUp, FileText, UserCheck, ShieldAlert, DollarSign, Calendar
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const MicrofinanceDashboardPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [membres, setMembres] = useState<any[]>([])
  const [comptes, setComptes] = useState<any[]>([])
  const [credits, setCredits] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [collectes, setCollectes] = useState<any[]>([])
  const [tontines, setTontines] = useState<any[]>([])
  const [alertes, setAlertes] = useState<any[]>([])
  const [tresoComptes, setTresoComptes] = useState<any[]>([])

  const loadDashboardData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [
        mbrRes,
        cptRes,
        crdRes,
        agtRes,
        colRes,
        tntRes,
        altRes,
        trsRes
      ] = await Promise.all([
        supabaseTenant('microfinance_membres').select('*'),
        supabaseTenant('microfinance_comptes_epargne').select('*'),
        supabaseTenant('microfinance_credits').select('*'),
        supabaseTenant('microfinance_agents').select('*'),
        supabaseTenant('microfinance_collectes_terrain').select('*').order('date_collecte', { ascending: false }).limit(20),
        supabaseTenant('tontine_groupes').select('*'),
        supabaseTenant('microfinance_conformite_alertes').select('*').eq('statut', 'OUVERTE').limit(10),
        supabaseTenant('microfinance_tresorerie_comptes').select('*')
      ])

      setMembres(mbrRes.data || [])
      setComptes(cptRes.data || [])
      setCredits(crdRes.data || [])
      setAgents(agtRes.data || [])
      setCollectes(colRes.data || [])
      setTontines(tntRes.data || [])
      setAlertes(altRes.data || [])
      setTresoComptes(trsRes.data || [])
    } catch (err: any) {
      console.error('[MicrofinanceDashboard] Erreur chargement:', err.message)
      setMembres([])
      setComptes([])
      setCredits([])
      setAgents([])
      setCollectes([])
      setTontines([])
      setAlertes([])
      setTresoComptes([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const kpis = useMemo(() => {
    const totalMembres = membres.length
    const membresActifs = membres.filter(m => m.statut === 'ACTIF').length

    // Épargne totale
    const totalEpargne = comptes.reduce((sum, c) => sum + (Number(c.solde) || 0), 0)

    // Crédits
    const encoursCredits = credits
      .filter(c => c.statut === 'EN_COURS' || c.statut === 'DECAISSE' || c.statut === 'EN_RETARD')
      .reduce((sum, c) => sum + (Number(c.solde_restant) || 0), 0)

    const creditsEnRetard = credits.filter(c => c.statut === 'EN_RETARD' || c.statut === 'CONTENTIEUX')
    const encoursRetard = creditsEnRetard.reduce((sum, c) => sum + (Number(c.solde_restant) || 0), 0)

    // PAR (Portefeuille à Risque)
    const parPct = encoursCredits > 0 ? ((encoursRetard / encoursCredits) * 100).toFixed(1) : '0'

    // Agents & Collectes
    const soldeAgentsDetenu = agents.reduce((sum, a) => sum + (Number(a.solde_especes_detenu) || 0), 0)

    const aujourdhuiStr = new Date().toISOString().slice(0, 10)
    const collecteJour = collectes
      .filter(c => String(c.date_collecte).slice(0, 10) === aujourdhuiStr)
      .reduce((sum, c) => sum + (Number(c.montant) || 0), 0)

    // Trésorerie globale multi-canaux
    const totalTresorerie = tresoComptes.reduce((sum, c) => sum + (Number(c.solde_actuel) || 0), 0)

    return {
      totalMembres,
      membresActifs,
      totalEpargne,
      encoursCredits,
      encoursRetard,
      parPct,
      soldeAgentsDetenu,
      collecteJour,
      totalTresorerie,
      nbGroupesTontine: tontines.length,
      nbAlertesOuvertes: alertes.length
    }
  }, [membres, comptes, credits, agents, collectes, tontines, alertes, tresoComptes])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête Institution */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-indigo-900/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-indigo-500/30 uppercase tracking-wider">
              IMF • UEMOA & Loi 2025-14 Bénin
            </span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2.5">
            <Landmark className="w-6 h-6 text-indigo-400" />
            Tableau de Bord Microfinance & Tontine
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Supervision globale : épargne mobilisée, portefeuille de crédit sain vs PAR, collecteurs terrain et trésorerie
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl transition text-white"
            title="Rafraîchir"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <Link
            to={`/app/${sectorSlug}/membres`}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition"
          >
            <Plus className="w-4 h-4" /> Nouveau Membre
          </Link>
        </div>
      </div>

      {/* Cartes KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Encours de Crédit */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Encours Prêts Actifs</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">{fmt(kpis.encoursCredits)}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Portefeuille actif octroyé
          </p>
        </div>

        {/* Épargne Totale */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Épargne Mobilisée</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 font-mono">{fmt(kpis.totalEpargne)}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Dépôts adhérents & tontines
          </p>
        </div>

        {/* Portefeuille à Risque (PAR) */}
        <div className={clsx(
          'p-5 rounded-3xl border shadow-sm flex flex-col justify-between',
          Number(kpis.parPct) > 5 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200'
        )}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Portefeuille à Risque (PAR)</span>
            <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center', Number(kpis.parPct) > 5 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600')}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={clsx('text-2xl font-black font-mono', Number(kpis.parPct) > 5 ? 'text-rose-600' : 'text-slate-900')}>
              {kpis.parPct} %
            </p>
            <span className="text-xs font-mono text-slate-400">({fmt(kpis.encoursRetard)})</span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Norme prudentielle UEMOA : ≤ 5%
          </p>
        </div>

        {/* Membres / Adhérents */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Adhérents & Clients</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-700 font-mono">{kpis.membresActifs}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            {kpis.totalMembres} membre(s) répertorié(s)
          </p>
        </div>
      </div>

      {/* Collecte Terrain, Espèces Agents & Tontines */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Collecte du Jour */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Collecte Terrain (Aujourd'hui)</span>
            <p className="text-2xl font-black text-indigo-600 font-mono mt-0.5">{fmt(kpis.collecteJour)}</p>
            <p className="text-[11px] text-slate-500 mt-1">Épargne, tontines et crédits collectés</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Espèces Détenues par les Agents */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fonds Détenus par les Agents</span>
            <p className="text-2xl font-black text-amber-600 font-mono mt-0.5">{fmt(kpis.soldeAgentsDetenu)}</p>
            <p className="text-[11px] text-slate-500 mt-1">À reverser en caisse avant clôture</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Groupes de Tontine */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Groupes de Tontine Actifs</span>
            <p className="text-2xl font-black text-slate-900 font-mono mt-0.5">{kpis.nbGroupesTontine}</p>
            <p className="text-[11px] text-slate-500 mt-1">Cotisations périodiques en cours</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Raccourcis Actions Rapides Métier */}
      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-indigo-600" /> Actions Rapides :
        </span>
        <Link
          to={`/app/${sectorSlug}/membres`}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition shadow-sm"
        >
          👥 Fiche Membre & Épargne
        </Link>
        <Link
          to={`/app/${sectorSlug}/credits`}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition shadow-sm"
        >
          💳 Nouvelle Demande de Prêt
        </Link>
        <Link
          to={`/app/${sectorSlug}/tontine`}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition shadow-sm"
        >
          🔄 Gestion des Tontines
        </Link>
        <Link
          to={`/app/${sectorSlug}/agents`}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition shadow-sm"
        >
          🏃 Saisie Collecte & Reversements
        </Link>
        <Link
          to={`/app/${sectorSlug}/conformite`}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition shadow-sm"
        >
          🛡️ Alertes & Conformité LBC/FT
        </Link>
        <Link
          to={`/app/${sectorSlug}/tresorerie`}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition shadow-sm"
        >
          🏦 Trésorerie Multi-Canaux & Recettes SFD
        </Link>
      </div>

      {/* Deux Colonnes : Dernières Collectes Terrain & Alertes Conformité */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche : Dernières Collectes Terrain */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              Dernières Collectes Terrain Enregistrées
            </h3>
            <Link to={`/app/${sectorSlug}/agents`} className="text-xs font-bold text-indigo-600 hover:underline">
              Voir tous les agents →
            </Link>
          </div>

          {collectes.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="font-bold text-sm text-slate-600">Aucune collecte enregistrée aujourd'hui</p>
              <p className="text-xs text-slate-400 mt-1">Les collectes terrain de vos agents apparaîtront ici en temps réel.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {collectes.slice(0, 6).map((col) => (
                <div key={col.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                      {col.type_collecte === 'EPARGNE' ? 'EP' : col.type_collecte === 'TONTINE' ? 'TNT' : 'CRD'}
                    </span>
                    <div>
                      <p className="font-black text-xs text-slate-900">{col.membre_nom}</p>
                      <p className="text-[10px] text-slate-400">Agent : {col.agent_nom} • Ref: {col.reference}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-black text-xs text-emerald-600">{fmt(Number(col.montant))}</p>
                    <span className={clsx(
                      'text-[9px] font-bold px-2 py-0.5 rounded-full',
                      col.statut_reversement === 'REVERSE_VALIDE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    )}>
                      {col.statut_reversement === 'REVERSE_VALIDE' ? 'Reversé en caisse' : 'Détenu par agent'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colonne Droite : Surveillance & Conformité LBC/FT */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Alertes Conformité & Surveillance LBC/FT
            </h3>
            <Link to={`/app/${sectorSlug}/conformite`} className="text-xs font-bold text-rose-600 hover:underline">
              Centre de contrôle →
            </Link>
          </div>

          {alertes.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-sm text-slate-700">Aucune alerte critique ouverte</p>
              <p className="text-xs text-slate-400 mt-0.5">Le portefeuille respecte les seuils prudentiels configurés.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alertes.slice(0, 5).map((alt) => (
                <div key={alt.id} className="p-3 rounded-2xl border border-rose-100 bg-rose-50/40 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-black text-xs text-slate-900 truncate">{alt.type_alerte.replace(/_/g, ' ')}</p>
                      <span className="text-[9px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                        {alt.gravite}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{alt.description}</p>
                    {alt.entite_nom && (
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold">Cible : {alt.entite_nom}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MicrofinanceDashboardPage
