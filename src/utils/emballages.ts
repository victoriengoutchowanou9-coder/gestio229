// =============================================================================
// GESTIO 229 ERP — Brasserie & Dépôt de Boissons
// SOURCE DE VÉRITÉ UNIQUE : brasserie_emballages_mouvements
// =============================================================================

export interface EmballageMouvement {
  id?: string
  company_id: string
  secteur_id?: string | null
  client_id?: string | null
  client_nom?: string | null
  client_telephone?: string | null
  emballage_code: string
  code?: string
  emballage_type_id?: string | null
  type_mouvement: 'INITIAL' | 'SORTIE' | 'RETOUR' | 'AJUSTEMENT_POSITIF' | 'AJUSTEMENT_NEGATIF' | 'INVENTAIRE' | string
  quantite: number
  vente_id?: string | null
  vente_numero?: string | null
  retour_id?: string | null
  inventaire_id?: string | null
  solde_avant?: number
  solde_apres?: number
  date?: string
  reference?: string | null
  observation?: string | null
  created_by?: string | null
}

/**
 * Vérifie si un code d'emballage est un vrai code de casier (ex: C12T, C20T, C24T, C6T, C10T)
 * et NON un UUID fantôme (ex: a298bafb-25f2-486c-9276-2c366f86311d)
 */
export function isVraiCodeEmballage(code?: string | null): boolean {
  if (!code) return false
  const clean = code.trim().toUpperCase()
  if (clean.includes('-') && clean.length > 10) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false
  return /^C\d+T$/i.test(clean) || ['C12T', 'C20T', 'C24T', 'C6T', 'C10T', 'C30T'].includes(clean)
}

/**
 * Calcule le solde dû réel d'un client pour un code d'emballage donné (ex: 'C12T')
 * Règle : SUM(INITIAL, SORTIE, AJUSTEMENT_POSITIF, INVENTAIRE) - SUM(RETOUR, AJUSTEMENT_NEGATIF)
 */
export async function getSoldeClient(
  supabase: any,
  companyId: string,
  secteurId: string | null | undefined,
  clientId: string,
  codeEmballage: string
): Promise<number> {
  if (!companyId || !clientId || !codeEmballage || !isVraiCodeEmballage(codeEmballage)) return 0
  const targetCode = codeEmballage.trim().toUpperCase()

  const { data, error } = await supabase
    .from('brasserie_emballages_mouvements')
    .select('type_mouvement, quantite, emballage_code, code')
    .eq('company_id', companyId)
    .eq('client_id', clientId)

  if (error || !data) return 0

  let solde = 0
  data.forEach((m: any) => {
    const c = (m.emballage_code || m.code || '').trim().toUpperCase()
    if (c === targetCode) {
      const q = Number(m.quantite) || 0
      const type = (m.type_mouvement || '').toUpperCase()
      if (['RETOUR', 'AJUSTEMENT_NEGATIF', 'RETOUR_CLIENT', 'RETOUR_IMMEDIAT', 'AVOIR_RETOUR'].includes(type)) {
        solde -= q
      } else {
        solde += q // INITIAL, SORTIE, SORTIE_VENTE, AJUSTEMENT_POSITIF, INVENTAIRE
      }
    }
  })

  return Math.max(0, solde)
}

/**
 * Calcule les soldes de tous les emballages pour un client donné
 * Ex: { C12T: 14, C20T: 6, C24T: 3 }
 */
export async function getSoldesClientTous(
  supabase: any,
  companyId: string,
  secteurId: string | null | undefined,
  clientId: string
): Promise<Record<string, number>> {
  const map: Record<string, number> = { C12T: 0, C20T: 0, C24T: 0 }
  if (!companyId || !clientId) return map

  const { data, error } = await supabase
    .from('brasserie_emballages_mouvements')
    .select('type_mouvement, quantite, emballage_code, code')
    .eq('company_id', companyId)
    .eq('client_id', clientId)

  if (error || !data) return map

  data.forEach((m: any) => {
    const c = (m.emballage_code || m.code || '').trim().toUpperCase()
    if (!c || !isVraiCodeEmballage(c)) return
    const q = Number(m.quantite) || 0
    const type = (m.type_mouvement || '').toUpperCase()
    if (['RETOUR', 'AJUSTEMENT_NEGATIF', 'RETOUR_CLIENT', 'RETOUR_IMMEDIAT', 'AVOIR_RETOUR'].includes(type)) {
      map[c] = (map[c] || 0) - q
    } else {
      map[c] = (map[c] || 0) + q
    }
  })

  Object.keys(map).forEach(k => {
    if (map[k] < 0) map[k] = 0
  })

  return map
}

