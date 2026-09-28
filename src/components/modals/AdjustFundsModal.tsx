import React, { useState } from 'react'
import { ShieldAlert, Check, X } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface AdjustFundsModalProps {
  isOpen: boolean
  onClose: () => void
  currentCash?: number
  currentMomo?: number
  onSuccess?: (funds: {
    cash: number
    momo: number
    reason: string
    diffCash: number
    diffMomo: number
  }) => void
}

export const AdjustFundsModal: React.FC<AdjustFundsModalProps> = ({
  isOpen,
  onClose,
  currentCash = 0,
  currentMomo = 0,
  onSuccess
}) => {
  const [cash, setCash] = useState<number>(currentCash)
  const [momo, setMomo] = useState<number>(currentMomo)
  const [reason, setReason] = useState('')

  // Mettre à jour si les props changent
  React.useEffect(() => {
    setCash(currentCash)
    setMomo(currentMomo)
  }, [currentCash, currentMomo])

  const diffCash = cash - currentCash
  const diffMomo = momo - currentMomo

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return
    if (onSuccess) {
      onSuccess({
        cash,
        momo,
        reason: reason.trim(),
        diffCash,
        diffMomo
      })
    }
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
              <h3 className="font-extrabold text-sm text-white">⚙️ Ajustement de Caisse (Audit Traçable)</h3>
              <p className="text-[10px] text-amber-300">Réservé Administrateur / Gérant</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
            <p className="text-amber-900 font-medium leading-relaxed">
              Tout ajustement est consigné dans l'historique d'audit avec l'ancienne valeur, la nouvelle valeur, la différence et le motif obligatoire.
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-bold text-slate-700">Fond Actuel Espèces (FCFA) *</label>
              <span className="text-[11px] text-slate-500">Actuel : <strong>{currentCash.toLocaleString('fr-BJ')} FCFA</strong></span>
            </div>
            <input
              type="number"
              required
              value={cash}
              onChange={(e) => setCash(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
            />
            {diffCash !== 0 && (
              <p className={`text-[11px] font-bold mt-1 font-mono ${diffCash > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                Différence : {diffCash > 0 ? '+' : ''}{diffCash.toLocaleString('fr-BJ')} FCFA
              </p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-bold text-slate-700">Fond Actuel Mobile Money (FCFA) *</label>
              <span className="text-[11px] text-slate-500">Actuel : <strong>{currentMomo.toLocaleString('fr-BJ')} FCFA</strong></span>
            </div>
            <input
              type="number"
              required
              value={momo}
              onChange={(e) => setMomo(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
            />
            {diffMomo !== 0 && (
              <p className={`text-[11px] font-bold mt-1 font-mono ${diffMomo > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                Différence : {diffMomo > 0 ? '+' : ''}{diffMomo.toLocaleString('fr-BJ')} FCFA
              </p>
            )}
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Motif obligatoire de l'ajustement *</label>
            <textarea
              required
              rows={2}
              placeholder="Ex : Correction solde tiroir suite à comptage physique"
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
