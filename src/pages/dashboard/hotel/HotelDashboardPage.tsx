// =============================================================================
// GESTIO 229 — TABLEAU DE BORD HÔTELIER SPÉCIALISÉ
// =============================================================================
// Supervision temps réel de l'établissement : Taux d'occupation, RevPAR, ADR,
// arrivées/départs du jour, état des chambres, CA nuitées & consommations.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BedDouble, ConciergeBell, Users, Sparkles, Wrench, Coffee,
  TrendingUp, Calendar, AlertTriangle, CheckCircle2, Clock,
  ArrowUpRight, RefreshCw, Plus, ArrowRight, ShieldAlert,
  Wallet, DollarSign, Layers
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { formatFCFA } from '../../../utils/tax'
import {
  HotelChambre,
  HotelSejour,
  HotelReservation,
  HotelKPIs,
  fetchHotelChambres,
  fetchHotelSejours,
  fetchHotelReservations,
  calculerIndicateursHotel
} from '../../../services/hotelService'
import clsx from 'clsx'

export const HotelDashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { companyId, sectorSlug, currentSectorSlug, company } = useTenant()
  const cleanSector = (currentSectorSlug || sectorSlug || 'hotel').toLowerCase().trim().replace(/^sec-/, '')

  const [loading, setLoading] = useState<boolean>(true)
  const [kpis, setKpis] = useState<HotelKPIs | null>(null)
  const [chambres, setChambres] = useState<HotelChambre[]>([])
  const [sejours, setSejours] = useState<HotelSejour[]>([])
  const [reservations, setReservations] = useState<HotelReservation[]>([])

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [chData, sejData, resData, kpiData] = await Promise.all([
        fetchHotelChambres(companyId),
        fetchHotelSejours(companyId),
        fetchHotelReservations(companyId),
        calculerIndicateursHotel(companyId),
      ])
      setChambres(chData)
      setSejours(sejData)
      setReservations(resData)
      setKpis(kpiData)
    } catch (err) {
      console.warn('[HotelDashboard] Erreur chargement tableau de bord:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const sejoursActifs = sejours.filter(s => s.statut === 'EN_COURS')
  const arriveesAujourdhui = reservations.filter(r => r.statut === 'CONFIRMEE')
  const todayStr = new Date().toISOString().slice(0, 10)

  // Chambres nécessitant attention
  const chambresNettoyage = chambres.filter(c => c.statut === 'A_NETTOYER' || c.statut === 'EN_COURS_NETTOYAGE')
  const chambresMaintenance = chambres.filter(c => c.statut === 'MAINTENANCE')

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── BANDEAU SUPÉRIEUR ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/20 font-black">
            <BedDouble className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {company?.name || 'Hôtel & Résidence'}
              </h1>
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Tableau de Bord Hôtelier
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Supervision de l'occupation • Check-in/out • État des chambres & performances financières
            </p>
          </div>
        </div>

        {/* Raccourcis rapides Réception & Chambres */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/app/${cleanSector}/reception`)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/20 transition"
          >
            <ConciergeBell className="w-4 h-4" />
            <span>Réception & Check-in</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/app/${cleanSector}/chambres`)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition"
          >
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Planning Chambres</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ─── INDICATEURS CLÉS (KPIS HÔTELIERS) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Taux d'occupation */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Taux d'Occupation</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">
              {kpis?.tauxOccupation || 0} %
            </span>
            <span className="text-xs text-slate-400">
              {kpis?.chambresOccupees || 0} / {kpis?.totalChambres || 0} chambres
            </span>
          </div>
          {/* Barre de progression */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={clsx(
                'h-full transition-all duration-500',
                (kpis?.tauxOccupation || 0) > 75 ? 'bg-emerald-500' : (kpis?.tauxOccupation || 0) > 40 ? 'bg-indigo-500' : 'bg-amber-500'
              )}
              style={{ width: `${Math.min(100, kpis?.tauxOccupation || 0)}%` }}
            />
          </div>
        </div>

        {/* 2. Arrivées & Départs du jour */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Mouvements du Jour</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <ConciergeBell className="w-4 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] text-emerald-400 font-bold block uppercase">Arrivées</span>
              <span className="text-xl font-black text-white font-mono">{kpis?.arriveesAujourdhui || 0}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] text-rose-400 font-bold block uppercase">Départs</span>
              <span className="text-xl font-black text-white font-mono">{kpis?.departsAujourdhui || 0}</span>
            </div>
          </div>
        </div>

        {/* 3. Revenu Hôtelier du Mois */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Chiffre d'Affaires Mois</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-emerald-400 font-mono block">
              {formatFCFA(kpis?.caTotalMois || 0)}
            </span>
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Nuitées : {formatFCFA(kpis?.caNuiteesMois || 0)}</span>
              <span>Services : {formatFCFA(kpis?.caServicesMois || 0)}</span>
            </div>
          </div>
        </div>

        {/* 4. Ratios RevPAR & ADR */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Ratios Hôteliers</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold block uppercase" title="Average Daily Rate (Prix moyen chambre)">ADR</span>
              <span className="text-sm font-black text-white font-mono">{formatFCFA(kpis?.adr || 0)}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold block uppercase" title="Revenue Per Available Room">RevPAR</span>
              <span className="text-sm font-black text-white font-mono">{formatFCFA(kpis?.revPar || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── VUE DU PARC DES CHAMBRES & SÉJOURS EN COURS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLONNE GAUCHE (7 cols) : Séjours en cours & Arrivées prévues */}
        <div className="lg:col-span-7 space-y-6">
          {/* Séjours en cours */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Clients Actuellement Hébergés ({sejoursActifs.length})
              </h2>
              <button
                type="button"
                onClick={() => navigate(`/app/${cleanSector}/reception`)}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
              >
                <span>Voir Réception</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {sejoursActifs.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                Aucun client en séjour actuellement. Effectuez un check-in depuis la réception.
              </div>
            ) : (
              <div className="space-y-2.5">
                {sejoursActifs.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex flex-col items-center justify-center font-mono font-bold text-xs border border-indigo-500/20">
                        <span className="text-[9px] uppercase text-slate-400">Ch.</span>
                        <span>{s.chambre_numero}</span>
                      </div>
                      <div>
                        <div className="font-bold text-xs text-white">{s.client_nom}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>Du {new Date(s.date_check_in).toLocaleDateString('fr-FR')} au {new Date(s.date_check_out_prevue).toLocaleDateString('fr-FR')}</span>
                          <span>•</span>
                          <span className="font-semibold text-slate-300">{s.nb_nuits} nuit{s.nb_nuits > 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-black font-mono text-emerald-400">
                        {formatFCFA(s.total_facture)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Solde dû : <span className={s.solde_restant > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>{formatFCFA(s.solde_restant)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Arrivées attendues */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Réservations Confirmées en Attente de Check-in
              </h2>
            </div>

            {arriveesAujourdhui.length === 0 ? (
              <div className="p-6 text-center bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                Aucune réservation confirmée en attente.
              </div>
            ) : (
              <div className="space-y-2">
                {arriveesAujourdhui.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">{r.client_nom}</span>
                      <span className="text-slate-400 text-[11px] block">
                        Chambre {r.chambre_numero} • Du {new Date(r.date_arrivee).toLocaleDateString('fr-FR')} au {new Date(r.date_depart).toLocaleDateString('fr-FR')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Acompte : {formatFCFA(r.acompte_verse)}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/app/${cleanSector}/reception`)}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition"
                      >
                        Check-in
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLONNE DROITE (5 cols) : État du Parc des Chambres & Alertes */}
        <div className="lg:col-span-5 space-y-6">
          {/* Plan miniature de l'état des chambres */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-indigo-400" />
                Statut des Chambres
              </h2>
              <button
                type="button"
                onClick={() => navigate(`/app/${cleanSector}/chambres`)}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300"
              >
                Gérer
              </button>
            </div>

            {/* Légende rapide */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400 pb-2 border-b border-slate-800">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Libre ({kpis?.chambresLibres || 0})</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Occupée ({kpis?.chambresOccupees || 0})</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> À nettoyer ({kpis?.chambresNettoyage || 0})</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Maintenance ({kpis?.chambresMaintenance || 0})</span>
            </div>

            {/* Grille des chambres */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
              {chambres.map((c) => {
                const isLibre = c.statut === 'LIBRE'
                const isOccupee = c.statut === 'OCCUPEE'
                const isNettoyage = c.statut === 'A_NETTOYER' || c.statut === 'EN_COURS_NETTOYAGE'
                const isMaint = c.statut === 'MAINTENANCE'

                const bgClass = isLibre
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : isOccupee
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                  : isNettoyage
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : isMaint
                  ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                  : 'bg-blue-500/10 border-blue-500/40 text-blue-400'

                return (
                  <div
                    key={c.id}
                    className={clsx('p-2.5 rounded-xl border text-center font-mono transition shadow-sm', bgClass)}
                  >
                    <span className="text-[10px] font-bold block text-slate-400">CH.</span>
                    <span className="text-base font-black text-white">{c.numero_chambre}</span>
                    <span className="text-[9px] block truncate font-sans uppercase mt-0.5">
                      {c.statut.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Alertes d'exploitation hôtelière */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Alertes & Points d'Attention
            </h2>

            <div className="space-y-2">
              {chambresNettoyage.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>{chambresNettoyage.length} chambre{chambresNettoyage.length > 1 ? 's' : ''} à nettoyer avant remise en location</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/${cleanSector}/housekeeping`)}
                    className="font-bold underline text-amber-400 hover:text-white"
                  >
                    Housekeeping
                  </button>
                </div>
              )}

              {chambresMaintenance.length > 0 && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-between text-xs text-orange-300">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-orange-400" />
                    <span>{chambresMaintenance.length} chambre{chambresMaintenance.length > 1 ? 's' : ''} bloquée{chambresMaintenance.length > 1 ? 's' : ''} pour maintenance</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/${cleanSector}/maintenance`)}
                    className="font-bold underline text-orange-400 hover:text-white"
                  >
                    Maintenance
                  </button>
                </div>
              )}

              {chambresNettoyage.length === 0 && chambresMaintenance.length === 0 && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Toutes les chambres sont propres ou occupées. Aucune anomalie signalée.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HotelDashboardPage
