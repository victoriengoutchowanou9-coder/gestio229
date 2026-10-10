// =============================================================================
// GESTIO 229 SaaS — Service Officiel EDI DGI Bénin (SYSCOHADA Système Normal)
// Conforme à la norme EDI e-services DGI Bénin & Acte Uniforme OHADA 2018
// Modèle de référence : DGI-Etats-Financiers-SN.xlsm (Version 2.0)
// =============================================================================

import { AccountingEntry, buildTrialBalance, TrialBalanceRow } from './accountingService'

export interface DgiEdiMetadata {
  ifu: string
  exercice: number
  idImpotNature?: string // Défaut : 'LIASSE_NO'
  dateDebutExercice: string // YYYY-MM-DD
  dateFinExercice: string // YYYY-MM-DD
  dateArreteComptes?: string // YYYY-MM-DD
  exercicePrecedentClosLe?: string
  dureeExercicePrecedentMois?: number
  greffe?: string
  rcm?: string
  numCnss?: string
  codeActivite?: string
  email?: string
  ville?: string
  adresseGeo?: string
}

export interface DgiCellItem {
  id: string // code champ: 'montant_1', 'texte_1', etc.
  o: string | number // valeur
}

export interface DgiLineItem {
  l: string // numéro de ligne
  k: DgiCellItem[]
}

export interface DgiTabItem {
  idEdiType: string // Code DGI du tableau ex: 'NO_ACTIF', 'NO_PASSIF', 'NO_RESULTAT', 'NO_TFT', 'NO_FR1A'
  data: {
    line: DgiLineItem[]
  }
}

export interface DgiEdiDocument {
  rContribuable: string
  idImpotNature: string
  idExercice: number
  tabs: DgiTabItem[]
}

export interface FinancialStatementRow {
  code: string
  label: string
  note?: string
  brutN: number
  amortN: number
  netN: number
  netNMinus1: number
}

export interface PassifStatementRow {
  code: string
  label: string
  note?: string
  netN: number
  netNMinus1: number
}

export interface ResultatStatementRow {
  code: string
  label: string
  sign?: string
  note?: string
  netN: number
  netNMinus1: number
}

export interface ControlAnomaly {
  code: string
  severity: 'ERROR' | 'WARNING'
  title: string
  description: string
  difference?: number
}

/**
 * Mappeur SYSCOHADA -> Rubriques Officielles DGI Bilan & Résultat
 */
