// =============================================================================
// GESTIO 229 SaaS — Service Spécialisé Impression Tickets Thermiques
// Support standard 58mm & 80mm, caractères accentués, FCFA & Duplicata
// =============================================================================

import jsPDF from 'jspdf'
import { formatFCFA } from './tax'

export interface TicketLineItem {
  code?: string
  name: string
  qty: number
  unit?: string
  unitPrice: number
  discount?: number
  total: number
}

export interface TicketPaymentItem {
  method: string
  amount: number
}

export interface TicketData {
  company: {
    name: string
    address?: string
    phone?: string
    email?: string
    ifu?: string
    rccm?: string
  }
  sale: {
    orderNumber: string
    date: string | Date
    cashierName?: string
    customerName?: string
    isDuplicate?: boolean
  }
  lines: TicketLineItem[]
  totals: {
    subtotal: number
    discount: number
    tax?: number
    totalNet: number
    amountReceived?: number
    changeGiven?: number
  }
  payments: TicketPaymentItem[]
  footerMessage?: string
}

const fmt = (n: number = 0) => formatFCFA(n)

/**
 * Lance l'impression thermique directe via une fenêtre d'impression stylisée (58mm / 80mm)
 */
export function imprimerTicketThermique(
  data: TicketData,
  options: { width?: '58mm' | '80mm'; autoPrint?: boolean } = { width: '80mm', autoPrint: true }
): void {
  const is58 = options.width === '58mm'
  const printWindow = window.open('', '_blank', 'width=450,height=650')
  if (!printWindow) {
    alert("Veuillez autoriser les fenêtres pop-up dans votre navigateur pour l'impression du ticket.")
    return
  }

  const dateFormatee = new Date(data.sale.date).toLocaleString('fr-BJ', {
    timeZone: 'Africa/Porto-Novo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Ticket ${data.sale.orderNumber}</title>
  <style>
    @page {
      margin: 0;
      size: ${is58 ? '58mm' : '80mm'} auto;
    }
    body {
      font-family: 'Courier New', Courier, monospace, monospace;
      margin: 0;
      padding: ${is58 ? '4mm' : '6mm'};
      color: #000;
      background: #fff;
      font-size: ${is58 ? '10px' : '11px'};
      line-height: 1.25;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .double-divider {
      border-top: 2px dashed #000;
      margin: 6px 0;
    }
    .title {
      font-size: ${is58 ? '13px' : '15px'};
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .badge-dup {
      display: inline-block;
      border: 1px solid #000;
      padding: 1px 4px;
      font-size: 10px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
      font-size: inherit;
    }
    th {
      text-align: left;
      border-bottom: 1px dashed #000;
      padding-bottom: 3px;
    }
    td {
      padding: 2px 0;
      vertical-align: top;
    }
    .line-title {
      word-break: break-word;
    }
    .line-detail {
      font-size: 0.9em;
      color: #333;
    }
    .totals-table td {
      padding: 1.5px 0;
    }
    .total-highlight {
      font-size: ${is58 ? '13px' : '14px'};
      font-weight: bold;
    }
    .footer {
      margin-top: 8px;
      font-size: 0.85em;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="title">${data.company.name || 'GESTIO 229'}</div>
    ${data.company.address ? `<div>${data.company.address}</div>` : ''}
    ${data.company.phone ? `<div>Tél : ${data.company.phone}</div>` : ''}
    ${data.company.ifu ? `<div>IFU : ${data.company.ifu}</div>` : ''}
    ${data.sale.isDuplicate ? '<div class="badge-dup">*** DUPLICATA ***</div>' : ''}
  </div>

  <div class="divider"></div>

  <div>
    <div><b>Ticket :</b> ${data.sale.orderNumber}</div>
    <div><b>Date :</b> ${dateFormatee}</div>
    ${data.sale.cashierName ? `<div><b>Caissier :</b> ${data.sale.cashierName}</div>` : ''}
    <div><b>Client :</b> ${data.sale.customerName || 'Client Comptoir'}</div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th>Article</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.lines
        .map(
          (l) => `
        <tr>
          <td colspan="2" class="line-title font-bold">${l.name}</td>
        </tr>
        <tr>
          <td class="line-detail">${l.qty} ${l.unit || 'u'} x ${fmt(l.unitPrice)}${l.discount ? ` (-${l.discount}%)` : ''}</td>
          <td class="text-right font-bold">${fmt(l.total)}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="double-divider"></div>

  <table class="totals-table">
    <tr>
      <td>Sous-total :</td>
      <td class="text-right">${fmt(data.totals.subtotal)}</td>
    </tr>
    ${
      data.totals.discount > 0
        ? `<tr>
      <td>Remise accordée :</td>
      <td class="text-right">-${fmt(data.totals.discount)}</td>
    </tr>`
        : ''
    }
    <tr class="total-highlight">
      <td class="font-bold">TOTAL À PAYER :</td>
      <td class="text-right font-bold">${fmt(data.totals.totalNet)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <table class="totals-table">
    ${data.payments
      .map(
        (p) => `
      <tr>
        <td>Règlement (${p.method}) :</td>
        <td class="text-right">${fmt(p.amount)}</td>
      </tr>
    `
      )
      .join('')}
    ${
      (data.totals.amountReceived || 0) > 0
        ? `<tr>
      <td>Espèces reçues :</td>
      <td class="text-right">${fmt(data.totals.amountReceived)}</td>
    </tr>
    <tr>
      <td class="font-bold">Monnaie rendue :</td>
      <td class="text-right font-bold">${fmt(data.totals.changeGiven || 0)}</td>
    </tr>`
        : ''
    }
  </table>

  <div class="divider"></div>

  <div class="text-center footer">
    <div>${data.footerMessage || 'Merci pour vos achats ! À bientôt.'}</div>
    <div style="margin-top: 4px; font-size: 8px; color: #666;">
      Logiciel GESTIO 229 • Supermarché & Supérette
    </div>
  </div>

  <script>
    window.onload = function() {
      ${options.autoPrint ? 'window.print();' : ''}
    };
  </script>
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

/**
 * Génère et télécharge le ticket thermique au format PDF (hauteur dynamique)
 */
export function telechargerTicketPDF(data: TicketData, fileName?: string): void {
  // Calcul approximatif de la hauteur nécessaire
  const nbLignes = data.lines.length
  const hauteurMm = Math.max(140, 90 + nbLignes * 10 + data.payments.length * 6)
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, hauteurMm]
  })

  let y = 8
  doc.setFont('courier', 'bold')
  doc.setFontSize(11)
  doc.text(data.company.name || 'GESTIO 229', 40, y, { align: 'center' })
  y += 4

  doc.setFontSize(8)
  doc.setFont('courier', 'normal')
  if (data.company.address) {
    doc.text(data.company.address, 40, y, { align: 'center' })
    y += 3.5
  }
  if (data.company.phone) {
    doc.text(`Tél : ${data.company.phone}`, 40, y, { align: 'center' })
    y += 3.5
  }
  if (data.sale.isDuplicate) {
    doc.setFont('courier', 'bold')
    doc.text('*** DUPLICATA ***', 40, y, { align: 'center' })
    doc.setFont('courier', 'normal')
    y += 4
  }

  doc.setLineDashPattern([1, 1], 0)
  doc.line(4, y, 76, y)
  y += 4

  doc.setFontSize(7.5)
  doc.text(`Ticket : ${data.sale.orderNumber}`, 4, y)
  y += 3.5
  const dateStr = new Date(data.sale.date).toLocaleString('fr-BJ', { timeZone: 'Africa/Porto-Novo' })
  doc.text(`Date : ${dateStr}`, 4, y)
  y += 3.5
  if (data.sale.cashierName) {
    doc.text(`Caissier : ${data.sale.cashierName}`, 4, y)
    y += 3.5
  }
  doc.text(`Client : ${data.sale.customerName || 'Client Comptoir'}`, 4, y)
  y += 4

  doc.line(4, y, 76, y)
  y += 4

  // Articles
  data.lines.forEach((l) => {
    doc.setFont('courier', 'bold')
    doc.text(l.name.slice(0, 32), 4, y)
    y += 3
    doc.setFont('courier', 'normal')
    doc.text(`${l.qty} ${l.unit || 'u'} x ${fmt(l.unitPrice)}`, 4, y)
    doc.text(fmt(l.total), 76, y, { align: 'right' })
    y += 3.5
  })

  doc.line(4, y, 76, y)
  y += 4

  // Totaux
  doc.text('Sous-total :', 4, y)
  doc.text(fmt(data.totals.subtotal), 76, y, { align: 'right' })
  y += 3.5

  if (data.totals.discount > 0) {
    doc.text('Remise :', 4, y)
    doc.text(`-${fmt(data.totals.discount)}`, 76, y, { align: 'right' })
    y += 3.5
  }

  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  doc.text('TOTAL NET :', 4, y)
  doc.text(fmt(data.totals.totalNet), 76, y, { align: 'right' })
  y += 4
  doc.setFontSize(7.5)
  doc.setFont('courier', 'normal')

  doc.line(4, y, 76, y)
  y += 4

  // Règlements
  data.payments.forEach((p) => {
    doc.text(`Règlement (${p.method}) :`, 4, y)
    doc.text(fmt(p.amount), 76, y, { align: 'right' })
    y += 3.5
  })

  if ((data.totals.amountReceived || 0) > 0) {
    doc.text('Espèces reçues :', 4, y)
    doc.text(fmt(data.totals.amountReceived), 76, y, { align: 'right' })
    y += 3.5
    doc.setFont('courier', 'bold')
    doc.text('Monnaie rendue :', 4, y)
    doc.text(fmt(data.totals.changeGiven || 0), 76, y, { align: 'right' })
    doc.setFont('courier', 'normal')
    y += 4
  }

  doc.line(4, y, 76, y)
  y += 5

  doc.setFontSize(7)
  doc.text(data.footerMessage || 'Merci pour votre confiance !', 40, y, { align: 'center' })

  const name = fileName || `Ticket_${data.sale.orderNumber}.pdf`
  doc.save(name)
}
