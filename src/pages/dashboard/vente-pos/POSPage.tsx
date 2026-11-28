// =============================================================================
// GESTIO 229 SaaS — Ventes & Point de Vente (POS)
// Multi-paiements stricts, Vente différée, Modale Détail Produit avec décimales,
// Facture Commerciale Standard sans faux e-MECeF, Historique et Avoirs
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Search, RefreshCw, Trash2, UserCheck, Check,
  Clock, Printer, RotateCcw, AlertTriangle, X, Plus, Minus,
  Layers, CreditCard, DollarSign, Smartphone, Landmark, Info, Download,
  ChevronRight, ArrowDown, Lock, Package, ArrowRightLeft, Tag,
  CheckCircle, Wine, ChefHat, Edit3, XCircle, Fuel, FileText
} from 'lucide-react'
import { isFuelProduct } from '../../../utils/stationFuelHelper'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  isCompanyEmecefActive,
  getDocumentTitle,
  getDocumentFooterMessage,
  isProductVatSubject,
  computeFacturationFiscalSummary,
  downloadFacturePdf,
  FacturationDocumentData
} from '../../../utils/facturationHelper'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { useAppContext } from '../../../contexts/AppContext'
import { getActiveCaisse, getCurrentCashSession, ActiveCaisseSession } from '../../../lib/supabaseTenant'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { ModalPortal, TransfertStockModal } from '../../../components/modals'
import { CreerAvoirModal } from '../../../components/factures/CreerAvoirModal'
import { calculateTaxFromTTC, formatFCFA } from '../../../utils/tax'
import { resolveProductUnits, formatStockWithUnit } from '../../../utils/formatters'
import { decomposerTTC } from '../../../utils/calculPrix'
import { FactureBrasserieTemplate, FactureBrasserieData } from '../../../components/factures/FactureBrasserieTemplate'
import {
  BatchPricingConfig,
  calculateBatchLinePrice,
  formatUvQty,
  getBatchTiersList
} from '../../../utils/batchPricing'
import {
  BrasserieGrille,
  fetchBrasserieGrilles,
  fetchGrillePrix,
  fetchClientPrixMap,
  findApplicableGrille,
  calculateLinePricing
} from '../../../services/brasseriePricingService'
import clsx from 'clsx'
import { RestaurantOrderWidget } from '../restaurant/RestaurantOrderWidget'
import { destockerMatieresPlat, resolveProductCircuit } from '../../../services/restaurantService'
import { enregistrerMouvementCaisse, checkSectorCaisseStatus, resolveValidCashSession } from '../../../services/caisseSectorService'
import { enregistrerEntreeCaisse } from '../../../services/caisseDepensesService'
import { isVraiCodeEmballage } from '../../../utils/emballages'
import { getCachedData, setCachedData, invalidateCache } from '../../../utils/cache'
import { comptabiliserVenteAuto } from '../../../services/compta_auto'
import { useSalesCircuitConfig } from '../../../hooks/useSalesCircuitConfig'
import {
  creerEtTransmettreBon,
  fetchPendingBons,
  annulerBonDeCommande,
  encaisserBonDeCommande,
  PendingBon
} from '../../../services/salesCircuitService'

const fmt = (n: number) => formatFCFA(n)

