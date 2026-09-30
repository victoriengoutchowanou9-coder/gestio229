// =============================================================================
// GESTIO 229 SaaS — Modale Création Bon de Commande Multi-Produits (BC)
// Permet de choisir un fournisseur existant ou d'en créer un à la volée,
// sélection multi-produits du catalogue, saisie des quantités en UCD et prix TTC
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import { ShoppingCart, Check, X, Plus, Package, Search } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { formatFCFA } from '../../utils/tax'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../lib/sectorClient'
import clsx from 'clsx'

interface PurchaseOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (order: any) => void
}

interface OrderItemRow {
  productId: string
  code: string
  name: string
  ucdUnit: string
  currentStock: number
  qtyToOrder: number
  unitPriceTtc: number
  selected: boolean
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { company, user } = useAuthStore()

  const [ref, setRef] = useState('BC-2026-' + Math.floor(1000 + Math.random() * 9000))
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [orderRows, setOrderRows] = useState<Record<string, OrderItemRow>>({})
  const [productSearch, setProductSearch] = useState('')
  const [notes, setNotes] = useState('')
  const [magasinierSigner, setMagasinierSigner] = useState(user?.username || 'Responsable Appro')

  // Mini-formulaire nouveau fournisseur à la volée
  const [showNewSupplierInline, setShowNewSupplierInline] = useState(false)
  const [newSupName, setNewSupName] = useState('')
  const [newSupPhone, setNewSupPhone] = useState('')
  const [newSupCity, setNewSupCity] = useState('Cotonou')

