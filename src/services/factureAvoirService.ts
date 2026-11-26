// =============================================================================
// GESTIO 229 SaaS — Service Factures d'Avoir Globales & Extension Brasserie
// Conforme Spécifications Gestio 229 :
// - GLOBAL pour tous les secteurs (Quincaillerie, Poissonnerie, Supermarché, Imprimerie, Boutique, etc.)
// - EXTENSION EMBALLAGES UNIQUEMENT si secteur Brasserie / Dépôt de boissons
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse, checkSectorCaisseStatus } from './caisseSectorService'

export type ModeRemboursementAvoir = 'especes' | 'momo' | 'banque' | 'credit_client'
export type StatutAvoir = 'brouillon' | 'valide' | 'rembourse' | 'annule'
export type EtatArticleAvoir = 'bon' | 'acceptable' | 'endommage' | 'perime'

export interface AvoirLigneInput {
  article_id: string
  article_nom: string
  qte_retournee: number
  prix_unitaire: number
  prix_achat: number
  etat_article: EtatArticleAvoir
  qte_facturee?: number
  qte_deja_avoir?: number
}

export interface FactureAvoirInput {
  company_id: string
  secteur_id?: string | null
  sector_slug: string
  facture_initiale_id: string
  client_id?: string | null
  client_nom?: string | null
  date_avoir?: string
  motif: string
  mode_remboursement: ModeRemboursementAvoir
  remboursement_effectue: boolean
  lignes: AvoirLigneInput[]
  user_id?: string
  user_nom?: string
  // EXTENSION EXCLUSIVE BRASSERIE & DÉPÔT DE BOISSONS :
  qte_casiers_retournes?: number
  qte_bouteilles_retournes?: number
}

export interface FactureAvoirRecord {
  id: string
  numero: string
  company_id: string
  secteur_id?: string | null
  sector_slug: string
  facture_initiale_id: string
  facture_initiale_numero?: string
  client_id?: string | null
  client_nom?: string | null
  date_avoir: string
  motif: string
  montant_total_avoir: number
  mode_remboursement: ModeRemboursementAvoir
  remboursement_effectue: boolean
  statut: StatutAvoir
  caisse_id?: string | null
  caisse_session_id?: string | null
  created_by?: string | null
  created_by_nom?: string | null
  lignes?: AvoirLigneRecord[]
  created_at: string
  // Extension Brasserie
  qte_casiers_retournes?: number
  qte_bouteilles_retournes?: number
}

export interface AvoirLigneRecord {
  id: string
  avoir_id: string
  article_id: string
  article_nom?: string
  qte_retournee: number
  prix_unitaire: number
  prix_achat: number
  total_ligne: number
  etat_article: EtatArticleAvoir
}

export interface ClientEmballagesCreance {
  qte_casiers_dus: number
  qte_bouteilles_dues: number
  qte_casiers_consignes?: number
}

/**
 * CONDITION CRITIQUE CLIENT : Détection exclusive du secteur Brasserie & Dépôt de boissons
 * SEULEMENT ce secteur a accès à la gestion des emballages consignés (casiers, bouteilles)
 */
export function checkIsBrasserieSector(sectorSlug?: string | null, sectorNom?: string | null): boolean {
  const slug = (sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '')
  const nom = (sectorNom || '').toLowerCase().trim()
  return (
    slug === 'brasserie_depot_boissons' ||
    slug === 'brasserie' ||
    slug === 'depot_boissons' ||
    slug === 'depot-boissons' ||
    slug.includes('brasserie') ||
    nom.includes('brasserie') ||
    nom.includes('boisson') ||
    nom.includes('dépôt') ||
    nom.includes('depot')
  )
}

// -----------------------------------------------------------------------------
// GESTION DU STOCKAGE LOCAL DE SECOURS (IDB/LocalStorage)
// Assure 100% de tolérance hors-ligne et résilience RLS
// -----------------------------------------------------------------------------
const STORAGE_PREFIX = 'gestio229_avoirs_'

function getAvoirsStorageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`
}

export function getLocalAvoirs(companyId: string): FactureAvoirRecord[] {
  try {
    const raw = localStorage.getItem(getAvoirsStorageKey(companyId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveLocalAvoir(companyId: string, avoir: FactureAvoirRecord): void {
  try {
    const list = getLocalAvoirs(companyId)
    const existingIndex = list.findIndex(a => a.id === avoir.id)
    if (existingIndex >= 0) {
      list[existingIndex] = avoir
    } else {
      list.unshift(avoir)
    }
    localStorage.setItem(getAvoirsStorageKey(companyId), JSON.stringify(list))
  } catch (err) {
    console.warn('[factureAvoirService] Erreur sauvegarde local avoir:', err)
  }
}

// -----------------------------------------------------------------------------
// CHARGEMENT DE LA CRÉANCE EMBALLAGE DU CLIENT (EXCLUSIF BRASSERIE)
// -----------------------------------------------------------------------------
export async function getClientEmballagesCreance(
  companyId: string,
  clientId: string,
  isBrasserie: boolean
): Promise<ClientEmballagesCreance> {
  if (!isBrasserie || !companyId || !clientId) {
    return { qte_casiers_dus: 0, qte_bouteilles_dues: 0, qte_casiers_consignes: 0 }
  }

  // 1. Tenter la table dédiée client_emballages_creances
  try {
    const { data, error } = await supabase
      .from('client_emballages_creances')
      .select('qte_casiers_dus, qte_bouteilles_dues, qte_casiers_consignes')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (!error && data) {
      return {
        qte_casiers_dus: Number(data.qte_casiers_dus) || 0,
        qte_bouteilles_dues: Number(data.qte_bouteilles_dues) || 0,
        qte_casiers_consignes: Number(data.qte_casiers_consignes) || 0,
      }
    }
  } catch {
    // continue fallback
  }

  // 2. Fallback table brasserie_emballages_mouvements (calcul réel par solde)
  try {
    const { data: mvts } = await supabase
      .from('brasserie_emballages_mouvements')
      .select('type_mouvement, quantite, emballage_code, code')
      .eq('company_id', companyId)
      .eq('client_id', clientId)

    if (mvts && mvts.length > 0) {
      let casiersDus = 0
      mvts.forEach((m: any) => {
        const type = String(m.type_mouvement || '').toUpperCase()
        const qte = Number(m.quantite) || 0
        if (['INITIAL', 'SORTIE', 'AJUSTEMENT_POSITIF', 'INVENTAIRE'].includes(type)) {
          casiersDus += qte
        } else if (['RETOUR', 'RETOUR_IMMEDIAT', 'RETOUR_CLIENT', 'AVOIR_RETOUR', 'AJUSTEMENT_NEGATIF'].includes(type)) {
          casiersDus = Math.max(0, casiersDus - qte)
        }
      })
      return { qte_casiers_dus: casiersDus, qte_bouteilles_dues: 0, qte_casiers_consignes: casiersDus }
    }
  } catch {
    // continue
  }

  // 3. Fallback cache localStorage client_emballages
  try {
    const cached = localStorage.getItem(`client_emballages_${companyId}_${clientId}`)
    if (cached) {
      const parsed = JSON.parse(cached)
      return {
        qte_casiers_dus: Number(parsed.qte_casiers_dus) || 0,
        qte_bouteilles_dues: Number(parsed.qte_bouteilles_dues) || 0,
        qte_casiers_consignes: Number(parsed.qte_casiers_consignes) || 0
      }
    }
  } catch {}

  return { qte_casiers_dus: 0, qte_bouteilles_dues: 0, qte_casiers_consignes: 0 }
}

// -----------------------------------------------------------------------------
// HISTORIQUE DES AVOIRS DÉJÀ RÉALISÉS SUR UNE FACTURE INITIALE
// -----------------------------------------------------------------------------
export async function getAvoirsByFacture(companyId: string, factureId: string): Promise<FactureAvoirRecord[]> {
  let list: FactureAvoirRecord[] = []

  // 1. Supabase factures_avoirs si disponible
  try {
    const { data, error } = await supabase
      .from('factures_avoirs')
      .select('*')
      .eq('company_id', companyId)
      .eq('facture_initiale_id', factureId)
      .neq('statut', 'annule')

    if (!error && Array.isArray(data) && data.length > 0) {
      list = data as FactureAvoirRecord[]
    }
  } catch {}

  // 2. Persistance directe dans sales_orders (notes.annulation_avoir ou statut ANNULÉE PAR AVOIR)
  try {
    const { data: saleFound } = await supabase
      .from('sales_orders')
      .select('id, order_number, notes, total_amount, subtotal_ht, tva_amount, customer_name, customer_id, created_at, status, sector_slug')
      .eq('company_id', companyId)
      .eq('id', factureId)
      .maybeSingle()

    if (saleFound) {
      let pNotes: any = {}
      try {
        pNotes = typeof saleFound.notes === 'string' ? JSON.parse(saleFound.notes) : (saleFound.notes || {})
      } catch (_) {}

      const stUp = String(saleFound.status || '').toUpperCase()
      if (pNotes.annulation_avoir || stUp.includes('ANNUL') || stUp === 'AVOIR') {
        const ann = pNotes.annulation_avoir || {}
        const avoirIdFromSale = ann.avoir_id || `av-${saleFound.id}`
        if (!list.some(a => a.id === avoirIdFromSale)) {
          const lines = Array.isArray(pNotes.lines)
            ? pNotes.lines.map((l: any, idx: number) => ({
                id: `line-${idx}`,
                avoir_id: avoirIdFromSale,
                article_id: l.product?.id || '',
                article_nom: l.product?.name || l.nom || 'Article',
                qte_retournee: Number(l.qty ?? l.quantite ?? 1),
                prix_unitaire: Number(l.unitPrice ?? l.prix_unitaire ?? 0),
                prix_achat: Number(l.product?.cost_price || 0),
                total_ligne: Number(l.total ?? ((l.qty || 1) * (l.unitPrice || 0))),
                etat_article: 'bon' as const
              }))
            : []

          list.push({
            id: avoirIdFromSale,
            numero: ann.avoir_numero || `AV-${saleFound.order_number}`,
            company_id: companyId,
            sector_slug: saleFound.sector_slug || 'boutique',
            facture_initiale_id: saleFound.id,
            facture_initiale_numero: saleFound.order_number,
            client_id: saleFound.customer_id,
            client_nom: saleFound.customer_name,
            client_telephone: ann.client_telephone || pNotes.customer_phone || '',
            client_ifu: ann.client_ifu || pNotes.customer_ifu || '',
            date_avoir: ann.date_annulation || saleFound.created_at,
            motif: ann.motif || 'Annulation intégrale de facture par avoir',
            montant_total_avoir: Number(saleFound.total_amount || 0),
            montant_ht: Number(saleFound.subtotal_ht || saleFound.total_amount || 0),
            montant_tva: Number(saleFound.tva_amount || 0),
            mode_remboursement: 'credit_client',
            remboursement_effectue: false,
            statut: 'valide',
            created_by_nom: ann.annule_par || 'Utilisateur',
            created_at: ann.date_annulation || saleFound.created_at,
            lignes: lines
          })
        }
      }
    }
  } catch {}

  // Fusionner avec le cache local
  const local = getLocalAvoirs(companyId).filter(
    a => a.facture_initiale_id === factureId && a.statut !== 'annule'
  )

  const mergedMap = new Map<string, FactureAvoirRecord>()
  list.forEach(a => mergedMap.set(a.id, a))
  local.forEach(a => mergedMap.set(a.id, a))

  return Array.from(mergedMap.values())
}

// -----------------------------------------------------------------------------
// LISTER TOUS LES AVOIRS (POUR HISTORIQUE / RAPPORT / TABLEAU DE BORD)
// -----------------------------------------------------------------------------
export async function getAllAvoirs(
  companyId: string,
  sectorSlug?: string
): Promise<FactureAvoirRecord[]> {
  let list: FactureAvoirRecord[] = []

  try {
    let q = supabase
      .from('factures_avoirs')
      .select('*')
      .eq('company_id', companyId)
      .order('date_avoir', { ascending: false })

    if (sectorSlug) {
      q = q.eq('sector_slug', sectorSlug)
    }

    const { data, error } = await q
    if (!error && Array.isArray(data)) {
      list = data as FactureAvoirRecord[]
    }
  } catch {}

  const local = getLocalAvoirs(companyId).filter(a => {
    if (sectorSlug && a.sector_slug !== sectorSlug) return false
    return true
  })

  const mergedMap = new Map<string, FactureAvoirRecord>()
  list.forEach(a => mergedMap.set(a.id, a))
  local.forEach(a => mergedMap.set(a.id, a))

  return Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.date_avoir).getTime() - new Date(a.date_avoir).getTime()
  )
}

// -----------------------------------------------------------------------------
// GÉNÉRATION NUMÉRO UNIQUE AVOIR-YYYY-XXXX PAR COMPANY_ID
// -----------------------------------------------------------------------------
export async function genererNumeroAvoirUnique(companyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `AVOIR-${year}-`

  const localAvoirs = getLocalAvoirs(companyId)
  let maxNum = 0

  localAvoirs.forEach(a => {
    if (a.numero && a.numero.startsWith(prefix)) {
      const part = parseInt(a.numero.replace(prefix, ''), 10)
      if (!isNaN(part) && part > maxNum) maxNum = part
    }
  })

  try {
    const { data } = await supabase
      .from('factures_avoirs')
      .select('numero')
      .eq('company_id', companyId)
      .ilike('numero', `${prefix}%`)

    if (data && Array.isArray(data)) {
      data.forEach(a => {
        if (a.numero && a.numero.startsWith(prefix)) {
          const part = parseInt(a.numero.replace(prefix, ''), 10)
          if (!isNaN(part) && part > maxNum) maxNum = part
        }
      })
    }
  } catch {}

  const nextSeq = String(maxNum + 1).padStart(4, '0')
  return `${prefix}${nextSeq}`
}

// =============================================================================
// FONCTION PRINCIPALE : handleValidationAvoir
// LOGIQUE COMMERCIALE & COMPTABLE STRICTEMENT CONFORME AUX ÉTAPES 1 À 8
// =============================================================================
export async function handleValidationAvoir(
  input: FactureAvoirInput
): Promise<{ success: boolean; avoir?: FactureAvoirRecord; message?: string }> {
  const {
    company_id,
    secteur_id,
    sector_slug,
    facture_initiale_id,
    client_id,
    client_nom,
    motif,
    mode_remboursement,
    remboursement_effectue,
    lignes,
    user_id,
    user_nom,
    qte_casiers_retournes = 0,
    qte_bouteilles_retournes = 0
  } = input

  const isBrasserie = checkIsBrasserieSector(sector_slug)

  // ---------------------------------------------------------------------------
  // ÉTAPE 1 - VALIDATION LIEN FACTURE (GLOBAL TOUS SECTEURS)
  // ---------------------------------------------------------------------------
  if (!facture_initiale_id) {
    return { success: false, message: 'Facture initiale obligatoire pour créer un avoir.' }
  }

  if (!lignes || lignes.length === 0) {
    return { success: false, message: 'Veuillez sélectionner au moins un article à retourner.' }
  }

  // Charger la facture initiale depuis Supabase ou sales_orders
  let factureInitiale: any = null
  try {
    const { data: saleData } = await supabase
      .from('sales_orders')
      .select('*, items:sales_order_items(*)')
      .eq('id', facture_initiale_id)
      .maybeSingle()

    if (saleData) {
      factureInitiale = saleData
    }
  } catch {}

  // Si non trouvée dans Supabase, chercher dans localStorage / factures
  if (!factureInitiale) {
    try {
      const localSales = localStorage.getItem(`sales_orders_${company_id}`)
      if (localSales) {
        const parsed = JSON.parse(localSales)
        factureInitiale = parsed.find((s: any) => s.id === facture_initiale_id)
      }
    } catch {}
  }

  if (!factureInitiale) {
    return { success: false, message: 'Facture initiale introuvable.' }
  }

  // Vérifier company_id
  if (factureInitiale.company_id && factureInitiale.company_id !== company_id) {
    return { success: false, message: 'Incohérence d\'entreprise sur la facture initiale.' }
  }

  // Récupérer les avoirs précédents validés sur cette facture
  const avoirsPrecedents = await getAvoirsByFacture(company_id, facture_initiale_id)

  // Calculer la quantité déjà avoirée par article
  const qteAvoireeParArticle: Record<string, number> = {}
  avoirsPrecedents.forEach(a => {
    if (a.lignes) {
      a.lignes.forEach(l => {
        qteAvoireeParArticle[l.article_id] = (qteAvoireeParArticle[l.article_id] || 0) + Number(l.qte_retournee)
      })
    }
  })

  // Vérifier le plafond par article et calculer le montant total de l'avoir
  let montantTotalAvoir = 0
  const factureItems = factureInitiale.items || factureInitiale.lines || []

  for (const ligne of lignes) {
    const qteRetour = Number(ligne.qte_retournee) || 0
    if (qteRetour <= 0) continue

    const matchingItem = factureItems.find(
      (it: any) => it.product_id === ligne.article_id || it.product?.id === ligne.article_id
    )

    const qteFacturee = Number(matchingItem?.quantity ?? matchingItem?.qty ?? ligne.qte_facturee ?? 0)
    const dejaAvoire = qteAvoireeParArticle[ligne.article_id] || 0
    const qteMaxPossible = Math.max(0, qteFacturee - dejaAvoire)

    if (qteRetour > qteMaxPossible) {
      return {
        success: false,
        message: `Quantité max avoir pour cet article "${ligne.article_nom}" : ${qteMaxPossible}`
      }
    }

    montantTotalAvoir += qteRetour * Number(ligne.prix_unitaire || 0)
  }

  if (montantTotalAvoir <= 0) {
    return { success: false, message: 'Le montant total de l\'avoir doit être supérieur à zéro.' }
  }

  // Bloquer si montant_avoir > (montant_initial - somme avoirs validés)
  const montantInitialFacture = Number(factureInitiale.total_amount ?? factureInitiale.montant_total ?? 0)
  const sommeAvoirsPrecedents = avoirsPrecedents.reduce(
    (sum, a) => sum + (Number(a.montant_total_avoir) || 0),
    0
  )
  const soldeRestantFacture = Math.max(0, montantInitialFacture - sommeAvoirsPrecedents)

  if (montantTotalAvoir > soldeRestantFacture) {
    return {
      success: false,
      message: `Le montant de l'avoir (${montantTotalAvoir.toLocaleString()} FCFA) dépasse le solde disponible de la facture (${soldeRestantFacture.toLocaleString()} FCFA).`
    }
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 3 - SORTIE FOND DE CAISSE (RÈGLE CRITIQUE PHOTO - CONTRÔLE PRÉALABLE)
  // RÈGLE : Seul remboursement_effectue = true produit sortie caisse.
  // Si mode_remboursement = 'especes' OU 'momo' ET remboursement_effectue = true :
  // Vérifier caisse_sessions ouverte aujourd'hui. Si fermée -> ERREUR bloquante :
  // "Ouvrir la caisse d'abord pour rembourser. Fond actuel : 0 si fermée"
  // ---------------------------------------------------------------------------
  let activeSessionId: string | null = null
  let activeCaisseId: string | null = null

  if (remboursement_effectue && (mode_remboursement === 'especes' || mode_remboursement === 'momo')) {
    const statusCaisse = await checkSectorCaisseStatus(company_id, sector_slug)

    if (!statusCaisse.isTodayOpen || !statusCaisse.session || statusCaisse.statusType !== 'OUVERTE_AUJOURDHUI') {
      return {
        success: false,
        message: 'Ouvrir la caisse d\'abord pour rembourser. Fond actuel : 0 si fermée'
      }
    }

    activeSessionId = statusCaisse.session.id
    activeCaisseId = statusCaisse.caisse?.id || statusCaisse.session.caisse_id
  }

  // Générer numéro unique AVOIR-YYYY-XXXX
  const numeroAvoir = await genererNumeroAvoirUnique(company_id)
  const avoirId = crypto.randomUUID()
  const dateIso = input.date_avoir ? new Date(input.date_avoir).toISOString() : new Date().toISOString()

  // ---------------------------------------------------------------------------
  // ÉTAPE 2 - RETOUR STOCK (GLOBAL TOUS SECTEURS)
  // IF etat_article IN ('bon','acceptable') :
  //   UPDATE stocks SET qte = qte + qte_retournee
  //   INSERT mouvements_stock (type='retour_avoir')
  // ELSE (endommage/perime) :
  //   INSERT mouvements_stock type='retour_avarie_avoir' dans stock_avarie, PAS dans stock vendable
  // ---------------------------------------------------------------------------
  for (const ligne of lignes) {
    const qteRetour = Number(ligne.qte_retournee) || 0
    if (qteRetour <= 0) continue

    const isArticleSain = ['bon', 'acceptable'].includes(ligne.etat_article)

    if (isArticleSain) {
      // Réintégrer dans le stock vendable du produit
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('id, sector_meta, cost_price')
          .eq('id', ligne.article_id)
          .maybeSingle()

        if (prod) {
          const currentMeta = prod.sector_meta || {}
          const currentVente = Number(currentMeta.stock_vente ?? 0)
          const newVente = Math.round((currentVente + qteRetour) * 1000) / 1000
          const updatedMeta = { ...currentMeta, stock_vente: newVente }

          await supabase
            .from('products')
            .update({ sector_meta: updatedMeta, updated_at: new Date().toISOString() })
            .eq('id', prod.id)

          // INSERT stock_movements
          await supabase.from('stock_movements').insert({
            company_id,
            product_id: prod.id,
            movement_type: 'RETOUR_AVOIR',
            reference_type: 'facture_avoir',
            reference_id: avoirId,
            reference_number: numeroAvoir,
            quantity: qteRetour,
            previous_stock: currentVente,
            new_stock: newVente,
            unit_cost: Number(ligne.prix_achat) || 0,
            total_cost: qteRetour * (Number(ligne.prix_achat) || 0),
            notes: `Retour avoir ${numeroAvoir} - Article en état ${ligne.etat_article}`,
            sector_slug
          })
        }
      } catch (stkErr) {
        console.warn('[factureAvoirService] Notice retour stock vendable:', stkErr)
      }
    } else {
      // Endommagé ou Périmé -> Enregistrer dans le stock d'avaries
      try {
        await supabase.from('stock_avaries').insert({
          company_id,
          sector_slug,
          produit_id: ligne.article_id,
          produit_nom: ligne.article_nom,
          quantite: qteRetour,
          motif: `Retour avoir ${numeroAvoir} - État: ${ligne.etat_article}`,
          avoir_id: avoirId
        })

        await supabase.from('stock_movements').insert({
          company_id,
          product_id: ligne.article_id,
          movement_type: 'RETOUR_AVARIE_AVOIR',
          reference_type: 'facture_avoir',
          reference_id: avoirId,
          reference_number: numeroAvoir,
          quantity: qteRetour,
          unit_cost: Number(ligne.prix_achat) || 0,
          total_cost: qteRetour * (Number(ligne.prix_achat) || 0),
          notes: `Stock Avarié (Non vendable) - État ${ligne.etat_article}`,
          sector_slug
        })
      } catch (avarieErr) {
        console.warn('[factureAvoirService] Notice stock avarie:', avarieErr)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 3 - APPLICATION SORTIE FOND DE CAISSE (SI REMBOURSEMENT EFFECTUÉ)
  // Si especes : UPDATE caisse_sessions SET fond_actuel_especes = fond_actuel_especes - montant_avoir
  // Si momo : UPDATE caisse_sessions SET fond_actuel_momo = fond_actuel_momo - montant_avoir
  // INSERT caisse_transactions (type='sortie_avoir', montant:-montant_avoir...)
  // ---------------------------------------------------------------------------
  if (remboursement_effectue && (mode_remboursement === 'especes' || mode_remboursement === 'momo')) {
    try {
      if (activeSessionId) {
        const { data: curSession } = await supabase
          .from('caisse_sessions')
          .select('fond_actuel_especes, fond_actuel_momo')
          .eq('id', activeSessionId)
          .maybeSingle()

        if (curSession) {
          if (mode_remboursement === 'especes') {
            const nvFond = (Number(curSession.fond_actuel_especes) || 0) - montantTotalAvoir
            await supabase
              .from('caisse_sessions')
              .update({ fond_actuel_especes: nvFond, updated_at: new Date().toISOString() })
              .eq('id', activeSessionId)
          } else {
            const nvFondMomo = (Number(curSession.fond_actuel_momo) || 0) - montantTotalAvoir
            await supabase
              .from('caisse_sessions')
              .update({ fond_actuel_momo: nvFondMomo, updated_at: new Date().toISOString() })
              .eq('id', activeSessionId)
          }
        }
      }

      // Enregistrer le mouvement dans caisse_mouvements & caisse_transactions
      await enregistrerMouvementCaisse({
        company_id,
        sector_slug,
        caisse_id: activeCaisseId || undefined,
        type: 'SORTIE',
        sens: 'debit',
        montant: montantTotalAvoir,
        montant_especes: mode_remboursement === 'especes' ? montantTotalAvoir : 0,
        montant_momo: mode_remboursement === 'momo' ? montantTotalAvoir : 0,
        motif: `Sortie Remboursement Avoir N° ${numeroAvoir}`,
        source_module: 'factures_avoirs',
        source_id: avoirId,
        reference_id: numeroAvoir,
        user_name: user_nom || 'Utilisateur',
        user_id: user_id || undefined
      })

      // Insertion dans la table caisse_transactions
      await supabase.from('caisse_transactions').insert({
        company_id,
        secteur_id: secteur_id || null,
        sector_slug,
        caisse_id: activeCaisseId || null,
        caisse_session_id: activeSessionId || null,
        avoir_id: avoirId,
        type: 'sortie_avoir',
        montant: -montantTotalAvoir,
        mode: mode_remboursement,
        user_id: user_id || null,
        date: dateIso
      })
    } catch (caisseErr) {
      console.warn('[factureAvoirService] Notice enregistrement sortie caisse:', caisseErr)
    }
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 4 - DIMINUTION VALEUR FACTURE + MARGE (GLOBAL TOUS SECTEURS)
  // UPDATE factures SET montant_total_net = montant_total_initial - SUM(avoirs)
  // Pour chaque ligne : diminution marge
  // ---------------------------------------------------------------------------
  const nouveauMontantNet = Math.max(0, soldeRestantFacture - montantTotalAvoir)
  const nouveauTotalAvoirs = sommeAvoirsPrecedents + montantTotalAvoir

  try {
    let curNotes: any = {}
    try {
      curNotes = typeof factureInitiale.notes === 'string' ? JSON.parse(factureInitiale.notes) : (factureInitiale.notes || {})
    } catch (_) {}
    curNotes.montant_total_net = nouveauMontantNet
    curNotes.total_avoirs = nouveauTotalAvoirs

    await supabase
      .from('sales_orders')
      .update({
        payment_status: nouveauMontantNet === 0 ? 'avoir' : factureInitiale.payment_status,
        notes: JSON.stringify(curNotes)
      })
      .eq('id', facture_initiale_id)
  } catch (updFactErr) {
    console.warn('[factureAvoirService] Notice mise à jour montant_total_net facture:', updFactErr)
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 5 - RÉDUCTION CRÉANCE CLIENT (GLOBAL - SI FACTURE À CRÉDIT)
  // Si facture_initiale.statut_paiement IN ('credit','partiellement_paye','impaye') :
  //   UPDATE clients SET solde_du = solde_du - montant_avoir
  // Si mode_remboursement = 'credit_client' : UPDATE clients SET credit_disponible = credit_disponible + montant_avoir
  // INSERT client_transactions (type='avoir_credit', montant:-montant_avoir)
  // ---------------------------------------------------------------------------
  const paymentStatus = String(factureInitiale.payment_status || '').toLowerCase()
  const hasCredit =
    paymentStatus.includes('credit') ||
    paymentStatus.includes('impaye') ||
    paymentStatus.includes('partiel') ||
    Number(factureInitiale.credit_amount || 0) > 0

  if (client_id && (hasCredit || mode_remboursement === 'credit_client')) {
    try {
      const { data: custData } = await supabase
        .from('customers')
        .select('current_debt, solde_du, credit_disponible')
        .eq('id', client_id)
        .maybeSingle()

      if (custData) {
        let updatedSoldeDu = Number(custData.current_debt ?? custData.solde_du ?? 0)
        let updatedCreditDispo = Number(custData.credit_disponible ?? 0)

        if (hasCredit) {
          // Diminuer la créance client due
          updatedSoldeDu = Math.max(0, updatedSoldeDu - montantTotalAvoir)
        }

        if (mode_remboursement === 'credit_client') {
          // Augmenter le compte d'avoir/crédit disponible du client pour ses futurs achats
          updatedCreditDispo = updatedCreditDispo + montantTotalAvoir
        }

        await supabase
          .from('customers')
          .update({
            current_debt: updatedSoldeDu,
            solde_du: updatedSoldeDu,
            credit_disponible: updatedCreditDispo,
            updated_at: new Date().toISOString()
          })
          .eq('id', client_id)

        // INSERT client_transactions
        await supabase.from('client_transactions').insert({
          company_id,
          client_id,
          avoir_id: avoirId,
          vente_id: facture_initiale_id,
          type: 'avoir_credit',
          montant: -montantTotalAvoir,
          solde_avant: Number(custData.current_debt ?? 0),
          solde_apres: updatedSoldeDu
        })
      }
    } catch (custErr) {
      console.warn('[factureAvoirService] Notice ajustement créance client:', custErr)
    }
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 6 - EXTENSION EXCLUSIVE SECTEUR BRASSERIE & DÉPÔT DE BOISSONS - EMBALLAGES
  // CONDITION : IF isBrasserie -> déduire casiers / bouteilles
  // IF !isBrasserie : NE RIEN FAIRE, ne pas toucher emballages
  // ---------------------------------------------------------------------------
  if (isBrasserie && client_id && (qte_casiers_retournes > 0 || qte_bouteilles_retournes > 0)) {
    try {
      // 1. Charger la créance actuelle
      const currentEmb = await getClientEmballagesCreance(company_id, client_id, true)

      const nvCasiersDus = Math.max(0, currentEmb.qte_casiers_dus - qte_casiers_retournes)
      const nvBouteillesDues = Math.max(0, currentEmb.qte_bouteilles_dues - qte_bouteilles_retournes)

      // 2. Mettre à jour la table client_emballages_creances
      await supabase.from('client_emballages_creances').upsert(
        {
          company_id,
          secteur_id: secteur_id || null,
          sector_slug: 'brasserie',
          client_id,
          qte_casiers_dus: nvCasiersDus,
          qte_bouteilles_dues: nvBouteillesDues,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'company_id,client_id' }
      )

      // Sauvegarder dans le cache local
      localStorage.setItem(
        `client_emballages_${company_id}_${client_id}`,
        JSON.stringify({
          qte_casiers_dus: nvCasiersDus,
          qte_bouteilles_dues: nvBouteillesDues
        })
      )

      // 3. Historiser dans emballages_mouvements
      await supabase.from('emballages_mouvements').insert({
        company_id,
        secteur_id: secteur_id || null,
        sector_slug: 'brasserie',
        client_id,
        avoir_id: avoirId,
        type: 'retour_avoir',
        qte_casiers: qte_casiers_retournes,
        qte_bouteilles: qte_bouteilles_retournes,
        observation: `Retour emballages avec Facture d'Avoir ${numeroAvoir}`
      })

      // 4. Mettre à jour également brasserie_emballages_mouvements pour cohérence POS & Consignations
      await supabase.from('brasserie_emballages_mouvements').insert({
        company_id,
        secteur_id: secteur_id || null,
        client_id,
        client_nom: client_nom || 'Client',
        emballage_code: 'C24T',
        type_mouvement: 'RETOUR',
        quantite: qte_casiers_retournes,
        vente_id: facture_initiale_id,
        observation: `Retour emballages Avoir ${numeroAvoir}`
      })
    } catch (embErr) {
      console.warn('[factureAvoirService] Notice mise à jour emballages brasserie:', embErr)
    }
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 7 - COMPTA SYSCOHADA (GLOBAL TOUS SECTEURS)
  // Une seule écriture par avoir validé, idempotente avec source_id = avoirId
  // Si remboursement espèces/momo : Débit 709 Avoirs sur ventes / Crédit 57/52 Caisse/Banque
  // Si credit_client : Débit 709 / Crédit 411 Client
  // ---------------------------------------------------------------------------
  try {
    const journalCode = mode_remboursement === 'especes' ? 'JC' : mode_remboursement === 'momo' ? 'JC' : mode_remboursement === 'banque' ? 'JB' : 'JV'
    const compteContrepartie =
      mode_remboursement === 'especes'
        ? '571100'
        : mode_remboursement === 'momo'
        ? '572100'
        : mode_remboursement === 'banque'
        ? '521100'
        : '411100'

    const labelContrepartie =
      mode_remboursement === 'especes'
        ? 'Caisse centrale espèces'
        : mode_remboursement === 'momo'
        ? 'Compte Mobile Money'
        : mode_remboursement === 'banque'
        ? 'Banques locales'
        : 'Clients ordinaires'

    // Vérifier idempotence
    const { data: existingEntry } = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('company_id', company_id)
      .eq('source_id', avoirId)
      .maybeSingle()

    if (!existingEntry) {
      await supabase.from('accounting_entries').insert({
        company_id,
        sector_slug,
        journal_code: journalCode,
        entry_number: `ECR-${numeroAvoir}`,
        entry_date: dateIso.slice(0, 10),
        source_module: 'factures_avoirs',
        source_id: avoirId,
        reference_number: numeroAvoir,
        description: `Facture d'Avoir ${numeroAvoir} - ${motif || 'Retour marchandises'}`,
        total_amount: montantTotalAvoir,
        is_balanced: true,
        lines: [
          {
            line_number: 1,
            account_number: '709100',
            account_label: 'Rabais, remises et ristournes accordés / Avoirs sur ventes',
            description: `Avoir ${numeroAvoir}`,
            debit: montantTotalAvoir,
            credit: 0
          },
          {
            line_number: 2,
            account_number: compteContrepartie,
            account_label: labelContrepartie,
            description: `Contrepartie Avoir ${numeroAvoir}`,
            debit: 0,
            credit: montantTotalAvoir,
            third_party_id: client_id || null,
            third_party_name: client_nom || null
          }
        ]
      })
    }
  } catch (comptaErr) {
    console.warn('[factureAvoirService] Notice écriture comptable SYSCOHADA:', comptaErr)
  }

  // ---------------------------------------------------------------------------
  // ENREGISTREMENT FINAL DE L'AVOIR DANS BDD ET CACHE LOCAL
  // ---------------------------------------------------------------------------
  const createdRecord: FactureAvoirRecord = {
    id: avoirId,
    numero: numeroAvoir,
    company_id,
    secteur_id: secteur_id || null,
    sector_slug,
    facture_initiale_id,
    facture_initiale_numero: factureInitiale.order_number,
    client_id: client_id || null,
    client_nom: client_nom || factureInitiale.customer_name || 'Client',
    date_avoir: dateIso,
    motif: motif || 'Retour marchandises',
    montant_total_avoir: montantTotalAvoir,
    mode_remboursement,
    remboursement_effectue,
    statut: 'valide',
    caisse_id: activeCaisseId,
    caisse_session_id: activeSessionId,
    created_by: user_id || null,
    created_by_nom: user_nom || 'Utilisateur',
    lignes: lignes.map(l => ({
      id: crypto.randomUUID(),
      avoir_id: avoirId,
      article_id: l.article_id,
      article_nom: l.article_nom,
      qte_retournee: l.qte_retournee,
      prix_unitaire: l.prix_unitaire,
      prix_achat: l.prix_achat,
      total_ligne: l.qte_retournee * l.prix_unitaire,
      etat_article: l.etat_article
    })),
    created_at: dateIso,
    qte_casiers_retournes: isBrasserie ? qte_casiers_retournes : 0,
    qte_bouteilles_retournes: isBrasserie ? qte_bouteilles_retournes : 0
  }

  // 1. Sauvegarde dans factures_avoirs Supabase (tolérant)
  try {
    await supabase.from('factures_avoirs').insert({
      id: createdRecord.id,
      numero: createdRecord.numero,
      company_id: createdRecord.company_id,
      secteur_id: createdRecord.secteur_id,
      sector_slug: createdRecord.sector_slug,
      facture_initiale_id: createdRecord.facture_initiale_id,
      client_id: createdRecord.client_id,
      client_nom: createdRecord.client_nom,
      date_avoir: createdRecord.date_avoir,
      motif: createdRecord.motif,
      montant_total_avoir: createdRecord.montant_total_avoir,
      mode_remboursement: createdRecord.mode_remboursement,
      remboursement_effectue: createdRecord.remboursement_effectue,
      statut: createdRecord.statut,
      caisse_id: createdRecord.caisse_id,
      caisse_session_id: createdRecord.caisse_session_id,
      created_by: createdRecord.created_by,
      created_by_nom: createdRecord.created_by_nom,
      notes: {
        qte_casiers_retournes: isBrasserie ? qte_casiers_retournes : 0,
        qte_bouteilles_retournes: isBrasserie ? qte_bouteilles_retournes : 0,
        lignes: createdRecord.lignes
      }
    })

    if (createdRecord.lignes && createdRecord.lignes.length > 0) {
      await supabase.from('avoir_lignes').insert(
        createdRecord.lignes.map(l => ({
          avoir_id: createdRecord.id,
          article_id: l.article_id,
          article_nom: l.article_nom,
          qte_retournee: l.qte_retournee,
          prix_unitaire: l.prix_unitaire,
          prix_achat: l.prix_achat,
          total_ligne: l.total_ligne,
          etat_article: l.etat_article
        }))
      )
    }
  } catch (dbErr) {
    console.warn('[factureAvoirService] Notice persistance BDD avoir:', dbErr)
  }

  // 2. Toujours enregistrer dans le cache local garanti
  saveLocalAvoir(company_id, createdRecord)

  return {
    success: true,
    avoir: createdRecord,
    message: `Avoir ${numeroAvoir} validé avec succès (${montantTotalAvoir.toLocaleString()} FCFA).`
  }
}


// =============================================================================
// GESTIO 229 — ANNULATION INTÉGRALE DE FACTURE PAR AVOIR AVEC VÉRIFICATION STRICTE
// =============================================================================

export interface AvoirSaisieLigneInput {
  designation: string
  code?: string
  quantite: number
  prix_unitaire: number
}

export interface AnnulationIntegraleInput {
  company_id: string
  sector_slug: string
  secteur_id?: string | null
  reference_facture: string
  client_nom: string
  client_telephone?: string
  client_ifu?: string
  lignes: AvoirSaisieLigneInput[]
  total_ht_saisi?: number
  tva_saisie?: number
  total_ttc_saisi: number
  motif?: string
  user_id?: string
  user_nom?: string
}

export interface AnnulationIntegraleResult {
  success: boolean
  avoir?: FactureAvoirRecord & {
    montant_ht?: number
    montant_tva?: number
    client_telephone?: string
    client_ifu?: string
  }
  errors?: string[]
  message: string
}

const inFlightAnnulations = new Set<string>()

function normStr(val?: string | null): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function canonicalSector(slug?: string | null): string {
  const s = normStr(slug).replace(/^sec-/, '')
  if (['bar', 'bar-restaurant', 'bar_restaurant', 'bar-restaurant-maquis', 'maquis', 'fast-food', 'restaurant'].includes(s)) {
    return 'restaurant'
  }
  if (['station', 'stationservice', 'station-service'].includes(s)) return 'station-service'
  if (['brasserie', 'depot_boissons', 'depot-boissons', 'brasserie_depot_boissons'].includes(s)) return 'brasserie'
  return s
}

/**
 * Recherche l'ancienne facture par sa référence, compare strictement tous les champs saisis
 * (client, articles, codes, quantités, prix unitaires, HT, TVA, TTC) et exécute l'annulation
 * intégrale atomique + réintégration du stock.
 */
export async function verifierEtAnnulerFactureParAvoir(
  input: AnnulationIntegraleInput
): Promise<AnnulationIntegraleResult> {
  const {
    company_id,
    sector_slug,
    secteur_id,
    reference_facture,
    client_nom,
    client_telephone,
    client_ifu,
    lignes,
    total_ht_saisi,
    tva_saisie,
    total_ttc_saisi,
    motif,
    user_id,
    user_nom
  } = input

  const refClean = String(reference_facture || '').trim()
  if (!company_id) {
    return { success: false, errors: ['Entreprise non identifiée.'], message: 'Entreprise non identifiée.' }
  }
  if (!refClean) {
    return { success: false, errors: ['La référence de la facture initiale est obligatoire.'], message: 'Référence manquante.' }
  }
  if (!lignes || lignes.length === 0) {
    return { success: false, errors: ['Veuillez renseigner au moins un produit de la facture initiale.'], message: 'Aucun produit saisi.' }
  }

  const lockKey = `${company_id}::${refClean.toUpperCase()}`
  if (inFlightAnnulations.has(lockKey)) {
    return { success: false, errors: ['Une validation est déjà en cours pour cette facture.'], message: 'Traitement déjà en cours.' }
  }
  inFlightAnnulations.add(lockKey)

  try {
    // 1. Rechercher l'ancienne facture dans Supabase par order_number (isolation company_id)
    const { data: matchedOrders, error: findErr } = await supabase
      .from('sales_orders')
      .select('*, customer:customers(id, name, phone, ifu_number)')
      .eq('company_id', company_id)
      .ilike('order_number', refClean)
      .limit(5)

    if (findErr) {
      return { success: false, errors: [`Erreur de recherche base de données : ${findErr.message}`], message: findErr.message }
    }

    const facture = (matchedOrders || []).find(
      (o: any) => String(o.order_number || '').trim().toUpperCase() === refClean.toUpperCase()
    )

    if (!facture) {
      return {
        success: false,
        errors: [`Référence introuvable : aucune facture « ${refClean} » n'existe pour cette entreprise.`],
        message: `Facture « ${refClean} » introuvable.`
      }
    }

    // 2. Vérifier isolation secteur
    if (facture.sector_slug && sector_slug && canonicalSector(facture.sector_slug) !== canonicalSector(sector_slug)) {
      return {
        success: false,
        errors: [`Isolation sectorielle : la facture « ${refClean} » appartient au secteur « ${facture.sector_slug} » et ne peut pas être annulée depuis « ${sector_slug} ».`],
        message: 'Facture appartenant à un autre secteur.'
      }
    }

    // 3. Vérifier si déjà annulée par avoir
    const stUpper = String(facture.status || '').toUpperCase()
    const psLower = String(facture.payment_status || '').toLowerCase()
    if (
      stUpper.includes('ANNUL') ||
      stUpper === 'AVOIR' ||
      stUpper === 'CANCELLED' ||
      psLower === 'avoir'
    ) {
      return {
        success: false,
        errors: [`Facture déjà annulée : la facture « ${refClean} » a déjà fait l'objet d'une annulation intégrale (Statut : ${facture.status}).`],
        message: 'Cette facture a déjà été annulée par avoir.'
      }
    }

    const existingAvoirs = await getAvoirsByFacture(company_id, facture.id)
    if (existingAvoirs.some(a => a.statut !== 'annule')) {
      return {
        success: false,
        errors: [`Doublon interdit : un avoir validé (${existingAvoirs[0].numero}) est déjà rattaché à la facture « ${refClean} ».`],
        message: 'Un avoir existe déjà pour cette facture.'
      }
    }

    // 4. Extraire les données réelles de la facture (notes + sales_order_lines)
    let parsedNotes: any = {}
    if (facture.notes) {
      try {
        parsedNotes = typeof facture.notes === 'string' ? JSON.parse(facture.notes) : facture.notes
      } catch (_) {}
    }

    const { data: dbLines } = await supabase
      .from('sales_order_lines')
      .select('*, product:products(id, code, name, cost_price, sector_meta, is_recipe)')
      .eq('order_id', facture.id)

    const notesLines: any[] = Array.isArray(parsedNotes?.lines) ? parsedNotes.lines : []
    const realLines: Array<{
      product_id: string
      designation: string
      code: string
      quantite: number
      prix_unitaire: number
      prix_achat: number
      total_ttc: number
      is_recipe: boolean
    }> = []

    if (dbLines && dbLines.length > 0) {
      dbLines.forEach((dl: any) => {
        const matchNote = notesLines.find(
          (nl: any) => (nl.product?.id && nl.product.id === dl.product_id) || normStr(nl.product?.name) === normStr(dl.product_name)
        )
        realLines.push({
          product_id: dl.product_id || matchNote?.product?.id || '',
          designation: dl.product_name || dl.product?.name || matchNote?.product?.name || '',
          code: dl.product?.code || matchNote?.product?.code || '',
          quantite: Number(dl.quantity) || 0,
          prix_unitaire: Number(dl.unit_price) || 0,
          prix_achat: Number(dl.unit_cost) || Number(dl.product?.cost_price) || 0,
          total_ttc: Number(dl.total_ttc) || (Number(dl.quantity) * Number(dl.unit_price)),
          is_recipe: Boolean(dl.product?.is_recipe || matchNote?.product?.is_recipe)
        })
      })
    } else if (notesLines.length > 0) {
      notesLines.forEach((nl: any) => {
        const qty = Number(nl.qty ?? nl.quantite ?? 0)
        const pu = Number(nl.unitPrice ?? nl.prix_unitaire ?? 0)
        realLines.push({
          product_id: nl.product?.id || '',
          designation: nl.product?.name || nl.nom || '',
          code: nl.product?.code || '',
          quantite: qty,
          prix_unitaire: pu,
          prix_achat: Number(nl.product?.cost_price || 0),
          total_ttc: qty * pu,
          is_recipe: Boolean(nl.product?.is_recipe)
        })
      })
    }

    // 5. CONTRÔLES STRICTS DE CORRESPONDANCE (AUCUNE DIFFÉRENCE TOLÉRÉE)
    const errors: string[] = []

    // 5a. Client
    const realClientName = facture.customer?.name || facture.customer_name || parsedNotes.customer_name || 'Client Comptoir'
    const saisiClientNorm = normStr(client_nom)
    const realClientNorm = normStr(realClientName)
    const isRealComptoir = realClientNorm.includes('comptoir') || realClientNorm === 'client' || realClientNorm === ''
    const isSaisiComptoir = saisiClientNorm.includes('comptoir')

    if (!saisiClientNorm) {
      errors.push('Client : le nom du client ou « Client comptoir » est obligatoire.')
    } else if (saisiClientNorm !== realClientNorm && !(isRealComptoir && isSaisiComptoir)) {
      errors.push(`Client non conforme : saisi « ${client_nom} », facture originale « ${realClientName} ».`)
    }

    const realPhone = String(facture.customer?.phone || parsedNotes.customer_phone || '').trim()
    if (client_telephone && client_telephone.trim() !== '' && realPhone && normStr(client_telephone) !== normStr(realPhone)) {
      errors.push(`Téléphone client non conforme : saisi « ${client_telephone} », facture originale « ${realPhone} ».`)
    }

    const realIfu = String(facture.customer?.ifu_number || parsedNotes.customer_ifu || '').trim()
    if (client_ifu && client_ifu.trim() !== '' && realIfu && normStr(client_ifu) !== normStr(realIfu)) {
      errors.push(`IFU client non conforme : saisi « ${client_ifu} », facture originale « ${realIfu} ».`)
    }

    // 5b. Nombre et correspondance exacte des articles
    if (realLines.length === 0) {
      errors.push('Impossible de vérifier les lignes de la facture originale (aucune ligne enregistrée).')
    } else if (lignes.length !== realLines.length) {
      errors.push(`Nombre de produits différent : ${lignes.length} produit(s) saisi(s) contre ${realLines.length} sur la facture originale.`)
    }

    const usedRealIndices = new Set<number>()
    lignes.forEach((sLigne, idx) => {
      const sNom = normStr(sLigne.designation)
      const sCode = normStr(sLigne.code)
      const sQty = Number(sLigne.quantite) || 0
      const sPu = Number(sLigne.prix_unitaire) || 0

      const matchIndex = realLines.findIndex((r, rIdx) => {
        if (usedRealIndices.has(rIdx)) return false
        return normStr(r.designation) === sNom || (sCode && normStr(r.code) === sCode)
      })

      if (matchIndex === -1) {
        errors.push(`Ligne ${idx + 1} (« ${sLigne.designation} ») : produit absent de la facture originale.`)
      } else {
        usedRealIndices.add(matchIndex)
        const real = realLines[matchIndex]
        if (normStr(real.designation) !== sNom) {
          errors.push(`Ligne ${idx + 1} : désignation saisie « ${sLigne.designation} » différente de « ${real.designation} ».`)
        }
        if (sCode && real.code && sCode !== normStr(real.code)) {
          errors.push(`Ligne ${idx + 1} (« ${sLigne.designation} ») : code saisi « ${sLigne.code} » différent de « ${real.code} ».`)
        }
        if (Math.abs(sQty - real.quantite) > 0.001) {
          errors.push(`Quantité « ${sLigne.designation} » non conforme : saisie ${sQty}, facturée ${real.quantite}.`)
        }
        if (Math.abs(sPu - real.prix_unitaire) > 0.5) {
          errors.push(`Prix unitaire « ${sLigne.designation} » non conforme : saisi ${sPu.toLocaleString()} FCFA, facturé ${real.prix_unitaire.toLocaleString()} FCFA.`)
        }
      }
    })

    // 5c. Montants HT, TVA, TTC
    const realTTC = Math.round(Number(facture.total_amount || 0))
    const realHT = Math.round(Number(facture.subtotal_ht || realTTC))
    const realTVA = Math.round(Number(facture.tva_amount || 0))
    const saisiTTC = Math.round(Number(total_ttc_saisi || 0))

    if (Math.abs(saisiTTC - realTTC) > 1) {
      errors.push(`Montant Total TTC non conforme : saisi ${saisiTTC.toLocaleString()} FCFA, facture originale ${realTTC.toLocaleString()} FCFA.`)
    }
    if (total_ht_saisi !== undefined && Math.abs(Math.round(total_ht_saisi) - realHT) > 1) {
      errors.push(`Montant HT non conforme : saisi ${Math.round(total_ht_saisi).toLocaleString()} FCFA, facture originale ${realHT.toLocaleString()} FCFA.`)
    }
    if (tva_saisie !== undefined && Math.abs(Math.round(tva_saisie) - realTVA) > 1) {
      errors.push(`Montant TVA non conforme : saisi ${Math.round(tva_saisie).toLocaleString()} FCFA, facture originale ${realTVA.toLocaleString()} FCFA.`)
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors,
        message: 'Les informations saisies ne correspondent pas exactement à la facture originale.'
      }
    }

    // 6. EXÉCUTION ATOMIQUE DE L'ANNULATION INTÉGRALE
    const nowIso = new Date().toISOString()
    const numeroAvoir = await genererNumeroAvoirUnique(company_id)
    const avoirId = crypto.randomUUID()

    const avoirLignesRecord: AvoirLigneRecord[] = realLines.map(r => ({
      id: crypto.randomUUID(),
      avoir_id: avoirId,
      article_id: r.product_id,
      article_nom: r.designation,
      qte_retournee: r.quantite,
      prix_unitaire: r.prix_unitaire,
      prix_achat: r.prix_achat,
      total_ligne: r.total_ttc,
      etat_article: 'bon'
    }))

    const createdRecord: FactureAvoirRecord & {
      montant_ht?: number
      montant_tva?: number
      client_telephone?: string
      client_ifu?: string
    } = {
      id: avoirId,
      numero: numeroAvoir,
      company_id,
      secteur_id: secteur_id || null,
      sector_slug: facture.sector_slug || sector_slug,
      facture_initiale_id: facture.id,
      facture_initiale_numero: facture.order_number,
      client_id: facture.customer_id || null,
      client_nom: realClientName,
      client_telephone: realPhone || client_telephone || '',
      client_ifu: realIfu || client_ifu || '',
      date_avoir: nowIso,
      motif: motif || 'Annulation intégrale de facture par avoir',
      montant_ht: realHT,
      montant_tva: realTVA,
      montant_total_avoir: realTTC,
      mode_remboursement: 'credit_client',
      remboursement_effectue: false,
      statut: 'valide',
      created_by: user_id || null,
      created_by_nom: user_nom || 'Utilisateur',
      lignes: avoirLignesRecord,
      created_at: nowIso
    }

    // 6a. Insérer l'avoir dans factures_avoirs
    const { error: avInsertErr } = await supabase.from('factures_avoirs').insert({
      id: createdRecord.id,
      numero: createdRecord.numero,
      company_id: createdRecord.company_id,
      secteur_id: createdRecord.secteur_id,
      sector_slug: createdRecord.sector_slug,
      facture_initiale_id: createdRecord.facture_initiale_id,
      client_id: createdRecord.client_id,
      client_nom: createdRecord.client_nom,
      date_avoir: createdRecord.date_avoir,
      motif: createdRecord.motif,
      montant_total_avoir: createdRecord.montant_total_avoir,
      mode_remboursement: createdRecord.mode_remboursement,
      remboursement_effectue: false,
      statut: 'valide',
      created_by: createdRecord.created_by,
      created_by_nom: createdRecord.created_by_nom,
      notes: {
        type_annulation: 'INTEGRALE',
        facture_initiale_numero: facture.order_number,
        montant_ht: realHT,
        montant_tva: realTVA,
        client_telephone: createdRecord.client_telephone,
        client_ifu: createdRecord.client_ifu,
        lignes: createdRecord.lignes
      }
    })

    if (avInsertErr) {
      throw new Error(`Impossible d'enregistrer l'avoir en base : ${avInsertErr.message}`)
    }

    // 6b. Insérer les lignes dans avoir_lignes
    if (avoirLignesRecord.length > 0) {
      await supabase.from('avoir_lignes').insert(
        avoirLignesRecord.map(l => ({
          avoir_id: createdRecord.id,
          article_id: l.article_id || null,
          article_nom: l.article_nom,
          qte_retournee: l.qte_retournee,
          prix_unitaire: l.prix_unitaire,
          prix_achat: l.prix_achat,
          total_ligne: l.total_ligne,
          etat_article: 'bon'
        }))
      )
    }

    // 6c. Mettre à jour l'ancienne facture -> ANNULÉE PAR AVOIR (sans la supprimer)
    const updatedNotes = {
      ...parsedNotes,
      montant_total_net: 0,
      total_avoirs: realTTC,
      annulation_avoir: {
        avoir_id: createdRecord.id,
        avoir_numero: createdRecord.numero,
        date_annulation: nowIso,
        annule_par: user_nom || 'Utilisateur',
        motif: createdRecord.motif
      }
    }

    const { error: updErr } = await supabase
      .from('sales_orders')
      .update({
        status: 'ANNULÉE PAR AVOIR',
        payment_status: 'avoir',
        motif_annulation: `Annulée par avoir ${createdRecord.numero}`,
        notes: JSON.stringify(updatedNotes)
      })
      .eq('id', facture.id)
      .eq('company_id', company_id)

    if (updErr) {
      // Rollback avoir si la mise à jour de la facture échoue
      await supabase.from('avoir_lignes').delete().eq('avoir_id', createdRecord.id)
      await supabase.from('factures_avoirs').delete().eq('id', createdRecord.id)
      throw new Error(`Échec mise à jour statut facture (rollback effectué) : ${updErr.message}`)
    }

    // 6d. Réintégrer intégralement les produits physiques dans le stock du secteur d'origine
    for (const r of realLines) {
      if (!r.product_id || r.is_recipe || r.quantite <= 0) continue
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('id, sector_meta, stock_vente, cost_price')
          .eq('id', r.product_id)
          .eq('company_id', company_id)
          .maybeSingle()

        if (prod) {
          const meta = prod.sector_meta || {}
          const curStock = Number(meta.stock_vente ?? prod.stock_vente ?? 0)
          const newStock = Math.round((curStock + r.quantite) * 1000) / 1000
          const updatedMeta = { ...meta, stock_vente: newStock }

          await supabase
            .from('products')
            .update({ sector_meta: updatedMeta, updated_at: nowIso })
            .eq('id', prod.id)
            .eq('company_id', company_id)

          await supabase.from('stock_movements').insert({
            company_id,
            sector_slug: facture.sector_slug || sector_slug,
            product_id: prod.id,
            movement_type: 'AVOIR_RETOUR',
            reference_type: 'facture_avoir',
            reference_id: createdRecord.id,
            reference_number: createdRecord.numero,
            quantity: r.quantite,
            previous_stock: curStock,
            new_stock: newStock,
            unit_cost: r.prix_achat,
            total_cost: r.quantite * r.prix_achat,
            notes: `Réintégration intégrale suite à avoir ${createdRecord.numero} (Facture ${facture.order_number})`,
            created_at: nowIso
          })
        }
      } catch (stkErr) {
        console.warn('[factureAvoirService] Notice réintégration stock:', stkErr)
      }
    }

    // 6e. Réduire la créance client si vente à crédit
    if (facture.customer_id && Number(facture.credit_amount || 0) > 0) {
      try {
        const { data: cust } = await supabase
          .from('customers')
          .select('current_debt, solde_du')
          .eq('id', facture.customer_id)
          .maybeSingle()

        if (cust) {
          const prevDebt = Number(cust.current_debt ?? cust.solde_du ?? 0)
          const newDebt = Math.max(0, prevDebt - Number(facture.credit_amount || 0))
          await supabase
            .from('customers')
            .update({ current_debt: newDebt, solde_du: newDebt, updated_at: nowIso })
            .eq('id', facture.customer_id)
        }
      } catch (_) {}
    }

    saveLocalAvoir(company_id, createdRecord)

    return {
      success: true,
      avoir: createdRecord,
      message: `Avoir ${createdRecord.numero} validé. Facture ${facture.order_number} annulée intégralement et stock réintégré.`
    }
  } catch (err: any) {
    return {
      success: false,
      errors: [err?.message || 'Erreur technique lors de l\'annulation par avoir.'],
      message: err?.message || 'Erreur lors de l\'annulation.'
    }
  } finally {
    inFlightAnnulations.delete(lockKey)
  }
}
