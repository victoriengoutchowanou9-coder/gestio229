// =============================================================================
// GESTIO 229 SaaS — Rate Limiting & Brute-Force Protection
// Conforme au Point 14 du Cahier des Charges de Sécurité SaaS
// Limite stricte : Max 5 tentatives par minute sur les flux d'authentification
// Blocage temporaire sécurisé avec persistance anti-contournement (F5 / reload)
// =============================================================================

export interface RateLimitStatus {
  allowed: boolean
  remainingAttempts: number
  retryAfterSeconds: number
  lockoutMessage?: string
}

interface AttemptRecord {
  timestamps: number[]
  lockedUntil?: number
}

const STORAGE_PREFIX = 'gestio_ratelimit_'

class RateLimiter {
  private inMemoryStore: Map<string, AttemptRecord> = new Map()

  private getStorageKey(key: string): string {
    return `${STORAGE_PREFIX}${key.toLowerCase().trim()}`
  }

  private getRecord(key: string): AttemptRecord {
    const storageKey = this.getStorageKey(key)
    
    // 1. Vérifier la mémoire locale
    if (this.inMemoryStore.has(storageKey)) {
      return this.inMemoryStore.get(storageKey)!
    }

    // 2. Vérifier la persistance dans localStorage (résiste au refresh)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          this.inMemoryStore.set(storageKey, parsed)
          return parsed
        }
      } catch {
        // Fallback transparent
      }
    }

    const initial: AttemptRecord = { timestamps: [] }
    this.inMemoryStore.set(storageKey, initial)
    return initial
  }

  private saveRecord(key: string, record: AttemptRecord): void {
    const storageKey = this.getStorageKey(key)
    this.inMemoryStore.set(storageKey, record)

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(record))
      } catch {
        // Fallback transparent
      }
    }
  }

  /**
   * Vérifie si une action est autorisée selon les quotas de sécurité
   * @param key Identifiant unique (ex: 'login:user@domaine.bj' ou 'reset_pwd:user@domaine.bj')
   * @param maxAttempts Nombre maximum de tentatives autorisées (défaut : 5)
   * @param windowMs Fenêtre de mesure en millisecondes (défaut : 60 000 ms = 1 min)
   * @param lockoutMs Durée de blocage après dépassement (défaut : 900 000 ms = 15 min)
   */
  public checkRateLimit(
    key: string,
    maxAttempts = 5,
    windowMs = 60000,
    lockoutMs = 15 * 60 * 1000
  ): RateLimitStatus {
    const now = Date.now()
    const record = this.getRecord(key)

    // Vérifier si un verrouillage est en cours
    if (record.lockedUntil && record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000)
      const minutes = Math.ceil(retryAfterSeconds / 60)
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds,
        lockoutMessage: `Sécurité renforcée : trop de tentatives infructueuses. Veuillez patienter ${minutes} minute(s) avant de réessayer.`,
      }
    }

    // Nettoyer les tentatives antérieures à la fenêtre glissante
    const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs)
    record.timestamps = validTimestamps
    record.lockedUntil = undefined
    this.saveRecord(key, record)

    const remainingAttempts = Math.max(0, maxAttempts - validTimestamps.length)

    if (validTimestamps.length >= maxAttempts) {
      // Déclencher le blocage de sécurité
      record.lockedUntil = now + lockoutMs
      this.saveRecord(key, record)

      const retryAfterSeconds = Math.ceil(lockoutMs / 1000)
      const minutes = Math.ceil(retryAfterSeconds / 60)
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds,
        lockoutMessage: `Compte temporairement protégé suite à 5 tentatives infructueuses. Réessayez dans ${minutes} minutes.`,
      }
    }

    return {
      allowed: true,
      remainingAttempts,
      retryAfterSeconds: 0,
    }
  }

  /**
   * Enregistre un échec de tentative (ex: mot de passe invalide)
   */
  public recordFailure(
    key: string,
    maxAttempts = 5,
    windowMs = 60000,
    lockoutMs = 15 * 60 * 1000
  ): RateLimitStatus {
    const now = Date.now()
    const record = this.getRecord(key)

    // Filtrer les anciennes tentatives
    const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs)
    validTimestamps.push(now)
    record.timestamps = validTimestamps

    if (validTimestamps.length >= maxAttempts) {
      record.lockedUntil = now + lockoutMs
    }

    this.saveRecord(key, record)
    return this.checkRateLimit(key, maxAttempts, windowMs, lockoutMs)
  }

  /**
   * Réinitialise les compteurs lors d'une authentification réussie
   */
  public resetLimit(key: string): void {
    const storageKey = this.getStorageKey(key)
    this.inMemoryStore.delete(storageKey)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // Fallback transparent
      }
    }
  }
}

export const rateLimiter = new RateLimiter()
