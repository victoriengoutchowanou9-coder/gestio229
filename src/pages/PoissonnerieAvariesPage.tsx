// =============================================================================
// GESTIO 229 — Poissonnerie & Produits Frais : Avaries Frigorifiques
// Compatible avec les spécifications et vérifications Poissonnerie
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../hooks/useTenant'
import { useUIStore } from '../store/uiStore'
import { TableMissingVerifier } from './dashboard/sector-modules/TableMissingVerifier'
import { SectorModulePage } from './dashboard/sector-modules/SectorModulePage'
import { MODULE_CONFIGS, fmtMoney } from './dashboard/sector-modules/moduleConfigs'

export const PoissonnerieAvariesPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any
  const [tableMissing, setTableMissing] = useState(false)
  const [checking, setChecking] = useState(true)

  const checkTableExists = useCallback(async () => {
    setChecking(true)
    try {
      const { error } = await supabase.from('poissonnerie_avaries').select('id').limit(1)
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        setTableMissing(true)
      } else {
        setTableMissing((wasMissing) => {
          if (wasMissing && toast?.success) {
            toast.success('Module activé avec succès !')
          }
          return false
        })
      }
    } catch (e: any) {
      if (e?.code === '42P01' || e?.message?.includes('does not exist')) {
        setTableMissing(true)
      }
    } finally {
      setChecking(false)
    }
  }, [toast])

  useEffect(() => {
    checkTableExists()
  }, [checkTableExists])

  // Rendu direct via le module existant ou vue autonome
  return <SectorModulePage moduleId="avaries_peremption" />
}

export default PoissonnerieAvariesPage
