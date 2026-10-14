// =============================================================================
// GESTIO 229 ERP — SERVICE COMPTABLE AUTOMATISÉ (SYSCOHADA RÉVISÉ 2018 BÉNIN)
// RÈGLE ABSOLUE : GÉNÉRATION AUTOMATIQUE ET INSTANTANÉE SANS INTERVENTION MANUELLE
// 1. Journal Vente (JV) : Engagement systématique à la vente (même à crédit)
// 2. Journal Caisse / Banque (JC / JB) : Règlement de la facture dès encaissement
// 3. Journal Achat (JA) : Engagement achat fournisseur
// 4. Journal Caisse / Banque (JC / JB) : Règlement achat fournisseur
// 5. Journal Salaire (JS) : Paie validée (Brut, Net, CNSS, IPTS/VPS)
// 6. Journal Dépenses Diverses : Ventilation automatique dans JC / JB
// 7. Règlements Créances : Encaissement clients vers JC / JB
// Isolation : company_id + sector_slug | Fuseau horaire : Africa/Porto-Novo
// =============================================================================

import { supabase } from '../lib/supabase'
import {
  createAccountingEntry,
  getAccountLabel,
  AccountingEntry,
  AccountingEntryLine,
  JournalCode
} from './accountingService'

/**
 * Renvoie la date du jour ou la date fournie au format YYYY-MM-DD en heure de Cotonou / Porto-Novo
 */
