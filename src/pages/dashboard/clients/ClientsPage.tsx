// =============================================================================
// GESTIO 229 SaaS — Clients & Créances
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Search, Phone, MapPin, AlertCircle, RefreshCw, X } from 'lucide-react'
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

const ClientsPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

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
  }, [company?.id])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const filtered = customers.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

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
        is_active: true
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients & Créances</h1>
          <p className="text-slate-500 text-sm mt-1">Répertoire commercial et suivi des arriérés de paiement</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nouveau client
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Total Clients</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{customers.length}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Créances Totales</span>
          </div>
          <p className="text-2xl font-black text-red-600">{fmt(totalDebt)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Clients Débiteurs</span>
          </div>
          <p className="text-2xl font-black text-amber-600">{debtorsCount} compte(s)</p>
        </div>
      </div>

      {/* Search & Refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou code client..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={loadCustomers}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
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
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Nom / Raison Sociale</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Plafond Crédit</th>
                  <th className="px-6 py-4">Solde Dû</th>
                  <th className="px-6 py-4 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-700">{item.code}</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-800">{item.name}</p>
                      {item.ifu_number && (
                        <p className="text-xs text-slate-400 font-mono">IFU: {item.ifu_number}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs space-y-0.5">
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
                    <td className="px-6 py-4 text-slate-600">{fmt(item.credit_limit || 0)}</td>
                    <td className="px-6 py-4">
                      {item.current_debt > 0 ? (
                        <span className="font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-md">
                          {fmt(item.current_debt)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">À jour (0 F)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={clsx(
                        'text-xs px-2.5 py-1 rounded-full font-bold',
                        item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      )}>
                        {item.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Création Client */}
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
    </div>
  )
}

export default ClientsPage
