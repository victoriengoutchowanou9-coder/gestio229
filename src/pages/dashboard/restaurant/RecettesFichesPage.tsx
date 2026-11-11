import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen, Plus, RefreshCw, Scale, DollarSign, PieChart,
  Percent, Trash2, Edit3, ChevronRight, X, AlertCircle, Sparkles,
  Search, Eye, CheckCircle2, AlertTriangle, Layers, Info, ChefHat,
  TrendingUp, TrendingDown, ArrowUpRight, Flame, ShieldAlert,
  Clock, Package, Archive, Check
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { useAuthStore } from '../../../store/authStore'
import { formatFCFA } from '../../../utils/tax'
import { ConfirmModal } from '../../../components/modals'
import { validerPreparationCuisine, declarerPertePortions } from '../../../services/restaurantService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

// Définition des unités supportées et facteurs de conversion par rapport à l'unité de base de stockage
const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg (Kilogramme)', baseType: 'weight', factorToBase: 1 },
  { value: 'g', label: 'g (Gramme)', baseType: 'weight', factorToBase: 0.001 },
  { value: 'mg', label: 'mg (Milligramme)', baseType: 'weight', factorToBase: 0.000001 },
  { value: 'L', label: 'L (Litre)', baseType: 'volume', factorToBase: 1 },
  { value: 'cl', label: 'cl (Centilitre)', baseType: 'volume', factorToBase: 0.01 },
  { value: 'ml', label: 'ml (Millilitre)', baseType: 'volume', factorToBase: 0.001 },
  { value: 'pièce', label: 'pièce (Unité)', baseType: 'unit', factorToBase: 1 },
  { value: 'dose', label: 'dose (Mesure/Verre)', baseType: 'unit', factorToBase: 1 },
  { value: 'portion', label: 'portion', baseType: 'unit', factorToBase: 1 },
  { value: 'botte', label: 'botte / paquet', baseType: 'unit', factorToBase: 1 },
  { value: 'cuillère', label: 'cuillère à soupe (~15g/ml)', baseType: 'any', factorToBase: 0.015 }
]

function getUnitFactor(sourceUnit: string, targetUnit: string): number {
  const normSrc = (sourceUnit || 'kg').trim().toLowerCase()
  const normTgt = (targetUnit || 'kg').trim().toLowerCase()

  if (normSrc === normTgt) return 1

  // Poids
  if ((normSrc === 'kg' || normSrc === 'kilo') && normTgt === 'g') return 0.001
  if (normSrc === 'g' && (normTgt === 'kg' || normTgt === 'kilo')) return 1000
  if ((normSrc === 'kg' || normSrc === 'kilo') && normTgt === 'mg') return 0.000001
  if (normSrc === 'g' && normTgt === 'mg') return 0.001

  // Volume
  if ((normSrc === 'l' || normSrc === 'litre') && normTgt === 'ml') return 0.001
  if ((normSrc === 'l' || normSrc === 'litre') && normTgt === 'cl') return 0.01
  if (normSrc === 'cl' && (normSrc === 'l' || normTgt === 'litre')) return 100
  if (normSrc === 'cl' && normTgt === 'ml') return 0.1
  if (normSrc === 'ml' && (normTgt === 'l' || normTgt === 'litre')) return 1000
  if (normSrc === 'ml' && normTgt === 'cl') return 10

  return 1
}

/**
 * Extraction universelle et résiliente du coût de valorisation réel enregistré dans le stock
 * Respecte les méthodes de valorisation PMP, prix UV, coût d'achat unitaire, et conditionnement UCD/coef
 */
export function extractCuisineProductCost(p: any): { unitCost: number; storageUnit: string } {
  if (!p) return { unitCost: 0, storageUnit: 'kg' }
  const meta = p.sector_meta || {}
  const coef = Number(p.coef || meta.coef || meta.coefficient || 1) || 1
  const storageUnit = String(p.unit || p.uv || p.unite || meta.unit || 'kg').trim()

  let cost = 0

  // 1. PMP (Prix Moyen Pondéré de valorisation) en priorité
  if (meta.pmp && Number(meta.pmp) > 0) {
    cost = Number(meta.pmp)
  } else if (meta.price_achat_uv_ttc && Number(meta.price_achat_uv_ttc) > 0) {
    // 2. Prix d'achat unitaire pour l'unité d'utilisation (UV)
    cost = Number(meta.price_achat_uv_ttc)
  } else if (meta.cout_valorisation && Number(meta.cout_valorisation) > 0) {
    cost = Number(meta.cout_valorisation)
  } else if (p.cost_price && Number(p.cost_price) > 0) {
    const rawCost = Number(p.cost_price)
    // Si coût du colis (UCD) avec coef de conversion > 1
    if (coef > 1 && (meta.price_achat_ucd_ttc || meta.ucd)) {
      cost = Math.round((rawCost / coef) * 100) / 100
    } else {
      cost = rawCost
    }
  } else if (p.cout_achat && Number(p.cout_achat) > 0) {
    const rawAchat = Number(p.cout_achat)
    cost = coef > 1 ? Math.round((rawAchat / coef) * 100) / 100 : rawAchat
  } else if (meta.cost_price && Number(meta.cost_price) > 0) {
    cost = Number(meta.cost_price)
  } else if (meta.prix_achat && Number(meta.prix_achat) > 0) {
    cost = Number(meta.prix_achat)
  } else if (meta.price_achat_ucd_ttc && Number(meta.price_achat_ucd_ttc) > 0) {
    cost = Math.round((Number(meta.price_achat_ucd_ttc) / coef) * 100) / 100
  }

  return { unitCost: Math.max(0, cost), storageUnit }
}

interface CuisineProduct {
  id: string
  code: string
  name: string
  unit: string
  uv?: string
  ucd?: string
  coef?: number
  cost_price: number
  selling_price?: number
  stock_dispo: number
  restaurant_circuit?: string
  is_matiere_premiere?: boolean
  is_recipe?: boolean
  sector_meta?: any
}

interface IngredientDraft {
  tempId: string
  productId?: string
  ingredient_nom: string
  quantite_necessaire: number
  unite: string
  storage_unit: string
  cout_unitaire_stock: number
  cout_unitaire_dosed: number
  cout_ligne: number
  stock_disponible: number
  notes?: string
}

