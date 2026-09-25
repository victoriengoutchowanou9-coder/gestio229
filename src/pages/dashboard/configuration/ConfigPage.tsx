// =============================================================================
// GESTIO 229 SaaS — Configuration & Paramètres Entreprise
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Building2, Save, ShieldCheck, CheckCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

const ConfigPage: React.FC = () => {
  const { company, refreshTenantContext } = useAuthStore()
  const { toast } = useUIStore()

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
    currency: 'FCFA',
    tva_default_rate: 18,
    aib_default_rate: 1,
    e_mecef_active: true,
    e_mecef_nim: '',
  })

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
        currency: company.currency || 'FCFA',
        tva_default_rate: company.tva_default_rate ?? 18,
        aib_default_rate: company.aib_default_rate ?? 1,
        e_mecef_active: company.e_mecef_active ?? true,
        e_mecef_nim: company.e_mecef_nim || 'BENIN-DGI-EMEF-2026-001',
      })
    }
  }, [company])

  const handleSave = async (e: React.FormEvent) => {
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
      toast.success('Configuration sauvegardée avec succès')
      await refreshTenantContext()
    } catch (err: any) {
      toast.error('Erreur de mise à jour', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuration de l'Établissement</h1>
        <p className="text-slate-500 text-sm mt-1">Identité juridique, fiscalité DGI Bénin (e-MECeF) et paramètres généraux</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identité Entreprise */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <span>Identité & Coordonnées</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Raison Sociale *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Forme Juridique</label>
              <select
                value={form.legal_form}
                onChange={(e) => setForm({ ...form, legal_form: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                <option value="SARL">SARL</option>
                <option value="SAS">SAS</option>
                <option value="Ets">Établissement Individuel</option>
                <option value="SA">Société Anonyme (SA)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Téléphone Principal</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email Officiel</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Adresse Siège</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Quartier, Rue, Porte..."
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
        </div>

        {/* Fiscalité & e-MECeF */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>Paramètres Fiscaux & DGI Bénin (e-MECeF)</span>
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">N° RCCM</label>
              <input
                type="text"
                value={form.rccm_number}
                onChange={(e) => setForm({ ...form, rccm_number: e.target.value })}
                placeholder="RB/COT/..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Acompte AIB</label>
              <div className="relative">
                <input
                  type="number"
                  value={form.aib_default_rate}
                  onChange={(e) => setForm({ ...form, aib_default_rate: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">NIM e-MECeF</label>
              <input
                type="text"
                value={form.e_mecef_nim}
                onChange={(e) => setForm({ ...form, e_mecef_nim: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
              />
            </div>
          </div>
        </div>

        {/* Bouton de sauvegarde */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Enregistrement en cours...' : 'Mettre à jour les paramètres'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

export default ConfigPage
