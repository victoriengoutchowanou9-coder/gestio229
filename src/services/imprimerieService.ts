// =============================================================================
// GESTIO 229 SaaS — Service Métier Dédié : Imprimerie & Sérigraphie
// Centre d'Impression Modèle Simplifié + Modèle Classique
// Clé d'isolation stricte : (company_id + sector_slug)
// =============================================================================

import { supabase } from '../lib/supabase'
import { enregistrerMouvementCaisse } from './caisseSectorService'

export type ModeGestion = 'simplifie' | 'classique'
export type ModeCalcul = 'm2' | 'unite' | 'page' | 'heure' | 'forfait' | 'personnalise'
export type PrioriteCommande = 'normale' | 'urgente' | 'tres_urgente'
export type StatutCommande =
  | 'nouveau'
  | 'devis_accepte'
  | 'a_concevoir'
  | 'maquette_attente'
  | 'maquette_validee'
  | 'en_production'
  | 'en_impression'
  | 'en_finition'
  | 'termine'
  | 'livre'
  | 'annule'

export interface ImprimerieConfig {
  id?: string
  company_id: string
  sector_slug: string
  mode_gestion: ModeGestion
  marge_cible_pct: number
  mention_devis: string
  conditions_vente: string
  taux_tva_defaut: number
  taux_aib_defaut: number
  devise: string
}

export interface MatierePremiere {
  id: string
  company_id: string
  sector_slug: string
  code: string
  nom: string
  categorie: string
  unite: string
  stock_actuel: number
  stock_minimum: number
  cout_moyen: number
  dernier_cout_achat: number
  valeur_stock: number
  fournisseur_prefere?: string
  est_actif: boolean
}

export interface PrestationMatiereBOM {
  id?: string
  prestation_id?: string
  matiere_id: string
  matiere_nom?: string
  quantite_prevue: number
  unite: string
  cout_unitaire_prevu: number
  cout_total_prevu: number
}

export interface PrestationImprimerie {
  id: string
  company_id: string
  sector_slug: string
  code: string
  nom: string
  categorie: string
  description?: string
  mode_calcul: ModeCalcul
  unite_facturation: string
  prix_vente: number
  prix_minimum: number
  prix_gros: number
  tva_applicable: boolean
  aib_applicable: boolean
  cout_mo_defaut: number
  cout_finition_defaut: number
  cout_autres_defaut: number
  est_actif: boolean
  matieres_bom?: PrestationMatiereBOM[]
  cout_revient_theorique?: number
  marge_theorique?: number
  taux_marge_theorique?: number
}

export interface DevisLigne {
  id?: string
  prestation_id?: string
  designation: string
  mode_calcul: ModeCalcul
  largeur: number
  hauteur: number
  surface_m2: number
  quantite: number
  prix_unitaire: number
  remise_pct: number
  montant_ht: number
  tva_pct: number
  montant_ttc: number
  details_json?: any
}

export interface DevisImprimerie {
  id: string
  company_id: string
  sector_slug: string
  numero_devis: string
  client_id?: string
  client_nom: string
  client_tel?: string
  client_email?: string
  date_devis: string
  date_validite: string
  commercial_id?: string
  commercial_nom?: string
  total_ht: number
  total_tva: number
  total_aib: number
  total_ttc: number
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire' | 'transforme'
  commande_id?: string
  notes?: string
  lignes?: DevisLigne[]
}

export interface CommandeLigne {
  id?: string
  commande_id?: string
  prestation_id?: string
  designation: string
  mode_calcul: ModeCalcul
  largeur: number
  hauteur: number
  surface_m2: number
  quantite: number
  prix_unitaire: number
  montant_ttc: number
  details_json?: any
}

export interface CommandeImprimerie {
  id: string
  company_id: string
  sector_slug: string
  numero_commande: string
  devis_id?: string
  client_id?: string
  client_nom: string
  client_tel?: string
  titre_travail: string
  date_commande: string
  date_livraison_prevue?: string
  date_livraison_reelle?: string
  priorite: PrioriteCommande
  statut: StatutCommande
  graphiste_id?: string
  graphiste_nom?: string
  fichier_url?: string
  instructions_graphiste?: string
  est_sous_traitee: boolean
  sous_traitant_nom?: string
  sous_traitance_cout: number
  cout_matieres_prevu: number
  cout_matieres_reel: number
  cout_mo: number
  cout_finition: number
  cout_autres: number
  cout_revient_total: number
  total_ttc: number
  marge_reelle: number
  taux_marge_reel: number
  montant_acompte: number
  montant_paye: number
  solde_restant: number
  statut_paiement: 'non_paye' | 'acompte' | 'solde' | 'credit'
  notes_production?: string
  lignes?: CommandeLigne[]
  consommations?: ConsommationMatiere[]
}

