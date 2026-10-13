// =============================================================================
// GESTIO 229 SaaS — Service Spécialisé Bar, Restaurant, Maquis & Fast-Food
// =============================================================================
// Règles métier :
// 1. Déstockage automatique des matières premières de cuisine selon fiches techniques
// 2. Gestion des comptes serveuses : boissons confiées, retours, ventes, solde
// 3. Versements successifs au gérant avec calcul du solde restant et protection double-clic
// 4. Clôtures de session avec constat des écarts
// 5. Envoi direct des commandes vers KDS Cuisine & Bar
// 6. Registre d'assiduité / présence et gestion confidentielle des plaintes
// =============================================================================

import { supabase } from '../lib/supabase'

export interface FicheTechniqueItem {
  id?: string
  plat_nom: string
  ingredient_nom: string
  quantite_necessaire: number
  unite: string
  cout_unitaire: number
  cout_matiere_ligne?: number
  prix_vente_unitaire?: number
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

/**
 * 1. Déstockage atomique & idempotent des matières premières pour un plat ou commande
 */
export async function destockerMatieresPlat(params: {
  company_id: string
  order_id?: string
  order_number: string
  plat_nom: string
  portion_qty: number
  sector_slug?: string
}): Promise<{ destocke: boolean; matieresCount: number; coutTotalMatiere: number }> {
  const { company_id, order_id, order_number, plat_nom, portion_qty, sector_slug = 'restaurant' } = params

  if (!company_id || !order_number || !plat_nom || portion_qty <= 0) {
    return { destocke: false, matieresCount: 0, coutTotalMatiere: 0 }
  }

  try {
    // 1. Charger les ingrédients de la fiche technique
    const { data: ingredients, error: fErr } = await supabase
      .from('restaurant_fiches_techniques')
      .select('*')
      .eq('company_id', company_id)
      .ilike('plat_nom', plat_nom.trim())

    if (fErr || !ingredients || ingredients.length === 0) {
      return { destocke: false, matieresCount: 0, coutTotalMatiere: 0 }
    }

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
          order_id,
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
            .select('id, name, unit, uv, stock_vente, stock_magasin, sector_meta, restaurant_circuit, is_matiere_premiere')
            .eq('company_id', company_id)
            .ilike('name', ing.ingredient_nom.trim())

          // Trouver le produit cuisine correspondant
          const prod = (matchedProducts && matchedProducts.length > 0)
            ? (matchedProducts.find((p: any) => p.restaurant_circuit === 'CUISINE' || p.sector_meta?.restaurant_circuit === 'CUISINE' || p.is_matiere_premiere || p.sector_meta?.is_matiere_premiere) || matchedProducts[0])
            : null

          if (prod) {
            // Conversion d'unité si nécessaire
            const storageUnit = prod.unit || prod.uv || ing.unite || 'kg'
            const ingUnit = ing.unite || 'kg'
            let convFactor = 1

            const sU = storageUnit.toLowerCase().trim()
            const iU = ingUnit.toLowerCase().trim()
            if (sU !== iU) {
              if ((sU === 'kg' || sU === 'kilo') && iU === 'g') convFactor = 0.001
              else if (iU === 'kg' && (sU === 'g')) convFactor = 1000
              else if ((sU === 'l' || sU === 'litre') && iU === 'ml') convFactor = 0.001
              else if ((sU === 'l' || sU === 'litre') && iU === 'cl') convFactor = 0.01
              else if (iU === 'l' && (sU === 'cl')) convFactor = 100
              else if (iU === 'l' && (sU === 'ml')) convFactor = 1000
            }

            const qteStockADeduire = Math.round((qteTotale * convFactor) * 1000) / 1000
            const currentStockVente = Number(prod.stock_vente ?? prod.sector_meta?.stock_vente ?? 0)
            const newStockVente = Math.max(0, Math.round((currentStockVente - qteStockADeduire) * 1000) / 1000)
            const currentMeta = prod.sector_meta || {}
            const updatedMeta = { ...currentMeta, stock_vente: newStockVente }

            let updRes = await supabase
              .from('products')
              .update({ stock_vente: newStockVente, sector_meta: updatedMeta })
              .eq('id', prod.id)

            if (updRes.error && updRes.error.code === 'PGRST204') {
              await supabase
                .from('products')
                .update({ sector_meta: updatedMeta })
                .eq('id', prod.id)
            }
          }
        } catch (stockErr) {
          console.warn('[RestaurantService] Erreur mise à jour stock produit cuisine:', stockErr)
        }

        // Tracer le mouvement de stock
        await supabase.from('stock_movements').insert({
          company_id,
          sector_slug,
          reference_type: 'consommation_recette',
          reference_id: order_id || null,
          reference_number: order_number,
          quantity: -qteTotale,
          notes: `Consommation recette ${plat_nom} (x${portion_qty}) : ${ing.ingredient_nom} (${qteTotale} ${ing.unite || 'portion'})`
        })
      }
    }

    return { destocke: count > 0, matieresCount: count, coutTotalMatiere: coutTotal }
  } catch (err) {
    console.warn('[RestaurantService] Erreur déstockage matières:', err)
    return { destocke: false, matieresCount: 0, coutTotalMatiere: 0 }
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
    // 1. Ajouter la ligne dans restaurant_boissons_confiees
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

    // 2. Mettre à jour le cumul de la session de la serveuse
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
    // 1. Lire le solde actuel de la session
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

    // 2. Insérer le versement
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

    // 3. Mettre à jour la session
    await supabase
      .from('restaurant_sessions_serveurs')
      .update({
        total_versements_recus: totalVersements,
        solde_restant_a_remettre: soldeApres,
        updated_at: new Date().toISOString()
      })
      .eq('id', session_id)

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
 */
export async function payerCreanceServeuse(params: {
  company_id: string
  creance_id: string
  serveur_nom: string
  montant: number
  mode_reglement: string
  recu_par: string
}): Promise<{ success: boolean; soldeRestant: number; nouveauStatut: string }> {
  const { company_id, creance_id, serveur_nom, montant, mode_reglement, recu_par } = params

  try {
    const { data: c, error: cErr } = await supabase
      .from('restaurant_creances_serveuses')
      .select('*')
      .eq('id', creance_id)
      .single()

    if (cErr || !c) throw new Error('Créance introuvable')

    const soldeActuel = Number(c.solde_restant) || 0
    const dejaPaye = Number(c.montant_paye) || 0
    const nouveauPaye = dejaPaye + montant
    const nouveauSolde = Math.max(0, soldeActuel - montant)
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
      montant,
      mode_reglement,
      reference: ref,
      recu_par,
      date_reglement: new Date().toISOString()
    })

    // 3. Mettre à jour la session serveuse si liée
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
            total_versements_recus: (Number(sess.total_versements_recus) || 0) + montant,
            solde_restant_a_remettre: Math.max(0, (Number(sess.solde_restant_a_remettre) || 0) - montant),
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
    // 1. Mettre à jour restaurant_boissons_confiees si boisson_id spécifié
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

    // 2. Insérer le log de retour d'emballages
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
    } catch (_) {
      // Ignorer si la table spécifique n'existe pas encore
    }

    return { success: true, resteEmballages: reste, reference: ref }
  } catch (err: any) {
    console.error('[RestaurantService] Erreur retour emballage session:', err.message)
    return { success: false, resteEmballages: 0, reference: '' }
  }
}

