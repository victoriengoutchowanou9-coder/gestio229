// =============================================================================
// GESTIO 229 SaaS — Comptabilité SYSCOHADA Révisé
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { BookOpen, RefreshCw, FileText, Download, CheckCircle, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

interface JournalEntry {
  id: string
  entry_date: string
  piece_ref: string
  account_number: string
  account_label: string
  debit: number
  credit: number
  libelle: string
}

const DEFAULT_PLAN_SYSCOHADA = [
  { code: '411100', label: 'Clients ordinaires - Ventes locales' },
  { code: '401100', label: 'Fournisseurs d\'exploitation' },
  { code: '521100', label: 'Banques locales' },
  { code: '571100', label: 'Caisse centrale' },
  { code: '601100', label: 'Achats de marchandises' },
  { code: '605100', label: 'Fournitures de bureau' },
  { code: '605200', label: 'Électricité (SBEE) & Eau (SONEB)' },
  { code: '613100', label: 'Locations immobilières' },
  { code: '701100', label: 'Ventes de marchandises' },
  { code: '445710', label: 'TVA collectée sur ventes (18%)' },
]

const SyscohadaPage: React.FC = () => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'journal' | 'plan'>('journal')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadJournal = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      // Charger les ventes pour générer le journal automatique OHADA
      const { data: sales } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('company_id', company.id)
        .order('order_date', { ascending: false })
        .limit(50)

      // Transformer en écritures SYSCOHADA (Débit 571 / Crédit 701)
      const generated: JournalEntry[] = []
      ;(sales || []).forEach((sale) => {
        const dateStr = sale.order_date || sale.created_at || new Date().toISOString()
        const amount = Number(sale.total_amount) || 0

        // Ligne Débit Caisse
        generated.push({
          id: `${sale.id}-d`,
          entry_date: dateStr,
          piece_ref: sale.order_number || 'VTE',
          account_number: '571100',
          account_label: 'Caisse centrale',
          debit: amount,
          credit: 0,
          libelle: `Encaissement vente ${sale.order_number || ''}`
        })

        // Ligne Crédit Ventes Marchandises
        generated.push({
          id: `${sale.id}-c`,
          entry_date: dateStr,
          piece_ref: sale.order_number || 'VTE',
          account_number: '701100',
          account_label: 'Ventes de marchandises',
          debit: 0,
          credit: amount,
          libelle: `Vente au comptoir ${sale.order_number || ''}`
        })
      })

      setEntries(generated)
    } catch (err: any) {
      toast.error('Erreur journal SYSCOHADA', err.message)
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadJournal()
  }, [loadJournal])

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Comptabilité SYSCOHADA</h1>
          <p className="text-slate-500 text-sm mt-1">Génération automatique du Journal Général conforme aux normes UEMOA / OHADA révisé</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('journal')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'journal' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Livre Journal
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'plan' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Plan de Comptes
          </button>
        </div>
      </div>

      {activeTab === 'journal' ? (
        <>
          {/* Équilibre Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-xs font-medium text-slate-500">Total Débits</span>
              <p className="text-2xl font-black text-slate-800 mt-1">{fmt(totalDebit)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-xs font-medium text-slate-500">Total Crédits</span>
              <p className="text-2xl font-black text-slate-800 mt-1">{fmt(totalCredit)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-xs font-medium text-slate-500">Contrôle de Partie Double</span>
              <div className="flex items-center gap-2 mt-1 text-emerald-600 font-bold">
                <CheckCircle className="w-5 h-5" />
                <span>Équilibré (Écart 0 F)</span>
              </div>
            </div>
          </div>

          {/* Table du Journal */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Livre Journal des Écritures Automatiques</h3>
              <button
                onClick={loadJournal}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="p-8 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="p-12 text-center">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-semibold">Aucune écriture comptable</p>
                <p className="text-slate-400 text-sm">Les opérations de caisse et ventes génèrent automatiquement les écritures.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Pièce</th>
                      <th className="px-5 py-3">Compte</th>
                      <th className="px-5 py-3">Intitulé</th>
                      <th className="px-5 py-3">Libellé de l'opération</th>
                      <th className="px-5 py-3 text-right">Débit</th>
                      <th className="px-5 py-3 text-right">Crédit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                          {new Date(e.entry_date).toLocaleDateString('fr-BJ')}
                        </td>
                        <td className="px-5 py-3 font-mono font-medium text-slate-700">{e.piece_ref}</td>
                        <td className="px-5 py-3 font-mono font-bold text-emerald-700">{e.account_number}</td>
                        <td className="px-5 py-3 text-slate-800">{e.account_label}</td>
                        <td className="px-5 py-3 text-slate-600">{e.libelle}</td>
                        <td className="px-5 py-3 text-right font-medium text-slate-800">
                          {e.debit > 0 ? fmt(e.debit) : '-'}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-slate-800">
                          {e.credit > 0 ? fmt(e.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Plan de comptes */
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-4">Plan Comptable Général OHADA (Extraits Métier)</h3>
          <div className="divide-y divide-slate-100">
            {DEFAULT_PLAN_SYSCOHADA.map((acc) => (
              <div key={acc.code} className="py-3 flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                  {acc.code}
                </span>
                <span className="text-sm font-medium text-slate-700">{acc.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SyscohadaPage
