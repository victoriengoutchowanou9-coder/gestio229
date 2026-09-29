// =============================================================================
// GESTIO 229 SaaS — Modale Réception Bon de Livraison Fournisseur (BL)
// Règle B.1 : Seule la quantité réellement reçue alimente le Stock Magasin (UCD)
// Support multi-articles, contrôle des écarts de livraison et conformité
// =============================================================================

import React, { useState, useEffect } from 'react'
import { PackageCheck, Check, X, AlertTriangle, AlertCircle } from 'lucide-react'
import ModalPortal from './ModalPortal'

export interface BlItemReception {
  productId: string
  productName: string
  ucdUnit: string
  qtyOrdered: number
  receivedQty: number
  ecart: number
}

interface ReceiveBlModalProps {
  isOpen: boolean
  onClose: () => void
  po?: any
  onSuccess?: (reception: any) => void
}

export const ReceiveBlModal: React.FC<ReceiveBlModalProps> = ({ isOpen, onClose, po, onSuccess }) => {
  const [blRef, setBlRef] = useState('')
  const [items, setItems] = useState<BlItemReception[]>([])
  const [conform, setConform] = useState(true)
  const [receptionNotes, setReceptionNotes] = useState('')

  useEffect(() => {
    if (isOpen && po) {
      setBlRef('BL-FOURN-' + Math.floor(1000 + Math.random() * 9000))
      setConform(true)
      setReceptionNotes('')

      if (po.items && Array.isArray(po.items) && po.items.length > 0) {
        setItems(
          po.items.map((it: any) => ({
            productId: it.productId,
            productName: it.productName,
            ucdUnit: it.ucdUnit || 'UCD',
            qtyOrdered: Number(it.qty) || 0,
            receivedQty: Number(it.qty) || 0,
            ecart: 0
          }))
        )
      } else {
        const qOrdered = Number(po.qtyOrderedUcd) || 1
        setItems([
          {
            productId: po.productId || '',
            productName: po.productName || 'Article',
            ucdUnit: po.ucdUnit || 'UCD',
            qtyOrdered: qOrdered,
            receivedQty: qOrdered,
            ecart: 0
          }
        ])
      }
    }
  }, [isOpen, po])

  const handleQtyChange = (index: number, val: number) => {
    setItems((prev) => {
      const next = [...prev]
      const it = { ...next[index] }
      it.receivedQty = val >= 0 ? val : 0
      it.ecart = Math.round((it.receivedQty - it.qtyOrdered) * 1000) / 1000
      next[index] = it
      return next
    })
  }

  const totalOrdered = items.reduce((sum, it) => sum + it.qtyOrdered, 0)
  const totalReceived = items.reduce((sum, it) => sum + it.receivedQty, 0)
  const hasDiscrepancy = items.some((it) => it.ecart !== 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (totalReceived <= 0) {
      alert('Veuillez indiquer au moins une quantité reçue supérieure à 0.')
      return
    }

    if (!blRef.trim()) {
      alert('Veuillez saisir le numéro de BL papier du fournisseur.')
      return
    }

    if (onSuccess) {
      const primaryItem = items[0] || {
        productId: po?.productId,
        productName: po?.productName,
        ucdUnit: po?.ucdUnit || 'UCD',
        qtyOrdered: 0,
        receivedQty: 0,
        ecart: 0
      }

      onSuccess({
        blRef: blRef.trim(),
        conform,
        notes: receptionNotes,
        poId: po?.id,
        supplierName: po?.supplierName,
        // Root fields for single/primary item backward compatibility
        productId: primaryItem.productId,
        productName: items.length > 1 ? `${primaryItem.productName} (+${items.length - 1} autres)` : primaryItem.productName,
        qtyOrdered: totalOrdered,
        receivedQty: totalReceived,
        ecart: Math.round((totalReceived - totalOrdered) * 1000) / 1000,
        // Full array of items for multi-item stock increments
        items: items
      })
    }

    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-receive-bl" zIndex={60}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh]">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
              <PackageCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">📦 Réceptionner Bon de Livraison (BL)</h3>
              <p className="text-[10px] text-emerald-400">Règle B.1 : Seule la quantité reçue entre au Stock Magasin (UCD)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Header BC & Fournisseur */}
          <div className="bg-emerald-50/80 p-3.5 rounded-2xl border border-emerald-200 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider">Bon de Commande :</span>
              <p className="font-mono font-black text-slate-900 text-sm">{po?.reference || 'BC-2026'}</p>
              <p className="text-slate-600 text-[11px]">{items.length} article(s) commandé(s)</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider">Fournisseur :</span>
              <p className="font-bold text-slate-900">{po?.supplierName || 'Fournisseur'}</p>
              <p className="text-emerald-700 font-mono font-bold text-xs">
                Total commandé : {totalOrdered} UCD
              </p>
            </div>
          </div>

          {/* Numéro BL Fournisseur */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              N° Bon de Livraison Papier Fournisseur *
            </label>
            <input
              type="text"
              required
              value={blRef}
              onChange={(e) => setBlRef(e.target.value)}
              placeholder="Ex: BL-2026-9876"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-500 rounded-xl font-mono font-bold text-slate-800 text-xs"
            />
          </div>

          {/* Tableau multi-articles de réception */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-100 p-2.5 font-bold text-slate-700 flex justify-between items-center border-b border-slate-200">
              <span>Articles à réceptionner au Stock Magasin (UCD)</span>
              <span className="text-[10px] text-slate-500 font-mono font-normal">
                Indiquez les quantités physiques reçues
              </span>
            </div>
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] text-slate-600 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Article</th>
                    <th className="p-2.5 text-center">Unité (UCD)</th>
                    <th className="p-2.5 text-center">Qté Commandée</th>
                    <th className="p-2.5 text-center w-32">Qté Reçue</th>
                    <th className="p-2.5 text-center">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {items.map((it, idx) => (
                    <tr key={it.productId || idx} className="hover:bg-slate-50/60">
                      <td className="p-2.5">
                        <span className="font-bold text-slate-800 text-xs block">{it.productName}</span>
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-600">{it.ucdUnit}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-700">{it.qtyOrdered}</td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={it.receivedQty}
                          onChange={(e) => handleQtyChange(idx, Number(e.target.value))}
                          className="w-24 p-1.5 bg-white border border-emerald-300 focus:ring-2 focus:ring-emerald-500 rounded-lg font-mono font-black text-emerald-800 text-center text-xs"
                        />
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold">
                        {it.ecart === 0 ? (
                          <span className="text-slate-400">0</span>
                        ) : it.ecart > 0 ? (
                          <span className="text-emerald-600">+{it.ecart}</span>
                        ) : (
                          <span className="text-rose-600">{it.ecart}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Écart de livraison si présent */}
          {hasDiscrepancy && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Attention Écart constaté :</strong> Des différences existent entre les quantités commandées et les quantités physiques reçues.
                <div className="mt-1 font-mono text-[10px]">
                  Total commandé : <strong>{totalOrdered} UCD</strong> | Total reçu : <strong>{totalReceived} UCD</strong> (Écart net : {totalReceived - totalOrdered}).
                </div>
                <p className="mt-0.5 text-amber-800 font-semibold">
                  Règle B.1 : Seule la quantité réellement reçue ({totalReceived} UCD) sera créditée au Stock Magasin.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Observations / Contrôle Qualité</label>
            <input
              type="text"
              placeholder="Ex: Emballage intact, date de péremption vérifiée, lot conforme..."
              value={receptionNotes}
              onChange={(e) => setReceptionNotes(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-2">
            <input
              type="checkbox"
              id="chk-conform"
              checked={conform}
              onChange={(e) => setConform(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
            />
            <label htmlFor="chk-conform" className="font-bold text-slate-800 text-xs cursor-pointer select-none">
              Contrôle de conformité visuel validé (produits conformes au cahier des charges)
            </label>
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-slate-200">
            <div className="text-xs text-slate-500 font-mono">
              Total à créditer : <strong className="text-emerald-700">{totalReceived} UCD</strong>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Valider Entrée Stock Magasin</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default ReceiveBlModal
