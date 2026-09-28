// =============================================================================
// GESTIO 229 SaaS — Comptabilité SYSCOHADA Révisé (V1.0 Bénin & UEMOA)
// Conforme Acte Uniforme OHADA portant organisation et harmonisation des comptabilités
// Journal Général, Grand Livre, Balance 6 colonnes, Bilan SMT, Compte de Résultat et Export FEC
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen, RefreshCw, FileText, Download, CheckCircle, Search,
  Plus, AlertCircle, Printer, PieChart, Layers, ArrowRight, ShieldCheck,
  Building2, Calendar, FileSpreadsheet
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface JournalEntry {
  id: string
  entry_date: string
  piece_ref: string
  journal_code: string // VTE, ACH, CAI, BNQ, OD
  account_number: string
  account_label: string
  debit: number
  credit: number
  libelle: string
}

const DEFAULT_PLAN_SYSCOHADA = [
  // Classe 1 : Capitaux
  { code: '101000', label: 'Capital social / Dotations', classId: 1 },
  { code: '121000', label: 'Report à nouveau créditeur', classId: 1 },
  { code: '131000', label: 'Résultat net de l\'exercice (Bénéfice)', classId: 1 },
  // Classe 2 : Immobilisations
  { code: '218100', label: 'Matériel et mobilier de bureau', classId: 2 },
  { code: '218300', label: 'Matériel informatique et caisse', classId: 2 },
  // Classe 3 : Stocks
  { code: '311000', label: 'Marchandises en magasin', classId: 3 },
  // Classe 4 : Tiers
  { code: '401100', label: 'Fournisseurs d\'exploitation', classId: 4 },
  { code: '411100', label: 'Clients ordinaires - Ventes locales', classId: 4 },
  { code: '422000', label: 'Personnel - Rémunérations dues', classId: 4 },
  { code: '431000', label: 'Sécurité Sociale (CNSS Bénin)', classId: 4 },
  { code: '445200', label: 'État, TVA récupérable sur achats', classId: 4 },
  { code: '445710', label: 'État, TVA facturée sur ventes (18%)', classId: 4 },
  // Classe 5 : Trésorerie
  { code: '521100', label: 'Banques locales en FCFA', classId: 5 },
  { code: '571100', label: 'Caisse centrale espèces', classId: 5 },
  { code: '572100', label: 'Comptes Mobile Money (MTN / Moov / Wave)', classId: 5 },
  // Classe 6 : Charges
  { code: '601100', label: 'Achats de marchandises', classId: 6 },
  { code: '605100', label: 'Fournitures de bureau et consommables', classId: 6 },
  { code: '605200', label: 'Électricité (SBEE) & Eau (SONEB)', classId: 6 },
  { code: '613100', label: 'Locations immobilières et loyers commerciaux', classId: 6 },
  { code: '618100', label: 'Frais de télécommunications & Internet', classId: 6 },
  { code: '661100', label: 'Rémunérations directes du personnel', classId: 6 },
  { code: '664100', label: 'Charges sociales patronales CNSS & VPS', classId: 6 },
  // Classe 7 : Produits
  { code: '701100', label: 'Ventes de marchandises au comptoir', classId: 7 },
  { code: '701200', label: 'Ventes de marchandises à crédit', classId: 7 },
  { code: '707100', label: 'Prestations de services et commissions', classId: 7 },
]

const SyscohadaPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  // Tabs: 'journal' | 'grandlivre' | 'balance' | 'etats' | 'plan'
  const [activeTab, setActiveTab] = useState<'journal' | 'grandlivre' | 'balance' | 'etats' | 'plan'>('journal')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all')

  // Modal Nouvelle Écriture Manuelle (OD)
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({
    piece_ref: '',
    libelle: '',
    debit_account: '571100',
    credit_account: '701100',
    amount: 0,
    journal_code: 'OD'
  })

  // Chargement et agrégation des flux pour le Journal OHADA
  const loadJournal = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [
        { data: sales },
        { data: expenses },
        { data: purchases },
        { data: customers }
      ] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('*')
          .eq('company_id', company.id)
          .order('order_date', { ascending: false })
          .limit(100),
        supabase
          .from('expenses')
          .select('*')
          .eq('company_id', company.id)
          .order('expense_date', { ascending: false })
          .limit(100),
        supabase
          .from('purchase_orders')
          .select('*')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('customers')
          .select('id, name, code, current_debt')
          .eq('company_id', company.id)
      ])

      const generated: JournalEntry[] = []

      // 1. Écritures de Ventes (Journal VTE)
      ;(sales || []).forEach((sale) => {
        const dateStr = sale.order_date || sale.created_at || new Date().toISOString()
        const total = Number(sale.total_amount) || 0
        if (total <= 0) return

        const isCredit = sale.payment_method === 'credit'
        const isMoMo = sale.payment_method === 'momo' || sale.payment_method === 'wave'
        const debitAcc = isCredit ? '411100' : isMoMo ? '572100' : '571100'
        const debitLabel = isCredit ? 'Clients ordinaires' : isMoMo ? 'Comptes Mobile Money' : 'Caisse centrale'

        // Débit Trésorerie ou Tiers
        generated.push({
          id: `${sale.id}-d`,
          entry_date: dateStr,
          piece_ref: sale.order_number || 'VTE',
          journal_code: 'VTE',
          account_number: debitAcc,
          account_label: debitLabel,
          debit: total,
          credit: 0,
          libelle: `Vente ${sale.order_number || ''} - ${sale.customer_name || 'Client Comptoir'}`
        })

        // Crédit Vente de Marchandises
        generated.push({
          id: `${sale.id}-c`,
          entry_date: dateStr,
          piece_ref: sale.order_number || 'VTE',
          journal_code: 'VTE',
          account_number: '701100',
          account_label: 'Ventes de marchandises',
          debit: 0,
          credit: total,
          libelle: `Produits des ventes ${sale.order_number || ''}`
        })
      })

      // 2. Écritures de Dépenses (Journal CAI / ACH)
      ;(expenses || []).forEach((exp) => {
        const dateStr = exp.expense_date || exp.created_at || new Date().toISOString()
        const amount = Number(exp.amount) || 0
        if (amount <= 0) return

        const category = (exp.category || '').toLowerCase()
        let chargeAccount = '605100'
        let chargeLabel = 'Fournitures d\'exploitation'

        if (category.includes('loyer')) {
          chargeAccount = '613100'
          chargeLabel = 'Locations immobilières'
        } else if (category.includes('electricite') || category.includes('sbee') || category.includes('eau') || category.includes('soneb')) {
          chargeAccount = '605200'
          chargeLabel = 'Électricité & Eau'
        } else if (category.includes('salaire') || category.includes('paie')) {
          chargeAccount = '661100'
          chargeLabel = 'Rémunérations du personnel'
        }

        // Débit Compte de charge
        generated.push({
          id: `${exp.id}-d`,
          entry_date: dateStr,
          piece_ref: exp.reference || 'DEP',
          journal_code: 'CAI',
          account_number: chargeAccount,
          account_label: chargeLabel,
          debit: amount,
          credit: 0,
          libelle: exp.description || 'Dépense de fonctionnement'
        })

        // Crédit Caisse centrale
        generated.push({
          id: `${exp.id}-c`,
          entry_date: dateStr,
          piece_ref: exp.reference || 'DEP',
          journal_code: 'CAI',
          account_number: '571100',
          account_label: 'Caisse centrale espèces',
          debit: 0,
          credit: amount,
          libelle: `Règlement dépense : ${exp.description || 'Exploitation'}`
        })
      })

      // 3. Écritures d'Achats Fournisseurs validés (Journal ACH)
      ;(purchases || []).forEach((po) => {
        if (po.status === 'received' || po.status === 'validated') {
          const dateStr = po.expected_delivery_date || po.created_at || new Date().toISOString()
          const amount = Number(po.total_amount) || 0
          if (amount <= 0) return

          // Débit 601 Achats
          generated.push({
            id: `${po.id}-d`,
            entry_date: dateStr,
            piece_ref: po.order_number || 'BC',
            journal_code: 'ACH',
            account_number: '601100',
            account_label: 'Achats de marchandises',
            debit: amount,
            credit: 0,
            libelle: `Achat réapprovisionnement ${po.order_number || ''}`
          })

          // Crédit 401 Fournisseurs
          generated.push({
            id: `${po.id}-c`,
            entry_date: dateStr,
            piece_ref: po.order_number || 'BC',
            journal_code: 'ACH',
            account_number: '401100',
            account_label: 'Fournisseurs d\'exploitation',
            debit: 0,
            credit: amount,
            libelle: `Facture fournisseur ${po.supplier_name || ''}`
          })
        }
      })

      setEntries(generated)
    } catch (err: any) {
      toast.error('Erreur journal SYSCOHADA', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id, toast])

  useEffect(() => {
    loadJournal()
  }, [loadJournal])

  // Filtrage du journal
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        !search ||
        e.piece_ref.toLowerCase().includes(search.toLowerCase()) ||
        e.libelle.toLowerCase().includes(search.toLowerCase()) ||
        e.account_number.includes(search)
      const matchAccount =
        selectedAccountFilter === 'all' || e.account_number.startsWith(selectedAccountFilter)
      return matchSearch && matchAccount
    })
  }, [entries, search, selectedAccountFilter])

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const isDoubleEntryBalanced = Math.abs(totalDebit - totalCredit) < 1

  // Calcul du Grand Livre
  const grandLivreData = useMemo(() => {
    const map: Record<string, { label: string; debit: number; credit: number; entries: JournalEntry[] }> = {}
    entries.forEach((e) => {
      if (!map[e.account_number]) {
        map[e.account_number] = { label: e.account_label, debit: 0, credit: 0, entries: [] }
      }
      map[e.account_number].debit += e.debit
      map[e.account_number].credit += e.credit
      map[e.account_number].entries.push(e)
    })
    return map
  }, [entries])

  // Calcul de la Balance des Comptes (6 Colonnes)
  const trialBalance = useMemo(() => {
    const list: {
      account: string
      label: string
      mvtDebit: number
      mvtCredit: number
      soldeDebit: number
      soldeCredit: number
    }[] = []

    Object.keys(grandLivreData).sort().forEach((acc) => {
      const data = grandLivreData[acc]
      const diff = data.debit - data.credit
      list.push({
        account: acc,
        label: data.label,
        mvtDebit: data.debit,
        mvtCredit: data.credit,
        soldeDebit: diff > 0 ? diff : 0,
        soldeCredit: diff < 0 ? Math.abs(diff) : 0,
      })
    })

    return list
  }, [grandLivreData])

  const sumMvtDebit = trialBalance.reduce((s, b) => s + b.mvtDebit, 0)
  const sumMvtCredit = trialBalance.reduce((s, b) => s + b.mvtCredit, 0)
  const sumSoldeDebit = trialBalance.reduce((s, b) => s + b.soldeDebit, 0)
  const sumSoldeCredit = trialBalance.reduce((s, b) => s + b.soldeCredit, 0)

  // Calcul Bilan SMT & Compte de Résultat
  const financialStatements = useMemo(() => {
    let caVentes = 0
    let achatsMarchandises = 0
    let chargesExternes = 0
    let chargesPersonnel = 0
    let creancesClients = 0
    let tresorerieActif = 0
    let dettesFournisseurs = 0

    trialBalance.forEach((b) => {
      if (b.account.startsWith('701')) caVentes += b.mvtCredit
      if (b.account.startsWith('601')) achatsMarchandises += b.mvtDebit
      if (b.account.startsWith('605') || b.account.startsWith('613') || b.account.startsWith('618')) chargesExternes += b.mvtDebit
      if (b.account.startsWith('661') || b.account.startsWith('664')) chargesPersonnel += b.mvtDebit
      if (b.account.startsWith('411')) creancesClients += b.soldeDebit
      if (b.account.startsWith('571') || b.account.startsWith('521') || b.account.startsWith('572')) tresorerieActif += b.soldeDebit
      if (b.account.startsWith('401')) dettesFournisseurs += b.soldeCredit
    })

    const margeCommerciale = caVentes - achatsMarchandises
    const totalCharges = achatsMarchandises + chargesExternes + chargesPersonnel
    const resultatNet = caVentes - totalCharges

    return {
      caVentes,
      achatsMarchandises,
      margeCommerciale,
      chargesExternes,
      chargesPersonnel,
      totalCharges,
      resultatNet,
      creancesClients,
      tresorerieActif,
      dettesFournisseurs,
      totalActif: creancesClients + tresorerieActif,
      totalPassif: dettesFournisseurs + Math.max(0, resultatNet)
    }
  }, [trialBalance])

  // Validation d'une écriture manuelle
  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualForm.amount <= 0 || !manualForm.libelle) return

    const now = new Date().toISOString()
    const ref = manualForm.piece_ref || `OD-${Date.now().toString().slice(-4)}`

    const debitLabel = DEFAULT_PLAN_SYSCOHADA.find((p) => p.code === manualForm.debit_account)?.label || 'Compte débité'
    const creditLabel = DEFAULT_PLAN_SYSCOHADA.find((p) => p.code === manualForm.credit_account)?.label || 'Compte crédité'

    const dEntry: JournalEntry = {
      id: `manual-d-${Date.now()}`,
      entry_date: now,
      piece_ref: ref,
      journal_code: manualForm.journal_code,
      account_number: manualForm.debit_account,
      account_label: debitLabel,
      debit: manualForm.amount,
      credit: 0,
      libelle: manualForm.libelle
    }

    const cEntry: JournalEntry = {
      id: `manual-c-${Date.now()}`,
      entry_date: now,
      piece_ref: ref,
      journal_code: manualForm.journal_code,
      account_number: manualForm.credit_account,
      account_label: creditLabel,
      debit: 0,
      credit: manualForm.amount,
      libelle: manualForm.libelle
    }

    setEntries((prev) => [dEntry, cEntry, ...prev])
    setShowManualModal(false)
    setManualForm({
      piece_ref: '',
      libelle: '',
      debit_account: '571100',
      credit_account: '701100',
      amount: 0,
      journal_code: 'OD'
    })
    toast.success('Écriture comptable enregistrée', 'Partie double respectée.')
  }

  // Export FEC (Fichier des Écritures Comptables)
  const handleExportFEC = () => {
    const headers = [
      'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
      'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
      'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
      'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'
    ]

    const rows = entries.map((e, index) => {
      const dStr = e.entry_date.slice(0, 10).replace(/-/g, '')
      return [
        e.journal_code,
        e.journal_code === 'VTE' ? 'Journal des Ventes' : e.journal_code === 'ACH' ? 'Journal des Achats' : 'Journal de Caisse',
        String(index + 1).padStart(6, '0'),
        dStr,
        e.account_number,
        `"${e.account_label.replace(/"/g, '""')}"`,
        '',
        '',
        e.piece_ref,
        dStr,
        `"${e.libelle.replace(/"/g, '""')}"`,
        e.debit.toFixed(2),
        e.credit.toFixed(2),
        '',
        '',
        dStr,
        '',
        'XOF'
      ].join('\t')
    })

    const fecContent = [headers.join('\t'), ...rows].join('\r\n')
    const blob = new Blob([fecContent], { type: 'text/tab-separated-values;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `FEC_${company?.name?.replace(/\s+/g, '_') || 'ENTREPRISE'}_${new Date().getFullYear()}.txt`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Fichier FEC généré avec succès', 'Conforme DGI Bénin & UEMOA.')
  }

  return (
    <div className="space-y-6">
      {/* En-tête de la Page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Comptabilité SYSCOHADA Révisé</h1>
          <p className="text-slate-500 text-sm mt-1">Livre Journal, Grand Livre, Balance 6 colonnes et États Financiers Système Minimal de Trésorerie (SMT)</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['journal', 'grandlivre', 'balance', 'etats', 'plan'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab === 'journal' ? 'Livre Journal' : tab === 'grandlivre' ? 'Grand Livre' : tab === 'balance' ? 'Balance' : tab === 'etats' ? 'Bilan & Résultats' : 'Plan OHADA'}
            </button>
          ))}
        </div>
      </div>

      {/* Cartouche d'équilibre comptable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Total Mouvements Débit</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{fmt(totalDebit)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Total Mouvements Crédit</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{fmt(totalCredit)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Contrôle de Partie Double</span>
          <div className="flex items-center gap-2 mt-1">
            {isDoubleEntryBalanced ? (
              <span className="flex items-center gap-1.5 text-emerald-600 font-black text-sm bg-emerald-50 px-2.5 py-1 rounded-lg">
                <CheckCircle className="w-4 h-4" /> Parfaitement Équilibré (Écart 0 F)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-red-600 font-black text-sm bg-red-50 px-2.5 py-1 rounded-lg">
                <AlertCircle className="w-4 h-4" /> Écart de {fmt(Math.abs(totalDebit - totalCredit))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ONGLET 1: LIVRE JOURNAL */}
      {activeTab === 'journal' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une pièce, compte..."
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <select
                value={selectedAccountFilter}
                onChange={(e) => setSelectedAccountFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium"
              >
                <option value="all">Tous les comptes</option>
                <option value="57">Classe 5 - Trésorerie (571/521)</option>
                <option value="41">Classe 4 - Clients (411)</option>
                <option value="40">Classe 4 - Fournisseurs (401)</option>
                <option value="60">Classe 6 - Achats (601/605)</option>
                <option value="70">Classe 7 - Ventes (701)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowManualModal(true)}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Écriture Manuelle (OD)
              </button>

              <button
                onClick={handleExportFEC}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                title="Exporter le Fichier des Écritures Comptables pour expert-comptable"
              >
                <Download className="w-4 h-4" /> Export FEC
              </button>

              <button
                onClick={loadJournal}
                className="p-2 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-semibold">Aucune écriture comptable</p>
              <p className="text-slate-400 text-sm">Les opérations de caisse, ventes et achats génèrent automatiquement les écritures.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Jal</th>
                    <th className="px-4 py-3">Pièce</th>
                    <th className="px-4 py-3">Compte</th>
                    <th className="px-4 py-3">Intitulé</th>
                    <th className="px-4 py-3">Libellé</th>
                    <th className="px-4 py-3 text-right">Débit (FCFA)</th>
                    <th className="px-4 py-3 text-right">Crédit (FCFA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {new Date(e.entry_date).toLocaleDateString('fr-BJ')}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-400">{e.journal_code}</td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{e.piece_ref}</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700">{e.account_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{e.account_label}</td>
                      <td className="px-4 py-3 text-slate-600">{e.libelle}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {e.debit > 0 ? fmt(e.debit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {e.credit > 0 ? fmt(e.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ONGLET 2: GRAND LIVRE */}
      {activeTab === 'grandlivre' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Grand Livre Général des Comptes</h3>
              <p className="text-xs text-slate-500">Ventilation et solde chronologique par compte du plan comptable</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer Grand Livre
            </button>
          </div>

          <div className="space-y-4">
            {Object.keys(grandLivreData).sort().map((accNum) => {
              const item = grandLivreData[accNum]
              const solde = item.debit - item.credit
              return (
                <div key={accNum} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-black text-sm text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded">
                        {accNum}
                      </span>
                      <span className="font-bold text-slate-800 text-sm">{item.label}</span>
                    </div>
                    <div className="text-xs font-semibold">
                      Solde :{' '}
                      <span className={solde >= 0 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>
                        {solde >= 0 ? `Débiteur (${fmt(solde)})` : `Créditeur (${fmt(Math.abs(solde))})`}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-100/50 text-slate-500 font-bold">
                        <tr>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Pièce</th>
                          <th className="px-4 py-2">Libellé</th>
                          <th className="px-4 py-2 text-right">Débit</th>
                          <th className="px-4 py-2 text-right">Crédit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {item.entries.map((ent) => (
                          <tr key={ent.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2 text-slate-500">{new Date(ent.entry_date).toLocaleDateString('fr-BJ')}</td>
                            <td className="px-4 py-2 font-mono text-slate-700">{ent.piece_ref}</td>
                            <td className="px-4 py-2 text-slate-600">{ent.libelle}</td>
                            <td className="px-4 py-2 text-right font-medium text-slate-800">{ent.debit > 0 ? fmt(ent.debit) : '-'}</td>
                            <td className="px-4 py-2 text-right font-medium text-slate-800">{ent.credit > 0 ? fmt(ent.credit) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-right">Cumuls du Compte :</td>
                          <td className="px-4 py-2 text-right text-emerald-700">{fmt(item.debit)}</td>
                          <td className="px-4 py-2 text-right text-emerald-700">{fmt(item.credit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ONGLET 3: BALANCE DES COMPTES (6 COLONNES) */}
      {activeTab === 'balance' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Balance Générale des Comptes (OHADA à 6 Colonnes)</h3>
              <p className="text-xs text-slate-500">Mouvements de la période et soldes de clôture</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer Balance
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                <tr>
                  <th rowSpan={2} className="px-4 py-3 border-r border-slate-200">N° Compte</th>
                  <th rowSpan={2} className="px-4 py-3 border-r border-slate-200">Intitulé du Compte</th>
                  <th colSpan={2} className="px-4 py-2 text-center border-b border-r border-slate-200">Total Mouvements</th>
                  <th colSpan={2} className="px-4 py-2 text-center">Soldes de Fin de Période</th>
                </tr>
                <tr>
                  <th className="px-4 py-1.5 text-right border-r border-slate-200 bg-slate-100/50">Débit</th>
                  <th className="px-4 py-1.5 text-right border-r border-slate-200 bg-slate-100/50">Crédit</th>
                  <th className="px-4 py-1.5 text-right border-r border-slate-200 bg-slate-100/50">Débiteur</th>
                  <th className="px-4 py-1.5 text-right bg-slate-100/50">Créditeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialBalance.map((row) => (
                  <tr key={row.account} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-800 border-r border-slate-100">{row.account}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 border-r border-slate-100">{row.label}</td>
                    <td className="px-4 py-2.5 text-right border-r border-slate-100">{row.mvtDebit > 0 ? fmt(row.mvtDebit) : '-'}</td>
                    <td className="px-4 py-2.5 text-right border-r border-slate-100">{row.mvtCredit > 0 ? fmt(row.mvtCredit) : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 border-r border-slate-100">{row.soldeDebit > 0 ? fmt(row.soldeDebit) : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{row.soldeCredit > 0 ? fmt(row.soldeCredit) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right uppercase text-xs">Totaux Généraux :</td>
                  <td className="px-4 py-3 text-right text-emerald-800 border-r border-slate-200">{fmt(sumMvtDebit)}</td>
                  <td className="px-4 py-3 text-right text-emerald-800 border-r border-slate-200">{fmt(sumMvtCredit)}</td>
                  <td className="px-4 py-3 text-right text-emerald-800 border-r border-slate-200">{fmt(sumSoldeDebit)}</td>
                  <td className="px-4 py-3 text-right text-emerald-800">{fmt(sumSoldeCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ONGLET 4: ÉTATS FINANCIERS SMT (BILAN & RÉSULTAT) */}
      {activeTab === 'etats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Compte de Résultat SMT */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-bold text-slate-800 text-base mb-1">Compte de Résultat Simplifié (SMT)</h3>
              <p className="text-xs text-slate-400 mb-4">Formation du résultat d'exploitation OHADA</p>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
                  <span className="font-bold text-slate-700">Chiffre d'Affaires Ventes (701)</span>
                  <span className="font-black text-emerald-700">{fmt(financialStatements.caVentes)}</span>
                </div>

                <div className="flex justify-between items-center p-2.5 text-slate-600">
                  <span>- Achats de Marchandises (601)</span>
                  <span className="font-semibold text-red-600">- {fmt(financialStatements.achatsMarchandises)}</span>
                </div>

                <div className="flex justify-between items-center p-2.5 bg-emerald-50 text-emerald-800 font-bold rounded-lg border border-emerald-100">
                  <span>= MARGE COMMERCIALE BRUTE</span>
                  <span>{fmt(financialStatements.margeCommerciale)}</span>
                </div>

                <div className="flex justify-between items-center p-2.5 text-slate-600">
                  <span>- Charges Externes / Fournitures / Loyers (605/613)</span>
                  <span className="font-semibold text-red-600">- {fmt(financialStatements.chargesExternes)}</span>
                </div>

                <div className="flex justify-between items-center p-2.5 text-slate-600">
                  <span>- Charges de Personnel & Salaires (661/664)</span>
                  <span className="font-semibold text-red-600">- {fmt(financialStatements.chargesPersonnel)}</span>
                </div>

                <div className={`flex justify-between items-center p-3 rounded-xl border ${
                  financialStatements.resultatNet >= 0
                    ? 'bg-emerald-100/50 border-emerald-300 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}>
                  <div>
                    <span className="text-xs uppercase font-black">RÉSULTAT NET D'EXPLOITATION</span>
                    <p className="text-[10px] text-slate-500">{financialStatements.resultatNet >= 0 ? 'Bénéfice net' : 'Déficit d\'exploitation'}</p>
                  </div>
                  <span className="text-lg font-black">{fmt(financialStatements.resultatNet)}</span>
                </div>
              </div>
            </div>

            {/* Bilan Patrimonial SMT */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-bold text-slate-800 text-base mb-1">Bilan Patrimonial Simplifié</h3>
              <p className="text-xs text-slate-400 mb-4">Actif & Passif circulant conforme UEMOA</p>

              <div className="space-y-4 text-xs">
                {/* Actif */}
                <div>
                  <h4 className="font-black text-slate-700 uppercase tracking-wider mb-2 text-[11px] pb-1 border-b">Actif Circulant & Trésorerie</h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Créances Clients (Compte 411) :</span>
                      <span className="font-semibold">{fmt(financialStatements.creancesClients)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Disponibilités Trésorerie (Comptes 571/521/572) :</span>
                      <span className="font-semibold text-emerald-700">{fmt(financialStatements.tresorerieActif)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 pt-1 border-t">
                      <span>Total Actif :</span>
                      <span>{fmt(financialStatements.totalActif)}</span>
                    </div>
                  </div>
                </div>

                {/* Passif */}
                <div>
                  <h4 className="font-black text-slate-700 uppercase tracking-wider mb-2 text-[11px] pb-1 border-b">Passif & Capitaux Propres</h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Dettes Fournisseurs d'Exploitation (Compte 401) :</span>
                      <span className="font-semibold">{fmt(financialStatements.dettesFournisseurs)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Résultat Net de la Période (Compte 131) :</span>
                      <span className="font-semibold text-emerald-700">{fmt(financialStatements.resultatNet)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 pt-1 border-t">
                      <span>Total Passif :</span>
                      <span>{fmt(financialStatements.totalPassif)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 5: PLAN COMPTABLE OHADA */}
      {activeTab === 'plan' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-4">Plan Comptable Général OHADA Révisé</h3>
          <div className="divide-y divide-slate-100">
            {DEFAULT_PLAN_SYSCOHADA.map((acc) => (
              <div key={acc.code} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                    {acc.code}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{acc.label}</span>
                </div>
                <span className="text-xs text-slate-400 font-semibold uppercase">Classe {acc.classId}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL NOUVELLE ÉCRITURE MANUELLE (OD) */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Écriture Comptable Manuelle</h3>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <form onSubmit={handleAddManualEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Libellé de l'opération *</label>
                <input
                  type="text"
                  required
                  value={manualForm.libelle}
                  onChange={(e) => setManualForm({ ...manualForm, libelle: e.target.value })}
                  placeholder="Ex: Apport initial, Frais bancaires..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">N° de Pièce / Réf</label>
                <input
                  type="text"
                  value={manualForm.piece_ref}
                  onChange={(e) => setManualForm({ ...manualForm, piece_ref: e.target.value })}
                  placeholder="Ex: OD-2026-001"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={manualForm.amount || ''}
                  onChange={(e) => setManualForm({ ...manualForm, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Compte Débité (Emploi)</label>
                  <select
                    value={manualForm.debit_account}
                    onChange={(e) => setManualForm({ ...manualForm, debit_account: e.target.value })}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                  >
                    {DEFAULT_PLAN_SYSCOHADA.map((acc) => (
                      <option key={acc.code} value={acc.code}>{acc.code} - {acc.label.slice(0, 18)}...</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Compte Crédité (Ressource)</label>
                  <select
                    value={manualForm.credit_account}
                    onChange={(e) => setManualForm({ ...manualForm, credit_account: e.target.value })}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                  >
                    {DEFAULT_PLAN_SYSCOHADA.map((acc) => (
                      <option key={acc.code} value={acc.code}>{acc.code} - {acc.label.slice(0, 18)}...</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700"
                >
                  Valider l'Écriture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SyscohadaPage
