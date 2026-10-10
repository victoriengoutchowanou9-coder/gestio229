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
 * Normalise canoniquement les slugs de secteurs pour réconcilier les alias et équivalences
 * (ex: imprimerie <-> impression, immobilier <-> location, agrobusiness <-> agro, etc.)
 */
export function canonicalSectorSlug(slug?: string | null): string {
  if (!slug) return ''
  const clean = String(slug).toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'impression' || clean === 'imprimerie') return 'imprimerie'
  if (clean === 'station' || clean === 'stationservice' || clean === 'station-service') return 'station-service'
  if (clean === 'microfinance-tontine' || clean === 'tontine' || clean === 'microfinance') return 'microfinance'
  if (clean === 'location' || clean === 'gestion-locative' || clean === 'gestion_locative' || clean === 'locatif' || clean === 'locative' || clean === 'immobilier') return 'immobilier'
  if (clean === 'agro-business' || clean === 'agro' || clean === 'agrobusiness') return 'agrobusiness'
  if (clean === 'bar-restaurant-maquis' || clean === 'maquis' || clean === 'fast-food' || clean === 'restaurant') return 'restaurant'
  if (clean === 'brasserie' || clean === 'depot-boissons' || clean === 'depot_boissons' || clean === 'depot' || clean === 'boissons') return 'brasserie'
  if (clean === 'poissonnerie' || clean === 'poissons' || clean === 'chambre-froide') return 'poissonnerie'
  if (clean === 'cosmetique' || clean === 'cosmetiques') return 'cosmetiques'
  if (clean === 'supermarche' || clean === 'superette' || clean === 'supermarche-alimentation' || clean === 'supermarché' || clean === 'supérette') return 'supermarche'
  if (clean === 'boutique' || clean === 'commerce-general' || clean === 'general') return 'boutique'
  return clean
}

/**
 * Vérifie si l'entreprise a souscrit au secteur demandé
 */
export function isSectorSubscribed(sectorSlug: string, company?: Company | null): boolean {
  if (!company) return false
  
  const targetCanon = canonicalSectorSlug(sectorSlug)
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

  for (const s of rawList) {
    let slugStr = ''
    if (typeof s === 'string') {
      slugStr = s.replace(/^sec-/, '').toLowerCase().trim()
    } else if (s && typeof s === 'object') {
      slugStr = String(s.slug || s.sector_slug || s.sector?.slug || s.code || '').replace(/^sec-/, '').toLowerCase().trim()
    }
    if (slugStr === normSlug || canonicalSectorSlug(slugStr) === targetCanon) {
      return true
    }
  }

  return false
}

/**
 * RÈGLE D'OR : Filtrage strict des données pour isoler chaque sous-logiciel.
 * Vérifie si une entité appartient au secteur spécifié.
 */
export function isItemInSector(item: any, targetSectorSlug?: string): boolean {
  if (!item) return false
  const rawActive = targetSectorSlug || getActiveSectorSlug() || 'boutique'
  const active = rawActive.toLowerCase().trim().replace(/^sec-/, '')
  const activeCanon = canonicalSectorSlug(active) || 'boutique'

  // 1. Tag explicite par colonne sector_slug, sector_id, secteur_id, secteur_slug
  const directSlug = item.sector_slug || item.sector_id || item.secteur_id || item.secteur_slug
  if (directSlug && typeof directSlug === 'string') {
    const directCanon = canonicalSectorSlug(directSlug)
    if (directCanon && directCanon === activeCanon) return true
    if (directSlug.toLowerCase().trim() === active) return true
    return false // Isolation stricte : appartient explicitement à un autre secteur
  }

  // 1b. Si objet secteur relié (jointure SQL)
  if (item.secteur && typeof item.secteur === 'object') {
    const sSlug = item.secteur.slug || item.secteur.code
    if (sSlug && (canonicalSectorSlug(sSlug) === activeCanon || String(sSlug).toLowerCase().trim() === active)) return true
  }

  // 1c. Permissions (pour user_profiles)
  if (item.permissions && typeof item.permissions === 'object') {
    const permSlug = item.permissions.sector_slug || item.permissions.sector_id
    if (permSlug && typeof permSlug === 'string') {
      const permCanon = canonicalSectorSlug(permSlug)
      if (permCanon === activeCanon) return true
      return false
    }
  }

  // 2. Tag explicite dans sector_meta JSONB
  if (item.sector_meta && typeof item.sector_meta === 'object') {
    const metaSlug = item.sector_meta.sector_slug || item.sector_meta.sector || item.sector_meta.secteur
    if (metaSlug && typeof metaSlug === 'string') {
      const metaCanon = canonicalSectorSlug(metaSlug)
      if (metaCanon && metaCanon === activeCanon) return true
      if (String(metaSlug).toLowerCase().trim() === active) return true
      return false
    }
  }

  // 2b. Tag dans notes JSON (commandes, ventes, factures, clients, fournisseurs)
  if (item.notes) {
    try {
      const parsed = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes
      if (parsed?.sector_slug) {
        return canonicalSectorSlug(parsed.sector_slug) === activeCanon
      }
      if (parsed?.sector) {
        return canonicalSectorSlug(parsed.sector) === activeCanon
      }
    } catch (e) {}
  }

  // 2c. Tag dans e_mecef_uid ou métadonnées encodées
  if (typeof item.e_mecef_uid === 'string' && item.e_mecef_uid.includes('SEC:')) {
    const match = item.e_mecef_uid.match(/SEC:([^|]+)/)
    if (match && match[1]) {
      return canonicalSectorSlug(match[1]) === activeCanon
    }
  }

  // 3. Cas sémantique d'isolation pour articles historiques orphelins (sans marqueur explicite)
  const itemName = String(item.name || item.product_name || item.designation || '').toLowerCase()

  // Les boissons brasserie, bières et casiers (Beaufort, Béninoise, Castel, etc.) appartiennent TOUJOURS à Brasserie
  const isDrinkOrBeer = /beaufort|béninoise|beninoise|castel|guinness|sobebra|youki|casier|casiers|capsule|c12t|c20t|c24t|bière|biere/i.test(itemName)
  if (isDrinkOrBeer) {
    return activeCanon === 'brasserie'
  }

  // Les matériaux BTP (ciment, fer à béton, tôle, pointes) appartiennent TOUJOURS à Quincaillerie
  const isBTP = /ciment|fer à béton|fer a beton|béton|beton|tôle|tole|quincaillerie|pointes|brouette/i.test(itemName)
  if (isBTP) {
    return activeCanon === 'quincaillerie'
  }

  // Les produits frigorifiques / poissons -> Poissonnerie
  const isFish = !!(item.sector_meta?.coef && Number(item.sector_meta.coef) > 1) ||
    /tilapia|hake|hm 16|cuisse|poisson|chinchard/i.test(itemName)
  if (isFish) {
    return activeCanon === 'poissonnerie'
  }

  // 4. Règle absolue d'isolation : les données résiduelles sans marqueur sectoriel explicite
  // n'apparaissent QUE dans 'boutique' (secteur historique par défaut) et JAMAIS
  // dans les autres sous-logiciels spécialisés (Supermarché, Brasserie, Poissonnerie, Pharmacie, etc.)
  return activeCanon === 'boutique'
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
    secteur_slug: active,
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
