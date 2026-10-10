// =============================================================================
// GESTIO 229 SaaS — Comptabilité SYSCOHADA Révisé 2018 (Bénin & Espace OHADA)
// Conforme Acte Uniforme OHADA portant organisation et harmonisation des comptabilités
// Journaux : JV, JA, JC, JB, JOD, JS, JR — Séparation stricte : Engagement ≠ Règlement
// Grand Livre progressif, Balance 6 colonnes, Lettrage Tiers, État fiscal AIB 449200, FEC
// Isolation stricte par (company_id + sector_slug) — Source de vérité : Supabase
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen, RefreshCw, FileText, Download, CheckCircle, Search,
  Plus, AlertCircle, Printer, PieChart, Layers, ArrowRight, ShieldCheck,
  Building2, Calendar, FileSpreadsheet, Target, TrendingUp, TrendingDown,
  Percent, Edit2, Trash2, X, Check, Eye, Scale, HelpCircle, FileCheck,
  ChevronRight, ArrowUpDown, Filter, Lock
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { getActiveSectorSlug } from '../../../lib/sectorClient'
import { logAuditEvent } from '../../../services/auditService'
import ModalPortal from '../../../components/modals/ModalPortal'
import {
  JournalCode,
  AccountingEntry,
  AccountingEntryLine,
  SYSCOHADA_PLAN_2018,
  JOURNAUX_CATALOG,
  getAccountLabel,
  fetchAccountingEntries,
  createAccountingEntry,
  syncOperationalDataToAccounting,
  buildGrandLivreForAccount,
  buildTrialBalance,
  buildAibReport,
  generateFECFile,
  AibReportRow
} from '../../../services/accountingService'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

export interface Budget {
  id: string
  company_id: string
  name: string
  period: string
  description?: string
  is_active: boolean
  created_at?: string
}

export interface BudgetLine {
  id: string
  company_id: string
  budget_id: string
  code_poste: string
  libelle_poste: string
  type_poste: 'DEPENSE' | 'RECETTE'
  montant_prevu: number
  montant_realise: number
  created_at?: string
}

