// =============================================================================
// GESTIO 229 SaaS — Service Central de Tarification Brasserie & Dépôt de Boissons
// Module : Grilles Gros & Maquis — Tarification dynamique & Prix personnalisés
// =============================================================================

import { supabase } from '../lib/supabase'

export interface BrasserieGrille {
  id: string
  company_id: string
  sector_slug: string
  nom: string
  seuil_min: number
  seuil_max: number | null // null = illimité
  statut: 'ACTIF' | 'INACTIF'
  description?: string
  ordre_priorite?: number
  created_at?: string
  updated_at?: string
  // Comptage utile pour l'interface
  produits_count?: number
}

export interface BrasserieGrillePrix {
  id: string
  company_id: string
  grille_id: string
  produit_id: string
  prix_standard_fcfa?: number
  prix_grille_fcfa: number
  created_at?: string
  updated_at?: string
}

export interface BrasserieClientPrixPersonnalise {
  id: string
  company_id: string
  sector_slug: string
  client_id: string
  produit_id: string
  prix_personnalise_fcfa: number
  statut: 'ACTIF' | 'INACTIF'
  notes?: string
  created_at?: string
  updated_at?: string
  // Métadonnées jointes optionnelles pour l'affichage
  product_name?: string
  product_sku?: string
  client_name?: string
  selling_price?: number
  cost_price?: number
}

export interface PricingResult {
  prix_applique: number
  source_prix: 'PRIX_PERSONNALISE' | 'GRILLE' | 'STANDARD'
  grille_utilisee?: string | null
  grille_id?: string | null
  prix_standard: number
  prix_grille?: number | null
  prix_personnalise?: number | null
  prix_achat: number
  marge_unitaire: number
  marge_totale: number
  economie_unitaire: number
  economie_totale: number
}

// ─── Clés de stockage local résilient ─────────────────────────────────────────
const getStorageKey = (type: string, companyId: string) => `gestio229_brasserie_${type}_${companyId}`

// ─── Validation de non-chevauchement des grilles ──────────────────────────────
export function checkGrillesOverlap(
  existingGrilles: BrasserieGrille[],
  candidate: { seuil_min: number; seuil_max: number | null; statut?: 'ACTIF' | 'INACTIF'; nom?: string },
  candidateId?: string
): { hasOverlap: boolean; conflictGrid?: BrasserieGrille; message?: string } {
  // Seules les grilles actives peuvent chevaucher
  if (candidate.statut === 'INACTIF') {
    return { hasOverlap: false }
  }

  const minA = Number(candidate.seuil_min)
  const maxA = candidate.seuil_max !== null && candidate.seuil_max !== undefined ? Number(candidate.seuil_max) : Infinity

  if (minA < 0) {
    return { hasOverlap: true, message: 'Le seuil minimum ne peut pas être inférieur à 0.' }
  }

  if (maxA !== Infinity && maxA < minA) {
    return { hasOverlap: true, message: `Le seuil maximum (${maxA}) doit être supérieur ou égal au seuil minimum (${minA}).` }
  }

  for (const g of existingGrilles) {
    if (g.id === candidateId) continue
    if (g.statut === 'INACTIF') continue

    const minB = Number(g.seuil_min)
    const maxB = g.seuil_max !== null && g.seuil_max !== undefined ? Number(g.seuil_max) : Infinity

    // Chevauchement si [minA, maxA] et [minB, maxB] se croisent
    const overlap = Math.max(minA, minB) <= Math.min(maxA, maxB)
    if (overlap) {
      const bMaxText = g.seuil_max !== null && g.seuil_max !== undefined ? String(g.seuil_max) : 'Illimité'
      const aMaxText = candidate.seuil_max !== null && candidate.seuil_max !== undefined ? String(candidate.seuil_max) : 'Illimité'
      return {
        hasOverlap: true,
        conflictGrid: g,
        message: `Chevauchement interdit : Le palier [${minA} à ${aMaxText}] entre en conflit avec la grille active « ${g.nom} » [${minB} à ${bMaxText}].`,
      }
    }
  }

  return { hasOverlap: false }
}

