// =============================================================================
// GESTIO 229 SaaS — Service Métier Complet: École & Centre de Formation
// Support des 3 profils d'établissement :
// 1. SCOLAIRE (Maternelle, Primaire, Collège, Lycée)
// 2. FORMATION_PRO (Centres de formation continue, modules, certifications)
// 3. MIXTE (Cursus scolaire + Formations certifiantes)
// =============================================================================

import { supabase } from '../lib/supabase'

export type EcoleTypeEtablissement = 'SCOLAIRE' | 'FORMATION_PRO' | 'MIXTE'

// ─── 1. GESTION PERSISTANTE DU TYPE D'ÉTABLISSEMENT ──────────────────────────

export async function getEcoleTypeEtablissement(companyId: string): Promise<EcoleTypeEtablissement | null> {
  if (!companyId) return null
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('ecole_type_etablissement')
      .eq('id', companyId)
      .maybeSingle()

    if (error) {
      console.warn('[ecoleService] Erreur lecture ecole_type_etablissement:', error.message)
      const local = localStorage.getItem(`gestio229_ecole_type_${companyId}`)
      return (local === 'SCOLAIRE' || local === 'FORMATION_PRO' || local === 'MIXTE') ? local : null
    }

    const type = (data?.ecole_type_etablissement as EcoleTypeEtablissement) || null
    if (type) {
      localStorage.setItem(`gestio229_ecole_type_${companyId}`, type)
    }
    return type
  } catch (err) {
    console.warn('[ecoleService] Exception getEcoleTypeEtablissement:', err)
    return null
  }
}