export const formatBeninDateTime = (dStr?: string) => {
  if (!dStr) return ''
  try {
    const d = new Date(dStr)
    if (isNaN(d.getTime())) return dStr
    const isZeroTime = dStr.includes('00:00:00') || dStr.length <= 10
    if (isZeroTime) {
      return d.toLocaleDateString('fr-BJ', {
        timeZone: 'Africa/Porto-Novo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    }
    return d.toLocaleString('fr-BJ', {
      timeZone: 'Africa/Porto-Novo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return dStr
  }
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Product {
  id: string
  code: string
  name: string
  unit: string
  selling_price: number // Prix TTC
  cost_price: number    // Coût TTC
  wholesale_price?: number
  coef?: number
  ucd?: string
  uv?: string
  current_stock?: number
  stock_vente?: number
  stock_magasin?: number
  is_taxable?: boolean
  tva_rate?: number
  is_vat_subject?: boolean
  vat_rate?: number
  is_aib_subject?: boolean
  aib_rate?: number
  category?: { name: string }
  category_name?: string
  batch_pricing?: BatchPricingConfig
  sector_meta?: any
  is_recipe?: boolean
  recipe_id?: string
}

interface Customer {
  id: string
  code: string
  name: string
  phone: string
  ifu_number?: string
  credit_limit?: number
  current_debt: number
  solde_creance?: number
  credit_authorized?: boolean
  discount_eligible?: boolean
  discount_rate?: number
}

interface CartItem {
  lineId?: string
  product: Product
  qty: number
  unitPrice: number // TTC
  discount: number
  batchTierLabel?: string
  isBatchTier?: boolean
  pricingSource?: 'PRIX_PERSONNALISE' | 'GRILLE' | 'STANDARD'
  appliedGridName?: string | null
  appliedGridId?: string | null
  standardPrice?: number
  unitCostPrice?: number
  unitSaving?: number
}

interface PaymentLine {
  method: 'especes' | 'momo_mtn' | 'momo_moov' | 'wave' | 'banque' | 'credit'
  amount: number
}

interface SaleRecord {
  id: string
  order_number: string
  date: string
  customer_name: string
  customer_id?: string
  customer_ifu?: string
  total_amount: number
  total_ht: number
  total_tva: number
  total_aib: number
  total_exonere?: number
  amount_paid: number
  credit_amount: number
  ancienne_dette_avant_facture?: number
  montant_restant_du_global?: number
  montant_credit_actuel?: number
  payments: PaymentLine[]
  is_deferred: boolean
  status: 'COMPLET' | 'A_LIVRER' | 'AVOIR'
  annulation_avoir?: { avoir_id?: string; avoir_numero?: string; date_annulation?: string; annule_par?: string; motif?: string } | null
  lines: CartItem[]
  emballages_consignes?: { code: string; designation: string; sortie: number; retour: number; net_du: number }[]
  table_numero?: string
  couverts?: number
  serveur_nom?: string
}

export const POSPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId, sectorSlug, supabaseTenant, isAdmin } = useTenant()
  const userRole = ((user?.role || '') as string).toLowerCase()
  // RÈGLE OBLIGATOIRE : Bouton Transfert bloqué pour Caissière (réservé Administrateur et Gestionnaire)
  const canTransferStock = Boolean(
    isAdmin || ['admin', 'administrateur', 'gestionnaire', 'gerant', 'super_admin'].includes(userRole)
  )

  // Droits de caisse & mode de circuit
  const hasCaissePrivilege = Boolean(
    isAdmin ||
    ['admin', 'administrateur', 'gestionnaire', 'gerant', 'super_admin', 'caissier', 'caissiere'].includes(userRole) ||
    (user?.permissions as any)?.caisse === true
  )

  const { secteurActif, caisseActive } = useAppContext()
  const currentSectorSlug = (sectorSlug || secteurActif?.slug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')

  const {
    circuitMode,
    isIntegrated: isCircuitIntegrated,
    isSeparated: isCircuitSeparated
  } = useSalesCircuitConfig(currentSectorSlug)

  // État Bon de Commande transmis (Mode Séparé)
  const [transmittedBonModal, setTransmittedBonModal] = useState<any | null>(null)
  const [transmittingBon, setTransmittingBon] = useState<boolean>(false)
  const [mesBonsModal, setMesBonsModal] = useState<boolean>(false)
  const [mesBonsList, setMesBonsList] = useState<PendingBon[]>([])
  const [loadingMesBons, setLoadingMesBons] = useState<boolean>(false)
  const [loadedPendingBon, setLoadedPendingBon] = useState<PendingBon | null>(null)
  const isStation = currentSectorSlug === 'station-service' || currentSectorSlug === 'station' || currentSectorSlug === 'hydrocarbures'
  const isRestaurant = currentSectorSlug === 'restaurant' || currentSectorSlug === 'bar-restaurant-maquis' || currentSectorSlug === 'bar' || currentSectorSlug === 'maquis' || currentSectorSlug === 'fastfood'
  const [restaurantCircuit, setRestaurantCircuit] = useState<'BAR' | 'CUISINE'>('BAR')
  const [restaurantTable, setRestaurantTable] = useState('')
  const [restaurantTableId, setRestaurantTableId] = useState<string>('')
  const [restaurantTablesList, setRestaurantTablesList] = useState<any[]>([])
  const [restaurantSaleMode, setRestaurantSaleMode] = useState<'TABLE' | 'COMPTOIR'>('TABLE')
  const [restaurantCouverts, setRestaurantCouverts] = useState(1)
  const [restaurantServeur, setRestaurantServeur] = useState('')
  const [restaurantServeurId, setRestaurantServeurId] = useState<string>('')
  const [restaurantSessionId, setRestaurantSessionId] = useState<string>('')
  const [restaurantServeursList, setRestaurantServeursList] = useState<any[]>([])

  // Synchronisation automatique et bidirectionnelle de la table sélectionnée
  useEffect(() => {
    if (!restaurantTablesList || restaurantTablesList.length === 0) return
    if (restaurantTable) {
      const cleanT = restaurantTable.trim().toLowerCase()
      const matched = restaurantTablesList.find(t =>
        (t.numero_table && t.numero_table.trim().toLowerCase() === cleanT) ||
        (t.nom && t.nom.trim().toLowerCase() === cleanT) ||
        (restaurantTableId && t.id === restaurantTableId)
      )
      if (matched && (!restaurantTableId || restaurantTableId !== matched.id)) {
        setRestaurantTableId(matched.id)
      }
    } else if (restaurantTableId) {
      const matched = restaurantTablesList.find(t => t.id === restaurantTableId)
      if (matched && matched.numero_table !== restaurantTable) {
        setRestaurantTable(matched.numero_table)
      }
    }
  }, [restaurantTable, restaurantTableId, restaurantTablesList])
  // Synchronisation automatique et bidirectionnelle de la serveuse sélectionnée
  useEffect(() => {
    if (!restaurantServeursList || restaurantServeursList.length === 0) return
    if (restaurantServeur && restaurantServeur !== 'Client Comptoir Direct' && restaurantServeur !== 'Serveur de Salle') {
      const matched = restaurantServeursList.find(s =>
        (s.nom_complet && s.nom_complet.trim().toLowerCase() === restaurantServeur.trim().toLowerCase()) ||
        (restaurantServeurId && s.id === restaurantServeurId)
      )
      if (matched) {
        if (!restaurantServeurId || restaurantServeurId !== matched.id) setRestaurantServeurId(matched.id)
        if (matched.active_session_id && restaurantSessionId !== matched.active_session_id) setRestaurantSessionId(matched.active_session_id)
      }
    } else if (restaurantServeurId && (!restaurantServeur || restaurantServeur === 'Client Comptoir Direct')) {
      const matched = restaurantServeursList.find(s => s.id === restaurantServeurId)
      if (matched && matched.nom_complet !== restaurantServeur) {
        setRestaurantServeur(matched.nom_complet)
        if (matched.active_session_id) setRestaurantSessionId(matched.active_session_id)
      }
    }
  }, [restaurantServeur, restaurantServeurId, restaurantServeursList])

  const [recipeProducts, setRecipeProducts] = useState<Product[]>([])
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const location = useLocation()
  const navigate = useNavigate()

  // Navigation interne
  const [activeTab, setActiveTab] = useState<'pos' | 'historique'>('pos')

  // Données réelles chargées depuis Supabase (aucune donnée fictive)
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Emballages & Consignations (Brasserie & Dépôt de Boissons)
  const [brasserieEmballagesList, setBrasserieEmballagesList] = useState<{ id: string; code: string; designation: string; stock_depot?: number }[]>([])
  const [brasserieRetours, setBrasserieRetours] = useState<Record<string, number>>({})
  const [clientEmballagesPrecedents, setClientEmballagesPrecedents] = useState<Record<string, number>>({})

  // Client sélectionné (défaut = vide = Client Comptoir)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId)

  // Grilles Gros & Maquis — Tarification dynamique (Brasserie & Dépôt de Boissons)
  const [brasserieGrilles, setBrasserieGrilles] = useState<BrasserieGrille[]>([])
  const [brasserieGrillesPrixCache, setBrasserieGrillesPrixCache] = useState<Record<string, Record<string, number>>>({})
  const [brasserieClientPrixMap, setBrasserieClientPrixMap] = useState<Record<string, number>>({})

  // Chargement des grilles et de leurs prix
  useEffect(() => {
    if ((currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && companyId) {
      fetchBrasserieGrilles(companyId, 'brasserie').then((list) => {
        setBrasserieGrilles(list)
        list.filter((g) => g.statut === 'ACTIF').forEach(async (g) => {
          const pMap = await fetchGrillePrix(companyId, g.id)
          setBrasserieGrillesPrixCache((prev) => ({ ...prev, [g.id]: pMap }))
        })
      })
    }
  }, [currentSectorSlug, companyId])

  // Chargement des prix personnalisés du client sélectionné
  useEffect(() => {
    if ((currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && companyId) {
      if (selectedCustomerId) {
        fetchClientPrixMap(companyId, selectedCustomerId).then((map) => {
          setBrasserieClientPrixMap(map)
        })
      } else {
        setBrasserieClientPrixMap({})
      }
    }
  }, [selectedCustomerId, currentSectorSlug, companyId])

  // Chargement en temps réel de la situation d'emballages précédente du client sélectionné
  useEffect(() => {
    if (!selectedCustomerId || (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons')) {
      setClientEmballagesPrecedents({})
      return
    }
    const loadClientPrecedents = async () => {
      try {
        const compId = company?.id ?? companyId ?? ''
        const clientName = selectedCustomer?.name || ''
        const map: Record<string, number> = { C12T: 0, C20T: 0, C24T: 0 }

        // 1. Calcul prioritaire en temps réel depuis brasserie_emballages_mouvements (INITIAL + SORTIE - RETOUR)
        let query = supabase
          .from('brasserie_emballages_mouvements')
          .select('emballage_code, code, emballage_type_id, type_mouvement, quantite, client_id, client_nom')
          .eq('company_id', compId)

        if (clientName) {
          query = query.or(`client_id.eq.${selectedCustomerId},client_nom.ilike.%${clientName}%`)
        } else {
          query = query.eq('client_id', selectedCustomerId)
        }

        const { data: mvtsData, error: mvtsErr } = await query

        if (!mvtsErr && mvtsData && mvtsData.length > 0) {
          mvtsData.forEach((m: any) => {
            let rawCode = (m.emballage_code || m.code || '').trim().toUpperCase()
            if (!rawCode && m.emballage_type_id) {
              const matched = brasserieEmballagesList.find(e => e.id === m.emballage_type_id)
              if (matched) rawCode = (matched.code || '').trim().toUpperCase()
            }
            // IGNORER strictement tout code fantôme ou invalide
            if (!rawCode || !isVraiCodeEmballage(rawCode)) return

            const qte = Number(m.quantite) || 0
            const type = (m.type_mouvement || '').toUpperCase()

            if (['SORTIE', 'SORTIE_VENTE', 'INITIAL', 'AJUSTEMENT_POSITIF', 'INVENTAIRE'].includes(type)) {
              map[rawCode] = (map[rawCode] || 0) + qte
            } else if (['RETOUR', 'RETOUR_IMMEDIAT', 'RETOUR_CLIENT', 'AVOIR_RETOUR', 'AJUSTEMENT_NEGATIF'].includes(type)) {
              map[rawCode] = Math.max(0, (map[rawCode] || 0) - qte)
            }
          })

          setClientEmballagesPrecedents(map)
          return
        }

        // 2. Fallback clients_emballages_soldes (M046)
        const { data: soldesData, error: soldesErr } = await supabase
          .from('clients_emballages_soldes')
          .select('emballage_id, du_actuel')
          .eq('company_id', compId)
          .eq('client_id', selectedCustomerId)

        if (!soldesErr && soldesData && soldesData.length > 0) {
          soldesData.forEach((s: any) => {
            const matched = brasserieEmballagesList.find(e => e.id === s.emballage_id)
            const code = (matched ? matched.code : s.emballage_id || '').trim().toUpperCase()
            if (isVraiCodeEmballage(code)) {
              map[code] = Number(s.du_actuel) || 0
            }
          })
          setClientEmballagesPrecedents(map)
          return
        }

        // 3. Fallback brasserie_consignations
        const { data: consData } = await supabase
          .from('brasserie_consignations')
          .select('emballage_id, solde_du')
          .eq('company_id', compId)
          .eq('sector_slug', 'brasserie')
          .eq('client_id', selectedCustomerId)

        if (consData && consData.length > 0) {
          consData.forEach((c: any) => {
            const matched = brasserieEmballagesList.find(e => e.id === c.emballage_id)
            const code = (matched ? matched.code : c.emballage_id || '').trim().toUpperCase()
            if (isVraiCodeEmballage(code)) {
              map[code] = Number(c.solde_du) || 0
            }
          })
          setClientEmballagesPrecedents(map)
        } else {
          setClientEmballagesPrecedents(map)
        }
      } catch (err) {
        console.warn('[POSPage] Erreur chargement précédents emballages:', err)
        setClientEmballagesPrecedents({})
      }
    }
    loadClientPrecedents()
  }, [selectedCustomerId, selectedCustomer?.name, currentSectorSlug, company, companyId, brasserieEmballagesList])

  // Chargement et rafraîchissement des bons de commande en attente (quand le mode séparé est actif)
  useEffect(() => {
    if (!isCircuitSeparated) return
    const activeCompId = company?.id ?? companyId ?? ''
    if (!activeCompId) return

    const refreshPending = () => {
      fetchPendingBons(activeCompId, currentSectorSlug)
        .then(list => setMesBonsList(list))
        .catch(() => {})
    }

    refreshPending()

    window.addEventListener('gestio:bon_transmitted', refreshPending)
    window.addEventListener('gestio:bon_encaisse', refreshPending)
    window.addEventListener('gestio:bon_annule', refreshPending)
    return () => {
      window.removeEventListener('gestio:bon_transmitted', refreshPending)
      window.removeEventListener('gestio:bon_encaisse', refreshPending)
      window.removeEventListener('gestio:bon_annule', refreshPending)
    }
  }, [isCircuitSeparated, company?.id, companyId, currentSectorSlug])

  // Cumul commercial total du panier pour le secteur Brasserie
  const totalBrasserieQuantity = useMemo(() => {
    if (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons') return 0
    return cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
  }, [cart, currentSectorSlug])

  // Détermination automatique de la grille active applicable selon la quantité totale
  const currentBrasserieGrid = useMemo(() => {
    if (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons') return null
    return findApplicableGrille(brasserieGrilles, totalBrasserieQuantity)
  }, [brasserieGrilles, totalBrasserieQuantity, currentSectorSlug])

  // Recalcul automatique et dynamique des prix de toutes les lignes du panier dès que la quantité ou le client change
  useEffect(() => {
    if (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons') return
    if (cart.length === 0) return

    const gridPrices = currentBrasserieGrid ? (brasserieGrillesPrixCache[currentBrasserieGrid.id] || {}) : {}

    setCart((prev) => {
      let hasChanges = false
      const updated = prev.map((item) => {
        const pricing = calculateLinePricing({
          product: item.product,
          qteLigne: item.qty,
          qteTotaleVente: totalBrasserieQuantity,
          clientId: selectedCustomerId || null,
          grilleApplicable: currentBrasserieGrid,
          grillePrixMap: gridPrices,
          clientPrixMap: brasserieClientPrixMap,
        })

        if (
          item.unitPrice !== pricing.prix_applique ||
          item.pricingSource !== pricing.source_prix ||
          item.appliedGridName !== (pricing.grille_utilisee || null)
        ) {
          hasChanges = true
          return {
            ...item,
            unitPrice: pricing.prix_applique,
            pricingSource: pricing.source_prix,
            appliedGridName: pricing.grille_utilisee || null,
            appliedGridId: pricing.grille_id || null,
            standardPrice: pricing.prix_standard,
            unitCostPrice: pricing.prix_achat,
            unitSaving: pricing.economie_unitaire,
          }
        }
        return item
      })
      return hasChanges ? updated : prev
    })
  }, [currentBrasserieGrid, totalBrasserieQuantity, brasserieClientPrixMap, brasserieGrillesPrixCache, selectedCustomerId, currentSectorSlug])

  // Vente différée
  const [isDeferred, setIsDeferred] = useState(false)

  // Modale Détail Produit (clic sur un article du catalogue)
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null)
  const [detailQty, setDetailQty] = useState<number>(1)

  // Modale Transfert Stock Magasin -> Vente (Règle Métier Double Stock)
  const [transfertProduct, setTransfertProduct] = useState<Product | null>(null)

  // Panneau Panier & Checkout Intégré Glissant (Toujours visible par défaut sur grand écran)
  const [isCartVisible, setIsCartVisible] = useState(true)
  const [isMultiMode, setIsMultiMode] = useState(false)
  const [singleMethod, setSingleMethod] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('especes')

  // Multi-modes : Déploiement instantané Mode 1 et Mode 2
  const [multiMode1Canal, setMultiMode1Canal] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('especes')
  const [multiMode1Amount, setMultiMode1Amount] = useState<number>(0)
  const [multiMode2Canal, setMultiMode2Canal] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('momo_mtn')
  const [multiMode2Amount, setMultiMode2Amount] = useState<number>(0)

  // Option AIB manuelle sur le panier si non présente sur les articles
  const [applyAibCart, setApplyAibCart] = useState<boolean>(false)
  const [cartAibRate, setCartAibRate] = useState<number>(1)

  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [paying, setPaying] = useState(false)

  // Facture et Impression
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showAvoirModal, setShowAvoirModal] = useState(false)
  const [selectedSaleForAvoir, setSelectedSaleForAvoir] = useState<SaleRecord | null>(null)
  const [selectedAvoirForConsult, setSelectedAvoirForConsult] = useState<any | null>(null)
  const [printFormat, setPrintFormat] = useState<'ticket80' | 'ticket80_double' | 'factureA4' | 'brasserie' | 'bon_cuisine'>('factureA4')
  const [currentSale, setCurrentSale] = useState<SaleRecord | null>(null)

  // Minuteur d'inactivité du panier de 3 minutes (Règle Antigravity)
  const [lastCartActivity, setLastCartActivity] = useState<number>(Date.now())
  const [inactiveSeconds, setInactiveSeconds] = useState<number>(0)
  const [showInactivityWarning, setShowInactivityWarning] = useState<boolean>(false)

  // Workflow de validation Restaurant 4 minutes (Exigence Section 6)
  const [pendingRestoOrder, setPendingRestoOrder] = useState<{
    orderNumber: string
    expiresAt: string
    items: CartItem[]
    totalTtc: number
    totalHt: number
    serveurNom: string
    tableNumero: string
    circuit: 'BAR' | 'CUISINE'
    clientNom: string
  } | null>(null)
  const [pendingCountdownSeconds, setPendingCountdownSeconds] = useState<number>(240)
  const [showPendingRestoModal, setShowPendingRestoModal] = useState<boolean>(false)
  const [showCancelPrompt, setShowCancelPrompt] = useState<boolean>(false)
  const [cancelMotif, setCancelMotif] = useState<string>('')
  const [isFinalizingPending, setIsFinalizingPending] = useState<boolean>(false)

  // Modèle de données pour la facture Brasserie avec situation des emballages
  const factureBrasserieData: FactureBrasserieData | null = useMemo(() => {
    if (!currentSale) return null

    const embs = (currentSale.emballages_consignes || []).map((e: any) => {
      const isComptoir = !selectedCustomer || selectedCustomer.code === 'COMPTOIR' || (selectedCustomer.name || '').toLowerCase().includes('comptoir')
      const prec = isComptoir ? 0 : (clientEmballagesPrecedents[e.code] || clientEmballagesPrecedents[e.id] || 0)
      const sortie = Number(e.sortie) || 0
      const retour = Number(e.retour) || 0
      const reste = isComptoir ? 0 : (prec + sortie - retour)
      return {
        designation: e.designation || `Casier ${e.code}`,
        code: e.code,
        precedent: prec,
        facture: sortie,
        rendus: retour,
        reste: reste
      }
    })

    return {
      company: {
        name: company?.name || 'STE GESTIO SARL',
        address: company?.address,
        phone: company?.phone,
        ifu: company?.ifu,
      },
      agence: 'PRINCIPALE',
      magasin: 'MAGASIN 1',
      reference: currentSale.order_number || 'FAC',
      dateFacture: currentSale.created_at || new Date().toISOString(),
      modePaiement: (currentSale.payment_method || 'Espèces').toUpperCase(),
      client: {
        nom: currentSale.customer_name || 'Client Comptoir',
        tel: selectedCustomer?.phone,
        ifu: selectedCustomer?.ifu_number,
        type: selectedCustomer?.code === 'COMPTOIR' ? 'COMPTOIR' : 'ENREGISTRE'
      },
      vendeur: {
        code: user?.id?.slice(0, 4) || 'V01',
        nom: user?.full_name || 'Caissier'
      },
      gestionnaire: {
        nom: 'GENERAL'
      },
      lignes: (currentSale.lines || currentSale.items || []).map((item: any) => ({
        designation: item.product_name || item.name || item.product?.name || 'Produit',
        qte: Number(item.quantity || item.qty) || 1,
        pvu: Number(item.unit_price || item.unitPrice) || 0,
        montant: Number(item.total_ttc || (Number(item.quantity || item.qty || 1) * Number(item.unit_price || item.unitPrice || 0))) || 0,
        ts: 0
      })),
      totalHT: Number(currentSale.total_ht ?? currentSale.subtotal_ht) || 0,
      totalTVA: Number(currentSale.total_tva ?? currentSale.tva_amount) || 0,
      totalAIB: Number(currentSale.total_aib ?? currentSale.aib_amount) || 0,
      totalTTC: Number(currentSale.total_amount) || 0,
      emballages: embs,
      observation: currentSale.is_deferred ? 'Vente avec livraison différée' : 'Facture acquittée'
    }
  }, [currentSale, company, selectedCustomer, clientEmballagesPrecedents, user])

  // Caisse active (statut='ouverte' isolée par secteur)
  const [activeCaisse, setActiveCaisse] = useState<ActiveCaisseSession | null>(null)
  const [checkingCaisse, setCheckingCaisse] = useState(true)

  // Historique des ventes réelles
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([])
  const [historySearch, setHistorySearch] = useState('')

  // ─── Chargement réel des données depuis Supabase (isolation stricte par sous-logiciel) ───

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setCheckingCaisse(true)
    setLoadError(null)

    // 0. Vérification stricte de la caisse ouverte pour ce secteur
    try {
      let caisse = await getCurrentCashSession(companyId, currentSectorSlug, user?.id)
      if (!caisse) {
        const statusRes = await checkSectorCaisseStatus(companyId, currentSectorSlug)
        if (statusRes.isTodayOpen || statusRes.statusType === 'OUVERTE_AUJOURDHUI' || statusRes.statusType === 'ANTERIEURE_OUVERTE') {
          caisse = {
            id: statusRes.session?.id || statusRes.caisse?.id || 'simulated',
            caisse_id: statusRes.caisse?.id || '',
            session_number: statusRes.caisseCode || `CS-${currentSectorSlug.slice(0, 4).toUpperCase()}`,
            statut: 'ouverte',
            date_ouverture: statusRes.session?.date_ouverture || new Date().toISOString(),
            heure_ouverture: statusRes.heureOuverture || '--:--',
            fond_ouverture_especes: Number(statusRes.session?.fond_ouverture_especes ?? statusRes.caisse?.fond_ouverture_especes ?? 0),
            fond_ouverture_momo: Number(statusRes.session?.fond_actuel_momo ?? statusRes.caisse?.fond_ouverture_momo ?? 0),
            total_ouverture: (Number(statusRes.session?.fond_ouverture_especes ?? statusRes.caisse?.fond_ouverture_especes ?? 0)) +
                             (Number(statusRes.session?.fond_actuel_momo ?? statusRes.caisse?.fond_ouverture_momo ?? 0)),
            ouvert_par: statusRes.ouvertParNom || 'Caissier',
            ouvert_par_id: statusRes.session?.ouvert_par || null,
            sector_slug: currentSectorSlug || 'bar_restaurant',
            company_id: companyId,
            is_previous_day: statusRes.isPreviousDay,
          }
        }
      }
      setActiveCaisse(caisse)
    } catch (err) {
      console.warn('[CASH-CHECK] Erreur vérification caisse:', err)
      setActiveCaisse(null)
    } finally {
      setCheckingCaisse(false)
    }

    // 1. Récupération robuste des produits (avec Cache LocalStorage 5 min pour affichage instantané)
    let rawProds: any[] = []
    try {
      const cacheKey = `prods_${companyId}_${currentSectorSlug}`
      const cached = getCachedData<Product[]>(cacheKey)
      if (cached && cached.length > 0) {
        setProducts(cached)
      }

      const { data, error: prodsError } = await supabaseTenant('products')
        .select('*, category:product_categories(name)')
        .neq('is_active', false)
        .order('name')
      if (!prodsError && data) {
        // Isolation stricte : filtrer obligatoirement pour le secteur actif
        rawProds = filterItemsForSector(data, currentSectorSlug)
      } else {
        const { data: fbData } = await supabase
          .from('products')
          .select('*')
          .eq('company_id', companyId)
          .neq('is_active', false)
          .order('name')
        if (fbData && fbData.length > 0) {
          // RÈGLE ABSOLUE : Si un secteur n'a aucun produit, rawProds RESTE VIDE [] !
          // Ne JAMAIS basculer sur fbData brut qui mélange les secteurs
          rawProds = filterItemsForSector(fbData, currentSectorSlug)
        }
      }

      const mappedProds = (rawProds || []).map((p: any) => {
        const isVat = Boolean(
          p.is_taxable ??
          p.is_vat_subject ??
          p.sector_meta?.is_taxable ??
          p.sector_meta?.is_vat_subject ??
          (Number(p.tva_rate) > 0) ??
          (Number(p.vat_rate) > 0) ??
          false
        )
        const vatRate = isVat ? Number(p.tva_rate ?? p.vat_rate ?? 18) : 0
        const isAib = Boolean(
          p.is_aib_subject ??
          p.sector_meta?.is_aib_subject ??
          false
        )
        const aibRate = isAib ? Number(p.aib_rate ?? p.sector_meta?.aib_rate ?? 1) : 0

        return {
          ...p,
          selling_price: Number(p.selling_price) || 0,
          cost_price: Number(p.cost_price) || 0,
          stock_magasin: Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0),
          stock_vente: Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0),
          coef: Number(p.coef || p.sector_meta?.coef || 1),
          ucd: p.ucd || p.sector_meta?.ucd || 'Carton',
          uv: p.uv || p.sector_meta?.uv || p.unit || 'Pièce',
          batch_pricing: p.batch_pricing || p.sector_meta?.batch_pricing || null,
          is_taxable: isVat,
          is_vat_subject: isVat,
          tva_rate: vatRate,
          vat_rate: vatRate,
          is_aib_subject: isAib,
          aib_rate: aibRate,
        }
      })
      setProducts(mappedProds)
      setCachedData(cacheKey, mappedProds, 5 * 60 * 1000)
    } catch (prodErr: any) {
      console.error('[POSPage] Erreur récupération produits:', prodErr)
      setLoadError(`Erreur produits: ${prodErr.message || 'Impossible de charger le catalogue'}`)
    }

    // 2. Récupération robuste des clients et de leurs dettes (isolation stricte par secteur)
    try {
      let rawCusts: any[] = []
      const { data, error: custsError } = await supabaseTenant('customers')
        .select('*')
        .order('name')
      if (!custsError && data) {
        rawCusts = filterItemsForSector(data, currentSectorSlug)
      } else {
        const { data: fbCusts } = await supabase
          .from('customers')
          .select('*')
          .eq('company_id', companyId)
          .order('name')
        if (fbCusts && fbCusts.length > 0) {
          // RÈGLE ABSOLUE : Si 0 client dans ce secteur, rawCusts RESTE VIDE [] !
          rawCusts = filterItemsForSector(fbCusts, currentSectorSlug)
        }
      }

      const mappedCusts: Customer[] = (rawCusts || []).map((c: any) => {
        const creditLimit = Number(c.credit_limit) || 0
        const isCreditAuth = Boolean(c.credit_authorized) || (creditLimit > 0)
        const isDiscount = Boolean(c.discount_eligible)
        const discountRate = Number(c.discount_rate) || 0
        const debt = Number(c.solde_creance ?? c.current_debt ?? 0)

        return {
          ...c,
          current_debt: debt,
          solde_creance: debt,
          credit_limit: creditLimit,
          credit_authorized: isCreditAuth,
          discount_eligible: isDiscount,
          discount_rate: discountRate,
        }
      })
      setCustomers(mappedCusts)
    } catch (custErr: any) {
      console.warn('[POSPage] Erreur récupération clients:', custErr)
    }

    // 3. Charger les fiches techniques (Recettes Restaurant) et les serveuses (unification serveurs + sessions + personnel)
    if (isRestaurant) {
      try {
        const [fichesRes, srvRes, sessRes, staffRes, tablesRes] = await Promise.all([
          supabaseTenant('restaurant_fiches_techniques').select('*').order('plat_nom'),
          supabaseTenant('restaurant_serveurs').select('*').eq('statut', 'ACTIF').order('nom_complet'),
          supabaseTenant('restaurant_sessions_serveurs').select('*').eq('statut', 'OUVERTE').order('created_at', { ascending: false }),
          supabaseTenant('staff_members').select('*').eq('is_active', true),
          supabaseTenant('restaurant_tables').select('*').order('numero_table')
        ])

        if (tablesRes.data) {
          setRestaurantTablesList(tablesRes.data)
          const urlParams = new URLSearchParams(window.location.search)
          const urlTable = urlParams.get('table')
          if (urlTable) {
            const matchedT = tablesRes.data.find((t: any) =>
              (t.numero_table && t.numero_table.trim().toLowerCase() === urlTable.trim().toLowerCase()) ||
              (t.nom && t.nom.trim().toLowerCase() === urlTable.trim().toLowerCase()) ||
              t.id === urlTable
            )
            if (matchedT) {
              setRestaurantTable(matchedT.numero_table)
              setRestaurantTableId(matchedT.id)
              setRestaurantSaleMode('TABLE')
            } else {
              setRestaurantTable(urlTable)
              setRestaurantSaleMode('TABLE')
            }
          }
        }

        const srvMap = new Map<string, any>()

        // 1. D'abord les serveurs enregistrés dans restaurant_serveurs (uniquement actifs, hors comptes tests/fictifs)
        if (srvRes.data) {
          srvRes.data.forEach((s: any) => {
            const key = (s.nom_complet || '').trim().toLowerCase()
            if (!key) return
            // Exclure les serveurs inactifs ou archivés ou comptes tests
            if (s.statut === 'ARCHIVE' || s.statut === 'INACTIF' || key.includes('test_') || key.includes('fictif')) return
            srvMap.set(key, {
              id: s.id,
              matricule: s.matricule || `SRV-${s.nom_complet.slice(0, 3).toUpperCase()}`,
              nom_complet: s.nom_complet.trim(),
              role: s.role || 'SERVEUR',
              telephone: s.telephone || '',
              statut: s.statut || 'ACTIF',
              has_open_session: false,
              active_session_id: null
            })
          })
        }

        // 2. Associer les sessions ouvertes aux serveurs réels enregistrés
        if (sessRes.data) {
          sessRes.data.forEach((sess: any) => {
            const srvNom = (sess.serveur_nom || '').trim()
            if (!srvNom) return
            const key = srvNom.toLowerCase()
            // Ignorer les comptes tests manifestes
            if (key.includes('test_') || key.includes('fictif')) return
            if (srvMap.has(key)) {
              const existing = srvMap.get(key)
              existing.has_open_session = true
              existing.active_session_id = sess.id
              if (!existing.id && sess.serveur_id) existing.id = sess.serveur_id
            } else if (sess.serveur_id) {
              // Si la session a un serveur_id connu
              srvMap.set(key, {
                id: sess.serveur_id,
                matricule: `SRV-${srvNom.slice(0, 3).toUpperCase()}`,
                nom_complet: srvNom,
                role: 'SERVEUR',
                telephone: '',
                statut: 'ACTIF',
                has_open_session: true,
                active_session_id: sess.id
              })
            }
          })
        }

        // 3. Fusionner avec staff_members si rôle serveuse / barman / resto
        if (staffRes.data) {
          staffRes.data.forEach((st: any) => {
            const rLower = (st.role || st.job_title || '').toLowerCase()
            const fn = (st.full_name || `${st.first_name || ''} ${st.last_name || ''}`).trim()
            if (!fn) return
            const sSlug = (st.sector_slug || '').toLowerCase()
            const isMatch = sSlug === 'restaurant' || sSlug === 'bar-restaurant-maquis' || sSlug === 'bar' || sSlug === 'maquis' || sSlug === 'fastfood' ||
              rLower.includes('serveu') || rLower.includes('barman') || rLower.includes('resto') || rLower.includes('salle') || rLower.includes('sommelier')
            if (isMatch) {
              const key = fn.toLowerCase()
              if (!srvMap.has(key)) {
                srvMap.set(key, {
                  id: st.id,
                  matricule: st.matricule || `STF-${fn.slice(0, 3).toUpperCase()}`,
                  nom_complet: fn,
                  role: 'SERVEUR',
                  telephone: st.phone || st.phone_number || '',
                  has_open_session: false,
                  active_session_id: null
                })
              }
            }
          })
        }

        // 4. Fallback direct résilient si srvMap est vide
        if (srvMap.size === 0 && (company?.id || companyId)) {
          const compId = company?.id || companyId
          try {
            const { data: directSrv } = await supabase
              .from('restaurant_serveurs')
              .select('*')
              .eq('company_id', compId)
              .eq('statut', 'ACTIF')
            if (directSrv && directSrv.length > 0) {
              directSrv.forEach((s: any) => {
                const key = (s.nom_complet || '').trim().toLowerCase()
                if (key && !srvMap.has(key)) {
                  srvMap.set(key, {
                    id: s.id,
                    matricule: s.matricule || `SRV-${s.nom_complet.slice(0, 3).toUpperCase()}`,
                    nom_complet: s.nom_complet.trim(),
                    role: s.role || 'SERVEUR',
                    telephone: s.telephone || '',
                    has_open_session: false,
                    active_session_id: null
                  })
                }
              })
            }
          } catch (fbErr) {
            console.warn('[POSPage] Direct fallback restaurant_serveurs notice:', fbErr)
          }
        }

        // Tri : les serveuses avec session ouverte apparaissent en premier, puis tri alphabétique
        const unified = Array.from(srvMap.values()).sort((a, b) => {
          if (a.has_open_session && !b.has_open_session) return -1
          if (!a.has_open_session && b.has_open_session) return 1
          return a.nom_complet.localeCompare(b.nom_complet)
        })

        setRestaurantServeursList(unified)

        if (fichesRes.data && fichesRes.data.length > 0) {
          // Regrouper par plat_nom pour générer les articles virtuels de recettes
          const mapRecettes: Record<string, { id: string; name: string; prix_vente: number; cout_matiere: number; ingredientsCount: number }> = {}
          fichesRes.data.forEach((f: any) => {
            const pNom = (f.plat_nom || '').trim()
            if (!pNom) return
            if (!mapRecettes[pNom]) {
              mapRecettes[pNom] = {
                id: f.id,
                name: pNom,
                prix_vente: Number(f.prix_vente_unitaire) || 0,
                cout_matiere: 0,
                ingredientsCount: 0
              }
            }
            if (Number(f.prix_vente_unitaire) > 0 && mapRecettes[pNom].prix_vente === 0) {
              mapRecettes[pNom].prix_vente = Number(f.prix_vente_unitaire)
            }
            mapRecettes[pNom].cout_matiere += Number(f.cout_matiere_ligne) || 0
            mapRecettes[pNom].ingredientsCount += 1
          })

          const mappedRecipes: Product[] = Object.values(mapRecettes).map((r, idx) => {
            // Trouver si un produit correspondant existe dans products pour récupérer le prix s'il n'est pas renseigné
            const matchedP = (rawProds || []).find((p: any) => p.name?.trim().toLowerCase() === r.name.toLowerCase())
            const finalPrice = r.prix_vente > 0 ? r.prix_vente : (Number(matchedP?.selling_price) || Math.round((r.cout_matiere * 2.85) / 500) * 500)

            return {
              id: matchedP ? matchedP.id : `recette-${r.id || idx}`,
              recipe_id: r.id,
              is_recipe: true,
              code: matchedP ? matchedP.code : `REC-${(idx + 1).toString().padStart(3, '0')}`,
              name: r.name,
              unit: matchedP?.unit || 'Portion',
              uv: matchedP?.uv || matchedP?.unit || 'Portion',
              ucd: matchedP?.ucd || 'Portion',
              selling_price: finalPrice,
              cost_price: r.cout_matiere,
              stock_vente: 999, // Produit préparé à la commande selon matières de cuisine
              stock_magasin: 0,
              coef: 1,
              is_taxable: false,
              is_vat_subject: false,
              tva_rate: 0,
              vat_rate: 0,
              is_aib_subject: false,
              aib_rate: 0,
              category: { name: 'Cuisine & Recettes' },
              sector_meta: { restaurant_circuit: 'CUISINE', is_recipe: true }
            }
          })

          setRecipeProducts(mappedRecipes)
        } else {
          setRecipeProducts([])
        }
      } catch (err: any) {
        console.warn('[POSPage] Erreur chargement recettes/serveurs:', err.message)
      }
    }

    // 4. Charger les types d'emballages si secteur Brasserie (isolé)
    if (currentSectorSlug === 'brasserie') {
      const cId = company?.id ?? companyId ?? ''
      try {
        const { data: embData } = await supabase
          .from('brasserie_emballages')
          .select('id, code, designation, stock_depot')
          .eq('company_id', cId)
          .eq('sector_slug', 'brasserie')
          .eq('is_active', true)
        if (embData && embData.length > 0) {
          const cleanEmb = embData.filter((e: any) => isVraiCodeEmballage(e.code))
          setBrasserieEmballagesList(cleanEmb.length > 0 ? cleanEmb : [
            { id: 'c12t', code: 'C12T', designation: 'Casier 12 Bouteilles', stock_depot: 0 },
            { id: 'c20t', code: 'C20T', designation: 'Casier 20 Bouteilles', stock_depot: 0 },
            { id: 'c24t', code: 'C24T', designation: 'Casier 24 Bouteilles', stock_depot: 0 },
          ])
        } else {
          setBrasserieEmballagesList([
            { id: 'c12t', code: 'C12T', designation: 'Casier 12 Bouteilles', stock_depot: 0 },
            { id: 'c20t', code: 'C20T', designation: 'Casier 20 Bouteilles', stock_depot: 0 },
            { id: 'c24t', code: 'C24T', designation: 'Casier 24 Bouteilles', stock_depot: 0 },
          ])
        }
      } catch (_) {}
    }

    // 4. Récupération des ventes (isolée - NE DOIT JAMAIS VIDER LES PRODUITS NI CRASHER LE POS)
    try {
      const { data: salesData, error: salesOrdersError } = await supabaseTenant('sales_orders')
        .select('*, customer:customers(id, name, ifu_number), items:sales_order_items(*)')
        .order('created_at', { ascending: false })
        .limit(40)

      if (!salesOrdersError && salesData && salesData.length > 0) {
        const sectorFilteredSales = filterItemsForSector(salesData, currentSectorSlug)
        const mappedSales: SaleRecord[] = sectorFilteredSales.map((s: any) => {
          let parsedNotes: any = {}
          try {
            if (s.notes) parsedNotes = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes
          } catch (e) {}

          let metaFromUid: any = {}
          if (s.e_mecef_uid) {
            try {
              if (s.e_mecef_uid.startsWith('{')) {
                metaFromUid = JSON.parse(s.e_mecef_uid)
              } else {
                s.e_mecef_uid.split('|').forEach((part: string) => {
                  const [k, v] = part.split(':')
                  if (k === 'PAY') metaFromUid.pm = v
                  if (k === 'CL') metaFromUid.cn = v
                  if (k === 'ST') metaFromUid.st = v
                })
              }
            } catch (e) {}
          }

          let lines: CartItem[] = []
          if (s.items && Array.isArray(s.items) && s.items.length > 0) {
            lines = s.items.map((item: any) => ({
              product: {
                id: item.product_id || item.id,
                code: item.product_id ? item.product_id.slice(0, 8) : 'ART',
                name: item.product_name || 'Article',
                unit: 'Pièce',
                selling_price: Number(item.unit_price) || 0,
                cost_price: Number(item.unit_cost) || 0,
                is_vat_subject: Number(item.tva_rate) > 0,
                vat_rate: Number(item.tva_rate) || 0,
              },
              qty: Number(item.quantity) || 1,
              unitPrice: Number(item.unit_price) || 0,
              discount: 0,
            }))
          } else if (parsedNotes.lines && Array.isArray(parsedNotes.lines)) {
            lines = parsedNotes.lines.map((l: any) => ({
              product: l.product || {
                id: l.productId || l.id,
                code: l.code || 'ART',
                name: l.name || 'Article',
                unit: l.unit || 'Pièce',
                selling_price: l.unitPrice || 0,
                cost_price: 0,
              },
              qty: Number(l.qty) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              discount: Number(l.discount) || 0,
              batchTierLabel: l.batchTierLabel,
            }))
          }

          const clientName = s.customer?.name || s.customer_name || parsedNotes.customer_name || metaFromUid.cn || 'Client Comptoir'
          const clientIfu = s.customer?.ifu_number || s.customer_ifu || parsedNotes.customer_ifu || null

          let paymentsList: PaymentLine[] = []
          if (Array.isArray(parsedNotes.payments) && parsedNotes.payments.length > 0) {
            paymentsList = parsedNotes.payments
          } else if (metaFromUid.payments && Array.isArray(metaFromUid.payments)) {
            paymentsList = metaFromUid.payments
          } else {
            const rawMethod = metaFromUid.pm || s.payment_method || (s.payment_status === 'credit' ? 'credit' : (s.payment_status || 'especes'))
            paymentsList = [
              {
                method: rawMethod as any,
                amount: Number(s.paid_amount ?? s.total_amount) || 0
              }
            ]
          }

          const stUpper = String(s.status || '').toUpperCase()
          const isDeferredSale = s.order_type === 'pos_deferred' || s.status === 'pending_delivery' || metaFromUid.st === 'A_LIVRER'
          const isAvoir = s.payment_status === 'avoir' || stUpper.includes('ANNUL') || stUpper === 'AVOIR' || stUpper === 'CANCELLED' || metaFromUid.st === 'AVOIR'

          const ancienneDette = Number(s.ancienne_dette_avant_facture ?? parsedNotes.ancienne_dette_avant_facture ?? 0)
          const creditActuel = Number(s.montant_credit_actuel ?? parsedNotes.montant_credit_actuel ?? s.credit_amount ?? 0)
          const resteGlobal = Number(s.montant_restant_du_global ?? parsedNotes.montant_restant_du_global ?? (ancienneDette + creditActuel))

          return {
            id: s.id,
            order_number: s.order_number || `VTE-${s.id.slice(0, 6)}`,
            date: s.created_at || s.order_date || new Date().toISOString(),
            customer_name: clientName,
            customer_id: s.customer_id,
            customer_ifu: clientIfu,
            total_amount: Number(s.total_amount) || 0,
            total_ht: Number(s.subtotal_ht ?? s.total_ht) || Math.round((Number(s.total_amount) || 0) / 1.18),
            total_tva: Number(s.tva_amount ?? s.total_tax) || 0,
            total_aib: Number(s.aib_amount) || 0,
            total_exonere: Number(parsedNotes.total_exonere) || 0,
            amount_paid: Number(s.paid_amount ?? s.amount_paid) || (s.payment_status === 'credit' ? 0 : Number(s.total_amount) || 0),
            credit_amount: Number(s.credit_amount) || (s.payment_status === 'credit' ? Number(s.total_amount) || 0 : 0),
            ancienne_dette_avant_facture: ancienneDette,
            montant_credit_actuel: creditActuel,
            montant_restant_du_global: resteGlobal,
            payments: paymentsList,
            is_deferred: isDeferredSale,
            status: isAvoir ? 'AVOIR' : isDeferredSale ? 'A_LIVRER' : 'COMPLET',
            annulation_avoir: parsedNotes.annulation_avoir || null,
            lines,
            emballages_consignes: Array.isArray(parsedNotes.emballages_consignes) ? parsedNotes.emballages_consignes : undefined,
            table_numero: s.sector_meta?.table_numero || parsedNotes.table_numero || s.table_numero || (s as any).table_numero || undefined,
            couverts: Number(s.sector_meta?.couverts || parsedNotes.couverts || (s as any).couverts || 0) || undefined,
            serveur_nom: s.sector_meta?.serveur_nom || parsedNotes.serveur_nom || s.server_name || (s as any).serveur_nom || undefined,
          }
        })
        setSalesHistory(mappedSales)
      }
    } catch (salesErr: any) {
      console.warn('[POSPage] Erreur récupération historique des ventes:', salesErr)
    } finally {
      setLoading(false)
    }
  }, [companyId, currentSectorSlug, toast, supabaseTenant, company?.id, user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Synchronisation temps réel Supabase dans le POS
  useEffect(() => {
    if (!company?.id) return

    const channel = supabase
      .channel(`products-pos-${company.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `company_id=eq.${company.id}`
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [company?.id, loadData])

  // ─── Gestion de la Modale Détail Produit & Contrôle Strict Double Stock ─────

  const handleOpenProductDetail = (product: Product) => {
    // Si recette restaurant : vérifier simplement que le prix de vente est valide
    if (product.is_recipe) {
      if (Number(product.selling_price) <= 0) {
        toast.error('Prix non défini', `La recette "${product.name}" n'a pas de prix de vente valide.`)
        return
      }
      setSelectedProductForDetail(product)
      setDetailQty(1)
      return
    }

    const stockVente = Number(product.stock_vente ?? product.sector_meta?.stock_vente ?? 0)
    const stockMagasin = Number(product.stock_magasin ?? product.sector_meta?.stock_magasin ?? 0)
    const unitMagasin = product.ucd || product.sector_meta?.ucd || 'Carton'

    if (stockVente <= 0) {
      if (canTransferStock) {
        toast.error(
          `Stock vente épuisé : ${product.name}`,
          `Magasin : ${stockMagasin} ${unitMagasin} disponible(s). Transfert obligatoire avant la vente.`
        )
        setTransfertProduct(product)
      } else {
        toast.error(
          `Stock vente épuisé : ${product.name}`,
          `Cet article est en rupture en vente. Veuillez demander un transfert au Gestionnaire.`
        )
      }
      return
    }

    setSelectedProductForDetail(product)
    setDetailQty(1)
  }

  const handleConfirmAddToCart = () => {
    if (!selectedProductForDetail) return
    if (isStation && isFuelProduct(selectedProductForDetail)) {
      toast.error('Carburant non autorisé en panier', 'Les ventes de carburant doivent être traitées exclusivement via le module Vente Distributeur.')
      return
    }
    const qty = Number(detailQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Quantité invalide', 'Veuillez saisir une quantité supérieure à 0.')
      return
    }

    // Si produit recette : autoriser l'ajout (déstockage des ingrédients Cuisine à la validation de la vente)
    if (selectedProductForDetail.is_recipe) {
      if (Number(selectedProductForDetail.selling_price) <= 0) {
        toast.error('Prix invalide', 'Cette recette n\'a pas de prix de vente configuré.')
        return
      }
    } else {
      const stockVente = Number(selectedProductForDetail.stock_vente ?? selectedProductForDetail.sector_meta?.stock_vente ?? 0)
      const unitVente = selectedProductForDetail.uv || selectedProductForDetail.sector_meta?.uv || selectedProductForDetail.unit || 'Pièce'
      const currentInCart = cart
        .filter((i) => i.product.id === selectedProductForDetail.id)
        .reduce((sum, i) => sum + i.qty, 0)

      if (currentInCart + qty > stockVente) {
        toast.error(
          'Stock vente insuffisant',
          `Stock disponible en vente : ${stockVente} ${unitVente}. Déjà au panier : ${currentInCart} ${unitVente}. Demandé : ${qty} ${unitVente}. Veuillez effectuer un transfert depuis le magasin.`
        )
        return
      }
    }

    const isBrasserie = currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons'
    const match = calculateBatchLinePrice(
      qty,
      selectedProductForDetail.batch_pricing,
      selectedProductForDetail.selling_price
    )

    let effPrice = match.effectiveUnitPriceTtc
    let pricingSource: 'PRIX_PERSONNALISE' | 'GRILLE' | 'STANDARD' = 'STANDARD'
    let appliedGridName: string | null = null
    let appliedGridId: string | null = null
    let standardPrice = selectedProductForDetail.selling_price
    let unitCostPrice = selectedProductForDetail.cost_price || 0
    let unitSaving = 0

    if (isBrasserie) {
      const nextTotal = (totalBrasserieQuantity || 0) + qty
      const nextGrid = findApplicableGrille(brasserieGrilles, nextTotal)
      const gridPrices = nextGrid ? (brasserieGrillesPrixCache[nextGrid.id] || {}) : {}
      const pr = calculateLinePricing({
        product: selectedProductForDetail,
        qteLigne: qty,
        qteTotaleVente: nextTotal,
        clientId: selectedCustomerId || null,
        grilleApplicable: nextGrid,
        grillePrixMap: gridPrices,
        clientPrixMap: brasserieClientPrixMap,
      })
      effPrice = pr.prix_applique
      pricingSource = pr.source_prix
      appliedGridName = pr.grille_utilisee || null
      appliedGridId = pr.grille_id || null
      standardPrice = pr.prix_standard
      unitCostPrice = pr.prix_achat
      unitSaving = pr.economie_unitaire
    }

    const newLineId = `pos-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    setCart((prev) => [
      ...prev,
      {
        lineId: newLineId,
        product: selectedProductForDetail,
        qty,
        unitPrice: effPrice,
        discount: 0,
        batchTierLabel: match.matchedTierLabel,
        isBatchTier: match.isMatched,
        pricingSource,
        appliedGridName,
        appliedGridId,
        standardPrice,
        unitCostPrice,
        unitSaving,
      }
    ])

    setSelectedProductForDetail(null)
    setDetailQty(1)
    setIsCartVisible(true) // Glissement immédiat et visibilité du panier à droite lors de l'ajout
  }

  const handleDirectAddToCart = (item: { product: any; qty: number; unitPrice: number; discount: number }) => {
    if (isStation && isFuelProduct(item.product)) {
      toast.error('Carburant non autorisé en panier', 'Les ventes de carburant doivent être traitées exclusivement via le module Vente Distributeur.')
      return
    }
    // Si produit recette : autoriser l'ajout (consommation cuisine lors de la validation effective)
    if (item.product.is_recipe) {
      if (Number(item.product.selling_price) <= 0) {
        toast.error('Prix non configuré', `La recette "${item.product.name}" n'a pas de prix de vente valide.`)
        return
      }
    } else {
      const stockVente = Number(item.product.stock_vente ?? item.product.sector_meta?.stock_vente ?? 0)
      const stockMagasin = Number(item.product.stock_magasin ?? item.product.sector_meta?.stock_magasin ?? 0)
      const unitMagasin = item.product.ucd || item.product.sector_meta?.ucd || 'Carton'
      const unitVente = item.product.uv || item.product.sector_meta?.uv || item.product.unit || 'Pièce'

      if (stockVente <= 0) {
        if (canTransferStock) {
          toast.error(
            `Stock vente épuisé : ${item.product.name}`,
            `Magasin : ${stockMagasin} ${unitMagasin} disponible(s). Transfert obligatoire avant la vente.`
          )
          setTransfertProduct(item.product)
        } else {
          toast.error(
            `Stock vente épuisé : ${item.product.name}`,
            `Cet article est en rupture en vente. Veuillez demander un transfert au Gestionnaire.`
          )
        }
        return
      }

      const currentInCart = cart
        .filter((i) => i.product.id === item.product.id)
        .reduce((sum, i) => sum + i.qty, 0)

      if (currentInCart + item.qty > stockVente) {
        toast.error(
          'Stock vente insuffisant',
          `Stock disponible en vente : ${stockVente} ${unitVente}. Déjà au panier : ${currentInCart} ${unitVente}. Demandé : ${item.qty} ${unitVente}.`
        )
        return
      }
    }

    const isBrasserie = currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons'
    let effPrice = item.unitPrice
    let pricingSource: 'PRIX_PERSONNALISE' | 'GRILLE' | 'STANDARD' = 'STANDARD'
    let appliedGridName: string | null = null
    let appliedGridId: string | null = null
    let standardPrice = item.product.selling_price
    let unitCostPrice = item.product.cost_price || 0
    let unitSaving = 0

    if (isBrasserie) {
      const nextTotal = (totalBrasserieQuantity || 0) + item.qty
      const nextGrid = findApplicableGrille(brasserieGrilles, nextTotal)
      const gridPrices = nextGrid ? (brasserieGrillesPrixCache[nextGrid.id] || {}) : {}
      const pr = calculateLinePricing({
        product: item.product,
        qteLigne: item.qty,
        qteTotaleVente: nextTotal,
        clientId: selectedCustomerId || null,
        grilleApplicable: nextGrid,
        grillePrixMap: gridPrices,
        clientPrixMap: brasserieClientPrixMap,
      })
      effPrice = pr.prix_applique
      pricingSource = pr.source_prix
      appliedGridName = pr.grille_utilisee || null
      appliedGridId = pr.grille_id || null
      standardPrice = pr.prix_standard
      unitCostPrice = pr.prix_achat
      unitSaving = pr.economie_unitaire
    }

    const newLineId = `pos-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    setCart((prev) => [
      ...prev,
      {
        lineId: newLineId,
        product: item.product,
        qty: item.qty,
        unitPrice: effPrice,
        discount: item.discount || 0,
        pricingSource,
        appliedGridName,
        appliedGridId,
        standardPrice,
        unitCostPrice,
        unitSaving,
      }
    ])
    setIsCartVisible(true)
  }

  const updateCartItemQty = (lineIdentifier: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(lineIdentifier)
      return
    }
    const targetItem = cart.find(i => (i.lineId || i.product.id) === lineIdentifier)
    if (targetItem && !targetItem.product.is_recipe) {
      const stockVente = Number(targetItem.product.stock_vente ?? targetItem.product.sector_meta?.stock_vente ?? 0)
      const unitVente = targetItem.product.uv || targetItem.product.sector_meta?.uv || targetItem.product.unit || 'Pièce'
      const otherLinesQty = cart
        .filter(i => (i.lineId || i.product.id) !== lineIdentifier && i.product.id === targetItem.product.id)
        .reduce((sum, i) => sum + i.qty, 0)
      if (otherLinesQty + newQty > stockVente) {
        toast.error(
          'Stock vente insuffisant',
          `Disponible en vente : ${stockVente} ${unitVente}. Déjà réservé sur d'autres lignes : ${otherLinesQty} ${unitVente}.`
        )
        return
      }
    }
    const safeQty = Math.round(newQty * 1000) / 1000
    const isBrasserie = currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons'

    setCart((prev) =>
      prev.map((i) => {
        if ((i.lineId || i.product.id) !== lineIdentifier) return i
        const match = calculateBatchLinePrice(
          safeQty,
          i.product.batch_pricing,
          i.product.selling_price
        )
        let effPrice = match.effectiveUnitPriceTtc

        if (isBrasserie) {
          const deltaQty = safeQty - i.qty
          const nextTotal = (totalBrasserieQuantity || 0) + deltaQty
          const nextGrid = findApplicableGrille(brasserieGrilles, nextTotal)
          const gridPrices = nextGrid ? (brasserieGrillesPrixCache[nextGrid.id] || {}) : {}
          const pr = calculateLinePricing({
            product: i.product,
            qteLigne: safeQty,
            qteTotaleVente: nextTotal,
            clientId: selectedCustomerId || null,
            grilleApplicable: nextGrid,
            grillePrixMap: gridPrices,
            clientPrixMap: brasserieClientPrixMap,
          })
          effPrice = pr.prix_applique
          return {
            ...i,
            qty: safeQty,
            unitPrice: effPrice,
            batchTierLabel: match.matchedTierLabel,
            isBatchTier: match.isMatched,
            pricingSource: pr.source_prix,
            appliedGridName: pr.grille_utilisee || null,
            appliedGridId: pr.grille_id || null,
            standardPrice: pr.prix_standard,
            unitCostPrice: pr.prix_achat,
            unitSaving: pr.economie_unitaire,
          }
        }

        return {
          ...i,
          qty: safeQty,
          unitPrice: effPrice,
          batchTierLabel: match.matchedTierLabel,
          isBatchTier: match.isMatched,
        }
      })
    )
  }

  const handleTransferSuccess = (productId: string, qteMagasinDed: number, qteVenteAjout: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p
        const currentMeta = p.sector_meta || {}
        const currentMag = Number(p.stock_magasin ?? currentMeta.stock_magasin ?? 0)
        const currentVente = Number(p.stock_vente ?? currentMeta.stock_vente ?? 0)
        const newMag = Math.max(0, Math.round((currentMag - qteMagasinDed) * 1000) / 1000)
        const newVente = Math.round((currentVente + qteVenteAjout) * 1000) / 1000
        return {
          ...p,
          stock_magasin: newMag,
          stock_vente: newVente,
          sector_meta: {
            ...currentMeta,
            stock_magasin: newMag,
            stock_vente: newVente,
          }
        }
      })
    )
  }


  const removeFromCart = (lineIdentifier: string) => {
    setCart((prev) => prev.filter((i) => (i.lineId || i.product.id) !== lineIdentifier))
  }

  const clearCart = () => {
    setCart([])
    setSelectedCustomerId('')
    setIsDeferred(false)
    setLoadedPendingBon(null)
  }

  // =============================================================================
  // AUDIT & FORMULES FINANCIÈRES VENTE & POINT DE VENTE (POS) :
  // 1. Sous-total TTC brut :
  //    Somme(quantité * prix_unitaire_TTC)
  // 2. Remise totale :
  //    Somme(quantité * remise_unitaire)
  // 3. Total Net TTC à payer :
  //    Max(0, Sous-total TTC brut - Remise totale)
  // 4. Décomposition fiscale stricte (UEMOA / Bénin DGI) :
  //    - Pour les articles assujettis TVA (taux standard 18%) :
  //      * HT = Ligne TTC / (1 + taux_tva / 100) = Ligne TTC / 1.18
  //      * TVA = Ligne TTC - Ligne HT
  //      * AIB (si applicable, 1% pour commerçants immatriculés IFU ou 5% non immatriculés) = Ligne HT * (taux_aib / 100)
  //    - Pour les articles exonérés de TVA :
  //      * HT = Ligne TTC, TVA = 0 FCFA
  // 5. Encaissement Espèces & Monnaie :
  //    - Monnaie à rendre = Max(0, Espèces remises - Total Net TTC)
  // 6. Règle multi-modes de paiement :
  //    - Équilibre strict obligatoire : Mode 1 (montant) + Mode 2 (montant) === Total Net TTC
  // =============================================================================

  const subtotalTTC = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
  }, [cart])

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty * i.discount, 0)
  }, [cart])

  // Décomposition fiscale ligne par ligne rigoureuse (TVA calculée UNIQUEMENT sur la base taxable HT)
  const cartFiscalSummary = useMemo(() => {
    let ht = 0
    let tva = 0
    let aib = 0
    let totalExonere = 0
    let hasProductWithAib = false
    let detectedAibRate = 0

    cart.forEach((item) => {
      const lineTtc = item.qty * item.unitPrice - item.qty * item.discount
      const isVat = isProductVatSubject(item.product)
      const vatRate = isVat ? Number(item.product.vat_rate ?? item.product.tva_rate ?? 18) : 0

      // AIB : si coché sur le produit OU coché manuellement sur le panier
      const isProdAib = Boolean(
        item.product.is_aib_subject ??
        item.product.sector_meta?.is_aib_subject ??
        false
      )
      if (isProdAib) {
        hasProductWithAib = true
      }
      const isAib = isProdAib || applyAibCart
      const itemAibRate = isProdAib
        ? Number(item.product.aib_rate ?? item.product.sector_meta?.aib_rate ?? cartAibRate)
        : cartAibRate

      if (isAib && itemAibRate > detectedAibRate) {
        detectedAibRate = itemAibRate
      }

      if (lineTtc > 0) {
        const decomp = decomposerTTC(
          lineTtc,
          1,
          isVat,
          isAib,
          vatRate,
          itemAibRate
        )
        if (isVat) {
          ht += decomp.ht
          tva += decomp.tva
        } else {
          totalExonere += lineTtc
        }
        aib += decomp.aib
      }
    })

    return {
      ht: Math.round(ht * 100) / 100,
      tva: Math.round(tva * 100) / 100,
      aib: Math.round(aib * 100) / 100,
      hasProductWithAib,
      aibRate: detectedAibRate || cartAibRate || 1,
      totalExonere: Math.round(totalExonere * 100) / 100,
    }
  }, [cart, applyAibCart, cartAibRate])

  // Total Net TTC à payer : Sous-total TTC - Remises (RÈGLE ABSOLUE GESTIO 229 : L'AIB ne s'ajoute JAMAIS au prix TTC catalogue client)
  const totalNetTTC = Math.max(0, Math.round((subtotalTTC - totalDiscount) * 100) / 100)

  // Ventilation Bar vs Cuisine pour le panier restaurant (Règle Métier 2 Stocks Indépendants)
  const { subtotalBarTTC, subtotalCuisineTTC } = useMemo(() => {
    let bar = 0
    let cuisine = 0
    cart.forEach(item => {
      const lineTtc = item.qty * item.unitPrice - item.qty * item.discount
      const isCuisine = Boolean(
        item.product.is_recipe ||
        item.product.recipe_id ||
        item.product.sector_meta?.restaurant_circuit === 'CUISINE' ||
        (item.product as any).restaurant_circuit === 'CUISINE'
      )
      if (isCuisine) {
        cuisine += lineTtc
      } else {
        bar += lineTtc
      }
    })
    return {
      subtotalBarTTC: Math.max(0, Math.round(bar)),
      subtotalCuisineTTC: Math.max(0, Math.round(cuisine))
    }
  }, [cart])

  // Gestion du minuteur d'inactivité du panier (3 minutes)
  useEffect(() => {
    if (cart.length > 0) {
      setLastCartActivity(Date.now())
      setInactiveSeconds(0)
      setShowInactivityWarning(false)
    }
  }, [cart.length])

  useEffect(() => {
    if (cart.length === 0) {
      setInactiveSeconds(0)
      setShowInactivityWarning(false)
      return
    }

    const interval = setInterval(() => {
      const diffSec = Math.floor((Date.now() - lastCartActivity) / 1000)
      setInactiveSeconds(diffSec)
      if (diffSec >= 180 && !showInactivityWarning) {
        setShowInactivityWarning(true)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [cart.length, lastCartActivity, showInactivityWarning])

  // Compte à rebours 4 minutes Restaurant & Finalisation automatique (Section 6)
  useEffect(() => {
    if (!pendingRestoOrder?.expiresAt) return

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(pendingRestoOrder.expiresAt).getTime() - Date.now()) / 1000))
      setPendingCountdownSeconds(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        handleFinalizePendingOrder(pendingRestoOrder)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [pendingRestoOrder])

  // Mécanisme de récupération en arrière-plan des commandes expirées (> 4 min)
  useEffect(() => {
    if (!isRestaurant || !companyId) return
    const runRecovery = async () => {
      try {
        const { traiterCommandesExpirees } = await import('../../../services/restaurantService')
        await traiterCommandesExpirees(companyId)
      } catch (_) {}
    }
    runRecovery()
    const timer = setInterval(runRecovery, 30000)
    return () => clearInterval(timer)
  }, [isRestaurant, companyId])

  const handleFinalizePendingOrder = async (orderObj?: typeof pendingRestoOrder) => {
    const target = orderObj || pendingRestoOrder
    if (!target || !companyId || isFinalizingPending) return
    setIsFinalizingPending(true)
    try {
      const { finaliserCommandeRestaurant } = await import('../../../services/restaurantService')
      const res = await finaliserCommandeRestaurant({
        company_id: companyId,
        order_number: target.orderNumber,
        circuit: target.circuit,
        serveur_nom: target.serveurNom,
        items: target.items.map(c => ({
          produit_id: c.product.id,
          designation: c.product.name,
          quantite: c.qty,
          prix_unitaire: c.unitPrice,
          is_consigne: Boolean(c.product.sector_meta?.is_consigne)
        })),
        total_ttc: target.totalTtc
      })

      if (res.success) {
        toast.success('Commande finalisée avec succès', `N° ${target.orderNumber} confirmée. Déstockage et KDS transmis.`)
        const finalizedSale: SaleRecord = {
          id: `sale-${target.orderNumber}`,
          order_number: target.orderNumber,
          date: new Date().toISOString(),
          customer_name: target.clientNom,
          total_amount: target.totalTtc,
          total_ht: target.totalHt,
          total_tva: 0,
          total_aib: 0,
          amount_paid: 0,
          credit_amount: target.totalTtc,
          payments: [{ method: 'credit', amount: target.totalTtc }],
          is_deferred: false,
          status: 'COMPLET',
          lines: target.items,
          table_numero: target.tableNumero,
          serveur_nom: target.serveurNom
        }
        setCurrentSale(finalizedSale)
        setSalesHistory(prev => [finalizedSale, ...prev.filter(s => s.order_number !== target.orderNumber)])
        setPrintFormat('ticket80_double')
        setShowInvoiceModal(true)
        setShowPendingRestoModal(false)
        setPendingRestoOrder(null)
      } else {
        toast.error('Erreur de finalisation', res.error || 'Impossible de finaliser la commande.')
      }
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setIsFinalizingPending(false)
    }
  }

  const handleCancelPendingOrder = async () => {
    if (!pendingRestoOrder || !companyId) return
    if (!cancelMotif.trim()) {
      toast.error('Motif obligatoire', 'Veuillez saisir le motif d annulation de la commande.')
      return
    }
    try {
      const { annulerCommandeEnAttente } = await import('../../../services/restaurantService')
      const res = await annulerCommandeEnAttente({
        company_id: companyId,
        order_number: pendingRestoOrder.orderNumber,
        motif_annulation: cancelMotif.trim(),
        annule_par: user?.full_name || 'Gérant'
      })
      if (res.success) {
        toast.success('Commande annulée', `N° ${pendingRestoOrder.orderNumber} a été annulée. Aucun déstockage ni créance n ont été créés.`)
        setShowPendingRestoModal(false)
        setShowCancelPrompt(false)
        setCancelMotif('')
        setPendingRestoOrder(null)
      } else {
        toast.error('Erreur', res.error || 'Impossible d annuler la commande.')
      }
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleReopenPendingOrderForEdit = () => {
    if (!pendingRestoOrder) return
    setCart([...pendingRestoOrder.items])
    setShowPendingRestoModal(false)
    toast.info('Commande rouverte', `Les articles de ${pendingRestoOrder.orderNumber} ont été replacés dans le panier. Ajustez les quantités et revalidez.`)
  }

  // ─── Gestion des Modes de Paiement (Panier & Checkout Intégré) ──────────────

  // Synchronisation des montants lors des variations du Total TTC
  useEffect(() => {
    if (!cashReceivedInput || Number(cashReceivedInput) < totalNetTTC) {
      setCashReceivedInput(String(totalNetTTC))
    }
    if (isMultiMode) {
      if (multiMode1Amount > totalNetTTC) {
        setMultiMode1Amount(totalNetTTC)
        setMultiMode2Amount(0)
      } else {
        setMultiMode2Amount(Math.max(0, Math.round(totalNetTTC - multiMode1Amount)))
      }
    } else {
      setMultiMode1Amount(totalNetTTC)
      setMultiMode2Amount(0)
    }
  }, [totalNetTTC])

  const handleToggleMultiMode = (checked: boolean) => {
    setIsMultiMode(checked)
    if (checked) {
      const half = Math.round(totalNetTTC / 2)
      setMultiMode1Amount(half)
      setMultiMode2Amount(totalNetTTC - half)
      if (multiMode1Canal === multiMode2Canal) {
        setMultiMode2Canal(multiMode1Canal === 'especes' ? 'momo_mtn' : 'especes')
      }
    }
  }

  const handleMode1AmountChange = (val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val)
    setMultiMode1Amount(safeVal)
    // Ajustement automatique instantané du montant 2 avec le reliquat exact
    setMultiMode2Amount(Math.max(0, Math.round(totalNetTTC - safeVal)))
  }

  const handleMode2AmountChange = (val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val)
    setMultiMode2Amount(safeVal)
  }

  // Calcul automatique des emballages sortis pour le secteur Brasserie
  const brasserieSorties = useMemo(() => {
    if (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons') return []
    const map: Record<string, { id?: string; code: string; designation: string; sortie: number }> = {}

    cart.forEach((item) => {
      const p = item.product
      let embCode = ''
      let embName = ''
      let embId = p.sector_meta?.emballage_id || ''

      const embCodeFromProduct = ((p as any).emballage_type_code || (p as any).emballage_code || p.sector_meta?.emballage_code || '').trim().toUpperCase()

      const matchedEmb = brasserieEmballagesList.find(e => e.id === embId || (embCodeFromProduct && e.code === embCodeFromProduct) || e.code === p.sector_meta?.emballage_code)
      if (matchedEmb && isVraiCodeEmballage(matchedEmb.code)) {
        embCode = matchedEmb.code.trim().toUpperCase()
        embName = matchedEmb.designation
        embId = matchedEmb.id
      } else if (embCodeFromProduct && isVraiCodeEmballage(embCodeFromProduct)) {
        embCode = embCodeFromProduct
        embName = `Casier ${embCodeFromProduct}`
      } else {
        const nameUpper = (p.name || '').toUpperCase()
        if (nameUpper.includes('12T') || nameUpper.includes('12 BOUT') || nameUpper.includes('12B') || nameUpper.includes('FLAG 12')) {
          embCode = 'C12T'
          embName = 'Casier 12 Bouteilles'
        } else if (nameUpper.includes('20T') || nameUpper.includes('20 BOUT') || nameUpper.includes('20B') || nameUpper.includes('CASTEL 20')) {
          embCode = 'C20T'
          embName = 'Casier 20 Bouteilles'
        } else if (nameUpper.includes('24T') || nameUpper.includes('24 BOUT') || nameUpper.includes('24B') || nameUpper.includes('BEAUFORT 24')) {
          embCode = 'C24T'
          embName = 'Casier 24 Bouteilles'
        }
      }

      if (embCode && isVraiCodeEmballage(embCode)) {
        const coefEmb = Number(p.sector_meta?.qte_emballage) || 1
        const count = Math.round(item.qty * coefEmb)
        if (!map[embCode]) {
          map[embCode] = { id: embId, code: embCode, designation: embName || `Casier ${embCode}`, sortie: 0 }
        }
        map[embCode].sortie += count
      }
    })

    return Object.values(map)
  }, [cart, currentSectorSlug, brasserieEmballagesList])

  // Lignes complètes d'emballages pour la vente en cours (Panier + Dettes Précédentes)
  // Règle Métier : Précédent + Facture - Rendus = Reste (Dû final)
  const brasserieEmballageRows = useMemo(() => {
    if (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons') return []
    const isComptoir = !selectedCustomer || selectedCustomer.code === 'COMPTOIR' || (selectedCustomer.name || '').toLowerCase().includes('comptoir')

    const knownEmbs: Record<string, { id?: string; code: string; designation: string }> = {
      C12T: { id: 'c12t', code: 'C12T', designation: 'Casier 12 Bouteilles' },
      C20T: { id: 'c20t', code: 'C20T', designation: 'Casier 20 Bouteilles' },
      C24T: { id: 'c24t', code: 'C24T', designation: 'Casier 24 Bouteilles' },
    }
    brasserieEmballagesList.forEach(e => {
      const c = (e.code || '').trim().toUpperCase()
      if (c && isVraiCodeEmballage(c)) {
        knownEmbs[c] = { id: e.id, code: c, designation: e.designation }
      }
    })

    const codesSet = new Set<string>()
    // 1. Ajouter tous les emballages sortis dans le panier (vrais codes uniquement)
    brasserieSorties.forEach(s => {
      const c = s.code.trim().toUpperCase()
      if (isVraiCodeEmballage(c)) codesSet.add(c)
    })

    // 2. Si client enregistré, ajouter tous les emballages pour lesquels il a une dette précédente > 0
    if (!isComptoir) {
      Object.entries(clientEmballagesPrecedents).forEach(([k, v]) => {
        const upperK = k.trim().toUpperCase()
        if (!isVraiCodeEmballage(upperK)) return

        if (Number(v) > 0) {
          codesSet.add(upperK)
        }
      })
    }

    if (codesSet.size === 0) return []

    const rows = Array.from(codesSet).map(code => {
      const sortieItem = brasserieSorties.find(s => s.code.toUpperCase() === code)
      const matchedMeta = knownEmbs[code]
      const embId = sortieItem?.id || matchedMeta?.id
      const designation = sortieItem?.designation || matchedMeta?.designation || `Casier ${code}`

      const prec = isComptoir ? 0 : (Number(clientEmballagesPrecedents[code]) || 0)
      const facture = sortieItem ? Number(sortieItem.sortie) || 0 : 0
      const rendus = Number(brasserieRetours[code]) || 0
      const reste = isComptoir ? (facture - rendus) : (prec + facture - rendus)

      return {
        id: embId,
        code,
        designation,
        precedent: prec,
        facture,
        rendus,
        reste
      }
    })

    // FILTRAGE STRICT SÉCURITÉ & ERGONOMIE (PROMPT GHOST EMBALLAGES) :
    // 1. Éliminer tout code fantôme (UUID contenant '-' avec length > 10)
    // 2. Ne conserver que les vrais codes de casiers (C12T, C20T, C24T, etc.)
    // 3. Masquer les lignes où Précédent = 0 ET Facture = 0 ET Rendus = 0 (lignes inutiles)
    // 4. Trier dans l'ordre naturel (C12T, C20T, C24T)
    return rows
      .filter(r => isVraiCodeEmballage(r.code))
      .filter(r => (r.precedent > 0 || r.facture > 0 || r.rendus > 0))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  }, [currentSectorSlug, selectedCustomer, clientEmballagesPrecedents, brasserieSorties, brasserieRetours, brasserieEmballagesList])

  // Calculs en temps réel multi-modes
  const multiSum = Math.round((multiMode1Amount + multiMode2Amount) * 100) / 100
  const multiDiff = Math.round((totalNetTTC - multiSum) * 100) / 100
  const isMultiBalanced = isMultiMode && Math.abs(multiDiff) === 0 && totalNetTTC > 0 && multiMode1Amount >= 0 && multiMode2Amount >= 0

  // Calculs espèces en mode unique
  const isCash = singleMethod === 'especes'
  const cashGiven = Number(cashReceivedInput) || 0
  const cashChange = Math.max(0, cashGiven - totalNetTTC)
  const isCashInsufficient = isCash && cashGiven < totalNetTTC

  // Règle de validation stricte : Déverrouillage uniquement si équilibre parfait ET caisse ouverte
  const isPaymentValid = isMultiMode
    ? isMultiBalanced
    : (!isCashInsufficient && totalNetTTC > 0)

  const canValidateSale = cart.length > 0 && isPaymentValid && !paying && !checkingCaisse && !!activeCaisse && !activeCaisse.is_previous_day

  // Libellé dynamique du bouton de validation selon l'équilibre et l'état de caisse
  const validationButtonText = useMemo(() => {
    if (!checkingCaisse && !activeCaisse) {
      return "Veuillez ouvrir la caisse"
    }
    if (activeCaisse?.is_previous_day) {
      return "Session antérieure non clôturée : Vente bloquée"
    }
    if (cart.length === 0) return 'Panier vide'
    if (paying) return 'Validation en cours...'

    if (isMultiMode) {
      if (multiDiff > 0) {
        return `Validation impossible : Somme ≠ Total TTC (Reste ${fmt(multiDiff)})`
      }
      if (multiDiff < 0) {
        return `Validation impossible : Somme ≠ Total TTC (Trop perçu ${fmt(Math.abs(multiDiff))})`
      }
      return `Valider la Vente (${fmt(totalNetTTC)})`
    } else {
      if (isCashInsufficient) {
        return `Validation impossible : Espèces insuffisantes (Reste ${fmt(totalNetTTC - cashGiven)})`
      }
      return `Valider la Vente (${fmt(totalNetTTC)})`
    }
  }, [checkingCaisse, activeCaisse, cart.length, paying, isMultiMode, multiDiff, totalNetTTC, isCashInsufficient, cashGiven])

  // RÈGLE MÉTIER OBLIGATOIRE BRASSERIE :
  // - Client Comptoir : Le Dû/Reste doit donner 0 (Rendus = Facture)
  // - Client Enregistré : Précédent + Facture - Rendus = Reste (Dû final)
  const validerConditionsEmballage = (): { ok: boolean; message?: string } => {
    if (currentSectorSlug !== 'brasserie' && currentSectorSlug !== 'brasserie-depot-boissons') {
      return { ok: true }
    }
    if (brasserieEmballageRows.length === 0) {
      return { ok: true }
    }

    const isComptoir = !selectedCustomer || selectedCustomer.code === 'COMPTOIR' || (selectedCustomer.name || '').toLowerCase().includes('comptoir')

    if (isComptoir) {
      for (const row of brasserieEmballageRows) {
        if (row.reste !== 0) {
          return {
            ok: false,
            message: `Client Comptoir : Pour ${row.code}, Facture=${row.facture}, Rendus=${row.rendus}, Reste=${row.reste}. Le Reste doit donner 0. Saisissez Rendus = Facture avant validation.`
          }
        }
      }
    }
    return { ok: true }
  }

  // ─── Récupération et chargement d'un Bon de Commande dans le Panier POS ────
  const handleLoadBonIntoCart = (b: PendingBon) => {
    const newCart: CartItem[] = b.items.map(item => {
      const p = products.find(prod => prod.id === item.product_id)
      return {
        product: p || ({
          id: item.product_id,
          name: item.product_name,
          price_ttc: item.unit_price,
          selling_price: item.unit_price,
          cost_price: 0,
          stock_vente: 9999,
          stock_alert: 0,
          active: true,
          allow_discount: false
        } as any),
        qty: item.quantity,
        unitPrice: item.unit_price,
        discount: 0
      }
    })
    setCart(newCart)
    setLoadedPendingBon(b)
    if (b.customer_name && b.customer_name !== 'Client Comptoir') {
      const cust = customers.find(c => c.name.toLowerCase() === b.customer_name.toLowerCase())
      if (cust) {
        setSelectedCustomerId(cust.id)
      }
    }
    setMesBonsModal(false)
    setActiveTab('pos')
    toast.success('Bon de commande chargé', `Bon ${b.order_number} (${fmt(b.total_amount)}) prêt pour encaissement.`)
  }

  // ─── Annulation d'un Bon de Commande en Attente avec Motif ───────────────────
  const handleCancelBon = async (b: PendingBon) => {
    const reason = window.prompt(`Motif d'annulation pour le bon ${b.order_number} :`, 'Annulation demandée par le client')
    if (reason === null) return
    try {
      const activeCompId = company?.id ?? companyId ?? ''
      const res = await annulerBonDeCommande(
        b.id,
        activeCompId,
        reason.trim() || 'Annulé en caisse',
        user?.id,
        user?.full_name
      )
      if (res.success) {
        toast.success('Bon annulé', `Le bon ${b.order_number} a été annulé avec succès.`)
        const list = await fetchPendingBons(activeCompId, currentSectorSlug)
        setMesBonsList(list)
      } else {
        toast.error('Erreur', res.error || 'Impossible d\'annuler ce bon.')
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Erreur lors de l\'annulation')
    }
  }

  // ─── Transmission du Bon de Commande à la Caisse (Mode Séparé) ─────────────
  const handleTransmettreBonCaisse = async () => {
    if (transmittingBon || cart.length === 0) return

    // Contrôle emballages brasserie si applicable
    const embCheck = validerConditionsEmballage()
    if (!embCheck.ok) {
      toast.error('Validation emballages requise', embCheck.message || '')
      return
    }

    setTransmittingBon(true)

    try {
      const activeCompId = company?.id ?? companyId ?? ''
      const sellerId = user?.id || ''
      const sellerName = user?.full_name || 'Vendeur'
      const clientNom = selectedCustomer ? selectedCustomer.name : 'Client Comptoir'

      const res = await creerEtTransmettreBon({
        company_id: activeCompId,
        sector_slug: currentSectorSlug || 'bar_restaurant',
        seller_id: sellerId,
        seller_name: sellerName,
        customer_id: selectedCustomer?.id || null,
        customer_name: clientNom,
        items: cart,
        total_ht: cartFiscalSummary.ht,
        total_tva: cartFiscalSummary.tva,
        total_aib: cartFiscalSummary.aib,
        total_ttc: totalNetTTC
      })

      if (!res.success || !res.orderNumber) {
        toast.error('Erreur transmission bon', res.error || 'Impossible de transmettre le bon.')
        return
      }

      const bonSnapshot = {
        order_number: res.orderNumber,
        date: new Date().toISOString(),
        customer_name: clientNom,
        seller_name: sellerName,
        lines: [...cart],
        total_ht: cartFiscalSummary.ht,
        total_tva: cartFiscalSummary.tva,
        total_ttc: totalNetTTC
      }

      clearCart()
      setTransmittedBonModal(bonSnapshot)
      toast.success(
        'Bon de commande transmis !',
        `Bon ${res.orderNumber} transmis à la caisse. En attente de règlement.`
      )
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Erreur lors de la transmission.')
    } finally {
      setTransmittingBon(false)
    }
  }

  // ─── Validation de la Vente ────────────────────────────────────────────────

  // ─── Validation de la Vente ────────────────────────────────────────────────

  const handleValidateSale = async () => {
    if (paying) return // Protection anti-double-clic immédiate

    // 0. Contrôle emballages brasserie obligatoire
    const embCheck = validerConditionsEmballage()
    if (!embCheck.ok) {
      toast.error('Validation emballages requise', embCheck.message || '')
      return
    }
    if (!activeCaisse) {
      toast.error('Caisse fermée', 'Veuillez ouvrir la caisse avant d\'encaisser une vente.')
      return
    }
    if (activeCaisse.is_previous_day) {
      toast.error('Session de caisse antérieure non clôturée', 'Clôturez cette session avant d\'effectuer une nouvelle vente.')
      return
    }
    if (isMultiMode) {
      if (Math.abs(multiDiff) > 0.01) {
        toast.error('Paiement non équilibré', `Somme (${fmt(multiSum)}) ≠ Total TTC (${fmt(totalNetTTC)}).`)
        return
      }
    } else if (isCash && cashGiven < totalNetTTC) {
      toast.error('Espèces insuffisantes', `Remis (${fmt(cashGiven)}) < Total TTC (${fmt(totalNetTTC)}).`)
      return
    }

    const creditAmount = isMultiMode
      ? ((multiMode1Canal === 'credit' ? multiMode1Amount : 0) + (multiMode2Canal === 'credit' ? multiMode2Amount : 0))
      : (singleMethod === 'credit' ? totalNetTTC : 0)

    if (creditAmount > 0 && !selectedCustomerId) {
      toast.error('Client Obligatoire', 'Veuillez sélectionner un client pour une vente à crédit.')
      return
    }
    if (creditAmount > 0 && selectedCustomer?.credit_authorized === false) {
      toast.error('Crédit non autorisé', `${selectedCustomer.name} n'est pas autorisé aux achats à crédit.`)
      return
    }

    // Règle 2 : Pour toute vente BAR ou RESTAURANT / MAQUIS
    if (isRestaurant) {
      if (restaurantSaleMode === 'TABLE') {
        const cleanTable = (restaurantTable || '').trim()
        if (!cleanTable && !restaurantTableId) {
          toast.error('Table requise', 'Pour une vente sur table, veuillez obligatoirement sélectionner une table dans la liste.')
          return
        }
      }

      const cleanSrv = (restaurantServeur || '').trim()
      const isComptoirSale = !cleanSrv ||
        cleanSrv.toLowerCase() === 'client comptoir' ||
        cleanSrv.toLowerCase() === 'client comptoir direct' ||
        cleanSrv.toLowerCase() === 'serveur de salle' ||
        cleanSrv.toLowerCase() === 'comptoir' ||
        restaurantSaleMode === 'COMPTOIR'

      if (restaurantSaleMode === 'TABLE' && isComptoirSale) {
        toast.error('Serveuse obligatoire', 'Pour une vente sur table, veuillez sélectionner la serveuse responsable de la commande.')
        return
      }
    }

    // ─── VERROUILLAGE IMMÉDIAT (Anti-Double-Clic & Spinner) ─────────────────
    setPaying(true)

    // ─── SNAPSHOT des données avant de vider l'UI ─────────────────────────────
    const cartSnapshot = [...cart]
    const selectedCustomerSnapshot = selectedCustomer ? { ...selectedCustomer } : null
    const brasserieEmballageRowsSnapshot = [...brasserieEmballageRows]
    const isMultiModeSnapshot = isMultiMode
    const multiMode1CanalSnapshot = multiMode1Canal
    const multiMode1AmountSnapshot = multiMode1Amount
    const multiMode2CanalSnapshot = multiMode2Canal
    const multiMode2AmountSnapshot = multiMode2Amount
    const singleMethodSnapshot = singleMethod
    const totalNetTTCSnapshot = totalNetTTC
    const cartFiscalSummarySnapshot = { ...cartFiscalSummary }
    const isDeferredSnapshot = isDeferred
    const activeCaisseSnapshot = activeCaisse ? { ...activeCaisse } : null
    const restaurantTableSnapshot = restaurantTable
    const restaurantCouvertsSnapshot = restaurantCouverts
    let restaurantServeurSnapshot = restaurantServeur || ''
    if (!restaurantServeurSnapshot && restaurantServeursList.length > 0) {
      restaurantServeurSnapshot = restaurantServeursList[0].nom_complet
    }
    if (!restaurantServeurSnapshot) restaurantServeurSnapshot = 'Serveur de Salle'

    let restaurantServeurIdSnapshot = restaurantServeurId || null
    let restaurantSessionIdSnapshot = restaurantSessionId || null
    if (restaurantServeurSnapshot && restaurantServeursList.length > 0) {
      const matched = restaurantServeursList.find(s => 
        (restaurantServeurIdSnapshot && s.id === restaurantServeurIdSnapshot) ||
        (s.nom_complet || '').trim().toLowerCase() === restaurantServeurSnapshot.trim().toLowerCase()
      )
      if (matched) {
        if (!restaurantServeurIdSnapshot) restaurantServeurIdSnapshot = matched.id
        if (!restaurantSessionIdSnapshot && matched.active_session_id) restaurantSessionIdSnapshot = matched.active_session_id
      }
    }
    const loadedPendingBonSnapshot = loadedPendingBon ? { ...loadedPendingBon } : null

    // Génération orderNum avant l'envoi réseau
    const rawSector = (secteurActif?.slug || currentSectorSlug || 'GEN').replace(/^sec-/, '')
    const secteurCode = rawSector.substring(0, 3).toUpperCase()
    let dateStr = ''
    try {
      dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' }).replace(/-/g, '')
    } catch {
      dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    }
    const randStr = Math.random().toString(36).substring(2, 6).toUpperCase()
    const timeStr = Date.now().toString().slice(-4)
    const orderNum = `${secteurCode}-${dateStr}-${timeStr}-${randStr}`
    const displayTable = restaurantTableSnapshot
      ? (restaurantTableSnapshot.toLowerCase().startsWith('table') ? restaurantTableSnapshot : `Table ${restaurantTableSnapshot}`)
      : ''
    const custName = selectedCustomerSnapshot
      ? (displayTable ? `${selectedCustomerSnapshot.name} (${displayTable})` : selectedCustomerSnapshot.name)
      : (isRestaurant && displayTable ? displayTable : 'Client Comptoir')

    // Vente directe POS validée immédiatement (circuits BAR et RESTAURANT)

    // ─── OPTIMISTIC UI : Vider le panier et mettre à jour l'historique instantanément ───
    clearCart()
    setBrasserieRetours({})

    // Préparer la SaleRecord localement pour afficher la facture et la ligne tout de suite
    const paymentsList: PaymentLine[] = isMultiModeSnapshot
      ? [
          ...(multiMode1AmountSnapshot > 0 ? [{ method: multiMode1CanalSnapshot as any, amount: multiMode1AmountSnapshot }] : []),
          ...(multiMode2AmountSnapshot > 0 ? [{ method: multiMode2CanalSnapshot as any, amount: multiMode2AmountSnapshot }] : []),
        ]
      : [{ method: singleMethodSnapshot as any, amount: totalNetTTCSnapshot }]
    const primaryMethod = isMultiModeSnapshot
      ? (paymentsList.find(p => p.amount > 0)?.method || 'especes')
      : singleMethodSnapshot
    const ancienneDetteEstim = Number(selectedCustomerSnapshot?.solde_creance ?? selectedCustomerSnapshot?.current_debt ?? 0)
    const creditActuel = creditAmount
    const montantRestantDuGlobalEstim = ancienneDetteEstim + creditActuel
    const optimisticSale: SaleRecord = {
      id: `optimistic-${orderNum}`,
      order_number: orderNum,
      date: new Date().toISOString(),
      customer_name: custName,
      customer_id: selectedCustomerSnapshot?.id,
      customer_ifu: selectedCustomerSnapshot?.ifu_number,
      total_amount: totalNetTTCSnapshot,
      total_ht: cartFiscalSummarySnapshot.ht,
      total_tva: cartFiscalSummarySnapshot.tva,
      total_aib: cartFiscalSummarySnapshot.aib,
      total_exonere: cartFiscalSummarySnapshot.totalExonere,
      amount_paid: totalNetTTCSnapshot - creditAmount,
      credit_amount: creditAmount,
      ancienne_dette_avant_facture: ancienneDetteEstim,
      montant_credit_actuel: creditActuel,
      montant_restant_du_global: montantRestantDuGlobalEstim,
      payments: paymentsList,
      is_deferred: isDeferredSnapshot,
      status: isDeferredSnapshot ? 'A_LIVRER' : 'COMPLET',
      lines: cartSnapshot,
      table_numero: displayTable || restaurantTableSnapshot || undefined,
      couverts: restaurantCouvertsSnapshot,
      serveur_nom: restaurantServeurSnapshot,
      emballages_consignes: (currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons')
        ? brasserieEmballageRowsSnapshot.map(e => ({ code: e.code, designation: e.designation, precedent: e.precedent, facture: e.facture, sortie: e.facture, rendus: e.rendus, retour: e.rendus, reste: e.reste, net_du: e.reste }))
        : undefined
    }

    // Mise à jour locale immédiate : nouvelle ligne en haut de la liste
    setCurrentSale(optimisticSale)
    setSalesHistory(prev => [optimisticSale, ...prev.filter(s => s.id !== optimisticSale.id)])
    setPrintFormat(isRestaurant ? 'ticket80' : 'factureA4')
    setShowInvoiceModal(true)

    // Déstockage local React immédiat
    setProducts((prev) => prev.map((p) => {
      const totalQtySold = cartSnapshot
        .filter((c) => c.product.id === p.id)
        .reduce((sum, c) => sum + c.qty, 0)
      if (totalQtySold <= 0) return p
      const currentVente = Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0)
      const newVente = Math.max(0, Math.round((currentVente - totalQtySold) * 1000) / 1000)
      return { ...p, stock_vente: newVente, sector_meta: { ...(p.sector_meta || {}), stock_vente: newVente } }
    }))

    // ─── INSERTION DIRECTE VERS SUPABASE & SYNCHRONISATION ──────────────────────
    ;(async () => {
      try {
        // RÈGLE STRICTE GESTIO 229 : Calcul du coût réel des matières (Boissons + Recettes)
        const totalCostHT = cartSnapshot.reduce((sum, item) => {
          const coef = Math.max(1, Number(item.product.coef || item.product.sector_meta?.coef || 1))
          const isTaxed = Boolean(item.product.is_vat_subject ?? item.product.is_taxable ?? (Number(item.product.tva_rate) > 0))
          const vatRate = isTaxed ? Number(item.product.vat_rate ?? item.product.tva_rate ?? 18) : 0
          
          let rawUnitCost = Number(item.product.cost_price || item.product.purchase_price || item.product.sector_meta?.price_achat_ht || 0)
          if (rawUnitCost <= 0 && isRestaurant) {
            const matchedRec = recipeProducts.find(r => r.name.toLowerCase() === item.product.name.toLowerCase())
            if (matchedRec) {
              rawUnitCost = Number(matchedRec.cost_price || (matchedRec as any).cout_revient_portion || (matchedRec as any).cout_matiere || 0)
            }
          }
          const uvCostTTC = rawUnitCost / coef
          const uvCostHT = isTaxed ? (uvCostTTC / (1 + vatRate / 100)) : uvCostTTC
          return sum + (item.qty * uvCostHT)
        }, 0)
        const totalCostHTRounded = Math.round(totalCostHT * 100) / 100
        const grossMarginCalculated = Math.round((cartFiscalSummarySnapshot.ht - totalCostHTRounded) * 100) / 100

        // Résolution ou création automatique de la session active de la serveuse pour garantir la synchronisation
        if (isRestaurant && restaurantServeurSnapshot && restaurantServeurSnapshot !== 'Client Comptoir Direct' && restaurantServeurSnapshot !== 'Serveur de Salle' && !restaurantSessionIdSnapshot) {
          try {
            let qSess = supabase
              .from('restaurant_sessions_serveurs')
              .select('id, serveur_id, serveur_nom')
              .eq('company_id', company?.id ?? companyId ?? '')
              .eq('statut', 'OUVERTE')
            if (restaurantServeurIdSnapshot) {
              qSess = qSess.or(`serveur_id.eq.${restaurantServeurIdSnapshot},serveur_nom.ilike.${restaurantServeurSnapshot.trim()}`)
            } else {
              qSess = qSess.ilike('serveur_nom', restaurantServeurSnapshot.trim())
            }
            const { data: dbSess } = await qSess.order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (dbSess) {
              restaurantSessionIdSnapshot = dbSess.id
              if (!restaurantServeurIdSnapshot && dbSess.serveur_id) {
                restaurantServeurIdSnapshot = dbSess.serveur_id
              }
            } else {
              // Ouverture automatique de la session de service du jour pour cette serveuse
              const todayBenin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo' }).format(new Date())
              const { data: autoSess } = await supabase
                .from('restaurant_sessions_serveurs')
                .insert({
                  company_id: company?.id ?? companyId ?? '',
                  sector_slug: currentSectorSlug || 'bar_restaurant',
                  serveur_id: restaurantServeurIdSnapshot || null,
                  serveur_nom: restaurantServeurSnapshot.trim(),
                  date_session: todayBenin,
                  heure_ouverture: new Date().toISOString(),
                  statut: 'OUVERTE',
                  fonds_initial: 0,
                  total_boissons_confiees_ttc: 0,
                  total_restaurant_ttc: 0,
                  total_ventes_declarees_ttc: 0,
                  total_versements_recus: 0,
                  solde_restant_a_remettre: 0,
                  details_suivi: { bar_items: [], restaurant_items: [], historique_ventes: [] }
                })
                .select('id')
                .single()
              if (autoSess) {
                restaurantSessionIdSnapshot = autoSess.id
              }
            }
          } catch (_) {}
        }

        const todayDate = new Date().toISOString().split('T')[0]
        const encodedMeta = `PAY:${primaryMethod}|CL:${custName.slice(0, 20)}|SEC:${currentSectorSlug}|ST:${isDeferredSnapshot ? 'A_LIVRER' : 'COMPLET'}`.slice(0, 100)
        const notesPayload = {
          sector_slug: currentSectorSlug || 'bar_restaurant', payments: paymentsList, customer_name: custName,
          customer_ifu: selectedCustomerSnapshot?.ifu_number || null, is_deferred: isDeferredSnapshot,
          table_numero: restaurantTableSnapshot || null,
          couverts: restaurantCouvertsSnapshot || 1,
          serveur_nom: restaurantServeurSnapshot || null,
          serveur_id: restaurantServeurIdSnapshot || null,
          session_id: restaurantSessionIdSnapshot || null,
          total_exonere: cartFiscalSummarySnapshot.totalExonere, ancienne_dette_avant_facture: ancienneDetteEstim,
          montant_credit_actuel: creditActuel, montant_restant_du_global: montantRestantDuGlobalEstim,
          lines: cartSnapshot.map(c => ({ product: { id: c.product.id, code: c.product.code, name: c.product.name, unit: c.product.unit || c.product.uv || 'Pièce', cost_price: c.product.cost_price, selling_price: c.product.selling_price, is_vat_subject: c.product.is_vat_subject, vat_rate: c.product.vat_rate, is_aib_subject: c.product.is_aib_subject, aib_rate: c.product.aib_rate, coef: c.product.coef, circuit: resolveProductCircuit(c.product) }, circuit: resolveProductCircuit(c.product), qty: c.qty, unitPrice: c.unitPrice, discount: c.discount })),
          emballages_consignes: (currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') ? brasserieEmballageRowsSnapshot.map(e => ({ code: e.code, designation: e.designation, precedent: e.precedent, facture: e.facture, sortie: e.facture, rendus: e.rendus, retour: e.rendus, reste: e.reste, net_du: e.reste })) : undefined
        }

        // Payload épuré avec seulement les champs nécessaires
        const salePayload = {
          company_id: company?.id ?? companyId ?? '',
          order_number: orderNum,
          order_type: isDeferredSnapshot ? 'pos_deferred' : 'pos_direct',
          order_date: todayDate,
          subtotal_ht: cartFiscalSummarySnapshot.ht,
          tva_amount: cartFiscalSummarySnapshot.tva,
          aib_amount: cartFiscalSummarySnapshot.aib,
          total_amount: totalNetTTCSnapshot,
          total_cost: totalCostHTRounded,
          paid_amount: totalNetTTCSnapshot - creditAmount,
          credit_amount: creditAmount,
          payment_status: creditAmount >= totalNetTTCSnapshot ? 'credit' : primaryMethod,
          payment_method: primaryMethod,
          customer_name: custName,
          status: isDeferredSnapshot ? 'pending_delivery' : 'COMPLET',
          sector_slug: currentSectorSlug || 'bar_restaurant',
          sector_meta: {
            serveur_nom: restaurantServeurSnapshot || null,
            serveur_id: restaurantServeurIdSnapshot || null,
            session_id: restaurantSessionIdSnapshot || null,
            table_numero: restaurantTableSnapshot || null,
            circuit: isBarCircuit ? 'BAR' : 'RESTAURANT'
          },
          e_mecef_uid: encodedMeta,
          created_by: user?.id || null,
          notes: JSON.stringify(notesPayload)
        }

        // 1. INSERTION DIRECTE DANS SUPABASE
        const { data: savedDbSale, error: salesDbError } = await supabase
          .from('sales_orders')
          .insert(salePayload)
          .select('id')
          .single()

        if (salesDbError || !savedDbSale?.id) {
          setPaying(false)
          toast.error('Synchro vente échouée', salesDbError?.message || `Réf ${orderNum} — vérifiez la connexion.`)
          return
        }

        // 2. RETOUR VISUEL IMMÉDIAT DÈS CONFIRMATION DE L'INSERTION (< 2s)
        setPaying(false)
        toast.success('Enregistré', `Vente ${orderNum} validée avec succès.`)
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gestio:transaction_created'))
            window.dispatchEvent(new CustomEvent('gestio:sale_created'))
          }
        } catch (_) {}

        // Mise à jour de l'ID réel dans l'historique local (sans rechargement de page)
        setSalesHistory(prev => prev.map(s => s.id === `optimistic-${orderNum}` ? { ...s, id: savedDbSale.id } : s))

        // 3. ÉCRITURES SECONDAIRES EN PARALLÈLE AVEC PROMISE.ALL
        const lineItems = cartSnapshot.map((line) => {
          const coef = Math.max(1, Number(line.product.coef || line.product.sector_meta?.coef || 1))
          const isTaxed = Boolean(line.product.is_vat_subject ?? line.product.is_taxable ?? (Number(line.product.tva_rate) > 0))
          const itemVatRate = isTaxed ? Number(line.product.vat_rate ?? line.product.tva_rate ?? 18) : 0
          const lineTotal = line.qty * line.unitPrice
          const lineHt = isTaxed ? Math.round((lineTotal / (1 + itemVatRate / 100)) * 100) / 100 : lineTotal
          const uvCostTTC = (Number(line.product.cost_price) || 0) / coef
          const uvCostHT = isTaxed ? Math.round((uvCostTTC / (1 + itemVatRate / 100)) * 100) / 100 : Math.round(uvCostTTC * 100) / 100
          return {
            order_id: savedDbSale.id,
            product_id: line.product.id,
            product_name: line.product.name,
            quantity: line.qty,
            unit_price: line.unitPrice,
            unit_cost: uvCostHT,
            tva_rate: itemVatRate,
            total_ht: lineHt,
            total_ttc: lineTotal,
            company_id: company?.id ?? companyId ?? '',
            sector_slug: currentSectorSlug || 'bar_restaurant',
            sector_meta: { circuit: resolveProductCircuit(line.product) }
          }
        })

        // Mouvements de stock en un seul lot (uniquement pour les articles physiques, pas les fiches recettes déstockées en matières premières)
        const physicalCartItems = cartSnapshot.filter(line => !line.product.is_recipe)
        const stockMovementsPayload = physicalCartItems.map(line => {
          const currentStockVente = Number(line.product.stock_vente ?? line.product.sector_meta?.stock_vente ?? 0)
          const newStockVente = Math.max(0, Math.round((currentStockVente - line.qty) * 1000) / 1000)
          const lineCoef = Math.max(1, Number(line.product.coef || line.product.sector_meta?.coef || 1))
          const lineIsTaxed = Boolean(line.product.is_vat_subject ?? line.product.is_taxable ?? false)
          const lineVatRate = lineIsTaxed ? Number(line.product.vat_rate ?? line.product.tva_rate ?? 18) : 0
          const lineUvCostTTC = (Number(line.product.cost_price) || 0) / lineCoef
          const lineUvCostHT = lineIsTaxed ? Math.round((lineUvCostTTC / (1 + lineVatRate / 100)) * 100) / 100 : Math.round(lineUvCostTTC * 100) / 100
          return {
            company_id: company?.id ?? companyId ?? '',
            sector_slug: currentSectorSlug || 'bar_restaurant',
            product_id: line.product.id,
            movement_type: 'VENTE_POS',
            reference_type: 'sales_order',
            reference_id: savedDbSale.id,
            reference_number: orderNum,
            quantity: -line.qty,
            previous_stock: currentStockVente,
            new_stock: newStockVente,
            unit_cost: lineUvCostHT,
            total_cost: Math.round(line.qty * lineUvCostHT * 100) / 100,
            notes: `Vente POS ${orderNum}`
          }
        })

        // Mises à jour des produits physiques en stock (sector_meta) - groupés par produit pour déduire la quantité totale cumulée sans race condition
        const productTotalsMap = new Map<string, { product: Product; totalQty: number }>()
        for (const line of physicalCartItems) {
          const existing = productTotalsMap.get(line.product.id)
          if (existing) {
            existing.totalQty = Math.round((existing.totalQty + line.qty) * 1000) / 1000
          } else {
            productTotalsMap.set(line.product.id, { product: line.product, totalQty: line.qty })
          }
        }

        const productUpdates = Array.from(productTotalsMap.values()).map(async ({ product, totalQty }) => {
          const currentStockVente = Number(product.stock_vente ?? product.sector_meta?.stock_vente ?? 0)
          const newStockVente = Math.max(0, Math.round((currentStockVente - totalQty) * 1000) / 1000)
          const currentMeta = product.sector_meta || {}
          const updatedMeta = { ...currentMeta, stock_vente: newStockVente }
          const res = await supabase
            .from('products')
            .update({ stock_vente: newStockVente, sector_meta: updatedMeta, updated_at: new Date().toISOString() })
            .eq('id', product.id)
          if (res.error) {
            console.error('[POSPage] Erreur mise à jour stock produit:', product.id, res.error)
          }
          return res
        })

        // Invalidation du cache des produits pour que les pages Stocks et Rapports voient le nouveau stock immédiatement
        invalidateCache(`prods_`)

        // Mouvements de caisse
        const paidCash = isMultiModeSnapshot
          ? ((multiMode1CanalSnapshot === 'especes' ? multiMode1AmountSnapshot : 0) + (multiMode2CanalSnapshot === 'especes' ? multiMode2AmountSnapshot : 0))
          : (singleMethodSnapshot === 'especes' ? totalNetTTCSnapshot : 0)
        const paidMomo = isMultiModeSnapshot
          ? ((['momo_mtn', 'momo_moov'].includes(multiMode1CanalSnapshot) ? multiMode1AmountSnapshot : 0) + (['momo_mtn', 'momo_moov'].includes(multiMode2CanalSnapshot) ? multiMode2AmountSnapshot : 0))
          : (['momo_mtn', 'momo_moov'].includes(singleMethodSnapshot) ? totalNetTTCSnapshot : 0)

        const caisseOps: Promise<any>[] = []
        if (paidCash > 0 || paidMomo > 0) {
          const compId = company?.id ?? companyId ?? ''
          const caisseId = activeCaisseSnapshot?.caisse_id || activeCaisseSnapshot?.id || null
          caisseOps.push(
            enregistrerMouvementCaisse({
              company_id: compId,
              sector_slug: currentSectorSlug || 'bar_restaurant',
              caisse_id: caisseId,
              caisse_session_id: activeCaisseSnapshot?.id,
              type: 'vente',
              sens: 'entree',
              montant_especes: paidCash,
              montant_momo: paidMomo,
              source_module: 'vente_pos',
              source_id: orderNum,
              motif: `Vente POS ${orderNum} (Client: ${custName || 'Comptoir'})`,
              user_name: user?.full_name || 'Caissier',
              user_id: user?.id
            }),
            paidCash > 0 ? enregistrerEntreeCaisse({ company_id: compId, secteur_id: currentSectorSlug, caisse_id: caisseId, montant: paidCash, mode_paiement: 'espece', source: 'VENTE', reference_id: savedDbSale?.id || null }) : Promise.resolve(),
            paidMomo > 0 ? enregistrerEntreeCaisse({ company_id: compId, secteur_id: currentSectorSlug, caisse_id: caisseId, montant: paidMomo, mode_paiement: 'mtn_momo', source: 'VENTE', reference_id: savedDbSale?.id || null }) : Promise.resolve()
          )
        }

        // Crédit client si applicable
        const creditOps: Promise<any>[] = []
        if (selectedCustomerSnapshot && creditAmount > 0) {
          const compId = company?.id ?? companyId ?? ''
          creditOps.push(
            supabaseTenant('customers').update({ current_debt: montantRestantDuGlobalEstim }).eq('id', selectedCustomerSnapshot.id),
            supabase.from('creances_clients').insert({
              company_id: compId,
              client_id: selectedCustomerSnapshot.id,
              facture_id: savedDbSale.id,
              montant_initial_ttc: creditAmount,
              montant_restant_ttc: creditAmount,
              statut: 'impayé',
              created_at: new Date().toISOString()
            }),
            (async () => {
              try {
                const { data: existingDebts } = await supabase.from('client_debts').select('id, total_dette, total_rembourse').eq('company_id', compId).eq('client_id', selectedCustomerSnapshot.id).eq('status', 'en_cours').order('created_at', { ascending: false }).limit(1)
                if (existingDebts && existingDebts.length > 0) {
                  const d = existingDebts[0]
                  const newTotal = (Number(d.total_dette) || 0) + creditAmount
                  await supabase.from('client_debts').update({ total_dette: newTotal, solde_du: newTotal - (Number(d.total_rembourse) || 0), updated_at: new Date().toISOString() }).eq('id', d.id)
                } else {
                  await supabase.from('client_debts').insert({ company_id: compId, sector_code: currentSectorSlug || 'boutique', client_id: selectedCustomerSnapshot.id, total_dette: creditAmount, total_rembourse: 0, solde_du: creditAmount, status: 'en_cours', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                }
              } catch (_) {}
            })()
          )
          setCustomers((prev) => prev.map((c) => c.id === selectedCustomerSnapshot.id ? { ...c, current_debt: montantRestantDuGlobalEstim, solde_creance: montantRestantDuGlobalEstim } : c))
        }

        // Emballages Brasserie (si applicable)
        const emballageOps: Promise<any>[] = []
        if ((currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && brasserieEmballageRowsSnapshot.length > 0) {
          emballageOps.push((async () => {
            const compId = company?.id ?? companyId ?? ''
            const isComptoir = !selectedCustomerSnapshot || selectedCustomerSnapshot.code === 'COMPTOIR' || (selectedCustomerSnapshot.name || '').toLowerCase().includes('comptoir')
            const clientNom = selectedCustomerSnapshot?.name || (isComptoir ? 'Client Comptoir' : 'Client')
            const clientId = selectedCustomerSnapshot?.id || null
            const isValidUUID = (u?: string | null) => !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)
            const safeSecteurId = isValidUUID(company?.sector_id) ? company?.sector_id : null
            for (const emb of brasserieEmballageRowsSnapshot) {
              const codeEmb = (emb.code || '').trim().toUpperCase()
              if (!isVraiCodeEmballage(codeEmb)) continue
              const designationEmb = emb.designation || `Casier ${codeEmb}`
              const retour = Number(emb.rendus) || 0
              const sortie = Number(emb.facture) || 0
              const prec = Number(emb.precedent) || 0
              const duFinal = Number(emb.reste) || 0
              const soldeApresSortie = prec + sortie
              if (sortie === 0 && retour === 0) continue
              let realEmbId = emb.id
              if (!realEmbId) {
                const matched = brasserieEmballagesList.find(e => e.code === codeEmb)
                realEmbId = matched?.id
              }
              if (!realEmbId) {
                const { data: dbEmb } = await supabase.from('brasserie_emballages').select('id').eq('company_id', compId).eq('code', codeEmb).maybeSingle()
                if (dbEmb?.id) { realEmbId = dbEmb.id } else {
                  const { data: createdEmb } = await supabase.from('brasserie_emballages').insert({ company_id: compId, sector_slug: 'brasserie', code: codeEmb, designation: designationEmb, type: 'casier', unite: 'unité', valeur_consignation: 0, stock_depot: 0, is_active: true }).select('id').single()
                  if (createdEmb?.id) realEmbId = createdEmb.id
                }
              }
              let embTypeId: string | null = null
              const { data: dbType } = await supabase.from('brasserie_emballages_types').select('id').eq('company_id', compId).eq('code', codeEmb).maybeSingle()
              if (dbType?.id) { embTypeId = dbType.id } else if (isVraiCodeEmballage(codeEmb)) {
                const { data: createdType } = await supabase.from('brasserie_emballages_types').insert({ company_id: compId, secteur_id: safeSecteurId, code: codeEmb, nom: designationEmb, stock_depot: 0 }).select('id').maybeSingle()
                if (createdType?.id) embTypeId = createdType.id
              }
              const mouvPs: Promise<any>[] = []
              if (sortie > 0 && !isComptoir) mouvPs.push(supabase.from('brasserie_emballages_mouvements').insert({ company_id: compId, secteur_id: safeSecteurId, client_id: isValidUUID(clientId) ? clientId : null, client_nom: clientNom, emballage_type_id: isValidUUID(embTypeId) ? embTypeId : (isValidUUID(realEmbId) ? realEmbId : null), code: codeEmb, emballage_code: codeEmb, type_mouvement: 'SORTIE', quantite: sortie, vente_id: savedDbSale.id, vente_numero: orderNum, date: new Date().toISOString(), solde_avant: prec, solde_apres: soldeApresSortie, observation: `Vente N° ${orderNum}` }))
              if (retour > 0 && !isComptoir) mouvPs.push(supabase.from('brasserie_emballages_mouvements').insert({ company_id: compId, secteur_id: safeSecteurId, client_id: isValidUUID(clientId) ? clientId : null, client_nom: clientNom, emballage_type_id: isValidUUID(embTypeId) ? embTypeId : (isValidUUID(realEmbId) ? realEmbId : null), code: codeEmb, emballage_code: codeEmb, type_mouvement: 'RETOUR', quantite: retour, vente_id: savedDbSale.id, vente_numero: orderNum, date: new Date().toISOString(), solde_avant: soldeApresSortie, solde_apres: duFinal, observation: `Retour vente N° ${orderNum}` }))
              mouvPs.push(supabase.from('mouvements_emballages').insert({ company_id: compId, secteur_id: company?.sector_id || compId, client_id: isComptoir ? null : clientId, vente_id: savedDbSale.id, facture_id: savedDbSale.id, emballage_id: realEmbId, precedent: prec, facture_qte: sortie, retour_qte: retour, du_final: duFinal, date_mouvement: todayDate }))
              if (!isComptoir && clientId && realEmbId) mouvPs.push(supabase.from('clients_emballages_soldes').upsert({ company_id: compId, secteur_id: company?.sector_id || compId, client_id: clientId, emballage_id: realEmbId, du_actuel: duFinal, updated_at: new Date().toISOString() }))
              if (realEmbId) {
                if (sortie > 0) mouvPs.push(supabase.from('brasserie_mouvements_emballages').insert({ company_id: compId, sector_slug: 'brasserie', emballage_id: realEmbId, client_id: clientId, type_mouvement: 'SORTIE_VENTE', quantite: sortie, reference: orderNum, vente_id: savedDbSale.id, created_by_name: user?.full_name || 'Vendeur' }))
                if (retour > 0) mouvPs.push(supabase.from('brasserie_mouvements_emballages').insert({ company_id: compId, sector_slug: 'brasserie', emballage_id: realEmbId, client_id: clientId, type_mouvement: 'RETOUR_IMMEDIAT', quantite: retour, reference: orderNum, vente_id: savedDbSale.id, created_by_name: user?.full_name || 'Vendeur' }))
                mouvPs.push((async () => { const { data: embRow } = await supabase.from('brasserie_emballages').select('stock_depot').eq('id', realEmbId).maybeSingle(); if (embRow) { await supabase.from('brasserie_emballages').update({ stock_depot: Math.max(0, (Number(embRow.stock_depot) || 0) - sortie + retour), updated_at: new Date().toISOString() }).eq('id', realEmbId) } })())
                if (!isComptoir && clientId) mouvPs.push((async () => { const { data: exCons } = await supabase.from('brasserie_consignations').select('id, total_sorti, total_retourne, dernier_retour').eq('company_id', compId).eq('sector_slug', 'brasserie').eq('client_id', clientId).eq('emballage_id', realEmbId).maybeSingle(); if (exCons) { const ns = (Number(exCons.total_sorti) || 0) + sortie; const nr = (Number(exCons.total_retourne) || 0) + retour; await supabase.from('brasserie_consignations').update({ total_sorti: ns, total_retourne: nr, solde_du: Math.max(0, ns - nr), derniere_sortie: new Date().toISOString(), dernier_retour: retour > 0 ? new Date().toISOString() : exCons.dernier_retour, updated_at: new Date().toISOString() }).eq('id', exCons.id) } else { await supabase.from('brasserie_consignations').insert({ company_id: compId, sector_slug: 'brasserie', client_id: clientId, emballage_id: realEmbId, total_sorti: sortie, total_retourne: retour, solde_du: Math.max(0, sortie - retour), derniere_sortie: new Date().toISOString(), dernier_retour: retour > 0 ? new Date().toISOString() : null }) } })())
              }
              await Promise.allSettled(mouvPs)
            }
          })())
        }

        // Opérations Restaurant (KDS, Déstockage Fiches Techniques, Affectation Table, Session Serveuse)
        const restaurantOps: Promise<any>[] = []
        if (isRestaurant) {
          restaurantOps.push((async () => {
            const compId = company?.id ?? companyId ?? ''
            const numTable = restaurantTableSnapshot || 'COMPTOIR'
            const srvNom = restaurantServeurSnapshot || 'Serveur'
            const isBarCircuit = restaurantCircuit === 'BAR'

            // Enregistrer TOUTES les commandes Restaurant/Bar dans restaurant_commandes (Traçabilité intégrale)
            const { data: restCmd } = await supabase.from('restaurant_commandes').insert({
              company_id: compId,
              sector_slug: currentSectorSlug || 'bar_restaurant',
              numero_commande: orderNum,
              table_id: restaurantTableId || null,
              table_numero: displayTable || numTable,
              type_commande: numTable === 'COMPTOIR' ? 'A_EMPORTER' : 'SUR_PLACE',
              serveur_nom: srvNom,
              serveur_id: restaurantServeurIdSnapshot,
              client_nom: custName,
              statut: 'EN_PREPARATION',
              statut_paiement: creditAmount >= totalNetTTCSnapshot ? 'EN_ATTENTE' : 'SOLDE',
              total_ht: cartFiscalSummarySnapshot.ht,
              total_tva: cartFiscalSummarySnapshot.tva,
              total_aib: cartFiscalSummarySnapshot.aib,
              total_ttc: totalNetTTCSnapshot,
              total_paye: totalNetTTCSnapshot - creditAmount,
              reste_a_payer: creditAmount,
              mode_reglement: primaryMethod,
              couverts: restaurantCouvertsSnapshot || 1,
              heure_ouverture: new Date().toISOString()
            }).select('id').maybeSingle()

            const restCmdId = restCmd?.id || null

            // 2. Insérer les lignes dans restaurant_commande_lignes pour affichage KDS Bar et Cuisine
            const kdsLignes = cartSnapshot.map(line => {
              const itemCircuit = resolveProductCircuit(line.product)
              return {
                company_id: compId,
                sector_slug: currentSectorSlug || 'bar_restaurant',
                commande_id: restCmdId,
                commande_numero: orderNum,
                table_numero: displayTable || numTable,
                serveur_nom: srvNom,
                produit_id: line.product.id,
                designation: line.product.name,
                destination: itemCircuit === 'BAR' ? 'BAR' : 'CUISINE',
                quantite: line.qty,
                prix_unitaire: line.unitPrice,
                total_ligne: line.qty * line.unitPrice,
                statut_preparation: 'NOUVEAU',
                heure_commande: new Date().toISOString()
              }
            })

            if (kdsLignes.length > 0) {
              await supabase.from('restaurant_commande_lignes').insert(kdsLignes)
            }

            // 3. Déstockage automatique des matières premières de cuisine selon fiches techniques pour les plats
            for (const line of cartSnapshot) {
              if (resolveProductCircuit(line.product) === 'RESTAURANT' || line.product.is_recipe) {
                await destockerMatieresPlat({
                  company_id: compId,
                  order_id: savedDbSale.id,
                  order_number: orderNum,
                  plat_nom: line.product.name,
                  portion_qty: line.qty,
                  sector_slug: currentSectorSlug || 'bar_restaurant'
                })
              }
            }

            // 4. Suivre les contenants consignés et créances serveuses
            const nbConsignes = cartSnapshot.reduce((acc, it) => {
              const nom = (it.product.name || '').toLowerCase()
              const isBouteilleConsignee = nom.includes('castel') || nom.includes('beaufort') || nom.includes('guinness') || nom.includes('youki') || nom.includes('biere')
              return acc + (isBouteilleConsignee ? it.qty : 0)
            }, 0)

            await supabase.from('restaurant_creances_serveuses').insert({
              company_id: compId,
              sector_slug: currentSectorSlug || 'bar_restaurant',
              order_id: savedDbSale.id,
              order_number: orderNum,
              serveur_nom: srvNom,
              serveur_id: restaurantServeurIdSnapshot,
              circuit: restaurantCircuit,
              montant_initial: totalNetTTCSnapshot,
              montant_paye: totalNetTTCSnapshot - creditAmount,
              solde_restant: creditAmount,
              statut: creditAmount > 0 ? 'PARTIEL' : 'PAYE',
              consignes_bouteilles_dues: nbConsignes,
              consignes_bouteilles_rendues: 0,
              details: cartSnapshot.map(c => ({ name: c.product.name, qty: c.qty, price: c.unitPrice })),
              date_creation: new Date().toISOString()
            })

            // 5. Mettre à jour le statut de la table en 'OCCUPEE' si table sélectionnée
            if (numTable && numTable !== 'COMPTOIR') {
              await supabase.from('restaurant_tables')
                .update({ statut: 'OCCUPEE', updated_at: new Date().toISOString() })
                .eq('company_id', compId)
                .eq('numero_table', numTable)
            }

            // 6. Accumulation automatique des produits dans la session active de la serveuse
            if (srvNom && srvNom !== 'Client Comptoir Direct' && srvNom !== 'Serveur de Salle') {
              try {
                let targetSessionId = restaurantSessionIdSnapshot
                // Si la session n'est pas résolue dans le state local, vérifier directement dans la base de données
                if (!targetSessionId) {
                  let q = supabase
                    .from('restaurant_sessions_serveurs')
                    .select('id')
                    .eq('company_id', compId)
                    .eq('statut', 'OUVERTE')
                  if (restaurantServeurIdSnapshot) {
                    q = q.or(`serveur_id.eq.${restaurantServeurIdSnapshot},serveur_nom.ilike.${srvNom}`)
                  } else {
                    q = q.ilike('serveur_nom', srvNom)
                  }
                  const { data: dbSess } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
                  if (dbSess) targetSessionId = dbSess.id
                }

                if (targetSessionId) {
                  const { accumulerVenteDansSessionServeuse } = await import('../../../services/restaurantService')
                  await accumulerVenteDansSessionServeuse({
                    session_id: targetSessionId,
                    order_number: orderNum,
                    circuit: isBarCircuit ? 'BAR' : 'RESTAURANT',
                    table_numero: numTable,
                    items: cartSnapshot.map(c => {
                      const itemCircuit = resolveProductCircuit(c.product)
                      return {
                        produit_id: c.product.id,
                        nom: c.product.name,
                        quantite: c.qty,
                        prix_unitaire: c.unitPrice,
                        total: c.qty * c.unitPrice,
                        circuit: itemCircuit
                      }
                    }),
                    total_vente: totalNetTTCSnapshot
                  })

                  // Consolider total_ventes_declarees_ttc sur la session active de la serveuse
                  const { data: curSess } = await supabase
                    .from('restaurant_sessions_serveurs')
                    .select('total_ventes_declarees_ttc')
                    .eq('id', targetSessionId)
                    .maybeSingle()
                  const newTotal = Number(curSess?.total_ventes_declarees_ttc) || 0
                  await supabase
                    .from('restaurant_sessions_serveurs')
                    .update({
                      total_ventes_declarees_ttc: newTotal,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', targetSessionId)

                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('gestio:restaurant-sale-completed', {
                      detail: { order_number: orderNum, session_id: targetSessionId, serveur_nom: srvNom }
                    }))
                    try {
                      localStorage.setItem('gestio_last_restaurant_sale', JSON.stringify({
                        order_number: orderNum, session_id: targetSessionId, timestamp: Date.now()
                      }))
                    } catch (_) {}
                  }
                }
              } catch (sessUpErr) {
                console.warn('[POSPage] Erreur mise à jour session serveuse:', sessUpErr)
              }
            }
          })())
        }

        // Audit
        const auditOp = import('../../../services/auditService').then(({ logAuditEvent }) => logAuditEvent({
          companyId: company?.id ?? companyId ?? '',
          userId: user?.id,
          userName: user?.full_name || user?.username,
          userRole: user?.role,
          module: 'Vente-POS',
          action: 'VENTE',
          description: `Vente N° ${orderNum} — ${fmt(totalNetTTCSnapshot)} — Client: ${custName}`,
          entityName: 'sales_orders',
          entityId: savedDbSale.id
        }).catch(() => {})).catch(() => {})

        // Clôture du bon de commande vendeur lié si cette vente provient d'un bon en attente
        const bonCloseOp = (async () => {
          if (!loadedPendingBonSnapshot) return
          try {
            await supabase
              .from('sales_orders')
              .update({
                status: 'COMPLET',
                paid_amount: loadedPendingBonSnapshot.total_amount,
                payment_status: creditAmount >= totalNetTTCSnapshot ? 'credit' : 'paye',
                payment_method: primaryMethod,
                cash_session_id: (await resolveValidCashSession(company?.id ?? companyId ?? '', currentSectorSlug, activeCaisseSnapshot?.id || null, activeCaisseSnapshot?.caisse_id || null, user?.id || null)).cashSessionId,
                notes: JSON.stringify({
                  ...(typeof loadedPendingBonSnapshot === 'object' ? loadedPendingBonSnapshot : {}),
                  status_commercial: 'ENCAISSE',
                  encaisse_par: user?.full_name || 'Caissière',
                  encaisse_par_id: user?.id,
                  date_encaissement: new Date().toISOString(),
                  vente_pos_id: savedDbSale.id,
                  vente_pos_ref: orderNum,
                  stock_already_deducted: true
                })
              })
              .eq('id', loadedPendingBonSnapshot.id)
          } catch (errBon) {
            console.error('[POS] Erreur clôture bon lié:', errBon)
          }
        })()

        // Exécution en parallèle de toutes les opérations secondaires avec Promise.all
        await Promise.allSettled([
          supabase.from('sales_order_items').insert(lineItems),
          supabase.from('stock_movements').insert(stockMovementsPayload),
          ...productUpdates,
          ...caisseOps,
          ...creditOps,
          ...emballageOps,
          ...restaurantOps,
          auditOp,
          bonCloseOp,
          comptabiliserVenteAuto({
            companyId: company?.id ?? companyId ?? '',
            sectorSlug: currentSectorSlug,
            saleId: savedDbSale.id,
            orderNumber: orderNum,
            orderDate: todayDate,
            totalTtc: totalNetTTCSnapshot,
            tvaAmount: cartFiscalSummarySnapshot.tva,
            aibAmount: cartFiscalSummarySnapshot.aib,
            customerName: custName,
            customerId: selectedCustomerSnapshot?.id || null,
            paymentMethod: primaryMethod,
            paymentStatus: creditAmount >= totalNetTTCSnapshot ? 'credit' : primaryMethod,
            paidAmount: totalNetTTCSnapshot - creditAmount,
            creditAmount: creditAmount,
            createdById: user?.id || null,
            isMultiPayment: isMultiModeSnapshot,
            payments: paymentsList
          })
        ])
      } catch (bgErr: any) {
        console.error('[POSPage] Erreur synchronisation vente:', bgErr)
      } finally {
        setPaying(false)
      }
    })()
  }


  // ─── Facture d'Avoir Réelle avec Supabase ──────────────────────────────────

  const handleOpenAvoirModal = (sale?: SaleRecord) => {
    if (sale && sale.status === "AVOIR") {
      toast.error("Opération impossible", "Cette facture a déjà été annulée par un avoir.")
      return
    }
    setSelectedAvoirForConsult(null)
    setSelectedSaleForAvoir(sale || null)
    setShowAvoirModal(true)
  }

  const handleConsultAvoir = async (sale: SaleRecord) => {
    try {
      const { getAvoirsByFacture } = await import('../../../services/factureAvoirService')
      const compId = company?.id ?? companyId ?? ''
      const list = await getAvoirsByFacture(compId, sale.id)
      if (list && list.length > 0) {
        setSelectedAvoirForConsult(list[0])
      } else {
        setSelectedAvoirForConsult({
          id: sale.annulation_avoir?.avoir_id || sale.id,
          numero: sale.annulation_avoir?.avoir_numero || `AV-${sale.order_number}`,
          company_id: compId,
          sector_slug: currentSectorSlug,
          facture_initiale_id: sale.id,
          facture_initiale_numero: sale.order_number,
          client_nom: sale.customer_name,
          client_ifu: sale.customer_ifu,
          date_avoir: sale.annulation_avoir?.date_annulation || sale.date,
          motif: sale.annulation_avoir?.motif || 'Annulation intégrale de facture par avoir',
          montant_ht: sale.total_ht,
          montant_tva: sale.total_tva,
          montant_total_avoir: sale.total_amount,
          mode_remboursement: 'credit_client',
          remboursement_effectue: false,
          statut: 'valide',
          created_by_nom: sale.annulation_avoir?.annule_par || 'Utilisateur',
          created_at: sale.annulation_avoir?.date_annulation || sale.date,
          lignes: (sale.lines || []).map((l, idx) => ({
            id: `line-${idx}`,
            avoir_id: sale.id,
            article_id: l.product.id,
            article_nom: l.product.name,
            qte_retournee: l.qty,
            prix_unitaire: l.unitPrice,
            prix_achat: Number(l.product.cost_price || 0),
            total_ligne: l.qty * l.unitPrice,
            etat_article: 'bon'
          }))
        })
      }
      setSelectedSaleForAvoir(null)
      setShowAvoirModal(true)
    } catch (_) {
      toast.error('Erreur', 'Impossible de charger le document d’avoir associé.')
    }
  }

  const handleCreateAvoir = (sale: SaleRecord) => {
    handleOpenAvoirModal(sale)
  }

  const handleDownloadPDF = (sale: SaleRecord) => {
    try {
      const docTitle = getDocumentTitle(company, sale.status)
      const docFooter = getDocumentFooterMessage(company, sale.status)

      const docData: FacturationDocumentData = {
        company: {
          id: company?.id,
          name: company?.name || 'GESTIO 229 ERP',
          ifu_number: company?.ifu_number,
          rccm_number: company?.rccm_number,
          address: company?.address,
          city: company?.city,
          phone: company?.phone,
          email: company?.email,
          logo_url: company?.logo_url,
          e_mecef_active: isCompanyEmecefActive(company),
        },
        sale: {
          id: sale.id,
          order_number: sale.order_number,
          date: sale.date,
          status: sale.status,
          caisseNom: 'Caisse Principale POS',
          table_numero: sale.table_numero,
          serveur_nom: sale.serveur_nom,
          couverts: sale.couverts,
          is_deferred: sale.is_deferred,
        },
        customer: {
          name: sale.customer_name || 'Client Comptoir',
          ifu: sale.customer_ifu,
        },
        payments: sale.payments || [],
        summary: computeFacturationFiscalSummary(
          sale.lines,
          sale.payments,
          {
            ancienne_dette_avant_facture: sale.ancienne_dette_avant_facture,
            credit_amount: sale.credit_amount,
            montant_credit_actuel: sale.montant_credit_actuel,
            montant_restant_du_global: sale.montant_restant_du_global,
            amount_paid: sale.amount_paid,
            total_amount: sale.total_amount,
          }
        ),
        documentTitle: docTitle,
        footerMessage: docFooter,
        emballages_consignes: sale.emballages_consignes,
      }

      const formatToUse = printFormat === 'ticket80' ? 'ticket80' : 'a4'
      downloadFacturePdf(docData, formatToUse)
      toast.success(
        `${docTitle} PDF téléchargé`,
        `${docTitle} N° ${sale.order_number} généré avec succès.`
      )
    } catch (e: any) {
      console.error('Erreur génération PDF:', e)
      toast.error('Erreur génération PDF', e.message)
    }
  }

  // Filtrages : Mode BAR (stock réel) et Mode RESTAURANT (fiches recettes actives)
  const filteredProducts = useMemo(() => {
    if (!isRestaurant) {
      return products.filter((p) => {
        // En secteur station-service, AUCUN carburant (Essence Super, Gasoil, Pétrole) ne doit apparaître dans la Vente en Panier
        if (isStation && isFuelProduct(p)) {
          return false
        }
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) {
          return false
        }
        return true
      })
    }

    // Mode RESTAURANT / MAQUIS : Afficher strictement les plats, repas et recettes
    if (restaurantCircuit === 'CUISINE') {
      const activeRecipes = recipeProducts.filter(p => Number(p.selling_price) > 0)
      const standardKitchenProducts = products.filter(p => {
        const isMatiere = Boolean(p.sector_meta?.is_matiere_premiere || (p as any).is_matiere_premiere)
        if (isMatiere) return false
        return resolveProductCircuit(p) === 'RESTAURANT'
      })
      const recipeIds = new Set(activeRecipes.map(r => r.id))
      const combined = [...activeRecipes, ...standardKitchenProducts.filter(p => !recipeIds.has(p.id))]
      return combined.filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) {
          return false
        }
        return true
      })
    }

    // Mode BAR : Afficher strictement les boissons et produits du Bar (jamais de plats ni recettes)
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      const isMatiere = Boolean(p.sector_meta?.is_matiere_premiere || (p as any).is_matiere_premiere)
      if (isMatiere) return false
      return resolveProductCircuit(p) === 'BAR'
    })
  }, [products, recipeProducts, search, isRestaurant, restaurantCircuit])

  const filteredHistory = salesHistory.filter(
    (s) =>
      !historySearch ||
      s.order_number.toLowerCase().includes(historySearch.toLowerCase()) ||
      s.customer_name.toLowerCase().includes(historySearch.toLowerCase())
  )

  const modalDocTitle = useMemo(() => {
    return getDocumentTitle(company, currentSale?.status)
  }, [company, currentSale?.status])

  const modalFooterMessage = useMemo(() => {
    return getDocumentFooterMessage(company, currentSale?.status)
  }, [company, currentSale?.status])

  const currentSaleFiscalSummary = useMemo(() => {
    if (!currentSale) return null
    return computeFacturationFiscalSummary(
      currentSale.lines,
      currentSale.payments,
      {
        ancienne_dette_avant_facture: currentSale.ancienne_dette_avant_facture,
        credit_amount: currentSale.credit_amount,
        montant_credit_actuel: currentSale.montant_credit_actuel,
        montant_restant_du_global: currentSale.montant_restant_du_global,
        amount_paid: currentSale.amount_paid,
        total_amount: currentSale.total_amount,
      }
    )
  }, [currentSale])

  return (
    <div className="space-y-4">
      {/* ── En-tête & Onglets ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              Vente & POS
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Secteur actif : {secteurActif?.nom || currentSectorSlug} ({products.length} produit{products.length > 1 ? 's' : ''})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Saisie TTC, Décomposition fiscale automatique HT & TVA, Multi-règlements et Facturation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'pos'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <ShoppingCart className="w-4 h-4" /> Point de Vente
          </button>
          <button
            onClick={() => setActiveTab('historique')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5',
              activeTab === 'historique'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <Clock className="w-4 h-4" /> Historique ({salesHistory.length})
          </button>
          {isCircuitSeparated && (
            <button
              onClick={async () => {
                setMesBonsModal(true)
                setLoadingMesBons(true)
                try {
                  const list = await fetchPendingBons(company?.id ?? companyId ?? '', currentSectorSlug)
                  setMesBonsList(list)
                } finally {
                  setLoadingMesBons(false)
                }
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
            >
              <ArrowRightLeft className="w-4 h-4 text-amber-600" />
              <span>Bons en attente</span>
              {mesBonsList.length > 0 && (
                <span className="px-1.5 py-0.5 bg-amber-600 text-white rounded-full text-[10px] font-black leading-none shadow-sm">
                  {mesBonsList.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>


      {/* ── Bannière statut caisse ──────────────────────────────────────── */}
      {checkingCaisse ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-500 flex items-center gap-2 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" /> Vérification de la caisse en cours…
        </div>
      ) : activeCaisse && activeCaisse.is_previous_day ? (
        /* ── ALERTE ORANGE : SESSION ANTÉRIEURE TOUJOURS OUVERTE ── */
        <div className="bg-amber-50 border-2 border-amber-300 text-amber-900 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <p className="font-black text-sm text-amber-900">Session de caisse antérieure toujours OUVERTE</p>
              <p className="text-amber-800 text-xs mt-0.5">
                La caisse est restée ouverte depuis le {new Date(activeCaisse.date_ouverture).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} par <strong>{activeCaisse.ouvert_par}</strong>. Conformément à la règle de gestion, elle n'a pas été fermée automatiquement. Vous devez clôturer cette session avant d'en ouvrir une nouvelle pour la journée en cours.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to={`/app/${currentSectorSlug}/caisse`}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition text-center text-xs whitespace-nowrap shadow-sm flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" /> Clôturer la caisse d'hier
            </Link>
          </div>
        </div>
      ) : activeCaisse ? (
        /* ── Caisse OUVERTE DU JOUR : BANNER VERT ── */
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-bold text-emerald-900 text-sm">Caisse Ouverte</p>
              <p className="text-emerald-700">
                N° {activeCaisse.session_number} &bull; Ouverte à {activeCaisse.heure_ouverture} par <strong>{activeCaisse.ouvert_par}</strong> &bull; Depuis ID {activeCaisse.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-emerald-600 font-mono font-bold">{fmt(activeCaisse.fond_ouverture_especes)} Espèces</p>
              {activeCaisse.fond_ouverture_momo > 0 && (
                <p className="text-emerald-600 font-mono">{fmt(activeCaisse.fond_ouverture_momo)} MoMo</p>
              )}
            </div>
            <button
              onClick={loadData}
              title="Actualiser le statut caisse"
              className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* ── Caisse FERMÉE : alerte avec bouton d'action ── */
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-sm">Caisse non ouverte — secteur : {currentSectorSlug}</p>
              <p className="text-amber-700 text-xs">Veuillez ouvrir la caisse avant de valider une vente.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              title="Vérifier à nouveau"
              className="p-2 rounded-xl border border-amber-300 hover:bg-amber-100 text-amber-700 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              to={`/app/${currentSectorSlug}/caisse`}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition text-center text-xs whitespace-nowrap shadow-sm"
            >
              Ouvrir la Caisse →
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'pos' ? (
        <div className="space-y-4">
          {loadError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 flex-shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Réessayer
              </button>
            </div>
          )}

          {isStation && (
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-4 mb-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-white">Vente en Panier</span>
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                      Module 2 : Lubrifiants & Boutique
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Huiles moteur, graisses, liquides, filtres & accessoires • Les carburants sont vendus exclusivement via le distributeur.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/app/${currentSectorSlug}/vente-distributeur`)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition shadow-md shadow-amber-500/20"
                >
                  <Fuel className="w-4 h-4" />
                  <span>Basculer vers Vente Distributeur (Carburants)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {isRestaurant && (
            <RestaurantOrderWidget
              selectedTable={restaurantTable}
              setSelectedTable={setRestaurantTable}
              couverts={restaurantCouverts}
              setCouverts={setRestaurantCouverts}
              serveur={restaurantServeur}
              setServeur={setRestaurantServeur}
              circuit={restaurantCircuit}
              setCircuit={setRestaurantCircuit}
              serveursListProp={restaurantServeursList}
              onServeurChange={(matched) => {
                setRestaurantServeur(matched.nom_complet)
                setRestaurantServeurId(matched.id)
                setRestaurantSessionId(matched.active_session_id || '')
              }}
            />
          )}

          {/* Bannière Commande en attente (4 min) active */}
          {pendingRestoOrder && !showPendingRestoModal && (
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2.5 rounded-2xl shadow-md flex items-center justify-between mb-3 border border-amber-400/40 animate-pulse">
              <div className="flex items-center gap-2.5 text-xs font-bold">
                <Clock className="w-4 h-4 text-amber-100" />
                <span>Commande en attente : <strong className="font-mono">{pendingRestoOrder.orderNumber}</strong> ({pendingRestoOrder.circuit} • {pendingRestoOrder.serveurNom})</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full font-mono text-[11px] font-black">
                  ⏱️ {Math.floor(pendingCountdownSeconds / 60)}:{(pendingCountdownSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPendingRestoModal(true)}
                  className="bg-white text-amber-800 hover:bg-amber-50 px-3 py-1 rounded-xl text-xs font-black transition shadow-sm"
                >
                  Gérer / Finaliser / Annuler
                </button>
              </div>
            </div>
          )}

          {/* ── VUE 1 : POINT DE VENTE (CATALOGUE & PANIER INTÉGRÉ GLISSANT À DROITE) ── */}
          <div className="flex flex-col lg:flex-row gap-4 items-start relative">
          {/* CATALOGUE GAUCHE */}
          <div className="flex-1 w-full min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden h-[calc(100vh-13rem)] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Rechercher produit par désignation ou code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={loadData}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                title="Actualiser les produits"
              >
                <RefreshCw className={clsx('w-4 h-4 text-slate-500', loading && 'animate-spin')} />
              </button>

              {/* Sélecteur de mode de vente BAR / RESTAURANT */}
              {isRestaurant && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setRestaurantCircuit('BAR')}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5',
                      restaurantCircuit === 'BAR'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    )}
                    title="Vente de boissons et produits en stock direct"
                  >
                    <span>🍾</span>
                    <span>BAR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestaurantCircuit('CUISINE')}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5',
                      restaurantCircuit === 'CUISINE'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    )}
                    title="Vente de plats et boissons enregistrés dans Fiche et Recette"
                  >
                    <span>🍽️</span>
                    <span>RESTAURANT / MAQUIS</span>
                    {recipeProducts.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white/20">
                        {recipeProducts.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Bouton bascule Panier (Permet d'agrandir le catalogue à 100% ou de rouvrir le panier) */}
              <button
                type="button"
                onClick={() => setIsCartVisible(!isCartVisible)}
                className={clsx(
                  'px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm',
                  isCartVisible
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                )}
                title={isCartVisible ? 'Masquer le panneau panier' : 'Afficher le panneau panier'}
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isCartVisible ? 'Masquer Panier' : `Panier (${cart.length})`}
                </span>
                {cart.length > 0 && !isCartVisible && (
                  <span className="bg-white text-emerald-700 text-[10px] font-black rounded-full px-1.5 py-0.5 ml-1">
                    {fmt(totalNetTTC)}
                  </span>
                )}
              </button>
            </div>

            {/* Grille des articles sous forme de cartes professionnelles (100% largeur fluide) */}
            <div className={clsx(
              'flex-1 overflow-y-auto grid gap-3 pr-1 pb-4 w-full max-w-none',
              isCartVisible
                ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6'
            )}>
              {filteredProducts.length === 0 ? (
                <div className="col-span-full p-8 text-center text-slate-400 text-xs">
                  {loading ? 'Chargement des articles...' : 'Aucun produit actif disponible.'}
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const stockVente = Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0)
                  const stockMagasin = Number(p.stock_magasin ?? p.sector_meta?.stock_magasin ?? 0)
                  const wholesalePrice = Number(p.wholesale_price || p.sector_meta?.price_vente_ucd_ttc || 0)
                  const { unitVente, unitMagasin } = resolveProductUnits(p)

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleOpenProductDetail(p)}
                      className={clsx(
                        'group relative flex flex-col justify-between p-3.5 border rounded-2xl text-left transition-all duration-150 shadow-sm hover:shadow cursor-pointer select-none',
                        stockVente <= 0
                          ? 'bg-slate-50/90 border-rose-200 hover:border-rose-300'
                          : 'bg-white hover:bg-emerald-50/40 border-slate-200 hover:border-emerald-400'
                      )}
                    >
                      {/* En-tête : Référence + Stock (Vente & Magasin) ou Badge Recette */}
                      <div>
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {p.code}
                          </span>
                          {p.is_recipe ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-0.5">
                              🍽️ Recette
                            </span>
                          ) : (
                            <span
                              className={clsx(
                                'text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5',
                                stockVente <= 0
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : stockVente < 5
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-800'
                              )}
                              title={`Stock disponible vente directe : ${formatStockWithUnit(stockVente, unitVente)}`}
                            >
                              Stock vente : {formatStockWithUnit(stockVente, unitVente)}
                            </span>
                          )}
                        </div>

                        {/* Vignette Produit avec Photo ou Icône et Nom */}
                        <div className="flex items-start gap-2.5 my-1">
                          <div className={clsx(
                            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition',
                            p.is_recipe
                              ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-100'
                              : stockVente <= 0
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-slate-100 group-hover:bg-emerald-100/60 text-slate-600 group-hover:text-emerald-700'
                          )}>
                            {p.is_recipe ? <span>🍳</span> : <Layers className="w-5 h-5" />}
                          </div>
                          <p className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 line-clamp-2 leading-tight">
                            {p.name}
                          </p>
                        </div>

                        {/* Stock Magasin disponible (uniquement pour les produits stockés du Bar) */}
                        {!p.is_recipe && (
                          <div className="text-[10px] text-slate-500 flex items-center justify-between mt-1 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200 font-medium">
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3 text-indigo-600" /> Stock magasin :
                            </span>
                            <span className="font-bold text-indigo-700 font-mono">{formatStockWithUnit(stockMagasin, unitMagasin)}</span>
                          </div>
                        )}
                      </div>

                      {/* Tarification : Prix unitaire détail & Prix de gros */}
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-slate-500 font-medium">Prix Détail ({unitVente}) :</span>
                          <span className="text-xs font-black text-emerald-700 font-mono">{fmt(p.selling_price)}</span>
                        </div>
                        {wholesalePrice > 0 && (
                          <div className="flex items-baseline justify-between text-[10px] text-slate-500">
                            <span>Prix Gros ({unitMagasin}) :</span>
                            <span className="font-mono font-semibold text-slate-700">{fmt(wholesalePrice)}</span>
                          </div>
                        )}

                        {/* Overlay / Action si Rupture Stock Vente (produits physiques Bar uniquement) */}
                        {!p.is_recipe && stockVente <= 0 && (
                          <div className="pt-2">
                            {canTransferStock ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTransfertProduct(p)
                                }}
                                className="w-full py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition"
                              >
                                <ArrowRightLeft className="w-3 h-3" /> RUPTURE VENTE — Transférer ({stockMagasin} {unitMagasin})
                              </button>
                            ) : (
                              <div
                                className="w-full py-1.5 px-2 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-[10px] font-bold text-center select-none"
                                title="Réservé Administrateur et Gestionnaire"
                              >
                                Rupture en vente (Transfert réservé Gestionnaire)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── PANNEAU PANIER GLISSANT & ENCAISSEMENT DIRECTEMENT INTÉGRÉ À DROITE ── */}
          {isCartVisible && (
            <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-13rem)] overflow-hidden transition-all duration-300">
              {/* En-tête Panier */}
              <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50/90 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-xs">Panier & Encaissement</h3>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-slate-500 font-medium">
                        {cart.length === 0 ? 'Aucun article' : `${cart.length} article${cart.length > 1 ? 's' : ''}`}
                      </p>
                      {cart.length > 0 && (
                        <span className={clsx(
                          "text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold",
                          inactiveSeconds >= 120 ? "bg-amber-100 text-amber-900 animate-pulse" : "bg-slate-200/80 text-slate-700"
                        )}>
                          ⏱️ {String(Math.floor(inactiveSeconds / 60)).padStart(2, '0')}:{String(inactiveSeconds % 60).padStart(2, '0')} / 03:00
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg hover:bg-rose-50 transition"
                      title="Vider tout le panier"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Vider
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCartVisible(false)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-200/60 transition"
                    title="Masquer le panneau panier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Corps Défilable Interne : Client, Articles, Totaux Fiscaux, Règlements */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
                {loadedPendingBon && (
                  <div className="p-2.5 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-fadeIn">
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowRightLeft className="w-4 h-4 text-amber-700 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-amber-900 truncate">
                          Bon N° {loadedPendingBon.order_number}
                        </p>
                        <p className="text-[10px] text-amber-700 font-medium truncate">
                          Vendeur: <strong>{loadedPendingBon.seller_name}</strong> &bull; Total: {fmt(loadedPendingBon.total_amount)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLoadedPendingBon(null)}
                      className="text-amber-800 hover:text-amber-950 font-bold text-[10px] bg-amber-200/80 hover:bg-amber-200 px-2 py-1 rounded-lg transition shrink-0"
                      title="Délier ce bon du panier"
                    >
                      Délier
                    </button>
                  </div>
                )}
                {showInactivityWarning && (
                  <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-md border border-amber-600 text-xs space-y-2 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-black">
                      <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                      <span>Panier Inactif (&gt; 3 minutes)</span>
                    </div>
                    <p className="text-[11px] text-amber-50">
                      Ce panier est inactif depuis plus de 3 minutes. Souhaitez-vous continuer cette commande ou libérer les articles réservés ?
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLastCartActivity(Date.now())
                          setInactiveSeconds(0)
                          setShowInactivityWarning(false)
                        }}
                        className="flex-1 py-1.5 bg-white text-amber-950 rounded-xl text-xs font-black shadow-sm hover:bg-amber-50 transition"
                      >
                        Conserver Commande
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearCart()
                          setShowInactivityWarning(false)
                        }}
                        className="flex-1 py-1.5 bg-amber-950/40 hover:bg-amber-950/60 text-white rounded-xl text-xs font-bold transition"
                      >
                        Vider Panier
                      </button>
                    </div>
                  </div>
                )}

                {/* 1. Sélection Client & Attribution Serveuse (Comptoir / Tables) */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  {isRestaurant ? (
                    <div className="space-y-2.5">
                      {/* Choix du mode : Vente sur Table ou Vente Directe Comptoir */}
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/80 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setRestaurantSaleMode('TABLE')}
                          className={clsx(
                            'py-1.5 px-2 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5',
                            restaurantSaleMode === 'TABLE' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                          )}
                        >
                          <span>🍽️</span> Vente sur Table
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRestaurantSaleMode('COMPTOIR')
                            setRestaurantTable('')
                            setRestaurantTableId('')
                          }}
                          className={clsx(
                            'py-1.5 px-2 rounded-lg text-xs font-black transition flex items-center justify-center gap-1.5',
                            restaurantSaleMode === 'COMPTOIR' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                          )}
                        >
                          <span>🥤</span> Vente Comptoir
                        </button>
                      </div>

                      {/* Si Vente sur Table : Choix obligatoire de la table */}
                      {restaurantSaleMode === 'TABLE' ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-rose-950 uppercase tracking-wider flex items-center gap-1">
                              <span>🍽️</span> Table Sélectionnée * :
                            </label>
                            <span className="text-[9px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                              Obligatoire
                            </span>
                          </div>
                          {restaurantTablesList.length === 0 ? (
                            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 font-semibold">
                              ⚠️ Aucune table enregistrée. Veuillez configurer vos tables dans le module <strong>« Services et Tables »</strong>.
                            </div>
                          ) : (
                            <select
                              value={restaurantTableId || ''}
                              onChange={(e) => {
                                const tId = e.target.value
                                setRestaurantTableId(tId)
                                const found = restaurantTablesList.find(t => t.id === tId)
                                if (found) {
                                  setRestaurantTable(found.numero_table)
                                } else {
                                  setRestaurantTable('')
                                }
                              }}
                              className="w-full text-xs border-2 border-rose-400 rounded-xl p-2 bg-white font-black text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
                            >
                              <option value="">-- Choisir une table parmi les tables existantes * --</option>
                              {restaurantTablesList.map((t) => {
                                const label = t.nom && t.nom.trim() !== t.numero_table.trim() ? `${t.numero_table} - ${t.nom}` : t.numero_table
                                return (
                                  <option key={t.id} value={t.id}>
                                    {label} {t.zone ? `(${t.zone})` : ''} {t.statut ? `[${t.statut}]` : ''}
                                  </option>
                                )
                              })}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                          <span>🥤</span>
                          <span>Vente directe comptoir / À emporter (Sans table)</span>
                        </div>
                      )}

                      {/* Client optionnel pour compte fidélité / dette */}
                      <div className="space-y-1 pt-1 border-t border-slate-200/60">
                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          Client Associé (Optionnel) :
                        </label>
                        <select
                          value={selectedCustomerId}
                          onChange={(e) => setSelectedCustomerId(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-xl p-1.5 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">👤 Client Comptoir / Standard</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.current_debt > 0 ? `(Dette : ${fmt(c.current_debt)})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    /* Autre secteur : Affichage standard */
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="flex-1 text-xs border border-slate-200 rounded-xl p-2 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">👤 Client Comptoir (Par défaut)</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.current_debt > 0 ? `(Dette : ${fmt(c.current_debt)})` : ''}
                            {c.credit_authorized === false ? ' [Crédit non autorisé]' : ''}
                            {c.discount_eligible && (c.discount_rate || 0) > 0 ? ` [Remise ${c.discount_rate}%]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Attribution de la commande à une serveuse en mode Restaurant / Bar / Maquis */}
                  {isRestaurant && (
                    <div className="pt-1.5 border-t border-slate-200/60 space-y-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-rose-950 uppercase tracking-wider flex items-center gap-1">
                          <span>🍸</span> Serveuse Responsable :
                        </label>
                        <span className={clsx(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          restaurantServeur && restaurantServeur !== 'Client Comptoir Direct'
                            ? "bg-rose-100 text-rose-800 font-mono"
                            : "bg-slate-200 text-slate-600"
                        )}>
                          {restaurantServeur && restaurantServeur !== 'Client Comptoir Direct'
                            ? `Serveuse : ${restaurantServeur}`
                            : 'Vente directe comptoir'}
                        </span>
                      </div>

                      {restaurantServeursList.length === 0 ? (
                        <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
                          ℹ️ Aucune serveuse enregistrée. Rendez-vous dans <strong>« Serveurs & Personnel »</strong> pour ajouter vos serveuses.
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={restaurantServeurId || (restaurantServeursList.find(s => (s.nom_complet || '').trim().toLowerCase() === (restaurantServeur || '').trim().toLowerCase())?.id) || ''}
                            onChange={(e) => {
                              const sId = e.target.value
                              setRestaurantServeurId(sId)
                              const matched = restaurantServeursList.find(s => s.id === sId)
                              if (matched) {
                                setRestaurantServeur(matched.nom_complet)
                                setRestaurantSessionId(matched.active_session_id || '')
                              } else {
                                setRestaurantServeur('Client Comptoir Direct')
                                setRestaurantSessionId('')
                              }
                            }}
                            className="w-full text-xs border border-rose-200 rounded-xl p-2 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
                          >
                            <option value="">-- Vente Directe Comptoir (Sans serveuse) --</option>
                            {restaurantServeursList.map((srv) => (
                              <option key={srv.id} value={srv.id}>
                                💁‍♀️ {srv.nom_complet} {srv.has_open_session ? '🟢 [Session de service active]' : ''} {srv.matricule ? `[${srv.matricule}]` : ''} {srv.telephone ? `— ${srv.telephone}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {restaurantServeur && restaurantServeur !== 'Client Comptoir Direct' && !restaurantSessionId && (
                        <div className="mt-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>Aucune session de service ouverte pour {restaurantServeur}. Ouvrez sa session dans « Serveurs & Personnel » pour le suivi.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCustomer && selectedCustomer.discount_eligible && (selectedCustomer.discount_rate || 0) > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-xl border border-amber-200">
                      <span>🏷️ Remise Client : -{selectedCustomer.discount_rate}% accordée</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={isDeferred}
                        onChange={(e) => setIsDeferred(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>📦 Vente Différée (Bon de Livraison)</span>
                    </label>
                  </div>
                </div>

                {/* BANNIÈRE GRILLE TARIFAIRE AUTOMATIQUE (BRASSERIE) */}
                {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && cart.length > 0 && (
                  <div className="p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500 text-slate-950 rounded-xl shadow-xs">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Grille automatique :</span>
                          <span className="text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md font-black">
                            {currentBrasserieGrid ? currentBrasserieGrid.nom : 'Détail standard'}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500">
                          Total commande : <strong>{totalBrasserieQuantity} casiers/articles</strong>
                        </div>
                      </div>
                    </div>
                    {currentBrasserieGrid && (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-lg border border-emerald-300">
                        {currentBrasserieGrid.seuil_min} à {currentBrasserieGrid.seuil_max !== null ? `${currentBrasserieGrid.seuil_max} casiers` : 'Illimité'}
                      </span>
                    )}
                  </div>
                )}

                {/* 2. Liste des lignes du Panier */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Articles au Panier ({cart.length})
                  </h4>

                  {cart.length === 0 ? (
                    <div className="p-5 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                      <ShoppingCart className="w-7 h-7 mb-1.5 stroke-[1.5] text-slate-300 mx-auto" />
                      <p className="font-semibold text-xs text-slate-600">Panier vide</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Cliquez sur un produit du catalogue à gauche</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto pr-1">
                      {cart.map((item, idx) => {
                        const lineKey = item.lineId || `${item.product.id}-${idx}`
                        const lineTotal = item.qty * item.unitPrice - item.qty * item.discount
                        return (
                          <div key={lineKey} className="py-2 first:pt-0 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs text-slate-800 truncate">{item.product.name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <p className="text-[10px] text-slate-500 font-mono">
                                  {fmt(item.unitPrice)} / {item.product.unit || 'Pièce'}
                                </p>
                                {item.pricingSource === 'PRIX_PERSONNALISE' && (
                                  <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                                    ★ Prix personnalisé
                                  </span>
                                )}
                                {item.pricingSource === 'GRILLE' && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-1.5 py-0.2 rounded-full">
                                    Grille {item.appliedGridName}
                                  </span>
                                )}
                                {item.pricingSource === 'STANDARD' && (currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && (
                                  <span className="text-[9px] bg-slate-100 text-slate-600 font-medium px-1.5 py-0.2 rounded-full">
                                    Prix standard
                                  </span>
                                )}
                                {item.unitSaving && item.unitSaving > 0 ? (
                                  <span className="text-[9px] text-emerald-600 font-bold">
                                    - {fmt(item.unitSaving * item.qty)}
                                  </span>
                                ) : null}
                                {item.batchTierLabel && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1 rounded">
                                    {item.batchTierLabel}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
                              <button
                                type="button"
                                onClick={() => updateCartItemQty(lineKey, item.qty - 1)}
                                className="w-5 h-5 bg-white rounded-lg flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 transition"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <input
                                type="number"
                                step="any"
                                value={item.qty}
                                onChange={(e) => updateCartItemQty(lineKey, Number(e.target.value))}
                                className="w-10 text-center text-xs font-mono font-bold bg-transparent border-0 focus:ring-0 p-0"
                              />
                              <button
                                type="button"
                                onClick={() => updateCartItemQty(lineKey, item.qty + 1)}
                                className="w-5 h-5 bg-white rounded-lg flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 transition"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            <div className="text-right min-w-[70px]">
                              <p className="font-bold text-xs text-slate-900 font-mono">{fmt(lineTotal)}</p>
                              <button
                                type="button"
                                onClick={() => removeFromCart(lineKey)}
                                className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold"
                              >
                                Retirer
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 3. Récapitulatif Sous-total, TVA, Total TTC & AIB */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  {!isRestaurant && (
                    <>
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Total HT taxable :</span>
                        <span className="font-mono font-bold">{fmt(cartFiscalSummary.ht)}</span>
                      </div>
                      {cartFiscalSummary.totalExonere > 0 && (
                        <div className="flex justify-between text-slate-600 text-[11px]">
                          <span>Total exonéré :</span>
                          <span className="font-mono font-bold">{fmt(cartFiscalSummary.totalExonere)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Total TVA (18%) :</span>
                        <span className="font-mono font-bold">{fmt(cartFiscalSummary.tva)}</span>
                      </div>

                      {/* Ligne AIB calculée */}
                      {cartFiscalSummary.aib > 0 && (
                        <div className="flex justify-between text-amber-800 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200 text-[11px]">
                          <span className="font-bold flex items-center gap-1">
                            AIB ({cartFiscalSummary.aibRate}% sur HT) :
                          </span>
                          <span className="font-mono font-bold">{fmt(cartFiscalSummary.aib)}</span>
                        </div>
                      )}

                      {/* Case à cocher pour activer/désactiver l'AIB sur le panier si non défini sur les articles */}
                      {!cartFiscalSummary.hasProductWithAib && (
                        <div className="pt-1 flex items-center justify-between text-[11px] text-slate-600 border-t border-dashed border-slate-200">
                          <label className="flex items-center gap-1.5 cursor-pointer font-medium hover:text-amber-800">
                            <input
                              type="checkbox"
                              checked={applyAibCart}
                              onChange={(e) => setApplyAibCart(e.target.checked)}
                              className="w-3.5 h-3.5 accent-amber-600 rounded cursor-pointer"
                            />
                            <span>Appliquer AIB sur cette vente</span>
                          </label>
                          {applyAibCart && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setCartAibRate(1)}
                                className={clsx(
                                  'px-1.5 py-0.5 rounded text-[10px] font-bold transition',
                                  cartAibRate === 1 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                )}
                              >
                                1%
                              </button>
                              <button
                                type="button"
                                onClick={() => setCartAibRate(5)}
                                className={clsx(
                                  'px-1.5 py-0.5 rounded text-[10px] font-bold transition',
                                  cartAibRate === 5 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                )}
                              >
                                5%
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {isRestaurant && (subtotalBarTTC > 0 && subtotalCuisineTTC > 0) && (
                    <div className="p-2 bg-slate-100/90 rounded-xl border border-slate-200 text-[10px] space-y-1">
                      <div className="flex justify-between font-bold text-blue-800">
                        <span>🍾 Sous-total BAR :</span>
                        <span className="font-mono">{fmt(subtotalBarTTC)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-orange-800">
                        <span>🍽️ Sous-total RESTAURANT / MAQUIS :</span>
                        <span className="font-mono">{fmt(subtotalCuisineTTC)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-1.5 border-t border-slate-200">
                    <span className="text-slate-800 uppercase tracking-tight text-xs">TOTAL TTC :</span>
                    <span className="font-mono text-emerald-700 text-base font-black">{fmt(totalNetTTC)}</span>
                  </div>
                </div>

                {/* 4. VISIBILITÉ DIRECTE SOUS LE TOTAL TTC (MODES DE RÈGLEMENT) */}
                <div className="pt-1 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mode de Paiement</span>
                    </h4>

                    {/* Case à cocher ☐ Paiement par plusieurs modes */}
                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 transition">
                      <input
                        type="checkbox"
                        checked={isMultiMode}
                        onChange={(e) => handleToggleMultiMode(e.target.checked)}
                        className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer rounded"
                      />
                      <span className="text-[10px] font-bold text-slate-800">Plusieurs modes</span>
                    </label>
                  </div>

                  {!isMultiMode ? (
                    /* DÉCOCHÉE (MODE UNIQUE) : 5 boutons de paiement directs */
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'especes', label: '💵 Espèces' },
                          { id: 'momo_mtn', label: '📱 MTN MoMo' },
                          { id: 'momo_moov', label: '📱 Moov' },
                          { id: 'banque', label: '🏦 Banque' },
                          { id: 'credit', label: '📝 Crédit' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSingleMethod(m.id as any)}
                            className={clsx(
                              'p-2 rounded-xl border text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-sm',
                              singleMethod === m.id
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-600/20'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Si Espèces sélectionné : champ « Espèces reçues » + Monnaie à rendre en temps réel */}
                      {singleMethod === 'especes' && (
                        <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <label className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Espèces reçues :</span>
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={cashReceivedInput}
                                onChange={(e) => setCashReceivedInput(e.target.value)}
                                placeholder={String(totalNetTTC)}
                                className="w-28 p-1 border border-emerald-300 rounded-lg font-mono text-xs font-bold text-right bg-white focus:ring-2 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => setCashReceivedInput(String(totalNetTTC))}
                                className="px-1.5 py-1 bg-emerald-200/80 hover:bg-emerald-300 text-emerald-900 rounded-md text-[9px] font-black"
                                title="Montant exact remis"
                              >
                                Exact
                              </button>
                            </div>
                          </div>

                          {cashGiven >= totalNetTTC ? (
                            <div className="flex justify-between items-center pt-1 border-t border-emerald-200/80 text-[11px] font-bold">
                              <span className="text-emerald-900">Monnaie à rendre :</span>
                              <span className="font-mono text-emerald-700 text-xs font-black">
                                👉 {fmt(cashChange)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center pt-1 border-t border-rose-200 text-[11px] font-bold text-rose-700">
                              <span>⚠️ Manque :</span>
                              <span className="font-mono font-black">
                                {fmt(totalNetTTC - cashGiven)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* COCHÉE (MULTI-MODES) : Mode 1 et Mode 2 équilibrés */
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="text-[10px] font-bold text-slate-700">
                        Ventilation des règlements sur 2 modes :
                      </p>

                      {/* Mode 1 */}
                      <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">MODE 1</span>
                        <div className="grid grid-cols-12 gap-1.5">
                          <select
                            value={multiMode1Canal}
                            onChange={(e) => setMultiMode1Canal(e.target.value as any)}
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg text-[11px] font-bold bg-white"
                          >
                            <option value="especes">💵 Espèces</option>
                            <option value="momo_mtn">📱 MTN MoMo</option>
                            <option value="momo_moov">📱 Moov</option>
                            <option value="banque">🏦 Banque</option>
                            <option value="credit">📝 Crédit</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={multiMode1Amount || ''}
                            onChange={(e) => handleMode1AmountChange(Number(e.target.value))}
                            placeholder="Montant 1"
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg font-mono text-[11px] font-bold text-right"
                          />
                        </div>
                      </div>

                      {/* Mode 2 */}
                      <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">MODE 2 (AJUSTÉ)</span>
                        <div className="grid grid-cols-12 gap-1.5">
                          <select
                            value={multiMode2Canal}
                            onChange={(e) => setMultiMode2Canal(e.target.value as any)}
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg text-[11px] font-bold bg-white"
                          >
                            <option value="especes">💵 Espèces</option>
                            <option value="momo_mtn">📱 MTN MoMo</option>
                            <option value="momo_moov">📱 Moov</option>
                            <option value="banque">🏦 Banque</option>
                            <option value="credit">📝 Crédit</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={multiMode2Amount || ''}
                            onChange={(e) => handleMode2AmountChange(Number(e.target.value))}
                            placeholder="Montant 2"
                            className="col-span-6 p-1.5 border border-slate-200 rounded-lg font-mono text-[11px] font-bold text-right"
                          />
                        </div>
                      </div>

                      {/* Contrôle équilibre */}
                      <div className="pt-0.5">
                        {multiDiff > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>⚠️ Reste à percevoir : {fmt(multiDiff)}</span>
                          </div>
                        )}
                        {multiDiff < 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>⚠️ Trop perçu : {fmt(Math.abs(multiDiff))}</span>
                          </div>
                        )}
                        {multiDiff === 0 && totalNetTTC > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>✓ Équilibré ({fmt(totalNetTTC)})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION SITUATION DES EMBALLAGES (BRASSERIE) */}
              {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && brasserieEmballageRows.length > 0 && (() => {
                const isComptoir = !selectedCustomer || selectedCustomer.code === 'COMPTOIR' || (selectedCustomer.name || '').toLowerCase().includes('comptoir')
                return (
                  <div className="mx-3 my-2 p-2.5 bg-amber-50/90 rounded-2xl border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                        <span className="text-sm">📦</span> Situation des Emballages ({isComptoir ? 'Client Comptoir' : selectedCustomer?.name})
                      </span>
                      {isComptoir && (
                        <span className="text-[9px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-bold">
                          Dû = 0 Obligatoire
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="border-b border-amber-200 text-amber-900 font-bold bg-amber-100/60">
                            <th className="p-1">Désignation</th>
                            <th className="p-1 text-center">Précédent</th>
                            <th className="p-1 text-center">Facture</th>
                            <th className="p-1 text-center">Rendus</th>
                            <th className="p-1 text-right">Reste</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {brasserieEmballageRows.map((emb) => {
                            const hasError = isComptoir && emb.reste !== 0

                            return (
                              <tr key={emb.code} className={clsx("bg-white transition", hasError && "bg-rose-50/80")}>
                                <td className="p-1.5 font-bold text-slate-800">
                                  [{emb.code}] {emb.designation}
                                </td>
                                <td className="p-1.5 text-center font-mono font-semibold text-slate-600">
                                  {emb.precedent}
                                </td>
                                <td className="p-1.5 text-center font-mono font-black text-rose-600">
                                  {emb.facture}
                                </td>
                                <td className="p-1.5 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    value={brasserieRetours[emb.code] ?? ''}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value) || 0)
                                      setBrasserieRetours((prev) => ({ ...prev, [emb.code]: val }))
                                    }}
                                    className="w-12 text-center p-0.5 font-black text-xs border border-amber-300 rounded font-mono bg-amber-50/50 focus:ring-1 focus:ring-amber-500"
                                  />
                                </td>
                                <td className="p-1.5 text-right font-mono font-black">
                                  <span className={clsx(
                                    hasError ? "text-rose-600 font-black animate-pulse" : emb.reste > 0 ? "text-amber-800" : "text-emerald-700"
                                  )}>
                                    {emb.reste}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {isComptoir && brasserieEmballageRows.some(e => e.reste !== 0) && (
                      <p className="text-[10px] text-rose-700 font-bold bg-rose-100/70 p-1.5 rounded-lg border border-rose-200">
                        ⚠️ Pour le Client Comptoir, saisissez Rendus = Facture afin que le Reste soit égal à 0.
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Pied du Panier : Validation Vente Directe ou Transmission Bon de Commande selon le mode d'organisation */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0">
                {isCircuitSeparated && !hasCaissePrivilege ? (
                  /* MODE 2 : Vendeur exclusif -> Valider et transmettre à la caisse */
                  <button
                    type="button"
                    disabled={cart.length === 0 || transmittingBon}
                    onClick={handleTransmettreBonCaisse}
                    className={clsx(
                      'w-full py-3.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-md cursor-pointer',
                      cart.length > 0 && !transmittingBon
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-amber-600/20'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    )}
                  >
                    {transmittingBon ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Transmission à la caisse...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Valider et transmettre à la caisse ({fmt(totalNetTTC)})</span>
                      </>
                    )}
                  </button>
                ) : isCircuitSeparated && hasCaissePrivilege ? (
                  /* MODE 2 : Utilisateur polyvalent avec droits de caisse -> Choix transmission ou encaissement direct */
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={cart.length === 0 || transmittingBon}
                      onClick={handleTransmettreBonCaisse}
                      className={clsx(
                        'w-full py-2.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-sm',
                        cart.length > 0 && !transmittingBon
                          ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-amber-600/20'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      )}
                    >
                      {transmittingBon ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Transmission en cours...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="w-4 h-4" />
                          <span>Transmettre à la caisse ({fmt(totalNetTTC)})</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!canValidateSale || paying}
                      onClick={handleValidateSale}
                      className={clsx(
                        'w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border',
                        canValidateSale && !paying
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 cursor-pointer'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      )}
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Encaisser directement au comptoir</span>
                    </button>
                  </div>
                ) : (
                  /* MODE 1 : Vente et encaissement par le même utilisateur (Parcours classique direct) */
                  <button
                    type="button"
                    disabled={!canValidateSale || paying}
                    onClick={handleValidateSale}
                    className={clsx(
                      'w-full py-3 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-sm',
                      (canValidateSale && !paying)
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-600/20'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    )}
                  >
                    {paying ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Validation...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{validationButtonText}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      ) : (
        /* ── VUE 2 : HISTORIQUE DES VENTES & AVOIRS ──────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par N° facture ou client..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 self-end sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
            <button
              onClick={() => handleOpenAvoirModal()}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Créer un avoir
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Réf Facture</th>
                  <th className="p-3">Date & Heure</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Total TTC</th>
                  <th className="p-3 text-right">Payé</th>
                  <th className="p-3 text-right">Crédit</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                      Aucune vente enregistrée sur cette période.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition font-sans">
                      <td className="p-3 font-mono font-bold text-slate-900">{s.order_number}</td>
                      <td className="p-3 text-slate-500 font-mono">
                        {new Date(s.date).toLocaleDateString('fr-BJ')} à {new Date(s.date).toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{s.customer_name}</td>
                      <td className="p-3 text-right font-black font-mono text-slate-900">{fmt(s.total_amount)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700 font-bold">{fmt(s.amount_paid)}</td>
                      <td className="p-3 text-right font-mono text-rose-600 font-bold">
                        {s.credit_amount > 0 ? fmt(s.credit_amount) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          s.status === 'COMPLET' ? 'bg-emerald-100 text-emerald-800' :
                          s.status === 'A_LIVRER' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        )}>
                          {s.status === 'COMPLET' ? 'Payé' : s.status === 'A_LIVRER' ? 'Différé' : 'ANNULÉE PAR AVOIR'}
                        </span>
                        {s.status === 'AVOIR' && s.annulation_avoir?.avoir_numero && (
                          <span className="block text-[9px] text-rose-700 font-mono mt-0.5" title={`Annulée le ${s.annulation_avoir.date_annulation ? new Date(s.annulation_avoir.date_annulation).toLocaleString('fr-FR') : '-'} par ${s.annulation_avoir.annule_par || '-'}`}>
                            {s.annulation_avoir.avoir_numero}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleDownloadPDF(s)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs"
                            title="Télécharger Facture PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setCurrentSale(s); setShowInvoiceModal(true); }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                            title="Aperçu & Imprimer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {s.status !== 'AVOIR' ? (
                            <button
                              onClick={() => handleCreateAvoir(s)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs"
                              title="Créer Facture d'Avoir"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleConsultAvoir(s)}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1"
                              title="Consulter l'avoir associé"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL 1 : DÉTAILS PRODUIT (CLIC ARTICLE DU CATALOGUE) ─────────────── */}
      {selectedProductForDetail && (
        <ModalPortal isOpen={!!selectedProductForDetail} onClose={() => setSelectedProductForDetail(null)} id="modal-product-detail">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">{selectedProductForDetail.code}</span>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight mt-0.5">
                  {selectedProductForDetail.name}
                </h3>
                <span className="text-xs text-slate-500">{selectedProductForDetail.unit}</span>
              </div>
              <button onClick={() => setSelectedProductForDetail(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Prix Unitaire de Base (TTC) :</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  {fmt(selectedProductForDetail.selling_price)}
                </span>
              </div>

              {/* Paliers par lot préenregistrés (quantités UV) si configurés */}
              {selectedProductForDetail.batch_pricing?.enabled && (
                (() => {
                  const tiers = getBatchTiersList(
                    selectedProductForDetail.batch_pricing.coef,
                    selectedProductForDetail.batch_pricing
                  ).filter((t) => t.priceTtc > 0)

                  if (tiers.length === 0) return null

                  return (
                    <div className="space-y-1.5 p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                      <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 block">
                        Paliers par Lot Préenregistrés (Quantités en {selectedProductForDetail.unit}) :
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {tiers.map((t) => {
                          const isSel = Math.abs(detailQty - t.uvQty) < 0.005
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setDetailQty(t.uvQty)}
                              className={clsx(
                                'px-2.5 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 shadow-sm',
                                isSel
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900'
                              )}
                            >
                              <span className="font-mono">{formatUvQty(t.uvQty)} {selectedProductForDetail.unit}</span>
                              <span className={clsx('text-[10px] font-mono', isSel ? 'text-emerald-100' : 'text-emerald-700 dark:text-emerald-400')}>
                                ({fmt(t.priceTtc)})
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()
              )}

              {/* Sélecteur de quantité numérique décimale avec boutons fractionnés */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Quantité à Vendre ({selectedProductForDetail.unit}) :
                </label>
                <div className="flex items-center gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.max(0.1, Math.round((detailQty - 1) * 100) / 100))}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="-1"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.max(0.05, Math.round((detailQty - 0.5) * 100) / 100))}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="-0.5"
                  >
                    -0.5
                  </button>

                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    value={detailQty}
                    onChange={(e) => setDetailQty(Math.max(0.001, Number(e.target.value)))}
                    className="flex-1 p-2 text-center text-lg font-black font-mono border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />

                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.round((detailQty + 0.5) * 100) / 100)}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="+0.5"
                  >
                    +0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailQty(Math.round((detailQty + 1) * 100) / 100)}
                    className="px-2.5 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center transition"
                    title="+1"
                  >
                    +1
                  </button>
                </div>

                {/* Raccourcis directs de quantités fractionnées et entières */}
                <div className="flex flex-wrap gap-1">
                  {[0.25, 0.5, 0.75, 1, 1.5, 2, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDetailQty(preset)}
                      className={clsx(
                        'px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition border',
                        Math.abs(detailQty - preset) < 0.001
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      )}
                    >
                      {preset} {selectedProductForDetail.unit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Ligne = Calcul automatique selon palier ou tarif standard UV */}
              {(() => {
                const match = calculateBatchLinePrice(
                  detailQty,
                  selectedProductForDetail.batch_pricing,
                  selectedProductForDetail.selling_price
                )

                return (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">Total de la Ligne :</span>
                      {selectedProductForDetail.batch_pricing?.enabled && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block mt-0.5">
                          {match.isMatched
                            ? `✓ ${match.matchedTierLabel} appliqué`
                            : `Tarif standard UV (${formatUvQty(detailQty)} × ${fmt(match.effectiveUnitPriceTtc)})`}
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      {fmt(match.totalLineTtc)}
                    </span>
                  </div>
                )
              })()}
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setSelectedProductForDetail(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToCart}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" /> Ajouter au panier
              </button>
            </div>
          </div>
        </ModalPortal>
      )}


      {/* ── MODALE WORKFLOW 4 MINUTES RESTAURANT & CONFIRMATION (POINT 6 & 8) ── */}
      <ModalPortal isOpen={showPendingRestoModal && !!pendingRestoOrder} onClose={() => setShowPendingRestoModal(false)} id="modal-resto-pending">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5 animate-fadeIn">
          {/* En-tête avec compte à rebours */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Clock className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Validation Commande Restaurant</h3>
                <p className="text-xs text-slate-500 font-mono">Réf : {pendingRestoOrder?.orderNumber}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black font-mono text-amber-600">
                {Math.floor(pendingCountdownSeconds / 60)}:{(pendingCountdownSeconds % 60).toString().padStart(2, '0')}
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Temps restant</span>
            </div>
          </div>

          {/* Alerte informative de grâce */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong>Période de grâce de 4 minutes active :</strong> Aucun déstockage ni dette serveuse n'a encore été imputé. Durant ce délai, vous pouvez modifier les articles ou annuler la commande sans impacter les stocks.
            </div>
          </div>

          {/* Détails de la commande */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Poste / Circuit</span>
              <span className="font-black text-slate-800">{pendingRestoOrder?.circuit === 'BAR' ? '🍷 BAR' : '🍳 CUISINE'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Serveur(se)</span>
              <span className="font-black text-slate-800 truncate block">{pendingRestoOrder?.serveurNom}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Emplacement</span>
              <span className="font-black text-slate-800">{pendingRestoOrder?.tableNumero ? `Table ${pendingRestoOrder.tableNumero}` : 'Comptoir'}</span>
            </div>
          </div>

          {/* Liste des articles */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 flex justify-between">
              <span>Articles commandés ({pendingRestoOrder?.items.length})</span>
              <span>Montant</span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {pendingRestoOrder?.items.map((item, idx) => (
                <div key={idx} className="px-3 py-2 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800">{item.product.name}</span>
                    <span className="text-slate-400 block text-[11px] font-mono">{item.qty} × {fmt(item.unitPrice)}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900">{fmt(item.qty * item.unitPrice)}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 px-3 py-2.5 border-t border-slate-200 flex justify-between items-center font-black">
              <span className="text-xs text-slate-700">Total Commande TTC :</span>
              <span className="text-sm font-mono text-emerald-600">{fmt(pendingRestoOrder?.totalTtc || 0)}</span>
            </div>
          </div>

          {/* Formulaire d'annulation avec motif */}
          {showCancelPrompt ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-800 text-xs font-black">
                <XCircle className="w-4 h-4" /> Motif d'annulation obligatoire
              </div>
              <input
                type="text"
                placeholder="Ex : Erreur de table, client parti, changement de plat..."
                value={cancelMotif}
                onChange={(e) => setCancelMotif(e.target.value)}
                className="w-full px-3 py-2 border border-rose-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(false)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Revenir
                </button>
                <button
                  type="button"
                  onClick={handleCancelPendingOrder}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition shadow-sm"
                >
                  Confirmer Annulation (0 Déstockage)
                </button>
              </div>
            </div>
          ) : (
            /* Boutons d'actions */
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleReopenPendingOrderForEdit}
                  className="w-full py-2.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" /> Modifier la commande
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(true)}
                  className="w-full py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" /> Annuler la commande
                </button>
              </div>

              <button
                type="button"
                disabled={isFinalizingPending}
                onClick={() => handleFinalizePendingOrder(pendingRestoOrder)}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg"
              >
                {isFinalizingPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Finalisation et déstockage en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" /> Confirmer & Finaliser maintenant (Déstockage & KDS)
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowPendingRestoModal(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 transition"
                >
                  Laisser s'écouler en arrière-plan (auto-finalisation à 0:00)
                </button>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>

      {/* ── MODAL 3 : FACTURE COMMERCIALE STANDARD GESTIO 229 (AUCUN FAUX E-MECEF) */}
      <ModalPortal isOpen={showInvoiceModal && !!currentSale} onClose={() => setShowInvoiceModal(false)} id="modal-invoice-standard">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full border border-slate-200 max-h-[92vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && (
                <button
                  onClick={() => setPrintFormat('brasserie')}
                  className={clsx(
                    'px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm',
                    printFormat === 'brasserie' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  )}
                >
                  <span>📦</span> Facture Brasserie & Emballages
                </button>
              )}
              <button
                onClick={() => setPrintFormat('factureA4')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition',
                  printFormat === 'factureA4' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                Facture A4 Standard
              </button>
              <button
                onClick={() => setPrintFormat('ticket80')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition',
                  printFormat === 'ticket80' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                Ticket Caisse 80mm
              </button>
              {isRestaurant && (
                <>
                  <button
                    onClick={() => setPrintFormat('ticket80_double')}
                    className={clsx(
                      'px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm',
                      printFormat === 'ticket80_double' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                    )}
                  >
                    <span>🧾</span> Ticket Double (Client + Cuisine)
                  </button>
                  <button
                    onClick={() => setPrintFormat('bon_cuisine')}
                    className={clsx(
                      'px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm',
                      printFormat === 'bon_cuisine' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100'
                    )}
                  >
                    <span>🍳</span> Bon Cuisine / Bar
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => currentSale && handleDownloadPDF(currentSale)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" /> Télécharger PDF
              </button>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimer
              </button>
              <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {printFormat === 'brasserie' && factureBrasserieData ? (
            <FactureBrasserieTemplate data={factureBrasserieData} onClose={() => setShowInvoiceModal(false)} />
          ) : printFormat === 'factureA4' ? (
            /* ── FACTURE COMMERCIALE A4 STANDARD (CONFORME RÈGLES 24 & 25) ── */
            <div id="invoice-a4-standard" className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5 text-xs font-sans text-slate-800">
              {/* Entête Entreprise & Numéro */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div className="flex items-start gap-3.5">
                  {company?.logo_url && (
                    <img
                      src={company.logo_url}
                      alt="Logo"
                      className="w-16 h-16 object-contain rounded-xl border border-slate-200 p-1 bg-white flex-shrink-0"
                    />
                  )}
                  <div>
                    <h2 className="text-lg font-black text-slate-900 uppercase">{company?.name ?? 'GESTIO 229 ENTREPRISE'}</h2>
                    <p className="text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'} • RCCM : {company?.rccm_number || 'Non renseigné'}</p>
                    <p className="text-slate-500">{company?.address ? `${company.address}, ` : ''}{company?.city || 'Cotonou, République du Bénin'}</p>
                    <p className="text-slate-500">Tél : {company?.phone || '+229 01 00 00 00'} • Email : {company?.email || 'contact@gestio229.bj'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={clsx(
                    "px-3 py-1 rounded-lg font-black text-xs uppercase tracking-wider",
                    modalDocTitle.includes('BON DE COMMANDE') ? "bg-indigo-50 text-indigo-800 border border-indigo-200" :
                    modalDocTitle.includes('AVOIR') ? "bg-rose-50 text-rose-800 border border-rose-200" :
                    "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  )}>
                    {modalDocTitle}
                  </span>
                  <p className="font-mono font-bold text-sm mt-1.5">{currentSale?.order_number}</p>
                  <p className="text-slate-500">Date : {formatBeninDateTime(currentSale?.date)}</p>
                  <p className="text-slate-500 text-[11px] font-medium">Caisse : Caisse Principale POS</p>
                </div>
              </div>

              {/* Bloc Client */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Facturé à / CLIENT :</span>
                  <p className="text-sm font-bold text-slate-900">
                    {currentSale?.table_numero ? (currentSale.table_numero.toLowerCase().startsWith('table') ? currentSale.table_numero : `Table ${currentSale.table_numero}`) : (currentSale?.customer_name || 'Client Comptoir')}
                  </p>
                  {currentSale?.serveur_nom && (
                    <p className="text-xs font-bold text-rose-700 mt-0.5">
                      SERVEUR RESPONSABLE : {currentSale.serveur_nom}
                    </p>
                  )}
                  {currentSale?.customer_ifu && (
                    <p className="text-slate-500 font-mono text-[11px]">N° IFU Client : {currentSale.customer_ifu}</p>
                  )}
                </div>
                {currentSale?.is_deferred && (
                  <div className="text-right">
                    <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                      BON DE LIVRAISON EN ATTENTE
                    </span>
                  </div>
                )}
              </div>

              {/* Tableau des Lignes Facturées */}
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Réf</th>
                    <th className="p-2.5">Désignation</th>
                    <th className="p-2.5 text-center">Qté</th>
                    <th className="p-2.5 text-center">Unité</th>
                    <th className="p-2.5 text-right">Prix Unit. TTC</th>
                    <th className="p-2.5 text-center">Régime fiscal</th>
                    <th className="p-2.5 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSale?.lines.map((l, i) => {
                    const isVat = isProductVatSubject(l.product)
                    const vatRate = isVat ? Number(l.product?.vat_rate ?? l.product?.tva_rate ?? 18) : 0
                    const regimeLabel = isVat ? `Taxable (${vatRate}%)` : 'Exonéré'
                    return (
                      <tr key={i}>
                        <td className="p-2.5 font-mono text-slate-500">{l.product.code}</td>
                        <td className="p-2.5 font-medium text-slate-900">{l.product.name}</td>
                        <td className="p-2.5 text-center font-mono font-bold">{l.qty}</td>
                        <td className="p-2.5 text-center text-slate-500">{l.product.unit || 'Pièce'}</td>
                        <td className="p-2.5 text-right font-mono">{fmt(l.unitPrice)}</td>
                        <td className="p-2.5 text-center font-semibold text-[11px]">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px]",
                            isVat ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                          )}>
                            {regimeLabel}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">{fmt(l.qty * l.unitPrice)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Récapitulatif Fiscal & Financier */}
              <div className="flex justify-between items-start pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-700 space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 max-w-xs">
                  <p className="font-black text-slate-900 text-xs uppercase tracking-wide">Règlements effectués :</p>
                  {(currentSale?.ancienne_dette_avant_facture || 0) > 0 && (
                    <div className="flex justify-between gap-3 text-slate-600">
                      <span>• Dette antérieure :</span>
                      <span className="font-bold font-mono">{fmt(currentSale.ancienne_dette_avant_facture || 0)}</span>
                    </div>
                  )}
                  {currentSale?.credit_amount > 0 && (
                    <div className="flex justify-between gap-3 text-slate-800">
                      <span>• Crédit actuel ({currentSale.order_number}) :</span>
                      <span className="font-bold font-mono">{fmt(currentSale.credit_amount)}</span>
                    </div>
                  )}
                  {currentSale?.payments.filter(p => p.amount > 0).map((p, idx) => (
                    <div key={idx} className="flex justify-between gap-3 text-slate-600 capitalize">
                      <span>• Payé ({p.method.replace('_', ' ')}) :</span>
                      <span className="font-semibold font-mono">{fmt(p.amount)}</span>
                    </div>
                  ))}
                  {(currentSale?.credit_amount > 0 || (currentSale?.ancienne_dette_avant_facture || 0) > 0) && (
                    <div className="border-t border-slate-300 pt-1.5 mt-1">
                      <div className="flex justify-between gap-3 font-black text-rose-600 text-xs">
                        <span>• MONTANT TOTAL RESTANT DÛ :</span>
                        <span className="font-mono text-sm">{fmt(currentSale.montant_restant_du_global ?? ((currentSale.ancienne_dette_avant_facture || 0) + currentSale.credit_amount))}</span>
                      </div>
                      {(currentSale?.ancienne_dette_avant_facture || 0) > 0 && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Détail : {fmt(currentSale.ancienne_dette_avant_facture || 0)} (ancien) + {fmt(currentSale.credit_amount)} (actuel) = {fmt(currentSale.montant_restant_du_global ?? ((currentSale.ancienne_dette_avant_facture || 0) + currentSale.credit_amount))}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="w-64 space-y-1.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Total HT taxable :</span>
                    <span className="font-mono font-bold">{fmt(currentSaleFiscalSummary?.totalHtTaxable ?? currentSale?.total_ht ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Total exonéré :</span>
                    <span className="font-mono font-bold">{fmt(currentSaleFiscalSummary?.totalExonere ?? currentSale?.total_exonere ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-medium">Total TVA (18%) :</span>
                    <span className="font-mono font-bold">{fmt(currentSaleFiscalSummary?.totalTva ?? currentSale?.total_tva ?? 0)}</span>
                  </div>
                  {((currentSaleFiscalSummary?.totalAib ?? currentSale?.total_aib ?? 0) > 0) && (
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-medium">Total AIB :</span>
                      <span className="font-mono font-bold">{fmt(currentSaleFiscalSummary?.totalAib ?? currentSale?.total_aib ?? 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
                    <span>NET À PAYER :</span>
                    <span className="font-mono text-emerald-800">{fmt(currentSaleFiscalSummary?.netAPayer ?? currentSale?.total_amount ?? 0)}</span>
                  </div>
                </div>
              </div>

              {/* SECTION EMBALLAGES CONSIGNÉS (BRASSERIE UNIQUEMENT) */}
              {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && currentSale?.emballages_consignes && currentSale.emballages_consignes.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                    <p className="font-black text-[11px] uppercase tracking-wider text-amber-900 mb-2">
                      📦 SITUATION DES EMBALLAGES CONSIGNÉS
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-amber-200 text-[10px] text-amber-800 font-bold uppercase">
                          <th className="text-left py-1">Emballage</th>
                          <th className="text-center py-1">Précédent</th>
                          <th className="text-center py-1">Facture</th>
                          <th className="text-center py-1">Rendus</th>
                          <th className="text-right py-1">Reste Dû</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {currentSale.emballages_consignes.map((emb: any) => (
                          <tr key={emb.code}>
                            <td className="py-1 font-semibold text-slate-800">{emb.designation || emb.code}</td>
                            <td className="py-1 text-center font-mono text-slate-600">{emb.precedent ?? 0}</td>
                            <td className="py-1 text-center font-bold text-red-600">{emb.facture ?? emb.sortie ?? 0}</td>
                            <td className="py-1 text-center font-bold text-emerald-600">{emb.rendus ?? emb.retour ?? 0}</td>
                            <td className="py-1 text-right font-black text-amber-900">{emb.reste ?? emb.net_du ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 pt-2 border-t border-amber-200 text-xs font-black text-amber-900 flex justify-between">
                      <span>TOTAL RESTE DÛ EMBALLAGES :</span>
                      <span>{currentSale.emballages_consignes.map((e: any) => `${e.reste ?? e.net_du ?? 0} ${e.code}`).join(' | ')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mentions de bas de page adaptées au type de document */}
              <div className="pt-4 border-t border-slate-200 text-center text-[10px] space-y-1">
                {modalDocTitle.includes('BON DE COMMANDE') ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 font-bold text-xs">
                    Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande
                  </div>
                ) : (
                  <>
                    <p className="text-slate-600 font-semibold">Facture commerciale émise par GESTIO 229 ERP — République du Bénin</p>
                    <p className="text-slate-400">Pour tout renseignement, veuillez contacter la Direction de {company?.name || "l'entreprise"}.</p>
                  </>
                )}
              </div>
            </div>
          ) : (printFormat === 'ticket80' || printFormat === 'ticket80_double') ? (
            /* ── TICKET DE CAISSE 80MM STANDARD (SANS FAUX NUMÉROS FISCAUX) ── */
            <div id="invoice-ticket-standard" data-printable="true" className="mx-auto max-w-[80mm] p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl font-mono text-xs space-y-3">
              <div className="text-center space-y-1">
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt="Logo"
                    className="w-12 h-12 object-contain mx-auto mb-1"
                  />
                )}
                <p className="font-black text-sm uppercase">{company?.name ?? 'GESTIO 229 BOUTIQUE'}</p>
                {company?.address && <p className="text-[10px] text-slate-500">{company.address}, {company.city || 'Bénin'}</p>}
                <p className="text-[10px] text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
                {company?.phone && <p className="text-[10px] text-slate-500">Tél : {company.phone}</p>}
                <p className="text-[10px] text-slate-500">{formatBeninDateTime(currentSale?.date)}</p>
              </div>

              <div className="border-t border-b border-dashed border-slate-300 py-1.5 space-y-0.5 text-[11px]">
                <p className="font-bold">{modalDocTitle} : {currentSale?.order_number}</p>
                <p className="font-bold text-slate-900">
                  CLIENT : {currentSale?.table_numero ? (currentSale.table_numero.toLowerCase().startsWith('table') ? currentSale.table_numero : `Table ${currentSale.table_numero}`) : (currentSale?.customer_name || 'Client Comptoir')}
                </p>
                {currentSale?.serveur_nom && (
                  <p className="font-black text-rose-700">
                    SERVEUR RESPONSABLE : {currentSale.serveur_nom}
                    <span className="text-[10px] block font-normal text-slate-500">Serveuse responsable : {currentSale.serveur_nom}</span>
                  </p>
                )}
              </div>

              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pb-1">Article</th>
                    <th className="text-center pb-1">Qté</th>
                    <th className="text-right pb-1">P.U.</th>
                    <th className="text-right pb-1">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSale?.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1">{l.product.name}</td>
                      <td className="py-1 text-center font-bold">{l.qty}</td>
                      <td className="py-1 text-right text-slate-600">{fmt(l.unitPrice)}</td>
                      <td className="py-1 text-right font-black">{fmt(l.qty * l.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* SECTION EMBALLAGES TICKET 80 (BRASSERIE UNIQUEMENT) */}
              {(currentSectorSlug === 'brasserie' || currentSectorSlug === 'brasserie-depot-boissons') && currentSale?.emballages_consignes && currentSale.emballages_consignes.length > 0 && (
                <div className="border-t border-dashed border-slate-300 py-1.5 space-y-1 text-[11px]">
                  <p className="font-bold uppercase text-slate-700">📦 Situation Emballages :</p>
                  {currentSale.emballages_consignes.map((emb: any) => (
                    <div key={emb.code} className="flex justify-between text-[10px]">
                      <span>{emb.code} (P:{emb.precedent ?? 0} | F:{emb.facture ?? emb.sortie ?? 0} | R:{emb.rendus ?? emb.retour ?? 0})</span>
                      <span className="font-black text-amber-900">Reste : {emb.reste ?? emb.net_du ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-right">
                <p className="font-black text-sm">TOTAL NET TTC : {fmt(currentSaleFiscalSummary?.netAPayer ?? currentSale?.total_amount ?? 0)}</p>
                <p className="text-[10px] text-slate-500">
                  Dont HT taxable : {fmt(currentSaleFiscalSummary?.totalHtTaxable ?? currentSale?.total_ht ?? 0)}
                </p>
                {(currentSaleFiscalSummary?.totalExonere ?? currentSale?.total_exonere ?? 0) > 0 && (
                  <p className="text-[10px] text-slate-500">
                    Dont Exonéré : {fmt(currentSaleFiscalSummary?.totalExonere ?? currentSale?.total_exonere ?? 0)}
                  </p>
                )}
                <p className="text-[10px] text-slate-500">
                  Dont TVA (18%) : {fmt(currentSaleFiscalSummary?.totalTva ?? currentSale?.total_tva ?? 0)}
                </p>
                {((currentSaleFiscalSummary?.totalAib ?? currentSale?.total_aib ?? 0) > 0) && (
                  <p className="text-[10px] text-amber-800 font-bold">Dont AIB : {fmt(currentSaleFiscalSummary?.totalAib ?? currentSale?.total_aib ?? 0)}</p>
                )}
                <p className="text-[11px] text-slate-600">
                  Mode de règlement : {(() => {
                    const pm = currentSale?.payments?.[0]?.method || (currentSale as any)?.payment_method || 'especes'
                    if (pm === 'momo' || pm === 'MTN_MOMO' || pm === 'MOOV_MONEY' || pm === 'mobile_money') return 'Mobile Money (MoMo)'
                    if (pm === 'cheque') return 'Chèque'
                    if (pm === 'virement') return 'Virement'
                    if (pm === 'credit') return 'À crédit'
                    return 'Espèces'
                  })()}
                </p>
                <p className="text-xs text-emerald-700 font-bold">Montant payé : {fmt(currentSale?.amount_paid || currentSaleFiscalSummary?.totalRegle || 0)}</p>
                {(currentSale?.ancienne_dette_avant_facture || 0) > 0 && (
                  <p className="text-[11px] text-slate-600">Dette ant. : {fmt(currentSale?.ancienne_dette_avant_facture || 0)}</p>
                )}
                {(currentSale?.credit_amount || 0) > 0 && (
                  <p className="text-[11px] text-slate-800 font-bold">Crédit actuel : {fmt(currentSale?.credit_amount || 0)}</p>
                )}
                {(currentSale?.credit_amount > 0 || (currentSale?.ancienne_dette_avant_facture || 0) > 0) && (
                  <div className="border-t border-dashed border-slate-400 pt-1 mt-1">
                    <p className="text-xs text-rose-600 font-black">
                      TOTAL RESTANT DÛ : {fmt(currentSale?.montant_restant_du_global ?? ((currentSale?.ancienne_dette_avant_facture || 0) + (currentSale?.credit_amount || 0)))}
                    </p>
                    {(currentSale?.ancienne_dette_avant_facture || 0) > 0 && (
                      <p className="text-[9px] text-slate-500">
                        ({fmt(currentSale?.ancienne_dette_avant_facture || 0)} + {fmt(currentSale?.credit_amount || 0)})
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="text-center pt-2 border-t border-slate-200 text-[10px] text-slate-600">
                {modalDocTitle.includes('BON DE COMMANDE') ? (
                  <p className="font-bold text-indigo-900 leading-tight">
                    Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande
                  </p>
                ) : (
                  <p>Merci pour votre visite !</p>
                )}
              </div>

              {/* 2ÈME EXEMPLAIRE : PRODUCTION CUISINE & BAR (SI FORMAT DOUBLE CHOISI) */}
              {printFormat === 'ticket80_double' && (
                <div className="pt-6 border-t-2 border-dashed border-slate-800 my-4 space-y-2">
                  <div className="text-center space-y-1">
                    <span className="bg-slate-900 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                      ✂️ 2ÈME EXEMPLAIRE : CUISINE & BAR
                    </span>
                    <div className="text-base font-black text-slate-900">
                      {currentSale?.table_numero ? `TABLE : ${currentSale.table_numero}` : 'COMPTOIR / EMPORTER'}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>Serveur : {currentSale?.serveur_nom || 'Salle'}</span>
                      <span>CMD : {currentSale?.order_number}</span>
                    </div>
                  </div>
                  <table className="w-full text-[10px] border-t border-dashed border-slate-300 pt-1">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left pb-1">Article</th>
                        <th className="text-center pb-1">Qté</th>
                        <th className="text-right pb-1">Poste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentSale?.lines.map((l: any, i: number) => {
                        const cat = ((l.product?.category || l.product?.category_name || '') as string).toLowerCase()
                        const nom = (l.product?.name || '').toLowerCase()
                        const isDrink = cat.includes('boisson') || cat.includes('biere') || cat.includes('vin') || nom.includes('biere') || nom.includes('coca') || nom.includes('eau')
                        return (
                          <tr key={i}>
                            <td className="py-1 font-bold">{l.product?.name}</td>
                            <td className="py-1 text-center font-mono font-black">{l.qty}</td>
                            <td className="py-1 text-right font-black text-[9px]">
                              <span className={clsx('px-1.5 py-0.5 rounded', isDrink ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800')}>
                                {isDrink ? 'BAR' : 'CUISINE'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="text-center pt-2 text-[9px] text-slate-400">
                    <p>Bon de préparation interne</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── BON DE PRÉPARATION CUISINE & BAR (SANS PRIX) ── */
            <div id="bon-preparation-cuisine" className="p-6 bg-white border-2 border-dashed border-rose-300 rounded-2xl max-w-sm mx-auto font-mono text-xs space-y-4 shadow-sm text-slate-900">
              <div className="text-center border-b-2 border-slate-900 pb-3">
                <span className="bg-rose-600 text-white font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                  BON DE PRÉPARATION
                </span>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {currentSale?.table_numero ? `TABLE : ${currentSale.table_numero}` : 'COMPTOIR / EMPORTER'}
                </div>
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 mt-2 px-1">
                  <span>Serveur : {currentSale?.serveur_nom || 'Salle'}</span>
                  <span>Couverts : {currentSale?.couverts || 1}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                  <span>CMD : {currentSale?.order_number}</span>
                  <span>{formatBeninDateTime(currentSale?.date)}</span>
                </div>
              </div>

              {/* LIGNES ARTICLES À PRÉPARER (SANS PRIX) */}
              <div className="space-y-3 py-2">
                <div className="flex justify-between text-[11px] font-black uppercase text-slate-500 border-b pb-1">
                  <span>QTE & ARTICLE</span>
                  <span>POSTE</span>
                </div>
                {((currentSale?.lines || []) as CartItem[]).map((line, idx) => {
                  const cat = ((line.product.category || line.product.category_name || '') as string).toLowerCase()
                  const nom = (line.product.name || '').toLowerCase()
                  const isDrink = cat.includes('boisson') || cat.includes('biere') || cat.includes('vin') ||
                    cat.includes('soda') || cat.includes('bar') || nom.includes('biere') || nom.includes('coca') ||
                    nom.includes('fanta') || nom.includes('castel') || nom.includes('guinness') || nom.includes('eau ')
                  const destination = isDrink ? 'BAR' : 'CUISINE'

                  return (
                    <div key={idx} className="flex justify-between items-start border-b border-dashed border-slate-200 pb-2">
                      <div className="flex items-start gap-2">
                        <span className="font-black text-sm bg-slate-900 text-white px-2 py-0.5 rounded">
                          {line.qty}x
                        </span>
                        <div>
                          <p className="font-black text-xs text-slate-900 leading-tight">
                            {line.product.name}
                          </p>
                          {line.product.unit && (
                            <p className="text-[10px] text-slate-500">{line.product.unit}</p>
                          )}
                        </div>
                      </div>
                      <span className={clsx(
                        'text-[10px] font-black px-2 py-0.5 rounded uppercase',
                        destination === 'CUISINE' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                      )}>
                        {destination}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="border-t-2 border-slate-900 pt-3 text-center text-[10px] text-slate-500">
                <p className="font-bold">ORDRE DE PRÉPARATION INTERNE</p>
                <p>À remettre impérativement au chef de cuisine ou barman</p>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>

      {/* ── MODALE TRANSFERT STOCK MAGASIN -> VENTE (DOUBLE STOCK) ── */}
      {transfertProduct && (
        <TransfertStockModal
          isOpen={!!transfertProduct}
          onClose={() => setTransfertProduct(null)}
          product={transfertProduct}
          companyId={company?.id ?? companyId ?? ''}
          caisseId={activeCaisse?.caisse_id || activeCaisse?.id}
          userId={user?.id}
          onTransferSuccess={handleTransferSuccess}
        />
      )}

      {/* ── MODALE CRÉATION FACTURE D'AVOIR (GLOBAL TOUS SECTEURS + EXTENSION BRASSERIE) ── */}
      <CreerAvoirModal
        isOpen={showAvoirModal}
        onClose={() => {
          setShowAvoirModal(false)
          setSelectedSaleForAvoir(null)
          setSelectedAvoirForConsult(null)
        }}
        onSuccess={(nouvelAvoir) => {
          toast.success("Facture d'Avoir générée", `Avoir ${nouvelAvoir.numero} enregistré avec succès.`)
          loadData()
        }}
        initialFactureId={selectedSaleForAvoir?.id || null}
        initialAvoirRecord={selectedAvoirForConsult}
        currentSectorSlug={currentSectorSlug}
        caisseStatus={{
          isTodayOpen: activeCaisse ? !activeCaisse.is_previous_day : false,
          fond_actuel_especes: Number((activeCaisse as any)?.fond_actuel_especes ?? 0),
          fond_actuel_momo: Number((activeCaisse as any)?.fond_actuel_momo ?? 0)
        }}
        salesList={salesHistory}
        productsList={products}
        customersList={customers}
      />

      {/* ── MODALE BON DE COMMANDE TRANSMIS À LA CAISSE (MODE SÉPARÉ) ── */}
      {transmittedBonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Bon de Commande Transmis</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{transmittedBonModal.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setTransmittedBonModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Fiche ticket Bon de Commande imprimable */}
            <div id="bon-commande-printable" className="p-4 bg-amber-50/40 border border-amber-200 rounded-2xl space-y-3 font-sans text-xs">
              <div className="text-center space-y-0.5 border-b border-amber-200 pb-2">
                <p className="font-black text-slate-900 text-sm">{company?.name || 'GESTIO 229'}</p>
                <p className="text-[11px] text-amber-800 font-bold uppercase tracking-wider">BON DE COMMANDE COMPTOIR</p>
                <p className="font-mono text-xs font-black text-slate-900">{transmittedBonModal.order_number}</p>
                <p className="text-[10px] text-slate-500">{new Date(transmittedBonModal.date).toLocaleString('fr-BJ')}</p>
              </div>

              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Vendeur : <strong>{transmittedBonModal.seller_name}</strong></span>
                <span>Client : <strong>{transmittedBonModal.customer_name}</strong></span>
              </div>

              {/* Lignes d'articles */}
              <table className="w-full text-[11px] border-t border-dashed border-amber-200 pt-2">
                <thead>
                  <tr className="border-b border-amber-200 text-slate-500 font-bold">
                    <th className="text-left pb-1">Article</th>
                    <th className="text-center pb-1">Qté</th>
                    <th className="text-right pb-1">Prix</th>
                    <th className="text-right pb-1">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {transmittedBonModal.lines.map((l: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-1 text-slate-900 font-medium">{l.product.name}</td>
                      <td className="py-1 text-center font-mono font-bold">{l.qty}</td>
                      <td className="py-1 text-right font-mono">{fmt(l.unitPrice)}</td>
                      <td className="py-1 text-right font-mono font-black">{fmt(l.qty * l.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-amber-300 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                <span>TOTAL À ENCAISSER :</span>
                <span className="text-amber-700 font-mono text-base">{fmt(transmittedBonModal.total_ttc)}</span>
              </div>

              <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-xl text-center text-amber-900 font-bold text-[11px]">
                👉 Veuillez inviter le client à présenter ce bon au guichet caisse pour le règlement.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  window.print()
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer le Bon</span>
              </button>
              <button
                type="button"
                onClick={() => setTransmittedBonModal(null)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition"
              >
                Nouvelle commande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE SUIVI DES BONS EN ATTENTE POUR LE VENDEUR & LA CAISSE ── */}
      {mesBonsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] shadow-2xl border border-slate-100 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Bons de Commande en Attente d'Encaissement</h3>
                  <p className="text-[11px] text-slate-400">Liste des bons transmis à la caisse pour le secteur</p>
                </div>
              </div>
              <button
                onClick={() => setMesBonsModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingMesBons ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                  <span>Chargement des bons en cours...</span>
                </div>
              ) : mesBonsList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Aucun bon en attente d'encaissement pour ce secteur.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">N° Bon</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Vendeur</th>
                        <th className="p-3">Client</th>
                        <th className="p-3 text-right">Montant Total</th>
                        <th className="p-3 text-right">Reste à payer</th>
                        <th className="p-3 text-center">Statut</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {mesBonsList.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-3 font-bold text-slate-900">{b.order_number}</td>
                          <td className="p-3 font-sans text-slate-500 text-[11px]">
                            {new Date(b.created_at).toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-3 font-sans text-slate-700 text-xs font-semibold">
                            {b.seller_name || 'Vendeur'}
                          </td>
                          <td className="p-3 font-sans text-slate-800 font-medium">{b.customer_name}</td>
                          <td className="p-3 text-right font-bold text-slate-900">{fmt(b.total_amount)}</td>
                          <td className="p-3 text-right font-black text-amber-700">{fmt(b.remaining_balance)}</td>
                          <td className="p-3 text-center font-sans">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              {b.remaining_balance < b.total_amount ? 'Partiellement payé' : 'En attente de caisse'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-sans">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleLoadBonIntoCart(b)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                                title="Charger la commande dans le panier POS pour finaliser la vente"
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                <span>Charger POS</span>
                              </button>
                              <button
                                onClick={() => {
                                  setTransmittedBonModal({
                                    order_number: b.order_number,
                                    date: b.created_at,
                                    customer_name: b.customer_name,
                                    seller_name: b.seller_name || user?.full_name || 'Vendeur',
                                    lines: b.items.map(i => ({
                                      product: { name: i.product_name },
                                      qty: i.quantity,
                                      unitPrice: i.unit_price
                                    })),
                                    total_ttc: b.total_amount
                                  })
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-flex items-center gap-1"
                                title="Réimprimer le bon pour le client"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Revoir</span>
                              </button>
                              <button
                                onClick={() => handleCancelBon(b)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1"
                                title="Annuler ce bon de commande"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Annuler</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMesBonsModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default POSPage
