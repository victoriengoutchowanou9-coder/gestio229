// =============================================================================
// GESTIO 229 SaaS — Rapport et Analyse Métier (Bénin & UEMOA)
// =============================================================================
// Calculs rigoureux basés exclusivement sur les données réelles
// CA, Marge brute (HT), Marge nette, Total créances, Total stock, Dépenses
// Filtre de période complet (Aujourd'hui, Hier, Semaine, Mois, Personnalisé)
// Fuseau horaire Africa/Porto-Novo (Bénin UTC+1)
// Marge par produit détaillée avec réconciliation stricte
// Traçabilité totale : clic sur chaque indicateur pour consulter le détail
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  RefreshCw, Calendar, Printer, Filter, Users, Package,
  CreditCard, Smartphone, CheckCircle2, ShoppingBag, PieChart,
  ArrowRight, FileText, Layers, Eye, Fuel
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector } from '../../../lib/sectorClient'
import { calculateTaxFromTTC } from '../../../utils/tax'
import { getAllAvoirs, FactureAvoirRecord } from '../../../services/factureAvoirService'
import { calculateStockValuation } from '../../../lib/stockCalcul'
import { computeOrderMargin, computeConsolidatedFinancials, isTrueOperatingExpense } from '../../../lib/financialCalcul'
import { extractCotonouDate, getCotonouDates } from '../../../services/hubFinancialService'
import { FinancialDetailModal, FinancialDetailType } from '../../../components/modals/FinancialDetailModal'
import { StationFuelProfitabilityReport } from '../../../components/station/StationFuelProfitabilityReport'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface SaleRecord {
  id: string
  order_number: string
  order_date?: string
  created_at: string
  total_amount: number
  subtotal_ht: number
  total_ht: number
  total_tax: number
  payment_method: string
  customer_name?: string
  customer_id?: string
  status?: string
  lines?: any[]
  total_cost?: number
  gross_margin?: number
  notes?: any
}

interface ExpenseRecord {
  id: string
  reference?: string
  expense_date: string
  amount: number
  category: string
  description?: string
  title?: string
  payment_method?: string
  caisse_name?: string
  status?: string
  created_by_name?: string
  created_at?: string
  source?: 'expenses' | 'caisse_mouvements'
}

interface CustomerRecord {
  id: string
  name: string
  code?: string
  phone?: string
  current_debt: number
  solde_creance?: number
}

interface ProductRecord {
  id: string
  name: string
  code?: string
  category?: string
  current_stock?: number
  warehouse_stock?: number
  cost_price?: number
  purchase_price?: number
  selling_price?: number
  selling_price_ttc?: number
  unit_price_ttc?: number
  coef?: number
  sector_meta?: Record<string, any>
}

