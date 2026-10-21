// =============================================================================
// GESTIO 229 SaaS — Rapport de Rentabilité & Marges Brutes des Carburants
// Section Dédiée Secteur Station-Service & Hydrocarbures
// =============================================================================
// Calcul automatique des marges par produit : Essence Super, Gasoil, Pétrole.
// Respect rigoureux du Code Général des Impôts (Bénin & UEMOA) et normes SYSCOHADA.
// Séparation stricte : Carburants en vrac vs Lubrifiants et Boutiques.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  TrendingUp, BarChart3, Calendar, Filter, Download, Printer, RefreshCw,
  AlertTriangle, CheckCircle2, DollarSign, Fuel, Info, FileSpreadsheet
} from 'lucide-react'
import { formatFCFA } from '../../utils/tax'
import {
  generateFuelProfitabilityReport,
  FuelProfitabilityItem
} from '../../services/stationFuelService'

interface Props {
  companyId: string
  company: any
}

const fmtVol = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n || 0) + ' L'

export const StationFuelProfitabilityReport: React.FC<Props> = ({
  companyId,
  company
}) => {
  // Filtres de période
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'month' | 'custom'>('month')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<string>('all')

  const [loading, setLoading] = useState(true)
  const [reportData, setReportData] = useState<{
    items: FuelProfitabilityItem[]
    totals: any
  }>({
    items: [],
    totals: {
      quantiteVendueLitres: 0,
      chiffreAffairesTTC: 0,
      chiffreAffairesNetHT: 0,
      tvaCollectee: 0,
      coutQuantitesVendues: 0,
      margeBruteTotale: 0,
      tauxMargeMoyen: 0,
      tauxMarqueMoyen: 0
    }
  })

  // Calcul des dates selon le filtre
  const dateRange = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    if (periodPreset === 'today') {
      return {
        start: `${todayStr}T00:00:00.000Z`,
        end: `${todayStr}T23:59:59.999Z`,
        label: `Aujourd'hui (${now.toLocaleDateString('fr-FR')})`
      }
    }

    if (periodPreset === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yStr = y.toISOString().slice(0, 10)
      return {
        start: `${yStr}T00:00:00.000Z`,
        end: `${yStr}T23:59:59.999Z`,
        label: `Hier (${y.toLocaleDateString('fr-FR')})`
      }
    }

    if (periodPreset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      return {
        start: `${firstDay}T00:00:00.000Z`,
        end: `${todayStr}T23:59:59.999Z`,
        label: `Mois en cours (${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})`
      }
    }

    // Personnalisé
    const s = customStart || todayStr
    const e = customEnd || todayStr
    return {
      start: `${s}T00:00:00.000Z`,
      end: `${e}T23:59:59.999Z`,
      label: `Du ${new Date(s).toLocaleDateString('fr-FR')} au ${new Date(e).toLocaleDateString('fr-FR')}`
    }
  }, [periodPreset, customStart, customEnd])

  const loadReport = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await generateFuelProfitabilityReport(companyId, {
        dateStart: dateRange.start,
        dateEnd: dateRange.end,
        companyRegime: company?.regime_fiscal,
        defaultTvaRate: company?.tva_default_rate
      })
      setReportData(res)
    } catch (err) {
      console.error('[StationFuelProfitabilityReport] Erreur chargement rapport:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, dateRange, company])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  // Filtrage par produit
  const filteredItems = useMemo(() => {
    if (selectedProduct === 'all') return reportData.items
    return reportData.items.filter(it => it.code === selectedProduct || it.nom.toLowerCase().includes(selectedProduct.toLowerCase()))
  }, [reportData.items, selectedProduct])

  // Données manquantes
  const hasMissingCost = reportData.items.some(it => it.quantiteVendueLitres > 0 && !it.hasCoutAchat)

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Indicateur', 'Essence Super', 'Gasoil', 'Petrole lampant', 'Total Consolidé'
    ]

    const superItem = reportData.items.find(i => i.nom.includes('Super'))
    const gasoilItem = reportData.items.find(i => i.nom.includes('Gasoil'))
    const petroleItem = reportData.items.find(i => i.nom.includes('Pétrole') || i.nom.includes('Petrole'))
    const tot = reportData.totals

    const rows = [
      ['Quantite vendue (L)', superItem?.quantiteVendueLitres || 0, gasoilItem?.quantiteVendueLitres || 0, petroleItem?.quantiteVendueLitres || 0, tot.quantiteVendueLitres],
      ['Prix de vente unitaire TTC', superItem?.prixVenteUnitaireMoyen || 0, gasoilItem?.prixVenteUnitaireMoyen || 0, petroleItem?.prixVenteUnitaireMoyen || 0, '-'],
      ['Prix de vente unitaire HT', superItem?.prixVenteUnitaireHT || 0, gasoilItem?.prixVenteUnitaireHT || 0, petroleItem?.prixVenteUnitaireHT || 0, '-'],
      ['Cout d achat unitaire CUMP', superItem?.hasCoutAchat ? superItem.coutAchatUnitaireRetenu : 'N/A', gasoilItem?.hasCoutAchat ? gasoilItem.coutAchatUnitaireRetenu : 'N/A', petroleItem?.hasCoutAchat ? petroleItem.coutAchatUnitaireRetenu : 'N/A', '-'],
      ['Chiffre d affaires Net HT', superItem?.chiffreAffairesNetHT || 0, gasoilItem?.chiffreAffairesNetHT || 0, petroleItem?.chiffreAffairesNetHT || 0, tot.chiffreAffairesNetHT],
      ['Chiffre d affaires TTC', superItem?.chiffreAffairesTTC || 0, gasoilItem?.chiffreAffairesTTC || 0, petroleItem?.chiffreAffairesTTC || 0, tot.chiffreAffairesTTC],
      ['Cout des quantites vendues', superItem?.coutQuantitesVendues || 0, gasoilItem?.coutQuantitesVendues || 0, petroleItem?.coutQuantitesVendues || 0, tot.coutQuantitesVendues],
      ['Marge brute unitaire', superItem?.hasCoutAchat ? superItem.margeBruteUnitaire : 'N/A', gasoilItem?.hasCoutAchat ? gasoilItem.margeBruteUnitaire : 'N/A', petroleItem?.hasCoutAchat ? petroleItem.margeBruteUnitaire : 'N/A', '-'],
      ['Marge brute totale', superItem?.hasCoutAchat ? superItem.margeBruteTotale : 'N/A', gasoilItem?.hasCoutAchat ? gasoilItem.margeBruteTotale : 'N/A', petroleItem?.hasCoutAchat ? petroleItem.margeBruteTotale : 'N/A', tot.margeBruteTotale],
      ['Taux de marge (%)', superItem?.tauxMarge || 0, gasoilItem?.tauxMarge || 0, petroleItem?.tauxMarge || 0, tot.tauxMargeMoyen],
      ['Taux de marque (%)', superItem?.tauxMarque || 0, gasoilItem?.tauxMarque || 0, petroleItem?.tauxMarque || 0, tot.tauxMarqueMoyen],
      ['TVA collectee', superItem?.tvaCollectee || 0, gasoilItem?.tvaCollectee || 0, petroleItem?.tvaCollectee || 0, tot.tvaCollectee],
    ]

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Rapport_Rentabilite_Carburants_${periodPreset}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const superItem = reportData.items.find(i => i.nom.includes('Super'))
  const gasoilItem = reportData.items.find(i => i.nom.includes('Gasoil'))
  const petroleItem = reportData.items.find(i => i.nom.includes('Pétrole') || i.nom.includes('Petrole'))
  const tot = reportData.totals

  return (
    <div className="space-y-6">
      {/* ─── En-tête & Filtres ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-amber-500 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/20">
              <BarChart3 className="w-6 h-6" />
            </span>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 block">
                Secteur Station-Service & Hydrocarbures
              </span>
              <h2 className="text-xl font-black text-slate-900">Rentabilité & Marges Brutes des Carburants</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Période : <strong className="text-slate-800">{dateRange.label}</strong> — Circuit carburants isolé des lubrifiants.
              </p>
            </div>
          </div>

          {/* Actions & Export */}
          <div className="flex items-center gap-2">
            <button
              onClick={loadReport}
              disabled={loading}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              Exporter Excel
            </button>

            <button
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimer le Rapport
            </button>
          </div>
        </div>

        {/* Barre de Filtres */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs font-semibold">
          <span className="text-slate-500 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Période :
          </span>

          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setPeriodPreset('today')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodPreset === 'today' ? 'bg-white font-bold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aujourd'hui
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('yesterday')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodPreset === 'yesterday' ? 'bg-white font-bold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hier
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('month')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodPreset === 'month' ? 'bg-white font-bold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ce Mois
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('custom')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodPreset === 'custom' ? 'bg-white font-bold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Personnalisé
            </button>
          </div>

          {periodPreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
              />
              <span className="text-slate-400">à</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
              />
            </div>
          )}

          {/* Filtre produit */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Produit :
            </span>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white font-bold"
            >
              <option value="all">Tous les carburants (3)</option>
              <option value="CARB-SUPER">Essence Super</option>
              <option value="CARB-GASOIL">Gasoil</option>
              <option value="CARB-PETROLE">Pétrole lampant</option>
            </select>
          </div>
        </div>
      </div>

      {/* Avertissement données manquantes si coût d'achat absent */}
      {hasMissingCost && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong>Coût d'achat manquant sur certains carburants :</strong> Le logiciel n'invente aucun prix d'achat.
            Pour obtenir la marge brute exacte, veuillez renseigner le coût d'achat de référence dans l'onglet <em>Paramètres Commerciaux</em> ou enregistrer les réceptions citernes validées.
          </div>
        </div>
      )}

      {/* ─── Cartes Synthétiques 4 KPI ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Volume Total Vendu</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{fmtVol(tot.quantiteVendueLitres)}</span>
          <span className="text-[10px] text-slate-400">Total distribué en cuves</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Chiffre d'Affaires Net HT</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{formatFCFA(tot.chiffreAffairesNetHT)}</span>
          <span className="text-[10px] text-slate-500 font-bold">
            TTC : {formatFCFA(tot.chiffreAffairesTTC)} {tot.tvaCollectee > 0 && `(TVA : ${formatFCFA(tot.tvaCollectee)})`}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-sm bg-gradient-to-br from-white to-emerald-50/40">
          <span className="text-[10px] uppercase font-bold text-emerald-800 block">Marge Brute Totale</span>
          <span className="text-2xl font-black text-emerald-900 mt-1 block">{formatFCFA(tot.margeBruteTotale)}</span>
          <span className="text-[10px] text-emerald-700 font-bold">
            Taux de marque moyen : {tot.tauxMarqueMoyen}%
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Coût des Quantités Vendues</span>
          <span className="text-2xl font-black text-slate-800 mt-1 block">{formatFCFA(tot.coutQuantitesVendues)}</span>
          <span className="text-[10px] text-slate-400">
            Taux de marge moyen : {tot.tauxMargeMoyen}%
          </span>
        </div>
      </div>

      {/* ─── LE GRAND TABLEAU COMPARATIF CONFORME AU PROMPT ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-black tracking-wide">
              Tableau Détaillé de Rentabilité par Carburant
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Norme SYSCOHADA & CGI Bénin
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                <th className="py-3 px-4">Indicateur Financier</th>
                <th className="py-3 px-4 text-right">Essence Super</th>
                <th className="py-3 px-4 text-right">Gasoil</th>
                <th className="py-3 px-4 text-right">Pétrole lampant</th>
                <th className="py-3 px-4 text-right bg-slate-100 font-black text-slate-900">Total Période</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-800">Quantité vendue en litres</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{fmtVol(superItem?.quantiteVendueLitres || 0)}</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{fmtVol(gasoilItem?.quantiteVendueLitres || 0)}</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{fmtVol(petroleItem?.quantiteVendueLitres || 0)}</td>
                <td className="py-3 px-4 text-right bg-slate-50 font-black text-slate-950">{fmtVol(tot.quantiteVendueLitres)}</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-800">Prix de vente unitaire (TTC)</td>
                <td className="py-3 px-4 text-right">{formatFCFA(superItem?.prixVenteUnitaireMoyen || 680)}</td>
                <td className="py-3 px-4 text-right">{formatFCFA(gasoilItem?.prixVenteUnitaireMoyen || 700)}</td>
                <td className="py-3 px-4 text-right">{formatFCFA(petroleItem?.prixVenteUnitaireMoyen || 650)}</td>
                <td className="py-3 px-4 text-right bg-slate-50 text-slate-400 font-mono">-</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-800">Prix de vente unitaire net HT</td>
                <td className="py-3 px-4 text-right">{formatFCFA(superItem?.prixVenteUnitaireHT || 0)}</td>
                <td className="py-3 px-4 text-right">{formatFCFA(gasoilItem?.prixVenteUnitaireHT || 0)}</td>
                <td className="py-3 px-4 text-right">{formatFCFA(petroleItem?.prixVenteUnitaireHT || 0)}</td>
                <td className="py-3 px-4 text-right bg-slate-50 text-slate-400 font-mono">-</td>
              </tr>

              <tr className="hover:bg-slate-50 bg-amber-50/20">
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Coût d'achat unitaire retenu (CUMP)</span>
                  <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-mono">Stock</span>
                </td>
                <td className="py-3 px-4 text-right">
                  {superItem?.hasCoutAchat ? formatFCFA(superItem.coutAchatUnitaireRetenu) : <span className="text-amber-600 italic">Non renseigné</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  {gasoilItem?.hasCoutAchat ? formatFCFA(gasoilItem.coutAchatUnitaireRetenu) : <span className="text-amber-600 italic">Non renseigné</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  {petroleItem?.hasCoutAchat ? formatFCFA(petroleItem.coutAchatUnitaireRetenu) : <span className="text-amber-600 italic">Non renseigné</span>}
                </td>
                <td className="py-3 px-4 text-right bg-slate-50 text-slate-400 font-mono">-</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-black text-slate-900">Chiffre d'affaires net HT</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{formatFCFA(superItem?.chiffreAffairesNetHT || 0)}</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{formatFCFA(gasoilItem?.chiffreAffairesNetHT || 0)}</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{formatFCFA(petroleItem?.chiffreAffairesNetHT || 0)}</td>
                <td className="py-3 px-4 text-right bg-slate-50 font-black text-slate-950">{formatFCFA(tot.chiffreAffairesNetHT)}</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-700">Coût des quantités vendues (COGS)</td>
                <td className="py-3 px-4 text-right text-slate-700">{formatFCFA(superItem?.coutQuantitesVendues || 0)}</td>
                <td className="py-3 px-4 text-right text-slate-700">{formatFCFA(gasoilItem?.coutQuantitesVendues || 0)}</td>
                <td className="py-3 px-4 text-right text-slate-700">{formatFCFA(petroleItem?.coutQuantitesVendues || 0)}</td>
                <td className="py-3 px-4 text-right bg-slate-50 font-black text-slate-800">{formatFCFA(tot.coutQuantitesVendues)}</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-800">Marge brute unitaire (/ L)</td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">
                  {superItem?.hasCoutAchat ? `${formatFCFA(superItem.margeBruteUnitaire)} / L` : <span className="text-slate-400 italic">N/A</span>}
                </td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">
                  {gasoilItem?.hasCoutAchat ? `${formatFCFA(gasoilItem.margeBruteUnitaire)} / L` : <span className="text-slate-400 italic">N/A</span>}
                </td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">
                  {petroleItem?.hasCoutAchat ? `${formatFCFA(petroleItem.margeBruteUnitaire)} / L` : <span className="text-slate-400 italic">N/A</span>}
                </td>
                <td className="py-3 px-4 text-right bg-slate-50 text-slate-400 font-mono">-</td>
              </tr>

              <tr className="hover:bg-slate-50 bg-emerald-50/30">
                <td className="py-3.5 px-4 font-black text-emerald-950 text-sm">Marge brute totale</td>
                <td className="py-3.5 px-4 text-right font-black text-emerald-800 text-sm">
                  {superItem?.hasCoutAchat ? formatFCFA(superItem.margeBruteTotale) : <span className="text-slate-400 italic text-xs">Donnée manquante</span>}
                </td>
                <td className="py-3.5 px-4 text-right font-black text-emerald-800 text-sm">
                  {gasoilItem?.hasCoutAchat ? formatFCFA(gasoilItem.margeBruteTotale) : <span className="text-slate-400 italic text-xs">Donnée manquante</span>}
                </td>
                <td className="py-3.5 px-4 text-right font-black text-emerald-800 text-sm">
                  {petroleItem?.hasCoutAchat ? formatFCFA(petroleItem.margeBruteTotale) : <span className="text-slate-400 italic text-xs">Donnée manquante</span>}
                </td>
                <td className="py-3.5 px-4 text-right bg-emerald-100/50 font-black text-emerald-950 text-sm">{formatFCFA(tot.margeBruteTotale)}</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-700">Taux de marge (% sur Coût)</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{superItem?.tauxMarge || 0} %</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{gasoilItem?.tauxMarge || 0} %</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{petroleItem?.tauxMarge || 0} %</td>
                <td className="py-3 px-4 text-right bg-slate-50 font-black text-slate-900">{tot.tauxMargeMoyen} %</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-700">Taux de marque (% sur CA HT)</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{superItem?.tauxMarque || 0} %</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{gasoilItem?.tauxMarque || 0} %</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{petroleItem?.tauxMarque || 0} %</td>
                <td className="py-3 px-4 text-right bg-slate-50 font-black text-slate-900">{tot.tauxMarqueMoyen} %</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-3 px-4 font-bold text-slate-700">TVA collectée</td>
                <td className="py-3 px-4 text-right text-blue-700 font-bold">{formatFCFA(superItem?.tvaCollectee || 0)}</td>
                <td className="py-3 px-4 text-right text-blue-700 font-bold">{formatFCFA(gasoilItem?.tvaCollectee || 0)}</td>
                <td className="py-3 px-4 text-right text-blue-700 font-bold">{formatFCFA(petroleItem?.tvaCollectee || 0)}</td>
                <td className="py-3 px-4 text-right bg-slate-50 font-black text-blue-900">{formatFCFA(tot.tvaCollectee)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Note de bas de tableau */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            * <strong>Formules appliquées :</strong> Marge brute = CA net HT − Coût des quantités vendues. Taux de marque = (Marge / CA Net HT) × 100.
          </div>
          <div className="text-slate-400 font-mono text-[10px]">
            Conformité SYSCOHADA — Régime fiscal : {company?.regime_fiscal || 'RRS'}
          </div>
        </div>
      </div>
    </div>
  )
}
export default StationFuelProfitabilityReport
