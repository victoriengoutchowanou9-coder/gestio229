// =============================================================================
// GESTIO 229 SaaS — Gestion des Utilisateurs & Ressources Humaines (RH & Paie)
// Conforme Code du Travail de la République du Bénin & Normes UEMOA
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import {
  UserPlus, Users, Eye, EyeOff, AlertCircle, CheckCircle2, Shield,
  Key, FileText, Printer, DollarSign, Briefcase, Calendar, Download, X,
  BadgePercent, Layers, Plus, Wallet, Smartphone, CreditCard, Clock, Check
} from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

// ─── Types ────────────────────────────────────────────────────────────────────

export const MONTHS_LIST = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

export const YEARS_LIST = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

interface InternalUser {
  id: string
  full_name: string
  login_identifier: string
  role: string
  sector_id?: string
  is_active: boolean
  permissions: Record<string, Record<string, boolean>>
  phone?: string
  created_at: string
}

export interface StaffMember {
  id: string
  fullName: string
  jobTitle: string
  phone: string
  cnssNumber: string
  baseSalary: number
  transportAllowance: number
  housingAllowance: number
  bonus: number
  hireDate: string
  advancePayment: number
}

export interface PayrollPayment {
  id: string
  employeeId: string
  employeeName: string
  period: string
  baseSalary: number
  grossSalary: number
  cnssSalariale: number
  netSalary: number
  paymentMethod: string
  expenseId?: string
  paidAt: string
  paidBy: string
}

interface EmployeePayrollProfile {
  userId: string
  fullName: string
  role: string
  cnssNumber: string
  jobTitle: string
  baseSalary: number
  transportAllowance: number
  housingAllowance: number
  bonus: number
  advancePayment: number
}

interface PayslipData {
  slipNumber: string
  periodMonth: string
  periodYear: number
  employeeName: string
  jobTitle: string
  cnssNumber: string
  baseSalary: number
  transportAllowance: number
  housingAllowance: number
  bonus: number
  grossSalary: number
  cnssSalariale: number // 3.6% au Bénin
  cnssPatronale: number // 16.4% au Bénin
  vpsBénin: number // 4% Versement Patronal sur Salaires
  advancePayment: number
  netSalary: number
  totalEmployerCost: number
}

interface NewUserForm {
  full_name: string
  login_identifier: string
  password: string
  role: string
  sector_id: string
  phone: string
  permissions: Record<string, Record<string, boolean>>
}

const DEFAULT_ROLES = [
  { value: 'gerant', label: 'Gérant' },
  { value: 'caissier', label: 'Caissier / Caissière' },
  { value: 'magasinier', label: 'Magasinier' },
  { value: 'gestionnaire', label: 'Gestionnaire' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'administrateur', label: 'Administrateur' },
  { value: 'vendeur', label: 'Vendeur / Commercial' },
  { value: 'responsable_secteur', label: 'Responsable de Secteur' },
]

const ALL_MODULES = [
  { id: 'caisse', label: 'Caisse' },
  { id: 'stock', label: 'Stocks' },
  { id: 'ventes', label: 'Vente & POS' },
  { id: 'clients', label: 'Clients & Créances' },
  { id: 'depenses', label: 'Dépenses' },
  { id: 'finances', label: 'Trésorerie' },
  { id: 'fournisseurs', label: 'Fournisseurs & Achats' },
  { id: 'reporting', label: 'Rapports & Analyse' },
  { id: 'syscohada', label: 'Comptabilité' },
  { id: 'utilisateurs', label: 'Gestion Utilisateurs' },
  { id: 'configuration', label: 'Configuration' },
]

