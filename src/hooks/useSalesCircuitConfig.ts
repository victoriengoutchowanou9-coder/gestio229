// =============================================================================
// GESTIO 229 SaaS — Hook useSalesCircuitConfig
// Gère la configuration du circuit de vente et d'encaissement par entreprise
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTenant } from './useTenant'
import {
  getSalesCircuitMode,
  setSalesCircuitMode,
  getPendingBonsCount,
  SalesCircuitMode
} from '../services/salesCircuitService'

export function useSalesCircuitConfig() {
  const { company } = useAuthStore()
  const { companyId } = useTenant()
  const activeCompanyId = companyId || company?.id || ''

  const [circuitMode, setCircuitMode] = useState<SalesCircuitMode>(() => {
    if (!activeCompanyId) return 'INTEGRE'
    const stored = (company as any)?.sales_circuit_mode || localStorage.getItem(`gestio229_sales_circuit_${activeCompanyId}`)
    return (stored === 'SEPARE_VENDEUR_CAISSIERE') ? 'SEPARE_VENDEUR_CAISSIERE' : 'INTEGRE'
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
        getSalesCircuitMode(activeCompanyId),
        getPendingBonsCount(activeCompanyId)
      ])
      setCircuitMode(mode)
      setPendingCount(count)
    } catch (err) {
      console.warn('[useSalesCircuitConfig] Erreur chargement configuration:', err)
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId])

  useEffect(() => {
    loadConfig()

    const handleCircuitChange = (e: any) => {
      if (e?.detail?.companyId === activeCompanyId && e?.detail?.mode) {
        setCircuitMode(e.detail.mode)
      }
    }

    const handleBonEvent = () => {
      if (activeCompanyId) {
        getPendingBonsCount(activeCompanyId).then(setPendingCount).catch(() => {})
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
  }, [loadConfig, activeCompanyId])

  const selectMode = useCallback(async (newMode: SalesCircuitMode): Promise<{ success: boolean; error?: string }> => {
    if (!activeCompanyId) return { success: false, error: 'Entreprise non définie' }
    const res = await setSalesCircuitMode(activeCompanyId, newMode)
    if (res.success) {
      setCircuitMode(newMode)
    }
    return res
  }, [activeCompanyId])

  return {
    circuitMode,
    isIntegrated: circuitMode === 'INTEGRE',
    isSeparated: circuitMode === 'SEPARE_VENDEUR_CAISSIERE',
    pendingCount,
    loading,
    selectMode,
    reload: loadConfig
  }
}
