// =============================================================================
// GESTIO 229 SaaS — Sector Client Service (Isolation Totale des Données)
// =============================================================================
// RÈGLE ABSOLUE D'ISOLATION : ENTREPRISE + SOUS-LOGICIEL
// Une donnée métier appartient exclusivement à (company_id + sector_slug).
// Entreprise A + Quincaillerie ≠ Entreprise A + Poissonnerie ≠ Entreprise B + Quincaillerie
// =============================================================================

import { supabase } from './supabase'
import type { Company } from '../types/tenant'
import { ALL_SECTORS_CATALOG } from '../core/modules/moduleRegistry'

const ACTIVE_SECTOR_KEY = 'gestio229_active_sector'
const ACTIVE_ACTIVITY_ID_KEY = 'gestio229_active_activity_id'
const ACTIVE_ACTIVITY_NAME_KEY = 'gestio229_active_activity_name'

/**
 * Récupère le slug officiel du sous-logiciel actuellement ouvert
 */
export function getActiveSectorSlug(): string {
  return localStorage.getItem(ACTIVE_SECTOR_KEY) || 'boutique'
}

/**
 * Définit le sous-logiciel actif lors de l'accès depuis le HUB
 */
export function setActiveSector(sectorSlug: string, activityId?: string, activityName?: string): void {
  localStorage.setItem(ACTIVE_SECTOR_KEY, sectorSlug)
  if (activityId) localStorage.setItem(ACTIVE_ACTIVITY_ID_KEY, activityId)
  if (activityName) localStorage.setItem(ACTIVE_ACTIVITY_NAME_KEY, activityName)
  window.dispatchEvent(new Event('sector_changed'))
}

/**
 * Récupère les métadonnées officielles du sous-logiciel actif
 */
export function getActiveSectorMeta() {
  const slug = getActiveSectorSlug()
  return ALL_SECTORS_CATALOG.find((s) => s.slug === slug) || {
    code: slug.toUpperCase(),
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    emoji: '🏢',
    icon: 'Store',
    color: '#059669',
    badge: 'Sous-Logiciel',
    description: 'Espace métier GESTIO 229',
    category: 'Général'
  }
}

/**
 * Vérifie si l'entreprise a souscrit au secteur demandé
 */
export function isSectorSubscribed(sectorSlug: string, company?: Company | null): boolean {
  if (!company) return false
  
  const normSlug = String(sectorSlug).replace(/^sec-/, '').toLowerCase().trim()

  // Liste des secteurs souscrits dans company_sectors ou selected_sectors
  const rawList: any[] = []
  if (Array.isArray((company as any).selected_sectors)) {
    rawList.push(...(company as any).selected_sectors)
  }
  if (Array.isArray((company as any).sectors)) {
    rawList.push(...(company as any).sectors)
  }
  if ((company as any).active_sector) {
    rawList.push((company as any).active_sector)
  }
  if (Array.isArray((company as any).company_sectors)) {
    rawList.push(...(company as any).company_sectors)
  }

  if (rawList.length === 0) return true

  const normalizedList = rawList
    .map((s) => {
      if (typeof s === 'string') {
        return s.replace(/^sec-/, '').toLowerCase().trim()
      }
      if (s && typeof s === 'object') {
        const slug = s.slug || s.sector_slug || s.sector?.slug || s.code || ''
        return String(slug).replace(/^sec-/, '').toLowerCase().trim()
      }
      return ''
    })
    .filter(Boolean)

  return normalizedList.includes(normSlug)
}

/**
 * RÈGLE D'OR : Filtrage strict des données pour isoler chaque sous-logiciel.
 * Vérifie si une entité appartient au secteur spécifié.
 */
