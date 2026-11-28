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
  FileText,
  BarChart3, TrendingUp, TrendingDown, RefreshCw, Calendar,
  Filter, Users, Package, Wine, UtensilsCrossed, Printer, Download,
  Layers, DollarSign, Clock, ShieldCheck, AlertCircle, FileSpreadsheet,
  CheckCircle2, ChevronRight, Search, ShoppingBag, Store, Receipt, Percent, Tag
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { resolveProductCircuit } from '../../../services/restaurantService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const RestaurantReportingPage: React.FC = () => {
  const { company, companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  // Navigation par onglets analytiques
  const [activeTab, setActiveTab] = useState<'VENTES' | 'COUTS' | 'RENTABILITE' | 'SERVEUSES' | 'PLATS' | 'MATIERES'>('VENTES')

  // Filtres temporels obligatoires (Section 11.1)
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'select_month' | 'custom'>('month')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Sous-vue de l'onglet serveuses
  const [serveuseSubView, setServeuseSubView] = useState<'RENTABILITE' | 'SESSIONS_DETTES'>('RENTABILITE')

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
  const [expensesList, setExpensesList] = useState<any[]>([])
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
    } else if (periodPreset === 'select_month') {
      const [yStr, mStr] = (selectedMonth || new Date().toISOString().slice(0, 7)).split('-')
      const y = parseInt(yStr, 10) || now.getFullYear()
      const m = (parseInt(mStr, 10) || 1) - 1
      start = new Date(y, m, 1, 0, 0, 0, 0)
      end = new Date(y, m + 1, 0, 23, 59, 59, 999)
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
  }, [periodPreset, selectedMonth, startDate, endDate])

  // Chargement des données
  const loadReportsData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [destockRes, salesRes, cmdRes, creanceRes, sessRes, prodRes, pertesRes, srvRes, expRes] = await Promise.all([
        supabaseTenant('restaurant_destockage_log').select('*').order('created_at', { ascending: false }),
        supabaseTenant('sales_orders').select('*, items:sales_order_items(*)').order('created_at', { ascending: false }).limit(2000),
        supabaseTenant('restaurant_commandes').select('*').order('created_at', { ascending: false }),
        supabaseTenant('restaurant_creances_serveuses').select('*').order('date_creation', { ascending: false }),
        supabaseTenant('restaurant_sessions_serveurs').select('*').order('created_at', { ascending: false }),
        supabaseTenant('products').select('*').order('name'),
        supabaseTenant('restaurant_pertes_gaspillage').select('*').order('created_at', { ascending: false }),
        supabaseTenant('restaurant_serveurs').select('*').order('nom_complet'),
        supabaseTenant('expenses').select('*').order('created_at', { ascending: false })
      ])

      setDestockageLogs(destockRes.data || [])
      setSalesOrders(salesRes.data || [])
      setCommandesResto(cmdRes.data || [])
      setCreances(creanceRes.data || [])
      setSessionsServeuses(sessRes.data || [])
      setProducts(prodRes.data || [])
      setPertes(pertesRes.data || [])
      setExpensesList(expRes?.data || [])

      // Unification des serveuses (restaurant_serveurs + restaurant_sessions_serveurs)
      const unifiedSrvMap = new Map<string, any>()
      ;(srvRes.data || []).forEach((s: any) => {
        const key = (s.nom_complet || '').trim().toLowerCase()
        if (key) unifiedSrvMap.set(key, s)
      })
      ;(sessRes.data || []).forEach((sess: any) => {
        const nom = (sess.serveur_nom || '').trim()
        const key = nom.toLowerCase()
        if (nom && !unifiedSrvMap.has(key)) {
          unifiedSrvMap.set(key, {
            id: sess.serveur_id || `sess-${sess.id}`,
            matricule: `SRV-${nom.slice(0, 3).toUpperCase()}`,
            nom_complet: nom,
            role: 'SERVEUR',
            statut: 'ACTIF'
          })
        }
      })
      setServeursList(Array.from(unifiedSrvMap.values()).sort((a, b) => a.nom_complet.localeCompare(b.nom_complet)))
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
  // 11.4 RAPPORT DÉTAILLÉ DE RENTABILITÉ ET PERFORMANCE DES SERVEUSES (SECTIONS 2, 3, 4, 5)
  // =============================================================================
  const serveusesRentabiliteReport = useMemo(() => {
    // 1. Initialiser la map des serveuses à partir de la liste unifiée
    const srvMap: Record<string, {
      nom: string
      matricule?: string
      role?: string
      has_open_session: boolean
      active_session_id?: string | null
      nb_ventes: number
      ca_mensuel: number
      cout_ventes: number
      marge_brute: number
      taux_marge: number
      taux_marque: number
      service_dates: Set<string>
      jours_service: number
      moyenne_journaliere: number
      ventes_bar: number
      ventes_cuisine: number
      total_paye: number
      creances_restantes: number
      bouteilles_dues: number
      bouteilles_rendues: number
      solde_consignes: number
      sessions_count: number
      ecarts_cloture: number
      montant_verse_total: number
      produits_bar: Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>
      plats_restaurant: Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>
      produits_bar_list?: any[]
      plats_restaurant_list?: any[]
      sales_detail: any[]
    }> = {}

    // Enregistrer les serveuses du personnel
    serveursList.forEach(s => {
      const nom = (s.nom_complet || '').trim()
      if (!nom) return
      srvMap[nom] = {
        nom,
        matricule: s.matricule,
        role: s.role || 'SERVEUSE',
        has_open_session: Boolean(s.has_open_session),
        active_session_id: s.active_session_id || null,
        nb_ventes: 0,
        ca_mensuel: 0,
        cout_ventes: 0,
        marge_brute: 0,
        taux_marge: 0,
        taux_marque: 0,
        service_dates: new Set<string>(),
        jours_service: 0,
        moyenne_journaliere: 0,
        ventes_bar: 0,
        ventes_cuisine: 0,
        total_paye: 0,
        creances_restantes: 0,
        bouteilles_dues: 0,
        bouteilles_rendues: 0,
        solde_consignes: 0,
        sessions_count: 0,
        ecarts_cloture: 0,
          montant_verse_total: 0,
          produits_bar: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          plats_restaurant: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          sales_detail: []
        }
    })

    // Index des commandes resto pour corrélation
    const cmdMapByNum = new Map<string, any>()
    commandesResto.forEach(c => {
      if (c.numero_commande) cmdMapByNum.set(c.numero_commande, c)
    })

    // 2. Traiter les ventes réelles (sales_orders)
    salesOrders.forEach(so => {
      // Filtrer sur la période
      const dateVente = so.order_date || (so.created_at ? so.created_at.slice(0, 10) : '')
      if (!isWithinPeriod(so.created_at || so.order_date)) return

      // Ignorer les ventes annulées
      const isAnnulee = so.status === 'ANNULE' || so.status === 'canceled' || so.status === 'annule' || Boolean(so.motif_annulation)
      if (isAnnulee) return

      // Extraire la serveuse attribuée
      let srvNom: string | null = null
      let srvId: string | null = null
      if (so.notes) {
        try {
          const parsed = typeof so.notes === 'string' ? JSON.parse(so.notes) : so.notes
          if (parsed && typeof parsed === 'object') {
            srvNom = parsed.serveur_nom || null
            srvId = parsed.serveur_id || null
          }
        } catch (_) {}
      }
      if (!srvNom && so.sector_meta) {
        srvNom = so.sector_meta.serveur_nom || null
      }
      if (!srvNom && so.order_number && cmdMapByNum.has(so.order_number)) {
        srvNom = cmdMapByNum.get(so.order_number).serveur_nom || null
      }

      // Si aucune serveuse n'est attribuée, ne pas l'attribuer arbitrairement
      if (!srvNom || srvNom === 'Client Comptoir Direct' || srvNom === 'Serveur de Salle' || srvNom.trim() === '') {
        return
      }

      const cleanNom = srvNom.trim()

      // Initialiser si non existant
      if (!srvMap[cleanNom]) {
        srvMap[cleanNom] = {
          nom: cleanNom,
          role: 'SERVEUSE',
          has_open_session: false,
          nb_ventes: 0,
          ca_mensuel: 0,
          cout_ventes: 0,
          marge_brute: 0,
          taux_marge: 0,
          taux_marque: 0,
          service_dates: new Set<string>(),
          jours_service: 0,
          moyenne_journaliere: 0,
          ventes_bar: 0,
          ventes_cuisine: 0,
          total_paye: 0,
          creances_restantes: 0,
          bouteilles_dues: 0,
          bouteilles_rendues: 0,
          solde_consignes: 0,
          sessions_count: 0,
          ecarts_cloture: 0,
          montant_verse_total: 0,
          produits_bar: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          plats_restaurant: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          sales_detail: []
        }
      }

      // Chiffre d'affaires net des remises (une vente à crédit est comptabilisée une seule fois)
      const caVente = Number(so.total_amount || 0)
      const coutVente = Number(so.total_cost || 0)

      srvMap[cleanNom].nb_ventes += 1
      srvMap[cleanNom].ca_mensuel += caVente
      srvMap[cleanNom].cout_ventes += coutVente
      srvMap[cleanNom].marge_brute += (caVente - coutVente)
      if (dateVente) srvMap[cleanNom].service_dates.add(dateVente)

      srvMap[cleanNom].sales_detail.push({
        id: so.id,
        order_number: so.order_number,
        date: dateVente,
        created_at: so.created_at,
        customer_name: so.customer_name || 'Client',
        total_amount: caVente,
        total_cost: coutVente,
        marge: caVente - coutVente,
        payment_method: so.payment_method || so.payment_status || 'ESPECES',
        payment_status: so.payment_status || 'paye'
      })

      // Décomposer les lignes d'articles pour alimenter les listes Bar et Restaurant
      let parsedNotes: any = null
      if (so.notes) {
        try {
          parsedNotes = typeof so.notes === 'string' ? JSON.parse(so.notes) : so.notes
        } catch (_) {}
      }
      const lines = parsedNotes?.lines || parsedNotes?.items || []
      lines.forEach((l: any) => {
        const pNom = l.product?.name || l.nom || l.name || 'Article'
        const qte = Number(l.qty || l.quantite || 1)
        const pu = Number(l.unitPrice || l.prix_unitaire || (l.total ? l.total / qte : 0))
        const total = Number(l.total || (qte * pu))
        const circuit = l.circuit || l.product?.circuit || resolveProductCircuit(l.product || { name: pNom })

        if (circuit === 'BAR') {
          if (!srvMap[cleanNom].produits_bar[pNom]) {
            srvMap[cleanNom].produits_bar[pNom] = { nom: pNom, quantite: 0, montant_total: 0, prix_unitaire: pu }
          }
          srvMap[cleanNom].produits_bar[pNom].quantite += qte
          srvMap[cleanNom].produits_bar[pNom].montant_total += total
        } else {
          if (!srvMap[cleanNom].plats_restaurant[pNom]) {
            srvMap[cleanNom].plats_restaurant[pNom] = { nom: pNom, quantite: 0, montant_total: 0, prix_unitaire: pu }
          }
          srvMap[cleanNom].plats_restaurant[pNom].quantite += qte
          srvMap[cleanNom].plats_restaurant[pNom].montant_total += total
        }
      })
    })

    // 3. Intégrer les créances, versements et contenants consignés
    creances.filter(c => isWithinPeriod(c.date_creation)).forEach(c => {
      const srvNom = (c.serveur_nom || '').trim()
      if (!srvNom) return
      if (!srvMap[srvNom]) {
        srvMap[srvNom] = {
          nom: srvNom,
          role: 'SERVEUSE',
          has_open_session: false,
          nb_ventes: 0,
          ca_mensuel: 0,
          cout_ventes: 0,
          marge_brute: 0,
          taux_marge: 0,
          taux_marque: 0,
          service_dates: new Set<string>(),
          jours_service: 0,
          moyenne_journaliere: 0,
          ventes_bar: 0,
          ventes_cuisine: 0,
          total_paye: 0,
          creances_restantes: 0,
          bouteilles_dues: 0,
          bouteilles_rendues: 0,
          solde_consignes: 0,
          sessions_count: 0,
          ecarts_cloture: 0,
          montant_verse_total: 0,
          produits_bar: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          plats_restaurant: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          sales_detail: []
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
      srvMap[srvNom].total_paye += paye
      srvMap[srvNom].creances_restantes += solde
      srvMap[srvNom].bouteilles_dues += dues
      srvMap[srvNom].bouteilles_rendues += rendues
      srvMap[srvNom].solde_consignes += Math.max(0, dues - rendues)
    })

    // 4. Intégrer les sessions de service et les jours de service
    sessionsServeuses.forEach(s => {
      const srvNom = (s.serveur_nom || '').trim()
      if (!srvNom) return
      if (srvMap[srvNom] && s.statut === 'OUVERTE') {
        srvMap[srvNom].has_open_session = true
        srvMap[srvNom].active_session_id = s.id
      }
      if (isWithinPeriod(s.date_session || s.created_at)) {
        if (!srvMap[srvNom]) {
          srvMap[srvNom] = {
            nom: srvNom,
            role: 'SERVEUSE',
            has_open_session: s.statut === 'OUVERTE',
            active_session_id: s.id,
            nb_ventes: 0,
            ca_mensuel: 0,
            cout_ventes: 0,
            marge_brute: 0,
            taux_marge: 0,
            taux_marque: 0,
            service_dates: new Set<string>(),
            jours_service: 0,
            moyenne_journaliere: 0,
            ventes_bar: 0,
            ventes_cuisine: 0,
            total_paye: 0,
            creances_restantes: 0,
            bouteilles_dues: 0,
            bouteilles_rendues: 0,
            solde_consignes: 0,
            sessions_count: 0,
            ecarts_cloture: 0,
          montant_verse_total: 0,
          produits_bar: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          plats_restaurant: {} as Record<string, { nom: string; quantite: number; montant_total: number; prix_unitaire: number }>,
          sales_detail: []
        }
        }
        srvMap[srvNom].sessions_count += 1
        srvMap[srvNom].ecarts_cloture += Number(s.ecart_financier || 0)
        const dStr = s.date_session || (s.created_at ? s.created_at.slice(0, 10) : '')
        if (dStr) srvMap[srvNom].service_dates.add(dStr)
      }
    })

    // 5. Finaliser les ratios et moyennes par serveuse
    return Object.values(srvMap).map(srv => {
      const jours = srv.service_dates.size > 0 ? srv.service_dates.size : (srv.sessions_count > 0 ? srv.sessions_count : (srv.nb_ventes > 0 ? 1 : 0))
      const ca = srv.ca_mensuel
      const cout = srv.cout_ventes
      const marge = ca - cout
      const tauxMarge = cout > 0 ? Math.round((marge / cout) * 100) : 0
      const tauxMarque = ca > 0 ? Math.round((marge / ca) * 100) : 0
      const moyJour = jours > 0 ? Math.round(ca / jours) : ca

      return {
        ...srv,
        produits_bar_list: Object.values(srv.produits_bar),
        plats_restaurant_list: Object.values(srv.plats_restaurant),
        marge_brute: marge,
        jours_service: jours,
        moyenne_journaliere: moyJour,
        taux_marge: tauxMarge,
        taux_marque: tauxMarque
      }
    }).sort((a, b) => b.ca_mensuel - a.ca_mensuel)
  }, [serveursList, salesOrders, commandesResto, creances, sessionsServeuses, isWithinPeriod])

  // Alias pour rétro-compatibilité
  const serveusesReport = serveusesRentabiliteReport

  // Filtrage actif pour l'onglet serveuses
  const activeServeusesList = useMemo(() => {
    if (filterServeuse === 'all') return serveusesRentabiliteReport
    return serveusesRentabiliteReport.filter(s => s.nom.toLowerCase() === filterServeuse.toLowerCase())
  }, [serveusesRentabiliteReport, filterServeuse])

  // KPIs consolidés pour l'onglet serveuses (Section 4)
  const consolidatedServeusesKPIs = useMemo(() => {
    const list = activeServeusesList
    const totalVentes = list.reduce((acc, s) => acc + s.nb_ventes, 0)
    const totalCA = list.reduce((acc, s) => acc + s.ca_mensuel, 0)
    const totalCout = list.reduce((acc, s) => acc + s.cout_ventes, 0)
    const totalMarge = totalCA - totalCout
    const tauxMarge = totalCout > 0 ? Math.round((totalMarge / totalCout) * 100) : 0
    const unionDays = new Set<string>()
    list.forEach(s => s.service_dates.forEach(d => unionDays.add(d)))
    const totalJours = unionDays.size > 0 ? unionDays.size : (list.reduce((acc, s) => acc + s.jours_service, 0) || (totalVentes > 0 ? 1 : 0))
    const moyJournaliere = totalJours > 0 ? Math.round(totalCA / totalJours) : totalCA

    return {
      totalVentes,
      totalCA,
      totalCout,
      totalMarge,
      tauxMarge,
      totalJours,
      moyJournaliere
    }
  }, [activeServeusesList])

  // Ventes valides de la période
  const periodSales = useMemo(() => {
    return salesOrders.filter(so => {
      if (!isWithinPeriod(so.created_at || so.order_date)) return false
      const isAnnulee = so.status === 'ANNULE' || so.status === 'canceled' || so.status === 'annule' || Boolean(so.motif_annulation)
      if (isAnnulee) return false
      if (filterServeuse !== 'all' && (so.serveur_nom || '').toLowerCase() !== filterServeuse.toLowerCase()) return false
      return true
    })
  }, [salesOrders, isWithinPeriod, filterServeuse])

  // Comparatifs temporels de Chiffre d'Affaires (Section A)
  const caPeriodes = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    
    // Semaine
    const day = now.getDay() || 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - day + 1)
    monday.setHours(0, 0, 0, 0)
    
    // Mois
    const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    let caJour = 0
    let caSemaine = 0
    let caMois = 0

    salesOrders.forEach(so => {
      const isAnnulee = so.status === 'ANNULE' || so.status === 'canceled' || so.status === 'annule' || Boolean(so.motif_annulation)
      if (isAnnulee) return
      const d = new Date(so.created_at || so.order_date)
      const amt = Number(so.total_amount || 0)
      if ((so.created_at || so.order_date || '').startsWith(todayStr)) {
        caJour += amt
      }
      if (d >= monday) {
        caSemaine += amt
      }
      if (d >= firstDayMonth) {
        caMois += amt
      }
    })

    return { caJour, caSemaine, caMois }
  }, [salesOrders])

  // =============================================================================
  // SECTION A : RAPPORT DÉTAILLÉ DES VENTES
  // =============================================================================
  const ventesReport = useMemo(() => {
    let totalCA = 0
    let totalQte = 0
    let caBar = 0
    let qteBar = 0
    let caRestaurant = 0
    let qteRestaurant = 0

    const parServeuse: Record<string, { nom: string; nbCommandes: number; caBar: number; caRestaurant: number; totalCA: number }> = {}
    const parTable: Record<string, { table: string; nbCommandes: number; totalCA: number; isComptoir: boolean }> = {}
    const parProduit: Record<string, { nom: string; circuit: string; qte: number; ca: number; cout: number; puMoyen: number }> = {}

    periodSales.forEach(so => {
      const montantCommande = Number(so.total_amount || 0)
      totalCA += montantCommande

      // Serveuse
      const srvNom = so.serveur_nom || 'Comptoir Direct'
      if (!parServeuse[srvNom]) {
        parServeuse[srvNom] = { nom: srvNom, nbCommandes: 0, caBar: 0, caRestaurant: 0, totalCA: 0 }
      }
      parServeuse[srvNom].nbCommandes += 1
      parServeuse[srvNom].totalCA += montantCommande

      // Table vs Comptoir
      const rawTable = so.table_numero || (so.customer_name?.toLowerCase().includes('table') ? so.customer_name : null)
      const isComptoir = !rawTable || rawTable.toLowerCase().includes('comptoir')
      const tableKey = isComptoir ? 'Comptoir Direct' : (rawTable.toLowerCase().startsWith('table') ? rawTable : `Table ${rawTable}`)
      if (!parTable[tableKey]) {
        parTable[tableKey] = { table: tableKey, nbCommandes: 0, totalCA: 0, isComptoir }
      }
      parTable[tableKey].nbCommandes += 1
      parTable[tableKey].totalCA += montantCommande

      // Lignes de commande
      let parsedNotes: any = null
      if (so.notes) {
        try { parsedNotes = typeof so.notes === 'string' ? JSON.parse(so.notes) : so.notes } catch (_) {}
      }
      const rawLines = (so.items && so.items.length > 0)
        ? so.items.map((it: any) => ({
            name: it.product_name,
            qty: Number(it.quantity || 1),
            unitPrice: Number(it.unit_price || 0),
            unitCost: Number(it.unit_cost || 0),
            total: Number(it.subtotal || (Number(it.quantity || 1) * Number(it.unit_price || 0))),
            category: it.category
          }))
        : (parsedNotes?.lines || parsedNotes?.items || [])

      let hasLine = false
      rawLines.forEach((l: any) => {
        hasLine = true
        const pNom = l.product?.name || l.name || l.designation || 'Article'
        const qte = Number(l.qty || l.quantite || 1)
        const pu = Number(l.unitPrice || l.prix_unitaire || (l.total ? l.total / qte : 0))
        const total = Number(l.total || (qte * pu))
        const circuit = l.circuit || l.product?.circuit || resolveProductCircuit(l.product || { name: pNom })
        const unitCost = Number(l.unitCost || l.product?.cost_price || 0)

        totalQte += qte
        if (circuit === 'BAR') {
          caBar += total
          qteBar += qte
          parServeuse[srvNom].caBar += total
        } else {
          caRestaurant += total
          qteRestaurant += qte
          parServeuse[srvNom].caRestaurant += total
        }

        if (!parProduit[pNom]) {
          parProduit[pNom] = { nom: pNom, circuit, qte: 0, ca: 0, cout: 0, puMoyen: pu }
        }
        parProduit[pNom].qte += qte
        parProduit[pNom].ca += total
        parProduit[pNom].cout += (unitCost * qte)
      })

      if (!hasLine) {
        totalQte += 1
        const defaultCircuit = so.sector_slug === 'restaurant' ? 'CUISINE' : 'BAR'
        if (defaultCircuit === 'BAR') {
          caBar += montantCommande
          qteBar += 1
          parServeuse[srvNom].caBar += montantCommande
        } else {
          caRestaurant += montantCommande
          qteRestaurant += 1
          parServeuse[srvNom].caRestaurant += montantCommande
        }
      }
    })

    return {
      totalCA,
      totalCommandes: periodSales.length,
      totalQte,
      caBar,
      qteBar,
      caRestaurant,
      qteRestaurant,
      partBarPct: totalCA > 0 ? Math.round((caBar / totalCA) * 100) : 0,
      partRestoPct: totalCA > 0 ? Math.round((caRestaurant / totalCA) * 100) : 0,
      ventesParServeuse: Object.values(parServeuse).sort((a, b) => b.totalCA - a.totalCA),
      ventesParTable: Object.values(parTable).sort((a, b) => b.totalCA - a.totalCA),
      ventesParProduit: Object.values(parProduit).map(p => ({
        ...p,
        puMoyen: p.qte > 0 ? Math.round(p.ca / p.qte) : p.puMoyen,
        marge: p.ca - p.cout
      })).sort((a, b) => b.ca - a.ca)
    }
  }, [periodSales])

  // =============================================================================
  // SECTION B : RAPPORT DÉTAILLÉ DES COÛTS DES MATIÈRES
  // =============================================================================
  const coutsReport = useMemo(() => {
    let coutBoissons = 0
    const logsPeriode = destockageLogs.filter(l => isWithinPeriod(l.created_at))
    const coutCuisineLogs = logsPeriode.reduce((acc, l) => acc + Number(l.total_cout || 0), 0)

    ventesReport.ventesParProduit.forEach(p => {
      if (p.circuit === 'BAR') {
        coutBoissons += p.cout
      }
    })

    let coutCuisine = coutCuisineLogs
    if (coutCuisine === 0) {
      ventesReport.ventesParProduit.forEach(p => {
        if (p.circuit !== 'BAR') {
          coutCuisine += p.cout
        }
      })
    }

    const coutTotal = coutBoissons + coutCuisine
    const ratioCoutSurCA = ventesReport.totalCA > 0 ? Math.round((coutTotal / ventesReport.totalCA) * 100) : 0

    return {
      coutBoissons,
      coutCuisine,
      coutTotal,
      ratioCoutSurCA,
      logsPeriode,
      matieresConsommees: matieresConsommeesReport
    }
  }, [destockageLogs, isWithinPeriod, ventesReport, matieresConsommeesReport])

  // =============================================================================
  // SECTION C : RAPPORT DE RENTABILITÉ GLOBALE & COMPTE DE RÉSULTAT
  // =============================================================================
  const rentabiliteReport = useMemo(() => {
    const ca = ventesReport.totalCA
    const coutMatieres = coutsReport.coutTotal
    const margeBrute = ca - coutMatieres
    const tauxMargeBrute = ca > 0 ? Math.round((margeBrute / ca) * 100) : 0

    const expPeriode = expensesList.filter(e => isWithinPeriod(e.created_at))

    let depensesExploitation = 0
    let chargesPersonnel = 0
    const listExploitation: any[] = []
    const listPersonnel: any[] = []

    expPeriode.forEach(e => {
      const amt = Number(e.amount || 0)
      const cat = (e.category || '').toLowerCase()
      const isPersonnel = cat.includes('salaire') || cat.includes('personnel') || cat.includes('remuneration') || cat.includes('paie')
      if (isPersonnel) {
        chargesPersonnel += amt
        listPersonnel.push(e)
      } else {
        depensesExploitation += amt
        listExploitation.push(e)
      }
    })

    const totalCharges = depensesExploitation + chargesPersonnel
    const resultatApresCharges = margeBrute - totalCharges
    const tauxRentabiliteNette = ca > 0 ? Math.round((resultatApresCharges / ca) * 100) : 0

    return {
      ca,
      coutMatieres,
      margeBrute,
      tauxMargeBrute,
      depensesExploitation,
      chargesPersonnel,
      totalCharges,
      resultatApresCharges,
      tauxRentabiliteNette,
      listExploitation,
      listPersonnel
    }
  }, [ventesReport, coutsReport, expensesList, isWithinPeriod])

  // Totaux globaux de la période pour KPIs
  const kpis = useMemo(() => {
    const totalCA = ventesReport.totalCA
    const totalFoodCost = coutsReport.coutTotal
    const totalMargeBrute = rentabiliteReport.margeBrute
    const tauxMargeGlobal = rentabiliteReport.tauxMargeBrute
    const totalDepenses = rentabiliteReport.depensesExploitation
    const totalPersonnel = rentabiliteReport.chargesPersonnel
    const resultatNet = rentabiliteReport.resultatApresCharges
    const tauxRentabilite = rentabiliteReport.tauxRentabiliteNette
    const totalCreancesActives = creances.reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)
    const totalBouteillesConsigneesEnCours = creances.reduce((acc, c) => acc + Math.max(0, Number(c.consignes_bouteilles_dues || 0) - Number(c.consignes_bouteilles_rendues || 0)), 0)

    return {
      totalCA,
      totalFoodCost,
      totalMargeBrute,
      tauxMargeGlobal,
      totalDepenses,
      totalPersonnel,
      resultatNet,
      tauxRentabilite,
      totalCreancesActives,
      totalBouteillesConsigneesEnCours
    }
  }, [ventesReport, coutsReport, rentabiliteReport, creances])

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

      {/* ── Cartes Synthétiques KPIs (Conforme Audit Formules Spécifications) ─ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chiffre d'Affaires</p>
          <p className="text-base font-black text-slate-900 font-mono mt-1">{fmt(kpis.totalCA)}</p>
          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5 truncate">
            <TrendingUp className="w-3 h-3 flex-shrink-0" /> Bar: {fmt(ventesReport.caBar)} | Resto: {fmt(ventesReport.caRestaurant)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Coût Matières Réel</p>
          <p className="text-base font-black text-amber-600 font-mono mt-1">{fmt(kpis.totalFoodCost)}</p>
          <span className="text-[10px] text-slate-500 font-semibold">{coutsReport.ratioCoutSurCA}% du CA total</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marge Brute sur Matières</p>
          <p className="text-base font-black text-emerald-600 font-mono mt-1">{fmt(kpis.totalMargeBrute)}</p>
          <span className="text-[10px] text-emerald-600 font-bold">Taux marge : +{kpis.tauxMargeGlobal}%</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dépenses Exploitation</p>
          <p className="text-base font-black text-rose-600 font-mono mt-1">{fmt(kpis.totalDepenses)}</p>
          <span className="text-[10px] text-slate-500 font-bold">Charges opérationnelles</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Charges Personnel</p>
          <p className="text-base font-black text-indigo-600 font-mono mt-1">{fmt(kpis.totalPersonnel)}</p>
          <span className="text-[10px] text-slate-500 font-bold">Salaires & services</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Résultat Net Après Charges</p>
          <p className={clsx("text-base font-black font-mono mt-1", kpis.resultatNet >= 0 ? "text-emerald-700" : "text-rose-600")}>
            {fmt(kpis.resultatNet)}
          </p>
          <span className={clsx("text-[10px] font-bold", kpis.resultatNet >= 0 ? "text-emerald-600" : "text-rose-600")}>
            Rentabilité nette : {kpis.tauxRentabilite}%
          </span>
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
              { id: 'month', label: 'Ce Mois' },
              { id: 'last_month', label: 'Mois Précédent' },
              { id: 'select_month', label: 'Choisir Mois/Année' },
              { id: 'today', label: "Aujourd'hui" },
              { id: 'yesterday', label: 'Hier' },
              { id: 'week', label: 'Cette Semaine' },
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

          {/* Sélecteur de mois & année */}
          {periodPreset === 'select_month' && (
            <div className="flex items-center gap-2 bg-rose-50 p-1.5 rounded-2xl border border-rose-200 animate-fadeIn text-xs">
              <label className="text-rose-900 font-black pl-1 flex items-center gap-1">
                <span>🗓️</span> Mois / Année :
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-mono font-black text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          )}

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

      {/* ── Onglets de Sélection des Rapports Normés ───────────────────────── */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('VENTES')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'VENTES'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <BarChart3 className="w-4 h-4" />
          <span>A. Rapport des Ventes ({ventesReport.totalCommandes})</span>
        </button>

        <button
          onClick={() => setActiveTab('COUTS')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'COUTS'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Package className="w-4 h-4" />
          <span>B. Rapport des Coûts</span>
        </button>

        <button
          onClick={() => setActiveTab('RENTABILITE')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'RENTABILITE'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <TrendingUp className="w-4 h-4" />
          <span>C. Rapport de Rentabilité</span>
        </button>

        <button
          onClick={() => setActiveTab('SERVEUSES')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'SERVEUSES'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Users className="w-4 h-4" />
          <span>D. Serveuses & Personnel ({serveusesReport.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PLATS')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'PLATS'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <UtensilsCrossed className="w-4 h-4" />
          <span>E. Plats & Recettes ({platsRentabiliteReport.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('MATIERES')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'MATIERES'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Layers className="w-4 h-4" />
          <span>F. Matières Premières ({matieresConsommeesReport.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('BAR')}
          className={clsx(
            'px-4 py-3 text-xs font-black border-b-2 transition flex items-center gap-2 whitespace-nowrap',
            activeTab === 'BAR'
              ? 'border-rose-600 text-rose-600 bg-rose-50/30 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Wine className="w-4 h-4" />
          <span>G. Stock Vente BAR ({barRentabiliteReport.length})</span>
        </button>
      </div>

      {/* ── CONTENU ONGLET A : RAPPORT DES VENTES ─────────────────────────────── */}
      {activeTab === 'VENTES' && (
        <div className="space-y-6">
          {/* Cartes Comparatives de Chiffre d'Affaires */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CA Aujourd'hui</span>
              <p className="text-xl font-black font-mono text-slate-900 mt-1">{fmt(caPeriodes.caJour)}</p>
              <p className="text-xs text-slate-500 mt-1">Activité en direct du jour</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CA Cette Semaine</span>
              <p className="text-xl font-black font-mono text-indigo-700 mt-1">{fmt(caPeriodes.caSemaine)}</p>
              <p className="text-xs text-slate-500 mt-1">Du lundi au dimanche</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CA Ce Mois</span>
              <p className="text-xl font-black font-mono text-blue-700 mt-1">{fmt(caPeriodes.caMois)}</p>
              <p className="text-xs text-slate-500 mt-1">Mois calendaire en cours</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border-2 border-rose-300 shadow-sm bg-rose-50/30">
              <span className="text-[10px] font-black uppercase text-rose-800 tracking-wider">CA Période Sélectionnée</span>
              <p className="text-xl font-black font-mono text-rose-700 mt-1">{fmt(ventesReport.totalCA)}</p>
              <p className="text-xs text-rose-900 font-bold mt-1">
                {ventesReport.totalCommandes} commandes • {ventesReport.totalQte} articles
              </p>
            </div>
          </div>

          {/* Répartition BAR vs RESTAURANT */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span>🍷 / 🍽️</span> Répartition Sectorielle : Ventes BAR vs Ventes RESTAURANT
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 flex justify-between items-center">
                <div>
                  <span className="text-xs font-black uppercase text-blue-900">Ventes BAR (Boissons)</span>
                  <p className="text-2xl font-black font-mono text-blue-800 mt-1">{fmt(ventesReport.caBar)}</p>
                  <p className="text-xs text-blue-700 font-bold mt-0.5">{ventesReport.qteBar} boissons servies</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black font-mono text-blue-600">{ventesReport.partBarPct}%</span>
                  <p className="text-[10px] text-blue-700 font-bold">du chiffre d'affaires</p>
                </div>
              </div>

              <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 flex justify-between items-center">
                <div>
                  <span className="text-xs font-black uppercase text-orange-900">Ventes RESTAURANT & MAQUIS (Cuisine)</span>
                  <p className="text-2xl font-black font-mono text-orange-800 mt-1">{fmt(ventesReport.caRestaurant)}</p>
                  <p className="text-xs text-orange-700 font-bold mt-0.5">{ventesReport.qteRestaurant} plats & préparations</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black font-mono text-orange-600">{ventesReport.partRestoPct}%</span>
                  <p className="text-[10px] text-orange-700 font-bold">du chiffre d'affaires</p>
                </div>
              </div>
            </div>

            {/* Barre de répartition visuelle */}
            {ventesReport.totalCA > 0 && (
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="bg-blue-600 transition-all duration-500"
                  style={{ width: `${ventesReport.partBarPct}%` }}
                  title={`BAR: ${ventesReport.partBarPct}%`}
                />
                <div
                  className="bg-orange-500 transition-all duration-500"
                  style={{ width: `${ventesReport.partRestoPct}%` }}
                  title={`RESTAURANT: ${ventesReport.partRestoPct}%`}
                />
              </div>
            )}
          </div>

          {/* Tableau 1 : Ventes par Serveuse */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-rose-600" /> Ventes par Serveuse Responsable
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Serveuse Responsable</th>
                    <th className="p-3 text-center">Commandes</th>
                    <th className="p-3 text-right">Ventes BAR</th>
                    <th className="p-3 text-right">Ventes RESTAURANT</th>
                    <th className="p-3 text-right">Total CA TTC</th>
                    <th className="p-3 text-right">Part dans le CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventesReport.ventesParServeuse.map((s, idx) => {
                    const pct = ventesReport.totalCA > 0 ? Math.round((s.totalCA / ventesReport.totalCA) * 100) : 0
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-black text-slate-900">{s.nom}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{s.nbCommandes}</td>
                        <td className="p-3 text-right font-mono text-blue-700 font-bold">{fmt(s.caBar)}</td>
                        <td className="p-3 text-right font-mono text-orange-700 font-bold">{fmt(s.caRestaurant)}</td>
                        <td className="p-3 text-right font-mono font-black text-slate-900">{fmt(s.totalCA)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-600">{pct}%</td>
                      </tr>
                    )
                  })}
                  {ventesReport.ventesParServeuse.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Aucune vente enregistrée sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau 2 : Ventes par Table & Vente Directe Comptoir */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Store className="w-4 h-4 text-indigo-600" /> Ventes par Table & Ventes Directes Comptoir
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Emplacement / Table</th>
                    <th className="p-3 text-center">Type de Vente</th>
                    <th className="p-3 text-center">Nombre de Commandes</th>
                    <th className="p-3 text-right">Chiffre d'Affaires Réalisé</th>
                    <th className="p-3 text-right">Part dans le CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventesReport.ventesParTable.map((t, idx) => {
                    const pct = ventesReport.totalCA > 0 ? Math.round((t.totalCA / ventesReport.totalCA) * 100) : 0
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-black text-slate-900">{t.table}</td>
                        <td className="p-3 text-center">
                          <span className={clsx(
                            'px-2 py-0.5 rounded-full font-bold text-[10px]',
                            t.isComptoir ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                          )}>
                            {t.isComptoir ? 'Vente Comptoir Direct' : 'Vente sur Table'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">{t.nbCommandes}</td>
                        <td className="p-3 text-right font-mono font-black text-slate-900">{fmt(t.totalCA)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-600">{pct}%</td>
                      </tr>
                    )
                  })}
                  {ventesReport.ventesParTable.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Aucune vente par table enregistrée sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau 3 : Ventes par Produit */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600" /> Ventes Détaillées par Produit
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Produit / Article</th>
                    <th className="p-3 text-center">Circuit</th>
                    <th className="p-3 text-right">Quantité Vendue</th>
                    <th className="p-3 text-right">Prix Moyen</th>
                    <th className="p-3 text-right">CA Total TTC</th>
                    <th className="p-3 text-right">Marge Dégagée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventesReport.ventesParProduit.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">{p.nom}</td>
                      <td className="p-3 text-center">
                        <span className={clsx(
                          'px-2 py-0.5 rounded font-black text-[9px]',
                          p.circuit === 'BAR' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                        )}>
                          {p.circuit}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-black text-slate-800">{p.qte}</td>
                      <td className="p-3 text-right font-mono text-slate-600">{fmt(p.puMoyen)}</td>
                      <td className="p-3 text-right font-mono font-black text-slate-900">{fmt(p.ca)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">{fmt(p.marge)}</td>
                    </tr>
                  ))}
                  {ventesReport.ventesParProduit.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Aucun produit vendu sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET B : RAPPORT DES COÛTS ───────────────────────────────── */}
      {activeTab === 'COUTS' && (
        <div className="space-y-6">
          {/* Synthèse des Coûts Réels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider">Coût Réel Boissons</span>
              <p className="text-xl font-black font-mono text-blue-900 mt-1">{fmt(coutsReport.coutBoissons)}</p>
              <p className="text-xs text-slate-500 mt-1">Calculé au coût d'achat unitaire réel</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase text-orange-800 tracking-wider">Coût Matières Plats</span>
              <p className="text-xl font-black font-mono text-orange-900 mt-1">{fmt(coutsReport.coutCuisine)}</p>
              <p className="text-xs text-slate-500 mt-1">Ingrédients déstockés via fiches recettes</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border-2 border-amber-300 shadow-sm bg-amber-50/20">
              <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">Coût Total des Matières</span>
              <p className="text-xl font-black font-mono text-amber-700 mt-1">{fmt(coutsReport.coutTotal)}</p>
              <p className="text-xs text-amber-900 font-bold mt-1">Consommations réelles certifiées</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Ratio Food Cost / CA</span>
              <p className="text-xl font-black font-mono text-indigo-700 mt-1">{coutsReport.ratioCoutSurCA}%</p>
              <p className="text-xs text-slate-500 mt-1">Coût matières ÷ Chiffre d'affaires</p>
            </div>
          </div>

          {/* Tableau du Coût Réel par Produit */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" /> Détail du Coût Réel de Revient par Produit
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Produit / Article</th>
                    <th className="p-3 text-center">Circuit</th>
                    <th className="p-3 text-right">Quantité Vendue</th>
                    <th className="p-3 text-right">Coût Unitaire Réel</th>
                    <th className="p-3 text-right">Coût Total Consommé</th>
                    <th className="p-3 text-right">CA Réalisé</th>
                    <th className="p-3 text-right">Ratio Coût / CA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventesReport.ventesParProduit.map((p, idx) => {
                    const ratio = p.ca > 0 ? Math.round((p.cout / p.ca) * 100) : 0
                    const coutU = p.qte > 0 ? Math.round(p.cout / p.qte) : 0
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-900">{p.nom}</td>
                        <td className="p-3 text-center">
                          <span className={clsx(
                            'px-2 py-0.5 rounded font-black text-[9px]',
                            p.circuit === 'BAR' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                          )}>
                            {p.circuit}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-slate-800">{p.qte}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{fmt(coutU)}</td>
                        <td className="p-3 text-right font-mono font-black text-amber-600">{fmt(p.cout)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{fmt(p.ca)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-600">{ratio}%</td>
                      </tr>
                    )
                  })}
                  {ventesReport.ventesParProduit.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        Aucun mouvement de stock ou vente sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Registre des Matières Premières Consommées */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-600" /> Sorties Réelles de Matières Premières (Fiches Recettes)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Ingrédient / Matière Première</th>
                    <th className="p-3 text-right">Quantité Déstockée</th>
                    <th className="p-3 text-center">Unité</th>
                    <th className="p-3 text-right">Coût Unitaire Moyen</th>
                    <th className="p-3 text-right">Coût Total Matière</th>
                    <th className="p-3">Plats Ayant Consommé l'Ingrédient</th>
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
                    </tr>
                  ))}
                  {matieresConsommeesReport.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Aucun déstockage d'ingrédient enregistré sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENU ONGLET C : RAPPORT DE RENTABILITÉ GLOBALE ─────────────────── */}
      {activeTab === 'RENTABILITE' && (
        <div className="space-y-6">
          {/* Tableau de Bord Compte de Résultat d'Exploitation CHR */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Compte de Résultat d'Exploitation CHR • Secteur Bar & Restauration
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Calcul exact et indépendant : Marge Brute = CA − Coût Matières • Résultat Après Charges = Marge Brute − Dépenses − Personnel
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4 max-w-3xl">
              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                <span className="font-bold text-slate-700 text-sm">(+) CHIFFRE D'AFFAIRES RÉEL TTC :</span>
                <span className="font-mono font-black text-lg text-slate-900">{fmt(rentabiliteReport.ca)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200 text-amber-800">
                <span className="font-bold text-sm">(-) COÛT TOTAL RÉEL DES MATIÈRES :</span>
                <span className="font-mono font-bold text-base text-amber-700">− {fmt(rentabiliteReport.coutMatieres)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 text-emerald-900">
                <div>
                  <span className="font-black text-sm">(=) MARGE BRUTE SUR MATIÈRES :</span>
                  <p className="text-[10px] text-emerald-700 font-bold">Taux de marge brute : +{rentabiliteReport.tauxMargeBrute}%</p>
                </div>
                <span className="font-mono font-black text-xl text-emerald-700">{fmt(rentabiliteReport.margeBrute)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200 text-rose-800">
                <span className="font-bold text-sm">(-) DÉPENSES D'EXPLOITATION (Charges opérationnelles) :</span>
                <span className="font-mono font-bold text-base text-rose-700">− {fmt(rentabiliteReport.depensesExploitation)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200 text-indigo-800">
                <span className="font-bold text-sm">(-) CHARGES DE PERSONNEL (Salaires & Rémunérations) :</span>
                <span className="font-mono font-bold text-base text-indigo-700">− {fmt(rentabiliteReport.chargesPersonnel)}</span>
              </div>
              <div className={clsx(
                'flex justify-between items-center py-4 p-4 rounded-2xl border-2',
                rentabiliteReport.resultatApresCharges >= 0
                  ? 'bg-emerald-100/60 border-emerald-400 text-emerald-950'
                  : 'bg-rose-100/60 border-rose-400 text-rose-950'
              )}>
                <div>
                  <span className="font-black text-base uppercase">(=) RÉSULTAT APRÈS CHARGES (Résultat Net) :</span>
                  <p className="text-xs font-bold mt-0.5">
                    Taux de rentabilité nette : {rentabiliteReport.tauxRentabiliteNette}% du chiffre d'affaires
                  </p>
                </div>
                <span className="font-mono font-black text-2xl">{fmt(rentabiliteReport.resultatApresCharges)}</span>
              </div>
            </div>
          </div>

          {/* Dépenses Réelles d'Exploitation */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-rose-600" /> Dépenses d'Exploitation Enregistrées sur la Période
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Réf / N° Dépense</th>
                    <th className="p-3">Catégorie</th>
                    <th className="p-3">Bénéficiaire / Motif</th>
                    <th className="p-3 text-center">Paiement</th>
                    <th className="p-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentabiliteReport.listExploitation.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono text-slate-600">
                        {new Date(e.created_at).toLocaleDateString('fr-BJ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800">{e.expense_number || `DEP-${e.id?.slice(0, 6)}`}</td>
                      <td className="p-3 font-bold text-slate-700">{e.category}</td>
                      <td className="p-3 text-slate-800">{e.beneficiary || e.notes || 'Dépense courante'}</td>
                      <td className="p-3 text-center capitalize font-semibold">{e.payment_method || 'Espèces'}</td>
                      <td className="p-3 text-right font-mono font-black text-rose-600">{fmt(Number(e.amount) || 0)}</td>
                    </tr>
                  ))}
                  {rentabiliteReport.listExploitation.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Aucune dépense d'exploitation enregistrée sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Charges de Personnel */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" /> Charges de Personnel Enregistrées sur la Période
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Réf</th>
                    <th className="p-3">Employé / Bénéficiaire</th>
                    <th className="p-3">Motif / Notes</th>
                    <th className="p-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentabiliteReport.listPersonnel.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono text-slate-600">
                        {new Date(e.created_at).toLocaleDateString('fr-BJ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800">{e.expense_number || `SAL-${e.id?.slice(0, 6)}`}</td>
                      <td className="p-3 font-black text-slate-900">{e.beneficiary || 'Personnel'}</td>
                      <td className="p-3 text-slate-700">{e.notes || 'Rémunération / Charge salariale'}</td>
                      <td className="p-3 text-right font-mono font-black text-indigo-700">{fmt(Number(e.amount) || 0)}</td>
                    </tr>
                  ))}
                  {rentabiliteReport.listPersonnel.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Aucune charge salariale enregistrée sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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

      {/* ── CONTENU ONGLET 11.4 : RAPPORT DES SERVEUSES (RENTABILITÉ & SESSIONS) ── */}
      {activeTab === 'SERVEUSES' && (
        <div className="space-y-5 animate-fadeIn">
          {/* En-tête d'impression officiel (masqué à l'écran, visible à l'impression) */}
          <div className="hidden print:block p-4 border-b-2 border-slate-900 text-slate-900 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider">
                  {company?.name || 'STE GESTIO SARL'}
                </h1>
                <p className="text-xs font-bold text-slate-600">
                  GESTIO 229 ERP — Secteur Bar, Restaurant, Maquis & Fast-Food
                </p>
                <h2 className="text-sm font-black mt-2 text-rose-800 uppercase">
                  Rapport de Performance Commerciale & Rentabilité des Serveuses
                </h2>
              </div>
              <div className="text-right text-xs">
                <p className="font-bold">
                  Période : {periodPreset === 'select_month' ? selectedMonth : `${dateRange.start.toLocaleDateString('fr-FR')} au ${dateRange.end.toLocaleDateString('fr-FR')}`}
                </p>
                <p className="text-slate-600">
                  Serveuse : {filterServeuse === 'all' ? 'Toutes les serveuses (Consolidé)' : filterServeuse}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Édité le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>

          {/* En-tête de section & Bascule de sous-vues (Masqué à l'impression) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>💁‍♀️</span> Rapport de Rentabilité & Performance des Serveuses
                </h3>
                <p className="text-xs text-slate-500">
                  Suivi du chiffre d'affaires réel, coûts des produits vendus, marges brutes nettes et moyennes journalières
                </p>
              </div>

              {/* Bascule Sous-Vues */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setServeuseSubView('RENTABILITE')}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5',
                    serveuseSubView === 'RENTABILITE'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Rentabilité & Marges</span>
                </button>
                <button
                  type="button"
                  onClick={() => setServeuseSubView('SESSIONS_DETTES')}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5',
                    serveuseSubView === 'SESSIONS_DETTES'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  )}
                >
                  <Wine className="w-3.5 h-3.5" />
                  <span>Sessions & Dettes Bar</span>
                </button>
              </div>
            </div>

            {/* Badge d'indication du filtre actif */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
              <span className="font-bold text-slate-600">
                Filtre sélectionné : <strong className="text-rose-700 font-black">{filterServeuse === 'all' ? 'Toutes les serveuses (Vue Globale)' : `Serveuse : ${filterServeuse}`}</strong>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {activeServeusesList.length} serveuse(s) affichée(s)
              </span>
            </div>
          </div>

          {/* ── SOUS-VUE 1 : RENTABILITÉ COMMERCIALE & MARGES BRUTES (Sections 2, 3, 4) ── */}
          {serveuseSubView === 'RENTABILITE' && (
            <div className="space-y-5">
              {/* Cartes Synthétiques KPIs (Point 4) */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm bg-gradient-to-br from-indigo-50/30 to-white">
                  <p className="text-[10px] font-black text-indigo-900 uppercase tracking-wider">Chiffre d'Affaires</p>
                  <p className="text-base sm:text-lg font-black text-indigo-700 font-mono mt-1">
                    {fmt(consolidatedServeusesKPIs.totalCA)}
                  </p>
                  <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                    Net remises & retours
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm bg-gradient-to-br from-amber-50/30 to-white">
                  <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Coût des Ventes</p>
                  <p className="text-base sm:text-lg font-black text-amber-700 font-mono mt-1">
                    {fmt(consolidatedServeusesKPIs.totalCout)}
                  </p>
                  <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                    Coûts d'achat unitaires réels
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
                  <p className="text-[10px] font-black text-emerald-900 uppercase tracking-wider">Marge Brute Réalisée</p>
                  <p className="text-base sm:text-lg font-black text-emerald-700 font-mono mt-1">
                    {fmt(consolidatedServeusesKPIs.totalMarge)}
                  </p>
                  <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
                    +{consolidatedServeusesKPIs.tauxMarge}% de marge
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Nombre de Ventes</p>
                  <p className="text-base sm:text-lg font-black text-slate-900 font-mono mt-1">
                    {consolidatedServeusesKPIs.totalVentes}
                  </p>
                  <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                    Commandes / Factures
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm bg-gradient-to-br from-purple-50/30 to-white col-span-2 md:col-span-1">
                  <p className="text-[10px] font-black text-purple-900 uppercase tracking-wider">Moyenne Journalière</p>
                  <p className="text-base sm:text-lg font-black text-purple-700 font-mono mt-1">
                    {fmt(consolidatedServeusesKPIs.moyJournaliere)}
                  </p>
                  <span className="text-[10px] text-purple-600 font-bold block mt-0.5">
                    Sur {consolidatedServeusesKPIs.totalJours} jour(s) de service
                  </span>
                </div>
              </div>

              {/* Graphique Comparatif CA vs Marge Brute (Section 4) */}
              {activeServeusesList.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-rose-600" />
                        <span>Comparatif Graphique : Chiffre d'Affaires vs Coût vs Marge Brute</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Comparaison visuelle en FCFA sur la période sélectionnée
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-indigo-700">
                        <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block"></span> CA
                      </span>
                      <span className="flex items-center gap-1 text-amber-700">
                        <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block"></span> Coût
                      </span>
                      <span className="flex items-center gap-1 text-emerald-700">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block"></span> Marge
                      </span>
                    </div>
                  </div>

                  {/* Visualisation SVG adaptative */}
                  <div className="space-y-3 pt-2">
                    {activeServeusesList.map((srv, idx) => {
                      const maxVal = Math.max(...activeServeusesList.map(s => s.ca_mensuel), 1)
                      const caPercent = Math.min(100, Math.round((srv.ca_mensuel / maxVal) * 100))
                      const coutPercent = Math.min(100, Math.round((srv.cout_ventes / maxVal) * 100))
                      const margePercent = Math.min(100, Math.round((srv.marge_brute / maxVal) * 100))

                      return (
                        <div key={idx} className="p-3 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-slate-800 flex items-center gap-1.5">
                              <span>💁‍♀️</span> {srv.nom}
                              {srv.has_open_session && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">
                                  🟢 Session active
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-slate-500">
                              {srv.nb_ventes} vente(s) • {srv.jours_service} j. service
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {/* Barre CA */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="w-12 text-slate-500 font-bold">CA :</span>
                              <div className="flex-1 bg-slate-200/70 h-4 rounded-lg overflow-hidden flex">
                                <div
                                  style={{ width: `${Math.max(4, caPercent)}%` }}
                                  className="bg-indigo-600 h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-1 text-[9px] font-black text-white font-mono"
                                >
                                  {srv.ca_mensuel > 0 && caPercent > 15 ? fmt(srv.ca_mensuel) : ''}
                                </div>
                              </div>
                              <span className="w-24 text-right font-mono font-black text-indigo-700">
                                {fmt(srv.ca_mensuel)}
                              </span>
                            </div>

                            {/* Barre Coût */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="w-12 text-slate-500 font-bold">Coût :</span>
                              <div className="flex-1 bg-slate-200/70 h-3 rounded-lg overflow-hidden flex">
                                <div
                                  style={{ width: `${Math.max(4, coutPercent)}%` }}
                                  className="bg-amber-500 h-full rounded-lg transition-all duration-500"
                                ></div>
                              </div>
                              <span className="w-24 text-right font-mono font-bold text-amber-700">
                                {fmt(srv.cout_ventes)}
                              </span>
                            </div>

                            {/* Barre Marge */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="w-12 text-slate-500 font-bold">Marge :</span>
                              <div className="flex-1 bg-slate-200/70 h-3 rounded-lg overflow-hidden flex">
                                <div
                                  style={{ width: `${Math.max(4, margePercent)}%` }}
                                  className="bg-emerald-600 h-full rounded-lg transition-all duration-500"
                                ></div>
                              </div>
                              <span className="w-24 text-right font-mono font-black text-emerald-700">
                                {fmt(srv.marge_brute)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tableau Comparatif Formel (Section 4) */}
              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                      Tableau Comparatif des Performances Commerciales & Marges
                    </h3>
                    <p className="text-xs text-slate-500">
                      Montants consolidés en F CFA, calculés à partir des coûts d'achat et ventes effectives
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-700">
                    {activeServeusesList.length} serveuse(s)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="p-3">Serveuse</th>
                        <th className="p-3 text-center">Nb Ventes</th>
                        <th className="p-3 text-right">CA Mensuel</th>
                        <th className="p-3 text-right">Coût des Ventes</th>
                        <th className="p-3 text-right">Marge Brute</th>
                        <th className="p-3 text-center">Taux Marge</th>
                        <th className="p-3 text-center">Jours Service</th>
                        <th className="p-3 text-right">Moyenne / Jour</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeServeusesList.map((srv, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 transition">
                          <td className="p-3 font-black text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>💁‍♀️</span>
                              <span className="text-sm">{srv.nom}</span>
                              {srv.has_open_session && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold ml-1">
                                  Session active
                                </span>
                              )}
                            </div>
                            {srv.matricule && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {srv.matricule}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-800">
                            {srv.nb_ventes}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-indigo-700">
                            {fmt(srv.ca_mensuel)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-amber-700">
                            {fmt(srv.cout_ventes)}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-emerald-600">
                            {fmt(srv.marge_brute)}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-blue-600">
                            +{srv.taux_marge}%
                          </td>
                          <td className="p-3 text-center font-mono text-slate-700">
                            {srv.jours_service} j
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-purple-700">
                            {fmt(srv.moyenne_journaliere)}
                          </td>
                        </tr>
                      ))}

                      {activeServeusesList.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            Aucune vente serveuse enregistrée sur la période sélectionnée.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    {/* Ligne TOTAL consolidée (Section 4) */}
                    {activeServeusesList.length > 0 && (
                      <tfoot className="bg-slate-900 text-white font-black border-t-2 border-slate-950">
                        <tr>
                          <td className="p-3 font-black uppercase text-xs tracking-wider">
                            TOTAL CONSOLIDÉ
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            {consolidatedServeusesKPIs.totalVentes}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-indigo-300">
                            {fmt(consolidatedServeusesKPIs.totalCA)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-amber-300">
                            {fmt(consolidatedServeusesKPIs.totalCout)}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-emerald-400">
                            {fmt(consolidatedServeusesKPIs.totalMarge)}
                          </td>
                          <td className="p-3 text-center font-mono text-blue-300">
                            +{consolidatedServeusesKPIs.tauxMarge}%
                          </td>
                          <td className="p-3 text-center font-mono">
                            {consolidatedServeusesKPIs.totalJours} j
                          </td>
                          <td className="p-3 text-right font-mono text-purple-300">
                            {fmt(consolidatedServeusesKPIs.moyJournaliere)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* ── POINT 8 : FICHE DÉTAILLÉE DE RENTABILITÉ & VENTES DE LA SERVEUSE SÉLECTIONNÉE ── */}
              {filterServeuse !== 'all' && activeServeusesList.length > 0 && (() => {
                const srv = activeServeusesList[0]
                const totalCa = srv.ca_mensuel || (srv.ventes_bar + srv.ventes_cuisine)
                const ecart = srv.ecarts_cloture || 0

                return (
                  <div className="space-y-6 animate-fadeIn">
                    {/* En-tête imprimable et écran de la serveuse */}
                    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">💁‍♀️</span>
                            <h3 className="text-lg font-black text-white">
                              Fiche Individuelle de Service • {srv.nom}
                            </h3>
                            {srv.has_open_session && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                🟢 Session Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Période : {periodPreset === 'select_month' ? selectedMonth : (dateRange.start.toLocaleDateString('fr-FR') + ' au ' + dateRange.end.toLocaleDateString('fr-FR'))}
                            {srv.matricule && <span className="ml-2 font-mono">({srv.matricule})</span>}
                          </p>
                        </div>

                        {/* Bouton Impression Rapport Individuel */}
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-md flex items-center gap-2 transition print:hidden"
                        >
                          <Printer className="w-4 h-4" />
                          <span>Imprimer ce Rapport Serveuse</span>
                        </button>
                      </div>

                      {/* 5 Indicateurs Financiers Clés (Point 8) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                          <p className="text-[10px] uppercase font-bold text-blue-300">🍷 CA Ventes BAR</p>
                          <p className="text-base font-black font-mono text-white mt-1">{fmt(srv.ventes_bar)}</p>
                          <span className="text-[9px] text-blue-200">Boissons du bar</span>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                          <p className="text-[10px] uppercase font-bold text-orange-300">🍽️ CA RESTAURANT</p>
                          <p className="text-base font-black font-mono text-white mt-1">{fmt(srv.ventes_cuisine)}</p>
                          <span className="text-[9px] text-orange-200">Plats cuisine / maquis</span>
                        </div>

                        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 border border-white/20">
                          <p className="text-[10px] uppercase font-bold text-emerald-300">💰 CA Total Réalisé</p>
                          <p className="text-base font-black font-mono text-emerald-400 mt-1">{fmt(totalCa)}</p>
                          <span className="text-[9px] text-emerald-200 font-bold">BAR + RESTAURANT</span>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                          <p className="text-[10px] uppercase font-bold text-amber-300">🏦 Versé en Caisse</p>
                          <p className="text-base font-black font-mono text-amber-300 mt-1">{fmt(srv.montant_verse_total)}</p>
                          <span className="text-[9px] text-slate-300">Versement de clôture</span>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 col-span-2 sm:col-span-1">
                          <p className="text-[10px] uppercase font-bold text-purple-300">⚖️ Écart de Clôture</p>
                          <p className={clsx('text-base font-black font-mono mt-1', ecart === 0 ? 'text-emerald-400' : ecart < 0 ? 'text-rose-400' : 'text-amber-400')}>
                            {fmt(ecart)}
                          </p>
                          <span className="text-[9px] font-bold">
                            {ecart === 0 ? '✓ Soldé / Juste' : ecart < 0 ? '⚠️ Manquant constaté' : 'ℹ️ Excédent'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Grille des 2 Tableaux : Produits BAR & Plats RESTAURANT vendus */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* TABLEAU SECTION 1 : VENTES BAR */}
                      <div className="bg-white rounded-3xl border border-blue-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-blue-50/70 p-4 border-b border-blue-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                              🍷
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-blue-950 uppercase tracking-wider">
                                Section 1 • Produits BAR Vendus
                              </h4>
                              <p className="text-[10px] text-blue-700">
                                Boissons déstockées du stock bar
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-black text-blue-800 bg-blue-100 px-2.5 py-1 rounded-xl">
                            {fmt(srv.ventes_bar)}
                          </span>
                        </div>

                        <div className="p-4 flex-1 overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Produit (Boisson)</th>
                                <th className="p-2.5 text-center">Quantité</th>
                                <th className="p-2.5 text-right">P.U. Moyen</th>
                                <th className="p-2.5 text-right">Total BAR TTC</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(srv.produits_bar_list || []).map((p: any, idx: number) => {
                                const pu = p.quantite > 0 ? Math.round(p.montant_total / p.quantite) : (p.prix_unitaire || 0)
                                return (
                                  <tr key={idx} className="hover:bg-blue-50/30">
                                    <td className="p-2.5 font-bold text-slate-900">{p.nom}</td>
                                    <td className="p-2.5 text-center font-mono font-black text-blue-700">{p.quantite}</td>
                                    <td className="p-2.5 text-right font-mono text-slate-600">{fmt(pu)}</td>
                                    <td className="p-2.5 text-right font-mono font-black text-blue-900">{fmt(p.montant_total)}</td>
                                  </tr>
                                )
                              })}
                              {(!srv.produits_bar_list || srv.produits_bar_list.length === 0) && (
                                <tr>
                                  <td colSpan={4} className="p-6 text-center text-slate-400">
                                    Aucune vente BAR enregistrée pour cette serveuse sur la période.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            {(srv.produits_bar_list && srv.produits_bar_list.length > 0) && (
                              <tfoot className="bg-blue-50/50 font-black border-t border-blue-200 text-blue-950">
                                <tr>
                                  <td className="p-2.5 uppercase text-[10px]">TOTAL SECTION BAR</td>
                                  <td className="p-2.5 text-center font-mono">
                                    {srv.produits_bar_list.reduce((acc: number, x: any) => acc + x.quantite, 0)}
                                  </td>
                                  <td className="p-2.5 text-right font-mono">-</td>
                                  <td className="p-2.5 text-right font-mono font-black text-blue-800">
                                    {fmt(srv.ventes_bar)}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>

                      {/* TABLEAU SECTION 2 : VENTES RESTAURANT */}
                      <div className="bg-white rounded-3xl border border-orange-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-orange-50/70 p-4 border-b border-orange-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold">
                              🍽️
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-orange-950 uppercase tracking-wider">
                                Section 2 • Plats RESTAURANT / MAQUIS
                              </h4>
                              <p className="text-[10px] text-orange-700">
                                Plats et recettes avec fiches techniques cuisine
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-black text-orange-800 bg-orange-100 px-2.5 py-1 rounded-xl">
                            {fmt(srv.ventes_cuisine)}
                          </span>
                        </div>

                        <div className="p-4 flex-1 overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Plat / Recette</th>
                                <th className="p-2.5 text-center">Quantité</th>
                                <th className="p-2.5 text-right">P.U. Moyen</th>
                                <th className="p-2.5 text-right">Total RESTO TTC</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(srv.plats_restaurant_list || []).map((p: any, idx: number) => {
                                const pu = p.quantite > 0 ? Math.round(p.montant_total / p.quantite) : (p.prix_unitaire || 0)
                                return (
                                  <tr key={idx} className="hover:bg-orange-50/30">
                                    <td className="p-2.5 font-bold text-slate-900">{p.nom}</td>
                                    <td className="p-2.5 text-center font-mono font-black text-orange-700">{p.quantite}</td>
                                    <td className="p-2.5 text-right font-mono text-slate-600">{fmt(pu)}</td>
                                    <td className="p-2.5 text-right font-mono font-black text-orange-900">{fmt(p.montant_total)}</td>
                                  </tr>
                                )
                              })}
                              {(!srv.plats_restaurant_list || srv.plats_restaurant_list.length === 0) && (
                                <tr>
                                  <td colSpan={4} className="p-6 text-center text-slate-400">
                                    Aucune vente RESTAURANT enregistrée pour cette serveuse sur la période.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            {(srv.plats_restaurant_list && srv.plats_restaurant_list.length > 0) && (
                              <tfoot className="bg-orange-50/50 font-black border-t border-orange-200 text-orange-950">
                                <tr>
                                  <td className="p-2.5 uppercase text-[10px]">TOTAL SECTION RESTAURANT</td>
                                  <td className="p-2.5 text-center font-mono">
                                    {srv.plats_restaurant_list.reduce((acc: number, x: any) => acc + x.quantite, 0)}
                                  </td>
                                  <td className="p-2.5 text-right font-mono">-</td>
                                  <td className="p-2.5 text-right font-mono font-black text-orange-800">
                                    {fmt(srv.ventes_cuisine)}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Journal des Factures & Ventes de la serveuse (Conservé et fiabilisé) */}
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-rose-600" />
                            <span>Journal des Factures & Ventes de {srv.nom}</span>
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Historique chronologique des transactions attribuées
                          </p>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 font-bold bg-slate-100 px-3 py-1 rounded-xl">
                          {srv.sales_detail.length} facture(s)
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="p-2.5">Réf Facture</th>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5">Client / Table</th>
                              <th className="p-2.5 text-right">Total TTC</th>
                              <th className="p-2.5 text-right">Coût Achat</th>
                              <th className="p-2.5 text-right">Marge Nette</th>
                              <th className="p-2.5 text-center">Règlement</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {srv.sales_detail.map((sale: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-2.5 font-mono font-bold text-slate-900">{sale.order_number}</td>
                                <td className="p-2.5 font-mono text-slate-600">{sale.date || sale.created_at?.slice(0, 10)}</td>
                                <td className="p-2.5 text-slate-700">{sale.customer_name}</td>
                                <td className="p-2.5 text-right font-mono font-black text-indigo-700">{fmt(sale.total_amount)}</td>
                                <td className="p-2.5 text-right font-mono text-amber-700">{fmt(sale.total_cost)}</td>
                                <td className="p-2.5 text-right font-mono font-bold text-emerald-600">{fmt(sale.marge)}</td>
                                <td className="p-2.5 text-center font-mono text-[10px] uppercase font-bold text-slate-600">
                                  {sale.payment_method}
                                </td>
                              </tr>
                            ))}
                            {srv.sales_detail.length === 0 && (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-400">
                                  Aucune facture détaillée trouvée pour {srv.nom} sur cette période.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── SOUS-VUE 2 : SESSIONS DE SERVICE, CRÉANCES & BOUTEILLES (Existante préservée) ── */}
          {serveuseSubView === 'SESSIONS_DETTES' && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5 animate-fadeIn">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Suivi Opérationnel des Sessions Bar, Versements & Bouteilles Consignées
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ventes BAR et CUISINE imputées, Encaissements reçus, Créances restantes et Contenants consignés
                  </p>
                </div>
                <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-700">
                  {serveusesReport.length} serveuse(s)
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
                        <td className="p-3 text-right font-mono font-black text-slate-900">{fmt(s.ca_mensuel)}</td>
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

          {/* Bloc de signature officiel pour l'impression (Section 6) */}
          <div className="hidden print:grid grid-cols-2 gap-8 pt-10 mt-8 border-t border-slate-400 text-xs text-slate-800">
            <div>
              <p className="font-black uppercase mb-12">Le Responsable de Caisse / Point de Vente</p>
              <p className="text-[10px] text-slate-500 font-mono">Date et Signature précédées de la mention "Certifié conforme"</p>
            </div>
            <div className="text-right">
              <p className="font-black uppercase mb-12">La Direction / Gérance de l'Établissement</p>
              <p className="text-[10px] text-slate-500 font-mono">Visa & Cachet</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RestaurantReportingPage