export const RecettesFichesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { user } = useAuthStore()
  const { toast } = useUIStore()

  // Contrôle de rôle administrateur strict
  const isAdmin = !user?.role || user.role === 'administrateur' || user.role === 'super_admin' || user.role === 'admin' || user.role === 'owner' || ['administrateur', 'admin', 'super_admin', 'owner', 'propriétaire', 'proprietaire', 'directeur', 'gerant'].includes(String(user?.role || '').toLowerCase().trim())

  // Onglet actif : 'recettes' (Fiches techniques) ou 'portions' (Préparations du jour & stock portions)
  const [activeTab, setActiveTab] = useState<'recettes' | 'portions'>('recettes')

  const [fiches, setFiches] = useState<any[]>([])
  const [cuisineProducts, setCuisineProducts] = useState<CuisineProduct[]>([])
  const [allProducts, setAllProducts] = useState<CuisineProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlat, setSelectedPlat] = useState<string>('Tous')

  // Modales
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [activePlatDetail, setActivePlatDetail] = useState<string | null>(null)

  // Modale de validation d'une préparation en cuisine (Mode B)
  const [showPrepModal, setShowPrepModal] = useState(false)
  const [prepTargetPlat, setPrepTargetPlat] = useState<string>('')
  const [prepNbLots, setPrepNbLots] = useState<number>(1)
  const [prepRendementEffectif, setPrepRendementEffectif] = useState<number>(10)
  const [isPreping, setIsPreping] = useState(false)

  // Modale de perte / invendu
  const [showPerteModal, setShowPerteModal] = useState(false)
  const [perteTargetPlat, setPerteTargetPlat] = useState<string>('')
  const [perteQty, setPerteQty] = useState<number>(1)
  const [perteMotif, setPerteMotif] = useState<string>('PERIME')
  const [isSavingPerte, setIsSavingPerte] = useState(false)

  // Formulaire Création Multi-ingrédients & Rendement
  const [dishNameInput, setDishNameInput] = useState('')
  const [dishCategory, setDishCategory] = useState('Plats Cuisinés')
  const [dishNotes, setDishNotes] = useState('')
  const [productionMode, setProductionMode] = useState<'UNITE' | 'LOT'>('UNITE')
  const [dishYield, setDishYield] = useState<number>(1)
  const [dishYieldUnit, setDishYieldUnit] = useState<string>('portion')
  const [dishSellingPrice, setDishSellingPrice] = useState<string>('')
  const [ingredientsList, setIngredientsList] = useState<IngredientDraft[]>([])
  const [savingRecipe, setSavingRecipe] = useState(false)

  // Ingrédient en cours d'ajout
  const [currentSelectedProductId, setCurrentSelectedProductId] = useState('')
  const [currentCustomIngName, setCurrentCustomIngName] = useState('')
  const [currentQty, setCurrentQty] = useState<number>(1)
  const [currentUnit, setCurrentUnit] = useState<string>('kg')
  const [currentUnitCost, setCurrentUnitCost] = useState<number>(0)
  const [searchMatiere, setSearchMatiere] = useState('')

  // Détails et édition
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<number>(1)
  const [editUnit, setEditUnit] = useState<string>('kg')
  const [editCostU, setEditCostU] = useState<number>(0)
  const [isAddingIngredientToExisting, setIsAddingIngredientToExisting] = useState(false)
  const [editingSellingPrice, setEditingSellingPrice] = useState(false)
  const [tempDetailSellingPrice, setTempDetailSellingPrice] = useState<string>('')
  const [tempDetailYield, setTempDetailYield] = useState<number>(1)
  const [editingYield, setEditingYield] = useState(false)

  // Dialogue de confirmation
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title?: string
    message: string
    onConfirm: () => void | Promise<void>
    isLoading?: boolean
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  })

  // 1. Charger les fiches techniques
  const loadFiches = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_fiches_techniques')
        .select('*')
        .order('plat_nom')

      if (error) throw error
      setFiches(data || [])
    } catch (err: any) {
      console.error('[Recettes] Erreur chargement fiches:', err.message)
      setFiches([])
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  // 2. Charger les matières premières Cuisine du stock réel et catalogue produits
  const loadStockCuisine = useCallback(async () => {
    if (!companyId) return
    try {
      const { data, error } = await supabaseTenant('products')
        .select('id, code, name, unit, uv, ucd, coef, cost_price, cout_achat, selling_price, prix_vente, stock_vente, stock_magasin, sector_meta, restaurant_circuit, is_matiere_premiere')
        .order('name')

      if (error) throw error
      if (data) {
        const mapped: CuisineProduct[] = data.map((p: any) => {
          const isMatiere = Boolean(p.sector_meta?.is_matiere_premiere || p.is_matiere_premiere)
          const isRecipe = Boolean(p.sector_meta?.is_recipe)
          const pCircuit = p.sector_meta?.restaurant_circuit || p.restaurant_circuit || (isMatiere ? 'CUISINE' : 'BAR')
          const stockDispo = (Number(p.stock_vente) || 0) + (Number(p.stock_magasin) || 0)
          const { unitCost, storageUnit } = extractCuisineProductCost(p)

          return {
            id: p.id,
            code: p.code || '',
            name: p.name,
            unit: storageUnit,
            uv: p.uv,
            ucd: p.ucd,
            coef: Number(p.coef || 1),
            cost_price: unitCost,
            selling_price: Number(p.selling_price || p.prix_vente) || 0,
            stock_dispo: stockDispo,
            restaurant_circuit: pCircuit,
            is_matiere_premiere: isMatiere,
            is_recipe: isRecipe,
            sector_meta: p.sector_meta
          }
        })

        setAllProducts(mapped)

        // Filtrer les matières premières ou produits du circuit Cuisine
        const cuisineOnly = mapped.filter(p => p.restaurant_circuit === 'CUISINE' || p.is_matiere_premiere)
        setCuisineProducts(cuisineOnly.length > 0 ? cuisineOnly : mapped)
      }
    } catch (err: any) {
      console.error('[Recettes] Erreur chargement stock cuisine:', err.message)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadFiches()
    loadStockCuisine()
  }, [loadFiches, loadStockCuisine])

  // Filtrage des matières premières dans la liste déroulante
  const filteredMatiereList = useMemo(() => {
    const list = cuisineProducts.length > 0 ? cuisineProducts : allProducts
    if (!searchMatiere) return list
    const q = searchMatiere.toLowerCase()
    return list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
  }, [cuisineProducts, allProducts, searchMatiere])

  // Sélection automatique d'une matière première et récupération instantanée du coût unitaire réel
  const handleProductSelect = (prodId: string) => {
    setCurrentSelectedProductId(prodId)
    const prod = (cuisineProducts.length > 0 ? cuisineProducts : allProducts).find(p => p.id === prodId)
    if (prod) {
      setCurrentCustomIngName(prod.name)
      const { unitCost, storageUnit } = extractCuisineProductCost(prod)
      setCurrentUnit(storageUnit)
      setCurrentUnitCost(unitCost)
    }
  }

  // Calcul du coût unitaire dosé et du coût total de ligne selon la conversion d'unités
  const computeLineCost = (qty: number, chosenUnit: string, storageUnit: string, costPricePerStorageUnit: number) => {
    const factor = getUnitFactor(storageUnit, chosenUnit)
    const unitCostForChosenUnit = costPricePerStorageUnit * factor
    const totalLineCost = Math.round(qty * unitCostForChosenUnit)
    return { unitCostForChosenUnit, totalLineCost }
  }

  // Ajouter un ingrédient au brouillon
  const handleAddIngredientRow = () => {
    const ingName = currentCustomIngName.trim()
    if (!ingName) {
      toast.error('Attention', 'Veuillez sélectionner ou saisir une matière première.')
      return
    }
    if (currentQty <= 0) {
      toast.error('Attention', 'La quantité dosée doit être supérieure à 0.')
      return
    }

    const matchedProd = (cuisineProducts.length > 0 ? cuisineProducts : allProducts).find(p => p.id === currentSelectedProductId)
    const storageUnit = matchedProd?.unit || currentUnit
    const stockCost = matchedProd ? matchedProd.cost_price : currentUnitCost
    const stockDispo = matchedProd ? matchedProd.stock_dispo : 0

    const { unitCostForChosenUnit, totalLineCost } = computeLineCost(currentQty, currentUnit, storageUnit, stockCost)

    const newDraft: IngredientDraft = {
      tempId: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: matchedProd?.id,
      ingredient_nom: ingName,
      quantite_necessaire: Number(currentQty),
      unite: currentUnit,
      storage_unit: storageUnit,
      cout_unitaire_stock: stockCost,
      cout_unitaire_dosed: unitCostForChosenUnit,
      cout_ligne: totalLineCost,
      stock_disponible: stockDispo
    }

    setIngredientsList(prev => [...prev, newDraft])

    // Réinitialiser les champs de saisie
    setCurrentSelectedProductId('')
    setCurrentCustomIngName('')
    setCurrentQty(1)
    setCurrentUnit('kg')
    setCurrentUnitCost(0)
    setSearchMatiere('')
    toast.success('Ingrédient ajouté au plat', `${ingName} ajouté (${currentQty} ${currentUnit}).`)
  }

  const handleRemoveDraftRow = (tempId: string) => {
    setIngredientsList(prev => prev.filter(r => r.tempId !== tempId))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULS FINANCIERS AUTOMATIQUES & RENDEMENT EN TEMPS RÉEL
  // ═══════════════════════════════════════════════════════════════════════════

  // Coût total de préparation = somme des coûts de toutes les matières consommées
  const totalDraftCost = useMemo(() => {
    return ingredientsList.reduce((acc, row) => acc + (row.cout_ligne || 0), 0)
  }, [ingredientsList])

  // Rendement effectif du brouillon (Mode A = 1 portion, Mode B = dishYield portions)
  const resolvedYield = useMemo(() => {
    if (productionMode === 'UNITE') return 1
    return Math.max(1, Number(dishYield) || 10)
  }, [productionMode, dishYield])

  // Coût de revient unitaire d'une portion = Coût total / Nombre de portions obtenues
  const draftUnitCostPrice = useMemo(() => {
    if (resolvedYield <= 0) return totalDraftCost
    return Math.round(totalDraftCost / resolvedYield)
  }, [totalDraftCost, resolvedYield])

  // Prix de vente unitaire d'une portion
  const draftSellingPrice = useMemo(() => {
    return Number(dishSellingPrice || 0)
  }, [dishSellingPrice])

  // Marge brute unitaire = Prix de vente unitaire - Coût de revient unitaire
  const draftUnitMargin = useMemo(() => {
    return draftSellingPrice - draftUnitCostPrice
  }, [draftSellingPrice, draftUnitCostPrice])

  // Chiffre d'affaires potentiel de toute la préparation = Nombre de portions × Prix de vente unitaire
  const draftPotentialRevenue = useMemo(() => {
    return resolvedYield * draftSellingPrice
  }, [resolvedYield, draftSellingPrice])

  // Marge brute totale de toute la préparation = Chiffre d'affaires potentiel - Coût total de préparation
  const draftTotalMargin = useMemo(() => {
    return draftPotentialRevenue - totalDraftCost
  }, [draftPotentialRevenue, totalDraftCost])

  // Ratios
  const draftTauxMargeSurCout = useMemo(() => {
    if (draftUnitCostPrice <= 0) return 0
    return ((draftUnitMargin / draftUnitCostPrice) * 100)
  }, [draftUnitMargin, draftUnitCostPrice])

  const draftTauxMarque = useMemo(() => {
    if (draftSellingPrice <= 0) return 0
    return ((draftUnitMargin / draftSellingPrice) * 100)
  }, [draftUnitMargin, draftSellingPrice])

  // Synchronisation du plat dans le catalogue products (POS)
  const syncProductSellingPrice = async (
    platNom: string,
    sellingPrice: number,
    costPrice: number,
    metaData: any
  ) => {
    if (!companyId || sellingPrice <= 0) return
    try {
      const match = allProducts.find(p => p.name.trim().toLowerCase() === platNom.trim().toLowerCase())
      if (match) {
        await supabaseTenant('products').update({
          selling_price: sellingPrice,
          cost_price: costPrice > 0 ? costPrice : match.cost_price,
          restaurant_circuit: 'CUISINE',
          is_matiere_premiere: false,
          sector_meta: {
            ...(match as any).sector_meta,
            restaurant_circuit: 'CUISINE',
            is_matiere_premiere: false,
            is_recipe: true,
            recipe_meta: metaData
          }
        }).eq('id', match.id)
      } else {
        const autoCode = `PLAT-${Date.now().toString().slice(-4)}`
        await supabaseTenant('products').insert({
          company_id: companyId,
          code: autoCode,
          name: platNom.trim(),
          unit: metaData?.unite_portion || 'Portion',
          uv: metaData?.unite_portion || 'Portion',
          selling_price: sellingPrice,
          cost_price: costPrice,
          stock_vente: metaData?.mode_preparation === 'LOT' ? 0 : 999,
          stock_magasin: 0,
          sector_slug: 'restaurant',
          is_active: true,
          category: { name: dishCategory || 'Cuisine & Plats' },
          sector_meta: {
            restaurant_circuit: 'CUISINE',
            is_matiere_premiere: false,
            is_recipe: true,
            recipe_meta: metaData
          }
        })
      }
    } catch (err: any) {
      console.warn('[Recettes] Synchronisation produit POS:', err.message)
    }
  }

  // Enregistrer la recette complète
  const handleSaveFullRecipe = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isAdmin) {
      toast.error('Accès refusé', 'Seul l’administrateur est autorisé à créer ou modifier des fiches techniques.')
      return
    }

    const pNom = dishNameInput.trim()
    if (!pNom) {
      toast.error('Nom manquant', 'Veuillez saisir le nom du plat ou de la boisson.')
      return
    }
    if (ingredientsList.length === 0) {
      toast.error('Aucun ingrédient', 'Veuillez ajouter au moins une matière première à la recette.')
      return
    }
    if (resolvedYield <= 0) {
      toast.error('Rendement invalide', 'Le rendement de la préparation doit être strictement supérieur à zéro.')
      return
    }
    if (draftSellingPrice <= 0) {
      toast.error('Prix manquant', 'Le prix de vente unitaire d’une portion doit être strictement supérieur à zéro.')
      return
    }

    setSavingRecipe(true)
    try {
      const meta = {
        mode_preparation: productionMode,
        rendement_portions: resolvedYield,
        unite_portion: dishYieldUnit || 'portion',
        cout_total_preparation: totalDraftCost,
        cout_revient_portion: draftUnitCostPrice,
        prix_vente_unitaire: draftSellingPrice,
        marge_brute_unitaire: draftUnitMargin,
        chiffre_affaires_potentiel: draftPotentialRevenue,
        marge_brute_totale: draftTotalMargin,
        category: dishCategory,
        notes: dishNotes ? dishNotes.trim() : undefined,
        updated_at: new Date().toISOString()
      }

      const recordsToInsert = ingredientsList.map(row => ({
        plat_nom: pNom,
        ingredient_nom: row.ingredient_nom,
        quantite_necessaire: Number(row.quantite_necessaire),
        unite: row.unite,
        cout_unitaire: Number(row.cout_unitaire_dosed),
        cout_matiere_ligne: Math.round(row.cout_ligne),
        prix_vente_unitaire: draftSellingPrice,
        notes: JSON.stringify(meta)
      }))

      const { error } = await supabaseTenant('restaurant_fiches_techniques').insert(recordsToInsert)
      if (error) throw error

      // Synchroniser le prix et les marges dans le catalogue produits pour le POS
      await syncProductSellingPrice(pNom, draftSellingPrice, draftUnitCostPrice, meta)

      toast.success(
        'Fiche technique enregistrée',
        `Recette « ${pNom} » enregistrée avec succès (${productionMode === 'LOT' ? `${resolvedYield} portions` : 'À l’unité'} | Coût unitaire: ${fmt(draftUnitCostPrice)} | Prix: ${fmt(draftSellingPrice)}).`
      )

      setShowAddModal(false)
      setDishNameInput('')
      setDishNotes('')
      setDishSellingPrice('')
      setDishYield(10)
      setIngredientsList([])
      setCurrentSelectedProductId('')
      setCurrentCustomIngName('')
      setCurrentQty(1)
      setCurrentUnitCost(0)

      await loadFiches()
      await loadStockCuisine()
    } catch (err: any) {
      toast.error('Erreur enregistrement', err.message)
    } finally {
      setSavingRecipe(false)
    }
  }

  // Regroupement par plat avec calcul des indicateurs complets
  const platsGroupes = useMemo(() => {
    const map: Record<string, {
      plat: string
      modePreparation: 'UNITE' | 'LOT'
      rendementPortions: number
      unitePortion: string
      ingredients: any[]
      coutTotalPreparation: number
      coutRevientUnitaire: number
      prixVenteUnitaire: number
      margeBruteUnitaire: number
      chiffreAffairesPotentiel: number
      margeBruteTotale: number
      tauxMargeSurCout: number
      tauxMarque: number
      isPerteBrute: boolean
      portionsDisponibles: number
      meta: any
    }> = {}

    fiches.forEach(f => {
      if (!map[f.plat_nom]) {
        let metaParsed: any = null
        if (f.notes) {
          try {
            metaParsed = typeof f.notes === 'string' ? JSON.parse(f.notes) : f.notes
          } catch (_) {}
        }

        const modePrep: 'UNITE' | 'LOT' = metaParsed?.mode_preparation === 'LOT' ? 'LOT' : 'UNITE'
        const rend = Number(metaParsed?.rendement_portions || (modePrep === 'LOT' ? 10 : 1)) || 1
        const uPortion = metaParsed?.unite_portion || 'portion'

        const fichePrice = Number(f.prix_vente_unitaire) || 0
        const matchedProd = allProducts.find(p => p.name.trim().toLowerCase() === f.plat_nom.trim().toLowerCase())
        const resolvedPrice = fichePrice > 0 ? fichePrice : (matchedProd?.selling_price || 0)
        const portionsDisp = Number(matchedProd?.stock_vente ?? matchedProd?.sector_meta?.stock_vente ?? 0)

        map[f.plat_nom] = {
          plat: f.plat_nom,
          modePreparation: modePrep,
          rendementPortions: rend,
          unitePortion: uPortion,
          ingredients: [],
          coutTotalPreparation: 0,
          coutRevientUnitaire: 0,
          prixVenteUnitaire: resolvedPrice,
          margeBruteUnitaire: 0,
          chiffreAffairesPotentiel: 0,
          margeBruteTotale: 0,
          tauxMargeSurCout: 0,
          tauxMarque: 0,
          isPerteBrute: false,
          portionsDisponibles: portionsDisp,
          meta: metaParsed
        }
      }

      if (Number(f.prix_vente_unitaire) > 0 && map[f.plat_nom].prixVenteUnitaire === 0) {
        map[f.plat_nom].prixVenteUnitaire = Number(f.prix_vente_unitaire)
      }

      map[f.plat_nom].ingredients.push(f)
      map[f.plat_nom].coutTotalPreparation += Number(f.cout_matiere_ligne) || 0
    })

    Object.values(map).forEach(p => {
      // Coût de revient unitaire = Coût total de préparation / Rendement
      const rend = p.rendementPortions > 0 ? p.rendementPortions : 1
      p.coutRevientUnitaire = Math.round(p.coutTotalPreparation / rend)

      // Si aucun prix de vente n'a été spécifié, suggérer Food Cost 35%
      if (p.prixVenteUnitaire <= 0 && p.coutRevientUnitaire > 0) {
        p.prixVenteUnitaire = Math.round((p.coutRevientUnitaire * 2.85) / 500) * 500
      }

      p.margeBruteUnitaire = p.prixVenteUnitaire - p.coutRevientUnitaire
      p.chiffreAffairesPotentiel = rend * p.prixVenteUnitaire
      p.margeBruteTotale = p.chiffreAffairesPotentiel - p.coutTotalPreparation

      p.isPerteBrute = p.margeBruteUnitaire < 0

      if (p.coutRevientUnitaire > 0) {
        p.tauxMargeSurCout = (p.margeBruteUnitaire / p.coutRevientUnitaire) * 100
      }
      if (p.prixVenteUnitaire > 0) {
        p.tauxMarque = (p.margeBruteUnitaire / p.prixVenteUnitaire) * 100
      }
    })

    return map
  }, [fiches, allProducts])

  const platsList = useMemo(() => ['Tous', ...Object.keys(platsGroupes)], [platsGroupes])

  // Ouvrir la modale Détails
  const handleOpenDetailModal = (platNom: string) => {
    setActivePlatDetail(platNom)
    setEditingRowId(null)
    setIsAddingIngredientToExisting(false)
    setEditingSellingPrice(false)
    setEditingYield(false)
    const pData = platsGroupes[platNom]
    setTempDetailSellingPrice(pData?.prixVenteUnitaire ? String(pData.prixVenteUnitaire) : '')
    setTempDetailYield(pData?.rendementPortions || 1)
    setShowDetailModal(true)
  }

  // Mettre à jour le prix de vente et rendement depuis Détails
  const handleUpdateDetailSettings = async (platNom: string) => {
    if (!isAdmin) {
      toast.error('Accès refusé', 'Action réservée à l’administrateur.')
      return
    }

    const newPrice = Number(tempDetailSellingPrice) || 0
    const newYield = Math.max(1, Number(tempDetailYield) || 1)

    try {
      const pData = platsGroupes[platNom]
      const updatedMeta = {
        ...(pData?.meta || {}),
        rendement_portions: newYield,
        prix_vente_unitaire: newPrice,
        cout_revient_portion: Math.round((pData?.coutTotalPreparation || 0) / newYield),
        updated_at: new Date().toISOString()
      }

      const { error } = await supabaseTenant('restaurant_fiches_techniques')
        .update({
          prix_vente_unitaire: newPrice,
          notes: JSON.stringify(updatedMeta)
        })
        .eq('plat_nom', platNom)

      if (error) throw error

      await syncProductSellingPrice(
        platNom,
        newPrice,
        Math.round((pData?.coutTotalPreparation || 0) / newYield),
        updatedMeta
      )

      toast.success('Paramètres mis à jour', `Recette « ${platNom} » actualisée (Prix: ${fmt(newPrice)} | Rendement: ${newYield}).`)
      setEditingSellingPrice(false)
      setEditingYield(false)
      await loadFiches()
      await loadStockCuisine()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Supprimer un ingrédient
  const handleDeleteIngredientRow = (id: string, ingNom: string) => {
    if (!isAdmin) {
      toast.error('Accès refusé', 'Action réservée à l’administrateur.')
      return
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Confirmation de retrait',
      message: `Confirmez-vous le retrait de l'ingrédient « ${ingNom} » de cette fiche technique ?`,
      onConfirm: async () => {
        try {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }))
          const { error } = await supabaseTenant('restaurant_fiches_techniques').delete().eq('id', id)
          if (error) throw error
          toast.success('Ingrédient retiré', `« ${ingNom} » a été supprimé de la recette.`)
          setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} })
          await loadFiches()
        } catch (err: any) {
          toast.error('Erreur', err.message)
          setConfirmDialog(prev => ({ ...prev, isLoading: false }))
        }
      }
    })
  }

  // Supprimer la recette entière
  const handleDeleteEntireRecipe = (platNom: string) => {
    if (!isAdmin) {
      toast.error('Accès refusé', 'Action réservée à l’administrateur.')
      return
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Suppression définitive',
      message: `Confirmez-vous la suppression complète de la fiche technique pour « ${platNom} » ?`,
      onConfirm: async () => {
        try {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }))
          const { error } = await supabaseTenant('restaurant_fiches_techniques').delete().eq('plat_nom', platNom)
          if (error) throw error
          toast.success('Recette supprimée', `La recette « ${platNom} » a été supprimée.`)
          setShowDetailModal(false)
          setActivePlatDetail(null)
          setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} })
          await loadFiches()
        } catch (err: any) {
          toast.error('Erreur', err.message)
          setConfirmDialog(prev => ({ ...prev, isLoading: false }))
        }
      }
    })
  }

  // Lancer la validation d'une préparation (Mode B)
  const handleOpenPrepModal = (platNom: string) => {
    const pData = platsGroupes[platNom]
    setPrepTargetPlat(platNom)
    setPrepNbLots(1)
    setPrepRendementEffectif(pData?.rendementPortions || 10)
    setShowPrepModal(true)
  }

  const handleConfirmPreparation = async () => {
    if (!prepTargetPlat || prepNbLots <= 0) return
    setIsPreping(true)
    try {
      const res = await validerPreparationCuisine({
        company_id: companyId,
        plat_nom: prepTargetPlat,
        nb_lots: Number(prepNbLots),
        rendement_effectif: Number(prepRendementEffectif),
        declare_par: user?.full_name || user?.email || 'Chef Cuisine',
        notes: `Préparation de ${prepRendementEffectif} portions`
      })

      if (!res.success) throw new Error(res.message)

      toast.success('Préparation validée', res.message)
      setShowPrepModal(false)
      await loadStockCuisine()
      await loadFiches()
    } catch (err: any) {
      toast.error('Erreur préparation', err.message)
    } finally {
      setIsPreping(false)
    }
  }

  // Déclarer une perte / invendu
  const handleOpenPerteModal = (platNom: string) => {
    setPerteTargetPlat(platNom)
    setPerteQty(1)
    setPerteMotif('PERIME')
    setShowPerteModal(true)
  }

  const handleConfirmPerte = async () => {
    if (!perteTargetPlat || perteQty <= 0) return
    setIsSavingPerte(true)
    try {
      const pData = platsGroupes[perteTargetPlat]
      const ok = await declarerPertePortions({
        company_id: companyId,
        plat_nom: perteTargetPlat,
        quantite_perdue: Number(perteQty),
        motif: perteMotif,
        declare_par: user?.full_name || user?.email || 'Gérant',
        cout_unitaire: pData?.coutRevientUnitaire || 0
      })

      if (!ok) throw new Error('Impossible d’enregistrer la perte.')

      toast.success('Perte enregistrée', `${perteQty} portion(s) déduite(s) des stocks.`)
      setShowPerteModal(false)
      await loadStockCuisine()
      await loadFiches()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setIsSavingPerte(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête de la Page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <ChefHat className="w-7 h-7 text-rose-600" />
              Fiches Techniques, Rendements & Préparations
            </h1>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
              Secteur Restaurant & Bar
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gestion des rendements, calcul automatique du coût de revient, stock des portions et déstockage cuisine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadFiches(); loadStockCuisine(); }}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition"
            title="Actualiser les données"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>

          {isAdmin ? (
            <button
              onClick={() => {
                setDishNameInput('')
                setDishNotes('')
                setDishSellingPrice('')
                setDishYield(1)
                setProductionMode('UNITE')
                setIngredientsList([])
                setCurrentSelectedProductId('')
                setCurrentCustomIngName('')
                setCurrentQty(1)
                setCurrentUnit('kg')
                setCurrentUnitCost(0)
                setShowAddModal(true)
              }}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nouvelle Fiche Recette
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[11px] text-slate-600 font-medium">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>Paramétrage réservé à l’administrateur</span>
            </div>
          )}
        </div>
      </div>

      {/* Barre d'Onglets Principale */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('recettes')}
          className={clsx(
            'px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition flex items-center gap-2',
            activeTab === 'recettes'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <BookOpen className="w-4 h-4" />
          <span>Fiches Techniques & Marges ({Object.keys(platsGroupes).length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('portions')}
          className={clsx(
            'px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition flex items-center gap-2',
            activeTab === 'portions'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          <Flame className="w-4 h-4 text-amber-500" />
          <span>Préparations Culinaires & Portions du Jour</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ONGLET 1 : FICHES TECHNIQUES, RENDEMENTS & RENTABILITÉ                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'recettes' && (
        <div className="space-y-6">
          {/* Guide informatif si aucune matière première */}
          {cuisineProducts.length === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-black">Attention : Aucune matière première Cuisine enregistrée</span>
                <p className="mt-0.5 text-amber-700">
                  Pour alimenter vos fiches techniques automatiquement, enregistrez vos ingrédients (riz, huile, viande, cubes, farine...) dans <strong>Stocks &gt; Circuit Cuisine</strong>. Le coût de valorisation réel sera récupéré sans saisie manuelle.
                </p>
              </div>
            </div>
          )}

          {/* Grille des fiches existantes */}
          {Object.keys(platsGroupes).length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">Aucune fiche technique enregistrée</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Configurez vos recettes culinaires, définissez le rendement en portions et laissez GESTIO229 calculer les marges et déstockages.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Créer une Fiche Recette
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(platsGroupes).map(p => (
                <div
                  key={p.plat}
                  className={clsx(
                    "bg-white p-5 rounded-3xl border shadow-sm flex flex-col justify-between transition",
                    p.isPerteBrute ? "border-rose-300 bg-rose-50/20" : "border-slate-200 hover:border-rose-200"
                  )}
                >
                  <div>
                    {/* Header Carte Plat */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                          <ChefHat className="w-4 h-4 text-rose-600" />
                          {p.plat}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={clsx(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                            p.modePreparation === 'LOT'
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}>
                            {p.modePreparation === 'LOT' ? `Mode B : Lot (${p.rendementPortions} ${p.unitePortion}s)` : 'Mode A : À l’unité'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {p.ingredients.length} ingrédient(s)
                          </span>
                        </div>
                      </div>

                      {p.modePreparation === 'LOT' && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-medium">Portions prêtes</span>
                          <strong className="text-xs font-black font-mono text-emerald-600">
                            {p.portionsDisponibles} disp.
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Ratios Financiers Clairs */}
                    <div className="space-y-1.5 text-xs pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Coût Total Préparation :</span>
                        <strong className="text-slate-900 font-mono font-bold">{fmt(p.coutTotalPreparation)}</strong>
                      </div>

                      <div className="flex items-center justify-between text-slate-500">
                        <span>Coût de Revient / {p.unitePortion} :</span>
                        <strong className="text-slate-900 font-mono font-bold">{fmt(p.coutRevientUnitaire)}</strong>
                      </div>

                      <div className="flex items-center justify-between text-slate-500">
                        <span>Prix de Vente / {p.unitePortion} :</span>
                        <strong className="text-rose-600 font-mono font-bold">{fmt(p.prixVenteUnitaire)}</strong>
                      </div>

                      <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100">
                        <span className="font-semibold">Marge Brute / Portion :</span>
                        <strong className={clsx('font-mono font-black', p.isPerteBrute ? 'text-rose-600' : 'text-emerald-600')}>
                          {fmt(p.margeBruteUnitaire)}
                          {p.isPerteBrute && ' (Déficit)'}
                        </strong>
                      </div>

                      {p.modePreparation === 'LOT' && (
                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span>CA Potentiel Lot :</span>
                          <span className="font-mono font-bold text-slate-700">{fmt(p.chiffreAffairesPotentiel)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pied de Carte : Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-400 font-medium">
                      Taux Marque : <strong className="text-slate-700 font-mono">{p.tauxMarque.toFixed(1)}%</strong>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {p.modePreparation === 'LOT' && (
                        <button
                          type="button"
                          onClick={() => handleOpenPrepModal(p.plat)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-emerald-200 cursor-pointer"
                          title="Lancer une préparation et déduire les matières"
                        >
                          <Flame className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Préparer</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenDetailModal(p.plat)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Détails</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ONGLET 2 : PRÉPARATIONS CULINAIRES & GESTION DU STOCK DE PORTIONS      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'portions' && (
        <div className="space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 text-blue-900 text-xs">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-black">Cycle des Préparations en Lot (Mode B) :</span>
              <p className="mt-0.5 text-blue-800">
                1. <strong>Validation en Cuisine :</strong> Cliquez sur « Préparer un lot » dès qu'une marmite est cuisinée. Les matières premières réelles sont déduites du stock cuisine une seule fois.<br />
                2. <strong>Ventes à la Caisse :</strong> Chaque portion vendue diminue automatiquement le stock de portions disponibles. Les ingrédients ne sont jamais déduits une seconde fois.<br />
                3. <strong>Pertes en fin de journée :</strong> Déclarez les portions invendues ou jetées pour ajuster les stocks avec exactitude.
              </p>
            </div>
          </div>

          {/* Table des plats préparés avec stock de portions */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-rose-600" />
                Stock Actuel des Plats & Portions Prêtes à Servir
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Plat / Recette</th>
                    <th className="py-3 px-4 text-center">Mode</th>
                    <th className="py-3 px-4 text-center">Rendement Standard</th>
                    <th className="py-3 px-4 text-center">Portions Prêtes</th>
                    <th className="py-3 px-4 text-right">Coût Portion</th>
                    <th className="py-3 px-4 text-right">Prix Portion</th>
                    <th className="py-3 px-4 text-right">Marge Portion</th>
                    <th className="py-3 px-4 text-center">Actions Cuisine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.values(platsGroupes).map(p => (
                    <tr key={p.plat} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4 font-black text-slate-900">
                        {p.plat}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                          p.modePreparation === 'LOT'
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        )}>
                          {p.modePreparation === 'LOT' ? 'En Lot (Portions)' : 'À l’unité (Commande)'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                        {p.rendementPortions} {p.unitePortion}s
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={clsx(
                          "px-2.5 py-1 rounded-xl font-mono font-black text-xs border",
                          p.portionsDisponibles > 5
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : p.portionsDisponibles > 0
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        )}>
                          {p.portionsDisponibles} {p.unitePortion}(s)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700">
                        {fmt(p.coutRevientUnitaire)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-rose-600">
                        {fmt(p.prixVenteUnitaire)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-600">
                        {fmt(p.margeBruteUnitaire)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {p.modePreparation === 'LOT' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPrepModal(p.plat)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              <Flame className="w-3.5 h-3.5" />
                              <span>Préparer Lot</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenPerteModal(p.plat)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-200 cursor-pointer"
                            title="Déclarer des invendus ou pertes"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Pertes</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1 : NOUVELLE FICHE TECHNIQUE / RECETTE AVEC RENDEMENT & 2 MODES     */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp my-8 max-h-[92vh] flex flex-col">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <ChefHat className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Nouvelle Fiche Technique / Recette</h3>
                  <p className="text-xs text-slate-500">Définissez la composition, le mode de production, le rendement et le prix de vente</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFullRecipe} className="overflow-y-auto pr-1 space-y-5 flex-1">
              {/* SECTION A : INFORMATIONS GÉNÉRALES */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  A. Informations Générales
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Nom du Plat ou de la Boisson *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Riz au gras, Pizza Reine, Chawarma Viande, Omelette..."
                      value={dishNameInput}
                      onChange={e => setDishNameInput(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Catégorie</label>
                    <select
                      value={dishCategory}
                      onChange={e => setDishCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      <option value="Plats Cuisinés">Plats Cuisinés</option>
                      <option value="Fast-Food & Pizzas">Fast-Food & Pizzas</option>
                      <option value="Grillades">Grillades</option>
                      <option value="Accompagnements">Accompagnements</option>
                      <option value="Boissons & Cocktails">Boissons & Cocktails</option>
                      <option value="Desserts">Desserts</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      placeholder="Notes ou consignes de préparation (optionnel)"
                      value={dishNotes}
                      onChange={e => setDishNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION B : MODE DE PRODUCTION */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  B. Mode de Production
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setProductionMode('UNITE'); setDishYield(1); }}
                    className={clsx(
                      "p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer",
                      productionMode === 'UNITE'
                        ? "bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 text-rose-950"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                    )}
                  >
                    <div className={clsx("w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5", productionMode === 'UNITE' ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300")}>
                      {productionMode === 'UNITE' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <strong className="text-xs font-black block">Mode A : Recette à l'Unité</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Préparation directe à la commande : <strong>Pizza, Chawarma, Sandwich, Burger, Omelette...</strong> Déstockage des ingrédients à chaque vente.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setProductionMode('LOT'); if (dishYield <= 1) setDishYield(10); }}
                    className={clsx(
                      "p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer",
                      productionMode === 'LOT'
                        ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-950"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                    )}
                  >
                    <div className={clsx("w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5", productionMode === 'LOT' ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300")}>
                      {productionMode === 'LOT' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <strong className="text-xs font-black block">Mode B : Préparation en Lot (Plusieurs Portions)</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Préparation en marmite : <strong>Riz au gras, Sauces, Pâtes, Plats cuisinés...</strong> Déstockage des ingrédients une seule fois lors de la cuisson.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* SECTION C : COMPOSITION DE LA RECETTE (INGRÉDIENTS) */}
              <div className="bg-rose-50/40 p-4 rounded-2xl border border-rose-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                    C. Composition de la Recette (Matières Premières)
                  </label>
                  {cuisineProducts.length > 0 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ✓ {cuisineProducts.length} matière(s) cuisine connectée(s)
                    </span>
                  )}
                </div>

                {/* Recherche & Dropdown Matière Première */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Matière Première (Stock Cuisine)
                    </label>
                    <select
                      value={currentSelectedProductId}
                      onChange={e => handleProductSelect(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      <option value="">-- Choisir dans le Stock Cuisine --</option>
                      {filteredMatiereList.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {p.stock_dispo} {p.unit} | Coût: {fmt(p.cost_price)}/{p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Ou Nom Matière Libre (si non stockée)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Épices secrètes, Sel..."
                      value={currentCustomIngName}
                      onChange={e => setCurrentCustomIngName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>

                {/* Quantité dosée, Unité et Coût unitaire récupéré automatiquement */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Quantité dosée</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={currentQty}
                      onChange={e => setCurrentQty(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Unité de dosage</label>
                    <select
                      value={currentUnit}
                      onChange={e => setCurrentUnit(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      {UNIT_OPTIONS.map(u => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Coût Unitaire Récupéré (FCFA)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={currentUnitCost}
                      onChange={e => setCurrentUnitCost(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>

                {/* Aperçu du coût de ligne en direct */}
                {(() => {
                  const matchedProd = (cuisineProducts.length > 0 ? cuisineProducts : allProducts).find(p => p.id === currentSelectedProductId)
                  const sUnit = matchedProd?.unit || currentUnit
                  const sCost = matchedProd ? matchedProd.cost_price : currentUnitCost
                  const preview = computeLineCost(currentQty, currentUnit, sUnit, sCost)

                  return (
                    <div className="flex items-center justify-between pt-2 border-t border-rose-200/60 text-xs">
                      <span className="text-slate-500 font-medium">
                        Coût calculé pour {currentQty} {currentUnit} : <strong className="text-rose-600 font-mono font-black">{fmt(preview.totalLineCost)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleAddIngredientRow}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Ajouter cette matière
                      </button>
                    </div>
                  )
                })()}
              </div>

              {/* Tableau des ingrédients ajoutés */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                    Ingrédients de la recette ({ingredientsList.length})
                  </label>
                  {ingredientsList.length > 0 && (
                    <span className="text-xs font-bold text-slate-500">
                      Coût total ingrédients : <strong className="text-rose-600 font-mono text-sm">{fmt(totalDraftCost)}</strong>
                    </span>
                  )}
                </div>

                {ingredientsList.length === 0 ? (
                  <div className="p-5 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                    Aucune matière première ajoutée pour le moment.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Matière</th>
                          <th className="py-2.5 px-3 text-center">Quantité</th>
                          <th className="py-2.5 px-3 text-right">Coût Unitaire</th>
                          <th className="py-2.5 px-3 text-right">Coût Ligne</th>
                          <th className="py-2.5 px-2 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ingredientsList.map((row) => (
                          <tr key={row.tempId} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {row.ingredient_nom}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                              {row.quantite_necessaire} {row.unite}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                              {fmt(row.cout_unitaire_dosed)}/{row.unite}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-rose-600">
                              {fmt(row.cout_ligne)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveDraftRow(row.tempId)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
                                title="Retirer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION D : RENDEMENT DE LA PRÉPARATION / NOMBRE DE PORTIONS OBTENUES */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  D. Rendement de la Préparation / Nombre de Portions Obtenues
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      {productionMode === 'LOT' ? 'Nombre de portions obtenues par préparation *' : 'Rendement unitaire'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={productionMode === 'UNITE'}
                      value={productionMode === 'UNITE' ? 1 : dishYield}
                      onChange={e => setDishYield(Math.max(1, Number(e.target.value)))}
                      className={clsx(
                        "w-full px-3 py-2 border rounded-xl text-sm font-mono font-black focus:ring-2 focus:ring-rose-500 outline-none",
                        productionMode === 'UNITE'
                          ? "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
                          : "bg-white text-slate-900 border-slate-200"
                      )}
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {productionMode === 'LOT'
                        ? 'Ex: 10 portions obtenues à partir de 1 kg de riz et des ingrédients dosés.'
                        : 'En Mode A (à l’unité), une préparation équivaut exactement à 1 unité/portion.'}
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Unité de portion
                    </label>
                    <select
                      value={dishYieldUnit}
                      onChange={e => setDishYieldUnit(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      <option value="portion">portion</option>
                      <option value="plat">plat</option>
                      <option value="assiette">assiette</option>
                      <option value="part">part</option>
                      <option value="pièce">pièce</option>
                      <option value="verre">verre</option>
                      <option value="bol">bol</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION E : PRIX ET RENTABILITÉ COMPLÈTE */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  E. Prix de Vente Unitaire (FCFA)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={dishSellingPrice}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
                        setDishSellingPrice(val)
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-black text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Prix de vente unitaire d’une portion facturé au client.
                    </span>
                  </div>

                  {draftUnitCostPrice > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setDishSellingPrice(String(Math.round((draftUnitCostPrice * 2.85) / 500) * 500))}
                        className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                        Suggérer (Food Cost 35%) : {fmt(Math.round((draftUnitCostPrice * 2.85) / 500) * 500)}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* RÉCAPITULATIF FINANCIER EN DIRECT */}
              {ingredientsList.length > 0 && (
                <div className="space-y-3 p-4 bg-slate-900 text-white rounded-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <PieChart className="w-4 h-4" />
                      Récapitulatif Financier Automatique ({resolvedYield} {dishYieldUnit}s)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Coût Total Préparation</span>
                      <strong className="text-sm font-mono font-black">{fmt(totalDraftCost)}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Coût Revient / Portion</span>
                      <strong className="text-sm font-mono font-black text-amber-300">{fmt(draftUnitCostPrice)}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Marge Brute / Portion</span>
                      <strong className={clsx("text-sm font-mono font-black", draftUnitMargin >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {fmt(draftUnitMargin)}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Taux de Marque</span>
                      <strong className="text-sm font-mono font-black text-rose-300">
                        {draftTauxMarque.toFixed(1)} %
                      </strong>
                    </div>
                  </div>

                  {productionMode === 'LOT' && (
                    <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">CA Potentiel Lot</span>
                        <strong className="text-sm font-mono font-black text-white">{fmt(draftPotentialRevenue)}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Marge Brute Totale Lot</span>
                        <strong className={clsx("text-sm font-mono font-black", draftTotalMargin >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {fmt(draftTotalMargin)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {draftUnitMargin < 0 && (
                    <div className="p-2.5 bg-rose-900/60 border border-rose-500/50 rounded-xl text-rose-200 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Attention : Vente à perte ! Le prix de vente est inférieur au coût de revient unitaire.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Bouton de Validation */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingRecipe || ingredientsList.length === 0}
                  className={clsx(
                    "px-6 py-2.5 rounded-2xl text-xs font-black shadow-lg transition flex items-center gap-2",
                    savingRecipe || ingredientsList.length === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 cursor-pointer active:scale-95"
                  )}
                >
                  {savingRecipe ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Enregistrement en cours...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Enregistrer la Fiche Technique</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2 : DÉTAILS D'UNE FICHE TECHNIQUE                                   */}
      {/* ========================================================================= */}
      {showDetailModal && activePlatDetail && platsGroupes[activePlatDetail] && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp my-8 max-h-[90vh] flex flex-col">
            {(() => {
              const p = platsGroupes[activePlatDetail]
              return (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                    <div>
                      <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                        <ChefHat className="w-5 h-5 text-rose-600" />
                        Fiche Technique : {p.plat}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {p.modePreparation === 'LOT' ? `Préparation en lot (${p.rendementPortions} ${p.unitePortion}s)` : 'Préparation à l’unité'}
                      </p>
                    </div>
                    <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto pr-1 space-y-4 flex-1">
                    {/* Indicateurs financiers */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Coût Préparation</span>
                        <strong className="text-xs font-mono font-black text-slate-900">{fmt(p.coutTotalPreparation)}</strong>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Coût / {p.unitePortion}</span>
                        <strong className="text-xs font-mono font-black text-amber-600">{fmt(p.coutRevientUnitaire)}</strong>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Prix Vente</span>
                        <strong className="text-xs font-mono font-black text-rose-600">{fmt(p.prixVenteUnitaire)}</strong>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Marge / Portion</span>
                        <strong className={clsx("text-xs font-mono font-black", p.isPerteBrute ? "text-rose-600" : "text-emerald-600")}>
                          {fmt(p.margeBruteUnitaire)}
                        </strong>
                      </div>
                    </div>

                    {/* Table des ingrédients */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Matière Première</th>
                            <th className="py-2.5 px-3 text-center">Quantité Dosée</th>
                            <th className="py-2.5 px-3 text-right">Coût Unitaire</th>
                            <th className="py-2.5 px-3 text-right">Total Ligne</th>
                            {isAdmin && <th className="py-2.5 px-2 text-center w-10"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {p.ingredients.map(ing => (
                            <tr key={ing.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold text-slate-900">{ing.ingredient_nom}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                                {ing.quantite_necessaire} {ing.unite}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                {fmt(ing.cout_unitaire)}/{ing.unite}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-rose-600">
                                {fmt(ing.cout_matiere_ligne)}
                              </td>
                              {isAdmin && (
                                <td className="py-2.5 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteIngredientRow(ing.id, ing.ingredient_nom)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paramètres modifiables par l'administrateur */}
                    {isAdmin && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Paramètres de Vente & Rendement (Administrateur)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">
                              Prix de vente unitaire ({p.unitePortion})
                            </label>
                            <input
                              type="number"
                              value={tempDetailSellingPrice}
                              onChange={e => setTempDetailSellingPrice(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-900 outline-none"
                            />
                          </div>

                          {p.modePreparation === 'LOT' && (
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                Rendement en portions
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={tempDetailYield}
                                onChange={e => setTempDetailYield(Math.max(1, Number(e.target.value)))}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-900 outline-none"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateDetailSettings(p.plat)}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Enregistrer les modifications
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pied de la modale */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteEntireRecipe(p.plat)}
                        className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Supprimer la fiche complète</span>
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      onClick={() => setShowDetailModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Fermer
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3 : VALIDATION D'UNE PRÉPARATION EN CUISINE (MODE B : MARMITE)     */}
      {/* ========================================================================= */}
      {showPrepModal && prepTargetPlat && platsGroupes[prepTargetPlat] && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Valider la Préparation en Cuisine</h3>
                  <p className="text-xs text-slate-500">{prepTargetPlat}</p>
                </div>
              </div>
              <button onClick={() => setShowPrepModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs">
                <p className="font-bold">Déstockage automatique unique :</p>
                <p className="mt-0.5 text-emerald-800">
                  En validant cette préparation, les matières premières nécessaires seront immédiatement déduites du stock cuisine. Les portions obtenues seront ajoutées au stock de vente. La vente ultérieure ne redéduira pas les ingrédients.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nombre de marmites / lots</label>
                  <input
                    type="number"
                    min="1"
                    value={prepNbLots}
                    onChange={e => {
                      const nb = Math.max(1, Number(e.target.value))
                      setPrepNbLots(nb)
                      setPrepRendementEffectif(nb * (platsGroupes[prepTargetPlat]?.rendementPortions || 10))
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Portions obtenues</label>
                  <input
                    type="number"
                    min="1"
                    value={prepRendementEffectif}
                    onChange={e => setPrepRendementEffectif(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-emerald-600 outline-none"
                  />
                </div>
              </div>

              {/* Bilan prévisionnel */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Coût total des ingrédients déduits :</span>
                  <strong className="text-slate-900 font-mono font-bold">
                    {fmt((platsGroupes[prepTargetPlat]?.coutTotalPreparation || 0) * prepNbLots)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Coût de revient par portion :</span>
                  <strong className="text-amber-600 font-mono font-bold">
                    {fmt(prepRendementEffectif > 0 ? Math.round(((platsGroupes[prepTargetPlat]?.coutTotalPreparation || 0) * prepNbLots) / prepRendementEffectif) : 0)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPrepModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmPreparation}
                disabled={isPreping}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
              >
                {isPreping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
                <span>Valider la Préparation (+{prepRendementEffectif} portions)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4 : DÉCLARATION DES PERTES / INVENDUS DE PORTIONS                  */}
      {/* ========================================================================= */}
      {showPerteModal && perteTargetPlat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600" />
                Déclarer Pertes / Invendus ({perteTargetPlat})
              </h3>
              <button onClick={() => setShowPerteModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nombre de portions perdues / jetées</label>
                <input
                  type="number"
                  min="1"
                  value={perteQty}
                  onChange={e => setPerteQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Motif de la perte</label>
                <select
                  value={perteMotif}
                  onChange={e => setPerteMotif(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="PERIME">Invendu / Périmé en fin de service</option>
                  <option value="ALTERATION">Altération / Problème de cuisson</option>
                  <option value="ERREUR_COMMANDE">Erreur de commande</option>
                  <option value="CONSOMMATION_INTERNE">Repas du personnel</option>
                  <option value="AUTRE">Autre motif</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPerteModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmPerte}
                disabled={isSavingPerte}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-rose-600/30 cursor-pointer"
              >
                {isSavingPerte ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Enregistrer la Perte (-{perteQty} portions)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE DE CONFIRMATION GÉNÉRIQUE */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} })}
        isLoading={confirmDialog.isLoading}
      />
    </div>
  )
}

export default RecettesFichesPage
