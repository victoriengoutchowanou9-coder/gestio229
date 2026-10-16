// =============================================================================
// GESTIO 229 SaaS — AuthContext & useAuth Provider
// =============================================================================

import React, { createContext, useContext, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { UserProfile, Company } from '@/types/tenant'

export interface AuthContextType {
  user: UserProfile | null
  company: Company | null
  status: string
  supabase: typeof supabase
  login: (identifier: string, pass: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>
  logout: () => Promise<void>
  setCompany: (c: Company | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, company, status, login, logout, setCompany, initialize } = useAuthStore()

  useEffect(() => {
    if (status === 'idle') {
      initialize()
    }
  }, [status, initialize])

  const value: AuthContextType = {
    user,
    company,
    status,
    supabase,
    login,
    logout,
    setCompany,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // Fallback direct sur authStore
    const store = useAuthStore()
    return {
      user: store.user,
      company: store.company,
      status: store.status,
      supabase,
      login: store.login,
      logout: store.logout,
      setCompany: store.setCompany,
    }
  }
  return ctx
}

export { supabase }
export default AuthContext
