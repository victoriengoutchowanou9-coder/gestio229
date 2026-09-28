// =============================================================================
// GESTIO 229 SaaS — Modale Nouveau Produit (Norme UCD / UV & Fiscalité Bénin)
// Saisie obligatoire des prix en TTC avec décomposition automatique HT, TVA & AIB
// Calcul des marges sur base HT, multi-unités et quantités décimales
// =============================================================================

import React, { useState, useMemo } from 'react'
import { PackagePlus, X, Check, Calculator, ShieldCheck, Info } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { calculateTaxFromTTC, calculateMargin, formatFCFA } from '../../utils/tax'

interface NewProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (product: any) => void
}

// Unités UCD (Stockage / Gros)
export const UCD_UNITS = [
  'Carton', 'Sac', 'Bidon', 'Boîte', 'Caisse', 'Fût',
  'Rouleau', 'Bobine', 'Pelote', 'Mètre', 'Centimètre',
  'Sachet', 'Lot', 'Gramme', 'Tonne', 'Pièce'
]

// Unités UV (Vente / Détail)
export const UV_UNITS = [
  'Pièce', 'Kg', 'Litre', 'Mètre', 'Centimètre', 'm²',
  'Pelote', 'Douzaine', 'Sachet', 'Gramme', 'Portion'
]