const UtilisateursPage: React.FC = () => {
  const { company, user } = useAuthStore()

  // Tabs: 'utilisateurs' | 'paie' | 'audit'
  const [activeTab, setActiveTab] = useState<'utilisateurs' | 'paie' | 'audit'>('utilisateurs')

  const [users, setUsers] = useState<InternalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sectors, setSectors] = useState<{ id: string; sector_name: string; sector_slug: string }[]>([])

  // Période de paie sélectionnable (mois / année)
  const currentMonthIdx = new Date().getMonth()
  const [selectedMonth, setSelectedMonth] = useState<string>(MONTHS_LIST[currentMonthIdx] || 'Septembre')
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const payrollPeriod = `${selectedMonth} ${selectedYear}`

  // State pour la paie et le personnel
  const [payrollProfiles, setPayrollProfiles] = useState<Record<string, EmployeePayrollProfile>>({})
  const [additionalStaff, setAdditionalStaff] = useState<StaffMember[]>([])
  const [payrollPayments, setPayrollPayments] = useState<PayrollPayment[]>([])
  const [selectedForPayslip, setSelectedForPayslip] = useState<any | null>(null)
  const [generatedSlip, setGeneratedSlip] = useState<PayslipData | null>(null)

  // Modal Nouveau Personnel
  const [showNewStaffModal, setShowNewStaffModal] = useState(false)
  const [newStaffForm, setNewStaffForm] = useState({
    fullName: '',
    jobTitle: '',
    baseSalary: '',
    phone: '',
    cnssNumber: '',
    transportAllowance: '15000',
    housingAllowance: '0',
    bonus: '0',
    hireDate: new Date().toISOString().split('T')[0],
  })

  // Modal Payer Salaire
  const [payingEmployee, setPayingEmployee] = useState<any | null>(null)
  const [payMethod, setPayMethod] = useState<'especes' | 'virement' | 'momo' | 'cheque'>('especes')
  const [isPaying, setIsPaying] = useState(false)

  const emptyForm: NewUserForm = {
    full_name: '',
    login_identifier: '',
    password: '',
    role: 'vendeur',
    sector_id: '',
    phone: '',
    permissions: {},
  }

  const [form, setForm] = useState<NewUserForm>(emptyForm)

  useEffect(() => {
    if (company?.id) {
      loadUsers()
      loadSectors()
    }
  }, [company?.id])

  const loadUsers = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', company.id)
        .neq('role', 'administrateur')
        .order('created_at', { ascending: false })

      if (err) throw err
      const userList = data ?? []
      setUsers(userList)

      // Initialiser profils de paie par défaut pour chaque utilisateur
      const initialProfiles: Record<string, EmployeePayrollProfile> = {}
      userList.forEach((u: any, idx: number) => {
        initialProfiles[u.id] = {
          userId: u.id,
          fullName: u.full_name || 'Collaborateur',
          role: u.role || 'Employé',
          cnssNumber: `CNSS-${(company?.id || '').slice(0, 4)}-${1000 + idx}`,
          jobTitle: u.role === 'gerant' ? 'Gérant d\'exploitation' : u.role === 'caissier' ? 'Caissier Principal' : u.role === 'magasinier' ? 'Gestionnaire de Stock' : 'Conseiller Commercial',
          baseSalary: u.role === 'gerant' ? 150000 : u.role === 'caissier' ? 80000 : u.role === 'magasinier' ? 75000 : 60000,
          transportAllowance: 15000,
          housingAllowance: 10000,
          bonus: 5000,
          advancePayment: 0,
        }
      })
      setPayrollProfiles(initialProfiles)

      // Charger le personnel enregistré localement / persistant
      const storedStaff = localStorage.getItem(`gestio_staff_members_${company.id}`)
      if (storedStaff) {
        try {
          const parsedStaff = JSON.parse(storedStaff)
          if (Array.isArray(parsedStaff)) setAdditionalStaff(parsedStaff)
        } catch (e) {}
      }

      // Charger les paiements de paie enregistrés
      const storedPayments = localStorage.getItem(`gestio_payroll_payments_${company.id}`)
      if (storedPayments) {
        try {
          const parsedPayments = JSON.parse(storedPayments)
          if (Array.isArray(parsedPayments)) setPayrollPayments(parsedPayments)
        } catch (e) {}
      }
    } catch (err: any) {
      setError('Erreur chargement utilisateurs : ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadSectors = async () => {
    if (!company?.id) return
    const { data } = await supabase
      .from('company_sectors')
      .select('id, sector_name, sector_slug')
      .eq('company_id', company.id)

    setSectors(data ?? [])
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.full_name.trim()) {
      setError('Veuillez saisir le nom complet.')
      return
    }
    if (!form.login_identifier.trim()) {
      setError("Veuillez définir un identifiant de connexion.")
      return
    }
    if (!form.password || form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    setCreating(true)

    try {
      if (!company?.id) throw new Error("Entreprise introuvable.")

      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('company_id', company.id)
        .eq('login_identifier', form.login_identifier.trim())
        .maybeSingle()

      if (existing) {
        throw new Error(`L'identifiant "${form.login_identifier}" est déjà utilisé dans votre entreprise.`)
      }

      const companyShort = company.id.substring(0, 8)
      const internalEmail = `${form.login_identifier.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${companyShort}@gestio229.internal`

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: internalEmail,
        password: form.password,
        options: {
          data: {
            full_name: form.full_name,
            company_id: company.id,
            is_internal: true,
          }
        }
      })

      let authUserId: string | null = null
      if (!authError && authData?.user?.id) {
        authUserId = authData.user.id
      }

      const { error: profileErr } = await supabase.from('user_profiles').insert({
        company_id: company.id,
        auth_user_id: authUserId,
        full_name: form.full_name.trim(),
        username: form.login_identifier.trim(),
        login_identifier: form.login_identifier.trim(),
        email: authUserId ? internalEmail : `${form.login_identifier}@${company.id}.internal`,
        phone: form.phone.trim(),
        role: form.role,
        is_active: true,
        is_internal_user: true,
        created_by_admin_id: user?.id ?? null,
        sector_id: form.sector_id || null,
        permissions: form.permissions,
      })

      if (profileErr) throw new Error('Erreur création profil : ' + profileErr.message)

      setSuccess(`Utilisateur "${form.full_name}" créé avec succès ! Identifiant : ${form.login_identifier}`)
      setForm(emptyForm)
      setShowCreateForm(false)
      loadUsers()

    } catch (err: any) {
      setError(err.message || "Erreur lors de la création de l'utilisateur.")
    } finally {
      setCreating(false)
    }
  }

  const togglePermission = (moduleId: string, action: string) => {
    setForm((prev) => {
      const mod = prev.permissions[moduleId] ?? {}
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [moduleId]: {
            ...mod,
            [action]: !mod[action],
          }
        }
      }
    })
  }

  const toggleUserActive = async (userId: string, currentState: boolean) => {
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ is_active: !currentState })
      .eq('id', userId)
      .eq('company_id', company?.id)

    if (!err) loadUsers()
  }

  // Liste consolidée de tout le personnel (Utilisateurs internes + Personnel enregistré)
  const allStaffList = useMemo(() => {
    const list: Array<{
      id: string
      fullName: string
      jobTitle: string
      phone?: string
      cnssNumber: string
      baseSalary: number
      transportAllowance: number
      housingAllowance: number
      bonus: number
      advancePayment: number
      hireDate?: string
      isInternalUser: boolean
    }> = []

    // 1. Utilisateurs internes
    users.forEach((u) => {
      const p = payrollProfiles[u.id] || {
        userId: u.id,
        fullName: u.full_name,
        role: u.role,
        cnssNumber: 'CNSS-EN-COURS',
        jobTitle: u.role,
        baseSalary: 60000,
        transportAllowance: 15000,
        housingAllowance: 0,
        bonus: 0,
        advancePayment: 0,
      }
      list.push({
        id: u.id,
        fullName: u.full_name,
        jobTitle: p.jobTitle,
        phone: u.phone,
        cnssNumber: p.cnssNumber,
        baseSalary: p.baseSalary,
        transportAllowance: p.transportAllowance,
        housingAllowance: p.housingAllowance,
        bonus: p.bonus,
        advancePayment: p.advancePayment,
        isInternalUser: true
      })
    })

    // 2. Personnel externe enregistré
    additionalStaff.forEach((s) => {
      list.push({
        id: s.id,
        fullName: s.fullName,
        jobTitle: s.jobTitle,
        phone: s.phone,
        cnssNumber: s.cnssNumber,
        baseSalary: s.baseSalary,
        transportAllowance: s.transportAllowance,
        housingAllowance: s.housingAllowance,
        bonus: s.bonus,
        advancePayment: s.advancePayment,
        hireDate: s.hireDate,
        isInternalUser: false
      })
    })

    return list
  }, [users, payrollProfiles, additionalStaff])

  // Statistiques de paie pour la période sélectionnée
  const periodStats = useMemo(() => {
    let totalBrut = 0
    let totalNet = 0
    let totalPaid = 0
    let totalCnss = 0

    allStaffList.forEach((emp) => {
      const totAllow = emp.transportAllowance + emp.housingAllowance + emp.bonus
      const brut = emp.baseSalary + totAllow
      const cnssSal = Math.round(brut * 0.036)
      const cnssPat = Math.round(brut * 0.164)
      const vps = Math.round(brut * 0.04)
      const net = Math.max(0, brut - cnssSal - emp.advancePayment)

      totalBrut += brut
      totalNet += net
      totalCnss += (cnssSal + cnssPat + vps)

      const isPaid = payrollPayments.some((p) => p.employeeId === emp.id && p.period === payrollPeriod)
      if (isPaid) {
        totalPaid += net
      }
    })

    return {
      totalBrut,
      totalNet,
      totalPaid,
      totalCnss,
      remaining: Math.max(0, totalNet - totalPaid),
      paidCount: allStaffList.filter((e) => payrollPayments.some((p) => p.employeeId === e.id && p.period === payrollPeriod)).length,
      totalCount: allStaffList.length
    }
  }, [allStaffList, payrollPayments, payrollPeriod])

  // Enregistrer un nouveau personnel
  const handleSaveNewStaff = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStaffForm.fullName.trim() || !newStaffForm.jobTitle.trim() || !newStaffForm.baseSalary) {
      setError('Veuillez remplir les champs obligatoires (Nom, Poste, Salaire de base).')
      return
    }

    const newStaff: StaffMember = {
      id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fullName: newStaffForm.fullName.trim(),
      jobTitle: newStaffForm.jobTitle.trim(),
      phone: newStaffForm.phone.trim(),
      cnssNumber: newStaffForm.cnssNumber.trim() || `CNSS-${(company?.id || '').slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`,
      baseSalary: Number(newStaffForm.baseSalary) || 0,
      transportAllowance: Number(newStaffForm.transportAllowance) || 0,
      housingAllowance: Number(newStaffForm.housingAllowance) || 0,
      bonus: Number(newStaffForm.bonus) || 0,
      hireDate: newStaffForm.hireDate || new Date().toISOString().split('T')[0],
      advancePayment: 0,
    }

    const updated = [newStaff, ...additionalStaff]
    setAdditionalStaff(updated)
    if (company?.id) {
      localStorage.setItem(`gestio_staff_members_${company.id}`, JSON.stringify(updated))
    }

    setSuccess(`Nouveau personnel "${newStaff.fullName}" enregistré avec succès !`)
    setShowNewStaffModal(false)
    setNewStaffForm({
      fullName: '',
      jobTitle: '',
      baseSalary: '',
      phone: '',
      cnssNumber: '',
      transportAllowance: '15000',
      housingAllowance: '0',
      bonus: '0',
      hireDate: new Date().toISOString().split('T')[0],
    })
  }

  // Payer le salaire pour la période sélectionnée (avec impact Dépenses & Trésorerie)
  const handleConfirmSalaryPayment = async () => {
    if (!payingEmployee || !company?.id) return
    setIsPaying(true)
    setError('')
    try {
      const monthIdx = MONTHS_LIST.indexOf(selectedMonth)
      // Dernière date du mois sélectionné (ex: 2026-09-30)
      const lastDayOfMonth = new Date(selectedYear, (monthIdx >= 0 ? monthIdx : 8) + 1, 0)
      const expenseDate = lastDayOfMonth.toISOString().split('T')[0]

      const base = Number(payingEmployee.baseSalary) || 0
      const transp = Number(payingEmployee.transportAllowance) || 0
      const house = Number(payingEmployee.housingAllowance) || 0
      const bon = Number(payingEmployee.bonus) || 0
      const gross = base + transp + house + bon
      const cnssSal = Math.round(gross * 0.036)
      const cnssPat = Math.round(gross * 0.164)
      const vps = Math.round(gross * 0.04)
      const adv = Number(payingEmployee.advancePayment) || 0
      const net = Math.max(0, gross - cnssSal - adv)

      // 1. Enregistrer dans la table `expenses` Supabase pour cette période
      const { data: expData, error: expErr } = await supabase.from('expenses').insert({
        company_id: company.id,
        title: `Salaire ${payrollPeriod} — ${payingEmployee.fullName}`,
        category: 'Salaires & Rémunérations',
        amount: net,
        payment_method: payMethod,
        expense_date: expenseDate,
        notes: JSON.stringify({
          type: 'PAIE_SALAIRE',
          period: payrollPeriod,
          employee_id: payingEmployee.id,
          employee_name: payingEmployee.fullName,
          job_title: payingEmployee.jobTitle,
          base_salary: base,
          allowances: transp + house + bon,
          gross_salary: gross,
          cnss_salariale: cnssSal,
          cnss_patronale: cnssPat,
          vps_benin: vps,
          net_salary: net,
          payment_method: payMethod
        }),
        created_by: user?.id
      }).select().maybeSingle()

      if (expErr) {
        console.warn('Erreur insertion expenses :', expErr)
      }

      // 2. Décaissement en Trésorerie / Caisse si espèces
      if (payMethod === 'especes') {
        const cashStateRaw = localStorage.getItem(`gestio_caisse_state_${company.id}`)
        if (cashStateRaw) {
          try {
            const cState = JSON.parse(cashStateRaw)
            cState.initialCash = Math.max(0, (Number(cState.initialCash) || 0) - net)
            localStorage.setItem(`gestio_caisse_state_${company.id}`, JSON.stringify(cState))
          } catch (e) {}
        }
      }

      // 3. Mémoriser le paiement de paie rattaché à la période
      const newPayment: PayrollPayment = {
        id: `pay-${Date.now()}`,
        employeeId: payingEmployee.id,
        employeeName: payingEmployee.fullName,
        period: payrollPeriod,
        baseSalary: base,
        grossSalary: gross,
        cnssSalariale: cnssSal,
        netSalary: net,
        paymentMethod: payMethod,
        expenseId: expData?.id,
        paidAt: new Date().toISOString(),
        paidBy: user?.full_name || 'Direction'
      }

      const updated = [newPayment, ...payrollPayments]
      setPayrollPayments(updated)
      localStorage.setItem(`gestio_payroll_payments_${company.id}`, JSON.stringify(updated))

      setSuccess(`Salaire de ${payingEmployee.fullName} pour ${payrollPeriod} (${fmt(net)}) payé avec succès !`)
      setPayingEmployee(null)
    } catch (err: any) {
      setError(err.message || 'Erreur lors du versement du salaire.')
    } finally {
      setIsPaying(false)
    }
  }

  // Calcul du bulletin de paie conforme Bénin
  const calculatePayslip = (profile: any) => {
    const gross = (profile.baseSalary || 0) + (profile.transportAllowance || 0) + (profile.housingAllowance || 0) + (profile.bonus || 0)
    // Déductions Bénin : CNSS Salariale = 3.6% du brut
    const cnssSal = Math.round(gross * 0.036)
    // Charges patronales Bénin : CNSS Patronale = 16.4%, VPS = 4%
    const cnssPat = Math.round(gross * 0.164)
    const vps = Math.round(gross * 0.04)
    const net = Math.max(0, gross - cnssSal - (profile.advancePayment || 0))
    const totalCost = gross + cnssPat + vps

    const slip: PayslipData = {
      slipNumber: `BP-${selectedYear}-${Math.floor(1000 + Math.random() * 9000)}`,
      periodMonth: payrollPeriod,
      periodYear: selectedYear,
      employeeName: profile.fullName,
      jobTitle: profile.jobTitle,
      cnssNumber: profile.cnssNumber,
      baseSalary: profile.baseSalary || 0,
      transportAllowance: profile.transportAllowance || 0,
      housingAllowance: profile.housingAllowance || 0,
      bonus: profile.bonus || 0,
      grossSalary: gross,
      cnssSalariale: cnssSal,
      cnssPatronale: cnssPat,
      vpsBénin: vps,
      advancePayment: profile.advancePayment || 0,
      netSalary: net,
      totalEmployerCost: totalCost
    }

    setGeneratedSlip(slip)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* En-tête & Onglets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Personnel, RH & Salaires</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion des accès, collaborateurs et paie conforme CNSS Bénin & Code du Travail
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['utilisateurs', 'paie', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab === 'utilisateurs' ? 'Comptes & Droits' : tab === 'paie' ? 'Personnel & Paie' : 'Journal de Sécurité'}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {success}
        </div>
      )}

      {/* ONGLET 1: UTILISATEURS & DROITS D'ACCÈS */}
      {activeTab === 'utilisateurs' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowCreateForm(true); setError(''); setSuccess('') }}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-all text-xs"
            >
              <UserPlus className="w-4 h-4" /> Nouvel Utilisateur
            </button>
          </div>

          {/* Formulaire de création */}
          {showCreateForm && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
              <h2 className="text-base font-black text-slate-900 mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                Créer un Compte Collaborateur
              </h2>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Nom Complet *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.full_name}
                      onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                      placeholder="Ex: AGOSSOU Pierre"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+229 97 00 00 00"
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Identifiant de Connexion *
                    </label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={form.login_identifier}
                        onChange={(e) => setForm((p) => ({ ...p, login_identifier: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                        placeholder="Ex: pierre_agossou"
                        className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Mot de Passe Initial *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={form.password}
                        onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Minimum 6 caractères"
                        className="w-full px-4 pr-10 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Rôle Attribué *
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      {DEFAULT_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Secteur d'Affectation
                    </label>
                    <select
                      value={form.sector_id}
                      onChange={(e) => setForm((p) => ({ ...p, sector_id: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Tous les secteurs</option>
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id}>{s.sector_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Permissions par module */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-600" /> Droits d'Accès aux Modules
                  </h3>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 font-bold text-slate-600">
                        <tr>
                          <th className="text-left px-3 py-2">Module</th>
                          <th className="px-2 py-2 text-center">Voir</th>
                          <th className="px-2 py-2 text-center">Créer</th>
                          <th className="px-2 py-2 text-center">Modifier</th>
                          <th className="px-2 py-2 text-center">Valider</th>
                          <th className="px-2 py-2 text-center">Supprimer</th>
                          <th className="px-2 py-2 text-center">Administrer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ALL_MODULES.map((mod) => (
                          <tr key={mod.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{mod.label}</td>
                            {['view', 'create', 'edit', 'validate', 'delete', 'admin'].map((action) => (
                              <td key={action} className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={form.permissions[mod.id]?.[action] ?? false}
                                  onChange={() => togglePermission(mod.id, action)}
                                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all disabled:opacity-60"
                  >
                    {creating ? 'Création en cours...' : 'Valider & Enregistrer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setError(''); setForm(emptyForm) }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-xl text-xs hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Liste des utilisateurs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <Users className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold text-slate-800 text-sm">
                Comptes Utilisateurs Actifs ({users.length})
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">Chargement des utilisateurs...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 font-semibold">Aucun utilisateur créé</p>
                <p className="text-xs text-slate-400 mt-1">Cliquez sur "Nouvel Utilisateur" pour ajouter un employé.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((u) => (
                  <div key={u.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                        {u.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{u.full_name}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Key className="w-3 h-3 text-slate-400" />
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{u.login_identifier}</span>
                          <span>•</span>
                          <span className="capitalize font-medium text-emerald-700">{u.role}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        u.is_active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {u.is_active ? 'Actif' : 'Inactif'}
                      </span>

                      <button
                        onClick={() => toggleUserActive(u.id, u.is_active)}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
                        title={u.is_active ? 'Désactiver le compte' : 'Réactiver'}
                      >
                        {u.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ONGLET 2: PERSONNEL & PAIE (BÉNIN & CNSS) */}
      {activeTab === 'paie' && (
        <div className="space-y-6">
          {/* En-tête de l'onglet Paie : Période sélectionnable & Bouton Nouveau Personnel */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-900 text-lg">Ressources Humaines, Personnel & Paie</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    Conforme Bénin 🇧🇯
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestion des collaborateurs, calcul CNSS Bénin (3.6% salarié, 16.4% patronal, VPS 4%) et décaissement en trésorerie
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Sélecteur de période de paie (Mois / Année) */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                  <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700">Période :</span>
                  {/* Mois */}
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {MONTHS_LIST.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  {/* Année */}
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer border-l border-slate-200 pl-2"
                  >
                    {YEARS_LIST.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Bouton + Nouveau Personnel */}
                <button
                  type="button"
                  onClick={() => setShowNewStaffModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Nouveau personnel</span>
                </button>
              </div>
            </div>

            {/* Grille Synthèse financière de la période sélectionnée */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Masse Salariale Brute</span>
                <p className="text-base font-black text-slate-900 font-mono">{fmt(periodStats.totalBrut)}</p>
                <span className="text-[10px] text-slate-400">Total bruts imposables</span>
              </div>
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200">
                <span className="text-[10px] font-bold uppercase text-indigo-700 block mb-1">Charges CNSS &amp; VPS</span>
                <p className="text-base font-black text-indigo-900 font-mono">{fmt(periodStats.totalCnss)}</p>
                <span className="text-[10px] text-indigo-500">Part patronale + salariale</span>
              </div>
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-1">Total Net à Payer</span>
                <p className="text-base font-black text-emerald-900 font-mono">{fmt(periodStats.totalNet)}</p>
                <span className="text-[10px] text-emerald-600">Net après cotisations</span>
              </div>
              <div className="p-3.5 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-300 block mb-1">Statut Décaissements</span>
                <p className="text-base font-black text-emerald-400 font-mono">{fmt(periodStats.totalPaid)}</p>
                <span className="text-[10px] text-slate-400">
                  {periodStats.paidCount}/{periodStats.totalCount} payé(s) — Reste : {fmt(periodStats.remaining)}
                </span>
              </div>
            </div>

            {/* Tableau complet du personnel */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-4 py-3">Employé</th>
                    <th className="px-4 py-3">Poste / Fonction</th>
                    <th className="px-4 py-3">N° CNSS Bénin</th>
                    <th className="px-4 py-3 text-right">Salaire Base</th>
                    <th className="px-4 py-3 text-right">Primes / Indemnités</th>
                    <th className="px-4 py-3 text-right">Net Estimé</th>
                    <th className="px-4 py-3 text-center">Statut ({payrollPeriod})</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allStaffList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        Aucun employé ou personnel enregistré. Cliquez sur "+ Nouveau personnel" pour en ajouter.
                      </td>
                    </tr>
                  ) : (
                    allStaffList.map((emp) => {
                      const totalAllowances = emp.transportAllowance + emp.housingAllowance + emp.bonus
                      const gross = emp.baseSalary + totalAllowances
                      const netEst = Math.max(0, gross - Math.round(gross * 0.036) - emp.advancePayment)
                      const paidRecord = payrollPayments.find((p) => p.employeeId === emp.id && p.period === payrollPeriod)

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                                {emp.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm leading-tight">{emp.fullName}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                  <span>{emp.phone || 'Pas de tél'}</span>
                                  <span>•</span>
                                  <span className={`px-1.5 py-0.2 rounded font-semibold ${
                                    emp.isInternalUser ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {emp.isInternalUser ? 'Utilisateur Interne' : 'Personnel'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">{emp.jobTitle}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{emp.cnssNumber}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">{fmt(emp.baseSalary)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-mono font-semibold">{fmt(totalAllowances)}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900 font-mono">{fmt(netEst)}</td>
                          <td className="px-4 py-3 text-center">
                            {paidRecord ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Payé ({fmt(paidRecord.netSalary)})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                <Clock className="w-3 h-3 text-amber-600" />
                                En attente
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {!paidRecord && (
                                <button
                                  type="button"
                                  onClick={() => setPayingEmployee(emp)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
                                  title="Enregistrer le décaissement du salaire"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Payer</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => calculatePayslip(emp)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs flex items-center gap-1 transition"
                                title="Générer et imprimer le bulletin officiel"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Bulletin</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 3: SÉCURITÉ & AUDIT */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-base">Journal d'Audit & Connexions</h3>
          </div>
          <p className="text-xs text-slate-500">Traçabilité complète des actions effectuées sur le progiciel</p>

          <div className="space-y-3">
            {[
              { date: 'Aujourd\'hui à 08:30', user: 'Administrateur', action: 'Ouverture de session et synchronisation', tag: 'Système' },
              { date: 'Aujourd\'hui à 08:45', user: 'Caisse Principale', action: 'Ouverture du tiroir-caisse avec fond initial', tag: 'Caisse' },
              { date: 'Hier à 18:30', user: 'Caisse Principale', action: 'Clôture journalière de caisse avec PV validé', tag: 'Clôture' },
              { date: 'Hier à 15:10', user: 'Gestionnaire Stock', action: 'Validation transfert Magasin ➔ Vente', tag: 'Stock' },
            ].map((log, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-800">{log.user}</span>
                  <span className="text-slate-400 mx-2">—</span>
                  <span className="text-slate-600">{log.action}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px]">{log.tag}</span>
                  <span className="text-slate-400 text-[11px]">{log.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL BULLETIN DE PAIE OFFICIEL (Format Imprimable A4) */}
      {generatedSlip && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <FileText className="w-5 h-5" />
                <h3 className="font-bold text-slate-800">Bulletin de Paie Officiel (Bénin)</h3>
              </div>
              <button onClick={() => setGeneratedSlip(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div id="payslip-print" className="p-6 bg-white border border-slate-300 rounded-xl text-xs space-y-4 text-slate-700">
              {/* Entête Entreprise */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <h2 className="font-black text-base text-slate-900 uppercase">{company?.name || 'ENTREPRISE GESTIO 229'}</h2>
                  <p className="text-slate-500">IFU: {(company as any)?.ifu_number || '0202618902891'} | RCCM: RB/COT/26-B-001</p>
                  <p className="text-slate-500">Siège: {(company as any)?.address || 'Cotonou, République du Bénin'}</p>
                </div>
                <div className="text-right">
                  <span className="bg-emerald-50 text-emerald-800 font-bold px-3 py-1 rounded-full text-xs">
                    BULLETIN DE PAIE
                  </span>
                  <p className="font-mono text-slate-500 mt-1">{generatedSlip.slipNumber}</p>
                  <p className="font-semibold text-slate-800">Période : {generatedSlip.periodMonth}</p>
                </div>
              </div>

              {/* Salarié */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Salarié</span>
                  <p className="font-bold text-slate-800 text-sm">{generatedSlip.employeeName}</p>
                  <p className="text-slate-500">Poste : {generatedSlip.jobTitle}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Régime Social</span>
                  <p className="font-semibold text-slate-700">N° CNSS : {generatedSlip.cnssNumber}</p>
                  <p className="text-slate-500">Convention : Commerce & Services Bénin</p>
                </div>
              </div>

              {/* Grille Salaire */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700">
                    <tr>
                      <th className="p-2">Éléments de Rémunération</th>
                      <th className="p-2 text-right">Base / Gains</th>
                      <th className="p-2 text-right">Retenues Salariales</th>
                      <th className="p-2 text-right">Charges Patronales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2 font-medium">Salaire de Base Conventionnel</td>
                      <td className="p-2 text-right">{fmt(generatedSlip.baseSalary)}</td>
                      <td className="p-2 text-right">-</td>
                      <td className="p-2 text-right">-</td>
                    </tr>
                    {generatedSlip.transportAllowance > 0 && (
                      <tr>
                        <td className="p-2">Indemnité de Transport</td>
                        <td className="p-2 text-right">{fmt(generatedSlip.transportAllowance)}</td>
                        <td className="p-2 text-right">-</td>
                        <td className="p-2 text-right">-</td>
                      </tr>
                    )}
                    {generatedSlip.housingAllowance > 0 && (
                      <tr>
                        <td className="p-2">Indemnité de Logement</td>
                        <td className="p-2 text-right">{fmt(generatedSlip.housingAllowance)}</td>
                        <td className="p-2 text-right">-</td>
                        <td className="p-2 text-right">-</td>
                      </tr>
                    )}
                    {generatedSlip.bonus > 0 && (
                      <tr>
                        <td className="p-2">Prime d'Assiduité / Rendement</td>
                        <td className="p-2 text-right">{fmt(generatedSlip.bonus)}</td>
                        <td className="p-2 text-right">-</td>
                        <td className="p-2 text-right">-</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 font-bold">
                      <td className="p-2">SALAIRE BRUT IMPOSABLE</td>
                      <td className="p-2 text-right text-slate-900">{fmt(generatedSlip.grossSalary)}</td>
                      <td className="p-2 text-right">-</td>
                      <td className="p-2 text-right">-</td>
                    </tr>
                    <tr>
                      <td className="p-2">Cotisation CNSS Régime Général (3.6% part salariale)</td>
                      <td className="p-2 text-right">-</td>
                      <td className="p-2 text-right text-red-600">{fmt(generatedSlip.cnssSalariale)}</td>
                      <td className="p-2 text-right text-slate-500">{fmt(generatedSlip.cnssPatronale)} (16.4%)</td>
                    </tr>
                    <tr>
                      <td className="p-2">Versement Patronal sur Salaires (VPS Bénin 4%)</td>
                      <td className="p-2 text-right">-</td>
                      <td className="p-2 text-right">-</td>
                      <td className="p-2 text-right text-slate-500">{fmt(generatedSlip.vpsBénin)}</td>
                    </tr>
                    {generatedSlip.advancePayment > 0 && (
                      <tr>
                        <td className="p-2">Acompte / Avance sur salaire versé</td>
                        <td className="p-2 text-right">-</td>
                        <td className="p-2 text-right text-red-600">{fmt(generatedSlip.advancePayment)}</td>
                        <td className="p-2 text-right">-</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Net à Payer */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700">NET À PAYER AU SALARIÉ</span>
                  <p className="text-xs text-slate-500">Payable par virement, MoMo ou chèque barré</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-emerald-800">{fmt(generatedSlip.netSalary)}</p>
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-3 flex justify-between text-[11px] text-slate-500">
                <div className="text-center">
                  <p>Signature de l'Employé(e)</p>
                  <p className="text-[9px] text-slate-400">(Précédée de "Lu et approuvé")</p>
                  <div className="h-10 border-b border-dotted border-slate-400 w-32 mx-auto mt-1" />
                </div>
                <div className="text-center">
                  <p>Pour la Direction</p>
                  <p className="text-[9px] text-slate-400">Cachet & Signature de l'Employeur</p>
                  <div className="h-10 border-b border-dotted border-slate-400 w-32 mx-auto mt-1" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" /> Imprimer le Bulletin
              </button>
              <button
                onClick={() => setGeneratedSlip(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL NOUVEAU PERSONNEL ══════════════════════════════════════════ */}
      {showNewStaffModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Enregistrer un Nouveau Personnel</h3>
                  <p className="text-xs text-slate-500">Collaborateurs d'exploitation et personnel contractuel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewStaffModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewStaff} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nom &amp; Prénom *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffForm.fullName}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, fullName: e.target.value }))}
                    placeholder="Ex: KODJO Pascal"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Poste / Fonction *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffForm.jobTitle}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, jobTitle: e.target.value }))}
                    placeholder="Ex: Caissier, Vendeur, Livreur..."
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Salaire de Base (F CFA) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={newStaffForm.baseSalary}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, baseSalary: e.target.value }))}
                    placeholder="Ex: 75000"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={newStaffForm.phone}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="Ex: +229 97 00 00 00"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    N° CNSS Bénin (optionnel)
                  </label>
                  <input
                    type="text"
                    value={newStaffForm.cnssNumber}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, cnssNumber: e.target.value }))}
                    placeholder="Ex: 10459828381"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Date d'embauche
                  </label>
                  <input
                    type="date"
                    value={newStaffForm.hireDate}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, hireDate: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Indemnité de Transport (F CFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={newStaffForm.transportAllowance}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, transportAllowance: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Indemnité de Logement (F CFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={newStaffForm.housingAllowance}
                    onChange={(e) => setNewStaffForm((p) => ({ ...p, housingAllowance: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Primes Diverses / Rendement (F CFA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={newStaffForm.bonus}
                  onChange={(e) => setNewStaffForm((p) => ({ ...p, bonus: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3 justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewStaffModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-md shadow-emerald-600/20"
                >
                  Enregistrer le Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ MODAL PAYER LE SALAIRE ═════════════════════════════════════════════ */}
      {payingEmployee && (() => {
        const base = Number(payingEmployee.baseSalary) || 0
        const transp = Number(payingEmployee.transportAllowance) || 0
        const house = Number(payingEmployee.housingAllowance) || 0
        const bon = Number(payingEmployee.bonus) || 0
        const gross = base + transp + house + bon
        const cnssSal = Math.round(gross * 0.036)
        const adv = Number(payingEmployee.advancePayment) || 0
        const net = Math.max(0, gross - cnssSal - adv)

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <DollarSign className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Payer le Salaire</h3>
                    <p className="text-xs text-slate-500">Période : {payrollPeriod}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPayingEmployee(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Récapitulatif Salarié & Calcul */}
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-sm">{payingEmployee.fullName}</span>
                    <span className="text-xs font-semibold text-slate-500">{payingEmployee.jobTitle}</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-200">
                    <div className="flex justify-between">
                      <span>Salaire de base conventionnel :</span>
                      <span className="font-mono font-bold text-slate-800">{fmt(base)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>Indemnités &amp; Primes :</span>
                      <span className="font-mono font-bold">+{fmt(transp + house + bon)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Retenue CNSS (3.6% part salariale) :</span>
                      <span className="font-mono font-bold">-{fmt(cnssSal)}</span>
                    </div>
                    {adv > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Acompte sur salaire déduit :</span>
                        <span className="font-mono font-bold">-{fmt(adv)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-emerald-800">
                      <span>NET À DÉCAISSER :</span>
                      <span className="font-mono text-base">{fmt(net)}</span>
                    </div>
                  </div>
                </div>

                {/* Choix de la Trésorerie Source */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Mode / Source de Paiement *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'especes', label: 'Espèces', icon: Wallet, desc: 'Tiroir-Caisse direct' },
                      { id: 'virement', label: 'Virement', icon: CreditCard, desc: 'Trésorerie Centrale' },
                      { id: 'momo', label: 'Mobile Money', icon: Smartphone, desc: 'MTN / Moov / Wave' },
                      { id: 'cheque', label: 'Chèque', icon: FileText, desc: 'Chèque entreprise' },
                    ].map((m) => {
                      const Icon = m.icon
                      const isSelected = payMethod === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPayMethod(m.id as any)}
                          className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                            isSelected
                              ? 'bg-emerald-50/80 border-emerald-500 text-emerald-900 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`} />
                          <div>
                            <p className="font-bold text-xs">{m.label}</p>
                            <p className="text-[10px] text-slate-400">{m.desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Note Informative Conformité & Persistance */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                  🛡️ <strong>Rattachement Comptable :</strong> Ce paiement sera enregistré dans la table <code>expenses</code> au titre de la période <strong>{payrollPeriod}</strong>. La marge nette de ce mois sera calculée sans modifier rétroactivement les autres périodes.
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 justify-end border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPayingEmployee(null)}
                    disabled={isPaying}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSalaryPayment}
                    disabled={isPaying}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
                  >
                    {isPaying ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirmer le Paiement ({fmt(net)})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default UtilisateursPage
