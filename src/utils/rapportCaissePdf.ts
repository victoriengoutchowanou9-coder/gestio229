// =============================================================================
// GESTIO 229 SaaS — Service Génération & Transmission Rapport de Caisse PDF
// Support multi-secteurs universel avec jsPDF et jspdf-autotable
// =============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatFCFA } from './formatters'
import { supabase } from '../lib/supabase'

import { formatMontantFCFA, generateFermetureCaisseHTML, FermetureCaisseData } from './generateFermetureCaisseHTML'
export { generateFermetureCaisseHTML, formatMontantFCFA }
export type { FermetureCaisseData }

export interface RapportCaisseData {
  company?: {
    name?: string
    ifu?: string
    rccm?: string
    phone?: string
    email?: string
  }
  entreprise?: string
  secteur?: {
    nom: string
    slug: string
  } | string
  caisse?: {
    nom: string
    id?: string
  }
  session?: {
    id?: string
    dateOuverture?: string
    dateCloture?: string
    ouvertPar?: string
    fermePar?: string
  }
  user?: {
    nom: string
  }
  caissiere?: string
  date: string | Date
  heure?: string
  dateHeure?: string
  ca?: number
  espece?: number
  momo?: number
  marge?: number
  margePercent?: number
  depenses?: number
  remboursement?: number
  creances?: number
  synthese?: {
    fondInitialEspeces?: number
    fondInitialMomo?: number
    encaissementsEspeces?: number
    encaissementsMomo?: number
    depensesEspeces?: number
    depensesMomo?: number
    fondTheoriqueEspeces?: number
    fondTheoriqueMomo?: number
    fondReelEspeces?: number
    fondReelMomo?: number
    ecartEspeces?: number
    ecartMomo?: number
    caDuJour: number
    especesDuJour: number
    momoDuJour: number
    fondActuel?: number
    fondActuelEspeces?: number
    fondActuelMomo?: number
    totalDepensesJour?: number
    totalRemboursementsJour?: number
    remboursement?: number
    margeBruteJour?: number
    totalCreances?: number
  }
  top5Produits?: Array<{
    nom: string
    quantite?: number
    qte?: number
    totalVentes?: number
    montant?: number
  }>
  top5?: Array<{ nom: string; qte: number; montant: number }>
  mouvements?: Array<{
    heure?: string
    type: string
    montant: number
    mode: string
    motif?: string
    reference?: string
    client?: string
  }>
  notes?: string
}

const fmt = (n: number = 0) => formatMontantFCFA(n)

/**
 * Génère le document PDF officiel de Fermeture de Caisse
 * Reproduisant à l'identique la structure moderne en carte de l'email :
 * Palette : #0F1F3C (Bleu nuit), #0E9F6E (Vert), #FFFFFF (Blanc), #F3F4F6 (Gris clair), #111827 (Texte)
 */
