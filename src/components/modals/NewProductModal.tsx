// =============================================================================
// GESTIO 229 SaaS — Modale Nouveau Produit (Norme UCD / UV & Fiscalité Bénin)
// Saisie obligatoire des prix en TTC avec décomposition automatique HT, TVA & AIB
// Calcul des marges sur base HT, multi-unités et quantités décimales
// Ajout CDC : Vente par lot (optionnel) et sous-modale de tarification par fractions
// =============================================================================

import React, { useState, useMemo, useEffect } from 'react'
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
import { useTenant } from '../../hooks/useTenant'
import { getNextSectorCode } from '../../lib/supabaseTenant'
import { getActiveSectorSlug, normalizeSectorSlug } from '../../lib/sectorClient'
import { showModal, showSuccess, showError } from './CustomModalGestio'

interface NewProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (product: any) => void
  defaultCircuit?: 'BAR' | 'CUISINE'
}

// Unités UCD (Stockage / Gros)
export const UCD_UNITS = [
  'Carton', 'Sac', 'Bidon', 'Boîte', 'Caisse', 'Casier', 'Paquet', 'Palette', 'Fût',
  'Rouleau', 'Bobine', 'Pelote', 'Mètre', 'Centimètre',
  'Sachet', 'Lot', 'Gramme', 'Tonne', 'Pièce'
]

// Unités UV (Vente / Détail)
export const UV_UNITS = [
  'Pièce', 'Kg', 'Litre', 'Mètre', 'Centimètre', 'm²',
  'Casier', 'Paquet', 'Palette',
  'Pelote', 'Douzaine', 'Sachet', 'Gramme', 'Portion', 'Sac', 'Bouteille', 'Canette', 'Feuille'
]

export const SECTOR_DEFAULT_UNITS: Record<string, { ucd: string; uv: string; coef: number; category: string; packaging: string; ucdList: string[]; uvList: string[] }> = {
  quincaillerie: {
    ucd: 'Tonne',
    uv: 'Sac',
    coef: 20,
    category: 'Matériaux de Construction',
    packaging: 'Sac 50kg',
    ucdList: ['Tonne', 'Sac', 'Barre', 'Paquet', 'Palette', 'Rouleau', 'Boîte', 'Carton', 'Fût', 'Mètre', 'Pièce'],
    uvList: ['Sac', 'Barre', 'Pièce', 'Kg', 'Mètre', 'Paquet', 'Boîte'],
  },
  brasserie: {
    ucd: 'Casier',
    uv: 'Bouteille',
    coef: 24,
    category: 'Boissons & Rafraîchissements',
    packaging: 'Casier 24 Bouteilles',
    ucdList: ['Casier', 'Carton', 'Pack', 'Palette', 'Fût', 'Caisse', 'Pièce'],
    uvList: ['Bouteille', 'Canette', 'Verre', 'Pièce', 'Casier'],
  },
  poissonnerie: {
    ucd: 'Carton',
    uv: 'Kg',
    coef: 20,
    category: 'Poissons & Surgelés',
    packaging: 'Carton 20kg',
    ucdList: ['Carton', 'Caisse', 'Bac', 'Sac', 'Kg', 'Palette', 'Pièce'],
    uvList: ['Kg', 'Pièce', 'Gramme', 'Sachet', 'Carton'],
  },
  pharmacie: {
    ucd: 'Boîte',
    uv: 'Plaquette',
    coef: 10,
    category: 'Médicaments & Santé',
    packaging: 'Boîte standard',
    ucdList: ['Boîte', 'Flacon', 'Carton', 'Paquet', 'Lot', 'Pièce'],
    uvList: ['Plaquette', 'Gélule', 'Comprimé', 'Flacon', 'Ampoule', 'Pièce'],
  },
  imprimerie: {
    ucd: 'Rouleau',
    uv: 'Mètre',
    coef: 50,
    category: 'Bâches',
    packaging: 'Rouleau 50 mètres',
    ucdList: [
      'Rouleau', 'Bobine', 'Rame', 'Carton', 'Paquet', 'Bidon',
      'Boîte', 'Fût', 'Palette', 'Kilogramme', 'Litre', 'Pièce', 'Lot'
    ],
    uvList: [
      'Mètre', 'm²', 'Feuille', 'Pièce', 'Exemplaire', 'Litre',
      'Millilitre', 'Kilogramme', 'Gramme', 'Rouleau', 'Paquet', 'Unité'
    ],
  },
  restaurant: {
    ucd: 'Carton',
    uv: 'Portion',
    coef: 1,
    category: 'Ingrédients & Cuisine',
    packaging: 'Conditionnement Standard',
    ucdList: ['Carton', 'Sac', 'Bidon', 'Caisse', 'Paquet', 'Kg', 'Pièce'],
    uvList: ['Portion', 'Plat', 'Kg', 'Litre', 'Pièce'],
  },
  supermarche: {
    ucd: 'Carton',
    uv: 'Pièce',
    coef: 12,
    category: 'Rayon Alimentaire',
    packaging: 'Carton 12 pièces',
    ucdList: ['Carton', 'Pack', 'Caisse', 'Sac', 'Palette', 'Paquet', 'Pièce'],
    uvList: ['Pièce', 'Bouteille', 'Paquet', 'Sachet', 'Kg', 'Litre'],
  },
  boutique: {
    ucd: 'Carton',
    uv: 'Pièce',
    coef: 1,
    category: 'Articles Divers',
    packaging: 'Standard',
    ucdList: ['Carton', 'Paquet', 'Sachet', 'Boîte', 'Lot', 'Pièce'],
    uvList: ['Pièce', 'Paquet', 'Mètre', 'Gramme'],
  },
}

export const SECTOR_CATEGORIES: Record<string, string[]> = {
  quincaillerie: [
    'Matériaux de Construction',
    'Outillage & Quincaillerie',
    'Plomberie & Sanitaire',
    'Électricité & Éclairage',
    'Peinture & Droguerie',
    'Visserie & Fixation',
    'Menuiserie & Bois',
    'Sécurité & Protection',
    'Divers Matériaux',
  ],
  imprimerie: [
    'Bâches',
    'Vinyles et films adhésifs',
    'Papiers et cartons',
    'Encres',
    'Solvants',
    'Émulsions',
    'Supports textiles',
    'Films de transfert',
    'Rubans et adhésifs',
    'Consommables de finition',
    'Accessoires consommables',
    'Autres matières premières',
  ],
  brasserie: [
    'Bières & Boissons Alcoolisées',
    'Boissons Gazeuses & Sodas',
    'Jus & Eaux Minérales',
    'Vins & Spiritueux',
    'Emballages & Casiers',
    'Consommables de Service',
  ],
  poissonnerie: [
    'Poissons Frais',
    'Poissons Congelés / Surgelés',
    'Crustacés & Fruits de Mer',
    'Cartons & Conditionnements',
  ],
  pharmacie: [
    'Médicaments essentiels',
    'Antibiotiques & Antalgiques',
    'Pansements & Soins',
    'Vitamines & Compléments',
    'Hygiène & Parapharmacie',
  ],
  restaurant: [
    'Matières Premières Cuisine',
    'Viandes & Volailles',
    'Poissons & Fruits de Mer',
    'Légumes & Épicerie',
    'Boissons & Bar',
    'Emballages & Consommables',
  ],
  supermarche: [
    'Rayon Alimentaire',
    'Boissons & Liquides',
    'Hygiène & Beauté',
    'Entretien Ménager',
    'Bazar & Fournitures',
  ],
  boutique: [
    'Prêt-à-porter & Mode',
    'Accessoires & Maroquinerie',
    'Cosmétiques',
    'Articles Divers',
  ],
}

SECTOR_DEFAULT_UNITS.impression = SECTOR_DEFAULT_UNITS.imprimerie
SECTOR_CATEGORIES.impression = SECTOR_CATEGORIES.imprimerie