// ─── Trouver la grille active applicable selon la quantité totale ─────────────
export function findApplicableGrille(
  grilles: BrasserieGrille[],
  qteTotale: number
): BrasserieGrille | null {
  const safeQty = Number(qteTotale) > 0 ? Number(qteTotale) : 0
  if (safeQty <= 0) return null

  const activeGrilles = grilles.filter((g) => g.statut === 'ACTIF')

  // Trier par seuil_min croissant pour une recherche rigoureuse
  activeGrilles.sort((a, b) => Number(a.seuil_min) - Number(b.seuil_min))

  for (const g of activeGrilles) {
    const min = Number(g.seuil_min)
    const max = g.seuil_max !== null && g.seuil_max !== undefined ? Number(g.seuil_max) : Infinity

    if (safeQty >= min && safeQty <= max) {
      return g
    }
  }

  return null
}

// ─── Hiérarchie Tarifaire Absolue pour une ligne ──────────────────────────────
// PRIORITÉ 1 : Prix personnalisé client + produit
// PRIORITÉ 2 : Prix de grille selon quantité totale
// PRIORITÉ 3 : Prix standard du produit
export function calculateLinePricing(params: {
  product: { id: string; selling_price: number; cost_price?: number; name?: string }
  qteLigne: number
  qteTotaleVente: number
  clientId?: string | null
  grilleApplicable?: BrasserieGrille | null
  grillePrixMap?: Record<string, number> // produit_id -> prix_grille_fcfa
  clientPrixMap?: Record<string, number> // produit_id -> prix_personnalise_fcfa (spécifique à ce client)
}): PricingResult {
  const { product, qteLigne, clientId, grilleApplicable, grillePrixMap, clientPrixMap } = params

  const safeQte = Number(qteLigne) > 0 ? Number(qteLigne) : 1
  const standardPrice = Number(product.selling_price) || 0
  const costPrice = Number(product.cost_price) || 0

  // 1. PRIORITÉ 1 — PRIX PERSONNALISÉ CLIENT + PRODUIT
  if (clientId && clientPrixMap && clientPrixMap[product.id] !== undefined) {
    const customPrice = Number(clientPrixMap[product.id])
    if (!isNaN(customPrice) && customPrice >= 0) {
      const margeUnit = customPrice - costPrice
      const economieUnit = Math.max(0, standardPrice - customPrice)
      return {
        prix_applique: customPrice,
        source_prix: 'PRIX_PERSONNALISE',
        grille_utilisee: grilleApplicable?.nom || null,
        grille_id: grilleApplicable?.id || null,
        prix_standard: standardPrice,
        prix_personnalise: customPrice,
        prix_grille: grillePrixMap ? grillePrixMap[product.id] ?? null : null,
        prix_achat: costPrice,
        marge_unitaire: margeUnit,
        marge_totale: Math.round(margeUnit * safeQte),
        economie_unitaire: economieUnit,
        economie_totale: Math.round(economieUnit * safeQte),
      }
    }
  }

  // 2. PRIORITÉ 2 — PRIX DE LA GRILLE AUTOMATIQUE
  if (grilleApplicable && grillePrixMap && grillePrixMap[product.id] !== undefined) {
    const gridPrice = Number(grillePrixMap[product.id])
    if (!isNaN(gridPrice) && gridPrice >= 0) {
      const margeUnit = gridPrice - costPrice
      const economieUnit = Math.max(0, standardPrice - gridPrice)
      return {
        prix_applique: gridPrice,
        source_prix: 'GRILLE',
        grille_utilisee: grilleApplicable.nom,
        grille_id: grilleApplicable.id,
        prix_standard: standardPrice,
        prix_grille: gridPrice,
        prix_achat: costPrice,
        marge_unitaire: margeUnit,
        marge_totale: Math.round(margeUnit * safeQte),
        economie_unitaire: economieUnit,
        economie_totale: Math.round(economieUnit * safeQte),
      }
    }
  }

  // 3. PRIORITÉ 3 — PRIX STANDARD DU PRODUIT
  const margeUnit = standardPrice - costPrice
  return {
    prix_applique: standardPrice,
    source_prix: 'STANDARD',
    grille_utilisee: grilleApplicable?.nom || null,
    grille_id: grilleApplicable?.id || null,
    prix_standard: standardPrice,
    prix_achat: costPrice,
    marge_unitaire: margeUnit,
    marge_totale: Math.round(margeUnit * safeQte),
    economie_unitaire: 0,
    economie_totale: 0,
  }
}

