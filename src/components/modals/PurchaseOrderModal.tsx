import React, { useState } from 'react'
import { ShoppingCart, Check, X, Plus } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface PurchaseOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (order: any) => void
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [ref, setRef] = useState('BC-2026-' + Math.floor(1000 + Math.random() * 9000))
  const [supplier, setSupplier] = useState('SOBEBRA SA')
  const [productName, setProductName] = useState('Riz Parfumé 50kg')
  const [qty, setQty] = useState(20)
  const [unitPrice, setUnitPrice] = useState(22000)

  const total = qty * unitPrice

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName || qty <= 0) {
      alert('Veuillez renseigner les articles du bon de commande.')
      return
    }
    const order = {
      id: ref,
      date: new Date().toISOString().slice(0, 10),
      supplier,
      productName,
      qtyUcd: qty,
      unitPriceUcd: unitPrice,
      total,
      status: 'Commandé'
    }
    if (onSuccess) onSuccess(order)
    alert(`✅ Bon de Commande ${ref} créé avec succès !\n\n- Fournisseur : ${supplier}\n- Montant Total : ${total} FCFA\n\nPrêt pour la réception du Bon de Livraison (BL).`)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-purchase-order" zIndex={60}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-indigo-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">+ Nouveau Bon de Commande Fournisseur (BC)</h3>
              <p className="text-[10px] text-indigo-300">Achats & Approvisionnements en Unités de Conditionnement (UCD)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">N° Bon de Commande *</label>
              <input
                type="text"
                required
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Fournisseur Partenaire *</label>
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="SOBEBRA SA">SOBEBRA SA (Cotonou)</option>
                <option value="IMPORT-EXPORT BÉNIN SARL">IMPORT-EXPORT BÉNIN SARL</option>
                <option value="AGRO-DISTRIB BÉNIN">AGRO-DISTRIB BÉNIN</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900">Articles à Commander</h4>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className="block font-bold text-slate-700 mb-1">Article (UCD) *</label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex: Sac Riz 50kg"
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
              <div className="col-span-3">
                <label className="block font-bold text-slate-700 mb-1">Quantité *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>
              <div className="col-span-3">
                <label className="block font-bold text-slate-700 mb-1">Prix UCD (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center justify-between">
            <span className="font-bold text-indigo-900 text-xs">Total Général Bon de Commande :</span>
            <span className="font-black text-indigo-900 font-mono text-base">{total.toLocaleString('fr-FR')} FCFA</span>
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
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Valider le Bon de Commande</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default PurchaseOrderModal
