import React, { useState } from 'react'
import { FileText, Printer, X, Download } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface StockSheetModalProps {
  isOpen: boolean
  onClose: () => void
  products?: any[]
}

export const StockSheetModal: React.FC<StockSheetModalProps> = ({ isOpen, onClose, products = [] }) => {
  const [selectedProduct, setSelectedProduct] = useState('all')

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
                  Double Valorisation Actif
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 my-3">
              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-indigo-700 font-bold uppercase">Stock Magasin (UCD)</span>
                <p className="text-lg font-black text-slate-900 font-mono">145 UCD</p>
                <span className="text-[10px] text-slate-500">Valeur Achat : 2.175.000 FCFA</span>
              </div>
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                <span className="text-[10px] text-emerald-700 font-bold uppercase">Stock Vente Rayon (UV)</span>
                <p className="text-lg font-black text-slate-900 font-mono">680 UV</p>
                <span className="text-[10px] text-slate-500">Valeur Vente : 1.020.000 FCFA</span>
              </div>
              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                <span className="text-[10px] text-amber-700 font-bold uppercase">Marge Brute Potentielle</span>
                <p className="text-lg font-black text-amber-900 font-mono">+485.000 FCFA</p>
                <span className="text-[10px] text-slate-500">Taux moyen : +28.5%</span>
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
                    <th className="p-2.5 text-right">Prix Achat</th>
                    <th className="p-2.5 text-right">Prix Vente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">RIZ-001</td>
                    <td className="p-2.5 font-sans">Riz Parfumé 50kg (Sac)</td>
                    <td className="p-2.5 text-center">45 Sacs</td>
                    <td className="p-2.5 text-center">120 Kg</td>
                    <td className="p-2.5 text-right">24.500 FCFA</td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">28.000 FCFA</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">HUI-002</td>
                    <td className="p-2.5 font-sans">Huile Végétale 20L (Bidon)</td>
                    <td className="p-2.5 text-center">30 Bidons</td>
                    <td className="p-2.5 text-center">85 Litres</td>
                    <td className="p-2.5 text-right">18.000 FCFA</td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">21.500 FCFA</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export default StockSheetModal