export function isItemInSector(item: any, targetSectorSlug?: string): boolean {
  if (!item) return false
  const active = (targetSectorSlug || getActiveSectorSlug()).toLowerCase().trim().replace(/^sec-/, '')

  // 1. Tag explicite par colonne sector_slug ou sector_id
  if (item.sector_slug && typeof item.sector_slug === 'string') {
    return item.sector_slug.toLowerCase().trim().replace(/^sec-/, '') === active
  }
  if (item.sector_id && typeof item.sector_id === 'string') {
    return item.sector_id.toLowerCase().trim().replace(/^sec-/, '') === active
  }

  // 1b. Permissions (pour user_profiles)
  if (item.permissions && typeof item.permissions === 'object') {
    const permSlug = item.permissions.sector_slug || item.permissions.sector_id
    if (permSlug && typeof permSlug === 'string') {
      return permSlug.toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }

  // 2. Tag explicite dans sector_meta JSONB
  if (item.sector_meta && typeof item.sector_meta === 'object') {
    if (item.sector_meta.sector_slug) {
      return String(item.sector_meta.sector_slug).toLowerCase().trim().replace(/^sec-/, '') === active
    }
    if (item.sector_meta.sector) {
      return String(item.sector_meta.sector).toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }

  // 2b. Tag dans notes JSON (commandes, ventes, factures, clients, fournisseurs)
  if (item.notes) {
    try {
      const parsed = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes
      if (parsed?.sector_slug) {
        return String(parsed.sector_slug).toLowerCase().trim().replace(/^sec-/, '') === active
      }
      if (parsed?.sector) {
        return String(parsed.sector).toLowerCase().trim().replace(/^sec-/, '') === active
      }
    } catch (e) {}
  }

  // 2c. Tag dans e_mecef_uid ou métadonnées encodées
  if (typeof item.e_mecef_uid === 'string' && item.e_mecef_uid.includes('SEC:')) {
    const match = item.e_mecef_uid.match(/SEC:([^|]+)/)
    if (match && match[1]) {
      return match[1].toLowerCase().trim().replace(/^sec-/, '') === active
    }
  }

  // 3. Cas de rétrocompatibilité pour les données existantes antérieures à la restructuration :
  // Les produits frigorifiques avec cartons / coefficients -> Poissonnerie
  if (active === 'poissonnerie') {
    return !!(item.sector_meta?.coef && Number(item.sector_meta.coef) > 1) ||
      /tilapia|hake|hm 16|cuisse|poisson/i.test(item.name || item.product_name || '')
  }

  // Les produits généraux anciens d'ETS BIO -> Boutique
  if (active === 'boutique') {
    const isFish = !!(item.sector_meta?.coef && Number(item.sector_meta.coef) > 1) ||
      /tilapia|hake|hm 16|cuisse|poisson/i.test(item.name || item.product_name || '')
    return !isFish
  }

  // 4. Règle absolue d'isolation : les données sans marqueur sectoriel explicite
  // n'apparaissent QUE dans 'boutique' (secteur historique par défaut) et JAMAIS
  // dans les autres sous-logiciels (Poissonnerie, Pharmacie, Microfinance, etc.)
  return active === 'boutique'
}

/**
 * Filtre un tableau d'éléments pour ne conserver que ceux du sous-logiciel actif
 */
export function filterItemsForSector<T>(items: T[], targetSectorSlug?: string): T[] {
  if (!Array.isArray(items)) return []
  const active = targetSectorSlug || getActiveSectorSlug()
  return items.filter((item) => isItemInSector(item, active))
}

/**
 * Injecte automatiquement les marqueurs d'isolation sectorielle dans tout objet inséré ou mis à jour.
 */
export function withSectorMeta<T extends Record<string, any>>(data: T, targetSectorSlug?: string): T {
  const active = targetSectorSlug || getActiveSectorSlug()
  return {
    ...data,
    sector_slug: active,
    sector_meta: {
      ...(data.sector_meta || {}),
      sector_slug: active,
      sector: active
    }
  }
}

/**
 * Retourne le client Supabase isolé pour le schéma PostgreSQL dédié du secteur
 */
export function getSectorDB(sectorSlug?: string) {
  const targetSector = sectorSlug || getActiveSectorSlug()
  try {
    return (supabase as any).schema(targetSector)
  } catch {
    return supabase
  }
}
