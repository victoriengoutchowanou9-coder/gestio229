// =============================================================================
// GESTIO 229 SaaS — Service Spécialisé Station-Service & Hydrocarbures
// Paramètres Commerciaux, Fiscaux, TVA, Stocks (CUMP) et Marges Carburants
// =============================================================================
// Conforme au Code Général des Impôts (Bénin & UEMOA) et normes SYSCOHADA.
// Séparation stricte : Carburants en vrac (Essence Super, Gasoil, Pétrole lampant)
// vs Lubrifiants & Boutiques (gérés dans leurs circuits dédiés).
// =============================================================================

import { supabase } from '../lib/supabase'
import { safeStationInsert, safeStationUpdate } from '../utils/stationFuelHelper'
import { calculateTaxFromTTC } from '../utils/tax'
import { canonicalSectorSlug } from '../lib/sectorClient'
import { enregistrerMouvementCaisse, getOrCreateSectorCaisse } from './caisseSectorService'

export interface FuelProductDefinition {
  code: string
  nom: string
  couleurBadge: string
  defaultSellingPrice: number
  defaultCostPrice: number
}

export const OFFICIAL_STATION_FUELS: FuelProductDefinition[] = [
  {
    code: 'CARB-SUPER',
    nom: 'Essence Super',
    couleurBadge: 'emerald',
    defaultSellingPrice: 680,
    defaultCostPrice: 620,
  },
  {
    code: 'CARB-GASOIL',
    nom: 'Gasoil',
    couleurBadge: 'blue',
    defaultSellingPrice: 700,
    defaultCostPrice: 640,
  },
  {
    code: 'CARB-PETROLE',
    nom: 'Pétrole lampant',
    couleurBadge: 'amber',
    defaultSellingPrice: 650,
    defaultCostPrice: 590,
  },
]

export interface FuelCommercialConfig {
  id?: string
  code: string
  nom: string
  prix_vente: number // Prix de vente officiel en FCFA/L
  prix_achat_reference: number // Prix d'achat de référence / base en FCFA/L
  date_effet: string // Date et heure de prise d'effet
  source_reglementaire?: string // Décision officielle / Arrêté ministériel
  taux_tva: number // Taux TVA applicable (ex: 18 ou 0)
  is_tva_applicable: boolean // TVA applicable selon régime
  statut_fiscal: string // 'Assujetti TVA' | 'Exonéré' | 'Régime TPS (Non assujetti)'
  regime_fiscal_entreprise?: string
  updated_at?: string
  updated_by?: string
  notes?: string
}

export interface FuelPriceHistoryEntry {
  id: string
  produit: string
  ancien_prix: number
  nouveau_prix: number
  date_changement: string
  modifie_par?: string
  source_reglementaire?: string
  notes?: string
}

export interface FuelProfitabilityItem {
  code: string
  nom: string
  quantiteVendueLitres: number
  prixVenteUnitaireMoyen: number
  prixVenteUnitaireHT: number
  coutAchatUnitaireRetenu: number
  hasCoutAchat: boolean
  chiffreAffairesTTC: number
  chiffreAffairesNetHT: number
  tvaCollectee: number
  coutQuantitesVendues: number
  margeBruteUnitaire: number
  margeBruteTotale: number
  tauxMarge: number // (Marge / Coût Achat) * 100
  tauxMarque: number // (Marge / CA Net HT) * 100
  statutFiscal: string
}

export interface DailyFuelSheetItem {
  code: string
  nom: string
  stockInitial: number
  receptionsLitres: number
  quantiteVendueLitres: number
  stockTheoriqueFinal: number
  stockPhysiqueJauge: number | null
  ecartStockLitres: number
  chiffreAffairesTTC: number
  chiffreAffairesNetHT: number
  tvaCollectee: number
  coutVentes: number
  margeBrute: number
  hasCoutAchat: boolean
  encaissementsEspeces: number
  encaissementsMomo: number
  encaissementsCredit: number
  totalEncaissements: number
}

/**
 * Détermine le statut fiscal par défaut selon le régime de l'entreprise
 */
export function getEnterpriseFiscalDefaults(companyRegime?: string, defaultTvaRate?: number) {
  const regime = (companyRegime || '').toLowerCase()
  const isTPS = regime.includes('tps') || regime.includes('synthétique')
  const isExonere = regime.includes('exonér') || (defaultTvaRate === 0 && !isTPS)
  
  if (isTPS) {
    return {
      is_tva_applicable: false,
      taux_tva: 0,
      statut_fiscal: 'Régime de la TPS (Non assujetti)',
      mention_facture: 'Régime de la TPS — TVA non applicable (Art. 1084 CGI)'
    }
  }

  if (isExonere) {
    return {
      is_tva_applicable: false,
      taux_tva: 0,
      statut_fiscal: 'Exonéré de TVA',
      mention_facture: 'Exonération légale de TVA (Hydrocarbures — Régime fiscal spécifique)'
    }
  }

  const rate = typeof defaultTvaRate === 'number' && defaultTvaRate >= 0 ? defaultTvaRate : 18
  return {
    is_tva_applicable: rate > 0,
    taux_tva: rate,
    statut_fiscal: rate > 0 ? `Assujetti TVA (${rate}%)` : 'Non assujetti',
    mention_facture: rate > 0 ? `TVA ${rate}% comprise` : 'TVA non applicable'
  }
}

/**
 * 1. Charger les paramètres commerciaux et fiscaux des 3 carburants
 */
export async function loadFuelCommercialConfigs(
  companyId: string,
  companyRegime?: string,
  defaultTvaRate?: number
): Promise<FuelCommercialConfig[]> {
  if (!companyId) return []

  const fiscalDefaults = getEnterpriseFiscalDefaults(companyRegime, defaultTvaRate)

  try {
    // Chercher les produits configurés dans la table 'products'
    const { data: prods, error } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', 'station-service')

    const existingProducts = (prods || []).filter((p: any) => {
      const code = (p.code || '').toUpperCase()
      const name = (p.name || '').toLowerCase()
      return (
        code.startsWith('CARB-') ||
        name.includes('super') ||
        name.includes('gasoil') ||
        name.includes('pétrole') ||
        name.includes('petrole') ||
        p.sector_meta?.is_carburant === true
      )
    })

    return OFFICIAL_STATION_FUELS.map(fuelDef => {
      const found = existingProducts.find((p: any) => {
        const code = (p.code || '').toUpperCase()
        const name = (p.name || '').toLowerCase()
        if (code === fuelDef.code) return true
        if (fuelDef.nom === 'Essence Super' && (name.includes('super') || name.includes('essence'))) return true
        if (fuelDef.nom === 'Gasoil' && name.includes('gasoil')) return true
        if (fuelDef.nom === 'Pétrole lampant' && (name.includes('pétrole') || name.includes('petrole'))) return true
        return false
      })

      if (found) {
        const meta = found.sector_meta || {}
        return {
          id: found.id,
          code: fuelDef.code,
          nom: fuelDef.nom,
          prix_vente: Number(found.selling_price) || fuelDef.defaultSellingPrice,
          prix_achat_reference: Number(found.cost_price) || fuelDef.defaultCostPrice,
          date_effet: meta.date_effet || found.updated_at || found.created_at || new Date().toISOString(),
          source_reglementaire: meta.source_reglementaire || 'Tarif officiel en vigueur',
          taux_tva: typeof found.tva_rate === 'number' ? found.tva_rate : fiscalDefaults.taux_tva,
          is_tva_applicable: found.is_taxable !== undefined ? Boolean(found.is_taxable) : fiscalDefaults.is_tva_applicable,
          statut_fiscal: meta.statut_fiscal || fiscalDefaults.statut_fiscal,
          regime_fiscal_entreprise: companyRegime || 'Régime Réel Simplifié (RRS)',
          updated_at: found.updated_at,
          notes: found.description || meta.notes || ''
        }
      }

      // Valeur par défaut officielle
      return {
        code: fuelDef.code,
        nom: fuelDef.nom,
        prix_vente: fuelDef.defaultSellingPrice,
        prix_achat_reference: fuelDef.defaultCostPrice,
        date_effet: new Date().toISOString(),
        source_reglementaire: 'Arrêté officiel interministériel des prix des hydrocarbures',
        taux_tva: fiscalDefaults.taux_tva,
        is_tva_applicable: fiscalDefaults.is_tva_applicable,
        statut_fiscal: fiscalDefaults.statut_fiscal,
        regime_fiscal_entreprise: companyRegime || 'Régime Réel Simplifié (RRS)',
        notes: 'Initialisation automatique aux tarifs nationaux officiels'
      }
    })
  } catch (err) {
    console.warn('[stationFuelService] Erreur chargement des configurations carburants:', err)
    return OFFICIAL_STATION_FUELS.map(fuelDef => ({
      code: fuelDef.code,
      nom: fuelDef.nom,
      prix_vente: fuelDef.defaultSellingPrice,
      prix_achat_reference: fuelDef.defaultCostPrice,
      date_effet: new Date().toISOString(),
      source_reglementaire: 'Arrêté officiel interministériel',
      taux_tva: fiscalDefaults.taux_tva,
      is_tva_applicable: fiscalDefaults.is_tva_applicable,
      statut_fiscal: fiscalDefaults.statut_fiscal,
    }))
  }
}

