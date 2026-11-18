// =============================================================================
// GESTIO 229 SaaS — Générateur PDF Officiel de Bulletin de Paie (Bénin & UEMOA)
// Format A4 Standard Professionnel, Conforme CNSS Bénin & Code du Travail
// =============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface BulletinPaiePdfData {
  slipNumber: string
  periodMonth: string
  periodYear: number
  companyName: string
  companyIfu?: string
  companyRccm?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  employeeName: string
  jobTitle: string
  cnssNumber: string
  sectorName?: string
  hireDate?: string
  baseSalary: number
  transportAllowance: number
  housingAllowance: number
  bonus: number
  grossSalary: number
  cnssSalariale: number
  cnssPatronale: number
  vpsBenin: number
  netBeforeDeductions: number
  advancePayment: number
  loanDeduction: number
  otherDeductions: number
  netSalary: number
  totalEmployerCost: number
}

const fmt = (n: number = 0) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

export function generateBulletinPaiePDF(data: BulletinPaiePdfData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  })

  const pageWidth = 210
  const margin = 14
  const contentWidth = pageWidth - margin * 2

  // ─── 1. EN-TÊTE ENTREPRISE & TITRE ─────────────────────────────────────────
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(margin, 12, contentWidth, 2, 'F')

  // Nom Entreprise
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text((data.companyName || 'ENTREPRISE GESTIO 229').toUpperCase(), margin, 20)

  // Coordonnées Légales Entreprise
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  const ifuText = `N° IFU : ${data.companyIfu || '0202618902891'}   |   RCCM : ${data.companyRccm || 'RB/COT/26-B-001'}`
  doc.text(ifuText, margin, 25)
  const addrText = `Siège : ${data.companyAddress || 'Cotonou, République du Bénin'}${data.companyPhone ? `  - Tél: ${data.companyPhone}` : ''}`
  doc.text(addrText, margin, 29)

  // Badge BULLETIN DE PAIE
  doc.setFillColor(240, 253, 244) // Emerald 50
  doc.setDrawColor(22, 163, 74) // Emerald 600
  doc.roundedRect(pageWidth - margin - 60, 15, 60, 16, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(22, 101, 52) // Emerald 800
  doc.text('BULLETIN DE PAIE', pageWidth - margin - 30, 21, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(`N° ${data.slipNumber}`, pageWidth - margin - 30, 25.5, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(`Période : ${data.periodMonth}`, pageWidth - margin - 30, 29, { align: 'center' })

  // ─── 2. BLOCS INFORMATIONS SALARIÉ & EMPLOI ────────────────────────────────
  const blockY = 35
  const colWidth = (contentWidth - 4) / 2

  // Cadre gauche : Salarié
  doc.setFillColor(248, 250, 252) // Slate 50
  doc.setDrawColor(226, 232, 240) // Slate 200
  doc.roundedRect(margin, blockY, colWidth, 24, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text('IDENTIFICATION DU SALARIÉ', margin + 3, blockY + 5)

  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text(data.employeeName, margin + 3, blockY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text(`Poste / Fonction : ${data.jobTitle}`, margin + 3, blockY + 16)
  if (data.sectorName) {
    doc.text(`Secteur d'activité : ${data.sectorName}`, margin + 3, blockY + 20.5)
  }

  // Cadre droit : Sécurité Sociale & Contrat
  doc.roundedRect(margin + colWidth + 4, blockY, colWidth, 24, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text('RÉGIME SOCIAL & LÉGAL', margin + colWidth + 7, blockY + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(`N° CNSS Bénin : ${data.cnssNumber || 'En cours'}`, margin + colWidth + 7, blockY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text('Convention : Commerce & Services (Bénin)', margin + colWidth + 7, blockY + 16)
  doc.text(`Date embauche : ${data.hireDate || 'Non spécifiée'}`, margin + colWidth + 7, blockY + 20.5)

  // ─── 3. TABLEAU DES ÉLÉMENTS DE PAIE ───────────────────────────────────────
  const tableRows: any[] = []

  // Rémunération de base
  tableRows.push(['Salaire de base conventionnel', fmt(data.baseSalary), '-', '-'])

  if (data.transportAllowance > 0) {
    tableRows.push(['Indemnité légale de transport', fmt(data.transportAllowance), '-', '-'])
  }
  if (data.housingAllowance > 0) {
    tableRows.push(['Indemnité de logement', fmt(data.housingAllowance), '-', '-'])
  }
  if (data.bonus > 0) {
    tableRows.push(['Primes diverses / Assiduité & Rendement', fmt(data.bonus), '-', '-'])
  }

  // Brut
  tableRows.push([
    { content: 'SALAIRE BRUT IMPOSABLE', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: fmt(data.grossSalary), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: '-', styles: { fillColor: [241, 245, 249] } },
    { content: '-', styles: { fillColor: [241, 245, 249] } },
  ])

  // Cotisations et Charges
  tableRows.push([
    'Cotisation CNSS Régime Général (3.6% part salariale)',
    '-',
    fmt(data.cnssSalariale),
    `${fmt(data.cnssPatronale)} (16.4%)`,
  ])
  tableRows.push([
    'Versement Patronal sur Salaires (VPS Bénin 4%)',
    '-',
    '-',
    fmt(data.vpsBenin),
  ])

  // Salaire Net avant déductions
  tableRows.push([
    { content: 'SALAIRE NET AVANT REMBOURSEMENTS', styles: { fontStyle: 'bold', textColor: [30, 41, 59] } },
    { content: '-', styles: {} },
    { content: fmt(data.netBeforeDeductions), styles: { fontStyle: 'bold', textColor: [30, 41, 59] } },
    { content: '-', styles: {} },
  ])

  // Retenues pour Avances et Prêts
  if (data.advancePayment > 0) {
    tableRows.push([
      'Retenue sur salaire : Remboursement Avance sur salaire',
      '-',
      `- ${fmt(data.advancePayment)}`,
      '-',
    ])
  }
  if (data.loanDeduction > 0) {
    tableRows.push([
      'Retenue sur salaire : Remboursement Prêt au personnel',
      '-',
      `- ${fmt(data.loanDeduction)}`,
      '-',
    ])
  }
  if (data.otherDeductions > 0) {
    tableRows.push([
      'Autres retenues et saisies sur salaire',
      '-',
      `- ${fmt(data.otherDeductions)}`,
      '-',
    ])
  }

  autoTable(doc, {
    startY: 63,
    margin: { left: margin, right: margin },
    head: [['Désignation des Éléments de Rémunération', 'Gains / Base', 'Retenues Salariales', 'Charges Patronales']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 84 },
      1: { cellWidth: 32, halign: 'right' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
    },
  })

  let finalY = (doc as any).lastAutoTable?.finalY || 160

  // ─── 4. BLOC NET À PAYER ───────────────────────────────────────────────────
  const netBoxY = Math.min(finalY + 4, 215)
  doc.setFillColor(236, 253, 245) // Emerald 50
  doc.setDrawColor(16, 185, 129) // Emerald 500
  doc.roundedRect(margin, netBoxY, contentWidth, 18, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(6, 95, 70)
  doc.text('NET À PAYER AU SALARIÉ (FCFA)', margin + 4, netBoxY + 6.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text('Payable par virement bancaire, chèque ou Mobile Money', margin + 4, netBoxY + 12)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(6, 78, 59)
  doc.text(fmt(data.netSalary), pageWidth - margin - 4, netBoxY + 11.5, { align: 'right' })

  // ─── 5. SIGNATURES & MENTIONS LÉGALES ──────────────────────────────────────
  const signY = Math.min(netBoxY + 24, 245)
  const signWidth = (contentWidth - 10) / 2

  // Signature Salarié
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(margin, signY, signWidth, 24, 1.5, 1.5, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text("Signature de l'Employé(e)", margin + 4, signY + 5)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text('(Précédée de la mention manuscrite "Lu et approuvé")', margin + 4, signY + 9)

  // Signature Employeur
  doc.roundedRect(margin + signWidth + 10, signY, signWidth, 24, 1.5, 1.5, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text('Pour la Direction & Administration', margin + signWidth + 14, signY + 5)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text('(Cachet officiel et signature de l\'employeur)', margin + signWidth + 14, signY + 9)

  // ─── 6. PIED DE PAGE LÉGAL ────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text(
    'Bulletin édité électroniquement par GESTIO 229 SaaS — Conserver sans limitation de durée conformément au Code du Travail de la République du Bénin.',
    pageWidth / 2,
    285,
    { align: 'center' }
  )

  return doc
}
