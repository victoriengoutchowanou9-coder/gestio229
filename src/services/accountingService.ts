// =============================================================================
// GESTIO 229 SaaS — Service Comptable SYSCOHADA Révisé 2018 (Bénin & Espace OHADA)
// RÈGLE ABSOLUE : OPÉRATION COMMERCIALE ≠ RÈGLEMENT
// Une facture génère un engagement (JV / JA).
// Le paiement génère un règlement dans le journal de trésorerie approprié (JC / JB).
// Compte AIB officiel : 449200 (État, AIB retenu à la source / collecté)
// Isolation stricte : (company_id + sector_slug)
// =============================================================================

import { supabase } from '../lib/supabase'

export type JournalCode = 'JV' | 'JA' | 'JC' | 'JB' | 'JOD' | 'JS' | 'JR'

export interface SyscohadaAccountDef {
  code: string
  label: string
  classId: number
  type: 'ACTIF' | 'PASSIF' | 'CHARGE' | 'PRODUIT' | 'TRESORERIE'
}

export interface AccountingEntryLine {
  id?: string
  entry_id?: string
  company_id: string
  sector_slug: string
  line_number: number
  account_number: string
  account_label: string
  description?: string
  debit: number
  credit: number
  third_party_id?: string | null
  third_party_name?: string | null
  lettering?: string | null
  tax_code?: string | null
  tax_rate?: number
  tax_amount?: number
  aib_rate?: number
  aib_amount?: number
}

export interface AccountingEntry {
  id: string
  company_id: string
  sector_slug: string
  journal_code: JournalCode
  entry_number: string
  entry_date: string
  accounting_period: string
  reference?: string
  document_type?: string
  document_id?: string
  description: string
  source_module?: string
  source_id?: string
  status: 'brouillon' | 'valide' | 'annule' | 'extourne' | 'cloture'
  total_debit: number
  total_credit: number
  created_by?: string | null
  created_at?: string
  validated_at?: string
  lines: AccountingEntryLine[]
}

export interface GrandLivreEntry {
  id: string
  date: string
  journal: JournalCode
  piece_ref: string
  entry_number: string
  libelle: string
  debit: number
  credit: number
  solde_progressif: number
  lettering?: string | null
}

export interface TrialBalanceRow {
  account_number: string
  account_label: string
  class_id: number
  debit_initial: number
  credit_initial: number
  mvt_debit: number
  mvt_credit: number
  solde_debiteur: number
  solde_crediteur: number
}

export interface AibReportRow {
  id: string
  date: string
  journal: JournalCode
  piece_ref: string
  tier_nom: string
  tier_ifu?: string
  base_ht: number
  taux_aib: number
  montant_aib: number
  montant_regle: number
  sens: 'COLLECTE' | 'RETENU'
}