/**
 * 2. Enregistrer / Mettre à jour les paramètres commerciaux et fiscaux d'un carburant
 * - Met à jour la table `products`
 * - Synchronise `station_pistolets` pour que les distributeurs utilisent immédiatement le nouveau prix
 * - Historise dans `station_prix_historique`
 */
export async function saveFuelCommercialConfig(
  companyId: string,
  config: FuelCommercialConfig,
  userId?: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!companyId) return { success: false, error: 'Identifiant entreprise manquant' }

  try {
    const cleanSectorSlug = 'station-service'
    const nowIso = new Date().toISOString()
    const effectDate = config.date_effet || nowIso

    // 1. Récupérer l'ancien prix pour l'historique
    let ancienPrix = config.prix_vente
    const { data: existingProd } = await supabase
      .from('products')
      .select('id, selling_price, sector_meta')
      .eq('company_id', companyId)
      .eq('sector_slug', cleanSectorSlug)
      .or(`code.eq.${config.code},name.ilike.%${config.nom}%`)
      .limit(1)
      .maybeSingle()

    if (existingProd) {
      ancienPrix = Number(existingProd.selling_price) || config.prix_vente
    }

    const sectorMeta = {
      is_carburant: true,
      code_carburant: config.code,
      type_carburant: config.nom,
      date_effet: effectDate,
      source_reglementaire: config.source_reglementaire || 'Décision officielle',
      statut_fiscal: config.statut_fiscal,
      regime_fiscal_entreprise: config.regime_fiscal_entreprise,
      notes: config.notes || ''
    }

    const productPayload: any = {
      company_id: companyId,
      sector_slug: cleanSectorSlug,
      code: config.code,
      name: config.nom,
      unit: 'Litre',
      selling_price: config.prix_vente,
      cost_price: config.prix_achat_reference,
      tva_rate: config.is_tva_applicable ? config.taux_tva : 0,
      is_taxable: config.is_tva_applicable,
      sector_meta: sectorMeta,
      description: config.notes || `Carburant officiel ${config.nom} - Fixé par décision ministérielle`,
      is_active: true,
      updated_at: nowIso
    }

    if (existingProd?.id) {
      const { error: updErr } = await supabase
        .from('products')
        .update(productPayload)
        .eq('id', existingProd.id)
      if (updErr) throw updErr
    } else {
      const { error: insErr } = await supabase
        .from('products')
        .insert({ ...productPayload, created_at: nowIso })
      if (insErr) throw insErr
    }

    // 2. Synchroniser les pistolets branchés sur ce carburant
    try {
      const { data: matchingPistolets } = await supabase
        .from('station_pistolets')
        .select('id, produit')
        .eq('company_id', companyId)

      if (matchingPistolets && matchingPistolets.length > 0) {
        for (const pist of matchingPistolets) {
          const pName = (pist.produit || '').toLowerCase()
          const cName = config.nom.toLowerCase()
          if (
            pName === cName ||
            (cName.includes('super') && pName.includes('super')) ||
            (cName.includes('gasoil') && pName.includes('gasoil')) ||
            (cName.includes('pétrole') && (pName.includes('pétrole') || pName.includes('petrole')))
          ) {
            await safeStationUpdate(supabase, 'station_pistolets', pist.id, {
              prix_actuel: config.prix_vente,
              updated_at: nowIso
            })
          }
        }
      }
    } catch (pistEx) {
      console.warn('[stationFuelService] Notice mise à jour station_pistolets:', pistEx)
    }

    // 3. Historiser le changement dans station_prix_historique si le prix a changé
    if (ancienPrix !== config.prix_vente || existingProd) {
      try {
        await safeStationInsert(supabase, 'station_prix_historique', {
          company_id: companyId,
          sector_slug: cleanSectorSlug,
          produit: config.nom,
          ancien_prix: ancienPrix,
          nouveau_prix: config.prix_vente,
          date_changement: effectDate,
          modifie_par: userName || userId || 'Responsable Station',
          source_reglementaire: config.source_reglementaire || 'Arrêté officiel',
          notes: config.notes || `Ajustement tarifaire officiel de ${ancienPrix} à ${config.prix_vente} FCFA/L`
        })
      } catch (histEx) {
        console.warn('[stationFuelService] Notice insertion station_prix_historique:', histEx)
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[stationFuelService] Erreur sauvegarde paramètre carburant:', err)
    return { success: false, error: err.message || 'Erreur lors de la sauvegarde du paramètre' }
  }
}

/**
 * 3. Récupérer l'historique des modifications de prix d'un carburant ou de tous
 */
export async function getFuelPriceHistory(
  companyId: string,
  produit?: string
): Promise<FuelPriceHistoryEntry[]> {
  if (!companyId) return []

  try {
    let query = supabase
      .from('station_prix_historique')
      .select('*')
      .eq('company_id', companyId)
      .order('date_changement', { ascending: false })
      .limit(50)

    if (produit) {
      query = query.ilike('produit', `%${produit}%`)
    }

    const { data, error } = await query
    if (error) {
      console.warn('[stationFuelService] Erreur lecture historique:', error)
      return []
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      produit: row.produit,
      ancien_prix: Number(row.ancien_prix) || 0,
      nouveau_prix: Number(row.nouveau_prix) || 0,
      date_changement: row.date_changement || row.created_at,
      modifie_par: row.modifie_par || 'Administrateur',
      source_reglementaire: row.source_reglementaire || '-',
      notes: row.notes || ''
    }))
  } catch {
    return []
  }
}

/**
 * 4. Calcul du Coût Unitaire Moyen Pondéré (CUMP) et Coût d'achat retenu
 * Récupère les approvisionnements réels validés depuis `station_receptions_carburant`.
 * Si aucun approvisionnement disponible, utilise le prix d'achat de référence configuré.
 */