export function genererRapportCaissePDF(
  donnees: RapportCaisseData,
  options: { save?: boolean; fileName?: string } = { save: true }
): { doc: jsPDF; blob: Blob; fileName: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const dateObj = donnees.date instanceof Date ? donnees.date : new Date(donnees.date)
  const dateStr = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('fr-BJ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : String(donnees.date || '')

  const heureStr = donnees.heure || (!isNaN(dateObj.getTime())
    ? dateObj.toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
    : '')

  const dateHeureFormatted = donnees.dateHeure || (heureStr ? `${dateStr} à ${heureStr}` : dateStr)

  const entreprise = donnees.entreprise || donnees.company?.name || 'GESTIO 229'
  const caissiere = donnees.caissiere || donnees.user?.nom || 'Caissier'
  const secteurNom = typeof donnees.secteur === 'string'
    ? donnees.secteur
    : (donnees.secteur?.nom || 'Général')

  const syn = donnees.synthese || {
    caDuJour: donnees.ca || 0,
    especesDuJour: donnees.espece || 0,
    momoDuJour: donnees.momo || 0
  }

  const ca = Number(syn.caDuJour ?? donnees.ca ?? 0)
  const espece = Number(syn.especesDuJour ?? donnees.espece ?? 0)
  const momo = Number(syn.momoDuJour ?? donnees.momo ?? 0)
  const depenses = Number(
    syn.totalDepensesJour ??
    ((syn.depensesEspeces || 0) + (syn.depensesMomo || 0)) ??
    donnees.depenses ??
    0
  )
  const remboursement = Number(
    syn.totalRemboursementsJour ??
    syn.remboursement ??
    donnees.remboursement ??
    0
  )
  const marge = Number(syn.margeBruteJour ?? donnees.marge ?? 0)
  const margePercent = typeof donnees.margePercent === 'number'
    ? donnees.margePercent
    : (ca > 0 ? Math.round((marge / ca) * 100) : 0)
  const creances = Number(syn.totalCreances ?? donnees.creances ?? 0)

  const rawTop5 = donnees.top5 || donnees.top5Produits || []
  const top5 = rawTop5.slice(0, 5).map((p: any) => ({
    nom: p.nom || 'Produit',
    qte: Number(p.qte ?? p.quantite ?? 1),
    montant: Number(p.montant ?? p.totalVentes ?? 0)
  }))

  // 1. Fond général (#F3F4F6)
  doc.setFillColor(243, 244, 246)
  doc.rect(0, 0, 210, 297, 'F')

  // Calcul dynamique de la hauteur de la carte
  const top5BlockHeight = top5.length > 0 ? (top5.length * 8 + 4) : 14
  const cardHeight = 175 + top5BlockHeight + 28

  // 2. Carte principale (#FFFFFF) avec bordure fine (#E5E7EB)
  const cardX = 18
  const cardY = 12
  const cardW = 174
  const innerX = 24
  const innerW = 162
  const rightAlignX = 180

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.roundedRect(cardX, cardY, cardW, cardHeight, 4, 4, 'FD')

  // 3. Header BLEU NUIT (#0F1F3C)
  doc.setFillColor(15, 31, 60)
  doc.roundedRect(cardX, cardY, cardW, 26, 4, 4, 'F')
  doc.rect(cardX, cardY + 12, cardW, 14, 'F') // Égaliser coins inférieurs

  // Titres Header
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Fermeture de Caisse', 105, 22, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(`${dateHeureFormatted} — ${caissiere}`, 105, 28.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(`SECTEUR : `, 95, 34, { align: 'right' })
  doc.setTextColor(255, 255, 255)
  doc.text(`${secteurNom.toUpperCase()}`, 97, 34, { align: 'left' })

  // 4. Section 1 - CHIFFRE D'AFFAIRES DU JOUR
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 31, 60)
  doc.text("CHIFFRE D'AFFAIRES DU JOUR", innerX, 45)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.roundedRect(innerX, 48, innerW, 18, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(71, 85, 105)
  doc.text("CA total du jour", innerX + 6, 59.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(15, 31, 60)
  doc.text(fmt(ca), rightAlignX, 60, { align: 'right' })

  // 5. Section 2 - DÉTAILS ENCAISSEMENTS
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 31, 60)
  doc.text("DÉTAILS ENCAISSEMENTS", innerX, 73)

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.roundedRect(innerX, 76, innerW, 22, 3, 3, 'FD')

  // Espèce
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text("Espèce du jour", innerX + 6, 83.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(17, 24, 39)
  doc.text(fmt(espece), rightAlignX, 83.5, { align: 'right' })

  // Séparateur
  doc.setDrawColor(241, 245, 249)
  doc.setLineWidth(0.2)
  doc.line(innerX + 6, 87, rightAlignX, 87)

  // MoMo
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text("Momo du jour (MTN + Moov)", innerX + 6, 93.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(17, 24, 39)
  doc.text(fmt(momo), rightAlignX, 93.5, { align: 'right' })

  // 6. Section 3 - RENTABILITÉ & SORTIES
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 31, 60)
  doc.text("RENTABILITÉ & SORTIES", innerX, 105)

  doc.setFillColor(236, 253, 245)
  doc.setDrawColor(167, 243, 208)
  doc.setLineWidth(0.3)
  doc.roundedRect(innerX, 108, innerW, 30, 3, 3, 'FD')

  // Marge brute
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(6, 95, 70)
  doc.text("Marge brute du jour", innerX + 6, 115.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(14, 159, 110)
  doc.text(`${fmt(marge)} (${margePercent}%)`, rightAlignX, 115.5, { align: 'right' })

  // Séparateur
  doc.setDrawColor(167, 243, 208)
  doc.setLineWidth(0.2)
  doc.line(innerX + 6, 119, rightAlignX, 119)

  // Dépenses
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(55, 65, 81)
  doc.text("Dépenses du jour", innerX + 6, 125.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(17, 24, 39)
  doc.text(fmt(depenses), rightAlignX, 125.5, { align: 'right' })

  // Séparateur
  doc.line(innerX + 6, 129, rightAlignX, 129)

  // Remboursement
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(55, 65, 81)
  doc.text("Remboursement du jour", innerX + 6, 134.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(17, 24, 39)
  doc.text(fmt(remboursement), rightAlignX, 134.5, { align: 'right' })

  // 7. Section 4 - SITUATION CRÉANCES
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 31, 60)
  doc.text("SITUATION CRÉANCES", innerX, 145)

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.roundedRect(innerX, 148, innerW, 18, 3, 3, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105)
  doc.text("Situation des créances actuel", innerX + 6, 156.5)
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text("(total restant dû clients à ce jour)", innerX + 6, 161.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(17, 24, 39)
  doc.text(fmt(creances), rightAlignX, 158.5, { align: 'right' })

  // 8. Section 5 - TOP 5 PRODUITS VENDUS DU JOUR
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 31, 60)
  doc.text("TOP 5 PRODUITS VENDUS DU JOUR", innerX, 173)

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.roundedRect(innerX, 176, innerW, top5BlockHeight, 3, 3, 'FD')

  if (top5.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(156, 163, 175)
    doc.text("Aucune vente enregistrée pour cette session.", 105, 184, { align: 'center' })
  } else {
    let rowY = 183
    top5.forEach((p, idx) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(15, 31, 60)
      doc.text(`${idx + 1}.`, innerX + 6, rowY)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(17, 24, 39)
      const nomCourt = p.nom.length > 36 ? p.nom.slice(0, 34) + '...' : p.nom
      doc.text(nomCourt, innerX + 11, rowY)

      doc.setFontSize(7.5)
      doc.setTextColor(107, 114, 128)
      doc.text(`— ${p.qte} vendus`, innerX + 13 + doc.getTextWidth(nomCourt), rowY)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(17, 24, 39)
      doc.text(fmt(p.montant), rightAlignX, rowY, { align: 'right' })

      if (idx < top5.length - 1) {
        doc.setDrawColor(241, 245, 249)
        doc.setLineWidth(0.2)
        doc.line(innerX + 6, rowY + 3, rightAlignX, rowY + 3)
      }
      rowY += 8
    })
  }

  // 9. Footer
  const footerY = 176 + top5BlockHeight + 6
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.roundedRect(innerX, footerY, innerW, 14, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(`Rapport généré par GESTIO 229 - ${entreprise}`, 105, footerY + 5.5, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(`Plateforme de Gestion Commerciale, Caisse & Trésorerie • www.gestio229.com`, 105, footerY + 10, { align: 'center' })

  // 10. Audit / Mouvements optionnels sur page suivante (traçabilité comptable)
  if (donnees.mouvements && donnees.mouvements.length > 0) {
    doc.addPage()
    doc.setFillColor(15, 31, 60)
    doc.rect(0, 0, 210, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`ANNEXE : JOURNAL DÉTAILLÉ DES MOUVEMENTS (${donnees.mouvements.length} opérations)`, 14, 13)

    const corpsMouvements = donnees.mouvements.slice(0, 40).map((m) => [
      m.heure || '--:--',
      m.type,
      fmt(m.montant),
      m.mode,
      m.motif || m.client || 'Opération caisse',
      m.reference || '—'
    ])

    autoTable(doc, {
      startY: 25,
      head: [['Heure', 'Type', 'Montant', 'Canal', 'Motif / Tiers', 'Référence']],
      body: corpsMouvements,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 31, 60],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 26, fontStyle: 'bold' },
        2: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        3: { cellWidth: 22 },
        4: { cellWidth: 62 },
        5: { cellWidth: 34 }
      }
    })
  }

  // Nom de fichier normalisé
  const cleanSecteur = (secteurNom).replace(/[^a-zA-Z0-9]/g, '_')
  const cleanDateStr = dateStr.replace(/\//g, '-')
  const fileName = options.fileName || `Fermeture_Caisse_${cleanSecteur}_${cleanDateStr}.pdf`

  if (options.save !== false) {
    doc.save(fileName)
  }

  const blob = doc.output('blob')
  return { doc, blob, fileName }
}

/**
 * Convertit un Blob en chaîne Base64
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const res = reader.result as string
      const base64 = res.includes(',') ? res.split(',')[1] : res
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Envoie le rapport de caisse PDF par Email
 * Appelle POST /api/send-rapport-pdf avec le PDF généré et les métadonnées
 */
export async function envoyerRapportCaisseMail(params: {
  companyId: string
  secteurId: string
  caisseId?: string
  date: string
  heure?: string
  pdfBase64: string
  emails?: string[]
  metadata: {
    caDuJour: number
    especesDuJour: number
    momoDuJour: number
    fondActuel: number
    totalDepensesJour: number
    margeBruteJour: number
    totalCreances: number
    nomCaissier: string
    secteurNom: string
    top5Produits?: Array<{ nom: string; quantite: number; totalVentes: number }>
  }
}): Promise<{ success: boolean; message: string; recipients: string[] }> {
  const { companyId, secteurId, caisseId, date, heure, pdfBase64, emails, metadata } = params

  try {
    const response = await fetch('/api/send-rapport-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        companyId,
        secteurId,
        caisseId,
        date,
        heure: heure || new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' }),
        pdfBase64,
        emails,
        metadata
      })
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.error || result.message || `Erreur serveur (${response.status})`)
    }

    return {
      success: true,
      message: result.message || 'Rapport transmis avec succès via Gmail SMTP !',
      recipients: result.recipients || emails || []
    }
  } catch (err: any) {
    console.error('[envoyerRapportCaisseMail] Erreur appel API backend :', err)
    throw err
  }
}
