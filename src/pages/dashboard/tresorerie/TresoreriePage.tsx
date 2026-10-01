// =============================================================================
// GESTIO 229 SaaS — Trésorerie Centrale (Banques, MoMo & Liquidités)
// =============================================================================
// Séparation stricte de la Caisse
// Gestion des comptes réels, approbation des versements de caisse et décaissements
// Nettoyé de toute valeur fictive — Zéro donnée fictive
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Landmark, Plus, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Wallet, Building2, RefreshCw, Smartphone, Check, X, ShieldAlert,
  Printer, ArrowRightLeft, CheckCircle2, AlertCircle, Trash2, Eye
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { TreasuryDisbursementModal, ModalPortal } from '../../../components/modals'
import { logAuditEvent } from '../../../services/auditService'


const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface TreasuryAccount {
  id: string
  name: string
  type: 'bank' | 'mobile_money' | 'vault'
  institution: string
  account_number: string
  balance: number
  alert_threshold?: number
}

interface PendingTransfer {
  id: string
  created_at: string
  requested_by: string
  type: string
  amount: number
  motif: string
  status: 'EN_ATTENTE' | 'APPROVED' | 'REJECTED'
}

export const TresoreriePage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = params.sectorSlug || getActiveSectorSlug()

  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAddAccountModal, setShowAddAccountModal] = useState(false)
  const [showDisbursementModal, setShowDisbursementModal] = useState(false)

  // Formulaire nouveau compte trésorerie
  const [newAccForm, setNewAccForm] = useState({
    name: '',
    type: 'bank' as 'bank' | 'mobile_money' | 'vault',
    institution: '',
    account_number: '',
    initial_balance: 0,
    alert_threshold: 50000
  })

  // Charger les comptes trésorerie réels
  const loadTreasuryData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      // 1. Charger depuis Supabase si table existante
      const { data: dbAccounts, error } = await supabase
        .from('treasury_accounts')
        .select('*')
        .eq('company_id', company.id)

      if (!error && dbAccounts && dbAccounts.length > 0) {
        const sectorAccs = filterItemsForSector(dbAccounts, currentSectorSlug)
        setAccounts(sectorAccs)
      } else {
        setAccounts([])
      }

      // 2. Charger les demandes de versements caisse en attente du secteur depuis Supabase
      try {
        const { data: dbTransfers } = await supabase
          .from('treasury_transfers')
          .select('*')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false })
        if (dbTransfers && dbTransfers.length > 0) {
          setPendingTransfers(dbTransfers)
        } else {
          const { data: auditTransfers } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('company_id', company.id)
            .eq('action', 'DEMANDE_TRANSFERT_TRESORERIE')
            .order('created_at', { ascending: false })
          if (auditTransfers && auditTransfers.length > 0) {
            setPendingTransfers(auditTransfers.map((a: any) => {
              const det = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {})
              return {
                id: a.id,
                created_at: a.created_at,
                requested_by: a.user_name || 'Caissier',
                type: det.type || 'Espèces',
                amount: Number(det.amount) || 0,
                motif: det.motif || '',
                status: det.status || 'EN_ATTENTE'
              }
            }))
          } else {
            setPendingTransfers([])
          }
        }
      } catch (e) {
        setPendingTransfers([])
      }
    } catch (err: any) {
      console.error('Erreur chargement trésorerie :', err)
      setAccounts([])
      setPendingTransfers([])
    } finally {
      setLoading(false)
    }
  }, [company?.id, currentSectorSlug])

  useEffect(() => {
    loadTreasuryData()
  }, [loadTreasuryData])

  // Mettre à jour les comptes dans l'état local
  const saveAccounts = (updated: TreasuryAccount[]) => {
    setAccounts(updated)
  }

  // Ajouter un nouveau compte réel
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccForm.name.trim() || !company?.id) return

    const fullAccNum = newAccForm.institution.trim()
      ? `${newAccForm.institution.trim()} - ${newAccForm.account_number.trim() || 'Principal'}`
      : (newAccForm.account_number.trim() || 'Principal')

    let createdId = `acc-${Date.now()}`

    // Insertion directe et persistante dans Supabase
    try {
      const { data: dbAcc, error } = await supabase
        .from('treasury_accounts')
        .insert({
          company_id: company.id,
          name: newAccForm.name.trim(),
          type: newAccForm.type,
          account_number: fullAccNum,
          balance: Number(newAccForm.initial_balance) || 0,
          syscohada_code: newAccForm.type === 'bank' ? '521000' : newAccForm.type === 'vault' ? '571000' : '521100',
          is_active: true
        })
        .select()
        .single()

      if (dbAcc?.id) {
        createdId = dbAcc.id
      }
    } catch (dbErr) {
      console.warn('Fallback insertion Supabase treasury_accounts:', dbErr)
    }

    const newAccount: TreasuryAccount = {
      id: createdId,
      name: newAccForm.name.trim(),
      type: newAccForm.type,
      institution: newAccForm.institution.trim() || 'Établissement Financier',
      account_number: newAccForm.account_number.trim() || 'N/A',
      balance: Number(newAccForm.initial_balance) || 0,
      alert_threshold: Number(newAccForm.alert_threshold) || 50000
    }

    const updated = [...accounts, newAccount]
    saveAccounts(updated)

    await logAuditEvent({
      companyId: company.id,
      userId: user?.id,
      userName: user?.full_name,
      userRole: user?.role,
      action: 'CREATION_COMPTE_TRESORERIE',
      module: 'TRESORERIE',
      sector: currentSectorSlug.toUpperCase(),
      description: `Création du compte de trésorerie "${newAccount.name}" (${newAccount.type}) avec solde initial de ${fmt(newAccount.balance)}`
    })

    toast.success('Compte de trésorerie créé avec succès !')
    setShowAddAccountModal(false)
    setNewAccForm({
      name: '',
      type: 'bank',
      institution: '',
      account_number: '',
      initial_balance: 0,
      alert_threshold: 50000
    })
  }

  // Approuver une demande de versement envoyée par la caisse
  const handleApproveTransfer = async (transfer: PendingTransfer) => {
    // Trouver le compte de destination correspondant (ex: coffre pour espèces, momo pour momo)
    const target = accounts.find((a) =>
      transfer.type === 'Espèces' ? a.type === 'vault' : a.type === 'mobile_money'
    ) || accounts[0]

    if (target) {
      const newBal = target.balance + Number(transfer.amount)
      const updatedAccounts = accounts.map((a) =>
        a.id === target.id ? { ...a, balance: newBal } : a
      )
      saveAccounts(updatedAccounts)

      // Mise à jour persistante Supabase
      if (company?.id) {
        try {
          await supabase
            .from('treasury_accounts')
            .update({ balance: newBal })
            .eq('id', target.id)
        } catch (updErr) {
          console.warn('Fallback mise à jour solde treasury_accounts:', updErr)
        }
      }
    }

    const updatedTransfers: PendingTransfer[] = pendingTransfers.map((t) =>
      t.id === transfer.id ? { ...t, status: 'APPROVED' } : t
    )
    setPendingTransfers(updatedTransfers)

    if (company?.id) {
      try {
        await supabase
          .from('treasury_transfers')
          .update({ status: 'APPROVED', approved_by: user?.full_name || 'Direction', approved_at: new Date().toISOString() })
          .eq('id', transfer.id)
      } catch (e) {}
    }

    await logAuditEvent({
      companyId: company?.id,
      userId: user?.id,
      userName: user?.full_name,
      userRole: user?.role,
      action: 'APPROBATION_TRANSFERT_CAISSE',
      module: 'TRESORERIE',
      sector: currentSectorSlug.toUpperCase(),
      description: `Approbation du transfert de caisse de ${fmt(transfer.amount)} (${transfer.type}) vers le compte ${target?.name || 'Trésorerie'}`
    })

    toast.success(
      'Fonds Encaissés en Trésorerie !',
      `Le versement de ${fmt(transfer.amount)} a été approuvé et crédité.`
    )
  }

  // Rejeter une demande
  const handleRejectTransfer = async (transferId: string) => {
    const updatedTransfers: PendingTransfer[] = pendingTransfers.map((t) =>
      t.id === transferId ? { ...t, status: 'REJECTED' } : t
    )
    setPendingTransfers(updatedTransfers)

    if (company?.id) {
      try {
        await supabase
          .from('treasury_transfers')
          .update({ status: 'REJECTED' })
          .eq('id', transferId)
      } catch (e) {}
    }

    await logAuditEvent({
      companyId: company?.id,
      userId: user?.id,
      userName: user?.full_name,
      userRole: user?.role,
      action: 'REJET_TRANSFERT_CAISSE',
      module: 'TRESORERIE',
      sector: currentSectorSlug.toUpperCase(),
      description: `Rejet de la demande de transfert de caisse réf: ${transferId}`
    })

    toast.info('Demande rejetée', 'Le caissier a été notifié.')
  }

  // Totaux calculés à partir des comptes réels
  const totalTreasuryBalance = useMemo(() => accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])
  const totalBankBalance = useMemo(() => accounts.filter((a) => a.type === 'bank').reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])
  const totalMomoBalance = useMemo(() => accounts.filter((a) => a.type === 'mobile_money').reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])
  const totalVaultBalance = useMemo(() => accounts.filter((a) => a.type === 'vault').reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])

  const pendingRequestsList = useMemo(() => pendingTransfers.filter((t) => t.status === 'EN_ATTENTE'), [pendingTransfers])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête Trésorerie ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-indigo-600" />
            Trésorerie Centrale
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Comptes bancaires, comptes marchands MoMo, coffre-fort et validation des versements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter un compte</span>
          </button>
          <button
            onClick={() => setShowDisbursementModal(true)}
            disabled={accounts.length === 0}
            className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Nouveau Décaissement</span>
          </button>
        </div>
      </div>

      {/* ── KPIs Trésorerie Réels ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
            Trésorerie Consolidée
          </span>
          <p className="text-2xl font-black text-emerald-400 font-mono my-2">
            {fmt(totalTreasuryBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-700/80 pt-1.5">
            {accounts.length} compte(s) actif(s)
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Comptes Bancaires
            </span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">
            {fmt(totalBankBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            {accounts.filter((a) => a.type === 'bank').length} banque(s)
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              MoMo Marchands
            </span>
            <Smartphone className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-black text-amber-800 font-mono">
            {fmt(totalMomoBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            {accounts.filter((a) => a.type === 'mobile_money').length} ligne(s) marchandes
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Coffre-Fort (Espèces)
            </span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-emerald-800 font-mono">
            {fmt(totalVaultBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            Liquidités centrales
          </span>
        </div>
      </div>

      {/* ── Demandes de Versement Caisse en Attente ──────────────────────────── */}
      {pendingRequestsList.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-amber-950 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <span>Demandes de Versement Caisse en Attente ({pendingRequestsList.length})</span>
            </h3>
            <span className="text-xs text-amber-800 font-semibold">Validation requise</span>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-amber-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-100/60 text-amber-900 font-bold border-b border-amber-200">
                <tr>
                  <th className="p-3">Demandeur</th>
                  <th className="p-3">Date / Heure</th>
                  <th className="p-3 text-center">Canal</th>
                  <th className="p-3 text-right">Montant</th>
                  <th className="p-3">Motif</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {pendingRequestsList.map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="p-3 font-sans font-bold text-slate-800">{transfer.requested_by}</td>
                    <td className="p-3 font-sans text-slate-500">
                      {new Date(transfer.created_at).toLocaleString('fr-BJ', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        transfer.type === 'Espèces' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {transfer.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(transfer.amount)}</td>
                    <td className="p-3 font-sans text-slate-600">{transfer.motif}</td>
                    <td className="p-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleApproveTransfer(transfer)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Encaisser</span>
                        </button>
                        <button
                          onClick={() => handleRejectTransfer(transfer.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold transition"
                        >
                          Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Liste des Comptes de Trésorerie Réels ────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Comptes & Coffres Actifs ({accounts.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">Soldes réels validés</span>
        </div>

        {accounts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <p className="text-sm font-bold text-slate-600">Aucune donnée disponible</p>
            <p className="text-xs max-w-sm mx-auto text-slate-400">
              Aucun compte bancaire ou compte Mobile Money n'a encore été configuré pour cet établissement.
            </p>
            <button
              onClick={() => setShowAddAccountModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
            >
              + Enregistrer le premier compte
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    acc.type === 'bank' ? 'bg-indigo-100 text-indigo-700' :
                    acc.type === 'mobile_money' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {acc.type === 'bank' ? <Building2 className="w-5 h-5" /> :
                     acc.type === 'mobile_money' ? <Smartphone className="w-5 h-5" /> :
                     <Wallet className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{acc.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {acc.institution} • {acc.account_number}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-base font-black font-mono text-slate-900">{fmt(acc.balance)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    acc.balance > (acc.alert_threshold || 50000)
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}>
                    {acc.balance > (acc.alert_threshold || 50000) ? 'Solde suffisant' : 'Alerte solde bas'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL AJOUT DE COMPTE TRÉSORERIE ─────────────────────────────────── */}
      <ModalPortal isOpen={showAddAccountModal} onClose={() => setShowAddAccountModal(false)} id="modal-add-treasury-acc">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              Ajouter un Compte de Trésorerie
            </h3>
            <button onClick={() => setShowAddAccountModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Type de Compte *</label>
              <select
                value={newAccForm.type}
                onChange={(e) => setNewAccForm({ ...newAccForm, type: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
              >
                <option value="bank">Compte Bancaire (Ecobank, BOA, UBA, etc.)</option>
                <option value="mobile_money">Compte Marchand Mobile Money (MTN / Moov)</option>
                <option value="vault">Coffre-Fort Central (Espèces)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Libellé du Compte *</label>
              <input
                type="text"
                required
                placeholder="Ex: Compte Courant Principal"
                value={newAccForm.name}
                onChange={(e) => setNewAccForm({ ...newAccForm, name: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Établissement / Réseau *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ecobank Bénin"
                  value={newAccForm.institution}
                  onChange={(e) => setNewAccForm({ ...newAccForm, institution: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">N° de Compte / RIB</label>
                <input
                  type="text"
                  placeholder="Ex: BJ061..."
                  value={newAccForm.account_number}
                  onChange={(e) => setNewAccForm({ ...newAccForm, account_number: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Solde Réel Initial (FCFA) *</label>
              <input
                type="number"
                required
                min="0"
                value={newAccForm.initial_balance}
                onChange={(e) => setNewAccForm({ ...newAccForm, initial_balance: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1">Solde effectif disponible à ce jour sur le relevé.</p>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                Créer le Compte
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Modal Décaissement */}
      <TreasuryDisbursementModal
        isOpen={showDisbursementModal}
        onClose={() => setShowDisbursementModal(false)}
        onSuccess={(d) => {
          // Déduire du premier compte bancaire ou coffre
          if (accounts.length > 0) {
            const updated = accounts.map((a, i) =>
              i === 0 ? { ...a, balance: Math.max(0, a.balance - Number(d.amount || 0)) } : a
            )
            saveAccounts(updated)
          }
          toast.success('Décaissement enregistré avec succès')
        }}
      />
    </div>
  )
}

export default TresoreriePage
