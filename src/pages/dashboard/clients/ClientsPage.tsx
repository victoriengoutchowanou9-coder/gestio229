// =============================================================================
// GESTIO 229 SaaS — Clients & Créances (V1.0 Bénin & UEMOA)
// Gestion du répertoire client, recouvrement des créances, relances WhatsApp
// et reçus de remboursement officiels
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Search, Phone, MapPin, AlertCircle, RefreshCw, X,
  DollarSign, MessageCircle, FileText, Printer, CheckCircle2, ArrowDownCircle,
  CreditCard, Smartphone
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import clsx from 'clsx'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface Customer {
  id: string
  code: string
  name: string
  ifu_number?: string
  phone: string
  email?: string
  address?: string
  city?: string
  credit_limit: number
  current_debt: number
  payment_terms_days: number
  is_active: boolean
}

interface SettlementReceipt {
  receiptNumber: string
  date: string
  customerName: string
  customerCode: string
  customerPhone: string
  customerIfu?: string
  amountPaid: number
  previousDebt: number
  remainingDebt: number
  paymentMethod: string
  notes?: string
}

const ClientsPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDebtorsOnly, setFilterDebtorsOnly] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Encaisser créance modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMode, setPaymentMode] = useState<string>('cash')
  const [paymentNotes, setPaymentNotes] = useState<string>('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  // Reçu de remboursement
  const [settlementReceipt, setSettlementReceipt] = useState<SettlementReceipt | null>(null)

  // Relevé de compte client
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)

  const [form, setForm] = useState({
    code: '',
    name: '',
    ifu_number: '',
    phone: '',
    email: '',
    address: '',
    city: 'Cotonou',
    credit_limit: 0,
    payment_terms_days: 30,
  })

  const loadCustomers = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('company_id', company.id)
        .order('name')
      if (error) throw error
      setCustomers(data || [])
    } catch (err: any) {
      toast.error('Erreur chargement clients', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const filtered = customers.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
    if (filterDebtorsOnly) {
      return matchSearch && (c.current_debt || 0) > 0
    }
    return matchSearch
  })

  const totalDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0)
  const debtorsCount = customers.filter((c) => (c.current_debt || 0) > 0).length

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id || !form.name || !form.phone) return
    setSaving(true)
    try {
      const autoCode = form.code || `CLI-${String(customers.length + 1).padStart(3, '0')}`
      const { error } = await supabase.from('customers').insert({
        ...form,
        code: autoCode,
        company_id: company.id,
        current_debt: 0,
        is_active: true,
      })
      if (error) throw error
      toast.success('Client enregistré avec succès')
      setShowModal(false)
      setForm({
        code: '',
        name: '',
        ifu_number: '',
        phone: '',
        email: '',
        address: '',
        city: 'Cotonou',
        credit_limit: 0,
        payment_terms_days: 30,
      })
      loadCustomers()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setSaving(false)
    }
  }

  // Ouvrir modal de remboursement
  const openPaymentModal = (cust: Customer) => {
    setSelectedCustomer(cust)
    setPaymentAmount(cust.current_debt || 0)
    setPaymentMode('cash')
    setPaymentNotes('')
    setShowPaymentModal(true)
  }

  // Valider le remboursement
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer || paymentAmount <= 0) return

    setIsProcessingPayment(true)
    try {
      const prevDebt = Number(selectedCustomer.current_debt) || 0
      const newDebt = Math.max(0, prevDebt - paymentAmount)

      // 1. Mettre à jour la dette client
      const { error: updErr } = await supabase
        .from('customers')
        .update({ current_debt: newDebt })
        .eq('id', selectedCustomer.id)

      if (updErr) throw updErr

      // 2. Préparer le reçu de versement
      const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`
      const receiptData: SettlementReceipt = {
        receiptNumber,
        date: new Date().toISOString(),
        customerName: selectedCustomer.name,
        customerCode: selectedCustomer.code,
        customerPhone: selectedCustomer.phone,
        customerIfu: selectedCustomer.ifu_number,
        amountPaid: paymentAmount,
        previousDebt: prevDebt,
        remainingDebt: newDebt,
        paymentMethod: paymentMode === 'cash' ? 'Espèces' : paymentMode === 'momo' ? 'MTN MoMo' : paymentMode === 'moov' ? 'Moov Money' : paymentMode === 'wave' ? 'Wave' : 'Banque/Chèque',
        notes: paymentNotes || 'Règlement de créance'
      }

      setSettlementReceipt(receiptData)
      setShowPaymentModal(false)
      toast.success('Règlement enregistré avec succès', `${fmt(paymentAmount)} reçus.`)
      loadCustomers()
    } catch (err: any) {
      toast.error('Erreur lors du versement', err.message)
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // Relance WhatsApp
  const handleWhatsAppReminder = (cust: Customer) => {
    const cleanPhone = cust.phone.replace(/[^0-9]/g, '')
    const phoneWithCountry = cleanPhone.startsWith('229') ? cleanPhone : `229${cleanPhone}`
    const companyName = company?.name || 'Notre Établissement'
    const msg = `Bonjour M./Mme ${cust.name}, sauf omission de notre part, nous vous informons que votre solde restant dû chez ${companyName} s'élève à ${fmt(cust.current_debt)}. Nous vous prions de bien vouloir régulariser votre compte dans les meilleurs délais. Merci pour votre confiance.`
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients & Recouvrement des Créances</h1>
          <p className="text-slate-500 text-sm mt-1">Répertoire commercial, encaissement des arriérés et relances automatiques</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nouveau client
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Total Clients Référencés</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{customers.length}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Créances Totales Dues</span>
          </div>
          <p className="text-2xl font-black text-red-600">{fmt(totalDebt)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <ArrowDownCircle className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Clients Débiteurs</span>
          </div>
          <p className="text-2xl font-black text-amber-600">{debtorsCount} compte(s) en attente</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou code client..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterDebtorsOnly(!filterDebtorsOnly)}
            className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${
              filterDebtorsOnly
                ? 'bg-red-50 border-red-200 text-red-700 font-bold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {filterDebtorsOnly ? '⚠️ Débiteurs uniquement' : 'Tous les clients'}
          </button>
          <button
            onClick={loadCustomers}
            title="Rafraîchir"
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table des Clients */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold">Aucun client trouvé</p>
            <p className="text-slate-400 text-sm">Créez vos clients ou utilisez le client comptoir par défaut.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Nom / Raison Sociale</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Plafond Crédit</th>
                  <th className="px-5 py-4">Solde Dû</th>
                  <th className="px-5 py-4 text-center">Actions Recouvrement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-700">{item.code}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      {item.ifu_number && (
                        <p className="text-xs text-slate-400 font-mono">IFU: {item.ifu_number}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.phone}</span>
                      </div>
                      {item.city && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{item.city}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600 font-medium">{fmt(item.credit_limit || 0)}</td>
                    <td className="px-5 py-4">
                      {item.current_debt > 0 ? (
                        <div>
                          <span className="font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-md text-xs inline-block">
                            {fmt(item.current_debt)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-0.5 rounded">À jour (0 F)</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.current_debt > 0 && (
                          <>
                            <button
                              onClick={() => openPaymentModal(item)}
                              title="Encaisser un versement"
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition"
                            >
                              <DollarSign className="w-3.5 h-3.5" /> Encaisser
                            </button>
                            <button
                              onClick={() => handleWhatsAppReminder(item)}
                              title="Relance WhatsApp"
                              className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setStatementCustomer(item)}
                          title="Relevé de Compte"
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Création Client */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Nouveau client</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Code Client</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="Auto (ex: CLI-001)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">N° IFU Bénin</label>
                  <input
                    type="text"
                    value={form.ifu_number}
                    onChange={(e) => setForm({ ...form, ifu_number: e.target.value })}
                    placeholder="13 chiffres"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nom / Entreprise *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nom du client"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Téléphone *</label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+229 97 00 00 00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="client@mail.bj"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ville</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Plafond de Crédit (FCFA)</label>
                  <input
                    type="number"
                    value={form.credit_limit}
                    onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
                >
                  {saving ? 'Enregistrement...' : 'Créer le client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Encaisser Remboursement de Créance */}
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Encaisser un Remboursement</h3>
                <p className="text-xs text-slate-500">Règlement d'arriéré client</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessPayment} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                <p className="font-bold text-slate-800">{selectedCustomer.name}</p>
                <p className="text-xs text-slate-500 font-mono">Code: {selectedCustomer.code} | Tél: {selectedCustomer.phone}</p>
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-xs text-slate-600 font-semibold">Créance totale due :</span>
                  <span className="text-sm font-black text-red-600">{fmt(selectedCustomer.current_debt)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Montant à Encaisser (FCFA) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={selectedCustomer.current_debt}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-lg font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex justify-between items-center mt-1 text-xs text-slate-400">
                  <span>Solde restant après paiement :</span>
                  <span className="font-bold text-slate-700">{fmt(Math.max(0, selectedCustomer.current_debt - paymentAmount))}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mode d'Encaissement *</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'cash', label: 'Espèces (Caisse)' },
                    { id: 'momo', label: 'MTN MoMo' },
                    { id: 'moov', label: 'Moov Money' },
                    { id: 'wave', label: 'Wave' },
                    { id: 'bank', label: 'Banque / Chèque' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMode(m.id)}
                      className={`p-2 rounded-lg border font-medium transition text-left ${
                        paymentMode === m.id
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Référence / Quittance / Note</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ex: Versement partiel, Chèque N°..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessingPayment || paymentAmount <= 0}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isProcessingPayment ? 'Validation...' : 'Valider l\'Encaissement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reçu de Remboursement Imprimable */}
      {settlementReceipt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-bold text-slate-800">Reçu de Règlement Officiel</h3>
              </div>
              <button onClick={() => setSettlementReceipt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps du Reçu */}
            <div id="receipt-print-area" className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-sans text-xs space-y-3">
              <div className="text-center pb-2 border-b border-slate-300">
                <p className="font-black text-sm text-slate-800 uppercase">{company?.name || 'GESTIO 229 BOUTIQUE'}</p>
                <p className="text-slate-500">IFU: {(company as any)?.ifu_number || '0202618902891'} | Tél: {(company as any)?.phone || '+229 01 97 00 00 00'}</p>
                <p className="text-slate-400 font-mono">{settlementReceipt.receiptNumber}</p>
                <p className="text-[10px] text-slate-400">{new Date(settlementReceipt.date).toLocaleString('fr-BJ')}</p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400">Client Débiteur</span>
                <p className="font-bold text-slate-800 text-sm">{settlementReceipt.customerName}</p>
                <p className="text-slate-500">Code: {settlementReceipt.customerCode} | Tél: {settlementReceipt.customerPhone}</p>
                {settlementReceipt.customerIfu && <p className="text-slate-500">IFU: {settlementReceipt.customerIfu}</p>}
              </div>

              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Créance Initiale :</span>
                  <span className="font-medium text-slate-700">{fmt(settlementReceipt.previousDebt)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 text-sm border-y border-dashed py-1">
                  <span>Montant Encaissé :</span>
                  <span>{fmt(settlementReceipt.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-red-600">
                  <span>Reste à Payer :</span>
                  <span>{fmt(settlementReceipt.remainingDebt)}</span>
                </div>
                <div className="flex justify-between text-slate-500 pt-1 text-[11px]">
                  <span>Mode de paiement :</span>
                  <span className="font-medium text-slate-700">{settlementReceipt.paymentMethod}</span>
                </div>
                {settlementReceipt.notes && (
                  <div className="text-[10px] text-slate-400 italic pt-1">
                    Note: {settlementReceipt.notes}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-between text-[11px] text-slate-500">
                <div className="text-center">
                  <p>Signature Client</p>
                  <div className="h-10 border-b border-dotted border-slate-400 w-24 mx-auto mt-1" />
                </div>
                <div className="text-center">
                  <p>Cachet & Caisse</p>
                  <div className="h-10 border-b border-dotted border-slate-400 w-24 mx-auto mt-1" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" /> Imprimer le Reçu
              </button>
              <button
                onClick={() => setSettlementReceipt(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Relevé de Compte Client */}
      {statementCustomer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Relevé de Compte Tiers Client</h3>
                <p className="text-xs text-slate-500">Situation financière et historique des créances</p>
              </div>
              <button onClick={() => setStatementCustomer(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-sm text-slate-800">{statementCustomer.name}</p>
                  <p className="text-slate-500 font-mono">Code: {statementCustomer.code} | N° IFU: {statementCustomer.ifu_number || 'Non renseigné'}</p>
                  <p className="text-slate-500">Téléphone: {statementCustomer.phone} | Ville: {statementCustomer.city || 'Cotonou'}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Solde Débiteur Actuel</span>
                  <p className="text-xl font-black text-red-600">{fmt(statementCustomer.current_debt)}</p>
                  <p className="text-[11px] text-slate-500">Plafond accordé: {fmt(statementCustomer.credit_limit || 0)}</p>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-700 mb-2">Conditions Commerciales OHADA</p>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>Délai de paiement : <strong>{statementCustomer.payment_terms_days} jours</strong></div>
                  <div>Statut du compte : <strong className={statementCustomer.is_active ? 'text-emerald-600' : 'text-slate-400'}>{statementCustomer.is_active ? 'Actif' : 'Suspendu'}</strong></div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <p className="font-bold">Mention Légale de Recouvrement (Bénin) :</p>
                <p className="text-[11px] mt-0.5">
                  Conformément aux dispositions de l'Acte Uniforme OHADA portant organisation des sûretés et recouvrement des créances,
                  ce relevé fait foi du solde exigible en compte à la date du {new Date().toLocaleDateString('fr-BJ')}.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Imprimer le Relevé
              </button>
              <button
                onClick={() => setStatementCustomer(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientsPage
