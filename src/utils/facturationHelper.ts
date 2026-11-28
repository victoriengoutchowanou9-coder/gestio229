// =============================================================================
// GESTIO 229 SaaS — Module Centralisé de Facturation & Fiscalité (Bénin & UEMOA)
// =============================================================================
// RÈGLES FISCALES IMPÉRATIVES :
// 1. Décomposition fiscale stricte ligne par ligne :
//    - Lignes soumises à TVA : HT taxable = TTC / (1 + Taux TVA + Taux AIB)
//    - Lignes exonérées : Exonéré = TTC. JAMAIS de TVA sur l'exonéré.
//    - "Total HT taxable" = strictement la base HT soumise à TVA (exclut l'exonéré).
//    - "Total exonéré" = total des ventes exonérées.
//    - "Total TVA" = calculé exclusivement sur la base taxable HT.
//    - "Total AIB" = calculé sur le HT applicable.
//    - "Net à payer" = Total HT taxable + Total exonéré + TVA + AIB (cohérent au franc près).
// 2. Gestion automatique Bon de Commande vs Facture de Vente :
//    - CAS 1 : Compte e-MECeF non associé ou inactif -> "BON DE COMMANDE"
//      Mention de bas de page :
//      "Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande"
//    - CAS 2 : Compte e-MECeF associé et activé -> "FACTURE DE VENTE"
//      Mention de bas de page commerciale standard.
// 3. Reproduction fidèle écran <-> impression <-> téléchargement PDF (A4 & 80mm).
// =============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatFCFA } from './tax'
import { formatBeninDateTime } from './datePortoNovo'

export interface FacturationCompanyInfo {
  id?: string
  name: string
  ifu_number?: string
  rccm_number?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  logo_url?: string
  e_mecef_active?: boolean
  e_mecef_connected?: boolean
}

export interface FacturationLineItem {
  code: string
  name: string
  qty: number
  unit: string
  unitPrice: number
  discount: number
  totalLineTtc: number
  isVatSubject: boolean
  vatRate: number
  isAibSubject: boolean
  aibRate: number
  regimeFiscalLabel: string
  ht: number
  tva: number
  aib: number
}

export interface FacturationFiscalSummary {
  totalHtTaxable: number
  totalExonere: number
  totalTva: number
  totalAib: number
  netAPayer: number
  totalRegle: number
  resteAPayer: number
  ancienneDette: number
  totalRestantDu: number
  lines: FacturationLineItem[]
  hasProductWithAib: boolean
  detectedAibRate: number
}

export interface FacturationPaymentItem {
  method: string
  amount: number
}

export interface FacturationDocumentData {
  company: FacturationCompanyInfo
  sale: {
    id?: string
    order_number: string
    date: string | Date
    status?: string
    cashierName?: string
    caisseNom?: string
    table_numero?: string
    serveur_nom?: string
    couverts?: number
    is_deferred?: boolean
    isDuplicate?: boolean
  }
  customer: {
    name: string
    ifu?: string
    phone?: string
    address?: string
  }
  payments: FacturationPaymentItem[]
  summary: FacturationFiscalSummary
  documentTitle: 'BON DE COMMANDE' | 'FACTURE DE VENTE' | "FACTURE D'AVOIR" | string
  footerMessage: string
  emballages_consignes?: any[]
}

const fmt = (n: number = 0) => formatFCFA(n)

/**
 * Détermine de façon sécurisée et isolée par entreprise si le compte e-MECeF est associé et actif.
 */
export function isCompanyEmecefActive(company?: FacturationCompanyInfo | null): boolean {
  if (!company) return false
  if (typeof window !== 'undefined' && company.id) {
    const localVal = localStorage.getItem(`gestio229_emecef_active_${company.id}`)
    if (localVal === 'true') return true
    if (localVal === 'false') return false
  }
  if (company.e_mecef_active === true || company.e_mecef_connected === true) {
    return true
  }
  return false
}

/**
 * Détermine le titre officiel dynamique du document commercial.
 */
export function getDocumentTitle(company?: FacturationCompanyInfo | null, saleStatus?: string): string {
  if (saleStatus === 'AVOIR' || saleStatus === 'cancelled_avoir') {
    return "FACTURE D'AVOIR"
  }
  if (isCompanyEmecefActive(company)) {
    return 'FACTURE DE VENTE'
  }
  return 'BON DE COMMANDE'
}

/**
 * Mention de bas de page adaptée au type de document.
 * Pour Bon de Commande : consigne impérative du cahier des charges.
 */
