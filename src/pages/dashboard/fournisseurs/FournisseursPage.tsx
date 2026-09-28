// =============================================================================
// GESTIO 229 SaaS — Module 3 : Achats, Fournisseurs & Approvisionnements
// Bons de Commande (Brouillon -> À valider -> Validé -> Rejeté -> Commandé -> Réceptionné)
// Réception BL (Règle B.1 : Entrée Stock Magasin), Impression BL et Suivi des dettes
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Truck, Plus, Search, CheckCircle, Clock, AlertCircle, FileText,
  Printer, ArrowUpRight, DollarSign, RefreshCw, X, ShieldAlert, Check,
  Send, Ban, PackageCheck
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { PurchaseOrderModal, ReceiveBlModal, ModalPortal } from '../../../components/modals'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

interface Supplier {
  id: string
  code: string
  name: string
  phone: string
  email?: string
  city?: string
  current_debt: number
  is_active: boolean
}

type BCStatus = 'BROUILLON' | 'A_VALIDER' | 'VALIDE' | 'REJETE' | 'COMMANDE' | 'RECEPTIONNE'

interface PurchaseOrder {
  id: string
  reference: string
  date: string
  supplierId: string
  supplierName: string
  productId: string
  productName: string
  productCode?: string
  ucdUnit: string
  qtyOrderedUcd: number
  unitPriceUcd: number
  totalTtc: number
  status: BCStatus
  signatures: {
    magasinier: string
    gerant?: string
  }
}

interface ReceptionRecord {
  id: string
  bcReference: string
  blRef: string
  date: string
  supplierName: string
  productName: string
  qtyOrdered: number
  qtyReceived: number
  ecart: number
  status: 'CONFORME' | 'NON_CONFORME'
  notes?: string
}

