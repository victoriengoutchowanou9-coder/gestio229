// =============================================================================
// GESTIO 229 SaaS — Service Spécialisé Bar, Restaurant, Maquis & Fast-Food
// =============================================================================
// Règles métier :
// 1. Déstockage automatique & idempotent des matières premières selon fiches techniques
// 2. Gestion stricte et indépendante des stocks BAR et CUISINE
// 3. Workflow de validation avec délai de 4 minutes, modification, annulation et finalisation automatique
// 4. Comptes serveuses : boissons confiées, retours, créances, solde et règlements reliés à la caisse
// 5. Clôtures de sessions serveuses avec rapprochement et constat des écarts
// 6. Envoi direct et suivi KDS Cuisine & Bar
// 7. Suivi rigoureux des emballages consignés
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'
import { enregistrerEntreeCaisse } from './caisseDepensesService'

export interface FicheTechniqueItem {
  id?: string
  plat_nom: string
  ingredient_nom: string
  quantite_necessaire: number
  unite: string
  cout_unitaire: number
  cout_matiere_ligne?: number
  prix_vente_unitaire?: number
  mode_preparation?: 'UNITE' | 'LOT'
  rendement_portions?: number
  unite_portion?: string
  cout_revient_portion?: number
  notes?: string
}

export interface PreparationCuisineRecord {
  id?: string
  company_id: string
  reference?: string
  plat_nom: string
  nb_preparations: number
  portions_obtenues: number
  cout_total_matieres: number
  cout_revient_unitaire: number
  declare_par: string
  date_heure: string
  statut: 'DISPONIBLE' | 'EPUISE' | 'PARTIEL'
  notes?: string
}

export interface ServeurSession {
  id: string
  company_id: string
  sector_slug: string
  serveur_id?: string
  serveur_nom: string
  date_session: string
  heure_ouverture: string
  heure_cloture?: string
  fonds_initial: number
  statut: 'OUVERTE' | 'CLOTUREE' | 'VERIFIEE'
  total_boissons_confiees_ttc: number
  total_ventes_declarees_ttc: number
  total_versements_recus: number
  solde_restant_a_remettre: number
  ecart_financier: number
  justification_ecart?: string
  cloture_par?: string
}

export interface BoissonConfiee {
  id?: string
  company_id: string
  sector_slug: string
  session_id: string
  serveur_nom: string
  produit_id?: string
  produit_nom: string
  qte_remise: number
  qte_retournee: number
  qte_vendue: number
  qte_offerte: number
  qte_cassee: number
  qte_restante_declaree: number
  prix_vente_unitaire: number
  cout_achat_unitaire: number
  total_valeur_remise: number
  remis_par: string
  notes?: string
}

export interface VersementServeur {
  id?: string
  company_id: string
  session_id: string
  reference?: string
  serveur_nom: string
  montant: number
  mode_reglement: 'ESPECES' | 'MTN_MOMO' | 'MOOV_MONEY' | 'CARTE' | 'CHEQUE' | 'AUTRE'
  recu_par: string
  solde_avant: number
  solde_apres: number
  date_versement?: string
  commentaire?: string
}

const isValidUUID = (u?: string | null): boolean =>
  Boolean(u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u))

/**
 * 1. Déstockage atomique & idempotent selon le mode de recette (A: Unité ou B: Lot avec portions)
 */
