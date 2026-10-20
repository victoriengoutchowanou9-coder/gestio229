import React, { useState } from 'react'
import { ArrowDownRight, Check, X } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { showModal } from './CustomModalGestio'

interface TreasuryDisbursementModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (disb: {
    source: string
    amount: number
    beneficiary: string
    reason: string
    paymentMethod: string
    dateTime: string
    reference: string
    approbateur?: string
  }) => void
}

export const TreasuryDisbursementModal: React.FC<TreasuryDisbursementModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [source, setSource] = useState('especes')
  const [amount, setAmount] = useState<number | ''>('')
  const [beneficiary, setBeneficiary] = useState('')
  const [reason, setReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Espèces')
  const [dateTime, setDateTime] = useState(() => new Date().toISOString().slice(0, 16))
  const [reference, setReference] = useState(() => `DEC-${Date.now().toString().slice(-6)}`)
  const [approbateur, setApprobateur] = useState('')

  const handleSourceChange = (newSource: string) => {
    setSource(newSource)
    if (newSource === 'especes') setPaymentMethod('Espèces')
    else if (newSource === 'momo') setPaymentMethod('Mobile Money')
    else if (newSource === 'banque') setPaymentMethod('Virement Bancaire')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const numAmt = Number(amount)
    if (!numAmt || numAmt <= 0 || !beneficiary.trim() || !reason.trim()) {
      showModal({
        type: 'warning',
        title: 'Champs requis',
        message: 'Veuillez renseigner le montant, le bénéficiaire et le motif du décaissement.',
        domaine: 'www.gestio229.com',
      })
      return
    }

    if (onSuccess) {
      onSuccess({
        source,
        amount: numAmt,
        beneficiary: beneficiary.trim(),
        reason: reason.trim(),
        paymentMethod,
        dateTime,
        reference: reference.trim() || `DEC-${Date.now().toString().slice(-6)}`,
        approbateur: approbateur.trim() || undefined,
      })
    }

    await showModal({
      type: 'success',
      title: 'Décaissement validé',
      message: `Décaissement de ${numAmt.toLocaleString('fr-FR')} FCFA vers "${beneficiary.trim()}" validé avec succès !`,
      domaine: 'www.gestio229.com',
    })

    // Reset fields
    setAmount('')
    setBeneficiary('')
    setReason('')
    setReference(`DEC-${Date.now().toString().slice(-6)}`)
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
              <h3 className="font-extrabold text-sm text-white">💸 Nouveau Décaissement de Trésorerie</h3>
              <p className="text-[10px] text-slate-400">Sortie d'argent effective avec traçabilité complète</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Compte Source Débité *</label>
              <select
                value={source}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="especes">💵 Coffre-Fort (Espèces)</option>
                <option value="momo">📱 Compte MoMo Marchands</option>
                <option value="banque">🏦 Compte Bancaire</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Mode de Règlement *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="Espèces">Espèces</option>
                <option value="Mobile Money">Mobile Money (MTN / Moov)</option>
                <option value="Virement Bancaire">Virement Bancaire</option>
                <option value="Chèque">Chèque</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Montant Décaissé (FCFA) *</label>
              <input
                type="number"
                required
                min="100"
                placeholder="Ex: 25000"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Date et Heure *</label>
              <input
                type="datetime-local"
                required
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Bénéficiaire ou Service Destinataire *</label>
              <input
                type="text"
                required
                placeholder="Ex: Fournisseur, Prestataire, Service Technique"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Référence Opération *</label>
              <input
                type="text"
                required
                placeholder="Ex: N° Pièce / N° Chèque"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Motif du Décaissement *</label>
            <textarea
              required
              rows={2}
              placeholder="Ex: Règlement facture d'électricité, achat fournitures bureau..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Approbateur (Si requis / Autorisation)</label>
            <input
              type="text"
              placeholder="Ex: Direction Générale / Responsable Financier"
              value={approbateur}
              onChange={(e) => setApprobateur(e.target.value)}
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
              <span>Confirmer le Décaissement</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default TreasuryDisbursementModal
