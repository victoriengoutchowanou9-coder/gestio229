// =============================================================================
// GESTIO 229 SaaS — Modal Création Facture d'Avoir
// Global Tous Secteurs + Extension Emballages Brasserie Exclusivement
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  X, AlertTriangle, CheckCircle2, RotateCcw,
  Package, DollarSign, CreditCard, Wallet,
  Calendar, Layers, ArrowDownRight, RefreshCw, FileText
} from 'lucide-react'
import { ModalPortal } from '../modals/ModalPortal'
import {
  ModeRemboursementAvoir,
  EtatArticleAvoir,
  checkIsBrasserieSector,
  getClientEmballagesCreance,
  getAvoirsByFacture,
  handleValidationAvoir,
  FactureAvoirRecord,
  ClientEmballagesCreance
} from '../../services/factureAvoirService'
import { formatFCFA } from '../../utils/tax'
import { useAuthStore } from '../../store/authStore'
import { useTenant } from '../../hooks/useTenant'

export interface CreerAvoirModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (avoir: FactureAvoirRecord) => void
  initialFactureId?: string | null
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

export const CreerAvoirModal: React.FC<CreerAvoirModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialFactureId,
  currentSectorSlug: propSectorSlug,
  caisseStatus,
  salesList,
  productsList,
  customersList
}) => {
  const { company, user } = useAuthStore()
  const { sectorSlug } = useTenant()
  const effectiveSectorSlug = propSectorSlug || sectorSlug || 'boutique'

  // VÉRIFICATION STRICTE DE LA CONDITION BRASSERIE :
  const isBrasserie = useMemo(() => {
    return checkIsBrasserieSector(effectiveSectorSlug)
  }, [effectiveSectorSlug])

  // Sélection de facture initiale
  const [selectedFactureId, setSelectedFactureId] = useState<string>(initialFactureId || '')
  const [motif, setMotif] = useState('Retour de marchandise / Erreur commande')
  const [modeRemboursement, setModeRemboursement] = useState<ModeRemboursementAvoir>('especes')
  const [remboursementEffectue, setRemboursementEffectue] = useState(true)

  // Extension Brasserie : Emballages
  const [creanceEmballages, setCreanceEmballages] = useState<ClientEmballagesCreance>({
    qte_casiers_dus: 0,
    qte_bouteilles_dues: 0
  })
  const [qteCasiersRetournes, setQteCasiersRetournes] = useState<number>(0)
  const [qteBouteillesRetournes, setQteBouteillesRetournes] = useState<number>(0)

  // Lignes de retour d'articles
  const [selectedArticles, setSelectedArticles] = useState<
    Record<
      string,
      {
        selected: boolean
        qte: number
        etat: EtatArticleAvoir
        prix_unitaire: number
        prix_achat: number
        article_nom: string
        qte_max: number
      }
    >
  >({})

  const [loadingAvoirsFacture, setLoadingAvoirsFacture] = useState(false)
  const [dejaAvoiresMap, setDejaAvoiresMap] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Facture active sélectionnée
  const activeFacture = useMemo(() => {
    if (!selectedFactureId) return null
    return salesList.find((s) => s.id === selectedFactureId) || null
  }, [selectedFactureId, salesList])

  // Synchronisation lors de l'ouverture
  useEffect(() => {
    if (initialFactureId) {
      setSelectedFactureId(initialFactureId)
    }
  }, [initialFactureId])

  // Charger les avoirs précédents dès qu'une facture est sélectionnée
  useEffect(() => {
    if (!activeFacture || !company?.id) {
      setDejaAvoiresMap({})
      setSelectedArticles({})
      return
    }

    let isMounted = true
    setLoadingAvoirsFacture(true)
    setErrorMessage(null)

    getAvoirsByFacture(company.id, activeFacture.id)
      .then((prevAvoirs) => {
        if (!isMounted) return
        const map: Record<string, number> = {}
        prevAvoirs.forEach((a) => {
          if (a.lignes) {
            a.lignes.forEach((l) => {
              map[l.article_id] = (map[l.article_id] || 0) + Number(l.qte_retournee)
            })
          }
        })
        setDejaAvoiresMap(map)

        // Initialiser les lignes d'articles disponibles
        const items = activeFacture.lines || activeFacture.items || []
        const initSelection: Record<string, any> = {}

        items.forEach((it: any) => {
          const prodId = it.product_id || it.product?.id || it.id
          const artNom = it.product_name || it.product?.name || it.name || 'Article'
          const qteFact = Number(it.quantity ?? it.qty ?? 0)
          const dejaAvoire = map[prodId] || 0
          const dispo = Math.max(0, qteFact - dejaAvoire)

          let pu = Number(it.unit_price ?? it.unitPrice ?? 0)
          if (!pu && qteFact > 0) {
            pu = Math.round((Number(it.total_ttc ?? it.total_amount ?? 0) / qteFact) * 100) / 100
          }

          let pa = Number(it.unit_cost ?? it.cost_price ?? it.product?.cost_price ?? 0)
          if (!pa) {
            const pCatalog = productsList.find((p) => p.id === prodId)
            pa = Number(pCatalog?.cost_price || pCatalog?.purchase_price || 0)
          }

          initSelection[prodId] = {
            selected: dispo > 0,
            qte: dispo > 0 ? 1 : 0,
            etat: 'bon' as EtatArticleAvoir,
            prix_unitaire: pu,
            prix_achat: pa,
            article_nom: artNom,
            qte_max: dispo
          }
        })

        setSelectedArticles(initSelection)
      })
      .finally(() => {
        if (isMounted) setLoadingAvoirsFacture(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeFacture, company?.id, productsList])

  // Charger la situation emballages client SI ET SEULEMENT SI isBrasserie
  useEffect(() => {
    if (!isBrasserie || !company?.id || !activeFacture?.customer_id) {
      setCreanceEmballages({ qte_casiers_dus: 0, qte_bouteilles_dues: 0 })
      setQteCasiersRetournes(0)
      setQteBouteillesRetournes(0)
      return
    }

    getClientEmballagesCreance(company.id, activeFacture.customer_id, true).then((res) => {
      setCreanceEmballages(res)
      setQteCasiersRetournes(res.qte_casiers_dus > 0 ? Math.min(res.qte_casiers_dus, 2) : 0)
      setQteBouteillesRetournes(res.qte_bouteilles_dues > 0 ? Math.min(res.qte_bouteilles_dues, 12) : 0)
    })
  }, [isBrasserie, company?.id, activeFacture?.customer_id])

  // ---------------------------------------------------------------------------
  // CALCULS D'IMPACT EN TEMPS RÉEL AVANT VALIDATION
  // ---------------------------------------------------------------------------
  const {
    totalAvoir,
    qteStockVendableRestituee,
    qteStockAvarieRestituee,
    montantInitialFacture,
    nouvelleValeurFactureNet,
    reductionMargeEstimee,
    soldeFactureRestant
  } = useMemo(() => {
    let tot = 0
    let stkBon = 0
    let stkAvarie = 0
    let margePerdue = 0

    Object.entries(selectedArticles).forEach(([_, item]) => {
      if (item.selected && item.qte > 0) {
        const montantLigne = item.qte * item.prix_unitaire
        tot += montantLigne

        if (['bon', 'acceptable'].includes(item.etat)) {
          stkBon += item.qte
        } else {
          stkAvarie += item.qte
        }

        const margeUnitaire = Math.max(0, item.prix_unitaire - item.prix_achat)
        margePerdue += item.qte * margeUnitaire
      }
    })

    const montInit = Number(activeFacture?.total_amount ?? activeFacture?.montant_total ?? 0)
    const dejaAvoirSomme = Object.values(dejaAvoiresMap).reduce((acc, q) => acc + q, 0)
    // Solde disponible avant cet avoir
    const soldeRestant = Math.max(0, montInit - (activeFacture?.total_avoirs || 0))
    const nvNet = Math.max(0, soldeRestant - tot)

    return {
      totalAvoir: tot,
      qteStockVendableRestituee: stkBon,
      qteStockAvarieRestituee: stkAvarie,
      montantInitialFacture: montInit,
      nouvelleValeurFactureNet: nvNet,
      reductionMargeEstimee: margePerdue,
      soldeFactureRestant: soldeRestant
    }
  }, [selectedArticles, activeFacture, dejaAvoiresMap])

  // Statut client et créance
  const isCreditSale = useMemo(() => {
    if (!activeFacture) return false
    const ps = String(activeFacture.payment_status || '').toLowerCase()
    return (
      ps.includes('credit') ||
      ps.includes('impaye') ||
      ps.includes('partiel') ||
      Number(activeFacture.credit_amount || 0) > 0
    )
  }, [activeFacture])

  const clientName = activeFacture?.customer_name || activeFacture?.customer?.name || 'Client Comptoir'
  const isCaisseFermee = !caisseStatus?.isTodayOpen
  const requiresCaisseOpen =
    remboursementEffectue && (modeRemboursement === 'especes' || modeRemboursement === 'momo')

  // Validation et soumission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!activeFacture) {
      setErrorMessage('Veuillez sélectionner une facture initiale.')
      return
    }

    if (totalAvoir <= 0) {
      setErrorMessage('Veuillez cocher et saisir au moins un article avec une quantité supérieure à 0.')
      return
    }

    if (totalAvoir > soldeFactureRestant) {
      setErrorMessage(
        `Le montant de l'avoir (${formatFCFA(totalAvoir)}) dépasse le solde restant de la facture (${formatFCFA(soldeFactureRestant)}).`
      )
      return
    }

    if (requiresCaisseOpen && isCaisseFermee) {
      setErrorMessage(
        'Ouvrir la caisse d\'abord pour rembourser. Fond actuel : 0 si fermée (Bandeau jaune Caisse requise).'
      )
      return
    }

    // Préparer les lignes d'avoir
    const lignesPayload = Object.entries(selectedArticles)
      .filter(([_, it]) => it.selected && it.qte > 0)
      .map(([artId, it]) => ({
        article_id: artId,
        article_nom: it.article_nom,
        qte_retournee: it.qte,
        prix_unitaire: it.prix_unitaire,
        prix_achat: it.prix_achat,
        etat_article: it.etat,
        qte_facturee: it.qte_max + (dejaAvoiresMap[artId] || 0),
        qte_deja_avoir: dejaAvoiresMap[artId] || 0
      }))

    setSubmitting(true)
    try {
      const res = await handleValidationAvoir({
        company_id: company?.id || '',
        secteur_id: activeFacture.secteur_id || null,
        sector_slug: effectiveSectorSlug,
        facture_initiale_id: activeFacture.id,
        client_id: activeFacture.customer_id || null,
        client_nom: clientName,
        motif,
        mode_remboursement: modeRemboursement,
        remboursement_effectue: remboursementEffectue,
        lignes: lignesPayload,
        user_id: user?.id,
        user_nom: user?.full_name || 'Caissier',
        // Exclusivement si Brasserie :
        qte_casiers_retournes: isBrasserie ? Number(qteCasiersRetournes) || 0 : 0,
        qte_bouteilles_retournes: isBrasserie ? Number(qteBouteillesRetournes) || 0 : 0
      })

      if (!res.success || !res.avoir) {
        setErrorMessage(res.message || 'Erreur lors de la validation de l\'avoir.')
        return
      }

      onSuccess(res.avoir)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur inattendue lors de la validation.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-rose-700 via-rose-600 to-amber-600 text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <RotateCcw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold">Créer une Facture d'Avoir</h3>
                <p className="text-xs text-rose-100 flex items-center gap-1.5">
                  <span>Standard Global Tous Secteurs</span>
                  {isBrasserie && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 text-[10px] font-semibold">
                      Extension Emballages Brasserie Active
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Corps de la modale */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Alerte Erreur éventuelle */}
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="font-medium">{errorMessage}</div>
              </div>
            )}

            {/* Alerte caisse fermée si remboursement caisse sélectionné */}
            {requiresCaisseOpen && isCaisseFermee && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Attention : Caisse actuellement fermée !</span>
                  <p className="mt-0.5 text-amber-800">
                    Ouvrir la caisse d'abord pour rembourser. Fond actuel : 0 si fermée. (Ou choisissez "Crédit Client" ou décochez "Remboursement immédiat").
                  </p>
                </div>
              </div>
            )}

            {/* Étape 1 : Sélection de la Facture Initiale */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-500" />
                  Facture Initiale Obligatoire <span className="text-rose-500">*</span>
                </label>
                {activeFacture && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    Client : {clientName} ({isCreditSale ? 'À Crédit' : 'Comptant'})
                  </span>
                )}
              </div>

              <select
                value={selectedFactureId}
                onChange={(e) => setSelectedFactureId(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
              >
                <option value="">-- Sélectionner une facture initiale --</option>
                {salesList.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.order_number || sale.numero || sale.id.slice(0, 8)} —{' '}
                    {new Date(sale.created_at || sale.order_date || '').toLocaleDateString('fr-FR')} —{' '}
                    {formatFCFA(sale.total_amount || sale.montant_total || 0)} —{' '}
                    {sale.customer_name || 'Client Comptoir'}
                  </option>
                ))}
              </select>

              {activeFacture && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] border-t border-slate-200/60">
                  <div>
                    <span className="text-slate-400 block">Montant Initial:</span>
                    <strong className="text-slate-700">{formatFCFA(montantInitialFacture)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Avoirs Validés:</span>
                    <strong className="text-rose-600">
                      {formatFCFA(activeFacture.total_avoirs || 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Solde Restant Dispo:</span>
                    <strong className="text-emerald-700 font-bold">{formatFCFA(soldeFactureRestant)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Mode Initial:</span>
                    <strong className="text-slate-700 capitalize">
                      {activeFacture.payment_status || 'Comptant'}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Étape 2 : Lignes de la Facture & Quantités à Avoirer */}
            {activeFacture && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-rose-500" />
                    Articles de la Facture & Retour Stock
                  </h4>
                  {loadingAvoirsFacture && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Vérification plafonds...
                    </span>
                  )}
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">Avoir</th>
                          <th className="py-2.5 px-3">Désignation</th>
                          <th className="py-2.5 px-2 text-center">Facturé</th>
                          <th className="py-2.5 px-2 text-center">Déjà Avoiré</th>
                          <th className="py-2.5 px-2 text-center">Dispo</th>
                          <th className="py-2.5 px-3 text-center w-24">Qté Retour</th>
                          <th className="py-2.5 px-3">État Article</th>
                          <th className="py-2.5 px-3 text-right">P.U. (FCFA)</th>
                          <th className="py-2.5 px-3 text-right">Total Avoir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(selectedArticles).length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                              Aucun article récupéré sur cette facture.
                            </td>
                          </tr>
                        ) : (
                          Object.entries(selectedArticles).map(([artId, it]) => {
                            const isDispo = it.qte_max > 0
                            return (
                              <tr
                                key={artId}
                                className={
                                  it.selected && isDispo
                                    ? 'bg-rose-50/40'
                                    : !isDispo
                                    ? 'opacity-50 bg-slate-50'
                                    : 'hover:bg-slate-50/60'
                                }
                              >
                                <td className="py-2.5 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={it.selected && isDispo}
                                    disabled={!isDispo || submitting}
                                    onChange={(e) => {
                                      setSelectedArticles((prev) => ({
                                        ...prev,
                                        [artId]: {
                                          ...prev[artId],
                                          selected: e.target.checked,
                                          qte: e.target.checked ? Math.min(1, it.qte_max) : 0
                                        }
                                      }))
                                    }}
                                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                                  />
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-800">
                                  {it.article_nom}
                                </td>
                                <td className="py-2.5 px-2 text-center text-slate-600">
                                  {it.qte_max + (dejaAvoiresMap[artId] || 0)}
                                </td>
                                <td className="py-2.5 px-2 text-center text-rose-600 font-semibold">
                                  {dejaAvoiresMap[artId] || 0}
                                </td>
                                <td className="py-2.5 px-2 text-center font-bold text-emerald-700">
                                  {it.qte_max}
                                </td>
                                <td className="py-2.5 px-3">
                                  <input
                                    type="number"
                                    min={0}
                                    max={it.qte_max}
                                    value={it.qte}
                                    disabled={!it.selected || !isDispo || submitting}
                                    onChange={(e) => {
                                      const val = Math.max(0, Math.min(it.qte_max, Number(e.target.value) || 0))
                                      setSelectedArticles((prev) => ({
                                        ...prev,
                                        [artId]: { ...prev[artId], qte: val }
                                      }))
                                    }}
                                    className="w-20 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500"
                                  />
                                </td>
                                <td className="py-2.5 px-3">
                                  <select
                                    value={it.etat}
                                    disabled={!it.selected || !isDispo || submitting}
                                    onChange={(e) => {
                                      setSelectedArticles((prev) => ({
                                        ...prev,
                                        [artId]: { ...prev[artId], etat: e.target.value as EtatArticleAvoir }
                                      }))
                                    }}
                                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium"
                                  >
                                    <option value="bon">Bon (Stock vendable)</option>
                                    <option value="acceptable">Acceptable (Vendable)</option>
                                    <option value="endommage">Endommagé (Stock Avarié)</option>
                                    <option value="perime">Périmé (Stock Avarié)</option>
                                  </select>
                                </td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-600">
                                  {formatFCFA(it.prix_unitaire)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                                  {formatFCFA(it.qte * it.prix_unitaire)}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION CONDITIONNELLE EXCLUSIVE : BRASSERIE & DÉPÔT DE BOISSONS */}
            {isBrasserie && activeFacture && (
              <div className="bg-emerald-50/80 border-2 border-emerald-300 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                    <Layers className="w-4 h-4 text-emerald-700" />
                    <span>Retour Emballages Consignés (Exclusif Brasserie)</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-bold">
                    Dépôt Boissons
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-600 font-medium">Casiers Dus par le Client :</span>
                      <strong className="text-rose-700 font-black text-sm">
                        {creanceEmballages.qte_casiers_dus}
                      </strong>
                    </div>
                    <label className="text-[11px] text-slate-500 block mb-1">
                      Quantité casiers vides retournés avec cet avoir :
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={qteCasiersRetournes}
                      onChange={(e) => setQteCasiersRetournes(Math.max(0, Number(e.target.value) || 0))}
                      disabled={submitting}
                      className="w-full px-3 py-1.5 border border-emerald-300 rounded-lg text-xs font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-emerald-200">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-slate-600 font-medium">Bouteilles Dues par le Client :</span>
                      <strong className="text-rose-700 font-black text-sm">
                        {creanceEmballages.qte_bouteilles_dues}
                      </strong>
                    </div>
                    <label className="text-[11px] text-slate-500 block mb-1">
                      Quantité bouteilles vides retournées avec cet avoir :
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={qteBouteillesRetournes}
                      onChange={(e) => setQteBouteillesRetournes(Math.max(0, Number(e.target.value) || 0))}
                      disabled={submitting}
                      className="w-full px-3 py-1.5 border border-emerald-300 rounded-lg text-xs font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-emerald-800 italic">
                  * La validation réduira automatiquement la créance casiers/bouteilles du client dans le suivi des consignations.
                </p>
              </div>
            )}

            {/* Étape 3 & 5 : Mode de Remboursement & Sortie Caisse */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <label className="text-xs font-bold text-slate-700 block">
                  Mode de Remboursement / Compensation
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode_remboursement"
                      value="especes"
                      checked={modeRemboursement === 'especes'}
                      onChange={() => setModeRemboursement('especes')}
                      disabled={submitting}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-semibold text-slate-700">Espèces (Sortie Fond Actuel Espèces)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode_remboursement"
                      value="momo"
                      checked={modeRemboursement === 'momo'}
                      onChange={() => setModeRemboursement('momo')}
                      disabled={submitting}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-semibold text-slate-700">MoMo (Sortie Fond Actuel MoMo)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode_remboursement"
                      value="credit_client"
                      checked={modeRemboursement === 'credit_client'}
                      onChange={() => setModeRemboursement('credit_client')}
                      disabled={submitting}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-semibold text-slate-700">
                      Crédit Client (Réduit la créance due / Avoir en compte)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode_remboursement"
                      value="banque"
                      checked={modeRemboursement === 'banque'}
                      onChange={() => setModeRemboursement('banque')}
                      disabled={submitting}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-semibold text-slate-700">Banque / Virement</span>
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remboursementEffectue}
                      onChange={(e) => setRemboursementEffectue(e.target.checked)}
                      disabled={submitting}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-bold text-slate-800">
                      Remboursement effectué immédiatement
                    </span>
                  </label>
                  {!remboursementEffectue && (
                    <p className="text-[11px] text-slate-500 mt-1 pl-5">
                      Si décoché : Aucune sortie de caisse ne sera déduite immédiatement. L'avoir reste en attente de déblocage.
                    </p>
                  )}
                </div>
              </div>

              {/* Motif */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 flex flex-col justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Motif de l'Avoir <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    disabled={submitting}
                    placeholder="Raison du retour (marchandise non conforme, avariée, annulation partielle...)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-[11px] space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>Caisse Session Actuelle:</span>
                    <strong className={caisseStatus?.isTodayOpen ? 'text-emerald-600' : 'text-rose-600'}>
                      {caisseStatus?.isTodayOpen ? 'Ouverte aujourd\'hui' : 'Fermée'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Fond actuel Espèces:</span>
                    <strong>{formatFCFA(caisseStatus?.fond_actuel_especes || 0)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Fond actuel MoMo:</span>
                    <strong>{formatFCFA(caisseStatus?.fond_actuel_momo || 0)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* RÉSUMÉ D'IMPACT EN TEMPS RÉEL AVANT VALIDATION */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 sm:p-5 rounded-2xl space-y-3 shadow-md">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <ArrowDownRight className="w-4 h-4" />
                Résumé d'Impact en Temps Réel (Avant Validation)
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-white/10 p-2.5 rounded-xl">
                  <span className="text-slate-300 block text-[10px]">Montant Avoir:</span>
                  <strong className="text-base text-rose-300 font-black">{formatFCFA(totalAvoir)}</strong>
                </div>

                <div className="bg-white/10 p-2.5 rounded-xl">
                  <span className="text-slate-300 block text-[10px]">Stock Vendable:</span>
                  <strong className="text-emerald-400 font-bold">+{qteStockVendableRestituee} unité(s)</strong>
                </div>

                <div className="bg-white/10 p-2.5 rounded-xl">
                  <span className="text-slate-300 block text-[10px]">Stock Avarié:</span>
                  <strong className="text-amber-400 font-bold">+{qteStockAvarieRestituee} unité(s)</strong>
                </div>

                <div className="bg-white/10 p-2.5 rounded-xl">
                  <span className="text-slate-300 block text-[10px]">Caisse ({modeRemboursement}):</span>
                  <strong className="text-rose-300 font-bold">
                    {requiresCaisseOpen ? `-${formatFCFA(totalAvoir)}` : '0 FCFA (Pas de sortie)'}
                  </strong>
                </div>

                <div className="bg-white/10 p-2.5 rounded-xl">
                  <span className="text-slate-300 block text-[10px]">Facture Nette:</span>
                  <strong className="text-white font-bold">{formatFCFA(nouvelleValeurFactureNet)}</strong>
                </div>

                <div className="bg-white/10 p-2.5 rounded-xl">
                  <span className="text-slate-300 block text-[10px]">Créance Client:</span>
                  <strong className="text-emerald-300 font-bold">
                    {isCreditSale ? `-${formatFCFA(totalAvoir)}` : 'Inchangée'}
                  </strong>
                </div>
              </div>

              {isBrasserie && (
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-emerald-300">
                  <span>Impact Emballages Brasserie :</span>
                  <strong>
                    -{qteCasiersRetournes} casiers | -{qteBouteillesRetournes} bouteilles déduits de la dette client
                  </strong>
                </div>
              )}
            </div>
          </form>

          {/* Footer actions */}
          <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || totalAvoir <= 0 || (requiresCaisseOpen && isCaisseFermee)}
              className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Traitement en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Valider la Facture d'Avoir ({formatFCFA(totalAvoir)})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
