// =============================================================================
// GESTIO 229 SaaS — Modal Création & Consultation Facture d'Avoir Intégrale
// Vérification stricte de correspondance + Annulation intégrale + Retour Stock
// Design Responsive (Mobile, Tablette, Desktop) + Export PDF & Impression
// =============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  X, AlertTriangle, CheckCircle2, RotateCcw,
  Package, Plus, Trash2, Printer, Download,
  FileText, User, Phone, Hash, ShieldCheck, Eye, RefreshCw
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ModalPortal } from '../modals/ModalPortal'
import {
  verifierEtAnnulerFactureParAvoir,
  FactureAvoirRecord,
  AvoirSaisieLigneInput
} from '../../services/factureAvoirService'
import { formatFCFA } from '../../utils/tax'
import { useAuthStore } from '../../store/authStore'
import { useTenant } from '../../hooks/useTenant'

export interface CreerAvoirModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (avoir: FactureAvoirRecord) => void
  initialFactureId?: string | null
  initialAvoirRecord?: FactureAvoirRecord | null
  currentSectorSlug?: string
  caisseStatus?: {
    isTodayOpen: boolean
    fond_actuel_especes?: number
    fond_actuel_momo?: number
  } | null
  salesList: any[]
  productsList: any[]
  customersList: any[]
}

interface SaisieLigneUI extends AvoirSaisieLigneInput {
  uiKey: string
}

const createEmptyLine = (): SaisieLigneUI => ({
  uiKey: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  designation: '',
  code: '',
  quantite: 1,
  prix_unitaire: 0
})