export function getDocumentFooterMessage(company?: FacturationCompanyInfo | null, saleStatus?: string): string {
  if (saleStatus === 'AVOIR' || saleStatus === 'cancelled_avoir') {
    return "Facture d'avoir commerciale — GESTIO 229 ERP (République du Bénin)"
  }
  if (isCompanyEmecefActive(company)) {
    return `Facture commerciale émise par GESTIO 229 ERP — République du Bénin\nPour tout renseignement, veuillez contacter la Direction de ${company?.name || "l'entreprise"}.`
  }
  return 'Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande'
}

/**
 * Contrôle si un produit donné est légalement soumis à la TVA.
 */
export function isProductVatSubject(product: any): boolean {
  if (!product) return true
  // Exonération explicite prioritaire
  if (
    product.regime_fiscal === 'EXONERE' ||
    product.tax_regime === 'EXONERE' ||
    product.fiscal_regime === 'EXONERE' ||
    product.is_vat_subject === false ||
    product.is_taxable === false ||
    product.is_vat === false
  ) {
    return false
  }
  if (product.sector_meta?.is_taxable === false || product.sector_meta?.is_vat_subject === false) {
    return false
  }
  // Assujettissement explicite
  if (
    product.is_vat_subject === true ||
    product.is_taxable === true ||
    product.is_vat === true ||
    product.sector_meta?.is_taxable === true ||
    product.sector_meta?.is_vat_subject === true
  ) {
    return true
  }
  const rate = Number(product.vat_rate ?? product.tva_rate)
  if (!isNaN(rate) && rate === 0) return false
  if (!isNaN(rate) && rate > 0) return true
  // Taux légal par défaut au Bénin pour assujettis
  return true
}

/**
 * Calcule la décomposition fiscale rigoureuse de lignes d'articles et de paiements.
 */
export function computeFacturationFiscalSummary(
  lines: any[],
  payments: FacturationPaymentItem[] = [],
  debtInfo?: {
    ancienne_dette_avant_facture?: number
    credit_amount?: number
    montant_credit_actuel?: number
    montant_restant_du_global?: number
    amount_paid?: number
    total_amount?: number
  },
  options?: {
    applyAibCart?: boolean
    cartAibRate?: number
  }
): FacturationFiscalSummary {
  let totalHtTaxable = 0
  let totalExonere = 0
  let totalTva = 0
  let totalAib = 0
  let hasProductWithAib = false
  let detectedAibRate = 0

  const detailedLines: FacturationLineItem[] = (lines || []).map((item) => {
    const product = item.product || item
    const qty = Number(item.qty ?? item.quantity ?? 1) || 1
    const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.selling_price ?? product.selling_price ?? 0) || 0
    const discount = Math.max(0, Number(item.discount || 0))
    const lineTtc = Math.max(0, Math.round((qty * unitPrice - qty * discount) * 100) / 100)

    const isVat = isProductVatSubject(product)
    const vatRate = isVat ? Number(product.vat_rate ?? product.tva_rate ?? 18) : 0

    const isProdAib = Boolean(product.is_aib_subject ?? product.sector_meta?.is_aib_subject ?? false)
    if (isProdAib) hasProductWithAib = true
    const isAib = isProdAib || Boolean(options?.applyAibCart)
    const aibRate = isAib
      ? Number(product.aib_rate ?? product.sector_meta?.aib_rate ?? options?.cartAibRate ?? 1)
      : 0
    if (isAib && aibRate > detectedAibRate) {
      detectedAibRate = aibRate
    }

    const rateTvaDec = isVat ? Math.max(0, vatRate) / 100 : 0
    const rateAibDec = isAib ? Math.max(0, aibRate) / 100 : 0

    let lineHt = lineTtc
    let lineTva = 0
    let lineAib = 0

    if (rateTvaDec > 0 || rateAibDec > 0) {
      const divider = 1 + rateTvaDec + rateAibDec
      lineHt = Math.round(lineTtc / divider)
      lineTva = Math.round(lineHt * rateTvaDec)
      lineAib = Math.round(lineHt * rateAibDec)
      const diff = lineTtc - (lineHt + lineTva + lineAib)
      if (diff !== 0) {
        if (rateTvaDec > 0) lineTva += diff
        else if (rateAibDec > 0) lineAib += diff
      }
    }

    if (isVat) {
      totalHtTaxable += lineHt
      totalTva += lineTva
    } else {
      totalExonere += lineTtc
    }
    totalAib += lineAib

    return {
      code: product.code || item.code || 'ART',
      name: product.name || item.name || 'Article',
      qty,
      unit: product.unit || product.uv || item.unit || 'Pièce',
      unitPrice,
      discount,
      totalLineTtc: lineTtc,
      isVatSubject: isVat,
      vatRate: isVat ? vatRate : 0,
      isAibSubject: isAib,
      aibRate: isAib ? aibRate : 0,
      regimeFiscalLabel: isVat ? `Taxable (${vatRate}%)` : 'Exonéré',
      ht: lineHt,
      tva: lineTva,
      aib: lineAib,
    }
  })

  // Net à payer réel garanti égal à la somme des lignes TTC
  const netAPayer = Math.round((totalHtTaxable + totalExonere + totalTva + totalAib) * 100) / 100

  // Calcul règlements et restes
  const totalRegleFromPayments = (payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const totalRegle = debtInfo?.amount_paid !== undefined
    ? Number(debtInfo.amount_paid)
    : totalRegleFromPayments > 0
    ? totalRegleFromPayments
    : netAPayer

  const ancienneDette = Number(debtInfo?.ancienne_dette_avant_facture || 0)
  const creditActuel = debtInfo?.credit_amount !== undefined
    ? Number(debtInfo.credit_amount)
    : debtInfo?.montant_credit_actuel !== undefined
    ? Number(debtInfo.montant_credit_actuel)
    : Math.max(0, netAPayer - totalRegle)

  const resteAPayer = Math.max(0, netAPayer - totalRegle)
  const totalRestantDu = debtInfo?.montant_restant_du_global !== undefined
    ? Number(debtInfo.montant_restant_du_global)
    : (ancienneDette + creditActuel)

  return {
    totalHtTaxable: Math.round(totalHtTaxable * 100) / 100,
    totalExonere: Math.round(totalExonere * 100) / 100,
    totalTva: Math.round(totalTva * 100) / 100,
    totalAib: Math.round(totalAib * 100) / 100,
    netAPayer,
    totalRegle: Math.round(totalRegle * 100) / 100,
    resteAPayer: Math.round(resteAPayer * 100) / 100,
    ancienneDette: Math.round(ancienneDette * 100) / 100,
    totalRestantDu: Math.round(totalRestantDu * 100) / 100,
    lines: detailedLines,
    hasProductWithAib,
    detectedAibRate: detectedAibRate || options?.cartAibRate || 1,
  }
}