// ─── PLAN COMPTABLE GÉNÉRAL SYSCOHADA RÉVISÉ 2018 (RÉFÉRENTIEL COMPLET) ──────
export const SYSCOHADA_PLAN_2018: SyscohadaAccountDef[] = [
  // CLASSE 1 : COMPTES DE RESSOURCES DURABLES
  { code: '101000', label: 'Capital social / Dotations', classId: 1, type: 'PASSIF' },
  { code: '102000', label: 'Capital par dotation', classId: 1, type: 'PASSIF' },
  { code: '103000', label: 'Capital personnel (Entreprise individuelle)', classId: 1, type: 'PASSIF' },
  { code: '111000', label: 'Réserve légale', classId: 1, type: 'PASSIF' },
  { code: '112000', label: 'Réserves statutaires ou contractuelles', classId: 1, type: 'PASSIF' },
  { code: '118000', label: 'Autres réserves', classId: 1, type: 'PASSIF' },
  { code: '121000', label: 'Report à nouveau créditeur (Bénéfice reporté)', classId: 1, type: 'PASSIF' },
  { code: '129000', label: 'Report à nouveau débiteur (Perte reportée)', classId: 1, type: 'PASSIF' },
  { code: '131000', label: 'Résultat net de l\'exercice (Bénéfice)', classId: 1, type: 'PASSIF' },
  { code: '139000', label: 'Résultat net de l\'exercice (Déficit)', classId: 1, type: 'PASSIF' },
  { code: '162000', label: 'Emprunts et dettes auprès des banques', classId: 1, type: 'PASSIF' },
  { code: '166000', label: 'Dépôts et cautionnements reçus', classId: 1, type: 'PASSIF' },

  // CLASSE 2 : COMPTES D'ACTIF IMMOBILISÉ
  { code: '211000', label: 'Terrains nus et bâtis', classId: 2, type: 'ACTIF' },
  { code: '213000', label: 'Bâtiments commerciaux et industriels', classId: 2, type: 'ACTIF' },
  { code: '215000', label: 'Installations techniques et agencements', classId: 2, type: 'ACTIF' },
  { code: '218100', label: 'Mobilier et matériel de bureau', classId: 2, type: 'ACTIF' },
  { code: '218200', label: 'Matériel de transport', classId: 2, type: 'ACTIF' },
  { code: '218300', label: 'Matériel informatique et caisse tactile', classId: 2, type: 'ACTIF' },
  { code: '241000', label: 'Matériel et outillage industriel', classId: 2, type: 'ACTIF' },
  { code: '275000', label: 'Dépôts et cautionnements versés', classId: 2, type: 'ACTIF' },
  { code: '281300', label: 'Amortissements des bâtiments', classId: 2, type: 'ACTIF' },
  { code: '281810', label: 'Amortissements du mobilier et matériel bureau', classId: 2, type: 'ACTIF' },
  { code: '281820', label: 'Amortissements du matériel de transport', classId: 2, type: 'ACTIF' },
  { code: '281830', label: 'Amortissements du matériel informatique', classId: 2, type: 'ACTIF' },

  // CLASSE 3 : COMPTES DE STOCKS
  { code: '311000', label: 'Marchandises en magasin (Stocks)', classId: 3, type: 'ACTIF' },
  { code: '321000', label: 'Matières premières et fournitures', classId: 3, type: 'ACTIF' },
  { code: '335000', label: 'Emballages consignés et casiers en stock', classId: 3, type: 'ACTIF' },
  { code: '371000', label: 'Stocks de produits finis', classId: 3, type: 'ACTIF' },
  { code: '391000', label: 'Dépréciations des stocks de marchandises', classId: 3, type: 'ACTIF' },

  // CLASSE 4 : COMPTES DE TIERS
  { code: '401100', label: 'Fournisseurs d\'exploitation', classId: 4, type: 'PASSIF' },
  { code: '401200', label: 'Fournisseurs, factures non parvenues', classId: 4, type: 'PASSIF' },
  { code: '409100', label: 'Fournisseurs, avances et acomptes versés', classId: 4, type: 'ACTIF' },
  { code: '409400', label: 'Fournisseurs, créances pour emballages à rendre', classId: 4, type: 'ACTIF' },
  { code: '411100', label: 'Clients ordinaires - Ventes locales', classId: 4, type: 'ACTIF' },
  { code: '411200', label: 'Clients à terme / Comptes de crédit', classId: 4, type: 'ACTIF' },
  { code: '416000', label: 'Clients douteux ou litigieux', classId: 4, type: 'ACTIF' },
  { code: '419100', label: 'Clients, avances et acomptes reçus', classId: 4, type: 'PASSIF' },
  { code: '419400', label: 'Clients, dettes pour emballages et casiers consignés', classId: 4, type: 'PASSIF' },
  { code: '422000', label: 'Personnel, rémunérations directes dues', classId: 4, type: 'PASSIF' },
  { code: '428100', label: 'Personnel, dettes provisionnées pour congés', classId: 4, type: 'PASSIF' },
  { code: '431000', label: 'Sécurité Sociale (CNSS Bénin)', classId: 4, type: 'PASSIF' },
  { code: '441000', label: 'État, impôt sur les bénéfices (IS / IBS)', classId: 4, type: 'PASSIF' },
  { code: '442100', label: 'État, impôts retenus à la source (IPTS / VPS)', classId: 4, type: 'PASSIF' },
  { code: '443100', label: 'État, TVA facturée sur ventes (18%)', classId: 4, type: 'PASSIF' },
  { code: '444100', label: 'État, TVA due / à reverser au Trésor', classId: 4, type: 'PASSIF' },
  { code: '445100', label: 'État, TVA récupérable sur achats de marchandises', classId: 4, type: 'ACTIF' },
  { code: '445200', label: 'État, TVA récupérable sur immobilisations', classId: 4, type: 'ACTIF' },
  { code: '445400', label: 'État, TVA récupérable sur services et charges', classId: 4, type: 'ACTIF' },
  { code: '449200', label: 'État, AIB retenu à la source / collecté', classId: 4, type: 'PASSIF' },
  { code: '462000', label: 'Associés, comptes courants créditeurs', classId: 4, type: 'PASSIF' },
  { code: '471000', label: 'Comptes d\'attente et régularisations', classId: 4, type: 'PASSIF' },

  // CLASSE 5 : COMPTES DE TRÉSORERIE
  { code: '521100', label: 'Banques locales en FCFA', classId: 5, type: 'TRESORERIE' },
  { code: '521200', label: 'Banques devises étrangères', classId: 5, type: 'TRESORERIE' },
  { code: '571100', label: 'Caisse centrale espèces', classId: 5, type: 'TRESORERIE' },
  { code: '571200', label: 'Caisses secondaires / Caisses caissières', classId: 5, type: 'TRESORERIE' },
  { code: '572100', label: 'Comptes Mobile Money (MTN / Moov / Wave)', classId: 5, type: 'TRESORERIE' },
  { code: '585000', label: 'Virements internes de fonds (Caisse <-> Banque)', classId: 5, type: 'TRESORERIE' },

  // CLASSE 6 : COMPTES DE CHARGES
  { code: '601100', label: 'Achats de marchandises', classId: 6, type: 'CHARGE' },
  { code: '602100', label: 'Achats de matières premières', classId: 6, type: 'CHARGE' },
  { code: '603100', label: 'Variations des stocks de marchandises', classId: 6, type: 'CHARGE' },
  { code: '605100', label: 'Fournitures de bureau et consommables', classId: 6, type: 'CHARGE' },
  { code: '605200', label: 'Consommations Électricité (SBEE) & Eau (SONEB)', classId: 6, type: 'CHARGE' },
  { code: '605300', label: 'Carburants et lubrifiants d\'exploitation', classId: 6, type: 'CHARGE' },
  { code: '613100', label: 'Locations immobilières et loyers commerciaux', classId: 6, type: 'CHARGE' },
  { code: '616100', label: 'Primes d\'assurances multirisques', classId: 6, type: 'CHARGE' },
  { code: '618100', label: 'Frais de télécommunications & Connexion Internet', classId: 6, type: 'CHARGE' },
  { code: '622100', label: 'Rémunérations d\'intermédiaires et honoraires', classId: 6, type: 'CHARGE' },
  { code: '624100', label: 'Transports de biens et frais de livraison', classId: 6, type: 'CHARGE' },
  { code: '627100', label: 'Frais bancaires, tenue de compte et commissions', classId: 6, type: 'CHARGE' },
  { code: '631100', label: 'Impôts et taxes directs (Taxe foncière, etc.)', classId: 6, type: 'CHARGE' },
  { code: '641100', label: 'Rémunérations directes du personnel (Salaires)', classId: 6, type: 'CHARGE' },
  { code: '641300', label: 'Primes et gratifications du personnel', classId: 6, type: 'CHARGE' },
  { code: '646100', label: 'Charges sociales patronales CNSS & VPS', classId: 6, type: 'CHARGE' },
  { code: '658100', label: 'Charges diverses d\'exploitation', classId: 6, type: 'CHARGE' },
  { code: '681100', label: 'Dotations aux amortissements d\'exploitation', classId: 6, type: 'CHARGE' },

  // CLASSE 7 : COMPTES DE PRODUITS
  { code: '701100', label: 'Ventes de marchandises au comptoir', classId: 7, type: 'PRODUIT' },
  { code: '701200', label: 'Ventes de marchandises à crédit / demi-gros', classId: 7, type: 'PRODUIT' },
  { code: '702100', label: 'Ventes de produits finis', classId: 7, type: 'PRODUIT' },
  { code: '706100', label: 'Prestations de services et travaux', classId: 7, type: 'PRODUIT' },
  { code: '707100', label: 'Commissions et courtages reçus', classId: 7, type: 'PRODUIT' },
  { code: '713100', label: 'Variations des stocks de produits finis', classId: 7, type: 'PRODUIT' },
  { code: '758100', label: 'Produits divers d\'exploitation', classId: 7, type: 'PRODUIT' },
  { code: '771000', label: 'Intérêts bancaires et produits financiers', classId: 7, type: 'PRODUIT' },
  { code: '781100', label: 'Reprises sur amortissements et dépréciations', classId: 7, type: 'PRODUIT' },

  // CLASSE 8 : COMPTES DES AUTRES CHARGES ET PRODUITS (HAO)
  { code: '811000', label: 'Valeurs comptables des cessions d\'immobilisations', classId: 8, type: 'CHARGE' },
  { code: '821000', label: 'Produits des cessions d\'immobilisations', classId: 8, type: 'PRODUIT' },
  { code: '831000', label: 'Charges hors activités ordinaires (HAO)', classId: 8, type: 'CHARGE' },
  { code: '841000', label: 'Produits hors activités ordinaires (HAO)', classId: 8, type: 'PRODUIT' },
]

