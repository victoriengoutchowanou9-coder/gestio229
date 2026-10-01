// =============================================================================
// GESTIO 229 SaaS — Clients & Créances (Norme Bénin & UEMOA)
// Gestion du répertoire client, autorisation de crédit (Oui/Non),
// Dette initiale, encaissement des arriérés, relances WhatsApp et reçus
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Users, Plus, Search, Phone, MapPin, AlertCircle, RefreshCw, X,
  DollarSign, MessageCircle, FileText, Printer, CheckCircle2, ArrowDownCircle,
  CreditCard, Smartphone, ShieldCheck, History, Edit3
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { formatFCFA } from '../../../utils/tax'
import { logAuditEvent } from '../../../services/auditService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

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
  total_invoiced?: number
  total_reimbursed?: number
  payment_terms_days: number
  credit_authorized?: boolean
  discount_eligible?: boolean
  discount_rate?: number
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

interface CustomerFormState {
  code: string
  name: string
  ifu_number: string
  phone: string
  email: string
  address: string
  city: string
  credit_choice: 'oui' | 'non' | null
  credit_limit: string | number
  discount_eligible: boolean
  discount_rate: string | number
  payment_terms_days: number
}

const initialFormState: CustomerFormState = {
  code: '',
  name: '',
  ifu_number: '',
  phone: '',
  email: '',
  address: '',
  city: 'Cotonou',
  credit_choice: null, // Par défaut : Non coché / aucune sélection
  credit_limit: '',
  discount_eligible: false,
  discount_rate: '',
  payment_terms_days: 30,
}

const ClientsPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDebtorsOnly, setFilterDebtorsOnly] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Modal Dette Initiale
  const [showInitialDebtModal, setShowInitialDebtModal] = useState(false)
  const [initialDebtForm, setInitialDebtForm] = useState({
    customerId: '',
    amount: 0,
    motif: 'Report arriéré antérieur',
  })
  const [savingInitialDebt, setSavingInitialDebt] = useState(false)

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

  const [form, setForm] = useState<CustomerFormState>(initialFormState)

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

      // Isolation stricte par sous-logiciel : filtrer pour le secteur actif
      const sectorFiltered = filterItemsForSector(data || [], currentSectorSlug)

      const mapped: Customer[] = sectorFiltered.map((c: any) => {
        const creditLimit = Number(c.credit_limit) || 0
        const isCreditAuth = Boolean(c.credit_authorized) || (creditLimit > 0)
        const isDiscount = Boolean(c.discount_eligible)
        const discountRate = Number(c.discount_rate) || 0

        return {
          ...c,
          credit_limit: creditLimit,
          credit_authorized: isCreditAuth,
          discount_eligible: isDiscount,
          discount_rate: discountRate,
        }
      })

      setCustomers(mapped)
    } catch (err: any) {
      toast.error('Erreur chargement clients', err.message)
      setCustomers([])
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

  // Création Client avec validation stricte
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) {
      toast.error('Session invalide', 'Veuillez vous reconnecter pour enregistrer un client.')
      return
    }

    // 1. Validation Nom / Entreprise * (obligatoire)
    if (!form.name.trim()) {
      toast.error('Nom obligatoire', 'Veuillez saisir le nom ou l\'entreprise du client.')
      return
    }

    // 2. Validation Téléphone * (obligatoire)
    if (!form.phone.trim()) {
      toast.error('Téléphone obligatoire', 'Veuillez saisir le numéro de téléphone du client.')
      return
    }

    // 3. Validation N° IFU Bénin (optionnel, 13 chiffres si renseigné)
    const trimmedIfu = form.ifu_number.trim()
    if (trimmedIfu && !/^\d{13}$/.test(trimmedIfu)) {
      toast.error(
        'N° IFU Bénin Invalide',
        'Le numéro IFU Bénin doit comporter exactement 13 chiffres numériques (ou laisser vide).'
      )
      return
    }

    // 4. Validation Réduction prix
    if (form.discount_eligible) {
      const parsedRate = Number(form.discount_rate)
      if (!form.discount_rate || isNaN(parsedRate) || parsedRate <= 0 || parsedRate > 100) {
        toast.error(
          'Taux de réduction requis',
          'Veuillez renseigner un taux de réduction valide supérieur à 0% et inférieur ou égal à 100% (ou décocher la réduction).'
        )
        return
      }
    }

    // 5. Validation Logique Crédit
    // Si Oui est coché → le champ "Plafond de Crédit (FCFA)" devient obligatoire et doit être > 0
    if (form.credit_choice === 'oui') {
      const parsedLimit = Number(form.credit_limit)
      if (!form.credit_limit || isNaN(parsedLimit) || parsedLimit <= 0) {
        toast.error(
          'Plafond de crédit requis',
          'Vous avez autorisé le crédit : veuillez indiquer un Plafond de Crédit obligatoire supérieur à 0 FCFA.'
        )
        return
      }
    }

    setSaving(true)
    try {
      // Auto-génération du code client CLI-001, CLI-002...
      let autoCode = form.code.trim()
      if (!autoCode) {
        const cliNums = customers
          .map((c) => {
            const m = c.code?.match(/CLI-(\d+)/i)
            return m ? parseInt(m[1], 10) : 0
          })
          .filter((n) => !isNaN(n))
        const nextNum = cliNums.length > 0 ? Math.max(...cliNums) + 1 : customers.length + 1
        autoCode = `CLI-${String(nextNum).padStart(3, '0')}`
      }

      const isCreditAuthorized = form.credit_choice === 'oui'
      const creditLimit = isCreditAuthorized ? Number(form.credit_limit) : 0
      const isDiscountEligible = Boolean(form.discount_eligible)
      const discountRate = isDiscountEligible ? Number(form.discount_rate) : 0

      const corePayload = {
        company_id: company.id,
        code: autoCode,
        name: form.name.trim(),
        ifu_number: trimmedIfu || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || 'Cotonou',
        credit_limit: creditLimit,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        current_debt: 0,
        is_active: true,
      }

      const { data: insertedData, error: insertErr } = await supabase
        .from('customers')
        .insert(corePayload)
        .select()
        .single()

      if (insertErr || !insertedData) {
        throw new Error(insertErr?.message || "Échec d'enregistrement du client dans Supabase.")
      }

      const savedRecord = insertedData
      const newCustomer: Customer = {
        ...savedRecord,
        credit_limit: creditLimit,
        credit_authorized: isCreditAuthorized,
        discount_eligible: isDiscountEligible,
        discount_rate: discountRate,
      }

      // Mise à jour immédiate de la liste locale (Optimistic UI)
      setCustomers((prev) => [newCustomer, ...prev.filter(c => c.id !== newCustomer.id)])
      setShowModal(false)
      setForm(initialFormState)
      toast.success('Client enregistré avec succès', `${form.name.trim()} (${autoCode})`)
    } catch (err: any) {
      toast.error('Erreur enregistrement client', err.message || 'Impossible d\'enregistrer le client.')
    } finally {
      setSaving(false)
    }
  }

  // Ajouter dette initiale
  const handleAddInitialDebt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!initialDebtForm.customerId || initialDebtForm.amount <= 0) return

    setSavingInitialDebt(true)
    try {
      const cust = customers.find((c) => c.id === initialDebtForm.customerId)
      if (!cust) return

      const updatedDebt = (Number(cust.current_debt) || 0) + Number(initialDebtForm.amount)
      const { error } = await supabase
        .from('customers')
        .update({ current_debt: updatedDebt })
        .eq('id', cust.id)

      if (error) throw error

      toast.success('Dette initiale ajoutée', `${cust.name} : +${fmt(initialDebtForm.amount)}`)
      setShowInitialDebtModal(false)
      setInitialDebtForm({ customerId: '', amount: 0, motif: 'Report arriéré antérieur' })
      loadCustomers()
    } catch (err: any) {
      toast.error('Erreur ajout dette', err.message)
    } finally {
      setSavingInitialDebt(false)
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

    const prevDebt = Number(selectedCustomer.current_debt) || 0
    if (paymentAmount > prevDebt) {
      toast.error('Montant invalide', 'Le montant du remboursement ne peut pas dépasser la dette actuelle.')
      return
    }

    setIsProcessingPayment(true)
    try {
      const newDebt = Math.max(0, Math.round((prevDebt - paymentAmount) * 100) / 100)
      const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`

      // 1. Mettre à jour la dette client dans Supabase
      const { error: updErr } = await supabase
        .from('customers')
        .update({ current_debt: newDebt })
        .eq('id', selectedCustomer.id)

      if (updErr) throw updErr

      // 2. Insérer dans la table customer_repayments pour traçabilité comptable et historique
      const normalizedMethod = paymentMode === 'cash' ? 'especes' : paymentMode
      try {
        await supabase
          .from('customer_repayments')
          .insert({
            company_id: company?.id,
            customer_id: selectedCustomer.id,
            amount: paymentAmount,
            payment_method: normalizedMethod,
            reference: receiptNumber,
            notes: paymentNotes || `Remboursement créance client ${selectedCustomer.name}`,
            created_at: new Date().toISOString()
          })
      } catch (repErr) {
        console.warn('Fallback insertion customer_repayments :', repErr)
      }

      // 3. Entrée immédiate dans la caisse opérationnelle (Supabase)
      if (company?.id) {
        try {
          const { data: reg } = await supabase.from('cash_registers').select('id, current_cash_balance, current_momo_balance').eq('company_id', company.id).limit(1).maybeSingle()
          if (reg) {
            if (paymentMode === 'cash') {
              await supabase.from('cash_registers').update({ current_cash_balance: (Number(reg.current_cash_balance) || 0) + paymentAmount }).eq('id', reg.id)
            } else if (['momo', 'moov', 'wave'].includes(paymentMode)) {
              await supabase.from('cash_registers').update({ current_momo_balance: (Number(reg.current_momo_balance) || 0) + paymentAmount }).eq('id', reg.id)
            }
          }
        } catch (e) {}
      }

      // 4. Traçabilité Journal d'Audit
      await logAuditEvent({
        action: 'RECOUVREMENT_CREANCE',
        module: 'CLIENTS',
        sector: 'COMMERCIAL',
        description: `Règlement de créance pour ${selectedCustomer.name} (${selectedCustomer.code}) : ${fmt(paymentAmount)} réglé en ${paymentMode}. Solde antérieur : ${fmt(prevDebt)}, Nouveau solde : ${fmt(newDebt)}. Reçu N° ${receiptNumber}`
      })

      // 5. Préparer le reçu de versement imprimable
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
      toast.success('Règlement enregistré avec succès', `${fmt(paymentAmount)} reçus et ajoutés à la caisse.`)
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
          <p className="text-slate-500 text-sm mt-1">
            Répertoire commercial, autorisation de crédit, encaissement des arriérés et suivi des créances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInitialDebtModal(true)}
            className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-sm"
          >
            <History className="w-4 h-4" /> Ajouter dette initiale
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-emerald-700 transition shadow-sm"
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
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Table des Clients : Client | Total Facturé | Total Remboursé | Solde Dû | Crédit Autorisé | Actions */}
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
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase">
                <tr>
                  <th className="px-5 py-3.5">Client</th>
                  <th className="px-5 py-3.5 text-right">Total Facturé</th>
                  <th className="px-5 py-3.5 text-right">Total Remboursé</th>
                  <th className="px-5 py-3.5 text-right">Solde Dû</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filtered.map((item) => {
                  const currentDebt = Number(item.current_debt) || 0
                  const totalFacture = (Number(item.total_invoiced) || currentDebt)
                  const totalRembourse = Math.max(0, totalFacture - currentDebt)

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                          {item.discount_eligible && (item.discount_rate || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Remise {item.discount_rate}%
                            </span>
                          )}
                          {item.credit_authorized ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Crédit max: {fmt(item.credit_limit)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                              Sans crédit
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-slate-500 flex-wrap">
                          <span className="font-mono text-[11px] text-slate-400">{item.code}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-sans text-xs text-slate-600">
                            <Phone className="w-3 h-3 text-slate-400" /> {item.phone}
                          </span>
                          {item.ifu_number && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] text-slate-500">IFU: {item.ifu_number}</span>
                            </>
                          )}
                          {item.city && (
                            <>
                              <span>•</span>
                              <span className="text-[11px] text-slate-400">{item.city}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-medium text-slate-800 text-sm">
                        {fmt(totalFacture)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-medium text-emerald-700 text-sm">
                        {fmt(totalRembourse)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-sm">
                        {currentDebt > 0 ? (
                          <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                            {fmt(currentDebt)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">0 FCFA</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setStatementCustomer(item)}
                            title="Historique des factures et règlements"
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5 text-slate-500" /> Détails
                          </button>
                          {currentDebt > 0 && (
                            <>
                              <button
                                onClick={() => openPaymentModal(item)}
                                title="Enregistrer un paiement qui diminue la dette et entre dans la caisse"
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
                              >
                                <DollarSign className="w-3.5 h-3.5" /> Remboursement
                              </button>
                              <button
                                onClick={() => handleWhatsAppReminder(item)}
                                title="Relance WhatsApp avec solde restant dû"
                                className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition shadow-sm"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Création Client avec Logique Crédit et Réduction */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Nouveau client</h3>
                <p className="text-xs text-slate-500">
                  Enregistrement pour facturation et gestion commerciale
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false)
                  setForm(initialFormState)
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bannière Objectif Principal : Affichage Facture */}
            <div className="mb-4 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">Affichage Facture de Vente :</span> Ce client sera automatiquement disponible au Point de Vente (POS) et son nom / entreprise s'affichera directement sur ses factures et tickets de vente.
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Ligne 1 : Code Client (Auto) & N° IFU Bénin (13 chiffres) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Code Client <span className="text-slate-400 font-normal">(Auto)</span>
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="Auto (ex: CLI-001)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    N° IFU Bénin <span className="text-slate-400 font-normal">(Optionnel, 13 chiffres)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={13}
                    value={form.ifu_number}
                    onChange={(e) => setForm({ ...form, ifu_number: e.target.value.replace(/\D/g, '') })}
                    placeholder="13 chiffres numériques"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {form.ifu_number && form.ifu_number.length !== 13 && (
                    <p className="text-[10px] text-amber-600 mt-1 font-mono">
                      {form.ifu_number.length}/13 chiffres saisis
                    </p>
                  )}
                </div>
              </div>

              {/* Ligne 2 : Nom / Entreprise * (Obligatoire) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom / Entreprise <span className="text-rose-600 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: ETS BIO BÉNIN & FILS, Cabinet ABC..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Ligne 3 : Téléphone * (Obligatoire) & Email (Optionnel) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Téléphone <span className="text-rose-600 font-bold">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+229 97 00 00 00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email <span className="text-slate-400 font-normal">(Optionnel)</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="client@domaine.bj"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Ligne 4 : Ville (Optionnel) & Adresse (Optionnel) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ville <span className="text-slate-400 font-normal">(Optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Ex: Cotonou, Porto-Novo, Parakou..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Adresse / Quartier <span className="text-slate-400 font-normal">(Optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Ex: Dantokpa, Akpakpa, Cadjehoun..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* SECTION 3 : Réduction Prix */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.discount_eligible}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setForm({
                        ...form,
                        discount_eligible: checked,
                        discount_rate: checked ? (form.discount_rate || '') : '',
                      })
                    }}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Client bénéficie d'une réduction
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Cochez pour accorder automatiquement un taux de remise sur ses factures de vente
                    </p>
                  </div>
                </label>

                {form.discount_eligible && (
                  <div className="pt-2 border-t border-amber-200/80 flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-amber-900 mb-1">
                        Taux de réduction (%) <span className="text-rose-600 font-bold">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0.1"
                          max="100"
                          step="0.5"
                          required={form.discount_eligible}
                          value={form.discount_rate}
                          onChange={(e) => setForm({ ...form, discount_rate: e.target.value })}
                          placeholder="Ex: 5"
                          className="w-full pl-3 pr-8 py-2 border border-amber-300 rounded-xl text-sm font-bold text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-amber-700">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-amber-800 max-w-[200px] leading-tight">
                      Cette réduction sera appliquée automatiquement lors de la sélection du client en caisse.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION 4 : Logique Crédit (Oui / Non / Non sélectionné) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Autoriser le crédit aux achats :
                    </span>
                    {form.credit_choice !== null && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, credit_choice: null, credit_limit: '' })}
                        className="text-[10px] text-slate-500 hover:text-slate-800 underline font-medium"
                      >
                        Réinitialiser (Non coché)
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Par défaut non coché : le client est enregistré sans crédit pour l'affichage sur facture.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Option Oui */}
                  <label
                    className={clsx(
                      "p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition",
                      form.credit_choice === 'oui'
                        ? "border-emerald-500 bg-emerald-50/70 text-emerald-900 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="credit_auth_choice"
                        checked={form.credit_choice === 'oui'}
                        onChange={() => setForm({ ...form, credit_choice: 'oui' })}
                        className="w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold">Oui (Autorisé)</span>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                      Plafond requis
                    </span>
                  </label>

                  {/* Option Non */}
                  <label
                    className={clsx(
                      "p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition",
                      form.credit_choice === 'non'
                        ? "border-rose-500 bg-rose-50/70 text-rose-900 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="credit_auth_choice"
                        checked={form.credit_choice === 'non'}
                        onChange={() => setForm({ ...form, credit_choice: 'non', credit_limit: 0 })}
                        className="w-4 h-4 text-rose-600 accent-rose-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold">Non (Refusé)</span>
                    </div>
                    <span className="text-[10px] font-semibold text-rose-700 bg-rose-100/60 px-1.5 py-0.5 rounded">
                      Plafond = 0
                    </span>
                  </label>
                </div>

                {/* Champ Plafond de Crédit */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Plafond de Crédit (FCFA)
                      {form.credit_choice === 'oui' ? (
                        <span className="text-rose-600 font-bold ml-1">* (Obligatoire &gt; 0)</span>
                      ) : (
                        <span className="text-slate-400 font-normal ml-1">(Désactivé)</span>
                      )}
                    </label>
                    {form.credit_choice === 'oui' && (
                      <span className="text-[10px] font-mono text-emerald-600 font-bold">
                        {form.credit_limit ? fmt(Number(form.credit_limit)) : '0 FCFA'}
                      </span>
                    )}
                  </div>

                  <input
                    type="number"
                    disabled={form.credit_choice !== 'oui'}
                    required={form.credit_choice === 'oui'}
                    min={form.credit_choice === 'oui' ? 1 : 0}
                    value={form.credit_choice === 'oui' ? form.credit_limit : 0}
                    onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                    placeholder={form.credit_choice === 'oui' ? "Ex: 500000" : "0 FCFA (Crédit non accordé)"}
                    className={clsx(
                      "w-full px-3 py-2.5 border rounded-xl text-sm font-mono font-bold transition",
                      form.credit_choice === 'oui'
                        ? "border-emerald-300 bg-white text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    )}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {form.credit_choice === 'oui'
                      ? "Montant maximal d'arriéré d'achat toléré pour ce client."
                      : form.credit_choice === 'non'
                      ? "Crédit désactivé. Toute vente à crédit sera bloquée pour ce client."
                      : "Aucune sélection : client enregistré uniquement pour affichage sur facture (Plafond 0 FCFA)."}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setForm(initialFormState)
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement...
                    </>
                  ) : (
                    'Enregistrer le client'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Ajouter dette initiale (Règle 19) */}
      {showInitialDebtModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">Ajouter une dette initiale</h3>
                <p className="text-xs text-slate-400">Report d'arriéré antérieur au démarrage de l'ERP</p>
              </div>
              <button onClick={() => setShowInitialDebtModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddInitialDebt} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sélectionnez le client *</label>
                <select
                  required
                  value={initialDebtForm.customerId}
                  onChange={(e) => setInitialDebtForm({ ...initialDebtForm, customerId: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                >
                  <option value="">-- Choisir un client --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Solde actuel : {fmt(c.current_debt)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Montant de la Dette Initiale (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={initialDebtForm.amount || ''}
                  onChange={(e) => setInitialDebtForm({ ...initialDebtForm, amount: Number(e.target.value) })}
                  placeholder="Ex: 50000"
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-black font-mono text-rose-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Motif / Justificatif</label>
                <input
                  type="text"
                  value={initialDebtForm.motif}
                  onChange={(e) => setInitialDebtForm({ ...initialDebtForm, motif: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInitialDebtModal(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingInitialDebt || initialDebtForm.amount <= 0 || !initialDebtForm.customerId}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {savingInitialDebt ? 'Enregistrement...' : 'Valider la dette'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Encaisser Remboursement de Créance */}
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
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
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-lg font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
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

      {/* MODAL 4: Reçu de Remboursement Imprimable */}
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

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-sans text-xs space-y-3">
              <div className="text-center pb-2 border-b border-slate-300">
                <p className="font-black text-sm text-slate-800 uppercase">{company?.name || 'ENTREPRISE'}</p>
                <p className="text-slate-500">IFU: {(company as any)?.ifu_number || 'Non renseigné'} | Tél: {(company as any)?.phone || 'Non renseigné'}</p>
                <p className="text-slate-400 font-mono">{settlementReceipt.receiptNumber}</p>
                <p className="text-[10px] text-slate-400">{new Date(settlementReceipt.date).toLocaleString('fr-BJ')}</p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400">Client Débiteur</span>
                <p className="font-bold text-slate-800 text-sm">{settlementReceipt.customerName}</p>
                <p className="text-slate-500">Code: {settlementReceipt.customerCode} | Tél: {settlementReceipt.customerPhone}</p>
              </div>

              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200 font-mono">
                <div className="flex justify-between font-sans">
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
              </div>

              <div className="pt-2 flex justify-between text-[11px] text-slate-500">
                <div className="text-center">
                  <p>Signature Client</p>
                  <div className="h-8 border-b border-dotted border-slate-400 w-24 mx-auto mt-1" />
                </div>
                <div className="text-center">
                  <p>Cachet Caisse</p>
                  <div className="h-8 border-b border-dotted border-slate-400 w-24 mx-auto mt-1" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Imprimer
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

      {/* MODAL 5: Relevé de Compte Client (Détails) */}
      {statementCustomer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Relevé de Compte Client</h3>
                <p className="text-xs text-slate-500">Détails de la créance et conditions commerciales</p>
              </div>
              <button onClick={() => setStatementCustomer(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 text-xs font-sans">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-sm text-slate-800">{statementCustomer.name}</p>
                  <p className="text-slate-500 font-mono">Code: {statementCustomer.code} | IFU: {statementCustomer.ifu_number || 'Non renseigné'}</p>
                  <p className="text-slate-500">Tél: {statementCustomer.phone} | Ville: {statementCustomer.city || 'Cotonou'}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Solde Débiteur Exigible</span>
                  <p className="text-xl font-black text-rose-600 font-mono">{fmt(statementCustomer.current_debt)}</p>
                  <p className="text-[11px] text-slate-500">Plafond autorisé: {fmt(statementCustomer.credit_limit || 0)}</p>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2 text-slate-600">
                <div>Crédit autorisé aux achats : <strong className={statementCustomer.credit_authorized ? 'text-emerald-700' : 'text-rose-700'}>{statementCustomer.credit_authorized ? 'Oui' : 'Non'}</strong></div>
                <div>Délai de paiement accordé : <strong>{statementCustomer.payment_terms_days} jours</strong></div>
                <div>Remise accordée : <strong className={statementCustomer.discount_eligible ? 'text-amber-700' : 'text-slate-700'}>{statementCustomer.discount_eligible && (statementCustomer.discount_rate || 0) > 0 ? `${statementCustomer.discount_rate}%` : 'Aucune (0%)'}</strong></div>
                <div>Statut Facturation : <strong className="text-emerald-700">Actif</strong></div>
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
