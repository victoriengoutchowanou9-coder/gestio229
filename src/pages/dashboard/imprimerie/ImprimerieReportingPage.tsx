// =============================================================================
// GESTIO 229 SaaS — Rapports & Rentabilité Dédiés Imprimerie & Sérigraphie
// Marges Réelles, Coûts Matières Premières (Cumul & Par Matière), Filtres & Stocks
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3, TrendingUp, DollarSign, Layers, Users, Printer,
  RefreshCw, Calendar, ArrowUpRight, ArrowDownRight, Scissors,
  PieChart, CheckCircle2, AlertTriangle, ShieldCheck, Filter,
  Search, PackageCheck, AlertOctagon, Download, FileSpreadsheet,
  ArrowRight, Box
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { imprimerieService, CommandeImprimerie, PrestationImprimerie, MatierePremiere } from '../../../services/imprimerieService'
import { supabase } from '../../../lib/supabase'

export const ImprimerieReportingPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const activeSector = sectorSlug || 'imprimerie'

  const [loading, setLoading] = useState(true)
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [consommations, setConsommations] = useState<any[]>([])

  // Onglet de reporting : 'vue_globale' | 'cout_matieres'
  const [activeSubTab, setActiveSubTab] = useState<'vue_globale' | 'cout_matieres'>('cout_matieres')

  // Filtre période : 'jour' | 'semaine' | 'mois' | 'annee' | 'personnalise' | 'tout'
  const [periode, setPeriode] = useState<'jour' | 'semaine' | 'mois' | 'annee' | 'personnalise' | 'tout'>('mois')
  const [dateDebut, setDateDebut] = useState<string>('')
  const [dateFin, setDateFin] = useState<string>('')

  // Filtres Matières
  const [selectedMatiereFilter, setSelectedMatiereFilter] = useState<string>('TOUTES')
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('TOUTES')
  const [searchMatiere, setSearchMatiere] = useState<string>('')

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cmds, pres, mats, cons] = await Promise.all([
        imprimerieService.getCommandes(companyId, activeSector),
        imprimerieService.getPrestations(companyId, activeSector),
        imprimerieService.getMatieres(companyId, activeSector),
        supabase
          .from('imprimerie_consommations')
          .select('*, matiere:imprimerie_matieres(nom, code, unite, categorie, stock_actuel, stock_minimum, cout_moyen), commande:imprimerie_commandes(numero_commande, client_nom, date_commande)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
      ])
      setCommandes(cmds)
      setPrestations(pres)
      setMatieres(mats)
      setConsommations(cons.data || [])
    } catch (e) {
      console.error('Erreur chargement reporting imprimerie:', e)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Helper pour tester si une date est dans la période sélectionnée ──
  const isDateInPeriode = useCallback((dateStr?: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const now = new Date()

    if (periode === 'tout') return true

    if (periode === 'jour') {
      return d.toDateString() === now.toDateString()
    }
    if (periode === 'semaine') {
      const diff = (now.getTime() - d.getTime()) / (1000 * 3600 * 24)
      return diff >= 0 && diff <= 7
    }
    if (periode === 'mois') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }
    if (periode === 'annee') {
      return d.getFullYear() === now.getFullYear()
    }
    if (periode === 'personnalise') {
      if (dateDebut && d < new Date(dateDebut)) return false
      if (dateFin) {
        const end = new Date(dateFin)
        end.setHours(23, 59, 59, 999)
        if (d > end) return false
      }
      return true
    }
    return true
  }, [periode, dateDebut, dateFin])

  // ── Filtrer les commandes selon la période ──
  const filteredCommandes = useMemo(() => {
    return commandes.filter((c) => isDateInPeriode(c.date_commande || (c as any).created_at))
  }, [commandes, isDateInPeriode])

  // ── Filtrer les consommations selon la période et filtres matières ──
  const filteredConsommations = useMemo(() => {
    return consommations.filter((c) => {
      const matchDate = isDateInPeriode(c.created_at)
      if (!matchDate) return false

      const matNom = c.matiere?.nom || ''
      const matCode = c.matiere?.code || ''
      const matCat = c.matiere?.categorie || ''
      const matId = c.matiere_id

      if (selectedMatiereFilter !== 'TOUTES' && matId !== selectedMatiereFilter) {
        return false
      }
      if (selectedCatFilter !== 'TOUTES' && matCat !== selectedCatFilter) {
        return false
      }
      if (searchMatiere.trim()) {
        const q = searchMatiere.toLowerCase()
        const matchText = matNom.toLowerCase().includes(q) || matCode.toLowerCase().includes(q)
        if (!matchText) return false
      }
      return true
    })
  }, [consommations, isDateInPeriode, selectedMatiereFilter, selectedCatFilter, searchMatiere])

  // ── Totaux globaux financiers ──
  const caTotal = filteredCommandes.reduce((acc, c) => acc + Number(c.total_ttc || 0), 0)
  const coutRevientTotal = filteredCommandes.reduce((acc, c) => acc + Number(c.cout_revient_total || 0), 0)
  const margeBruteTotal = caTotal - coutRevientTotal
  const tauxMargeMoyen = caTotal > 0 ? (margeBruteTotal / caTotal) * 100 : 0
  const totalEncaisse = filteredCommandes.reduce((acc, c) => acc + Number(c.montant_paye || 0), 0)
  const totalCreances = filteredCommandes.reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)

  // ── ANALYSE DÉTAILLÉE : COÛTS DES MATIÈRES PREMIÈRES (CUMUL & PAR MATIÈRE) ──
  const analyseMatieres = useMemo(() => {
    const cumulCout = filteredConsommations.reduce((acc, c) => acc + Number(c.cout_total || 0), 0)
    const cumulQte = filteredConsommations.reduce((acc, c) => acc + Number(c.quantite_reelle || 0), 0)

    // Regrouper par matière
    const map: Record<string, {
      id: string
      nom: string
      code: string
      categorie: string
      unite: string
      stockActuel: number
      stockMinimum: number
      qteTotale: number
      coutTotal: number
      nbUtilisations: number
      coutUnitaireMoyen: number
      partPct: number
    }> = {}

    filteredConsommations.forEach((c) => {
      const id = c.matiere_id || 'autre'
      const nom = c.matiere?.nom || 'Matière Inconnue'
      const code = c.matiere?.code || '-'
      const categorie = c.matiere?.categorie || 'Général'
      const unite = c.matiere?.unite || 'u'
      const stockActuel = Number(c.matiere?.stock_actuel || 0)
      const stockMinimum = Number(c.matiere?.stock_minimum || 0)

      if (!map[id]) {
        map[id] = {
          id,
          nom,
          code,
          categorie,
          unite,
          stockActuel,
          stockMinimum,
          qteTotale: 0,
          coutTotal: 0,
          nbUtilisations: 0,
          coutUnitaireMoyen: 0,
          partPct: 0,
        }
      }

      map[id].qteTotale += Number(c.quantite_reelle || 0)
      map[id].coutTotal += Number(c.cout_total || 0)
      map[id].nbUtilisations += 1
    })

    const parMatiere = Object.values(map).map((item) => ({
      ...item,
      coutUnitaireMoyen: item.qteTotale > 0 ? item.coutTotal / item.qteTotale : 0,
      partPct: cumulCout > 0 ? (item.coutTotal / cumulCout) * 100 : 0,
    })).sort((a, b) => b.coutTotal - a.coutTotal)

    return {
      cumulCout,
      cumulQte,
      parMatiere,
      nbLignesConsommation: filteredConsommations.length,
      tauxMatiereSurCA: caTotal > 0 ? (cumulCout / caTotal) * 100 : 0,
      margeApresMatieres: caTotal - cumulCout,
    }
  }, [filteredConsommations, caTotal])

  // Catégories uniques de matières pour le filtre
  const categoriesMatieres = useMemo(() => {
    const cats = Array.from(new Set(matieres.map((m) => m.categorie).filter(Boolean)))
    return ['TOUTES', ...cats]
  }, [matieres])

  // 1. Rentabilité par Prestation
  const rentabiliteParPrestation = useMemo(() => {
    const map: Record<string, { nom: string; nbCommandes: number; ca: number; cout: number; marge: number; taux: number }> = {}

    filteredCommandes.forEach((cmd) => {
      cmd.lignes?.forEach((lig) => {
        const nom = lig.designation || 'Prestation'
        if (!map[nom]) {
          map[nom] = { nom, nbCommandes: 0, ca: 0, cout: 0, marge: 0, taux: 0 }
        }
        const ligCa = Number(lig.montant_ttc || 0)
        const ratio = cmd.total_ttc > 0 ? ligCa / cmd.total_ttc : 1
        const ligCout = Number(cmd.cout_revient_total || 0) * ratio
        map[nom].nbCommandes += Number(lig.quantite || 1)
        map[nom].ca += ligCa
        map[nom].cout += ligCout
        map[nom].marge += ligCa - ligCout
      })
    })

    return Object.values(map)
      .map((item) => ({
        ...item,
        taux: item.ca > 0 ? (item.marge / item.ca) * 100 : 0,
      }))
      .sort((a, b) => b.marge - a.marge)
  }, [filteredCommandes])

  // 2. Rentabilité par Client
  const rentabiliteParClient = useMemo(() => {
    const map: Record<string, { nom: string; nbCmds: number; ca: number; cout: number; marge: number; solde: number }> = {}

    filteredCommandes.forEach((cmd) => {
      const nom = cmd.client_nom || 'Client Comptoir'
      if (!map[nom]) {
        map[nom] = { nom, nbCmds: 0, ca: 0, cout: 0, marge: 0, solde: 0 }
      }
      map[nom].nbCmds += 1
      map[nom].ca += Number(cmd.total_ttc || 0)
      map[nom].cout += Number(cmd.cout_revient_total || 0)
      map[nom].marge += Number(cmd.marge_reelle || (Number(cmd.total_ttc || 0) - Number(cmd.cout_revient_total || 0)))
      map[nom].solde += Number(cmd.solde_restant || 0)
    })

    return Object.values(map).sort((a, b) => b.ca - a.ca)
  }, [filteredCommandes])

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">
      {/* ── EN-TÊTE PRINCIPAL & ONGLET DE VUE ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-pink-600" /> Rapports & Coûts des Matières Premières
          </h1>
          <p className="text-xs text-slate-500">
            Suivi des coûts cumulés, consommation exacte par matière première (BOM), rentabilité et marges réelles
          </p>
        </div>

        {/* Sous-onglets de vue */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setActiveSubTab('cout_matieres')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeSubTab === 'cout_matieres' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-4 h-4 text-purple-600" /> Coûts Matières Premières
            </button>
            <button
              onClick={() => setActiveSubTab('vue_globale')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeSubTab === 'vue_globale' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-pink-600" /> Rentabilité & Prestations
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Actualiser les données"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── BARRE DE FILTRES AVANCÉE (PÉRIODE, DATES, MATIÈRES, CATÉGORIE, RECHERCHE) ── */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Périodes Rapides */}
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-2xl text-xs font-bold text-slate-600">
            <button
              onClick={() => setPeriode('jour')}
              className={`px-3 py-1.5 rounded-xl transition ${periode === 'jour' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setPeriode('semaine')}
              className={`px-3 py-1.5 rounded-xl transition ${periode === 'semaine' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              7 jours
            </button>
            <button
              onClick={() => setPeriode('mois')}
              className={`px-3 py-1.5 rounded-xl transition ${periode === 'mois' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Ce mois
            </button>
            <button
              onClick={() => setPeriode('annee')}
              className={`px-3 py-1.5 rounded-xl transition ${periode === 'annee' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Cette année
            </button>
            <button
              onClick={() => setPeriode('personnalise')}
              className={`px-3 py-1.5 rounded-xl transition ${periode === 'personnalise' ? 'bg-white text-purple-700 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Personnalisé
            </button>
            <button
              onClick={() => setPeriode('tout')}
              className={`px-3 py-1.5 rounded-xl transition ${periode === 'tout' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Tout
            </button>
          </div>

          {/* Plage personnalisée si sélectionnée */}
          {periode === 'personnalise' && (
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-500">Du :</span>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl"
              />
              <span className="text-slate-500">Au :</span>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          )}
        </div>

        {/* Filtres spécifiques matières si sous-onglet Coûts Matières */}
        {activeSubTab === 'cout_matieres' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 text-xs">
            {/* Recherche textuelle */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher matière par nom ou code..."
                value={searchMatiere}
                onChange={(e) => setSearchMatiere(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
              />
            </div>

            {/* Filtre par Matière spécifique */}
            <select
              value={selectedMatiereFilter}
              onChange={(e) => setSelectedMatiereFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
            >
              <option value="TOUTES">Toutes les matières premières</option>
              {matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom} ({m.unite})
                </option>
              ))}
            </select>

            {/* Filtre par Catégorie */}
            <select
              value={selectedCatFilter}
              onChange={(e) => setSelectedCatFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
            >
              <option value="TOUTES">Toutes les catégories</option>
              {categoriesMatieres.filter((c) => c !== 'TOUTES').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* VUE 1 : RAPPORT DÉDIÉ COÛTS DES MATIÈRES PREMIÈRES (DEMANDE CLIENT)  */}
      {/* ===================================================================== */}
      {activeSubTab === 'cout_matieres' && (
        <div className="space-y-6">
          {/* ── KPI COÛTS MATIÈRES PREMIÈRES ── */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
            {/* KPI 1 : CUMUL COÛT MATIÈRES */}
            <div className="bg-purple-900 text-white p-4 rounded-3xl shadow-xs space-y-1">
              <div className="flex items-center justify-between text-purple-200">
                <span className="font-bold uppercase tracking-wider text-[10px]">Coût Cumulé Matières</span>
                <Box className="w-4 h-4 text-purple-300" />
              </div>
              <p className="text-2xl font-black text-white">
                {Math.round(analyseMatieres.cumulCout).toLocaleString('fr-FR')} <span className="text-xs font-normal">FCFA</span>
              </p>
              <p className="text-[11px] text-purple-200">
                Total des consommations sur la période
              </p>
            </div>

            {/* KPI 2 : QUANTITÉ TOTALE CONSOMMÉE */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[10px]">Volume Déstocké</span>
                <Scissors className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-black text-slate-900">
                {analyseMatieres.cumulQte.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400">
                {analyseMatieres.parMatiere.length} matière(s) utilisée(s)
              </p>
            </div>

            {/* KPI 3 : RATIO COÛT MATIÈRE / CHIFFRE D'AFFAIRES */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[10px]">Poids Matières sur CA</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-emerald-700">
                {analyseMatieres.tauxMatiereSurCA.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-400">
                CA Période : {Math.round(caTotal).toLocaleString('fr-FR')} FCFA
              </p>
            </div>

            {/* KPI 4 : MARGE BRUTE APRÈS MATIÈRES */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[10px]">Marge après Matières</span>
                <DollarSign className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-black text-blue-700">
                {Math.round(analyseMatieres.margeApresMatieres).toLocaleString('fr-FR')} <span className="text-xs font-normal">FCFA</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Bénéfice brut direct généré
              </p>
            </div>
          </div>

          {/* ── TABLEAU ANALYTIQUE : COÛT PAR MATIÈRE PREMIÈRE ── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Box className="w-4 h-4 text-purple-600" /> Coût & Consommation par Matière Première
                </h3>
                <p className="text-[11px] text-slate-400">
                  Cumul des dépenses matières, volume consommé et pourcentage dans le coût total
                </p>
              </div>

              <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-purple-700 rounded-full shrink-0">
                {analyseMatieres.parMatiere.length} matière(s) analysée(s)
              </span>
            </div>

            {analyseMatieres.parMatiere.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Aucune matière première consommée sur cette période ou selon les filtres sélectionnés.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Matière Première</th>
                      <th className="text-left px-4 py-3">Catégorie</th>
                      <th className="text-center px-4 py-3">Unité</th>
                      <th className="text-center px-4 py-3">Commandes</th>
                      <th className="text-right px-4 py-3">Quantité Cumulée</th>
                      <th className="text-right px-4 py-3">Coût Unitaire Moyen</th>
                      <th className="text-right px-4 py-3">Coût Total (Cumul)</th>
                      <th className="text-left px-4 py-3 w-40">Part Coût (%)</th>
                      <th className="text-center px-4 py-3">Stock Restant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyseMatieres.parMatiere.map((m) => {
                      const isStockAlerte = m.stockActuel <= m.stockMinimum
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition">
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 block">{m.nom}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{m.code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {m.categorie}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-600">
                            {m.unite}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700">
                            {m.nbUtilisations}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">
                            {m.qteTotale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {m.unite}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 font-medium">
                            {Math.round(m.coutUnitaireMoyen).toLocaleString('fr-FR')} F
                          </td>
                          <td className="px-4 py-3 text-right font-black text-purple-700 text-sm">
                            {Math.round(m.coutTotal).toLocaleString('fr-FR')} F
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span>{m.partPct.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-purple-600 h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(100, m.partPct)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                isStockAlerte
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {m.stockActuel} {m.unite} {isStockAlerte ? '⚠️ Réappro !' : '✓'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Ligne Total Cumulé */}
                  <tfoot className="bg-purple-50/70 border-t-2 border-purple-200 font-black text-slate-900">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right uppercase tracking-wider text-purple-900">
                        Total Cumulé Coûts Matières :
                      </td>
                      <td className="px-4 py-3 text-right text-purple-900">
                        {analyseMatieres.cumulQte.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">-</td>
                      <td className="px-4 py-3 text-right text-purple-950 text-sm">
                        {Math.round(analyseMatieres.cumulCout).toLocaleString('fr-FR')} FCFA
                      </td>
                      <td colSpan={2} className="px-4 py-3 text-purple-700 text-left">
                        100% des matières consommées
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── HISTORIQUE DÉTAILLÉ DES SORTIES / VENTES ── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" /> Journal Chronologique des Sorties de Matières
                </h3>
                <p className="text-[11px] text-slate-400">
                  Détail de chaque déstockage de matière lié aux commandes et ventes rapides
                </p>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {filteredConsommations.length} ligne(s)
              </span>
            </div>

            {filteredConsommations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Aucun déstockage enregistré sur cette période.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5">Date / Heure</th>
                      <th className="text-left px-4 py-2.5">Commande / Réf</th>
                      <th className="text-left px-4 py-2.5">Client</th>
                      <th className="text-left px-4 py-2.5">Matière Déstockée</th>
                      <th className="text-right px-4 py-2.5">Quantité Sortie</th>
                      <th className="text-right px-4 py-2.5">Coût Unitaire</th>
                      <th className="text-right px-4 py-2.5">Coût Total Ligne</th>
                      <th className="text-left px-4 py-2.5">Motif / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredConsommations.slice(0, 50).map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                          {c.commande?.numero_commande || 'Vente Express'}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">
                          {c.commande?.client_nom || 'Client Comptoir'}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-purple-900">
                          {c.matiere?.nom || 'Matière'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-slate-900">
                          {Number(c.quantite_reelle).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} {c.matiere?.unite}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {Number(c.cout_unitaire).toLocaleString('fr-FR')} F
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-purple-700">
                          {Math.round(Number(c.cout_total)).toLocaleString('fr-FR')} F
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">
                          {c.notes || c.motif_perte || 'Consommation normale'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 2 : RENTABILITÉ GLOBALE, PRESTATIONS & CLIENTS                     */}
      {/* ===================================================================== */}
      {activeSubTab === 'vue_globale' && (
        <div className="space-y-6">
          {/* KPI Financiers Période */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="font-bold uppercase text-slate-400">Chiffre d'Affaires</p>
              <p className="text-lg font-black text-slate-900 mt-1">{caTotal.toLocaleString('fr-FR')} F</p>
              <p className="text-[10px] text-slate-400">{filteredCommandes.length} commande(s)</p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="font-bold uppercase text-slate-400">Coûts de Revient</p>
              <p className="text-lg font-black text-rose-600 mt-1">{coutRevientTotal.toLocaleString('fr-FR')} F</p>
              <p className="text-[10px] text-slate-400">Matières + MO + ST</p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="font-bold uppercase text-slate-400">Marge Brute Réelle</p>
              <p className="text-lg font-black text-emerald-700 mt-1">{margeBruteTotal.toLocaleString('fr-FR')} F</p>
              <p className="text-[10px] text-emerald-600 font-bold">Taux : {tauxMargeMoyen.toFixed(1)}%</p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="font-bold uppercase text-slate-400">Encaissé</p>
              <p className="text-lg font-black text-blue-700 mt-1">{totalEncaisse.toLocaleString('fr-FR')} F</p>
              <p className="text-[10px] text-blue-600">Espèces / MoMo</p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="font-bold uppercase text-slate-400">Créances à Recouvrer</p>
              <p className="text-lg font-black text-amber-600 mt-1">{totalCreances.toLocaleString('fr-FR')} F</p>
              <p className="text-[10px] text-amber-600">Impayés clients</p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="font-bold uppercase text-slate-400">Coût Matières Consommées</p>
              <p className="text-lg font-black text-purple-700 mt-1">{Math.round(analyseMatieres.cumulCout).toLocaleString('fr-FR')} F</p>
              <p className="text-[10px] text-purple-600">{analyseMatieres.tauxMatiereSurCA.toFixed(1)}% du CA</p>
            </div>
          </div>

          {/* Tableau 1 : Rentabilité par Prestation */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Printer className="w-4 h-4 text-pink-600" /> Rentabilité par Prestation & Travail Réalisé
                </h3>
                <p className="text-[11px] text-slate-400">Classement des prestations qui génèrent le plus de bénéfice réel</p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full">
                {rentabiliteParPrestation.length} Prestations vendues
              </span>
            </div>

            {rentabiliteParPrestation.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">Aucune vente sur cette période.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3">Prestation</th>
                    <th className="text-center px-4 py-3">Volume Produit</th>
                    <th className="text-right px-4 py-3">CA Généré</th>
                    <th className="text-right px-4 py-3">Coût de Revient Réel</th>
                    <th className="text-right px-4 py-3">Marge Brute</th>
                    <th className="text-center px-4 py-3">Taux de Marge</th>
                    <th className="text-center px-4 py-3">Statut Rentabilité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentabiliteParPrestation.map((p, idx) => {
                    const isLoss = p.marge < 0
                    const isVeryGood = p.taux >= 40
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-bold text-slate-900">{p.nom}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-600">{p.nbCommandes}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{Math.round(p.ca).toLocaleString('fr-FR')} F</td>
                        <td className="px-4 py-3 text-right text-rose-600 font-medium">{Math.round(p.cout).toLocaleString('fr-FR')} F</td>
                        <td className="px-4 py-3 text-right font-black">
                          <span className={isLoss ? 'text-rose-600' : 'text-emerald-700'}>
                            {Math.round(p.marge).toLocaleString('fr-FR')} F
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                            isLoss
                              ? 'bg-rose-100 text-rose-800'
                              : isVeryGood
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {p.taux.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLoss ? (
                            <span className="text-rose-600 font-bold text-[10px] flex items-center justify-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Déficitaire
                            </span>
                          ) : isVeryGood ? (
                            <span className="text-emerald-700 font-bold text-[10px]">Très Rentable ✓</span>
                          ) : (
                            <span className="text-amber-700 font-bold text-[10px]">Rentable</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Tableau 2 : Rentabilité par Client */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" /> Top Clients par CA & Marge Réalisée
                </h3>
                <p className="text-[11px] text-slate-400">Clients qui génèrent le plus de valeur et suivi des encours</p>
              </div>
            </div>

            {rentabiliteParClient.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">Aucun client sur cette période.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3">Client</th>
                    <th className="text-center px-4 py-3">Commandes</th>
                    <th className="text-right px-4 py-3">CA Total</th>
                    <th className="text-right px-4 py-3">Coût de Revient</th>
                    <th className="text-right px-4 py-3">Marge Dégagée</th>
                    <th className="text-right px-4 py-3">Solde Dû (Créance)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentabiliteParClient.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-bold text-slate-900">{c.nom}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-700">{c.nbCmds}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{Math.round(c.ca).toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-3 text-right text-rose-600">{Math.round(c.cout).toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">{Math.round(c.marge).toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-3 text-right font-bold">
                        <span className={c.solde > 0 ? 'text-amber-600' : 'text-slate-400'}>
                          {c.solde > 0 ? `${Math.round(c.solde).toLocaleString('fr-FR')} F` : '0 F ✓'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ImprimerieReportingPage
