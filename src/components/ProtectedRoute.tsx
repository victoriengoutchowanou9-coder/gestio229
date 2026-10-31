// =============================================================================
// GESTIO 229 SaaS — Composant ProtectedRoute & PrivateRoute
// =============================================================================

import React, { useEffect } from 'react'
import { useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import HubSkeleton from './ui/HubSkeleton'
import { ModuleSkeleton } from './ui/Skeleton'

/**
 * ProtectedRoute / PrivateRoute :
 * Vérifie l'authentification et autorise l'accès aux sous-logiciels et au HUB.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, status, company, setCompany } = useAuth()
  const location = useLocation()

  // Vérification dynamique en arrière-plan du statut de l'entreprise côté serveur (debounce 60s)
  useEffect(() => {
    if (company?.id && status === 'authenticated') {
      const cacheKey = `__gestio_company_check_${company.id}`
      const lastCheck = parseInt(sessionStorage.getItem(cacheKey) || '0', 10)
      const now = Date.now()
      if (now - lastCheck < 60000) return

      try {
        if (supabase && typeof supabase.from === 'function') {
          sessionStorage.setItem(cacheKey, String(now))
          supabase
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
  }, [company?.id, status])

  if (loading) {
    return location.pathname.includes('/hub') ? <HubSkeleton /> : <ModuleSkeleton />
  }

  if (status === 'unauthenticated' || status === 'error' || !user) {
    return <Navigate to="/login" replace />
  }

  // RÈGLE GESTIO 229 : Les utilisateurs internes (caissiers, magasiniers, vendeurs, comptables)
  // n'ont AUCUNE confirmation email requise.
  const isAdmin = user?.role === 'administrateur' || user?.role === 'super_admin'
  if (isAdmin && (user as any)?.email_confirmed_at === null) {
    return <Navigate to="/confirm-email" replace state={{ email: user?.email }} />
  }

  // Règle de sécurité absolue : si l'entreprise est bloquée, suspendue ou supprimée
  if (
    company?.subscription_status === 'suspended' ||
    company?.subscription_status === 'deleted' ||
    company?.is_active === false
  ) {
    return <Navigate to="/suspended" replace />
  }

  return <>{children}</>
}

export { ProtectedRoute }
export const PrivateRoute = ProtectedRoute