export const JOURNAUX_CATALOG: { code: JournalCode; name: string; defaultAccount: string }[] = [
  { code: 'JV', name: 'Journal des Ventes', defaultAccount: '701100' },
  { code: 'JA', name: 'Journal des Achats', defaultAccount: '601100' },
  { code: 'JC', name: 'Journal de Caisse', defaultAccount: '571100' },
  { code: 'JB', name: 'Journal de Banque', defaultAccount: '521100' },
  { code: 'JOD', name: 'Journal des Opérations Diverses', defaultAccount: '471000' },
  { code: 'JS', name: 'Journal des Salaires & Paie', defaultAccount: '641100' },
  { code: 'JR', name: 'Journal des Règlements Directs', defaultAccount: '571100' },
]

export function getAccountLabel(accountNumber: string): string {
  const match = SYSCOHADA_PLAN_2018.find((a) => a.code === accountNumber)
  if (match) return match.label
  if (accountNumber.startsWith('411')) return 'Compte Client'
  if (accountNumber.startsWith('401')) return 'Compte Fournisseur'
  if (accountNumber.startsWith('701')) return 'Ventes Marchandises'
  if (accountNumber.startsWith('601')) return 'Achats Marchandises'
  if (accountNumber.startsWith('571')) return 'Caisse Espèces'
  if (accountNumber.startsWith('521')) return 'Banque'
  if (accountNumber.startsWith('4492')) return 'État, AIB'
  if (accountNumber.startsWith('443')) return 'TVA facturée'
  if (accountNumber.startsWith('445')) return 'TVA récupérable'
  return `Compte ${accountNumber}`
}

/**
 * Récupère les écritures comptables réelles enregistrées dans Supabase
 */
