// =============================================================================
// GESTIO 229 SaaS — Configuration & Gestion de l'Équipe (Utilisateurs Internes)
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Building2, Save, ShieldCheck, Users, Plus, KeyRound, Check,
  X, AlertCircle, Lock, UserCheck, Shield, ToggleLeft, ToggleRight,
  Briefcase, Store
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

export const ConfigPage: React.FC = () => {
  const { company, user, refreshTenantContext } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'etablissement' | 'fiscalite' | 'notifications' | 'utilisateurs'>('etablissement')

  // ─── États Établissement ──────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    legal_form: 'SARL',
    ifu_number: '',
    rccm_number: '',
    regime_fiscal: 'Régime Réel Simplifié (RRS)',
    address: '',
    city: 'Cotonou',
    phone: '',
    email: '',
    logo_url: '',
    currency: 'FCFA',
    tva_default_rate: 18,
    aib_default_rate: 1,
    e_mecef_active: false,
    e_mecef_connected: false,
    e_mecef_nim: '',
    e_mecef_token: '',
    e_mecef_api_url: '',
    closure_email_1: '',
    closure_email_2: '',
    closure_email_3: '',
    auto_send_closure_pdf: true,
  })

  // ─── États Équipe & Utilisateurs Internes ──────────────────────────────────
  const [usersList, setUsersList] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [createError, setCreateError] = useState('')

  // Formulaire création utilisateur interne
  const [newUser, setNewUser] = useState({
    full_name: '',
    phone: '',
    username: '',
    initial_password: '',
    role: 'caissier',
    sector: 'boutique',
    permissions: {
      ventes: true,
      caisse: true,
      stock: false,
      clients: true,
      fournisseurs: false,
      depenses: false,
      reporting: false,
      finances: false,
      syscohada: false,
      admin: false
    }
  })

  // Réinitialisation mot de passe modal
  const [resetModalUser, setResetModalUser] = useState<any | null>(null)
  const [resetPasswordVal, setResetPasswordVal] = useState('')
  const [savingReset, setSavingReset] = useState(false)

  // Charger les informations entreprise
  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        legal_form: company.legal_form || 'SARL',
        ifu_number: company.ifu_number || '',
        rccm_number: company.rccm_number || '',
        regime_fiscal: company.regime_fiscal || 'Régime Réel Simplifié (RRS)',
        address: company.address || '',
        city: company.city || 'Cotonou',
        phone: company.phone || '',
        email: company.email || '',
        logo_url: company.logo_url || '',
        currency: company.currency || 'FCFA',
        tva_default_rate: company.tva_default_rate ?? 18,
        aib_default_rate: company.aib_default_rate ?? 1,
        e_mecef_active: company.e_mecef_active ?? false,
        e_mecef_connected: (company as any).e_mecef_connected ?? false,
        e_mecef_nim: company.e_mecef_nim || '',
        e_mecef_token: (company as any).e_mecef_token || '',
        e_mecef_api_url: (company as any).e_mecef_api_url || '',
        closure_email_1: (company as any).closure_email_1 || (company as any).email || '',
        closure_email_2: (company as any).closure_email_2 || '',
        closure_email_3: (company as any).closure_email_3 || '',
        auto_send_closure_pdf: (company as any).auto_send_closure_pdf ?? true,
      })
    }
  }, [company])

  // Charger la liste des utilisateurs de l'entreprise
  const fetchUsers = async () => {
    if (!company?.id) return
    setLoadingUsers(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setUsersList(data || [])
    } catch (err: any) {
      console.error('Erreur chargement utilisateurs:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (company?.id && activeTab === 'utilisateurs') {
      fetchUsers()
    }
  }, [company?.id, activeTab])

  // Sauvegarde des paramètres entreprise
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          ...form,
          onboarding_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id)

      if (error) throw error

      // Persistance locale des adresses emails de clôture
      localStorage.setItem(
        `gestio_closure_emails_${company.id}`,
        JSON.stringify([form.closure_email_1, form.closure_email_2, form.closure_email_3].filter(Boolean))
      )

      toast.success('Configuration sauvegardée avec succès')
      await refreshTenantContext()
    } catch (err: any) {
      toast.error('Erreur de mise à jour', err.message)
    } finally {
      setSaving(false)
    }
  }

  // Création d'un utilisateur interne
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')

    const trimmedUsername = newUser.username.trim().toLowerCase()
    if (!trimmedUsername || trimmedUsername.length < 3) {
      setCreateError("L'identifiant doit comporter au moins 3 caractères.")
      return
    }

    if (!newUser.initial_password || newUser.initial_password.length < 4) {
      setCreateError("Le mot de passe initial doit comporter au moins 4 caractères.")
      return
    }

    if (!newUser.full_name.trim()) {
      setCreateError("Veuillez renseigner le nom complet de l'utilisateur.")
      return
    }

    setCreatingUser(true)
    try {
      // 1. Vérifier l'unicité de l'identifiant
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .ilike('username', trimmedUsername)
        .maybeSingle()

      if (existing) {
        setCreateError(`L'identifiant "${trimmedUsername}" est déjà utilisé.`)
        setCreatingUser(false)
        return
      }

      // Email synthétique pour respecter la contrainte DB NOT NULL UNIQUE
      const safeEmail = `${trimmedUsername}@${company?.id?.slice(0, 8) || 'ent'}.gestio229.local`

      // 2. Insérer dans user_profiles
      const { error: insertErr } = await supabase
        .from('user_profiles')
        .insert({
          company_id: company?.id,
          full_name: newUser.full_name.trim(),
          username: trimmedUsername,
          email: safeEmail,
          password_hash: newUser.initial_password,
          phone: newUser.phone.trim() || null,
          role: newUser.role,
          is_active: true,
          permissions: {
            ...newUser.permissions,
            sector: newUser.sector,
            assigned_sector: newUser.sector,
            commercial: newUser.permissions.ventes,
            treasury: newUser.permissions.finances,
            purchases: newUser.permissions.fournisseurs,
            accounting: newUser.permissions.syscohada
          }
        })

      if (insertErr) throw insertErr

      toast.success(`Utilisateur ${newUser.full_name} créé avec succès !`)
      setShowCreateModal(false)
      // Réinitialiser le formulaire
      setNewUser({
        full_name: '',
        phone: '',
        username: '',
        initial_password: '',
        role: 'caissier',
        sector: 'boutique',
        permissions: {
          ventes: true,
          caisse: true,
          stock: false,
          clients: true,
          fournisseurs: false,
          depenses: false,
          reporting: false,
          finances: false,
          syscohada: false,
          admin: false
        }
      })
      await fetchUsers()
    } catch (err: any) {
      setCreateError(err.message || "Erreur lors de la création de l'utilisateur")
    } finally {
      setCreatingUser(false)
    }
  }

  // Activer / Désactiver un utilisateur
  const toggleUserStatus = async (userItem: any) => {
    try {
      const newStatus = !userItem.is_active
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', userItem.id)

      if (error) throw error
      toast.success(`Statut mis à jour : ${newStatus ? 'Actif' : 'Désactivé'}`)
      await fetchUsers()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Réinitialiser mot de passe d'un utilisateur interne
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetModalUser) return
    if (resetPasswordVal.length < 4) {
      toast.error('Le mot de passe doit comporter au moins 4 caractères.')
      return
    }

    setSavingReset(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          password_hash: resetPasswordVal,
          updated_at: new Date().toISOString()
        })
        .eq('id', resetModalUser.id)

      if (error) throw error
      toast.success(`Mot de passe réinitialisé pour ${resetModalUser.username}`)
      setResetModalUser(null)
      setResetPasswordVal('')
      await fetchUsers()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setSavingReset(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Paramètres de Gestion</h1>
          <p className="text-slate-500 text-xs mt-1">
            Configuration juridique, fiscale, alertes de clôture et gestion de l'équipe
          </p>
        </div>

        {/* Onglets */}
        <div className="flex bg-slate-200/80 p-1 rounded-2xl gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('etablissement')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'etablissement'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>Établissement</span>
          </button>
          <button
            onClick={() => setActiveTab('fiscalite')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'fiscalite'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Fiscalité & e-MECeF</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store className="w-4 h-4 text-emerald-600" />
            <span>Clôtures & Emails</span>
          </button>
          <button
            onClick={() => setActiveTab('utilisateurs')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'utilisateurs'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Équipe & Accès</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* ONGLET 1 : ÉTABLISSEMENT                                            */}
      {/* =================================================================== */}
      {activeTab === 'etablissement' && (
        <form onSubmit={handleSaveCompany} className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <span>Identité de l'Entreprise</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Raison Sociale *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Forme Juridique</label>
                <select
                  value={form.legal_form}
                  onChange={(e) => setForm({ ...form, legal_form: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="SARL">SARL (Société à Responsabilité Limitée)</option>
                  <option value="SAS">SAS (Société par Actions Simplifiée)</option>
                  <option value="Ets">Établissement Individuel / Profession libérale</option>
                  <option value="SA">SA (Société Anonyme)</option>
                  <option value="GIE">GIE (Groupement d'Intérêt Économique)</option>
                </select>
              </div>
            </div>

            {/* Logo de l'Entreprise */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Logo de l'Entreprise (s'affiche sur les factures A4 et les tickets de caisse)
              </label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Aperçu logo"
                    className="w-12 h-12 object-contain rounded-xl border border-slate-200 p-1 bg-white flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] font-bold flex-shrink-0">
                    Logo
                  </div>
                )}
                <input
                  type="text"
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  placeholder="Lien ou URL directe vers l'image du logo (ex: https://...)"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Téléphone Principal</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+229 01 00 00 00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email Officiel</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="contact@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Adresse Géographique</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Quartier, Carré, Rue, Immeuble..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ville</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">N° RCCM</label>
                <input
                  type="text"
                  value={form.rccm_number}
                  onChange={(e) => setForm({ ...form, rccm_number: e.target.value })}
                  placeholder="RB/COT/2026/B..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Devise Principale</label>
                <input
                  type="text"
                  value={form.currency}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Zone UEMOA (FCFA - XOF)</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement en cours...' : 'Enregistrer les informations'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 2 : FISCALITÉ DGI BÉNIN & e-MECeF                            */}
      {/* =================================================================== */}
      {activeTab === 'fiscalite' && (
        <form onSubmit={handleSaveCompany} className="space-y-6 animate-fadeIn">
          {/* Identifiants Fiscaux */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Régime Fiscal & IFU Bénin</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Numéro IFU (13 Chiffres) *</label>
                <input
                  type="text"
                  required
                  value={form.ifu_number}
                  onChange={(e) => setForm({ ...form, ifu_number: e.target.value })}
                  placeholder="Ex: 3202612345678"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Régime d'Imposition</label>
                <select
                  value={form.regime_fiscal}
                  onChange={(e) => setForm({ ...form, regime_fiscal: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                >
                  <option value="Régime Réel Simplifié (RRS)">Régime Réel Simplifié (RRS)</option>
                  <option value="Régime Réel Normal (RRN)">Régime Réel Normal (RRN)</option>
                  <option value="Régime de la TPS">Régime de la TPS (Non assujetti TVA)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Taux TVA par Défaut</label>
                <div className="relative">
                  <input
                    type="number"
                    value={form.tva_default_rate}
                    onChange={(e) => setForm({ ...form, tva_default_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">18% pour les assujettis TVA, 0% pour TPS / exonérés.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Taux Acompte AIB</label>
                <div className="relative">
                  <input
                    type="number"
                    value={form.aib_default_rate}
                    onChange={(e) => setForm({ ...form, aib_default_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">1% (entreprises immatriculées) ou 5% (prestataires/non immatriculés). Calculé strictement sur le HT.</p>
              </div>
            </div>
          </div>

          {/* Module e-MECeF DGI */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  <span>Module e-MECeF (Facture Normalisée DGI Bénin)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestion des deux modes légaux d'émission des factures et tickets
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  form.e_mecef_connected
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {form.e_mecef_connected ? '● État 2 : Connecté DGI' : '○ État 1 : Facture Standard'}
                </span>
              </div>
            </div>

            {/* Explications des deux états */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                !form.e_mecef_connected ? 'bg-emerald-50/50 border-emerald-300 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
                  <span>État 1 : Facture Commerciale Standard</span>
                  {!form.e_mecef_connected && <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full">Actif</span>}
                </h4>
                <p>
                  Par défaut, l'application émet des <strong>Factures Commerciales Standards</strong> parfaitement valides avec toutes les mentions commerciales et légales, <strong>sans QR code factice ni faux NIM</strong>.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                form.e_mecef_connected ? 'bg-emerald-50/50 border-emerald-300 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
                  <span>État 2 : e-MECeF Certifié & Connecté</span>
                  {form.e_mecef_connected && <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full">Actif</span>}
                </h4>
                <p>
                  Activation dès que l'entreprise dispose de son NIM officiel et de ses jetons API e-MECeF DGI. Chaque vente génère le QR code officiel et les compteurs fiscaux certifiés.
                </p>
              </div>
            </div>

            {/* Toggle activation e-MECeF */}
            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.e_mecef_connected}
                  onChange={(e) => setForm({ ...form, e_mecef_connected: e.target.checked, e_mecef_active: e.target.checked })}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Activer la certification e-MECeF DGI en direct
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Cochez cette case uniquement si votre machine ou API e-MECeF est enregistrée auprès de la DGI Bénin.
                  </p>
                </div>
              </label>
            </div>

            {form.e_mecef_connected && (
              <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">NIM e-MECeF Officiel *</label>
                    <input
                      type="text"
                      value={form.e_mecef_nim}
                      onChange={(e) => setForm({ ...form, e_mecef_nim: e.target.value })}
                      placeholder="Ex: BENIN-DGI-EMEF-2026-001"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">URL API Serveur e-MECeF</label>
                    <input
                      type="text"
                      value={form.e_mecef_api_url}
                      onChange={(e) => setForm({ ...form, e_mecef_api_url: e.target.value })}
                      placeholder="https://emef.dgi.bj/api/..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jeton d'autorisation (Token API DGI)</label>
                  <input
                    type="password"
                    value={form.e_mecef_token}
                    onChange={(e) => setForm({ ...form, e_mecef_token: e.target.value })}
                    placeholder="Clé secrète / Token JWT fourni par la DGI"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement en cours...' : 'Enregistrer la fiscalité'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 3 : CLÔTURES DE CAISSE & NOTIFICATIONS EMAIL                */}
      {/* =================================================================== */}
      {activeTab === 'notifications' && (
        <form onSubmit={handleSaveCompany} className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-600" />
                <span>Destinataires du Rapport de Clôture Quotidienne (Z de caisse)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                À chaque clôture de caisse, un rapport récapitulatif détaillé en PDF est automatiquement généré et transmis à un minimum de 3 adresses emails configurées ci-dessous (Direction, Gérant, Comptable).
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Destinataire 1 (Direction Générale / Propriétaire) *
                </label>
                <input
                  type="email"
                  required
                  value={form.closure_email_1}
                  onChange={(e) => setForm({ ...form, closure_email_1: e.target.value })}
                  placeholder="directeur@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Destinataire 2 (Gérant / Responsable de Boutique) *
                </label>
                <input
                  type="email"
                  required
                  value={form.closure_email_2}
                  onChange={(e) => setForm({ ...form, closure_email_2: e.target.value })}
                  placeholder="gerant@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Destinataire 3 (Comptabilité / Auditeur Externe) *
                </label>
                <input
                  type="email"
                  required
                  value={form.closure_email_3}
                  onChange={(e) => setForm({ ...form, closure_email_3: e.target.value })}
                  placeholder="comptable@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_send_closure_pdf}
                  onChange={(e) => setForm({ ...form, auto_send_closure_pdf: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-xs font-bold text-slate-800">
                  Envoi automatique instantané du PDF de clôture lors de la validation du Z de caisse
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement en cours...' : 'Enregistrer les alertes de clôture'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 4 : ÉQUIPE & UTILISATEURS INTERNES                          */}
      {/* =================================================================== */}
      {activeTab === 'utilisateurs' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Bannière explicative */}
          <div className="bg-emerald-950 text-white p-6 rounded-3xl shadow-sm border border-emerald-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Gestion des Utilisateurs Internes</span>
              </h2>
              <p className="text-xs text-emerald-200/80 mt-1 max-w-2xl leading-relaxed">
                Configurez manuellement les identifiants, mots de passe, rôles, secteurs et permissions
                de chaque membre de votre personnel (Caissiers, Magasiniers, Gestionnaires, etc.).
              </p>
            </div>
            <button
              onClick={() => { setShowCreateModal(true); setCreateError(''); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/30 transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Créer un utilisateur</span>
            </button>
          </div>

          {/* Tableau des utilisateurs */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Utilisateurs enregistrés ({usersList.length})
              </h3>
            </div>

            {loadingUsers ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Chargement des profils utilisateurs...
              </div>
            ) : usersList.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Aucun utilisateur interne enregistré pour le moment. Cliquez sur "Créer un utilisateur" pour en ajouter un.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto">
                {usersList.map((item) => {
                  const isAdmin = item.role === 'administrateur' || item.role === 'super_admin'
                  return (
                    <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs ${
                          isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {item.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-800 truncate">{item.full_name}</p>
                            {isAdmin && (
                              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                                Administrateur
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span>Identifiant : <strong className="text-slate-700 font-mono">{item.username}</strong></span>
                            <span>•</span>
                            <span className="capitalize">Rôle : <strong className="text-slate-700">{item.role}</strong></span>
                            {item.permissions?.sector && (
                              <>
                                <span>•</span>
                                <span>Secteur : <strong className="text-slate-700 capitalize">{item.permissions.sector}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          item.is_active !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {item.is_active !== false ? 'Actif' : 'Désactivé'}
                        </span>

                        {!isAdmin && (
                          <>
                            <button
                              onClick={() => { setResetModalUser(item); setResetPasswordVal(''); }}
                              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                              title="Réinitialiser le mot de passe"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => toggleUserStatus(item)}
                              className={`p-2 rounded-xl transition ${
                                item.is_active !== false
                                  ? 'text-rose-500 hover:bg-rose-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={item.is_active !== false ? 'Désactiver le compte' : 'Activer le compte'}
                            >
                              {item.is_active !== false ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL : CRÉATION UTILISATEUR INTERNE (ADMINISTRATEUR)               */}
      {/* =================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base leading-snug">Créer un utilisateur interne</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Renseignez l'identifiant, le mot de passe, le secteur et les permissions
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 overflow-y-auto space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Nom & Téléphone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    placeholder="Ex: Koffi Mensah"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    placeholder="Ex: 0197000000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Identifiant & Mot de passe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-emerald-50/50 border border-emerald-200/60 rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Identifiant de connexion *</label>
                  <input
                    type="text"
                    required
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="Ex: caissier1, magasinier"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Utilisé pour se connecter (sans email).</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Mot de passe initial *</label>
                  <input
                    type="text"
                    required
                    value={newUser.initial_password}
                    onChange={(e) => setNewUser({ ...newUser, initial_password: e.target.value })}
                    placeholder="Mot de passe temporaire"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Modifiable par l'utilisateur ensuite.</p>
                </div>
              </div>

              {/* Rôle & Secteur */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rôle métier *</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm capitalize"
                  >
                    <option value="caissier">Caissier / Caissière</option>
                    <option value="vendeur">Vendeur / Commercial</option>
                    <option value="magasinier">Magasinier</option>
                    <option value="gestionnaire">Gestionnaire de stock</option>
                    <option value="comptable">Comptable</option>
                    <option value="responsable_secteur">Responsable de secteur</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Secteur d'affectation *</label>
                  <select
                    value={newUser.sector}
                    onChange={(e) => setNewUser({ ...newUser, sector: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm capitalize"
                  >
                    <option value="boutique">Boutique & Commerce général</option>
                    <option value="poissonnerie">Poissonnerie & Surgelés</option>
                    <option value="quincaillerie">Quincaillerie & Matériaux</option>
                    <option value="brasserie">Brasserie & Dépôt Boissons</option>
                    <option value="station">Station-Service</option>
                    <option value="pharmacie">Pharmacie</option>
                    <option value="restaurant">Restaurant & Maquis</option>
                    <option value="pressing">Pressing & Blanchisserie</option>
                  </select>
                </div>
              </div>

              {/* Permissions & Droits d'accès */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Permissions et droits d'accès
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  {[
                    { key: 'ventes', label: 'Ventes / POS' },
                    { key: 'caisse', label: 'Caisse' },
                    { key: 'stock', label: 'Stocks & Inventaires' },
                    { key: 'clients', label: 'Clients' },
                    { key: 'fournisseurs', label: 'Fournisseurs / Achats' },
                    { key: 'depenses', label: 'Dépenses' },
                    { key: 'reporting', label: 'Reporting & Rapports' },
                    { key: 'finances', label: 'Trésorerie & Banques' },
                    { key: 'syscohada', label: 'Comptabilité SYSCOHADA' },
                  ].map((perm) => (
                    <label key={perm.key} className="flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={!!(newUser.permissions as any)[perm.key]}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          permissions: {
                            ...newUser.permissions,
                            [perm.key]: e.target.checked
                          }
                        })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {creatingUser ? 'Enregistrement...' : 'Enregistrer l’utilisateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL : RÉINITIALISATION DU MOT DE PASSE                            */}
      {/* =================================================================== */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Réinitialiser le mot de passe de <span className="text-emerald-700">{resetModalUser.username}</span>
              </h3>
              <button
                onClick={() => setResetModalUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nouveau mot de passe pour cet utilisateur
                </label>
                <input
                  type="text"
                  required
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="Ex: MotDePasse2026"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingReset}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {savingReset ? 'Mise à jour...' : 'Confirmer le nouveau mot de passe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConfigPage
