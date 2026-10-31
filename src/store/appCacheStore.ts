// =============================================================================
// GESTIO 229 SaaS — Store Global de Données & Cache Stale-While-Revalidate
// =============================================================================
// Charge au démarrage les données essentielles (articles/produits, clients,
// fournisseurs, devises, paramètres) et les maintient en mémoire.
// Chaque module lit ce cache instantanément (< 50ms) puis met à jour en arrière-plan.
// =============================================================================

import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface AppCacheState {
  // Données globales
  products: any[]
  clients: any[]
  fournisseurs: any[]
  sectors: any[]
  statsSummary: Record<string, any>
  
  // Timestamps pour stale-while-revalidate
  loadedAt: Record<string, number>
  isPreloading: boolean
  
  // Mémorisation du dernier module visité
  lastVisitedModule: string | null
  visitedHistory: string[]

  // Actions
  setLastVisitedModule: (modulePath: string) => void
  preloadEssentialData: (companyId: string) => Promise<void>
  refreshModuleDataSilently: (companyId: string, key: 'products' | 'clients' | 'fournisseurs') => Promise<void>
  getCached: <T>(key: 'products' | 'clients' | 'fournisseurs') => T[]
}

const STALE_TIME = 120 * 1000 // 2 minutes avant refresh silencieux

export const useAppCacheStore = create<AppCacheState>((set, get) => ({
  products: [],
  clients: [],
  fournisseurs: [],
  sectors: [],
  statsSummary: {},
  loadedAt: {},
  isPreloading: false,
  lastVisitedModule: null,
  visitedHistory: [],

  setLastVisitedModule: (modulePath: string) => {
    set((state) => {
      const history = [modulePath, ...state.visitedHistory.filter((h) => h !== modulePath)].slice(0, 10)
      return { lastVisitedModule: modulePath, visitedHistory: history }
    })
  },

  getCached: (key) => {
    return get()[key] || []
  },

  preloadEssentialData: async (companyId: string) => {
    if (!companyId || get().isPreloading) return
    set({ isPreloading: true })

    try {
      // 1. Lire d'abord depuis localStorage pour un affichage instantané à 0ms
      try {
        const localProd = localStorage.getItem(`gestio_fast_products_${companyId}`)
        const localCli = localStorage.getItem(`gestio_fast_clients_${companyId}`)
        const localFourn = localStorage.getItem(`gestio_fast_fournisseurs_${companyId}`)
        if (localProd) set({ products: JSON.parse(localProd) })
        if (localCli) set({ clients: JSON.parse(localCli) })
        if (localFourn) set({ fournisseurs: JSON.parse(localFourn) })
      } catch (_) {}

      // 2. Fetch silencieux en arrière-plan (stale-while-revalidate)
      const [prodRes, cliRes, fournRes] = await Promise.allSettled([
        supabase
          .from('products')
          .select('id, name, reference, sale_price, purchase_price, current_stock, category, unit, barcode')
          .eq('company_id', companyId)
          .limit(1000),
        supabase
          .from('clients')
          .select('id, nom, telephone, adresse, solde_du, plafond_credit')
          .eq('company_id', companyId)
          .limit(500),
        supabase
          .from('fournisseurs')
          .select('id, nom, telephone, email, adresse')
          .eq('company_id', companyId)
          .limit(500),
      ])

      const updates: Partial<AppCacheState> = {
        loadedAt: {
          ...get().loadedAt,
          products: Date.now(),
          clients: Date.now(),
          fournisseurs: Date.now(),
        },
        isPreloading: false,
      }

      if (prodRes.status === 'fulfilled' && prodRes.value.data) {
        updates.products = prodRes.value.data
        try {
          localStorage.setItem(`gestio_fast_products_${companyId}`, JSON.stringify(prodRes.value.data))
        } catch (_) {}
      }

      if (cliRes.status === 'fulfilled' && cliRes.value.data) {
        updates.clients = cliRes.value.data
        try {
          localStorage.setItem(`gestio_fast_clients_${companyId}`, JSON.stringify(cliRes.value.data))
        } catch (_) {}
      }

      if (fournRes.status === 'fulfilled' && fournRes.value.data) {
        updates.fournisseurs = fournRes.value.data
        try {
          localStorage.setItem(`gestio_fast_fournisseurs_${companyId}`, JSON.stringify(fournRes.value.data))
        } catch (_) {}
      }

      set(updates)
    } catch (err) {
      console.warn('[CacheStore] Préchargement silencieux:', err)
      set({ isPreloading: false })
    }
  },

  refreshModuleDataSilently: async (companyId: string, key: 'products' | 'clients' | 'fournisseurs') => {
    if (!companyId) return
    const lastLoad = get().loadedAt[key] || 0
    if (Date.now() - lastLoad < STALE_TIME) return // Pas besoin de re-fetcher si frais

    try {
      if (key === 'products') {
        const { data } = await supabase
          .from('products')
          .select('id, name, reference, sale_price, purchase_price, current_stock, category, unit, barcode')
          .eq('company_id', companyId)
          .limit(1000)
        if (data) {
          set({ products: data, loadedAt: { ...get().loadedAt, products: Date.now() } })
          try { localStorage.setItem(`gestio_fast_products_${companyId}`, JSON.stringify(data)) } catch (_) {}
        }
      } else if (key === 'clients') {
        const { data } = await supabase
          .from('clients')
          .select('id, nom, telephone, adresse, solde_du, plafond_credit')
          .eq('company_id', companyId)
          .limit(500)
        if (data) {
          set({ clients: data, loadedAt: { ...get().loadedAt, clients: Date.now() } })
          try { localStorage.setItem(`gestio_fast_clients_${companyId}`, JSON.stringify(data)) } catch (_) {}
        }
      } else if (key === 'fournisseurs') {
        const { data } = await supabase
          .from('fournisseurs')
          .select('id, nom, telephone, email, adresse')
          .eq('company_id', companyId)
          .limit(500)
        if (data) {
          set({ fournisseurs: data, loadedAt: { ...get().loadedAt, fournisseurs: Date.now() } })
          try { localStorage.setItem(`gestio_fast_fournisseurs_${companyId}`, JSON.stringify(data)) } catch (_) {}
        }
      }
    } catch (_) {}
  },
}))