export async function fetchAccountingEntries(
  companyId: string,
  sectorSlug: string,
  filters?: {
    journal?: JournalCode | 'ALL'
    startDate?: string
    endDate?: string
    search?: string
    account?: string
  }
): Promise<AccountingEntry[]> {
  if (!companyId) return []

  try {
    let query = supabase
      .from('accounting_entries')
      .select('*, lines:accounting_entry_lines(*)')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
      .order('entry_date', { ascending: false })
      .order('entry_number', { ascending: false })

    if (filters?.journal && filters.journal !== 'ALL') {
      query = query.eq('journal_code', filters.journal)
    }
    if (filters?.startDate) {
      query = query.gte('entry_date', filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte('entry_date', filters.endDate)
    }

    const { data, error } = await query
    if (error) {
      console.warn('[AccountingService] fetchAccountingEntries error:', error)
      return []
    }

    let entries: AccountingEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      company_id: row.company_id,
      sector_slug: row.sector_slug,
      journal_code: row.journal_code as JournalCode,
      entry_number: row.entry_number,
      entry_date: row.entry_date,
      accounting_period: row.accounting_period,
      reference: row.reference,
      document_type: row.document_type,
      document_id: row.document_id,
      description: row.description,
      source_module: row.source_module,
      source_id: row.source_id,
      status: row.status || 'valide',
      total_debit: Number(row.total_debit || 0),
      total_credit: Number(row.total_credit || 0),
      created_by: row.created_by,
      created_at: row.created_at,
      validated_at: row.validated_at,
      lines: (row.lines || []).map((l: any) => ({
        id: l.id,
        entry_id: l.entry_id,
        company_id: l.company_id,
        sector_slug: l.sector_slug,
        line_number: Number(l.line_number || 1),
        account_number: l.account_number,
        account_label: l.account_label || getAccountLabel(l.account_number),
        description: l.description,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        third_party_id: l.third_party_id,
        third_party_name: l.third_party_name,
        lettering: l.lettering,
        tax_code: l.tax_code,
        tax_rate: Number(l.tax_rate || 0),
        tax_amount: Number(l.tax_amount || 0),
        aib_rate: Number(l.aib_rate || 0),
        aib_amount: Number(l.aib_amount || 0),
      })),
    }))

    // Filtres en mémoire
    if (filters?.search) {
      const q = filters.search.toLowerCase()
      entries = entries.filter((e) =>
        e.entry_number.toLowerCase().includes(q) ||
        (e.reference || '').toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.lines.some((l) =>
          l.account_number.includes(q) ||
          l.account_label.toLowerCase().includes(q) ||
          (l.third_party_name || '').toLowerCase().includes(q)
        )
      )
    }

    if (filters?.account && filters.account !== 'ALL') {
      entries = entries.filter((e) =>
        e.lines.some((l) => l.account_number.startsWith(filters.account!))
      )
    }

    return entries
  } catch (err) {
    console.warn('[AccountingService] fetchAccountingEntries exception:', err)
    return []
  }
}

/**
 * Enregistre une nouvelle écriture comptable avec contrôle strict Débit == Crédit
 */
