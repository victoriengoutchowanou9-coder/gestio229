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
  if (!companyId || !clientId || !codeEmballage) return 0
  const targetCode = codeEmballage.toUpperCase()

  const { data, error } = await supabase
    .from('brasserie_emballages_mouvements')
    .select('type_mouvement, quantite, emballage_code, code')
    .eq('company_id', companyId)
    .eq('client_id', clientId)

  if (error || !data) return 0

  let solde = 0
  data.forEach((m: any) => {
    const c = (m.emballage_code || m.code || '').toUpperCase()
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
    const c = (m.emballage_code || m.code || '').toUpperCase()
    if (!c) return
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

  const upperCode = emballageCode.toUpperCase()
  const nowIso = date ? new Date(date).toISOString() : new Date().toISOString()
  const ref = reference || `RET-${Date.now().toString(36).toUpperCase()}`

  // 1. Insertion du mouvement RETOUR
  const { data, error } = await supabase
    .from('brasserie_emballages_mouvements')
    .insert({
      company_id: companyId,
      secteur_id: secteurId || null,
      client_id: clientId,
      client_nom: clientNom,
      client_telephone: clientTelephone || null,
      emballage_code: upperCode,
      code: upperCode,
      emballage_type_id: emballageTypeId || null,
      type_mouvement: 'RETOUR',
      quantite: quantite,
      solde_avant: soldeAvant,
      solde_apres: soldeApres,
      date: nowIso,
      reference: ref,
      observation: observation || `Retour de ${quantite} ${upperCode}`,
      created_by: createdBy || null
    })
    .select()
    .single()

  if (error) {
    console.error('[enregistrerRetourEmballage] Erreur insert:', error)
    throw error
  }

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

  return { movement: data, reference: ref }
}
