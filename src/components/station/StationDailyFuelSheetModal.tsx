// =============================================================================
// GESTIO 229 SaaS — Fiche Journalière des Carburants (Station-Service)
// =============================================================================
// Synthèse quotidienne complète alimentée à 100% par les données réelles :
// Stocks (init, réceptions, ventes, théorique, physique, écart),
// Finances (CA TTC, Net HT, TVA, Coût ventes, Marge brute) et Encaissements.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText, Calendar, Printer, Download, RefreshCw, X, Fuel,
  TrendingUp, AlertTriangle, CheckCircle2, DollarSign, ArrowDownRight, ArrowUpRight
} from 'lucide-react'
import { formatFCFA } from '../../utils/tax'
import { getDailyFuelSheet, DailyFuelSheetItem } from '../../services/stationFuelService'

interface Props {
  isOpen: boolean
  onClose: () => void
  companyId: string
  company: any
}

const fmtVol = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n || 0) + ' L'

export const StationDailyFuelSheetModal: React.FC<Props> = ({
  isOpen,
  onClose,
  companyId,
  company
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<DailyFuelSheetItem[]>([])

  const loadSheet = useCallback(async () => {
    if (!companyId || !isOpen) return
    setLoading(true)
    try {
      const data = await getDailyFuelSheet(companyId, selectedDate, {
        companyRegime: company?.regime_fiscal,
        defaultTvaRate: company?.tva_default_rate
      })
      setItems(data)
    } catch (err) {
      console.error('[StationDailyFuelSheetModal] Erreur chargement fiche journalière:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedDate, isOpen, company])

  useEffect(() => {
    if (isOpen) loadSheet()
  }, [isOpen, loadSheet])

  if (!isOpen) return null

  // Totaux de la journée
  const totalVolumeVendu = items.reduce((s, it) => s + it.quantiteVendueLitres, 0)
  const totalCATTC = items.reduce((s, it) => s + it.chiffreAffairesTTC, 0)
  const totalCANetHT = items.reduce((s, it) => s + it.chiffreAffairesNetHT, 0)
  const totalTVA = items.reduce((s, it) => s + it.tvaCollectee, 0)
  const totalCout = items.reduce((s, it) => s + it.coutVentes, 0)
  const totalMarge = items.reduce((s, it) => s + it.margeBrute, 0)
  const totalEncaissements = items.reduce((s, it) => s + it.totalEncaissements, 0)
  const totalEspeces = items.reduce((s, it) => s + it.encaissementsEspeces, 0)
  const totalMomo = items.reduce((s, it) => s + it.encaissementsMomo, 0)
  const totalCredit = items.reduce((s, it) => s + it.encaissementsCredit, 0)

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Carburant', 'Stock Initial (L)', 'Receptions (L)', 'Vendu (L)',
      'Stock Theorique (L)', 'Stock Physique (L)', 'Ecart (L)',
      'CA TTC (FCFA)', 'CA Net HT (FCFA)', 'TVA (FCFA)',
      'Cout Ventes (FCFA)', 'Marge Brute (FCFA)', 'Especes (FCFA)', 'MoMo (FCFA)', 'Credit (FCFA)'
    ]

    const rows = items.map(it => [
      it.nom,
      it.stockInitial,
      it.receptionsLitres,
      it.quantiteVendueLitres,
      it.stockTheoriqueFinal,
      it.stockPhysiqueJauge !== null ? it.stockPhysiqueJauge : 'Non jauge',
      it.ecartStockLitres,
      it.chiffreAffairesTTC,
      it.chiffreAffairesNetHT,
      it.tvaCollectee,
      it.coutVentes,
      it.margeBrute,
      it.encaissementsEspeces,
      it.encaissementsMomo,
      it.encaissementsCredit
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Fiche_Journaliere_Carburants_${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden my-auto border border-slate-200">
        {/* Entête */}
        <div className="p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-amber-500 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/20">
              <FileText className="w-6 h-6" />
            </span>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300 block">
                Contrôle Quotidien & Clôture
              </span>
              <h2 className="text-xl font-black">Fiche Journalière des Carburants</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {company?.name || 'Station-Service'} — Réconciliation stocks, marges et encaissements.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Sélecteur de date */}
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Calendar className="w-4 h-4 text-amber-300" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={loadSheet}
              disabled={loading}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-white"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleExportCSV}
              className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition font-bold"
              title="Exporter CSV / Excel"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => window.print()}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-white"
              title="Imprimer"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corps */}
        <div className="p-6 space-y-6 text-xs max-h-[75vh] overflow-y-auto">
          {/* Synthèse 4 KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Volume Total Vendu</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{fmtVol(totalVolumeVendu)}</span>
              <span className="text-[10px] text-slate-400">Distribution journalière</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200">
              <span className="text-[10px] uppercase font-bold text-amber-800 block">Chiffre d'Affaires Net HT</span>
              <span className="text-xl font-black text-amber-950 mt-1 block">{formatFCFA(totalCANetHT)}</span>
              <span className="text-[10px] text-amber-700">TTC : {formatFCFA(totalCATTC)} (TVA: {formatFCFA(totalTVA)})</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Marge Brute Réalisée</span>
              <span className="text-xl font-black text-emerald-900 mt-1 block">{formatFCFA(totalMarge)}</span>
              <span className="text-[10px] text-emerald-700">Coût d'achat: {formatFCFA(totalCout)}</span>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
              <span className="text-[10px] uppercase font-bold text-blue-800 block">Total Encaissements</span>
              <span className="text-xl font-black text-blue-950 mt-1 block">{formatFCFA(totalEncaissements)}</span>
              <span className="text-[10px] text-blue-700">Espèces: {formatFCFA(totalEspeces)} | MoMo: {formatFCFA(totalMomo)}</span>
            </div>
          </div>

          {/* Tableau Détaillé par Carburant */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 font-black text-slate-800 text-xs flex items-center justify-between">
              <span>Bilan Physique et Financier des 3 Carburants</span>
              <span className="text-[10px] text-slate-500 font-semibold">Journée du {new Date(selectedDate).toLocaleDateString('fr-FR')}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[9px] font-bold bg-slate-50/50">
                    <th className="py-3 px-3">Produit</th>
                    <th className="py-3 px-3 text-right">Stock Initial</th>
                    <th className="py-3 px-3 text-right">Réceptions</th>
                    <th className="py-3 px-3 text-right">Ventes Distributeur</th>
                    <th className="py-3 px-3 text-right">Stock Théorique</th>
                    <th className="py-3 px-3 text-right">Jauge Physique</th>
                    <th className="py-3 px-3 text-right">Écart Stock</th>
                    <th className="py-3 px-3 text-right">CA Net HT</th>
                    <th className="py-3 px-3 text-right">Coût Ventes</th>
                    <th className="py-3 px-3 text-right">Marge Brute</th>
                    <th className="py-3 px-3 text-right">Encaissements</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((it) => {
                    const ecart = it.ecartStockLitres
                    return (
                      <tr key={it.code} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">
                          {it.nom}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600">{fmtVol(it.stockInitial)}</td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          {it.receptionsLitres > 0 ? `+${fmtVol(it.receptionsLitres)}` : '0 L'}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">{fmtVol(it.quantiteVendueLitres)}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-700">{fmtVol(it.stockTheoriqueFinal)}</td>
                        <td className="py-3 px-3 text-right text-slate-800">
                          {it.stockPhysiqueJauge !== null ? fmtVol(it.stockPhysiqueJauge) : <span className="text-slate-400 italic">Non jaugé</span>}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {it.stockPhysiqueJauge !== null ? (
                            <span className={`inline-flex items-center gap-0.5 font-bold ${
                              ecart < 0 ? 'text-rose-600' : ecart > 0 ? 'text-emerald-600' : 'text-slate-500'
                            }`}>
                              {ecart > 0 ? `+${fmtVol(ecart)}` : fmtVol(ecart)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">{formatFCFA(it.chiffreAffairesNetHT)}</td>
                        <td className="py-3 px-3 text-right text-slate-600">
                          {it.hasCoutAchat ? formatFCFA(it.coutVentes) : <span className="text-slate-400 italic">Manquant</span>}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-emerald-700">
                          {it.hasCoutAchat ? formatFCFA(it.margeBrute) : <span className="text-slate-400 italic">Manquant</span>}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-blue-900">{formatFCFA(it.totalEncaissements)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                    <td className="py-3 px-3 uppercase">Total Général</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right text-emerald-700">
                      +{fmtVol(items.reduce((s, it) => s + it.receptionsLitres, 0))}
                    </td>
                    <td className="py-3 px-3 text-right">{fmtVol(totalVolumeVendu)}</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right">-</td>
                    <td className="py-3 px-3 text-right">{formatFCFA(totalCANetHT)}</td>
                    <td className="py-3 px-3 text-right text-slate-700">{formatFCFA(totalCout)}</td>
                    <td className="py-3 px-3 text-right text-emerald-800">{formatFCFA(totalMarge)}</td>
                    <td className="py-3 px-3 text-right text-blue-950">{formatFCFA(totalEncaissements)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Répartition des Règlements */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="font-bold text-slate-700">
              Détail des Encaissements du Jour :
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-800">
                💵 Espèces : <strong className="text-slate-950">{formatFCFA(totalEspeces)}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-800">
                📱 MoMo : <strong className="text-slate-950">{formatFCFA(totalMomo)}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-800">
                📄 Crédit Flottes : <strong className="text-slate-950">{formatFCFA(totalCredit)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Pied de page */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition shadow-sm"
          >
            Fermer la Fiche
          </button>
        </div>
      </div>
    </div>
  )
}
export default StationDailyFuelSheetModal
