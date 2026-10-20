// =============================================================================
// GESTIO 229 SaaS — Hook useSalesCircuitConfig
// Gère la configuration du circuit de vente et d'encaissement PAR SECTEUR
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTenant } from './useTenant'
import {
  getSalesCircuitMode,
  setSalesCircuitMode,
  getPendingBonsCount,
  isSectorCircuitSeparated,
  normalizeCircuitSectorSlug,
  SalesCircuitMode
} from '../services/salesCircuitService'

export function useSalesCircuitConfig(sectorSlugOverride?: string) {
  const { company } = useAuthStore()
  const { companyId, sectorSlug: tenantSectorSlug, currentSectorSlug: activeTenantSlug } = useTenant()
  const activeCompanyId = companyId || company?.id || ''

  const resolvedSector = sectorSlugOverride || activeTenantSlug || tenantSectorSlug || ''
  const cleanSectorSlug = normalizeCircuitSectorSlug(resolvedSector)

  const [circuitMode, setCircuitMode] = useState<SalesCircuitMode>(() => {
    if (!activeCompanyId) return 'INTEGRE'
    const isSep = isSectorCircuitSeparated(cleanSectorSlug, company)
    return isSep ? 'SEPARE_VENDEUR_CAISSIERE' : 'INTEGRE'
  })

  const [pendingCount, setPendingCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)

  const loadConfig = useCallback(async () => {
    if (!activeCompanyId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [mode, count] = await Promise.all([
        getSalesCircuitMode(activeCompanyId, cleanSectorSlug),
        getPendingBonsCount(activeCompanyId, cleanSectorSlug)
      ])
      setCircuitMode(mode)
      setPendingCount(count)
    } catch (err) {
      console.warn('[useSalesCircuitConfig] Erreur chargement configuration secteur:', err)
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, cleanSectorSlug])

  useEffect(() => {
    loadConfig()

    const handleCircuitChange = (e: any) => {
      const matchComp = e?.detail?.companyId === activeCompanyId
      const targetSec = e?.detail?.sectorSlug
      const matchSec = !targetSec || targetSec === cleanSectorSlug || !cleanSectorSlug
      if (matchComp && matchSec && e?.detail?.mode) {
        setCircuitMode(e.detail.mode)
      }
    }

    const handleBonEvent = () => {
      if (activeCompanyId) {
        getPendingBonsCount(activeCompanyId, cleanSectorSlug).then(setPendingCount).catch(() => {})
      }
    }

    window.addEventListener('gestio:sales_circuit_changed', handleCircuitChange)
    window.addEventListener('gestio:bon_transmitted', handleBonEvent)
    window.addEventListener('gestio:bon_encaisse', handleBonEvent)
    window.addEventListener('gestio:bon_annule', handleBonEvent)

    return () => {
      window.removeEventListener('gestio:sales_circuit_changed', handleCircuitChange)
      window.removeEventListener('gestio:bon_transmitted', handleBonEvent)
      window.removeEventListener('gestio:bon_encaisse', handleBonEvent)
      window.removeEventListener('gestio:bon_annule', handleBonEvent)
    }
  }, [loadConfig, activeCompanyId, cleanSectorSlug])

  const selectMode = useCallback(async (newMode: SalesCircuitMode): Promise<{ success: boolean; error?: string }> => {
    if (!activeCompanyId) return { success: false, error: 'Entreprise non définie' }
    const res = await setSalesCircuitMode(activeCompanyId, newMode, cleanSectorSlug)
    if (res.success) {
      setCircuitMode(newMode)
    }
    return res
  }, [activeCompanyId, cleanSectorSlug])

  return {
    circuitMode,
    isIntegrated: circuitMode === 'INTEGRE',
    isSeparated: circuitMode === 'SEPARE_VENDEUR_CAISSIERE',
    pendingCount,
    loading,
    selectMode,
    reload: loadConfig,
    currentSectorSlug: cleanSectorSlug
  }
}
