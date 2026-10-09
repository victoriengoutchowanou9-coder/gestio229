// =============================================================================
// GESTIO 229 ERP — Facture Professionnelle Secteur Brasserie & Dépôt de Boissons
// Template conforme à l'exemplaire réel de dépôt de boissons avec bloc Situation des Emballages
// RÈGLE MÉTIER : 100% données réelles (aucun montant fictif hardcodé)
// =============================================================================

import React, { useRef } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Printer, Download, X } from 'lucide-react'
import { formatFCFA } from '../../utils/tax'

export interface FactureBrasserieLine {
  id?: string
  designation: string
  qte: number
  pvu: number // Prix Vente Unitaire TTC
  montant: number // qte * pvu
  ts?: number // Taxe Spécifique éventuelle
}

export interface FactureEmballageLine {
  designation: string
  code?: string
  precedent: number
  facture: number
  rendus: number
  reste: number // Reste = Dû = Précédent + Facture - Rendus
}

export interface FactureBrasserieData {
  company: {
    name: string
    address?: string
    phone?: string
    ifu?: string
    rccm?: string
    email?: string
  }
  agence?: string
  magasin?: string
  reference: string
  dateFacture: string // Format ISO ou texte
  dateEcheance?: string
  modePaiement: string
  client: {
    id?: string
    code?: string
    nom: string
    tel?: string
    ifu?: string
    type?: 'COMPTOIR' | 'ENREGISTRE' | string
  }
  vendeur: {
    code?: string
    nom: string
  }
  gestionnaire?: {
    nom: string
  }
  lignes: FactureBrasserieLine[]
  totalHT: number
  totalTVA: number
  totalAIB: number
  totalTTC: number // Net à payer (TTC catalogue fixe invariant)
  emballages: FactureEmballageLine[]
  observation?: string
}

interface FactureBrasserieTemplateProps {
  data: FactureBrasserieData
  onClose?: () => void
}

const fmt = (n: number) => formatFCFA(n)

export const formatDateBrasserie = (dateStr: string): string => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
    const day = String(d.getDate()).padStart(2, '0')
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    return `${day} ${month} ${year}`
  } catch {
    return dateStr
  }
}

/**
 * Générateur PDF jsPDF dédié au format Brasserie avec bloc Situation des Emballages
 */