  useEffect(() => {
    if (!company?.id || !isOpen) return

    const fetchResources = async () => {
      const activeSector = getActiveSectorSlug()
      const [{ data: sData }, { data: pData }] = await Promise.all([
        supabase.from('suppliers').select('id, company_name, phone, city, sector_slug, sector_meta').eq('company_id', company.id).order('company_name'),
        supabase.from('products').select('id, code, name, unit, cost_price, stock_magasin, sector_slug, sector_meta').eq('company_id', company.id).order('name')
      ])

      const filteredSData = filterItemsForSector(sData || [], activeSector)
      const filteredPData = filterItemsForSector(pData || [], activeSector)

      const mappedSuppliers = filteredSData.map((s: any) => ({
        id: s.id,
        name: s.company_name || s.name,
        company_name: s.company_name || s.name,
        phone: s.phone,
        city: s.city
      }))

      const mappedProducts = filteredPData.map((p: any) => ({
        ...p,
        ucd: p.ucd || p.sector_meta?.ucd || 'Carton',
        unit: p.unit || p.sector_meta?.uv || 'Pièce',
        cost_price: Number(p.cost_price) || 0,
        stock_magasin: Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0)
      }))

      setSuppliers(mappedSuppliers)
      setProducts(mappedProducts)

      if (mappedSuppliers.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(mappedSuppliers[0].id)
      }

      // Initialiser la map des lignes de commande
      const rowsMap: Record<string, OrderItemRow> = {}
      mappedProducts.forEach((p: any, idx: number) => {
        rowsMap[p.id] = {
          productId: p.id,
          code: p.code,
          name: p.name,
          ucdUnit: p.ucd || 'Carton',
          currentStock: p.stock_magasin,
          qtyToOrder: idx === 0 ? 5 : 0,
          unitPriceTtc: p.cost_price || 0,
          selected: idx === 0
        }
      })
      setOrderRows(rowsMap)
    }

    fetchResources()
  }, [company?.id, isOpen])

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

  // Filtrer les produits affichés dans le tableau
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products
    const s = productSearch.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s))
  }, [products, productSearch])

  // Liste des lignes sélectionnées avec quantité > 0
  const activeOrderItems = useMemo(() => {
    return Object.values(orderRows).filter((row) => row.selected && row.qtyToOrder > 0)
  }, [orderRows])

  const totalBcTtc = useMemo(() => {
    return activeOrderItems.reduce((acc, it) => acc + (it.qtyToOrder * it.unitPriceTtc), 0)
  }, [activeOrderItems])

  const handleToggleProduct = (prodId: string) => {
    setOrderRows((prev) => {
      const existing = prev[prodId]
      if (!existing) return prev
      const newSel = !existing.selected
      return {
        ...prev,
        [prodId]: {
          ...existing,
          selected: newSel,
          qtyToOrder: newSel && existing.qtyToOrder <= 0 ? 1 : existing.qtyToOrder
        }
      }
    })
  }

  const handleQtyChange = (prodId: string, qty: number) => {
    setOrderRows((prev) => {
      const existing = prev[prodId]
      if (!existing) return prev
      const val = Math.max(0, qty)
      return {
        ...prev,
        [prodId]: {
          ...existing,
          qtyToOrder: val,
          selected: val > 0 ? true : existing.selected
        }
      }
    })
  }

  const handlePriceChange = (prodId: string, price: number) => {
    setOrderRows((prev) => {
      const existing = prev[prodId]
      if (!existing) return prev
      return {
        ...prev,
        [prodId]: {
          ...existing,
          unitPriceTtc: Math.max(0, price)
        }
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId) {
      alert('Veuillez sélectionner un fournisseur.')
      return
    }

    if (activeOrderItems.length === 0) {
      alert('Veuillez sélectionner au moins un produit avec une quantité supérieure à 0.')
      return
    }

    const orderItems = activeOrderItems.map((it) => ({
      productId: it.productId,
      productName: it.name,
      productCode: it.code,
      ucdUnit: it.ucdUnit,
      qtyOrderedUcd: it.qtyToOrder,
      unitPriceUcd: it.unitPriceTtc,
      totalTtc: Math.round(it.qtyToOrder * it.unitPriceTtc)
    }))

    const first = orderItems[0]

    const order = {
      id: `po-${Date.now()}`,
      reference: ref,
      date: new Date().toISOString(),
      supplierId: selectedSupplierId,
      supplierName: selectedSupplier?.name || 'Fournisseur',
      sector_slug: getActiveSectorSlug(),
      totalTtc: totalBcTtc,
      items: orderItems,
      // Champs de compatibilité racine pour premier article
      productId: first.productId,
      productName: orderItems.length === 1 ? first.productName : `${first.productName} (+${orderItems.length - 1} autre(s))`,
      productCode: first.productCode,
      ucdUnit: first.ucdUnit,
      qtyOrderedUcd: orderItems.reduce((acc, it) => acc + it.qtyOrderedUcd, 0),
      unitPriceUcd: first.unitPriceUcd,
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
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh]">
        <div className="bg-indigo-950 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">+ Nouveau Bon de Commande Fournisseur Multi-Produits (BC)</h3>
              <p className="text-[10px] text-indigo-300">Sélectionnez les articles du catalogue, saisissez les quantités en UCD et tarifs TTC</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">N° Bon de Commande *</label>
              <input
                type="text"
                required
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
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
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
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

          {/* TABLEAU MULTI-PRODUITS DU CATALOGUE */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <Package className="w-4 h-4 text-indigo-600" />
                <span>Sélection des Articles à Commander ({activeOrderItems.length} sélectionné(s))</span>
              </h4>
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Filtrer un produit..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1 border border-slate-200 rounded-lg text-xs bg-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 text-center w-8">Choix</th>
                    <th className="p-2">Réf</th>
                    <th className="p-2">Désignation</th>
                    <th className="p-2 text-center">Unité (UCD)</th>
                    <th className="p-2 text-center text-slate-500">Stock Magasin</th>
                    <th className="p-2 text-center w-28 bg-indigo-50/70 text-indigo-900">Qté à Commander</th>
                    <th className="p-2 text-right w-28">Prix Achat TTC</th>
                    <th className="p-2 text-right w-28 font-bold">Total Ligne</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredProducts.map((p) => {
                    const row = orderRows[p.id] || {
                      productId: p.id,
                      code: p.code,
                      name: p.name,
                      ucdUnit: p.ucd || 'Carton',
                      currentStock: p.stock_magasin,
                      qtyToOrder: 0,
                      unitPriceTtc: p.cost_price || 0,
                      selected: false
                    }
                    const lineTotal = Math.round(row.qtyToOrder * row.unitPriceTtc)

                    return (
                      <tr key={p.id} className={clsx('hover:bg-slate-50/80 transition', row.selected && 'bg-indigo-50/30')}>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleToggleProduct(p.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 font-bold text-slate-900">{p.code}</td>
                        <td className="p-2 font-sans font-medium text-slate-800">{p.name}</td>
                        <td className="p-2 text-center font-sans text-slate-600">{p.ucd || 'Carton'}</td>
                        <td className="p-2 text-center text-slate-500">{p.stock_magasin}</td>
                        <td className="p-1.5 text-center bg-indigo-50/30">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.qtyToOrder || ''}
                            onChange={(e) => handleQtyChange(p.id, Number(e.target.value))}
                            placeholder="0"
                            className="w-20 p-1 text-center font-bold font-mono border border-indigo-200 rounded text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="p-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            value={row.unitPriceTtc || ''}
                            onChange={(e) => handlePriceChange(p.id, Number(e.target.value))}
                            className="w-24 p-1 text-right font-mono border border-slate-200 rounded text-xs bg-white"
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-indigo-900">
                          {formatFCFA(lineTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center font-mono">
              <span className="text-indigo-900 font-bold">MONTANT TOTAL DU BON DE COMMANDE ({activeOrderItems.length} article(s)) :</span>
              <span className="text-base font-black text-indigo-950">{formatFCFA(totalBcTtc)}</span>
            </div>
          </div>

          {/* Visa & Circuit de Validation */}
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
              disabled={activeOrderItems.length === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Créer le Bon de Commande ({activeOrderItems.length} articles)</span>
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default PurchaseOrderModal