// ─── Chargement / Persistance Supabase avec Fallback Résilient ────────────────

export async function fetchBrasserieGrilles(companyId: string, sectorSlug = 'brasserie'): Promise<BrasserieGrille[]> {
  if (!companyId) return []

  try {
    const { data, error } = await supabase
      .from('brasserie_grilles')
      .select('*')
      .eq('company_id', companyId)
      .order('seuil_min', { ascending: true })

    if (!error && data) {
      // Compter les prix configurés pour chaque grille
      const { data: prixData } = await supabase
        .from('brasserie_grille_prix')
        .select('grille_id')
        .eq('company_id', companyId)

      const counts: Record<string, number> = {}
      ;(prixData || []).forEach((p: any) => {
        counts[p.grille_id] = (counts[p.grille_id] || 0) + 1
      })

      const formatted: BrasserieGrille[] = data
        .filter((g: any) => !g.id?.startsWith('default-'))
        .map((g: any) => ({
          ...g,
          seuil_min: Number(g.seuil_min) || 0,
          seuil_max: g.seuil_max !== null && g.seuil_max !== undefined ? Number(g.seuil_max) : null,
          produits_count: counts[g.id] || 0,
        }))

      localStorage.setItem(getStorageKey('grilles', companyId), JSON.stringify(formatted))
      return formatted
    }
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur Supabase brasserie_grilles, recours au cache local:', err)
  }

  // Fallback local storage
  const cached = localStorage.getItem(getStorageKey('grilles', companyId))
  if (cached) {
    try {
      const parsed: BrasserieGrille[] = JSON.parse(cached)
      const cleaned = Array.isArray(parsed) ? parsed.filter((g) => !g.id?.startsWith('default-')) : []
      localStorage.setItem(getStorageKey('grilles', companyId), JSON.stringify(cleaned))
      return cleaned
    } catch { /* noop */ }
  }

  // ZÉRO DONNÉE FICTIVE : si aucune grille n'a été créée, renvoyer une liste vide
  return []
}

export async function saveBrasserieGrille(
  companyId: string,
  sectorSlug: string,
  grille: Partial<BrasserieGrille>
): Promise<BrasserieGrille> {
  const isNew = !grille.id || grille.id.startsWith('default-') || grille.id.startsWith('temp-')
  const payload: any = {
    company_id: companyId,
    sector_slug: sectorSlug || 'brasserie',
    nom: grille.nom?.trim(),
    seuil_min: Number(grille.seuil_min) || 0,
    seuil_max: grille.seuil_max !== null && grille.seuil_max !== undefined && String(grille.seuil_max).trim() !== ''
      ? Number(grille.seuil_max)
      : null,
    statut: grille.statut || 'ACTIF',
    description: grille.description || '',
    updated_at: new Date().toISOString(),
  }

  let savedGrille: BrasserieGrille = {
    ...grille,
    ...payload,
    id: isNew ? `grid-${Date.now()}` : (grille.id as string),
  }

  try {
    if (isNew) {
      const { data, error } = await supabase
        .from('brasserie_grilles')
        .insert(payload)
        .select()
        .single()
      if (!error && data) savedGrille = { ...data, produits_count: 0 }
    } else {
      const { data, error } = await supabase
        .from('brasserie_grilles')
        .update(payload)
        .eq('id', grille.id)
        .eq('company_id', companyId)
        .select()
        .single()
      if (!error && data) savedGrille = { ...data, produits_count: grille.produits_count || 0 }
    }
  } catch (err) {
    console.warn('[brasseriePricingService] Sauvegarde BDD ignorée, enregistrement local fallback:', err)
  }

  // Mettre à jour le cache local
  const current = await fetchBrasserieGrilles(companyId, sectorSlug)
  const updated = isNew
    ? [...current, savedGrille]
    : current.map((g) => (g.id === grille.id ? { ...g, ...savedGrille } : g))

  localStorage.setItem(getStorageKey('grilles', companyId), JSON.stringify(updated))
  return savedGrille
}

