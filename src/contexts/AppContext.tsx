// =============================================================================
// GESTIO 229 SaaS — Contexte Global Application & Secteur Actif (HUB)
// Fournit companyId, secteurActif, caisseActive, user pour tous les modules
// =============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTenant } from '../hooks/useTenant'
import { getActiveSectorSlug, getActiveSectorMeta } from '../lib/sectorClient'
import { supabase } from '../lib/supabase'
import { getOrCreateSectorCaisse } from '../services/caisseSectorService'
import { getOrCreateSecteurBDD, getSoldeFondActuel, SecteurRecord, CaisseRecord } from '../services/caisseDepensesService'

export interface AppContextType {
  companyId: string
  company: any
  secteurActif: {
    id: string
    nom: string
    slug: string
  }
  caisseActive: {
    id: string
    nom: string
    code?: string
    solde_actuel?: number
  }
  user: any
  fondsActuels: Record<string, number>
  refreshFonds: () => Promise<void>
  setSecteurActif: (secteur: { id: string; nom: string; slug: string }) => void
  setCaisseActive: (caisse: { id: string; nom: string; code?: string; solde_actuel?: number }) => void
}

const AppContext = createContext<AppContextType | null>(null)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { company, user } = useAuthStore()
  const { sectorSlug: tenantSectorSlug, companyId: tenantCompanyId } = useTenant()

  const activeCompanyId = tenantCompanyId || company?.id || ''
  const activeSlug = (tenantSectorSlug || getActiveSectorSlug() || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const meta = getActiveSectorMeta()

  const [secteurActif, setSecteurActifState] = useState<{ id: string; nom: string; slug: string }>(() => {
    const storedId = typeof window !== 'undefined' ? localStorage.getItem('secteur_actif_id') : null
    const storedNom = typeof window !== 'undefined' ? localStorage.getItem('secteur_actif_nom') : null
    const storedSlug = typeof window !== 'undefined' ? localStorage.getItem('secteur_actif_slug') : null
    if (storedId && storedSlug === activeSlug) {
      return { id: storedId, nom: storedNom || meta?.name || activeSlug, slug: activeSlug }
    }
    return {
      id: `00000000-0000-4000-8000-${activeSlug.slice(0, 12).padEnd(12, '0')}`,
      nom: meta?.name || meta?.label || (activeSlug.charAt(0).toUpperCase() + activeSlug.slice(1)),
      slug: activeSlug,
    }
  })

  const setSecteurActif = (sec: { id: string; nom: string; slug: string }) => {
    setSecteurActifState(sec)
    try {
      localStorage.setItem('secteur_actif_id', sec.id)
      localStorage.setItem('secteur_actif_nom', sec.nom)
      localStorage.setItem('secteur_actif_slug', sec.slug)
    } catch (_) {}
  }

  const [caisseActive, setCaisseActive] = useState<{ id: string; nom: string; code?: string; solde_actuel?: number }>({
    id: `00000000-0000-4000-9000-${activeSlug.slice(0, 12).padEnd(12, '0')}`,
    nom: `Caisse ${activeSlug.toUpperCase()}`,
    code: `CS-${activeSlug.slice(0, 4).toUpperCase()}`,
    solde_actuel: 0,
  })

  const [fondsActuels, setFondsActuels] = useState<Record<string, number>>({
    espece: 0,
    mtn_momo: 0,
    moov: 0,
    banque: 0,
    orange_money: 0,
  })

  // Synchronisation secteur BDD
  useEffect(() => {
    if (!activeCompanyId) return

    let isMounted = true
    const initSectorAndCaisse = async () => {
      try {
        const nom = meta?.name || meta?.label || (activeSlug.charAt(0).toUpperCase() + activeSlug.slice(1))
        const secRecord = await getOrCreateSecteurBDD(activeCompanyId, activeSlug, nom)
        if (isMounted && secRecord) {
          setSecteurActif({
            id: secRecord.id,
            nom: secRecord.nom,
            slug: secRecord.slug,
          })
        }

        const sectorCaisse = await getOrCreateSectorCaisse(activeCompanyId, activeSlug)
        if (isMounted && sectorCaisse) {
          setCaisseActive({
            id: sectorCaisse.id,
            nom: sectorCaisse.nom || `Caisse ${activeSlug.toUpperCase()}`,
            code: sectorCaisse.code,
            solde_actuel: Number(sectorCaisse.solde_actuel) || 0,
          })
        }
      } catch (err) {
        console.warn('[AppContext] Synchronisation secteur/caisse notice:', err)
      }
    }

    initSectorAndCaisse()
    return () => { isMounted = false }
  }, [activeCompanyId, activeSlug, meta?.name, meta?.label])

  // Synchronisation des fonds actuels
  const refreshFonds = useCallback(async () => {
    if (!activeCompanyId || !secteurActif.id) return

    const modes = ['espece', 'mtn_momo', 'moov', 'banque', 'orange_money']
    const newFonds: Record<string, number> = {}

    await Promise.all(
      modes.map(async (m) => {
        const val = await getSoldeFondActuel(activeCompanyId, secteurActif.id, caisseActive.id, m)
        newFonds[m] = val
      })
    )

    setFondsActuels(newFonds)
  }, [activeCompanyId, secteurActif.id, caisseActive.id])

  useEffect(() => {
    refreshFonds()
  }, [refreshFonds])

  const value = useMemo(
    () => ({
      companyId: activeCompanyId,
      company,
      secteurActif,
      caisseActive,
      user,
      fondsActuels,
      refreshFonds,
      setSecteurActif,
      setCaisseActive,
    }),
    [activeCompanyId, company, secteurActif, caisseActive, user, fondsActuels, refreshFonds]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/**
 * Hook central useAppContext : utilisable partout en toute sécurité
 * Si utilisé en dehors de <AppProvider>, fournit une valeur par défaut cohérente
 */
export const useAppContext = (): AppContextType => {
  const ctx = useContext(AppContext)
  if (ctx) return ctx

  // Fallback direct sur AuthStore et Tenant pour ne jamais crasher
  const auth = useAuthStore.getState()
  const activeSlug = (getActiveSectorSlug() || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const meta = getActiveSectorMeta()
  const companyId = auth.company?.id || ''

  return {
    companyId,
    company: auth.company,
    secteurActif: {
      id: `00000000-0000-4000-8000-${activeSlug.slice(0, 12).padEnd(12, '0')}`,
      nom: meta?.name || meta?.label || (activeSlug.charAt(0).toUpperCase() + activeSlug.slice(1)),
      slug: activeSlug,
    },
    caisseActive: {
      id: `00000000-0000-4000-9000-${activeSlug.slice(0, 12).padEnd(12, '0')}`,
      nom: `Caisse ${activeSlug.toUpperCase()}`,
      code: `CS-${activeSlug.slice(0, 4).toUpperCase()}`,
      solde_actuel: 0,
    },
    user: auth.user,
    fondsActuels: { espece: 0, mtn_momo: 0, moov: 0, banque: 0, orange_money: 0 },
    refreshFonds: async () => {},
    setSecteurActif: () => {},
    setCaisseActive: () => {},
  }
}
