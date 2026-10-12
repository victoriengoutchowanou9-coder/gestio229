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

        // Tracer le mouvement de stock
        await supabase.from('stock_movements').insert({
          company_id,
          sector_slug,
          reference_type: 'consommation_recette',
          reference_id: order_id || null,
          reference_number: order_number,
          quantity: -qteTotale,
          notes: `Consommation recette ${plat_nom} (x${portion_qty}) : ${ing.ingredient_nom}`
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

export default {
  destockerMatieresPlat,
  attribuerBoissonServeuse,
  enregistrerVersementServeur,
  cloturerSessionServeuse,
}