/**
 * Enregistre un retour d'emballage dans la source unique brasserie_emballages_mouvements
 * et incrémente le stock dépôt de l'emballage type
 */
export async function enregistrerRetourEmballage(
  supabase: any,
  params: {
    companyId: string
    secteurId?: string | null
    clientId: string
    clientNom: string
    clientTelephone?: string
    emballageCode: string
    emballageTypeId?: string | null
    quantite: number
    soldeAvant: number
    soldeApres: number
    date?: string
    reference?: string
    observation?: string
    createdBy?: string
  }
) {
  const {
    companyId, secteurId, clientId, clientNom, clientTelephone,
    emballageCode, emballageTypeId, quantite, soldeAvant, soldeApres,
    date, reference, observation, createdBy
  } = params

  const upperCode = emballageCode.trim().toUpperCase()
  if (!isVraiCodeEmballage(upperCode)) {
    throw new Error(`Code emballage invalide (${upperCode}). Seuls les codes réels (C12T, C20T, C24T...) sont autorisés.`)
  }
  const nowIso = date ? new Date(date).toISOString() : new Date().toISOString()
  const ref = reference || `RET-${Date.now().toString(36).toUpperCase()}`

  // 1. Insertion du mouvement RETOUR avec fallback robuste
  const fullPayload: any = {
    company_id: companyId,
    secteur_id: secteurId || null,
    client_id: clientId,
    client_nom: clientNom,
    emballage_code: upperCode,
    code: upperCode,
    emballage_type_id: emballageTypeId || null,
    type_mouvement: 'RETOUR',
    quantite: quantite,
    solde_avant: soldeAvant,
    solde_apres: soldeApres,
    date: nowIso,
    observation: observation || `Retour ${quantite} ${upperCode} - ${ref}`,
  }

  // Tenter l'insertion avec sélection
  let res = await supabase
    .from('brasserie_emballages_mouvements')
    .insert(fullPayload)
    .select()

  // Si échec sur une colonne ou select, fallback sur les colonnes minimales certifiées
  if (res.error) {
    console.warn('[enregistrerRetourEmballage] Première tentative échouée, essai avec payload simplifié:', res.error)
    const simplePayload = {
      company_id: companyId,
      client_id: clientId,
      client_nom: clientNom,
      code: upperCode,
      emballage_code: upperCode,
      type_mouvement: 'RETOUR',
      quantite: quantite,
      date: nowIso,
      solde_avant: soldeAvant,
      solde_apres: soldeApres,
      observation: observation || `Retour ${quantite} ${upperCode}`
    }
    res = await supabase
      .from('brasserie_emballages_mouvements')
      .insert(simplePayload)
      .select()
  }

  if (res.error) {
    console.error('[enregistrerRetourEmballage] Erreur insert finale:', res.error)
    throw new Error(res.error.message || `Erreur d'insertion du retour (${res.error.code || 'Inconnu'})`)
  }

  const insertedData = res.data && res.data.length > 0 ? res.data[0] : null

  // 2. Incrémenter le stock au dépôt dans brasserie_emballages_types
  try {
    const { data: typeRow } = await supabase
      .from('brasserie_emballages_types')
      .select('id, stock_depot')
      .eq('company_id', companyId)
      .eq('code', upperCode)
      .maybeSingle()

    if (typeRow) {
      const curStock = Number(typeRow.stock_depot) || 0
      await supabase
        .from('brasserie_emballages_types')
        .update({ stock_depot: curStock + quantite, updated_at: new Date().toISOString() })
        .eq('id', typeRow.id)
    }

    // Egalement brasserie_emballages
    const { data: embRow } = await supabase
      .from('brasserie_emballages')
      .select('id, stock_depot')
      .eq('company_id', companyId)
      .eq('code', upperCode)
      .maybeSingle()

    if (embRow) {
      const curStock = Number(embRow.stock_depot) || 0
      await supabase
        .from('brasserie_emballages')
        .update({ stock_depot: curStock + quantite, updated_at: new Date().toISOString() })
        .eq('id', embRow.id)
    }
  } catch (err) {
    console.warn('[enregistrerRetourEmballage] Mise à jour stock dépôt:', err)
  }

  return { movement: insertedData, reference: ref }
}