export async function calculateFuelAcquisitionCost(
  companyId: string,
  produitNom: string,
  referenceCostPrice: number,
  dateStart?: string,
  dateEnd?: string
): Promise<{
  unitCost: number
  hasActualReceptions: boolean
  hasKnownCost: boolean
  totalVolumeRecu: number
  totalCoutAcquisition: number
  methode: string
}> {
  if (!companyId) {
    return {
      unitCost: referenceCostPrice > 0 ? referenceCostPrice : 0,
      hasActualReceptions: false,
      hasKnownCost: referenceCostPrice > 0,
      totalVolumeRecu: 0,
      totalCoutAcquisition: 0,
      methode: 'Coût de référence'
    }
  }

  try {
    let query = supabase
      .from('station_receptions_carburant')
      .select('*')
      .eq('company_id', companyId)
      .ilike('produit', `%${produitNom.split(' ')[0]}%`)
      .in('statut', ['VALIDE', 'AVEC_ECART'])

    if (dateStart) query = query.gte('date_reception', dateStart.slice(0, 10))
    if (dateEnd) query = query.lte('date_reception', dateEnd.slice(0, 10))

    const { data: receptions, error } = await query

    if (!error && receptions && receptions.length > 0) {
      let sumVol = 0
      let sumCout = 0

      for (const rec of receptions) {
        const qte = Number(rec.quantite_recue) || 0
        const pAchat = Number(rec.prix_achat_litre) || 0
        const transport = Number(rec.frais_transport) || 0
        const total = Number(rec.montant_total) || (qte * pAchat)

        if (qte > 0) {
          sumVol += qte
          sumCout += (total + transport)
        }
      }

      if (sumVol > 0 && sumCout > 0) {
        const cump = Math.round((sumCout / sumVol) * 100) / 100
        return {
          unitCost: cump,
          hasActualReceptions: true,
          hasKnownCost: true,
          totalVolumeRecu: sumVol,
          totalCoutAcquisition: sumCout,
          methode: 'CUMP (Approvisionnements réels validés)'
        }
      }
    }
  } catch (err) {
    console.warn('[stationFuelService] Erreur calcul CUMP réceptions:', err)
  }

  // Repli sur le prix d'achat de référence si configuré
  if (referenceCostPrice > 0) {
    return {
      unitCost: referenceCostPrice,
      hasActualReceptions: false,
      hasKnownCost: true,
      totalVolumeRecu: 0,
      totalCoutAcquisition: 0,
      methode: 'Coût de référence officiel'
    }
  }

  return {
    unitCost: 0,
    hasActualReceptions: false,
    hasKnownCost: false,
    totalVolumeRecu: 0,
    totalCoutAcquisition: 0,
    methode: 'Non renseigné'
  }
}

/**
 * 5. Rapport de rentabilité et marges détaillées par carburant
 * - Volume vendu (L)
 * - Prix vente unitaire moyen
 * - Coût d'achat unitaire retenu
 * - CA net HT
 * - Coût des quantités vendues (COGS)
 * - Marge brute unitaire & totale
 * - Taux de marge (%) et Taux de marque (%)
 * - TVA collectée
 */
export async function generateFuelProfitabilityReport(
  companyId: string,
  options: {
    dateStart?: string
    dateEnd?: string
    companyRegime?: string
    defaultTvaRate?: number
  }
): Promise<{
  items: FuelProfitabilityItem[]
  totals: {
    quantiteVendueLitres: number
    chiffreAffairesTTC: number
    chiffreAffairesNetHT: number
    tvaCollectee: number
    coutQuantitesVendues: number
    margeBruteTotale: number
    tauxMargeMoyen: number
    tauxMarqueMoyen: number
  }
}> {
  if (!companyId) {
    return {
      items: [],
      totals: {
        quantiteVendueLitres: 0,
        chiffreAffairesTTC: 0,
        chiffreAffairesNetHT: 0,
        tvaCollectee: 0,
        coutQuantitesVendues: 0,
        margeBruteTotale: 0,
        tauxMargeMoyen: 0,
        tauxMarqueMoyen: 0
      }
    }
  }

  // 1. Charger les configs officielles
  const configs = await loadFuelCommercialConfigs(companyId, options.companyRegime, options.defaultTvaRate)

  // 2. Charger les ventes validées de carburant
  let salesQuery = supabase
    .from('sales_orders')
    .select('id, order_number, total_amount, subtotal_ht, total_tax, notes, metadata, created_at, status')
    .eq('company_id', companyId)
    .eq('sector_slug', 'station-service')
    .neq('status', 'CANCELLED')

  if (options.dateStart) salesQuery = salesQuery.gte('created_at', options.dateStart)
  if (options.dateEnd) salesQuery = salesQuery.lte('created_at', options.dateEnd)

  const { data: salesData, error: salesErr } = await salesQuery
  if (salesErr) {
    console.warn('[stationFuelService] Erreur lecture ventes carburants:', salesErr)
  }

  const validSales = salesData || []

  // 3. Regrouper les ventes par type de carburant
  const groupedSales: Record<string, { volume: number; totalTTC: number; totalHT: number; count: number }> = {
    'Essence Super': { volume: 0, totalTTC: 0, totalHT: 0, count: 0 },
    'Gasoil': { volume: 0, totalTTC: 0, totalHT: 0, count: 0 },
    'Pétrole lampant': { volume: 0, totalTTC: 0, totalHT: 0, count: 0 }
  }

  for (const s of validSales) {
    const meta = s.metadata || {}
    let fuelName = meta.produit || ''

    if (!fuelName && typeof s.notes === 'string') {
      const lower = s.notes.toLowerCase()
      if (lower.includes('super') || lower.includes('essence')) fuelName = 'Essence Super'
      else if (lower.includes('gasoil')) fuelName = 'Gasoil'
      else if (lower.includes('pétrole') || lower.includes('petrole')) fuelName = 'Pétrole lampant'
    }

    // Normalisation vers l'un des 3 carburants
    let targetKey = ''
    const lowerName = fuelName.toLowerCase()
    if (lowerName.includes('super') || lowerName.includes('essence')) targetKey = 'Essence Super'
    else if (lowerName.includes('gasoil')) targetKey = 'Gasoil'
    else if (lowerName.includes('pétrole') || lowerName.includes('petrole')) targetKey = 'Pétrole lampant'

    if (targetKey && groupedSales[targetKey]) {
      const vol = Number(meta.volume_litres) || 0
      const ttc = Number(s.total_amount) || 0
      let ht = Number(s.subtotal_ht) || 0

      // Si le HT n'est pas renseigné, le calculer avec calculateTaxFromTTC
      if (!ht || ht <= 0) {
        const conf = configs.find(c => c.nom === targetKey)
        const isTaxable = conf ? conf.is_tva_applicable : false
        const tvaRate = conf ? conf.taux_tva : 18
        const taxRes = calculateTaxFromTTC(ttc, isTaxable, tvaRate)
        ht = taxRes.htPrice
      }

      groupedSales[targetKey].volume += vol
      groupedSales[targetKey].totalTTC += ttc
      groupedSales[targetKey].totalHT += ht
      groupedSales[targetKey].count += 1
    }
  }

  // 4. Calculer les indicateurs financiers par carburant
  const items: FuelProfitabilityItem[] = []

  let totVolume = 0
  let totTTC = 0
  let totHT = 0
  let totTVA = 0
  let totCOGS = 0
  let totMarge = 0

  for (const fuelDef of OFFICIAL_STATION_FUELS) {
    const conf = configs.find(c => c.nom === fuelDef.nom) || {
      code: fuelDef.code,
      nom: fuelDef.nom,
      prix_vente: fuelDef.defaultSellingPrice,
      prix_achat_reference: fuelDef.defaultCostPrice,
      taux_tva: 18,
      is_tva_applicable: true,
      statut_fiscal: 'Assujetti TVA (18%)'
    }

    const salesStats = groupedSales[fuelDef.nom] || { volume: 0, totalTTC: 0, totalHT: 0, count: 0 }
    const volVendu = Math.round(salesStats.volume * 100) / 100
    const caTTC = salesStats.totalTTC

    // Coût d'achat CUMP retenu
    const costInfo = await calculateFuelAcquisitionCost(
      companyId,
      fuelDef.nom,
      conf.prix_achat_reference,
      options.dateStart,
      options.dateEnd
    )

    // Calcul fiscal selon assujettissement
    const isTaxable = conf.is_tva_applicable
    const tvaRate = conf.taux_tva
    let caNetHT = salesStats.totalHT

    if (!caNetHT || caNetHT <= 0) {
      const taxCalc = calculateTaxFromTTC(caTTC, isTaxable, tvaRate)
      caNetHT = taxCalc.htPrice
    }

    const tvaCollectee = Math.max(0, caTTC - caNetHT)

    // Prix de vente unitaire moyen
    const puVenteTTC = volVendu > 0 ? Math.round((caTTC / volVendu) * 100) / 100 : conf.prix_vente
    const puVenteHT = volVendu > 0 ? Math.round((caNetHT / volVendu) * 100) / 100 : (
      isTaxable ? Math.round((conf.prix_vente / (1 + tvaRate / 100)) * 100) / 100 : conf.prix_vente
    )

    // Coût des ventes (COGS) — Conversion en HT pour cohérence stricte avec caNetHT (jamais HT - TTC)
    const coutUnitaireTTC = costInfo.unitCost
    const coutUnitaireHT = (isTaxable && tvaRate > 0 && coutUnitaireTTC > 0)
      ? Math.round((coutUnitaireTTC / (1 + tvaRate / 100)) * 100) / 100
      : coutUnitaireTTC
    const cogs = costInfo.hasKnownCost ? Math.round(volVendu * coutUnitaireHT) : 0

    // Marge brute totale & unitaire (HT - HT)
    const margeTotale = costInfo.hasKnownCost ? Math.round((caNetHT - cogs) * 100) / 100 : 0
    const margeUnitaire = costInfo.hasKnownCost ? Math.round((puVenteHT - coutUnitaireHT) * 100) / 100 : 0

    // Taux de marge = (Marge / Coût Achat) * 100
    const tauxMarge = (costInfo.hasKnownCost && cogs > 0)
      ? Math.round(((margeTotale / cogs) * 100) * 10) / 10
      : 0

    // Taux de marque = (Marge / CA Net HT) * 100
    const tauxMarque = (costInfo.hasKnownCost && caNetHT > 0)
      ? Math.round(((margeTotale / caNetHT) * 100) * 10) / 10
      : 0

    items.push({
      code: fuelDef.code,
      nom: fuelDef.nom,
      quantiteVendueLitres: volVendu,
      prixVenteUnitaireMoyen: puVenteTTC,
      prixVenteUnitaireHT: puVenteHT,
      coutAchatUnitaireRetenu: coutUnitaireHT,
      hasCoutAchat: costInfo.hasKnownCost,
      chiffreAffairesTTC: caTTC,
      chiffreAffairesNetHT: caNetHT,
      tvaCollectee,
      coutQuantitesVendues: cogs,
      margeBruteUnitaire: margeUnitaire,
      margeBruteTotale: margeTotale,
      tauxMarge,
      tauxMarque,
      statutFiscal: conf.statut_fiscal || (isTaxable ? `TVA ${tvaRate}%` : 'Exonéré / TPS')
    })

    totVolume += volVendu
    totTTC += caTTC
    totHT += caNetHT
    totTVA += tvaCollectee
    totCOGS += cogs
    totMarge += margeTotale
  }

  const totals = {
    quantiteVendueLitres: Math.round(totVolume * 100) / 100,
    chiffreAffairesTTC: totTTC,
    chiffreAffairesNetHT: totHT,
    tvaCollectee: totTVA,
    coutQuantitesVendues: totCOGS,
    margeBruteTotale: totMarge,
    tauxMargeMoyen: totCOGS > 0 ? Math.round(((totMarge / totCOGS) * 100) * 10) / 10 : 0,
    tauxMarqueMoyen: totHT > 0 ? Math.round(((totMarge / totHT) * 100) * 10) / 10 : 0
  }

  return { items, totals }
}

