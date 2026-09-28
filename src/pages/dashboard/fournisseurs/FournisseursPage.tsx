// =============================================================================
// GESTIO 229 SaaS — Module 3 : Achats & Gestion des Fournisseurs
// Cycle BC -> BL Réception (UCD Règle B.1) -> Factures & Échéancier Dettes
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Truck, Plus, Search, X, Phone, MapPin, Package, FileText,
  ShoppingCart, PackageCheck, Check, Printer, Send, AlertCircle,
  FileCheck, DollarSign, Clock, ShieldCheck
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { PurchaseOrderModal, ReceiveBlModal, ModalPortal } from '../../../components/modals'
import clsx from 'clsx'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface Supplier {
  id: string
  code: string
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
  current_debt: number
  is_active: boolean
}

interface PurchaseOrder {
  id: string
  reference: string
  date: string
  supplierId: string
  supplierName: string
  productName: string
  qtyOrderedUcd: number
  unitPriceUcd: number
  totalTtc: number
  status: 'EN_ATTENTE_SIGNATURE' | 'VALIDE' | 'RECEPTIONNE'
  signatures: {
    magasinier?: string
    gerant?: string
  }
}

interface ReceptionRecord {
  id: string
  bcReference: string
  date: string
  supplierName: string
  productName: string
  qtyOrdered: number
  qtyReceived: number
  ecart: number
  status: 'CONFORME' | 'PARTIEL'
  magasinierSigner: string
}

