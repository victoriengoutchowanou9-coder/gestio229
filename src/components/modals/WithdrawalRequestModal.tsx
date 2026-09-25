import React, { useState } from 'react'
import { ArrowUpRight, Check, X } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface WithdrawalRequestModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (req: any) => void
}

export const WithdrawalRequestModal: React.FC<WithdrawalRequestModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [type, setType] = useState('Espèces')
  const [amount, setAmount] = useState(25000)
  const [reason, setReason] = useState('Versement en banque')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || amount <= 0) {
      alert('Veuillez entrer un montant valide.')
      return
    }
    if (onSuccess) onSuccess({ type, amount, reason })
    alert(`✅ Demande de retrait de ${amount} FCFA (${type}) enregistrée avec succès !`)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-withdrawal" zIndex={60}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">📤 Demande de Retrait de Caisse</h3>
              <p className="text-[10px] text-slate-400">Transfert Caisse POS vers Trésorerie Centrale</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Canal de retrait *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('Espèces')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${type === 'Espèces' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
              >
                💵 Espèces (Tiroir)
              </button>
              <button
                type="button"
                onClick={() => setType('MoMo')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${type === 'MoMo' ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
              >
                📱 Mobile Money (MoMo)
              </button>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Montant à retirer (FCFA) *</label>
            <input
              type="number"
              required
              min="100"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Motif du retrait *</label>
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
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Confirmer le Retrait</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default WithdrawalRequestModal
