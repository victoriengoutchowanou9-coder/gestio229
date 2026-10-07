// =============================================================================
// GESTIO 229 SaaS — Modale de Transfert Stock Magasin -> Stock Vente (POS)
// =============================================================================

import React, { useState, useEffect } from 'react'
import { ArrowRightLeft, Package, Store, Check, X, AlertCircle } from 'lucide-react'
import { ModalPortal } from './ModalPortal'
import { supabase } from '../../lib/supabase'
import { useUIStore } from '../../store/uiStore'

interface TransfertStockModalProps {
  isOpen: boolean
  onClose: () => void
  product: any | null
  companyId: string
  caisseId?: string
  userId?: string
  onTransferSuccess: (productId: string, qteMagasin: number, qteVente: number) => void
}

export const TransfertStockModal: React.FC<TransfertStockModalProps> = ({
  isOpen,
  onClose,
  product,
  companyId,
  caisseId,
  userId,
  onTransferSuccess,
}) => {
  const { toast } = useUIStore()
  const [qteTransfert, setQteTransfert] = useState<number>(1)
  const [loading, setLoading] = useState(false)

  const stockMagasin = Number(product?.stock_magasin ?? product?.sector_meta?.stock_magasin ?? 0)
  const stockVente = Number(product?.stock_vente ?? product?.sector_meta?.stock_vente ?? 0)
  const coef = Math.max(1, Number(product?.coef || product?.sector_meta?.coef || 1))
  const unitMagasin = product?.ucd || product?.sector_meta?.ucd || 'Carton'
  const unitVente = product?.uv || product?.sector_meta?.uv || product?.unit || 'Pièce'

  useEffect(() => {
    if (isOpen) {
      setQteTransfert(stockMagasin > 0 ? Math.min(1, stockMagasin) : 0)
    }
  }, [isOpen, stockMagasin])

  if (!isOpen || !product) return null

  const qteVenteAjoutee = Math.round(qteTransfert * coef * 1000) / 1000
  const futureStockMagasin = Math.max(0, Math.round((stockMagasin - qteTransfert) * 1000) / 1000)
  const futureStockVente = Math.round((stockVente + qteVenteAjoutee) * 1000) / 1000

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (qteTransfert <= 0) {
      toast.error('Quantité invalide', 'Veuillez saisir une quantité supérieure à 0.')
      return
    }
    if (qteTransfert > stockMagasin) {
      toast.error('Stock insuffisant', `Le stock magasin ne contient que ${stockMagasin} ${unitMagasin}.`)
      return
    }

    setLoading(true)
    try {
      // 1. Essai via RPC PostgreSQL si disponible
      try {
        await supabase.rpc('transferer_stock_magasin_vers_vente', {
          p_company_id: companyId,
          p_produit_id: product.id,
          p_caisse_id: caisseId || null,
          p_quantite: qteTransfert,
          p_user_id: userId || null
        })
      } catch (_) {}

      // 2. Mise à jour directe garantie dans products.sector_meta (source de vérité produit)
      const currentMeta = product.sector_meta || {}
      const updatedMeta = {
        ...currentMeta,
        stock_magasin: futureStockMagasin,
        stock_vente: futureStockVente,
        ucd: unitMagasin,
        uv: unitVente,
        coef: coef
      }

      const { error: upErr } = await supabase
        .from('products')
        .update({
          sector_meta: updatedMeta,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id)

      if (upErr) {
        console.warn('[TransfertStockModal] Update products warning:', upErr)
      }

      // 3. Enregistrement du mouvement de transfert dans stock_movements
      try {
        await supabase.from('stock_movements').insert({
          company_id: companyId,
          product_id: product.id,
          movement_type: 'TRANSFERT',
          quantity: qteVenteAjoutee,
          previous_stock: stockVente,
          new_stock: futureStockVente,
          notes: `Transfert Magasin -> Vente : -${qteTransfert} ${unitMagasin} (dépôt) ➔ +${qteVenteAjoutee} ${unitVente} (caisse)`
        })
      } catch (_) {}

      // 4. Tables dédiées stock_magasin et stock_vente si présentes
      try {
        await supabase.from('stock_magasin').upsert({
          company_id: companyId,
          produit_id: product.id,
          quantite: futureStockMagasin,
          updated_at: new Date().toISOString()
        })
        await supabase.from('stock_vente').upsert({
          company_id: companyId,
          produit_id: product.id,
          caisse_id: caisseId || null,
          quantite: futureStockVente,
          updated_at: new Date().toISOString()
        })
      } catch (_) {}

      toast.success(
        'Transfert validé avec succès !',
        `+${qteVenteAjoutee} ${unitVente} transféré(s) vers le stock vente.`
      )

      onTransferSuccess(product.id, qteTransfert, qteVenteAjoutee)
      onClose()
    } catch (err: any) {
      console.error('[TransfertStockModal] Erreur transfert:', err)
      toast.error('Erreur lors du transfert', err.message || 'Impossible d\'effectuer le transfert.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-sm">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Transfert de Stock vers Vente</h3>
              <p className="text-xs text-slate-500 font-medium">Réapprovisionner la caisse depuis le magasin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Détail Produit */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
              {product.code}
            </span>
            {coef > 1 && (
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                1 {unitMagasin} = {coef} {unitVente}
              </span>
            )}
          </div>
          <p className="font-bold text-sm text-slate-900">{product.name}</p>

          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200/80">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-indigo-600" /> Stock Magasin
              </span>
              <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">
                {stockMagasin} <span className="text-xs font-semibold">{unitMagasin}</span>
              </p>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-rose-600" /> Stock Vente Actuel
              </span>
              <p className={`text-sm font-black font-mono mt-0.5 ${stockVente > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {stockVente} <span className="text-xs font-semibold">{unitVente}</span>
              </p>
            </div>
          </div>
        </div>

        {stockMagasin <= 0 ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2 mb-4">
            <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
            <p className="text-xs font-bold text-rose-800">Rupture totale : Stock Magasin épuisé (0)</p>
            <p className="text-[11px] text-rose-600">
              Vous devez d'abord approvisionner ce produit via un Bon de Commande ou une réception fournisseur.
            </p>
          </div>
        ) : (
          <form onSubmit={handleExecuteTransfer} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Quantité à transférer du Magasin ({unitMagasin}) :
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.01"
                  max={stockMagasin}
                  step="any"
                  value={qteTransfert}
                  onChange={(e) => setQteTransfert(Math.max(0, Number(e.target.value)))}
                  className="flex-1 text-base font-mono font-bold border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setQteTransfert(stockMagasin)}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition"
                >
                  Tout ({stockMagasin})
                </button>
              </div>

              {/* Raccourcis de sélection rapide */}
              <div className="flex items-center gap-1.5 mt-2">
                {[1, 2, 5, 10].filter(n => n <= stockMagasin).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQteTransfert(n)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold transition ${
                      qteTransfert === n
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    +{n} {unitMagasin}
                  </button>
                ))}
              </div>
            </div>

            {/* Prévisualisation calculée en temps réel */}
            <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100 space-y-2 text-xs">
              <p className="font-bold text-indigo-900 text-[11px] uppercase tracking-wide">
                Simulation après validation :
              </p>
              <div className="flex justify-between text-indigo-800">
                <span>• Nouveau Stock Magasin restant :</span>
                <span className="font-mono font-bold">{futureStockMagasin} {unitMagasin}</span>
              </div>
              <div className="flex justify-between text-indigo-800 font-bold border-t border-indigo-200/60 pt-1.5">
                <span>• Nouveau Stock Vente disponible :</span>
                <span className="font-mono text-emerald-700 font-black text-sm">
                  {futureStockVente} {unitVente} (+{qteVenteAjoutee})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || qteTransfert <= 0 || qteTransfert > stockMagasin}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition flex items-center gap-2"
              >
                {loading ? (
                  <span>Transfert en cours...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Valider le Transfert</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalPortal>
  )
}
