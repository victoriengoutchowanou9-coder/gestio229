// =============================================================================
// GESTIO 229 SaaS — Trésorerie : Caisses & Comptes bancaires
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Landmark, Plus, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Wallet, Building2, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { TreasuryDisbursementModal } from '../../../components/modals'
import clsx from 'clsx'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-BJ')

interface CashAccount {
  id: string
  name: string
  type: 'cash' | 'bank' | 'mobile_money'
  balance: number
  currency: string
  is_active: boolean
}

interface Transaction {
  id: string
  date: string
  description: string
  type: 'debit' | 'credit'
  amount: number
  reference?: string
}

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: '1', date: new Date().toISOString(), description: 'Ventes POS - Session matin', type: 'credit', amount: 285000, reference: 'VTE-001' },
  { id: '2', date: new Date().toISOString(), description: 'Achat marchandises', type: 'debit', amount: 120000, reference: 'ACH-001' },
  { id: '3', date: new Date(Date.now() - 86400000).toISOString(), description: 'Remise fonds en banque', type: 'credit', amount: 500000 },
  { id: '4', date: new Date(Date.now() - 86400000).toISOString(), description: 'Dépenses transport', type: 'debit', amount: 25000 },
  { id: '5', date: new Date(Date.now() - 172800000).toISOString(), description: 'Salaires employés', type: 'debit', amount: 350000 },
]

const TresoreriePage: React.FC = () => {
  const { company } = useAuthStore()
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all')
  const [showDisbursementModal, setShowDisbursementModal] = useState(false)

  useEffect(() => {
    const loadAccounts = async () => {
      if (!company?.id) return
      setLoading(true)
      const mockAccounts: CashAccount[] = [
        { id: '1', name: 'Caisse Principale (Tiroir)', type: 'cash', balance: 345500, currency: 'FCFA', is_active: true },
        { id: '2', name: 'Compte MoMo Central (MTN/Moov)', type: 'mobile_money', balance: 580000, currency: 'FCFA', is_active: true },
        { id: '3', name: 'Compte Bancaire (Ecobank)', type: 'bank', balance: 8450000, currency: 'FCFA', is_active: true },
      ]
      setAccounts(mockAccounts)
      setLoading(false)
    }
    loadAccounts()
  }, [company?.id])

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const totalCredits = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0)
  const totalDebits = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0)
  const filteredTx = transactions.filter((t) => filter === 'all' || t.type === filter)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Trésorerie Centrale</h1>
          <p className="text-slate-500 text-sm mt-1">Vue consolidée des liquidités : Espèces, MoMo et Banques</p>
        </div>
        <button
          onClick={() => setShowDisbursementModal(true)}
          className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition"
        >
          <ArrowDownRight className="w-4 h-4" /> [ 💸 Nouveau Décaissement Externe ]
        </button>
      </div>

      {/* Cartes Liquidités */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase">Caisse Espèces</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">345.500 FCFA</p>
          <span className="text-[10px] text-slate-400">Disponible en caisse</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase">Compte MoMo</span>
            <TrendingUp className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-xl font-black text-sky-700 font-mono">580.000 FCFA</p>
          <span className="text-[10px] text-slate-400">MTN / Moov Money</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase">Compte Bancaire</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl font-black text-indigo-900 font-mono">8.450.000 FCFA</p>
          <span className="text-[10px] text-slate-400">Banque principale</span>
        </div>

        <div className="bg-gradient-to-tr from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-emerald-400 uppercase">Liquidités Totales</span>
            <Landmark className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-black text-white font-mono">9.375.500 FCFA</p>
          <span className="text-[10px] text-slate-400">Espèces + MoMo + Banque</span>
        </div>
      </div>

      {/* Modal via React Portal */}
      <TreasuryDisbursementModal
        isOpen={showDisbursementModal}
        onClose={() => setShowDisbursementModal(false)}
        onSuccess={(disb) => {
          setTransactions([
            { id: String(Date.now()), date: new Date().toISOString(), description: `Décaissement: ${disb.beneficiary} (${disb.reason})`, type: 'debit', amount: disb.amount },
            ...transactions
          ])
        }}
      />
    </div>
  )
}

export default TresoreriePage
