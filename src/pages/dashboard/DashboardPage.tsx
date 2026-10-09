// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Métier par Secteur d'Activité
// =============================================================================
// 100% basé sur les données réelles de l'entreprise et du secteur actif
// Zéro donnée fictive ou de démonstration
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, DollarSign, Wallet, CreditCard,
  Package, ShoppingCart, ArrowUpRight, Clock, Store, RefreshCw,
  Users, ChevronRight, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { useTenant } from '../../hooks/useTenant'
import { fetchResumeActivite } from '../../lib/supabaseTenant'
import { getActiveSectorSlug, getActiveSectorMeta, filterItemsForSector } from '../../lib/sectorClient'
import { getCotonouDates, extractCotonouDate } from '../../services/hubFinancialService'

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
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId, sectorSlug, sectorMeta, supabaseTenant } = useTenant()

  const [loading, setLoading] = useState(true)
  const [salesToday, setSalesToday] = useState<TodaySale[]>([])
  const [activeProductsCount, setActiveProductsCount] = useState<number>(0)
  const [totalProductsValue, setTotalProductsValue] = useState<number>(0)
  const [totalCustomersDebt, setTotalCustomersDebt] = useState<number>(0)
  const [resumeActivite, setResumeActivite] = useState<{ ca_ht: number, marge_brute: number }>({ ca_ht: 0, marge_brute: 0 })

  const currentSectorSlug = sectorSlug
  const sectorDisplayName = sectorMeta?.name || 'Sous-Logiciel'

  // Charger les indicateurs réels du jour pour l'entreprise & le secteur avec isolation stricte
  const loadDashboardData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // 1. Ventes du jour réelles (isolées strictement par company_id et sector_slug, heure Cotonou)
      const { todayStr } = getCotonouDates()

      const { data: salesData, error: salesErr } = await supabaseTenant('sales_orders')
        .select('*, customer:customers(id, name, ifu_number)')
        .not('status', 'in', '("annule","annulée","cancelled","CANCELLED")')
        .order('created_at', { ascending: false })
        .limit(1000)

      if (salesErr) throw salesErr

      // Filtrer strictement les ventes enregistrées à la date du jour (Cotonou)
      const filteredToday = (salesData || []).filter((s: any) => {
        const sDate = extractCotonouDate(s.order_date, s.created_at)
        return sDate === todayStr
      })

      const mappedSales: TodaySale[] = filteredToday.map((s: any) => {
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

      setSalesToday(mappedSales)

      // 2. Produits actifs réels (isolés strictement par company_id et sector_slug)
      const { data: prodData, error: prodErr } = await supabaseTenant('products')
        .select('*')
        .eq('is_active', true)

      if (prodErr) throw prodErr
      const prods = prodData || []
      setActiveProductsCount(prods.length)

      const stockVal = prods.reduce((sum: number, p: any) => {
        const qtyMagasin = Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0)
        const qtyVente = Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0)
        const cost = Number(p.cost_price || p.purchase_price || 0)
        return sum + (qtyMagasin + qtyVente) * cost
      }, 0)
      setTotalProductsValue(stockVal)

      // 3. Total créances clients exigibles (isolées strictement par company_id et sector_slug)
      const { data: custData } = await supabaseTenant('customers')
        .select('*')

      if (custData) {
        const debtSum = custData.reduce((sum: number, c: any) => sum + (Number(c.current_debt) || 0), 0)
        setTotalCustomersDebt(debtSum)
      }

      // 4. Résumé officiel d'activité (CA HT et Marge Brute calculés depuis v_resume_activite)
      try {
        const resume = await fetchResumeActivite(companyId, currentSectorSlug) as any
        if (resume && typeof resume.ca_ht === 'number') {
          setResumeActivite({
            ca_ht: Number(resume.ca_ht) || 0,
            marge_brute: Number(resume.marge_brute) || 0
          })
        }
      } catch (rErr) {
        console.warn('Avertissement chargement v_resume_activite:', rErr)
      }
    } catch (err: any) {
      console.error('Erreur chargement Dashboard :', err)
      setSalesToday([])
      setActiveProductsCount(0)
      setTotalProductsValue(0)
    } finally {
      setLoading(false)
    }
  }, [companyId, currentSectorSlug, supabaseTenant])

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
            Tableau de Bord — {sectorDisplayName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Indicateurs d'activité en temps réel pour l'établissement{' '}
            <strong className="text-slate-700">{company?.name || 'Entreprise'}</strong>
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

      {/* ── Indicateurs Principaux avec Marge Brute Silo (v_resume_activite) ─────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
          <p className="text-xl font-black text-slate-900 font-mono">
            {fmt(caDuJour)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Ventes du jour :</span>
            <strong className="text-emerald-700 font-bold">{salesToday.length} enregistrée(s)</strong>
          </div>
        </div>

        {/* 2. Marge Brute Silo (Source unique v_resume_activite) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-teal-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Marge Brute Silo
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xl font-black text-teal-700 font-mono">
            {fmt(resumeActivite.marge_brute)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>CA HT Silo :</span>
            <span className="text-slate-700 font-mono font-bold">
              {fmt(resumeActivite.ca_ht)}
            </span>
          </div>
        </div>

        {/* 3. Espèces du Jour */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Espèces du Jour
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xl font-black text-emerald-700 font-mono">
            {fmt(especesDuJour)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>MoMo encaissé :</span>
            <span className="text-purple-700 font-mono font-bold">
              {fmt(momoDuJour)}
            </span>
          </div>
        </div>

        {/* 4. Créances Clients */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-rose-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Créances Clients
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xl font-black text-rose-600 font-mono">
            {fmt(totalCustomersDebt)}
          </p>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Du jour :</span>
            <span className="text-rose-700 font-bold font-mono">
              {fmt(creancesDuJour)}
            </span>
          </div>
        </div>

        {/* 5. Produits Actifs */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-indigo-200 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Produits Actifs
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">
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
          to={`/app/${currentSectorSlug}/vente-pos`}
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
          to={`/app/${currentSectorSlug}/stocks`}
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
          to={`/app/${currentSectorSlug}/caisse`}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <Wallet className="w-5 h-5 text-amber-600 group-hover:scale-110 transition" />
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-800">Caisse du Secteur</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Sessions & Clôtures</p>
          </div>
        </Link>

        <Link
          to={`/app/${currentSectorSlug}/clients`}
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
            to={`/app/${currentSectorSlug}/vente-pos`}
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
                to={`/app/${currentSectorSlug}/vente-pos`}
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
