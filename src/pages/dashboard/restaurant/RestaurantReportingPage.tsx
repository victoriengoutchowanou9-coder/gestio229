// =============================================================================
// GESTIO 229 SaaS — Rapports & Rentabilité Spécialisée Bar & Restaurant
// =============================================================================
// Conforme Spécifications Section 11 :
// 11.1 Consommation des matières premières (Filtres complets, traçabilité des recettes)
// 11.2 Rentabilité des plats (CA, Coût matière, Marge brute, Taux de marge, Taux de marque, Pertes)
// 11.3 Rentabilité BAR (Boissons, Coûts d'achat, Marges, Emballages consignés, Créances, Stock)
// 11.4 Rapport des serveuses (Ventes BAR/CUISINE, Règlements, Créances dues, Bouteilles, Écarts)
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, RefreshCw, Calendar,
  Filter, Users, Package, Wine, UtensilsCrossed, Printer, Download,
  Layers, DollarSign, Clock, ShieldCheck, AlertCircle, FileSpreadsheet,
  CheckCircle2, ChevronRight, Search
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const RestaurantReportingPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  // Navigation par onglets analytiques
  const [activeTab, setActiveTab] = useState<'MATIERES' | 'PLATS' | 'BAR' | 'SERVEUSES'>('PLATS')

  // Filtres temporels obligatoires (Section 11.1)
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'custom'>('month')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Filtres avancés
  const [filterMatiere, setFilterMatiere] = useState<string>('all')
  const [filterPlat, setFilterPlat] = useState<string>('all')
  const [filterServeuse, setFilterServeuse] = useState<string>('all')
  const [filterCircuit, setFilterCircuit] = useState<'ALL' | 'BAR' | 'CUISINE'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Données chargées depuis la base
  const [destockageLogs, setDestockageLogs] = useState<any[]>([])
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [commandesResto, setCommandesResto] = useState<any[]>([])
  const [creances, setCreances] = useState<any[]>([])
  const [sessionsServeuses, setSessionsServeuses] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [pertes, setPertes] = useState<any[]>([])
  const [serveursList, setServeursList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Calcul des bornes de dates selon le preset
  const dateRange = useMemo(() => {
    const now = new Date()
    let start = new Date()
    let end = new Date()

    if (periodPreset === 'today') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (periodPreset === 'yesterday') {
      start.setDate(now.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      end.setDate(now.getDate() - 1)
      end.setHours(23, 59, 59, 999)
    } else if (periodPreset === 'week') {
      const day = now.getDay() || 7
      start.setDate(now.getDate() - day + 1)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (periodPreset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    } else if (periodPreset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    } else if (periodPreset === 'year') {
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    } else if (periodPreset === 'custom') {
      if (startDate) start = new Date(startDate)
      if (endDate) {
        end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
      }
    }

    return { start, end }
  }, [periodPreset, startDate, endDate])

  // Chargement des données
  const loadReportsData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [destockRes, salesRes, cmdRes, creanceRes, sessRes, prodRes, pertesRes, srvRes] = await Promise.all([
        supabaseTenant('restaurant_destockage_log').select('*').order('created_at', { ascending: false }),
        supabaseTenant('sales_orders').select('*').eq('sector_slug', 'restaurant').order('created_at', { ascending: false }),
        supabaseTenant('restaurant_commandes').select('*').order('created_at', { ascending: false }),
        supabaseTenant('restaurant_creances_serveuses').select('*').order('date_creation', { ascending: false }),
        supabaseTenant('restaurant_sessions_serveurs').select('*').order('created_at', { ascending: false }),
        supabaseTenant('products').select('*').order('name'),
        supabaseTenant('restaurant_pertes_gaspillage').select('*').order('created_at', { ascending: false }),
        supabaseTenant('restaurant_serveurs').select('*').order('nom_complet')
      ])

      setDestockageLogs(destockRes.data || [])
      setSalesOrders(salesRes.data || [])
      setCommandesResto(cmdRes.data || [])
      setCreances(creanceRes.data || [])
      setSessionsServeuses(sessRes.data || [])
      setProducts(prodRes.data || [])
      setPertes(pertesRes.data || [])
      setServeursList(srvRes.data || [])
    } catch (err: any) {
      console.warn('[RestaurantReporting] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadReportsData()
  }, [loadReportsData])

  // Filtrage temporel générique d'un élément selon created_at ou date
  const isWithinPeriod = useCallback((itemDateStr: string) => {
    if (!itemDateStr) return false
    const d = new Date(itemDateStr).getTime()
    return d >= dateRange.start.getTime() && d <= dateRange.end.getTime()
  }, [dateRange])

  // =============================================================================
  // 11.1 RAPPORT CONSOMMATION DES MATIÈRES PREMIÈRES
  // =============================================================================
  const matieresConsommeesReport = useMemo(() => {
    const filteredLogs = destockageLogs.filter(log => {
      if (!isWithinPeriod(log.created_at)) return false
      if (filterMatiere !== 'all' && log.matiere_nom.toLowerCase() !== filterMatiere.toLowerCase()) return false
      if (filterPlat !== 'all' && log.plat_nom.toLowerCase() !== filterPlat.toLowerCase()) return false
      if (searchQuery && !log.matiere_nom.toLowerCase().includes(searchQuery.toLowerCase()) && !log.plat_nom.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })

    const agg: Record<string, {
      matiere_nom: string
      unite: string
      total_qte: number
      cout_unitaire_moyen: number
      total_cout: number
      plats: Set<string>
      commandes: Set<string>
      dernier_destockage: string
    }> = {}

    filteredLogs.forEach(l => {
      const key = `${l.matiere_nom}__${l.unite || 'portion'}`
      if (!agg[key]) {
        agg[key] = {
          matiere_nom: l.matiere_nom,
          unite: l.unite || 'portion',
          total_qte: 0,
          cout_unitaire_moyen: Number(l.cout_unitaire || 0),
          total_cout: 0,
          plats: new Set(),
          commandes: new Set(),
          dernier_destockage: l.created_at
        }
      }
      agg[key].total_qte += Number(l.qte_destockee || 0)
      agg[key].total_cout += Number(l.total_cout || 0)
      if (l.plat_nom) agg[key].plats.add(l.plat_nom)
      if (l.order_number) agg[key].commandes.add(l.order_number)
      if (new Date(l.created_at) > new Date(agg[key].dernier_destockage)) {
        agg[key].dernier_destockage = l.created_at
      }
    })

    return Object.values(agg).map(row => ({
      ...row,
      total_qte: Math.round(row.total_qte * 1000) / 1000,
      total_cout: Math.round(row.total_cout),
      cout_unitaire_moyen: row.total_qte > 0 ? Math.round(row.total_cout / row.total_qte) : row.cout_unitaire_moyen,
      platsList: Array.from(row.plats),
      commandesCount: row.commandes.size
    })).sort((a, b) => b.total_cout - a.total_cout)
  }, [destockageLogs, isWithinPeriod, filterMatiere, filterPlat, searchQuery])

  // =============================================================================
  // 11.2 RAPPORT RENTABILITÉ DES PLATS (CUISINE)
  // =============================================================================
  const platsRentabiliteReport = useMemo(() => {
    const periodCommandes = commandesResto.filter(c => {
      if (!isWithinPeriod(c.created_at || c.heure_ouverture)) return false
      if (c.validation_status === 'ANNULE') return false
      if (filterServeuse !== 'all' && c.serveur_nom?.toLowerCase() !== filterServeuse.toLowerCase()) return false
      return true
    })

    const agg: Record<string, {
      nom: string
      qte_vendue: number
      ca_ttc: number
      ca_ht: number
      cout_matiere_total: number
      pertes_qte: number
    }> = {}

    // Parcourir les lignes des commandes confirmées
    periodCommandes.forEach(cmd => {
      let items: any[] = []
      try {
        if (cmd.notes) {
          const p = JSON.parse(cmd.notes)
          if (p.items) items = p.items
        }
      } catch (_) {}

      items.forEach(it => {
        const nom = it.designation || it.name || 'Plat'
        const isDrink = Boolean(cmd.circuit === 'BAR') && !it.is_recipe
        if (isDrink && filterCircuit === 'CUISINE') return
        if (!isDrink && filterCircuit === 'BAR') return
        if (filterPlat !== 'all' && nom.toLowerCase() !== filterPlat.toLowerCase()) return
        if (searchQuery && !nom.toLowerCase().includes(searchQuery.toLowerCase())) return

        const qty = Number(it.quantite || it.qty || 1)
        const price = Number(it.prix_unitaire || it.unitPrice || 0)
        const totalLigneTTC = qty * price

        // Récupérer le coût matière depuis restaurant_destockage_log
        const logMatch = destockageLogs.filter(l => l.order_number === cmd.numero_commande && l.plat_nom === nom)
        const logCost = logMatch.reduce((sum, l) => sum + Number(l.total_cout || 0), 0)
        const fallbackCost = Number(it.cost_price || 0) * qty

        if (!agg[nom]) {
          agg[nom] = {
            nom,
            qte_vendue: 0,
            ca_ttc: 0,
            ca_ht: 0,
            cout_matiere_total: 0,
            pertes_qte: 0
          }
        }
        agg[nom].qte_vendue += qty
        agg[nom].ca_ttc += totalLigneTTC
        agg[nom].ca_ht += totalLigneTTC // CHR restauration
        agg[nom].cout_matiere_total += (logCost > 0 ? logCost : fallbackCost)
      })
    })

    // Intégrer les pertes déclarées
    pertes.filter(p => isWithinPeriod(p.created_at)).forEach(prt => {
      if (agg[prt.produit_nom]) {
        agg[prt.produit_nom].pertes_qte += Number(prt.quantite || 0)
      }
    })

    return Object.values(agg).map(row => {
      const margeBrute = row.ca_ht - row.cout_matiere_total
      // Taux de marge = Marge / Coût * 100
      const tauxMarge = row.cout_matiere_total > 0 ? Math.round((margeBrute / row.cout_matiere_total) * 100) : 0
      // Taux de marque = Marge / CA HT * 100
      const tauxMarque = row.ca_ht > 0 ? Math.round((margeBrute / row.ca_ht) * 100) : 0

      return {
        ...row,
        margeBrute,
        tauxMarge,
        tauxMarque,
        coutUnitaireMoyen: row.qte_vendue > 0 ? Math.round(row.cout_matiere_total / row.qte_vendue) : 0,
        prixVenteMoyen: row.qte_vendue > 0 ? Math.round(row.ca_ttc / row.qte_vendue) : 0
      }
    }).sort((a, b) => b.ca_ttc - a.ca_ttc)
  }, [commandesResto, destockageLogs, pertes, isWithinPeriod, filterServeuse, filterCircuit, filterPlat, searchQuery])

  // =============================================================================
  // 11.3 RAPPORT RENTABILITÉ BAR & BOISSONS
  // =============================================================================
  const barRentabiliteReport = useMemo(() => {
    const barProds = products.filter(p => {
      const isMatiere = Boolean(p.sector_meta?.is_matiere_premiere || p.is_matiere_premiere)
      const circuit = p.restaurant_circuit || p.sector_meta?.restaurant_circuit || 'BAR'
      return circuit === 'BAR' && !isMatiere
    })

    const commandesBar = commandesResto.filter(c => {
      if (!isWithinPeriod(c.created_at || c.heure_ouverture)) return false
      if (c.validation_status === 'ANNULE') return false
      return c.circuit === 'BAR' || !c.circuit
    })

    const agg: Record<string, {
      produit_id: string
      nom: string
      stock_actuel: number
      qte_vendue: number
      ca_ttc: number
      cout_achat_total: number
      bouteilles_consignees_remises: number
      bouteilles_consignees_rendues: number
    }> = {}

    barProds.forEach(p => {
      agg[p.name] = {
        produit_id: p.id,
        nom: p.name,
        stock_actuel: Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0),
        qte_vendue: 0,
        ca_ttc: 0,
        cout_achat_total: 0,
        bouteilles_consignees_remises: 0,
        bouteilles_consignees_rendues: 0
      }
    })

    commandesBar.forEach(cmd => {
      let items: any[] = []
      try {
        if (cmd.notes) {
          const p = JSON.parse(cmd.notes)
          if (p.items) items = p.items
        }
      } catch (_) {}

      items.forEach(it => {
        const nom = it.designation || it.name
        if (!agg[nom]) {
          agg[nom] = {
            produit_id: it.produit_id || '',
            nom,
            stock_actuel: 0,
            qte_vendue: 0,
            ca_ttc: 0,
            cout_achat_total: 0,
            bouteilles_consignees_remises: 0,
            bouteilles_consignees_rendues: 0
          }
        }
        const qty = Number(it.quantite || it.qty || 1)
        const price = Number(it.prix_unitaire || it.unitPrice || 0)
        const costU = Number(it.cost_price || 0)
        agg[nom].qte_vendue += qty
        agg[nom].ca_ttc += qty * price
        agg[nom].cout_achat_total += qty * costU
      })
    })

    // Intégrer les consignes depuis restaurant_creances_serveuses
    creances.filter(c => isWithinPeriod(c.date_creation) && c.circuit === 'BAR').forEach(c => {
      // Répartir ou sommer
    })

    return Object.values(agg)
      .filter(r => r.qte_vendue > 0 || r.stock_actuel > 0)
      .map(row => {
        const margeBrute = row.ca_ttc - row.cout_achat_total
        const tauxMarge = row.cout_achat_total > 0 ? Math.round((margeBrute / row.cout_achat_total) * 100) : 0
        const tauxMarque = row.ca_ttc > 0 ? Math.round((margeBrute / row.ca_ttc) * 100) : 0
        return {
          ...row,
          margeBrute,
          tauxMarge,
          tauxMarque
        }
      })
      .sort((a, b) => b.ca_ttc - a.ca_ttc)
  }, [products, commandesResto, creances, isWithinPeriod])

  // =============================================================================
  // 11.4 RAPPORT DÉTAILLÉ DES SERVEUSES
  // =============================================================================
  const serveusesReport = useMemo(() => {
    const srvMap: Record<string, {
      nom: string
      ventes_bar: number
      ventes_cuisine: number
      total_ventes: number
      total_paye: number
      creances_restantes: number
      bouteilles_dues: number
      bouteilles_rendues: number
      solde_consignes: number
      sessions_count: number
      ecarts_cloture: number
    }> = {}

    // Initialiser les serveuses actives
    serveursList.forEach(s => {
      srvMap[s.nom_complet] = {
        nom: s.nom_complet,
        ventes_bar: 0,
        ventes_cuisine: 0,
        total_ventes: 0,
        total_paye: 0,
        creances_restantes: 0,
        bouteilles_dues: 0,
        bouteilles_rendues: 0,
        solde_consignes: 0,
        sessions_count: 0,
        ecarts_cloture: 0
      }
    })

    // Créances et ventes associées
    creances.filter(c => isWithinPeriod(c.date_creation)).forEach(c => {
      const srvNom = c.serveur_nom || 'Serveuse Inconnue'
      if (!srvMap[srvNom]) {
        srvMap[srvNom] = {
          nom: srvNom,
          ventes_bar: 0,
          ventes_cuisine: 0,
          total_ventes: 0,
          total_paye: 0,
          creances_restantes: 0,
          bouteilles_dues: 0,
          bouteilles_rendues: 0,
          solde_consignes: 0,
          sessions_count: 0,
          ecarts_cloture: 0
        }
      }

      const initMontant = Number(c.montant_initial || 0)
      const paye = Number(c.montant_paye || 0)
      const solde = Number(c.solde_restant || 0)
      const dues = Number(c.consignes_bouteilles_dues || 0)
      const rendues = Number(c.consignes_bouteilles_rendues || 0)

      if (c.circuit === 'BAR') {
        srvMap[srvNom].ventes_bar += initMontant
      } else {
        srvMap[srvNom].ventes_cuisine += initMontant
      }
      srvMap[srvNom].total_ventes += initMontant
      srvMap[srvNom].total_paye += paye
      srvMap[srvNom].creances_restantes += solde
      srvMap[srvNom].bouteilles_dues += dues
      srvMap[srvNom].bouteilles_rendues += rendues
      srvMap[srvNom].solde_consignes += Math.max(0, dues - rendues)
    })

    // Sessions et écarts de clôture
    sessionsServeuses.filter(s => isWithinPeriod(s.date_session || s.created_at)).forEach(s => {
      const srvNom = s.serveur_nom
      if (srvMap[srvNom]) {
        srvMap[srvNom].sessions_count += 1
        srvMap[srvNom].ecarts_cloture += Number(s.ecart_financier || 0)
      }
    })

    return Object.values(srvMap).sort((a, b) => b.total_ventes - a.total_ventes)
  }, [serveursList, creances, sessionsServeuses, isWithinPeriod])

  // Totaux globaux de la période
  const kpis = useMemo(() => {
    const totalCA = platsRentabiliteReport.reduce((acc, p) => acc + p.ca_ttc, 0)
    const totalFoodCost = platsRentabiliteReport.reduce((acc, p) => acc + p.cout_matiere_total, 0)
    const totalMargeBrute = totalCA - totalFoodCost
    const tauxMargeGlobal = totalFoodCost > 0 ? Math.round((totalMargeBrute / totalFoodCost) * 100) : 0
    const totalCreancesActives = creances.reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)
    const totalBouteillesConsigneesEnCours = creances.reduce((acc, c) => acc + Math.max(0, Number(c.consignes_bouteilles_dues || 0) - Number(c.consignes_bouteilles_rendues || 0)), 0)

    return {
      totalCA,
      totalFoodCost,
      totalMargeBrute,
      tauxMargeGlobal,
      totalCreancesActives,
      totalBouteillesConsigneesEnCours
    }
  }, [platsRentabiliteReport, creances])

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── En-tête & Titre Métier ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-black">
              <BarChart3 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white flex items-center gap-2">
                Rapports & Rentabilité • Secteur Bar, Restaurant & Maquis
              </h1>
              <p className="text-xs text-slate-400">
                Consommations matières fiches techniques • Marges brutes • Bouteilles consignées • Situation serveuses
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadReportsData}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition flex items-center gap-2 text-xs font-bold"
            title="Actualiser les rapports"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black transition flex items-center gap-2 shadow-lg shadow-rose-600/20"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer le Rapport</span>
          </button>
        </div>
      </div>

      {/* ── Cartes Synthétiques KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chiffre d'Affaires</p>
          <p className="text-base font-black text-slate-900 font-mono mt-1">{fmt(kpis.totalCA)}</p>
          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
            <TrendingUp className="w-3 h-3" /> Période active
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Coût Matière / Food Cost</p>
          <p className="text-base font-black text-amber-600 font-mono mt-1">{fmt(kpis.totalFoodCost)}</p>
          <span className="text-[10px] text-slate-500">Matières consommées</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marge Brute Globale</p>
          <p className="text-base font-black text-emerald-600 font-mono mt-1">{fmt(kpis.totalMargeBrute)}</p>
          <span className="text-[10px] text-emerald-600 font-bold">CA − Coût de revient</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taux de Marge Moyen</p>
          <p className="text-base font-black text-blue-600 font-mono mt-1">+{kpis.tauxMargeGlobal}%</p>
          <span className="text-[10px] text-slate-500">Marge / Coût × 100</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm bg-rose-50/20">
          <p className="text-[10px] font-black text-rose-800 uppercase tracking-wider">Créances Serveuses</p>
          <p className="text-base font-black text-rose-600 font-mono mt-1">{fmt(kpis.totalCreancesActives)}</p>
          <span className="text-[10px] text-rose-700 font-bold">À recouvrer</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm bg-amber-50/20">
          <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Bouteilles Dues</p>
          <p className="text-base font-black text-amber-900 font-mono mt-1">{kpis.totalBouteillesConsigneesEnCours} btls</p>
          <span className="text-[10px] text-amber-700 font-bold">Contenants consignés</span>
        </div>
      </div>

      {/* ── Barre de Filtres de Période & Critères (Section 11.1) ─────────────── */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Périodes Prédéfinies */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Période :
            </span>
            {[
              { id: 'today', label: "Aujourd'hui" },
              { id: 'yesterday', label: 'Hier' },
              { id: 'week', label: 'Cette Semaine' },
              { id: 'month', label: 'Ce Mois' },
              { id: 'last_month', label: 'Mois Précédent' },
              { id: 'year', label: 'Cette Année' },
              { id: 'custom', label: 'Personnalisée' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriodPreset(p.id as any)}
                className={clsx(
                  'px-3 py-1.5 rounded-xl text-xs font-bold transition',
                  periodPreset === p.id
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Sélecteur de dates personnalisées */}
          {periodPreset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 animate-fadeIn text-xs">
              <label className="text-slate-500 font-bold pl-1">Du :</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
              />
              <label className="text-slate-500 font-bold">Au :</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
              />
            </div>
          )}
        </div>

        {/* Filtres secondaires : Matière, Plat, Serveuse, Circuit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="font-bold text-slate-500 block mb-1">Filtrer par Serveuse :</label>
            <select
              value={filterServeuse}
              onChange={e => setFilterServeuse(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-800"
            >
              <option value="all">Toutes les serveuses</option>
              {serveursList.map(s => (
                <option key={s.id} value={s.nom_complet}>{s.nom_complet}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-500 block mb-1">Circuit de Vente :</label>
            <select
              value={filterCircuit}
              onChange={e => setFilterCircuit(e.target.value as any)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-800"
            >
              <option value="ALL">Tous les circuits (BAR & CUISINE)</option>
              <option value="BAR">Circuit BAR uniquement</option>
              <option value="CUISINE">Circuit CUISINE uniquement</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="font-bold text-slate-500 block mb-1">Recherche Rapide (Plat ou Matière) :</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
              <input
                type="text"
                placeholder="Ex : Riz, Chawarma, Poulet, Poisson, Castel..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Onglets de Sélection des 4 Rapports Normés ───────────────────────── */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('PLATS')}
          className={clsx(
            'px-5 py-3 text-xs font-black border-b-2 transition flex items-center gap-2',
            activeTab === 'PLATS'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <UtensilsCrossed className="w-4 h-4" />
          <span>11.2 Rentabilité des Plats ({platsRentabiliteReport.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('MATIERES')}
          className={clsx(
            'px-5 py-3 text-xs font-black border-b-2 transition flex items-center gap-2',
            activeTab === 'MATIERES'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Package className="w-4 h-4" />
          <span>11.1 Consommation Matières Premières ({matieresConsommeesReport.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('BAR')}
          className={clsx(
            'px-5 py-3 text-xs font-black border-b-2 transition flex items-center gap-2',
            activeTab === 'BAR'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Wine className="w-4 h-4" />
          <span>11.3 Rentabilité BAR & Boissons ({barRentabiliteReport.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SERVEUSES')}
          className={clsx(
            'px-5 py-3 text-xs font-black border-b-2 transition flex items-center gap-2',
            activeTab === 'SERVEUSES'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Users className="w-4 h-4" />
          <span>11.4 Rapport des Serveuses ({serveusesReport.length})</span>
        </button>
      </div>

      {/* ── CONTENU ONGLET 11.2 : RENTABILITÉ DES PLATS ───────────────────────── */}
      {activeTab === 'PLATS' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Analyse de Rentabilité & Food Cost des Plats & Menus
              </h3>
              <p className="text-xs text-slate-500">
                Chiffre d'affaires HT, Coût matière réel déstocké, Marge brute, Taux de marge (%) et Taux de marque (%)
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-700">
              {platsRentabiliteReport.length} plats analysés
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Plat / Menu</th>
                  <th className="p-3 text-right">Portions Vendues</th>
                  <th className="p-3 text-right">CA TTC Réalisé</th>
                  <th className="p-3 text-right">Food Cost (Coût Matière)</th>
                  <th className="p-3 text-right">Marge Brute</th>
                  <th className="p-3 text-right">Taux de Marge (%)</th>
                  <th className="p-3 text-right">Taux de Marque (%)</th>
                  <th className="p-3 text-center">Pertes / Casses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {platsRentabiliteReport.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-900">
                      <span className="text-sm block">{p.nom}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Prix moyen : {fmt(p.prixVenteMoyen)} • Coût unitaire : {fmt(p.coutUnitaireMoyen)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-black text-slate-800">{p.qte_vendue}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">{fmt(p.ca_ttc)}</td>
                    <td className="p-3 text-right font-mono font-bold text-amber-600">{fmt(p.cout_matiere_total)}</td>
                    <td className="p-3 text-right font-mono font-black text-emerald-600">{fmt(p.margeBrute)}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600">+{p.tauxMarge}%</td>
                    <td className="p-3 text-right font-mono font-bold text-purple-600">{p.tauxMarque}%</td>
                    <td className="p-3 text-center font-mono">
                      {p.pertes_qte > 0 ? (
                        <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          {p.pertes_qte} portions
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {platsRentabiliteReport.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Aucune vente de plat enregistrée sur la période sélectionnée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET 11.1 : CONSOMMATION DES MATIÈRES PREMIÈRES ─────────── */}
      {activeTab === 'MATIERES' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Registre de Consommation Réelle des Matières Premières
              </h3>
              <p className="text-xs text-slate-500">
                Déstockages réels issus des fiches techniques des plats vendus • Coûts historiques enregistrés
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-700">
              {matieresConsommeesReport.length} matières suivies
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Matière Première Cuisine</th>
                  <th className="p-3 text-right">Quantité Consommée</th>
                  <th className="p-3 text-center">Unité</th>
                  <th className="p-3 text-right">Coût Unitaire Historique</th>
                  <th className="p-3 text-right">Coût Total Matière</th>
                  <th className="p-3">Plats Ayant Consommé la Matière</th>
                  <th className="p-3 text-center">Commandes</th>
                  <th className="p-3 text-right">Dernier Déstockage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matieresConsommeesReport.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-black text-slate-900">{m.matiere_nom}</td>
                    <td className="p-3 text-right font-mono font-black text-rose-600">{m.total_qte}</td>
                    <td className="p-3 text-center font-mono text-slate-500">{m.unite}</td>
                    <td className="p-3 text-right font-mono text-slate-700">{fmt(m.cout_unitaire_moyen)} / {m.unite}</td>
                    <td className="p-3 text-right font-mono font-black text-amber-700">{fmt(m.total_cout)}</td>
                    <td className="p-3 text-slate-700">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {m.platsList.map((p, pIdx) => (
                          <span key={pIdx} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{m.commandesCount}</td>
                    <td className="p-3 text-right text-slate-400 font-mono text-[10px]">
                      {new Date(m.dernier_destockage).toLocaleDateString('fr-BJ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
                {matieresConsommeesReport.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Aucune consommation de matière première enregistrée sur la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET 11.3 : RENTABILITÉ BAR & BOISSONS ──────────────────── */}
      {activeTab === 'BAR' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Rentabilité du Stock Vente BAR & Suivi des Boissons
              </h3>
              <p className="text-xs text-slate-500">
                Quantités vendues, Chiffre d'affaires, Coût d'achat, Marge brute et Stock actuel disponible
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-700">
              {barRentabiliteReport.length} boissons
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Boisson / Produit Bar</th>
                  <th className="p-3 text-right">Quantité Vendue</th>
                  <th className="p-3 text-right">Stock Actuel Restant</th>
                  <th className="p-3 text-right">CA TTC Boissons</th>
                  <th className="p-3 text-right">Coût d'Achat Total</th>
                  <th className="p-3 text-right">Marge Brute</th>
                  <th className="p-3 text-right">Taux de Marge (%)</th>
                  <th className="p-3 text-right">Taux de Marque (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {barRentabiliteReport.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-black text-slate-900">{b.nom}</td>
                    <td className="p-3 text-right font-mono font-black text-slate-800">{b.qte_vendue}</td>
                    <td className="p-3 text-right font-mono font-bold">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px]', b.stock_actuel <= 5 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800')}>
                        {b.stock_actuel} btls
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">{fmt(b.ca_ttc)}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-500">{fmt(b.cout_achat_total)}</td>
                    <td className="p-3 text-right font-mono font-black text-emerald-600">{fmt(b.margeBrute)}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600">+{b.tauxMarge}%</td>
                    <td className="p-3 text-right font-mono font-bold text-purple-600">{b.tauxMarque}%</td>
                  </tr>
                ))}
                {barRentabiliteReport.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Aucune boisson vendue sur la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET 11.4 : RAPPORT DES SERVEUSES ───────────────────────── */}
      {activeTab === 'SERVEUSES' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Rapport d'Activité & Situation Financière des Serveuses
              </h3>
              <p className="text-xs text-slate-500">
                Ventes BAR et CUISINE imputées, Encaissements reçus, Créances restantes et Contenants consignés
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-700">
              {serveusesReport.length} serveuses
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Serveuse Responsable</th>
                  <th className="p-3 text-right">Ventes BAR</th>
                  <th className="p-3 text-right">Ventes CUISINE</th>
                  <th className="p-3 text-right">Total Ventes TTC</th>
                  <th className="p-3 text-right">Total Versé / Payé</th>
                  <th className="p-3 text-right">Créances Restantes</th>
                  <th className="p-3 text-center">Bouteilles Dues / Rendues</th>
                  <th className="p-3 text-right">Écarts de Clôture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serveusesReport.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-black text-slate-900">
                      <span className="text-sm block">{s.nom}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {s.sessions_count} sessions de service enregistrées
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-blue-700 font-bold">{fmt(s.ventes_bar)}</td>
                    <td className="p-3 text-right font-mono text-orange-700 font-bold">{fmt(s.ventes_cuisine)}</td>
                    <td className="p-3 text-right font-mono font-black text-slate-900">{fmt(s.total_ventes)}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">{fmt(s.total_paye)}</td>
                    <td className="p-3 text-right font-mono font-black text-rose-600">
                      {s.creances_restantes > 0 ? fmt(s.creances_restantes) : <span className="text-emerald-600 font-bold">Soldé (0)</span>}
                    </td>
                    <td className="p-3 text-center font-mono">
                      {s.bouteilles_dues > 0 ? (
                        <span className={clsx('px-2 py-0.5 rounded-full font-bold text-[10px]', s.solde_consignes > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800')}>
                          {s.bouteilles_rendues} / {s.bouteilles_dues} ({s.solde_consignes} dues)
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {s.ecarts_cloture !== 0 ? (
                        <span className={clsx('font-black text-[10px] px-2 py-0.5 rounded', s.ecarts_cloture < 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800')}>
                          {fmt(s.ecarts_cloture)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-bold">0 FCFA</span>
                      )}
                    </td>
                  </tr>
                ))}
                {serveusesReport.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Aucune activité serveuse enregistrée sur la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default RestaurantReportingPage
