import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  UtensilsCrossed, TrendingUp, Users, DollarSign, Clock, ChefHat,
  Wine, CheckCircle2, AlertTriangle, ArrowUpRight, Flame, Scale,
  Layers, ShoppingBag, RefreshCw, ChevronRight, Award, Trash2
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const RestaurantDashboardPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<any[]>([])
  const [commandes, setCommandes] = useState<any[]>([])
  const [kdsLignes, setKdsLignes] = useState<any[]>([])
  const [pertes, setPertes] = useState<any[]>([])
  const [serveurs, setServeurs] = useState<any[]>([])
  const [sessionsServeurs, setSessionsServeurs] = useState<any[]>([])
  const [fiches, setFiches] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [destockLog, setDestockLog] = useState<any[]>([])

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [tabRes, cmdRes, kdsRes, prtRes, srvRes, fchRes, sessRes, expRes, dstRes] = await Promise.all([
        supabaseTenant('restaurant_tables').select('*'),
        supabaseTenant('restaurant_commandes').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseTenant('restaurant_commande_lignes').select('*').neq('statut_preparation', 'SERVI').limit(20),
        supabaseTenant('restaurant_pertes_gaspillage').select('*').order('date_constat', { ascending: false }).limit(10),
        supabaseTenant('restaurant_serveurs').select('*').order('total_ventes', { ascending: false }),
        supabaseTenant('restaurant_fiches_techniques').select('*'),
        supabaseTenant('restaurant_sessions_serveurs').select('*').order('created_at', { ascending: false }).limit(20),
        supabaseTenant('expenses').select('*').limit(100),
        supabaseTenant('restaurant_destockage_log').select('*').limit(200)
      ])

      setTables(tabRes.data || [])
      setCommandes(cmdRes.data || [])
      setKdsLignes(kdsRes.data || [])
      setPertes(prtRes.data || [])
      setServeurs(srvRes.data || [])
      setFiches(fchRes.data || [])
      setSessionsServeurs(sessRes.data || [])
      setExpenses(expRes.data || [])
      setDestockLog(dstRes.data || [])
    } catch (err: any) {
      console.error('[RestaurantDashboard] Erreur chargement:', err.message)
      setTables([])
      setCommandes([])
      setKdsLignes([])
      setPertes([])
      setServeurs([])
      setFiches([])
      setSessionsServeurs([])
      setExpenses([])
      setDestockLog([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const kpis = useMemo(() => {
    const totalTables = tables.length
    const occupTables = tables.filter(t => t.statut === 'OCCUPEE').length
    const txOccupation = totalTables > 0 ? Math.round((occupTables / totalTables) * 100) : 0

    // CA en cours sur les tables actives
    const caEnCours = tables.reduce((acc, t) => acc + (Number(t.montant_actuel) || 0), 0)

    // CA clôturé
    const caCloture = commandes
      .filter(c => c.statut === 'CLOTUREE' || c.statut_paiement === 'SOLDE')
      .reduce((acc, c) => acc + (Number(c.total_ttc) || 0), 0)

    const totalCA = caCloture + caEnCours
    const nbCommandes = commandes.length
    const panierMoyen = nbCommandes > 0 ? Math.round(totalCA / nbCommandes) : 0
    const totalPertes = pertes.reduce((acc, p) => acc + (Number(p.valeur_estimee) || 0), 0)

    // Calculs Food Cost réels issus des fiches techniques
    const totalCoutMatiere = fiches.reduce((acc, f) => acc + (Number(f.cout_matiere_ligne) || 0), 0)
    const nbPlats = new Set(fiches.map(f => f.plat_nom)).size
    const coutMoyenPortion = nbPlats > 0 ? Math.round(totalCoutMatiere / nbPlats) : 0

    const margeGlobalePct = totalCA > 0
      ? Math.max(0, Math.round(((totalCA - totalPertes) / totalCA) * 100))
      : 0

    const totalSoldeServeuses = sessionsServeurs
      .filter(s => s.statut === 'OUVERTE')
      .reduce((acc, s) => acc + (Number(s.solde_restant_a_remettre) || 0), 0)

    const totalBoissonsConfiees = sessionsServeurs
      .filter(s => s.statut === 'OUVERTE')
      .reduce((acc, s) => acc + (Number(s.total_boissons_confiees_ttc) || 0), 0)

    return {
      totalCA,
      nbCommandes,
      panierMoyen,
      totalTables,
      occupTables,
      txOccupation,
      caEnCours,
      totalPertes,
      coutMoyenPortion,
      margeGlobalePct,
      nbPlatsConfigures: nbPlats,
      totalSoldeServeuses,
      totalBoissonsConfiees
    }
  }, [tables, commandes, pertes, fiches, sessionsServeurs])

  // Compte d'Exploitation Analytique Bar vs Cuisine (Exigence Pages 12-14)
  const rentabilite = useMemo(() => {
    let caBar = 0
    let caCuisine = 0

    commandes.forEach(c => {
      const circuit = c.circuit || 'BAR'
      const total = Number(c.total_ttc) || 0
      if (circuit === 'CUISINE') {
        caCuisine += total
      } else {
        caBar += total
      }
    })

    const coutCuisine = destockLog.reduce((acc: number, d: any) => acc + (Number(d.total_cout) || 0), 0)
    const coutBar = Math.round(caBar * 0.55) // Estimation rigoureuse basée sur coef brasserie moyen

    const margeBruteBar = Math.max(0, caBar - coutBar)
    const margeBruteCuisine = Math.max(0, caCuisine - coutCuisine)
    const margeBruteTotale = margeBruteBar + margeBruteCuisine

    let depensesBar = 0
    let depensesCuisine = 0

    expenses.forEach((e: any) => {
      const montant = Number(e.amount) || 0
      const notes = (e.notes || '').toUpperCase()
      if (notes.includes('[SECTEUR:BAR]')) {
        depensesBar += montant
      } else if (notes.includes('[SECTEUR:CUISINE]')) {
        depensesCuisine += montant
      } else if (notes.includes('[SECTEUR:COMMUN')) {
        const match = notes.match(/\[SECTEUR:COMMUN:(\d+)\/(\d+)\]/)
        const pctB = match ? Number(match[1]) : 50
        const pctC = match ? Number(match[2]) : 50
        depensesBar += Math.round(montant * pctB / 100)
        depensesCuisine += Math.round(montant * pctC / 100)
      } else {
        depensesBar += Math.round(montant * 0.5)
        depensesCuisine += Math.round(montant * 0.5)
      }
    })

    const netBar = margeBruteBar - depensesBar
    const netCuisine = margeBruteCuisine - depensesCuisine
    const netTotal = netBar + netCuisine

    return {
      caBar,
      caCuisine,
      caTotal: caBar + caCuisine,
      coutBar,
      coutCuisine,
      coutTotal: coutBar + coutCuisine,
      margeBruteBar,
      margeBruteCuisine,
      margeBruteTotale,
      margeBruteBarPct: caBar > 0 ? Math.round((margeBruteBar / caBar) * 100) : 0,
      margeBruteCuisinePct: caCuisine > 0 ? Math.round((margeBruteCuisine / caCuisine) * 100) : 0,
      depensesBar,
      depensesCuisine,
      depensesTotal: depensesBar + depensesCuisine,
      netBar,
      netCuisine,
      netTotal,
      netBarPct: caBar > 0 ? Math.round((netBar / caBar) * 100) : 0,
      netCuisinePct: caCuisine > 0 ? Math.round((netCuisine / caCuisine) * 100) : 0
    }
  }, [commandes, destockLog, expenses])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-rose-900/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-rose-500/20 text-rose-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-rose-500/30 uppercase tracking-wider">
              Pilotage CHR • Bar, Restaurant & Maquis
            </span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-rose-400" />
            Tableau de Bord Exploitation
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Vision en temps réel du service : additions en cours, occupation de salle, tickets cuisine et rentabilité
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition"
            title="Rafraîchir les données"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <Link
            to={`/app/${sectorSlug}/stocks`}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <span>📦</span> Stocks Bar & Cuisine
          </Link>
          <Link
            to={`/app/${sectorSlug}/recettes`}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <span>📖</span> Fiches Recettes
          </Link>
          <Link
            to={`/app/${sectorSlug}/tables`}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-600/30 transition flex items-center gap-2"
          >
            Plan de Salle →
          </Link>
        </div>
      </div>

      {/* Cartes KPI Principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* CA Global */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">CA Réalisé (Aujourd'hui)</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">{fmt(kpis.totalCA)}</p>
          <p className="text-[11px] text-emerald-600 font-bold mt-1">
            Dont {fmt(kpis.caEnCours)} sur tables en cours
          </p>
        </div>

        {/* Taux Occupation Salle */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Occupation des Tables</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-indigo-700 font-mono">{kpis.occupTables} / {kpis.totalTables}</p>
            <span className="text-xs font-bold text-slate-500">({kpis.txOccupation}%)</span>
          </div>
          {/* Barre progression visuelle */}
          <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                kpis.txOccupation >= 80 ? 'bg-rose-500' : kpis.txOccupation >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${kpis.txOccupation}%` }}
            />
          </div>
        </div>

        {/* Panier Moyen */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Panier Moyen / Addition</span>
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono">{fmt(kpis.panierMoyen)}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Sur {kpis.nbCommandes} commandes enregistrées
          </p>
        </div>

        {/* Pertes & Casses */}
        <div className="bg-rose-50/60 p-5 rounded-3xl border border-rose-200/80 shadow-sm">
          <div className="flex items-center justify-between text-rose-800 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pertes & Casses (Jour)</span>
            <Trash2 className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono">{fmt(kpis.totalPertes)}</p>
          <p className="text-[11px] text-rose-700 font-semibold mt-1">
            Verres brisés & offerts contrôlés
          </p>
        </div>
      </div>

      {/* Ratios Restauration Réels & Suivi des Comptes Serveuses */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Coût Matière / Portion</span>
            <p className="text-2xl font-black text-orange-600 font-mono mt-0.5">
              {kpis.coutMoyenPortion > 0 ? fmt(kpis.coutMoyenPortion) : '0 FCFA'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {kpis.nbPlatsConfigures > 0 ? `${kpis.nbPlatsConfigures} recette(s) configurée(s)` : 'Dans Fiches & Recettes'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Flame className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Boissons Confiées Bar</span>
            <p className="text-2xl font-black text-indigo-600 font-mono mt-0.5">{fmt(kpis.totalBoissonsConfiees)}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Valeur totale confiée aux serveuses
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Wine className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Solde Dû par Serveuses</span>
            <p className={clsx('text-2xl font-black font-mono mt-0.5', kpis.totalSoldeServeuses > 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {fmt(kpis.totalSoldeServeuses)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Versements restant à remettre au gérant
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marge Brute Réalisée</span>
            <p className="text-2xl font-black text-emerald-600 font-mono mt-0.5">{kpis.margeGlobalePct} %</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Calculée sur le CA réel et pertes
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Grille Double : Tables Actives + KDS Direct */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche : Aperçu Rapide des Tables Occupées */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-rose-600" />
              Tables Occupées & Additions en cours
            </h3>
            <Link to={`/app/${sectorSlug}/tables`} className="text-xs font-bold text-rose-600 hover:underline">
              Voir tout le plan →
            </Link>
          </div>

          {tables.filter(t => t.statut === 'OCCUPEE').length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-2xl">
              Toutes les tables sont actuellement libres.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tables.filter(t => t.statut === 'OCCUPEE').map(t => (
                <div key={t.id} className="p-4 rounded-2xl border border-rose-200/80 bg-rose-50/30 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-xs text-rose-900 bg-rose-200 px-2 py-0.5 rounded-lg">
                        {t.numero_table}
                      </span>
                      <span className="font-black text-xs text-slate-900">{t.nom || t.numero_table}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{t.zone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-bold uppercase">Note</p>
                    <p className="text-sm font-black font-mono text-rose-600">
                      {fmt(Number(t.montant_actuel) || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colonne Droite : Commandes en attente Cuisine & Bar */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-orange-600" />
              Direct Cuisine & Bar (KDS)
            </h3>
            <Link to={`/app/${sectorSlug}/cuisine-bar`} className="text-xs font-bold text-orange-600 hover:underline">
              Ouvrir l'écran KDS →
            </Link>
          </div>

          <div className="space-y-2.5">
            {kdsLignes.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-2xl">
                Aucun plat en cours de préparation.
              </p>
            ) : (
              kdsLignes.slice(0, 5).map(it => (
                <div key={it.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-800 font-mono font-bold text-xs flex items-center justify-center">
                      {it.quantite}x
                    </span>
                    <div>
                      <p className="font-bold text-xs text-slate-900">{it.designation}</p>
                      <p className="text-[10px] text-slate-400">Table {it.table_numero || '-'} • {it.destination}</p>
                    </div>
                  </div>
                  <span className={clsx(
                    'text-[10px] font-black px-2 py-0.5 rounded-full',
                    it.statut_preparation === 'PRET' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  )}>
                    {it.statut_preparation}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Compte d'Exploitation Analytique Bar vs Cuisine & Maquis */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="font-black text-slate-900 text-base">
                📊 Compte d'Exploitation Analytique — Bar vs Cuisine & Maquis
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ventilation stricte et indépendante du Chiffre d'Affaires, du Déstockage matières premières / boissons et des charges d'exploitation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
              Règle : Stock Boissons ≠ Stock Matières Cuisine
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase font-black text-[10px] tracking-wider">
                <th className="py-3 px-4">Poste Analytique</th>
                <th className="py-3 px-4 text-right">🍷 Bar (Boissons)</th>
                <th className="py-3 px-4 text-right">🍳 Cuisine (Plats & Maquis)</th>
                <th className="py-3 px-4 text-right font-black text-slate-900">Total Établissement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {/* 1. CA */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  1. Chiffre d'Affaires Réalisé (CA Ventes)
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                  {fmt(rentabilite.caBar)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                  {fmt(rentabilite.caCuisine)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-black text-slate-900 bg-slate-50/70">
                  {fmt(rentabilite.caTotal)}
                </td>
              </tr>

              {/* 2. Coût Matières / Boissons */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="py-3 px-4 font-bold text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  2. Coût d'Achat des Ventes / Déstockage Matières
                </td>
                <td className="py-3 px-4 text-right font-mono text-rose-600">
                  - {fmt(rentabilite.coutBar)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-rose-600">
                  - {fmt(rentabilite.coutCuisine)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-black text-rose-700 bg-slate-50/70">
                  - {fmt(rentabilite.coutTotal)}
                </td>
              </tr>

              {/* 3. Marge Brute */}
              <tr className="bg-emerald-50/40 font-bold border-y-2 border-emerald-100">
                <td className="py-3.5 px-4 text-emerald-950 font-black flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  3. Marge Brute d'Exploitation
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-700">
                  {fmt(rentabilite.margeBruteBar)}
                  <span className="block text-[10px] text-emerald-600 font-bold">
                    {rentabilite.margeBruteBarPct}% du CA
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-700">
                  {fmt(rentabilite.margeBruteCuisine)}
                  <span className="block text-[10px] text-emerald-600 font-bold">
                    {rentabilite.margeBruteCuisinePct}% du CA
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-900 bg-emerald-100/50">
                  {fmt(rentabilite.margeBruteTotale)}
                  <span className="block text-[10px] text-emerald-800 font-black">
                    {rentabilite.caTotal > 0 ? Math.round((rentabilite.margeBruteTotale / rentabilite.caTotal) * 100) : 0}% du CA
                  </span>
                </td>
              </tr>

              {/* 4. Charges d'exploitation */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="py-3 px-4 font-bold text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  4. Charges d'Exploitation Ventilées (Énergie, Gaz, Charbon, Dépenses)
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-700">
                  - {fmt(rentabilite.depensesBar)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-700">
                  - {fmt(rentabilite.depensesCuisine)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-black text-amber-800 bg-slate-50/70">
                  - {fmt(rentabilite.depensesTotal)}
                </td>
              </tr>

              {/* 5. Résultat Net */}
              <tr className="bg-slate-900 text-white font-black">
                <td className="py-4 px-4 text-xs font-black uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  5. Résultat Net d'Exploitation Estimé
                </td>
                <td className={clsx("py-4 px-4 text-right font-mono text-sm", rentabilite.netBar >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {fmt(rentabilite.netBar)}
                  <span className="block text-[10px] text-slate-300 font-normal">
                    {rentabilite.netBarPct}% rentabilité
                  </span>
                </td>
                <td className={clsx("py-4 px-4 text-right font-mono text-sm", rentabilite.netCuisine >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {fmt(rentabilite.netCuisine)}
                  <span className="block text-[10px] text-slate-300 font-normal">
                    {rentabilite.netCuisinePct}% rentabilité
                  </span>
                </td>
                <td className={clsx("py-4 px-4 text-right font-mono text-sm font-black bg-slate-950", rentabilite.netTotal >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {fmt(rentabilite.netTotal)}
                  <span className="block text-[10px] text-emerald-400 font-bold">
                    {rentabilite.caTotal > 0 ? Math.round((rentabilite.netTotal / rentabilite.caTotal) * 100) : 0}% global
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default RestaurantDashboardPage
