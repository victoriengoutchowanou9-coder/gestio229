// =============================================================================
// GESTIO 229 SaaS — Fournisseurs & Achats (Bons de Commande & Réceptions BL)
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Truck, Plus, Search, X, Phone, MapPin, Package, FileText, ShoppingCart, PackageCheck } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { PurchaseOrderModal, ReceiveBlModal } from '../../../components/modals'
import clsx from 'clsx'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface Supplier {
  id: string
  code: string
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
  contact_name?: string
  current_debt?: number
  payment_terms_days?: number
  is_active: boolean
}

interface PurchaseOrder {
  id: string
  date: string
  supplier: string
  productName: string
  qtyUcd: number
  unitPriceUcd: number
  total: number
  status: 'Commandé' | 'Réceptionné'
}

const FournisseursPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showPoModal, setShowPoModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedPo, setSelectedPo] = useState<any>(null)

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([
    { id: 'BC-2026-0012', date: '2026-09-12', supplier: 'SOBEBRA SA', productName: 'Bière Béninoise Casier 24', qtyUcd: 50, unitPriceUcd: 12500, total: 625000, status: 'Commandé' },
    { id: 'BC-2026-0011', date: '2026-09-07', supplier: 'IMPORT-EXPORT BÉNIN', productName: 'Riz Parfumé 50kg', qtyUcd: 20, unitPriceUcd: 22000, total: 440000, status: 'Réceptionné' },
  ])

  const loadSuppliers = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .eq('company_id', company.id)
        .order('name')
      setSuppliers(data ?? [])
    } catch {
      setSuppliers([
        { id: '1', code: 'FOURN-001', name: 'SOBEBRA SA (Cotonou)', phone: '+229 21 33 00 00', city: 'Cotonou', current_debt: 0, is_active: true },
        { id: '2', code: 'FOURN-002', name: 'IMPORT-EXPORT BÉNIN SARL', phone: '+229 21 00 12 34', city: 'Akpakpa', current_debt: 250000, is_active: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSuppliers() }, [company?.id])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Achats & Fournisseurs</h1>
          <p className="text-slate-500 text-sm mt-1">Cycle complet : Bons de Commande (BC) et Réceptions Marchandise (BL)</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowPoModal(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition"
          >
            <ShoppingCart className="w-4 h-4" /> + Bon de Commande (BC)
          </button>
        </div>
      </div>

      {/* Tableau Bons de Commande */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-sm text-slate-900">Bons de Commande & Réceptions BL</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold">
              <tr>
                <th className="p-3">N° BC</th>
                <th className="p-3">Date</th>
                <th className="p-3">Fournisseur</th>
                <th className="p-3">Articles UCD</th>
                <th className="p-3 text-right">Montant Total</th>
                <th className="p-3 text-center">Statut</th>
                <th className="p-3 text-center">Action Réception</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-slate-900">{po.id}</td>
                  <td className="p-3 text-slate-500">{po.date}</td>
                  <td className="p-3 font-sans font-semibold text-slate-800">{po.supplier}</td>
                  <td className="p-3 font-sans">{po.productName} ({po.qtyUcd} UCD)</td>
                  <td className="p-3 text-right font-black text-slate-900">{fmt(po.total)}</td>
                  <td className="p-3 text-center">
                    <span className={clsx(
                      'px-2.5 py-1 rounded-full text-[10px] font-extrabold',
                      po.status === 'Réceptionné' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    )}>
                      {po.status}
                    </span>
                  </td>
                  <td className="p-3 text-center font-sans">
                    {po.status === 'Commandé' ? (
                      <button
                        onClick={() => {
                          setSelectedPo(po)
                          setShowReceiveModal(true)
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Réceptionner BL</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Réceptionné</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals via React Portal */}
      <PurchaseOrderModal
        isOpen={showPoModal}
        onClose={() => setShowPoModal(false)}
        onSuccess={(newPo) => setPurchaseOrders([newPo, ...purchaseOrders])}
      />
      <ReceiveBlModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        po={selectedPo}
        onSuccess={(rec) => {
          setPurchaseOrders(purchaseOrders.map(p => p.id === rec.poId ? { ...p, status: 'Réceptionné' } : p))
        }}
      />
    </div>
  )
}

export default FournisseursPage