export function exportFactureBrasseriePDF(data: FactureBrasserieData) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210
  const margin = 12
  const contentWidth = pageWidth - margin * 2

  // ── EN-TÊTE ENTREPRISE ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(data.company.name || 'DÉPÔT DE BOISSONS', margin, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const contactText = [
    data.company.address,
    data.company.phone ? `Tél : ${data.company.phone}` : null,
    data.company.ifu ? `IFU : ${data.company.ifu}` : null,
  ].filter(Boolean).join(' | ')
  if (contactText) {
    doc.text(contactText, margin, 20)
  }

  // Ligne de séparation fine
  doc.setDrawColor(60, 60, 60)
  doc.setLineWidth(0.3)
  doc.line(margin, 23, pageWidth - margin, 23)

  // ── INFOS FACTURE & CLIENT (Cadre délimité) ──────────────────────────────────
  doc.setFontSize(8.5)
  let y = 28

  // Gauche : Client
  doc.setFont('helvetica', 'bold')
  doc.text(`Client : ${data.client.nom}`, margin, y)
  doc.setFont('helvetica', 'normal')
  const clientDetails = [
    data.client.tel ? `TEL : ${data.client.tel}` : null,
    data.client.ifu ? `IFU : ${data.client.ifu}` : null,
  ].filter(Boolean).join(' / ')
  if (clientDetails) {
    doc.text(clientDetails, margin, y + 4.5)
  }

  // Droite : Agence, Magasin, Date, Vendeur, Paiement
  const rightColX = 115
  doc.setFont('helvetica', 'normal')
  doc.text(`Agence : ${data.agence || 'PRINCIPALE'} \\ MAGASIN : ${data.magasin || 'MAGASIN 1'}`, rightColX, y)
  doc.text(`Date : ${formatDateBrasserie(data.dateFacture)}`, rightColX, y + 4.5)
  doc.text(`Mode de paiement : ${data.modePaiement} / Réf : ${data.reference}`, rightColX, y + 9)
  doc.text(`Vendeur : ${data.vendeur.code || 'V01'}-${data.vendeur.nom}`, rightColX, y + 13.5)

  y = 45

  // ── TABLEAU DES PRODUITS (Lignes de vente réelles) ───────────────────────────
  const bodyRows = data.lignes.map(l => [
    l.designation,
    String(l.qte),
    fmt(l.pvu),
    fmt(l.montant),
    l.ts ? `${l.ts}%` : '-',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Désignation', 'Qté', 'P.V.U.', 'Montant', 'TS']],
    body: bodyRows,
    theme: 'plain',
    headStyles: {
      fontStyle: 'bold',
      fontSize: 8,
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      lineColor: [80, 80, 80],
    },
    bodyStyles: {
      fontSize: 8,
      lineWidth: 0.1,
      lineColor: [180, 180, 180],
    },
    columnStyles: {
      0: { cellWidth: 85 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 33 },
      4: { halign: 'center', cellWidth: 20 },
    },
    margin: { left: margin, right: margin },
  })

  const afterTableY = (doc as any).lastAutoTable.finalY + 4

  // ── BLOC EMBALLAGES (GOUCHE) & PIED FISCAL (DROITE) ─────────────────────────
  const embWidth = 100
  const embX = margin

  // Table Situation des emballages
  if (data.emballages && data.emballages.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('Situation des emballages', embX, afterTableY + 4)

    const embRows = data.emballages.map(e => [
      e.designation,
      String(e.precedent),
      String(e.facture),
      String(e.rendus),
      String(e.reste),
    ])

    autoTable(doc, {
      startY: afterTableY + 6,
      head: [['Désignation', 'Précédent', 'Facture', 'Rendus', 'Reste']],
      body: embRows,
      theme: 'plain',
      tableWidth: embWidth,
      headStyles: {
        fontStyle: 'bold',
        fontSize: 7.5,
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        lineWidth: 0.2,
        lineColor: [80, 80, 80],
      },
      bodyStyles: {
        fontSize: 7.5,
        lineWidth: 0.1,
        lineColor: [180, 180, 180],
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 15 },
      },
      margin: { left: embX },
    })
  }

  // Cadre des totaux financiers à droite
  const totX = 120
  const totW = pageWidth - margin - totX
  let curTotY = afterTableY + 4

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  // Total HT
  doc.text('TOTAL HT :', totX, curTotY)
  doc.text(fmt(data.totalHT), pageWidth - margin, curTotY, { align: 'right' })
  curTotY += 4.5

  // TVA
  doc.text('TVA (18%) :', totX, curTotY)
  doc.text(fmt(data.totalTVA), pageWidth - margin, curTotY, { align: 'right' })
  curTotY += 4.5

  // AIB (si > 0)
  if (data.totalAIB > 0) {
    doc.text('AIB (1%) :', totX, curTotY)
    doc.text(fmt(data.totalAIB), pageWidth - margin, curTotY, { align: 'right' })
    curTotY += 4.5
  }

  // Trait double ou épais
  doc.setDrawColor(40, 40, 40)
  doc.setLineWidth(0.4)
  doc.line(totX, curTotY, pageWidth - margin, curTotY)
  curTotY += 4.5

  // NET A PAYER
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text('NET A PAYER :', totX, curTotY)
  doc.text(fmt(data.totalTTC), pageWidth - margin, curTotY, { align: 'right' })
  curTotY += 8

  // ── BLOC OBSERVATION & SIGNATURE ─────────────────────────────────────────────
  const bottomY = Math.max(
    (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 12 : curTotY + 10,
    curTotY + 4
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  if (data.dateEcheance) {
    doc.text(`Observation : Facture à régler au plus tard le ${formatDateBrasserie(data.dateEcheance)}`, margin, bottomY)
  } else if (data.observation) {
    doc.text(`Observation : ${data.observation}`, margin, bottomY)
  }

  const gestY = bottomY + 5
  if (data.gestionnaire?.nom) {
    doc.text(`Gestionnaire : ${data.gestionnaire.nom}`, margin, gestY)
  }

  doc.setFont('helvetica', 'italic')
  doc.text('Merci pour votre fidélité', margin, gestY + 5)

  // Footer pagination
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('1 sur 1', pageWidth - margin, 290, { align: 'right' })

  doc.save(`Facture_${data.reference}.pdf`)
}

export const FactureBrasserieTemplate: React.FC<FactureBrasserieTemplateProps> = ({ data, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = () => {
    exportFactureBrasseriePDF(data)
  }

  return (
    <div className="bg-slate-100 min-h-screen p-4 sm:p-6 text-slate-800">
      {/* Barre d'actions supérieure */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between print:hidden bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">Facture Brasserie N° {data.reference}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Download className="w-4 h-4" /> Télécharger PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* DOCUMENT IMPRIMABLE — STYLE CONFORME REÇU BRASSERIE & DÉPÔT */}
      <div
        ref={printRef}
        id="facture-brasserie-printable"
        className="max-w-4xl mx-auto bg-white p-8 sm:p-10 shadow-md border border-slate-300 text-[12px] leading-tight font-sans print:shadow-none print:border-0 print:p-4 print:m-0"
      >
        {/* En-tête Entreprise */}
        <div className="border-b border-slate-900 pb-3 mb-3">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-base font-black uppercase tracking-tight text-slate-900">{data.company.name}</h1>
              {data.company.address && <p className="text-[11px] text-slate-600">{data.company.address}</p>}
              <div className="text-[11px] text-slate-600 flex gap-3 mt-0.5">
                {data.company.phone && <span>Tél : {data.company.phone}</span>}
                {data.company.ifu && <span>IFU : {data.company.ifu}</span>}
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block border border-slate-900 px-3 py-1 font-mono font-black text-sm uppercase">
                FACTURE N° {data.reference}
              </span>
            </div>
          </div>
        </div>

        {/* Bloc Informations Client & Vente */}
        <div className="border border-slate-900 p-3 mb-4 rounded-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-bold text-slate-900">
                Client : <span className="font-black uppercase">{data.client.nom}</span>
              </p>
              <p className="text-[11px] text-slate-700">
                TEL : {data.client.tel || '-'} / IFU : {data.client.ifu || '-'}
              </p>
            </div>
            <div className="text-right space-y-0.5 text-[11px]">
              <p>
                Agence : <span className="font-semibold">{data.agence || 'PRINCIPALE'}</span> \ MAGASIN : <span className="font-semibold">{data.magasin || 'MAGASIN 1'}</span>
              </p>
              <p>
                Date : <span className="font-bold">{formatDateBrasserie(data.dateFacture)}</span>
              </p>
              <p>
                Mode de paiement : <span className="font-bold">{data.modePaiement}</span> / Réf : <span className="font-mono">{data.reference}</span>
              </p>
              <p>
                Vendeur : <span className="font-medium">{data.vendeur.code || 'V01'}-{data.vendeur.nom}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Tableau des Lignes Produits */}
        <table className="w-full border-collapse border border-slate-900 text-[11px] mb-4">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold">
              <th className="border-r border-slate-900 p-1.5 text-left">Désignation</th>
              <th className="border-r border-slate-900 p-1.5 text-center w-16">Qté</th>
              <th className="border-r border-slate-900 p-1.5 text-right w-24">P.V.U.</th>
              <th className="border-r border-slate-900 p-1.5 text-right w-28">Montant</th>
              <th className="p-1.5 text-center w-14">TS</th>
            </tr>
          </thead>
          <tbody>
            {data.lignes.map((line, idx) => (
              <tr key={idx} className="border-b border-slate-300">
                <td className="border-r border-slate-900 p-1.5 font-medium">{line.designation}</td>
                <td className="border-r border-slate-900 p-1.5 text-center font-mono font-bold">{line.qte}</td>
                <td className="border-r border-slate-900 p-1.5 text-right font-mono">{fmt(line.pvu)}</td>
                <td className="border-r border-slate-900 p-1.5 text-right font-mono font-bold">{fmt(line.montant)}</td>
                <td className="p-1.5 text-center font-mono text-slate-500">{line.ts ? `${line.ts}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Section Bas de Facture : Situation des Emballages (Gauche) + Totaux Financiers (Droite) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Situation des Emballages */}
          <div>
            <div className="border border-slate-900">
              <div className="bg-slate-100 px-2 py-1 border-b border-slate-900 font-bold uppercase text-[10px] text-slate-900">
                Situation des emballages
              </div>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-50 text-slate-800 font-semibold">
                    <th className="p-1 border-r border-slate-900 text-left">Désignation emballage</th>
                    <th className="p-1 border-r border-slate-900 text-center w-14">Précédent</th>
                    <th className="p-1 border-r border-slate-900 text-center w-14">Facture</th>
                    <th className="p-1 border-r border-slate-900 text-center w-14">Rendus</th>
                    <th className="p-1 text-center w-14 font-black">Reste</th>
                  </tr>
                </thead>
                <tbody>
                  {data.emballages && data.emballages.length > 0 ? (
                    data.emballages.map((emb, idx) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="p-1 border-r border-slate-900 font-medium">{emb.designation}</td>
                        <td className="p-1 border-r border-slate-900 text-center font-mono">{emb.precedent}</td>
                        <td className="p-1 border-r border-slate-900 text-center font-mono font-bold">{emb.facture}</td>
                        <td className="p-1 border-r border-slate-900 text-center font-mono">{emb.rendus}</td>
                        <td className="p-1 text-center font-mono font-black text-slate-900 bg-slate-50">{emb.reste}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-2 text-center text-slate-400 italic">
                        Aucun emballage consigné sur cette vente
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totaux Financiers & Fiscaux */}
          <div className="border border-slate-900 p-2.5 space-y-1.5 text-[11px] self-start">
            <div className="flex justify-between">
              <span className="text-slate-600">TOTAL HT :</span>
              <span className="font-mono font-bold">{fmt(data.totalHT)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">TVA (18%) :</span>
              <span className="font-mono font-bold">{fmt(data.totalTVA)}</span>
            </div>
            {data.totalAIB > 0 && (
              <div className="flex justify-between text-amber-900">
                <span>AIB (1% sur HT) :</span>
                <span className="font-mono font-bold">{fmt(data.totalAIB)}</span>
              </div>
            )}
            <div className="border-t-2 border-slate-900 pt-1.5 flex justify-between items-center text-sm font-black text-slate-950">
              <span className="uppercase">NET À PAYER :</span>
              <span className="font-mono text-base">{fmt(data.totalTTC)}</span>
            </div>
          </div>
        </div>

        {/* Bloc Observation & Gestionnaire */}
        <div className="border-t border-slate-300 pt-3 text-[11px] space-y-1 text-slate-700">
          <p>
            <span className="font-bold">Observation :</span>{' '}
            {data.dateEcheance
              ? `Facture à régler au plus tard le ${formatDateBrasserie(data.dateEcheance)}`
              : data.observation || 'Règlement au comptant'}
          </p>
          {data.gestionnaire?.nom && (
            <p>
              <span className="font-bold">Gestionnaire :</span> {data.gestionnaire.nom}
            </p>
          )}
          <p className="italic font-medium text-slate-500 pt-1">Merci pour votre fidélité</p>
        </div>

        {/* Pied de page pagination */}
        <div className="mt-6 pt-2 border-t border-slate-200 flex justify-between text-[10px] text-slate-400">
          <span>GESTIO 229 ERP — Brasserie & Dépôt</span>
          <span>1 sur 1</span>
        </div>
      </div>
    </div>
  )
}

export default FactureBrasserieTemplate