export async function createAccountingEntry(
  entryData: {
    company_id: string
    sector_slug: string
    journal_code: JournalCode
    entry_date: string
    reference?: string
    document_type?: string
    document_id?: string
    description: string
    source_module?: string
    source_id?: string
    created_by?: string | null
    status?: 'brouillon' | 'valide'
  },
  lines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[]
): Promise<{ success: boolean; entry?: AccountingEntry; error?: string }> {
  // 1. Contrôles obligatoires
  if (!entryData.company_id) return { success: false, error: 'company_id obligatoire' }
  if (!entryData.sector_slug) return { success: false, error: 'sector_slug obligatoire' }
  if (!lines || lines.length < 2) {
    return { success: false, error: 'Une écriture comptable doit comporter au moins 2 lignes (partie double).' }
  }

  const totalDebit = Math.round(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100
  const totalCredit = Math.round(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100

  // 2. Contrôle de l'équilibre parfait
  if (Math.abs(totalDebit - totalCredit) > 0.05) {
    return {
      success: false,
      error: `Écriture déséquilibrée : le total débit (${totalDebit} FCFA) doit être égal au total crédit (${totalCredit} FCFA).`,
    }
  }

  try {
    const year = new Date(entryData.entry_date).getFullYear() || new Date().getFullYear()
    const period = entryData.entry_date.slice(0, 7)

    // 3. Génération du numéro séquentiel
    const { count } = await supabase
      .from('accounting_entries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', entryData.company_id)
      .eq('journal_code', entryData.journal_code)

    const seq = (count || 0) + 1
    const entryNumber = `${entryData.journal_code}-${year}-${String(seq).padStart(6, '0')}`

    // 4. Insertion de l'en-tête
    const { data: newEntry, error: entryErr } = await supabase
      .from('accounting_entries')
      .insert({
        company_id: entryData.company_id,
        sector_slug: entryData.sector_slug,
        journal_code: entryData.journal_code,
        entry_number: entryNumber,
        entry_date: entryData.entry_date,
        accounting_period: period,
        reference: entryData.reference || null,
        document_type: entryData.document_type || 'od',
        document_id: entryData.document_id || null,
        description: entryData.description.trim(),
        source_module: entryData.source_module || 'manuel',
        source_id: entryData.source_id || null,
        status: entryData.status || 'valide',
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: entryData.created_by || null,
      })
      .select()
      .single()

    if (entryErr || !newEntry) {
      throw entryErr || new Error('Erreur insertion accounting_entries')
    }

    // 5. Insertion des lignes
    const linesPayload = lines.map((l, idx) => ({
      entry_id: newEntry.id,
      company_id: entryData.company_id,
      sector_slug: entryData.sector_slug,
      line_number: idx + 1,
      account_number: l.account_number,
      account_label: l.account_label || getAccountLabel(l.account_number),
      description: l.description || entryData.description,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      third_party_id: l.third_party_id || null,
      third_party_name: l.third_party_name || null,
      lettering: l.lettering || null,
      tax_code: l.tax_code || null,
      tax_rate: Number(l.tax_rate) || 0,
      tax_amount: Number(l.tax_amount) || 0,
      aib_rate: Number(l.aib_rate) || 0,
      aib_amount: Number(l.aib_amount) || 0,
    }))

    const { error: linesErr } = await supabase.from('accounting_entry_lines').insert(linesPayload)
    if (linesErr) {
      console.warn('[AccountingService] Insertion lines error:', linesErr)
    }

    return {
      success: true,
      entry: {
        ...newEntry,
        lines: linesPayload as any,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur inconnue lors de la comptabilisation' }
  }
}

/**
 * MOTEUR D'ENGAGEMENT ET RÈGLEMENT AUTOMATIQUE
 * RÈGLE ABSOLUE : OPÉRATION COMMERCIALE ≠ RÈGLEMENT
 * Synchronise les ventes, achats, dépenses et encaissements dans les journaux correspondants
 * sans créer aucun doublon.
 */
export async function syncOperationalDataToAccounting(
  companyId: string,
  sectorSlug: string,
  userId?: string
): Promise<{ added: number; skipped: number }> {
  if (!companyId || !sectorSlug) return { added: 0, skipped: 0 }

  let addedCount = 0
  let skippedCount = 0

  try {
    // 1. Récupérer les identifiants déjà comptabilisés pour éviter strictement les doublons
    const { data: existingRecords } = await supabase
      .from('accounting_entries')
      .select('source_module, source_id, journal_code')
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)

    const existingKeys = new Set(
      (existingRecords || []).map((r: any) => `${r.source_module}_${r.source_id}_${r.journal_code}`)
    )

    // 2. Traitement des VENTES (sales_orders)
    const { data: sales } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100)

    for (const sale of sales || []) {
      const saleId = sale.id
      const dateStr = sale.order_date || (sale.created_at ? sale.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
      const totalTtc = Number(sale.total_amount) || 0
      if (totalTtc <= 0) continue

      const tva = Math.round((Number(sale.tva_amount) || 0) * 100) / 100
      const aib = Math.round((Number(sale.aib_amount) || 0) * 100) / 100
      const totalHt = Math.round((totalTtc - tva - aib) * 100) / 100
      const clientNom = sale.customer_name || 'Client Comptoir'

      // --- ÉTAPE A : ÉCRITURE D'ENGAGEMENT DE LA FACTURE DANS LE JOURNAL DES VENTES (JV) ---
      const jvKey = `ventes_${saleId}_JV`
      if (!existingKeys.has(jvKey)) {
        const lines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
          // D 411100 - Client TTC
          {
            line_number: 1,
            account_number: '411100',
            account_label: 'Clients ordinaires - Ventes locales',
            description: `Facture vente ${sale.order_number || ''} - ${clientNom}`,
            debit: totalTtc,
            credit: 0,
            third_party_id: sale.customer_id || null,
            third_party_name: clientNom,
          },
          // C 701100 - Vente HT
          {
            line_number: 2,
            account_number: '701100',
            account_label: 'Ventes de marchandises au comptoir',
            description: `Produits des ventes HT ${sale.order_number || ''}`,
            debit: 0,
            credit: totalHt,
          },
        ]

        // C 443100 - TVA Facturée
        if (tva > 0) {
          lines.push({
            line_number: 3,
            account_number: '443100',
            account_label: 'État, TVA facturée sur ventes (18%)',
            description: `TVA facturée s/vente ${sale.order_number || ''}`,
            debit: 0,
            credit: tva,
            tax_code: 'TVA18',
            tax_rate: 18,
            tax_amount: tva,
          })
        }

        // C 449200 - AIB Collecté sur vente
        if (aib > 0) {
          lines.push({
            line_number: 4,
            account_number: '449200',
            account_label: 'État, AIB collecté sur ventes',
            description: `AIB retenu/collecté s/vente ${sale.order_number || ''}`,
            debit: 0,
            credit: aib,
            aib_rate: sale.aib_rate || 1,
            aib_amount: aib,
          })
        }

        const res = await createAccountingEntry(
          {
            company_id: companyId,
            sector_slug: sectorSlug,
            journal_code: 'JV',
            entry_date: dateStr,
            reference: sale.order_number || 'VTE',
            document_type: 'facture_vente',
            document_id: saleId,
            description: `Vente ${sale.order_number || ''} — ${clientNom}`,
            source_module: 'ventes',
            source_id: saleId,
            created_by: userId,
          },
          lines
        )

        if (res.success) {
          addedCount++
          existingKeys.add(jvKey)
        }
      } else {
        skippedCount++
      }

      // --- ÉTAPE B : ÉCRITURE DE RÈGLEMENT DANS LE JOURNAL DE TRÉSORERIE (JC ou JB) ---
      const paid = Number(sale.paid_amount ?? totalTtc) || 0
      const isCredit = sale.payment_method === 'credit' || sale.payment_status === 'credit'

      if (paid > 0 && !isCredit) {
        const isBank = sale.payment_method === 'banque' || sale.payment_method === 'cheque' || sale.payment_method === 'virement'
        const isMomo = sale.payment_method === 'momo' || sale.payment_method === 'wave' || sale.payment_method === 'momo_mtn' || sale.payment_method === 'momo_moov'

        const journalReglement: JournalCode = isBank ? 'JB' : 'JC'
        const tresoAccount = isBank ? '521100' : isMomo ? '572100' : '571100'
        const tresoLabel = isBank ? 'Banques locales en FCFA' : isMomo ? 'Comptes Mobile Money' : 'Caisse centrale espèces'

        const regKey = `ventes_${saleId}_${journalReglement}`
        if (!existingKeys.has(regKey)) {
          const regLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
            // D 571100 ou 521100 - Trésorerie
            {
              line_number: 1,
              account_number: tresoAccount,
              account_label: tresoLabel,
              description: `Règlement ${sale.payment_method || 'espèces'} vente ${sale.order_number || ''}`,
              debit: paid,
              credit: 0,
            },
            // C 411100 - Client
            {
              line_number: 2,
              account_number: '411100',
              account_label: 'Clients ordinaires - Ventes locales',
              description: `Solde règlement client ${clientNom}`,
              debit: 0,
              credit: paid,
              third_party_id: sale.customer_id || null,
              third_party_name: clientNom,
            },
          ]

          const regRes = await createAccountingEntry(
            {
              company_id: companyId,
              sector_slug: sectorSlug,
              journal_code: journalReglement,
              entry_date: dateStr,
              reference: sale.order_number || 'REG',
              document_type: 'recu_caisse',
              document_id: saleId,
              description: `Règlement facture ${sale.order_number || ''} — ${clientNom}`,
              source_module: 'ventes',
              source_id: saleId,
              created_by: userId,
            },
            regLines
          )

          if (regRes.success) {
            addedCount++
            existingKeys.add(regKey)
          }
        }
      }
    }

    // 3. Traitement des ACHATS (purchase_orders)
    const { data: purchases } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const po of purchases || []) {
      const poId = po.id
      const dateStr = po.expected_delivery_date || (po.created_at ? po.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
      const totalTtc = Number(po.total_amount) || 0
      if (totalTtc <= 0) continue

      const tva = Math.round((Number(po.tax_amount) || 0) * 100) / 100
      const aib = Math.round((Number(po.aib_amount) || 0) * 100) / 100
      const totalHt = Math.round((totalTtc - tva) * 100) / 100
      const fournisseurNom = po.supplier_name || 'Fournisseur d\'exploitation'

      // --- ÉTAPE A : ÉCRITURE D'ENGAGEMENT DE LA FACTURE DANS LE JOURNAL DES ACHATS (JA) ---
      const jaKey = `achats_${poId}_JA`
      if (!existingKeys.has(jaKey)) {
        const netFournisseur = totalTtc - aib

        const jaLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
          // D 601100 - Achats Marchandises HT
          {
            line_number: 1,
            account_number: '601100',
            account_label: 'Achats de marchandises',
            description: `Facture achat ${po.order_number || ''} - ${fournisseurNom}`,
            debit: totalHt,
            credit: 0,
          },
        ]

        // D 445100 - TVA Récupérable
        if (tva > 0) {
          jaLines.push({
            line_number: 2,
            account_number: '445100',
            account_label: 'État, TVA récupérable sur achats',
            description: `TVA récupérable s/achat ${po.order_number || ''}`,
            debit: tva,
            credit: 0,
            tax_code: 'TVA18',
            tax_rate: 18,
            tax_amount: tva,
          })
        }

        // C 401100 - Dette Fournisseur Net à payer
        jaLines.push({
          line_number: 3,
          account_number: '401100',
          account_label: 'Fournisseurs d\'exploitation',
          description: `Facture fournisseur ${fournisseurNom}`,
          debit: 0,
          credit: netFournisseur,
          third_party_id: po.supplier_id || null,
          third_party_name: fournisseurNom,
        })

        // C 449200 - AIB Retenu à la source sur achat
        if (aib > 0) {
          jaLines.push({
            line_number: 4,
            account_number: '449200',
            account_label: 'État, AIB retenu à la source / collecté',
            description: `Retenue AIB s/facture fournisseur ${po.order_number || ''}`,
            debit: 0,
            credit: aib,
            aib_rate: po.aib_rate || 1,
            aib_amount: aib,
          })
        }

        const jaRes = await createAccountingEntry(
          {
            company_id: companyId,
            sector_slug: sectorSlug,
            journal_code: 'JA',
            entry_date: dateStr,
            reference: po.order_number || 'ACH',
            document_type: 'facture_achat',
            document_id: poId,
            description: `Achat ${po.order_number || ''} — ${fournisseurNom}`,
            source_module: 'achats',
            source_id: poId,
            created_by: userId,
          },
          jaLines
        )

        if (jaRes.success) {
          addedCount++
          existingKeys.add(jaKey)
        }
      }

      // --- ÉTAPE B : RÈGLEMENT FOURNISSEUR (Si statut payé) ---
      if (po.payment_status === 'PAID' || po.status === 'paid' || po.paid_amount > 0) {
        const montantRegle = Number(po.paid_amount || (totalTtc - aib)) || 0
        const jReg: JournalCode = po.payment_method === 'banque' ? 'JB' : 'JC'
        const accTreso = po.payment_method === 'banque' ? '521100' : '571100'
        const regFournKey = `achats_${poId}_${jReg}`

        if (!existingKeys.has(regFournKey) && montantRegle > 0) {
          const regLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
            // D 401100 - Fournisseur
            {
              line_number: 1,
              account_number: '401100',
              account_label: 'Fournisseurs d\'exploitation',
              description: `Règlement facture ${po.order_number || ''}`,
              debit: montantRegle,
              credit: 0,
              third_party_id: po.supplier_id || null,
              third_party_name: fournisseurNom,
            },
            // C 571100 ou 521100 - Trésorerie
            {
              line_number: 2,
              account_number: accTreso,
              account_label: po.payment_method === 'banque' ? 'Banques locales' : 'Caisse centrale espèces',
              description: `Décaissement règlement fournisseur ${fournisseurNom}`,
              debit: 0,
              credit: montantRegle,
            },
          ]

          const regRes = await createAccountingEntry(
            {
              company_id: companyId,
              sector_slug: sectorSlug,
              journal_code: jReg,
              entry_date: dateStr,
              reference: po.order_number || 'REG-F',
              document_type: 'recu_caisse',
              document_id: poId,
              description: `Règlement fournisseur ${po.order_number || ''} — ${fournisseurNom}`,
              source_module: 'achats',
              source_id: poId,
              created_by: userId,
            },
            regLines
          )

          if (regRes.success) {
            addedCount++
            existingKeys.add(regFournKey)
          }
        }
      }
    }

    // 4. Traitement des DÉPENSES (expenses)
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(60)

    for (const exp of expenses || []) {
      const expId = exp.id
      const dateStr = exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
      const amount = Number(exp.amount) || 0
      if (amount <= 0) continue

      const isBank = exp.payment_method === 'banque' || exp.payment_method === 'cheque'
      const jCode: JournalCode = isBank ? 'JB' : 'JC'
      const tresoAccount = isBank ? '521100' : '571100'

      const expKey = `depenses_${expId}_${jCode}`
      if (!existingKeys.has(expKey)) {
        const cat = (exp.category || '').toLowerCase()
        let chargeAccount = '605100'
        let chargeLabel = 'Fournitures de bureau et consommables'

        if (cat.includes('loyer')) {
          chargeAccount = '613100'
          chargeLabel = 'Locations immobilières et loyers'
        } else if (cat.includes('electricite') || cat.includes('sbee') || cat.includes('eau') || cat.includes('soneb')) {
          chargeAccount = '605200'
          chargeLabel = 'Consommations Électricité (SBEE) & Eau (SONEB)'
        } else if (cat.includes('carburant') || cat.includes('essence') || cat.includes('gasoil')) {
          chargeAccount = '605300'
          chargeLabel = 'Carburants et lubrifiants d\'exploitation'
        } else if (cat.includes('salaire') || cat.includes('paie') || cat.includes('personnel')) {
          chargeAccount = '641100'
          chargeLabel = 'Rémunérations directes du personnel (Salaires)'
        } else if (cat.includes('telecom') || cat.includes('internet') || cat.includes('telephone')) {
          chargeAccount = '618100'
          chargeLabel = 'Télécommunications & Connexion Internet'
        } else if (cat.includes('transport') || cat.includes('livraison')) {
          chargeAccount = '624100'
          chargeLabel = 'Transports de biens et frais de livraison'
        } else if (cat.includes('entretien') || cat.includes('reparation')) {
          chargeAccount = '605100'
          chargeLabel = 'Fournitures et entretiens d\'exploitation'
        }

        const expLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
          // D 6xxxxx - Charge
          {
            line_number: 1,
            account_number: chargeAccount,
            account_label: chargeLabel,
            description: exp.description || `Dépense : ${exp.category || 'Exploitation'}`,
            debit: amount,
            credit: 0,
            third_party_name: exp.beneficiary || null,
          },
          // C 571100 ou 521100 - Trésorerie
          {
            line_number: 2,
            account_number: tresoAccount,
            account_label: isBank ? 'Banques locales en FCFA' : 'Caisse centrale espèces',
            description: `Règlement ${exp.payment_method || 'espèces'} dépense ${exp.expense_number || ''}`,
            debit: 0,
            credit: amount,
          },
        ]

        const expRes = await createAccountingEntry(
          {
            company_id: companyId,
            sector_slug: sectorSlug,
            journal_code: jCode,
            entry_date: dateStr,
            reference: exp.expense_number || exp.reference || 'DEP',
            document_type: isBank ? 'paiement_banque' : 'recu_caisse',
            document_id: expId,
            description: exp.description || `Dépense : ${exp.category || 'Exploitation'}`,
            source_module: 'depenses',
            source_id: expId,
            created_by: userId,
          },
          expLines
        )

        if (expRes.success) {
          addedCount++
          existingKeys.add(expKey)
        }
      }
    }
  } catch (err) {
    console.warn('[AccountingService] Erreur synchronisation flux opérationnels:', err)
  }

  return { added: addedCount, skipped: skippedCount }
}

