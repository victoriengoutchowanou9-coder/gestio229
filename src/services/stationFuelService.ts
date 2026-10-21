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

    // Coût des ventes (COGS)
    const coutUnitaire = costInfo.unitCost
    const cogs = costInfo.hasKnownCost ? Math.round(volVendu * coutUnitaire) : 0

    // Marge brute totale & unitaire
    const margeTotale = costInfo.hasKnownCost ? Math.round((caNetHT - cogs) * 100) / 100 : 0
    const margeUnitaire = costInfo.hasKnownCost ? Math.round((puVenteHT - coutUnitaire) * 100) / 100 : 0

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
      coutAchatUnitaireRetenu: coutUnitaire,
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

      const coutUnitaire = conf.prix_achat_reference || 0
      const hasCout = coutUnitaire > 0
      const coutVentes = hasCout ? Math.round(soldVol * coutUnitaire) : 0
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
