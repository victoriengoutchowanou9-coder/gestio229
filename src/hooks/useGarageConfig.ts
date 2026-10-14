// =============================================================================
// GESTIO 229 SaaS — Hook useGarageConfig
// Gère la détection, sélection et persistance des 2 versions métier du secteur garage
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTenant } from './useTenant'
import { getGarageVersionMode, setGarageVersionMode, GarageVersionMode } from '../services/garageService'

export function useGarageConfig() {
  const { company, setCompany } = useAuthStore()
  const { companyId } = useTenant()

  const [versionMode, setVersionMode] = useState<GarageVersionMode | null>(() => {
    if (!companyId) return null
    const stored = (company as any)?.garage_version_mode || localStorage.getItem(`gestio229_garage_mode_${companyId}`)
    return (stored === 'CLASSIC' || stored === 'BTP_MULTISITE') ? stored : null
  })

  const [loading, setLoading] = useState(true)

  // Synchronisation avec la base de données
  useEffect(() => {
    let isMounted = true
    async function fetchMode() {
      if (!companyId) {
        setLoading(false)
        return
      }
      try {
        const mode = await getGarageVersionMode(companyId)
        if (isMounted) {
          setVersionMode(mode)
        }
      } catch (err) {
        console.warn('[useGarageConfig] Erreur lecture mode:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchMode()
    return () => { isMounted = false }
  }, [companyId])

  // Synchronisation avec l'état company du store Zustand
  useEffect(() => {
    const compMode = (company as any)?.garage_version_mode
    if (compMode && (compMode === 'CLASSIC' || compMode === 'BTP_MULTISITE')) {
      setVersionMode(compMode)
    }
  }, [company])

  const selectVersion = useCallback(async (mode: GarageVersionMode): Promise<boolean> => {
    if (!companyId) return false
    setLoading(true)
    try {
      const ok = await setGarageVersionMode(companyId, mode)
      if (ok) {
        setVersionMode(mode)
        if (company && typeof setCompany === 'function') {
          setCompany({
            ...company,
            garage_version_mode: mode
          } as any)
        }
      }
      return ok
    } finally {
      setLoading(false)
    }
  }, [companyId, company, setCompany])

  const reload = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const mode = await getGarageVersionMode(companyId)
      setVersionMode(mode)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  return {
    versionMode,
    isClassic: versionMode === 'CLASSIC',
    isBtp: versionMode === 'BTP_MULTISITE',
    hasChosenVersion: Boolean(versionMode),
    loading,
    selectVersion,
    reload
  }
}

export default useGarageConfig