/**
 * 6. Fiche journalière complète des carburants
 * Alimentée à 100% à partir des opérations réelles du jour sélectionné.
 */
export async function getDailyFuelSheet(
  companyId: string,
  dateIso: string,
  options?: {
    companyRegime?: string
    defaultTvaRate?: number
  }
): Promise<DailyFuelSheetItem[]> {
  if (!companyId) return []

  const dateStr = dateIso.slice(0, 10)
  const startOfDay = `${dateStr}T00:00:00.000Z`
  const endOfDay = `${dateStr}T23:59:59.999Z`

  try {
    // 1. Cuves actuelles
    const { data: cuves } = await supabase
      .from('station_cuves')
      .select('*')
      .eq('company_id', companyId)

    // 2. Réceptions du jour
    const { data: receptions } = await supabase
      .from('station_receptions_carburant')
      .select('*')
      .eq('company_id', companyId)
      .eq('date_reception', dateStr)
      .in('statut', ['VALIDE', 'AVEC_ECART'])

    // 3. Jaugeages du jour
    const { data: jaugeages } = await supabase
      .from('station_jaugeages')
      .select('*')
      .eq('company_id', companyId)
      .eq('date_jaugeage', dateStr)
      .order('created_at', { ascending: false })

    // 4. Ventes du jour
    const { data: sales } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', 'station-service')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .neq('status', 'CANCELLED')

    // 5. Configs officielles
    const configs = await loadFuelCommercialConfigs(companyId, options?.companyRegime, options?.defaultTvaRate)

    return OFFICIAL_STATION_FUELS.map(fuelDef => {
      const conf = configs.find(c => c.nom === fuelDef.nom) || {
        code: fuelDef.code,
        nom: fuelDef.nom,
        prix_vente: fuelDef.defaultSellingPrice,
        prix_achat_reference: fuelDef.defaultCostPrice,
        taux_tva: 18,
        is_tva_applicable: true,
        statut_fiscal: 'Assujetti'
      }

      // Cuves reliées à ce carburant
      const fuelCuves = (cuves || []).filter((c: any) => {
        const prod = (c.produit || c.fuel_type || '').toLowerCase()
        const fNom = fuelDef.nom.toLowerCase()
        return prod === fNom || (fNom.includes('super') && prod.includes('super')) ||
          (fNom.includes('gasoil') && prod.includes('gasoil')) ||
          (fNom.includes('pétrole') && (prod.includes('pétrole') || prod.includes('petrole')))
      })

      // Réceptions du jour pour ce carburant
      const fuelReceptions = (receptions || []).filter((r: any) => {
        const prod = (r.produit || '').toLowerCase()
        const fNom = fuelDef.nom.toLowerCase()
        return prod === fNom || (fNom.includes('super') && prod.includes('super')) ||
          (fNom.includes('gasoil') && prod.includes('gasoil')) ||
          (fNom.includes('pétrole') && (prod.includes('pétrole') || prod.includes('petrole')))
      })
      const recVol = fuelReceptions.reduce((sum: number, r: any) => sum + (Number(r.quantite_recue) || 0), 0)

      // Ventes du jour pour ce carburant
      const fuelSales = (sales || []).filter((s: any) => {
        const meta = s.metadata || {}
        const prod = (meta.produit || '').toLowerCase()
        const notes = (s.notes || '').toLowerCase()
        const fNom = fuelDef.nom.toLowerCase()
        return (
          prod === fNom ||
          (fNom.includes('super') && (prod.includes('super') || notes.includes('super'))) ||
          (fNom.includes('gasoil') && (prod.includes('gasoil') || notes.includes('gasoil'))) ||
          (fNom.includes('pétrole') && (prod.includes('pétrole') || prod.includes('petrole') || notes.includes('petrole')))
        )
      })

      let soldVol = 0
      let caTTC = 0
      let encEspeces = 0
      let encMomo = 0
      let encCredit = 0

      for (const s of fuelSales) {
        const meta = s.metadata || {}
        const vol = Number(meta.volume_litres) || 0
        const mnt = Number(s.total_amount) || 0
        const pay = (s.payment_method || '').toUpperCase()

        soldVol += vol
        caTTC += mnt

        if (pay === 'CASH' || pay === 'ESPECES') encEspeces += mnt
        else if (pay === 'MOMO' || pay === 'MOBILE_MONEY') encMomo += mnt
        else if (pay === 'CREDIT') encCredit += mnt
        else encEspeces += mnt
      }

      // Stock physique du jaugeage le plus récent du jour
      const fuelJauge = (jaugeages || []).find((j: any) => {
        const prod = (j.produit || '').toLowerCase()
        const fNom = fuelDef.nom.toLowerCase()
        return prod === fNom || (fNom.includes('super') && prod.includes('super')) ||
          (fNom.includes('gasoil') && prod.includes('gasoil')) ||
          (fNom.includes('pétrole') && (prod.includes('pétrole') || prod.includes('petrole')))
      })

      const stockPhysique = fuelJauge ? Number(fuelJauge.volume_mesure) : null

      // Stock initial estimé = Stock cuve actuel + Ventes - Réceptions
      const currentStockCuves = fuelCuves.reduce((s: number, c: any) => s + (Number(c.stock_actuel) || 0), 0)
      const stockTheoriqueFinal = currentStockCuves
      const stockInitial = Math.max(0, stockTheoriqueFinal + soldVol - recVol)
      const ecartStock = stockPhysique !== null ? stockPhysique - stockTheoriqueFinal : 0

      // Décomposition fiscale & marges
      const taxCalc = calculateTaxFromTTC(caTTC, conf.is_tva_applicable, conf.taux_tva)
      const caNetHT = taxCalc.htPrice
      const tvaCollectee = taxCalc.vatAmount

      const coutUnitaireTTC = conf.prix_achat_reference || 0
      const coutUnitaireHT = (conf.is_tva_applicable && conf.taux_tva > 0 && coutUnitaireTTC > 0)
        ? Math.round((coutUnitaireTTC / (1 + conf.taux_tva / 100)) * 100) / 100
        : coutUnitaireTTC
      const hasCout = coutUnitaireTTC > 0
      const coutVentes = hasCout ? Math.round(soldVol * coutUnitaireHT) : 0
      const margeBrute = hasCout ? Math.round((caNetHT - coutVentes) * 100) / 100 : 0

      return {
        code: fuelDef.code,
        nom: fuelDef.nom,
        stockInitial: Math.round(stockInitial),
        receptionsLitres: Math.round(recVol),
        quantiteVendueLitres: Math.round(soldVol * 100) / 100,
        stockTheoriqueFinal: Math.round(stockTheoriqueFinal),
        stockPhysiqueJauge: stockPhysique !== null ? Math.round(stockPhysique) : null,
        ecartStockLitres: Math.round(ecartStock),
        chiffreAffairesTTC: caTTC,
        chiffreAffairesNetHT: caNetHT,
        tvaCollectee,
        coutVentes,
        margeBrute,
        hasCoutAchat: hasCout,
        encaissementsEspeces: encEspeces,
        encaissementsMomo: encMomo,
        encaissementsCredit: encCredit,
        totalEncaissements: encEspeces + encMomo + encCredit
      }
    })
  } catch (err) {
    console.error('[stationFuelService] Erreur getDailyFuelSheet:', err)
    return []
  }
}

