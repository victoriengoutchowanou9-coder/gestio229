import React, { useState } from 'react'
import { ArrowDownRight, Check, X } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { showModal } from './CustomModalGestio'

interface TreasuryDisbursementModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (disb: any) => void
}

export const TreasuryDisbursementModal: React.FC<TreasuryDisbursementModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [source, setSource] = useState('especes')
  const [amount, setAmount] = useState(50000)
  const [beneficiary, setBeneficiary] = useState('')
  const [reason, setReason] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || amount <= 0 || !beneficiary) {
      showModal({
        type: 'warning',
        title: 'Champs requis',
        message: 'Veuillez renseigner le montant et le bénéficiaire.',
        domaine: 'www.gestio229.com',
      })
      return
    }
    if (onSuccess) onSuccess({ source, amount, beneficiary, reason })
    await showModal({
      type: 'success',
      title: 'Décaissement validé',
      message: `Décaissement de ${amount.toLocaleString('fr-FR')} FCFA vers "${beneficiary}" validé avec succès !`,
      domaine: 'www.gestio229.com',
    })
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-disbursement" zIndex={60}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white font-bold">
              <ArrowDownRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">💸 Nouveau Décaissement Externe</h3>
              <p className="text-[10px] text-slate-400">Sortie d'argent définitive des comptes de l'entreprise</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Compte Source Débité *</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
            >
              <option value="especes">💵 Caisse Espèces (Tiroir)</option>
              <option value="momo">📱 Compte MoMo Central (MTN / Moov)</option>
              <option value="banque">🏦 Compte Bancaire (Ecobank / BOA)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Montant Décaissement (FCFA) *</label>
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
              <label className="block font-bold text-slate-700 mb-1">Bénéficiaire *</label>
              <input
                type="text"
                required
                placeholder="Ex: Transit Maritime Cotonou"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Motif / Justificatif *</label>
            <textarea
              required
              rows={2}
              placeholder="Ex: Règlement facture fret maritime N° 4587"
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
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Valider le Décaissement</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default TreasuryDisbursementModal