export interface ConsommationMatiere {
  id?: string
  commande_id: string
  matiere_id: string
  matiere_nom?: string
  quantite_prevue: number
  quantite_reelle: number
  ecart_perte: number
  cout_unitaire: number
  cout_total: number
  motif_perte?: 'chute' | 'erreur_impression' | 'defaut_matiere' | 'mauvaise_manipulation' | 'reimpression' | 'autre'
  est_reimpression?: boolean
  notes?: string
}

export interface PaiementCommande {
  id?: string
  company_id: string
  sector_slug: string
  commande_id: string
  caisse_id?: string
  session_caisse_id?: string
  client_id?: string
  montant: number
  mode_paiement: 'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'cheque' | 'credit'
  reference_recu: string
  caissier_id?: string
  caissier_nom?: string
  date_paiement?: string
  type_paiement: 'acompte' | 'solde' | 'partiel' | 'vente_rapide'
  notes?: string
}

export interface SousTraitanceOrdre {
  id: string
  company_id: string
  sector_slug: string
  commande_id?: string
  commande_num?: string
  fournisseur_id?: string
  fournisseur_nom: string
  prestation_nom: string
  description?: string
  quantite: number
  montant_ht: number
  montant_paye: number
  montant_restant: number
  statut: 'commande' | 'en_cours' | 'recu' | 'paye' | 'annule'
  date_commande: string
  date_livraison?: string
}

