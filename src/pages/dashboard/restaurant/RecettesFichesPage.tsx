import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen, Plus, RefreshCw, Scale, DollarSign, PieChart,
  Percent, Trash2, Edit3, ChevronRight, X, AlertCircle, Sparkles,
  Search, Eye, CheckCircle2, AlertTriangle, Layers, Info, ChefHat,
  TrendingUp, TrendingDown, ArrowUpRight
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { ConfirmModal } from '../../../components/modals'
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

  // Si unités non convertibles directement (ex: pièce vers kg), ratio direct 1:1
  return 1
}

interface CuisineProduct {
  id: string
  code: string
  name: string
  unit: string
  cost_price: number
  selling_price?: number
  stock_dispo: number
  restaurant_circuit?: string
  is_matiere_premiere?: boolean
}

interface IngredientDraft {
  tempId: string
  productId?: string
  ingredient_nom: string
  quantite_necessaire: number
  unite: string
  storage_unit: string
  cout_unitaire_stock: number // coût unitaire dans l'unité du stock (ex: 2000 FCFA/kg)
  cout_unitaire_dosed: number // coût pour l'unité dosée (ex: 2 FCFA/g)
  cout_ligne: number // cout_unitaire_dosed * quantite_necessaire
  stock_disponible: number
  notes?: string
}

