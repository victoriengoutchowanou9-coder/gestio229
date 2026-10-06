// =============================================================================
// GESTIO 229 SaaS — Rapports & Rentabilité Dédiés Imprimerie & Sérigraphie
// Marges Réelles par Prestation, Rentabilité par Client, Coûts Matières & Pertes
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3, TrendingUp, DollarSign, Layers, Users, Printer,
  RefreshCw, Calendar, ArrowUpRight, ArrowDownRight, Scissors,
  PieChart, CheckCircle2, AlertTriangle, ShieldCheck
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { imprimerieService, CommandeImprimerie, PrestationImprimerie, MatierePremiere } from '../../../services/imprimerieService'
import { supabase } from '../../../lib/supabase'

export const ImprimerieReportingPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const activeSector = sectorSlug || 'imprimerie'

  const [loading, setLoading] = useState(true)
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [consommations, setConsommations] = useState<any[]>([])

  // Filtre période : 'jour' | 'semaine' | 'mois' | 'annee'
  const [periode, setPeriode] = useState<'jour' | 'semaine' | 'mois' | 'annee'>('mois')

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cmds, pres, mats, cons] = await Promise.all([
        imprimerieService.getCommandes(companyId, activeSector),
        imprimerieService.getPrestations(companyId, activeSector),
        imprimerieService.getMatieres(companyId, activeSector),
        supabase.from('imprimerie_consommations').select('*, matiere:imprimerie_matieres(nom, unite)').eq('company_id', companyId),
      ])
      setCommandes(cmds)
      setPrestations(pres)
      setMatieres(mats)
      setConsommations(cons.data || [])
    } catch (e) {
      console.error('Erreur chargement reporting imprimerie:', e)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtrer les commandes selon la période
  const filteredCommandes = useMemo(() => {
    const now = new Date()
    return commandes.filter((c) => {
      const d = new Date(c.date_commande)
      if (periode === 'jour') {
        return d.toDateString() === now.toDateString()
      }
      if (periode === 'semaine') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 3600 * 24)
        return diff <= 7
      }
      if (periode === 'mois') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }
      return d.getFullYear() === now.getFullYear()
    })
  }, [commandes, periode])

  // Totaux globaux de la période
  const caTotal = filteredCommandes.reduce((acc, c) => acc + Number(c.total_ttc || 0), 0)
  const coutRevientTotal = filteredCommandes.reduce((acc, c) => acc + Number(c.cout_revient_total || 0), 0)
  const margeBruteTotal = caTotal - coutRevientTotal
  const tauxMargeMoyen = caTotal > 0 ? (margeBruteTotal / caTotal) * 100 : 0
  const totalEncaisse = filteredCommandes.reduce((acc, c) => acc + Number(c.montant_paye || 0), 0)
  const totalCreances = filteredCommandes.reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)

  // 1. Rentabilité par Prestation
  const rentabiliteParPrestation = useMemo(() => {
    const map: Record<string, { nom: string; nbCommandes: number; ca: number; cout: number; marge: number; taux: number }> = {}

    filteredCommandes.forEach((cmd) => {
      cmd.lignes?.forEach((lig) => {
        const nom = lig.designation || 'Prestation'
        if (!map[nom]) {
          map[nom] = { nom, nbCommandes: 0, ca: 0, cout: 0, marge: 0, taux: 0 }
        }
        const ligCa = Number(lig.montant_ttc || 0)
        // Ratio du coût total de la commande attribué à cette ligne
        const ratio = cmd.total_ttc > 0 ? ligCa / cmd.total_ttc : 1
        const ligCout = Number(cmd.cout_revient_total || 0) * ratio
        map[nom].nbCommandes += Number(lig.quantite || 1)
        map[nom].ca += ligCa
        map[nom].cout += ligCout
        map[nom].marge += ligCa - ligCout
      })
    })

    return Object.values(map)
      .map((item) => ({
        ...item,
        taux: item.ca > 0 ? (item.marge / item.ca) * 100 : 0,
      }))
      .sort((a, b) => b.marge - a.marge)
  }, [filteredCommandes])

  // 2. Rentabilité par Client (Top Clients)
  const rentabiliteParClient = useMemo(() => {
    const map: Record<string, { nom: string; nbCmds: number; ca: number; cout: number; marge: number; solde: number }> = {}

    filteredCommandes.forEach((cmd) => {
      const nom = cmd.client_nom || 'Client Comptoir'
      if (!map[nom]) {
        map[nom] = { nom, nbCmds: 0, ca: 0, cout: 0, marge: 0, solde: 0 }
      }
      map[nom].nbCmds += 1
      map[nom].ca += Number(cmd.total_ttc || 0)
      map[nom].cout += Number(cmd.cout_revient_total || 0)
      map[nom].marge += Number(cmd.marge_reelle || (Number(cmd.total_ttc || 0) - Number(cmd.cout_revient_total || 0)))
      map[nom].solde += Number(cmd.solde_restant || 0)
    })

    return Object.values(map).sort((a, b) => b.ca - a.ca)
  }, [filteredCommandes])

  // 3. Analyse des Pertes & Chutes de Matières
  const analysePertes = useMemo(() => {
    const totalPertesCout = consommations.reduce((acc, c) => acc + (Number(c.ecart_perte || 0) * Number(c.cout_unitaire || 0)), 0)
    const nbReimpressions = consommations.filter((c) => c.est_reimpression).length
    return { totalPertesCout, nbReimpressions }
  }, [consommations])

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">
      {/* ── Entête & Sélecteur de période ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-pink-600" /> Rapports & Rentabilité Réelle
          </h1>
          <p className="text-xs text-slate-500">
            Calculs exacts des coûts de revient, marges brutes par travail, rentabilité clients et analyse des chutes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
            <button
              onClick={() => setPeriode('jour')}
              className={`px-3 py-1.5 rounded-lg transition ${periode === 'jour' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setPeriode('semaine')}
              className={`px-3 py-1.5 rounded-lg transition ${periode === 'semaine' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              7 jours
            </button>
            <button
              onClick={() => setPeriode('mois')}
              className={`px-3 py-1.5 rounded-lg transition ${periode === 'mois' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Ce mois
            </button>
            <button
              onClick={() => setPeriode('annee')}
              className={`px-3 py-1.5 rounded-lg transition ${periode === 'annee' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Cette année
            </button>
          </div>

          <button onClick={loadData} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── KPI Financiers Période ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Chiffre d'Affaires</p>
          <p className="text-lg font-black text-slate-900 mt-1">{caTotal.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-slate-400">{filteredCommandes.length} commande(s)</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Coûts de Revient</p>
          <p className="text-lg font-black text-rose-600 mt-1">{coutRevientTotal.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-slate-400">Matières + MO + ST</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Marge Brute Réelle</p>
          <p className="text-lg font-black text-emerald-700 mt-1">{margeBruteTotal.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-emerald-600 font-bold">Taux : {tauxMargeMoyen.toFixed(1)}%</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Encaissé</p>
          <p className="text-lg font-black text-blue-700 mt-1">{totalEncaisse.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-blue-600">Espèces / MoMo</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Créances à Recouvrer</p>
          <p className="text-lg font-black text-amber-600 mt-1">{totalCreances.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-amber-600">Impayés clients</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Coût Pertes / Chutes</p>
          <p className="text-lg font-black text-purple-700 mt-1">{analysePertes.totalPertesCout.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-purple-600">{analysePertes.nbReimpressions} réimpression(s)</p>
        </div>
      </div>

      {/* ── Tableau 1 : Rentabilité par Prestation ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <Printer className="w-4 h-4 text-pink-600" /> Rentabilité par Prestation & Travail Réalisé
            </h3>
            <p className="text-[11px] text-slate-400">Classement des prestations qui génèrent le plus de bénéfice réel</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full">
            {rentabiliteParPrestation.length} Prestations vendues
          </span>
        </div>

        {rentabiliteParPrestation.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">Aucune vente sur cette période.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Prestation</th>
                <th className="text-center px-4 py-3">Volume Produit</th>
                <th className="text-right px-4 py-3">CA Généré</th>
                <th className="text-right px-4 py-3">Coût de Revient Réel</th>
                <th className="text-right px-4 py-3">Marge Brute</th>
                <th className="text-center px-4 py-3">Taux de Marge</th>
                <th className="text-center px-4 py-3">Statut Rentabilité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rentabiliteParPrestation.map((p, idx) => {
                const isLoss = p.marge < 0
                const isVeryGood = p.taux >= 40
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-bold text-slate-900">{p.nom}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{p.nbCommandes}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{Math.round(p.ca).toLocaleString('fr-FR')} F</td>
                    <td className="px-4 py-3 text-right text-rose-600 font-medium">{Math.round(p.cout).toLocaleString('fr-FR')} F</td>
                    <td className="px-4 py-3 text-right font-black">
                      <span className={isLoss ? 'text-rose-600' : 'text-emerald-700'}>
                        {Math.round(p.marge).toLocaleString('fr-FR')} F
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        isLoss
                          ? 'bg-rose-100 text-rose-800'
                          : isVeryGood
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.taux.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isLoss ? (
                        <span className="text-rose-600 font-bold text-[10px] flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Déficitaire
                        </span>
                      ) : isVeryGood ? (
                        <span className="text-emerald-700 font-bold text-[10px]">Très Rentable ✓</span>
                      ) : (
                        <span className="text-amber-700 font-bold text-[10px]">Rentable</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Tableau 2 : Rentabilité par Client ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" /> Top Clients par CA & Marge Réalisée
            </h3>
            <p className="text-[11px] text-slate-400">Clients qui génèrent le plus de valeur et suivi des encours</p>
          </div>
        </div>

        {rentabiliteParClient.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">Aucun client sur cette période.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-center px-4 py-3">Commandes</th>
                <th className="text-right px-4 py-3">CA Total</th>
                <th className="text-right px-4 py-3">Coût de Revient</th>
                <th className="text-right px-4 py-3">Marge Dégagée</th>
                <th className="text-right px-4 py-3">Solde Dû (Créance)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rentabiliteParClient.map((c, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-bold text-slate-900">{c.nom}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-700">{c.nbCmds}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">{Math.round(c.ca).toLocaleString('fr-FR')} F</td>
                  <td className="px-4 py-3 text-right text-rose-600">{Math.round(c.cout).toLocaleString('fr-FR')} F</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">{Math.round(c.marge).toLocaleString('fr-FR')} F</td>
                  <td className="px-4 py-3 text-right font-bold">
                    <span className={c.solde > 0 ? 'text-amber-600' : 'text-slate-400'}>
                      {c.solde > 0 ? `${Math.round(c.solde).toLocaleString('fr-FR')} F` : '0 F ✓'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default ImprimerieReportingPage