export const imprimerieService = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. CONFIGURATION
  // ───────────────────────────────────────────────────────────────────────────
  async getConfig(companyId: string, sectorSlug: string = 'imprimerie'): Promise<ImprimerieConfig> {
    try {
      const { data, error } = await supabase
        .from('imprimerie_config')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', sectorSlug)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.warn('Erreur getConfig imprimerie:', error)
      }

      if (data) return data as ImprimerieConfig

      // Valeurs par défaut si pas encore initialisé en base
      return {
        company_id: companyId,
        sector_slug: sectorSlug,
        mode_gestion: 'classique',
        marge_cible_pct: 40,
        mention_devis: "Validité de l'offre : 15 jours. Acompte de 50% à la commande, solde à la livraison.",
        conditions_vente: 'B.A.T. signé obligatoire avant impression finale.',
        taux_tva_defaut: 18,
        taux_aib_defaut: 1,
        devise: 'FCFA',
      }
    } catch {
      return {
        company_id: companyId,
        sector_slug: sectorSlug,
        mode_gestion: 'classique',
        marge_cible_pct: 40,
        mention_devis: "Validité de l'offre : 15 jours.",
        conditions_vente: 'B.A.T. signé obligatoire.',
        taux_tva_defaut: 18,
        taux_aib_defaut: 1,
        devise: 'FCFA',
      }
    }
  },

  async saveConfig(config: Partial<ImprimerieConfig> & { company_id: string; sector_slug?: string }): Promise<void> {
    const sector = config.sector_slug || 'imprimerie'
    const { error } = await supabase.from('imprimerie_config').upsert(
      {
        ...config,
        sector_slug: sector,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,sector_slug' }
    )
    if (error) throw error
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. MATIÈRES PREMIÈRES & STOCKS
  // ───────────────────────────────────────────────────────────────────────────
  async getMatieres(companyId: string, sectorSlug: string = 'imprimerie'): Promise<MatierePremiere[]> {
    const { data, error } = await supabase
      .from('imprimerie_matieres')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('nom', { ascending: true })

    if (error) {
      console.warn('Erreur getMatieres:', error)
      return []
    }
    return (data || []) as MatierePremiere[]
  },

  async saveMatiere(matiere: Partial<MatierePremiere> & { company_id: string; nom: string }): Promise<MatierePremiere> {
    const sector = matiere.sector_slug || 'imprimerie'
    const code = matiere.code || `MAT-${Date.now().toString().slice(-6)}`
    const stock = Number(matiere.stock_actuel || 0)
    const cout = Number(matiere.cout_moyen || matiere.dernier_cout_achat || 0)
    const valeur = stock * cout

    const payload = {
      ...matiere,
      sector_slug: sector,
      code,
      stock_actuel: stock,
      cout_moyen: cout,
      valeur_stock: valeur,
      updated_at: new Date().toISOString(),
    }

    if (matiere.id) {
      const { data, error } = await supabase
        .from('imprimerie_matieres')
        .update(payload)
        .eq('id', matiere.id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const { data, error } = await supabase.from('imprimerie_matieres').insert(payload).select().single()
      if (error) throw error
      return data
    }
  },

  async adjustStockMatiere(
    matiereId: string,
    deltaStock: number,
    operation: 'entree' | 'sortie',
    notes?: string
  ): Promise<void> {
    const { data: current } = await supabase
      .from('imprimerie_matieres')
      .select('stock_actuel, cout_moyen')
      .eq('id', matiereId)
      .single()

    if (!current) return
    const newStock = Math.max(0, Number(current.stock_actuel || 0) + (operation === 'entree' ? deltaStock : -deltaStock))
    const valeur = newStock * Number(current.cout_moyen || 0)

    await supabase
      .from('imprimerie_matieres')
      .update({
        stock_actuel: newStock,
        valeur_stock: valeur,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matiereId)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CATALOGUE PRESTATIONS & NOMENCLATURE BOM
  // ───────────────────────────────────────────────────────────────────────────
  async getPrestations(companyId: string, sectorSlug: string = 'imprimerie'): Promise<PrestationImprimerie[]> {
    const { data: prestations, error } = await supabase
      .from('imprimerie_prestations')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('nom', { ascending: true })

    if (error) {
      console.warn('Erreur getPrestations:', error)
      return []
    }

    // Récupérer les liaisons BOM matières
    const prestationIds = (prestations || []).map((p) => p.id)
    let bomList: any[] = []
    if (prestationIds.length > 0) {
      const { data: boms } = await supabase
        .from('imprimerie_prestation_matieres')
        .select('*, matiere:imprimerie_matieres(nom, code, unite, cout_moyen)')
        .in('prestation_id', prestationIds)

      bomList = boms || []
    }

    return (prestations || []).map((p) => {
      const mats = bomList
        .filter((b) => b.prestation_id === p.id)
        .map((b) => ({
          id: b.id,
          prestation_id: b.prestation_id,
          matiere_id: b.matiere_id,
          matiere_nom: b.matiere?.nom || 'Matière',
          quantite_prevue: Number(b.quantite_prevue || 0),
          unite: b.unite || b.matiere?.unite || 'u',
          cout_unitaire_prevu: Number(b.cout_unitaire_prevu || b.matiere?.cout_moyen || 0),
          cout_total_prevu: Number(b.cout_total_prevu || 0),
        }))

      const coutMatieres = mats.reduce((acc, m) => acc + m.cout_total_prevu, 0)
      const coutRevient =
        coutMatieres +
        Number(p.cout_mo_defaut || 0) +
        Number(p.cout_finition_defaut || 0) +
        Number(p.cout_autres_defaut || 0)
      const prixVente = Number(p.prix_vente || 0)
      const marge = prixVente - coutRevient
      const tauxMarge = prixVente > 0 ? (marge / prixVente) * 100 : 0

      return {
        ...p,
        matieres_bom: mats,
        cout_revient_theorique: coutRevient,
        marge_theorique: marge,
        taux_marge_theorique: tauxMarge,
      }
    })
  },

  async savePrestation(
    prestation: Partial<PrestationImprimerie> & { company_id: string; nom: string },
    matieresBom: PrestationMatiereBOM[] = []
  ): Promise<PrestationImprimerie> {
    const sector = prestation.sector_slug || 'imprimerie'
    const code = prestation.code || `PRES-${Date.now().toString().slice(-6)}`

    const payload = {
      ...prestation,
      sector_slug: sector,
      code,
      updated_at: new Date().toISOString(),
    }
    delete (payload as any).matieres_bom
    delete (payload as any).cout_revient_theorique
    delete (payload as any).marge_theorique
    delete (payload as any).taux_marge_theorique

    let presId = prestation.id
    if (presId) {
      await supabase.from('imprimerie_prestations').update(payload).eq('id', presId)
    } else {
      const { data, error } = await supabase.from('imprimerie_prestations').insert(payload).select().single()
      if (error) throw error
      presId = data.id
    }

    // Mise à jour de la nomenclature BOM
    if (presId) {
      await supabase.from('imprimerie_prestation_matieres').delete().eq('prestation_id', presId)

      if (matieresBom.length > 0) {
        const bomPayloads = matieresBom.map((b) => ({
          company_id: prestation.company_id,
          sector_slug: sector,
          prestation_id: presId,
          matiere_id: b.matiere_id,
          quantite_prevue: Number(b.quantite_prevue || 1),
          unite: b.unite,
          cout_unitaire_prevu: Number(b.cout_unitaire_prevu || 0),
          cout_total_prevu: Number(b.quantite_prevue || 1) * Number(b.cout_unitaire_prevu || 0),
        }))
        await supabase.from('imprimerie_prestation_matieres').insert(bomPayloads)
      }
    }

    return (await this.getPrestations(prestation.company_id, sector)).find((p) => p.id === presId)!
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. DEVIS PROFESSIONNELS & CALCUL SURFACES / DIMENSIONS
  // ───────────────────────────────────────────────────────────────────────────
  async getDevis(companyId: string, sectorSlug: string = 'imprimerie'): Promise<DevisImprimerie[]> {
    const { data: devisList, error } = await supabase
      .from('imprimerie_devis')
      .select('*, lignes:imprimerie_devis_lignes(*)')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Erreur getDevis:', error)
      return []
    }
    return (devisList || []) as DevisImprimerie[]
  },

  async saveDevis(
    devis: Partial<DevisImprimerie> & { company_id: string; client_nom: string },
    lignes: DevisLigne[]
  ): Promise<DevisImprimerie> {
    const sector = devis.sector_slug || 'imprimerie'
    const num = devis.numero_devis || `DEV-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`

    // Calculs totaux
    let totalHt = 0
    let totalTtc = 0
    const computedLignes = lignes.map((l) => {
      let surface = Number(l.surface_m2 || 0)
      if (l.mode_calcul === 'm2' && l.largeur && l.hauteur) {
        surface = Number((Number(l.largeur) * Number(l.hauteur)).toFixed(3))
      }
      const qty = Number(l.quantite || 1)
      const pu = Number(l.prix_unitaire || 0)
      const baseTotal = l.mode_calcul === 'm2' && surface > 0 ? surface * qty * pu : qty * pu
      const remise = Number(l.remise_pct || 0)
      const ligneHt = baseTotal * (1 - remise / 100)
      const tvaPct = Number(l.tva_pct || 0)
      const ligneTtc = ligneHt * (1 + tvaPct / 100)

      totalHt += ligneHt
      totalTtc += ligneTtc

      return {
        ...l,
        surface_m2: surface,
        montant_ht: ligneHt,
        montant_ttc: ligneTtc,
      }
    })

    const payload = {
      ...devis,
      sector_slug: sector,
      numero_devis: num,
      total_ht: Math.round(totalHt),
      total_tva: Math.round(totalTtc - totalHt),
      total_aib: 0,
      total_ttc: Math.round(totalTtc),
      updated_at: new Date().toISOString(),
    }
    delete (payload as any).lignes

    let devisId = devis.id
    if (devisId) {
      await supabase.from('imprimerie_devis').update(payload).eq('id', devisId)
    } else {
      const { data, error } = await supabase.from('imprimerie_devis').insert(payload).select().single()
      if (error) throw error
      devisId = data.id
    }

    if (devisId) {
      await supabase.from('imprimerie_devis_lignes').delete().eq('devis_id', devisId)
      const lignesPayload = computedLignes.map((l) => ({
        company_id: devis.company_id,
        sector_slug: sector,
        devis_id: devisId,
        prestation_id: l.prestation_id || null,
        designation: l.designation,
        mode_calcul: l.mode_calcul || 'm2',
        largeur: l.largeur || 0,
        hauteur: l.hauteur || 0,
        surface_m2: l.surface_m2 || 0,
        quantite: l.quantite || 1,
        prix_unitaire: l.prix_unitaire || 0,
        remise_pct: l.remise_pct || 0,
        montant_ht: l.montant_ht || 0,
        tva_pct: l.tva_pct || 0,
        montant_ttc: l.montant_ttc || 0,
        details_json: l.details_json || {},
      }))
      await supabase.from('imprimerie_devis_lignes').insert(lignesPayload)
    }

    return (await this.getDevis(devis.company_id, sector)).find((d) => d.id === devisId)!
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. TRANSFORMATION DIRECTE : DEVIS ➔ COMMANDE DE PRODUCTION
  // ───────────────────────────────────────────────────────────────────────────
  async transformerDevisEnCommande(devisId: string, user?: any): Promise<CommandeImprimerie> {
    const { data: devis, error: dErr } = await supabase
      .from('imprimerie_devis')
      .select('*, lignes:imprimerie_devis_lignes(*)')
      .eq('id', devisId)
      .single()

    if (dErr || !devis) throw new Error('Devis introuvable pour transformation.')

    const cmdNum = `CMD-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
    const titre = devis.lignes?.[0]?.designation
      ? `${devis.lignes[0].designation} (${devis.client_nom})`
      : `Travaux d'impression - ${devis.client_nom}`

    // Créer la commande
    const cmdPayload = {
      company_id: devis.company_id,
      sector_slug: devis.sector_slug,
      numero_commande: cmdNum,
      devis_id: devis.id,
      client_id: devis.client_id,
      client_nom: devis.client_nom,
      client_tel: devis.client_tel,
      titre_travail: titre,
      date_commande: new Date().toISOString().split('T')[0],
      priorite: 'normale',
      statut: 'devis_accepte',
      total_ttc: devis.total_ttc,
      montant_acompte: 0,
      montant_paye: 0,
      solde_restant: devis.total_ttc,
      statut_paiement: 'non_paye',
      cout_matieres_prevu: 0,
      cout_revient_total: 0,
      marge_reelle: devis.total_ttc,
      taux_marge_reel: 100,
    }

    const { data: newCmd, error: cErr } = await supabase
      .from('imprimerie_commandes')
      .insert(cmdPayload)
      .select()
      .single()

    if (cErr) throw cErr

    // Copier les lignes
    if (devis.lignes && devis.lignes.length > 0) {
      const cmdLignes = devis.lignes.map((l: any) => ({
        company_id: devis.company_id,
        sector_slug: devis.sector_slug,
        commande_id: newCmd.id,
        prestation_id: l.prestation_id,
        designation: l.designation,
        mode_calcul: l.mode_calcul,
        largeur: l.largeur,
        hauteur: l.hauteur,
        surface_m2: l.surface_m2,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        montant_ttc: l.montant_ttc,
        details_json: l.details_json,
      }))
      await supabase.from('imprimerie_commande_lignes').insert(cmdLignes)
    }

    // Mettre à jour le devis en "transforme"
    await supabase
      .from('imprimerie_devis')
      .update({
        statut: 'transforme',
        commande_id: newCmd.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', devis.id)

    // Tracer dans l'audit
    await this.logAudit({
      company_id: devis.company_id,
      sector_slug: devis.sector_slug,
      user_id: user?.id,
      user_nom: user?.full_name || user?.name || 'Commercial',
      action: 'TRANSFORMATION_DEVIS_COMMANDE',
      module: 'Devis & Production',
      document_ref: cmdNum,
      details: { devis_id: devis.id, devis_numero: devis.numero_devis, total_ttc: devis.total_ttc },
    })

    return newCmd
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6. COMMANDES & WORKFLOW DE PRODUCTION (GRAPHISTE, IMPRESSION, LIVRAISON)
  // ───────────────────────────────────────────────────────────────────────────
  async getCommandes(companyId: string, sectorSlug: string = 'imprimerie'): Promise<CommandeImprimerie[]> {
    const { data, error } = await supabase
      .from('imprimerie_commandes')
      .select('*, lignes:imprimerie_commande_lignes(*), consommations:imprimerie_consommations(*)')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Erreur getCommandes:', error)
      return []
    }
    return (data || []) as CommandeImprimerie[]
  },

  async updateCommandeStatus(
    commandeId: string,
    newStatus: StatutCommande,
    user?: any,
    additionalData: Partial<CommandeImprimerie> = {}
  ): Promise<void> {
    const payload: any = {
      statut: newStatus,
      updated_at: new Date().toISOString(),
      ...additionalData,
    }

    if (newStatus === 'livre') {
      payload.date_livraison_reelle = new Date().toISOString()
    }

    const { data: cmdBefore } = await supabase
      .from('imprimerie_commandes')
      .select('numero_commande, statut')
      .eq('id', commandeId)
      .single()

    const { error } = await supabase.from('imprimerie_commandes').update(payload).eq('id', commandeId)
    if (error) throw error

    // Journal d'audit
    await this.logAudit({
      company_id: user?.company_id,
      sector_slug: user?.sector_slug || 'imprimerie',
      user_id: user?.id,
      user_nom: user?.full_name || 'Utilisateur',
      action: 'CHANGEMENT_STATUT_COMMANDE',
      module: 'Production',
      document_ref: cmdBefore?.numero_commande || commandeId,
      details: {
        ancien_statut: cmdBefore?.statut,
        nouveau_statut: newStatus,
      },
    })
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 7. CONSOMMATION RÉELLE, PERTES/CHUTES & RÉIMPRESSIONS
  // ───────────────────────────────────────────────────────────────────────────
  async enregistrerConsommationReelle(
    commandeId: string,
    matiereId: string,
    quantiteReelle: number,
    motifPerte: ConsommationMatiere['motif_perte'] = 'chute',
    estReimpression: boolean = false,
    quantitePrevue: number = 0,
    notes?: string,
    user?: any
  ): Promise<void> {
    const { data: mat } = await supabase
      .from('imprimerie_matieres')
      .select('nom, cout_moyen, stock_actuel, company_id, sector_slug')
      .eq('id', matiereId)
      .single()

    if (!mat) throw new Error('Matière première introuvable.')

    const coutUnitaire = Number(mat.cout_moyen || 0)
    const coutTotal = Number(quantiteReelle || 0) * coutUnitaire
    const ecartPerte = Math.max(0, quantiteReelle - quantitePrevue)

    // Insérer la consommation réelle
    await supabase.from('imprimerie_consommations').insert({
      company_id: mat.company_id,
      sector_slug: mat.sector_slug,
      commande_id: commandeId,
      matiere_id: matiereId,
      quantite_prevue: quantitePrevue,
      quantite_reelle: quantiteReelle,
      ecart_perte: ecartPerte,
      cout_unitaire: coutUnitaire,
      cout_total: coutTotal,
      motif_perte: motifPerte,
      est_reimpression: estReimpression,
      notes: notes || null,
    })

    // Déduire du stock de matières
    await this.adjustStockMatiere(matiereId, quantiteReelle, 'sortie')

    // Recalculer le coût réel de la commande et la marge réelle
    const { data: allConsos } = await supabase
      .from('imprimerie_consommations')
      .select('cout_total')
      .eq('commande_id', commandeId)

    const totalCoutMatieres = (allConsos || []).reduce((acc: number, c: any) => acc + Number(c.cout_total || 0), 0)

    const { data: cmd } = await supabase
      .from('imprimerie_commandes')
      .select('total_ttc, cout_mo, cout_finition, cout_autres, sous_traitance_cout')
      .eq('id', commandeId)
      .single()

    if (cmd) {
      const coutRevient =
        totalCoutMatieres +
        Number(cmd.cout_mo || 0) +
        Number(cmd.cout_finition || 0) +
        Number(cmd.cout_autres || 0) +
        Number(cmd.sous_traitance_cout || 0)
      const ca = Number(cmd.total_ttc || 0)
      const marge = ca - coutRevient
      const tauxMarge = ca > 0 ? (marge / ca) * 100 : 0

      await supabase
        .from('imprimerie_commandes')
        .update({
          cout_matieres_reel: totalCoutMatieres,
          cout_revient_total: coutRevient,
          marge_reelle: marge,
          taux_marge_reel: Number(tauxMarge.toFixed(2)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', commandeId)
    }

    // Audit log
    await this.logAudit({
      company_id: mat.company_id,
      sector_slug: mat.sector_slug,
      user_id: user?.id,
      user_nom: user?.full_name || 'Atelier Production',
      action: estReimpression ? 'REIMPRESSION_INTERNE' : 'CONSOMMATION_REELLE_MATIERE',
      module: 'Production',
      document_ref: commandeId,
      details: {
        matiere: mat.nom,
        quantite_reelle: quantiteReelle,
        ecart_perte: ecartPerte,
        motif_perte: motifPerte,
        cout_total: coutTotal,
      },
    })
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 8. ENCAISSEMENTS INDÉPENDANTS (CAISSIÈRE, ACOMPTES, SOLDES)
  // ───────────────────────────────────────────────────────────────────────────
  async enregistrerPaiement(paiement: PaiementCommande, user?: any): Promise<void> {
    const { data: cmd, error: cErr } = await supabase
      .from('imprimerie_commandes')
      .select('*')
      .eq('id', paiement.commande_id)
      .single()

    if (cErr || !cmd) throw new Error('Commande introuvable pour encaissement.')

    const montantVerse = Number(paiement.montant || 0)
    const nouveauPaye = Number(cmd.montant_paye || 0) + montantVerse
    const totalTtc = Number(cmd.total_ttc || 0)
    const nouveauSolde = Math.max(0, totalTtc - nouveauPaye)

    let statutPaiement: 'non_paye' | 'acompte' | 'solde' | 'credit' = 'non_paye'
    if (nouveauSolde <= 0) {
      statutPaiement = 'solde'
    } else if (nouveauPaye > 0) {
      statutPaiement = 'acompte'
    }

    const refRecu = paiement.reference_recu || `REC-${Date.now().toString().slice(-6)}`

    // Insérer l'encaissement dans les paiements imprimerie
    await supabase.from('imprimerie_paiements').insert({
      company_id: paiement.company_id,
      sector_slug: paiement.sector_slug,
      commande_id: paiement.commande_id,
      caisse_id: paiement.caisse_id || null,
      session_caisse_id: paiement.session_caisse_id || null,
      client_id: cmd.client_id || null,
      montant: montantVerse,
      mode_paiement: paiement.mode_paiement,
      reference_recu: refRecu,
      caissier_id: user?.id || null,
      caissier_nom: user?.full_name || 'Caissière',
      type_paiement: paiement.type_paiement,
      notes: paiement.notes || null,
    })

    // Mettre à jour la commande
    await supabase
      .from('imprimerie_commandes')
      .update({
        montant_paye: nouveauPaye,
        solde_restant: nouveauSolde,
        statut_paiement: statutPaiement,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cmd.id)

    // Intégration Caisse Opérationnelle Secteur GESTIO 229
    try {
      await enregistrerMouvementCaisse(paiement.company_id, paiement.sector_slug || 'imprimerie', {
        type: 'encaissement',
        sens: 'entree',
        montant_especes: ['especes'].includes(paiement.mode_paiement) ? montantVerse : 0,
        montant_momo: ['momo_mtn', 'momo_moov'].includes(paiement.mode_paiement) ? montantVerse : 0,
        source_module: 'imprimerie',
        source_id: cmd.id,
        motif: `Encaissement impression ${cmd.numero_commande} - ${refRecu}`,
        user_name: user?.full_name || 'Caissière',
        user_id: user?.id,
      })
    } catch (caisseErr) {
      console.warn('Erreur synchronisation caisse imprimerie:', caisseErr)
    }
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 9. VENTE EXPRESS & PANIER MULTI-PRESTATIONS (AVEC DÉDUCTION MATIÈRES BOM)
  // ───────────────────────────────────────────────────────────────────────────
  async creerVentePanier(
    companyId: string,
    sectorSlug: string = 'imprimerie',
    params: {
      items: Array<{
        prestation: PrestationImprimerie
        quantite: number
        largeur?: number
        hauteur?: number
        prixUnitaire: number
        totalLigne: number
      }>
      clientNom: string
      clientTel?: string
      modePaiement: 'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'
      montantPaye: number
      isEnAttente?: boolean
    },
    user?: any
  ): Promise<{ commande: CommandeImprimerie; recuRef: string }> {
    const cmdNum = `VEX-${Date.now().toString().slice(-6)}`
    const recuRef = `REC-${Date.now().toString().slice(-6)}`
    const totalTtc = params.items.reduce((acc, it) => acc + it.totalLigne, 0)
    const isAttente = Boolean(params.isEnAttente)
    const montantPaye = isAttente ? 0 : Math.min(totalTtc, Number(params.montantPaye || 0))
    const soldeRestant = Math.max(0, totalTtc - montantPaye)
    const statutPaiement = isAttente ? 'non_paye' : soldeRestant === 0 ? 'solde' : montantPaye > 0 ? 'acompte' : 'credit'
    const statutCmd: StatutCommande = isAttente ? 'nouveau' : 'livre'

    // Coût théorique cumulé des matières
    let coutMatieresTotal = 0
    params.items.forEach((it) => {
      coutMatieresTotal += Number(it.prestation.cout_revient_theorique || 0) * it.quantite
    })
    const marge = totalTtc - coutMatieresTotal
    const tauxMarge = totalTtc > 0 ? (marge / totalTtc) * 100 : 0

    const titreTravail = params.items.map((it) => `${it.prestation.nom} x${it.quantite}`).join(', ').slice(0, 250)

    // 1. Créer la commande
    const { data: cmd, error } = await supabase
      .from('imprimerie_commandes')
      .insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        numero_commande: cmdNum,
        client_nom: params.clientNom || 'Client Comptoir',
        client_tel: params.clientTel || null,
        titre_travail: titreTravail || 'Vente Express',
        date_commande: new Date().toISOString().split('T')[0],
        date_livraison_prevue: new Date().toISOString().split('T')[0],
        priorite: 'normale',
        statut: statutCmd,
        total_ttc: totalTtc,
        montant_acompte: montantPaye,
        montant_paye: montantPaye,
        solde_restant: soldeRestant,
        statut_paiement: statutPaiement,
        cout_matieres_prevu: coutMatieresTotal,
        cout_matieres_reel: coutMatieresTotal,
        cout_revient_total: coutMatieresTotal,
        marge_reelle: marge,
        taux_marge_reel: Number(tauxMarge.toFixed(2)),
      })
      .select()
      .single()

    if (error) throw error

    // 2. Insérer toutes les lignes du panier
    const lignesPayload = params.items.map((it) => ({
      company_id: companyId,
      sector_slug: sectorSlug,
      commande_id: cmd.id,
      prestation_id: it.prestation.id,
      designation: it.prestation.nom,
      mode_calcul: it.prestation.mode_calcul,
      largeur: it.largeur || 0,
      hauteur: it.hauteur || 0,
      surface_m2: it.largeur && it.hauteur ? it.largeur * it.hauteur : 0,
      quantite: it.quantite,
      prix_unitaire: it.prixUnitaire,
      montant_ttc: it.totalLigne,
    }))
    await supabase.from('imprimerie_commande_lignes').insert(lignesPayload)

    // 3. Encaissement si non en attente et montantPaye > 0
    if (!isAttente && montantPaye > 0) {
      await supabase.from('imprimerie_paiements').insert({
        company_id: companyId,
        sector_slug: sectorSlug,
        commande_id: cmd.id,
        montant: montantPaye,
        mode_paiement: params.modePaiement === 'credit' ? 'especes' : params.modePaiement,
        reference_recu: recuRef,
        caissier_id: user?.id || null,
        caissier_nom: user?.full_name || 'Caissière',
        type_paiement: 'vente_rapide',
      })

      // Mouvement Caisse Secteur
      try {
        await enregistrerMouvementCaisse(companyId, sectorSlug, {
          type: 'vente',
          sens: 'entree',
          montant_especes: ['especes'].includes(params.modePaiement) ? montantPaye : 0,
          montant_momo: ['momo_mtn', 'momo_moov'].includes(params.modePaiement) ? montantPaye : 0,
          source_module: 'imprimerie',
          source_id: cmd.id,
          motif: `Vente express impression ${cmdNum} - ${params.clientNom}`,
          user_name: user?.full_name || 'Caissière',
          user_id: user?.id,
        })
      } catch (caisseErr) {
        console.warn('Erreur synchro caisse vente express:', caisseErr)
      }
    }

    // 4. Déduire automatiquement les matières premières BOM si validé
    if (!isAttente) {
      for (const it of params.items) {
        if (it.prestation.matieres_bom && it.prestation.matieres_bom.length > 0) {
          for (const bom of it.prestation.matieres_bom) {
            const surfaceFactor = (it.largeur && it.hauteur && it.prestation.mode_calcul === 'm2')
              ? (it.largeur * it.hauteur)
              : 1
            const qtyConsommee = Number(bom.quantite_prevue || 1) * it.quantite * surfaceFactor
            await this.adjustStockMatiere(bom.matiere_id, qtyConsommee, 'sortie')
          }
        }
      }
    }

    return { commande: cmd, recuRef }
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 9.b VENTE RAPIDE MONO-ARTICLE (Rétro-compatibilité)
  // ───────────────────────────────────────────────────────────────────────────
  async creerVenteRapide(
    companyId: string,
    sectorSlug: string = 'imprimerie',
    params: {
      prestation: PrestationImprimerie
      quantite: number
      largeur?: number
      hauteur?: number
      prixVente: number
      clientNom: string
      clientTel?: string
      modePaiement: 'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'
      montantPaye: number
    },
    user?: any
  ): Promise<{ commande: CommandeImprimerie; recuRef: string }> {
    return this.creerVentePanier(
      companyId,
      sectorSlug,
      {
        items: [
          {
            prestation: params.prestation,
            quantite: params.quantite,
            largeur: params.largeur,
            hauteur: params.hauteur,
            prixUnitaire: params.prixVente / Math.max(1, params.quantite),
            totalLigne: params.prixVente,
          },
        ],
        clientNom: params.clientNom,
        clientTel: params.clientTel,
        modePaiement: params.modePaiement,
        montantPaye: params.montantPaye,
        isEnAttente: false,
      },
      user
    )
  },



  // ───────────────────────────────────────────────────────────────────────────
  // 10. SOUS-TRAITANCE
  // ───────────────────────────────────────────────────────────────────────────
  async getSousTraitances(companyId: string, sectorSlug: string = 'imprimerie'): Promise<SousTraitanceOrdre[]> {
    const { data, error } = await supabase
      .from('imprimerie_sous_traitance')
      .select('*, commande:imprimerie_commandes(numero_commande, client_nom)')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Erreur getSousTraitances:', error)
      return []
    }

    return (data || []).map((st: any) => ({
      ...st,
      commande_num: st.commande?.numero_commande,
    }))
  },

  async saveSousTraitance(
    st: Partial<SousTraitanceOrdre> & { company_id: string; fournisseur_nom: string; prestation_nom: string }
  ): Promise<void> {
    const sector = st.sector_slug || 'imprimerie'
    const payload = {
      ...st,
      sector_slug: sector,
      montant_restant: Number(st.montant_ht || 0) - Number(st.montant_paye || 0),
      updated_at: new Date().toISOString(),
    }
    delete (payload as any).commande_num

    if (st.id) {
      await supabase.from('imprimerie_sous_traitance').update(payload).eq('id', st.id)
    } else {
      await supabase.from('imprimerie_sous_traitance').insert(payload)
    }

    // Si rattaché à une commande, mettre à jour le coût de sous-traitance
    if (st.commande_id) {
      await supabase
        .from('imprimerie_commandes')
        .update({
          est_sous_traitee: true,
          sous_traitant_nom: st.fournisseur_nom,
          sous_traitance_cout: Number(st.montant_ht || 0),
          updated_at: new Date().toISOString(),
        })
        .eq('id', st.commande_id)
    }
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 11. AUDIT TRAIL
  // ───────────────────────────────────────────────────────────────────────────
  async logAudit(logData: {
    company_id?: string
    sector_slug?: string
    user_id?: string
    user_nom?: string
    action: string
    module: string
    document_ref?: string
    details?: any
  }): Promise<void> {
    if (!logData.company_id) return
    try {
      await supabase.from('imprimerie_audit_logs').insert({
        company_id: logData.company_id,
        sector_slug: logData.sector_slug || 'imprimerie',
        user_id: logData.user_id || null,
        user_nom: logData.user_nom || 'Système',
        action: logData.action,
        module: logData.module,
        document_ref: logData.document_ref || null,
        details: logData.details || {},
      })
    } catch (e) {
      console.warn('Erreur logAudit imprimerie:', e)
    }
  },

  async getAuditLogs(companyId: string, sectorSlug: string = 'imprimerie'): Promise<any[]> {
    const { data, error } = await supabase
      .from('imprimerie_audit_logs')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return []
    return data || []
  },
}
