// =============================================================================
// GESTIO 229 SaaS — Module 4.2 : Trésorerie Centrale (Banques, MoMo & Caisses)
// Approbation des Demandes de Retrait, Décaissements Fournisseurs & Alertes Cash
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Landmark, Plus, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Wallet, Building2, RefreshCw, Smartphone, Check, X, ShieldAlert,
  Printer, ArrowRightLeft, CheckCircle2, AlertCircle
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { TreasuryDisbursementModal, ModalPortal } from '../../../components/modals'
import clsx from 'clsx'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface TreasuryAccount {
  id: string
  name: string
  type: 'bank' | 'mobile_money' | 'vault'
  institution: string
  account_number: string
  balance: number
  alert_threshold: number
}

interface PendingTransfer {
  id: string
  sourceCaisse: string
  amount: number
  type: 'especes' | 'momo'
  requestedBy: string
  requestedAt: string
  status: 'PENDING' | 'APPROVED'
}

export const TresoreriePage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  // Comptes de trésorerie
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([
    { id: '1', name: 'Compte Principal Entreprise', type: 'bank', institution: 'Ecobank Bénin', account_number: 'BJ061 01001 00123456789 22', balance: 5450000, alert_threshold: 500000 },
    { id: '2', name: 'Compte MoMo Marchand MTN', type: 'mobile_money', institution: 'MTN Mobile Money', account_number: '+229 97 00 11 22', balance: 780000, alert_threshold: 100000 },
    { id: '3', name: 'Compte Flooz Marchand Moov', type: 'mobile_money', institution: 'Moov Africa Bénin', account_number: '+229 95 33 44 55', balance: 420000, alert_threshold: 100000 },
    { id: '4', name: 'Coffre-Fort Trésorerie (Espèces)', type: 'vault', institution: 'Siège Central', account_number: 'COFFRE-01', balance: 850000, alert_threshold: 200000 },
  ])

  // Demandes de versements en attente envoyées par la caisse
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([
    {
      id: 'req-01',
      sourceCaisse: 'Caisse POS Rayon 1',
      amount: 200000,
      type: 'especes',
      requestedBy: 'Albert SOSSOU (Caissier)',
      requestedAt: new Date(Date.now() - 3600000).toISOString(),
      status: 'PENDING'
    }
  ])

  const [showDisbursementModal, setShowDisbursementModal] = useState(false)

  // Approuver et encaisser un transfert de caisse vers la trésorerie
  const handleApproveTransfer = (transfer: PendingTransfer) => {
    // Créditer le coffre ou le compte MoMo selon le type
    const targetAccountId = transfer.type === 'especes' ? '4' : '2'
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === targetAccountId
          ? { ...acc, balance: acc.balance + transfer.amount }
          : acc
      )
    )

    setPendingTransfers((prev) =>
      prev.map((t) => (t.id === transfer.id ? { ...t, status: 'APPROVED' } : t))
    )

    toast.success(
      'Fonds Encaissés en Trésorerie !',
      `Versement de ${fmt(transfer.amount)} validé et crédité sur les comptes centraux.`
    )
  }

  // Solde global consolidé
  const totalTreasuryBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const totalBankBalance = accounts.filter((a) => a.type === 'bank').reduce((sum, a) => sum + a.balance, 0)
  const totalMomoBalance = accounts.filter((a) => a.type === 'mobile_money').reduce((sum, a) => sum + a.balance, 0)
  const totalVaultBalance = accounts.filter((a) => a.type === 'vault').reduce((sum, a) => sum + a.balance, 0)

  return (
    <div className="space-y-4">
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            Module 4.2 : Trésorerie Centrale & Liquidités
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi des comptes Banques, MoMo, validation des versements et décaissements
          </p>
        </div>

        <button
          onClick={() => setShowDisbursementModal(true)}
          className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <ArrowDownRight className="w-3.5 h-3.5" /> Nouveau Décaissement Externe
        </button>
      </div>

      {/* ── KPIs Trésorerie ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-indigo-200 uppercase">Trésorerie Consolidée</span>
          <p className="text-2xl font-black text-emerald-400 font-mono my-1">{fmt(totalTreasuryBalance)}</p>
          <span className="text-[10px] text-slate-300">Total Liquidités Disponibles</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Comptes Bancaires</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">{fmt(totalBankBalance)}</p>
          <span className="text-[10px] text-slate-400">Ecobank & Autres</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">MoMo Marchands</span>
            <Smartphone className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-black text-amber-800 font-mono">{fmt(totalMomoBalance)}</p>
          <span className="text-[10px] text-slate-400">MTN & Moov Africa</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Coffre-Fort Espèces</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-emerald-800 font-mono">{fmt(totalVaultBalance)}</p>
          <span className="text-[10px] text-slate-400">Liquidités en coffre</span>
        </div>
      </div>

      {/* ── Section Demandes de Retrait Caisse en Attente ───────────────────── */}
      {pendingTransfers.some((t) => t.status === 'PENDING') && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-sm text-amber-900">
              Demandes de Versement Caisse vers Trésorerie en Attente
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs bg-white rounded-xl shadow-sm overflow-hidden">
              <thead className="bg-amber-100/60 text-amber-900 font-bold border-b border-amber-200">
                <tr>
                  <th className="p-3">Origine Caisse</th>
                  <th className="p-3">Demandeur</th>
                  <th className="p-3">Date / Heure</th>
                  <th className="p-3 text-right">Montant</th>
                  <th className="p-3 text-center">Type</th>
                  <th className="p-3 text-center">Action Approbation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {pendingTransfers.filter((t) => t.status === 'PENDING').map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="p-3 font-sans font-bold text-slate-800">{transfer.sourceCaisse}</td>
                    <td className="p-3 font-sans text-slate-600">{transfer.requestedBy}</td>
                    <td className="p-3 font-sans text-slate-500">{new Date(transfer.requestedAt).toLocaleTimeString('fr-BJ')}</td>
                    <td className="p-3 text-right font-black text-emerald-700">{fmt(transfer.amount)}</td>
                    <td className="p-3 text-center font-sans font-bold text-slate-700 uppercase">{transfer.type}</td>
                    <td className="p-3 text-center font-sans">
                      <button
                        onClick={() => handleApproveTransfer(transfer)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto"
                      >
                        <Check className="w-3.5 h-3.5" /> Encaisser en Trésorerie
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Liste des Comptes de Trésorerie ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        <h3 className="font-bold text-sm text-slate-900">Détail des Comptes de Trésorerie</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{acc.name}</h4>
                  <p className="text-xs text-slate-500">{acc.institution} • {acc.account_number}</p>
                </div>
                <span className={clsx(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                  acc.type === 'bank' ? 'bg-indigo-100 text-indigo-800' :
                  acc.type === 'mobile_money' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                )}>
                  {acc.type}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Solde Actuel :</span>
                <span className="text-lg font-black text-slate-900 font-mono">{fmt(acc.balance)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Décaissement */}
      <TreasuryDisbursementModal
        isOpen={showDisbursementModal}
        onClose={() => setShowDisbursementModal(false)}
        accounts={accounts}
        onDisbursed={(disb) => {
          setAccounts((prev) =>
            prev.map((acc) =>
              acc.id === disb.account_id
                ? { ...acc, balance: Math.max(0, acc.balance - disb.amount) }
                : acc
            )
          )
          toast.success('Décaissement Effectué !', `Montant : ${fmt(disb.amount)} retiré de ${disb.account_name}`)
        }}
      />
    </div>
  )
}

export default TresoreriePage
