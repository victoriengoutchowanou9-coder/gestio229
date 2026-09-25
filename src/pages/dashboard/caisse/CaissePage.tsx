// =============================================================================
// GESTIO 229 SaaS — Caisse : Journal & Sessions de Caisse
// =============================================================================

import React, { useState, useEffect } from 'react'
import { Wallet, Plus, X, CheckCircle, Clock, TrendingUp, TrendingDown, Lock, Shield, ArrowUpRight } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { AdjustFundsModal, WithdrawalRequestModal } from '../../../components/modals'
import clsx from 'clsx'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface CashSession {
  id: string
  company_id: string
  name: string
  opened_at: string
  closed_at?: string
  opening_balance: number
  closing_balance?: number
  expected_balance?: number
  difference?: number
  status: 'open' | 'closed'
  opened_by?: string
  notes?: string
}

const CaissePage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [sessions, setSessions] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSession, setActiveSession] = useState<CashSession | null>(null)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)

  const loadSessions = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('company_id', company.id)
        .order('opened_at', { ascending: false })
        .limit(20)

      setSessions(data ?? [])
      const active = (data ?? []).find((s: CashSession) => s.status === 'open')
      setActiveSession(active ?? null)
    } catch (err: any) {
      // Mock default session
      setActiveSession({
        id: 'sess_1',
        company_id: 'default',
        name: 'Session du jour',
        opened_at: new Date().toISOString(),
        opening_balance: 50000,
        status: 'open'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSessions() }, [company?.id])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestion de la Caisse</h1>
          <p className="text-slate-500 text-sm mt-1">Suivi des encaissements, solde tiroir et clôtures</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowAdjustModal(true)}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-amber-300 px-4 py-2.5 rounded-xl font-bold text-xs border border-slate-700 shadow-sm transition"
          >
            <Shield className="w-4 h-4 text-amber-400" /> [ ⚙️ Ajuster Fonds (Admin) ]
          </button>
          <button
            onClick={() => setShowWithdrawalModal(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition"
          >
            <ArrowUpRight className="w-4 h-4" /> [ 📤 Demande Retrait ]
          </button>
        </div>
      </div>

      {/* Cartes Caisse */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border-2 border-emerald-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-800 uppercase">Caisse Espèces (Tiroir)</span>
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">185.000 FCFA</p>
          <span className="text-[10px] text-slate-400">Espèces physiques disponibles</span>
        </div>

        <div className="bg-white rounded-2xl border-2 border-sky-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-sky-800 uppercase">Compte MoMo Caisse</span>
            <TrendingUp className="w-5 h-5 text-sky-600" />
          </div>
          <p className="text-2xl font-black text-sky-700 font-mono">340.000 FCFA</p>
          <span className="text-[10px] text-slate-400">Encaissements MTN / Moov</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">Fond Initial Ouverture</span>
            <Lock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-slate-800 font-mono">50.000 FCFA</p>
          <span className="text-[10px] text-slate-400">Session ouverte par Caissier</span>
        </div>
      </div>

      {/* Modals via React Portal */}
      <AdjustFundsModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
      />
      <WithdrawalRequestModal
        isOpen={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
      />
    </div>
  )
}

export default CaissePage