/**
 * Calcul du Grand Livre d'un compte avec calcul du solde chronologique progressif
 */
export function buildGrandLivreForAccount(
  accountNumber: string,
  entries: AccountingEntry[]
): {
  accountNumber: string
  accountLabel: string
  entries: GrandLivreEntry[]
  totalDebit: number
  totalCredit: number
  soldeFinal: number
} {
  const flattened: {
    date: string
    journal: JournalCode
    piece_ref: string
    entry_number: string
    libelle: string
    debit: number
    credit: number
    lettering?: string | null
  }[] = []

  entries.forEach((e) => {
    e.lines.forEach((l) => {
      if (l.account_number === accountNumber) {
        flattened.push({
          date: e.entry_date,
          journal: e.journal_code,
          piece_ref: e.reference || e.entry_number,
          entry_number: e.entry_number,
          libelle: l.description || e.description,
          debit: l.debit,
          credit: l.credit,
          lettering: l.lettering,
        })
      }
    })
  })

  // Tri chronologique
  flattened.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let solde = 0
  let totDeb = 0
  let totCred = 0

  const glEntries: GrandLivreEntry[] = flattened.map((f, idx) => {
    totDeb += f.debit
    totCred += f.credit
    solde += f.debit - f.credit

    return {
      id: `gl-${accountNumber}-${idx}`,
      date: f.date,
      journal: f.journal,
      piece_ref: f.piece_ref,
      entry_number: f.entry_number,
      libelle: f.libelle,
      debit: f.debit,
      credit: f.credit,
      solde_progressif: solde,
      lettering: f.lettering,
    }
  })

  return {
    accountNumber,
    accountLabel: getAccountLabel(accountNumber),
    entries: glEntries,
    totalDebit: totDeb,
    totalCredit: totCred,
    soldeFinal: solde,
  }
}