export function getPortoNovoDate(dateInput?: string | Date | null): string {
  try {
    if (!dateInput) {
      return new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' })
    }
    const d = typeof dateInput === 'string' && dateInput.length === 10 ? new Date(`${dateInput}T12:00:00Z`) : new Date(dateInput)
    if (isNaN(d.getTime())) {
      return new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' })
    }
    return d.toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' })
  } catch (_) {
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * Supprime proprement les écritures liées à une source pour garantir l'idempotence stricte
 */
export async function supprimerEcrituresSource(
  sourceModule: string,
  sourceId: string,
  companyId: string
): Promise<void> {
  if (!sourceModule || !sourceId || !companyId) return
  try {
    const { data: entries } = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('source_module', sourceModule)
      .eq('source_id', sourceId)

    if (entries && entries.length > 0) {
      const entryIds = entries.map((e) => e.id)
      await supabase
        .from('accounting_entry_lines')
        .delete()
        .in('entry_id', entryIds)

      await supabase
        .from('accounting_entries')
        .delete()
        .in('id', entryIds)
    }
  } catch (err) {
    console.warn('[compta_auto] Erreur suppression écritures source:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 & 2. COMPTABILISATION AUTOMATIQUE D'UNE VENTE (JV + JC / JB)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComptabiliserVenteParams {
  companyId: string
  sectorSlug: string
  saleId: string
  orderNumber: string
  orderDate?: string
  totalTtc: number
  tvaAmount?: number
  aibAmount?: number
  customerName?: string | null
  customerId?: string | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  paidAmount?: number
  creditAmount?: number
  createdById?: string | null
  isMultiPayment?: boolean
  payments?: { method: string; amount: number }[]
}

export async function comptabiliserVenteAuto(
  params: ComptabiliserVenteParams
): Promise<{ success: boolean; jvEntry?: AccountingEntry; paymentEntries?: AccountingEntry[]; error?: string }> {
  const {
    companyId,
    sectorSlug,
    saleId,
    orderNumber,
    orderDate,
    customerName,
    customerId,
    paymentMethod,
    paymentStatus,
    paidAmount,
    creditAmount,
    createdById,
    isMultiPayment,
    payments
  } = params

  if (!companyId || !saleId || params.totalTtc <= 0) {
    return { success: false, error: 'Paramètres vente invalides pour la comptabilisation' }
  }

  const cleanSector = (sectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const dateStr = getPortoNovoDate(orderDate)
  const clientNom = (customerName || '').trim() || 'Client Comptoir'
  const totalTtc = Math.round(Number(params.totalTtc) * 100) / 100
  const tva = Math.round(Number(params.tvaAmount || 0) * 100) / 100
  const aib = Math.round(Number(params.aibAmount || 0) * 100) / 100
  const totalHt = Math.round((totalTtc - tva - aib) * 100) / 100

  try {
    // 1. Idempotence : supprimer les écritures précédentes pour cette vente
    await supprimerEcrituresSource('ventes', saleId, companyId)

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 1 : JOURNAL VENTE (JV) — ENGAGEMENT A LA VENTE
    // Débit: 411100 Client [Nom client] - Montant TTC
    // Crédit: 701100 Vente de marchandises - Montant HT
    // Crédit: 443100 TVA Facturée 18% - Montant TVA (si assujetti)
    // Crédit: 449200 AIB Collecté 1% ou 5% - Montant AIB (si applicable)
    // Libellé: Facture Vente N°[numero] - [Client] - [Secteur]
    // ─────────────────────────────────────────────────────────────────────────
    const jvLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
      {
        line_number: 1,
        account_number: '411100',
        account_label: `Clients ordinaires - ${clientNom}`,
        description: `Facture Vente N°${orderNumber} - ${clientNom} - ${cleanSector}`,
        debit: totalTtc,
        credit: 0,
        third_party_id: customerId || null,
        third_party_name: clientNom,
      },
      {
        line_number: 2,
        account_number: '701100',
        account_label: 'Ventes de marchandises au comptoir',
        description: `Facture Vente N°${orderNumber} - Ventes HT`,
        debit: 0,
        credit: totalHt,
      },
    ]

    let lineCounter = 3
    if (tva > 0) {
      jvLines.push({
        line_number: lineCounter++,
        account_number: '443100',
        account_label: 'État, TVA facturée sur ventes (18%)',
        description: `TVA 18% sur Facture Vente N°${orderNumber}`,
        debit: 0,
        credit: tva,
        tax_code: 'TVA18',
        tax_rate: 18,
        tax_amount: tva,
      })
    }

    if (aib > 0) {
      jvLines.push({
        line_number: lineCounter++,
        account_number: '449200',
        account_label: 'État, AIB collecté sur ventes',
        description: `AIB collecté sur Facture Vente N°${orderNumber}`,
        debit: 0,
        credit: aib,
        aib_amount: aib,
      })
    }

    const jvRes = await createAccountingEntry(
      {
        company_id: companyId,
        sector_slug: cleanSector,
        journal_code: 'JV',
        entry_date: dateStr,
        reference: orderNumber,
        document_type: 'facture_vente',
        document_id: saleId,
        description: `Facture Vente N°${orderNumber} - ${clientNom} - ${cleanSector}`,
        source_module: 'ventes',
        source_id: saleId,
        created_by: createdById,
      },
      jvLines
    )

    if (!jvRes.success) {
      console.error('[compta_auto] Erreur engagement JV:', jvRes.error)
      return { success: false, error: jvRes.error }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 2 : JOURNAL CAISSE (JC) / BANQUE (JB) — RÈGLEMENT DE LA VENTE
    // Dès qu'un encaissement vente en espèces / Momo / banque:
    // Débit: 571 Caisse ou 521 Banque ou 525 Mobile Money - Montant encaissé
    // Crédit: 4111 Client - Montant encaissé
    // Libellé: Règlement Facture N°[numero] - Espèce/Momo
    // ─────────────────────────────────────────────────────────────────────────
    const paymentEntries: AccountingEntry[] = []
    const isCredit = paymentStatus === 'credit' || (creditAmount && creditAmount >= totalTtc)

    if (!isCredit) {
      // Déterminer la liste des règlements effectifs
      const reglementsList: { method: string; amount: number }[] = []

      if (isMultiPayment && Array.isArray(payments) && payments.length > 0) {
        payments.forEach((p) => {
          if (p.amount > 0) reglementsList.push(p)
        })
      } else {
        const montantPaye = Number(paidAmount ?? (totalTtc - (creditAmount || 0))) || 0
        if (montantPaye > 0) {
          reglementsList.push({
            method: paymentMethod || paymentStatus || 'especes',
            amount: montantPaye,
          })
        }
      }

      for (const reg of reglementsList) {
        const m = (reg.method || '').toLowerCase()
        const isBank = m.includes('banque') || m.includes('cheque') || m.includes('virement')
        const isMomo = m.includes('momo') || m.includes('moov') || m.includes('mtn') || m.includes('wave') || m.includes('orange')

        const jCode: JournalCode = isBank ? 'JB' : 'JC'
        const accTreso = isBank ? '521100' : isMomo ? '525100' : '571100'
        const modeLabel = isBank ? 'Banque' : isMomo ? 'Mobile Money' : 'Espèces'
        const amountReg = Math.round(Number(reg.amount) * 100) / 100

        if (amountReg <= 0) continue

        const jcLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
          // Débit Trésorerie
          {
            line_number: 1,
            account_number: accTreso,
            account_label: getAccountLabel(accTreso),
            description: `Règlement Facture N°${orderNumber} - ${modeLabel}`,
            debit: amountReg,
            credit: 0,
          },
          // Crédit Client
          {
            line_number: 2,
            account_number: '411100',
            account_label: `Clients ordinaires - ${clientNom}`,
            description: `Règlement Facture N°${orderNumber} - ${modeLabel}`,
            debit: 0,
            credit: amountReg,
            third_party_id: customerId || null,
            third_party_name: clientNom,
          },
        ]

        const regRes = await createAccountingEntry(
          {
            company_id: companyId,
            sector_slug: cleanSector,
            journal_code: jCode,
            entry_date: dateStr,
            reference: orderNumber,
            document_type: 'reglement_vente',
            document_id: saleId,
            description: `Règlement Facture N°${orderNumber} - ${modeLabel}`,
            source_module: 'ventes',
            source_id: saleId,
            created_by: createdById,
          },
          jcLines
        )

        if (regRes.success && regRes.entry) {
          paymentEntries.push(regRes.entry)
        }
      }
    }

    return {
      success: true,
      jvEntry: jvRes.entry,
      paymentEntries,
    }
  } catch (err: any) {
    console.error('[compta_auto] Exception comptabilisation vente:', err)
    return { success: false, error: err.message || 'Erreur inconnue' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 & 4. COMPTABILISATION AUTOMATIQUE D'UN ACHAT (JA + JC / JB)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComptabiliserAchatParams {
  companyId: string
  sectorSlug: string
  purchaseId: string
  orderNumber: string
  orderDate?: string
  totalTtc: number
  tvaAmount?: number
  aibAmount?: number
  supplierName?: string | null
  supplierId?: string | null
  isPaid?: boolean
  paymentMethod?: string | null
  paidAmount?: number
  createdById?: string | null
}

export async function comptabiliserAchatAuto(
  params: ComptabiliserAchatParams
): Promise<{ success: boolean; jaEntry?: AccountingEntry; paymentEntry?: AccountingEntry; error?: string }> {
  const {
    companyId,
    sectorSlug,
    purchaseId,
    orderNumber,
    orderDate,
    supplierName,
    supplierId,
    isPaid,
    paymentMethod,
    paidAmount,
    createdById,
  } = params

  if (!companyId || !purchaseId || params.totalTtc <= 0) {
    return { success: false, error: 'Paramètres achat invalides pour la comptabilisation' }
  }

  const cleanSector = (sectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const dateStr = getPortoNovoDate(orderDate)
  const fournNom = (supplierName || '').trim() || 'Fournisseur d\'exploitation'
  const totalTtc = Math.round(Number(params.totalTtc) * 100) / 100
  const tva = Math.round(Number(params.tvaAmount || 0) * 100) / 100
  const aib = Math.round(Number(params.aibAmount || 0) * 100) / 100
  const totalHt = Math.round((totalTtc - tva) * 100) / 100
  const netFournisseur = Math.round((totalTtc - aib) * 100) / 100

  try {
    await supprimerEcrituresSource('achats', purchaseId, companyId)

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 1 : JOURNAL ACHAT (JA) — ENGAGEMENT ACHAT
    // Débit: 601100 Achats de marchandises - Montant HT
    // Débit: 445200 TVA Récupérable - Montant TVA
    // Crédit: 401100 Fournisseur - Montant Net TTC
    // Crédit: 449200 AIB Retenu - Montant AIB (si applicable)
    // Libellé: Facture Achat N°[numero] - [Fournisseur]
    // ─────────────────────────────────────────────────────────────────────────
    const jaLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
      {
        line_number: 1,
        account_number: '601100',
        account_label: 'Achats de marchandises',
        description: `Facture Achat N°${orderNumber} - ${fournNom}`,
        debit: totalHt,
        credit: 0,
      },
    ]

    let lineCounter = 2
    if (tva > 0) {
      jaLines.push({
        line_number: lineCounter++,
        account_number: '445200',
        account_label: 'État, TVA récupérable sur achats et immobilisations',
        description: `TVA récupérable sur Facture Achat N°${orderNumber}`,
        debit: tva,
        credit: 0,
        tax_code: 'TVA18',
        tax_rate: 18,
        tax_amount: tva,
      })
    }

    jaLines.push({
      line_number: lineCounter++,
      account_number: '401100',
      account_label: `Fournisseurs d'exploitation - ${fournNom}`,
      description: `Facture Achat N°${orderNumber} - ${fournNom}`,
      debit: 0,
      credit: netFournisseur,
      third_party_id: supplierId || null,
      third_party_name: fournNom,
    })

    if (aib > 0) {
      jaLines.push({
        line_number: lineCounter++,
        account_number: '449200',
        account_label: 'État, AIB retenu à la source / collecté',
        description: `Retenue AIB sur Facture Achat N°${orderNumber}`,
        debit: 0,
        credit: aib,
        aib_amount: aib,
      })
    }

    const jaRes = await createAccountingEntry(
      {
        company_id: companyId,
        sector_slug: cleanSector,
        journal_code: 'JA',
        entry_date: dateStr,
        reference: orderNumber,
        document_type: 'facture_achat',
        document_id: purchaseId,
        description: `Facture Achat N°${orderNumber} - ${fournNom}`,
        source_module: 'achats',
        source_id: purchaseId,
        created_by: createdById,
      },
      jaLines
    )

    if (!jaRes.success) {
      return { success: false, error: jaRes.error }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ÉTAPE 2 : JOURNAL CAISSE/BANQUE — PAIEMENT ACHAT
    // Débit: 401100 Fournisseur
    // Crédit: 571100 Caisse / 521100 Banque / 525100 MoMo
    // ─────────────────────────────────────────────────────────────────────────
    let paymentEntry: AccountingEntry | undefined
    if (isPaid || (paidAmount && paidAmount > 0)) {
      const montantPaye = Math.round(Number(paidAmount || netFournisseur) * 100) / 100
      if (montantPaye > 0) {
        const m = (paymentMethod || '').toLowerCase()
        const isBank = m.includes('banque') || m.includes('cheque') || m.includes('virement')
        const isMomo = m.includes('momo') || m.includes('moov') || m.includes('mtn') || m.includes('wave')

        const jCode: JournalCode = isBank ? 'JB' : 'JC'
        const accTreso = isBank ? '521100' : isMomo ? '525100' : '571100'

        const payLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
          {
            line_number: 1,
            account_number: '401100',
            account_label: `Fournisseurs d'exploitation - ${fournNom}`,
            description: `Règlement Achat N°${orderNumber} - ${fournNom}`,
            debit: montantPaye,
            credit: 0,
            third_party_id: supplierId || null,
            third_party_name: fournNom,
          },
          {
            line_number: 2,
            account_number: accTreso,
            account_label: getAccountLabel(accTreso),
            description: `Règlement Achat N°${orderNumber} - ${fournNom}`,
            debit: 0,
            credit: montantPaye,
          },
        ]

        const payRes = await createAccountingEntry(
          {
            company_id: companyId,
            sector_slug: cleanSector,
            journal_code: jCode,
            entry_date: dateStr,
            reference: orderNumber,
            document_type: 'reglement_achat',
            document_id: purchaseId,
            description: `Règlement Achat N°${orderNumber} - ${fournNom}`,
            source_module: 'achats',
            source_id: purchaseId,
            created_by: createdById,
          },
          payLines
        )

        if (payRes.success) {
          paymentEntry = payRes.entry
        }
      }
    }

    return {
      success: true,
      jaEntry: jaRes.entry,
      paymentEntry,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur comptabilisation achat' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPTABILISATION AUTOMATIQUE DU SALAIRE (JS + RÈGLEMENT)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComptabiliserSalaireParams {
  companyId: string
  sectorSlug?: string
  salaryId: string
  payrollPeriod: string
  employeeName: string
  employeeId?: string | null
  grossSalary: number
  netSalary: number
  cnssAmount?: number
  taxSalaryAmount?: number // IPTS / VPS
  advanceDeducted?: number
  isPaid?: boolean
  paymentMethod?: string | null
  createdById?: string | null
}

export async function comptabiliserSalaireAuto(
  params: ComptabiliserSalaireParams
): Promise<{ success: boolean; jsEntry?: AccountingEntry; paymentEntry?: AccountingEntry; error?: string }> {
  const {
    companyId,
    sectorSlug,
    salaryId,
    payrollPeriod,
    employeeName,
    employeeId,
    grossSalary,
    netSalary,
    cnssAmount = 0,
    taxSalaryAmount = 0,
    advanceDeducted = 0,
    isPaid = true,
    paymentMethod = 'especes',
    createdById,
  } = params

  if (!companyId || !salaryId || grossSalary <= 0) {
    return { success: false, error: 'Paramètres salaire invalides pour la comptabilisation' }
  }

  const cleanSector = (sectorSlug || 'direction').toLowerCase().trim().replace(/^sec-/, '')
  const dateStr = getPortoNovoDate()
  const empNom = (employeeName || '').trim() || 'Employé'

  const brut = Math.round(Number(grossSalary) * 100) / 100
  const net = Math.round(Number(netSalary) * 100) / 100
  const cnss = Math.round(Number(cnssAmount) * 100) / 100
  const ipts = Math.round(Number(taxSalaryAmount) * 100) / 100
  const acompte = Math.round(Number(advanceDeducted) * 100) / 100

  // Vérification de l'équilibre
  // Brut = Net + CNSS + IPTS + Acompte
  const totalCreditCredits = net + cnss + ipts + acompte
  let adjustedNet = net
  if (Math.abs(brut - totalCreditCredits) > 0.05) {
    adjustedNet = Math.round((brut - cnss - ipts - acompte) * 100) / 100
  }

  try {
    await supprimerEcrituresSource('salaires', salaryId, companyId)

    // ─────────────────────────────────────────────────────────────────────────
    // JOURNAL SALAIRE (JS):
    // Débit: 661100 Charges de personnel - Brut
    // Crédit: 422200 Personnel à payer - Net
    // Crédit: 431000 Organismes sociaux (CNSS)
    // Crédit: 447200 Impôts sur salaires (IPTS / VPS)
    // ─────────────────────────────────────────────────────────────────────────
    const jsLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
      {
        line_number: 1,
        account_number: '661100',
        account_label: 'Charges de personnel - Rémunérations directes brutes',
        description: `Paie ${payrollPeriod} - ${empNom} (Salaire Brut)`,
        debit: brut,
        credit: 0,
        third_party_id: employeeId || null,
        third_party_name: empNom,
      },
      {
        line_number: 2,
        account_number: '422200',
        account_label: 'Personnel, rémunérations nettes à payer',
        description: `Paie ${payrollPeriod} - ${empNom} (Net à payer)`,
        debit: 0,
        credit: adjustedNet,
        third_party_id: employeeId || null,
        third_party_name: empNom,
      },
    ]

    let lineCounter = 3
    if (cnss > 0) {
      jsLines.push({
        line_number: lineCounter++,
        account_number: '431000',
        account_label: 'Sécurité Sociale (CNSS Bénin)',
        description: `Cotisations CNSS Paie ${payrollPeriod} - ${empNom}`,
        debit: 0,
        credit: cnss,
      })
    }

    if (ipts > 0) {
      jsLines.push({
        line_number: lineCounter++,
        account_number: '447200',
        account_label: 'État, impôts et taxes sur salaires (IPTS / VPS)',
        description: `Impôts sur salaires IPTS/VPS Paie ${payrollPeriod} - ${empNom}`,
        debit: 0,
        credit: ipts,
      })
    }

    if (acompte > 0) {
      jsLines.push({
        line_number: lineCounter++,
        account_number: '422000',
        account_label: 'Personnel, acomptes et avances déduits',
        description: `Acompte déduit Paie ${payrollPeriod} - ${empNom}`,
        debit: 0,
        credit: acompte,
      })
    }

    const jsRes = await createAccountingEntry(
      {
        company_id: companyId,
        sector_slug: cleanSector,
        journal_code: 'JS',
        entry_date: dateStr,
        reference: `SAL-${payrollPeriod}`,
        document_type: 'bulletin_paie',
        document_id: salaryId,
        description: `Paie ${payrollPeriod} - ${empNom}`,
        source_module: 'salaires',
        source_id: salaryId,
        created_by: createdById,
      },
      jsLines
    )

    if (!jsRes.success) {
      return { success: false, error: jsRes.error }
    }

    // Règlement du salaire net si payé
    let paymentEntry: AccountingEntry | undefined
    if (isPaid && adjustedNet > 0) {
      const m = (paymentMethod || '').toLowerCase()
      const isBank = m.includes('banque') || m.includes('cheque') || m.includes('virement')
      const isMomo = m.includes('momo') || m.includes('moov') || m.includes('mtn')
      const jCode: JournalCode = isBank ? 'JB' : 'JC'
      const accTreso = isBank ? '521100' : isMomo ? '525100' : '571100'

      const payLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
        {
          line_number: 1,
          account_number: '422200',
          account_label: 'Personnel, rémunérations nettes à payer',
          description: `Règlement salaire ${payrollPeriod} - ${empNom}`,
          debit: adjustedNet,
          credit: 0,
          third_party_id: employeeId || null,
          third_party_name: empNom,
        },
        {
          line_number: 2,
          account_number: accTreso,
          account_label: getAccountLabel(accTreso),
          description: `Décaissement salaire net ${payrollPeriod} - ${empNom}`,
          debit: 0,
          credit: adjustedNet,
        },
      ]

      const payRes = await createAccountingEntry(
        {
          company_id: companyId,
          sector_slug: cleanSector,
          journal_code: jCode,
          entry_date: dateStr,
          reference: `REG-SAL-${payrollPeriod}`,
          document_type: 'recu_caisse',
          document_id: salaryId,
          description: `Règlement salaire ${payrollPeriod} - ${empNom}`,
          source_module: 'salaires',
          source_id: salaryId,
          created_by: createdById,
        },
        payLines
      )

      if (payRes.success) {
        paymentEntry = payRes.entry
      }
    }

    return {
      success: true,
      jsEntry: jsRes.entry,
      paymentEntry,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur comptabilisation salaire' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. COMPTABILISATION AUTOMATIQUE DES DÉPENSES DIVERSES (JC / JB)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComptabiliserDepenseParams {
  companyId: string
  sectorSlug: string
  expenseId: string
  expenseNumber?: string
  expenseDate?: string
  amount: number
  category: string
  description?: string
  beneficiary?: string | null
  paymentMethod?: string | null
  createdById?: string | null
}

export async function comptabiliserDepenseAuto(
  params: ComptabiliserDepenseParams
): Promise<{ success: boolean; entry?: AccountingEntry; error?: string }> {
  const {
    companyId,
    sectorSlug,
    expenseId,
    expenseNumber,
    expenseDate,
    amount,
    category,
    description,
    beneficiary,
    paymentMethod,
    createdById,
  } = params

  if (!companyId || !expenseId || amount <= 0) {
    return { success: false, error: 'Paramètres dépense invalides' }
  }

  const cleanSector = (sectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const dateStr = getPortoNovoDate(expenseDate)
  const numAmount = Math.round(Number(amount) * 100) / 100
  const ref = expenseNumber || `DEP-${expenseId.slice(0, 8)}`
  const libelle = description || `Dépense : ${category}`
  const benef = beneficiary || null

  try {
    await supprimerEcrituresSource('depenses', expenseId, companyId)

    // Détermination automatique du compte de charge SYSCOHADA selon la catégorie
    const cat = (category || '').toLowerCase()
    let chargeAccount = '605100'
    let chargeLabel = 'Fournitures de bureau et consommables'

    if (cat.includes('loyer') || cat.includes('bail') || cat.includes('location')) {
      chargeAccount = '613100'
      chargeLabel = 'Locations immobilières et loyers commerciaux'
    } else if (cat.includes('electricite') || cat.includes('sbee') || cat.includes('eau') || cat.includes('soneb')) {
      chargeAccount = '605200'
      chargeLabel = 'Consommations Électricité (SBEE) & Eau (SONEB)'
    } else if (cat.includes('carburant') || cat.includes('essence') || cat.includes('gasoil') || cat.includes('vidange')) {
      chargeAccount = '605300'
      chargeLabel = 'Carburants et lubrifiants d\'exploitation'
    } else if (cat.includes('salaire') || cat.includes('paie') || cat.includes('personnel') || cat.includes('remuneration')) {
      chargeAccount = '661100'
      chargeLabel = 'Charges de personnel - Rémunérations directes brutes'
    } else if (cat.includes('telecom') || cat.includes('internet') || cat.includes('telephone') || cat.includes('forfait')) {
      chargeAccount = '618100'
      chargeLabel = 'Frais de télécommunications & Connexion Internet'
    } else if (cat.includes('transport') || cat.includes('livraison') || cat.includes('fret') || cat.includes('course')) {
      chargeAccount = '624100'
      chargeLabel = 'Transports de biens et frais de livraison'
    } else if (cat.includes('honoraire') || cat.includes('avocat') || cat.includes('notaire') || cat.includes('expert')) {
      chargeAccount = '622100'
      chargeLabel = 'Rémunérations d\'intermédiaires et honoraires'
    } else if (cat.includes('entretien') || cat.includes('reparation') || cat.includes('maintenance')) {
      chargeAccount = '605100'
      chargeLabel = 'Fournitures, petit outillage et entretien'
    } else if (cat.includes('impot') || cat.includes('taxe') || cat.includes('patente')) {
      chargeAccount = '631100'
      chargeLabel = 'Impôts et taxes directs'
    } else if (cat.includes('banque') || cat.includes('commission') || cat.includes('agios')) {
      chargeAccount = '627100'
      chargeLabel = 'Frais bancaires et commissions de tenue de compte'
    } else {
      chargeAccount = '658100'
      chargeLabel = 'Charges diverses d\'exploitation'
    }

    const m = (paymentMethod || '').toLowerCase()
    const isBank = m.includes('banque') || m.includes('cheque') || m.includes('virement')
    const isMomo = m.includes('momo') || m.includes('moov') || m.includes('mtn') || m.includes('wave')

    const jCode: JournalCode = isBank ? 'JB' : 'JC'
    const accTreso = isBank ? '521100' : isMomo ? '525100' : '571100'

    const depLines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
      {
        line_number: 1,
        account_number: chargeAccount,
        account_label: chargeLabel,
        description: `${libelle}${benef ? ' - ' + benef : ''}`,
        debit: numAmount,
        credit: 0,
        third_party_name: benef,
      },
      {
        line_number: 2,
        account_number: accTreso,
        account_label: getAccountLabel(accTreso),
        description: `Règlement ${isBank ? 'banque' : isMomo ? 'MoMo' : 'espèces'} : ${libelle}`,
        debit: 0,
        credit: numAmount,
      },
    ]

    const depRes = await createAccountingEntry(
      {
        company_id: companyId,
        sector_slug: cleanSector,
        journal_code: jCode,
        entry_date: dateStr,
        reference: ref,
        document_type: isBank ? 'paiement_banque' : 'recu_caisse',
        document_id: expenseId,
        description: `${libelle}${benef ? ' — ' + benef : ''}`,
        source_module: 'depenses',
        source_id: expenseId,
        created_by: createdById,
      },
      depLines
    )

    return depRes
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur comptabilisation dépense' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. COMPTABILISATION RECOUVREMENT DE CRÉANCE CLIENT (JC / JB)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComptabiliserCreanceParams {
  companyId: string
  sectorSlug: string
  paymentId: string
  reference: string
  paymentDate?: string
  amount: number
  customerName: string
  customerId?: string | null
  paymentMethod?: string | null
  createdById?: string | null
}

export async function comptabiliserEncaissementCreanceAuto(
  params: ComptabiliserCreanceParams
): Promise<{ success: boolean; entry?: AccountingEntry; error?: string }> {
  const {
    companyId,
    sectorSlug,
    paymentId,
    reference,
    paymentDate,
    amount,
    customerName,
    customerId,
    paymentMethod,
    createdById,
  } = params

  if (!companyId || !paymentId || amount <= 0) {
    return { success: false, error: 'Paramètres recouvrement créance invalides' }
  }

  const cleanSector = (sectorSlug || 'boutique').toLowerCase().trim().replace(/^sec-/, '')
  const dateStr = getPortoNovoDate(paymentDate)
  const numAmount = Math.round(Number(amount) * 100) / 100
  const clientNom = (customerName || '').trim() || 'Client'

  try {
    await supprimerEcrituresSource('clients_creances', paymentId, companyId)

    const m = (paymentMethod || '').toLowerCase()
    const isBank = m.includes('banque') || m.includes('cheque') || m.includes('virement')
    const isMomo = m.includes('momo') || m.includes('moov') || m.includes('mtn') || m.includes('wave')

    const jCode: JournalCode = isBank ? 'JB' : 'JC'
    const accTreso = isBank ? '521100' : isMomo ? '525100' : '571100'
    const modeLabel = isBank ? 'Banque' : isMomo ? 'Mobile Money' : 'Espèces'

    const lines: Omit<AccountingEntryLine, 'entry_id' | 'company_id' | 'sector_slug'>[] = [
      {
        line_number: 1,
        account_number: accTreso,
        account_label: getAccountLabel(accTreso),
        description: `Règlement Créance ${reference} - ${clientNom} (${modeLabel})`,
        debit: numAmount,
        credit: 0,
      },
      {
        line_number: 2,
        account_number: '411100',
        account_label: `Clients ordinaires - ${clientNom}`,
        description: `Règlement Créance ${reference} - ${clientNom}`,
        debit: 0,
        credit: numAmount,
        third_party_id: customerId || null,
        third_party_name: clientNom,
      },
    ]

    const res = await createAccountingEntry(
      {
        company_id: companyId,
        sector_slug: cleanSector,
        journal_code: jCode,
        entry_date: dateStr,
        reference,
        document_type: 'reglement_creance',
        document_id: paymentId,
        description: `Règlement Créance Facture N°${reference} - ${clientNom}`,
        source_module: 'clients_creances',
        source_id: paymentId,
        created_by: createdById,
      },
      lines
    )

    return res
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur comptabilisation créance' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SYNCHRONISATION AUTOMATIQUE EN ARRIÈRE-PLAN (AUTO-HEAL SILENCIEUX)
// Rattrape immédiatement et automatiquement toutes les ventes, achats et dépenses
// passées non encore comptabilisées dans Supabase, sans clic utilisateur.
// ─────────────────────────────────────────────────────────────────────────────

export async function synchroniserToutAutomatiquement(
  companyId: string,
  sectorSlug?: string,
  userId?: string
): Promise<{ added: number }> {
  if (!companyId) return { added: 0 }

  let count = 0

  try {
    // 1. Récupérer les identifiants déjà comptabilisés
    let entriesQuery = supabase
      .from('accounting_entries')
      .select('source_module, source_id, journal_code')
      .eq('company_id', companyId)

    if (sectorSlug && sectorSlug !== 'all' && sectorSlug !== 'ALL' && sectorSlug !== 'global') {
      entriesQuery = entriesQuery.eq('sector_slug', sectorSlug)
    }

    const { data: existingRecords } = await entriesQuery
    const existingSet = new Set(
      (existingRecords || []).map((r: any) => `${r.source_module}_${r.source_id}_${r.journal_code}`)
    )

    // 2. Récupérer les ventes non comptabilisées
    let salesQuery = supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(150)

    if (sectorSlug && sectorSlug !== 'all' && sectorSlug !== 'ALL' && sectorSlug !== 'global') {
      salesQuery = salesQuery.eq('sector_slug', sectorSlug)
    }

    const { data: sales } = await salesQuery
    for (const sale of sales || []) {
      const saleId = sale.id
      const jvKey = `ventes_${saleId}_JV`
      if (!existingSet.has(jvKey)) {
        const res = await comptabiliserVenteAuto({
          companyId,
          sectorSlug: sale.sector_slug || sectorSlug || 'boutique',
          saleId,
          orderNumber: sale.order_number || `VTE-${saleId.slice(0, 8)}`,
          orderDate: sale.order_date || sale.created_at,
          totalTtc: Number(sale.total_amount) || 0,
          tvaAmount: Number(sale.tva_amount) || 0,
          aibAmount: Number(sale.aib_amount) || 0,
          customerName: sale.customer_name,
          customerId: sale.customer_id,
          paymentMethod: sale.payment_method,
          paymentStatus: sale.payment_status,
          paidAmount: Number(sale.paid_amount ?? sale.total_amount) || 0,
          creditAmount: Number(sale.credit_amount) || 0,
          createdById: sale.created_by || userId,
        })
        if (res.success) {
          count++
          existingSet.add(jvKey)
        }
      }
    }

    // 3. Récupérer les dépenses non comptabilisées
    let expQuery = supabase
      .from('expenses')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (sectorSlug && sectorSlug !== 'all' && sectorSlug !== 'ALL' && sectorSlug !== 'global') {
      expQuery = expQuery.eq('sector_slug', sectorSlug)
    }

    const { data: expenses } = await expQuery
    for (const exp of expenses || []) {
      const expId = exp.id
      const isBank = (exp.payment_method || '').toLowerCase().includes('banque')
      const jCode = isBank ? 'JB' : 'JC'
      const expKey = `depenses_${expId}_${jCode}`
      const salKey = `salaires_${expId}_JS`

      if (!existingSet.has(expKey) && !existingSet.has(salKey)) {
        // Détecter si c'est un salaire
        let notesObj: any = null
        try {
          if (exp.notes && typeof exp.notes === 'string' && exp.notes.startsWith('{')) {
            notesObj = JSON.parse(exp.notes)
          }
        } catch (_) {}

        if (notesObj && (notesObj.type === 'PAIE_SALAIRE' || notesObj.gross_salary)) {
          const salRes = await comptabiliserSalaireAuto({
            companyId,
            sectorSlug: exp.sector_slug || sectorSlug || 'direction',
            salaryId: expId,
            payrollPeriod: notesObj.period || exp.expense_date?.slice(0, 7) || new Date().toISOString().slice(0, 7),
            employeeName: exp.beneficiary || notesObj.employee_name || 'Employé',
            employeeId: notesObj.employee_id,
            grossSalary: Number(notesObj.gross_salary || exp.amount),
            netSalary: Number(notesObj.net_salary || exp.amount),
            cnssAmount: Number(notesObj.cnss_salariale || 0) + Number(notesObj.cnss_patronale || 0),
            taxSalaryAmount: Number(notesObj.vps_benin || 0),
            isPaid: true,
            paymentMethod: exp.payment_method || 'especes',
            createdById: exp.created_by || userId,
          })
          if (salRes.success) {
            count++
            existingSet.add(salKey)
          }
        } else {
          const depRes = await comptabiliserDepenseAuto({
            companyId,
            sectorSlug: exp.sector_slug || sectorSlug || 'boutique',
            expenseId: expId,
            expenseNumber: exp.expense_number,
            expenseDate: exp.expense_date || exp.created_at,
            amount: Number(exp.amount) || 0,
            category: exp.category || 'Exploitation',
            description: exp.beneficiary ? `${exp.category || 'Dépense'} - ${exp.beneficiary}` : exp.category,
            beneficiary: exp.beneficiary,
            paymentMethod: exp.payment_method,
            createdById: exp.created_by || userId,
          })
          if (depRes.success) {
            count++
            existingSet.add(expKey)
          }
        }
      }
    }

    // 4. Récupérer les achats (purchase_orders) non comptabilisés
    let poQuery = supabase
      .from('purchase_orders')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(60)

    if (sectorSlug && sectorSlug !== 'all' && sectorSlug !== 'ALL' && sectorSlug !== 'global') {
      poQuery = poQuery.eq('sector_slug', sectorSlug)
    }

    const { data: purchases } = await poQuery
    for (const po of purchases || []) {
      const poId = po.id
      const jaKey = `achats_${poId}_JA`
      if (!existingSet.has(jaKey) && Number(po.total_amount) > 0) {
        const poRes = await comptabiliserAchatAuto({
          companyId,
          sectorSlug: po.sector_slug || sectorSlug || 'boutique',
          purchaseId: poId,
          orderNumber: po.order_number || `ACH-${poId.slice(0, 8)}`,
          orderDate: po.order_date || po.expected_delivery_date || po.created_at,
          totalTtc: Number(po.total_amount),
          tvaAmount: Number(po.tax_amount || 0),
          aibAmount: Number(po.aib_amount || 0),
          supplierName: po.supplier_name,
          supplierId: po.supplier_id,
          isPaid: po.payment_status === 'PAID' || po.status === 'paid' || (Number(po.paid_amount) > 0),
          paymentMethod: po.payment_method,
          paidAmount: Number(po.paid_amount || 0),
          createdById: po.created_by || userId,
        })
        if (poRes.success) {
          count++
          existingSet.add(jaKey)
        }
      }
    }
  } catch (err) {
    console.warn('[compta_auto] synchroniserToutAutomatiquement avertissement:', err)
  }

  return { added: count }
}