export async function deleteBrasserieGrille(companyId: string, grilleId: string): Promise<boolean> {
  try {
    await supabase.from('brasserie_grille_prix').delete().eq('grille_id', grilleId).eq('company_id', companyId)
    await supabase.from('brasserie_grilles').delete().eq('id', grilleId).eq('company_id', companyId)
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur suppression BDD:', err)
  }

  // Supprimer du local storage
  const cached = localStorage.getItem(getStorageKey('grilles', companyId))
  if (cached) {
    try {
      const list = JSON.parse(cached)
      const filtered = list.filter((g: any) => g.id !== grilleId)
      localStorage.setItem(getStorageKey('grilles', companyId), JSON.stringify(filtered))
    } catch { /* noop */ }
  }

  return true
}

export async function fetchGrillePrix(
  companyId: string,
  grilleId: string
): Promise<Record<string, number>> {
  if (!grilleId) return {}

  const resultMap: Record<string, number> = {}

  try {
    const { data, error } = await supabase
      .from('brasserie_grille_prix')
      .select('produit_id, prix_grille_fcfa')
      .eq('grille_id', grilleId)
      .eq('company_id', companyId)

    if (!error && data) {
      data.forEach((r: any) => {
        resultMap[r.produit_id] = Number(r.prix_grille_fcfa) || 0
      })
      localStorage.setItem(getStorageKey(`prix_grille_${grilleId}`, companyId), JSON.stringify(resultMap))
      return resultMap
    }
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur chargement brasserie_grille_prix:', err)
  }

  // Fallback cache local
  const cached = localStorage.getItem(getStorageKey(`prix_grille_${grilleId}`, companyId))
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch { /* noop */ }
  }

  return resultMap
}

export async function saveGrillePrixBatch(
  companyId: string,
  grilleId: string,
  items: Array<{ produit_id: string; prix_standard_fcfa: number; prix_grille_fcfa: number }>
): Promise<void> {
  const currentMap = await fetchGrillePrix(companyId, grilleId)
  items.forEach((it) => {
    currentMap[it.produit_id] = it.prix_grille_fcfa
  })

  try {
    for (const it of items) {
      const payload = {
        company_id: companyId,
        grille_id: grilleId,
        produit_id: it.produit_id,
        prix_standard_fcfa: it.prix_standard_fcfa,
        prix_grille_fcfa: it.prix_grille_fcfa,
        updated_at: new Date().toISOString(),
      }
      await supabase.from('brasserie_grille_prix').upsert(payload, { onConflict: 'grille_id,produit_id' })
    }
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur upsert brasserie_grille_prix:', err)
  }

  localStorage.setItem(getStorageKey(`prix_grille_${grilleId}`, companyId), JSON.stringify(currentMap))
}

export async function deleteGrillePrix(
  companyId: string,
  grilleId: string,
  produitId: string
): Promise<void> {
  try {
    await supabase
      .from('brasserie_grille_prix')
      .delete()
      .eq('grille_id', grilleId)
      .eq('produit_id', produitId)
      .eq('company_id', companyId)
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur suppression prix produit grille:', err)
  }

  const currentMap = await fetchGrillePrix(companyId, grilleId)
  delete currentMap[produitId]
  localStorage.setItem(getStorageKey(`prix_grille_${grilleId}`, companyId), JSON.stringify(currentMap))
}