export const FournisseursPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'bc' | 'reception' | 'fournisseurs'>('bc')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modals
  const [showPoModal, setShowPoModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null)

  // Modal Règlement dette fournisseur
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedSupplierForPay, setSelectedSupplierForPay] = useState<Supplier | null>(null)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMode, setPaymentMode] = useState<'especes' | 'momo' | 'banque'>('banque')

  // Bons de Commande (Cycle d'achat)
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([
    {
      id: 'po-1',
      reference: 'BC-2026-0015',
      date: new Date().toISOString(),
      supplierId: 's-1',
      supplierName: 'SOBEBRA SA (Cotonou)',
      productName: 'Bière Béninoise Casier 24',
      qtyOrderedUcd: 100,
      unitPriceUcd: 12500,
      totalTtc: 1250000,
      status: 'VALIDE',
      signatures: { magasinier: 'M. Magasinier', gerant: 'Direction Générale' }
    },
    {
      id: 'po-2',
      reference: 'BC-2026-0014',
      date: new Date(Date.now() - 86400000).toISOString(),
      supplierId: 's-2',
      supplierName: 'IMPORT-EXPORT BÉNIN SARL',
      productName: 'Riz Parfumé 50kg (Sac)',
      qtyOrderedUcd: 50,
      unitPriceUcd: 22000,
      totalTtc: 1100000,
      status: 'RECEPTIONNE',
      signatures: { magasinier: 'M. Magasinier', gerant: 'Direction Générale' }
    }
  ])

  // Bons de Réception BL (Règle B.1)
  const [receptions, setReceptions] = useState<ReceptionRecord[]>([
    {
      id: 'bl-1',
      bcReference: 'BC-2026-0014',
      date: new Date(Date.now() - 86400000).toISOString(),
      supplierName: 'IMPORT-EXPORT BÉNIN SARL',
      productName: 'Riz Parfumé 50kg (Sac)',
      qtyOrdered: 50,
      qtyReceived: 50,
      ecart: 0,
      status: 'CONFORME',
      magasinierSigner: 'Albert SOSSOU'
    }
  ])

  const loadSuppliers = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .eq('company_id', company.id)
        .order('name')
      
      const mapped: Supplier[] = (data || []).map((s: any) => ({
        id: s.id,
        code: s.code || 'FOURN-001',
        name: s.name,
        phone: s.phone || '',
        email: s.email || '',
        city: s.city || 'Cotonou',
        current_debt: s.current_debt || 0,
        is_active: s.is_active !== false
      }))

      setSuppliers(mapped)
    } catch {
      setSuppliers([
        { id: 's-1', code: 'FOURN-001', name: 'SOBEBRA SA', phone: '+229 21 33 00 00', city: 'Cotonou', current_debt: 625000, is_active: true },
        { id: 's-2', code: 'FOURN-002', name: 'IMPORT-EXPORT BÉNIN SARL', phone: '+229 21 00 12 34', city: 'Akpakpa', current_debt: 0, is_active: true },
        { id: 's-3', code: 'FOURN-003', name: 'GRANDS MOULINS DU BÉNIN', phone: '+229 21 30 15 20', city: 'Cotonou', current_debt: 340000, is_active: true },
      ])
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => { loadSuppliers() }, [loadSuppliers])

  // Signer un Bon de Commande (Double signature Magasinier + Gérant)
  const handleSignPo = (poId: string) => {
    setPurchaseOrders((prev) =>
      prev.map((po) =>
        po.id === poId
          ? {
              ...po,
              status: 'VALIDE',
              signatures: { magasinier: 'Vérifié Magasinier', gerant: 'Approuvé Gérant' }
            }
          : po
      )
    )
    toast.success('Bon de Commande Validé !', 'Double signature apposée avec succès.')
  }

  // Effectuer la réception d'un BC validé (Règle B.1)
  const handleOpenReception = (po: PurchaseOrder) => {
    setSelectedPo(po)
    setShowReceiveModal(true)
  }

  // Traiter paiement fournisseur
  const handlePaySupplier = () => {
    if (!selectedSupplierForPay || paymentAmount <= 0) return
    const updated = suppliers.map((s) => {
      if (s.id === selectedSupplierForPay.id) {
        return {
          ...s,
          current_debt: Math.max(0, s.current_debt - paymentAmount)
        }
      }
      return s
    })
    setSuppliers(updated)
    setShowPaymentModal(false)
    setPaymentAmount(0)
    toast.success(
      'Acompte Enregistré !',
      `Règlement de ${fmt(paymentAmount)} imputé sur ${selectedSupplierForPay.name}.`
    )
  }

  const totalDettesFournisseurs = suppliers.reduce((sum, s) => sum + s.current_debt, 0)
  const totalCommandesEnCours = purchaseOrders.filter((po) => po.status !== 'RECEPTIONNE').length

  const filteredSuppliers = suppliers.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* ── En-tête & Onglets ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            Module 3 : Achats & Fournisseurs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cycle d'achat complet (BC signé ➔ Réception BL UCD ➔ Suivi des dettes et factures)
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
            <ShoppingCart className="w-4 h-4" /> Bons de Commande (BC)
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
            <PackageCheck className="w-4 h-4" /> Réceptions & BL (UCD)
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
            <Truck className="w-4 h-4" /> Fournisseurs & Dettes
          </button>
        </div>
      </div>

      {/* ── KPIs Achats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Commandes Fournisseurs en Cours
            </span>
            <p className="text-xl font-black text-slate-900 font-mono">{totalCommandesEnCours} BC</p>
            <span className="text-[10px] text-indigo-600 font-medium">En attente de réception</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Total Dettes Fournisseurs
            </span>
            <p className="text-xl font-black text-rose-600 font-mono">{fmt(totalDettesFournisseurs)}</p>
            <span className="text-[10px] text-slate-400">Arriérés d'achats à régler</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Partenaires Référencés
            </span>
            <p className="text-xl font-black text-slate-900 font-mono">{suppliers.length} Fournisseurs</p>
            <span className="text-[10px] text-emerald-600 font-medium">Tous comptes actifs</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Truck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {activeTab === 'bc' && (
        /* ── TAB 1 : BONS DE COMMANDE (BC) ──────────────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Workflow des Bons de Commande Pro</h3>
            <button
              onClick={() => setShowPoModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> + Créer Bon de Commande (BC)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Réf BC</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Fournisseur</th>
                  <th className="p-3">Désignation</th>
                  <th className="p-3 text-center">Quantité (UCD)</th>
                  <th className="p-3 text-right">Total TTC</th>
                  <th className="p-3 text-center">Workflow & Statut</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-bold text-indigo-700">{po.reference}</td>
                    <td className="p-3 font-sans text-slate-600">{new Date(po.date).toLocaleDateString('fr-BJ')}</td>
                    <td className="p-3 font-sans font-semibold text-slate-800">{po.supplierName}</td>
                    <td className="p-3 font-sans text-slate-700">{po.productName}</td>
                    <td className="p-3 text-center font-bold">{po.qtyOrderedUcd} UCD</td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(po.totalTtc)}</td>
                    <td className="p-3 text-center font-sans">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-bold',
                        po.status === 'RECEPTIONNE' ? 'bg-emerald-100 text-emerald-800' :
                        po.status === 'VALIDE' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                      )}>
                        {po.status === 'RECEPTIONNE' ? '✅ Réceptionné en UCD' :
                         po.status === 'VALIDE' ? '✍️ Validé (Signatures OK)' : '⏳ Attente Signature'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        {po.status === 'EN_ATTENTE_SIGNATURE' && (
                          <button
                            onClick={() => handleSignPo(po.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                          >
                            <FileCheck className="w-3 h-3" /> Signer
                          </button>
                        )}
                        {po.status === 'VALIDE' && (
                          <button
                            onClick={() => handleOpenReception(po)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                          >
                            <PackageCheck className="w-3 h-3" /> Réceptionner BL
                          </button>
                        )}
                        <button
                          onClick={() => window.print()}
                          className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                          title="Imprimer le BC"
                        >
                          <Printer className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reception' && (
        /* ── TAB 2 : RÉCEPTIONS & BL (RÈGLE B.1) ──────────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Bons de Réception Marchandises (BL)</h3>
              <p className="text-xs text-slate-500">Règle B.1 : Entrée directe et atomique en Stock Magasin (UCD) dès signature.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Réf BC Lié</th>
                  <th className="p-3">Date Réception</th>
                  <th className="p-3">Fournisseur</th>
                  <th className="p-3">Article</th>
                  <th className="p-3 text-center">Qté Commandée</th>
                  <th className="p-3 text-center bg-emerald-50 text-emerald-900">Qté Reçue (UCD)</th>
                  <th className="p-3 text-center">Écart</th>
                  <th className="p-3">Signataire Magasinier</th>
                  <th className="p-3 text-center">BL Imprimable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {receptions.map((bl) => (
                  <tr key={bl.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-bold text-indigo-700">{bl.bcReference}</td>
                    <td className="p-3 font-sans text-slate-600">{new Date(bl.date).toLocaleDateString('fr-BJ')}</td>
                    <td className="p-3 font-sans font-medium text-slate-800">{bl.supplierName}</td>
                    <td className="p-3 font-sans">{bl.productName}</td>
                    <td className="p-3 text-center">{bl.qtyOrdered}</td>
                    <td className="p-3 text-center bg-emerald-50/40 font-bold text-emerald-800">{bl.qtyReceived}</td>
                    <td className="p-3 text-center">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-bold',
                        bl.ecart === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      )}>
                        {bl.ecart === 0 ? 'Conforme (0)' : `Écart : ${bl.ecart}`}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-slate-700">{bl.magasinierSigner}</td>
                    <td className="p-3 text-center font-sans">
                      <button
                        onClick={() => window.print()}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" /> Bon de Réception
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'fournisseurs' && (
        /* ── TAB 3 : FOURNISSEURS & ÉCHÉANCIER DETTES ────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Rechercher par nom ou code fournisseur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Fournisseur</th>
                  <th className="p-3">Téléphone</th>
                  <th className="p-3">Ville</th>
                  <th className="p-3 text-right">Dette En Cours</th>
                  <th className="p-3 text-center">Actions & Règlements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-bold text-slate-800">{s.code}</td>
                    <td className="p-3 font-sans font-bold text-slate-900">{s.name}</td>
                    <td className="p-3 font-sans text-slate-600">{s.phone}</td>
                    <td className="p-3 font-sans text-slate-500">{s.city}</td>
                    <td className="p-3 text-right font-black">
                      {s.current_debt > 0 ? (
                        <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                          {fmt(s.current_debt)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">À jour (0 F)</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedSupplierForPay(s)
                            setPaymentAmount(s.current_debt)
                            setShowPaymentModal(true)
                          }}
                          disabled={s.current_debt === 0}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                        >
                          <DollarSign className="w-3 h-3" /> Payer Acompte
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-medium"
                          title="Relevé de Compte Fournisseur"
                        >
                          <Printer className="w-3 h-3" /> Relevé
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL RÈGLEMENT FOURNISSEUR ───────────────────────────────────────── */}
      <ModalPortal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} id="modal-pay-supplier">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-sm">Paiement Fournisseur</h3>
            <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl">
              <span className="text-slate-500">Fournisseur :</span>
              <p className="font-bold text-slate-800 text-sm">{selectedSupplierForPay?.name}</p>
              <p className="text-rose-600 font-bold mt-1">Dette actuelle : {fmt(selectedSupplierForPay?.current_debt || 0)}</p>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Montant à régler (FCFA)</label>
              <input
                type="number"
                value={paymentAmount || ''}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                className="w-full p-2 border border-slate-200 rounded-xl font-mono text-sm"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Mode de règlement</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-white"
              >
                <option value="banque">🏦 Virement Bancaire</option>
                <option value="momo">📱 Mobile Money (MTN/Moov)</option>
                <option value="especes">💵 Caisse Espèces</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={() => setShowPaymentModal(false)}
              className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={handlePaySupplier}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Valider Paiement
            </button>
          </div>
        </div>
      </ModalPortal>

      {/* Modals BC & Réception */}
      <PurchaseOrderModal
        isOpen={showPoModal}
        onClose={() => setShowPoModal(false)}
        onCreated={(newPo) => {
          setPurchaseOrders([
            {
              id: `po-${Date.now()}`,
              reference: newPo.reference || `BC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
              date: new Date().toISOString(),
              supplierId: newPo.supplier_id || 's-1',
              supplierName: newPo.supplier_nom || 'SOBEBRA SA',
              productName: 'Commande Groupée Marchandises',
              qtyOrderedUcd: 25,
              unitPriceUcd: 15000,
              totalTtc: newPo.total_ttc || 375000,
              status: 'EN_ATTENTE_SIGNATURE',
              signatures: {}
            },
            ...purchaseOrders
          ])
        }}
      />
      <ReceiveBlModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        bc={selectedPo}
        onSuccess={() => {
          if (selectedPo) {
            setPurchaseOrders((prev) =>
              prev.map((p) => (p.id === selectedPo.id ? { ...p, status: 'RECEPTIONNE' } : p))
            )
            setReceptions([
              {
                id: `bl-${Date.now()}`,
                bcReference: selectedPo.reference,
                date: new Date().toISOString(),
                supplierName: selectedPo.supplierName,
                productName: selectedPo.productName,
                qtyOrdered: selectedPo.qtyOrderedUcd,
                qtyReceived: selectedPo.qtyOrderedUcd,
                ecart: 0,
                status: 'CONFORME',
                magasinierSigner: 'Magasinier Responsable'
              },
              ...receptions
            ])
            toast.success('Marchandises réceptionnées !', 'Stock Magasin incrémenté en UCD (Règle B.1).')
          }
        }}
      />
    </div>
  )
}

export default FournisseursPage