export const NewProductModal: React.FC<NewProductModalProps> = ({ isOpen, onClose, onSuccess, defaultCircuit }) => {
  const { company, user } = useAuthStore()
  const { companyId, sectorSlug, supabaseTenant } = useTenant()

  const activeSectorSlug = normalizeSectorSlug(sectorSlug || getActiveSectorSlug() || 'boutique')
  const isRestaurant = activeSectorSlug === 'restaurant' || activeSectorSlug === 'bar-restaurant-maquis' || activeSectorSlug === 'bar' || activeSectorSlug === 'maquis' || activeSectorSlug === 'fastfood'

  // ── 1. TOUS LES ÉTATS (useState) DÉCLARÉS EN PREMIER (ÉLIMINATION TDZ) ──
  const [restaurantCircuit, setRestaurantCircuit] = useState<'BAR' | 'CUISINE'>(defaultCircuit || 'BAR')
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [customCategoryText, setCustomCategoryText] = useState('')
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedProduct, setLastSavedProduct] = useState<{ code: string; name: string } | null>(null)
  const [brasserieEmballages, setBrasserieEmballages] = useState<{ id: string; code: string; designation: string }[]>([])
  const [selectedEmballageId, setSelectedEmballageId] = useState<string>('')
  const [qteEmballageParUnite, setQteEmballageParUnite] = useState<number>(1)

  // Formulaire Produit sans valeurs fictives (vides ou 0 réels)
  const [form, setForm] = useState({
    code: '', // Vide au départ, généré automatiquement à l'enregistrement si non saisi
    name: '',
    category: defaultCircuit === 'CUISINE' ? 'Matières Premières Cuisine' : (SECTOR_DEFAULT_UNITS[activeSectorSlug]?.category || 'Alimentation & Boissons'),
    ucd: defaultCircuit === 'CUISINE' ? 'Sac' : (SECTOR_DEFAULT_UNITS[activeSectorSlug]?.ucd || 'Carton'),
    packaging: SECTOR_DEFAULT_UNITS[activeSectorSlug]?.packaging || 'Standard',
    uv: defaultCircuit === 'CUISINE' ? 'Kg' : (SECTOR_DEFAULT_UNITS[activeSectorSlug]?.uv || 'Pièce'),
    coef: SECTOR_DEFAULT_UNITS[activeSectorSlug]?.coef || 1,
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

  // ── 2. CALCULS MÉMORISÉS (useMemo) — form est déjà initialisé ──
  const availableUcdUnits = useMemo(() => {
    const secDefaults = SECTOR_DEFAULT_UNITS[activeSectorSlug]?.ucdList || UCD_UNITS
    const set = new Set([...secDefaults, ...UCD_UNITS])
    return Array.from(set)
  }, [activeSectorSlug])

  const availableUvUnits = useMemo(() => {
    const secDefaults = SECTOR_DEFAULT_UNITS[activeSectorSlug]?.uvList || UV_UNITS
    const set = new Set([...secDefaults, ...UV_UNITS])
    return Array.from(set)
  }, [activeSectorSlug])

  const availableCategories = useMemo(() => {
    const defaultList = SECTOR_CATEGORIES[activeSectorSlug] || [
      'Alimentation & Boissons',
      'Matériaux & BTP',
      'Textile & Confection',
      'Électronique & Équipements',
      'Santé & Cosmétique',
      'Divers & Prestations',
    ]
    if (form.category && !defaultList.includes(form.category) && form.category !== '__custom__') {
      return [...defaultList, form.category]
    }
    return defaultList
  }, [activeSectorSlug, form.category])

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

  // Paliers de lots générés dynamiquement selon le coefficient
  const batchTiers = useMemo(() => {
    return getBatchTiersList(form.coef, form.batchPricing)
  }, [form.coef, form.batchPricing])

  // ── 3. EFFETS DE SYNCHRONISATION (useEffect) ──
  useEffect(() => {
    if (defaultCircuit) {
      setRestaurantCircuit(defaultCircuit)
    }
  }, [defaultCircuit])

  // Synchronisation des unités par défaut selon le secteur actif
  useEffect(() => {
    if (isOpen) {
      const defaults = SECTOR_DEFAULT_UNITS[activeSectorSlug] || SECTOR_DEFAULT_UNITS.boutique
      setForm((prev) => {
        if (prev.name) return prev // Ne pas écraser la saisie en cours
        return {
          ...prev,
          ucd: defaultCircuit === 'CUISINE' ? 'Sac' : defaults.ucd,
          uv: defaultCircuit === 'CUISINE' ? 'Kg' : defaults.uv,
          coef: defaults.coef,
          category: defaultCircuit === 'CUISINE' ? 'Matières Premières Cuisine' : defaults.category,
          packaging: defaults.packaging,
          batchPricing: {
            ...prev.batchPricing,
            coef: defaults.coef,
          }
        }
      })
    }
  }, [isOpen, activeSectorSlug, defaultCircuit])

  useEffect(() => {
    if (isOpen && activeSectorSlug === 'brasserie' && (company?.id || companyId)) {
      const cId = company?.id || companyId || ''
      supabase
        .from('brasserie_emballages')
        .select('id, code, designation')
        .eq('company_id', cId)
        .eq('sector_slug', 'brasserie')
        .eq('is_active', true)
        .order('code')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setBrasserieEmballages(data)
          } else {
            setBrasserieEmballages([
              { id: 'c12t', code: 'C12T', designation: 'Casier 12 Bouteilles (12T)' },
              { id: 'c20t', code: 'C20T', designation: 'Casier 20 Bouteilles (20T)' },
              { id: 'c24t', code: 'C24T', designation: 'Casier 24 Bouteilles (24T)' },
            ])
          }
        })
    }
  }, [isOpen, sectorSlug, company?.id, companyId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name || !form.name.trim()) {
      await showModal({
        type: 'warning',
        title: 'Champ obligatoire',
        message: 'Veuillez renseigner la désignation du produit.',
        domaine: 'www.gestio229.com',
      })
      return
    }

    if (!company?.id) {
      await showModal({
        type: 'error',
        title: 'Session expirée',
        message: 'Session d\'entreprise introuvable. Veuillez vous reconnecter.',
        domaine: 'www.gestio229.com',
      })
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
          await showModal({
            type: 'error',
            title: 'Code produit existant',
            message: `Le code "${finalCode}" est déjà utilisé par un autre produit de votre entreprise. Veuillez le modifier ou laisser le champ vide pour le générer automatiquement.`,
            domaine: 'www.gestio229.com',
          })
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

      // Contrôle de cohérence stricte des unités
      if (form.ucd.toLowerCase() === 'tonne' && Number(form.coef) <= 1 && form.uv.toLowerCase() !== 'tonne') {
        await showError(
          `Erreur d'unité : Vous avez sélectionné UCD = "${form.ucd}" et UV = "${form.uv}" avec un coefficient de ${form.coef}.\n\n1 Tonne ne peut pas être égale à 1 ${form.uv}. Renseignez le coefficient réel (ex: 20 si 1 Tonne = 20 Sacs de 50kg, ou 1000 si 1 Tonne = 1000 Kg).`,
          "Incohérence d'Unités"
        )
        setIsSaving(false)
        return
      }

      const isMatierePrem = isRestaurant && restaurantCircuit === 'CUISINE'
      const finalCategory = isCustomCategory && customCategoryText.trim() ? customCategoryText.trim() : (form.category || 'Standard')
      const sectorMeta = {
        sector_slug: activeSectorSlug,
        sector: activeSectorSlug,
        restaurant_circuit: isRestaurant ? restaurantCircuit : undefined,
        is_matiere_premiere: isMatierePrem,
        category: finalCategory,
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
        emballage_id: activeSectorSlug === 'brasserie' ? (selectedEmballageId || null) : null,
        qte_emballage: activeSectorSlug === 'brasserie' && selectedEmballageId ? (Number(qteEmballageParUnite) || 1) : null,
      }

      let autoCode = finalCode
      if (!autoCode) {
        autoCode = await getNextSectorCode('products', 'PROD', companyId || '', activeSectorSlug)
      }

      // 3. Préparation du payload optimisé pour Supabase
      const coefVal = Math.max(0.0001, Number(form.coef) || 1)
      const ucdVal = form.ucd || SECTOR_DEFAULT_UNITS[activeSectorSlug]?.ucd || 'Carton'
      const uvVal = form.uv || SECTOR_DEFAULT_UNITS[activeSectorSlug]?.uv || 'Pièce'

      const insertPayload: any = {
        company_id: company?.id || companyId,
        entreprise_id: company?.id || companyId,
        code: autoCode,
        name: form.name.trim(),
        nom: form.name.trim(),
        category: finalCategory,
        category_name: finalCategory,
        unit: uvVal,
        unite: uvVal,
        ucd: ucdVal,
        unite_stock: ucdVal,
        uv: uvVal,
        unite_vente: uvVal,
        coef: coefVal,
        coefficient: coefVal,
        coefficient_conversion: coefVal,
        cost_price: form.priceAchatUcdTtc,
        cout_achat: form.priceAchatUcdTtc,
        selling_price: form.priceVenteUvTtc,
        prix_vente: form.priceVenteUvTtc,
        wholesale_price: form.priceVenteUcdTtc,
        is_taxable: form.isVatSubject,
        tva_rate: form.isVatSubject ? form.vatRate : 0,
        min_stock_alert: 5,
        stock_magasin: parsedMagasin,
        stock_vente: parsedVente,
        sector_slug: activeSectorSlug,
        secteur_slug: activeSectorSlug,
        sector_meta: sectorMeta,
        is_active: true,
      }

      if (isRestaurant && restaurantCircuit) {
        insertPayload.restaurant_circuit = restaurantCircuit
      }
      if (isMatierePrem !== undefined) {
        insertPayload.is_matiere_premiere = isMatierePrem
      }
      if (sectorSlug === 'brasserie' && selectedEmballageId) {
        insertPayload.emballage_code = selectedEmballageId
      }

      console.log('INSERT PRODUIT PAYLOAD OPTIMISÉ (Instantané):', insertPayload)

      // Exécution de l'insert direct (instantané < 500ms)
      let savedRecord: any = null
      let lastError: any = null
      let currentPayload = { ...insertPayload }

      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase.from('products').insert(currentPayload).select()

        if (!res.error && res.data && res.data.length > 0) {
          savedRecord = res.data[0]
          lastError = null
          break
        }

        if (res.error) {
          lastError = res.error
          console.warn(`[NewProductModal] Tentative ${attempt + 1} rejetée par PostgREST:`, res.error)

          // Détection d'une colonne absente du schéma PostgREST (PGRST204 / 42703)
          const errMsg = String(res.error.message || '')
          const errDetails = String(res.error.details || '')
          const colMatch =
            errMsg.match(/Could not find the '([^']+)' column/) ||
            errMsg.match(/column "([^"]+)" of relation "products" does not exist/) ||
            errDetails.match(/column "([^"]+)" does not exist/)

          if (colMatch && colMatch[1]) {
            const missingCol = colMatch[1]
            console.warn(`[NewProductModal] Retrait dynamique de la colonne inexistante : ${missingCol}`)
            delete currentPayload[missingCol]
            continue
          }

          // Fallbacks de sécurité immédiats
          if (errMsg.includes('secteur_slug')) delete currentPayload.secteur_slug
          if (errMsg.includes('restaurant_circuit')) delete currentPayload.restaurant_circuit
          if (errMsg.includes('is_matiere_premiere')) delete currentPayload.is_matiere_premiere
          if (errMsg.includes('emballage_code')) delete currentPayload.emballage_code
          if (errMsg.includes('stock_magasin')) delete currentPayload.stock_magasin
          if (errMsg.includes('stock_vente')) delete currentPayload.stock_vente
          if (errMsg.includes('ucd')) delete currentPayload.ucd
          if (errMsg.includes('uv')) delete currentPayload.uv
          if (errMsg.includes('coef')) delete currentPayload.coef

          // Sortie de boucle si erreur non liée aux colonnes
          break
        } else if (!res.data || res.data.length === 0) {
          // Cas où l'insert a réussi mais le SELECT n'a rien retourné (politique RLS)
          const { data: fetched } = await supabase
            .from('products')
            .select('*')
            .eq('company_id', company?.id || companyId)
            .eq('code', autoCode)
            .maybeSingle()

          if (fetched) {
            savedRecord = fetched
            lastError = null
            break
          } else {
            savedRecord = { id: `prod_${Date.now()}`, ...currentPayload }
            lastError = null
            break
          }
        }
      }

      // 4. Contrôle strict des erreurs (détails complets Supabase)
      if (lastError || !savedRecord) {
        console.error("SUPABASE ERROR DETAIL:", lastError)
        const parts = [
          lastError?.message ? `Message : ${lastError.message}` : null,
          lastError?.details ? `Détails : ${lastError.details}` : null,
          lastError?.hint ? `Indication : ${lastError.hint}` : null,
          lastError?.code ? `Code SQL : ${lastError.code}` : null,
        ].filter(Boolean)
        const detailedMessage = parts.length > 0 ? parts.join('\n') : (typeof lastError === 'string' ? lastError : 'Erreur inconnue dans la base de données.')

        await showModal({
          type: 'error',
          title: 'Enregistrement échoué',
          message: `Erreur lors de l'enregistrement dans la base de données :\n\n${detailedMessage}\n\nLe produit n'a pas été enregistré.`,
          domaine: 'www.gestio229.com',
        })
        setIsSaving(false)
        return
      }

      // 4b. Association emballage pour Brasserie & Dépôt de Boissons
      if (savedRecord?.id && sectorSlug === 'brasserie' && selectedEmballageId) {
        try {
          const cId = company?.id || companyId || ''
          await supabase.from('brasserie_produit_emballage').insert({
            company_id: cId,
            sector_slug: 'brasserie',
            product_id: savedRecord.id,
            emballage_id: selectedEmballageId,
            qte_emballage_par_unite: Number(qteEmballageParUnite) || 1,
            is_active: true
          })
        } catch (peErr) {
          console.warn('[NewProductModal] Échec brasserie_produit_emballage:', peErr)
        }
      }

      // 4c. Enregistrement sécurisé du stock initial (stock_magasin & mouvements)
      if (savedRecord?.id && (parsedMagasin > 0 || parsedVente > 0)) {
        const cId = company?.id || companyId || ''
        try {
          await supabase.from('stock_magasin').upsert({
            produit_id: savedRecord.id,
            stock_ucd: parsedMagasin,
            ucd: form.ucd
          }, { onConflict: 'produit_id' })
        } catch (smErr) {
          console.warn('[NewProductModal] stock_magasin notice:', smErr)
        }

        try {
          await supabase.from('stocks_magazin').insert({
            company_id: cId,
            produit: form.name.trim(),
            produit_id: savedRecord.id,
            quantite: parsedMagasin,
            stock_ucd: parsedMagasin,
            unite: form.ucd,
            ucd: form.ucd,
            reference_bl: 'STOCK-INITIAL',
            notes: 'Stock initial saisi à la création du produit'
          })
        } catch (smzErr) {
          console.warn('[NewProductModal] stocks_magazin notice:', smzErr)
        }

        try {
          await supabase.from('stock_movements').insert({
            company_id: cId,
            product_id: savedRecord.id,
            movement_type: 'INITIAL',
            quantity: parsedMagasin,
            unit: form.ucd,
            notes: 'Stock initial à la création'
          })
        } catch (mErr) {
          console.warn('[NewProductModal] stock_movements notice:', mErr)
        }
      }

      const savedProduct = {
        ...savedRecord,
        stock_magasin: parsedMagasin,
        stock_vente: parsedVente,
        ucd: form.ucd,
        uv: form.uv,
        coef: form.coef,
        is_taxable: form.isVatSubject,
        tva_rate: form.isVatSubject ? form.vatRate : 0,
        is_vat_subject: form.isVatSubject,
        vat_rate: form.isVatSubject ? form.vatRate : 0,
        is_aib_subject: form.isAibSubject,
        aib_rate: form.isAibSubject ? form.aibRate : 0,
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
          entityId: savedRecord?.id
        })
      } catch (e) {}

      // Modale verte de confirmation professionnelle GESTIO 229
      await showModal({
        type: 'success',
        title: 'Produit enregistré avec succès',
        message: `Produit [${finalCode}] "${form.name.trim()}" enregistré avec succès dans la base de données !\n\nStock initial : ${parsedMagasin} ${form.ucd} (Magasin) | ${parsedVente} ${form.uv} (Vente)\nConversion : 1 ${form.ucd} = ${form.coef} ${form.uv}`,
        domaine: 'www.gestio229.com',
      })

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
      console.error("SUPABASE ERROR DETAIL:", err)
      const parts = [
        err?.message ? `Message : ${err.message}` : null,
        err?.details ? `Détails : ${err.details}` : null,
        err?.hint ? `Indication : ${err.hint}` : null,
        err?.code ? `Code SQL : ${err.code}` : null,
      ].filter(Boolean)
      const detailedMessage = parts.length > 0 ? parts.join('\n') : (typeof err === 'string' ? err : 'Erreur inattendue')

      await showModal({
        type: 'error',
        title: 'Erreur inattendue',
        message: `Erreur inattendue : ${detailedMessage}\n\nVérifiez votre connexion internet ou la configuration Supabase.`,
        domaine: 'www.gestio229.com',
      })
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

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

            {/* Sélecteur de Secteur / Circuit CHR obligatoire */}
            {isRestaurant && (
              <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-3.5 rounded-2xl border border-rose-800/40 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div>
                  <h4 className="font-black text-xs text-white flex items-center gap-1.5">
                    <span>🏢 Destination du Produit :</span>
                    <span className="bg-rose-500 text-white text-[10px] font-mono px-2 py-0.5 rounded-full uppercase">
                      Stock {restaurantCircuit === 'CUISINE' ? 'Matières Premières Cuisine' : 'Boisson Bar'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    {restaurantCircuit === 'CUISINE'
                      ? 'Ce produit sera stocké en Cuisine et disponible dans les fiches techniques & recettes'
                      : 'Ce produit sera stocké au Bar et disponible à la vente directe au POS'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRestaurantCircuit('BAR')
                      setForm(prev => ({
                        ...prev,
                        category: prev.category === 'Matières Premières Cuisine' ? 'Alimentation & Boissons' : prev.category,
                        uv: prev.uv === 'Kg' ? 'Pièce' : prev.uv
                      }))
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                      restaurantCircuit === 'BAR'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    🍺 Stock Boisson BAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRestaurantCircuit('CUISINE')
                      setForm(prev => ({
                        ...prev,
                        category: prev.category === 'Alimentation & Boissons' ? 'Matières Premières Cuisine' : prev.category,
                        uv: prev.uv === 'Pièce' ? 'Kg' : prev.uv
                      }))
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                      restaurantCircuit === 'CUISINE'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    🥩 Stock Matières CUISINE
                  </button>
                </div>
              </div>
            )}

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
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {activeSectorSlug === 'imprimerie' ? 'Catégorie de Matière / Consommable *' : 'Catégorie *'}
                  </label>
                  {!isCustomCategory ? (
                    <div className="flex gap-1.5">
                      <select
                        value={form.category}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomCategory(true)
                          } else {
                            setForm({ ...form, category: e.target.value })
                          }
                        }}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100 text-xs"
                      >
                        {availableCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__custom__" className="text-emerald-600 font-bold">
                          + Autre catégorie personnalisée...
                        </option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setIsCustomCategory(true)}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200"
                        title="Ajouter une nouvelle catégorie libre"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ex: Bâches Microperforées, Adhésifs..."
                        value={customCategoryText}
                        onChange={(e) => {
                          setCustomCategoryText(e.target.value)
                          setForm({ ...form, category: e.target.value })
                        }}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-emerald-500 rounded-lg font-bold text-slate-800 dark:text-slate-100 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false)
                          if (!customCategoryText.trim()) {
                            setForm({ ...form, category: availableCategories[0] || 'Standard' })
                          }
                        }}
                        className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200"
                        title="Revenir à la liste"
                      >
                        ✕
                      </button>
                    </div>
                  )}
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
                    {availableUcdUnits.map((u) => (
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
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Unité Stock (UV) *</label>
                  <select
                    value={form.uv}
                    onChange={(e) => setForm({ ...form, uv: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100"
                  >
                    {availableUvUnits.map((u) => (
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
                  {form.ucd.toLowerCase() === 'tonne' && Number(form.coef) <= 1 && form.uv.toLowerCase() !== 'tonne' ? (
                    <div className="p-2.5 mt-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs flex items-center space-x-2">
                      <span>⚠️</span>
                      <span>
                        <strong>Attention :</strong> 1 Tonne = 1 {form.uv} avec un coefficient de {form.coef} est généralement une anomalie. Renseignez le coefficient réel (ex: 20 si 1 Tonne = 20 Sacs de 50kg, ou 1000 si 1 Tonne = 1000 Kg).
                      </span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Exemple : 1 Casier = 24 Bouteilles | 1 Tonne = 20 Sacs | 1 Carton = 20 Kg | 1 Rame = 500 Feuilles
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2-BIS: EMBALLAGES CONSIGNÉS (BRASSERIE UNIQUEMENT) */}
            {sectorSlug === 'brasserie' && (
              <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-3">
                <h4 className="font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-1.5">
                  <PackagePlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Emballage Consigné Associé (Brasserie & Dépôt de Boissons)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Type d'emballage consignable
                    </label>
                    <select
                      value={selectedEmballageId}
                      onChange={(e) => setSelectedEmballageId(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100 text-sm"
                    >
                      <option value="">— Aucun (Produit sans consigne) —</option>
                      {brasserieEmballages.map((emb) => (
                        <option key={emb.id} value={emb.id}>
                          [{emb.code}] {emb.designation}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nombre d'emballages par unité ({form.uv || 'UV'}) vendue
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={qteEmballageParUnite}
                      onChange={(e) => setQteEmballageParUnite(Number(e.target.value) || 1)}
                      disabled={!selectedEmballageId}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold font-mono text-slate-800 dark:text-slate-100 text-sm disabled:opacity-40"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Ex: 1 casier 12T par caisse/carton vendu</p>
                  </div>
                </div>
              </div>
            )}

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
