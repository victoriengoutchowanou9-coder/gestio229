// =============================================================================
// GESTIO 229 SaaS — Modale Nouveau Produit (Norme UCD / UV & Fiscalité Bénin)
// Saisie obligatoire des prix en TTC avec décomposition automatique HT, TVA & AIB
// Calcul des marges sur base HT, multi-unités et quantités décimales
// Ajout CDC : Vente par lot (optionnel) et sous-modale de tarification par fractions
// =============================================================================

import React, { useState, useMemo } from 'react'
import {
  PackagePlus, X, Check, Calculator, ShieldCheck, Info,
  Settings, Layers, HelpCircle
} from 'lucide-react'
import ModalPortal from './ModalPortal'
import { calculateTaxFromTTC, formatFCFA } from '../../utils/tax'
import {
  BatchPricingConfig,
  formatUvQty,
  getBatchTiersList
} from '../../utils/batchPricing'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

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
  const { company, activeSectorSlug, activeActivityId, activeActivityName } = useAuthStore()
  const currentSectorSlug = activeSectorSlug || company?.activity_sector || 'boutique'

  // Formulaire Produit sans valeurs fictives (vides ou 0 réels)
  const [form, setForm] = useState({
    code: '', // Vide au départ, généré automatiquement à l'enregistrement si non saisi
    name: '',
    category: 'Alimentation & Boissons',
    ucd: 'Carton',
    packaging: 'Standard',
    uv: 'Pièce',
    coef: 1,
    // Prix saisis DIRECTEMENT en TTC
    priceAchatUcdTtc: 0,
    priceVenteUcdTtc: 0,
    priceVenteUvTtc: 0,
    // Stocks initiaux : vides par défaut (string vide pour ne pas afficher artificiellement 0)
    stockMagasinInitial: '',
    stockVenteInitial: '',
    lotNumber: '',
    // Fiscalité
    isVatSubject: true,
    vatRate: 18,
    isAibSubject: false,
    aibRate: 1,
    // Option Vente par lot (désactivée par défaut)
    isBatchPricing: false,
    batchPricing: {
      enabled: false,
      coef: 1,
      price_half_ucd_ttc: 0,
      price_third_ucd_ttc: 0,
      price_quarter_ucd_ttc: 0,
      price_sixth_ucd_ttc: 0,
      price_eighth_ucd_ttc: 0,
      price_twelfth_ucd_ttc: 0,
      price_sixteenth_ucd_ttc: 0,
      price_ucd_ttc: 0,
      price_uv_ttc: 0,
    } as BatchPricingConfig,
  })

  // Sous-modale "Paramétrage des tarifs par lot"
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedProduct, setLastSavedProduct] = useState<{ code: string; name: string } | null>(null)

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

  // Paliers de lots générés dynamiquement selon le coefficient (le x est remplacé en temps réel)
  const batchTiers = useMemo(() => {
    return getBatchTiersList(form.coef, form.batchPricing)
  }, [form.coef, form.batchPricing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.name.trim()) {
      alert('Veuillez renseigner la désignation du produit.')
      return
    }

    if (!company?.id) {
      alert('Erreur : Session d\'entreprise introuvable. Veuillez vous reconnecter.')
      return
    }

    setIsSaving(true)

    try {
      // 1. Détermination du code produit (automatique si non saisi)
      let finalCode = form.code.trim().toUpperCase()

      if (!finalCode) {
        // Logique de codification automatique de l'entreprise
        const { data: existingProds, error: fetchCodesErr } = await supabase
          .from('products')
          .select('code')
          .eq('company_id', company.id)

        if (fetchCodesErr) {
          console.warn('Erreur vérification codes existants:', fetchCodesErr)
        }

        const codes = (existingProds || []).map((p: any) => (p.code || '').trim().toUpperCase())

        let maxNum = 0
        let detectedPrefix = 'PRD-'

        codes.forEach((c: string) => {
          const prdMatch = c.match(/^PRD-(\d+)$/)
          if (prdMatch) {
            const n = parseInt(prdMatch[1], 10)
            if (!isNaN(n) && n > maxNum) {
              maxNum = n
              detectedPrefix = 'PRD-'
            }
          } else {
            const artMatch = c.match(/^ART-(\d+)$/)
            if (artMatch) {
              const n = parseInt(artMatch[1], 10)
              if (!isNaN(n) && n > maxNum) {
                maxNum = n
                detectedPrefix = 'ART-'
              }
            }
          }
        })

        let candidateNum = maxNum + 1
        let candidateCode = `${detectedPrefix}${String(candidateNum).padStart(3, '0')}`
        while (codes.includes(candidateCode)) {
          candidateNum++
          candidateCode = `${detectedPrefix}${String(candidateNum).padStart(3, '0')}`
        }
        finalCode = candidateCode
      } else {
        // Vérification de l'unicité du code dans l'entreprise connectée (isolation stricte)
        const { data: duplicate } = await supabase
          .from('products')
          .select('id, code')
          .eq('company_id', company.id)
          .ilike('code', finalCode)
          .maybeSingle()

        if (duplicate) {
          alert(`❌ Le code "${finalCode}" est déjà utilisé par un autre produit de votre entreprise. Veuillez le modifier ou laisser le champ vide pour le générer automatiquement.`)
          setIsSaving(false)
          return
        }
      }

      // 2. Gestion technique des stocks initiaux
      const hasMagasinInput = String(form.stockMagasinInitial).trim() !== ''
      const hasVenteInput = String(form.stockVenteInitial).trim() !== ''
      const parsedMagasin = hasMagasinInput ? Math.max(0, Number(form.stockMagasinInitial)) : 0
      const parsedVente = hasVenteInput ? Math.max(0, Number(form.stockVenteInitial)) : 0

      const finalBatchConfig: BatchPricingConfig | null = form.isBatchPricing
        ? {
            ...form.batchPricing,
            enabled: true,
            coef: form.coef,
            price_ucd_ttc: form.batchPricing.price_ucd_ttc || form.priceVenteUcdTtc,
            price_uv_ttc: form.batchPricing.price_uv_ttc || form.priceVenteUvTtc,
          }
        : null

      const sectorMeta = {
        s: currentSectorSlug,
        sector_slug: currentSectorSlug,
        act: activeActivityId,
        ucd: form.ucd,
        packaging: form.packaging,
        uv: form.uv,
        coef: form.coef,
        stock_magasin: parsedMagasin,
        stock_vente: parsedVente,
        has_initial_stock_magasin: hasMagasinInput,
        has_initial_stock_vente: hasVenteInput,
        batch_pricing: finalBatchConfig,
        lot_number: form.lotNumber,
        is_aib_subject: form.isAibSubject,
        aib_rate: form.isAibSubject ? form.aibRate : 0,
        price_achat_ucd_ttc: form.priceAchatUcdTtc,
        price_vente_ucd_ttc: form.priceVenteUcdTtc,
        price_vente_uv_ttc: form.priceVenteUvTtc,
        price_achat_ht: taxAchat.htPrice,
        price_vente_ht: taxVenteUv.htPrice,
        margin_ucd_ht: marginUcdHt,
        margin_uv_ht: marginUvHt,
      }

      // 3. Préparation du payload pour Supabase
      const insertPayload: any = {
        company_id: company.id,
        sector_slug: currentSectorSlug,
        code: finalCode,
        name: form.name.trim(),
        unit: form.uv,
        cost_price: form.priceAchatUcdTtc,
        selling_price: form.priceVenteUvTtc,
        wholesale_price: form.priceVenteUcdTtc,
        is_taxable: form.isVatSubject,
        tva_rate: form.isVatSubject ? form.vatRate : 0,
        min_stock_alert: 5,
        sector_meta: sectorMeta,
        is_active: true,
        stock_magasin: parsedMagasin,
        stock_vente: parsedVente,
      }

      let res = await supabase.from('products').insert(insertPayload).select().single()

      // Si les colonnes stock_magasin/stock_vente ne sont pas présentes en colonne directe SQL
      if (res.error && res.error.code === 'PGRST204') {
        delete insertPayload.stock_magasin
        delete insertPayload.stock_vente
        res = await supabase.from('products').insert(insertPayload).select().single()
      }

      // 4. Contrôle strict des erreurs (zéro erreur silencieuse)
      if (res.error || !res.data) {
        console.error('[NewProductModal] Échec Supabase insert:', res.error)
        alert(`❌ Erreur lors de l'enregistrement dans la base de données :\n\n${res.error?.message || 'Erreur inconnue'}\n\nLe produit n'a pas été enregistré.`)
        setIsSaving(false)
        return
      }

      const savedProduct = {
        ...res.data,
        stock_magasin: parsedMagasin,
        stock_vente: parsedVente,
        ucd: form.ucd,
        uv: form.uv,
        coef: form.coef,
      }

      setIsSaving(false)
      if (onSuccess) onSuccess(savedProduct)

      // Traçabilité Audit automatique
      try {
        const { logAuditEvent } = await import('../../services/auditService')
        await logAuditEvent({
          companyId: company.id,
          module: 'Stocks',
          action: 'CREATION_PRODUIT',
          description: `Création du produit [${finalCode}] "${form.name.trim()}" - Magasin: ${parsedMagasin} ${form.ucd}, Vente: ${parsedVente} ${form.uv}`,
          entityName: 'products',
          entityId: res.data?.id
        })
      } catch (e) {}

      // Confirmation et réinitialisation pour saisie en série sans forcer la fermeture
      setLastSavedProduct({ code: finalCode, name: form.name.trim() })
      setForm({
        code: '',
        name: '',
        category: form.category,
        ucd: form.ucd,
        packaging: form.packaging,
        uv: form.uv,
        coef: form.coef,
        priceAchatUcdTtc: 0,
        priceVenteUcdTtc: 0,
        priceVenteUvTtc: 0,
        stockMagasinInitial: '',
        stockVenteInitial: '',
        lotNumber: '',
        isVatSubject: true,
        vatRate: 18,
        isAibSubject: false,
        aibRate: 1,
        isBatchPricing: false,
        batchPricing: {
          enabled: false,
          coef: form.coef,
          price_half_ucd_ttc: 0,
          price_third_ucd_ttc: 0,
          price_quarter_ucd_ttc: 0,
          price_sixth_ucd_ttc: 0,
          price_eighth_ucd_ttc: 0,
          price_twelfth_ucd_ttc: 0,
          price_sixteenth_ucd_ttc: 0,
          price_ucd_ttc: 0,
          price_uv_ttc: 0,
        }
      })
    } catch (err: any) {
      console.error('[NewProductModal] Exception handleSubmit:', err)
      alert(`❌ Erreur inattendue : ${err?.message || 'Vérifiez votre connexion internet.'}`)
      setIsSaving(false)
    }
  }

  return (
    <>
      <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-new-product" zIndex={60}>
        <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
          {/* En-tête */}
          <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
                <PackagePlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">+ Nouveau Produit (Norme UCD / UV & Fiscalité Bénin)</h3>
                <p className="text-[10px] text-slate-400">Saisie TTC avec calculs automatiques HT, TVA, Marges et Tarifs par Lot</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
            {/* Bannière de confirmation de saisie en série */}
            {lastSavedProduct && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-400 dark:border-emerald-600 rounded-2xl flex items-center justify-between text-emerald-900 dark:text-emerald-100 shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                    ✓
                  </div>
                  <div>
                    <p className="font-extrabold text-xs">
                      Produit [{lastSavedProduct.code}] "{lastSavedProduct.name}" enregistré avec succès !
                    </p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                      Disponible immédiatement dans Stocks et POS. Vous pouvez saisir directement le produit suivant ou cliquer sur « Terminer & Fermer ».
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLastSavedProduct(null)}
                  className="px-2 py-1 text-xs text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 font-bold bg-emerald-100 dark:bg-emerald-900/40 rounded-lg transition"
                >
                  Fermer l'alerte
                </button>
              </div>
            )}
            {/* Avertissement fiscal */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-2.5 text-emerald-900 dark:text-emerald-200">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                <strong>Règle Fiscale GESTIO 229 :</strong> Les prix doivent être renseignés en <strong>TTC</strong>. Le système calcule automatiquement le montant HT et la TVA selon le paramétrage fiscal du produit. L'AIB est calculé exclusivement sur le montant HT.
              </p>
            </div>

            {/* SECTION 1: IDENTIFICATION */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>1. Identification Générale & Traçabilité</span>
              </h4>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Code / Référence <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">(Auto si vide)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Généré automatiquement (ex: PRD-001)"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold uppercase text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal placeholder:italic placeholder:text-[11px]"
                  />
                </div>
                <div className="col-span-8">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Désignation Complète *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Tissu Coton Imprimé 50m"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-6">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Catégorie *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100"
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
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">N° de Lot / Traçabilité</label>
                  <input
                    type="text"
                    placeholder="Optionnel (ex: LOT-2026-A1)"
                    value={form.lotNumber}
                    onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: MULTI-UNITÉS UCD -> UV (Le x se remplace dynamiquement par le coef) */}
            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 space-y-3">
              <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                <span>2. Multi-Unités (UCD Stockage & UV Détail)</span>
              </h4>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Unité Stock (UCD) *</label>
                  <select
                    value={form.ucd}
                    onChange={(e) => setForm({ ...form, ucd: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100"
                  >
                    {UCD_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Conditionnement *</label>
                  <input
                    type="text"
                    placeholder="Ex: 25 mètres, 50 kg"
                    value={form.packaging}
                    onChange={(e) => setForm({ ...form, packaging: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Unité Vente (UV) *</label>
                  <select
                    value={form.uv}
                    onChange={(e) => setForm({ ...form, uv: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100"
                  >
                    {UV_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Coefficient de Conversion (1 {form.ucd} = {form.coef > 0 ? form.coef : 'x'} {form.uv}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    value={form.coef}
                    onChange={(e) => {
                      const newCoef = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        coef: newCoef,
                        batchPricing: {
                          ...prev.batchPricing,
                          coef: newCoef,
                        }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-indigo-700 dark:text-indigo-400"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Exemple : 1 Rouleau = 25 Mètres | 1 Carton = 20 Kg | 1 Boîte = 10 Douzaines
                  </p>
                </div>
              </div>
            </div>

            {/* SECTION 3: FISCALITÉ PRODUIT (TVA & AIB BÉNIN) */}
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-3">
              <h4 className="font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>3. Fiscalité Produit (TVA & AIB - République du Bénin)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="chk-vat"
                      checked={form.isVatSubject}
                      onChange={(e) => setForm({ ...form, isVatSubject: e.target.checked })}
                      className="w-4 h-4 accent-amber-600 cursor-pointer"
                    />
                    <label htmlFor="chk-vat" className="font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                      Soumis à la TVA (18%)
                    </label>
                  </div>
                  {form.isVatSubject && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-slate-600 dark:text-slate-400">Taux TVA :</span>
                      <input
                        type="number"
                        value={form.vatRate}
                        onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
                        className="w-16 p-1 text-center font-bold border border-slate-300 dark:border-slate-600 rounded font-mono bg-white dark:bg-slate-800"
                      />
                      <span className="font-bold">%</span>
                    </div>
                  )}
                  {!form.isVatSubject && (
                    <p className="text-[10px] text-slate-400">Produit exonéré de TVA (TTC = HT)</p>
                  )}
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="chk-aib"
                      checked={form.isAibSubject}
                      onChange={(e) => setForm({ ...form, isAibSubject: e.target.checked })}
                      className="w-4 h-4 accent-amber-600 cursor-pointer"
                    />
                    <label htmlFor="chk-aib" className="font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                      Soumis à l'AIB (Calculé sur le HT)
                    </label>
                  </div>
                  {form.isAibSubject && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-slate-600 dark:text-slate-400">Taux AIB :</span>
                      <input
                        type="number"
                        step="0.5"
                        value={form.aibRate}
                        onChange={(e) => setForm({ ...form, aibRate: Number(e.target.value) })}
                        className="w-16 p-1 text-center font-bold border border-slate-300 dark:border-slate-600 rounded font-mono bg-white dark:bg-slate-800"
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
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-3">
              <h4 className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center space-x-1.5">
                <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>4. Prix de Vente & d'Achat (Saisie Directe en TTC)</span>
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Prix Achat UCD (TTC) *</label>
                  <input
                    type="number"
                    value={form.priceAchatUcdTtc || ''}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, priceAchatUcdTtc: Number(e.target.value) })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Équivalent HT : <strong>{formatFCFA(taxAchat.htPrice)}</strong>
                    {form.isVatSubject && <span> | TVA : {formatFCFA(taxAchat.vatAmount)}</span>}
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Prix Vente Gros UCD (TTC) *</label>
                  <input
                    type="number"
                    value={form.priceVenteUcdTtc || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        priceVenteUcdTtc: val,
                        batchPricing: {
                          ...prev.batchPricing,
                          price_ucd_ttc: prev.batchPricing.price_ucd_ttc || val
                        }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Équivalent HT : <strong>{formatFCFA(taxVenteUcd.htPrice)}</strong>
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Prix Vente Détail UV (TTC) *</label>
                  <input
                    type="number"
                    value={form.priceVenteUvTtc || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        priceVenteUvTtc: val,
                        batchPricing: {
                          ...prev.batchPricing,
                          price_uv_ttc: prev.batchPricing.price_uv_ttc || val
                        }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-emerald-700 dark:text-emerald-400"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Équivalent HT : <strong>{formatFCFA(taxVenteUv.htPrice)}</strong>
                  </p>
                </div>
              </div>

              {/* Récapitulatif des Marges sur base HT */}
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800 flex flex-wrap justify-between items-center text-[11px] font-mono gap-2">
                <span className="text-slate-600 dark:text-slate-400">
                  Coût Revient Détail HT : <strong className="text-slate-900 dark:text-slate-100">{formatFCFA(costUvHt)}/{form.uv}</strong>
                </span>
                <span className="text-indigo-700 dark:text-indigo-400 font-bold">
                  Marge Brute Gros HT : +{formatFCFA(marginUcdHt)}/{form.ucd}
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  Marge Brute Détail HT : +{formatFCFA(marginUvHt)}/{form.uv}
                </span>
              </div>
            </div>

            {/* SECTION CDC : VENTE PAR LOT (OPTIONNEL) */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isBatchPricing}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setForm((prev) => ({
                        ...prev,
                        isBatchPricing: checked,
                        batchPricing: {
                          ...prev.batchPricing,
                          enabled: checked,
                          coef: prev.coef,
                          price_ucd_ttc: prev.batchPricing.price_ucd_ttc || prev.priceVenteUcdTtc,
                          price_uv_ttc: prev.batchPricing.price_uv_ttc || prev.priceVenteUvTtc,
                        }
                      }))
                      if (checked) {
                        setShowBatchModal(true)
                      }
                    }}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    Vente par lot (optionnel)
                  </span>
                </label>

                {form.isBatchPricing && (
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(true)}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>⚙️ Configurer / Modifier</span>
                  </button>
                )}
              </div>
            </div>

            {/* SECTION 5: STOCKS INITIAUX */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  <span>5. Stocks Initiaux au Démarrage (Optionnel)</span>
                </h4>
                <span className="text-[10px] text-slate-400 font-medium italic">
                  Laisser vide si aucun stock initial
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Stock Magasin Initial ({form.ucd})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Non renseigné (vide)"
                    value={form.stockMagasinInitial}
                    onChange={(e) => setForm({ ...form, stockMagasinInitial: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal placeholder:italic placeholder:text-[11px]"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {form.stockMagasinInitial === '' 
                      ? 'Aucune quantité renseignée' 
                      : `Quantité saisie : ${form.stockMagasinInitial} ${form.ucd}`}
                  </span>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Stock Vente Initial ({form.uv})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Non renseigné (vide)"
                    value={form.stockVenteInitial}
                    onChange={(e) => setForm({ ...form, stockVenteInitial: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal placeholder:italic placeholder:text-[11px]"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {form.stockVenteInitial === '' 
                      ? 'Aucune quantité renseignée' 
                      : `Quantité saisie : ${form.stockVenteInitial} ${form.uv}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="pt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Terminer & Fermer
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-1.5 transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Enregistrement en cours...' : 'Enregistrer ce Produit (+)'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* ── SOUS-MODALE : PARAMÉTRAGE DES TARIFS PAR LOT (TTC) ────────────────── */}
      {showBatchModal && (
        <ModalPortal isOpen={showBatchModal} onClose={() => setShowBatchModal(false)} id="modal-batch-pricing" zIndex={70}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
            {/* Header Sous-modale */}
            <div className="bg-gradient-to-r from-emerald-800 to-slate-900 text-white p-4 flex items-center justify-between border-b border-emerald-900/50">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Paramétrage des tarifs par lot</h3>
                  <p className="text-[10px] text-emerald-200">
                    Saisie des prix de vente dégressifs (en TTC). Les fractions définissent les quantités UV correspondantes.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="text-slate-300 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Coefficient UCD/UV & Rappel du mécanisme */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-emerald-950 dark:text-emerald-100 text-xs flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Coefficient UCD/UV (1 {form.ucd} = {form.coef > 0 ? form.coef : 'x'} {form.uv}) :</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    value={form.coef}
                    onChange={(e) => {
                      const newC = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        coef: newC,
                        batchPricing: { ...prev.batchPricing, coef: newC }
                      }))
                    }}
                    className="w-24 p-1.5 text-center font-black font-mono bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-emerald-800 dark:text-emerald-300"
                  />
                </div>
                <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                  Le coefficient détermine le nombre d'unités de vente (UV) par unité de stock (UCD). Les fractions ci-dessous ne seront <strong>jamais affichées comme quantités</strong> à la caisse : elles calculent directement les quantités UV correspondantes.
                </p>
              </div>

              {/* Grille des 9 Tarifs par Lot (Tous en TTC) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Prix Vente 1/2 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/2 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 2) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_half_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_half_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 2. Prix Vente 1/3 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/3 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 3) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_third_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_third_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 3. Prix Vente 1/4 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/4 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 4) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_quarter_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_quarter_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 4. Prix Vente 1/6 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/6 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 6) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_sixth_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_sixth_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 5. Prix Vente 1/8 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/8 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 8) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_eighth_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_eighth_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 6. Prix Vente 1/12 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/12 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 12) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_twelfth_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_twelfth_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 7. Prix Vente 1/16 UCD TTC */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200">Prix Vente 1/16 UCD TTC</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? formatUvQty(form.coef / 16) : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.batchPricing.price_sixteenth_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_sixteenth_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 8. Prix Vente UCD TTC (Gros entier) */}
                <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-indigo-900 dark:text-indigo-200">Prix Vente UCD TTC (1 {form.ucd})</label>
                    <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-100 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded">
                      soit {form.coef > 0 ? form.coef : 'x'} {form.uv}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder={String(form.priceVenteUcdTtc || 0)}
                    value={form.batchPricing.price_ucd_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_ucd_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-lg font-bold font-mono text-indigo-900 dark:text-indigo-200"
                  />
                </div>

                {/* 9. Prix Vente UV TTC (Détail de base) */}
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 md:col-span-2">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="font-bold text-emerald-900 dark:text-emerald-200">Prix Vente UV TTC (Base Détail - 1 {form.uv})</label>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      appliqué si aucune fraction ne correspond
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder={String(form.priceVenteUvTtc || 0)}
                    value={form.batchPricing.price_uv_ttc || ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setForm((prev) => ({
                        ...prev,
                        batchPricing: { ...prev.batchPricing, price_uv_ttc: v }
                      }))
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg font-bold font-mono text-emerald-900 dark:text-emerald-200"
                  />
                </div>
              </div>

              {/* Note explicative de la sous-modale */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-2 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                <HelpCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p>
                  <strong>Fonctionnement à la Caisse :</strong> La caissière saisit directement la quantité en UV ({form.uv}). Si la quantité correspond à l'un des tarifs ci-dessus, le prix TTC préenregistré est appliqué automatiquement. Sinon, le système applique <em>Quantité UV × Prix Vente UV TTC</em>.
                </p>
              </div>
            </div>

            {/* Footer Sous-modale */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    isBatchPricing: true,
                    batchPricing: {
                      ...prev.batchPricing,
                      enabled: true,
                      coef: prev.coef,
                      price_ucd_ttc: prev.batchPricing.price_ucd_ttc || prev.priceVenteUcdTtc,
                      price_uv_ttc: prev.batchPricing.price_uv_ttc || prev.priceVenteUvTtc,
                    }
                  }))
                  setShowBatchModal(false)
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Valider les Tarifs par Lot</span>
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}

export default NewProductModal
