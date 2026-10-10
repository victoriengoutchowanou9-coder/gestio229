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
  CreditCard, Smartphone, ShieldCheck, History, Edit3, Trash2, AlertTriangle,
  Tag, SlidersHorizontal
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { getNextSectorCode, getCurrentCashSession } from '../../../lib/supabaseTenant'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { formatFCFA } from '../../../utils/tax'
import { logAuditEvent } from '../../../services/auditService'
import { enregistrerMouvementCaisse } from '../../../services/caisseSectorService'
import {
  BrasserieClientPrixPersonnalise,
  fetchClientPrixPersonnalises,
  saveClientPrixPersonnalise,
  deleteClientPrixPersonnalise
} from '../../../services/brasseriePricingService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export interface ClientDebt {
  id: string
  company_id: string
  sector_code: string
  client_id: string
  total_dette: number
  total_rembourse: number
  solde_du: number
  status: 'en_cours' | 'soldée' | string
  created_at: string
  updated_at: string
}

export interface DebtPayment {
  id: string
  company_id: string
  sector_code: string
  debt_id: string
  client_id: string
  amount: number
  payment_method: string
  payment_date: string
  cash_session_id?: string
  reste_apres: number
  reference?: string
  notes?: string
  created_by?: string
  created_at: string
}

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
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId, sectorSlug, supabaseTenant } = useTenant()

  const currentSectorSlug = sectorSlug || getActiveSectorSlug()
  const currentCompanyId = companyId || company?.id || ''

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [filterDebtorsOnly, setFilterDebtorsOnly] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Données client_debts et debt_payments (Module Créances & Remboursements)
  const [debtsByClient, setDebtsByClient] = useState<Record<string, ClientDebt[]>>({})
  const [payments, setPayments] = useState<DebtPayment[]>([])
  const [paymentsByClientState, setPaymentsByClientState] = useState<Record<string, DebtPayment[]>>({})
  const setPaymentsByClient = useCallback((val: Record<string, DebtPayment[]>) => {
    setPaymentsByClientState(val || {})
  }, [])

  const paymentsByClient = useMemo(() => {
    const base: Record<string, DebtPayment[]> = { ...(paymentsByClientState || {}) }
    if (!payments || !Array.isArray(payments)) return base
    return payments.reduce((acc: Record<string, DebtPayment[]>, p: any) => {
      const key = p.client_id || p.clientId || 'inconnu'
      if (!acc[key]) acc[key] = []
      acc[key].push({
        ...p,
        amount: Number(p.amount) || 0,
        reste_apres: Number(p.reste_apres) || 0,
      })
      return acc
    }, base)
  }, [payments, paymentsByClientState])

  const [activeDetailsCustomer, setActiveDetailsCustomer] = useState<Customer | null>(null)

  // Emballages & Consignations client (Brasserie uniquement)
  const [customerConsignations, setCustomerConsignations] = useState<{ code: string; designation: string; total_sorti: number; total_retourne: number; solde_du: number }[]>([])

  useEffect(() => {
    if (activeDetailsCustomer && currentSectorSlug === 'brasserie' && companyId) {
      supabase
        .from('brasserie_consignations')
        .select('total_sorti, total_retourne, solde_du, emballage:brasserie_emballages(code, designation)')
        .eq('company_id', companyId)
        .eq('sector_slug', 'brasserie')
        .eq('client_id', activeDetailsCustomer.id)
        .then(({ data }) => {
          if (data) {
            setCustomerConsignations(
              data
                .filter((c: any) => {
                  const code = (c.emballage?.code || '').trim()
                  return code && (!code.includes('-') || code.length <= 10) && /^C\d+T$/i.test(code)
                })
                .map((c: any) => ({
                  code: c.emballage?.code || 'EMB',
                  designation: c.emballage?.designation || 'Emballage',
                  total_sorti: c.total_sorti || 0,
                  total_retourne: c.total_retourne || 0,
                  solde_du: c.solde_du || 0,
                }))
            )
          } else {
            setCustomerConsignations([])
          }
        })
    } else {
      setCustomerConsignations([])
    }
  }, [activeDetailsCustomer, currentSectorSlug, companyId])

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
  const [paymentMode, setPaymentMode] = useState<string>('Espèces')
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 16))
  const [paymentReference, setPaymentReference] = useState<string>('')
  const [paymentNotes, setPaymentNotes] = useState<string>('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  // Reçu de remboursement actif & situation globale
  const [activePaymentReceipt, setActivePaymentReceipt] = useState<{
    payment: DebtPayment
    customer: Customer
    debt?: ClientDebt | null
  } | null>(null)
  const [activeGlobalStatement, setActiveGlobalStatement] = useState<Customer | null>(null)

  // ─── Tarification Personnalisée Client (Brasserie & Dépôt de Boissons) ────────
  const [customPricesCustomer, setCustomPricesCustomer] = useState<Customer | null>(null)
  const [customPricesList, setCustomPricesList] = useState<BrasserieClientPrixPersonnalise[]>([])
  const [brasserieProducts, setBrasserieProducts] = useState<any[]>([])
  const [loadingCustomPrices, setLoadingCustomPrices] = useState(false)
  const [savingCustomPrice, setSavingCustomPrice] = useState(false)
  const [customPriceEditingProdId, setCustomPriceEditingProdId] = useState<string | null>(null)
  const [customPriceForm, setCustomPriceForm] = useState<{
    produit_id: string
    prix_personnalise_fcfa: number | string
    statut: 'ACTIF' | 'INACTIF'
    notes: string
  }>({
    produit_id: '',
    prix_personnalise_fcfa: '',
    statut: 'ACTIF',
    notes: '',
  })

  const openCustomPricesModal = async (c: Customer) => {
    setCustomPricesCustomer(c)
    setLoadingCustomPrices(true)
    setCustomPriceEditingProdId(null)
    setCustomPriceForm({
      produit_id: '',
      prix_personnalise_fcfa: '',
      statut: 'ACTIF',
      notes: '',
    })

    try {
      if (brasserieProducts.length === 0 && currentCompanyId) {
        const { data: prods } = await supabase
          .from('products')
          .select('*')
          .eq('company_id', currentCompanyId)
          .neq('is_active', false)
          .order('name')
        if (prods) setBrasserieProducts(prods)
      }

      const prices = await fetchClientPrixPersonnalises(currentCompanyId, c.id)
      setCustomPricesList(prices)
    } catch (err) {
      console.error(err)
      toast.error('Erreur', 'Impossible de charger les prix personnalisés du client.')
    } finally {
      setLoadingCustomPrices(false)
    }
  }

  const handleSaveCustomPrice = async () => {
    if (!customPricesCustomer || !customPriceForm.produit_id) {
      toast.error('Sélection requise', 'Veuillez sélectionner un produit.')
      return
    }

    const price = Number(customPriceForm.prix_personnalise_fcfa)
    if (isNaN(price) || price < 0) {
      toast.error('Prix invalide', 'Veuillez saisir un prix positif.')
      return
    }

    setSavingCustomPrice(true)
    try {
      await saveClientPrixPersonnalise(currentCompanyId, currentSectorSlug, {
        client_id: customPricesCustomer.id,
        produit_id: customPriceForm.produit_id,
        prix_personnalise_fcfa: price,
        statut: customPriceForm.statut,
        notes: customPriceForm.notes,
      })

      toast.success('Succès', 'Prix personnalisé enregistré.')
      setCustomPriceEditingProdId(null)
      setCustomPriceForm({
        produit_id: '',
        prix_personnalise_fcfa: '',
        statut: 'ACTIF',
        notes: '',
      })

      const refreshed = await fetchClientPrixPersonnalises(currentCompanyId, customPricesCustomer.id)
      setCustomPricesList(refreshed)
    } catch (err: any) {
      console.error(err)
      toast.error('Erreur', `Échec d'enregistrement : ${err?.message || err}`)
    } finally {
      setSavingCustomPrice(false)
    }
  }

  const handleDeleteCustomPrice = async (produitId: string) => {
    if (!customPricesCustomer) return
    if (!window.confirm('Supprimer ce prix personnalisé ? Ce client basculera sur la grille automatique ou le prix standard pour ce produit.')) return

    try {
      await deleteClientPrixPersonnalise(currentCompanyId, customPricesCustomer.id, produitId)
      toast.success('Succès', 'Prix personnalisé supprimé.')
      const refreshed = await fetchClientPrixPersonnalises(currentCompanyId, customPricesCustomer.id)
      setCustomPricesList(refreshed)
    } catch (err: any) {
      toast.error('Erreur', 'Impossible de supprimer le prix personnalisé.')
    }
  }

  // Modal Suppression Client (Contrôle d'intégrité & Soft/Hard delete)
  const [deleteCustomerModal, setDeleteCustomerModal] = useState<Customer | null>(null)
  const [customerHasSales, setCustomerHasSales] = useState<boolean | null>(null)
  const [checkingSales, setCheckingSales] = useState<boolean>(false)
  const [deletingCustomer, setDeletingCustomer] = useState<boolean>(false)

  const handleOpenDeleteModal = async (c: Customer) => {
    setDeleteCustomerModal(c)
    setCheckingSales(true)
    setCustomerHasSales(null)
    try {
      const { data: sales } = await supabaseTenant('sales_orders')
        .select('id')
        .eq('customer_id', c.id)
        .limit(1)

      setCustomerHasSales(Boolean(sales && sales.length > 0))
    } catch (e) {
      setCustomerHasSales(false)
    } finally {
      setCheckingSales(false)
    }
  }

  const handleConfirmDeleteCustomer = async (softDeleteOnly: boolean) => {
    if (!deleteCustomerModal || !companyId) return
    setDeletingCustomer(true)
    try {
      if (softDeleteOnly || customerHasSales) {
        // Soft delete : conservation historique légale des factures
        const { error } = await supabaseTenant('clients')
          .update({ is_active: false })
          .eq('id', deleteCustomerModal.id)

        if (error) throw error
        toast.success('Client archivé', `Le client ${deleteCustomerModal.name} a été désactivé (facturation conservée).`)
      } else {
        // Hard delete si aucune vente n'est associée
        const { error } = await supabaseTenant('clients')
          .delete()
          .eq('id', deleteCustomerModal.id)

        if (error) throw error
        toast.success('Client supprimé', `Le client ${deleteCustomerModal.name} a été supprimé.`)
      }

      setCustomers((prev) => prev.filter((c) => c.id !== deleteCustomerModal.id))
      setDeleteCustomerModal(null)
      loadCustomers()
    } catch (err: any) {
      toast.error('Erreur suppression client', err.message || 'Impossible de supprimer ce client.')
    } finally {
      setDeletingCustomer(false)
    }
  }

  const [form, setForm] = useState<CustomerFormState>(initialFormState)

  // Chargement des dettes et paiements réels depuis Supabase
  // Filtre sur les clients actuellement affichés (page courante)
  const loadDebtsAndPayments = useCallback(async (clientIds: string[]) => {
    if (!currentCompanyId || clientIds.length === 0) return
    const activeSector = currentSectorSlug || 'boutique'
    try {
      const [debtsRes, paymentsRes] = await Promise.all([
        supabase
          .from('client_debts')
          .select('*')
          .eq('company_id', currentCompanyId)
          .eq('sector_code', activeSector)
          .in('client_id', clientIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('debt_payments')
          .select('*')
          .eq('company_id', currentCompanyId)
          .eq('sector_code', activeSector)
          .in('client_id', clientIds)
          .order('payment_date', { ascending: false })
      ])

      if (debtsRes.data) {
        const groupedDebts: Record<string, ClientDebt[]> = {}
        for (const d of debtsRes.data) {
          if (!groupedDebts[d.client_id]) groupedDebts[d.client_id] = []
          groupedDebts[d.client_id].push({
            ...d,
            total_dette: Number(d.total_dette) || 0,
            total_rembourse: Number(d.total_rembourse) || 0,
            solde_du: Number(d.solde_du) || 0,
          })
        }
        setDebtsByClient(groupedDebts)
      }

      if (paymentsRes.data) {
        setPayments(paymentsRes.data || [])
        const groupedPayments: Record<string, DebtPayment[]> = {}
        for (const p of paymentsRes.data) {
          if (!groupedPayments[p.client_id]) groupedPayments[p.client_id] = []
          groupedPayments[p.client_id].push({
            ...p,
            amount: Number(p.amount) || 0,
            reste_apres: Number(p.reste_apres) || 0,
          })
        }
        setPaymentsByClient(groupedPayments)
      } else {
        setPayments([])
        setPaymentsByClient({})
      }
    } catch (e) {
      console.warn('Erreur chargement client_debts/debt_payments :', e)
      setPayments([])
      setPaymentsByClient({})
    }
  }, [currentCompanyId, currentSectorSlug])

  const loadCustomers = useCallback(async () => {
    if (!currentCompanyId) return
    setLoading(true)
    try {
      // Isolation stricte multi-secteurs garantie par supabaseTenant
      let query = supabaseTenant('clients')
        .select('id, code, name, ifu_number, phone, email, address, city, credit_limit, current_debt, payment_terms_days, credit_authorized, discount_eligible, discount_rate, is_active', { count: 'exact' })
        .eq('is_active', true)
        .order('name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (search.trim()) {
        const s = search.trim()
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,code.ilike.%${s}%`)
      }

      const { data, error, count } = await query

      if (error) throw error

      const mapped: Customer[] = (data || []).map((c: any) => {
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
      setTotalCount(count || 0)
      setHasMore((count || 0) > (page + 1) * PAGE_SIZE)

      // Charger les dettes uniquement pour les clients de la page courante
      const ids = mapped.map((c) => c.id)
      if (ids.length > 0) {
        await loadDebtsAndPayments(ids)
      } else {
        setDebtsByClient({})
        setPayments([])
        setPaymentsByClient({})
      }
    } catch (err: any) {
      toast.error('Erreur chargement clients', err.message)
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [currentCompanyId, supabaseTenant, loadDebtsAndPayments, toast, page, search, PAGE_SIZE])

  // Réinitialiser la page à 0 quand la recherche change
  useEffect(() => {
    setPage(0)
  }, [search])

  // Recharger les clients quand page ou search change (debounce 300ms pour search)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers()
    }, 300)
    return () => clearTimeout(timer)
  }, [page, search, loadCustomers])



  // Calcul précis des créances d'un client (client_debts + debt_payments + legacy)
  const getCustomerDetteInfo = useCallback((cust: Customer) => {
    const safeDebts = debtsByClient || {}
    const safePayments = paymentsByClient || {}
    const debts = safeDebts[cust.id] || []
    const payments = safePayments[cust.id] || []

    if (debts.length > 0) {
      const totalDette = debts.reduce((sum, d) => sum + (Number(d.total_dette) || 0), 0)
      const totalRembourse = debts.reduce((sum, d) => sum + (Number(d.total_rembourse) || 0), 0)
      const soldeDu = debts.reduce((sum, d) => sum + (Number(d.solde_du) || 0), 0)
      return { totalDette, totalRembourse, soldeDu, debts, payments }
    }

    // Fallback données legacy si aucune ligne client_debts n'a encore été insérée
    const legacyDebt = Number(cust.current_debt) || 0
    const paymentsSum = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const totalDette = legacyDebt + paymentsSum
    const totalRembourse = paymentsSum
    const soldeDu = legacyDebt
    return { totalDette, totalRembourse, soldeDu, debts, payments }
  }, [debtsByClient, paymentsByClient])

  const filtered = customers.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
    if (filterDebtorsOnly) {
      return matchSearch && getCustomerDetteInfo(c).soldeDu > 0
    }
    return matchSearch
  })

  const totalDebt = customers.reduce((sum, c) => sum + getCustomerDetteInfo(c).soldeDu, 0)
  const debtorsCount = customers.filter((c) => getCustomerDetteInfo(c).soldeDu > 0).length

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
      // Auto-génération du code client séquentiel PAR (company_id, sector_slug)
      let autoCode = form.code.trim()
      if (!autoCode) {
        autoCode = await getNextSectorCode('clients', 'CLI', companyId, sectorSlug)
      }

      const isCreditAuthorized = form.credit_choice === 'oui'
      const creditLimit = isCreditAuthorized ? Number(form.credit_limit) : 0
      const isDiscountEligible = Boolean(form.discount_eligible)
      const discountRate = isDiscountEligible ? Number(form.discount_rate) : 0

      const corePayload = {
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

      // Insertion via supabaseTenant garantissant l'injection forcée de (company_id, sector_slug)
      const { data: insertedData, error: insertErr } = await supabaseTenant('clients')
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

  // Ajouter dette initiale (synchronisé avec client_debts & clients)
  const handleAddInitialDebt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!initialDebtForm.customerId || initialDebtForm.amount <= 0) return

    setSavingInitialDebt(true)
    try {
      const cust = customers.find((c) => c.id === initialDebtForm.customerId)
      if (!cust) return

      const addAmount = Number(initialDebtForm.amount)
      const currentActiveDebt = ((debtsByClient || {})[cust.id] || []).find((d) => d.status === 'en_cours')

      let newSoldeDu = addAmount
      if (currentActiveDebt) {
        // Ajouter à la créance en_cours existante
        const newTotalDette = (Number(currentActiveDebt.total_dette) || 0) + addAmount
        newSoldeDu = newTotalDette - (Number(currentActiveDebt.total_rembourse) || 0)

        await supabase
          .from('client_debts')
          .update({
            total_dette: newTotalDette,
            solde_du: newSoldeDu,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentActiveDebt.id)
      } else {
        // Créer une nouvelle ligne client_debts en_cours
        await supabase.from('client_debts').insert({
          company_id: currentCompanyId,
          sector_code: currentSectorSlug || 'boutique',
          client_id: cust.id,
          total_dette: addAmount,
          total_rembourse: 0,
          solde_du: addAmount,
          status: 'en_cours',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }

      // Rétrocompatibilité : mettre à jour current_debt sur clients
      const updatedDebt = (Number(cust.current_debt) || 0) + addAmount
      await supabaseTenant('clients')
        .update({ current_debt: updatedDebt })
        .eq('id', cust.id)

      toast.success('Dette initiale ajoutée', `${cust.name} : +${fmt(addAmount)}`)
      setShowInitialDebtModal(false)
      setInitialDebtForm({ customerId: '', amount: 0, motif: 'Report arriéré antérieur' })
      await loadCustomers()
    } catch (err: any) {
      toast.error('Erreur ajout dette', err.message)
    } finally {
      setSavingInitialDebt(false)
    }
  }

  // Ouvrir modal de remboursement
  const openPaymentModal = (cust: Customer) => {
    setSelectedCustomer(cust)
    const { soldeDu } = getCustomerDetteInfo(cust)
    setPaymentAmount(soldeDu || cust.current_debt || 0)
    setPaymentMode('Espèces')
    setPaymentDate(new Date().toISOString().slice(0, 16))
    setPaymentReference('')
    setPaymentNotes('')
    setShowPaymentModal(true)
  }

  // Valider le remboursement (Transaction complète : caisse, client_debts, debt_payments, cash_sessions)
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer || paymentAmount <= 0) return

    const { soldeDu, totalDette, totalRembourse, debts } = getCustomerDetteInfo(selectedCustomer)
    if (paymentAmount > soldeDu) {
      toast.error('Montant invalide', 'Le montant du remboursement ne peut pas dépasser le solde dû.')
      return
    }

    setIsProcessingPayment(true)
    try {
      // 1. Vérification session caisse ouverte pour company_id + sector_code courant
      const activeSession = await getCurrentCashSession(currentCompanyId, currentSectorSlug)
      if (!activeSession) {
        toast.error('Caisse non ouverte', 'Ouvrez la caisse du jour pour enregistrer un remboursement.')
        setIsProcessingPayment(false)
        return
      }

      // 2. Trouver ou créer la dette en_cours dans client_debts
      let activeDebt = debts.find((d) => d.status === 'en_cours')
      if (!activeDebt) {
        const { data: newDebtRow, error: debtCreateErr } = await supabase
          .from('client_debts')
          .insert({
            company_id: currentCompanyId,
            sector_code: currentSectorSlug || 'boutique',
            client_id: selectedCustomer.id,
            total_dette: soldeDu,
            total_rembourse: 0,
            solde_du: soldeDu,
            status: 'en_cours',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (!debtCreateErr && newDebtRow) {
          activeDebt = newDebtRow
        }
      }

      const debtId = activeDebt?.id || null
      const debtTotalDette = activeDebt ? Number(activeDebt.total_dette) : totalDette
      const debtPrevRembourse = activeDebt ? Number(activeDebt.total_rembourse) : totalRembourse
      const newTotalRembourse = debtPrevRembourse + paymentAmount
      const resteApres = Math.max(0, debtTotalDette - newTotalRembourse)
      const newStatus = resteApres <= 0 ? 'soldée' : 'en_cours'
      const receiptNumber = paymentReference.trim() || `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`
      const payDateIso = paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()

      // 3. INSERT dans debt_payments
      const normalizedMethod = paymentMode === 'cash' ? 'Espèces' : paymentMode === 'momo' ? 'MTN MoMo' : paymentMode === 'moov' ? 'Moov Money' : paymentMode

      let insertedPaymentRecord: DebtPayment | null = null
      try {
        const { data: payData, error: payErr } = await supabase
          .from('debt_payments')
          .insert({
            company_id: currentCompanyId,
            sector_code: currentSectorSlug || 'boutique',
            debt_id: debtId,
            client_id: selectedCustomer.id,
            amount: paymentAmount,
            payment_method: normalizedMethod,
            payment_date: payDateIso,
            cash_session_id: activeSession.id,
            reste_apres: resteApres,
            reference: receiptNumber,
            notes: paymentNotes || `Règlement créance client ${selectedCustomer.name}`,
            created_by: user?.id || null,
            created_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (!payErr && payData) {
          insertedPaymentRecord = payData
        }
      } catch (e) {
        console.warn('Erreur insertion debt_payments :', e)
      }

      // 4. UPDATE client_debts
      if (debtId) {
        try {
          await supabase
            .from('client_debts')
            .update({
              total_rembourse: newTotalRembourse,
              solde_du: resteApres,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', debtId)
        } catch (e) {
          console.warn('Erreur mise à jour client_debts :', e)
        }
      }

      // 5. UPDATE cash_sessions (cash_especes, cash_momo, total_remboursements)
      try {
        const isCash = normalizedMethod === 'Espèces'
        const { data: sessRow } = await supabase
          .from('cash_sessions')
          .select('id, cash_especes, cash_momo, total_remboursements')
          .eq('id', activeSession.id)
          .maybeSingle()

        if (sessRow) {
          await supabase
            .from('cash_sessions')
            .update({
              cash_especes: isCash ? (Number(sessRow.cash_especes) || 0) + paymentAmount : Number(sessRow.cash_especes) || 0,
              cash_momo: !isCash ? (Number(sessRow.cash_momo) || 0) + paymentAmount : Number(sessRow.cash_momo) || 0,
              total_remboursements: (Number(sessRow.total_remboursements) || 0) + paymentAmount,
            })
            .eq('id', activeSession.id)
        }
      } catch (sessUpdErr) {
        console.warn('Erreur maj cash_sessions :', sessUpdErr)
      }

      // 6. Rétrocompatibilité clients (mise à jour current_debt)
      try {
        await supabaseTenant('clients')
          .update({ current_debt: resteApres })
          .eq('id', selectedCustomer.id)
      } catch (_) {}

      // 7. Mise à jour de cash_registers et caisse_mouvements
      try {
        const { data: reg } = await supabaseTenant('cash_registers')
          .select('id, current_cash_balance, current_momo_balance')
          .limit(1)
          .maybeSingle()

        if (reg) {
          if (normalizedMethod === 'Espèces') {
            await supabaseTenant('cash_registers')
              .update({ current_cash_balance: (Number(reg.current_cash_balance) || 0) + paymentAmount })
              .eq('id', reg.id)
          } else {
            await supabaseTenant('cash_registers')
              .update({ current_momo_balance: (Number(reg.current_momo_balance) || 0) + paymentAmount })
              .eq('id', reg.id)
          }
        }
      } catch (_) {}

      // Enregistrement unifié dans caisse_mouvements et mise à jour de la caisse active
      try {
        await enregistrerMouvementCaisse({
          company_id: currentCompanyId,
          sector_slug: currentSectorSlug,
          caisse_id: activeSession.caisse_id || activeSession.id,
          caisse_session_id: activeSession.id,
          type: 'reglement_client',
          sens: 'entree',
          montant_especes: normalizedMethod === 'Espèces' ? paymentAmount : 0,
          montant_momo: normalizedMethod !== 'Espèces' ? paymentAmount : 0,
          source_module: 'clients_creances',
          source_id: receiptNumber,
          motif: `Règlement créance client ${selectedCustomer.name} (${receiptNumber})`,
          user_name: user?.full_name || 'Caissier',
          user_id: user?.id,
        })
      } catch (_) {}

      // 8. Traçabilité Journal d'Audit
      await logAuditEvent({
        action: 'RECOUVREMENT_CREANCE',
        module: 'CLIENTS',
        sector: 'COMMERCIAL',
        description: `Règlement créance client ${selectedCustomer.name} (${selectedCustomer.code}) : ${fmt(paymentAmount)} en ${normalizedMethod}. Solde antérieur : ${fmt(soldeDu)}, Reste après opération : ${fmt(resteApres)}. Reçu N° ${receiptNumber}`,
      })

      // 9. Préparer la quittance officielle A5
      const finalPaymentRecord: DebtPayment = insertedPaymentRecord || {
        id: `pay-${Date.now()}`,
        company_id: currentCompanyId,
        sector_code: currentSectorSlug,
        debt_id: debtId || '',
        client_id: selectedCustomer.id,
        amount: paymentAmount,
        payment_method: normalizedMethod,
        payment_date: payDateIso,
        cash_session_id: activeSession.id,
        reste_apres: resteApres,
        reference: receiptNumber,
        notes: paymentNotes || 'Règlement créance client',
        created_by: user?.id,
        created_at: new Date().toISOString(),
      }

      setActivePaymentReceipt({
        payment: finalPaymentRecord,
        customer: selectedCustomer,
        debt: activeDebt ? { ...activeDebt, total_rembourse: newTotalRembourse, solde_du: resteApres } : null,
      })

      setShowPaymentModal(false)
      toast.success('Règlement enregistré avec succès', `${fmt(paymentAmount)} reçus en ${normalizedMethod}. Caisse mise à jour.`)
      await loadCustomers()
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
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase">
                <tr>
                  <th className="px-5 py-3.5">Client</th>
                  <th className="px-5 py-3.5 text-right">TOTAL DETTE</th>
                  <th className="px-5 py-3.5 text-right">TOTAL REMBOURSÉ</th>
                  <th className="px-5 py-3.5 text-right">SOLDE DÛ</th>
                  <th className="px-5 py-3.5 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filtered.map((item) => {
                  const { totalDette, totalRembourse, soldeDu } = getCustomerDetteInfo(item)

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
                        {fmt(totalDette)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-medium text-emerald-700 text-sm">
                        {fmt(totalRembourse)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-sm">
                        {soldeDu > 0 ? (
                          <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                            {fmt(soldeDu)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">0 FCFA</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setActiveDetailsCustomer(item)}
                            title="Fiche client & historique des remboursements"
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5 text-slate-500" /> Détails
                          </button>
                          {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && (
                            <button
                              onClick={() => openCustomPricesModal(item)}
                              title="Gérer les prix personnalisés pour ce client"
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                            >
                              <Tag className="w-3.5 h-3.5 text-amber-600" /> Prix perso
                            </button>
                          )}
                          {soldeDu > 0 && (
                            <>
                              <button
                                onClick={() => openPaymentModal(item)}
                                title="Enregistrer un remboursement qui diminue la dette et entre dans la caisse"
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
                          <button
                            onClick={() => handleOpenDeleteModal(item)}
                            title="Supprimer ce client"
                            className="p-1.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition shadow-sm border border-slate-200 hover:border-rose-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Contrôles de Pagination Serveur (Norme Performance 20/page) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <div className="text-xs font-medium text-slate-500">
              Affichage de <span className="font-bold text-slate-800">{customers.length}</span> sur <span className="font-bold text-slate-800">{totalCount}</span> client(s) — Page <span className="font-bold text-emerald-700">{page + 1}</span> sur {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                ← Précédent
              </button>
              <div className="text-xs font-bold text-slate-700 px-2">
                {page + 1}
              </div>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore || loading}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                Suivant →
              </button>
            </div>
          </div>
        </>
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
                <p className="text-xs text-slate-500">Règlement d'arriéré client avec impact caisse</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessPayment} className="space-y-4">
              {(() => {
                const { soldeDu, totalDette, totalRembourse } = getCustomerDetteInfo(selectedCustomer)
                return (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm text-slate-800">{selectedCustomer.name}</p>
                        <p className="text-slate-500 font-mono">Code: {selectedCustomer.code} • Tél: {selectedCustomer.phone}</p>
                      </div>
                      <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200">
                        {currentSectorSlug.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                      <div>
                        <span className="text-slate-500">Dette cumulée :</span>
                        <p className="font-mono font-bold text-slate-700">{fmt(totalDette)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500">Solde restant dû :</span>
                        <p className="font-mono font-black text-rose-600 text-sm">{fmt(soldeDu)}</p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-700">Montant à Encaisser (FCFA) *</label>
                  <span className="text-[11px] text-slate-400">
                    Max : {fmt(getCustomerDetteInfo(selectedCustomer).soldeDu)}
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min={1}
                  max={getCustomerDetteInfo(selectedCustomer).soldeDu}
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-lg font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <div className="flex justify-between items-center mt-1 text-xs text-slate-500">
                  <span>Reste après cette opération :</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {fmt(Math.max(0, getCustomerDetteInfo(selectedCustomer).soldeDu - paymentAmount))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date du Paiement *</label>
                <input
                  type="datetime-local"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mode de Paiement *</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {['Espèces', 'MTN MoMo', 'Moov Money'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={clsx(
                        'py-2 px-1 text-center rounded-xl border font-bold text-xs transition',
                        paymentMode === mode
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Référence / Note / Quittance</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ex: Versement acompte, Chèque N°..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessingPayment || paymentAmount <= 0}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                >
                  {isProcessingPayment ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Validation...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-3.5 h-3.5" /> Valider l'Encaissement
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Quittance A5 Propre (Non vide, imprimable avec #printable-area) */}
      {activePaymentReceipt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            {/* Barre d'action modale (cachée à l'impression) */}
            <div className="no-print p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">Quittance Officielle de Règlement</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Printer className="w-4 h-4" /> Imprimer le reçu A5
                </button>
                <button
                  onClick={() => setActivePaymentReceipt(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Zone Imprimable format A5 - Identifiant #printable-area */}
            <div id="printable-area" className="p-8 bg-white text-slate-800 font-sans text-xs space-y-4">
              {/* En-tête Entreprise */}
              <div className="border-b-2 border-slate-900 pb-3 text-center">
                <p className="font-black text-base text-slate-900 uppercase tracking-wide">
                  {company?.name || 'ENTREPRISE COMMERCIALE'}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  IFU: {(company as any)?.ifu_number || 'Non renseigné'} • Tél: {(company as any)?.phone || 'Non renseigné'} • Ville: {(company as any)?.city || 'Cotonou'}
                </p>
                <div className="mt-2 inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
                  QUITTANCE DE RÈGLEMENT DE CRÉANCE
                </div>
              </div>

              {/* Réf reçu & Date */}
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded border border-slate-200 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500 font-sans">N° Quittance : </span>
                  <strong className="text-slate-900">
                    {activePaymentReceipt.payment.reference || `REC-${activePaymentReceipt.payment.id.slice(0, 8).toUpperCase()}`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Date : </span>
                  <strong className="text-slate-900">
                    {new Date(activePaymentReceipt.payment.payment_date).toLocaleDateString('fr-BJ', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </strong>
                </div>
              </div>

              {/* Informations Client */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">CLIENT BÉNÉFICIAIRE</span>
                <p className="font-bold text-sm text-slate-900">{activePaymentReceipt.customer.name}</p>
                <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-4 mt-0.5">
                  <span>Code : <strong>{activePaymentReceipt.customer.code}</strong></span>
                  <span>Tél : <strong>{activePaymentReceipt.customer.phone}</strong></span>
                  {activePaymentReceipt.customer.ifu_number && <span>IFU : <strong>{activePaymentReceipt.customer.ifu_number}</strong></span>}
                </div>
              </div>

              {/* Détails financiers lus depuis debt_payments + client_debts */}
              <div className="space-y-2 border border-slate-200 rounded p-3 bg-white font-mono">
                <div className="flex justify-between font-sans text-xs">
                  <span className="text-slate-600">Total Dette Initiale :</span>
                  <span className="font-bold text-slate-900">
                    {fmt(Number(activePaymentReceipt.debt?.total_dette) || (activePaymentReceipt.payment.amount + activePaymentReceipt.payment.reste_apres))}
                  </span>
                </div>

                <div className="flex justify-between font-sans text-xs">
                  <span className="text-slate-600">Total déjà remboursé (cumulé) :</span>
                  <span className="font-bold text-emerald-700">
                    {fmt(Number(activePaymentReceipt.debt?.total_rembourse) || activePaymentReceipt.payment.amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 px-3 bg-emerald-50 border border-emerald-200 rounded font-sans">
                  <span className="font-bold text-emerald-900 text-sm">Montant remboursé ce jour :</span>
                  <span className="font-black text-emerald-700 text-base font-mono">
                    {fmt(activePaymentReceipt.payment.amount)}
                  </span>
                </div>

                <div className="flex justify-between font-sans text-xs pt-1">
                  <span className="text-slate-600">Mode de paiement :</span>
                  <span className="font-bold text-slate-900">
                    {activePaymentReceipt.payment.payment_method}
                  </span>
                </div>

                <div className="flex justify-between font-sans text-xs pt-2 border-t border-dashed border-slate-300">
                  <span className="font-bold text-slate-800">Solde Dû restant :</span>
                  <span className={clsx(
                    'font-black text-sm font-mono',
                    activePaymentReceipt.payment.reste_apres > 0 ? 'text-rose-600' : 'text-emerald-600'
                  )}>
                    {fmt(activePaymentReceipt.payment.reste_apres)}
                  </span>
                </div>
              </div>

              {/* Note ou référence */}
              {activePaymentReceipt.payment.notes && (
                <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded">
                  Motif / Référence : {activePaymentReceipt.payment.notes}
                </p>
              )}

              {/* Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-[11px] text-slate-700">
                <div className="text-center">
                  <p className="font-bold uppercase">Signature Client</p>
                  <div className="h-14 border-b border-slate-400 w-36 mx-auto mt-2" />
                </div>
                <div className="text-center">
                  <p className="font-bold uppercase">Cachet & Signature Caisse</p>
                  <div className="h-14 border-b border-slate-400 w-36 mx-auto mt-2" />
                </div>
              </div>

              <div className="pt-2 text-center text-[10px] text-slate-400 border-t border-slate-200">
                Quittance officielle certifiant le règlement libératoire à due concurrence • GESTIO 229 SaaS
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Fiche Détails Client (B.2 : Nom, téléphone, Total Dette, Total Remboursé, Solde Dû, Historique JAMAIS vidé) */}
      {activeDetailsCustomer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-y-auto">
            {/* Header Fiche Client */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-lg">{activeDetailsCustomer.name}</h3>
                  <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {activeDetailsCustomer.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                  <span>Tél : {activeDetailsCustomer.phone}</span>
                  {activeDetailsCustomer.ifu_number && <span>IFU : {activeDetailsCustomer.ifu_number}</span>}
                  {activeDetailsCustomer.city && <span>Ville : {activeDetailsCustomer.city}</span>}
                </p>
              </div>
              <button onClick={() => setActiveDetailsCustomer(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const custInfo = getCustomerDetteInfo(activeDetailsCustomer)
              return (
                <div className="space-y-5">
                  {/* KPI Cards : Total Dette | Total Remboursé | Solde Dû */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <span className="text-[11px] font-bold uppercase text-slate-500">TOTAL DETTE</span>
                      <p className="text-lg font-black text-slate-800 mt-1 font-mono">{fmt(custInfo.totalDette)}</p>
                    </div>
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
                      <span className="text-[11px] font-bold uppercase text-emerald-700">TOTAL REMBOURSÉ</span>
                      <p className="text-lg font-black text-emerald-700 mt-1 font-mono">{fmt(custInfo.totalRembourse)}</p>
                    </div>
                    <div
                      className={clsx(
                        'rounded-xl p-3.5 border',
                        custInfo.soldeDu > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      )}
                    >
                      <span className="text-[11px] font-bold uppercase">SOLDE DÛ</span>
                      <p className="text-lg font-black mt-1 font-mono">{fmt(custInfo.soldeDu)}</p>
                    </div>
                  </div>

                  {/* Boutons d'Action : Ajouter dette initiale, Nouveau remboursement, Imprimer situation globale */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setInitialDebtForm({
                            customerId: activeDetailsCustomer.id,
                            amount: 0,
                            motif: 'Report arriéré antérieur',
                          })
                          setShowInitialDebtModal(true)
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                      >
                        <History className="w-3.5 h-3.5" /> Ajouter dette initiale
                      </button>

                      {custInfo.soldeDu > 0 && (
                        <button
                          onClick={() => openPaymentModal(activeDetailsCustomer)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> Nouveau remboursement
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setActiveGlobalStatement(activeDetailsCustomer)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" /> Imprimer situation globale
                    </button>
                  </div>

                  {/* SITUATION DES EMBALLAGES CONSIGNÉS (BRASSERIE UNIQUEMENT) */}
                  {currentSectorSlug === 'brasserie' && customerConsignations.length > 0 && (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                          <span>📦</span> Situation des Emballages Consignés (Casiers)
                        </h4>
                        <span className="text-xs text-amber-800 font-black">
                          Total dû : {customerConsignations.reduce((s, c) => s + c.solde_du, 0)} casiers
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-amber-200 text-amber-800 font-bold uppercase text-[10px]">
                              <th className="text-left py-1.5">Emballage</th>
                              <th className="text-right py-1.5">Total Sorti</th>
                              <th className="text-right py-1.5">Total Retourné</th>
                              <th className="text-right py-1.5">Solde Dû</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {customerConsignations.map((c, idx) => (
                              <tr key={idx}>
                                <td className="py-1.5 font-bold text-slate-800">[{c.code}] {c.designation}</td>
                                <td className="py-1.5 text-right font-mono text-red-600 font-bold">{c.total_sorti}</td>
                                <td className="py-1.5 text-right font-mono text-emerald-600 font-bold">{c.total_retourne}</td>
                                <td className="py-1.5 text-right font-mono font-black text-amber-900">{c.solde_du}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SECTION TARIFICATION PERSONNALISÉE CLIENT (BRASSERIE UNIQUEMENT — PRIORITÉ 1) */}
                  {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && (
                    <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-indigo-700" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-900">
                            Tarification Personnalisée Client (Priorité 1)
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCustomPricesModal(activeDetailsCustomer)}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" /> Gérer les prix personnalisés
                        </button>
                      </div>
                      <p className="text-xs text-indigo-700 leading-relaxed">
                        Configurez des prix spécifiques pour ce client sur certains produits. Ces prix s'appliqueront en <strong>priorité absolue</strong> à la vente, indépendamment du palier de quantité atteint.
                      </p>
                    </div>
                  )}

                  {/* Historique des Remboursements issu de debt_payments — JAMAIS VIDÉ */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2 uppercase tracking-wide">
                        <History className="w-4 h-4 text-emerald-600" />
                        Historique des remboursements ({custInfo.payments.length})
                      </h4>
                      <span className="text-[11px] text-slate-400">Archivage permanent</span>
                    </div>

                    {custInfo.payments.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                        Aucun remboursement enregistré pour ce client.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                            <tr>
                              <th className="px-4 py-2.5">Date</th>
                              <th className="px-4 py-2.5 text-right">Montant remboursé</th>
                              <th className="px-4 py-2.5">Mode</th>
                              <th className="px-4 py-2.5 text-right">Reste après opération</th>
                              <th className="px-4 py-2.5 text-center">Reçu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {custInfo.payments.map((p) => {
                              const pDate = new Date(p.payment_date)
                              const dateStr = !isNaN(pDate.getTime())
                                ? pDate.toLocaleDateString('fr-BJ', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : p.payment_date

                              return (
                                <tr key={p.id} className="hover:bg-slate-50/80 transition">
                                  <td className="px-4 py-2.5 font-medium text-slate-700">{dateStr}</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                                    {fmt(p.amount)}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-slate-100 text-slate-700">
                                      {p.payment_method}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">
                                    {fmt(p.reste_apres)}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <button
                                      onClick={() => {
                                        const linkedDebt = custInfo.debts.find((d) => d.id === p.debt_id) || custInfo.debts[0]
                                        setActivePaymentReceipt({
                                          payment: p,
                                          customer: activeDetailsCustomer,
                                          debt: linkedDebt,
                                        })
                                      }}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 mx-auto transition"
                                    >
                                      <Printer className="w-3 h-3" /> Imprimer
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* MODAL 6: Situation Globale Imprimable (Relevé Compte A5) */}
      {activeGlobalStatement && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* Header Actions */}
            <div className="no-print p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">Situation Globale du Compte Client</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Printer className="w-4 h-4" /> Imprimer la situation
                </button>
                <button
                  onClick={() => setActiveGlobalStatement(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content - #printable-area */}
            <div id="printable-area" className="p-8 bg-white text-slate-800 font-sans text-xs space-y-4">
              <div className="border-b-2 border-slate-900 pb-3 text-center">
                <p className="font-black text-base text-slate-900 uppercase">{company?.name || 'ENTREPRISE COMMERCIALE'}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  IFU: {(company as any)?.ifu_number || 'Non renseigné'} • Tél: {(company as any)?.phone || 'Non renseigné'}
                </p>
                <div className="mt-2 inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
                  RELEVÉ DE SITUATION DU COMPTE CRÉANCE
                </div>
              </div>

              {/* Client Info */}
              <div className="flex justify-between items-start bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <p className="font-bold text-sm text-slate-900">{activeGlobalStatement.name}</p>
                  <p className="text-slate-600 font-mono text-[11px]">
                    Code : {activeGlobalStatement.code} • Tél : {activeGlobalStatement.phone}
                  </p>
                  {activeGlobalStatement.ifu_number && (
                    <p className="text-slate-600 text-[11px]">IFU : {activeGlobalStatement.ifu_number}</p>
                  )}
                </div>
                <div className="text-right text-[11px] font-mono text-slate-500">
                  <p>Édité le : {new Date().toLocaleDateString('fr-BJ')}</p>
                  <p>Secteur : {currentSectorSlug.toUpperCase()}</p>
                </div>
              </div>

              {/* Totaux */}
              {(() => {
                const info = getCustomerDetteInfo(activeGlobalStatement)
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Total Dette</span>
                        <p className="font-mono font-bold text-sm text-slate-800">{fmt(info.totalDette)}</p>
                      </div>
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                        <span className="text-[10px] font-bold uppercase text-emerald-800">Total Remboursé</span>
                        <p className="font-mono font-bold text-sm text-emerald-700">{fmt(info.totalRembourse)}</p>
                      </div>
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded">
                        <span className="text-[10px] font-bold uppercase text-rose-800">Solde Dû</span>
                        <p className="font-mono font-black text-sm text-rose-600">{fmt(info.soldeDu)}</p>
                      </div>
                    </div>

                    {/* Table des règlements */}
                    <div>
                      <p className="font-bold uppercase text-[10px] text-slate-500 mb-1.5">Historique des Règlements</p>
                      {info.payments.length === 0 ? (
                        <p className="text-slate-400 italic text-[11px]">Aucun remboursement enregistré.</p>
                      ) : (
                        <table className="w-full text-left text-[11px] border border-slate-200">
                          <thead className="bg-slate-100 font-bold text-slate-700 uppercase">
                            <tr>
                              <th className="p-2 border-b">Date</th>
                              <th className="p-2 border-b">Réf</th>
                              <th className="p-2 border-b text-right">Montant</th>
                              <th className="p-2 border-b">Mode</th>
                              <th className="p-2 border-b text-right">Reste</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {info.payments.map((p) => (
                              <tr key={p.id}>
                                <td className="p-2 font-sans font-medium text-slate-700">
                                  {new Date(p.payment_date).toLocaleDateString('fr-BJ')}
                                </td>
                                <td className="p-2 text-slate-500">{p.reference || '-'}</td>
                                <td className="p-2 text-right font-bold text-emerald-700">{fmt(p.amount)}</td>
                                <td className="p-2 font-sans text-slate-700">{p.payment_method}</td>
                                <td className="p-2 text-right font-bold text-slate-900">{fmt(p.reste_apres)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-[11px] text-slate-700">
                <div className="text-center">
                  <p className="font-bold uppercase">Signature Client</p>
                  <div className="h-14 border-b border-slate-400 w-36 mx-auto mt-2" />
                </div>
                <div className="text-center">
                  <p className="font-bold uppercase">Cachet Entreprise</p>
                  <div className="h-14 border-b border-slate-400 w-36 mx-auto mt-2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Confirmation de Suppression Client (Vérification contraintes & Soft/Hard Delete) */}
      {deleteCustomerModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-rose-600">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 text-base">Supprimer un client</h3>
              </div>
              <button
                onClick={() => setDeleteCustomerModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-bold text-sm text-slate-900">{deleteCustomerModal.name}</p>
                <p className="text-slate-500 font-mono">Code : {deleteCustomerModal.code} • Tél : {deleteCustomerModal.phone}</p>
                {deleteCustomerModal.current_debt > 0 && (
                  <p className="text-rose-600 font-bold mt-1">⚠️ Solde débiteur en cours : {fmt(deleteCustomerModal.current_debt)}</p>
                )}
              </div>

              {checkingSales ? (
                <div className="flex items-center justify-center gap-2 p-4 text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Vérification des ventes et factures associées...</span>
                </div>
              ) : customerHasSales ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Factures & Ventes Liées Détectées</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Ce client est référencé dans l'historique des ventes. Pour garantir la conformité légale et comptable SYSCOHADA, une <strong>suppression douce (archivage / désactivation : is_active = false)</strong> sera effectuée. Ses factures resteront archivées en sécurité.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                  <p>
                    Ce client n'a aucune vente enregistrée. Vous pouvez le supprimer définitivement ou simplement le désactiver.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteCustomerModal(null)}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Annuler
              </button>

              {customerHasSales ? (
                <button
                  type="button"
                  disabled={deletingCustomer || checkingSales}
                  onClick={() => handleConfirmDeleteCustomer(true)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-amber-600/20 disabled:opacity-50"
                >
                  {deletingCustomer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Archiver & Désactiver</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={deletingCustomer || checkingSales}
                    onClick={() => handleConfirmDeleteCustomer(true)}
                    className="w-full sm:w-auto px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold transition"
                  >
                    Désactiver uniquement
                  </button>
                  <button
                    type="button"
                    disabled={deletingCustomer || checkingSales}
                    onClick={() => handleConfirmDeleteCustomer(false)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-rose-600/20 disabled:opacity-50"
                  >
                    {deletingCustomer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span>Supprimer définitivement</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6 : PRIX PERSONNALISÉS CLIENT (BRASSERIE — PRIORITÉ 1) */}
      {customPricesCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl">
                  <Tag className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">
                    Prix Personnalisés — {customPricesCustomer.name}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Priorité 1 : Ces tarifs spécifiques sont appliqués en priorité lors de toute vente à ce client.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomPricesCustomer(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Formulaire Saisie Rapide */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                  {customPriceEditingProdId ? 'Modifier le prix personnalisé' : 'Définir un nouveau prix personnalisé'}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-2 md:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Produit *
                    </label>
                    <select
                      value={customPriceForm.produit_id}
                      onChange={(e) => {
                        const pid = e.target.value
                        const prod = brasserieProducts.find((p) => p.id === pid)
                        const existing = customPricesList.find((x) => x.produit_id === pid)
                        setCustomPriceForm({
                          ...customPriceForm,
                          produit_id: pid,
                          prix_personnalise_fcfa: existing ? existing.prix_personnalise_fcfa : (prod ? prod.selling_price : ''),
                          statut: existing ? existing.statut : 'ACTIF',
                          notes: existing?.notes || '',
                        })
                        setCustomPriceEditingProdId(existing ? existing.produit_id : null)
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium"
                    >
                      <option value="">Sélectionner un produit...</option>
                      {brasserieProducts.map((p) => {
                        const hasCustom = customPricesList.some((x) => x.produit_id === p.id)
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} (Std: {fmt(p.selling_price)}) {hasCustom ? '★' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Prix Spécial Client (FCFA) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      value={customPriceForm.prix_personnalise_fcfa}
                      onChange={(e) => setCustomPriceForm({ ...customPriceForm, prix_personnalise_fcfa: e.target.value })}
                      placeholder="Ex: 1350"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Statut
                    </label>
                    <select
                      value={customPriceForm.statut}
                      onChange={(e) => setCustomPriceForm({ ...customPriceForm, statut: e.target.value as any })}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    >
                      <option value="ACTIF">ACTIF (Appliqué)</option>
                      <option value="INACTIF">INACTIF (Suspendu)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="w-full sm:flex-1">
                    <input
                      type="text"
                      value={customPriceForm.notes}
                      onChange={(e) => setCustomPriceForm({ ...customPriceForm, notes: e.target.value })}
                      placeholder="Notes ou motif (ex: accord commercial, client fidèle...)"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {customPriceEditingProdId && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomPriceEditingProdId(null)
                          setCustomPriceForm({ produit_id: '', prix_personnalise_fcfa: '', statut: 'ACTIF', notes: '' })
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                      >
                        Annuler
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={savingCustomPrice}
                      onClick={handleSaveCustomPrice}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                      {savingCustomPrice ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{customPriceEditingProdId ? 'Mettre à jour' : 'Enregistrer'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Tableau des Prix Personnalisés Définis */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Prix Personnalisés Définis ({customPricesList.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">Priorité 1 sur la vente</span>
                </div>

                {loadingCustomPrices ? (
                  <div className="py-10 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    <p className="text-xs">Chargement des prix personnalisés...</p>
                  </div>
                ) : customPricesList.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                    <Tag className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                    <p className="font-semibold text-slate-600">Aucun prix personnalisé défini</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Ce client bénéficiera automatiquement des prix des grilles selon la quantité achetée.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                          <th className="py-2.5 px-3">Produit</th>
                          <th className="py-2.5 px-3 text-right">Prix Standard</th>
                          <th className="py-2.5 px-3 text-right">Prix Client</th>
                          <th className="py-2.5 px-3 text-center">Économie</th>
                          <th className="py-2.5 px-3 text-center">Statut</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {customPricesList.map((cp) => {
                          const prod = brasserieProducts.find((p) => p.id === cp.produit_id)
                          const stdPrice = Number(prod?.selling_price) || 0
                          const customPrice = Number(cp.prix_personnalise_fcfa) || 0
                          const diff = stdPrice - customPrice

                          return (
                            <tr key={cp.produit_id} className="hover:bg-indigo-50/20 transition">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{prod?.name || 'Produit'}</div>
                                {cp.notes && <div className="text-[10px] text-slate-400 italic">{cp.notes}</div>}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-slate-500">
                                {fmt(stdPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-indigo-900">
                                {fmt(customPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {diff > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    -{fmt(diff)}
                                  </span>
                                ) : diff < 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                    +{fmt(Math.abs(diff))}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px] font-medium">Identique</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={clsx(
                                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                                    cp.statut === 'ACTIF'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  )}
                                >
                                  {cp.statut}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomPriceEditingProdId(cp.produit_id)
                                      setCustomPriceForm({
                                        produit_id: cp.produit_id,
                                        prix_personnalise_fcfa: cp.prix_personnalise_fcfa,
                                        statut: cp.statut,
                                        notes: cp.notes || '',
                                      })
                                    }}
                                    className="p-1 text-slate-500 hover:text-indigo-600 rounded transition"
                                    title="Modifier ce prix"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomPrice(cp.produit_id)}
                                    className="p-1 text-slate-500 hover:text-rose-600 rounded transition"
                                    title="Supprimer ce prix personnalisé"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCustomPricesCustomer(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition shadow-sm"
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
