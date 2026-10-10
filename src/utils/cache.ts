// =============================================================================
// GESTIO 229 SaaS — Cache LocalStorage avec TTL (5 minutes par défaut)
// Affichage instantané du cache puis rafraîchissement silencieux en arrière-plan
// =============================================================================

interface CacheItem<T> {
  data: T
  timestamp: number
  ttlMs: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`gestio_cache_${key}`)
    if (!raw) return null
    const item: CacheItem<T> = JSON.parse(raw)
    const isExpired = Date.now() - item.timestamp > (item.ttlMs || DEFAULT_TTL_MS)
    if (isExpired) {
      localStorage.removeItem(`gestio_cache_${key}`)
      return null
    }
    return item.data
  } catch {
    return null
  }
}

export function setCachedData<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (typeof window === 'undefined') return
  try {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttlMs,
    }
    localStorage.setItem(`gestio_cache_${key}`, JSON.stringify(item))
  } catch (err) {
    // Si quota localStorage dépassé, vider les anciens caches gestio
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('gestio_cache_'))
        .forEach((k) => localStorage.removeItem(k))
    } catch (_) {}
  }
}

export function invalidateCache(keyPrefix: string): void {
  if (typeof window === 'undefined') return
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`gestio_cache_${keyPrefix}`))
      .forEach((k) => localStorage.removeItem(k))
  } catch (_) {}
}