export const SyscohadaPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId, sectorSlug } = useTenant()

  const activeSector = (sectorSlug || getActiveSectorSlug() || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const compId = company?.id || companyId || ''

  // Navigation onglets
  const [activeTab, setActiveTab] = useState<
    'journal' | 'grandlivre' | 'balance' | 'lettrage' | 'aib' | 'etats' | 'plan' | 'budget'
  >('journal')

  // Filtre Journal
  const [selectedJournal, setSelectedJournal] = useState<JournalCode | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Données réelles Supabase
  const [entries, setEntries] = useState<AccountingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  // Détail d'une écriture
  const [viewingEntry, setViewingEntry] = useState<AccountingEntry | null>(null)

  // Grand Livre
  const [selectedGlAccount, setSelectedGlAccount] = useState<string>('411100')
  const [glSearch, setGlSearch] = useState('')

  // Lettrage Tiers
  const [lettrageAccount, setLettrageAccount] = useState<'411100' | '401100'>('411100')
  const [selectedLinesToLetter, setSelectedLinesToLetter] = useState<string[]>([])
  const [lettreCodeInput, setLettreCodeInput] = useState('AA')

  // ─── GESTION BUDGÉTAIRE SYSCOHADA (CONSERVÉE ET FIABILISÉE) ───────────────
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('')
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([])
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [showNewBudgetModal, setShowNewBudgetModal] = useState(false)
  const [showLineModal, setShowLineModal] = useState(false)
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null)

  const [newBudgetForm, setNewBudgetForm] = useState({
    name: `Budget Prévisionnel ${new Date().getFullYear()}`,
    period: String(new Date().getFullYear()),
    description: 'Budget d\'exploitation annuel'
  })

  const [lineForm, setLineForm] = useState<{
    code_poste: string
    libelle_poste: string
    type_poste: 'DEPENSE' | 'RECETTE'
    montant_prevu: number
    montant_realise: number
  }>({
    code_poste: '601100',
    libelle_poste: 'Achats de marchandises',
    type_poste: 'DEPENSE',
    montant_prevu: 0,
    montant_realise: 0
  })

  // ─── MODALE NOUVELLE ÉCRITURE MANUELLE MULTI-LIGNES (OD) ───────────────────
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualHeader, setManualHeader] = useState({
    journal_code: 'JOD' as JournalCode,
    entry_date: new Date().toISOString().slice(0, 10),
    reference: '',
    description: ''
  })
  const [manualLines, setManualLines] = useState<
    { account_number: string; account_label: string; description: string; debit: number; credit: number }[]
  >([
    { account_number: '605100', account_label: 'Fournitures de bureau', description: '', debit: 0, credit: 0 },
    { account_number: '571100', account_label: 'Caisse centrale espèces', description: '', debit: 0, credit: 0 }
  ])

  // ─── 1. CHARGEMENT DU LIVRE JOURNAL RÉEL ────────────────────────────────────
  const loadEntries = useCallback(async () => {
    if (!compId) return
    setLoading(true)
    try {
      const data = await fetchAccountingEntries(compId, activeSector, {
        journal: selectedJournal,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined,
        account: selectedAccountFilter !== 'all' ? selectedAccountFilter : undefined
      })
      setEntries(data)
    } catch (err: any) {
      toast.error('Erreur chargement écritures', err.message)
    } finally {
      setLoading(false)
    }
  }, [compId, activeSector, selectedJournal, startDate, endDate, search, selectedAccountFilter, toast])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Synchronisation des flux opérationnels vers les journaux
  const handleSyncOperational = async () => {
    if (!compId) return
    setIsSyncing(true)
    try {
      const res = await syncOperationalDataToAccounting(compId, activeSector, user?.id)
      if (res.added > 0) {
        toast.success(
          'Synchronisation comptable réussie',
          `${res.added} nouvelle(s) écriture(s) générée(s) (Engagement et Règlement séparés).`
        )
      } else {
        toast.info('À jour', 'Toutes les opérations validées sont déjà comptabilisées (zéro doublon).')
      }
      await loadEntries()
    } catch (err: any) {
      toast.error('Erreur synchronisation', err.message)
    } finally {
      setIsSyncing(false)
    }
  }

  // ─── GESTION BUDGET (CONSERVÉE) ─────────────────────────────────────────────
  const loadBudgets = useCallback(async () => {
    if (!compId) return
    setBudgetLoading(true)
    try {
      const { data } = await supabase
        .from('budgets')
        .select('*')
        .eq('company_id', compId)
        .order('created_at', { ascending: false })

      let loadedBudgets: Budget[] = data || []
      if (loadedBudgets.length === 0) {
        loadedBudgets = [{
          id: `budget-default-${compId.slice(0, 6)}`,
          company_id: compId,
          name: `Budget Prévisionnel ${new Date().getFullYear()}`,
          period: String(new Date().getFullYear()),
          description: 'Budget initial d\'exploitation',
          is_active: true
        }]
      }
      setBudgets(loadedBudgets)
      if (!selectedBudgetId && loadedBudgets.length > 0) {
        setSelectedBudgetId(loadedBudgets[0].id)
      }
    } catch (err) {
      console.warn('Erreur budgets', err)
    } finally {
      setBudgetLoading(false)
    }
  }, [compId, selectedBudgetId])

  const loadBudgetLines = useCallback(async (bId: string) => {
    if (!compId || !bId) return
    setBudgetLoading(true)
    try {
      const { data } = await supabase
        .from('budget_lines')
        .select('*')
        .eq('company_id', compId)
        .eq('budget_id', bId)
        .order('code_poste')

      let lines: BudgetLine[] = data || []
      if (lines.length === 0) {
        lines = [
          { id: 'bl-1', company_id: compId, budget_id: bId, code_poste: '701100', libelle_poste: 'Ventes de marchandises', type_poste: 'RECETTE', montant_prevu: 50000000, montant_realise: 0 },
          { id: 'bl-2', company_id: compId, budget_id: bId, code_poste: '601100', libelle_poste: 'Achats de marchandises', type_poste: 'DEPENSE', montant_prevu: 35000000, montant_realise: 0 },
          { id: 'bl-3', company_id: compId, budget_id: bId, code_poste: '613100', libelle_poste: 'Loyers commerciaux', type_poste: 'DEPENSE', montant_prevu: 3600000, montant_realise: 0 },
          { id: 'bl-4', company_id: compId, budget_id: bId, code_poste: '641100', libelle_poste: 'Rémunérations du personnel', type_poste: 'DEPENSE', montant_prevu: 6000000, montant_realise: 0 },
        ]
      }
      setBudgetLines(lines)
    } catch (err) {
      console.warn('Erreur lignes budget', err)
    } finally {
      setBudgetLoading(false)
    }
  }, [compId])

  useEffect(() => {
    if (activeTab === 'budget') loadBudgets()
  }, [activeTab, loadBudgets])

  useEffect(() => {
    if (selectedBudgetId) loadBudgetLines(selectedBudgetId)
  }, [selectedBudgetId, loadBudgetLines])

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBudgetForm.name.trim() || !compId) return
    const newB: Budget = {
      id: `bg-${Date.now()}`,
      company_id: compId,
      name: newBudgetForm.name.trim(),
      period: newBudgetForm.period.trim() || String(new Date().getFullYear()),
      description: newBudgetForm.description.trim(),
      is_active: true
    }
    try {
      await supabase.from('budgets').insert(newB)
    } catch (_) {}
    setBudgets([newB, ...budgets])
    setSelectedBudgetId(newB.id)
    setShowNewBudgetModal(false)
    toast.success('Budget créé', `Le budget "${newB.name}" est prêt.`)
  }

  const handleDeleteBudget = async (bId: string) => {
    if (!confirm('Archiver ce budget ?')) return
    try {
      await supabase.from('budgets').update({ is_active: false }).eq('id', bId)
    } catch (_) {}
    const remaining = budgets.filter((b) => b.id !== bId)
    setBudgets(remaining)
    if (selectedBudgetId === bId) setSelectedBudgetId(remaining.length > 0 ? remaining[0].id : '')
    toast.success('Budget archivé', 'Le budget a été retiré.')
  }

  const handleOpenLineModal = (line?: BudgetLine) => {
    if (line) {
      setEditingLine(line)
      setLineForm({
        code_poste: line.code_poste,
        libelle_poste: line.libelle_poste,
        type_poste: line.type_poste,
        montant_prevu: line.montant_prevu,
        montant_realise: line.montant_realise
      })
    } else {
      setEditingLine(null)
      setLineForm({
        code_poste: '601100',
        libelle_poste: 'Achats de marchandises',
        type_poste: 'DEPENSE',
        montant_prevu: 0,
        montant_realise: 0
      })
    }
    setShowLineModal(true)
  }

  const handleSaveBudgetLine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBudgetId || !compId) return

    if (editingLine) {
      const updated = {
        ...editingLine,
        code_poste: lineForm.code_poste,
        libelle_poste: lineForm.libelle_poste,
        type_poste: lineForm.type_poste,
        montant_prevu: Number(lineForm.montant_prevu) || 0,
        montant_realise: Number(lineForm.montant_realise) || 0
      }
      try {
        await supabase.from('budget_lines').update(updated).eq('id', editingLine.id)
      } catch (_) {}
      setBudgetLines((prev) => prev.map((l) => (l.id === editingLine.id ? updated : l)))
      toast.success('Ligne modifiée', updated.libelle_poste)
    } else {
      const newLine: BudgetLine = {
        id: `bl-${Date.now()}`,
        company_id: compId,
        budget_id: selectedBudgetId,
        code_poste: lineForm.code_poste,
        libelle_poste: lineForm.libelle_poste,
        type_poste: lineForm.type_poste,
        montant_prevu: Number(lineForm.montant_prevu) || 0,
        montant_realise: Number(lineForm.montant_realise) || 0
      }
      try {
        await supabase.from('budget_lines').insert(newLine)
      } catch (_) {}
      setBudgetLines((prev) => [...prev, newLine])
      toast.success('Ligne ajoutée', newLine.libelle_poste)
    }
    setShowLineModal(false)
  }

  const handleDeleteBudgetLine = async (lineId: string) => {
    if (!confirm('Supprimer cette ligne ?')) return
    try {
      await supabase.from('budget_lines').delete().eq('id', lineId)
    } catch (_) {}
    setBudgetLines((prev) => prev.filter((l) => l.id !== lineId))
    toast.success('Ligne supprimée')
  }

  // ─── SAISIE D'ÉCRITURE MANUELLE (OD) ────────────────────────────────────────
  const handleAddManualLine = () => {
    setManualLines([
      ...manualLines,
      { account_number: '471000', account_label: 'Compte d\'attente', description: '', debit: 0, credit: 0 }
    ])
  }

  const handleRemoveManualLine = (idx: number) => {
    if (manualLines.length <= 2) {
      alert('Une écriture comptable doit obligatoirement comporter au moins 2 lignes.')
      return
    }
    setManualLines(manualLines.filter((_, i) => i !== idx))
  }

  const handleManualLineChange = (idx: number, field: string, val: any) => {
    setManualLines((prev) => {
      const next = [...prev]
      const current = { ...next[idx], [field]: val }
      if (field === 'account_number') {
        current.account_label = getAccountLabel(val)
      }
      next[idx] = current
      return next
    })
  }

  const manualTotalDebit = manualLines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const manualTotalCredit = manualLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const isManualBalanced = Math.abs(manualTotalDebit - manualTotalCredit) < 0.05 && manualTotalDebit > 0

  const handleSaveManualEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualHeader.description.trim()) {
      alert('Veuillez renseigner le libellé de l\'écriture.')
      return
    }
    if (!isManualBalanced) {
      alert(
        `Écriture déséquilibrée : le total débit (${manualTotalDebit} FCFA) doit être strictement égal au total crédit (${manualTotalCredit} FCFA).`
      )
      return
    }

    const res = await createAccountingEntry(
      {
        company_id: compId,
        sector_slug: activeSector,
        journal_code: manualHeader.journal_code,
        entry_date: manualHeader.entry_date,
        reference: manualHeader.reference || 'OD',
        description: manualHeader.description.trim(),
        created_by: user?.id,
        source_module: 'manuel'
      },
      manualLines.map((l, i) => ({
        line_number: i + 1,
        account_number: l.account_number,
        account_label: l.account_label,
        description: l.description || manualHeader.description,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0
      }))
    )

    if (res.success) {
      toast.success('Écriture validée', 'Partie double enregistrée dans Supabase.')
      setShowManualModal(false)
      setManualLines([
        { account_number: '605100', account_label: 'Fournitures de bureau', description: '', debit: 0, credit: 0 },
        { account_number: '571100', account_label: 'Caisse centrale espèces', description: '', debit: 0, credit: 0 }
      ])
      await loadEntries()
    } else {
      alert(res.error || 'Erreur lors de l\'enregistrement')
    }
  }

  // ─── CALCULS DU GRAND LIVRE & BALANCE ───────────────────────────────────────
  const grandLivreResult = useMemo(() => {
    return buildGrandLivreForAccount(selectedGlAccount, entries)
  }, [selectedGlAccount, entries])

  const trialBalanceRows = useMemo(() => {
    return buildTrialBalance(entries)
  }, [entries])

  const aibReport = useMemo(() => {
    return buildAibReport(entries)
  }, [entries])

  // KPIs Comptables
  const totalDebitGeneral = entries.reduce((s, e) => s + e.total_debit, 0)
  const totalCreditGeneral = entries.reduce((s, e) => s + e.total_credit, 0)
  const isGlobalBalanced = Math.abs(totalDebitGeneral - totalCreditGeneral) < 0.05

  const totalVentesHt = entries
    .filter((e) => e.journal_code === 'JV')
    .reduce((sum, e) => {
      const line701 = e.lines.filter((l) => l.account_number.startsWith('701')).reduce((s, l) => s + l.credit, 0)
      return sum + line701
    }, 0)

  const totalAchatsHt = entries
    .filter((e) => e.journal_code === 'JA')
    .reduce((sum, e) => {
      const line601 = e.lines.filter((l) => l.account_number.startsWith('601')).reduce((s, l) => s + l.debit, 0)
      return sum + line601
    }, 0)

  const totalTvaFacturee = entries.reduce((sum, e) => {
    return sum + e.lines.filter((l) => l.account_number === '443100').reduce((s, l) => s + l.credit, 0)
  }, 0)

  const totalTvaRecuperable = entries.reduce((sum, e) => {
    return sum + e.lines.filter((l) => l.account_number === '445100').reduce((s, l) => s + l.debit, 0)
  }, 0)

  // ─── EXPORT FEC ─────────────────────────────────────────────────────────────
  const handleExportFEC = () => {
    const fecContent = generateFECFile(entries)
    const blob = new Blob([fecContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `FEC_${company?.name || 'ENTREPRISE'}_${activeSector.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Fichier FEC exporté', 'Prêt pour l\'expert-comptable ou l\'administration fiscale.')
  }

  // ─── EXPORT PDF LIVRE JOURNAL ───────────────────────────────────────────────
  const handlePrintJournalPDF = () => {
    const doc = new jsPDF('landscape')
    doc.setFontSize(16)
    doc.text(`LIVRE JOURNAL SYSCOHADA RÉVISÉ - ${company?.name || 'GESTIO 229'}`, 14, 15)
    doc.setFontSize(10)
    doc.text(`Secteur : ${activeSector.toUpperCase()} | Période : ${startDate || 'Début'} au ${endDate || 'Fin'} | Date : ${new Date().toLocaleDateString('fr-BJ')}`, 14, 22)

    const tableRows: any[] = []
    entries.forEach((e) => {
      e.lines.forEach((l, idx) => {
        tableRows.push([
          idx === 0 ? e.entry_date : '',
          idx === 0 ? e.journal_code : '',
          idx === 0 ? e.entry_number : '',
          l.account_number,
          l.account_label,
          l.description || e.description,
          l.debit > 0 ? fmt(l.debit) : '',
          l.credit > 0 ? fmt(l.credit) : ''
        ])
      })
    })

    autoTable(doc, {
      startY: 28,
      head: [['Date', 'Journal', 'N° Pièce', 'Compte', 'Intitulé', 'Libellé', 'Débit', 'Crédit']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] }
    })

    doc.save(`Livre_Journal_${activeSector}_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast.success('PDF généré', 'Téléchargement terminé.')
  }

  // ─── LETTRAGE CLIENTS / FOURNISSEURS ────────────────────────────────────────
  const linesToLetter = useMemo(() => {
    const res: { entry: AccountingEntry; line: AccountingEntryLine }[] = []
    entries.forEach((e) => {
      e.lines.forEach((l) => {
        if (l.account_number === lettrageAccount && !l.lettering) {
          res.push({ entry: e, line: l })
        }
      })
    })
    return res
  }, [entries, lettrageAccount])

  const handleApplyLettering = async () => {
    if (selectedLinesToLetter.length < 2) {
      alert('Sélectionnez au moins 2 écritures (une facture et son règlement) pour effectuer le lettrage.')
      return
    }
    const code = lettreCodeInput.trim().toUpperCase()
    if (!code) return

    try {
      await supabase
        .from('accounting_entry_lines')
        .update({ lettering: code })
        .in('id', selectedLinesToLetter)

      toast.success('Lettrage appliqué', `Code ${code} enregistré.`)
      setSelectedLinesToLetter([])
      await loadEntries()
    } catch (err: any) {
      toast.error('Erreur lettrage', err.message)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── EN-TÊTE PRINCIPAL ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-3xl shadow-lg border border-slate-700">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              SYSCOHADA RÉVISÉ 2018
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
              Secteur : {activeSector.toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Comptabilité Professionnelle & Livre Journal</h1>
          <p className="text-xs text-slate-400 mt-1">
            Partie double stricte, distinction Engagement ≠ Règlement, plan OHADA et déclarations fiscales Bénin.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncOperational}
            disabled={isSyncing}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md disabled:opacity-50"
            title="Génère automatiquement les écritures d'engagement (factures) et de règlement (trésorerie) sans doublon"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synchronisation...' : 'Synchroniser les Flux'}
          </button>

          <button
            onClick={() => setShowManualModal(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-600"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            Saisie d'OD
          </button>

          <button
            onClick={handleExportFEC}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-700"
            title="Exporter le Fichier des Écritures Comptables conforme"
          >
            <Download className="w-4 h-4" />
            FEC
          </button>
        </div>
      </div>

      {/* ─── BANDEAU DES KPIS COMPTABLES ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Débit</p>
          <p className="text-base font-black text-slate-800 mt-0.5">{fmt(totalDebitGeneral)}</p>
          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
            <CheckCircle className="w-3 h-3" /> Partie double
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Crédit</p>
          <p className="text-base font-black text-slate-800 mt-0.5">{fmt(totalCreditGeneral)}</p>
          <span className={`text-[10px] font-bold mt-1 ${isGlobalBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isGlobalBalanced ? 'Équilibré (Δ = 0)' : 'Déséquilibre !'}
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ventes HT (701)</p>
          <p className="text-base font-black text-indigo-700 mt-0.5">{fmt(totalVentesHt)}</p>
          <span className="text-[10px] text-slate-500 font-medium">Journal des Ventes (JV)</span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Achats HT (601)</p>
          <p className="text-base font-black text-amber-700 mt-0.5">{fmt(totalAchatsHt)}</p>
          <span className="text-[10px] text-slate-500 font-medium">Journal des Achats (JA)</span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">TVA Facturée (443)</p>
          <p className="text-base font-black text-slate-800 mt-0.5">{fmt(totalTvaFacturee)}</p>
          <span className="text-[10px] text-emerald-700 font-medium">TVA 18% collectée</span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AIB Collecté (4492)</p>
          <p className="text-base font-black text-purple-700 mt-0.5">{fmt(aibReport.totalAibCollecte)}</p>
          <span className="text-[10px] text-purple-700 font-medium">Retenues à la source</span>
        </div>
      </div>

      {/* ─── BARRE D'ONGLETS COMPTABLES ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl overflow-x-auto text-xs font-bold">
        {[
          { id: 'journal', label: 'Livre Journal', icon: BookOpen },
          { id: 'grandlivre', label: 'Grand Livre', icon: Layers },
          { id: 'balance', label: 'Balance 6 Colonnes', icon: Scale },
          { id: 'lettrage', label: 'Lettrage Tiers', icon: FileCheck },
          { id: 'aib', label: 'État Fiscal AIB (449200)', icon: Percent },
          { id: 'etats', label: 'États SMT (Bilan/Résultat)', icon: PieChart },
          { id: 'plan', label: 'Plan SYSCOHADA 2018', icon: HelpCircle },
          { id: 'budget', label: 'Budgets Prévisionnels', icon: Target },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─── ONGLET 1 : LIVRE JOURNAL MULTI-JOURNAUX ──────────────────────── */}
      {activeTab === 'journal' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          {/* Filtres par Journal (JV, JA, JC, JB, JOD, JS, JR) */}
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Journaux boutons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <button
                onClick={() => setSelectedJournal('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedJournal === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tous Journaux
              </button>
              {JOURNAUX_CATALOG.map((j) => (
                <button
                  key={j.code}
                  onClick={() => setSelectedJournal(j.code)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                    selectedJournal === j.code
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title={j.name}
                >
                  <span className="font-mono">{j.code}</span>
                  <span className="hidden sm:inline text-[11px] opacity-80">({j.name.replace('Journal des ', '').replace('Journal de ', '')})</span>
                </button>
              ))}
            </div>

            {/* Outils et export */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher pièce, libellé..."
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <button
                onClick={handlePrintJournalPDF}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>

          {/* Table du Journal */}
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              Chargement des écritures comptables...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-700">Aucune écriture enregistrée pour ce filtre</p>
              <p className="text-xs text-slate-400 mt-1">
                Cliquez sur « Synchroniser les Flux » pour comptabiliser automatiquement les ventes, achats et règlements.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-3 py-3">Jal</th>
                    <th className="px-3 py-3">N° Pièce</th>
                    <th className="px-3 py-3">Réf / Doc</th>
                    <th className="px-3 py-3">N° Compte</th>
                    <th className="px-4 py-3">Intitulé Compte</th>
                    <th className="px-4 py-3">Libellé de l'Écriture</th>
                    <th className="px-4 py-3 text-right">Débit</th>
                    <th className="px-4 py-3 text-right">Crédit</th>
                    <th className="px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {entries.map((entry) => (
                    <React.Fragment key={entry.id}>
                      {entry.lines.map((line, lIdx) => (
                        <tr
                          key={line.id || `${entry.id}-${lIdx}`}
                          className={`hover:bg-slate-50/70 transition font-sans ${
                            lIdx === 0 ? 'border-t-2 border-slate-200/60' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">
                            {lIdx === 0 ? new Date(entry.entry_date).toLocaleDateString('fr-BJ') : ''}
                          </td>
                          <td className="px-3 py-2.5">
                            {lIdx === 0 && (
                              <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                {entry.journal_code}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-900 text-xs">
                            {lIdx === 0 ? entry.entry_number : ''}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs font-mono">
                            {lIdx === 0 ? (entry.reference || '-') : ''}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-black text-emerald-800 text-xs">
                            {line.account_number}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 text-xs">
                            {line.account_label}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 text-xs max-w-xs truncate" title={line.description || entry.description}>
                            {line.description || entry.description}
                            {line.third_party_name && (
                              <span className="ml-1 text-[10px] text-slate-400 font-bold">({line.third_party_name})</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                            {line.debit > 0 ? fmt(line.debit) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                            {line.credit > 0 ? fmt(line.credit) : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {lIdx === 0 && (
                              <button
                                onClick={() => setViewingEntry(entry)}
                                className="p-1 hover:bg-slate-100 text-slate-500 rounded transition"
                                title="Voir la pièce complète"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── ONGLET 2 : GRAND LIVRE DES COMPTES ───────────────────────────── */}
      {activeTab === 'grandlivre' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900">Grand Livre Général Chronologique</h3>
              <p className="text-xs text-slate-500">Mouvements de débit, crédit et solde progressif cumulé</p>
            </div>

            {/* Sélecteur de compte */}
            <div className="flex items-center gap-2">
              <select
                value={selectedGlAccount}
                onChange={(e) => setSelectedGlAccount(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-slate-50"
              >
                {SYSCOHADA_PLAN_2018.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} — {acc.label.slice(0, 30)}
                  </option>
                ))}
              </select>

              <button
                onClick={() => window.print()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
            </div>
          </div>

          {/* Fiche du compte sélectionné */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-mono text-sm font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded">
                {grandLivreResult.accountNumber}
              </span>
              <h4 className="text-base font-black text-slate-900 mt-1">{grandLivreResult.accountLabel}</h4>
            </div>

            <div className="flex items-center gap-6 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px]">Total Débit</p>
                <p className="text-sm font-black text-slate-900">{fmt(grandLivreResult.totalDebit)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px]">Total Crédit</p>
                <p className="text-sm font-black text-slate-900">{fmt(grandLivreResult.totalCredit)}</p>
              </div>
              <div className="pl-4 border-l border-slate-200">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Solde Final</p>
                <p className={`text-base font-black ${grandLivreResult.soldeFinal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {grandLivreResult.soldeFinal >= 0
                    ? `Débiteur (${fmt(grandLivreResult.soldeFinal)})`
                    : `Créditeur (${fmt(Math.abs(grandLivreResult.soldeFinal))})`}
                </p>
              </div>
            </div>
          </div>

          {/* Tableau chronologique */}
          {grandLivreResult.entries.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-xs font-medium">Aucun mouvement sur ce compte.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700 font-mono">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] font-sans">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Jal</th>
                    <th className="px-3 py-2.5">N° Écriture</th>
                    <th className="px-4 py-2.5">Libellé</th>
                    <th className="px-4 py-2.5 text-right">Débit</th>
                    <th className="px-4 py-2.5 text-right">Crédit</th>
                    <th className="px-4 py-2.5 text-right">Solde Progressif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grandLivreResult.entries.map((gl) => (
                    <tr key={gl.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{gl.date}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-600">{gl.journal}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{gl.entry_number}</td>
                      <td className="px-4 py-2.5 font-sans text-slate-800">{gl.libelle}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900">{gl.debit > 0 ? fmt(gl.debit) : '-'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900">{gl.credit > 0 ? fmt(gl.credit) : '-'}</td>
                      <td className={`px-4 py-2.5 text-right font-black ${gl.solde_progressif >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {fmt(gl.solde_progressif)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── ONGLET 3 : BALANCE GÉNÉRALE 6 COLONNES ───────────────────────── */}
      {activeTab === 'balance' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900">Balance Générale des Comptes (SYSCOHADA 6 Colonnes)</h3>
              <p className="text-xs text-slate-500">Mouvements de l'exercice et soldes de clôture</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer Balance
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-[10px] uppercase">
                <tr>
                  <th rowSpan={2} className="px-4 py-3 border-r border-slate-200">N° Compte</th>
                  <th rowSpan={2} className="px-4 py-3 border-r border-slate-200">Intitulé</th>
                  <th colSpan={2} className="px-4 py-2 text-center border-b border-r border-slate-200 bg-slate-100/50">Mouvements de la Période</th>
                  <th colSpan={2} className="px-4 py-2 text-center bg-slate-100/50">Soldes de Clôture</th>
                </tr>
                <tr>
                  <th className="px-4 py-1.5 text-right border-r border-slate-200 font-mono">Débit</th>
                  <th className="px-4 py-1.5 text-right border-r border-slate-200 font-mono">Crédit</th>
                  <th className="px-4 py-1.5 text-right border-r border-slate-200 font-mono text-emerald-800">Débiteur</th>
                  <th className="px-4 py-1.5 text-right font-mono text-slate-800">Créditeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {trialBalanceRows.map((row) => (
                  <tr key={row.account_number} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 font-black text-emerald-800 border-r border-slate-100">{row.account_number}</td>
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-800 border-r border-slate-100">{row.account_label}</td>
                    <td className="px-4 py-2.5 text-right border-r border-slate-100 font-bold">{row.mvt_debit > 0 ? fmt(row.mvt_debit) : '-'}</td>
                    <td className="px-4 py-2.5 text-right border-r border-slate-100 font-bold">{row.mvt_credit > 0 ? fmt(row.mvt_credit) : '-'}</td>
                    <td className="px-4 py-2.5 text-right border-r border-slate-100 font-black text-emerald-700">{row.solde_debiteur > 0 ? fmt(row.solde_debiteur) : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-black text-slate-800">{row.solde_crediteur > 0 ? fmt(row.solde_crediteur) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black font-mono text-slate-900">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right uppercase font-sans text-xs">Totaux Généraux :</td>
                  <td className="px-4 py-3 text-right border-r border-slate-200">{fmt(trialBalanceRows.reduce((s, r) => s + r.mvt_debit, 0))}</td>
                  <td className="px-4 py-3 text-right border-r border-slate-200">{fmt(trialBalanceRows.reduce((s, r) => s + r.mvt_credit, 0))}</td>
                  <td className="px-4 py-3 text-right border-r border-slate-200 text-emerald-800">{fmt(trialBalanceRows.reduce((s, r) => s + r.solde_debiteur, 0))}</td>
                  <td className="px-4 py-3 text-right text-slate-800">{fmt(trialBalanceRows.reduce((s, r) => s + r.solde_crediteur, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ─── ONGLET 4 : LETTRAGE DES COMPTES TIERS (411 / 401) ────────────── */}
      {activeTab === 'lettrage' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900">Lettrage & Rapprochement des Comptes Tiers</h3>
              <p className="text-xs text-slate-500">Rapprochement strict entre Facture d'Engagement et Règlement de Trésorerie</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setLettrageAccount('411100')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                  lettrageAccount === '411100' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Clients (411100)
              </button>
              <button
                onClick={() => setLettrageAccount('401100')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                  lettrageAccount === '401100' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Fournisseurs (401100)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-xs text-slate-600">
              Lignes sélectionnées : <strong>{selectedLinesToLetter.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={4}
                value={lettreCodeInput}
                onChange={(e) => setLettreCodeInput(e.target.value.toUpperCase())}
                placeholder="Code lettrage (ex: AA)"
                className="w-24 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase text-center"
              />
              <button
                onClick={handleApplyLettering}
                disabled={selectedLinesToLetter.length < 2}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-40"
              >
                Lettrer les Lignes
              </button>
            </div>
          </div>

          {linesToLetter.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-xs font-medium">
              Aucune ligne non lettrée sur ce compte tiers.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3 w-10 text-center">✓</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-3 py-3">Journal</th>
                    <th className="px-3 py-3">N° Pièce</th>
                    <th className="px-4 py-3">Tiers / Client / Fournisseur</th>
                    <th className="px-4 py-3">Libellé</th>
                    <th className="px-4 py-3 text-right">Débit</th>
                    <th className="px-4 py-3 text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {linesToLetter.map(({ entry, line }) => {
                    const isSelected = selectedLinesToLetter.includes(line.id || '')
                    return (
                      <tr
                        key={line.id}
                        onClick={() => {
                          if (!line.id) return
                          setSelectedLinesToLetter((prev) =>
                            isSelected ? prev.filter((id) => id !== line.id) : [...prev, line.id!]
                          )
                        }}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-emerald-50/80 font-bold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input type="checkbox" checked={isSelected} readOnly className="rounded text-emerald-600" />
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-sans">{entry.entry_date}</td>
                        <td className="px-3 py-2.5 font-bold">{entry.journal_code}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-900">{entry.entry_number}</td>
                        <td className="px-4 py-2.5 font-sans font-bold text-slate-800">{line.third_party_name || '-'}</td>
                        <td className="px-4 py-2.5 font-sans text-slate-600">{line.description}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900">{line.debit > 0 ? fmt(line.debit) : '-'}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900">{line.credit > 0 ? fmt(line.credit) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── ONGLET 5 : ÉTAT FISCAL RÉCAPITULATIF AIB (COMPTE 449200) ─────── */}
      {activeTab === 'aib' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800">
                  COMPTE 449200
                </span>
                <h3 className="text-base font-black text-slate-900">État Fiscal Récapitulatif de l'AIB (Bénin)</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompte sur Impôt assis sur les Bénéfices — Collectes sur ventes et Retenues à la source sur achats
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold">
              <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-100">
                <span className="text-purple-600 font-sans text-[10px] block">AIB COLLECTÉ (VENTES)</span>
                <span className="text-sm text-purple-900">{fmt(aibReport.totalAibCollecte)}</span>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                <span className="text-amber-600 font-sans text-[10px] block">AIB RETENU (ACHATS)</span>
                <span className="text-sm text-amber-900">{fmt(aibReport.totalAibRetenu)}</span>
              </div>
            </div>
          </div>

          {aibReport.rows.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-xs font-medium">
              Aucune opération soumise à AIB (Compte 449200) enregistrée pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-3 py-3">Jal</th>
                    <th className="px-3 py-3">N° Pièce</th>
                    <th className="px-4 py-3">Tier / Client / Fournisseur</th>
                    <th className="px-4 py-3 text-right">Base HT</th>
                    <th className="px-3 py-3 text-center">Taux AIB</th>
                    <th className="px-4 py-3 text-right">Montant AIB</th>
                    <th className="px-3 py-3 text-center">Nature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {aibReport.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 font-sans">{r.date}</td>
                      <td className="px-3 py-2.5 font-bold">{r.journal}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{r.piece_ref}</td>
                      <td className="px-4 py-2.5 font-sans font-bold text-slate-800">{r.tier_nom}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(r.base_ht)}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{r.taux_aib}%</td>
                      <td className="px-4 py-2.5 text-right font-black text-purple-700">{fmt(r.montant_aib)}</td>
                      <td className="px-3 py-2.5 text-center font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.sens === 'COLLECTE' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.sens}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── ONGLET 6 : ÉTATS FINANCIERS SMT (BILAN & RÉSULTAT) ────────────── */}
      {activeTab === 'etats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Compte de Résultat */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900">Compte de Résultat Simplifié (SMT)</h3>
            <p className="text-xs text-slate-400">Formation du résultat net d'exploitation</p>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl font-bold">
                <span>Chiffre d'Affaires Ventes (701)</span>
                <span className="text-emerald-700">{fmt(totalVentesHt)}</span>
              </div>
              <div className="flex justify-between p-2.5 text-slate-600">
                <span>- Achats de Marchandises (601)</span>
                <span className="text-rose-600">- {fmt(totalAchatsHt)}</span>
              </div>
              <div className="flex justify-between p-2.5 bg-emerald-50 rounded-xl font-black text-emerald-900">
                <span>= MARGE COMMERCIALE BRUTE</span>
                <span>{fmt(totalVentesHt - totalAchatsHt)}</span>
              </div>
              <div className={`p-4 rounded-2xl border flex justify-between items-center ${
                totalVentesHt - totalAchatsHt >= 0
                  ? 'bg-emerald-100/50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <span className="font-sans font-black text-xs uppercase">RÉSULTAT NET</span>
                <span className="text-lg font-black">{fmt(totalVentesHt - totalAchatsHt)}</span>
              </div>
            </div>
          </div>

          {/* Bilan Patrimonial */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900">Bilan Patrimonial Synthétique</h3>
            <p className="text-xs text-slate-400">Structure patrimoniale et trésorerie nette</p>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <span className="font-sans font-bold text-[11px] text-slate-500 uppercase block">Actif Circulant</span>
                <div className="flex justify-between">
                  <span>Créances Clients (411) :</span>
                  <span className="font-bold">
                    {fmt(trialBalanceRows.find((r) => r.account_number === '411100')?.solde_debiteur || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Trésorerie Disponibilités (571/521) :</span>
                  <span className="font-bold text-emerald-700">
                    {fmt(
                      (trialBalanceRows.find((r) => r.account_number === '571100')?.solde_debiteur || 0) +
                      (trialBalanceRows.find((r) => r.account_number === '521100')?.solde_debiteur || 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <span className="font-sans font-bold text-[11px] text-slate-500 uppercase block">Passif Circulant</span>
                <div className="flex justify-between">
                  <span>Dettes Fournisseurs (401) :</span>
                  <span className="font-bold">
                    {fmt(trialBalanceRows.find((r) => r.account_number === '401100')?.solde_crediteur || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Dettes Fiscales TVA & AIB (44) :</span>
                  <span className="font-bold text-purple-700">
                    {fmt(totalTvaFacturee + aibReport.totalAibCollecte)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ONGLET 7 : PLAN COMPTABLE SYSCOHADA RÉVISÉ 2018 ──────────────── */}
      {activeTab === 'plan' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900">Plan Comptable Général SYSCOHADA Révisé 2018</h3>
              <p className="text-xs text-slate-500">Nomenclature officielle des comptes par classes (1 à 8)</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">{SYSCOHADA_PLAN_2018.length} comptes référencés</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto pr-2">
            {SYSCOHADA_PLAN_2018.map((acc) => (
              <div key={acc.code} className="py-2.5 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-xl transition">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                    {acc.code}
                  </span>
                  <span className="text-xs font-medium text-slate-800">{acc.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Classe {acc.classId} — {acc.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── ONGLET 8 : GESTION BUDGÉTAIRE PRÉVISIONNELLE ─────────────────── */}
      {activeTab === 'budget' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">{budgets.find((b) => b.id === selectedBudgetId)?.name || 'Budget'}</h3>
                <p className="text-xs text-slate-500">Période : {budgets.find((b) => b.id === selectedBudgetId)?.period}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowNewBudgetModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                + Nouveau Budget
              </button>
              <button
                onClick={() => handleOpenLineModal()}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
              >
                + Ajouter Poste
              </button>
            </div>
          </div>

          {/* Lignes budgétaires */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-3">Compte</th>
                  <th className="px-4 py-3">Poste Budgétaire</th>
                  <th className="px-3 py-3 text-center">Type</th>
                  <th className="px-4 py-3 text-right">Prévu</th>
                  <th className="px-4 py-3 text-right">Réalisé</th>
                  <th className="px-4 py-3 text-right">Écart</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {budgetLines.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-black text-indigo-800">{l.code_poste}</td>
                    <td className="px-4 py-2.5 font-sans font-medium">{l.libelle_poste}</td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        l.type_poste === 'RECETTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {l.type_poste}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">{fmt(l.montant_prevu)}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmt(l.montant_realise)}</td>
                    <td className={`px-4 py-2.5 text-right font-black ${l.montant_realise >= l.montant_prevu ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {fmt(l.montant_realise - l.montant_prevu)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => handleDeleteBudgetLine(l.id)} className="p-1 text-slate-400 hover:text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODALE DÉTAIL D'ÉCRITURE COMPTABLE COMPLÈTE ─────────────────── */}
      {viewingEntry && (
        <ModalPortal isOpen={Boolean(viewingEntry)} onClose={() => setViewingEntry(null)} id="modal-view-entry">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="font-mono text-xs font-black bg-slate-900 text-white px-2 py-0.5 rounded">
                  {viewingEntry.entry_number}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">{viewingEntry.description}</h3>
              </div>
              <button onClick={() => setViewingEntry(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Journal</span>
                <span className="font-bold text-slate-800">{viewingEntry.journal_code}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Date</span>
                <span className="font-mono font-bold text-slate-800">{viewingEntry.entry_date}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Référence Pièce</span>
                <span className="font-mono font-bold text-slate-800">{viewingEntry.reference || '-'}</span>
              </div>
            </div>

            {/* Lignes de l'écriture */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Compte</th>
                    <th className="px-3 py-2 font-sans">Intitulé</th>
                    <th className="px-3 py-2 text-right">Débit</th>
                    <th className="px-3 py-2 text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingEntry.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-black text-emerald-800">{l.account_number}</td>
                      <td className="px-3 py-2 font-sans font-medium text-slate-800">{l.account_label}</td>
                      <td className="px-3 py-2 text-right font-bold">{l.debit > 0 ? fmt(l.debit) : '-'}</td>
                      <td className="px-3 py-2 text-right font-bold">{l.credit > 0 ? fmt(l.credit) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-black border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right font-sans">Totaux Équilibrés :</td>
                    <td className="px-3 py-2 text-right text-slate-900">{fmt(viewingEntry.total_debit)}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{fmt(viewingEntry.total_credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingEntry(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ─── MODALE NOUVELLE ÉCRITURE MANUELLE (OD) EN PARTIE DOUBLE STRICTE ── */}
      {showManualModal && (
        <ModalPortal isOpen={showManualModal} onClose={() => setShowManualModal(false)} id="modal-manual-od">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Nouvelle Écriture Comptable Manuelle</h3>
                <p className="text-xs text-slate-400">Contrôle strict de la partie double : Débit = Crédit obligatoire</p>
              </div>
              <button onClick={() => setShowManualModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveManualEntry} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Journal Comptable *</label>
                  <select
                    value={manualHeader.journal_code}
                    onChange={(e) => setManualHeader({ ...manualHeader, journal_code: e.target.value as any })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-bold bg-slate-50"
                  >
                    {JOURNAUX_CATALOG.map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.code} — {j.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date d'Écriture *</label>
                  <input
                    type="date"
                    required
                    value={manualHeader.entry_date}
                    onChange={(e) => setManualHeader({ ...manualHeader, entry_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">N° Pièce / Réf</label>
                  <input
                    type="text"
                    value={manualHeader.reference}
                    onChange={(e) => setManualHeader({ ...manualHeader, reference: e.target.value })}
                    placeholder="Ex: OD-2026-001"
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Libellé Général de l'Opération *</label>
                <input
                  type="text"
                  required
                  value={manualHeader.description}
                  onChange={(e) => setManualHeader({ ...manualHeader, description: e.target.value })}
                  placeholder="Ex: Dotation aux amortissements, Régularisation de fin de mois..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Lignes multi-comptes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800">Lignes de l'écriture :</span>
                  <button
                    type="button"
                    onClick={handleAddManualLine}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                  >
                    + Ajouter une ligne
                  </button>
                </div>

                <div className="space-y-2">
                  {manualLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="col-span-4">
                        <select
                          value={line.account_number}
                          onChange={(e) => handleManualLineChange(idx, 'account_number', e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded-lg font-mono text-[11px]"
                        >
                          {SYSCOHADA_PLAN_2018.map((acc) => (
                            <option key={acc.code} value={acc.code}>
                              {acc.code} — {acc.label.slice(0, 22)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => handleManualLineChange(idx, 'description', e.target.value)}
                          placeholder="Libellé spécifique (optionnel)"
                          className="w-full p-1.5 border border-slate-200 rounded-lg text-[11px]"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          min={0}
                          value={line.debit || ''}
                          onChange={(e) => handleManualLineChange(idx, 'debit', Number(e.target.value))}
                          placeholder="Débit"
                          className="w-full p-1.5 border border-slate-200 rounded-lg font-mono font-bold text-right text-[11px]"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          min={0}
                          value={line.credit || ''}
                          onChange={(e) => handleManualLineChange(idx, 'credit', Number(e.target.value))}
                          placeholder="Crédit"
                          className="w-full p-1.5 border border-slate-200 rounded-lg font-mono font-bold text-right text-[11px]"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveManualLine(idx)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contrôle d'équilibre Débit == Crédit */}
              <div className="p-3 rounded-2xl border flex justify-between items-center font-mono font-bold bg-slate-100">
                <div className="space-x-4">
                  <span>Total Débit : <strong>{fmt(manualTotalDebit)}</strong></span>
                  <span>Total Crédit : <strong>{fmt(manualTotalCredit)}</strong></span>
                </div>
                <div className={isManualBalanced ? 'text-emerald-700' : 'text-rose-700'}>
                  {isManualBalanced ? '✓ Équilibré' : `Écart : ${fmt(Math.abs(manualTotalDebit - manualTotalCredit))}`}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!isManualBalanced}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-40"
                >
                  Valider l'Écriture
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

export default SyscohadaPage
