// =============================================================================
// GESTIO 229 SaaS — Modale Réception Bon de Livraison Fournisseur (BL)
// Règle B.1 : Seule la quantité réellement reçue alimente le Stock Magasin (UCD)
// Contrôle des écarts de livraison et conformité
// =============================================================================

import React, { useState } from 'react'
import { PackageCheck, Check, X, Printer, AlertTriangle } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { formatFCFA } from '../../utils/tax'

interface ReceiveBlModalProps {
  isOpen: boolean
  onClose: () => void
  po?: any
  onSuccess?: (reception: any) => void
}

export const ReceiveBlModal: React.FC<ReceiveBlModalProps> = ({ isOpen, onClose, po, onSuccess }) => {
  const [blRef, setBlRef] = useState('BL-FOURN-' + Math.floor(1000 + Math.random() * 9000))
  const [receivedQty, setReceivedQty] = useState<number>(po?.qtyOrderedUcd || 1)
  const [conform, setConform] = useState(true)
  const [receptionNotes, setReceptionNotes] = useState('')

  const qtyOrdered = Number(po?.qtyOrderedUcd) || 0
  const ecart = Math.round((receivedQty - qtyOrdered) * 1000) / 1000

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (receivedQty <= 0) {
      alert('La quantité reçue doit être supérieure à 0.')
      return
    }

    if (onSuccess) {
      onSuccess({
        blRef,
        qtyOrdered,
        receivedQty,
        ecart,
        conform,
        notes: receptionNotes,
        poId: po?.id,
        productId: po?.productId,
        productName: po?.productName,
        supplierName: po?.supplierName
      })
    }

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
              <p className="text-[10px] text-emerald-400">Règle B.1 : Seule la quantité reçue entre au Stock Magasin</p>
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
              <p className="font-mono font-black text-slate-900 text-sm">{po?.reference || 'BC-2026'}</p>
              <p className="text-slate-600 text-[11px]">{po?.productName}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-emerald-800 font-bold uppercase">Fournisseur :</span>
              <p className="font-bold text-slate-900">{po?.supplierName || 'Fournisseur'}</p>
              <p className="text-emerald-700 font-mono font-bold">Commandé : {qtyOrdered} {po?.ucdUnit || 'UCD'}</p>
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
              <label className="block font-bold text-slate-700 mb-1">
                Quantité Réellement Reçue ({po?.ucdUnit || 'UCD'}) *
              </label>
              <input
                type="number"
                step="any"
                required
                min="0.001"
                value={receivedQty}
                onChange={(e) => setReceivedQty(Number(e.target.value))}
                className="w-full p-2.5 bg-white border border-emerald-300 focus:ring-2 focus:ring-emerald-500 rounded-xl font-mono font-black text-emerald-800 text-sm text-center"
              />
            </div>
          </div>

          {/* Écart de livraison si présent */}
          {ecart !== 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-[11px]">
                <strong>Attention Écart constaté :</strong> Quantité commandée : {qtyOrdered} vs Quantité reçue : {receivedQty}.
                Écart de <strong>{ecart > 0 ? `+${ecart}` : ecart} {po?.ucdUnit || 'UCD'}</strong>.
                Seule la quantité de <strong>{receivedQty}</strong> sera créditée en Stock Magasin.
              </p>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Observations / Contrôle Qualité</label>
            <input
              type="text"
              placeholder="Ex: Emballage intact, date de péremption vérifiée..."
              value={receptionNotes}
              onChange={(e) => setReceptionNotes(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-xl"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-2">
            <input
              type="checkbox"
              id="chk-conform"
              checked={conform}
              onChange={(e) => setConform(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <label htmlFor="chk-conform" className="font-bold text-slate-800 text-xs cursor-pointer">
              Contrôle de conformité visuel validé
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
              <span>Valider Entrée Stock Magasin</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default ReceiveBlModal
