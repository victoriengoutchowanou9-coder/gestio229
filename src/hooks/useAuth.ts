// =============================================================================
// GESTIO 229 SaaS — Hook useAuth universel
// =============================================================================
import { useAuthStore } from '../store/authStore'
import type { UserProfile, Company } from '../types/tenant'

export interface UseAuthReturn {
  user: UserProfile | null
  loading: boolean
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error'
  company: Company | null
  setCompany: (company: Company | null) => void
  login: (identifier: string, password: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>
  logout: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const { user, status, company, setCompany, login, logout } = useAuthStore()
  return {
    user: user ?? null,
    loading: status === 'idle' || status === 'loading',
    status,
    company,
    setCompany,
    login,
    logout,
  }
}

export default useAuth
