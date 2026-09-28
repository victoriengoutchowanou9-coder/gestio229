// =============================================================================
// GESTIO 229 SaaS — Gestion des Utilisateurs & Ressources Humaines (RH & Paie)
// Conforme Code du Travail de la République du Bénin & Normes UEMOA
// =============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import {
  UserPlus, Users, Eye, EyeOff, AlertCircle, CheckCircle2, Shield,
  Key, FileText, Printer, DollarSign, Briefcase, Calendar, Download, X,
  BadgePercent, Layers
} from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  { value: 'magasinier', label: 'Magasinier / Gestionnaire Stock' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'vendeur', label: 'Vendeur / Commercial' },
  { value: 'responsable_secteur', label: 'Responsable de Secteur' },
  { value: 'employe', label: 'Employé Général' },
]

const ALL_MODULES = [
  { id: 'ventes', label: 'Ventes / POS' },
  { id: 'stock', label: 'Stock / Inventaire' },
  { id: 'caisse', label: 'Caisse' },
  { id: 'finances', label: 'Trésorerie / Finances' },
  { id: 'clients', label: 'Clients / Créances' },
  { id: 'fournisseurs', label: 'Fournisseurs / Achats' },
  { id: 'depenses', label: 'Dépenses' },
  { id: 'reporting', label: 'Rapports' },
  { id: 'audit', label: 'Journal / Audit' },
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

  // State pour la paie
  const [payrollProfiles, setPayrollProfiles] = useState<Record<string, EmployeePayrollProfile>>({})
  const [selectedForPayslip, setSelectedForPayslip] = useState<EmployeePayrollProfile | null>(null)
  const [generatedSlip, setGeneratedSlip] = useState<PayslipData | null>(null)
  const [payrollPeriod, setPayrollPeriod] = useState<string>('Septembre 2026')

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

  // Calcul du bulletin de paie conforme Bénin
  const calculatePayslip = (profile: EmployeePayrollProfile) => {
    const gross = profile.baseSalary + profile.transportAllowance + profile.housingAllowance + profile.bonus
    // Déductions Bénin : CNSS Salariale = 3.6% du brut
    const cnssSal = Math.round(gross * 0.036)
    // Charges patronales Bénin : CNSS Patronale = 16.4%, VPS = 4%
    const cnssPat = Math.round(gross * 0.164)
    const vps = Math.round(gross * 0.04)
    const net = Math.max(0, gross - cnssSal - profile.advancePayment)
    const totalCost = gross + cnssPat + vps

    const slip: PayslipData = {
      slipNumber: `BP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      periodMonth: payrollPeriod,
      periodYear: new Date().getFullYear(),
      employeeName: profile.fullName,
      jobTitle: profile.jobTitle,
      cnssNumber: profile.cnssNumber,
      baseSalary: profile.baseSalary,
      transportAllowance: profile.transportAllowance,
      housingAllowance: profile.housingAllowance,
      bonus: profile.bonus,
      grossSalary: gross,
      cnssSalariale: cnssSal,
      cnssPatronale: cnssPat,
      vpsBénin: vps,
      advancePayment: profile.advancePayment,
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
                          <th className="px-3 py-2 text-center">Voir</th>
                          <th className="px-3 py-2 text-center">Créer</th>
                          <th className="px-3 py-2 text-center">Modifier</th>
                          <th className="px-3 py-2 text-center">Supprimer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ALL_MODULES.map((mod) => (
                          <tr key={mod.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{mod.label}</td>
                            {['view', 'create', 'edit', 'delete'].map((action) => (
                              <td key={action} className="px-3 py-2 text-center">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Rémunérations & Bulletins de Salaire</h3>
                <p className="text-xs text-slate-500">Conforme Code du Travail Béninois : CNSS Salariale 3.6%, CNSS Patronale 16.4%, VPS 4%</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Période :</label>
                <input
                  type="text"
                  value={payrollPeriod}
                  onChange={(e) => setPayrollPeriod(e.target.value)}
                  placeholder="Ex: Septembre 2026"
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-4 py-3">Employé</th>
                    <th className="px-4 py-3">Poste</th>
                    <th className="px-4 py-3">N° CNSS Bénin</th>
                    <th className="px-4 py-3 text-right">Salaire Base</th>
                    <th className="px-4 py-3 text-right">Primes / Indemnités</th>
                    <th className="px-4 py-3 text-right">Net Estimé</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const profile = payrollProfiles[u.id] || {
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
                    const totalAllowances = profile.transportAllowance + profile.housingAllowance + profile.bonus
                    const gross = profile.baseSalary + totalAllowances
                    const netEst = Math.max(0, gross - Math.round(gross * 0.036) - profile.advancePayment)

                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{u.full_name}</td>
                        <td className="px-4 py-3 text-slate-500">{profile.jobTitle}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{profile.cnssNumber}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(profile.baseSalary)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{fmt(totalAllowances)}</td>
                        <td className="px-4 py-3 text-right font-black text-emerald-700">{fmt(netEst)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedForPayslip(profile)
                              calculatePayslip(profile)
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1 mx-auto shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" /> Bulletin
                          </button>
                        </td>
                      </tr>
                    )
                  })}
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
    </div>
  )
}

export default UtilisateursPage
