// =============================================================================
// GESTIO 229 SaaS — Rapport Mensuel de Paie & Rentabilité par Secteur (PDF)
// =============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface SectorPayrollSummary {
  sectorSlug: string
  sectorName: string
  headcount: number
  totalNetSalaries: number
  totalEmployerCharges: number
  totalStaffExpenses: number
  activeAdvancesBalance: number
  activeLoansBalance: number
  sectorGrossMargin: number
  sectorExpensesHorsRH: number
  sectorNetMargin: number
  profitabilityRate: number
}

export interface RapportPaieRentabilitePdfData {
  companyName: string
  companyIfu?: string
  companyRccm?: string
  periodMonth: string
  periodYear: number
  sectors: SectorPayrollSummary[]
  employees: Array<{
    name: string
    jobTitle: string
    sectorName: string
    baseSalary: number
    netSalary: number
    advanceBalance: number
    loanBalance: number
  }>
}

const fmt = (n: number = 0) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

export function generateRapportPaieRentabilitePDF(data: RapportPaieRentabilitePdfData): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4', // 297 x 210 mm
  })

  const pageWidth = 297
  const margin = 12
  const contentWidth = pageWidth - margin * 2

  // ─── En-tête ───────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42)
  doc.rect(margin, 10, contentWidth, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text((data.companyName || 'ENTREPRISE GESTIO 229').toUpperCase(), margin, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text(`IFU : ${data.companyIfu || '0202618902891'}   |   RCCM : ${data.companyRccm || 'RB/COT/26-B-001'}`, margin, 23)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(5, 150, 105) // Emerald 600
  doc.text(`RAPPORT DE PAIE, CHARGES RH & RENTABILITÉ PAR SECTEUR — ${data.periodMonth} ${data.periodYear}`, pageWidth - margin, 18, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-BJ')} | Isolation stricte par activité & tenant`, pageWidth - margin, 23, { align: 'right' })

  // ─── Tableau 1 : Synthèse par Secteur d'Activité ────────────────────────────
  const tableRows: any[] = data.sectors.map((s) => [
    s.sectorName,
    s.headcount,
    fmt(s.totalNetSalaries),
    fmt(s.totalEmployerCharges),
    fmt(s.totalStaffExpenses),
    fmt(s.activeAdvancesBalance),
    fmt(s.activeLoansBalance),
    fmt(s.sectorExpensesHorsRH),
    fmt(s.sectorGrossMargin),
    fmt(s.sectorNetMargin),
    `${s.profitabilityRate.toFixed(1)}%`,
  ])

  // Totaux consolidés
  const totHeadcount = data.sectors.reduce((acc, s) => acc + s.headcount, 0)
  const totNetSal = data.sectors.reduce((acc, s) => acc + s.totalNetSalaries, 0)
  const totCharges = data.sectors.reduce((acc, s) => acc + s.totalEmployerCharges, 0)
  const totStaff = data.sectors.reduce((acc, s) => acc + s.totalStaffExpenses, 0)
  const totAdv = data.sectors.reduce((acc, s) => acc + s.activeAdvancesBalance, 0)
  const totLoans = data.sectors.reduce((acc, s) => acc + s.activeLoansBalance, 0)
  const totExpHorsRH = data.sectors.reduce((acc, s) => acc + s.sectorExpensesHorsRH, 0)
  const totGross = data.sectors.reduce((acc, s) => acc + s.sectorGrossMargin, 0)
  const totNet = data.sectors.reduce((acc, s) => acc + s.sectorNetMargin, 0)

  tableRows.push([
    { content: 'TOTAL CONSOLIDÉ', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: totHeadcount, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totNetSal), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totCharges), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totStaff), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totAdv), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totLoans), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totExpHorsRH), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totGross), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(totNet), styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: totNet >= 0 ? [5, 150, 105] : [225, 29, 72] } },
    { content: totGross > 0 ? `${((totNet / totGross) * 100).toFixed(1)}%` : '-', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
  ])

  autoTable(doc, {
    startY: 28,
    margin: { left: margin, right: margin },
    head: [[
      "Secteur d'activité",
      'Eff.',
      'Salaires Nets',
      'Charges Patron.',
      'Total RH',
      'Avances Dues',
      'Prêts Dus',
      'Dépenses Hors RH',
      'Marge Brute',
      'Marge Nette',
      'Taux Rent.',
    ]],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
      8: { cellWidth: 26, halign: 'right' },
      9: { cellWidth: 27, halign: 'right', fontStyle: 'bold' },
      10: { cellWidth: 18, halign: 'center' },
    },
  })

  let finalY = (doc as any).lastAutoTable?.finalY || 100

  // ─── Formule Rappel Légal ──────────────────────────────────────────────────
  if (finalY < 185) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(
      'Formule appliquée : MARGE NETTE DU SECTEUR = MARGE BRUTE DU SECTEUR – DÉPENSES DU SECTEUR HORS RH – TOTAL SALAIRES NETS – CHARGES PATRONALES (CNSS + VPS).',
      margin,
      finalY + 6
    )
    doc.text(
      'Note : Les remboursements de prêts et d\'avances constituent des règlements de créances sur le personnel et ne sont jamais imputés comme des charges d\'exploitation.',
      margin,
      finalY + 10
    )
  }

  return doc
}