/**
 * Générateur PDF Professionnel A4 fidèle à l'affichage écran GESTIO 229.
 */
export function generateFactureA4Pdf(data: FacturationDocumentData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  let y = margin

  const isBon = data.documentTitle.includes('BON DE COMMANDE')
  const isAvoir = data.documentTitle.includes('AVOIR')

  // Couleurs de marque : Vert émeraude pour facture, Ambre/Indigo pour Bon de commande, Rose pour Avoir
  const brandColor: [number, number, number] = isAvoir
    ? [225, 29, 72] // Rose/Rouge
    : isBon
    ? [79, 70, 229] // Indigo
    : [5, 150, 105] // Emerald 600

  // 1. Bandeau supérieur d'accentuation
  doc.setFillColor(...brandColor)
  doc.rect(margin, y, pageWidth - 2 * margin, 2.5, 'F')
  y += 7

  // 2. Bloc En-tête Entreprise (Gauche) & Document Info (Droite)
  const headerStartY = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(15, 23, 42)
  doc.text((data.company.name || 'GESTIO 229 ERP').toUpperCase(), margin, y + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text(`IFU : ${data.company.ifu_number || 'Non renseigné'}  |  RCCM : ${data.company.rccm_number || 'Non renseigné'}`, margin, y + 10)
  doc.text(`${data.company.address ? `${data.company.address}, ` : ''}${data.company.city || 'Cotonou, République du Bénin'}`, margin, y + 14.5)
  doc.text(`Tél : ${data.company.phone || '+229 01 00 00 00'}  |  Email : ${data.company.email || 'contact@gestio229.bj'}`, margin, y + 19)

  // Bloc Document Info (Droite)
  const rightColX = 130
  doc.setFillColor(...brandColor)
  doc.roundedRect(rightColX, headerStartY - 1, pageWidth - margin - rightColX, 8, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(255, 255, 255)
  doc.text(data.documentTitle, (rightColX + pageWidth - margin) / 2, headerStartY + 4.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(`N° : ${data.sale.order_number}`, rightColX, headerStartY + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  const dateStr = formatBeninDateTime(data.sale.date)
  doc.text(`Date : ${dateStr}`, rightColX, headerStartY + 17.5)
  doc.text(`Caisse : ${data.sale.caisseNom || 'Caisse Principale POS'}`, rightColX, headerStartY + 22)
  if (data.sale.table_numero) {
    doc.text(`Table : ${data.sale.table_numero}${data.sale.serveur_nom ? ` (${data.sale.serveur_nom})` : ''}`, rightColX, headerStartY + 26.5)
  }

  y = headerStartY + 30
  doc.setDrawColor(226, 232, 240)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // 3. Bloc Client
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 18, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('FACTURÉ À / CLIENT :', margin + 4, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  const clientNameA4 = data.sale.table_numero
    ? (data.sale.table_numero.toLowerCase().startsWith('table') ? data.sale.table_numero : `Table ${data.sale.table_numero}`)
    : (data.customer.name || 'Client Comptoir')
  doc.text(clientNameA4, margin + 4, y + 11)

  if (data.sale.serveur_nom) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(190, 24, 93)
    doc.text(`SERVEUR RESPONSABLE : ${data.sale.serveur_nom}`, margin + 4, y + 15.5)
  }

  if (data.customer.ifu) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 116, 139)
    doc.text(`N° IFU : ${data.customer.ifu}`, rightColX, y + 11)
  }
  y += 21

  // 4. Tableau des Lignes avec colonne Régime fiscal
  const tableBody = data.summary.lines.map((line) => [
    line.code,
    line.name,
    String(line.qty),
    line.unit,
    fmt(line.unitPrice),
    line.regimeFiscalLabel,
    fmt(line.totalLineTtc),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Réf', 'Désignation', 'Qté', 'Unité', 'Prix Unit. TTC', 'Régime fiscal', 'Total TTC']],
    body: tableBody,
    theme: 'striped',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: brandColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'center', cellWidth: 28 },
      6: { halign: 'right', cellWidth: 28 },
    },
  })

  let finalY = (doc as any).lastAutoTable.finalY + 6
  if (finalY > pageHeight - 65) {
    doc.addPage()
    finalY = margin + 10
  }

  // 5. Bloc Règlements (Gauche) & Récapitulatif Fiscal (Droite)
  const leftX = margin
  const rightX = 125
  const rightWidth = pageWidth - margin - rightX

  // Règlements (Gauche)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(leftX, finalY, rightX - leftX - 6, 44, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text('RÈGLEMENTS EFFECTUÉS :', leftX + 4, finalY + 5.5)

  let payY = finalY + 11
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)

  const activePayments = (data.payments || []).filter((p) => Number(p.amount) > 0)
  if (activePayments.length > 0) {
    activePayments.forEach((p) => {
      const modeLabel = p.method.replace('_', ' ').toUpperCase()
      doc.text(`• ${modeLabel} :`, leftX + 4, payY)
      doc.text(fmt(p.amount), rightX - 10, payY, { align: 'right' })
      payY += 4.5
    })
  } else {
    doc.text(`• Règlement comptant :`, leftX + 4, payY)
    doc.text(fmt(data.summary.totalRegle), rightX - 10, payY, { align: 'right' })
    payY += 4.5
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Total réglé :', leftX + 4, payY + 1)
  doc.text(fmt(data.summary.totalRegle), rightX - 10, payY + 1, { align: 'right' })
  payY += 6

  if (data.summary.resteAPayer > 0 || data.summary.ancienneDette > 0) {
    doc.setTextColor(225, 29, 72)
    doc.setFont('helvetica', 'bold')
    if (data.summary.resteAPayer > 0) {
      doc.text('• Reste à payer (crédit) :', leftX + 4, payY)
      doc.text(fmt(data.summary.resteAPayer), rightX - 10, payY, { align: 'right' })
      payY += 4.5
    }
    if (data.summary.ancienneDette > 0) {
      doc.text('• Dette antérieure :', leftX + 4, payY)
      doc.text(fmt(data.summary.ancienneDette), rightX - 10, payY, { align: 'right' })
      payY += 4.5
    }
    doc.text('• TOTAL RESTANT DÛ :', leftX + 4, payY)
    doc.text(fmt(data.summary.totalRestantDu), rightX - 10, payY, { align: 'right' })
  }

  // Récapitulatif Fiscal (Droite)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(rightX, finalY, rightWidth, 44, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105)

  let totY = finalY + 6
  doc.text('Total HT taxable :', rightX + 4, totY)
  doc.setFont('helvetica', 'bold')
  doc.text(fmt(data.summary.totalHtTaxable), pageWidth - margin - 4, totY, { align: 'right' })

  totY += 5.5
  doc.setFont('helvetica', 'normal')
  doc.text('Total exonéré :', rightX + 4, totY)
  doc.setFont('helvetica', 'bold')
  doc.text(fmt(data.summary.totalExonere), pageWidth - margin - 4, totY, { align: 'right' })

  totY += 5.5
  doc.setFont('helvetica', 'normal')
  doc.text('Total TVA (18%) :', rightX + 4, totY)
  doc.setFont('helvetica', 'bold')
  doc.text(fmt(data.summary.totalTva), pageWidth - margin - 4, totY, { align: 'right' })

  if (data.summary.totalAib > 0) {
    totY += 5.5
    doc.setFont('helvetica', 'normal')
    doc.text('Total AIB :', rightX + 4, totY)
    doc.setFont('helvetica', 'bold')
    doc.text(fmt(data.summary.totalAib), pageWidth - margin - 4, totY, { align: 'right' })
  }

  totY += 7
  doc.setDrawColor(203, 213, 225)
  doc.line(rightX + 4, totY - 2, pageWidth - margin - 4, totY - 2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(15, 23, 42)
  doc.text('NET À PAYER :', rightX + 4, totY + 3.5)
  doc.setTextColor(...brandColor)
  doc.text(fmt(data.summary.netAPayer), pageWidth - margin - 4, totY + 3.5, { align: 'right' })

  // 6. Pied de Document
  const footerY = Math.max(finalY + 52, pageHeight - 24)
  doc.setDrawColor(226, 232, 240)
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

  if (isBon) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(79, 70, 229)
    doc.text(
      'Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande',
      pageWidth / 2,
      footerY,
      { align: 'center' }
    )
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Document émis par GESTIO 229 ERP — ${data.company.name || 'Entreprise'} • Tél : ${data.company.phone || ''}`,
      pageWidth / 2,
      footerY + 4.5,
      { align: 'center' }
    )
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text('Facture commerciale émise par GESTIO 229 ERP — République du Bénin', pageWidth / 2, footerY, {
      align: 'center',
    })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Pour tout renseignement, veuillez contacter la Direction de ${data.company.name || "l'entreprise"}.`,
      pageWidth / 2,
      footerY + 4.5,
      { align: 'center' }
    )
  }

  return doc
}

/**
 * Générateur PDF Ticket Thermique 80mm fidèle et complet.
 */
export function generateTicket80Pdf(data: FacturationDocumentData): jsPDF {
  const nbLignes = data.summary.lines.length
  const hauteurMm = Math.max(160, 110 + nbLignes * 12 + (data.payments?.length || 1) * 6)
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, hauteurMm],
  })

  let y = 7
  doc.setFont('courier', 'bold')
  doc.setFontSize(11)
  doc.text((data.company.name || 'GESTIO 229').toUpperCase(), 40, y, { align: 'center' })
  y += 4

  doc.setFontSize(7.5)
  doc.setFont('courier', 'normal')
  if (data.company.address) {
    doc.text(`${data.company.address}, ${data.company.city || 'Bénin'}`, 40, y, { align: 'center' })
    y += 3.5
  }
  doc.text(`IFU : ${data.company.ifu_number || 'Non renseigné'}`, 40, y, { align: 'center' })
  y += 3.5
  if (data.company.phone) {
    doc.text(`Tél : ${data.company.phone}`, 40, y, { align: 'center' })
    y += 3.5
  }

  doc.setLineDashPattern([1, 1], 0)
  doc.line(4, y, 76, y)
  y += 4

  doc.setFont('courier', 'bold')
  doc.setFontSize(8.5)
  doc.text(data.documentTitle, 40, y, { align: 'center' })
  y += 4

  doc.setFontSize(7.5)
  doc.setFont('courier', 'normal')
  doc.text(`N° : ${data.sale.order_number}`, 4, y)
  y += 3.5
  doc.text(`Date : ${formatBeninDateTime(data.sale.date)}`, 4, y)
  y += 3.5
  const clientDisplay80 = data.sale.table_numero
    ? (data.sale.table_numero.toLowerCase().startsWith('table') ? data.sale.table_numero : `Table ${data.sale.table_numero}`)
    : (data.customer.name || 'Client Comptoir')
  doc.text(`CLIENT : ${clientDisplay80}`, 4, y)
  if (data.sale.serveur_nom) {
    y += 3.5
    doc.text(`SERVEUR RESPONSABLE : ${data.sale.serveur_nom}`, 4, y)
  }
  if (data.customer.ifu) {
    y += 3.5
    doc.text(`IFU Client : ${data.customer.ifu}`, 4, y)
  }
  y += 4

  doc.line(4, y, 76, y)
  y += 4

  // Articles
  data.summary.lines.forEach((l) => {
    doc.setFont('courier', 'bold')
    doc.text(l.name.slice(0, 30), 4, y)
    y += 3
    doc.setFont('courier', 'normal')
    doc.text(`${l.qty} ${l.unit} x ${fmt(l.unitPrice)} [${l.regimeFiscalLabel}]`, 4, y)
    doc.text(fmt(l.totalLineTtc), 76, y, { align: 'right' })
    y += 3.5
  })

  doc.line(4, y, 76, y)
  y += 4

  // Totaux Fiscaux
  doc.text('Total HT taxable :', 4, y)
  doc.text(fmt(data.summary.totalHtTaxable), 76, y, { align: 'right' })
  y += 3.5

  if (data.summary.totalExonere > 0) {
    doc.text('Total exonéré :', 4, y)
    doc.text(fmt(data.summary.totalExonere), 76, y, { align: 'right' })
    y += 3.5
  }

  doc.text('Total TVA (18%) :', 4, y)
  doc.text(fmt(data.summary.totalTva), 76, y, { align: 'right' })
  y += 3.5

  if (data.summary.totalAib > 0) {
    doc.text('Total AIB :', 4, y)
    doc.text(fmt(data.summary.totalAib), 76, y, { align: 'right' })
    y += 3.5
  }

  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  doc.text('NET À PAYER :', 4, y)
  doc.text(fmt(data.summary.netAPayer), 76, y, { align: 'right' })
  y += 4.5

  doc.setFontSize(7.5)
  doc.setFont('courier', 'normal')
  doc.line(4, y, 76, y)
  y += 4

  // Règlements
  doc.text('Total réglé :', 4, y)
  doc.text(fmt(data.summary.totalRegle), 76, y, { align: 'right' })
  y += 3.5

  if (data.summary.resteAPayer > 0 || data.summary.ancienneDette > 0) {
    if (data.summary.resteAPayer > 0) {
      doc.text('Reste à payer :', 4, y)
      doc.text(fmt(data.summary.resteAPayer), 76, y, { align: 'right' })
      y += 3.5
    }
    if (data.summary.ancienneDette > 0) {
      doc.text('Dette antérieure :', 4, y)
      doc.text(fmt(data.summary.ancienneDette), 76, y, { align: 'right' })
      y += 3.5
    }
    doc.setFont('courier', 'bold')
    doc.text('TOTAL RESTANT DÛ :', 4, y)
    doc.text(fmt(data.summary.totalRestantDu), 76, y, { align: 'right' })
    doc.setFont('courier', 'normal')
    y += 4
  }

  doc.line(4, y, 76, y)
  y += 4.5

  doc.setFontSize(7)
  const isBon = data.documentTitle.includes('BON DE COMMANDE')
  if (isBon) {
    doc.setFont('courier', 'bold')
    doc.text('Merci de passer à la caisse pour obtenir', 40, y, { align: 'center' })
    y += 3
    doc.text('votre facture normalisée après validation', 40, y, { align: 'center' })
  } else {
    doc.text('Facture commerciale — GESTIO 229 ERP', 40, y, { align: 'center' })
    y += 3
    doc.text('Merci pour votre visite !', 40, y, { align: 'center' })
  }

  return doc
}

/**
 * Lance le téléchargement direct du PDF approprié (A4 ou Ticket 80mm).
 */
export function downloadFacturePdf(
  data: FacturationDocumentData,
  format: 'a4' | 'ticket80' = 'a4',
  fileName?: string
): void {
  const doc = format === 'ticket80' ? generateTicket80Pdf(data) : generateFactureA4Pdf(data)
  const isBon = data.documentTitle.includes('BON DE COMMANDE')
  const defaultName = isBon
    ? `Bon_de_Commande_${data.sale.order_number}.pdf`
    : `Facture_${data.sale.order_number}.pdf`
  doc.save(fileName || defaultName)
}