export const CreerAvoirModal: React.FC<CreerAvoirModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialFactureId,
  initialAvoirRecord,
  currentSectorSlug: propSectorSlug,
  salesList,
  productsList
}) => {
  const { company, user } = useAuthStore()
  const { sectorSlug } = useTenant()
  const effectiveSectorSlug = propSectorSlug || sectorSlug || 'boutique'

  // Champs du formulaire de saisie manuelle
  const [referenceFacture, setReferenceFacture] = useState('')
  const [clientNom, setClientNom] = useState('')
  const [clientTelephone, setClientTelephone] = useState('')
  const [clientIfu, setClientIfu] = useState('')
  const [motif, setMotif] = useState('Annulation intégrale de facture par avoir')
  const [lignes, setLignes] = useState<SaisieLigneUI[]>([createEmptyLine()])
  const [tvaSaisie, setTvaSaisie] = useState<number>(0)

  // États de traitement & validation
  const [submitting, setSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validatedAvoir, setValidatedAvoir] = useState<
    (FactureAvoirRecord & {
      montant_ht?: number
      montant_tva?: number
      client_telephone?: string
      client_ifu?: string
    }) | null
  >(null)
  const [showFullPreview, setShowFullPreview] = useState(false)

  const printAreaRef = useRef<HTMLDivElement | null>(null)

  // Réinitialisation à l'ouverture
  useEffect(() => {
    if (!isOpen) return

    setValidationErrors([])
    setSubmitting(false)
    setShowFullPreview(false)

    // Si ouverture directe pour consulter un avoir existant
    if (initialAvoirRecord) {
      setValidatedAvoir(initialAvoirRecord as any)
      return
    }

    setValidatedAvoir(null)

    if (initialFactureId) {
      const found = salesList.find(s => s.id === initialFactureId)
      if (found) {
        setReferenceFacture(found.order_number || found.numero || '')
      } else {
        setReferenceFacture('')
      }
    } else {
      setReferenceFacture('')
    }

    setClientNom('')
    setClientTelephone('')
    setClientIfu('')
    setMotif('Annulation intégrale de facture par avoir')
    setLignes([createEmptyLine()])
    setTvaSaisie(0)
  }, [isOpen, initialFactureId, initialAvoirRecord, salesList])

  // Calculs automatiques HT, TVA et TTC
  const totalLignesTTC = useMemo(() => {
    return lignes.reduce((sum, l) => {
      const q = Number(l.quantite) || 0
      const pu = Number(l.prix_unitaire) || 0
      return sum + Math.round(q * pu)
    }, 0)
  }, [lignes])

  const totalHTSaisi = useMemo(() => {
    return Math.max(0, totalLignesTTC - (Number(tvaSaisie) || 0))
  }, [totalLignesTTC, tvaSaisie])

  const handleAddLine = () => {
    setLignes(prev => [...prev, createEmptyLine()])
  }

  const handleRemoveLine = (uiKey: string) => {
    setLignes(prev => (prev.length > 1 ? prev.filter(l => l.uiKey !== uiKey) : prev))
  }

  const handleUpdateLine = (uiKey: string, field: keyof SaisieLigneUI, value: any) => {
    setLignes(prev =>
      prev.map(l => {
        if (l.uiKey !== uiKey) return l
        const updated = { ...l, [field]: value }
        // Auto-complétion du code si l'utilisateur choisit un produit exact du catalogue
        if (field === 'designation') {
          const matchProd = productsList.find(
            p => String(p.name || '').trim().toLowerCase() === String(value || '').trim().toLowerCase()
          )
          if (matchProd && !updated.code) {
            updated.code = matchProd.code || ''
          }
        }
        return updated
      })
    )
  }

  const handleTerminer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const localErrors: string[] = []
    if (!referenceFacture.trim()) {
      localErrors.push('La référence de l’ancienne facture est obligatoire.')
    }
    if (!clientNom.trim()) {
      localErrors.push('Le nom du client (ou la mention « Client comptoir ») est obligatoire.')
    }
    const validLines = lignes.filter(l => l.designation.trim() !== '')
    if (validLines.length === 0) {
      localErrors.push('Veuillez saisir au moins un produit de l’ancienne facture.')
    } else {
      validLines.forEach((l, idx) => {
        if ((Number(l.quantite) || 0) <= 0) {
          localErrors.push(`Ligne ${idx + 1} (« ${l.designation} ») : la quantité doit être supérieure à 0.`)
        }
        if ((Number(l.prix_unitaire) || 0) <= 0) {
          localErrors.push(`Ligne ${idx + 1} (« ${l.designation} ») : le prix unitaire doit être supérieur à 0.`)
        }
      })
    }

    if (localErrors.length > 0) {
      setValidationErrors(localErrors)
      return
    }

    setSubmitting(true)
    setValidationErrors([])

    try {
      const res = await verifierEtAnnulerFactureParAvoir({
        company_id: company?.id || '',
        sector_slug: effectiveSectorSlug,
        reference_facture: referenceFacture.trim(),
        client_nom: clientNom.trim(),
        client_telephone: clientTelephone.trim() || undefined,
        client_ifu: clientIfu.trim() || undefined,
        lignes: validLines.map(l => ({
          designation: l.designation.trim(),
          code: l.code?.trim() || undefined,
          quantite: Number(l.quantite),
          prix_unitaire: Number(l.prix_unitaire)
        })),
        total_ht_saisi: tvaSaisie > 0 ? totalHTSaisi : undefined,
        tva_saisie: tvaSaisie > 0 ? Number(tvaSaisie) : undefined,
        total_ttc_saisi: totalLignesTTC,
        motif: motif.trim() || 'Annulation intégrale de facture par avoir',
        user_id: user?.id,
        user_nom: (user as any)?.full_name || (user as any)?.user_metadata?.full_name || user?.email || 'Utilisateur'
      })

      if (!res.success || !res.avoir) {
        setValidationErrors(res.errors && res.errors.length > 0 ? res.errors : [res.message])
        return
      }

      setValidatedAvoir(res.avoir)
      onSuccess(res.avoir)
    } catch (err: any) {
      setValidationErrors([err?.message || 'Erreur inattendue lors de la validation de l’avoir.'])
    } finally {
      setSubmitting(false)
    }
  }

  // Génération PDF officielle du Document d'Avoir
  const handleDownloadAvoirPDF = () => {
    if (!validatedAvoir) return

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const compName = company?.name || 'GESTIO 229'
    const compAddr = (company as any)?.address || ''
    const compPhone = (company as any)?.phone || ''
    const compIfu = (company as any)?.ifu_number || (company as any)?.ifu || ''

    // En-tête Entreprise
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(compName, 14, 18)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    let yMeta = 24
    if (compAddr) {
      doc.text(compAddr, 14, yMeta)
      yMeta += 4.5
    }
    if (compPhone) {
      doc.text(`Tél : ${compPhone}`, 14, yMeta)
      yMeta += 4.5
    }
    if (compIfu) {
      doc.text(`IFU : ${compIfu}`, 14, yMeta)
    }

    // Bandeau Officiel AVOIR
    doc.setFillColor(225, 29, 72)
    doc.roundedRect(14, 38, 182, 12, 2, 2, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('AVOIR – ANNULATION INTÉGRALE DE FACTURE', 105, 45.5, { align: 'center' })

    // Informations document & client
    doc.setFontSize(9.5)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(`N° Avoir : ${validatedAvoir.numero}`, 14, 58)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Date : ${new Date(validatedAvoir.date_avoir || validatedAvoir.created_at).toLocaleString('fr-FR')}`,
      14,
      64
    )
    doc.text(`Réf. Facture Initiale : ${validatedAvoir.facture_initiale_numero || '-'}`, 14, 70)

    doc.setFont('helvetica', 'bold')
    doc.text('Client :', 120, 58)
    doc.setFont('helvetica', 'normal')
    doc.text(validatedAvoir.client_nom || 'Client comptoir', 120, 64)
    if (validatedAvoir.client_telephone) {
      doc.text(`Tél : ${validatedAvoir.client_telephone}`, 120, 70)
    }
    if (validatedAvoir.client_ifu) {
      doc.text(`IFU : ${validatedAvoir.client_ifu}`, 120, 75)
    }

    // Tableau des articles
    const rows = (validatedAvoir.lignes || []).map(l => [
      l.article_nom || '-',
      String(l.qte_retournee || 0),
      `${Number(l.prix_unitaire || 0).toLocaleString('fr-FR')} FCFA`,
      `${Number(l.total_ligne || 0).toLocaleString('fr-FR')} FCFA`
    ])

    autoTable(doc, {
      startY: 82,
      head: [['Désignation du produit', 'Quantité', 'Prix Unitaire', 'Total TTC']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    })

    const finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 140
    const totTTC = Number(validatedAvoir.montant_total_avoir || 0)
    const totTVA = Number(validatedAvoir.montant_tva || 0)
    const totHT = Number(validatedAvoir.montant_ht ?? Math.max(0, totTTC - totTVA))

    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`Montant HT : ${totHT.toLocaleString('fr-FR')} FCFA`, 196, finalY, { align: 'right' })
    doc.text(`TVA : ${totTVA.toLocaleString('fr-FR')} FCFA`, 196, finalY + 6, { align: 'right' })
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(225, 29, 72)
    doc.text(`TOTAL AVOIR TTC : ${totTTC.toLocaleString('fr-FR')} FCFA`, 196, finalY + 13, { align: 'right' })

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100, 116, 139)
    doc.text(
      `Motif : ${validatedAvoir.motif || 'Annulation intégrale'} | Établi par : ${validatedAvoir.created_by_nom || 'Utilisateur'}`,
      14,
      finalY + 24
    )

    doc.save(`Avoir-${validatedAvoir.numero}.pdf`)
  }

  // Impression dédiée du Document d'Avoir
  const handlePrintAvoir = () => {
    if (!printAreaRef.current) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      window.print()
      return
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Avoir ${validatedAvoir?.numero || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
            .badge { background: #e11d48; color: #fff; padding: 10px 16px; font-weight: bold; text-align: center; border-radius: 6px; margin: 16px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; }
            .right { text-align: right; }
            .center { text-align: center; }
            .totals { margin-top: 18px; text-align: right; font-size: 13px; }
            .totals .ttc { font-size: 16px; font-weight: bold; color: #e11d48; margin-top: 6px; }
          </style>
        </head>
        <body>
          ${printAreaRef.current.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
          {/* ── EN-TÊTE MODAL ── */}
          <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-rose-700 to-rose-600 text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-sm sm:text-base truncate">
                  {validatedAvoir ? `Document d'Avoir — ${validatedAvoir.numero}` : 'Créer un Avoir (Annulation Intégrale)'}
                </h3>
                <p className="text-[11px] text-rose-100 truncate">
                  {validatedAvoir
                    ? 'AVOIR – ANNULATION INTÉGRALE DE FACTURE'
                    : 'Saisie & vérification stricte avant annulation et réintégration stock'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition flex-shrink-0"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── CONTENU PRINCIPAL ── */}
          {validatedAvoir ? (
            /* ── VUE DOCUMENT D'AVOIR OFFICIEL APRÈS VALIDATION ── */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50">
              {!initialAvoirRecord && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-900 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Avoir validé et facture annulée intégralement</p>
                    <p className="text-emerald-700 mt-0.5">
                      Les produits ont été réintégrés au stock et les indicateurs (CA & marge brute) ont été régularisés.
                    </p>
                  </div>
                </div>
              )}

              {/* Aperçu officiel du document d'avoir */}
              <div
                ref={printAreaRef}
                className={clsxPreview(showFullPreview)}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div className="flex items-start gap-3">
                    {(company as any)?.logo_url && (
                      <img
                        src={(company as any).logo_url}
                        alt={company?.name || 'Logo'}
                        className="w-14 h-14 object-contain rounded-lg border border-slate-100 bg-white p-1"
                      />
                    )}
                    <div>
                      <h4 className="font-black text-base text-slate-900">{company?.name || 'GESTIO 229'}</h4>
                      {(company as any)?.address && (
                        <p className="text-xs text-slate-500">{(company as any).address}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                        {(company as any)?.phone && <span>Tél : {(company as any).phone}</span>}
                        {((company as any)?.ifu_number || (company as any)?.ifu) && (
                          <span>IFU : {(company as any).ifu_number || (company as any).ifu}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <span className="inline-block px-3 py-1 bg-rose-600 text-white text-[11px] font-black rounded-lg uppercase tracking-wider badge">
                      AVOIR – ANNULATION INTÉGRALE DE FACTURE
                    </span>
                    <p className="text-xs font-mono font-bold text-slate-900 mt-2">N° : {validatedAvoir.numero}</p>
                    <p className="text-[11px] text-slate-500">
                      Date : {new Date(validatedAvoir.date_avoir || validatedAvoir.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Facture Initiale Annulée</span>
                    <strong className="font-mono text-slate-900">{validatedAvoir.facture_initiale_numero || '-'}</strong>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Établi par : {validatedAvoir.created_by_nom || 'Utilisateur'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Client</span>
                    <strong className="text-slate-900">{validatedAvoir.client_nom || 'Client comptoir'}</strong>
                    {validatedAvoir.client_telephone && (
                      <span className="block text-[11px] text-slate-500">Tél : {validatedAvoir.client_telephone}</span>
                    )}
                    {validatedAvoir.client_ifu && (
                      <span className="block text-[11px] text-slate-500">IFU : {validatedAvoir.client_ifu}</span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="py-2.5 px-3 font-bold">Désignation</th>
                        <th className="py-2.5 px-3 text-center font-bold">Qté</th>
                        <th className="py-2.5 px-3 text-right font-bold">P.U.</th>
                        <th className="py-2.5 px-3 text-right font-bold">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(validatedAvoir.lignes || []).map((l, idx) => (
                        <tr key={l.id || idx}>
                          <td className="py-2 px-3 font-semibold text-slate-800">{l.article_nom}</td>
                          <td className="py-2 px-3 text-center font-mono">{l.qte_retournee}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatFCFA(l.prix_unitaire)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatFCFA(l.total_ligne)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex flex-col items-end space-y-1 text-xs totals">
                  <div className="flex justify-between w-full sm:w-64 text-slate-600">
                    <span>Montant HT :</span>
                    <span className="font-mono font-semibold">
                      {formatFCFA(
                        Number(
                          validatedAvoir.montant_ht ??
                            Math.max(0, Number(validatedAvoir.montant_total_avoir || 0) - Number(validatedAvoir.montant_tva || 0))
                        )
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between w-full sm:w-64 text-slate-600">
                    <span>TVA :</span>
                    <span className="font-mono font-semibold">{formatFCFA(Number(validatedAvoir.montant_tva || 0))}</span>
                  </div>
                  <div className="flex justify-between w-full sm:w-64 text-rose-700 font-black text-sm pt-1 border-t border-slate-200 ttc">
                    <span>TOTAL AVOIR TTC :</span>
                    <span className="font-mono">{formatFCFA(Number(validatedAvoir.montant_total_avoir || 0))}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── FORMULAIRE DE SAISIE MANUELLE & VÉRIFICATION STRICTE ── */
            <form id="form-creer-avoir" onSubmit={handleTerminer} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Alertes de non-conformité */}
              {validationErrors.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl space-y-1.5 text-xs text-rose-900">
                  <div className="flex items-center gap-2 font-black text-rose-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Validation bloquée — Éléments non conformes détectés :</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-rose-800">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Section A : Référence de l'ancienne facture */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-rose-600" />
                  A. Référence de l'ancienne facture <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={referenceFacture}
                  onChange={e => setReferenceFacture(e.target.value)}
                  placeholder="Saisir la référence exacte (ex : POS-20261126-0001)"
                  disabled={submitting}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  Le système vérifiera automatiquement cette facture en base de données au clic sur « TERMINER ».
                </p>
              </div>

              {/* Section B : Identification du client */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <User className="w-4 h-4 text-rose-600" />
                    B. Identification du client <span className="text-rose-600">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setClientNom('Client Comptoir')}
                    className="text-[11px] font-bold text-rose-700 hover:underline"
                  >
                    Client comptoir
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nom / Raison sociale *
                    </label>
                    <input
                      type="text"
                      value={clientNom}
                      onChange={e => setClientNom(e.target.value)}
                      placeholder="Nom du client ou Client comptoir"
                      disabled={submitting}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Téléphone (si disponible)
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={clientTelephone}
                        onChange={e => setClientTelephone(e.target.value)}
                        placeholder="Ex: 97000000"
                        disabled={submitting}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      IFU (si disponible)
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={clientIfu}
                        onChange={e => setClientIfu(e.target.value)}
                        placeholder="Numéro IFU"
                        disabled={submitting}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section C : Articles de l'ancienne facture */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-rose-600" />
                    C. Articles de l'ancienne facture <span className="text-rose-600">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    disabled={submitting}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Ajouter un produit
                  </button>
                </div>

                <datalist id="avoir-products-datalist">
                  {productsList.map((p, idx) => (
                    <option key={p.id || idx} value={p.name} />
                  ))}
                </datalist>

                {/* Tableau Desktop */}
                <div className="hidden md:block border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Désignation du produit *</th>
                        <th className="py-2.5 px-3 w-32">Code / Réf</th>
                        <th className="py-2.5 px-3 w-24 text-center">Qté vendue *</th>
                        <th className="py-2.5 px-3 w-32 text-right">P.U. (FCFA) *</th>
                        <th className="py-2.5 px-3 w-32 text-right">Total</th>
                        <th className="py-2.5 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lignes.map((l) => {
                        const lineTotal = Math.round((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0))
                        return (
                          <tr key={l.uiKey} className="bg-white">
                            <td className="p-2">
                              <input
                                type="text"
                                list="avoir-products-datalist"
                                value={l.designation}
                                onChange={e => handleUpdateLine(l.uiKey, 'designation', e.target.value)}
                                placeholder="Nom exact du produit"
                                disabled={submitting}
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={l.code || ''}
                                onChange={e => handleUpdateLine(l.uiKey, 'code', e.target.value)}
                                placeholder="Optionnel"
                                disabled={submitting}
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-rose-500 outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0.01}
                                step="any"
                                value={l.quantite}
                                onChange={e => handleUpdateLine(l.uiKey, 'quantite', Number(e.target.value))}
                                disabled={submitting}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-center font-bold focus:ring-2 focus:ring-rose-500 outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={l.prix_unitaire}
                                onChange={e => handleUpdateLine(l.uiKey, 'prix_unitaire', Number(e.target.value))}
                                disabled={submitting}
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-right font-mono font-bold focus:ring-2 focus:ring-rose-500 outline-none"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-black text-slate-900">
                              {formatFCFA(lineTotal)}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(l.uiKey)}
                                disabled={lignes.length <= 1 || submitting}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30"
                                title="Supprimer la ligne"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Cartes Mobile / Tablette */}
                <div className="md:hidden space-y-3">
                  {lignes.map((l, idx) => {
                    const lineTotal = Math.round((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0))
                    return (
                      <div key={l.uiKey} className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-500 uppercase">Produit #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(l.uiKey)}
                            disabled={lignes.length <= 1 || submitting}
                            className="p-1 text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          list="avoir-products-datalist"
                          value={l.designation}
                          onChange={e => handleUpdateLine(l.uiKey, 'designation', e.target.value)}
                          placeholder="Désignation du produit *"
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 block">Code</label>
                            <input
                              type="text"
                              value={l.code || ''}
                              onChange={e => handleUpdateLine(l.uiKey, 'code', e.target.value)}
                              placeholder="Réf"
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 block">Qté *</label>
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={l.quantite}
                              onChange={e => handleUpdateLine(l.uiKey, 'quantite', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-center font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 block">P.U. *</label>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={l.prix_unitaire}
                              onChange={e => handleUpdateLine(l.uiKey, 'prix_unitaire', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-right font-mono font-bold"
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 text-xs">
                          <span className="text-slate-500">Total ligne :</span>
                          <span className="font-mono font-black text-slate-900">{formatFCFA(lineTotal)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Motif et Total TTC calculé automatiquement */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Motif de l'annulation par avoir
                    </label>
                    <input
                      type="text"
                      value={motif}
                      onChange={e => setMotif(e.target.value)}
                      disabled={submitting}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800"
                    />
                  </div>
                  <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col justify-between space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>TVA facturée (si applicable) :</span>
                      <input
                        type="number"
                        min={0}
                        value={tvaSaisie}
                        onChange={e => setTvaSaisie(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-right font-mono text-xs text-white"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Montant Total HT :</span>
                      <span className="font-mono font-bold">{formatFCFA(totalHTSaisi)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-700">
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-300">Total TTC Calculé :</span>
                      <span className="text-lg font-black font-mono text-white">{formatFCFA(totalLignesTTC)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* ── PIED DE PAGE MODAL ── */}
          <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 flex-shrink-0">
            {validatedAvoir ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Fermer
                </button>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFullPreview(p => !p)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    {showFullPreview ? 'Vue standard' : 'Consulter'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadAvoirPDF}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger en PDF
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintAvoir}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimer
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  form="form-creer-avoir"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Vérification & Validation...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      TERMINER
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function clsxPreview(expanded: boolean) {
  return expanded
    ? 'bg-white p-6 sm:p-8 rounded-2xl border-2 border-slate-300 shadow-lg'
    : 'bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm'
}