// =============================================================================
// GESTIO 229 — PARAMÉTRAGE PERMANENT DU POURCENTAGE D'EXONÉRATION DE TVA
// Spécifique Secteur Station-Service (CGI Bénin & UEMOA)
// =============================================================================

export interface StationExonerationHistoryItem {
  ancien_taux_pct: number
  nouveau_taux_pct: number
  is_active: boolean
  date_modification: string
  user_id?: string
  user_name?: string
}

export interface StationExonerationConfig {
  is_active: boolean
  taux_exoneration_pct: number // Entre 0 et 100
  updated_at?: string
  updated_by_id?: string
  updated_by_name?: string
  history?: StationExonerationHistoryItem[]
}

const DEFAULT_STATION_EXONERATION_CONFIG: StationExonerationConfig = {
  is_active: false,
  taux_exoneration_pct: 0,
  history: []
}

/**
 * Clé de stockage locale pour isolation multisite & multi-entreprise
 */
function getExonerationStorageKey(companyId: string, siteId?: string): string {
  const safeSite = siteId && siteId !== 'all' ? siteId : 'default'
  return `gestio229_station_exoneration_${companyId}_${safeSite}`
}

/**
 * Récupère le paramétrage permanent d'exonération TVA pour la Station-Service
 */
export async function getStationExonerationConfig(
  companyId: string,
  siteId?: string
): Promise<StationExonerationConfig> {
  if (!companyId) return { ...DEFAULT_STATION_EXONERATION_CONFIG }

  const storageKey = getExonerationStorageKey(companyId, siteId)

  // 1. Essai de lecture depuis Supabase (companies.settings ou sector_meta)
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .maybeSingle()

    if (!error && data?.settings) {
      const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings
      const siteKey = siteId && siteId !== 'all' ? `station_exoneration_${siteId}` : 'station_exoneration'
      const cfg = settings[siteKey] || settings.station_exoneration

      if (cfg) {
        const loaded: StationExonerationConfig = {
          is_active: Boolean(cfg.is_active),
          taux_exoneration_pct: Math.min(100, Math.max(0, Number(cfg.taux_exoneration_pct) || 0)),
          updated_at: cfg.updated_at,
          updated_by_id: cfg.updated_by_id,
          updated_by_name: cfg.updated_by_name,
          history: Array.isArray(cfg.history) ? cfg.history : []
        }
        // Cache local pour résilience offline / ultra-rapide
        try {
          localStorage.setItem(storageKey, JSON.stringify(loaded))
        } catch (_) {}
        return loaded
      }
    }
  } catch (err) {
    console.warn('[stationFuelService] Notice chargement distant exoneration config:', err)
  }

  // 2. Fallback localStorage
  try {
    const cached = localStorage.getItem(storageKey)
    if (cached) {
      const parsed = JSON.parse(cached)
      return {
        is_active: Boolean(parsed.is_active),
        taux_exoneration_pct: Math.min(100, Math.max(0, Number(parsed.taux_exoneration_pct) || 0)),
        updated_at: parsed.updated_at,
        updated_by_id: parsed.updated_by_id,
        updated_by_name: parsed.updated_by_name,
        history: Array.isArray(parsed.history) ? parsed.history : []
      }
    }
  } catch (_) {}

  return { ...DEFAULT_STATION_EXONERATION_CONFIG }
}

/**
 * Enregistre de manière permanente le paramétrage d'exonération de TVA avec historique d'audit
 */
export async function saveStationExonerationConfig(
  companyId: string,
  newConfig: { is_active: boolean; taux_exoneration_pct: number },
  siteId?: string,
  user?: { id?: string; name?: string }
): Promise<{ success: boolean; data?: StationExonerationConfig; error?: string }> {
  if (!companyId) {
    return { success: false, error: 'Identifiant entreprise manquant' }
  }

  try {
    const current = await getStationExonerationConfig(companyId, siteId)
    const nowIso = new Date().toISOString()
    const sanitizedTaux = Math.min(100, Math.max(0, Number(newConfig.taux_exoneration_pct) || 0))

    const historyItem: StationExonerationHistoryItem = {
      ancien_taux_pct: current.taux_exoneration_pct,
      nouveau_taux_pct: sanitizedTaux,
      is_active: newConfig.is_active,
      date_modification: nowIso,
      user_id: user?.id,
      user_name: user?.name || 'Administrateur'
    }

    const updatedHistory = [historyItem, ...(current.history || [])].slice(0, 50)

    const updatedConfig: StationExonerationConfig = {
      is_active: Boolean(newConfig.is_active),
      taux_exoneration_pct: sanitizedTaux,
      updated_at: nowIso,
      updated_by_id: user?.id,
      updated_by_name: user?.name,
      history: updatedHistory
    }

    // 1. Sauvegarde localStorage
    const storageKey = getExonerationStorageKey(companyId, siteId)
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedConfig))
      // Sauvegarder aussi la clé globale par défaut pour synchronisation fluide
      localStorage.setItem(`gestio229_station_exoneration_${companyId}_default`, JSON.stringify(updatedConfig))
    } catch (_) {}

    // 2. Sauvegarde Supabase dans companies.settings
    try {
      const { data: compData } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .maybeSingle()

      const prevSettings = compData?.settings
        ? (typeof compData.settings === 'string' ? JSON.parse(compData.settings) : compData.settings)
        : {}

      const siteKey = siteId && siteId !== 'all' ? `station_exoneration_${siteId}` : 'station_exoneration'

      const mergedSettings = {
        ...prevSettings,
        [siteKey]: updatedConfig,
        station_exoneration: updatedConfig // Référence permanente
      }

      await supabase
        .from('companies')
        .update({
          settings: mergedSettings,
          updated_at: nowIso
        })
        .eq('id', companyId)
    } catch (dbErr) {
      console.warn('[stationFuelService] Notice persistence Supabase exoneration config (sauvegarde locale maintenue):', dbErr)
    }

    return { success: true, data: updatedConfig }
  } catch (err: any) {
    console.error('[stationFuelService] Erreur saveStationExonerationConfig:', err)
    return { success: false, error: err?.message || 'Erreur lors de l\'enregistrement' }
  }
}

