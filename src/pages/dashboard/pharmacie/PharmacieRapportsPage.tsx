// =============================================================================
// GESTIO 229 — RAPPORTS, ANALYSES DE MARGES & STATISTIQUES OFFICINE
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  TrendingUp,
  Package,
  Layers,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  Pill,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieProduit,
  PharmacieLot,
  PharmacieVente,
} from '../../../services/pharmacieService'

export default function PharmacieRapportsPage() {
  const { currentCompany } = useTenant()
  const companyId = currentCompany?.id || ''

  const [produits, setProduits] = useState<PharmacieProduit[]>([])
  const [lots, setLots] = useState<PharmacieLot[]>([])
  const [ventes, setVentes] = useState<PharmacieVente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      pharmacieService.getProduits(companyId),
      pharmacieService.getLots(companyId),
      pharmacieService.getVentes(companyId),
    ]).then(([p, l, v]) => {
      setProduits(p)
      setLots(l)
      setVentes(v)
      setLoading(false)
    })
  }, [companyId])

  const fmt = (n: number) => (n || 0).toLocaleString('fr-FR')

  // Calculs financiers
  const totalCAVentes = ventes.reduce((sum, v) => sum + v.montant_net_ttc, 0)
  const totalEncaissePatient = ventes.reduce((sum, v) => sum + v.part_patient, 0)
  const totalCreancesTiersPayant = ventes.reduce((sum, v) => sum + v.part_assurance, 0)

  let valeurStockAchat = 0
  let valeurStockVente = 0
  let valeurPérimésBloqués = 0

  lots.forEach((l) => {
    if (l.statut === 'DISPONIBLE') {
      valeurStockAchat += l.quantite_actuelle * l.prix_achat_unitaire
      const prod = produits.find((p) => p.id === l.produit_id)
      if (prod) {
        valeurStockVente += l.quantite_actuelle * prod.prix_vente_ttc
      }
    } else if (l.statut === 'BLOQUE' || l.statut === 'RAPPELE') {
      valeurPérimésBloqués += l.quantite_actuelle * l.prix_achat_unitaire
    }
  })

  const margeTheoriqueGlobale = valeurStockVente - valeurStockAchat
  const tauxMargeTheorique = valeurStockAchat > 0 ? Math.round((margeTheoriqueGlobale / valeurStockAchat) * 100) : 0

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" /> Pilotage Financier & Rentabilité Officine
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Rapports & Analyses Pharmacie
          </h1>
          <p className="text-sm text-slate-500">
            Marges commerciales, valorisation des stocks, suivi des créances mutuelles / tiers-payant et pertes sur péremptions.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow transition text-xs"
        >
          <FileSpreadsheet className="w-4 h-4" /> Imprimer Rapport
        </button>
      </div>

      {/* Cartes Métriques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold mb-1">Chiffre d'Affaires Délivrances</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{fmt(totalCAVentes)} F</div>
          <div className="text-xs text-slate-400 mt-1">{ventes.length} tickets émis</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold mb-1">Créances Tiers-Payant Assurances</div>
          <div className="text-2xl font-black text-blue-600">{fmt(totalCreancesTiersPayant)} F</div>
          <div className="text-xs text-slate-400 mt-1">Prise en charge mutuelles</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold mb-1">Marge Brute Estimée</div>
          <div className="text-2xl font-black text-emerald-600">{fmt(margeTheoriqueGlobale)} F</div>
          <div className="text-xs text-emerald-700 font-bold mt-1">Taux moyen : {tauxMargeTheorique}%</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs text-slate-500 uppercase font-bold mb-1">Pertes Lots Bloqués / Périmés</div>
          <div className="text-2xl font-black text-rose-600">{fmt(valeurPérimésBloqués)} F</div>
          <div className="text-xs text-rose-600/80 mt-1">En attente de destruction</div>
        </div>
      </div>

      {/* Tableau détaillé des marges par produit */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-white flex justify-between items-center">
          <span>Analyse de Rentabilité & Stocks par Référence</span>
          <span className="text-xs text-slate-500 font-normal">{produits.length} références</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Médicament & DCI</th>
                <th className="px-4 py-3">Classe</th>
                <th className="px-4 py-3 text-right">Prix Achat HT</th>
                <th className="px-4 py-3 text-right">Prix Vente TTC</th>
                <th className="px-4 py-3 text-right">Marge Unitaire</th>
                <th className="px-4 py-3 text-right">Stock Disponible</th>
                <th className="px-4 py-3 text-right">Valeur Stock Vente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {produits.map((prod) => {
                const stock = lots
                  .filter((l) => l.produit_id === prod.id && l.statut === 'DISPONIBLE')
                  .reduce((sum, l) => sum + l.quantite_actuelle, 0)

                const margeU = prod.prix_vente_ttc - prod.prix_achat_ht
                const valStockVente = stock * prod.prix_vente_ttc

                return (
                  <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition text-xs">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{prod.nom_commercial}</div>
                      <div className="text-slate-500">DCI: {prod.dci}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {prod.classe_tableau}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {fmt(prod.prix_achat_ht)} F
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {fmt(prod.prix_vente_ttc)} F
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                      +{fmt(margeU)} F
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={stock <= prod.stock_minimum_alerte ? 'text-rose-600' : 'text-slate-900 dark:text-white'}>
                        {stock} btes
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-black text-slate-900 dark:text-white">
                      {fmt(valStockVente)} F
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