// ─── Prix Personnalisés Clients (Priorité 1) ──────────────────────────────────

export async function fetchClientPrixPersonnalises(
  companyId: string,
  clientId?: string
): Promise<BrasserieClientPrixPersonnalise[]> {
  if (!companyId) return []

  try {
    let q = supabase
      .from('brasserie_client_prix_personnalises')
      .select('*')
      .eq('company_id', companyId)

    if (clientId) {
      q = q.eq('client_id', clientId)
    }

    const { data, error } = await q
    if (!error && data) {
      localStorage.setItem(getStorageKey(`custom_prices_${clientId || 'all'}`, companyId), JSON.stringify(data))
      return data
    }
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur chargement prix personnalisés clients:', err)
  }

  // Fallback cache local
  const cached = localStorage.getItem(getStorageKey(`custom_prices_${clientId || 'all'}`, companyId))
  if (cached) {
    try {
      const list = JSON.parse(cached)
      if (clientId) return list.filter((x: any) => x.client_id === clientId)
      return list
    } catch { /* noop */ }
  }

  return []
}

export async function fetchClientPrixMap(
  companyId: string,
  clientId: string
): Promise<Record<string, number>> {
  if (!clientId) return {}
  const items = await fetchClientPrixPersonnalises(companyId, clientId)
  const map: Record<string, number> = {}
  items.forEach((it) => {
    if (it.statut === 'ACTIF') {
      map[it.produit_id] = Number(it.prix_personnalise_fcfa) || 0
    }
  })
  return map
}

export async function saveClientPrixPersonnalise(
  companyId: string,
  sectorSlug: string,
  item: {
    client_id: string
    produit_id: string
    prix_personnalise_fcfa: number
    statut?: 'ACTIF' | 'INACTIF'
    notes?: string
  }
): Promise<BrasserieClientPrixPersonnalise> {
  const payload: any = {
    company_id: companyId,
    sector_slug: sectorSlug || 'brasserie',
    client_id: item.client_id,
    produit_id: item.produit_id,
    prix_personnalise_fcfa: Number(item.prix_personnalise_fcfa) || 0,
    statut: item.statut || 'ACTIF',
    notes: item.notes || '',
    updated_at: new Date().toISOString(),
  }

  let savedItem: BrasserieClientPrixPersonnalise = {
    ...payload,
    id: `custom-${Date.now()}`,
  }

  try {
    const { data, error } = await supabase
      .from('brasserie_client_prix_personnalises')
      .upsert(payload, { onConflict: 'company_id,client_id,produit_id' })
      .select()
      .single()

    if (!error && data) {
      savedItem = data
    }
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur upsert prix client personnalisé, fallback local:', err)
  }

  // Mettre à jour cache local
  const list = await fetchClientPrixPersonnalises(companyId)
  const existingIdx = list.findIndex(
    (x) => x.client_id === item.client_id && x.produit_id === item.produit_id
  )
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...savedItem }
  } else {
    list.push(savedItem)
  }
  localStorage.setItem(getStorageKey('custom_prices_all', companyId), JSON.stringify(list))

  return savedItem
}

export async function deleteClientPrixPersonnalise(
  companyId: string,
  clientId: string,
  produitId: string
): Promise<void> {
  try {
    await supabase
      .from('brasserie_client_prix_personnalises')
      .delete()
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .eq('produit_id', produitId)
  } catch (err) {
    console.warn('[brasseriePricingService] Erreur suppression prix personnalisé:', err)
  }

  const list = await fetchClientPrixPersonnalises(companyId)
  const filtered = list.filter(
    (x) => !(x.client_id === clientId && x.produit_id === produitId)
  )
  localStorage.setItem(getStorageKey('custom_prices_all', companyId), JSON.stringify(filtered))
}
