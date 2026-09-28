// =============================================================================
// GESTIO 229 SaaS — Module 4.1 : Caisse (Espèces & Mobile Money séparés)
// Clôtures Journalières, Demandes de Retrait vers Trésorerie, Ajustements Admin
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Wallet, Plus, X, CheckCircle, Clock, TrendingUp, TrendingDown,
  Lock, Shield, ArrowUpRight, Smartphone, RefreshCw, AlertCircle,
  Printer, Send, FileCheck, Check
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { AdjustFundsModal, WithdrawalRequestModal, ModalPortal } from '../../../components/modals'
import clsx from 'clsx'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface CashSessionData {
  id: string
  opened_at: string
  opened_by: string
  solde_especes_initial: number
  solde_momo_initial: number
  ventes_especes: number
  ventes_momo: number
  ventes_credit: number
  remboursements_recus: number
  depenses_caisse: number
  retraits_transferes: number
  status: 'OUVERTE' | 'CLOTUREE'
}

export const CaissePage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  // Session active de caisse
  const [session, setSession] = useState<CashSessionData>({
    id: 'sess-today',
    opened_at: new Date().toISOString(),
    opened_by: user?.full_name || 'Caissier Principal',
    solde_especes_initial: 50000,
    solde_momo_initial: 120000,
    ventes_especes: 345000,
    ventes_momo: 280000,
    ventes_credit: 65000,
    remboursements_recus: 45000,
    depenses_caisse: 25000,
    retraits_transferes: 200000,
    status: 'OUVERTE'
  })

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  // Champs de clôture
  const [closingPhysicalCash, setClosingPhysicalCash] = useState<number>(0)
  const [closingNotes, setClosingNotes] = useState('')

  // ─── Calculs Dynamiques de Caisse ──────────────────────────────────────────

  // Solde Espèces Actuel = Initial + Ventes Espèces + Remboursements - Dépenses - Retraits
  const soldeEspecesTheorique =
    session.solde_especes_initial +
    session.ventes_especes +
    session.remboursements_recus -
    session.depenses_caisse -
    session.retraits_transferes

  // Solde MoMo Actuel = Initial + Ventes MoMo
  const soldeMomoTheorique = session.solde_momo_initial + session.ventes_momo

  // Total encaissé dans la journée
  const totalEncaisseJour =
    session.ventes_especes +
    session.ventes_momo +
    session.remboursements_recus

  const totalActiviteJour = totalEncaisseJour + session.ventes_credit

  // Valider la clôture
  const handleConfirmClose = () => {
    setSession({
      ...session,
      status: 'CLOTUREE'
    })
    setShowCloseSessionModal(false)
    setShowReportModal(true)
    toast.success('Caisse Clôturée !', 'Rapport de clôture journalier généré avec succès.')
  }

  return (
    <div className="space-y-4">
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Module 4.1 : Journal & Clôture de Caisse
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Double solde Espèces / MoMo, versements vers trésorerie et clôtures journalières
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAdjustModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" /> Ajuster Fonds (Admin)
          </button>
          <button
            onClick={() => setShowWithdrawalModal(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Demande Retrait vers Trésorerie
          </button>
          {session.status === 'OUVERTE' ? (
            <button
              onClick={() => {
                setClosingPhysicalCash(soldeEspecesTheorique)
                setShowCloseSessionModal(true)
              }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" /> Clôturer la Caisse
            </button>
          ) : (
            <button
              onClick={() => setShowReportModal(true)}
              className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" /> Rapport de Clôture
            </button>
          )}
        </div>
      </div>

      {/* ── Cartes Double Solde de Caisse ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Solde Espèces */}
        <div className="bg-white rounded-2xl border-2 border-emerald-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-black text-emerald-800 uppercase flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Solde Caisse Espèces (Tiroir)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              {session.status}
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">{fmt(soldeEspecesTheorique)}</p>
          <div className="text-[11px] text-slate-500 mt-2 space-y-0.5 border-t border-slate-100 pt-1.5">
            <div className="flex justify-between">
              <span>Fond initial tiroir :</span>
              <span className="font-mono">{fmt(session.solde_especes_initial)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span>+ Ventes espèces :</span>
              <span className="font-mono">+{fmt(session.ventes_especes)}</span>
            </div>
            <div className="flex justify-between text-indigo-700 font-semibold">
              <span>+ Remboursements créances :</span>
              <span className="font-mono">+{fmt(session.remboursements_recus)}</span>
            </div>
            <div className="flex justify-between text-rose-600">
              <span>- Dépenses caisse :</span>
              <span className="font-mono">-{fmt(session.depenses_caisse)}</span>
            </div>
          </div>
        </div>

        {/* Solde Mobile Money */}
        <div className="bg-white rounded-2xl border-2 border-amber-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-black text-amber-800 uppercase flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-amber-600" />
              Solde Caisse Mobile Money
            </span>
            <span className="text-[10px] font-bold text-amber-700">MTN & Moov</span>
          </div>
          <p className="text-2xl font-black text-amber-900 font-mono mt-1">{fmt(soldeMomoTheorique)}</p>
          <div className="text-[11px] text-slate-500 mt-2 space-y-0.5 border-t border-slate-100 pt-1.5">
            <div className="flex justify-between">
              <span>Solde MoMo matin :</span>
              <span className="font-mono">{fmt(session.solde_momo_initial)}</span>
            </div>
            <div className="flex justify-between text-amber-700 font-semibold">
              <span>+ Encaissements MoMo :</span>
              <span className="font-mono">+{fmt(session.ventes_momo)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Opérateur partenaire :</span>
              <span>MTN / Moov Bénin</span>
            </div>
          </div>
        </div>

        {/* Total Encaissé de la Journée */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 shadow-sm text-white flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-300 uppercase block mb-1">
              Activité Globale du Jour
            </span>
            <p className="text-2xl font-black text-emerald-400 font-mono">{fmt(totalActiviteJour)}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Dont liquidités réelles reçues : <strong className="text-white">{fmt(totalEncaisseJour)}</strong>
            </p>
          </div>
          <div className="border-t border-slate-700 pt-2 text-[10px] text-slate-300 flex justify-between">
            <span>Caissier : {session.opened_by}</span>
            <span>Date : {new Date(session.opened_at).toLocaleDateString('fr-BJ')}</span>
          </div>
        </div>
      </div>

      {/* ── Détail des flux de la session ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-sm text-slate-900">Synthèse des Flux de la Session en Cours</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-500 block mb-0.5 font-sans">Ventes Espèces</span>
            <span className="font-bold text-sm text-slate-800">{fmt(session.ventes_especes)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-500 block mb-0.5 font-sans">Ventes Mobile Money</span>
            <span className="font-bold text-sm text-slate-800">{fmt(session.ventes_momo)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-500 block mb-0.5 font-sans">Ventes à Crédit</span>
            <span className="font-bold text-sm text-rose-600">{fmt(session.ventes_credit)}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-500 block mb-0.5 font-sans">Retraits vers Trésorerie</span>
            <span className="font-bold text-sm text-indigo-700">{fmt(session.retraits_transferes)}</span>
          </div>
        </div>
      </div>

      {/* ── MODAL CLÔTURE DE CAISSE ─────────────────────────────────────────── */}
      <ModalPortal isOpen={showCloseSessionModal} onClose={() => setShowCloseSessionModal(false)} id="modal-close-caisse">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Lock className="w-5 h-5 text-rose-600" />
              Clôture Journalière de Caisse
            </h3>
            <button onClick={() => setShowCloseSessionModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-600 font-sans">Solde Espèces Théorique :</span>
                <span className="font-bold">{fmt(soldeEspecesTheorique)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-sans">Solde MoMo Théorique :</span>
                <span className="font-bold">{fmt(soldeMomoTheorique)}</span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Espèces réellement comptées dans le tiroir (FCFA)
              </label>
              <input
                type="number"
                value={closingPhysicalCash}
                onChange={(e) => setClosingPhysicalCash(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-sm font-bold"
              />
              {closingPhysicalCash !== soldeEspecesTheorique && (
                <p className="text-xs font-bold text-rose-600 mt-1 font-mono">
                  Écart de caisse : {fmt(closingPhysicalCash - soldeEspecesTheorique)}
                </p>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Observations / Remarques</label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Ex : RAS, monnaie exacte remise au gérant"
                className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={() => setShowCloseSessionModal(false)}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmClose}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Confirmer la Clôture
            </button>
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL RAPPORT DE CLÔTURE IMPRIMABLE ──────────────────────────────── */}
      <ModalPortal isOpen={showReportModal} onClose={() => setShowReportModal(false)} id="modal-caisse-report">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-sm">Rapport de Clôture Journalier</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
              <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Corps du rapport */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs space-y-3">
            <div className="text-center pb-2 border-b border-slate-200 space-y-0.5">
              <p className="font-black text-sm uppercase">{company?.name ?? 'GESTIO 229 ENTREPRISE'}</p>
              <p className="text-[10px] text-slate-500">RAPPORT OFFICIEL DE CLÔTURE DE CAISSE</p>
              <p className="text-[10px] text-slate-500">Émis le {new Date().toLocaleString('fr-BJ')}</p>
            </div>

            <div className="space-y-1.5 py-1">
              <div className="flex justify-between">
                <span>Fond Initial Espèces :</span>
                <span>{fmt(session.solde_especes_initial)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700">
                <span>Total Ventes Espèces :</span>
                <span>+{fmt(session.ventes_especes)}</span>
              </div>
              <div className="flex justify-between font-bold text-amber-700">
                <span>Total Ventes MoMo :</span>
                <span>+{fmt(session.ventes_momo)}</span>
              </div>
              <div className="flex justify-between text-indigo-700">
                <span>Remboursements Créances :</span>
                <span>+{fmt(session.remboursements_recus)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Dépenses en Espèces :</span>
                <span>-{fmt(session.depenses_caisse)}</span>
              </div>
              <div className="flex justify-between text-indigo-600">
                <span>Versements Trésorerie :</span>
                <span>-{fmt(session.retraits_transferes)}</span>
              </div>
            </div>

            <div className="border-t-2 border-slate-300 pt-2 font-black text-sm space-y-1">
              <div className="flex justify-between">
                <span>SOLDE ESPÈCES FINAL :</span>
                <span>{fmt(soldeEspecesTheorique)}</span>
              </div>
              <div className="flex justify-between text-amber-800">
                <span>SOLDE MOMO FINAL :</span>
                <span>{fmt(soldeMomoTheorique)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 border-t border-slate-200 pt-1">
                <span>TOTAL JOURNÉE :</span>
                <span>{fmt(totalActiviteJour)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-between text-[10px] font-sans">
              <div>
                <p className="font-bold">Signature Caissier :</p>
                <p className="text-slate-400 mt-6">{session.opened_by}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">Visa Gérant / Contrôleur :</p>
                <p className="text-slate-400 mt-6">Validé</p>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* Modals tierces */}
      <AdjustFundsModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        onAdjusted={(adj) => {
          setSession((prev) => ({
            ...prev,
            solde_especes_initial: prev.solde_especes_initial + (adj.amount || 0)
          }))
          toast.success('Fonds ajustés avec succès !', `Motif : ${adj.reason || 'Ajustement Administrateur'}`)
        }}
      />
      <WithdrawalRequestModal
        isOpen={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
        onRequestCreated={(req) => {
          setSession((prev) => ({
            ...prev,
            retraits_transferes: prev.retraits_transferes + (req.amount || 0)
          }))
          toast.success('Demande de retrait soumise', 'En attente d\'encaissement par la Trésorerie centrale.')
        }}
      />
    </div>
  )
}

export default CaissePage