export const RecettesFichesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [fiches, setFiches] = useState<any[]>([])
  const [cuisineProducts, setCuisineProducts] = useState<CuisineProduct[]>([])
  const [allProducts, setAllProducts] = useState<CuisineProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlat, setSelectedPlat] = useState<string>('Tous')

  // Modales
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [activePlatDetail, setActivePlatDetail] = useState<string | null>(null)

  // Formulaire Création Multi-ingrédients & Prix de vente
  const [dishNameInput, setDishNameInput] = useState('')
  const [dishNotes, setDishNotes] = useState('')
  const [dishSellingPrice, setDishSellingPrice] = useState<string>('')
  const [ingredientsList, setIngredientsList] = useState<IngredientDraft[]>([])
  const [savingRecipe, setSavingRecipe] = useState(false)

  // Ingrédient en cours d'ajout rapide dans le modal de création
  const [currentSelectedProductId, setCurrentSelectedProductId] = useState('')
  const [currentCustomIngName, setCurrentCustomIngName] = useState('')
  const [currentQty, setCurrentQty] = useState<number>(1)
  const [currentUnit, setCurrentUnit] = useState<string>('kg')
  const [currentUnitCost, setCurrentUnitCost] = useState<number>(0)
  const [searchMatiere, setSearchMatiere] = useState('')

  // État d'édition dans la modale Détails
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<number>(1)
  const [editUnit, setEditUnit] = useState<string>('kg')
  const [editCostU, setEditCostU] = useState<number>(0)
  const [isAddingIngredientToExisting, setIsAddingIngredientToExisting] = useState(false)
  const [editingSellingPrice, setEditingSellingPrice] = useState(false)
  // Modale personnalisée de confirmation de suppression
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
        .select('id, code, name, unit, cost_price, selling_price, stock_vente, stock_magasin, sector_meta, restaurant_circuit, is_matiere_premiere')
        .order('name')

      if (error) throw error
      if (data) {
        const mapped: CuisineProduct[] = data.map((p: any) => {
          const isMatiere = Boolean(p.sector_meta?.is_matiere_premiere || p.is_matiere_premiere)
          const pCircuit = p.sector_meta?.restaurant_circuit || p.restaurant_circuit || (isMatiere ? 'CUISINE' : 'BAR')
          const stockDispo = (Number(p.stock_vente) || 0) + (Number(p.stock_magasin) || 0)
          return {
            id: p.id,
            code: p.code || '',
            name: p.name,
            unit: p.unit || 'kg',
            cost_price: Number(p.cost_price) || 0,
            selling_price: Number(p.selling_price) || 0,
            stock_dispo: stockDispo,
            restaurant_circuit: pCircuit,
            is_matiere_premiere: isMatiere
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

  // Matières premières disponibles dans le dropdown avec filtre de recherche
  const filteredMatiereList = useMemo(() => {
    const list = cuisineProducts.length > 0 ? cuisineProducts : allProducts
    if (!searchMatiere) return list
    const q = searchMatiere.toLowerCase()
    return list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
  }, [cuisineProducts, allProducts, searchMatiere])

  // Mise à jour de l'ingrédient actif lors de la sélection du produit dans la liste déroulante
  const handleProductSelect = (prodId: string) => {
    setCurrentSelectedProductId(prodId)
    const prod = (cuisineProducts.length > 0 ? cuisineProducts : allProducts).find(p => p.id === prodId)
    if (prod) {
      setCurrentCustomIngName(prod.name)
      const baseUnit = prod.unit || 'kg'
      setCurrentUnit(baseUnit)
      setCurrentUnitCost(prod.cost_price)
    }
  }

  // Calcul du coût unitaire dosé et du coût de la ligne en tenant compte des conversions d'unités
  const computeLineCost = (qty: number, chosenUnit: string, storageUnit: string, costPricePerStorageUnit: number) => {
    const factor = getUnitFactor(storageUnit, chosenUnit)
    // Ex: Stock = 2000 FCFA/kg. Dosed unit = g. factor = 0.001 => cost per g = 2 FCFA.
    const unitCostForChosenUnit = costPricePerStorageUnit * factor
    const totalLineCost = Math.round(qty * unitCostForChosenUnit)
    return { unitCostForChosenUnit, totalLineCost }
  }

  // Ajouter une ligne d'ingrédient à la liste du plat en cours
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

    // Réinitialiser les champs de saisie de l'ingrédient
    setCurrentSelectedProductId('')
    setCurrentCustomIngName('')
    setCurrentQty(1)
    setCurrentUnit('kg')
    setCurrentUnitCost(0)
    setSearchMatiere('')
    toast.success('Ingrédient ajouté au plat', `${ingName} ajouté (${currentQty} ${currentUnit}).`)
  }

  // Supprimer une ligne dans le brouillon
  const handleRemoveDraftRow = (tempId: string) => {
    setIngredientsList(prev => prev.filter(r => r.tempId !== tempId))
  }

  // Coût total matières premières de la recette en cours de création
  const totalDraftCost = useMemo(() => {
    return ingredientsList.reduce((acc, row) => acc + (row.cout_ligne || 0), 0)
  }, [ingredientsList])

  // Marge brute unitaire du brouillon en cours de création
  const draftMargin = useMemo(() => {
    return Number(dishSellingPrice || 0) - totalDraftCost
  }, [dishSellingPrice, totalDraftCost])

  // Taux de marge sur coût matière (draft) : (Marge ÷ Coût) * 100
  const draftTauxMargeSurCout = useMemo(() => {
    if (totalDraftCost <= 0) return 0
    return ((draftMargin / totalDraftCost) * 100)
  }, [draftMargin, totalDraftCost])

  // Taux de marque (draft) : (Marge ÷ Prix de vente) * 100
  const draftTauxMarque = useMemo(() => {
    const pv = Number(dishSellingPrice || 0)
    if (pv <= 0) return 0
    return ((draftMargin / pv) * 100)
  }, [draftMargin, dishSellingPrice])

  // Synchroniser le prix de vente unitaire dans le catalogue products (POS)
  const syncProductSellingPrice = async (platNom: string, price: number) => {
    if (!companyId || price <= 0) return
    try {
      const match = allProducts.find(p => p.name.trim().toLowerCase() === platNom.trim().toLowerCase())
      if (match) {
        await supabaseTenant('products').update({ selling_price: price }).eq('id', match.id)
      }
    } catch (err: any) {
      console.warn('[Recettes] Synchronisation produit POS:', err.message)
    }
  }

  // Enregistrer le plat complet avec tous ses ingrédients et son prix de vente unitaire
  const handleSaveFullRecipe = async (e: React.FormEvent) => {
    e.preventDefault()
    const pNom = dishNameInput.trim()
    if (!pNom) {
      toast.error('Nom manquant', 'Veuillez saisir ou sélectionner le nom du plat ou de la boisson.')
      return
    }
    if (ingredientsList.length === 0) {
      toast.error('Aucun ingrédient', 'Veuillez ajouter au moins une matière première à la recette.')
      return
    }
    const finalPrixVente = Number(dishSellingPrice) || 0

    setSavingRecipe(true)
    try {
      const recordsToInsert = ingredientsList.map(row => ({
        plat_nom: pNom,
        ingredient_nom: row.ingredient_nom,
        quantite_necessaire: Number(row.quantite_necessaire),
        unite: row.unite,
        cout_unitaire: Number(row.cout_unitaire_dosed),
        cout_matiere_ligne: Math.round(row.cout_ligne),
        prix_vente_unitaire: finalPrixVente,
        notes: dishNotes ? dishNotes.trim() : undefined
      }))

      const { error } = await supabaseTenant('restaurant_fiches_techniques').insert(recordsToInsert)
      if (error) throw error

      // Synchroniser le prix de vente dans le catalogue products pour le POS
      if (finalPrixVente > 0) {
        await syncProductSellingPrice(pNom, finalPrixVente)
      }

      toast.success(
        'Fiche technique enregistrée',
        `Recette ${pNom} enregistrée (Coût: ${fmt(totalDraftCost)} | Prix: ${fmt(finalPrixVente)} | Marge: ${fmt(finalPrixVente - totalDraftCost)}).`
      )

      // Réinitialisation
      setShowAddModal(false)
      setDishNameInput('')
      setDishNotes('')
      setDishSellingPrice('')
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

  // Regroupement par plat avec calcul des indicateurs financiers complets
  const platsGroupes = useMemo(() => {
    const map: Record<string, {
      plat: string
      ingredients: any[]
      coutTotal: number
      prixVenteUnitaire: number
      margeBruteUnitaire: number
      tauxMargeSurCout: number
      tauxMarque: number
      isPerteBrute: boolean
    }> = {}

    fiches.forEach(f => {
      if (!map[f.plat_nom]) {
        // Chercher le prix de vente défini dans la fiche ou dans le catalogue products
        const fichePrice = Number(f.prix_vente_unitaire) || 0
        const matchedProd = allProducts.find(p => p.name.trim().toLowerCase() === f.plat_nom.trim().toLowerCase())
        const resolvedPrice = fichePrice > 0 ? fichePrice : (matchedProd?.selling_price || 0)

        map[f.plat_nom] = {
          plat: f.plat_nom,
          ingredients: [],
          coutTotal: 0,
          prixVenteUnitaire: resolvedPrice,
          margeBruteUnitaire: 0,
          tauxMargeSurCout: 0,
          tauxMarque: 0,
          isPerteBrute: false
        }
      }

      // Si une ligne ultérieure a un prix renseigné, l'adopter
      if (Number(f.prix_vente_unitaire) > 0 && map[f.plat_nom].prixVenteUnitaire === 0) {
        map[f.plat_nom].prixVenteUnitaire = Number(f.prix_vente_unitaire)
      }

      map[f.plat_nom].ingredients.push(f)
      map[f.plat_nom].coutTotal += Number(f.cout_matiere_ligne) || 0
    })

    Object.values(map).forEach(p => {
      // Si aucun prix de vente n'a été spécifié par le gérant, proposer un prix basé sur 35% Food Cost (coeff 2.85)
      if (p.prixVenteUnitaire <= 0 && p.coutTotal > 0) {
        p.prixVenteUnitaire = Math.round((p.coutTotal * 2.85) / 500) * 500
      }

      p.margeBruteUnitaire = p.prixVenteUnitaire - p.coutTotal
      p.isPerteBrute = p.margeBruteUnitaire < 0

      // Taux de marge sur coût matière : (Marge / Coût) * 100
      p.tauxMargeSurCout = p.coutTotal > 0 ? (p.margeBruteUnitaire / p.coutTotal) * 100 : 0

      // Taux de marque : (Marge / Prix de vente) * 100
      p.tauxMarque = p.prixVenteUnitaire > 0 ? (p.margeBruteUnitaire / p.prixVenteUnitaire) * 100 : 0
    })

    return map
  }, [fiches, allProducts])

  const platsList = useMemo(() => ['Tous', ...Object.keys(platsGroupes)], [platsGroupes])

  // Ouvrir la modale Détails pour un plat
  const handleOpenDetailModal = (platNom: string) => {
    setActivePlatDetail(platNom)
    setEditingRowId(null)
    setIsAddingIngredientToExisting(false)
    setEditingSellingPrice(false)
    const pData = platsGroupes[platNom]
    const currentPrice = pData ? pData.prixVenteUnitaire : 0
    setTempDetailSellingPrice(currentPrice > 0 ? String(currentPrice) : '')
    setShowDetailModal(true)
  }

  // Sauvegarder la modification du prix de vente unitaire depuis la modale Détails
  const handleUpdateDetailSellingPrice = async (platNom: string) => {
    const newPrice = Number(tempDetailSellingPrice) || 0
    if (newPrice < 0) {
      toast.error('Prix invalide', 'Le prix de vente ne peut pas être négatif.')
      return
    }

    try {
      // Mettre à jour toutes les lignes de ce plat dans restaurant_fiches_techniques
      const { error } = await supabaseTenant('restaurant_fiches_techniques')
        .update({ prix_vente_unitaire: newPrice })
        .eq('plat_nom', platNom)

      if (error) throw error

      // Synchroniser le catalogue de vente (POS)
      await syncProductSellingPrice(platNom, newPrice)

      toast.success('Prix de vente mis à jour', `Nouveau prix pour ${platNom} : ${fmt(newPrice)}. Marges recalculées instantanément.`)
      setEditingSellingPrice(false)
      await loadFiches()
      await loadStockCuisine()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Supprimer une ligne d'ingrédient spécifique avec modale personnalisée gestio229.com
  const handleDeleteIngredientRow = (id: string, ingNom: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'gestio229.com indique',
      message: `Confirmez-vous la suppression de l'ingrédient ${ingNom} de cette recette ?`,
      onConfirm: async () => {
        try {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }))
          const { error } = await supabaseTenant('restaurant_fiches_techniques').delete().eq('id', id)
          if (error) throw error
          toast.success('Ingrédient supprimé', `"${ingNom}" a été retiré de la recette.`)
          setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} })
          await loadFiches()
        } catch (err: any) {
          toast.error('Erreur', err.message)
          setConfirmDialog(prev => ({ ...prev, isLoading: false }))
        }
      }
    })
  }

  // Supprimer la recette entière avec modale personnalisée gestio229.com
  const handleDeleteEntireRecipe = (platNom: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'gestio229.com indique',
      message: `Confirmez-vous la suppression définitive de la recette et des fiches techniques pour "${platNom}" ?`,
      onConfirm: async () => {
        try {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }))
          const { error } = await supabaseTenant('restaurant_fiches_techniques').delete().eq('plat_nom', platNom)
          if (error) throw error
          toast.success('Recette supprimée', `La recette "${platNom}" a été entièrement supprimée.`)
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

  // Démarrer l'édition en ligne d'une matière première dans la modale Détails
  const handleStartEditRow = (row: any) => {
    setEditingRowId(row.id)
    setEditQty(Number(row.quantite_necessaire) || 1)
    setEditUnit(row.unite || 'kg')
    setEditCostU(Number(row.cout_unitaire) || 0)
  }

  // Sauvegarder la modification d'une ligne d'ingrédient
  const handleSaveEditRow = async (rowId: string) => {
    if (editQty <= 0) {
      toast.error('Quantité invalide', 'La quantité doit être supérieure à 0.')
      return
    }
    const coutLigne = Math.round(Number(editQty) * Number(editCostU))
    try {
      const { error } = await supabaseTenant('restaurant_fiches_techniques')
        .update({
          quantite_necessaire: Number(editQty),
          unite: editUnit,
          cout_unitaire: Number(editCostU),
          cout_matiere_ligne: coutLigne
        })
        .eq('id', rowId)

      if (error) throw error
      toast.success('Ligne mise à jour', 'Quantité et coût recalculés avec succès.')
      setEditingRowId(null)
      await loadFiches()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Ajouter un ingrédient supplémentaire directement dans une recette existante depuis la modale Détails
  const handleAddIngredientToExistingRecipe = async (platNom: string) => {
    const ingName = currentCustomIngName.trim()
    if (!ingName) {
      toast.error('Attention', 'Veuillez sélectionner une matière première.')
      return
    }
    if (currentQty <= 0) {
      toast.error('Attention', 'La quantité doit être supérieure à 0.')
      return
    }

    const matchedProd = (cuisineProducts.length > 0 ? cuisineProducts : allProducts).find(p => p.id === currentSelectedProductId)
    const storageUnit = matchedProd?.unit || currentUnit
    const stockCost = matchedProd ? matchedProd.cost_price : currentUnitCost
    const { unitCostForChosenUnit, totalLineCost } = computeLineCost(currentQty, currentUnit, storageUnit, stockCost)

    const currentPlatObj = platsGroupes[platNom]
    const pVente = currentPlatObj ? currentPlatObj.prixVenteUnitaire : 0

    try {
      const { error } = await supabaseTenant('restaurant_fiches_techniques').insert({
        plat_nom: platNom,
        ingredient_nom: ingName,
        quantite_necessaire: Number(currentQty),
        unite: currentUnit,
        cout_unitaire: Number(unitCostForChosenUnit),
        cout_matiere_ligne: Math.round(totalLineCost),
        prix_vente_unitaire: pVente
      })

      if (error) throw error
      toast.success('Ingrédient ajouté', `${ingName} ajouté à la recette ${platNom}.`)
      setIsAddingIngredientToExisting(false)
      setCurrentSelectedProductId('')
      setCurrentCustomIngName('')
      setCurrentQty(1)
      setCurrentUnitCost(0)
      await loadFiches()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Plat actuellement inspecté dans la modale Détails
  const activeDetailData = activePlatDetail ? platsGroupes[activePlatDetail] : null

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-rose-600" />
            Fiches Techniques & Marge Unitaire
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Recettes, décomposition des matières premières, prix de vente unitaire, marge brute et taux de marque
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadFiches(); loadStockCuisine(); }}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition"
            title="Rafraîchir"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => {
              setDishNameInput('')
              setDishNotes('')
              setDishSellingPrice(0)
              setIngredientsList([])
              setCurrentSelectedProductId('')
              setCurrentCustomIngName('')
              setCurrentQty(1)
              setCurrentUnit('kg')
              setCurrentUnitCost(0)
              setShowAddModal(true)
            }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle Fiche Recette
          </button>
        </div>
      </div>

      {/* Guide informatif si aucun produit Cuisine disponible */}
      {cuisineProducts.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-black">Attention : Aucune matière première Cuisine enregistrée</span>
            <p className="mt-0.5 text-amber-700">
              Pour des fiches techniques automatisées, ajoutez vos ingrédients (poulet, huile, riz, légumes, etc.) dans l'onglet <strong>Stocks &gt; Circuit Cuisine</strong> ou activez l'option <em>Matière Première</em> sur vos fiches produits. Vous pouvez néanmoins saisir des matières libres dès à présent.
            </p>
          </div>
        </div>
      )}

      {/* Cartes Synthèse Rentabilité et Marge par Plat */}
      {fiches.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">Aucune fiche technique enregistrée</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Créez votre première recette pour associer les ingrédients Cuisine et calculer votre Food Cost et marge exacte.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nouvelle Fiche Recette
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(platsGroupes).map(p => {
            return (
              <div
                key={p.plat}
                className={clsx(
                  "bg-white p-5 rounded-3xl border shadow-sm flex flex-col justify-between transition",
                  p.isPerteBrute ? "border-rose-300 bg-rose-50/20" : "border-slate-200 hover:border-rose-200"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <ChefHat className="w-4 h-4 text-rose-600" />
                      {p.plat}
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                      {p.ingredients.length} matière(s)
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Coût Matière Total :</span>
                      <strong className="text-slate-900 font-mono font-bold">{fmt(p.coutTotal)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Prix Vente Unitaire :</span>
                      <strong className="text-rose-600 font-mono font-bold">{fmt(p.prixVenteUnitaire)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Marge Brute Unitaire :</span>
                      <strong className={clsx('font-mono font-black', p.isPerteBrute ? 'text-rose-600' : 'text-emerald-600')}>
                        {fmt(p.margeBruteUnitaire)}
                        {p.isPerteBrute && ' (PERTE)'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-400">Taux Marque :</span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-lg font-bold font-mono text-[11px]",
                      p.isPerteBrute ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"
                    )}>
                      {p.tauxMarque.toFixed(1)} %
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenDetailModal(p.plat)}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-rose-600 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 transition shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5" /> Détails
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tableau détaillé de décomposition des recettes */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-600" />
            <h3 className="font-black text-slate-900 text-sm">Décomposition Détaillée des Recettes & Marges</h3>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {platsList.map(pl => (
              <button
                key={pl}
                onClick={() => setSelectedPlat(pl)}
                className={clsx(
                  'px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap',
                  selectedPlat === pl ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {pl}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Plat / Recette</th>
                <th className="py-3 px-4">Matière Première</th>
                <th className="py-3 px-4 text-center">Quantité Dosée</th>
                <th className="py-3 px-4 text-right">Coût Unitaire Dosé</th>
                <th className="py-3 px-4 text-right">Coût Ligne</th>
                <th className="py-3 px-4 text-right">Prix Vente Plat</th>
                <th className="py-3 px-4 text-right">Marge Brute Plat</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fiches
                .filter(f => selectedPlat === 'Tous' || f.plat_nom === selectedPlat)
                .map((f) => {
                  const platInfo = platsGroupes[f.plat_nom]
                  const pv = platInfo ? platInfo.prixVenteUnitaire : 0
                  const mb = platInfo ? platInfo.margeBruteUnitaire : 0
                  const isPerte = mb < 0

                  return (
                    <tr key={f.id} className="hover:bg-slate-50/60 transition group">
                      <td className="py-3 px-4 font-black text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{f.plat_nom}</span>
                          <button
                            onClick={() => handleOpenDetailModal(f.plat_nom)}
                            className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-900"
                            title="Voir la recette complète"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{f.ingredient_nom}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                        {f.quantite_necessaire} {f.unite}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">{fmt(f.cout_unitaire)}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-rose-600">
                        {fmt(f.cout_matiere_ligne)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {fmt(pv)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={clsx(isPerte ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded' : 'text-emerald-600')}>
                          {fmt(mb)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenDetailModal(f.plat_nom)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1 transition"
                          >
                            <Eye className="w-3 h-3" /> Détails
                          </button>
                          <button
                            onClick={() => handleDeleteIngredientRow(f.id, f.ingredient_nom)}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition"
                            title="Supprimer cet ingrédient"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1 : CRÉATION MULTI-INGRÉDIENTS + PRIX DE VENTE & MARGE EN DIRECT   */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp my-8 max-h-[90vh] flex flex-col">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Nouvelle Fiche Technique / Recette</h3>
                  <p className="text-xs text-slate-500">Associez les matières premières réelles et fixez le prix de vente unitaire</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-5 flex-1">
              {/* Étape 1 : Nom du Plat ou Boisson */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  1. Nom du Plat ou de la Boisson *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Poulet Braisé, Cocktail Mojito, Thieb..."
                      value={dishNameInput}
                      onChange={e => setDishNameInput(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                  <div>
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

              {/* Étape 2 : Bloc d'Ajout d'une Matière Première */}
              <div className="bg-rose-50/40 p-4 rounded-2xl border border-rose-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                    2. Sélectionner une Matière Première (Stock Cuisine)
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

                {/* Quantité dosée, Unité et Coût unitaire moyen */}
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
                      Coût Unitaire (FCFA)
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

                {/* Aperçu du coût de la ligne en direct */}
                {(() => {
                  const matchedProd = (cuisineProducts.length > 0 ? cuisineProducts : allProducts).find(p => p.id === currentSelectedProductId)
                  const sUnit = matchedProd?.unit || currentUnit
                  const sCost = matchedProd ? matchedProd.cost_price : currentUnitCost
                  const preview = computeLineCost(currentQty, currentUnit, sUnit, sCost)

                  return (
                    <div className="flex items-center justify-between pt-2 border-t border-rose-200/60 text-xs">
                      <span className="text-slate-500 font-medium">
                        Coût estimé pour {currentQty} {currentUnit} : <strong className="text-rose-600 font-mono">{fmt(preview.totalLineCost)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleAddIngredientRow}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition"
                      >
                        <Plus className="w-4 h-4" /> + Ajouter cette matière première
                      </button>
                    </div>
                  )
                })()}
              </div>

              {/* Étape 3 : Liste des ingrédients ajoutés pour ce plat */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                    3. Ingrédients de la recette ({ingredientsList.length})
                  </label>
                  {ingredientsList.length > 0 && (
                    <span className="text-xs font-bold text-slate-500">
                      Coût matières calculé : <strong className="text-rose-600 font-mono text-sm">{fmt(totalDraftCost)}</strong>
                    </span>
                  )}
                </div>

                {ingredientsList.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                    Aucune matière première ajoutée pour le moment. Sélectionnez une matière ci-dessus et cliquez sur <strong>"+ Ajouter cette matière première"</strong>.
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
                              {row.stock_disponible > 0 && (
                                <span className="ml-2 text-[10px] text-slate-400 font-normal">
                                  (Stock disp: {row.stock_disponible} {row.storage_unit})
                                </span>
                              )}
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
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition"
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

              {/* Étape 4 : Prix de vente unitaire et calcul automatique de la marge brute */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                  4. Prix de Vente Unitaire (FCFA)
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
                      Renseignez le prix de vente unitaire TTC facturé au client.
                    </span>
                  </div>

                  {/* Bouton de suggestion rapide (Food Cost 35%) */}
                  {totalDraftCost > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDishSellingPrice(String(Math.round((totalDraftCost * 2.85) / 500) * 500))}
                        className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                        Suggérer : {fmt(Math.round((totalDraftCost * 2.85) / 500) * 500)}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Synthèse Financière : Coût total, Prix de vente et Marge brute unitaire */}
              {ingredientsList.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-900 text-white p-3.5 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Coût Matière Total
                      </span>
                      <p className="text-lg font-black font-mono mt-0.5">{fmt(totalDraftCost)}</p>
                    </div>

                    <div className="bg-slate-900 text-white p-3.5 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Prix de Vente Unitaire
                      </span>
                      <p className="text-lg font-black font-mono text-rose-300 mt-0.5">
                        {fmt(dishSellingPrice || 0)}
                      </p>
                    </div>

                    <div className={clsx(
                      "p-3.5 rounded-2xl text-white transition",
                      draftMargin < 0 ? "bg-rose-700" : "bg-emerald-700"
                    )}>
                      <span className="text-[10px] font-bold uppercase tracking-wider block text-white/80">
                        Marge Brute Unitaire
                      </span>
                      <p className="text-lg font-black font-mono mt-0.5">
                        {fmt(draftMargin)}
                      </p>
                    </div>
                  </div>

                  {/* Signalement en cas de perte brute */}
                  {draftMargin < 0 && (
                    <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl flex items-center gap-2 text-rose-900 text-xs font-bold animate-pulse">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        Attention : Perte brute unitaire de {fmt(Math.abs(draftMargin))}. Le prix de vente ({fmt(dishSellingPrice)}) est inférieur au coût des matières premières ({fmt(totalDraftCost)}).
                      </span>
                    </div>
                  )}

                  {/* Ratios : Taux de marge sur coût & Taux de marque */}
                  {dishSellingPrice > 0 && totalDraftCost > 0 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between text-xs text-slate-600">
                      <div>
                        <span className="font-bold">Taux de marge sur coût matière : </span>
                        <strong className="font-mono text-slate-900">{draftTauxMargeSurCout.toFixed(1)} %</strong>
                        <span className="text-[10px] text-slate-400 ml-1">(Marge ÷ Coût)</span>
                      </div>
                      <div>
                        <span className="font-bold">Taux de marque : </span>
                        <strong className="font-mono text-slate-900">{draftTauxMarque.toFixed(1)} %</strong>
                        <span className="text-[10px] text-slate-400 ml-1">(Marge ÷ Prix Vente)</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Modal Actions */}
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingRecipe || ingredientsList.length === 0 || !dishNameInput.trim()}
                onClick={handleSaveFullRecipe}
                className={clsx(
                  "px-5 py-2 text-white font-black rounded-xl text-xs shadow-md transition flex items-center gap-2",
                  savingRecipe || ingredientsList.length === 0 || !dishNameInput.trim()
                    ? "bg-slate-300 cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/25"
                )}
              >
                {savingRecipe ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Enregistrer la Recette Complète
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2 : DÉTAILS, CONSULTATION, ÉDITION DES PRIX ET SUPPRESSION          */}
      {/* ========================================================================= */}
      {showDetailModal && activeDetailData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp my-8 max-h-[90vh] flex flex-col">
            
            {/* Header Modal Détails */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-900 text-lg">{activeDetailData.plat}</h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                      {activeDetailData.ingredients.length} matière(s) première(s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Décomposition unitaire, prix de vente, marge brute, taux de marque et édition
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteEntireRecipe(activeDetailData.plat)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  title="Supprimer la recette entière"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer Recette
                </button>
                <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto pr-1 space-y-5 flex-1">
              {/* Synthèse Financière Détaillée */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Coût total des matières premières */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Coût Matière Total
                  </span>
                  <p className="text-lg font-black font-mono text-slate-900 mt-1">
                    {fmt(activeDetailData.coutTotal)}
                  </p>
                </div>

                {/* 2. Prix de vente unitaire (avec bouton de modification rapide) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Prix Vente Unitaire
                      </span>
                      {!editingSellingPrice && (
                        <button
                          onClick={() => setEditingSellingPrice(true)}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" /> Modifier
                        </button>
                      )}
                    </div>

                    {editingSellingPrice ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={tempDetailSellingPrice}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
                            setTempDetailSellingPrice(val)
                          }}
                          className="w-24 px-2 py-1 bg-white border border-rose-300 rounded font-mono font-bold text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                        <button
                          onClick={() => handleUpdateDetailSellingPrice(activeDetailData.plat)}
                          className="px-2 py-1 bg-rose-600 text-white rounded text-[11px] font-bold hover:bg-rose-700 transition"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditingSellingPrice(false)}
                          className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[11px] font-bold"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <p className="text-lg font-black font-mono text-rose-600 mt-1">
                        {fmt(activeDetailData.prixVenteUnitaire)}
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Marge brute unitaire */}
                <div className={clsx(
                  "p-4 rounded-2xl border flex flex-col justify-between",
                  activeDetailData.isPerteBrute ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-emerald-50 border-emerald-200 text-emerald-950"
                )}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                      Marge Brute Unitaire
                    </span>
                    <p className="text-lg font-black font-mono mt-1">
                      {fmt(activeDetailData.margeBruteUnitaire)}
                      {activeDetailData.isPerteBrute && ' (PERTE)'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ratios : Taux de marge sur coût matière & Taux de marque */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-bold">Taux de marge sur coût : </span>
                  <strong className="font-mono text-slate-900 font-black">
                    {activeDetailData.tauxMargeSurCout.toFixed(1)} %
                  </strong>
                  <span className="text-[10px] text-slate-400 ml-1">
                    ((Marge brute ÷ Coût total) × 100)
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-bold">Taux de marque : </span>
                  <strong className="font-mono text-slate-900 font-black">
                    {activeDetailData.tauxMarque.toFixed(1)} %
                  </strong>
                  <span className="text-[10px] text-slate-400 ml-1">
                    ((Marge brute ÷ Prix vente) × 100)
                  </span>
                </div>
              </div>

              {/* Avertissement Perte Brute si applicable */}
              {activeDetailData.isPerteBrute && (
                <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl flex items-center gap-2 text-rose-900 text-xs font-bold animate-pulse">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Alerte Perte Brute : Cette recette est vendue à perte ({fmt(activeDetailData.margeBruteUnitaire)} par unité). Augmentez le prix de vente ou ajustez le grammage des matières premières.
                  </span>
                </div>
              )}

              {/* Tableau des Ingrédients avec actions d'Édition et Suppression */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Liste des Matières Premières & Doses ({activeDetailData.ingredients.length})
                  </h4>
                  <button
                    onClick={() => {
                      setIsAddingIngredientToExisting(!isAddingIngredientToExisting)
                      setCurrentSelectedProductId('')
                      setCurrentCustomIngName('')
                      setCurrentQty(1)
                      setCurrentUnit('kg')
                      setCurrentUnitCost(0)
                    }}
                    className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> {isAddingIngredientToExisting ? 'Masquer ajout' : '+ Ajouter un ingrédient'}
                  </button>
                </div>

                {/* Bloc d'ajout d'ingrédient supplémentaire dans la recette existante */}
                {isAddingIngredientToExisting && (
                  <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-200 space-y-3 animate-fadeIn">
                    <span className="text-xs font-bold text-rose-950 block">Ajouter une matière première à {activeDetailData.plat} :</span>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2">
                        <select
                          value={currentSelectedProductId}
                          onChange={e => handleProductSelect(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                        >
                          <option value="">-- Choisir Matière Stock Cuisine --</option>
                          {filteredMatiereList.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.stock_dispo} {p.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          placeholder="Quantité"
                          value={currentQty}
                          onChange={e => setCurrentQty(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <select
                          value={currentUnit}
                          onChange={e => setCurrentUnit(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          {UNIT_OPTIONS.map(u => (
                            <option key={u.value} value={u.value}>{u.value}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingIngredientToExisting(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddIngredientToExistingRecipe(activeDetailData.plat)}
                        className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-sm"
                      >
                        Valider l'ajout
                      </button>
                    </div>
                  </div>
                )}

                {/* Table des ingrédients de la fiche */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Matière Première</th>
                        <th className="py-2.5 px-3 text-center">Quantité Dosée</th>
                        <th className="py-2.5 px-3 text-right">Coût Unitaire</th>
                        <th className="py-2.5 px-3 text-right">Coût Ligne</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeDetailData.ingredients.map((ing: any) => {
                        const isEditing = editingRowId === ing.id

                        return (
                          <tr key={ing.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-3 font-bold text-slate-900">
                              {ing.ingredient_nom}
                            </td>

                            <td className="py-3 px-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={editQty}
                                    onChange={e => setEditQty(Number(e.target.value))}
                                    className="w-16 px-1.5 py-1 border border-slate-300 rounded font-mono text-center text-xs"
                                  />
                                  <select
                                    value={editUnit}
                                    onChange={e => setEditUnit(e.target.value)}
                                    className="px-1 py-1 border border-slate-300 rounded text-xs"
                                  >
                                    {UNIT_OPTIONS.map(u => (
                                      <option key={u.value} value={u.value}>{u.value}</option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <span className="font-mono font-bold text-slate-700">
                                  {ing.quantite_necessaire} {ing.unite}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editCostU}
                                  onChange={e => setEditCostU(Number(e.target.value))}
                                  className="w-20 px-1.5 py-1 border border-slate-300 rounded font-mono text-right text-xs"
                                />
                              ) : (
                                <span className="font-mono text-slate-500">
                                  {fmt(ing.cout_unitaire)}/{ing.unite}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-black text-rose-600">
                              {isEditing ? fmt(Math.round(editQty * editCostU)) : fmt(ing.cout_matiere_ligne)}
                            </td>

                            <td className="py-3 px-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleSaveEditRow(ing.id)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px]"
                                  >
                                    Sauvegarder
                                  </button>
                                  <button
                                    onClick={() => setEditingRowId(null)}
                                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-bold text-[10px]"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleStartEditRow(ing)}
                                    className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition"
                                    title="Modifier la quantité ou le coût"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteIngredientRow(ing.id, ing.ingredient_nom)}
                                    className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition"
                                    title="Supprimer cet ingrédient"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer Modal Détails */}
            <div className="pt-3 flex items-center justify-between border-t border-slate-100 shrink-0">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Prix de vente et déstockage synchronisés avec les ventes POS
              </span>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de Confirmation Personnalisée (Remplacement de window.confirm) */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onClose={() => setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} })}
        onConfirm={confirmDialog.onConfirm}
        isLoading={confirmDialog.isLoading}
        confirmText="OK"
        cancelText="Annuler"
      />
    </div>
  )
}

export default RecettesFichesPage