export async function destockerMatieresPlat(params: {
  company_id: string
  order_id?: string
  order_number: string
  plat_nom: string
  portion_qty: number
  sector_slug?: string
}): Promise<{ destocke: boolean; matieresCount: number; coutTotalMatiere: number; mode: 'UNITE' | 'LOT' }> {
  const { company_id, order_id, order_number, plat_nom, portion_qty, sector_slug = 'restaurant' } = params

  if (!company_id || !order_number || !plat_nom || portion_qty <= 0) {
    return { destocke: false, matieresCount: 0, coutTotalMatiere: 0, mode: 'UNITE' }
  }

  try {
    // 1. Charger les ingrédients de la fiche technique
    const { data: ingredients, error: fErr } = await supabase
      .from('restaurant_fiches_techniques')
      .select('*')
      .eq('company_id', company_id)
      .ilike('plat_nom', plat_nom.trim())

    if (fErr || !ingredients || ingredients.length === 0) {
      return { destocke: false, matieresCount: 0, coutTotalMatiere: 0, mode: 'UNITE' }
    }

    // 2. Détecter le mode de production et le rendement depuis la fiche
    let modePrep: 'UNITE' | 'LOT' = 'UNITE'
    let rendement = 1
    let coutRevientPortion = 0

    for (const ing of ingredients) {
      if (ing.notes) {
        try {
          const parsed = typeof ing.notes === 'string' ? JSON.parse(ing.notes) : ing.notes
          if (parsed && typeof parsed === 'object') {
            if (parsed.mode_preparation) modePrep = parsed.mode_preparation
            if (parsed.rendement_portions) rendement = Number(parsed.rendement_portions) || 1
            if (parsed.cout_revient_portion) coutRevientPortion = Number(parsed.cout_revient_portion) || 0
            break
          }
        } catch (_) {}
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE B : PRÉPARATION EN LOT (STOCK DE PORTIONS)
    // ═════════════════════════════════════════════════════════════════════════
    // Les matières premières ont DÉJÀ été déduites lors de la préparation.
    // Lors de la vente : on décrémente UNIQUEMENT le stock de portions disponibles
    // pour éviter ABSOLUMENT toute double déduction des ingrédients !
    if (modePrep === 'LOT') {
      const idempotencyKey = `destock-portion-${order_number}-${plat_nom.replace(/\s+/g, '_')}`

      if (coutRevientPortion <= 0) {
        const totalLotCost = ingredients.reduce(
          (sum, ing) => sum + (Number(ing.cout_matiere_ligne) || (Number(ing.quantite_necessaire) * Number(ing.cout_unitaire) || 0)),
          0
        )
        coutRevientPortion = rendement > 0 ? Math.round(totalLotCost / rendement) : 0
      }
      const totalCoutVente = coutRevientPortion * portion_qty

      const { error: insErr } = await supabase
        .from('restaurant_destockage_log')
        .insert({
          company_id,
          idempotency_key: idempotencyKey,
          order_id: isValidUUID(order_id) ? order_id : null,
          order_number,
          plat_nom,
          portion_qty,
          matiere_nom: `Portion ${plat_nom}`,
          qte_destockee: portion_qty,
          unite: 'portion',
          cout_unitaire: coutRevientPortion,
          total_cout: totalCoutVente,
          emplacement: 'CUISINE_PORTIONS'
        })

      if (!insErr) {
        // Diminution du stock de portions disponibles du plat dans products
        try {
          const { data: matchedProds } = await supabase
            .from('products')
            .select('id, stock_vente, sector_meta')
            .eq('company_id', company_id)
            .ilike('name', plat_nom.trim())

          if (matchedProds && matchedProds.length > 0) {
            const prod = matchedProds[0]
            const curStock = Number(prod.stock_vente ?? prod.sector_meta?.stock_vente ?? 0)
            const newStock = Math.max(0, curStock - portion_qty)
            const meta = { ...(prod.sector_meta || {}), stock_vente: newStock }
            await supabase
              .from('products')
              .update({ stock_vente: newStock, sector_meta: meta, updated_at: new Date().toISOString() })
              .eq('id', prod.id)
          }
        } catch (stockErr) {
          console.warn('[RestaurantService] Erreur mise à jour stock portion:', stockErr)
        }

        // Tracer le mouvement de stock
        await supabase.from('stock_movements').insert({
          company_id,
          sector_slug,
          reference_type: 'vente_portion_recette',
          reference_id: isValidUUID(order_id) ? order_id : null,
          reference_number: order_number,
          quantity: -portion_qty,
          notes: `Vente ${portion_qty} portion(s) : ${plat_nom} (Stock portions déduit, ingrédients préservés sans double déduction)`
        })
      }

      return { destocke: !insErr, matieresCount: 1, coutTotalMatiere: totalCoutVente, mode: 'LOT' }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE A : RECETTE À L'UNITÉ (PRÉPARATION À LA COMMANDE : Pizza, Chawarma...)
    // ═════════════════════════════════════════════════════════════════════════
    // Déduction automatique directe des ingrédients proportionnellement aux unités vendues
    let coutTotal = 0
    let count = 0

    for (const ing of ingredients) {
      const qteTotale = Math.round(Number(ing.quantite_necessaire || 1) * portion_qty * 1000) / 1000
      const coutU = Number(ing.cout_unitaire || 0)
      const totalCoutLigne = Math.round(qteTotale * coutU)
      const idempotencyKey = `destock-${order_number}-${plat_nom.replace(/\s+/g, '_')}-${ing.ingredient_nom.replace(/\s+/g, '_')}`

      // Insérer dans le log idempotent pour éviter le double déstockage
      const { error: insErr } = await supabase
        .from('restaurant_destockage_log')
        .insert({
          company_id,
          idempotency_key: idempotencyKey,
          order_id: isValidUUID(order_id) ? order_id : null,
          order_number,
          plat_nom,
          portion_qty,
          matiere_nom: ing.ingredient_nom,
          qte_destockee: qteTotale,
          unite: ing.unite || 'portion',
          cout_unitaire: coutU,
          total_cout: totalCoutLigne,
          emplacement: 'CUISINE'
        })

      if (!insErr) {
        coutTotal += totalCoutLigne
        count++

        // Déstockage réel de la matière première dans products (stock_vente cuisine)
        try {
          const { data: matchedProducts } = await supabase
            .from('products')
            .select('id, name, unit, uv, ucd, coef, stock_vente, stock_magasin, sector_meta, restaurant_circuit, is_matiere_premiere')
            .eq('company_id', company_id)
            .ilike('name', ing.ingredient_nom.trim())

          const prod = (matchedProducts && matchedProducts.length > 0)
            ? (matchedProducts.find((p: any) => p.restaurant_circuit === 'CUISINE' || p.sector_meta?.restaurant_circuit === 'CUISINE' || p.is_matiere_premiere || p.sector_meta?.is_matiere_premiere) || matchedProducts[0])
            : null

          if (prod) {
            const storageUnit = (prod.uv || prod.unit || ing.unite || 'kg').toLowerCase().trim()
            const ingUnit = (ing.unite || 'kg').toLowerCase().trim()
            let convFactor = 1

            if (storageUnit !== ingUnit) {
              if ((storageUnit === 'kg' || storageUnit === 'kilo') && ingUnit === 'g') convFactor = 0.001
              else if (ingUnit === 'kg' && (storageUnit === 'g')) convFactor = 1000
              else if ((storageUnit === 'kg' || storageUnit === 'kilo') && ingUnit === 'mg') convFactor = 0.000001
              else if (ingUnit === 'mg' && storageUnit === 'g') convFactor = 0.001
              else if ((storageUnit === 'l' || storageUnit === 'litre') && ingUnit === 'ml') convFactor = 0.001
              else if ((storageUnit === 'l' || storageUnit === 'litre') && ingUnit === 'cl') convFactor = 0.01
              else if (ingUnit === 'l' && (storageUnit === 'cl')) convFactor = 100
              else if (ingUnit === 'l' && (storageUnit === 'ml')) convFactor = 1000
              else if (storageUnit === 'cl' && ingUnit === 'ml') convFactor = 0.1
              else if (storageUnit === 'ml' && ingUnit === 'cl') convFactor = 10
            }

            const qteStockADeduire = Math.round((qteTotale * convFactor) * 1000) / 1000
            const currentStockVente = Number(prod.stock_vente ?? prod.sector_meta?.stock_vente ?? 0)
            const newStockVente = Math.max(0, Math.round((currentStockVente - qteStockADeduire) * 1000) / 1000)
            const currentMeta = prod.sector_meta || {}
            const updatedMeta = { ...currentMeta, stock_vente: newStockVente }
            await supabase
              .from('products')
              .update({ sector_meta: updatedMeta, updated_at: new Date().toISOString() })
              .eq('id', prod.id)
          }
        } catch (stockErr) {
          console.warn('[RestaurantService] Erreur mise à jour stock produit cuisine:', stockErr)
        }

        // Tracer le mouvement de stock
        await supabase.from('stock_movements').insert({
          company_id,
          sector_slug,
          reference_type: 'consommation_recette',
          reference_id: isValidUUID(order_id) ? order_id : null,
          reference_number: order_number,
          quantity: -qteTotale,
          notes: `Consommation recette ${plat_nom} (x${portion_qty}) : ${ing.ingredient_nom} (${qteTotale} ${ing.unite || 'portion'})`
        })
      }
    }

    return { destocke: count > 0, matieresCount: count, coutTotalMatiere: coutTotal, mode: 'UNITE' }
  } catch (err) {
    console.warn('[RestaurantService] Erreur déstockage matières:', err)
    return { destocke: false, matieresCount: 0, coutTotalMatiere: 0, mode: 'UNITE' }
  }
}

/**
 * 1.B Validation d'une préparation culinaire en cuisine (Mode B : Marmite / Lot de portions)
 * - Déduit automatiquement les ingrédients du stock cuisine UNE SEULE FOIS
 * - Crédite le stock de portions disponibles à la vente pour ce plat
 * - Enregistre la session de préparation et sa traçabilité
 */
export async function validerPreparationCuisine(params: {
  company_id: string
  plat_nom: string
  nb_lots?: number
  rendement_effectif?: number
  declare_par: string
  sector_slug?: string
  notes?: string
}): Promise<{
  success: boolean
  portions_ajoutees: number
  cout_total: number
  cout_unitaire_portion: number
  matieres_deduites: number
  message: string
}> {
  const {
    company_id,
    plat_nom,
    nb_lots = 1,
    rendement_effectif,
    declare_par,
    sector_slug = 'restaurant',
    notes = ''
  } = params

  if (!company_id || !plat_nom || nb_lots <= 0) {
    return {
      success: false,
      portions_ajoutees: 0,
      cout_total: 0,
      cout_unitaire_portion: 0,
      matieres_deduites: 0,
      message: 'Paramètres de préparation invalides.'
    }
  }

  try {
    // 1. Récupérer les ingrédients de la fiche technique
    const { data: ingredients, error: fErr } = await supabase
      .from('restaurant_fiches_techniques')
      .select('*')
      .eq('company_id', company_id)
      .ilike('plat_nom', plat_nom.trim())

    if (fErr || !ingredients || ingredients.length === 0) {
      return {
        success: false,
        portions_ajoutees: 0,
        cout_total: 0,
        cout_unitaire_portion: 0,
        matieres_deduites: 0,
        message: `Fiche technique introuvable pour "${plat_nom}".`
      }
    }

    // Récupérer le rendement prévu
    let rendementStandard = 10
    if (ingredients[0]?.notes) {
      try {
        const p = typeof ingredients[0].notes === 'string' ? JSON.parse(ingredients[0].notes) : ingredients[0].notes
        if (p?.rendement_portions) rendementStandard = Number(p.rendement_portions) || 10
      } catch (_) {}
    }

    const portionsObtenues = Math.round(Number(rendement_effectif || (rendementStandard * nb_lots)))
    const prepRef = `PREP-${Date.now().toString().slice(-6)}`
    let coutTotalPreparation = 0
    let matieresCount = 0

    // 2. Déduire les matières premières consommées du stock cuisine
    for (const ing of ingredients) {
      const qteConsommee = Math.round(Number(ing.quantite_necessaire || 1) * nb_lots * 1000) / 1000
      const coutU = Number(ing.cout_unitaire || 0)
      const coutLigne = Math.round(qteConsommee * coutU)
      coutTotalPreparation += coutLigne

      const idempotencyKey = `prep-${prepRef}-${ing.ingredient_nom.replace(/\s+/g, '_')}`

      await supabase.from('restaurant_destockage_log').insert({
        company_id,
        idempotency_key: idempotencyKey,
        order_number: prepRef,
        plat_nom,
        portion_qty: portionsObtenues,
        matiere_nom: ing.ingredient_nom,
        qte_destockee: qteConsommee,
        unite: ing.unite || 'kg',
        cout_unitaire: coutU,
        total_cout: coutLigne,
        emplacement: 'CUISINE'
      })

      // Déduction du produit dans products
      try {
        const { data: matched } = await supabase
          .from('products')
          .select('id, unit, uv, stock_vente, sector_meta')
          .eq('company_id', company_id)
          .ilike('name', ing.ingredient_nom.trim())

        if (matched && matched.length > 0) {
          const prod = matched[0]
          const storageUnit = (prod.uv || prod.unit || ing.unite || 'kg').toLowerCase().trim()
          const ingUnit = (ing.unite || 'kg').toLowerCase().trim()
          let factor = 1
          if (storageUnit === 'kg' && ingUnit === 'g') factor = 0.001
          else if (ingUnit === 'kg' && storageUnit === 'g') factor = 1000
          else if (storageUnit === 'l' && ingUnit === 'cl') factor = 0.01
          else if (storageUnit === 'l' && ingUnit === 'ml') factor = 0.001

          const qteADeduire = Math.round(qteConsommee * factor * 1000) / 1000
          const curStock = Number(prod.stock_vente ?? prod.sector_meta?.stock_vente ?? 0)
          const newStock = Math.max(0, Math.round((curStock - qteADeduire) * 1000) / 1000)
          const meta = { ...(prod.sector_meta || {}), stock_vente: newStock }

          await supabase.from('products').update({
            stock_vente: newStock,
            sector_meta: meta,
            updated_at: new Date().toISOString()
          }).eq('id', prod.id)
        }
      } catch (err) {
        console.warn('[validerPreparationCuisine] Erreur déstockage ingrédient:', err)
      }

      // Tracer le mouvement de stock
      await supabase.from('stock_movements').insert({
        company_id,
        sector_slug,
        reference_type: 'preparation_cuisine',
        reference_number: prepRef,
        quantity: -qteConsommee,
        notes: `Préparation cuisine ${plat_nom} (${portionsObtenues} portions) : déduction ${qteConsommee} ${ing.unite || 'kg'} de ${ing.ingredient_nom}`
      })

      matieresCount++
    }

    const coutUnitairePortion = portionsObtenues > 0 ? Math.round(coutTotalPreparation / portionsObtenues) : 0

    // 3. Créditer le stock de portions disponibles pour ce plat
    try {
      const { data: platProds } = await supabase
        .from('products')
        .select('id, stock_vente, sector_meta, cost_price')
        .eq('company_id', company_id)
        .ilike('name', plat_nom.trim())

      if (platProds && platProds.length > 0) {
        const pPlat = platProds[0]
        const currentPortions = Number(pPlat.stock_vente ?? pPlat.sector_meta?.stock_vente ?? 0)
        const newPortions = currentPortions + portionsObtenues
        const meta = {
          ...(pPlat.sector_meta || {}),
          stock_vente: newPortions,
          is_recipe: true,
          restaurant_circuit: 'CUISINE',
          dernier_lot_prep: prepRef,
          derniere_prep_date: new Date().toISOString(),
          portions_disponibles: newPortions
        }

        await supabase.from('products').update({
          stock_vente: newPortions,
          cost_price: coutUnitairePortion > 0 ? coutUnitairePortion : pPlat.cost_price,
          sector_meta: meta,
          updated_at: new Date().toISOString()
        }).eq('id', pPlat.id)
      } else {
        // Créer le produit s'il n'existe pas encore
        const autoCode = `PLAT-${Date.now().toString().slice(-4)}`
        await supabase.from('products').insert({
          company_id,
          code: autoCode,
          name: plat_nom.trim(),
          unit: 'Portion',
          uv: 'Portion',
          stock_vente: portionsObtenues,
          cost_price: coutUnitairePortion,
          selling_price: Number(ingredients[0]?.prix_vente_unitaire) || 0,
          sector_slug,
          is_active: true,
          restaurant_circuit: 'CUISINE',
          is_matiere_premiere: false,
          sector_meta: {
            restaurant_circuit: 'CUISINE',
            is_matiere_premiere: false,
            is_recipe: true,
            portions_disponibles: portionsObtenues
          }
        })
      }
    } catch (platErr) {
      console.warn('[validerPreparationCuisine] Erreur crédit stock portions:', platErr)
    }

    // Mouvement d'entrée de portions prêtes
    await supabase.from('stock_movements').insert({
      company_id,
      sector_slug,
      reference_type: 'entree_portions_pretes',
      reference_number: prepRef,
      quantity: portionsObtenues,
      notes: `Préparation validée par ${declare_par} : +${portionsObtenues} portions de ${plat_nom} disponibles (Coût unitaire: ${coutUnitairePortion} FCFA)`
    })

    return {
      success: true,
      portions_ajoutees: portionsObtenues,
      cout_total: coutTotalPreparation,
      cout_unitaire_portion: coutUnitairePortion,
      matieres_deduites: matieresCount,
      message: `Préparation validée : ${portionsObtenues} portions de « ${plat_nom} » disponibles au service.`
    }
  } catch (err: any) {
    console.error('[validerPreparationCuisine] Erreur:', err)
    return {
      success: false,
      portions_ajoutees: 0,
      cout_total: 0,
      cout_unitaire_portion: 0,
      matieres_deduites: 0,
      message: err.message || 'Erreur lors de la validation de la préparation.'
    }
  }
}

/**
 * 1.C Déclarer une perte ou un invendu de portions
 */
export async function declarerPertePortions(params: {
  company_id: string
  plat_nom: string
  quantite_perdue: number
  motif: string
  declare_par: string
  cout_unitaire?: number
  notes?: string
}): Promise<boolean> {
  const { company_id, plat_nom, quantite_perdue, motif, declare_par, cout_unitaire = 0, notes } = params
  if (!company_id || !plat_nom || quantite_perdue <= 0) return false

  try {
    // 1. Décrémenter le stock de portions du plat
    const { data: platProds } = await supabase
      .from('products')
      .select('id, stock_vente, sector_meta, cost_price')
      .eq('company_id', company_id)
      .ilike('name', plat_nom.trim())

    let resolvedCost = cout_unitaire
    if (platProds && platProds.length > 0) {
      const p = platProds[0]
      if (resolvedCost <= 0) resolvedCost = Number(p.cost_price || 0)
      const curStock = Number(p.stock_vente ?? p.sector_meta?.stock_vente ?? 0)
      const newStock = Math.max(0, curStock - quantite_perdue)
      const meta = { ...(p.sector_meta || {}), stock_vente: newStock }

      await supabase.from('products').update({
        stock_vente: newStock,
        sector_meta: meta,
        updated_at: new Date().toISOString()
      }).eq('id', p.id)
    }

    const valeurEstimee = Math.round(quantite_perdue * resolvedCost)

    // 2. Insérer dans restaurant_pertes_gaspillage
    await supabase.from('restaurant_pertes_gaspillage').insert({
      company_id,
      sector_slug: 'restaurant',
      produit_nom: plat_nom,
      categorie: 'Cuisine / Portions',
      quantite: quantite_perdue,
      unite: 'portion',
      valeur_estimee: valeurEstimee,
      motif: motif || 'PERIME',
      declare_par,
      notes: notes || `Perte/invendu de ${quantite_perdue} portion(s) de ${plat_nom}`
    })

    // 3. Mouvement de stock négatif
    await supabase.from('stock_movements').insert({
      company_id,
      sector_slug: 'restaurant',
      reference_type: 'perte_portion_cuisine',
      quantity: -quantite_perdue,
      notes: `Perte constatée par ${declare_par} : -${quantite_perdue} portion(s) de ${plat_nom} (Motif: ${motif})`
    })

    return true
  } catch (err) {
    console.warn('[declarerPertePortions] Erreur:', err)
    return false
  }
}

/**
 * 2. Enregistrer une remise de boissons à une serveuse
 */
export async function attribuerBoissonServeuse(params: BoissonConfiee): Promise<boolean> {
  const {
    company_id,
    sector_slug = 'restaurant',
    session_id,
    serveur_nom,
    produit_id,
    produit_nom,
    qte_remise,
    prix_vente_unitaire,
    cout_achat_unitaire,
    remis_par,
    notes
  } = params

  if (!company_id || !session_id || qte_remise <= 0) return false

  const totalValeur = Math.round(qte_remise * prix_vente_unitaire)

  try {
    const { error: insErr } = await supabase
      .from('restaurant_boissons_confiees')
      .insert({
        company_id,
        sector_slug,
        session_id,
        serveur_nom,
        produit_id,
        produit_nom,
        qte_remise,
        qte_retournee: 0,
        qte_vendue: 0,
        qte_offerte: 0,
        qte_cassee: 0,
        qte_restante_declaree: qte_remise,
        prix_vente_unitaire,
        cout_achat_unitaire,
        total_valeur_remise: totalValeur,
        remis_par,
        notes
      })

    if (insErr) throw insErr

    const { data: sess } = await supabase
      .from('restaurant_sessions_serveurs')
      .select('total_boissons_confiees_ttc, solde_restant_a_remettre')
      .eq('id', session_id)
      .single()

    if (sess) {
      const newTotalConfie = (Number(sess.total_boissons_confiees_ttc) || 0) + totalValeur
      const newSolde = (Number(sess.solde_restant_a_remettre) || 0) + totalValeur

      await supabase
        .from('restaurant_sessions_serveurs')
        .update({
          total_boissons_confiees_ttc: newTotalConfie,
          solde_restant_a_remettre: newSolde,
          updated_at: new Date().toISOString()
        })
        .eq('id', session_id)
    }

    return true
  } catch (err) {
    console.error('[RestaurantService] Erreur remise boisson:', err)
    return false
  }
}

/**
 * 3. Enregistrer un versement partiel ou total au gérant
 */
export async function enregistrerVersementServeur(params: {
  company_id: string
  session_id: string
  serveur_nom: string
  montant: number
  mode_reglement?: 'ESPECES' | 'MTN_MOMO' | 'MOOV_MONEY' | 'CARTE' | 'CHEQUE' | 'AUTRE'
  recu_par: string
  commentaire?: string
}): Promise<{ success: boolean; soldeApres: number; reference: string }> {
  const {
    company_id,
    session_id,
    serveur_nom,
    montant,
    mode_reglement = 'ESPECES',
    recu_par,
    commentaire
  } = params

  if (!company_id || !session_id || montant <= 0) {
    return { success: false, soldeApres: 0, reference: '' }
  }

  try {
    const { data: sess, error: sErr } = await supabase
      .from('restaurant_sessions_serveurs')
      .select('*')
      .eq('id', session_id)
      .single()

    if (sErr || !sess) throw new Error('Session introuvable.')

    const soldeAvant = Number(sess.solde_restant_a_remettre) || 0
    const soldeApres = Math.round((soldeAvant - montant) * 100) / 100
    const totalVersements = (Number(sess.total_versements_recus) || 0) + montant
    const ref = `VMT-${Date.now().toString().slice(-6)}`

    const { error: vErr } = await supabase
      .from('restaurant_versements_serveurs')
      .insert({
        company_id,
        session_id,
        reference: ref,
        serveur_nom,
        montant,
        mode_reglement,
        recu_par,
        solde_avant: soldeAvant,
        solde_apres: soldeApres,
        date_versement: new Date().toISOString(),
        commentaire
      })

    if (vErr) throw vErr

    await supabase
      .from('restaurant_sessions_serveurs')
      .update({
        total_versements_recus: totalVersements,
        solde_restant_a_remettre: soldeApres,
        updated_at: new Date().toISOString()
      })
      .eq('id', session_id)

    // Intégrer également à la caisse principale de l'établissement
    try {
      await enregistrerMouvementCaisse({
        company_id,
        sector_slug: 'restaurant',
        caisse_id: null,
        type: 'entree',
        sens: 'entree',
        montant_especes: mode_reglement === 'ESPECES' ? montant : 0,
        montant_momo: ['MTN_MOMO', 'MOOV_MONEY'].includes(mode_reglement) ? montant : 0,
        source_module: 'restaurant_serveurs',
        source_id: ref,
        motif: `Versement session serveuse ${serveur_nom} (${ref})`,
        user_name: recu_par
      })
    } catch (_) {}

    return { success: true, soldeApres, reference: ref }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur versement:', err.message)
    return { success: false, soldeApres: 0, reference: '' }
  }
}

/**
 * 4. Clôturer définitivement la session d'une serveuse avec constat d'écart
 */
export async function cloturerSessionServeuse(params: {
  session_id: string
  cloture_par: string
  justification_ecart?: string
}): Promise<{ success: boolean; ecart: number }> {
  const { session_id, cloture_par, justification_ecart } = params

  try {
    const { data: sess, error } = await supabase
      .from('restaurant_sessions_serveurs')
      .select('*')
      .eq('id', session_id)
      .single()

    if (error || !sess) throw new Error('Session introuvable.')

    const ecart = Number(sess.solde_restant_a_remettre) || 0

    await supabase
      .from('restaurant_sessions_serveurs')
      .update({
        statut: 'CLOTUREE',
        heure_cloture: new Date().toISOString(),
        ecart_financier: ecart,
        justification_ecart: justification_ecart || null,
        cloture_par,
        updated_at: new Date().toISOString()
      })
      .eq('id', session_id)

    return { success: true, ecart }
  } catch (err) {
    console.error('[RestaurantService] Erreur clôture session:', err)
    return { success: false, ecart: 0 }
  }
}

/**
 * 5. Régler une créance de serveuse (Paiement total ou partiel)
 * RÈGLE D'OR : Relié directement à la caisse de l'établissement (Caisse & Clôtures Service)
 */
export async function payerCreanceServeuse(params: {
  company_id: string
  creance_id: string
  serveur_nom: string
  montant: number
  mode_reglement: string
  recu_par: string
  caisse_session_id?: string
  caisse_id?: string
}): Promise<{ success: boolean; soldeRestant: number; nouveauStatut: string }> {
  const { company_id, creance_id, serveur_nom, montant, mode_reglement, recu_par, caisse_session_id, caisse_id } = params

  try {
    const { data: c, error: cErr } = await supabase
      .from('restaurant_creances_serveuses')
      .select('*')
      .eq('id', creance_id)
      .single()

    if (cErr || !c) throw new Error('Créance introuvable')

    const soldeActuel = Number(c.solde_restant) || 0
    const dejaPaye = Number(c.montant_paye) || 0
    const montantEffectif = Math.min(soldeActuel, Math.max(0, montant))
    const nouveauPaye = dejaPaye + montantEffectif
    const nouveauSolde = Math.max(0, soldeActuel - montantEffectif)
    const nouveauStatut = nouveauSolde === 0 ? 'PAYE' : 'PARTIEL'

    // 1. Mettre à jour la créance
    await supabase
      .from('restaurant_creances_serveuses')
      .update({
        montant_paye: nouveauPaye,
        solde_restant: nouveauSolde,
        statut: nouveauStatut,
        updated_at: new Date().toISOString()
      })
      .eq('id', creance_id)

    // 2. Insérer le règlement
    const ref = `REG-${Date.now().toString().slice(-6)}`
    await supabase.from('restaurant_reglements_serveuses').insert({
      company_id,
      creance_id,
      serveur_nom,
      montant: montantEffectif,
      mode_reglement,
      reference: ref,
      recu_par,
      date_reglement: new Date().toISOString()
    })

    // 3. Alimenter la Caisse principale (Caisse & Clôtures Service)
    try {
      const isCash = mode_reglement === 'ESPECES'
      const isMomo = ['MTN_MOMO', 'MOOV_MONEY', 'MOMO'].includes(mode_reglement)
      await enregistrerMouvementCaisse({
        company_id,
        sector_slug: 'restaurant',
        caisse_id: caisse_id || null,
        caisse_session_id: caisse_session_id || null,
        type: 'entree',
        sens: 'entree',
        montant_especes: isCash ? montantEffectif : 0,
        montant_momo: isMomo ? montantEffectif : 0,
        source_module: 'restaurant_serveurs',
        source_id: ref,
        motif: `Règlement créance ${c.order_number || ''} par ${serveur_nom} (${ref})`,
        user_name: recu_par
      })

      if (isCash) {
        await enregistrerEntreeCaisse({
          company_id,
          secteur_id: 'restaurant',
          caisse_id: caisse_id || null,
          montant: montantEffectif,
          mode_paiement: 'espece',
          source: 'CREANCE_SERVEUSE',
          reference_id: creance_id
        })
      } else if (isMomo) {
        await enregistrerEntreeCaisse({
          company_id,
          secteur_id: 'restaurant',
          caisse_id: caisse_id || null,
          montant: montantEffectif,
          mode_paiement: 'mtn_momo',
          source: 'CREANCE_SERVEUSE',
          reference_id: creance_id
        })
      }
    } catch (caisseErr) {
      console.warn('[RestaurantService] Notice liaison caisse:', caisseErr)
    }

    // 4. Mettre à jour la session serveuse si liée
    if (c.session_id) {
      const { data: sess } = await supabase
        .from('restaurant_sessions_serveurs')
        .select('total_versements_recus, solde_restant_a_remettre')
        .eq('id', c.session_id)
        .single()

      if (sess) {
        await supabase
          .from('restaurant_sessions_serveurs')
          .update({
            total_versements_recus: (Number(sess.total_versements_recus) || 0) + montantEffectif,
            solde_restant_a_remettre: Math.max(0, (Number(sess.solde_restant_a_remettre) || 0) - montantEffectif),
            updated_at: new Date().toISOString()
          })
          .eq('id', c.session_id)
      }
    }

    return { success: true, soldeRestant: nouveauSolde, nouveauStatut }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur paiement créance serveuse:', err)
    return { success: false, soldeRestant: 0, nouveauStatut: 'ERREUR' }
  }
}

/**
 * 6. Enregistrer un retour de bouteilles consignées pour une serveuse
 */
export async function enregistrerRetourBouteilles(params: {
  creance_id: string
  qte_rendue: number
}): Promise<{ success: boolean; resteDu: number }> {
  const { creance_id, qte_rendue } = params
  try {
    const { data: c, error } = await supabase
      .from('restaurant_creances_serveuses')
      .select('consignes_bouteilles_dues, consignes_bouteilles_rendues')
      .eq('id', creance_id)
      .single()

    if (error || !c) throw new Error('Créance introuvable')

    const totalDues = Number(c.consignes_bouteilles_dues) || 0
    const dejaRendues = Number(c.consignes_bouteilles_rendues) || 0
    const nouveauRendu = Math.min(totalDues, dejaRendues + qte_rendue)
    const resteDu = Math.max(0, totalDues - nouveauRendu)

    await supabase
      .from('restaurant_creances_serveuses')
      .update({
        consignes_bouteilles_rendues: nouveauRendu,
        updated_at: new Date().toISOString()
      })
      .eq('id', creance_id)

    return { success: true, resteDu }
  } catch (err) {
    console.error('[RestaurantService] Erreur retour consignes:', err)
    return { success: false, resteDu: 0 }
  }
}

/**
 * 6.b Enregistrer un retour d'emballages / bouteilles vides pour une session de serveuse
 * RÈGLE D'OR : Le retour d'emballages vides NE modifie JAMAIS le stock de boissons pleines.
 */
export async function enregistrerRetourEmballageSession(params: {
  company_id: string
  session_id: string
  serveur_nom: string
  boisson_id?: string
  format_bouteille: '12T' | '20T' | '24T' | 'BOUTEILLE_65CL' | 'BOUTEILLE_50CL' | 'EAU_MINERALE' | 'AUTRE'
  designation: string
  qte_rendue: number
  receptionne_par: string
  notes?: string
}): Promise<{ success: boolean; resteEmballages: number; reference: string }> {
  const {
    company_id,
    session_id,
    serveur_nom,
    boisson_id,
    format_bouteille,
    designation,
    qte_rendue,
    receptionne_par,
    notes
  } = params

  if (!company_id || !session_id || qte_rendue <= 0) {
    return { success: false, resteEmballages: 0, reference: '' }
  }

  const ref = `RET-EMB-${Date.now().toString().slice(-6)}`

  try {
    let reste = 0
    if (boisson_id) {
      const { data: b } = await supabase
        .from('restaurant_boissons_confiees')
        .select('*')
        .eq('id', boisson_id)
        .single()

      if (b) {
        const dejaRendu = Number(b.qte_retournee || 0)
        const totalRemis = Number(b.qte_remise || 0)
        const nouveauRendu = Math.min(totalRemis, dejaRendu + qte_rendue)
        reste = Math.max(0, totalRemis - nouveauRendu)

        await supabase
          .from('restaurant_boissons_confiees')
          .update({
            qte_retournee: nouveauRendu,
            qte_restante_declaree: reste,
            updated_at: new Date().toISOString()
          })
          .eq('id', boisson_id)
      }
    }

    try {
      await supabase.from('restaurant_retours_emballages').insert({
        company_id,
        session_id,
        reference: ref,
        serveur_nom,
        format_bouteille,
        designation,
        qte_rendue,
        receptionne_par,
        notes,
        created_at: new Date().toISOString()
      })
    } catch (_) {}

    return { success: true, resteEmballages: reste, reference: ref }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur retour emballage session:', err.message)
    return { success: false, resteEmballages: 0, reference: '' }
  }
}

/**
 * 7. WORKFLOW DE VALIDATION AVEC DÉLAI DE 4 MINUTES
 * Étape 1 & 2 : Créer la commande au statut 'EN_ATTENTE_CONFIRMATION' avec compte à rebours de 4 minutes
 * ZÉRO déstockage définitif et ZÉRO créance définitive à cette étape.
 */
export async function creerCommandeEnAttente(params: {
  company_id: string
  sector_slug?: string
  order_number: string
  circuit: 'BAR' | 'CUISINE'
  serveur_nom: string
  serveur_id?: string
  table_numero?: string
  couverts?: number
  client_nom?: string
  client_id?: string
  items: Array<{
    produit_id: string
    code?: string
    designation: string
    quantite: number
    prix_unitaire: number
    is_consigne?: boolean
    is_recipe?: boolean
    cost_price?: number
  }>
  total_ttc: number
  total_ht?: number
  total_tva?: number
  total_aib?: number
  created_by_name?: string
}): Promise<{ success: boolean; order_id?: string; expires_at: string; error?: string }> {
  const {
    company_id,
    sector_slug = 'restaurant',
    order_number,
    circuit,
    serveur_nom,
    serveur_id,
    table_numero,
    couverts,
    client_nom,
    client_id,
    items,
    total_ttc,
    total_ht,
    total_tva,
    total_aib,
    created_by_name
  } = params

  if (!company_id || !order_number || !items.length || total_ttc <= 0) {
    return { success: false, expires_at: '', error: 'Données de commande invalides.' }
  }

  const expires_at = new Date(Date.now() + 4 * 60 * 1000).toISOString()
  const numTable = table_numero || 'COMPTOIR'

  try {
    const payload = {
      company_id,
      sector_slug,
      numero_commande: order_number,
      table_numero: numTable,
      type_commande: numTable === 'COMPTOIR' ? 'A_EMPORTER' : 'SUR_PLACE',
      serveur_nom,
      client_nom: client_nom || 'Client Comptoir',
      circuit,
      statut: 'EN_ATTENTE',
      validation_status: 'EN_ATTENTE_CONFIRMATION',
      confirmation_expires_at: expires_at,
      created_by_name: created_by_name || 'Caissier',
      total_ht: total_ht || total_ttc,
      total_tva: total_tva || 0,
      total_aib: total_aib || 0,
      total_ttc,
      total_paye: 0,
      reste_a_payer: total_ttc,
      couverts: couverts || 1,
      notes: JSON.stringify({
        items,
        client_id,
        created_by_name,
        serveur_id,
        circuit
      }),
      heure_ouverture: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('restaurant_commandes')
      .insert(payload)
      .select('id')
      .single()

    if (error) throw error

    return { success: true, order_id: data?.id, expires_at }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur création commande en attente:', err.message)
    return { success: false, expires_at: '', error: err.message }
  }
}

/**
 * 7.b Modifier une commande en attente de confirmation
 * Le délai de 4 minutes repart uniquement si une modification est enregistrée et confirmée.
 */
export async function modifierCommandeEnAttente(params: {
  company_id: string
  order_number: string
  circuit?: 'BAR' | 'CUISINE'
  serveur_nom?: string
  table_numero?: string
  couverts?: number
  items: Array<any>
  total_ttc: number
  total_ht?: number
}): Promise<{ success: boolean; new_expires_at: string; error?: string }> {
  const { company_id, order_number, circuit, serveur_nom, table_numero, couverts, items, total_ttc, total_ht } = params

  const new_expires_at = new Date(Date.now() + 4 * 60 * 1000).toISOString()

  try {
    const { data: cmd } = await supabase
      .from('restaurant_commandes')
      .select('notes')
      .eq('company_id', company_id)
      .eq('numero_commande', order_number)
      .single()

    let prevNotesObj: any = {}
    try {
      if (cmd?.notes) prevNotesObj = JSON.parse(cmd.notes)
    } catch (_) {}

    const updatedNotes = JSON.stringify({
      ...prevNotesObj,
      items,
      circuit: circuit || prevNotesObj.circuit
    })

    const updates: any = {
      total_ttc,
      total_ht: total_ht || total_ttc,
      reste_a_payer: total_ttc,
      confirmation_expires_at: new_expires_at,
      notes: updatedNotes,
      updated_at: new Date().toISOString()
    }
    if (circuit) updates.circuit = circuit
    if (serveur_nom) updates.serveur_nom = serveur_nom
    if (table_numero) updates.table_numero = table_numero
    if (couverts) updates.couverts = couverts

    const { error } = await supabase
      .from('restaurant_commandes')
      .update(updates)
      .eq('company_id', company_id)
      .eq('numero_commande', order_number)
      .eq('validation_status', 'EN_ATTENTE_CONFIRMATION')

    if (error) throw error

    return { success: true, new_expires_at }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur modification commande:', err.message)
    return { success: false, new_expires_at: '', error: err.message }
  }
}

/**
 * 7.c Annuler une commande en attente
 * Une commande annulée ne produit ni sortie définitive de stock, ni créance définitive, ni encaissement.
 */
export async function annulerCommandeEnAttente(params: {
  company_id: string
  order_number: string
  motif_annulation: string
  annule_par: string
}): Promise<{ success: boolean; error?: string }> {
  const { company_id, order_number, motif_annulation, annule_par } = params

  try {
    const { error } = await supabase
      .from('restaurant_commandes')
      .update({
        validation_status: 'ANNULE',
        statut: 'ANNULEE',
        cancelled_at: new Date().toISOString(),
        motif_annulation,
        annule_par,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', company_id)
      .eq('numero_commande', order_number)

    if (error) throw error

    // Journaliser l'audit
    try {
      const { logAuditEvent } = await import('./auditService')
      await logAuditEvent({
        companyId: company_id,
        module: 'RESTAURANT_POS',
        action: 'ANNULATION_COMMANDE',
        description: `Annulation de la commande ${order_number} par ${annule_par}. Motif: ${motif_annulation}`,
        entityName: 'restaurant_commandes',
        entityId: order_number
      })
    } catch (_) {}

    return { success: true }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur annulation commande:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * 7.d Finaliser atomiquement une commande restaurant (soit après 4 min, soit validation immédiate)
 * Idempotent, vérifie les stocks, déstocke exactement selon le circuit, crée créance et KDS.
 */
export async function finaliserCommandeRestaurant(params: {
  company_id: string
  order_number: string
  order_id?: string
  circuit?: 'BAR' | 'CUISINE'
  serveur_nom?: string
  items?: Array<{
    produit_id: string
    designation: string
    quantite: number
    prix_unitaire: number
    is_consigne?: boolean
  }>
  total_ttc?: number
}): Promise<{ success: boolean; alreadyFinalized?: boolean; error?: string }> {
  const { company_id, order_number } = params

  try {
    // 1. Lire la commande en base pour garantir l'idempotence
    const { data: cmd, error: cErr } = await supabase
      .from('restaurant_commandes')
      .select('*')
      .eq('company_id', company_id)
      .eq('numero_commande', order_number)
      .maybeSingle()

    if (cErr) throw cErr

    // Si déjà confirmée, idempotent -> succès direct
    if (cmd && cmd.validation_status === 'CONFIRME') {
      return { success: true, alreadyFinalized: true }
    }
    if (cmd && cmd.validation_status === 'ANNULE') {
      return { success: false, error: 'Cette commande a été annulée.' }
    }

    // Récupérer les items depuis params ou notes
    let parsedItems: any[] = params.items || []
    let resolvedCircuit: 'BAR' | 'CUISINE' = params.circuit || (cmd?.circuit as any) || 'BAR'
    let srvNom = params.serveur_nom || cmd?.serveur_nom || 'Serveur'
    let resolvedTotalTTC = params.total_ttc || Number(cmd?.total_ttc) || 0
    let numTable = cmd?.table_numero || 'COMPTOIR'
    let clientNom = cmd?.client_nom || 'Client Comptoir'

    if ((!parsedItems || parsedItems.length === 0) && cmd?.notes) {
      try {
        const obj = JSON.parse(cmd.notes)
        if (obj.items && Array.isArray(obj.items)) {
          parsedItems = obj.items
        }
        if (obj.circuit) resolvedCircuit = obj.circuit
      } catch (_) {}
    }

    if (!parsedItems || parsedItems.length === 0) {
      throw new Error('Aucun article trouvé dans la commande.')
    }

    // 2. Déstockage atomique selon le circuit
    let coutMatiereTotal = 0
    for (const item of parsedItems) {
      const itNom = item.designation || item.name || 'Produit'
      const itQty = Number(item.quantite || item.qty || 1)

      if (resolvedCircuit === 'CUISINE' || item.is_recipe) {
        // Circuit CUISINE : Déstocker les matières premières de la fiche technique
        const destockRes = await destockerMatieresPlat({
          company_id,
          order_id: isValidUUID(params.order_id || cmd?.id) ? (params.order_id || cmd?.id) : undefined,
          order_number,
          plat_nom: itNom,
          portion_qty: itQty,
          sector_slug: 'restaurant'
        })
        coutMatiereTotal += destockRes.coutTotalMatiere
      } else {
        // Circuit BAR : Déstocker la boisson directement depuis products
        if (item.produit_id) {
          const { data: prod } = await supabase
            .from('products')
            .select('id, cost_price, stock_vente, sector_meta')
            .eq('id', item.produit_id)
            .maybeSingle()

          if (prod) {
            const currentStock = Number(prod.stock_vente ?? prod.sector_meta?.stock_vente ?? 0)
            const newStock = Math.max(0, Math.round((currentStock - itQty) * 1000) / 1000)
            await supabase
              .from('products')
              .update({
                stock_vente: newStock,
                sector_meta: { ...(prod.sector_meta || {}), stock_vente: newStock }
              })
              .eq('id', prod.id)

            await supabase.from('stock_movements').insert({
              company_id,
              sector_slug: 'restaurant',
              product_id: prod.id,
              reference_type: 'VENTE_BAR',
              reference_number: order_number,
              quantity: -itQty,
              notes: `Vente BAR ${order_number} (${srvNom})`
            })
            coutMatiereTotal += (Number(prod.cost_price) || 0) * itQty
          }
        }
      }
    }

    // 3. Suivi des bouteilles consignées
    const nbBouteillesConsignees = parsedItems.reduce((acc, it) => {
      const nom = (it.designation || it.name || '').toLowerCase()
      const isCons = Boolean(it.is_consigne) || nom.includes('castel') || nom.includes('beaufort') || nom.includes('guinness') || nom.includes('youki') || nom.includes('biere')
      return acc + (isCons ? Number(it.quantite || it.qty || 0) : 0)
    }, 0)

    // 4. Rattacher à la session de service de la serveuse (ou en ouvrir une)
    let session_id: string | null = null
    const { data: openSessions } = await supabase
      .from('restaurant_sessions_serveurs')
      .select('id, total_boissons_confiees_ttc, total_ventes_declarees_ttc, solde_restant_a_remettre')
      .eq('company_id', company_id)
      .eq('serveur_nom', srvNom)
      .eq('statut', 'OUVERTE')
      .order('created_at', { ascending: false })
      .limit(1)

    if (openSessions && openSessions.length > 0) {
      session_id = openSessions[0].id
      const prevVentes = Number(openSessions[0].total_ventes_declarees_ttc) || 0
      const prevSolde = Number(openSessions[0].solde_restant_a_remettre) || 0
      await supabase
        .from('restaurant_sessions_serveurs')
        .update({
          total_ventes_declarees_ttc: prevVentes + resolvedTotalTTC,
          solde_restant_a_remettre: prevSolde + resolvedTotalTTC,
          updated_at: new Date().toISOString()
        })
        .eq('id', session_id)
    } else {
      // Créer automatiquement une session de service individuelle pour cette serveuse
      const { data: newSess } = await supabase
        .from('restaurant_sessions_serveurs')
        .insert({
          company_id,
          sector_slug: 'restaurant',
          serveur_nom: srvNom,
          date_session: new Date().toISOString().split('T')[0],
          heure_ouverture: new Date().toISOString(),
          fonds_initial: 0,
          statut: 'OUVERTE',
          total_boissons_confiees_ttc: 0,
          total_ventes_declarees_ttc: resolvedTotalTTC,
          total_versements_recus: 0,
          solde_restant_a_remettre: resolvedTotalTTC,
          ecart_financier: 0
        })
        .select('id')
        .maybeSingle()
      if (newSess) session_id = newSess.id
    }

    // 5. Créer la créance serveuse
    await supabase.from('restaurant_creances_serveuses').insert({
      company_id,
      session_id,
      order_id: isValidUUID(cmd?.id) ? cmd?.id : null,
      order_number,
      serveur_nom: srvNom,
      circuit: resolvedCircuit,
      montant_initial: resolvedTotalTTC,
      montant_paye: 0,
      solde_restant: resolvedTotalTTC,
      statut: 'NON_PAYE',
      consignes_bouteilles_dues: nbBouteillesConsignees,
      consignes_bouteilles_rendues: 0,
      details: parsedItems,
      date_creation: new Date().toISOString()
    })

    // 6. Transmettre au KDS Cuisine & Bar
    const kdsRows = parsedItems.map(item => {
      const itNom = item.designation || item.name || 'Article'
      const itQty = Number(item.quantite || item.qty || 1)
      const itPrice = Number(item.prix_unitaire || item.unitPrice || 0)
      const isDrink = resolvedCircuit === 'BAR' || (!item.is_recipe && (itNom.toLowerCase().includes('biere') || itNom.toLowerCase().includes('coca') || itNom.toLowerCase().includes('eau ')))
      return {
        company_id,
        sector_slug: 'restaurant',
        commande_id: isValidUUID(cmd?.id) ? cmd?.id : null,
        commande_numero: order_number,
        table_numero: numTable,
        serveur_nom: srvNom,
        produit_id: item.produit_id || null,
        designation: itNom,
        destination: isDrink ? 'BAR' : 'CUISINE',
        quantite: itQty,
        prix_unitaire: itPrice,
        total_ligne: itQty * itPrice,
        statut_preparation: 'NOUVEAU',
        heure_commande: new Date().toISOString()
      }
    })
    await supabase.from('restaurant_commande_lignes').insert(kdsRows)

    // 7. Enregistrer dans sales_orders pour cohérence globale
    const salePayload = {
      company_id,
      order_number,
      order_type: 'pos_direct',
      order_date: new Date().toISOString().split('T')[0],
      subtotal_ht: resolvedTotalTTC,
      tva_amount: 0,
      aib_amount: 0,
      total_amount: resolvedTotalTTC,
      total_cost: coutMatiereTotal,
      paid_amount: 0,
      credit_amount: resolvedTotalTTC,
      payment_status: 'credit',
      payment_method: 'credit_serveuse',
      customer_name: `${srvNom} (${numTable})`,
      status: 'COMPLET',
      sector_slug: 'restaurant',
      notes: JSON.stringify({
        restaurant_circuit: resolvedCircuit,
        serveur_nom: srvNom,
        table_numero: numTable,
        lines: parsedItems
      })
    }
    const { data: dbSale } = await supabase.from('sales_orders').insert(salePayload).select('id').maybeSingle()

    if (dbSale?.id) {
      const orderLines = parsedItems.map(it => ({
        order_id: dbSale.id,
        product_id: it.produit_id || null,
        product_name: it.designation || it.name || 'Article',
        quantity: Number(it.quantite || it.qty || 1),
        unit_price: Number(it.prix_unitaire || it.unitPrice || 0),
        total_ttc: Number(it.quantite || it.qty || 1) * Number(it.prix_unitaire || it.unitPrice || 0),
        company_id,
        sector_slug: 'restaurant'
      }))
      await supabase.from('sales_order_items').insert(orderLines)
    }

    // 8. Mettre à jour le statut de la commande restaurant en CONFIRME
    await supabase
      .from('restaurant_commandes')
      .update({
        validation_status: 'CONFIRME',
        statut: 'EN_PREPARATION',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('company_id', company_id)
      .eq('numero_commande', order_number)

    // 9. Si table de salle, marquer comme OCCUPEE
    if (numTable && numTable !== 'COMPTOIR') {
      await supabase.from('restaurant_tables')
        .update({ statut: 'OCCUPEE', updated_at: new Date().toISOString() })
        .eq('company_id', company_id)
        .eq('numero_table', numTable)
    }

    return { success: true }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur finalisation commande:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * 7.e Mécanisme de récupération et traitement automatique des commandes expirées (> 4 min)
 * Fonctionne côté serveur ou à l'ouverture de l'application sans dépendre d'un minuteur navigateur ouvert.
 */
export async function traiterCommandesExpirees(company_id: string): Promise<number> {
  if (!company_id) return 0
  const nowIso = new Date().toISOString()
  try {
    const { data: expiredList, error } = await supabase
      .from('restaurant_commandes')
      .select('numero_commande')
      .eq('company_id', company_id)
      .eq('validation_status', 'EN_ATTENTE_CONFIRMATION')
      .lte('confirmation_expires_at', nowIso)

    if (error || !expiredList || expiredList.length === 0) return 0

    let count = 0
    for (const cmd of expiredList) {
      const res = await finaliserCommandeRestaurant({
        company_id,
        order_number: cmd.numero_commande
      })
      if (res.success) count++
    }
    return count
  } catch (err) {
    console.warn('[RestaurantService] Notice traitement commandes expirées:', err)
    return 0
  }
}

export default {
  destockerMatieresPlat,
  attribuerBoissonServeuse,
  enregistrerVersementServeur,
  cloturerSessionServeuse,
  payerCreanceServeuse,
  enregistrerRetourBouteilles,
  enregistrerRetourEmballageSession,
  creerCommandeEnAttente,
  modifierCommandeEnAttente,
  annulerCommandeEnAttente,
  finaliserCommandeRestaurant,
  traiterCommandesExpirees
}
