// =============================================================================
// GESTIO 229 SaaS — Dépenses & Charges d'Exploitation
// =============================================================================
// Nettoyé de toute donnée fictive — Uniquement les dépenses réelles
// Filtres par période (Du ... au ...) et par Catégorie avec recalcul immédiat
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Receipt, Plus, Search, Calendar, Tag, RefreshCw, X, ArrowDownRight,
  Filter, CheckCircle2, DollarSign
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { ModalPortal } from '../../../components/modals'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface Expense {
  id: string
  expense_number?: string
  title?: string
  description?: string
  category?: string
  amount: number
  payment_method?: string
  expense_date: string
  notes?: string
  created_by?: string
  created_at?: string
  user_name?: string
}

export const CATEGORIES = [
  'Loyer commercial',
  'Électricité (SBEE)',
  'Eau (SONEB)',
  'Salaires & Gratifications',
  'Transport & Déplacements',
  'Fournitures de bureau',
  'Communication & Internet',
  'Maintenance & Travaux',
  'Impôts & Taxes',
  'Autres charges'
]

export const DepensesPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Filtres : Période (Date début -> Date fin), Catégorie et Utilisateur
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<string>('all')

  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    amount: '' as any,
    payment_method: 'especes',
    expense_date: new Date().toISOString().split('T')[0],
    notes: ''
  })

  // Charger les dépenses réelles et les utilisateurs enregistrés dans Supabase
  const loadExpenses = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [{ data, error }, { data: profiles }] = await Promise.all([
        supabase
          .from('expenses')
          .select('*')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_profiles')
          .select('id, full_name, username')
          .eq('company_id', company.id)
      ])

      if (error) throw error

      const userMap = new Map<string, string>()
      if (profiles) {
        profiles.forEach((p: any) => {
          userMap.set(p.id, p.full_name || p.username || 'Utilisateur')
        })
        setUsersList(profiles.map((p: any) => ({ id: p.id, name: p.full_name || p.username || 'Utilisateur' })))
      }

      // Isolation stricte par sous-logiciel : filtrer par secteur actif
      const sectorExpenses = filterItemsForSector(data || [], currentSectorSlug)

      const mapped = sectorExpenses.map((exp: any) => ({
        ...exp,
        title: exp.title || exp.beneficiary || exp.notes || 'Dépense',
        expense_date: exp.expense_date || (exp.created_at ? exp.created_at.split('T')[0] : ''),
        user_name: exp.created_by ? userMap.get(exp.created_by) || 'Utilisateur' : 'Non précisé'
      }))

      setExpenses(mapped)
    } catch (err: any) {
      console.error('Erreur chargement dépenses :', err)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [company?.id, currentSectorSlug])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  // Enregistrement d'une nouvelle dépense réelle
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(form.amount)
    if (!company?.id || !form.title.trim() || !numAmount || numAmount <= 0) return
    setSaving(true)
    try {
      const expNum = `DEP-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`
      const corePayload = {
        company_id: company.id,
        expense_number: expNum,
        category: form.category,
        beneficiary: form.title.trim(),
        amount: numAmount,
        payment_method: form.payment_method,
        notes: form.notes.trim() ? `${form.notes.trim()} (Date: ${form.expense_date})` : `Date: ${form.expense_date}`,
        created_by: user?.id || null
      }

      const { data: insData, error: insErr } = await supabase
        .from('expenses')
        .insert(corePayload)
        .select()
        .single()

      if (insErr || !insData) {
        throw new Error(insErr?.message || "Échec d'enregistrement de la dépense.")
      }

      // Impact Caisse : si paiement en espèces, déduire immédiatement du tiroir caisse dans Supabase
      if (form.payment_method === 'especes' && company?.id) {
        try {
          const { data: reg } = await supabase
            .from('cash_registers')
            .select('id, current_cash_balance')
            .eq('company_id', company.id)
            .limit(1)
            .maybeSingle()
          if (reg) {
            await supabase
              .from('cash_registers')
              .update({
                current_cash_balance: Math.max(0, (Number(reg.current_cash_balance) || 0) - numAmount)
              })
              .eq('id', reg.id)
          }
        } catch (e) {}
      }

      const newExp = {
        ...insData,
        title: form.title.trim(),
        expense_date: form.expense_date,
        user_name: user?.full_name || user?.username || 'Utilisateur'
      }

      // Optimistic UI : affichage immédiat
      setExpenses((prev) => [newExp, ...prev.filter(x => x.id !== newExp.id)])

      toast.success(
        'Dépense enregistrée avec succès !',
        form.payment_method === 'especes'
          ? `${fmt(numAmount)} déduits de la caisse opérationnelle.`
          : undefined
      )
      setShowModal(false)
      setForm({
        title: '',
        category: CATEGORIES[0],
        amount: '',
        payment_method: 'especes',
        expense_date: new Date().toISOString().split('T')[0],
        notes: ''
      })
    } catch (err: any) {
      toast.error('Erreur lors de l’enregistrement de la dépense', err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Filtrage Réactif et Immédiat (Date, Catégorie, Utilisateur, Mot-clé) ──
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // 1. Filtre par recherche texte
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchTitle = e.title?.toLowerCase().includes(q)
        const matchCat = e.category?.toLowerCase().includes(q)
        if (!matchTitle && !matchCat) return false
      }

      // 2. Filtre par catégorie
      if (selectedCategory !== 'all' && e.category !== selectedCategory) {
        return false
      }

      // 3. Filtre par utilisateur / auteur
      if (selectedUser !== 'all' && e.created_by !== selectedUser) {
        return false
      }

      // 4. Filtre par période (Date début -> Date fin)
      const expDate = e.expense_date || (e.created_at ? e.created_at.split('T')[0] : '')
      if (startDate && expDate < startDate) {
        return false
      }
      if (endDate && expDate > endDate) {
        return false
      }

      return true
    })
  }, [expenses, search, selectedCategory, selectedUser, startDate, endDate])

  // Recalcul immédiat du total selon les filtres
  const totalFilteredExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  }, [filteredExpenses])

  const handleResetFilters = () => {
    setStartDate('')
    setEndDate('')
    setSelectedCategory('all')
    setSelectedUser('all')
    setSearch('')
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête Dépenses ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-rose-600" />
            Dépenses & Charges
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi des charges d'exploitation, factures réelles et sorties de caisse
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadExpenses}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-600' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-rose-700 transition shadow-md shadow-rose-200"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Dépense</span>
          </button>
        </div>
      </div>

      {/* ── Barre de Filtres Complète Exigée : Date, Catégorie, Utilisateur ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-rose-600" />
            Filtres de Période, Catégorie & Utilisateur
          </span>
          {(startDate || endDate || selectedCategory !== 'all' || selectedUser !== 'all' || search) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Période : Date début */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">Du (Date Début)</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          {/* Période : Date fin */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">Au (Date Fin)</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">Catégorie</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            >
              <option value="all">Toutes les catégories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Utilisateur / Caissier */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">Utilisateur</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            >
              <option value="all">Tous les utilisateurs</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Recherche textuelle */}
          <div>
            <label className="block text-slate-500 font-bold mb-1">Mot-clé / Réf</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Rechercher libellé..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs Recalculés selon les Filtres ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Total des Dépenses Filtrées
              </span>
              <span className="text-[10px] text-slate-400">
                {startDate || endDate ? `Période sélectionnée` : `Toutes dates confondues`}
              </span>
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono mt-1">
            {fmt(totalFilteredExpenses)}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Justificatifs Comptabilisés
              </span>
              <span className="text-[10px] text-slate-400">
                {filteredExpenses.length} dépense(s) répondant aux critères
              </span>
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 font-mono mt-1">
            {filteredExpenses.length}
          </p>
        </div>
      </div>

      {/* ── Tableau du Journal des Dépenses Réelles ─────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-rose-600" />
            <span>Journal des Dépenses Réelles</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">{filteredExpenses.length} ligne(s)</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
            <span>Chargement des dépenses réelles...</span>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <p className="text-sm font-bold text-slate-600">Aucune dépense enregistrée</p>
            <p className="text-xs max-w-sm mx-auto text-slate-400">
              {expenses.length === 0
                ? "Aucune charge ou dépense d'exploitation n'a été saisie pour le moment. Cliquez sur [Nouvelle Dépense] pour en ajouter une."
                : "Aucune dépense ne correspond aux critères de filtre sélectionnés (période ou catégorie)."}
            </p>
            {expenses.length === 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
                >
                  + Enregistrer une dépense
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Libellé de la Dépense</th>
                  <th className="p-4">Catégorie</th>
                  <th className="p-4">Utilisateur</th>
                  <th className="p-4 text-center">Mode Règlement</th>
                  <th className="p-4 text-right">Montant (FCFA)</th>
                  <th className="p-4">Notes / Réf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition font-sans">
                    <td className="p-4 text-slate-500 font-mono text-xs">
                      {exp.expense_date
                        ? new Date(exp.expense_date).toLocaleDateString('fr-BJ')
                        : 'N/A'}
                    </td>
                    <td className="p-4 font-bold text-slate-800">
                      {exp.title}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-medium rounded-full text-[11px]">
                        {exp.category}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 text-xs font-medium">
                      {exp.user_name || 'Utilisateur'}
                    </td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 capitalize">
                        {exp.payment_method === 'especes' ? 'Espèces' :
                         exp.payment_method === 'momo' ? 'Mobile Money' :
                         exp.payment_method === 'cheque' ? 'Chèque' :
                         exp.payment_method || 'Espèces'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono font-black text-rose-600 text-sm">
                      {fmt(exp.amount)}
                    </td>
                    <td className="p-4 text-slate-400 text-xs truncate max-w-xs">
                      {exp.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL CRÉATION DE DÉPENSE ────────────────────────────────────────── */}
      <ModalPortal isOpen={showModal} onClose={() => setShowModal(false)} id="modal-new-expense">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-rose-600" />
              Enregistrer une Dépense Réelle
            </h3>
            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Libellé / Objet de la dépense *</label>
              <input
                type="text"
                required
                placeholder="Ex : Facture électricité SBEE boutique"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Catégorie *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mode de Paiement *</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="especes">Espèces (Tiroir Caisse)</option>
                  <option value="momo">Mobile Money (MTN / Moov)</option>
                  <option value="virement">Virement Bancaire</option>
                  <option value="cheque">Chèque Bancaire</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant Payé (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Date du Décaissement *</label>
                <input
                  type="date"
                  required
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Notes / Référence du justificatif</label>
              <textarea
                rows={2}
                placeholder="Ex : N° de quittance ou reçu remis par le fournisseur"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <span>Enregistrer la Dépense</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>
    </div>
  )
}

export default DepensesPage
