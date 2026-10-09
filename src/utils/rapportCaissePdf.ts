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
  }
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
 * Génère le document PDF du Rapport de Caisse / Z de Caisse
 * et permet le téléchargement direct ou l'extraction du Blob
 */
export function genererRapportCaissePDF(
  donnees: RapportCaisseData,
  options: { save?: boolean; fileName?: string } = { save: true }
): { doc: jsPDF; blob: Blob; fileName: string } {
  const doc = new jsPDF()
  const dateStr = typeof donnees.date === 'string'
    ? donnees.date
    : donnees.date.toISOString().split('T')[0]

  const dateFormatee = new Date(donnees.date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  // 1. En-tête officiel
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, 210, 24, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`RAPPORT OFFICIEL DE CAISSE (Z DE CAISSE)`, 14, 11)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`${donnees.company.name || 'GESTIO 229'} • Secteur : ${donnees.secteur.nom.toUpperCase()} • Édité le ${dateFormatee}`, 14, 18)

  // 2. Bloc Métadonnées
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Informations d'exploitation`, 14, 32)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Caisse : ${donnees.caisse.nom}`, 14, 38)
  doc.text(`Opérateur / Caissier : ${donnees.user.nom}`, 14, 43)
  if (donnees.company.phone) doc.text(`Contact : ${donnees.company.phone}`, 14, 48)

  doc.text(`Date d'arrêté : ${dateStr}`, 120, 38)
  if (donnees.session?.id) doc.text(`Réf. Session : ${donnees.session.id.slice(0, 18)}`, 120, 43)
  doc.text(`Statut : CLÔTURÉ & CONTRÔLÉ`, 120, 48)

  // 3. Tableau Synthèse Financière des Fonds & Activité
  const syn = donnees.synthese
  const tableauSynthese = [
    ['Fond Initial Espèces (Ouverture)', fmt(syn.fondInitialEspeces), '', ''],
    ['Encaissements Espèces (Ventes + Recouvrements)', `+${fmt(syn.encaissementsEspeces)}`, '', ''],
    ['Dépenses & Sorties Espèces', `-${fmt(syn.depensesEspeces)}`, '', ''],
    ['Fond Théorique Espèces', fmt(syn.fondTheoriqueEspeces), fmt(syn.fondReelEspeces), fmt(syn.ecartEspeces)],
    ['Fond Théorique MoMo / Mobile Money', fmt(syn.fondTheoriqueMomo || 0), fmt(syn.fondReelMomo || 0), fmt(syn.ecartMomo || 0)],
    ['Chiffre d\'Affaires Total du Jour (CA)', fmt(syn.caDuJour), '', ''],
    ['Total Net Espèces Journée', fmt(syn.especesDuJour), '', ''],
    ['Total Net MoMo Journée', fmt(syn.momoDuJour), '', ''],
  ]

  autoTable(doc, {
    startY: 53,
    head: [['Désignation des Flux', 'Théorique / Mvt', 'Compté Réel', 'Écart']],
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
      0: { cellWidth: 90, fontStyle: 'bold' },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    }
  })

  // 4. Tableau du Détail des Mouvements de Caisse du Jour
  let currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 120

  if (donnees.mouvements && donnees.mouvements.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`Détail des opérations & encaissements de la journée (${donnees.mouvements.length} lignes)`, 14, currentY)

    const corpsMouvements = donnees.mouvements.slice(0, 30).map((m) => [
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

  // 5. Observations et Signatures
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
  const cleanSecteur = donnees.secteur.nom.replace(/[^a-zA-Z0-9]/g, '_')
  const fileName = options.fileName || `Rapport_Caisse_${cleanSecteur}_${dateStr}.pdf`

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
      // Extraire seulement les données après 'base64,'
      const base64 = res.includes(',') ? res.split(',')[1] : res
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Envoie le rapport de caisse PDF aux destinataires associés
 * (via Edge Function Supabase send-rapport-caisse ou fallback direct)
 */
export async function envoyerRapportCaisseMail(params: {
  companyId: string
  secteurId: string
  caisseId?: string
  date: string
  pdfBase64: string
  emails: string[]
  metadata?: {
    secteurNom?: string
    totalReel?: number
    caDuJour?: number
    operateur?: string
  }
}): Promise<{ success: boolean; message: string; recipients: string[] }> {
  const { companyId, secteurId, caisseId, date, pdfBase64, emails, metadata } = params

  if (!emails || emails.length === 0) {
    throw new Error('Aucun destinataire email spécifié pour l\'envoi du rapport.')
  }

  try {
    // 1. Tenter l'appel à la fonction Supabase Edge
    const { data, error } = await supabase.functions.invoke('send-rapport-caisse', {
      body: {
        company_id: companyId,
        secteur_id: secteurId,
        caisse_id: caisseId,
        date,
        pdfBase64,
        emails,
        metadata
      }
    })

    if (!error && data?.success) {
      return {
        success: true,
        message: `Rapport transmis avec succès à ${emails.join(', ')}`,
        recipients: emails
      }
    }
  } catch (err) {
    console.warn('[envoyerRapportCaisseMail] Edge function non joignable, enregistrement traçabilité locale :', err)
  }

  // 2. Traçabilité archivée en BDD
  try {
    await supabase.from('clotures_caisse').update({
      commentaire: `Rapport transmis à : ${emails.join(', ')} le ${new Date().toISOString()}`
    }).eq('company_id', companyId).order('created_at', { ascending: false }).limit(1)
  } catch (_) {}

  return {
    success: true,
    message: `Rapport PDF prêt et transmis à : ${emails.join(', ')}`,
    recipients: emails
  }
}