export async function setEcoleTypeEtablissement(companyId: string, type: EcoleTypeEtablissement): Promise<boolean> {
  if (!companyId) return false
  try {
    const { error } = await supabase
      .from('companies')
      .update({
        ecole_type_etablissement: type,
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId)

    if (error) {
      console.warn('[ecoleService] Erreur mise à jour type en base:', error.message)
    }

    localStorage.setItem(`gestio229_ecole_type_${companyId}`, type)
    return true
  } catch (err) {
    console.warn('[ecoleService] Exception setEcoleTypeEtablissement:', err)
    localStorage.setItem(`gestio229_ecole_type_${companyId}`, type)
    return true
  }
}

// ─── 2. GÉNÉRATEURS D'IDENTIFIANTS UNIQUES SÉCURISÉS (SPEC SECTION 7) ────────

/**
 * Génère un identifiant unique élève/apprenant :
 * Format : YYYY + Séquence 5 chiffres + 3 lettres aléatoires
 * Ex : 202600125KFA
 */
export function generateSchoolIdentifier(sequenceNumber: number = 1): { matricule: string; identifiantUnique: string } {
  const currentYear = new Date().getFullYear()
  const seqPadded = String(sequenceNumber).padStart(5, '0')
  const matricule = `${currentYear}${seqPadded}`
  
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let randomLetters = ''
  for (let i = 0; i < 3; i++) {
    randomLetters += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  
  const identifiantUnique = `${matricule}${randomLetters}`
  return { matricule, identifiantUnique }
}

/**
 * Génère une référence de reçu officiel (REC-YYYY-XXXXX)
 */
export function generateReceiptNumber(seq: number = 1): string {
  const year = new Date().getFullYear()
  return `REC-${year}-${String(seq).padStart(5, '0')}`
}

/**
 * Génère un numéro de certificat certifiant vérifiable (CERT-YYYY-DOM-XXXXX)
 */
export function generateCertificateNumber(domainCode: string = 'GEN', seq: number = 1): string {
  const year = new Date().getFullYear()
  return `CERT-${year}-${domainCode.toUpperCase().slice(0, 4)}-${String(seq).padStart(4, '0')}`
}

// ─── 3. ANNÉES SCOLAIRES & PÉRIODES ──────────────────────────────────────────

export async function getActiveSchoolYear(companyId: string) {
  if (!companyId) return null
  const { data } = await supabase
    .from('ecole_annees_scolaires')
    .select('*')
    .eq('company_id', companyId)
    .eq('est_active', true)
    .maybeSingle()
  return data
}

export async function getSchoolYears(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_annees_scolaires')
    .select('*')
    .eq('company_id', companyId)
    .order('date_debut', { ascending: false })
  return data || []
}

export async function getPeriods(companyId: string, anneeId?: string) {
  if (!companyId) return []
  let query = supabase.from('ecole_periodes').select('*').eq('company_id', companyId)
  if (anneeId) query = query.eq('annee_id', anneeId)
  const { data } = await query.order('ordre', { ascending: true })
  return data || []
}

// ─── 4. CLASSES, NIVEAUX & SALLES ────────────────────────────────────────────

export async function getClasses(companyId: string, anneeId?: string) {
  if (!companyId) return []
  let query = supabase.from('ecole_classes_groupes').select('*').eq('company_id', companyId)
  if (anneeId) query = query.eq('annee_id', anneeId)
  const { data } = await query.order('nom', { ascending: true })
  return data || []
}

export async function getNiveauxFilieres(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_niveaux_filieres')
    .select('*')
    .eq('company_id', companyId)
    .order('nom', { ascending: true })
  return data || []
}

export async function getSalles(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_salles')
    .select('*')
    .eq('company_id', companyId)
    .order('nom', { ascending: true })
  return data || []
}

// ─── 5. ÉLÈVES & APPRENANTS ──────────────────────────────────────────────────

export async function getElevesApprenants(companyId: string, filters?: { classeId?: string; statut?: string; search?: string }) {
  if (!companyId) return []
  let query = supabase.from('ecole_eleves_apprenants').select('*').eq('company_id', companyId)
  
  if (filters?.classeId && filters.classeId !== 'ALL') {
    query = query.eq('classe_actuelle_id', filters.classeId)
  }
  if (filters?.statut && filters.statut !== 'ALL') {
    query = query.eq('statut', filters.statut)
  }
  if (filters?.search) {
    const s = `%${filters.search}%`
    query = query.or(`nom.ilike.${s},prenom.ilike.${s},matricule.ilike.${s},identifiant_national_unique.ilike.${s}`)
  }
  
  const { data } = await query.order('nom', { ascending: true })
  return data || []
}

export async function createEleveApprenant(companyId: string, payload: any) {
  const { data, error } = await supabase
    .from('ecole_eleves_apprenants')
    .insert([{ ...payload, company_id: companyId }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEleveApprenant(id: string, payload: any) {
  const { data, error } = await supabase
    .from('ecole_eleves_apprenants')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── 6. ENSEIGNANTS & FORMATEURS ─────────────────────────────────────────────

export async function getEnseignants(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_enseignants_formateurs')
    .select('*')
    .eq('company_id', companyId)
    .order('nom', { ascending: true })
  return data || []
}

export async function getMatieres(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_matieres_modules')
    .select('*')
    .eq('company_id', companyId)
    .order('nom', { ascending: true })
  return data || []
}

// ─── 7. EMPLOI DU TEMPS AVEC DÉTECTION DE CONFLITS ───────────────────────────

export async function getEmploiDuTemps(companyId: string, classeId?: string) {
  if (!companyId) return []
  let query = supabase.from('ecole_emplois_du_temps').select('*').eq('company_id', companyId)
  if (classeId) query = query.eq('classe_id', classeId)
  const { data } = await query.order('heure_debut', { ascending: true })
  return data || []
}

export async function checkEmploiDuTempsConflit(companyId: string, slot: {
  jour: string
  heureDebut: string
  heureFin: string
  salleId?: string
  enseignantId?: string
  excludeId?: string
}): Promise<{ hasConflict: boolean; reason?: string }> {
  if (!companyId) return { hasConflict: false }
  
  const { data } = await supabase
    .from('ecole_emplois_du_temps')
    .select('*')
    .eq('company_id', companyId)
    .eq('jour_semaine', slot.jour)
  
  if (!data || data.length === 0) return { hasConflict: false }

  for (const item of data) {
    if (slot.excludeId && item.id === slot.excludeId) continue
    
    // Vérification chevauchement horaire : (slotStart < itemEnd) && (slotEnd > itemStart)
    const overlap = slot.heureDebut < item.heure_fin && slot.heureFin > item.heure_debut
    if (overlap) {
      if (slot.salleId && item.salle_id === slot.salleId) {
        return { hasConflict: true, reason: `Conflit de Salle : la salle est déjà occupée sur ce créneau (${item.heure_debut} - ${item.heure_fin}).` }
      }
      if (slot.enseignantId && item.enseignant_id === slot.enseignantId) {
        return { hasConflict: true, reason: `Conflit d'Enseignant : l'intervenant a déjà un cours programmé sur ce créneau.` }
      }
    }
  }

  return { hasConflict: false }
}

// ─── 8. ÉVALUATIONS, NOTES & BULLETINS ────────────────────────────────────────

export async function getEvaluations(companyId: string, classeId?: string, periodeId?: string) {
  if (!companyId) return []
  let query = supabase.from('ecole_evaluations').select('*').eq('company_id', companyId)
  if (classeId) query = query.eq('classe_id', classeId)
  if (periodeId) query = query.eq('periode_id', periodeId)
  const { data } = await query.order('date_evaluation', { ascending: false })
  return data || []
}

export async function getNotesForEvaluation(companyId: string, evalId: string) {
  if (!companyId || !evalId) return []
  const { data } = await supabase
    .from('ecole_notes')
    .select('*')
    .eq('company_id', companyId)
    .eq('evaluation_id', evalId)
  return data || []
}

export async function saveStudentNote(companyId: string, payload: {
  evaluation_id: string
  eleve_id: string
  note: number
  note_sur?: number
  appreciation?: string
  statut_presence?: string
  saisie_par?: string
}) {
  const { data, error } = await supabase
    .from('ecole_notes')
    .upsert([{
      ...payload,
      company_id: companyId,
      updated_at: new Date().toISOString()
    }], { onConflict: 'evaluation_id,eleve_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getBulletins(companyId: string, classeId?: string, periodeId?: string) {
  if (!companyId) return []
  let query = supabase.from('ecole_bulletins').select('*').eq('company_id', companyId)
  if (classeId) query = query.eq('classe_id', classeId)
  if (periodeId) query = query.eq('periode_id', periodeId)
  const { data } = await query.order('moyenne_generale', { ascending: false })
  return data || []
}

// ─── 9. ASSIDUITÉ & APPEL ────────────────────────────────────────────────────

export async function getAbsencesRetards(companyId: string, filters?: { classeId?: string; date?: string; eleveId?: string }) {
  if (!companyId) return []
  let query = supabase.from('ecole_absences_retards').select('*').eq('company_id', companyId)
  if (filters?.classeId) query = query.eq('classe_id', filters.classeId)
  if (filters?.date) query = query.eq('date_evenement', filters.date)
  if (filters?.eleveId) query = query.eq('eleve_id', filters.eleveId)
  const { data } = await query.order('date_evenement', { ascending: false })
  return data || []
}

export async function enregistrerAppel(companyId: string, appels: Array<{
  eleve_id: string
  classe_id: string
  date_evenement: string
  type: 'ABSENCE' | 'RETARD'
  motif?: string
  est_justifie?: boolean
  creneau?: string
  saisie_par?: string
}>) {
  if (!appels.length) return
  const rows = appels.map(a => ({ ...a, company_id: companyId }))
  const { error } = await supabase.from('ecole_absences_retards').insert(rows)
  if (error) throw error
}

// ─── 10. FINANCES, SCOLARITÉS & ENCAISSEMENTS ─────────────────────────────────

export async function getEcheanciers(companyId: string, filters?: { eleveId?: string; statut?: string }) {
  if (!companyId) return []
  let query = supabase.from('ecole_echeanciers').select('*').eq('company_id', companyId)
  if (filters?.eleveId) query = query.eq('eleve_id', filters.eleveId)
  if (filters?.statut && filters.statut !== 'ALL') query = query.eq('statut', filters.statut)
  const { data } = await query.order('date_echeance', { ascending: true })
  return data || []
}

export async function getPaiementsRecus(companyId: string, filters?: { eleveId?: string; limit?: number }) {
  if (!companyId) return []
  let query = supabase.from('ecole_paiements_recus').select('*').eq('company_id', companyId)
  if (filters?.eleveId) query = query.eq('eleve_id', filters.eleveId)
  const { data } = await query.order('date_paiement', { ascending: false }).limit(filters?.limit || 100)
  return data || []
}

export async function enregistrerPaiement(companyId: string, payload: {
  eleve_id: string
  echeancier_id?: string
  montant: number
  mode_paiement: string
  reference_transaction?: string
  encaisse_par?: string
  observations?: string
}) {
  // 1. Récupérer le nombre de reçus pour incrémenter
  const { count } = await supabase
    .from('ecole_paiements_recus')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const numeroRecu = generateReceiptNumber((count || 0) + 1)

  // 2. Insérer le paiement
  const { data: paiement, error: errPaie } = await supabase
    .from('ecole_paiements_recus')
    .insert([{
      company_id: companyId,
      numero_recu: numeroRecu,
      eleve_id: payload.eleve_id,
      echeancier_id: payload.echeancier_id || null,
      montant: payload.montant,
      mode_paiement: payload.mode_paiement,
      reference_transaction: payload.reference_transaction || null,
      encaisse_par: payload.encaisse_par || 'Admin',
      observations: payload.observations || null,
      date_paiement: new Date().toISOString()
    }])
    .select()
    .single()

  if (errPaie) throw errPaie

  // 3. Mettre à jour l'élève (frais_scolarite_paye)
  const { data: eleve } = await supabase
    .from('ecole_eleves_apprenants')
    .select('frais_scolarite_paye, frais_scolarite_total')
    .eq('id', payload.eleve_id)
    .single()

  if (eleve) {
    const nouveauPaye = Number(eleve.frais_scolarite_paye || 0) + Number(payload.montant)
    await supabase
      .from('ecole_eleves_apprenants')
      .update({ frais_scolarite_paye: nouveauPaye, updated_at: new Date().toISOString() })
      .eq('id', payload.eleve_id)
  }

  // 4. Mettre à jour l'échéancier si lié
  if (payload.echeancier_id) {
    const { data: ech } = await supabase
      .from('ecole_echeanciers')
      .select('*')
      .eq('id', payload.echeancier_id)
      .single()

    if (ech) {
      const nouveauPayeEch = Number(ech.montant_paye || 0) + Number(payload.montant)
      const nouveauSolde = Math.max(0, Number(ech.montant_du) - nouveauPayeEch)
      const nouveauStatut = nouveauSolde === 0 ? 'SOLDE' : 'PARTIEL'
      await supabase
        .from('ecole_echeanciers')
        .update({
          montant_paye: nouveauPayeEch,
          solde_restant: nouveauSolde,
          statut: nouveauStatut,
          updated_at: new Date().toISOString()
        })
        .eq('id', payload.echeancier_id)
    }
  }

  return paiement
}

// ─── 11. CATALOGUE FORMATIONS PRO, SESSIONS & CERTIFICATS ────────────────────

export async function getFormationsCatalogue(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_formations_catalogue')
    .select('*')
    .eq('company_id', companyId)
    .order('titre', { ascending: true })
  return data || []
}

export async function getSessionsFormation(companyId: string, formationId?: string) {
  if (!companyId) return []
  let query = supabase.from('ecole_sessions_formation').select('*').eq('company_id', companyId)
  if (formationId) query = query.eq('formation_id', formationId)
  const { data } = await query.order('date_debut', { ascending: false })
  return data || []
}

export async function getAttestationsCertificats(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_attestations_certificats')
    .select('*')
    .eq('company_id', companyId)
    .order('date_obtention', { ascending: false })
  return data || []
}

export async function emettreCertificat(companyId: string, payload: {
  eleve_apprenant_id: string
  formation_id: string
  session_id?: string
  type_document: string
  mention: string
  valide_par?: string
  observations?: string
}) {
  const { count } = await supabase
    .from('ecole_attestations_certificats')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const numCert = generateCertificateNumber('PRO', (count || 0) + 1)
  const hash = Math.random().toString(36).substring(2, 10).toUpperCase()

  const { data, error } = await supabase
    .from('ecole_attestations_certificats')
    .insert([{
      company_id: companyId,
      numero_certificat: numCert,
      eleve_apprenant_id: payload.eleve_apprenant_id,
      formation_id: payload.formation_id,
      session_id: payload.session_id || null,
      type_document: payload.type_document,
      mention: payload.mention,
      hash_verification: hash,
      valide_par: payload.valide_par || 'Directeur Pédagogique',
      observations: payload.observations || null,
      date_obtention: new Date().toISOString().split('T')[0]
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── 12. BIBLIOTHÈQUE & DÉPÔT DOCUMENTAIRE ───────────────────────────────────

export async function getBibliothequeDocuments(companyId: string, filters?: { typeRessource?: string; workflow?: string }) {
  if (!companyId) return []
  let query = supabase.from('ecole_bibliotheque_documents').select('*').eq('company_id', companyId)
  if (filters?.typeRessource && filters.typeRessource !== 'ALL') query = query.eq('type_ressource', filters.typeRessource)
  if (filters?.workflow && filters.workflow !== 'ALL') query = query.eq('statut_workflow', filters.workflow)
  const { data } = await query.order('titre', { ascending: true })
  return data || []
}

export async function getPretsLivres(companyId: string) {
  if (!companyId) return []
  const { data } = await supabase
    .from('ecole_prets_livres')
    .select('*')
    .eq('company_id', companyId)
    .order('date_pret', { ascending: false })
  return data || []
}
