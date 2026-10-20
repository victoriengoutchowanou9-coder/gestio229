import React, { useState, useEffect } from 'react'
import {
  Bus,
  Ticket,
  Package,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Users,
  Fuel,
  Wrench,
  ArrowRight,
  RefreshCw,
  Plus,
  ShieldCheck,
  Calendar
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportKPIs,
  TransportDepart,
  TransportTicket,
  TransportColis
} from '../../../services/transportService'

export const TransportDashboardPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company
  const prefix = sectorSlug ? `/app/${sectorSlug}` : '/dashboard'

  const [kpis, setKpis] = useState<TransportKPIs | null>(null)
  const [departsDuJour, setDepartsDuJour] = useState<TransportDepart[]>([])
  const [derniersTickets, setDerniersTickets] = useState<TransportTicket[]>([])
  const [derniersColis, setDerniersColis] = useState<TransportColis[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const stats = await transportService.calculerIndicateursTransport(companyId)
      setKpis(stats)

      const allDeparts = await transportService.fetchTransportDeparts(companyId)
      const todayStr = new Date().toISOString().slice(0, 10)
      const todays = allDeparts.filter(d => d.date_depart === todayStr).slice(0, 6)
      setDepartsDuJour(todays.length > 0 ? todays : allDeparts.slice(0, 6))

      const allTickets = await transportService.fetchTransportTickets(companyId)
      setDerniersTickets(allTickets.slice(0, 5))

      const allColis = await transportService.fetchTransportColis(companyId)
      setDerniersColis(allColis.slice(0, 5))
    } catch (e) {
      console.error('[TransportDashboard] Erreur chargement:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── Entête & Raccourcis Rapides ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Bus className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Tableau de Bord Transport & Logistique
              </h1>
              <p className="text-sm text-slate-400">
                Lignes régulières, billetterie guichet, gestion des départs & fret de colis
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          <Link
            to={`${prefix}/billetterie-bus`}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition"
          >
            <Ticket className="w-4 h-4" />
            Vente Ticket Guichet
          </Link>
          <Link
            to={`${prefix}/colis-expeditions`}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-600/20 transition"
          >
            <Package className="w-4 h-4" />
            Expédier un Colis
          </Link>
        </div>
      </div>

      {/* ── 4 Cartes KPIs Principales ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Recettes du jour */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recettes du Jour</span>
            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-black text-white">
            {(kpis?.totalRecettesJour || 0).toLocaleString('fr-FR')} <span className="text-xs font-normal text-slate-400">FCFA</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-2">
            <span>Billets : {(kpis?.recettesJourBillets || 0).toLocaleString('fr-FR')} F</span>
            <span>Colis : {(kpis?.recettesJourColis || 0).toLocaleString('fr-FR')} F</span>
          </div>
        </div>

        {/* Taux de remplissage */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taux de Remplissage</span>
            <span className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <Bus className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-black text-white">
            {kpis?.tauxRemplissageMoyen || 0}%
          </div>
          <div className="mt-2 text-xs text-slate-400 border-t border-slate-800/60 pt-2">
            Moyenne sur les départs en circulation
          </div>
        </div>

        {/* Colis en transit */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Colis en Transit</span>
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Package className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-black text-white">
            {kpis?.colisEnTransit || 0} <span className="text-xs font-normal text-slate-400">expéditions</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 border-t border-slate-800/60 pt-2">
            {kpis?.colisLivresMois || 0} colis livrés ce mois
          </div>
        </div>

        {/* Flotte & Bus actifs */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Disponibilité Flotte</span>
            <span className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-black text-white">
            {kpis?.busDisponibles || 0} / {kpis?.totalBus || 0} <span className="text-xs font-normal text-slate-400">bus prêts</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-2">
            <span className="text-blue-400 font-medium">{kpis?.busEnMission || 0} en route</span>
            <span className="text-rose-400 font-medium">{kpis?.busMaintenance || 0} maintenance</span>
          </div>
        </div>
      </div>

      {/* ── Section centrale : Départs du jour & Billetterie récente ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Départs & Rotations du jour */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-bold text-white">Départs & Rotations Récents</h2>
            </div>
            <Link to={`${prefix}/departs-rotations`} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
              Voir tout le planning <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {departsDuJour.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                Aucun départ programmé. Créez un départ dans le planning.
              </div>
            ) : (
              departsDuJour.map(dep => {
                const fillPercent = Math.round((dep.places_vendues / Math.max(1, dep.capacite_totale)) * 100)
                return (
                  <div key={dep.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {dep.heure_depart}
                        </span>
                        <h3 className="font-semibold text-white text-sm">
                          {dep.ligne_nom}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>Bus : <strong className="text-slate-200">{dep.bus_immatriculation}</strong></span>
                        <span>Chauffeur : <strong className="text-slate-200">{dep.chauffeur_nom}</strong></span>
                        <span>Tarif : <strong className="text-emerald-400">{dep.prix_base.toLocaleString('fr-FR')} F</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Jauge des places */}
                      <div className="w-32 text-right">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">Places :</span>
                          <span className="font-semibold text-white">{dep.places_vendues} / {dep.capacite_totale}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              fillPercent >= 90 ? 'bg-rose-500' : fillPercent >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, fillPercent)}%` }}
                          />
                        </div>
                      </div>

                      {/* Statut badge */}
                      <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg ${
                        dep.statut === 'EN_ROUTE' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        dep.statut === 'EMBARQUEMENT' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        dep.statut === 'COMPLET' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        dep.statut === 'ARRIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {dep.statut}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Dernières ventes de tickets au guichet */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Derniers Billets Émis</h2>
              </div>
              <Link to={`${prefix}/billetterie-bus`} className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                Guichet
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {derniersTickets.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Aucun ticket émis récemment.
                </div>
              ) : (
                derniersTickets.map(tkt => (
                  <div key={tkt.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{tkt.passager_nom}</div>
                      <div className="text-slate-400 text-[11px]">
                        {tkt.arret_depart} ➔ {tkt.arret_arrivee}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {tkt.numero_ticket} • Siège {tkt.siege_numero || 'Libre'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{tkt.tarif.toLocaleString('fr-FR')} F</div>
                      <span className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${
                        tkt.statut === 'UTILISE' ? 'bg-blue-500/20 text-blue-400' :
                        tkt.statut === 'PAYE' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {tkt.statut}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-center">
            <Link
              to={`${prefix}/controle-tickets`}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> Scanner & Contrôler à l'embarquement
            </Link>
          </div>
        </div>
      </div>

      {/* ── Section basse : Colis & Opérations de fret ── */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-white">Suivi des Expéditions de Colis Récents</h2>
          </div>
          <Link to={`${prefix}/colis-expeditions`} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
            Gérer les colis <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="pb-3 font-semibold">Code Suivi</th>
                <th className="pb-3 font-semibold">Expéditeur</th>
                <th className="pb-3 font-semibold">Destinataire</th>
                <th className="pb-3 font-semibold">Itinéraire Agences</th>
                <th className="pb-3 font-semibold">Contenu / Poids</th>
                <th className="pb-3 font-semibold">Frais</th>
                <th className="pb-3 font-semibold text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {derniersColis.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Aucun colis enregistré pour le moment.
                  </td>
                </tr>
              ) : (
                derniersColis.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 font-mono font-bold text-blue-400">{c.code_suivi}</td>
                    <td className="py-3 font-medium text-white">{c.expediteur_nom} ({c.expediteur_telephone})</td>
                    <td className="py-3 text-slate-300">{c.destinataire_nom} ({c.destinataire_telephone})</td>
                    <td className="py-3 text-slate-400">{c.agence_depot} ➔ {c.agence_retrait}</td>
                    <td className="py-3 text-slate-300">{c.nature_colis} ({c.poids_kg} kg)</td>
                    <td className="py-3 font-semibold text-emerald-400">{c.frais_transport.toLocaleString('fr-FR')} F</td>
                    <td className="py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        c.statut === 'LIVRE' ? 'bg-emerald-500/20 text-emerald-400' :
                        c.statut === 'DISPONIBLE_RETRAIT' ? 'bg-amber-500/20 text-amber-400' :
                        c.statut === 'CHARGE' || c.statut === 'EN_TRANSIT' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {c.statut}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default TransportDashboardPage