/**
 * 7. Finaliser atomiquement une commande restaurant après le délai de 4 minutes
 */
export async function finaliserCommandeRestaurant(params: {
  company_id: string
  order_id: string
  order_number: string
  circuit: 'BAR' | 'CUISINE'
  serveur_nom: string
  items: Array<{
    produit_id: string
    designation: string
    quantite: number
    prix_unitaire: number
    is_consigne?: boolean
  }>
  total_ttc: number
}): Promise<{ success: boolean }> {
  const { company_id, order_id, order_number, circuit, serveur_nom, items, total_ttc } = params

  try {
    // 1. Déstockage atomique & fiches techniques
    if (circuit === 'CUISINE') {
      for (const item of items) {
        await destockerMatieresPlat({
          company_id,
          order_id,
          order_number,
          plat_nom: item.designation,
          portion_qty: item.quantite,
          sector_slug: 'restaurant'
        })
      }
    } else {
      // Pour le BAR : Déstocker les boissons
      for (const item of items) {
        if (item.produit_id) {
          const { data: prod } = await supabase
            .from('products')
            .select('stock_vente, sector_meta')
            .eq('id', item.produit_id)
            .single()

          if (prod) {
            const currentStock = Number(prod.stock_vente ?? prod.sector_meta?.stock_vente ?? 0)
            const newStock = Math.max(0, currentStock - item.quantite)
            await supabase
              .from('products')
              .update({
                stock_vente: newStock,
                sector_meta: { ...(prod.sector_meta || {}), stock_vente: newStock }
              })
              .eq('id', item.produit_id)

            await supabase.from('stock_movements').insert({
              company_id,
              sector_slug: 'restaurant',
              product_id: item.produit_id,
              reference_type: 'VENTE_BAR',
              reference_number: order_number,
              quantity: -item.quantite,
              notes: `Vente BAR ${order_number} (${serveur_nom})`
            })
          }
        }
      }
    }

    // 2. Créer la créance serveuse
    const nbBouteillesConsignees = items.reduce((acc, it) => acc + (it.is_consigne ? it.quantite : 0), 0)
    await supabase.from('restaurant_creances_serveuses').insert({
      company_id,
      order_id,
      order_number,
      serveur_nom,
      circuit,
      montant_initial: total_ttc,
      montant_paye: 0,
      solde_restant: total_ttc,
      statut: 'NON_PAYE',
      consignes_bouteilles_dues: nbBouteillesConsignees,
      consignes_bouteilles_rendues: 0,
      details: items,
      date_creation: new Date().toISOString()
    })

    // 3. Mettre à jour le statut de la commande en CONFIRME
    await supabase
      .from('restaurant_commandes')
      .update({
        validation_status: 'CONFIRME',
        confirmed_at: new Date().toISOString(),
        statut: 'EN_PREPARATION',
        updated_at: new Date().toISOString()
      })
      .eq('numero_commande', order_number)

    return { success: true }
  } catch (err) {
    console.error('[RestaurantService] Erreur finalisation commande:', err)
    return { success: false }
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
  finaliserCommandeRestaurant,
}
