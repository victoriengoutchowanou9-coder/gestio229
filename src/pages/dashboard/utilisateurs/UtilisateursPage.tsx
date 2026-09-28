// =============================================================================
// GESTIO 229 SaaS — Gestion des Utilisateurs Internes
// L'Administrateur crée, configure et gère ses employés ici
// =============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import {
  UserPlus,
  Users,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Shield,
  Key,
  Building2
} from 'lucide-react'

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
  { value: 'gerant', label: 'Gerant' },
  { value: 'caissier', label: 'Caissier / Caissiere' },
  { value: 'magasinier', label: 'Magasinier / Stock' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'vendeur', label: 'Vendeur / Commercial' },
  { value: 'responsable_secteur', label: 'Responsable de Secteur' },
  { value: 'employe', label: 'Employe General' },
]

const ALL_MODULES = [
  { id: 'ventes', label: 'Ventes / POS' },
  { id: 'stock', label: 'Stock / Inventaire' },
  { id: 'caisse', label: 'Caisse' },
  { id: 'finances', label: 'Tresorerie / Finances' },
  { id: 'clients', label: 'Clients / Creances' },
  { id: 'fournisseurs', label: 'Fournisseurs / Achats' },
  { id: 'depenses', label: 'Depenses' },
  { id: 'rapports', label: 'Rapports' },
  { id: 'audit', label: 'Journal / Audit' },
  { id: 'configuration', label: 'Configuration' },
]

// ─── Composant Principal ──────────────────────────────────────────────────────

const UtilisateursPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const [users, setUsers] = useState<InternalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sectors, setSectors] = useState<{ id: string; sector_name: string; sector_slug: string }[]>([])

  const emptyForm: NewUserForm = {
    full_name: '',
    login_identifier: '',
    password: '',
    role: 'employe',
    sector_id: '',
    phone: '',
    permissions: {},
  }

  const [form, setForm] = useState<NewUserForm>(emptyForm)

  // ─── Chargement ─────────────────────────────────────────────────────────

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
      setUsers(data ?? [])
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

  // ─── Création d'un utilisateur interne ──────────────────────────────────

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.full_name.trim()) {
      setError('Veuillez saisir le nom complet.')
      return
    }
    if (!form.login_identifier.trim()) {
      setError("Veuillez definir un identifiant de connexion.")
      return
    }
    if (!form.password || form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres.')
      return
    }

    setCreating(true)

    try {
      if (!company?.id) throw new Error("Entreprise introuvable.")

      // Vérifier unicité de l'identifiant dans cette entreprise
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('company_id', company.id)
        .eq('login_identifier', form.login_identifier.trim())
        .maybeSingle()

      if (existing) {
        throw new Error(`L'identifiant "${form.login_identifier}" est deja utilise dans votre entreprise.`)
      }

      // Créer un email interne unique pour Supabase Auth
      // Format : {identifier}_{companyId_short}@gestio229.internal
      const companyShort = company.id.substring(0, 8)
      const internalEmail = `${form.login_identifier.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${companyShort}@gestio229.internal`

      // Créer le compte Supabase Auth pour l'utilisateur interne
      // NOTE : Cela nécessite le service role en production.
      // En alternative, stocker le hash du mot de passe dans user_profiles.
      // Pour l'instant, on stocke dans user_profiles avec is_internal_user = true
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

      // Créer le profil utilisateur
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

      if (profileErr) throw new Error('Erreur creation profil : ' + profileErr.message)

      setSuccess(`Utilisateur "${form.full_name}" cree avec succes ! Identifiant : ${form.login_identifier}`)
      setForm(emptyForm)
      setShowCreateForm(false)
      loadUsers()

    } catch (err: any) {
      setError(err.message || "Erreur lors de la creation de l'utilisateur.")
    } finally {
      setCreating(false)
    }
  }

  // ─── Toggle permission ─────────────────────────────────────────────────

  const togglePermission = (moduleId: string, action: string) => {
    setForm((prev) => {
      const module = prev.permissions[moduleId] ?? {}
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [moduleId]: {
            ...module,
            [action]: !module[action],
          }
        }
      }
    })
  }

  // ─── Désactiver / réactiver un utilisateur ────────────────────────────

  const toggleUserActive = async (userId: string, currentState: boolean) => {
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ is_active: !currentState })
      .eq('id', userId)
      .eq('company_id', company?.id)

    if (!err) loadUsers()
  }

  // ─── Rendu ────────────────────────────────────────────────────────────

  if (user?.role !== 'administrateur') {
    return (
      <div className="p-6 text-center">
        <Shield className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-600 font-semibold">Acces reserve a l'Administrateur</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* En-tete */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Gestion des Utilisateurs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Creez et gerez les comptes des employes de <strong>{company?.name}</strong>
          </p>
        </div>
        <button
          onClick={() => { setShowCreateForm(true); setError(''); setSuccess('') }}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Nouvel Utilisateur
        </button>
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

      {/* Formulaire de création */}
      {showCreateForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
          <h2 className="text-lg font-black text-slate-900 mb-5 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            Creer un Nouvel Utilisateur
          </h2>

          <form onSubmit={handleCreateUser} className="space-y-6">
            {/* Informations de base */}
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
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Telephone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+229 97 00 00 00"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Identifiant de Connexion * <span className="font-normal text-slate-500">(defini par vous)</span>
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={form.login_identifier}
                    onChange={(e) => setForm((p) => ({ ...p, login_identifier: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    placeholder="Ex: pierre_agossou"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">L'employe utilisera cet identifiant pour se connecter.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Mot de Passe Initial * <span className="font-normal text-slate-500">(defini par vous)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Minimum 6 caracteres"
                    className="w-full px-4 pr-10 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                  Role *
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Tous les secteurs</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>{s.sector_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                Droits d'Acces par Module
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold text-slate-700">Module</th>
                      <th className="px-3 py-2 text-center font-bold text-slate-700">Voir</th>
                      <th className="px-3 py-2 text-center font-bold text-slate-700">Creer</th>
                      <th className="px-3 py-2 text-center font-bold text-slate-700">Modifier</th>
                      <th className="px-3 py-2 text-center font-bold text-slate-700">Supprimer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ALL_MODULES.map((mod) => (
                      <tr key={mod.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-800">{mod.label}</td>
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

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all disabled:opacity-60"
              >
                {creating ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creation...</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Creer l'Utilisateur</>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setError(''); setForm(emptyForm) }}
                className="px-6 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all"
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
          <Users className="w-5 h-5 text-slate-500" />
          <h2 className="font-bold text-slate-800">
            Employes de {company?.name} ({users.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Chargement...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-semibold">Aucun utilisateur cree</p>
            <p className="text-xs text-slate-400 mt-1">Cliquez sur "Nouvel Utilisateur" pour commencer.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((u) => (
              <div key={u.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {u.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{u.full_name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Key className="w-3 h-3" />
                      <span className="font-mono">{u.login_identifier ?? u.username}</span>
                      <span>•</span>
                      <span className="capitalize">{u.role}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    u.is_active
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {u.is_active ? 'Actif' : 'Inactif'}
                  </span>

                  <button
                    onClick={() => toggleUserActive(u.id, u.is_active)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
                    title={u.is_active ? 'Desactiver' : 'Reactiver'}
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
  )
}

export default UtilisateursPage
