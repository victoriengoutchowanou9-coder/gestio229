import React, { useState } from 'react'
import { PackagePlus, X, Check } from 'lucide-react'
import ModalPortal from './ModalPortal'

interface NewProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (product: any) => void
}

export const NewProductModal: React.FC<NewProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    code: 'ART-' + Math.floor(1000 + Math.random() * 9000),
    name: '',
    category: 'Alimentation & Boissons',
    ucd: 'Carton',
    packaging: '20 kg',
    uv: 'Kg',
    coef: 20,
    priceAchatUcd: 15000,
    priceVenteUcd: 18000,
    priceVenteUv: 1000,
  })

  const priceAchat = Number(form.priceAchatUcd) || 0
  const coef = Number(form.coef) || 1
  const costUv = coef > 0 ? Math.round(priceAchat / coef) : 0
  const marginUcd = (Number(form.priceVenteUcd) || 0) - priceAchat
  const marginUv = (Number(form.priceVenteUv) || 0) - costUv

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code || !form.name) {
      alert('Veuillez renseigner au minimum le code et la désignation.')
      return
    }
    const newProd = {
      ...form,
      id: 'prod_' + Date.now(),
      stockMagasin: 0,
      stockVente: 0,
      costUv,
      marginUcd,
      marginUv
    }
    if (onSuccess) onSuccess(newProd)
    alert(`✅ Produit "${form.name}" créé avec succès !`)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-new-product" zIndex={60}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">+ Nouveau Produit (Norme UCD / UV)</h3>
              <p className="text-[10px] text-slate-400">10 champs obligatoires pour la gestion multi-unités</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>1. Identification Générale</span>
            </h4>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Code / Réf *</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold uppercase"
                />
              </div>
              <div className="col-span-8">
                <label className="block font-bold text-slate-700 mb-1">Désignation Complète *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Riz Parfumé Long Grain"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
              <div className="col-span-12">
                <label className="block font-bold text-slate-700 mb-1">Catégorie *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                >
                  <option value="Alimentation & Boissons">Alimentation & Boissons</option>
                  <option value="Matériaux & BTP">Matériaux & BTP</option>
                  <option value="Textile & Confection">Textile & Confection</option>
                  <option value="Électronique & Équipements">Électronique & Équipements</option>
                  <option value="Divers & Prestations">Divers & Prestations</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 space-y-3">
            <h4 className="font-bold text-indigo-900 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              <span>2. Multi-Unités (UCD Stockage & UV Détail)</span>
            </h4>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Unité Stock (UCD) *</label>
                <input
                  type="text"
                  value={form.ucd}
                  onChange={(e) => setForm({ ...form, ucd: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Conditionnement *</label>
                <input
                  type="text"
                  value={form.packaging}
                  onChange={(e) => setForm({ ...form, packaging: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Unité Vente (UV) *</label>
                <input
                  type="text"
                  value={form.uv}
                  onChange={(e) => setForm({ ...form, uv: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
              <div className="col-span-12">
                <label className="block font-bold text-slate-700 mb-1">Coefficient de Conversion (1 UCD = X UV) *</label>
                <input
                  type="number"
                  min="1"
                  value={form.coef}
                  onChange={(e) => setForm({ ...form, coef: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono"
                />
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 space-y-3">
            <h4 className="font-bold text-emerald-900 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>3. Grille Tarifaire & Marges (FCFA)</span>
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prix Achat UCD *</label>
                <input
                  type="number"
                  value={form.priceAchatUcd}
                  onChange={(e) => setForm({ ...form, priceAchatUcd: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prix Vente Gros (UCD) *</label>
                <input
                  type="number"
                  value={form.priceVenteUcd}
                  onChange={(e) => setForm({ ...form, priceVenteUcd: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prix Vente Détail (UV) *</label>
                <input
                  type="number"
                  value={form.priceVenteUv}
                  onChange={(e) => setForm({ ...form, priceVenteUv: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono"
                />
              </div>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-emerald-200 flex justify-between text-[11px] font-mono">
              <span className="text-slate-600">Coût calculé : <strong className="text-slate-900">{costUv} FCFA/{form.uv}</strong></span>
              <span className="text-indigo-700 font-bold">Marge Gros : +{marginUcd} FCFA</span>
              <span className="text-emerald-700 font-bold">Marge Détail : +{marginUv} FCFA</span>
            </div>
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
              <span>Enregistrer le Produit</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default NewProductModal
