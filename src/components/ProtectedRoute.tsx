// =============================================================================
// GESTIO 229 SaaS — Composant ProtectedRoute & PrivateRoute
// =============================================================================

import React, { useEffect } from 'react'
import { useLocation, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '@/lib/supabase'
import HubSkeleton from './ui/HubSkeleton'
import { ModuleSkeleton } from './ui/Skeleton'

/**
 * ProtectedRoute / PrivateRoute :
 * Affiche immédiatement un squelette léger (HubSkeleton ou ModuleSkeleton) sans spinner plein écran.
 * Si pas de session => redirige vers /login.
 */
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, company, setCompany } = useAuthStore()
  const location = useLocation()
  const isLoading = status === 'idle' || status === 'loading'

  // Vérification dynamique en arrière-plan du statut de l'entreprise côté serveur
  useEffect(() => {
    if (company?.id && status === 'authenticated') {
      try {
        const client = typeof supabase !== 'undefined' ? supabase : (typeof window !== 'undefined' ? (window as any).supabase : null)
        if (client && typeof client.from === 'function') {
          client
            .from('companies')
            .select('subscription_status, is_active, suspension_reason')
            .eq('id', company.id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data) {
                if (
                  data.subscription_status !== company.subscription_status ||
                  data.is_active !== company.is_active ||
                  data.suspension_reason !== (company as any).suspension_reason
                ) {
                  setCompany({
                    ...company,
                    subscription_status: data.subscription_status,
                    is_active: data.is_active,
                    suspension_reason: data.suspension_reason,
                  } as any)
                }
              }
            })
            .catch(() => {})
        }
      } catch (err) {
        console.warn('[ProtectedRoute] Company status check skipped:', err)
      }
    }
  }, [location.pathname, company?.id, status])

  if (isLoading) {
    return location.pathname.includes('/hub') ? <HubSkeleton /> : <ModuleSkeleton />
  }
  if (status === 'unauthenticated' || status === 'error') return <Navigate to="/login" replace />

  // Règle de sécurité absolue : si l'entreprise est bloquée, suspendue ou supprimée, interdire l'accès immédiat
  if (
    company?.subscription_status === 'suspended' ||
    company?.subscription_status === 'deleted' ||
    company?.is_active === false
  ) {
    return <Navigate to="/suspended" replace />
  }

  return <>{children}</>
}

export const PrivateRoute = ProtectedRoute
export default ProtectedRoute
