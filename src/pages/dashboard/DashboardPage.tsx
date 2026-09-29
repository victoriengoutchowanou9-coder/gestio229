// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Métier par Secteur d'Activité
// =============================================================================
// 100% basé sur les données réelles de l'entreprise et du secteur actif
// Zéro donnée fictive ou de démonstration
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, DollarSign, Wallet, CreditCard,
  Package, ShoppingCart, ArrowUpRight, Clock, Store, RefreshCw,
  Users, ChevronRight, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface TodaySale {
  id: string
  order_number: string
  created_at: string
  total_amount: number
  payment_method: string
  customer_name?: string
  status?: string
  notes?: any
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const {
    company,
    user,
    tenantCtx,
    activeSectorSlug,
    activeActivityId,
    activeActivityName,
    activeActivityLocation
  } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [salesToday, setSalesToday] = useState<TodaySale[]>([])
  const [activeProductsCount, setActiveProductsCount] = useState<number>(0)
  const [totalProductsValue, setTotalProductsValue] = useState<number>(0)
  const [totalCustomersDebt, setTotalCustomersDebt] = useState<number>(0)

  // Déterminer le secteur d'activité actif (priorité à l'activité sélectionnée au HUB)
  const currentSectorSlug =
    activeSectorSlug ||
    (typeof window !== 'undefined' ? localStorage.getItem('gestio229_active_sector') : null) ||
    tenantCtx?.activeSectorSlug ||
    company?.active_sector ||
    'boutique'

  const currentActivityName =
    activeActivityName ||
    (typeof window !== 'undefined' ? localStorage.getItem('gestio229_active_activity_name') : null) ||
    ''

  const sectorDisplayName = useMemo(() => {
    const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === currentSectorSlug)
    if (meta) return meta.name
    const s = String(currentSectorSlug).toLowerCase()
    if (s.includes('poisson')) return 'Poissonnerie & Surgelés'
    if (s.includes('quincaillerie')) return 'Quincaillerie & Matériaux BTP'
    if (s.includes('mercerie')) return 'Mercerie & Couture'
    if (s.includes('brasserie') || s.includes('boisson')) return 'Brasserie & Dépôt de Boissons'
    if (s.includes('pharmacie')) return 'Pharmacie & Parapharmacie'
    if (s.includes('station')) return 'Station-Service & Hydrocarbures'
    if (s.includes('restaurant') || s.includes('maquis')) return 'Restaurant & Maquis'
    if (s.includes('boulangerie')) return 'Boulangerie & Pâtisserie'
    if (s.includes('cosmetique')) return 'Cosmétique & Parfumerie'
    if (s.includes('textile')) return 'Textile & Prêt-à-porter'
    if (s.includes('electronique')) return 'Électronique & Informatique'
    if (s.includes('boutique') || s.includes('commerce')) return 'Boutique & Commerce Général'
    return currentSectorSlug.charAt(0).toUpperCase() + currentSectorSlug.slice(1)
  }, [currentSectorSlug])

  // Charger les indicateurs réels du jour pour l'entreprise & le secteur
  const loadDashboardData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      // Début et fin de la journée actuelle en heure locale
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

      // 1. Ventes du jour réelles (chargées depuis Supabase)
      const { data: salesData, error: salesErr } = await supabase
        .from('sales_orders')
        .select('*, customer:customers(id, name, ifu_number)')
        .eq('company_id', company.id)
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false })

      if (salesErr) throw salesErr

      const mappedSales: TodaySale[] = (salesData || []).map((s: any) => {
        let meta: any = {}
        if (s.notes) {
          try {
            meta = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          } catch (e) {}
        }
        if (s.e_mecef_uid) {
          try {
            if (s.e_mecef_uid.startsWith('{')) {
              meta = { ...meta, ...JSON.parse(s.e_mecef_uid) }
            } else {
              s.e_mecef_uid.split('|').forEach((part: string) => {
                const [k, v] = part.split(':')
                if (k === 'PAY') meta.pm = v
                if (k === 'CL') meta.cn = v
                if (k === 'ST') meta.st = v
              })
            }
          } catch (e) {}
        }

        const pMethod = meta.pm || s.payment_method || (s.payment_status === 'credit' ? 'credit' : (s.payment_status || 'especes'))
        const cName = s.customer?.name || s.customer_name || meta.customer_name || meta.cn || 'Client Comptoir'

        return {
          id: s.id,
          order_number: s.order_number,
          created_at: s.created_at,
          total_amount: Number(s.total_amount) || 0,
          payment_method: pMethod,
          customer_name: cName,
          status: s.status || meta.st || 'COMPLET',
          notes: meta
        }
      })

      // 1. Filtrer STRICTEMENT les ventes du jour par secteur actif
      const sectorSales = (mappedSales || []).filter((sale) => {
        const meta = sale.notes || {}
        if (meta.s) return meta.s === currentSectorSlug
        if (meta.sector_slug) return meta.sector_slug === currentSectorSlug
        if (meta.act && activeActivityId) return meta.act === activeActivityId
        return true
      })
      setSalesToday(sectorSales)

      // 2. Produits actifs réels filtrés par secteur actif
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .eq('company_id', company.id)
        .eq('is_active', true)

      if (prodErr) throw prodErr
      const prods = (prodData || []).filter((p: any) => {
        const meta = p.sector_meta || {}
        if (meta.s) return meta.s === currentSectorSlug
        if (meta.sector_slug) return meta.sector_slug === currentSectorSlug
        if (p.sector_slug) return p.sector_slug === currentSectorSlug
        return true
      })
      setActiveProductsCount(prods.length)

      const stockVal = prods.reduce((sum, p: any) => {
        const qtyMagasin = Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0)
        const qtyVente = Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0)
        const cost = Number(p.cost_price || p.purchase_price || 0)
        return sum + (qtyMagasin + qtyVente) * cost
      }, 0)
      setTotalProductsValue(stockVal)

      // 3. Total créances clients exigibles
      const { data: custData } = await supabase
        .from('customers')
        .select('current_debt')
        .eq('company_id', company.id)

      if (custData) {
        const debtSum = custData.reduce((sum, c: any) => sum + (Number(c.current_debt) || 0), 0)
        setTotalCustomersDebt(debtSum)
      }
    } catch (err: any) {
      console.error('Erreur chargement Dashboard :', err)
      setSalesToday([])
      setActiveProductsCount(0)
      setTotalProductsValue(0)
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  // ─── Calculs Réels des Indicateurs Principaux du Secteur ───────────────────

  // 1. CA du jour (Total des ventes enregistrées aujourd'hui)
  const caDuJour = useMemo(() => {
    return salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  // Ventilation des règlements (Espèces, MoMo, Crédit) supportant le multi-paiement
  const { especesDuJour, momoDuJour, creancesDuJour } = useMemo(() => {
    let cash = 0
    let momo = 0
    let credit = 0

    salesToday.forEach((s) => {
      let pList: any[] = []
      if (s.notes) {
        try {
          const parsed = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          if (Array.isArray(parsed.payments) && parsed.payments.length > 0) {
            pList = parsed.payments
          }
        } catch (_) {}
      }

      if (pList.length > 0) {
        pList.forEach((p) => {
          const m = String(p.method || '').toLowerCase()
          const amt = Number(p.amount) || 0
          if (m === 'cash' || m === 'especes') {
            cash += amt
          } else if (m.includes('momo') || m === 'wave' || m === 'flooz') {
            momo += amt
          } else if (m === 'credit' || m === 'dette') {
            credit += amt
          }
        })
      } else {
        const pm = String(s.payment_method || '').toLowerCase()
        const tot = Number(s.total_amount) || 0
        if (pm === 'cash' || pm === 'especes') {
          cash += tot
        } else if (pm.includes('momo') || pm === 'wave' || pm === 'flooz') {
          momo += tot
        } else if (pm === 'credit' || pm === 'dette') {
          credit += tot
        }
      }
    })

    return { especesDuJour: cash, momoDuJour: momo, creancesDuJour: credit }
  }, [salesToday])

  const todayDateStr = new Date().toLocaleDateString('fr-BJ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête du Tableau de Bord du Secteur ────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-emerald-600" />
              Secteur : {sectorDisplayName}
            </span>
            <span className="text-xs text-slate-400 capitalize">• {todayDateStr}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-emerald-600" />
            <span>
              {currentActivityName ? `${currentActivityName} — ` : ''}
              {sectorDisplayName}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Indicateurs d'activité en temps réel pour l'établissement{' '}
            <strong className="text-slate-700">{currentActivityName || company?.name || 'Entreprise'}</strong>
            {activeActivityLocation && <span className="text-slate-400"> ({activeActivityLocation})</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="Actualiser les données réelles"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
          <Link
            to="/hub"
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            ← Retour au HUB
          </Link>
        </div>
      </div>

      {/* ── 4 Indicateurs Principaux Exigés par la Spécification ─────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. CA du Jour */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              CA du Jour
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">
            {fmt(caDuJour)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Ventes du jour :</span>
            <strong className="text-emerald-700 font-bold">{salesToday.length} enregistrée(s)</strong>
          </div>
        </div>

        {/* 2. Espèces du Jour */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Espèces du Jour
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono">
            {fmt(especesDuJour)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Mobile Money encaissé :</span>
            <span className="text-purple-700 font-mono font-bold">
              {fmt(momoDuJour)}
            </span>
          </div>
        </div>

        {/* 3. Créances du Jour & Dettes Clients */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-rose-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Créances du Jour
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono">
            {fmt(creancesDuJour)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Total exigible clients :</span>
            <span className="text-rose-700 font-bold font-mono">
              {fmt(totalCustomersDebt)}
            </span>
          </div>
        </div>

        {/* 4. Produits Actifs */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-indigo-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Produits Actifs
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">
            {activeProductsCount}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Valeur stock coût :</span>
            <span className="font-mono text-indigo-700 font-bold">{fmt(totalProductsValue)}</span>
          </div>
        </div>
      </div>

      {/* ── Raccourcis Métiers Opérationnels ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          to="/dashboard/vente-pos"
          className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-sm transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <ShoppingCart className="w-5 h-5 text-emerald-200 group-hover:scale-110 transition" />
            <ArrowRight className="w-4 h-4 text-emerald-300 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition" />
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold">Vente & POS</p>
            <p className="text-[10px] text-emerald-100 mt-0.5">Encaisser un client</p>
          </div>
        </Link>

        <Link
          to="/dashboard/stocks"
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <Package className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-800">Stocks & Dépôts</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Inventaires & Réappro</p>
          </div>
        </Link>

        <Link
          to="/dashboard/caisse"
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <Wallet className="w-5 h-5 text-amber-600 group-hover:scale-110 transition" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-800">Caisse du Secteur</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Sessions & Z de caisse</p>
          </div>
        </Link>

        <Link
          to="/dashboard/clients"
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <Users className="w-5 h-5 text-blue-600 group-hover:scale-110 transition" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-800">Clients & Créances</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Suivi des recouvrements</p>
          </div>
        </Link>
      </div>

      {/* ── Tableau des Ventes Réelles Enregistrées Aujourd'hui ──────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">
              Transactions Réelles de la Journée ({salesToday.length})
            </h3>
          </div>
          <Link
            to="/dashboard/vente-pos"
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <span>Ouvrir la caisse POS</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Chargement des opérations en cours...</span>
          </div>
        ) : salesToday.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <p className="text-sm font-bold text-slate-600">Aucune vente enregistrée aujourd'hui pour ce secteur</p>
            <p className="text-xs max-w-sm mx-auto text-slate-400">
              Toutes les nouvelles ventes enregistrées depuis le Point de Vente (POS) apparaîtront immédiatement ici avec leurs encaissements en direct.
            </p>
            <div className="pt-2">
              <Link
                to="/dashboard/vente-pos"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Effectuer la première vente</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-4">N° Facture</th>
                  <th className="p-4">Heure</th>
                  <th className="p-4">Client</th>
                  <th className="p-4 text-center">Mode de Paiement</th>
                  <th className="p-4 text-right">Montant TTC</th>
                  <th className="p-4 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesToday.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 font-mono font-bold text-slate-800">
                      {sale.order_number}
                    </td>
                    <td className="p-4 text-slate-500">
                      {new Date(sale.created_at).toLocaleTimeString('fr-BJ', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="p-4 font-bold text-slate-700">
                      {sale.customer_name || 'Client Comptoir'}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        sale.payment_method === 'cash'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sale.payment_method === 'momo'
                          ? 'bg-amber-100 text-amber-800'
                          : sale.payment_method === 'credit'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {sale.payment_method === 'cash' ? 'Espèces' :
                         sale.payment_method === 'momo' ? 'Mobile Money' :
                         sale.payment_method === 'credit' ? 'Crédit' :
                         sale.payment_method}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono font-black text-slate-900">
                      {fmt(sale.total_amount)}
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Validé
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
