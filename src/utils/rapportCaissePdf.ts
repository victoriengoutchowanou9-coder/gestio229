// =============================================================================
// GESTIO 229 SaaS — Service Génération & Transmission Rapport de Caisse PDF
// Support multi-secteurs universel avec jsPDF et jspdf-autotable
// =============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatFCFA } from './formatters'
import { supabase } from '../lib/supabase'

export interface RapportCaisseData {
  company: {
    name?: string
    ifu?: string
    rccm?: string
    phone?: string
    email?: string
  }
  secteur: {
    nom: string
    slug: string
  }
  caisse: {
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
  user: {
    nom: string
  }
  date: string | Date
  heure?: string
  synthese: {
    fondInitialEspeces: number
    fondInitialMomo?: number
    encaissementsEspeces: number
    encaissementsMomo?: number
    depensesEspeces: number
    depensesMomo?: number
    fondTheoriqueEspeces: number
    fondTheoriqueMomo?: number
    fondReelEspeces: number
    fondReelMomo?: number
    ecartEspeces: number
    ecartMomo?: number
    caDuJour: number
    especesDuJour: number
    momoDuJour: number
    // Métriques exigées :
    fondActuel?: number
    fondActuelEspeces?: number
    fondActuelMomo?: number
    totalDepensesJour?: number
    margeBruteJour?: number
    totalCreances?: number
  }
  top5Produits?: Array<{
    nom: string
    quantite: number
    totalVentes: number
  }>
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

const fmt = (n: number = 0) => formatFCFA(n)

/**
 * Génère le document PDF officiel du Rapport de Caisse
 * comprenant les 12 sections obligatoires.
 */
export function genererRapportCaissePDF(
  donnees: RapportCaisseData,
  options: { save?: boolean; fileName?: string } = { save: true }
): { doc: jsPDF; blob: Blob; fileName: string } {
  const doc = new jsPDF()
  const dateObj = donnees.date instanceof Date ? donnees.date : new Date(donnees.date)
  const dateStr = dateObj.toLocaleDateString('fr-BJ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  const heureStr = donnees.heure || dateObj.toLocaleTimeString('fr-BJ', {
    hour: '2-digit',
    minute: '2-digit'
  })

  // 1. En-tête officiel
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, 210, 26, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`RAPPORT OFFICIEL DE CAISSE JOURNALIER`, 14, 11)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${donnees.company.name || 'GESTIO 229'} • Secteur : ${donnees.secteur.nom.toUpperCase()} • Édité le ${dateStr} à ${heureStr}`,
    14,
    19
  )

  // 2. Bloc Métadonnées & Identification
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`1. Informations d'Exploitation`, 14, 34)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date : ${dateStr}`, 14, 40)
  doc.text(`Heure : ${heureStr}`, 14, 45)
  doc.text(`Nom du Caissier : ${donnees.user.nom}`, 14, 50)
  doc.text(`Secteur d'Activité : ${donnees.secteur.nom}`, 14, 55)

  doc.text(`Point de Caisse : ${donnees.caisse.nom}`, 120, 40)
  if (donnees.session?.id) doc.text(`Réf. Session : ${donnees.session.id.slice(0, 18)}`, 120, 45)
  doc.text(`Entreprise : ${donnees.company.name || 'GESTIO 229'}`, 120, 50)
  if (donnees.company.phone) doc.text(`Contact : ${donnees.company.phone}`, 120, 55)

  // 3. Tableau Synthèse Financière Complète
  const syn = donnees.synthese
  const totalDepenses = syn.totalDepensesJour ?? (syn.depensesEspeces + (syn.depensesMomo || 0))
  const fondActuelTotal = syn.fondActuel ?? ((syn.fondActuelEspeces || 0) + (syn.fondActuelMomo || 0))

