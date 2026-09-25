import React, { useState } from 'react'
import { PackageCheck, Check, X } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface ReceiveBlModalProps {
  isOpen: boolean
  onClose: () => void
  po?: any
  onSuccess?: (reception: any) => void
}

export const ReceiveBlModal: React.FC<ReceiveBlModalProps> = ({ isOpen, onClose, po, onSuccess }) => {
  const [blRef, setBlRef] = useState('BL-FOURN-' + Math.floor(1000 + Math.random() * 9000))
  const [receivedQty, setReceivedQty] = useState(po?.qtyUcd || 20)
  const [conform, setConform] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (onSuccess) onSuccess({ blRef, receivedQty, conform, poId: po?.id })
    alert(`✅ Réception BL confirmée !\n\n- BL Fournisseur : ${blRef}\n- Quantité réceptionnée : ${receivedQty} UCD\n\nLe stock Magasin a été incrémenté avec succès.`)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-receive-bl" zIndex={60}>
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
              <PackageCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">📦 Réceptionner Bon de Livraison (BL)</h3>
              <p className="text-[10px] text-emerald-400">Contrôle de conformité et intégration en Stock Magasin (UCD)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-emerald-800 font-bold uppercase">Bon de Commande Lié :</span>
              <p className="font-mono font-black text-slate-900 text-sm">{po?.id || 'BC-2026-0012'}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-emerald-800 font-bold uppercase">Fournisseur :</span>
              <p className="font-bold text-slate-900">{po?.supplier || 'SOBEBRA SA'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">N° BL Papier Fournisseur *</label>
              <input
                type="text"
                required
                value={blRef}
                onChange={(e) => setBlRef(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Quantité UCD Reçue *</label>
              <input
                type="number"
                required
                min="1"
                value={receivedQty}
                onChange={(e) => setReceivedQty(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-2">
            <input
              type="checkbox"
              id="chk-conform"
              checked={conform}
              onChange={(e) => setConform(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            <label htmlFor="chk-conform" className="font-bold text-slate-800 text-xs cursor-pointer">
              Marchandise vérifiée et 100% conforme à la commande
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Valider la Réception en Stock</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default ReceiveBlModal
