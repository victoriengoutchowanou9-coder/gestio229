import React, { useState } from 'react'
import { ShieldAlert, Check, X } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface AdjustFundsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (funds: any) => void
}

export const AdjustFundsModal: React.FC<AdjustFundsModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [cash, setCash] = useState(50000)
  const [momo, setMomo] = useState(100000)
  const [reason, setReason] = useState('Dotation initiale de fond de caisse')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (onSuccess) onSuccess({ cash, momo, reason })
    alert(`✅ Fond de caisse ajusté avec succès !\n\n- Espèces : ${cash} FCFA\n- MoMo : ${momo} FCFA`)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-adjust-funds" zIndex={60}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">⚙️ Ajuster Fonds Initial (Admin)</h3>
              <p className="text-[10px] text-amber-300">Réservé Administrateur / Gérant</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
            <p className="text-amber-900 font-medium">
              Cette action modifie le solde initial d'ouverture de caisse et recalcule automatiquement les écarts de trésorerie.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Fond Caisse Espèces (FCFA) *</label>
            <input
              type="number"
              required
              value={cash}
              onChange={(e) => setCash(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Fond Mobile Money MoMo (FCFA) *</label>
            <input
              type="number"
              required
              value={momo}
              onChange={(e) => setMomo(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Motif de l'ajustement *</label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
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
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Valider l'Ajustement</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default AdjustFundsModal
