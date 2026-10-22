// =============================================================================
// GESTIO 229 SaaS — Onglet Paramètres Commerciaux & Fiscaux des Carburants
// Module « Pompes & Cuves » — Station-Service & Hydrocarbures
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, Shield, Calendar, Clock, RefreshCw, FileText, CheckCircle2,
  AlertTriangle, History, ArrowUpRight, ArrowDownRight, Edit3, X, Save, Info, Lock
} from 'lucide-react'
import { formatFCFA } from '../../utils/tax'
import {
  FuelCommercialConfig,
  FuelPriceHistoryEntry,
  loadFuelCommercialConfigs,
  saveFuelCommercialConfig,
  getFuelPriceHistory,
  calculateFuelAcquisitionCost,
  getEnterpriseFiscalDefaults
} from '../../services/stationFuelService'

interface Props {
  companyId: string
  company: any
  user: any
  isAdmin: boolean
  onPriceUpdated?: () => void
}

export const StationFuelPricingTab: React.FC<Props> = ({
  companyId,
  company,
  user,
  isAdmin,
  onPriceUpdated
}) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configs, setConfigs] = useState<FuelCommercialConfig[]>([])
  const [history, setHistory] = useState<FuelPriceHistoryEntry[]>([])
  const [costs, setCosts] = useState<Record<string, { unitCost: number; hasActual: boolean; methode: string }>>({})

  // Modal d'édition d'un tarif officiel
  const [editingConfig, setEditingConfig] = useState<FuelCommercialConfig | null>(null)
  const [formPrice, setFormPrice] = useState<number>(680)
  const [formCostPrice, setFormCostPrice] = useState<number>(620)
  const [formDateEffet, setFormDateEffet] = useState<string>('')
  const [formTimeEffet, setFormTimeEffet] = useState<string>('00:00')
  const [formTvaApplicable, setFormTvaApplicable] = useState<boolean>(true)
  const [formTvaRate, setFormTvaRate] = useState<number>(18)
  const [formSource, setFormSource] = useState<string>('')
  const [formNotes, setFormNotes] = useState<string>('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Droits : Seuls administrateurs, gérants et responsables autorisés peuvent modifier les prix
  const canManagePrices = isAdmin || user?.role === 'gerant' || user?.role === 'responsable' || user?.role === 'responsable_station'

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const companyRegime = company?.regime_fiscal || 'Régime Réel Simplifié (RRS)'
      const defaultTvaRate = typeof company?.tva_default_rate === 'number' ? company.tva_default_rate : 18

      const loadedConfigs = await loadFuelCommercialConfigs(companyId, companyRegime, defaultTvaRate)
      setConfigs(loadedConfigs)

      const loadedHist = await getFuelPriceHistory(companyId)
      setHistory(loadedHist)

      // Calculer les coûts d'acquisition CUMP actuels pour chaque carburant
      const costMap: Record<string, { unitCost: number; hasActual: boolean; methode: string }> = {}
      for (const conf of loadedConfigs) {
        const costRes = await calculateFuelAcquisitionCost(companyId, conf.nom, conf.prix_achat_reference)
        costMap[conf.code] = {
          unitCost: costRes.unitCost,
          hasActual: costRes.hasActualReceptions,
          methode: costRes.methode
        }
      }
      setCosts(costMap)

    } catch (err: any) {
      console.error('[StationFuelPricingTab] Erreur chargement:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, company])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Ouvrir la modale d'édition
  const handleOpenEdit = (conf: FuelCommercialConfig) => {
    if (!canManagePrices) {
      setNotification({
        type: 'error',
        message: 'Accès refusé : Seul le gérant ou un administrateur peut modifier les tarifs officiels et paramètres fiscaux des carburants.'
      })
      return
    }

    const now = new Date()
    const dStr = now.toISOString().slice(0, 10)
    const tStr = now.toTimeString().slice(0, 5)

    setEditingConfig(conf)
    setFormPrice(conf.prix_vente)
    setFormCostPrice(conf.prix_achat_reference)
    setFormDateEffet(conf.date_effet ? conf.date_effet.slice(0, 10) : dStr)
    setFormTimeEffet(conf.date_effet && conf.date_effet.includes('T') ? conf.date_effet.slice(11, 16) : tStr)
    setFormTvaApplicable(conf.is_tva_applicable)
    setFormTvaRate(conf.taux_tva)
    setFormSource(conf.source_reglementaire || 'Arrêté ministériel interministériel')
    setFormNotes(conf.notes || '')
    setNotification(null)
  }

  // Enregistrer la modification
  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingConfig || !companyId) return

    if (formPrice <= 0) {
      setNotification({ type: 'error', message: 'Le prix de vente officiel au litre doit être supérieur à 0 FCFA.' })
      return
    }

    setSaving(true)
    setNotification(null)

    try {
      const fullDateEffet = formDateEffet ? `${formDateEffet}T${formTimeEffet || '00:00'}:00.000Z` : new Date().toISOString()
      const fiscalDefaults = getEnterpriseFiscalDefaults(company?.regime_fiscal, company?.tva_default_rate)

      const updatedPayload: FuelCommercialConfig = {
        ...editingConfig,
        prix_vente: Number(formPrice),
        prix_achat_reference: Number(formCostPrice) || 0,
        date_effet: fullDateEffet,
        source_reglementaire: formSource || 'Arrêté ministériel officiel',
        is_tva_applicable: formTvaApplicable,
        taux_tva: formTvaApplicable ? Number(formTvaRate) || 18 : 0,
        statut_fiscal: formTvaApplicable ? `Assujetti TVA (${formTvaRate}%)` : fiscalDefaults.statut_fiscal,
        regime_fiscal_entreprise: company?.regime_fiscal || 'RRS',
        notes: formNotes,
        updated_by: user?.name || user?.email || 'Administrateur'
      }

      const res = await saveFuelCommercialConfig(
        companyId,
        updatedPayload,
        user?.id,
        user?.name || user?.email
      )

      if (!res.success) {
        throw new Error(res.error || 'Erreur lors de la sauvegarde du tarif officiel')
      }

      setNotification({
        type: 'success',
        message: `Tarif officiel de ${editingConfig.nom} mis à jour : ${formatFCFA(formPrice)} / Litre. Synchronisation appliquée aux pistolets et à la vente.`
      })
      setEditingConfig(null)
      await loadData()
      if (onPriceUpdated) onPriceUpdated()

    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Impossible d\'enregistrer le tarif.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ─── Bannière Titre & Rôles ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-amber-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-amber-500 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/30">
              <DollarSign className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-black tracking-tight">Paramètres Commerciaux & Fiscaux des Carburants</h2>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Tarifs officiels fixés par l'État, TVA, coûts d'acquisition CUMP et marges brutes de référence.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Régime Fiscal Entreprise</span>
            <span className="text-xs font-bold text-amber-300">
              {company?.regime_fiscal || 'Régime Réel Simplifié (RRS)'}
            </span>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition text-white"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between text-xs font-bold ${
          notification.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Cartes des 3 Carburants Officiels ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {configs.map((conf) => {
          const cost = costs[conf.code]
          const unitCost = cost ? cost.unitCost : conf.prix_achat_reference
          const puHT = conf.is_tva_applicable && conf.taux_tva > 0
            ? Math.round((conf.prix_vente / (1 + conf.taux_tva / 100)) * 100) / 100
            : conf.prix_vente
          const margeUnitaire = unitCost > 0 ? Math.round((puHT - unitCost) * 100) / 100 : null
          const tauxMarque = (unitCost > 0 && puHT > 0 && margeUnitaire !== null)
            ? Math.round(((margeUnitaire / puHT) * 100) * 10) / 10
            : null

          const isSuper = conf.nom.includes('Super')
          const isGasoil = conf.nom.includes('Gasoil')
          const badgeColor = isSuper
            ? 'from-emerald-600 to-teal-700 border-emerald-500/30'
            : isGasoil
            ? 'from-blue-600 to-indigo-700 border-blue-500/30'
            : 'from-amber-600 to-orange-700 border-amber-500/30'

          return (
            <div
              key={conf.code}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between"
            >
              {/* En-tête Carburant */}
              <div className={`p-5 bg-gradient-to-br ${badgeColor} text-white`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-white/20">
                    {conf.code}
                  </span>
                  <span className="text-[10px] font-semibold text-white/80 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Effet: {conf.date_effet ? new Date(conf.date_effet).toLocaleDateString('fr-FR') : 'Immédiat'}
                  </span>
                </div>
                <h3 className="text-xl font-black">{conf.nom}</h3>
                <p className="text-[11px] text-white/80 mt-0.5 line-clamp-1">
                  {conf.source_reglementaire || 'Tarif officiel fixé par arrêté ministériel'}
                </p>
              </div>

              {/* Corps des indicateurs financiers & fiscaux */}
              <div className="p-5 space-y-4 text-xs">
                {/* Prix de Vente Officiel */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Prix de Vente Officiel (TTC)
                    </span>
                    <span className="text-2xl font-black text-slate-900">
                      {formatFCFA(conf.prix_vente)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold ml-1">/ Litre</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Net HT</span>
                    <span className="text-xs font-black text-slate-700">
                      {formatFCFA(puHT)} / L
                    </span>
                    {conf.is_tva_applicable && (
                      <span className="text-[10px] text-blue-600 block mt-0.5">
                        +{formatFCFA(Math.round(conf.prix_vente - puHT))} TVA
                      </span>
                    )}
                  </div>
                </div>

                {/* Coût d'achat (TTC / HT / CUMP) */}
                {(() => {
                  const costTtc = unitCost > 0 ? unitCost : conf.prix_achat_reference
                  const costHt = conf.is_tva_applicable && conf.taux_tva > 0
                    ? Math.round((costTtc / (1 + conf.taux_tva / 100)) * 100) / 100
                    : costTtc
                  const costTva = conf.is_tva_applicable && conf.taux_tva > 0
                    ? Math.round((costTtc - costHt) * 100) / 100
                    : 0

                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">
                          Prix Achat TTC
                        </span>
                        <span className="text-sm font-black text-slate-800">
                          {costTtc > 0 ? `${formatFCFA(costTtc)} / L` : 'Non renseigné'}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          HT : {formatFCFA(costHt)} {costTva > 0 ? `(TVA: ${formatFCFA(costTva)})` : ''}
                        </span>
                        <span className="text-[9px] text-indigo-600 block font-semibold truncate mt-0.5">
                          {cost?.hasActual ? 'CUMP (Réceptions réelles)' : 'Coût référence'}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase">
                          Marge Brute / Litre
                        </span>
                        <span className={`text-sm font-black ${
                          margeUnitaire !== null && margeUnitaire >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}>
                          {margeUnitaire !== null ? `${formatFCFA(margeUnitaire)} / L` : 'Indisponible'}
                        </span>
                        <span className="text-[9px] text-slate-500 block mt-0.5 font-bold">
                          {tauxMarque !== null ? `Taux de marque: ${tauxMarque}%` : 'Coût requis'}
                        </span>
                        <span className="text-[9px] text-slate-400 block">
                          {unitCost > 0 && margeUnitaire !== null ? `Taux marge: ${Math.round((margeUnitaire / unitCost) * 1000) / 10}%` : ''}
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Paramétrage Fiscal */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <Shield className={`w-3.5 h-3.5 ${conf.is_tva_applicable ? 'text-blue-600' : 'text-amber-600'}`} />
                    <span className="text-slate-600 font-semibold">TVA :</span>
                    <span className={`font-bold ${conf.is_tva_applicable ? 'text-blue-700' : 'text-amber-700'}`}>
                      {conf.is_tva_applicable ? `${conf.taux_tva}% (Applicable)` : 'Exonéré / TPS (0%)'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {conf.is_tva_applicable ? `${Math.round(conf.prix_vente - puHT)} FCFA TVA/L` : '0 FCFA TVA'}
                  </span>
                </div>
              </div>

              {/* Bouton d'action */}
              <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                  {!canManagePrices && <Lock className="w-3 h-3 text-slate-400" />}
                  {canManagePrices ? 'Accès Gérant / Admin' : 'Lecture seule (Pompiste)'}
                </span>

                <button
                  type="button"
                  disabled={!canManagePrices}
                  onClick={() => handleOpenEdit(conf)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    canManagePrices
                      ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Modifier le tarif
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Historique des Modifications de Prix ─── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-black text-slate-900">Historique Réglementaire des Décisions Tarifaires</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {history.length} modification(s) enregistrée(s)
          </span>
        </div>

        {history.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Aucun changement de tarif enregistré pour le moment. Les prix actuels correspondent aux tarifs nationaux officiels de base.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="py-2.5 px-3">Date d'effet</th>
                  <th className="py-2.5 px-3">Carburant</th>
                  <th className="py-2.5 px-3">Ancien Prix</th>
                  <th className="py-2.5 px-3">Nouveau Prix</th>
                  <th className="py-2.5 px-3">Variation</th>
                  <th className="py-2.5 px-3">Source Réglementaire</th>
                  <th className="py-2.5 px-3">Modifié Par</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => {
                  const diff = h.nouveau_prix - h.ancien_prix
                  return (
                    <tr key={h.id} className="hover:bg-slate-50/80 transition font-medium">
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {h.date_changement ? new Date(h.date_changement).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        }) : '-'}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">{h.produit}</td>
                      <td className="py-3 px-3 text-slate-600">{formatFCFA(h.ancien_prix)}</td>
                      <td className="py-3 px-3 font-black text-slate-900">{formatFCFA(h.nouveau_prix)}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-0.5 font-bold ${
                          diff > 0 ? 'text-rose-600' : diff < 0 ? 'text-emerald-600' : 'text-slate-500'
                        }`}>
                          {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                          {diff > 0 ? `+${diff}` : `${diff}`} FCFA
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-semibold">{h.source_reglementaire || '-'}</td>
                      <td className="py-3 px-3 text-slate-500">{h.modifie_par || 'Admin'}</td>
                      <td className="py-3 px-3 text-slate-400 text-[11px] max-w-xs truncate">{h.notes || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── MODALE D'ÉDITION D'UN TARIF OFFICIEL ─── */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp">
            {/* Entête */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-300">Ajustement Tarifaire Officiel</span>
                <h3 className="text-lg font-black">{editingConfig.nom} ({editingConfig.code})</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingConfig(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSavePrice} className="p-6 space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 mb-1">
                    Prix de Vente Officiel (TTC / L) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-black text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Tarif officiel fixé par arrêté ministériel.</p>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">
                    Prix Unitaire d'Achat TTC (FCFA / L) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-black text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Coût d'achat réel par litre TTC (facture fournisseur).</p>
                </div>
              </div>

              {/* Date & Heure de prise d'effet */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" /> Date de prise d'effet
                  </label>
                  <input
                    type="date"
                    value={formDateEffet}
                    onChange={(e) => setFormDateEffet(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" /> Heure d'effet (H:M)
                  </label>
                  <input
                    type="time"
                    value={formTimeEffet}
                    onChange={(e) => setFormTimeEffet(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Paramétrage Fiscal & TVA */}
              {(() => {
                const liveAchatHT = formTvaApplicable && formTvaRate > 0
                  ? Math.round(formCostPrice / (1 + formTvaRate / 100))
                  : formCostPrice
                const liveTvaAchat = formTvaApplicable && formTvaRate > 0
                  ? formCostPrice - liveAchatHT
                  : 0

                const liveVenteHT = formTvaApplicable && formTvaRate > 0
                  ? Math.round(formPrice / (1 + formTvaRate / 100))
                  : formPrice
                const liveTvaVente = formTvaApplicable && formTvaRate > 0
                  ? formPrice - liveVenteHT
                  : 0

                const liveMarge = formTvaApplicable
                  ? liveVenteHT - liveAchatHT
                  : formPrice - formCostPrice

                return (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="modal_fuel_tva_checkbox"
                          checked={formTvaApplicable}
                          onChange={(e) => setFormTvaApplicable(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <label
                          htmlFor="modal_fuel_tva_checkbox"
                          className="font-bold text-slate-900 cursor-pointer select-none text-xs flex items-center gap-1.5"
                        >
                          <Shield className="w-3.5 h-3.5 text-amber-600" />
                          TVA applicable sur les carburants
                        </label>
                      </div>

                      <span className="text-[10px] text-slate-500 font-medium">
                        Régime : {company?.regime_fiscal || 'Régime Réel Simplifié (RRS)'}
                      </span>
                    </div>

                    {formTvaApplicable ? (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-600 mb-0.5">Taux TVA (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={formTvaRate}
                              onChange={(e) => setFormTvaRate(Number(e.target.value))}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-xs"
                            />
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-500 mb-0.5">Achat Net HT</span>
                            <span className="font-black text-slate-900 text-xs block mt-1">
                              {formatFCFA(liveAchatHT)} / L
                            </span>
                            <span className="text-[9px] text-slate-400">+{formatFCFA(liveTvaAchat)} TVA</span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-500 mb-0.5">Vente Net HT</span>
                            <span className="font-black text-slate-900 text-xs block mt-1">
                              {formatFCFA(liveVenteHT)} / L
                            </span>
                            <span className="text-[9px] text-blue-600">+{formatFCFA(liveTvaVente)} TVA</span>
                          </div>
                        </div>

                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-emerald-900">
                          <span className="font-bold">Marge brute unitaire estimée (HT) :</span>
                          <span className="font-black text-sm">{formatFCFA(liveMarge)} / Litre</span>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <p className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                          TVA décochée / non applicable (Régime TPS ou exonération légale). Aucune TVA n'est imputée ni ajoutée aux prix d'achat ou de vente.
                        </p>
                        <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between text-slate-800">
                          <span className="font-bold">Marge brute unitaire estimée (TTC) :</span>
                          <span className="font-black text-sm">{formatFCFA(liveMarge)} / Litre</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Source Réglementaire & Notes */}
              <div>
                <label className="block text-slate-700 mb-1">
                  Source Réglementaire / Décision Officielle
                </label>
                <input
                  type="text"
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  placeholder="Ex: Arrêté N°2026/04 du Ministère de l'Industrie et du Commerce"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Notes & Justification</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Commentaires internes sur l'application de ce nouveau barème..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingConfig(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-amber-500/20 transition"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Enregistrement...' : 'Valider & Appliquer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default StationFuelPricingTab