export const FournisseursPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'bc' | 'reception' | 'fournisseurs'>('bc')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [receptions, setReceptions] = useState<ReceptionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showPoModal, setShowPoModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedPoForReceive, setSelectedPoForReceive] = useState<PurchaseOrder | null>(null)

  // Impression BC / BL
  const [printedPo, setPrintedPo] = useState<PurchaseOrder | null>(null)
  const [printedBl, setPrintedBl] = useState<ReceptionRecord | null>(null)

  // Règlement dette fournisseur
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedSupplierForPay, setSelectedSupplierForPay] = useState<Supplier | null>(null)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMode, setPaymentMode] = useState<'especes' | 'momo' | 'banque'>('banque')

  // Chargement réel depuis Supabase
  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [{ data: sData, error: sErr }, { data: poData, error: poErr }] = await Promise.all([
        supabase
          .from('suppliers')
          .select('*')
          .eq('company_id', company.id)
          .order('name'),
        supabase
          .from('purchase_orders')
          .select('*')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false })
      ])

      if (sErr) throw sErr

      setSuppliers(sData || [])

      if (poData && !poErr) {
        const mappedPo: PurchaseOrder[] = poData.map((p: any) => ({
          id: p.id,
          reference: p.order_number || `BC-${p.id.slice(0, 6)}`,
          date: p.created_at || new Date().toISOString(),
          supplierId: p.supplier_id,
          supplierName: p.supplier_name || 'Fournisseur',
          productId: p.product_id || '',
          productName: p.product_name || 'Marchandise',
          ucdUnit: p.unit || 'UCD',
          qtyOrderedUcd: Number(p.quantity) || 1,
          unitPriceUcd: Number(p.unit_price) || 0,
          totalTtc: Number(p.total_amount) || 0,
          status: (p.status?.toUpperCase() as any) || 'COMMANDE',
          signatures: {
            magasinier: p.created_by_name || 'Magasinier',
            gerant: p.validated_by_name || ''
          }
        }))
        setPurchaseOrders(mappedPo)
      }
    } catch (err: any) {
      toast.error('Erreur chargement fournisseurs', err.message)
      setSuppliers([])
      setPurchaseOrders([])
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Actions sur les Bons de Commande (Cycle d'achat conforme Règle 20) ──────

  const handleCreatePoSuccess = async (newPo: PurchaseOrder) => {
    setPurchaseOrders([newPo, ...purchaseOrders])
    toast.success('Bon de Commande créé', `Réf: ${newPo.reference} (Statut: Brouillon)`)
  }

  // Soumettre pour validation (Brouillon -> À valider)
  const handleSubmitToValidate = (poId: string) => {
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, status: 'A_VALIDER' as const } : p))
    )
    toast.success('BC Soumis pour visa', 'Le Gérant doit maintenant valider la commande.')
  }

  // Validation par le Gérant (À valider -> Validé)
  const handleValidatePo = (poId: string) => {
    setPurchaseOrders((prev) =>
      prev.map((p) =>
        p.id === poId
          ? { ...p, status: 'VALIDE' as const, signatures: { ...p.signatures, gerant: 'Direction Générale' } }
          : p
      )
    )
    toast.success('Bon de Commande Validé', 'Le bon peut maintenant être envoyé au fournisseur.')
  }

  // Rejet par le Gérant (À valider -> Rejeté)
  const handleRejectPo = (poId: string) => {
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, status: 'REJETE' as const } : p))
    )
    toast.error('Bon de Commande Rejeté', 'La commande a été refusée.')
  }

  // Marquer Commandé au fournisseur (Validé -> Commandé)
  const handleMarkOrdered = (poId: string) => {
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poId ? { ...p, status: 'COMMANDE' as const } : p))
    )
    toast.success('Commande transmise', 'En attente de livraison par le fournisseur.')
  }

  // Déclencher Réception BL (Commandé -> Réceptionné)
  const handleOpenReceiveModal = (po: PurchaseOrder) => {
    setSelectedPoForReceive(po)
    setShowReceiveModal(true)
  }

  const handleReceiveBlSuccess = async (data: any) => {
    try {
      // 1. Appliquer Règle B.1 : Incrémenter le Stock Magasin du produit avec la quantité reçue
      if (data.productId && data.receivedQty > 0) {
        const { data: prodData } = await supabase
          .from('products')
          .select('stock_magasin')
          .eq('id', data.productId)
          .maybeSingle()

        if (prodData) {
          const newStock = Math.round(((Number(prodData.stock_magasin) || 0) + data.receivedQty) * 1000) / 1000
          await supabase
            .from('products')
            .update({ stock_magasin: newStock })
            .eq('id', data.productId)
        }
      }

      // 2. Mettre à jour le statut du BC -> Réceptionné
      setPurchaseOrders((prev) =>
        prev.map((p) => (p.id === data.poId ? { ...p, status: 'RECEPTIONNE' as const } : p))
      )

      // 3. Enregistrer l'enregistrement de réception BL
      const newRec: ReceptionRecord = {
        id: `bl-${Date.now()}`,
        bcReference: selectedPoForReceive?.reference || 'BC-2026',
        blRef: data.blRef,
        date: new Date().toISOString(),
        supplierName: data.supplierName || 'Fournisseur',
        productName: data.productName || 'Marchandise',
        qtyOrdered: data.qtyOrdered,
        qtyReceived: data.receivedQty,
        ecart: data.ecart,
        status: data.conform ? 'CONFORME' : 'NON_CONFORME',
        notes: data.notes
      }

      setReceptions([newRec, ...receptions])
      setShowReceiveModal(false)
      setSelectedPoForReceive(null)

      toast.success(
        'Réception Marchandise Confirmée (Règle B.1)',
        `Le Stock Magasin a été crédité de ${data.receivedQty} ${selectedPoForReceive?.ucdUnit || 'UCD'}.`
      )
    } catch (err: any) {
      toast.error('Erreur réception', err.message)
    }
  }

  // Règlement dette fournisseur
  const handleProcessPayment = async () => {
    if (!selectedSupplierForPay || paymentAmount <= 0) return
    try {
      const updatedDebt = Math.max(0, (selectedSupplierForPay.current_debt || 0) - paymentAmount)
      await supabase
        .from('suppliers')
        .update({ current_debt: updatedDebt })
        .eq('id', selectedSupplierForPay.id)

      setSuppliers((prev) =>
        prev.map((s) => (s.id === selectedSupplierForPay.id ? { ...s, current_debt: updatedDebt } : s))
      )

      setShowPaymentModal(false)
      toast.success('Règlement effectué', `${fmt(paymentAmount)} payés à ${selectedSupplierForPay.name}.`)
    } catch (err: any) {
      toast.error('Erreur règlement', err.message)
    }
  }

  // Filtrages
  const filteredSuppliers = suppliers.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  )

  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + (s.current_debt || 0), 0)

  return (
    <div className="space-y-4">
      {/* ── En-tête & Onglets ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            Module 3 : Achats, Fournisseurs & Approvisionnements
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bons de Commande (Brouillon → Validé → Commandé → Réceptionné) & Règle B.1 Entrée Stock Magasin
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('bc')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'bc'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <FileText className="w-4 h-4" /> Bons de Commande ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('reception')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'reception'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <PackageCheck className="w-4 h-4" /> Réceptions BL ({receptions.length})
          </button>
          <button
            onClick={() => setActiveTab('fournisseurs')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'fournisseurs'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <Truck className="w-4 h-4" /> Fournisseurs ({suppliers.length})
          </button>

          <button
            onClick={loadData}
            className="p-2 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── KPIs Dettes & Achats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block mb-0.5">
              Dettes Fournisseurs Dues
            </span>
            <p className="text-xl font-black text-rose-600 font-mono">{fmt(totalSupplierDebt)}</p>
            <span className="text-[10px] text-slate-400">Total exigible en compte</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block mb-0.5">
              Commandes en Cours
            </span>
            <p className="text-xl font-black text-indigo-900 font-mono">
              {purchaseOrders.filter((p) => p.status === 'COMMANDE' || p.status === 'VALIDE').length}
            </p>
            <span className="text-[10px] text-slate-400">En attente de livraison</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-0.5">
              Réceptions Conformes
            </span>
            <p className="text-xl font-black text-emerald-800 font-mono">{receptions.length}</p>
            <span className="text-[10px] text-slate-400">Bons de livraison réceptionnés</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {activeTab === 'bc' && (
        /* ── TAB 1 : BONS DE COMMANDE (CYCLE COMPLET) ────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Bons de Commande Fournisseurs (BC)</h3>
              <p className="text-xs text-slate-500">Cycle d'approbation : Brouillon → À valider → Validé → Rejeté → Commandé → Réceptionné</p>
            </div>
            <button
              onClick={() => setShowPoModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Créer un Bon de Commande
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Réf BC</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Fournisseur</th>
                  <th className="p-3">Article Commandé (UCD)</th>
                  <th className="p-3 text-right">Total TTC</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-center">Actions selon Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-sans">
                      Aucun bon de commande créé. Cliquez sur "+ Créer un Bon de Commande".
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/80 transition font-sans">
                      <td className="p-3 font-mono font-bold text-indigo-900">{po.reference}</td>
                      <td className="p-3 text-slate-500 font-mono">
                        {new Date(po.date).toLocaleDateString('fr-BJ')}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{po.supplierName}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-900">{po.productName}</span>
                        <span className="text-slate-500 font-mono text-[11px] block">
                          Qté : {po.qtyOrderedUcd} {po.ucdUnit} @ {fmt(po.unitPriceUcd)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-black font-mono text-slate-900">{fmt(po.totalTtc)}</td>
                      <td className="p-3 text-center">
                        <span className={clsx(
                          'px-2.5 py-0.5 rounded-full text-[10px] font-bold',
                          po.status === 'BROUILLON' ? 'bg-slate-100 text-slate-700' :
                          po.status === 'A_VALIDER' ? 'bg-amber-100 text-amber-800' :
                          po.status === 'VALIDE' ? 'bg-blue-100 text-blue-800' :
                          po.status === 'REJETE' ? 'bg-rose-100 text-rose-800' :
                          po.status === 'COMMANDE' ? 'bg-purple-100 text-purple-800' :
                          'bg-emerald-100 text-emerald-800'
                        )}>
                          {po.status === 'BROUILLON' ? 'Brouillon' :
                           po.status === 'A_VALIDER' ? 'À valider' :
                           po.status === 'VALIDE' ? 'Validé' :
                           po.status === 'REJETE' ? 'Rejeté' :
                           po.status === 'COMMANDE' ? 'Commandé' :
                           'Réceptionné'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Actions selon statut (Règle 20) */}
                          <button
                            onClick={() => setPrintedPo(po)}
                            title="Imprimer le BC"
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {po.status === 'BROUILLON' && (
                            <button
                              onClick={() => handleSubmitToValidate(po.id)}
                              title="Soumettre pour validation"
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" /> Soumettre
                            </button>
                          )}

                          {po.status === 'A_VALIDER' && (
                            <>
                              <button
                                onClick={() => handleValidatePo(po.id)}
                                title="Valider le BC"
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Valider
                              </button>
                              <button
                                onClick={() => handleRejectPo(po.id)}
                                title="Rejeter le BC"
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" /> Rejeter
                              </button>
                            </>
                          )}

                          {po.status === 'VALIDE' && (
                            <button
                              onClick={() => handleMarkOrdered(po.id)}
                              title="Marquer comme commandé"
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                            >
                              Commander
                            </button>
                          )}

                          {po.status === 'COMMANDE' && (
                            <button
                              onClick={() => handleOpenReceiveModal(po)}
                              title="Réceptionner le BL"
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm"
                            >
                              <PackageCheck className="w-3.5 h-3.5" /> Réceptionner
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reception' && (
        /* ── TAB 2 : RÉCEPTIONS MARCHANDISES & BONS DE LIVRAISON (RÈGLE B.1) ──── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Journal des Réceptions Fournisseurs (BL)</h3>
            <p className="text-xs text-slate-500">Règle B.1 : Seule la quantité réellement réceptionnée est ajoutée au Stock Magasin.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">N° BL Fournisseur</th>
                  <th className="p-3">BC Origine</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Fournisseur</th>
                  <th className="p-3">Article</th>
                  <th className="p-3 text-center">Qté Commandée</th>
                  <th className="p-3 text-center bg-emerald-50/70 text-emerald-900">Qté Reçue (Magasin)</th>
                  <th className="p-3 text-center">Écart</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {receptions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 font-sans">
                      Aucune réception de marchandise enregistrée.
                    </td>
                  </tr>
                ) : (
                  receptions.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition font-sans">
                      <td className="p-3 font-mono font-bold text-slate-900">{r.blRef}</td>
                      <td className="p-3 font-mono text-indigo-700">{r.bcReference}</td>
                      <td className="p-3 text-slate-500 font-mono">
                        {new Date(r.date).toLocaleDateString('fr-BJ')}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{r.supplierName}</td>
                      <td className="p-3 font-medium text-slate-800">{r.productName}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-600">{r.qtyOrdered}</td>
                      <td className="p-3 text-center font-mono font-black text-emerald-700 bg-emerald-50/30">
                        {r.qtyReceived}
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px]',
                          r.ecart === 0 ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'
                        )}>
                          {r.ecart > 0 ? `+${r.ecart}` : r.ecart}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setPrintedBl(r)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto"
                        >
                          <Printer className="w-3.5 h-3.5" /> Imprimer BL
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'fournisseurs' && (
        /* ── TAB 3 : RÉPERTOIRE FOURNISSEURS & CRÉANCES ───────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher fournisseur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Nom du Fournisseur</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Ville</th>
                  <th className="p-3 text-right">Dette Restante (FCFA)</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                      Aucun fournisseur enregistré. Créez-en un lors de la création d'un Bon de Commande.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition font-sans">
                      <td className="p-3 font-mono font-bold text-slate-900">{s.code}</td>
                      <td className="p-3 font-bold text-slate-800">{s.name}</td>
                      <td className="p-3 text-slate-600 font-mono">{s.phone}</td>
                      <td className="p-3 text-slate-600">{s.city || 'Cotonou'}</td>
                      <td className="p-3 text-right font-black font-mono">
                        {s.current_debt > 0 ? (
                          <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                            {fmt(s.current_debt)}
                          </span>
                        ) : (
                          <span className="text-emerald-600">0 FCFA</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {s.current_debt > 0 && (
                          <button
                            onClick={() => {
                              setSelectedSupplierForPay(s)
                              setPaymentAmount(s.current_debt)
                              setShowPaymentModal(true)
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                          >
                            Régler
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL IMPRESSION BON DE COMMANDE A4 ───────────────────────────────── */}
      <ModalPortal isOpen={!!printedPo} onClose={() => setPrintedPo(null)} id="modal-po-print">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-black text-slate-900 text-base">Bon de Commande Officiel</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer BC
              </button>
              <button onClick={() => setPrintedPo(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5 text-xs font-sans text-slate-800">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase">{company?.name ?? 'GESTIO 229'}</h2>
                <p className="text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
                <p className="text-slate-500">{company?.address || 'Cotonou, République du Bénin'}</p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-900 rounded-lg font-black text-xs">
                  BON DE COMMANDE
                </span>
                <p className="font-mono font-bold text-sm mt-1.5">{printedPo?.reference}</p>
                <p className="text-slate-500">Date : {new Date(printedPo?.date || '').toLocaleDateString('fr-BJ')}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400">Fournisseur :</span>
              <p className="text-sm font-bold text-slate-900">{printedPo?.supplierName}</p>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Désignation</th>
                  <th className="p-2.5 text-center">Unité (UCD)</th>
                  <th className="p-2.5 text-center">Quantité</th>
                  <th className="p-2.5 text-right">Prix Unitaire TTC</th>
                  <th className="p-2.5 text-right">Total TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="p-2.5 font-sans font-semibold text-slate-900">{printedPo?.productName}</td>
                  <td className="p-2.5 text-center text-slate-500 font-sans">{printedPo?.ucdUnit}</td>
                  <td className="p-2.5 text-center font-bold text-slate-900">{printedPo?.qtyOrderedUcd}</td>
                  <td className="p-2.5 text-right">{fmt(printedPo?.unitPriceUcd || 0)}</td>
                  <td className="p-2.5 text-right font-black text-indigo-900">{fmt(printedPo?.totalTtc || 0)}</td>
                </tr>
              </tbody>
            </table>

            <div className="flex justify-between pt-6 border-t border-slate-200">
              <div className="text-center w-40">
                <p className="font-bold text-slate-700">Demandeur / Magasinier</p>
                <p className="text-slate-400 text-[10px] mt-1">{printedPo?.signatures.magasinier}</p>
                <div className="h-10 border-b border-dashed border-slate-300 w-32 mx-auto mt-2" />
              </div>
              <div className="text-center w-40">
                <p className="font-bold text-slate-700">Direction / Gérant</p>
                <p className="text-slate-400 text-[10px] mt-1">{printedPo?.signatures.gerant || 'Signature'}</p>
                <div className="h-10 border-b border-dashed border-slate-300 w-32 mx-auto mt-2" />
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL IMPRESSION BON DE RÉCEPTION (BL) A4 (RÈGLE 20) ─────────────── */}
      <ModalPortal isOpen={!!printedBl} onClose={() => setPrintedBl(null)} id="modal-bl-print">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-black text-slate-900 text-base">Bon de Réception Marchandises (BL)</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer BL (PDF A4)
              </button>
              <button onClick={() => setPrintedBl(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5 text-xs font-sans text-slate-800">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase">{company?.name ?? 'GESTIO 229'}</h2>
                <p className="text-slate-500">Service Entrepôt & Gestion des Stocks</p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-black text-xs">
                  BON DE RÉCEPTION
                </span>
                <p className="font-mono font-bold text-sm mt-1.5">{printedBl?.blRef}</p>
                <p className="text-slate-500">BC Origine : {printedBl?.bcReference}</p>
                <p className="text-slate-500">Date : {new Date(printedBl?.date || '').toLocaleDateString('fr-BJ')}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400">Fournisseur :</span>
              <p className="text-sm font-bold text-slate-900">{printedBl?.supplierName}</p>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Article Réceptionné</th>
                  <th className="p-2.5 text-center">Quantité Commandée</th>
                  <th className="p-2.5 text-center">Quantité Reçue Magasin</th>
                  <th className="p-2.5 text-center">Écart Constaté</th>
                  <th className="p-2.5 text-center">Conformité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="p-2.5 font-sans font-semibold text-slate-900">{printedBl?.productName}</td>
                  <td className="p-2.5 text-center">{printedBl?.qtyOrdered}</td>
                  <td className="p-2.5 text-center font-black text-emerald-700 bg-emerald-50/50">{printedBl?.qtyReceived}</td>
                  <td className="p-2.5 text-center">{printedBl?.ecart}</td>
                  <td className="p-2.5 text-center font-sans font-bold text-emerald-800">{printedBl?.status}</td>
                </tr>
              </tbody>
            </table>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
              <p className="font-bold text-slate-800">Mention de Conformité Stock Magasin :</p>
              <p>
                Atteste que la quantité de <strong>{printedBl?.qtyReceived}</strong> a été physiquement contrôlée et versée dans le Stock Magasin (UCD).
              </p>
            </div>

            <div className="flex justify-between pt-6 border-t border-slate-200">
              <div className="text-center w-40">
                <p className="font-bold text-slate-700">Le Livreur / Fournisseur</p>
                <div className="h-10 border-b border-dashed border-slate-300 w-32 mx-auto mt-2" />
              </div>
              <div className="text-center w-40">
                <p className="font-bold text-slate-700">Le Réceptionnaire (Magasinier)</p>
                <div className="h-10 border-b border-dashed border-slate-300 w-32 mx-auto mt-2" />
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* Modals de création et réception */}
      <PurchaseOrderModal
        isOpen={showPoModal}
        onClose={() => setShowPoModal(false)}
        onSuccess={handleCreatePoSuccess}
      />
      <ReceiveBlModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        po={selectedPoForReceive}
        onSuccess={handleReceiveBlSuccess}
      />
    </div>
  )
}

export default FournisseursPage