  const tableauSynthese = [
    ['Chiffre d\'Affaires du Jour (CA)', fmt(syn.caDuJour), 'Total ventes facturées'],
    ['Caisse Espèces du Jour', fmt(syn.especesDuJour), 'Encaissé en espèces'],
    ['Caisse MoMo du Jour', fmt(syn.momoDuJour), 'Encaissé via Mobile Money'],
    [
      'Fond Actuel Persistant (Cumul)',
      fmt(fondActuelTotal),
      `Espèces : ${fmt(syn.fondActuelEspeces || 0)} | MoMo : ${fmt(syn.fondActuelMomo || 0)}`
    ],
    ['Total Dépenses du Jour', fmt(totalDepenses), 'Décaissements validés'],
    ['Marge Brute du Jour', fmt(syn.margeBruteJour ?? 0), 'CA - Coût d\'achat des ventes'],
    ['Total Créances Clients', fmt(syn.totalCreances ?? 0), 'Solde restant dû par les clients']
  ]

  autoTable(doc, {
    startY: 60,
    head: [['Indicateur Financier', 'Montant (FCFA)', 'Précision / Détail']],
    body: tableauSynthese,
    theme: 'striped',
    headStyles: {
      fillColor: [16, 185, 129], // Emerald 600
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59]
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: 'bold' },
      1: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 65, fontSize: 8, textColor: [100, 116, 139] }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    }
  })

  let currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 130

  // 4. Section : Top des 5 Meilleurs Produits Vendus
  if (donnees.top5Produits && donnees.top5Produits.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`2. Top des 5 Meilleurs Produits Vendus de la Journée`, 14, currentY)

    const corpsTop5 = donnees.top5Produits.slice(0, 5).map((p, idx) => [
      `#${idx + 1}`,
      p.nom,
      p.quantite.toLocaleString('fr-BJ'),
      fmt(p.totalVentes)
    ])

    autoTable(doc, {
      startY: currentY + 3,
      head: [['Rang', 'Désignation Produit / Article', 'Quantité Vendue', 'Chiffre d\'Affaires (FCFA)']],
      body: corpsTop5,
      theme: 'grid',
      headStyles: {
        fillColor: [79, 70, 229], // Indigo 600
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59]
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 95 },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
      }
    })

    currentY = (doc as any).lastAutoTable?.finalY + 8
  }

  // 5. Section : Détail des Opérations & Mouvements du Jour
  if (donnees.mouvements && donnees.mouvements.length > 0) {
    if (currentY > 210) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`3. Mouvements & Opérations de Caisse du Jour (${donnees.mouvements.length} opérations)`, 14, currentY)

    const corpsMouvements = donnees.mouvements.slice(0, 25).map((m) => [
      m.heure || '--:--',
      m.type,
      fmt(m.montant),
      m.mode,
      m.motif || m.client || 'Opération caisse',
      m.reference || '—'
    ])

    autoTable(doc, {
      startY: currentY + 3,
      head: [['Heure', 'Type', 'Montant', 'Canal', 'Motif / Tiers', 'Référence']],
      body: corpsMouvements,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800
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

    currentY = (doc as any).lastAutoTable?.finalY + 8
  }

  // 6. Observations & Signatures
  if (currentY > 240) {
    doc.addPage()
    currentY = 20
  }

  if (donnees.notes) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text('Observations de clôture :', 14, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(donnees.notes, 14, currentY + 5, { maxWidth: 180 })
    currentY += 14
  }

  // Cadres Signatures
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.line(14, currentY + 16, 75, currentY + 16)
  doc.text(`Signature du Caissier\n(${donnees.user.nom})`, 14, currentY + 21)

  doc.line(135, currentY + 16, 196, currentY + 16)
  doc.text(`Visa Direction & Contrôle\n(Mention "Vérifié & Approuvé")`, 135, currentY + 21)

  // Nom de fichier normalisé
  const cleanSecteur = (donnees.secteur.nom || donnees.secteur.slug).replace(/[^a-zA-Z0-9]/g, '_')
  const fileName = options.fileName || `Rapport_Caisse_${cleanSecteur}_${dateObj.toISOString().slice(0, 10)}.pdf`

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
      message: result.message || 'Rapport transmis avec succès par Brevo !',
      recipients: result.recipients || emails || []
    }
  } catch (err: any) {
    console.error('[envoyerRapportCaisseMail] Erreur appel API backend :', err)
    throw err
  }
}
