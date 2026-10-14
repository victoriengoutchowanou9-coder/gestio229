// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Métier : Garage & Mécanique classique
// Conforme Spécification Section 4.1
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Wrench, Car, Clock, CheckCircle2, AlertTriangle, DollarSign,
  Plus, Calendar, ArrowUpRight, Shield, Layers, RefreshCw, FileText,
  UserCheck, AlertCircle, ChevronRight, Search
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { Link } from 'react-router-dom'
import { GarageOrdreReparation, GarageVehicule } from '../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const GarageDashboardPage: React.FC = () => {
  const { companyId, supabaseTenant, sectorSlug } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [vehicules, setVehicules] = useState<GarageVehicule[]>([])
  const [ordres, setOrdres] = useState<GarageOrdreReparation[]>([])
  const [devisAttenteCount, setDevisAttenteCount] = useState(0)
  const [alertesAssuranceCount, setAlertesAssuranceCount] = useState(0)
  const [caMois, setCaMois] = useState(0)
  const [encaissementsMois, setEncaissementsMois] = useState(0)
  const [creancesClients, setCreancesClients] = useState(0)

  const prefix = `/app/${sectorSlug || 'garage'}`

  const loadDashboardData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // 1. Charger véhicules
      const { data: vData } = await supabaseTenant('garage_clients_vehicules')
        .select('*')
        .order('created_at', { ascending: false })
      const vehList = vData || []
      setVehicules(vehList)

      // Alertes assurances / visites (< 30 jours)
      const now = new Date()
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const alerts = vehList.filter((v: any) => {
        if (!v.date_expiration_assurance && !v.date_visite_technique) return false
        const dAssur = v.date_expiration_assurance ? new Date(v.date_expiration_assurance) : null
        const dVisite = v.date_visite_technique ? new Date(v.date_visite_technique) : null
        return (dAssur && dAssur <= in30Days) || (dVisite && dVisite <= in30Days)
      })
      setAlertesAssuranceCount(alerts.length)

      // 2. Charger ordres de réparation
      const { data: oData } = await supabaseTenant('garage_ordres_reparation')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      const ordList = oData || []
      setOrdres(ordList)

      // 3. Calculs financiers & devis
      const [devRes, salesRes] = await Promise.all([
        supabaseTenant('garage_devis').select('id, statut').eq('statut', 'EN_ATTENTE_CLIENT'),
        supabaseTenant('sales').select('total_amount, payment_status, created_at').limit(100)
      ])
      setDevisAttenteCount(devRes.data?.length || 0)

      if (salesRes.data) {
        let totalSales = 0
        let totalPaid = 0
        let totalDebt = 0
        salesRes.data.forEach((s: any) => {
          const amt = Number(s.total_amount) || 0
          totalSales += amt
          if (s.payment_status === 'PAYE' || s.payment_status === 'PAID') {
            totalPaid += amt
          } else {
            totalDebt += amt
          }
        })
        setCaMois(totalSales)
        setEncaissementsMois(totalPaid)
        setCreancesClients(totalDebt)
      }
    } catch (err: any) {
      console.warn('[GarageDashboard] Erreur chargement dashboard:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  // Métriques d'exploitation
  const vehiculesPresents = ordres.filter(o => !['LIVRE', 'CLOTURE', 'ANNULE'].includes(o.statut)).length
  const ordresEnCours = ordres.filter(o => o.statut === 'EN_COURS').length
  const ordresPrets = ordres.filter(o => o.statut === 'PRET_A_LIVRER').length
  const ordresAttentePieces = ordres.filter(o => o.statut === 'ATTENTE_PIECES').length

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'EN_COURS':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">En cours</span>
      case 'PRET_A_LIVRER':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Prêt à livrer</span>
      case 'ATTENTE_PIECES':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Attente pièces</span>
      case 'CONTROLE_QUALITE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">Contrôle qualité</span>
      case 'FACTURE':
      case 'LIVRE':
      case 'CLOTURE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Clôturé</span>
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{statut}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête Tableau de Bord ── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2 border border-emerald-500/30">
            <Wrench className="w-3.5 h-3.5" />
            Atelier, Garage & Mécanique classique
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Pilotage Atelier & Réparations
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Gestion des véhicules en atelier, ordres de réparation, réceptions et rentabilité des travaux.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`${prefix}/reception`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouvelle Réception
          </Link>
          <Link
            to={`${prefix}/reparations`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-md transition cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Nouvel Ordre (OR)
          </Link>
          <button
            onClick={loadDashboardData}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Cartes d'Indicateurs Opérationnels ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Véhicules Présents</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{vehiculesPresents}</h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">En atelier actuellement</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Car className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ordres en Cours</p>
            <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{ordresEnCours}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Sur les ponts / postes</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Wrench className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prêts à Livrer</p>
            <h3 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{ordresPrets}</h3>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-0.5">Contrôle qualité validé</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Attente Pièces</p>
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{ordresAttentePieces}</h3>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">Pièces en commande</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ── Cartes Financières & Alertes ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Chiffre d'Affaires</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{fmt(caMois)}</div>
          <div className="mt-2 text-xs flex justify-between text-slate-500 dark:text-slate-400">
            <span>Encaissé : <strong className="text-emerald-600 dark:text-emerald-400">{fmt(encaissementsMois)}</strong></span>
            <span>Créances : <strong className="text-rose-600 dark:text-rose-400">{fmt(creancesClients)}</strong></span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Devis à Valider</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{devisAttenteCount}</div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            En attente de signature client avant mise en réparation.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Échéances & Assurances</span>
            <Shield className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{alertesAssuranceCount}</div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Véhicules avec assurance ou visite technique expirant sous 30 jours.
          </p>
        </div>
      </div>

      {/* ── Liste des Ordres de Réparation Récents ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-600" />
              Ordres de Réparation Récents
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Suivi en temps réel de l'avancement des véhicules dans l'atelier.
            </p>
          </div>

          <Link
            to={`${prefix}/reparations`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <span>Voir tous les ordres de réparation</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {ordres.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <Wrench className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucun ordre de réparation en cours</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Enregistrez une réception ou créez votre premier ordre de réparation pour lancer les travaux.
            </p>
            <Link
              to={`${prefix}/reception`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Réceptionner un Véhicule
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">N° OR</th>
                  <th className="py-3 px-4">Immatriculation</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Mécanicien</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Montant TTC</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ordres.slice(0, 8).map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {ord.numero_or}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {ord.immatriculation}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {ord.client_nom}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {ord.mecanicien_nom || 'Non assigné'}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(ord.statut)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {fmt(ord.montant_ttc || 0)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`${prefix}/reparations`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default GarageDashboardPage
