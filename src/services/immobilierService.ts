// =============================================================================
// GESTIO 229 SaaS — Service Spécialisé : Gestion Locative & Immobilière Pro
// Conforme : SYSCOHADA Révisé, Normes Immobilières Bénin & UEMOA
// Isolation stricte par company_id et sector_slug ('immobilier' / 'location')
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'
import { createAccountingEntry } from './accountingService'

export interface ImmobilierKPIs {
  nbBiens: number
  nbUnites: number
  occupes: number
  disponibles: number
  enTravaux: number
  tauxOccupation: number
  loyersAttendusMois: number
  loyersEncaissesMois: number
  tauxRecouvrement: number
  totalImpayes: number
  impayesMoins30j: number
  impayes30a60j: number
  impayesPlus60j: number
  contratsExpirentBientot: number
  cautionsEnDepot: number
  cautionsARestituer: number
  commissionsMois: number
  soldeProprietairesAttente: number
}

export const immobilierService = {
  /**
   * Calcule en temps réel tous les KPIs du Dashboard Immobilier
   */
  async getDashboardKPIs(companyId: string, sectorSlug: string = 'immobilier'): Promise<ImmobilierKPIs> {
    const slug = sectorSlug.toLowerCase().includes('location') ? 'location' : 'immobilier'
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7) // 'YYYY-MM'
    
    // 1. Biens & Logements
    const { data: biens } = await supabase
      .from('location_biens')
      .select('id, statut, loyer_mensuel, type_bien, immeuble_parent_id')
      .eq('company_id', companyId)

    const allBiens = biens || []
    const nbBiens = allBiens.length
    const occupes = allBiens.filter(b => b.statut === 'OCCUPE').length
    const disponibles = allBiens.filter(b => b.statut === 'LIBRE' || b.statut === 'DISPONIBLE').length
    const enTravaux = allBiens.filter(b => b.statut === 'EN_TRAVAUX' || b.statut === 'TRAVAUX').length
    const denom = occupes + disponibles
    const tauxOccupation = denom > 0 ? Math.round((occupes / denom) * 100) : 0

    // 2. Échéances du mois en cours
    const { data: echeancesMois } = await supabase
      .from('location_echeances')
      .select('id, montant_attendu, montant_paye, reste_a_payer, statut, date_echeance')
      .eq('company_id', companyId)
      .eq('periode_mois', currentMonth)

    const ech = echeancesMois || []
    const loyersAttendusMois = ech.reduce((sum, e) => sum + Number(e.montant_attendu || 0), 0)
    const loyersEncaissesMois = ech.reduce((sum, e) => sum + Number(e.montant_paye || 0), 0)
    const tauxRecouvrement = loyersAttendusMois > 0 
      ? Math.round((loyersEncaissesMois / loyersAttendusMois) * 100) 
      : 0

    // 3. Tous les impayés et segmentation par ancienneté
    const { data: allUnpaid } = await supabase
      .from('location_echeances')
      .select('id, reste_a_payer, date_echeance')
      .eq('company_id', companyId)
      .gt('reste_a_payer', 0)

    let totalImpayes = 0
    let impayesMoins30j = 0
    let impayes30a60j = 0
    let impayesPlus60j = 0

    const todayMs = now.getTime()
    ;(allUnpaid || []).forEach(u => {
      const solde = Number(u.reste_a_payer || 0)
      totalImpayes += solde
      const diffDays = Math.floor((todayMs - new Date(u.date_echeance).getTime()) / (1000 * 3600 * 24))
      if (diffDays <= 30) impayesMoins30j += solde
      else if (diffDays <= 60) impayes30a60j += solde
      else impayesPlus60j += solde
    })

    // 4. Contrats expirant dans <= 30 jours
    const in30Days = new Date(todayMs + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const todayStr = now.toISOString().slice(0, 10)
    const { count: contratsExp } = await supabase
      .from('location_contrats')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('statut', 'ACTIF')
      .gte('date_fin', todayStr)
      .lte('date_fin', in30Days)

    // 5. Cautions
    const { data: cautions } = await supabase
      .from('location_cautions')
      .select('montant_recu, montant_restitue, solde_restitution, statut')
      .eq('company_id', companyId)

    let cautionsEnDepot = 0
    let cautionsARestituer = 0
    ;(cautions || []).forEach(c => {
      if (c.statut === 'CONSERVEE') {
        cautionsEnDepot += Number(c.montant_recu || 0) - Number(c.montant_restitue || 0)
      } else if (c.statut === 'A_RESTITUER' || c.solde_restitution > 0) {
        cautionsARestituer += Number(c.solde_restitution || 0)
      }
    })

    // 6. Commissions de l'agence du mois
    const { data: quittancesMois } = await supabase
      .from('location_quittances')
      .select('commission_agence, part_proprietaire')
      .eq('company_id', companyId)
      .gte('created_at', `${currentMonth}-01`)

    const commissionsMois = (quittancesMois || []).reduce((sum, q) => sum + Number(q.commission_agence || 0), 0)
    const soldeProprietairesAttente = (quittancesMois || [])
      .filter((q: any) => !q.reverser_au_proprio)
      .reduce((sum, q) => sum + Number(q.part_proprietaire || 0), 0)

    return {
      nbBiens,
      nbUnites: nbBiens,
      occupes,
      disponibles,
      enTravaux,
      tauxOccupation,
      loyersAttendusMois,
      loyersEncaissesMois,
      tauxRecouvrement,
      totalImpayes,
      impayesMoins30j,
      impayes30a60j,
      impayesPlus60j,
      contratsExpirentBientot: contratsExp || 0,
      cautionsEnDepot,
      cautionsARestituer,
      commissionsMois,
      soldeProprietairesAttente
    }
  },

  /**
   * Génération automatique des échéances pour un contrat de bail
   */
  async genererEcheancesContrat(params: {
    contratId: string
    companyId: string
    secteurId?: string
    bienId?: string
    loyerMensuel: number
    chargesMensuel?: number
    dateDebut: string
    dateFin?: string
    nbMois?: number
  }) {
    const { contratId, companyId, secteurId, bienId, loyerMensuel, chargesMensuel = 0, dateDebut } = params
    const totalParMois = Number(loyerMensuel) + Number(chargesMensuel)
    const startDate = new Date(dateDebut)
    const nbMoisAGenerer = params.nbMois || (params.dateFin ? Math.max(1, Math.round((new Date(params.dateFin).getTime() - startDate.getTime()) / (30 * 24 * 3600 * 1000))) : 12)

    const echeancesToInsert = []

    for (let i = 0; i < nbMoisAGenerer; i++) {
      const eDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate() || 5)
      const periodeMois = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}`
      const dateEcheanceStr = eDate.toISOString().slice(0, 10)

      echeancesToInsert.push({
        company_id: companyId,
        secteur_id: secteurId || null,
        sector_slug: 'immobilier',
        contrat_id: contratId,
        bien_id: bienId || null,
        periode_mois: periodeMois,
        date_echeance: dateEcheanceStr,
        montant_attendu: totalParMois,
        montant_loyer: Number(loyerMensuel),
        montant_charges: Number(chargesMensuel),
        montant_paye: 0,
        reste_a_payer: totalParMois,
        statut: 'ATTENTE',
      })
    }

    // Upsert avec ignoreDuplicates pour garantir l'idempotence stricte
    const { data, error } = await supabase
      .from('location_echeances')
      .upsert(echeancesToInsert, { onConflict: 'contrat_id,periode_mois', ignoreDuplicates: true })

    if (error) console.error('[ECHEANCES] Erreur génération auto:', error)
    return { data, error }
  },

  /**
   * Encaissement d'un loyer (Total ou Partiel)
   * Génère automatiquement :
   * 1. Mise à jour de l'échéance (reste à payer, statut ATTENTE/PARTIEL/PAYE)
   * 2. Quittance (si PAYE) ou Reçu (si PARTIEL) avec référence QUITT-YYYY-XXX
   * 3. Écriture Caisse dans caisse_mouvements via enregistrerMouvementCaisse
   * 4. Écriture Comptable SYSCOHADA (Débit 571 Caisse / Crédit 467 Bailleur + 706 Commission)
   */
  async encaisserLoyer(params: {
    companyId: string
    secteurId?: string
    sectorSlug?: string
    echeanceId: string
    contratId: string
    locataireNom: string
    bienRef?: string
    montantVersement: number
    modePaiement: 'Especes' | 'MoMo' | 'Virement' | 'Cheque'
    datePaiement?: string
    caisseId?: string
    tauxCommission?: number
    userId?: string
    userName?: string
  }) {
    const {
      companyId,
      echeanceId,
      contratId,
      locataireNom,
      bienRef = 'Logement',
      montantVersement,
      modePaiement,
      datePaiement = new Date().toISOString().slice(0, 10),
      tauxCommission = 10,
      userId,
      userName
    } = params

    // 1. Récupérer l'échéance
    const { data: echeance, error: errEch } = await supabase
      .from('location_echeances')
      .select('*')
      .eq('id', echeanceId)
      .single()

    if (errEch || !echeance) throw new Error('Échéance introuvable')

    const dejaPaye = Number(echeance.montant_paye || 0)
    const nouveauPaye = dejaPaye + Number(montantVersement)
    const montantAttendu = Number(echeance.montant_attendu || 0)
    const resteAPayer = Math.max(0, montantAttendu - nouveauPaye)
    const isSolde = resteAPayer === 0
    const nouveauStatut = isSolde ? 'PAYE' : nouveauPaye > 0 ? 'PARTIEL' : 'ATTENTE'

    // 2. Mettre à jour l'échéance
    await supabase
      .from('location_echeances')
      .update({
        montant_paye: nouveauPaye,
        reste_a_payer: resteAPayer,
        statut: nouveauStatut,
        derniere_date_paiement: datePaiement,
        updated_at: new Date().toISOString()
      })
      .eq('id', echeanceId)

    // 3. Calcul de la commission et de la part propriétaire
    const commission = Math.round((Number(montantVersement) * Number(tauxCommission)) / 100)
    const partProprietaire = Number(montantVersement) - commission

    // 4. Numérotation de quittance / reçu QUITT-YYYY-XXX
    const annee = new Date().getFullYear()
    const { count } = await supabase
      .from('location_quittances')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
    const seq = String((count || 0) + 1).padStart(4, '0')
    const refDoc = `${isSolde ? 'QUITT' : 'RECU'}-${annee}-${seq}`

    // 5. Créer la Quittance ou le Reçu
    const { data: quittance, error: errQuitt } = await supabase
      .from('location_quittances')
      .insert({
        company_id: companyId,
        secteur_id: params.secteurId || null,
        sector_slug: 'immobilier',
        reference: refDoc,
        contrat_id: contratId,
        echeance_id: echeanceId,
        locataire_nom: locataireNom,
        bien_ref: bienRef,
        mois_loyer: echeance.periode_mois,
        montant_loyer: Number(montantVersement),
        montant_total: Number(montantVersement),
        montant_paye: Number(montantVersement),
        solde_restant: resteAPayer,
        commission_agence: commission,
        part_proprietaire: partProprietaire,
        statut: isSolde ? 'PAYEE' : 'PARTIELLE',
        type_document: isSolde ? 'QUITTANCE' : 'RECU',
        date_paiement: datePaiement,
        mode_paiement: modePaiement
      })
      .select()
      .single()

    // 6. Mouvement de caisse réel dans caisse_mouvements (sans créer de 2e caisse)
    try {
      await enregistrerMouvementCaisse({
        company_id: companyId,
        sector_slug: 'immobilier',
        caisse_id: params.caisseId,
        type: 'reglement_client',
        sens: 'entree',
        montant_especes: modePaiement === 'Especes' ? Number(montantVersement) : 0,
        montant_momo: modePaiement === 'MoMo' ? Number(montantVersement) : 0,
        source_module: 'quittances_loyers',
        source_id: quittance?.id || echeanceId,
        motif: `Encaissement loyer ${echeance.periode_mois} - ${locataireNom} (${refDoc})`,
        user_name: userName,
        user_id: userId
      })
    } catch (eCaisse) {
      console.warn('[IMMO] Warning écriture caisse:', eCaisse)
    }

    // 7. Écriture Comptable SYSCOHADA Révisé
    // Débit: 571100 (Caisse) ou 521100 (Banque) / Crédit: 467000 (Propriétaire bailleur) + 706000 (Commissions agence)
    try {
      const compteTresorerie = modePaiement === 'Virement' || modePaiement === 'Cheque' ? '521100' : '571100'
      const labelTresorerie = modePaiement === 'Virement' || modePaiement === 'Cheque' ? 'Banques locales' : 'Caisse centrale'

      await createAccountingEntry({
        companyId,
        sectorSlug: 'immobilier',
        journalCode: modePaiement === 'Virement' || modePaiement === 'Cheque' ? 'JB' : 'JC',
        entryDate: datePaiement,
        reference: refDoc,
        documentType: isSolde ? 'QUITTANCE_LOYER' : 'RECU_LOYER',
        documentId: quittance?.id || echeanceId,
        description: `Loyer ${echeance.periode_mois} - ${locataireNom} (${bienRef})`,
        sourceModule: 'immobilier_loyers',
        sourceId: quittance?.id || echeanceId,
        lines: [
          {
            accountNumber: compteTresorerie,
            accountLabel: labelTresorerie,
            debit: Number(montantVersement),
            credit: 0,
            thirdPartyName: locataireNom
          },
          {
            accountNumber: '467100',
            accountLabel: 'Bailleurs — Loyers collectés à reverser',
            debit: 0,
            credit: partProprietaire,
            thirdPartyName: locataireNom
          },
          {
            accountNumber: '706100',
            accountLabel: 'Honoraires & Commissions de gestion immobilière',
            debit: 0,
            credit: commission,
            thirdPartyName: 'Agence Immobilière'
          }
        ]
      })
    } catch (eCompta) {
      console.warn('[IMMO] Warning écriture comptable SYSCOHADA:', eCompta)
    }

    return {
      success: true,
      refDoc,
      isSolde,
      resteAPayer,
      quittance
    }
  }
}
