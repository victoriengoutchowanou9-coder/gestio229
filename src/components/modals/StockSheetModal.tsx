import React, { useMemo } from 'react'
import { FileText, Printer, X, Package, DollarSign, Layers, ArrowUpRight } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { calculateStockValuation, getProductValuationDetails } from '../../lib/stockCalcul'
import { formatFCFA } from '../../utils/tax'

interface StockSheetModalProps {
  isOpen: boolean
  onClose: () => void
  products?: any[]
}

const fmt = (n: number) => formatFCFA(n)

export const StockSheetModal: React.FC<StockSheetModalProps> = ({ isOpen, onClose, products = [] }) => {
  const valuation = useMemo(() => calculateStockValuation(products), [products])

  const handlePrint = () => {
    window.print()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-stock-sheet" zIndex={60}>
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">🖨️ Fiche de Stock & État Valorisé</h3>
              <p className="text-[10px] text-slate-400">Norme Bénin & UEMOA (UCD Stockage / UV Vente)</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs bg-slate-50">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-slate-900 text-base">RAPPORT VALORISÉ DES STOCKS</h4>
                <p className="text-slate-500 text-[11px]">Émis le {new Date().toLocaleDateString('fr-FR')}</p>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold">
                  Double Valorisation Conforme
                </span>
              </div>
            </div>

            {/* Grille des 4 indicateurs harmonisés */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-3">
              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-indigo-700 font-bold uppercase">Stock Magasin (UCD)</span>
                <p className="text-lg font-black text-slate-900 font-mono">{fmt(valuation.totalMagasinValAchat)}</p>
                <span className="text-[10px] text-slate-500">{valuation.totalMagasinQty} unités au coût d'achat</span>
              </div>
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                <span className="text-[10px] text-emerald-700 font-bold uppercase">Stock Vente Rayon (UV)</span>
                <p className="text-lg font-black text-slate-900 font-mono">{fmt(valuation.totalVenteValVente)}</p>
                <span className="text-[10px] text-slate-500">{valuation.totalVenteQty} UV (valeur vente)</span>
              </div>
              <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-700 font-bold uppercase">Valorisation Totale Achat</span>
                <p className="text-lg font-black text-slate-900 font-mono">{fmt(valuation.totalStockValAchat)}</p>
                <span className="text-[10px] text-slate-500">Coût immobilisé réel</span>
              </div>
              <div className="bg-emerald-100/60 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-bold uppercase">VALORISATION TOTALE VENTE</span>
                <p className="text-lg font-black text-emerald-900 font-mono">{fmt(valuation.totalStockValVente)}</p>
                <span className="text-[10px] text-emerald-700">{valuation.totalStockUv} UV commercialisables</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold text-[11px]">
                    <th className="p-2.5">Réf / Code</th>
                    <th className="p-2.5">Désignation</th>
                    <th className="p-2.5 text-center">Magasin (UCD)</th>
                    <th className="p-2.5 text-center">Vente (UV)</th>
                    <th className="p-2.5 text-right">PU Achat UCD</th>
                    <th className="p-2.5 text-right">PU Vente UV</th>
                    <th className="p-2.5 text-right">Total Achat</th>
                    <th className="p-2.5 text-right">Total Vente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-400 font-sans">
                        Aucun article à afficher
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => {
                      const details = getProductValuationDetails(p)
                      return (
                        <tr key={p.id || details.code}>
                          <td className="p-2.5 font-bold text-slate-900">{details.code}</td>
                          <td className="p-2.5 font-sans">{details.name}</td>
                          <td className="p-2.5 text-center">{details.stockMagasin} {details.ucdUnit}</td>
                          <td className="p-2.5 text-center">{details.stockVente} {details.uvUnit}</td>
                          <td className="p-2.5 text-right">{fmt(details.prixAchatUcd)}</td>
                          <td className="p-2.5 text-right text-emerald-700 font-bold">{fmt(details.prixVenteTtc)}</td>
                          <td className="p-2.5 text-right font-bold text-slate-700">{fmt(details.valorisationTotaleAchat)}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-800">{fmt(details.valorisationTotaleVente)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {products.length > 0 && (
                  <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-[11px]">
                    <tr>
                      <td colSpan={6} className="p-2.5 text-right uppercase">Totaux Généraux :</td>
                      <td className="p-2.5 text-right font-mono">{fmt(valuation.totalStockValAchat)}</td>
                      <td className="p-2.5 text-right font-mono text-emerald-800">{fmt(valuation.totalStockValVente)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export default StockSheetModal
