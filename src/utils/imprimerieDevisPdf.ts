// =============================================================================
// GESTIO 229 SaaS — Générateur PDF A4 Professionnel : Devis Imprimerie & Sérigraphie
// Conforme normes fiscales UEMOA / Bénin (HT, TVA paramétrable, AIB, Net TTC)
// RÈGLE ABSOLUE : Exclut strictement les notes internes du document client.
// =============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { DevisImprimerie, DevisLigne } from '../services/imprimerieService'
import { formatFCFA } from './tax'

export interface DevisCompanyInfo {
  name: string
  address?: string
  city?: string
  phone?: string
  email?: string
  ifu?: string
  rccm?: string
  logo_url?: string
}

export function generateDevisPdf(
  devis: DevisImprimerie,
  company: DevisCompanyInfo,
  options?: { action?: 'download' | 'preview' | 'print' }
): { doc: jsPDF; fileName: string; blobUrl: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14

  // ── Palette Couleurs Professionnelle ──
  const primaryColor: [number, number, number] = [15, 23, 42]     // Slate 900 (Élégant, pro)
  const accentColor: [number, number, number] = [190, 24, 93]     // Pink 700 (Couleur identitaire Imprimerie)
  const secondaryColor: [number, number, number] = [71, 85, 105]  // Slate 600
  const lightBg: [number, number, number] = [248, 250, 252]       // Slate 50
  const borderColor: [number, number, number] = [226, 232, 240]   // Slate 200

  // ── 1. EN-TÊTE ENTREPRISE ──
  let y = margin

  // Bandeau supérieur accentué
  doc.setFillColor(...accentColor)
  doc.rect(margin, y, pageWidth - 2 * margin, 2, 'F')
  y += 6

  // Nom de l'entreprise
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...primaryColor)
  const companyName = (company.name || 'GESTIO 229 IMPRIMERIE').toUpperCase()
  doc.text(companyName, margin, y + 4)

  // Titre du document (à droite)
  doc.setFontSize(18)
  doc.setTextColor(...accentColor)
  doc.text('DEVIS', pageWidth - margin, y + 4, { align: 'right' })

  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...secondaryColor)

  // Coordonnées entreprise (à gauche)
  const compDetails: string[] = []
  if (company.address || company.city) compDetails.push(`${company.address || ''} ${company.city || ''}`.trim())
  if (company.phone) compDetails.push(`Tél : ${company.phone}`)
  if (company.email) compDetails.push(`Email : ${company.email}`)
  if (company.ifu) compDetails.push(`N° IFU : ${company.ifu}`)
  if (company.rccm) compDetails.push(`RCCM : ${company.rccm}`)

  let leftY = y
  compDetails.forEach((line) => {
    doc.text(line, margin, leftY)
    leftY += 4
  })

  // Métadonnées du Devis (à droite)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...primaryColor)
  doc.text(`N° : ${devis.numero_devis}`, pageWidth - margin, y, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...secondaryColor)
  doc.text(`Date d'émission : ${devis.date_devis || new Date().toISOString().slice(0, 10)}`, pageWidth - margin, y + 4.5, { align: 'right' })
  doc.text(`Validité : ${devis.date_validite || '15 jours'}`, pageWidth - margin, y + 9, { align: 'right' })
  if (devis.commercial_nom) {
    doc.text(`Établi par : ${devis.commercial_nom}`, pageWidth - margin, y + 13.5, { align: 'right' })
  }

  y = Math.max(leftY, y + 18) + 4

  // ── 2. CARTOUCHE CLIENT ──
  const clientBoxY = y
  const clientBoxHeight = 22

  doc.setFillColor(...lightBg)
  doc.setDrawColor(...borderColor)
  doc.roundedRect(margin, clientBoxY, pageWidth - 2 * margin, clientBoxHeight, 2, 2, 'FD')

  // En-tête cartouche client
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...accentColor)
  doc.text('CLIENT / DESTINATAIRE', margin + 4, clientBoxY + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...primaryColor)
  doc.text(devis.client_nom || 'Client Comptoir', margin + 4, clientBoxY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...secondaryColor)
  if (devis.client_tel) {
    doc.text(`Tél : ${devis.client_tel}`, margin + 4, clientBoxY + 16)
  }
  if (devis.client_email) {
    doc.text(`Email : ${devis.client_email}`, margin + 70, clientBoxY + 16)
  }

  y = clientBoxY + clientBoxHeight + 6

  // ── 3. TABLEAU DES PRESTATIONS & TRAVAUX ──
  const tableRows = (devis.lignes || []).map((l: DevisLigne, idx: number) => {
    const details = l.details_json || {}
    const isM2 = l.mode_calcul === 'm2'
    const surface = Number(l.surface_m2 || 0)
    const pu = Number(l.prix_unitaire || 0)
    const qty = Number(l.quantite || 1)
    const mo = Number(l.main_doeuvre || details.main_doeuvre || 0)
    const tvaPct = Number(l.tva_pct || 0)
    const ht = Number(l.montant_ht || 0)
    const ttc = Number(l.montant_ttc || 0)

    let dimText = '-'
    if (isM2) {
      dimText = `${Number(l.largeur || 0).toFixed(2)}m × ${Number(l.hauteur || 0).toFixed(2)}m (${surface.toFixed(2)} m²)`
    } else if (l.mode_calcul === 'heure') {
      dimText = 'À l\'heure'
    } else if (l.mode_calcul === 'forfait') {
      dimText = 'Forfait'
    } else {
      dimText = 'À l\'unité'
    }

    return [
      String(idx + 1),
      l.designation || 'Prestation d\'impression',
      dimText,
      String(qty),
      formatFCFA(pu).replace(' FCFA', ''),
      mo > 0 ? formatFCFA(mo).replace(' FCFA', '') : '-',
      tvaPct > 0 ? `${tvaPct}%` : 'Exo',
      formatFCFA(ht).replace(' FCFA', ''),
      formatFCFA(ttc).replace(' FCFA', ''),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [[
      '#',
      'Désignation de la prestation',
      'Format / Dimensions',
      'Qté',
      'P.U. (F)',
      'M.O. (F)',
      'TVA',
      'Total HT (F)',
      'Total TTC (F)',
    ]],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      cellPadding: 2.5,
    },
    styles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2.5,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 50 },
      2: { halign: 'center', cellWidth: 32 },
      3: { halign: 'center', cellWidth: 10 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 15 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'right', cellWidth: 20 },
      8: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 6

  // ── 4. BLOC DES TOTAUX (À DROITE) ──
  const totalsBoxWidth = 80
  const totalsBoxX = pageWidth - margin - totalsBoxWidth
  let curTotalsY = finalY

  // Calculs précis
  const totalHt = Number(devis.total_ht || 0)
  const totalTva = Number(devis.total_tva || 0)
  const totalTtc = Number(devis.total_ttc || 0)

  // Cadre des totaux
  doc.setFillColor(...lightBg)
  doc.setDrawColor(...borderColor)
  doc.roundedRect(totalsBoxX, curTotalsY, totalsBoxWidth, 26, 2, 2, 'FD')

  doc.setFontSize(8.5)
  doc.setTextColor(...secondaryColor)
  doc.text('Total HT :', totalsBoxX + 4, curTotalsY + 6)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text(formatFCFA(totalHt), pageWidth - margin - 4, curTotalsY + 6, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...secondaryColor)
  doc.text('Total TVA :', totalsBoxX + 4, curTotalsY + 12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text(formatFCFA(totalTva), pageWidth - margin - 4, curTotalsY + 12, { align: 'right' })

  // Ligne de séparation
  doc.setDrawColor(...borderColor)
  doc.line(totalsBoxX + 2, curTotalsY + 16, pageWidth - margin - 2, curTotalsY + 16)

  // Total Net TTC
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...accentColor)
  doc.text('NET À PAYER TTC :', totalsBoxX + 4, curTotalsY + 22)
  doc.text(formatFCFA(totalTtc), pageWidth - margin - 4, curTotalsY + 22, { align: 'right' })

  // ── 5. CONDITIONS COMMERCIALES & MENTIONS (À GAUCHE) ──
  const conditionsX = margin
  const conditionsWidth = totalsBoxX - margin - 6
  let condY = finalY + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...primaryColor)
  doc.text('CONDITIONS ET MODALITÉS', conditionsX, condY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...secondaryColor)
  condY += 4
  doc.text('• Modalités de paiement : Acompte 50% à la validation du BAT, solde à la livraison.', conditionsX, condY)
  condY += 3.5
  doc.text('• Validité de l\'offre : 15 jours calendaires à compter de la date d\'émission.', conditionsX, condY)
  condY += 3.5
  doc.text('• Délais de production : Définis après confirmation formelle du BAT par le client.', conditionsX, condY)

  // ── 6. ZONE DE SIGNATURES ──
  const sigY = Math.max(curTotalsY + 34, condY + 12)
  if (sigY < pageHeight - 35) {
    const boxWidth = (pageWidth - 2 * margin - 10) / 2

    // Signature Client
    doc.setDrawColor(...borderColor)
    doc.roundedRect(margin, sigY, boxWidth, 24, 2, 2, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...secondaryColor)
    doc.text('BON POUR ACCORD — LE CLIENT', margin + 4, sigY + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('(Date, Signature et Cachet précédés de la mention "Lu et approuvé")', margin + 4, sigY + 9)

    // Signature Entreprise
    const rightBoxX = margin + boxWidth + 10
    doc.roundedRect(rightBoxX, sigY, boxWidth, 24, 2, 2, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...secondaryColor)
    doc.text('POUR L\'IMPRIMERIE — DIRECTION', rightBoxX + 4, sigY + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('(Signature autorisée et cachet officiel)', rightBoxX + 4, sigY + 9)
  }

  // ── 7. PIED DE PAGE ──
  const footerY = pageHeight - 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  const footerText = `Devis édité par ${company.name || 'GESTIO 229 ERP'} via GESTIO229 SaaS — www.gestio229.com`
  doc.text(footerText, margin, footerY)
  doc.text('Page 1 / 1', pageWidth - margin, footerY, { align: 'right' })

  const fileName = `Devis_${devis.numero_devis || 'IMPRIMERIE'}_${(devis.client_nom || 'Client').replace(/\s+/g, '_')}.pdf`
  const blobUrl = doc.output('bloburl')

  if (options?.action === 'download') {
    doc.save(fileName)
  } else if (options?.action === 'print') {
    doc.autoPrint()
    window.open(blobUrl, '_blank')
  }

  return { doc, fileName, blobUrl: blobUrl.toString() }
}