export function calculateDgiFinancialStatements(
  trialBalance: TrialBalanceRow[],
  comparativeBalance?: TrialBalanceRow[]
): {
  actif: FinancialStatementRow[]
  passif: PassifStatementRow[]
  resultat: ResultatStatementRow[]
  totals: {
    totalActifNet: number
    totalPassifNet: number
    ecartBilan: number
    resultatNet: number
  }
  anomalies: ControlAnomaly[]
} {
  const getSoldeDeb = (prefix: string | string[], tb = trialBalance) => {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix]
    return tb
      .filter((r) => prefixes.some((p) => r.account_number.startsWith(p)))
      .reduce((sum, r) => sum + r.solde_debiteur, 0)
  }

  const getSoldeCred = (prefix: string | string[], tb = trialBalance) => {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix]
    return tb
      .filter((r) => prefixes.some((p) => r.account_number.startsWith(p)))
      .reduce((sum, r) => sum + r.solde_crediteur, 0)
  }

  const getNetCompte = (prefix: string | string[], tb = trialBalance) => {
    const deb = getSoldeDeb(prefix, tb)
    const cred = getSoldeCred(prefix, tb)
    return deb - cred
  }

  const prev = comparativeBalance || []

  // ─── 1. ACTIF SYSCOHADA (NO_ACTIF) ──────────────────────────────────────────
  // Immobilisations incorporelles (21, amort 281)
  const brutImmobIncorp = getSoldeDeb(['21'])
  const amortImmobIncorp = getSoldeCred(['281', '291'])
  const prevNetImmobIncorp = getNetCompte(['21'], prev) - getSoldeCred(['281', '291'], prev)

  // Immobilisations corporelles (22, 23, 24, amort 282, 283, 284)
  const brutTerrains = getSoldeDeb(['22'])
  const amortTerrains = getSoldeCred(['282', '292'])
  const prevNetTerrains = getNetCompte(['22'], prev) - getSoldeCred(['282', '292'], prev)

  const brutBatiments = getSoldeDeb(['23'])
  const amortBatiments = getSoldeCred(['283', '293'])
  const prevNetBatiments = getNetCompte(['23'], prev) - getSoldeCred(['283', '293'], prev)

  const brutMateriel = getSoldeDeb(['241', '242', '243', '244'])
  const amortMateriel = getSoldeCred(['2841', '2842', '2843', '2844', '294'])
  const prevNetMateriel = getNetCompte(['241', '242', '243', '244'], prev) - getSoldeCred(['2841', '2842', '2843', '2844', '294'], prev)

  const brutTransport = getSoldeDeb(['245'])
  const amortTransport = getSoldeCred(['2845'])
  const prevNetTransport = getNetCompte(['245'], prev) - getSoldeCred(['2845'], prev)

  const brutImmobFin = getSoldeDeb(['26', '27'])
  const amortImmobFin = getSoldeCred(['296', '297'])
  const prevNetImmobFin = getNetCompte(['26', '27'], prev) - getSoldeCred(['296', '297'], prev)

  // Total Actif Immobilisé (AZ)
  const brutActifImmo = brutImmobIncorp + brutTerrains + brutBatiments + brutMateriel + brutTransport + brutImmobFin
  const amortActifImmo = amortImmobIncorp + amortTerrains + amortBatiments + amortMateriel + amortTransport + amortImmobFin
  const netActifImmo = brutActifImmo - amortActifImmo
  const prevNetActifImmo = prevNetImmobIncorp + prevNetTerrains + prevNetBatiments + prevNetMateriel + prevNetTransport + prevNetImmobFin

  // Actif Circulant : Stocks (31, 32, 33, 34, 35, 36, 37, 38)
  const brutStocks = getSoldeDeb(['31', '32', '33', '34', '35', '36', '37', '38'])
  const amortStocks = getSoldeCred(['39'])
  const netStocks = brutStocks - amortStocks
  const prevNetStocks = getNetCompte(['31', '32', '33', '34', '35', '36', '37', '38'], prev) - getSoldeCred(['39'], prev)

  // Créances d'exploitation (411, 412, etc.)
  const brutCreances = getSoldeDeb(['41', '42', '43', '44', '45', '46', '47'])
  const amortCreances = getSoldeCred(['49'])
  const netCreances = brutCreances - amortCreances
  const prevNetCreances = getNetCompte(['41', '42', '43', '44', '45', '46', '47'], prev) - getSoldeCred(['49'], prev)

  // Trésorerie Actif (52, 53, 57)
  const brutTresorerie = getSoldeDeb(['52', '53', '57'])
  const amortTresorerie = getSoldeCred(['59'])
  const netTresorerie = brutTresorerie - amortTresorerie
  const prevNetTresorerie = getNetCompte(['52', '53', '57'], prev) - getSoldeCred(['59'], prev)

  // TOTAL GÉNÉRAL ACTIF (BK)
  const totalActifBrut = brutActifImmo + brutStocks + brutCreances + brutTresorerie
  const totalActifAmort = amortActifImmo + amortStocks + amortCreances + amortTresorerie
  const totalActifNet = totalActifBrut - totalActifAmort
  const prevTotalActifNet = prevNetActifImmo + prevNetStocks + prevNetCreances + prevNetTresorerie

  const actifRows: FinancialStatementRow[] = [
    { code: 'NO_ACTIF_AD', label: 'IMMOBILISATIONS INCORPORELLES', note: '3', brutN: brutImmobIncorp, amortN: amortImmobIncorp, netN: brutImmobIncorp - amortImmobIncorp, netNMinus1: Math.max(0, prevNetImmobIncorp) },
    { code: 'NO_ACTIF_AJ', label: 'Terrains', note: '3', brutN: brutTerrains, amortN: amortTerrains, netN: brutTerrains - amortTerrains, netNMinus1: Math.max(0, prevNetTerrains) },
    { code: 'NO_ACTIF_AK', label: 'Bâtiments', note: '3', brutN: brutBatiments, amortN: amortBatiments, netN: brutBatiments - amortBatiments, netNMinus1: Math.max(0, prevNetBatiments) },
    { code: 'NO_ACTIF_AM', label: 'Matériel, mobilier et actifs biologiques', note: '3', brutN: brutMateriel, amortN: amortMateriel, netN: brutMateriel - amortMateriel, netNMinus1: Math.max(0, prevNetMateriel) },
    { code: 'NO_ACTIF_AN', label: 'Matériel de transport', note: '3', brutN: brutTransport, amortN: amortTransport, netN: brutTransport - amortTransport, netNMinus1: Math.max(0, prevNetTransport) },
    { code: 'NO_ACTIF_AQ', label: 'IMMOBILISATIONS FINANCIERES', note: '4', brutN: brutImmobFin, amortN: amortImmobFin, netN: brutImmobFin - amortImmobFin, netNMinus1: Math.max(0, prevNetImmobFin) },
    { code: 'NO_ACTIF_AZ', label: 'TOTAL ACTIF IMMOBILISE', note: '', brutN: brutActifImmo, amortN: amortActifImmo, netN: netActifImmo, netNMinus1: Math.max(0, prevNetActifImmo) },
    { code: 'NO_ACTIF_BB', label: 'STOCKS ET EN-COURS', note: '6', brutN: brutStocks, amortN: amortStocks, netN: netStocks, netNMinus1: Math.max(0, prevNetStocks) },
    { code: 'NO_ACTIF_BG', label: 'CREANCES ET EMPLOIS ASSIMILES', note: '7', brutN: brutCreances, amortN: amortCreances, netN: netCreances, netNMinus1: Math.max(0, prevNetCreances) },
    { code: 'NO_ACTIF_BQ', label: 'TRESORERIE ACTIF', note: '11', brutN: brutTresorerie, amortN: amortTresorerie, netN: netTresorerie, netNMinus1: Math.max(0, prevNetTresorerie) },
    { code: 'NO_ACTIF_BK', label: 'TOTAL GENERAL ACTIF', note: '', brutN: totalActifBrut, amortN: totalActifAmort, netN: totalActifNet, netNMinus1: Math.max(0, prevTotalActifNet) },
  ]

  // ─── 2. COMPTE DE RÉSULTAT (NO_RESULTAT) ───────────────────────────────────
  // Produits d'exploitation
  const ventesMarchandises = getSoldeCred(['701'])
  const prevVentesMarchandises = getSoldeCred(['701'], prev)

  const achatsMarchandises = getSoldeDeb(['601'])
  const prevAchatsMarchandises = getSoldeDeb(['601'], prev)

  const varStocksMarch = getSoldeDeb(['6031']) - getSoldeCred(['6031'])
  const prevVarStocksMarch = getSoldeDeb(['6031'], prev) - getSoldeCred(['6031'], prev)

  const margeCommerciale = ventesMarchandises - (achatsMarchandises + varStocksMarch)
  const prevMargeCommerciale = prevVentesMarchandises - (prevAchatsMarchandises + prevVarStocksMarch)

  const ventesProduits = getSoldeCred(['702', '703', '704'])
  const travauxServices = getSoldeCred(['705', '706'])
  const produitsAccessoires = getSoldeCred(['707'])

  const chiffreAffaires = ventesMarchandises + ventesProduits + travauxServices + produitsAccessoires
  const prevChiffreAffaires = prevVentesMarchandises + getSoldeCred(['702', '703', '704', '705', '706', '707'], prev)

  const autresAchats = getSoldeDeb(['604', '605', '608'])
  const transports = getSoldeDeb(['61'])
  const servicesExterieurs = getSoldeDeb(['62', '63'])
  const impotsTaxes = getSoldeDeb(['64'])
  const chargesPersonnel = getSoldeDeb(['66'])
  const dotationsAmort = getSoldeDeb(['681'])

  const totalChargesExploitation = achatsMarchandises + varStocksMarch + autresAchats + transports + servicesExterieurs + impotsTaxes + chargesPersonnel + dotationsAmort
  const totalProduitsExploitation = chiffreAffaires + getSoldeCred(['71', '72', '73', '75'])

  const resultatExploitation = totalProduitsExploitation - totalChargesExploitation
  const prevResultatExploitation = 0

  const produitsFinanciers = getSoldeCred(['77'])
  const chargesFinancieres = getSoldeDeb(['67'])
  const resultatFinancier = produitsFinanciers - chargesFinancieres

  const produitsHAO = getSoldeCred(['82', '84', '86', '88'])
  const chargesHAO = getSoldeDeb(['81', '83', '85'])
  const resultatHAO = produitsHAO - chargesHAO

  const impotBenefices = getSoldeDeb(['89']) // IS / IBS
  const resultatNetExercice = resultatExploitation + resultatFinancier + resultatHAO - impotBenefices

  const resultatRows: ResultatStatementRow[] = [
    { code: 'NO_RESULTAT_TA', label: 'Ventes de marchandises', sign: '+', note: '21', netN: ventesMarchandises, netNMinus1: prevVentesMarchandises },
    { code: 'NO_RESULTAT_RA', label: 'Achats de marchandises', sign: '-', note: '22', netN: achatsMarchandises, netNMinus1: prevAchatsMarchandises },
    { code: 'NO_RESULTAT_RB', label: 'Variation de stocks de marchandises', sign: '-/+', note: '6', netN: varStocksMarch, netNMinus1: prevVarStocksMarch },
    { code: 'NO_RESULTAT_XA', label: 'MARGE COMMERCIALE (Somme TA à RB)', sign: '', note: '', netN: margeCommerciale, netNMinus1: prevMargeCommerciale },
    { code: 'NO_RESULTAT_TB', label: 'Ventes de produits fabriqués', sign: '+', note: '21', netN: ventesProduits, netNMinus1: 0 },
    { code: 'NO_RESULTAT_TC', label: 'Travaux, services vendus', sign: '+', note: '21', netN: travauxServices, netNMinus1: 0 },
    { code: 'NO_RESULTAT_TD', label: 'Produits accessoires', sign: '+', note: '21', netN: produitsAccessoires, netNMinus1: 0 },
    { code: 'NO_RESULTAT_XB', label: "CHIFFRE D'AFFAIRES (TA + TB + TC + TD)", sign: '', note: '', netN: chiffreAffaires, netNMinus1: prevChiffreAffaires },
    { code: 'NO_RESULTAT_RE', label: 'Autres achats', sign: '-', note: '22', netN: autresAchats, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RG', label: 'Transports', sign: '-', note: '23', netN: transports, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RH', label: 'Services extérieurs', sign: '-', note: '24', netN: servicesExterieurs, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RI', label: 'Impôts et taxes', sign: '-', note: '25', netN: impotsTaxes, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RJ', label: 'Charges de personnel', sign: '-', note: '27', netN: chargesPersonnel, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RK', label: 'Dotations aux amortissements', sign: '-', note: '28', netN: dotationsAmort, netNMinus1: 0 },
    { code: 'NO_RESULTAT_XC', label: "VALEUR AJOUTÉE (XB + TE + TF + TG + TH + TI - RA à RJ)", sign: '', note: '', netN: chiffreAffaires - (achatsMarchandises + autresAchats + transports + servicesExterieurs), netNMinus1: 0 },
    { code: 'NO_RESULTAT_XE', label: "RÉSULTAT D'EXPLOITATION", sign: '', note: '', netN: resultatExploitation, netNMinus1: prevResultatExploitation },
    { code: 'NO_RESULTAT_XF', label: 'RÉSULTAT FINANCIER', sign: '', note: '', netN: resultatFinancier, netNMinus1: 0 },
    { code: 'NO_RESULTAT_XG', label: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES', sign: '', note: '', netN: resultatExploitation + resultatFinancier, netNMinus1: 0 },
    { code: 'NO_RESULTAT_XH', label: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES (HAO)', sign: '', note: '', netN: resultatHAO, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RK_1', label: 'Participation des travailleurs', sign: '-', note: '30', netN: 0, netNMinus1: 0 },
    { code: 'NO_RESULTAT_RL', label: 'Impôts sur le résultat (IS)', sign: '-', note: '', netN: impotBenefices, netNMinus1: 0 },
    { code: 'NO_RESULTAT_XN', label: "RÉSULTAT NET DE L'EXERCICE", sign: '', note: '', netN: resultatNetExercice, netNMinus1: 0 },
  ]

  // ─── 3. PASSIF SYSCOHADA (NO_PASSIF) ───────────────────────────────────────
  const capitalSocial = getSoldeCred(['101', '102', '103', '104'])
  const reportANouveau = getSoldeCred(['12']) - getSoldeDeb(['12'])
  const reserves = getSoldeCred(['111', '112', '118'])
  const dettesFinancieres = getSoldeCred(['16', '17'])
  const totalRessourcesStables = capitalSocial + reportANouveau + reserves + resultatNetExercice + dettesFinancieres

  const dettesFournisseurs = getSoldeCred(['401', '402', '408'])
  const dettesFiscalesSociales = getSoldeCred(['42', '43', '44'])
  const autresDettesCirculantes = getSoldeCred(['45', '46', '47', '48'])
  const totalPassifCirculant = dettesFournisseurs + dettesFiscalesSociales + autresDettesCirculantes

  const tresoreriePassif = getSoldeCred(['56']) // découverts bancaires

  const totalPassifNet = totalRessourcesStables + totalPassifCirculant + tresoreriePassif
  const prevTotalPassifNet = 0

  const passifRows: PassifStatementRow[] = [
    { code: 'NO_PASSIF_CA', label: 'Capital', note: '13', netN: capitalSocial, netNMinus1: 0 },
    { code: 'NO_PASSIF_CF', label: 'Réserves', note: '14', netN: reserves, netNMinus1: 0 },
    { code: 'NO_PASSIF_CH', label: 'Report à nouveau (+ ou -)', note: '14', netN: reportANouveau, netNMinus1: 0 },
    { code: 'NO_PASSIF_CJ', label: "Résultat net de l'exercice (bénéfice + ou perte -)", note: '', netN: resultatNetExercice, netNMinus1: 0 },
    { code: 'NO_PASSIF_CP', label: 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILEES', note: '', netN: capitalSocial + reserves + reportANouveau + resultatNetExercice, netNMinus1: 0 },
    { code: 'NO_PASSIF_DA', label: 'Emprunts et dettes financières diverses', note: '16', netN: dettesFinancieres, netNMinus1: 0 },
    { code: 'NO_PASSIF_DF', label: 'TOTAL RESSOURCES STABLES', note: '', netN: totalRessourcesStables, netNMinus1: 0 },
    { code: 'NO_PASSIF_DJ', label: "Fournisseurs d'exploitation", note: '17', netN: dettesFournisseurs, netNMinus1: 0 },
    { code: 'NO_PASSIF_DK', label: 'Dettes fiscales et sociales', note: '18', netN: dettesFiscalesSociales, netNMinus1: 0 },
    { code: 'NO_PASSIF_DM', label: 'Autres dettes et provisions pour charges', note: '19', netN: autresDettesCirculantes, netNMinus1: 0 },
    { code: 'NO_PASSIF_DP', label: 'TOTAL PASSIF CIRCULANT', note: '', netN: totalPassifCirculant, netNMinus1: 0 },
    { code: 'NO_PASSIF_DQ', label: 'TRESORERIE PASSIF (Banques et découverts)', note: '11', netN: tresoreriePassif, netNMinus1: 0 },
    { code: 'NO_PASSIF_DT', label: 'TOTAL GENERAL PASSIF', note: '', netN: totalPassifNet, netNMinus1: prevTotalPassifNet },
  ]

  // Contrôles de cohérence officiels DGI
  const anomalies: ControlAnomaly[] = []
  const ecartBilan = Math.round(totalActifNet - totalPassifNet)
  if (Math.abs(ecartBilan) > 1) {
    anomalies.push({
      code: 'CTRL_BILAN_EQUILIBRE',
      severity: 'ERROR',
      title: 'Déséquilibre Actif / Passif',
      description: `L'Actif Net (${totalActifNet.toLocaleString('fr-FR')} FCFA) n'est pas égal au Passif Net (${totalPassifNet.toLocaleString('fr-FR')} FCFA). Écart : ${ecartBilan.toLocaleString('fr-FR')} FCFA`,
      difference: ecartBilan,
    })
  }

  return {
    actif: actifRows,
    passif: passifRows,
    resultat: resultatRows,
    totals: {
      totalActifNet,
      totalPassifNet,
      ecartBilan,
      resultatNet: resultatNetExercice,
    },
    anomalies,
  }
}

/**
 * Génère le fichier XML EDI officiel DGI e-services Bénin
 */
export function generateDgiEdiXml(
  meta: DgiEdiMetadata,
  statements: ReturnType<typeof calculateDgiFinancialStatements>
): string {
  const sanitize = (val: any) => {
    if (val === undefined || val === null) return ''
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const formatAmount = (num: number) => {
    if (isNaN(num)) return '0'
    return Math.round(num).toString()
  }

  // 1. Informations de cadrage (NO_FR1A)
  const tabFR1A: DgiTabItem = {
    idEdiType: 'NO_FR1A',
    data: {
      line: [
        {
          l: '1',
          k: [
            { id: 'texte_1', o: meta.dateDebutExercice.split('-').reverse().join('/') }, // NO_FR1_ZA1
          ],
        },
        {
          l: '2',
          k: [
            { id: 'texte_1', o: meta.dateFinExercice.split('-').reverse().join('/') }, // NO_FR1_ZA2
          ],
        },
        {
          l: '3',
          k: [
            { id: 'texte_1', o: (meta.dateArreteComptes || meta.dateFinExercice).split('-').reverse().join('/') }, // NO_FR1_ZB
          ],
        },
        {
          l: '4',
          k: [
            { id: 'texte_1', o: (meta.exercicePrecedentClosLe || `${meta.exercice - 1}-12-31`).split('-').reverse().join('/') }, // NO_FR1_ZC
          ],
        },
        {
          l: '5',
          k: [
            { id: 'texte_1', o: String(meta.dureeExercicePrecedentMois || 12) }, // NO_FR1_ZD
          ],
        },
        {
          l: '6',
          k: [
            { id: 'texte_1', o: meta.codeActivite || 'A030101' }, // NO_FR1_ZI
          ],
        },
        {
          l: '7',
          k: [
            { id: 'texte_1', o: meta.ville || 'Cotonou' }, // NO_FR1_ZK4
          ],
        },
      ],
    },
  }

  // 2. Tableau ACTIF (NO_ACTIF)
  const tabActif: DgiTabItem = {
    idEdiType: 'NO_ACTIF',
    data: {
      line: statements.actif.map((row, idx) => ({
        l: String(idx + 1),
        k: [
          { id: 'montant_1', o: formatAmount(row.brutN) },
          { id: 'montant_2', o: formatAmount(row.amortN) },
          { id: 'montant_3', o: formatAmount(row.netN) },
          { id: 'montant_4', o: formatAmount(row.netNMinus1) },
        ],
      })),
    },
  }

  // 3. Tableau PASSIF (NO_PASSIF)
  const tabPassif: DgiTabItem = {
    idEdiType: 'NO_PASSIF',
    data: {
      line: statements.passif.map((row, idx) => ({
        l: String(idx + 1),
        k: [
          { id: 'montant_1', o: formatAmount(row.netN) },
          { id: 'montant_2', o: formatAmount(row.netNMinus1) },
        ],
      })),
    },
  }

  // 4. Tableau RÉSULTAT (NO_RESULTAT)
  const tabResultat: DgiTabItem = {
    idEdiType: 'NO_RESULTAT',
    data: {
      line: statements.resultat.map((row, idx) => ({
        l: String(idx + 1),
        k: [
          { id: 'montant_1', o: formatAmount(row.netN) },
          { id: 'montant_2', o: formatAmount(row.netNMinus1) },
        ],
      })),
    },
  }

  const allTabs = [tabFR1A, tabActif, tabPassif, tabResultat]

  // Construction XML conforme DGI Bénin e-Services
  let xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n`
  xml += `<EDI>\n`
  xml += `  <infos>\n`
  xml += `    <rContribuable>${sanitize(meta.ifu)}</rContribuable>\n`
  xml += `    <idImpotNature>${sanitize(meta.idImpotNature || 'LIASSE_NO')}</idImpotNature>\n`
  xml += `    <idExercice>${sanitize(meta.exercice)}</idExercice>\n`
  xml += `  </infos>\n`
  xml += `  <tabs>\n`

  allTabs.forEach((t) => {
    xml += `    <tab>\n`
    xml += `      <idEdiType>${sanitize(t.idEdiType)}</idEdiType>\n`
    xml += `      <data>\n`
    t.data.line.forEach((ln) => {
      xml += `        <line>\n`
      xml += `          <l>${sanitize(ln.l)}</l>\n`
      ln.k.forEach((cell) => {
        xml += `          <k>\n`
        xml += `            <id>${sanitize(cell.id)}</id>\n`
        xml += `            <o>${sanitize(cell.o)}</o>\n`
        xml += `          </k>\n`
      })
      xml += `        </line>\n`
    })
    xml += `      </data>\n`
    xml += `    </tab>\n`
  })

  xml += `  </tabs>\n`
  xml += `</EDI>`

  return xml
}
