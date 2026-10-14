// =============================================================================
// GESTIO 229 SaaS — Hook useEcoleConfig
// Gère la détection, sélection et persistance des 3 profils d'établissement scolaire & formation
// (SCOLAIRE, FORMATION_PRO, MIXTE)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTenant } from './useTenant'
import { getEcoleTypeEtablissement, setEcoleTypeEtablissement, EcoleTypeEtablissement } from '../services/ecoleService'

export function useEcoleConfig() {
  const { company, setCompany } = useAuthStore()
  const { companyId } = useTenant()

  const [typeEtablissement, setTypeEtablissement] = useState<EcoleTypeEtablissement | null>(() => {
    if (!companyId) return null
    const stored = (company as any)?.ecole_type_etablissement || localStorage.getItem(`gestio229_ecole_type_${companyId}`)
    return (stored === 'SCOLAIRE' || stored === 'FORMATION_PRO' || stored === 'MIXTE') ? stored : null
  })

  const [loading, setLoading] = useState(true)

  // Synchronisation avec la base de données
  useEffect(() => {
    let isMounted = true
    async function fetchType() {
      if (!companyId) {
        setLoading(false)
        return
      }
      try {
        const type = await getEcoleTypeEtablissement(companyId)
        if (isMounted) {
          setTypeEtablissement(type)
        }
      } catch (err) {
        console.warn('[useEcoleConfig] Erreur lecture type:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchType()
    return () => { isMounted = false }
  }, [companyId])

  const selectType = useCallback(async (type: EcoleTypeEtablissement): Promise<boolean> => {
    if (!companyId) return false
    setLoading(true)
    try {
      const ok = await setEcoleTypeEtablissement(companyId, type)
      if (ok) {
        setTypeEtablissement(type)
        if (company) {
          setCompany({
            ...company,
            ecole_type_etablissement: type
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
      const type = await getEcoleTypeEtablissement(companyId)
      setTypeEtablissement(type)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  return {
    typeEtablissement,
    isScolaire: typeEtablissement === 'SCOLAIRE',
    isFormationPro: typeEtablissement === 'FORMATION_PRO',
    isMixte: typeEtablissement === 'MIXTE',
    hasChosenProfile: Boolean(typeEtablissement),
    loading,
    selectType,
    reload
  }
}

export default useEcoleConfig
