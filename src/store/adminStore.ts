// =============================================================================
// GESTIO 229 ADMIN — Store Zustand : Admin Auth
// Gestion de la session Super Admin côté frontend
// Le token est stocké en MÉMOIRE et sessionStorage uniquement (jamais localStorage)
// =============================================================================

import { create } from 'zustand'

export interface AdminSessionState {
  token: string | null
  expiresAt: number | null
  isAuthenticated: boolean
  isLoading: boolean
  errorMessage: string | null

  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  checkSession: () => boolean
  clearError: () => void
}

const SESSION_KEY = 'gestio229_admin_session'

// ─── Lecture de la session depuis sessionStorage ──────────────────────────
function readSession(): { token: string; expiresAt: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.token || !parsed.expiresAt) return null
    if (parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// ─── Écriture de la session ───────────────────────────────────────────────
function writeSession(token: string, expiresAt: number) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt }))
  } catch (_) {}
}

// ─── Suppression de la session ────────────────────────────────────────────
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch (_) {}
}

// ─── Store Zustand ─────────────────────────────────────────────────────────
const persisted = readSession()

export const useAdminStore = create<AdminSessionState>()((set, get) => ({
  token: persisted?.token || null,
  expiresAt: persisted?.expiresAt || null,
  isAuthenticated: !!persisted?.token,
  isLoading: false,
  errorMessage: null,

  // ─── Connexion Super Admin ──────────────────────────────────────────────
  login: async (username: string, password: string) => {
    set({ isLoading: true, errorMessage: null })
    try {
      const response = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok || !data.success || !data.token) {
        const errMsg = data.error || 'Identifiant ou mot de passe incorrect.'
        set({ isLoading: false, errorMessage: errMsg, isAuthenticated: false })
        return { success: false, error: errMsg }
      }

      writeSession(data.token, data.expiresAt)
      set({
        token: data.token,
        expiresAt: data.expiresAt,
        isAuthenticated: true,
        isLoading: false,
        errorMessage: null,
      })
      return { success: true }
    } catch (err: any) {
      const msg = 'Erreur de connexion. Vérifiez votre connexion internet.'
      set({ isLoading: false, errorMessage: msg, isAuthenticated: false })
      return { success: false, error: msg }
    }
  },

  // ─── Déconnexion ────────────────────────────────────────────────────────
  logout: () => {
    clearSession()
    // Journaliser la déconnexion (best-effort)
    const { token } = get()
    if (token) {
      fetch('/api/admin-data?action=logout', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    set({ token: null, expiresAt: null, isAuthenticated: false, errorMessage: null })
  },

  // ─── Vérification de la session ─────────────────────────────────────────
  checkSession: () => {
    const { token, expiresAt } = get()
    if (!token || !expiresAt) return false
    if (Date.now() > expiresAt) {
      clearSession()
      set({ token: null, expiresAt: null, isAuthenticated: false })
      return false
    }
    return true
  },

  clearError: () => set({ errorMessage: null }),
}))

// ─── Hook helper pour les appels API Admin ────────────────────────────────
export function getAdminAuthHeader(): Record<string, string> {
  const token = useAdminStore.getState().token
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ─── Fetch helper sécurisé pour les appels Admin ─────────────────────────
export async function adminApiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = useAdminStore.getState().token
  if (!token) throw new Error('Non authentifié')
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
}