export const ReportingPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  // Filtre Période Exigé : Aujourd'hui | Hier | Cette semaine | Ce mois | Période personnalisée
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  // Filtres additionnels
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all')
  const [stationTab, setStationTab] = useState<'carburants' | 'general'>('carburants')
  const [loading, setLoading] = useState(true)

  // Modale de traçabilité et justification des indicateurs (Point 7)
  const [activeModalType, setActiveModalType] = useState<FinancialDetailType | null>(null)

  // Données réelles
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [avoirs, setAvoirs] = useState<FactureAvoirRecord[]>([])

  // Charger toutes les données métier réelles du tenant
  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [
        { data: salesData, error: salesErr },
        { data: expData, error: expErr },
        { data: custData, error: custErr },
        { data: prodData, error: prodErr }
      ] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('id, order_number, order_date, created_at, total_amount, subtotal_ht, total_cost, tva_amount, aib_amount, status, payment_status, payment_method, sector_slug, notes, customer_name, customer:customers(id, name)')
          .eq('company_id', company.id)
          .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('expenses')
          .select('id, expense_number, title, beneficiary, notes, category, amount, payment_method, expense_date, created_at, sector_slug, sector_meta')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('customers')
          .select('id, name, code, phone, current_debt, is_active, sector_slug, sector_meta')
          .eq('company_id', company.id)
          .neq('is_active', false)
          .limit(500),
        supabase
          .from('products')
          .select('id, name, code, selling_price, cost_price, is_active, sector_meta, category_id, sector_slug, secteur_slug, stock_magasin, stock_vente, ucd, uv, coef, coefficient_conversion, cout_achat, prix_vente, min_stock_alert, tva_rate')
          .eq('company_id', company.id)
          .neq('is_active', false)
          .limit(500)
      ])

      if (salesErr) console.warn('Erreur chargement ventes:', salesErr)
      if (expErr) console.warn('Erreur chargement dépenses:', expErr)

      // Isolation stricte par sous-logiciel (aucun mélange inter-secteurs) + exclusion des produits archivés/supprimés
      const sectorSales = filterItemsForSector(salesData || [], currentSectorSlug)
      const sectorExpenses = filterItemsForSector(expData || [], currentSectorSlug)
      const sectorCustomers = filterItemsForSector(custData || [], currentSectorSlug).filter(
        (c: any) => c.is_active !== false
      )
      const sectorProducts = filterItemsForSector(prodData || [], currentSectorSlug).filter(
        (p: any) =>
          p.is_active !== false &&
          !p.deleted_at &&
          !p.sector_meta?.deleted_at &&
          !p.sector_meta?.is_archived
      )

      // Lecture des dépenses de caisse enregistrées dans caisse_mouvements
      let caisseDepensesData: any[] = []
      try {
        const caisseQuery = supabase
          .from('caisse_mouvements')
          .select('id, montant, created_at, sector_slug, secteur_slug, sens, type, motif, user_name, caisse_id, source_id, source_module')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false })
          .limit(500)

        const { data: cData } = currentSectorSlug
          ? await caisseQuery.or(`sector_slug.eq.${currentSectorSlug},secteur_slug.eq.${currentSectorSlug}`)
          : await caisseQuery

        caisseDepensesData = cData || []
      } catch (cErr) {
        console.warn('[ReportingPage] Erreur lecture caisse_mouvements:', cErr)
      }

      // Parser les ventes avec précision HT/TTC (Bénin & UEMOA)
      const parsedSales: SaleRecord[] = sectorSales.map((s: any) => {
        let meta: any = {}
        if (s.notes) {
          try {
            meta = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          } catch (e) {}
        }
        if (s.e_mecef_uid) {
          try {
            if (s.e_mecef_uid.startsWith('{')) meta = { ...meta, ...JSON.parse(s.e_mecef_uid) }
            else {
              s.e_mecef_uid.split('|').forEach((p: string) => {
                const [k, v] = p.split(':')
                if (k === 'PAY') meta.pm = v
                if (k === 'CL') meta.cn = v
                if (k === 'ST') meta.st = v
              })
            }
          } catch (e) {}
        }

        const pm = meta.pm || s.payment_method || (s.payment_status === 'credit' ? 'credit' : (s.payment_status || 'especes'))
        const cName = s.customer?.name || s.customer_name || meta.customer_name || meta.cn || 'Client Comptoir'
        const totalAmount = Number(s.total_amount) || 0
        const taxAmount = Number(s.tva_amount) || 0

        // Si subtotal_ht > 0, on l'utilise directement
        // Si la vente est exonérée de TVA (taxAmount === 0), subtotal_ht = total_amount
        // Sinon (soumis à 18%), HT = total_amount / 1.18
        const subtotalHT = Number(s.subtotal_ht) > 0
          ? Number(s.subtotal_ht)
          : (taxAmount === 0 ? totalAmount : Math.round((totalAmount / 1.18) * 100) / 100)

        const linesList = (Array.isArray(s.items) && s.items.length > 0)
          ? s.items
          : (Array.isArray(meta?.lines) ? meta.lines : [])

        return {
          id: s.id,
          order_number: s.order_number,
          order_date: s.order_date,
          created_at: s.created_at,
          total_amount: totalAmount,
          subtotal_ht: subtotalHT,
          total_ht: subtotalHT,
          total_tax: taxAmount,
          payment_method: pm,
          customer_name: cName,
          customer_id: s.customer_id,
          status: s.status || meta.st || 'COMPLET',
          lines: linesList,
          total_cost: Number(s.total_cost) || 0,
          gross_margin: typeof s.gross_margin === 'number' ? s.gross_margin : undefined,
          notes: s.notes
        }
      })

      // Unifier et assainir les dépenses d'exploitation
      const unifiedExpenses: ExpenseRecord[] = [];
      const processedExpenseIds = new Set<string>();

      // 1. Ajouter depuis la table expenses
      const rawSectorExpenses = sectorExpenses || [];
      rawSectorExpenses.forEach((e: any) => {
        processedExpenseIds.add(String(e.id));
        unifiedExpenses.push({
          id: e.id,
          reference: e.expense_number || e.reference_number || `DEP-${e.id.slice(0, 6)}`,
          expense_date: e.expense_date || e.created_at,
          amount: Number(e.amount) || 0,
          category: e.category || 'Autres charges',
          description: e.notes || e.description || e.title || e.beneficiary,
          title: e.title || e.beneficiary,
          payment_method: e.payment_method || 'Espèces',
          caisse_name: 'Caisse principale',
          status: 'Validé',
          created_by_name: 'Utilisateur',
          created_at: e.created_at,
          source: 'expenses'
        });
      });

      // 2. Ajouter depuis caisse_mouvements uniquement les véritables charges d'exploitation non déjà présentes dans expenses
      const rawCaisseDepenses = caisseDepensesData || [];
      rawCaisseDepenses.forEach((m: any) => {
        if (m.source_id && processedExpenseIds.has(String(m.source_id))) return;
        if (processedExpenseIds.has(String(m.id))) return;

        const mType = String(m.type || '').toLowerCase().trim()
        const mSens = String(m.sens || '').toLowerCase().trim()
        const mMotif = String(m.motif || m.description || '').toLowerCase().trim()

        // EXCLUSION STRICTE : Ne JAMAIS compter clôtures, ouvertures, transferts, règlements de stock
        const isExcluded =
          mType === 'cloture' || mType === 'clôture' ||
          mType === 'ouverture' ||
          mType === 'transfert' ||
          mType === 'vente' ||
          mType === 'reglement_client' ||
          mMotif.includes('cloture') || mMotif.includes('clôture') ||
          mMotif.includes('transfert') ||
          mMotif.includes('ouverture')

        if (isExcluded) return

        const isTrueDepense =
          mType === 'depense' || mType === 'expense' ||
          m.source_module === 'depenses' ||
          (mSens === 'sortie' && mType === 'depense')

        if (!isTrueDepense) return

        const mAmount = Number(m.montant) || 0
        const mDay = extractCotonouDate(null, m.created_at)
        const alreadyInExpenses = unifiedExpenses.some((ue) => {
          if (ue.source !== 'expenses') return false
          const ueDay = extractCotonouDate(ue.expense_date, ue.created_at)
          return ueDay === mDay && Math.abs(ue.amount - mAmount) < 1
        })
        if (alreadyInExpenses) return

        processedExpenseIds.add(String(m.id))

        let cat = 'Autres charges'
        const matchCat = m.motif ? m.motif.match(/\(([^)]+)\)$/) : null
        if (matchCat && matchCat[1]) {
          cat = matchCat[1]
        } else if (m.motif) {
          cat = m.motif.replace(/^Dépense:\s*/i, '')
        }

        unifiedExpenses.push({
          id: m.id,
          reference: `CAISSE-${m.id.slice(0, 6)}`,
          expense_date: m.created_at,
          amount: Number(m.montant) || 0,
          category: cat,
          description: m.motif,
          payment_method: 'Espèces',
          caisse_name: 'Tiroir caisse',
          status: 'Validé',
          created_by_name: m.user_name || 'Caissier',
          created_at: m.created_at,
          source: 'caisse_mouvements'
        })
      })

      setSales(parsedSales)
      setExpenses(unifiedExpenses)
      setCustomers((sectorCustomers as any) || [])
      setProducts((sectorProducts as any) || [])

      try {
        const allAvoirs = await getAllAvoirs(company.id, currentSectorSlug)
        setAvoirs(Array.isArray(allAvoirs) ? allAvoirs : [])
      } catch (avErr) {
        console.warn('[ReportingPage] Avoirs non disponibles ou erreur:', avErr)
        setAvoirs([])
      }
    } catch (err: any) {
      toast.error('Erreur chargement rapports', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, currentSectorSlug, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Calcul de la Plage de Dates Réelle selon fuseau horaire Cotonou (UTC+1) ─
  const { dateRangeStart, dateRangeEnd } = useMemo(() => {
    const { todayStr, monthStartStr } = getCotonouDates()

    if (periodPreset === 'today') {
      return { dateRangeStart: todayStr, dateRangeEnd: todayStr }
    }
    if (periodPreset === 'yesterday') {
      const now = new Date()
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayStr = extractCotonouDate(null, y.toISOString())
      return { dateRangeStart: yesterdayStr, dateRangeEnd: yesterdayStr }
    }
    if (periodPreset === 'week') {
      const now = new Date()
      const w = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const weekStartStr = extractCotonouDate(null, w.toISOString())
      return { dateRangeStart: weekStartStr, dateRangeEnd: todayStr }
    }
    if (periodPreset === 'month') {
      return { dateRangeStart: monthStartStr, dateRangeEnd: todayStr }
    }
    // Custom
    return { dateRangeStart: customStartDate, dateRangeEnd: customEndDate }
  }, [periodPreset, customStartDate, customEndDate])

  // ─── Ventes Filtrées par Période (Heure locale Cotonou) ───────────────────
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const sDate = extractCotonouDate(s.order_date, s.created_at)
      if (dateRangeStart && sDate < dateRangeStart) return false
      if (dateRangeEnd && sDate > dateRangeEnd) return false
      if (selectedPaymentMethod !== 'all' && s.payment_method !== selectedPaymentMethod) return false
      return true
    })
  }, [sales, dateRangeStart, dateRangeEnd, selectedPaymentMethod])

  // ─── Dépenses Filtrées par Période (Strictement respecté, zéro absorption historique)
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const eDate = extractCotonouDate(e.expense_date, e.created_at)
      if (dateRangeStart && eDate < dateRangeStart) return false
      if (dateRangeEnd && eDate > dateRangeEnd) return false
      return true
    })
  }, [expenses, dateRangeStart, dateRangeEnd])

  // ─── Avoirs Filtrés par Période ───────────────────────────────────────────
  const filteredAvoirs = useMemo(() => {
    return (avoirs || []).filter((a) => {
      if (a?.statut === 'annule') return false
      const aDate = extractCotonouDate(a?.date_avoir, a?.created_at)
      if (dateRangeStart && aDate < dateRangeStart) return false
      if (dateRangeEnd && aDate > dateRangeEnd) return false
      return true
    })
  }, [avoirs, dateRangeStart, dateRangeEnd])

  const totalAvoirsValides = useMemo(() => {
    return (filteredAvoirs || []).reduce((sum, a) => sum + (Number(a?.montant_total_avoir) || 0), 0)
  }, [filteredAvoirs])

  // ─── Indicateurs Financiers Certifiés OHADA ───────────────────────────────

  // 1. Chiffre d'Affaires Réel Brut et Net
  const totalRevenue = useMemo(() => {
    return (filteredSales || []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [filteredSales])

  const totalRevenueBrut = totalRevenue
  const totalRevenueNet = Math.max(0, totalRevenue - totalAvoirsValides)

  // 2. Total des Dépenses Réelles Décaissées (Strictement 0 si aucune dépense dans la période)
  const totalExpenses = useMemo(() => {
    return (filteredExpenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  }, [filteredExpenses])

  // 3. Calculs financiers certifiés OHADA via le moteur unique lib/financialCalcul.ts
  const financialSummary = useMemo(() => {
    return computeConsolidatedFinancials({
      sales: filteredSales as any[],
      expenses: filteredExpenses as any[], // Passage strict des dépenses filtrées de la période
      avoirs: filteredAvoirs as any[],
      sectorSlug: currentSectorSlug
    })
  }, [filteredSales, filteredExpenses, filteredAvoirs, currentSectorSlug])

  const totalRevenueHT = financialSummary.netRevenueHT
  const totalCogsHT = financialSummary.cogsHT
  const grossMargin = financialSummary.grossMargin
  const netMargin = financialSummary.netMargin

  // 4. Total Créances Réelles Non Soldées
  const totalReceivables = useMemo(() => {
    return (customers || []).reduce((sum, c: any) => sum + (Number(c.current_debt ?? c.solde_creance ?? 0)), 0)
  }, [customers])

  // 5. Total Stock Réel Valorisé (Source unique de calcul lib/stockCalcul.ts)
  const stockValuation = useMemo(() => {
    return calculateStockValuation(products || [])
  }, [products])
  const totalStockValue = stockValuation.totalStockValAchat

  // ─── Table Marge par Produit (Réconciliation Totale avec la Marge Brute) ────
  const productMargins = useMemo(() => {
    return products.map((prod: any) => {
      const meta = prod.sector_meta || {}
      const defaultSell = Number(prod.selling_price || prod.selling_price_ttc || prod.unit_price_ttc || meta.price_vente_uv_ttc || 0)
      const coef = Number(meta.coef || prod.coef || 1)
      const isTaxed = Boolean(prod.is_vat_subject ?? (Number(prod.tva_rate || prod.vat_rate) > 0))
      const vatRate = isTaxed ? Number(prod.tva_rate || prod.vat_rate || 18) : 0

      // Coût d'achat unitaire de référence par UV
      let rawCost = Number(prod.cost_price || prod.purchase_price || meta.price_achat_ht || 0)
      let costPriceUv = coef > 1 ? (rawCost / coef) : rawCost

      let realQtySold = 0
      let realCaHT = 0
      let realCogsHT = 0

      filteredSales.forEach((s) => {
        if (s.lines && Array.isArray(s.lines)) {
          s.lines.forEach((l: any) => {
            if (l.product_id === prod.id || l.product?.id === prod.id || l.product_name === prod.name) {
              const q = Number(l.quantity ?? l.qty) || 0
              realQtySold += q

              const unitPrice = Number(l.unit_price || l.unitPrice || defaultSell)
              const lineRevenueTTC = Number(l.total_ttc ?? (q * unitPrice))
              const lineRevenueHT = isTaxed ? (lineRevenueTTC / (1 + vatRate / 100)) : lineRevenueTTC
              realCaHT += lineRevenueHT

              const lineUnitCost = Number(l.unit_cost) > 0 ? Number(l.unit_cost) : costPriceUv
              const lineCogsHT = isTaxed ? (q * lineUnitCost / (1 + vatRate / 100)) : (q * lineUnitCost)
              realCogsHT += lineCogsHT
            }
          })
        }
      })

      // Déduction des retours/avoirs pour ce produit
      let qtyAvoiree = 0
      let avoirsCaHT = 0
      let avoirsCogsHT = 0

      filteredAvoirs.forEach((av: any) => {
        const lignes = Array.isArray(av.lignes) ? av.lignes : []
        lignes.forEach((al: any) => {
          if (al.article_id === prod.id || al.article_nom === prod.name) {
            const qAv = Number(al.qte_retournee || 0)
            qtyAvoiree += qAv
            const avTTC = Number(al.montant_total || (qAv * defaultSell))
            const avHT = isTaxed ? (avTTC / (1 + vatRate / 100)) : avTTC
            avoirsCaHT += avHT
            const avCogs = qAv * (Number(al.prix_achat_unitaire || costPriceUv))
            avoirsCogsHT += avCogs
          }
        })
      })

      const netQtySold = Math.max(0, realQtySold - qtyAvoiree)
      const netCaHT = Math.max(0, Math.round((realCaHT - avoirsCaHT) * 100) / 100)
      const netCogsHT = Math.max(0, Math.round((realCogsHT - avoirsCogsHT) * 100) / 100)
      const netMargin = Math.round((netCaHT - netCogsHT) * 100) / 100

      const marginRate = netCaHT > 0
        ? ((netMargin / netCaHT) * 100).toFixed(1)
        : (netMargin > 0 ? '100.0' : '0.0')

      return {
        id: prod.id,
        name: prod.name,
        category: prod.category || 'Général',
        costPrice: Math.round(costPriceUv * 100) / 100,
        sellingPrice: defaultSell,
        qtySold: realQtySold,
        qtyAvoiree,
        netQtySold,
        netCaHT,
        netCogsHT,
        netMargin,
        marginRate
      }
    }).filter((p: any) => p.qtySold > 0 || products.length <= 25)
  }, [products, filteredSales, filteredAvoirs])

  const periodDisplayLabel = useMemo(() => {
    if (periodPreset === 'today') return "Aujourd'hui"
    if (periodPreset === 'yesterday') return 'Hier'
    if (periodPreset === 'week') return 'Cette Semaine (7 jours)'
    if (periodPreset === 'month') return 'Ce Mois en cours'
    return `Du ${dateRangeStart || 'début'} au ${dateRangeEnd || 'ce jour'}`
  }, [periodPreset, dateRangeStart, dateRangeEnd])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête du Rapport ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Rapports & Analyses Financières
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Indicateurs consolidés pour {company?.name || 'votre établissement'} — Période :{' '}
            <strong className="text-slate-800">{periodDisplayLabel}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer Rapport</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Sélecteur Métier Dédié Station-Service ───────────────────────────── */}
      {(currentSectorSlug === 'station-service' || (company as any)?.active_sector === 'station-service') && (
        <div className="flex border-b border-slate-200 gap-2 overflow-x-auto bg-white p-2 rounded-2xl shadow-sm">
          <button
            onClick={() => setStationTab('carburants')}
            className={`px-5 py-3 text-xs font-black rounded-xl transition flex items-center gap-2 ${
              stationTab === 'carburants'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Fuel className="w-4 h-4" /> Rentabilité des Carburants (Super, Gasoil, Pétrole)
          </button>
          <button
            onClick={() => setStationTab('general')}
            className={`px-5 py-3 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
              stationTab === 'general'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Ventes Générales & Lubrifiants
          </button>
        </div>
      )}

      {(currentSectorSlug === 'station-service' || (company as any)?.active_sector === 'station-service') && stationTab === 'carburants' ? (
        <StationFuelProfitabilityReport companyId={company?.id || ''} company={company} />
      ) : (
        <>
          {/* ── Filtres de Période Complets ──────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            Sélection de la Période d'Analyse
          </span>
          <span className="text-xs text-slate-400">Recalcul immédiat et strict des marges & totaux</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'today', label: "Aujourd'hui" },
            { id: 'yesterday', label: 'Hier' },
            { id: 'week', label: 'Cette semaine' },
            { id: 'month', label: 'Ce mois' },
            { id: 'custom', label: 'Période personnalisée' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriodPreset(item.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                periodPreset === item.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Champs Période Personnalisée */}
        {periodPreset === 'custom' && (
          <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Du (Date de début)</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Au (Date de fin)</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 6 Indicateurs Majeurs Cliquables avec Traçabilité Totale (Point 7) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Indicateur Spécial : Avoirs Validés */}
        <div
          onClick={() => setActiveModalType('avoirs')}
          className="bg-white rounded-3xl border border-rose-200 p-5 shadow-sm cursor-pointer hover:border-rose-400 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-rose-700">Avoirs Validés (Déduits)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              -
            </div>
          </div>
          <p className="text-2xl font-black text-rose-700 font-mono">-{fmt(totalAvoirsValides)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>CA Brut : {fmt(totalRevenueBrut)}</span>
            <strong className="text-emerald-700">CA Net : {fmt(totalRevenueNet)}</strong>
          </div>
          <div className="mt-2 pt-1 border-t border-rose-100 flex items-center justify-between text-[10px] text-rose-600 font-bold group-hover:underline">
            <span>Voir justificatifs avoirs</span>
            <span>→</span>
          </div>
        </div>

        {/* 1. Chiffre d'Affaires */}
        <div
          onClick={() => setActiveModalType('revenue')}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm cursor-pointer hover:border-emerald-400 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Chiffre d'Affaires (CA)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">{fmt(totalRevenue)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Volume transactions :</span>
            <strong className="text-emerald-700">{filteredSales.length} vente(s)</strong>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-emerald-700 font-bold group-hover:underline">
            <span>Voir le détail des ventes</span>
            <span>→</span>
          </div>
        </div>

        {/* 2. Marge Brute */}
        <div
          onClick={() => setActiveModalType('gross_margin')}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm cursor-pointer hover:border-indigo-400 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Marge Brute d'Exploitation</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-black font-mono ${grossMargin >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
            {fmt(grossMargin)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Coût d'achat (COGS) :</span>
            <span className="font-mono text-slate-700 font-semibold">{totalCogsHT > 0 ? fmt(totalCogsHT) : '0 FCFA'}</span>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-indigo-700 font-bold group-hover:underline">
            <span>Détail calcul marge brute</span>
            <span>→</span>
          </div>
        </div>

        {/* 3. Marge Nette */}
        <div
          onClick={() => setActiveModalType('net_margin')}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm cursor-pointer hover:border-emerald-400 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Marge Nette (Brute - Dépenses)</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${netMargin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {netMargin >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <p className={`text-2xl font-black font-mono ${netMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmt(netMargin)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Dépenses déduites :</span>
            <span className="text-rose-600 font-mono font-bold">-{fmt(totalExpenses)}</span>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-emerald-700 font-bold group-hover:underline">
            <span>Rapprochement résultat net</span>
            <span>→</span>
          </div>
        </div>

        {/* 4. Dépenses d'Exploitation */}
        <div
          onClick={() => setActiveModalType('expenses')}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm cursor-pointer hover:border-rose-400 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Dépenses Réelles Décaissées</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono">{fmt(totalExpenses)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Pièces comptables :</span>
            <span>{filteredExpenses.length} justificatif(s)</span>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-rose-600 font-bold group-hover:underline">
            <span>Consulter les pièces sources</span>
            <span>→</span>
          </div>
        </div>

        {/* 5. Total Créances Clients Non Soldées */}
        <div
          onClick={() => setActiveModalType('receivables')}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm cursor-pointer hover:border-amber-400 hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Total Créances Non Soldées</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-800 font-mono">{fmt(totalReceivables)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>Encours clients :</span>
            <span>{customers.filter((c) => c.current_debt > 0).length} client(s) débiteur(s)</span>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-amber-700 font-bold group-hover:underline">
            <span>Liste des clients débiteurs</span>
            <span>→</span>
          </div>
        </div>

        {/* 6. Total Valeur Stock Valorisé */}
        <div
          onClick={() => setActiveModalType('stock')}
          className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition group sm:col-span-2 lg:col-span-3"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-slate-400">Valeur Totale Stock (Au Coût)</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <p className="text-2xl font-black text-blue-700 font-mono">{fmt(totalStockValue)}</p>
            <div className="text-xs text-slate-500">
              Valeur Commerciale ({stockValuation.totalStockUv} UV) :{' '}
              <strong className="text-emerald-700 font-mono font-bold">{fmt(stockValuation.totalStockValVente)}</strong>
            </div>
          </div>
          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-blue-600 font-bold group-hover:underline">
            <span>Consulter la décomposition du stock par article</span>
            <span>→</span>
          </div>
        </div>
      </div>

      {/* ── Table Détaillée : Marge par Produit ──────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>Marge par Produit (Sur la Période Sélectionnée)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Quantité vendue nette, CA net HT, coût réel des ventes (COGS), marge brute dégagée et taux de marge
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">{productMargins.length} produit(s)</span>
        </div>

        {productMargins.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Aucun produit n'a encore de mouvement de vente enregistré sur cette période.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                <tr>
                  <th className="p-4">Produit</th>
                  <th className="p-4 text-right">Coût d'achat (UV)</th>
                  <th className="p-4 text-right">Prix de vente (UV)</th>
                  <th className="p-4 text-center">Quantité vendue</th>
                  <th className="p-4 text-center text-rose-600">Avoirs (Retour)</th>
                  <th className="p-4 text-right">CA Net HT</th>
                  <th className="p-4 text-right">Coût Réel (COGS)</th>
                  <th className="p-4 text-right">Marge Brute</th>
                  <th className="p-4 text-center">Taux (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {productMargins.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4">
                      <p className="font-bold text-slate-800 text-xs">{item.name}</p>
                      <span className="text-[10px] text-slate-400 font-medium">{item.category}</span>
                    </td>
                    <td className="p-4 text-right font-mono font-medium text-slate-600">{fmt(item.costPrice)}</td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900">{fmt(item.sellingPrice)}</td>
                    <td className="p-4 text-center font-mono font-bold text-slate-700">{item.qtySold}</td>
                    <td className="p-4 text-center font-mono font-bold text-rose-600">
                      {item.qtyAvoiree > 0 ? `-${item.qtyAvoiree}` : '0'}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900">{fmt(item.netCaHT)}</td>
                    <td className="p-4 text-right font-mono font-medium text-slate-600">{fmt(item.netCogsHT)}</td>
                    <td className={`p-4 text-right font-mono font-black ${item.netMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {fmt(item.netMargin)}
                    </td>
                    <td className="p-4 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        Number(item.marginRate) >= 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        {item.marginRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* ── Modale Universelle de Traçabilité Financière (Point 7) ────────────── */}
      <FinancialDetailModal
        isOpen={Boolean(activeModalType)}
        onClose={() => setActiveModalType(null)}
        type={activeModalType}
        periodLabel={periodDisplayLabel}
        sales={filteredSales}
        expenses={filteredExpenses}
        avoirs={filteredAvoirs}
        products={products}
        customers={customers}
        financialSummary={financialSummary}
        stockValuation={stockValuation}
      />
    </div>
  )
}

export default ReportingPage
