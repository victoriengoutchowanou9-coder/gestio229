// =============================================================================
// GESTIO 229 SaaS — Modale Universelle de Traçabilité & Justification Financière
// =============================================================================
// Permet de cliquer sur chaque carte d'indicateur du tableau de bord
// pour afficher la liste exacte, traçable et certifiée des opérations sources
// Conforme exigences SYSCOHADA et normes d'audit financier UEMOA
// =============================================================================

import React from 'react'
import {
  X, DollarSign, TrendingUp, TrendingDown, ArrowDownRight, CreditCard,
  Package, FileText, CheckCircle2, AlertCircle, Info, ShieldCheck, Printer
} from 'lucide-react'
import { ModalPortal } from './ModalPortal'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

export type FinancialDetailType =
  | 'revenue'
  | 'gross_margin'
  | 'net_margin'
  | 'expenses'
  | 'receivables'
  | 'stock'
  | 'avoirs'

export interface FinancialDetailModalProps {
  isOpen: boolean
  onClose: () => void
  type: FinancialDetailType | null
  periodLabel: string
  sales: any[]
  expenses: any[]
  avoirs: any[]
  products: any[]
  customers: any[]
  financialSummary: {
    revenueTTC: number
    revenueHT: number
    avoirsTTC: number
    avoirsHT: number
    netRevenueHT: number
    cogsHT: number
    grossMargin: number
    operatingExpenses: number
    netMargin: number
    netMarginRate: number
    isCostAvailable: boolean
    costStatusLabel: string
  }
  stockValuation: {
    totalMagasinValAchat: number
    totalVenteValAchat: number
    totalStockValAchat: number
    totalStockValVente: number
    totalStockUv: number
    articlesCount: number
  }
}