export const NewProductModal: React.FC<NewProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    code: 'ART-' + Math.floor(1000 + Math.random() * 9000),
    name: '',
    category: 'Alimentation & Boissons',
    ucd: 'Carton',
    packaging: 'Standard',
    uv: 'Pièce',
    coef: 1,
    // Prix saisis DIRECTEMENT en TTC
    priceAchatUcdTtc: 10000,
    priceVenteUcdTtc: 14000,
    priceVenteUvTtc: 14000,
    // Stocks initiaux
    stockMagasinInitial: 0,
    stockVenteInitial: 0,
    lotNumber: '',
    // Fiscalité
    isVatSubject: true,
    vatRate: 18,
    isAibSubject: false,
    aibRate: 1,
  })

  // Décomposition fiscale automatique
  const taxAchat = useMemo(() => {
    return calculateTaxFromTTC(
      form.priceAchatUcdTtc,
      form.isVatSubject,
      form.vatRate,
      form.isAibSubject,
      form.aibRate
    )
  }, [form.priceAchatUcdTtc, form.isVatSubject, form.vatRate, form.isAibSubject, form.aibRate])

  const taxVenteUcd = useMemo(() => {
    return calculateTaxFromTTC(
      form.priceVenteUcdTtc,
      form.isVatSubject,
      form.vatRate,
      form.isAibSubject,
      form.aibRate
    )
  }, [form.priceVenteUcdTtc, form.isVatSubject, form.vatRate, form.isAibSubject, form.aibRate])

  const taxVenteUv = useMemo(() => {
    return calculateTaxFromTTC(
      form.priceVenteUvTtc,
      form.isVatSubject,
      form.vatRate,
      form.isAibSubject,
      form.aibRate
    )
  }, [form.priceVenteUvTtc, form.isVatSubject, form.vatRate, form.isAibSubject, form.aibRate])

  // Marges calculées rigoureusement sur base HT
  const coef = Number(form.coef) > 0 ? Number(form.coef) : 1
  const costUvHt = coef > 0 ? Math.round((taxAchat.htPrice / coef) * 100) / 100 : 0
  const marginUcdHt = Math.round((taxVenteUcd.htPrice - taxAchat.htPrice) * 100) / 100
  const marginUvHt = Math.round((taxVenteUv.htPrice - costUvHt) * 100) / 100

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code || !form.name) {
      alert('Veuillez renseigner au minimum le code et la désignation.')
      return
    }

    const newProd = {
      id: 'prod_' + Date.now(),
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category,
      unit: form.uv,
      ucd: form.ucd,
      packaging: form.packaging,
      uv: form.uv,
      coef: form.coef,
      // Prix TTC enregistrés
      cost_price: form.priceAchatUcdTtc,
      selling_price: form.priceVenteUvTtc,
      price_achat_ucd_ttc: form.priceAchatUcdTtc,
      price_vente_ucd_ttc: form.priceVenteUcdTtc,
      price_vente_uv_ttc: form.priceVenteUvTtc,
      // Valeurs HT calculées
      price_achat_ht: taxAchat.htPrice,
      price_vente_ht: taxVenteUv.htPrice,
      // Fiscalité
      is_vat_subject: form.isVatSubject,
      vat_rate: form.isVatSubject ? form.vatRate : 0,
      is_aib_subject: form.isAibSubject,
      aib_rate: form.isAibSubject ? form.aibRate : 0,
      // Stocks
      stock_magasin: Number(form.stockMagasinInitial) || 0,
      stock_vente: Number(form.stockVenteInitial) || 0,
      lot_number: form.lotNumber,
      // Marges HT
      margin_ucd_ht: marginUcdHt,
      margin_uv_ht: marginUvHt,
    }

    if (onSuccess) onSuccess(newProd)
    alert(`✅ Produit "${form.name}" créé avec succès !`)
    onClose()
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-new-product" zIndex={60}>
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* En-tête */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">+ Nouveau Produit (Norme UCD / UV & Fiscalité Bénin)</h3>
              <p className="text-[10px] text-slate-400">Saisie TTC obligatoire avec décomposition fiscale HT & Marges</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Avertissement fiscal */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-900">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Règle Fiscale GESTIO 229 :</strong> Les prix doivent être renseignés en <strong>TTC</strong>. Le système calcule automatiquement le montant HT et la TVA selon le paramétrage fiscal du produit. L'AIB est calculé exclusivement sur le montant HT.
            </p>
          </div>

          {/* SECTION 1: IDENTIFICATION */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>1. Identification Générale & Traçabilité</span>
            </h4>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Code / Référence *</label>
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
                  placeholder="Ex: Tissu Coton Imprimé 50m"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
              <div className="col-span-6">
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
                  <option value="Santé & Cosmétique">Santé & Cosmétique</option>
                  <option value="Divers & Prestations">Divers & Prestations</option>
                </select>
              </div>
              <div className="col-span-6">
                <label className="block font-bold text-slate-700 mb-1">N° de Lot / Traçabilité</label>
                <input
                  type="text"
                  placeholder="Optionnel (ex: LOT-2026-A1)"
                  value={form.lotNumber}
                  onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: MULTI-UNITÉS UCD -> UV */}
          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 space-y-3">
            <h4 className="font-bold text-indigo-900 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              <span>2. Multi-Unités (UCD Stockage & UV Détail)</span>
            </h4>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Unité Stock (UCD) *</label>
                <select
                  value={form.ucd}
                  onChange={(e) => setForm({ ...form, ucd: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                >
                  {UCD_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Conditionnement *</label>
                <input
                  type="text"
                  placeholder="Ex: 25 mètres, 50 kg"
                  value={form.packaging}
                  onChange={(e) => setForm({ ...form, packaging: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div className="col-span-4">
                <label className="block font-bold text-slate-700 mb-1">Unité Vente (UV) *</label>
                <select
                  value={form.uv}
                  onChange={(e) => setForm({ ...form, uv: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                >
                  {UV_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12">
                <label className="block font-bold text-slate-700 mb-1">
                  Coefficient de Conversion (1 {form.ucd} = X {form.uv}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={form.coef}
                  onChange={(e) => setForm({ ...form, coef: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono text-indigo-700"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Exemple : 1 Rouleau = 25 Mètres | 1 Carton = 20 Kg | 1 Boîte = 10 Douzaines
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: FISCALITÉ PRODUIT (TVA & AIB BÉNIN) */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 space-y-3">
            <h4 className="font-bold text-amber-900 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>3. Fiscalité Produit (TVA & AIB - République du Bénin)</span>
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chk-vat"
                    checked={form.isVatSubject}
                    onChange={(e) => setForm({ ...form, isVatSubject: e.target.checked })}
                    className="w-4 h-4 accent-amber-600 cursor-pointer"
                  />
                  <label htmlFor="chk-vat" className="font-bold text-slate-800 cursor-pointer">
                    Soumis à la TVA (18%)
                  </label>
                </div>
                {form.isVatSubject && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-slate-600">Taux TVA :</span>
                    <input
                      type="number"
                      value={form.vatRate}
                      onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
                      className="w-16 p-1 text-center font-bold border border-slate-300 rounded font-mono"
                    />
                    <span className="font-bold">%</span>
                  </div>
                )}
                {!form.isVatSubject && (
                  <p className="text-[10px] text-slate-400">Produit exonéré de TVA (TTC = HT)</p>
                )}
              </div>

              <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chk-aib"
                    checked={form.isAibSubject}
                    onChange={(e) => setForm({ ...form, isAibSubject: e.target.checked })}
                    className="w-4 h-4 accent-amber-600 cursor-pointer"
                  />
                  <label htmlFor="chk-aib" className="font-bold text-slate-800 cursor-pointer">
                    Soumis à l'AIB (Calculé sur le HT)
                  </label>
                </div>
                {form.isAibSubject && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-slate-600">Taux AIB :</span>
                    <input
                      type="number"
                      step="0.5"
                      value={form.aibRate}
                      onChange={(e) => setForm({ ...form, aibRate: Number(e.target.value) })}
                      className="w-16 p-1 text-center font-bold border border-slate-300 rounded font-mono"
                    />
                    <span className="font-bold">%</span>
                  </div>
                )}
                {!form.isAibSubject && (
                  <p className="text-[10px] text-slate-400">Non soumis à l'acompte AIB</p>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4: GRILLE TARIFAIRE TTC & MARGES FISCALES */}
          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 space-y-3">
            <h4 className="font-bold text-emerald-900 flex items-center space-x-1.5">
              <Calculator className="w-4 h-4 text-emerald-600" />
              <span>4. Prix de Vente & d'Achat (Saisie Directe en TTC)</span>
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prix Achat UCD (TTC) *</label>
                <input
                  type="number"
                  value={form.priceAchatUcdTtc}
                  onChange={(e) => setForm({ ...form, priceAchatUcdTtc: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Équivalent HT : <strong>{formatFCFA(taxAchat.htPrice)}</strong>
                  {form.isVatSubject && <span> | TVA : {formatFCFA(taxAchat.vatAmount)}</span>}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Prix Vente Gros UCD (TTC) *</label>
                <input
                  type="number"
                  value={form.priceVenteUcdTtc}
                  onChange={(e) => setForm({ ...form, priceVenteUcdTtc: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Équivalent HT : <strong>{formatFCFA(taxVenteUcd.htPrice)}</strong>
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Prix Vente Détail UV (TTC) *</label>
                <input
                  type="number"
                  value={form.priceVenteUvTtc}
                  onChange={(e) => setForm({ ...form, priceVenteUvTtc: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono text-emerald-700"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Équivalent HT : <strong>{formatFCFA(taxVenteUv.htPrice)}</strong>
                </p>
              </div>
            </div>

            {/* Récapitulatif des Marges sur base HT */}
            <div className="p-3 bg-white rounded-xl border border-emerald-200 flex flex-wrap justify-between items-center text-[11px] font-mono gap-2">
              <span className="text-slate-600">
                Coût Revient Détail HT : <strong className="text-slate-900">{formatFCFA(costUvHt)}/{form.uv}</strong>
              </span>
              <span className="text-indigo-700 font-bold">
                Marge Brute Gros HT : +{formatFCFA(marginUcdHt)}/{form.ucd}
              </span>
              <span className="text-emerald-700 font-bold">
                Marge Brute Détail HT : +{formatFCFA(marginUvHt)}/{form.uv}
              </span>
            </div>
          </div>

          {/* SECTION 5: STOCKS INITIAUX */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-600"></span>
              <span>5. Stocks Initiaux au Démarrage</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Stock Magasin Initial ({form.ucd})
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.stockMagasinInitial}
                  onChange={(e) => setForm({ ...form, stockMagasinInitial: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Stock Vente Initial ({form.uv})
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.stockVenteInitial}
                  onChange={(e) => setForm({ ...form, stockVenteInitial: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold font-mono"
                />
              </div>
            </div>
          </div>

          {/* Boutons d'action */}
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