/**
 * Génère la Balance Générale des Comptes (Format OHADA 6 Colonnes)
 */
export function buildTrialBalance(entries: AccountingEntry[]): TrialBalanceRow[] {
  const accountsMap: Record<
    string,
    { label: string; classId: number; mvtDebit: number; mvtCredit: number }
  > = {}

  entries.forEach((e) => {
    e.lines.forEach((l) => {
      const acc = l.account_number
      if (!accountsMap[acc]) {
        const classId = parseInt(acc.charAt(0), 10) || 4
        accountsMap[acc] = {
          label: l.account_label || getAccountLabel(acc),
          classId,
          mvtDebit: 0,
          mvtCredit: 0,
        }
      }
      accountsMap[acc].mvtDebit += l.debit
      accountsMap[acc].mvtCredit += l.credit
    })
  })

  const rows: TrialBalanceRow[] = Object.keys(accountsMap)
    .sort()
    .map((acc) => {
      const d = accountsMap[acc]
      const soldeNet = d.mvtDebit - d.mvtCredit

      return {
        account_number: acc,
        account_label: d.label,
        class_id: d.classId,
        debit_initial: 0,
        credit_initial: 0,
        mvt_debit: d.mvtDebit,
        mvt_credit: d.mvtCredit,
        solde_debiteur: soldeNet > 0 ? soldeNet : 0,
        solde_crediteur: soldeNet < 0 ? Math.abs(soldeNet) : 0,
      }
    })

  return rows
}