export interface FuelTaxExonerationResult {
  tauxExonerationPct: number
  isExonereActive: boolean
  montantTotalTTC: number
  montantExonere: number
  montantTaxableTTC: number
  montantTaxableHT: number
  montantTVA: number
  vatRate: number
}

/**
 * Calcul automatique de la décomposition fiscale carburant avec exonération partielle/totale permanente
 *
 * Formules conformes CGI :
 * 1. Montant exonéré = Montant total TTC × Pourcentage d'exonération
 * 2. Montant taxable TTC = Montant total TTC - Montant exonéré
 * 3. Montant net HT taxable = Montant taxable TTC / (1 + Taux TVA / 100)
 * 4. Montant TVA (18%) = Montant taxable TTC - Montant net HT taxable
 * 5. Total TTC = Montant exonéré + Montant taxable TTC
 */
export function calculateFuelExonerationTax(
  totalTTC: number,
  exonerationConfig?: StationExonerationConfig | null,
  vatRate: number = 18
): FuelTaxExonerationResult {
  const mntTTC = Math.max(0, Math.round(Number(totalTTC) || 0))
  const rate = Math.max(0, Number(vatRate) || 18)

  const isActive = Boolean(exonerationConfig?.is_active)
  const tauxPct = isActive ? Math.min(100, Math.max(0, Number(exonerationConfig?.taux_exoneration_pct) || 0)) : 0

  if (!isActive || tauxPct <= 0) {
    // Aucune exonération : 100% taxable
    const ht = rate > 0 ? Math.round((mntTTC / (1 + rate / 100)) * 100) / 100 : mntTTC
    const tva = Math.round((mntTTC - ht) * 100) / 100
    return {
      tauxExonerationPct: 0,
      isExonereActive: false,
      montantTotalTTC: mntTTC,
      montantExonere: 0,
      montantTaxableTTC: mntTTC,
      montantTaxableHT: ht,
      montantTVA: tva,
      vatRate: rate
    }
  }

  // Calcul avec exonération active
  // 1. Montant exonéré = Montant total TTC × Pourcentage d'exonération
  const montantExonere = Math.round(mntTTC * (tauxPct / 100))

  // 2. Montant taxable TTC = Montant total TTC - Montant exonéré
  const montantTaxableTTC = Math.max(0, mntTTC - montantExonere)

  // 3. Montant net HT taxable = Montant taxable TTC / (1 + Taux TVA / 100)
  const montantTaxableHT = (rate > 0 && montantTaxableTTC > 0)
    ? Math.round((montantTaxableTTC / (1 + rate / 100)) * 100) / 100
    : montantTaxableTTC

  // 4. Montant TVA (18%) = Montant taxable TTC - Montant net HT taxable
  const montantTVA = Math.round((montantTaxableTTC - montantTaxableHT) * 100) / 100

  return {
    tauxExonerationPct: tauxPct,
    isExonereActive: true,
    montantTotalTTC: mntTTC,
    montantExonere,
    montantTaxableTTC,
    montantTaxableHT,
    montantTVA,
    vatRate: rate
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. GESTION UNIFIÉE DES CUVES, DÉDUPLICATION & SOURCE DE VÉRITÉ UNIQUE
// ══════════════════════════════════════════════════════════════════════════════

export interface StationCuve {
  id: string
  company_id: string
  sector_slug: string
  code: string
  nom: string
  produit: string
  capacite: number
  stock_actuel: number
  stock_theorique: number
  niveau_min: number
  niveau_max?: number
  unite?: string
  statut: string
  emplacement?: string
  updated_at?: string
}

/**
 * Charge les cuves opérationnelles réelles de l'entreprise avec déduplication stricte.
 * Source de vérité unique partagée entre le module Gestion des Cuves et le module Vente Distributeur.
 */
export async function loadOperationalCuves(
  companyId: string,
  sectorSlug?: string
): Promise<StationCuve[]> {
  if (!companyId) return []
  const clean = canonicalSectorSlug(sectorSlug || 'station-service')

  try {
    const { data, error } = await supabase
      .from('station_cuves')
      .select('*')
      .eq('company_id', companyId)
      .in('sector_slug', [clean, 'station-service', 'station'])
      .order('created_at', { ascending: false })

    if (error || !data) {
      console.warn('[loadOperationalCuves] Erreur chargement cuves:', error)
      return []
    }

    const seenIds = new Set<string>()
    const seenBusinessKeys = new Set<string>()
    const deduplicated: StationCuve[] = []

    for (const raw of data) {
      if (seenIds.has(raw.id)) continue
      seenIds.add(raw.id)

      const normCode = String(raw.code || '').trim().toUpperCase()
      const normNom = String(raw.nom || '').trim().toUpperCase()
      const normProd = String(raw.produit || raw.fuel_type || '').trim().toUpperCase()
      const businessKey = `${normCode}|${normNom}|${normProd}`

      if (businessKey && businessKey !== '||' && seenBusinessKeys.has(businessKey)) {
        // Doublon accidentel détecté (ex: deux cartes avec le même code et nom)
        // Conserver celui qui a le stock le plus pertinent ou le plus récent
        const existingIdx = deduplicated.findIndex(
          x => `${String(x.code).trim().toUpperCase()}|${String(x.nom).trim().toUpperCase()}|${String(x.produit).trim().toUpperCase()}` === businessKey
        )
        if (existingIdx >= 0) {
          const existingStock = Number(deduplicated[existingIdx].stock_actuel || 0)
          const currentStock = Number(raw.stock_actuel || 0)
          if (currentStock > existingStock) {
            deduplicated[existingIdx] = {
              ...raw,
              capacite: Number(raw.capacite ?? raw.capacite_totale ?? raw.capacity_liters ?? 30000),
              stock_actuel: currentStock,
              stock_theorique: Number(raw.stock_theorique ?? currentStock),
              niveau_min: Number(raw.niveau_min ?? raw.min_alert_liters ?? 2000),
            }
          }
        }
        continue
      }

      if (businessKey && businessKey !== '||') {
        seenBusinessKeys.add(businessKey)
      }

      const cap = Number(raw.capacite ?? raw.capacite_totale ?? raw.capacity_liters ?? 30000)
      const stActuel = Number(raw.stock_actuel ?? raw.current_volume_liters ?? 0)
      const stTheo = Number(raw.stock_theorique ?? stActuel)
      const nMin = Number(raw.niveau_min ?? raw.min_alert_liters ?? 2000)

      deduplicated.push({
        id: raw.id,
        company_id: raw.company_id,
        sector_slug: raw.sector_slug || clean,
        code: raw.code || `CV-${deduplicated.length + 1}`,
        nom: raw.nom || `Cuve ${deduplicated.length + 1}`,
        produit: raw.produit || raw.fuel_type || 'Essence Super',
        capacite: cap,
        stock_actuel: Math.max(0, stActuel),
        stock_theorique: Math.max(0, stTheo),
        niveau_min: nMin,
        niveau_max: Number(raw.niveau_max || cap),
        unite: raw.unite || 'L',
        statut: raw.statut || 'ACTIF',
        emplacement: raw.emplacement,
        updated_at: raw.updated_at,
      })
    }

    // Filtrer les cuves opérationnelles (non supprimées / actives)
    return deduplicated.filter(c => {
      const st = String(c.statut || '').toUpperCase().trim()
      return !st || st === 'ACTIF' || st === 'ACTIVE' || st === 'NORMAL' || st === 'OPERATIONNEL'
    })
  } catch (err) {
    console.error('[loadOperationalCuves] Exception:', err)
    return []
  }
}

/**
 * Vérifie si une cuve avec le même code ou nom existe déjà dans l'entreprise pour éviter les doublons accidentels.
 */
export async function checkDuplicateCuve(
  companyId: string,
  code: string,
  nom: string,
  sectorSlug?: string
): Promise<{ exists: boolean; existingCuve?: StationCuve }> {
  const cuves = await loadOperationalCuves(companyId, sectorSlug)
  const normCode = String(code || '').trim().toUpperCase()
  const normNom = String(nom || '').trim().toUpperCase()

  const match = cuves.find(
    c => (normCode && String(c.code).trim().toUpperCase() === normCode) ||
         (normNom && String(c.nom).trim().toUpperCase() === normNom)
  )

  return { exists: Boolean(match), existingCuve: match }
}

// ══════════════════════════════════════════════════════════════════════════════
// 13. CIRCUIT DES SHIFTS POMPISTES : OUVERTURE, AFFECTATION, VENTES & CLÔTURE
// ══════════════════════════════════════════════════════════════════════════════

export interface StationShiftRecord {
  id: string
  reference: string
  company_id: string
  sector_slug: string
  date: string
  heure_ouverture?: string
  heure_cloture?: string
  type_shift: string
  pompiste_id: string
  pompiste_nom: string
  pompe_id: string
  pompe_numero: string
  cuve_id?: string
  cuve_nom?: string
  produit: string
  index_debut: number
  index_fin: number
  volume_distribue: number
  prix_litre: number
  montant_theorique: number
  montant_verse: number
  montant_especes: number
  montant_momo: number
  montant_credit: number
  ecart: number
  motif_ecart?: string
  valide_par?: string
  statut: 'OUVERT' | 'EN_COURS' | 'CLOTURE' | 'VALIDE' | 'VALIDE_AVEC_ECART'
  caisse_integree?: boolean
  created_at: string
}

export interface OpenShiftParams {
  companyId: string
  sectorSlug?: string
  pompisteId: string
  pompisteNom: string
  pompeId: string
  pompeNumero: string
  cuveId?: string
  cuveNom?: string
  produit: string
  typeShift?: string
  indexDebut: number
  date?: string
  heureOuverture?: string
  ouvertPar?: string
}

/**
 * Ouvre un nouveau shift pompiste avec affectation obligatoire de la pompe et de la cuve.
 * Enregistre le shift dans la base avec le statut 'OUVERT' (ou 'EN_COURS').
 */
export async function openPompisteShift(
  params: OpenShiftParams
): Promise<{ success: boolean; shift?: StationShiftRecord; error?: string }> {
  const { companyId, pompisteId, pompeId, cuveId, indexDebut } = params
  if (!companyId) return { success: false, error: 'Identifiant entreprise manquant' }
  if (!pompisteId) return { success: false, error: 'Veuillez sélectionner le pompiste concerné' }
  if (!pompeId) return { success: false, error: 'Veuillez sélectionner la pompe de travail' }

  const cleanSlug = canonicalSectorSlug(params.sectorSlug || 'station-service')

  // 1. Contrôle anti-conflit : le pompiste ne doit pas avoir un shift déjà ouvert
  const activeShift = await getActiveShiftForPompiste(companyId, pompisteId, cleanSlug)
  if (activeShift) {
    return {
      success: false,
      error: `Le pompiste ${params.pompisteNom} a déjà un shift en cours (${activeShift.reference}). Clôturez d'abord le shift précédent.`
    }
  }

  // 2. Contrôle anti-conflit pompe : la pompe ne doit pas être utilisée sur un autre shift ouvert
  const openShifts = await getOpenShifts(companyId, cleanSlug)
  const conflictingPompe = openShifts.find(s => s.pompe_id === pompeId && s.pompiste_id !== pompisteId)
  if (conflictingPompe) {
    return {
      success: false,
      error: `La pompe ${params.pompeNumero} est déjà affectée au shift actif de ${conflictingPompe.pompiste_nom} (${conflictingPompe.reference}).`
    }
  }

  const now = new Date()
  const dateStr = params.date || now.toISOString().slice(0, 10)
  const heureStr = params.heureOuverture || now.toTimeString().slice(0, 5)
  const refNum = `SHF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`

  const payload: any = {
    company_id: companyId,
    sector_slug: cleanSlug,
    reference: refNum,
    date: dateStr,
    type_shift: params.typeShift || 'Matin',
    pompiste_id: pompisteId,
    pompiste_nom: params.pompisteNom,
    pompe_id: pompeId,
    pompe_numero: params.pompeNumero,
    cuve_id: cuveId || null,
    cuve_nom: params.cuveNom || null,
    produit: params.produit || 'Essence Super',
    index_debut: Number(indexDebut) || 0,
    index_fin: Number(indexDebut) || 0,
    volume_distribue: 0,
    prix_litre: 0,
    montant_theorique: 0,
    montant_verse: 0,
    montant_especes: 0,
    montant_momo: 0,
    montant_credit: 0,
    ecart: 0,
    valide_par: params.ouvertPar || 'Chef de piste',
    statut: 'OUVERT',
    created_at: now.toISOString(),
  }

  try {
    // Tentative d'insertion avec 'OUVERT'
    let { data, error } = await safeStationInsert(supabase, 'station_shifts_clotures', {
      ...payload,
      tenant_id: companyId,
    })

    // Repli sur 'EN_COURS' si la contrainte CHECK SQL restreint à EN_COURS
    if (error && (String(error.message).includes('check') || String(error.message).includes('statut'))) {
      payload.statut = 'EN_COURS'
      const retry = await safeStationInsert(supabase, 'station_shifts_clotures', {
        ...payload,
        tenant_id: companyId,
      })
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[openPompisteShift] Erreur insertion shift:', error)
      return { success: false, error: error.message || "Erreur lors de l'enregistrement du shift" }
    }

    return {
      success: true,
      shift: { ...payload, id: data?.id || refNum }
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Exception lors de l'ouverture du shift" }
  }
}

/**
 * Récupère le shift actuellement ouvert / en cours pour un pompiste donné.
 */
export async function getActiveShiftForPompiste(
  companyId: string,
  pompisteId: string,
  sectorSlug?: string
): Promise<StationShiftRecord | null> {
  if (!companyId || !pompisteId) return null
  const cleanSlug = canonicalSectorSlug(sectorSlug || 'station-service')

  try {
    const { data, error } = await supabase
      .from('station_shifts_clotures')
      .select('*')
      .eq('company_id', companyId)
      .eq('pompiste_id', pompisteId)
      .in('statut', ['OUVERT', 'EN_COURS', 'ouvert', 'en_cours'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0] as StationShiftRecord
  } catch {
    return null
  }
}

/**
 * Récupère tous les shifts actuellement ouverts de la station.
 */
export async function getOpenShifts(
  companyId: string,
  sectorSlug?: string
): Promise<StationShiftRecord[]> {
  if (!companyId) return []
  const cleanSlug = canonicalSectorSlug(sectorSlug || 'station-service')

  try {
    const { data, error } = await supabase
      .from('station_shifts_clotures')
      .select('*')
      .eq('company_id', companyId)
      .in('sector_slug', [cleanSlug, 'station-service', 'station'])
      .in('statut', ['OUVERT', 'EN_COURS', 'ouvert', 'en_cours'])
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as StationShiftRecord[]
  } catch {
    return []
  }
}

/**
 * Calcule le récapitulatif réel des ventes associées à un shift depuis sales_orders.
 */
export async function getShiftSalesSummary(
  companyId: string,
  shiftId: string,
  pompisteId?: string,
  dateStr?: string
): Promise<{
  volumeTotal: number
  caTheorique: number
  montantEspeces: number
  montantMoMo: number
  montantCredit: number
  nbVentes: number
  sales: any[]
}> {
  if (!companyId) {
    return { volumeTotal: 0, caTheorique: 0, montantEspeces: 0, montantMoMo: 0, montantCredit: 0, nbVentes: 0, sales: [] }
  }

  try {
    // 1. Rechercher par shift_id dans metadata
    let query = supabase
      .from('sales_orders')
      .select('id, order_number, total_amount, payment_method, metadata, created_at')
      .eq('company_id', companyId)
      .not('status', 'in', '("CANCELLED","annule","annulée")')

    const { data: allSales } = await query

    const shiftSales = (allSales || []).filter((s: any) => {
      const meta = s.metadata || {}
      if (meta.shift_id && meta.shift_id === shiftId) return true
      if (shiftId && meta.shift_reference && meta.shift_reference === shiftId) return true
      // Repli si shift_id non encore injecté : filtrer par pompiste_id et date
      if (pompisteId && meta.pompiste_id === pompisteId && dateStr) {
        return String(s.created_at || '').startsWith(dateStr)
      }
      return false
    })

    let volumeTotal = 0
    let caTheorique = 0
    let montantEspeces = 0
    let montantMoMo = 0
    let montantCredit = 0

    for (const s of shiftSales) {
      const meta = s.metadata || {}
      const vol = Number(meta.volume_litres) || 0
      const total = Number(s.total_amount) || 0
      const pay = String(s.payment_method || '').toUpperCase()

      volumeTotal += vol
      caTheorique += total

      if (pay === 'CASH' || pay === 'ESPECES') {
        montantEspeces += total
      } else if (pay === 'MOMO' || pay === 'MOBILE_MONEY' || pay === 'FLOOZ' || pay === 'MTN') {
        montantMoMo += total
      } else {
        montantCredit += total
      }
    }

    return {
      volumeTotal: Math.round(volumeTotal * 100) / 100,
      caTheorique: Math.round(caTheorique),
      montantEspeces: Math.round(montantEspeces),
      montantMoMo: Math.round(montantMoMo),
      montantCredit: Math.round(montantCredit),
      nbVentes: shiftSales.length,
      sales: shiftSales,
    }
  } catch (err) {
    console.warn('[getShiftSalesSummary] Erreur calcul ventes shift:', err)
    return { volumeTotal: 0, caTheorique: 0, montantEspeces: 0, montantMoMo: 0, montantCredit: 0, nbVentes: 0, sales: [] }
  }
}

export interface ClotureShiftParams {
  companyId: string
  shiftId: string
  sectorSlug?: string
  indexFin: number
  montantEspecesRemis: number
  montantMoMoConfirme: number
  montantCredit?: number
  motifEcart?: string
  validePar?: string
  caisseId?: string
  caisseSessionId?: string | null
}

/**
 * Clôture définitivement un shift avec réconciliation séparée des espèces et du Mobile Money
 * et intégration automatique dans la caisse de la station (idempotence stricte).
 */
export async function cloturerPompisteShift(
  params: ClotureShiftParams
): Promise<{ success: boolean; error?: string; shift?: any }> {
  const { companyId, shiftId, indexFin, montantEspecesRemis, montantMoMoConfirme } = params
  if (!companyId || !shiftId) {
    return { success: false, error: 'Identifiant entreprise ou shift manquant' }
  }

  const cleanSlug = canonicalSectorSlug(params.sectorSlug || 'station-service')

  try {
    // 1. Charger le shift en cours
    const { data: shiftData, error: sErr } = await supabase
      .from('station_shifts_clotures')
      .select('*')
      .eq('id', shiftId)
      .single()

    if (sErr || !shiftData) {
      return { success: false, error: 'Shift introuvable en base de données' }
    }

    const idxDebut = Number(shiftData.index_debut) || 0
    const idxFin = Number(indexFin)
    if (idxFin < idxDebut) {
      return { success: false, error: `L'index de fin (${idxFin}) ne peut pas être inférieur à l'index de départ (${idxDebut})` }
    }

    const volDistribue = Math.round((idxFin - idxDebut) * 100) / 100
    const pu = Number(shiftData.prix_litre) || 680
    const caTheorique = Math.round(volDistribue * pu)

    const espRemis = Math.round(Number(montantEspecesRemis) || 0)
    const momoConfirme = Math.round(Number(montantMoMoConfirme) || 0)
    const credit = Math.round(Number(params.montantCredit) || 0)
    const totalVerse = espRemis + momoConfirme + credit
    const ecart = totalVerse - caTheorique // Négatif = manquant

    const nowIso = new Date().toISOString()
    const statutCloture = ecart < 0 ? 'VALIDE_AVEC_ECART' : 'CLOTURE'

    // 2. Mettre à jour le shift
    const { error: updErr } = await supabase
      .from('station_shifts_clotures')
      .update({
        index_fin: idxFin,
        volume_distribue: volDistribue,
        montant_theorique: caTheorique,
        montant_verse: totalVerse,
        montant_especes: espRemis,
        montant_momo: momoConfirme,
        montant_credit: credit,
        ecart: ecart,
        motif_ecart: params.motifEcart || null,
        valide_par: params.validePar || 'Chef de piste',
        statut: statutCloture,
        caisse_integree: true,
        updated_at: nowIso,
      })
      .eq('id', shiftId)

    if (updErr) {
      console.error('[cloturerPompisteShift] Erreur mise à jour shift:', updErr)
      return { success: false, error: updErr.message || 'Erreur lors de la clôture du shift' }
    }

    // 3. Mettre à jour l'index actuel de la pompe
    if (shiftData.pompe_id) {
      await supabase
        .from('station_pompes')
        .update({ index_actuel: idxFin, updated_at: nowIso })
        .eq('id', shiftData.pompe_id)
    }

    // 4. Intégration en caisse (Séparation stricte ESPÈCES et MOBILE MONEY)
    // Garantir l'idempotence absolue : ne jamais insérer deux fois si déjà présent
    const sourceEspeces = `${shiftId}_especes`
    const sourceMoMo = `${shiftId}_momo`

    // A. Enregistrement ESPÈCES
    if (espRemis > 0) {
      try {
        const { data: existingEsp } = await supabase
          .from('caisse_mouvements')
          .select('id')
          .eq('company_id', companyId)
          .eq('source_module', 'station_shift_cloture')
          .eq('source_id', sourceEspeces)
          .limit(1)

        if (!existingEsp || existingEsp.length === 0) {
          await enregistrerMouvementCaisse({
            company_id: companyId,
            sector_slug: cleanSlug,
            caisse_id: params.caisseId,
            caisse_session_id: params.caisseSessionId || null,
            type: 'vente_carburant_shift',
            sens: 'entree',
            montant_especes: espRemis,
            montant_momo: 0,
            source_module: 'station_shift_cloture',
            source_id: sourceEspeces,
            motif: `Clôture Shift ${shiftData.reference} - Pompiste ${shiftData.pompiste_nom} (Remise Espèces)`,
            user_name: params.validePar || 'Chef de piste',
          })
        }
      } catch (caisseEspErr) {
        console.warn('[cloturerPompisteShift] Notice intégration caisse espèces:', caisseEspErr)
      }
    }

    // B. Enregistrement MOBILE MONEY
    if (momoConfirme > 0) {
      try {
        const { data: existingMoMo } = await supabase
          .from('caisse_mouvements')
          .select('id')
          .eq('company_id', companyId)
          .eq('source_module', 'station_shift_cloture')
          .eq('source_id', sourceMoMo)
          .limit(1)

        if (!existingMoMo || existingMoMo.length === 0) {
          await enregistrerMouvementCaisse({
            company_id: companyId,
            sector_slug: cleanSlug,
            caisse_id: params.caisseId,
            caisse_session_id: params.caisseSessionId || null,
            type: 'vente_carburant_shift',
            sens: 'entree',
            montant_especes: 0,
            montant_momo: momoConfirme,
            source_module: 'station_shift_cloture',
            source_id: sourceMoMo,
            motif: `Clôture Shift ${shiftData.reference} - Pompiste ${shiftData.pompiste_nom} (Rapprochement MoMo)`,
            user_name: params.validePar || 'Chef de piste',
          })
        }
      } catch (caisseMoMoErr) {
        console.warn('[cloturerPompisteShift] Notice intégration caisse MoMo:', caisseMoMoErr)
      }
    }

    return {
      success: true,
      shift: {
        ...shiftData,
        statut: statutCloture,
        index_fin: idxFin,
        volume_distribue: volDistribue,
        montant_theorique: caTheorique,
        montant_verse: totalVerse,
        montant_especes: espRemis,
        montant_momo: momoConfirme,
        ecart: ecart,
      }
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Exception lors de la clôture' }
  }
}