export const FinancialDetailModal: React.FC<FinancialDetailModalProps> = ({
  isOpen,
  onClose,
  type,
  periodLabel,
  sales = [],
  expenses = [],
  avoirs = [],
  products = [],
  customers = [],
  financialSummary,
  stockValuation,
}) => {
  if (!isOpen || !type) return null

  const getTitleAndIcon = () => {
    switch (type) {
      case 'revenue':
        return {
          title: "Justificatif du Chiffre d'Affaires (Ventes Validées)",
          icon: DollarSign,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200'
        }
      case 'gross_margin':
        return {
          title: "Justificatif de la Marge Brute Commerciale d'Exploitation",
          icon: TrendingUp,
          color: 'text-indigo-600',
          bg: 'bg-indigo-50',
          border: 'border-indigo-200'
        }
      case 'net_margin':
        return {
          title: "Rapprochement du Résultat / Marge Nette de Gestion",
          icon: financialSummary.netMargin >= 0 ? TrendingUp : TrendingDown,
          color: financialSummary.netMargin >= 0 ? 'text-emerald-600' : 'text-rose-600',
          bg: financialSummary.netMargin >= 0 ? 'bg-emerald-50' : 'bg-rose-50',
          border: financialSummary.netMargin >= 0 ? 'border-emerald-200' : 'border-rose-200'
        }
      case 'expenses':
        return {
          title: "Justificatif des Dépenses Réelles Décaissées d'Exploitation",
          icon: ArrowDownRight,
          color: 'text-rose-600',
          bg: 'bg-rose-50',
          border: 'border-rose-200'
        }
      case 'receivables':
        return {
          title: "Justificatif des Créances Clients Non Soldées",
          icon: CreditCard,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200'
        }
      case 'stock':
        return {
          title: "Justificatif de la Valorisation du Stock au Coût d'Achat",
          icon: Package,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200'
        }
      case 'avoirs':
        return {
          title: "Justificatif des Factures d'Avoir et Retours de la Période",
          icon: FileText,
          color: 'text-rose-600',
          bg: 'bg-rose-50',
          border: 'border-rose-200'
        }
      default:
        return {
          title: "Détail de l'Indicateur",
          icon: Info,
          color: 'text-slate-600',
          bg: 'bg-slate-50',
          border: 'border-slate-200'
        }
    }
  }

  const { title, icon: Icon, color, bg, border } = getTitleAndIcon()

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl ${bg} ${border} border flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">{title}</h2>
              <p className="text-xs text-slate-500 font-medium">
                Période sélectionnée : <span className="font-bold text-slate-700">{periodLabel}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* ========================================================================= */}
          {/* 1. DÉPENSES RÉELLES DÉCAISSÉES */}
          {/* ========================================================================= */}
          {type === 'expenses' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Charges Décaissées</span>
                  <p className="text-2xl font-black text-rose-600 font-mono mt-0.5">
                    {fmt(financialSummary.operatingExpenses)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Pièces Justificatives</span>
                  <p className="text-sm font-bold text-slate-800">{expenses.length} justificatif(s) validé(s)</p>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Règle comptable SYSCOHADA :</strong> Seules les véritables dépenses d'exploitation
                  (loyer, électricité, fournitures, salaires, réparations, etc.) de la période sont incluses.
                  Les transferts de caisse, les clôtures journalières et les achats de stock destinés à l'inventaire sont
                  formellement exclus pour éviter toute fausse charge ou double décompte.
                </div>
              </div>

              {expenses.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-1">
                  <p className="font-bold text-slate-600 text-sm">0 justificatif d'exploitation pour cette période</p>
                  <p className="text-xs text-slate-400">
                    Aucune dépense réelle n'a été décaissée durant cette période. Les clôtures de caisse ne sont pas comptabilisées comme des pertes.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Réf / Pièce</th>
                        <th className="p-3">Date Comptable</th>
                        <th className="p-3">Bénéficiaire / Motif</th>
                        <th className="p-3">Catégorie</th>
                        <th className="p-3">Mode Paiement</th>
                        <th className="p-3">Caisse / Source</th>
                        <th className="p-3">Auteur</th>
                        <th className="p-3">Statut</th>
                        <th className="p-3 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {expenses.map((e, idx) => (
                        <tr key={e.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-slate-700">{e.reference || e.id?.slice(0, 8) || '-'}</td>
                          <td className="p-3 font-medium text-slate-600">
                            {e.expense_date ? new Date(e.expense_date).toLocaleDateString('fr-BJ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                          </td>
                          <td className="p-3 font-bold text-slate-800">{e.beneficiary || e.description || e.category || 'Dépense'}</td>
                          <td className="p-3 font-medium text-slate-600">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold">
                              {e.category || 'Charges générales'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-700 capitalize">{e.payment_method || 'Espèces'}</td>
                          <td className="p-3 font-medium text-slate-600">{e.caisse_name || 'Caisse principale'}</td>
                          <td className="p-3 font-medium text-slate-600">{e.created_by_name || 'Utilisateur'}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                              {e.status || 'Validé'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-black text-rose-600">
                            -{fmt(e.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. CHIFFRE D'AFFAIRES (CA) */}
          {/* ========================================================================= */}
          {type === 'revenue' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">CA Brut Total</span>
                  <p className="text-xl font-black text-slate-900 font-mono mt-0.5">{fmt(financialSummary.revenueTTC)}</p>
                </div>
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-200">
                  <span className="text-[11px] font-bold text-rose-700 uppercase block">Avoirs & Retours Déduits</span>
                  <p className="text-xl font-black text-rose-700 font-mono mt-0.5">-{fmt(financialSummary.avoirsTTC)}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block">CA Net d'Exploitation</span>
                  <p className="text-xl font-black text-emerald-700 font-mono mt-0.5">{fmt(financialSummary.revenueTTC - financialSummary.avoirsTTC)}</p>
                </div>
              </div>

              {sales.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  Aucune vente validée sur cette période sélectionnée.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">N° Vente / Facture</th>
                        <th className="p-3">Date & Heure</th>
                        <th className="p-3">Client</th>
                        <th className="p-3">Règlement</th>
                        <th className="p-3 text-right">Montant HT</th>
                        <th className="p-3 text-right">TVA</th>
                        <th className="p-3 text-right">Montant TTC</th>
                        <th className="p-3 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {sales.map((s, idx) => (
                        <tr key={s.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-slate-800">{s.order_number}</td>
                          <td className="p-3 font-medium text-slate-600">
                            {new Date(s.order_date || s.created_at).toLocaleString('fr-BJ', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </td>
                          <td className="p-3 font-bold text-slate-800">{s.customer_name || 'Client Comptoir'}</td>
                          <td className="p-3 font-medium text-slate-600 capitalize">{s.payment_method || 'Espèces'}</td>
                          <td className="p-3 text-right font-mono font-medium text-slate-700">{fmt(s.subtotal_ht ?? s.total_ht ?? s.total_amount)}</td>
                          <td className="p-3 text-right font-mono font-medium text-slate-500">{fmt(s.total_tax || 0)}</td>
                          <td className="p-3 text-right font-mono font-black text-slate-900">{fmt(s.total_amount)}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                              {s.status || 'COMPLET'}
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

          {/* ========================================================================= */}
          {/* 3. MARGE BRUTE COMMERCIALE */}
          {/* ========================================================================= */}
          {type === 'gross_margin' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Chiffre d'Affaires Net HT</span>
                  <p className="text-xl font-black text-slate-900 font-mono mt-0.5">{fmt(financialSummary.netRevenueHT)}</p>
                </div>
                <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block">Coût d'Achat Marchandises (COGS)</span>
                  <p className="text-xl font-black text-amber-700 font-mono mt-0.5">-{fmt(financialSummary.cogsHT)}</p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase block">Marge Brute Réelle</span>
                  <p className="text-xl font-black text-indigo-700 font-mono mt-0.5">{fmt(financialSummary.grossMargin)}</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">N° Commande</th>
                      <th className="p-3">Articles Vendu(s)</th>
                      <th className="p-3 text-right">CA Net HT</th>
                      <th className="p-3 text-right">Coût Réel (COGS)</th>
                      <th className="p-3 text-right">Marge Brute</th>
                      <th className="p-3 text-center">Taux (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {sales.map((s, idx) => {
                      const caHT = Number(s.subtotal_ht ?? s.total_ht ?? s.total_amount) || 0
                      const cogs = Number(s.total_cost) || 0
                      const margin = Math.round((caHT - cogs) * 100) / 100
                      const rate = caHT > 0 ? ((margin / caHT) * 100).toFixed(1) : '0.0'
                      const linesStr = Array.isArray(s.lines)
                        ? s.lines.map((l: any) => `${l.product?.name || l.name || 'Article'} (x${l.qty || l.quantity || 1})`).join(', ')
                        : 'Articles multiples'

                      return (
                        <tr key={s.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-slate-800">{s.order_number}</td>
                          <td className="p-3 text-slate-600 max-w-xs truncate" title={linesStr}>{linesStr}</td>
                          <td className="p-3 text-right font-mono font-medium text-slate-800">{fmt(caHT)}</td>
                          <td className="p-3 text-right font-mono font-medium text-slate-600">{fmt(cogs)}</td>
                          <td className={`p-3 text-right font-mono font-black ${margin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {fmt(margin)}
                          </td>
                          <td className="p-3 text-center font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              Number(rate) >= 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}>
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. MARGE NETTE / RÉSULTAT */}
          {/* ========================================================================= */}
          {type === 'net_margin' && (
            <div className="space-y-4">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Détail de la Formation du Résultat d'Exploitation (OHADA)
                </h4>
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-200">
                    <span className="text-slate-600 font-sans">1. Chiffre d'Affaires Net HT :</span>
                    <strong className="text-slate-900">{fmt(financialSummary.netRevenueHT)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-200">
                    <span className="text-slate-600 font-sans">2. Coût d'Achat des Marchandises Vendues (COGS) :</span>
                    <strong className="text-amber-700">-{fmt(financialSummary.cogsHT)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-300 font-bold bg-indigo-50/50 px-2 rounded-lg">
                    <span className="text-indigo-900 font-sans font-bold">3. = Marge Brute Commerciale :</span>
                    <strong className="text-indigo-700">{fmt(financialSummary.grossMargin)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-200">
                    <span className="text-slate-600 font-sans">4. - Dépenses Réelles d'Exploitation Décaissées :</span>
                    <strong className="text-rose-600">-{fmt(financialSummary.operatingExpenses)}</strong>
                  </div>
                  <div className={`flex justify-between py-2 font-black text-sm px-2 rounded-xl ${financialSummary.netMargin >= 0 ? 'bg-emerald-100/70 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                    <span className="font-sans font-bold">5. = Marge Nette d'Exploitation (Bénéfice Réel) :</span>
                    <strong>{fmt(financialSummary.netMargin)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. CRÉANCES CLIENTS */}
          {/* ========================================================================= */}
          {type === 'receivables' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Encours Créances</span>
                  <p className="text-2xl font-black text-amber-700 font-mono mt-0.5">
                    {fmt(customers.reduce((sum, c) => sum + (Number(c.current_debt ?? c.solde_creance ?? 0)), 0))}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Clients Débiteurs</span>
                  <p className="text-sm font-bold text-slate-800">
                    {customers.filter((c) => (Number(c.current_debt ?? c.solde_creance ?? 0)) > 0).length} client(s)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Code</th>
                      <th className="p-3">Nom du Client</th>
                      <th className="p-3">Téléphone</th>
                      <th className="p-3 text-right">Solde Débiteur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {customers.filter((c) => (Number(c.current_debt ?? c.solde_creance ?? 0)) > 0).map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-mono font-bold text-slate-700">{c.code || `CLI-${idx + 1}`}</td>
                        <td className="p-3 font-bold text-slate-900">{c.name}</td>
                        <td className="p-3 text-slate-600">{c.phone || '-'}</td>
                        <td className="p-3 text-right font-mono font-black text-rose-600">
                          {fmt(c.current_debt ?? c.solde_creance ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. VALORISATION DU STOCK */}
          {/* ========================================================================= */}
          {type === 'stock' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Valeur Magasin (UCD) au Coût</span>
                  <p className="text-xl font-black text-slate-900 font-mono mt-0.5">{fmt(stockValuation.totalMagasinValAchat)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Valeur Vente (UV) au Coût</span>
                  <p className="text-xl font-black text-slate-900 font-mono mt-0.5">{fmt(stockValuation.totalVenteValAchat)}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200">
                  <span className="text-[11px] font-bold text-blue-700 uppercase block">Valeur Totale Stock (Au Coût)</span>
                  <p className="text-xl font-black text-blue-700 font-mono mt-0.5">{fmt(stockValuation.totalStockValAchat)}</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Article</th>
                      <th className="p-3 text-center">Unités & Coef</th>
                      <th className="p-3 text-center">Stock Magasin</th>
                      <th className="p-3 text-right">Coût Magasin</th>
                      <th className="p-3 text-center">Stock Vente</th>
                      <th className="p-3 text-right">Coût Vente</th>
                      <th className="p-3 text-right">Valeur Totale Achat</th>
                      <th className="p-3 text-right">Valeur Vente TTC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {products.map((p, idx) => {
                      const meta = p.sector_meta || {}
                      const coef = Number(meta.coef || p.coef || 1)
                      const stockMag = Number(meta.stock_magasin ?? p.stock_magasin ?? 0)
                      const stockVente = Number(meta.stock_vente ?? p.stock_vente ?? 0)
                      const costUcd = Number(meta.price_achat_ucd_ttc || p.cost_price || p.purchase_price || 0)
                      const costUv = coef > 0 ? (costUcd / coef) : costUcd
                      const sellUv = Number(meta.price_vente_uv_ttc || p.selling_price || 0)

                      const valMag = stockMag * costUcd
                      const valVente = stockVente * costUv
                      const totalValAchat = valMag + valVente
                      const totalValVente = (stockMag * coef + stockVente) * sellUv

                      return (
                        <tr key={p.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="p-3">
                            <p className="font-bold text-slate-900">{p.name}</p>
                            <span className="text-[10px] text-slate-400 font-mono">{p.code}</span>
                          </td>
                          <td className="p-3 text-center text-slate-600">
                            {meta.ucd || 'Carton'} ➔ {coef} {meta.uv || 'Kg'}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700">{stockMag}</td>
                          <td className="p-3 text-right font-mono text-slate-600">{fmt(valMag)}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">{stockVente}</td>
                          <td className="p-3 text-right font-mono text-slate-600">{fmt(valVente)}</td>
                          <td className="p-3 text-right font-mono font-black text-blue-700">{fmt(totalValAchat)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-700">{fmt(totalValVente)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 7. FACTURES D'AVOIR */}
          {/* ========================================================================= */}
          {type === 'avoirs' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Avoirs Validés</span>
                  <p className="text-2xl font-black text-rose-700 font-mono mt-0.5">
                    {fmt(financialSummary.avoirsTTC)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Nombre de Retours</span>
                  <p className="text-sm font-bold text-slate-800">{avoirs.length} pièce(s)</p>
                </div>
              </div>

              {avoirs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  Aucun avoir ni retour enregistré sur cette période.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">N° Avoir</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Client</th>
                        <th className="p-3">Motif</th>
                        <th className="p-3">Remboursement</th>
                        <th className="p-3 text-right">Montant TTC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {avoirs.map((a, idx) => (
                        <tr key={a.id || idx} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-slate-800">{a.numero_avoir || a.id?.slice(0, 8)}</td>
                          <td className="p-3 text-slate-600">
                            {a.date_avoir ? new Date(a.date_avoir).toLocaleDateString('fr-BJ') : '-'}
                          </td>
                          <td className="p-3 font-bold text-slate-800">{a.client_nom || 'Client'}</td>
                          <td className="p-3 text-slate-600">{a.motif || 'Retour marchandise'}</td>
                          <td className="p-3 text-slate-600 capitalize">{a.mode_remboursement || 'Avoir'}</td>
                          <td className="p-3 text-right font-mono font-black text-rose-600">
                            -{fmt(a.montant_total_avoir || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            GESTIO 229 • Traçabilité financière certifiée OHADA & UEMOA
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
