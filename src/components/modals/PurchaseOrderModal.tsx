// =============================================================================
// GESTIO 229 SaaS — Modale Création Bon de Commande (BC)
// Permet de choisir un fournisseur existant ou d'en créer un à la volée,
// sélectionne exclusivement les produits existants, saisie en UCD et prix TTC
// =============================================================================

import React, { useState, useEffect } from 'react'
import { ShoppingCart, Check, X, Plus, UserPlus, Package } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { formatFCFA } from '../../utils/tax'

interface PurchaseOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (order: any) => void
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { company, user } = useAuthStore()

  const [ref, setRef] = useState('BC-2026-' + Math.floor(1000 + Math.random() * 9000))
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [qtyUcd, setQtyUcd] = useState<number>(10)
  const [unitPriceTtc, setUnitPriceTtc] = useState<number>(0)
  const [notes, setNotes] = useState('')
  const [magasinierSigner, setMagasinierSigner] = useState(user?.username || 'Responsable Appro')

  // Mini-formulaire nouveau fournisseur à la volée
  const [showNewSupplierInline, setShowNewSupplierInline] = useState(false)
  const [newSupName, setNewSupName] = useState('')
  const [newSupPhone, setNewSupPhone] = useState('')
  const [newSupCity, setNewSupCity] = useState('Cotonou')

  useEffect(() => {
    if (!company?.id || !isOpen) return

    // Charger fournisseurs et produits réels
    const fetchResources = async () => {
      const [{ data: sData }, { data: pData }] = await Promise.all([
        supabase.from('suppliers').select('id, company_name, phone, city').eq('company_id', company.id).order('company_name'),
        supabase.from('products').select('id, code, name, ucd, unit, cost_price').eq('company_id', company.id).order('name')
      ])

      const mappedSuppliers = (sData || []).map((s: any) => ({
        id: s.id,
        name: s.company_name || s.name,
        company_name: s.company_name || s.name,
        phone: s.phone,
        city: s.city
      }))

      setSuppliers(mappedSuppliers)
      setProducts(pData || [])

      if (mappedSuppliers.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(mappedSuppliers[0].id)
      }
      if (pData && pData.length > 0 && !selectedProductId) {
        setSelectedProductId(pData[0].id)
        setUnitPriceTtc(pData[0].cost_price || 0)
      }
    }

    fetchResources()
  }, [company?.id, isOpen])

  // Quand le produit change, pré-remplir le prix d'achat
  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId)
    const p = products.find((x) => x.id === prodId)
    if (p) {
      setUnitPriceTtc(p.cost_price || 0)
    }
  }

  // Création fournisseur à la volée
  const handleCreateSupplierInline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id || !newSupName.trim()) return

    try {
      const autoCode = `FOURN-${String(suppliers.length + 1).padStart(3, '0')}`
      const { data, error } = await supabase.from('suppliers').insert({
        company_id: company.id,
        code: autoCode,
        company_name: newSupName.trim(),
        phone: newSupPhone.trim(),
        city: newSupCity.trim(),
        current_payable: 0,
        is_active: true
      }).select().single()

      if (error) throw error

      const mapped = {
        ...data,
        name: data.company_name || newSupName.trim()
      }
      setSuppliers([...suppliers, mapped])
      setSelectedSupplierId(mapped.id)
      setShowNewSupplierInline(false)
      setNewSupName('')
      setNewSupPhone('')
    } catch (err: any) {
      alert('Erreur création fournisseur : ' + err.message)
    }
  }

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId)
  const selectedProduct = products.find((p) => p.id === selectedProductId)
  const totalTtc = Math.round(qtyUcd * unitPriceTtc)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId || !selectedProductId || qtyUcd <= 0) {
      alert('Veuillez renseigner le fournisseur, le produit et une quantité valide.')
      return
    }

    const order = {
      id: `po-${Date.now()}`,
      reference: ref,
      date: new Date().toISOString(),
      supplierId: selectedSupplierId,
      supplierName: selectedSupplier?.name || 'Fournisseur',
      productId: selectedProductId,
      productName: selectedProduct?.name || 'Produit',
      productCode: selectedProduct?.code || 'ART',
      ucdUnit: selectedProduct?.ucd || selectedProduct?.unit || 'UCD',
      qtyOrderedUcd: qtyUcd,
      unitPriceUcd: unitPriceTtc,
      totalTtc,
      status: 'BROUILLON', // Statut initial : Brouillon -> À valider -> Validé -> Commandé -> Réceptionné
      notes,
      signatures: {
        magasinier: magasinierSigner,
        gerant: ''
      }
    }

    if (onSuccess) onSuccess(order)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-purchase-order" zIndex={60}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-indigo-950 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">+ Nouveau Bon de Commande Fournisseur (BC)</h3>
              <p className="text-[10px] text-indigo-300">Produits existants uniquement, UCD de stockage et prix TTC</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
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
              <div className="flex justify-between items-center mb-1">
                <label className="font-bold text-slate-700">Fournisseur Partenaire *</label>
                <button
                  type="button"
                  onClick={() => setShowNewSupplierInline(!showNewSupplierInline)}
                  className="text-emerald-700 font-bold hover:underline flex items-center gap-0.5 text-[11px]"
                >
                  <Plus className="w-3 h-3" /> Nouveau Fournisseur
                </button>
              </div>

              {showNewSupplierInline ? (
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2 mb-2">
                  <p className="font-bold text-emerald-900 text-[11px]">Création rapide d'un fournisseur</p>
                  <input
                    type="text"
                    placeholder="Nom du fournisseur *"
                    value={newSupName}
                    onChange={(e) => setNewSupName(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white font-semibold"
                  />
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="Téléphone"
                      value={newSupPhone}
                      onChange={(e) => setNewSupPhone(e.target.value)}
                      className="w-1/2 p-1.5 border border-slate-200 rounded text-xs bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Ville"
                      value={newSupCity}
                      onChange={(e) => setNewSupCity(e.target.value)}
                      className="w-1/2 p-1.5 border border-slate-200 rounded text-xs bg-white"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowNewSupplierInline(false)}
                      className="px-2 py-1 text-[10px] text-slate-600 bg-white border border-slate-200 rounded"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateSupplierInline}
                      className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-600 rounded hover:bg-emerald-700"
                    >
                      Enregistrer Fournisseur
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {suppliers.length === 0 ? (
                    <option value="">Aucun fournisseur (cliquez sur + Nouveau)</option>
                  ) : (
                    suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.city || 'Bénin'})
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>
          </div>

          {/* Sélection Produit Existant */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>Article à Commander (Catalogue Réel Existant)</span>
            </h4>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className="block font-bold text-slate-700 mb-1">Produit *</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                >
                  {products.length === 0 ? (
                    <option value="">Aucun produit en stock</option>
                  ) : (
                    products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.name} ({p.ucd || p.unit})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="col-span-3">
                <label className="block font-bold text-slate-700 mb-1">
                  Quantité ({selectedProduct?.ucd || selectedProduct?.unit || 'UCD'}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={qtyUcd}
                  onChange={(e) => setQtyUcd(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono text-center"
                />
              </div>

              <div className="col-span-3">
                <label className="block font-bold text-slate-700 mb-1">Prix Achat TTC (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={unitPriceTtc}
                  onChange={(e) => setUnitPriceTtc(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono text-right"
                />
              </div>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center font-mono">
              <span className="text-indigo-900 font-bold">MONTANT TOTAL DU BON DE COMMANDE :</span>
              <span className="text-base font-black text-indigo-950">{formatFCFA(totalTtc)}</span>
            </div>
          </div>

          {/* Visa & Signatures */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Signature Demandeur / Magasinier *</label>
              <input
                type="text"
                required
                value={magasinierSigner}
                onChange={(e) => setMagasinierSigner(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Circuit de Validation</label>
              <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-medium">
                Statut initial : <strong>Brouillon (À soumettre pour visa Gérant)</strong>
              </p>
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
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Créer le Bon de Commande</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default PurchaseOrderModal
