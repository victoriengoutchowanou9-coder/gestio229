// =============================================================================
// GESTIO 229 SaaS — Dépenses & Charges d'Exploitation (Tous Secteurs)
// RÈGLE MÉTIER OFFICIELLE : DÉCOUVERT AUTORISÉ & RÉAJUSTEMENT AUTOMATIQUE
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Receipt, Plus, Search, Calendar, Tag, RefreshCw, X, ArrowDownRight,
  Filter, CheckCircle2, DollarSign, AlertCircle, AlertTriangle, Building2, Wallet
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { useAppContext } from '../../../contexts/AppContext'
import { getNextSectorCode } from '../../../lib/supabaseTenant'
import { filterItemsForSector } from '../../../lib/sectorClient'
import { ModalPortal } from '../../../components/modals'
import { formatFCFA } from '../../../utils/formatters'
import {
  enregistrerDepenseCaisse,
  getSoldeFondActuel,
} from '../../../services/caisseDepensesService'
import { enregistrerMouvementCaisse } from '../../../services/caisseSectorService'

const fmt = (n: number) => formatFCFA(n)

export interface Expense {
  id: string
  expense_number?: string
  title?: string
  description?: string
  category?: string
  categorie?: string
  amount: number
  montant?: number
  payment_method?: string
  mode_paiement?: string
  expense_date: string
  date_depense?: string
  fond_avant?: number
  fond_apres?: number
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

export const MODES_PAIEMENT = [
  { key: 'espece', label: 'Espèces (Tiroir Caisse)' },
  { key: 'mtn_momo', label: 'MTN Mobile Money' },
  { key: 'moov', label: 'Moov Money' },
  { key: 'banque', label: 'Virement / Compte Bancaire' },
  { key: 'orange_money', label: 'Orange Money' }
]

export const DepensesPage: React.FC = () => {
  const { user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId, secteurActif, caisseActive, refreshFonds } = useAppContext()
  const { sectorSlug } = useTenant()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Filtres
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<string>('all')

  // Formulaire d'enregistrement
  const [form, setForm] = useState({
    categorie: CATEGORIES[0],
    description: '',
    montant: 0 as any,
    mode_paiement: 'espece' as 'espece' | 'mtn_momo' | 'moov' | 'banque' | 'orange_money',
    date_depense: new Date().toISOString().split('T')[0],
    notes: ''
  })

  // Fond actuel dynamique selon secteur + mode de paiement
  const [fondActuel, setFondActuel] = useState<number>(0)

  // Charger le fond actuel selon secteur + mode
  const fetchFond = useCallback(async () => {
    if (!companyId || !secteurActif?.id) return
    try {
      // 1. Requête directe Supabase fonds_actuels
      const { data, error } = await supabase
        .from('fonds_actuels')
        .select('solde_actuel')
        .eq('company_id', companyId)
        .eq('secteur_id', secteurActif.id)
        .eq('caisse_id', caisseActive?.id || null)
        .eq('type_fond', form.mode_paiement)
        .maybeSingle()

      if (!error && data && typeof data.solde_actuel === 'number') {
        setFondActuel(data.solde_actuel)
        return
      }
    } catch (_) {}

    // Fallback service
    const val = await getSoldeFondActuel(companyId, secteurActif.id, caisseActive?.id, form.mode_paiement)
    setFondActuel(val)
  }, [companyId, secteurActif?.id, caisseActive?.id, form.mode_paiement])

  useEffect(() => {
    fetchFond()
  }, [fetchFond])

  const fondApres = fondActuel - Number(form.montant || 0)

  // Charger les dépenses réelles et les utilisateurs enregistrés dans Supabase
  const loadExpenses = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // Charger les utilisateurs
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, username')
        .eq('company_id', companyId)

      const userMap = new Map<string, string>()
      if (profiles) {
        profiles.forEach((p: any) => {
          userMap.set(p.id, p.full_name || p.username || 'Utilisateur')
        })
        setUsersList(profiles.map((p: any) => ({ id: p.id, name: p.full_name || p.username || 'Utilisateur' })))
      }

      // 1. Chercher dans table `depenses`
      const { data: depList, error: depErr } = await supabase
        .from('depenses')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      // 2. Chercher dans table `expenses`
      const { data: expList } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      const combined: Expense[] = []

      if (!depErr && depList && depList.length > 0) {
        depList.forEach((d: any) => {
          combined.push({
            id: d.id,
            expense_number: `DEP-${d.id.slice(0, 6)}`,
            title: d.description || d.categorie,
            description: d.description,
            category: d.categorie,
            categorie: d.categorie,
            amount: Number(d.montant) || 0,
            montant: Number(d.montant) || 0,
            payment_method: d.mode_paiement,
            mode_paiement: d.mode_paiement,
            expense_date: d.date_depense || (d.created_at ? d.created_at.split('T')[0] : ''),
            fond_avant: d.fond_avant,
            fond_apres: d.fond_apres,
            created_by: d.created_by,
            created_at: d.created_at,
            user_name: d.created_by ? userMap.get(d.created_by) || 'Utilisateur' : 'Non précisé'
          })
        })
      }

      if (expList && expList.length > 0) {
        const sectorExps = filterItemsForSector(expList, sectorSlug || secteurActif?.slug)
        sectorExps.forEach((exp: any) => {
          if (!combined.some((c) => c.id === exp.id)) {
            combined.push({
              id: exp.id,
              expense_number: exp.expense_number || `DEP-${exp.id.slice(0, 6)}`,
              title: exp.title || exp.beneficiary || exp.notes || 'Dépense',
              description: exp.notes || exp.title,
              category: exp.category || 'Autres charges',
              categorie: exp.category || 'Autres charges',
              amount: Number(exp.amount) || 0,
              montant: Number(exp.amount) || 0,
              payment_method: exp.payment_method || 'espece',
              mode_paiement: exp.payment_method || 'espece',
              expense_date: exp.expense_date || (exp.created_at ? exp.created_at.split('T')[0] : ''),
              created_by: exp.created_by,
              created_at: exp.created_at,
              user_name: exp.created_by ? userMap.get(exp.created_by) || 'Utilisateur' : 'Non précisé'
            })
          }
        })
      }

      setExpenses(combined)
    } catch (err: any) {
      console.error('Erreur chargement dépenses :', err)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug, secteurActif?.slug])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  // Enregistrement d'une nouvelle dépense
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(form.montant)
    if (!companyId || !numAmount || numAmount <= 0) {
      toast.error('Veuillez indiquer un montant supérieur à 0.')
      return
    }

    setSaving(true)
    try {
      const desc = form.description.trim() || form.categorie

      // Appel de la fonction de création de dépense
      const res = await enregistrerDepenseCaisse({
        company_id: companyId,
        secteur_id: secteurActif.id,
        caisse_id: caisseActive?.id || null,
        categorie: form.categorie,
        description: desc,
        montant: numAmount,
        mode_paiement: form.mode_paiement,
        user_id: user?.id || null,
      })

      if (!res.success && res.error) {
        toast.error('Erreur enregistrement dépense', res.error)
        setSaving(false)
        return
      }

      // Synchronisation miroir dans expenses pour reporting général
      try {
        const expNum = await getNextSectorCode('expenses', 'DEP', companyId, secteurActif.slug)
        await supabase.from('expenses').insert({
          company_id: companyId,
          sector_slug: secteurActif.slug,
          expense_number: expNum,
          category: form.categorie,
          beneficiary: desc,
          amount: numAmount,
          payment_method: form.mode_paiement === 'espece' ? 'especes' : form.mode_paiement,
          notes: form.notes.trim() ? `${form.notes.trim()} (Date: ${form.date_depense})` : `Date: ${form.date_depense}`,
          created_by: user?.id || null
        })
      } catch (_) {}

      // Mettre à jour le mouvement de caisse
      try {
        await enregistrerMouvementCaisse({
          company_id: companyId,
          sector_slug: secteurActif.slug,
          caisse_id: caisseActive?.id,
          type: 'depense',
          sens: 'sortie',
          montant_especes: form.mode_paiement === 'espece' ? numAmount : 0,
          montant_momo: ['mtn_momo', 'moov', 'orange_money'].includes(form.mode_paiement) ? numAmount : 0,
          source_module: 'depenses',
          source_id: res.depense_id,
          motif: `Dépense: ${desc} (${form.categorie})`,
          user_name: user?.full_name || user?.username || 'Utilisateur',
          user_id: user?.id,
        })
      } catch (_) {}

      // Alertes selon la règle officielle
      if (res.apres < 0) {
        toast.warning(
          `Fond ${form.mode_paiement} en découvert : ${fmt(res.apres)} - Réajustement à la prochaine entrée`
        )
      } else {
        toast.success('Dépense enregistrée avec succès')
      }

      setShowModal(false)
      setForm({
        categorie: CATEGORIES[0],
        description: '',
        montant: 0,
        mode_paiement: 'espece',
        date_depense: new Date().toISOString().split('T')[0],
        notes: ''
      })

      await fetchFond()
      await refreshFonds()
      await loadExpenses()
    } catch (err: any) {
      toast.error('Erreur lors de l’enregistrement de la dépense', err.message)
    } finally {
      setSaving(false)
    }
  }

  // Filtrage Réactif
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchTitle = (e.title || e.description || '').toLowerCase().includes(q)
        const matchCat = (e.category || e.categorie || '').toLowerCase().includes(q)
        if (!matchTitle && !matchCat) return false
      }

      if (selectedCategory !== 'all' && (e.category || e.categorie) !== selectedCategory) {
        return false
      }

      if (selectedUser !== 'all' && e.created_by !== selectedUser) {
        return false
      }

      const expDate = e.expense_date || (e.created_at ? e.created_at.split('T')[0] : '')
      if (startDate && expDate < startDate) return false
      if (endDate && expDate > endDate) return false

      return true
    })
  }, [expenses, search, selectedCategory, selectedUser, startDate, endDate])

  const totalFilteredExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount || e.montant) || 0), 0)
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            Dépenses & Sorties de Caisse
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Secteur actif : <b className="text-slate-800 dark:text-slate-200">{secteurActif?.nom}</b> | Caisse : <b className="text-slate-800 dark:text-slate-200">{caisseActive?.nom}</b>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadExpenses(); fetchFond(); }}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-600' : ''}`} />
          </button>
          <button
            onClick={() => { fetchFond(); setShowModal(true); }}
            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-md shadow-rose-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Dépense</span>
          </button>
        </div>
      </div>

      {/* ── Règle Découvert Autorisé : Bannière Explicative ── */}
      <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <b>Règle métier officielle (Tous secteurs) :</b> Les dépenses se déduisent automatiquement du fond sélectionné. 
          Si le solde est insuffisant ou nul, le fond devient <b>négatif (découvert autorisé)</b> sans aucun blocage. 
          Le solde sera automatiquement réajusté à la prochaine entrée (vente ou dépôt).
        </div>
      </div>

      {/* ── Barre de Filtres ── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
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
          <div>
            <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Du (Date Début)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Au (Date Fin)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Catégorie</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100"
            >
              <option value="all">Toutes les catégories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Utilisateur</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100"
            >
              <option value="all">Tous les utilisateurs</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Mot-clé / Réf</label>
            <input
              type="text"
              placeholder="Rechercher libellé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* ── KPI Total ── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl">
              <ArrowDownRight className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Total des Dépenses Réelles</p>
              <h3 className="text-xl font-black text-rose-600 dark:text-rose-400">
                {fmt(totalFilteredExpenses)}
              </h3>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
            {filteredExpenses.length} dépense(s)
          </span>
        </div>
      </div>

      {/* ── Tableau des Dépenses ── */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Réf</th>
                <th className="py-3 px-4">Bénéficiaire / Description</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Fond Avant → Après</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4">Auteur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-600" />
                    Chargement des dépenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucune dépense enregistrée pour les critères sélectionnés.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {exp.expense_date}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                      {exp.expense_number || `DEP-${exp.id.slice(0, 6)}`}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {exp.title || exp.description}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {exp.category || exp.categorie}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-600 dark:text-slate-300">
                      {exp.payment_method || exp.mode_paiement}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">
                      {typeof exp.fond_avant === 'number' && typeof exp.fond_apres === 'number' ? (
                        <span className={exp.fond_apres < 0 ? 'text-red-600 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                          {fmt(exp.fond_avant)} → {fmt(exp.fond_apres)}
                          {exp.fond_apres < 0 && ' (Découvert)'}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-rose-600 dark:text-rose-400">
                      -{fmt(exp.amount || exp.montant || 0)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {exp.user_name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Enregistrement Nouvelle Dépense ── */}
      <ModalPortal isOpen={showModal} onClose={() => setShowModal(false)}>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-rose-600" />
              Décaissement / Dépense de Caisse
            </h3>
            <button
              onClick={() => setShowModal(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Secteur actif & Caisse active */}
            <div className="text-xs text-slate-700 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600">
              Secteur actif : <b className="text-emerald-600 dark:text-emerald-400">{secteurActif?.nom}</b> | Caisse : <b>{caisseActive?.nom}</b>
            </div>

            {/* PREVIEW LIVE DU FOND (EXIGÉ PAR LA RÈGLE MÉTIER) */}
            <div
              className={`p-3 rounded-xl border font-semibold text-xs transition ${
                fondApres < 0
                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              }`}
            >
              Fond actuel {form.mode_paiement} : {fmt(fondActuel)} → Après : {fmt(fondApres)}{' '}
              {fondApres < 0 && '(NÉGATIF - DÉCOUVERT AUTORISÉ)'}
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Description / Motif de la Dépense *
              </label>
              <input
                type="text"
                required
                placeholder="Ex : Paiement facture Loyer commercial"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Catégorie *</label>
                <select
                  value={form.categorie}
                  onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mode de Paiement *</label>
                <select
                  value={form.mode_paiement}
                  onChange={(e) => setForm({ ...form, mode_paiement: e.target.value as any })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
                >
                  {MODES_PAIEMENT.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Montant Payé (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="0"
                  value={form.montant || ''}
                  onChange={(e) => setForm({ ...form, montant: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl font-mono font-bold text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Date de Dépense *</label>
                <input
                  type="date"
                  required
                  value={form.date_depense}
                  onChange={(e) => setForm({ ...form, date_depense: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Notes / Référence justificatif</label>
              <textarea
                rows={2}
                placeholder="Ex : Reçu n° 12458 remis en main propre"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
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