/**
 * Génère l'État Fiscal Récapitulatif de l'AIB (Compte 449200)
 */
export function buildAibReport(entries: AccountingEntry[]): {
  rows: AibReportRow[]
  totalAibCollecte: number
  totalAibRetenu: number
} {
  const rows: AibReportRow[] = []
  let totalCollecte = 0
  let totalRetenu = 0

  entries.forEach((e) => {
    e.lines.forEach((l) => {
      if (l.account_number === '449200' || l.account_number.startsWith('4492')) {
        const isCollecte = e.journal_code === 'JV' || l.credit > 0
        const mnt = l.credit > 0 ? l.credit : l.debit
        if (mnt <= 0) return

        if (isCollecte) {
          totalCollecte += mnt
        } else {
          totalRetenu += mnt
        }

        rows.push({
          id: l.id || `aib-${e.id}`,
          date: e.entry_date,
          journal: e.journal_code,
          piece_ref: e.reference || e.entry_number,
          tier_nom: l.third_party_name || e.description,
          base_ht: Math.round(mnt / ((l.aib_rate || 1) / 100)),
          taux_aib: l.aib_rate || (isCollecte ? 1 : 5),
          montant_aib: mnt,
          montant_regle: e.total_debit,
          sens: isCollecte ? 'COLLECTE' : 'RETENU',
        })
      }
    })
  })

  return { rows, totalAibCollecte: totalCollecte, totalAibRetenu: totalRetenu }
}

/**
 * Export FEC (Fichier des Écritures Comptables) conforme pour expert-comptable et DGI
 */
export function generateFECFile(entries: AccountingEntry[]): string {
  const headers = [
    'JournalCode',
    'JournalLib',
    'EcritureNum',
    'EcritureDate',
    'CompteNum',
    'CompteLib',
    'CompAuxNum',
    'CompAuxLib',
    'PieceRef',
    'PieceDate',
    'EcritureLib',
    'Debit',
    'Credit',
    'EcritureLet',
    'DateLet',
    'ValidDate',
    'Montantdevise',
    'Idevise',
  ]

  const lines: string[] = [headers.join('\t')]

  entries.forEach((entry) => {
    const dStr = entry.entry_date.replace(/-/g, '')
    const jName = JOURNAUX_CATALOG.find((j) => j.code === entry.journal_code)?.name || entry.journal_code

    entry.lines.forEach((line) => {
      lines.push(
        [
          entry.journal_code,
          `"${jName}"`,
          entry.entry_number,
          dStr,
          line.account_number,
          `"${(line.account_label || '').replace(/"/g, '""')}"`,
          line.third_party_id || '',
          `"${(line.third_party_name || '').replace(/"/g, '""')}"`,
          entry.reference || entry.entry_number,
          dStr,
          `"${(line.description || entry.description).replace(/"/g, '""')}"`,
          line.debit.toFixed(2),
          line.credit.toFixed(2),
          line.lettering || '',
          '',
          dStr,
          '',
          'XOF',
        ].join('\t')
      )
    })
  })

  return lines.join('\r\n')
}
